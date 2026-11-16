/**
 * Shareable milestone cards: detect thresholds, store one row per site/kind/threshold,
 * serve a public page + OG image, and notify in-app (never auto-post to X).
 */
import type { Context, Hono } from 'hono';
import type { AppEnv, Site } from './env.js';
import { notify } from './alerts.js';
import { randomId, randomToken } from './lib/crypto.js';
import { esc } from './lib/esc.js';
import { ERR } from './lib/errors.js';
import { convertMinor } from './fx.js';
import { readSettings } from './settings.js';
import { injectShareMeta } from './share.js';
import { SPA_SHELL } from './spa-shell.gen.js';
import { fetchFaviconDataUri, OG_PNG_HEADERS, renderMilestonePng, type MilestoneSize, type MilestoneTheme } from './milestone-og.js';

export const VISITOR_THRESHOLDS = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 1_000_000] as const;
/** Revenue thresholds in EUR minor units (cents). `first` is handled separately. */
export const REVENUE_THRESHOLDS_EUR = [10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000] as const;

export type MilestoneKind = 'visitors_total' | 'visitors_month_record' | 'revenue' | 'best_day';

export interface MilestoneRow {
  id: string;
  site_id: string;
  kind: MilestoneKind;
  threshold: string;
  value: number;
  reached_at: number;
  currency: string | null;
  share_token: string;
  notified_at: number | null;
  created_at: number;
}

/** Notify only when the threshold was crossed recently, so a backfill of historical data does not spam. */
export const NOTIFY_WINDOW_MS = 36 * 3_600_000;

const TOKEN_RE = /^m[\w-]{15,80}$/;
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function groupFr(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function fmtVisitors(n: number): string {
  return groupFr(n);
}

export function fmtEur(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const euros = Math.floor(abs / 100);
  const cents = abs % 100;
  const whole = groupFr(euros);
  return cents ? `${sign}${whole},${String(cents).padStart(2, '0')} €` : `${sign}${whole} €`;
}

export function fmtDayFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS_FR[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

export function fmtMonthFr(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const month = MONTHS_FR[Number(m[2]) - 1] ?? m[2];
  return `${month} ${m[1]}`;
}

export function milestoneCopy(row: Pick<MilestoneRow, 'kind' | 'threshold' | 'value' | 'reached_at' | 'currency'>): {
  kicker: string;
  headline: string;
  number: string;
  unit: string;
  date: string;
  title: string;
  intent: (domain: string) => string;
} {
  const date = new Date(Number(row.reached_at)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (row.kind === 'visitors_total') {
    const number = fmtVisitors(Number(row.threshold) || row.value);
    return {
      kicker: 'Jalon',
      headline: `${number} visiteurs`,
      number,
      unit: 'visiteurs',
      date,
      title: `${number} visiteurs`,
      intent: (domain) => `${domain} vient d’atteindre ${number} visiteurs, mesurés avec Minilytics.`,
    };
  }
  if (row.kind === 'visitors_month_record') {
    const number = fmtVisitors(row.value);
    const month = fmtMonthFr(row.threshold);
    return {
      kicker: 'Record mensuel',
      headline: `${number} visiteurs en ${month}`,
      number,
      unit: `visiteurs en ${month}`,
      date,
      title: `Record mensuel : ${number} visiteurs en ${month}`,
      intent: (domain) => `${domain} vient d’établir un record : ${number} visiteurs en ${month}, mesurés avec Minilytics.`,
    };
  }
  if (row.kind === 'best_day') {
    const number = fmtVisitors(row.value);
    const day = fmtDayFr(row.threshold);
    return {
      kicker: 'Meilleure journée',
      headline: `${number} visiteurs le ${day}`,
      number,
      unit: `visiteurs le ${day}`,
      date,
      title: `Meilleure journée : ${number} visiteurs le ${day}`,
      intent: (domain) => `${domain} vient d’établir sa meilleure journée : ${number} visiteurs le ${day}, mesurés avec Minilytics.`,
    };
  }
  const first = row.threshold === 'first';
  const number = first ? fmtEur(row.value) : fmtEur(Number(row.threshold) || row.value);
  return {
    kicker: 'Revenus',
    headline: first ? 'Premiers revenus' : `${number} de revenus`,
    number: first ? fmtEur(row.value) : number,
    unit: first ? 'premiers revenus' : 'de revenus',
    date,
    title: first ? 'Premiers revenus' : `${number} de revenus`,
    intent: (domain) => first
      ? `${domain} vient d’enregistrer ses premiers revenus, mesurés avec Minilytics.`
      : `${domain} vient d’atteindre ${number} de revenus, mesurés avec Minilytics.`,
  };
}

export function xIntentUrl(text: string, url: string): string {
  const u = new URL('https://x.com/intent/post');
  u.searchParams.set('text', text);
  u.searchParams.set('url', url);
  return u.toString();
}

function shareRevenueEnabled(site: Site): boolean {
  return readSettings(site).milestones.shareRevenue;
}

function daySql(col: string) {
  return `to_char(to_timestamp(${col} / 1000.0) AT TIME ZONE ?, 'YYYY-MM-DD')`;
}
function monthSql(col: string) {
  return `to_char(to_timestamp(${col} / 1000.0) AT TIME ZONE ?, 'YYYY-MM')`;
}

export interface VisitorGrowthSeries {
  points: { t: number; n: number }[];
  firstSeen: number | null;
  total: number;
}

/** Daily cumulative unique visitors up to `reachedAt` (inclusive). Real counts only. */
export async function visitorGrowthSeries(
  db: D1Database,
  site: Pick<Site, 'id' | 'timezone'>,
  reachedAt: number,
): Promise<VisitorGrowthSeries> {
  const r = await db
    .prepare(
      `SELECT ${daySql('first_seen')} AS day, MIN(first_seen) AS t, COUNT(*) AS n
       FROM visitors
       WHERE site_id = ? AND first_seen <= ?
       GROUP BY 1
       ORDER BY 1`,
    )
    .bind(site.timezone || 'UTC', site.id, reachedAt)
    .all<{ t: number; n: number }>();
  const points: { t: number; n: number }[] = [];
  let total = 0;
  for (const row of r.results ?? []) {
    const t0 = Number(row.t);
    const n = Number(row.n);
    if (!Number.isFinite(t0) || !Number.isFinite(n)) continue;
    total += n;
    points.push({ t: t0, n: total });
  }
  return { points, firstSeen: points[0]?.t ?? null, total };
}

/** Inclusive timestamp the sparkline / chips should read as-of, in the site timezone. */
export async function seriesAsOf(
  db: D1Database,
  site: Pick<Site, 'id' | 'timezone'>,
  row: Pick<MilestoneRow, 'kind' | 'threshold' | 'reached_at'>,
  now = Date.now(),
): Promise<number> {
  if (row.kind === 'visitors_month_record' || row.kind === 'best_day') {
    const expr = row.kind === 'visitors_month_record' ? monthSql('first_seen') : daySql('first_seen');
    const r = await db
      .prepare(`SELECT MAX(first_seen) AS t FROM visitors WHERE site_id = ? AND ${expr} = ? AND first_seen <= ?`)
      .bind(site.id, site.timezone || 'UTC', row.threshold, now)
      .first<{ t: number | null }>();
    if (r?.t) return Number(r.t);
  }
  return Number(row.reached_at);
}

export function milestoneChips(
  row: Pick<MilestoneRow, 'kind' | 'value' | 'reached_at'>,
  series: Pick<VisitorGrowthSeries, 'firstSeen' | 'total'>,
  asOf = Number(row.reached_at),
): string[] {
  const chips: string[] = [];
  if (series.firstSeen != null && series.firstSeen <= asOf) {
    const days = Math.max(0, Math.round((asOf - series.firstSeen) / 86_400_000));
    if (days <= 1) chips.push('dès le 1er visiteur');
    else chips.push(`en ${fmtVisitors(days)} jours depuis le 1er visiteur`);
  }
  if (row.kind !== 'visitors_total' && series.total > 0 && series.total !== Number(row.value)) {
    const noun = series.total > 1 ? 'visiteurs' : 'visiteur';
    chips.push(`${fmtVisitors(series.total)} ${noun} au total`);
  }
  return chips;
}

async function insertMilestone(
  db: D1Database,
  site: Site,
  now: number,
  input: { kind: MilestoneKind; threshold: string; value: number; reached_at: number; currency?: string | null },
  origin: string,
): Promise<{ inserted: boolean; notified: boolean }> {
  const token = 'm' + randomToken(16);
  const notifyNow = now - Number(input.reached_at) <= NOTIFY_WINDOW_MS;
  const notifiedAt = notifyNow ? null : now;
  const r = await db
    .prepare(
      `INSERT INTO milestones (id, site_id, kind, threshold, value, reached_at, currency, share_token, notified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (site_id, kind, threshold) DO NOTHING`,
    )
    .bind(randomId(10), site.id, input.kind, input.threshold, Math.round(input.value), input.reached_at, input.currency ?? null, token, notifiedAt, now)
    .run();
  const inserted = (r.meta?.changes ?? 0) > 0;
  if (!inserted || !notifyNow) return { inserted, notified: false };
  const row = await db.prepare('SELECT * FROM milestones WHERE site_id = ? AND kind = ? AND threshold = ?')
    .bind(site.id, input.kind, input.threshold)
    .first<MilestoneRow>();
  if (!row) return { inserted, notified: false };
  if (input.kind === 'revenue' && !shareRevenueEnabled(site)) {
    await db.prepare('UPDATE milestones SET notified_at = ? WHERE id = ?').bind(now, row.id).run();
    return { inserted, notified: false };
  }
  const copy = milestoneCopy(row);
  const url = `${origin}/m/${row.share_token}`;
  const ok = await notify(db, site, {
    kind: 'milestone',
    title: `Jalon atteint : ${copy.title}`,
    body: `${site.domain} · ${copy.date}`,
    url,
    dedupe: `milestone:${site.id}:${row.kind}:${row.threshold}`,
    ts: now,
  });
  await db.prepare('UPDATE milestones SET notified_at = ? WHERE id = ?').bind(now, row.id).run();
  return { inserted, notified: ok };
}

async function existingKeys(db: D1Database, siteId: string): Promise<Set<string>> {
  const r = await db.prepare('SELECT kind, threshold FROM milestones WHERE site_id = ?').bind(siteId).all<{ kind: string; threshold: string }>();
  return new Set((r.results ?? []).map((x) => `${x.kind}:${x.threshold}`));
}

async function scanVisitorTotals(db: D1Database, site: Site, now: number, origin: string, have: Set<string>) {
  const count = await db.prepare('SELECT COUNT(*) AS n FROM visitors WHERE site_id = ?').bind(site.id).first<{ n: number }>();
  const n = Number(count?.n ?? 0);
  const out = { inserted: 0, notified: 0 };
  for (const t of VISITOR_THRESHOLDS) {
    if (n < t || have.has(`visitors_total:${t}`)) continue;
    const row = await db.prepare('SELECT first_seen FROM visitors WHERE site_id = ? ORDER BY first_seen ASC LIMIT 1 OFFSET ?')
      .bind(site.id, t - 1)
      .first<{ first_seen: number }>();
    const reached = Number(row?.first_seen ?? now);
    const r = await insertMilestone(db, site, now, { kind: 'visitors_total', threshold: String(t), value: t, reached_at: reached }, origin);
    if (r.inserted) { out.inserted++; have.add(`visitors_total:${t}`); }
    if (r.notified) out.notified++;
  }
  return out;
}

async function monthRecordReachedAt(db: D1Database, site: Site, month: string, prevBest: number): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT first_at AS reached FROM (
         SELECT MIN(started_at) AS first_at
         FROM sessions
         WHERE site_id = ? AND ${monthSql('started_at')} = ?
         GROUP BY visitor_id
       ) t
       ORDER BY first_at ASC
       LIMIT 1 OFFSET ?`,
    )
    .bind(site.id, site.timezone, month, prevBest)
    .first<{ reached: number }>();
  return row ? Number(row.reached) : null;
}

async function scanMonthRecords(db: D1Database, site: Site, now: number, origin: string, have: Set<string>) {
  const r = await db.prepare(
    `SELECT ${monthSql('started_at')} AS month, COUNT(DISTINCT visitor_id) AS n
     FROM sessions WHERE site_id = ? GROUP BY 1 ORDER BY 1`,
  ).bind(site.timezone, site.id).all<{ month: string; n: number }>();
  const out = { inserted: 0, notified: 0 };
  let best = 0;
  for (const row of r.results ?? []) {
    const n = Number(row.n);
    if (n <= best || !row.month) continue;
    const prev = best;
    best = n;
    const key = `visitors_month_record:${row.month}`;
    const reached = (await monthRecordReachedAt(db, site, row.month, prev)) ?? now;
    if (have.has(key)) {
      await db.prepare(
        `UPDATE milestones SET value = ?, reached_at = ? WHERE site_id = ? AND kind = 'visitors_month_record' AND threshold = ? AND value <= ?`,
      ).bind(n, reached, site.id, row.month, n).run();
      continue;
    }
    const res = await insertMilestone(db, site, now, {
      kind: 'visitors_month_record', threshold: row.month, value: n, reached_at: reached,
    }, origin);
    if (res.inserted) { out.inserted++; have.add(key); }
    if (res.notified) out.notified++;
  }
  return out;
}

async function scanBestDays(db: D1Database, site: Site, now: number, origin: string, have: Set<string>) {
  const r = await db.prepare(
    `SELECT ${daySql('started_at')} AS day, COUNT(DISTINCT visitor_id) AS n, MAX(started_at) AS reached
     FROM sessions WHERE site_id = ? GROUP BY 1 ORDER BY 1`,
  ).bind(site.timezone, site.id).all<{ day: string; n: number; reached: number }>();
  const out = { inserted: 0, notified: 0 };
  let best = 0;
  for (const row of r.results ?? []) {
    const n = Number(row.n);
    if (n <= best || !row.day) continue;
    best = n;
    const key = `best_day:${row.day}`;
    if (have.has(key)) continue;
    const res = await insertMilestone(db, site, now, {
      kind: 'best_day', threshold: row.day, value: n, reached_at: Number(row.reached) || now,
    }, origin);
    if (res.inserted) { out.inserted++; have.add(key); }
    if (res.notified) out.notified++;
  }
  return out;
}

async function toEurMinor(
  db: D1Database,
  amount: number,
  currency: string,
  origAmount: number | null,
  origCurrency: string | null,
  ts: number,
): Promise<number | null> {
  const cur = (currency || '').toUpperCase();
  const orig = (origCurrency || '').toUpperCase();
  if (cur === 'EUR') return amount;
  if (orig === 'EUR' && origAmount != null) return origAmount;
  const conv = await convertMinor(db, amount, cur || 'USD', 'EUR', ts).catch(() => null);
  return conv?.amount ?? null;
}

async function scanRevenue(db: D1Database, site: Site, now: number, origin: string, have: Set<string>) {
  const r = await db.prepare(
    `SELECT ts, amount, currency, orig_amount, orig_currency, kind
     FROM payments WHERE site_id = ? AND kind IN ('payment', 'refund') ORDER BY ts ASC`,
  ).bind(site.id).all<{ ts: number; amount: number; currency: string; orig_amount: number | null; orig_currency: string | null; kind: string }>();
  const out = { inserted: 0, notified: 0 };
  let cum = 0;
  let firstAt: number | null = null;
  const crossed = new Set<number>();
  for (const p of r.results ?? []) {
    const eur = await toEurMinor(db, Number(p.amount), p.currency, p.orig_amount == null ? null : Number(p.orig_amount), p.orig_currency, Number(p.ts));
    if (eur == null) continue;
    const signed = p.kind === 'refund' ? -Math.abs(eur) : eur;
    cum += signed;
    if (signed > 0 && firstAt == null) {
      firstAt = Number(p.ts);
      if (!have.has('revenue:first')) {
        const res = await insertMilestone(db, site, now, {
          kind: 'revenue', threshold: 'first', value: signed, reached_at: firstAt, currency: 'EUR',
        }, origin);
        if (res.inserted) { out.inserted++; have.add('revenue:first'); }
        if (res.notified) out.notified++;
      }
    }
    for (const t of REVENUE_THRESHOLDS_EUR) {
      if (cum >= t && !crossed.has(t) && !have.has(`revenue:${t}`)) {
        crossed.add(t);
        const res = await insertMilestone(db, site, now, {
          kind: 'revenue', threshold: String(t), value: t, reached_at: Number(p.ts), currency: 'EUR',
        }, origin);
        if (res.inserted) { out.inserted++; have.add(`revenue:${t}`); }
        if (res.notified) out.notified++;
      } else if (cum >= t) crossed.add(t);
    }
  }
  return out;
}

/** Detect and store new milestones for one site. Historical rows are stored with notified_at set (no spam). */
export async function scanSiteMilestones(db: D1Database, site: Site, now = Date.now(), origin = ''): Promise<{ inserted: number; notified: number }> {
  const have = await existingKeys(db, site.id);
  const parts = await Promise.all([
    scanVisitorTotals(db, site, now, origin, have),
    scanMonthRecords(db, site, now, origin, have),
    scanBestDays(db, site, now, origin, have),
    scanRevenue(db, site, now, origin, have),
  ]);
  return parts.reduce((a, b) => ({ inserted: a.inserted + b.inserted, notified: a.notified + b.notified }), { inserted: 0, notified: 0 });
}

/** Daily cron: scan every site. Existing historical thresholds are inserted silently. */
export async function scanMilestones(db: D1Database, sites: Site[], now = Date.now(), origin = '') {
  const out: Record<string, { inserted: number; notified: number }> = {};
  for (const site of sites) {
    try {
      out[site.domain] = await scanSiteMilestones(db, site, now, origin);
    } catch (e) {
      out[site.domain] = { inserted: 0, notified: 0, error: String(e) } as { inserted: number; notified: number };
    }
  }
  return out;
}

export function toPublicMilestone(row: MilestoneRow, site: Pick<Site, 'name' | 'domain'>, origin: string, allowRevenue: boolean) {
  if (row.kind === 'revenue' && !allowRevenue) return null;
  const copy = milestoneCopy(row);
  const url = `${origin}/m/${row.share_token}`;
  const image = `${origin}/api/public/milestone/${row.share_token}/og.png`;
  return {
    id: row.id,
    kind: row.kind,
    threshold: row.threshold,
    value: row.value,
    reachedAt: Number(row.reached_at),
    currency: row.currency,
    token: row.share_token,
    title: copy.title,
    number: copy.number,
    unit: copy.unit,
    kicker: copy.kicker,
    date: copy.date,
    siteName: site.name,
    domain: site.domain,
    url,
    image,
    imageSquare: `${image}?size=square`,
    intentUrl: xIntentUrl(copy.intent(site.domain), url),
    intentText: copy.intent(site.domain),
  };
}

async function loadMilestone(db: D1Database, token: string): Promise<{ row: MilestoneRow; site: Site } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const row = await db.prepare('SELECT * FROM milestones WHERE share_token = ?').bind(token).first<MilestoneRow>();
  if (!row) return null;
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(row.site_id).first<Site>();
  if (!site) return null;
  return { row, site };
}

function parseTheme(v: string | undefined): MilestoneTheme {
  return v === 'light' ? 'light' : 'dark';
}
function parseSize(v: string | undefined): MilestoneSize {
  return v === 'square' ? 'square' : 'wide';
}

export function registerMilestones(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/milestones', async (c) => {
    const site = c.get('site');
    const origin = new URL(c.req.url).origin;
    const allow = shareRevenueEnabled(site);
    const r = await c.env.DB.prepare('SELECT * FROM milestones WHERE site_id = ? ORDER BY reached_at DESC').bind(site.id).all<MilestoneRow>();
    const items = (r.results ?? []).map((row) => toPublicMilestone(row, site, origin, allow)).filter((x) => x != null);
    c.header('Cache-Control', 'private, no-store');
    return c.json({ items, shareRevenue: allow });
  });

  app.get('/api/public/milestone/:token', async (c) => {
    const found = await loadMilestone(c.env.DB, c.req.param('token') ?? '');
    if (!found) return c.json({ error: ERR.notFound }, 404);
    const pub = toPublicMilestone(found.row, found.site, new URL(c.req.url).origin, shareRevenueEnabled(found.site));
    if (!pub) return c.json({ error: ERR.notFound }, 404);
    c.header('Cache-Control', 'public, max-age=60, s-maxage=0, must-revalidate');
    return c.json(pub);
  });

  app.get('/api/public/milestone/:token/og.png', async (c) => {
    const found = await loadMilestone(c.env.DB, c.req.param('token') ?? '');
    if (!found) return c.body('not found', 404, { 'content-type': 'text/plain', 'cache-control': 'public, max-age=0, must-revalidate' });
    if (found.row.kind === 'revenue' && !shareRevenueEnabled(found.site)) {
      return c.body('not found', 404, { 'content-type': 'text/plain', 'cache-control': 'public, max-age=0, must-revalidate' });
    }
    const copy = milestoneCopy(found.row);
    const theme = parseTheme(c.req.query('theme'));
    const size = parseSize(c.req.query('size'));
    const asOf = await seriesAsOf(c.env.DB, found.site, found.row);
    const [favicon, series] = await Promise.all([
      fetchFaviconDataUri(found.site.domain),
      visitorGrowthSeries(c.env.DB, found.site, asOf),
    ]);
    const png = await renderMilestonePng({
      kicker: copy.kicker,
      headline: copy.title,
      number: copy.number,
      unit: copy.unit,
      date: copy.date,
      siteName: found.site.name,
      domain: found.site.domain,
      favicon,
      theme,
      size,
      series: series.points,
      chips: milestoneChips(found.row, series, asOf),
    });
    const headers: Record<string, string> = { ...OG_PNG_HEADERS, 'X-Robots-Tag': 'noindex' };
    if (c.req.query('download') === '1') {
      const slug = `${found.site.domain}-${copy.number}`.replace(/[^\w.-]+/g, '-');
      headers['Content-Disposition'] = `attachment; filename="${slug}-${size}-${theme}.png"`;
    }
    return new Response(png, { status: 200, headers });
  });

  const serveHtml = async (c: Context<AppEnv>) => {
    const found = await loadMilestone(c.env.DB, c.req.param('token') ?? '');
    const origin = new URL(c.req.url).origin;
    if (!found || (found.row.kind === 'revenue' && !shareRevenueEnabled(found.site))) {
      return new Response('<!doctype html><meta charset="utf-8"><title>Jalon introuvable</title><meta name="robots" content="noindex"><p>Ce jalon n’existe pas ou n’est pas public.</p>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', 'x-robots-tag': 'noindex, nofollow' },
      });
    }
    const copy = milestoneCopy(found.row);
    const title = `${found.site.name} · ${copy.title}`;
    const desc = copy.intent(found.site.domain);
    const url = `${origin}/m/${found.row.share_token}`;
    const image = `${origin}/api/public/milestone/${found.row.share_token}/og.png`;
    const shell = SPA_SHELL;
    const html = shell
      ? injectShareMeta(shell, { title, desc, url, image, imageWidth: 1200, imageHeight: 675 })
      : `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex, nofollow"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="675"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}"></head><body><div id="root"></div></body></html>`;
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60, must-revalidate', 'x-robots-tag': 'noindex, nofollow' },
    });
  };
  app.get('/m/:token', serveHtml);
}

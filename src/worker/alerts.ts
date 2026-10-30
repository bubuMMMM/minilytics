/**
 * Notifications (in-app bell, stored), traffic spike/drop and new-goal alerts, and weekly/monthly e-mail
 * reports sent with Resend (only when RESEND_API_KEY is set; everything else works without e-mail).
 */
import type { Hono } from 'hono';
import type { AppEnv, Env, Site } from './env.js';
import { randomId } from './lib/crypto.js';
import { readSettings, saveSettings, type SiteSettings } from './settings.js';
import { breakdown, overview, parseFilters, type Ctx } from './stats.js';
import { resolveRange, startOfDay, tzOffset } from './lib/time.js';
import { currencyDecimals } from './payments.js';
import { authenticate, canAccess } from './auth.js';

export type NotificationKind = 'goal' | 'new_goal' | 'spike' | 'drop' | 'payment' | 'mention' | 'commit' | 'report';
export interface NotifyInput { kind: NotificationKind; title: string; body?: string | null; url?: string | null; dedupe?: string | null; ts?: number }

const KIND_SETTING: Partial<Record<NotificationKind, keyof SiteSettings['alerts']>> = {
  new_goal: 'newGoals', spike: 'traffic', drop: 'traffic', payment: 'payments', mention: 'mentions',
};

/** Store one notification (idempotent through `dedupe`). Never throws: alerts must not break ingestion. */
export async function notify(db: D1Database, site: Site, n: NotifyInput): Promise<boolean> {
  try {
    const a = readSettings(site).alerts;
    const key = KIND_SETTING[n.kind];
    if (n.kind !== 'report' && (!a.inApp || (key && a[key] === false))) return false;
    const r = await db
      .prepare('INSERT INTO notifications (id, site_id, kind, title, body, url, ts, dedupe) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .bind(randomId(10), site.id, n.kind, n.title.slice(0, 200), n.body?.slice(0, 500) ?? null, n.url?.slice(0, 500) ?? null, n.ts ?? Date.now(), n.dedupe?.slice(0, 200) ?? null)
      .run();
    return (r.meta?.changes ?? 1) > 0;
  } catch (e) {
    console.error('notify failed', e);
    return false;
  }
}

// ---------------------------------------------------------------- goals

const knownGoals = new Map<string, Set<string>>();
const goalPing = new Map<string, number>();

/** Called at ingestion before a goal is inserted: first-ever completion → "new goal"; watched goals → "goal". */
export async function goalAlerts(db: D1Database, site: Site, name: string, path: string, now = Date.now()) {
  const a = readSettings(site).alerts;
  if (!a.inApp) return;
  let seen = knownGoals.get(site.id);
  if (!seen) knownGoals.set(site.id, (seen = new Set()));
  if (a.newGoals && !seen.has(name)) {
    const prior = await db.prepare("SELECT 1 FROM events WHERE site_id = ? AND type = 'goal' AND name = ? LIMIT 1").bind(site.id, name).first();
    if (seen.size > 500) seen.clear();
    seen.add(name);
    if (!prior) await notify(db, site, { kind: 'new_goal', title: `Nouvel objectif : ${name}`, body: `Première complétion, sur ${path}`, dedupe: `new_goal:${name}`, ts: now });
  }
  if (a.goals.includes(name)) {
    const k = `${site.id}:${name}`;
    if (now - (goalPing.get(k) ?? 0) < 60_000) return;
    goalPing.set(k, now);
    await notify(db, site, { kind: 'goal', title: `Objectif « ${name} » atteint`, body: `Sur ${path}`, dedupe: `goal:${name}:${Math.floor(now / 60_000)}`, ts: now });
  }
}

// ---------------------------------------------------------------- traffic spikes / drops

const lastCheck = new Map<string, number>();
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Compares the last 60 minutes with the same hour on each of the previous 7 days.
 * Spike: ≥ 3× the usual and ≥ 10 visitors. Drop: ≤ 30 % of the usual when the usual is ≥ 10 visitors.
 * Runs at most every 10 minutes per site (on dashboard polls and from the daily cron).
 */
export async function checkTraffic(db: D1Database, site: Site, now = Date.now(), force = false) {
  if (!force && now - (lastCheck.get(site.id) ?? 0) < 10 * 60_000) return null;
  lastCheck.set(site.id, now);
  if (!readSettings(site).alerts.traffic) return null;
  const binds: unknown[] = [site.id, now - HOUR, now];
  let sql = 'SELECT 0 AS d, COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND last_seen_at >= ? AND started_at < ?';
  for (let d = 1; d <= 7; d++) {
    sql += ` UNION ALL SELECT ${d} AS d, COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?`;
    binds.push(site.id, now - d * DAY - HOUR, now - d * DAY);
  }
  const rows = (await db.prepare(sql).bind(...binds).all<{ d: number; n: number }>()).results;
  const cur = Number(rows.find((r) => Number(r.d) === 0)?.n ?? 0);
  const past = rows.filter((r) => Number(r.d) > 0).map((r) => Number(r.n));
  const usual = past.length ? past.reduce((s, n) => s + n, 0) / past.length : 0;
  const hourKey = new Date(now).toISOString().slice(0, 13);
  const result = { current: cur, usual: Math.round(usual * 10) / 10, kind: null as null | 'spike' | 'drop' };
  // Only once the site has a week of history.
  const age = now - Number(site.created_at);
  if (age < 7 * DAY) return result;
  if (cur >= 10 && cur >= 3 * Math.max(usual, 1)) {
    result.kind = 'spike';
    await notify(db, site, { kind: 'spike', title: `Pic de trafic : ${cur} visiteurs sur la dernière heure`, body: `D’habitude ≈ ${Math.round(usual)} à cette heure (moyenne des 7 derniers jours).`, dedupe: `spike:${hourKey.slice(0, 10)}`, ts: now });
  } else if (usual >= 10 && cur <= 0.3 * usual) {
    result.kind = 'drop';
    await notify(db, site, { kind: 'drop', title: `Chute de trafic : ${cur} visiteurs sur la dernière heure`, body: `D’habitude ≈ ${Math.round(usual)} à cette heure. Le script est-il toujours installé ?`, dedupe: `drop:${hourKey.slice(0, 10)}`, ts: now });
  }
  return result;
}

// ---------------------------------------------------------------- reports

export type ReportKind = 'weekly' | 'monthly';

function ctxFor(db: D1Database, site: Site, from: number, to: number): Ctx {
  const range = { ...resolveRange({ period: 'custom' }, site.timezone, site.created_at), from, to, granularity: 'day' as const };
  return { db, site, range, filters: parseFilters(undefined), offset: tzOffset(site.timezone, to) };
}

/** Previous full week (Mon–Sun) or previous full month, in the site's timezone. */
export function reportRange(kind: ReportKind, site: Site, now = Date.now()) {
  const today = startOfDay(now, site.timezone);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(now));
  const get = (t: string) => ymd.find((p) => p.type === t)?.value ?? '';
  if (kind === 'weekly') {
    const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
    const thisMonday = startOfDay(today - dow * DAY + HOUR, site.timezone);
    const from = startOfDay(thisMonday - 7 * DAY + HOUR, site.timezone);
    return { from, to: thisMonday, key: `weekly:${new Date(from).toISOString().slice(0, 10)}` };
  }
  const day = Number(get('day'));
  const monthStart = startOfDay(today - (day - 1) * DAY + HOUR, site.timezone);
  const prevStart = startOfDay(monthStart - 20 * DAY, site.timezone);
  const prevDay = Number(new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone, day: '2-digit' }).format(new Date(prevStart)));
  const from = startOfDay(prevStart - (prevDay - 1) * DAY + HOUR, site.timezone);
  return { from, to: monthStart, key: `monthly:${new Date(from + 12 * HOUR).toISOString().slice(0, 7)}` };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)} %` : '—');

export async function buildReport(db: D1Database, site: Site, kind: ReportKind, now = Date.now(), origin = '') {
  const { from, to, key } = reportRange(kind, site, now);
  const ctx = ctxFor(db, site, from, to);
  const [ov, sources, pages, goals] = await Promise.all([overview(ctx), breakdown(ctx, 'source', 5), breakdown(ctx, 'page', 5), breakdown(ctx, 'goal', 5)]);
  const cur = ov.current as any;
  const prev = ov.previous as any;
  const dec = currencyDecimals(site.currency);
  const money = (m: number) => (m / 10 ** dec).toLocaleString('fr-FR', { style: 'currency', currency: site.currency });
  const fmtDay = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: site.timezone });
  const label = kind === 'weekly' ? `Semaine du ${fmtDay(from)} au ${fmtDay(to - 1)}` : new Date(from + 12 * HOUR).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: site.timezone });
  const subject = `${site.name} · ${kind === 'weekly' ? 'rapport hebdomadaire' : 'rapport mensuel'} : ${cur.visitors} visiteurs${cur.revenue ? `, ${money(cur.revenue)}` : ''}`;
  const kpis: [string, string, string][] = [
    ['Visiteurs', String(cur.visitors), pct(cur.visitors, prev.visitors)],
    ['Pages vues', String(cur.pageviews), pct(cur.pageviews, prev.pageviews)],
    ['Revenus', money(cur.revenue), pct(cur.revenue, prev.revenue)],
    ['Conversion', `${(cur.conversionRate * 100).toFixed(2).replace('.', ',')} %`, pct(cur.conversionRate, prev.conversionRate)],
  ];
  const list = (title: string, rows: { label: string | null; visitors: number }[]) =>
    rows.length
      ? `<h3 style="font:600 14px system-ui;margin:24px 0 8px">${esc(title)}</h3><table style="width:100%;border-collapse:collapse;font:13px system-ui">${rows
          .map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(r.label ?? 'Direct')}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${r.visitors}</td></tr>`)
          .join('')}</table>`
      : '';
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fafafa;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;color:#18181b">
<div style="font:600 13px system-ui;color:#71717a">Minilytics · ${esc(site.domain)}</div>
<h1 style="font:600 20px system-ui;margin:8px 0 4px">${esc(label)}</h1>
<p style="font:13px system-ui;color:#71717a;margin:0 0 16px">Comparé à la période précédente.</p>
<table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 -8px"><tr>${kpis
    .map(([k, v, d]) => `<td style="border:1px solid #e4e4e7;border-radius:8px;padding:10px;vertical-align:top"><div style="font:12px system-ui;color:#71717a">${k}</div><div style="font:600 18px system-ui;margin-top:4px">${esc(v)}</div><div style="font:12px system-ui;color:${d.startsWith('+') ? '#16a34a' : d === '—' ? '#a1a1aa' : '#dc2626'}">${d}</div></td>`)
    .join('')}</tr></table>
${list('Meilleures sources', sources as any)}${list('Pages les plus vues', pages as any)}${list('Objectifs', goals as any)}
${origin ? `<p style="margin:24px 0 0"><a href="${esc(origin)}/site/${esc(site.id)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font:600 13px system-ui;padding:10px 14px;border-radius:8px">Ouvrir le tableau de bord</a></p>` : ''}
<p style="font:12px system-ui;color:#a1a1aa;margin-top:24px">Vous recevez ce rapport car votre adresse est indiquée dans Réglages › Alertes et rapports de ${esc(site.name)}.</p>
</div></body></html>`;
  const text = `${label} — ${site.domain}\n` + kpis.map(([k, v, d]) => `${k} : ${v} (${d})`).join('\n');
  return { key, subject, html, text, from, to, kpis: kpis.map(([label, value, change]) => ({ label, value, change })) };
}

export function emailState(env: Env) {
  return { configured: !!env.RESEND_API_KEY, from: env.REPORT_FROM_EMAIL ?? 'Minilytics <onboarding@resend.dev>', provider: 'Resend' };
}

/** Sends through Resend's HTTP API (or any Resend-compatible endpoint). */
export async function sendEmail(env: Env, msg: { to: string[]; subject: string; html: string; text: string }, fetcher: typeof fetch = fetch) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY manquant' };
  const r = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: emailState(env).from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!r.ok) return { ok: false, error: `Resend HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true, id: ((await r.json().catch(() => ({}))) as any).id ?? null };
}

/** Daily cron: weekly reports on Mondays, monthly on the 1st, alert digest of the last 24 h. */
export async function runDailyAlerts(env: Env, sites: Site[], now = Date.now(), origin = '', fetcher: typeof fetch = fetch) {
  const out: Record<string, unknown> = {};
  for (const site of sites) {
    const a = readSettings(site).alerts;
    const res: Record<string, unknown> = { traffic: await checkTraffic(env.DB, site, now, true) };
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: site.timezone, day: '2-digit', weekday: 'short' }).formatToParts(new Date(now));
    const due: ReportKind[] = [];
    if (a.weekly && parts.find((p) => p.type === 'weekday')?.value === 'Mon') due.push('weekly');
    if (a.monthly && parts.find((p) => p.type === 'day')?.value === '01') due.push('monthly');
    for (const kind of due) {
      const rep = await buildReport(env.DB, site, kind, now, origin);
      const fresh = await notify(env.DB, site, { kind: 'report', title: rep.subject, body: rep.kpis.map((k) => `${k.label} ${k.value}`).join(' · '), dedupe: `report:${rep.key}`, ts: now });
      if (fresh && a.emails.length && env.RESEND_API_KEY) res[kind] = await sendEmail(env, { to: a.emails, subject: rep.subject, html: rep.html, text: rep.text }, fetcher);
      else res[kind] = fresh ? 'in-app' : 'déjà fait';
    }
    if (a.emails.length && env.RESEND_API_KEY) {
      const pending = (
        await env.DB.prepare("SELECT id, kind, title, body FROM notifications WHERE site_id = ? AND emailed_at IS NULL AND kind IN ('spike','drop','new_goal','goal','mention') AND ts > ? ORDER BY ts LIMIT 50")
          .bind(site.id, now - DAY)
          .all<{ id: string; kind: string; title: string; body: string | null }>()
      ).results;
      if (pending.length) {
        const html = `<div style="font:14px system-ui;color:#18181b"><h2 style="font:600 18px system-ui">${esc(site.name)} : ${pending.length} alerte(s)</h2><ul>${pending.map((p) => `<li style="margin:6px 0"><b>${esc(p.title)}</b>${p.body ? `<br><span style="color:#71717a">${esc(p.body)}</span>` : ''}</li>`).join('')}</ul></div>`;
        const sent = await sendEmail(env, { to: a.emails, subject: `${site.name} · ${pending.length} alerte(s) Minilytics`, html, text: pending.map((p) => `- ${p.title}`).join('\n') }, fetcher);
        if (sent.ok) await env.DB.prepare(`UPDATE notifications SET emailed_at = ? WHERE id IN (${pending.map(() => '?').join(',')})`).bind(now, ...pending.map((p) => p.id)).run();
        res.digest = sent;
      }
    }
    out[site.domain] = res;
  }
  return out;
}

// ---------------------------------------------------------------- routes

async function list(db: D1Database, siteIds: string[], limit = 50) {
  if (!siteIds.length) return { items: [], unread: 0 };
  const ph = siteIds.map(() => '?').join(',');
  const [items, unread] = await db.batch([
    db.prepare(`SELECT id, site_id, kind, title, body, url, ts, read_at FROM notifications WHERE site_id IN (${ph}) ORDER BY ts DESC LIMIT ${limit}`).bind(...siteIds),
    db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE site_id IN (${ph}) AND read_at IS NULL`).bind(...siteIds),
  ]);
  return {
    items: (items.results as any[]).map((n) => ({ id: n.id, siteId: n.site_id, kind: n.kind, title: n.title, body: n.body, url: n.url, ts: Number(n.ts), read: n.read_at != null })),
    unread: Number((unread.results[0] as any)?.n ?? 0),
  };
}

export function registerAlerts(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/notifications', async (c) => {
    const site = c.get('site');
    await checkTraffic(c.env.DB, site).catch(() => null);
    c.header('Cache-Control', 'no-store');
    return c.json(await list(c.env.DB, [site.id], Math.min(200, Number(c.req.query('limit')) || 50)));
  });
  app.post('/api/sites/:id/notifications/read', async (c) => {
    const site = c.get('site');
    const b = await c.req.json<{ ids?: string[]; all?: boolean }>().catch(() => ({}) as any);
    const now = Date.now();
    if (b.all) await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE site_id = ? AND read_at IS NULL').bind(now, site.id).run();
    else if (Array.isArray(b.ids) && b.ids.length) {
      const ids = (b.ids as unknown[]).filter((x): x is string => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)).slice(0, 200);
      if (ids.length) await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE site_id = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(now, site.id, ...ids).run();
    }
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE site_id = ? AND read_at IS NULL').bind(site.id).first<{ n: number }>();
    return c.json({ ok: true, unread: Number(n?.n ?? 0) });
  });
  app.get('/api/notifications', async (c) => {
    const p = await authenticate(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    const sites = (await c.env.DB.prepare('SELECT id FROM sites').all<{ id: string }>()).results.map((s) => s.id).filter((id) => canAccess(p, id));
    c.header('Cache-Control', 'no-store');
    return c.json(await list(c.env.DB, sites));
  });

  app.get('/api/sites/:id/settings', (c) => c.json({ ...readSettings(c.get('site')), email: emailState(c.env) }));
  app.patch('/api/sites/:id/settings', async (c) => {
    const b: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    for (const k of ['allowedHostnames', 'alerts', 'github', 'reddit']) if (k in b) patch[k] = b[k];
    return c.json({ ...(await saveSettings(c.env.DB, c.get('site'), patch)), email: emailState(c.env) });
  });
  app.get('/api/sites/:id/reports/preview', async (c) => {
    const kind = c.req.query('kind') === 'monthly' ? 'monthly' : 'weekly';
    const rep = await buildReport(c.env.DB, c.get('site'), kind, Date.now(), new URL(c.req.url).origin);
    if (c.req.query('format') === 'html') {
      c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'");
      c.header('X-Frame-Options', 'SAMEORIGIN');
      return c.html(rep.html);
    }
    return c.json({ subject: rep.subject, kpis: rep.kpis, from: rep.from, to: rep.to });
  });
  app.post('/api/sites/:id/reports/test', async (c) => {
    const site = c.get('site');
    const a = readSettings(site).alerts;
    if (!c.env.RESEND_API_KEY) return c.json({ error: 'Ajoutez RESEND_API_KEY (et REPORT_FROM_EMAIL) aux variables d’environnement pour envoyer des e-mails.' }, 409);
    if (!a.emails.length) return c.json({ error: 'Ajoutez au moins une adresse de destination.' }, 400);
    const rep = await buildReport(c.env.DB, site, 'weekly', Date.now(), new URL(c.req.url).origin);
    const sent = await sendEmail(c.env, { to: a.emails, subject: `[Test] ${rep.subject}`, html: rep.html, text: rep.text });
    return sent.ok ? c.json(sent) : c.json(sent, 502);
  });
}

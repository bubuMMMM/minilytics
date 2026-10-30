/**
 * AI bot traffic, server-side. Bots don't run JavaScript, so the tracker never sees most of them:
 * sites forward bot hits from their middleware / logs to POST /api/v1/bots/:siteId (token-authenticated),
 * and the tracker endpoint also logs AI user agents that do reach it.
 */
import type { Context, Hono } from 'hono';
import { detectAiBot, type BotCategory } from '../shared/aibots.js';
import { getSite, type AppEnv, type Site } from './env.js';
import { constantTimeEqual, hmacHex } from './lib/crypto.js';
import { RateLimiter } from './lib/security.js';
import { bucketLabels, bucketSql, tzOffset } from './lib/time.js';
import { makeCtx, type Ctx } from './stats.js';
import { normalizePath } from './collect.js';

/** Plan item « 100K requêtes de bots IA »: per site and calendar month (site time). */
export const BOT_MONTHLY_LIMIT = 100_000;
const MAX_HITS_PER_REQUEST = 2000;
const MAX_BODY = 1024 * 1024;
const limiter = new RateLimiter(600, 60_000);

/** Ingestion-only token: derived from the site's API key (rotates with it) and can't record payments or goals. */
export async function botToken(site: Site): Promise<string> {
  return 'mlb_' + (await hmacHex(site.api_key, `bots:${site.id}`)).slice(0, 40);
}

export interface BotHitInput { ua?: string | null; path?: string | null; ts?: number; status?: number | null; country?: string | null; sig?: string | null }

/** Accepts our own shape ({ ua, path, … }), Vercel log drains (proxy.userAgent…) and common log JSON field names. */
export function normalizeHit(raw: unknown): BotHitInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, any>;
  const proxy = h.proxy && typeof h.proxy === 'object' ? h.proxy : {};
  const pick = (...v: unknown[]) => v.find((x) => x !== undefined && x !== null && x !== '');
  let ua = pick(h.ua, h.user_agent, h.userAgent, h['user-agent'], proxy.userAgent, h.http_user_agent);
  if (Array.isArray(ua)) ua = ua[0];
  let path = pick(h.path, h.url, h.uri, proxy.path, h.request_uri, h.request?.url);
  if (typeof path === 'string' && /^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname; } catch { path = null; }
  }
  const tsRaw = pick(h.ts, h.timestamp, proxy.timestamp, h.time, h.time_local);
  let ts = typeof tsRaw === 'number' ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : typeof tsRaw === 'string' ? Date.parse(tsRaw) : NaN;
  if (!Number.isFinite(ts)) ts = Date.now();
  const status = Number(pick(h.status, h.statusCode, proxy.statusCode, h.status_code));
  const country = pick(h.country, h.geo?.country, proxy.country);
  return {
    ua: typeof ua === 'string' ? ua.slice(0, 1000) : null,
    path: typeof path === 'string' ? path : null,
    ts,
    status: Number.isInteger(status) && status >= 100 && status < 600 ? status : null,
    country: typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    sig: typeof h.signature_agent === 'string' ? h.signature_agent : typeof h.sig === 'string' ? h.sig : null,
  };
}

function monthStart(site: Site, at: number): number {
  const off = tzOffset(site.timezone, at);
  const d = new Date(at + off);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return utc - tzOffset(site.timezone, utc);
}

export async function monthUsage(db: D1Database, site: Site, now = Date.now()) {
  const from = monthStart(site, now);
  const r = await db.prepare('SELECT COUNT(*) AS n FROM bot_hits WHERE site_id = ? AND ts >= ?').bind(site.id, from).first<{ n: number }>();
  return { used: Number(r?.n ?? 0), limit: BOT_MONTHLY_LIMIT, from };
}

/** Records AI bot hits (others are ignored). Returns how many were stored / ignored / over the monthly quota. */
export async function recordBotHits(db: D1Database, site: Site, inputs: BotHitInput[], source: 'forward' | 'script', now = Date.now()) {
  const rows: unknown[][] = [];
  let ignored = 0;
  for (const h of inputs) {
    const bot = detectAiBot(h.ua, h.sig);
    if (!bot) { ignored++; continue; }
    // Clock skew / replays: keep hits from the last 7 days and not from the future.
    const ts = Math.min(Math.max(h.ts ?? now, now - 7 * 86_400_000), now);
    const path = h.path ? normalizePath(h.path.split(/[?#]/)[0] || '/').slice(0, 500) : null;
    rows.push([site.id, ts, bot.name, bot.operator, bot.category, path, h.status ?? null, source, h.country ?? null]);
  }
  if (!rows.length) return { stored: 0, ignored, overQuota: 0 };
  const { used } = await monthUsage(db, site, now);
  const room = Math.max(0, BOT_MONTHLY_LIMIT - used);
  const keep = rows.slice(0, room);
  for (let i = 0; i < keep.length; i += 50) {
    const chunk = keep.slice(i, i + 50);
    await db
      .prepare(`INSERT INTO bot_hits (site_id, ts, bot, operator, category, path, status, source, country) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...chunk.flat())
      .run();
  }
  return { stored: keep.length, ignored, overQuota: rows.length - keep.length };
}

function parseBody(raw: string): unknown[] {
  const t = raw.trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.hits)) return j.hits;
    return [j];
  } catch {
    // NDJSON (Vercel log drains, Fluent Bit, Vector…)
    return t.split('\n').flatMap((l) => {
      try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; }
    });
  }
}

async function handleBotIngest(c: Context<AppEnv>) {
  const site = await getSite(c.env.DB, c.req.param('siteId') ?? '');
  if (!site) return c.json({ error: 'unknown site' }, 404);
  const given = (c.req.header('authorization')?.replace(/^Bearer\s+/i, '') || c.req.header('x-minilytics-token') || c.req.query('token') || '').trim();
  if (!given || !constantTimeEqual(given, await botToken(site))) return c.json({ error: 'invalid token' }, 401);
  if (!limiter.allow(site.id)) return c.json({ error: 'rate limited' }, 429);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY) return c.json({ error: 'body too large' }, 413);
  const raw = await c.req.text();
  if (raw.length > MAX_BODY) return c.json({ error: 'body too large' }, 413);
  const items = parseBody(raw);
  if (items.length > MAX_HITS_PER_REQUEST) return c.json({ error: `max ${MAX_HITS_PER_REQUEST} hits per request` }, 413);
  const hits = items.map(normalizeHit).filter((h): h is BotHitInput => !!h);
  return c.json(await recordBotHits(c.env.DB, site, hits, 'forward'), 202);
}

export async function botsReport(ctx: Ctx) {
  const { db, site, range, offset } = ctx;
  const w = 'site_id = ? AND ts >= ? AND ts < ?';
  const p = [site.id, range.from, range.to];
  const bucket = bucketSql('ts', range.granularity, offset);
  const sw = 's.site_id = ? AND s.started_at >= ? AND s.started_at < ? AND s.channel = ?';
  const sp = [site.id, range.from, range.to, 'AI'];
  const sbucket = bucketSql('s.started_at', range.granularity, offset);
  const [totals, bots, pages, series, cats, aiTotals, aiSources, aiPages, aiSeries, aiRevenue] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS hits, COUNT(DISTINCT bot) AS bots, COUNT(DISTINCT path) AS pages, MAX(ts) AS last FROM bot_hits WHERE ${w}`).bind(...p),
    db.prepare(`SELECT bot, operator, category, COUNT(*) AS hits, COUNT(DISTINCT path) AS pages, MAX(ts) AS last FROM bot_hits WHERE ${w} GROUP BY bot, operator, category ORDER BY hits DESC LIMIT 50`).bind(...p),
    db.prepare(`SELECT path, COUNT(*) AS hits, COUNT(DISTINCT bot) AS bots, string_agg(DISTINCT bot, ', ') AS names FROM bot_hits WHERE ${w} GROUP BY path ORDER BY hits DESC LIMIT 50`).bind(...p),
    db.prepare(`SELECT ${bucket} AS bucket, category, COUNT(*) AS hits FROM bot_hits WHERE ${w} GROUP BY 1, 2`).bind(...p),
    db.prepare(`SELECT category, COUNT(*) AS hits FROM bot_hits WHERE ${w} GROUP BY category`).bind(...p),
    db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, COALESCE(SUM(s.pageviews), 0) AS pageviews FROM sessions s WHERE ${sw}`).bind(...sp),
    db.prepare(`SELECT s.source AS label, COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions FROM sessions s WHERE ${sw} GROUP BY s.source ORDER BY visitors DESC LIMIT 20`).bind(...sp),
    db.prepare(`SELECT s.entry_page AS label, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s WHERE ${sw} GROUP BY s.entry_page ORDER BY visitors DESC LIMIT 20`).bind(...sp),
    db.prepare(`SELECT ${sbucket} AS bucket, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s WHERE ${sw} GROUP BY 1`).bind(...sp),
    db.prepare(
      `SELECT COALESCE(SUM(p.amount), 0) AS revenue, COUNT(DISTINCT COALESCE(p.customer_id, p.email, p.visitor_id)) AS customers
       FROM payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ? AND s.channel = ?`,
    ).bind(...sp),
  ]);
  const labels = bucketLabels(range, offset);
  const byBucket = new Map<string, Record<BotCategory, number>>();
  for (const r of series.results as any[]) {
    const m = byBucket.get(r.bucket) ?? { training: 0, search: 0, assistant: 0 };
    m[r.category as BotCategory] = (m[r.category as BotCategory] ?? 0) + Number(r.hits);
    byBucket.set(r.bucket, m);
  }
  const aiBy = new Map((aiSeries.results as any[]).map((r) => [r.bucket, Number(r.visitors)]));
  const t = totals.results[0] as any;
  const a = aiTotals.results[0] as any;
  const rv = aiRevenue.results[0] as any;
  return {
    range,
    totals: { hits: Number(t?.hits ?? 0), bots: Number(t?.bots ?? 0), pages: Number(t?.pages ?? 0), lastHitAt: t?.last ? Number(t.last) : null },
    categories: (cats.results as any[]).map((r) => ({ category: r.category, hits: Number(r.hits) })),
    bots: (bots.results as any[]).map((r) => ({ ...r, hits: Number(r.hits), pages: Number(r.pages), last: Number(r.last) })),
    pages: (pages.results as any[]).map((r) => ({ path: r.path, hits: Number(r.hits), bots: Number(r.bots), names: r.names })),
    series: labels.map((b) => ({ bucket: b, ...(byBucket.get(b) ?? { training: 0, search: 0, assistant: 0 }) })),
    usage: await monthUsage(db, site),
    aiReferrals: {
      visitors: Number(a?.visitors ?? 0),
      sessions: Number(a?.sessions ?? 0),
      pageviews: Number(a?.pageviews ?? 0),
      revenue: Number(rv?.revenue ?? 0),
      customers: Number(rv?.customers ?? 0),
      sources: (aiSources.results as any[]).map((r) => ({ label: r.label, visitors: Number(r.visitors), sessions: Number(r.sessions) })),
      pages: (aiPages.results as any[]).map((r) => ({ label: r.label, visitors: Number(r.visitors) })),
      series: labels.map((b) => ({ bucket: b, visitors: aiBy.get(b) ?? 0 })),
    },
  };
}

export function registerBots(app: Hono<AppEnv>) {
  app.post('/api/v1/bots/:siteId', handleBotIngest);
  app.get('/api/sites/:id/bots', async (c) => c.json(await botsReport(makeCtx(c))));
  app.get('/api/sites/:id/bots/setup', async (c) => {
    // The token can write bot hits: read-only members don't get it.
    if (c.get('principal')?.role === 'viewer') return c.json({ error: 'Réservé aux admins' }, 403);
    const site = c.get('site');
    const last = await c.env.DB.prepare('SELECT MAX(ts) AS last, COUNT(*) AS n FROM bot_hits WHERE site_id = ? AND source = ?').bind(site.id, 'forward').first<{ last: number | null; n: number }>();
    return c.json({ endpoint: new URL(`/api/v1/bots/${site.id}`, c.req.url).toString(), token: await botToken(site), lastForwardAt: last?.last ? Number(last.last) : null, forwarded: Number(last?.n ?? 0) });
  });
}

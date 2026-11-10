/**
 * Replay of recent visits and the live visitor list for the Carte page.
 * GET /api/sites/:id/replay?window=30m|24h → visits started in the window, oldest first (max 2000).
 * GET /api/sites/:id/live-visitors → sessions active in the last 5 minutes (max 200), newest last_seen first.
 * GET /api/sites/:id/sessions/:sid/journey → ordered page path for one session (admin, no PII).
 * Aggregates never include raw IPs. Name and email stay on the admin replay payload for other UI
 * (visitor modal); the live-visitors payload only exposes an `identified` flag.
 */
import type { Hono } from 'hono';
import type { AppEnv } from './env.js';

const WINDOWS = { '30m': 30 * 60_000, '24h': 24 * 3_600_000 } as const;
export const LIVE_WINDOW_MS = 5 * 60_000;
export const LIVE_MAX_AGE_MS = 6 * 3_600_000;
const num = (v: unknown) => Number(v) || 0;
const coord = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

const VISIT_COLS = `s.id, s.started_at, s.last_seen_at, s.visitor_id, s.country, s.region, s.city, s.lat, s.lon, s.source, s.channel,
              s.referrer_domain, s.entry_page, s.exit_page, s.device, s.browser, s.os, s.pageviews, s.duration, s.goals, v.name, v.email`;

export interface VisitRow {
  id: string; t: number; lastSeen: number; visitorId: string; country: string | null; region: string | null; city: string | null;
  lat: number | null; lon: number | null; source: string | null; channel: string | null; referrer: string | null;
  page: string | null; current: string | null; device: string | null; browser: string | null; os: string | null;
  pageviews: number; duration: number; goals: number; revenue: number; currency: string | null;
  identified: boolean; name: string | null; email: string | null;
}

function mapRow(s: any, money: Map<string, { amount: number; currency: string }>, withPii: boolean): VisitRow {
  const pay = money.get(String(s.id));
  return {
    id: String(s.id),
    t: num(s.started_at),
    lastSeen: num(s.last_seen_at),
    visitorId: String(s.visitor_id),
    country: s.country ?? null,
    region: s.region ?? null,
    city: s.city ?? null,
    lat: coord(s.lat),
    lon: coord(s.lon),
    source: s.source ?? null,
    channel: s.channel ?? null,
    referrer: s.referrer_domain ?? null,
    page: s.entry_page ?? null,
    current: (s.exit_page ?? s.entry_page) ?? null,
    device: s.device ?? null,
    browser: s.browser ?? null,
    os: s.os ?? null,
    pageviews: num(s.pageviews),
    duration: num(s.duration),
    goals: num(s.goals),
    revenue: pay && pay.amount > 0 ? pay.amount : 0,
    currency: pay && pay.amount > 0 ? pay.currency : null,
    identified: !!(s.name || s.email),
    name: withPii ? s.name ?? null : null,
    email: withPii ? s.email ?? null : null,
  };
}

async function paymentsFor(db: D1Database, siteId: string, sessionIds: string[]) {
  const money = new Map<string, { amount: number; currency: string }>();
  if (!sessionIds.length) return money;
  const ph = sessionIds.map(() => '?').join(',');
  const r = await db
    .prepare(`SELECT session_id AS id, SUM(amount) AS amount, MIN(currency) AS currency
              FROM payments WHERE site_id = ? AND session_id IN (${ph}) GROUP BY session_id`)
    .bind(siteId, ...sessionIds)
    .all();
  for (const row of r.results as any[]) {
    money.set(String(row.id), { amount: num(row.amount), currency: String(row.currency ?? 'EUR') });
  }
  return money;
}

export async function replay(db: D1Database, siteId: string, win: keyof typeof WINDOWS, now = Date.now()) {
  const from = now - WINDOWS[win];
  const r = await db
    .prepare(
      `SELECT ${VISIT_COLS}
       FROM sessions s LEFT JOIN visitors v ON v.site_id = s.site_id AND v.id = s.visitor_id
       WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at <= ?
       ORDER BY s.started_at ASC LIMIT 2000`,
    )
    .bind(siteId, from, now)
    .all();
  const rows = (r.results as any[]) ?? [];
  const money = await paymentsFor(db, siteId, rows.map((s) => String(s.id)));
  return {
    window: win,
    from,
    to: now,
    visits: rows.map((s) => mapRow(s, money, true)),
  };
}

export async function liveVisitors(db: D1Database, siteId: string, now = Date.now()) {
  const active = now - LIVE_WINDOW_MS;
  const since = now - LIVE_MAX_AGE_MS;
  const r = await db
    .prepare(
      `SELECT ${VISIT_COLS}
       FROM sessions s LEFT JOIN visitors v ON v.site_id = s.site_id AND v.id = s.visitor_id
       WHERE s.site_id = ? AND s.last_seen_at >= ? AND s.started_at >= ?
       ORDER BY s.last_seen_at DESC LIMIT 200`,
    )
    .bind(siteId, active, since)
    .all();
  const rows = (r.results as any[]) ?? [];
  const money = await paymentsFor(db, siteId, rows.map((s) => String(s.id)));
  const visits = rows.map((s) => mapRow(s, money, false));
  return { updatedAt: now, online: visits.length, visits };
}


const JOURNEY_TYPES = new Set(['pageview', 'goal', 'outbound', 'form', 'video']);

export interface JourneyStep {
  t: number;
  type: string;
  path: string | null;
  name: string | null;
  duration: number | null;
}
export interface Journey {
  sessionId: string;
  visitorId: string;
  source: string | null;
  referrer: string | null;
  channel: string | null;
  entry: string | null;
  exit: string | null;
  startedAt: number;
  lastSeen: number;
  pageviews: number;
  steps: JourneyStep[];
}

export function buildJourney(
  session: {
    id: string; visitor_id: string; started_at: number; last_seen_at: number;
    source: string | null; channel: string | null; referrer_domain: string | null;
    entry_page: string | null; exit_page: string | null; pageviews: number;
  },
  events: { ts: number; type: string; name: string | null; path: string | null }[],
): Journey {
  const lastSeen = num(session.last_seen_at);
  const useful = events
    .filter((e) => JOURNEY_TYPES.has(e.type))
    .sort((a, b) => num(a.ts) - num(b.ts))
    .slice(0, 200);
  const steps: JourneyStep[] = [];
  if (!useful.length) {
    if (session.entry_page) steps.push({ t: num(session.started_at), type: 'pageview', path: session.entry_page, name: null, duration: null });
    if (session.exit_page && session.exit_page !== session.entry_page) {
      steps.push({ t: lastSeen, type: 'pageview', path: session.exit_page, name: null, duration: null });
    }
  } else {
    for (const e of useful) {
      const last = steps[steps.length - 1];
      if (e.type === 'pageview' && last && last.type === 'pageview' && last.path === (e.path ?? null)) continue;
      steps.push({ t: num(e.ts), type: e.type, path: e.path ?? null, name: e.name ?? null, duration: null });
    }
  }
  for (let i = 0; i < steps.length; i++) {
    const next = steps[i + 1];
    const d = (next ? next.t : lastSeen) - steps[i].t;
    steps[i].duration = d >= 0 ? d : 0;
  }
  return {
    sessionId: String(session.id),
    visitorId: String(session.visitor_id),
    source: session.source ?? null,
    referrer: session.referrer_domain ?? null,
    channel: session.channel ?? null,
    entry: session.entry_page ?? null,
    exit: (session.exit_page ?? session.entry_page) ?? null,
    startedAt: num(session.started_at),
    lastSeen,
    pageviews: num(session.pageviews),
    steps,
  };
}

export async function sessionJourney(db: D1Database, siteId: string, sessionId: string): Promise<Journey | null> {
  if (!sessionId || sessionId.length > 80) return null;
  const s = await db.prepare(
    `SELECT id, visitor_id, started_at, last_seen_at, source, channel, referrer_domain, entry_page, exit_page, pageviews
     FROM sessions WHERE site_id = ? AND id = ?`,
  ).bind(siteId, sessionId).first<any>();
  if (!s) return null;
  const ev = await db.prepare(
    `SELECT ts, type, name, path FROM events WHERE site_id = ? AND session_id = ? ORDER BY ts ASC LIMIT 200`,
  ).bind(siteId, sessionId).all();
  return buildJourney(s, (ev.results as any[]) ?? []);
}

export function registerReplay(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/replay', async (c) => {
    const w = c.req.query('window') === '24h' ? '24h' : '30m';
    c.header('Cache-Control', 'no-store');
    return c.json(await replay(c.env.DB, c.get('site').id, w));
  });
  app.get('/api/sites/:id/live-visitors', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await liveVisitors(c.env.DB, c.get('site').id));
  });
  app.get('/api/sites/:id/sessions/:sid/journey', async (c) => {
    c.header('Cache-Control', 'no-store');
    const journey = await sessionJourney(c.env.DB, c.get('site').id, c.req.param('sid'));
    if (!journey) return c.json({ error: 'Visite introuvable' }, 404);
    return c.json(journey);
  });
}

/**
 * Replay of recent visits for the Carte page (frontend agent).
 * GET /api/sites/:id/replay?window=30m|24h → visits started in the window, oldest first (max 2000),
 * each with its place (provider coordinates when stored), source, entry page, device and, for
 * identified visitors, name/email so the dashboard can show an avatar. Admin dashboard only.
 */
import type { Hono } from 'hono';
import type { AppEnv } from './env.js';

const WINDOWS = { '30m': 30 * 60_000, '24h': 24 * 3_600_000 } as const;
const num = (v: unknown) => Number(v) || 0;
const coord = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export async function replay(db: D1Database, siteId: string, win: keyof typeof WINDOWS, now = Date.now()) {
  const from = now - WINDOWS[win];
  const r = await db
    .prepare(
      `SELECT s.id, s.started_at, s.last_seen_at, s.visitor_id, s.country, s.region, s.city, s.lat, s.lon, s.source, s.channel,
              s.referrer_domain, s.entry_page, s.device, s.browser, s.os, s.pageviews, s.duration, v.name, v.email
       FROM sessions s LEFT JOIN visitors v ON v.site_id = s.site_id AND v.id = s.visitor_id
       WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at <= ?
       ORDER BY s.started_at ASC LIMIT 2000`,
    )
    .bind(siteId, from, now)
    .all();
  return {
    window: win,
    from,
    to: now,
    visits: (r.results as any[]).map((s) => ({
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
      device: s.device ?? null,
      browser: s.browser ?? null,
      os: s.os ?? null,
      pageviews: num(s.pageviews),
      duration: num(s.duration),
      name: s.name ?? null,
      email: s.email ?? null,
    })),
  };
}

export function registerReplay(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/replay', async (c) => {
    const w = c.req.query('window') === '24h' ? '24h' : '30m';
    c.header('Cache-Control', 'no-store');
    return c.json(await replay(c.env.DB, c.get('site').id, w));
  });
}

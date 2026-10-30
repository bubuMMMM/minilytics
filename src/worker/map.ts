import type { D1Database } from '@cloudflare/workers-types';
import { filterSql, type Ctx } from './stats.js';
import { bucketSql } from './lib/time.js';

const ISO2 = /^[A-Z]{2}$/;
const num = (v: unknown) => Number(v ?? 0) || 0;
const coordOrNull = (v: unknown) => (v == null ? null : Math.round(Number(v) * 100) / 100);

/**
 * Carte page: visitors per country (period + filters), city aggregates, and the all-time "discovery"
 * of each country (first visit) used by the gamification. Aggregates only: no visitor ids, no IPs.
 * `cities: false` (public demo) returns country-level data only.
 */
export async function mapReport(ctx: Ctx, { cities = true }: { cities?: boolean } = {}) {
  const { db, site, range } = ctx;
  const f = filterSql(ctx.filters);
  const where = `s.site_id = ? AND s.started_at >= ? AND s.started_at < ?${f.sql}`;
  const params = [site.id, range.from, range.to, ...f.params];
  const day = bucketSql('started_at', 'day', ctx.offset);
  const stmts = [
    db.prepare(`SELECT UPPER(s.country) AS c, COUNT(DISTINCT s.visitor_id) AS v, COUNT(*) AS n, SUM(s.pageviews) AS pv
      FROM sessions s WHERE ${where} AND s.country IS NOT NULL GROUP BY UPPER(s.country)`).bind(...params),
    db.prepare(`SELECT UPPER(country) AS c, MIN(started_at) AS f, COUNT(DISTINCT visitor_id) AS v
      FROM sessions WHERE site_id = ? AND country IS NOT NULL GROUP BY UPPER(country)`).bind(site.id),
    db.prepare(`SELECT ${day} AS d, COUNT(DISTINCT UPPER(country)) AS n FROM sessions WHERE site_id = ? GROUP BY d ORDER BY d DESC LIMIT 400`).bind(site.id),
    db.prepare(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT UPPER(country), city FROM sessions WHERE site_id = ? AND city IS NOT NULL AND country IS NOT NULL) t`).bind(site.id),
  ];
  if (cities) {
    stmts.push(
      db.prepare(`SELECT UPPER(s.country) AS c, s.region AS r, s.city AS ci, COUNT(DISTINCT s.visitor_id) AS v, AVG(s.lat) AS lat, AVG(s.lon) AS lon
        FROM sessions s WHERE ${where} AND s.country IS NOT NULL AND s.city IS NOT NULL
        GROUP BY UPPER(s.country), s.region, s.city ORDER BY v DESC LIMIT 500`).bind(...params),
      db.prepare(`SELECT UPPER(s.country) AS c, s.region AS r, COUNT(DISTINCT s.visitor_id) AS v
        FROM sessions s WHERE ${where} AND s.country IS NOT NULL AND s.region IS NOT NULL
        GROUP BY UPPER(s.country), s.region ORDER BY v DESC LIMIT 500`).bind(...params),
    );
  }
  const [countries, discovery, days, cityCount, places, regions] = await db.batch(stmts);
  return {
    range,
    timezone: site.timezone,
    cityLevel: cities,
    countries: (countries.results as any[])
      .filter((r) => ISO2.test(r.c ?? ''))
      .map((r) => ({ country: r.c as string, visitors: num(r.v), sessions: num(r.n), pageviews: num(r.pv) }))
      .sort((a, b) => b.visitors - a.visitors),
    discovery: (discovery.results as any[])
      .filter((r) => ISO2.test(r.c ?? ''))
      .map((r) => ({ country: r.c as string, firstAt: num(r.f), visitors: num(r.v) }))
      .sort((a, b) => a.firstAt - b.firstAt),
    days: (days.results as any[]).map((r) => ({ day: String(r.d), countries: num(r.n) })),
    citiesReached: cities ? num((cityCount.results[0] as any)?.n) : null,
    places: cities
      ? (places!.results as any[])
          .filter((r) => ISO2.test(r.c ?? ''))
          .map((r) => ({ country: r.c as string, region: (r.r as string) ?? null, city: r.ci as string, visitors: num(r.v), lat: coordOrNull(r.lat), lon: coordOrNull(r.lon) }))
      : [],
    regions: cities
      ? (regions!.results as any[]).filter((r) => ISO2.test(r.c ?? '')).map((r) => ({ country: r.c as string, region: r.r as string, visitors: num(r.v) }))
      : [],
  };
}

/** Who is on the site right now (last 5 min), per country and, if allowed, per city with coordinates. */
export async function liveMap(db: D1Database, siteId: string, { cities = true }: { cities?: boolean } = {}) {
  const now = Date.now();
  const active = now - 5 * 60_000;
  const since = now - 6 * 3_600_000;
  const stmts = [
    db.prepare(`SELECT UPPER(country) AS c, COUNT(DISTINCT visitor_id) AS v FROM sessions
      WHERE site_id = ? AND last_seen_at >= ? AND started_at >= ? AND country IS NOT NULL GROUP BY UPPER(country)`).bind(siteId, active, since),
  ];
  if (cities) {
    stmts.push(db.prepare(`SELECT UPPER(country) AS c, city AS ci, COUNT(DISTINCT visitor_id) AS v, AVG(lat) AS lat, AVG(lon) AS lon FROM sessions
      WHERE site_id = ? AND last_seen_at >= ? AND started_at >= ? AND country IS NOT NULL AND city IS NOT NULL
      GROUP BY UPPER(country), city LIMIT 200`).bind(siteId, active, since));
  }
  const [c, p] = await db.batch(stmts);
  const countries = (c.results as any[]).filter((r) => ISO2.test(r.c ?? '')).map((r) => ({ country: r.c as string, visitors: num(r.v) }));
  return {
    updatedAt: now,
    online: countries.reduce((n, r) => n + r.visitors, 0),
    countries,
    places: cities && p ? (p.results as any[]).filter((r) => ISO2.test(r.c ?? '')).map((r) => ({ country: r.c as string, city: r.ci as string, visitors: num(r.v), lat: coordOrNull(r.lat), lon: coordOrNull(r.lon) })) : [],
  };
}

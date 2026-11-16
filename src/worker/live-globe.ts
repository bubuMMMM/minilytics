
type CountryCount = { country: string | null; visitors: number; last_seen_at: number };
type TotalCount = { visitors: number };

// Country-level aggregates only. Never expose IPs, cookies, visitor IDs or precise coordinates.
export async function liveGlobeStats(db: D1Database, siteId: string) {
  const now = Date.now();
  const activeAfter = now - 5 * 60_000;
  const recentAfter = now - 30 * 60_000;
  const sessionAfter = now - 6 * 3_600_000;

  const [totals, active, recent] = await db.batch([
    db.prepare(`SELECT COUNT(DISTINCT visitor_id) AS visitors FROM sessions
      WHERE site_id = ? AND last_seen_at >= ? AND started_at >= ?`).bind(siteId, activeAfter, sessionAfter),
    db.prepare(`SELECT UPPER(country) AS country, COUNT(DISTINCT visitor_id) AS visitors,
        MAX(last_seen_at) AS last_seen_at FROM sessions
      WHERE site_id = ? AND last_seen_at >= ? AND started_at >= ? AND country IS NOT NULL
      GROUP BY UPPER(country) ORDER BY visitors DESC LIMIT 100`).bind(siteId, activeAfter, sessionAfter),
    db.prepare(`SELECT UPPER(country) AS country, COUNT(DISTINCT visitor_id) AS visitors,
        MAX(started_at) AS last_seen_at FROM sessions
      WHERE site_id = ? AND started_at >= ? AND country IS NOT NULL
      GROUP BY UPPER(country) ORDER BY visitors DESC LIMIT 100`).bind(siteId, recentAfter),
  ]);

  const normalize = (items: unknown[]) => (items as CountryCount[])
    .filter((r) => /^[A-Z]{2}$/.test(r.country ?? ''))
    .map((r) => ({
      country: r.country as string,
      visitors: Number(r.visitors ?? 0),
      lastSeenAt: Number(r.last_seen_at ?? 0),
    }));

  return {
    updatedAt: now,
    activeWindowMinutes: 5,
    recentWindowMinutes: 30,
    online: Number((totals.results[0] as TotalCount | undefined)?.visitors ?? 0),
    countries: normalize(active.results),
    recentCountries: normalize(recent.results),
  };
}

type OperatorCount = { operator: string | null; hits: number };

/** AI crawler requests over the last 7 days, grouped by operator (OpenAI, Anthropic…). Aggregates only: no paths, no user agents. */
export async function publicBotStats(db: D1Database, siteId: string) {
  const now = Date.now();
  const from = now - 7 * 86_400_000;
  const [operators, previous] = await db.batch([
    db.prepare(`SELECT operator, COUNT(*) AS hits FROM bot_hits WHERE site_id = ? AND ts >= ? AND ts < ?
      GROUP BY operator ORDER BY hits DESC LIMIT 12`).bind(siteId, from, now + 1),
    db.prepare('SELECT COUNT(*) AS hits FROM bot_hits WHERE site_id = ? AND ts >= ? AND ts < ?').bind(siteId, from - 7 * 86_400_000, from),
  ]);
  const rows = (operators.results as OperatorCount[])
    .filter((r) => r.operator)
    .map((r) => ({ operator: String(r.operator).slice(0, 40), hits: Number(r.hits ?? 0) }));
  return {
    updatedAt: now,
    days: 7,
    hits: rows.reduce((n, r) => n + r.hits, 0),
    previousHits: Number((previous.results[0] as { hits: number } | undefined)?.hits ?? 0),
    operators: rows,
  };
}

import type { Site } from './env.js';

const DAY = 86_400_000;
const MIN = 60_000;

/** RFC 4180 CSV: quotes fields containing commas, quotes or newlines, and neutralises spreadsheet formulas. */
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Daily visitor counts for the last `days` days (oldest first), with zero-filled gaps. */
export function fillDaily(rows: { d: number; n: number }[], now: number, days: number): number[] {
  const today = Math.floor(now / DAY);
  const by = new Map(rows.map((r) => [Number(r.d), Number(r.n)]));
  return Array.from({ length: days }, (_, i) => by.get(today - days + 1 + i) ?? 0);
}

/** Visitors per minute for the last `minutes` minutes (oldest first). */
export function fillMinutes(rows: { m: number; n: number }[], now: number, minutes: number): number[] {
  const cur = Math.floor(now / MIN);
  const by = new Map(rows.map((r) => [Number(r.m), Number(r.n)]));
  return Array.from({ length: minutes }, (_, i) => by.get(cur - minutes + 1 + i) ?? 0);
}

/** Per-site daily visitors for the sites list sparklines. */
export async function sparklines(db: D1Database, now: number, days = 14): Promise<Map<string, number[]>> {
  const from = (Math.floor(now / DAY) - days + 1) * DAY;
  const res = await db
    .prepare(
      `SELECT site_id, started_at / ${DAY} AS d, COUNT(DISTINCT visitor_id) AS n
       FROM sessions WHERE started_at >= ? GROUP BY site_id, started_at / ${DAY}`,
    )
    .bind(from)
    .all<{ site_id: string; d: number; n: number }>();
  const by = new Map<string, { d: number; n: number }[]>();
  for (const r of res.results) {
    if (!by.has(r.site_id)) by.set(r.site_id, []);
    by.get(r.site_id)!.push(r);
  }
  const out = new Map<string, number[]>();
  for (const [id, rows] of by) out.set(id, fillDaily(rows, now, days));
  return out;
}

/** What is happening right now: online visitors, per-minute activity, active pages and the latest events. */
export async function realtime(db: D1Database, site: Site, now = Date.now()) {
  const since = now - 30 * MIN;
  const [online, perMin, pages, sources, recent] = await db.batch([
    db
      .prepare('SELECT COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND started_at > ? AND last_seen_at > ?')
      .bind(site.id, now - 6 * 3_600_000, now - 5 * MIN),
    db
      .prepare(`SELECT ts / ${MIN} AS m, COUNT(DISTINCT visitor_id) AS n FROM events WHERE site_id = ? AND ts > ? GROUP BY ts / ${MIN}`)
      .bind(site.id, since),
    db
      .prepare(
        `SELECT path AS label, COUNT(DISTINCT visitor_id) AS visitors FROM events
         WHERE site_id = ? AND type = 'pageview' AND ts > ? GROUP BY path ORDER BY visitors DESC LIMIT 8`,
      )
      .bind(site.id, since),
    db
      .prepare(
        `SELECT source AS label, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
         WHERE site_id = ? AND last_seen_at > ? GROUP BY source ORDER BY visitors DESC LIMIT 6`,
      )
      .bind(site.id, since),
    db
      .prepare(
        `SELECT e.ts, e.type, e.name, e.path, e.visitor_id, s.country, s.source, s.device, s.browser
         FROM events e LEFT JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id
         WHERE e.site_id = ? AND e.ts > ? ORDER BY e.ts DESC LIMIT 25`,
      )
      .bind(site.id, since),
  ]);
  return {
    now,
    online: (online.results[0] as { n: number } | undefined)?.n ?? 0,
    perMinute: fillMinutes(perMin.results as { m: number; n: number }[], now, 30),
    pages: pages.results,
    sources: sources.results,
    recent: recent.results,
  };
}

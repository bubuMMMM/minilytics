import type { D1Database } from '@cloudflare/workers-types';
import { forgetSite, getSite, type Site } from './env.js';

// A fixed, public demonstration site. Never expose its API key or individual visitor records.
export const DEMO_SITE_ID = 'minilytics-demo-2026';
export const DEMO_DOMAIN = 'minilytics-six.vercel.app';

export async function ensureDemoSite(db: D1Database): Promise<Site> {
  const existing = await getSite(db, DEMO_SITE_ID);
  if (existing) return existing;
  await db.prepare(
    'INSERT OR IGNORE INTO sites (id, name, domain, timezone, currency, api_key, dodo_webhook_secret, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(DEMO_SITE_ID, 'Minilytics · live demo', DEMO_DOMAIN, 'Europe/Paris', 'EUR', 'ml_public_demo_no_api_access', null, Date.now()).run();
  forgetSite(DEMO_SITE_ID);
  const site = await getSite(db, DEMO_SITE_ID);
  if (!site) throw new Error('Unable to initialize demo site');
  return site;
}

interface CountRow {
  visitors: number;
  sessions: number;
  pageviews: number;
  avg_duration: number;
}
interface GroupRow {
  label: string | null;
  visitors: number;
}
interface PageRow {
  label: string;
  pageviews: number;
}
interface DayRow {
  bucket: number;
  visitors: number;
  pageviews: number;
}

function numbers(row?: CountRow) {
  return {
    visitors: Number(row?.visitors ?? 0),
    sessions: Number(row?.sessions ?? 0),
    pageviews: Number(row?.pageviews ?? 0),
    avgDurationMs: Math.round(Number(row?.avg_duration ?? 0)),
  };
}

export async function publicDemoStats(db: D1Database, days = 7) {
  await ensureDemoSite(db);
  const safeDays = days === 30 ? 30 : 7;
  const now = Date.now();
  const from = now - safeDays * 86400000;
  const prevFrom = from - safeDays * 86400000;
  const from24h = now - 86400000;
  const dayStart = Math.floor(now / 86400000) - safeDays + 1;
  const id = DEMO_SITE_ID;
  const summarySql = `SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS sessions,
    COALESCE(SUM(pageviews), 0) AS pageviews, COALESCE(AVG(duration), 0) AS avg_duration
    FROM sessions WHERE site_id = ? AND started_at >= ? AND started_at < ?`;

  const [current, previous, last24h, online, chart, sources, pages, devices, goals, outbound] = await db.batch([
    db.prepare(summarySql).bind(id, from, now + 1),
    db.prepare(summarySql).bind(id, prevFrom, from),
    db.prepare(summarySql).bind(id, from24h, now + 1),
    db.prepare('SELECT COUNT(DISTINCT visitor_id) AS visitors FROM sessions WHERE site_id = ? AND last_seen_at >= ? AND started_at > ?').bind(id, now - 5 * 60000, now - 6 * 3600000),
    db.prepare(`SELECT FLOOR(started_at / 86400000) AS bucket, COUNT(DISTINCT visitor_id) AS visitors,
      COALESCE(SUM(pageviews), 0) AS pageviews FROM sessions
      WHERE site_id = ? AND started_at >= ? AND started_at < ?
      GROUP BY bucket ORDER BY bucket`).bind(id, dayStart * 86400000, now + 1),
    db.prepare(`SELECT channel AS label, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
      WHERE site_id = ? AND started_at >= ? AND started_at < ?
      GROUP BY channel ORDER BY visitors DESC LIMIT 6`).bind(id, from, now + 1),
    db.prepare(`SELECT path AS label, COUNT(*) AS pageviews FROM events WHERE site_id = ?
      AND type = 'pageview' AND ts >= ? AND ts < ?
      GROUP BY path ORDER BY pageviews DESC LIMIT 6`).bind(id, from, now + 1),
    db.prepare(`SELECT device AS label, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
      WHERE site_id = ? AND started_at >= ? AND started_at < ?
      GROUP BY device ORDER BY visitors DESC LIMIT 5`).bind(id, from, now + 1),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE site_id = ? AND type = 'goal' AND ts >= ? AND ts < ?").bind(id, from, now + 1),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE site_id = ? AND type = 'outbound' AND ts >= ? AND ts < ?").bind(id, from, now + 1),
  ]);

  const dayMap = new Map((chart.results as unknown as DayRow[]).map((r) => [Number(r.bucket), r]));
  const series = Array.from({ length: safeDays }, (_, i) => {
    const bucket = dayStart + i;
    const r = dayMap.get(bucket);
    return {
      date: new Date(bucket * 86400000).toISOString().slice(0, 10),
      visitors: Number(r?.visitors ?? 0),
      pageviews: Number(r?.pageviews ?? 0),
    };
  });
  const groups = (rows: unknown[], key: 'visitors' | 'pageviews') =>
    rows.map((raw) => {
      const row = raw as GroupRow & PageRow;
      return { label: row.label || (key === 'visitors' ? 'Direct / inconnu' : '/'), value: Number(row[key] ?? 0) };
    });

  return {
    site: { name: 'Minilytics', domain: DEMO_DOMAIN },
    days: safeDays,
    updatedAt: now,
    current: numbers(current.results[0] as CountRow | undefined),
    previous: numbers(previous.results[0] as CountRow | undefined),
    last24h: numbers(last24h.results[0] as CountRow | undefined),
    online: Number((online.results[0] as { visitors: number } | undefined)?.visitors ?? 0),
    goals: Number((goals.results[0] as { n: number } | undefined)?.n ?? 0),
    outboundClicks: Number((outbound.results[0] as { n: number } | undefined)?.n ?? 0),
    series,
    sources: groups(sources.results, 'visitors'),
    pages: groups(pages.results, 'pageviews'),
    devices: groups(devices.results, 'visitors'),
  };
}

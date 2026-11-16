import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest, type Geo } from '../src/worker/collect';
import { normalizeOsVersion } from '../src/worker/lib/ua';
import { visitorProfile } from '../src/worker/stats';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';
import type { Site } from '../src/worker/env';

const now = 1_700_000_000_000;
const geo: Geo = { country: 'FR', region: 'IDF', city: 'Paris', lat: 48.86, lon: 2.35 };
const site: Site = {
  id: 'siteios1',
  name: 'Test',
  domain: 'example.com',
  timezone: 'UTC',
  currency: 'EUR',
  api_key: 'ml_' + 'e'.repeat(32),
  dodo_webhook_secret: null,
  created_at: now,
  is_public: 0,
};

const iosUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

function pageview(over: Record<string, unknown> = {}) {
  return {
    w: site.id,
    t: 'pageview' as const,
    u: 'https://example.com/pricing',
    vid: 'visitor01',
    sid: 'session01',
    ...over,
  };
}

let db: PgliteD1;
beforeAll(async () => {
  db = await makeDb();
  await db
    .prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, site.created_at)
    .run();
}, 60_000);

describe('iOS OS version', () => {
  it('stores dotted versions at ingestion, even when Client Hints use underscores', async () => {
    await ingest(db as any, site, pageview({ ch: { pv: '15_0' }, sid: 'session-ios', vid: 'vis-ios' }), new URL('https://example.com/pricing'), iosUA, geo, now);
    const row = await db.prepare('SELECT os_version FROM sessions WHERE id = ?').bind('session-ios').first<{ os_version: string }>();
    expect(row?.os_version).toBe('15.0');
  });

  it('migrates existing underscore versions with a safe UPDATE', async () => {
    await db.prepare("INSERT INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)").bind(site.id, 'vis-old-ios', now).run();
    await db
      .prepare(
        "INSERT INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, source, channel, os, os_version) VALUES (?, ?, ?, ?, ?, 'direct', 'direct', 'iOS', ?)",
      )
      .bind(site.id, 'ses-underscore', 'vis-old-ios', now - 10, now - 10, '15_0')
      .run();
    const sql = readFileSync(join(__dirname, '../migrations-pg/0019_normalize_os_version.sql'), 'utf8');
    await (db as any).pg.exec(sql);
    const row = await db.prepare('SELECT os_version FROM sessions WHERE id = ?').bind('ses-underscore').first<{ os_version: string }>();
    expect(row?.os_version).toBe('15.0');
  });

  it('displays leftover underscore versions as dotted form', async () => {
    await db.prepare("UPDATE sessions SET os_version = '18_2' WHERE id = 'ses-underscore'").run();
    const profile = await visitorProfile(db as any, site, 'vis-old-ios');
    const ses = (profile.sessions as { id: string; os_version: string }[]).find((s) => s.id === 'ses-underscore');
    expect(ses?.os_version).toBe('18.2');
    expect(normalizeOsVersion('18_2')).toBe('18.2');
  });
});

describe('paying visitor return', () => {
  it('notifies once per visitor per 24h when a paying visitor starts a new session', async () => {
    await db.prepare('INSERT INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(site.id, 'payer01', now - 86_400_000).run();
    await db
      .prepare("INSERT INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id) VALUES (?, ?, 'stripe', ?, 1999, 'payment', 'EUR', ?)")
      .bind('pay_abc', site.id, now - 86_400_000, 'payer01')
      .run();

    await ingest(
      db as any,
      site,
      pageview({ vid: 'payer01', sid: 'ses-pay-1', u: 'https://example.com/' }),
      new URL('https://example.com/'),
      iosUA,
      geo,
      now,
    );
    const first = await db
      .prepare("SELECT title, kind, dedupe FROM notifications WHERE site_id = ? AND dedupe LIKE 'payment-return:payer01:%'")
      .bind(site.id)
      .all();
    expect(first.results).toHaveLength(1);
    expect(first.results[0]).toMatchObject({ kind: 'payment', title: 'Un client payant est de retour' });

    // Same visitor, new session, 1 hour later: still inside the 24h window.
    await ingest(
      db as any,
      site,
      pageview({ vid: 'payer01', sid: 'ses-pay-2', u: 'https://example.com/blog' }),
      new URL('https://example.com/blog'),
      iosUA,
      geo,
      now + 3_600_000,
    );
    const again = await db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE site_id = ? AND dedupe LIKE 'payment-return:payer01:%'")
      .bind(site.id)
      .first<{ n: number }>();
    expect(Number(again?.n)).toBe(1);

    // After 24h, a new session may notify again.
    await ingest(
      db as any,
      site,
      pageview({ vid: 'payer01', sid: 'ses-pay-3', u: 'https://example.com/' }),
      new URL('https://example.com/'),
      iosUA,
      geo,
      now + 86_400_000 + 1000,
    );
    const later = await db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE site_id = ? AND dedupe LIKE 'payment-return:payer01:%'")
      .bind(site.id)
      .first<{ n: number }>();
    expect(Number(later?.n)).toBe(2);
  });

  it('does not notify on a repeat pageview of the same session', async () => {
    const before = await db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE site_id = ? AND dedupe LIKE 'payment-return:payer01:%'")
      .bind(site.id)
      .first<{ n: number }>();
    await ingest(
      db as any,
      site,
      pageview({ vid: 'payer01', sid: 'ses-pay-3', u: 'https://example.com/pricing' }),
      new URL('https://example.com/pricing'),
      iosUA,
      geo,
      now + 86_400_000 + 5000,
    );
    const after = await db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE site_id = ? AND dedupe LIKE 'payment-return:payer01:%'")
      .bind(site.id)
      .first<{ n: number }>();
    expect(Number(after?.n)).toBe(Number(before?.n));
  });
});

describe('ingest round trips', () => {
  it('uses a single batch (one DB round trip) per event, down from SELECT + batch', async () => {
    db.resetQueries();
    await ingest(
      db as any,
      site,
      pageview({ vid: 'rt-vis', sid: 'rt-ses-1', u: 'https://example.com/a' }),
      new URL('https://example.com/a'),
      iosUA,
      geo,
      now + 10,
    );
    const first = db.queries;
    expect(first).toBe(1);

    db.resetQueries();
    await ingest(
      db as any,
      site,
      pageview({ vid: 'rt-vis', sid: 'rt-ses-1', u: 'https://example.com/b' }),
      new URL('https://example.com/b'),
      iosUA,
      geo,
      now + 20,
    );
    expect(db.queries).toBe(1);

    const s = await db.prepare('SELECT pageviews, exit_page FROM sessions WHERE id = ?').bind('rt-ses-1').first<{ pageviews: number; exit_page: string }>();
    expect(Number(s?.pageviews)).toBe(2);
    expect(s?.exit_page).toBe('/b');
  });

  it('is faster than the old SELECT-then-batch path (measured on PGlite)', async () => {
    const rounds = 80;
    const url = new URL('https://example.com/bench');
    const selectSql = 'SELECT 1 FROM sessions WHERE site_id = ? AND id = ?';

    const tSelect = async (sid: string) => {
      const t0 = performance.now();
      await db.prepare(selectSql).bind(site.id, sid).first();
      await ingest(db as any, site, pageview({ vid: 'bench-vis', sid, u: url.href }), url, iosUA, geo, now + Math.round(Math.random() * 1000));
      return performance.now() - t0;
    };
    const tMerged = async (sid: string) => {
      const t0 = performance.now();
      await ingest(db as any, site, pageview({ vid: 'bench-vis', sid, u: url.href }), url, iosUA, geo, now + Math.round(Math.random() * 1000));
      return performance.now() - t0;
    };

    // warmup
    await tMerged('bench-warm');
    const oldTimes: number[] = [];
    const newTimes: number[] = [];
    for (let i = 0; i < rounds; i++) {
      oldTimes.push(await tSelect('bench-old-' + i));
      newTimes.push(await tMerged('bench-new-' + i));
    }
    const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
    const before = avg(oldTimes);
    const after = avg(newTimes);
    // eslint-disable-next-line no-console
    console.log(`ingest latency PGlite (n=${rounds}): before SELECT+batch ${before.toFixed(2)} ms, after single batch ${after.toFixed(2)} ms`);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
    // Production win is 2 Neon HTTP round trips → 1. PGlite (in-process) times are indicative only.
  }, 30_000);
});

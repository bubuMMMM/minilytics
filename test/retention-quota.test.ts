import { beforeAll, describe, expect, it } from 'vitest';
import { PLANS } from '../src/shared/plans';
import { maybeQuotaNotifications } from '../src/worker/quota';
import { purgeExpiredData, NOTIF_READ_RETENTION_MS } from '../src/worker/retention';
import { mapBudget } from '../src/worker/lib/pool';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

let db: PgliteD1;
beforeAll(async () => {
  db = await makeDb();
}, 60_000);

describe('plans', () => {
  it('gives Growth a distinct 100k monthly event quota (Starter stays at 10k)', () => {
    expect(PLANS.starter.eventsPerMonth).toBe(10_000);
    expect(PLANS.growth.eventsPerMonth).toBe(100_000);
    expect(PLANS.starter.priceEur).toBe(9);
    expect(PLANS.growth.priceEur).toBe(19);
    expect(PLANS.starter.retentionYears).toBe(3);
    expect(PLANS.growth.retentionYears).toBe(5);
  });
});

describe('retention purge', () => {
  it('deletes old events, sessions, bot hits, expired sessions and old read notifications in batches', async () => {
    const now = Date.now();
    const old = now - 6 * 365 * 86_400_000; // older than both 3y and 5y
    await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      'ret1', 'R', 'ret.example', 'UTC', 'EUR', 'ml_' + 'd'.repeat(32), now,
    ).run();
    await db.prepare('INSERT INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind('ret1', 'vis-old', old).run();
    await db.prepare("INSERT INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, source, channel) VALUES (?, ?, ?, ?, ?, 'direct', 'direct')").bind('ret1', 'ses-old', 'vis-old', old, old).run();
    await db.prepare("INSERT INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, source, channel) VALUES (?, ?, ?, ?, ?, 'direct', 'direct')").bind('ret1', 'ses-new', 'vis-old', now, now).run();
    await db.prepare("INSERT INTO events (site_id, session_id, visitor_id, ts, type, path) VALUES ('ret1', 'ses-old', 'vis-old', ?, 'pageview', '/')").bind(old).run();
    await db.prepare("INSERT INTO events (site_id, session_id, visitor_id, ts, type, path) VALUES ('ret1', 'ses-new', 'vis-old', ?, 'pageview', '/')").bind(now).run();
    await db.prepare("INSERT INTO bot_hits (site_id, ts, bot, operator, category, source) VALUES ('ret1', ?, 'GPTBot', 'OpenAI', 'search', 'forward')").bind(old).run();
    await db.prepare("INSERT INTO bot_hits (site_id, ts, bot, operator, category, source) VALUES ('ret1', ?, 'GPTBot', 'OpenAI', 'search', 'forward')").bind(now).run();
    await db.prepare("INSERT INTO auth_sessions (id, user_id, expires_at, last_seen_at, revoked_at, created_at) VALUES ('dead1', 'owner', ?, ?, NULL, ?)").bind(now - 1000, now - 2000, now - 2000).run();
    await db.prepare("INSERT INTO notifications (id, site_id, kind, title, ts, read_at) VALUES ('n-old', 'ret1', 'report', 'old', ?, ?)").bind(now - NOTIF_READ_RETENTION_MS - 1000, now - NOTIF_READ_RETENTION_MS - 1000).run();
    await db.prepare("INSERT INTO notifications (id, site_id, kind, title, ts, read_at) VALUES ('n-unread', 'ret1', 'report', 'unread', ?, NULL)").bind(now - NOTIF_READ_RETENTION_MS - 1000).run();

    const stats = await purgeExpiredData(db as any, now);
    expect(stats.events).toBeGreaterThanOrEqual(1);
    expect(stats.sessions).toBeGreaterThanOrEqual(1);
    expect(stats.bot_hits).toBeGreaterThanOrEqual(1);
    expect(stats.auth_sessions).toBeGreaterThanOrEqual(1);
    expect(stats.notifications).toBeGreaterThanOrEqual(1);
    expect(stats.retentionYears).toBeGreaterThanOrEqual(3);

    expect((await db.prepare("SELECT COUNT(*) AS n FROM events WHERE site_id = 'ret1' AND ts = ?").bind(old).first<{ n: number }>())?.n).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM events WHERE site_id = 'ret1' AND ts = ?").bind(now).first<{ n: number }>())?.n).toBe(1);
    expect((await db.prepare("SELECT id FROM sessions WHERE site_id = 'ret1' AND id = 'ses-old'").first())).toBeNull();
    expect((await db.prepare("SELECT id FROM sessions WHERE site_id = 'ret1' AND id = 'ses-new'").first())?.id).toBe('ses-new');
    expect((await db.prepare("SELECT id FROM notifications WHERE id = 'n-old'").first())).toBeNull();
    expect((await db.prepare("SELECT id FROM notifications WHERE id = 'n-unread'").first())?.id).toBe('n-unread');
  });
});

describe('soft quota notifications', () => {
  it('notifies once at 80% and again at 100%, without blocking further inserts', async () => {
    const now = Date.now();
    await db.prepare("INSERT INTO app_settings (key, value) VALUES ('plan', 'starter') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
    const site = await db.prepare("SELECT * FROM sites WHERE id = 'ret1'").first<any>();
    expect(site).toBeTruthy();
    // 8000 events = 80% of 10k. Insert via a single generate_series for speed.
    await (db as any).pg.query(
      `INSERT INTO events (site_id, session_id, visitor_id, ts, type, path)
       SELECT 'ret1', 'ses-new', 'vis-old', $1, 'pageview', '/' FROM generate_series(1, 8000)`,
      [now],
    );
    const first = await maybeQuotaNotifications(db as any, [site], now);
    expect(first.notified).toBe('80');
    expect(first.used).toBeGreaterThanOrEqual(8000);
    const again = await maybeQuotaNotifications(db as any, [site], now);
    expect(again.notified).toBe('80');
    const n80 = await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE site_id = 'ret1' AND dedupe = ?").bind(`quota:80:${new Date(now).toISOString().slice(0, 7)}`).first<{ n: number }>();
    expect(n80?.n).toBe(1);

    await (db as any).pg.query(
      `INSERT INTO events (site_id, session_id, visitor_id, ts, type, path)
       SELECT 'ret1', 'ses-new', 'vis-old', $1, 'pageview', '/' FROM generate_series(1, 2500)`,
      [now],
    );
    const full = await maybeQuotaNotifications(db as any, [site], now);
    expect(full.notified).toBe('100');
    expect(full.used).toBeGreaterThanOrEqual(10_000);
    // Soft quota: events above the limit stay stored.
    const kept = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE site_id = 'ret1'").first<{ n: number }>();
    expect(Number(kept?.n)).toBeGreaterThan(10_000);
  });
});

describe('mapBudget', () => {
  it('caps concurrency and stops when the time budget is exhausted', async () => {
    const items = [1, 2, 3, 4, 5];
    const seen: number[] = [];
    const ran = await mapBudget(items, 2, 30, async (n) => {
      seen.push(n);
      await new Promise((r) => setTimeout(r, 20));
      return n;
    }, Date.now());
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length + ran.remaining).toBe(items.length);
  });
});

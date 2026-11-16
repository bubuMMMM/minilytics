import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { SITE_DATA_TABLES } from '../src/worker/site-data';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
let db: PgliteD1;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env() as any);

beforeAll(async () => {
  db = await makeDb();
}, 60_000);

async function loginCookie() {
  const r = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.8.0.1' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  expect(r.status).toBe(200);
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}

describe('site deletion', () => {
  it('includes videos, x_posts and x_sync and removes them in the same batch', async () => {
    expect(SITE_DATA_TABLES).toEqual(expect.arrayContaining(['videos', 'x_posts', 'x_sync']));
    const now = Date.now();
    await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      'delorphan1', 'Gone', 'gone.example', 'UTC', 'EUR', 'ml_' + 'c'.repeat(32), now,
    ).run();
    await db.prepare('INSERT INTO videos (site_id, id, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)').bind('delorphan1', 'vid1', 'A video', now, now).run();
    await db.prepare('INSERT INTO x_posts (site_id, id, created_at, fetched_at, likes, reposts, replies, quotes, bookmarks, impressions) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0)').bind('delorphan1', 'xp1', now, now).run();
    await db.prepare('INSERT INTO x_sync (site_id, synced_at, ok, found) VALUES (?, ?, 1, 0)').bind('delorphan1', now).run();

    const cookie = await loginCookie();
    const del = await call('/api/sites/delorphan1', { method: 'DELETE', headers: { cookie, origin: ORIGIN } });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });

    expect((await db.prepare('SELECT id FROM sites WHERE id = ?').bind('delorphan1').first()) ).toBeNull();
    expect((await db.prepare('SELECT id FROM videos WHERE site_id = ?').bind('delorphan1').first()) ).toBeNull();
    expect((await db.prepare('SELECT id FROM x_posts WHERE site_id = ?').bind('delorphan1').first()) ).toBeNull();
    expect((await db.prepare('SELECT site_id FROM x_sync WHERE site_id = ?').bind('delorphan1').first()) ).toBeNull();
  });

  it('the orphan-cleanup migration removes leftover videos / X rows of a missing site', async () => {
    // Simulate the pre-fix state: rows without a sites parent.
    const now = Date.now();
    await db.prepare('INSERT INTO videos (site_id, id, title, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)').bind('missing-site', 'vid2', 'Orphan', now, now).run();
    await db.prepare('INSERT INTO x_posts (site_id, id, created_at, fetched_at, likes, reposts, replies, quotes, bookmarks, impressions) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0)').bind('missing-site', 'xp2', now, now).run();
    await db.prepare('INSERT INTO x_sync (site_id, synced_at, ok, found) VALUES (?, ?, 1, 1)').bind('missing-site', now).run();

    await db.prepare('DELETE FROM videos v WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = v.site_id)').run();
    await db.prepare('DELETE FROM x_posts p WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = p.site_id)').run();
    await db.prepare('DELETE FROM x_sync x WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = x.site_id)').run();

    expect((await db.prepare('SELECT id FROM videos WHERE site_id = ?').bind('missing-site').first()) ).toBeNull();
    expect((await db.prepare('SELECT id FROM x_posts WHERE site_id = ?').bind('missing-site').first()) ).toBeNull();
    expect((await db.prepare('SELECT site_id FROM x_sync WHERE site_id = ?').bind('missing-site').first()) ).toBeNull();
  });
});

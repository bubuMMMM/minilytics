import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { ingest } from '../src/worker/collect';
import { replay } from '../src/worker/replay';
import type { Site } from '../src/worker/env';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'replay test password';
const site: Site = { id: 'site_replay', name: 'Replay', domain: 'replay.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k_replay', dodo_webhook_secret: null, created_at: 0 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let db: PgliteD1;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env() as any);
const NOW = Date.now();

beforeAll(async () => {
  db = await makeDb();
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  const send = (b: any, geo: any, at: number) => ingest(db as unknown as D1Database, site, { w: site.id, sw: 1440, ...b }, new URL(b.u), UA, geo, at);
  await send({ t: 'pageview', u: 'https://replay.test/old', vid: 'v_old', sid: 's_old' }, { country: 'DE', region: 'BE', city: 'Berlin' }, NOW - 3 * 3_600_000);
  await send({ t: 'pageview', u: 'https://replay.test/a', r: 'https://news.ycombinator.com/', vid: 'v_a', sid: 's_a' }, { country: 'FR', region: 'IDF', city: 'Paris', latitude: '48.85', longitude: '2.35' }, NOW - 20 * 60_000);
  await send({ t: 'pageview', u: 'https://replay.test/b', vid: 'v_b', sid: 's_b' }, { country: 'US', region: 'CA', city: 'San Francisco' }, NOW - 5 * 60_000);
  await send({ t: 'identify', u: 'https://replay.test/b', vid: 'v_b', sid: 's_b', p: { user_id: 'u1', name: 'Ada Lovelace', email: 'Ada@Example.com' } }, { country: 'US' }, NOW - 4 * 60_000);
}, 60_000);

describe('replay', () => {
  it('returns the 30 min window oldest first with place, source and identity', async () => {
    const r = await replay(db as unknown as D1Database, site.id, '30m', NOW);
    expect(r.to - r.from).toBe(30 * 60_000);
    expect(r.visits.map((v) => v.page)).toEqual(['/a', '/b']);
    expect(r.visits[0]).toMatchObject({ country: 'FR', city: 'Paris', referrer: 'news.ycombinator.com' });
    expect(r.visits[0].t).toBeLessThan(r.visits[1].t);
    expect(r.visits[1]).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });
  it('24h window includes older visits', async () => {
    const r = await replay(db as unknown as D1Database, site.id, '24h', NOW);
    expect(r.visits.map((v) => v.page)).toEqual(['/old', '/a', '/b']);
  });
  it('is admin only', async () => {
    const r = await call(`/api/sites/${site.id}/replay?window=24h`);
    expect(r.status).toBe(401);
  });
});

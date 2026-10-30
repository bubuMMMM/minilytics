import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { originAllowed } from '../src/worker/collect';
import { clientIp, cookieSecure, ipBucket, isCrossSite, RateLimiter } from '../src/worker/lib/security';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
let db: PgliteD1;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}, e: Record<string, unknown> = env()) =>
  app.fetch(new Request(ORIGIN + path, init), e as any);
const login = (password: string, headers: Record<string, string> = {}) =>
  call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: JSON.stringify({ password }) });
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];

beforeAll(async () => {
  db = await makeDb();
}, 60_000);

describe('client IP', () => {
  const h = (o: Record<string, string>) => (n: string) => o[n];
  it('ignores a client-sent cf-connecting-ip outside Cloudflare', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '1.2.3.4' }), false)).toBe('1.2.3.4');
    expect(clientIp(h({ 'cf-connecting-ip': '6.6.6.6', 'x-real-ip': '1.2.3.4' }), false)).toBe('1.2.3.4');
  });
  it('uses cf-connecting-ip on Cloudflare', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '1.2.3.4' }), true)).toBe('6.6.6.6');
  });
  it('buckets IPv6 by /64', () => {
    expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('1.2.3.4')).toBe('1.2.3.4');
  });
});

describe('CSRF / cookies helpers', () => {
  const h = (o: Record<string, string>) => (n: string) => o[n];
  it('flags cross-site writes only', () => {
    expect(isCrossSite('POST', h({ origin: 'https://evil.example' }), ORIGIN + '/api/sites')).toBe(true);
    expect(isCrossSite('POST', h({ 'sec-fetch-site': 'cross-site' }), ORIGIN + '/api/sites')).toBe(true);
    expect(isCrossSite('POST', h({ origin: 'null' }), ORIGIN + '/api/sites')).toBe(true);
    expect(isCrossSite('POST', h({ origin: ORIGIN, 'sec-fetch-site': 'same-origin' }), ORIGIN + '/api/sites')).toBe(false);
    expect(isCrossSite('GET', h({ origin: 'https://evil.example' }), ORIGIN + '/api/sites')).toBe(false);
    expect(isCrossSite('DELETE', h({}), ORIGIN + '/api/sites/x')).toBe(false); // curl / server-to-server
  });
  it('always sets Secure except on http://localhost', () => {
    expect(cookieSecure('https://x.vercel.app/api/auth/login')).toBe(true);
    expect(cookieSecure('http://x.vercel.app/api/auth/login')).toBe(true);
    expect(cookieSecure('http://localhost:5173/api/auth/login')).toBe(false);
  });
});

describe('rate limiter', () => {
  it('blocks after the limit and resets with the window', () => {
    const rl = new RateLimiter(2, 1000);
    expect([rl.allow('a', 0), rl.allow('a', 1), rl.allow('a', 2), rl.allow('b', 2)]).toEqual([true, true, false, true]);
    expect(rl.allow('a', 1001)).toBe(true);
  });
});

describe('tracker origin', () => {
  it('accepts the site and its subdomains, rejects other sites', () => {
    expect(originAllowed(undefined, 'n0.pub')).toBe(true);
    expect(originAllowed('https://n0.pub', 'n0.pub')).toBe(true);
    expect(originAllowed('https://www.n0.pub', 'n0.pub')).toBe(true);
    expect(originAllowed('https://evil.example', 'n0.pub')).toBe(false);
    expect(originAllowed('null', 'n0.pub')).toBe(false);
  });
});

describe('login and session (PGlite)', () => {
  it('rejects a wrong password and a non-string password', async () => {
    expect((await login('nope', { 'x-real-ip': '10.0.0.1' })).status).toBe(401);
    const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.0.0.1' }, body: '{"password":["x"]}' });
    expect(r.status).toBe(401);
  });

  it('issues a Secure, HttpOnly, SameSite=Strict cookie that grants access', async () => {
    const r = await login(PASSWORD, { 'x-real-ip': '10.0.0.2' });
    expect(r.status).toBe(200);
    const sc = r.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/Secure/);
    expect(sc).toMatch(/SameSite=Strict/);
    const me = await call('/api/auth/me', { headers: { cookie: cookieOf(r) } });
    expect(await me.json()).toEqual({ loggedIn: true });
    const sites = await call('/api/sites', { headers: { cookie: cookieOf(r) } });
    expect(sites.status).toBe(200);
    expect(sites.headers.get('cache-control')).toBe('private, no-store');
    expect(sites.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('logs every session out when the admin password changes', async () => {
    const cookie = cookieOf(await login(PASSWORD, { 'x-real-ip': '10.0.0.3' }));
    const me = await call('/api/auth/me', { headers: { cookie } }, { ...env(), ADMIN_PASSWORD: 'a new password' });
    expect(await me.json()).toEqual({ loggedIn: false });
  });

  it('rejects a forged cookie', async () => {
    const me = await call('/api/auth/me', { headers: { cookie: `ml_auth=admin.${Date.now() + 1e9}.AAAA` } });
    expect(await me.json()).toEqual({ loggedIn: false });
  });

  it('blocks cross-site writes even with a valid cookie', async () => {
    const cookie = cookieOf(await login(PASSWORD, { 'x-real-ip': '10.0.0.4' }));
    const r = await call('/api/sites', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example', 'content-type': 'text/plain' },
      body: JSON.stringify({ domain: 'evil.example' }),
    });
    expect(r.status).toBe(403);
  });

  it('locks out after 10 failures even when cf-connecting-ip is spoofed on every try', async () => {
    for (let i = 0; i < 10; i++) await login('wrong', { 'x-real-ip': '10.9.9.9', 'cf-connecting-ip': `7.7.7.${i}` });
    const r = await login(PASSWORD, { 'x-real-ip': '10.9.9.9', 'cf-connecting-ip': '8.8.8.8' });
    expect(r.status).toBe(429);
  }, 30_000);
});

describe('public API (PGlite)', () => {
  it('404s private sites and caches public aggregates at the CDN', async () => {
    await db.prepare("INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at, is_public) VALUES ('privsite1', 'p', 'p.example', 'UTC', 'EUR', 'ml_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 0, 0)").run();
    expect((await call('/api/public/demo?site=privsite1')).status).toBe(404);
    expect((await call('/api/public/videos?site=privsite1')).status).toBe(404);
    expect((await call('/api/public/engagement?site=privsite1')).status).toBe(404);
    expect((await call('/api/public/live-globe?site=privsite1')).status).toBe(404);
    const ok = await call('/api/public/demo');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toMatch(/s-maxage=\d+/);
    const sites = (await (await call('/api/public/sites')).json()) as { id: string }[];
    expect(sites.map((s) => s.id)).not.toContain('privsite1');
    expect(JSON.stringify(sites)).not.toMatch(/api_key|ml_[a-z0-9]{32}/);
  });

  it('refuses the public demo placeholder API key', async () => {
    await call('/api/public/demo'); // provisions the demo site
    const r = await call('/api/v1/payments', {
      method: 'POST',
      headers: { authorization: 'Bearer ml_public_demo_no_api_access', 'content-type': 'application/json' },
      body: JSON.stringify({ transaction_id: 'x', amount: 1000 }),
    });
    expect(r.status).toBe(401);
  });

  it('rejects unknown breakdown dimensions such as inherited object keys', async () => {
    const cookie = cookieOf(await login(PASSWORD, { 'x-real-ip': '10.0.0.5' }));
    for (const dim of ['constructor', 'toString', '__proto__']) {
      const r = await call(`/api/sites/privsite1/breakdown?dim=${dim}`, { headers: { cookie } });
      expect(r.status).toBe(400);
    }
  });
});

describe('ingestion (PGlite)', () => {
  const event = (origin?: string, extra: Record<string, string> = {}) =>
    call('/api/event', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36',
        ...(origin ? { origin } : {}),
        ...extra,
      },
      body: JSON.stringify({ w: 'privsite1', t: 'pageview', u: 'https://p.example/', vid: 'visitor0001', sid: 'session0001' }),
    });
  it('accepts events from the site and rejects other origins', async () => {
    expect((await event('https://p.example', { 'x-real-ip': '10.1.0.1' })).status).toBe(202);
    expect((await event('https://evil.example', { 'x-real-ip': '10.1.0.1' })).status).toBe(403);
  });
  it('rejects oversized bodies before reading them', async () => {
    const r = await call('/api/event', { method: 'POST', headers: { 'content-length': '100000' }, body: 'x'.repeat(100000) });
    expect(r.status).toBe(413);
  });
  it('rate limits a flooding client', async () => {
    let last = 0;
    for (let i = 0; i < 245; i++) last = (await call('/api/event', { method: 'POST', headers: { 'x-real-ip': '10.2.0.1' }, body: '{}' })).status;
    expect(last).toBe(429);
  }, 30_000);
});

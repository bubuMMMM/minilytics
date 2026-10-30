import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { ingest } from '../src/worker/collect';
import { allowedFor, parseHide, parseViews, stripRevenue } from '../src/worker/share';
import { dotMapSvg, widgetOpts } from '../src/worker/widgets';
import type { Site } from '../src/worker/env';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
const site: Site = { id: 'site_share', name: 'Partage', domain: 'share.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k_share', dodo_webhook_secret: null, created_at: 0 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let db: PgliteD1;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env() as any);
let cookie = '';
const authed = (path: string, init: RequestInit & { json?: unknown } = {}) =>
  call(path, {
    ...init,
    headers: { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
const json = async (r: Response) => ({ status: r.status, body: await r.json() as any });

beforeAll(async () => {
  db = await makeDb();
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  const now = Date.now() - 60_000;
  const send = (b: any, geo: any) => ingest(db as unknown as D1Database, site, { w: site.id, sw: 1440, ...b }, new URL(b.u), UA, geo, now);
  await send({ t: 'pageview', u: 'https://share.test/', r: 'https://www.google.com/search?q=secret', vid: 'visitor_s1', sid: 'session_s1' }, { country: 'FR', region: 'IDF', city: 'Paris' });
  await send({ t: 'pageview', u: 'https://share.test/blog', vid: 'visitor_s2', sid: 'session_s2' }, { country: 'US', region: 'CA', city: 'San Francisco' });
  await db.prepare("INSERT INTO payments (id, site_id, provider, ts, amount, currency, kind, visitor_id, session_id, renewal) VALUES ('pay_1', ?, 'api', ?, 4900, 'EUR', 'payment', 'visitor_s1', 'session_s1', 0)").bind(site.id, now).run();
  const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ password: PASSWORD }) });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
}, 60_000);

describe('share: rules', () => {
  it('normalises views and hide flags (overview always on, safe defaults)', () => {
    expect(parseViews(['pages', 'bogus'])).toEqual(['overview', 'pages']);
    expect(parseHide({})).toEqual({ revenue: true, cities: false, referrers: true });
    const a = allowedFor(['overview', 'sources', 'map'], { revenue: true, cities: true, referrers: true });
    expect(a.dims.has('channel')).toBe(true);
    expect(a.dims.has('referrer')).toBe(false);
    expect(a.dims.has('city')).toBe(false);
    expect(a.filters.has('region')).toBe(false);
    expect(a.dims.has('page')).toBe(false);
  });
  it('strips revenue recursively and drops revenue-only rows', () => {
    const out = stripRevenue({ current: { visitors: 3, revenue: 4900, conversionRate: 0.3 }, rows: [{ label: 'a', visitors: 0, revenue: 10 }, { label: 'b', visitors: 2, revenue: 5, customers: 1 }] });
    expect(out).toEqual({ current: { visitors: 3, revenue: 0, conversionRate: 0 }, rows: [{ label: 'b', visitors: 2, revenue: 0, customers: 0 }] });
    // Empty chart buckets stay: the curve keeps its days.
    expect(stripRevenue({ series: [{ bucket: 'd1', visitors: 0, revenue: 0 }, { bucket: 'd2', visitors: 1, revenue: 9 }] }).series).toHaveLength(2);
  });
});

describe('share: links end to end', () => {
  let link: any;
  it('creates a link with defaults (revenue hidden) and counts views', async () => {
    const c = await json(await authed(`/api/sites/${site.id}/shares`, { method: 'POST', json: { label: 'Investisseurs' } }));
    expect(c.status).toBe(201);
    link = c.body;
    expect(link.views).toEqual(['overview', 'sources', 'pages', 'map', 'tech']);
    expect(link.hide.revenue).toBe(true);
    expect(link.token).toMatch(/^[\w-]{20,}$/);
    const m = await call(`/api/share/${link.token}`);
    expect(m.headers.get('x-robots-tag')).toContain('noindex');
    const meta = await m.json() as any;
    expect(meta.locked).toBe(false);
    expect(meta.site).toMatchObject({ name: 'Partage', domain: 'share.test' });
    expect(JSON.stringify(meta)).not.toContain('k_share'); // no API key
    await call(`/api/share/${link.token}`);
    const list = await json(await authed(`/api/sites/${site.id}/shares`));
    expect(list.body[0].viewCount).toBe(2);
  });
  it('serves aggregates with revenue removed and enforces views server-side', async () => {
    const o = await json(await call(`/api/share/${link.token}/overview?period=today`));
    expect(o.status).toBe(200);
    expect(o.body.current.visitors).toBe(2);
    expect(o.body.current.revenue).toBe(0);
    expect(JSON.stringify(o.body)).not.toContain('4900');
    expect((await call(`/api/share/${link.token}/breakdown?period=today&dim=goal`)).status).toBe(403); // goals not shared
    expect((await call(`/api/share/${link.token}/breakdown?period=today&dim=referrer`)).status).toBe(403); // full referrer URLs hidden
    const pages = await json(await call(`/api/share/${link.token}/breakdown?period=today&dim=page`));
    expect(pages.body.map((r: any) => r.label).sort()).toEqual(['/', '/blog']);
    expect(pages.body.every((r: any) => r.revenue === 0)).toBe(true);
    const filters = encodeURIComponent(JSON.stringify({ goal: 'signup' }));
    expect((await call(`/api/share/${link.token}/overview?period=today&filters=${filters}`)).status).toBe(403);
    const ok = encodeURIComponent(JSON.stringify({ country: 'FR' }));
    expect((await json(await call(`/api/share/${link.token}/overview?period=today&filters=${ok}`))).body.current.visitors).toBe(1);
    // No visitor-level endpoint exists under /api/share.
    expect((await call(`/api/share/${link.token}/visitors`)).status).toBe(404);
  });
  it('hides cities when asked (map + breakdown)', async () => {
    await authed(`/api/sites/${site.id}/shares/${link.id}`, { method: 'PATCH', json: { hide: { revenue: true, cities: true, referrers: true } } });
    expect((await call(`/api/share/${link.token}/breakdown?period=today&dim=city`)).status).toBe(403);
    const map = await json(await call(`/api/share/${link.token}/map?period=today`));
    expect(map.body.cityLevel).toBe(false);
    expect(map.body.places).toEqual([]);
    expect(JSON.stringify(map.body)).not.toContain('San Francisco');
  });
  it('password: locked until unlocked, wrong attempts rate-limited', async () => {
    await authed(`/api/sites/${site.id}/shares/${link.id}`, { method: 'PATCH', json: { password: 'sesame-ouvre-toi' } });
    const meta = await json(await call(`/api/share/${link.token}`));
    expect(meta.body).toMatchObject({ locked: true, site: { name: 'Partage' } });
    expect(meta.body.views).toBeUndefined();
    expect((await call(`/api/share/${link.token}/overview?period=today`)).status).toBe(401);
    const bad = () => call(`/api/share/${link.token}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ password: 'nope' }) });
    for (let i = 0; i < 5; i++) expect((await bad()).status).toBe(401);
    expect((await bad()).status).toBe(429); // per-IP limit
    const good = await call(`/api/share/${link.token}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' }, body: JSON.stringify({ password: 'sesame-ouvre-toi' }) });
    expect(good.status).toBe(200);
    const set = good.headers.get('set-cookie') ?? '';
    expect(set).toContain('HttpOnly');
    expect(set).toContain(`Path=/api/share/${link.token}`);
    const shareCookie = set.split(';')[0];
    expect((await call(`/api/share/${link.token}/overview?period=today`, { headers: { cookie: shareCookie } })).status).toBe(200);
    // Changing the password invalidates existing unlock cookies.
    await authed(`/api/sites/${site.id}/shares/${link.id}`, { method: 'PATCH', json: { password: 'autre-secret' } });
    expect((await call(`/api/share/${link.token}/overview?period=today`, { headers: { cookie: shareCookie } })).status).toBe(401);
    // Persistent per-link limit (10 failures / 15 min) survives isolates.
    await db.prepare('UPDATE share_links SET fail_count = 10, fail_window = ? WHERE id = ?').bind(Date.now(), link.id).run();
    const locked = await call(`/api/share/${link.token}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.55' }, body: JSON.stringify({ password: 'autre-secret' }) });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
  }, 60_000);
  it('expiry, regeneration and revocation', async () => {
    await authed(`/api/sites/${site.id}/shares/${link.id}`, { method: 'PATCH', json: { password: null } });
    await db.prepare('UPDATE share_links SET expires_at = ? WHERE id = ?').bind(Date.now() - 1, link.id).run();
    expect((await call(`/api/share/${link.token}`)).status).toBe(410);
    expect((await call(`/api/share/${link.token}/overview`)).status).toBe(410);
    const re = await json(await authed(`/api/sites/${site.id}/shares/${link.id}`, { method: 'PATCH', json: { expiresAt: null, regenerate: true } }));
    expect(re.body.token).not.toBe(link.token);
    expect((await call(`/api/share/${link.token}`)).status).toBe(404);
    expect((await call(`/api/share/${re.body.token}`)).status).toBe(200);
    expect((await authed(`/api/sites/${site.id}/shares`, { method: 'POST', json: { expiresAt: Date.now() - 5 } })).status).toBe(400);
    await authed(`/api/sites/${site.id}/shares/${link.id}`, { method: 'DELETE' });
    expect((await call(`/api/share/${re.body.token}`)).status).toBe(404);
    expect((await json(await authed(`/api/sites/${site.id}/shares`))).body).toEqual([]);
  });
  it('management needs a logged-in admin', async () => {
    expect((await call(`/api/sites/${site.id}/shares`)).status).toBe(401);
    expect((await call(`/api/sites/${site.id}/widgets`, { method: 'POST' })).status).toBeGreaterThanOrEqual(401);
  });
});

describe('widgets', () => {
  it('serves only aggregates, embeddable anywhere, and dies with its token', async () => {
    expect((await call('/api/widget/wxxxxxxxxxxxxxxxxxxxx/data')).status).toBe(404);
    const { body: w } = await json(await authed(`/api/sites/${site.id}/widgets`, { method: 'POST' }));
    expect(w.token).toMatch(/^w/);
    const d = await call(`/api/widget/${w.token}/data?period=today`);
    expect(d.headers.get('access-control-allow-origin')).toBe('*');
    expect(d.headers.get('cache-control')).toContain('s-maxage');
    const data = await d.json() as any;
    expect(Object.keys(data).sort()).toEqual(['countries', 'online', 'pages', 'pageviews', 'period', 'previousVisitors', 'series', 'site', 'visitors']);
    expect(data.visitors).toBe(2);
    expect(data.online).toBe(2);
    expect(JSON.stringify(data)).not.toMatch(/visitor_s1|session_s1|San Francisco|4900|k_share/);
    const e = await call(`/api/widget/${w.token}/embed?type=chart&theme=dark&accent=ff0055&locale=en&period=today`);
    expect(e.status).toBe(200);
    expect(e.headers.get('x-frame-options')).toBeNull();
    expect(e.headers.get('content-security-policy')).toContain('frame-ancestors *');
    const html = await e.text();
    expect(html).toContain('#ff0055');
    expect(html).toContain('Visitors');
    const live = await (await call(`/api/widget/${w.token}/embed?type=live`)).text();
    expect(live).toContain('2 personnes en ligne');
    const b = await call(`/api/widget/${w.token}/badge.svg?type=visitors&period=today`);
    expect(b.headers.get('content-type')).toContain('image/svg+xml');
    expect(await b.text()).toContain('visiteurs');
    // The dashboard API keeps its anti-framing headers.
    expect((await call(`/api/share/nope-nope-nope-nope-nope`)).headers.get('x-frame-options')).toBe('SAMEORIGIN');
    const re = await json(await authed(`/api/sites/${site.id}/widgets`, { method: 'POST' }));
    expect((await call(`/api/widget/${w.token}/data`)).status).toBe(404);
    await authed(`/api/sites/${site.id}/widgets`, { method: 'DELETE' });
    expect((await call(`/api/widget/${re.body.token}/data`)).status).toBe(404);
  });
  it('validates options and draws the dot map', () => {
    expect(widgetOpts({ accent: 'javascript:', type: 'evil', theme: 'x' })).toMatchObject({ accent: '#2563eb', type: 'live', theme: 'auto' });
    const svg = dotMapSvg([{ country: 'FR', visitors: 3 }, { country: 'SG', visitors: 1 }], '#2563eb');
    expect((svg.match(/fill="#2563eb"/g) ?? []).length).toBeGreaterThan(2);
  });
});

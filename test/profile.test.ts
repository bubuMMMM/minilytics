import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { parseSlug, parseSocials, parseWidgets, RESERVED_SLUGS, safeHttpsUrl, ogSvg } from '../src/worker/profile';
import { visitorPersona } from '../src/shared/persona';
import type { Site } from '../src/worker/env';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';
import { widgetOpts, renderWidget, WIDGET_STYLES } from '../src/worker/widgets';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
const site: Site = { id: 'site_page', name: 'Page', domain: 'page.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k_page', dodo_webhook_secret: null, created_at: 0 };
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
  const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ password: PASSWORD }) });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
}, 60_000);

describe('persona', () => {
  it('is stable and has no raw id in the name', () => {
    const a = visitorPersona('vid_abc');
    const b = visitorPersona('vid_abc');
    expect(a.name).toBe(b.name);
    expect(a.initials).toHaveLength(2);
    expect(a.name.toLowerCase()).not.toContain('vid_abc');
    expect(visitorPersona('other').name).not.toBe(a.name);
  });
});

describe('profile validation', () => {
  it('rejects reserved or malformed slugs and private URLs', () => {
    expect(parseSlug('Admin')).toBeNull();
    expect(RESERVED_SLUGS.has('login')).toBe(true);
    expect(parseSlug('ok')).toBe('ok');
    expect(parseSlug('a')).toBeNull();
    expect(safeHttpsUrl('http://example.com/x')).toBeNull();
    expect(safeHttpsUrl('https://127.0.0.1/x')).toBeNull();
    expect(safeHttpsUrl('https://example.com/photo.png')).toMatch(/^https:\/\/example.com/);
    expect((parseSocials([{ network: 'x', url: 'https://x.com/bulent' }]) as any)[0].network).toBe('x');
    expect((parseSocials([{ network: 'x', url: 'https://evil.com/x' }]) as any).error).toBeTruthy();
    expect((parseWidgets([{ siteId: 'site_page', type: 'live', style: 'glass' }]) as any)[0].style).toBe('glass');
    expect((parseWidgets([{ siteId: 'site_page', type: 'revenue' }]) as any).error).toBeTruthy();
  });
});

describe('profile pages', () => {
  it('is unpublished by default, 404 for anonymous, 200 after publish, 404 after revoke', async () => {
    expect((await json(await call('/api/public/page/bulent'))).status).toBe(404);
    const put = await json(await authed('/api/me/page', { method: 'PUT', json: {
      slug: 'bulent', title: 'Bülent', bio: 'Bonjour.', socials: [{ network: 'x', url: 'https://x.com/im_bulent' }],
      widgets: [{ siteId: site.id, type: 'live', style: 'glass' }], theme: 'light', layout: 'stacked', accent: '16a34a',
    } }));
    expect(put.status).toBe(200);
    expect(put.body.page.published).toBe(false);
    expect((await json(await call('/api/public/page/bulent'))).status).toBe(404);
    const pub = await json(await authed('/api/me/page/publish', { method: 'POST', json: { published: true } }));
    expect(pub.body.page.published).toBe(true);
    const open = await json(await call('/api/public/page/bulent'));
    expect(open.status).toBe(200);
    expect(open.body.title).toBe('Bülent');
    expect(JSON.stringify(open.body)).not.toContain('k_page');
    expect(open.body.widgets[0].type).toBe('live');
    const html = await call('/api/u/bulent');
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain('og:title');
    expect(text).toContain('Bülent');
    expect(text).toContain('/api/public/page/bulent/og.png');
    expect(text).toContain('og:image:type');
    const og = await call('/api/public/page/bulent/og.svg');
    expect(og.status).toBe(200);
    expect(og.headers.get('content-type')).toMatch(/svg/);
    expect(ogSvg(pub.body.page)).toContain('Bülent');
    const png = await call('/api/public/page/bulent/og.png');
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toMatch(/image\/png/);
    const bytes = Buffer.from(await png.arrayBuffer());
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    const w = await call('/api/public/page/bulent/widget/0');
    expect(w.status).toBe(200);
    const whtml = await w.text();
    expect(whtml).toContain('backdrop-filter');
    const off = await json(await authed('/api/me/page/publish', { method: 'POST', json: { published: false } }));
    expect(off.body.page.published).toBe(false);
    expect((await json(await call('/api/public/page/bulent'))).status).toBe(404);
    expect((await call('/api/u/bulent')).status).toBe(404);
    expect((await call('/api/public/page/bulent/widget/0')).status).toBe(404);
    expect((await call('/api/public/page/bulent/og.svg')).status).toBe(404);
    expect((await call('/api/public/page/bulent/og.png')).status).toBe(404);
  });
  it('rejects a widget for a site the owner does not have', async () => {
    const r = await json(await authed('/api/me/page', { method: 'PUT', json: {
      slug: 'bulent', title: 'Bülent', widgets: [{ siteId: 'nope-site-xxxx', type: 'live' }],
    } }));
    expect(r.status).toBe(400);
  });
});

describe('widget styles', () => {
  it('defaults to classic and accepts the six styles', () => {
    expect(widgetOpts({}).style).toBe('classic');
    expect(widgetOpts({ style: 'evil' }).style).toBe('classic');
    for (const style of WIDGET_STYLES) expect(widgetOpts({ style }).style).toBe(style);
    const html = renderWidget(widgetOpts({ type: 'counter', style: 'gradient', theme: 'light' }), {
      site: { name: 'Page', domain: 'page.test' }, period: '30d', online: 0, visitors: 3, pageviews: 5,
      previousVisitors: 2, series: [{ bucket: 'd1', visitors: 1 }, { bucket: 'd2', visitors: 3 }], pages: [], countries: [],
    }, ORIGIN, 'tok').html;
    expect(html).toContain('linear-gradient');
    expect(html).toContain('3');
  });
});

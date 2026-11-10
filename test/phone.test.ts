import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { ingest } from '../src/worker/collect';
import type { Site } from '../src/worker/env';
import { parseBoardItems } from '../src/worker/phone';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
const site: Site = { id: 'site_phone', name: 'Téléphone', domain: 'phone.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k_phone', dodo_webhook_secret: null, created_at: 0 };
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
const isPng = async (r: Response) => {
  const buf = new Uint8Array(await r.arrayBuffer());
  return r.status === 200 && r.headers.get('content-type') === 'image/png' && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf.byteLength > 800;
};

beforeAll(async () => {
  db = await makeDb();
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  const now = Date.now() - 60_000;
  const send = (b: any, geo: any) => ingest(db as unknown as D1Database, site, { w: site.id, sw: 1440, ...b }, new URL(b.u), UA, geo, now);
  await send({ t: 'pageview', u: 'https://phone.test/', vid: 'visitor_p1', sid: 'session_p1' }, { country: 'FR', region: 'IDF', city: 'Paris' });
  await send({ t: 'pageview', u: 'https://phone.test/blog', vid: 'visitor_p2', sid: 'session_p2' }, { country: 'US', region: 'CA', city: 'San Francisco' });
  const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ password: PASSWORD }) });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
}, 60_000);

describe('parseBoardItems', () => {
  it('accepts known types and styles, rejects revenue, badge, empty and overflow', () => {
    const ok = parseBoardItems([{ type: 'live', style: 'glass' }, { type: 'counter', accent: 'ff00aa' }]);
    expect(Array.isArray(ok) && ok).toMatchObject([{ type: 'live', style: 'glass' }, { type: 'counter', accent: 'ff00aa' }]);
    expect((parseBoardItems([{ type: 'revenue' }]) as any).error).toMatch(/ne peut pas/);
    expect((parseBoardItems([{ type: 'badge' }]) as any).error).toMatch(/ne peut pas/);
    expect((parseBoardItems([]) as any).error).toMatch(/au moins un/);
    expect((parseBoardItems(new Array(7).fill({ type: 'live' })) as any).error).toMatch(/Six/);
  });
});

describe('phone boards', () => {
  let board: any;

  it('requires a logged-in admin to manage boards', async () => {
    expect((await call(`/api/sites/${site.id}/phone-boards`)).status).toBeGreaterThanOrEqual(401);
    expect((await call(`/api/sites/${site.id}/phone-boards`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ items: [{ type: 'live' }] }) })).status).toBeGreaterThanOrEqual(401);
  });

  it('creates a board with a wp- token and lists it', async () => {
    const c = await json(await authed(`/api/sites/${site.id}/phone-boards`, { method: 'POST', json: { name: 'Accueil', items: [{ type: 'live', style: 'classic' }, { type: 'counter', style: 'gradient', period: 'today' }], theme: 'dark' } }));
    expect(c.status).toBe(201);
    board = c.body;
    expect(board.token).toMatch(/^wp[\w-]{15,40}$/);
    expect(board.url).toBe(`${ORIGIN}/w/${board.token}`);
    expect(board.items).toHaveLength(2);
    expect(JSON.stringify(board)).not.toContain(PASSWORD);
    expect(JSON.stringify(board)).not.toContain('k_phone');
    const list = await json(await authed(`/api/sites/${site.id}/phone-boards`));
    expect(list.body[0].token).toBe(board.token);
  });

  it('serves the public wall, data, manifest and Scriptable script', async () => {
    const html = await call(`/w/${board.token}`);
    expect(html.status).toBe(200);
    expect(html.headers.get('cache-control')).toMatch(/no-store/);
    expect(html.headers.get('x-robots-tag')).toContain('noindex');
    const page = await html.text();
    expect(page).toContain('apple-mobile-web-app-capable');
    expect(page).toContain(`/api/w/${board.token}/manifest.webmanifest`);
    expect(page).not.toContain(PASSWORD);
    expect(page).not.toContain('k_phone');

    const data = await json(await call(`/api/w/${board.token}/data`));
    expect(data.status).toBe(200);
    expect(data.body.site).toEqual({ name: 'Téléphone', domain: 'phone.test' });
    expect(data.body.items).toHaveLength(2);
    expect(data.body.items[0].data.visitors).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(data.body)).not.toContain('k_phone');
    expect(data.body.items[0].data.revenue).toBeUndefined();

    const man = await json(await call(`/api/w/${board.token}/manifest.webmanifest`));
    expect(man.status).toBe(200);
    expect(man.body.start_url).toBe(`/w/${board.token}`);
    expect(man.body.display).toBe('standalone');
    expect(man.body.icons.length).toBeGreaterThanOrEqual(2);

    const js = await call(`/api/w/${board.token}/scriptable.js`);
    expect(js.status).toBe(200);
    const script = await js.text();
    expect(script).toContain(`/api/w/${board.token}/data`);
    expect(script).not.toContain(PASSWORD);
    expect(script).not.toContain('k_phone');
  });

  it('renders real-data PNGs in phone sizes and a zip of several widgets', async () => {
    const medium = await call(`/api/w/${board.token}/png?size=medium`);
    expect(await isPng(medium)).toBe(true);
    expect(medium.headers.get('cache-control')).toMatch(/s-maxage=0/);
    const small = await call(`/api/w/${board.token}/png?size=small&i=0`);
    expect(await isPng(small)).toBe(true);
    const wall = await call(`/api/w/${board.token}/png?size=wallpaper`);
    expect(await isPng(wall)).toBe(true);
    const zip = await call(`/api/w/${board.token}/zip`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    const zbuf = new Uint8Array(await zip.arrayBuffer());
    expect(zbuf[0]).toBe(0x50);
    expect(zbuf[1]).toBe(0x4b);
    expect(zbuf.byteLength).toBeGreaterThan(2000);
  }, 60_000);

  it('also renders a PNG from the existing site embed token', async () => {
    const { body: w } = await json(await authed(`/api/sites/${site.id}/widgets`, { method: 'POST' }));
    const png = await call(`/api/widget/${w.token}/png?type=counter&size=medium&period=today`);
    expect(await isPng(png)).toBe(true);
    // Revoking the site embed token must not kill the phone board.
    await authed(`/api/sites/${site.id}/widgets`, { method: 'DELETE' });
    expect((await call(`/api/widget/${w.token}/png?size=small`)).status).toBe(404);
    expect((await call(`/api/w/${board.token}/data`)).status).toBe(200);
  }, 30_000);

  it('rejects an unknown token immediately and 404s after revocation', async () => {
    expect((await call('/w/wpshort')).status).toBe(404);
    expect((await call('/api/w/wpxxxxxxxxxxxxxxxxxx/data')).status).toBe(404);
    expect((await call(`/api/w/${board.token}xx/png`)).status).toBe(404);
    const del = await json(await authed(`/api/sites/${site.id}/phone-boards/${board.id}`, { method: 'DELETE' }));
    expect(del.status).toBe(200);
    expect((await call(`/w/${board.token}`)).status).toBe(404);
    expect((await call(`/api/w/${board.token}/data`)).status).toBe(404);
    expect((await call(`/api/w/${board.token}/png?size=medium`)).status).toBe(404);
    expect((await call(`/api/w/${board.token}/zip`)).status).toBe(404);
    expect((await call(`/api/w/${board.token}/scriptable.js`)).status).toBe(404);
    expect((await call(`/api/w/${board.token}/manifest.webmanifest`)).status).toBe(404);
    expect((await call(`/w/${board.token}`)).headers.get('cache-control')).toMatch(/no-store/);
  });
});

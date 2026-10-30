import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../src/worker/index';
import { cookielessIds, ingest } from '../src/worker/collect';
import { hmacBase64, hmacHex } from '../src/worker/lib/crypto';
import { parseKajabi, parsePaddle, parseShopify, parseWoo, verifyPaddle, verifyShopify } from '../src/worker/revenue';
import { convertMinor } from '../src/worker/fx';
import { hostAllowed, normalizeSettings } from '../src/worker/settings';
import { buildReport, checkTraffic, goalAlerts, notify } from '../src/worker/alerts';
import { syncGithub } from '../src/worker/connectors';
import { MCP_TOOLS } from '../src/worker/platform';
import { PLANS } from '../src/shared/plans';
import type { Site } from '../src/worker/env';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
const site: Site = { id: 'site_parity', name: 'p', domain: 'p.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'ml_' + 'a'.repeat(32), dodo_webhook_secret: null, created_at: 0 };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
let db: PgliteD1;
const D1 = () => db as unknown as D1Database;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env() as any);
let cookie = '';
const authed = (path: string, init: RequestInit & { json?: unknown } = {}) =>
  call(path, {
    ...init,
    headers: { cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
const loadSite = async () => (await db.prepare('SELECT * FROM sites WHERE id = ?').bind(site.id).first<Site>())!;

// Frankfurter stub: 1 USD = 0.9 EUR on every day; other hosts fail loudly.
const realFetch = globalThis.fetch;
const fxCalls: string[] = [];
beforeAll(async () => {
  globalThis.fetch = (async (input: any) => {
    const url = String(input?.url ?? input);
    if (url.startsWith('https://api.frankfurter.dev/')) {
      fxCalls.push(url);
      return new Response(JSON.stringify({ base: 'USD', date: '2026-10-29', rates: { EUR: 0.9, GBP: 0.8 } }), { headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected fetch ' + url);
  }) as typeof fetch;
  db = await makeDb();
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, Date.now() - 30 * 86_400_000).run();
  const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ password: PASSWORD }) });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
}, 60_000);
afterAll(() => { globalThis.fetch = realFetch; });

describe('revenue providers: signatures and parsers', () => {
  it('verifies Paddle (ts:body HMAC hex, 5 min tolerance) and parses transactions/adjustments', async () => {
    const body = '{"event_type":"transaction.completed"}';
    const ts = Math.floor(Date.now() / 1000);
    const h1 = await hmacHex('pdl_secret', `${ts}:${body}`);
    expect(await verifyPaddle('pdl_secret', `ts=${ts};h1=${h1}`, body)).toBe(true);
    expect(await verifyPaddle('pdl_secret', `ts=${ts};h1=${h1.replace(/.$/, '0')}`, body + ' ')).toBe(false);
    expect(await verifyPaddle('pdl_secret', `ts=${ts - 3600};h1=${await hmacHex('pdl_secret', `${ts - 3600}:${body}`)}`, body)).toBe(false);
    const a = parsePaddle({ event_type: 'transaction.completed', data: { id: 'txn_1', currency_code: 'USD', custom_data: { ml_visitor_id: 'visitor_paddle1' }, details: { totals: { grand_total: '1999' } }, billed_at: '2026-10-29T10:00:00Z', origin: 'web' } }, site);
    expect(a.kind).toBe('payment');
    if (a.kind === 'payment') { expect(a.payment.amount).toBe(1999); expect(a.payment.visitorId).toBe('visitor_paddle1'); }
    expect(parsePaddle({ event_type: 'adjustment.created', data: { id: 'adj_1', action: 'refund', status: 'pending_approval', transaction_id: 'txn_1', currency_code: 'USD', totals: { total: '500' } } }, site).kind).toBe('ignore');
  });
  it('verifies Shopify / WooCommerce (base64 HMAC) and reads orders and refunds', async () => {
    const body = '{"id":1}';
    expect(await verifyShopify('shp', await hmacBase64('shp', body), body)).toBe(true);
    expect(await verifyShopify('shp', await hmacBase64('other', body), body)).toBe(false);
    const p = parseShopify('orders/paid', { id: 42, currency: 'EUR', total_price: '12.50', note_attributes: [{ name: 'ml_visitor_id', value: 'visitor_shop1' }], email: 'A@B.CO' }, site);
    expect(p).toMatchObject({ kind: 'payment', payment: { id: 'shopify_42', amount: 1250, visitorId: 'visitor_shop1', email: 'a@b.co' } });
    expect(parseShopify('refunds/create', { id: 7, order_id: 42, transactions: [{ kind: 'refund', status: 'success', amount: '2.50', currency: 'EUR' }] }, site)).toMatchObject({ kind: 'refund', amount: 250, paymentId: 'shopify_42' });
    const w = parseWoo('order.updated', { id: 9, status: 'processing', currency: 'EUR', total: '30.00', date_paid_gmt: '2026-10-29T10:00:00', meta_data: [{ key: '_ml_visitor_id', value: 'visitor_woo01' }], refunds: [{ id: 3, total: '-5.00' }] }, site);
    expect(w.map((x) => x.kind)).toEqual(['payment', 'refund']);
    expect(w[0]).toMatchObject({ payment: { amount: 3000, visitorId: 'visitor_woo01' } });
    expect(parseWoo('order.created', { id: 10, status: 'pending', total: '5' }, site)[0].kind).toBe('ignore');
  });
  it('uses the Kajabi offer amount (order bumps share one transaction)', () => {
    const k = parseKajabi({ event: 'purchase', payload: { transaction: { id: 't1', currency: 'USD', amount_paid: 9900 }, offer: { id: 5, total_amount: 4900 }, member: { email: 'm@x.io', id: 1 } } }, site);
    expect(k).toMatchObject({ kind: 'payment', payment: { id: 'kajabi_t1_5', amount: 4900, currency: 'USD' } });
  });
});

describe('FX conversion to the site currency', () => {
  it('converts and caches rates (memory + table)', async () => {
    const ts = Date.UTC(2026, 9, 20, 12);
    expect(await convertMinor(D1(), 1000, 'USD', 'EUR', ts)).toMatchObject({ amount: 900, rate: 0.9 });
    const n = fxCalls.length;
    expect((await convertMinor(D1(), 2000, 'USD', 'EUR', ts))!.amount).toBe(1800);
    expect(fxCalls.length).toBe(n);
    expect(await convertMinor(D1(), 100, 'EUR', 'EUR', ts)).toMatchObject({ amount: 100, rate: 1 });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM fx_rates').first<{ n: number }>()).toMatchObject({ n: 1 });
  });
});

describe('webhooks end to end', () => {
  it('records a Paddle payment in USD converted to EUR, keeping the original', async () => {
    await authed(`/api/sites/${site.id}/integrations/paddle`, { method: 'PUT', json: { secret: 'pdl_test_secret_123' } });
    const body = JSON.stringify({ event_type: 'transaction.completed', event_id: 'evt_1', data: { id: 'txn_e2e', currency_code: 'USD', details: { totals: { grand_total: '2000' } }, billed_at: '2026-10-20T12:00:00Z' } });
    const ts = Math.floor(Date.now() / 1000);
    const r = await call(`/api/webhooks/paddle/${site.id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=${await hmacHex('pdl_test_secret_123', `${ts}:${body}`)}` }, body });
    expect(r.status).toBe(200);
    const p = await db.prepare("SELECT amount, currency, orig_amount, orig_currency, fx_rate FROM payments WHERE id = 'paddle_txn_e2e'").first<any>();
    expect(p).toMatchObject({ amount: 1800, currency: 'EUR', orig_currency: 'USD' });
    expect(Number(p.orig_amount)).toBe(2000);
    const bad = await call(`/api/webhooks/paddle/${site.id}`, { method: 'POST', headers: { 'content-type': 'application/json', 'paddle-signature': `ts=${ts};h1=00` }, body });
    expect(bad.status).toBe(401);
  });
  it('acknowledges the WooCommerce ping and mints a secret URL for Kajabi', async () => {
    await authed(`/api/sites/${site.id}/integrations/woocommerce`, { method: 'PUT', json: { secret: 'woo_secret_abc' } });
    const ping = await call(`/api/webhooks/woocommerce/${site.id}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'webhook_id=12' });
    expect(ping.status).toBe(200);
    const k = await (await authed(`/api/sites/${site.id}/integrations/kajabi`, { method: 'PUT', json: {} })).json<any>();
    expect(k.secretUrl).toMatch(/\/api\/webhooks\/kajabi\/site_parity\?token=/);
    const path = new URL(k.secretUrl).pathname + new URL(k.secretUrl).search;
    const payload = JSON.stringify({ event: 'purchase', payload: { transaction: { id: 'kt9', currency: 'EUR' }, offer: { id: 1, total_amount: 1500 }, member: { email: 'k@x.io' } } });
    expect((await call(path.replace(/token=.*/, 'token=wrong'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })).status).toBe(401);
    expect((await call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload })).status).toBe(200);
    expect(await db.prepare("SELECT amount FROM payments WHERE id = 'kajabi_kt9_1'").first<any>()).toMatchObject({ amount: 1500 });
  });
  it('summarises revenue and explains why a prediction is not ready yet', async () => {
    const s = await (await authed(`/api/sites/${site.id}/revenue/summary?period=all`)).json<any>();
    expect(s.gross).toBeGreaterThanOrEqual(3300);
    const pr = await (await authed(`/api/sites/${site.id}/revenue/predictions`)).json<any>();
    expect(pr.ready).toBe(false);
    expect(pr.reason).toBeTruthy();
  });
});

describe('tracker options on the server', () => {
  it('derives daily cookieless ids without storing the IP', async () => {
    const a = await cookielessIds(D1(), site, 's', '1.2.3.4', UA, Date.UTC(2026, 9, 30, 10));
    const b = await cookielessIds(D1(), site, 's', '1.2.3.4', UA, Date.UTC(2026, 9, 30, 11));
    const c = await cookielessIds(D1(), site, 's', '1.2.3.4', UA, Date.UTC(2026, 9, 31, 10));
    expect(a.vid).toBe(b.vid);
    expect(a.vid).not.toBe(c.vid);
    expect(a.vid).not.toContain('1.2.3.4');
  });
  it('treats allowed hostnames as the same site (cross-domain)', () => {
    const s = { ...site, settings: JSON.stringify({ allowedHostnames: ['shop.other.com', 'Bad Host!'] }) } as Site;
    expect(normalizeSettings({ allowedHostnames: ['shop.other.com', 'Bad Host!'] }).allowedHostnames).toEqual(['shop.other.com']);
    const belongs = (h: string, d: string) => h === d || h.endsWith('.' + d);
    expect(hostAllowed(s, 'shop.other.com', belongs)).toBe(true);
    expect(hostAllowed(s, 'p.test', belongs)).toBe(true);
    expect(hostAllowed(s, 'evil.com', belongs)).toBe(false);
  });
  it('stores hash routes (script.hash.js) as path + #fragment', async () => {
    await ingest(D1(), site, { w: site.id, t: 'pageview', u: 'https://p.test/app', hp: '#/billing', vid: 'visitor_hash01', sid: 'session_hash01' } as any, new URL('https://p.test/app'), UA, { country: 'FR', region: null, city: null } as any, Date.now());
    const e = await db.prepare("SELECT path FROM events WHERE visitor_id = 'visitor_hash01'").first<{ path: string }>();
    expect(e?.path).toBe('/app#/billing');
  });
});

describe('notifications, alerts and reports', () => {
  it('notifies the first completion of a goal once, and lists / reads notifications', async () => {
    const s = await loadSite();
    await goalAlerts(D1(), s, 'signup', '/pricing');
    await goalAlerts(D1(), s, 'signup', '/pricing');
    await notify(D1(), s, { kind: 'spike', title: 'Pic', dedupe: 'x1' });
    await notify(D1(), s, { kind: 'spike', title: 'Pic', dedupe: 'x1' });
    const list = await (await authed(`/api/sites/${site.id}/notifications`)).json<any>();
    expect(list.items.filter((n: any) => n.kind === 'new_goal')).toHaveLength(1);
    expect(list.items.filter((n: any) => n.kind === 'spike')).toHaveLength(1);
    expect(list.unread).toBeGreaterThanOrEqual(2);
    await authed(`/api/sites/${site.id}/notifications/read`, { method: 'POST', json: { all: true } });
    expect((await (await authed('/api/notifications')).json<any>()).unread).toBe(0);
  });
  it('respects the in-app toggle and detects a traffic spike', async () => {
    const r = await authed(`/api/sites/${site.id}/settings`, { method: 'PATCH', json: { alerts: { traffic: true, emails: ['me@example.com', 'nope'] } } });
    const st = await r.json<any>();
    expect(st.alerts.emails).toEqual(['me@example.com']);
    expect(st.email.configured).toBe(false);
    const now = Date.now();
    for (let i = 0; i < 12; i++) await ingest(D1(), await loadSite(), { w: site.id, t: 'pageview', u: 'https://p.test/', vid: `visitor_spike${String(i).padStart(3, '0')}`, sid: `session_spike${String(i).padStart(3, '0')}` } as any, new URL('https://p.test/'), UA, { country: 'FR', region: null, city: null } as any, now - 60_000);
    await checkTraffic(D1(), await loadSite(), now, true);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE site_id = ? AND kind = 'spike' AND dedupe != 'x1'").bind(site.id).first<any>()).toMatchObject({ n: 1 });
  });
  it('builds a French weekly report and refuses a test send without RESEND_API_KEY', async () => {
    const rep = await buildReport(D1(), await loadSite(), 'weekly', Date.now(), ORIGIN);
    expect(rep.subject).toMatch(/semaine|hebdo/i);
    expect(rep.html).toContain('Visiteurs');
    expect((await authed(`/api/sites/${site.id}/reports/test`, { method: 'POST', json: {} })).status).toBe(409);
  });
});

describe('public API, tokens and MCP', () => {
  let token = '';
  it('creates a token once and serves /api/v1 with it', async () => {
    const t = await (await authed('/api/tokens', { method: 'POST', json: { name: 'test', readOnly: true } })).json<any>();
    token = t.token;
    expect(token).toMatch(/^mlt_/);
    const list = await (await authed('/api/tokens')).json<any>();
    expect(JSON.stringify(list)).not.toContain(token);
    const sites = await (await call('/api/v1/sites', { headers: { authorization: `Bearer ${token}` } })).json<any>();
    expect(sites.sites ?? sites).toEqual(expect.arrayContaining([expect.objectContaining({ id: site.id })]));
    const ov = await call(`/api/v1/sites/${site.id}/overview?period=7d`, { headers: { authorization: `Bearer ${token}` } });
    expect(ov.status).toBe(200);
    expect((await call(`/api/v1/sites/${site.id}/overview`)).status).toBe(401);
    expect((await call('/api/v1/openapi.json')).status).toBe(200);
  });
  it('speaks MCP JSON-RPC: initialize, tools/list, tools/call', async () => {
    const rpc = (body: unknown) => call('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const init = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } })).json<any>();
    expect(init.result.serverInfo.name).toMatch(/minilytics/i);
    const tools = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json<any>();
    expect(tools.result.tools.map((t: any) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name));
    const res = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_sites', arguments: {} } })).json<any>();
    expect(res.result.content[0].text).toContain(site.id);
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await call('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
  });
  it('revokes tokens', async () => {
    const list = await (await authed('/api/tokens')).json<any>();
    for (const t of list.tokens ?? list) await authed(`/api/tokens/${t.id}`, { method: 'DELETE' });
    expect((await call('/api/v1/sites', { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

describe('connectors and plan limits', () => {
  it('shows setup states until credentials exist', async () => {
    const c = await (await authed(`/api/sites/${site.id}/connectors`)).json<any>();
    expect(c.google.configured).toBe(false);
    expect(c.meta.configured).toBe(false);
    expect((await authed(`/api/sites/${site.id}/oauth/google/start`, { method: 'POST', json: {} })).status).toBe(409);
  });
  it('imports GitHub commits as annotations', async () => {
    await authed(`/api/sites/${site.id}/settings`, { method: 'PATCH', json: { github: { repo: 'acme/web' } } });
    const fake = (async () => new Response(JSON.stringify([{ sha: 'abc123', html_url: 'https://github.com/acme/web/commit/abc123', commit: { message: 'Nouvelle page tarifs\n\ndetails', author: { name: 'Ada', date: new Date().toISOString() } } }]), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const r = await syncGithub(D1(), await loadSite(), env() as any, fake);
    expect(r).toMatchObject({ ok: true });
    const a = await (await authed(`/api/sites/${site.id}/annotations?period=7d`)).json<any>();
    expect(a.items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'commit', title: 'Nouvelle page tarifs' })]));
  });
  it('reports usage against the plan and enforces the site limit', async () => {
    const u = await (await authed('/api/usage')).json<any>();
    expect(u.plan.id).toBe('growth');
    expect(u.events.limit).toBe(PLANS.growth.eventsPerMonth);
    await authed('/api/usage/plan', { method: 'PUT', json: { plan: 'starter' } });
    const r = await authed('/api/sites', { method: 'POST', json: { domain: 'second.test', name: 'b' } });
    expect(r.status).toBe(403);
    await authed('/api/usage/plan', { method: 'PUT', json: { plan: 'growth' } });
  });
});

vi.setConfig({ testTimeout: 30_000 });

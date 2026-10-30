import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { ingest } from '../src/worker/collect';
import { funnel, overview, parseFilters } from '../src/worker/stats';
import { goalDetail, isExcluded, parseLemonSqueezy, parsePolar, parseStripe, pathExcluded, userPaths } from '../src/worker/growth';
import { hmacHex, verifyStripeSignature } from '../src/worker/lib/crypto';
import { resolveRange, tzOffset } from '../src/worker/lib/time';
import type { Site } from '../src/worker/env';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
const site: Site = { id: 'site_growth', name: 'g', domain: 'g.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k', dodo_webhook_secret: null, created_at: 0 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOW = Date.UTC(2026, 9, 30, 12);
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
async function send(b: Record<string, unknown>, at = NOW, geo = { country: 'FR', region: null, city: null }) {
  const body = { w: site.id, sw: 1440, ...b } as any;
  await ingest(D1(), site, body, new URL(body.u), UA, geo as any, at);
}
const ctx = (filters: Record<string, unknown> = {}) => {
  const range = resolveRange({ period: 'today' }, site.timezone, 0, NOW + 3_600_000);
  return { db: D1(), site, range, filters: parseFilters(filters), offset: tzOffset(site.timezone, range.to) };
};

beforeAll(async () => {
  db = await makeDb();
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  // A: Google → / → /pricing → goal signup (plan=pro) ; B: X → / → /blog ; C: direct → /pricing → signup (plan=free)
  await send({ t: 'pageview', u: 'https://g.test/', r: 'https://www.google.com/', vid: 'visitor_a1', sid: 'session_a1' });
  await send({ t: 'pageview', u: 'https://g.test/pricing', vid: 'visitor_a1', sid: 'session_a1' }, NOW + 1000);
  await send({ t: 'goal', n: 'signup', u: 'https://g.test/pricing', vid: 'visitor_a1', sid: 'session_a1', p: { plan: 'pro' } }, NOW + 5000);
  await send({ t: 'pageview', u: 'https://g.test/', r: 'https://t.co/x', vid: 'visitor_b1', sid: 'session_b1' }, NOW, { country: 'US', region: null, city: null });
  await send({ t: 'pageview', u: 'https://g.test/blog/hello', vid: 'visitor_b1', sid: 'session_b1' }, NOW + 2000, { country: 'US', region: null, city: null });
  await send({ t: 'pageview', u: 'https://g.test/pricing', vid: 'visitor_c1', sid: 'session_c1' });
  await send({ t: 'goal', n: 'signup', u: 'https://g.test/pricing', vid: 'visitor_c1', sid: 'session_c1', p: { plan: 'free' } }, NOW + 3000);
  const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ password: PASSWORD }) });
  cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
}, 60_000);

describe('advanced filters (is / is not / contains, new vs returning)', () => {
  it('keeps the legacy string format and adds operators', async () => {
    expect(parseFilters('{"country":"FR"}')).toEqual({ country: { op: 'is', v: 'FR' } });
    expect(parseFilters({ source: { op: 'not', v: 'X' }, bogus: 'x', page: { op: 'evil', v: '/' } })).toEqual({ source: { op: 'not', v: 'X' } });
    expect((await overview(ctx({ country: 'FR' }))).current.visitors).toBe(2);
    expect((await overview(ctx({ country: { op: 'not', v: 'FR' } }))).current.visitors).toBe(1);
    expect((await overview(ctx({ page: { op: 'contains', v: '/BLOG' } }))).current.visitors).toBe(1);
    expect((await overview(ctx({ goal: { op: 'not', v: 'signup' } }))).current.visitors).toBe(1);
    expect((await overview(ctx({ visitor_type: 'new' }))).current.visitors).toBe(3);
    expect((await overview(ctx({ visitor_type: 'returning' }))).current.visitors).toBe(0);
  });
  it('escapes LIKE wildcards in « contains »', async () => {
    expect((await overview(ctx({ page: { op: 'contains', v: '%' } }))).current.visitors).toBe(0);
  });
  it('adds metric trends to the series', async () => {
    const o = await overview(ctx());
    const row = o.series.find((s: any) => s.sessions > 0) as any;
    expect(row).toHaveProperty('bounceRate');
    expect(row).toHaveProperty('conversionRate');
    expect(row).toHaveProperty('avgDuration');
  });
});

describe('funnels, goals and paths', () => {
  it('funnel steps carry conversion, drop-off, time and first-touch sources', async () => {
    const f = await funnel(ctx(), [{ type: 'page', value: '/' }, { type: 'page', value: '/pricing' }, { type: 'goal', value: 'signup' }]);
    expect(f.map((s) => s.visitors)).toEqual([2, 1, 1]);
    expect(f[1]).toMatchObject({ fromPrevious: 0.5, dropped: 1, medianMs: 1000 });
    expect(f[0].topSources.map((s) => s.label).sort()).toEqual(['Google', 'X']);
  });
  it('goal detail: conversion rate, custom properties, pages', async () => {
    const g = await goalDetail(ctx(), 'signup');
    expect(g).toMatchObject({ completions: 2, visitors: 2 });
    expect(g.conversionRate).toBeCloseTo(2 / 3);
    expect(g.properties[0].key).toBe('plan');
    expect(g.properties[0].values.map((v) => v.value).sort()).toEqual(['free', 'pro']);
    expect(g.pages[0]).toEqual({ label: '/pricing', count: 2 });
    expect(g.series.reduce((n, b) => n + b.completions, 0)).toBe(2);
  });
  it('user paths and transitions', async () => {
    const p = await userPaths(ctx());
    expect(p.sessions).toBe(3);
    expect(p.paths.find((x) => x.steps.join('>') === '/>/pricing')).toMatchObject({ sessions: 1, conversions: 1 });
    expect(p.transitions.find((t) => t.from === '/' && t.to === '/pricing')?.count).toBe(1);
  });
});

describe('exclusions', () => {
  const s = { ...site, exclusions: JSON.stringify({ paths: ['/admin', '/app/*'], ips: ['1.2.3.4', '10.0.*'], countries: ['RU'], hostnames: ['staging.g.test'] }) };
  it('matches paths like DataFast (/x exact, /x/* children)', () => {
    expect(pathExcluded('/admin', '/admin')).toBe(true);
    expect(pathExcluded('/admin', '/admin/users')).toBe(false);
    expect(pathExcluded('/app/*', '/app/settings')).toBe(true);
    expect(pathExcluded('/app/*', '/app')).toBe(false);
  });
  it('excludes by IP, country and hostname', () => {
    const base = { path: '/', ip: '8.8.8.8', country: 'FR', hostname: 'g.test' };
    expect(isExcluded(s, base)).toBe(false);
    expect(isExcluded(s, { ...base, ip: '1.2.3.4' })).toBe(true);
    expect(isExcluded(s, { ...base, ip: '10.0.3.9' })).toBe(true);
    expect(isExcluded(s, { ...base, country: 'ru' })).toBe(true);
    expect(isExcluded(s, { ...base, hostname: 'staging.g.test' })).toBe(true);
  });
  it('drops events at /api/event and exposes your IP in settings', async () => {
    const put = await authed(`/api/sites/${site.id}/exclusions`, { method: 'PUT', json: { ips: ['9.9.9.9', 'not an ip'], paths: ['/secret'] } });
    expect(await put.json()).toMatchObject({ ips: ['9.9.9.9'], paths: ['/secret'] });
    const ev = (ip: string, path = '/x') =>
      call('/api/event', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA, 'x-real-ip': ip }, body: JSON.stringify({ t: 'pageview', w: site.id, u: 'https://g.test' + path, vid: 'visitor_ex1', sid: 'session_ex1' }) });
    await ev('9.9.9.9');
    await ev('7.7.7.7', '/secret');
    let n = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = 'session_ex1'").first<{ n: number }>();
    expect(Number(n!.n)).toBe(0);
    await ev('7.7.7.7');
    n = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = 'session_ex1'").first<{ n: number }>();
    expect(Number(n!.n)).toBe(1);
    const g = await (await authed(`/api/sites/${site.id}/exclusions`, { headers: { 'x-real-ip': '5.5.5.5' } as any })).json() as any;
    expect(g).toHaveProperty('yourIp');
    await authed(`/api/sites/${site.id}/exclusions`, { method: 'PUT', json: {} });
  });
});

describe('segments and notes API', () => {
  it('saves, lists and deletes a segment (normalised filters)', async () => {
    const r = await authed(`/api/sites/${site.id}/segments`, { method: 'POST', json: { name: 'Clients FR', filters: { country: 'FR', goal: { op: 'is', v: 'signup' }, junk: 1 } } });
    const seg = (await r.json()) as any;
    expect(seg.filters).toEqual({ country: { op: 'is', v: 'FR' }, goal: { op: 'is', v: 'signup' } });
    expect(((await (await authed(`/api/sites/${site.id}/segments`)).json()) as any).length).toBe(1);
    expect((await authed(`/api/sites/${site.id}/segments`, { method: 'POST', json: { name: 'vide', filters: {} } })).status).toBe(400);
    await authed(`/api/sites/${site.id}/segments/${seg.id}`, { method: 'DELETE' });
    expect(((await (await authed(`/api/sites/${site.id}/segments`)).json()) as any).length).toBe(0);
  });
  it('notes are listed for the period', async () => {
    const r = await authed(`/api/sites/${site.id}/notes`, { method: 'POST', json: { ts: Date.now() - 1000, text: 'Lancement sur 𝕏' } });
    expect(r.status).toBe(200);
    const list = await (await authed(`/api/sites/${site.id}/notes?period=today`)).json() as any;
    expect(list.map((n: any) => n.text)).toContain('Lancement sur 𝕏');
    expect((await authed(`/api/sites/${site.id}/notes`, { method: 'POST', json: { ts: 'x', text: '' } })).status).toBe(400);
  });
});

describe('revenue integrations', () => {
  const secret = 'whsec_test_123456789';
  it('rejects webhooks until connected, never echoes the secret', async () => {
    expect((await call(`/api/webhooks/stripe/${site.id}`, { method: 'POST', body: '{}' })).status).toBe(400);
    const st = await (await authed(`/api/sites/${site.id}/integrations`)).json() as any;
    expect(st.stripe).toMatchObject({ connected: false, webhookUrl: `${ORIGIN}/api/webhooks/stripe/${site.id}` });
    expect((await authed(`/api/sites/${site.id}/integrations/stripe`, { method: 'PUT', json: { secret: 'sk_live_nope' } })).status).toBe(400);
    const ok = await (await authed(`/api/sites/${site.id}/integrations/stripe`, { method: 'PUT', json: { secret } })).json() as any;
    expect(ok.stripe.connected).toBe(true);
    expect(JSON.stringify(ok)).not.toContain(secret);
    const sites = await (await authed('/api/sites')).text();
    expect(sites).not.toContain(secret);
  });
  it('records a signed Stripe checkout for the visitor, ignores bad signatures', async () => {
    const body = JSON.stringify({ type: 'checkout.session.completed', created: NOW / 1000 + 60, data: { object: { id: 'cs_1', payment_intent: 'pi_1', amount_total: 4900, currency: 'eur', payment_status: 'paid', customer: 'cus_1', customer_details: { email: 'A@x.com', name: 'A' }, metadata: { ml_visitor_id: 'visitor_a1' } } } });
    const t = Math.floor(Date.now() / 1000);
    const bad = await call(`/api/webhooks/stripe/${site.id}`, { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=deadbeef` }, body });
    expect(bad.status).toBe(401);
    const sig = await hmacHex(secret, `${t}.${body}`);
    const r = await call(`/api/webhooks/stripe/${site.id}`, { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body });
    expect(await r.json()).toMatchObject({ ok: true, action: 'payment' });
    const p = await db.prepare("SELECT * FROM payments WHERE id = 'pi_1'").first<any>();
    expect(p).toMatchObject({ provider: 'stripe', amount: 4900, currency: 'EUR', visitor_id: 'visitor_a1', email: 'a@x.com' });
    const st = await (await authed(`/api/sites/${site.id}/integrations`)).json() as any;
    expect(st.stripe.lastEvent).toBe('checkout.session.completed');
    // Funnel revenue now credits visitor A.
    const f = await funnel(ctx(), [{ type: 'page', value: '/pricing' }, { type: 'goal', value: 'signup' }]);
    expect(f[1]).toMatchObject({ revenue: 4900, customers: 1 });
  });
  it('Stripe signature tolerance and parsers', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(await verifyStripeSignature(secret, `t=${old},v1=${await hmacHex(secret, `${old}.{}`)}`, '{}')).toBe(false);
    expect(parseStripe({ type: 'invoice.paid', data: { object: { billing_reason: 'subscription_create', amount_paid: 100 } } }, site).kind).toBe('ignore');
    const renewal = parseStripe({ type: 'invoice.paid', data: { object: { id: 'in_1', billing_reason: 'subscription_cycle', amount_paid: 900, currency: 'eur', customer: 'cus_1' } } }, site);
    expect(renewal).toMatchObject({ kind: 'payment', payment: { amount: 900, renewal: true } });
    expect(parseStripe({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 4900, currency: 'eur' } } }, site)).toMatchObject({ kind: 'refund', amount: 4900, paymentId: 'pi_1' });
    const ls = parseLemonSqueezy({ meta: { event_name: 'order_created', custom_data: { ml_visitor_id: 'visitor_c1' } }, data: { id: '42', attributes: { status: 'paid', total: 1500, currency: 'USD', user_email: 'c@x.com', customer_id: 7 } } }, site);
    expect(ls).toMatchObject({ kind: 'payment', payment: { id: 'ls_order_42', amount: 1500, visitorId: 'visitor_c1', customerId: '7' } });
    expect(parseLemonSqueezy({ meta: { event_name: 'subscription_payment_success' }, data: { id: '1', attributes: { billing_reason: 'initial' } } }, site).kind).toBe('ignore');
    const po = parsePolar({ type: 'order.paid', data: { id: 'o1', total_amount: 2000, currency: 'eur', billing_reason: 'subscription_cycle', customer: { email: 'b@x.com', metadata: { ml_visitor_id: 'visitor_b1' } } } }, site);
    expect(po).toMatchObject({ kind: 'payment', payment: { id: 'polar_o1', amount: 2000, visitorId: 'visitor_b1', renewal: true } });
  });
  it('Lemon Squeezy webhook end to end (X-Signature)', async () => {
    await authed(`/api/sites/${site.id}/integrations/lemonsqueezy`, { method: 'PUT', json: { secret: 'ls_secret_abcdef' } });
    const body = JSON.stringify({ meta: { event_name: 'order_created', custom_data: { ml_visitor_id: 'visitor_c1' } }, data: { id: '99', attributes: { status: 'paid', total: 1500, currency: 'EUR', created_at: new Date(NOW + 60_000).toISOString() } } });
    const r = await call(`/api/webhooks/lemonsqueezy/${site.id}`, { method: 'POST', headers: { 'x-signature': await hmacHex('ls_secret_abcdef', body) }, body });
    expect(r.status).toBe(200);
    expect(await db.prepare("SELECT visitor_id FROM payments WHERE id = 'ls_order_99'").first<any>()).toEqual({ visitor_id: 'visitor_c1' });
    const del = await (await authed(`/api/sites/${site.id}/integrations/lemonsqueezy`, { method: 'DELETE' })).json() as any;
    expect(del.lemonsqueezy.connected).toBe(false);
  });
});

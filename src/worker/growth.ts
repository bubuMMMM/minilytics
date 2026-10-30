/**
 * Growth features modelled on DataFast (datafa.st): saved segments, chart notes, exclusions, goal detail,
 * user paths, and revenue attribution webhooks for Stripe, Lemon Squeezy and Polar.
 * Every provider integration is inert until the site owner pastes their own webhook signing secret.
 */
import type { Context, Hono } from 'hono';
import { getSite, forgetSite, type AppEnv, type Site } from './env.js';
import { randomId, verifyStandardWebhook, verifyStripeSignature, hmacHex, constantTimeEqual } from './lib/crypto.js';
import { recordPayment, str, type PaymentInput } from './payments.js';
import { filterSql, hasFilters, makeCtx, parseFilters, type Ctx } from './stats.js';
import { bucketLabels, bucketSql } from './lib/time.js';
import { rawRequestIp } from './lib/security.js';

// ---------------------------------------------------------------- exclusions

export interface Exclusions {
  paths: string[];
  ips: string[];
  countries: string[];
  hostnames: string[];
}
const EMPTY: Exclusions = { paths: [], ips: [], countries: [], hostnames: [] };
const parsed = new WeakMap<Site, Exclusions>();

export function readExclusions(site: Site): Exclusions {
  const hit = parsed.get(site);
  if (hit) return hit;
  let ex = EMPTY;
  try {
    if (site.exclusions) ex = normalizeExclusions(JSON.parse(site.exclusions));
  } catch {}
  parsed.set(site, ex);
  return ex;
}

export function normalizeExclusions(raw: any): Exclusions {
  const list = (v: unknown, ok: (s: string) => boolean, map = (s: string) => s) =>
    [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((s) => map(s.trim())).filter(ok))].slice(0, 50);
  return {
    paths: list(raw?.paths, (s) => /^\/[^\s]{0,199}$/.test(s)),
    ips: list(raw?.ips, (s) => /^[0-9a-f:.]{2,45}\*?$/i.test(s), (s) => s.toLowerCase()),
    countries: list(raw?.countries, (s) => /^[A-Z]{2}$/.test(s), (s) => s.toUpperCase()),
    hostnames: list(raw?.hostnames, (s) => /^[a-z0-9.-]{1,253}$/.test(s), (s) => s.toLowerCase()),
  };
}

/** `/admin` matches only /admin; `/admin/*` matches everything under /admin (not /admin itself), like DataFast. */
export function pathExcluded(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1)) && path.length > pattern.length - 1;
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return re.test(path);
  }
  return path === pattern || path === pattern + '/';
}

export function isExcluded(site: Site, v: { path: string; ip: string | null; country: string | null; hostname: string }): boolean {
  const ex = readExclusions(site);
  if (ex.paths.some((p) => pathExcluded(p, v.path))) return true;
  if (v.ip) {
    const ip = v.ip.toLowerCase();
    if (ex.ips.some((p) => (p.endsWith('*') ? ip.startsWith(p.slice(0, -1)) : ip === p))) return true;
  }
  if (v.country && ex.countries.includes(v.country.toUpperCase())) return true;
  const h = v.hostname.toLowerCase().replace(/^www\./, '');
  return ex.hostnames.some((x) => h === x || h === x.replace(/^www\./, ''));
}

// ---------------------------------------------------------------- integrations

export const PROVIDERS = ['stripe', 'lemonsqueezy', 'polar'] as const;
export type Provider = (typeof PROVIDERS)[number];
type IntegrationState = { secret: string; connected_at: number; last_event_at?: number; last_event?: string };
type Integrations = Partial<Record<Provider, IntegrationState>>;

export function readIntegrations(site: Site): Integrations {
  try {
    const v = site.integrations ? JSON.parse(site.integrations) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** What the dashboard may see: never the secret itself. */
export function integrationStatus(site: Site, origin: string) {
  const all = readIntegrations(site);
  const out: Record<string, unknown> = {};
  for (const p of PROVIDERS) {
    const s = all[p];
    out[p] = {
      connected: !!s?.secret,
      connectedAt: s?.connected_at ?? null,
      lastEventAt: s?.last_event_at ?? null,
      lastEvent: s?.last_event ?? null,
      webhookUrl: `${origin}/api/webhooks/${p}/${site.id}`,
    };
  }
  out.dodo = { connected: !!site.dodo_webhook_secret, webhookUrl: `${origin}/api/webhooks/dodo/${site.id}` };
  return out;
}

async function saveIntegrations(db: D1Database, site: Site, next: Integrations) {
  await db.prepare('UPDATE sites SET integrations = ? WHERE id = ?').bind(JSON.stringify(next), site.id).run();
  forgetSite(site.id);
}

const VISITOR_KEYS = ['ml_visitor_id', 'minilytics_visitor_id', 'visitor_id'];
const SESSION_KEYS = ['ml_session_id', 'minilytics_session_id', 'session_id'];
const pick = (meta: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!meta || typeof meta !== 'object') return null;
  for (const k of keys) if (str(meta[k])) return meta[k] as string;
  return null;
};
const upper = (v: unknown, fallback: string) => (str(v) ?? fallback).toUpperCase();

async function recordRefund(db: D1Database, site: Site, provider: string, refundId: string, paymentId: string | null, amount: number, currency: string, ts: number) {
  const original = paymentId
    ? await db.prepare('SELECT visitor_id, session_id, customer_id, email, name FROM payments WHERE id = ? AND site_id = ?').bind(paymentId, site.id).first<any>()
    : null;
  await db
    .prepare(
      `INSERT INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id, session_id, customer_id, email, name)
       VALUES (?, ?, ?, ?, ?, 'refund', ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET amount = excluded.amount`,
    )
    .bind(refundId, site.id, provider, ts, -Math.abs(amount), currency, original?.visitor_id ?? null, original?.session_id ?? null,
      original?.customer_id ?? null, original?.email ?? null, original?.name ?? null)
    .run();
}

/** Normalised webhook outcome, so the three providers share the recording code (and the tests). */
export type WebhookAction =
  | { kind: 'payment'; payment: PaymentInput }
  | { kind: 'refund'; refundId: string; paymentId: string | null; amount: number; currency: string; ts: number }
  | { kind: 'ignore'; reason: string };

/** Stripe: checkout.session.completed (first purchase), invoice.paid (renewals only), charge.refunded. */
export function parseStripe(event: any, site: Site): WebhookAction {
  const o = event?.data?.object ?? {};
  const ts = (Number(o.created) || Number(event?.created) || Date.now() / 1000) * 1000;
  if (event?.type === 'checkout.session.completed') {
    if (o.payment_status && o.payment_status !== 'paid' && o.payment_status !== 'no_payment_required') return { kind: 'ignore', reason: 'unpaid checkout' };
    const meta = { ...(o.metadata ?? {}) };
    return {
      kind: 'payment',
      payment: {
        id: str(o.payment_intent) ?? str(o.invoice) ?? String(o.id),
        provider: 'stripe',
        ts,
        amount: Number(o.amount_total) || 0,
        kind: 'payment',
        currency: upper(o.currency, site.currency),
        visitorId: pick(meta, VISITOR_KEYS) ?? (str(o.client_reference_id) && /^[\w-]{8,64}$/.test(o.client_reference_id) ? o.client_reference_id : null),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: str(o.customer),
        email: str(o.customer_details?.email)?.toLowerCase() ?? str(o.customer_email)?.toLowerCase() ?? null,
        name: str(o.customer_details?.name),
        subscriptionId: str(o.subscription),
      },
    };
  }
  if (event?.type === 'invoice.paid' || event?.type === 'invoice.payment_succeeded') {
    // The first invoice of a subscription is already counted by checkout.session.completed (no duplicates).
    if (o.billing_reason === 'subscription_create') return { kind: 'ignore', reason: 'first invoice counted at checkout' };
    if (!(Number(o.amount_paid) > 0)) return { kind: 'ignore', reason: 'zero invoice' };
    const meta = { ...(o.subscription_details?.metadata ?? {}), ...(o.parent?.subscription_details?.metadata ?? {}), ...(o.metadata ?? {}) };
    return {
      kind: 'payment',
      payment: {
        id: str(o.payment_intent) ?? String(o.id),
        provider: 'stripe',
        ts,
        amount: Number(o.amount_paid),
        kind: 'payment',
        currency: upper(o.currency, site.currency),
        visitorId: pick(meta, VISITOR_KEYS),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: str(o.customer),
        email: str(o.customer_email)?.toLowerCase() ?? null,
        name: str(o.customer_name),
        subscriptionId: str(o.subscription) ?? str(o.parent?.subscription_details?.subscription),
        renewal: true,
      },
    };
  }
  if (event?.type === 'charge.refunded') {
    return { kind: 'refund', refundId: `refund_${o.id}`, paymentId: str(o.payment_intent), amount: Number(o.amount_refunded) || 0, currency: upper(o.currency, site.currency), ts: Date.now() };
  }
  return { kind: 'ignore', reason: `event ${event?.type} not used` };
}

/** Lemon Squeezy: order_created, subscription_payment_success (renewals), order_refunded. */
export function parseLemonSqueezy(event: any, site: Site): WebhookAction {
  const name = event?.meta?.event_name;
  const a = event?.data?.attributes ?? {};
  const meta = event?.meta?.custom_data ?? {};
  const ts = Date.parse(a.created_at ?? '') || Date.now();
  if (name === 'order_created') {
    if (a.status && a.status !== 'paid') return { kind: 'ignore', reason: 'unpaid order' };
    return {
      kind: 'payment',
      payment: {
        id: `ls_order_${event.data.id}`,
        provider: 'lemonsqueezy',
        ts,
        amount: Number(a.total) || 0,
        kind: 'payment',
        currency: upper(a.currency, site.currency),
        visitorId: pick(meta, VISITOR_KEYS),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: a.customer_id != null ? String(a.customer_id) : null,
        email: str(a.user_email)?.toLowerCase() ?? null,
        name: str(a.user_name),
      },
    };
  }
  if (name === 'subscription_payment_success') {
    if (a.billing_reason === 'initial') return { kind: 'ignore', reason: 'first payment counted by order_created' };
    return {
      kind: 'payment',
      payment: {
        id: `ls_invoice_${event.data.id}`,
        provider: 'lemonsqueezy',
        ts,
        amount: Number(a.total) || 0,
        kind: 'payment',
        currency: upper(a.currency, site.currency),
        visitorId: pick(meta, VISITOR_KEYS),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: a.customer_id != null ? String(a.customer_id) : null,
        email: str(a.user_email)?.toLowerCase() ?? null,
        name: str(a.user_name),
        subscriptionId: a.subscription_id != null ? String(a.subscription_id) : null,
        renewal: true,
      },
    };
  }
  if (name === 'order_refunded') {
    return { kind: 'refund', refundId: `ls_refund_${event.data.id}`, paymentId: `ls_order_${event.data.id}`, amount: Number(a.refunded_amount) || Number(a.total) || 0, currency: upper(a.currency, site.currency), ts: Date.now() };
  }
  return { kind: 'ignore', reason: `event ${name} not used` };
}

/** Polar: order.paid (purchases and renewals), order.refunded. */
export function parsePolar(event: any, site: Site): WebhookAction {
  const d = event?.data ?? {};
  const ts = Date.parse(d.created_at ?? '') || Date.now();
  if (event?.type === 'order.paid' || event?.type === 'order.created') {
    if (event.type === 'order.created' && d.status && d.status !== 'paid') return { kind: 'ignore', reason: 'unpaid order' };
    const meta = { ...(d.customer?.metadata ?? {}), ...(d.metadata ?? {}) };
    return {
      kind: 'payment',
      payment: {
        id: `polar_${d.id}`,
        provider: 'polar',
        ts,
        amount: Number(d.total_amount ?? d.amount ?? d.net_amount) || 0,
        kind: 'payment',
        currency: upper(d.currency, site.currency),
        visitorId: pick(meta, VISITOR_KEYS),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: str(d.customer_id) ?? str(d.customer?.id),
        email: str(d.customer?.email)?.toLowerCase() ?? null,
        name: str(d.customer?.name),
        subscriptionId: str(d.subscription_id),
        renewal: d.billing_reason === 'subscription_cycle',
      },
    };
  }
  if (event?.type === 'order.refunded') {
    return { kind: 'refund', refundId: `polar_refund_${d.id}`, paymentId: `polar_${d.id}`, amount: Number(d.refunded_amount) || 0, currency: upper(d.currency, site.currency), ts: Date.now() };
  }
  return { kind: 'ignore', reason: `event ${event?.type} not used` };
}

async function verify(provider: Provider, secret: string, c: Context<AppEnv>, body: string): Promise<boolean> {
  if (provider === 'stripe') return verifyStripeSignature(secret, c.req.header('stripe-signature') ?? null, body);
  if (provider === 'lemonsqueezy') {
    const sig = c.req.header('x-signature') ?? '';
    return !!sig && constantTimeEqual(sig.toLowerCase(), await hmacHex(secret, body));
  }
  // Polar signs with Standard Webhooks, using the raw secret string as the key (its SDK base64-encodes it first).
  return verifyStandardWebhook(
    btoa(unescape(encodeURIComponent(secret))),
    { id: c.req.header('webhook-id') ?? null, timestamp: c.req.header('webhook-timestamp') ?? null, signature: c.req.header('webhook-signature') ?? null },
    body,
  );
}

async function handleProviderWebhook(c: Context<AppEnv>, provider: Provider) {
  const site = await getSite(c.env.DB, c.req.param('siteId')!);
  if (!site) return c.json({ error: 'unknown site' }, 404);
  const state = readIntegrations(site)[provider];
  if (!state?.secret) return c.json({ error: `${provider} is not connected for this site` }, 400);
  const body = await c.req.text();
  if (body.length > 512_000) return c.json({ error: 'payload too large' }, 413);
  if (!(await verify(provider, state.secret, c, body))) return c.json({ error: 'invalid signature' }, 401);
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const action = provider === 'stripe' ? parseStripe(event, site) : provider === 'lemonsqueezy' ? parseLemonSqueezy(event, site) : parsePolar(event, site);
  if (action.kind === 'payment') await recordPayment(c.env.DB, site, action.payment);
  else if (action.kind === 'refund') await recordRefund(c.env.DB, site, provider, action.refundId, action.paymentId, action.amount, action.currency, action.ts);
  // Remember that the integration works (shown in Settings).
  const fresh = (await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(site.id).first<Site>()) ?? site;
  const all = readIntegrations(fresh);
  if (all[provider]) {
    all[provider] = { ...all[provider]!, last_event_at: Date.now(), last_event: String(event?.type ?? event?.meta?.event_name ?? '').slice(0, 60) };
    await saveIntegrations(c.env.DB, fresh, all);
  }
  return c.json({ ok: true, action: action.kind });
}

// ---------------------------------------------------------------- goal detail & user paths

/** One goal: completions over time, conversion rate, revenue of converters, where it happens, custom properties. */
export async function goalDetail(ctx: Ctx, name: string) {
  const { db, site, range } = ctx;
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
  const base = `FROM events e ${join} WHERE e.site_id = ? AND e.type = 'goal' AND e.name = ? AND e.ts >= ? AND e.ts < ?${f.sql}`;
  const params = [site.id, name, range.from, range.to, ...f.params];
  const b = bucketSql('e.ts', range.granularity, ctx.offset);
  const sw = `s.site_id = ? AND s.started_at >= ? AND s.started_at < ?${f.sql}`;
  const [tot, all, series, pages, sources, props, rev] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS completions, COUNT(DISTINCT e.visitor_id) AS visitors ${base}`).bind(...params),
    db.prepare(`SELECT COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s WHERE ${sw}`).bind(site.id, range.from, range.to, ...f.params),
    db.prepare(`SELECT ${b} AS b, COUNT(*) AS completions, COUNT(DISTINCT e.visitor_id) AS visitors ${base} GROUP BY b`).bind(...params),
    db.prepare(`SELECT e.path AS label, COUNT(*) AS n ${base} GROUP BY e.path ORDER BY n DESC LIMIT 10`).bind(...params),
    db
      .prepare(
        `SELECT s2.source AS label, COUNT(DISTINCT e.visitor_id) AS n ${base.replace('FROM events e', 'FROM events e JOIN sessions s2 ON s2.site_id = e.site_id AND s2.id = e.session_id')}
         GROUP BY s2.source ORDER BY n DESC LIMIT 10`,
      )
      .bind(...params),
    db.prepare(`SELECT e.props AS props, COUNT(*) AS n ${base} AND e.props IS NOT NULL GROUP BY e.props ORDER BY n DESC LIMIT 500`).bind(...params),
    db
      .prepare(
        `SELECT COALESCE(SUM(p.amount), 0) AS revenue, COUNT(DISTINCT p.visitor_id) AS customers
         FROM (SELECT DISTINCT e.visitor_id ${base}) g JOIN payments p ON p.site_id = ? AND p.visitor_id = g.visitor_id AND p.ts >= ? AND p.ts < ?`,
      )
      .bind(...params, site.id, range.from, range.to),
  ]);
  const t = (tot.results[0] ?? {}) as any;
  const total = Number((all.results[0] as any)?.visitors ?? 0);
  const by = new Map((series.results as any[]).map((r) => [r.b, r]));
  // Custom properties: per key, the most frequent values.
  const keys = new Map<string, Map<string, number>>();
  for (const r of props.results as any[]) {
    let o: Record<string, unknown> = {};
    try {
      o = JSON.parse(r.props);
    } catch {}
    for (const [k, v] of Object.entries(o ?? {})) {
      if (v === null || typeof v === 'object') continue;
      const m = keys.get(k) ?? new Map<string, number>();
      m.set(String(v).slice(0, 120), (m.get(String(v).slice(0, 120)) ?? 0) + Number(r.n));
      keys.set(k, m);
    }
  }
  const r0 = (rev.results[0] ?? {}) as any;
  return {
    name,
    completions: Number(t.completions ?? 0),
    visitors: Number(t.visitors ?? 0),
    conversionRate: total ? Number(t.visitors ?? 0) / total : 0,
    revenue: Number(r0.revenue ?? 0),
    customers: Number(r0.customers ?? 0),
    series: bucketLabels(range, ctx.offset).map((l) => ({ bucket: l, completions: Number(by.get(l)?.completions ?? 0), visitors: Number(by.get(l)?.visitors ?? 0) })),
    pages: (pages.results as any[]).map((r) => ({ label: r.label, count: Number(r.n) })),
    sources: (sources.results as any[]).map((r) => ({ label: r.label, visitors: Number(r.n) })),
    properties: [...keys.entries()].slice(0, 10).map(([key, m]) => ({
      key,
      values: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count })),
    })),
  };
}

/**
 * User paths: the first pages of each visit (consecutive repeats collapsed), how many visits followed each path
 * and how many of them converted (completed a goal), plus the most common page → next page transitions.
 */
export async function userPaths(ctx: Ctx, depth = 4) {
  const { db, site, range } = ctx;
  const f = filterSql(ctx.filters);
  const rows = (
    await db
      .prepare(
        `SELECT e.session_id AS sid, e.path, s.goals FROM events e JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id
         WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at < ?${f.sql} AND e.site_id = ? AND e.type = 'pageview' AND e.ts >= ?
         ORDER BY e.session_id, e.ts LIMIT 200000`,
      )
      .bind(site.id, range.from, range.to, ...f.params, site.id, range.from)
      .all<{ sid: string; path: string | null; goals: number }>()
  ).results;
  const d = Math.max(2, Math.min(6, depth));
  const sessions = new Map<string, { pages: string[]; goals: number }>();
  for (const r of rows) {
    const s = sessions.get(r.sid) ?? { pages: [], goals: Number(r.goals) || 0 };
    const p = r.path || '/';
    if (s.pages[s.pages.length - 1] !== p) s.pages.push(p);
    sessions.set(r.sid, s);
  }
  const paths = new Map<string, { steps: string[]; sessions: number; conversions: number }>();
  const trans = new Map<string, { from: string; to: string; count: number }>();
  for (const s of sessions.values()) {
    const steps = s.pages.slice(0, d);
    const key = steps.join(' → ') + (s.pages.length > d ? ' → …' : '');
    const row = paths.get(key) ?? { steps: s.pages.length > d ? [...steps, '…'] : steps, sessions: 0, conversions: 0 };
    row.sessions++;
    if (s.goals > 0) row.conversions++;
    paths.set(key, row);
    for (let i = 0; i + 1 < s.pages.length; i++) {
      const k = s.pages[i] + '\u0000' + s.pages[i + 1];
      const t = trans.get(k) ?? { from: s.pages[i], to: s.pages[i + 1], count: 0 };
      t.count++;
      trans.set(k, t);
    }
  }
  return {
    sessions: sessions.size,
    truncated: rows.length >= 200000,
    paths: [...paths.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 25),
    transitions: [...trans.values()].sort((a, b) => b.count - a.count).slice(0, 25),
  };
}

// ---------------------------------------------------------------- routes

export function registerGrowth(app: Hono<AppEnv>) {
  // Favicon proxy: Google's favicon service answers 404 (with a placeholder) for unknown
  // domains, which floods the console. We pass real icons through and answer 204 otherwise,
  // so the <img> falls back silently. Only well-formed hostnames, fixed upstream host.
  app.get('/api/favicon', async (c) => {
    const d = (c.req.query('domain') || '').toLowerCase();
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return c.body(null, 204);
    const cache = { 'cache-control': 'public, max-age=86400, s-maxage=604800' };
    try {
      const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`, { signal: AbortSignal.timeout(4000) });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) return c.body(null, 204, cache);
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 100_000) return c.body(null, 204, cache);
      return c.body(buf, 200, { ...cache, 'content-type': type, 'x-content-type-options': 'nosniff' });
    } catch {
      return c.body(null, 204);
    }
  });

  for (const p of PROVIDERS) app.post(`/api/webhooks/${p}/:siteId`, (c) => handleProviderWebhook(c, p));

  // Segments: saved filter combinations, per site.
  app.get('/api/sites/:id/segments', async (c) => {
    const r = await c.env.DB.prepare('SELECT id, name, filters, created_at FROM segments WHERE site_id = ? ORDER BY created_at').bind(c.get('site').id).all<any>();
    return c.json(r.results.map((s) => ({ ...s, filters: JSON.parse(s.filters) })));
  });
  app.post('/api/sites/:id/segments', async (c) => {
    const b = await c.req.json<{ name?: string; filters?: Record<string, unknown> }>().catch(() => ({}) as any);
    const filters = parseFilters(b.filters ?? {});
    if (!str(b.name)?.trim() || !Object.keys(filters).length) return c.json({ error: 'A segment needs a name and at least one filter' }, 400);
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM segments WHERE site_id = ?').bind(c.get('site').id).first<{ n: number }>();
    if (Number(n?.n) >= 50) return c.json({ error: 'Maximum 50 segments per site' }, 400);
    const seg = { id: randomId(8), name: b.name!.trim().slice(0, 80), filters, created_at: Date.now() };
    await c.env.DB.prepare('INSERT INTO segments (id, site_id, name, filters, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(seg.id, c.get('site').id, seg.name, JSON.stringify(filters), seg.created_at)
      .run();
    return c.json(seg);
  });
  app.delete('/api/sites/:id/segments/:sid', async (c) => {
    await c.env.DB.prepare('DELETE FROM segments WHERE id = ? AND site_id = ?').bind(c.req.param('sid'), c.get('site').id).run();
    return c.json({ ok: true });
  });

  // Notes: annotate the chart (« lancement sur 𝕏 », « nouvelle landing »…).
  app.get('/api/sites/:id/notes', async (c) => {
    const ctx = makeCtx(c);
    const r = await c.env.DB.prepare('SELECT id, ts, text FROM notes WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts LIMIT 500')
      .bind(ctx.site.id, ctx.range.from, ctx.range.to)
      .all<any>();
    return c.json(r.results.map((n) => ({ ...n, ts: Number(n.ts) })));
  });
  app.post('/api/sites/:id/notes', async (c) => {
    const b = await c.req.json<{ ts?: number; text?: string }>().catch(() => ({}) as any);
    const text = str(b.text)?.trim().slice(0, 280);
    const ts = Number(b.ts);
    if (!text || !Number.isFinite(ts) || ts < 946684800000 || ts > Date.now() + 366 * 86_400_000) return c.json({ error: 'A note needs a text and a valid date' }, 400);
    const note = { id: randomId(8), ts: Math.trunc(ts), text };
    await c.env.DB.prepare('INSERT INTO notes (id, site_id, ts, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(note.id, c.get('site').id, note.ts, text, Date.now()).run();
    return c.json(note);
  });
  app.delete('/api/sites/:id/notes/:nid', async (c) => {
    await c.env.DB.prepare('DELETE FROM notes WHERE id = ? AND site_id = ?').bind(c.req.param('nid'), c.get('site').id).run();
    return c.json({ ok: true });
  });

  // Exclusions: drop events at ingestion (paths, IPs, countries, hostnames).
  app.get('/api/sites/:id/exclusions', (c) => c.json({ ...readExclusions(c.get('site')), yourIp: rawRequestIp(c) }));
  app.put('/api/sites/:id/exclusions', async (c) => {
    const ex = normalizeExclusions(await c.req.json().catch(() => ({})));
    await c.env.DB.prepare('UPDATE sites SET exclusions = ? WHERE id = ?').bind(JSON.stringify(ex), c.get('site').id).run();
    forgetSite(c.get('site').id);
    return c.json(ex);
  });

  // Revenue integrations: connect with the provider's webhook signing secret (never echoed back).
  app.get('/api/sites/:id/integrations', (c) => c.json(integrationStatus(c.get('site'), new URL(c.req.url).origin)));
  app.put('/api/sites/:id/integrations/:provider', async (c) => {
    const provider = c.req.param('provider') as Provider;
    if (!PROVIDERS.includes(provider)) return c.json({ error: 'unknown provider' }, 404);
    const b = await c.req.json<{ secret?: string }>().catch(() => ({}) as any);
    const secret = str(b.secret)?.trim();
    if (!secret || secret.length < 8 || secret.length > 300 || /\s/.test(secret)) return c.json({ error: 'Paste the webhook signing secret from your provider' }, 400);
    if (provider === 'stripe' && !secret.startsWith('whsec_')) return c.json({ error: 'A Stripe signing secret starts with whsec_' }, 400);
    const site = c.get('site');
    const all = readIntegrations(site);
    all[provider] = { secret, connected_at: Date.now() };
    await saveIntegrations(c.env.DB, site, all);
    return c.json(integrationStatus({ ...site, integrations: JSON.stringify(all) }, new URL(c.req.url).origin));
  });
  app.delete('/api/sites/:id/integrations/:provider', async (c) => {
    const site = c.get('site');
    const all = readIntegrations(site);
    delete all[c.req.param('provider') as Provider];
    await saveIntegrations(c.env.DB, site, all);
    return c.json(integrationStatus({ ...site, integrations: JSON.stringify(all) }, new URL(c.req.url).origin));
  });

  app.get('/api/sites/:id/goals/:name', async (c) => {
    const name = c.req.param('name');
    if (!/^[\w:.\-]{1,64}$/.test(name)) return c.json({ error: 'invalid goal' }, 400);
    return c.json(await goalDetail(makeCtx(c), name));
  });
  app.get('/api/sites/:id/paths', async (c) => c.json(await userPaths(makeCtx(c), Number(c.req.query('depth')) || 4)));
}

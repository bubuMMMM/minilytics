/**
 * More revenue providers (DataFast parity): Paddle Billing, Shopify, WooCommerce, Kajabi, Podia (via Zapier),
 * plus revenue summary (new vs renewal vs refunds) and an explainable revenue prediction.
 *
 * Verification, per each provider's documentation:
 *  - Paddle      `Paddle-Signature: ts=…;h1=…` = HMAC-SHA256(secret, `${ts}:${body}`) hex, 5 min tolerance.
 *  - Shopify     `X-Shopify-Hmac-Sha256` = base64 HMAC-SHA256(app/webhook secret, body).
 *  - WooCommerce `X-WC-Webhook-Signature` = base64 HMAC-SHA256(webhook secret, body).
 *  - Kajabi, Podia: no signature exists (Kajabi outbound webhooks are unsigned; Podia only has Zapier), so the
 *    webhook URL carries a random secret token (`?token=`) compared in constant time.
 */
import type { Context } from 'hono';
import type { AppEnv, Site } from './env.js';
import { constantTimeEqual, hmacBase64, hmacHex } from './lib/crypto.js';
import { currencyDecimals, str } from './payments.js';
import type { WebhookAction } from './growth.js';
import type { Ctx } from './stats.js';
import { startOfDay } from './lib/time.js';

const VISITOR_KEYS = ['ml_visitor_id', 'minilytics_visitor_id', 'visitor_id', 'datafast_visitor_id'];
const SESSION_KEYS = ['ml_session_id', 'minilytics_session_id', 'session_id', 'datafast_session_id'];
const pick = (meta: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!meta || typeof meta !== 'object') return null;
  for (const k of keys) if (str(meta[k]) && /^[\w-]{8,64}$/.test(meta[k] as string)) return meta[k] as string;
  return null;
};
const upper = (v: unknown, fallback: string) => (str(v) ?? fallback).toUpperCase().slice(0, 3);
/** "12.50" (major units) → 1250 minor units of `currency`. */
export const decimalToMinor = (v: unknown, currency: string) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 10 ** currencyDecimals(currency)) : 0;
};
const tsOf = (...vals: unknown[]) => {
  for (const v of vals) {
    const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v ?? ''));
    if (Number.isFinite(t) && t > 0) return t;
  }
  return Date.now();
};
/** [{name|key, value}] (Shopify note_attributes, WooCommerce meta_data) → object. */
const kv = (list: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (Array.isArray(list)) for (const x of list) if (x && typeof x === 'object') out[String((x as any).name ?? (x as any).key ?? '')] = (x as any).value;
  return out;
};

// ---------------------------------------------------------------- Paddle Billing

export async function verifyPaddle(secret: string, header: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(';').map((p) => p.trim().split('=') as [string, string]));
  const ts = Number(parts.ts);
  const sigs = header.split(';').map((p) => p.trim()).filter((p) => p.startsWith('h1=')).map((p) => p.slice(3));
  if (!Number.isFinite(ts) || !sigs.length || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const expected = await hmacHex(secret, `${parts.ts}:${body}`);
  return sigs.some((s) => constantTimeEqual(s, expected));
}

/** transaction.completed (purchases + renewals: origin subscription_recurring), adjustment.* refunds once approved. */
export function parsePaddle(event: any, site: Site): WebhookAction {
  const d = event?.data ?? {};
  const type = event?.event_type;
  if (type === 'transaction.completed' || type === 'transaction.paid') {
    const currency = upper(d.currency_code, site.currency);
    const totals = d.details?.totals ?? {};
    const meta = d.custom_data ?? {};
    return {
      kind: 'payment',
      payment: {
        id: `paddle_${d.id}`,
        provider: 'paddle',
        ts: tsOf(d.billed_at, d.updated_at, d.created_at),
        // Paddle totals are strings in minor units.
        amount: Math.abs(Number(totals.grand_total ?? totals.total ?? 0)) || 0,
        kind: 'payment',
        currency,
        visitorId: pick(meta, VISITOR_KEYS),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: str(d.customer_id),
        email: str(meta.email)?.toLowerCase() ?? null,
        name: null,
        subscriptionId: str(d.subscription_id),
        renewal: d.origin === 'subscription_recurring' || d.origin === 'subscription_charge',
        claimIds: [str(d.id), str(d.checkout?.id)].filter(Boolean) as string[],
      },
    };
  }
  if ((type === 'adjustment.created' || type === 'adjustment.updated') && d.action === 'refund') {
    if (d.status !== 'approved') return { kind: 'ignore', reason: `refund ${d.status ?? 'pending'}` };
    return {
      kind: 'refund',
      refundId: `paddle_refund_${d.id}`,
      paymentId: d.transaction_id ? `paddle_${d.transaction_id}` : null,
      amount: Math.abs(Number(d.totals?.total ?? 0)) || 0,
      currency: upper(d.currency_code ?? d.totals?.currency_code, site.currency),
      ts: tsOf(d.updated_at, d.created_at),
    };
  }
  return { kind: 'ignore', reason: `event ${type} not used` };
}

// ---------------------------------------------------------------- Shopify

export async function verifyShopify(secret: string, header: string | null, body: string) {
  return !!header && constantTimeEqual(header.trim(), await hmacBase64(secret, body));
}

/** orders/paid (orders/create when already paid), refunds/create. Visitor id comes from the cart attribute ml_visitor_id. */
export function parseShopify(topic: string | null, o: any, site: Site): WebhookAction {
  if (topic === 'orders/paid' || (topic === 'orders/create' && o?.financial_status === 'paid')) {
    const currency = upper(o.currency, site.currency);
    const meta = kv(o.note_attributes);
    const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || null;
    return {
      kind: 'payment',
      payment: {
        id: `shopify_${o.id}`,
        provider: 'shopify',
        ts: tsOf(o.processed_at, o.created_at),
        amount: decimalToMinor(o.current_total_price ?? o.total_price, currency),
        kind: 'payment',
        currency,
        visitorId: pick(meta, VISITOR_KEYS),
        sessionId: pick(meta, SESSION_KEYS),
        customerId: o.customer?.id != null ? `shopify_${o.customer.id}` : null,
        email: str(o.email ?? o.contact_email ?? o.customer?.email)?.toLowerCase() ?? null,
        name,
        claimIds: [o.checkout_token, o.cart_token, o.token].map(str).filter(Boolean) as string[],
      },
    };
  }
  if (topic === 'refunds/create') {
    const tx = Array.isArray(o?.transactions) ? o.transactions.filter((t: any) => t.kind === 'refund' && t.status === 'success') : [];
    const currency = upper(tx[0]?.currency, site.currency);
    const amount = tx.reduce((s: number, t: any) => s + decimalToMinor(t.amount, currency), 0);
    if (!amount) return { kind: 'ignore', reason: 'refund without a successful refund transaction' };
    return { kind: 'refund', refundId: `shopify_refund_${o.id}`, paymentId: o.order_id != null ? `shopify_${o.order_id}` : null, amount, currency, ts: tsOf(o.processed_at, o.created_at) };
  }
  return { kind: 'ignore', reason: `topic ${topic} not used` };
}

// ---------------------------------------------------------------- WooCommerce

export const verifyWoo = verifyShopify;

/** order.created / order.updated: counted once paid (processing/completed); refunds listed on the order. */
export function parseWoo(topic: string | null, o: any, site: Site): WebhookAction[] {
  if (!topic?.startsWith('order.')) return [{ kind: 'ignore', reason: `topic ${topic} not used` }];
  const currency = upper(o?.currency, site.currency);
  const out: WebhookAction[] = [];
  const paid = ['processing', 'completed', 'refunded'].includes(o?.status) && (o?.date_paid_gmt || o?.date_paid || o?.status !== 'refunded');
  if (paid) {
    const meta = kv(o.meta_data);
    out.push({
      kind: 'payment',
      payment: {
        id: `woo_${o.id}`,
        provider: 'woocommerce',
        ts: tsOf(o.date_paid_gmt ? o.date_paid_gmt + 'Z' : null, o.date_created_gmt ? o.date_created_gmt + 'Z' : null, o.date_created),
        amount: decimalToMinor(o.total, currency),
        kind: 'payment',
        currency,
        visitorId: pick(meta, VISITOR_KEYS) ?? pick(meta, VISITOR_KEYS.map((k) => '_' + k)),
        sessionId: pick(meta, SESSION_KEYS) ?? pick(meta, SESSION_KEYS.map((k) => '_' + k)),
        customerId: o.customer_id ? `woo_${o.customer_id}` : null,
        email: str(o.billing?.email)?.toLowerCase() ?? null,
        name: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(' ') || null,
      },
    });
  }
  for (const r of Array.isArray(o?.refunds) ? o.refunds : []) {
    const amount = decimalToMinor(r.total, currency);
    if (amount) out.push({ kind: 'refund', refundId: `woo_refund_${r.id}`, paymentId: `woo_${o.id}`, amount, currency, ts: tsOf(r.date_created_gmt ? r.date_created_gmt + 'Z' : null, o.date_modified_gmt ? o.date_modified_gmt + 'Z' : null, o.date_modified) });
  }
  return out.length ? out : [{ kind: 'ignore', reason: `order ${o?.status ?? '?'} not paid yet` }];
}

// ---------------------------------------------------------------- Kajabi

/** Purchase / Payment Succeeded outbound webhooks. Uses the offer-level amount (order bumps share the transaction total). */
export function parseKajabi(event: any, site: Site): WebhookAction {
  const p = event?.payload ?? event ?? {};
  const tx = p.transaction ?? p.payment_transaction ?? {};
  const offer = p.offer ?? {};
  const member = p.member ?? {};
  const currency = upper(tx.currency, site.currency);
  const amount = offer.total_amount != null ? Math.abs(Number(offer.total_amount)) : tx.amount_paid != null ? Math.abs(Number(tx.amount_paid)) : decimalToMinor(tx.amount_paid_decimal, currency);
  const txId = tx.transaction_id ?? tx.id;
  if (!txId && !p.id) return { kind: 'ignore', reason: 'no transaction id' };
  if (!amount) return { kind: 'ignore', reason: 'free offer' };
  const meta = { ...(p.custom_fields ?? {}), ...(p.metadata ?? {}) };
  return {
    kind: 'payment',
    payment: {
      id: `kajabi_${txId ?? p.id}${offer.id != null ? `_${offer.id}` : ''}`,
      provider: 'kajabi',
      ts: tsOf(tx.transaction_created_at, tx.created_at, p.created_at),
      amount,
      kind: 'payment',
      currency,
      visitorId: pick(meta, VISITOR_KEYS),
      sessionId: pick(meta, SESSION_KEYS),
      customerId: member.id != null ? `kajabi_${member.id}` : null,
      email: str(member.email)?.toLowerCase() ?? null,
      name: str(member.name) ?? ([member.first_name, member.last_name].filter(Boolean).join(' ') || null),
      renewal: offer.type === 'subscription' && event?.event === 'payment_succeeded',
    },
  };
}

// ---------------------------------------------------------------- Podia (Zapier "New sale" → Webhooks by Zapier)

/** Flat JSON from Zapier/Make: { id|sale_id, amount|price (decimal), currency, email, name, visitor_id?, refunded? }. */
export function parseFlatSale(b: any, site: Site, provider: string): WebhookAction {
  const id = str(b?.sale_id) ?? str(b?.id) ?? (b?.id != null ? String(b.id) : null);
  if (!id) return { kind: 'ignore', reason: 'missing sale id' };
  const currency = upper(b.currency, site.currency);
  const amount = b.amount_cents != null ? Math.abs(Number(b.amount_cents)) : decimalToMinor(b.amount ?? b.price ?? b.total, currency);
  if (b.refunded === true || b.type === 'refund') {
    return { kind: 'refund', refundId: `${provider}_refund_${id}`, paymentId: `${provider}_${id}`, amount, currency, ts: tsOf(b.created_at, b.date) };
  }
  if (!amount) return { kind: 'ignore', reason: 'free sale' };
  return {
    kind: 'payment',
    payment: {
      id: `${provider}_${id}`.slice(0, 120),
      provider,
      ts: tsOf(b.created_at, b.date, b.purchased_at),
      amount,
      kind: 'payment',
      currency,
      visitorId: pick(b, VISITOR_KEYS),
      sessionId: pick(b, SESSION_KEYS),
      customerId: str(b.customer_id),
      email: str(b.email ?? b.customer_email)?.toLowerCase() ?? null,
      name: str(b.name ?? b.customer_name),
    },
  };
}

export const TOKEN_PROVIDERS = new Set(['kajabi', 'podia']);

/** Verify a webhook for one of the providers in this file. */
export async function verifyExtra(provider: string, secret: string, c: Context<AppEnv>, body: string): Promise<boolean> {
  if (provider === 'paddle') return verifyPaddle(secret, c.req.header('paddle-signature') ?? null, body);
  if (provider === 'shopify') return verifyShopify(secret, c.req.header('x-shopify-hmac-sha256') ?? null, body);
  if (provider === 'woocommerce') return verifyWoo(secret, c.req.header('x-wc-webhook-signature') ?? null, body);
  if (TOKEN_PROVIDERS.has(provider)) {
    const t = c.req.query('token') ?? c.req.header('x-minilytics-token') ?? '';
    return t.length === secret.length && constantTimeEqual(t, secret);
  }
  return false;
}

export function parseExtra(provider: string, c: Context<AppEnv>, event: any, site: Site): WebhookAction[] {
  if (provider === 'paddle') return [parsePaddle(event, site)];
  if (provider === 'shopify') return [parseShopify(c.req.header('x-shopify-topic') ?? null, event, site)];
  if (provider === 'woocommerce') return parseWoo(c.req.header('x-wc-webhook-topic') ?? null, event, site);
  if (provider === 'kajabi') return [parseKajabi(event, site)];
  return [parseFlatSale(event, site, provider)];
}

// ---------------------------------------------------------------- revenue summary

export async function revenueSummary(ctx: Ctx) {
  const { db, site, range } = ctx;
  const r = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END) AS gross,
         SUM(CASE WHEN kind = 'payment' AND renewal = 0 THEN amount ELSE 0 END) AS new_revenue,
         SUM(CASE WHEN kind = 'payment' AND renewal = 1 THEN amount ELSE 0 END) AS renewals,
         SUM(CASE WHEN kind = 'refund' THEN -amount ELSE 0 END) AS refunds,
         SUM(CASE WHEN kind = 'payment' THEN 1 ELSE 0 END) AS payments,
         SUM(CASE WHEN kind = 'refund' THEN 1 ELSE 0 END) AS refund_count,
         SUM(CASE WHEN orig_currency IS NOT NULL THEN 1 ELSE 0 END) AS converted,
         COUNT(DISTINCT CASE WHEN kind = 'payment' THEN COALESCE(customer_id, email, visitor_id, id) END) AS customers
       FROM payments WHERE site_id = ? AND ts >= ? AND ts < ?`,
    )
    .bind(site.id, range.from, range.to)
    .first<Record<string, number | null>>();
  const by = await db
    .prepare(`SELECT provider, SUM(amount) AS revenue, COUNT(*) AS n FROM payments WHERE site_id = ? AND ts >= ? AND ts < ? GROUP BY provider ORDER BY revenue DESC`)
    .bind(site.id, range.from, range.to)
    .all<{ provider: string; revenue: number; n: number }>();
  const other = await db
    .prepare(`SELECT currency, COUNT(*) AS n FROM payments WHERE site_id = ? AND ts >= ? AND ts < ? AND currency != ? GROUP BY currency`)
    .bind(site.id, range.from, range.to, site.currency)
    .all<{ currency: string; n: number }>();
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    currency: site.currency,
    decimals: currencyDecimals(site.currency),
    gross: n('gross'),
    newRevenue: n('new_revenue'),
    renewals: n('renewals'),
    refunds: n('refunds'),
    net: n('gross') - n('refunds'),
    payments: n('payments'),
    refundCount: n('refund_count'),
    customers: n('customers'),
    convertedPayments: n('converted'),
    /** Payments whose rate was unavailable, still in their own currency (excluded from nothing, flagged). */
    unconverted: other.results.map((x) => ({ currency: x.currency, payments: Number(x.n) })),
    providers: by.results.map((x) => ({ provider: x.provider, revenue: Number(x.revenue), payments: Number(x.n) })),
    fxSource: 'Banque centrale européenne (via frankfurter.dev), taux du jour du paiement',
  };
}

// ---------------------------------------------------------------- revenue prediction

const PRED_LOOKBACK = 90 * 86_400_000;
const MIN_CONVERSIONS = 5;
const PRIOR = 10; // pseudo-visitors pulling small segments toward the base rate

interface Factor { key: string; label: string; value: string; lift: number }

/**
 * Explainable conversion model on the site's own last 90 days:
 *   P(convert | visitor) = base rate × Π lift(feature), lift = smoothed segment rate / base rate,
 * for 4 features known at visit time (channel, country, device, engaged visit). Expected value = P × average
 * first-order value. It's an estimate: the factors are shown so anyone can see why a visitor scores high.
 */
export async function revenuePrediction(ctx: Ctx, now = Date.now()) {
  const { db, site } = ctx;
  const from = now - PRED_LOOKBACK;
  const visitors = await db
    .prepare(
      `SELECT s.visitor_id,
              MIN(s.channel) AS channel, MIN(s.country) AS country, MIN(s.device) AS device,
              MAX(CASE WHEN s.pageviews > 1 OR s.goals > 0 THEN 1 ELSE 0 END) AS engaged,
              MAX(CASE WHEN p.visitor_id IS NOT NULL THEN 1 ELSE 0 END) AS converted
       FROM sessions s
       LEFT JOIN (SELECT DISTINCT visitor_id FROM payments WHERE site_id = ? AND kind = 'payment' AND renewal = 0 AND ts >= ? AND visitor_id IS NOT NULL) p
         ON p.visitor_id = s.visitor_id
       WHERE s.site_id = ? AND s.started_at >= ?
       GROUP BY s.visitor_id`,
    )
    .bind(site.id, from, site.id, from)
    .all<{ visitor_id: string; channel: string | null; country: string | null; device: string | null; engaged: number; converted: number }>();
  const rows = visitors.results;
  const aovRow = await db
    .prepare(`SELECT AVG(amount) AS aov, COUNT(*) AS n FROM payments WHERE site_id = ? AND kind = 'payment' AND renewal = 0 AND ts >= ?`)
    .bind(site.id, from)
    .first<{ aov: number | null; n: number }>();
  const conversions = rows.filter((r) => Number(r.converted)).length;
  const base = rows.length ? conversions / rows.length : 0;
  const aov = Math.round(Number(aovRow?.aov ?? 0));
  const model = { lookbackDays: 90, visitors: rows.length, conversions, baseRate: base, averageOrderValue: aov, currency: site.currency, decimals: currencyDecimals(site.currency) };
  const forecast = await revenueForecast(ctx, now);
  if (conversions < MIN_CONVERSIONS || !aov) {
    return { ready: false, reason: `Il faut au moins ${MIN_CONVERSIONS} premiers achats attribués à une visite sur 90 jours (actuellement ${conversions}).`, model, factors: [], visitors: [], forecast };
  }
  const FEATS: { key: 'channel' | 'country' | 'device' | 'engaged'; label: string }[] = [
    { key: 'channel', label: 'Canal' },
    { key: 'country', label: 'Pays' },
    { key: 'device', label: 'Appareil' },
    { key: 'engaged', label: 'Visite engagée' },
  ];
  const valueOf = (r: any, k: string) => (k === 'engaged' ? (Number(r.engaged) ? 'oui' : 'non') : String(r[k] ?? '—'));
  const lifts = new Map<string, number>();
  const factors: Factor[] = [];
  for (const f of FEATS) {
    const g = new Map<string, { n: number; c: number }>();
    for (const r of rows) {
      const v = valueOf(r, f.key);
      const e = g.get(v) ?? { n: 0, c: 0 };
      e.n++;
      e.c += Number(r.converted) ? 1 : 0;
      g.set(v, e);
    }
    for (const [v, e] of g) {
      const rate = (e.c + PRIOR * base) / (e.n + PRIOR);
      const lift = rate / base;
      lifts.set(`${f.key}:${v}`, lift);
      if (e.n >= 5) factors.push({ key: f.key, label: f.label, value: v, lift: Math.round(lift * 100) / 100 });
    }
  }
  factors.sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)));
  // Score visitors seen in the last 7 days who haven't bought yet.
  const recent = await db
    .prepare(
      `SELECT s.visitor_id, MIN(s.channel) AS channel, MIN(s.country) AS country, MIN(s.device) AS device,
              MAX(CASE WHEN s.pageviews > 1 OR s.goals > 0 THEN 1 ELSE 0 END) AS engaged, MAX(s.last_seen_at) AS last_seen,
              MAX(v.name) AS name, MAX(v.email) AS email
       FROM sessions s LEFT JOIN visitors v ON v.site_id = s.site_id AND v.id = s.visitor_id
       WHERE s.site_id = ? AND s.started_at >= ?
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.site_id = s.site_id AND p.visitor_id = s.visitor_id AND p.kind = 'payment')
       GROUP BY s.visitor_id ORDER BY last_seen DESC LIMIT 2000`,
    )
    .bind(site.id, now - 7 * 86_400_000)
    .all<any>();
  const scored = recent.results.map((r) => {
    const why = FEATS.map((f) => ({ label: f.label, value: valueOf(r, f.key), lift: lifts.get(`${f.key}:${valueOf(r, f.key)}`) ?? 1 }));
    const p = Math.min(0.95, base * why.reduce((m, w) => m * w.lift, 1));
    return {
      visitorId: r.visitor_id,
      name: r.name ?? null,
      lastSeen: Number(r.last_seen),
      probability: Math.round(p * 1000) / 1000,
      expectedValue: Math.round(p * aov),
      why: why.filter((w) => Math.abs(w.lift - 1) >= 0.1).sort((a, b) => b.lift - a.lift).map((w) => ({ ...w, lift: Math.round(w.lift * 100) / 100 })),
    };
  });
  scored.sort((a, b) => b.expectedValue - a.expectedValue);
  return {
    ready: true,
    model,
    factors: factors.slice(0, 12),
    visitors: scored.slice(0, 50),
    pipeline: scored.reduce((s, v) => s + v.expectedValue, 0),
    forecast,
  };
}

/** Month-to-date revenue and a run-rate projection for the month (average daily revenue of the last 28 days). */
export async function revenueForecast(ctx: Ctx, now = Date.now()) {
  const { db, site } = ctx;
  const tz = site.timezone;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)).split('-').map(Number);
  const [y, m, day] = parts;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = startOfDay(now - (day - 1) * 86_400_000, tz);
  const r = await db
    .prepare(`SELECT SUM(CASE WHEN ts >= ? THEN amount ELSE 0 END) AS mtd, SUM(amount) AS last28 FROM payments WHERE site_id = ? AND ts >= ?`)
    .bind(monthStart, site.id, Math.min(monthStart, now - 28 * 86_400_000))
    .first<{ mtd: number | null; last28: number | null }>();
  const l28 = await db.prepare(`SELECT SUM(amount) AS s FROM payments WHERE site_id = ? AND ts >= ?`).bind(site.id, now - 28 * 86_400_000).first<{ s: number | null }>();
  const daily = Number(l28?.s ?? 0) / 28;
  const mtd = Number(r?.mtd ?? 0);
  return { monthToDate: mtd, dailyRunRate: Math.round(daily), projectedMonth: Math.round(mtd + daily * (daysInMonth - day)), daysLeft: daysInMonth - day, method: 'Revenu du mois + moyenne quotidienne des 28 derniers jours × jours restants' };
}

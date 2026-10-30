import type { Context } from 'hono';
import type { AppEnv, Site } from './env.js';
import { bucketLabels, bucketSql, resolveRange, tzOffset, type Range } from './lib/time.js';
import { currencyDecimals } from './payments.js';

/** Filters that live on the session row (clicking a row in the dashboard adds one of these). */
const SESSION_FILTERS = [
  'channel',
  'source',
  'referrer_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'country',
  'region',
  'city',
  'browser',
  'os',
  'device',
  'entry_page',
  'exit_page',
  'hostname',
  'language',
  'screen',
] as const;

/** Filter operators, as in « Pays est France », « Source n’est pas Google », « Page contient /blog ». */
export type FilterOp = 'is' | 'not' | 'contains';
export type FilterKey = (typeof SESSION_FILTERS)[number] | 'page' | 'goal' | 'visitor_type';
export type Filters = Partial<Record<FilterKey, { op: FilterOp; v: string }>>;
const FILTER_KEYS: readonly FilterKey[] = [...SESSION_FILTERS, 'page', 'goal', 'visitor_type'];
const OPS: readonly FilterOp[] = ['is', 'not', 'contains'];

/** `{"country":"FR"}` (is) or `{"source":{"op":"not","v":"Google"}}`. Unknown keys and operators are dropped. */
export function parseFilters(raw: string | Record<string, unknown> | undefined): Filters {
  if (!raw) return {};
  let obj: Record<string, unknown>;
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Filters = {};
  for (const k of FILTER_KEYS) {
    const val = obj[k];
    if (typeof val === 'string') out[k] = { op: 'is', v: val.slice(0, 500) };
    else if (val && typeof val === 'object' && typeof (val as any).v === 'string' && OPS.includes((val as any).op)) {
      out[k] = { op: (val as any).op, v: ((val as any).v as string).slice(0, 500) };
    }
  }
  return out;
}

/** LIKE pattern for « contains », case-insensitive, with % and _ escaped. */
export const likeContains = (v: string) => '%' + v.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%';

/** SQL + params restricting sessions `s` by the dashboard filters (not by time). */
export function filterSql(f: Filters): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const k of SESSION_FILTERS) {
    const fv = f[k];
    if (!fv) continue;
    const col = `s.${k}`;
    if (fv.op === 'contains') {
      if (!fv.v) continue;
      parts.push(`LOWER(${col}) LIKE ? ESCAPE '\\'`);
      params.push(likeContains(fv.v));
    } else if (fv.op === 'not') {
      if (fv.v === '') parts.push(`${col} IS NOT NULL`);
      else {
        parts.push(`(${col} IS NULL OR ${col} != ?)`);
        params.push(fv.v);
      }
    } else if (fv.v === '') parts.push(`${col} IS NULL`);
    else {
      parts.push(`${col} = ?`);
      params.push(fv.v);
    }
  }
  for (const [k, type, col] of [['page', 'pageview', 'path'], ['goal', 'goal', 'name']] as const) {
    const fv = f[k];
    if (!fv || !fv.v) continue;
    const cond = fv.op === 'contains' ? `LOWER(fe.${col}) LIKE ? ESCAPE '\\'` : `fe.${col} = ?`;
    parts.push(`${fv.op === 'not' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM events fe WHERE fe.site_id = s.site_id AND fe.session_id = s.id AND fe.type = '${type}' AND ${cond})`);
    params.push(fv.op === 'contains' ? likeContains(fv.v) : fv.v);
  }
  const vt = f.visitor_type;
  if (vt && vt.v) {
    const isNew = /^(new|nouveau|1)$/i.test(vt.v) ? 1 : 0;
    parts.push(`s.is_new = ${vt.op === 'not' ? 1 - isNew : isNew}`);
  }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}

export const hasFilters = (f: Filters) => Object.keys(f).length > 0;

export interface Ctx {
  db: D1Database;
  site: Site;
  range: Range;
  filters: Filters;
  offset: number;
}

export function makeCtx(c: Context<AppEnv>): Ctx {
  const site = c.get('site');
  const q = c.req.query();
  const range = resolveRange(q, site.timezone, site.created_at);
  return { db: c.env.DB, site, range, filters: parseFilters(q.filters), offset: tzOffset(site.timezone, range.to) };
}

function sessionsWhere(ctx: Ctx, from = ctx.range.from, to = ctx.range.to) {
  const f = filterSql(ctx.filters);
  return {
    sql: `s.site_id = ? AND s.started_at >= ? AND s.started_at < ?${f.sql}`,
    params: [ctx.site.id, from, to, ...f.params],
  };
}

/** Payments in the period; with filters, only those credited to a matching visit. */
function paymentsFrom(ctx: Ctx, from = ctx.range.from, to = ctx.range.to) {
  if (!hasFilters(ctx.filters)) {
    return { sql: `payments p WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?`, params: [ctx.site.id, from, to] };
  }
  const f = filterSql(ctx.filters);
  return {
    sql: `payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id
          WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?${f.sql}`,
    params: [ctx.site.id, from, to, ...f.params],
  };
}

/** A session is engaged when it viewed 2+ pages, converted, interacted (click, video, search…) or stayed active ≥ 10 s. */
export const ENGAGED_MS = 10_000;
export const BOUNCE_SQL = `(s.pageviews <= 1 AND s.goals = 0 AND COALESCE(s.interactions, 0) = 0 AND COALESCE(s.engaged_ms, 0) < ${ENGAGED_MS})`;

const KPI_SQL = (where: string) => `
  SELECT COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, COALESCE(SUM(s.pageviews), 0) AS pageviews,
         COALESCE(SUM(CASE WHEN ${BOUNCE_SQL} THEN 1 ELSE 0 END), 0) AS bounces,
         COALESCE(AVG(s.duration), 0) AS avg_duration,
         COALESCE(AVG(COALESCE(s.engaged_ms, 0)), 0) AS avg_engaged_ms,
         COALESCE(SUM(COALESCE(s.interactions, 0)), 0) AS interactions
  FROM sessions s WHERE ${where}`;

const REVENUE_SQL = (from: string) => `
  SELECT COALESCE(SUM(p.amount), 0) AS revenue,
         COUNT(DISTINCT CASE WHEN p.kind = 'payment' AND p.renewal = 0 THEN COALESCE(p.visitor_id, p.id) END) AS customers,
         COALESCE(SUM(CASE WHEN p.kind = 'payment' THEN 1 ELSE 0 END), 0) AS payments
  FROM ${from}`;

interface KpiRow {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounces: number;
  avg_duration: number;
  avg_engaged_ms?: number;
  interactions?: number;
}
interface RevRow {
  revenue: number;
  customers: number;
  payments: number;
}

function kpis(k: KpiRow, r: RevRow) {
  return {
    visitors: k.visitors,
    sessions: k.sessions,
    pageviews: k.pageviews,
    bounceRate: k.sessions ? k.bounces / k.sessions : 0,
    engagedSessions: k.sessions - k.bounces,
    engagementRate: k.sessions ? (k.sessions - k.bounces) / k.sessions : 0,
    avgDuration: Math.round(k.avg_duration),
    avgEngagedMs: Math.round(Number(k.avg_engaged_ms ?? 0)),
    interactions: Number(k.interactions ?? 0),
    revenue: r.revenue,
    payments: r.payments,
    customers: r.customers,
    conversionRate: k.visitors ? r.customers / k.visitors : 0,
    revenuePerVisitor: k.visitors ? r.revenue / k.visitors : 0,
  };
}

/** Top numbers + chart. */
export async function overview(ctx: Ctx) {
  const { db, range, site } = ctx;
  const prevFrom = range.from - (range.to - range.from);
  const cur = sessionsWhere(ctx);
  const prev = sessionsWhere(ctx, prevFrom, range.from);
  const curPay = paymentsFrom(ctx);
  const prevPay = paymentsFrom(ctx, prevFrom, range.from);
  const sb = bucketSql('s.started_at', range.granularity, ctx.offset);
  const pb = bucketSql('p.ts', range.granularity, ctx.offset);
  const now = Date.now();

  const prevRange = { ...range, from: prevFrom, to: range.from };
  const [k1, k0, r1, r0, online, ts, tr, tp] = await db.batch([
    db.prepare(KPI_SQL(cur.sql)).bind(...cur.params),
    db.prepare(KPI_SQL(prev.sql)).bind(...prev.params),
    db.prepare(REVENUE_SQL(curPay.sql)).bind(...curPay.params),
    db.prepare(REVENUE_SQL(prevPay.sql)).bind(...prevPay.params),
    db
      .prepare('SELECT COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND started_at > ? AND last_seen_at > ?')
      .bind(site.id, now - 6 * 3_600_000, now - 5 * 60_000),
    db
      .prepare(
        `SELECT ${sb} AS b, COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews,
                SUM(CASE WHEN ${BOUNCE_SQL} THEN 1 ELSE 0 END) AS bounces, AVG(s.duration) AS avg_duration
         FROM sessions s WHERE ${cur.sql} GROUP BY b`,
      )
      .bind(...cur.params),
    db
      .prepare(
        `SELECT ${pb} AS b, SUM(p.amount) AS revenue, SUM(CASE WHEN p.kind = 'payment' THEN 1 ELSE 0 END) AS payments,
                COUNT(DISTINCT CASE WHEN p.kind = 'payment' AND p.renewal = 0 THEN COALESCE(p.visitor_id, p.id) END) AS customers
         FROM ${curPay.sql} GROUP BY b`,
      )
      .bind(...curPay.params),
    db
      .prepare(`SELECT ${sb} AS b, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s WHERE ${prev.sql} GROUP BY b`)
      .bind(...prev.params),
  ]);

  const visitorsBy = new Map((ts.results as any[]).map((r) => [r.b, r]));
  const revenueBy = new Map((tr.results as any[]).map((r) => [r.b, r]));
  const labels = bucketLabels(range, ctx.offset);
  const series = labels.map((b) => {
    const v = visitorsBy.get(b);
    const r = revenueBy.get(b);
    const visitors = Number(v?.visitors ?? 0);
    const sessions = Number(v?.sessions ?? 0);
    const revenue = Number(r?.revenue ?? 0);
    const customers = Number(r?.customers ?? 0);
    return {
      bucket: b,
      visitors,
      pageviews: Number(v?.pageviews ?? 0),
      revenue,
      payments: Number(r?.payments ?? 0),
      // Metric trends (DataFast-style): conversion rate, revenue per visitor, bounce rate, session time.
      sessions,
      customers,
      conversionRate: visitors ? customers / visitors : 0,
      revenuePerVisitor: visitors ? revenue / visitors : 0,
      bounceRate: sessions ? Number(v?.bounces ?? 0) / sessions : 0,
      avgDuration: Math.round(Number(v?.avg_duration ?? 0)),
    };
  });
  // Previous period, aligned bucket-by-bucket with the current one so the chart can overlay it.
  const prevBy = new Map((tp.results as any[]).map((r) => [r.b, r.visitors]));
  const prevLabels = bucketLabels(prevRange, ctx.offset);
  const shift = prevLabels.length - labels.length;
  series.forEach((row, i) => {
    (row as any).prevVisitors = prevBy.get(prevLabels[i + shift]) ?? 0;
  });

  return {
    range,
    currency: site.currency,
    decimals: currencyDecimals(site.currency),
    current: kpis(k1.results[0] as KpiRow, r1.results[0] as RevRow),
    previous: kpis(k0.results[0] as KpiRow, r0.results[0] as RevRow),
    online: (online.results[0] as { n: number }).n,
    series,
  };
}

/** Session dimensions, keyed by the name the dashboard asks for. */
const SESSION_DIMS: Record<string, string> = {
  channel: 's.channel',
  source: 's.source',
  campaign: 's.utm_campaign',
  keyword: 's.utm_term',
  utm_source: 's.utm_source',
  utm_medium: 's.utm_medium',
  utm_content: 's.utm_content',
  ref: 's.ref',
  country: 's.country',
  region: 's.region',
  city: 's.city',
  browser: 's.browser',
  os: 's.os',
  device: 's.device',
  entry_page: 's.entry_page',
  exit_page: 's.exit_page',
  hostname: 's.hostname',
  referrer: 's.referrer',
  language: 's.language',
  screen: 's.screen',
  visitor_type: "CASE WHEN s.is_new = 1 THEN 'Nouveau' WHEN s.is_new = 0 THEN 'Récurrent' END",
};

export interface BreakdownRow {
  label: string | null;
  visitors: number;
  pageviews?: number;
  revenue: number;
  customers: number;
  icon?: string | null;
  extra?: string | null;
}

export async function breakdown(ctx: Ctx, dim: string, limit = 100): Promise<BreakdownRow[]> {
  const { db } = ctx;
  const lim = Math.max(1, Math.min(500, Math.floor(Number(limit)) || 100));

  // Own keys only: `constructor`/`toString` must not resolve to inherited members interpolated into SQL.
  if (Object.prototype.hasOwnProperty.call(SESSION_DIMS, dim)) {
    const col = SESSION_DIMS[dim];
    const w = sessionsWhere(ctx);
    const pay = paymentsFrom(ctx);
    // Payments need the session columns even without filters.
    const payJoin = hasFilters(ctx.filters)
      ? pay
      : {
          sql: `payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ?`,
          params: pay.params,
        };
    const extraCol =
      dim === 'source' ? 'MAX(s.referrer_domain)' : dim === 'region' || dim === 'city' ? 'MAX(s.country)' : 'NULL';
    const [v, r] = await db.batch([
      db
        .prepare(
          `SELECT ${col} AS label, COUNT(DISTINCT s.visitor_id) AS visitors, SUM(s.pageviews) AS pageviews, ${extraCol} AS extra
           FROM sessions s WHERE ${w.sql} GROUP BY label ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...w.params),
      db
        .prepare(
          `SELECT ${col} AS label, SUM(p.amount) AS revenue,
                  COUNT(DISTINCT CASE WHEN p.kind = 'payment' THEN COALESCE(p.visitor_id, p.id) END) AS customers
           FROM ${payJoin.sql} GROUP BY label`,
        )
        .bind(...payJoin.params),
    ]);
    return merge(v.results as any[], r.results as any[]);
  }

  if (dim === 'page') {
    const f = filterSql(ctx.filters);
    const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
    const params = [ctx.site.id, ctx.range.from, ctx.range.to, ...f.params];
    const base = `FROM events e ${join} WHERE e.site_id = ? AND e.type = 'pageview' AND e.ts >= ? AND e.ts < ?${f.sql}`;
    const [v, r] = await db.batch([
      db
        .prepare(
          `SELECT e.path AS label, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(*) AS pageviews ${base}
           GROUP BY e.path ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...params),
      // Revenue from customers who viewed the page during the period.
      db
        .prepare(
          `SELECT pv.label, SUM(p.amount) AS revenue, COUNT(DISTINCT p.visitor_id) AS customers
           FROM (SELECT DISTINCT e.path AS label, e.visitor_id ${base}) pv
           JOIN payments p ON p.site_id = ? AND p.visitor_id = pv.visitor_id AND p.ts >= ? AND p.ts < ?
           GROUP BY pv.label`,
        )
        .bind(...params, ctx.site.id, ctx.range.from, ctx.range.to),
    ]);
    return merge(v.results as any[], r.results as any[]);
  }

  if (dim === 'action' || dim === 'search' || dim === 'share') {
    // Custom UI interactions (minilytics('event', name, { label })). `search` lists the queries typed.
    const f = filterSql(ctx.filters);
    const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
    const labelCol = dim === 'action' ? 'e.name' : dim === 'search' ? 'LOWER(e.label)' : 'e.label';
    const nameSql = dim === 'action' ? '' : ' AND e.name = ?';
    const params = [ctx.site.id, ctx.range.from, ctx.range.to, ...(dim === 'action' ? [] : [dim]), ...f.params];
    const r = await db
      .prepare(
        `SELECT ${labelCol} AS label, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(*) AS pageviews
         FROM events e ${join} WHERE e.site_id = ? AND e.type = 'action' AND e.ts >= ? AND e.ts < ?${nameSql}${f.sql}
         GROUP BY 1 ORDER BY pageviews DESC LIMIT ${lim}`,
      )
      .bind(...params)
      .all();
    return merge(r.results as any[], []);
  }

  if (dim === 'exit_link' || dim === 'goal') {
    const type = dim === 'goal' ? 'goal' : 'outbound';
    const f = filterSql(ctx.filters);
    const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
    const params = [ctx.site.id, type, ctx.range.from, ctx.range.to, ...f.params];
    const base = `FROM events e ${join} WHERE e.site_id = ? AND e.type = ? AND e.ts >= ? AND e.ts < ?${f.sql}`;
    const [v, r] = await db.batch([
      db
        .prepare(
          `SELECT e.name AS label, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(*) AS pageviews ${base}
           GROUP BY e.name ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...params),
      db
        .prepare(
          `SELECT g.label, SUM(p.amount) AS revenue, COUNT(DISTINCT p.visitor_id) AS customers
           FROM (SELECT DISTINCT e.name AS label, e.visitor_id ${base}) g
           JOIN payments p ON p.site_id = ? AND p.visitor_id = g.visitor_id AND p.ts >= ? AND p.ts < ?
           GROUP BY g.label`,
        )
        .bind(...params, ctx.site.id, ctx.range.from, ctx.range.to),
    ]);
    return merge(v.results as any[], r.results as any[]);
  }

  throw new Error(`unknown dimension ${dim}`);
}

function merge(visits: any[], revenue: any[]): BreakdownRow[] {
  const rev = new Map(revenue.map((r) => [r.label, r]));
  const rows: BreakdownRow[] = visits.map((v) => ({
    label: v.label,
    visitors: v.visitors,
    pageviews: v.pageviews ?? undefined,
    revenue: rev.get(v.label)?.revenue ?? 0,
    customers: rev.get(v.label)?.customers ?? 0,
    extra: v.extra ?? null,
  }));
  // Sources that made money but had no visits in this period (paid later) still show up.
  const seen = new Set(visits.map((v) => v.label));
  for (const r of revenue) if (!seen.has(r.label)) rows.push({ label: r.label, visitors: 0, revenue: r.revenue, customers: r.customers });
  return rows;
}

/** Customers in the period, with where they came from (the "Journey" tab). */
export async function customers(ctx: Ctx) {
  const { db, site, range } = ctx;
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN' : 'LEFT JOIN';
  const res = await db
    .prepare(
      `SELECT p.id, p.ts, p.amount, p.currency, p.renewal, p.matched_by, p.email AS pay_email, p.name AS pay_name, p.visitor_id, p.session_id,
              v.first_seen, v.name, v.email, v.user_id,
              s.source, s.channel, s.referrer_domain, s.utm_campaign, s.ref, s.country, s.city, s.device, s.os, s.browser, s.entry_page,
              (SELECT COUNT(*) FROM sessions s2 WHERE s2.site_id = p.site_id AND s2.visitor_id = p.visitor_id AND s2.started_at <= p.ts) AS visits
       FROM payments p
       LEFT JOIN visitors v ON v.site_id = p.site_id AND v.id = p.visitor_id
       ${join} sessions s ON s.site_id = p.site_id AND s.id = p.session_id
       WHERE p.site_id = ? AND p.kind = 'payment' AND p.ts >= ? AND p.ts < ?${f.sql}
       ORDER BY p.ts DESC LIMIT 200`,
    )
    .bind(site.id, range.from, range.to, ...f.params)
    .all();
  return res.results;
}

/** Recent visitors in the period (the "Users" tab). */
export async function visitors(ctx: Ctx) {
  const w = sessionsWhere(ctx);
  const res = await ctx.db
    .prepare(
      `SELECT t.*, v.name, v.email, v.user_id, v.first_seen,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.site_id = t.site_id AND p.visitor_id = t.visitor_id) AS spent
       FROM (
         SELECT s.site_id, s.visitor_id, MAX(s.last_seen_at) AS last_seen, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews,
                SUM(s.duration) AS duration, MAX(s.source) AS source, MAX(s.referrer_domain) AS referrer_domain, MAX(s.country) AS country,
                MAX(s.city) AS city, MAX(s.device) AS device, MAX(s.os) AS os, MAX(s.browser) AS browser
         FROM sessions s WHERE ${w.sql} GROUP BY s.site_id, s.visitor_id ORDER BY last_seen DESC LIMIT 200
       ) t LEFT JOIN visitors v ON v.site_id = t.site_id AND v.id = t.visitor_id
       ORDER BY t.last_seen DESC`,
    )
    .bind(...w.params)
    .all();
  return res.results;
}

/** Everything one visitor did: visits, pages, clicks, payments. */
export async function visitorProfile(db: D1Database, site: Site, vid: string) {
  const [v, s, e, p] = await db.batch([
    db.prepare('SELECT * FROM visitors WHERE site_id = ? AND id = ?').bind(site.id, vid),
    db.prepare('SELECT * FROM sessions WHERE site_id = ? AND visitor_id = ? ORDER BY started_at DESC LIMIT 100').bind(site.id, vid),
    db
      .prepare('SELECT session_id, ts, type, name, path, props FROM events WHERE site_id = ? AND visitor_id = ? ORDER BY ts DESC LIMIT 1000')
      .bind(site.id, vid),
    db.prepare('SELECT * FROM payments WHERE site_id = ? AND visitor_id = ? ORDER BY ts DESC').bind(site.id, vid),
  ]);
  return {
    visitor: v.results[0] ?? null,
    sessions: s.results,
    events: e.results,
    payments: p.results,
    currency: site.currency,
    decimals: currencyDecimals(site.currency),
  };
}

export interface FunnelStep {
  type: 'page' | 'goal';
  value: string; // page paths support * wildcards, e.g. /blog/*
  label?: string;
}

/** Visitors who completed each step, in order, within the period. */
export async function funnel(ctx: Ctx, steps: FunnelStep[]) {
  if (!steps.length) return [];
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
  const conds: string[] = [];
  const params: unknown[] = [];
  for (const st of steps) {
    if (st.type === 'goal') {
      conds.push(`(e.type = 'goal' AND e.name = ?)`);
      params.push(st.value);
    } else {
      conds.push(`(e.type = 'pageview' AND e.path LIKE ?)`);
      params.push(st.value.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%'));
    }
  }
  const rows = (
    await ctx.db
      .prepare(
        `SELECT e.visitor_id AS v, e.ts, e.type, e.name, e.path FROM events e ${join}
         WHERE e.site_id = ? AND e.ts >= ? AND e.ts < ? AND (${conds.join(' OR ')})${f.sql}
         ORDER BY e.ts LIMIT 100000`,
      )
      .bind(ctx.site.id, ctx.range.from, ctx.range.to, ...params, ...f.params)
      .all<{ v: string; ts: number; type: string; name: string | null; path: string }>()
  ).results;

  const matchers = steps.map((st) => {
    if (st.type === 'goal') return (r: (typeof rows)[0]) => r.type === 'goal' && r.name === st.value;
    const re = new RegExp('^' + st.value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return (r: (typeof rows)[0]) => r.type === 'pageview' && re.test(r.path);
  });
  const progress = new Map<string, number>();
  const stepAt = new Map<string, number[]>(); // when each visitor reached each step (for time between steps)
  for (const r of rows) {
    const at = progress.get(r.v) ?? 0;
    if (at < steps.length && matchers[at](r)) {
      progress.set(r.v, at + 1);
      const t = stepAt.get(r.v) ?? [];
      t.push(Number(r.ts));
      stepAt.set(r.v, t);
    }
  }
  const counts = steps.map(() => 0);
  for (const reached of progress.values()) for (let i = 0; i < reached; i++) counts[i]++;

  // Who reached each step: first-touch source and country of the visit, and what they paid (DataFast-style funnel insights).
  const sw = sessionsWhere(ctx);
  const [srcRows, payRows] = await ctx.db.batch([
    ctx.db.prepare(`SELECT s.visitor_id AS v, s.source, s.country, s.started_at FROM sessions s WHERE ${sw.sql} ORDER BY s.started_at LIMIT 200000`).bind(...sw.params),
    ctx.db
      .prepare(`SELECT p.visitor_id AS v, SUM(p.amount) AS amount FROM payments p WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ? AND p.visitor_id IS NOT NULL GROUP BY p.visitor_id`)
      .bind(ctx.site.id, ctx.range.from, ctx.range.to),
  ]);
  const firstTouch = new Map<string, { source: string | null; country: string | null }>();
  for (const r of srcRows.results as any[]) if (!firstTouch.has(r.v)) firstTouch.set(r.v, { source: r.source, country: r.country });
  const paid = new Map((payRows.results as any[]).map((r) => [r.v, Number(r.amount) || 0]));
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, visitors]) => ({ label, visitors }));

  return steps.map((st, i) => {
    const sources = new Map<string, number>();
    const countries = new Map<string, number>();
    let revenue = 0;
    let customers = 0;
    const gaps: number[] = [];
    for (const [v, reached] of progress) {
      if (reached <= i) continue;
      const ft = firstTouch.get(v);
      if (ft?.source) sources.set(ft.source, (sources.get(ft.source) ?? 0) + 1);
      if (ft?.country) countries.set(ft.country, (countries.get(ft.country) ?? 0) + 1);
      const amount = paid.get(v);
      if (amount) {
        revenue += amount;
        customers++;
      }
      const t = stepAt.get(v);
      if (i > 0 && t && t[i] !== undefined) gaps.push(t[i] - t[i - 1]);
    }
    gaps.sort((a, b) => a - b);
    return {
      ...st,
      visitors: counts[i],
      fromPrevious: i === 0 ? 1 : counts[i - 1] ? counts[i] / counts[i - 1] : 0,
      fromFirst: counts[0] ? counts[i] / counts[0] : 0,
      dropped: i === 0 ? 0 : counts[i - 1] - counts[i],
      medianMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      revenue,
      customers,
      topSources: top(sources),
      topCountries: top(countries),
    };
  });
}

/** Aggregate privacy-safe page engagement. Cross-database SQL works on both D1 and PostgreSQL. */
export async function engagementReport(ctx: Ctx) {
  const { db, range } = ctx;
  const w = sessionsWhere(ctx);
  const join = `FROM events e JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id
    WHERE ${w.sql} AND e.ts >= ? AND e.ts < ?`;
  const params = [...w.params, range.from, range.to];
  const cols = `
    COUNT(DISTINCT CASE WHEN e.type = 'pageview' THEN e.session_id END) AS sessions,
    COALESCE(SUM(CASE WHEN e.type = 'pageview' THEN 1 ELSE 0 END), 0) AS pageviews,
    COUNT(DISTINCT CASE WHEN e.type = 'scroll' AND e.name = '25' THEN e.session_id END) AS s25,
    COUNT(DISTINCT CASE WHEN e.type = 'scroll' AND e.name = '50' THEN e.session_id END) AS s50,
    COUNT(DISTINCT CASE WHEN e.type = 'scroll' AND e.name = '75' THEN e.session_id END) AS s75,
    COUNT(DISTINCT CASE WHEN e.type = 'scroll' AND e.name = '90' THEN e.session_id END) AS s90,
    COUNT(DISTINCT CASE WHEN e.type = 'scroll' AND e.name = '100' THEN e.session_id END) AS s100,
    COALESCE(SUM(CASE WHEN e.type = 'engagement' THEN CAST(e.name AS INTEGER) ELSE 0 END), 0) AS active_ms,
    COALESCE(SUM(CASE WHEN e.type = 'click' THEN 1 ELSE 0 END), 0) AS clicks,
    COALESCE(SUM(CASE WHEN e.type = 'form' THEN 1 ELSE 0 END), 0) AS forms`;
  // A separate overall query deduplicates sessions across different pages.
  const [totals, paths, links, forms, exits] = await db.batch([
    db.prepare(`SELECT ${cols} ${join}`).bind(...params),
    db.prepare(`SELECT e.path AS path, ${cols} ${join} AND e.path IS NOT NULL
      GROUP BY e.path ORDER BY pageviews DESC LIMIT 75`).bind(...params),
    db.prepare(`SELECT e.name AS label, COUNT(*) AS count ${join} AND e.type = 'click'
      GROUP BY e.name ORDER BY count DESC LIMIT 12`).bind(...params),
    db.prepare(`SELECT e.name AS label, COUNT(*) AS count ${join} AND e.type = 'form'
      GROUP BY e.name ORDER BY count DESC LIMIT 12`).bind(...params),
    db.prepare(`SELECT s.exit_page AS path, COUNT(*) AS sessions FROM sessions s
      WHERE ${w.sql} AND s.exit_page IS NOT NULL
      GROUP BY s.exit_page ORDER BY sessions DESC LIMIT 12`).bind(...w.params),
  ]);
  type Row = {
    path?: string | null; sessions?: number; pageviews?: number;
    s25?: number; s50?: number; s75?: number; s90?: number; s100?: number;
    active_ms?: number; clicks?: number; forms?: number;
  };
  const cast = (r: Row = {}) => ({
    sessions: Number(r.sessions || 0),
    pageviews: Number(r.pageviews || 0),
    scroll: [25, 50, 75, 90, 100].map((m) => ({ milestone: m, sessions: Number(r[('s' + m) as keyof Row] || 0) })),
    activeMs: Number(r.active_ms || 0),
    clicks: Number(r.clicks || 0),
    forms: Number(r.forms || 0),
  });
  return {
    updatedAt: Date.now(),
    range: { from: range.from, to: range.to },
    summary: cast((totals.results as Row[])[0]),
    pages: (paths.results as Row[]).map((r) => ({ path: r.path || '/', ...cast(r) })),
    internalLinks: (links.results as { label: string; count: number }[]).map((r) => ({ label: r.label, count: Number(r.count) })),
    trackedForms: (forms.results as { label: string; count: number }[]).map((r) => ({ label: r.label, count: Number(r.count) })),
    lastPages: (exits.results as { path: string; sessions: number }[]).map((r) => ({ path: r.path, sessions: Number(r.sessions) })),
    methodology: 'scroll=unique sessions reaching milestones, activeMs=foreground interaction time, lastPages=last seen page (not guaranteed exit)',
  };
}

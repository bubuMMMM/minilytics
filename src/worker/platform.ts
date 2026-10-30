/**
 * Public REST API (read), personal access tokens, and an MCP server (Streamable HTTP, JSON responses).
 *
 * Auth: `Authorization: Bearer mlt_…` (personal access token: same sites and role as its creator, revocable)
 * or `Bearer ml_…` (a site's API key: that site only). Tokens are stored as SHA-256 hashes.
 */
import type { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Principal, Role, Site } from './env.js';
import { randomId, randomToken, sha256Hex } from './lib/crypto.js';
import { RateLimiter } from './lib/security.js';
import { authenticate, canAccess } from './auth.js';
import { isApiKey } from './payments.js';
import { breakdown, customers, funnel, overview, parseFilters, visitorProfile, visitors, type Ctx } from './stats.js';
import { resolveRange, tzOffset } from './lib/time.js';
import { realtime } from './insights.js';
import { botsReport } from './bots.js';
import { revenuePrediction, revenueSummary } from './revenue.js';
import { goalDetail } from './growth.js';
import { DEFAULT_PLAN, PLANS, type Plan } from '../shared/plans.js';
import { BOT_MONTHLY_LIMIT } from './bots.js';

const limiter = new RateLimiter(240, 60_000);
const MAX_TOKENS = 20;

export interface ApiCaller { principal: Principal; siteKey: string | null; tokenId: string | null }

const parseSites = (s: string): '*' | string[] => {
  if (s === '*') return '*';
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const intersect = (a: '*' | string[], b: '*' | string[]): '*' | string[] => (a === '*' ? b : b === '*' ? a : a.filter((x) => b.includes(x)));

/** Resolves the bearer token of an API / MCP request. */
export async function apiCaller(c: Context<AppEnv>): Promise<ApiCaller | null> {
  const raw = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (/^mlt_[\w-]{20,80}$/.test(raw)) {
    const t = await c.env.DB.prepare('SELECT * FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL').bind(await sha256Hex(raw)).first<any>();
    if (!t) return null;
    let role = t.role as Role;
    let sites = parseSites(t.sites);
    if (t.user_id !== 'owner') {
      // A removed or demoted member's tokens follow their account.
      const u = await c.env.DB.prepare('SELECT role, sites, disabled_at FROM users WHERE id = ?').bind(t.user_id).first<any>();
      if (!u || u.disabled_at) return null;
      if (u.role === 'viewer') role = 'viewer';
      sites = intersect(sites, parseSites(u.sites));
    }
    const now = Date.now();
    if (!t.last_used_at || now - Number(t.last_used_at) > 60_000) await c.env.DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').bind(now, t.id).run();
    return { principal: { userId: t.user_id, role, sites, sessionId: `token:${t.id}`, email: null, name: t.name }, siteKey: null, tokenId: t.id };
  }
  if (isApiKey(raw)) {
    const s = await c.env.DB.prepare('SELECT id FROM sites WHERE api_key = ?').bind(raw).first<{ id: string }>();
    if (!s) return null;
    return { principal: { userId: `site:${s.id}`, role: 'admin', sites: [s.id], sessionId: `key:${s.id}`, email: null, name: null }, siteKey: raw, tokenId: null };
  }
  return null;
}

export function ctxFor(db: D1Database, site: Site, q: Record<string, unknown>): Ctx {
  const s = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
  const range = resolveRange({ period: s('period') ?? '30d', from: s('from'), to: s('to'), granularity: s('granularity') }, site.timezone, site.created_at);
  const f = q.filters;
  return { db, site, range, filters: parseFilters(typeof f === 'string' || (f && typeof f === 'object') ? (f as any) : undefined), offset: tzOffset(site.timezone, range.to) };
}

async function siteFor(c: Context<AppEnv>, caller: ApiCaller, id: string): Promise<Site | null> {
  if (!canAccess(caller.principal, id)) return null;
  return c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<Site>();
}

const siteView = (s: Site) => ({ id: s.id, name: s.name, domain: s.domain, timezone: s.timezone, currency: s.currency, created_at: Number(s.created_at), is_public: !!s.is_public });

export const BREAKDOWN_DIMS = ['channel', 'source', 'referrer', 'campaign', 'utm_source', 'utm_medium', 'utm_content', 'keyword', 'ref', 'page', 'entry_page', 'exit_page', 'exit_link', 'country', 'region', 'city', 'browser', 'os', 'device', 'hostname', 'language', 'screen', 'goal', 'visitor_type'];
const ALIASES: Record<string, string> = { pages: 'page', sources: 'source', channels: 'channel', countries: 'country', regions: 'region', cities: 'city', devices: 'device', browsers: 'browser', 'operating-systems': 'os', goals: 'goal', campaigns: 'campaign', hostnames: 'hostname', 'exit-links': 'exit_link', 'entry-pages': 'entry_page', 'exit-pages': 'exit_page', referrers: 'referrer', languages: 'language' };

// ---------------------------------------------------------------- shared query layer (REST + MCP)

export async function runQuery(db: D1Database, site: Site, what: string, q: Record<string, unknown>) {
  const ctx = ctxFor(db, site, q);
  const limit = Math.max(1, Math.min(500, Number(q.limit) || 20));
  const meta = { site: site.id, from: ctx.range.from, to: ctx.range.to, granularity: ctx.range.granularity, currency: site.currency };
  switch (what) {
    case 'overview': {
      const o = await overview(ctx);
      return { ...meta, current: o.current, previous: o.previous, online: o.online, series: o.series.map(({ bucket, visitors, pageviews, revenue, sessions }) => ({ bucket, visitors, pageviews, revenue, sessions })) };
    }
    case 'realtime':
      return { site: site.id, ...(await realtime(db, site)) };
    case 'revenue':
      return { ...meta, ...(await revenueSummary(ctx)) };
    case 'predictions':
      return { site: site.id, ...(await revenuePrediction(ctx)) };
    case 'bots':
      return { ...meta, ...(await botsReport(ctx)) };
    case 'visitors':
      return { ...meta, visitors: await visitors(ctx) };
    case 'customers':
      return { ...meta, customers: await customers(ctx) };
    default: {
      const dim = ALIASES[what] ?? what;
      if (!BREAKDOWN_DIMS.includes(dim)) throw new Error(`unknown report ${what}`);
      return { ...meta, dimension: dim, rows: await breakdown(ctx, dim, limit) };
    }
  }
}

// ---------------------------------------------------------------- MCP

const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const period = { type: 'string', description: "now, today, yesterday, 24h, 7d, 30d (default), 90d, 12m, all, custom (with from/to YYYY-MM-DD)" };
const siteArg = { site_id: { type: 'string', description: 'Website id (see list_sites)' } };
const rangeArgs = { period, from: { type: 'string', description: 'YYYY-MM-DD (period=custom)' }, to: { type: 'string', description: 'YYYY-MM-DD (period=custom)' }, filters: { type: 'object', description: 'e.g. {"country":"FR","page":{"op":"contains","v":"/blog"}}' } };

export const MCP_TOOLS = [
  { name: 'list_sites', description: 'List the websites this token can read.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_stats', description: 'Visitors, pageviews, bounce rate, visit duration, revenue, conversion rate for a period, compared with the previous period, plus the time series.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs }, required: ['site_id'] } },
  { name: 'top_pages', description: 'Most visited pages with visitors, pageviews and attributed revenue.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs, limit: { type: 'number' } }, required: ['site_id'] } },
  { name: 'top_sources', description: 'Traffic sources (or channels / UTM campaigns) with visitors and attributed revenue.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs, limit: { type: 'number' }, dimension: { type: 'string', enum: ['source', 'channel', 'referrer', 'campaign', 'utm_source', 'utm_medium', 'ref'] } }, required: ['site_id'] } },
  { name: 'breakdown', description: 'Any breakdown: ' + BREAKDOWN_DIMS.join(', ') + '.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs, dimension: { type: 'string', enum: BREAKDOWN_DIMS }, limit: { type: 'number' } }, required: ['site_id', 'dimension'] } },
  { name: 'realtime', description: 'Visitors online now, last 30 minutes per minute, current pages and sources, latest events.', inputSchema: { type: 'object', properties: { ...siteArg }, required: ['site_id'] } },
  { name: 'goals', description: 'Goals (custom events) completed in the period; pass goal to get its detail (trend, pages, sources, properties).', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs, goal: { type: 'string' } }, required: ['site_id'] } },
  { name: 'revenue', description: 'Revenue summary: gross, new vs renewals, refunds, net, providers, plus explainable conversion prediction and month projection.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs }, required: ['site_id'] } },
  { name: 'funnels', description: 'Saved funnels; pass funnel_id for its conversion per step.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs, funnel_id: { type: 'string' } }, required: ['site_id'] } },
  { name: 'bot_traffic', description: 'AI bot / crawler requests by bot, page and category, and visits referred by AI assistants.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs }, required: ['site_id'] } },
  { name: 'notes', description: 'List chart notes in the period, or add one with text (+ optional date YYYY-MM-DD). Adding requires edit rights.', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs, add_text: { type: 'string' }, date: { type: 'string' } }, required: ['site_id'] } },
  { name: 'mentions', description: 'Social mentions of the site in the period: posts on X and Reddit threads (title/text, author, link, engagement).', inputSchema: { type: 'object', properties: { ...siteArg, ...rangeArgs }, required: ['site_id'] } },
  { name: 'visitor', description: 'Profile and journey of one visitor id.', inputSchema: { type: 'object', properties: { ...siteArg, visitor_id: { type: 'string' } }, required: ['site_id', 'visitor_id'] } },
];

async function callTool(c: Context<AppEnv>, caller: ApiCaller, name: string, args: Record<string, unknown>) {
  const db = c.env.DB;
  if (name === 'list_sites') {
    const all = (await db.prepare('SELECT * FROM sites ORDER BY created_at').all<Site>()).results;
    return { sites: all.filter((s) => canAccess(caller.principal, s.id)).map(siteView) };
  }
  const site = await siteFor(c, caller, String(args.site_id ?? ''));
  if (!site) throw new Error('site not found or not accessible with this token');
  switch (name) {
    case 'get_stats':
      return runQuery(db, site, 'overview', args);
    case 'top_pages':
      return runQuery(db, site, 'page', args);
    case 'top_sources':
      return runQuery(db, site, String(args.dimension ?? 'source'), args);
    case 'breakdown':
      return runQuery(db, site, String(args.dimension ?? ''), args);
    case 'realtime':
      return runQuery(db, site, 'realtime', args);
    case 'goals':
      if (typeof args.goal === 'string' && args.goal) return goalDetail(ctxFor(db, site, args), args.goal.slice(0, 64));
      return runQuery(db, site, 'goal', args);
    case 'revenue':
      return { summary: await runQuery(db, site, 'revenue', args), prediction: await runQuery(db, site, 'predictions', args) };
    case 'bot_traffic':
      return runQuery(db, site, 'bots', args);
    case 'funnels': {
      const list = (await db.prepare('SELECT id, name, steps FROM funnels WHERE site_id = ? ORDER BY created_at').bind(site.id).all<any>()).results;
      if (typeof args.funnel_id === 'string') {
        const f = list.find((x) => x.id === args.funnel_id);
        if (!f) throw new Error('funnel not found');
        return { id: f.id, name: f.name, ...(await funnel(ctxFor(db, site, args), JSON.parse(f.steps))) };
      }
      return { funnels: list.map((f) => ({ id: f.id, name: f.name, steps: JSON.parse(f.steps) })) };
    }
    case 'notes': {
      if (typeof args.add_text === 'string' && args.add_text.trim()) {
        if (caller.principal.role === 'viewer') throw new Error('read-only token: cannot add notes');
        const ts = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? Date.parse(args.date + 'T12:00:00Z') : Date.now();
        const note = { id: randomId(8), ts, text: args.add_text.trim().slice(0, 280) };
        await db.prepare('INSERT INTO notes (id, site_id, ts, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(note.id, site.id, note.ts, note.text, Date.now()).run();
        return { added: note };
      }
      const ctx = ctxFor(db, site, args);
      const r = await db.prepare('SELECT id, ts, text FROM notes WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts').bind(site.id, ctx.range.from, ctx.range.to).all<any>();
      return { notes: r.results.map((n) => ({ ...n, ts: Number(n.ts) })) };
    }
    case 'visitor':
      return visitorProfile(db, site, String(args.visitor_id ?? '').slice(0, 64));
    case 'mentions': {
      const ctx = ctxFor(db, site, args);
      const [x, rd] = await db.batch([
        db.prepare('SELECT id, username, text, created_at, likes, reposts, replies, impressions FROM x_posts WHERE site_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 100').bind(site.id, ctx.range.from, ctx.range.to),
        db.prepare('SELECT id, ts, title, subreddit, author, permalink, score, comments FROM reddit_mentions WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts DESC LIMIT 100').bind(site.id, ctx.range.from, ctx.range.to),
      ]);
      return {
        x: (x.results as any[]).map((m) => ({ ...m, created_at: Number(m.created_at), url: m.username ? `https://x.com/${m.username}/status/${m.id}` : null })),
        reddit: (rd.results as any[]).map((m) => ({ ...m, ts: Number(m.ts) })),
      };
    }
  }
  throw new Error(`unknown tool ${name}`);
}

async function handleMcp(c: Context<AppEnv>) {
  const caller = await apiCaller(c);
  if (!caller) {
    c.header('WWW-Authenticate', 'Bearer realm="minilytics", error="invalid_token"');
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: send Authorization: Bearer <mlt_ token>' } }, 401);
  }
  if (!limiter.allow(caller.principal.sessionId)) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32029, message: 'rate limited' } }, 429);
  let msg: any;
  try {
    msg = await c.req.json();
  } catch {
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  const one = async (m: any) => {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    if (m.id === undefined || m.id === null) return null; // notification
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'initialize': {
        const v = MCP_VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : MCP_VERSIONS[0];
        return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'minilytics', title: 'Minilytics', version: '1.0.0' }, instructions: 'Web analytics with revenue attribution. Call list_sites first, then pass site_id to the other tools. Money amounts are in minor units of the site currency.' });
      }
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: MCP_TOOLS });
      case 'tools/call': {
        try {
          const data = await callTool(c, caller, String(m.params?.name ?? ''), (m.params?.arguments ?? {}) as Record<string, unknown>);
          return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
        }
      }
      case 'resources/list':
        return ok({ resources: [] });
      case 'prompts/list':
        return ok({ prompts: [] });
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
    }
  };
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.slice(0, 20).map(one))).filter(Boolean);
    return out.length ? c.json(out) : c.body(null, 202);
  }
  const res = await one(msg);
  return res ? c.json(res) : c.body(null, 202);
}

// ---------------------------------------------------------------- OpenAPI

export function openApi(origin: string) {
  const rangeParams = [
    { name: 'period', in: 'query', schema: { type: 'string', default: '30d' }, description: 'now, today, yesterday, 24h, 7d, 30d, 90d, 12m, all, custom' },
    { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
    { name: 'filters', in: 'query', schema: { type: 'string' }, description: 'JSON, e.g. {"country":"FR"}' },
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 500 } },
  ];
  const site = { name: 'siteId', in: 'path', required: true, schema: { type: 'string' } };
  const get = (summary: string, extra: object[] = []) => ({ get: { summary, parameters: [site, ...rangeParams, ...extra], responses: { 200: { description: 'OK' } } } });
  const paths: Record<string, unknown> = {
    '/api/v1/sites': { get: { summary: 'List websites', responses: { 200: { description: 'OK' } } } },
    '/api/v1/sites/{siteId}/overview': get('KPIs (current + previous period) and time series'),
    '/api/v1/sites/{siteId}/realtime': get('Visitors online and last 30 minutes'),
    '/api/v1/sites/{siteId}/revenue': get('Revenue: gross, new, renewals, refunds, net, providers'),
    '/api/v1/sites/{siteId}/predictions': get('Explainable conversion prediction and month projection'),
    '/api/v1/sites/{siteId}/bots': get('AI bot traffic and AI referrals'),
    '/api/v1/sites/{siteId}/visitors': get('Recent visitors'),
    '/api/v1/sites/{siteId}/visitors/{visitorId}': { get: { summary: 'Visitor profile and journey', parameters: [site, { name: 'visitorId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
    '/api/v1/sites/{siteId}/funnels': get('Saved funnels'),
    '/api/v1/sites/{siteId}/funnels/{funnelId}': get('Funnel conversion per step', [{ name: 'funnelId', in: 'path', required: true, schema: { type: 'string' } }]),
    '/api/v1/sites/{siteId}/goals/{goal}': get('Goal detail', [{ name: 'goal', in: 'path', required: true, schema: { type: 'string' } }]),
    '/api/v1/sites/{siteId}/mentions': get('Social mentions (X posts, Reddit threads)'),
    '/api/v1/sites/{siteId}/notes': { ...get('Chart notes'), post: { summary: 'Add a note { text, date? }', parameters: [site], responses: { 200: { description: 'OK' } } } },
    '/api/v1/sites/{siteId}/breakdown/{dimension}': get('Breakdown by ' + BREAKDOWN_DIMS.join(', '), [{ name: 'dimension', in: 'path', required: true, schema: { type: 'string', enum: BREAKDOWN_DIMS } }]),
    '/api/v1/payments': { post: { summary: 'Record a payment (site API key) { transaction_id, amount, currency, visitor_id?, email?, renewal?, refunded? }', responses: { 200: { description: 'OK' } } } },
    '/api/v1/goals': { post: { summary: 'Record a server-side goal (site API key) { visitor_id, name, props? }', responses: { 200: { description: 'OK' } } } },
    '/api/v1/identify': { post: { summary: 'Identify a visitor (site API key) { visitor_id, user_id?, email?, name? }', responses: { 200: { description: 'OK' } } } },
    '/api/mcp': { post: { summary: 'MCP server (JSON-RPC 2.0, Streamable HTTP, JSON responses)', responses: { 200: { description: 'OK' } } } },
  };
  for (const [alias] of Object.entries(ALIASES)) paths[`/api/v1/sites/{siteId}/${alias}`] = get(`Shortcut for breakdown/${ALIASES[alias]}`);
  return {
    openapi: '3.1.0',
    info: { title: 'Minilytics API', version: '1.0.0', description: 'Read your analytics, record payments and goals. Amounts are minor units of the site currency.' },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'mlt_… personal access token, or ml_… site API key' } } },
    security: [{ bearer: [] }],
    paths,
  };
}

// ---------------------------------------------------------------- plan & usage

export async function currentPlan(db: D1Database): Promise<Plan> {
  const r = await db.prepare("SELECT value FROM app_settings WHERE key = 'plan'").first<{ value: string }>().catch(() => null);
  return PLANS[(r?.value as Plan['id']) ?? DEFAULT_PLAN] ?? PLANS[DEFAULT_PLAN];
}

/** Events this calendar month (UTC), sites, members, bot requests vs the plan. Events over quota are kept, only flagged. */
export async function usage(db: D1Database, now = Date.now()) {
  const plan = await currentPlan(db);
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const [ev, sites, members, bots] = await db.batch([
    db.prepare('SELECT site_id, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY site_id').bind(monthStart),
    db.prepare('SELECT COUNT(*) AS n FROM sites'),
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE disabled_at IS NULL'),
    db.prepare('SELECT site_id, COUNT(*) AS n FROM bot_hits WHERE ts >= ? GROUP BY site_id').bind(monthStart),
  ]);
  const perSite = (ev.results as any[]).map((r) => ({ siteId: r.site_id, events: Number(r.n) }));
  const events = perSite.reduce((s, r) => s + r.events, 0);
  return {
    plan,
    period: { from: monthStart, to: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) },
    events: { used: events, limit: plan.eventsPerMonth, over: events > plan.eventsPerMonth, perSite },
    sites: { used: Number((sites.results[0] as any)?.n ?? 0), limit: plan.sites },
    // The owner is a member too.
    members: { used: 1 + Number((members.results[0] as any)?.n ?? 0), limit: plan.members },
    botRequests: { perSite: (bots.results as any[]).map((r) => ({ siteId: r.site_id, used: Number(r.n), limit: BOT_MONTHLY_LIMIT })) },
  };
}

// ---------------------------------------------------------------- routes

export function registerPlatform(app: Hono<AppEnv>) {
  app.use('/api/v1/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }));
  app.use('/api/mcp', cors({ origin: '*', allowMethods: ['POST', 'GET', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version'], maxAge: 86400 }));
  app.get('/api/v1/openapi.json', (c) => c.json(openApi(new URL(c.req.url).origin)));
  app.post('/api/mcp', handleMcp);
  app.get('/api/mcp', (c) => c.json({ error: 'This MCP server answers POST requests with JSON (no SSE stream).', tools: MCP_TOOLS.map((t) => t.name) }, 405));

  const auth = async (c: Context<AppEnv>) => {
    const caller = await apiCaller(c);
    if (!caller) return { err: c.json({ error: 'invalid or missing token (Authorization: Bearer mlt_… or ml_…)' }, 401) };
    if (!limiter.allow(caller.principal.sessionId)) return { err: c.json({ error: 'rate limited (240 requests/min)' }, 429) };
    return { caller };
  };
  const withSite = async (c: Context<AppEnv>) => {
    const a = await auth(c);
    if (a.err) return a;
    const site = await siteFor(c, a.caller!, c.req.param('siteId') ?? '');
    if (!site) return { err: c.json({ error: 'site not found' }, 404) };
    return { caller: a.caller!, site };
  };

  app.get('/api/v1/sites', async (c) => {
    const a = await auth(c);
    if (a.err) return a.err;
    const all = (await c.env.DB.prepare('SELECT * FROM sites ORDER BY created_at').all<Site>()).results;
    return c.json({ sites: all.filter((s) => canAccess(a.caller!.principal, s.id)).map(siteView) });
  });
  app.get('/api/v1/sites/:siteId/visitors/:vid', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    return c.json(await visitorProfile(c.env.DB, a.site!, c.req.param('vid').slice(0, 64)));
  });
  app.get('/api/v1/sites/:siteId/goals/:goal', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    const g = c.req.param('goal');
    if (!/^[\w:.\-]{1,64}$/.test(g)) return c.json({ error: 'invalid goal' }, 400);
    return c.json(await goalDetail(ctxFor(c.env.DB, a.site!, c.req.query()), g));
  });
  app.get('/api/v1/sites/:siteId/funnels', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    return c.json(await callTool(c, a.caller!, 'funnels', { site_id: a.site!.id }));
  });
  app.get('/api/v1/sites/:siteId/funnels/:fid', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    try {
      return c.json(await callTool(c, a.caller!, 'funnels', { ...c.req.query(), site_id: a.site!.id, funnel_id: c.req.param('fid') }));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 404);
    }
  });
  app.get('/api/v1/sites/:siteId/mentions', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    return c.json(await callTool(c, a.caller!, 'mentions', { ...c.req.query(), site_id: a.site!.id }));
  });
  app.get('/api/v1/sites/:siteId/notes', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    return c.json(await callTool(c, a.caller!, 'notes', { ...c.req.query(), site_id: a.site!.id }));
  });
  app.post('/api/v1/sites/:siteId/notes', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    const b = await c.req.json<{ text?: string; date?: string }>().catch(() => ({}) as any);
    if (!b.text?.trim()) return c.json({ error: 'text is required' }, 400);
    try {
      return c.json(await callTool(c, a.caller!, 'notes', { site_id: a.site!.id, add_text: b.text, date: b.date }));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 403);
    }
  });
  app.get('/api/v1/sites/:siteId/breakdown/:dim', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    try {
      return c.json(await runQuery(c.env.DB, a.site!, c.req.param('dim'), c.req.query()));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });
  app.get('/api/v1/sites/:siteId/:report', async (c) => {
    const a = await withSite(c);
    if (a.err) return a.err;
    try {
      return c.json(await runQuery(c.env.DB, a.site!, c.req.param('report'), c.req.query()));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 404);
    }
  });
  // Identify (server side): link a visitor id to your user.
  app.post('/api/v1/identify', async (c) => {
    const a = await auth(c);
    if (a.err) return a.err;
    if (!a.caller!.siteKey) return c.json({ error: 'use the site API key (ml_…) to write' }, 403);
    const siteId = (a.caller!.principal.sites as string[])[0];
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const vid = typeof b.visitor_id === 'string' && /^[\w-]{8,64}$/.test(b.visitor_id) ? b.visitor_id : null;
    if (!vid) return c.json({ error: 'visitor_id is required' }, 400);
    const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(siteId, vid, Date.now()),
      c.env.DB.prepare('UPDATE visitors SET user_id = COALESCE(?, user_id), email = COALESCE(?, email), name = COALESCE(?, name) WHERE site_id = ? AND id = ?')
        .bind(clip(b.user_id, 128), clip(b.email, 200)?.toLowerCase() ?? null, clip(b.name, 128), siteId, vid),
    ]);
    return c.json({ ok: true });
  });

  app.get('/api/usage', async (c) => {
    const p = await authenticate(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await usage(c.env.DB));
  });
  app.put('/api/usage/plan', async (c) => {
    const p = await authenticate(c);
    if (!p || p.role !== 'owner') return c.json({ error: 'Réservé au propriétaire' }, 403);
    const b = await c.req.json<{ plan?: string }>().catch(() => ({}) as any);
    if (!b.plan || !(b.plan in PLANS)) return c.json({ error: 'plan inconnu' }, 400);
    await c.env.DB.prepare("INSERT INTO app_settings (key, value) VALUES ('plan', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(b.plan).run();
    return c.json(await usage(c.env.DB));
  });

  // Personal access tokens (dashboard session).
  const session = async (c: Context<AppEnv>) => authenticate(c);
  app.get('/api/tokens', async (c) => {
    const p = await session(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    const r = await c.env.DB.prepare('SELECT id, name, role, sites, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC').bind(p.userId).all<any>();
    return c.json({ tokens: r.results.map((t) => ({ ...t, sites: parseSites(t.sites), created_at: Number(t.created_at), last_used_at: t.last_used_at ? Number(t.last_used_at) : null })) });
  });
  app.post('/api/tokens', async (c) => {
    const p = await session(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    const b = await c.req.json<{ name?: string; readOnly?: boolean; sites?: string[] }>().catch(() => ({}) as any);
    const name = (typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Jeton API').slice(0, 60);
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL').bind(p.userId).first<{ n: number }>();
    if (Number(n?.n) >= MAX_TOKENS) return c.json({ error: `Maximum ${MAX_TOKENS} jetons actifs` }, 400);
    const role: Role = b.readOnly || p.role === 'viewer' ? 'viewer' : p.role === 'owner' ? 'admin' : p.role;
    const wanted = Array.isArray(b.sites) && b.sites.length ? (b.sites as unknown[]).filter((s): s is string => typeof s === 'string' && canAccess(p, s)).slice(0, 100) : null;
    const sites = wanted ?? p.sites;
    const token = 'mlt_' + randomToken(30);
    const id = randomId(8);
    await c.env.DB.prepare('INSERT INTO api_tokens (id, token_hash, name, user_id, role, sites, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, await sha256Hex(token), name, p.userId, role, sites === '*' ? '*' : JSON.stringify(sites), token.slice(0, 10), Date.now())
      .run();
    // Shown once; only the hash is stored.
    return c.json({ id, name, role, sites, token });
  });
  app.delete('/api/tokens/:tid', async (c) => {
    const p = await session(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    await c.env.DB.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(Date.now(), c.req.param('tid'), p.userId).run();
    return c.json({ ok: true });
  });
}

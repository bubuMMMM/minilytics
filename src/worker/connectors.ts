/**
 * Outside sources shown with your traffic (DataFast parity):
 *  - GitHub commits as chart annotations (public repos without a token; GITHUB_TOKEN optional).
 *  - Reddit mentions (anonymous JSON search when Reddit allows it, else app-only OAuth with REDDIT_CLIENT_ID/SECRET).
 *  - Google Search Console keywords (OAuth, GOOGLE_CLIENT_ID/SECRET, scope webmasters.readonly).
 *  - Meta Ads spend, attributed revenue and ROAS (OAuth, META_APP_ID/SECRET, scope ads_read).
 * Until the credentials exist every connector reports a setup state instead of failing.
 */
import type { Context, Hono } from 'hono';
import { forgetSite, type AppEnv, type Env, type Site } from './env.js';
import { signToken, verifyToken } from './lib/crypto.js';
import { readSettings } from './settings.js';
import { notify } from './alerts.js';
import { makeCtx, type Ctx } from './stats.js';
import { convertMinor } from './fx.js';
import { currencyDecimals } from './payments.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const UA = 'Minilytics/1.0 (+https://minilytics-six.vercel.app)';

type Json = Record<string, any>;
function readRaw(site: Site): Json {
  try {
    const v = site.integrations ? JSON.parse(site.integrations) : {};
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
async function patchRaw(db: D1Database, siteId: string, key: string, value: Json | null) {
  const fresh = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(siteId).first<Site>();
  if (!fresh) return;
  const all = readRaw(fresh);
  if (value === null) delete all[key];
  else all[key] = { ...(all[key] ?? {}), ...value };
  await db.prepare('UPDATE sites SET integrations = ? WHERE id = ?').bind(JSON.stringify(all), siteId).run();
  forgetSite(siteId);
}

// ---------------------------------------------------------------- GitHub

export async function syncGithub(db: D1Database, site: Site, env: Env, fetcher: typeof fetch = fetch, now = Date.now()) {
  const repo = readSettings(site).github.repo;
  if (!repo) return { ok: false, error: 'Aucun dépôt configuré' };
  const state = readRaw(site).github_state ?? {};
  const since = new Date(Math.max(now - 90 * DAY, Number(state.newest ?? 0) - HOUR)).toISOString();
  let found = 0;
  let newest = Number(state.newest ?? 0);
  try {
    for (let page = 1; page <= 3; page++) {
      const r = await fetcher(`https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100&page=${page}`, {
        headers: { 'user-agent': UA, accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 404) throw new Error(`Dépôt ${repo} introuvable (privé ? ajoutez GITHUB_TOKEN)`);
      if (r.status === 403 || r.status === 429) throw new Error(`Limite de l’API GitHub atteinte (HTTP ${r.status}) ; GITHUB_TOKEN relève la limite`);
      if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
      const list = (await r.json()) as any[];
      if (!Array.isArray(list) || !list.length) break;
      const stmts = list.map((cm) => {
        const ts = Date.parse(cm.commit?.committer?.date ?? cm.commit?.author?.date ?? '') || now;
        newest = Math.max(newest, ts);
        return db
          .prepare('INSERT INTO github_commits (site_id, sha, ts, message, author, url) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
          .bind(site.id, String(cm.sha).slice(0, 40), ts, String(cm.commit?.message ?? '').split('\n')[0].slice(0, 200), String(cm.author?.login ?? cm.commit?.author?.name ?? '').slice(0, 80) || null, String(cm.html_url ?? '').slice(0, 300) || null);
      });
      await db.batch(stmts);
      found += list.length;
      if (list.length < 100) break;
    }
    await patchRaw(db, site.id, 'github_state', { at: now, ok: true, error: null, found, newest });
    return { ok: true, found };
  } catch (e) {
    const error = (e as Error).message;
    await patchRaw(db, site.id, 'github_state', { at: now, ok: false, error });
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------- Reddit

async function redditToken(env: Env, fetcher: typeof fetch) {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return null;
  const r = await fetcher('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { authorization: 'Basic ' + btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`), 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Identifiants Reddit refusés (HTTP ${r.status})`);
  return ((await r.json()) as any).access_token as string;
}

export async function syncReddit(db: D1Database, site: Site, env: Env, fetcher: typeof fetch = fetch, now = Date.now()) {
  const kws = readSettings(site).reddit.keywords;
  const terms = kws.length ? kws : [site.domain];
  const q = terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
  let found = 0;
  let mode = 'public';
  try {
    const token = await redditToken(env, fetcher);
    if (token) mode = 'oauth';
    const url = token
      ? `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=new&t=month&limit=100&raw_json=1`
      : `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=month&limit=100&raw_json=1`;
    const r = await fetcher(url, { headers: { 'user-agent': UA, ...(token ? { authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(8000) });
    if (r.status === 403 || r.status === 429) throw new Error(token ? `Reddit HTTP ${r.status}` : `Reddit bloque la recherche anonyme depuis ce serveur (HTTP ${r.status}) : ajoutez REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET`);
    if (!r.ok) throw new Error(`Reddit HTTP ${r.status}`);
    const j = (await r.json()) as any;
    const posts = (j?.data?.children ?? []).map((ch: any) => ch.data).filter(Boolean);
    for (const p of posts) {
      const ts = Number(p.created_utc) * 1000 || now;
      const res = await db
        .prepare(
          `INSERT INTO reddit_mentions (site_id, id, ts, title, subreddit, author, url, permalink, score, comments, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'post')
           ON CONFLICT (site_id, id) DO UPDATE SET score = excluded.score, comments = excluded.comments`,
        )
        .bind(site.id, String(p.id), ts, String(p.title ?? '').slice(0, 300), String(p.subreddit ?? '').slice(0, 60), String(p.author ?? '').slice(0, 60), String(p.url ?? '').slice(0, 500), `https://www.reddit.com${String(p.permalink ?? '')}`.slice(0, 500), Number(p.score) || 0, Number(p.num_comments) || 0)
        .run();
      found++;
      if (now - ts < 2 * DAY && res) await notify(db, site, { kind: 'mention', title: `Mention sur Reddit : r/${p.subreddit}`, body: String(p.title ?? '').slice(0, 200), url: `https://www.reddit.com${p.permalink}`, dedupe: `reddit:${p.id}`, ts });
    }
    await patchRaw(db, site.id, 'reddit_state', { at: now, ok: true, error: null, found, mode });
    return { ok: true, found, mode };
  } catch (e) {
    const error = (e as Error).message;
    await patchRaw(db, site.id, 'reddit_state', { at: now, ok: false, error, mode });
    return { ok: false, error, mode };
  }
}

// ---------------------------------------------------------------- annotations

const lastAuto = new Map<string, number>();

export async function annotations(ctx: Ctx, env: Env, now = Date.now()) {
  const { db, site, range } = ctx;
  const key = site.id;
  // Refresh commits / mentions at most hourly when someone looks at the chart.
  if (now - (lastAuto.get(key) ?? 0) > HOUR) {
    lastAuto.set(key, now);
    const raw = readRaw(site);
    if (readSettings(site).github.repo && now - Number(raw.github_state?.at ?? 0) > HOUR) await syncGithub(db, site, env).catch(() => null);
    if (now - Number(raw.reddit_state?.at ?? 0) > 6 * HOUR && (readSettings(site).reddit.keywords.length || raw.reddit_state)) await syncReddit(db, site, env).catch(() => null);
  }
  const [notes, commits, reddit, x] = await db.batch([
    db.prepare('SELECT id, ts, text FROM notes WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts LIMIT 500').bind(site.id, range.from, range.to),
    db.prepare('SELECT sha, ts, message, author, url FROM github_commits WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts LIMIT 500').bind(site.id, range.from, range.to),
    db.prepare('SELECT id, ts, title, subreddit, permalink, score, comments FROM reddit_mentions WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts LIMIT 200').bind(site.id, range.from, range.to),
    db.prepare('SELECT id, created_at, username, text, likes FROM x_posts WHERE site_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at LIMIT 200').bind(site.id, range.from, range.to),
  ]);
  const items = [
    ...(notes.results as any[]).map((n) => ({ id: `note:${n.id}`, ts: Number(n.ts), kind: 'note', title: n.text })),
    ...(commits.results as any[]).map((c) => ({ id: `commit:${c.sha}`, ts: Number(c.ts), kind: 'commit', title: c.message, url: c.url, author: c.author })),
    ...(reddit.results as any[]).map((r) => ({ id: `reddit:${r.id}`, ts: Number(r.ts), kind: 'mention', source: 'reddit', title: `r/${r.subreddit} · ${r.title}`, url: r.permalink, score: Number(r.score), comments: Number(r.comments) })),
    ...(x.results as any[]).map((p) => ({ id: `x:${p.id}`, ts: Number(p.created_at), kind: 'mention', source: 'x', title: `@${p.username} · ${String(p.text).slice(0, 140)}`, url: `https://x.com/${p.username}/status/${p.id}`, author: p.username, score: Number(p.likes) })),
  ].sort((a, b) => a.ts - b.ts);
  return { items };
}

// ---------------------------------------------------------------- OAuth (Google Search Console, Meta Ads)

type OAuthProvider = 'google' | 'meta';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const META_VERSION = 'v21.0';

function oauthConfigured(env: Env, p: OAuthProvider) {
  return p === 'google' ? !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) : !!(env.META_APP_ID && env.META_APP_SECRET);
}
const redirectUri = (origin: string, p: OAuthProvider) => `${origin}/api/oauth/${p}/callback`;

export async function oauthStartUrl(env: Env, p: OAuthProvider, site: Site, userId: string, origin: string, now = Date.now()) {
  const state = await signToken(env.SESSION_SECRET, `oauth.${p}.${site.id}.${userId}.${now + 10 * 60_000}`);
  if (p === 'google') {
    const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: GOOGLE_SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({ client_id: env.META_APP_ID!, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: 'ads_read', state });
  return `https://www.facebook.com/${META_VERSION}/dialog/oauth?${q}`;
}

async function readState(env: Env, p: OAuthProvider, state: string | undefined, now = Date.now()) {
  const v = await verifyToken(env.SESSION_SECRET, state);
  if (!v) return null;
  const [tag, prov, siteId, userId, exp] = v.split('.');
  if (tag !== 'oauth' || prov !== p || !siteId || !userId || !(Number(exp) > now)) return null;
  return { siteId, userId };
}

const bare = (d: string) => d.replace(/^www\./, '').toLowerCase();

export async function oauthCallback(env: Env, p: OAuthProvider, code: string, origin: string, siteId: string, fetcher: typeof fetch = fetch) {
  const db = env.DB;
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(siteId).first<Site>();
  if (!site) throw new Error('site introuvable');
  if (p === 'google') {
    const r = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(origin, p), grant_type: 'authorization_code' }).toString(),
    });
    const t = (await r.json()) as any;
    if (!r.ok || !t.access_token) throw new Error(`Google a refusé l’échange du code (${t.error ?? r.status})`);
    const sites = await fetcher('https://www.googleapis.com/webmasters/v3/sites', { headers: { authorization: `Bearer ${t.access_token}` } }).then((x) => x.json()).catch(() => ({})) as any;
    const entries: string[] = (sites.siteEntry ?? []).map((s: any) => s.siteUrl);
    const d = bare(site.domain);
    const property = entries.find((u) => u === `sc-domain:${d}`) ?? entries.find((u) => { try { return bare(new URL(u).hostname) === d; } catch { return false; } }) ?? null;
    await patchRaw(db, site.id, 'google', { refresh_token: t.refresh_token ?? readRaw(site).google?.refresh_token ?? null, access_token: t.access_token, expires_at: Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60_000, property, properties: entries.slice(0, 50), connected_at: Date.now() });
    return { property };
  }
  const base = `https://graph.facebook.com/${META_VERSION}`;
  const r = await fetcher(`${base}/oauth/access_token?${new URLSearchParams({ client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: redirectUri(origin, p), code })}`);
  const t = (await r.json()) as any;
  if (!r.ok || !t.access_token) throw new Error(`Meta a refusé l’échange du code (${t.error?.message ?? r.status})`);
  // Long-lived token (~60 days).
  const ll = (await fetcher(`${base}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, fb_exchange_token: t.access_token })}`).then((x) => x.json()).catch(() => ({}))) as any;
  const token = ll.access_token ?? t.access_token;
  const accts = (await fetcher(`${base}/me/adaccounts?fields=id,name,currency,account_status&limit=50&access_token=${encodeURIComponent(token)}`).then((x) => x.json()).catch(() => ({}))) as any;
  const accounts = (accts.data ?? []).map((a: any) => ({ id: String(a.id), name: String(a.name ?? a.id), currency: String(a.currency ?? 'USD') }));
  await patchRaw(db, site.id, 'meta', { access_token: token, expires_at: Date.now() + (Number(ll.expires_in) || 60 * 86400) * 1000, accounts, ad_account: accounts[0]?.id ?? null, connected_at: Date.now() });
  return { accounts: accounts.length };
}

async function googleAccess(env: Env, site: Site, fetcher: typeof fetch) {
  const g = readRaw(site).google;
  if (!g) return null;
  if (g.access_token && Number(g.expires_at) > Date.now()) return g.access_token as string;
  if (!g.refresh_token) return null;
  const r = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: g.refresh_token, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, grant_type: 'refresh_token' }).toString(),
  });
  const t = (await r.json()) as any;
  if (!r.ok || !t.access_token) throw new Error('Accès Google expiré ou révoqué : reconnectez Search Console');
  await patchRaw(env.DB, site.id, 'google', { access_token: t.access_token, expires_at: Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60_000 });
  return t.access_token as string;
}

const ymd = (t: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

/** Search Console keywords (+ pages) for the period, with a revenue estimate from Google organic revenue per visitor. */
export async function searchConsole(ctx: Ctx, env: Env, fetcher: typeof fetch = fetch) {
  const { db, site, range } = ctx;
  if (!oauthConfigured(env, 'google')) return { state: 'setup', needs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] };
  const g = readRaw(site).google;
  if (!g) return { state: 'disconnected' };
  if (!g.property) return { state: 'no_property', properties: g.properties ?? [] };
  const token = await googleAccess(env, site, fetcher);
  if (!token) return { state: 'disconnected' };
  const q = async (dimension: 'query' | 'page') => {
    const r = await fetcher(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(g.property)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: ymd(range.from, site.timezone), endDate: ymd(range.to - 1, site.timezone), dimensions: [dimension], rowLimit: 50 }),
    });
    const j = (await r.json()) as any;
    if (!r.ok) throw new Error(`Search Console HTTP ${r.status}: ${j.error?.message ?? ''}`.trim());
    return (j.rows ?? []).map((x: any) => ({ label: x.keys?.[0], clicks: Number(x.clicks), impressions: Number(x.impressions), ctr: Number(x.ctr), position: Math.round(Number(x.position) * 10) / 10 }));
  };
  const [keywords, pages] = await Promise.all([q('query'), q('page')]);
  const org = await db
    .prepare(
      `SELECT COUNT(DISTINCT s.visitor_id) AS v, (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN sessions s2 ON s2.site_id = p.site_id AND s2.id = p.session_id
         WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ? AND s2.channel = 'Organic Search') AS revenue
       FROM sessions s WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at < ? AND s.channel = 'Organic Search'`,
    )
    .bind(site.id, range.from, range.to, site.id, range.from, range.to)
    .first<{ v: number; revenue: number }>();
  const rpv = Number(org?.v) ? Number(org?.revenue) / Number(org?.v) : 0;
  return { state: 'ok', property: g.property, revenuePerOrganicVisitor: Math.round(rpv), currency: site.currency, keywords: keywords.map((k: any) => ({ ...k, estimatedRevenue: Math.round(k.clicks * rpv) })), pages };
}

const META_SOURCES = ['facebook', 'fb', 'instagram', 'ig', 'meta', 'facebook_ads', 'fb_ads', 'meta_ads'];

/** Meta Ads: spend per campaign (Marketing API insights) vs revenue attributed to visits tagged with that campaign. */
export async function metaAds(ctx: Ctx, env: Env, fetcher: typeof fetch = fetch) {
  const { db, site, range } = ctx;
  if (!oauthConfigured(env, 'meta')) return { state: 'setup', needs: ['META_APP_ID', 'META_APP_SECRET'] };
  const m = readRaw(site).meta;
  if (!m?.access_token) return { state: 'disconnected' };
  if (Number(m.expires_at) < Date.now()) return { state: 'expired' };
  if (!m.ad_account) return { state: 'no_account', accounts: m.accounts ?? [] };
  const acct = (m.accounts ?? []).find((a: any) => a.id === m.ad_account);
  const tr = JSON.stringify({ since: ymd(range.from, site.timezone), until: ymd(range.to - 1, site.timezone) });
  const r = await fetcher(`https://graph.facebook.com/${META_VERSION}/${m.ad_account}/insights?${new URLSearchParams({ level: 'campaign', fields: 'campaign_id,campaign_name,spend,clicks,impressions', time_range: tr, limit: '100', access_token: m.access_token })}`);
  const j = (await r.json()) as any;
  if (!r.ok) throw new Error(`Meta HTTP ${r.status}: ${j.error?.message ?? ''}`.trim());
  const ph = META_SOURCES.map(() => '?').join(',');
  const rev = await db
    .prepare(
      `SELECT LOWER(s.utm_campaign) AS campaign, SUM(p.amount) AS revenue, COUNT(DISTINCT CASE WHEN p.kind = 'payment' THEN p.visitor_id END) AS customers
       FROM payments p JOIN sessions s ON s.site_id = p.site_id AND s.id = p.session_id
       WHERE p.site_id = ? AND p.ts >= ? AND p.ts < ? AND LOWER(COALESCE(s.utm_source, '')) IN (${ph}) GROUP BY 1`,
    )
    .bind(site.id, range.from, range.to, ...META_SOURCES)
    .all<{ campaign: string | null; revenue: number; customers: number }>();
  const visits = await db
    .prepare(`SELECT LOWER(s.utm_campaign) AS campaign, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at < ? AND LOWER(COALESCE(s.utm_source, '')) IN (${ph}) GROUP BY 1`)
    .bind(site.id, range.from, range.to, ...META_SOURCES)
    .all<{ campaign: string | null; visitors: number }>();
  const revBy = new Map(rev.results.map((x) => [x.campaign ?? '', x]));
  const visBy = new Map(visits.results.map((x) => [x.campaign ?? '', Number(x.visitors)]));
  const cur = String(acct?.currency ?? site.currency);
  const campaigns = [];
  for (const c of j.data ?? []) {
    const spendMinor = Math.round(Number(c.spend || 0) * 10 ** currencyDecimals(cur));
    const fx = await convertMinor(db, spendMinor, cur, site.currency, range.to - 1);
    const spend = fx?.amount ?? spendMinor;
    const k = String(c.campaign_name ?? '').toLowerCase();
    const rr = revBy.get(k) ?? revBy.get(String(c.campaign_id));
    const revenue = Number(rr?.revenue ?? 0);
    campaigns.push({ id: c.campaign_id, name: c.campaign_name, spend, clicks: Number(c.clicks), impressions: Number(c.impressions), visitors: visBy.get(k) ?? visBy.get(String(c.campaign_id)) ?? 0, revenue, customers: Number(rr?.customers ?? 0), roas: spend ? Math.round((revenue / spend) * 100) / 100 : null });
  }
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const revenue = rev.results.reduce((s, x) => s + Number(x.revenue), 0);
  return { state: 'ok', adAccount: m.ad_account, currency: site.currency, spend, revenue, roas: spend ? Math.round((revenue / spend) * 100) / 100 : null, campaigns, attribution: 'Visites avec utm_source=facebook|instagram|meta… et utm_campaign = nom (ou id) de la campagne' };
}

export function connectorStatus(site: Site, env: Env, origin: string) {
  const raw = readRaw(site);
  const s = readSettings(site);
  return {
    github: { repo: s.github.repo, token: !!env.GITHUB_TOKEN, lastSync: raw.github_state?.at ?? null, ok: raw.github_state?.ok ?? null, error: raw.github_state?.error ?? null },
    reddit: { keywords: s.reddit.keywords.length ? s.reddit.keywords : [site.domain], oauth: !!(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET), lastSync: raw.reddit_state?.at ?? null, ok: raw.reddit_state?.ok ?? null, error: raw.reddit_state?.error ?? null },
    google: { configured: oauthConfigured(env, 'google'), needs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], redirectUri: redirectUri(origin, 'google'), connected: !!raw.google, property: raw.google?.property ?? null, properties: raw.google?.properties ?? [] },
    meta: { configured: oauthConfigured(env, 'meta'), needs: ['META_APP_ID', 'META_APP_SECRET'], redirectUri: redirectUri(origin, 'meta'), connected: !!raw.meta?.access_token, expiresAt: raw.meta?.expires_at ?? null, adAccount: raw.meta?.ad_account ?? null, accounts: raw.meta?.accounts ?? [] },
    x: { configured: !!env.X_BEARER_TOKEN, needs: ['X_BEARER_TOKEN'] },
    email: { configured: !!env.RESEND_API_KEY, needs: ['RESEND_API_KEY', 'REPORT_FROM_EMAIL'] },
  };
}

// ---------------------------------------------------------------- routes

const PROVIDERS_OAUTH: OAuthProvider[] = ['google', 'meta'];

export function registerConnectors(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/annotations', async (c) => c.json(await annotations(makeCtx(c), c.env)));
  app.get('/api/sites/:id/connectors', (c) => c.json(connectorStatus(c.get('site'), c.env, new URL(c.req.url).origin)));
  app.post('/api/sites/:id/connectors/github/sync', async (c) => c.json(await syncGithub(c.env.DB, c.get('site'), c.env)));
  app.post('/api/sites/:id/connectors/reddit/sync', async (c) => c.json(await syncReddit(c.env.DB, c.get('site'), c.env)));
  app.get('/api/sites/:id/reddit', async (c) => {
    const ctx = makeCtx(c);
    const r = await c.env.DB.prepare('SELECT id, ts, title, subreddit, author, url, permalink, score, comments FROM reddit_mentions WHERE site_id = ? AND ts >= ? AND ts < ? ORDER BY ts DESC LIMIT 100')
      .bind(ctx.site.id, ctx.range.from, ctx.range.to)
      .all<any>();
    return c.json({ mentions: r.results.map((m) => ({ ...m, ts: Number(m.ts) })), status: connectorStatus(ctx.site, c.env, new URL(c.req.url).origin).reddit });
  });
  app.get('/api/sites/:id/search-console', async (c) => {
    try {
      return c.json(await searchConsole(makeCtx(c), c.env));
    } catch (e) {
      return c.json({ state: 'error', error: (e as Error).message }, 502);
    }
  });
  app.get('/api/sites/:id/meta-ads', async (c) => {
    try {
      return c.json(await metaAds(makeCtx(c), c.env));
    } catch (e) {
      return c.json({ state: 'error', error: (e as Error).message }, 502);
    }
  });
  for (const p of PROVIDERS_OAUTH) {
    app.post(`/api/sites/:id/oauth/${p}/start`, async (c) => {
      if (!oauthConfigured(c.env, p)) return c.json({ error: 'setup', needs: p === 'google' ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] : ['META_APP_ID', 'META_APP_SECRET'] }, 409);
      return c.json({ url: await oauthStartUrl(c.env, p, c.get('site'), c.get('principal').userId, new URL(c.req.url).origin) });
    });
    app.delete(`/api/sites/:id/oauth/${p}`, async (c) => {
      await patchRaw(c.env.DB, c.get('site').id, p, null);
      return c.json({ ok: true });
    });
    app.patch(`/api/sites/:id/oauth/${p}`, async (c) => {
      const b = await c.req.json<{ property?: string; ad_account?: string }>().catch(() => ({}) as any);
      const raw = readRaw(c.get('site'))[p];
      if (!raw) return c.json({ error: 'not connected' }, 400);
      if (p === 'google' && typeof b.property === 'string' && (raw.properties ?? []).includes(b.property)) await patchRaw(c.env.DB, c.get('site').id, p, { property: b.property });
      if (p === 'meta' && typeof b.ad_account === 'string' && (raw.accounts ?? []).some((a: any) => a.id === b.ad_account)) await patchRaw(c.env.DB, c.get('site').id, p, { ad_account: b.ad_account });
      return c.json({ ok: true });
    });
    // Public callback: the SameSite=Strict session cookie isn't sent on the redirect back, so the signed,
    // 10-minute state carries the site and the user who started the flow.
    app.get(`/api/oauth/${p}/callback`, async (c: Context<AppEnv>) => {
      const origin = new URL(c.req.url).origin;
      const st = await readState(c.env, p, c.req.query('state'));
      if (!st) return c.redirect(`${origin}/sites?oauth_error=state`, 302);
      const back = `${origin}/site/${st.siteId}/settings`;
      if (c.req.query('error') || !c.req.query('code')) return c.redirect(`${back}?oauth=${p}&error=${encodeURIComponent(c.req.query('error') ?? 'denied')}`, 302);
      try {
        await oauthCallback(c.env, p, c.req.query('code')!, origin, st.siteId);
        return c.redirect(`${back}?oauth=${p}&connected=1`, 302);
      } catch (e) {
        return c.redirect(`${back}?oauth=${p}&error=${encodeURIComponent((e as Error).message.slice(0, 120))}`, 302);
      }
    });
  }
}

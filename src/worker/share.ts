/**
 * Shareable read-only dashboards (/share/:token) and the per-site widget token.
 * Every restriction is enforced here: allowed views → allowed breakdown dimensions and filters,
 * revenue stripped from every payload, cities/regions and full referrer URLs optional,
 * visitor profiles never exposed, password (PBKDF2) with persistent + per-IP rate limiting, expiry.
 */
import type { Context, Hono, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Site } from './env.js';
import { hashPassword, randomId, randomToken, sha256Hex, signToken, verifyPassword, verifyToken } from './lib/crypto.js';
import { rawRequestIp } from './lib/security.js';
import { resolveRange, tzOffset } from './lib/time.js';
import { liveMap, mapReport } from './map.js';
import { breakdown, makeCtx, overview, parseFilters, type Ctx } from './stats.js';

export const SHARE_VIEWS = ['overview', 'sources', 'pages', 'map', 'tech', 'goals'] as const;
export type ShareView = (typeof SHARE_VIEWS)[number];
export interface ShareHide { revenue: boolean; cities: boolean; referrers: boolean }
export const DEFAULT_VIEWS: ShareView[] = ['overview', 'sources', 'pages', 'map', 'tech'];
export const DEFAULT_HIDE: ShareHide = { revenue: true, cities: false, referrers: true };

/** Breakdown dimension → the filter key it maps to (null = not filterable). */
const VIEW_DIMS: Record<Exclude<ShareView, 'overview'>, Record<string, string | null>> = {
  sources: { channel: 'channel', source: 'source', campaign: 'utm_campaign', utm_source: 'utm_source', utm_medium: 'utm_medium', keyword: 'utm_term', referrer: null, ref: 'ref' },
  pages: { page: 'page', entry_page: 'entry_page', exit_page: 'exit_page', hostname: 'hostname', exit_link: null },
  map: { country: 'country', region: 'region', city: 'city' },
  tech: { device: 'device', browser: 'browser', os: 'os', screen: 'screen', language: 'language', visitor_type: 'visitor_type' },
  goals: { goal: 'goal' },
};
const REVENUE_KEYS = new Set(['revenue', 'revenuePerVisitor', 'payments', 'customers', 'conversionRate', 'spent']);

export interface ShareRow {
  id: string; site_id: string; token: string; label: string; password_hash: string | null; expires_at: number | null;
  views: string; hide: string; noindex: number; view_count: number; last_viewed_at: number | null;
  fail_count: number; fail_window: number; created_at: number;
}
export interface ShareLink { id: string; token: string; label: string; views: ShareView[]; hide: ShareHide; noindex: boolean; expiresAt: number | null; hasPassword: boolean; viewCount: number; lastViewedAt: number | null; createdAt: number }

const num = (v: unknown) => Number(v) || 0;
export function parseViews(raw: unknown): ShareView[] {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = []; } }
  const set = new Set(Array.isArray(v) ? v.filter((x): x is ShareView => (SHARE_VIEWS as readonly string[]).includes(x as string)) : []);
  set.add('overview'); // the overview is the share's home page
  return SHARE_VIEWS.filter((x) => set.has(x));
}
export function parseHide(raw: unknown): ShareHide {
  let v: any = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = {}; } }
  v = v && typeof v === 'object' ? v : {};
  return { revenue: v.revenue !== false, cities: v.cities === true, referrers: v.referrers !== false };
}
const toLink = (r: ShareRow): ShareLink => ({
  id: r.id, token: r.token, label: r.label, views: parseViews(r.views), hide: parseHide(r.hide), noindex: num(r.noindex) === 1,
  expiresAt: r.expires_at == null ? null : num(r.expires_at), hasPassword: !!r.password_hash, viewCount: num(r.view_count),
  lastViewedAt: r.last_viewed_at == null ? null : num(r.last_viewed_at), createdAt: num(r.created_at),
});

/** Dimensions a link may read, and the filter keys it may apply. */
export function allowedFor(views: ShareView[], hide: ShareHide) {
  const dims = new Set<string>();
  const filters = new Set<string>();
  for (const v of views) {
    if (v === 'overview') continue;
    for (const [d, f] of Object.entries(VIEW_DIMS[v])) {
      if (hide.cities && (d === 'city' || d === 'region')) continue;
      if (hide.referrers && d === 'referrer') continue;
      dims.add(d);
      if (f) filters.add(f);
    }
  }
  return { dims, filters };
}

/** Zeroes every revenue-related number, recursively; breakdown rows that only exist because of revenue are dropped (chart buckets are kept). */
export function stripRevenue<T>(x: T): T {
  if (Array.isArray(x)) return x.filter((r) => !(r && typeof r === 'object' && 'label' in r && 'revenue' in r && 'visitors' in r && !num((r as any).visitors))).map(stripRevenue) as T;
  if (x && typeof x === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(x)) out[k] = REVENUE_KEYS.has(k) && typeof v === 'number' ? 0 : stripRevenue(v);
    return out;
  }
  return x;
}

// ---------- password attempts: persistent per link (10 / 15 min) + per IP in this isolate (5 / min)
const WINDOW = 15 * 60_000;
const MAX_FAILS = 10;
const ipHits = new Map<string, number[]>();
function ipLimited(key: string, now: number): boolean {
  const hits = (ipHits.get(key) ?? []).filter((t) => now - t < 60_000);
  ipHits.set(key, hits);
  if (ipHits.size > 5000) ipHits.clear();
  return hits.length >= 5;
}

const cookieName = (id: string) => `mls_${id}`;
const pwVersion = async (hash: string) => (await sha256Hex(hash)).slice(0, 12);
async function shareKey(c: Context<AppEnv>) {
  return 'share:' + (c.env.SESSION_SECRET ?? '');
}

async function loadLink(c: Context<AppEnv>, token: string): Promise<ShareRow | null> {
  if (!/^[\w-]{20,80}$/.test(token)) return null;
  return c.env.DB.prepare('SELECT * FROM share_links WHERE token = ?').bind(token).first<ShareRow>();
}
async function unlocked(c: Context<AppEnv>, link: ShareRow): Promise<boolean> {
  if (!link.password_hash) return true;
  if (!c.env.SESSION_SECRET) return false;
  const v = await verifyToken(await shareKey(c), getCookie(c, cookieName(link.id)));
  if (!v) return false;
  const [kind, id, ver, exp] = v.split('.');
  return kind === 'sh' && id === link.id && ver === (await pwVersion(link.password_hash)) && Number(exp) > Date.now();
}
const expired = (l: ShareRow) => l.expires_at != null && num(l.expires_at) <= Date.now();

type ShareEnv = AppEnv & { Variables: AppEnv['Variables'] & { share: ShareRow } };

export function registerShare(app: Hono<AppEnv>) {
  // ---------- management (behind requireAuth + loadSite + csrfGuard from index.ts)
  const adminOnly = (c: Context<AppEnv>) => (c.get('principal')?.role === 'viewer' ? c.json({ error: 'Réservé aux admins' }, 403) : null);

  app.get('/api/sites/:id/shares', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    const r = await c.env.DB.prepare('SELECT * FROM share_links WHERE site_id = ? ORDER BY created_at DESC').bind(c.get('site').id).all<ShareRow>();
    c.header('Cache-Control', 'no-store');
    return c.json((r.results ?? []).map(toLink));
  });

  app.post('/api/sites/:id/shares', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    const b = await c.req.json().catch(() => ({})) as any;
    const site = c.get('site');
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM share_links WHERE site_id = ?').bind(site.id).first<{ n: number }>();
    if (num(count?.n) >= 50) return c.json({ error: 'Maximum 50 liens par site' }, 400);
    const label = String(b.label ?? '').trim().slice(0, 80) || 'Lien partagé';
    const pw = typeof b.password === 'string' ? b.password : '';
    if (pw && (pw.length < 6 || pw.length > 200)) return c.json({ error: 'Mot de passe : 6 à 200 caractères' }, 400);
    const exp = b.expiresAt == null || b.expiresAt === '' ? null : Number(b.expiresAt);
    if (exp != null && (!Number.isFinite(exp) || exp <= Date.now())) return c.json({ error: 'La date d’expiration doit être dans le futur' }, 400);
    const row = {
      id: randomId(9), token: randomToken(18), label, password_hash: pw ? await hashPassword(pw) : null, expires_at: exp,
      views: JSON.stringify(b.views === undefined ? DEFAULT_VIEWS : parseViews(b.views)),
      hide: JSON.stringify(b.hide === undefined ? DEFAULT_HIDE : parseHide(b.hide)), noindex: b.noindex === false ? 0 : 1, created_at: Date.now(),
    };
    await c.env.DB.prepare(
      'INSERT INTO share_links (id, site_id, token, label, password_hash, expires_at, views, hide, noindex, view_count, fail_count, fail_window, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)',
    ).bind(row.id, site.id, row.token, row.label, row.password_hash, row.expires_at, row.views, row.hide, row.noindex, row.created_at).run();
    const created = await c.env.DB.prepare('SELECT * FROM share_links WHERE id = ?').bind(row.id).first<ShareRow>();
    return c.json(toLink(created!), 201);
  });

  app.patch('/api/sites/:id/shares/:sid', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    const cur = await c.env.DB.prepare('SELECT * FROM share_links WHERE id = ? AND site_id = ?').bind(c.req.param('sid'), c.get('site').id).first<ShareRow>();
    if (!cur) return c.json({ error: 'Lien introuvable' }, 404);
    const b = await c.req.json().catch(() => ({})) as any;
    const next = { ...cur };
    if (b.label !== undefined) next.label = String(b.label).trim().slice(0, 80) || cur.label;
    if (b.views !== undefined) next.views = JSON.stringify(parseViews(b.views));
    if (b.hide !== undefined) next.hide = JSON.stringify(parseHide(b.hide));
    if (b.noindex !== undefined) next.noindex = b.noindex === false ? 0 : 1;
    if (b.expiresAt !== undefined) {
      const exp = b.expiresAt == null || b.expiresAt === '' ? null : Number(b.expiresAt);
      if (exp != null && (!Number.isFinite(exp) || exp <= Date.now())) return c.json({ error: 'La date d’expiration doit être dans le futur' }, 400);
      next.expires_at = exp;
    }
    if (b.password !== undefined) {
      if (b.password === null || b.password === '') next.password_hash = null;
      else {
        const pw = String(b.password);
        if (pw.length < 6 || pw.length > 200) return c.json({ error: 'Mot de passe : 6 à 200 caractères' }, 400);
        next.password_hash = await hashPassword(pw);
      }
      next.fail_count = 0; next.fail_window = 0;
    }
    if (b.regenerate === true) next.token = randomToken(18); // the old URL stops working immediately
    await c.env.DB.prepare(
      'UPDATE share_links SET label = ?, views = ?, hide = ?, noindex = ?, expires_at = ?, password_hash = ?, token = ?, fail_count = ?, fail_window = ? WHERE id = ?',
    ).bind(next.label, next.views, next.hide, next.noindex, next.expires_at, next.password_hash, next.token, next.fail_count, next.fail_window, cur.id).run();
    return c.json(toLink(next));
  });

  app.delete('/api/sites/:id/shares/:sid', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    await c.env.DB.prepare('DELETE FROM share_links WHERE id = ? AND site_id = ?').bind(c.req.param('sid'), c.get('site').id).run();
    return c.json({ ok: true });
  });

  // Widget token: one per site; regenerating or revoking breaks every embed at once.
  app.get('/api/sites/:id/widgets', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    const r = await c.env.DB.prepare('SELECT token, created_at FROM widget_tokens WHERE site_id = ?').bind(c.get('site').id).first<{ token: string; created_at: number }>();
    c.header('Cache-Control', 'no-store');
    return c.json(r ? { token: r.token, createdAt: num(r.created_at) } : { token: null, createdAt: null });
  });
  app.post('/api/sites/:id/widgets', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    const token = 'w' + randomToken(15);
    const now = Date.now();
    await c.env.DB.prepare('INSERT INTO widget_tokens (site_id, token, created_at) VALUES (?, ?, ?) ON CONFLICT (site_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at')
      .bind(c.get('site').id, token, now).run();
    return c.json({ token, createdAt: now });
  });
  app.delete('/api/sites/:id/widgets', async (c) => {
    const deny = adminOnly(c); if (deny) return deny;
    await c.env.DB.prepare('DELETE FROM widget_tokens WHERE site_id = ?').bind(c.get('site').id).run();
    return c.json({ ok: true });
  });

  // ---------- public read-only share
  const noindex = (c: Context) => { c.header('X-Robots-Tag', 'noindex, nofollow'); c.header('Cache-Control', 'private, no-store'); };

  app.get('/api/share/:token', async (c) => {
    noindex(c);
    const link = await loadLink(c, c.req.param('token'));
    if (!link) return c.json({ error: 'Ce lien de partage n’existe pas ou a été révoqué.' }, 404);
    if (expired(link)) return c.json({ error: 'Ce lien de partage a expiré.', expired: true }, 410);
    const site = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(link.site_id).first<Site>();
    if (!site) return c.json({ error: 'Ce lien de partage n’existe pas ou a été révoqué.' }, 404);
    const brand = { name: site.name, domain: site.domain };
    if (!(await unlocked(c, link))) return c.json({ locked: true, label: link.label, site: brand, noindex: num(link.noindex) === 1 });
    // The SPA asks for this once per page load: that is the view counter.
    await c.env.DB.prepare('UPDATE share_links SET view_count = view_count + 1, last_viewed_at = ? WHERE id = ?').bind(Date.now(), link.id).run();
    const l = toLink(link);
    return c.json({
      locked: false, label: l.label, views: l.views, hide: l.hide, noindex: l.noindex, expiresAt: l.expiresAt,
      site: { ...brand, timezone: site.timezone, currency: site.currency, created_at: num(site.created_at) },
    });
  });

  app.post('/api/share/:token/unlock', async (c) => {
    noindex(c);
    const link = await loadLink(c, c.req.param('token'));
    if (!link) return c.json({ error: 'Lien introuvable' }, 404);
    if (expired(link)) return c.json({ error: 'Ce lien de partage a expiré.' }, 410);
    if (!link.password_hash) return c.json({ ok: true });
    if (!c.env.SESSION_SECRET) return c.json({ error: 'SESSION_SECRET manquant' }, 500);
    const now = Date.now();
    const ipKey = rawRequestIp(c) + '|' + link.id;
    const inWindow = now - num(link.fail_window) < WINDOW;
    if ((inWindow && num(link.fail_count) >= MAX_FAILS) || ipLimited(ipKey, now)) {
      const retry = inWindow && num(link.fail_count) >= MAX_FAILS ? Math.ceil((num(link.fail_window) + WINDOW - now) / 1000) : 60;
      c.header('Retry-After', String(retry));
      return c.json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil(retry / 60)} min.` }, 429);
    }
    const b = await c.req.json().catch(() => ({})) as any;
    const ok = typeof b.password === 'string' && b.password.length <= 200 && (await verifyPassword(b.password, link.password_hash));
    if (!ok) {
      ipHits.get(ipKey)?.push(now) ?? ipHits.set(ipKey, [now]);
      await c.env.DB.prepare('UPDATE share_links SET fail_count = ?, fail_window = ? WHERE id = ?')
        .bind(inWindow ? num(link.fail_count) + 1 : 1, inWindow ? num(link.fail_window) : now, link.id).run();
      return c.json({ error: 'Mot de passe incorrect' }, 401);
    }
    await c.env.DB.prepare('UPDATE share_links SET fail_count = 0, fail_window = 0 WHERE id = ?').bind(link.id).run();
    const exp = now + 7 * 86_400_000;
    setCookie(c, cookieName(link.id), await signToken(await shareKey(c), `sh.${link.id}.${await pwVersion(link.password_hash)}.${exp}`), {
      path: '/api/share/' + link.token, httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', maxAge: 7 * 86_400,
    });
    return c.json({ ok: true });
  });

  // Data routes: link must exist, be unexpired and unlocked.
  const guard = async (c: Context<ShareEnv>, next: Next) => {
    noindex(c);
    const link = await loadLink(c as any, c.req.param('token') ?? '');
    if (!link) return c.json({ error: 'Lien introuvable' }, 404);
    if (expired(link)) return c.json({ error: 'Ce lien de partage a expiré.' }, 410);
    if (!(await unlocked(c as any, link))) return c.json({ error: 'Mot de passe requis', locked: true }, 401);
    const site = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(link.site_id).first<Site>();
    if (!site) return c.json({ error: 'Lien introuvable' }, 404);
    c.set('site', site);
    c.set('share', link);
    await next();
  };
  for (const p of ['overview', 'breakdown', 'map', 'map/live']) app.use(`/api/share/:token/${p}`, guard as any);

  /** Ctx with the link's filter whitelist applied (unknown/forbidden filters → 400, never silently widened). */
  const shareCtx = (c: Context<ShareEnv>): Ctx | Response => {
    const link = c.get('share');
    const { filters } = allowedFor(parseViews(link.views), parseHide(link.hide));
    const ctx = makeCtx(c as any);
    const asked = parseFilters(c.req.query('filters'));
    for (const k of Object.keys(asked)) if (!filters.has(k)) return c.json({ error: `Filtre non autorisé sur ce lien : ${k}` }, 403);
    // Range: no "now" minute view and no custom range before the site existed (resolveRange already clamps).
    return { ...ctx, filters: asked };
  };
  const finish = (c: Context<ShareEnv>, data: unknown) => c.json(parseHide(c.get('share').hide).revenue ? stripRevenue(data) : data);

  app.get('/api/share/:token/overview', async (c) => {
    const ctx = shareCtx(c as any); if (ctx instanceof Response) return ctx;
    return finish(c as any, await overview(ctx));
  });
  app.get('/api/share/:token/breakdown', async (c) => {
    const link = (c as any).get('share') as ShareRow;
    const dim = c.req.query('dim') ?? '';
    if (!allowedFor(parseViews(link.views), parseHide(link.hide)).dims.has(dim)) return c.json({ error: 'Vue non partagée' }, 403);
    const ctx = shareCtx(c as any); if (ctx instanceof Response) return ctx;
    const rows = await breakdown(ctx, dim, Math.min(100, Number(c.req.query('limit')) || 100));
    return finish(c as any, rows);
  });
  app.get('/api/share/:token/map', async (c) => {
    const link = (c as any).get('share') as ShareRow;
    if (!parseViews(link.views).includes('map')) return c.json({ error: 'Vue non partagée' }, 403);
    const ctx = shareCtx(c as any); if (ctx instanceof Response) return ctx;
    return c.json(await mapReport(ctx, { cities: !parseHide(link.hide).cities }));
  });
  app.get('/api/share/:token/map/live', async (c) => {
    const link = (c as any).get('share') as ShareRow;
    if (!parseViews(link.views).includes('map')) return c.json({ error: 'Vue non partagée' }, 403);
    return c.json(await liveMap(c.env.DB, link.site_id, { cities: !parseHide(link.hide).cities }));
  });
}

// ---------- widgets: aggregate-only data for embeds
export const WIDGET_PERIODS = ['today', '24h', '7d', '30d', '90d', '12m', 'all'] as const;
export async function widgetSite(db: D1Database, token: string): Promise<Site | null> {
  if (!/^w[\w-]{15,40}$/.test(token)) return null;
  return db.prepare('SELECT s.* FROM widget_tokens w JOIN sites s ON s.id = w.site_id WHERE w.token = ?').bind(token).first<Site>();
}
export async function widgetData(db: D1Database, site: Site, period: string) {
  const p = (WIDGET_PERIODS as readonly string[]).includes(period) ? period : '30d';
  const range = resolveRange({ period: p }, site.timezone, site.created_at);
  const ctx: Ctx = { db, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) };
  const [ov, pages, countries, live] = await Promise.all([overview(ctx), breakdown(ctx, 'page', 5), breakdown(ctx, 'country', 80), liveMap(db, site.id, { cities: false })]);
  return {
    site: { name: site.name, domain: site.domain },
    period: p,
    online: num(live.online),
    visitors: num(ov.current.visitors),
    pageviews: num(ov.current.pageviews),
    previousVisitors: num(ov.previous.visitors),
    series: ov.series.map((s: any) => ({ bucket: s.bucket, visitors: num(s.visitors) })),
    pages: pages.filter((r) => r.label).map((r) => ({ label: r.label as string, visitors: num(r.visitors) })),
    countries: countries.filter((r) => r.label && /^[A-Z]{2}$/.test(r.label)).map((r) => ({ country: r.label as string, visitors: num(r.visitors) })),
  };
}
export type WidgetData = Awaited<ReturnType<typeof widgetData>>;

/**
 * Personal public page: one per owner account, published explicitly.
 * GET/PUT /api/me/page, POST /api/me/page/publish
 * GET /api/public/page/:slug  (404 if unpublished or unknown)
 * GET /api/public/page/:slug/widget/:i[/data]
 * GET /api/public/page/:slug/og.png (SVG kept at /og.svg as fallback)
 * GET /api/u/:slug and GET /u/:slug — HTML shell with OG tags for crawlers.
 */
import type { Hono } from 'hono';
import type { AppEnv } from './env.js';
import { requireOwner } from './auth.js';
import { csrfGuard } from './lib/security.js';
import type { Principal } from './env.js';
import { widgetData, type WidgetData } from './share.js';
import { renderWidget, widgetOpts, WIDGET_STYLES, WIDGET_TYPES, type WidgetOpts } from './widgets.js';
import { SPA_SHELL } from './spa-shell.gen.js';
import { OG_PNG_HEADERS, renderOgPng } from './og-image.js';

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'login', 'signup', 'sites', 'site', 'team', 'demo', 'share', 'invite', 'settings',
  'docs', 'api-docs', 'widget', 'widgets', 'u', 'me', 'page', 'pages', 'profile', 'static', 'assets',
  'js', 'maps', 'public', 'owner', 'root', 'support', 'help', 'blog', 'www', 'app', 'dashboard',
  'account', 'billing', 'legal', 'privacy', 'terms', 'status', 'health', 'cron', 'favicon', 'robots',
  'sitemap', 'og', 'waitlist', 'not-found', '404', 'minilytics', 'index', 'new', 'edit', 'preview',
]);

const SOCIAL: Record<string, RegExp> = {
  x: /^https:\/\/(twitter|x)\.com\/[A-Za-z0-9_]{1,30}\/?$/i,
  linkedin: /^https:\/\/(www\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9._%-]+\/?$/i,
  github: /^https:\/\/github\.com\/[A-Za-z0-9-]+\/?$/i,
  instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/i,
  youtube: /^https:\/\/(www\.)?youtube\.com\/(@[A-Za-z0-9._-]+|c\/[A-Za-z0-9._-]+|channel\/[\w-]+)\/?$/i,
  bluesky: /^https:\/\/bsky\.app\/profile\/[A-Za-z0-9._-]+$/i,
  threads: /^https:\/\/(www\.)?threads\.(net|com)\/@[A-Za-z0-9._]+\/?$/i,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/?$/i,
  facebook: /^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.]+\/?$/i,
  website: /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i,
};
export const SOCIAL_KEYS = Object.keys(SOCIAL);

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function isPrivateHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true;
  }
  return false;
}

export function safeHttpsUrl(raw: unknown, max = 300): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > max) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (isPrivateHost(u.hostname)) return null;
  if (u.hash) u.hash = '';
  return u.toString();
}

export function parseSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(s)) return null;
  if (s.startsWith('-') || s.endsWith('-') || s.includes('--')) return null;
  if (RESERVED_SLUGS.has(s)) return null;
  return s;
}

export interface SocialLink { network: string; url: string }
export interface PageWidget {
  siteId: string; type: string; period?: string; style?: string; accent?: string;
  size?: string; theme?: string; logo?: boolean; transparent?: boolean;
}
export interface ProfilePage {
  userId: string; slug: string; title: string; bio: string; avatarUrl: string | null; coverUrl: string | null;
  socials: SocialLink[]; theme: 'light' | 'dark' | 'auto'; accent: string; layout: 'stacked' | 'grid';
  published: boolean; widgets: PageWidget[]; createdAt: number; updatedAt: number;
}

function rowToPage(r: any): ProfilePage {
  let socials: SocialLink[] = [];
  let widgets: PageWidget[] = [];
  try { socials = JSON.parse(r.socials || '[]'); } catch { /* */ }
  try { widgets = JSON.parse(r.widgets || '[]'); } catch { /* */ }
  return {
    userId: r.user_id, slug: r.slug, title: r.title, bio: r.bio ?? '', avatarUrl: r.avatar_url, coverUrl: r.cover_url,
    socials, theme: r.theme === 'dark' || r.theme === 'light' ? r.theme : 'auto',
    accent: /^[0-9a-f]{6}$/.test(r.accent ?? '') ? r.accent : '2563eb',
    layout: r.layout === 'grid' ? 'grid' : 'stacked',
    published: Number(r.published) === 1, widgets, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  };
}

export function parseSocials(raw: unknown): SocialLink[] | { error: string } {
  if (!Array.isArray(raw)) return { error: 'Les liens sociaux doivent être une liste.' };
  if (raw.length > 8) return { error: 'Huit liens sociaux au plus.' };
  const out: SocialLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'Lien social invalide.' };
    const network = String((item as any).network ?? '').toLowerCase();
    const url = safeHttpsUrl((item as any).url);
    if (!SOCIAL[network]) return { error: `Réseau non pris en charge : ${network || '—'}`.trim() };
    if (!url || !SOCIAL[network].test(url.replace(/\/$/, '') === url ? url : url.replace(/\/$/, ''))) {
      // also accept with trailing slash already in regex
      if (!url || !SOCIAL[network].test(url)) return { error: `L’adresse ${network} n’est pas valide.` };
    }
    out.push({ network, url });
  }
  return out;
}

export function parseWidgets(raw: unknown): PageWidget[] | { error: string } {
  if (!Array.isArray(raw)) return { error: 'Les widgets doivent être une liste.' };
  if (raw.length > 8) return { error: 'Huit widgets au plus.' };
  const out: PageWidget[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { error: 'Widget invalide.' };
    const siteId = String((item as any).siteId ?? '');
    const type = String((item as any).type ?? '');
    if (!/^[\w-]{4,40}$/.test(siteId)) return { error: 'Site du widget invalide.' };
    if (!(WIDGET_TYPES as readonly string[]).includes(type)) return { error: 'Type de widget inconnu.' };
    const style = (item as any).style;
    const accent = (item as any).accent;
    const w: PageWidget = { siteId, type };
    if (typeof (item as any).period === 'string' && /^[\w-]{1,12}$/.test((item as any).period)) w.period = (item as any).period;
    if (typeof style === 'string' && (WIDGET_STYLES as readonly string[]).includes(style)) w.style = style;
    if (typeof accent === 'string' && /^[0-9a-fA-F]{6}$/.test(accent)) w.accent = accent.toLowerCase();
    if (['sm', 'md', 'lg'].includes((item as any).size)) w.size = (item as any).size;
    if (['light', 'dark', 'auto'].includes((item as any).theme)) w.theme = (item as any).theme;
    if (typeof (item as any).logo === 'boolean') w.logo = (item as any).logo;
    if (typeof (item as any).transparent === 'boolean') w.transparent = (item as any).transparent;
    out.push(w);
  }
  return out;
}

async function ownerSites(db: D1Database, p: Principal): Promise<{ id: string; name: string; domain: string }[]> {
  const r = await db.prepare('SELECT id, name, domain FROM sites ORDER BY created_at').all();
  const all = (r.results as any[]).map((s) => ({ id: String(s.id), name: String(s.name), domain: String(s.domain) }));
  if (p.sites === '*') return all;
  const allow = new Set(p.sites);
  return all.filter((s) => allow.has(s.id));
}

async function getByUser(db: D1Database, userId: string) {
  const r = await db.prepare('SELECT * FROM profile_pages WHERE user_id = ?').bind(userId).first();
  return r ? rowToPage(r) : null;
}
async function getBySlug(db: D1Database, slug: string) {
  const r = await db.prepare('SELECT * FROM profile_pages WHERE slug = ?').bind(slug).first();
  return r ? rowToPage(r) : null;
}

function publicView(p: ProfilePage) {
  return {
    slug: p.slug, title: p.title, bio: p.bio, avatarUrl: p.avatarUrl, coverUrl: p.coverUrl,
    socials: p.socials, theme: p.theme, accent: p.accent, layout: p.layout, widgets: p.widgets, updatedAt: p.updatedAt,
  };
}

function optsFrom(w: PageWidget, i: number): WidgetOpts {
  return widgetOpts({
    type: w.type, period: w.period, style: w.style, accent: w.accent, size: w.size,
    theme: w.theme, logo: w.logo === false ? '0' : undefined, transparent: w.transparent ? '1' : undefined,
    wid: 'pp' + i,
  });
}

function loadShell() { return SPA_SHELL; }

export function injectProfileMeta(html: string, page: ProfilePage, origin: string) {
  const url = `${origin}/u/${page.slug}`;
  const title = `${page.title} · Minilytics`;
  const desc = (page.bio || `La page publique de ${page.title}, avec des widgets Minilytics en direct.`).slice(0, 200);
  const image = `${origin}/api/public/page/${page.slug}/og.png`;
  const set = (s: string, re: RegExp, tag: string) => (re.test(s) ? s.replace(re, tag) : s.replace('</head>', `    ${tag}\n  </head>`));
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = set(out, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(desc)}" />`);
  out = set(out, /<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(url)}" />`);
  out = set(out, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${esc(url)}" />`);
  out = set(out, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(title)}" />`);
  out = set(out, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(desc)}" />`);
  out = set(out, /<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${esc(image)}" />`);
  out = set(out, /<meta property="og:image:width" content="[^"]*"\s*\/?>/, `<meta property="og:image:width" content="1200" />`);
  out = set(out, /<meta property="og:image:height" content="[^"]*"\s*\/?>/, `<meta property="og:image:height" content="630" />`);
  out = set(out, /<meta property="og:image:type" content="[^"]*"\s*\/?>/, `<meta property="og:image:type" content="image/png" />`);
  out = set(out, /<meta property="og:image:alt" content="[^"]*"\s*\/?>/, `<meta property="og:image:alt" content="${esc(page.title)}" />`);
  out = set(out, /<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  out = set(out, /<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${esc(desc)}" />`);
  out = set(out, /<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  out = out.replace(/<html lang="fr"/, `<html lang="fr" class="${page.theme === 'dark' ? 'dark' : ''}"`);
  // Drop the default JSON-LD (it's about the product, not the person).
  out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ProfilePage', name: page.title, description: desc, url,
    image, isAccessibleForFree: true,
  })}</script>`);
  return out;
}

export function fallbackProfileHtml(page: ProfilePage, origin: string) {
  const title = `${page.title} · Minilytics`;
  const desc = (page.bio || `La page publique de ${page.title}.`).slice(0, 200);
  const url = `${origin}/u/${page.slug}`;
  const image = `${origin}/api/public/page/${page.slug}/og.png`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(image)}">
</head><body><div id="root"></div></body></html>`;
}

export function ogSvg(page: ProfilePage) {
  const title = esc(page.title.slice(0, 60));
  const bio = esc((page.bio || 'Page publique Minilytics').slice(0, 140));
  const accent = '#' + page.accent;
  const initials = esc((page.title.trim().split(/\s+/).map((w) => w[0]).join('') || 'M').slice(0, 2).toUpperCase());
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity=".02"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0a0b"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1080" cy="80" r="220" fill="${accent}" fill-opacity=".12"/>
  <circle cx="80" cy="560" r="180" fill="${accent}" fill-opacity=".1"/>
  <g transform="translate(80,80)">
    <rect width="96" height="96" rx="24" fill="${accent}"/>
    <text x="48" y="64" text-anchor="middle" font-family="Geist,ui-sans-serif,system-ui,sans-serif" font-size="36" font-weight="700" fill="#fff">${initials}</text>
    <text x="0" y="200" font-family="Geist,ui-sans-serif,system-ui,sans-serif" font-size="64" font-weight="650" fill="#fafafa">${title}</text>
    <text x="0" y="270" font-family="Geist,ui-sans-serif,system-ui,sans-serif" font-size="28" fill="#a1a1aa">${bio}</text>
    <text x="0" y="500" font-family="Geist,ui-sans-serif,system-ui,sans-serif" font-size="22" fill="#71717a">Minilytics · minilytics-six.vercel.app/u/${esc(page.slug)}</text>
  </g>
</svg>`;
}

async function htmlFor(page: ProfilePage, origin: string, status = 200) {
  const shell = loadShell();
  const html = shell ? injectProfileMeta(shell, page, origin) : fallbackProfileHtml(page, origin);
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

export function registerProfile(app: Hono<AppEnv>) {
  app.use('/api/me', csrfGuard);
  app.use('/api/me/*', csrfGuard);
  app.use('/api/me/*', requireOwner);

  app.get('/api/me/page', async (c) => {
    const p = c.get('principal');
    const page = await getByUser(c.env.DB, p.userId);
    const sites = await ownerSites(c.env.DB, p);
    return c.json({ page, sites });
  });

  app.put('/api/me/page', async (c) => {
    const p = c.get('principal');
    let body: any;
    try { body = await c.req.json(); } catch { return c.json({ error: 'JSON invalide' }, 400); }
    const slug = parseSlug(body.slug);
    if (!slug) return c.json({ error: 'Choisissez une adresse de 2 à 31 caractères (lettres, chiffres, tirets).' }, 400);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 2 || title.length > 80) return c.json({ error: 'Le titre doit faire entre 2 et 80 caractères.' }, 400);
    const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 280) : '';
    const avatarUrl = body.avatarUrl == null || body.avatarUrl === '' ? null : safeHttpsUrl(body.avatarUrl);
    if (body.avatarUrl && !avatarUrl) return c.json({ error: 'L’avatar doit être une adresse https publique.' }, 400);
    const coverUrl = body.coverUrl == null || body.coverUrl === '' ? null : safeHttpsUrl(body.coverUrl);
    if (body.coverUrl && !coverUrl) return c.json({ error: 'La couverture doit être une adresse https publique.' }, 400);
    const socials = parseSocials(body.socials ?? []);
    if ('error' in socials) return c.json({ error: socials.error }, 400);
    const widgets = parseWidgets(body.widgets ?? []);
    if ('error' in widgets) return c.json({ error: widgets.error }, 400);
    const allowed = new Set((await ownerSites(c.env.DB, p)).map((s) => s.id));
    if (widgets.some((w) => !allowed.has(w.siteId))) return c.json({ error: 'Un widget pointe vers un site auquel vous n’avez pas accès.' }, 400);
    const theme = body.theme === 'dark' || body.theme === 'light' ? body.theme : 'auto';
    const layout = body.layout === 'grid' ? 'grid' : 'stacked';
    const accent = typeof body.accent === 'string' && /^[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent.toLowerCase() : '2563eb';
    const now = Date.now();
    const existing = await getByUser(c.env.DB, p.userId);
    const taken = await c.env.DB.prepare('SELECT user_id FROM profile_pages WHERE slug = ?').bind(slug).first<{ user_id: string }>();
    if (taken && taken.user_id !== p.userId) return c.json({ error: 'Cette adresse est déjà prise.' }, 409);
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE profile_pages SET slug=?, title=?, bio=?, avatar_url=?, cover_url=?, socials=?, theme=?, accent=?, layout=?, widgets=?, updated_at=? WHERE user_id=?`,
      ).bind(slug, title, bio || null, avatarUrl, coverUrl, JSON.stringify(socials), theme, accent, layout, JSON.stringify(widgets), now, p.userId).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO profile_pages (user_id, slug, title, bio, avatar_url, cover_url, socials, theme, accent, layout, published, widgets, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      ).bind(p.userId, slug, title, bio || null, avatarUrl, coverUrl, JSON.stringify(socials), theme, accent, layout, JSON.stringify(widgets), now, now).run();
    }
    return c.json({ page: await getByUser(c.env.DB, p.userId) });
  });

  app.post('/api/me/page/publish', async (c) => {
    const p = c.get('principal');
    let body: any = {};
    try { body = await c.req.json(); } catch { /* empty */ }
    const page = await getByUser(c.env.DB, p.userId);
    if (!page) return c.json({ error: 'Enregistrez d’abord la page.' }, 400);
    const published = body.published === true || body.published === 1;
    await c.env.DB.prepare('UPDATE profile_pages SET published = ?, updated_at = ? WHERE user_id = ?').bind(published ? 1 : 0, Date.now(), p.userId).run();
    return c.json({ page: await getByUser(c.env.DB, p.userId) });
  });

  app.delete('/api/me/page', async (c) => {
    const p = c.get('principal');
    await c.env.DB.prepare('DELETE FROM profile_pages WHERE user_id = ?').bind(p.userId).run();
    return c.json({ ok: true });
  });

  const publicPage = async (db: D1Database, slug: string) => {
    const s = parseSlug(slug);
    if (!s) return null;
    const page = await getBySlug(db, s);
    if (!page || !page.published) return null;
    return page;
  };

  app.get('/api/public/page/:slug', async (c) => {
    const page = await publicPage(c.env.DB, c.req.param('slug'));
    if (!page) return c.json({ error: 'Page introuvable' }, 404, { 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Robots-Tag': 'noindex' });
    c.header('Cache-Control', 'public, max-age=30, must-revalidate');
    return c.json(publicView(page));
  });

  async function widgetBundle(c: any, slug: string, index: string) {
    const page = await publicPage(c.env.DB, slug);
    if (!page) return null;
    const i = Number(index);
    const w = page.widgets[i];
    if (!w) return null;
    const site = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(w.siteId).first();
    if (!site) return null;
    const o = optsFrom(w, i);
    const d: WidgetData = await widgetData(c.env.DB, site as any, o.period);
    return { page, w, o, d, i };
  }

  app.get('/api/public/page/:slug/widget/:i', async (c) => {
    const b = await widgetBundle(c, c.req.param('slug'), c.req.param('i'));
    if (!b) return c.html('<!doctype html><meta charset="utf-8"><title>Widget</title>', 404, { 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'", 'Cache-Control': 'public, max-age=30' });
    const origin = new URL(c.req.url).origin;
    const { html, nonce } = renderWidget(b.o, b.d, origin, 'page', `/api/public/page/${b.page.slug}/widget/${b.i}/data`);
    return c.html(html, 200, {
      'Cache-Control': 'public, max-age=30',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
      'X-Robots-Tag': 'noindex',
    });
  });
  app.get('/api/public/page/:slug/widget/:i/data', async (c) => {
    const b = await widgetBundle(c, c.req.param('slug'), c.req.param('i'));
    if (!b) return c.json({ error: 'not found' }, 404);
    c.header('Cache-Control', 'public, max-age=30');
    return c.json(b.d);
  });

  app.get('/api/public/page/:slug/og.svg', async (c) => {
    const page = await publicPage(c.env.DB, c.req.param('slug'));
    if (!page) return c.body('not found', 404, { 'content-type': 'text/plain', 'cache-control': 'public, max-age=0, must-revalidate' });
    return c.body(ogSvg(page), 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=0, must-revalidate',
    });
  });
  app.get('/api/public/page/:slug/og.png', async (c) => {
    const page = await publicPage(c.env.DB, c.req.param('slug'));
    if (!page) return c.body('not found', 404, { 'content-type': 'text/plain', 'cache-control': 'public, max-age=0, must-revalidate' });
    const png = await renderOgPng({
      title: page.title,
      subtitle: page.bio || 'Page publique Minilytics',
      kicker: 'Page publique',
      footer: `minilytics-six.vercel.app/u/${page.slug}`,
      accent: page.accent,
    });
    return new Response(png, { status: 200, headers: OG_PNG_HEADERS });
  });

  const serveHtml = async (c: any) => {
    const page = await publicPage(c.env.DB, c.req.param('slug'));
    const origin = new URL(c.req.url).origin;
    if (!page) {
      return new Response('<!doctype html><meta charset="utf-8"><title>Page introuvable</title><meta name="robots" content="noindex"><p>Cette page n’existe pas ou n’est plus publiée.</p>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', 'x-robots-tag': 'noindex' },
      });
    }
    return htmlFor(page, origin);
  };
  app.get('/api/u/:slug', serveHtml);
  app.get('/u/:slug', serveHtml);
}

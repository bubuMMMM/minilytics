/**
 * Phone widget boards: a revocable, read-only token per selection of widgets.
 * Public routes never include admin credentials. Revoking a board 404s immediately
 * (no CDN cache). Independent from site embed tokens in widget_tokens.
 */
import type { Context, Hono } from 'hono';
import { zipSync } from 'fflate';
import type { AppEnv, Site } from './env.js';
import { randomId, randomToken } from './lib/crypto.js';
import { widgetData, widgetSite, type WidgetData } from './share.js';
import { WIDGET_TYPES, widgetOpts, renderWidget, type WidgetOpts, type WidgetStyle } from './widgets.js';
import { parsePngSize, pngResponse, renderBoardPng, renderWidgetPng, type BoardPngItem } from './widget-png.js';

const BOARD_RE = /^wp[\w-]{15,40}$/;
const MAX_ITEMS = 6;
const MAX_BOARDS = 20;
const NO_STORE = 'private, no-store';
const PUBLIC_CACHE = 'public, max-age=30, s-maxage=0, must-revalidate';

export interface BoardItem {
  type: (typeof WIDGET_TYPES)[number];
  style: WidgetStyle;
  theme: 'light' | 'dark' | 'auto';
  accent: string;
  size: 'sm' | 'md' | 'lg';
  period: string;
  locale: 'fr' | 'en';
  logo: boolean;
  transparent: boolean;
}

interface BoardRow {
  id: string;
  site_id: string;
  token: string;
  name: string;
  items: string;
  theme: string;
  created_at: number;
  updated_at: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const cleanName = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

export function parseBoardItems(raw: unknown): BoardItem[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Choisissez au moins un widget.' };
  if (raw.length > MAX_ITEMS) return { error: `Six widgets maximum par écran.` };
  const out: BoardItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') return { error: 'Widget invalide.' };
    const q = x as Record<string, unknown>;
    if (q.type === 'revenue' || q.type === 'badge') return { error: 'Ce type de widget ne peut pas être ajouté sur le téléphone.' };
    const o = widgetOpts({
      type: String(q.type ?? ''),
      style: String(q.style ?? ''),
      theme: String(q.theme ?? ''),
      accent: String(q.accent ?? '').replace('#', ''),
      size: String(q.size ?? ''),
      period: String(q.period ?? '30d'),
      locale: String(q.locale ?? 'fr'),
      logo: q.logo === false || q.logo === 0 || q.logo === '0' ? '0' : '1',
      transparent: q.transparent === true || q.transparent === '1' ? '1' : '0',
    });
    if (!(WIDGET_TYPES as readonly string[]).includes(o.type)) return { error: 'Type de widget inconnu.' };
    out.push({
      type: o.type,
      style: o.style,
      theme: o.theme,
      accent: o.accent.replace('#', ''),
      size: o.size,
      period: o.period,
      locale: o.locale,
      logo: o.logo,
      transparent: o.transparent,
    });
  }
  return out;
}

function parseTheme(v: unknown): 'light' | 'dark' | 'auto' {
  return v === 'light' || v === 'dark' ? v : 'auto';
}

function asOpts(it: BoardItem): WidgetOpts {
  return {
    type: it.type,
    style: it.style,
    theme: it.theme,
    accent: '#' + it.accent.replace('#', ''),
    size: it.size,
    period: it.period,
    locale: it.locale,
    logo: it.logo,
    transparent: it.transparent,
    wid: '',
  };
}

function publicBoard(row: BoardRow, origin: string) {
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    items: JSON.parse(row.items) as BoardItem[],
    theme: parseTheme(row.theme),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url: `${origin}/w/${row.token}`,
  };
}

type Loaded = { board: BoardRow; items: BoardItem[]; site: Site };

async function loadBoard(db: D1Database, token: string): Promise<Loaded | null> {
  if (!BOARD_RE.test(token)) return null;
  const row = await db.prepare(
    `SELECT b.id, b.site_id, b.token, b.name, b.items, b.theme, b.created_at, b.updated_at,
            s.name AS site_name, s.domain, s.timezone, s.currency, s.created_at AS site_created
     FROM widget_boards b JOIN sites s ON s.id = b.site_id WHERE b.token = ?`,
  ).bind(token).first<BoardRow & { site_name: string; domain: string; timezone: string; currency: string; site_created: number }>();
  if (!row) return null;
  let items: BoardItem[] = [];
  try { items = JSON.parse(row.items); } catch { return null; }
  if (!Array.isArray(items) || !items.length) return null;
  const site: Site = {
    id: row.site_id,
    name: row.site_name,
    domain: row.domain,
    timezone: row.timezone,
    currency: row.currency,
    api_key: '',
    dodo_webhook_secret: null,
    created_at: row.site_created,
  };
  return { board: row, items, site };
}

async function boardPayload(db: D1Database, loaded: Loaded) {
  const periods = [...new Set(loaded.items.map((i) => i.period))];
  const dataByPeriod = new Map<string, WidgetData>();
  await Promise.all(periods.map(async (p) => { dataByPeriod.set(p, await widgetData(db, loaded.site, p)); }));
  const items = loaded.items.map((it) => ({ ...it, data: dataByPeriod.get(it.period)! }));
  return {
    name: loaded.board.name,
    theme: parseTheme(loaded.board.theme),
    site: { name: loaded.site.name, domain: loaded.site.domain },
    items,
  };
}

function gone() {
  return new Response(JSON.stringify({ error: 'Ce tableau de widgets a été révoqué ou n’existe pas.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': NO_STORE, 'X-Robots-Tag': 'noindex' },
  });
}

function goneHtml() {
  return new Response(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Widgets introuvables</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:20vh auto;padding:0 20px;color:#18181b}p{color:#52525b}</style></head><body><h1>Widgets introuvables</h1><p>Ce tableau de widgets a été révoqué ou n’existe pas.</p></body></html>',
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': NO_STORE, 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'" } },
  );
}

function boardHtml(origin: string, token: string, payload: Awaited<ReturnType<typeof boardPayload>>): string {
  const theme = payload.theme;
  const title = esc(payload.name || payload.site.name || 'Widgets Minilytics');
  const cards = payload.items.map((it, i) =>
    `<article class="slot" data-i="${i}"><iframe title="${esc(it.type)}" src="${esc(origin)}/api/w/${esc(token)}/embed?i=${i}" loading="eager"></iframe></article>`
  ).join('');
  const themeColor = theme === 'light' ? '#f4f4f5' : '#0a0a0b';
  return `<!doctype html>
<html lang="fr"${theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="${themeColor}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="${theme === 'light' ? 'default' : 'black-translucent'}">
<meta name="apple-mobile-web-app-title" content="${esc((payload.site.domain || 'Minilytics').slice(0, 12))}">
<title>${title}</title>
<link rel="manifest" href="/api/w/${esc(token)}/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<style>
:root{--bg:#0a0a0b;--ink:#fafafa;--muted:#a1a1aa;--line:#27272a}
[data-theme=light],:root[data-theme=light]{--bg:#f4f4f5;--ink:#09090b;--muted:#52525b;--line:#e4e4e7}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#f4f4f5;--ink:#09090b;--muted:#52525b;--line:#e4e4e7}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100%;-webkit-font-smoothing:antialiased}
body{padding:calc(20px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))}
header{text-align:center;margin-bottom:20px}
.kicker{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
h1{font-size:1.25rem;font-weight:650;letter-spacing:-.02em;margin-top:4px}
.domain{color:var(--muted);font-size:.85rem;margin-top:2px}
.wall{display:flex;flex-direction:column;gap:14px;max-width:520px;margin:0 auto;width:100%}
.slot{width:100%;border:0;border-radius:18px;overflow:hidden;background:transparent}
.slot iframe{width:100%;border:0;background:transparent;display:block;min-height:80px;height:var(--h, 220px)}
.hint{max-width:520px;margin:24px auto 0;padding:14px 16px;border:1px solid var(--line);border-radius:14px;color:var(--muted);font-size:.85rem}
.hint b{color:var(--ink);font-weight:600}
.hint ol{margin:8px 0 0 1.1em}
@media (display-mode:standalone),(display-mode:fullscreen){.hint{display:none}}
footer{max-width:520px;margin:20px auto 0;text-align:center;color:var(--muted);font-size:12px}
footer a{color:inherit}
</style>
</head>
<body>
<header>
  <div class="kicker">Minilytics</div>
  <h1>${title}</h1>
  <div class="domain">${esc(payload.site.domain)}</div>
</header>
<main class="wall" id="wall">${cards}</main>
<aside class="hint" id="hint">
  <b>Ajouter à l’écran d’accueil</b>
  <ol id="steps"></ol>
</aside>
<footer>Données agrégées, mises à jour toutes les 30 s. <a href="${esc(origin)}" rel="noopener">Minilytics</a></footer>
<script>
(function(){
  var ua=navigator.userAgent, steps=document.getElementById('steps');
  var ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var android=/Android/.test(ua);
  if(ios){steps.innerHTML='<li>Ouvrez cette page dans <b>Safari</b>.</li><li>Appuyez sur le bouton Partager, puis <b>Sur l’écran d’accueil</b>.</li>';}
  else if(android){steps.innerHTML='<li>Ouvrez le menu de Chrome (⋮).</li><li>Choisissez <b>Ajouter à l’écran d’accueil</b> ou <b>Installer l’application</b>.</li>';}
  else {steps.innerHTML='<li>Ouvrez cette adresse sur votre téléphone.</li><li>Sur iPhone : Safari → Partager → Sur l’écran d’accueil.</li><li>Sur Android : Chrome → menu → Ajouter à l’écran d’accueil.</li>';}
  function size(){
    document.querySelectorAll('.slot iframe').forEach(function(f){
      try{
        var b=f.contentDocument&&f.contentDocument.body;
        if(!b)return;
        var h=Math.ceil((b.firstElementChild||b).getBoundingClientRect().height+8);
        if(h>20)f.style.height=h+'px';
      }catch(e){}
    });
  }
  document.querySelectorAll('.slot iframe').forEach(function(f){f.addEventListener('load',size);});
  addEventListener('message',function(e){if(e.data&&e.data.minilytics==='widget')size();});
  setInterval(function(){if(document.visibilityState==='visible')size();},30000);
  if('serviceWorker' in navigator && location.protocol==='https:'){navigator.serviceWorker.register('/sw.js').catch(function(){});}
})();
</script>
</body></html>`;
}

function scriptableJs(origin: string, token: string, siteName: string): string {
  return `// Minilytics — widget d’écran d’accueil (Scriptable)
// Jeton en lecture seule : il ne donne accès qu’aux chiffres agrégés de cette sélection.
// Révoquez-le depuis Minilytics pour couper les données immédiatement.
const ENDPOINT = ${JSON.stringify(origin + '/api/w/' + token + '/data')};

const req = new Request(ENDPOINT);
const json = await req.loadJSON();
if (!json || !json.items) {
  const w = new ListWidget();
  w.addText("Widgets Minilytics indisponibles");
  Script.setWidget(w);
  Script.complete();
  return;
}

const theme = json.theme === "light" ? "light" : "dark";
const bg = theme === "light" ? new Color("#f4f4f5") : new Color("#0a0a0b");
const ink = theme === "light" ? new Color("#09090b") : new Color("#fafafa");
const muted = theme === "light" ? new Color("#52525b") : new Color("#a1a1aa");
const accentHex = (json.items[0] && json.items[0].accent) || "2563eb";
const accent = new Color("#" + String(accentHex).replace("#", ""));

const widget = new ListWidget();
widget.backgroundColor = bg;
widget.setPadding(14, 16, 14, 16);

const size = config.widgetFamily || "medium";
const max = size === "small" ? 1 : size === "large" ? json.items.length : Math.min(2, json.items.length);
const items = json.items.slice(0, max);

function fmt(n) {
  try { return new Intl.NumberFormat("fr-FR").format(n); } catch (e) { return String(n); }
}
function labelOf(it) {
  if (it.type === "live") return it.data.online <= 1 ? it.data.online + " en ligne" : it.data.online + " en ligne";
  if (it.type === "pages") return (it.data.pages[0] && it.data.pages[0].label) || "Pages";
  if (it.type === "map") return it.data.countries.length + " pays";
  return fmt(it.data.visitors) + " visiteurs";
}
function kickerOf(it) {
  if (it.type === "live") return "En direct";
  if (it.type === "counter") return "Visiteurs";
  if (it.type === "chart") return "Visiteurs";
  if (it.type === "pages") return "Pages populaires";
  return "Carte";
}

const head = widget.addText((json.site && json.site.domain) || ${JSON.stringify(siteName)});
head.font = Font.mediumSystemFont(11);
head.textColor = muted;
widget.addSpacer(6);

for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const k = widget.addText(kickerOf(it).toUpperCase());
  k.font = Font.mediumSystemFont(10);
  k.textColor = accent;
  const v = widget.addText(labelOf(it));
  v.font = Font.boldSystemFont(size === "small" ? 22 : 20);
  v.textColor = ink;
  v.lineLimit = 1;
  if (it.type === "counter" || it.type === "chart") {
    const p = widget.addText(fmt(it.data.pageviews) + " pages vues");
    p.font = Font.systemFont(11);
    p.textColor = muted;
  }
  if (i < items.length - 1) widget.addSpacer(10);
}

widget.addSpacer();
const foot = widget.addText("Minilytics");
foot.font = Font.mediumSystemFont(10);
foot.textColor = muted;

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
`;
}

function manifestFor(token: string, name: string, theme: 'light' | 'dark' | 'auto') {
  const dark = theme !== 'light';
  return {
    name: `${name} — Minilytics`,
    short_name: name.slice(0, 12) || 'Widgets',
    description: 'Widgets Minilytics sur l’écran d’accueil',
    start_url: `/w/${token}`,
    scope: `/w/${token}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: dark ? '#0a0a0b' : '#f4f4f5',
    theme_color: dark ? '#0a0a0b' : '#f4f4f5',
    lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

function toPngItems(payload: Awaited<ReturnType<typeof boardPayload>>): BoardPngItem[] {
  return payload.items.map((it) => ({ opts: asOpts(it), data: it.data }));
}

export function registerPhone(app: Hono<AppEnv>) {
  // ----- owner CRUD (auth + csrf already applied on /api/sites/:id/*)
  app.get('/api/sites/:id/phone-boards', async (c) => {
    const site = c.get('site');
    const rows = await c.env.DB.prepare('SELECT id, site_id, token, name, items, theme, created_at, updated_at FROM widget_boards WHERE site_id = ? ORDER BY created_at DESC')
      .bind(site.id).all<BoardRow>();
    const origin = new URL(c.req.url).origin;
    return c.json((rows.results ?? []).map((r) => publicBoard(r, origin)));
  });

  app.post('/api/sites/:id/phone-boards', async (c) => {
    const site = c.get('site');
    if (c.get('principal').role === 'viewer') return c.json({ error: 'Réservé aux administrateurs' }, 403);
    const body = await c.req.json().catch(() => ({})) as { name?: string; items?: unknown; theme?: string };
    const items = parseBoardItems(body.items);
    if ('error' in items) return c.json({ error: items.error }, 400);
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM widget_boards WHERE site_id = ?').bind(site.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_BOARDS) return c.json({ error: 'Vous avez atteint la limite de 20 écrans pour ce site.' }, 400);
    const now = Date.now();
    const row: BoardRow = {
      id: randomId(12),
      site_id: site.id,
      token: 'wp' + randomToken(18),
      name: cleanName(body.name) || site.name || site.domain,
      items: JSON.stringify(items),
      theme: parseTheme(body.theme),
      created_at: now,
      updated_at: now,
    };
    await c.env.DB.prepare('INSERT INTO widget_boards (id, site_id, token, name, items, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.site_id, row.token, row.name, row.items, row.theme, row.created_at, row.updated_at).run();
    return c.json(publicBoard(row, new URL(c.req.url).origin), 201);
  });

  app.patch('/api/sites/:id/phone-boards/:bid', async (c) => {
    const site = c.get('site');
    if (c.get('principal').role === 'viewer') return c.json({ error: 'Réservé aux administrateurs' }, 403);
    const existing = await c.env.DB.prepare('SELECT * FROM widget_boards WHERE id = ? AND site_id = ?').bind(c.req.param('bid'), site.id).first<BoardRow>();
    if (!existing) return c.json({ error: 'Tableau introuvable' }, 404);
    const body = await c.req.json().catch(() => ({})) as { name?: string; items?: unknown; theme?: string };
    let itemsJson = existing.items;
    if (body.items !== undefined) {
      const items = parseBoardItems(body.items);
      if ('error' in items) return c.json({ error: items.error }, 400);
      itemsJson = JSON.stringify(items);
    }
    const name = body.name !== undefined ? (cleanName(body.name) || existing.name) : existing.name;
    const theme = body.theme !== undefined ? parseTheme(body.theme) : existing.theme;
    const now = Date.now();
    await c.env.DB.prepare('UPDATE widget_boards SET name = ?, items = ?, theme = ?, updated_at = ? WHERE id = ? AND site_id = ?')
      .bind(name, itemsJson, theme, now, existing.id, site.id).run();
    return c.json(publicBoard({ ...existing, name, items: itemsJson, theme, updated_at: now }, new URL(c.req.url).origin));
  });

  app.delete('/api/sites/:id/phone-boards/:bid', async (c) => {
    if (c.get('principal').role === 'viewer') return c.json({ error: 'Réservé aux administrateurs' }, 403);
    const r = await c.env.DB.prepare('DELETE FROM widget_boards WHERE id = ? AND site_id = ?').bind(c.req.param('bid'), c.get('site').id).run();
    if (!r.meta?.changes) return c.json({ error: 'Tableau introuvable' }, 404);
    return c.json({ ok: true });
  });

  // ----- public board API
  const load = async (c: Context<AppEnv>) => loadBoard(c.env.DB, c.req.param('token') ?? '');

  app.get('/api/w/:token/data', async (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    const loaded = await load(c);
    if (!loaded) return gone();
    c.header('Cache-Control', PUBLIC_CACHE);
    c.header('X-Robots-Tag', 'noindex');
    return c.json(await boardPayload(c.env.DB, loaded));
  });

  app.get('/api/w/:token/embed', async (c) => {
    const loaded = await load(c);
    if (!loaded) return new Response('<!doctype html><meta charset="utf-8"><title>Widget</title>', { status: 404, headers: { 'Cache-Control': NO_STORE, 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'", 'X-Robots-Tag': 'noindex' } });
    const i = Math.max(0, Math.min(loaded.items.length - 1, Number(c.req.query('i') ?? 0) || 0));
    const it = loaded.items[i]!;
    const o = asOpts(it);
    const d = await widgetData(c.env.DB, loaded.site, it.period);
    const origin = new URL(c.req.url).origin;
    const { html, nonce } = renderWidget(o, d, origin, loaded.board.token, `/api/w/${loaded.board.token}/data?period=${encodeURIComponent(it.period)}`);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': PUBLIC_CACHE,
        'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
      },
    });
  });

  app.get('/api/w/:token/png', async (c) => {
    const loaded = await load(c);
    if (!loaded) return gone();
    const payload = await boardPayload(c.env.DB, loaded);
    const size = parsePngSize(c.req.query('size'));
    const idxRaw = c.req.query('i');
    const wantStack = c.req.query('size') === 'stack';
    const pngItems = toPngItems(payload);
    let png: Uint8Array<ArrayBuffer>;
    let filename: string;
    if (idxRaw != null && idxRaw !== '') {
      const i = Math.max(0, Math.min(pngItems.length - 1, Number(idxRaw) || 0));
      const it = pngItems[i]!;
      png = await renderWidgetPng(it.opts as WidgetOpts, it.data, wantStack ? 'medium' : size, payload.theme === 'light' ? 'light' : 'dark');
      filename = `minilytics-${loaded.site.domain}-${it.opts.type}-${size}.png`;
    } else if (wantStack || size === 'wallpaper' || pngItems.length > 1) {
      png = await renderBoardPng(pngItems, wantStack ? 'stack' : size, payload.theme, loaded.site.name, loaded.site.domain);
      filename = `minilytics-${loaded.site.domain}-${wantStack ? 'stack' : size}.png`;
    } else {
      const it = pngItems[0]!;
      png = await renderWidgetPng(it.opts as WidgetOpts, it.data, size, payload.theme === 'light' ? 'light' : 'dark');
      filename = `minilytics-${loaded.site.domain}-${size}.png`;
    }
    return pngResponse(png, filename);
  });

  app.get('/api/w/:token/zip', async (c) => {
    const loaded = await load(c);
    if (!loaded) return gone();
    const payload = await boardPayload(c.env.DB, loaded);
    const pngItems = toPngItems(payload);
    const theme = payload.theme === 'light' ? 'light' : 'dark';
    const files: Record<string, Uint8Array> = {};
    const jobs: Promise<void>[] = [];
    const add = (name: string, p: Promise<Uint8Array<ArrayBuffer>>) => { jobs.push(p.then((b) => { files[name] = b; })); };
    add(`wallpaper.png`, renderBoardPng(pngItems, 'wallpaper', payload.theme, loaded.site.name, loaded.site.domain));
    if (pngItems.length > 1) add(`stack.png`, renderBoardPng(pngItems, 'stack', payload.theme, loaded.site.name, loaded.site.domain));
    for (let i = 0; i < pngItems.length; i++) {
      const it = pngItems[i]!;
      const base = `${String(i + 1).padStart(2, '0')}-${it.opts.type}`;
      add(`${base}-small.png`, renderWidgetPng(it.opts as WidgetOpts, it.data, 'small', theme));
      add(`${base}-medium.png`, renderWidgetPng(it.opts as WidgetOpts, it.data, 'medium', theme));
      add(`${base}-large.png`, renderWidgetPng(it.opts as WidgetOpts, it.data, 'large', theme));
    }
    await Promise.all(jobs);
    const zipped = zipSync(files, { level: 6 });
    const body = new Uint8Array(new ArrayBuffer(zipped.byteLength));
    body.set(zipped);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="minilytics-widgets.zip"`,
        'Cache-Control': PUBLIC_CACHE,
        'X-Robots-Tag': 'noindex',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  app.get('/api/w/:token/scriptable.js', async (c) => {
    const loaded = await load(c);
    if (!loaded) return gone();
    const origin = new URL(c.req.url).origin;
    const js = scriptableJs(origin, loaded.board.token, loaded.site.name);
    return new Response(js, {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Content-Disposition': `attachment; filename="minilytics-${loaded.site.domain}.scriptable.js"`,
        'Cache-Control': PUBLIC_CACHE,
        'X-Robots-Tag': 'noindex',
        'Access-Control-Allow-Origin': '*',
      },
    });
  });

  app.get('/api/w/:token/manifest.webmanifest', async (c) => {
    const loaded = await load(c);
    if (!loaded) return gone();
    const name = loaded.board.name || loaded.site.name || loaded.site.domain;
    return new Response(JSON.stringify(manifestFor(loaded.board.token, name, parseTheme(loaded.board.theme))), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': PUBLIC_CACHE,
        'X-Robots-Tag': 'noindex',
      },
    });
  });

  app.get('/w/:token', async (c) => {
    const loaded = await loadBoard(c.env.DB, c.req.param('token'));
    if (!loaded) return goneHtml();
    const origin = new URL(c.req.url).origin;
    const payload = await boardPayload(c.env.DB, loaded);
    const html = boardHtml(origin, loaded.board.token, payload);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': NO_STORE,
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  });
}

/** Single-widget PNG via the existing site embed token. */
export function registerWidgetPng(app: Hono<AppEnv>) {
  app.get('/api/widget/:t/png', async (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    const site = await widgetSite(c.env.DB, c.req.param('t'));
    if (!site) {
      return new Response(JSON.stringify({ error: 'widget not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': NO_STORE, 'Access-Control-Allow-Origin': '*' },
      });
    }
    const o = widgetOpts(c.req.query());
    const d = await widgetData(c.env.DB, site, o.period);
    const size = parsePngSize(c.req.query('size'));
    const png = await renderWidgetPng(o, d, size, o.theme === 'light' ? 'light' : 'dark');
    return pngResponse(png, `minilytics-${site.domain}-${o.type}-${size}.png`);
  });
}

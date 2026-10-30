/**
 * Public embeddable widgets, tied to a revocable per-site widget token (see share.ts).
 * - GET /api/widget/:t/data       JSON aggregates (CORS *), cached 30 s at the edge
 * - GET /api/widget/:t/badge.svg  SVG badge for READMEs (live | visitors | pageviews)
 * - GET /api/widget/:t/embed      self-contained HTML for an <iframe> (live | counter | chart | pages | map)
 * Only aggregates ever leave: counts, a visitors series, top 5 paths, visitors per country.
 * These are the only routes that may be framed by other sites (frame-ancestors *), see index.ts.
 */
import type { Context, Hono } from 'hono';
import type { AppEnv } from './env.js';
import { widgetData, widgetSite, type WidgetData } from './share.js';
import { DOT_ALPHA, DOT_CODES, DOT_H, DOT_LAT0, DOT_ROWS, DOT_STEP, DOT_W } from './dotmap.gen.js';
import { COUNTRY_ROWS } from '../dashboard/map/countries.gen.js';

export const WIDGET_TYPES = ['live', 'counter', 'chart', 'pages', 'map'] as const;
type WType = (typeof WIDGET_TYPES)[number];
type Locale = 'fr' | 'en';
export interface WidgetOpts { type: WType; theme: 'light' | 'dark' | 'auto'; accent: string; size: 'sm' | 'md' | 'lg'; period: string; transparent: boolean; locale: Locale; logo: boolean; wid: string }

export function widgetOpts(q: Record<string, string | undefined>): WidgetOpts {
  const pick = <T extends string>(v: string | undefined, all: readonly T[], d: T): T => ((all as readonly string[]).includes(v ?? '') ? (v as T) : d);
  const accent = /^[0-9a-fA-F]{6}$/.test(q.accent ?? '') ? '#' + q.accent!.toLowerCase() : '#2563eb';
  return {
    type: pick(q.type, WIDGET_TYPES, 'live'),
    theme: pick(q.theme, ['light', 'dark', 'auto'] as const, 'auto'),
    accent,
    size: pick(q.size, ['sm', 'md', 'lg'] as const, 'md'),
    period: q.period ?? '30d',
    transparent: q.transparent === '1' || q.transparent === 'true',
    locale: pick(q.locale, ['fr', 'en'] as const, 'fr'),
    logo: !(q.logo === '0' || q.logo === 'false'),
    wid: /^[\w-]{1,40}$/.test(q.wid ?? '') ? q.wid! : '',
  };
}

const T = {
  fr: {
    online: (n: number) => (n <= 1 ? `${n} personne en ligne` : `${n} personnes en ligne`), onlineShort: 'en ligne',
    visitors: 'Visiteurs', pageviews: 'Pages vues', topPages: 'Pages populaires', countries: (n: number) => `${n} pays`,
    periods: { today: 'Aujourd’hui', '24h': '24 dernières heures', '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', '12m': '12 derniers mois', all: 'Depuis le début' } as Record<string, string>,
    empty: 'Pas encore de visites', by: 'Statistiques par Minilytics', vs: 'vs période précédente', badgeLive: 'en ligne', badgeVisitors: 'visiteurs', badgePageviews: 'pages vues',
  },
  en: {
    online: (n: number) => (n === 1 ? '1 person online' : `${n} people online`), onlineShort: 'online',
    visitors: 'Visitors', pageviews: 'Pageviews', topPages: 'Top pages', countries: (n: number) => (n === 1 ? '1 country' : `${n} countries`),
    periods: { today: 'Today', '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', all: 'All time' } as Record<string, string>,
    empty: 'No visits yet', by: 'Analytics by Minilytics', vs: 'vs previous period', badgeLive: 'online', badgeVisitors: 'visitors', badgePageviews: 'pageviews',
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const fmt = (n: number, l: Locale) => new Intl.NumberFormat(l === 'fr' ? 'fr-FR' : 'en-US', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

// ---------- dot map
let dotCache: { x: number; y: number; cc: string }[] | null = null;
function dots() {
  if (dotCache) return dotCache;
  const out: { x: number; y: number; cc: string }[] = [];
  DOT_ROWS.forEach((row, y) => {
    let x = 0;
    for (let i = 0; i < row.length; i++, x++) {
      const ch = row[i];
      if (ch === '.') continue;
      let idx: number;
      if (ch === '~') { idx = DOT_ALPHA.length + DOT_ALPHA.indexOf(row[++i]); } else idx = DOT_ALPHA.indexOf(ch);
      out.push({ x, y, cc: DOT_CODES[idx] });
    }
  });
  return (dotCache = out);
}
const CENTROIDS = new Map(COUNTRY_ROWS.map((r) => [r[0], [r[4], r[5]] as [number, number]]));

export function dotMapSvg(countries: { country: string; visitors: number }[], accent: string) {
  const seen = new Map(countries.map((c) => [c.country, c.visitors]));
  const max = Math.max(1, ...countries.map((c) => c.visitors));
  const has = new Set<string>();
  const cell = 6, r = 2.1;
  let body = '';
  for (const d of dots()) {
    const v = seen.get(d.cc);
    if (v) has.add(d.cc);
    const op = v ? (0.45 + 0.55 * Math.sqrt(v / max)).toFixed(2) : '';
    body += v
      ? `<circle cx="${d.x * cell + 3}" cy="${d.y * cell + 3}" r="${r}" fill="${accent}" fill-opacity="${op}"/>`
      : `<circle cx="${d.x * cell + 3}" cy="${d.y * cell + 3}" r="${r}" class="d"/>`;
  }
  // Small countries without a grid dot still show at their centroid.
  for (const c of countries) {
    if (has.has(c.country)) continue;
    const ll = CENTROIDS.get(c.country);
    if (!ll) continue;
    const x = Math.floor((ll[1] + 180) / DOT_STEP), y = Math.round((DOT_LAT0 - ll[0]) / DOT_STEP);
    if (y < 0 || y >= DOT_H) continue;
    body += `<circle cx="${x * cell + 3}" cy="${y * cell + 3}" r="${r + 0.6}" fill="${accent}"/>`;
  }
  return `<svg class="map" viewBox="0 0 ${DOT_W * cell} ${DOT_H * cell}" role="img" aria-hidden="true">${body}</svg>`;
}

// ---------- area chart
export function areaSvg(series: { visitors: number }[], accent: string, h = 64) {
  const W = 300;
  const n = series.length;
  if (n < 2) return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
  const max = Math.max(1, ...series.map((s) => s.visitors));
  const pts = series.map((s, i) => [(i / (n - 1)) * W, h - 3 - (s.visitors / max) * (h - 8)] as const);
  // Smooth with a monotone-ish cardinal curve.
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const area = `${d} L${W},${h} L0,${h} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#g)"/><path d="${d}" fill="none" stroke="${accent}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

const LOGO = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="currentColor"/><path d="M6 15.5l3.5-4 3 2.5L18 8" fill="none" stroke="var(--bg-solid)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function renderWidget(o: WidgetOpts, d: WidgetData, origin: string, token: string): { html: string; nonce: string } {
  const t = T[o.locale];
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const scale = o.size === 'sm' ? 0.86 : o.size === 'lg' ? 1.18 : 1;
  const per = t.periods[d.period] ?? t.periods['30d'];
  const brand = o.logo ? `<a class="brand" href="${origin}/?ref=widget" target="_blank" rel="noopener">${LOGO}<span>Minilytics</span></a>` : '';
  const delta = d.previousVisitors ? Math.round(((d.visitors - d.previousVisitors) / d.previousVisitors) * 100) : null;
  const deltaHtml = delta == null ? '' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}" title="${esc(t.vs)}">${delta >= 0 ? '+' : ''}${delta} %</span>`;
  let inner = '';
  if (o.type === 'live') {
    inner = `<div class="pill"><span class="pulse" aria-hidden="true"></span><span data-v="online-label">${esc(t.online(d.online))}</span>${o.logo ? `<span class="sep" aria-hidden="true"></span>${brand}` : ''}</div>`;
  } else {
    let main = '';
    if (o.type === 'counter') {
      main = `<div class="kicker">${esc(t.visitors)} · ${esc(per)}</div><div class="big"><span data-v="visitors">${fmt(d.visitors, o.locale)}</span>${deltaHtml}</div><div class="muted">${fmt(d.pageviews, o.locale)} ${esc(t.pageviews.toLowerCase())}</div>`;
    } else if (o.type === 'chart') {
      main = `<div class="row"><div><div class="kicker">${esc(t.visitors)} · ${esc(per)}</div><div class="big"><span data-v="visitors">${fmt(d.visitors, o.locale)}</span>${deltaHtml}</div></div></div>${areaSvg(d.series, o.accent, 64)}`;
    } else if (o.type === 'pages') {
      const max = Math.max(1, ...d.pages.map((p) => p.visitors));
      main = `<div class="kicker">${esc(t.topPages)} · ${esc(per)}</div>` + (d.pages.length
        ? `<ul class="list">${d.pages.map((p) => `<li><span class="bar" style="width:${((p.visitors / max) * 100).toFixed(1)}%"></span><span class="lbl">${esc(p.label)}</span><span class="num">${fmt(p.visitors, o.locale)}</span></li>`).join('')}</ul>`
        : `<p class="muted">${esc(t.empty)}</p>`);
    } else {
      main = `<div class="row"><div class="kicker">${esc(t.countries(d.countries.length))} · ${esc(per)}</div><div class="muted"><span class="pulse sm" aria-hidden="true"></span> <span data-v="online">${fmt(d.online, o.locale)}</span> ${esc(t.onlineShort)}</div></div>${dotMapSvg(d.countries, o.accent)}`;
    }
    inner = `<div class="card">${main}${o.logo ? `<div class="foot">${brand}<span class="site">${esc(d.site.domain)}</span></div>` : ''}</div>`;
  }
  const light = `--bg:#ffffff;--bg-solid:#ffffff;--ink:#09090b;--ink2:#52525b;--ink3:#71717a;--line:#e4e4e7;--well:#f4f4f5;--dot:#e4e4e7;`;
  const dark = `--bg:#0a0a0b;--bg-solid:#0a0a0b;--ink:#fafafa;--ink2:#d4d4d8;--ink3:#a1a1aa;--line:#27272a;--well:#18181b;--dot:#27272a;`;
  const vars = o.theme === 'dark' ? `:root{${dark}}` : o.theme === 'light' ? `:root{${light}}` : `:root{${light}}@media (prefers-color-scheme: dark){:root{${dark}}}`;
  const css = `${vars}
:root{--accent:${o.accent};--s:${scale}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;color:var(--ink);font:calc(14px*var(--s))/1.4 Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
body{padding:${o.type === 'live' ? '2px' : '1px'}}
a{color:inherit;text-decoration:none}
.card{background:${o.transparent ? 'transparent' : 'var(--bg)'};border:${o.transparent ? '0' : '1px solid var(--line)'};border-radius:calc(12px*var(--s));padding:calc(16px*var(--s));${o.transparent ? '' : 'box-shadow:0 1px 2px rgba(0,0,0,.04);'}}
.pill{display:inline-flex;align-items:center;gap:calc(8px*var(--s));white-space:nowrap;background:${o.transparent ? 'transparent' : 'var(--bg)'};border:${o.transparent ? '0' : '1px solid var(--line)'};border-radius:999px;padding:calc(6px*var(--s)) calc(12px*var(--s));font-weight:500}
.pill .brand{color:var(--ink3);font-weight:500}
.sep{width:1px;height:1em;background:var(--line)}
.pulse{position:relative;width:calc(8px*var(--s));height:calc(8px*var(--s));border-radius:50%;background:var(--accent);flex:none;display:inline-block}
.pulse::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--accent);animation:p 1.8s ease-out infinite}
.pulse.sm{width:6px;height:6px;vertical-align:middle}
@keyframes p{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.8);opacity:0}}
@media (prefers-reduced-motion:reduce){.pulse::after{animation:none}}
.kicker{font-size:calc(12px*var(--s));color:var(--ink3)}
.big{display:flex;align-items:baseline;gap:8px;font-size:calc(30px*var(--s));font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;margin-top:2px}
.delta{font-size:calc(12px*var(--s));font-weight:500;letter-spacing:0;padding:1px 6px;border-radius:999px;background:var(--well)}
.delta.up{color:#16a34a}.delta.down{color:#dc2626}
.muted{color:var(--ink3);font-size:calc(12px*var(--s))}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.chart{display:block;width:100%;height:calc(64px*var(--s));margin-top:10px}
.map{display:block;width:100%;height:auto;margin-top:10px}.map .d{fill:var(--dot)}
.list{list-style:none;margin-top:8px;display:grid;gap:3px}
.list li{position:relative;display:flex;justify-content:space-between;gap:12px;padding:calc(5px*var(--s)) 8px;border-radius:6px;overflow:hidden;font-size:calc(13px*var(--s))}
.bar{position:absolute;inset:0 auto 0 0;background:var(--accent);opacity:.12;border-radius:6px}
.lbl{position:relative;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
.num{position:relative;font-weight:500;font-variant-numeric:tabular-nums}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:calc(11px*var(--s));color:var(--ink3)}
.brand{display:inline-flex;align-items:center;gap:6px;color:var(--ink2)}
.foot .brand svg{color:var(--ink)}
.site{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}`;
  const live = o.type === 'live' || o.type === 'map' || o.type === 'counter' || o.type === 'chart';
  const js = `(function(){var W=${JSON.stringify(o.wid)},L=${JSON.stringify(o.locale)};
function size(){if(!W||parent===window)return;var b=document.body.firstElementChild;var r=b.getBoundingClientRect();parent.postMessage({minilytics:'widget',id:W,h:Math.ceil(r.height+4),w:Math.ceil(r.width+4)},'*')}
size();addEventListener('load',size);if(window.ResizeObserver)new ResizeObserver(size).observe(document.body);
${live ? `var nf=new Intl.NumberFormat(L==='fr'?'fr-FR':'en-US');
function on(n){return L==='fr'?(n<=1?n+' personne en ligne':n+' personnes en ligne'):(n===1?'1 person online':n+' people online')}
setInterval(function(){if(document.visibilityState!=='visible')return;fetch(${JSON.stringify(`/api/widget/${token}/data?period=${encodeURIComponent(d.period)}`)}).then(function(r){return r.ok?r.json():null}).then(function(x){if(!x)return;
document.querySelectorAll('[data-v]').forEach(function(e){var k=e.getAttribute('data-v');if(k==='online-label')e.textContent=on(x.online);else if(k==='online')e.textContent=nf.format(x.online);else if(k==='visitors')e.textContent=nf.format(x.visitors)});size()}).catch(function(){})},30000);` : ''}})();`;
  const title = o.type === 'live' ? t.online(d.online) : `${d.site.name} · ${per}`;
  const html = `<!doctype html><html lang="${o.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style nonce="${nonce}">${css}</style></head><body>${inner}<script nonce="${nonce}">${js}</script></body></html>`;
  return { html, nonce };
}

// ---------- SVG badge (shields-like, two segments)
export function badgeSvg(kind: 'live' | 'visitors' | 'pageviews', d: WidgetData, o: WidgetOpts) {
  const t = T[o.locale];
  const value = kind === 'live' ? fmt(d.online, o.locale) : fmt(kind === 'visitors' ? d.visitors : d.pageviews, o.locale);
  const label = kind === 'live' ? t.badgeLive : kind === 'visitors' ? t.badgeVisitors : t.badgePageviews;
  const left = esc(value), right = esc(label);
  const cw = (s: string) => Math.round(s.length * 6.6 + 14);
  const dot = kind === 'live' ? 14 : 0;
  const lw = cw(left) + dot, rw = cw(right);
  const dark = o.theme === 'dark';
  const bgR = dark ? '#27272a' : '#f4f4f5', inkR = dark ? '#d4d4d8' : '#3f3f46';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left} ${right}"><title>${left} ${right} · ${esc(d.site.domain)}</title><clipPath id="r"><rect width="${lw + rw}" height="20" rx="4"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="${o.accent}"/><rect x="${lw}" width="${rw}" height="20" fill="${bgR}"/></g>${dot ? `<circle cx="10" cy="10" r="3" fill="#fff"/>` : ''}<g font-family="Geist,Verdana,DejaVu Sans,sans-serif" font-size="11" font-weight="600"><text x="${dot + cw(left) / 2}" y="14" fill="#fff" text-anchor="middle">${left}</text><text x="${lw + rw / 2}" y="14" fill="${inkR}" text-anchor="middle" font-weight="500">${right}</text></g></svg>`;
}

const notFound = (c: Context) => { c.header('Cache-Control', 'public, max-age=60'); return c.json({ error: 'widget not found' }, 404); };

export function registerWidgets(app: Hono<AppEnv>) {
  app.get('/api/widget/:t/data', async (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    const site = await widgetSite(c.env.DB, c.req.param('t'));
    if (!site) return notFound(c);
    c.header('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=30');
    return c.json(await widgetData(c.env.DB, site, c.req.query('period') ?? '30d'));
  });
  app.get('/api/widget/:t/badge.svg', async (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    const site = await widgetSite(c.env.DB, c.req.param('t'));
    if (!site) return notFound(c);
    const o = widgetOpts(c.req.query());
    const kind = c.req.query('type') === 'visitors' ? 'visitors' : c.req.query('type') === 'pageviews' ? 'pageviews' : 'live';
    const d = await widgetData(c.env.DB, site, o.period);
    return c.body(badgeSvg(kind, d, o), 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=60',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
  });
  app.get('/api/widget/:t/embed', async (c) => {
    const site = await widgetSite(c.env.DB, c.req.param('t'));
    if (!site) return c.html('<!doctype html><meta charset="utf-8"><title>Widget</title>', 404, { 'Cache-Control': 'public, max-age=60', 'Content-Security-Policy': "default-src 'none'; frame-ancestors *" });
    const o = widgetOpts(c.req.query());
    const d = await widgetData(c.env.DB, site, o.period);
    const { html, nonce } = renderWidget(o, d, new URL(c.req.url).origin, c.req.param('t'));
    return c.html(html, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=30',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Robots-Tag': 'noindex',
    });
  });
}

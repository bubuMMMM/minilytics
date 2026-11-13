/**
 * Server-rendered widget PNGs (satori + resvg), reused for a single embed token
 * or a phone board. Sizes match common iOS widget / lock-screen slots.
 */
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { loadFonts } from './og-image.js';
import { WIDGET_TYPES, WIDGET_STYLES, type WidgetStyle, type WidgetOpts } from './widgets.js';
import type { WidgetData } from './share.js';

export const PNG_SIZES = {
  small: { w: 474, h: 474 },
  medium: { w: 1014, h: 474 },
  large: { w: 1014, h: 1062 },
  wallpaper: { w: 1170, h: 2532 },
} as const;
export type PngSize = keyof typeof PNG_SIZES;

export function parsePngSize(v: string | undefined): PngSize {
  return v && v in PNG_SIZES ? (v as PngSize) : 'medium';
}

const PERIODS_FR: Record<string, string> = {
  today: 'Aujourd’hui', '24h': '24 h', '7d': '7 jours', '30d': '30 jours',
  '90d': '90 jours', '12m': '12 mois', all: 'Depuis le début',
};
const PERIODS_EN: Record<string, string> = {
  today: 'Today', '24h': '24 h', '7d': '7 days', '30d': '30 days',
  '90d': '90 days', '12m': '12 months', all: 'All time',
};

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
const fmt = (n: number, locale: 'fr' | 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);

type ThemeName = 'light' | 'dark';
interface Palette {
  bg: string; ink: string; muted: string; line: string; well: string; card: string;
}

const PAL: Record<ThemeName, Palette> = {
  light: { bg: '#f4f4f5', ink: '#09090b', muted: '#71717a', line: '#e4e4e7', well: '#ffffff', card: '#ffffff' },
  dark: { bg: '#09090b', ink: '#fafafa', muted: '#a1a1aa', line: '#27272a', well: '#18181b', card: '#0a0a0b' },
};

function resolveTheme(theme: WidgetOpts['theme'], fallback: ThemeName = 'dark'): ThemeName {
  return theme === 'light' || theme === 'dark' ? theme : fallback;
}

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };

function el(style: Record<string, unknown>, children?: unknown, type = 'div'): Node {
  return { type, props: { style, children } };
}

function text(style: Record<string, unknown>, value: string): Node {
  return el(style, value);
}

interface CardOpts {
  type: (typeof WIDGET_TYPES)[number];
  style: WidgetStyle;
  accent: string;
  locale: 'fr' | 'en';
  logo: boolean;
  period: string;
  theme: ThemeName;
}

function cardChrome(style: WidgetStyle, pal: Palette, accent: string, pad: number) {
  const radius = style === 'editorial' || style === 'minimal' ? 0 : style === 'glass' ? 28 : style === 'compact' ? 16 : 24;
  const dark = pal.card === '#0a0a0b';
  const border = style === 'minimal' ? '0'
    : style === 'editorial' ? `0 0 3px 0 solid ${accent}`
    : style === 'glass' ? (dark ? '1.5px solid rgba(255,255,255,0.32)' : '1.5px solid rgba(9,9,11,0.22)')
    : `1px solid ${pal.line}`;
  const background = style === 'gradient'
    ? `linear-gradient(135deg, ${accent}, #09090b)`
    : style === 'glass'
      ? (dark ? 'rgba(18,18,22,0.86)' : 'rgba(255,255,255,0.9)')
      : style === 'minimal' || style === 'editorial'
        ? 'transparent'
        : pal.card;
  const color = style === 'gradient' ? '#ffffff' : pal.ink;
  const muted = style === 'gradient' ? 'rgba(255,255,255,0.78)' : pal.muted;
  const shadow = style === 'glass'
    ? (dark ? '0 16px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.22)' : '0 16px 40px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.8)')
    : undefined;
  return { radius, border, background, color, muted, pad, shadow };
}

function periodLabel(period: string, locale: 'fr' | 'en') {
  return (locale === 'fr' ? PERIODS_FR : PERIODS_EN)[period] ?? period;
}

function onlineLabel(n: number, locale: 'fr' | 'en') {
  if (locale === 'fr') return n <= 1 ? `${n} personne en ligne` : `${n} personnes en ligne`;
  return n === 1 ? '1 person online' : `${n} people online`;
}

function deltaOf(d: WidgetData) {
  if (!d.previousVisitors) return null;
  return Math.round(((d.visitors - d.previousVisitors) / d.previousVisitors) * 100);
}

function bars(series: { visitors: number }[], accent: string, height: number, width: number): Node {
  const n = Math.max(1, series.length);
  const max = Math.max(1, ...series.map((s) => s.visitors));
  const gap = 3;
  const barW = Math.max(2, Math.floor((width - gap * (n - 1)) / n));
  return el(
    { display: 'flex', alignItems: 'flex-end', gap, height, width, overflow: 'hidden' },
    series.map((s) =>
      el({
        display: 'flex',
        width: barW,
        height: Math.max(3, Math.round((s.visitors / max) * (height - 2))),
        backgroundColor: accent,
        opacity: 0.35 + 0.65 * (s.visitors / max),
        borderRadius: 3,
      }, undefined, 'div'),
    ),
  );
}

function pageList(pages: WidgetData['pages'], pal: Palette, accent: string, locale: 'fr' | 'en', ink: string, width: number): Node {
  const max = Math.max(1, ...pages.map((p) => p.visitors));
  const rows = pages.slice(0, 5);
  if (!rows.length) return text({ fontSize: 22, color: pal.muted, display: 'flex' }, locale === 'fr' ? 'Pas encore de visites' : 'No visits yet');
  return el(
    { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
    rows.map((p) =>
      el(
        { display: 'flex', position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', padding: '8px 10px', backgroundColor: pal.well === pal.card ? pal.bg : pal.well },
        [
          el({ display: 'flex', position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.round((p.visitors / max) * 100) + '%', backgroundColor: accent, opacity: 0.14 }),
          el(
            { display: 'flex', justifyContent: 'space-between', width: '100%', position: 'relative' },
            [
              text({ fontSize: 22, color: ink, overflow: 'hidden', maxWidth: width - 140, whiteSpace: 'nowrap' }, clean(p.label, 36)),
              text({ fontSize: 22, color: ink, fontWeight: 600 }, fmt(p.visitors, locale)),
            ],
          ),
        ],
      ),
    ),
  );
}

function countryList(countries: WidgetData['countries'], pal: Palette, accent: string, locale: 'fr' | 'en', ink: string): Node {
  const rows = countries.slice(0, 6);
  const max = Math.max(1, ...rows.map((c) => c.visitors));
  if (!rows.length) return text({ fontSize: 22, color: pal.muted, display: 'flex' }, locale === 'fr' ? 'Pas encore de visites' : 'No visits yet');
  return el(
    { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
    rows.map((c) =>
      el(
        { display: 'flex', alignItems: 'center', gap: 12, width: '100%' },
        [
          text({ fontSize: 22, fontWeight: 600, color: ink, width: 48 }, c.country),
          el(
            { display: 'flex', flex: 1, height: 14, borderRadius: 99, backgroundColor: pal.line, overflow: 'hidden' },
            el({ display: 'flex', width: Math.max(8, Math.round((c.visitors / max) * 100)) + '%', height: 14, backgroundColor: accent, borderRadius: 99 }),
          ),
          text({ fontSize: 20, color: pal.muted, width: 70, justifyContent: 'flex-end' }, fmt(c.visitors, locale)),
        ],
      ),
    ),
  );
}

function widgetTree(o: CardOpts, d: WidgetData, w: number, h: number): Node {
  const pal = PAL[o.theme];
  const pad = o.style === 'compact' ? Math.round(Math.min(w, h) * 0.06) : Math.round(Math.min(w, h) * 0.08);
  const chrome = cardChrome(o.style, pal, o.accent, pad);
  const ink = chrome.color;
  const muted = chrome.muted;
  const per = periodLabel(d.period, o.locale);
  const delta = deltaOf(d);
  const kickerSize = h < 500 ? 20 : 24;
  const bigSize = h < 500 ? (w < 600 ? 56 : 72) : (w < 600 ? 72 : 92);
  const kicker = (label: string) => text({ fontSize: kickerSize, color: muted, display: 'flex' }, label);
  const big = (value: string, extra?: Node) =>
    el({ display: 'flex', alignItems: 'baseline', gap: 12 }, [
      text({ fontSize: bigSize, fontWeight: 600, color: ink, letterSpacing: '-0.04em', display: 'flex' }, value),
      extra ?? null,
    ].filter(Boolean));
  const deltaNode = delta == null
    ? undefined
    : text(
      { fontSize: 22, fontWeight: 500, color: delta >= 0 ? (o.style === 'gradient' ? '#bbf7d0' : '#16a34a') : (o.style === 'gradient' ? '#fecaca' : '#dc2626'), display: 'flex' },
      `${delta >= 0 ? '+' : ''}${delta} %`,
    );

  let body: unknown;
  if (o.type === 'live') {
    body = el({ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: w < 600 ? 'flex-start' : 'center', flex: 1, gap: 16 }, [
      el({ display: 'flex', alignItems: 'center', gap: 14 }, [
        el({ display: 'flex', width: 18, height: 18, borderRadius: 99, backgroundColor: o.style === 'gradient' ? '#fff' : o.accent }),
        text({ fontSize: w < 600 ? 32 : 40, fontWeight: 600, color: ink, display: 'flex' }, onlineLabel(d.online, o.locale)),
      ]),
      text({ fontSize: 22, color: muted, display: 'flex' }, clean(d.site.domain, 40)),
    ]);
  } else if (o.type === 'counter') {
    body = el({ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: 6 }, [
      kicker(`${o.locale === 'fr' ? 'Visiteurs' : 'Visitors'} · ${per}`),
      big(fmt(d.visitors, o.locale), deltaNode),
      text({ fontSize: 24, color: muted, display: 'flex' }, `${fmt(d.pageviews, o.locale)} ${o.locale === 'fr' ? 'pages vues' : 'pageviews'}`),
    ]);
  } else if (o.type === 'chart') {
    const chartH = Math.max(64, Math.round(h * (h > 800 ? 0.42 : 0.36)));
    body = el({ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }, [
      el({ display: 'flex', flexDirection: 'column', gap: 4 }, [
        kicker(`${o.locale === 'fr' ? 'Visiteurs' : 'Visitors'} · ${per}`),
        big(fmt(d.visitors, o.locale), deltaNode),
      ]),
      bars(d.series, o.style === 'gradient' ? '#ffffff' : o.accent, chartH, w - pad * 2),
    ]);
  } else if (o.type === 'pages') {
    body = el({ display: 'flex', flexDirection: 'column', flex: 1, gap: 12 }, [
      kicker(`${o.locale === 'fr' ? 'Pages populaires' : 'Top pages'} · ${per}`),
      pageList(d.pages, pal, o.style === 'gradient' ? '#ffffff' : o.accent, o.locale, ink, w - pad * 2),
    ]);
  } else {
    const n = d.countries.length;
    const clabel = o.locale === 'fr' ? `${n} pays` : (n === 1 ? '1 country' : `${n} countries`);
    body = el({ display: 'flex', flexDirection: 'column', flex: 1, gap: 12 }, [
      el({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, [
        kicker(`${clabel} · ${per}`),
        text({ fontSize: 20, color: muted, display: 'flex' }, `${fmt(d.online, o.locale)} ${o.locale === 'fr' ? 'en ligne' : 'online'}`),
      ]),
      countryList(d.countries, pal, o.style === 'gradient' ? '#ffffff' : o.accent, o.locale, ink),
    ]);
  }

  const foot = o.logo
    ? el(
      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 12, borderTop: o.style === 'minimal' ? '0' : `1px solid ${o.style === 'gradient' ? 'rgba(255,255,255,0.2)' : pal.line}` },
      [
        text({ fontSize: 18, color: muted, display: 'flex', flexShrink: 0 }, 'Minilytics'),
        text({ fontSize: 18, color: muted, display: 'flex', flexShrink: 1, minWidth: 0, overflow: 'hidden' }, clean(d.site.domain, w < 520 ? 18 : 36)),
      ],
    )
    : null;

  return el(
    {
      display: 'flex',
      flexDirection: 'column',
      width: w,
      height: h,
      padding: pad,
      backgroundColor: chrome.background.startsWith('linear') ? undefined : chrome.background,
      backgroundImage: chrome.background.startsWith('linear') ? chrome.background : undefined,
      borderRadius: chrome.radius,
      border: chrome.border,
      boxShadow: chrome.shadow,
      color: ink,
      fontFamily: 'Inter',
    },
    [body, foot].filter(Boolean),
  );
}

function wrapCanvas(w: number, h: number, pal: Palette, children: unknown, pad = 0): Node {
  return el(
    {
      display: 'flex',
      width: w,
      height: h,
      backgroundColor: pal.bg,
      color: pal.ink,
      fontFamily: 'Inter',
      padding: pad,
      position: 'relative',
    },
    children,
  );
}

async function raster(tree: Node, w: number, h: number, background: string): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(tree as never, { width: w, height: h, fonts: loadFonts() });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: w }, background });
  const raw = resvg.render().asPng();
  const png = new Uint8Array(new ArrayBuffer(raw.byteLength));
  png.set(raw);
  return png;
}

function optsToCard(o: Pick<WidgetOpts, 'type' | 'style' | 'accent' | 'locale' | 'logo' | 'period' | 'theme'>, theme: ThemeName): CardOpts {
  return {
    type: o.type,
    style: (WIDGET_STYLES as readonly string[]).includes(o.style) ? o.style : 'classic',
    accent: o.accent,
    locale: o.locale,
    logo: o.logo,
    period: o.period,
    theme,
  };
}

/** One widget in a phone-friendly slot (small / medium / large), or centered on a wallpaper. */
export async function renderWidgetPng(o: WidgetOpts, d: WidgetData, size: PngSize, preferredTheme: ThemeName = 'dark'): Promise<Uint8Array<ArrayBuffer>> {
  const theme = resolveTheme(o.theme, preferredTheme);
  const pal = PAL[theme];
  const { w, h } = PNG_SIZES[size];
  const card = optsToCard(o, theme);
  if (size === 'wallpaper') {
    const cw = 1014, ch = 520;
    const tree = wrapCanvas(w, h, pal, el(
      { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', width: w, height: h, padding: '160px 78px 120px' },
      [
        el({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }, [
          text({ fontSize: 28, color: pal.muted, letterSpacing: '0.16em', textTransform: 'uppercase', display: 'flex' }, 'MINILYTICS'),
          text({ fontSize: 44, fontWeight: 600, color: pal.ink, display: 'flex' }, clean(d.site.name || d.site.domain, 40)),
        ]),
        widgetTree(card, d, cw, ch),
        text({ fontSize: 24, color: pal.muted, display: 'flex' }, clean(d.site.domain, 40)),
      ],
    ));
    return raster(tree, w, h, pal.bg);
  }
  const pad = size === 'small' ? 0 : 0;
  const tree = wrapCanvas(w, h, { ...pal, bg: pal.bg }, widgetTree(card, d, w, h), pad);
  return raster(tree, w, h, pal.bg);
}

export interface BoardPngItem {
  opts: Pick<WidgetOpts, 'type' | 'style' | 'accent' | 'locale' | 'logo' | 'period' | 'theme'>;
  data: WidgetData;
}

/** Several widgets stacked — used for wallpaper and a tall « stack » image. */
export async function renderBoardPng(items: BoardPngItem[], size: PngSize | 'stack', boardTheme: 'light' | 'dark' | 'auto', siteName: string, siteDomain: string): Promise<Uint8Array<ArrayBuffer>> {
  const theme = boardTheme === 'light' ? 'light' : 'dark';
  const pal = PAL[theme];
  if (size !== 'wallpaper' && size !== 'stack' && items.length === 1) {
    const first = items[0]!;
    const o = { ...first.opts, theme: first.opts.theme, size: 'md' as const, transparent: false, wid: '' };
    return renderWidgetPng(o as WidgetOpts, first.data, size, theme);
  }
  if (size === 'small' || size === 'medium' || size === 'large') {
    // Combined slot: show the first widget at that size (per-item downloads use renderWidgetPng).
    const first = items[0]!;
    const o = { ...first.opts, size: 'md' as const, transparent: false, wid: '' };
    return renderWidgetPng(o as WidgetOpts, first.data, size, theme);
  }

  const w = size === 'stack' ? 1014 : PNG_SIZES.wallpaper.w;
  const innerW = size === 'stack' ? 930 : 1014;
  const gap = 28;
  const cardH = items.length <= 2 ? 480 : items.length === 3 ? 400 : 320;
  const headerH = 160;
  const footerH = 80;
  const padY = size === 'wallpaper' ? 160 : 48;
  const contentH = headerH + items.length * cardH + (items.length - 1) * gap + footerH;
  const h = size === 'wallpaper' ? PNG_SIZES.wallpaper.h : Math.max(contentH + padY * 2, 800);

  const cards = items.map((it) => widgetTree(optsToCard(it.opts, resolveTheme(it.opts.theme, theme)), it.data, innerW, cardH));
  const tree = wrapCanvas(w, h, pal, el(
    { display: 'flex', flexDirection: 'column', justifyContent: size === 'wallpaper' ? 'space-between' : 'flex-start', alignItems: 'center', width: w, height: h, padding: size === 'wallpaper' ? '140px 78px 100px' : '48px 42px' },
    [
      el({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }, [
        text({ fontSize: 26, color: pal.muted, letterSpacing: '0.16em', display: 'flex' }, 'MINILYTICS'),
        text({ fontSize: 40, fontWeight: 600, color: pal.ink, display: 'flex' }, clean(siteName || siteDomain, 40)),
      ]),
      el({ display: 'flex', flexDirection: 'column', gap, width: innerW }, cards),
      text({ fontSize: 22, color: pal.muted, marginTop: 28, display: 'flex' }, clean(siteDomain, 40)),
    ],
  ));
  return raster(tree, w, h, pal.bg);
}

export function pngHeaders(filename: string, cache = 'public, max-age=30, s-maxage=0, must-revalidate') {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': cache,
    'Content-Disposition': `inline; filename="${filename}"`,
    'X-Robots-Tag': 'noindex',
    'X-Content-Type-Options': 'nosniff',
  } as const;
}

export function pngResponse(png: Uint8Array<ArrayBuffer>, filename: string) {
  return new Response(png, { status: 200, headers: pngHeaders(filename) });
}

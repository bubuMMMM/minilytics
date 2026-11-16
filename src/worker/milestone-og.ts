/**
 * Premium milestone OG cards (satori + resvg). 1200×675 for X large cards, 1080×1080 square.
 * Vercel / Linear-inspired: dot grid, soft accent glow, real cumulative-visitor area chart.
 * Colors follow Minilytics design tokens (light / dark).
 */
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { loadFonts, OG_PNG_HEADERS } from './og-image.js';

export { OG_PNG_HEADERS };

export type MilestoneTheme = 'light' | 'dark';
export type MilestoneSize = 'wide' | 'square';

export interface SeriesPoint {
  t: number;
  n: number;
}

export interface MilestoneCard {
  kicker: string;
  headline: string;
  number: string;
  unit: string;
  date: string;
  siteName: string;
  domain: string;
  favicon?: string | null;
  theme: MilestoneTheme;
  size: MilestoneSize;
  /** Cumulative unique visitors up to the milestone date (real data only). */
  series?: SeriesPoint[];
  chips?: string[];
}

const THEME = {
  light: {
    canvas: '#ffffff',
    surface: '#fafafa',
    ink: '#09090b',
    ink2: '#3f3f46',
    ink3: '#71717a',
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    line: '#e4e4e7',
    grid: 'rgba(9, 9, 11, 0.07)',
    glow: '#2563eb',
    glow0: 0.22,
    area0: 0.28,
    area1: 0.03,
  },
  dark: {
    canvas: '#0a0a0b',
    surface: '#111113',
    ink: '#fafafa',
    ink2: '#d4d4d8',
    ink3: '#a1a1aa',
    accent: '#60a5fa',
    accentSoft: '#172554',
    line: '#27272a',
    grid: 'rgba(250, 250, 250, 0.07)',
    glow: '#60a5fa',
    glow0: 0.32,
    area0: 0.38,
    area1: 0.03,
  },
} as const;

type Theme = (typeof THEME)[keyof typeof THEME];
type Node = { type: string; props: Record<string, unknown> };

const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children },
});

const img = (src: string, style: Record<string, unknown>): Node => ({
  type: 'img',
  props: { src, style },
});

function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function dotGridSvg(width: number, height: number, color: string): string {
  const step = 28;
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs><pattern id="d" width="${step}" height="${step}" patternUnits="userSpaceOnUse">` +
      `<circle cx="1.1" cy="1.1" r="1.1" fill="${color}"/></pattern></defs>` +
      `<rect width="100%" height="100%" fill="url(#d)"/></svg>`,
  );
}

function glowSvg(width: number, height: number, color: string, opacity: number, wide: boolean): string {
  const cx = wide ? '78%' : '50%';
  const cy = wide ? '38%' : '72%';
  const r = wide ? '58%' : '52%';
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs>` +
      `<radialGradient id="g1" cx="${cx}" cy="${cy}" r="${r}">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${opacity}"/>` +
      `<stop offset="45%" stop-color="${color}" stop-opacity="${(opacity * 0.35).toFixed(3)}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<radialGradient id="g2" cx="12%" cy="8%" r="42%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${(opacity * 0.28).toFixed(3)}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="100%" height="100%" fill="url(#g1)"/>` +
      `<rect width="100%" height="100%" fill="url(#g2)"/>` +
      `</svg>`,
  );
}

/** Official Minilytics mark: rounded square + rising path (same as the dashboard logo). */
function logoMarkSvg(ink: string, canvas: string, size: number): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" rx="6" fill="${ink}"/>` +
      `<path d="M6 15.5 9.6 11l2.8 2.6L18 7.5" fill="none" stroke="${canvas}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`,
  );
}

export function downsampleSeries(points: SeriesPoint[], max = 56): SeriesPoint[] {
  if (points.length <= max) return points;
  const out: SeriesPoint[] = [points[0]!];
  const step = (points.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.push(points[Math.round(i * step)]!);
  out.push(points[points.length - 1]!);
  return out;
}

export function sparklineSvg(points: SeriesPoint[], width: number, height: number, t: Theme): string {
  const pts = downsampleSeries(points, 56).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.n));
  if (pts.length < 1) return '';
  const padL = 4;
  const padR = 14;
  const padT = 18;
  const padB = 10;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);
  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const spanT = t1 - t0;
  const maxN = Math.max(1, ...pts.map((p) => p.n));
  const yMax = maxN * 1.08;
  const xOf = (p: SeriesPoint, i: number) =>
    padL + (spanT > 0 ? ((p.t - t0) / spanT) * innerW : (pts.length === 1 ? innerW : (i / (pts.length - 1)) * innerW));
  const yOf = (p: SeriesPoint) => padT + innerH - (Math.max(0, p.n) / yMax) * innerH;
  const coords = pts.map((p, i) => `${xOf(p, i).toFixed(1)},${yOf(p).toFixed(1)}`);
  const last = pts[pts.length - 1]!;
  const xLast = xOf(last, pts.length - 1);
  const yLast = yOf(last);
  const xFirst = xOf(pts[0]!, 0);
  const line = coords.join(' ');
  const area = `${xFirst.toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xLast.toFixed(1)},${(padT + innerH).toFixed(1)}`;
  const yBase = padT + innerH;
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs>` +
      `<linearGradient id="area" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${t.accent}" stop-opacity="${t.area0}"/>` +
      `<stop offset="100%" stop-color="${t.accent}" stop-opacity="${t.area1}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<line x1="${padL}" y1="${yBase.toFixed(1)}" x2="${(width - padR).toFixed(1)}" y2="${yBase.toFixed(1)}" stroke="${t.line}" stroke-width="1"/>` +
      `<polygon points="${area}" fill="url(#area)"/>` +
      `<polyline points="${line}" fill="none" stroke="${t.accent}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="${xLast.toFixed(1)}" cy="${yLast.toFixed(1)}" r="9" fill="${t.accent}" fill-opacity="0.22"/>` +
      `<circle cx="${xLast.toFixed(1)}" cy="${yLast.toFixed(1)}" r="4.25" fill="${t.accent}"/>` +
      `</svg>`,
  );
}

export async function renderMilestonePng(card: MilestoneCard): Promise<Uint8Array<ArrayBuffer>> {
  const t = THEME[card.theme] ?? THEME.dark;
  const wide = card.size !== 'square';
  const width = wide ? 1200 : 1080;
  const height = wide ? 675 : 1080;
  const pad = wide ? 64 : 72;
  const numberSize = wide ? 152 : 168;
  const unitSize = wide ? 30 : 32;
  const initials = (card.siteName || card.domain || 'M')
    .trim()
    .split(/[\s.]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'M';

  const badge: Node = card.favicon
    ? img(card.favicon, { width: 56, height: 56, borderRadius: 14, objectFit: 'cover' })
    : el(
        'div',
        {
          width: 56,
          height: 56,
          borderRadius: 14,
          backgroundColor: t.accentSoft,
          color: t.accent,
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 600,
        },
        initials,
      );

  const name = card.siteName || card.domain;
  const showDomain = Boolean(card.domain && name.toLowerCase() !== card.domain.toLowerCase());
  const header = el('div', { alignItems: 'center', gap: 16 }, [
    badge,
    el('div', { flexDirection: 'column', gap: 4 }, [
      el('div', { fontSize: 24, fontWeight: 600, color: t.ink, letterSpacing: '-0.03em', lineHeight: 1.15 }, name),
      ...(showDomain ? [el('div', { fontSize: 16, color: t.ink3, letterSpacing: '-0.01em' }, card.domain)] : []),
    ]),
  ]);

  const kicker = el(
    'div',
    {
      fontSize: 13,
      fontWeight: 600,
      color: t.accent,
      letterSpacing: '0.16em',
      textTransform: 'uppercase' as const,
    },
    card.kicker,
  );

  const numberBlock = el('div', { flexDirection: 'column', gap: 10, marginTop: wide ? 4 : 8 }, [
    el(
      'div',
      {
        fontSize: numberSize,
        fontWeight: 600,
        color: t.ink,
        letterSpacing: '-0.06em',
        lineHeight: 0.95,
        fontFeatureSettings: '"tnum" 1, "ss01" 1',
      },
      card.number,
    ),
    el('div', { fontSize: unitSize, fontWeight: 400, color: t.ink2, letterSpacing: '-0.02em', lineHeight: 1.25 }, card.unit || card.headline),
  ]);

  const chips = (card.chips ?? []).filter(Boolean).slice(0, 3).map((label) =>
    el(
      'div',
      {
        border: `1px solid ${t.line}`,
        backgroundColor: t.surface,
        borderRadius: 999,
        paddingTop: 7,
        paddingBottom: 7,
        paddingLeft: 14,
        paddingRight: 14,
        fontSize: 14,
        fontWeight: 400,
        color: t.ink2,
        letterSpacing: '-0.01em',
        lineHeight: 1.2,
      },
      label,
    ),
  );
  const chipRow = chips.length
    ? el('div', { flexWrap: 'wrap' as const, gap: 8, marginTop: 4 }, chips)
    : null;

  const chartW = wide ? 520 : width - pad * 2;
  const chartH = wide ? 360 : 420;
  const series = (card.series ?? []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.n));
  const sparkUri = series.length ? sparklineSvg(series, chartW, chartH, t) : '';
  const chart = sparkUri
    ? el('div', { flexDirection: 'column', gap: 8, width: chartW }, [
        el(
          'div',
          { fontSize: 13, fontWeight: 400, color: t.ink3, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
          'Visiteurs cumulés',
        ),
        img(sparkUri, { width: chartW, height: chartH }),
      ])
    : null;

  const logo = el('div', { alignItems: 'center', gap: 10 }, [
    img(logoMarkSvg(t.ink, t.canvas, 28), { width: 28, height: 28 }),
    el('div', { fontSize: 18, fontWeight: 600, color: t.ink2, letterSpacing: '-0.03em' }, 'Minilytics'),
  ]);

  const left = el(
    'div',
    {
      flexDirection: 'column',
      justifyContent: 'space-between',
      flexGrow: wide ? 1 : 0,
      flexShrink: 1,
      width: wide ? 520 : '100%',
      height: wide ? height - pad * 2 : undefined,
    },
    [
      el('div', { flexDirection: 'column', gap: wide ? 22 : 26 }, [header, kicker, numberBlock, ...(chipRow ? [chipRow] : [])]),
      el('div', { fontSize: 18, color: t.ink3, letterSpacing: '-0.01em', marginTop: wide ? 0 : 28 }, card.date),
    ],
  );

  const body = wide
    ? el('div', { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', width: '100%', height: height - pad * 2, position: 'relative' as const }, [
        left,
        el(
          'div',
          { flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', width: chartW, height: '100%', position: 'relative' as const },
          [
            ...(chart ? [chart] : []),
            el('div', { position: 'absolute', right: 0, bottom: 0 }, [logo]),
          ],
        ),
      ])
    : el('div', { flexDirection: 'column', width: '100%', height: height - pad * 2 }, [
        left,
        el('div', { flexGrow: 1, flexDirection: 'column', justifyContent: 'flex-end', gap: 20, width: '100%', marginTop: 36 }, [
          ...(chart ? [chart] : []),
          el('div', { justifyContent: 'flex-end', width: '100%' }, [logo]),
        ]),
      ]);

  const svg = await satori(
    el(
      'div',
      {
        width,
        height,
        flexDirection: 'column',
        backgroundColor: t.canvas,
        color: t.ink,
        fontFamily: 'Inter',
        position: 'relative',
        overflow: 'hidden',
      },
      [
        img(dotGridSvg(width, height, t.grid), {
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height,
        }),
        img(glowSvg(width, height, t.glow, t.glow0, wide), {
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height,
        }),
        el(
          'div',
          {
            position: 'relative',
            width,
            height,
            padding: pad,
            boxSizing: 'border-box' as const,
            flexDirection: 'column',
          },
          [body],
        ),
      ],
    ) as never,
    { width, height, fonts: loadFonts() },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: t.canvas });
  const raw = resvg.render().asPng();
  const png = new Uint8Array(new ArrayBuffer(raw.byteLength));
  png.set(raw);
  return png;
}

/** Best-effort site favicon as a data URI for satori (never throws). */
export async function fetchFaviconDataUri(domain: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const host = domain.replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  try {
    const r = await fetcher(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 32 || buf.byteLength > 200_000) return null;
    const ct = (r.headers.get('content-type') || 'image/png').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    let binary = '';
    for (const b of buf) binary += String.fromCharCode(b);
    return `data:${ct};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

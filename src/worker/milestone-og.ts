/**
 * Premium milestone OG cards (satori + resvg). 1200×675 for X large cards, 1080×1080 square.
 * Colors follow Minilytics design tokens (light / dark).
 */
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { loadFonts, OG_PNG_HEADERS } from './og-image.js';

export { OG_PNG_HEADERS };

export type MilestoneTheme = 'light' | 'dark';
export type MilestoneSize = 'wide' | 'square';

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
}

const THEME = {
  light: {
    canvas: '#ffffff',
    surface: '#ffffff',
    well: '#fafafa',
    line: '#eaeAec',
    ink: '#09090b',
    ink2: '#3f3f46',
    ink3: '#71717a',
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    glow: 'rgba(37, 99, 235, 0.18)',
  },
  dark: {
    canvas: '#0a0a0b',
    surface: '#111113',
    well: '#18181b',
    line: '#27272a',
    ink: '#fafafa',
    ink2: '#d4d4d8',
    ink3: '#a1a1aa',
    accent: '#60a5fa',
    accentSoft: '#172554',
    glow: 'rgba(96, 165, 250, 0.22)',
  },
} as const;

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children },
});

export async function renderMilestonePng(card: MilestoneCard): Promise<Uint8Array<ArrayBuffer>> {
  const t = THEME[card.theme] ?? THEME.dark;
  const wide = card.size !== 'square';
  const width = wide ? 1200 : 1080;
  const height = wide ? 675 : 1080;
  const pad = wide ? 72 : 80;
  const numberSize = wide ? 168 : 200;
  const unitSize = wide ? 36 : 40;
  const initials = (card.siteName || card.domain || 'M').trim().split(/[\s.]+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'M';

  const badge = card.favicon
    ? el('img', { width: 64, height: 64, borderRadius: 16 }, undefined)
    : el(
        'div',
        {
          width: 64, height: 64, borderRadius: 16, backgroundColor: t.accentSoft, color: t.accent,
          alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600,
        },
        initials,
      );
  if (card.favicon) badge.props.src = card.favicon;
  badge.props.width = 64;
  badge.props.height = 64;
  if (card.favicon) {
    badge.props.style = { width: 64, height: 64, borderRadius: 16, objectFit: 'cover' };
  }

  const name = card.siteName || card.domain;
  const showDomain = card.domain && name.toLowerCase() !== card.domain.toLowerCase();
  const header = el('div', { alignItems: 'center', gap: 20 }, [
    badge,
    el('div', { flexDirection: 'column', gap: 6 }, [
      el('div', { fontSize: 28, fontWeight: 600, color: t.ink, letterSpacing: '-0.02em' }, name),
      ...(showDomain ? [el('div', { fontSize: 20, color: t.ink3 }, card.domain)] : []),
    ]),
  ]);

  const kicker = el(
    'div',
    {
      fontSize: 18, fontWeight: 600, color: t.accent, letterSpacing: '0.12em',
      textTransform: 'uppercase' as const,
    },
    card.kicker,
  );

  const numberBlock = el('div', { flexDirection: 'column', gap: wide ? 12 : 16, marginTop: wide ? 8 : 24 }, [
    el('div', {
      fontSize: numberSize, fontWeight: 600, color: t.ink, letterSpacing: '-0.05em',
      lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const,
    }, card.number),
    el('div', { fontSize: unitSize, fontWeight: 500, color: t.ink2, letterSpacing: '-0.02em' }, card.unit || card.headline),
  ]);

  const footer = el('div', { justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }, [
    el('div', { fontSize: 22, color: t.ink3 }, card.date),
    el('div', { alignItems: 'center', gap: 10 }, [
      el('div', { width: 10, height: 10, borderRadius: 999, backgroundColor: t.accent }),
      el('div', { fontSize: 20, fontWeight: 500, color: t.ink3 }, 'Minilytics'),
    ]),
  ]);

  const svg = await satori(
    el(
      'div',
      {
        width, height, flexDirection: 'column', backgroundColor: t.canvas, color: t.ink,
        fontFamily: 'Inter', position: 'relative', overflow: 'hidden',
      },
      [
        el('div', {
          position: 'absolute', right: -80, top: -120, width: 420, height: 420,
          borderRadius: 9999, backgroundColor: t.glow,
        }),
        el('div', {
          position: 'absolute', left: -100, bottom: -140, width: 360, height: 360,
          borderRadius: 9999, backgroundColor: t.glow,
        }),
        el(
          'div',
          {
            position: 'relative', width, height, flexDirection: 'column',
            justifyContent: 'space-between', padding: pad, boxSizing: 'border-box' as const,
          },
          [
            el('div', { flexDirection: 'column', gap: wide ? 28 : 36 }, [header, kicker, numberBlock]),
            footer,
          ],
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

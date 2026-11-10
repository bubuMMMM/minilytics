/**
 * Dynamic 1200×630 Open Graph PNG (satori + resvg, bundled Inter).
 * Used for public profile pages and share links so LinkedIn/Facebook can preview them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

export interface OgCard {
  title: string;
  subtitle?: string;
  kicker?: string;
  footer?: string;
  accent?: string;
  initials?: string;
}

export const OG_PNG_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
} as const;

type Font = { name: string; data: Buffer; weight: 400 | 600; style: 'normal' };
let fonts: Font[] | null = null;

function fontFile(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'fonts', name),
    join(process.cwd(), 'src/worker/fonts', name),
    join(process.cwd(), 'fonts', name),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`Police Open Graph introuvable : ${name}`);
}

function loadFonts(): Font[] {
  if (fonts) return fonts;
  fonts = [
    { name: 'Inter', data: readFileSync(fontFile('inter-latin-400-normal.woff')), weight: 400, style: 'normal' },
    { name: 'Inter', data: readFileSync(fontFile('inter-latin-600-normal.woff')), weight: 600, style: 'normal' },
  ];
  return fonts;
}

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

function initialsOf(title: string, raw?: string) {
  const src = (raw && raw.trim()) || title;
  const parts = src.trim().split(/\s+/).map((w) => w[0]).join('');
  return clean((parts || 'M').toUpperCase(), 2);
}

export async function renderOgPng(card: OgCard): Promise<Uint8Array<ArrayBuffer>> {
  const title = clean(card.title || 'Minilytics', 60);
  const subtitle = clean(card.subtitle || '', 140);
  const kicker = clean(card.kicker || 'Minilytics', 48);
  const footer = clean(card.footer || 'minilytics-six.vercel.app', 90);
  let accent = (card.accent || '2563eb').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(accent)) accent = '2563eb';
  const accentHex = '#' + accent;
  const initials = initialsOf(title, card.initials);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0a0a0b',
          color: '#fafafa',
          fontFamily: 'Inter',
          padding: '72px 80px',
          position: 'relative',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', right: -40, top: -80, width: 440, height: 440,
                borderRadius: 9999, backgroundColor: accentHex, opacity: 0.2,
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', left: -80, bottom: -120, width: 380, height: 380,
                borderRadius: 9999, backgroundColor: accentHex, opacity: 0.14,
              },
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: 28 },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', alignItems: 'center', gap: 20 },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            width: 96, height: 96, borderRadius: 24, backgroundColor: accentHex,
                            color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 36, fontWeight: 600,
                          },
                          children: initials,
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: 22, color: '#a1a1aa', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const },
                          children: kicker,
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { fontSize: 64, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#fafafa' },
                          children: title,
                        },
                      },
                      ...(subtitle ? [{
                        type: 'div',
                        props: {
                          style: { fontSize: 28, color: '#a1a1aa', lineHeight: 1.35 },
                          children: subtitle,
                        },
                      }] : []),
                    ],
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
              children: [
                { type: 'div', props: { style: { fontSize: 22, color: '#71717a' }, children: footer } },
                { type: 'div', props: { style: { fontSize: 20, color: '#a1a1aa', fontWeight: 500 }, children: 'Minilytics' } },
              ],
            },
          },
        ],
      },
    } as never,
    { width: 1200, height: 630, fonts: loadFonts() },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, background: '#0a0a0b' });
  const raw = resvg.render().asPng();
  const png = new Uint8Array(new ArrayBuffer(raw.byteLength));
  png.set(raw);
  return png;
}

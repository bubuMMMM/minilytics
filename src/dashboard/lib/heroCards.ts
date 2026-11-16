/** Pure helpers for the landing hero preview cards. Keep numbers honest: no invented totals or deltas. */

const NBSP = String.fromCharCode(160);

/** Share of a total; a non-zero share that rounds to 0 reads « < 1 % », never « 0 % ». */
export function pct(v: number, total: number) {
  const p = total > 0 ? (v / total) * 100 : 0;
  return v > 0 && p < 1 ? `<${NBSP}1${NBSP}%` : `${Math.round(p)}${NBSP}%`;
}

/** A change is only shown when the previous period is large enough to mean something. */
export function change(now: number, before: number, minBefore: number) {
  if (before < minBefore) return null;
  const c = Math.round(((now - before) / before) * 100);
  return Math.abs(c) <= 300 ? c : null;
}

export type PeriodDelta = { kind: 'pct' | 'abs'; value: number };

/**
 * Percent change when it stays in a readable range; otherwise the raw difference.
 * A 50× spike is still a real delta — we just don't render it as « +5 000 % ».
 */
export function periodDelta(now: number, before: number, minBefore: number): PeriodDelta | null {
  if (before < minBefore) return null;
  const c = Math.round(((now - before) / before) * 100);
  if (Math.abs(c) <= 300) return { kind: 'pct', value: c };
  return { kind: 'abs', value: now - before };
}

/** Day-of-month tick from an ISO date (`2026-11-16` or a full timestamp). Date-only, no TZ shift. */
export function dayTick(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? String(Number(m[3])) : '';
}

/** Width of a proportion bar, 0–100. A non-zero value gets a visible sliver. */
export function barWidth(value: number, total: number): number {
  if (value <= 0 || total <= 0) return 0;
  return Math.max(2, Math.min(100, (value / total) * 100));
}

const BOT_MONOGRAM: Record<string, string> = {
  OpenAI: 'OA',
  Anthropic: 'AN',
  Google: 'G',
  Apple: 'A',
  Meta: 'M',
  Amazon: 'AM',
  ByteDance: 'BD',
  Perplexity: 'PX',
  'Mistral AI': 'MI',
  Cohere: 'CO',
  'Common Crawl': 'CC',
  'You.com': 'YO',
  DuckDuckGo: 'DD',
  Diffbot: 'DF',
  'Allen Institute for AI': 'A2',
  Timpi: 'TI',
  ImageSift: 'IS',
  'Webz.io': 'WZ',
};

/** Compact mark for an AI-bot operator when no local logo is available. */
export function monogram(name: string): string {
  const known = BOT_MONOGRAM[name];
  if (known) return known;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const compact = name.replace(/[^A-Za-z0-9]/g, '');
  return (compact.slice(0, 2) || '?').toUpperCase();
}

export const CHANNEL_ICON = {
  Direct: 'link',
  'Direct/None': 'link',
  'Organic Search': 'search',
  'Organic Social': 'share',
  AI: 'sparkles',
  Referral: 'arrow-up-right',
  Email: 'message',
  Paid: 'megaphone',
} as const;

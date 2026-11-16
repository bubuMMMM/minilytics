/** Core Web Vitals thresholds (Google) and parsers for tracker events. */
export const VITAL_METRICS = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];
export type VitalRating = 'good' | 'needs-improvement' | 'poor';

export const VITAL_LABEL: Record<VitalMetric, string> = {
  lcp: 'LCP',
  inp: 'INP',
  cls: 'CLS',
  fcp: 'FCP',
  ttfb: 'TTFB',
};

export const VITAL_HELP: Record<VitalMetric, string> = {
  lcp: 'Largest Contentful Paint — délai avant que le plus grand élément visible s’affiche.',
  inp: 'Interaction to Next Paint — délai de réaction à une interaction (clic, touche, tap).',
  cls: 'Cumulative Layout Shift — instabilité visuelle de la page (déplacements inattendus).',
  fcp: 'First Contentful Paint — délai avant le premier texte ou image.',
  ttfb: 'Time to First Byte — délai avant le premier octet de la réponse.',
};

/** Good / needs-improvement ceilings. Unit is milliseconds, except CLS (unitless). */
export const VITAL_THRESHOLDS: Record<VitalMetric, { good: number; ni: number }> = {
  lcp: { good: 2500, ni: 4000 },
  inp: { good: 200, ni: 500 },
  cls: { good: 0.1, ni: 0.25 },
  fcp: { good: 1800, ni: 3000 },
  ttfb: { good: 800, ni: 1800 },
};

export function rateVital(metric: VitalMetric, value: number | null | undefined): VitalRating | null {
  if (value == null || !Number.isFinite(value)) return null;
  const t = VITAL_THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  if (value <= t.ni) return 'needs-improvement';
  return 'poor';
}

export const RATING_LABEL: Record<VitalRating, string> = {
  good: 'Bon',
  'needs-improvement': 'À améliorer',
  poor: 'Médiocre',
};

export function formatVital(metric: VitalMetric, value: number | null | undefined, locale = 'fr-FR'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (metric === 'cls') return new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
  if (value >= 1000) {
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value / 1000)} s`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value))} ms`;
}

/** Inclusive percentile (linear interpolation). `p` is in 0..1. */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const idx = (v.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

export function p75(values: number[]): number | null {
  return percentile(values, 0.75);
}

const NUM = (raw: unknown, min: number, max: number): number | undefined => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
};

export interface VitalProps {
  lcp?: number;
  inp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  vw?: number;
}

/** Validate a `vital` event payload. At least one metric must be present. CLS may be 0. */
export function parseVitalProps(raw: unknown): VitalProps | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const out: VitalProps = {};
  const lcp = NUM(p.lcp, 1, 120_000);
  const inp = NUM(p.inp, 1, 30_000);
  const fcp = NUM(p.fcp, 1, 120_000);
  const ttfb = NUM(p.ttfb, 1, 60_000);
  const cls = NUM(p.cls, 0, 10);
  const vw = NUM(p.vw, 1, 10_000);
  if (lcp != null) out.lcp = Math.round(lcp);
  if (inp != null) out.inp = Math.round(inp);
  if (fcp != null) out.fcp = Math.round(fcp);
  if (ttfb != null) out.ttfb = Math.round(ttfb);
  if (cls != null) out.cls = Math.round(cls * 10_000) / 10_000;
  if (vw != null) out.vw = Math.round(vw);
  if (out.lcp == null && out.inp == null && out.cls == null && out.fcp == null && out.ttfb == null) return null;
  return out;
}

export interface HeatProps {
  x: number;
  y: number;
  vw?: number;
  vh?: number;
  selector: string;
  text: string | null;
  rage: boolean;
}

const INPUT_RE = /(?:^|>)(?:input|textarea|select|option)(?:[.#:[\s>]|$)/i;

function cleanSelector(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 160);
}

function cleanText(raw: unknown, selector: string): string | null {
  if (typeof raw !== 'string') return null;
  if (INPUT_RE.test(selector)) return null;
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!t || /@|\b\d{8,}\b/.test(t)) return null;
  return t;
}

/** Validate a `heat` event. Coordinates are normalised to the document (0..1). */
export function parseHeatProps(name: unknown, raw: unknown): HeatProps | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const x = NUM(p.x, 0, 1);
  const y = NUM(p.y, 0, 1);
  if (x == null || y == null) return null;
  const selector = cleanSelector(p.s) || cleanSelector(name) || 'click';
  const vw = NUM(p.vw, 1, 10_000);
  const vh = NUM(p.vh, 1, 30_000);
  return {
    x: Math.round(x * 10_000) / 10_000,
    y: Math.round(y * 10_000) / 10_000,
    vw: vw != null ? Math.round(vw) : undefined,
    vh: vh != null ? Math.round(vh) : undefined,
    selector,
    text: cleanText(p.t, selector),
    rage: p.r === 1 || p.r === true,
  };
}

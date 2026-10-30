import { useId, useMemo, useRef, useState } from 'react';
import { bucketLabel, fmtNumber } from '../lib/format';

export interface TrendSeries { key: string; label: string; color: string; values: number[]; axis?: 'left' | 'right' }

/**
 * Lean SVG area/line chart (no chart library): value under the pointer, keyboard ←/→ scrubbing,
 * a visually hidden data table for screen readers, and fixed height so nothing shifts while loading.
 * Pattern adapted from 21st.dev "Stat Card" (OSAGI) trend line.
 */
export function TrendChart({ buckets, granularity, series, height = 220, format = fmtNumber }: {
  buckets: string[]; granularity: string; series: TrendSeries[]; height?: number; format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const gid = useId().replace(/:/g, '');
  const W = 1000, H = height, P = 8;
  const n = buckets.length;
  const max = useMemo(() => {
    const m: Record<string, number> = { left: 1, right: 1 };
    for (const s of series) m[s.axis ?? 'left'] = Math.max(m[s.axis ?? 'left'], ...s.values);
    return m;
  }, [series]);
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const y = (v: number, axis = 'left') => H - 24 - (v / max[axis]) * (H - 44);
  const path = (vals: number[], axis?: string) => smooth(vals.map((v, i) => [x(i), y(v, axis)] as [number, number]));
  const step = Math.max(1, Math.ceil(n / 7));
  const ticks: number[] = [];
  for (let i = 0; i < n; i += step) ticks.push(i);
  if (n > 1 && ticks[ticks.length - 1] !== n - 1) { if (n - 1 - ticks[ticks.length - 1] < step / 2 && ticks.length > 1) ticks.pop(); ticks.push(n - 1); }

  function onMove(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !n) return;
    const rel = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(Math.round(rel * (n - 1)));
  }
  const h = hover ?? null;
  return (
    <div className="relative">
      <div
        ref={box}
        className="relative touch-pan-y select-none"
        style={{ height: H }}
        tabIndex={0}
        role="img"
        aria-label={`Graphique : ${series.map((s) => s.label).join(' et ')} sur la période`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((v) => Math.min(n - 1, (v ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? n) - 1));
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity=".18" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - 24 - f * (H - 44)} y2={H - 24 - f * (H - 44)} stroke="rgb(var(--line))" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2={W} y1={H - 24} y2={H - 24} stroke="rgb(var(--line-strong))" vectorEffect="non-scaling-stroke" />
          {series.map((s, k) => (
            <g key={s.key}>
              {k === 0 && n > 1 && <path d={`${path(s.values, s.axis)} L${x(n - 1)},${H - 24} L${x(0)},${H - 24} Z`} fill={`url(#${gid}-${s.key})`} />}
              <path d={path(s.values, s.axis)} fill="none" stroke={s.color} strokeWidth={k === 0 ? 2 : 1.5} strokeDasharray={k === 0 ? undefined : '4 4'} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {h !== null && <line x1={x(h)} x2={x(h)} y1="8" y2={H - 24} stroke="rgb(var(--line-strong))" vectorEffect="non-scaling-stroke" />}
        </svg>
        {h !== null && series.map((s) => (
          <span key={s.key} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ left: `${(x(h) / W) * 100}%`, top: y(s.values[h] ?? 0, s.axis), background: s.color }} />
        ))}
        {h !== null && (
          <div className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
            style={{ left: `clamp(80px, ${(x(h) / W) * 100}%, calc(100% - 80px))` }} aria-live="polite">
            <div className="mb-1 font-semibold text-ink">{bucketLabel(buckets[h], granularity, true)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <span className="tnum font-semibold">{format(s.values[h] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5">
          {ticks.map((i) => (
            <span key={buckets[i]} className={`absolute whitespace-nowrap text-[11px] text-ink-4 ${i === 0 && n > 1 ? '' : i === n - 1 && n > 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: n > 1 && i === 0 ? 0 : n > 1 && i === n - 1 ? '100%' : `${(x(i) / W) * 100}%` }}>{bucketLabel(buckets[i], granularity)}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-ink-3">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}{s.axis === 'right' ? ' (échelle de droite)' : ''}</span>)}
      </div>
      <table className="sr-only">
        <caption>Données du graphique</caption>
        <thead><tr><th>Période</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{buckets.map((b, i) => <tr key={b}><td>{bucketLabel(b, granularity, true)}</td>{series.map((s) => <td key={s.key}>{s.values[i] ?? 0}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Monotone cubic (Fritsch–Carlson) path: smooth curve that never overshoots below zero. */
function smooth(p: [number, number][]): string {
  const n = p.length;
  if (!n) return '';
  if (n < 3) return p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0] || 1));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], t = a * a + b * b;
    if (t > 9) { const k = 3 / Math.sqrt(t); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  let out = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    out += ` C${(p[i][0] + h).toFixed(1)},${(p[i][1] + m[i] * h).toFixed(1)} ${(p[i + 1][0] - h).toFixed(1)},${(p[i + 1][1] - m[i + 1] * h).toFixed(1)} ${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
  }
  return out;
}

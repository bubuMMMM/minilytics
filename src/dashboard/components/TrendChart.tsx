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
  const path = (vals: number[], axis?: string) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v, axis).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil(n / 7));

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
          {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - 24 - f * (H - 44)} y2={H - 24 - f * (H - 44)} stroke="#eef1f6" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2={W} y1={H - 24} y2={H - 24} stroke="#e3e8f1" vectorEffect="non-scaling-stroke" />
          {series.map((s, k) => (
            <g key={s.key}>
              {k === 0 && n > 1 && <path d={`${path(s.values, s.axis)} L${x(n - 1)},${H - 24} L${x(0)},${H - 24} Z`} fill={`url(#${gid}-${s.key})`} />}
              <path d={path(s.values, s.axis)} fill="none" stroke={s.color} strokeWidth={k === 0 ? 2.25 : 1.75} strokeDasharray={k === 0 ? undefined : '0'} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {h !== null && <line x1={x(h)} x2={x(h)} y1="8" y2={H - 24} stroke="#c3cbe0" vectorEffect="non-scaling-stroke" />}
        </svg>
        {h !== null && series.map((s) => (
          <span key={s.key} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${(x(h) / W) * 100}%`, top: y(s.values[h] ?? 0, s.axis), background: s.color, boxShadow: '0 0 0 1px rgba(23,39,75,.08)' }} />
        ))}
        {h !== null && (
          <div className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-xl border border-[#e8edf5] bg-white/95 px-3 py-2 text-[12px] shadow-[0_8px_24px_rgba(23,39,75,.12)] backdrop-blur"
            style={{ left: `clamp(80px, ${(x(h) / W) * 100}%, calc(100% - 80px))` }} aria-live="polite">
            <div className="mb-1 font-semibold text-[#17213a]">{bucketLabel(buckets[h], granularity, true)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-[#6b7891]"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <span className="tnum font-semibold">{format(s.values[h] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5">
          {buckets.map((b, i) => i % step === 0 && (
            <span key={b} className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-[#9aa7ba]" style={{ left: `${(x(i) / W) * 100}%` }}>{bucketLabel(b, granularity)}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[#6b7891]">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full" style={{ background: s.color }} />{s.label}{s.axis === 'right' ? ' (échelle de droite)' : ''}</span>)}
      </div>
      <table className="sr-only">
        <caption>Données du graphique</caption>
        <thead><tr><th>Période</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{buckets.map((b, i) => <tr key={b}><td>{bucketLabel(b, granularity, true)}</td>{series.map((s) => <td key={s.key}>{s.values[i] ?? 0}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

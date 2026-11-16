import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { bucketLabel, fmtNumber } from '../lib/format';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  axis?: 'left' | 'right';
  /** Optional sample counts shown in the tooltip (e.g. Web Vitals p75). */
  samples?: Array<number | null>;
}

/**
 * Lean SVG area/line chart (no chart library): value under the pointer, keyboard ←/→ scrubbing,
 * a visually hidden data table for screen readers, and fixed height so nothing shifts while loading.
 * Pattern adapted from 21st.dev "Stat Card" (OSAGI) trend line.
 * Null values are gaps: the line breaks and isolated points are drawn as dots (0 is a real value).
 */
export function TrendChart({ buckets, granularity, series, height = 220, format = fmtNumber, peers = false }: {
  buckets: string[]; granularity: string; series: TrendSeries[]; height?: number; format?: (n: number) => string;
  /** Series are equals (e.g. bot categories): all solid lines. Default: the first is primary, the others are dashed comparisons. */
  peers?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef(false);
  const gid = useId().replace(/:/g, '');
  const W = 1000, H = height, P = 8;
  const n = buckets.length;
  const max = useMemo(() => {
    const m: Record<string, number> = { left: 1, right: 1 };
    for (const s of series) {
      const nums = s.values.filter((v): v is number => v != null && Number.isFinite(v));
      if (nums.length) m[s.axis ?? 'left'] = Math.max(m[s.axis ?? 'left'], ...nums);
    }
    return m;
  }, [series]);
  const x = (i: number) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const y = (v: number, axis = 'left') => H - 24 - (v / max[axis]) * (H - 44);

  function segments(vals: Array<number | null>, axis?: string): [number, number][][] {
    const segs: [number, number][][] = [];
    let cur: [number, number][] = [];
    vals.forEach((v, i) => {
      if (v == null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push([x(i), y(v, axis)]);
    });
    if (cur.length) segs.push(cur);
    return segs;
  }

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 520));
    ro.observe(el);
    setNarrow(el.clientWidth < 520);
    return () => ro.disconnect();
  }, []);
  const step = Math.max(1, Math.ceil(n / (narrow ? 4 : 7)));
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
  const hoverHasValue = h !== null && series.some((s) => s.values[h] != null);
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
        onPointerDown={(e) => {
          touch.current = e.pointerType === 'touch';
          onMove(e.clientX);
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
        }}
        onPointerLeave={() => { if (!touch.current) setHover(null); }}
        onBlur={() => { if (!touch.current) setHover(null); }}
        onPointerUp={() => { /* keep the last point visible after a tap */ }}
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
              {k === 0 && segments(s.values, s.axis).map((seg, i) => (
                seg.length > 1
                  ? <path key={i} d={`${linear(seg)} L${seg[seg.length - 1][0]},${H - 24} L${seg[0][0]},${H - 24} Z`} fill={`url(#${gid}-${s.key})`} />
                  : null
              ))}
              {segments(s.values, s.axis).map((seg, i) => (
                seg.length > 1
                  ? <path key={i} d={linear(seg)} fill="none" stroke={s.color} strokeWidth={k === 0 || peers ? 2 : 1.5} strokeDasharray={k === 0 || peers ? undefined : '4 4'} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                  : null
              ))}
            </g>
          ))}
          {h !== null && <line x1={x(h)} x2={x(h)} y1="8" y2={H - 24} stroke="rgb(var(--line-strong))" vectorEffect="non-scaling-stroke" />}
        </svg>
        {series.map((s) => s.values.map((v, i) => (
          v == null ? null : (
            <span
              key={`${s.key}-${i}`}
              className="pointer-events-none absolute rounded-full"
              style={{
                left: `${(x(i) / W) * 100}%`,
                top: y(v, s.axis),
                width: hoverHasValue && h === i ? 10 : 6,
                height: hoverHasValue && h === i ? 10 : 6,
                background: s.color,
                border: '2px solid rgb(var(--surface))',
                transform: 'translate(-50%, -50%)',
                zIndex: hoverHasValue && h === i ? 2 : 1,
              }}
            />
          )
        )))}
        {h !== null && (
          <div className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
            style={{ left: `clamp(80px, ${(x(h) / W) * 100}%, calc(100% - 80px))` }} aria-live="polite">
            <div className="mb-1 font-semibold text-ink">{bucketLabel(buckets[h], granularity, true)}</div>
            {series.map((s) => {
              const v = s.values[h];
              const samples = s.samples ? s.samples[h] : null;
              return (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="tnum font-semibold text-right">
                    {v == null ? '—' : format(v)}
                    {s.samples && (
                      <span className="mt-0.5 block text-[11px] font-medium text-ink-4">
                        {samples ? `${samples} mesure${samples === 1 ? '' : 's'}` : 'Aucune mesure'}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5">
          {ticks.map((i) => (
            <span key={buckets[i]} className={`tnum absolute whitespace-nowrap text-[10px] text-ink-3 sm:text-[11px] ${i === 0 && n > 1 ? '' : i === n - 1 && n > 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: n > 1 && i === 0 ? 0 : n > 1 && i === n - 1 ? '100%' : `${(x(i) / W) * 100}%` }}>{bucketLabel(buckets[i], granularity)}</span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-ink-3">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}{s.axis === 'right' ? ' (échelle de droite)' : ''}</span>)}
      </div>
      <div className="sr-only"><table>
        <caption>Données du graphique</caption>
        <thead><tr><th>Période</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{buckets.map((b, i) => <tr key={b}><td>{bucketLabel(b, granularity, true)}</td>{series.map((s) => <td key={s.key}>{s.values[i] == null ? '—' : s.values[i]}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
  );
}

/** Straight segments so a real daily spike stays a spike, not a bell curve. */
function linear(p: [number, number][]): string {
  return p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}


import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { bucketLabel, fmtNumber } from '../lib/format';
import { evenIndices } from '../lib/chartTicks';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  axis?: 'left' | 'right';
  /** Optional sample counts shown in the tooltip (e.g. Web Vitals p75). */
  samples?: Array<number | null>;
}

function niceMax(n: number) {
  if (n <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(n));
  const m = n / exp;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * exp;
}

function linear(p: [number, number][]): string {
  return p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/**
 * Lean SVG chart: daily bars when the series is short, otherwise a line.
 * Hover tooltip, crosshair, keyboard ←/→, y-axis ticks in fr-FR, hidden data table.
 * Null values are gaps (0 is a real value).
 */
export function TrendChart({ buckets, granularity, series, height = 220, format = fmtNumber, peers = false, variant = 'auto' }: {
  buckets: string[]; granularity: string; series: TrendSeries[]; height?: number; format?: (n: number) => string;
  /** Series are equals (e.g. bot categories): all solid lines. Default: the first is primary, the others are dashed comparisons. */
  peers?: boolean;
  /** Daily series of ≤ 31 points default to bars; vitals and similar stay a line. */
  variant?: 'auto' | 'bar' | 'line';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef(false);
  const gid = useId().replace(/:/g, '');
  const [boxW, setBoxW] = useState(640);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setBoxW(Math.max(160, el.clientWidth));
      setNarrow(el.clientWidth < 520);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const n = buckets.length;
  const bars = variant === 'bar' || (variant === 'auto' && granularity === 'day' && n <= 31);
  const PAD = { l: 40, r: 16, t: 10, b: 24 };
  const W = boxW;
  const H = height;
  const innerW = Math.max(1, W - PAD.l - PAD.r);
  const innerH = Math.max(1, H - PAD.t - PAD.b);

  const max = useMemo(() => {
    const m: Record<string, number> = { left: 1, right: 1 };
    for (const s of series) {
      const nums = s.values.filter((v): v is number => v != null && Number.isFinite(v));
      if (nums.length) m[s.axis ?? 'left'] = Math.max(m[s.axis ?? 'left'], ...nums);
    }
    m.left = niceMax(m.left);
    m.right = niceMax(m.right);
    return m;
  }, [series]);

  const x = (i: number) => {
    if (n <= 1) return PAD.l + innerW / 2;
    if (bars) return PAD.l + (innerW / n) * (i + 0.5);
    return PAD.l + (i * innerW) / (n - 1);
  };
  const y = (v: number, axis = 'left') => PAD.t + innerH - (v / max[axis]) * innerH;
  const barW = bars ? Math.min(48, Math.max(10, (innerW / Math.max(n, 1)) * 0.58)) : 0;

  const yTicks = [0, 0.5, 1].map((f) => ({ v: max.left * f, y: y(max.left * f) }));

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

  const ticks = evenIndices(n, narrow ? 4 : 7);

  function onMove(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !n) return;
    const rel = clientX - r.left - PAD.l;
    if (bars) {
      const i = Math.min(n - 1, Math.max(0, Math.floor((rel / innerW) * n)));
      setHover(i);
      return;
    }
    const t = Math.min(1, Math.max(0, rel / innerW));
    setHover(Math.round(t * (n - 1)));
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
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity=".18" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {yTicks.map((t) => (
            <line key={t.v} x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="rgb(var(--line))" />
          ))}
          {!bars && series.map((s, k) => (
            <g key={s.key}>
              {k === 0 && segments(s.values, s.axis).map((seg, i) => (
                seg.length > 1
                  ? <path key={i} d={`${linear(seg)} L${seg[seg.length - 1][0]},${H - PAD.b} L${seg[0][0]},${H - PAD.b} Z`} fill={`url(#${gid}-${s.key})`} />
                  : null
              ))}
              {segments(s.values, s.axis).map((seg, i) => (
                seg.length > 1
                  ? <path key={i} d={linear(seg)} fill="none" stroke={s.color} strokeWidth={k === 0 || peers ? 2 : 1.5} strokeDasharray={k === 0 || peers ? undefined : '4 4'} strokeLinejoin="round" strokeLinecap="round" />
                  : null
              ))}
            </g>
          ))}
          {bars && series.map((s, k) => {
            const inset = k * 4;
            const w = Math.max(6, barW - inset * 2);
            return (
              <g key={s.key}>
                {s.values.map((v, i) => {
                  if (v == null) return null;
                  const bh = Math.max(v > 0 ? 2 : 0, (H - PAD.b) - y(v, s.axis));
                  const cx = x(i) - w / 2 + inset;
                  const active = hoverHasValue && h === i;
                  return (
                    <rect
                      key={i}
                      x={cx}
                      y={y(v, s.axis)}
                      width={w}
                      height={bh}
                      rx={3}
                      fill={s.color}
                      opacity={k === 0 ? (active ? 1 : 0.9) : 0.35}
                    />
                  );
                })}
              </g>
            );
          })}
          {h !== null && <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--line-strong))" />}
        </svg>
        {yTicks.map((t) => (
          <span
            key={t.v}
            className="pointer-events-none absolute right-auto tnum text-[10px] text-ink-3"
            style={{ left: 0, top: t.y, width: PAD.l - 6, transform: t.v === 0 ? 'translateY(-2px)' : 'translateY(-50%)', textAlign: 'right' }}
          >
            {fmtNumber(t.v)}
          </span>
        ))}
        {!bars && series.map((s) => s.values.map((v, i) => (
          v == null ? null : (
            <span
              key={`${s.key}-${i}`}
              className="pointer-events-none absolute rounded-full"
              style={{
                left: x(i),
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
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
            style={{ left: `clamp(${PAD.l + 80}px, ${x(h)}px, calc(100% - 80px))` }}
            aria-live="polite"
          >
            <div className="mb-1 font-semibold text-ink">{bucketLabel(buckets[h], granularity, true)}</div>
            {series.map((s) => {
              const v = s.values[h];
              const samples = s.samples ? s.samples[h] : null;
              return (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-ink-3"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="tnum text-right font-semibold">
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
          {ticks.map((i) => {
            const first = i === 0 && n > 1;
            const last = i === n - 1 && n > 1;
            return (
              <span
                key={buckets[i]}
                className={`tnum absolute whitespace-nowrap text-[10px] text-ink-3 sm:text-[11px] ${first ? '' : last ? '-translate-x-full' : '-translate-x-1/2'}`}
                style={{ left: first ? PAD.l : last ? W - 2 : x(i) }}
              >
                {bucketLabel(buckets[i], granularity)}
              </span>
            );
          })}
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

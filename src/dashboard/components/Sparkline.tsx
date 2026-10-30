/** Tiny dependency-free SVG sparkline (area + line). */
export function Sparkline({ data, className = 'text-visitors', height = 36, width = 120 }: { data: number[]; className?: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `sp-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={`${className} block w-full`} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Trend({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="pill bg-stone-100 text-stone-400">—</span>;
  const pct = (cur - prev) / prev;
  if (!Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const flat = Math.abs(pct) < 0.005;
  return (
    <span
      className={`pill ${flat ? 'bg-stone-100 text-stone-500' : good ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}
      title="vs période précédente"
    >
      {flat ? '•' : up ? '▲' : '▼'} {Math.abs(pct) < 0.1 ? Math.abs(pct * 100).toFixed(1) : Math.round(Math.abs(pct * 100))}%
    </span>
  );
}

export function LiveDot({ on = true }: { on?: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {on && <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-emerald-400 opacity-60" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-stone-300'}`} />
    </span>
  );
}

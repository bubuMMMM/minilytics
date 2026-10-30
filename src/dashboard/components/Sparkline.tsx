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
  if (!prev) return null;
  const pct = (cur - prev) / prev;
  if (!Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const flat = Math.abs(pct) < 0.005;
  const v = Math.abs(pct) < 0.1 ? Math.abs(pct * 100).toFixed(1).replace('.', ',') : String(Math.round(Math.abs(pct * 100)));
  return (
    <span className={`tnum inline-flex items-center gap-0.5 text-[12px] font-medium ${flat ? 'text-ink-3' : good ? 'text-success' : 'text-danger'}`} title="vs période précédente">
      {!flat && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={up ? '' : 'rotate-180'}><path d="M5 2 8.5 7h-7L5 2Z" fill="currentColor" /></svg>}
      {flat ? '0' : (up ? '+' : '−') + v}&nbsp;%
      <span className="sr-only">par rapport à la période précédente</span>
    </span>
  );
}

export function LiveDot({ on = true }: { on?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {on && <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-success opacity-60" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${on ? 'bg-success' : 'bg-line-strong'}`} />
    </span>
  );
}

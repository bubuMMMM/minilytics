import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Logo } from '../components/Logo';

type NodeDef = { id: string; label: string; mark: string; color: string };
type Side = 'left' | 'right' | 'top' | 'bottom';

const SOURCES: NodeDef[] = [
  { id: 'google', label: 'Google', mark: 'G', color: '#4285F4' },
  { id: 'x', label: 'X', mark: '𝕏', color: '#171717' },
  { id: 'chatgpt', label: 'ChatGPT', mark: 'C', color: '#10A37F' },
  { id: 'news', label: 'Newsletter', mark: '@', color: '#2563EB' },
  { id: 'direct', label: 'Direct', mark: '→', color: '#64748B' },
  { id: 'reddit', label: 'Reddit', mark: 'R', color: '#FF4500' },
];

const PAYMENTS: NodeDef[] = [
  { id: 'stripe', label: 'Stripe', mark: 'S', color: '#635BFF' },
  { id: 'lemon', label: 'Lemon Squeezy', mark: 'L', color: '#FFC233' },
  { id: 'polar', label: 'Polar', mark: 'P', color: '#0062FF' },
];

export function LandingBeams() {
  const box = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const rev = useRef<HTMLDivElement>(null);
  const srcRefs = useRef<(HTMLDivElement | null)[]>([]);
  const payRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(true); }, []);

  return (
    <section id="attribution" aria-labelledby="attr-title" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-[760px] text-center">
          <p className="ml-feat-badge mx-auto">Attribution des revenus</p>
          <h2 id="attr-title" className="ml-feat-title mt-5 text-[clamp(1.85rem,5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-ink [text-wrap:balance]">
            Des sources au paiement, le chemin est visible.
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[17px]">
            Google, 𝕏, ChatGPT ou une newsletter : chaque conversion est rattachée à son canal, puis à Stripe, Polar ou Lemon Squeezy.
          </p>
        </div>

        <p className="sr-only">
          Schéma illustratif : les sources Google, 𝕏, ChatGPT, Newsletter, Direct et Reddit rejoignent Minilytics, puis les paiements Stripe, Lemon Squeezy et Polar, jusqu’aux revenus.
        </p>

        <div ref={box} className="ml-beam-board relative mx-auto mt-10 max-w-[920px] lg:mt-14">
          <div className="ml-beam-grid">
            <ul className="ml-beam-col ml-beam-sources">
              {SOURCES.map((n, i) => (
                <li key={n.id}>
                  <BeamNode def={n} ref={(el) => { srcRefs.current[i] = el; }} />
                </li>
              ))}
            </ul>

            <div className="ml-beam-hub flex items-center justify-center">
              <div ref={mid} className="ml-beam-center">
                <Logo small />
              </div>
            </div>

            <ul className="ml-beam-col ml-beam-pays">
              {PAYMENTS.map((n, i) => (
                <li key={n.id}>
                  <BeamNode def={n} ref={(el) => { payRefs.current[i] = el; }} />
                </li>
              ))}
            </ul>

            <div className="ml-beam-rev flex items-center justify-center">
              <div ref={rev} className="ml-beam-revenue">
                <span className="tnum text-[22px] font-semibold tracking-tight text-accent">€</span>
                <span className="text-[13px] font-medium text-ink">Revenus</span>
              </div>
            </div>
          </div>

          {ready && (
            <div className="ml-beam-lines" aria-hidden>
              {SOURCES.map((n, i) => (
                <AnimatedBeam
                  key={`s-${n.id}`}
                  containerRef={box}
                  fromRef={refAt(srcRefs, i)}
                  toRef={mid}
                  fromAt={0.5}
                  toAt={(i + 1) / (SOURCES.length + 1)}
                  delay={i * 0.16}
                  duration={4.2 + (i % 3) * 0.35}
                />
              ))}
              {PAYMENTS.map((n, i) => (
                <AnimatedBeam
                  key={`p-${n.id}`}
                  containerRef={box}
                  fromRef={mid}
                  toRef={refAt(payRefs, i)}
                  fromAt={(i + 1) / (PAYMENTS.length + 1)}
                  toAt={0.5}
                  delay={0.35 + i * 0.18}
                  duration={4 + i * 0.2}
                />
              ))}
              {PAYMENTS.map((n, i) => (
                <AnimatedBeam
                  key={`r-${n.id}`}
                  containerRef={box}
                  fromRef={refAt(payRefs, i)}
                  toRef={rev}
                  fromAt={0.5}
                  toAt={(i + 1) / (PAYMENTS.length + 1)}
                  delay={0.8 + i * 0.14}
                  duration={3.7}
                />
              ))}
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[12px] text-ink-3">Exemple illustratif du parcours d’attribution, pas des paiements en direct.</p>
      </div>
    </section>
  );
}

function refAt(bucket: { current: (HTMLDivElement | null)[] }, i: number): RefObject<HTMLElement | null> {
  return {
    get current() { return bucket.current[i] ?? null; },
  };
}

const BeamNode = forwardRef<HTMLDivElement, { def: NodeDef }>(function BeamNode({ def }, ref) {
  const darkMark = def.id === 'lemon';
  return (
    <div ref={ref} className="ml-beam-node">
      <span className="ml-beam-mark" style={{ background: def.color, color: darkMark ? '#111' : '#fff' }} aria-hidden>
        {def.mark}
      </span>
      <span className="ml-beam-label">{def.label}</span>
    </div>
  );
});

/** Adapted from 21st.dev / Magic UI Animated Beam (dillionverma, id 919), without motion/framer-motion.
 *  Paths leave and arrive on the inner edge of each node (not through the card). */
function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  fromAt = 0.5,
  toAt = 0.5,
  delay = 0,
  duration = 5,
}: {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  fromAt?: number;
  toAt?: number;
  delay?: number;
  duration?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const [path, setPath] = useState({ d: '', w: 0, h: 0, sx: 0, sy: 0, ex: 0, ey: 0 });
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const update = () => {
      const container = containerRef.current, a = fromRef.current, b = toRef.current;
      if (!container || !a || !b) return;
      const cr = container.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const desktop = window.matchMedia('(min-width: 768px)').matches;
      const from = pickSide(ar, br, desktop);
      const to = opposite(from);
      const start = edgePoint(ar, cr, from, fromAt);
      const end = edgePoint(br, cr, to, toAt);
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      const pull = Math.max(28, Math.min(90, dist * 0.45));
      const c1 = pullPoint(start, from, pull);
      const c2 = pullPoint(end, to, pull);
      setPath({
        d: `M ${start.x},${start.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`,
        w: cr.width,
        h: cr.height,
        sx: start.x,
        sy: start.y,
        ex: end.x,
        ey: end.y,
      });
    };
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    if (fromRef.current) ro.observe(fromRef.current);
    if (toRef.current) ro.observe(toRef.current);
    window.addEventListener('resize', update);
    update();
    const t = window.setTimeout(update, 60);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); clearTimeout(t); };
  }, [containerRef, fromRef, toRef, fromAt, toAt]);

  if (!path.d || path.w === 0) return null;
  const style = { '--ml-beam-dur': `${duration}s`, '--ml-beam-delay': `${delay}s` } as CSSProperties;

  return (
    <svg
      fill="none"
      width={path.w}
      height={path.h}
      viewBox={`0 0 ${path.w} ${path.h}`}
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <path d={path.d} stroke="rgb(var(--accent) / .28)" strokeWidth={3} strokeLinecap="round" />
      <path d={path.d} stroke="rgb(var(--accent) / .55)" strokeWidth={2} strokeLinecap="round" />
      <path d={path.d} stroke={`url(#${gid})`} strokeWidth={3} strokeLinecap="round" pathLength={1} className={reduce ? undefined : 'ml-beam-glow'} style={style} />
      <circle cx={path.sx} cy={path.sy} r="5" fill="rgb(var(--accent) / .28)" />
      <circle cx={path.ex} cy={path.ey} r="5" fill="rgb(var(--accent) / .28)" />
      <circle cx={path.sx} cy={path.sy} r="2.4" fill="rgb(var(--accent))" />
      <circle cx={path.ex} cy={path.ey} r="2.4" fill="rgb(var(--accent))" />
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          <stop offset="30%" stopColor="#BFDBFE" />
          <stop offset="55%" stopColor="rgb(var(--accent))" />
          <stop offset="100%" stopColor="#BFDBFE" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function pickSide(from: DOMRect, to: DOMRect, desktop: boolean): Side {
  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  if (desktop) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function opposite(side: Side): Side {
  return side === 'right' ? 'left' : side === 'left' ? 'right' : side === 'bottom' ? 'top' : 'bottom';
}

function edgePoint(rect: DOMRect, container: DOMRect, side: Side, t = 0.5) {
  const x = rect.left - container.left;
  const y = rect.top - container.top;
  const u = Math.min(0.86, Math.max(0.14, t));
  if (side === 'right') return { x: x + rect.width, y: y + rect.height * u };
  if (side === 'left') return { x, y: y + rect.height * u };
  if (side === 'bottom') return { x: x + rect.width * u, y: y + rect.height };
  return { x: x + rect.width * u, y };
}

function pullPoint(pt: { x: number; y: number }, side: Side, pull: number) {
  if (side === 'right') return { x: pt.x + pull, y: pt.y };
  if (side === 'left') return { x: pt.x - pull, y: pt.y };
  if (side === 'bottom') return { x: pt.x, y: pt.y + pull };
  return { x: pt.x, y: pt.y - pull };
}

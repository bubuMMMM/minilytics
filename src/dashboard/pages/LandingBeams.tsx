import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Logo } from '../components/Logo';

type NodeDef = { id: string; label: string; mark: string; color: string };

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

const SOURCE_CURVE = [-86, -52, -18, 18, 52, 86];
const PAY_CURVE = [-48, 0, 48];

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
            <>
              {SOURCES.map((n, i) => (
                <AnimatedBeam
                  key={`s-${n.id}`}
                  containerRef={box}
                  fromRef={refAt(srcRefs, i)}
                  toRef={mid}
                  curvature={SOURCE_CURVE[i]}
                  delay={i * 0.18}
                  duration={4.2 + (i % 3) * 0.4}
                />
              ))}
              {PAYMENTS.map((n, i) => (
                <AnimatedBeam
                  key={`p-${n.id}`}
                  containerRef={box}
                  fromRef={mid}
                  toRef={refAt(payRefs, i)}
                  curvature={PAY_CURVE[i]}
                  delay={0.4 + i * 0.2}
                  duration={4 + i * 0.25}
                />
              ))}
              {PAYMENTS.map((n, i) => (
                <AnimatedBeam
                  key={`r-${n.id}`}
                  containerRef={box}
                  fromRef={refAt(payRefs, i)}
                  toRef={rev}
                  curvature={i === 0 ? 40 : i === 2 ? -40 : 0}
                  delay={0.9 + i * 0.15}
                  duration={3.8}
                />
              ))}
            </>
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

/** Adapted from 21st.dev / Magic UI Animated Beam (dillionverma, id 919), without motion/framer-motion. */
function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  delay = 0,
  duration = 5,
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  delay?: number;
  duration?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const [pathD, setPathD] = useState('');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const update = () => {
      const container = containerRef.current, a = fromRef.current, b = toRef.current;
      if (!container || !a || !b) return;
      const cr = container.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const startX = ar.left - cr.left + ar.width / 2 + startXOffset;
      const startY = ar.top - cr.top + ar.height / 2 + startYOffset;
      const endX = br.left - cr.left + br.width / 2 + endXOffset;
      const endY = br.top - cr.top + br.height / 2 + endYOffset;
      const dx = endX - startX;
      const dy = endY - startY;
      let d: string;
      if (Math.abs(dy) > Math.abs(dx) * 0.85) {
        const cx = (startX + endX) / 2 + curvature;
        const cy = (startY + endY) / 2;
        d = `M ${startX},${startY} Q ${cx},${cy} ${endX},${endY}`;
      } else {
        const cx = (startX + endX) / 2;
        const cy = (startY + endY) / 2 - curvature;
        d = `M ${startX},${startY} Q ${cx},${cy} ${endX},${endY}`;
      }
      setPathD(d);
      setBox({ w: cr.width, h: cr.height });
    };
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    update();
    const t = window.setTimeout(update, 50);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [containerRef, fromRef, toRef, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  if (!pathD || box.w === 0) return null;
  const style = { '--ml-beam-dur': `${duration}s`, '--ml-beam-delay': `${delay}s` } as CSSProperties;

  return (
    <svg
      fill="none"
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
      className="pointer-events-none absolute inset-0 overflow-visible"
      aria-hidden
    >
      <path d={pathD} stroke="rgb(var(--ink-3))" strokeWidth={1.6} strokeOpacity={0.45} strokeLinecap="round" />
      <path d={pathD} stroke={`url(#${gid})`} strokeWidth={2.4} strokeLinecap="round" pathLength={1} className={reduce ? undefined : 'ml-beam-glow'} style={style} />
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          <stop offset="35%" stopColor="rgb(var(--accent))" />
          <stop offset="70%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}


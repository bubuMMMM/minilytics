import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Link } from '../components/Link';
import { UiIcon } from '../components/UiIcon';

/** Fictional landing visitors (not live stats). Shared with the WebGL canvas. */
export const LIVE_VISITS = [
  { face: '🐨', name: 'Panda calme', city: 'Paris', region: 'France', flag: '🇫🇷', source: 'Google', page: '/tarifs', lat: 48.8566, lon: 2.3522, size: 0.08 },
  { face: '🦊', name: 'Renard vif', city: 'Lisbonne', region: 'Portugal', flag: '🇵🇹', source: '𝕏', page: '/', lat: 38.7223, lon: -9.1393, size: 0.07 },
  { face: '🦦', name: 'Loutre curieuse', city: 'Montréal', region: 'Canada', flag: '🇨🇦', source: 'Newsletter', page: '/blog', lat: 45.5019, lon: -73.5674, size: 0.07 },
  { face: '🦉', name: 'Hibou nocturne', city: 'Tokyo', region: 'Japon', flag: '🇯🇵', source: 'ChatGPT', page: '/docs', lat: 35.6762, lon: 139.6503, size: 0.08 },
  { face: '🐯', name: 'Tigre pressé', city: 'São Paulo', region: 'Brésil', flag: '🇧🇷', source: 'Direct', page: '/', lat: -23.5505, lon: -46.6333, size: 0.08 },
  { face: '🐧', name: 'Pingouin sage', city: 'Le Cap', region: 'Afrique du Sud', flag: '🇿🇦', source: 'Reddit', page: '/tarifs', lat: -33.9249, lon: 18.4241, size: 0.06 },
] as const;

export const EXTRA_MARKERS: { lat: number; lon: number; size: number }[] = [
  { lat: 40.7128, lon: -74.006, size: 0.05 },
  { lat: 51.5074, lon: -0.1278, size: 0.05 },
  { lat: 19.076, lon: 72.8777, size: 0.05 },
  { lat: -33.8688, lon: 151.2093, size: 0.05 },
  { lat: 6.5244, lon: 3.3792, size: 0.05 },
  { lat: 52.52, lon: 13.405, size: 0.04 },
  { lat: 1.3521, lon: 103.8198, size: 0.04 },
];

/** Great-circle arcs between example cities (index into LIVE_VISITS). */
export const LIVE_ARCS: [number, number][] = [[0, 1], [0, 3], [2, 0], [3, 4], [4, 5], [1, 2]];

const GlobeCanvas = lazy(() => import('./LandingGlobeCanvas'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function LandingLiveGlobe() {
  return (
    <section id="en-direct" aria-labelledby="live-title" className="relative scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[760px] text-center">
          <p className="ml-feat-badge">
            <span className="ml-dot-live" aria-hidden />
            Carte en direct
          </p>
          <h2 id="live-title" className="ml-feat-title mt-5 text-[clamp(1.85rem,5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-ink [text-wrap:balance]">
            En direct, partout dans le monde.
          </h2>
          <p className="mx-auto mt-4 max-w-[54ch] text-[15px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[17px]">
            Chaque visite apparaît sur le globe, avec la ville, le canal et la page. Faites glisser pour tourner — les chiffres ci-dessous sont un exemple illustratif.
          </p>
        </div>
        <GlobeStage />
        <p className="mt-5 text-center text-[12px] text-ink-3">
          Exemple illustratif, pas des visiteurs en direct.{' '}
          <Link href="/demo/map" className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-ink hover:text-accent">Ouvrir la carte de la démo <UiIcon name="arrow-right" size={13} /></Link>
        </p>
      </div>
    </section>
  );
}

function GlobeStage() {
  const host = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  const [use3d, setUse3d] = useState(false);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setLoad(true); io.disconnect(); }
    }, { rootMargin: '240px 0px' });
    io.observe(el);
    if (reduce || !hasWebGL()) setUse3d(false);
    else setUse3d(true);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setIdx((n) => (n + 1) % LIVE_VISITS.length), 3200);
    return () => clearInterval(t);
  }, []);

  const cardA = LIVE_VISITS[idx];
  const cardB = LIVE_VISITS[(idx + 1) % LIVE_VISITS.length];
  const show3d = load && use3d;

  return (
    <div className="relative mx-auto mt-10 max-w-[1080px] lg:mt-14">
      <p className="sr-only">
        Exemple illustratif d’un globe : des visiteurs à Paris, Lisbonne, Montréal, Tokyo, São Paulo et Le Cap, chacun avec un canal et une page.
      </p>
      <div className="pointer-events-none absolute left-0 top-[18%] hidden w-[240px] lg:block">
        <VisitCard visit={cardA} side="left" />
      </div>
      <div className="pointer-events-none absolute right-0 top-[28%] hidden w-[240px] lg:block">
        <VisitCard visit={cardB} side="right" />
      </div>

      <div ref={host} className="ml-globe-stage relative mx-auto aspect-square w-full max-w-[min(100%,560px)]">
        <GlobeFallback className={ready ? 'opacity-0' : 'opacity-100'} />
        {show3d && (
          <Suspense fallback={null}>
            <GlobeCanvas onReady={() => setReady(true)} />
          </Suspense>
        )}
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[2] -translate-x-1/2 rounded-full border border-line bg-surface/90 px-3 py-1 text-[12px] font-medium text-ink-2 shadow-xs backdrop-blur-sm">
          <span className="ml-dot-live mr-1.5 inline-block align-middle" />
          6 en ligne · exemple
        </div>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[560px] lg:hidden">
        <VisitCard visit={cardA} side="left" />
      </div>
    </div>
  );
}

function VisitCard({ visit, side }: { visit: (typeof LIVE_VISITS)[number]; side: 'left' | 'right' }) {
  return (
    <div key={visit.name} className={`ml-feat-pop pointer-events-none rounded-xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur-sm ${side === 'right' ? 'lg:ml-auto' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-well text-[17px]" aria-hidden>{visit.face}</span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink">{visit.name}</div>
          <div className="truncate text-[12px] text-ink-3">{visit.flag} {visit.city} · {visit.source}</div>
        </div>
      </div>
      <div className="mt-2 truncate font-mono text-[11px] text-ink-3">{visit.page}</div>
    </div>
  );
}

/** Static dotted globe shown for reduced-motion, no-WebGL, or while the canvas loads. */
export function GlobeFallback({ className = '' }: { className?: string }) {
  const phi = 2.15;
  const theta = 0.32;
  const dots: { x: number; y: number; o: number }[] = [];
  const N = 420;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const thetaF = Math.PI * (3 - Math.sqrt(5)) * i;
    const x = Math.cos(thetaF) * r;
    const z = Math.sin(thetaF) * r;
    const h = toCamera([x, y, z], phi, theta);
    if (h[2] <= 0) continue;
    const p = toPixel(h, 200, 200);
    dots.push({ x: p.x, y: p.y, o: Math.min(1, 0.25 + h[2]) });
  }
  const cities = [...LIVE_VISITS, ...EXTRA_MARKERS.map((m) => ({ lat: m.lat, lon: m.lon }))].map((m) => {
    const h = toCamera(worldFromLatLng(m.lat, m.lon), phi, theta);
    return { ...toPixel(h, 200, 200), front: h[2] > 0.05 };
  });
  return (
    <svg viewBox="0 0 200 200" className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${className}`} aria-hidden>
      <defs>
        <radialGradient id="ml-globe-fb-glow" cx="50%" cy="46%" r="48%">
          <stop offset="60%" stopColor="rgb(var(--accent) / .16)" />
          <stop offset="100%" stopColor="rgb(var(--accent) / 0)" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="84" fill="url(#ml-globe-fb-glow)" />
      <circle cx="100" cy="100" r="76" fill="rgb(var(--surface))" stroke="rgb(var(--line))" strokeWidth="0.8" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="0.7" fill="rgb(var(--ink))" opacity={0.22 * d.o} />
      ))}
      {cities.filter((c) => c.front).map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r="2.4" fill="rgb(var(--accent) / .28)" />
          <circle cx={c.x} cy={c.y} r="1.3" fill="rgb(var(--accent))" />
        </g>
      ))}
    </svg>
  );
}

export function worldFromLatLng(lat: number, lon: number): [number, number, number] {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180 - Math.PI;
  const c = Math.cos(φ);
  return [-c * Math.cos(λ), Math.sin(φ), c * Math.sin(λ)];
}

/** Camera-space point, matching cobe's L(theta, phi) * world. */
export function toCamera(world: [number, number, number], phi: number, theta: number): [number, number, number] {
  const d = Math.cos(phi), f = Math.sin(phi), c = Math.cos(theta), e = Math.sin(theta);
  const [x, y, z] = world;
  return [
    d * x + f * z,
    f * e * x + c * y - d * e * z,
    -f * c * x + e * y + d * c * z,
  ];
}

export function toPixel(h: [number, number, number], w: number, height: number) {
  const r = 0.8;
  return { x: ((h[0] * r + 1) / 2) * w, y: ((1 - h[1] * r) / 2) * height };
}


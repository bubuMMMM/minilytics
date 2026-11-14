import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { Link } from '../components/Link';
import { SourceIcon } from '../components/Icons';
import { UiIcon } from '../components/UiIcon';
import { fmtMoney } from '../lib/format';

/** Fictional landing visitors (not live stats). Shared with the WebGL canvas. */
export const LIVE_VISITS = [
  { face: '🐨', name: 'Panda calme', city: 'Paris', region: 'France', flag: '🇫🇷', source: 'Google', sourceLabel: 'Google', page: '/tarifs', lat: 48.8566, lon: 2.3522, size: 0.12, ago: 2, revenue: 2400, currency: 'EUR' },
  { face: '🦊', name: 'Renard vif', city: 'Lisbonne', region: 'Portugal', flag: '🇵🇹', source: 'X', sourceLabel: '𝕏', page: '/blog', lat: 38.7223, lon: -9.1393, size: 0.11, ago: 8, revenue: 0, currency: 'EUR' },
  { face: '🦦', name: 'Loutre curieuse', city: 'Montréal', region: 'Canada', flag: '🇨🇦', source: 'Newsletter', sourceLabel: 'Newsletter', page: '/docs', lat: 45.5019, lon: -73.5674, size: 0.11, ago: 14, revenue: 0, currency: 'EUR' },
  { face: '🦉', name: 'Hibou nocturne', city: 'Londres', region: 'Royaume-Uni', flag: '🇬🇧', source: 'ChatGPT', sourceLabel: 'ChatGPT', page: '/blog', lat: 51.5074, lon: -0.1278, size: 0.11, ago: 21, revenue: 0, currency: 'EUR' },
  { face: '🐯', name: 'Tigre pressé', city: 'São Paulo', region: 'Brésil', flag: '🇧🇷', source: 'Direct', sourceLabel: 'Accès direct', page: '/inscription', lat: -23.5505, lon: -46.6333, size: 0.12, ago: 27, revenue: 900, currency: 'EUR' },
  { face: '🐧', name: 'Pingouin sage', city: 'Le Cap', region: 'Afrique du Sud', flag: '🇿🇦', source: 'Reddit', sourceLabel: 'Reddit', page: '/tarifs', lat: -33.9249, lon: 18.4241, size: 0.1, ago: 35, revenue: 0, currency: 'EUR' },
] as const;

export const ONLINE_COUNT = LIVE_VISITS.length;

/** Great-circle arcs between example cities (index into LIVE_VISITS). */
export const LIVE_ARCS: [number, number][] = [[0, 1], [0, 3], [2, 0], [1, 4], [0, 5], [2, 3]];

/** Atlantic / Western Europe facing the camera (Paris, Lisbonne, Montréal). */
export const GLOBE_PHI = (3 * Math.PI) / 2 - (-15 * Math.PI) / 180;
export const GLOBE_THETA = 0.28;

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
    const t = window.setInterval(() => setIdx((n) => (n + 1) % LIVE_VISITS.length), 3800);
    return () => clearInterval(t);
  }, []);

  const n = LIVE_VISITS.length;
  const desktopCards = [0, 1, 2, 3].map((offset) => LIVE_VISITS[(idx + offset) % n]);
  const mobileCard = LIVE_VISITS[idx];
  const show3d = load && use3d;

  return (
    <div className="ml-globe-layout relative mx-auto mt-10 max-w-[1120px] lg:mt-14">
      <p className="sr-only">
        Exemple illustratif d’un globe : des visiteurs à Paris, Lisbonne, Montréal, Londres, São Paulo et Le Cap, chacun avec un canal et une page.
      </p>

      <div className="ml-globe-col hidden lg:flex">
        <VisitCard key={desktopCards[0].name} visit={desktopCards[0]} />
        <VisitCard key={desktopCards[1].name} visit={desktopCards[1]} />
      </div>

      <div className="ml-globe-center">
        <div ref={host} className="ml-globe-stage relative mx-auto aspect-square w-full max-w-[min(100%,500px)]">
          <GlobeFallback className={ready ? 'opacity-0' : 'opacity-100'} />
          {show3d && (
            <Suspense fallback={null}>
              <GlobeCanvas onReady={() => setReady(true)} />
            </Suspense>
          )}
        </div>
        <div className="ml-globe-pill">
          <span className="ml-dot-live" aria-hidden />
          {ONLINE_COUNT} en ligne · exemple
        </div>
      </div>

      <div className="ml-globe-col hidden lg:flex">
        <VisitCard key={desktopCards[2].name} visit={desktopCards[2]} />
        <VisitCard key={desktopCards[3].name} visit={desktopCards[3]} />
      </div>

      <div className="ml-globe-mobile lg:hidden">
        <VisitCard key={mobileCard.name} visit={mobileCard} />
      </div>
    </div>
  );
}

function VisitCard({ visit }: { visit: (typeof LIVE_VISITS)[number] }) {
  return (
    <article className="ml-globe-visit ml-globe-visit-swap pointer-events-none">
      <div className="flex items-start gap-2.5">
        <span className="relative shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-well text-[17px]" aria-hidden>{visit.face}</span>
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface text-[13px] leading-none" aria-hidden>{visit.flag}</span>
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-surface" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-[13px] font-semibold text-ink">{visit.name}</div>
            <div className="tnum shrink-0 text-[11px] text-ink-4">il y a {visit.ago} s</div>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-3">{visit.city}, {visit.region}</div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px] text-ink-2">
        <dt className="text-ink-4">Page</dt>
        <dd className="min-w-0 truncate font-mono text-[11px]">{visit.page}</dd>
        <dt className="text-ink-4">Source</dt>
        <dd className="flex min-w-0 items-center gap-1.5">
          {visit.source === 'Newsletter'
            ? <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] leading-none" aria-hidden>✉️</span>
            : <SourceIcon source={visit.source} size={14} />}
          <span className="truncate">{visit.sourceLabel}</span>
        </dd>
      </dl>
      {visit.revenue > 0 && (
        <div className="mt-2">
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{fmtMoney(visit.revenue, visit.currency, 2)}</span>
        </div>
      )}
    </article>
  );
}

/** Static dotted globe shown for reduced-motion, no-WebGL, or while the canvas loads. */
export function GlobeFallback({ className = '' }: { className?: string }) {
  const phi = GLOBE_PHI;
  const theta = GLOBE_THETA;
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
  const cities = LIVE_VISITS.map((m) => {
    const h = toCamera(worldFromLatLng(m.lat, m.lon), phi, theta);
    return { ...toPixel(h, 200, 200), front: h[2] > 0.05 };
  });
  return (
    <svg viewBox="0 0 200 200" className={`absolute inset-[6%] transition-opacity duration-500 ${className}`} aria-hidden>
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
          <circle cx={c.x} cy={c.y} r="3.2" fill="rgb(var(--accent) / .28)" />
          <circle cx={c.x} cy={c.y} r="1.6" fill="rgb(var(--accent))" />
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

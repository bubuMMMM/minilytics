import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../components/Link';
import { UiIcon } from '../components/UiIcon';
import { VisitorCard } from '../components/VisitorCard';
import { EXAMPLE_TZ, exampleActivity, exampleVisits } from './landingLiveExample';

const LiveGlobe = lazy(() => import('../components/LiveGlobe').then((m) => ({ default: m.LiveGlobe })));

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
  const seenIds = useRef(new Set<string>());
  const [load, setLoad] = useState(false);
  const [idx, setIdx] = useState(0);
  const visits = useMemo(() => exampleVisits(), []);
  const activity = useMemo(() => exampleActivity(), []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setLoad(true); io.disconnect(); }
    }, { rootMargin: '240px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!load) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setIdx((n) => (n + 1) % visits.length), 3800);
    return () => clearInterval(t);
  }, [load, visits.length]);

  const n = visits.length;
  const desktopCards = [0, 1, 2].map((offset) => visits[(idx + offset) % n]);
  const mobileCard = visits[idx];
  useEffect(() => {
    for (const visit of desktopCards) seenIds.current.add(visit.id);
    seenIds.current.add(mobileCard.id);
  });
  const enterClass = (id: string) => (seenIds.current.has(id) ? '' : 'ml-globe-visit-swap');

  const aside = (
    <div className="flex flex-col gap-3">
      <div className="hidden md:flex flex-col gap-3">
        {desktopCards.map((visit) => (
          <div key={visit.id} className={'pointer-events-none ' + enterClass(visit.id)}>
            <VisitorCard visit={visit} tz={EXAMPLE_TZ} />
          </div>
        ))}
      </div>
      <div className="md:hidden pointer-events-none">
        <div key={mobileCard.id} className={enterClass(mobileCard.id)}>
          <VisitorCard visit={mobileCard} tz={EXAMPLE_TZ} />
        </div>
      </div>
    </div>
  );

  return (
    <div ref={host} className="relative mx-auto mt-10 max-w-[1120px] lg:mt-14">
      <p className="sr-only">
        Exemple illustratif d’un globe : des visiteurs à Paris, Lisbonne, Montréal, Londres, São Paulo et Le Cap, chacun avec un canal et une page.
      </p>
      {load ? (
        <Suspense fallback={<LiveGlobePlaceholder />}>
          <LiveGlobe
            example={activity}
            exampleLabel
            aside={aside}
            className="mt-0"
          />
        </Suspense>
      ) : (
        <LiveGlobePlaceholder />
      )}
    </div>
  );
}

function LiveGlobePlaceholder() {
  return (
    <div className="ml-bento relative overflow-hidden text-ink" aria-hidden>
      <div className="relative flex flex-wrap items-start justify-between gap-4 px-4 pt-4 sm:px-5 sm:pt-5">
        <div>
          <div className="ml-kicker">Carte en direct</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Vos visiteurs dans le monde</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-3">D’où viennent vos visiteurs. Chaque point est un pays, jamais une position précise.</p>
        </div>
        <div className="text-right">
          <div className="text-[12px] text-ink-3">Actifs · 5 min · exemple</div>
          <div className="mt-0.5 flex items-center justify-end gap-2 text-2xl font-semibold tabular-nums"><span className="h-2 w-2 rounded-full bg-success" />6</div>
        </div>
      </div>
      <div className="relative min-w-0">
        <svg viewBox="0 0 720 500" className="block w-full" aria-hidden>
          <defs>
            <radialGradient id="ml-live-ph-glow" cx="48%" cy="49%" r="48%">
              <stop offset="40%" stopColor="rgb(var(--accent) / .06)" />
              <stop offset="100%" stopColor="rgb(var(--accent) / 0)" />
            </radialGradient>
            <radialGradient id="ml-live-ph-ocean" cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="rgb(var(--surface))" />
              <stop offset="65%" stopColor="rgb(var(--well))" />
              <stop offset="100%" stopColor="rgb(var(--line))" />
            </radialGradient>
          </defs>
          <rect width="720" height="500" fill="url(#ml-live-ph-glow)" />
          <circle cx="346" cy="246" r="205" fill="url(#ml-live-ph-ocean)" stroke="rgb(var(--line-strong))" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

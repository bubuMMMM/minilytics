import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as REPointer, type ReactNode } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { UiIcon, type UiIconName } from '../components/UiIcon';
import { NumberTicker } from '../components/NumberTicker';

const LandingBentoLive = lazy(() => import('./LandingBentoLive'));

const INSTALL = '<script defer data-website-id="VOTRE_ID" src="https://minilytics-six.vercel.app/js/script.js"></script>';

/** Premium bento of real product features. Preview figures are illustrative examples, never live stats. */
export function FeaturesBento() {
  const root = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setInView(true); return; }
    setReady(true);
    const show = () => setInView(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { show(); io.disconnect(); } }, { threshold: 0.04, rootMargin: '40px 0px -5% 0px' });
    io.observe(el);
    const fallback = window.setTimeout(show, 900);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);

  return (
    <div ref={root} className={`ml-feat-root${ready ? ' is-ready' : ''}${inView ? ' is-in' : ''}`}>
      <header className="ml-feat-head mx-auto max-w-[820px] text-center">
        <p className="ml-kicker">Inclus dès l’installation</p>
        <h2 id="f-title" className="ml-title mt-3">
          Tout ce qui compte, dès l’installation.
        </h2>
        <p className="ml-lead mx-auto mt-4">
          Découvrez quels canaux amènent des clients qui paient. Carte en direct, parcours visiteur, entonnoirs et revenus — chaque chiffre est mesuré, jamais extrapolé.
        </p>
        <ol className="ml-feat-steps mx-auto mt-7 flex max-w-[720px] flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
          {STEPS.map((s, i) => (
            <li key={s} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[13px] leading-snug text-ink-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <Link href="/demo" className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-medium text-ink hover:text-accent">
          Explorer la démo publique <UiIcon name="arrow-right" size={15} />
        </Link>
      </header>

      <HeroSwitcher />

      <div className="ml-feat-grid mt-4 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Feat span="md:col-span-2 lg:col-span-3" icon="users" title="Du premier clic à la conversion" text="Identité, source, pages et durée : le parcours complet de la visite, d’un coup d’œil." visual={<VisualJourney />} />
        <Feat span="lg:col-span-3" icon="layout" title="Widgets" text="Compteur, graphique ou carte, à coller sur votre site — ou à poser sur l’écran d’accueil." visual={<VisualPhone />} />
        <Feat span="lg:col-span-2" icon="compass" title="Sources et campagnes" text="Google, 𝕏, e-mail, assistant IA, UTM et ?ref= : chaque visite au bon canal." visual={<VisualSources />} />
        <Feat span="lg:col-span-2" icon="bot" title="Bots IA" text="GPTBot, Claude, Perplexity : qui lit vos pages, à part des humains." visual={<VisualBots />} />
        <Feat span="lg:col-span-2" icon="lock" title="Léger et respectueux" text="≈ 7 Ko, servable depuis votre domaine. First-party ou sans cookie. Rien n’est revendu." visual={<VisualPrivacy />} />
        <Feat span="md:col-span-2 lg:col-span-6" icon="code" title="Pour vous, et pour les agents IA" text="Une balise sur le site. CLI et MCP pour interroger vos stats depuis Claude, Cursor ou ChatGPT." visual={<VisualInstall />} flush />
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-3">Les chiffres des aperçus sont des exemples illustratifs, pas des statistiques en direct.</p>


      <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {OPTIONAL.map((f) => (
          <article key={f.title} className="ml-feat ml-feat-optional p-5" onPointerMove={shine}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
                <span className="ml-feat-ico" aria-hidden><UiIcon name={f.icon} size={15} /></span>
                {f.title}
              </h3>
              <span className="shrink-0 rounded-full border border-line bg-well px-2 py-0.5 text-[11px] font-medium text-ink-3">En option</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3"><span className="text-ink-2">{f.when}.</span> {f.text}</p>
            <div className="ml-feat-visual mt-4 p-3" aria-hidden>{f.visual}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

const STEPS = ['Collez une balise, en une minute.', 'Reliez Stripe, Shopify, Polar…', 'Voyez quels canaux font vraiment acheter.'];

const OPTIONAL: { icon: UiIconName; title: string; when: string; text: string; visual: ReactNode }[] = [
  { icon: 'play', title: 'Vidéos', when: 'Si votre site a des vidéos', text: 'Lectures, rétention, pauses, vitesse et plein écran, vidéo par vidéo.', visual: <VisualVideo /> },
  { icon: 'megaphone', title: 'Emplacements sponsorisés', when: 'Si vous vendez des emplacements', text: 'Impressions vraiment vues, clics, et un export CSV pour vos partenaires.', visual: <VisualSponsors /> },
  { icon: 'grid', title: 'Sections et contenus', when: 'Si vous mesurez ce qui est vu', text: 'Les blocs réellement affichés à l’écran, et ceux que l’on clique.', visual: <VisualContents /> },
];


function shine(e: REPointer<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

function Feat({ span, icon, title, text, visual, flush = false }: { span?: string; icon: UiIconName; title: string; text: string; visual: ReactNode; flush?: boolean }) {
  return (
    <article className={`ml-feat flex flex-col p-5 sm:p-6 ${span ?? ''}`} onPointerMove={shine}>
      <div className="min-w-0">
        <span className="ml-feat-ico" aria-hidden><UiIcon name={icon} size={16} /></span>
        <h3 className="mt-3.5 text-[15px] font-semibold tracking-[-0.015em] text-ink sm:text-[16px]">{title}</h3>
        <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[14px]">{text}</p>
      </div>
      <div className={`ml-feat-visual mt-5 ${flush ? 'p-0 sm:p-0' : 'p-3 sm:p-4'}`} aria-hidden={title !== 'Pour vous, et pour les agents IA'}>{visual}</div>
    </article>
  );
}

/* ---------------- Hero switcher ---------------- */

type Tab = 'revenus' | 'carte' | 'parcours' | 'trafic';
const TABS: { id: Tab; label: string; title: string; text: string }[] = [
  { id: 'revenus', label: 'Revenus', title: 'Quels canaux font payer', text: 'Stripe, Shopify, Polar, Paddle… chaque paiement est rattaché à sa source, pas seulement à une page vue.' },
  { id: 'carte', label: 'En direct', title: 'Visiteurs, en direct', text: 'Globe, points qui pulsent, cartes qui apparaissent. Voyez qui est là, d’où, seconde par seconde.' },
  { id: 'parcours', label: 'Parcours', title: 'Objectifs, entonnoirs, parcours', text: 'Un attribut data-ml-goal. L’entonnoir montre où l’on décroche, du premier clic à la conversion.' },
  { id: 'trafic', label: 'Trafic', title: 'Visiteurs et pages vues', text: 'Uniques, visites, rebond, durée — page par page. React, Next et Vue, suivis tout seuls.' },
];

function HeroSwitcher() {
  const [tab, setTab] = useState<Tab>('revenus');
  const cur = TABS.find((t) => t.id === tab)!;
  const uid = useId();

  function onKey(e: KeyboardEvent, i: number) {
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + TABS.length) % TABS.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`${uid}-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <article className="ml-feat ml-feat-hero mt-12 grid overflow-hidden lg:grid-cols-[minmax(240px,5fr)_minmax(0,7fr)]" onPointerMove={shine}>
      <span className="ml-feat-beam" aria-hidden />
      <div className="flex min-w-0 flex-col p-5 sm:p-7 lg:py-8 lg:pl-8 lg:pr-6">
        <span className="ml-feat-ico" aria-hidden><UiIcon name={tab === 'revenus' ? 'coins' : tab === 'carte' ? 'globe' : tab === 'parcours' ? 'target' : 'bar-chart'} size={16} /></span>
        <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.025em] text-ink sm:text-[24px]">{cur.title}</h3>
        <p className="mt-2 max-w-[44ch] text-[14px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[15px]">{cur.text}</p>
        <div role="tablist" aria-label="Aperçus des fonctions" className="mt-6 flex flex-wrap gap-1">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`ml-feat-tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onKey(e, i)}
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div className="relative min-w-0 border-t border-line bg-well/70 p-4 sm:p-5 lg:border-l lg:border-t-0 lg:p-6">
        <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="flex gap-1" aria-hidden><i className="h-1.5 w-1.5 rounded-full bg-line-strong" /><i className="h-1.5 w-1.5 rounded-full bg-line-strong" /><i className="h-1.5 w-1.5 rounded-full bg-line-strong" /></span> Exemple illustratif · 30 jours</span>
        </div>
        {TABS.map((t) => (
          <div key={t.id} role="tabpanel" id={`${uid}-panel-${t.id}`} aria-labelledby={`${uid}-tab-${t.id}`} hidden={tab !== t.id}>
            {t.id === 'trafic' && <VisualChart rich />}
            {t.id === 'carte' && <VisualMap rich />}
            {t.id === 'parcours' && <VisualFunnel rich />}
            {t.id === 'revenus' && <VisualRevenue rich />}
          </div>
        ))}
      </div>
    </article>
  );
}

/* ---------------- Previews ---------------- */

const SERIES = [42, 48, 44, 61, 70, 66, 82, 78, 96, 108, 98, 124, 138, 132];
const DAYS = ['1 nov.', '3 nov.', '5 nov.', '7 nov.', '9 nov.', '11 nov.', '13 nov.', '15 nov.', '17 nov.', '19 nov.', '21 nov.', '23 nov.', '25 nov.', '27 nov.'];

function VisualChart({ rich = false }: { rich?: boolean }) {
  const id = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(rich ? 12 : null);
  const W = 560, H = rich ? 168 : 88, P = 8;
  const max = Math.max(...SERIES);
  const x = (i: number) => P + (i * (W - 2 * P)) / (SERIES.length - 1);
  const y = (v: number) => H - 10 - (v / max) * (H - 24);
  const d = SERIES.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(SERIES.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const h = hover ?? null;

  function onMove(clientX: number) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const rel = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(Math.round(rel * (SERIES.length - 1)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-5 px-0.5">
        {([['Visiteurs', 2481, ''], ['Pages', 6104, ''], ['Rebond', 31, ' %']] as const).map(([l, v, suf], i) => (
          <div key={l} className="min-w-0">
            <div className="text-[11px] text-ink-3">{l}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <NumberTicker value={v} suffix={suf} delay={i * 0.08} className="text-[18px] font-semibold tracking-tight text-ink sm:text-[22px]" />
              {l === 'Visiteurs' && <span className="tnum text-[11px] font-medium text-success">+12 %</span>}
            </div>
          </div>
        ))}
      </div>
      <div
        ref={box}
        className="relative touch-pan-y"
        style={{ height: H }}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(rich ? 12 : null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`fg${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity="0.38" />
              <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#fg${id})`} className="ml-feat-draw-fill" />
          <path d={d} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" className="ml-feat-draw" pathLength={1} />
          {h != null && (
            <>
              <line x1={x(h)} y1={8} x2={x(h)} y2={H} stroke="rgb(var(--ink) / .2)" strokeWidth="1" />
              <circle cx={x(h)} cy={y(SERIES[h])} r="4" fill="rgb(var(--surface))" stroke="rgb(var(--accent))" strokeWidth="2" />
            </>
          )}
        </svg>
        {h != null && (
          <div
            className="ml-feat-tip pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-pop"
            style={{ left: `${(x(h) / W) * 100}%`, top: Math.max(0, y(SERIES[h]) - 48) }}
          >
            <div className="text-[10px] text-ink-3">{DAYS[h]}</div>
            <div className="tnum text-[13px] font-semibold text-ink">{SERIES[h]} visiteurs</div>
          </div>
        )}
      </div>
    </div>
  );
}

function VisualMap({ rich = false }: { rich?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setLoad(true); io.disconnect(); }
    }, { rootMargin: '160px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={host} className={`relative overflow-hidden ${rich ? 'min-h-[240px] sm:min-h-[280px]' : 'h-[132px] sm:h-[148px]'}`}>
      {load ? (
        <Suspense fallback={<BentoGlobeFallback />}>
          <LandingBentoLive rich={rich} />
        </Suspense>
      ) : (
        <BentoGlobeFallback />
      )}
    </div>
  );
}

function BentoGlobeFallback() {
  return (
    <svg viewBox="0 0 720 500" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="ml-bento-globe-glow" cx="48%" cy="49%" r="48%">
          <stop offset="40%" stopColor="rgb(var(--accent) / .06)" />
          <stop offset="100%" stopColor="rgb(var(--accent) / 0)" />
        </radialGradient>
        <radialGradient id="ml-bento-globe-ocean" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="rgb(var(--surface))" />
          <stop offset="65%" stopColor="rgb(var(--well))" />
          <stop offset="100%" stopColor="rgb(var(--line))" />
        </radialGradient>
      </defs>
      <rect width="720" height="500" fill="url(#ml-bento-globe-glow)" />
      <circle cx="346" cy="246" r="205" fill="url(#ml-bento-globe-ocean)" stroke="rgb(var(--line-strong))" strokeWidth="1" />
    </svg>
  );
}

function VisualSources() {
  const rows = [
    { l: 'Google', mark: 'G', color: '#4285F4', n: '1 204', w: '86%' },
    { l: '𝕏', mark: '𝕏', color: '#171717', n: '418', w: '54%' },
    { l: 'ChatGPT', mark: 'C', color: '#10A37F', n: '196', w: '38%' },
    { l: 'E-mail', mark: '@', color: '#2563EB', n: '87', w: '22%' },
  ];
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.l} className="flex items-center gap-2 text-[12px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white" style={{ background: r.color }} aria-hidden>{r.mark}</span>
          <span className="w-[64px] shrink-0 truncate text-ink-2">{r.l}</span>
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
            <span className="ml-feat-bar block h-full rounded-full bg-accent" style={{ width: r.w }} />
          </span>
          <span className="tnum w-9 shrink-0 text-right text-ink-3">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

function VisualFunnel({ rich = false }: { rich?: boolean }) {
  const steps = [
    { l: 'Accueil', w: 100, drop: null as string | null },
    { l: 'Produit', w: 64, drop: '−36 %' },
    { l: 'Paiement', w: 31, drop: '−52 %' },
    { l: 'Merci', w: 18, drop: '−42 %' },
  ];
  return (
    <ul className={rich ? 'space-y-2.5' : 'space-y-1.5'}>
      {steps.map((s) => (
        <li key={s.l} className="flex items-center gap-2 text-[12px]">
          <span className="w-[72px] shrink-0 text-ink-2">{s.l}</span>
          <span className={`relative min-w-0 flex-1 overflow-hidden rounded-md bg-line/80 ${rich ? 'h-7' : 'h-5'}`}>
            <span className="ml-feat-bar absolute inset-y-0 left-0 rounded-md bg-accent/25" style={{ width: `${s.w}%` }} />
            <span className="absolute inset-y-0 left-2 flex items-center tnum text-[11px] font-medium text-ink-2">{s.w} %</span>
          </span>
          <span className={`tnum w-12 shrink-0 text-right text-[11px] font-medium ${s.drop ? 'text-danger' : 'text-ink-3'}`}>{s.drop ?? '—'} </span>
        </li>
      ))}
    </ul>
  );
}

function VisualRevenue({ rich = false }: { rich?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <NumberTicker value={1248} suffix=" €" className="text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]" />
        <span className="tnum text-[12px] font-medium text-success">+18 %</span>
      </div>
      {rich && (
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
          <span className="bg-accent" style={{ width: '62%' }} />
          <span className="bg-accent/60" style={{ width: '28%' }} />
          <span className="bg-ink-4" style={{ width: '10%' }} />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {[['Google', '62 %', '72%', 'accent'], ['Newsletter', '28 %', '40%', 'accent/60'], ['Direct', '10 %', '16%', 'ink-4']].map(([l, n, w]) => (
          <li key={l} className="flex items-center gap-2 text-[12px] text-ink-2">
            <span className="w-[88px] shrink-0 truncate">{l}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              <span className="ml-feat-bar block h-full rounded-full bg-accent" style={{ width: w }} />
            </span>
            <span className="tnum w-9 shrink-0 text-right text-ink-3">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisualJourney() {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-xs">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-well text-[16px]">🐨</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-ink">Panda calme</span>
            <span className="tnum shrink-0 text-[11px] text-ink-3">3 p. · 2 min 18</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
            <span aria-hidden>🇫🇷</span> Lyon · Google
          </div>
        </div>
      </div>
      <ol className="ml-feat-journey mt-3 space-y-0 border-t border-line pt-2.5">
        {[['/', '09:41'], ['/tarifs', '09:42'], ['/paiement', '09:44']].map(([p, t], i, arr) => (
          <li key={p} className="relative flex items-center gap-2 py-1 pl-4 text-[12px]">
            <span className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" />
            {i < arr.length - 1 && <span className="absolute left-[2px] top-1/2 h-full w-px bg-line" />}
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{p}</span>
            <span className="tnum text-[11px] text-ink-3">{t}</span>
            {p === '/paiement' && <span className="rounded-full bg-success-soft px-1.5 py-px text-[10px] font-medium text-success">Objectif</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function VisualPhone() {
  return (
    <div className="flex justify-center py-1">
      <div className="ml-feat-phone">
        <div className="ml-feat-phone-notch" />
        <div className="ml-feat-glass rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between text-[10px] text-ink-3">
            <span>Visiteurs · 30 j</span>
            <span className="inline-flex items-center gap-1"><span className="ml-dot-live scale-75" /> live</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="tnum text-[22px] font-semibold tracking-tight text-ink">2 481</span>
            <span className="tnum text-[10px] font-medium text-success">+12 %</span>
          </div>
          <svg viewBox="0 0 120 28" className="mt-1 h-7 w-full" preserveAspectRatio="none" aria-hidden>
            <path d="M0 22 C12 20 20 16 30 14 C40 12 48 8 60 9 C72 10 80 16 90 12 C100 8 110 4 120 3 L120 28 L0 28 Z" fill="rgb(var(--accent) / .22)" />
            <path d="M0 22 C12 20 20 16 30 14 C40 12 48 8 60 9 C72 10 80 16 90 12 C100 8 110 4 120 3" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.4" />
          </svg>
          <div className="mt-1.5 flex items-center justify-between border-t border-line/80 pt-1 text-[9px] text-ink-3">
            <span className="inline-flex items-center gap-1"><Logo small compact /> Minilytics</span>
            <span className="font-mono">votre-site.fr</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualBots() {
  const rows = [
    { l: 'GPTBot', badge: 'OpenAI', n: '1 204', w: '78%' },
    { l: 'ClaudeBot', badge: 'Anthropic', n: '642', w: '52%' },
    { l: 'PerplexityBot', badge: 'Perplexity', n: '318', w: '34%' },
  ];
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.l} className="flex items-center gap-2 text-[12px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-3"><UiIcon name="bot" size={11} /></span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-ink-2">{r.l}</span>
            <span className="ml-1.5 rounded-full border border-line bg-well px-1.5 py-px text-[10px] text-ink-3">{r.badge}</span>
          </span>
          <span className="tnum shrink-0 text-ink-3">{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

function VisualPrivacy() {
  return (
    <div className="flex items-center gap-3">
      <span className="ml-feat-shield" aria-hidden>
        <UiIcon name="shield" size={22} />
      </span>
      <p className="min-w-0 text-[13px] leading-relaxed text-ink-2">Servable depuis votre domaine, avec une option sans cookie.</p>
    </div>
  );
}

function VisualInstall() {
  const [tab, setTab] = useState<'script' | 'cli' | 'mcp'>('script');
  const [copied, setCopied] = useState(false);
  const snippets = {
    script: INSTALL,
    cli: 'npx minilytics stats --days 7',
    mcp: 'claude mcp add minilytics -- npx minilytics-mcp',
  };
  const code = snippets[tab];
  function copy() {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div role="tablist" aria-label="Format du snippet" className="flex gap-1">
          {([['script', 'Script'], ['cli', 'CLI'], ['mcp', 'MCP']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ml-feat-tab !min-h-8 !px-2.5 !text-[12px] ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn-ghost !min-h-9 !text-[12px]" onClick={copy} aria-label={copied ? 'Copié' : 'Copier le snippet'}>
          <UiIcon name={copied ? 'check' : 'copy'} size={13} />{copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-relaxed text-ink-2"><code>{code}</code></pre>
      <span className="sr-only" aria-live="polite">{copied ? 'Snippet copié dans le presse-papiers' : ''}</span>
    </div>
  );
}

function VisualVideo() {
  return (
    <div className="flex h-9 items-end gap-1">
      {[22, 38, 54, 70, 62, 48, 30, 18].map((h, i) => (
        <span key={i} className="ml-feat-bar flex-1 rounded-sm bg-accent/30" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function VisualSponsors() {
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span className="tnum text-[16px] font-semibold text-ink">1,2 %</span>
      <span className="text-ink-3">CTR · 4 210 impressions vues</span>
    </div>
  );
}

function VisualContents() {
  return (
    <ul className="space-y-1.5">
      {[['Hero', '92 %'], ['Article', '61 %'], ['Pied', '18 %']].map(([l, n]) => (
        <li key={l} className="flex items-center justify-between text-[12px] text-ink-2">
          <span>{l}</span><span className="tnum text-ink-3">{n}</span>
        </li>
      ))}
    </ul>
  );
}

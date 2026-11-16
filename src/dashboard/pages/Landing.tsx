import { useEffect, useRef, useState, type PointerEvent as REPointer } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { TrendChart } from '../components/TrendChart';
import { ThemeToggle } from '../components/ThemeToggle';
import { UiIcon } from '../components/UiIcon';
import { NumberTicker } from '../components/NumberTicker';
import { channelName } from '../lib/format';
import { PLANS as PLAN_LIMITS } from '../../shared/plans';
import { botsLabel, pricingCards, quotaFaq } from '../lib/planLabels';
import { FeaturesBento } from './LandingFeatures';
import { LandingLiveGlobe } from './LandingGlobe';
import { LandingBeams } from './LandingBeams';
import { LandingCompare } from './LandingCompare';
import { SectionHead, ShimmerLink, TiltStage, TrustStrip, ToolsMarquee, useActiveSection, useReveal } from './LandingUi';

type Group = { label: string; value: number };
interface Preview {
  site: { id?: string; name: string; domain: string };
  current: { visitors: number; sessions: number; pageviews: number; avgDurationMs: number };
  previous: { visitors: number };
  online: number;
  series: { date: string; visitors: number; pageviews: number }[];
  sources: Group[];
  pages: Group[];
  devices?: Group[];
}

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/** Real, aggregated numbers of the public demo site. Never invented: if it fails, we say so. The landing stays neutral: no domain shown. */
function useLivePreview() {
  const [data, setData] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [siteId, setSiteId] = useState('');
  const siteIdRef = useRef('');
  useEffect(() => {
    const ctl = new AbortController();
    const load = async (first: boolean) => {
      try {
        let id = siteIdRef.current;
        if (!id) {
          const sites: { id: string; domain: string }[] = await fetch('/api/public/sites', { signal: ctl.signal }).then((r) => (r.ok ? r.json() : []));
          const pick = sites.find((s) => s.domain.replace(/^www\./, '') === 'n0.pub') ?? sites[0];
          if (!pick) { if (first) setFailed(true); return; }
          id = pick.id;
          siteIdRef.current = id;
          setSiteId(id);
        }
        const d: Preview | null = await fetch(`/api/public/demo?days=7&site=${encodeURIComponent(id)}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : null));
        if (d) { setData(d); setFailed(false); }
        else if (first) setFailed(true);
      } catch {
        if (!ctl.signal.aborted && first) setFailed(true);
      }
    };
    load(true);
    const t = window.setInterval(() => load(false), 20000);
    return () => { ctl.abort(); clearInterval(t); };
  }, []);
  return { data, failed, siteId };
}

type IconName = Parameters<typeof UiIcon>[0]['name'];
const USE_CASES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'file-text', title: 'Blogs et médias', text: 'Articles les plus lus, temps de lecture, scroll, sources de trafic.' },
  { icon: 'zap', title: 'Landing pages', text: 'Campagnes, clics sur vos boutons, taux de conversion.' },
  { icon: 'target', title: 'E-commerce', text: 'Ventes et revenus par source, entonnoir jusqu’au paiement.' },
  { icon: 'code', title: 'SaaS et applis', text: 'Inscriptions, parcours dans l’appli, utilisateurs identifiés.' },
  { icon: 'eye', title: 'Portfolios', text: 'Qui vous découvre, d’où, et quels projets sont regardés.' },
];

/** Pricing lines come from `src/shared/plans.ts` so the page stays in sync with server quotas. */
const FEATURE_TAG: Record<string, string> = {
  [botsLabel(PLAN_LIMITS.growth.botRequests)]: 'Extrait serveur requis',
  'Mentions sur les réseaux sociaux': 'Clé API X ou Reddit requise',
};
const PLANS = pricingCards();

const FAQ: { q: string; a: string }[] = [
  { q: 'Minilytics convient-il à mon site ?', a: 'Oui, quel que soit son type : blog, landing page, boutique, SaaS, portfolio ou site vitrine. Visiteurs, sources, campagnes, objectifs et temps réel fonctionnent partout. Les vues Vidéos et Sponsors sont des options : elles restent vides si vous ne vous en servez pas.' },
  { q: 'Comment installer Minilytics ?', a: 'Ajoutez une seule balise <script> dans le <head> de votre site (HTML, WordPress, Webflow, Next.js…). Pages vues, navigation des applis monopage, scroll, temps actif et clics sortants sont mesurés automatiquement.' },
  { q: 'Comment mesurer une inscription ou un achat ?', a: 'Ajoutez data-ml-goal="inscription" sur le bouton, ou appelez minilytics(\'goal\', \'achat\') dans votre code. Les paiements peuvent aussi arriver depuis Dodo Payments ou l’API de paiements.' },
  { q: 'Minilytics utilise-t-il des cookies ?', a: 'Oui, deux cookies first-party : un identifiant de visiteur (1 an) et un identifiant de visite (30 minutes, renouvelé à chaque action). Aucun cookie tiers, aucune donnée revendue. Une option sans cookie est disponible sur la balise.' },
  { q: 'Les robots sont-ils comptés ?', a: 'Non. Les robots connus, les aperçus de liens et les navigateurs automatisés (headless, WebDriver) sont filtrés côté navigateur et côté serveur.' },
  { q: 'Comment savoir quel post 𝕏 m’amène des visiteurs ?', a: 'X ne transmet que « t.co » comme référent. Créez un lien traçable dans la vue Réseaux sociaux : chaque visite est attribuée à son post. Avec votre clé de l’API X, les posts qui citent votre domaine s’affichent aussi.' },
  { q: 'Puis-je m’exclure de mes propres statistiques ?', a: 'Oui : ouvrez votre site une fois avec ?ml_ignore=true dans l’adresse. Revenez avec ?ml_ignore=false pour annuler.' },
  { q: 'Dois-je payer pour commencer ?', a: 'Non. Les inscriptions ouvrent progressivement : réservez votre place sur la liste d’attente, sans carte bancaire. Vous recevrez un e-mail à l’ouverture, et la démo publique est accessible dès maintenant.' },
  quotaFaq(),
];

const fmtDur = (ms: number) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s} s`; };

/** Hero product shot: the real dashboard UI, rendered with live aggregated numbers of the public demo site. */
function ProductPreview() {
  const { data, failed, siteId } = useLivePreview();
  const rawChange = data?.previous.visitors ? Math.round(((data.current.visitors - data.previous.visitors) / data.previous.visitors) * 100) : null;
  const change = rawChange !== null && data && data.previous.visitors >= 20 && Math.abs(rawChange) <= 200 ? rawChange : null;
  const demoHref = '/demo' + (siteId ? `?site=${encodeURIComponent(siteId)}` : '');
  const lists: [string, Group[] | undefined, (l: string) => string][] = [
    ['Sources', data?.sources, channelName],
    ['Pages', data?.pages, (l) => l],
  ];
  return (
    <div className="ml-frame" aria-label="Aperçu du tableau de bord avec les données réelles de la démo publique" aria-live="polite">
      <div className="flex h-10 items-center gap-3 border-b border-line px-4" aria-hidden>
        <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="h-2.5 w-2.5 rounded-full bg-line-strong" /><span className="h-2.5 w-2.5 rounded-full bg-line-strong" /></div>
        <div className="mx-auto flex h-6 w-full max-w-[280px] items-center justify-center rounded-md bg-well text-[11px] text-ink-4" translate="no">minilytics · démo publique</div>
        <div className="w-[42px]" />
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 text-[13px]"><Logo small /><span className="hidden text-ink-4 sm:inline">/</span><span className="hidden truncate font-medium sm:inline">Vue d’ensemble</span></div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12px] font-medium text-ink-2"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />{data ? `${nf(data.online)} en ligne` : 'En direct'}</span>
          <span className="hidden rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-3 sm:inline">7 derniers jours</span>
        </div>
      </div>
      {failed ? (
        <p className="px-6 py-16 text-center text-[13px] text-ink-3">L’aperçu en direct est momentanément indisponible. <Link href="/demo" className="font-medium text-ink underline underline-offset-4">Ouvrir la démo</Link></p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4 [&>*]:bg-surface">
            <Kpi label="Visiteurs" value={data?.current.visitors} suffix="" change={change} />
            <Kpi label="Pages vues" value={data?.current.pageviews} suffix="" />
            <Kpi label="Visites" value={data?.current.sessions} suffix="" />
            <div className="min-w-0 px-4 py-3.5 sm:px-5">
              <div className="text-[12px] text-ink-3">Durée moyenne</div>
              <div className="mt-1 tnum text-[20px] font-semibold tracking-tight sm:text-[22px]">{data ? fmtDur(data.current.avgDurationMs) : <span className="ml-skeleton inline-block h-5 w-14 align-middle" />}</div>
            </div>
          </div>
          <div className="border-t border-line px-3 pb-2 pt-4 sm:px-5">
            {data && data.series.length > 1 ? (
              <TrendChart buckets={data.series.map((x) => x.date)} granularity="day" height={190}
                series={[{ key: 'v', label: 'Visiteurs', color: 'rgb(var(--accent))', values: data.series.map((x) => x.visitors) }, { key: 'p', label: 'Pages vues', color: 'rgb(var(--ink-4))', values: data.series.map((x) => x.pageviews) }]} />
            ) : <div className="ml-skeleton h-[220px] w-full" />}
          </div>
          <div className="grid border-t border-line md:grid-cols-2 md:divide-x md:divide-line">
            {lists.map(([title, rows, fmt], li) => {
              const max = Math.max(1, ...(rows ?? []).map((r) => r.value));
              return (
                <div key={title} className={`min-w-0 px-4 py-4 sm:px-5 ${li ? 'hidden border-t border-line md:block md:border-t-0' : ''}`}>
                  <div className="mb-2 flex items-center justify-between text-[12px] text-ink-3"><span className="font-medium text-ink-2">{title}</span><span>Visiteurs</span></div>
                  <ul className="space-y-1">
                    {(rows ?? [null, null, null, null]).slice(0, 4).map((r, i) => (
                      <li key={i} className="relative flex h-8 items-center justify-between gap-2 overflow-hidden rounded-md px-2 text-[13px]">
                        {r ? <>
                          <span className="absolute inset-y-0 left-0 rounded-md bg-accent/10" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
                          <span className="relative min-w-0 truncate" translate="no">{fmt(r.label)}</span><span className="tnum relative shrink-0 text-ink-3">{nf(r.value)}</span>
                        </> : <span className="ml-skeleton h-4 w-full" />}
                      </li>
                    ))}
                    {rows && rows.length === 0 && <li className="px-2 text-[12px] text-ink-4">Pas encore de données</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-well/60 px-4 py-2.5 text-[12px] text-ink-3 sm:px-5">
        <span>Données réelles et agrégées d’un site en production</span>
        <Link href={demoHref} className="inline-flex min-h-[44px] items-center gap-1 px-1 font-medium text-ink hover:underline hover:underline-offset-4">Ouvrir <UiIcon name="arrow-right" size={14} /></Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix, change }: { label: string; value?: number; suffix: string; change?: number | null }) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        {value != null
          ? <NumberTicker value={value} suffix={suffix} className="text-[20px] font-semibold tracking-tight sm:text-[22px]" />
          : <span className="ml-skeleton inline-block h-5 w-14 align-middle" />}
        {change != null && <span className={`tnum text-[12px] font-medium ${change >= 0 ? 'text-success' : 'text-danger'}`}>{`${change >= 0 ? '+' : '−'}${Math.abs(change)} %`}</span>}
      </div>
    </div>
  );
}

const SNIPPET = '<script defer data-website-id="VOTRE_ID"\n  src="https://minilytics-six.vercel.app/js/script.js"></script>';

const SHOWCASE = [
  { key: 'map', kicker: 'Carte', title: 'Le monde de vos visiteurs, en direct', text: 'Globe interactif, replay des 30 dernières minutes ou des 24 dernières heures, flux en direct avec drapeau, source et page d’entrée. Et des pays à débloquer.', cta: ['/demo/map', 'Ouvrir la carte de démo'] },
  { key: 'bots', kicker: 'Bots IA', title: 'Qui, parmi les IA, lit votre site', text: 'GPTBot, ClaudeBot, Perplexity… : passages par robot et par page, transmis par votre serveur, séparés des vraies visites venues de ChatGPT ou Claude.', cta: ['#fonctionnalites', 'Voir toutes les fonctions'] },
  { key: 'share', kicker: 'Partage', title: 'Un tableau de bord public, sur vos règles', text: 'Liens en lecture seule avec mot de passe et expiration. Vous choisissez les vues, masquez les revenus ou les villes : tout est appliqué côté serveur.', cta: ['/demo', 'Voir la démo publique'] },
  { key: 'widgets', kicker: 'Widgets', title: 'Vos chiffres, sur votre site', text: 'Compteur en ligne, graphique, top pages, carte ou badge SVG à intégrer en une ligne. Thème, couleur et langue au choix, mis à jour toutes les 30 secondes.', cta: ['/signup', 'Réserver mon accès'] },
] as const;

function Showcase() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} aria-labelledby="sc-title" className="ml-reveal mx-auto max-w-[1200px] px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mb-8 sm:mb-10">
        <SectionHead center id="sc-title" eyebrow="Le produit" title="Ce que vous voyez, dès la première journée." />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {SHOWCASE.map((f, i) => { const wide = i === 0 || i === SHOWCASE.length - 1; return (
          <article key={f.key} className={`group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface ${wide ? 'md:col-span-2 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}>
            <div className={`flex flex-col p-6 sm:p-8 ${wide ? 'md:justify-center' : ''}`}>
              <div className="text-[12px] font-medium text-ink-2">
                <span className="ml-feat-badge !min-h-[26px] !px-2.5">{f.kicker}</span>
              </div>
              <h3 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink [text-wrap:balance] sm:text-[24px]">{f.title}</h3>
              <p className="mt-2.5 max-w-[46ch] text-[14px] leading-relaxed text-ink-3 [text-wrap:pretty]">{f.text}</p>
              <a href={f.cta[0]} className="mt-4 inline-flex min-h-[44px] w-fit items-center gap-1.5 text-[14px] font-medium text-ink transition-colors duration-150 hover:text-accent">{f.cta[1]} <UiIcon name="arrow-right" size={15} /></a>
            </div>
            <div className={`relative mt-auto min-w-0 overflow-hidden border-line bg-well ${wide ? 'border-t md:border-l md:border-t-0' : 'border-t'}`}>
              <img src={`/landing/${f.key}-light.webp`} alt={`Capture de la fonction ${f.kicker} de Minilytics`} loading="lazy" decoding="async" width={1200} height={760} className="block h-auto w-full dark:hidden" />
              <img src={`/landing/${f.key}-dark.webp`} alt={`Capture de la fonction ${f.kicker} de Minilytics`} loading="lazy" decoding="async" width={1200} height={760} className="hidden h-auto w-full dark:block" />
            </div>
          </article>
        ); })}
      </div>
    </section>
  );
}

const NAV = [
  ['#fonctionnalites', 'Fonctionnalités'],
  ['#installation', 'Installation'],
  ['#comparaison', 'Comparaison'],
  ['#tarifs', 'Tarifs'],
  ['#faq', 'FAQ'],
] as const;

function heroSpot(e: REPointer<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--hx', `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty('--hy', `${((e.clientY - r.top) / r.height) * 100}%`);
}

export function Landing() {
  const [menu, setMenu] = useState(false);
  const active = useActiveSection(['fonctionnalites', 'installation', 'comparaison', 'tarifs', 'faq']);
  const casesRef = useReveal<HTMLElement>();
  const installRef = useReveal<HTMLElement>();
  const priceRef = useReveal<HTMLElement>();
  const faqRef = useReveal<HTMLElement>();
  const ctaRef = useReveal<HTMLElement>();
  useEffect(() => {
    document.title = 'Minilytics — Des analytics simples et précis pour votre site';
  }, []);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="Minilytics, accueil" className="flex min-h-[44px] items-center rounded-md"><Logo /></Link>
            <nav aria-label="Sections de la page" className="hidden items-center gap-1 lg:flex">
              {NAV.map(([h, l]) => (
                <a key={h} href={h} className={`ml-nav-link ${active === h ? 'is-active' : ''}`} aria-current={active === h ? 'true' : undefined}>{l}</a>
              ))}
              <Link href="/demo" className="ml-nav-link">Démo</Link>
            </nav>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn-ghost !text-[14px]">Se connecter</Link>
            <ShimmerLink href="/signup" className="hidden !min-h-[36px] !px-3.5 !text-[13px] sm:inline-flex">Commencer</ShimmerLink>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-well lg:hidden" aria-expanded={menu} aria-controls="landing-menu" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setMenu((m) => !m)}>
              <UiIcon name={menu ? 'x' : 'menu'} size={18} />
            </button>
          </div>
        </div>
        {menu && (
          <nav id="landing-menu" aria-label="Sections de la page" className="border-t border-line px-4 pb-4 pt-2 lg:hidden">
            {[...NAV, ['/demo', 'Démo'] as const, ['/login', 'Se connecter'] as const].map(([h, l]) => (
              <a key={h} href={h} onClick={() => setMenu(false)} className="flex min-h-[48px] items-center rounded-lg px-3 text-[15px] font-medium text-ink-2 hover:bg-well">{l}</a>
            ))}
            <ShimmerLink href="/signup" className="mt-2 w-full !min-h-[48px]">Réserver mon accès</ShimmerLink>
          </nav>
        )}
      </header>

      <main id="contenu">
        <section className="relative overflow-hidden" onPointerMove={heroSpot} style={{ ['--hx' as string]: '50%', ['--hy' as string]: '8%' }}>
          <div className="ml-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[640px]" aria-hidden />
          <div className="ml-hero-orb" aria-hidden />
          <div className="ml-hero-spot" aria-hidden />
          <div className="relative mx-auto max-w-[1200px] px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-20 lg:pb-20 lg:pt-24">
            <div className="mx-auto max-w-[780px] text-center">
              <Link href="/demo" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] text-ink-2 shadow-xs transition-colors hover:border-line-strong">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Démo publique en direct <UiIcon name="arrow-right" size={13} />
              </Link>
              <h1 className="mt-5 text-[clamp(2.6rem,9vw,4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink [text-wrap:balance] sm:mt-6 sm:leading-[1.04]">
                Vos visiteurs, enfin <span className="ml-text-grad">lisibles.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-[580px] text-[16px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:mt-5 sm:text-[18px]">
                Sources, pages, revenus, carte du monde et robots d’IA sur un seul tableau de bord, en français. Une balise à coller, les premières visites en quelques secondes.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:mt-8 sm:flex-row">
                <ShimmerLink href="/signup">Réserver mon accès</ShimmerLink>
                <Link href="/demo" className="btn !h-12 !px-6 !text-[15px]">Voir la démo <UiIcon name="arrow-right" size={16} /></Link>
              </div>
              <p className="mt-3.5 text-[13px] text-ink-3 sm:mt-4">Liste d’attente gratuite · Aucune carte requise</p>
              <TrustStrip />
            </div>
            <div className="relative mx-auto mt-10 max-w-[1040px] sm:mt-16">
              <div className="ml-frame-glow">
                <TiltStage>
                  <ProductPreview />
                </TiltStage>
              </div>
            </div>
            <div className="ml-tools-row mt-10">
              <p className="mb-3 text-center text-[12px] font-medium uppercase tracking-wide text-ink-4">Fonctionne avec</p>
              <ToolsMarquee />
            </div>
          </div>
        </section>

        <Showcase />

        <section ref={casesRef} aria-labelledby="uc-title" className="ml-reveal border-y border-line bg-surface">
          <div className="mx-auto max-w-[1200px] px-4 pt-10 sm:px-6">
            <h2 id="uc-title" className="text-center text-[13px] font-medium text-ink-3">Pour tous les types de sites</h2>
          </div>
          <ul className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-surface">
            {USE_CASES.map((u) => (
              <li key={u.title} className="px-4 py-6 last:col-span-2 sm:px-6 sm:last:col-span-1">
                <div className="flex items-center gap-2 text-[14px] font-medium text-ink"><span className="text-ink-3" aria-hidden><UiIcon name={u.icon} size={16} /></span>{u.title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{u.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="fonctionnalites" aria-labelledby="f-title" className="relative mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
          <FeaturesBento />
        </section>

        <LandingLiveGlobe />
        <LandingBeams />

        <section id="installation" ref={installRef} aria-labelledby="i-title" className="ml-reveal scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-28">
            <div>
              <SectionHead id="i-title" eyebrow="Installation" title="Une balise. Deux minutes." text="Collez le script dans le <head> de votre site : HTML, WordPress, Webflow ou Next.js. Les pages vues, la navigation des applis monopage, le scroll, le temps actif et les clics sortants sont mesurés automatiquement." />
              <ul className="mt-6 space-y-2.5 text-[14px] text-ink-2">
                {['Script d’environ 6 Ko compressé', 'Cookies first-party uniquement, aucune donnée revendue', 'Objectifs avec un simple attribut data-ml-goal'].map((x) => (
                  <li key={x} className="flex items-center gap-2.5"><span className="text-success" aria-hidden><UiIcon name="check" size={16} /></span>{x}</li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-card">
              <div className="flex h-10 items-center justify-between border-b border-line px-4 text-[12px] text-ink-3"><span className="font-mono">index.html</span><span>HTML</span></div>
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-ink-2"><code>{'<head>\n  …\n  '}<span className="text-accent">{SNIPPET.split('\n')[0]}</span>{'\n  '}<span className="text-accent">{SNIPPET.split('\n')[1]}</span>{'\n</head>'}</code></pre>
            </div>
          </div>
        </section>

        <LandingCompare />

        <section id="tarifs" ref={priceRef} aria-labelledby="p-title" className="ml-reveal mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
          <SectionHead center id="p-title" eyebrow="Tarifs" title="Des prix simples, en euros." text="Prix mensuels, sans engagement. Réservez votre place dès aujourd’hui, vous ne payez qu’à l’ouverture." />
          <div className="mx-auto mt-12 grid max-w-[860px] gap-4 md:grid-cols-2">
            {PLANS.map((p) => (
              <article key={p.name} className={`ml-price-card relative flex flex-col border bg-surface p-6 sm:p-8 ${p.highlight ? 'border-ink shadow-pop' : 'border-line shadow-card'}`} aria-labelledby={`plan-${p.name}`}>
                {p.highlight && <div className="ml-feat-beam" aria-hidden />}
                <div className="relative flex items-center justify-between gap-2">
                  <h3 id={`plan-${p.name}`} className="text-[15px] font-semibold" translate="no">{p.name}</h3>
                  {p.highlight && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-canvas">Plusieurs sites</span>}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="tnum text-5xl font-semibold tracking-tight">{p.price}&nbsp;€</span>
                  <span className="text-[14px] text-ink-3">/ mois</span>
                </div>
                {p.highlight
                  ? <ShimmerLink href={`/signup?plan=${p.name.toLowerCase()}`} className="mt-6 w-full !h-11">Choisir {p.name}</ShimmerLink>
                  : <Link href={`/signup?plan=${p.name.toLowerCase()}`} className="btn mt-6 w-full !h-11">Choisir {p.name}</Link>}
                {p.note && <p className="mt-2.5 text-center text-[12px] text-ink-3">{p.note}</p>}
                <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6 text-[14px] text-ink-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0 text-ink-3" aria-hidden><UiIcon name="check" size={16} /></span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{f}{FEATURE_TAG[f] && <span className="rounded-full border border-line px-1.5 py-px text-[11px] font-medium text-ink-3">{FEATURE_TAG[f]}</span>}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-[600px] text-center text-[12px] leading-relaxed text-ink-4">Les mentions 𝕏 demandent votre propre clé de l’API X ; l’attribution des liens 𝕏 fonctionne sans clé. Pas de tarif annuel pour le moment : les prix affichés sont mensuels.</p>
        </section>

        <section id="faq" ref={faqRef} aria-labelledby="faq-title" className="ml-reveal scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.6fr] lg:py-28">
            <SectionHead id="faq-title" eyebrow="FAQ" title="Questions fréquentes" text="Une autre question ? La démo publique montre exactement ce que vous obtiendrez." />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {FAQ.map((f, i) => (
                <details key={f.q} className={`ml-faq-item group ${i ? 'border-t border-line' : ''}`}>
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-[15px] font-medium text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="shrink-0 text-ink-4 transition-transform duration-200 group-open:rotate-45" aria-hidden><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
                  </summary>
                  <p className="px-4 pb-5 pr-10 text-[14px] leading-relaxed text-ink-3 sm:px-5">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section ref={ctaRef} className="ml-reveal px-4 py-16 sm:px-6 lg:py-24">
          <div className="ml-cta-panel relative mx-auto max-w-[1200px] overflow-hidden px-6 py-16 text-center sm:px-10 sm:py-20">
            <div className="ml-cta-glow" aria-hidden />
            <svg className="ml-cta-dots" viewBox="0 0 200 200" aria-hidden>
              <defs>
                <radialGradient id="ml-cta-fb" cx="50%" cy="46%" r="48%">
                  <stop offset="55%" stopColor="rgb(var(--accent) / .14)" />
                  <stop offset="100%" stopColor="rgb(var(--accent) / 0)" />
                </radialGradient>
              </defs>
              <circle cx="100" cy="100" r="84" fill="url(#ml-cta-fb)" />
            </svg>
            <div className="relative">
              <p className="ml-feat-badge mx-auto">Prêt à voir clair</p>
              <h2 className="mx-auto mt-5 max-w-xl text-[clamp(1.85rem,5vw,3rem)] font-semibold leading-[1.08] tracking-[-0.04em] [text-wrap:balance]">Voyez ce qui marche vraiment sur votre site.</h2>
              <p className="mt-4 text-[15px] text-ink-3 sm:text-[17px]">Une balise à coller, c’est tout. Liste d’attente gratuite, aucune carte requise.</p>
              <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:justify-center">
                <ShimmerLink href="/signup">Réserver mon accès</ShimmerLink>
                <Link href="/demo" className="btn !h-12 !px-6 !text-[15px]">Voir la démo</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="ml-footer border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 text-[13px] sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr]" style={{ paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}>
          <div>
            <Logo small />
            <p className="mt-3 max-w-[280px] leading-relaxed text-ink-3">Des analytics simples et précis pour tout type de site web.</p>
            <p className="mt-4 text-ink-4">© {new Date().getFullYear()} Minilytics</p>
          </div>
          <nav aria-label="Produit" className="flex flex-col gap-2.5">
            <span className="font-medium text-ink">Produit</span>
            <a href="#fonctionnalites" className="text-ink-3 hover:text-ink">Fonctionnalités</a>
            <a href="#installation" className="text-ink-3 hover:text-ink">Installation</a>
            <a href="#comparaison" className="text-ink-3 hover:text-ink">Comparaison</a>
            <a href="#tarifs" className="text-ink-3 hover:text-ink">Tarifs</a>
            <Link href="/demo" className="text-ink-3 hover:text-ink">Démo publique</Link>
          </nav>
          <nav aria-label="Ressources" className="flex flex-col gap-2.5">
            <span className="font-medium text-ink">Ressources</span>
            <a href="#faq" className="text-ink-3 hover:text-ink">FAQ</a>
            <Link href="/api-docs" className="text-ink-3 hover:text-ink">Documentation API</Link>
            <a href="https://github.com/bubuMMMM/minilytics" className="text-ink-3 hover:text-ink" rel="noopener noreferrer">Code source</a>
          </nav>
          <nav aria-label="Compte" className="flex flex-col gap-2.5">
            <span className="font-medium text-ink">Compte</span>
            <Link href="/login" className="text-ink-3 hover:text-ink">Se connecter</Link>
            <Link href="/signup" className="text-ink-3 hover:text-ink">Liste d’attente</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

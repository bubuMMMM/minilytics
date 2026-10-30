import { useEffect, useState } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { TrendChart } from '../components/TrendChart';
import { ThemeToggle } from '../components/ThemeToggle';
import { UiIcon } from '../components/UiIcon';
import { channelName } from '../lib/format';

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
  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const sites: { id: string; domain: string }[] = await fetch('/api/public/sites', { signal: ctl.signal }).then((r) => (r.ok ? r.json() : []));
        const pick = sites.find((s) => s.domain.replace(/^www\./, '') === 'n0.pub') ?? sites[0];
        if (!pick) { setFailed(true); return; }
        setSiteId(pick.id);
        const d: Preview | null = await fetch(`/api/public/demo?days=7&site=${encodeURIComponent(pick.id)}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : null));
        if (d) setData(d); else setFailed(true);
      } catch {
        if (!ctl.signal.aborted) setFailed(true);
      }
    })();
    return () => ctl.abort();
  }, []);
  return { data, failed, siteId };
}

type IconName = Parameters<typeof UiIcon>[0]['name'];
const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'users', title: 'Visiteurs et pages vues', text: 'Visiteurs uniques, visites, pages vues, rebond et durée, page par page. Navigation des applis React, Next.js ou Vue suivie automatiquement.' },
  { icon: 'compass', title: 'Sources et référents', text: 'Moteurs de recherche, réseaux sociaux, assistants IA, sites référents, e-mail : chaque visite est rangée dans le bon canal.' },
  { icon: 'filter', title: 'Campagnes UTM', text: 'utm_source, utm_medium, utm_campaign, utm_content et ?ref= pour comparer vos newsletters, pubs et partenariats.' },
  { icon: 'globe', title: 'Pays, villes, appareils', text: 'Pays, régions et villes, navigateurs et systèmes avec leur version, mobile, tablette ou ordinateur, fuseau horaire.' },
  { icon: 'activity', title: 'Temps réel', text: 'Les visiteurs en ligne, les pages ouvertes et chaque événement à la seconde, avec un globe des connexions.' },
  { icon: 'target', title: 'Objectifs et entonnoirs', text: 'Inscriptions, achats, clics sur un bouton : un attribut data-ml-goal suffit. Entonnoirs étape par étape pour voir où l’on décroche.' },
  { icon: 'arrow-up-right', title: 'Clics sortants', text: 'Chaque lien externe cliqué est compté automatiquement, même ouvert dans un nouvel onglet.' },
  { icon: 'file-text', title: 'Scroll et temps de lecture', text: 'Profondeur de lecture (25, 50, 75, 90, 100 %) et temps réellement actif sur la page : idéal pour les articles et les pages longues.' },
  { icon: 'bar-chart', title: 'Revenus et paiements', text: 'Reliez Dodo Payments ou l’API de paiements : revenus par source, par campagne et par page, et qui a payé après quelle visite.' },
  { icon: 'share', title: 'Réseaux sociaux et 𝕏', text: 'Visites par réseau, liens 𝕏 traçables attribués au post près, et mentions de votre domaine sur 𝕏 (avec votre clé API X).' },
  { icon: 'download', title: 'Export et API', text: 'Export CSV de chaque tableau, API HTTP pour envoyer objectifs et paiements depuis votre serveur.' },
  { icon: 'lock', title: 'Léger et respectueux', text: 'Script d’environ 5 Ko compressé. Cookies first-party uniquement, aucune donnée revendue, robots et navigateurs automatisés ignorés.' },
];

const ADVANCED: { icon: IconName; title: string; when: string; text: string }[] = [
  { icon: 'play', title: 'Vidéos', when: 'Si votre site a des vidéos', text: 'Lectures, temps réellement regardé, rétention à 10, 25, 50, 75 et 90 %, pauses, vitesse et plein écran, vidéo par vidéo.' },
  { icon: 'megaphone', title: 'Emplacements sponsorisés', when: 'Si vous vendez des emplacements', text: 'Impressions vraiment vues (50 % visibles pendant 1 s), clics et taux de clic par emplacement et par sponsor, export CSV pour vos partenaires.' },
  { icon: 'grid', title: 'Sections et contenus', when: 'Si vous voulez savoir ce qui est vu', text: 'Quelles sections, cartes ou articles mis en avant sont réellement affichés à l’écran, et lesquels sont cliqués.' },
];

const USE_CASES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'file-text', title: 'Blogs et médias', text: 'Articles les plus lus, temps de lecture, scroll, sources de trafic.' },
  { icon: 'zap', title: 'Landing pages', text: 'Campagnes, clics sur vos boutons, taux de conversion.' },
  { icon: 'target', title: 'E-commerce', text: 'Ventes et revenus par source, entonnoir jusqu’au paiement.' },
  { icon: 'code', title: 'SaaS et applis', text: 'Inscriptions, parcours dans l’appli, utilisateurs identifiés.' },
  { icon: 'eye', title: 'Portfolios', text: 'Qui vous découvre, d’où, et quels projets sont regardés.' },
];

/** Pricing lines are kept word for word; a short tag says when a line needs setup or is not available yet. */
const FEATURE_TAG: Record<string, string> = {
  '100K requêtes de bots IA': 'Bientôt',
  'API, CLI & MCP': 'CLI & MCP bientôt',
  'Mentions sur les réseaux sociaux': 'Clé API X requise',
};
const PLANS: { name: string; price: string; features: string[]; note?: string; highlight?: boolean }[] = [
  {
    name: 'Starter',
    price: '9',
    features: ['10k événements par mois', '1 site', '1 membre d’équipe', '3 ans de conservation des données', '100K requêtes de bots IA', 'API, CLI & MCP', 'Mentions sur les réseaux sociaux', 'Attribution des liens 𝕏'],
    note: '0,00 € à payer aujourd’hui. Aucune carte requise.',
  },
  {
    name: 'Growth',
    price: '19',
    highlight: true,
    features: ['10k événements par mois', '30 sites', '30 membres d’équipe', '5+ ans de conservation', '100K requêtes de bots IA', 'API, CLI & MCP', 'Mentions sur les réseaux sociaux', 'Attribution des liens 𝕏'],
  },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Minilytics convient-il à mon site ?', a: 'Oui, quel que soit son type : blog, landing page, boutique, SaaS, portfolio ou site vitrine. Visiteurs, sources, campagnes, objectifs et temps réel fonctionnent partout. Les vues Vidéos et Sponsors sont des options : elles restent vides si vous ne vous en servez pas.' },
  { q: 'Comment installer Minilytics ?', a: 'Ajoutez une seule balise <script> dans le <head> de votre site (HTML, WordPress, Webflow, Next.js…). Pages vues, navigation des applis monopage, scroll, temps actif et clics sortants sont mesurés automatiquement.' },
  { q: 'Comment mesurer une inscription ou un achat ?', a: 'Ajoutez data-ml-goal="inscription" sur le bouton, ou appelez minilytics(\'goal\', \'achat\') dans votre code. Les paiements peuvent aussi arriver depuis Dodo Payments ou l’API de paiements.' },
  { q: 'Minilytics utilise-t-il des cookies ?', a: 'Oui, deux cookies first-party : un identifiant de visiteur (1 an) et un identifiant de visite (30 minutes, renouvelé à chaque action). Aucun cookie tiers, aucune donnée revendue.' },
  { q: 'Les robots sont-ils comptés ?', a: 'Non. Les robots connus, les aperçus de liens et les navigateurs automatisés (headless, WebDriver) sont filtrés côté navigateur et côté serveur.' },
  { q: 'Comment savoir quel post 𝕏 m’amène des visiteurs ?', a: 'X ne transmet que « t.co » comme référent. Créez un lien traçable dans la vue Réseaux sociaux : chaque visite est attribuée à son post. Avec votre clé de l’API X, les posts qui citent votre domaine s’affichent aussi.' },
  { q: 'Puis-je m’exclure de mes propres statistiques ?', a: 'Oui : ouvrez votre site une fois avec ?ml_ignore=true dans l’adresse. Revenez avec ?ml_ignore=false pour annuler.' },
  { q: 'Dois-je payer pour commencer ?', a: 'Non : 0,00 € à payer aujourd’hui et aucune carte requise pour démarrer avec Starter.' },
];

const fmtDur = (ms: number) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s} s`; };

/** Hero product shot: the real dashboard UI, rendered with live aggregated numbers of the public demo site. */
function ProductPreview() {
  const { data, failed, siteId } = useLivePreview();
  const change = data?.previous.visitors ? Math.round(((data.current.visitors - data.previous.visitors) / data.previous.visitors) * 100) : null;
  const demoHref = '/demo' + (siteId ? `?site=${encodeURIComponent(siteId)}` : '');
  const kpis: [string, string | null, string | null][] = [
    ['Visiteurs', data ? nf(data.current.visitors) : null, change !== null ? `${change >= 0 ? '+' : '−'}${Math.abs(change)} %` : null],
    ['Pages vues', data ? nf(data.current.pageviews) : null, null],
    ['Visites', data ? nf(data.current.sessions) : null, null],
    ['Durée moyenne', data ? fmtDur(data.current.avgDurationMs) : null, null],
  ];
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
            {kpis.map(([l, v, d]) => (
              <div key={l} className="min-w-0 px-4 py-3.5 sm:px-5">
                <div className="text-[12px] text-ink-3">{l}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="tnum text-[20px] font-semibold tracking-tight sm:text-[22px]">{v ?? <span className="ml-skeleton inline-block h-5 w-14 align-middle" />}</span>
                  {d && <span className={`tnum text-[12px] font-medium ${d.startsWith('+') ? 'text-success' : 'text-danger'}`}>{d}</span>}
                </div>
              </div>
            ))}
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
        <Link href={demoHref} className="inline-flex min-h-[32px] items-center gap-1 font-medium text-ink hover:underline hover:underline-offset-4">Ouvrir <UiIcon name="arrow-right" size={14} /></Link>
      </div>
    </div>
  );
}

const SNIPPET = '<script defer data-website-id="VOTRE_ID"\n  src="https://minilytics-six.vercel.app/js/script.js"></script>';

function SectionHead({ id, eyebrow, title, text, center = false }: { id: string; eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[13px] font-medium text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-ink [text-wrap:balance] sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-[15px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-base">{text}</p>}
    </div>
  );
}

export function Landing() {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    document.title = 'Minilytics — Des analytics simples et précis pour votre site';
  }, []);
  const nav = [['#fonctionnalites', 'Fonctionnalités'], ['#installation', 'Installation'], ['#tarifs', 'Tarifs'], ['#faq', 'FAQ']];
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <header className="sticky top-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="Minilytics, accueil" className="flex min-h-[44px] items-center rounded-md"><Logo /></Link>
            <nav aria-label="Sections de la page" className="hidden items-center gap-1 md:flex">
              {nav.map(([h, l]) => <a key={h} href={h} className="rounded-md px-3 py-2 text-[14px] text-ink-3 transition-colors hover:text-ink">{l}</a>)}
              <Link href="/demo" className="rounded-md px-3 py-2 text-[14px] text-ink-3 transition-colors hover:text-ink">Démo</Link>
            </nav>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link href="/login" className="btn-ghost hidden !text-[14px] sm:inline-flex">Se connecter</Link>
            <Link href="/signup" className="btn-dark hidden sm:inline-flex">Commencer</Link>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-well md:hidden" aria-expanded={menu} aria-controls="landing-menu" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setMenu((m) => !m)}>
              <UiIcon name={menu ? 'x' : 'menu'} size={18} />
            </button>
          </div>
        </div>
        {menu && (
          <nav id="landing-menu" aria-label="Sections de la page" className="border-t border-line px-4 pb-4 pt-2 md:hidden">
            {[...nav, ['/demo', 'Démo'], ['/login', 'Se connecter']].map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)} className="flex min-h-[48px] items-center rounded-lg px-3 text-[15px] font-medium text-ink-2 hover:bg-well">{l}</a>)}
            <Link href="/signup" onClick={() => setMenu(false)} className="btn-dark mt-2 w-full !min-h-[48px]">Commencer gratuitement</Link>
          </nav>
        )}
      </header>

      <main id="contenu">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="ml-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[560px]" aria-hidden />
          <div className="relative mx-auto max-w-[1200px] px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pb-24 lg:pt-24">
            <div className="mx-auto max-w-[760px] text-center">
              <Link href="/demo" className="inline-flex min-h-[32px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] text-ink-2 shadow-xs transition-colors hover:border-line-strong">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Démo publique en direct <UiIcon name="arrow-right" size={13} />
              </Link>
              <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink [text-wrap:balance] sm:text-6xl">
                Comprenez votre trafic, sans le superflu.
              </h1>
              <p className="mx-auto mt-5 max-w-[580px] text-[16px] leading-relaxed text-ink-3 [text-wrap:pretty] sm:text-[18px]">
                Visiteurs, sources, pages et conversions pour tout type de site : blog, landing page, boutique ou SaaS. Une balise à coller, un tableau de bord clair, en français.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className="btn-dark !h-12 !px-6 !text-[15px]">Commencer gratuitement</Link>
                <Link href="/demo" className="btn !h-12 !px-6 !text-[15px]">Voir la démo <UiIcon name="arrow-right" size={16} /></Link>
              </div>
              <p className="mt-4 text-[13px] text-ink-4">0,00 € à payer aujourd’hui · Aucune carte requise</p>
            </div>
            <div className="relative mx-auto mt-14 max-w-[1040px] sm:mt-16">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section aria-label="Pour quels sites" className="border-y border-line bg-surface">
          <ul className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-surface">
            {USE_CASES.map((u) => (
              <li key={u.title} className="px-4 py-6 last:col-span-2 sm:px-6 sm:last:col-span-1">
                <div className="flex items-center gap-2 text-[14px] font-medium text-ink"><span className="text-ink-3" aria-hidden><UiIcon name={u.icon} size={16} /></span>{u.title}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{u.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Features */}
        <section id="fonctionnalites" aria-labelledby="f-title" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
          <SectionHead id="f-title" eyebrow="Fonctionnalités" title="Tout ce qui compte, dès l’installation." text="Chaque chiffre est mesuré, jamais extrapolé. Les robots et navigateurs automatisés sont filtrés." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 [&>*]:bg-surface">
            {FEATURES.map((f) => (
              <article key={f.title} className="p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-2" aria-hidden><UiIcon name={f.icon} size={16} /></span>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{f.text}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {ADVANCED.map((f) => (
              <article key={f.title} className="rounded-xl border border-dashed border-line-strong p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[14px] font-semibold"><span className="text-ink-3" aria-hidden><UiIcon name={f.icon} size={16} /></span>{f.title}</h3>
                  <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-medium text-ink-3">En option</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-3"><span className="text-ink-2">{f.when}.</span> {f.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Install */}
        <section id="installation" aria-labelledby="i-title" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
            <div>
              <SectionHead id="i-title" eyebrow="Installation" title="Une balise. Deux minutes." text="Collez le script dans le <head> de votre site : HTML, WordPress, Webflow ou Next.js. Les pages vues, la navigation des applis monopage, le scroll, le temps actif et les clics sortants sont mesurés automatiquement." />
              <ul className="mt-6 space-y-2.5 text-[14px] text-ink-2">
                {['Script d’environ 5 Ko compressé', 'Cookies first-party uniquement, aucune donnée revendue', 'Objectifs avec un simple attribut data-ml-goal'].map((x) => (
                  <li key={x} className="flex items-center gap-2.5"><span className="text-success" aria-hidden><UiIcon name="check" size={16} /></span>{x}</li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-xl border border-line bg-canvas shadow-card">
              <div className="flex h-10 items-center justify-between border-b border-line px-4 text-[12px] text-ink-3"><span className="font-mono">index.html</span><span>HTML</span></div>
              <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-ink-2"><code>{'<head>\n  …\n  '}<span className="text-accent">{SNIPPET.split('\n')[0]}</span>{'\n  '}<span className="text-accent">{SNIPPET.split('\n')[1]}</span>{'\n</head>'}</code></pre>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="tarifs" aria-labelledby="p-title" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
          <SectionHead center id="p-title" eyebrow="Tarifs" title="Des prix simples, en euros." text="Prix mensuels, sans engagement. « Bientôt » signale ce qui n’est pas encore disponible." />
          <div className="mx-auto mt-12 grid max-w-[860px] gap-4 md:grid-cols-2">
            {PLANS.map((p) => (
              <article key={p.name} className={`relative flex flex-col rounded-xl border bg-surface p-6 sm:p-8 ${p.highlight ? 'border-ink shadow-pop' : 'border-line shadow-card'}`} aria-labelledby={`plan-${p.name}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`plan-${p.name}`} className="text-[15px] font-semibold" translate="no">{p.name}</h3>
                  {p.highlight && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-canvas">Plusieurs sites</span>}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="tnum text-5xl font-semibold tracking-tight">{p.price}&nbsp;€</span>
                  <span className="text-[14px] text-ink-3">/ mois</span>
                </div>
                <Link href="/signup" className={`${p.highlight ? 'btn-dark' : 'btn'} mt-6 w-full !h-11`}>Choisir {p.name}</Link>
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
          <p className="mx-auto mt-6 max-w-[600px] text-center text-[12px] leading-relaxed text-ink-4">Les mentions 𝕏 demandent votre propre clé de l’API X ; l’attribution des liens 𝕏 fonctionne sans clé.</p>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:py-28">
            <SectionHead id="faq-title" eyebrow="FAQ" title="Questions fréquentes" text="Une autre question ? La démo publique montre exactement ce que vous obtiendrez." />
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="shrink-0 text-ink-4 transition-transform group-open:rotate-45" aria-hidden><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
                  </summary>
                  <p className="pb-5 pr-8 text-[14px] leading-relaxed text-ink-3">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 py-20 text-center sm:px-6">
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">Voyez ce qui marche vraiment sur votre site.</h2>
            <p className="mt-3 text-[15px] text-ink-3">Une balise à coller, c’est tout.</p>
            <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Link href="/signup" className="btn-dark !h-12 !px-6 !text-[15px]">Commencer gratuitement</Link>
              <Link href="/demo" className="btn !h-12 !px-6 !text-[15px]">Voir la démo</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 text-[13px] sm:grid-cols-[1.5fr_1fr_1fr] sm:px-6" style={{ paddingBottom: 'calc(3rem + env(safe-area-inset-bottom))' }}>
          <div>
            <Logo small />
            <p className="mt-3 max-w-[280px] leading-relaxed text-ink-3">Des analytics simples et précis pour tout type de site web.</p>
            <p className="mt-4 text-ink-4">© {new Date().getFullYear()} Minilytics</p>
          </div>
          <nav aria-label="Produit" className="flex flex-col gap-2.5">
            <span className="font-medium text-ink">Produit</span>
            <a href="#fonctionnalites" className="text-ink-3 hover:text-ink">Fonctionnalités</a>
            <a href="#tarifs" className="text-ink-3 hover:text-ink">Tarifs</a>
            <Link href="/demo" className="text-ink-3 hover:text-ink">Démo publique</Link>
          </nav>
          <nav aria-label="Compte" className="flex flex-col gap-2.5">
            <span className="font-medium text-ink">Compte</span>
            <Link href="/login" className="text-ink-3 hover:text-ink">Se connecter</Link>
            <Link href="/signup" className="text-ink-3 hover:text-ink">Créer un compte</Link>
            <a href="https://github.com/bubuMMMM/minilytics" className="text-ink-3 hover:text-ink" rel="noopener noreferrer">Code source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** /signup placeholder: no payment integration yet. */
export function Signup() {
  useEffect(() => { document.title = 'Créer un compte — Minilytics'; }, []);
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12 text-center">
      <div className="ml-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <Link href="/" aria-label="Minilytics, accueil" className="relative"><Logo /></Link>
      <div className="relative mt-8 w-full max-w-[440px] rounded-xl border border-line bg-surface p-8 shadow-card">
      <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium text-ink-3">Bientôt</span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Les inscriptions ouvrent bientôt</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-3">La création de compte en libre-service n’est pas encore disponible. En attendant, explorez la démo en direct ou connectez-vous si vous avez déjà un accès.</p>
      <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row">
        <Link href="/demo" className="btn-dark flex-1 !h-11">Voir la démo</Link>
        <Link href="/login" className="btn flex-1 !h-11">Se connecter</Link>
      </div>
      </div>
      <Link href="/" className="relative mt-6 inline-flex min-h-[44px] items-center text-[13px] text-ink-3 hover:text-ink">← Retour à l’accueil</Link>
    </div>
  );
}

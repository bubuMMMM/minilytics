import { useEffect, useState } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { Sparkline } from '../components/Sparkline';
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
}

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/** Real, aggregated n0.pub numbers from the public endpoint. Never invented: if it fails, we say so. */
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

const FEATURES: { icon: Parameters<typeof UiIcon>[0]['name']; title: string; text: string }[] = [
  { icon: 'play', title: 'Vidéos', text: 'Lectures, temps réellement regardé, rétention à 10, 25, 50, 75 et 90 %, pauses et retours en arrière, vidéo par vidéo.' },
  { icon: 'megaphone', title: 'Sponsors', text: 'Impressions vraiment vues, clics (même en nouvel onglet) et taux de clic pour chaque emplacement et chaque sponsor. Export CSV.' },
  { icon: 'compass', title: 'Sources', text: 'Canaux, référents, campagnes UTM, liens 𝕏 (t.co), applis Android et navigateurs intégrés d’Instagram, TikTok ou Facebook.' },
  { icon: 'activity', title: 'Temps réel', text: 'Les visiteurs en ligne, les pages ouvertes et les événements à la seconde, avec un globe des connexions.' },
  { icon: 'smartphone', title: 'Pensé pour le mobile', text: 'Navigation au pouce, tableaux en cartes, cibles tactiles de 44 px : votre tableau de bord reste lisible sur téléphone.' },
  { icon: 'lock', title: 'Respect de la vie privée', text: 'Cookies first-party uniquement, aucune donnée revendue, paramètres sensibles retirés des URL, robots et navigateurs automatisés ignorés.' },
];

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
  { q: 'Comment installer Minilytics ?', a: 'Ajoutez une seule balise <script> dans le <head> de votre site. Les pages vues, la navigation des applications React ou Next.js, le scroll et le temps actif sont mesurés automatiquement.' },
  { q: 'Minilytics utilise-t-il des cookies ?', a: 'Oui, deux cookies first-party : un identifiant de visiteur (1 an) et un identifiant de visite (30 minutes, renouvelé à chaque action). Aucun cookie tiers, aucune donnée revendue.' },
  { q: 'Les robots sont-ils comptés ?', a: 'Non. Les robots connus, les aperçus de liens et les navigateurs automatisés (headless, WebDriver) sont filtrés côté navigateur et côté serveur.' },
  { q: 'Comment mesurer un emplacement sponsor ?', a: 'Ajoutez data-ml-block="nom-de-l-emplacement" et data-ml-sponsor="Nom du sponsor" sur l’élément. Les impressions (au moins 50 % visibles pendant 1 seconde) et les clics remontent tout seuls dans la vue Sponsors.' },
  { q: 'Puis-je m’exclure de mes propres statistiques ?', a: 'Oui : ouvrez votre site une fois avec ?ml_ignore=true dans l’adresse. Revenez avec ?ml_ignore=false pour annuler.' },
  { q: 'Dois-je payer pour commencer ?', a: 'Non : 0,00 € à payer aujourd’hui et aucune carte requise pour démarrer avec Starter.' },
];

function LiveCard() {
  const { data, failed, siteId } = useLivePreview();
  const change = data?.previous.visitors ? Math.round(((data.current.visitors - data.previous.visitors) / data.previous.visitors) * 100) : null;
  const demoHref = '/demo' + (siteId ? `?site=${encodeURIComponent(siteId)}` : '');
  return (
    <div className="ml-bento relative overflow-hidden p-5 sm:p-6" aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf0f7] pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef1ff] text-[#4f62ef]" aria-hidden><UiIcon name="activity" size={18} /></span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Données réelles, en direct</div>
            <div className="truncate text-[12px] text-[#8b97aa]" translate="no">{data?.site.domain ?? 'n0.pub'} · 7 derniers jours</div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#ecfbf4] px-2.5 py-1 text-[11px] font-semibold text-[#14895f]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1fb57f]" aria-hidden /> {data ? `${nf(data.online)} en ligne` : 'En direct'}
        </span>
      </div>
      {failed ? (
        <p className="py-10 text-center text-[13px] text-[#6f7d94]">L’aperçu en direct est momentanément indisponible. <Link href="/demo" className="font-semibold text-[#2f3fd0] underline-offset-2 hover:underline">Ouvrir la démo</Link></p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ['Visiteurs', data ? nf(data.current.visitors) : null],
              ['Pages vues', data ? nf(data.current.pageviews) : null],
              ['Visites', data ? nf(data.current.sessions) : null],
            ].map(([l, v]) => (
              <div key={l} className="min-w-0">
                <div className="text-[11px] text-[#8b97aa]">{l}</div>
                <div className="tnum mt-1 h-8 text-[clamp(20px,3vw,28px)] font-semibold leading-8 tracking-[-.04em]">{v ?? <span className="ml-skeleton inline-block h-6 w-16 align-middle" />}</div>
              </div>
            ))}
          </div>
          {change !== null && <div className="mt-1 text-[12px] text-[#6f7d94]"><span className={change >= 0 ? 'font-semibold text-[#14895f]' : 'font-semibold text-[#c3525f]'}>{change >= 0 ? '+' : ''}{change} %</span> de visiteurs vs. les 7 jours précédents</div>}
          <div className="mt-4 h-[96px] text-[#4f62ef]">{data ? <Sparkline data={data.series.map((s) => s.visitors)} height={96} width={400} className="text-[#4f62ef]" /> : <div className="ml-skeleton h-full" />}</div>
          <div className="mt-4 grid gap-4 border-t border-[#edf0f7] pt-4 sm:grid-cols-2">
            {([['Top pages', data?.pages], ['Top sources', data?.sources]] as const).map(([title, rows]) => (
              <div key={title} className="min-w-0">
                <div className="mb-2 text-[12px] font-semibold text-[#56657e]">{title}</div>
                <ul className="space-y-1.5">
                  {(rows ?? [null, null, null]).slice(0, 3).map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
                      {r ? <><span className="min-w-0 truncate" translate="no">{title === 'Top sources' ? channelName(r.label) : r.label}</span><span className="tnum shrink-0 text-[#6f7d94]">{nf(r.value)}</span></> : <span className="ml-skeleton h-4 w-full" />}
                    </li>
                  ))}
                  {rows && rows.length === 0 && <li className="text-[12px] text-[#9aa7ba]">Pas encore de données</li>}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      <Link href={demoHref} className="btn mt-5 w-full">Voir toute la démo <UiIcon name="arrow-right" size={16} /></Link>
    </div>
  );
}

/** Illustration of the dashboard's navigation (no numbers: nothing to fake). */
function AppFrame() {
  const rows: [Parameters<typeof UiIcon>[0]['name'], string, string][] = [
    ['bar-chart', 'Vue d’ensemble', 'Visiteurs, pages vues, rebond, durée'],
    ['play', 'Vidéos', 'Lectures, temps regardé, rétention'],
    ['megaphone', 'Sponsors', 'Impressions, clics, CTR par emplacement'],
    ['grid', 'Contenus', 'Sections et vidéos vraiment vues'],
    ['compass', 'Sources', 'Canaux, référents, UTM, pays, appareils'],
    ['activity', 'Temps réel', 'Qui est en ligne, maintenant'],
  ];
  return (
    <div className="ml-bento overflow-hidden p-0" aria-label="Aperçu des vues du tableau de bord">
      <div className="flex items-center gap-1.5 border-b border-[#eef1f6] px-4 py-3" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ffb4a8]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffd98a]" /><span className="h-2.5 w-2.5 rounded-full bg-[#a7e3c4]" />
        <span className="ml-3 truncate text-[12px] text-[#9aa7ba]" translate="no">minilytics / n0.pub</span>
      </div>
      <ul className="divide-y divide-[#f1f4f9]">
        {rows.map(([icon, title, text]) => (
          <li key={title} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1f3ff] text-[#4f62ef]" aria-hidden><UiIcon name={icon} size={17} /></span>
            <div className="min-w-0"><div className="text-[14px] font-semibold">{title}</div><div className="truncate text-[12px] text-[#8b97aa]">{text}</div></div>
            <span className="ml-auto text-[#c3cbe0]" aria-hidden><UiIcon name="arrow-right" size={16} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Landing() {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    document.title = 'Minilytics — Analytics simple et précis pour vos sites';
  }, []);
  const nav = [['#fonctionnalites', 'Fonctionnalités'], ['#demo', 'Démo'], ['#tarifs', 'Tarifs'], ['#faq', 'FAQ']];
  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <header className="sticky top-0 z-50 border-b border-[#ecf0f6] bg-white/90 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-[64px] max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Minilytics, accueil" className="rounded-lg"><Logo /></Link>
          <nav aria-label="Sections de la page" className="hidden items-center gap-1 md:flex">
            {nav.map(([h, l]) => <a key={h} href={h} className="rounded-lg px-3 py-2 text-[14px] font-medium text-[#56657e] transition-colors hover:text-[#17213a]">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn !min-h-[40px] !px-3 sm:!px-4">Se connecter</Link>
            <Link href="/signup" className="btn-dark hidden !min-h-[40px] sm:inline-flex">Commencer</Link>
            <button type="button" className="ml-cmd-btn md:hidden" aria-expanded={menu} aria-controls="landing-menu" aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} onClick={() => setMenu((m) => !m)}>
              <UiIcon name={menu ? 'x' : 'menu'} size={18} />
            </button>
          </div>
        </div>
        {menu && (
          <nav id="landing-menu" aria-label="Sections de la page" className="border-t border-[#ecf0f6] px-4 pb-4 pt-2 md:hidden">
            {nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenu(false)} className="flex min-h-[48px] items-center rounded-xl px-3 text-[15px] font-semibold text-[#33415c]">{l}</a>)}
            <Link href="/signup" onClick={() => setMenu(false)} className="btn-dark mt-2 w-full">Commencer gratuitement</Link>
          </nav>
        )}
      </header>

      <main id="contenu">
        {/* Hero */}
        <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pb-24 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e3e8ff] bg-[#f6f7ff] px-3 py-1.5 text-[12px] font-semibold text-[#4f62ef]"><UiIcon name="sparkles" size={14} /> Vidéos, sponsors et sources, au même endroit</span>
            <h1 className="mt-6 text-[clamp(2.4rem,6.4vw,4.6rem)] font-semibold leading-[1.03] tracking-[-.06em] text-[#101a32] [text-wrap:balance]">
              Des analytics simples, <span className="text-[#4f62ef]">enfin précis.</span>
            </h1>
            <p className="mt-5 max-w-[540px] text-[16px] leading-[1.75] text-[#5f6d84] sm:text-[17px] [text-wrap:pretty]">
              Sachez quelles vidéos sont vraiment regardées, combien de fois chaque sponsor est vu et cliqué, et d’où viennent vos visiteurs. Une balise à coller, un tableau de bord clair, en français.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="btn-dark !min-h-[50px] !px-6 text-[15px]">Commencer gratuitement <UiIcon name="arrow-right" size={17} /></Link>
              <Link href="/demo" className="btn !min-h-[50px] !px-6 text-[15px]"><UiIcon name="eye" size={17} /> Voir la démo en direct</Link>
            </div>
            <p className="mt-4 text-[13px] text-[#6f7d94]">0,00 € à payer aujourd’hui. Aucune carte requise.</p>
          </div>
          <LiveCard />
        </section>

        {/* Features */}
        <section id="fonctionnalites" aria-labelledby="f-title" className="border-t border-[#f0f2f7] bg-[#fbfcff]">
          <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:py-24">
            <div className="max-w-2xl">
              <div className="ml-kicker">FONCTIONNALITÉS</div>
              <h2 id="f-title" className="mt-3 text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-tight tracking-[-.05em] [text-wrap:balance]">Tout ce qui compte, sans le superflu.</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#6f7d94]">Chaque chiffre est mesuré, jamais extrapolé. Chaque vue répond à une question précise.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.title} className="ml-bento p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef1ff] text-[#4f62ef]" aria-hidden><UiIcon name={f.icon} size={21} /></span>
                  <h3 className="mt-4 text-[17px] font-semibold tracking-[-.02em]">{f.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#5f6d84]">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Demo */}
        <section id="demo" aria-labelledby="d-title" className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="ml-kicker">DÉMO EN DIRECT</div>
              <h2 id="d-title" className="mt-3 text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-tight tracking-[-.05em] [text-wrap:balance]">Le vrai trafic de n0.pub, sous vos yeux.</h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#6f7d94]">La démo publique affiche des statistiques agrégées et réelles : visiteurs, pages, sources, appareils, vidéos les plus regardées et globe des connexions. Aucune donnée personnelle, aucun trafic fictif.</p>
              <ul className="mt-6 space-y-3 text-[14px] text-[#33415c]">
                {['Actualisée automatiquement', 'Choix de la période : 7 ou 30 jours', 'Fonctionne aussi bien sur téléphone'].map((x) => (
                  <li key={x} className="flex items-center gap-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ecfbf4] text-[#14895f]" aria-hidden><UiIcon name="check" size={14} /></span>{x}</li>
                ))}
              </ul>
              <Link href="/demo" className="btn-dark mt-8 !min-h-[48px] !px-6">Ouvrir la démo <UiIcon name="arrow-right" size={16} /></Link>
            </div>
            <AppFrame />
          </div>
        </section>

        {/* Pricing */}
        <section id="tarifs" aria-labelledby="p-title" className="border-t border-[#f0f2f7] bg-[#fbfcff]">
          <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <div className="ml-kicker justify-center">TARIFS</div>
              <h2 id="p-title" className="mt-3 text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-tight tracking-[-.05em]">Des prix simples, en euros.</h2>
              <p className="mt-3 text-[15px] text-[#6f7d94]">Prix mensuels, en euros. Sans engagement de carte pour démarrer.</p>
            </div>
            <div className="mx-auto mt-10 grid max-w-[880px] gap-5 md:grid-cols-2">
              {PLANS.map((p) => (
                <article key={p.name} className={`ml-bento flex flex-col p-6 sm:p-8 ${p.highlight ? 'ring-2 ring-[#4f62ef]' : ''}`} aria-labelledby={`plan-${p.name}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 id={`plan-${p.name}`} className="text-[18px] font-semibold" translate="no">{p.name}</h3>
                    {p.highlight && <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-semibold text-[#2f3fd0]">Plusieurs sites</span>}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="tnum text-[48px] font-semibold leading-none tracking-[-.05em]">{p.price}&nbsp;€</span>
                    <span className="text-[15px] text-[#6f7d94]">/mois</span>
                  </div>
                  <ul className="mt-6 flex-1 space-y-3 text-[14px] text-[#33415c]">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5"><span className="mt-0.5 text-[#4f62ef]" aria-hidden><UiIcon name="check" size={16} /></span>{f}</li>
                    ))}
                  </ul>
                  <Link href="/signup" className={`${p.highlight ? 'btn-dark' : 'btn'} mt-8 w-full !min-h-[48px]`}>Choisir {p.name}</Link>
                  {p.note && <p className="mt-3 text-center text-[13px] text-[#6f7d94]">{p.note}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-[820px] px-4 py-16 sm:px-6 lg:py-24">
          <div className="ml-kicker">QUESTIONS FRÉQUENTES</div>
          <h2 id="faq-title" className="mt-3 text-[clamp(1.8rem,4vw,2.6rem)] font-semibold tracking-[-.05em]">Vos questions, nos réponses.</h2>
          <div className="mt-8 divide-y divide-[#eef1f6] border-y border-[#eef1f6]">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="shrink-0 text-[#8b97aa] transition-transform group-open:rotate-180" aria-hidden><UiIcon name="chevron-down" size={18} /></span>
                </summary>
                <p className="pb-5 text-[15px] leading-relaxed text-[#5f6d84]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[24px] bg-[#101a32] p-8 text-white sm:p-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-[clamp(1.5rem,3vw,2.1rem)] font-semibold tracking-[-.04em]">Prêt à voir ce qui marche vraiment ?</h2>
              <p className="mt-2 text-[15px] text-[#b8c2d8]">Une balise à coller, c’est tout. 0,00 € à payer aujourd’hui.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/signup" className="btn-dark !min-h-[48px] !bg-white !px-6 !text-[#101a32] hover:!bg-[#eef1ff]">Commencer</Link>
              <Link href="/login" className="inline-flex min-h-[48px] items-center justify-center rounded-[11px] border border-white/20 px-6 text-sm font-semibold text-white hover:bg-white/10">Se connecter</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ecf0f6]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 text-[13px] text-[#6f7d94] sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-3"><Logo small /><span>© {new Date().getFullYear()} Minilytics</span></div>
          <nav aria-label="Liens du pied de page" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="#fonctionnalites" className="hover:text-[#17213a]">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-[#17213a]">Tarifs</a>
            <Link href="/demo" className="hover:text-[#17213a]">Démo</Link>
            <Link href="/login" className="hover:text-[#17213a]">Se connecter</Link>
            <a href="https://github.com/bubuMMMM/minilytics" className="hover:text-[#17213a]" rel="noopener noreferrer">Code source</a>
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12 text-center">
      <Link href="/" aria-label="Minilytics, accueil"><Logo /></Link>
      <h1 className="mt-8 text-[clamp(1.7rem,5vw,2.4rem)] font-semibold tracking-[-.04em]">Les inscriptions ouvrent bientôt</h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#5f6d84]">La création de compte en libre-service n’est pas encore disponible. En attendant, explorez la démo en direct ou connectez-vous si vous avez déjà un accès.</p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <Link href="/demo" className="btn-dark flex-1 !min-h-[48px]">Voir la démo</Link>
        <Link href="/login" className="btn flex-1 !min-h-[48px]">Se connecter</Link>
      </div>
      <Link href="/" className="mt-6 text-[13px] font-medium text-[#4f62ef] underline-offset-2 hover:underline">← Retour à l’accueil</Link>
    </div>
  );
}

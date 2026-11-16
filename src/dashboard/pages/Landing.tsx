import { useEffect, useState } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { UiIcon } from '../components/UiIcon';
import { PLANS as PLAN_LIMITS } from '../../shared/plans';
import { botsLabel, pricingCards, quotaFaq } from '../lib/planLabels';
import { FeaturesBento } from './LandingFeatures';
import { LandingLiveGlobe } from './LandingGlobe';
import { LandingBeams } from './LandingBeams';
import { LandingCompare } from './LandingCompare';
import { LandingHero } from './LandingHero';
import { SectionHead, ShimmerLink, ToolsMarquee, useActiveSection, useReveal } from './LandingUi';

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
  { q: 'Comment savoir quel post X m’amène des visiteurs ?', a: 'X ne transmet que « t.co » comme référent. Créez un lien traçable dans la vue Réseaux sociaux : chaque visite est attribuée à son post. Avec votre clé de l’API X, les posts qui citent votre domaine s’affichent aussi.' },
  { q: 'Puis-je m’exclure de mes propres statistiques ?', a: 'Oui : ouvrez votre site une fois avec ?ml_ignore=true dans l’adresse. Revenez avec ?ml_ignore=false pour annuler.' },
  { q: 'Dois-je payer pour commencer ?', a: 'Non. Les inscriptions ouvrent progressivement : réservez votre place sur la liste d’attente, sans carte bancaire. Vous recevrez un e-mail à l’ouverture, et la démo publique est accessible dès maintenant.' },
  quotaFaq(),
];

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
    <section ref={ref} aria-labelledby="sc-title" className="ml-reveal mx-auto max-w-[1200px] px-4 pb-[var(--section-y)] sm:px-6">
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
            <div className={`relative mt-auto min-w-0 ${wide ? 'border-t border-line md:border-l md:border-t-0' : 'border-t border-line'} bg-well p-4 sm:p-5`}>
              <div className="ml-frame overflow-hidden rounded-[12px] border border-line shadow-[var(--elev-1)]">
                <img src={`/landing/${f.key}-light.webp`} alt={`Aperçu de ${f.kicker}`} loading="eager" decoding="async" width={1200} height={760} className="block aspect-[1200/760] h-auto w-full object-cover object-top dark:hidden" />
                <img src={`/landing/${f.key}-dark.webp`} alt={`Aperçu de ${f.kicker}`} loading="eager" decoding="async" width={1200} height={760} className="hidden aspect-[1200/760] h-auto w-full object-cover object-top dark:block" />
              </div>
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

export function Landing() {
  const [menu, setMenu] = useState(false);
  const active = useActiveSection(['fonctionnalites', 'installation', 'comparaison', 'tarifs', 'faq']);
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
            <Link href="/login" className="btn-ghost !text-[14px] hidden sm:inline-flex">Se connecter</Link>
            <ShimmerLink href="/signup" className="!hidden !min-h-[36px] !whitespace-nowrap !px-3 !text-[13px] sm:!inline-flex">Réserver mon accès</ShimmerLink>
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
        <LandingHero />
        <div className="ml-tools-row mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 sm:pb-20">
          <p className="ml-kicker mb-4 text-center">Fonctionne avec</p>
          <ToolsMarquee />
          <p id="uc-title" className="mx-auto mt-8 max-w-[40rem] text-center text-[13px] leading-relaxed text-ink-3 sm:text-[14px]">
            Pour les blogs et les médias, les landing pages, l’e-commerce, le SaaS et les portfolios.
          </p>
        </div>

        <Showcase />

        <section id="fonctionnalites" aria-labelledby="f-title" className="relative mx-auto max-w-[1200px] scroll-mt-20 px-4 py-[var(--section-y)] sm:px-6">
          <FeaturesBento />
        </section>

        <LandingLiveGlobe />
        <LandingBeams />

        <section id="installation" ref={installRef} aria-labelledby="i-title" className="ml-reveal scroll-mt-20 border-y border-line">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-[var(--section-y)] sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHead id="i-title" eyebrow="Installation" title="Une balise. Deux minutes." text="Collez le script dans le <head> de votre site : HTML, WordPress, Webflow ou Next.js. Les pages vues, la navigation des applis monopage, le scroll, le temps actif et les clics sortants sont mesurés automatiquement." />
              <ul className="mt-6 space-y-2.5 text-[14px] text-ink-2">
                {['Objectifs avec un simple attribut data-ml-goal', 'Applis monopage (React, Next, Vue) mesurées automatiquement', 'Robots filtrés côté navigateur et serveur'].map((x) => (
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

        <section id="tarifs" ref={priceRef} aria-labelledby="p-title" className="ml-reveal mx-auto max-w-[1200px] scroll-mt-20 px-4 py-[var(--section-y)] sm:px-6">
          <SectionHead center id="p-title" eyebrow="Tarifs" title="Des prix simples, en euros." text="Prix mensuels, sans engagement. Réservez votre place dès aujourd’hui, vous ne payez qu’à l’ouverture." />
          <div className="mx-auto mt-12 grid max-w-[860px] gap-4 md:grid-cols-2">
            {PLANS.map((p) => (
              <article key={p.name} className={`ml-price-card relative flex flex-col border bg-surface p-6 sm:p-8 ${p.highlight ? 'is-featured border-ink' : 'border-line'}`} aria-labelledby={`plan-${p.name}`}>
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
                  ? <ShimmerLink href={`/signup?plan=${p.name.toLowerCase()}`} className="mt-6 w-full !h-11">Réserver mon accès</ShimmerLink>
                  : <Link href={`/signup?plan=${p.name.toLowerCase()}`} className="btn mt-6 w-full !h-11">Réserver mon accès</Link>}
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
          <p className="mx-auto mt-6 max-w-[600px] text-center text-[12px] leading-relaxed text-ink-4">Les mentions X demandent votre propre clé de l’API X ; l’attribution des liens X fonctionne sans clé. Pas de tarif annuel pour le moment : les prix affichés sont mensuels.</p>
        </section>

        <section id="faq" ref={faqRef} aria-labelledby="faq-title" className="ml-reveal scroll-mt-20 border-t border-line">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-[var(--section-y)] sm:px-6 md:grid-cols-[1fr_1.6fr] md:gap-16">
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

        <section ref={ctaRef} className="ml-reveal px-4 py-16 sm:px-6 sm:py-[var(--section-y)]">
          <div className="ml-cta-panel relative mx-auto max-w-[1200px] overflow-hidden px-6 py-16 text-center sm:px-10 sm:py-20">
            <div className="relative">
              <p className="ml-kicker">Prêt à voir clair</p>
              <h2 className="ml-title mx-auto mt-3 max-w-xl">Voyez ce qui marche vraiment sur votre site.</h2>
              <p className="ml-lead mx-auto mt-4">Une balise à coller, c’est tout. Liste d’attente gratuite, aucune carte requise.</p>
              <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:justify-center">
                <ShimmerLink href="/signup">Réserver mon accès</ShimmerLink>
                <Link href="/demo" className="btn !h-12 !px-6 !text-[15px]">Voir la démo</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="ml-footer border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 text-[13px] sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr]" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          <div>
            <Logo small />
            <p className="mt-3 max-w-[280px] leading-relaxed text-ink-3">Des analytics simples et précis pour tout type de site web.</p>
            <p className="mt-4 text-ink-4">© {new Date().getFullYear()} Minilytics</p>
          </div>
          <nav aria-label="Produit" className="flex flex-col gap-2.5">
            <span className="ml-kicker mb-3">Produit</span>
            <a href="#fonctionnalites" className="text-ink-3 hover:text-ink">Fonctionnalités</a>
            <a href="#installation" className="text-ink-3 hover:text-ink">Installation</a>
            <a href="#comparaison" className="text-ink-3 hover:text-ink">Comparaison</a>
            <a href="#tarifs" className="text-ink-3 hover:text-ink">Tarifs</a>
            <Link href="/demo" className="text-ink-3 hover:text-ink">Démo publique</Link>
          </nav>
          <nav aria-label="Ressources" className="flex flex-col gap-2.5">
            <span className="ml-kicker mb-3">Ressources</span>
            <a href="#faq" className="text-ink-3 hover:text-ink">FAQ</a>
            <Link href="/api-docs" className="text-ink-3 hover:text-ink">Documentation API</Link>
            <a href="https://github.com/bubuMMMM/minilytics" className="text-ink-3 hover:text-ink" rel="noopener noreferrer">Code source</a>
          </nav>
          <nav aria-label="Compte" className="flex flex-col gap-2.5">
            <span className="ml-kicker mb-3">Compte</span>
            <Link href="/login" className="text-ink-3 hover:text-ink">Se connecter</Link>
            <Link href="/signup" className="text-ink-3 hover:text-ink">Liste d’attente</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

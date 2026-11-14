import { UiIcon } from '../components/UiIcon';
import { SectionHead, useReveal } from './LandingUi';

type Cell = { ml: string; ga: string };

/** Factual comparison only — no invented market share, scores or testimonials. */
const ROWS: { label: string; cells: Cell }[] = [
  { label: 'Script', cells: { ml: '≈ 6 Ko compressé', ga: 'Script typiquement beaucoup plus lourd (gtag ou gestionnaire de tags)' } },
  { label: 'Cookies', cells: { ml: 'First-party uniquement, avec une option sans cookie', ga: 'Cookies Google ; les données sont traitées par Google' } },
  { label: 'Données revendues', cells: { ml: 'Non', ga: 'Modèle publicitaire de Google' } },
  { label: 'Interface', cells: { ml: 'En français, centrée sur le site, les sources et les revenus', ga: 'Interface vaste, pensée pour l’écosystème Google' } },
  { label: 'Revenus', cells: { ml: 'Attribution depuis Stripe, Lemon Squeezy, Polar et Dodo Payments', ga: 'E-commerce à configurer dans GA4' } },
  { label: 'Robots d’IA', cells: { ml: 'Vue dédiée (GPTBot, ClaudeBot, Perplexity…)', ga: 'Pas de vue équivalente dédiée aux robots d’IA' } },
  { label: 'Carte en direct', cells: { ml: 'Globe, replay 30 min ou 24 h, flux des visites', ga: 'Temps réel, sans cette carte' } },
  { label: 'Conservation', cells: { ml: '3 ans (Starter) à 5 ans et plus (Growth)', ga: '2 ou 14 mois par défaut' } },
  { label: 'Code source', cells: { ml: 'Ouvert sur GitHub', ga: 'Propriétaire' } },
  { label: 'Prix', cells: { ml: '9 € ou 19 € par mois, en euros', ga: 'GA4 est gratuit avec un compte Google ; Analytics 360 est sur devis' } },
  { label: 'Installation', cells: { ml: 'Une balise à coller', ga: 'Compte Google, balise, souvent un gestionnaire de tags' } },
];

export function LandingCompare() {
  const ref = useReveal<HTMLElement>();
  return (
    <section id="comparaison" ref={ref} aria-labelledby="cmp-title" className="ml-reveal scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:py-28">
        <SectionHead
          center
          id="cmp-title"
          eyebrow="Comparaison"
          title="Face à Google Analytics, l’essentiel, sans le superflu."
          text="Des faits, pas un classement. Minilytics couvre le quotidien d’un site — sources, revenus, carte, robots d’IA — dans une interface en français."
        />
        <div className="mx-auto mt-12 max-w-[920px] overflow-hidden rounded-2xl border border-line bg-canvas shadow-xs">
          <table className="ml-cmp hidden w-full text-left md:table">
            <thead>
              <tr>
                <th scope="col" className="w-[22%] px-5 py-3.5 text-[12px] font-medium text-ink-4">Critère</th>
                <th scope="col" className="w-[39%] px-5 py-3.5 text-[12px] font-semibold text-ink">Minilytics</th>
                <th scope="col" className="w-[39%] px-5 py-3.5 text-[12px] font-medium text-ink-3">Google Analytics 4</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="px-5 py-3.5 align-top text-[13px] font-medium text-ink-2">{row.label}</th>
                  <td className="ml-cmp-ml px-5 py-3.5 align-top text-[13px] leading-relaxed text-ink">
                    <span className="inline-flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-success" aria-hidden><UiIcon name="check" size={15} /></span>
                      <span>{row.cells.ml}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 align-top text-[13px] leading-relaxed text-ink-3">{row.cells.ga}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line md:hidden">
            {ROWS.map((row) => (
              <li key={row.label} className="px-4 py-4">
                <div className="text-[12px] font-medium uppercase tracking-wide text-ink-4">{row.label}</div>
                <div className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink">
                  <span className="mt-0.5 shrink-0 text-success" aria-hidden><UiIcon name="check" size={15} /></span>
                  <span><span className="font-medium">Minilytics — </span>{row.cells.ml}</span>
                </div>
                <div className="mt-1.5 pl-6 text-[13px] leading-relaxed text-ink-3">
                  <span className="font-medium text-ink-2">GA4 — </span>{row.cells.ga}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="mx-auto mt-5 max-w-[60ch] text-center text-[12px] leading-relaxed text-ink-4">
          Google Analytics 4 est un produit de Google. Les éléments ci-dessus décrivent le fonctionnement habituel de GA4, pas une offre particulière.
        </p>
      </div>
    </section>
  );
}

import { comparePriceCell, compareQuotaCell, compareRetentionCell } from '../lib/planLabels';
import { SectionHead, useReveal } from './LandingUi';

/**
 * Comparatif factuel, vérifié en nov. 2026.
 * Sources (URL et extraits) : docs/comparaison-sources.md
 * — https://plausible.io/ + https://plausible.io/docs/subscription-plans + https://plausible.io/plausible-umami-fathom-simple-analytics
 * — https://usefathom.com/pricing + https://usefathom.com/docs/account/faq
 * — https://datafa.st/ + https://datafa.st/tos
 * — https://marketingplatform.google.com/about/analytics/ + https://support.google.com/analytics/answer/11202874
 * Prix concurrents en USD, hors taxes. Minilytics en euros. Cellule « — » si le fait n’est pas publié clairement.
 */
type Col = 'ml' | 'plausible' | 'fathom' | 'datafast' | 'ga';

const COLS: { key: Col; label: string; href?: string }[] = [
  { key: 'ml', label: 'Minilytics' },
  { key: 'plausible', label: 'Plausible', href: 'https://plausible.io/' },
  { key: 'fathom', label: 'Fathom', href: 'https://usefathom.com/pricing' },
  { key: 'datafast', label: 'DataFast', href: 'https://datafa.st/' },
  { key: 'ga', label: 'GA4', href: 'https://marketingplatform.google.com/about/analytics/' },
];

const ROWS: { label: string; cells: Record<Col, string> }[] = [
  {
    label: 'Prix',
    cells: {
      ml: comparePriceCell(),
      plausible: 'Dès 9 $/mois (10k pages vues, Starter) ; 19 $/mois à 100k pages vues (Starter)',
      fathom: 'Dès 15 $/mois, jusqu’à 100k pages vues (pas d’offre 10k)',
      datafast: 'Starter : 9 $/mois (10k ev.) ou 19 $/mois (100k). Growth : 19 $/mois (10k) ou 39 $/mois (100k)',
      ga: 'Gratuit avec un compte Google ; Analytics 360 sur devis',
    },
  },
  {
    label: 'Volume',
    cells: {
      ml: compareQuotaCell(),
      plausible: 'Pages vues et événements, tous sites de l’équipe',
      fathom: 'Pages vues et événements, tous sites du compte',
      datafast: 'Événements mensuels (pages vues, objectifs, paiements), tous sites',
      ga: 'Offre gratuite, sous les limites d’une propriété standard',
    },
  },
  {
    label: 'Essai',
    cells: {
      ml: 'Liste d’attente, sans carte',
      plausible: '30 jours, sans carte',
      fathom: '7 jours, carte requise',
      datafast: '14 jours, sans carte',
      ga: 'Accès direct à l’offre gratuite',
    },
  },
  {
    label: 'Cookies',
    cells: {
      ml: 'First-party uniquement, avec une option sans cookie',
      plausible: 'Pas de cookies',
      fathom: 'Aucune bannière de cookies requise (mention officielle)',
      datafast: 'Script par défaut avec cookies ; script sans cookie proposé',
      ga: 'Cookies ; les données sont traitées par Google',
    },
  },
  {
    label: 'Script',
    cells: {
      ml: '≈ 7 Ko compressé',
      plausible: 'Annoncé 54× plus léger que Google Analytics',
      fathom: '—',
      datafast: '—',
      ga: 'Balise gtag ou gestionnaire de tags ; taille non publiée par Google',
    },
  },
  {
    label: 'Conservation',
    cells: {
      ml: compareRetentionCell(),
      plausible: '—',
      fathom: 'Historique complet pendant l’abonnement',
      datafast: '3 ans (Starter) ou 5 ans et plus (Growth)',
      ga: '2 ou 14 mois sur une propriété standard',
    },
  },
  {
    label: 'Revenus',
    cells: {
      ml: 'Attribution depuis Stripe, Lemon Squeezy, Polar et Dodo Payments',
      plausible: 'Suivi des revenus sur le plan Business',
      fathom: 'Suivi des événements et des revenus, inclus dans tous les plans',
      datafast: 'Attribution des revenus aux canaux d’acquisition',
      ga: 'E-commerce à configurer dans GA4',
    },
  },
  {
    label: 'Code source',
    cells: {
      ml: 'Ouvert sur GitHub',
      plausible: 'Open source (édition communautaire)',
      fathom: '—',
      datafast: '—',
      ga: 'Propriétaire',
    },
  },
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
          title="L’essentiel, face aux outils que l’on compare souvent."
          text="Des faits publiés, pas un classement. Prix, cookies, script et conservation tels que les sites officiels les indiquent en novembre 2026."
        />
        <div className="ml-cmp-wrap mt-12 overflow-x-auto rounded-2xl border border-line bg-canvas shadow-xs">
          <table className="ml-cmp w-full min-w-[920px] text-left">
            <caption className="sr-only">Comparaison de Minilytics avec Plausible, Fathom, DataFast et Google Analytics 4, vérifiée en novembre 2026</caption>
            <thead>
              <tr>
                <th scope="col" className="ml-cmp-sticky w-[18%] px-4 py-3.5 text-[12px] font-medium text-ink-4 sm:px-5">Critère</th>
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 py-3.5 text-[12px] sm:px-5 ${col.key === 'ml' ? 'font-semibold text-ink' : 'font-medium text-ink-3'}`}
                  >
                    {col.href
                      ? <a href={col.href} className="underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">{col.label}</a>
                      : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="ml-cmp-sticky px-4 py-3.5 align-top text-[13px] font-medium text-ink-2 sm:px-5">{row.label}</th>
                  {COLS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 align-top text-[13px] leading-relaxed sm:px-5 ${col.key === 'ml' ? 'ml-cmp-ml text-ink' : 'text-ink-3'}`}
                    >
                      {row.cells[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-auto mt-5 max-w-[68ch] text-center text-[12px] leading-relaxed text-ink-4">
          Vérifié en nov. 2026. Prix des concurrents en USD, hors taxes ; Minilytics en euros.
          Sources : <a href="https://plausible.io/" className="underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">plausible.io</a>,{' '}
          <a href="https://usefathom.com/pricing" className="underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">usefathom.com/pricing</a>,{' '}
          <a href="https://datafa.st/" className="underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">datafa.st</a>,{' '}
          <a href="https://marketingplatform.google.com/about/analytics/" className="underline-offset-2 hover:underline" rel="noopener noreferrer" target="_blank">Google Analytics</a>
          {' '}(détail dans docs/comparaison-sources.md). Une cellule « — » signifie que le critère n’était pas publié clairement.
        </p>
      </div>
    </section>
  );
}

import { PLANS, type Plan } from '../../shared/plans';

/** Compact count used on the pricing page: 10_000 → "10k", 100_000 → "100k". */
export function fmtPlanCount(n: number, kCase: 'k' | 'K' = 'k'): string {
  if (n >= 1_000 && n % 1_000 === 0) return `${n / 1_000}${kCase}`;
  return new Intl.NumberFormat('fr-FR').format(n);
}

export function eventsPerMonthLabel(n: number): string {
  return `${fmtPlanCount(n)} événements par mois`;
}

export function sitesLabel(n: number): string {
  return n <= 1 ? '1 site' : `${n} sites`;
}

export function membersLabel(n: number): string {
  return n <= 1 ? '1 membre d’équipe' : `${n} membres d’équipe`;
}

export function retentionLabel(plan: Plan): string {
  if (plan.id === 'growth' || plan.retentionYears >= 5) return `${plan.retentionYears}+ ans de conservation`;
  return `${plan.retentionYears} ans de conservation des données`;
}

export function botsLabel(n: number): string {
  return `${fmtPlanCount(n, 'K')} requêtes de bots IA`;
}

export function pricingCards() {
  const common = ['API, CLI & MCP', 'Mentions sur les réseaux sociaux', 'Attribution des liens X'] as const;
  return [
    {
      id: PLANS.starter.id,
      name: PLANS.starter.name,
      price: String(PLANS.starter.priceEur),
      features: [
        eventsPerMonthLabel(PLANS.starter.eventsPerMonth),
        sitesLabel(PLANS.starter.sites),
        membersLabel(PLANS.starter.members),
        retentionLabel(PLANS.starter),
        botsLabel(PLANS.starter.botRequests),
        ...common,
      ],
      note: 'Aucun paiement aujourd’hui. Aucune carte requise.',
      highlight: false,
    },
    {
      id: PLANS.growth.id,
      name: PLANS.growth.name,
      price: String(PLANS.growth.priceEur),
      features: [
        eventsPerMonthLabel(PLANS.growth.eventsPerMonth),
        sitesLabel(PLANS.growth.sites),
        membersLabel(PLANS.growth.members),
        retentionLabel(PLANS.growth),
        botsLabel(PLANS.growth.botRequests),
        ...common,
      ],
      highlight: true,
    },
  ];
}

export function quotaFaq(): { q: string; a: string } {
  const s = PLANS.starter;
  const g = PLANS.growth;
  return {
    q: 'Que se passe-t-il si je dépasse mon quota d’événements ?',
    a: `${s.name} inclut ${fmtPlanCount(s.eventsPerMonth)} événements par mois, ${g.name} ${fmtPlanCount(g.eventsPerMonth)}. Au-delà, les événements sont tout de même enregistrés : le quota est indicatif. Nous vous prévenons à 80 % et à 100 % d’utilisation.`,
  };
}

export function compareQuotaCell(): string {
  const s = PLANS.starter;
  const g = PLANS.growth;
  return `${fmtPlanCount(s.eventsPerMonth)} (${s.name}) ou ${fmtPlanCount(g.eventsPerMonth)} (${g.name}) événements par mois`;
}

export function compareRetentionCell(): string {
  const s = PLANS.starter;
  const g = PLANS.growth;
  return `${s.retentionYears} ans (${s.name}) à ${g.retentionYears} ans et plus (${g.name})`;
}

export function comparePriceCell(): string {
  return `${PLANS.starter.priceEur} € ou ${PLANS.growth.priceEur} € par mois, en euros`;
}

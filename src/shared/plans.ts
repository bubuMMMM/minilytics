/** Plan limits, shared by the pricing page and the server (sites / members are enforced; events are a soft quota: ingest never drops data; we flag and notify at 80 % / 100 %). Starter 10k vs Growth 100k events/month, in line with 9 € / 19 €. */
export interface Plan { id: 'starter' | 'growth'; name: string; priceEur: number; eventsPerMonth: number; sites: number; members: number; retentionYears: number; botRequests: number }
export const PLANS: Record<Plan['id'], Plan> = {
  starter: { id: 'starter', name: 'Starter', priceEur: 9, eventsPerMonth: 10_000, sites: 1, members: 1, retentionYears: 3, botRequests: 100_000 },
  growth: { id: 'growth', name: 'Growth', priceEur: 19, eventsPerMonth: 100_000, sites: 30, members: 30, retentionYears: 5, botRequests: 100_000 },
};
export const DEFAULT_PLAN: Plan['id'] = 'growth';

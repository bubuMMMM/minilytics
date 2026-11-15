import type { Activity } from '../components/LiveGlobe';
import type { Visit } from '../map/Replay';

/** Timezone used on the landing example cards, matching the product default. */
export const EXAMPLE_TZ = 'Europe/Paris';

/**
 * Stable fictional visits for the marketing globe. Identifiers are fixed so
 * generated personas stay consistent; timestamps are relative to `now`.
 * Always labeled « exemple » in the UI — never presented as live traffic.
 */
const SEEDS: {
  visitorId: string;
  city: string;
  country: string;
  region: string;
  page: string;
  source: string;
  referrer: string | null;
  device: string;
  os: string;
  browser: string;
  ago: number;
  duration: number;
  pageviews: number;
  revenue?: number;
  currency?: string;
  goals?: number;
}[] = [
  { visitorId: 'landing-ex-paris', city: 'Paris', country: 'FR', region: 'Île-de-France', page: '/tarifs', source: 'Google', referrer: 'google.com', device: 'Desktop', os: 'macOS', browser: 'Safari', ago: 2, duration: 94_000, pageviews: 3, revenue: 2400, currency: 'EUR', goals: 1 },
  { visitorId: 'landing-ex-lisbon', city: 'Lisbonne', country: 'PT', region: 'Lisbonne', page: '/blog', source: 'X', referrer: 'x.com', device: 'Mobile', os: 'iOS', browser: 'Safari', ago: 8, duration: 41_000, pageviews: 2 },
  { visitorId: 'landing-ex-montreal', city: 'Montréal', country: 'CA', region: 'Québec', page: '/docs', source: 'Newsletter', referrer: null, device: 'Desktop', os: 'macOS', browser: 'Chrome', ago: 14, duration: 128_000, pageviews: 4 },
  { visitorId: 'landing-ex-london', city: 'Londres', country: 'GB', region: 'Angleterre', page: '/blog', source: 'ChatGPT', referrer: 'chatgpt.com', device: 'Desktop', os: 'Windows', browser: 'Chrome', ago: 21, duration: 67_000, pageviews: 2 },
  { visitorId: 'landing-ex-saopaulo', city: 'São Paulo', country: 'BR', region: 'São Paulo', page: '/inscription', source: 'Direct', referrer: null, device: 'Mobile', os: 'Android', browser: 'Chrome', ago: 27, duration: 52_000, pageviews: 3, revenue: 900, currency: 'EUR' },
  { visitorId: 'landing-ex-capetown', city: 'Le Cap', country: 'ZA', region: 'Western Cape', page: '/tarifs', source: 'Reddit', referrer: 'reddit.com', device: 'Desktop', os: 'Linux', browser: 'Firefox', ago: 35, duration: 88_000, pageviews: 2 },
];

export function exampleVisits(now = Date.now()): Visit[] {
  return SEEDS.map((s, i) => {
    const lastSeen = now - s.ago * 1000;
    return {
      id: `landing-ex-session-${i + 1}`,
      t: lastSeen - s.duration,
      lastSeen,
      visitorId: s.visitorId,
      country: s.country,
      region: s.region,
      city: s.city,
      lat: null,
      lon: null,
      source: s.source,
      channel: null,
      referrer: s.referrer,
      page: s.page,
      current: s.page,
      device: s.device,
      browser: s.browser,
      os: s.os,
      pageviews: s.pageviews,
      duration: s.duration,
      goals: s.goals,
      revenue: s.revenue,
      currency: s.currency ?? null,
    };
  });
}

export function exampleActivity(now = Date.now()): Activity {
  const visits = exampleVisits(now);
  const countries = visits
    .filter((v): v is Visit & { country: string } => !!v.country)
    .map((v) => ({ country: v.country, visitors: 1, lastSeenAt: v.lastSeen }));
  return {
    online: visits.length,
    countries,
    recentCountries: [],
    updatedAt: now,
    activeWindowMinutes: 5,
    recentWindowMinutes: 30,
  };
}

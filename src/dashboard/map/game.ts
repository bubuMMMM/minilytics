import { CONTINENTS, COUNTRIES, CONTINENT_NAME, SOVEREIGN_BY_CONTINENT, SOVEREIGN_TOTAL, countryName, type Continent } from './geo';

export interface Discovery { country: string; firstAt: number; visitors: number }
export interface DayCount { day: string; countries: number }
export interface Achievement {
  id: string;
  title: string;
  desc: string;
  group: 'pays' | 'continents' | 'régularité' | 'villes';
  unlocked: boolean;
  /** When it was unlocked, if it can be dated from the data. */
  at: number | null;
  progress?: [number, number];
}
export interface TimelineItem { country: string; name: string; continent: Continent; firstAt: number; index: number; newContinent: boolean }

export const LEVELS: { min: number; name: string }[] = [
  { min: 0, name: 'Au départ' },
  { min: 1, name: 'Local' },
  { min: 3, name: 'Régional' },
  { min: 10, name: 'Continental' },
  { min: 25, name: 'International' },
  { min: 50, name: 'Mondial' },
  { min: 100, name: 'Planétaire' },
];

export function level(countries: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && countries >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1] ?? null;
  return { index: i, name: LEVELS[i].name, next, progress: next ? (countries - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1 };
}

/** Consecutive days with at least one visit, ending today (or yesterday, so the streak is not lost before today's first visit). */
export function streak(days: DayCount[], today: string): { current: number; best: number } {
  const set = new Set(days.map((d) => d.day));
  const dayMs = 86_400_000;
  const toMs = (d: string) => Date.parse(d + 'T00:00:00Z');
  const sorted = [...set].sort();
  let best = 0, run = 0, prev = NaN;
  for (const d of sorted) {
    const t = toMs(d);
    run = t - prev === dayMs ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  let current = 0;
  let t = toMs(today);
  if (!set.has(today)) t -= dayMs;
  while (set.has(new Date(t).toISOString().slice(0, 10))) { current++; t -= dayMs; }
  return { current, best };
}

/** Countries reached for the first time that weren't known yet (used for the live celebration). */
export function newlyReached(known: Set<string>, live: { country: string }[]): string[] {
  return [...new Set(live.map((l) => l.country))].filter((c) => !known.has(c) && COUNTRIES.has(c));
}

export function timeline(discovery: Discovery[]): TimelineItem[] {
  const seen = new Set<Continent>();
  return [...discovery].sort((a, b) => a.firstAt - b.firstAt).map((d, i) => {
    const continent = COUNTRIES.get(d.country)?.continent ?? 'AN';
    const newContinent = !seen.has(continent);
    seen.add(continent);
    return { country: d.country, name: countryName(d.country), continent, firstAt: d.firstAt, index: i + 1, newContinent };
  });
}

export function continentProgress(discovery: Discovery[]) {
  const reached: Record<string, number> = {};
  for (const d of discovery) {
    const c = COUNTRIES.get(d.country);
    if (c?.sovereign) reached[c.continent] = (reached[c.continent] ?? 0) + 1;
  }
  return CONTINENTS.map((c) => ({ ...c, reached: reached[c.key] ?? 0, total: SOVEREIGN_BY_CONTINENT[c.key] ?? 0 }));
}

/** Everything is derived from the real first-visit date of each country; nothing is estimated. */
export function achievements({ discovery, days, citiesReached, today, todayStart }: {
  discovery: Discovery[]; days: DayCount[]; citiesReached: number | null; today: string; todayStart: number;
}): Achievement[] {
  const sorted = [...discovery].filter((d) => COUNTRIES.has(d.country)).sort((a, b) => a.firstAt - b.firstAt);
  const sovereign = sorted.filter((d) => COUNTRIES.get(d.country)!.sovereign);
  const out: Achievement[] = [];
  for (const n of [1, 5, 10, 25, 50, 100]) {
    out.push({
      id: 'countries-' + n,
      title: n === 1 ? 'Premier pays' : `${n} pays`,
      desc: n === 1 ? 'Un premier visiteur localisé.' : `Des visiteurs venus de ${n} pays différents.`,
      group: 'pays',
      unlocked: sovereign.length >= n,
      at: sovereign[n - 1]?.firstAt ?? null,
      progress: [Math.min(sovereign.length, n), n],
    });
  }
  const firstByContinent = new Map<Continent, number>();
  for (const d of sorted) {
    const c = COUNTRIES.get(d.country)!.continent;
    if (c !== 'AN' && !firstByContinent.has(c)) firstByContinent.set(c, d.firstAt);
  }
  for (const c of CONTINENTS) {
    out.push({ id: 'continent-' + c.key, title: CONTINENT_NAME[c.key], desc: `Premier visiteur venu d’${/^[AEIOU]/.test(c.name) ? '' : 'e '}${c.name}.`.replace('d’e ', 'de '), group: 'continents', unlocked: firstByContinent.has(c.key), at: firstByContinent.get(c.key) ?? null });
  }
  const conts = [...firstByContinent.values()].sort((a, b) => a - b);
  out.push({ id: 'world-tour', title: 'Tour du monde', desc: 'Des visiteurs sur les six continents habités.', group: 'continents', unlocked: conts.length >= 6, at: conts.length >= 6 ? conts[5] : null, progress: [conts.length, 6] });
  const newToday = sorted.filter((d) => d.firstAt >= todayStart);
  out.push({ id: 'new-today', title: 'Nouveau pays aujourd’hui', desc: newToday.length ? `Débloqué aujourd’hui : ${newToday.map((d) => countryName(d.country)).join(', ')}.` : 'Un pays jamais vu avant, atteint aujourd’hui.', group: 'pays', unlocked: newToday.length > 0, at: newToday[0]?.firstAt ?? null });
  const bestDay = days.reduce((m, d) => Math.max(m, d.countries), 0);
  out.push({ id: 'one-day-5', title: 'Journée internationale', desc: 'Des visiteurs de 5 pays le même jour.', group: 'pays', unlocked: bestDay >= 5, at: null, progress: [Math.min(bestDay, 5), 5] });
  const s = streak(days, today);
  for (const n of [7, 30]) out.push({ id: 'streak-' + n, title: `Série de ${n} jours`, desc: `Au moins une visite chaque jour pendant ${n} jours d’affilée.`, group: 'régularité', unlocked: s.best >= n, at: null, progress: [Math.min(s.best, n), n] });
  if (citiesReached !== null) for (const n of [10, 50]) out.push({ id: 'cities-' + n, title: `${n} villes`, desc: `Des visiteurs venus de ${n} villes différentes.`, group: 'villes', unlocked: citiesReached >= n, at: null, progress: [Math.min(citiesReached, n), n] });
  return out;
}

export { SOVEREIGN_TOTAL };

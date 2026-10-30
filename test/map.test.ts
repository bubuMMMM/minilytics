import { describe, expect, it, beforeAll } from 'vitest';
import { ingest } from '../src/worker/collect';
import { coord } from '../src/worker/collect';
import { liveMap, mapReport } from '../src/worker/map';
import { resolveRange, tzOffset } from '../src/worker/lib/time';
import type { Site } from '../src/worker/env';
import { achievements, continentProgress, level, newlyReached, streak, timeline } from '../src/dashboard/map/game';
import { SOVEREIGN_TOTAL } from '../src/dashboard/map/geo';
import { testDb } from './helpers/pglite-d1';

const site: Site = { id: 'site_map', name: 'Blog', domain: 'exemple.fr', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k', dodo_webhook_secret: null, created_at: 0 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOW = Date.now();
const DAY = 86_400_000;
let db: D1Database;
const send = (vid: string, geo: any, at: number) => ingest(db, site, { w: site.id, sw: 1440, t: 'pageview', u: 'https://exemple.fr/', vid, sid: 's_' + vid } as any, new URL('https://exemple.fr/'), UA, geo, at);

beforeAll(async () => {
  ({ db } = await testDb());
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  await send('visitor_fr01', { country: 'FR', region: 'PDL', city: 'Nantes', lat: 47.22, lon: -1.55 }, NOW - 40 * DAY);
  await send('visitor_fr02', { country: 'FR', region: 'IDF', city: 'Paris', lat: null, lon: null }, NOW - 2 * 60_000);
  await send('visitor_ca01', { country: 'CA', region: 'QC', city: 'Montréal', lat: 45.5, lon: -73.57 }, NOW - 3 * DAY);
  await send('visitor_jp01', { country: 'JP', region: '13', city: 'Tokyo' }, NOW - 60_000);
});

describe('carte: server aggregates', () => {
  it('parses provider coordinates safely', () => {
    expect(coord('47.21725', 90)).toBe(47.22);
    expect(coord('-200', 180)).toBeNull();
    expect(coord('abc', 90)).toBeNull();
    expect(coord(undefined, 90)).toBeNull();
  });
  it('returns countries, cities with coordinates and all-time discovery', async () => {
    const range = resolveRange({ period: '7d' }, site.timezone, 0, NOW + 1000);
    const r = await mapReport({ db, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) });
    expect(r.countries.map((c) => c.country).sort()).toEqual(['CA', 'FR', 'JP']);
    expect(r.discovery.map((d) => d.country)).toEqual(['FR', 'CA', 'JP']);
    expect(r.places.find((p) => p.city === 'Montréal')).toMatchObject({ lat: 45.5, lon: -73.57, region: 'QC' });
    expect(r.places.find((p) => p.city === 'Paris')?.lat).toBeNull();
    expect(r.citiesReached).toBe(4);
    const pub = await mapReport({ db, site, range, filters: {}, offset: 0 }, { cities: false });
    expect(pub.places).toEqual([]);
    expect(pub.citiesReached).toBeNull();
  });
  it('lists who is online now', async () => {
    const live = await liveMap(db, site.id);
    expect(live.countries.map((c) => c.country).sort()).toEqual(['FR', 'JP']);
    expect(live.online).toBe(2);
    expect((await liveMap(db, site.id, { cities: false })).places).toEqual([]);
  });
});

describe('carte: gamification', () => {
  const discovery = [
    { country: 'FR', firstAt: 1000, visitors: 5 },
    { country: 'CA', firstAt: 2000, visitors: 2 },
    { country: 'BE', firstAt: 3000, visitors: 1 },
    { country: 'CD', firstAt: 4000, visitors: 1 },
    { country: 'HK', firstAt: 5000, visitors: 1 }, // territory: on the map, not in the 195
  ];
  it('counts 195 countries and continents', () => {
    expect(SOVEREIGN_TOTAL).toBe(195);
    const eu = continentProgress(discovery).find((c) => c.key === 'EU')!;
    expect(eu.reached).toBe(2);
    expect(eu.total).toBeGreaterThan(40);
  });
  it('dates achievements from real first visits', () => {
    const a = achievements({ discovery, days: [], citiesReached: 3, today: '2026-10-30', todayStart: 3500 });
    const get = (id: string) => a.find((x) => x.id === id)!;
    expect(get('countries-1')).toMatchObject({ unlocked: true, at: 1000 });
    expect(get('countries-5')).toMatchObject({ unlocked: false, progress: [4, 5] });
    expect(get('continent-AF')).toMatchObject({ unlocked: true, at: 4000 });
    expect(get('continent-NA').desc).toBe('Premier visiteur venu d’Amérique du Nord.');
    expect(get('continent-EU').desc).toBe('Premier visiteur venu d’Europe.');
    expect(get('world-tour').progress).toEqual([4, 6]);
    expect(get('new-today')).toMatchObject({ unlocked: true, at: 4000 });
    expect(get('cities-10').progress).toEqual([3, 10]);
  });
  it('computes streaks, levels, timeline and new countries', () => {
    const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-20'].map((day) => ({ day, countries: 1 }));
    expect(streak(days, '2026-10-30')).toEqual({ current: 4, best: 4 });
    expect(streak(days, '2026-11-02').current).toBe(0);
    expect(level(0).name).toBe('Au départ');
    expect(level(12)).toMatchObject({ name: 'Continental' });
    const t = timeline(discovery);
    expect(t.map((x) => x.newContinent)).toEqual([true, true, false, true, true]);
    expect(newlyReached(new Set(['FR']), [{ country: 'FR' }, { country: 'JP' }, { country: 'JP' }])).toEqual(['JP']);
  });
});

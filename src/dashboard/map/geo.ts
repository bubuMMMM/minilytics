import { COUNTRY_ROWS } from './countries.gen';

export type Continent = 'AF' | 'EU' | 'AS' | 'OC' | 'NA' | 'SA' | 'AN';
export interface CountryInfo { iso2: string; num: string; name: string; continent: Continent; lat: number; lng: number; sovereign: boolean; area: number }

export const COUNTRIES = new Map<string, CountryInfo>(
  COUNTRY_ROWS.map(([iso2, num, name, continent, lat, lng, sov, area]) => [iso2, { iso2, num, name, continent, lat, lng, sovereign: sov === 1, area }]),
);
export const BY_NUM = new Map<string, string>(COUNTRY_ROWS.filter((r) => r[1]).map((r) => [r[1], r[0]]));
/** Natural Earth features without an ISO numeric code. */
export const BY_NAME: Record<string, string> = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };

export const CONTINENTS: { key: Exclude<Continent, 'AN'>; name: string }[] = [
  { key: 'EU', name: 'Europe' },
  { key: 'AF', name: 'Afrique' },
  { key: 'AS', name: 'Asie' },
  { key: 'NA', name: 'Amérique du Nord' },
  { key: 'SA', name: 'Amérique du Sud' },
  { key: 'OC', name: 'Océanie' },
];
export const CONTINENT_NAME: Record<Continent, string> = { EU: 'Europe', AF: 'Afrique', AS: 'Asie', NA: 'Amérique du Nord', SA: 'Amérique du Sud', OC: 'Océanie', AN: 'Antarctique' };

/** 193 UN members + Vatican + Palestine. */
export const SOVEREIGN_TOTAL = COUNTRY_ROWS.filter((r) => r[6] === 1).length;
export const SOVEREIGN_BY_CONTINENT: Record<string, number> = COUNTRY_ROWS.reduce((m, r) => {
  if (r[6] === 1) m[r[3]] = (m[r[3]] ?? 0) + 1;
  return m;
}, {} as Record<string, number>);

export function countryName(iso2: string): string {
  return COUNTRIES.get(iso2)?.name ?? iso2;
}

/** Regional-indicator flag; falls back to letters where the OS has no flag glyphs. */
export function flag(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return '';
  return String.fromCodePoint(...[...iso2].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export const normalizeName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

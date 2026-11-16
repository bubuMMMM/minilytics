import { DOT_ALPHA, DOT_CODES, DOT_H, DOT_LAT0, DOT_ROWS, DOT_STEP, DOT_W } from '../../worker/dotmap.gen';
import { COUNTRY_ROWS } from '../map/countries.gen';

/** One land cell of the 2.5° world grid, with the country it belongs to. */
export interface LandDot { x: number; y: number; lat: number; lon: number; cc: string }

export { DOT_H, DOT_W };

let cache: LandDot[] | null = null;

/** Decodes the generated dot grid (shared with the server-side widgets) once. */
export function landDots(): LandDot[] {
  if (cache) return cache;
  const out: LandDot[] = [];
  DOT_ROWS.forEach((row, y) => {
    let x = 0;
    for (let i = 0; i < row.length; i++, x++) {
      const ch = row[i];
      if (ch === '.') continue;
      const idx = ch === '~' ? DOT_ALPHA.length + DOT_ALPHA.indexOf(row[++i]) : DOT_ALPHA.indexOf(ch);
      out.push({ x, y, lat: DOT_LAT0 - y * DOT_STEP, lon: -180 + (x + 0.5) * DOT_STEP, cc: DOT_CODES[idx] });
    }
  });
  return (cache = out);
}

let centroids: Map<string, [number, number]> | null = null;

/** [lat, lon] of a country's centroid, or null for unknown codes. */
export function centroidOf(cc: string): [number, number] | null {
  centroids ??= new Map(COUNTRY_ROWS.map((r) => [r[0], [r[4], r[5]] as [number, number]]));
  return centroids.get(cc) ?? null;
}

/** Grid cell of a coordinate (used to place small countries that have no land dot). */
export function cellOf(lat: number, lon: number): { x: number; y: number } | null {
  const x = Math.floor((lon + 180) / DOT_STEP);
  const y = Math.round((DOT_LAT0 - lat) / DOT_STEP);
  return y < 0 || y >= DOT_H || x < 0 || x >= DOT_W ? null : { x, y };
}

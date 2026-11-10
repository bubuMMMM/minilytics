/**
 * Pixel-space clustering for live map markers. Threshold shrinks as the user zooms in,
 * so a city cluster expands into individual visitors. A highlighted (selected) point
 * always stays unclustered so card focus stays visible.
 */
export interface ClusterInput {
  key: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  highlight?: boolean;
  pages?: number;
  pulse?: boolean;
}

export type Clustered =
  | { type: 'point'; key: string; lon: number; lat: number; x: number; y: number; highlight?: boolean; pages?: number; pulse?: boolean }
  | { type: 'cluster'; keys: string[]; lon: number; lat: number; x: number; y: number; count: number };

/** Pixel radius under which nearby visitors collapse into one bubble. */
export function clusterThreshold(k: number): number {
  return Math.max(20, 56 / Math.pow(Math.max(k, 0.8), 0.4));
}

export function clusterLive(points: ClusterInput[], threshold: number): Clustered[] {
  const used = new Set<string>();
  const out: Clustered[] = [];
  for (const a of points) {
    if (used.has(a.key)) continue;
    if (a.highlight) {
      out.push({ type: 'point', key: a.key, lon: a.lon, lat: a.lat, x: a.x, y: a.y, highlight: true, pages: a.pages, pulse: a.pulse });
      used.add(a.key);
      continue;
    }
    const members: ClusterInput[] = [a];
    for (const b of points) {
      if (b.key === a.key || used.has(b.key) || b.highlight) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= threshold) members.push(b);
    }
    if (members.length === 1) {
      out.push({ type: 'point', key: a.key, lon: a.lon, lat: a.lat, x: a.x, y: a.y, highlight: a.highlight, pages: a.pages, pulse: a.pulse });
      used.add(a.key);
    } else {
      let sx = 0, sy = 0, slon = 0, slat = 0;
      for (const m of members) { sx += m.x; sy += m.y; slon += m.lon; slat += m.lat; used.add(m.key); }
      const n = members.length;
      out.push({ type: 'cluster', keys: members.map((m) => m.key), lon: slon / n, lat: slat / n, x: sx / n, y: sy / n, count: n });
    }
  }
  return out;
}

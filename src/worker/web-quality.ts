import type { Hono } from 'hono';
import {
  VITAL_METRICS,
  p75,
  parseHeatProps,
  parseVitalProps,
  rateVital,
  type VitalMetric,
  type VitalProps,
  type VitalRating,
} from '../shared/webVitals.js';
import type { AppEnv } from './env.js';
import { bucketLabels, bucketSql } from './lib/time.js';
import { filterSql, makeCtx, type Ctx } from './stats.js';

const SPARSE_VITALS = 8;
const SPARSE_HEAT = 20;
const GRID = 40;

type DeviceBucket = 'desktop' | 'mobile' | 'tablet';

function deviceBucket(device: string | null | undefined): DeviceBucket {
  if (device === 'Mobile') return 'mobile';
  if (device === 'Tablet') return 'tablet';
  return 'desktop';
}

function wantDevice(bucket: string | undefined, device: DeviceBucket): boolean {
  if (!bucket || bucket === 'all') return true;
  if (bucket === 'mobile') return device === 'mobile';
  if (bucket === 'desktop') return device === 'desktop' || device === 'tablet';
  return true;
}

function wantViewport(bucket: string | undefined, vw: number | undefined): boolean {
  if (!bucket || bucket === 'all' || vw == null) return true;
  if (bucket === 'mobile') return vw < 768;
  if (bucket === 'desktop') return vw >= 768;
  return true;
}

interface VitalRow {
  path: string | null;
  props: string | null;
  bucket: string;
  device: string | null;
}

export interface VitalP75 {
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  fcp: number | null;
  ttfb: number | null;
}

export interface VitalPageRow {
  path: string;
  samples: number;
  p75: VitalP75;
  rating: Record<VitalMetric, VitalRating | null>;
  devices: Record<DeviceBucket, { samples: number; p75: VitalP75 }>;
  sparse: boolean;
}

export interface VitalTrendPoint extends VitalP75 {
  bucket: string;
  /** Vital events in this bucket. */
  samples: number;
  /** Events that included each metric (for the tooltip). */
  counts: Record<VitalMetric, number>;
}

export interface VitalsReport {
  pages: VitalPageRow[];
  selected: VitalPageRow | null;
  trend: VitalTrendPoint[];
  samples: number;
  sparse: boolean;
}

function emptyP75(): VitalP75 {
  return { lcp: null, inp: null, cls: null, fcp: null, ttfb: null };
}

function p75From(rows: VitalProps[]): VitalP75 {
  const out = emptyP75();
  for (const m of VITAL_METRICS) {
    out[m] = p75(rows.map((r) => r[m]).filter((n): n is number => n != null));
  }
  return out;
}

function ratingsOf(v: VitalP75): Record<VitalMetric, VitalRating | null> {
  return {
    lcp: rateVital('lcp', v.lcp),
    inp: rateVital('inp', v.inp),
    cls: rateVital('cls', v.cls),
    fcp: rateVital('fcp', v.fcp),
    ttfb: rateVital('ttfb', v.ttfb),
  };
}

function summarize(path: string, props: VitalProps[], byDevice: Record<DeviceBucket, VitalProps[]>): VitalPageRow {
  const samples = props.length;
  const p = p75From(props);
  const devices = {} as VitalPageRow['devices'];
  for (const d of ['desktop', 'mobile', 'tablet'] as DeviceBucket[]) {
    devices[d] = { samples: byDevice[d].length, p75: p75From(byDevice[d]) };
  }
  return { path, samples, p75: p, rating: ratingsOf(p), devices, sparse: samples < SPARSE_VITALS };
}

export async function vitalsReport(ctx: Ctx, pathFilter?: string | null): Promise<VitalsReport> {
  const f = filterSql(ctx.filters);
  const bucket = bucketSql('e.ts', ctx.range.granularity, ctx.offset);
  const rows = await ctx.db
    .prepare(
      `SELECT e.path AS path, e.props AS props, s.device AS device, ${bucket} AS bucket
       FROM events e
       JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id
       WHERE e.site_id = ? AND e.type = 'vital' AND e.ts >= ? AND e.ts < ?${f.sql}`,
    )
    .bind(ctx.site.id, ctx.range.from, ctx.range.to, ...f.params)
    .all<VitalRow>();

  const byPath = new Map<string, { all: VitalProps[]; devices: Record<DeviceBucket, VitalProps[]>; byBucket: Map<string, VitalProps[]> }>();
  let total = 0;
  for (const row of rows.results ?? []) {
    const props = parseVitalProps(row.props ? safeJson(row.props) : null);
    if (!props) continue;
    const path = row.path || '/';
    const device = deviceBucket(row.device);
    let rec = byPath.get(path);
    if (!rec) {
      rec = { all: [], devices: { desktop: [], mobile: [], tablet: [] }, byBucket: new Map() };
      byPath.set(path, rec);
    }
    rec.all.push(props);
    rec.devices[device].push(props);
    const list = rec.byBucket.get(row.bucket) ?? [];
    list.push(props);
    rec.byBucket.set(row.bucket, list);
    total++;
  }

  const pages = [...byPath.entries()]
    .map(([path, rec]) => summarize(path, rec.all, rec.devices))
    .sort((a, b) => b.samples - a.samples);

  const selectedPath = pathFilter && pathFilter.trim() ? pathFilter.trim() : pages[0]?.path;
  const selected = selectedPath ? pages.find((p) => p.path === selectedPath) ?? null : null;

  const labels = bucketLabels(ctx.range, ctx.offset);
  const selectedRec = selectedPath ? byPath.get(selectedPath) : undefined;
  const trend = labels.map((label) => {
    const rows = selectedRec?.byBucket.get(label) ?? [];
    const counts = {} as Record<VitalMetric, number>;
    for (const m of VITAL_METRICS) counts[m] = rows.filter((r) => r[m] != null).length;
    return { bucket: label, ...p75From(rows), samples: rows.length, counts };
  });

  return { pages, selected, trend, samples: total, sparse: total < SPARSE_VITALS };
}

interface HeatRow {
  path: string | null;
  name: string | null;
  props: string | null;
  device: string | null;
}

export interface HeatCell {
  x: number;
  y: number;
  n: number;
  rage: number;
}

export interface HeatElement {
  selector: string;
  text: string | null;
  clicks: number;
  rage: number;
}

export interface HeatHit {
  x: number;
  y: number;
  selector: string;
}

export interface HeatmapReport {
  pages: { path: string; clicks: number; rage: number }[];
  path: string | null;
  bucket: 'all' | 'desktop' | 'mobile';
  points: HeatCell[];
  hits: HeatHit[];
  elements: HeatElement[];
  samples: number;
  rage: number;
  sparse: boolean;
}

export async function heatmapReport(ctx: Ctx, pathFilter?: string | null, bucketFilter?: string | null): Promise<HeatmapReport> {
  const f = filterSql(ctx.filters);
  const rows = await ctx.db
    .prepare(
      `SELECT e.path AS path, e.name AS name, e.props AS props, s.device AS device
       FROM events e
       JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id
       WHERE e.site_id = ? AND e.type = 'heat' AND e.ts >= ? AND e.ts < ?${f.sql}`,
    )
    .bind(ctx.site.id, ctx.range.from, ctx.range.to, ...f.params)
    .all<HeatRow>();

  const bucket: 'all' | 'desktop' | 'mobile' =
    bucketFilter === 'mobile' || bucketFilter === 'desktop' ? bucketFilter : 'all';

  const pageCount = new Map<string, { clicks: number; rage: number }>();
  type Pt = { x: number; y: number; rage: boolean; selector: string; text: string | null };
  const byPath = new Map<string, Pt[]>();

  for (const row of rows.results ?? []) {
    const ev = parseHeatProps(row.name, row.props ? safeJson(row.props) : null);
    if (!ev) continue;
    const device = deviceBucket(row.device);
    if (!wantDevice(bucket, device) || !wantViewport(bucket, ev.vw)) continue;
    const path = row.path || '/';
    const rec = pageCount.get(path) ?? { clicks: 0, rage: 0 };
    rec.clicks++;
    if (ev.rage) rec.rage++;
    pageCount.set(path, rec);
    const list = byPath.get(path) ?? [];
    list.push({ x: ev.x, y: ev.y, rage: ev.rage, selector: ev.selector, text: ev.text });
    byPath.set(path, list);
  }

  const pages = [...pageCount.entries()]
    .map(([path, rec]) => ({ path, clicks: rec.clicks, rage: rec.rage }))
    .sort((a, b) => b.clicks - a.clicks);

  const path = (pathFilter && pathFilter.trim()) || pages[0]?.path || null;
  const pointsIn = path ? byPath.get(path) ?? [] : [];
  const grid = new Map<string, HeatCell>();
  for (const pt of pointsIn) {
    const gx = Math.min(GRID - 1, Math.max(0, Math.floor(pt.x * GRID)));
    const gy = Math.min(GRID - 1, Math.max(0, Math.floor(pt.y * GRID)));
    const key = gx + ':' + gy;
    const cell = grid.get(key) ?? { x: (gx + 0.5) / GRID, y: (gy + 0.5) / GRID, n: 0, rage: 0 };
    cell.n++;
    if (pt.rage) cell.rage++;
    grid.set(key, cell);
  }
  const points = [...grid.values()].sort((a, b) => b.n - a.n);

  const elMap = new Map<string, HeatElement>();
  for (const pt of pointsIn) {
    const rec = elMap.get(pt.selector) ?? { selector: pt.selector, text: pt.text, clicks: 0, rage: 0 };
    rec.clicks++;
    if (pt.rage) rec.rage++;
    if (!rec.text && pt.text) rec.text = pt.text;
    elMap.set(pt.selector, rec);
  }
  const elements = [...elMap.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 25);
  const samples = pointsIn.length;
  const rage = pointsIn.filter((p) => p.rage).length;
  const hits = pointsIn.slice(0, 500).map((p) => ({ x: p.x, y: p.y, selector: p.selector }));

  return { pages, path, bucket, points, hits, elements, samples, rage, sparse: samples < SPARSE_HEAT };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function registerWebQuality(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/vitals', async (c) => c.json(await vitalsReport(makeCtx(c), c.req.query('path'))));
  app.get('/api/sites/:id/heatmap', async (c) =>
    c.json(await heatmapReport(makeCtx(c), c.req.query('path'), c.req.query('bucket'))),
  );
}

import { filterSql, hasFilters, type Ctx } from './stats.js';
import { bucketLabels, bucketSql, type Range } from './lib/time.js';
import { toCsv } from './insights.js';

/**
 * Block analytics: sponsor placements and content sections/items, built from `block_view` and
 * `block_click` events (see collect.ts blockEvents):
 *   name = block id (page + slot [+ sponsor]), label = sponsor, video_id = item, value = position,
 *   kind = 'sponsor' | 'content', props = {"href": "..."}.
 * An impression is counted by the browser once per pageview per (block, item) after ≥ 50 % / 1 s.
 */

export type BlockKind = 'sponsor' | 'content';
export const parseKind = (k: unknown): BlockKind | null => (k === 'sponsor' || k === 'content' ? k : null);
export const BLOCK_ID_RE = /^[\w:.\-/]{1,80}$/;

interface Scope {
  kind?: BlockKind | null;
  blockId?: string;
  sponsor?: string | null;
}

/** Block events in the period, with dashboard filters (session columns) and optional kind/block/sponsor. */
export function blockScope(ctx: Ctx, scope: Scope = {}) {
  const f = filterSql(ctx.filters);
  const parts = [`e.site_id = ?`, `e.type IN ('block_view', 'block_click')`, `e.ts >= ?`, `e.ts < ?`];
  const params: unknown[] = [ctx.site.id, ctx.range.from, ctx.range.to];
  if (scope.kind) {
    parts.push('e.kind = ?');
    params.push(scope.kind);
  }
  if (scope.blockId) {
    parts.push('e.name = ?');
    params.push(scope.blockId);
  }
  if (scope.sponsor !== undefined) {
    if (scope.sponsor === null || scope.sponsor === '') parts.push('e.label IS NULL');
    else {
      parts.push('e.label = ?');
      params.push(scope.sponsor);
    }
  }
  return {
    // Session filters live on the session row; join only when needed (cheaper on the hot path).
    from: `events e${hasFilters(ctx.filters) ? ' JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : ''}`,
    fromJoined: 'events e JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id',
    where: parts.join(' AND ') + f.sql,
    params: [...params, ...f.params],
  };
}

const METRICS = `
  COALESCE(SUM(CASE WHEN e.type = 'block_view' THEN 1 ELSE 0 END), 0) AS impressions,
  COUNT(DISTINCT CASE WHEN e.type = 'block_view' THEN e.visitor_id END) AS viewers,
  COALESCE(SUM(CASE WHEN e.type = 'block_click' THEN 1 ELSE 0 END), 0) AS clicks,
  COUNT(DISTINCT CASE WHEN e.type = 'block_click' THEN e.visitor_id END) AS clickers`;

export interface Metrics {
  impressions: number;
  viewers: number;
  clicks: number;
  clickers: number;
  ctr: number;
}

/** CTR = clicks / impressions (0..1). A click without a recorded impression (blocked IO, very fast click) is still a click. */
export function metrics(r: Record<string, unknown> | undefined): Metrics {
  const impressions = Number(r?.impressions) || 0;
  const clicks = Number(r?.clicks) || 0;
  return {
    impressions,
    viewers: Number(r?.viewers) || 0,
    clicks,
    clickers: Number(r?.clickers) || 0,
    ctr: impressions ? Math.min(1, clicks / impressions) : 0,
  };
}

/** Bucket start (UTC ms) for a label produced by bucketLabels in site time. */
export function bucketStart(label: string, offset: number): number {
  const iso = label.length === 7 ? label + '-01T00:00:00Z' : label.length === 10 ? label + 'T00:00:00Z' : label + ':00Z';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t - offset : 0;
}

function seriesOf(range: Range, offset: number, rows: any[]) {
  const by = new Map(rows.map((r) => [r.b, r]));
  return bucketLabels(range, offset).map((label) => ({
    t: bucketStart(label, offset),
    label,
    bucket: label,
    impressions: Number(by.get(label)?.impressions ?? 0),
    clicks: Number(by.get(label)?.clicks ?? 0),
  }));
}

/** The most frequent value per key: rows are (key..., value, n). */
function modeBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => unknown, n: (r: T) => number) {
  const best = new Map<string, { v: unknown; n: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = best.get(k);
    if (!cur || n(r) > cur.n) best.set(k, { v: value(r), n: n(r) });
  }
  return (k: string) => best.get(k)?.v ?? null;
}

const hrefOf = (props: unknown): string | null => {
  if (typeof props !== 'string') return null;
  try {
    const h = JSON.parse(props)?.href;
    return typeof h === 'string' ? h : null;
  } catch {
    return null;
  }
};

const rowKey = (id: string, sponsor: string | null) => `${id}\u0000${sponsor ?? ''}`;

export interface BlockRow extends Metrics {
  id: string;
  kind: BlockKind;
  sponsor: string | null;
  href: string | null;
  page: string | null;
  lastSeen: number | null;
}

/** All blocks (one row per block id + sponsor), sponsor totals, page totals and a time series. */
export async function blocksReport(ctx: Ctx, kind: BlockKind | null, limit = 200) {
  const { db, range } = ctx;
  const sc = blockScope(ctx, { kind });
  const b = bucketSql('e.ts', range.granularity, ctx.offset);
  const lim = Math.max(1, Math.min(500, limit));
  const [totals, perBlock, pages, hrefs, series, perSponsor, perPage] = await db.batch([
    db.prepare(`SELECT ${METRICS} FROM ${sc.from} WHERE ${sc.where}`).bind(...sc.params),
    db
      .prepare(
        `SELECT e.name AS id, e.label AS sponsor, MAX(e.kind) AS kind, MAX(e.ts) AS last_ts, ${METRICS}
         FROM ${sc.from} WHERE ${sc.where} GROUP BY e.name, e.label
         ORDER BY impressions DESC, clicks DESC LIMIT ${lim}`,
      )
      .bind(...sc.params),
    db
      .prepare(`SELECT e.name AS id, e.label AS sponsor, e.path AS path, COUNT(*) AS n FROM ${sc.from} WHERE ${sc.where} GROUP BY e.name, e.label, e.path`)
      .bind(...sc.params),
    db
      .prepare(
        `SELECT e.name AS id, e.label AS sponsor, e.props AS props, COUNT(*) AS n FROM ${sc.from}
         WHERE ${sc.where} AND e.props IS NOT NULL GROUP BY e.name, e.label, e.props`,
      )
      .bind(...sc.params),
    db
      .prepare(
        `SELECT ${b} AS b, COALESCE(SUM(CASE WHEN e.type = 'block_view' THEN 1 ELSE 0 END), 0) AS impressions,
           COALESCE(SUM(CASE WHEN e.type = 'block_click' THEN 1 ELSE 0 END), 0) AS clicks
         FROM ${sc.from} WHERE ${sc.where} GROUP BY b`,
      )
      .bind(...sc.params),
    db
      .prepare(
        `SELECT e.label AS sponsor, COUNT(DISTINCT e.name) AS placements, ${METRICS}
         FROM ${sc.from} WHERE ${sc.where} AND e.label IS NOT NULL GROUP BY e.label ORDER BY impressions DESC LIMIT 100`,
      )
      .bind(...sc.params),
    db
      .prepare(
        `SELECT e.path AS page, COUNT(DISTINCT e.name) AS blocks, ${METRICS}
         FROM ${sc.from} WHERE ${sc.where} GROUP BY e.path ORDER BY impressions DESC LIMIT 100`,
      )
      .bind(...sc.params),
  ]);
  type P = { id: string; sponsor: string | null; path?: string; props?: string; n: number };
  const pageOf = modeBy(pages.results as P[], (r) => rowKey(r.id, r.sponsor), (r) => r.path, (r) => Number(r.n));
  const hrefFor = modeBy(hrefs.results as P[], (r) => rowKey(r.id, r.sponsor), (r) => hrefOf(r.props), (r) => Number(r.n));
  const blocks: BlockRow[] = (perBlock.results as any[]).map((r) => ({
    id: r.id,
    kind: r.kind === 'sponsor' ? 'sponsor' : 'content',
    sponsor: r.sponsor ?? null,
    href: (hrefFor(rowKey(r.id, r.sponsor)) as string | null) ?? null,
    page: (pageOf(rowKey(r.id, r.sponsor)) as string | null) ?? null,
    ...metrics(r),
    lastSeen: Number(r.last_ts) || null,
  }));
  return {
    range,
    kind,
    totals: metrics((totals.results as any[])[0]),
    blocks,
    sponsors: (perSponsor.results as any[]).map((r) => ({ sponsor: r.sponsor, ...metrics(r), placements: Number(r.placements) || 0 })),
    pages: (perPage.results as any[]).map((r) => ({ page: r.page ?? null, ...metrics(r), blocks: Number(r.blocks) || 0 })),
    series: seriesOf(range, ctx.offset, series.results as any[]),
  };
}

const DIMS: Record<string, string> = {
  page: 'e.path',
  device: 's.device',
  country: 's.country',
  source: 's.source',
  channel: 's.channel',
  browser: 's.browser',
  os: 's.os',
  utm_campaign: 's.utm_campaign',
  visitor_type: "CASE WHEN s.is_new = 1 THEN 'Nouveau' WHEN s.is_new = 0 THEN 'Récurrent' END",
};

/** One block (optionally one sponsor in it): metrics, series, breakdowns and items (video cards). */
export async function blockDetail(ctx: Ctx, blockId: string, kind: BlockKind | null, sponsor?: string | null) {
  const { db, range } = ctx;
  const sc = blockScope(ctx, { kind, blockId, sponsor });
  const b = bucketSql('e.ts', range.granularity, ctx.offset);
  const dims = Object.keys(DIMS);
  const [row, pages, hrefs, series, items, itemPos, ...breakdowns] = await db.batch([
    db.prepare(`SELECT MAX(e.kind) AS kind, MAX(e.ts) AS last_ts, MAX(e.label) AS sponsor, ${METRICS} FROM ${sc.from} WHERE ${sc.where}`).bind(...sc.params),
    db.prepare(`SELECT e.path AS path, COUNT(*) AS n FROM ${sc.from} WHERE ${sc.where} GROUP BY e.path`).bind(...sc.params),
    db.prepare(`SELECT e.props AS props, COUNT(*) AS n FROM ${sc.from} WHERE ${sc.where} AND e.props IS NOT NULL GROUP BY e.props`).bind(...sc.params),
    db
      .prepare(
        `SELECT ${b} AS b, COALESCE(SUM(CASE WHEN e.type = 'block_view' THEN 1 ELSE 0 END), 0) AS impressions,
           COALESCE(SUM(CASE WHEN e.type = 'block_click' THEN 1 ELSE 0 END), 0) AS clicks
         FROM ${sc.from} WHERE ${sc.where} GROUP BY b`,
      )
      .bind(...sc.params),
    db
      .prepare(
        `SELECT e.video_id AS item, ${METRICS} FROM ${sc.from} WHERE ${sc.where} AND e.video_id IS NOT NULL
         GROUP BY e.video_id ORDER BY impressions DESC, clicks DESC LIMIT 200`,
      )
      .bind(...sc.params),
    db
      .prepare(
        `SELECT e.video_id AS item, e.value AS pos, COUNT(*) AS n FROM ${sc.from}
         WHERE ${sc.where} AND e.video_id IS NOT NULL AND e.value IS NOT NULL GROUP BY e.video_id, e.value`,
      )
      .bind(...sc.params),
    ...dims.map((d) =>
      db
        .prepare(
          `SELECT ${DIMS[d]} AS label, ${METRICS} FROM ${sc.fromJoined} WHERE ${sc.where}
           GROUP BY 1 ORDER BY impressions DESC, clicks DESC LIMIT 25`,
        )
        .bind(...sc.params),
    ),
  ]);
  const r = (row.results as any[])[0] ?? {};
  const topPage = modeBy(pages.results as any[], () => 'x', (p) => p.path, (p) => Number(p.n))('x') as string | null;
  const topHref = modeBy(hrefs.results as any[], () => 'x', (p) => hrefOf(p.props), (p) => Number(p.n))('x') as string | null;
  const posOf = modeBy(itemPos.results as any[], (p) => p.item, (p) => Number(p.pos), (p) => Number(p.n));
  const itemRows = items.results as any[];
  const titles = new Map<string, string | null>();
  if (itemRows.length) {
    const ids = itemRows.map((i) => i.item);
    const t = await db
      .prepare(`SELECT id, title FROM videos WHERE site_id = ? AND id IN (${ids.map(() => '?').join(', ')})`)
      .bind(ctx.site.id, ...ids)
      .all<{ id: string; title: string | null }>();
    for (const v of t.results ?? []) titles.set(v.id, v.title);
  }
  const block: BlockRow = {
    id: blockId,
    kind: (r.kind ?? kind) === 'sponsor' ? 'sponsor' : 'content',
    sponsor: sponsor !== undefined ? sponsor || null : (r.sponsor ?? null),
    href: topHref,
    page: topPage,
    ...metrics(r),
    lastSeen: Number(r.last_ts) || null,
  };
  return {
    range,
    block,
    series: seriesOf(range, ctx.offset, series.results as any[]),
    breakdown: Object.fromEntries(
      dims.map((d, i) => [d, (breakdowns[i].results as any[]).map((x) => ({ label: x.label ?? null, ...metrics(x) }))]),
    ),
    items: itemRows.map((i) => ({ item: i.item, title: titles.get(i.item) ?? null, pos: (posOf(i.item) as number | null) ?? null, ...metrics(i) })),
  };
}

/** CSV of the blocks table (one row per block + sponsor). */
export function blocksCsv(rows: BlockRow[]): string {
  return toCsv(
    [
      { key: 'id', label: 'placement' },
      { key: 'kind', label: 'kind' },
      { key: 'sponsor', label: 'sponsor' },
      { key: 'page', label: 'page' },
      { key: 'href', label: 'href' },
      { key: 'impressions', label: 'impressions' },
      { key: 'viewers', label: 'unique_viewers' },
      { key: 'clicks', label: 'clicks' },
      { key: 'clickers', label: 'unique_clickers' },
      { key: 'ctrPct', label: 'ctr_percent' },
    ],
    rows.map((r) => ({ ...r, ctrPct: (r.ctr * 100).toFixed(2) })) as unknown as Record<string, unknown>[],
  );
}

/** Public aggregates for sites marked public: no visitor counts, only impressions/clicks/CTR. */
export async function publicBlocks(ctx: Ctx, kind: BlockKind | null) {
  const r = await blocksReport(ctx, kind, 50);
  const strip = ({ impressions, clicks, ctr }: Metrics) => ({ impressions, clicks, ctr });
  return {
    totals: strip(r.totals),
    blocks: r.blocks.map((b) => ({ id: b.id, kind: b.kind, sponsor: b.sponsor, page: b.page, ...strip(b) })),
    sponsors: r.sponsors.map((s) => ({ sponsor: s.sponsor, placements: s.placements, ...strip(s) })),
    series: r.series,
  };
}

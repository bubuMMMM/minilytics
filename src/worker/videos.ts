import { filterSql, hasFilters, type Ctx } from './stats.js';
import { bucketLabels, bucketSql } from './lib/time.js';

/**
 * Video analytics, built from `video` events sent by the site's player:
 *   start (first play of a video in a page load), play/pause/seek, progress (milestone %),
 *   watch (seconds actually played since last report), complete (reached the end).
 */

/** Events `e` of type video in the period, optionally restricted by session filters and one video. */
function videoEvents(ctx: Ctx, videoId?: string) {
  const f = filterSql(ctx.filters);
  const join = hasFilters(ctx.filters) ? 'JOIN sessions s ON s.site_id = e.site_id AND s.id = e.session_id' : '';
  const vid = videoId ? ' AND e.video_id = ?' : '';
  return {
    from: `events e ${join}`,
    where: `e.site_id = ? AND e.type = 'video' AND e.ts >= ? AND e.ts < ?${vid}${f.sql}`,
    params: [ctx.site.id, ctx.range.from, ctx.range.to, ...(videoId ? [videoId] : []), ...f.params] as unknown[],
  };
}

const MILESTONES = [10, 25, 50, 75, 90, 100];

/** Per-video metrics (one SELECT). Completion = reached 90 % or the end, per (session, video). */
/** A play = one `start`; with a play-session id (label) duplicates of the same play count once. */
export const PLAYS_SQL = `COUNT(DISTINCT CASE WHEN e.name = 'start' THEN COALESCE(e.label, e.session_id || ':' || CAST(e.id AS TEXT)) END)`;

const VIDEO_STATS = (from: string, where: string) => `
  SELECT e.video_id AS id,
    ${PLAYS_SQL} AS plays,
    COUNT(DISTINCT CASE WHEN e.name = 'start' THEN e.visitor_id END) AS viewers,
    COUNT(DISTINCT e.visitor_id) AS reach,
    COALESCE(SUM(CASE WHEN e.name = 'watch' THEN e.value ELSE 0 END), 0) AS watch_s,
    COUNT(DISTINCT CASE WHEN e.name = 'complete' OR (e.name = 'progress' AND e.value >= 90) THEN e.session_id END) AS completions,
    COUNT(DISTINCT CASE WHEN e.name IN ('start', 'play', 'watch') THEN e.session_id END) AS view_sessions,
    SUM(CASE WHEN e.name = 'pause' THEN 1 ELSE 0 END) AS pauses,
    SUM(CASE WHEN e.name = 'seek' THEN 1 ELSE 0 END) AS seeks,
    SUM(CASE WHEN e.name = 'rewatch' THEN 1 ELSE 0 END) AS rewatches,
    COUNT(DISTINCT CASE WHEN e.name = 'rewatch' THEN e.visitor_id END) AS rewatchers,
    SUM(CASE WHEN e.name = 'fullscreen' AND e.value = 1 THEN 1 ELSE 0 END) AS fullscreens,
    SUM(CASE WHEN e.name = 'mute' AND e.value = 1 THEN 1 ELSE 0 END) AS mutes,
    SUM(CASE WHEN e.name = 'rate' THEN 1 ELSE 0 END) AS rate_changes,
    SUM(CASE WHEN e.name = 'error' THEN 1 ELSE 0 END) AS errors,
    ${MILESTONES.map((m) => `COUNT(DISTINCT CASE WHEN e.name = 'progress' AND e.value = ${m} THEN e.session_id END) AS m${m}`).join(',\n    ')},
    MAX(e.ts) AS last_ts
  FROM ${from} WHERE ${where}`;

interface StatRow {
  id: string;
  plays: number;
  viewers: number;
  reach: number;
  watch_s: number;
  completions: number;
  view_sessions: number;
  pauses: number;
  seeks: number;
  last_ts: number;
  [k: string]: unknown;
}

function shape(r: StatRow, meta?: { title: string | null; channel: string | null; duration: number | null }) {
  const sessions = Number(r.view_sessions) || 0;
  const watch = Number(r.watch_s) || 0;
  const duration = meta?.duration ?? null;
  return {
    id: r.id,
    title: meta?.title ?? null,
    channel: meta?.channel ?? null,
    duration,
    plays: Number(r.plays) || 0,
    viewers: Number(r.viewers) || 0,
    reach: Number(r.reach) || 0,
    sessions,
    watchSeconds: watch,
    avgWatchSeconds: sessions ? Math.round(watch / sessions) : 0,
    avgPercentWatched: duration && sessions ? Math.min(1, watch / sessions / duration) : null,
    completions: Number(r.completions) || 0,
    completionRate: sessions ? Math.min(1, (Number(r.completions) || 0) / sessions) : 0,
    pauses: Number(r.pauses) || 0,
    seeks: Number(r.seeks) || 0,
    rewatches: Number(r.rewatches) || 0,
    rewatchers: Number(r.rewatchers) || 0,
    fullscreens: Number(r.fullscreens) || 0,
    mutes: Number(r.mutes) || 0,
    rateChanges: Number(r.rate_changes) || 0,
    errors: Number(r.errors) || 0,
    milestones: MILESTONES.map((m) => ({ pct: m, sessions: Number(r['m' + m]) || 0 })),
    lastSeen: Number(r.last_ts) || null,
  };
}

async function metaFor(ctx: Ctx, ids: string[]) {
  if (!ids.length) return new Map<string, { title: string | null; channel: string | null; duration: number | null }>();
  const marks = ids.map(() => '?').join(', ');
  const rows = await ctx.db
    .prepare(`SELECT id, title, channel, duration FROM videos WHERE site_id = ? AND id IN (${marks})`)
    .bind(ctx.site.id, ...ids)
    .all<{ id: string; title: string | null; channel: string | null; duration: number | null }>();
  return new Map((rows.results || []).map((r) => [r.id, { title: r.title, channel: r.channel, duration: r.duration == null ? null : Number(r.duration) }]));
}

/** Overview of every video watched in the period, plus totals and a time series. */
export async function videoReport(ctx: Ctx, limit = 100) {
  const { db, range } = ctx;
  const ev = videoEvents(ctx);
  const b = bucketSql('e.ts', range.granularity, ctx.offset);
  const lim = Math.max(1, Math.min(500, limit));
  const [totals, perVideo, series, channels] = await db.batch([
    db
      .prepare(
        `SELECT ${PLAYS_SQL} AS plays,
           COUNT(DISTINCT CASE WHEN e.name = 'start' THEN e.visitor_id END) AS viewers,
           COUNT(DISTINCT e.video_id) AS videos,
           COALESCE(SUM(CASE WHEN e.name = 'watch' THEN e.value ELSE 0 END), 0) AS watch_s,
           COUNT(DISTINCT CASE WHEN e.name IN ('start', 'play', 'watch') THEN e.session_id || ':' || e.video_id END) AS views,
           COUNT(DISTINCT CASE WHEN e.name = 'complete' OR (e.name = 'progress' AND e.value >= 90) THEN e.session_id || ':' || e.video_id END) AS completions
         FROM ${ev.from} WHERE ${ev.where}`,
      )
      .bind(...ev.params),
    db.prepare(`${VIDEO_STATS(ev.from, ev.where)} GROUP BY e.video_id ORDER BY plays DESC, watch_s DESC LIMIT ${lim}`).bind(...ev.params),
    db
      .prepare(
        `SELECT ${b} AS b, ${PLAYS_SQL} AS plays,
           COALESCE(SUM(CASE WHEN e.name = 'watch' THEN e.value ELSE 0 END), 0) AS watch_s
         FROM ${ev.from} WHERE ${ev.where} GROUP BY b`,
      )
      .bind(...ev.params),
    db
      .prepare(
        `SELECT v.channel AS label, ${PLAYS_SQL} AS plays,
           COALESCE(SUM(CASE WHEN e.name = 'watch' THEN e.value ELSE 0 END), 0) AS watch_s
         FROM ${ev.from} LEFT JOIN videos v ON v.site_id = e.site_id AND v.id = e.video_id
         WHERE ${ev.where} GROUP BY v.channel ORDER BY plays DESC, watch_s DESC LIMIT 20`,
      )
      .bind(...ev.params),
  ]);
  const rows = perVideo.results as unknown as StatRow[];
  const meta = await metaFor(ctx, rows.map((r) => r.id));
  const t = (totals.results[0] ?? {}) as Record<string, number>;
  const by = new Map((series.results as any[]).map((r) => [r.b, r]));
  const views = Number(t.views) || 0;
  return {
    range,
    totals: {
      plays: Number(t.plays) || 0,
      viewers: Number(t.viewers) || 0,
      videos: Number(t.videos) || 0,
      views,
      watchSeconds: Number(t.watch_s) || 0,
      avgWatchSeconds: views ? Math.round((Number(t.watch_s) || 0) / views) : 0,
      completions: Number(t.completions) || 0,
      completionRate: views ? Math.min(1, (Number(t.completions) || 0) / views) : 0,
    },
    series: bucketLabels(range, ctx.offset).map((bucket) => ({
      bucket,
      plays: Number(by.get(bucket)?.plays ?? 0),
      watchSeconds: Number(by.get(bucket)?.watch_s ?? 0),
    })),
    channels: (channels.results as any[]).map((r) => ({ label: r.label ?? null, plays: Number(r.plays) || 0, watchSeconds: Number(r.watch_s) || 0 })),
    videos: rows.map((r) => shape(r, meta.get(r.id))),
  };
}

/** One video: metrics, drop-off and the audience (sources, places, tech) of the sessions that watched it. */
export async function videoDetail(ctx: Ctx, videoId: string) {
  const { db, range } = ctx;
  const ev = videoEvents(ctx, videoId);
  const b = bucketSql('e.ts', range.granularity, ctx.offset);
  // Sessions that watched this video in the period (with the dashboard filters).
  const f = filterSql(ctx.filters);
  const watched = `s.site_id = ? AND EXISTS (SELECT 1 FROM events e WHERE e.site_id = s.site_id AND e.session_id = s.id
      AND e.type = 'video' AND e.video_id = ? AND e.name IN ('start', 'play', 'watch') AND e.ts >= ? AND e.ts < ?)${f.sql}`;
  const wp = [ctx.site.id, videoId, range.from, range.to, ...f.params];
  const dims: Record<string, string> = {
    channel: 's.channel',
    source: 's.source',
    referrer: 's.referrer_domain',
    utm_source: 's.utm_source',
    utm_medium: 's.utm_medium',
    utm_campaign: 's.utm_campaign',
    country: 's.country',
    city: 's.city',
    device: 's.device',
    browser: 's.browser',
    os: 's.os',
    language: 's.language',
    entry_page: 's.entry_page',
    visitor_type: "CASE WHEN s.is_new = 1 THEN 'Nouveau' WHEN s.is_new = 0 THEN 'Récurrent' END",
  };
  const names = Object.keys(dims);
  const results = await db.batch([
    db.prepare(`${VIDEO_STATS(ev.from, ev.where)} GROUP BY e.video_id`).bind(...ev.params),
    db
      .prepare(
        `SELECT ${b} AS b, ${PLAYS_SQL} AS plays,
           COALESCE(SUM(CASE WHEN e.name = 'watch' THEN e.value ELSE 0 END), 0) AS watch_s
         FROM ${ev.from} WHERE ${ev.where} GROUP BY b`,
      )
      .bind(...ev.params),
    db
      .prepare(
        `SELECT e.name AS label, COUNT(*) AS n, COUNT(DISTINCT e.visitor_id) AS visitors FROM events e
         WHERE e.site_id = ? AND e.type = 'action' AND e.video_id = ? AND e.ts >= ? AND e.ts < ? GROUP BY e.name ORDER BY n DESC`,
      )
      .bind(ctx.site.id, videoId, range.from, range.to),
    // Player settings chosen while watching (quality from props JSON, speed stored ×100).
    db
      .prepare(`SELECT e.props AS props, COUNT(*) AS n FROM ${ev.from} WHERE ${ev.where} AND e.name = 'quality' GROUP BY e.props ORDER BY n DESC LIMIT 20`)
      .bind(...ev.params),
    db
      .prepare(`SELECT e.value AS v, COUNT(*) AS n FROM ${ev.from} WHERE ${ev.where} AND e.name = 'rate' GROUP BY e.value ORDER BY n DESC LIMIT 20`)
      .bind(...ev.params),
    // Where the video was played (watch page, party room, music…).
    db
      .prepare(`SELECT e.path AS label, ${PLAYS_SQL} AS plays FROM ${ev.from} WHERE ${ev.where} GROUP BY e.path ORDER BY plays DESC LIMIT 15`)
      .bind(...ev.params),
    ...names.map((d) =>
      db
        .prepare(
          `SELECT ${dims[d]} AS label, COUNT(DISTINCT s.visitor_id) AS visitors${d === 'city' ? ', MAX(s.country) AS extra' : d === 'source' ? ', MAX(s.referrer_domain) AS extra' : ''}
           FROM sessions s WHERE ${watched} GROUP BY 1 ORDER BY visitors DESC LIMIT 15`,
        )
        .bind(...wp),
    ),
  ]);
  const [stats, series, actions, qualities, rates, pages, ...audience] = results;
  const meta = await metaFor(ctx, [videoId]);
  const row = (stats.results[0] as unknown as StatRow | undefined) ?? ({ id: videoId } as StatRow);
  const by = new Map((series.results as any[]).map((r) => [r.b, r]));
  return {
    range,
    video: shape(row, meta.get(videoId)),
    series: bucketLabels(range, ctx.offset).map((bucket) => ({
      bucket,
      plays: Number(by.get(bucket)?.plays ?? 0),
      watchSeconds: Number(by.get(bucket)?.watch_s ?? 0),
    })),
    actions: (actions.results as any[]).map((r) => ({ label: r.label, count: Number(r.n) || 0, visitors: Number(r.visitors) || 0 })),
    qualities: (qualities.results as any[]).map((r) => {
      let label: string | null = null;
      try {
        label = JSON.parse(r.props)?.quality ?? null;
      } catch {}
      return { label, count: Number(r.n) || 0 };
    }),
    speeds: (rates.results as any[]).map((r) => ({ rate: Number(r.v) / 100, count: Number(r.n) || 0 })),
    pages: (pages.results as any[]).map((r) => ({ label: r.label ?? null, plays: Number(r.plays) || 0 })),
    audience: Object.fromEntries(
      names.map((d, i) => [
        d,
        (audience[i].results as any[]).map((r) => ({ label: r.label ?? null, visitors: Number(r.visitors) || 0, extra: r.extra ?? null })),
      ]),
    ),
  };
}

/** Public, aggregated top videos (no visitor-level data) for the home page. */
export async function publicTopVideos(ctx: Ctx, limit = 8) {
  const report = await videoReport(ctx, limit);
  return {
    totals: report.totals,
    videos: report.videos.map((v) => ({
      id: v.id,
      title: v.title,
      channel: v.channel,
      duration: v.duration,
      plays: v.plays,
      viewers: v.viewers,
      watchSeconds: v.watchSeconds,
      avgWatchSeconds: v.avgWatchSeconds,
      completionRate: v.completionRate,
    })),
  };
}

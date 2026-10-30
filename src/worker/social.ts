import type { Site } from './env.js';
import type { Ctx } from './stats.js';

/**
 * Social: visits from social networks, X links attribution (tagged links → exact visits),
 * and mentions of the site on X (posts linking to / naming the domain, via the X API v2 recent search).
 * The X part needs an app Bearer token (env X_BEARER_TOKEN); everything else works without it.
 */
export const X_SEARCH_URL = 'https://api.x.com/2/tweets/search/recent';
export const X_SYNC_MIN_MS = 10 * 60_000; // manual refresh at most every 10 min
export const X_AUTO_SYNC_MS = 6 * 3_600_000; // dashboard view refreshes mentions older than 6 h
const MAX_PAGES = 3;
const WINDOW_MS = 24 * 3_600_000;

const bare = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
export const xQuery = (domain: string) => `(url:"${bare(domain)}" OR "${bare(domain)}") -is:retweet`;

export interface XLink { url: string; tco: string | null; campaign: string | null; content: string | null; ref: string | null; source: string | null }
export function linkTags(url: string): Omit<XLink, 'url' | 'tco'> {
  try {
    const u = new URL(url);
    const g = (k: string) => (u.searchParams.get(k) || '').trim().toLowerCase().slice(0, 200) || null;
    return { campaign: g('utm_campaign'), content: g('utm_content'), ref: g('ref') ?? g('via') ?? g('source'), source: g('utm_source') };
  } catch {
    return { campaign: null, content: null, ref: null, source: null };
  }
}

function hostMatches(url: string, domain: string) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const d = bare(domain);
    return h === d || h.endsWith('.' + d);
  } catch {
    return false;
  }
}

function xError(status: number): string {
  if (status === 401) return 'Jeton X refusé (HTTP 401) : vérifiez la variable X_BEARER_TOKEN.';
  if (status === 402 || status === 403) return `Accès refusé par l’API X (HTTP ${status}) : votre offre ou vos crédits X ne permettent pas la recherche récente (GET /2/tweets/search/recent).`;
  if (status === 429) return 'Limite de l’API X atteinte (HTTP 429), nouvel essai à la prochaine actualisation.';
  return `L’API X a répondu HTTP ${status}.`;
}

export interface SyncResult { ok: boolean; found: number; error?: string }

/** Fetches the last 7 days of posts mentioning / linking to the site and upserts them. Never throws. */
export async function syncX(db: D1Database, site: Site, token: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<SyncResult> {
  let found = 0;
  let error: string | undefined;
  try {
    let next: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({
        query: xQuery(site.domain),
        max_results: '100',
        'tweet.fields': 'created_at,public_metrics,entities,author_id',
        expansions: 'author_id',
        'user.fields': 'username,name,profile_image_url',
      });
      if (next) q.set('next_token', next);
      const res = await fetchImpl(`${X_SEARCH_URL}?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        error = xError(res.status);
        break;
      }
      const body = (await res.json()) as any;
      const users = new Map<string, any>((body?.includes?.users ?? []).map((u: any) => [u.id, u]));
      const stmts: D1PreparedStatement[] = [];
      for (const t of (body?.data ?? []) as any[]) {
        if (!t?.id) continue;
        const u = users.get(t.author_id) ?? {};
        const m = t.public_metrics ?? {};
        const urls: XLink[] = ((t.entities?.urls ?? []) as any[])
          .filter((x) => x?.expanded_url && hostMatches(x.expanded_url, site.domain))
          .slice(0, 5)
          .map((x) => ({ url: String(x.expanded_url).slice(0, 500), tco: x.url ? String(x.url).slice(0, 60) : null, ...linkTags(x.expanded_url) }));
        stmts.push(
          db
            .prepare(
              `INSERT INTO x_posts (site_id, id, author_id, username, name, avatar, text, created_at, likes, reposts, replies, quotes, bookmarks, impressions, urls, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (site_id, id) DO UPDATE SET likes = excluded.likes, reposts = excluded.reposts, replies = excluded.replies,
                 quotes = excluded.quotes, bookmarks = excluded.bookmarks, impressions = excluded.impressions, urls = excluded.urls,
                 username = excluded.username, name = excluded.name, avatar = excluded.avatar, fetched_at = excluded.fetched_at`,
            )
            .bind(
              site.id, String(t.id), t.author_id ?? null, u.username ?? null, u.name ?? null, u.profile_image_url ?? null,
              String(t.text ?? '').slice(0, 1000), Date.parse(t.created_at) || now,
              m.like_count | 0, m.retweet_count | 0, m.reply_count | 0, m.quote_count | 0, m.bookmark_count | 0, m.impression_count | 0,
              JSON.stringify(urls), now,
            ),
        );
      }
      if (stmts.length) await db.batch(stmts);
      found += stmts.length;
      next = body?.meta?.next_token;
      if (!next) break;
    }
  } catch (e) {
    error = `Impossible de joindre l’API X (${(e as Error).name === 'TimeoutError' ? 'délai dépassé' : 'erreur réseau'}).`;
  }
  await db
    .prepare(
      `INSERT INTO x_sync (site_id, synced_at, ok, error, found) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET synced_at = excluded.synced_at, ok = excluded.ok, error = excluded.error, found = excluded.found`,
    )
    .bind(site.id, now, error ? 0 : 1, error ?? null, found)
    .run();
  return error ? { ok: false, found, error } : { ok: true, found };
}

export async function syncState(db: D1Database, siteId: string) {
  const r = await db.prepare('SELECT synced_at, ok, error, found FROM x_sync WHERE site_id = ?').bind(siteId).first<any>();
  return r ? { at: Number(r.synced_at), ok: !!Number(r.ok), error: r.error ?? null, found: Number(r.found) || 0 } : null;
}

const n = (v: unknown) => Number(v) || 0;

export async function socialReport(ctx: Ctx, configured: boolean) {
  const { db, site, range } = ctx;
  const p = [site.id, range.from, range.to];
  const W = `s.site_id = ? AND s.started_at >= ? AND s.started_at < ?`;
  const [networks, xt, links, landings, xs, posts] = await db.batch([
    db.prepare(
      `SELECT s.source AS source, COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews
       FROM sessions s WHERE ${W} AND s.channel = 'Organic Social' GROUP BY s.source ORDER BY visitors DESC LIMIT 20`,
    ).bind(...p),
    db.prepare(
      `SELECT COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions, COALESCE(SUM(s.pageviews), 0) AS pageviews,
         COALESCE(SUM(CASE WHEN s.pageviews > 1 OR s.goals > 0 OR s.engaged_ms >= 10000 THEN 1 ELSE 0 END), 0) AS engaged
       FROM sessions s WHERE ${W} AND s.source = 'X'`,
    ).bind(...p),
    db.prepare(
      `SELECT s.utm_campaign AS campaign, s.utm_content AS content, s.ref AS ref, COUNT(DISTINCT s.visitor_id) AS visitors,
         COUNT(*) AS sessions, SUM(s.pageviews) AS pageviews
       FROM sessions s WHERE ${W} AND s.source = 'X' GROUP BY s.utm_campaign, s.utm_content, s.ref ORDER BY visitors DESC LIMIT 50`,
    ).bind(...p),
    db.prepare(
      `SELECT s.entry_page AS page, COUNT(DISTINCT s.visitor_id) AS visitors FROM sessions s WHERE ${W} AND s.source = 'X'
       GROUP BY s.entry_page ORDER BY visitors DESC LIMIT 10`,
    ).bind(...p),
    // X sessions from 24 h before the range start, so a post published just before it still gets its visits.
    db.prepare(
      `SELECT s.visitor_id AS v, s.started_at AS t, s.utm_campaign AS campaign, s.utm_content AS content, s.ref AS ref
       FROM sessions s WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at < ? AND s.source = 'X' ORDER BY s.started_at LIMIT 20000`,
    ).bind(site.id, range.from - WINDOW_MS, range.to),
    db.prepare(`SELECT * FROM x_posts WHERE site_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 60`).bind(
      site.id, range.from - WINDOW_MS, range.to,
    ),
  ]);
  const sessions = xs.results as { v: string; t: number; campaign: string | null; content: string | null; ref: string | null }[];
  const lc = (s: string | null) => (s ? s.toLowerCase() : null);
  const postRows = (posts.results as any[]).map((r) => {
    let urls: XLink[] = [];
    try { urls = JSON.parse(r.urls || '[]'); } catch { /* ignore */ }
    const created = n(r.created_at);
    const tags = urls.filter((u) => u.campaign || u.content || u.ref);
    const exact = new Set<string>();
    const near = new Set<string>();
    for (const s of sessions) {
      const t = n(s.t);
      if (t < created) continue;
      if (tags.some((u) => (u.campaign && lc(s.campaign) === u.campaign) || (u.content && lc(s.content) === u.content) || (u.ref && lc(s.ref) === u.ref))) exact.add(s.v);
      else if (!s.campaign && !s.content && !s.ref && t < created + WINDOW_MS) near.add(s.v);
    }
    return {
      id: String(r.id), url: `https://x.com/${r.username || 'i'}/status/${r.id}`,
      username: r.username ?? null, name: r.name ?? null, avatar: r.avatar ?? null, text: r.text as string, createdAt: created,
      likes: n(r.likes), reposts: n(r.reposts), replies: n(r.replies), quotes: n(r.quotes), bookmarks: n(r.bookmarks), impressions: n(r.impressions),
      links: urls, tagged: tags.length > 0,
      /** Visitors whose X session carries this post's campaign / content / ref tag. Exact. */
      visitors: exact.size,
      /** Untagged X visitors in the 24 h after the post. An estimate, shared with any other post of that day. */
      nearbyVisitors: near.size,
    };
  });
  const t = (xt.results as any[])[0] ?? {};
  return {
    configured,
    query: xQuery(site.domain),
    sync: await syncState(db, site.id),
    x: { visitors: n(t.visitors), sessions: n(t.sessions), pageviews: n(t.pageviews), engaged: n(t.engaged) },
    networks: (networks.results as any[]).map((r) => ({ source: r.source as string, visitors: n(r.visitors), sessions: n(r.sessions), pageviews: n(r.pageviews) })),
    links: (links.results as any[]).map((r) => ({ campaign: r.campaign ?? null, content: r.content ?? null, ref: r.ref ?? null, visitors: n(r.visitors), sessions: n(r.sessions), pageviews: n(r.pageviews) })),
    landings: (landings.results as any[]).map((r) => ({ page: r.page ?? null, visitors: n(r.visitors) })),
    posts: postRows.filter((r) => r.createdAt >= range.from),
  };
}

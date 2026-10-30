import type { Context } from 'hono';
import { androidAppDomain, classify } from '../shared/sources.js';
import { getSite, type AppEnv, type Site } from './env.js';
import { DEMO_SITE_ID, ensureDemoSite } from './demo.js';
import { isBot, parseUA, uaDetails } from './lib/ua.js';
import { creditedSessionSql } from './payments.js';

const TYPES = new Set(['pageview', 'goal', 'outbound', 'ping', 'identify', 'scroll', 'engagement', 'click', 'form', 'video', 'action', 'block']);
/** Video player lifecycle events. `watch` carries seconds actually played since the last report. */
export const VIDEO_ACTIONS = new Set(['start', 'play', 'pause', 'seek', 'progress', 'complete', 'watch', 'error', 'quality', 'fullscreen', 'mute', 'rate', 'rewatch']);
export const VIDEO_MILESTONES = [10, 25, 50, 75, 90, 100];
const MAX_WATCH_DELTA_S = 120;
const MAX_PING_MS = 10 * 60_000;

interface Payload {
  w: string;
  t: string;
  u: string;
  r?: string;
  vid: string;
  sid: string;
  sw?: number;
  n?: string;
  p?: Record<string, unknown>;
  d?: number;
  lang?: string;
  tz?: string;
  cn?: string;
  ch?: { m?: string; pv?: string; bv?: string };
  /** Milliseconds this event waited in the browser's retry queue. */
  age?: number;
}

const clip = (s: unknown, n = 255): string | null =>
  typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null;

const isId = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{8,64}$/.test(s);

/** Keep valid JSON; truncating the serialized string can corrupt the entire event. */
export function serializeProperties(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length <= 1000) return serialized;
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (!key || key.length > 64) continue;
    result[key] = typeof item === 'string' ? item.slice(0, 255) : item;
    if (new TextEncoder().encode(JSON.stringify(result)).length > 1000) delete result[key];
  }
  return Object.keys(result).length ? JSON.stringify(result) : null;
}

export function normalizePath(pathname: string): string {
  let p = pathname || '/';
  try {
    p = decodeURI(p);
  } catch {}
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p.slice(0, 500);
}

function stripWww(h: string) {
  return h.replace(/^www\./, '').toLowerCase();
}

/** Is `hostname` the site's domain or one of its subdomains? */
export function belongsTo(hostname: string, domain: string): boolean {
  const h = stripWww(hostname);
  const d = stripWww(domain);
  return h === d || h.endsWith('.' + d);
}

export async function handleEvent(c: Context<AppEnv>) {
  const raw = await c.req.text();
  if (raw.length > 8192) return c.body(null, 413);
  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.body(null, 400);
  }
  if (!body || !isId(body.w) || !TYPES.has(body.t) || !isId(body.vid) || !isId(body.sid)) return c.body(null, 400);

  const ua = c.req.header('user-agent') ?? '';
  if (isBot(ua)) return c.body(null, 202);

  // The public demo provisions itself once, so first-time visits are real, not seeded data.
  if (body.w === DEMO_SITE_ID) await ensureDemoSite(c.env.DB);
  const site = await getSite(c.env.DB, body.w);
  if (!site) return c.body(null, 404);

  let url: URL;
  try {
    url = new URL(body.u);
  } catch {
    return c.body(null, 400);
  }
  // Only accept data for the site's own domain, so nobody can pollute your stats from elsewhere.
  if (!/^https?:$/.test(url.protocol) || !belongsTo(url.hostname, site.domain)) return c.body(null, 403);

  const age = Number(body.age);
  const now = Date.now() - (Number.isFinite(age) && age > 0 ? Math.min(age, 86_400_000) : 0);
  await ingest(c.env.DB, site, body, url, ua, geoOf(c), now);
  return c.body(null, 202);
}

export interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

/**
 * Visitor location. When the script is proxied through your own domain (to dodge ad blockers),
 * Cloudflare sees the proxy's location, so trust the proxy's geo headers when present (Vercel sets these).
 */
function geoOf(c: Context<AppEnv>): Geo {
  const h = (n: string) => {
    const v = c.req.header(n);
    try {
      return v ? decodeURIComponent(v) : null;
    } catch {
      return v ?? null;
    }
  };
  if (h('x-vercel-ip-country')) {
    return { country: h('x-vercel-ip-country'), region: h('x-vercel-ip-country-region'), city: h('x-vercel-ip-city') };
  }
  const cf = (c.req.raw as { cf?: IncomingRequestCfProperties }).cf;
  return { country: (cf?.country as string) ?? null, region: (cf?.region as string) ?? null, city: (cf?.city as string) ?? null };
}

export async function ingest(
  db: D1Database,
  site: Site,
  body: Payload,
  url: URL,
  ua: string,
  geo: Geo,
  now: number,
) {
  const path = normalizePath(url.pathname);
  const { t, vid, sid } = body;

  if (t === 'ping') {
    const duration = Number(body.d);
    const ms = Number.isFinite(duration) ? Math.max(0, Math.min(MAX_PING_MS, Math.round(duration))) : 0;
    await db
      .prepare('UPDATE sessions SET duration = duration + ?, last_seen_at = ? WHERE site_id = ? AND id = ? AND visitor_id = ?')
      .bind(ms, now, site.id, sid, vid)
      .run();
    return;
  }

  if (t === 'identify') {
    const p = body.p ?? {};
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(site.id, vid, now),
      db
        .prepare(
          'UPDATE visitors SET user_id = COALESCE(?, user_id), email = COALESCE(?, email), name = COALESCE(?, name) WHERE site_id = ? AND id = ?',
        )
        .bind(clip(p.user_id, 128), clip(p.email, 200)?.toLowerCase() ?? null, clip(p.name, 128), site.id, vid),
    ]);
    return;
  }

  const existing = await db
    .prepare('SELECT 1 FROM sessions WHERE site_id = ? AND id = ?')
    .bind(site.id, sid)
    .first();

  const stmts: D1PreparedStatement[] = [];
  if (!existing) {
    stmts.push(...newSession(db, site, body, url, path, ua, geo, now));
  }

  if (t === 'pageview') {
    if (existing) {
      stmts.push(
        db
          .prepare('UPDATE sessions SET pageviews = pageviews + 1, exit_page = ?, last_seen_at = ? WHERE site_id = ? AND id = ?')
          .bind(path, now, site.id, sid),
      );
    }
    stmts.push(insertEvent(db, site.id, sid, vid, now, 'pageview', null, path, null));
    stmts.push(...claimPayment(db, site.id, vid, url, now));
  } else if (t === 'goal') {
    const name = clip(body.n, 64);
    if (!name) return;
    const props = serializeProperties(body.p);
    stmts.push(
      db.prepare('UPDATE sessions SET goals = goals + 1, last_seen_at = ? WHERE site_id = ? AND id = ?').bind(now, site.id, sid),
      insertEvent(db, site.id, sid, vid, now, 'goal', name, path, props),
    );
  } else if (t === 'outbound') {
    const target = clip(body.n, 500);
    if (!target) return;
    stmts.push(
      db.prepare('UPDATE sessions SET last_seen_at = ?, interactions = interactions + 1 WHERE site_id = ? AND id = ?').bind(now, site.id, sid),
      insertEvent(db, site.id, sid, vid, now, 'outbound', target, path, null),
    );
  } else if (t === 'scroll') {
    // The browser only sends milestones once per pageview. Validate the fixed whitelist.
    if (!['25', '50', '75', '90', '100'].includes(body.n ?? '')) return;
    stmts.push(
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE site_id = ? AND id = ?').bind(now, site.id, sid),
      insertEvent(db, site.id, sid, vid, now, 'scroll', body.n!, path, null),
    );
  } else if (t === 'engagement') {
    // Small incremental foreground-active durations; bounded to avoid tampering.
    const ms = Number(body.n);
    if (!Number.isSafeInteger(ms) || ms < 1000 || ms > 60000) return;
    stmts.push(
      db.prepare('UPDATE sessions SET last_seen_at = ?, engaged_ms = engaged_ms + ? WHERE site_id = ? AND id = ?').bind(now, ms, site.id, sid),
      insertEvent(db, site.id, sid, vid, now, 'engagement', String(ms), path, null),
    );
  } else if (t === 'click') {
    // Only same-origin destination paths are recorded; strip search/hash and avoid form contents.
    const target = clip(body.n, 200);
    if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('?') || target.includes('#')) return;
    stmts.push(
      db.prepare('UPDATE sessions SET last_seen_at = ?, interactions = interactions + 1 WHERE site_id = ? AND id = ?').bind(now, site.id, sid),
      insertEvent(db, site.id, sid, vid, now, 'click', normalizePath(target), path, null),
    );
  } else if (t === 'form') {
    // Form submission names are explicitly chosen by the website owner.
    if (!body.n || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.n)) return;
    stmts.push(
      db.prepare('UPDATE sessions SET last_seen_at = ?, interactions = interactions + 1 WHERE site_id = ? AND id = ?').bind(now, site.id, sid),
      insertEvent(db, site.id, sid, vid, now, 'form', body.n, path, null),
    );
  } else if (t === 'video') {
    const ev = videoEvent(body);
    if (!ev) return;
    stmts.push(
      db
        .prepare(`UPDATE sessions SET last_seen_at = ?, interactions = interactions + ${ev.action === 'start' ? 1 : 0} WHERE site_id = ? AND id = ?`)
        .bind(now, site.id, sid),
      ev.play && (ev.action === 'progress' || ev.action === 'complete' || ev.action === 'start')
        ? // Milestones, completion and start count once per play session (player re-renders, retries, strict mode).
          db
            .prepare(
              `INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props, video_id, value, label)
               SELECT CAST(? AS TEXT), CAST(? AS TEXT), CAST(? AS TEXT), CAST(? AS BIGINT), 'video', CAST(? AS TEXT), CAST(? AS TEXT),
                 CAST(? AS TEXT), CAST(? AS TEXT), CAST(? AS BIGINT), CAST(? AS TEXT)
               WHERE NOT EXISTS (SELECT 1 FROM events x WHERE x.site_id = ? AND x.session_id = ? AND x.type = 'video'
                 AND x.video_id = ? AND x.label = ? AND x.name = ?${ev.action === 'progress' ? ' AND x.value = ?' : ''})`,
            )
            .bind(site.id, sid, vid, now, ev.action, path, ev.props, ev.id, ev.value, ev.play,
              site.id, sid, ev.id, ev.play, ev.action, ...(ev.action === 'progress' ? [ev.value] : []))
        : db
            .prepare('INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props, video_id, value, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(site.id, sid, vid, now, 'video', ev.action, path, ev.props, ev.id, ev.value, ev.play),
    );
    if (ev.title || ev.channel || ev.duration) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO videos (site_id, id, title, channel, duration, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (site_id, id) DO UPDATE SET title = COALESCE(excluded.title, videos.title),
               channel = COALESCE(excluded.channel, videos.channel), duration = COALESCE(excluded.duration, videos.duration),
               last_seen = excluded.last_seen`,
          )
          .bind(site.id, ev.id, ev.title, ev.channel, ev.duration, now, now),
      );
    }
  } else if (t === 'action') {
    // Named UI interactions chosen by the site owner (search, share, filter…). Not conversions.
    const ev = actionEvent(body);
    if (!ev) return;
    stmts.push(
      db.prepare('UPDATE sessions SET last_seen_at = ?, interactions = interactions + 1 WHERE site_id = ? AND id = ?').bind(now, site.id, sid),
      db
        .prepare('INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props, video_id, value, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(site.id, sid, vid, now, 'action', ev.name, path, ev.props, ev.videoId, null, ev.label),
    );
  } else if (t === 'block') {
    const ev = blockEvents(body);
    if (!ev.length) return;
    const click = body.n === 'click';
    stmts.push(
      db
        .prepare(`UPDATE sessions SET last_seen_at = ?, interactions = interactions + ${click ? 1 : 0} WHERE site_id = ? AND id = ?`)
        .bind(now, site.id, sid),
    );
    // One multi-row INSERT: a batch of 20 impressions costs one round trip, not 20.
    const cols = 12;
    stmts.push(
      db
        .prepare(
          `INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props, video_id, value, label, kind) VALUES ${ev
            .map(() => `(${new Array(cols).fill('?').join(', ')})`)
            .join(', ')}`,
        )
        .bind(
          ...ev.flatMap((b) => [
            site.id, sid, vid, now, click ? 'block_click' : 'block_view', b.id, path,
            b.href ? JSON.stringify({ href: b.href }) : null, b.item, b.pos, b.sponsor, b.kind,
          ]),
        ),
    );
    // Content items (video cards) carry their title, so reports can name them before anyone plays them.
    const titled = ev.filter((b) => b.item && b.title && /^[\w-]{1,64}$/.test(b.item));
    const uniq = [...new Map(titled.map((b) => [b.item!, b])).values()];
    if (uniq.length) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO videos (site_id, id, title, channel, duration, first_seen, last_seen) VALUES ${uniq.map(() => '(?, ?, ?, NULL, NULL, ?, ?)').join(', ')}
             ON CONFLICT (site_id, id) DO UPDATE SET title = COALESCE(videos.title, excluded.title)`,
          )
          .bind(...uniq.flatMap((b) => [site.id, b.item, b.title, now, now])),
      );
    }
  }
  await db.batch(stmts);
}

const BLOCK_ID = /^[\w:.\-/]{1,80}$/;
/** Validate block events: n = 'view' with p.items[] (≤ 25), or n = 'click' with a single block in p. */
export function blockEvents(body: Pick<Payload, 'n' | 'p'>) {
  const p = (body.p && typeof body.p === 'object' && !Array.isArray(body.p) ? body.p : {}) as Record<string, unknown>;
  const list = body.n === 'view' ? (Array.isArray(p.items) ? p.items.slice(0, 25) : []) : body.n === 'click' ? [p] : [];
  const out: { id: string; kind: 'sponsor' | 'content'; sponsor: string | null; href: string | null; item: string | null; pos: number | null; title: string | null }[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!BLOCK_ID.test(id)) continue;
    const item = typeof r.i === 'string' && /^[\w:.\-/]{1,120}$/.test(r.i) ? r.i : null;
    const key = id + '|' + (item ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    let href: string | null = null;
    if (typeof r.h === 'string') {
      try {
        const u = new URL(r.h, 'https://x.invalid');
        if (/^https?:$/.test(u.protocol)) href = u.hostname === 'x.invalid' ? u.pathname.slice(0, 300) : (u.origin + u.pathname).slice(0, 300);
      } catch {}
    }
    const pos = Math.round(Number(r.pos));
    out.push({
      id,
      kind: r.k === 'sponsor' ? 'sponsor' : 'content',
      sponsor: clip(r.s, 120),
      href,
      item,
      pos: Number.isFinite(pos) && pos > 0 && pos < 10000 ? pos : null,
      title: item ? clip(r.tt, 200) : null,
    });
  }
  return out;
}

/** Validate a video event: { n: action, p: { id, title?, channel?, duration?, pct?, s? } }. */
export function videoEvent(body: Pick<Payload, 'n' | 'p'>) {
  const action = body.n ?? '';
  if (!VIDEO_ACTIONS.has(action)) return null;
  const p = (body.p && typeof body.p === 'object' ? body.p : {}) as Record<string, unknown>;
  const id = typeof p.id === 'string' && /^[\w-]{1,64}$/.test(p.id) ? p.id : null;
  if (!id) return null;
  let value: number | null = null;
  if (action === 'progress') {
    const pct = Number(p.pct);
    if (!VIDEO_MILESTONES.includes(pct)) return null;
    value = pct;
  } else if (action === 'watch') {
    const secs = Math.round(Number(p.s));
    if (!Number.isFinite(secs) || secs < 1 || secs > MAX_WATCH_DELTA_S) return null;
    value = secs;
  } else if (p.t !== undefined && !['fullscreen', 'mute', 'rate'].includes(action)) {
    const pos = Math.round(Number(p.t));
    value = Number.isFinite(pos) && pos >= 0 && pos < 86400 * 2 ? pos : null;
  }
  else if (action === 'fullscreen' || action === 'mute') value = p.on ? 1 : 0;
  else if (action === 'rate') {
    const r = Number(p.rate);
    if (!Number.isFinite(r) || r <= 0 || r > 16) return null;
    value = Math.round(r * 100);
  }
  const play = typeof p.play === 'string' && /^[\w-]{4,40}$/.test(p.play) ? p.play : null;
  const quality = action === 'quality' ? clip(p.quality, 24) : null;
  if (action === 'quality' && !quality) return null;
  const dur = Math.round(Number(p.duration));
  return {
    action,
    id,
    value,
    play,
    props: quality ? JSON.stringify({ quality }) : null,
    title: clip(p.title, 200),
    channel: clip(p.channel, 120),
    duration: Number.isFinite(dur) && dur > 0 && dur < 86400 * 2 ? dur : null,
  };
}

/** Validate a custom action: { n: 'search', p: { label?: 'query', video?: id, ... } }. */
export function actionEvent(body: Pick<Payload, 'n' | 'p'>) {
  const name = body.n ?? '';
  if (!/^[a-z0-9_:.-]{1,64}$/i.test(name)) return null;
  const p = (body.p && typeof body.p === 'object' && !Array.isArray(body.p) ? body.p : {}) as Record<string, unknown>;
  const label = clip(p.label, 200);
  const videoId = typeof p.video === 'string' && /^[\w-]{1,64}$/.test(p.video) ? p.video : null;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (k !== 'label' && k !== 'video' && ['string', 'number', 'boolean'].includes(typeof v)) rest[k] = v;
  return { name: name.toLowerCase(), label, videoId, props: serializeProperties(rest) };
}

/** Screen width buckets, so the breakdown stays readable. */
export function screenBucket(width: number | undefined): string | null {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (w < 576) return '< 576 px';
  if (w < 768) return '576–767 px';
  if (w < 1024) return '768–1023 px';
  if (w < 1440) return '1024–1439 px';
  if (w < 1920) return '1440–1919 px';
  return '≥ 1920 px';
}

/** Normalise a BCP 47 tag like "fr-fr" to "fr-FR"; null for garbage. */
export function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{2}|\d{3}))?/.exec(raw.trim());
  if (!m) return null;
  return m[2] ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : m[1].toLowerCase();
}

/**
 * Dodo sends buyers back to your return URL with ?payment_id=pay_... . Seeing that on a pageview tells us
 * exactly which visitor made the payment, even when the checkout had no metadata.
 */
function claimPayment(db: D1Database, siteId: string, vid: string, url: URL, now: number): D1PreparedStatement[] {
  const paymentId = url.searchParams.get('payment_id') ?? url.searchParams.get('subscription_id');
  if (!paymentId || !/^(pay|sub)_[\w-]{4,64}$/.test(paymentId)) return [];
  return [
    db
      .prepare('INSERT OR IGNORE INTO payment_claims (site_id, payment_id, visitor_id, ts) VALUES (?, ?, ?, ?)')
      .bind(siteId, paymentId, vid, now),
    // The webhook usually arrives first; link that payment now if nothing else already did.
    db
      .prepare(
        `UPDATE payments SET visitor_id = ?, matched_by = 'return_page',
           session_id = (${creditedSessionSql()})
         WHERE site_id = ? AND (id = ? OR subscription_id = ?) AND visitor_id IS NULL`,
      )
      .bind(vid, siteId, vid, now + 60_000, siteId, paymentId, paymentId),
    db
      .prepare(
        `UPDATE visitors SET email = COALESCE(email, (SELECT email FROM payments WHERE site_id = ? AND (id = ? OR subscription_id = ?) LIMIT 1)),
           name = COALESCE(name, (SELECT name FROM payments WHERE site_id = ? AND (id = ? OR subscription_id = ?) LIMIT 1))
         WHERE site_id = ? AND id = ?`,
      )
      .bind(siteId, paymentId, paymentId, siteId, paymentId, paymentId, siteId, vid),
  ];
}

function insertEvent(
  db: D1Database,
  siteId: string,
  sid: string,
  vid: string,
  ts: number,
  type: string,
  name: string | null,
  path: string,
  props: string | null,
) {
  return db
    .prepare('INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(siteId, sid, vid, ts, type, name, path, props);
}

function newSession(
  db: D1Database,
  site: Site,
  body: Payload,
  url: URL,
  path: string,
  ua: string,
  geo: Geo,
  now: number,
): D1PreparedStatement[] {
  let referrer: string | null = null;
  let referrerDomain: string | null = null;
  const app = body.r ? /^android-app:\/\/([\w.]+)/.exec(body.r) : null;
  if (app) {
    // android-app://com.google.android.gm: the Android app that opened the link.
    referrerDomain = androidAppDomain(app[1]);
    referrer = app[1];
  } else if (body.r) {
    try {
      const r = new URL(body.r);
      // Navigation between your own pages/subdomains is not a referral.
      if (/^https?:$/.test(r.protocol) && !belongsTo(r.hostname, site.domain)) {
        referrerDomain = stripWww(r.hostname);
        referrer = (r.hostname + normalizePath(r.pathname)).slice(0, 500);
      }
    } catch {
      // android-app://com.google.android.gm and friends
      const m = /^android-app:\/\/([\w.]+)/.exec(body.r);
      if (m) referrerDomain = m[1];
    }
  }
  const q = url.searchParams;
  const utm = {
    source: clip(q.get('utm_source'), 100)?.toLowerCase() ?? null,
    medium: clip(q.get('utm_medium'), 100)?.toLowerCase() ?? null,
    campaign: clip(q.get('utm_campaign'), 200),
    term: clip(q.get('utm_term'), 200),
    content: clip(q.get('utm_content'), 200),
  };
  const ref = clip(q.get('ref') ?? q.get('via'), 100);
  const { browser, os, device } = parseUA(ua, Number(body.sw) || undefined);
  const { source, channel } = classify({ referrerDomain, utmSource: utm.source, utmMedium: utm.medium, ref, inAppBrowser: browser });
  const det = uaDetails(ua, body.ch);
  const tz = typeof body.tz === 'string' && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/.test(body.tz) ? body.tz.slice(0, 64) : null;
  const conn = typeof body.cn === 'string' && /^(slow-2g|2g|3g|4g)$/.test(body.cn) ? body.cn : null;
  const pageviews = body.t === 'pageview' ? 1 : 0;

  return [
    db.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(site.id, body.vid, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, pageviews, hostname, entry_page, exit_page,
          referrer, referrer_domain, source, channel, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ref,
          country, region, city, browser, os, device, language, screen, browser_version, os_version, device_model, timezone, connection, is_new)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           CASE WHEN EXISTS (SELECT 1 FROM sessions s2 WHERE s2.site_id = ? AND s2.visitor_id = ? AND s2.id <> ?) THEN 0 ELSE 1 END)`,
      )
      .bind(
        site.id,
        body.sid,
        body.vid,
        now,
        now,
        stripWww(url.hostname),
        path,
        path,
        referrer,
        referrerDomain,
        source,
        channel,
        utm.source,
        utm.medium,
        utm.campaign,
        utm.term,
        utm.content,
        ref,
        geo.country,
        geo.region,
        geo.city,
        browser,
        os,
        device,
        normalizeLanguage(body.lang),
        screenBucket(body.sw),
        det.browserVersion,
        det.osVersion,
        det.model,
        tz,
        conn,
        site.id,
        body.vid,
        body.sid,
      ),
    // Separate statement so concurrent first events (pageview + goal racing) never double count.
    ...(pageviews
      ? [db.prepare('UPDATE sessions SET pageviews = pageviews + 1 WHERE site_id = ? AND id = ?').bind(site.id, body.sid)]
      : []),
  ];
}

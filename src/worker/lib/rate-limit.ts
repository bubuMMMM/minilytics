/**
 * Global fixed-window rate limiter stored in Neon (`rate_limits`).
 * In-memory RateLimiter is only a fallback when the table is unreachable, so a
 * single Vercel instance can never become an open door, but the real cap is
 * shared across instances.
 *
 * Ingest limit is 600 events / 60 s / IP: well above a real visitor (engagement
 * every ~15 s, plus pageviews) and safe for n0.pub behind CGNAT, while still
 * stopping a flood. Auth and API caps are tighter.
 */
import type { Context } from 'hono';
import { RateLimiter } from './security.js';

export const INGEST_LIMIT = 600;
export const INGEST_WINDOW_MS = 60_000;
export const AUTH_LIMIT = 60;
export const AUTH_WINDOW_MS = 60_000;
export const INVITE_LIMIT = 30;
export const INVITE_WINDOW_MS = 15 * 60_000;
export const API_LIMIT = 240;
export const API_WINDOW_MS = 60_000;
export const BOT_INGEST_LIMIT = 600;
export const WAITLIST_LIMIT = 5;
export const WAITLIST_WINDOW_MS = 10 * 60_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  count: number;
}

const fallbacks = new Map<string, RateLimiter>();

export async function consumeRateLimit(
  db: D1Database | undefined,
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const rowKey = `${bucket}:${key}:${windowStart}`;

  if (db) {
    try {
      const row = await db
        .prepare(
          `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
           ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
           RETURNING count`,
        )
        .bind(rowKey, expiresAt)
        .first<{ count: number }>();
      const count = Number(row?.count ?? 1);
      return { allowed: count <= limit, retryAfterSec, count };
    } catch {
      // Missing table or a transient Neon error: fall back to a per-instance cap.
    }
  }

  const fk = `${bucket}:${limit}:${windowMs}`;
  let rl = fallbacks.get(fk);
  if (!rl) {
    rl = new RateLimiter(limit, windowMs);
    fallbacks.set(fk, rl);
  }
  const allowed = rl.allow(`${bucket}:${key}`, now);
  return { allowed, retryAfterSec, count: allowed ? 1 : limit + 1 };
}

export function applyRetryAfter(c: Context, retryAfterSec: number) {
  c.header('Retry-After', String(retryAfterSec));
}

/** Best-effort cleanup of expired windows; called from the daily cron. */
export async function purgeExpiredRateLimits(db: D1Database, now = Date.now(), batch = 5000) {
  let deleted = 0;
  for (let i = 0; i < 20; i++) {
    const r = await db.prepare('DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at < ? LIMIT ?)').bind(now, batch).run();
    const n = r.meta?.changes ?? 0;
    deleted += n;
    if (n < batch) break;
  }
  return deleted;
}

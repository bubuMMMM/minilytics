/**
 * Daily data retention: drop events/sessions/bot_hits older than the plan's retention
 * (3 years Starter, 5 years Growth), expired or already-revoked auth sessions, and
 * read notifications older than 90 days. Deletes run in batches so a large backlog
 * cannot time out a single statement.
 */
import { currentPlan } from './platform.js';

const BATCH = 2_000;
const MAX_ROUNDS = 40;
const DAY = 86_400_000;
export const NOTIF_READ_RETENTION_MS = 90 * DAY;

export interface PurgeStats {
  events: number;
  sessions: number;
  bot_hits: number;
  auth_sessions: number;
  notifications: number;
  cutoff: number;
  retentionYears: number;
}

async function deleteBatch(db: D1Database, sql: string, params: unknown[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const r = await db.prepare(sql).bind(...params).run();
    const n = r.meta?.changes ?? 0;
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

export async function purgeExpiredData(db: D1Database, now = Date.now()): Promise<PurgeStats> {
  const plan = await currentPlan(db);
  const cutoff = now - Math.round(plan.retentionYears * 365.25 * DAY);
  const events = await deleteBatch(db, 'DELETE FROM events WHERE id IN (SELECT id FROM events WHERE ts < ? LIMIT ?)', [cutoff, BATCH]);
  const sessions = await deleteBatch(
    db,
    'DELETE FROM sessions WHERE (site_id, id) IN (SELECT site_id, id FROM sessions WHERE last_seen_at < ? LIMIT ?)',
    [cutoff, BATCH],
  );
  const bot_hits = await deleteBatch(db, 'DELETE FROM bot_hits WHERE id IN (SELECT id FROM bot_hits WHERE ts < ? LIMIT ?)', [cutoff, BATCH]);
  const auth_sessions = await deleteBatch(
    db,
    'DELETE FROM auth_sessions WHERE id IN (SELECT id FROM auth_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?) LIMIT ?)',
    [now, now, BATCH],
  );
  const notifications = await deleteBatch(
    db,
    'DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE read_at IS NOT NULL AND read_at < ? LIMIT ?)',
    [now - NOTIF_READ_RETENTION_MS, BATCH],
  );
  return { events, sessions, bot_hits, auth_sessions, notifications, cutoff, retentionYears: plan.retentionYears };
}

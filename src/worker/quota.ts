/**
 * Soft event quota: we never drop an event when a plan is exceeded.
 * The daily cron (and the usage API) flags 80 % and 100 % of the monthly
 * allowance and creates a deduped in-app notification (once per month per threshold).
 */
import type { Site } from './env.js';
import { notify } from './alerts.js';
import { usage } from './platform.js';

export async function maybeQuotaNotifications(db: D1Database, sites: Site[], now = Date.now()): Promise<{ used: number; limit: number; notified: '80' | '100' | null }> {
  const u = await usage(db, now);
  const used = u.events.used;
  const limit = u.events.limit;
  if (!limit || !sites.length) return { used, limit, notified: null };
  const month = new Date(now).toISOString().slice(0, 7);
  const ratio = used / limit;
  const level: '80' | '100' | null = ratio >= 1 ? '100' : ratio >= 0.8 ? '80' : null;
  if (!level) return { used, limit, notified: null };
  const title = level === '100'
    ? `Quota d’événements atteint (${used.toLocaleString('fr-FR')} / ${limit.toLocaleString('fr-FR')} ce mois)`
    : `Quota d’événements à 80 % (${used.toLocaleString('fr-FR')} / ${limit.toLocaleString('fr-FR')} ce mois)`;
  const body = 'Les événements au-delà du quota sont conservés ; seuls les sites et les membres sont plafonnés.';
  const dedupe = `quota:${level}:${month}`;
  for (const site of sites) {
    await notify(db, site, { kind: 'quota', title, body, url: '/settings', dedupe, ts: now });
  }
  return { used, limit, notified: level };
}

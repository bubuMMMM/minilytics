/** Per-site settings stored as JSON in sites.settings (no secrets: those live in sites.integrations). */
import { forgetSite, type Site } from './env.js';

export interface AlertSettings {
  /** In-app notifications (bell). */
  inApp: boolean;
  /** Recipients of e-mail reports and alert digests. */
  emails: string[];
  weekly: boolean;
  monthly: boolean;
  /** Traffic spike / drop alerts. */
  traffic: boolean;
  /** First time a goal is completed. */
  newGoals: boolean;
  /** Goals that notify on every completion (max 1 per minute per goal). */
  goals: string[];
  payments: boolean;
  mentions: boolean;
}
export interface SiteSettings {
  allowedHostnames: string[];
  alerts: AlertSettings;
  github: { repo: string | null };
  reddit: { keywords: string[] };
}

export const DEFAULT_ALERTS: AlertSettings = { inApp: true, emails: [], weekly: false, monthly: false, traffic: true, newGoals: true, goals: [], payments: true, mentions: true };

const cache = new WeakMap<Site, SiteSettings>();
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL_RE = /^[^\s@<>,;]{1,64}@[^\s@<>,;]{1,190}\.[a-z]{2,}$/i;
const GOAL_RE = /^[\w:.\-]{1,64}$/;
const uniq = <T,>(a: T[]) => [...new Set(a)];

export function normalizeSettings(raw: any): SiteSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  const a = r.alerts && typeof r.alerts === 'object' ? r.alerts : {};
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]/) : []).map((x) => String(x).trim()).filter(Boolean).slice(0, max);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const repo = typeof r.github?.repo === 'string' ? r.github.repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '') : '';
  return {
    allowedHostnames: uniq(list(r.allowedHostnames, 20).map((h) => h.toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').replace(/^www\./, '')).filter((h) => HOST_RE.test(h))),
    alerts: {
      inApp: bool(a.inApp, DEFAULT_ALERTS.inApp),
      emails: uniq(list(a.emails, 10).map((e) => e.toLowerCase()).filter((e) => EMAIL_RE.test(e))),
      weekly: bool(a.weekly, DEFAULT_ALERTS.weekly),
      monthly: bool(a.monthly, DEFAULT_ALERTS.monthly),
      traffic: bool(a.traffic, DEFAULT_ALERTS.traffic),
      newGoals: bool(a.newGoals, DEFAULT_ALERTS.newGoals),
      goals: uniq(list(a.goals, 20).filter((g) => GOAL_RE.test(g))),
      payments: bool(a.payments, DEFAULT_ALERTS.payments),
      mentions: bool(a.mentions, DEFAULT_ALERTS.mentions),
    },
    github: { repo: /^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo) ? repo : null },
    reddit: { keywords: uniq(list(r.reddit?.keywords, 5).map((k) => k.slice(0, 60))) },
  };
}

export function readSettings(site: Site): SiteSettings {
  const hit = cache.get(site);
  if (hit) return hit;
  let raw: unknown = {};
  try {
    raw = site.settings ? JSON.parse(site.settings) : {};
  } catch {}
  const s = normalizeSettings(raw);
  cache.set(site, s);
  return s;
}

export async function saveSettings(db: D1Database, site: Site, patch: Partial<Record<keyof SiteSettings, unknown>>): Promise<SiteSettings> {
  const cur = readSettings(site);
  const next = normalizeSettings({
    ...cur,
    ...patch,
    alerts: { ...cur.alerts, ...((patch.alerts as object) ?? {}) },
    github: { ...cur.github, ...((patch.github as object) ?? {}) },
    reddit: { ...cur.reddit, ...((patch.reddit as object) ?? {}) },
  });
  await db.prepare('UPDATE sites SET settings = ? WHERE id = ?').bind(JSON.stringify(next), site.id).run();
  forgetSite(site.id);
  return next;
}

/** Cross-domain tracking: the site's domain, its subdomains, and the extra hostnames (and their subdomains). */
export function hostAllowed(site: Site, hostname: string, belongsTo: (h: string, d: string) => boolean): boolean {
  if (belongsTo(hostname, site.domain)) return true;
  return readSettings(site).allowedHostnames.some((h) => belongsTo(hostname, h));
}

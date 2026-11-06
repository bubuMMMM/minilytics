/**
 * Waitlist for /signup while self-serve accounts are closed (6 Nov 2026).
 * Public: POST /api/public/waitlist (same-origin, honeypot, 5 / 10 min per IP, no e-mail enumeration).
 * Owner: GET /api/waitlist, GET /api/waitlist.csv, DELETE /api/waitlist/:id.
 * The table is created on first use (also in migrations/0013 and migrations-pg/0014) so a deploy
 * never depends on a manual migration.
 */
import type { Context, Hono } from 'hono';
import type { AppEnv } from './env.js';
import { requireOwner } from './auth.js';
import { randomId } from './lib/crypto.js';
import { RateLimiter, csrfGuard, requestIp } from './lib/security.js';

export const WAITLIST_PLANS = ['starter', 'growth'] as const;
export type WaitlistPlan = (typeof WAITLIST_PLANS)[number];

export interface WaitlistRow { id: string; email: string; plan: string; website: string | null; source: string | null; created_at: number }

export const WAITLIST_DDL = `CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  website TEXT,
  source TEXT,
  created_at BIGINT NOT NULL
)`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validates and normalises a waitlist submission. Returns an error message in French, or the clean row. */
export function parseWaitlist(body: unknown): { error: string } | { email: string; plan: WaitlistPlan; website: string | null; source: string | null; bot: boolean } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Entrez une adresse e-mail valide.' };
  const plan = (WAITLIST_PLANS as readonly string[]).includes(String(b.plan)) ? (b.plan as WaitlistPlan) : 'starter';
  let website: string | null = null;
  if (typeof b.website === 'string' && b.website.trim()) {
    const w = b.website.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(w) || w.length > 253) return { error: 'Entrez un domaine comme monsite.fr, ou laissez le champ vide.' };
    website = w;
  }
  const source = typeof b.source === 'string' && b.source ? b.source.slice(0, 120) : null;
  // Honeypot: a field humans never see. Bots that fill it get a normal "ok" and nothing is stored.
  const bot = typeof b.company === 'string' && b.company.trim() !== '';
  return { email, plan, website, source, bot };
}

let ready: Promise<unknown> | null = null;
const ensureTable = (c: Context<AppEnv>) => (ready ??= c.env.DB.prepare(WAITLIST_DDL).run().catch((e) => { ready = null; throw e; }));

const limiter = new RateLimiter(5, 10 * 60_000);

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralise spreadsheet formulas (CSV injection) and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
};
export function waitlistCsv(rows: WaitlistRow[]): string {
  const head = ['email', 'offre', 'site', 'source', 'inscrit_le'];
  const lines = rows.map((r) => [r.email, r.plan, r.website, r.source, new Date(Number(r.created_at)).toISOString()].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}

export function registerWaitlist(app: Hono<AppEnv>) {
  app.use('/api/public/waitlist', csrfGuard);
  app.post('/api/public/waitlist', async (c) => {
    const parsed = parseWaitlist(await c.req.json().catch(() => null));
    // Typos don't burn the quota: only well-formed submissions count (5 / 10 min per IP).
    if ('error' in parsed) return c.json({ error: parsed.error }, 400);
    if (!limiter.allow(requestIp(c))) return c.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429);
    c.header('Cache-Control', 'no-store');
    if (parsed.bot) return c.json({ ok: true });
    await ensureTable(c);
    // INSERT OR IGNORE: a second sign-up with the same e-mail is silently accepted (no enumeration).
    await c.env.DB.prepare('INSERT OR IGNORE INTO waitlist (id, email, plan, website, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(randomId(8), parsed.email, parsed.plan, parsed.website, parsed.source, Date.now())
      .run();
    return c.json({ ok: true });
  });

  app.use('/api/waitlist', csrfGuard, requireOwner);
  app.use('/api/waitlist/*', csrfGuard, requireOwner);
  app.use('/api/waitlist.csv', requireOwner);
  const list = async (c: Context<AppEnv>) => {
    await ensureTable(c);
    const r = await c.env.DB.prepare('SELECT * FROM waitlist ORDER BY created_at DESC LIMIT 5000').all<WaitlistRow>();
    return r.results;
  };
  app.get('/api/waitlist', async (c) => {
    const rows = await list(c);
    const byPlan: Record<string, number> = {};
    for (const r of rows) byPlan[r.plan] = (byPlan[r.plan] ?? 0) + 1;
    return c.json({ total: rows.length, byPlan, rows: rows.slice(0, 200) });
  });
  app.get('/api/waitlist.csv', async (c) => {
    const csv = waitlistCsv(await list(c));
    return c.body(csv, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="minilytics-liste-attente.csv"' });
  });
  app.delete('/api/waitlist/:id', async (c) => {
    await ensureTable(c);
    await c.env.DB.prepare('DELETE FROM waitlist WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ ok: true });
  });
}

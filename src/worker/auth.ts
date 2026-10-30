/**
 * Authentication, team members and revocable sessions.
 * - The owner keeps logging in with ADMIN_PASSWORD; members have their own email + password (PBKDF2-SHA256, 600k).
 * - Every login creates a row in auth_sessions; the signed cookie only carries the session id, so any session can
 *   be revoked server-side. Cookies issued before this change (`admin.<expiry>`) stay valid and are upgraded to a
 *   session row on the next request, so the owner is not logged out by the deploy.
 * - Roles: owner (everything), admin (read + change the sites they were given), viewer (read-only on given sites).
 */
import type { Context, Hono, Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Principal, Role, Site } from './env.js';
import { hashPassword, passwordsMatch, randomId, randomToken, sha256Hex, signToken, verifyPassword, verifyToken } from './lib/crypto.js';
import { RateLimiter, cookieSecure, requestIp, sessionKey } from './lib/security.js';

export const AUTH_COOKIE = 'ml_auth';
const AUTH_DAYS = 30;
const DAY = 86_400_000;
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60_000;
const MAX_GLOBAL_FAILURES = 100;
const MAX_PASSWORD_LENGTH = 1024;
const MIN_MEMBER_PASSWORD = 10;
const INVITE_DAYS = 7;
const TOUCH_MS = 5 * 60_000;
const OWNER_REVOKED_KEY = 'owner_legacy_revoked_before';
const inviteLimiter = new RateLimiter(30, 15 * 60_000);

interface SessionRow { id: string; user_id: string; expires_at: number; last_seen_at: number; revoked_at: number | null; ip: string | null; ua: string | null; created_at: number }
interface UserRow { id: string; email: string; name: string | null; password_hash: string; role: Role; sites: string; created_at: number; last_login_at: number | null; disabled_at: number | null }

const parseSites = (s: string | null | undefined): '*' | string[] => {
  if (!s || s === '*') return '*';
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 500) : [];
  } catch {
    return [];
  }
};

export function canAccess(p: Principal, siteId: string): boolean {
  return p.sites === '*' || p.sites.includes(siteId);
}

/** Short per-instance cache so each API call doesn't re-read the session; revocation applies within seconds. */
const cache = new Map<string, { p: Principal | null; at: number }>();
const CACHE_MS = 5_000;
export function forgetSessions() {
  cache.clear();
}

async function key(c: Context<AppEnv>) {
  return sessionKey(c.env.SESSION_SECRET, c.env.ADMIN_PASSWORD);
}

async function setSessionCookie(c: Context<AppEnv>, sid: string, expires: number) {
  setCookie(c, AUTH_COOKIE, await signToken(await key(c), `s.${sid}.${expires}`), {
    httpOnly: true,
    secure: cookieSecure(c.req.url),
    sameSite: 'Strict',
    path: '/',
    maxAge: Math.max(0, Math.floor((expires - Date.now()) / 1000)),
  });
}

async function createSession(c: Context<AppEnv>, userId: string, expires = Date.now() + AUTH_DAYS * DAY) {
  const id = randomToken(18);
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO auth_sessions (id, user_id, created_at, expires_at, last_seen_at, ip, ua, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
    .bind(id, userId, now, expires, now, requestIp(c), (c.req.header('user-agent') ?? '').slice(0, 300))
    .run();
  await setSessionCookie(c, id, expires);
  return id;
}

async function setting(db: D1Database, k: string): Promise<string | null> {
  const r = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(k).first<{ value: string }>();
  return r?.value ?? null;
}

/** Resolves the caller from the cookie; null when logged out, expired or revoked. */
export async function authenticate(c: Context<AppEnv>): Promise<Principal | null> {
  if (!c.env.SESSION_SECRET || !c.env.ADMIN_PASSWORD) return null;
  const value = await verifyToken(await key(c), getCookie(c, AUTH_COOKIE));
  if (!value) return null;
  const parts = value.split('.');
  const now = Date.now();

  // Legacy owner cookie (`admin.<expiry>`): still valid unless the owner revoked older sessions; upgraded in place.
  if (parts.length === 2 && parts[0] === 'admin') {
    const exp = Number(parts[1]);
    if (!(exp > now && exp <= now + AUTH_DAYS * DAY + 60_000)) return null;
    const revokedBefore = Number((await setting(c.env.DB, OWNER_REVOKED_KEY)) ?? 0);
    if (exp - AUTH_DAYS * DAY < revokedBefore) return null;
    // Deterministic id: the dashboard's parallel first requests all map to one session row.
    const sid = 'legacy' + (await sha256Hex(value)).slice(0, 26);
    await c.env.DB.prepare('INSERT INTO auth_sessions (id, user_id, created_at, expires_at, last_seen_at, ip, ua, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT (id) DO NOTHING')
      .bind(sid, 'owner', exp - AUTH_DAYS * DAY, exp, now, requestIp(c), (c.req.header('user-agent') ?? '').slice(0, 300))
      .run();
    const row = await c.env.DB.prepare('SELECT revoked_at FROM auth_sessions WHERE id = ?').bind(sid).first<{ revoked_at: number | null }>();
    if (row?.revoked_at) return null;
    await setSessionCookie(c, sid, exp);
    return { userId: 'owner', role: 'owner', sites: '*', sessionId: sid, email: null, name: null };
  }
  if (parts.length !== 3 || parts[0] !== 's') return null;
  const [, sid, expRaw] = parts;
  if (!(Number(expRaw) > now)) return null;
  const hit = cache.get(sid);
  if (hit && now - hit.at < CACHE_MS) return hit.p;

  const s = await c.env.DB.prepare('SELECT * FROM auth_sessions WHERE id = ?').bind(sid).first<SessionRow>();
  let p: Principal | null = null;
  if (s && !s.revoked_at && Number(s.expires_at) > now) {
    if (s.user_id === 'owner') p = { userId: 'owner', role: 'owner', sites: '*', sessionId: sid, email: null, name: null };
    else {
      const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first<UserRow>();
      if (u && !u.disabled_at) p = { userId: u.id, role: u.role === 'admin' ? 'admin' : 'viewer', sites: parseSites(u.sites), sessionId: sid, email: u.email, name: u.name };
    }
    if (p && now - Number(s.last_seen_at) > TOUCH_MS) {
      await c.env.DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').bind(now, sid).run();
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(sid, { p, at: now });
  return p;
}

export const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  const p = await authenticate(c);
  if (!p) return c.json({ error: 'unauthorized' }, 401);
  c.set('principal', p);
  // Read-only members: any write under /api/sites is refused server-side (the UI also hides the buttons).
  if (p.role === 'viewer' && c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.json({ error: 'Accès en lecture seule' }, 403);
  await next();
  if (!c.res.headers.get('Cache-Control')) c.res.headers.set('Cache-Control', 'private, no-store');
};

export const requireOwner = async (c: Context<AppEnv>, next: Next) => {
  const p = await authenticate(c);
  if (!p) return c.json({ error: 'unauthorized' }, 401);
  if (p.role !== 'owner') return c.json({ error: 'Réservé au propriétaire' }, 403);
  c.set('principal', p);
  await next();
  if (!c.res.headers.get('Cache-Control')) c.res.headers.set('Cache-Control', 'private, no-store');
};

async function lockedOut(c: Context<AppEnv>, ip: string, now: number) {
  const recent = await c.env.DB.prepare('SELECT COUNT(CASE WHEN ip = ? THEN 1 END) AS n, COUNT(*) AS total FROM login_failures WHERE ts > ?')
    .bind(ip, now - LOCKOUT_MS)
    .first<{ n: number; total: number }>();
  return Number(recent?.n ?? 0) >= MAX_FAILURES || Number(recent?.total ?? 0) >= MAX_GLOBAL_FAILURES;
}
async function fail(c: Context<AppEnv>, ip: string, now: number) {
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO login_failures (ip, ts) VALUES (?, ?)').bind(ip, now),
    c.env.DB.prepare('DELETE FROM login_failures WHERE ts < ?').bind(now - LOCKOUT_MS),
  ]);
  await new Promise((r) => setTimeout(r, 500));
}

const cleanEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase().slice(0, 254) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sitesInput(v: unknown, known: Set<string>): '*' | string[] | null {
  if (v === '*') return '*';
  if (!Array.isArray(v)) return null;
  const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && known.has(x)))];
  return ids.length ? ids : null;
}

export function registerAuth(app: Hono<AppEnv>) {
  app.post('/api/auth/login', async (c) => {
    if (!c.env.ADMIN_PASSWORD || !c.env.SESSION_SECRET) return c.json({ error: 'Set ADMIN_PASSWORD and SESSION_SECRET (see README).' }, 500);
    const ip = requestIp(c);
    const now = Date.now();
    if (await lockedOut(c, ip, now)) return c.json({ error: 'Too many wrong attempts. Try again in 15 minutes.' }, 429);
    const b = await c.req.json<{ password?: unknown; email?: unknown }>().catch(() => ({}) as { password?: unknown; email?: unknown });
    const password = b.password;
    if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
      await fail(c, ip, now);
      return c.json({ error: 'Wrong password' }, 401);
    }
    const email = cleanEmail(b.email);
    let userId: string | null = null;
    if (email) {
      const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
      if (await verifyPassword(password, u?.password_hash) && u && !u.disabled_at) userId = u.id;
    } else if (await passwordsMatch(password, c.env.ADMIN_PASSWORD)) userId = 'owner';
    if (!userId) {
      await fail(c, ip, now);
      return c.json({ error: email ? 'Wrong email or password' : 'Wrong password' }, 401);
    }
    await c.env.DB.prepare('DELETE FROM login_failures WHERE ip = ?').bind(ip).run();
    if (userId !== 'owner') await c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, userId).run();
    await createSession(c, userId);
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', async (c) => {
    const p = await authenticate(c);
    if (p) {
      await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(Date.now(), p.sessionId).run();
      cache.delete(p.sessionId);
    }
    deleteCookie(c, AUTH_COOKIE, { path: '/', secure: cookieSecure(c.req.url), sameSite: 'Strict' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', async (c) => {
    const p = await authenticate(c);
    c.header('Cache-Control', 'private, no-store');
    if (!p) return c.json({ loggedIn: false });
    return c.json({ loggedIn: true, role: p.role, email: p.email, name: p.name, sites: p.sites });
  });

  // Your own sessions (devices), with server-side revocation.
  app.get('/api/auth/sessions', async (c) => {
    const p = await authenticate(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    const r = await c.env.DB.prepare('SELECT id, created_at, last_seen_at, expires_at, ip, ua FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC LIMIT 50')
      .bind(p.userId, Date.now()).all<SessionRow>();
    c.header('Cache-Control', 'private, no-store');
    return c.json(r.results.map((s) => ({ id: s.id.slice(0, 8), created_at: Number(s.created_at), last_seen_at: Number(s.last_seen_at), ua: s.ua, current: s.id === p.sessionId })));
  });
  app.delete('/api/auth/sessions/:short', async (c) => {
    const p = await authenticate(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    const short = c.req.param('short');
    if (!/^[\w-]{8}$/.test(short)) return c.json({ error: 'bad id' }, 400);
    if (p.sessionId.startsWith(short)) return c.json({ error: 'Utilisez « Déconnexion » pour cette session.' }, 400);
    await c.env.DB.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND substr(id, 1, 8) = ?`).bind(Date.now(), p.userId, short).run();
    forgetSessions();
    return c.json({ ok: true });
  });
  /** Log out every other device. For the owner this also invalidates pre-upgrade cookies. Never the current session. */
  app.post('/api/auth/sessions/revoke-others', async (c) => {
    const p = await authenticate(c);
    if (!p) return c.json({ error: 'unauthorized' }, 401);
    const now = Date.now();
    const stmts = [c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL').bind(now, p.userId, p.sessionId)];
    if (p.role === 'owner') stmts.push(c.env.DB.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(OWNER_REVOKED_KEY, String(now)));
    await c.env.DB.batch(stmts);
    forgetSessions();
    return c.json({ ok: true });
  });

  // ---------- team (owner only)
  app.use('/api/team', requireOwner);
  app.use('/api/team/*', requireOwner);

  app.get('/api/team', async (c) => {
    const now = Date.now();
    const [users, invites, sess] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT id, email, name, role, sites, created_at, last_login_at, disabled_at FROM users ORDER BY created_at'),
      c.env.DB.prepare('SELECT id, role, sites, note, created_at, expires_at FROM invites WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC').bind(now),
      c.env.DB.prepare('SELECT user_id, COUNT(*) AS n, MAX(last_seen_at) AS last FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ? GROUP BY user_id').bind(now),
    ]);
    const by = new Map((sess.results as any[]).map((r) => [r.user_id, r]));
    return c.json({
      owner: { sessions: Number(by.get('owner')?.n ?? 0), lastSeen: by.get('owner')?.last ? Number(by.get('owner').last) : null },
      members: (users.results as any[]).map((u) => ({ ...u, sites: parseSites(u.sites), sessions: Number(by.get(u.id)?.n ?? 0), lastSeen: by.get(u.id)?.last ? Number(by.get(u.id).last) : null })),
      invites: (invites.results as any[]).map((i) => ({ ...i, sites: parseSites(i.sites) })),
    });
  });

  app.post('/api/team/invites', async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const role = b.role === 'admin' ? 'admin' : b.role === 'viewer' ? 'viewer' : null;
    const known = new Set(((await c.env.DB.prepare('SELECT id FROM sites').all<{ id: string }>()).results).map((s) => s.id));
    const sites = sitesInput(b.sites, known);
    if (!role || !sites) return c.json({ error: 'Choisissez un rôle et au moins un site.' }, 400);
    const token = randomToken(32);
    const id = randomId(8);
    const now = Date.now();
    const expires = now + INVITE_DAYS * DAY;
    await c.env.DB.prepare('INSERT INTO invites (id, token_hash, role, sites, note, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, await sha256Hex(token), role, sites === '*' ? '*' : JSON.stringify(sites), typeof b.note === 'string' ? b.note.trim().slice(0, 100) || null : null, now, expires)
      .run();
    // The raw token is only ever returned here; the database keeps its SHA-256.
    return c.json({ id, url: new URL(`/invite/${token}`, c.req.url).toString(), expires_at: expires, role, sites });
  });
  app.delete('/api/team/invites/:iid', async (c) => {
    await c.env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL').bind(Date.now(), c.req.param('iid')).run();
    return c.json({ ok: true });
  });
  app.patch('/api/team/members/:uid', async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.req.param('uid')).first<UserRow>();
    if (!u) return c.json({ error: 'membre introuvable' }, 404);
    const known = new Set(((await c.env.DB.prepare('SELECT id FROM sites').all<{ id: string }>()).results).map((s) => s.id));
    const role = b.role === undefined ? u.role : b.role === 'admin' || b.role === 'viewer' ? b.role : null;
    const sites = b.sites === undefined ? parseSites(u.sites) : sitesInput(b.sites, known);
    if (!role || !sites) return c.json({ error: 'Rôle ou sites invalides' }, 400);
    await c.env.DB.prepare('UPDATE users SET role = ?, sites = ? WHERE id = ?').bind(role, sites === '*' ? '*' : JSON.stringify(sites), u.id).run();
    forgetSessions();
    return c.json({ ok: true });
  });
  /** Revoke a member: account deleted and every session ended immediately. */
  app.delete('/api/team/members/:uid', async (c) => {
    const id = c.req.param('uid');
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(Date.now(), id),
      c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ]);
    forgetSessions();
    return c.json({ ok: true });
  });

  // ---------- invite links (public, token-gated)
  async function findInvite(c: Context<AppEnv>, token: string) {
    if (!/^[\w-]{20,100}$/.test(token)) return null;
    return c.env.DB.prepare('SELECT * FROM invites WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?')
      .bind(await sha256Hex(token), Date.now())
      .first<{ id: string; role: Role; sites: string; expires_at: number }>();
  }
  app.get('/api/invites/:token', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!inviteLimiter.allow(requestIp(c))) return c.json({ error: 'Trop de tentatives' }, 429);
    const inv = await findInvite(c, c.req.param('token'));
    if (!inv) return c.json({ valid: false }, 404);
    const sites = parseSites(inv.sites);
    const names = sites === '*' ? null : ((await c.env.DB.prepare(`SELECT name FROM sites WHERE id IN (${sites.map(() => '?').join(', ')})`).bind(...sites).all<Pick<Site, 'name'>>()).results.map((s) => s.name));
    return c.json({ valid: true, role: inv.role, allSites: sites === '*', sites: names, expires_at: Number(inv.expires_at) });
  });
  app.post('/api/invites/:token/accept', async (c) => {
    if (!inviteLimiter.allow(requestIp(c))) return c.json({ error: 'Trop de tentatives' }, 429);
    const inv = await findInvite(c, c.req.param('token'));
    if (!inv) return c.json({ error: 'Invitation invalide, expirée ou déjà utilisée.' }, 404);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const email = cleanEmail(b.email);
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!EMAIL_RE.test(email)) return c.json({ error: 'Adresse e-mail invalide.' }, 400);
    if (password.length < MIN_MEMBER_PASSWORD || password.length > MAX_PASSWORD_LENGTH) return c.json({ error: `Mot de passe : ${MIN_MEMBER_PASSWORD} caractères minimum.` }, 400);
    if (await c.env.DB.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(email).first()) return c.json({ error: 'Un compte existe déjà avec cette adresse.' }, 409);
    const now = Date.now();
    const id = 'u_' + randomId(8);
    // Claim the invite atomically: two tabs can't both use it.
    const claim = await c.env.DB.prepare('UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?').bind(now, id, inv.id, now).run();
    if (!claim.meta?.changes) return c.json({ error: 'Invitation déjà utilisée.' }, 409);
    await c.env.DB.prepare('INSERT INTO users (id, email, name, password_hash, role, sites, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, email, name || null, await hashPassword(password), inv.role, inv.sites, now, now)
      .run();
    await createSession(c, id);
    return c.json({ ok: true });
  });
}

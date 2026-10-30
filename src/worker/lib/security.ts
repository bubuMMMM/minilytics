import type { Context, Next } from 'hono';

/**
 * Security helpers shared by the API routes. Kept framework-light so they are easy to unit test.
 */

type HeaderGetter = (name: string) => string | undefined;

/**
 * The client IP, from headers the platform sets itself and a client cannot forge.
 *
 * - Cloudflare Workers (request has `cf`): `cf-connecting-ip`.
 * - Vercel: `x-real-ip` / `x-vercel-forwarded-for` / `x-forwarded-for` are overwritten by Vercel's edge.
 *   `cf-connecting-ip` is NOT trusted there: a client can send it and Vercel passes it through,
 *   which used to let anyone bypass the login lockout by sending a random value on each attempt.
 */
export function clientIp(header: HeaderGetter, onCloudflare: boolean): string {
  if (onCloudflare) {
    const cf = header('cf-connecting-ip');
    if (cf) return cf.trim();
  }
  const v = header('x-real-ip') ?? header('x-vercel-forwarded-for') ?? header('x-forwarded-for');
  const ip = v?.split(',')[0]?.trim();
  return ip || 'unknown';
}

/** Group IPv6 addresses by /64 so one host can't rotate through its own prefix to dodge limits. */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  const parts = ip.toLowerCase().split('::');
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length > 1 && parts[1] ? parts[1].split(':') : [];
  const full = parts.length > 1 ? [...head, ...new Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head;
  return full.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, '') || '0').join(':') + '::/64';
}

export function requestIp(c: Context): string {
  const onCloudflare = !!(c.req.raw as { cf?: unknown }).cf;
  return ipBucket(clientIp((n) => c.req.header(n), onCloudflare));
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Is this state-changing request coming from another site? Browsers always send `Origin` on
 * cross-origin POST/PATCH/DELETE, and modern ones send `Sec-Fetch-Site`. Requests with neither
 * (curl, server-to-server) carry no ambient browser cookies, so they are not CSRF.
 */
export function isCrossSite(method: string, header: HeaderGetter, requestUrl: string): boolean {
  if (!UNSAFE.has(method.toUpperCase())) return false;
  const site = header('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = header('origin');
  if (!origin) return false;
  if (origin === 'null') return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return true;
  }
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(requestUrl).host.toLowerCase());
  } catch {}
  for (const h of [header('host'), header('x-forwarded-host')]) if (h) hosts.add(h.split(',')[0].trim().toLowerCase());
  return !hosts.has(o.host.toLowerCase());
}

/** Reject cross-site state-changing requests to cookie-authenticated routes (defence in depth on top of SameSite). */
export const csrfGuard = async (c: Context, next: Next) => {
  if (isCrossSite(c.req.method, (n) => c.req.header(n), c.req.url)) return c.json({ error: 'cross-site request blocked' }, 403);
  await next();
};

/** Login cookies are always `Secure`, except on plain-http localhost during development. */
export function cookieSecure(requestUrl: string): boolean {
  try {
    const u = new URL(requestUrl);
    return !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname));
  } catch {
    return true;
  }
}

/** Key used to sign session cookies: bound to the password, so changing it logs every session out. */
export async function sessionKey(secret: string, password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${secret}:${hex}`;
}

/**
 * Tiny fixed-window rate limiter, per serverless instance. Not a global guarantee, but it stops a
 * single client from flooding ingestion through one warm instance (Fluid compute reuses instances).
 */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
    private maxKeys = 10_000,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const hit = this.hits.get(key);
    if (!hit || hit.reset <= now) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    hit.n++;
    return hit.n <= this.limit;
  }
  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}

/** Cache public aggregate endpoints at Vercel's CDN for a few seconds; protects the DB from floods. */
export const PUBLIC_CACHE = 'public, max-age=0, s-maxage=15, stale-while-revalidate=60';

/** The client IP as seen through Vercel/Cloudflare, without IPv6 bucketing (for exact exclusions). */
export function rawRequestIp(c: Context): string {
  return clientIp((n) => c.req.header(n), !!(c.req.raw as { cf?: unknown }).cf);
}

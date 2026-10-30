export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Dashboard login password (set with `wrangler secret put ADMIN_PASSWORD`). */
  ADMIN_PASSWORD: string;
  /** Random string used to sign the login cookie (`wrangler secret put SESSION_SECRET`). */
  SESSION_SECRET: string;
  /** X API v2 app Bearer token (recent search). Optional: enables « Mentions sur 𝕏 ». */
  X_BEARER_TOKEN?: string;
  /** Secret Vercel Cron sends as `Authorization: Bearer …` to /api/cron/*. */
  CRON_SECRET?: string;
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  currency: string;
  api_key: string;
  dodo_webhook_secret: string | null;
  created_at: number;
  is_public?: number;
}

export type AppEnv = { Bindings: Env; Variables: { site: Site } };

const siteCache = new Map<string, { site: Site | null; at: number }>();

/** Sites change rarely; cache them per isolate so ingestion costs one fewer read per event. */
export async function getSite(db: D1Database, id: string): Promise<Site | null> {
  const hit = siteCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.site;
  // Site ids are short slugs; anything else can't exist, so skip the query (public endpoints take ids from the URL).
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<Site>();
  // Bounded: random ids from the public endpoints must not grow this map without limit.
  if (siteCache.size >= 1000) siteCache.clear();
  siteCache.set(id, { site, at: Date.now() });
  return site;
}

export function forgetSite(id: string) {
  siteCache.delete(id);
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleEvent } from '../collect.js';
import { publicDemoStats, listPublicSites, resolvePublicSite } from '../demo.js';
import { resolveRange, tzOffset } from '../lib/time.js';
import { liveGlobeStats } from '../live-globe.js';
import { liveMap, mapReport } from '../map.js';
import { type AppEnv, type Site } from '../env.js';
import { purgeExpiredRateLimits } from '../lib/rate-limit.js';
import { mapBudget } from '../lib/pool.js';
import { purgeExpiredData } from '../retention.js';
import { maybeQuotaNotifications } from '../quota.js';
import { scanMilestones } from '../milestones.js';
import { PUBLIC_CACHE } from '../lib/security.js';
import { handleDodoWebhook, handleGoalApi, handlePaymentApi } from '../payments.js';
import { publicTopVideos } from '../videos.js';
import { parseKind, publicBlocks } from '../blocks.js';
import { syncX } from '../social.js';
import { engagementReport } from '../stats.js';
import { runDailyAlerts } from '../alerts.js';
import { syncGithub, syncReddit } from '../connectors.js';
import { readSettings } from '../settings.js';
import { ERR } from '../lib/errors.js';

export function registerPublic(app: Hono<AppEnv>) {
// ---------- public: tracking, webhooks, server-side API

app.use('/api/event', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], maxAge: 86400 }));
app.post('/api/event', handleEvent);
// Public aggregate numbers for the demo and for sites marked public (sites.is_public = 1).
// No visitor-level data or credentials. Private sites return 404.
app.get('/api/public/sites', async (c) => {
  try {
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await listPublicSites(c.env.DB));
  } catch (error) {
    console.error('Public sites failed', error);
    return c.json({ error: ERR.unavailable }, 503);
  }
});
app.get('/api/public/demo', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    const days = c.req.query('days') === '30' ? 30 : 7;
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await publicDemoStats(c.env.DB, days, site));
  } catch (error) {
    console.error('Public demo statistics failed', error);
    return c.json({ error: ERR.unavailable }, 503);
  }
});
// Public read-only location aggregates.
app.get('/api/public/live-globe', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await liveGlobeStats(c.env.DB, site.id));
  } catch (error) {
    console.error('Live globe failed', error);
    return c.json({ error: ERR.liveUnavailable }, 503);
  }
});
// Public country-level map aggregates (no cities) for the demo's Carte.
app.get('/api/public/map', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    const range = resolveRange({ period: c.req.query('days') === '30' ? '30d' : c.req.query('days') === 'all' ? 'all' : '7d' }, site.timezone, site.created_at);
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await mapReport({ db: c.env.DB, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) }, { cities: false }));
  } catch (error) {
    console.error('Public map failed', error);
    return c.json({ error: ERR.mapUnavailable }, 503);
  }
});
app.get('/api/public/map/live', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await liveMap(c.env.DB, site.id, { cities: false }));
  } catch (error) {
    console.error('Public live map failed', error);
    return c.json({ error: ERR.liveMapUnavailable }, 503);
  }
});
// Public engagement aggregates; no visitor identifiers.
app.get('/api/public/engagement', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    const range = resolveRange({ period: c.req.query('days') === '30' ? '30d' : '7d' }, site.timezone, site.created_at);
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await engagementReport({ db: c.env.DB, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) }));
  } catch (error) {
    console.error('Public engagement analytics failed', error);
    return c.json({ error: ERR.engagementUnavailable }, 503);
  }
});
// Public top videos for a public site; aggregates only.
app.get('/api/public/videos', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    const range = resolveRange({ period: c.req.query('days') === '30' ? '30d' : '7d' }, site.timezone, site.created_at);
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await publicTopVideos({ db: c.env.DB, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) }));
  } catch (error) {
    console.error('Public videos failed', error);
    return c.json({ error: ERR.videoUnavailable }, 503);
  }
});
// Public sponsor / content block aggregates (impressions, clicks, CTR only) for public sites.
app.get('/api/public/blocks', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: ERR.siteNotPublic }, 404);
    const range = resolveRange({ period: c.req.query('days') === '30' ? '30d' : '7d' }, site.timezone, site.created_at);
    c.header('Cache-Control', PUBLIC_CACHE);
    return c.json(await publicBlocks({ db: c.env.DB, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) }, parseKind(c.req.query('kind'))));
  } catch (error) {
    console.error('Public blocks failed', error);
    return c.json({ error: ERR.blockUnavailable }, 503);
  }
});
app.post('/api/webhooks/dodo/:siteId', handleDodoWebhook);
// Vercel Cron (vercel.json) — refreshes X mentions for every site once a day. Requires CRON_SECRET and X_BEARER_TOKEN.
app.get('/api/cron/x-sync', async (c) => {
  const secret = c.env.CRON_SECRET;
  if (!secret || c.req.header('Authorization') !== `Bearer ${secret}`) return c.json({ error: ERR.unauthorized }, 401);
  const token = c.env.X_BEARER_TOKEN;
  if (!token) return c.json({ skipped: 'X_BEARER_TOKEN missing' });
  const sites = (await c.env.DB.prepare('SELECT * FROM sites').all<Site>()).results;
  const out: Record<string, unknown> = {};
  const ran = await mapBudget(sites, 4, 45_000, async (s) => {
    out[s.domain] = await syncX(c.env.DB, s, token);
  });
  return c.json({ ...out, remaining: ran.remaining });
});

app.post('/api/v1/payments', handlePaymentApi);
app.post('/api/v1/goals', handleGoalApi);
// Daily (vercel.json): e-mail reports (Mondays / 1st of the month), alert digest, GitHub + Reddit refresh.
app.get('/api/cron/daily', async (c) => {
  const secret = c.env.CRON_SECRET;
  if (!secret || c.req.header('Authorization') !== `Bearer ${secret}`) return c.json({ error: ERR.unauthorized }, 401);
  const sites = (await c.env.DB.prepare('SELECT * FROM sites').all<Site>()).results;
  const origin = new URL(c.req.url).origin;
  const sources: Record<string, unknown> = {};
  const ran = await mapBudget(sites, 4, 40_000, async (s) => {
    const st = readSettings(s);
    sources[s.domain] = {
      github: st.github.repo ? await syncGithub(c.env.DB, s, c.env).catch((e) => ({ ok: false, error: String(e) })) : null,
      reddit: st.reddit.keywords.length ? await syncReddit(c.env.DB, s, c.env).catch((e) => ({ ok: false, error: String(e) })) : null,
    };
  });
  const now = Date.now();
  const [rateLimits, retention, quota, milestones] = await Promise.all([
    purgeExpiredRateLimits(c.env.DB).catch(() => 0),
    purgeExpiredData(c.env.DB, now).catch((e) => ({ error: String(e) })),
    maybeQuotaNotifications(c.env.DB, sites, now).catch((e) => ({ error: String(e) })),
    scanMilestones(c.env.DB, sites, now, origin).catch((e) => ({ error: String(e) })),
  ]);
  return c.json({ alerts: await runDailyAlerts(c.env, sites, now, origin), sources, remaining: ran.remaining, rateLimits, retention, quota, milestones });
});
}


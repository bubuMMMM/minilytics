import { Hono, type Context, type Next } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { handleEvent } from './collect.js';
import { publicDemoStats, listPublicSites, resolvePublicSite } from './demo.js';
import { resolveRange, tzOffset } from './lib/time.js';
import { liveGlobeStats } from './live-globe.js';
import { forgetSite, type AppEnv, type Site } from './env.js';
import { passwordsMatch, randomId, signToken, verifyToken } from './lib/crypto.js';
import { handleDodoWebhook, handleGoalApi, handlePaymentApi, rematchPayments } from './payments.js';
import { realtime, sparklines, toCsv } from './insights.js';
import { breakdown, customers, engagementReport, funnel, makeCtx, overview, visitorProfile, visitors, type FunnelStep } from './stats.js';

const app = new Hono<AppEnv>();
const AUTH_COOKIE = 'ml_auth';
const AUTH_DAYS = 30;
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60_000;

// ---------- public: tracking, webhooks, server-side API

app.use('/api/event', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], maxAge: 86400 }));
app.post('/api/event', handleEvent);
// Public aggregate numbers for the demo and for sites marked public (sites.is_public = 1).
// No visitor-level data or credentials. Private sites return 404.
app.get('/api/public/sites', async (c) => {
  try {
    c.header('Cache-Control', 'no-store');
    return c.json(await listPublicSites(c.env.DB));
  } catch (error) {
    console.error('Public sites failed', error);
    return c.json({ error: 'Analytics temporarily unavailable' }, 503);
  }
});
app.get('/api/public/demo', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: 'Site not public' }, 404);
    const days = c.req.query('days') === '30' ? 30 : 7;
    c.header('Cache-Control', 'no-store');
    return c.json(await publicDemoStats(c.env.DB, days, site));
  } catch (error) {
    console.error('Public demo statistics failed', error);
    return c.json({ error: 'Analytics temporarily unavailable' }, 503);
  }
});
// Public read-only location aggregates.
app.get('/api/public/live-globe', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: 'Site not public' }, 404);
    c.header('Cache-Control', 'no-store, max-age=0');
    return c.json(await liveGlobeStats(c.env.DB, site.id));
  } catch (error) {
    console.error('Live globe failed', error);
    return c.json({ error: 'Live activity temporarily unavailable' }, 503);
  }
});
// Public engagement aggregates; no visitor identifiers.
app.get('/api/public/engagement', async (c) => {
  try {
    const site = await resolvePublicSite(c.env.DB, c.req.query('site'));
    if (!site) return c.json({ error: 'Site not public' }, 404);
    const range = resolveRange({ period: c.req.query('days') === '30' ? '30d' : '7d' }, site.timezone, site.created_at);
    c.header('Cache-Control', 'no-store');
    return c.json(await engagementReport({ db: c.env.DB, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) }));
  } catch (error) {
    console.error('Public engagement analytics failed', error);
    return c.json({ error: 'Engagement analytics temporarily unavailable' }, 503);
  }
});
app.post('/api/webhooks/dodo/:siteId', handleDodoWebhook);
app.post('/api/v1/payments', handlePaymentApi);
app.post('/api/v1/goals', handleGoalApi);

// ---------- login

async function isLoggedIn(c: Context<AppEnv>) {
  if (!c.env.SESSION_SECRET) return false;
  const value = await verifyToken(c.env.SESSION_SECRET, getCookie(c, AUTH_COOKIE));
  return !!value && Number(value.split('.')[1]) > Date.now();
}

app.post('/api/auth/login', async (c) => {
  if (!c.env.ADMIN_PASSWORD || !c.env.SESSION_SECRET) {
    return c.json({ error: 'Set ADMIN_PASSWORD and SESSION_SECRET (see README).' }, 500);
  }
  // Lock an IP out after too many wrong passwords, so a public dashboard can't be brute-forced.
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const now = Date.now();
  const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND ts > ?')
    .bind(ip, now - LOCKOUT_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_FAILURES) {
    return c.json({ error: 'Too many wrong attempts. Try again in 15 minutes.' }, 429);
  }
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
  if (!password || !passwordsMatch(password, c.env.ADMIN_PASSWORD)) {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO login_failures (ip, ts) VALUES (?, ?)').bind(ip, now),
      c.env.DB.prepare('DELETE FROM login_failures WHERE ts < ?').bind(now - LOCKOUT_MS),
    ]);
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: 'Wrong password' }, 401);
  }
  await c.env.DB.prepare('DELETE FROM login_failures WHERE ip = ?').bind(ip).run();
  const expires = Date.now() + AUTH_DAYS * 86_400_000;
  setCookie(c, AUTH_COOKIE, await signToken(c.env.SESSION_SECRET, `admin.${expires}`), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: AUTH_DAYS * 86_400,
  });
  return c.json({ ok: true });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/me', async (c) => c.json({ loggedIn: await isLoggedIn(c) }));

// ---------- dashboard API (login required)

const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  if (!(await isLoggedIn(c))) return c.json({ error: 'unauthorized' }, 401);
  await next();
};
app.use('/api/sites', requireAuth);
app.use('/api/sites/*', requireAuth);

const loadSite = async (c: Context<AppEnv>, next: Next) => {
  const site = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ?').bind(c.req.param('id')).first<Site>();
  if (!site) return c.json({ error: 'site not found' }, 404);
  c.set('site', site);
  await next();
};
app.use('/api/sites/:id', loadSite);
app.use('/api/sites/:id/*', loadSite);

function cleanDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const publicSite = (s: Site) => ({ ...s, dodo_webhook_secret: s.dodo_webhook_secret ? '••••••••' : null });

app.get('/api/sites', async (c) => {
  const now = Date.now();
  const [sites, stats] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM sites ORDER BY created_at'),
    c.env.DB.prepare(
      `SELECT site_id, COUNT(DISTINCT visitor_id) AS visitors,
              COUNT(DISTINCT CASE WHEN last_seen_at > ? THEN visitor_id END) AS online
       FROM sessions WHERE started_at > ? GROUP BY site_id`,
    ).bind(now - 5 * 60_000, now - 86_400_000),
  ]);
  const by = new Map((stats.results as any[]).map((r) => [r.site_id, r]));
  const spark = await sparklines(c.env.DB, now);
  return c.json(
    (sites.results as unknown as Site[]).map((s) => ({
      ...publicSite(s),
      visitors24h: by.get(s.id)?.visitors ?? 0,
      online: by.get(s.id)?.online ?? 0,
      spark: spark.get(s.id) ?? new Array(14).fill(0),
    })),
  );
});

app.post('/api/sites', async (c) => {
  const b = await c.req.json<Partial<Site>>().catch(() => ({}) as Partial<Site>);
  const domain = cleanDomain(b.domain ?? '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return c.json({ error: 'Enter a domain like example.com' }, 400);
  const tz = b.timezone && validTimezone(b.timezone) ? b.timezone : 'UTC';
  const site: Site = {
    id: randomId(8),
    name: (b.name || domain).slice(0, 100),
    domain,
    timezone: tz,
    currency: (b.currency || 'USD').toUpperCase().slice(0, 3),
    api_key: 'ml_' + randomId(16),
    dodo_webhook_secret: null,
    created_at: Date.now(),
  };
  await c.env.DB.prepare(
    'INSERT INTO sites (id, name, domain, timezone, currency, api_key, dodo_webhook_secret, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, null, site.created_at)
    .run();
  return c.json(publicSite(site));
});

app.get('/api/sites/:id', (c) => c.json(publicSite(c.get('site'))));

app.patch('/api/sites/:id', async (c) => {
  const site = c.get('site');
  const b = await c.req.json<Partial<Site>>().catch(() => ({}) as Partial<Site>);
  const next = { ...site };
  if (typeof b.name === 'string' && b.name.trim()) next.name = b.name.trim().slice(0, 100);
  if (typeof b.domain === 'string') {
    const d = cleanDomain(b.domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return c.json({ error: 'Enter a domain like example.com' }, 400);
    next.domain = d;
  }
  if (typeof b.timezone === 'string') {
    if (!validTimezone(b.timezone)) return c.json({ error: 'Unknown timezone' }, 400);
    next.timezone = b.timezone;
  }
  if (typeof b.currency === 'string' && /^[A-Za-z]{3}$/.test(b.currency)) next.currency = b.currency.toUpperCase();
  if (typeof b.dodo_webhook_secret === 'string' && !b.dodo_webhook_secret.includes('•')) {
    next.dodo_webhook_secret = b.dodo_webhook_secret.trim() || null;
  }
  if (b.is_public !== undefined) next.is_public = b.is_public ? 1 : 0;
  await c.env.DB.prepare('UPDATE sites SET name = ?, domain = ?, timezone = ?, currency = ?, dodo_webhook_secret = ?, is_public = ? WHERE id = ?')
    .bind(next.name, next.domain, next.timezone, next.currency, next.dodo_webhook_secret, Number(next.is_public ?? 0), site.id)
    .run();
  forgetSite(site.id);
  return c.json(publicSite(next));
});

app.post('/api/sites/:id/rotate-key', async (c) => {
  const key = 'ml_' + randomId(16);
  await c.env.DB.prepare('UPDATE sites SET api_key = ? WHERE id = ?').bind(key, c.get('site').id).run();
  return c.json({ api_key: key });
});

app.delete('/api/sites/:id', async (c) => {
  const id = c.get('site').id;
  await c.env.DB.batch(
    ['events', 'sessions', 'visitors', 'payments', 'funnels'].map((t) =>
      c.env.DB.prepare(`DELETE FROM ${t} WHERE site_id = ?`).bind(id),
    ).concat(c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(id)),
  );
  forgetSite(id);
  return c.json({ ok: true });
});

// ---------- stats

// Private live globe uses the same aggregates, but requires existing admin auth.
app.get('/api/sites/:id/live-globe', async (c) => {
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json(await liveGlobeStats(c.env.DB, c.get('site').id));
});
app.get('/api/sites/:id/engagement', async (c) => {
  try {
    c.header('Cache-Control', 'no-store');
    return c.json(await engagementReport(makeCtx(c)));
  } catch (error) {
    console.error('Private engagement analytics failed', error);
    return c.json({ error: 'Engagement analytics temporarily unavailable' }, 503);
  }
});
app.get('/api/sites/:id/realtime', async (c) => c.json(await realtime(c.env.DB, c.get('site'))));

app.get('/api/sites/:id/export', async (c) => {
  const dim = c.req.query('dim') ?? 'source';
  let rows;
  try {
    rows = await breakdown(makeCtx(c), dim, 500);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const csv = toCsv(
    [
      { key: 'label', label: dim },
      { key: 'visitors', label: 'visitors' },
      { key: 'pageviews', label: 'pageviews' },
      { key: 'revenue', label: 'revenue_minor_units' },
      { key: 'customers', label: 'customers' },
    ],
    rows as unknown as Record<string, unknown>[],
  );
  const site = c.get('site');
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${site.domain}-${dim.replace(/[^\w-]/g, '')}.csv"`,
  });
});

app.get('/api/sites/:id/overview', async (c) => c.json(await overview(makeCtx(c))));

app.get('/api/sites/:id/breakdown', async (c) => {
  try {
    return c.json(await breakdown(makeCtx(c), c.req.query('dim') ?? 'source', Number(c.req.query('limit')) || 100));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.post('/api/sites/:id/rematch', async (c) => c.json(await rematchPayments(c.env.DB, c.get('site'))));
app.get('/api/sites/:id/customers', async (c) => c.json(await customers(makeCtx(c))));
app.get('/api/sites/:id/visitors', async (c) => c.json(await visitors(makeCtx(c))));
app.get('/api/sites/:id/visitors/:vid', async (c) =>
  c.json(await visitorProfile(c.env.DB, c.get('site'), c.req.param('vid'))),
);

app.get('/api/sites/:id/funnels', async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM funnels WHERE site_id = ? ORDER BY created_at').bind(c.get('site').id).all();
  return c.json(res.results.map((f: any) => ({ ...f, steps: JSON.parse(f.steps) })));
});

app.post('/api/sites/:id/funnels', async (c) => {
  const b = await c.req.json<{ name?: string; steps?: FunnelStep[] }>().catch(() => ({}) as { name?: string; steps?: FunnelStep[] });
  const steps = (b.steps ?? [])
    .filter((s) => (s.type === 'page' || s.type === 'goal') && typeof s.value === 'string' && s.value.trim())
    .slice(0, 10)
    .map((s) => ({ type: s.type, value: s.value.trim().slice(0, 200) }));
  if (!b.name?.trim() || steps.length < 2) return c.json({ error: 'A funnel needs a name and at least 2 steps' }, 400);
  const id = randomId(8);
  await c.env.DB.prepare('INSERT INTO funnels (id, site_id, name, steps, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, c.get('site').id, b.name.trim().slice(0, 100), JSON.stringify(steps), Date.now())
    .run();
  return c.json({ id, name: b.name.trim(), steps });
});

app.delete('/api/sites/:id/funnels/:fid', async (c) => {
  await c.env.DB.prepare('DELETE FROM funnels WHERE id = ? AND site_id = ?').bind(c.req.param('fid'), c.get('site').id).run();
  return c.json({ ok: true });
});

app.get('/api/sites/:id/funnels/:fid/stats', async (c) => {
  const f = await c.env.DB.prepare('SELECT * FROM funnels WHERE id = ? AND site_id = ?')
    .bind(c.req.param('fid'), c.get('site').id)
    .first<{ steps: string }>();
  if (!f) return c.json({ error: 'funnel not found' }, 404);
  return c.json(await funnel(makeCtx(c), JSON.parse(f.steps)));
});

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

// Everything else is the dashboard (static files).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

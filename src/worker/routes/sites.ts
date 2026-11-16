import { Hono, type Context, type Next } from 'hono';
import { liveGlobeStats } from '../live-globe.js';
import { liveMap, mapReport } from '../map.js';
import { forgetSite, getSite, type AppEnv, type Principal, type Site } from '../env.js';
import { deleteSiteStatements } from '../site-data.js';
import { randomId } from '../lib/crypto.js';
import { rematchPayments, toSiteCurrency } from '../payments.js';
import { realtime, sparklines, toCsv } from '../insights.js';
import { videoDetail, videoReport } from '../videos.js';
import { BLOCK_ID_RE, blockDetail, blocksCsv, blocksReport, parseKind } from '../blocks.js';
import { socialReport, syncState, syncX, X_AUTO_SYNC_MS, X_SYNC_MIN_MS } from '../social.js';
import { breakdown, customers, engagementReport, funnel, makeCtx, overview, visitorProfile, visitors, type FunnelStep } from '../stats.js';
import { canAccess } from '../auth.js';
import { currentPlan } from '../platform.js';
import { revenuePrediction, revenueSummary } from '../revenue.js';
import { ERR } from '../lib/errors.js';

export function registerSites(app: Hono<AppEnv>) {
const loadSite = async (c: Context<AppEnv>, next: Next) => {
  const id = c.req.param('id') ?? '';
  // Members only see the sites they were given; others look like they don't exist.
  if (!canAccess(c.get('principal'), id)) return c.json({ error: ERR.siteNotFound }, 404);
  const site = await getSite(c.env.DB, id);
  if (!site) return c.json({ error: ERR.siteNotFound }, 404);
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

const publicSite = (s: Site, p?: Principal) => {
  const { integrations: _i, ...rest } = s;
  // Read-only members never get the API key (it can write payments and goals).
  return { ...rest, api_key: p?.role === 'viewer' ? '' : s.api_key, dodo_webhook_secret: s.dodo_webhook_secret ? '••••••••' : null };
};

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
  const by = new Map((stats.results as { site_id: string; visitors: number; online: number }[]).map((r) => [r.site_id, r]));
  const spark = await sparklines(c.env.DB, now);
  const p = c.get('principal');
  return c.json(
    (sites.results as unknown as Site[]).filter((s) => canAccess(p, s.id)).map((s) => ({
      ...publicSite(s, p),
      visitors24h: by.get(s.id)?.visitors ?? 0,
      online: by.get(s.id)?.online ?? 0,
      spark: spark.get(s.id) ?? new Array(14).fill(0),
    })),
  );
});

app.post('/api/sites', async (c) => {
  if (c.get('principal').role !== 'owner') return c.json({ error: 'Réservé au propriétaire' }, 403);
  const plan = await currentPlan(c.env.DB);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sites').first<{ n: number }>();
  if (Number(count?.n ?? 0) >= plan.sites) return c.json({ error: `L’offre ${plan.name} inclut ${plan.sites} site(s).` }, 403);
  const b = await c.req.json<Partial<Site>>().catch(() => ({}) as Partial<Site>);
  const domain = cleanDomain(b.domain ?? '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return c.json({ error: ERR.badDomain }, 400);
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

app.get('/api/sites/:id', (c) => c.json(publicSite(c.get('site'), c.get('principal'))));

app.patch('/api/sites/:id', async (c) => {
  const site = c.get('site');
  const b = await c.req.json<Partial<Site>>().catch(() => ({}) as Partial<Site>);
  const next = { ...site };
  if (typeof b.name === 'string' && b.name.trim()) next.name = b.name.trim().slice(0, 100);
  if (typeof b.domain === 'string') {
    const d = cleanDomain(b.domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return c.json({ error: ERR.badDomain }, 400);
    next.domain = d;
  }
  if (typeof b.timezone === 'string') {
    if (!validTimezone(b.timezone)) return c.json({ error: ERR.unknownTimezone }, 400);
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
  if (c.get('principal').role !== 'owner') return c.json({ error: 'Réservé au propriétaire' }, 403);
  const id = c.get('site').id;
  await c.env.DB.batch(deleteSiteStatements(c.env.DB, id));
  forgetSite(id);
  return c.json({ ok: true });
});

// ---------- stats

// Private live globe uses the same aggregates, but requires existing admin auth.
app.get('/api/sites/:id/live-globe', async (c) => {
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json(await liveGlobeStats(c.env.DB, c.get('site').id));
});
app.get('/api/sites/:id/map', async (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json(await mapReport(makeCtx(c)));
});
app.get('/api/sites/:id/map/live', async (c) => {
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json(await liveMap(c.env.DB, c.get('site').id));
});
app.get('/api/sites/:id/engagement', async (c) => {
  try {
    c.header('Cache-Control', 'no-store');
    return c.json(await engagementReport(makeCtx(c)));
  } catch (error) {
    console.error('Private engagement analytics failed', error);
    return c.json({ error: ERR.engagementUnavailable }, 503);
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
app.get('/api/sites/:id/videos', async (c) => c.json(await videoReport(makeCtx(c))));
app.get('/api/sites/:id/videos/:vid', async (c) => {
  const vid = c.req.param('vid');
  if (!/^[\w-]{1,64}$/.test(vid)) return c.json({ error: ERR.invalidVideoId }, 400);
  return c.json(await videoDetail(makeCtx(c), vid));
});

// Sponsor placements and content blocks: impressions, clicks, CTR, unique viewers/clickers.
app.get('/api/sites/:id/blocks', async (c) => c.json(await blocksReport(makeCtx(c), parseKind(c.req.query('kind')))));
app.get('/api/sites/:id/blocks.csv', async (c) => {
  const kind = parseKind(c.req.query('kind'));
  const report = await blocksReport(makeCtx(c), kind, 500);
  const site = c.get('site');
  return c.body(blocksCsv(report.blocks), 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${site.domain}-${kind ?? 'blocks'}.csv"`,
  });
});
app.get('/api/sites/:id/blocks/:blockId', async (c) => {
  const id = c.req.param('blockId');
  if (!BLOCK_ID_RE.test(id)) return c.json({ error: ERR.invalidBlockId }, 400);
  const sponsor = c.req.query('sponsor');
  return c.json(await blockDetail(makeCtx(c), id, parseKind(c.req.query('kind')), sponsor === undefined ? undefined : sponsor.slice(0, 120)));
});

app.get('/api/sites/:id/social', async (c) => {
  const site = c.get('site');
  const token = c.env.X_BEARER_TOKEN;
  if (token) {
    const s = await syncState(c.env.DB, site.id);
    if (!s || Date.now() - s.at > X_AUTO_SYNC_MS) await syncX(c.env.DB, site, token);
  }
  return c.json(await socialReport(makeCtx(c), !!token));
});
app.post('/api/sites/:id/social/sync', async (c) => {
  const site = c.get('site');
  const token = c.env.X_BEARER_TOKEN;
  if (!token) return c.json({ error: 'X_BEARER_TOKEN n’est pas configuré sur ce déploiement.' }, 409);
  const s = await syncState(c.env.DB, site.id);
  if (s && Date.now() - s.at < X_SYNC_MIN_MS) return c.json({ error: 'Actualisation déjà faite il y a moins de 10 minutes.', retryAt: s.at + X_SYNC_MIN_MS }, 429);
  return c.json(await syncX(c.env.DB, site, token));
});

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
  const res = await c.env.DB.prepare('SELECT * FROM funnels WHERE site_id = ? ORDER BY created_at').bind(c.get('site').id).all<{ steps: string }>();
  return c.json(res.results.map((f) => ({ ...f, steps: JSON.parse(f.steps) })));
});

app.post('/api/sites/:id/funnels', async (c) => {
  const b = await c.req.json<{ name?: string; steps?: FunnelStep[] }>().catch(() => ({}) as { name?: string; steps?: FunnelStep[] });
  const steps = (b.steps ?? [])
    .filter((s) => (s.type === 'page' || s.type === 'goal') && typeof s.value === 'string' && s.value.trim())
    .slice(0, 10)
    .map((s) => ({ type: s.type, value: s.value.trim().slice(0, 200) }));
  if (!b.name?.trim() || steps.length < 2) return c.json({ error: ERR.funnelNeedsSteps }, 400);
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
  if (!f) return c.json({ error: ERR.funnelNotFound }, 404);
  return c.json(await funnel(makeCtx(c), JSON.parse(f.steps)));
});

app.get('/api/sites/:id/revenue/summary', async (c) => c.json(await revenueSummary(makeCtx(c))));
app.get('/api/sites/:id/revenue/predictions', async (c) => c.json(await revenuePrediction(makeCtx(c))));
// Convert payments stored in another currency (e.g. before a rate was available, or after changing the site currency).
app.post('/api/sites/:id/revenue/reconvert', async (c) => {
  const site = c.get('site');
  const rows = (
    await c.env.DB.prepare('SELECT id, ts, amount, currency, orig_amount, orig_currency FROM payments WHERE site_id = ? AND (currency != ? OR (orig_currency IS NOT NULL AND orig_currency != ? AND currency != ?)) LIMIT 1000')
      .bind(site.id, site.currency, site.currency, site.currency)
      .all<{ id: string; ts: number; amount: number; currency: string; orig_amount: number | null; orig_currency: string | null }>()
  ).results;
  let converted = 0;
  for (const r of rows) {
    const srcAmount = r.orig_amount ?? r.amount;
    const srcCur = r.orig_currency ?? r.currency;
    const m = await toSiteCurrency(c.env.DB, site, Math.abs(Number(srcAmount)), srcCur, Number(r.ts));
    if (m.currency !== site.currency.toUpperCase()) continue;
    const sign = Number(srcAmount) < 0 ? -1 : 1;
    await c.env.DB.prepare('UPDATE payments SET amount = ?, currency = ?, orig_amount = ?, orig_currency = ?, fx_rate = ? WHERE site_id = ? AND id = ?')
      .bind(sign * m.amount, m.currency, m.orig_amount == null ? null : sign * m.orig_amount, m.orig_currency, m.fx_rate, site.id, r.id)
      .run();
    converted++;
  }
  return c.json({ checked: rows.length, converted });
});
}


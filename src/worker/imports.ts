/**
 * Imported history (Plausible CSV export). Stored as daily aggregates, separate from native data, always labelled
 * « importé » in the dashboard. Idempotent: rows are keyed by (site, kind, day, label), so re-importing the same
 * export overwrites instead of doubling. Deleting an import removes the rows it currently owns.
 */
import type { Hono } from 'hono';
import { IMPORT_KINDS, type ImportKind } from '../shared/plausible.js';
import type { AppEnv } from './env.js';
import { randomId } from './lib/crypto.js';
import { makeCtx } from './stats.js';

const MAX_ROWS = 2000;
const KINDS = new Set<string>(IMPORT_KINDS);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12 ? Math.round(v) : null);

export function registerImports(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/imports', async (c) => {
    const r = await c.env.DB.prepare('SELECT * FROM imports WHERE site_id = ? ORDER BY created_at DESC').bind(c.get('site').id).all();
    return c.json(r.results);
  });

  app.post('/api/sites/:id/imports', async (c) => {
    const site = c.get('site');
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const filename = typeof b.filename === 'string' ? b.filename.slice(0, 200) : null;
    const from = typeof b.date_from === 'string' && DAY_RE.test(b.date_from) ? b.date_from : null;
    const to = typeof b.date_to === 'string' && DAY_RE.test(b.date_to) ? b.date_to : null;
    if (b.provider !== 'plausible' || !from || !to) return c.json({ error: 'provider « plausible » et dates requis' }, 400);
    // Same export again → same import (rows overwrite, no duplicate entry in the list).
    const same = await c.env.DB.prepare('SELECT id FROM imports WHERE site_id = ? AND provider = ? AND date_from = ? AND date_to = ? AND filename IS NOT DISTINCT FROM ?')
      .bind(site.id, 'plausible', from, to, filename).first<{ id: string }>();
    if (same) {
      await c.env.DB.prepare('UPDATE imports SET status = ? WHERE id = ?').bind('importing', same.id).run();
      return c.json({ id: same.id, reused: true });
    }
    const id = randomId(8);
    await c.env.DB.prepare('INSERT INTO imports (id, site_id, provider, filename, date_from, date_to, rows, pageviews, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)')
      .bind(id, site.id, 'plausible', filename, from, to, 'importing', Date.now()).run();
    return c.json({ id, reused: false });
  });

  app.post('/api/sites/:id/imports/:iid/rows', async (c) => {
    const site = c.get('site');
    const imp = await c.env.DB.prepare('SELECT id FROM imports WHERE id = ? AND site_id = ?').bind(c.req.param('iid'), site.id).first();
    if (!imp) return c.json({ error: 'import introuvable' }, 404);
    const b = await c.req.json<{ rows?: unknown[] }>().catch(() => ({}) as { rows?: unknown[] });
    if (!Array.isArray(b.rows) || b.rows.length > MAX_ROWS) return c.json({ error: `rows: tableau de ${MAX_ROWS} lignes maximum` }, 400);
    const clean: unknown[][] = [];
    for (const raw of b.rows) {
      const r = raw as Record<string, unknown>;
      if (!r || !KINDS.has(r.kind as string) || typeof r.day !== 'string' || !DAY_RE.test(r.day) || typeof r.label !== 'string' || r.label.length > 300) {
        return c.json({ error: 'ligne invalide' }, 400);
      }
      const vals = [r.visitors, r.visits, r.pageviews, r.bounces, r.duration].map(n);
      if (vals.some((v) => v === null)) return c.json({ error: 'valeur numérique invalide' }, 400);
      clean.push([site.id, r.kind as ImportKind, r.day, r.label, imp.id, ...vals]);
    }
    for (let i = 0; i < clean.length; i += 200) {
      const chunk = clean.slice(i, i + 200);
      await c.env.DB.prepare(
        `INSERT INTO imported_stats (site_id, kind, day, label, import_id, visitors, visits, pageviews, bounces, duration)
         VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
         ON CONFLICT (site_id, kind, day, label) DO UPDATE SET import_id = excluded.import_id, visitors = excluded.visitors,
           visits = excluded.visits, pageviews = excluded.pageviews, bounces = excluded.bounces, duration = excluded.duration`,
      ).bind(...chunk.flat()).run();
    }
    return c.json({ ok: true, rows: clean.length });
  });

  app.post('/api/sites/:id/imports/:iid/complete', async (c) => {
    const site = c.get('site');
    const id = c.req.param('iid');
    const s = await c.env.DB.prepare(
      `SELECT COUNT(*) AS rows, COALESCE(SUM(CASE WHEN kind = 'visitors' THEN pageviews ELSE 0 END), 0) AS pageviews, MIN(day) AS f, MAX(day) AS t
       FROM imported_stats WHERE site_id = ? AND import_id = ?`,
    ).bind(site.id, id).first<{ rows: number; pageviews: number; f: string | null; t: string | null }>();
    await c.env.DB.prepare('UPDATE imports SET rows = ?, pageviews = ?, status = ?, date_from = COALESCE(?, date_from), date_to = COALESCE(?, date_to) WHERE id = ? AND site_id = ?')
      .bind(Number(s?.rows ?? 0), Number(s?.pageviews ?? 0), 'done', s?.f ?? null, s?.t ?? null, id, site.id).run();
    return c.json({ ok: true, rows: Number(s?.rows ?? 0), pageviews: Number(s?.pageviews ?? 0) });
  });

  app.delete('/api/sites/:id/imports/:iid', async (c) => {
    const site = c.get('site');
    const id = c.req.param('iid');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM imported_stats WHERE site_id = ? AND import_id = ?').bind(site.id, id),
      c.env.DB.prepare('DELETE FROM imports WHERE site_id = ? AND id = ?').bind(site.id, id),
    ]);
    return c.json({ ok: true });
  });

  /** Imported aggregates overlapping the selected period (null when there are none). */
  app.get('/api/sites/:id/imported', async (c) => {
    const ctx = makeCtx(c);
    const day = (t: number) => new Date(t + ctx.offset).toISOString().slice(0, 10);
    const from = day(ctx.range.from);
    const to = day(Math.max(ctx.range.from, ctx.range.to - 1));
    const p = [ctx.site.id, from, to];
    const monthly = ctx.range.granularity === 'month' || ctx.range.granularity === 'week';
    const bucket = monthly ? 'substr(day, 1, 7)' : 'day';
    const top = (kind: ImportKind) =>
      c.env.DB.prepare(`SELECT label, SUM(visitors) AS visitors, SUM(pageviews) AS pageviews FROM imported_stats WHERE site_id = ? AND day >= ? AND day <= ? AND kind = ? GROUP BY label ORDER BY visitors DESC, label LIMIT 10`).bind(...p, kind);
    const [tot, series, ...tops] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS days, MIN(day) AS f, MAX(day) AS t, COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(visits), 0) AS visits, COALESCE(SUM(pageviews), 0) AS pageviews, COALESCE(SUM(bounces), 0) AS bounces, COALESCE(SUM(duration), 0) AS duration FROM imported_stats WHERE site_id = ? AND day >= ? AND day <= ? AND kind = 'visitors'`).bind(...p),
      c.env.DB.prepare(`SELECT ${bucket} AS bucket, SUM(visitors) AS visitors, SUM(pageviews) AS pageviews FROM imported_stats WHERE site_id = ? AND day >= ? AND day <= ? AND kind = 'visitors' GROUP BY 1 ORDER BY 1`).bind(...p),
      ...(['source', 'page', 'entry_page', 'country', 'device', 'browser', 'os', 'goal'] as ImportKind[]).map(top),
    ]);
    const t = tot.results[0] as any;
    if (!t || !Number(t.days)) return c.json(null);
    const keys = ['source', 'page', 'entry_page', 'country', 'device', 'browser', 'os', 'goal'];
    const num = (r: any) => ({ label: r.label, visitors: Number(r.visitors), pageviews: Number(r.pageviews) });
    return c.json({
      from: t.f, to: t.t, days: Number(t.days), granularity: monthly ? 'month' : 'day',
      totals: {
        visitors: Number(t.visitors), visits: Number(t.visits), pageviews: Number(t.pageviews),
        bounceRate: Number(t.visits) ? Number(t.bounces) / Number(t.visits) : 0,
        avgDuration: Number(t.visits) ? Number(t.duration) / Number(t.visits) : 0,
      },
      series: (series.results as any[]).map((r) => ({ bucket: r.bucket, visitors: Number(r.visitors), pageviews: Number(r.pageviews) })),
      top: Object.fromEntries(keys.map((k, i) => [k, (tops[i].results as any[]).map(num)])),
    });
  });
}

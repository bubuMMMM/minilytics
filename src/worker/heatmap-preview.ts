import type { Context } from 'hono';
import type { Hono } from 'hono';
import type { AppEnv } from './env.js';
import { ERR } from './lib/errors.js';
import {
  PREVIEW_TTL_MS,
  PREVIEW_WIDTH,
  parseViewport,
  previewCachePath,
  previewTargetUrl,
  type PreviewViewport,
} from './lib/preview-url.js';

export interface PreviewMeta {
  available: boolean;
  stale: boolean;
  width: number;
  height: number;
  capturedAt: number;
  viewport: PreviewViewport;
  image: string;
}

interface PreviewRow {
  width: number;
  height: number;
  mime: string;
  body: unknown;
  captured_at: number;
}

function imagePath(siteId: string, path: string, viewport: PreviewViewport, capturedAt?: number) {
  const q = new URLSearchParams({ path, viewport });
  if (capturedAt) q.set('v', String(capturedAt));
  return `/api/sites/${siteId}/heatmap/preview/image?${q}`;
}

function asBuffer(value: unknown): Buffer | null {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex');
    try { return Buffer.from(value, 'base64'); } catch { return null; }
  }
  if (typeof value === 'object' && value && Array.isArray((value as { data?: unknown }).data)) {
    return Buffer.from((value as { data: number[] }).data);
  }
  return null;
}

async function loadRow(c: Context<AppEnv>, path: string, viewport: PreviewViewport): Promise<PreviewRow | null> {
  return c.env.DB.prepare(
    'SELECT width, height, mime, body, captured_at FROM heatmap_previews WHERE site_id = ? AND path = ? AND viewport = ?',
  )
    .bind(c.get('site').id, path, viewport)
    .first<PreviewRow>();
}

export async function previewMeta(c: Context<AppEnv>, path: string, viewport: PreviewViewport): Promise<PreviewMeta | { available: false; viewport: PreviewViewport }> {
  const row = await loadRow(c, path, viewport);
  if (!row) return { available: false, viewport };
  const capturedAt = Number(row.captured_at);
  return {
    available: true,
    stale: Date.now() - capturedAt > PREVIEW_TTL_MS,
    width: Number(row.width),
    height: Number(row.height),
    capturedAt,
    viewport,
    image: imagePath(c.get('site').id, path, viewport, capturedAt),
  };
}

export async function captureAndStore(c: Context<AppEnv>, path: string, viewport: PreviewViewport): Promise<PreviewMeta> {
  const site = c.get('site');
  const url = previewTargetUrl(site.domain, path);
  if (!url) throw new Error('Chemin d’aperçu invalide');
  const { capturePage } = await import('./lib/capture-page.js');
  const shot = await capturePage(url, PREVIEW_WIDTH[viewport]);
  await c.env.DB.prepare(
    `INSERT INTO heatmap_previews (site_id, path, viewport, width, height, mime, body, captured_at)
     VALUES (?, ?, ?, ?, ?, 'image/png', ?, ?)
     ON CONFLICT (site_id, path, viewport) DO UPDATE SET
       width = excluded.width, height = excluded.height, mime = excluded.mime, body = excluded.body, captured_at = excluded.captured_at`,
  )
    .bind(site.id, path, viewport, shot.width, shot.height, shot.png, Date.now())
    .run();
  return {
    available: true,
    stale: false,
    width: shot.width,
    height: shot.height,
    capturedAt: Date.now(),
    viewport,
    image: imagePath(site.id, path, viewport, Date.now()),
  };
}

export function registerHeatmapPreview(app: Hono<AppEnv>) {
  app.get('/api/sites/:id/heatmap/preview', async (c) => {
    const path = previewCachePath(c.req.query('path') || '/');
    if (!path) return c.json({ error: 'Chemin d’aperçu invalide' }, 400);
    const viewport = parseViewport(c.req.query('viewport') || c.req.query('bucket'));
    return c.json(await previewMeta(c, path, viewport));
  });

  app.get('/api/sites/:id/heatmap/preview/image', async (c) => {
    const path = previewCachePath(c.req.query('path') || '/');
    if (!path) return c.json({ error: 'Chemin d’aperçu invalide' }, 400);
    const viewport = parseViewport(c.req.query('viewport') || c.req.query('bucket'));
    const row = await loadRow(c, path, viewport);
    const body = row ? asBuffer(row.body) : null;
    if (!row || !body) return c.json({ error: ERR.notFound }, 404);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': row.mime || 'image/png',
        'Cache-Control': 'private, max-age=3600',
        'X-Preview-Width': String(row.width),
        'X-Preview-Height': String(row.height),
      },
    });
  });

  app.post('/api/sites/:id/heatmap/preview', async (c) => {
    const path = previewCachePath(c.req.query('path') || '/');
    if (!path) return c.json({ error: 'Chemin d’aperçu invalide' }, 400);
    if (!previewTargetUrl(c.get('site').domain, path)) return c.json({ error: 'Chemin d’aperçu invalide' }, 400);
    const viewport = parseViewport(c.req.query('viewport') || c.req.query('bucket'));
    try {
      return c.json(await captureAndStore(c, path, viewport));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Capture impossible';
      return c.json({ error: `Impossible de capturer l’aperçu : ${message}`, available: false, viewport }, 502);
    }
  });
}

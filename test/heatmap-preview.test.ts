import { beforeAll, describe, expect, it } from 'vitest';
import { previewCachePath, previewTargetUrl, parseViewport, PREVIEW_WIDTH } from '../src/worker/lib/preview-url';
import { testDb } from './helpers/pglite-d1';
import type { Site } from '../src/worker/env';

describe('preview URL allowlist', () => {
  it('only allows https on the site’s own domain', () => {
    expect(previewTargetUrl('n0.pub', '/trending')).toBe('https://n0.pub/trending');
    expect(previewTargetUrl('n0.pub', '/')).toBe('https://n0.pub/');
    expect(previewTargetUrl('n0.pub', '//evil.com')).toBeNull();
    expect(previewTargetUrl('n0.pub', 'https://evil.com/')).toBeNull();
    expect(previewTargetUrl('n0.pub', '/ok?x=1#h')).toBe('https://n0.pub/ok');
    expect(previewTargetUrl('minilytics-six.vercel.app', '/demo')).toBe('https://minilytics-six.vercel.app/demo');
    expect(previewCachePath('/demo/')).toBe('/demo');
    expect(parseViewport('mobile')).toBe('mobile');
    expect(PREVIEW_WIDTH.desktop).toBe(1440);
    expect(PREVIEW_WIDTH.mobile).toBe(390);
  });
});

describe('preview cache', () => {
  const site: Site = { id: 'site_prev_1', name: 'n0', domain: 'n0.pub', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k', dodo_webhook_secret: null, created_at: 0 };
  // 1×1 transparent PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let db: D1Database;

  beforeAll(async () => {
    ({ db } = await testDb());
    await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  });

  it('stores and reads a PNG by site, path and viewport', async () => {
    const now = Date.now();
    await db.prepare(
      `INSERT INTO heatmap_previews (site_id, path, viewport, width, height, mime, body, captured_at)
       VALUES (?, ?, ?, ?, ?, 'image/png', ?, ?)`,
    ).bind(site.id, '/', 'desktop', 1440, 900, png, now).run();
    const row = await db.prepare('SELECT width, height, body, captured_at FROM heatmap_previews WHERE site_id = ? AND path = ? AND viewport = ?')
      .bind(site.id, '/', 'desktop').first<{ width: number; height: number; body: unknown; captured_at: number }>();
    expect(row?.width).toBe(1440);
    expect(row?.height).toBe(900);
    const body = row?.body;
    const buf = Buffer.isBuffer(body) ? body : body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(String(body).replace(/^\\x/, ''), typeof body === 'string' && String(body).startsWith('\\x') ? 'hex' : 'utf8');
    expect(buf.length).toBeGreaterThan(10);
    expect(buf.subarray(0, 4).toString('ascii') === 'PNG' || buf[0] === 0x89).toBe(true);
  });
});

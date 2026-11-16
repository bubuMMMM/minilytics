import { beforeAll, describe, expect, it } from 'vitest';
import { ingest } from '../src/worker/collect';
import { heatmapReport, vitalsReport } from '../src/worker/web-quality';
import { resolveRange, tzOffset } from '../src/worker/lib/time';
import type { Site } from '../src/worker/env';
import { testDb } from './helpers/pglite-d1';

const site: Site = { id: 'site_wq_1', name: 'n0', domain: 'n0.pub', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k', dodo_webhook_secret: null, created_at: 0 };
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOW = Date.UTC(2026, 9, 30, 12);
const FR = { country: 'FR', region: 'IDF', city: 'Paris' };

let db: D1Database;
async function send(body: Record<string, unknown>, ua = UA_DESKTOP, at = NOW) {
  const b = { w: site.id, sw: ua === UA_DESKTOP ? 1440 : 390, ...body } as any;
  await ingest(db, site, b, new URL(b.u), ua, FR, at);
}
const ctx = () => {
  const range = resolveRange({ period: 'today' }, site.timezone, 0, NOW + 3_600_000);
  return { db, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) };
};

beforeAll(async () => {
  ({ db } = await testDb());
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();

  await send({ t: 'pageview', u: 'https://n0.pub/', vid: 'visitor_d1', sid: 'session_d1' });
  await send({ t: 'pageview', u: 'https://n0.pub/prix', vid: 'visitor_d2', sid: 'session_d2' });
  await send({ t: 'pageview', u: 'https://n0.pub/', vid: 'visitor_m1', sid: 'session_m1' }, UA_MOBILE);

  // 4 LCP samples on / : 1000, 2000, 3000, 4000 → p75 = 3250 (needs-improvement)
  const lcps = [1000, 2000, 3000, 4000];
  for (let i = 0; i < 4; i++) {
    const sid = i < 3 ? 'session_d1' : 'session_m1';
    const vid = i < 3 ? 'visitor_d1' : 'visitor_m1';
    const ua = i < 3 ? UA_DESKTOP : UA_MOBILE;
    await send({ t: 'vital', u: 'https://n0.pub/', vid, sid, p: { lcp: lcps[i], inp: 80 + i, cls: 0.04 * i, fcp: 800, ttfb: 200, vw: ua === UA_DESKTOP ? 1440 : 390 } }, ua, NOW + i * 1000);
  }
  await send({ t: 'vital', u: 'https://n0.pub/prix', vid: 'visitor_d2', sid: 'session_d2', p: { lcp: 1800, inp: 120, cls: 0.02, fcp: 700, ttfb: 150, vw: 1440 } });

  // Heat: 5 clicks on / (desktop CTA) + 2 on /prix + one rage cluster
  for (let i = 0; i < 5; i++) {
    await send({ t: 'heat', u: 'https://n0.pub/', n: 'a#cta', vid: 'visitor_d1', sid: 'session_d1', p: { x: 0.2, y: 0.3, s: 'a#cta', t: 'Essayer', r: 0, vw: 1440 } }, UA_DESKTOP, NOW + 10_000 + i);
  }
  await send({ t: 'heat', u: 'https://n0.pub/', n: 'button.menu', vid: 'visitor_m1', sid: 'session_m1', p: { x: 0.8, y: 0.9, s: 'button.menu', t: 'Menu', r: 1, vw: 390 } }, UA_MOBILE, NOW + 20_000);
  await send({ t: 'heat', u: 'https://n0.pub/prix', n: 'a#buy', vid: 'visitor_d2', sid: 'session_d2', p: { x: 0.5, y: 0.5, s: 'a#buy', t: 'Acheter', r: 0, vw: 1440 } });
  // Rejected: no coordinates, or input text must be stripped if somehow ingested
  await send({ t: 'heat', u: 'https://n0.pub/', n: 'input#email', vid: 'visitor_d1', sid: 'session_d1', p: { x: 0.1, y: 0.1, s: 'form>input#email', t: 'secret@example.com', r: 0, vw: 1440 } });
  await send({ t: 'heat', u: 'https://n0.pub/', n: 'a#bad', vid: 'visitor_d1', sid: 'session_d1', p: { x: 2, y: 0.1, vw: 1440 } });
});

describe('vitals report', () => {
  it('aggregates p75 per page and splits by device', async () => {
    const report = await vitalsReport(ctx());
    expect(report.samples).toBe(5);
    const home = report.pages.find((p) => p.path === '/');
    const prix = report.pages.find((p) => p.path === '/prix');
    expect(home?.samples).toBe(4);
    expect(home?.p75.lcp).toBe(3250);
    expect(home?.rating.lcp).toBe('needs-improvement');
    expect(home?.devices.desktop.samples).toBe(3);
    expect(home?.devices.mobile.samples).toBe(1);
    expect(prix?.p75.lcp).toBe(1800);
    expect(prix?.rating.lcp).toBe('good');
    const selected = await vitalsReport(ctx(), '/prix');
    expect(selected.selected?.path).toBe('/prix');
    const today = selected.trend.filter((row) => row.samples > 0);
    expect(today.length).toBeGreaterThanOrEqual(1);
    expect(today[0].counts.lcp).toBeGreaterThanOrEqual(1);
    expect(selected.trend.some((row) => row.samples === 0 && row.lcp == null)).toBe(true);
  });
});

describe('heatmap report', () => {
  it('aggregates clicks, drops invalid points and input text', async () => {
    const report = await heatmapReport(ctx());
    const home = report.pages.find((p) => p.path === '/');
    expect(home?.clicks).toBe(7); // 5 CTA + 1 menu + 1 email field (text stripped) ; invalid x=2 dropped
    const full = await heatmapReport(ctx(), '/');
    expect(full.samples).toBe(7);
    const cta = full.elements.find((e) => e.selector === 'a#cta');
    expect(cta).toMatchObject({ clicks: 5, text: 'Essayer' });
    const email = full.elements.find((e) => e.selector.includes('input'));
    expect(email?.text).toBeNull();
    const desktop = await heatmapReport(ctx(), '/', 'desktop');
    expect(desktop.elements.some((e) => e.selector === 'a#cta')).toBe(true);
    expect(desktop.elements.some((e) => e.selector === 'button.menu')).toBe(false);
  });
});

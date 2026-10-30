import { describe, expect, it, beforeAll } from 'vitest';
import { ingest } from '../src/worker/collect';
import { blockDetail, blocksCsv, blocksReport, bucketStart, metrics, publicBlocks } from '../src/worker/blocks';
import { overview } from '../src/worker/stats';
import { videoDetail, videoReport } from '../src/worker/videos';
import { resolveRange, tzOffset } from '../src/worker/lib/time';
import type { Site } from '../src/worker/env';
import { testDb } from './helpers/pglite-d1';

const site: Site = { id: 'site_test_1', name: 'n0', domain: 'n0.pub', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k', dodo_webhook_secret: null, created_at: 0 };
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOW = Date.UTC(2026, 9, 30, 12);
const FR = { country: 'FR', region: 'IDF', city: 'Paris' };
const US = { country: 'US', region: 'CA', city: 'San Francisco' };

let db: D1Database;
async function send(body: Record<string, unknown>, ua = UA_MOBILE, geo = FR, at = NOW) {
  const b = { w: site.id, sw: ua === UA_DESKTOP ? 1440 : 390, ...body } as any;
  await ingest(db, site, b, new URL(b.u), ua, geo, at);
}
const ctx = () => {
  const range = resolveRange({ period: 'today' }, site.timezone, 0, NOW + 3_600_000);
  return { db, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) };
};

beforeAll(async () => {
  ({ db } = await testDb());
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  const sponsor = { id: 'trending-justdropped-sponsor2-bidouilleurs', k: 'sponsor', s: 'Bidouilleurs', h: 'https://bidouilleurs.co/?utm=x' };
  const house = { id: 'watch-reco-sponsor2-house', k: 'sponsor', s: 'n0.pub' };
  // Visitor A (mobile, FR, from X): sees the sponsor + 2 cards, clicks the sponsor twice (once middle-click).
  await send({ t: 'pageview', u: 'https://n0.pub/trending?utm_source=X', r: 'https://t.co/abc', vid: 'visitor_aaaa', sid: 'session_aaaa' });
  await send({ t: 'block', n: 'view', u: 'https://n0.pub/trending', vid: 'visitor_aaaa', sid: 'session_aaaa', p: { items: [
    sponsor,
    { id: 'trending-justdropped', k: 'content', i: 'dQw4w9WgXcQ', pos: 1, tt: 'Never gonna give you up' },
    { id: 'trending-justdropped', k: 'content', i: 'abcdefghijk', pos: 3 },
  ] } });
  await send({ t: 'block', n: 'click', u: 'https://n0.pub/trending', vid: 'visitor_aaaa', sid: 'session_aaaa', p: sponsor });
  await send({ t: 'block', n: 'click', u: 'https://n0.pub/trending', vid: 'visitor_aaaa', sid: 'session_aaaa', p: sponsor });
  // Visitor B (desktop, US, direct): sees the sponsor and the house slot on /watch, clicks a card.
  await send({ t: 'pageview', u: 'https://n0.pub/trending', vid: 'visitor_bbbb', sid: 'session_bbbb' }, UA_DESKTOP, US);
  await send({ t: 'block', n: 'view', u: 'https://n0.pub/trending', vid: 'visitor_bbbb', sid: 'session_bbbb', p: { items: [sponsor, { id: 'trending-justdropped', i: 'dQw4w9WgXcQ', pos: 1 }] } }, UA_DESKTOP, US);
  await send({ t: 'block', n: 'click', u: 'https://n0.pub/trending', vid: 'visitor_bbbb', sid: 'session_bbbb', p: { id: 'trending-justdropped', i: 'dQw4w9WgXcQ', pos: 1 } }, UA_DESKTOP, US);
  await send({ t: 'pageview', u: 'https://n0.pub/watch?v=dQw4w9WgXcQ', vid: 'visitor_bbbb', sid: 'session_bbbb' }, UA_DESKTOP, US);
  await send({ t: 'block', n: 'view', u: 'https://n0.pub/watch?v=dQw4w9WgXcQ', vid: 'visitor_bbbb', sid: 'session_bbbb', p: { items: [house] } }, UA_DESKTOP, US);
  // Visitor C: one pageview, nothing else → the only bounce.
  await send({ t: 'pageview', u: 'https://n0.pub/', vid: 'visitor_cccc', sid: 'session_cccc' });
});

describe('sponsor & content blocks (Postgres)', () => {
  it('aggregates impressions, clicks, CTR and unique viewers per placement and sponsor', async () => {
    const r = await blocksReport(ctx(), 'sponsor');
    const s = r.blocks.find((b) => b.id === 'trending-justdropped-sponsor2-bidouilleurs')!;
    expect(s).toMatchObject({ sponsor: 'Bidouilleurs', kind: 'sponsor', page: '/trending', href: 'https://bidouilleurs.co/', impressions: 2, viewers: 2, clicks: 2, clickers: 1, ctr: 1 });
    expect(r.blocks.find((b) => b.id === 'watch-reco-sponsor2-house')).toMatchObject({ page: '/watch', impressions: 1, clicks: 0, ctr: 0 });
    expect(r.totals).toMatchObject({ impressions: 3, clicks: 2, viewers: 2, clickers: 1 });
    expect(r.sponsors.find((x) => x.sponsor === 'Bidouilleurs')).toMatchObject({ impressions: 2, clicks: 2, placements: 1 });
    expect(r.series.reduce((n, b) => n + b.impressions, 0)).toBe(3);
    expect(r.series[0].t).toBe(bucketStart(r.series[0].label, ctx().offset));
  });
  it('breaks a placement down by device, country and source', async () => {
    const d = await blockDetail(ctx(), 'trending-justdropped-sponsor2-bidouilleurs', 'sponsor', 'Bidouilleurs');
    expect(d.block).toMatchObject({ impressions: 2, clicks: 2 });
    const byDevice = Object.fromEntries(d.breakdown.device.map((x) => [x.label, x]));
    expect(byDevice.Mobile).toMatchObject({ impressions: 1, clicks: 2 });
    expect(byDevice.Desktop).toMatchObject({ impressions: 1, clicks: 0 });
    expect(d.breakdown.country.map((x) => x.label).sort()).toEqual(['FR', 'US']);
    expect(d.breakdown.source.find((x) => x.label === 'X')).toMatchObject({ clicks: 2 });
  });
  it('lists content items with titles, positions and CTR', async () => {
    const r = await blocksReport(ctx(), 'content');
    expect(r.blocks[0]).toMatchObject({ id: 'trending-justdropped', impressions: 3, clicks: 1 });
    expect(r.pages[0]).toMatchObject({ page: '/trending', impressions: 3 });
    const d = await blockDetail(ctx(), 'trending-justdropped', 'content');
    const card = d.items.find((i) => i.item === 'dQw4w9WgXcQ')!;
    expect(card).toMatchObject({ title: 'Never gonna give you up', pos: 1, impressions: 2, clicks: 1, ctr: 0.5 });
  });
  it('exports CSV and strips visitor counts from the public view', async () => {
    const r = await blocksReport(ctx(), 'sponsor');
    const csv = blocksCsv(r.blocks);
    expect(csv.split('\r\n')[0]).toBe('placement,kind,sponsor,page,href,impressions,unique_viewers,clicks,unique_clickers,ctr_percent');
    expect(csv).toContain('trending-justdropped-sponsor2-bidouilleurs,sponsor,Bidouilleurs,/trending,https://bidouilleurs.co/,2,2,2,1,100.00');
    const pub = await publicBlocks(ctx(), 'sponsor');
    expect(pub.blocks[0]).not.toHaveProperty('viewers');
    expect(pub.totals).toEqual({ impressions: 3, clicks: 2, ctr: 2 / 3 });
  });
  it('counts a session as engaged when it interacted, even on a single page', async () => {
    const o = await overview(ctx());
    expect(o.current.sessions).toBe(3);
    expect(o.current.bounceRate).toBeCloseTo(1 / 3);
    expect(o.current.engagedSessions).toBe(2);
  });
  it('stores precise session context (source, lowercased UTM, geo, device, versions)', async () => {
    const s = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind('session_aaaa').first<any>();
    expect(s).toMatchObject({ source: 'X', channel: 'Organic Social', utm_source: 'x', referrer_domain: 't.co', country: 'FR', city: 'Paris', device: 'Mobile', os: 'iOS', os_version: '18.1', browser_version: '18', device_model: 'iPhone' });
    expect(Number(s.interactions)).toBe(2);
  });
  it('computes CTR safely', () => {
    expect(metrics({ impressions: 0, clicks: 3 }).ctr).toBe(0);
    expect(metrics({ impressions: 4, clicks: 1 }).ctr).toBe(0.25);
  });
});

describe('video precision (Postgres)', () => {
  it('dedupes start, milestones and completion per play session and counts rewatches and player settings', async () => {
    const base = { t: 'video', u: 'https://n0.pub/watch?v=vidvidvid01', vid: 'visitor_vvvv', sid: 'session_vvvv' };
    await send({ t: 'pageview', u: base.u, vid: base.vid, sid: base.sid });
    const v = (n: string, p: Record<string, unknown> = {}) => send({ ...base, n, p: { id: 'vidvidvid01', duration: 200, title: 'Clip', ...p } });
    await v('start', { play: 'play_one', t: 0 });
    await v('start', { play: 'play_one', t: 0 }); // strict-mode double fire
    await v('progress', { play: 'play_one', pct: 25 });
    await v('progress', { play: 'play_one', pct: 25 }); // retried
    await v('progress', { play: 'play_one', pct: 50 });
    await v('quality', { play: 'play_one', quality: 'hd1080' });
    await v('rate', { play: 'play_one', rate: 1.5 });
    await v('fullscreen', { play: 'play_one', on: true });
    await v('mute', { play: 'play_one', on: true });
    await v('watch', { play: 'play_one', s: 100 });
    await v('complete', { play: 'play_one' });
    await v('complete', { play: 'play_one' });
    await v('rewatch', { play: 'play_two' });
    await v('start', { play: 'play_two', t: 0 });
    await v('progress', { play: 'play_two', pct: 25 });
    const rep = await videoReport(ctx());
    const row = rep.videos.find((x) => x.id === 'vidvidvid01')!;
    expect(row).toMatchObject({ plays: 2, rewatches: 1, fullscreens: 1, mutes: 1, rateChanges: 1, completions: 1, watchSeconds: 100 });
    const ev = await db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'video' AND name = 'progress' AND value = 25`).first<{ n: number }>();
    expect(ev!.n).toBe(2); // once per play
    const det = await videoDetail(ctx(), 'vidvidvid01');
    expect(det.qualities).toEqual([{ label: 'hd1080', count: 1 }]);
    expect(det.speeds).toEqual([{ rate: 1.5, count: 1 }]);
    expect(det.pages[0]).toMatchObject({ label: '/watch', plays: 2 });
  });
});

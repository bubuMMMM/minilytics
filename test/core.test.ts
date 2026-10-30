import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { classify } from '../src/shared/sources';
import { actionEvent, belongsTo, normalizeLanguage, normalizePath, screenBucket, videoEvent } from '../src/worker/collect';
import { verifyStandardWebhook } from '../src/worker/lib/crypto';
import { bucketLabels, resolveRange, startOfDay, tzOffset } from '../src/worker/lib/time';
import { isBot, parseUA } from '../src/worker/lib/ua';

describe('classify', () => {
  it('maps t.co to X / social', () => {
    expect(classify({ referrerDomain: 't.co' })).toMatchObject({ source: 'X', channel: 'Organic Social' });
  });
  it('maps Google to organic search', () => {
    expect(classify({ referrerDomain: 'google.co.in' })).toMatchObject({ source: 'Google', channel: 'Organic Search' });
  });
  it('recognises AI assistants, including utm_source=chatgpt.com', () => {
    expect(classify({ referrerDomain: null, utmSource: 'chatgpt.com' })).toMatchObject({ source: 'ChatGPT', channel: 'AI' });
  });
  it('lets ref/utm tags win over the referrer', () => {
    expect(classify({ referrerDomain: 'google.com', ref: 'producthunt' })).toMatchObject({ source: 'Product Hunt' });
    expect(classify({ referrerDomain: null, ref: 'my-newsletter-42' })).toMatchObject({ source: 'my-newsletter-42', channel: 'Referral' });
  });
  it('detects paid and email by medium', () => {
    expect(classify({ referrerDomain: 'google.com', utmMedium: 'cpc' }).channel).toBe('Paid');
    expect(classify({ referrerDomain: null, utmSource: 'buttondown', utmMedium: 'email' }).channel).toBe('Email');
  });
  it('falls back to Direct', () => {
    expect(classify({ referrerDomain: null })).toMatchObject({ source: 'Direct', channel: 'Direct' });
  });
  it('does not confuse mail.google.com with Google search', () => {
    expect(classify({ referrerDomain: 'mail.google.com' })).toMatchObject({ source: 'Gmail', channel: 'Email' });
  });
});

describe('user agents', () => {
  it('parses common browsers', () => {
    expect(parseUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toEqual({ browser: 'Mobile Safari', os: 'iOS', device: 'Mobile' });
    expect(parseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0')).toEqual({ browser: 'Edge', os: 'Windows', device: 'Desktop' });
    expect(parseUA('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36').browser).toBe('Chrome');
  });
  it('flags bots', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('Mozilla/5.0 HeadlessChrome/120')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36')).toBe(false);
  });
});

describe('domains and paths', () => {
  it('accepts subdomains only', () => {
    expect(belongsTo('app.shipkit.dev', 'shipkit.dev')).toBe(true);
    expect(belongsTo('www.shipkit.dev', 'shipkit.dev')).toBe(true);
    expect(belongsTo('evilshipkit.dev', 'shipkit.dev')).toBe(false);
  });
  it('normalises paths', () => {
    expect(normalizePath('/pricing/')).toBe('/pricing');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/caf%C3%A9')).toBe('/café');
  });
});

describe('time ranges', () => {
  const now = Date.UTC(2026, 9, 23, 12, 0); // 23 Oct 2026 12:00 UTC
  it('computes timezone offsets', () => {
    expect(tzOffset('Asia/Kolkata', now)).toBe(330 * 60_000);
    expect(tzOffset('UTC', now)).toBe(0);
  });
  it('starts "today" at local midnight', () => {
    const r = resolveRange({ period: 'today' }, 'Asia/Kolkata', 0, now);
    expect(r.from).toBe(Date.UTC(2026, 9, 22, 18, 30));
    expect(r.granularity).toBe('hour');
  });
  it('last 30 days covers 30 local days', () => {
    const r = resolveRange({ period: '30d' }, 'UTC', 0, now);
    expect(r.from).toBe(startOfDay(now, 'UTC') - 29 * 86_400_000);
    expect(bucketLabels(r, 0)).toHaveLength(30);
  });
  it('custom ranges include the whole last day', () => {
    const r = resolveRange({ period: 'custom', from: '2026-10-01', to: '2026-10-07' }, 'UTC', 0, now);
    expect(r.to - r.from).toBe(7 * 86_400_000);
  });
  it('weekly buckets start on Monday', () => {
    const r = resolveRange({ period: '30d', granularity: 'week' }, 'UTC', 0, now);
    for (const l of bucketLabels(r, 0)) expect(new Date(l + 'T00:00:00Z').getUTCDay()).toBe(1);
  });
});

describe('Standard Webhooks (Dodo)', () => {
  const key = Buffer.from('super-secret-key-bytes');
  const secret = 'whsec_' + key.toString('base64');
  const body = '{"type":"payment.succeeded"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', key).update(`msg_1.${ts}.${body}`).digest('base64');
  it('accepts a valid signature (also among several)', async () => {
    expect(await verifyStandardWebhook(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body)).toBe(true);
    expect(await verifyStandardWebhook(secret, { id: 'msg_1', timestamp: ts, signature: `v1,old v1,${sig}` }, body)).toBe(true);
  });
  it('rejects tampering and stale timestamps', async () => {
    expect(await verifyStandardWebhook(secret, { id: 'msg_1', timestamp: ts, signature: `v1,${sig}` }, body + ' ')).toBe(false);
    expect(await verifyStandardWebhook(secret, { id: 'msg_1', timestamp: String(Number(ts) - 3600), signature: `v1,${sig}` }, body)).toBe(false);
  });
});
import { fillDaily, fillMinutes, toCsv } from '../src/worker/insights';

describe('insights helpers', () => {
  it('writes RFC 4180 CSV and escapes quotes, commas and formulas', () => {
    const csv = toCsv(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [
        { a: 'hello, "world"', b: 3 },
        { a: '=HYPERLINK("x")', b: null },
      ],
    );
    expect(csv).toBe('A,B\r\n"hello, ""world""",3\r\n"\'=HYPERLINK(""x"")",\r\n');
  });
  it('zero-fills daily sparklines, oldest first', () => {
    const DAY = 86_400_000;
    const now = 20_000 * DAY + 5000;
    expect(fillDaily([{ d: 20_000, n: 4 }, { d: 19_998, n: 2 }, { d: 19_000, n: 9 }], now, 4)).toEqual([0, 2, 0, 4]);
  });
  it('zero-fills per-minute realtime counts', () => {
    const now = 1000 * 60_000 + 10;
    expect(fillMinutes([{ m: 999, n: 1 }, { m: 1000, n: 3 }], now, 3)).toEqual([0, 1, 3]);
  });
});

describe('video and action events', () => {
  it('accepts valid video events and bounds values', () => {
    expect(videoEvent({ n: 'start', p: { id: 'dQw4w9WgXcQ', title: 'Hello', channel: 'Chan', duration: 212.4 } })).toMatchObject({
      action: 'start', id: 'dQw4w9WgXcQ', title: 'Hello', channel: 'Chan', duration: 212,
    });
    expect(videoEvent({ n: 'progress', p: { id: 'abc', pct: 50 } })?.value).toBe(50);
    expect(videoEvent({ n: 'progress', p: { id: 'abc', pct: 33 } })).toBeNull();
    expect(videoEvent({ n: 'watch', p: { id: 'abc', s: 15 } })?.value).toBe(15);
    expect(videoEvent({ n: 'watch', p: { id: 'abc', s: 9999 } })).toBeNull();
    expect(videoEvent({ n: 'seek', p: { id: 'abc', t: 42.6 } })?.value).toBe(43);
    expect(videoEvent({ n: 'hack', p: { id: 'abc' } })).toBeNull();
    expect(videoEvent({ n: 'start', p: { id: 'bad id!' } })).toBeNull();
  });
  it('keeps action labels and scalar properties only', () => {
    const a = actionEvent({ n: 'Search', p: { label: 'lofi beats', video: 'abc', results: 12, nested: { x: 1 } } });
    expect(a).toMatchObject({ name: 'search', label: 'lofi beats', videoId: 'abc' });
    expect(JSON.parse(a!.props!)).toEqual({ results: 12 });
    expect(actionEvent({ n: 'bad name!' })).toBeNull();
  });
  it('buckets screens and normalises languages', () => {
    expect(screenBucket(390)).toBe('< 576 px');
    expect(screenBucket(1920)).toBe('≥ 1920 px');
    expect(screenBucket(0)).toBeNull();
    expect(normalizeLanguage('fr-fr')).toBe('fr-FR');
    expect(normalizeLanguage('EN')).toBe('en');
    expect(normalizeLanguage('???')).toBeNull();
  });
});

import { androidAppDomain } from '../src/shared/sources';
import { blockEvents } from '../src/worker/collect';
import { uaDetails } from '../src/worker/lib/ua';

describe('precision tracking', () => {
  it('maps android-app referrers and in-app browsers to their network', () => {
    expect(classify({ referrerDomain: androidAppDomain('com.twitter.android') })).toMatchObject({ source: 'X', channel: 'Organic Social' });
    expect(classify({ referrerDomain: androidAppDomain('com.google.android.gm') })).toMatchObject({ source: 'Gmail', channel: 'Email' });
    expect(classify({ referrerDomain: null, inAppBrowser: 'Instagram' })).toMatchObject({ source: 'Instagram' });
    expect(classify({ referrerDomain: null, inAppBrowser: 'TikTok' })).toMatchObject({ source: 'TikTok' });
    expect(classify({ referrerDomain: 't.co' }).source).toBe('X');
  });
  it('parses versions and models', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
    expect(uaDetails(android)).toEqual({ browserVersion: '129', osVersion: '14', model: 'SM-S918B' });
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    expect(uaDetails(ios)).toEqual({ browserVersion: '18', osVersion: '18.1', model: 'iPhone' });
    expect(uaDetails(android, { m: 'Pixel 9', pv: '15.0.0', bv: '130' })).toEqual({ browserVersion: '130', osVersion: '15.0.0', model: 'Pixel 9' });
  });
  it('validates block impressions and clicks', () => {
    const views = blockEvents({ n: 'view', p: { items: [
      { id: 'trending-sponsor-2', k: 'sponsor', s: 'Bidouilleurs', h: 'https://bidouilleurs.co/x?y=1' },
      { id: 'trending-sponsor-2', k: 'sponsor', s: 'Bidouilleurs' },
      { id: 'home-trending', i: 'dQw4w9WgXcQ', pos: 3 },
      { id: 'bad id!' },
    ] } });
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ kind: 'sponsor', sponsor: 'Bidouilleurs', href: 'https://bidouilleurs.co/x' });
    expect(views[1]).toMatchObject({ kind: 'content', item: 'dQw4w9WgXcQ', pos: 3 });
    expect(blockEvents({ n: 'click', p: { id: 'watch-sidebar', k: 'sponsor', h: 'javascript:alert(1)' } })[0].href).toBeNull();
  });
});

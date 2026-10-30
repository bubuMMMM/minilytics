import { describe, expect, it, beforeAll } from 'vitest';
import { ingest } from '../src/worker/collect';
import { linkTags, socialReport, syncX, xQuery } from '../src/worker/social';
import { resolveRange, tzOffset } from '../src/worker/lib/time';
import type { Site } from '../src/worker/env';
import { testDb } from './helpers/pglite-d1';

const site: Site = { id: 'site_social', name: 'Blog', domain: 'exemple.fr', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'k', dodo_webhook_secret: null, created_at: 0 };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const NOW = Date.UTC(2026, 9, 30, 12);
const POST_AT = NOW - 3_600_000;
let db: D1Database;
const send = (body: Record<string, unknown>, at = NOW) => ingest(db, site, { w: site.id, sw: 1440, ...body } as any, new URL(body.u as string), UA, { country: 'FR', region: 'IDF', city: 'Paris' }, at);
const ctx = () => {
  const range = resolveRange({ period: 'today' }, site.timezone, 0, NOW + 3_600_000);
  return { db, site, range, filters: {}, offset: tzOffset(site.timezone, range.to) };
};
const fakeX = (status = 200) => (async () => new Response(JSON.stringify({
  data: [
    { id: '111', author_id: 'u1', text: 'Mon article https://t.co/abc', created_at: new Date(POST_AT).toISOString(),
      public_metrics: { like_count: 12, retweet_count: 3, reply_count: 1, quote_count: 0, bookmark_count: 2, impression_count: 900 },
      entities: { urls: [{ url: 'https://t.co/abc', expanded_url: 'https://exemple.fr/blog/a?utm_source=x&utm_campaign=lancement' }, { url: 'https://t.co/zzz', expanded_url: 'https://autre.com/' }] } },
    { id: '222', author_id: 'u2', text: 'exemple.fr est top', created_at: new Date(POST_AT).toISOString(), public_metrics: {} },
  ],
  includes: { users: [{ id: 'u1', username: 'alice', name: 'Alice' }, { id: 'u2', username: 'bob', name: 'Bob' }] },
  meta: {},
}), { status })) as unknown as typeof fetch;

beforeAll(async () => {
  ({ db } = await testDb());
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(site.id, site.name, site.domain, site.timezone, site.currency, site.api_key, 0).run();
  // Tagged visit from the post, an untagged t.co visit, and a Reddit visit.
  await send({ t: 'pageview', u: 'https://exemple.fr/blog/a?utm_source=x&utm_campaign=Lancement', r: 'https://t.co/', vid: 'visitor_aaaa', sid: 'session_aaaa' });
  await send({ t: 'pageview', u: 'https://exemple.fr/', r: 'https://t.co/', vid: 'visitor_bbbb', sid: 'session_bbbb' });
  await send({ t: 'pageview', u: 'https://exemple.fr/', r: 'https://www.reddit.com/r/france', vid: 'visitor_cccc', sid: 'session_cccc' });
});

describe('social & X mentions', () => {
  it('builds the X search query and reads link tags', () => {
    expect(xQuery('https://www.Exemple.fr/')).toBe('(url:"exemple.fr" OR "exemple.fr") -is:retweet');
    expect(linkTags('https://exemple.fr/?utm_campaign=Promo&ref=x-post')).toMatchObject({ campaign: 'promo', ref: 'x-post' });
  });

  it('works without a token: social networks and X links attribution', async () => {
    const r = await socialReport(ctx() as any, false);
    expect(r.configured).toBe(false);
    expect(r.x).toMatchObject({ visitors: 2, sessions: 2 });
    expect(r.networks.map((x) => x.source).sort()).toEqual(['Reddit', 'X']);
    expect(r.links.find((l) => l.campaign?.toLowerCase() === 'lancement')).toMatchObject({ visitors: 1 });
    expect(r.posts).toEqual([]);
  });

  it('syncs mentions and attributes tagged visits to the post', async () => {
    const res = await syncX(db, site, 'token', fakeX(), NOW);
    expect(res).toEqual({ ok: true, found: 2 });
    const r = await socialReport(ctx() as any, true);
    expect(r.sync).toMatchObject({ ok: true, found: 2 });
    const a = r.posts.find((p) => p.id === '111')!;
    expect(a).toMatchObject({ username: 'alice', likes: 12, impressions: 900, tagged: true, visitors: 1, nearbyVisitors: 1, url: 'https://x.com/alice/status/111' });
    expect(a.links).toHaveLength(1); // the other-domain link is dropped
    expect(r.posts.find((p) => p.id === '222')).toMatchObject({ tagged: false, visitors: 0 });
  });

  it('records a clear error when X refuses the token', async () => {
    const res = await syncX(db, site, 'bad', fakeX(401), NOW + 1);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/401/);
    const r = await socialReport(ctx() as any, true);
    expect(r.sync).toMatchObject({ ok: false });
    expect(r.posts).toHaveLength(2); // earlier posts are kept
  });
});

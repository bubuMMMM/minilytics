import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { ingest } from '../src/worker/collect';
import { botToken, normalizeHit } from '../src/worker/bots';
import { detectAiBot } from '../src/shared/aibots';
import { aggregatePlausible, parseCsv, plausibleFile } from '../src/shared/plausible';
import { hashPassword, signToken, verifyPassword } from '../src/worker/lib/crypto';
import { sessionKey } from '../src/worker/lib/security';
import { bucketLabels, resolveRange } from '../src/worker/lib/time';
import type { Site } from '../src/worker/env';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'owner password for tests';
const SECRET = 'test-secret';
const site: Site = { id: 'site_batch2', name: 'B2', domain: 'b2.test', timezone: 'Europe/Paris', currency: 'EUR', api_key: 'ml_' + 'b'.repeat(32), dodo_webhook_secret: null, created_at: 0 };
const other: Site = { ...site, id: 'site_other', name: 'Other', domain: 'other.test', api_key: 'ml_' + 'c'.repeat(32) };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let db: PgliteD1;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env() as any);
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];
const as = (cookie: string) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
  call(path, {
    ...init,
    headers: { cookie, origin: ORIGIN, ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
let owner: ReturnType<typeof as>;
let ownerCookie = '';

beforeAll(async () => {
  db = await makeDb();
  for (const s of [site, other]) {
    await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(s.id, s.name, s.domain, s.timezone, s.currency, s.api_key, 0).run();
  }
  const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.1.0.1' }, body: JSON.stringify({ password: PASSWORD }) });
  ownerCookie = cookieOf(r);
  owner = as(ownerCookie);
}, 60_000);

describe('« Maintenant » period', () => {
  it('covers the last 30 minutes, per minute', () => {
    const now = Date.UTC(2026, 9, 30, 21, 10, 30);
    const r = resolveRange({ period: 'now' }, 'Europe/Paris', 0, now);
    expect(r.to - r.from).toBe(30 * 60_000);
    expect(r.granularity).toBe('minute');
    const labels = bucketLabels(r, 3_600_000);
    expect(labels.length).toBe(31);
    expect(labels.at(-1)).toBe('2026-10-30T22:10');
  });
  it('serves the overview with minute buckets', async () => {
    const r = await owner(`/api/sites/${site.id}/overview?period=now`);
    expect(r.status).toBe(200);
    const j: any = await r.json();
    expect(j.range.granularity).toBe('minute');
    expect(j.series.length).toBeGreaterThanOrEqual(30);
  });
});

describe('AI bots', () => {
  it('detects AI crawlers and agents, not browsers or Googlebot', () => {
    expect(detectAiBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot')?.name).toBe('GPTBot');
    expect(detectAiBot('Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)')?.category).toBe('assistant');
    expect(detectAiBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')?.operator).toBe('Anthropic');
    expect(detectAiBot('Mozilla/5.0 (compatible; PerplexityBot/1.0)')?.category).toBe('search');
    expect(detectAiBot('meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)')?.name).toBe('Meta-ExternalAgent');
    expect(detectAiBot(UA)).toBeNull();
    expect(detectAiBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBeNull();
    expect(detectAiBot(UA, '"https://chatgpt.com"')?.name).toBe('ChatGPT Agent');
  });

  it('normalizes Vercel log drain entries', () => {
    const h = normalizeHit({ source: 'edge', proxy: { userAgent: ['GPTBot/1.2'], path: '/blog?x=1', statusCode: 200, timestamp: 1_760_000_000_000 } });
    expect(h).toMatchObject({ ua: 'GPTBot/1.2', path: '/blog?x=1', status: 200, ts: 1_760_000_000_000 });
  });

  it('requires the site bot token and only stores AI bots', async () => {
    const url = `/api/v1/bots/${site.id}`;
    expect((await call(url, { method: 'POST', body: '[]' })).status).toBe(401);
    expect((await call(url, { method: 'POST', headers: { authorization: 'Bearer ' + site.api_key }, body: '[]' })).status).toBe(401);
    const token = await botToken(site);
    const now = Date.now();
    const r = await call(url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify([
        { ua: 'Mozilla/5.0 (compatible; GPTBot/1.2)', path: '/blog/a?utm=1', ts: now - 1000, status: 200, country: 'us' },
        { ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', path: '/blog/a', ts: now - 2000 },
        { ua: 'Perplexity-User/1.0', path: '/pricing', ts: now - 3000 },
        { ua: UA, path: '/' },
      ]),
    });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ stored: 3, ignored: 1, overQuota: 0 });
    // NDJSON with the token in the query string (log shippers that can't set headers).
    const nd = await call(`${url}?token=${token}`, { method: 'POST', body: '{"user_agent":"CCBot/2.0","path":"/docs"}\n{"user_agent":"curl/8"}\n' });
    expect(await nd.json()).toEqual({ stored: 1, ignored: 1, overQuota: 0 });
  });

  it('logs AI agents that reach the tracker without counting a visit', async () => {
    const r = await call('/api/event', {
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)', 'content-type': 'text/plain' },
      body: JSON.stringify({ w: site.id, t: 'pageview', u: 'https://b2.test/guide', vid: 'aibot123456', sid: 'aibot123456' }),
    });
    expect(r.status).toBe(202);
    const s = await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE site_id = ? AND visitor_id = ?').bind(site.id, 'aibot123456').first<{ n: number }>();
    expect(s?.n).toBe(0);
    const h = await db.prepare("SELECT bot, source, path FROM bot_hits WHERE site_id = ? AND source = 'script'").bind(site.id).first();
    expect(h).toEqual({ bot: 'ChatGPT-User', source: 'script', path: '/guide' });
  });

  it('reports hits per bot, pages, usage and AI referrals', async () => {
    await ingest(db as unknown as D1Database, site, { w: site.id, t: 'pageview', u: 'https://b2.test/blog/a', r: 'https://chatgpt.com/', vid: 'visitor_ai1', sid: 'session_ai1', sw: 1440 } as any, new URL('https://b2.test/blog/a'), UA, { country: 'FR', region: null, city: null } as any, Date.now() - 60_000);
    const r: any = await (await owner(`/api/sites/${site.id}/bots?period=today`)).json();
    expect(r.totals.hits).toBe(5);
    expect(r.bots.find((b: any) => b.bot === 'GPTBot')).toMatchObject({ operator: 'OpenAI', hits: 1 });
    expect(r.pages[0]).toMatchObject({ path: '/blog/a', hits: 2, bots: 2 });
    expect(r.usage).toMatchObject({ used: 5, limit: 100_000 });
    expect(r.aiReferrals.visitors).toBe(1);
    expect(r.aiReferrals.sources[0].label).toBe('ChatGPT');
    const setup: any = await (await owner(`/api/sites/${site.id}/bots/setup`)).json();
    expect(setup.token).toBe(await botToken(site));
    expect(setup.endpoint).toBe(`${ORIGIN}/api/v1/bots/${site.id}`);
  });
});

const VISITORS = '"date","visitors","pageviews","bounces","visits","visit_duration"\n"2024-01-01",10,30,4,12,600\n"2024-01-02",20,50,5,22,900\n';
const SOURCES = '"date","source","referrer","utm_source","utm_medium","utm_campaign","utm_content","utm_term","pageviews","visitors","visits","visit_duration","bounces"\n"2024-01-01","Google","google.com","","","","","",10,5,5,100,1\n"2024-01-01","Google","google.fr","","","","","",4,2,2,10,1\n"2024-01-01","","","","","","","",3,3,3,0,2\n';
const LOCATIONS = 'date,country,region,city,visitors,visits,visit_duration,bounces,pageviews\n2024-01-01,FR,FR-PAC,3027647,3,3,4,0,6\n2024-01-01,FR,FR-IDF,2988507,2,2,0,1,2\n2024-01-01,US,US-CA,0,1,1,0,1,1\n';

describe('Plausible import', () => {
  it('parses quoted CSV and recognises export file names', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']]);
    expect(plausibleFile('export/imported_devices_20230209_20240123.csv')).toEqual({ table: 'imported_devices', from: '2023-02-09', to: '2024-01-23' });
    expect(plausibleFile('notes.csv')).toBeNull();
  });

  it('aggregates referrers and regions into their source / country', () => {
    const a = aggregatePlausible([
      { name: 'imported_visitors_20240101_20240102.csv', text: VISITORS },
      { name: 'imported_sources_20240101_20240102.csv', text: SOURCES },
      { name: 'imported_locations_20240101_20240102.csv', text: LOCATIONS },
      { name: 'dup/imported_visitors_20240101_20240102.csv', text: VISITORS },
    ]);
    expect(a.from).toBe('2024-01-01');
    expect(a.files.length).toBe(3);
    const g = a.rows.find((r) => r.kind === 'source' && r.label === 'Google');
    expect(g).toMatchObject({ visitors: 7, pageviews: 14, visits: 7 });
    expect(a.rows.find((r) => r.kind === 'source' && r.label === 'Direct / None')?.visitors).toBe(3);
    expect(a.rows.find((r) => r.kind === 'country' && r.label === 'FR')?.visitors).toBe(5);
    expect(a.rows.filter((r) => r.kind === 'visitors').map((r) => r.visitors)).toEqual([10, 20]);
  });

  it('imports idempotently, shows labelled aggregates and deletes cleanly', async () => {
    const a = aggregatePlausible([
      { name: 'imported_visitors_20240101_20240102.csv', text: VISITORS },
      { name: 'imported_sources_20240101_20240102.csv', text: SOURCES },
    ]);
    const run = async () => {
      const imp: any = await (await owner(`/api/sites/${site.id}/imports`, { method: 'POST', json: { provider: 'plausible', filename: 'plausible.zip', date_from: a.from, date_to: a.to } })).json();
      expect((await owner(`/api/sites/${site.id}/imports/${imp.id}/rows`, { method: 'POST', json: { rows: a.rows } })).status).toBe(200);
      return (await (await owner(`/api/sites/${site.id}/imports/${imp.id}/complete`, { method: 'POST' })).json()) as any;
    };
    const first = await run();
    const second = await run();
    expect(second).toEqual(first);
    expect(first.pageviews).toBe(80);
    const list: any[] = await (await owner(`/api/sites/${site.id}/imports`)).json();
    expect(list.length).toBe(1);
    const im: any = await (await owner(`/api/sites/${site.id}/imported?period=custom&from=2024-01-01&to=2024-01-31`)).json();
    expect(im.totals).toMatchObject({ visitors: 30, pageviews: 80, visits: 34 });
    expect(im.top.source[0]).toMatchObject({ label: 'Google', visitors: 7 });
    expect(im.series.map((s: any) => s.bucket)).toEqual(['2024-01-01', '2024-01-02']);
    expect(await (await owner(`/api/sites/${site.id}/imported?period=today`)).json()).toBeNull();
    // Malformed rows are refused.
    expect((await owner(`/api/sites/${site.id}/imports/${list[0].id}/rows`, { method: 'POST', json: { rows: [{ kind: 'evil', day: '2024-01-01', label: '', visitors: 1, visits: 1, pageviews: 1, bounces: 0, duration: 0 }] } })).status).toBe(400);
    await owner(`/api/sites/${site.id}/imports/${list[0].id}`, { method: 'DELETE' });
    expect(await (await owner(`/api/sites/${site.id}/imported?period=custom&from=2024-01-01&to=2024-01-31`)).json()).toBeNull();
    const left = await db.prepare('SELECT COUNT(*) AS n FROM imported_stats WHERE site_id = ?').bind(site.id).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe('team members, roles and sessions', () => {
  it('hashes member passwords with PBKDF2', async () => {
    const h = await hashPassword('a long enough password', 20_000);
    expect(h).toMatch(/^pbkdf2\$sha256\$20000\$/);
    expect(await verifyPassword('a long enough password', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('invites a read-only member for one site, enforces access and revokes', async () => {
    const inv: any = await (await owner('/api/team/invites', { method: 'POST', json: { role: 'viewer', sites: [site.id] } })).json();
    expect(inv.url).toMatch(/\/invite\/[\w-]{40,}$/);
    const token = inv.url.split('/').pop();
    const stored = await db.prepare('SELECT token_hash FROM invites WHERE id = ?').bind(inv.id).first<{ token_hash: string }>();
    expect(stored?.token_hash).not.toBe(token);
    const info: any = await (await call(`/api/invites/${token}`)).json();
    expect(info).toMatchObject({ valid: true, role: 'viewer', sites: ['B2'] });
    const accept = (body: unknown) => call(`/api/invites/${token}/accept`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) });
    expect((await accept({ email: 'lea@example.com', password: 'short' })).status).toBe(400);
    const ok = await accept({ email: 'Lea@Example.com', name: 'Léa', password: 'a very good password' });
    expect(ok.status).toBe(200);
    expect((await accept({ email: 'other@example.com', password: 'a very good password' })).status).toBe(404);
    const viewer = as(cookieOf(ok));
    expect(await (await viewer('/api/auth/me')).json()).toMatchObject({ loggedIn: true, role: 'viewer', email: 'lea@example.com', sites: [site.id] });
    const sites: any[] = await (await viewer('/api/sites')).json();
    expect(sites.map((s) => s.id)).toEqual([site.id]);
    expect(sites[0].api_key).toBe('');
    expect((await viewer(`/api/sites/${site.id}/overview?period=7d`)).status).toBe(200);
    expect((await viewer(`/api/sites/${other.id}/overview?period=7d`)).status).toBe(404);
    expect((await viewer(`/api/sites/${site.id}/segments`, { method: 'POST', json: { name: 'x', filters: {} } })).status).toBe(403);
    expect((await viewer('/api/team')).status).toBe(403);
    expect((await viewer('/api/sites', { method: 'POST', json: { domain: 'x.test' } })).status).toBe(403);
    // Member login with email + password.
    const again = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.1.0.9' }, body: JSON.stringify({ email: 'lea@example.com', password: 'a very good password' }) });
    expect(again.status).toBe(200);
    expect((await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.1.0.9' }, body: JSON.stringify({ email: 'lea@example.com', password: PASSWORD }) })).status).toBe(401);
    const team: any = await (await owner('/api/team')).json();
    const lea = team.members.find((m: any) => m.email === 'lea@example.com');
    expect(lea).toMatchObject({ role: 'viewer', sites: [site.id], sessions: 2 });
    expect(JSON.stringify(team)).not.toMatch(/pbkdf2/);
    // Promote to admin: can now write.
    await owner(`/api/team/members/${lea.id}`, { method: 'PATCH', json: { role: 'admin' } });
    await new Promise((r) => setTimeout(r, 5_100)); // per-instance session cache
    const seg = await viewer(`/api/sites/${site.id}/segments`, { method: 'POST', json: { name: 'Mobile', filters: { device: 'Mobile' } } });
    expect(seg.status).toBe(200);
    // Revoke: every session of that member stops working at once.
    await owner(`/api/team/members/${lea.id}`, { method: 'DELETE' });
    expect((await viewer('/api/sites')).status).toBe(401);
    expect((await as(cookieOf(again))('/api/sites')).status).toBe(401);
  }, 60_000);

  it('upgrades a pre-existing owner cookie without logging out, and can revoke other sessions', async () => {
    const exp = Date.now() + 20 * 86_400_000;
    const legacy = `ml_auth=${await signToken(await sessionKey(SECRET, PASSWORD), `admin.${exp}`)}`;
    const r1 = await call('/api/auth/me', { headers: { cookie: legacy } });
    expect(await r1.json()).toMatchObject({ loggedIn: true, role: 'owner' });
    expect(r1.headers.get('set-cookie')).toMatch(/ml_auth=s\./);
    await call('/api/auth/me', { headers: { cookie: legacy } });
    const rows = await db.prepare("SELECT COUNT(*) AS n FROM auth_sessions WHERE id LIKE 'legacy%'").first<{ n: number }>();
    expect(rows?.n).toBe(1);
    const sessions: any[] = await (await owner('/api/auth/sessions')).json();
    expect(sessions.filter((s) => s.current).length).toBe(1);
    expect(sessions.length).toBe(2);
    // « Déconnecter les autres appareils »: the legacy cookie dies, the current session keeps working.
    expect((await owner('/api/auth/sessions/revoke-others', { method: 'POST' })).status).toBe(200);
    expect(await (await call('/api/auth/me', { headers: { cookie: legacy } })).json()).toEqual({ loggedIn: false });
    expect(await (await call('/api/auth/me', { headers: { cookie: cookieOf(r1) } })).json()).toEqual({ loggedIn: false });
    expect(await (await owner('/api/auth/me')).json()).toMatchObject({ loggedIn: true, role: 'owner' });
  });

  it('logout revokes the session server-side', async () => {
    const r = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.1.0.7' }, body: JSON.stringify({ password: PASSWORD }) });
    const c = cookieOf(r);
    await as(c)('/api/auth/logout', { method: 'POST' });
    expect(await (await call('/api/auth/me', { headers: { cookie: c } })).json()).toEqual({ loggedIn: false });
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/worker/index';
import { SITE_DATA_TABLES } from '../src/worker/site-data';
import { scanSiteMilestones, milestoneCopy, NOTIFY_WINDOW_MS, xIntentUrl } from '../src/worker/milestones';
import { renderMilestonePng } from '../src/worker/milestone-og';
import { makeDb, type PgliteD1 } from './helpers/pglite-d1';
import type { Site } from '../src/worker/env';

const ORIGIN = 'https://minilytics-six.vercel.app';
const PASSWORD = 'correct horse battery staple';
const SITE: Site = {
  id: 'site_ms',
  name: 'n0.pub',
  domain: 'n0.pub',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  api_key: 'ml_' + 'm'.repeat(32),
  dodo_webhook_secret: null,
  created_at: 0,
};

let db: PgliteD1;
const env = () => ({ DB: db, ADMIN_PASSWORD: PASSWORD, SESSION_SECRET: 'test-secret', ASSETS: { fetch: () => new Response('') } });
const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(ORIGIN + path, init), env() as any);

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 16, 12, 0, 0); // 16 nov. 2026 noon UTC

beforeAll(async () => {
  db = await makeDb();
  await db.prepare('INSERT INTO sites (id, name, domain, timezone, currency, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
    SITE.id, SITE.name, SITE.domain, SITE.timezone, SITE.currency, SITE.api_key, now - 200 * DAY,
  ).run();
  const session = async (i: number, started: number) => {
    const vid = `visitor_${String(i).padStart(4, '0')}`;
    const sid = `session_${String(i).padStart(4, '0')}`;
    await db.prepare('INSERT INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(SITE.id, vid, started).run();
    await db.prepare(
      `INSERT INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, duration, pageviews, goals, source, channel)
       VALUES (?, ?, ?, ?, ?, 60, 1, 0, 'Direct/None', 'Direct')`,
    ).bind(SITE.id, sid, vid, started, started + 60_000).run();
  };
  // 150 visitors: 100th is old, later ones recent enough only for the last few? 150 < 500 so only 100.
  // Make the 100th visitor 60 days ago (no notify), and add 50 more over last 2 months.
  for (let i = 0; i < 100; i++) await session(i, now - 80 * DAY + i * 3600_000);
  // A strong day 10 days ago (best day) — 30 extra visitors same day
  const best = now - 10 * DAY;
  for (let i = 100; i < 130; i++) await session(i, best + (i - 100) * 60_000);
  // Current month additional visitors (record vs the old month)
  for (let i = 130; i < 160; i++) await session(i, now - 2 * DAY + (i - 130) * 60_000);
  // Revenue: first payment long ago, then cross 100 € recently
  await db.prepare(
    `INSERT INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id) VALUES (?, ?, 'dodo', ?, ?, 'payment', 'EUR', 'visitor_0000')`,
  ).bind('pay_first', SITE.id, now - 70 * DAY, 2900).run();
  await db.prepare(
    `INSERT INTO payments (id, site_id, provider, ts, amount, kind, currency, visitor_id) VALUES (?, ?, 'dodo', ?, ?, 'payment', 'EUR', 'visitor_0100')`,
  ).bind('pay_100', SITE.id, now - 1 * DAY, 8000).run();
}, 60_000);

async function login() {
  const r = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.8.1.2' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  expect(r.status).toBe(200);
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}

describe('milestone detection', () => {
  it('includes the milestones table in site deletion', () => {
    expect(SITE_DATA_TABLES).toEqual(expect.arrayContaining(['milestones']));
  });

  it('detects visitor, month, best-day and revenue thresholds and dedupes', async () => {
    const first = await scanSiteMilestones(db as unknown as D1Database, SITE, now, ORIGIN);
    expect(first.inserted).toBeGreaterThanOrEqual(4);
    const second = await scanSiteMilestones(db as unknown as D1Database, SITE, now, ORIGIN);
    expect(second.inserted).toBe(0);

    const rows = (await db.prepare('SELECT kind, threshold, value, notified_at FROM milestones WHERE site_id = ? ORDER BY kind, threshold').bind(SITE.id).all() as { results: { kind: string; threshold: string; value: number; notified_at: number | null }[] }).results;
    const keys = rows.map((r) => `${r.kind}:${r.threshold}`);
    expect(keys).toContain('visitors_total:100');
    expect(keys.some((k) => k.startsWith('visitors_month_record:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('best_day:'))).toBe(true);
    expect(keys).toContain('revenue:first');
    expect(keys).toContain('revenue:10000');

    const total100 = rows.find((r) => r.kind === 'visitors_total' && r.threshold === '100');
    expect(total100?.notified_at).toBeTruthy();
    expect(now - Number(total100!.notified_at)).toBeLessThan(NOTIFY_WINDOW_MS * 2); // marked at scan time, not a live ping
    const notifs = (await db.prepare("SELECT title, dedupe FROM notifications WHERE site_id = ? AND kind = 'milestone'").bind(SITE.id).all() as { results: { title: string; dedupe: string }[] }).results;
    // Historical caps (100 visiteurs, premiers revenus) are stored already-notified. Revenue is not notified until the owner opts in.
    expect(notifs.every((n) => !n.dedupe.includes('visitors_total:100'))).toBe(true);
    expect(notifs.every((n) => !n.dedupe.includes('revenue:'))).toBe(true);
  });

  it('hides revenue on public routes until the owner opts in, then exposes it', async () => {
    const cookie = await login();
    const list = await call(`/api/sites/${SITE.id}/milestones`, { headers: { cookie, origin: ORIGIN } });
    expect(list.status).toBe(200);
    const body = await list.json<{ items: { kind: string; token: string; title: string }[]; shareRevenue: boolean }>();
    expect(body.shareRevenue).toBe(false);
    expect(body.items.some((i) => i.kind === 'revenue')).toBe(false);
    const visitors = body.items.find((i) => i.kind === 'visitors_total');
    expect(visitors).toBeTruthy();

    const first = (await db.prepare("SELECT share_token FROM milestones WHERE site_id = ? AND kind = 'revenue' AND threshold = 'first'").bind(SITE.id).first<{ share_token: string }>())!;
    expect((await call(`/api/public/milestone/${first.share_token}`)).status).toBe(404);
    expect((await call(`/m/${first.share_token}`)).status).toBe(404);

    const patch = await call(`/api/sites/${SITE.id}/settings`, {
      method: 'PATCH',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ milestones: { shareRevenue: true } }),
    });
    expect(patch.status).toBe(200);
    const opened = await call(`/api/public/milestone/${first.share_token}`);
    expect(opened.status).toBe(200);
    const pub = await opened.json<{ title: string; intentUrl: string }>();
    expect(pub.title).toBe('Premiers revenus');
    expect(pub.intentUrl.startsWith('https://x.com/intent/post?')).toBe(true);
    expect(pub.intentUrl).not.toMatch(/auto.?post/i);

    const listed = await (await call(`/api/sites/${SITE.id}/milestones`, { headers: { cookie, origin: ORIGIN } })).json<{ items: { kind: string }[] }>();
    expect(listed.items.some((i) => i.kind === 'revenue')).toBe(true);
  });

  it('serves OG PNGs and twitter:card summary_large_image on the share page', async () => {
    const row = await db.prepare("SELECT share_token FROM milestones WHERE site_id = ? AND kind = 'visitors_total' AND threshold = '100'").bind(SITE.id).first<{ share_token: string }>();
    expect(row).toBeTruthy();
    const token = row!.share_token;
    const png = await call(`/api/public/milestone/${token}/og.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    const buf = new Uint8Array(await png.arrayBuffer());
    expect([...buf.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const square = await call(`/api/public/milestone/${token}/og.png?size=square&theme=light`);
    expect(square.status).toBe(200);
    const html = await call(`/m/${token}`);
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain('name="twitter:card" content="summary_large_image"');
    expect(text).toContain('property="og:image"');
    expect(text).toContain(`api/public/milestone/${token}/og.png`);
    expect(text).toContain('property="og:image:height" content="675"');
  });
});

describe('milestone card copy and rendering', () => {
  it('formats French labels and an X intent URL without auto-posting', () => {
    const copy = milestoneCopy({ kind: 'visitors_total', threshold: '1000', value: 1000, reached_at: now, currency: null });
    expect(copy.title).toBe('1 000 visiteurs');
    expect(copy.intent('n0.pub')).toContain('1 000 visiteurs');
    const url = xIntentUrl(copy.intent('n0.pub'), 'https://minilytics-six.vercel.app/m/mabc');
    expect(url).toMatch(/^https:\/\/x\.com\/intent\/post\?/);
    expect(url).toContain('url=');
    expect(url).toContain('text=');
  });

  it('writes preview PNGs for visual review', async () => {
    const dir = '/workspace/minilytics-shots/milestones';
    mkdirSync(dir, { recursive: true });
    const samples = [
      { name: 'visitors-1000-wide-dark', size: 'wide' as const, theme: 'dark' as const, number: '1 000', unit: 'visiteurs', kicker: 'Jalon', headline: '1 000 visiteurs' },
      { name: 'visitors-1000-wide-light', size: 'wide' as const, theme: 'light' as const, number: '1 000', unit: 'visiteurs', kicker: 'Jalon', headline: '1 000 visiteurs' },
      { name: 'visitors-1000-square-dark', size: 'square' as const, theme: 'dark' as const, number: '1 000', unit: 'visiteurs', kicker: 'Jalon', headline: '1 000 visiteurs' },
      { name: 'record-month-wide-dark', size: 'wide' as const, theme: 'dark' as const, number: '12 345', unit: 'visiteurs en octobre 2026', kicker: 'Record mensuel', headline: 'Record mensuel' },
      { name: 'revenue-100-wide-dark', size: 'wide' as const, theme: 'dark' as const, number: '100 €', unit: 'de revenus', kicker: 'Revenus', headline: '100 € de revenus' },
    ];
    for (const s of samples) {
      const png = await renderMilestonePng({
        kicker: s.kicker,
        headline: s.headline,
        number: s.number,
        unit: s.unit,
        date: '16 novembre 2026',
        siteName: 'n0.pub',
        domain: 'n0.pub',
        theme: s.theme,
        size: s.size,
      });
      expect(png[0]).toBe(0x89);
      writeFileSync(`${dir}/${s.name}.png`, png);
    }
  });
});

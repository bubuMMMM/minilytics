import { describe, expect, it } from 'vitest';
import { buildVisitorJourney, paymentSessionId, sourceLabel, stepsForSession, utmParts, type ProfileSession } from '../src/dashboard/lib/visitorJourney';

const session = (over: Partial<ProfileSession> & { id: string; started_at: number }): ProfileSession => ({
  last_seen_at: over.last_seen_at ?? over.started_at + 60_000,
  duration: over.duration ?? 60_000,
  pageviews: over.pageviews ?? 1,
  source: over.source ?? 'Google',
  channel: over.channel ?? 'Organic Search',
  referrer: over.referrer ?? 'google.com',
  referrer_domain: over.referrer_domain ?? 'google.com',
  utm_source: over.utm_source ?? null,
  utm_medium: over.utm_medium ?? null,
  utm_campaign: over.utm_campaign ?? null,
  utm_term: over.utm_term ?? null,
  utm_content: over.utm_content ?? null,
  ref: over.ref ?? null,
  country: over.country ?? 'FR',
  city: over.city ?? 'Paris',
  device: over.device ?? 'Desktop',
  os: over.os ?? 'macOS',
  browser: over.browser ?? 'Safari',
  entry_page: over.entry_page ?? '/',
  exit_page: over.exit_page ?? '/',
  ...over,
});

describe('visitor journey', () => {
  it('labels direct traffic clearly', () => {
    expect(sourceLabel(null)).toBe('Accès direct');
    expect(sourceLabel('Direct')).toBe('Accès direct');
    expect(sourceLabel('Google')).toBe('Google');
  });

  it('computes time on each page from the next pageview, then last_seen', () => {
    const s = session({ id: 's1', started_at: 1_000, last_seen_at: 10_000, exit_page: '/merci' });
    const steps = stepsForSession(s, [
      { session_id: 's1', ts: 1_000, type: 'pageview', name: null, path: '/', props: null },
      { session_id: 's1', ts: 4_000, type: 'goal', name: 'signup', path: '/inscription', props: null },
      { session_id: 's1', ts: 5_000, type: 'pageview', name: null, path: '/merci', props: null },
    ], []);
    expect(steps.filter((x) => x.type === 'pageview').map((x) => [x.path, x.duration, x.exit])).toEqual([
      ['/', 4_000, undefined],
      ['/merci', 5_000, true],
    ]);
    expect(steps.find((x) => x.type === 'goal')?.name).toBe('signup');
  });

  it('inserts payments in chronological order with amount', () => {
    const s = session({ id: 's1', started_at: 1_000, last_seen_at: 9_000 });
    const steps = stepsForSession(s, [
      { session_id: 's1', ts: 1_000, type: 'pageview', name: null, path: '/tarifs', props: null },
    ], [{ id: 'p1', ts: 3_000, amount: 2400, kind: 'payment' }]);
    expect(steps.map((x) => x.type)).toEqual(['pageview', 'payment']);
    expect(steps[1].amount).toBe(2400);
  });

  it('prefers payment.session_id when attributing a payment', () => {
    const a = session({ id: 'a', started_at: 1_000, last_seen_at: 8_000 });
    const b = session({ id: 'b', started_at: 2_000, last_seen_at: 9_000 });
    expect(paymentSessionId({ id: 'p', ts: 5_000, amount: 1, kind: 'payment', session_id: 'b' }, [a, b])).toBe('b');
  });

  it('builds a summary from first-touch, totals and refunds, newest session first', () => {
    const journey = buildVisitorJourney(
      [
        session({ id: 's2', started_at: 20_000, last_seen_at: 25_000, duration: 5_000, pageviews: 2, source: 'X' }),
        session({
          id: 's1', started_at: 1_000, last_seen_at: 4_000, duration: 3_000, pageviews: 1,
          source: 'Google', utm_campaign: 'printemps', referrer: 'google.com',
        }),
      ],
      [
        { session_id: 's1', ts: 1_000, type: 'pageview', name: null, path: '/', props: null },
        { session_id: 's2', ts: 20_000, type: 'pageview', name: null, path: '/blog', props: null },
        { session_id: 's2', ts: 22_000, type: 'goal', name: 'signup', path: '/blog', props: null },
      ],
      [
        { id: 'pay', ts: 23_000, amount: 1900, kind: 'payment', session_id: 's2' },
        { id: 'ref', ts: 24_000, amount: 400, kind: 'refund', session_id: 's2' },
      ],
      { id: 'v1', first_seen: 1_000, name: null, email: null, user_id: null },
      'Europe/Paris',
    );
    expect(journey.firstTouch?.id).toBe('s1');
    expect(utmParts(journey.firstTouch!).map((p) => p.value)).toContain('printemps');
    expect(journey.visits).toBe(2);
    expect(journey.pageviews).toBe(3);
    expect(journey.totalTime).toBe(8_000);
    expect(journey.revenue).toBe(1500);
    expect(journey.sessions.map((s) => s.session.id)).toEqual(['s2', 's1']);
    expect(journey.sessions[0].steps.some((s) => s.type === 'payment' && s.kind === 'refund')).toBe(true);
    expect(journey.firstSeen).toBe(1_000);
    expect(journey.lastSeen).toBe(25_000);
  });

  it('falls back to entry and exit pages when a session has no events', () => {
    const s = session({ id: 's1', started_at: 1_000, last_seen_at: 5_000, entry_page: '/a', exit_page: '/b' });
    const steps = stepsForSession(s, [], []);
    expect(steps.map((x) => x.path)).toEqual(['/a', '/b']);
    expect(steps[1].exit).toBe(true);
  });
});

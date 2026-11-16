/** Pure helpers for the visitor profile journey. Uses only the existing profile API payload. */

export interface ProfileVisitor {
  id: string;
  first_seen: number;
  name: string | null;
  email: string | null;
  user_id: string | null;
}

export interface ProfileSession {
  id: string;
  started_at: number;
  last_seen_at: number;
  duration: number;
  pageviews: number;
  source: string | null;
  channel: string | null;
  referrer: string | null;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  ref: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  entry_page: string | null;
  exit_page: string | null;
  goals?: number;
}

export interface ProfileEvent {
  session_id: string;
  ts: number;
  type: string;
  name: string | null;
  path: string | null;
  props: string | null;
}

export interface ProfilePayment {
  id: string;
  ts: number;
  amount: number;
  kind: string;
  renewal?: boolean | number | null;
  session_id?: string | null;
}

export type JourneyStepType = 'pageview' | 'goal' | 'outbound' | 'form' | 'video' | 'payment' | 'event';

export interface JourneyStep {
  t: number;
  type: JourneyStepType;
  path: string | null;
  name: string | null;
  duration: number | null;
  amount?: number;
  kind?: string;
  renewal?: boolean;
  exit?: boolean;
}

export interface SessionJourney {
  session: ProfileSession;
  steps: JourneyStep[];
  payments: ProfilePayment[];
}

export interface VisitorJourney {
  firstTouch: ProfileSession | null;
  firstSeen: number | null;
  lastSeen: number | null;
  visits: number;
  pageviews: number;
  totalTime: number;
  revenue: number;
  sessions: SessionJourney[];
  goalDays: Set<string>;
}

function num(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function sourceLabel(source: string | null | undefined) {
  if (!source || source === 'Direct/None' || source === 'Direct') return 'Accès direct';
  return source;
}

export function asSession(row: Record<string, unknown> | ProfileSession): ProfileSession {
  const r = row as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' && r[k] ? (r[k] as string) : null);
  return {
    id: String(r.id ?? ''),
    started_at: num(r.started_at),
    last_seen_at: num(r.last_seen_at),
    duration: num(r.duration),
    pageviews: num(r.pageviews),
    source: str('source'),
    channel: str('channel'),
    referrer: str('referrer'),
    referrer_domain: str('referrer_domain'),
    utm_source: str('utm_source'),
    utm_medium: str('utm_medium'),
    utm_campaign: str('utm_campaign'),
    utm_term: str('utm_term'),
    utm_content: str('utm_content'),
    ref: str('ref'),
    country: str('country'),
    city: str('city'),
    device: str('device'),
    os: str('os'),
    browser: str('browser'),
    entry_page: str('entry_page'),
    exit_page: str('exit_page'),
    goals: num(r.goals),
  };
}

export function asEvent(row: Record<string, unknown> | ProfileEvent): ProfileEvent {
  const r = row as Record<string, unknown>;
  return {
    session_id: String(r.session_id ?? ''),
    ts: num(r.ts),
    type: String(r.type ?? 'event'),
    name: typeof r.name === 'string' && r.name ? r.name : null,
    path: typeof r.path === 'string' && r.path ? r.path : null,
    props: typeof r.props === 'string' && r.props ? r.props : null,
  };
}

export function asPayment(row: Record<string, unknown> | ProfilePayment): ProfilePayment {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    ts: num(r.ts),
    amount: num(r.amount),
    kind: String(r.kind ?? 'payment'),
    renewal: r.renewal === true || r.renewal === 1,
    session_id: typeof r.session_id === 'string' && r.session_id ? r.session_id : null,
  };
}

const KNOWN: Record<string, JourneyStepType> = {
  pageview: 'pageview',
  goal: 'goal',
  outbound: 'outbound',
  form: 'form',
  video: 'video',
  payment: 'payment',
};

function eventType(type: string): JourneyStepType {
  return KNOWN[type] ?? 'event';
}

/** Attribute a payment to a session by id, else by a 30 min window after last_seen. */
export function paymentSessionId(payment: ProfilePayment, sessions: ProfileSession[]): string | null {
  if (payment.session_id && sessions.some((s) => s.id === payment.session_id)) return payment.session_id;
  const hits = sessions.filter((s) => payment.ts >= s.started_at && payment.ts <= s.last_seen_at + 30 * 60_000);
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) return hits.sort((a, b) => Math.abs(payment.ts - a.last_seen_at) - Math.abs(payment.ts - b.last_seen_at))[0].id;
  return null;
}

export function stepsForSession(session: ProfileSession, events: ProfileEvent[], payments: ProfilePayment[]): JourneyStep[] {
  const evs = events.filter((e) => e.session_id === session.id).sort((a, b) => a.ts - b.ts || a.type.localeCompare(b.type));
  const steps: JourneyStep[] = evs.map((e) => ({
    t: e.ts,
    type: eventType(e.type),
    path: e.path,
    name: e.name,
    duration: null,
  }));
  if (steps.length === 0 && session.entry_page) {
    steps.push({ t: session.started_at, type: 'pageview', path: session.entry_page, name: null, duration: null });
    if (session.exit_page && session.exit_page !== session.entry_page) {
      steps.push({ t: session.last_seen_at, type: 'pageview', path: session.exit_page, name: null, duration: null });
    }
  }
  for (const p of payments) {
    steps.push({
      t: p.ts,
      type: 'payment',
      path: null,
      name: p.kind === 'refund' ? 'Remboursement' : p.renewal ? 'Renouvellement' : 'Paiement',
      duration: null,
      amount: p.amount,
      kind: p.kind,
      renewal: !!p.renewal,
    });
  }
  steps.sort((a, b) => a.t - b.t);

  const pageIdx = steps.map((s, i) => (s.type === 'pageview' ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < pageIdx.length; k++) {
    const i = pageIdx[k];
    const nextT = k + 1 < pageIdx.length ? steps[pageIdx[k + 1]].t : session.last_seen_at || steps[i].t;
    const d = nextT - steps[i].t;
    steps[i].duration = d >= 0 ? d : 0;
  }

  const lastPage = [...steps].reverse().find((s) => s.type === 'pageview');
  if (lastPage) lastPage.exit = true;

  return steps;
}

export function utmParts(session: ProfileSession): { key: string; value: string }[] {
  const parts: { key: string; value: string }[] = [];
  if (session.utm_source) parts.push({ key: 'utm_source', value: session.utm_source });
  if (session.utm_medium) parts.push({ key: 'utm_medium', value: session.utm_medium });
  if (session.utm_campaign) parts.push({ key: 'campagne', value: session.utm_campaign });
  if (session.utm_term) parts.push({ key: 'terme', value: session.utm_term });
  if (session.utm_content) parts.push({ key: 'contenu', value: session.utm_content });
  if (session.ref) parts.push({ key: 'réf', value: session.ref });
  return parts;
}

export function dayKey(ts: number, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
}

export function buildVisitorJourney(
  sessionsRaw: Array<Record<string, unknown> | ProfileSession>,
  eventsRaw: Array<Record<string, unknown> | ProfileEvent>,
  paymentsRaw: Array<Record<string, unknown> | ProfilePayment>,
  visitor: ProfileVisitor | null,
  tz: string,
): VisitorJourney {
  const sessions = sessionsRaw.map(asSession).filter((s) => s.id).sort((a, b) => b.started_at - a.started_at);
  const events = eventsRaw.map(asEvent);
  const payments = paymentsRaw.map(asPayment).sort((a, b) => b.ts - a.ts);
  const firstTouch = sessions.length ? sessions[sessions.length - 1] : null;
  const assigned = new Map<string, ProfilePayment[]>();
  for (const p of payments) {
    const sid = paymentSessionId(p, sessions);
    if (!sid) continue;
    if (!assigned.has(sid)) assigned.set(sid, []);
    assigned.get(sid)!.push(p);
  }
  const journeys: SessionJourney[] = sessions.map((session) => {
    const pays = assigned.get(session.id) ?? [];
    return { session, steps: stepsForSession(session, events, pays), payments: pays };
  });
  const goalDays = new Set<string>();
  for (const j of journeys) {
    for (const s of j.steps) {
      if (s.type === 'goal' || s.type === 'payment') goalDays.add(dayKey(s.t, tz));
    }
  }
  const firstSeen = visitor?.first_seen || firstTouch?.started_at || null;
  const lastSeen = sessions[0]?.last_seen_at || visitor?.first_seen || null;
  return {
    firstTouch,
    firstSeen,
    lastSeen,
    visits: sessions.length,
    pageviews: sessions.reduce((a, s) => a + s.pageviews, 0),
    totalTime: sessions.reduce((a, s) => a + s.duration, 0),
    revenue: payments.reduce((a, p) => a + (p.kind === 'refund' ? -Math.abs(p.amount) : p.amount), 0),
    sessions: journeys,
    goalDays,
  };
}

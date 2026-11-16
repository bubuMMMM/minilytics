import { useEffect, useMemo, useState } from 'react';
import { channelName, countryName, dayInTz, fmtAgo, fmtDateTime, fmtDuration, fmtMoney, shortId } from '../lib/format';
import { useApi } from '../lib/useApi';
import {
  buildVisitorJourney,
  sourceLabel,
  utmParts,
  type JourneyStep,
  type ProfileSession,
  type SessionJourney,
  type VisitorJourney,
} from '../lib/visitorJourney';
import { Avatar, BrowserIcon, DeviceIcon, Flag, OSIcon, SourceIcon } from './Icons';
import { UiIcon } from './UiIcon';

export interface VisitorProfileData {
  visitor: { id: string; first_seen: number; name: string | null; email: string | null; user_id: string | null } | null;
  sessions: Record<string, unknown>[];
  events: { session_id: string; ts: number; type: string; name: string | null; path: string; props: string | null }[];
  payments: Record<string, unknown>[];
  currency?: string;
  decimals?: number;
}

export function VisitorProfile({
  visitorId, siteId, tz, money, highlightSessionId,
}: {
  visitorId: string;
  siteId: string;
  tz: string;
  money?: (minor: number, compact?: boolean) => string;
  highlightSessionId?: string;
}) {
  const { data: p, error, loading } = useApi<VisitorProfileData>(`/api/sites/${siteId}/visitors/${visitorId}`);
  const format = money ?? ((minor: number, compact?: boolean) => fmtMoney(minor, p?.currency ?? 'EUR', p?.decimals ?? 2, compact));
  const journey = useMemo(
    () => (p ? buildVisitorJourney(p.sessions, p.events, p.payments, p.visitor, tz) : null),
    [p, tz],
  );

  if (error) return <p className="text-[13px] text-danger" role="alert">{error}</p>;
  if (!p || !journey) return <ProfileSkeleton loading={loading} />;
  if (journey.visits === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-well/60 px-4 py-10 text-center">
        <p className="text-[14px] font-medium text-ink">Aucune visite enregistrée</p>
        <p className="mt-1 text-[13px] text-ink-3">Dès qu’une session sera collectée pour ce visiteur, son parcours apparaîtra ici.</p>
      </div>
    );
  }

  const last = journey.sessions[0]?.session;
  const title = p.visitor?.name || p.visitor?.email || `Visiteur ${shortId(visitorId)}`;

  return (
    <div>
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Avatar id={visitorId} size={64} name={p.visitor?.name} email={p.visitor?.email} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-semibold tracking-tight">{title}</div>
          {p.visitor?.email && p.visitor.name && <div className="truncate text-sm text-ink-3">{p.visitor.email}</div>}
          {last && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
              <span className="flex items-center gap-1">
                <Flag cc={last.country} size={15} /> {last.city ? `${last.city}, ` : ''}{countryName(last.country)}
              </span>
              {last.device && <span className="flex items-center gap-1"><DeviceIcon name={last.device} size={15} /> {last.device}</span>}
              {last.os && <span className="flex items-center gap-1"><OSIcon name={last.os} size={15} /> {last.os}</span>}
              {last.browser && <span className="flex items-center gap-1"><BrowserIcon name={last.browser} size={15} /> {last.browser}</span>}
            </div>
          )}
        </div>
      </div>

      <SummaryHeader journey={journey} tz={tz} format={format} />
      <FirstTouch session={journey.firstTouch} tz={tz} />
      <ActivityGrid journey={journey} tz={tz} />
      <SessionTimeline journey={journey} tz={tz} format={format} highlightSessionId={highlightSessionId} />
    </div>
  );
}

function fmtLong(ts: number, tz: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz, dateStyle: 'medium', timeStyle: 'short',
  }).format(ts);
}

function SummaryHeader({
  journey, tz, format,
}: {
  journey: VisitorJourney;
  tz: string;
  format: (minor: number, compact?: boolean) => string;
}) {
  const first = journey.firstTouch;
  const acquire = first
    ? [sourceLabel(first.source), first.channel && first.channel !== first.source ? channelName(first.channel) : null]
        .filter(Boolean).join(' · ')
    : '—';
  const items = [
    { label: 'Première visite', value: journey.firstSeen ? fmtLong(journey.firstSeen, tz) : '—', title: journey.firstSeen ? `il y a ${fmtAgo(Date.now() - journey.firstSeen)}` : undefined },
    { label: 'Dernière visite', value: journey.lastSeen ? fmtLong(journey.lastSeen, tz) : '—', title: journey.lastSeen ? `il y a ${fmtAgo(Date.now() - journey.lastSeen)}` : undefined },
    { label: 'Visites', value: String(journey.visits) },
    { label: 'Pages vues', value: String(journey.pageviews) },
    { label: 'Temps total', value: journey.totalTime ? fmtDuration(journey.totalTime) : '—' },
    { label: 'Revenu', value: format(journey.revenue), accent: journey.revenue > 0 },
    { label: 'Canal d’acquisition', value: acquire, wide: true },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl bg-well px-3 py-3 sm:px-4 ${item.wide ? 'col-span-2 sm:col-span-4' : ''}`} title={item.title}>
          <div className="text-[11px] text-ink-3 sm:text-xs">{item.label}</div>
          <div className={`mt-0.5 truncate text-[13px] font-semibold sm:text-[15px] ${item.accent ? 'text-revenue' : ''}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function FirstTouch({ session, tz }: { session: ProfileSession | null; tz: string }) {
  if (!session) return null;
  const utm = utmParts(session);
  const src = sourceLabel(session.source);
  return (
    <section className="mt-5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <h3 className="text-[12px] font-medium text-ink-3">Premier contact</h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink">
          <SourceIcon source={session.source} domain={session.referrer_domain ?? session.referrer} size={15} />
          <span className="truncate">{src}</span>
        </span>
        {session.channel && <span className="text-ink-3">{channelName(session.channel)}</span>}
        {session.referrer && <span className="min-w-0 max-w-full truncate text-ink-3" title={session.referrer}>{session.referrer}</span>}
        <span className="text-ink-4">{fmtDateTime(session.started_at, tz)}</span>
      </div>
      {utm.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {utm.map((u) => (
            <li key={u.key} className="rounded-md bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
              {u.key} : {u.value}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityGrid({ journey, tz }: { journey: VisitorJourney; tz: string }) {
  const WEEKS = 26;
  const per = new Map<string, number>();
  for (const j of journey.sessions) {
    const key = dayInTz(j.session.started_at, tz);
    per.set(key, (per.get(key) ?? 0) + Math.max(1, j.session.pageviews || 1));
  }
  const today = new Date(dayInTz(Date.now(), tz) + 'T00:00:00Z');
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - ((today.getUTCDay() + 6) % 7)));
  const cells: { key: string; n: number; future: boolean; goal: boolean }[] = [];
  for (let i = WEEKS * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, n: per.get(key) ?? 0, future: d > today, goal: journey.goalDays.has(key) });
  }
  const max = Math.max(1, ...cells.map((c) => c.n));
  const active = cells.filter((c) => c.n > 0).length;
  const level = (n: number) => (n === 0 ? 'bg-well' : n / max > 0.66 ? 'bg-accent' : n / max > 0.33 ? 'bg-accent/60' : 'bg-accent/30');
  const jump = (key: string) => {
    const el = document.getElementById(`ml-day-${key}`);
    if (el) {
      el.setAttribute('open', '');
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  };
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
        <span className="font-medium text-ink-2">Activité sur 6 mois</span>
        <span className="text-ink-4">{active} jour{active > 1 ? 's' : ''} actif{active > 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`Activité : ${active} jours avec au moins une visite sur les 26 dernières semaines`}>
          {cells.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={c.future || c.n === 0}
              onClick={() => jump(c.key)}
              title={c.future ? undefined : `${c.key} : ${c.n} page${c.n > 1 ? 's' : ''}${c.goal ? ' · objectif ou paiement' : ''}`}
              className={`h-[11px] w-[11px] shrink-0 appearance-none rounded-[3px] border-0 p-0 ${c.future ? 'opacity-0' : c.goal ? 'bg-warning' : level(c.n)} disabled:cursor-default`}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-4">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" aria-hidden />Visites</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[2px] bg-warning" aria-hidden />Objectif ou paiement</span>
      </div>
    </div>
  );
}

function SessionTimeline({
  journey, tz, format, highlightSessionId,
}: {
  journey: VisitorJourney;
  tz: string;
  format: (minor: number, compact?: boolean) => string;
  highlightSessionId?: string;
}) {
  const defaultOpen = useMemo(() => {
    const ids = new Set<string>();
    if (highlightSessionId) ids.add(highlightSessionId);
    if (journey.sessions[0]) ids.add(journey.sessions[0].session.id);
    return ids;
  }, [highlightSessionId, journey.sessions]);
  const [open, setOpen] = useState<Set<string>>(defaultOpen);
  const [mode, setMode] = useState<'auto' | 'all' | 'none'>('auto');
  useEffect(() => { setOpen(new Set(defaultOpen)); setMode('auto'); }, [defaultOpen]);
  useEffect(() => {
    if (!highlightSessionId) return;
    const el = document.getElementById(`ml-session-${highlightSessionId}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightSessionId]);

  const isOpen = (id: string) => (mode === 'all' ? true : mode === 'none' ? false : open.has(id));
  const toggle = (id: string) => {
    setMode('auto');
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">Parcours</h3>
        <div className="flex gap-1">
          <button type="button" className="btn h-8 px-2.5 text-[12px]" onClick={() => setMode('all')}>Tout ouvrir</button>
          <button type="button" className="btn h-8 px-2.5 text-[12px]" onClick={() => setMode('none')}>Tout fermer</button>
        </div>
      </div>
      <div className="space-y-3">
        {journey.sessions.map((block, i) => {
          const day = dayInTz(block.session.started_at, tz);
          const firstOfDay = i === 0 || dayInTz(journey.sessions[i - 1].session.started_at, tz) !== day;
          return (
            <div key={block.session.id} id={firstOfDay ? `ml-day-${day}` : undefined}>
              <SessionBlock
                block={block}
                tz={tz}
                format={format}
                current={highlightSessionId === block.session.id}
                open={isOpen(block.session.id)}
                onToggle={() => toggle(block.session.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionBlock({
  block, tz, format, current, open, onToggle,
}: {
  block: SessionJourney;
  tz: string;
  format: (minor: number, compact?: boolean) => string;
  current: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const s = block.session;
  const src = sourceLabel(s.source);
  const utm = utmParts(s);
  const place = [s.city, s.country ? countryName(s.country) : null].filter(Boolean).join(', ');
  const panelId = `ml-session-panel-${s.id}`;
  return (
    <article id={`ml-session-${s.id}`} className={`rounded-xl border ${current ? 'border-accent bg-accent/5' : 'border-line bg-surface'}`}>
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left sm:px-4"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={`mt-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${current ? 'border-accent text-accent' : 'border-line text-ink-3'}`}>
          <UiIcon name="chevron-down" size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
            <span className="font-semibold text-ink">{fmtLong(s.started_at, tz)}</span>
            {current && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Cette visite</span>}
            <span className="tnum text-ink-3">{fmtDuration(s.duration)}</span>
            <span className="tnum text-ink-4">{s.pageviews} page{s.pageviews > 1 ? 's' : ''}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <SourceIcon source={s.source} domain={s.referrer_domain ?? s.referrer} size={14} />
              <span className="truncate">{src}</span>
            </span>
            {place && <span className="inline-flex items-center gap-1"><Flag cc={s.country} size={13} /> {place}</span>}
            {s.device && <span className="inline-flex items-center gap-1"><DeviceIcon name={s.device} size={13} /> {[s.device, s.os, s.browser].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-3.5 pb-4 pt-3 sm:px-4">
          {(s.referrer || utm.length > 0 || s.entry_page || s.exit_page) && (
            <dl className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px] text-ink-2">
              {s.referrer && <><dt className="text-ink-4">Référent</dt><dd className="min-w-0 truncate">{s.referrer}</dd></>}
              {utm.map((u) => (
                <span key={u.key} className="contents">
                  <dt className="text-ink-4">{u.key}</dt>
                  <dd className="min-w-0 truncate">{u.value}</dd>
                </span>
              ))}
              {s.entry_page && <><dt className="text-ink-4">Entrée</dt><dd className="min-w-0 truncate font-mono text-[11px]">{s.entry_page}</dd></>}
              {s.exit_page && <><dt className="text-ink-4">Sortie</dt><dd className="min-w-0 truncate font-mono text-[11px]">{s.exit_page}</dd></>}
            </dl>
          )}
          {block.steps.length === 0 ? (
            <p className="text-[13px] text-ink-4">Le détail des pages n’est pas encore disponible pour cette visite.</p>
          ) : (
            <ol className="relative ml-1.5 border-l border-line">
              {block.steps.map((step, i) => (
                <StepRow key={`${step.t}-${step.type}-${i}`} step={step} tz={tz} format={format} last={i === block.steps.length - 1} />
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function stepLabel(step: JourneyStep) {
  if (step.type === 'pageview') return step.path || 'Page';
  if (step.type === 'goal') return step.name ? `Objectif · ${step.name}` : 'Objectif';
  if (step.type === 'outbound') return step.name ? `Lien sortant · ${step.name.replace(/^https?:\/\//, '')}` : 'Lien sortant';
  if (step.type === 'form') return step.name ? `Formulaire · ${step.name}` : 'Formulaire';
  if (step.type === 'video') return step.name ? `Vidéo · ${step.name}` : 'Vidéo';
  if (step.type === 'payment') return step.name || 'Paiement';
  return step.name || step.type;
}

function StepRow({
  step, tz, format, last,
}: {
  step: JourneyStep;
  tz: string;
  format: (minor: number, compact?: boolean) => string;
  last: boolean;
}) {
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(step.t);
  const mono = step.type === 'pageview';
  const color = step.type === 'payment'
    ? 'bg-revenue'
    : step.type === 'goal'
      ? 'bg-accent'
      : step.exit || last
        ? 'bg-success'
        : 'bg-line-strong';
  return (
    <li className="relative pb-3 pl-4 last:pb-0">
      <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${color}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`truncate text-[13px] ${mono ? 'font-mono text-[12px] text-ink' : 'font-medium text-ink'} ${step.type === 'payment' ? 'text-revenue' : step.type === 'goal' ? 'text-accent' : ''}`}>
            {stepLabel(step)}
            {step.type === 'payment' && step.amount != null && <span className="tnum"> · {format(step.amount)}</span>}
            {step.exit && step.type === 'pageview' && <span className="ml-1.5 font-sans text-[11px] font-medium text-ink-4">sortie</span>}
          </div>
          {step.type !== 'pageview' && step.path && <div className="truncate font-mono text-[11px] text-ink-4">{step.path}</div>}
        </div>
        <div className="tnum shrink-0 text-right text-[11px] text-ink-4">
          <div>{time}</div>
          {step.duration != null && step.duration >= 1000 && <div>{fmtDuration(step.duration)}</div>}
        </div>
      </div>
    </li>
  );
}

function ProfileSkeleton({ loading }: { loading?: boolean }) {
  return (
    <div aria-busy={loading || undefined} className="animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-well" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-40 rounded-md bg-well" />
          <div className="h-3.5 w-56 rounded-md bg-well" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 rounded-xl bg-well" />)}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 rounded-xl bg-well" />)}
      </div>
    </div>
  );
}

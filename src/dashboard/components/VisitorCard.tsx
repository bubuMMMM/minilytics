import { useEffect, useState } from 'react';
import { BrowserIcon, DeviceIcon, OSIcon, SourceIcon } from './Icons';
import { visitorPersona } from '../../shared/persona';
import { fmtAgo, fmtDuration, fmtMoney } from '../lib/format';
import { countryName, flag } from '../map/geo';
import type { Visit } from '../map/Replay';

const ACTIVE_MS = 5 * 60_000;

export function PersonaAvatar({ id, size = 40, className = '' }: { id: string; size?: number; className?: string }) {
  const p = visitorPersona(id);
  const style = {
    width: size, height: size, fontSize: Math.max(9, size * 0.36),
    background: `radial-gradient(circle at 30% 25%, hsl(${p.hue2} 85% 72%) 0, transparent 55%), linear-gradient(135deg, hsl(${p.hue} 70% 52%), hsl(${p.hue2} 75% 42%))`,
  };
  return (
    <span className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-tight text-white ${className}`} style={style} aria-hidden>
      <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,.25)]">{p.initials}</span>
    </span>
  );
}

function useTick(on: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

function sourceLabel(v: Visit) {
  if (!v.source || v.source === 'Direct/None' || v.source === 'Direct') return 'Accès direct';
  return v.source;
}

/** Elegant live-visitor card (DataFast-style): generated identity, no PII. */
export function VisitorCard({
  visit: v, tz, selected, onPick, leaving, entering, now: nowProp, compact = false,
}: {
  visit: Visit; tz: string; selected?: boolean; onPick?: (v: Visit) => void; leaving?: boolean; entering?: boolean;
  now?: number; compact?: boolean;
}) {
  const active = (nowProp ?? Date.now()) - v.lastSeen < ACTIVE_MS;
  const now = useTick(active && !leaving);
  const clock = nowProp ?? now;
  const persona = visitorPersona(v.visitorId);
  const place = [v.city, v.country ? countryName(v.country) : null].filter(Boolean).join(', ') || 'Lieu inconnu';
  const page = v.current || v.page;
  const arrived = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(v.t);
  const duration = Math.max(0, (active ? clock : v.lastSeen) - v.t);
  const src = sourceLabel(v);
  const className = [
    'ml-vcard w-full rounded-xl border text-left transition-colors duration-150',
    compact ? 'p-2.5' : 'p-3',
    selected ? 'border-accent bg-accent/5 shadow-xs' : 'border-line bg-surface hover:border-line-strong hover:bg-well/60',
    entering ? 'ml-card-in' : '',
    leaving ? 'ml-card-out' : '',
  ].join(' ');
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <PersonaAvatar id={v.visitorId} size={compact ? 36 : 44} />
          {v.country && <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface text-[15px] leading-none" aria-hidden>{flag(v.country)}</span>}
          {active && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" aria-label="En ligne" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-[13px] font-semibold text-ink">{persona.name}</div>
            <div className="tnum shrink-0 text-[11px] text-ink-4" title={new Date(v.t).toISOString()}>
              {active ? fmtDuration(duration) : `il y a ${fmtAgo(clock - v.lastSeen)}`}
            </div>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-3">{v.country && <span className="sr-only">{flag(v.country)} </span>}{place}</div>
        </div>
      </div>
      {!compact && (
        <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px] text-ink-2">
          <dt className="text-ink-4">Page</dt>
          <dd className="min-w-0 truncate font-mono text-[11px]">{page || '—'}</dd>
          <dt className="text-ink-4">Source</dt>
          <dd className="flex min-w-0 items-center gap-1.5"><SourceIcon source={v.source} domain={v.referrer} size={14} /><span className="truncate">{src}</span></dd>
          <dt className="text-ink-4">Appareil</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <DeviceIcon name={v.device} size={14} />
            <span className="truncate">{[v.device, v.os, v.browser].filter(Boolean).join(' · ') || '—'}</span>
            <OSIcon name={v.os} size={14} />
            <BrowserIcon name={v.browser} size={14} />
          </dd>
          <dt className="text-ink-4">Session</dt>
          <dd className="tnum">{v.pageviews} page{v.pageviews > 1 ? 's' : ''} · arrivé à {arrived}</dd>
        </dl>
      )}
      {compact && page && <div className="mt-1.5 truncate font-mono text-[11px] text-ink-3">{page}</div>}
      {((v.goals ?? 0) > 0 || (v.revenue ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(v.goals ?? 0) > 0 && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{(v.goals ?? 0) > 1 ? `${v.goals} objectifs` : 'Objectif'}</span>}
          {(v.revenue ?? 0) > 0 && v.currency && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{fmtMoney(v.revenue!, v.currency, 2)}</span>}
        </div>
      )}
      {v.identified && <div className="mt-1.5 text-[11px] text-ink-4">Visiteur identifié</div>}
    </>
  );
  if (!onPick) return <article className={className}>{inner}</article>;
  return (
    <button type="button" onClick={() => onPick(v)} className={className} aria-current={selected ? 'true' : undefined} aria-label={`${persona.name}, ${place}`}>
      {inner}
    </button>
  );
}

/** Tiny tooltip card shown when hovering a live marker on the map. */
export function VisitorMini({ visit: v, tz }: { visit: Visit; tz: string }) {
  const persona = visitorPersona(v.visitorId);
  const place = [v.city, v.country ? countryName(v.country) : null].filter(Boolean).join(', ') || 'Lieu inconnu';
  const arrived = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(v.t);
  return (
    <div className="flex max-w-[240px] items-center gap-2.5">
      <PersonaAvatar id={v.visitorId} size={32} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-ink">{persona.name}</div>
        <div className="truncate text-[12px] text-ink-3">{v.country && flag(v.country)} {place}</div>
        <div className="tnum text-[11px] text-ink-4">{v.current || v.page || '—'} · {arrived}</div>
      </div>
    </div>
  );
}

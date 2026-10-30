import { useEffect, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../App';
import type { Overview, Query, Site } from '../lib/api';
import { dayInTz } from '../lib/format';
import { Favicon } from './Icons';
import { UiIcon } from './UiIcon';

export const PERIODS: { value: string; label: string }[] = [
  { value: 'now', label: 'Maintenant · 30 min' },
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: '24h', label: '24 dernières heures' },
  { value: '48h', label: '2 derniers jours' },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '90 derniers jours' },
  { value: '12m', label: '12 derniers mois' },
  { value: 'all', label: 'Depuis le début' },
];

const GRANULARITIES = [
  { value: 'minute', label: 'Par minute' },
  { value: 'hour', label: 'Par heure' },
  { value: 'day', label: 'Par jour' },
  { value: 'week', label: 'Par semaine' },
  { value: 'month', label: 'Par mois' },
];

export function Dropdown({ button, children, align = 'left', grow = false }: { button: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; grow?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div className={`relative flex min-w-0 ${grow ? 'flex-1' : ''}`} ref={ref}>
      <div className="flex w-full min-w-0" onClick={() => setOpen((o) => !o)}>
        {button}
      </div>
      {open && (
        <div className={`card absolute top-full z-40 mt-2 max-h-[70dvh] w-[min(320px,calc(100vw-2rem))] min-w-[200px] overflow-y-auto p-1 sm:w-auto ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Favourite periods, pinned from the period menu; kept in this browser. */
export interface PinnedPeriod { period: string; from?: string; to?: string }
const PIN_KEY = 'ml-pinned-periods';
const samePin = (a: PinnedPeriod, b: PinnedPeriod) => a.period === b.period && (a.period !== 'custom' || (a.from === b.from && a.to === b.to));
function readPins(): PinnedPeriod[] {
  try {
    const v = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
    return Array.isArray(v) ? v.filter((p) => p && typeof p.period === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function usePinnedPeriods() {
  const [pins, setPins] = useState<PinnedPeriod[]>(readPins);
  const toggle = (p: PinnedPeriod) =>
    setPins((cur) => {
      const next = cur.some((x) => samePin(x, p)) ? cur.filter((x) => !samePin(x, p)) : [...cur, p].slice(-8);
      try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  return { pins, toggle, isPinned: (p: PinnedPeriod) => pins.some((x) => samePin(x, p)) };
}

const fmtShort = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-4">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function itemCls(active: boolean) {
  return `flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left sm:min-h-0 text-sm hover:bg-well ${active ? 'font-medium text-ink' : 'text-ink-2'}`;
}

export function Toolbar({
  site,
  sites,
  q,
  update,
  overview,
  onRefresh,
  loading,
}: {
  site: Site;
  sites: Site[];
  q: Query;
  update: (p: Partial<Query>) => void;
  overview: Overview | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [from, setFrom] = useState(q.from ?? '');
  const [to, setTo] = useState(q.to ?? '');

  const { pins, toggle, isPinned } = usePinnedPeriods();
  const pinLabel = (p: PinnedPeriod) =>
    p.period === 'custom'
      ? p.from === p.to
        ? new Date(p.from + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : `${fmtShort(p.from ?? '')} → ${fmtShort(p.to ?? '')}`
      : p.period === 'now' ? 'Maintenant' : PERIODS.find((x) => x.value === p.period)?.label ?? '30 derniers jours';
  const label = pinLabel(q);
  const isNow = q.period === 'now';

  function shift(dir: -1 | 1) {
    if (!overview || isNow) return;
    const { from, to } = overview.range;
    const span = Math.max(to - from, 86_400_000);
    const nf = from + dir * span;
    const nt = nf + span - 1;
    if (nf > Date.now()) return;
    update({ period: 'custom', from: dayInTz(nf, site.timezone), to: dayInTz(Math.min(nt, Date.now()), site.timezone) });
  }
  const canForward = overview && !isNow ? overview.range.to < Date.now() - 60_000 : false;
  const Star = ({ p, name }: { p: PinnedPeriod; name: string }) => {
    const on = isPinned(p);
    return (
      <button type="button" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-well sm:h-8 sm:w-8 ${on ? 'text-accent' : 'text-ink-4 hover:text-ink-2'}`}
        aria-pressed={on} aria-label={on ? `Désépingler « ${name} »` : `Épingler « ${name} »`} title={on ? 'Désépingler' : 'Épingler en haut du menu'}
        onClick={(e) => { e.stopPropagation(); toggle(p); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></svg>
      </button>
    );
  };

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-wrap">
      <div className="hidden md:block"><Dropdown
        button={
          <button className="btn w-full min-w-0 justify-start px-2.5 sm:w-auto">
            <Favicon domain={site.domain} size={16} />
            <span className="min-w-0 max-w-[180px] flex-1 truncate text-left font-medium">{site.name}</span>
            <Chevron />
          </button>
        }
      >
        {(close) => (
          <>
            {sites.map((s) => (
              <button
                key={s.id}
                className={itemCls(s.id === site.id)}
                onClick={() => {
                  close();
                  navigate(`/site/${s.id}${window.location.search}`);
                }}
              >
                <Favicon domain={s.domain} size={16} /> {s.name}
              </button>
            ))}
            <div className="my-1 border-t border-line" />
            <button className={itemCls(false)} onClick={() => navigate(`/site/${site.id}/settings`)}>
              Réglages et installation
            </button>
            <button className={itemCls(false)} onClick={() => navigate('/sites')}>
              Tous les sites
            </button>
          </>
        )}
      </Dropdown></div>

      <div className="flex h-11 min-w-0 flex-1 items-stretch sm:flex-none rounded-lg border border-line bg-surface shadow-xs md:h-9 sm:col-auto sm:row-auto">
        <button className="w-10 shrink-0 rounded-l-lg text-lg text-ink-3 hover:bg-well hover:text-ink disabled:opacity-30 md:w-8" onClick={() => shift(-1)} disabled={isNow} aria-label="Période précédente">
          ‹
        </button>
        <Dropdown
          grow
          button={
            <button className="flex h-full w-full min-w-0 items-center justify-center gap-2 whitespace-nowrap border-x border-line px-3 text-[13px] font-medium hover:bg-well">
              {isNow && <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>}
              {label} <Chevron />
            </button>
          }
        >
          {(close) => (
            <>
              {pins.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-4">Épinglées</div>
                  {pins.map((p) => (
                    <div key={`${p.period}${p.from ?? ''}${p.to ?? ''}`} className="flex items-center">
                      <button className={itemCls(samePin(p, q))} onClick={() => { close(); update({ period: p.period, from: p.from, to: p.to, granularity: undefined }); }}>
                        {pinLabel(p)}
                      </button>
                      <Star p={p} name={pinLabel(p)} />
                    </div>
                  ))}
                  <div className="my-1 border-t border-line" />
                </>
              )}
              {PERIODS.map((p) => (
                <div key={p.value} className="flex items-center">
                  <button
                    className={itemCls(q.period === p.value)}
                    onClick={() => {
                      close();
                      update({ period: p.value, granularity: undefined });
                    }}
                  >
                    {p.label}
                  </button>
                  <Star p={{ period: p.value }} name={p.label} />
                </div>
              ))}
              {q.period === 'custom' && q.from && q.to && (
                <button className={itemCls(false)} onClick={() => toggle({ period: 'custom', from: q.from, to: q.to })}>
                  <UiIcon name="star" size={15} /> {isPinned({ period: 'custom', from: q.from, to: q.to }) ? 'Désépingler cette période' : `Épingler ${label}`}
                </button>
              )}
              <div className="my-1 border-t border-line" />
              <form
                className="space-y-2 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!from || !to) return;
                  close();
                  update({ period: 'custom', from, to: to < from ? from : to, granularity: undefined });
                }}
              >
                <div className="text-xs font-medium text-ink-3">Période personnalisée</div>
                <input type="date" aria-label="Du" className="input py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
                <input type="date" aria-label="Au" className="input py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
                <button className="btn-dark w-full py-1.5">Appliquer</button>
              </form>
            </>
          )}
        </Dropdown>
        <button
          className="w-10 shrink-0 rounded-r-lg text-lg text-ink-3 hover:bg-well hover:text-ink disabled:opacity-30 md:w-8"
          onClick={() => shift(1)}
          disabled={!canForward}
          aria-label="Période suivante"
        >
          ›
        </button>
      </div>

      <Dropdown
        align="right"
        button={
          <button className="btn whitespace-nowrap px-3">
            {GRANULARITIES.find((g) => g.value === (q.granularity ?? overview?.range.granularity))?.label ?? 'Par jour'} <Chevron />
          </button>
        }
      >
        {(close) =>
          GRANULARITIES.map((g) => (
            <button
              key={g.value}
              className={itemCls((q.granularity ?? overview?.range.granularity) === g.value)}
              onClick={() => {
                close();
                update({ granularity: g.value });
              }}
            >
              {g.label}
            </button>
          ))
        }
      </Dropdown>

      <button className="btn w-11 px-0 md:w-9" onClick={onRefresh} aria-label="Actualiser">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
    </div>
  );
}

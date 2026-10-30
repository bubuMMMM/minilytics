import { useEffect, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../App';
import type { Overview, Query, Site } from '../lib/api';
import { dayInTz } from '../lib/format';
import { Favicon } from './Icons';

export const PERIODS: { value: string; label: string }[] = [
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

  const label =
    q.period === 'custom'
      ? q.from === q.to
        ? new Date(q.from + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : `${fmtShort(q.from ?? "")} → ${fmtShort(q.to ?? "")}`
      : PERIODS.find((p) => p.value === q.period)?.label ?? '30 derniers jours';

  function shift(dir: -1 | 1) {
    if (!overview) return;
    const { from, to } = overview.range;
    const span = Math.max(to - from, 86_400_000);
    const nf = from + dir * span;
    const nt = nf + span - 1;
    if (nf > Date.now()) return;
    update({ period: 'custom', from: dayInTz(nf, site.timezone), to: dayInTz(Math.min(nt, Date.now()), site.timezone) });
  }
  const canForward = overview ? overview.range.to < Date.now() - 60_000 : false;

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
        <button className="w-10 shrink-0 rounded-l-lg text-lg text-ink-3 hover:bg-well hover:text-ink md:w-8" onClick={() => shift(-1)} aria-label="Période précédente">
          ‹
        </button>
        <Dropdown
          grow
          button={
            <button className="flex h-full w-full min-w-0 items-center justify-center gap-2 whitespace-nowrap border-x border-line px-3 text-[13px] font-medium hover:bg-well">
              {label} <Chevron />
            </button>
          }
        >
          {(close) => (
            <>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  className={itemCls(q.period === p.value)}
                  onClick={() => {
                    close();
                    update({ period: p.value, granularity: undefined });
                  }}
                >
                  {p.label}
                </button>
              ))}
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

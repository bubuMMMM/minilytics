import { useMemo, useState, type ReactNode } from 'react';
import { qs, type BreakdownRow } from '../lib/api';
import { useDash } from '../lib/context';
import { countryName, fmtNumber, fmtPct , channelName } from '../lib/format';
import { useApi } from '../lib/useApi';
import { BrowserIcon, ChannelIcon, DeviceIcon, Favicon, Flag, OSIcon, SourceIcon } from './Icons';
import { Modal } from './Modal';

export interface TabDef {
  label: string;
  dim: string;
  /** Session filter applied when a row is clicked (omit for non-filterable tabs). */
  filter?: string;
}

/** How each dimension's label and icon are shown. */
export function renderLabel(dim: string, row: Pick<BreakdownRow, 'label' | 'extra'>): ReactNode {
  const l = row.label;
  const text = (s: ReactNode) => <span className="truncate">{s}</span>;
  switch (dim) {
    case 'channel':
      return (
        <>
          <ChannelIcon channel={l} />
          {text(channelName(l))}
        </>
      );
    case 'source':
      return (
        <>
          <SourceIcon source={l} domain={row.extra} />
          {text(!l || l === 'Direct/None' ? 'Direct' : l)}
        </>
      );
    case 'country':
      return (
        <>
          <Flag cc={l} />
          {text(countryName(l))}
        </>
      );
    case 'region':
    case 'city':
      return (
        <>
          <Flag cc={row.extra ?? null} />
          {text(l ?? 'Unknown')}
        </>
      );
    case 'browser':
      return (
        <>
          <BrowserIcon name={l} />
          {text(l)}
        </>
      );
    case 'os':
      return (
        <>
          <OSIcon name={l} />
          {text(l)}
        </>
      );
    case 'device':
      return (
        <>
          <DeviceIcon name={l} />
          {text(l)}
        </>
      );
    case 'hostname':
      return (
        <>
          <Favicon domain={l} />
          {text(l)}
        </>
      );
    case 'exit_link': {
      let host: string | null = null;
      try {
        host = l ? new URL(l).hostname : null;
      } catch {}
      return (
        <>
          <Favicon domain={host} />
          {text(l?.replace(/^https?:\/\/(www\.)?/, ''))}
        </>
      );
    }
    default:
      return text(l ?? <span className="text-ink-4">(none)</span>);
  }
}

function Bars({ rows, dim, tab, sort, limit, onPick }: { rows: BreakdownRow[]; dim: string; tab: TabDef; sort: 'visitors' | 'revenue'; limit?: number; onPick?: (r: BreakdownRow) => void }) {
  const { money, share } = useDash();
  const hideRev = !!share?.hideRevenue;
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0) || b.visitors - a.visitors), [rows, sort]);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const maxV = Math.max(1, ...rows.map((r) => r.visitors));
  const maxR = Math.max(1, ...rows.map((r) => r.revenue));
  const hasRevenue = rows.some((r) => r.revenue > 0);

  return (
    <div className="space-y-1">
      {shown.map((r, i) => {
        const vw = (r.visitors / maxV) * (hasRevenue ? 62 : 100);
        const rw = hasRevenue ? (Math.max(0, r.revenue) / maxR) * 38 : 0;
        return (
          <div
            key={`${r.label}-${i}`}
            className={`group relative flex h-9 items-center rounded-lg ${tab.filter ? 'cursor-pointer' : ''}`}
            onClick={() => onPick?.(r)}
          >
            <div className="absolute inset-0 flex">
              <div className="rounded-l-lg bg-visitorsSoft transition-[width] duration-200" style={{ width: `${vw}%`, minWidth: r.visitors ? 4 : 0 }} />
              {rw > 0 && <div className="rounded-r-lg bg-revenueSoft" style={{ width: `${rw}%` }} />}
            </div>
            <div className="absolute inset-0 hidden rounded-lg ring-1 ring-brand/30 group-hover:block" />
            <div className="relative flex min-w-0 flex-1 items-center gap-2.5 px-3 text-sm text-ink">{renderLabel(dim, r)}</div>
            <div className="tnum relative flex shrink-0 items-center gap-3 pr-3 text-sm font-semibold text-ink">
              {r.revenue !== 0 && <span className="hidden text-sm font-normal text-revenue group-hover:inline">{money(r.revenue)}</span>}
              {sort === 'revenue' ? money(r.revenue, true) : fmtNumber(r.visitors)}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-60 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:block">
              <div className="mb-1 truncate font-medium">{r.label ?? '(none)'}</div>
              <div className="flex justify-between"><span className="text-ink-4">Visiteurs</span>{fmtNumber(r.visitors)}</div>
              {r.pageviews !== undefined && dim === 'page' && <div className="flex justify-between"><span className="text-ink-4">Pages vues</span>{fmtNumber(r.pageviews)}</div>}
              {!hideRev && <>
              <div className="flex justify-between"><span className="text-ink-4">Revenus</span>{money(r.revenue)}</div>
              <div className="flex justify-between"><span className="text-ink-4">Clients</span>{r.customers}</div>
              <div className="flex justify-between"><span className="text-ink-4">Conversion</span>{r.visitors ? fmtPct(r.customers / r.visitors, 1) : '—'}</div>
              </>}
              {tab.filter && <div className="mt-1 text-ink-4">Cliquer pour filtrer</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Panel({ tabs, title }: { tabs: TabDef[]; title?: string }) {
  const { site, q, reloadKey, addFilter, money, share } = useDash();
  const base = share?.base ?? `/api/sites/${site.id}`;
  const hideRevenue = !!share?.hideRevenue;
  const [active, setActive] = useState(tabs[0].dim);
  const [sort, setSort] = useState<'visitors' | 'revenue'>('visitors');
  const [details, setDetails] = useState(false);
  const [search, setSearch] = useState('');
  const tab = tabs.find((t) => t.dim === active)!;
  const { data, loading, error } = useApi<BreakdownRow[]>(`${base}/breakdown?${qs(q, { dim: active })}`, reloadKey);

  const pick = (r: BreakdownRow) => {
    if (!tab.filter) return;
    setDetails(false);
    addFilter(tab.filter, r.label ?? '');
  };

  const filtered = (data ?? []).filter((r) => !search || (r.label ?? '').toLowerCase().includes(search.toLowerCase()));
  const exportUrl = `/api/sites/${site.id}/export?${qs(q, { dim: active })}`;

  return (
    <div className="ml-bento flex min-h-[520px] flex-col p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        {title && <h3 className="text-[15px] font-semibold tracking-[-.02em] text-ink">{title}</h3>}
        <div className="flex items-center gap-0.5">
          {!share && <a className="btn-ghost text-xs" href={exportUrl} download title="Exporter en CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            CSV
          </a>}
          {!hideRevenue && <button className="btn-ghost text-xs" onClick={() => setSort((s) => (s === 'visitors' ? 'revenue' : 'visitors'))} title="Trier par visiteurs ou revenus">
            {sort === 'visitors' ? 'Visiteurs' : 'Revenus'} <span className="text-ink-4">↕</span>
          </button>}
        </div>
      </div>
      <div className="mb-3 overflow-x-auto">
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t.dim} className={`tab whitespace-nowrap ${t.dim === active ? 'tab-active' : ''}`} onClick={() => setActive(t.dim)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        {error && <p className="p-3 text-sm text-danger">{error}</p>}
        {!data && loading && (
          <div className="space-y-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton h-9" style={{ width: `${95 - i * 9}%` }} />
            ))}
          </div>
        )}
        {data && data.length === 0 && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-well text-xl">📭</div>
            <p className="mt-3 text-sm font-medium text-ink-2">Aucune donnée sur cette période</p>
            <p className="text-xs text-ink-4">Essayez une période plus longue ou retirez les filtres.</p>
          </div>
        )}
        {data && <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}><Bars rows={data} dim={active} tab={tab} sort={sort} limit={10} onPick={pick} /></div>}
      </div>
      {data && data.length > 10 && (
        <button className="btn-ghost mx-auto mt-3 text-xs" onClick={() => setDetails(true)}>
          Voir les {data.length} →
        </button>
      )}
      <Modal open={details} onClose={() => setDetails(false)} title={tab.label} width="max-w-3xl">
        <input className="input mb-4" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="pb-2 font-medium">{tab.label}</th>
                <th className="pb-2 text-right font-medium">Visiteurs</th>
                {!hideRevenue && <>
                <th className="pb-2 text-right font-medium">Revenus</th>
                <th className="pb-2 text-right font-medium">Conv.</th>
                <th className="pb-2 text-right font-medium">Rev./visiteur</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className={`border-t border-line ${tab.filter ? 'cursor-pointer hover:bg-well' : ''}`} onClick={() => pick(r)}>
                  <td className="max-w-[320px] py-2"><div className="flex min-w-0 items-center gap-2">{renderLabel(active, r)}</div></td>
                  <td className="py-2 text-right">{fmtNumber(r.visitors)}</td>
                  {!hideRevenue && <>
                  <td className="py-2 text-right">{money(r.revenue)}</td>
                  <td className="py-2 text-right">{r.visitors ? fmtPct(r.customers / r.visitors, 1) : '—'}</td>
                  <td className="py-2 text-right">{r.visitors ? money(r.revenue / r.visitors) : '—'}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}

import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';

interface Paths {
  sessions: number;
  truncated: boolean;
  paths: { steps: string[]; sessions: number; conversions: number }[];
  transitions: { from: string; to: string; count: number }[];
}

/** User paths: the first pages of each visit, how often each path occurs and how often it converts. */
export function PathsView() {
  const { site, q, reloadKey, addFilter } = useDash();
  const { data } = useApi<Paths>(`/api/sites/${site.id}/paths?${qs(q)}`, reloadKey);
  if (!data) return <div className="ml-skeleton m-3 h-40" />;
  if (!data.paths.length) return <div className="p-8 text-center text-sm text-ink-3">Aucune visite sur la période.</div>;
  const max = data.paths[0].sessions || 1;
  return (
    <div className="grid gap-5 px-3 pb-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-semibold">Chemins les plus fréquents</div>
          <div className="text-[12px] text-ink-4">{fmtNumber(data.sessions)} visites · 4 premières pages</div>
        </div>
        <ol className="space-y-1.5">
          {data.paths.map((p, i) => (
            <li key={i} className="relative overflow-hidden rounded-lg border border-line px-3 py-2">
              <span className="absolute inset-y-0 left-0 bg-accent/[.07]" style={{ width: `${(p.sessions / max) * 100}%` }} />
              <div className="relative flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
                {p.steps.map((s, j) => (
                  <span key={j} className="flex min-w-0 items-center gap-1">
                    {j > 0 && <span className="text-ink-4" aria-hidden>→</span>}
                    {s === '…' ? <span className="text-ink-4">…</span> : (
                      <button className="max-w-[220px] truncate rounded bg-well px-1.5 py-0.5 font-mono text-[12px] hover:bg-accent/10" title={`Filtrer sur les visites passées par ${s}`} onClick={() => addFilter('page', s)}>{s}</button>
                    )}
                  </span>
                ))}
              </div>
              <div className="relative mt-1 flex gap-3 text-[12px] text-ink-3">
                <span className="tnum"><b className="font-semibold text-ink">{fmtNumber(p.sessions)}</b> visites</span>
                <span className="tnum">{fmtPct(p.sessions / data.sessions, 1)}</span>
                {p.conversions > 0 && <span className="tnum text-success">{fmtNumber(p.conversions)} conversions · {fmtPct(p.conversions / p.sessions, 1)}</span>}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="min-w-0">
        <div className="mb-2 text-[13px] font-semibold">Page suivante la plus fréquente</div>
        <div className="overflow-hidden rounded-lg border border-line">
          {data.transitions.map((t, i) => (
            <div key={i} className="flex items-center gap-2 border-t border-line px-3 py-2 text-[12px] first:border-t-0">
              <span className="min-w-0 flex-1 truncate font-mono" title={t.from}>{t.from}</span>
              <span className="text-ink-4" aria-hidden>→</span>
              <span className="min-w-0 flex-1 truncate font-mono" title={t.to}>{t.to}</span>
              <span className="tnum shrink-0 font-medium">{fmtNumber(t.count)}</span>
            </div>
          ))}
        </div>
        {data.truncated && <p className="mt-2 text-[11px] text-ink-4">Échantillon : les 200 000 premières pages vues de la période.</p>}
      </div>
    </div>
  );
}

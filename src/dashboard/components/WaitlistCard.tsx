import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtAgo, fmtNumber } from '../lib/format';
import { Badge, EmptyState } from './ui';
import { UiIcon } from './UiIcon';

interface Row { id: string; email: string; plan: string; website: string | null; source: string | null; created_at: number }
interface Data { total: number; byPlan: Record<string, number>; rows: Row[] }

const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth' };

/** Owner-only: people who asked for access on /signup (src/worker/waitlist.ts). */
export function WaitlistCard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    api<Data>('/api/waitlist', { signal: ctl.signal }).then(setData, (e: Error) => { if (!ctl.signal.aborted) setError(e.message || 'Impossible de charger la liste.'); });
    return () => ctl.abort();
  }, []);

  async function remove(r: Row) {
    if (!window.confirm(`Retirer ${r.email} de la liste d’attente ?`)) return;
    try {
      await api(`/api/waitlist/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      setData((d) => d && { total: d.total - 1, byPlan: { ...d.byPlan, [r.plan]: Math.max(0, (d.byPlan[r.plan] ?? 1) - 1) }, rows: d.rows.filter((x) => x.id !== r.id) });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  const week = data?.rows.filter((r) => Date.now() - Number(r.created_at) < 7 * 86_400_000).length ?? 0;
  const rows = data ? (all ? data.rows : data.rows.slice(0, 5)) : [];

  return (
    <section aria-labelledby="wl-title" className="mt-10 overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="wl-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">Liste d’attente {data && <Badge tone="accent">{fmtNumber(data.total)}</Badge>}</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">Les demandes d’accès laissées sur la page d’inscription. Visible par vous seul.</p>
        </div>
        {data && data.total > 0 && <a className="btn shrink-0" href="/api/waitlist.csv" download><UiIcon name="download" size={15} />Exporter en CSV</a>}
      </div>

      {error && <p role="alert" className="px-5 py-4 text-sm text-danger">{error}</p>}
      {!data && !error && <div className="space-y-2 px-5 py-4" role="status" aria-label="Chargement de la liste d’attente"><div className="ml-skeleton h-4 w-1/2" /><div className="ml-skeleton h-4 w-2/3" /></div>}
      {data && data.total === 0 && <EmptyState compact icon="users" title="Personne pour l’instant" description="Chaque bouton « Réserver mon accès » de la page d’accueil mène au formulaire. Les inscriptions apparaîtront ici." />}

      {data && data.total > 0 && (
        <>
          <dl className="grid grid-cols-3 border-b border-line text-[12px]">
            {[['Cette semaine', week], ['Starter', data.byPlan.starter ?? 0], ['Growth', data.byPlan.growth ?? 0]].map(([k, v], i) => (
              <div key={k} className={`px-5 py-3 ${i ? 'border-l border-line' : ''}`}><dt className="truncate text-ink-3">{k}</dt><dd className="tnum mt-0.5 text-lg font-semibold text-ink">{fmtNumber(Number(v))}</dd></div>
            ))}
          </dl>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{r.email}</p>
                  <p className="truncate text-[12px] text-ink-3">
                    {PLAN[r.plan] ?? r.plan}
                    {r.website && <> · <span className="font-mono" translate="no">{r.website}</span></>}
                    {r.source && <> · via {r.source}</>}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-ink-4" title={new Date(Number(r.created_at)).toLocaleString('fr-FR')}>il y a {fmtAgo(Date.now() - Number(r.created_at))}</span>
                <button type="button" className="btn-ghost -mr-2 shrink-0 !h-9 !w-9 !p-0 text-ink-4 hover:text-danger" aria-label={`Retirer ${r.email}`} onClick={() => remove(r)}><UiIcon name="x" size={15} /></button>
              </li>
            ))}
          </ul>
          {data.rows.length > 5 && (
            <button type="button" className="w-full border-t border-line px-5 py-3 text-left text-[13px] font-medium text-ink-2 hover:bg-well" onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? 'Afficher moins' : `Tout afficher (${fmtNumber(data.rows.length)}${data.total > data.rows.length ? ' sur ' + fmtNumber(data.total) : ''})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

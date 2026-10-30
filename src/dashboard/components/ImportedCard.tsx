import { useState } from 'react';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { countryName, flag, fmtDuration, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { BarList } from './BarList';
import { TrendChart } from './TrendChart';

interface Imported {
  from: string; to: string; days: number; granularity: string;
  totals: { visitors: number; visits: number; pageviews: number; bounceRate: number; avgDuration: number };
  series: { bucket: string; visitors: number; pageviews: number }[];
  top: Record<string, { label: string; visitors: number; pageviews: number }[]>;
}

const TABS: [string, string][] = [['source', 'Sources'], ['page', 'Pages'], ['entry_page', 'Entrée'], ['country', 'Pays'], ['device', 'Appareils'], ['browser', 'Navigateurs'], ['os', 'OS'], ['goal', 'Objectifs']];
const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Imported history (Plausible) for the selected period; shown separately and always labelled as imported. */
export function ImportedCard({ siteId }: { siteId: string }) {
  const { q, reloadKey } = useDash();
  const [tab, setTab] = useState('source');
  const { data } = useApi<Imported | null>(q.period === 'now' ? null : `/api/sites/${siteId}/imported?${qs({ ...q, filters: {} })}`, reloadKey);
  if (!data) return null;
  const t = data.totals;
  const rows = (data.top[tab] ?? []).map((r) => ({
    key: r.label,
    label: tab === 'country' ? <>{flag(r.label)} {countryName(r.label)}</> : r.label,
    value: r.visitors,
  }));
  return (
    <section className="card mt-5 p-4 sm:p-5" aria-labelledby="imported-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="imported-title" className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-tight">
            Historique importé
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning">Importé · Plausible</span>
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-3">
            Agrégats quotidiens importés du {fmtDay(data.from)} au {fmtDay(data.to)} ({data.days} j), séparés de vos données collectées. Les filtres et segments ne s’y appliquent pas ; « Visiteurs » additionne les visiteurs de chaque jour.
          </p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
        {[
          ['Visiteurs', fmtNumber(t.visitors)],
          ['Visites', fmtNumber(t.visits)],
          ['Pages vues', fmtNumber(t.pageviews)],
          ['Rebond', fmtPct(t.bounceRate)],
          ['Durée moyenne', fmtDuration(t.avgDuration * 1000)],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">{k}</dt>
            <dd className="tnum mt-0.5 text-lg font-semibold tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <TrendChart height={180} granularity={data.granularity} buckets={data.series.map((s) => s.bucket)} series={[
            { key: 'visitors', label: 'Visiteurs (importés)', color: 'rgb(var(--warning))', values: data.series.map((s) => s.visitors) },
            { key: 'pageviews', label: 'Pages vues (importées)', color: 'rgb(var(--accent))', values: data.series.map((s) => s.pageviews), axis: 'right' },
          ]} />
        </div>
        <div className="min-w-0">
          <div className="tabs mb-2 overflow-x-auto">
            {TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'tab-active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <BarList rows={rows} unit="visit." />
        </div>
      </div>
    </section>
  );
}

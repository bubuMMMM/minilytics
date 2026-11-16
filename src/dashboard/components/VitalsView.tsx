import { useMemo, useState } from 'react';
import {
  RATING_LABEL,
  VITAL_HELP,
  VITAL_LABEL,
  VITAL_METRICS,
  formatVital,
  type VitalMetric,
  type VitalRating,
} from '../../shared/webVitals';
import type { VitalPageRow, VitalsReport } from '../../worker/web-quality';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { useApi } from '../lib/useApi';
import { TrendChart, type TrendSeries } from './TrendChart';
import { StatCard } from './StatCard';
import { Badge, type Tone } from './ui';

const RATING_TONE: Record<VitalRating, Tone> = {
  good: 'success',
  'needs-improvement': 'warning',
  poor: 'danger',
};

const METRIC_COLOR: Record<VitalMetric, string> = {
  lcp: 'rgb(var(--accent))',
  inp: 'rgb(var(--warning))',
  cls: 'rgb(var(--danger))',
  fcp: 'rgb(var(--success))',
  ttfb: 'rgb(var(--ink-2))',
};

const DEVICE_LABEL = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' } as const;

export function VitalsView() {
  const { site, q } = useDash();
  const [path, setPath] = useState<string | ''>('');
  const [metric, setMetric] = useState<VitalMetric>('lcp');
  const { data, error, loading } = useApi<VitalsReport>(`/api/sites/${site.id}/vitals?${qs(q, path ? { path } : {})}`);
  const selected = data?.selected ?? null;
  const pages = data?.pages ?? [];

  const series: TrendSeries[] = useMemo(() => {
    if (!data?.trend.length) return [];
    return [{
      key: metric,
      label: VITAL_LABEL[metric],
      color: METRIC_COLOR[metric],
      values: data.trend.map((row) => row[metric] ?? 0),
    }];
  }, [data, metric]);

  return (
    <div className="space-y-5">
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {(data?.sparse || (data && data.samples === 0)) && (
        <p className="rounded-lg border border-dashed border-line-strong bg-well px-3 py-2 text-[13px] leading-relaxed text-ink-3">
          {data.samples === 0
            ? 'Aucune mesure Core Web Vitals sur cette période. Les données apparaissent après le déploiement du script, dès qu’un visiteur quitte une page.'
            : 'Peu de mesures pour l’instant — le 75ᵉ percentile est indicatif tant qu’il y a moins de 8 pages vues instrumentées.'}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {VITAL_METRICS.map((m) => {
          const value = selected?.p75[m] ?? null;
          const rating = selected?.rating[m] ?? null;
          return (
            <div
              key={m}
              className={`text-left ${metric === m ? 'ring-2 ring-accent/40 rounded-[18px]' : ''}`}
            >
              <StatCard
                label={VITAL_LABEL[m]}
                icon="zap"
                value={formatVital(m, value)}
                help={VITAL_HELP[m]}
                loading={loading && !data}
                hint={
                  <span className="flex flex-wrap items-center gap-2">
                    {rating ? <Badge tone={RATING_TONE[rating]} dot>{RATING_LABEL[rating]}</Badge> : <span>Pas encore de donnée</span>}
                    <button type="button" className="text-[12px] font-medium text-accent hover:underline" onClick={() => setMetric(m)} aria-pressed={metric === m}>
                      Voir la tendance
                    </button>
                  </span>
                }
                accent={metric === m}
              />
            </div>
          );
        })}
      </div>

      {data && data.trend.length > 1 && (
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Tendance du 75ᵉ percentile</h2>
              <p className="text-[13px] text-ink-3">{selected ? selected.path : 'Toutes les pages'} · {VITAL_LABEL[metric]}</p>
            </div>
          </div>
          <TrendChart
            buckets={data.trend.map((r) => r.bucket)}
            granularity={q.granularity || 'day'}
            series={series}
            height={200}
            format={(n) => formatVital(metric, n)}
          />
        </section>
      )}

      {selected && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Par appareil · {selected.path}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(['desktop', 'mobile', 'tablet'] as const).map((d) => {
              const rec = selected.devices[d];
              return (
                <div key={d} className="rounded-lg border border-line p-3">
                  <div className="text-[13px] font-medium">{DEVICE_LABEL[d]}</div>
                  <div className="mt-1 text-[12px] text-ink-3">{rec.samples} mesure{rec.samples === 1 ? '' : 's'}</div>
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {VITAL_METRICS.map((m) => (
                      <li key={m} className="flex items-center justify-between gap-2">
                        <span className="text-ink-3">{VITAL_LABEL[m]}</span>
                        <span className="tnum">{formatVital(m, rec.p75[m])}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <caption className="sr-only">Core Web Vitals par page, 75ᵉ percentile</caption>
          <thead className="border-b border-line text-[11px] font-medium uppercase tracking-wide text-ink-4">
            <tr>
              <th className="px-4 py-3 font-medium">Page</th>
              <th className="px-3 py-3 font-medium text-right">Mesures</th>
              {VITAL_METRICS.map((m) => (
                <th key={m} className="px-3 py-3 font-medium text-right">{VITAL_LABEL[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-6 text-ink-3">Aucune page mesurée sur cette période.</td></tr>
            )}
            {pages.map((row) => (
              <PageRow key={row.path} row={row} active={(path || selected?.path) === row.path} onSelect={() => setPath(row.path)} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PageRow({ row, active, onSelect }: { row: VitalPageRow; active: boolean; onSelect: () => void }) {
  return (
    <tr
      className={`cursor-pointer border-b border-line last:border-0 ${active ? 'bg-accent/5' : 'hover:bg-well'}`}
      onClick={onSelect}
    >
      <td className="max-w-[240px] truncate px-4 py-2.5 font-medium" title={row.path}>{row.path}</td>
      <td className="tnum px-3 py-2.5 text-right text-ink-3">
        {row.samples}
        {row.sparse && <span className="ml-1 text-[11px] text-ink-4">peu de données</span>}
      </td>
      {VITAL_METRICS.map((m) => (
        <td key={m} className="px-3 py-2.5 text-right">
          <MetricCell metric={m} value={row.p75[m]} rating={row.rating[m]} />
        </td>
      ))}
    </tr>
  );
}

function MetricCell({ metric, value, rating }: { metric: VitalMetric; value: number | null; rating: VitalRating | null }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="tnum">{formatVital(metric, value)}</span>
      {rating && <Badge tone={RATING_TONE[rating]}>{RATING_LABEL[rating]}</Badge>}
    </span>
  );
}


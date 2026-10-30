import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Modal } from './Modal';
import { TrendChart } from './TrendChart';

interface Detail {
  name: string;
  completions: number;
  visitors: number;
  conversionRate: number;
  revenue: number;
  customers: number;
  series: { bucket: string; completions: number; visitors: number }[];
  pages: { label: string; count: number }[];
  sources: { label: string | null; visitors: number }[];
  properties: { key: string; values: { value: string; count: number }[] }[];
}

/** One goal in depth: completions over time, conversion, revenue, where it happens and its custom properties. */
export function GoalDetail({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { site, q, money, addFilter } = useDash();
  const { data: d } = useApi<Detail>(name ? `/api/sites/${site.id}/goals/${encodeURIComponent(name)}?${qs(q)}` : null);
  return (
    <Modal open={!!name} onClose={onClose} width="max-w-3xl" title={<span className="flex items-center gap-2">🎯 <span className="font-mono text-[15px]">{name}</span></span>}>
      {!d && <div className="ml-skeleton h-72" />}
      {d && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4 [&>*]:bg-surface">
            <Stat label="Réalisations" value={fmtNumber(d.completions)} />
            <Stat label="Visiteurs" value={fmtNumber(d.visitors)} />
            <Stat label="Taux de conversion" value={fmtPct(d.conversionRate, d.conversionRate < 0.1 ? 2 : 1)} />
            <Stat label="Revenus des convertis" value={money(d.revenue, true)} sub={d.customers ? `${d.customers} client${d.customers > 1 ? 's' : ''}` : undefined} />
          </div>
          <div className="rounded-xl border border-line p-3">
            <TrendChart buckets={d.series.map((s) => s.bucket)} granularity={q.granularity ?? guess(d.series)} height={180}
              series={[{ key: 'completions', label: 'Réalisations', color: 'rgb(var(--accent))', values: d.series.map((s) => s.completions) }]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <List title="Pages où il est atteint" rows={d.pages.map((p) => ({ label: p.label || '/', value: p.count }))} />
            <List title="Sources des convertis" rows={d.sources.map((s) => ({ label: s.label ?? 'Direct', value: s.visitors }))} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-semibold">Propriétés personnalisées</div>
            {d.properties.length === 0 ? (
              <p className="text-[13px] text-ink-3">Aucune propriété. Envoyez-en avec <code className="rounded bg-well px-1">minilytics('goal', '{d.name}', {'{'} plan: 'pro' {'}'})</code>.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {d.properties.map((p) => <List key={p.key} title={p.key} mono rows={p.values.map((v) => ({ label: v.value, value: v.count }))} />)}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button className="btn" onClick={() => { addFilter('goal', d.name); onClose(); }}>Filtrer le tableau de bord sur cet objectif</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const guess = (s: { bucket: string }[]) => (s[0]?.bucket.includes('T') ? 'hour' : s[0]?.bucket.length === 7 ? 'month' : 'day');

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="tnum mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-ink-4">{sub}</div>}
    </div>
  );
}

function List({ title, rows, mono }: { title: string; rows: { label: string; value: number }[]; mono?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="min-w-0">
      <div className={`mb-1.5 text-[12px] font-medium text-ink-3 ${mono ? 'font-mono' : ''}`}>{title}</div>
      {rows.length === 0 && <div className="text-[12px] text-ink-4">—</div>}
      {rows.map((r) => (
        <div key={r.label} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1.5 text-[13px]">
          <span className="absolute inset-y-0 left-0 rounded-md bg-accent/10" style={{ width: `${(r.value / max) * 100}%` }} />
          <span className="relative truncate">{r.label}</span>
          <span className="tnum relative shrink-0 font-medium">{fmtNumber(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

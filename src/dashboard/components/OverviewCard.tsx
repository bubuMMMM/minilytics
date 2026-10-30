import { InfoTip } from './InfoTip';
import { useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Kpis, Overview } from '../lib/api';
import { useDash } from '../lib/context';
import { bucketLabel, fmtDuration, fmtNumber, fmtPct } from '../lib/format';
import { Sparkline, Trend } from './Sparkline';

type Series = 'visitors' | 'revenue' | 'prev';

const COLORS = { visitors: 'rgb(var(--accent))', visitorsFill: 'rgb(var(--accent))', revenue: 'rgb(var(--success))', prev: 'rgb(var(--ink-4))', grid: 'rgb(var(--ink-4))', tick: 'rgb(var(--ink-4))', dot: '#ffffff' };

interface KpiDef {
  key: keyof Kpis;
  label: string;
  value: string;
  invert?: boolean;
  spark?: number[];
  color?: string;
  hint?: string;
}

function KpiCard({ k, cur, prev }: { k: KpiDef; cur: number; prev: number }) {
  return (
    <div className="ml-bento ml-bento-interactive group relative flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center text-[12px] font-semibold text-ink-3"><span className="truncate">{k.label}</span>{k.hint && <InfoTip text={k.hint} label={`Comment est calculé « ${k.label} » ?`} />}</span>
        <Trend cur={cur} prev={prev} invert={k.invert} />
      </div>
      <div className="tnum mt-2 text-[clamp(1.6rem,2.4vw,2.1rem)] font-semibold leading-none tracking-[-.05em] text-ink">{k.value}</div>
      <div className="mt-3 h-8">{k.spark && k.spark.length > 1 ? <Sparkline data={k.spark} className={k.color} height={32} /> : <div className="h-px w-full translate-y-6 bg-well" />}</div>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card p-4">
          <div className="ml-skeleton h-3.5 w-20" />
          <div className="ml-skeleton mt-3 h-7 w-24" />
          <div className="ml-skeleton mt-3 h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function OverviewCard({ data }: { data: Overview | null }) {
  const { money } = useDash();
  const col = COLORS;
  const [hidden, setHidden] = useState<Record<Series, boolean>>({ visitors: false, revenue: false, prev: false });
  const c = data?.current;
  const p = data?.previous;
  const s = data?.series ?? [];
  const hasRevenue = !!c && (c.revenue !== 0 || (p?.revenue ?? 0) !== 0);

  const kpis: KpiDef[] = c
    ? [
        { key: 'visitors', label: 'Visiteurs', value: fmtNumber(c.visitors), spark: s.map((x) => x.visitors), color: 'text-visitors', hint: 'Personnes distinctes (un cookie visiteur first-party par navigateur), robots exclus.' },
        { key: 'pageviews', label: 'Pages vues', value: fmtNumber(c.pageviews), spark: s.map((x) => x.pageviews), color: 'text-brand', hint: 'Chaque page affichée, navigations internes des applications React/Next.js comprises. Les doublons de moins de 1,5 s sont ignorés.' },
        { key: 'revenue', label: 'Revenus', value: money(c.revenue, true), spark: s.map((x) => x.revenue), color: 'text-revenue' },
        { key: 'conversionRate', label: 'Conversion', value: fmtPct(c.conversionRate, c.conversionRate >= 0.1 ? 0 : 2), hint: 'Clients / visiteurs' },
        { key: 'bounceRate', label: 'Taux de rebond', value: fmtPct(c.bounceRate), invert: true, hint: 'Visites d’une seule page, sans clic, vidéo, objectif ni 10 s d’activité' },
        { key: 'avgDuration', label: 'Durée de visite', value: fmtDuration(c.avgDuration), hint: 'Temps moyen passé par visite, onglet visible uniquement.' },
      ]
    : [];

  const g = data?.range.granularity ?? 'day';
  const legend: { key: Series; label: string; swatch: string; show: boolean }[] = [
    { key: 'visitors', label: 'Visiteurs', swatch: 'bg-visitors', show: true },
    { key: 'prev', label: 'Période précédente', swatch: 'border-2 border-dashed border-line-strong bg-transparent', show: true },
    { key: 'revenue', label: 'Revenus', swatch: 'bg-revenue', show: hasRevenue },
  ];

  return (
    <div className="space-y-4">
      {c && p ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard key={k.key} k={k} cur={c[k.key]} prev={p[k.key]} />
          ))}
        </div>
      ) : (
        <KpiSkeleton />
      )}

      <div className="ml-bento overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div>
            <div className="font-display text-base font-semibold text-ink">Trafic{hasRevenue ? ' & revenus' : ''}</div>
            <div className="text-xs text-ink-3">Comparé à la période précédente de même durée</div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {legend
              .filter((l) => l.show)
              .map((l) => (
                <button
                  key={l.key}
                  onClick={() => setHidden((h) => ({ ...h, [l.key]: !h[l.key] }))}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:bg-well ${hidden[l.key] ? 'text-ink-4 line-through' : 'text-ink-2'}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-sm ${l.swatch} ${hidden[l.key] ? 'opacity-30' : ''}`} />
                  {l.label}
                </button>
              ))}
          </div>
        </div>
        <div className="h-[320px] px-2 pb-3 pt-4 sm:px-4">
          {!data && <div className="ml-skeleton h-full w-full" />}
          {data && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={col.visitorsFill} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={col.visitorsFill} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={col.grid} strokeDasharray="3 4" />
                <XAxis dataKey="bucket" tickFormatter={(b) => bucketLabel(b, g)} tick={{ fill: col.tick, fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis yAxisId="v" tick={{ fill: col.tick, fontSize: 12 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} tickFormatter={(v) => fmtNumber(v)} />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  tick={{ fill: col.tick, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => money(v, true)}
                  hide={hidden.revenue || !hasRevenue}
                  domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.6))]}
                />
                <Tooltip
                  cursor={{ stroke: col.grid, strokeWidth: 1.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as Overview['series'][0];
                    return (
                      <div className="card min-w-[200px] px-4 py-3 text-sm shadow-pop">
                        <div className="mb-2 font-semibold text-ink">{bucketLabel(d.bucket, g, true)}</div>
                        <Row color="bg-visitors" label="Visiteurs" value={fmtNumber(d.visitors)} />
                        {!hidden.prev && <Row color="bg-line-strong" label="Période précédente" value={fmtNumber(d.prevVisitors ?? 0)} />}
                        <Row color="bg-brand" label="Pages vues" value={fmtNumber(d.pageviews)} />
                        {hasRevenue && <Row color="bg-revenue" label="Revenus" value={money(d.revenue)} />}
                        {d.payments > 0 && <Row color="bg-revenueSoft" label="Paiements" value={String(d.payments)} />}
                      </div>
                    );
                  }}
                />
                {hasRevenue && !hidden.revenue && <Bar yAxisId="r" dataKey="revenue" fill={col.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
                {!hidden.prev && (
                  <Line yAxisId="v" type="monotone" dataKey="prevVisitors" stroke={col.prev} strokeWidth={1.8} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} />
                )}
                {!hidden.visitors && (
                  <Area
                    yAxisId="v"
                    type="monotone"
                    dataKey="visitors"
                    stroke={col.visitors}
                    strokeWidth={2.5}
                    fill="url(#vis)"
                    dot={false}
                    activeDot={{ r: 4.5, fill: col.visitors, stroke: col.dot, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="flex items-center gap-2 text-ink-3">
        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
        {label}
      </span>
      <span className="tnum font-medium text-ink">{value}</span>
    </div>
  );
}

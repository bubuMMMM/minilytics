import { InfoTip } from './InfoTip';
import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendChart } from './TrendChart';
import { AnnotationIcon, NotesBar, bucketOfTs, useAnnotations, useNotes } from './ChartNotes';
import type { Kpis, Overview } from '../lib/api';
import { useDash } from '../lib/context';
import { bucketLabel, fmtDuration, fmtNumber, fmtPct } from '../lib/format';
import { Trend } from './Sparkline';

type Series = 'visitors' | 'revenue' | 'prev';

const COLORS = { visitors: 'rgb(var(--accent))', visitorsFill: 'rgb(var(--accent))', revenue: 'rgb(var(--success))', prev: 'rgb(var(--ink-4))', grid: 'rgb(var(--line))', tick: 'rgb(var(--ink-4))', dot: 'rgb(var(--surface))' };

interface KpiDef {
  key: keyof Kpis;
  label: string;
  value: string;
  invert?: boolean;
  spark?: number[];
  color?: string;
  hint?: string;
}

function KpiCard({ k, cur, prev, selected, onSelect }: { k: KpiDef; cur: number; prev: number; selected: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      title="Afficher la tendance de cet indicateur"
      className={`relative flex min-w-0 cursor-pointer flex-col gap-1.5 px-4 py-4 outline-none transition-colors hover:bg-well/60 focus-visible:bg-well sm:px-5 ${selected ? 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent' : ''}`}
    >
      <span className="flex min-w-0 items-center text-[12px] font-medium text-ink-3"><span className="truncate">{k.label}</span>{k.hint && <InfoTip text={k.hint} label={`Comment est calculé « ${k.label} » ?`} />}</span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="tnum text-[22px] font-semibold leading-7 tracking-tight text-ink sm:text-2xl">{k.value}</span>
        <Trend cur={cur} prev={prev} invert={k.invert} />
      </div>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 divide-line md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="px-4 py-4 sm:px-5">
          <div className="ml-skeleton h-3 w-16" />
          <div className="ml-skeleton mt-3 h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

type Metric = 'visitors' | 'pageviews' | 'revenue' | 'conversionRate' | 'bounceRate' | 'avgDuration' | 'revenuePerVisitor';

export function OverviewCard({ data }: { data: Overview | null }) {
  const { money, site, share } = useDash();
  const [metric, setMetric] = useState<Metric>('visitors');
  const notes = useNotes();
  const annotations = useAnnotations();
  // One marker per bucket: commits (ink) and mentions (accent); listed in the tooltip.
  const annByBucket = useMemo(() => {
    const m = new Map<string, typeof annotations>();
    for (const a of annotations) { const b = bucketOfTs(a.ts, data?.range.granularity ?? 'day', site.timezone); m.set(b, [...(m.get(b) ?? []), a]); }
    return m;
  }, [annotations, data?.range.granularity, site.timezone]);
  const col = COLORS;
  const [hidden, setHidden] = useState<Record<Series, boolean>>({ visitors: false, revenue: false, prev: false });
  const c = data?.current;
  const p = data?.previous;
  const s = data?.series ?? [];
  const hasRevenue = !share?.hideRevenue && !!c && (c.revenue !== 0 || (p?.revenue ?? 0) !== 0);

  const kpis: KpiDef[] = c
    ? ([
        { key: 'visitors', label: 'Visiteurs', value: fmtNumber(c.visitors), spark: s.map((x) => x.visitors), color: 'text-visitors', hint: 'Personnes distinctes (un cookie visiteur first-party par navigateur), robots exclus.' },
        { key: 'pageviews', label: 'Pages vues', value: fmtNumber(c.pageviews), spark: s.map((x) => x.pageviews), color: 'text-brand', hint: 'Chaque page affichée, navigations internes des applications React/Next.js comprises. Les doublons de moins de 1,5 s sont ignorés.' },
        { key: 'revenue', label: 'Revenus', value: money(c.revenue, true), spark: s.map((x) => x.revenue), color: 'text-revenue' },
        { key: 'conversionRate', label: 'Conversion', value: fmtPct(c.conversionRate, c.conversionRate >= 0.1 ? 0 : 2), hint: 'Clients / visiteurs' },
        { key: 'bounceRate', label: 'Taux de rebond', value: fmtPct(c.bounceRate), invert: true, hint: 'Visites d’une seule page, sans clic, vidéo, objectif ni 10 s d’activité' },
        { key: 'avgDuration', label: 'Durée de visite', value: fmtDuration(c.avgDuration), hint: 'Temps moyen passé par visite, onglet visible uniquement.' },
      ] as KpiDef[]).filter((k) => !share?.hideRevenue || (k.key !== 'revenue' && k.key !== 'conversionRate'))
    : [];

  const g = data?.range.granularity ?? 'day';
  const legend: { key: Series; label: string; swatch: string; show: boolean }[] = [
    { key: 'visitors', label: 'Visiteurs', swatch: 'bg-visitors', show: true },
    { key: 'prev', label: 'Période précédente', swatch: 'bg-ink-4', show: true },
    { key: 'revenue', label: 'Revenus', swatch: 'bg-revenue', show: hasRevenue },
  ];

  return (
    <div className="ml-bento overflow-hidden">
      {c && p ? (
        <div className={`grid grid-cols-2 gap-px border-b border-line bg-line ${kpis.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-6"} [&>*]:bg-surface`}>
          {kpis.map((k) => (
            <KpiCard key={k.key} k={k} cur={c[k.key]} prev={p[k.key]} selected={metric === k.key} onSelect={() => setMetric(k.key as Metric)} />
          ))}
        </div>
      ) : (
        <div className="border-b border-line"><KpiSkeleton /></div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div>
            <div className="text-[14px] font-semibold text-ink">{metric === 'visitors' ? `Trafic${hasRevenue ? ' et revenus' : ''}` : TREND[metric].label}</div>
            <div className="text-[12px] text-ink-3">{metric === 'visitors' ? 'Comparé à la période précédente de même durée' : 'Tendance sur la période · touchez un indicateur pour changer'}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {metric !== 'visitors' && <button className="btn-ghost" onClick={() => setMetric('visitors')}>← Trafic</button>}
            {metric === 'visitors' && legend
              .filter((l) => l.show)
              .map((l) => (
                <button
                  key={l.key}
                  onClick={() => setHidden((h) => ({ ...h, [l.key]: !h[l.key] }))}
                  aria-pressed={!hidden[l.key]}
                  className={`flex min-h-[32px] items-center gap-2 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-well ${hidden[l.key] ? 'text-ink-4 line-through' : 'text-ink-2'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${l.swatch} ${hidden[l.key] ? 'opacity-30' : ''}`} />
                  {l.label}
                </button>
              ))}
          </div>
        </div>
        <div className="h-[260px] px-1 pb-3 pt-3 sm:h-[320px] sm:px-3">
          {!data && <div className="ml-skeleton h-full w-full" />}
          {data && metric !== 'visitors' && (
            <TrendChart
              buckets={data.series.map((x) => x.bucket)}
              granularity={g}
              height={240}
              series={[{ key: metric, label: TREND[metric].label, color: TREND[metric].color, values: data.series.map((x) => Number((x as any)[metric] ?? 0)) }]}
              format={(n) => TREND[metric].format(n, money)}
            />
          )}
          {data && metric === 'visitors' && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={col.visitorsFill} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={col.visitorsFill} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={col.grid} />
                <XAxis dataKey="bucket" tickFormatter={(b) => bucketLabel(b, g)} tick={{ fill: col.tick, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
                <YAxis yAxisId="v" tick={{ fill: col.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} tickFormatter={(v) => fmtNumber(v)} />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  tick={{ fill: col.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => money(v, true)}
                  hide={hidden.revenue || !hasRevenue}
                  domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.6))]}
                />
                <Tooltip
                  cursor={{ stroke: 'rgb(var(--line-strong))', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as Overview['series'][0];
                    return (
                      <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[12px] shadow-pop">
                        <div className="mb-2 font-semibold text-ink">{bucketLabel(d.bucket, g, true)}</div>
                        <Row color="bg-visitors" label="Visiteurs" value={fmtNumber(d.visitors)} />
                        {!hidden.prev && <Row color="bg-line-strong" label="Période précédente" value={fmtNumber(d.prevVisitors ?? 0)} />}
                        <Row color="bg-brand" label="Pages vues" value={fmtNumber(d.pageviews)} />
                        {hasRevenue && <Row color="bg-revenue" label="Revenus" value={money(d.revenue)} />}
                        {d.payments > 0 && <Row color="bg-revenueSoft" label="Paiements" value={String(d.payments)} />}
                        {(annByBucket.get(d.bucket) ?? []).slice(0, 3).map((a, i) => (
                          <div key={i} className="mt-1.5 flex max-w-[260px] items-center gap-1.5 border-t border-line pt-1.5 text-ink-2"><AnnotationIcon a={a} /><span className="truncate">{a.title.split('\n')[0]}</span></div>
                        ))}
                        {(annByBucket.get(d.bucket)?.length ?? 0) > 3 && <div className="mt-1 text-ink-4">+{annByBucket.get(d.bucket)!.length - 3} autres</div>}
                      </div>
                    );
                  }}
                />
                {notes.list.map((n) => {
                  const b = bucketOfTs(n.ts, g, site.timezone);
                  return data.series.some((x) => x.bucket === b) ? (
                    <ReferenceLine key={n.id} yAxisId="v" x={b} stroke="rgb(var(--warning))" strokeDasharray="2 3" label={{ value: '●', position: 'top', fill: 'rgb(var(--warning))', fontSize: 10 }} />
                  ) : null;
                })}
                {[...annByBucket.entries()].map(([b, list]) => (data.series.some((x) => x.bucket === b) ? (
                  <ReferenceLine key={'a' + b} yAxisId="v" x={b} stroke={list.some((a) => a.kind === 'commit') ? 'rgb(var(--ink-3))' : 'rgb(var(--accent))'} strokeOpacity={0.55} strokeDasharray="1 3"
                    label={{ value: list.some((a) => a.kind === 'commit') ? '◆' : '◉', position: 'insideTop', fill: list.some((a) => a.kind === 'commit') ? 'rgb(var(--ink-3))' : 'rgb(var(--accent))', fontSize: 9 }} />
                ) : null))}
                {hasRevenue && !hidden.revenue && <Bar yAxisId="r" dataKey="revenue" fill={col.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />}
                {!hidden.prev && (
                  <Line yAxisId="v" type="monotone" dataKey="prevVisitors" stroke={col.prev} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
                )}
                {!hidden.visitors && (
                  <Area
                    yAxisId="v"
                    type="monotone"
                    dataKey="visitors"
                    stroke={col.visitors}
                    strokeWidth={2}
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
        {!share && <NotesBar notes={notes} annotations={annotations} />}
      </div>
    </div>
  );
}

const TREND: Record<Exclude<Metric, 'visitors'>, { label: string; color: string; format: (n: number, money: (m: number, c?: boolean) => string) => string }> = {
  pageviews: { label: 'Pages vues', color: 'rgb(var(--accent))', format: (n) => fmtNumber(n) },
  revenue: { label: 'Revenus', color: 'rgb(var(--success))', format: (n, m) => m(n) },
  conversionRate: { label: 'Taux de conversion', color: 'rgb(var(--success))', format: (n) => fmtPct(n, 2) },
  revenuePerVisitor: { label: 'Revenu par visiteur', color: 'rgb(var(--success))', format: (n, m) => m(n) },
  bounceRate: { label: 'Taux de rebond', color: 'rgb(var(--danger))', format: (n) => fmtPct(n) },
  avgDuration: { label: 'Durée de visite moyenne', color: 'rgb(var(--accent))', format: (n) => fmtDuration(n) },
};

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-0.5">
      <span className="flex items-center gap-2 text-ink-3">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </span>
      <span className="tnum font-medium text-ink">{value}</span>
    </div>
  );
}

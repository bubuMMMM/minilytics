import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { navigate } from '../App';
import { Logo } from '../components/Logo';
import { LiveGlobe } from '../components/LiveGlobe';
import { UiIcon } from '../components/UiIcon';

type Group = { label: string; value: number };
interface LiveData {
  site: { name: string; domain: string };
  days: number;
  updatedAt: number;
  current: { visitors: number; sessions: number; pageviews: number; avgDurationMs: number };
  previous: { visitors: number };
  last24h: { visitors: number };
  online: number;
  goals: number;
  outboundClicks: number;
  series: { date: string; visitors: number; pageviews: number }[];
  sources: Group[];
  pages: Group[];
  devices: Group[];
}

const number = (value: number) => new Intl.NumberFormat('fr-FR').format(value);
const dateLabel = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeLabel = (stamp: number) => new Date(stamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function duration(ms: number) {
  if (!ms) return '0 s';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? seconds + ' s' : Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s';
}

function SectionLabel({ index, label }: { index: string; label: string }) {
  return <div className="ml-kicker"><span className="font-mono text-[#c8a396]">{index} /</span>{label}</div>;
}

function PreviewBars({ series }: { series: LiveData['series'] | undefined }) {
  const days = series?.slice(-12) ?? [];
  const max = Math.max(1, ...days.map((v) => v.visitors));
  return <div className="flex h-[112px] items-end justify-between gap-2 sm:h-[132px]" aria-label="Aperçu des visites journalières">
    {days.length ? days.map((day, i) => (
      <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={dateLabel(day.date) + ' · ' + number(day.visitors) + ' visiteur(s)'}>
        <div className={'w-full rounded-t-[5px] transition-colors ' + (i === days.length - 1 ? 'bg-[#df795c]' : 'bg-[#e9b6a2] group-hover:bg-[#dd9579]')} style={{ height: (Math.max(3, day.visitors / max * 100)) + '%', minHeight: 3 }} />
      </div>
    )) : Array.from({ length: 12 }, (_, i) => <div key={i} className="ml-loading h-12 flex-1 rounded-t-[5px]" />)}
  </div>;
}

function Breakdown({ title, detail, icon, rows, empty }: { title: string; detail: string; icon: 'link' | 'layers' | 'eye'; rows: Group[]; empty: string }) {
  const largest = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <section className="ml-panel flex h-full min-w-0 flex-col p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-[17px] font-semibold tracking-[-.025em]">{title}</h3><p className="mt-1 text-xs text-[#9c958d]">{detail}</p></div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#f1e8e0] bg-[#fcf7f2] text-[#b97b62]"><UiIcon name={icon} size={19} /></div>
      </div>
      <div className="mt-7 flex-1 space-y-[18px]">
        {rows.length ? rows.slice(0, 6).map((r, i) => (
          <div key={r.label + i}>
            <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-medium text-[#46403b]" title={r.label}>{r.label}</span>
              <span className="flex shrink-0 items-center gap-3 tabular-nums"><span className="text-[#b1a9a0]">{total ? Math.round(r.value / total * 100) : 0}%</span><span className="min-w-[19px] text-right font-semibold">{number(r.value)}</span></span>
            </div>
            <div className="ml-progress"><div style={{ width: Math.max(2, r.value / largest * 100) + '%' }} /></div>
          </div>
        )) : <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#eee7df] bg-[#fcfaf8] p-6 text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f3eae2] text-[#af8b75]"><UiIcon name="bar-chart" size={18}/></span>
          <p className="max-w-[195px] text-[13px] leading-relaxed text-[#958c83]">{empty}</p>
        </div>}
      </div>
      <div className="mt-7 flex items-center justify-between border-t border-[#f2eeea] pt-4 text-[11px] font-medium text-[#a49b93]"><span>Répartition du trafic</span><span>Données réelles</span></div>
    </section>
  );
}

export function PublicDemo() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(() => setRetry((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch('/api/public/demo?days=' + days, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error('Statistiques temporairement indisponibles (' + r.status + ').'); return r.json() as Promise<LiveData>; })
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message || 'Impossible de récupérer les statistiques.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, retry]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const view = data?.days === days ? data : null;
  const change = view?.previous.visitors ? Math.round(((view.current.visitors - view.previous.visitors) / view.previous.visitors) * 100) : null;
  const metrics = [
    { label: 'Visiteurs uniques', value: view ? number(view.current.visitors) : '—', detail: 'Personnes distinctes', icon: 'users' as const, index: '01' },
    { label: 'Pages vues', value: view ? number(view.current.pageviews) : '—', detail: 'Pages consultées', icon: 'eye' as const, index: '02' },
    { label: 'Sessions', value: view ? number(view.current.sessions) : '—', detail: 'Visites enregistrées', icon: 'layers' as const, index: '03' },
    { label: 'Temps moyen', value: view ? duration(view.current.avgDurationMs) : '—', detail: 'Durée par session', icon: 'clock' as const, index: '04' },
  ];

  return (
    <div className="ml-site-bg min-h-screen text-[#26221e]">
      <header className="sticky top-0 z-50 border-b border-[#ebe6e0]/85 bg-[#faf9f6]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[75px] max-w-[1380px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <a href="/" aria-label="Minilytics — Accueil" className="shrink-0"><Logo /></a>
          <nav aria-label="Navigation principale" className="hidden items-center gap-8 text-[13px] font-medium text-[#77716b] lg:flex">
            <a href="#analytics" className="transition hover:text-[#26221e]">Vue d'ensemble</a>
            <a href="#live-globe" className="transition hover:text-[#26221e]">Globe en direct</a>
            <a href="#insights" className="transition hover:text-[#26221e]">Insights</a>
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-2 text-[12px] font-medium text-[#888076] md:flex"><span className="h-2 w-2 rounded-full bg-[#4ba886] shadow-[0_0_0_4px_#e2f3ea]" />Live demo</span>
            <button onClick={() => navigate('/admin')} className="btn-dark h-10 px-3.5 sm:px-5">Espace privé <UiIcon name="arrow-up-right" size={16}/></button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1380px] items-center gap-10 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-20 lg:px-12 lg:pb-24 lg:pt-24">
          <div className="relative z-10">
            <div className="ml-kicker mb-6"><span className="ml-dot" /> LE TRAFIC. SANS LE BRUIT.</div>
            <h1 className="ml-heading max-w-[770px] text-[clamp(3.35rem,7vw,6.3rem)]">
              Comprends<br />chaque <span className="relative whitespace-nowrap text-[#dc795b]">visite<span className="absolute bottom-[-.08em] left-0 h-[.055em] w-full rounded-full bg-[#f1c4b0]" /></span><span className="text-[#dc795b]">.</span>
            </h1>
            <p className="mt-7 max-w-[510px] text-[15px] leading-[1.85] text-[#746e68] sm:text-[17px]">Des chiffres clairs. Des visiteurs bien réels. Découvre d'où vient ton audience, ce qu'elle regarde et ce qui la fait agir — sans te perdre dans tes données.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#analytics" className="btn-dark h-[51px] px-6">Explorer le dashboard <UiIcon name="arrow-right" size={17}/></a>
              <button className="btn h-[51px] px-6" onClick={() => navigate('/admin')}>Connecter mon site <UiIcon name="arrow-up-right" size={16}/></button>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#e9e3dc] pt-6 text-[12px] font-medium text-[#887f77]">
              <span className="flex items-center gap-2"><UiIcon name="check" size={15} className="text-[#d07d61]" /> Données réelles</span>
              <span className="flex items-center gap-2"><UiIcon name="refresh" size={15} className="text-[#d07d61]" /> Actualisation auto</span>
              <span className="flex items-center gap-2"><UiIcon name="shield" size={15} className="text-[#d07d61]" /> Lecture seule</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[580px] lg:ml-auto" aria-label="Aperçu du trafic réel de Minilytics">
            <div className="ml-hero-signal pointer-events-none absolute inset-[-52px] hidden opacity-70 sm:block" />
            <div className="ml-hero-panel relative overflow-hidden p-5 sm:p-7">
              <div className="ml-hero-grid pointer-events-none absolute right-0 top-0 h-48 w-full opacity-75" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#fff0e8] text-[#dc795b]"><UiIcon name="activity" size={20}/></span>
                  <div><p className="text-[13px] font-semibold">Minilytics en direct</p><p className="mt-1 text-[11px] text-[#a3988f]">minilytics-six.vercel.app</p></div>
                </div>
                <span className="rounded-full border border-[#dceee5] bg-[#eff9f2] px-3 py-1.5 text-[11px] font-semibold text-[#3e9a72]"><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#45b68a]" />LIVE</span>
              </div>
              <div className="relative mt-8 flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-[12px] font-medium text-[#92887e]">Visiteurs uniques · {days} jours</p><div className="mt-1 flex items-end gap-3"><p className="text-[clamp(3.2rem,6vw,4.4rem)] font-semibold leading-none tracking-[-.075em]">{view ? number(view.current.visitors) : '—'}</p>{change !== null && <span className={'mb-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ' + (change >= 0 ? 'bg-[#e5f5e9] text-[#43865a]' : 'bg-[#fbe9e4] text-[#b6644d]')}>{change >= 0 ? '+' : ''}{change}%</span>}</div></div>
                <span className="rounded-lg border border-[#eee9e3] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#887e74]">Période réelle</span>
              </div>
              <div className="relative mt-8 border-b border-[#ede7e1] pb-4"><PreviewBars series={view?.series} /><div className="mt-2 flex justify-between text-[10px] text-[#aaa097]"><span>{view?.series[0] ? dateLabel(view.series[0].date) : 'Début'}</span><span>{view?.series.at(-1) ? dateLabel(view.series[view.series.length - 1].date) : 'Aujourd’hui'}</span></div></div>
              <div className="relative mt-5 grid grid-cols-3 divide-x divide-[#eee9e3]">
                {[
                  ['Actifs', view?.online ?? null],
                  ['24 heures', view?.last24h.visitors ?? null],
                  ['Sessions', view?.current.sessions ?? null],
                ].map(([label, value]) => <div key={String(label)} className="px-3 text-center first:pl-0 last:pr-0"><p className="text-[11px] text-[#9d9187]">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{value === null ? '—' : number(Number(value))}</p></div>)}
              </div>
            </div>
            <div className="absolute -bottom-5 -right-2 hidden items-center gap-2 rounded-xl border border-[#e9e4de] bg-white px-4 py-3 text-[12px] font-semibold text-[#7e756d] shadow-[0_12px_28px_rgba(50,36,25,.09)] sm:flex"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff1e9] text-[#d9805f]"><UiIcon name="sparkles" size={16}/></span> De la donnée, pas des suppositions.</div>
          </div>
        </section>

        <section id="analytics" className="scroll-mt-[100px] border-t border-[#eae5df] bg-[#f6f4f0]/70 py-16 sm:py-20">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8 lg:px-12">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <SectionLabel index="01" label="VUE D'ENSEMBLE" />
                <h2 className="ml-section-heading mt-3 text-[clamp(2rem,4vw,3rem)]">Les chiffres qui comptent<span className="text-[#e07b5f]">.</span></h2>
                <p className="mt-3 max-w-[630px] text-[14px] leading-relaxed text-[#8a827a]">Voici les vraies données collectées sur ce site. Pas de démonstration fictive.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#e2dbd4] bg-white px-3 py-2 text-[12px] font-medium text-[#857c73]"><UiIcon name="shield" size={15} /> Données publiques en lecture seule</span>
            </div>

            <div className="ml-panel mt-9 flex flex-wrap items-center justify-between gap-4 p-3 sm:px-5 sm:py-3.5">
              <div className="flex min-w-0 items-center gap-3 pl-1">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f5ece5] text-[#cd7c5e]"><UiIcon name="globe" size={20}/></span>
                <div className="min-w-0"><p className="truncate text-[13px] font-semibold">minilytics-six.vercel.app</p><p className="mt-0.5 text-[11px] text-[#a0978f]">Site suivi · Actualisé {view ? 'à ' + timeLabel(view.updatedAt) : 'automatiquement'}</p></div>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="inline-flex rounded-xl border border-[#ece6df] bg-[#f8f6f3] p-1" aria-label="Période des statistiques">
                  {([7,30] as const).map((d) => <button key={d} className={'rounded-[9px] px-4 py-2.5 text-[12px] font-semibold transition ' + (days === d ? 'ml-pill-active' : 'ml-pill')} aria-pressed={days === d} onClick={() => setDays(d)}>{d} jours</button>)}
                </div>
                <button className="btn h-[43px] w-[43px] !px-0" onClick={refresh} disabled={loading} aria-label="Actualiser les données" title="Actualiser les données"><UiIcon name="refresh" size={17} className={loading ? 'animate-spin' : ''}/></button>
              </div>
            </div>
            {error && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f3b5a0] bg-[#fff5f0] p-4 text-sm text-[#a65338]"><span>{error} {data ? 'Les dernières données restent affichées.' : ''}</span><button className="btn" onClick={refresh}>Réessayer</button></div>}

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-busy={loading}>
              {metrics.map((metric) => <div key={metric.label} className="ml-metric ml-panel min-w-0 p-4 sm:p-6">
                <div className="flex items-start justify-between gap-2"><span className="text-[11px] font-semibold text-[#9c938a] sm:text-[13px]">{metric.label}</span><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#fbf1ec] text-[#cc8268]"><UiIcon name={metric.icon} size={18}/></span></div>
                <div className="mt-5 truncate text-[clamp(1.85rem,3vw,2.65rem)] font-semibold leading-none tracking-[-.055em] tabular-nums">{metric.value}</div>
                <div className="mt-5 flex items-center justify-between gap-1 border-t border-[#f3efeb] pt-3.5"><span className="truncate text-[11px] text-[#a59d95]">{metric.detail}</span><span className="font-mono text-[10px] text-[#d0c3b8]">{metric.index}</span></div>
              </div>)}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.75fr)]">
              <section className="ml-panel min-w-0 p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-semibold tracking-tight">Évolution du trafic</h3><p className="mt-1.5 text-[12px] text-[#aaa097]">Visiteurs uniques par jour · UTC</p></div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#fff1e9] px-3 py-1.5 text-[11px] font-semibold text-[#c8795d]"><span className="h-2 w-2 rounded-full bg-[#df795c]" />{change === null ? 'Première période suivie' : (change >= 0 ? '+' : '') + change + '% vs période précédente'}</span>
                </div>
                <div className="mt-6 h-[235px] sm:h-[300px]">
                  {view ? <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={view.series} margin={{ top: 9, right: 5, left: -24, bottom: 0 }}>
                      <defs><linearGradient id="ml-gradient-views" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e18567" stopOpacity=".3"/><stop offset="100%" stopColor="#e18567" stopOpacity=".01"/></linearGradient></defs>
                      <CartesianGrid stroke="#eee9e4" strokeDasharray="3 5" vertical={false}/>
                      <XAxis dataKey="date" tickFormatter={dateLabel} tick={{fontSize:11,fill:'#aea49b'}} axisLine={false} tickLine={false} minTickGap={19}/>
                      <YAxis allowDecimals={false} tick={{fontSize:11,fill:'#aea49b'}} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: '#292622', border: 0, borderRadius: 12, color: '#fff', boxShadow:'0 12px 35px rgba(0,0,0,.12)' }} labelStyle={{color:'#eedbd0'}} labelFormatter={(v) => dateLabel(String(v))} formatter={(value) => [number(Number(value ?? 0)), 'Visiteurs']}/>
                      <Area type="monotone" dataKey="visitors" stroke="#e07b5f" strokeWidth={2.8} fill="url(#ml-gradient-views)" dot={false} activeDot={{r:5,fill:'#e07b5f',stroke:'white',strokeWidth:2}} isAnimationActive={false}/>
                    </AreaChart>
                  </ResponsiveContainer> : <div className="ml-loading h-full rounded-xl" />}
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-[#f3eeea] pt-4 text-[11px] text-[#a19990]"><span className="h-2 w-2 rounded-full bg-[#e07b5f]" />Visiteurs uniques <span className="ml-auto">Période : {days} jours</span></div>
              </section>

              <section className="ml-panel flex min-w-0 flex-col p-5 sm:p-7">
                <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight">Activité récente</h3><p className="mt-1.5 text-[12px] text-[#aaa097]">Les signaux en un coup d'œil</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#f1f8f3] text-[#52a17a]"><UiIcon name="activity" size={19}/></div></div>
                <div className="mt-7 flex-1 divide-y divide-[#f1ece7]">
                  {[
                    { label: 'Visiteurs · 24 h', value: view?.last24h.visitors ?? null, icon: 'users' as const },
                    { label: 'Clics sortants', value: view?.outboundClicks ?? null, icon: 'mouse' as const },
                    { label: 'Objectifs atteints', value: view?.goals ?? null, icon: 'target' as const },
                  ].map((item) => <div key={item.label} className="flex items-center justify-between gap-3 py-5 first:pt-0"><div className="flex items-center gap-2.5 text-[12px] font-medium text-[#746c65] sm:text-[13px]"><UiIcon name={item.icon} size={16} className="text-[#bc9885]"/>{item.label}</div><span className="text-2xl font-semibold tabular-nums tracking-[-.045em]">{item.value === null ? '—' : number(item.value)}</span></div>)}
                </div>
                <div className="mt-4 rounded-2xl border border-[#f2e5db] bg-[#fcf5ee] p-4"><div className="flex gap-2.5"><UiIcon name="shield" size={17} className="mt-0.5 shrink-0 text-[#c5886d]"/><p className="text-[12px] leading-[1.65] text-[#926f5d]">Les visites bloquées par un navigateur ou un bloqueur de publicité peuvent ne pas être comptabilisées.</p></div></div>
              </section>
            </div>
          </div>
        </section>

        <section id="live-globe" className="scroll-mt-[100px] bg-[#faf9f6] py-16 sm:py-20">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8 lg:px-12">
            <SectionLabel index="02" label="DANS LE MONDE" />
            <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
              <div><h2 className="ml-section-heading mt-3 text-[clamp(2rem,4vw,3rem)]">Ton audience, sans frontières<span className="text-[#e07b5f]">.</span></h2><p className="mt-3 max-w-[620px] text-[14px] leading-relaxed text-[#8b8179]">Voyage d'un pays à l'autre et repère les nouvelles connexions sur le globe. Les positions sont approximatives pour préserver la confidentialité.</p></div>
              <span className="flex items-center gap-2 rounded-full border border-[#ddede4] bg-[#f0f8f3] px-4 py-2 text-[12px] font-semibold text-[#448b66]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#5cb78b]" /> En temps réel</span>
            </div>
            <div className="ml-live-globe"><LiveGlobe /></div>
          </div>
        </section>

        <section id="insights" className="scroll-mt-[100px] bg-[#f6f4f0]/70 py-16 sm:py-20">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-8 lg:px-12">
            <SectionLabel index="03" label="LES INSIGHTS" />
            <div className="mb-8 flex flex-wrap items-end justify-between gap-6"><div><h2 className="ml-section-heading mt-3 text-[clamp(2rem,4vw,3rem)]">L'histoire derrière les chiffres<span className="text-[#e07b5f]">.</span></h2><p className="mt-3 max-w-[620px] text-[14px] leading-relaxed text-[#8b8179]">Les sources qui attirent, les pages qui retiennent et les appareils utilisés par ton audience.</p></div><div className="rounded-full border border-[#e7ded6] bg-white px-4 py-2 text-[12px] font-medium text-[#897f76]">{days} derniers jours</div></div>
            <div className="grid gap-4 md:grid-cols-3">
              <Breakdown title="D'où ils viennent" detail="Canaux d'acquisition" icon="link" rows={view?.sources ?? []} empty="Les premières sources s'afficheront à l'arrivée des visiteurs."/>
              <Breakdown title="Ce qu'ils regardent" detail="Pages les plus consultées" icon="eye" rows={view?.pages ?? []} empty="Les pages populaires apparaîtront avec les premières visites."/>
              <Breakdown title="Comment ils naviguent" detail="Répartition par appareil" icon="layers" rows={view?.devices ?? []} empty="La répartition des appareils apparaîtra bientôt."/>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="ml-cta relative overflow-hidden rounded-[26px] px-7 py-10 text-white sm:px-12 sm:py-14 lg:px-16">
            <div className="ml-cta-ring pointer-events-none" />
            <div className="relative z-10 max-w-[700px]">
              <span className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#f3a789]">À TON TOUR</span>
              <h2 className="ml-section-heading mt-4 text-[clamp(2.15rem,4.4vw,3.6rem)]">Ton prochain déclic commence par une donnée.</h2>
              <p className="mt-5 max-w-[520px] text-[14px] leading-[1.75] text-[#bebbb8] sm:text-[15px]">Branche ton site, laisse tourner Minilytics et comprends enfin ce qui transforme une visite en opportunité.</p>
              <button onClick={() => navigate('/admin')} className="mt-8 inline-flex h-[51px] items-center justify-center gap-2 rounded-xl bg-[#df795c] px-6 text-[13px] font-semibold text-white shadow-[0_8px_20px_rgba(223,121,92,.15)] transition hover:bg-[#c96d52]">Connecter mon site <UiIcon name="arrow-up-right" size={17}/></button>
            </div>
          </div>
          <footer className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-[#eae5df] pt-7 text-[12px] text-[#9e948b]"><Logo small /><span>Des chiffres qui ont du sens. © {new Date().getFullYear()} Minilytics.</span><span>{view ? 'Mis à jour à ' + timeLabel(view.updatedAt) : 'Données en cours de chargement'}</span></footer>
        </section>
      </main>
    </div>
  );
}

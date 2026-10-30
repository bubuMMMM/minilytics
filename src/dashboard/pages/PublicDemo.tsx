import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Thumb, fmtWatch } from '../components/VideosView';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { navigate } from '../App';
import { Logo } from '../components/Logo';
import { LiveGlobe } from '../components/LiveGlobe';
import { EngagementPanel } from '../components/EngagementPanel';
import { MetricTile, SegmentedTabs, StatusPill } from '../components/StudioUI';
import { UiIcon } from '../components/UiIcon';

type Group = { label: string; value: number };
interface LiveData {
  site: { id?: string; name: string; domain: string };
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

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const dateLabel = (value: string) => new Date(value + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeLabel = (value: number) => new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
};

function InsightPanel({ title, subtitle, icon, rows, empty }: { title: string; subtitle: string; icon: 'link'|'eye'|'layers'; rows: Group[]; empty: string }) {
  const highest = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <article className="ml-bento flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div><h3 className="text-[15px] font-semibold tracking-tight text-[#182238]">{title}</h3><p className="mt-1 text-xs text-[#8c9ab0]">{subtitle}</p></div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f5ff] text-[#596af0]"><UiIcon name={icon} size={18}/></span>
      </div>
      <div className="mt-6 flex-1 space-y-5">
        {rows.length ? rows.slice(0, 6).map((row, index) => <div key={row.label + index}>
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-[#46546c]" title={row.label}>{row.label}</span><span className="shrink-0 tabular-nums text-[#7c8aa2]">{nf(row.value)} <span className="ml-1 text-[#b1bdcf]">/ {total ? Math.round(row.value / total * 100) : 0}%</span></span></div>
          <div className="ml-progress"><div style={{width: Math.max(2, row.value / highest * 100) + '%'}} /></div>
        </div>) : <div className="flex min-h-[130px] flex-col items-center justify-center rounded-xl border border-dashed border-[#e4eaf5] bg-[#fafbff] p-5 text-center"><UiIcon name={icon} size={22} className="mb-3 text-[#b1c0e1]"/><p className="max-w-[230px] text-xs leading-relaxed text-[#95a2b7]">{empty}</p></div>}
      </div>
      <div className="mt-7 border-t border-[#edf0f6] pt-4 text-[11px] text-[#a2adbd]">Sur la période sélectionnée</div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <span className="ml-mini-label text-[#5870e8]">{eyebrow}</span>
      <h2 className="ml-section-head mt-2 text-[#111c35]">{title}</h2>
      <p className="mt-2 max-w-[620px] text-[13px] leading-relaxed text-[#8390a5]">{description}</p>
    </div>
    {action}
  </div>;
}

export function PublicDemo() {
  const [days, setDays] = useState<7|30>(7);
  const [data, setData] = useState<LiveData|null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [sites, setSites] = useState<{id:string;name:string;domain:string}[]>([]);
  const [siteId, setSiteId] = useState<string>(() => new URLSearchParams(window.location.search).get('site') || '');
  useEffect(() => {
    fetch('/api/public/sites', { cache: 'no-store' }).then(r => (r.ok ? r.json() : []) as Promise<{id:string;name:string;domain:string}[]>).then(list => {
      setSites(list);
      setSiteId(current => current && list.some(s => s.id === current) ? current : (list[0]?.id || ''));
    }).catch(() => {});
  }, []);
  const pickSite = (id: string) => {
    setSiteId(id); setData(null);
    const url = new URL(window.location.href); url.searchParams.set('site', id); window.history.replaceState(null, '', url.toString());
  };
  const [vids, setVids] = useState<{ siteId: string; totals: { plays: number; viewers: number; watchSeconds: number; completionRate: number }; videos: { id: string; title: string | null; channel: string | null; plays: number; viewers: number; watchSeconds: number; avgWatchSeconds: number; completionRate: number }[] } | null>(null);
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    fetch('/api/public/videos?days=' + days + '&site=' + encodeURIComponent(siteId), { signal: controller.signal, cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then((v: any) => { if (!controller.signal.aborted) setVids(v ? { siteId, ...(v as any) } : null); }).catch(() => {});
    return () => controller.abort();
  }, [siteId, days, reload]);
  const refresh = useCallback(() => setReload(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if(!siteId){return () => controller.abort();}
    setBusy(true);setError('');
    fetch('/api/public/demo?days=' + days + '&site=' + encodeURIComponent(siteId), { signal: controller.signal, cache: 'no-store' })
      .then(async r => {if(!r.ok) throw new Error('Statistiques indisponibles (' + r.status + ')');return r.json() as Promise<LiveData>;})
      .then(value => {if(!controller.signal.aborted)setData(value);})
      .catch((e: Error) => {if(!controller.signal.aborted)setError(e.message || 'Erreur de chargement.');})
      .finally(() => {if(!controller.signal.aborted)setBusy(false);});
    return () => controller.abort();
  }, [days, reload, siteId]);
  useEffect(() => {const t=window.setInterval(() => {if(document.visibilityState==='visible')refresh();},30000);return () => window.clearInterval(t);},[refresh]);
  const view = data?.days===days && (!data?.site?.id || data.site.id===siteId) ? data : null;
  const visitorSeries = view?.series.map(d=>d.visitors) || [];
  const pageSeries = view?.series.map(d=>d.pageviews) || [];
  const change = view?.previous.visitors ? Math.round((view.current.visitors-view.previous.visitors)/view.previous.visitors*100) : null;

  return <div className="min-h-screen bg-white text-[#111827]">
    <header className="sticky top-0 z-50 border-b border-[#ecf0f6] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1370px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <a href="/" aria-label="Minilytics — accueil"><Logo /></a>
        <nav className="hidden items-center gap-8 text-[13px] font-medium text-[#7a889e] lg:flex" aria-label="Navigation principale">
          <a href="#analytics" className="hover:text-[#4f62ef]">Dashboard</a>
          <a href="#globe" className="hover:text-[#4f62ef]">Live Globe</a>
          <a href="#insights" className="hover:text-[#4f62ef]">Insights</a>
          <a href="#engagement" className="hover:text-[#4f62ef]">Comportement</a>
          {vids && vids.videos.length > 0 && <a href="#videos" className="hover:text-[#4f62ef]">Vidéos</a>}
        </nav>
        <div className="flex items-center gap-2.5">
          <span className="hidden md:inline-flex"><StatusPill active>Démo en direct</StatusPill></span>
          <button onClick={()=>navigate('/admin')} className="btn-dark h-[42px] px-4">Ouvrir mon espace <UiIcon name="arrow-up-right" size={16}/></button>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1370px] px-5 pb-14 sm:px-8 lg:px-10">
      <section className="grid items-center gap-10 border-b border-[#ecf0f6] pb-14 pt-14 lg:grid-cols-[1.08fr_.92fr] lg:gap-14 lg:pb-20 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e8edff] bg-[#f7f8ff] px-3 py-2 text-[11px] font-semibold text-[#586ae8]"><UiIcon name="sparkles" size={15}/> Analytics nouvelle génération <span className="ml-1 text-[#bac4e6]">/ 2026</span></span>
          <h1 className="mt-7 max-w-[730px] text-[clamp(3rem,6.8vw,5.95rem)] font-semibold leading-[1.025] tracking-[-.073em] text-[#101a32]">Vos données.<br/><span className="text-[#4f62ef]">Enfin claires.</span></h1>
          <p className="mt-6 max-w-[530px] text-[15px] leading-[1.85] text-[#748197] sm:text-[17px]">Comprenez qui visite votre site, d'où vient votre trafic et ce qui fonctionne. Un tableau de bord précis, épuré et vivant.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#analytics" className="btn-dark !h-[49px] !px-5">Explorer les statistiques <UiIcon name="arrow-right" size={17}/></a>
            <a href="#globe" className="btn !h-[49px] !px-5"><UiIcon name="globe" size={17}/> Voir le globe live</a>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-medium text-[#8290a5]"><span className="inline-flex items-center gap-2"><UiIcon name="check" size={16} className="text-[#1faf8b]"/> Des données réelles</span><span className="inline-flex items-center gap-2"><UiIcon name="refresh" size={16} className="text-[#5f74e9]"/> Mis à jour automatiquement</span></div>
        </div>

        <div className="relative min-w-0 lg:pl-4">
          <div className="absolute -left-4 -right-4 -top-4 -bottom-4 rounded-[32px] bg-[#f8faff] lg:-left-0"/>
          <div className="ml-bento relative overflow-hidden bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 border-b border-[#edf0f7] pb-5">
              <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef1ff] text-[#5064ec]"><UiIcon name="activity" size={19}/></span><div><div className="text-[13px] font-semibold">Aperçu en direct</div><p className="text-[11px] text-[#a0aec0]">{view?.site.domain ?? sites.find(s=>s.id===siteId)?.domain ?? '—'}</p></div></div>
              <StatusPill active>LIVE</StatusPill>
            </div>
            <div className="mt-7">
              <p className="text-[12px] font-medium text-[#8190a6]">Visiteurs uniques · {days} derniers jours</p>
              <div className="mt-2 flex flex-wrap items-end gap-3"><span className="text-[clamp(3.4rem,6vw,5.2rem)] font-semibold leading-none tracking-[-.083em] tabular-nums text-[#131e35]">{view?nf(view.current.visitors):'—'}</span>{change!==null&&<span className={'mb-2 rounded-lg px-2 py-1 text-xs font-semibold '+(change>=0?'bg-[#ebfbf5] text-[#169469]':'bg-[#fff2f2] text-[#c3525f]')}>{change>=0?'+':''}{change}%</span>}</div>
            </div>
            <div className="relative mt-6 h-[150px] sm:h-[175px]">
              {view ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={view.series} margin={{top:8,right:0,left:0,bottom:2}}>
                <defs><linearGradient id="preview-blue" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7186f9" stopOpacity=".25"/><stop offset="100%" stopColor="#7186f9" stopOpacity="0"/></linearGradient></defs>
                <Area type="monotone" dataKey="visitors" stroke="#5065ef" strokeWidth={2.7} fill="url(#preview-blue)" dot={false} activeDot={{r:4}} isAnimationActive={false}/>
              </AreaChart></ResponsiveContainer> : <div className="ml-loading h-full rounded-xl"/>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[#edf0f7] pt-5">
              {[
                { label: 'En ligne',value:view?.online??null },
                { label: '24 heures',value:view?.last24h.visitors??null },
                { label: 'Sessions',value:view?.current.sessions??null },
              ].map(item=><div key={item.label} className="border-r border-[#edf0f7] last:border-none"><p className="text-[11px] text-[#9aa8bc]">{item.label}</p><p className="mt-1 text-xl font-semibold tracking-[-.04em] tabular-nums">{item.value===null?'—':nf(item.value)}</p></div>)}
            </div>
          </div>
          <span className="absolute -bottom-5 right-4 hidden items-center gap-2 rounded-xl border border-[#e8edf7] bg-white px-4 py-3 text-[11px] font-semibold text-[#586b8b] shadow-[0_9px_25px_rgba(28,47,99,.065)] sm:flex"><UiIcon name="shield" size={16} className="text-[#5268ee]"/> Pas de trafic fictif</span>
        </div>
      </section>

      <section id="analytics" className="scroll-mt-[104px] pt-16 sm:pt-20">
        <SectionHeading eyebrow="01 / OVERVIEW" title="Votre tableau de bord" description="Toutes les métriques importantes, en un coup d'œil." action={<StatusPill active>Statistiques réelles</StatusPill>}/>
        <div className="ml-bento flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] text-[#5165e7]"><UiIcon name="globe" size={20}/></span><div className="min-w-0">{sites.length>1 ? <select aria-label="Site affiché" className="max-w-[260px] truncate rounded-lg border border-[#e3e8f3] bg-white px-2 py-1 text-[13px] font-semibold text-[#1d2b45]" value={siteId} onChange={e=>pickSite(e.target.value)}>{sites.map(s=><option key={s.id} value={s.id}>{s.domain}{s.name!==s.domain?' · '+s.name:''}</option>)}</select> : <div className="truncate text-[13px] font-semibold">{view?.site.domain ?? '—'}</div>}<div className="mt-0.5 text-[11px] text-[#9ba8bb]">Dernière actualisation {view?timeLabel(view.updatedAt):'en cours...'}</div></div></div>
          <div className="flex items-center gap-2"><SegmentedTabs value={days} options={[{value:7,label:'7 jours'},{value:30,label:'30 jours'}]} onChange={setDays} label="Période analysée"/><button className="btn !h-[40px] !w-[40px] !p-0" aria-label="Rafraîchir les données" onClick={refresh} disabled={busy}><UiIcon name="refresh" size={17} className={busy?'animate-spin':''}/></button></div>
        </div>
        {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="btn" onClick={refresh}>Réessayer</button></div>}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-busy={busy}>
          <MetricTile focus label="Visiteurs uniques" value={view?nf(view.current.visitors):'—'} caption={'Sur '+days+' jours'} icon="users" number="01" series={visitorSeries}/>
          <MetricTile label="Pages vues" value={view?nf(view.current.pageviews):'—'} caption="Pages consultées" icon="eye" number="02" series={pageSeries}/>
          <MetricTile label="Sessions" value={view?nf(view.current.sessions):'—'} caption="Visites enregistrées" icon="layers" number="03"/>
          <MetricTile label="Durée moyenne" value={view?duration(view.current.avgDurationMs):'—'} caption="Temps par session" icon="clock" number="04"/>
        </div>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.82fr)]">
          <div className="ml-bento min-w-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-[16px] font-semibold tracking-tight">Évolution du trafic</h3><p className="mt-1 text-xs text-[#96a3b6]">Visiteurs uniques par jour · UTC</p></div><span className="inline-flex items-center gap-2 rounded-full bg-[#f1f4ff] px-3 py-1.5 text-xs font-semibold text-[#6071d8]"><i className="h-2 w-2 rounded-full bg-[#5166f1]"/>Visiteurs</span></div>
            <div className="mt-7 h-[265px] sm:h-[320px]">
              {view?<ResponsiveContainer width="100%" height="100%"><AreaChart data={view.series} margin={{top:8,right:8,left:-23,bottom:0}}>
                <defs><linearGradient id="analytics-blue" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5b75ef" stopOpacity=".23"/><stop offset="100%" stopColor="#5b75ef" stopOpacity="0"/></linearGradient></defs>
                <CartesianGrid stroke="#eef2f8" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="date" tickFormatter={dateLabel} tick={{fontSize:11,fill:'#9caabd'}} axisLine={false} tickLine={false} minTickGap={20}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:'#9caabd'}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{border:'1px solid #e5eaf3',borderRadius:12,boxShadow:'0 12px 38px rgba(28,44,88,.09)',color:'#233048'}} labelFormatter={v=>dateLabel(String(v))} formatter={value=>[nf(Number(value??0)),'Visiteurs']}/>
                <Area type="monotone" dataKey="visitors" stroke="#4f62ef" strokeWidth={2.7} fill="url(#analytics-blue)" dot={false} activeDot={{r:5,stroke:'#fff',strokeWidth:2}} isAnimationActive={false}/>
              </AreaChart></ResponsiveContainer>:<div className="ml-loading h-full rounded-xl"/>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#edf0f6] pt-4 text-[11px] text-[#9aa7ba]"><span>Données collectées en continu</span><span>{days} jours sélectionnés</span></div>
          </div>
          <div className="ml-bento min-w-0 p-5 sm:p-7">
            <div className="flex items-center justify-between"><div><h3 className="text-[16px] font-semibold tracking-tight">Temps réel</h3><p className="mt-1 text-xs text-[#96a3b6]">Activité du site</p></div><StatusPill active>EN DIRECT</StatusPill></div>
            <div className="relative mt-6 overflow-hidden rounded-[16px] border border-[#e8ecff] bg-[#f7f9ff] px-5 py-6">
              <span className="text-xs font-medium text-[#8592ad]">Visiteurs actifs maintenant</span><p className="mt-1 flex items-center gap-3 text-[58px] font-semibold leading-tight tracking-[-.07em] tabular-nums text-[#1f2d7d]"><span className="ml-dot-live"/>{view?nf(view.online):'—'}</p>
              <span className="text-[11px] text-[#9ba9c2]">Sur les 5 dernières minutes</span>
              <div className="pointer-events-none absolute -bottom-8 -right-4 h-[155px] w-[155px] rounded-full border-[18px] border-[#e7ecff] opacity-80"/>
            </div>
            <div className="mt-5 divide-y divide-[#edf0f6]">
              {[
                {label:'Visiteurs · 24 heures',value:view?.last24h.visitors??null,icon:'users' as const},
                {label:'Clics sortants',value:view?.outboundClicks??null,icon:'mouse' as const},
                {label:'Objectifs atteints',value:view?.goals??null,icon:'target' as const},
              ].map(item=><div key={item.label} className="flex items-center justify-between gap-4 py-4"><span className="flex items-center gap-2.5 text-[12px] text-[#758299]"><UiIcon name={item.icon} size={17} className="text-[#7181e4]"/>{item.label}</span><span className="text-[18px] font-semibold tabular-nums text-[#1d2b45]">{item.value===null?'—':nf(item.value)}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      {vids && vids.siteId === siteId && vids.videos.length > 0 && <section id="videos" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="VIDÉOS / VISIONNAGE" title="Les vidéos les plus regardées." description={`${nf(vids.totals.plays)} lectures · ${nf(vids.totals.viewers)} spectateurs · ${fmtWatch(vids.totals.watchSeconds)} de visionnage · ${Math.round(vids.totals.completionRate * 100)} % de complétion, sur ${days} jours. Chiffres agrégés uniquement.`}/>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {vids.videos.slice(0, 8).map((v, i) => <div key={v.id} className="ml-bento overflow-hidden p-3">
            <div className="relative"><Thumb id={v.id} className="aspect-video w-full"/><span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#1d2b45]">#{i + 1}</span></div>
            <div className="mt-3 line-clamp-2 text-[13px] font-semibold leading-snug text-[#1d2b45]">{v.title ?? v.id}</div>
            <div className="mt-1 truncate text-[11px] text-[#8b98ad]">{v.channel ?? '—'}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#edf0f6] pt-3 text-center text-[11px] text-[#8b98ad]">
              <div><div className="text-[15px] font-semibold tabular-nums text-[#1d2b45]">{nf(v.plays)}</div>lectures</div>
              <div><div className="text-[15px] font-semibold tabular-nums text-[#1d2b45]">{fmtWatch(v.avgWatchSeconds)}</div>moyenne</div>
              <div><div className="text-[15px] font-semibold tabular-nums text-[#1d2b45]">{Math.round(v.completionRate * 100)} %</div>complétion</div>
            </div>
          </div>)}
        </div>
      </section>}

      <section id="engagement" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="04 / BEHAVIOR" title="Ce que font vraiment vos visiteurs." description="Profondeur de scroll, temps actif, pages consultées, clics internes et formulaires. Des mesures enregistrées, jamais inventées."/>
        <EngagementPanel key={siteId} days={days} publicSiteId={siteId||undefined}/>
      </section>

      <section id="globe" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="02 / LIVE MAP" title="Une audience sans frontières." description="La carte mondiale des connexions réelles, actualisée toutes les 15 secondes." action={<StatusPill active>Live globe</StatusPill>}/>
        <div className="ml-live-globe"><LiveGlobe key={siteId} publicSiteId={siteId||undefined}/></div>
      </section>

      <section id="insights" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="03 / INSIGHTS" title="Comprendre ce qui fonctionne." description="Les canaux qui apportent du trafic, les pages qui intéressent et les appareils utilisés."/>
        <div className="grid gap-4 md:grid-cols-3">
          <InsightPanel title="Acquisition" subtitle="D'où viennent les visiteurs ?" icon="link" rows={view?.sources??[]} empty="Aucune source à afficher pour l'instant."/>
          <InsightPanel title="Pages populaires" subtitle="Les contenus les plus consultés" icon="eye" rows={view?.pages??[]} empty="Les premières pages s'afficheront ici."/>
          <InsightPanel title="Appareils" subtitle="Répartition de l'audience" icon="layers" rows={view?.devices??[]} empty="Les données d'appareils arriveront ici."/>
        </div>
      </section>

      <section className="relative mt-20 overflow-hidden rounded-[24px] border border-[#e7ebf7] bg-[#fafbff] p-7 sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-12">
        <div className="pointer-events-none absolute -right-20 -top-28 h-[330px] w-[330px] rounded-full border-[65px] border-[#eef1ff] opacity-90"/>
        <div className="relative z-10 max-w-[680px]"><span className="ml-mini-label text-[#6273e9]">PRENEZ LE CONTRÔLE</span><h2 className="ml-section-head mt-3 max-w-[590px]">Les bonnes décisions commencent avec les bonnes données.</h2><p className="mt-4 max-w-[580px] text-[14px] leading-relaxed text-[#78879c]">Branchez votre site et suivez en direct vos visites, sources de trafic et conversions.</p></div>
        <button onClick={()=>navigate('/admin')} className="btn-dark relative z-10 mt-6 h-[50px] shrink-0 px-6 lg:mt-0">Connecter mon site <UiIcon name="arrow-up-right" size={17}/></button>
      </section>
      <footer className="mt-11 flex flex-wrap items-center justify-between gap-4 border-t border-[#edf0f6] pt-7 text-xs text-[#9aa6b8]"><Logo small/><span>Minilytics · Analytics sans distraction.</span><span>{view?'Mis à jour à '+timeLabel(view.updatedAt):'Données en cours de chargement'}</span></footer>
    </main>
  </div>;
}

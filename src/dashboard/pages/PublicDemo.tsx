import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Thumb, fmtWatch } from '../components/VideosView';
import { TrendChart } from '../components/TrendChart';
import { Link } from '../components/Link';
import { channelName } from '../lib/format';
import { Logo } from '../components/Logo';
// The WebGL globe is heavy: load it only once its slot nears the viewport.
const LiveGlobe = lazy(() => import('../components/LiveGlobe').then((m) => ({ default: m.LiveGlobe })));
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
        <div><h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3><p className="mt-1 text-xs text-ink-3">{subtitle}</p></div>
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-3"><UiIcon name={icon} size={16}/></span>
      </div>
      <div className="mt-6 flex-1 space-y-5">
        {rows.length ? rows.slice(0, 6).map((row, index) => <div key={row.label + index}>
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-ink-2" title={row.label}>{channelName(row.label)}</span><span className="shrink-0 tabular-nums text-ink-3">{nf(row.value)} <span className="ml-1 text-ink-4">/ {total ? Math.round(row.value / total * 100) : 0}%</span></span></div>
          <div className="ml-progress"><div style={{width: Math.max(2, row.value / highest * 100) + '%'}} /></div>
        </div>) : <div className="flex min-h-[130px] flex-col items-center justify-center rounded-xl border border-dashed border-line bg-well p-5 text-center"><UiIcon name={icon} size={22} className="mb-3 text-accent"/><p className="max-w-[230px] text-xs leading-relaxed text-ink-4">{empty}</p></div>}
      </div>
      <div className="mt-7 border-t border-line pt-4 text-[11px] text-ink-4">Sur la période sélectionnée</div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <span className="text-[13px] font-medium text-accent">{eyebrow}</span>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-[620px] text-[13px] leading-relaxed text-ink-3">{description}</p>
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
      setSiteId(current => current && list.some(s => s.id === current) ? current : (list.find(s => s.domain.replace(/^www\./, '') === 'n0.pub')?.id || list[0]?.id || ''));
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
  useEffect(() => { document.title = `Démo en direct · ${view?.site.domain ?? 'n0.pub'} — Minilytics`; }, [view?.site.domain]);
  const change = view?.previous.visitors ? Math.round((view.current.visitors-view.previous.visitors)/view.previous.visitors*100) : null;

  return <div className="min-h-screen bg-surface text-ink">
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1370px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Minilytics, accueil" className="rounded-lg"><Logo /></Link>
        <nav className="hidden items-center gap-8 text-[13px] font-medium text-ink-3 lg:flex" aria-label="Navigation principale">
          <a href="#analytics" className="hover:text-ink">Tableau de bord</a>
          <a href="#globe" className="hover:text-ink">Globe</a>
          <a href="#insights" className="hover:text-ink">Audience</a>
          <a href="#engagement" className="hover:text-ink">Comportement</a>
          {vids && vids.videos.length > 0 && <a href="#videos" className="hover:text-ink">Vidéos</a>}
        </nav>
        <div className="flex items-center gap-2.5">
          <span className="hidden md:inline-flex"><StatusPill active>Démo en direct</StatusPill></span>
          <Link href="/login" className="btn h-[42px] px-4">Se connecter</Link>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1370px] px-5 pb-14 sm:px-8 lg:px-10">
      <section className="grid items-center gap-10 border-b border-line pb-14 pt-14 lg:grid-cols-[1.08fr_.92fr] lg:gap-14 lg:pb-20 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 shadow-xs"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Démo publique · données réelles</span>
          <h1 className="mt-6 max-w-[730px] text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">La démo en direct<br/><span className="text-ink-3" translate="no">{view?.site.domain ?? sites.find(s=>s.id===siteId)?.domain ?? 'n0.pub'}</span></h1>
          <p className="mt-5 max-w-[530px] text-[15px] leading-relaxed text-ink-3 sm:text-[17px]">Les vraies statistiques agrégées du site, actualisées automatiquement : visiteurs, pages, sources, appareils et vidéos. Aucune donnée personnelle, aucun trafic fictif.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#analytics" className="btn-dark !h-11 !px-5">Explorer les statistiques <UiIcon name="arrow-right" size={17}/></a>
            <a href="#globe" className="btn !h-11 !px-5"><UiIcon name="globe" size={16}/> Voir le globe live</a>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-medium text-ink-3"><span className="inline-flex items-center gap-2"><UiIcon name="check" size={16} className="text-success"/> Des données réelles</span><span className="inline-flex items-center gap-2"><UiIcon name="refresh" size={16} className="text-ink-4"/> Mis à jour automatiquement</span></div>
        </div>

        <div className="relative min-w-0 lg:pl-4">
          <div className="ml-frame p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-5">
              <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-3"><UiIcon name="activity" size={16}/></span><div><div className="text-[13px] font-semibold">Aperçu en direct</div><p className="text-[11px] text-ink-4">{view?.site.domain ?? sites.find(s=>s.id===siteId)?.domain ?? '—'}</p></div></div>
              <StatusPill active>En direct</StatusPill>
            </div>
            <div className="mt-7">
              <p className="text-[12px] font-medium text-ink-3">Visiteurs uniques · {days} derniers jours</p>
              <div className="mt-2 flex flex-wrap items-end gap-3"><span className="text-3xl sm:text-4xl font-semibold leading-none tracking-tight tabular-nums text-ink">{view?nf(view.current.visitors):'—'}</span>{change!==null&&<span className={'mb-1 text-[13px] font-medium '+(change>=0?'text-success':'text-danger')}>{change>=0?'+':''}{change}%</span>}</div>
            </div>
            <div className="relative mt-6 h-[150px] sm:h-[175px]">
              {view ? <TrendChart height={150} granularity="day" buckets={view.series.map((d) => d.date)} series={[{ key: 'visitors', label: 'Visiteurs', color: 'rgb(var(--accent))', values: view.series.map((d) => d.visitors) }]} /> : <div className="ml-loading h-full rounded-xl"/>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-5">
              {[
                { label: 'En ligne',value:view?.online??null },
                { label: '24 heures',value:view?.last24h.visitors??null },
                { label: 'Sessions',value:view?.current.sessions??null },
              ].map(item=><div key={item.label} className="border-r border-line last:border-none"><p className="text-[11px] text-ink-4">{item.label}</p><p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{item.value===null?'—':nf(item.value)}</p></div>)}
            </div>
          </div>
                  </div>
      </section>

      <section id="analytics" className="scroll-mt-[104px] pt-16 sm:pt-20">
        <SectionHeading eyebrow="Vue d’ensemble" title="Votre tableau de bord" description="Toutes les métriques importantes, en un coup d'œil." action={<StatusPill active>Statistiques réelles</StatusPill>}/>
        <div className="ml-bento flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-3"><UiIcon name="globe" size={16}/></span><div className="min-w-0">{sites.length>1 ? <select aria-label="Site affiché" className="max-w-[260px] truncate rounded-lg border border-line bg-surface px-2 py-1 text-[13px] font-semibold text-ink" value={siteId} onChange={e=>pickSite(e.target.value)}>{sites.map(s=><option key={s.id} value={s.id}>{s.domain}{s.name!==s.domain?' · '+s.name:''}</option>)}</select> : <div className="truncate text-[13px] font-semibold">{view?.site.domain ?? '—'}</div>}<div className="mt-0.5 text-[11px] text-ink-4">Dernière actualisation {view?timeLabel(view.updatedAt):'en cours…'}</div></div></div>
          <div className="flex items-center gap-2"><SegmentedTabs value={days} options={[{value:7,label:'7 jours'},{value:30,label:'30 jours'}]} onChange={setDays} label="Période analysée"/><button className="btn !w-11 !p-0 md:!w-9" aria-label="Rafraîchir les données" onClick={refresh} disabled={busy}><UiIcon name="refresh" size={17} className={busy?'animate-spin':''}/></button></div>
        </div>
        {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert"><span>{error}</span><button className="btn" onClick={refresh}>Réessayer</button></div>}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-busy={busy}>
          <MetricTile focus label="Visiteurs uniques" value={view?nf(view.current.visitors):'—'} caption={'Sur '+days+' jours'} icon="users" number="01" series={visitorSeries}/>
          <MetricTile label="Pages vues" value={view?nf(view.current.pageviews):'—'} caption="Pages consultées" icon="eye" number="02" series={pageSeries}/>
          <MetricTile label="Sessions" value={view?nf(view.current.sessions):'—'} caption="Visites enregistrées" icon="layers" number="03"/>
          <MetricTile label="Durée moyenne" value={view?duration(view.current.avgDurationMs):'—'} caption="Temps par session" icon="clock" number="04"/>
        </div>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,.82fr)]">
          <div className="ml-bento min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-[16px] font-semibold tracking-tight">Évolution du trafic</h3><p className="mt-1 text-xs text-ink-4">Visiteurs uniques par jour · UTC</p></div><span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"><i className="h-2 w-2 rounded-full bg-accent"/>Visiteurs</span></div>
            <div className="mt-7 h-[265px] sm:h-[320px]">
              {view ? <TrendChart height={265} granularity="day" buckets={view.series.map((d) => d.date)} series={[{ key: 'visitors', label: 'Visiteurs', color: 'rgb(var(--accent))', values: view.series.map((d) => d.visitors) }]} /> : <div className="ml-loading h-full rounded-xl"/>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-4 text-[11px] text-ink-4"><span>Données collectées en continu</span><span>{days} jours sélectionnés</span></div>
          </div>
          <div className="ml-bento min-w-0 p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><h3 className="text-[16px] font-semibold tracking-tight">Temps réel</h3><p className="mt-1 text-xs text-ink-4">Activité du site</p></div><StatusPill active>En direct</StatusPill></div>
            <div className="relative mt-5 rounded-lg border border-line bg-canvas px-5 py-5">
              <span className="text-xs font-medium text-ink-3">Visiteurs actifs maintenant</span><p className="mt-1 flex items-center gap-3 text-5xl font-semibold leading-tight tracking-tight tabular-nums text-ink"><span className="h-2 w-2 rounded-full bg-success"/>{view?nf(view.online):'—'}</p>
              <span className="text-[11px] text-ink-4">Sur les 5 dernières minutes</span>
            </div>
            <div className="mt-5 divide-y divide-line">
              {[
                {label:'Visiteurs · 24 heures',value:view?.last24h.visitors??null,icon:'users' as const},
                {label:'Clics sortants',value:view?.outboundClicks??null,icon:'mouse' as const},
                {label:'Objectifs atteints',value:view?.goals??null,icon:'target' as const},
              ].map(item=><div key={item.label} className="flex items-center justify-between gap-4 py-4"><span className="flex items-center gap-2.5 text-[12px] text-ink-3"><UiIcon name={item.icon} size={17} className="text-accent"/>{item.label}</span><span className="text-[18px] font-semibold tabular-nums text-ink">{item.value===null?'—':nf(item.value)}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      {vids && vids.siteId === siteId && vids.videos.length > 0 && <section id="videos" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="Vidéos" title="Les vidéos les plus regardées" description={`${nf(vids.totals.plays)} lectures · ${nf(vids.totals.viewers)} spectateurs · ${fmtWatch(vids.totals.watchSeconds)} de visionnage · ${Math.round(vids.totals.completionRate * 100)} % de complétion, sur ${days} jours. Chiffres agrégés uniquement.`}/>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {vids.videos.slice(0, 8).map((v, i) => <div key={v.id} className="ml-bento overflow-hidden p-3">
            <div className="relative"><Thumb id={v.id} className="aspect-video w-full"/><span className="absolute left-2 top-2 rounded-md bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-ink">#{i + 1}</span></div>
            <div className="mt-3 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{v.title ?? v.id}</div>
            <div className="mt-1 truncate text-[11px] text-ink-3">{v.channel ?? '—'}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-[11px] text-ink-3">
              <div><div className="text-[15px] font-semibold tabular-nums text-ink">{nf(v.plays)}</div>lectures</div>
              <div><div className="text-[15px] font-semibold tabular-nums text-ink">{fmtWatch(v.avgWatchSeconds)}</div>moyenne</div>
              <div><div className="text-[15px] font-semibold tabular-nums text-ink">{Math.round(v.completionRate * 100)} %</div>complétion</div>
            </div>
          </div>)}
        </div>
      </section>}

      <section id="engagement" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="Comportement" title="Ce que font vraiment vos visiteurs" description="Profondeur de scroll, temps actif, pages consultées, clics internes et formulaires. Des mesures enregistrées, jamais inventées."/>
        <EngagementPanel key={siteId} days={days} publicSiteId={siteId||undefined}/>
      </section>

      <section id="globe" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="Carte en direct" title="Une audience sans frontières" description="La carte mondiale des connexions réelles, actualisée toutes les 15 secondes." action={<StatusPill active>Globe en direct</StatusPill>}/>
        <div className="ml-live-globe"><WhenVisible><Suspense fallback={<div className="ml-loading h-full min-h-[280px] rounded-xl"/>}><LiveGlobe key={siteId} publicSiteId={siteId||undefined}/></Suspense></WhenVisible></div>
      </section>

      <section id="insights" className="scroll-mt-[104px] pt-20">
        <SectionHeading eyebrow="Audience" title="Comprendre ce qui fonctionne" description="Les canaux qui apportent du trafic, les pages qui intéressent et les appareils utilisés."/>
        <div className="grid gap-4 md:grid-cols-3">
          <InsightPanel title="Acquisition" subtitle="D'où viennent les visiteurs ?" icon="link" rows={view?.sources??[]} empty="Aucune source à afficher pour l'instant."/>
          <InsightPanel title="Pages populaires" subtitle="Les contenus les plus consultés" icon="eye" rows={view?.pages??[]} empty="Les premières pages s'afficheront ici."/>
          <InsightPanel title="Appareils" subtitle="Répartition de l'audience" icon="layers" rows={view?.devices??[]} empty="Les données d'appareils arriveront ici."/>
        </div>
      </section>

      <section className="relative mt-20 overflow-hidden rounded-xl border border-line bg-surface p-7 shadow-card sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-12">
        <div className="relative z-10 max-w-[680px]"><span className="text-[13px] font-medium text-accent">Votre site</span><h2 className="mt-2 max-w-[590px] text-2xl font-semibold tracking-tight sm:text-3xl">Les bonnes décisions commencent avec les bonnes données.</h2><p className="mt-4 max-w-[580px] text-[14px] leading-relaxed text-ink-3">Branchez votre site et suivez en direct vos visites, sources de trafic et conversions.</p></div>
        <Link href="/signup" className="btn-dark relative z-10 mt-6 !h-11 shrink-0 !px-5 lg:mt-0">Connecter mon site <UiIcon name="arrow-right" size={15}/></Link>
      </section>
      <footer className="mt-11 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-7 text-xs text-ink-4"><Logo small/><span>Minilytics · Analytics sans distraction.</span><span>{view?'Mis à jour à '+timeLabel(view.updatedAt):'Données en cours de chargement'}</span></footer>
    </main>
  </div>;
}

/** Renders children only once the placeholder is within 300px of the viewport. */
function WhenVisible({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (!('IntersectionObserver' in window)) { setShow(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return <div ref={ref} className="h-full">{show ? children : <div className="ml-loading h-full min-h-[280px] rounded-xl" />}</div>;
}

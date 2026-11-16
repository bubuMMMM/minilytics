import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Thumb, fmtWatch } from '../components/VideosView';
import { TrendChart } from '../components/TrendChart';
import { Link } from '../components/Link';
import { channelName, countryName, flag, fmtShare } from '../lib/format';
import { Favicon } from '../components/Icons';
import { Dropdown } from '../components/Toolbar';
import { ThemeToggle } from '../components/ThemeToggle';
import { Logo } from '../components/Logo';
// The WebGL globe is heavy: load it only once its slot nears the viewport.
const LiveGlobe = lazy(() => import('../components/LiveGlobe').then((m) => ({ default: m.LiveGlobe })));
import { EngagementPanel } from '../components/EngagementPanel';
import { MetricTile, SegmentedTabs } from '../components/StudioUI';
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


function PublicSitePicker({ sites, siteId, onPick }: { sites: { id: string; name: string; domain: string }[]; siteId: string; onPick: (id: string) => void }) {
  const site = sites.find((s) => s.id === siteId);
  if (sites.length <= 1) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {site ? <Favicon domain={site.domain} size={16} /> : <span className="h-4 w-4 shrink-0 rounded bg-well" />}
        <span className="truncate text-[13px] font-medium" translate="no">{site?.domain ?? '—'}</span>
      </div>
    );
  }
  return (
    <Dropdown label="Site affiché" button={
      <button type="button" className="flex min-h-9 max-w-[280px] items-center gap-2 rounded-lg px-1.5 text-left hover:bg-well">
        {site ? <Favicon domain={site.domain} size={16} /> : <span className="h-4 w-4 shrink-0 rounded bg-well" />}
        <span className="min-w-0 truncate text-[13px] font-medium text-ink" translate="no">{site?.domain ?? '—'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-4" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
    }>
      {(close) => (
        <>
          <div className="px-3 pb-1 pt-1 text-[11px] font-medium text-ink-4">Sites publics</div>
          {sites.map((s) => (
            <button key={s.id} type="button" className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14px] ${s.id === siteId ? 'bg-well font-medium text-ink' : 'text-ink-2 hover:bg-well'}`}
              onClick={() => { close(); if (s.id !== siteId) onPick(s.id); }}>
              <Favicon domain={s.domain} size={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" translate="no">{s.name}</span>
                <span className="block truncate font-mono text-[11px] text-ink-4" translate="no">{s.domain}</span>
              </span>
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function InsightPanel({ title, subtitle, icon, rows, empty }: { title: string; subtitle: string; icon: 'link'|'eye'|'layers'; rows: Group[]; empty: string }) {
  const highest = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <article className="ml-bento flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div><h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3><p className="mt-1 text-xs text-ink-3">{subtitle}</p></div>
        <span className="text-ink-4" aria-hidden><UiIcon name={icon} size={16}/></span>
      </div>
      <div className="mt-5 flex-1 space-y-3.5">
        {rows.length ? rows.slice(0, 6).map((row, index) => <div key={row.label + index}>
          <div className="mb-1.5 flex min-w-0 items-center gap-3 text-[13px]"><span className={`min-w-0 flex-1 truncate font-medium text-ink ${title === 'Pages populaires' ? 'font-mono text-[12px]' : ''}`} title={row.label}>{title === 'Acquisition' ? channelName(row.label) : row.label}</span><span className="tnum shrink-0 text-ink-2">{nf(row.value)}</span><span className="tnum w-10 shrink-0 text-right text-[12px] text-ink-3">{fmtShare(row.value, total)}</span></div>
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
      <span className="ml-kicker">{eyebrow}</span>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-[620px] text-[13px] leading-relaxed text-ink-3">{description}</p>
    </div>
    {action}
  </div>;
}

type VideosPayload = {
  totals: { plays: number; viewers: number; watchSeconds: number; completionRate: number };
  videos: { id: string; title: string | null; channel: string | null; plays: number; viewers: number; watchSeconds: number; avgWatchSeconds: number; completionRate: number }[];
};

export function PublicDemo() {
  const [days, setDays] = useState<7|30>(7);
  const [data, setData] = useState<LiveData|null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [sites, setSites] = useState<{id:string;name:string;domain:string}[]>([]);
  const [siteId, setSiteId] = useState('');
  useEffect(() => {
    const fromUrl = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('site') || '') : '';
    fetch('/api/public/sites', { cache: 'no-store' }).then(r => (r.ok ? r.json() : []) as Promise<{id:string;name:string;domain:string}[]>).then(list => {
      setSites(list);
      setSiteId(current => {
        const wanted = current || fromUrl;
        return wanted && list.some(s => s.id === wanted) ? wanted : (list.find(s => s.domain.replace(/^www\./, '') === 'n0.pub')?.id || list[0]?.id || '');
      });
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
      .then(r => r.ok ? r.json() as Promise<VideosPayload | null> : null).then((v) => { if (!controller.signal.aborted) setVids(v ? { siteId, ...v } : null); }).catch(() => {});
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
  const [recentCountries, setRecentCountries] = useState<{ country: string; visitors: number }[]>([]);
  useEffect(() => {
    if (!siteId) return;
    const c = new AbortController();
    fetch('/api/public/live-globe?site=' + encodeURIComponent(siteId), { signal: c.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() as Promise<{ recentCountries?: { country: string; visitors: number }[]; countries?: { country: string; visitors: number }[] }> : null))
      .then((v) => { if (!c.signal.aborted && v) setRecentCountries(v.recentCountries?.length ? v.recentCountries : (v.countries ?? [])); })
      .catch(() => {});
    return () => c.abort();
  }, [siteId, reload]);
  const view = data?.days===days && (!data?.site?.id || data.site.id===siteId) ? data : null;
  const visitorSeries = view?.series.map(d=>d.visitors) || [];
  const pageSeries = view?.series.map(d=>d.pageviews) || [];
  useEffect(() => { document.title = `Démo en direct · ${view?.site.domain ?? 'n0.pub'} — Minilytics`; }, [view?.site.domain]);

  return <div className="min-h-screen bg-canvas text-ink">
    <header className="sticky top-0 z-50 border-b border-line bg-canvas backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 max-w-[1370px] items-center justify-between gap-3 px-4 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Minilytics, accueil" className="rounded-md"><Logo /></Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          <a href="#analytics" className="ml-nav-link">Tableau de bord</a>
          <a href="#globe" className="ml-nav-link">Globe</a>
          <a href="#insights" className="ml-nav-link">Audience</a>
          <a href="#engagement" className="ml-nav-link">Comportement</a>
          {vids && vids.videos.length > 0 && <a href="#videos" className="ml-nav-link">Vidéos</a>}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn-ghost !text-[14px] hidden sm:inline-flex">Se connecter</Link>
          <Link href="/signup" className="btn-dark !min-h-9 !whitespace-nowrap !px-2.5 !text-[12px] sm:!min-h-[36px] sm:!px-3 sm:!text-[13px]">Réserver mon accès</Link>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1370px] px-5 pb-14 sm:px-8 lg:px-10">
      <section className="border-b border-line pb-8 pt-10 lg:pb-10 lg:pt-12">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Démo publique · données réelles</span>
        <h1 className="mt-5 max-w-[730px] text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-4xl">La démo en direct de <span className="text-ink-3" translate="no">{view?.site.domain ?? sites.find(s=>s.id===siteId)?.domain ?? 'n0.pub'}</span></h1>
        <p className="mt-4 max-w-[540px] text-[15px] leading-relaxed text-ink-3">Statistiques agrégées d’un site en production, actualisées automatiquement. Aucune donnée personnelle, aucun trafic fictif.</p>
      </section>

      <section id="analytics" className="relative z-10 scroll-mt-14 bg-canvas pt-8 sm:pt-10">
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <PublicSitePicker sites={sites} siteId={siteId} onPick={pickSite} />
            <span className="hidden text-[12px] text-ink-4 sm:inline">Maj. {view ? timeLabel(view.updatedAt) : '…'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SegmentedTabs value={days} options={[{value:7,label:'7 jours'},{value:30,label:'30 jours'}]} onChange={setDays} label="Période analysée"/>
            <button className="btn !h-9 !w-9 !shrink-0 !p-0" aria-label="Rafraîchir les données" onClick={refresh} disabled={busy}><UiIcon name="refresh" size={16} className={busy?'animate-spin':''}/></button>
          </div>
        </div>
        {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert"><span>{error}</span><button className="btn" onClick={refresh}>Réessayer</button></div>}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-busy={busy}>
          <MetricTile focus label="Visiteurs uniques" value={view?nf(view.current.visitors):'—'} caption={'Sur '+days+' jours'} icon="users" number="01" series={visitorSeries}/>
          <MetricTile label="Pages vues" value={view?nf(view.current.pageviews):'—'} caption="Pages consultées" icon="eye" number="02" series={pageSeries}/>
          <MetricTile label="Sessions" value={view?nf(view.current.sessions):'—'} caption="Visites enregistrées" icon="layers" number="03"/>
          <MetricTile label="Durée moyenne" value={view?duration(view.current.avgDurationMs):'—'} caption="Temps par session" icon="clock" number="04"/>
        </div>

        <div className="mt-4 grid items-stretch gap-4 md:grid-cols-[minmax(0,1.7fr)_minmax(280px,.82fr)]">
          <div className="ml-bento min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-[16px] font-semibold tracking-tight">Évolution du trafic</h3><p className="mt-1 text-xs text-ink-4">Visiteurs uniques par jour · UTC</p></div><span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"><i className="h-2 w-2 rounded-full bg-accent"/>Visiteurs</span></div>
            <div className="mt-7 h-[265px] sm:h-[320px]">
              {view ? <TrendChart height={265} granularity="day" buckets={view.series.map((d) => d.date)} series={[{ key: 'visitors', label: 'Visiteurs', color: 'rgb(var(--accent))', values: view.series.map((d) => d.visitors) }]} /> : <div className="ml-loading h-full rounded-xl"/>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-4 text-[11px] text-ink-4"><span>Données collectées en continu</span><span>{days} jours sélectionnés</span></div>
          </div>
          <div className="ml-bento flex min-w-0 flex-col p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[16px] font-semibold tracking-tight">Temps réel</h3>
              <p className="flex items-center gap-2 text-[22px] font-semibold tabular-nums leading-none text-ink"><span className="h-2 w-2 rounded-full bg-success" aria-hidden />{view ? nf(view.online) : '—'}</p>
            </div>
            <p className="mt-1 text-[12px] text-ink-4">Actifs sur les 5 dernières minutes{view?.last24h ? ` · ${nf(view.last24h.visitors)} aujourd’hui` : ''}</p>
            <ul className="mt-4 min-h-0 flex-1 space-y-0.5">
              {recentCountries.slice(0, 6).length
                ? recentCountries.slice(0, 6).map((c) => (
                  <li key={c.country} className="flex items-center gap-2.5 rounded-md px-0.5 py-1.5 text-[13px]">
                    <span className="w-5 shrink-0 text-center" aria-hidden>{flag(c.country)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{countryName(c.country)}</span>
                    <span className="tnum shrink-0 font-medium text-ink">{nf(c.visitors)}</span>
                  </li>
                ))
                : <li className="py-6 text-center text-[13px] text-ink-4">Personne en ligne pour le moment. Les pays récemment vus apparaîtront ici.</li>}
            </ul>
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-[12px] text-ink-3">
              <span>Clics sortants <span className="tnum font-medium text-ink">{view ? nf(view.outboundClicks) : '—'}</span></span>
              <span>Objectifs <span className="tnum font-medium text-ink">{view ? nf(view.goals) : '—'}</span></span>
            </div>
          </div>
        </div>
      </section>

      {vids && vids.siteId === siteId && vids.videos.length > 0 && <section id="videos" className="scroll-mt-20 pt-20">
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

      <section id="engagement" className="scroll-mt-20 pt-20">
        <SectionHeading eyebrow="Comportement" title="Ce que font vraiment vos visiteurs" description="Profondeur de scroll, temps actif, pages consultées, clics internes et formulaires. Des mesures enregistrées, jamais inventées."/>
        <EngagementPanel key={siteId} days={days} publicSiteId={siteId||undefined}/>
      </section>

      <section id="globe" className="scroll-mt-20 overflow-hidden pt-20">
        <SectionHeading eyebrow="Carte en direct" title="Une audience sans frontières" description="La carte mondiale des connexions réelles, actualisée toutes les 15 secondes." action={<a href={`/demo/map?site=${encodeURIComponent(siteId || '')}`} className="btn">Explorer la carte <span aria-hidden>→</span></a>}/>
        <div className="ml-live-globe"><WhenVisible><Suspense fallback={<div className="ml-loading h-full min-h-[280px] rounded-xl"/>}><LiveGlobe key={siteId} publicSiteId={siteId||undefined}/></Suspense></WhenVisible></div>
      </section>

      <section id="insights" className="scroll-mt-20 pt-20">
        <SectionHeading eyebrow="Audience" title="Comprendre ce qui fonctionne" description="Les canaux qui apportent du trafic, les pages qui intéressent et les appareils utilisés."/>
        <div className="grid gap-4 md:grid-cols-3">
          <InsightPanel title="Acquisition" subtitle="D'où viennent les visiteurs ?" icon="link" rows={view?.sources??[]} empty="Aucune source à afficher pour l'instant."/>
          <InsightPanel title="Pages populaires" subtitle="Les contenus les plus consultés" icon="eye" rows={view?.pages??[]} empty="Les premières pages s'afficheront ici."/>
          <InsightPanel title="Appareils" subtitle="Répartition de l'audience" icon="layers" rows={view?.devices??[]} empty="Les données d'appareils arriveront ici."/>
        </div>
      </section>

      <section className="relative mt-20 overflow-hidden rounded-xl border border-line bg-surface p-7 shadow-card sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-12">
        <div className="relative z-10 max-w-[680px]"><span className="ml-kicker">Votre site</span><h2 className="mt-2 max-w-[590px] text-2xl font-semibold tracking-tight sm:text-3xl">Les bonnes décisions commencent avec les bonnes données.</h2><p className="mt-4 max-w-[580px] text-[14px] leading-relaxed text-ink-3">Branchez votre site et suivez en direct vos visites, sources de trafic et conversions.</p></div>
        <Link href="/signup" className="btn-dark relative z-10 mt-6 !h-11 shrink-0 !px-5 lg:mt-0">Réserver mon accès <UiIcon name="arrow-right" size={15}/></Link>
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

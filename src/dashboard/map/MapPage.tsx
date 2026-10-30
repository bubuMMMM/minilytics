import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { feature } from 'topojson-client';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { AppHeader, BottomNav } from '../components/AppNav';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Dropdown, PERIODS } from '../components/Toolbar';
import { UiIcon } from '../components/UiIcon';
import { api, qs, type Site } from '../lib/api';
import { fmtNumber } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useQueryState } from '../lib/useQueryState';
import { achievements, continentProgress, level, newlyReached, streak, timeline, type Achievement, type Discovery } from './game';
import { BY_NAME, BY_NUM, CONTINENT_NAME, COUNTRIES, SOVEREIGN_TOTAL, countryName, flag, normalizeName } from './geo';
import { GeoMap, frame, type CountryFeature, type GeoMapHandle, type LivePoint, type MapPoint, type Mode } from './GeoMap';

interface MapData {
  range: { from: number; to: number };
  timezone: string;
  cityLevel: boolean;
  countries: { country: string; visitors: number; sessions: number; pageviews: number }[];
  discovery: Discovery[];
  days: { day: string; countries: number }[];
  citiesReached: number | null;
  places: { country: string; region: string | null; city: string; visitors: number; lat: number | null; lon: number | null }[];
  regions: { country: string; region: string; visitors: number }[];
}
interface LiveData { online: number; countries: { country: string; visitors: number }[]; places: { country: string; city: string; visitors: number; lat: number | null; lon: number | null }[] }
type Tab = 'rank' | 'game' | 'timeline';

const nf = fmtNumber;
const fmtDate = (ts: number, tz: string) => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
const fmtDateTime = (ts: number, tz: string) => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz });

/** World borders: 1:110m first, the 1:50m set only once the user zooms in. */
function useWorld(detailed: boolean) {
  const [world, setWorld] = useState<{ res: string; list: CountryFeature[] } | null>(null);
  useEffect(() => {
    const res = detailed ? '50m' : '110m';
    if (world?.res === '50m' || world?.res === res) return;
    let alive = true;
    fetch(`/maps/countries-${res}.json`).then((r) => r.json()).then((topo: any) => {
      if (!alive) return;
      const fc = feature(topo, topo.objects.countries) as unknown as { features: (Feature<Polygon | MultiPolygon> & { id?: string; properties: { name?: string } })[] };
      const list: CountryFeature[] = [];
      for (const f of fc.features) {
        const iso2 = (f.id && BY_NUM.get(String(f.id).padStart(3, '0'))) || BY_NAME[f.properties?.name ?? ''];
        if (!iso2 || iso2 === 'AQ') continue;
        list.push({ iso2, feature: f, ...frame(f) });
      }
      setWorld({ res, list });
    }).catch(() => {});
    return () => { alive = false; };
  }, [detailed, world?.res]);
  return world?.list ?? null;
}

/** Lazily loaded lookups: region names (ISO 3166-2) and a city gazetteer for visits recorded before coordinates were stored. */
function useLookup<T>(url: string, need: boolean) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!need || data) return;
    fetch(url).then((r) => r.json() as Promise<T>).then(setData).catch(() => {});
  }, [url, need, data]);
  return data;
}

export function MapPage({ siteId, publicSiteId }: { siteId?: string; publicSiteId?: string }) {
  const [q, update] = useQueryState();
  const isPublic = !!publicSiteId;
  const period = isPublic ? (['7d', '30d', 'all'].includes(q.period) ? q.period : '30d') : q.period;
  const { data: sites } = useApi<Site[]>(isPublic ? null : '/api/sites');
  const site = sites?.find((s) => s.id === siteId);
  const url = isPublic
    ? `/api/public/map?site=${encodeURIComponent(publicSiteId!)}&days=${period === '7d' ? 7 : period === 'all' ? 'all' : 30}`
    : site ? `/api/sites/${siteId}/map?${qs({ ...q })}` : null;
  const { data, error } = useApi<MapData>(url);
  const [live, setLive] = useState<LiveData | null>(null);
  const [extra, setExtra] = useState<Discovery[]>([]);
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('ml-map-mode') === 'flat' ? 'flat' : 'globe'));
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rank');
  const [hover, setHover] = useState<{ iso2: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ country: string; at: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const mapRef = useRef<GeoMapHandle>(null);
  const world = useWorld(zoom >= 2.4);
  const tz = data?.timezone ?? site?.timezone ?? 'UTC';
  const title = isPublic ? 'Démo' : site?.name;

  useEffect(() => { localStorage.setItem('ml-map-mode', mode); }, [mode]);
  useEffect(() => { document.title = `Carte${title ? ' · ' + title : ''} — Minilytics`; }, [title]);

  const needGazetteer = !!data && (data.places.some((p) => p.lat == null) || !!live?.places.some((p) => p.lat == null));
  const cities = useLookup<[string, string, number, number][]>('/maps/cities-15k.json', needGazetteer);
  const regionNames = useLookup<Record<string, string>>('/maps/regions.json', !!data?.cityLevel);
  const gazetteer = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const [n, cc, lon, lat] of cities ?? []) { const k = cc + '|' + normalizeName(n); if (!m.has(k)) m.set(k, [lon, lat]); }
    return m;
  }, [cities]);
  const locate = useCallback((cc: string, city: string, lat: number | null, lon: number | null): [number, number] | null =>
    lat != null && lon != null ? [lon, lat] : gazetteer.get(cc + '|' + normalizeName(city)) ?? null, [gazetteer]);

  const discovery = useMemo(() => [...(data?.discovery ?? []), ...extra.filter((e) => !data?.discovery.some((d) => d.country === e.country))], [data, extra]);
  const discovered = useMemo(() => new Set(discovery.map((d) => d.country)), [discovery]);
  const knownRef = useRef<Set<string> | null>(null);
  useEffect(() => { if (data) knownRef.current = new Set([...(knownRef.current ?? []), ...data.discovery.map((d) => d.country)]); }, [data]);

  // Live visitors, every 10 s; a country never seen before triggers the celebration.
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const liveUrl = isPublic ? `/api/public/map/live?site=${encodeURIComponent(publicSiteId!)}` : `/api/sites/${siteId}/map/live`;
    const tick = () => api<LiveData>(liveUrl).then((l) => {
      if (!alive) return;
      setLive(l);
      const known = knownRef.current;
      if (!known) return;
      const fresh = newlyReached(known, l.countries);
      if (fresh.length) {
        const now = Date.now();
        for (const c of fresh) known.add(c);
        setExtra((e) => [...e, ...fresh.map((country) => ({ country, firstAt: now, visitors: 1 }))]);
        const info = COUNTRIES.get(fresh[0]);
        if (info) mapRef.current?.celebrate(info.lng, info.lat);
        setToast({ country: fresh[0], at: now });
      }
    }).catch(() => {});
    tick();
    const t = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [data, isPublic, publicSiteId, siteId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);

  const maxV = Math.max(1, ...(data?.countries ?? []).map((c) => c.visitors));
  const intensity = useMemo(() => new Map((data?.countries ?? []).map((c) => [c.country, Math.log1p(c.visitors) / Math.log1p(maxV)])), [data, maxV]);
  const points: MapPoint[] = useMemo(() => (data?.places ?? []).flatMap((p) => {
    const ll = locate(p.country, p.city, p.lat, p.lon);
    return ll ? [{ key: `${p.country}|${p.region}|${p.city}`, lon: ll[0], lat: ll[1], value: p.visitors, label: p.city, country: p.country }] : [];
  }), [data, locate]);
  const livePoints: LivePoint[] = useMemo(() => {
    if (!live) return [];
    const out: LivePoint[] = [];
    const placed = new Set<string>();
    for (const p of live.places) {
      const ll = locate(p.country, p.city, p.lat, p.lon);
      if (ll) { out.push({ key: p.country + p.city, lon: ll[0], lat: ll[1], value: p.visitors }); placed.add(p.country); }
    }
    for (const c of live.countries) {
      const info = COUNTRIES.get(c.country);
      if (!placed.has(c.country) && info) out.push({ key: c.country, lon: info.lng, lat: info.lat, value: c.visitors });
    }
    return out;
  }, [live, locate]);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const todayStart = useMemo(() => {
    const now = new Date();
    const off = Date.parse(now.toLocaleString('en-US', { timeZone: tz })) - Date.parse(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Date.parse(today + 'T00:00:00Z') - off;
  }, [today, tz]);
  const reached = discovery.filter((d) => COUNTRIES.get(d.country)?.sovereign).length;
  const lvl = level(reached);
  const badges = useMemo(() => (data ? achievements({ discovery, days: data.days, citiesReached: data.citiesReached, today, todayStart }) : []), [data, discovery, today, todayStart]);
  const conts = useMemo(() => continentProgress(discovery), [discovery]);
  const line = useMemo(() => timeline(discovery), [discovery]);
  const st = useMemo(() => streak(data?.days ?? [], today), [data, today]);

  const select = useCallback((iso2: string | null, fly = true) => {
    setSelected(iso2);
    if (iso2 && fly) mapRef.current?.flyToCountry(iso2);
    if (iso2) setSheet(true);
  }, []);
  const flyToPlace = (lon: number, lat: number) => mapRef.current?.flyTo(lon, lat, 14);

  const header = isPublic ? (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2"><Link href="/" aria-label="Accueil" className="flex min-h-[44px] items-center"><Logo small /></Link><span className="text-ink-4">/</span><Link href={`/demo?site=${encodeURIComponent(publicSiteId!)}`} className="text-[14px] text-ink-3 hover:text-ink">Démo</Link><span className="text-ink-4">/</span><span className="text-[14px] font-medium">Carte</span></div>
        <div className="flex items-center gap-1"><ThemeToggle /><Link href="/signup" className="btn-dark hidden sm:inline-flex">Commencer</Link></div>
      </div>
    </header>
  ) : <AppHeader siteId={siteId!} active="map" online={!!live?.online} title={site?.name} />;

  const panel = (
    <Panel
      data={data} error={error} tab={tab} setTab={setTab} selected={selected} select={select} tz={tz} live={live}
      discovered={discovered} discovery={discovery} badges={badges} conts={conts} line={line} streak={st} reached={reached} lvl={lvl}
      regionNames={regionNames} locate={locate} flyToPlace={flyToPlace} isPublic={isPublic}
    />
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas text-ink">
      {header}
      <main id="contenu" className={`relative flex min-h-0 flex-1 ${isPublic ? '' : 'pb-[calc(57px+env(safe-area-inset-bottom))] md:pb-0'}`}>
        <section className="relative min-w-0 flex-1 overflow-hidden" aria-label="Carte des visiteurs">
          <div className="absolute inset-0">
            {world ? (
              <GeoMap ref={mapRef} mode={mode} countries={world} intensity={intensity} discovered={discovered} points={points} live={livePoints}
                selected={selected} onSelectCountry={(c) => select(c)} onSelectPoint={(pt) => { setSelected(pt.country); flyToPlace(pt.lon, pt.lat); setSheet(true); }}
                onHover={setHover} onZoom={(k) => setZoom((z) => (Math.abs(z - k) > 0.05 ? k : z))}
                label={`Carte des visiteurs : ${reached} pays découverts sur ${SOVEREIGN_TOTAL}. Glissez pour tourner, pincez ou utilisez les boutons pour zoomer.`} />
            ) : <div className="flex h-full items-center justify-center"><div className="ml-skeleton h-[min(70vw,520px)] w-[min(70vw,520px)] rounded-full" /></div>}
          </div>

          {/* Exploration counter */}
          <div className="pointer-events-none absolute left-3 top-3 sm:left-5 sm:top-5">
            <div className="pointer-events-auto w-[200px] rounded-xl border border-line bg-surface/90 p-3 shadow-card backdrop-blur sm:w-[236px] sm:p-4">
              <div className="flex items-center justify-between text-[12px] text-ink-3"><span>Pays débloqués</span><span className="rounded-full border border-line px-1.5 py-px text-[11px] font-medium text-ink-2">{lvl.name}</span></div>
              <div className="mt-1 flex items-baseline gap-1"><span className="tnum text-2xl font-semibold tracking-tight">{data ? reached : '—'}</span><span className="tnum text-[13px] text-ink-3">/ {SOVEREIGN_TOTAL}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well" role="progressbar" aria-valuemin={0} aria-valuemax={SOVEREIGN_TOTAL} aria-valuenow={reached} aria-label="Pays débloqués">
                <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.max(reached ? 1.5 : 0, (reached / SOVEREIGN_TOTAL) * 100)}%` }} />
              </div>
              {lvl.next && <div className="mt-1.5 text-[11px] text-ink-4">{lvl.next.min - reached} pays avant « {lvl.next.name} »</div>}
            </div>
          </div>

          {/* Period + mode */}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-5 sm:top-5 sm:flex-row sm:items-center">
            <PeriodPicker value={period} onChange={(v) => update({ period: v })} options={isPublic ? PERIODS.filter((x) => ['7d', '30d', 'all'].includes(x.value)) : PERIODS} />
            <div className="inline-flex rounded-lg border border-line bg-surface/90 p-0.5 shadow-xs backdrop-blur" role="group" aria-label="Projection">
              {(['globe', 'flat'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                  className={`min-h-[36px] rounded-md px-3 text-[13px] font-medium transition-colors md:min-h-[30px] ${mode === m ? 'bg-well text-ink' : 'text-ink-3 hover:text-ink'}`}>{m === 'globe' ? 'Globe' : 'Plan'}</button>
              ))}
            </div>
          </div>

          {/* Zoom */}
          <div className="absolute bottom-[152px] right-3 flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90 shadow-card backdrop-blur sm:right-5 md:bottom-5">
            <MapButton label="Zoomer" onClick={() => mapRef.current?.zoomBy(1.6)}><path d="M12 5v14M5 12h14" /></MapButton>
            <MapButton label="Dézoomer" onClick={() => mapRef.current?.zoomBy(1 / 1.6)}><path d="M5 12h14" /></MapButton>
            <MapButton label="Vue d’ensemble" onClick={() => { setSelected(null); mapRef.current?.reset(); }}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16" /></MapButton>
          </div>

          {/* Legend */}
          <div className="absolute bottom-5 left-5 hidden items-center gap-4 rounded-lg border border-line bg-surface/90 px-3 py-2 text-[12px] text-ink-3 shadow-xs backdrop-blur md:flex">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-6 rounded-sm" style={{ background: 'linear-gradient(90deg, rgb(var(--accent) / .3), rgb(var(--accent) / .9))' }} />Visiteurs sur la période</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent/15" />Déjà découvert</span>
            <span className="flex items-center gap-1.5"><span className="ml-fog h-2.5 w-2.5 rounded-sm" />Inexploré</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />En direct{live ? ` · ${nf(live.online)}` : ''}</span>
          </div>

          {hover && (
            <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }}>
              <div className="font-medium text-ink">{flag(hover.iso2)} {countryName(hover.iso2)}</div>
              <div className="text-ink-3">{discovered.has(hover.iso2)
                ? `${nf(data?.countries.find((c) => c.country === hover.iso2)?.visitors ?? 0)} visiteurs sur la période`
                : 'Pas encore découvert'}</div>
            </div>
          )}

          {toast && (
            <div role="status" className="ml-toast-in absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop sm:top-5">
              <span className="text-2xl leading-none" aria-hidden>{flag(toast.country)}</span>
              <div>
                <div className="text-[12px] font-medium text-accent">Nouveau pays débloqué</div>
                <div className="text-[14px] font-semibold">{countryName(toast.country)} <span className="font-normal text-ink-3">· {CONTINENT_NAME[COUNTRIES.get(toast.country)?.continent ?? 'AN']}</span></div>
              </div>
              <button className="btn-ghost" onClick={() => select(toast.country)}>Voir</button>
            </div>
          )}

          {/* Mobile bottom sheet */}
          <div className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-[0_-12px_40px_rgb(0_0_0/.12)] transition-[height] duration-300 md:hidden ${sheet ? 'h-[72%]' : 'h-[140px]'}`}>
            <button type="button" className="flex w-full shrink-0 flex-col items-center pt-2" onClick={() => setSheet((s) => !s)} aria-expanded={sheet} aria-label={sheet ? 'Réduire le panneau' : 'Agrandir le panneau'}>
              <span className="h-1 w-10 rounded-full bg-line-strong" />
            </button>
            <div className="min-h-0 flex-1 overflow-hidden" onClick={() => !sheet && setSheet(true)}>{panel}</div>
          </div>
        </section>
        <aside className="hidden w-[380px] shrink-0 flex-col border-l border-line bg-surface md:flex" aria-label="Classement et succès">{panel}</aside>
      </main>
      {!isPublic && siteId && <BottomNav siteId={siteId} active="map" />}
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-11 w-11 items-center justify-center border-b border-line text-ink-2 last:border-b-0 hover:bg-well hover:text-ink md:h-9 md:w-9">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>{children}</svg>
    </button>
  );
}

function PeriodPicker({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Dropdown align="right" button={
      <button type="button" className="btn !bg-surface/90 backdrop-blur">{options.find((p) => p.value === value)?.label ?? 'Période personnalisée'}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-4" aria-hidden><path d="m6 9 6 6 6-6" /></svg></button>
    }>
      {(close) => options.map((p) => (
        <button key={p.value} className={`flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm hover:bg-well sm:min-h-[36px] ${p.value === value ? 'font-medium text-ink' : 'text-ink-2'}`} onClick={() => { close(); onChange(p.value); }}>{p.label}</button>
      ))}
    </Dropdown>
  );
}

interface PanelProps {
  data: MapData | null; error: string | null; tab: Tab; setTab: (t: Tab) => void; selected: string | null; select: (c: string | null, fly?: boolean) => void;
  tz: string; live: LiveData | null; discovered: Set<string>; discovery: Discovery[]; badges: Achievement[]; conts: ReturnType<typeof continentProgress>;
  line: ReturnType<typeof timeline>; streak: { current: number; best: number }; reached: number; lvl: ReturnType<typeof level>;
  regionNames: Record<string, string> | null; locate: (cc: string, city: string, lat: number | null, lon: number | null) => [number, number] | null;
  flyToPlace: (lon: number, lat: number) => void; isPublic: boolean;
}

function Panel(props: PanelProps) {
  const { data, error, tab, setTab, selected } = props;
  if (error) return <p className="p-5 text-[13px] text-danger" role="alert">{error}</p>;
  if (selected) return <CountryDetail {...props} iso2={selected} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-3 md:pt-4">
        <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-well p-0.5" role="tablist" aria-label="Panneau">
          {([['rank', 'Classement'], ['game', 'Succès'], ['timeline', 'Conquête']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-[36px] rounded-md text-[13px] font-medium transition-colors md:min-h-[30px] ${tab === k ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
        {!data ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ml-skeleton h-9 w-full" />)}</div>
          : tab === 'rank' ? <Ranking {...props} data={data} />
          : tab === 'game' ? <Game {...props} data={data} />
          : <Timeline {...props} />}
      </div>
    </div>
  );
}

function Ranking({ data, select, discovered, locate, flyToPlace, isPublic }: PanelProps & { data: MapData }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'countries' | 'cities'>('countries');
  const s = normalizeName(search);
  const total = data.countries.reduce((n, c) => n + c.visitors, 0) || 1;
  const max = Math.max(1, ...data.countries.map((c) => c.visitors));
  const rows = data.countries.filter((c) => !s || normalizeName(countryName(c.country)).includes(s) || c.country.toLowerCase() === s);
  const others = [...discovered].filter((c) => !data.countries.some((x) => x.country === c) && (!s || normalizeName(countryName(c)).includes(s)));
  const cityRows = data.places.filter((p) => !s || normalizeName(p.city).includes(s) || normalizeName(countryName(p.country)).includes(s));
  const cmax = Math.max(1, ...data.places.map((p) => p.visitors));
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"><UiIcon name="search" size={14} /></span>
          <input type="search" className="input !pl-8" placeholder={kind === 'countries' ? 'Rechercher un pays…' : 'Rechercher une ville…'} aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!isPublic && (
          <div className="inline-flex shrink-0 rounded-lg border border-line p-0.5" role="group" aria-label="Niveau">
            {(['countries', 'cities'] as const).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-[36px] rounded-md px-2.5 text-[12px] font-medium md:min-h-[30px] ${kind === k ? 'bg-well text-ink' : 'text-ink-3'}`}>{k === 'countries' ? 'Pays' : 'Villes'}</button>)}
          </div>
        )}
      </div>
      {kind === 'countries' ? (
        <ol className="mt-3 space-y-0.5">
          {rows.map((c, i) => (
            <li key={c.country}>
              <button onClick={() => select(c.country)} className="group relative flex min-h-[44px] w-full items-center gap-2.5 overflow-hidden rounded-md px-2 text-left text-[13px] hover:bg-well md:min-h-[36px]">
                <span className="absolute inset-y-1 left-0 rounded-md bg-accent/10" style={{ width: `${(c.visitors / max) * 100}%` }} aria-hidden />
                <span className="tnum relative w-5 text-right text-[11px] text-ink-4">{i + 1}</span>
                <span className="relative" aria-hidden>{flag(c.country)}</span>
                <span className="relative min-w-0 flex-1 truncate font-medium">{countryName(c.country)}</span>
                <span className="tnum relative text-ink-2">{nf(c.visitors)}</span>
                <span className="tnum relative w-10 text-right text-[11px] text-ink-4">{Math.round((c.visitors / total) * 100)} %</span>
              </button>
            </li>
          ))}
          {!rows.length && !others.length && <li className="py-8 text-center text-[13px] text-ink-3">{search ? 'Aucun pays ne correspond.' : 'Aucune visite localisée sur cette période.'}</li>}
          {others.length > 0 && <li className="px-2 pb-1 pt-4 text-[12px] font-medium text-ink-3">Découverts, sans visite sur la période</li>}
          {others.map((c) => (
            <li key={c}><button onClick={() => select(c)} className="flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-ink-3 hover:bg-well md:min-h-[36px]"><span className="w-5" /><span aria-hidden>{flag(c)}</span><span className="truncate">{countryName(c)}</span></button></li>
          ))}
        </ol>
      ) : (
        <ol className="mt-3 space-y-0.5">
          {cityRows.map((p) => {
            const ll = locate(p.country, p.city, p.lat, p.lon);
            return (
              <li key={p.country + p.region + p.city}>
                <button onClick={() => { select(p.country, false); if (ll) flyToPlace(ll[0], ll[1]); }} className="relative flex min-h-[44px] w-full items-center gap-2.5 overflow-hidden rounded-md px-2 text-left text-[13px] hover:bg-well md:min-h-[36px]">
                  <span className="absolute inset-y-1 left-0 rounded-md bg-accent/10" style={{ width: `${(p.visitors / cmax) * 100}%` }} aria-hidden />
                  <span className="relative" aria-hidden>{flag(p.country)}</span>
                  <span className="relative min-w-0 flex-1 truncate font-medium">{p.city}</span>
                  <span className="tnum relative text-ink-2">{nf(p.visitors)}</span>
                </button>
              </li>
            );
          })}
          {!cityRows.length && <li className="py-8 text-center text-[13px] text-ink-3">Aucune ville sur cette période.</li>}
        </ol>
      )}
    </div>
  );
}

function Game({ data, badges, conts, streak: st, reached, lvl, discovery }: PanelProps & { data: MapData }) {
  const contsReached = conts.filter((c) => c.reached > 0).length;
  const unlocked = badges.filter((b) => b.unlocked).length;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center justify-between">
          <div><div className="text-[12px] text-ink-3">Niveau d’exploration</div><div className="text-lg font-semibold tracking-tight">{lvl.name}</div></div>
          <div className="text-right text-[12px] text-ink-3">{lvl.next ? <>Prochain : <span className="font-medium text-ink-2">{lvl.next.name}</span><br />à {lvl.next.min} pays</> : 'Niveau maximal'}</div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full bg-accent" style={{ width: `${lvl.progress * 100}%` }} /></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px] text-ink-3">
          <div><dt>Pays</dt><dd className="tnum text-[15px] font-semibold text-ink">{reached} <span className="font-normal text-ink-4">/ {SOVEREIGN_TOTAL}</span></dd></div>
          <div><dt>Continents</dt><dd className="tnum text-[15px] font-semibold text-ink">{contsReached} <span className="font-normal text-ink-4">/ 6</span></dd></div>
          {data.citiesReached !== null && <div><dt>Villes</dt><dd className="tnum text-[15px] font-semibold text-ink">{nf(data.citiesReached)}</dd></div>}
          <div><dt>Série en cours</dt><dd className="tnum text-[15px] font-semibold text-ink">{st.current} j <span className="font-normal text-ink-4">· record {st.best} j</span></dd></div>
        </dl>
        {discovery.length > reached && <p className="mt-3 text-[11px] text-ink-4">+ {discovery.length - reached} territoire{discovery.length - reached > 1 ? 's' : ''} hors des 195 pays (ex. Hong Kong, Porto Rico).</p>}
      </div>

      <section aria-labelledby="cont-title">
        <h3 id="cont-title" className="text-[13px] font-semibold">Continents</h3>
        <ul className="mt-2 space-y-2.5">
          {conts.map((c) => (
            <li key={c.key}>
              <div className="flex items-center justify-between text-[12px]"><span className={c.reached ? 'font-medium text-ink' : 'text-ink-3'}>{c.name}</span><span className="tnum text-ink-3">{c.reached} / {c.total}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full bg-accent" style={{ width: `${(c.reached / c.total) * 100}%`, minWidth: c.reached ? 4 : 0 }} /></div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="badges-title">
        <div className="flex items-center justify-between"><h3 id="badges-title" className="text-[13px] font-semibold">Succès</h3><span className="text-[12px] text-ink-3">{unlocked} / {badges.length}</span></div>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {badges.map((b) => (
            <li key={b.id} className={`rounded-lg border p-3 ${b.unlocked ? 'border-line bg-surface' : 'border-dashed border-line bg-canvas'}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${b.unlocked ? 'bg-accent text-white' : 'border border-line text-ink-4'}`} aria-hidden>
                  {b.unlocked ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                    : <UiIcon name={b.group === 'continents' ? 'globe' : b.group === 'régularité' ? 'calendar' : b.group === 'villes' ? 'compass' : 'target'} size={12} />}
                </span>
                <div className="min-w-0">
                  <div className={`text-[12px] font-semibold leading-tight ${b.unlocked ? 'text-ink' : 'text-ink-3'}`}>{b.title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-ink-4">{b.desc}</div>
                </div>
              </div>
              {b.unlocked ? (b.at && <div className="mt-2 text-[11px] text-ink-3">{fmtDate(b.at, data.timezone)}</div>)
                : b.progress && <div className="mt-2"><div className="h-1 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full bg-ink-4" style={{ width: `${(b.progress[0] / b.progress[1]) * 100}%` }} /></div><div className="tnum mt-1 text-[11px] text-ink-4">{b.progress[0]} / {b.progress[1]}</div></div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Timeline({ line, select, tz }: PanelProps) {
  if (!line.length) return <p className="py-8 text-center text-[13px] text-ink-3">Aucun pays découvert pour l’instant. Le premier visiteur localisé apparaîtra ici.</p>;
  return (
    <ol className="relative ml-2 border-l border-line">
      {[...line].reverse().map((t) => (
        <li key={t.country} className="relative pb-4 pl-5">
          <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${t.newContinent ? 'bg-accent' : 'bg-line-strong'}`} aria-hidden />
          <button onClick={() => select(t.country)} className="w-full rounded-md text-left hover:bg-well">
            <div className="text-[11px] text-ink-4">{fmtDateTime(t.firstAt, tz)} · n° {t.index}</div>
            <div className="text-[13px] font-medium">{flag(t.country)} {t.name}</div>
            {t.newContinent && <div className="mt-1 inline-flex rounded-full border border-accent/30 px-2 py-px text-[11px] font-medium text-accent">Nouveau continent : {CONTINENT_NAME[t.continent]}</div>}
          </button>
        </li>
      ))}
    </ol>
  );
}

function CountryDetail({ iso2, data, select, discovery, tz, live, regionNames, locate, flyToPlace, isPublic }: PanelProps & { iso2: string }) {
  const info = COUNTRIES.get(iso2);
  const row = data?.countries.find((c) => c.country === iso2);
  const rank = data ? data.countries.findIndex((c) => c.country === iso2) + 1 : 0;
  const disc = discovery.find((d) => d.country === iso2);
  const onlineHere = live?.countries.find((c) => c.country === iso2)?.visitors ?? 0;
  const places = (data?.places ?? []).filter((p) => p.country === iso2);
  const regions = (data?.regions ?? []).filter((r) => r.country === iso2);
  const total = data?.countries.reduce((n, c) => n + c.visitors, 0) || 1;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 py-3">
        <button className="btn-ghost -ml-2" onClick={() => select(null, false)}>← Classement</button>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-3xl leading-none" aria-hidden>{flag(iso2)}</span>
          <div className="min-w-0"><h2 className="truncate text-lg font-semibold tracking-tight">{countryName(iso2)}</h2><p className="text-[12px] text-ink-3">{info ? CONTINENT_NAME[info.continent] : ''}{onlineHere ? ` · ${onlineHere} en ligne` : ''}</p></div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        {disc ? (
          <>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-[12px] [&>*]:bg-surface">
              <div className="p-3"><dt className="text-ink-3">Visiteurs</dt><dd className="tnum mt-0.5 text-[16px] font-semibold">{nf(row?.visitors ?? 0)}</dd></div>
              <div className="p-3"><dt className="text-ink-3">Part</dt><dd className="tnum mt-0.5 text-[16px] font-semibold">{row ? Math.round((row.visitors / total) * 100) : 0} %</dd></div>
              <div className="p-3"><dt className="text-ink-3">Rang</dt><dd className="tnum mt-0.5 text-[16px] font-semibold">{rank ? `n° ${rank}` : '—'}</dd></div>
            </dl>
            <p className="mt-3 text-[12px] text-ink-3">Débloqué le <span className="font-medium text-ink-2">{fmtDateTime(disc.firstAt, tz)}</span> · {nf(disc.visitors)} visiteur{disc.visitors > 1 ? 's' : ''} depuis le début</p>
            {isPublic ? <p className="mt-5 rounded-lg border border-dashed border-line p-3 text-[12px] text-ink-3">Le détail par région et par ville est réservé au tableau de bord du site.</p> : (
              <>
                <h3 className="mt-5 text-[13px] font-semibold">Villes</h3>
                <ul className="mt-2 space-y-0.5">
                  {places.map((p) => {
                    const ll = locate(p.country, p.city, p.lat, p.lon);
                    return (
                      <li key={p.region + p.city}>
                        <button disabled={!ll} onClick={() => ll && flyToPlace(ll[0], ll[1])} className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[13px] hover:bg-well disabled:hover:bg-transparent">
                          <span className="min-w-0 truncate"><span className="font-medium">{p.city}</span>{p.region && <span className="text-ink-4"> · {regionNames?.[`${iso2}-${p.region}`] ?? p.region}</span>}</span>
                          <span className="tnum shrink-0 text-ink-2">{nf(p.visitors)}</span>
                        </button>
                      </li>
                    );
                  })}
                  {!places.length && <li className="px-2 py-3 text-[12px] text-ink-4">Aucune ville sur cette période.</li>}
                </ul>
                {regions.length > 0 && <>
                  <h3 className="mt-5 text-[13px] font-semibold">Régions</h3>
                  <ul className="mt-2 space-y-1">
                    {regions.map((r) => (
                      <li key={r.region} className="flex items-center justify-between px-2 text-[13px]"><span className="truncate">{regionNames?.[`${iso2}-${r.region}`] ?? r.region}</span><span className="tnum text-ink-2">{nf(r.visitors)}</span></li>
                    ))}
                  </ul>
                </>}
              </>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-line p-4 text-[13px] text-ink-3">
            <div className="ml-fog mb-3 h-10 rounded-md" aria-hidden />
            Pas encore découvert. Le premier visiteur venu de {countryName(iso2)} débloquera ce pays
            {info && <> et fera progresser {CONTINENT_NAME[info.continent]}</>}.
          </div>
        )}
      </div>
    </div>
  );
}

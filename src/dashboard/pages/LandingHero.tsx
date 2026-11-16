import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '../components/Link';
import { NumberTicker } from '../components/NumberTicker';
import { SourceIcon } from '../components/Icons';
import { UiIcon } from '../components/UiIcon';
import { channelName, countryName, flag } from '../lib/format';
import { barWidth, CHANNEL_ICON, dayTick, monogram, pct, periodDelta, type PeriodDelta } from '../lib/heroCards';
import { DOT_H, DOT_W, cellOf, centroidOf, landDots } from '../lib/dotmap';
import type { GlobeData, GlobeHandle, GlobePalette } from './hero/globe';
import { ShimmerLink, TrustStrip } from './LandingUi';

type Group = { label: string; value: number; short?: string; raw?: string };
interface Demo {
  current: { visitors: number; pageviews: number };
  previous: { visitors: number };
  online: number;
  series: { date: string; visitors: number }[];
  sources: Group[];
  pages: Group[];
}
type CountryCount = { country: string; visitors: number };
interface Live { online: number; countries: CountryCount[]; recentCountries: CountryCount[] }
interface WorldMap { countries: CountryCount[] }
interface Bots { hits: number; previousHits: number; operators: { operator: string; hits: number }[] }

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/**
 * Real, aggregated numbers of the public demo site, refreshed every 20 s while the tab is visible.
 * Nothing is invented: when the API fails the hero says so and links to the demo.
 */
function useHeroData() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [world, setWorld] = useState<WorldMap | null>(null);
  const [bots, setBots] = useState<Bots | null>(null);
  const [failed, setFailed] = useState(false);
  const [siteId, setSiteId] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    let id = '';
    let tick = 0;
    const get = <T,>(url: string): Promise<T | null> =>
      fetch(url, { signal: ctl.signal }).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
    const load = async () => {
      const first = tick === 0;
      if (!first && document.hidden) return;
      if (!id) {
        const sites = (await get<{ id: string; domain: string }[]>('/api/public/sites')) ?? [];
        const pick = sites.find((s) => s.domain.replace(/^www\./, '') === 'n0.pub') ?? sites[0];
        if (ctl.signal.aborted) return;
        if (!pick) { if (first) setFailed(true); return; }
        id = pick.id;
        setSiteId(id);
      }
      const q = `site=${encodeURIComponent(id)}`;
      // The 30-day country map moves slowly: one refresh in six is enough.
      const wantWorld = tick % 6 === 0;
      tick++;
      const [d, l, b, w] = await Promise.all([
        get<Demo>(`/api/public/demo?days=7&${q}`),
        get<Live>(`/api/public/live-globe?${q}`),
        get<Bots>(`/api/public/bots?${q}`),
        wantWorld ? get<WorldMap>(`/api/public/map?days=30&${q}`) : Promise.resolve(null),
      ]);
      if (ctl.signal.aborted) return;
      if (d) { setDemo(d); setFailed(false); } else if (first) setFailed(true);
      if (l) setLive(l);
      if (b) setBots(b);
      if (w) setWorld(w);
    };
    load();
    const t = window.setInterval(load, 20_000);
    return () => { ctl.abort(); clearInterval(t); };
  }, []);
  return { demo, live, world, bots, failed, siteId };
}

type Rgb = [number, number, number];
const FALLBACK: GlobePalette = {
  dark: false, accent: [37, 99, 235], canvas: [255, 255, 255], surface: [255, 255, 255], well: [250, 250, 250],
  line: [234, 234, 236], lineStrong: [212, 212, 216], ink4: [161, 161, 170],
};

function readPalette(): GlobePalette {
  if (typeof document === 'undefined') return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: Rgb): Rgb => {
    const parts = cs.getPropertyValue(`--${name}`).trim().split(/\s+/).map(Number);
    return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as Rgb) : fb;
  };
  return {
    dark: document.documentElement.classList.contains('dark'),
    accent: v('accent', FALLBACK.accent), canvas: v('canvas', FALLBACK.canvas), surface: v('surface', FALLBACK.surface),
    well: v('well', FALLBACK.well), line: v('line', FALLBACK.line), lineStrong: v('line-strong', FALLBACK.lineStrong), ink4: v('ink-4', FALLBACK.ink4),
  };
}

/** The site's colour tokens for canvas / WebGL drawing, updated when the light / dark theme changes. */
function useSitePalette(): GlobePalette {
  const [palette, setPalette] = useState<GlobePalette>(FALLBACK);
  useEffect(() => {
    setPalette(readPalette());
    const mo = new MutationObserver(() => setPalette(readPalette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return palette;
}
const css = (c: Rgb, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Live indicator: a small steady dot with a soft halo that slowly breathes. */
function LiveDot() {
  return <span className="ml-hx-live" aria-hidden><span /></span>;
}

/** The 3D globe. three.js loads after the first paint; until then (and without WebGL) a CSS sphere holds the place. */
function Globe({ data, online, palette }: { data: GlobeData; online: number | null; palette: GlobePalette }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<GlobeHandle | null>(null);
  const latest = useRef(data);
  const latestPalette = useRef(palette);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    latest.current = data;
    handle.current?.setData(data);
  }, [data]);
  useEffect(() => {
    latestPalette.current = palette;
    handle.current?.setPalette(palette);
  }, [palette]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    const run = () => {
      import('./hero/globe')
        .then(({ createGlobe }) => {
          if (dead) return;
          const h = createGlobe(el, { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, palette: latestPalette.current });
          if (!h) return;
          handle.current = h;
          h.setData(latest.current);
          setReady(true);
        })
        .catch(() => {});
    };
    const timer = window.setTimeout(run, 120);
    return () => {
      dead = true;
      clearTimeout(timer);
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);
  const label = online === null ? 'Globe des visiteurs en direct' : `Globe des visiteurs : ${online} en ligne en ce moment`;
  return (
    <div className="ml-hx-globe" role="img" aria-label={label}>
      <div className={`ml-hx-sphere ${ready ? 'is-hidden' : ''}`} aria-hidden />
      <div ref={host} className="absolute inset-0" />
    </div>
  );
}

/** Flat dot map on a canvas (no SVG markup in the prerendered HTML): same grid and data as the globe. */
function DotMap({ data, palette }: { data: GlobeData; palette: GlobePalette }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const wrapW = cv.clientWidth;
      const wrapH = cv.clientHeight;
      if (!wrapW) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const stageH = wrapH || wrapW * (DOT_H / DOT_W);
      const scale = Math.min(wrapW / DOT_W, stageH / DOT_H);
      cv.width = Math.round(wrapW * dpr);
      cv.height = Math.round(stageH * dpr);
      const cell = scale * dpr;
      const ox = (cv.width - DOT_W * cell) / 2;
      const oy = (cv.height - DOT_H * cell) / 2;
      const g = cv.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, cv.width, cv.height);
      const max = Math.max(1, ...Object.values(data.period));
      const liveSet = new Set(data.live);
      const recent = new Set(data.recent);
      const seen = new Set<string>();
      const dot = (x: number, y: number, r: number, color: string, glow = 0) => {
        g.beginPath();
        g.shadowBlur = glow;
        g.shadowColor = css(palette.accent, 0.6);
        g.fillStyle = color;
        g.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, r, 0, Math.PI * 2);
        g.fill();
      };
      for (const d of landDots()) {
        const v = data.period[d.cc] ?? 0;
        const on = liveSet.has(d.cc) || recent.has(d.cc);
        if (v || on) seen.add(d.cc);
        if (on) dot(d.x, d.y, cell * 0.42, css(palette.accent), cell * 1.2);
        else if (v) dot(d.x, d.y, cell * 0.36, css(palette.accent, 0.35 + 0.6 * Math.sqrt(v / max)));
        else dot(d.x, d.y, cell * 0.3, css(palette.lineStrong, palette.dark ? 0.9 : 1));
      }
      // Small countries without a grid cell still show at their centroid.
      for (const cc of new Set([...Object.keys(data.period), ...data.live, ...data.recent])) {
        if (seen.has(cc)) continue;
        const ll = centroidOf(cc);
        const c = ll && cellOf(ll[0], ll[1]);
        if (c) dot(c.x, c.y, cell * 0.5, css(palette.accent), cell * 1.4);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv.parentElement ?? cv);
    return () => ro.disconnect();
  }, [data, palette]);
  return <canvas ref={ref} className="ml-hx-map-canvas" aria-hidden />;
}

function DayBars({ series }: { series: { date: string; visitors: number }[] | undefined }) {
  if (!series || series.length < 2) {
    return (
      <div className="ml-hx-chart" aria-hidden>
        <div className="ml-hx-bars">
          {[36, 58, 44, 72, 50, 64, 48].map((h, i) => (
            <span key={i} className="ml-hx-skel" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="ml-hx-bar-ticks">{[1, 2, 3, 4, 5, 6, 7].map((d) => <span key={d} />)}</div>
      </div>
    );
  }
  const max = Math.max(1, ...series.map((s) => s.visitors));
  const label = series.map((s) => `${dayTick(s.date)} : ${nf(s.visitors)} visiteurs`).join(', ');
  return (
    <div className="ml-hx-chart">
      <div className="ml-hx-bars" role="img" aria-label={`Visiteurs par jour : ${label}`}>
        {series.map((s) => (
          <span key={s.date} title={`${dayTick(s.date)} : ${nf(s.visitors)} visiteurs`}>
            <i style={{ height: `${Math.max(3, (s.visitors / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="ml-hx-bar-ticks" aria-hidden>
        {series.map((s) => <span key={s.date}>{dayTick(s.date)}</span>)}
      </div>
    </div>
  );
}

function Card({ title, short, className = '', children }: { title: string; short?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`ml-hx-card flex flex-col ${className}`}>
      <h2 className="ml-hx-card-title">
        {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{title}</span></> : title}
      </h2>
      {children}
    </section>
  );
}

function SourceMark({ label }: { label: string }) {
  const icon = CHANNEL_ICON[label as keyof typeof CHANNEL_ICON];
  if (icon) return <UiIcon name={icon} size={13} />;
  return <SourceIcon source={label} size={14} />;
}

function Rows({ rows, total, mono, sources }: { rows: Group[] | undefined; total: number; mono?: boolean; sources?: boolean }) {
  if (!rows) {
    return (
      <ul className="ml-hx-list" aria-hidden>
        {[72, 54, 40, 28].map((w, i) => (
          <li key={i} className="ml-hx-row">
            <span className="ml-hx-row-bar" style={{ width: `${w}%` }} />
            <span className="ml-hx-skel h-3.5 w-3.5 shrink-0 rounded" />
            <span className="ml-hx-skel h-3.5" style={{ width: `${Math.round(w * 0.55)}%` }} />
          </li>
        ))}
      </ul>
    );
  }
  if (!rows.length) return <p className="mt-3 text-[13px] text-ink-3">Pas encore de données sur 7 jours.</p>;
  return (
    <ul className="ml-hx-list">
      {rows.slice(0, 4).map((r) => (
        <li key={r.label} className="ml-hx-row">
          <span className="ml-hx-row-bar" style={{ width: `${barWidth(r.value, total)}%` }} />
          {sources ? <span className="ml-hx-row-ico"><SourceMark label={r.raw ?? r.label} /></span> : null}
          <span className={`relative min-w-0 truncate ${mono ? 'ml-hx-path' : 'text-ink-2'}`} title={r.label}>
            {r.short ? <><span className="sm:hidden">{r.short}</span><span className="hidden sm:inline">{r.label}</span></> : r.label}
          </span>
          <span className="relative tnum shrink-0 font-medium text-ink">{pct(r.value, total)}</span>
        </li>
      ))}
    </ul>
  );
}

function Delta({ value }: { value: PeriodDelta | null }) {
  if (!value) return null;
  const up = value.value >= 0;
  const text = value.kind === 'pct'
    ? `${up ? '+' : '−'}${Math.abs(value.value)} %`
    : `${up ? '+' : '−'}${nf(Math.abs(value.value))}`;
  return (
    <span className={`ml-hx-delta ${up ? '' : 'is-down'}`}>
      <span aria-hidden>{up ? '↑' : '↓'}</span>
      <span className="sr-only">{up ? 'en hausse de' : 'en baisse de'}</span>
      {text}
    </span>
  );
}

function TopCountries({ countries }: { countries: CountryCount[] | undefined }) {
  if (!countries) {
    return (
      <ul className="ml-hx-countries" aria-hidden>
        {[0, 1, 2].map((i) => <li key={i}><span className="ml-hx-skel h-3.5 w-28" /></li>)}
      </ul>
    );
  }
  const top = [...countries].sort((a, b) => b.visitors - a.visitors).slice(0, 3);
  if (!top.length) return <p className="ml-hx-countries-empty">Pas encore de pays sur 30 jours.</p>;
  const max = Math.max(1, top[0].visitors);
  return (
    <ul className="ml-hx-countries">
      {top.map((c) => (
        <li key={c.country}>
          <span className="ml-hx-flag" aria-hidden>{flag(c.country)}</span>
          <span className="min-w-0 truncate text-ink-2">{countryName(c.country)}</span>
          <span className="ml-hx-mini"><span style={{ width: `${barWidth(c.visitors, max)}%` }} /></span>
          <span className="tnum shrink-0 font-medium text-ink">{nf(c.visitors)}</span>
        </li>
      ))}
    </ul>
  );
}

function BotsRow({ bots }: { bots: Bots | null }) {
  const operators = bots?.operators ?? [];
  const rest = operators.slice(3).reduce((n, o) => n + o.hits, 0);
  const items = rest > 0
    ? [...operators.slice(0, 3), { operator: 'Autres', hits: rest }]
    : operators.slice(0, 4);
  const max = Math.max(1, ...items.map((o) => o.hits));
  return (
    <section className="ml-hx-card lg:col-span-12">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="ml-hx-card-title">Robots d’IA</h2>
        {bots && bots.hits > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">
              <span className="tnum font-medium text-ink">{nf(bots.hits)}</span> passages · 7 j
            </span>
            <Delta value={periodDelta(bots.hits, bots.previousHits, 10)} />
          </div>
        )}
      </div>
      {!bots ? (
        <ul className="ml-hx-bots" aria-hidden>
          {[0, 1, 2].map((i) => <li key={i}><span className="ml-hx-skel h-8 w-full" /></li>)}
        </ul>
      ) : bots.hits === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">Aucun passage de robot d’IA détecté sur les 7 derniers jours.</p>
      ) : (
        <ul className="ml-hx-bots">
          {items.map((o) => (
            <li key={o.operator}>
              <span className="ml-hx-mark" aria-hidden>{o.operator === 'Autres' ? '··' : monogram(o.operator)}</span>
              <span className="min-w-0 truncate text-[13px] text-ink-2">{o.operator}</span>
              <span className="ml-hx-mini"><span style={{ width: `${barWidth(o.hits, max)}%` }} /></span>
              <span className="tnum shrink-0 text-[13px] font-medium text-ink">{nf(o.hits)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Channel names that fit a phone-width card. */
const SHORT_CHANNEL: Record<string, string> = { 'Organic Search': 'Recherche', 'Organic Social': 'Réseaux', AI: 'IA', Referral: 'Référents', Paid: 'Pub' };
const EMPTY: GlobeData = { period: {}, live: [], recent: [] };

export function LandingHero() {
  const { demo, live, world, bots, failed, siteId } = useHeroData();
  const palette = useSitePalette();
  const globe = useMemo<GlobeData>(() => {
    if (!world && !live) return EMPTY;
    const period: Record<string, number> = {};
    for (const c of world?.countries ?? []) period[c.country] = c.visitors;
    return { period, live: (live?.countries ?? []).map((c) => c.country), recent: (live?.recentCountries ?? []).map((c) => c.country) };
  }, [world, live]);
  const siteQuery = siteId ? `?site=${encodeURIComponent(siteId)}` : '';
  const online = live?.online ?? demo?.online ?? null;
  const sourcesTotal = demo ? demo.sources.reduce((n, s) => n + s.value, 0) : 0;
  const countries = world ? world.countries.length : null;
  return (
    <section id="hero" className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="ml-hx-aurora" aria-hidden />
      <div className="relative mx-auto max-w-[1120px] px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-14 lg:pt-16">
        <div className="mx-auto max-w-[760px] text-center">
          <Link href={`/demo/map${siteQuery}`} className="ml-hx-pill" aria-live="polite">
            <LiveDot />
            {online !== null
              ? <span><span className="tnum font-semibold text-ink">{nf(online)}</span> {online > 1 ? 'visiteurs en ligne' : 'visiteur en ligne'}</span>
              : failed ? <span>Démo en direct</span> : <><span className="sr-only">Chargement des visiteurs en ligne</span><span className="ml-hx-skel h-3.5 w-36" aria-hidden /></>}
            <UiIcon name="arrow-right" size={13} className="text-ink-4" />
          </Link>
          <h1 id="hero-title" className="mt-5 text-[clamp(2.75rem,11.5vw,5.25rem)] font-bold leading-[0.98] tracking-[-0.05em] text-ink sm:mt-6">
            Votre site vit.<br />Regardez.
          </h1>
          <p className="mx-auto mt-4 max-w-[460px] text-[17px] leading-snug text-ink-3 sm:mt-5 sm:text-[20px]">
            Vos visiteurs, partout dans le monde.<br />En temps réel.
          </p>
        </div>

        <Globe data={globe} online={online} palette={palette} />

        {failed ? (
          <p className="ml-hx-card relative mx-auto max-w-[520px] text-center text-[14px] text-ink-3">
            Les chiffres en direct sont momentanément indisponibles. <Link href="/demo" className="font-medium text-ink underline underline-offset-4">Ouvrir la démo</Link>
          </p>
        ) : (
          <div className="ml-hx-bento relative grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-12" aria-live="polite">
            <Card title="Visiteurs" className="lg:col-span-5">
              <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {demo
                  ? <NumberTicker value={demo.current.visitors} className="tnum text-[32px] font-semibold leading-none tracking-[-0.04em] sm:text-[40px]" />
                  : <span className="ml-hx-skel h-8 w-24 sm:h-10" />}
                {demo && <Delta value={periodDelta(demo.current.visitors, demo.previous.visitors, 20)} />}
              </div>
              <p className="mt-1.5 text-[12px] text-ink-3">sur les 7 derniers jours</p>
              <div className="mt-auto pt-3"><DayBars series={demo?.series} /></div>
            </Card>
            <section className="ml-hx-card is-map flex flex-col lg:col-span-7">
              <div className="ml-hx-card-hd">
                <h2 className="ml-hx-card-title">
                  <span className="sm:hidden">Dans le monde</span>
                  <span className="hidden sm:inline">Visiteurs dans le monde</span>
                </h2>
                <p className="ml-hx-card-meta">
                  {countries === null ? <span className="ml-hx-skel h-3.5 w-24" /> : <><span className="tnum font-medium text-ink-2">{countries}</span> pays · 30 j</>}
                </p>
              </div>
              <div className="ml-hx-map"><DotMap data={globe} palette={palette} /></div>
              <TopCountries countries={world?.countries} />
            </section>
            <Card title="Top sources" className="lg:col-span-6">
              <Rows
                rows={demo?.sources.map((s) => ({ label: channelName(s.label), short: SHORT_CHANNEL[s.label], value: s.value, raw: s.label }))}
                total={sourcesTotal}
                sources
              />
            </Card>
            <Card title="Pages les plus vues" short="Top pages" className="lg:col-span-6">
              <Rows rows={demo?.pages} total={demo?.current.pageviews ?? 0} mono />
            </Card>
            <BotsRow bots={bots} />
          </div>
        )}

        <div className="mt-8 flex flex-col items-center text-center sm:mt-10">
          <ShimmerLink href="/signup" className="ml-hx-cta">Réserver mon accès <UiIcon name="arrow-right" size={18} /></ShimmerLink>
          <Link href={`/demo${siteQuery}`} className="mt-4 inline-flex min-h-[44px] items-center text-[16px] font-medium text-ink underline decoration-ink-4 underline-offset-[5px] transition-colors hover:decoration-accent sm:text-[17px]">Voir la démo en direct</Link>
          <p className="text-[13px] text-ink-3 sm:text-[14px]">Liste d’attente gratuite · Aucune carte requise</p>
          {!failed && <p className="mt-1 text-[12px] text-ink-4">Chiffres réels et agrégés d’un site en production.</p>}
        </div>

        <div className="mt-8 sm:mt-10">
          <TrustStrip />
        </div>
      </div>
    </section>
  );
}

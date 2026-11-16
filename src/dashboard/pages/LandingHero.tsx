import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '../components/Link';
import { NumberTicker } from '../components/NumberTicker';
import { UiIcon, type UiIconName } from '../components/UiIcon';
import { channelName } from '../lib/format';
import { DOT_H, DOT_W, cellOf, centroidOf, landDots } from '../lib/dotmap';
import type { GlobeData, GlobeHandle, GlobePalette } from './hero/globe';
import { ShimmerLink, TrustStrip } from './LandingUi';

type Group = { label: string; value: number; short?: string };
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
const NBSP = String.fromCharCode(160);
/** Share of a total; a non-zero share that rounds to 0 reads « < 1 % », never « 0 % ». */
function pct(v: number, total: number) {
  const p = total > 0 ? (v / total) * 100 : 0;
  return v > 0 && p < 1 ? `<${NBSP}1${NBSP}%` : `${Math.round(p)}${NBSP}%`;
}
/** A change is only shown when the previous period is large enough to mean something. */
function change(now: number, before: number, minBefore: number) {
  if (before < minBefore) return null;
  const c = Math.round(((now - before) / before) * 100);
  return Math.abs(c) <= 300 ? c : null;
}

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

/** The 3D globe. three.js loads after the first paint; until then (and without WebGL) a CSS sphere holds the place. */
function Globe({ data, online, failed, palette }: { data: GlobeData; online: number | null; failed: boolean; palette: GlobePalette }) {
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
      {!(failed && online === null) && (
        <div className="ml-hx-online" aria-hidden>
          <span className="ml-hx-live-dot" />
          {online === null
            ? <span className="ml-hx-skel h-4 w-32" />
            : <span><span className="tnum font-semibold">{nf(online)}</span> {online > 1 ? 'visiteurs en ligne' : 'visiteur en ligne'}</span>}
        </div>
      )}
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
      const w = cv.clientWidth;
      if (!w) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cell = (w * dpr) / DOT_W;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(cell * DOT_H);
      const g = cv.getContext('2d');
      if (!g) return;
      const max = Math.max(1, ...Object.values(data.period));
      const liveSet = new Set(data.live);
      const recent = new Set(data.recent);
      const seen = new Set<string>();
      const dot = (x: number, y: number, r: number, color: string, glow = 0) => {
        g.beginPath();
        g.shadowBlur = glow;
        g.shadowColor = css(palette.accent, 0.6);
        g.fillStyle = color;
        g.arc((x + 0.5) * cell, (y + 0.5) * cell, r, 0, Math.PI * 2);
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
    ro.observe(cv);
    return () => ro.disconnect();
  }, [data, palette]);
  return <canvas ref={ref} className="block w-full" style={{ aspectRatio: `${DOT_W} / ${DOT_H}` }} aria-hidden />;
}

/** Smooth 7-day curve. The viewBox stretches, so the end dot is an HTML element positioned on top. */
function Sparkline({ values }: { values: number[] }) {
  const W = 300, H = 72, pad = 6;
  if (values.length < 2) return <div className="h-[56px] sm:h-[72px]" />;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - pad - (v / max) * (H - pad * 2)] as const);
  let d = `M${pts[0][0]},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const lastY = pts[pts.length - 1][1];
  return (
    <div className="relative mt-3 h-[56px] sm:h-[72px]" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="ml-hx-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity=".22" />
            <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#ml-hx-area)" />
        <path d={d} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="ml-hx-spark-dot" style={{ top: `${(lastY / H) * 100}%` }} />
    </div>
  );
}

function Card({ icon, title, short, className = '', children }: { icon: UiIconName; title: string; short?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`ml-hx-card flex flex-col ${className}`}>
      <h2 className="flex items-center gap-2.5 text-[13px] font-medium text-ink-2 sm:text-[14px]">
        <span className="ml-hx-icon"><UiIcon name={icon} size={15} /></span>
        <span className="truncate">{short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{title}</span></> : title}</span>
      </h2>
      {children}
    </section>
  );
}

function Rows({ rows, total, mono }: { rows: Group[] | undefined; total: number; mono?: boolean }) {
  if (!rows) {
    return <ul className="mt-2.5" aria-hidden>{[70, 54, 62, 46].map((w, i) => <li key={i} className="ml-hx-row"><span className="ml-hx-skel h-3.5" style={{ width: `${w}%` }} /></li>)}</ul>;
  }
  if (!rows.length) return <p className="mt-3 text-[13px] text-ink-3">Pas encore de données sur 7 jours.</p>;
  return (
    <ul className="mt-2.5">
      {rows.slice(0, 4).map((r) => (
        <li key={r.label} className="ml-hx-row">
          <span className={`min-w-0 truncate text-ink-2 ${mono ? 'font-mono text-[12px] sm:text-[13px]' : ''}`} title={r.label}>
            {r.short ? <><span className="sm:hidden">{r.short}</span><span className="hidden sm:inline">{r.label}</span></> : r.label}
          </span>
          <span className="tnum shrink-0 font-medium text-ink">{pct(r.value, total)}</span>
        </li>
      ))}
    </ul>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span className={`ml-hx-delta ${up ? '' : 'is-down'}`}>
      <span aria-hidden>{up ? '↑' : '↓'}</span>
      <span className="sr-only">{up ? 'en hausse de' : 'en baisse de'}</span>
      {up ? '+' : '−'}{Math.abs(value)}&nbsp;%
    </span>
  );
}

function BotsRow({ bots }: { bots: Bots | null }) {
  const top = bots?.operators.slice(0, 3) ?? [];
  const rest = bots ? bots.operators.slice(3).reduce((n, o) => n + o.hits, 0) : 0;
  return (
    <section className="ml-hx-card col-span-2 lg:order-5 lg:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2.5 text-[13px] font-medium text-ink-2 sm:text-[14px]">
          <span className="ml-hx-icon"><UiIcon name="bot" size={15} /></span>
          Robots d’IA
        </h2>
        {bots && bots.hits > 0 && (
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[12px] text-ink-2"><span className="tnum font-medium text-ink">{nf(bots.hits)}</span> passages · 7 j</span>
            <Delta value={change(bots.hits, bots.previousHits, 10)} />
          </div>
        )}
      </div>
      {!bots ? (
        <div className="mt-3 flex gap-6" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="ml-hx-skel h-4 w-24" />)}</div>
      ) : bots.hits === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">Aucun passage de robot d’IA détecté sur les 7 derniers jours.</p>
      ) : (
        <ul className="ml-hx-bots mt-3">
          {top.map((o) => (
            <li key={o.operator}><span className="truncate text-ink-2">{o.operator}</span><span className="tnum text-ink-3">{nf(o.hits)}</span></li>
          ))}
          {rest > 0 && <li><span className="text-ink-2">Autres</span><span className="tnum text-ink-3">{nf(rest)}</span></li>}
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
          <Link href={`/demo/map${siteQuery}`} className="ml-hx-pill">
            <span className="ml-hx-live-dot" aria-hidden /> Le monde en direct
          </Link>
          <h1 id="hero-title" className="mt-5 text-[clamp(2.75rem,11.5vw,5.25rem)] font-bold leading-[0.98] tracking-[-0.05em] text-ink sm:mt-6">
            Votre site vit.<br />Regardez.
          </h1>
          <p className="mx-auto mt-4 max-w-[460px] text-[17px] leading-snug text-ink-3 sm:mt-5 sm:text-[20px]">
            Vos visiteurs, partout dans le monde.<br />En temps réel.
          </p>
        </div>

        <Globe data={globe} online={online} failed={failed} palette={palette} />

        {failed ? (
          <p className="ml-hx-card relative mx-auto max-w-[520px] text-center text-[14px] text-ink-3">
            Les chiffres en direct sont momentanément indisponibles. <Link href="/demo" className="font-medium text-ink underline underline-offset-4">Ouvrir la démo</Link>
          </p>
        ) : (
          <div className="relative grid grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)] gap-2.5 sm:gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)]" aria-live="polite">
            <Card icon="activity" title="Visiteurs" className="lg:order-1">
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {demo
                  ? <NumberTicker value={demo.current.visitors} className="text-[30px] font-bold leading-none tracking-[-0.03em] sm:text-[40px]" />
                  : <span className="ml-hx-skel h-8 w-24 sm:h-10" />}
                {demo && <Delta value={change(demo.current.visitors, demo.previous.visitors, 20)} />}
              </div>
              <p className="mt-1.5 text-[12px] text-ink-3 sm:text-[13px]">sur les 7 derniers jours</p>
              <div className="mt-auto"><Sparkline values={demo ? demo.series.map((s) => s.visitors) : []} /></div>
            </Card>
            <Card icon="link" title="Top sources" className="lg:order-3">
              <Rows rows={demo?.sources.map((s) => ({ label: channelName(s.label), short: SHORT_CHANNEL[s.label], value: s.value }))} total={sourcesTotal} />
            </Card>
            <Card icon="globe" title="Visiteurs dans le monde" short="Dans le monde" className="lg:order-2">
              <div className="mt-3"><DotMap data={globe} palette={palette} /></div>
              <p className="mt-auto pt-2 text-[12px] text-ink-3 sm:text-[13px]">
                {countries === null ? <span className="ml-hx-skel h-3.5 w-24" /> : <><span className="tnum font-medium text-ink-2">{countries}</span> pays sur 30 jours</>}
              </p>
            </Card>
            <Card icon="layers" title="Pages les plus vues" short="Top pages" className="lg:order-4">
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

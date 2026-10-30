import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type Mode = 'globe' | 'flat';
export interface CountryFeature { iso2: string; feature: Feature<Polygon | MultiPolygon>; center: [number, number]; span: number }
export interface MapPoint { key: string; lon: number; lat: number; value: number; label: string; country: string }
export interface LivePoint { key: string; lon: number; lat: number; value: number }
export interface GeoMapHandle {
  flyTo(lon: number, lat: number, k: number): void;
  flyToCountry(iso2: string): void;
  zoomBy(f: number): void;
  reset(): void;
  celebrate(lon: number, lat: number): void;
}
interface View { lon: number; lat: number; k: number }
interface Props {
  mode: Mode;
  countries: CountryFeature[];
  /** 0..1 intensity for countries with visitors in the period; undefined = not reached in the period. */
  intensity: Map<string, number>;
  discovered: Set<string>;
  points: MapPoint[];
  live: LivePoint[];
  selected: string | null;
  onSelectCountry(iso2: string | null): void;
  onSelectPoint?(p: MapPoint): void;
  onHover?(info: { iso2: string; x: number; y: number } | null): void;
  onZoom?(k: number): void;
  label: string;
}

const MIN_K = 0.9, MAX_K = 60;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (l: number) => ((((l + 180) % 360) + 360) % 360) - 180;

function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => (cs.getPropertyValue('--' + k).trim() || '128 128 128').split(/\s+/).join(',');
  return { canvas: v('canvas'), surface: v('surface'), well: v('well'), line: v('line'), strong: v('line-strong'), ink: v('ink'), ink3: v('ink-3'), ink4: v('ink-4'), accent: v('accent'), success: v('success'), dark: document.documentElement.classList.contains('dark') };
}

/** Largest polygon of a country (so France is centred on metropolitan France, not on its overseas regions). */
export function mainland(f: Feature<Polygon | MultiPolygon>): Feature<Polygon> {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon>;
  let best: Feature<Polygon> | null = null, area = -1;
  for (const coords of f.geometry.coordinates) {
    const p: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    const a = geoArea(p);
    if (a > area) { area = a; best = p; }
  }
  return best!;
}
export function frame(f: Feature<Polygon | MultiPolygon>): { center: [number, number]; span: number } {
  const m = mainland(f);
  const [[x0, y0], [x1, y1]] = geoBounds(m);
  const spanLon = x1 >= x0 ? x1 - x0 : x1 + 360 - x0;
  return { center: geoCentroid(m) as [number, number], span: Math.max(spanLon * Math.cos(((y0 + y1) / 2) * Math.PI / 180), y1 - y0, 0.5) };
}

/**
 * Canvas world map: orthographic globe or Natural Earth plan, both driven by the same view (centre + zoom).
 * Drag to pan/rotate, wheel / pinch / buttons to zoom around the pointer, tap a country to select it.
 * Redraws only while something moves (drag, fly, idle spin, live pulses).
 */
export const GeoMap = forwardRef<GeoMapHandle, Props>(function GeoMap(props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const p = useRef(props);
  p.current = props;
  const view = useRef<View>({ lon: 10, lat: 25, k: 1 });
  const anim = useRef<{ from: View; to: View; start: number; dur: number } | null>(null);
  const size = useRef({ w: 800, h: 600, dpr: 1 });
  const last = useRef(0);
  const dirty = useRef(true);
  const interactedAt = useRef(0);
  const bursts = useRef<{ lon: number; lat: number; start: number }[]>([]);
  const pal = useRef<ReturnType<typeof palette> | null>(null);
  const fog = useRef<CanvasPattern | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function baseScale(mode: Mode) {
    const { w, h } = size.current;
    return mode === 'globe' ? Math.min(w, h) * 0.42 : Math.min(w / 6.1, h / 3.2);
  }
  function projection(v = view.current, mode = p.current.mode): GeoProjection {
    const { w, h } = size.current;
    const s = baseScale(mode) * v.k;
    return mode === 'globe'
      ? geoOrthographic().rotate([-v.lon, -v.lat]).scale(s).translate([w / 2, h / 2]).clipAngle(90).precision(0.4)
      : geoNaturalEarth1().rotate([-v.lon, 0]).center([0, v.lat]).scale(s).translate([w / 2, h / 2]).precision(0.4);
  }
  function clampView(v: View): View {
    const maxLat = p.current.mode === 'globe' ? 85 : Math.max(0, 80 - 60 / v.k);
    return { lon: wrap(v.lon), lat: Math.max(-maxLat, Math.min(maxLat, v.lat)), k: clampK(v.k) };
  }
  function flyTo(lon: number, lat: number, k: number, dur = 1000) {
    const from = { ...view.current };
    let dl = wrap(lon - from.lon);
    const to = clampView({ lon: from.lon + dl, lat, k });
    to.lon = from.lon + dl;
    anim.current = { from, to, start: performance.now(), dur: reduced ? 1 : dur };
    interactedAt.current = performance.now();
    dirty.current = true;
  }
  function zoomAt(f: number, px?: number, py?: number) {
    const v = view.current;
    const nk = clampK(v.k * f);
    if (px === undefined || py === undefined) { view.current = clampView({ ...v, k: nk }); dirty.current = true; return; }
    const before = projection(v).invert?.([px, py]);
    const next = { ...v, k: nk };
    const after = projection(next).invert?.([px, py]);
    if (before && after && Number.isFinite(before[0]) && Number.isFinite(after[0])) {
      next.lon += wrap(before[0] - after[0]);
      next.lat += before[1] - after[1];
    }
    view.current = clampView(next);
    dirty.current = true;
  }

  useImperativeHandle(ref, () => ({
    flyTo: (lon, lat, k) => flyTo(lon, lat, k),
    flyToCountry: (iso2) => {
      const c = p.current.countries.find((x) => x.iso2 === iso2);
      if (!c) return;
      const k = p.current.mode === 'globe' ? 95 / c.span : 140 / c.span;
      flyTo(c.center[0], c.center[1], Math.min(24, Math.max(1.3, k)));
    },
    zoomBy: (f) => { const { w, h } = size.current; anim.current = null; zoomAt(f, w / 2, h / 2); interactedAt.current = performance.now(); },
    reset: () => flyTo(view.current.lon, 20, 1),
    celebrate: (lon, lat) => { bursts.current.push({ lon, lat, start: performance.now() }); dirty.current = true; },
  }));

  // Theme changes (dark class on <html>) → recompute colours.
  useEffect(() => {
    const read = () => { pal.current = palette(); fog.current = null; dirty.current = true; };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => { dirty.current = true; }, [props.mode, props.countries, props.intensity, props.discovered, props.points, props.live, props.selected]);
  useEffect(() => { view.current = clampView(view.current); }, [props.mode]);

  // Resize.
  useEffect(() => {
    const el = canvas.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w: Math.max(1, r.width), h: Math.max(1, r.height), dpr };
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      dirty.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render loop.
  useEffect(() => {
    let raf = 0;
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const grat = geoGraticule10();
    const sphere = { type: 'Sphere' } as const;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(64, now - (last.current || now));
      last.current = now;
      const pr = p.current;
      // Fly-to animation.
      const a = anim.current;
      if (a) {
        const t = Math.min(1, (now - a.start) / a.dur);
        const e = ease(t);
        const far = pr.mode === 'globe' ? geoDistance([a.from.lon, a.from.lat], [a.to.lon, a.to.lat]) : 0;
        const dip = far > 1 ? Math.sin(Math.PI * e) * 0.35 : 0; // zoom out a little on long flights
        view.current = clampView({
          lon: a.from.lon + (a.to.lon - a.from.lon) * e,
          lat: a.from.lat + (a.to.lat - a.from.lat) * e,
          k: Math.exp(Math.log(a.from.k) + (Math.log(a.to.k) - Math.log(a.from.k)) * e) * (1 - dip),
        });
        if (t >= 1) anim.current = null;
        dirty.current = true;
      }
      // Gentle idle spin on the globe.
      if (!reduced && pr.mode === 'globe' && !a && view.current.k < 1.6 && now - interactedAt.current > 6000 && !drag.current) {
        view.current = { ...view.current, lon: wrap(view.current.lon - dt * 0.004) };
        dirty.current = true;
      }
      const pulsing = pr.live.length > 0 || bursts.current.length > 0;
      if (!dirty.current && !pulsing) return;
      dirty.current = false;
      draw(ctx, now);
    };
    raf = requestAnimationFrame(loop);
    function draw(ctx: CanvasRenderingContext2D, now: number) {
      const { w, h, dpr } = size.current;
      const pr = p.current;
      const c = pal.current ?? palette();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const proj = projection();
      const path = geoPath(proj, ctx);
      const k = view.current.k;
      if (!fog.current) {
        const t = document.createElement('canvas');
        t.width = t.height = 8;
        const g = t.getContext('2d')!;
        g.fillStyle = `rgba(${c.well},1)`; g.fillRect(0, 0, 8, 8);
        g.strokeStyle = `rgba(${c.strong},${c.dark ? 0.55 : 0.7})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
        fog.current = ctx.createPattern(t, 'repeat');
      }
      // Ocean / sphere.
      ctx.beginPath(); path(sphere);
      ctx.fillStyle = pr.mode === 'globe' ? `rgba(${c.surface},1)` : `rgba(${c.surface},1)`;
      ctx.fill();
      ctx.beginPath(); path(grat);
      ctx.strokeStyle = `rgba(${c.line},${c.dark ? 0.9 : 1})`; ctx.lineWidth = 0.6; ctx.stroke();
      // Countries.
      const center: [number, number] = [view.current.lon, view.current.lat];
      for (const f of pr.countries) {
        if (pr.mode === 'globe' && geoDistance(center, f.center) > Math.PI / 2 + 0.6 + f.span / 57) continue;
        ctx.beginPath(); path(f.feature);
        const it = pr.intensity.get(f.iso2);
        if (it !== undefined) ctx.fillStyle = `rgba(${c.accent},${0.28 + 0.62 * it})`;
        else if (pr.discovered.has(f.iso2)) ctx.fillStyle = `rgba(${c.accent},${c.dark ? 0.16 : 0.13})`;
        else ctx.fillStyle = fog.current!;
        ctx.fill();
        ctx.strokeStyle = it !== undefined || pr.discovered.has(f.iso2) ? `rgba(${c.surface},${c.dark ? 0.55 : 0.9})` : `rgba(${c.strong},${c.dark ? 0.8 : 1})`;
        ctx.lineWidth = Math.min(1.2, 0.5 + k * 0.05);
        ctx.stroke();
      }
      if (pr.selected) {
        const f = pr.countries.find((x) => x.iso2 === pr.selected);
        if (f) { ctx.beginPath(); path(f.feature); ctx.strokeStyle = `rgba(${c.ink},1)`; ctx.lineWidth = 1.6; ctx.stroke(); }
      }
      ctx.beginPath(); path(sphere);
      ctx.strokeStyle = `rgba(${c.strong},1)`; ctx.lineWidth = 1; ctx.stroke();
      // Points (cities).
      const visible = (lon: number, lat: number) => pr.mode !== 'globe' || geoDistance(center, [lon, lat]) < Math.PI / 2 - 0.02;
      const max = Math.max(1, ...pr.points.map((x) => x.value));
      const labels: { x: number; y: number; r: number; t: string }[] = [];
      for (const pt of pr.points) {
        if (!visible(pt.lon, pt.lat)) continue;
        const xy = proj([pt.lon, pt.lat]);
        if (!xy) continue;
        const r = 2.5 + Math.sqrt(pt.value / max) * Math.min(9, 3 + k * 0.6);
        ctx.beginPath(); ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.accent},0.95)`; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${c.surface},1)`; ctx.stroke();
        if (k >= 2.5) labels.push({ x: xy[0], y: xy[1], r, t: pt.label });
      }
      // Live visitors: pulsing rings.
      for (const lv of pr.live) {
        if (!visible(lv.lon, lv.lat)) continue;
        const xy = proj([lv.lon, lv.lat]);
        if (!xy) continue;
        const ph = ((now / 1600) + (lv.lon + 180) / 360) % 1;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 4 + ph * 18, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c.success},${0.7 * (1 - ph)})`; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.success},1)`; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(${c.surface},1)`; ctx.stroke();
      }
      // New-country celebration: three expanding rings.
      bursts.current = bursts.current.filter((b) => now - b.start < 2600);
      for (const b of bursts.current) {
        if (!visible(b.lon, b.lat)) continue;
        const xy = proj([b.lon, b.lat]);
        if (!xy) continue;
        for (let i = 0; i < 3; i++) {
          const t = (now - b.start - i * 250) / 1800;
          if (t < 0 || t > 1) continue;
          ctx.beginPath(); ctx.arc(xy[0], xy[1], 6 + ease(t) * 70, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${c.accent},${0.8 * (1 - t)})`; ctx.lineWidth = 2.5 * (1 - t) + 0.5; ctx.stroke();
        }
      }
      // City labels (avoid overlaps, biggest first — points are sorted by visitors).
      ctx.font = '500 11px Geist, Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const boxes: [number, number, number, number][] = [];
      for (const l of labels.slice(0, 60)) {
        const tw = ctx.measureText(l.t).width;
        const bx = l.x + l.r + 4, by = l.y - 8;
        if (boxes.some(([x, y, w2, h2]) => bx < x + w2 && bx + tw + 8 > x && by < y + h2 && by + 16 > y)) continue;
        boxes.push([bx, by, tw + 8, 16]);
        ctx.fillStyle = `rgba(${c.surface},0.85)`;
        ctx.fillRect(bx - 2, by, tw + 6, 16);
        ctx.fillStyle = `rgba(${c.ink},1)`;
        ctx.fillText(l.t, bx + 1, l.y);
      }
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  // Pointer interaction.
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; k: number } | null>(null);
  useEffect(() => {
    const el = canvas.current!;
    const local = (e: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
    const degPerPx = () => 180 / (Math.PI * baseScale(p.current.mode) * view.current.k);
    function down(e: PointerEvent) {
      el.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      pointers.current.set(e.pointerId, { x, y });
      anim.current = null;
      interactedAt.current = performance.now();
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k };
        drag.current = null;
      } else {
        drag.current = { x, y, v: { ...view.current }, moved: false };
      }
    }
    function move(e: PointerEvent) {
      const [x, y] = local(e);
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x, y });
      if (pinch.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = clampK(pinch.current.k * (d / Math.max(1, pinch.current.d)));
        zoomAt(target / view.current.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
        interactedAt.current = performance.now();
        return;
      }
      const dr = drag.current;
      if (dr) {
        const dx = x - dr.x, dy = y - dr.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) dr.moved = true;
        const g = degPerPx();
        view.current = clampView({ lon: dr.v.lon - dx * g, lat: dr.v.lat + dy * g, k: view.current.k });
        dirty.current = true;
        interactedAt.current = performance.now();
        return;
      }
      if (e.pointerType === 'mouse') hover(x, y);
    }
    function up(e: PointerEvent) {
      const [x, y] = local(e);
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      const dr = drag.current;
      drag.current = null;
      if (dr && !dr.moved) click(x, y);
    }
    function wheel(e: WheelEvent) {
      e.preventDefault();
      anim.current = null;
      const [x, y] = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)), x, y);
      interactedAt.current = performance.now();
    }
    function pick(x: number, y: number): string | null {
      const ll = projection().invert?.([x, y]);
      if (!ll || !Number.isFinite(ll[0])) return null;
      if (p.current.mode === 'globe' && geoDistance(ll as [number, number], [view.current.lon, view.current.lat]) > Math.PI / 2) return null;
      for (const f of p.current.countries) if (geoContains(f.feature, ll as [number, number])) return f.iso2;
      return null;
    }
    function click(x: number, y: number) {
      const proj = projection();
      const pr = p.current;
      for (const pt of pr.points) {
        if (pr.mode === 'globe' && geoDistance([view.current.lon, view.current.lat], [pt.lon, pt.lat]) > Math.PI / 2) continue;
        const xy = proj([pt.lon, pt.lat]);
        if (xy && Math.hypot(xy[0] - x, xy[1] - y) < 10) { pr.onSelectPoint?.(pt); return; }
      }
      pr.onSelectCountry(pick(x, y));
    }
    let hoverRaf = 0;
    function hover(x: number, y: number) {
      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => {
        const iso = pick(x, y);
        p.current.onHover?.(iso ? { iso2: iso, x, y } : null);
        el.style.cursor = iso ? 'pointer' : 'grab';
      });
    }
    const leave = () => p.current.onHover?.(null);
    const dbl = (e: MouseEvent) => { const [x, y] = local(e); flyTo(...(projection().invert?.([x, y]) ?? [view.current.lon, view.current.lat]) as [number, number], view.current.k * 2, 500); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
    };
  }, []);

  // Report zoom level (for loading the detailed borders) at most a few times per second.
  useEffect(() => {
    const t = setInterval(() => p.current.onZoom?.(view.current.k), 300);
    return () => clearInterval(t);
  }, []);

  return (
    <canvas
      ref={canvas}
      className="block h-full w-full touch-none select-none outline-none"
      style={{ cursor: 'grab' }}
      role="img"
      aria-label={props.label}
      tabIndex={0}
      onKeyDown={(e) => {
        const v = view.current;
        const step = 20 / v.k;
        if (e.key === '+' || e.key === '=') zoomAt(1.5);
        else if (e.key === '-') zoomAt(1 / 1.5);
        else if (e.key === 'ArrowLeft') flyTo(v.lon - step, v.lat, v.k, 250);
        else if (e.key === 'ArrowRight') flyTo(v.lon + step, v.lat, v.k, 250);
        else if (e.key === 'ArrowUp') flyTo(v.lon, v.lat + step, v.k, 250);
        else if (e.key === 'ArrowDown') flyTo(v.lon, v.lat - step, v.k, 250);
        else return;
        e.preventDefault();
        interactedAt.current = performance.now();
      }}
    />
  );
});

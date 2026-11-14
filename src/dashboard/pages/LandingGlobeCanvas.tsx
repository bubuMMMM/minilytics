import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';
import { GLOBE_PHI, GLOBE_THETA, LIVE_ARCS, LIVE_VISITS, toCamera, toPixel, worldFromLatLng } from './LandingGlobe';

/** Adapted from 21st.dev / Magic UI Globe (dillionverma, id 1128) on cobe, without motion/react-spring. */
export default function GlobeCanvas({ onReady }: { onReady?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const readyOnce = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const wrapEl = wrap.current;
    const gl = glRef.current;
    const overlay = overlayRef.current;
    if (!wrapEl || !gl || !overlay) return;

    const dark = () => document.documentElement.classList.contains('dark');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let phi = GLOBE_PHI;
    let theta = GLOBE_THETA;
    let velPhi = 0;
    let velTheta = 0;
    let dragging: { x: number; y: number; captured: boolean } | null = null;
    let width = 0;
    let globe: ReturnType<typeof createGlobe> | undefined;
    let visible = true;
    let hidden = document.hidden;
    let cancelled = false;
    let theme = dark();

    const markers = LIVE_VISITS.map((v) => ({ location: [v.lat, v.lon] as [number, number], size: v.size }));
    const worlds = LIVE_VISITS.map((m) => worldFromLatLng(m.lat, m.lon));
    const arcs = LIVE_ARCS.map(([a, b]) => [worlds[a], worlds[b]] as const);

    const colors = (isDark: boolean) => isDark
      ? {
          dark: 1,
          baseColor: [0.16, 0.26, 0.48] as [number, number, number],
          markerColor: [0.376, 0.647, 0.98] as [number, number, number],
          glowColor: [0.08, 0.12, 0.22] as [number, number, number],
          mapBrightness: 3.2,
          mapBaseBrightness: 0.1,
          diffuse: 1.12,
        }
      : {
          dark: 0,
          baseColor: [0.92, 0.93, 0.95] as [number, number, number],
          markerColor: [0.145, 0.388, 0.922] as [number, number, number],
          glowColor: [0.86, 0.9, 0.98] as [number, number, number],
          mapBrightness: 1.55,
          mapBaseBrightness: 0.08,
          diffuse: 1.05,
        };

    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    const measure = () => { width = wrapEl.offsetWidth; };
    const fitCanvas = (el: HTMLCanvasElement) => {
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.display = 'block';
    };

    const drawOverlay = (now: number) => {
      const ctx = overlay.getContext('2d');
      if (!ctx || width <= 0) return;
      const px = Math.min(2, window.devicePixelRatio || 1);
      if (overlay.width !== Math.floor(width * px) || overlay.height !== Math.floor(width * px)) {
        overlay.width = Math.floor(width * px);
        overlay.height = Math.floor(width * px);
      }
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.clearRect(0, 0, width, width);
      const accent = theme ? '96, 165, 250' : '37, 99, 235';
      const tTravel = reduce ? 0.45 : ((now / 2800) % 1);
      const arcAlpha = theme ? 0.7 : 0.55;

      for (const [wa, wb] of arcs) {
        const pts: { x: number; y: number; z: number }[] = [];
        const steps = 32;
        for (let i = 0; i <= steps; i++) {
          const p = slerp(wa, wb, i / steps);
          const h = toCamera(p, phi, theta);
          const xy = toPixel(h, width, width);
          pts.push({ x: xy.x, y: xy.y, z: h[2] });
        }
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (p.z <= 0.02) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(${accent}, ${theme ? 0.18 : 0.14})`;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.beginPath();
        started = false;
        for (const p of pts) {
          if (p.z <= 0.02) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(${accent}, ${arcAlpha})`;
        ctx.lineWidth = 1.85;
        ctx.stroke();

        if (reduce) continue;
        const mid = slerp(wa, wb, tTravel);
        const hm = toCamera(mid, phi, theta);
        if (hm[2] > 0.08) {
          const xy = toPixel(hm, width, width);
          const g = ctx.createRadialGradient(xy.x, xy.y, 0, xy.x, xy.y, 9);
          g.addColorStop(0, `rgba(${accent}, 0.95)`);
          g.addColorStop(0.45, `rgba(${accent}, 0.45)`);
          g.addColorStop(1, `rgba(${accent}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(xy.x, xy.y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      worlds.forEach((world, i) => {
        const h = toCamera(world, phi, theta);
        if (h[2] <= 0.04) return;
        const { x, y } = toPixel(h, width, width);
        const depth = Math.min(1, Math.max(0.35, h[2]));
        const pulse = reduce ? 1 : 0.75 + 0.25 * Math.sin(now / 520 + i * 0.9);
        const halo = 11 * pulse * (0.7 + 0.3 * depth);
        const core = 3.1 * (0.85 + 0.15 * depth);
        const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
        g.addColorStop(0, `rgba(${accent}, ${0.55 * depth})`);
        g.addColorStop(0.45, `rgba(${accent}, ${0.2 * depth})`);
        g.addColorStop(1, `rgba(${accent}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, halo, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, core + 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent}, ${0.35 * depth})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, core, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent}, ${0.95 * depth})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.1, core * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = theme ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.95)';
        ctx.fill();
      });
    };

    const startGlobe = () => {
      globe?.destroy();
      measure();
      if (width < 8) return;
      const pal = colors(theme);
      const samples = width < 420 ? 8000 : 14000;
      const px = dpr();
      try {
        globe = createGlobe(gl, {
          devicePixelRatio: px,
          width: width * px,
          height: width * px,
          phi,
          theta,
          dark: pal.dark,
          diffuse: pal.diffuse,
          mapSamples: samples,
          mapBrightness: pal.mapBrightness,
          mapBaseBrightness: pal.mapBaseBrightness,
          baseColor: pal.baseColor,
          markerColor: pal.markerColor,
          glowColor: pal.glowColor,
          markers,
          scale: 1,
          offset: [0, 0],
          context: { alpha: true, antialias: true, preserveDrawingBuffer: true },
          onRender: (state) => {
            if (cancelled) return;
            if (visible && !hidden && !dragging && !reduce) phi += 0.0028;
            if (!dragging) {
              phi += velPhi;
              theta += velTheta;
              velPhi *= 0.93;
              velTheta *= 0.93;
              if (Math.abs(velPhi) < 1e-5) velPhi = 0;
              if (Math.abs(velTheta) < 1e-5) velTheta = 0;
            }
            theta = Math.max(-0.7, Math.min(0.85, theta));
            state.phi = phi;
            state.theta = theta;
            state.width = width * px;
            state.height = width * px;
            drawOverlay(performance.now());
            if (!readyOnce.current) {
              readyOnce.current = true;
              gl.style.opacity = '1';
              overlay.style.opacity = '1';
              onReadyRef.current?.();
            }
          },
        });
        fitCanvas(gl);
        fitCanvas(overlay);
      } catch {
        onReadyRef.current?.();
      }
    };

    const ro = new ResizeObserver(() => {
      const prev = width;
      measure();
      if (width < 8) return;
      if (!globe) startGlobe();
      else if (Math.abs(prev - width) > 1) startGlobe();
    });
    ro.observe(wrapEl);
    measure();
    if (width >= 8) startGlobe();

    const vis = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    vis.observe(wrapEl);
    const onHide = () => { hidden = document.hidden; };
    document.addEventListener('visibilitychange', onHide);

    const mo = new MutationObserver(() => {
      const next = dark();
      if (next === theme) return;
      theme = next;
      startGlobe();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const onDown = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY, captured: false };
      velPhi = 0;
      velTheta = 0;
      wrapEl.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || width <= 0) return;
      const dx = e.clientX - dragging.x;
      const dy = e.clientY - dragging.y;
      if (!dragging.captured) {
        if (e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
          dragging = null;
          wrapEl.style.cursor = 'grab';
          return;
        }
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          dragging.captured = true;
          try { wrapEl.setPointerCapture(e.pointerId); } catch { /* already captured */ }
        } else return;
      }
      e.preventDefault();
      const dPhi = dx / width * 2.2;
      const dTheta = dy / width * 1.4;
      phi += dPhi;
      theta += dTheta;
      velPhi = dPhi;
      velTheta = dTheta;
      dragging.x = e.clientX;
      dragging.y = e.clientY;
    };
    const onUp = () => {
      dragging = null;
      wrapEl.style.cursor = 'grab';
    };

    wrapEl.addEventListener('pointerdown', onDown);
    wrapEl.addEventListener('pointermove', onMove);
    wrapEl.addEventListener('pointerup', onUp);
    wrapEl.addEventListener('pointercancel', onUp);
    wrapEl.addEventListener('pointerleave', onUp);

    return () => {
      cancelled = true;
      globe?.destroy();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onHide);
      vis.disconnect();
      mo.disconnect();
      wrapEl.removeEventListener('pointerdown', onDown);
      wrapEl.removeEventListener('pointermove', onMove);
      wrapEl.removeEventListener('pointerup', onUp);
      wrapEl.removeEventListener('pointercancel', onUp);
      wrapEl.removeEventListener('pointerleave', onUp);
    };
  }, []);

  return (
    <div ref={wrap} className="absolute inset-[6%] cursor-grab touch-pan-y" style={{ touchAction: 'pan-y' }}>
      <canvas ref={glRef} className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700" aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700" aria-hidden />
    </div>
  );
}

function slerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dot = Math.max(-1, Math.min(1, dot));
  const th = Math.acos(dot);
  if (th < 1e-4) return a;
  const s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s;
  const w2 = Math.sin(t * th) / s;
  const x = a[0] * w1 + b[0] * w2;
  const y = a[1] * w1 + b[1] * w2;
  const z = a[2] * w1 + b[2] * w2;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

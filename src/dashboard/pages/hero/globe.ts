/**
 * Landing hero globe (three.js). A dotted Earth whose land dots light up with the real visitors of the
 * public demo site: brighter where the period's visitors come from, pulsing where someone is online now.
 * Loaded lazily from LandingHero so three.js never blocks the first paint.
 */
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh,
  MeshBasicMaterial, PerspectiveCamera, Points, RingGeometry, Scene, ShaderMaterial, SphereGeometry,
  TorusGeometry, Vector3, WebGLRenderer,
} from 'three';
import { centroidOf, landDots } from '../../lib/dotmap';

export interface GlobeData {
  /** Visitors per country over the period (ISO-2 → count). */
  period: Record<string, number>;
  /** Countries with a visitor online right now. */
  live: string[];
  /** Countries seen in the last 30 minutes. */
  recent: string[];
}

export interface GlobeHandle {
  setData(data: GlobeData): void;
  dispose(): void;
}

const FOV = 30;
const CAMERA_Z = 5.8;
const DEG = Math.PI / 180;
const TILT = 0.34;

function onSphere(lat: number, lon: number, r: number, out = new Vector3()) {
  const la = lat * DEG, lo = lon * DEG;
  return out.set(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
}

function graticule(): BufferGeometry {
  const pts: number[] = [];
  const v = new Vector3(), w = new Vector3();
  const seg = (la1: number, lo1: number, la2: number, lo2: number) => {
    onSphere(la1, lo1, 1.002, v); onSphere(la2, lo2, 1.002, w);
    pts.push(v.x, v.y, v.z, w.x, w.y, w.z);
  };
  for (let lon = -180; lon < 180; lon += 20) for (let lat = -80; lat < 80; lat += 4) seg(lat, lon, lat + 4, lon);
  for (let lat = -60; lat <= 60; lat += 20) for (let lon = -180; lon < 180; lon += 4) seg(lat, lon, lat, lon + 4);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  return g;
}

const DOT_VERT = /* glsl */ `
  attribute float aLevel;
  attribute float aLive;
  attribute float aSeed;
  uniform float uPx;
  uniform float uTime;
  varying float vLevel;
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(position));
    vFacing = dot(n, normalize(-mv.xyz));
    float twinkle = aLive > 0.5 ? 0.78 + 0.22 * sin(uTime * 3.2 + aSeed * 6.2831) : 1.0;
    vLevel = aLevel * twinkle;
    float size = mix(0.0125, 0.019, aLevel) + aLive * 0.004;
    gl_PointSize = max(1.0, size * uPx / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const DOT_FRAG = /* glsl */ `
  precision mediump float;
  varying float vLevel;
  varying float vFacing;
  void main() {
    if (vFacing < 0.02) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.2, d);
    vec3 dim = vec3(0.09, 0.50, 0.35);
    vec3 lit = vec3(0.42, 1.0, 0.74);
    vec3 col = mix(dim, lit, vLevel) * (0.8 + 0.9 * vLevel);
    float limb = smoothstep(0.02, 0.4, vFacing);
    gl_FragColor = vec4(col, a * limb * (0.62 + 0.38 * vLevel));
  }`;

const CORE_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const CORE_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6);
    float light = max(dot(vN, normalize(vec3(-0.55, 0.6, 0.6))), 0.0);
    vec3 base = vec3(0.004, 0.022, 0.017) + vec3(0.0, 0.05, 0.036) * light;
    gl_FragColor = vec4(base + vec3(0.10, 0.78, 0.50) * f * 0.75, 1.0);
  }`;
const GLOW_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // Back faces of a slightly larger sphere: strongest against the globe, fading to nothing at the outer edge.
    float i = pow(clamp(-dot(vN, vec3(0.0, 0.0, 1.0)) / 0.55, 0.0, 1.0), 1.7) * 0.85;
    gl_FragColor = vec4(vec3(0.16, 0.95, 0.60) * i, i);
  }`;

/** Returns null when WebGL is unavailable; the caller keeps its static placeholder. */
export function createGlobe(host: HTMLElement, opts: { reducedMotion: boolean; centerLon?: number }): GlobeHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline:none';
  renderer.setClearColor(0x000000, 0);
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);

  const tilt = new Group();
  tilt.rotation.x = TILT;
  const spin = new Group();
  spin.rotation.y = -(opts.centerLon ?? 8) * DEG;
  tilt.add(spin);
  scene.add(tilt);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // Solid core: hides the far side and carries the rim light.
  const coreGeo = keep(new SphereGeometry(1, 64, 48));
  spin.add(new Mesh(coreGeo, keep(new ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG }))));
  // Atmosphere halo.
  const glow = new Mesh(keep(new SphereGeometry(1.2, 48, 32)), keep(new ShaderMaterial({
    vertexShader: CORE_VERT, fragmentShader: GLOW_FRAG, side: BackSide, blending: AdditiveBlending, transparent: true, depthWrite: false,
  })));
  scene.add(glow);
  spin.add(new LineSegments(keep(graticule()), keep(new LineBasicMaterial({ color: 0x35e89e, transparent: true, opacity: 0.15 }))));

  // Land dots: each 2.5° cell becomes four dots; rows thin out toward the poles to keep an even density.
  const cells = landDots();
  const pos: number[] = [], seeds: number[] = [], owner: string[] = [];
  const p = new Vector3();
  for (const c of cells) {
    for (let k = 0; k < 4; k++) {
      const lat = c.lat + (k < 2 ? 0.625 : -0.625);
      const lon = c.lon + (k % 2 ? 0.625 : -0.625);
      const stride = Math.max(1, Math.round(1 / Math.max(0.08, Math.cos(lat * DEG))));
      if (Math.round((lon + 180) / 1.25) % stride !== 0) continue;
      onSphere(lat, lon, 1.006, p);
      pos.push(p.x, p.y, p.z);
      seeds.push(((c.x * 73 + c.y * 151 + k * 31) % 97) / 97);
      owner.push(c.cc);
    }
  }
  const dotGeo = keep(new BufferGeometry());
  dotGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  dotGeo.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 1));
  const level = new BufferAttribute(new Float32Array(owner.length), 1);
  const live = new BufferAttribute(new Float32Array(owner.length), 1);
  dotGeo.setAttribute('aLevel', level);
  dotGeo.setAttribute('aLive', live);
  const dotMat = keep(new ShaderMaterial({
    vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uPx: { value: 1000 }, uTime: { value: 0 } },
  }));
  spin.add(new Points(dotGeo, dotMat));

  // Orbit ring with a small satellite, as in the brand illustration.
  const orbit = new Group();
  orbit.rotation.set(72 * DEG, 0, -17 * DEG);
  orbit.add(new Mesh(keep(new TorusGeometry(1.43, 0.0045, 6, 220)), keep(new MeshBasicMaterial({ color: 0x35e89e, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }))));
  const sat = new Mesh(keep(new SphereGeometry(0.02, 12, 12)), keep(new MeshBasicMaterial({ color: 0xbfffe3 })));
  orbit.add(sat);
  scene.add(orbit);

  // Live markers: a pulsing ring on every country with someone online, a small dot for recent ones.
  const ringGeo = keep(new RingGeometry(0.82, 1, 40));
  const discGeo = keep(new RingGeometry(0, 1, 24));
  const markers = new Group();
  spin.add(markers);
  type Pulse = { mesh: Mesh; mat: MeshBasicMaterial; phase: number };
  let pulses: Pulse[] = [];
  let markerMats: MeshBasicMaterial[] = [];
  const up = new Vector3(0, 0, 1);
  function place(mesh: Mesh, cc: string, scale: number) {
    const ll = centroidOf(cc);
    if (!ll) return false;
    onSphere(ll[0], ll[1], 1.012, mesh.position);
    mesh.quaternion.setFromUnitVectors(up, mesh.position.clone().normalize());
    mesh.scale.setScalar(scale);
    markers.add(mesh);
    return true;
  }
  function setMarkers(liveCodes: string[], recentCodes: string[]) {
    markers.clear();
    for (const m of markerMats) m.dispose();
    markerMats = [];
    pulses = [];
    const mat = (opacity: number) => {
      const m = new MeshBasicMaterial({ color: 0x8dffc9, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
      markerMats.push(m);
      return m;
    };
    const liveSet = new Set(liveCodes);
    for (const cc of recentCodes.slice(0, 40)) if (!liveSet.has(cc)) place(new Mesh(discGeo, mat(0.75)), cc, 0.014);
    liveCodes.slice(0, 40).forEach((cc, i) => {
      if (!place(new Mesh(discGeo, mat(1)), cc, 0.022)) return;
      const ringMat = mat(0.9);
      const ring = new Mesh(ringGeo, ringMat);
      if (place(ring, cc, 0.03)) pulses.push({ mesh: ring, mat: ringMat, phase: (i * 0.37) % 1 });
    });
  }

  let dirty = true;
  function setData(data: GlobeData) {
    const max = Math.max(1, ...Object.values(data.period));
    const liveSet = new Set(data.live);
    const recentSet = new Set(data.recent);
    const lv = level.array as Float32Array, li = live.array as Float32Array;
    for (let i = 0; i < owner.length; i++) {
      const cc = owner[i];
      const v = data.period[cc] ?? 0;
      const on = liveSet.has(cc);
      // Square-root scale: small countries stay visible next to the biggest one.
      lv[i] = on ? 1 : recentSet.has(cc) ? 0.85 : v > 0 ? 0.3 + 0.5 * Math.sqrt(v / max) : 0;
      li[i] = on ? 1 : 0;
    }
    level.needsUpdate = true;
    live.needsUpdate = true;
    setMarkers(data.live, data.recent);
    dirty = true;
  }

  // Size: the canvas follows its square host; device pixels are capped for phones.
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dotMat.uniforms.uPx.value = (h * dpr) / (2 * Math.tan((FOV * DEG) / 2));
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // Drag to rotate (horizontal drags only on touch, so the page still scrolls), with a little inertia.
  let dragging = false, lastX = 0, lastY = 0, velocity = 0;
  const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; velocity = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const k = 3.2 / Math.max(200, host.clientWidth);
    spin.rotation.y += dx * k;
    velocity = dx * k;
    tilt.rotation.x = Math.max(-0.5, Math.min(0.95, tilt.rotation.x + dy * k * 0.7));
    dirty = true;
  };
  const upEv = () => { dragging = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', upEv);
  canvas.addEventListener('pointercancel', upEv);
  const lost = (e: Event) => e.preventDefault();
  canvas.addEventListener('webglcontextlost', lost);

  // Render only while the globe is on screen and the tab is visible.
  let visible = true, raf = 0, last = performance.now(), t = 0;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { threshold: 0.02 });
  io.observe(host);
  const onVis = () => { if (!document.hidden) start(); };
  document.addEventListener('visibilitychange', onVis);

  function frame(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const animate = !opts.reducedMotion;
    if (animate) {
      t += dt;
      if (!dragging) {
        spin.rotation.y += 0.07 * dt + velocity;
        velocity *= 0.92;
        if (Math.abs(velocity) < 0.00005) velocity = 0;
        tilt.rotation.x += (TILT - tilt.rotation.x) * Math.min(1, dt * 0.6);
      }
      dotMat.uniforms.uTime.value = t;
      const a = t * 0.35;
      sat.position.set(Math.cos(a) * 1.43, Math.sin(a) * 1.43, 0);
      for (const pu of pulses) {
        const k = (t * 0.55 + pu.phase) % 1;
        pu.mesh.scale.setScalar(0.022 + k * 0.075);
        pu.mat.opacity = 0.9 * (1 - k) ** 1.6;
      }
      dirty = true;
    }
    if (dirty) {
      if (!animate) sat.position.set(Math.cos(0.9) * 1.43, Math.sin(0.9) * 1.43, 0);
      renderer.render(scene, camera);
      dirty = false;
    }
    // Reduced motion: draw on demand (data, resize, drag); otherwise keep the loop going.
    raf = requestAnimationFrame(animate ? frame : idle);
  }
  function idle(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (dirty || dragging) return frame(now);
    raf = requestAnimationFrame(idle);
  }
  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  start();

  return {
    setData,
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', upEv);
      canvas.removeEventListener('pointercancel', upEv);
      canvas.removeEventListener('webglcontextlost', lost);
      for (const m of markerMats) m.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

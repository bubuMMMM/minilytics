import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type Point = [number, number];
type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: Point[][] | Point[][][] };
type Shape = { type: 'Feature'; id: string; geometry: Geometry };
type Country = { country: string; visitors: number; lastSeenAt: number };
type Activity = {
  online: number;
  countries: Country[];
  recentCountries: Country[];
  updatedAt: number;
  activeWindowMinutes: number;
  recentWindowMinutes: number;
};

const CODES = Object.fromEntries("AD:AND,AE:ARE,AF:AFG,AG:ATG,AI:AIA,AL:ALB,AM:ARM,AO:AGO,AQ:ATA,AR:ARG,AS:ASM,AT:AUT,AU:AUS,AW:ABW,AX:ALA,AZ:AZE,BA:BIH,BB:BRB,BD:BGD,BE:BEL,BF:BFA,BG:BGR,BH:BHR,BI:BDI,BJ:BEN,BL:BLM,BM:BMU,BN:BRN,BO:BOL,BQ:BES,BR:BRA,BS:BHS,BT:BTN,BV:BVT,BW:BWA,BY:BLR,BZ:BLZ,CA:CAN,CC:CCK,CD:COD,CF:CAF,CG:COG,CH:CHE,CI:CIV,CK:COK,CL:CHL,CM:CMR,CN:CHN,CO:COL,CR:CRI,CU:CUB,CV:CPV,CW:CUW,CX:CXR,CY:CYP,CZ:CZE,DE:DEU,DJ:DJI,DK:DNK,DM:DMA,DO:DOM,DZ:DZA,EC:ECU,EE:EST,EG:EGY,EH:ESH,ER:ERI,ES:ESP,ET:ETH,FI:FIN,FJ:FJI,FK:FLK,FM:FSM,FO:FRO,FR:FRA,GA:GAB,GB:GBR,GD:GRD,GE:GEO,GF:GUF,GG:GGY,GH:GHA,GI:GIB,GL:GRL,GM:GMB,GN:GIN,GP:GLP,GQ:GNQ,GR:GRC,GS:SGS,GT:GTM,GU:GUM,GW:GNB,GY:GUY,HK:HKG,HM:HMD,HN:HND,HR:HRV,HT:HTI,HU:HUN,ID:IDN,IE:IRL,IL:ISR,IM:IMN,IN:IND,IO:IOT,IQ:IRQ,IR:IRN,IS:ISL,IT:ITA,JE:JEY,JM:JAM,JO:JOR,JP:JPN,KE:KEN,KG:KGZ,KH:KHM,KI:KIR,KM:COM,KN:KNA,KP:PRK,KR:KOR,KW:KWT,KY:CYM,KZ:KAZ,LA:LAO,LB:LBN,LC:LCA,LI:LIE,LK:LKA,LR:LBR,LS:LSO,LT:LSO,LU:LUX,LV:LVA,LY:LBY,MA:MAR,MC:MCO,MD:MDA,ME:MNE,MF:MAF,MG:MDG,MH:MHL,MK:MKD,ML:MLI,MM:MMR,MN:MNG,MO:MAC,MP:MNP,MQ:MTQ,MR:MRT,MS:MSR,MT:MLT,MU:MUS,MV:MDV,MW:MWI,MX:MEX,MY:MYS,MZ:MOZ,NA:NAM,NC:NCL,NE:NER,NF:NFK,NG:NGA,NI:NIC,NL:NLD,NO:NOR,NP:NPL,NR:NRU,NU:NIU,NZ:NZL,OM:OMN,PA:PAN,PE:PER,PF:PYF,PG:PNG,PH:PHL,PK:PAK,PL:POL,PM:SPM,PN:PCN,PR:PRI,PS:PSE,PT:PRT,PW:PLW,PY:PRY,QA:QAT,RE:REU,RO:ROU,RS:SRB,RU:RUS,RW:RWA,SA:SAU,SB:SLB,SC:SYC,SD:SDN,SE:SWE,SG:SGP,SH:SHN,SI:SVN,SJ:SJM,SK:SVK,SL:SLE,SM:SMR,SN:SEN,SO:SOM,SR:SUR,SS:SSD,ST:STP,SV:SLV,SX:SXM,SY:SYR,SZ:SWZ,TC:TCA,TD:TCD,TF:ATF,TG:TGO,TH:THA,TJ:TJK,TK:TKL,TL:TLS,TM:TKM,TN:TUN,TO:TON,TR:TUR,TT:TTO,TV:TUV,TW:TWN,TZ:TZA,UA:UKR,UG:UGA,UM:UMI,US:USA,UY:URY,UZ:UZB,VA:VAT,VC:VCT,VE:VEN,VG:VGB,VI:VIR,VN:VNM,VU:VUT,WF:WLF,WS:WSM,YE:YEM,YT:MYT,ZA:ZAF,ZM:ZMB,ZW:ZWE".split(',').map((entry) => entry.split(':')));
const formatter = new Intl.NumberFormat('fr-FR');
const names = new Intl.DisplayNames(['fr'], { type: 'region' });
const DEG = Math.PI / 180;
const SIZE = { width: 720, height: 500, x: 346, y: 246, radius: 205 };
type GlobeCountry = { id: string; rings: Point[][]; center: Point };
type Marker = { country: string; x: number; y: number; radius: number };

function countryName(country: string) {
  try { return names.of(country) || country; } catch { return country; }
}

function makeCountries(features: Shape[]): GlobeCountry[] {
  return features.filter((f) => f.geometry).map((f) => {
    const polygons = f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates as Point[][]]
      : f.geometry.coordinates as Point[][][];
    const rings = polygons.flatMap((p) => p);
    // The largest land polygon gives a stable, approximate pin without exposing a user's location.
    const main = polygons.map((p) => p[0]).filter(Boolean).sort((a, b) => b.length - a.length)[0] || [];
    const vec = main.reduce((acc, [lng, lat]) => {
      const la = lat * DEG, lo = lng * DEG;
      acc[0] += Math.cos(la) * Math.cos(lo);
      acc[1] += Math.cos(la) * Math.sin(lo);
      acc[2] += Math.sin(la);
      return acc;
    }, [0, 0, 0]);
    const lon = Math.atan2(vec[1], vec[0]) / DEG;
    const lat = Math.atan2(vec[2], Math.hypot(vec[0], vec[1])) / DEG;
    return { id: f.id, rings, center: [lon || 0, lat || 0] };
  });
}

function project(lon: number, lat: number, angle: number) {
  const phi = lat * DEG;
  const lambda = (lon - angle) * DEG;
  const centerLat = 17 * DEG;
  const x = Math.cos(phi) * Math.sin(lambda);
  const y = Math.cos(centerLat) * Math.sin(phi) - Math.sin(centerLat) * Math.cos(phi) * Math.cos(lambda);
  const depth = Math.sin(centerLat) * Math.sin(phi) + Math.cos(centerLat) * Math.cos(phi) * Math.cos(lambda);
  return { x: SIZE.x + x * SIZE.radius, y: SIZE.y - y * SIZE.radius, depth };
}

function drawLine(ctx: CanvasRenderingContext2D, coords: Point[], angle: number) {
  let drawing = false;
  ctx.beginPath();
  for (let i = 0; i < coords.length; i++) {
    const p = project(coords[i][0], coords[i][1], angle);
    if (p.depth <= 0) { drawing = false; continue; }
    if (!drawing) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    drawing = true;
  }
  ctx.stroke();
}

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  world: GlobeCountry[],
  activity: Activity | null,
  angle: number,
  elapsed: number,
  selected: string | null,
  markers: Marker[],
) {
  const { x, y, radius, width, height } = SIZE;
  ctx.clearRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 1.36);
  glow.addColorStop(0, 'rgba(31,150,201,0.13)');
  glow.addColorStop(0.63, 'rgba(33,147,204,0.13)');
  glow.addColorStop(1, 'rgba(33,147,204,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius * 1.45, y - radius * 1.45, radius * 2.9, radius * 2.9);

  const ocean = ctx.createRadialGradient(x - radius * .35, y - radius * .45, radius * .1, x, y, radius);
  ocean.addColorStop(0, '#1b4967');
  ocean.addColorStop(.65, '#102c47');
  ocean.addColorStop(1, '#07192b');
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = ocean; ctx.fill();
  ctx.strokeStyle = 'rgba(119,198,236,.55)'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, radius - 0.9, 0, Math.PI * 2); ctx.clip();

  ctx.strokeStyle = 'rgba(102,174,216,0.16)'; ctx.lineWidth = 0.9;
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const coords: Point[] = [];
    for (let lon = -180; lon <= 180; lon += 3) coords.push([lon, latitude]);
    drawLine(ctx, coords, angle);
  }
  for (let lng = -180; lng <= 180; lng += 30) {
    const coords: Point[] = [];
    for (let lat = -90; lat <= 90; lat += 3) coords.push([lng, lat]);
    drawLine(ctx, coords, angle);
  }

  // Actual Natural Earth country outlines, projected orthographically in the browser.
  ctx.strokeStyle = 'rgba(118,204,222,0.42)';
  ctx.lineWidth = 0.8;
  ctx.fillStyle = '#24576b';
  for (const feature of world) {
    for (const ring of feature.rings) {
      let started = false;
      ctx.beginPath();
      for (const [longitude, latitude] of ring) {
        const point = project(longitude, latitude, angle);
        if (point.depth <= 0) { started = false; continue; }
        if (!started) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
        started = true;
      }
      ctx.fill(); ctx.stroke();
    }
  }

  const byId = new Map(world.map((f) => [f.id, f.center]));
  const active = new Map((activity?.countries || []).map((c) => [c.country, c]));
  const recent = new Map((activity?.recentCountries || []).map((c) => [c.country, c]));
  markers.length = 0;
  const allCodes = new Set([...active.keys(), ...recent.keys()]);
  const source = project(2.35, 48.86, angle); // visual hub at Paris (conceptual, not a network route)
  for (const code of allCodes) {
    const loc = byId.get(CODES[code] || code);
    if (!loc) continue;
    const pin = project(loc[0], loc[1], angle);
    if (pin.depth < 0.035) continue;
    const live = active.get(code);
    const count = live?.visitors || recent.get(code)?.visitors || 0;
    const radiusPin = 4 + Math.min(8, Math.sqrt(count) * 2);
    markers.push({ country: code, x: pin.x, y: pin.y, radius: radiusPin + 9 });
    if (live && source.depth > 0 && code !== 'FR') {
      const mx = (pin.x + source.x) / 2;
      const my = (pin.y + source.y) / 2 - 22;
      ctx.beginPath(); ctx.moveTo(pin.x, pin.y); ctx.quadraticCurveTo(mx, my, source.x, source.y);
      ctx.lineWidth = .95; ctx.strokeStyle = 'rgba(112,217,242,.36)'; ctx.stroke();
    }
  }

  for (const pin of markers) {
    const isLive = active.has(pin.country);
    const highlight = selected === pin.country;
    const radiusPin = pin.radius - 9;
    const alpha = .42 + .35 * Math.sin(elapsed / 520 + pin.x);
    ctx.beginPath(); ctx.arc(pin.x, pin.y, radiusPin + (isLive ? 6 + 5 * Math.abs(Math.sin(elapsed / 1100)) : 3), 0, 2 * Math.PI);
    ctx.strokeStyle = isLive ? 'rgba(255,155,118,' + alpha + ')' : 'rgba(103,191,225,.4)';
    ctx.lineWidth = isLive ? 2 : 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(pin.x, pin.y, radiusPin + (highlight ? 3 : 0), 0, Math.PI * 2);
    ctx.fillStyle = isLive ? '#ff9873' : '#6c9bb2'; ctx.fill();
    ctx.beginPath(); ctx.arc(pin.x, pin.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
  ctx.restore();

  // Crisp latitude marks and a subtle horizon light.
  ctx.beginPath(); ctx.arc(x, y, radius, -.5 * Math.PI, .5 * Math.PI);
  ctx.strokeStyle = 'rgba(122,221,244,.55)'; ctx.lineWidth = 2; ctx.stroke();
}

export function LiveGlobe({ siteId }: { siteId?: string }) {
  const [data, setData] = useState<Activity | null>(null);
  const [world, setWorld] = useState<GlobeCountry[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(-14);
  const stopUntil = useRef(0);
  const pointer = useRef<{ x: number; angle: number; dragged: boolean } | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/maps/world-lowres.geojson', { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('Carte indisponible'); return r.json(); })
      .then((geo) => { if (!controller.signal.aborted) setWorld(makeCountries((geo.features || []) as Shape[])); })
      .catch(() => { if (!controller.signal.aborted) setError('Impossible de charger les contours du monde.'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = siteId ? '/api/sites/' + encodeURIComponent(siteId) + '/live-globe' : '/api/public/live-globe';
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      fetch(endpoint, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() as Promise<Activity>; })
        .then((result) => { if (!controller.signal.aborted) { setData(result); setError(''); } })
        .catch(() => { if (!controller.signal.aborted) setError('Actualisation indisponible, réessaie dans quelques secondes.'); });
    };
    poll();
    const timer = window.setInterval(poll, 15000);
    document.addEventListener('visibilitychange', poll);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [siteId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE.width * dpr;
    canvas.height = SIZE.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let request = 0, lastPaint = 0, lastTime = 0;
    const draw = (now: number) => {
      request = requestAnimationFrame(draw);
      if (document.visibilityState === 'hidden' || now - lastPaint < 58) return;
      const dt = Math.min(100, now - (lastTime || now));
      lastTime = now; lastPaint = now;
      if (!reducedMotion && !pointer.current && Date.now() > stopUntil.current) rotation.current += dt * .0027;
      drawGlobe(ctx, world, data, rotation.current, now, selected, markersRef.current);
    };
    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, [world, data, selected]);

  const activeCountries = data?.countries ?? [];
  const recentCountries = data?.recentCountries ?? [];
  const visibleCountries = activeCountries.length ? activeCountries : recentCountries;
  const activeCodes = useMemo(() => new Set(activeCountries.map((c) => c.country)), [activeCountries]);
  const covered = activeCountries.reduce((sum, c) => sum + c.visitors, 0);
  const unknown = Math.max(0, (data?.online ?? 0) - covered);

  const selectOnGlobe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) * SIZE.width / box.width;
    const y = (event.clientY - box.top) * SIZE.height / box.height;
    const hit = markersRef.current.find((p) => Math.hypot(p.x - x, p.y - y) < p.radius);
    if (hit) setSelected(hit.country);
  };

  return (
    <section className="relative mt-5 overflow-hidden rounded-[24px] border border-[#243849] bg-[#0d1c2b] text-white shadow-[0_20px_60px_rgba(13,28,43,.12)]" aria-label="Globe des visiteurs en direct">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 30% 45%, #173b56 0%, transparent 52%)' }} />
      <div className="relative flex flex-wrap items-start justify-between gap-4 px-5 pt-6 sm:px-8 sm:pt-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#8cc5db]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#76e2c5]" /> Live analytics</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Le monde, en direct.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#a0b7c7]">Visualise d'où viennent tes visiteurs. Les points représentent les pays, pas une position GPS précise.</p>
        </div>
        <div className="rounded-2xl border border-[#31546b] bg-[#163147]/80 px-5 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[.12em] text-[#9bbbd1]">Visiteurs actifs · 5 min</div>
          <div className="mt-1 flex items-center justify-end gap-2 text-3xl font-semibold tabular-nums"><span className="h-2.5 w-2.5 rounded-full bg-[#79e8c4] shadow-[0_0_12px_#79e8c4]" />{data ? formatter.format(data.online) : '—'}</div>
        </div>
      </div>
      <div className="relative grid items-center gap-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,.7fr)]">
        <div className="relative min-w-0">
          <canvas
            ref={canvasRef}
            className="block w-full cursor-grab select-none touch-pan-y active:cursor-grabbing"
            style={{ aspectRatio: SIZE.width + '/' + SIZE.height }}
            role="img"
            aria-label="Globe animé avec les pays de connexion récents. Glisse horizontalement pour tourner le globe."
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              pointer.current = { x: event.clientX, angle: rotation.current, dragged: false };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!pointer.current) return;
              const delta = event.clientX - pointer.current.x;
              if (Math.abs(delta) > 3) pointer.current.dragged = true;
              const width = event.currentTarget.getBoundingClientRect().width || 1;
              rotation.current = pointer.current.angle - delta / width * 220;
              stopUntil.current = Date.now() + 4500;
            }}
            onPointerUp={(event) => {
              if (pointer.current && !pointer.current.dragged) selectOnGlobe(event);
              pointer.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { pointer.current = null; }}
          />
          <span className="pointer-events-none absolute bottom-4 left-5 rounded-lg border border-white/10 bg-[#102538]/70 px-3 py-1.5 text-xs text-[#c4dce8] backdrop-blur-sm">↔ Glisse pour tourner</span>
        </div>
        <div className="min-w-0 px-5 pb-7 lg:pr-8">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <h3 className="font-semibold">Activité par pays</h3>
            <span className="text-xs text-[#91afc1]">{activeCountries.length ? 'Actif · 5 min' : 'Récent · 30 min'}</span>
          </div>
          {visibleCountries.length === 0
            ? <div className="py-9 text-sm leading-relaxed text-[#9db4c4]"><div className="mb-3 h-9 w-9 rounded-full border border-[#40627a] p-2 text-center text-[#83b6d3]">◎</div>Aucune connexion géolocalisée pour l'instant. Les premiers visiteurs apparaîtront ici automatiquement.</div>
            : <div className="mt-3 max-h-60 space-y-1 overflow-y-auto">
                {visibleCountries.slice(0, 10).map((place) => (
                  <button key={place.country} type="button" onClick={() => { setSelected(place.country); stopUntil.current = Date.now() + 6000; }} className={'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ' + (selected === place.country ? 'bg-white/15' : 'hover:bg-white/10')}>
                    <span className="flex min-w-0 items-center gap-2.5"><span className={'h-2 w-2 shrink-0 rounded-full ' + (activeCodes.has(place.country) ? 'bg-[#ff9873]' : 'bg-[#6c9bb2]')} /><span className="truncate text-sm">{countryName(place.country)}</span></span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatter.format(place.visitors)}</span>
                  </button>
                ))}
              </div>}
          {unknown > 0 && <p className="mt-3 text-xs text-[#8da6b6]">+ {unknown} visiteur(s) sans pays déterminé.</p>}
          {error && <p role="status" className="mt-3 text-xs text-[#ffb193]">{error}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-[#91afc1]">
            <span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ff9873]" />Actifs</span>
            <span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-[#6c9bb2]" />Récents</span>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[#738fa1]">Actualisé toutes les 15 s · Liens dessinés à titre illustratif, pas des routes réseau réelles.</p>
        </div>
      </div>
    </section>
  );
}

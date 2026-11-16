import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { heatElementLabel, shortSelector } from '../../shared/heatLabel';
import type { HeatHit, HeatmapReport } from '../../worker/web-quality';
import { api, qs } from '../lib/api';
import { useDash } from '../lib/context';
import { useApi } from '../lib/useApi';
import { Badge } from './ui';

type Bucket = 'all' | 'desktop' | 'mobile';
const BUCKET_LABEL: Record<Bucket, string> = { all: 'Tous', desktop: 'Ordinateur', mobile: 'Mobile' };
type Mode = 'density' | 'points';

/** Transparent → blue → green → yellow → red. */
const RAMP: [number, number, number][] = [
  [37, 99, 235],
  [34, 197, 94],
  [250, 204, 21],
  [220, 38, 38],
];

interface PreviewMeta {
  available: boolean;
  stale?: boolean;
  width?: number;
  height?: number;
  capturedAt?: number;
  viewport?: 'desktop' | 'mobile';
  image?: string;
  error?: string;
}

export function HeatmapView() {
  const { site, q } = useDash();
  const [path, setPath] = useState('');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [mode, setMode] = useState<Mode>('density');
  const [opacity, setOpacity] = useState(70);
  const [hoverSelector, setHoverSelector] = useState<string | null>(null);
  const { data, error, loading } = useApi<HeatmapReport>(
    `/api/sites/${site.id}/heatmap?${qs(q, { ...(path ? { path } : {}), bucket })}`,
  );
  const pages = data?.pages ?? [];
  const currentPath = path || data?.path || '';
  const viewport: 'desktop' | 'mobile' = bucket === 'mobile' ? 'mobile' : 'desktop';

  return (
    <div className="space-y-5">
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {(data?.sparse || (data && data.samples === 0)) && (
        <p className="rounded-lg border border-dashed border-line-strong bg-well px-3 py-2 text-[13px] leading-relaxed text-ink-3">
          {data.samples === 0
            ? 'Aucun clic avec coordonnées sur cette période. Le script envoie désormais un événement « heat » à chaque clic (sans texte saisi). Les anciens clics de navigation interne n’apparaissent pas ici.'
            : 'Peu de clics pour l’instant — la carte s’affine à mesure que les visites arrivent. Les points sont normalisés par rapport à la page au moment du clic.'}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1 text-[13px]">
          <span className="mb-1 block font-medium text-ink-3">Page</span>
          <select
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink"
            value={currentPath}
            onChange={(e) => setPath(e.target.value)}
            disabled={!pages.length}
          >
            {pages.length === 0 && <option value="">Aucune page</option>}
            {pages.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path} · {p.clicks} clic{p.clicks === 1 ? '' : 's'}
                {p.rage ? ` · ${p.rage} rage` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'desktop', 'mobile'] as Bucket[]).map((b) => (
            <button
              key={b}
              type="button"
              className={`btn ${bucket === b ? 'btn-accent' : 'btn-ghost'} h-9 px-3 text-[13px]`}
              aria-pressed={bucket === b}
              onClick={() => setBucket(b)}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Carte des clics</h2>
            <p className="text-[13px] text-ink-3">
              {loading && !data ? 'Chargement…' : data
                ? `${data.samples} clic${data.samples === 1 ? '' : 's'}${data.rage ? ` · ${data.rage} rage` : ''} sur ${currentPath || '—'}`
                : '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-line p-0.5">
              {(['density', 'points'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn-ghost h-8 px-2.5 text-[12px] ${mode === m ? 'bg-well text-ink' : ''}`}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m === 'density' ? 'Densité' : 'Points'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[12px] text-ink-3">
              Opacité
              <input
                type="range"
                min={15}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="h-1 w-24 accent-[rgb(var(--accent))]"
                aria-valuemin={15}
                aria-valuemax={100}
                aria-valuenow={opacity}
              />
            </label>
            <HeatLegend />
          </div>
        </div>
        <HeatStage
          siteId={site.id}
          domain={site.domain}
          path={currentPath}
          viewport={viewport}
          points={data?.points ?? []}
          hits={data?.hits ?? []}
          mode={mode}
          opacity={opacity / 100}
          hoverSelector={hoverSelector}
        />
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-left text-[13px]">
          <caption className="sr-only">Éléments les plus cliqués</caption>
          <thead className="border-b border-line text-[11px] font-medium uppercase tracking-wide text-ink-4">
            <tr>
              <th className="px-4 py-3 font-medium">Élément</th>
              <th className="px-3 py-3 font-medium text-right">Clics</th>
              <th className="px-3 py-3 font-medium text-right">Rage</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.elements.length === 0) && !loading && (
              <tr><td colSpan={3} className="px-4 py-6 text-ink-3">Aucun élément cliqué sur cette page.</td></tr>
            )}
            {data?.elements.map((el) => {
              const label = heatElementLabel(el.selector, el.text);
              const short = shortSelector(el.selector);
              const active = hoverSelector === el.selector;
              return (
                <tr
                  key={el.selector}
                  className={`border-b border-line last:border-0 ${active ? 'bg-accent/5' : 'hover:bg-well'}`}
                  onMouseEnter={() => setHoverSelector(el.selector)}
                  onMouseLeave={() => setHoverSelector((s) => (s === el.selector ? null : s))}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{label}</div>
                    <code className="mt-0.5 block max-w-[420px] truncate font-mono text-[11px] text-ink-4" title={el.selector}>{short}</code>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{el.clicks}</td>
                  <td className="px-3 py-2.5 text-right">{el.rage ? <Badge tone="danger">{el.rage}</Badge> : <span className="text-ink-4">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-4" aria-hidden>
      <span>Faible</span>
      <span
        className="inline-block h-2 w-24 rounded-full"
        style={{ background: 'linear-gradient(to right, rgb(37 99 235), rgb(34 197 94), rgb(250 204 21), rgb(220 38 38))' }}
      />
      <span>Élevée</span>
    </div>
  );
}

export function previewPageUrl(domain: string, path: string): string {
  const dest = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return `https://${domain}${dest}`;
  const here = window.location.hostname.replace(/^www\./, '');
  const there = domain.replace(/^www\./, '');
  if (here === there) return dest;
  if ((here === 'localhost' || here === '127.0.0.1') && there === 'minilytics-six.vercel.app') return dest;
  return `https://${domain}${dest}`;
}

function HeatStage({
  siteId, domain, path, viewport, points, hits, mode, opacity, hoverSelector,
}: {
  siteId: string;
  domain: string;
  path: string;
  viewport: 'desktop' | 'mobile';
  points: HeatmapReport['points'];
  hits: HeatHit[];
  mode: Mode;
  opacity: number;
  hoverSelector: string | null;
}) {
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'capturing' | 'ready' | 'iframe' | 'grid'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState(false);
  const [iframeOk, setIframeOk] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const iframeSrc = path ? previewPageUrl(domain, path) : null;

  const loadMeta = useCallback(async (force = false) => {
    if (!path) return;
    setMessage(null);
    setImgOk(false);
    const q = `path=${encodeURIComponent(path)}&viewport=${viewport}`;
    try {
      if (force) {
        setStatus('capturing');
        const next = await api<PreviewMeta>(`/api/sites/${siteId}/heatmap/preview?${q}`, { method: 'POST', json: {} });
        setMeta(next);
        setStatus(next.available ? 'ready' : 'iframe');
        return;
      }
      setStatus('loading');
      const next = await api<PreviewMeta>(`/api/sites/${siteId}/heatmap/preview?${q}`);
      setMeta(next);
      if (next.available) {
        setStatus('ready');
        return;
      }
      setStatus('capturing');
      const captured = await api<PreviewMeta>(`/api/sites/${siteId}/heatmap/preview?${q}`, { method: 'POST', json: {} });
      setMeta(captured);
      setStatus(captured.available ? 'ready' : 'iframe');
    } catch (e) {
      setMeta((m) => m?.available ? m : { available: false });
      setMessage(e instanceof Error ? e.message : 'Capture impossible');
      setStatus((s) => (s === 'ready' ? s : 'iframe'));
    }
  }, [path, viewport, siteId]);

  useEffect(() => { void loadMeta(false); }, [loadMeta]);

  useEffect(() => {
    if (status !== 'iframe' || !iframeSrc) return;
    const t = window.setTimeout(() => {
      if (!iframeOk) {
        setIframeBlocked(true);
        setStatus('grid');
        setMessage((m) => m || 'L’aperçu n’a pas pu être capturé, et le site refuse d’être intégré. La carte reste en coordonnées normalisées.');
      }
    }, 3500);
    return () => window.clearTimeout(t);
  }, [status, iframeSrc, iframeOk]);

  const max = useMemo(() => points.reduce((m, p) => Math.max(m, p.n), 0), [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = wrapRef.current;
    const img = imgRef.current;
    if (!canvas || !box) return;
    const w = (imgOk && img ? img.clientWidth : box.clientWidth) || box.clientWidth;
    const h = (imgOk && img ? img.clientHeight : Math.max(360, Math.round(w * 0.62))) || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const showGrid = status === 'grid' || (status !== 'ready' && status !== 'iframe');
    if (showGrid && !imgOk && !iframeOk) {
      const line = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '234 234 236';
      ctx.strokeStyle = `rgb(${line})`;
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo((w * i) / 8, 0); ctx.lineTo((w * i) / 8, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (h * i) / 8); ctx.lineTo(w, (h * i) / 8); ctx.stroke();
      }
    }
    if (mode === 'points' || hoverSelector) {
      const list = hoverSelector ? hits.filter((p) => p.selector === hoverSelector) : hits;
      const source = list.length ? list : points;
      for (const pt of source) {
        const x = pt.x * w;
        const y = pt.y * h;
        const hot = hoverSelector && 'selector' in pt && pt.selector === hoverSelector;
        ctx.beginPath();
        ctx.fillStyle = hot ? 'rgb(220 38 38 / 0.9)' : 'rgb(37 99 235 / 0.75)';
        ctx.arc(x, y, hot ? 7 : mode === 'points' ? 5 : 0, 0, Math.PI * 2);
        ctx.fill();
        if (hot) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
          ctx.stroke();
        }
      }
    }
    if (mode === 'density' && points.length) {
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext('2d');
      if (!octx) return;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.globalCompositeOperation = 'lighter';
      const radius = Math.max(22, Math.min(w, h) * 0.05);
      for (const pt of points) {
        const x = pt.x * w;
        const y = pt.y * h;
        const t = max ? pt.n / max : 0;
        const r = radius * (0.7 + 0.7 * t);
        const grd = octx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(255, 255, 255, ${0.45 + 0.55 * t})`);
        grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
        octx.fillStyle = grd;
        octx.beginPath();
        octx.arc(x, y, r, 0, Math.PI * 2);
        octx.fill();
      }
      const image = octx.getImageData(0, 0, off.width, off.height);
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i];
        if (a === 0) { d[i + 3] = 0; continue; }
        const t = Math.min(1, a / 255);
        const [r, g, b] = heatRamp(t);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
        d[i + 3] = Math.min(230, Math.round(40 + t * 200));
      }
      const colored = document.createElement('canvas');
      colored.width = off.width;
      colored.height = off.height;
      colored.getContext('2d')!.putImageData(image, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(colored, 0, 0);
    }
    if (hoverSelector) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const pt of hits.filter((p) => p.selector === hoverSelector)) {
        ctx.beginPath();
        ctx.fillStyle = 'rgb(220 38 38 / 0.95)';
        ctx.arc(pt.x * w, pt.y * h, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgb(255 255 255 / 0.95)';
        ctx.stroke();
      }
    }
  }, [points, hits, max, mode, hoverSelector, status, imgOk, iframeOk, meta, opacity]);

  function onFrameLoad() {
    const el = frameRef.current;
    const box = wrapRef.current;
    if (!el || !box) return;
    try {
      const doc = el.contentDocument;
      if (!doc || !doc.documentElement) {
        setIframeBlocked(true);
        setStatus('grid');
        return;
      }
      const pageW = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth || 0, box.clientWidth);
      const pageH = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 1);
      const boxW = box.clientWidth;
      const scale = boxW / pageW;
      el.style.width = pageW + 'px';
      el.style.height = pageH + 'px';
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
      box.style.height = Math.round(pageH * scale) + 'px';
      setIframeOk(true);
      setIframeBlocked(false);
      setStatus('iframe');
    } catch {
      // Cross-origin frame that still painted: keep it.
      setIframeOk(true);
      setStatus('iframe');
    }
  }

  const showImg = status === 'ready' && !!meta?.image;
  const showIframe = (status === 'iframe' || (status === 'capturing' && !meta?.available)) && !!iframeSrc && !iframeBlocked;
  const capturing = status === 'capturing' || status === 'loading';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-[12px] text-ink-3">
        <span>
          {capturing && 'Capture de l’aperçu en cours…'}
          {status === 'ready' && meta?.capturedAt && `Aperçu du ${new Date(meta.capturedAt).toLocaleString('fr-FR')}${meta.stale ? ' · à rafraîchir' : ''}`}
          {status === 'iframe' && 'Aperçu en direct (iframe) — la capture n’est pas disponible.'}
          {status === 'grid' && (message || 'Aperçu indisponible.')}
        </span>
        <button type="button" className="btn-ghost h-8 px-2.5 text-[12px]" onClick={() => void loadMeta(true)} disabled={!path || capturing}>
          Rafraîchir l’aperçu
        </button>
      </div>
      {message && status !== 'ready' && (
        <p className="px-4 pt-2 text-[12px] leading-relaxed text-ink-3">{message}</p>
      )}
      <div ref={wrapRef} className="relative max-h-[75vh] overflow-auto bg-well">
        {showImg && meta?.image && (
          <img
            ref={imgRef}
            src={meta.image}
            alt={`Aperçu de ${path} (${viewport === 'mobile' ? 'mobile' : 'ordinateur'})`}
            className="block w-full"
            onLoad={() => { setImgOk(true); setStatus('ready'); }}
            onError={() => { setImgOk(false); setStatus('iframe'); }}
          />
        )}
        {showIframe && !showImg && !iframeOk && <div className="min-h-[70vh] w-full" aria-hidden />}
        {showIframe && !showImg && (
          <iframe
            ref={frameRef}
            title="Aperçu de la page"
            src={iframeSrc!}
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: '100%', height: '80vh' }}
            onLoad={onFrameLoad}
            onError={() => { setIframeBlocked(true); setStatus('grid'); }}
          />
        )}
        {status === 'grid' && (
          <div className="min-h-[360px] w-full" />
        )}
        {capturing && !showImg && (
          <div className="flex min-h-[360px] items-center justify-center text-[13px] text-ink-3">Capture de la page…</div>
        )}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute left-0 top-0 z-[1]"
          style={{ opacity }}
          aria-label="Carte de chaleur des clics"
        />
      </div>
    </div>
  );
}

function heatRamp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP[i], b = RAMP[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

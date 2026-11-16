import { useEffect, useMemo, useRef, useState } from 'react';
import type { HeatmapReport } from '../../worker/web-quality';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { useApi } from '../lib/useApi';
import { Badge } from './ui';

type Bucket = 'all' | 'desktop' | 'mobile';
const BUCKET_LABEL: Record<Bucket, string> = { all: 'Tous', desktop: 'Ordinateur', mobile: 'Mobile' };

export function HeatmapView() {
  const { site, q } = useDash();
  const [path, setPath] = useState('');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [preview, setPreview] = useState(false);
  const { data, error, loading } = useApi<HeatmapReport>(
    `/api/sites/${site.id}/heatmap?${qs(q, { ...(path ? { path } : {}), bucket })}`,
  );
  const pages = data?.pages ?? [];
  const currentPath = path || data?.path || '';
  const iframeSrc = preview && currentPath ? `https://${site.domain}${currentPath}` : null;

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
          <button
            type="button"
            className={`btn ${preview ? 'btn-accent' : 'btn-ghost'} h-9 px-3 text-[13px]`}
            aria-pressed={preview}
            onClick={() => setPreview((v) => !v)}
            disabled={!currentPath}
          >
            Aperçu du site
          </button>
        </div>
      </div>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Carte des clics</h2>
            <p className="text-[13px] text-ink-3">
              {loading && !data ? 'Chargement…' : data
                ? `${data.samples} clic${data.samples === 1 ? '' : 's'}${data.rage ? ` · ${data.rage} rage` : ''} sur ${currentPath || '—'}`
                : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-4">
            <span className="inline-block h-2 w-8 rounded-full bg-gradient-to-r from-accent/30 to-danger" />
            Densité
          </div>
        </div>
        <HeatCanvas points={data?.points ?? []} iframeSrc={iframeSrc} />
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-left text-[13px]">
          <caption className="sr-only">Éléments les plus cliqués</caption>
          <thead className="border-b border-line text-[11px] font-medium uppercase tracking-wide text-ink-4">
            <tr>
              <th className="px-4 py-3 font-medium">Élément</th>
              <th className="px-3 py-3 font-medium">Libellé</th>
              <th className="px-3 py-3 font-medium text-right">Clics</th>
              <th className="px-3 py-3 font-medium text-right">Rage</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.elements.length === 0) && !loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-ink-3">Aucun élément cliqué sur cette page.</td></tr>
            )}
            {data?.elements.map((el) => (
              <tr key={el.selector} className="border-b border-line last:border-0">
                <td className="max-w-[280px] truncate px-4 py-2.5 font-mono text-[12px]" title={el.selector}>{el.selector}</td>
                <td className="max-w-[200px] truncate px-3 py-2.5">{el.text || <span className="text-ink-4">—</span>}</td>
                <td className="tnum px-3 py-2.5 text-right">{el.clicks}</td>
                <td className="px-3 py-2.5 text-right">{el.rage ? <Badge tone="danger">{el.rage}</Badge> : <span className="text-ink-4">0</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function HeatCanvas({ points, iframeSrc }: { points: HeatmapReport['points']; iframeSrc: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(false);
  const max = useMemo(() => points.reduce((m, p) => Math.max(m, p.n), 0), [points]);

  useEffect(() => { setBlocked(false); }, [iframeSrc]);

  useEffect(() => {
    const canvas = ref.current;
    const box = wrap.current;
    if (!canvas || !box) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = box.clientWidth;
      const h = Math.max(360, Math.round(box.clientWidth * 0.62));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const styles = getComputedStyle(document.documentElement);
      const line = styles.getPropertyValue('--line').trim() || '234 234 236';
      const accent = styles.getPropertyValue('--accent').trim() || '37 99 235';
      const danger = styles.getPropertyValue('--danger').trim() || '220 38 38';
      ctx.strokeStyle = `rgb(${line})`;
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo((w * i) / 8, 0); ctx.lineTo((w * i) / 8, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (h * i) / 8); ctx.lineTo(w, (h * i) / 8); ctx.stroke();
      }
      const radius = Math.max(18, Math.min(w, h) * 0.06);
      for (const pt of points) {
        const x = pt.x * w;
        const y = pt.y * h;
        const t = max ? pt.n / max : 0;
        const r = radius * (0.6 + 0.8 * t);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        const color = pt.rage ? danger : accent;
        grd.addColorStop(0, `rgba(${color}, ${0.18 + 0.55 * t})`);
        grd.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [points, max, iframeSrc, blocked]);

  return (
    <div ref={wrap} className="relative min-h-[360px] bg-well">
      {iframeSrc && !blocked && (
        <iframe
          title="Aperçu de la page"
          src={iframeSrc}
          sandbox="allow-scripts allow-same-origin"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
          onError={() => setBlocked(true)}
        />
      )}
      {iframeSrc && blocked && (
        <p className="pointer-events-none absolute left-3 top-3 z-[1] rounded-md border border-line bg-surface/90 px-2 py-1 text-[12px] text-ink-3">
          L’aperçu est bloqué par le site (iframe). La carte reste en coordonnées normalisées.
        </p>
      )}
      <canvas ref={ref} className="relative z-[1] block w-full" aria-label="Carte de chaleur des clics" />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Avatar, DeviceIcon, SourceIcon } from '../components/Icons';
import { fmtAgo } from '../lib/format';
import { countryName, flag } from './geo';

export interface Visit {
  id: string; t: number; lastSeen: number; visitorId: string; country: string | null; region: string | null; city: string | null;
  lat: number | null; lon: number | null; source: string | null; channel: string | null; referrer: string | null; page: string | null;
  device: string | null; browser: string | null; os: string | null; pageviews: number; duration: number; name: string | null; email: string | null;
}
export interface ReplayData { window: '30m' | '24h'; from: number; to: number; visits: Visit[] }
export type Win = '30m' | '24h';

/** Real seconds the whole window takes to play at 1×. */
export const BASE_SECONDS = 45;
export const SPEEDS = [1, 2, 4] as const;
/** How long (real ms) an arrival stays pulsing on the map. */
export const PULSE_MS = 2600;

/**
 * Replay of the last 30 min / 24 h of visits: a playhead moves from `from` to `to`, compressed so the whole
 * window lasts BASE_SECONDS / speed. Visits « arrive » when the playhead passes their start.
 */
export function useReplay(siteId: string | null) {
  const [open, setOpen] = useState(false);
  const [win, setWin] = useState<Win>('30m');
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [head, setHead] = useState(0);
  const headRef = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    if (!open || !siteId) return;
    let alive = true;
    setData(null); setError('');
    api<ReplayData>(`/api/sites/${siteId}/replay?window=${win}`).then((d) => {
      if (!alive) return;
      setData(d);
      headRef.current = d.from; setHead(d.from); setPlaying(true);
    }, (e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [open, win, siteId]);

  const rate = data ? (data.to - data.from) / (BASE_SECONDS * 1000) * speed : 1; // window ms per real ms
  useEffect(() => {
    if (!playing || !data) return;
    let raf = 0;
    last.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last.current);
      last.current = now;
      const next = Math.min(data.to, headRef.current + dt * rate);
      headRef.current = next;
      setHead(next);
      if (next >= data.to) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, data, rate]);

  const seek = useCallback((t: number) => { headRef.current = t; setHead(t); }, []);
  const toggle = useCallback(() => {
    if (!data) return;
    if (!playing && headRef.current >= data.to) seek(data.from);
    setPlaying((p) => !p);
  }, [data, playing, seek]);
  const close = useCallback(() => { setOpen(false); setPlaying(false); setData(null); }, []);

  const shown = useMemo(() => (data ? data.visits.filter((v) => v.t <= head) : []), [data, head]);
  /** Visits arrived within the last PULSE_MS of real time. */
  const active = useMemo(() => (data ? shown.filter((v) => head - v.t <= PULSE_MS * rate) : []), [data, shown, head, rate]);
  return { open, setOpen, close, win, setWin, data, error, playing, toggle, speed, setSpeed, head, seek, shown, active, rate };
}
export type Replay = ReturnType<typeof useReplay>;

const timeFmt = (tz: string, withSeconds = false) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) });

export function ReplayBar({ r, tz }: { r: Replay; tz: string }) {
  if (!r.open) {
    return (
      <button type="button" onClick={() => r.setOpen(true)} className="btn !rounded-full !bg-surface/95 shadow-card backdrop-blur" aria-label="Rejouer les dernières visites sur la carte">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l10-6.5z" /></svg> Rejouer
      </button>
    );
  }
  const d = r.data;
  const pct = d ? ((r.head - d.from) / Math.max(1, d.to - d.from)) * 100 : 0;
  const f = timeFmt(tz, r.win === '30m');
  return (
    <div className="w-[min(560px,calc(100vw-24px))] rounded-2xl border border-line bg-surface/95 p-2.5 shadow-pop backdrop-blur sm:p-3" role="region" aria-label="Replay des visites">
      <div className="flex items-center gap-2">
        <button type="button" onClick={r.toggle} disabled={!d} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-canvas disabled:opacity-40 md:h-9 md:w-9" aria-label={r.playing ? 'Pause' : 'Lecture'}>
          {r.playing
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5.5v13l10-6.5z" /></svg>}
        </button>
        <div className="inline-flex shrink-0 rounded-lg border border-line bg-well p-0.5" role="radiogroup" aria-label="Fenêtre">
          {(['30m', '24h'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={r.win === w} onClick={() => r.setWin(w)}
              className={`min-h-[34px] rounded-md px-2.5 text-[12px] font-medium md:min-h-[28px] ${r.win === w ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'}`}>{w === '30m' ? '30 min' : '24 h'}</button>
          ))}
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-line bg-well p-0.5" role="radiogroup" aria-label="Vitesse">
          {[1, 2, 4].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={r.speed === s} onClick={() => r.setSpeed(s as 1 | 2 | 4)}
              className={`min-h-[34px] rounded-md px-2 text-[12px] font-medium tabular-nums md:min-h-[28px] ${r.speed === s ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink'}`}>{s}×</button>
          ))}
        </div>
        <div className="ml-auto min-w-0 text-right text-[12px] leading-tight">
          <div className="tnum font-semibold text-ink">{d ? f.format(r.head) : '—'}</div>
          <div className="tnum whitespace-nowrap text-ink-3">{d ? <>{r.shown.length}/{d.visits.length}<span className="hidden sm:inline"> visites</span></> : r.error || '…'}</div>
        </div>
        <button type="button" onClick={r.close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-well hover:text-ink md:h-8 md:w-8" aria-label="Fermer le replay">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="relative mt-2.5 h-8">
        {/* visit ticks */}
        {d && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2" aria-hidden>
          {d.visits.map((v) => <span key={v.id} className={`absolute top-0 h-3 w-px ${v.t <= r.head ? 'bg-accent' : 'bg-line-strong'}`} style={{ left: `${((v.t - d.from) / Math.max(1, d.to - d.from)) * 100}%` }} />)}
        </div>}
        <input type="range" min={d?.from ?? 0} max={d?.to ?? 1} step={1000} value={d ? r.head : 0} disabled={!d}
          onChange={(e) => r.seek(Number(e.target.value))} aria-label="Position dans le replay" aria-valuetext={d ? f.format(r.head) : ''}
          className="ml-range absolute inset-0 w-full" style={{ ['--p' as string]: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-ink-4 tnum"><span>{d ? f.format(d.from) : ''}</span><span>{d ? 'maintenant' : ''}</span></div>
    </div>
  );
}

/** Live feed of visits (newest first), with avatar, flag, place, source and entry page. */
export function Feed({ visits, tz, now, onPick, emptyText, replaying }: { visits: Visit[]; tz: string; now: number; onPick: (v: Visit) => void; emptyText: string; replaying: boolean }) {
  const f = timeFmt(tz);
  if (!visits.length) return <p className="py-10 text-center text-[13px] text-ink-3">{emptyText}</p>;
  return (
    <ol className="space-y-1" aria-live={replaying ? 'off' : 'polite'}>
      {visits.slice(0, 80).map((v, i) => {
        const who = v.name || v.email;
        const place = [v.city, v.country ? countryName(v.country) : null].filter(Boolean).join(', ') || 'Lieu inconnu';
        const src = !v.source || v.source === 'Direct/None' ? 'Accès direct' : v.source;
        return (
          <li key={v.id}>
            <button type="button" onClick={() => onPick(v)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-well ${i === 0 ? 'ml-feed-in' : ''}`}>
              <span className="relative">
                <Avatar id={v.visitorId} size={34} name={v.name} email={v.email} />
                {v.country && <span className="absolute -bottom-1 -right-1 rounded-full bg-surface px-px text-[13px] leading-none" aria-hidden>{flag(v.country)}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{who ? who : place}</span>
                  <span className="tnum shrink-0 text-[11px] text-ink-4" title={f.format(v.t)}>{replaying ? f.format(v.t) : now - v.t < 60_000 ? 'à l’instant' : `il y a ${fmtAgo(now - v.t)}`}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
                  {who && <span className="truncate">{place} ·</span>}
                  <SourceIcon source={v.source} domain={v.referrer} /><span className="truncate">{src}</span>
                  {v.page && <><span aria-hidden>→</span><span className="truncate font-mono text-[11px]">{v.page}</span></>}
                  <DeviceIcon name={v.device} size={12} />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

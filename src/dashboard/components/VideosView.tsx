import { useMemo, useState, type ReactNode } from 'react';
import { qs } from '../lib/api';
import { useDash } from '../lib/context';
import { bucketLabel, countryName, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Flag } from './Icons';
import { Modal } from './Modal';
import { renderLabel } from './Panel';
import { UiIcon } from './UiIcon';

export interface VideoRow {
  id: string;
  title: string | null;
  channel: string | null;
  duration: number | null;
  plays: number;
  viewers: number;
  reach: number;
  sessions: number;
  watchSeconds: number;
  avgWatchSeconds: number;
  avgPercentWatched: number | null;
  completions: number;
  completionRate: number;
  pauses: number;
  seeks: number;
  milestones: { pct: number; sessions: number }[];
  lastSeen: number | null;
}
interface Series { bucket: string; plays: number; watchSeconds: number }
interface Report {
  range: { granularity: string };
  totals: { plays: number; viewers: number; videos: number; views: number; watchSeconds: number; avgWatchSeconds: number; completions: number; completionRate: number };
  series: Series[];
  channels: { label: string | null; plays: number; watchSeconds: number }[];
  videos: VideoRow[];
}
interface Detail {
  range: { granularity: string };
  video: VideoRow;
  series: Series[];
  actions: { label: string; count: number; visitors: number }[];
  audience: Record<string, { label: string | null; visitors: number; extra: string | null }[]>;
}

/** 3725 → "1 h 02 min", 95 → "1 min 35 s". */
export function fmtWatch(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')} min`;
}

export const isYouTubeId = (id: string) => /^[\w-]{11}$/.test(id);
export function Thumb({ id, className = '' }: { id: string; className?: string }) {
  if (!isYouTubeId(id)) return <span className={`flex items-center justify-center rounded-lg bg-[#eef1ff] text-[#4f62ef] ${className}`}><UiIcon name="play" size={18} /></span>;
  return <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" className={`rounded-lg bg-[#eef1ff] object-cover ${className}`} />;
}

function Kpi({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon: Parameters<typeof UiIcon>[0]['name'] }) {
  return (
    <div className="ml-bento p-4 sm:p-5">
      <div className="flex items-center justify-between"><span className="text-[12px] font-medium text-[#7a889e]">{label}</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f1f3ff] text-[#5165e7]"><UiIcon name={icon} size={16} /></span></div>
      <div className="tnum mt-3 text-[26px] font-semibold tracking-[-.04em] text-[#111b33]">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[#9aa7ba]">{hint}</div>}
    </div>
  );
}

function PlayChart({ series, granularity }: { series: Series[]; granularity: string }) {
  const max = Math.max(1, ...series.map((s) => s.plays));
  const step = Math.max(1, Math.ceil(series.length / 8));
  return (
    <div>
      <div className="flex h-44 items-end gap-[3px]">
        {series.map((s, i) => (
          <div key={s.bucket} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[4px] bg-[#a5b3ff] transition-all group-hover:bg-[#4f62ef]" style={{ height: `${Math.max(s.plays ? 6 : 1.5, (s.plays / max) * 100)}%`, opacity: s.plays ? 1 : 0.35 }} />
            <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111b33] px-2 py-1 text-[11px] text-white group-hover:block">
              {bucketLabel(s.bucket, granularity)} · {s.plays} lecture{s.plays > 1 ? 's' : ''} · {fmtWatch(s.watchSeconds)}
            </div>
            {i % step === 0 && <span className="absolute -bottom-5 left-0 whitespace-nowrap text-[10px] text-[#9aa7ba]">{bucketLabel(s.bucket, granularity)}</span>}
          </div>
        ))}
      </div>
      <div className="h-5" />
    </div>
  );
}

/** Share of sessions that reached each milestone, relative to sessions that started the video. */
export function DropOff({ video, compact = false }: { video: VideoRow; compact?: boolean }) {
  const base = Math.max(1, video.sessions);
  const steps = [{ pct: 0, sessions: video.sessions }, ...video.milestones];
  if (compact) {
    return (
      <div className="flex h-6 items-end gap-[2px]" title="Rétention : part des visionnages qui atteignent 0 / 10 / 25 / 50 / 75 / 90 / 100 %">
        {steps.map((m) => <div key={m.pct} className="w-[7px] rounded-sm bg-[#4f62ef]" style={{ height: `${Math.max(8, (m.sessions / base) * 100)}%`, opacity: 0.35 + 0.65 * (m.sessions / base) }} />)}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {steps.map((m) => (
        <div key={m.pct} className="flex items-center gap-3 text-[13px]">
          <span className="w-12 shrink-0 text-right text-[#7a889e]">{m.pct === 0 ? 'Début' : m.pct + ' %'}</span>
          <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-[#f4f6fb]">
            <div className="absolute inset-y-0 left-0 rounded-lg bg-[#c9d1ff]" style={{ width: `${Math.min(100, (m.sessions / base) * 100)}%` }} />
            <span className="tnum relative flex h-full items-center px-2.5 font-medium text-[#1d2b45]">{fmtNumber(m.sessions)}</span>
          </div>
          <span className="tnum w-12 shrink-0 text-right font-semibold">{fmtPct(m.sessions / base)}</span>
        </div>
      ))}
    </div>
  );
}

const AUDIENCE_TABS: { title: string; tabs: { key: string; label: string }[] }[] = [
  { title: 'Provenance', tabs: [{ key: 'channel', label: 'Canal' }, { key: 'source', label: 'Référent' }, { key: 'utm_source', label: 'UTM source' }, { key: 'utm_medium', label: 'UTM medium' }, { key: 'utm_campaign', label: 'Campagne' }, { key: 'entry_page', label: 'Entrée' }] },
  { title: 'Lieux', tabs: [{ key: 'country', label: 'Pays' }, { key: 'city', label: 'Ville' }, { key: 'language', label: 'Langue' }] },
  { title: 'Technologie', tabs: [{ key: 'device', label: 'Appareil' }, { key: 'browser', label: 'Navigateur' }, { key: 'os', label: 'OS' }, { key: 'visitor_type', label: 'Nouveaux / récurrents' }] },
];

function AudienceBox({ title, tabs, data }: { title: string; tabs: { key: string; label: string }[]; data: Detail['audience'] }) {
  const [active, setActive] = useState(tabs[0].key);
  const rows = data[active] ?? [];
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <div className="ml-bento min-w-0 p-4">
      <h4 className="mb-2 text-[14px] font-semibold">{title}</h4>
      <div className="mb-2 max-w-full overflow-x-auto"><div className="tabs">{tabs.map((t) => <button key={t.key} className={`tab whitespace-nowrap ${t.key === active ? 'tab-active' : ''}`} onClick={() => setActive(t.key)}>{t.label}</button>)}</div></div>
      {!rows.length && <p className="py-6 text-center text-xs text-stone-400">Aucune donnée</p>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="relative flex h-8 items-center rounded-lg">
            <div className="absolute inset-y-0 left-0 rounded-lg bg-visitorsSoft" style={{ width: `${(r.visitors / max) * 100}%` }} />
            <div className="relative flex min-w-0 flex-1 items-center gap-2 px-2.5 text-[13px]">
              {active === 'country' ? <><Flag cc={r.label} /><span className="truncate">{countryName(r.label)}</span></>
                : active === 'referrer' ? <span className="truncate">{r.label ?? 'Direct'}</span>
                : renderLabel(active === 'utm_source' || active === 'utm_medium' || active === 'utm_campaign' || active === 'language' || active === 'visitor_type' || active === 'entry_page' ? 'plain' : active, { label: r.label ?? (active === 'source' ? null : '(aucun)'), extra: r.extra })}
            </div>
            <span className="tnum relative pr-2.5 text-[13px] font-semibold">{r.visitors}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = { video_click: 'Clics vers la vidéo', link_paste: 'Liens collés', share: 'Partages', copy_link: 'Liens copiés', playlist_add: 'Ajouts à une playlist', like: 'J’aime', download: 'Téléchargements', open_youtube: 'Ouvert sur YouTube' };

function VideoDetailModal({ videoId, onClose }: { videoId: string | null; onClose: () => void }) {
  const { site, q, reloadKey } = useDash();
  const { data } = useApi<Detail>(videoId ? `/api/sites/${site.id}/videos/${encodeURIComponent(videoId)}?${qs(q)}` : null, reloadKey);
  const v = data?.video;
  return (
    <Modal open={!!videoId} onClose={onClose} width="max-w-5xl" title={v?.title || videoId || 'Vidéo'}>
      {!data && <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-10" />)}</div>}
      {data && v && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <Thumb id={v.id} className="h-[90px] w-[160px] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-[#7a889e]">{v.channel ?? 'Chaîne inconnue'}{v.duration ? ' · ' + fmtWatch(v.duration) : ''}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                <a className="btn !h-8" href={`https://${site.domain}/watch?v=${encodeURIComponent(v.id)}`} target="_blank" rel="noreferrer">Ouvrir sur {site.domain} <UiIcon name="external" size={14} /></a>
                {isYouTubeId(v.id) && <a className="btn !h-8" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">YouTube <UiIcon name="external" size={14} /></a>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Lectures" value={fmtNumber(v.plays)} hint={`${fmtNumber(v.viewers)} spectateurs uniques`} icon="play" />
            <Kpi label="Temps de visionnage" value={fmtWatch(v.watchSeconds)} hint={`${fmtWatch(v.avgWatchSeconds)} en moyenne`} icon="clock" />
            <Kpi label="Taux de complétion" value={fmtPct(v.completionRate)} hint={`${fmtNumber(v.completions)} visionnages ≥ 90 %`} icon="target" />
            <Kpi label="Interactions" value={fmtNumber(v.pauses + v.seeks)} hint={`${v.pauses} pauses · ${v.seeks} sauts`} icon="mouse" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="ml-bento p-4"><h4 className="mb-3 text-[14px] font-semibold">Rétention (où les spectateurs décrochent)</h4><DropOff video={v} /></div>
            <div className="ml-bento p-4"><h4 className="mb-3 text-[14px] font-semibold">Lectures dans le temps</h4><PlayChart series={data.series} granularity={data.range.granularity} />
              {data.actions.length > 0 && <div className="mt-3 border-t border-[#edf0f6] pt-3"><h5 className="mb-2 text-[12px] font-semibold text-[#56657e]">Actions sur cette vidéo</h5>{data.actions.map((a) => <div key={a.label} className="flex justify-between py-1 text-[13px]"><span>{ACTION_LABELS[a.label] ?? a.label}</span><span className="tnum font-semibold">{a.count}</span></div>)}</div>}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">{AUDIENCE_TABS.map((b) => <AudienceBox key={b.title} title={b.title} tabs={b.tabs} data={data.audience} />)}</div>
        </div>
      )}
    </Modal>
  );
}

export function VideosView() {
  const { site, q, reloadKey } = useDash();
  const { data, loading, error } = useApi<Report>(`/api/sites/${site.id}/videos?${qs(q)}`, reloadKey);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<'plays' | 'watchSeconds' | 'completionRate' | 'viewers'>('plays');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => [...(data?.videos ?? [])]
    .filter((v) => !search || `${v.title ?? ''} ${v.channel ?? ''} ${v.id}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sort] as number) - (a[sort] as number) || b.plays - a.plays), [data, sort, search]);
  const t = data?.totals;
  const maxPlays = Math.max(1, ...rows.map((r) => r.plays));
  const SortBtn = ({ k, children }: { k: typeof sort; children: ReactNode }) => (
    <button className={`whitespace-nowrap font-medium ${sort === k ? 'text-[#4f62ef]' : ''}`} onClick={() => setSort(k)}>{children}{sort === k ? ' ↓' : ''}</button>
  );

  return (
    <section aria-label="Vidéos" className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Lectures" value={t ? fmtNumber(t.plays) : '—'} hint="Vidéos lancées" icon="play" />
        <Kpi label="Spectateurs uniques" value={t ? fmtNumber(t.viewers) : '—'} hint="Visiteurs ayant lancé une vidéo" icon="users" />
        <Kpi label="Vidéos regardées" value={t ? fmtNumber(t.videos) : '—'} hint="Vidéos distinctes" icon="layers" />
        <Kpi label="Temps de visionnage" value={t ? fmtWatch(t.watchSeconds) : '—'} hint="Temps réellement lu" icon="clock" />
        <Kpi label="Durée moyenne" value={t ? fmtWatch(t.avgWatchSeconds) : '—'} hint="Par visionnage" icon="activity" />
        <Kpi label="Taux de complétion" value={t ? fmtPct(t.completionRate) : '—'} hint="Visionnages ≥ 90 %" icon="target" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="ml-bento p-5"><h3 className="mb-4 text-[15px] font-semibold">Lectures sur la période</h3>{data ? <PlayChart series={data.series} granularity={data.range.granularity} /> : <div className="skeleton h-44" />}</div>
        <div className="ml-bento p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Chaînes les plus regardées</h3>
          {!data?.channels.length && <p className="py-8 text-center text-sm text-stone-400">Aucune vidéo lancée sur cette période</p>}
          {data?.channels.slice(0, 8).map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-[#f0f2f7] py-2 text-[13px] last:border-0">
              <span className="truncate">{c.label ?? 'Inconnue'}</span><span className="tnum shrink-0 text-[#7a889e]">{c.plays} · {fmtWatch(c.watchSeconds)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ml-bento p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-[15px] font-semibold">Top vidéos</h3><p className="text-[12px] text-[#8290a3]">Cliquez sur une vidéo pour voir sa rétention, d’où viennent ses spectateurs et leurs pays.</p></div>
          <input type="search" aria-label="Rechercher une vidéo" autoComplete="off" className="input !h-10 w-full sm:max-w-[260px]" placeholder="Rechercher une vidéo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!data && loading && <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ml-skeleton h-14" />)}</div>}
        {data && !rows.length && (
          <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#4f62ef]"><UiIcon name="play" size={22} /></span>
            <p className="mt-3 text-sm font-medium text-stone-600">Aucune vidéo regardée sur cette période</p>
            <p className="max-w-md text-xs text-stone-400">Les lectures apparaissent ici dès que le lecteur du site envoie <code>minilytics('video', 'start', {'{ id, title }'})</code>.</p>
          </div>
        )}
        {rows.length > 0 && (
          <ul className="-mx-1 divide-y divide-[#f0f2f7] md:hidden">
            {rows.map((v) => (
              <li key={v.id}>
                <button type="button" className="flex w-full items-start gap-3 rounded-xl px-1 py-3 text-left active:bg-[#f8f9ff]" onClick={() => setOpen(v.id)}>
                  <Thumb id={v.id} className="h-[54px] w-[96px] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1d2b45]">{v.title ?? v.id}</div>
                    <div className="truncate text-[12px] text-[#8b98ad]">{v.channel ?? '—'}{v.duration ? ' · ' + fmtWatch(v.duration) : ''}</div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[#56657e]">
                      <span><b className="tnum text-[#17213a]">{fmtNumber(v.plays)}</b> lectures</span>
                      <span><b className="tnum text-[#17213a]">{fmtWatch(v.avgWatchSeconds)}</b> en moy.</span>
                      <span><b className="tnum text-[#17213a]">{fmtPct(v.completionRate)}</b> complétion</span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-[#7a889e]">
                  <th className="pb-2 font-medium">Vidéo</th>
                  <th className="pb-2 text-right"><SortBtn k="plays">Lectures</SortBtn></th>
                  <th className="pb-2 text-right"><SortBtn k="viewers">Spectateurs</SortBtn></th>
                  <th className="pb-2 text-right"><SortBtn k="watchSeconds">Temps total</SortBtn></th>
                  <th className="hidden pb-2 text-right font-medium lg:table-cell">Moyenne</th>
                  <th className="pb-2 text-right"><SortBtn k="completionRate">Complétion</SortBtn></th>
                  <th className="pb-2 pl-4 font-medium">Rétention</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="cursor-pointer border-t border-[#f0f2f7] hover:bg-[#f8f9ff]" onClick={() => setOpen(v.id)}>
                    <td className="py-2.5 pr-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumb id={v.id} className="h-[45px] w-[80px] shrink-0" />
                        <div className="min-w-0">
                          <button type="button" className="block max-w-[380px] truncate text-left font-medium text-[#1d2b45] hover:text-[#2f3fd0]" onClick={(e) => { e.stopPropagation(); setOpen(v.id); }}>{v.title ?? v.id}</button>
                          <div className="max-w-[380px] truncate text-[12px] text-[#8b98ad]">{v.channel ?? '—'}{v.duration ? ' · ' + fmtWatch(v.duration) : ''}</div>
                          <div className="mt-1 h-1 w-40 overflow-hidden rounded bg-[#eef1f7]"><div className="h-full rounded bg-[#4f62ef]" style={{ width: `${(v.plays / maxPlays) * 100}%` }} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="tnum py-2.5 text-right font-semibold">{fmtNumber(v.plays)}</td>
                    <td className="tnum py-2.5 text-right">{fmtNumber(v.viewers)}</td>
                    <td className="tnum py-2.5 text-right">{fmtWatch(v.watchSeconds)}</td>
                    <td className="tnum hidden py-2.5 text-right lg:table-cell">{fmtWatch(v.avgWatchSeconds)}{v.avgPercentWatched != null && <div className="text-[11px] text-[#9aa7ba]">{fmtPct(v.avgPercentWatched)} de la vidéo</div>}</td>
                    <td className="tnum py-2.5 text-right font-semibold">{fmtPct(v.completionRate)}</td>
                    <td className="py-2.5 pl-4"><DropOff video={v} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <VideoDetailModal videoId={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/** Compact top videos for the overview; hidden when the site has no video events. */
export function VideosTeaser({ onOpen }: { onOpen: () => void }) {
  const { site, q, reloadKey } = useDash();
  const { data } = useApi<Report>(`/api/sites/${site.id}/videos?${qs(q)}`, reloadKey);
  if (!data || !data.videos.length) return null;
  const t = data.totals;
  return (
    <section className="ml-bento mt-7 p-5" aria-label="Top vidéos">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><div className="ml-kicker">VIDÉOS / VISIONNAGE</div><h2 className="mt-2 text-[clamp(1.4rem,2.6vw,1.9rem)] font-semibold tracking-[-.04em]">Ce que vos visiteurs regardent<span className="text-[#4f62ef]">.</span></h2>
          <p className="mt-1 text-[13px] text-[#8290a3]">{fmtNumber(t.plays)} lecture{t.plays > 1 ? 's' : ''} · {fmtNumber(t.viewers)} spectateur{t.viewers > 1 ? 's' : ''} · {fmtWatch(t.watchSeconds)} de visionnage · {fmtPct(t.completionRate)} de complétion</p></div>
        <button className="btn-dark" onClick={onOpen}>Toutes les vidéos <UiIcon name="arrow-right" size={16} /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.videos.slice(0, 5).map((v) => (
          <button key={v.id} onClick={onOpen} className="group rounded-xl border border-[#edf0f6] p-2 text-left transition hover:border-[#cfd6ff] hover:bg-[#f8f9ff]">
            <Thumb id={v.id} className="aspect-video w-full" />
            <div className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-[#1d2b45]">{v.title ?? v.id}</div>
            <div className="mt-1 text-[11px] text-[#8b98ad]">{v.plays} lecture{v.plays > 1 ? 's' : ''} · {fmtWatch(v.watchSeconds)} · {fmtPct(v.completionRate)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

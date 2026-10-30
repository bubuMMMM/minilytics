import { PageHeader } from '../components/ui';
import { useEffect, useState } from 'react';
import { Avatar, DeviceIcon, Favicon, Flag, SourceIcon } from '../components/Icons';
import { AppHeader, BottomNav } from '../components/AppNav';
import { LiveDot } from '../components/Sparkline';
import { api, type Realtime as RT, type Site } from '../lib/api';
import { countryName, fmtNumber } from '../lib/format';

function agoFr(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.round(s / 60)} min`;
}
import { useApi } from '../lib/useApi';

const POLL_MS = 10_000;

function MinuteBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]">
        {data.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-[4px] transition-[width] duration-200 ${i === data.length - 1 ? 'bg-success' : 'bg-accent group-hover:bg-accent'}`}
              style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 100)}%`, opacity: v ? 1 : 0.25 }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
              {v} · {data.length - 1 - i === 0 ? 'maintenant' : `il y a ${data.length - 1 - i} min`}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-4">
        <span>il y a 30 min</span>
        <span>15 min</span>
        <span>maintenant</span>
      </div>
    </div>
  );
}

function List({ title, rows, render }: { title: string; rows: { label: string | null; visitors: number }[]; render: (l: string | null) => React.ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <div className="ml-bento p-5">
      <h3 className="mb-3 text-[15px] font-semibold tracking-[-.02em]">{title}</h3>
      {!rows.length && <p className="py-8 text-center text-sm text-ink-4">Rien sur les 30 dernières minutes</p>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="relative flex h-9 items-center rounded-lg">
            <div className="absolute inset-y-0 left-0 rounded-lg bg-visitorsSoft transition-[width] duration-200" style={{ width: `${(r.visitors / max) * 100}%` }} />
            <div className="relative flex min-w-0 flex-1 items-center gap-2 px-3 text-sm">{render(r.label)}</div>
            <div className="tnum relative pr-3 text-sm font-semibold">{r.visitors}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const EVENT_STYLE: Record<string, { label: string; cls: string }> = {
  pageview: { label: 'Vue', cls: 'bg-visitors/10 text-visitors' },
  goal: { label: 'Objectif', cls: 'bg-brand/10 text-brand' },
  outbound: { label: 'Clic sortant', cls: 'bg-amber-500/10 text-warning dark:text-warning' },
  click: { label: 'Clic', cls: 'bg-accent-soft text-accent' },
  scroll: { label: 'Scroll', cls: 'bg-well text-ink-2' },
  engagement: { label: 'Temps actif', cls: 'bg-success-soft text-success' },
  video: { label: 'Vidéo', cls: 'bg-danger-soft text-danger' },
  action: { label: 'Action', cls: 'bg-accent-soft text-accent' },
  form: { label: 'Formulaire', cls: 'bg-accent-soft text-accent' },
  block_view: { label: 'Impression', cls: 'bg-accent-soft text-accent' },
  block_click: { label: 'Clic bloc', cls: 'bg-orange-50 text-orange-700' },
};
const VIDEO_FR: Record<string, string> = { start: 'lancement', play: 'lecture', pause: 'pause', seek: 'déplacement', progress: 'palier', complete: 'fin', watch: 'visionnage', error: 'erreur', quality: 'qualité', fullscreen: 'plein écran', mute: 'son', rate: 'vitesse', rewatch: 'revisionnage' };
/** Human detail for one live event (no raw ids or milliseconds). */
function eventText(e: { type: string; name: string | null; path: string | null }): string {
  const n = e.name ?? '';
  if (e.type === 'pageview') return e.path ?? '/';
  if (e.type === 'engagement') return `${(Number(n) / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s sur ${e.path ?? '/'}`;
  if (e.type === 'scroll') return `${n} % de ${e.path ?? '/'}`;
  if (e.type === 'click') return `${e.path ?? ''} → ${n}`;
  if (e.type === 'video') return VIDEO_FR[n] ?? n;
  if (e.type === 'outbound') return n.replace(/^https?:\/\//, '');
  return n || e.path || '';
}

export function Realtime({ siteId }: { siteId: string }) {
  const { data: sites } = useApi<Site[]>('/api/sites');
  const site = sites?.find((s) => s.id === siteId);
  const [rt, setRt] = useState<RT | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => api<RT>(`/api/sites/${siteId}/realtime`).then((d) => alive && setRt(d), () => {});
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    const c = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(c);
    };
  }, [siteId]);

  const total30 = rt ? new Set(rt.recent.map((e) => e.visitor_id)).size : 0;
  const pv30 = rt ? rt.recent.filter((e) => e.type === 'pageview').length : 0;

  return (
    <div className="ml-site-bg ml-has-bottom-nav min-h-screen pb-12">
      <AppHeader siteId={siteId} active="realtime" online={!!rt?.online} title={site?.name} />
      <main id="contenu" className="mx-auto max-w-[1480px] animate-fadein px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader title="Temps réel" description={`Ce qui se passe sur votre site en ce moment · actualisé toutes les ${POLL_MS / 1000} s`}
        meta={site ? <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-4" translate="no"><Favicon domain={site.domain} size={14} />{site.domain}</span> : undefined} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="ml-bento relative overflow-hidden p-6 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-3">
            <LiveDot on={!!rt?.online} /> Visiteurs en ligne
          </div>
          <div className="tnum mt-3 text-6xl font-semibold leading-none tracking-tight text-ink">{rt ? fmtNumber(rt.online) : <span className="skeleton inline-block h-14 w-20" />}</div>
          <p className="mt-2 text-xs text-ink-4">Actifs sur les 5 dernières minutes</p>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <div>
              <div className="eyebrow">Visiteurs récents</div>
              <div className="tnum mt-1 text-xl font-semibold">{total30}</div>
            </div>
            <div>
              <div className="eyebrow">Pages vues récentes</div>
              <div className="tnum mt-1 text-xl font-semibold">{pv30}</div>
            </div>
          </div>
        </div>
        <div className="ml-bento p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold tracking-[-.02em]">Visiteurs par minute</h3>
            <span className="text-xs text-ink-4">30 dernières minutes</span>
          </div>
          {rt ? <MinuteBars data={rt.perMinute} /> : <div className="skeleton h-44" />}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <List title="Pages actives" rows={rt?.pages ?? []} render={(l) => <span className="truncate font-mono text-[13px]">{l ?? '(aucune)'}</span>} />
        <List
          title="Sources principales"
          rows={rt?.sources ?? []}
          render={(l) => (
            <>
              <SourceIcon source={l} />
              <span className="truncate">{!l || l === 'Direct/None' ? 'Direct' : l}</span>
            </>
          )}
        />
        <div className="ml-bento p-5">
          <h3 className="mb-3 text-[15px] font-semibold tracking-[-.02em]">Activité en direct</h3>
          {rt && !rt.recent.length && <p className="py-8 text-center text-sm text-ink-4">En attente du prochain visiteur…</p>}
          <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1" data-tick={tick}>
            {rt?.recent.map((e, i) => {
              const st = EVENT_STYLE[e.type] ?? { label: e.type, cls: 'bg-well text-ink-3' };
              return (
                <li key={`${e.ts}-${i}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-well">
                  <Avatar id={e.visitor_id} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`pill ${st.cls}`}>{st.label}</span>
                      <span className="truncate text-[13px] text-ink-2">{eventText(e)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-ink-4">
                      <Flag cc={e.country} size={12} /> {countryName(e.country)} · <DeviceIcon name={e.device} size={12} /> {e.browser ?? '—'} · {!e.source || e.source === 'Direct/None' ? 'Direct' : e.source}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-4">{agoFr(Date.now() - e.ts)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      </main>
      <BottomNav siteId={siteId} active="realtime" />
    </div>
  );
}

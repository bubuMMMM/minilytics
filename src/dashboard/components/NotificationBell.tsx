import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { fmtAgo } from '../lib/format';
import { useMe } from '../lib/me';
import { navigate } from '../App';
import { Link } from './Link';

/** Backend notifications (table `notifications`, see src/worker/alerts.ts). */
export interface Notification {
  id: string;
  kind: 'goal' | 'new_goal' | 'spike' | 'drop' | 'payment' | 'mention' | 'commit' | 'report';
  title: string;
  body?: string | null;
  ts: number;
  read: boolean;
  url?: string | null;
}
interface List { items: Notification[]; unread: number }

const KIND: Record<Notification['kind'], { icon: string; tone: string; label: string }> = {
  goal: { icon: '🎯', tone: 'bg-accent/10', label: 'Objectif' },
  new_goal: { icon: '✨', tone: 'bg-accent/10', label: 'Nouvel objectif' },
  spike: { icon: '📈', tone: 'bg-success/10', label: 'Pic de trafic' },
  drop: { icon: '📉', tone: 'bg-danger/10', label: 'Baisse de trafic' },
  payment: { icon: '💶', tone: 'bg-revenue/10', label: 'Paiement' },
  mention: { icon: '💬', tone: 'bg-accent/10', label: 'Mention' },
  commit: { icon: '◆', tone: 'bg-well', label: 'Commit' },
  report: { icon: '📬', tone: 'bg-well', label: 'Rapport' },
};
const POLL = 60_000;
// Remember (10 min, this tab) that the server has no notifications endpoint, to avoid a 404 on every page.
const ABSENT_KEY = 'ml-notif-absent';
const absentCached = () => { try { return Date.now() - Number(sessionStorage.getItem(ABSENT_KEY) || 0) < 10 * 60_000; } catch { return false; } };

/** Bell with unread badge in the app header. Hidden when the API has no notifications endpoint (404). */
export function NotificationBell({ siteId }: { siteId: string }) {
  const [list, setList] = useState<List | null>(null);
  const [absent, setAbsent] = useState(absentCached);
  const [failed, setFailed] = useState(false); // transient error before any data: stay hidden, retry at next poll
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const readOnly = useMe()?.role === 'viewer';

  const load = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    api<List>(`/api/sites/${siteId}/notifications?limit=30`).then(setList, (e) => {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) { setAbsent(true); try { sessionStorage.setItem(ABSENT_KEY, String(Date.now())); } catch { /* private mode */ } }
      else setFailed(true);
    });
  }, [siteId]);
  useEffect(() => {
    if (absent) return;
    load();
    const t = setInterval(load, POLL);
    const vis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load, absent]);
  useEffect(() => {
    if (!open) return;
    load();
    const out = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open, load]);

  const markRead = async (body: { ids?: string[]; all?: true }) => {
    if (readOnly) return;
    setList((l) => l && { items: l.items.map((n) => (body.all || body.ids?.includes(n.id) ? { ...n, read: true } : n)), unread: body.all ? 0 : Math.max(0, l.unread - (body.ids?.filter((id) => l.items.some((n) => n.id === id && !n.read)).length ?? 0)) });
    try {
      const r = await api<{ ok: boolean; unread: number }>(`/api/sites/${siteId}/notifications/read`, { method: 'POST', json: body });
      setList((l) => l && { ...l, unread: r.unread });
    } catch { load(); }
  };
  const openItem = (n: Notification) => {
    if (!n.read) markRead({ ids: [n.id] });
    const u = n.url ?? '';
    if (u.startsWith('/') && !u.startsWith('//')) { setOpen(false); navigate(u); }
    else if (/^https:\/\//.test(u)) window.open(u, '_blank', 'noopener,noreferrer');
  };

  if (absent || (failed && !list)) return null;
  const unread = list?.unread ?? 0;
  const now = Date.now();
  return (
    <div className="relative" ref={ref}>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-well hover:text-ink md:h-9 md:w-9">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8.5 3 8.5H3S6 15 6 8Z" /><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="tnum absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-canvas md:right-0 md:top-0">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="card fixed inset-x-3 top-[calc(60px+env(safe-area-inset-top))] z-50 flex max-h-[min(560px,75dvh)] flex-col overflow-hidden p-0 shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[14px] font-semibold">Notifications{unread > 0 && <span className="tnum rounded-full bg-danger/10 px-1.5 py-px text-[11px] font-semibold text-danger">{unread}</span>}</div>
            {!readOnly && unread > 0 && <button type="button" className="btn-ghost" onClick={() => markRead({ all: true })}>Tout marquer comme lu</button>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {!list ? <div className="space-y-1 p-2">{[0, 1, 2].map((i) => <div key={i} className="ml-skeleton h-12 w-full" />)}</div>
              : list.items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="text-2xl" aria-hidden>🔔</div>
                  <p className="mt-2 text-[13px] font-medium text-ink">Rien de nouveau</p>
                  <p className="mt-1 text-[12px] text-ink-3">Objectifs atteints, paiements, pics ou baisses de trafic, mentions et commits apparaîtront ici.</p>
                </div>
              ) : (
                <ul>
                  {list.items.map((n) => {
                    const k = KIND[n.kind] ?? KIND.report;
                    return (
                      <li key={n.id}>
                        <button type="button" onClick={() => openItem(n)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-well">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] ${k.tone}`} aria-hidden>{k.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`line-clamp-2 min-w-0 text-[13px] ${n.read ? 'text-ink-2' : 'font-medium text-ink'}`}><span className="sr-only">{k.label} : </span>{n.title}</span>
                              <span className="tnum shrink-0 text-[11px] text-ink-4">{now - n.ts < 60_000 ? 'à l’instant' : fmtAgo(now - n.ts)}</span>
                            </span>
                            {n.body && <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-3">{n.body}</span>}
                          </span>
                          {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Non lue" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
          <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
            <Link href={`/site/${siteId}/settings#alertes`} onClick={() => setOpen(false)} className="hover:text-ink">Réglages des alertes →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

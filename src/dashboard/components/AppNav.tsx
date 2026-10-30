import type { ReactNode } from 'react';
import { navigate } from '../App';
import { Logo } from './Logo';
import { LiveDot } from './Sparkline';
import { UiIcon } from './UiIcon';

export type NavKey = 'overview' | 'videos' | 'realtime' | 'settings' | 'sites';

const ITEMS: { key: NavKey; label: string; short: string; icon: Parameters<typeof UiIcon>[0]['name']; path: (id: string) => string }[] = [
  { key: 'overview', label: 'Vue d’ensemble', short: 'Aperçu', icon: 'bar-chart', path: (id) => `/site/${id}` },
  { key: 'videos', label: 'Vidéos', short: 'Vidéos', icon: 'play', path: (id) => `/site/${id}/videos` },
  { key: 'realtime', label: 'Temps réel', short: 'Direct', icon: 'activity', path: (id) => `/site/${id}/realtime` },
  { key: 'sites', label: 'Mes sites', short: 'Sites', icon: 'layers', path: () => '/sites' },
  { key: 'settings', label: 'Réglages', short: 'Réglages', icon: 'shield', path: (id) => `/site/${id}/settings` },
];

/** Keep the period/filters when switching between the overview and the videos view. */
function go(key: NavKey, siteId: string) {
  const item = ITEMS.find((i) => i.key === key)!;
  const keepQuery = key === 'overview' || key === 'videos';
  navigate(item.path(siteId) + (keepQuery ? window.location.search : ''));
}

/** Site-level header: full buttons on desktop, compact on phones (where the bottom bar takes over). */
export function AppHeader({ siteId, active, online, title }: { siteId: string; active: NavKey; online?: boolean; title?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e8edf5] bg-white/90 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-[60px] max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6 md:h-[76px]">
        <button aria-label="Retour à mes sites" className="flex min-h-[44px] min-w-0 items-center gap-2" onClick={() => navigate('/sites')}>
          <Logo />
          {title && <span className="truncate text-[13px] font-semibold text-[#56657e] md:hidden">· {title}</span>}
        </button>
        <nav className="hidden items-center gap-2 md:flex" aria-label="Navigation du site">
          <button className="btn hidden lg:inline-flex" onClick={() => navigate('/')}>Voir la démo <UiIcon name="external" size={16} /></button>
          {ITEMS.map((i) => (
            <button key={i.key} aria-current={active === i.key ? 'page' : undefined} className={active === i.key ? 'btn-dark' : 'btn'} onClick={() => go(i.key, siteId)}>
              {i.key === 'realtime' ? <LiveDot on={!!online} /> : <UiIcon name={i.icon} size={16} />}
              <span className="hidden xl:inline">{i.label}</span>
              <span className="xl:hidden">{i.short}</span>
            </button>
          ))}
        </nav>
        {online !== undefined && (
          <button className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-2 text-[12px] font-semibold text-[#179569] md:hidden" onClick={() => go('realtime', siteId)}>
            <LiveDot on={online} /> Direct
          </button>
        )}
      </div>
    </header>
  );
}

/** Thumb-reachable navigation on phones and small tablets. */
export function BottomNav({ siteId, active }: { siteId: string; active: NavKey }) {
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8edf5] bg-white/95 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((i) => (
          <button key={i.key} aria-current={active === i.key ? 'page' : undefined} onClick={() => go(i.key, siteId)}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active === i.key ? 'text-[#4f62ef]' : 'text-[#7a869d]'}`}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active === i.key ? 'bg-[#eef1ff]' : ''}`}><UiIcon name={i.icon} size={19} /></span>
            {i.short}
          </button>
        ))}
      </div>
    </nav>
  );
}

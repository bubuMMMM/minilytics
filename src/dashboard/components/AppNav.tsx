import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CommandMenu, SHORTCUT, useCommandShortcut } from './CommandMenu';
import { Link } from './Link';
import { NotificationBell } from './NotificationBell';
import { Logo } from './Logo';
import { LiveDot } from './Sparkline';
import { UiIcon } from './UiIcon';
import { ThemeToggle } from './ThemeToggle';
import { useMe } from '../lib/me';

export type NavKey = 'overview' | 'bots' | 'map' | 'social' | 'videos' | 'sponsors' | 'content' | 'sources' | 'realtime' | 'settings' | 'sites';
type Icon = Parameters<typeof UiIcon>[0]['name'];

const ITEMS: { key: NavKey; label: string; short: string; icon: Icon; path: string; keep: boolean }[] = [
  { key: 'overview', label: 'Vue d’ensemble', short: 'Aperçu', icon: 'bar-chart', path: '', keep: true },
  { key: 'sources', label: 'Sources', short: 'Sources', icon: 'compass', path: '/sources', keep: true },
  { key: 'map', label: 'Carte', short: 'Carte', icon: 'globe', path: '/map', keep: true },
  { key: 'social', label: 'Réseaux sociaux', short: 'Réseaux', icon: 'share', path: '/social', keep: true },
  { key: 'videos', label: 'Vidéos', short: 'Vidéos', icon: 'play', path: '/videos', keep: true },
  { key: 'sponsors', label: 'Sponsors', short: 'Sponsors', icon: 'megaphone', path: '/sponsors', keep: true },
  { key: 'content', label: 'Contenus', short: 'Contenus', icon: 'grid', path: '/contenus', keep: true },
  { key: 'bots', label: 'Bots IA', short: 'Bots IA', icon: 'bot', path: '/bots', keep: true },
  { key: 'realtime', label: 'Temps réel', short: 'Direct', icon: 'activity', path: '/realtime', keep: false },
  { key: 'settings', label: 'Réglages', short: 'Réglages', icon: 'settings', path: '/settings', keep: false },
];
const MOBILE_MAIN: NavKey[] = ['overview', 'sources', 'social', 'realtime'];

const TITLES: Record<NavKey, string> = {
  overview: 'Vue d’ensemble', map: 'Carte', social: 'Réseaux sociaux', videos: 'Vidéos', sponsors: 'Sponsors', content: 'Contenus', bots: 'Bots IA', sources: 'Sources', realtime: 'Temps réel', settings: 'Réglages', sites: 'Mes sites',
};

/** Read-only members don't get the Réglages tab (the API refuses their writes anyway). */
function useItems() {
  const me = useMe();
  return me?.role === 'viewer' ? ITEMS.filter((i) => i.key !== 'settings') : ITEMS;
}

/** Period and filters follow you between analysis views (they live in the URL). */
function hrefFor(siteId: string, item: (typeof ITEMS)[number]) {
  return `/site/${siteId}${item.path}` + (item.keep && typeof window !== 'undefined' ? window.location.search : '');
}

/** Site-level header + tab bar on desktop; compact header + bottom bar on phones. */
export function AppHeader({ siteId, active, online, title }: { siteId: string; active: NavKey; online?: boolean; title?: ReactNode }) {
  const [cmd, setCmd] = useState(false);
  const items = useItems();
  const toggle = useCallback((fn: (o: boolean) => boolean) => setCmd(fn), []);
  useCommandShortcut(toggle);
  useEffect(() => {
    document.title = `${TITLES[active]}${typeof title === 'string' ? ' · ' + title : ''} — Minilytics`;
  }, [active, title]);
  // Re-render on navigation so links carry the current query string.
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => force((x) => x + 1);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  return (
    <>
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-[56px] max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6 md:h-[56px]">
          <Link href="/sites" aria-label="Mes sites" className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg">
            <Logo small compact={!!title} />
            {title && <><svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 text-line-strong" aria-hidden><path d="M16 3 8 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><span className="min-w-0 truncate text-[14px] font-medium text-ink" translate="no">{title}</span></>}
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button type="button" className="ml-cmd-btn" onClick={() => setCmd(true)} aria-label={`Rechercher (${SHORTCUT})`}>
              <UiIcon name="search" size={16} />
              <span className="hidden lg:inline">Rechercher…</span>
              <kbd className="ml-kbd hidden lg:inline-flex">{SHORTCUT}</kbd>
            </button>
            <Link href="/demo" className="btn-ghost hidden lg:inline-flex">Démo</Link>
            <Link href="/sites" className="btn hidden md:inline-flex">Mes sites</Link>
            <NotificationBell siteId={siteId} />
            <ThemeToggle />
            {online !== undefined && (
              <Link href={`/site/${siteId}/realtime`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-ink-2 md:hidden">
                <LiveDot on={online} /> <span>Direct</span>
              </Link>
            )}
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto hidden max-w-[1480px] px-4 sm:px-6 md:block">
          <ul className="ml-navtabs">
            {items.map((i) => (
              <li key={i.key}>
                <Link href={hrefFor(siteId, i)} aria-current={active === i.key ? 'page' : undefined} className="ml-navtab">
                  {i.key === 'realtime' && <LiveDot on={!!online} />}
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <CommandMenu siteId={siteId} open={cmd} onClose={() => setCmd(false)} />
    </>
  );
}

/** Thumb-reachable navigation on phones: 4 main views + “Plus” sheet. */
export function BottomNav({ siteId, active }: { siteId: string; active: NavKey }) {
  const [more, setMore] = useState(false);
  const items = useItems();
  const inMore = !MOBILE_MAIN.includes(active);
  useEffect(() => {
    if (!more) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [more]);
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 bg-ink/25 md:hidden" onClick={() => setMore(false)}>
          <div role="dialog" aria-label="Plus de sections" className="ml-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-well" aria-hidden />
            {[...items.filter((i) => !MOBILE_MAIN.includes(i.key)), { key: 'sites' as NavKey, label: 'Mes sites', short: '', icon: 'layers' as Icon, path: '', keep: false }].map((i) => (
              <Link key={i.key} href={i.key === 'sites' ? '/sites' : hrefFor(siteId, i)} onClick={() => setMore(false)} aria-current={active === i.key ? 'page' : undefined}
                className={`flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-[15px] font-medium ${active === i.key ? 'bg-well text-ink' : 'text-ink-2'}`}>
                <UiIcon name={i.icon} size={19} /> {i.label}
              </Link>
            ))}
            <Link href="/demo" onClick={() => setMore(false)} className="flex min-h-[52px] items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-ink-2"><UiIcon name="eye" size={19} /> Démo publique</Link>
          </div>
        </div>
      )}
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_MAIN.map((k) => {
            const i = ITEMS.find((x) => x.key === k)!;
            return (
              <Link key={k} href={hrefFor(siteId, i)} aria-current={active === k ? 'page' : undefined} className={`ml-bottomtab ${active === k ? 'is-active' : ''}`}>
                <span className="ml-bottomtab-icon"><UiIcon name={i.icon} size={19} /></span>
                {i.short}
              </Link>
            );
          })}
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={`ml-bottomtab ${inMore || more ? 'is-active' : ''}`}>
            <span className="ml-bottomtab-icon"><UiIcon name="menu" size={19} /></span>
            Plus
          </button>
        </div>
      </nav>
    </>
  );
}

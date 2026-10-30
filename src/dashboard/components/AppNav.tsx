import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CommandMenu, SHORTCUT, useCommandShortcut } from './CommandMenu';
import { Link } from './Link';
import { NotificationBell } from './NotificationBell';
import { Logo } from './Logo';
import { LiveDot } from './Sparkline';
import { UiIcon } from './UiIcon';
import { ThemeToggle } from './ThemeToggle';
import { Favicon } from './Icons';
import { useMe } from '../lib/me';
import { NAV, TITLES, groupOf, navHref, type NavGroup, type NavItem, type NavKey } from '../lib/nav';
import { useApi } from '../lib/useApi';
import { api, type Site } from '../lib/api';

export type { NavKey } from '../lib/nav';

/** Read-only members don't get admin entries (the API refuses their writes anyway). */
function useNav(): NavGroup[] {
  const me = useMe();
  const viewer = me?.role === 'viewer';
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !(viewer && i.admin)) })).filter((g) => g.items.length);
}
const MOBILE_MAIN = ['overview', 'sources', 'map', 'realtime'];
const ALL = NAV.flatMap((g) => g.items);

/** Re-render on client navigation so links carry the current query string. */
function useLocationTick() {
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => force((x) => x + 1);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
}

/** Pads the page for the fixed sidebar (≥ 1024 px) while an app page is mounted. */
function useShellClass() {
  useEffect(() => {
    document.documentElement.classList.add('ml-shell');
    return () => document.documentElement.classList.remove('ml-shell');
  }, []);
}

/**
 * App chrome: grouped sidebar on desktop (≥ 1024 px), slim top bar + grouped tabs on tablets,
 * compact top bar + bottom bar on phones. Pages keep rendering <AppHeader/> + <BottomNav/>.
 */
export function AppHeader({ siteId, active, online, title }: { siteId: string; active: NavKey; online?: boolean; title?: ReactNode }) {
  const [cmd, setCmd] = useState(false);
  const nav = useNav();
  const toggle = useCallback((fn: (o: boolean) => boolean) => setCmd(fn), []);
  useCommandShortcut(toggle);
  useShellClass();
  useLocationTick();
  useEffect(() => {
    document.title = `${TITLES[active]}${typeof title === 'string' ? ' · ' + title : ''} — Minilytics`;
  }, [active, title]);
  const group = groupOf(active);

  return (
    <>
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <Sidebar siteId={siteId} active={active} online={online} nav={nav} onSearch={() => setCmd(true)} />
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/sites" aria-label="Mes sites" className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg lg:hidden">
              <Logo small compact={!!title} />
              {title && <><Slash /><span className="min-w-0 truncate text-[14px] font-medium text-ink" translate="no">{title}</span></>}
            </Link>
            {/* Desktop breadcrumb: group / page */}
            <nav aria-label="Fil d’Ariane" className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex">
              {group && <span className="text-ink-3">{group.label}</span>}
              {group && <Slash />}
              <span className="truncate font-medium text-ink">{TITLES[active]}</span>
            </nav>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button type="button" className="ml-cmd-btn lg:hidden" onClick={() => setCmd(true)} aria-label={`Rechercher (${SHORTCUT})`}>
              <UiIcon name="search" size={16} />
            </button>
            <NotificationBell siteId={siteId} />
            <ThemeToggle className="lg:hidden" />
            {online !== undefined && (
              <Link href={`/site/${siteId}/realtime`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-ink-2 md:hidden">
                <LiveDot on={online} /> <span>Direct</span>
              </Link>
            )}
          </div>
        </div>
        {/* Tablets: one row of tabs, grouped with thin separators */}
        <nav aria-label="Sections" className="mx-auto hidden max-w-[1480px] px-4 sm:px-6 md:block lg:hidden">
          <ul className="ml-navtabs">
            {nav.map((g, gi) => g.items.filter((i) => i.active).map((i, ii) => (
              <li key={i.key} className={gi > 0 && ii === 0 ? 'ml-navtabs-sep' : ''}>
                <Link href={navHref(siteId, i)} aria-current={active === i.active ? 'page' : undefined} className="ml-navtab">
                  {i.key === 'realtime' && <LiveDot on={!!online} />}
                  {i.label}
                </Link>
              </li>
            )))}
          </ul>
        </nav>
      </header>
      <CommandMenu siteId={siteId} open={cmd} onClose={() => setCmd(false)} />
    </>
  );
}

const Slash = () => <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 text-line-strong" aria-hidden><path d="M16 3 8 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;

function Sidebar({ siteId, active, online, nav, onSearch }: { siteId: string; active: NavKey; online?: boolean; nav: NavGroup[]; onSearch: () => void }) {
  const { data: sites } = useApi<Site[]>('/api/sites');
  const site = sites?.find((s) => s.id === siteId);
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const isOn = (i: NavItem) => (i.path.startsWith('#') ? active === 'overview' && hash === i.path : i.active === active && !(active === 'overview' && hash && ALL.some((x) => x.path === hash)));
  return (
    <aside className="ml-sidebar" aria-label="Navigation principale">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/sites" className="flex min-h-[40px] items-center rounded-md" aria-label="Minilytics — mes sites"><Logo small /></Link>
      </div>
      <div className="px-3">
        <Link href="/sites" className="ml-side-site" title="Changer de site">
          {site ? <Favicon domain={site.domain} size={18} /> : <span className="h-[18px] w-[18px] rounded bg-well" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink" translate="no">{site?.name ?? '…'}</span>
            <span className="block truncate font-mono text-[11px] text-ink-4" translate="no">{site?.domain ?? ''}</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-4" aria-hidden><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
        </Link>
        <button type="button" onClick={onSearch} className="ml-side-search" aria-label={`Rechercher une vue ou un réglage (${SHORTCUT})`}>
          <UiIcon name="search" size={15} /><span className="flex-1 text-left">Rechercher…</span><kbd className="ml-kbd">{SHORTCUT}</kbd>
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" aria-label="Vues">
        {nav.map((g) => (
          <div key={g.id} className="mt-3.5 first:mt-1">
            <div className="ml-side-group">{g.label}</div>
            <ul className="space-y-px">
              {g.items.map((i) => (
                <li key={i.key}>
                  <Link href={navHref(siteId, i)} aria-current={isOn(i) ? 'page' : undefined} className="ml-side-item">
                    <UiIcon name={i.icon} size={16} />
                    <span className="flex-1 truncate">{i.label}</span>
                    {i.key === 'realtime' && <LiveDot on={!!online} />}
                    {i.absolute && <UiIcon name="arrow-up-right" size={13} className="text-ink-4" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-0.5 border-t border-line px-3 py-2">
        <Link href="/sites" className="ml-side-icon" title="Mes sites" aria-label="Mes sites"><UiIcon name="layers" size={16} /></Link>
        <Link href="/team" className="ml-side-icon" title="Équipe et sécurité" aria-label="Équipe et sécurité"><UiIcon name="users" size={16} /></Link>
        <Link href="/demo" className="ml-side-icon" title="Démo publique" aria-label="Démo publique"><UiIcon name="eye" size={16} /></Link>
        <span className="flex-1" />
        <ThemeToggle />
      </div>
    </aside>
  );
}

/** Thumb-reachable navigation on phones: 4 main views + a « Plus » sheet grouped by section. */
export function BottomNav({ siteId, active }: { siteId: string; active: NavKey }) {
  const [more, setMore] = useState(false);
  const nav = useNav();
  const inMore = !MOBILE_MAIN.includes(active);
  useEffect(() => {
    if (!more) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', on); document.body.style.overflow = ''; };
  }, [more]);
  return (
    <>
      {more && (
        <div className="ml-sheet-backdrop md:hidden" onClick={() => setMore(false)}>
          <div role="dialog" aria-modal="true" aria-label="Toutes les sections" className="ml-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-line-strong/60" aria-hidden />
            <div className="max-h-[70dvh] overflow-y-auto overscroll-contain pb-1">
              {nav.map((g) => (
                <div key={g.id} className="mt-3 first:mt-1">
                  <div className="px-3 pb-1 text-[11px] font-medium text-ink-4">{g.label}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {g.items.map((i) => (
                      <Link key={i.key} href={navHref(siteId, i)} onClick={() => setMore(false)} aria-current={i.active === active ? 'page' : undefined}
                        className={`flex min-h-[48px] items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition-colors duration-150 ${i.active === active ? 'bg-well text-ink' : 'text-ink-2 active:bg-well'}`}>
                        <UiIcon name={i.icon} size={18} className="shrink-0 text-ink-3" /> <span className="truncate">{i.short ?? i.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-1 border-t border-line pt-3">
                <Link href="/sites" onClick={() => setMore(false)} className="flex min-h-[48px] items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium text-ink-2"><UiIcon name="layers" size={18} className="text-ink-3" /> Mes sites</Link>
                <Link href="/team" onClick={() => setMore(false)} className="flex min-h-[48px] items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium text-ink-2"><UiIcon name="users" size={18} className="text-ink-3" /> Équipe</Link>
              </div>
            </div>
          </div>
        </div>
      )}
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_MAIN.map((k) => {
            const i = ALL.find((x) => x.key === k)!;
            return (
              <Link key={k} href={navHref(siteId, i)} aria-current={active === i.active ? 'page' : undefined} className={`ml-bottomtab ${active === i.active ? 'is-active' : ''}`}>
                <span className="ml-bottomtab-icon"><UiIcon name={i.icon} size={19} /></span>
                {i.short ?? i.label}
              </Link>
            );
          })}
          <button type="button" aria-expanded={more} aria-haspopup="dialog" onClick={() => setMore((m) => !m)} className={`ml-bottomtab ${inMore || more ? 'is-active' : ''}`}>
            <span className="ml-bottomtab-icon"><UiIcon name="menu" size={19} /></span>
            Plus
          </button>
        </div>
      </nav>
    </>
  );
}

/** Header for account-level pages (Mes sites, Équipe): same height, search and actions as the site shell. */
export function AccountHeader({ current, width = 'max-w-[1200px]' }: { current: 'sites' | 'team'; width?: string }) {
  const [cmd, setCmd] = useState(false);
  const me = useMe();
  const toggle = useCallback((fn: (o: boolean) => boolean) => setCmd(fn), []);
  useCommandShortcut(toggle);
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.dispatchEvent(new Event('ml:logout'));
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const tab = (href: string, key: 'sites' | 'team', label: string, icon: Parameters<typeof UiIcon>[0]['name']) => (
    <Link href={href} aria-current={current === key ? 'page' : undefined} className={`btn-ghost !text-[13px] ${current === key ? '!bg-well !text-ink' : ''}`}><UiIcon name={icon} size={15} /><span className="hidden sm:inline">{label}</span></Link>
  );
  return (
    <>
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className={`mx-auto flex h-14 ${width} items-center justify-between gap-3 px-4 sm:px-6`}>
          <Link href="/sites" aria-label="Mes sites" className="flex min-h-[44px] items-center rounded-md"><Logo small /></Link>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button type="button" className="ml-cmd-btn" onClick={() => setCmd(true)} aria-label={`Rechercher (${SHORTCUT})`}><UiIcon name="search" size={16} /><kbd className="ml-kbd hidden lg:inline-flex">{SHORTCUT}</kbd></button>
            {tab('/sites', 'sites', 'Mes sites', 'layers')}
            {tab('/team', 'team', me?.role === 'owner' || !me ? 'Équipe' : 'Mon compte', 'users')}
            <Link href="/demo" className="btn-ghost hidden !text-[13px] md:inline-flex"><UiIcon name="eye" size={15} />Démo</Link>
            <ThemeToggle />
            <button type="button" className="btn-ghost !text-[13px]" onClick={logout} aria-label="Se déconnecter"><UiIcon name="logout" size={15} /><span className="hidden lg:inline">Déconnexion</span></button>
          </div>
        </div>
      </header>
      <CommandMenu open={cmd} onClose={() => setCmd(false)} />
    </>
  );
}

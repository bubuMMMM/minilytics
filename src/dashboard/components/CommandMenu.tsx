import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../App';
import { UiIcon } from './UiIcon';
import { applyTheme } from './ThemeToggle';
import { useMe } from '../lib/me';
import { NAV, SETTINGS_SECTIONS, navHref } from '../lib/nav';

/** Navigate, then land on an in-page anchor if the target has one. */
function go(href: string) {
  navigate(href);
  window.dispatchEvent(new Event('ml:hash'));
}

type Cmd = { id: string; label: string; hint?: string; icon: Parameters<typeof UiIcon>[0]['name']; run: () => void; group: string };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const SHORTCUT = isMac ? '⌘\u00a0K' : 'Ctrl\u00a0K';

/**
 * Keyboard-first command palette (pattern adapted from 21st.dev "Command Menu with Global Search"):
 * ⌘K / Ctrl+K or "/" opens it, arrows move, Enter runs, Escape closes and returns focus.
 */
export function CommandMenu({ siteId, open, onClose }: { siteId?: string; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const before = useRef<Element | null>(null);
  const me = useMe();

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [];
    const viewer = me?.role === 'viewer';
    if (siteId) {
      const base = `/site/${siteId}`;
      for (const g of NAV) for (const it of g.items) {
        if (viewer && it.admin) continue;
        list.push({ id: 'n-' + it.key, group: g.label, label: it.label, hint: it.hint, icon: it.icon, run: () => go(navHref(siteId, it)) });
      }
      if (!viewer) for (const sec of SETTINGS_SECTIONS)
        list.push({ id: 's-' + sec.id, group: 'Réglages', label: sec.label, hint: sec.desc, icon: sec.icon, run: () => go(`${base}/settings/${sec.id}`) });
      const period = (p: string, label: string) => ({
        id: 'p' + p, group: 'Période', label, icon: 'calendar' as const,
        run: () => { const u = new URL(window.location.href); u.searchParams.set('period', p); u.searchParams.delete('from'); u.searchParams.delete('to'); navigate(u.pathname + u.search); },
      });
      list.push(period('now', 'Maintenant (30 min)'), period('today', 'Aujourd’hui'), period('7d', '7 derniers jours'), period('30d', '30 derniers jours'), period('12m', '12 derniers mois'));
      list.push(
        { id: 'a-script', group: 'Actions', label: 'Copier le script de suivi', hint: 'Balise <script> de ce site', icon: 'copy', run: () => { navigator.clipboard?.writeText(`<script defer data-website-id="${siteId}" src="${window.location.origin}/js/script.js"></script>`).catch(() => {}); } },
        ...(!viewer ? [{ id: 'a-share', group: 'Actions', label: 'Créer un lien de partage', hint: 'Tableau de bord public en lecture seule', icon: 'link' as const, run: () => go(`${base}/settings/partage`) }] : []),
      );
    }
    list.push(
      { id: 'a-theme', group: 'Actions', label: document.documentElement.classList.contains('dark') ? 'Passer en thème clair' : 'Passer en thème sombre', icon: 'sun', run: () => applyTheme(!document.documentElement.classList.contains('dark')) },
      { id: 'sites', group: 'Général', label: 'Mes sites', icon: 'layers', run: () => navigate('/sites') },
      { id: 'team', group: 'Général', label: 'Équipe et sécurité', hint: 'Membres, invitations, sessions', icon: 'users', run: () => navigate('/team') },
      { id: 'api', group: 'Général', label: 'Documentation API', hint: 'REST v1, OpenAPI, MCP, CLI', icon: 'book', run: () => navigate('/api-docs') },
      { id: 'demo', group: 'Général', label: 'Démo publique', icon: 'eye', run: () => navigate('/demo') },
    );
    return list;
  }, [siteId, me?.role, open]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!n) return cmds;
    return cmds.filter((c) => (c.label + ' ' + (c.hint ?? '') + ' ' + c.group).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(n));
  }, [q, cmds]);

  useEffect(() => {
    if (!open) return;
    before.current = document.activeElement;
    setQ(''); setI(0);
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => { clearTimeout(t); (before.current as HTMLElement | null)?.focus?.(); };
  }, [open]);

  useEffect(() => { if (open && shown[i]) document.getElementById('cmd-' + shown[i].id)?.scrollIntoView({ block: 'nearest' }); }, [i, open, shown]);

  if (!open) return null;
  const run = (c?: Cmd) => { if (!c) return; onClose(); c.run(); };
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 p-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Menu de commandes" className="ml-cmd w-full max-w-[560px] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <UiIcon name="search" size={18} className="text-ink-3" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="ml-cmd-list"
            aria-activedescendant={shown[i] ? 'cmd-' + shown[i].id : undefined}
            aria-label="Rechercher une page ou une action"
            className="h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-ink-4"
            placeholder="Aller à une vue, un réglage, une action…"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(shown.length - 1, x + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); run(shown[i]); }
              else if (e.key === 'Escape') onClose();
            }}
          />
          <kbd className="ml-kbd hidden sm:inline-flex">Échap</kbd>
        </div>
        <ul id="ml-cmd-list" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
          {shown.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-ink-3">Aucun résultat pour « {q} ».</li>}
          {shown.map((c, k) => {
            const head = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <li key={c.id} role="presentation">
                {head && <div className="px-3 pb-1 pt-3 text-[11px] font-medium text-ink-4">{head}</div>}
                <div
                  id={'cmd-' + c.id}
                  role="option"
                  aria-selected={k === i}
                  onMouseMove={() => setI(k)}
                  onClick={() => run(c)}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 text-[14px] ${k === i ? 'bg-well text-ink' : 'text-ink-2'}`}
                >
                  <UiIcon name={c.icon} size={17} />
                  <span className="font-medium">{c.label}</span>
                  {c.hint && <span className="ml-auto truncate text-[12px] text-ink-3">{c.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Global shortcut; ignores keystrokes typed in fields. */
export function useCommandShortcut(setOpen: (fn: (o: boolean) => boolean) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [setOpen]);
}

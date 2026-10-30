import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../App';
import { UiIcon } from './UiIcon';

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

  const cmds = useMemo<Cmd[]>(() => {
    const keep = (p: string) => () => navigate(p + window.location.search);
    const list: Cmd[] = [];
    if (siteId) {
      const base = `/site/${siteId}`;
      list.push(
        { id: 'o', group: 'Aller à', label: 'Vue d’ensemble', icon: 'bar-chart', run: keep(base) },
        { id: 'v', group: 'Aller à', label: 'Vidéos', icon: 'play', run: keep(base + '/videos') },
        { id: 's', group: 'Aller à', label: 'Sponsors', hint: 'Impressions, clics, CTR', icon: 'megaphone', run: keep(base + '/sponsors') },
        { id: 'c', group: 'Aller à', label: 'Contenus', hint: 'Sections et vidéos vues', icon: 'grid', run: keep(base + '/contenus') },
        { id: 'src', group: 'Aller à', label: 'Sources', hint: 'Canaux, référents, pays, appareils', icon: 'compass', run: keep(base + '/sources') },
        { id: 'social', group: 'Aller à', label: 'Réseaux sociaux', hint: 'Visites des réseaux, liens et mentions 𝕏', icon: 'share', run: keep(base + '/social') },
        { id: 'bots', group: 'Aller à', label: 'Bots IA', hint: 'Robots d’IA et trafic venu des assistants', icon: 'bot', run: keep(base + '/bots') },
        { id: 'rt', group: 'Aller à', label: 'Temps réel', icon: 'activity', run: () => navigate(base + '/realtime') },
        { id: 'set', group: 'Aller à', label: 'Réglages et installation', icon: 'settings', run: () => navigate(base + '/settings') },
      );
      const period = (p: string, label: string) => ({
        id: 'p' + p, group: 'Période', label, icon: 'calendar' as const,
        run: () => { const u = new URL(window.location.href); u.searchParams.set('period', p); u.searchParams.delete('from'); u.searchParams.delete('to'); navigate(u.pathname + u.search); },
      });
      list.push(period('now', 'Maintenant (30 min)'), period('today', 'Aujourd’hui'), period('7d', '7 derniers jours'), period('30d', '30 derniers jours'), period('12m', '12 derniers mois'));
    }
    list.push(
      { id: 'sites', group: 'Général', label: 'Mes sites', icon: 'layers', run: () => navigate('/sites') },
      { id: 'team', group: 'Général', label: 'Équipe et sécurité', hint: 'Membres, invitations, sessions', icon: 'users', run: () => navigate('/team') },
      { id: 'demo', group: 'Général', label: 'Démo publique', icon: 'eye', run: () => navigate('/demo') },
    );
    return list;
  }, [siteId]);

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
            placeholder="Aller à, changer de période…"
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
                {head && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-4">{head}</div>}
                <div
                  id={'cmd-' + c.id}
                  role="option"
                  aria-selected={k === i}
                  onMouseMove={() => setI(k)}
                  onClick={() => run(c)}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 text-[14px] ${k === i ? 'bg-accent-soft text-accent' : 'text-ink-2'}`}
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

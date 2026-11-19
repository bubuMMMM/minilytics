import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { UiIcon, type UiIconName } from '../components/UiIcon';

export type CommandEntry = {
  id: string;
  title: string;
  detail: string;
  group: 'Navigation' | 'Fiches produits';
  icon: UiIconName;
  keywords?: string;
  onSelect: () => void;
};
const normalized = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');

export function DiscountCommand({
  open,
  onClose,
  onOpen,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  entries: CommandEntry[];
}) {
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const matches = useMemo(()=>{
    const tokens=normalized(search).trim().split(/\s+/).filter(Boolean);
    return entries.filter(entry=>{
      const haystack=normalized([entry.title,entry.detail,entry.group,entry.keywords||''].join(' '));
      return tokens.every(token=>haystack.includes(token));
    }).slice(0,16);
  },[entries,search]);
  useEffect(()=>{
    const listener=(event:globalThis.KeyboardEvent)=>{
      if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') {
        event.preventDefault();
        if(!open){triggerRef.current=document.activeElement as HTMLElement;onOpen();}
        else onClose();
      }
      if(event.key==='Escape'&&open) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown',listener);
    return ()=>window.removeEventListener('keydown',listener);
  },[open,onOpen,onClose]);
  useEffect(()=>{
    if(open){
      setSearch('');
      setSelected(0);
      const oldOverflow=document.body.style.overflow;
      document.body.style.overflow='hidden';
      inputRef.current?.focus();
      return ()=>{document.body.style.overflow=oldOverflow;triggerRef.current?.focus();};
    }
  },[open]);
  const choose=(i:number)=>{
    const item=matches[i];
    if(!item)return;
    onClose();
    item.onSelect();
  };
  const onKeyDown=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
    if(event.key==='Tab'){
      const target=event.target;
      if(target===inputRef.current&&event.shiftKey){
        event.preventDefault();closeRef.current?.focus();
      }else if(target===closeRef.current&&!event.shiftKey){
        event.preventDefault();inputRef.current?.focus();
      }
    }
  };
  const inputKey=(event:ReactKeyboardEvent<HTMLInputElement>)=>{
    if(event.key==='ArrowDown'){event.preventDefault();setSelected(i=>Math.min(matches.length-1,Math.max(0,i+1)));}
    if(event.key==='ArrowUp'){event.preventDefault();setSelected(i=>Math.max(0,i-1));}
    if(event.key==='Home'){event.preventDefault();setSelected(0);}
    if(event.key==='End'){event.preventDefault();setSelected(Math.max(0,matches.length-1));}
    if(event.key==='Enter'){event.preventDefault();choose(selected);}
  };
  if(!open)return null;
  const groups = (['Navigation','Fiches produits'] as const).map(group=>({
    group,
    options:matches.map((item,index)=>({...item,index})).filter(item=>item.group===group),
  })).filter(group=>group.options.length);
  return (
    <div className="dq-command-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="dq-command" role="dialog" aria-modal="true" aria-labelledby="dq-command-title" onKeyDown={onKeyDown}>
        <h2 id="dq-command-title" className="sr-only">Rechercher dans Discount & Qualité Insights</h2>
        <div className="flex min-h-[67px] items-center gap-3 border-b border-line px-4 sm:px-5">
          <UiIcon name="search" size={21} className="shrink-0 text-ink-4"/>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="dq-command-list"
            aria-autocomplete="list"
            aria-activedescendant={matches.length?'dq-command-option-'+selected:undefined}
            type="search"
            placeholder="Rechercher une page, une fiche produit…"
            value={search}
            onChange={e=>{setSearch(e.target.value);setSelected(0);}}
            onKeyDown={inputKey}
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
          />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer la recherche" className="dq-action !min-h-[29px] !px-2 text-[11px]"><UiIcon name="x" size={15}/><span className="hidden sm:inline">Esc</span></button>
        </div>
        <div id="dq-command-list" role="listbox" aria-label="Résultats de recherche" className="dq-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {groups.map(group=><div key={group.group} className="mb-4 last:mb-0">
            <p className="dq-caption mb-2 px-2.5">{group.group}</p>
            <div className="space-y-1">{group.options.map(item=><button
              key={item.id}
              id={'dq-command-option-'+item.index}
              role="option"
              type="button"
              aria-selected={selected===item.index}
              tabIndex={-1}
              onMouseEnter={()=>setSelected(item.index)}
              data-active={selected===item.index?'true':'false'}
              onClick={()=>choose(item.index)}
              className="dq-command-result"
            >
              <span className="dq-command-glyph"><UiIcon name={item.icon} size={17}/></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{item.title}</span><span className="mt-0.5 block truncate text-[11px] text-ink-4">{item.detail}</span></span>
              <UiIcon name="arrow-right" size={15} className="shrink-0 text-ink-4"/>
            </button>)}</div>
          </div>)}
          {!matches.length&&<div className="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-ink-3"><UiIcon name="search" size={22}/></span><p className="text-[13px] font-semibold text-ink">Aucun résultat</p><p className="text-[12px] text-ink-4">Essaie « réputation », « stock », « THERMOR » ou « carte des clics ».</p></div>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-well/50 px-4 py-3 text-[11px] text-ink-4 sm:px-5">
          <span className="flex items-center gap-2"><kbd className="dq-kbd">↑</kbd><kbd className="dq-kbd">↓</kbd> Naviguer <kbd className="dq-kbd">↵</kbd> Ouvrir</span>
          <span>Recherche locale · aucun accès à des données privées</span>
        </footer>
      </div>
    </div>
  );
}

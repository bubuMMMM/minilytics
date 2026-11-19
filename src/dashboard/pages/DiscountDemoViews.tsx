import { useState, type ReactNode } from 'react';
import { MetricTile } from '../components/StudioUI';
import { UiIcon } from '../components/UiIcon';

type Days = 7 | 30 | 90;
const nf = (v:number) => new Intl.NumberFormat('fr-FR').format(v);
const eur = (v:number) => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
const products = [
  { name:'Cabine de douche intégrale', category:'Salle de bain', path:'/cabine-douche-integrale', views:3231, orders:51, revenue:17442 },
  { name:'Radiateur à inertie 1500 W', category:'Chauffage', path:'/radiateur-inertie-1500w', views:2670, orders:44, revenue:9130 },
  { name:'Meuble vasque 80 cm', category:'Mobilier', path:'/meuble-vasque-80cm', views:2384, orders:39, revenue:10725 },
  { name:'Mitigeur thermostatique', category:'Robinetterie', path:'/mitigeur-thermostatique', views:1996, orders:33, revenue:4455 },
  { name:'Porte de douche coulissante', category:'Salle de bain', path:'/porte-douche-coulissante', views:1853, orders:27, revenue:6625 },
];
const feed = [
  {source:'Google',city:'Nantes',device:'Mobile',index:0,age:'À l’instant'},
  {source:'ChatGPT',city:'Paris',device:'Ordinateur',index:2,age:'Il y a 9 s'},
  {source:'Direct',city:'Lyon',device:'Mobile',index:1,age:'Il y a 18 s'},
  {source:'Leboncoin',city:'Bordeaux',device:'Mobile',index:3,age:'Il y a 31 s'},
  {source:'Google',city:'Rennes',device:'Ordinateur',index:0,age:'Il y a 45 s'},
  {source:'Perplexity',city:'Lille',device:'Mobile',index:4,age:'Il y a 1 min'},
];
function Panel({title,desc,children}:{title:string;desc:string;children:ReactNode}){
  return <section className="ml-bento min-w-0 p-5 sm:p-6"><div className="mb-5"><h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2><p className="mt-1 text-[12px] text-ink-4">{desc}</p></div>{children}</section>;
}
export function LiveProductPages({days,tick,onInspect,compact=false}:{days:Days;tick:number;onInspect:(index:number)=>void;compact?:boolean}){
  const [device,setDevice]=useState<'all'|'mobile'|'desktop'>('all');
  const scale=days/30;
  const rows=products.map((p,index)=>({...p,index,active:Math.max(1,Math.round(10-index*1.6+(tick+index)%4)),shown:Math.round(p.views*scale)}));
  const events=feed.map((e,i)=>({...e,key:i,index:(e.index+Math.floor(tick/3))%products.length})).filter(v=>device==='all'||v.device===(device==='mobile'?'Mobile':'Ordinateur'));
  return <div className="mb-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
    <Panel title={compact?'Fiches produits consultées en direct':'Pages produits en direct'} desc="Démonstration du trafic · actualisation simulée toutes les 15 secondes">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4"><div className="flex items-center gap-2"><span className="relative flex h-2 w-2"><i className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50"/><i className="relative h-2 w-2 rounded-full bg-success"/></span><strong className="text-[25px] font-semibold tabular-nums text-ink">{rows.reduce((a,p)=>a+p.active,0)}</strong><span className="text-[12px] text-ink-3">sur les fiches produits</span></div><span className="rounded-md bg-well px-2 py-1 text-[10px] font-semibold text-ink-3">SIMULATION</span></div>
      {rows.slice(0,compact?4:5).map(p=><button key={p.name} type="button" onClick={()=>onInspect(p.index)} className="group flex w-full min-w-0 items-center gap-3 rounded-lg px-1 py-3 text-left hover:bg-well"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-well text-ink-3"><UiIcon name="file-text" size={18}/></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-ink">{p.name}</span><span className="block truncate font-mono text-[10px] text-ink-4">{p.path}</span></span><span className="min-w-[48px] shrink-0 text-right"><span className="flex items-center justify-end gap-1 text-[12px] font-semibold tabular-nums text-ink"><i className="h-1.5 w-1.5 rounded-full bg-success"/>{p.active}</span><span className="text-[10px] text-ink-4">actifs</span></span><span className="min-w-[58px] shrink-0 text-right"><span className="block text-[12px] font-semibold tabular-nums text-ink">{nf(p.shown)}</span><span className="text-[10px] text-ink-4">vues / {days} j</span></span><UiIcon name="chevron-right" size={13} className="hidden text-ink-4 sm:block"/></button>)}
      <p className="mt-4 border-t border-line pt-3 text-[11px] text-ink-4">Sélectionne une fiche pour voir les zones cliquées.</p>
    </Panel>
    <Panel title="Flux de consultation des fiches" desc="Derniers événements fictifs, avec source et appareil">
      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-well p-1">{([{key:'all',label:'Tous'},{key:'mobile',label:'Mobile'},{key:'desktop',label:'Ordinateur'}] as const).map(o=><button key={o.key} onClick={()=>setDevice(o.key)} aria-pressed={device===o.key} className={'flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold '+(device===o.key?'bg-surface text-ink shadow-sm':'text-ink-3 hover:text-ink')}>{o.label}</button>)}</div>
      {events.slice(0,compact?4:6).map(e=><button key={e.key} type="button" onClick={()=>onInspect(e.index)} className="flex w-full min-w-0 items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-well"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-well text-ink-3"><UiIcon name={e.device==='Mobile'?'smartphone':'layers'} size={15}/></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-ink">{products[e.index].name}</span><span className="text-[11px] text-ink-4">{e.city} · {e.source}</span></span><span className="shrink-0 text-[10px] text-ink-4">{e.age}</span></button>)}
      {!events.length&&<p className="py-8 text-center text-[12px] text-ink-4">Aucune visite pour ce filtre.</p>}
      <div className="mt-4 border-t border-line pt-3 text-[11px] text-ink-4">Aucun visiteur réel n’est suivi.</div>
    </Panel>
  </div>;
}
export function ProductFiles({days,onInspect}:{days:Days;onInspect:(index:number)=>void}){
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<'views'|'orders'|'revenue'>('views');
  const factor=days/30;
  const rows=products.map((p,index)=>({...p,index,views:Math.round(p.views*factor),orders:Math.round(p.orders*factor),revenue:Math.round(p.revenue*factor)})).filter(p=>(p.name+' '+p.category).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b[sort]-a[sort]);
  const views=Math.round(products.reduce((n,p)=>n+p.views,0)*factor);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><MetricTile label="Vues des fiches" value={nf(views)} caption={'Toutes les fiches · '+days+' jours'} icon="eye" number="05" current={views} previous={views*.87}/><MetricTile label="Fiches étudiées" value={nf(products.length)} caption="Exemples de produits" icon="layers" number="06"/><MetricTile label="Moyenne par fiche" value={nf(Math.round(views/products.length))} caption="Consultations simulées" icon="users" number="07"/></div>
    <Panel title="Vues par fiche produit" desc="Classement par consultations, commandes ou chiffre d'affaires simulés">
      <div className="mb-5 flex flex-wrap gap-3"><label className="flex min-h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3"><UiIcon name="search" size={15} className="text-ink-4"/><input aria-label="Rechercher une fiche produit" placeholder="Rechercher une fiche…" value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"/></label><label className="flex items-center gap-2 rounded-lg border border-line px-3 text-[12px] text-ink-3">Trier par<select aria-label="Tri des fiches" value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="bg-transparent py-2 text-[12px] font-semibold text-ink outline-none"><option value="views">Vues</option><option value="orders">Commandes</option><option value="revenue">Revenus</option></select></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-[12px]"><thead className="border-b border-line text-ink-4"><tr><th className="pb-3 font-medium">Fiche / URL</th><th className="pb-3 text-right font-medium">Vues</th><th className="pb-3 text-right font-medium">Commandes</th><th className="pb-3 text-right font-medium">Conversion</th><th className="pb-3 text-right font-medium">CA</th><th className="pb-3 text-right font-medium">Clics</th></tr></thead><tbody>{rows.map(p=><tr key={p.path} className="border-b border-line/60 last:border-b-0"><td className="py-3"><div className="font-semibold text-ink">{p.name}</div><div className="font-mono text-[10px] text-ink-4">{p.path}</div></td><td className="py-3 text-right font-semibold tabular-nums">{nf(p.views)}</td><td className="py-3 text-right tabular-nums">{nf(p.orders)}</td><td className="py-3 text-right tabular-nums">{p.views?(100*p.orders/p.views).toFixed(1).replace('.',','):'0'} %</td><td className="py-3 text-right tabular-nums">{eur(p.revenue)}</td><td className="py-3 text-right"><button type="button" onClick={()=>onInspect(p.index)} className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent-soft">Carte des clics</button></td></tr>)}</tbody></table>{!rows.length&&<p className="py-6 text-center text-ink-4">Aucune fiche trouvée.</p>}</div>
      <p className="mt-4 border-t border-line pt-3 text-[11px] text-ink-4">Les URL sont des exemples et ne correspondent pas nécessairement aux vraies URL de la boutique.</p>
    </Panel>
  </div>;
}
const hotAreas=[
  {label:'Image principale',x:26,y:48,mx:48,my:25,count:1210},
  {label:'Galerie / miniatures',x:26,y:83,mx:45,my:50,count:490},
  {label:'Titre du produit',x:76,y:28,mx:50,my:61,count:290},
  {label:'Prix affiché',x:76,y:46,mx:50,my:72,count:820},
  {label:'Ajouter au panier',x:76,y:62,mx:50,my:84,count:1470},
  {label:'Options de livraison',x:76,y:79,mx:50,my:94,count:320}
];
export function HeatmapDemo({days,productIndex,onSelectProduct}:{days:Days;productIndex:number;onSelectProduct:(index:number)=>void}){
  const [mode,setMode]=useState<'density'|'points'>('density');
  const [device,setDevice]=useState<'desktop'|'mobile'>('desktop');
  const [opacity,setOpacity]=useState(75);
  const [highlight,setHighlight]=useState<number|null>(null);
  const p=products[productIndex];
  const factor=days/30;
  const hotspots=hotAreas.map((h,index)=>({...h,index,clicks:Math.round(h.count*factor*(1-productIndex*.075))})).sort((a,b)=>b.clicks-a.clicks);
  const total=hotspots.reduce((n,h)=>n+h.clicks,0);
  return <div className="space-y-4">
    <Panel title="Carte de chaleur des clics" desc="Zones de clics sur une maquette de fiche. Modèle interactif, données fictives.">
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="min-w-0 text-[12px] font-medium text-ink-3"><span className="mb-1.5 block">Fiche à analyser</span><select aria-label="Sélectionner une fiche" value={productIndex} onChange={e=>{onSelectProduct(Number(e.target.value));setHighlight(null);}} className="min-h-9 w-full rounded-lg border border-line bg-surface px-3 text-[12px] text-ink">{products.map((item,i)=><option key={i} value={i}>{item.name}</option>)}</select></label>
        <div><span className="mb-1.5 block text-[12px] font-medium text-ink-3">Écran</span><div className="flex rounded-lg border border-line p-1">{(['desktop','mobile'] as const).map(k=><button key={k} onClick={()=>{setDevice(k);setHighlight(null);}} aria-pressed={device===k} className={'rounded-md px-3 py-1.5 text-[11px] font-semibold '+(device===k?'bg-ink text-canvas':'text-ink-3 hover:bg-well')}>{k==='desktop'?'Desktop':'Mobile'}</button>)}</div></div>
        <div><span className="mb-1.5 block text-[12px] font-medium text-ink-3">Mode</span><div className="flex rounded-lg border border-line p-1">{(['density','points'] as const).map(k=><button key={k} onClick={()=>setMode(k)} aria-pressed={mode===k} className={'rounded-md px-3 py-1.5 text-[11px] font-semibold '+(mode===k?'bg-ink text-canvas':'text-ink-3 hover:bg-well')}>{k==='density'?'Densité':'Points'}</button>)}</div></div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-[11px] text-ink-4">{p.path}</span><label className="flex items-center gap-2 text-[11px] text-ink-3">Opacité <input type="range" min={20} max={100} value={opacity} onChange={e=>setOpacity(Number(e.target.value))} className="w-28 accent-[rgb(var(--accent))]"/><span className="w-8 text-right font-mono">{opacity}%</span></label></div>
      <div className="rounded-xl border border-line bg-well p-3 sm:p-5">
        <div className={'relative mx-auto overflow-hidden rounded-lg border border-line-strong bg-white text-zinc-900 shadow-sm '+(device==='mobile'?'max-w-[350px]':'max-w-[980px]')}>
          <div className="flex h-8 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 text-[9px] text-zinc-500"><span>● ● ●</span><span className="max-w-[70%] truncate font-mono">discountetqualite.fr{p.path}</span><UiIcon name="lock" size={12}/></div>
          <div className="flex h-12 items-center justify-between border-b border-zinc-200 px-4"><span className="text-[13px] font-black tracking-tight">DISCOUNT <span className="text-blue-600">&</span> QUALITÉ</span><span className="flex gap-2 text-zinc-500"><UiIcon name="search" size={16}/><UiIcon name="layers" size={16}/></span></div>
          <p className="px-4 py-2 font-mono text-[9px] text-zinc-400">Accueil / {p.category} / Fiche produit</p>
          <div className={'grid '+(device==='desktop'?'min-h-[435px] grid-cols-2 gap-6 px-5 pb-8':'min-h-[620px] grid-cols-1 gap-2 px-5 pb-8')}>
            <div className="flex min-w-0 flex-col gap-3">
              <div className={'flex items-center justify-center rounded-lg border border-zinc-100 bg-zinc-50 '+(device==='desktop'?'h-[340px]':'h-[235px]')}>
                <div className="relative flex h-[63%] w-[56%] items-center justify-center rounded-xl border-2 border-zinc-300 bg-white shadow-sm"><div className="absolute inset-3 rounded-lg border border-zinc-100"/><UiIcon name="layers" size={42} className="text-zinc-300"/><span className="absolute bottom-3 text-center text-[9px] font-medium text-zinc-400">Visuel produit fictif</span></div>
              </div>
              <div className="flex gap-2">{[1,2,3].map(n=><div key={n} className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-[9px] text-zinc-400">0{n}</div>)}</div>
            </div>
            <div className="min-w-0 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">DÉSTOCKAGE · {p.category}</p>
              <div className="mt-2 text-[16px] font-semibold leading-snug sm:text-[20px]">{p.name}</div>
              <div className="mt-3 text-[10px] text-zinc-500">★★★★☆ <span>Exemple de fiche</span></div>
              <div className="mt-6 flex items-end gap-3"><strong className="text-[28px] tracking-tight">{eur(p.revenue/p.orders)}</strong><span className="pb-1 text-[11px] text-zinc-400 line-through">{eur(p.revenue/p.orders*1.42)}</span></div>
              <p className="mt-2 text-[11px] font-medium text-green-700">● En stock (simulation)</p>
              <div className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white"><UiIcon name="plus" size={14}/> Ajouter au panier</div>
              <p className="mt-5 border-t border-zinc-100 pt-4 text-[11px] text-zinc-500">Livraison disponible, produit neuf ou déclassé selon état.</p>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 z-20" style={{opacity:opacity/100}}>
            {hotspots.map(h=>{const x=device==='mobile'?h.mx:h.x,y=device==='mobile'?h.my:h.y;const size=mode==='density'?Math.round(92+76*h.clicks/Math.max(1,hotspots[0].clicks)):28;return <button key={h.index} type="button" title={h.label+' · '+nf(h.clicks)+' clics fictifs'} onClick={()=>setHighlight(h.index)} className="absolute flex items-center justify-center rounded-full p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" style={{left:x+'%',top:y+'%',transform:'translate(-50%,-50%)',width:size,height:size,pointerEvents:'auto'}}>{mode==='density'?<span className="h-full w-full rounded-full" style={{background:'radial-gradient(circle, rgb(var(--accent) / .58) 0%, rgb(var(--accent) / .28) 30%, rgb(var(--accent) / .09) 58%, transparent 73%)'}}/>:<span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-accent text-[10px] font-bold text-accent-fg shadow-lg">{h.index+1}</span>}</button>;})}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-ink-4"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-accent opacity-25"/><i className="h-2 w-2 rounded-full bg-accent opacity-60"/><i className="h-2 w-2 rounded-full bg-accent"/>Faible → forte concentration</span><span>Clique sur une zone pour afficher ses clics</span></div>
      </div>
      {highlight!==null&&<div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-[12px]"><span><strong>{hotAreas[highlight].label}</strong> · {nf(hotspots.find(h=>h.index===highlight)?.clicks??0)} clics simulés</span><button onClick={()=>setHighlight(null)} aria-label="Fermer le détail"><UiIcon name="x" size={16}/></button></div>}
    </Panel>
    <div className="grid gap-3 sm:grid-cols-3"><MetricTile label="Clics sur la fiche" value={nf(total)} caption={'Interactions fictives · '+days+' j'} icon="eye" number="08"/><MetricTile label="Vues de la fiche" value={nf(Math.round(p.views*factor))} caption="Consultations fictives" icon="users" number="09"/><MetricTile label="Clics par vue" value={(total/(p.views*factor)).toFixed(2).replace('.',',')} caption="Rapport simulé" icon="layers" number="10"/></div>
    <Panel title="Les éléments les plus cliqués" desc="Clics et parts des interactions par zone sur la fiche">
      {hotspots.map((h,i)=><button key={h.index} type="button" onClick={()=>setHighlight(h.index)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-well"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[11px] font-semibold text-accent">{String(i+1).padStart(2,'0')}</span><span className="min-w-0 flex-1 text-[12px] font-medium">{h.label}</span><span className="text-[12px] font-semibold tabular-nums">{nf(h.clicks)} clics</span><span className="w-12 text-right text-[11px] text-ink-4">{Math.round(h.clicks/total*100)} %</span></button>)}
    </Panel>
  </div>;
}
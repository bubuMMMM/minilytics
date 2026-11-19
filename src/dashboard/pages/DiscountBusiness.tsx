import { useState, type ReactNode } from 'react';
import { UiIcon, type UiIconName } from '../components/UiIcon';

type Days = 7 | 30 | 90;
export type DemoProduct = {name:string;ref:string;id:string;category:string;condition:string;views:number;orders:number;revenue:number;price:number;oldPrice:number;stock:number;change:number};
const nf=(n:number)=>new Intl.NumberFormat('fr-FR').format(n);
const cat=[{name:'Chauffage & climatisation',share:35},{name:'Chauffe-eau',share:22},{name:'Bricolage & outillage',share:19},{name:'Salle de bain',share:14},{name:'Matériel professionnel',share:7},{name:'Autres',share:3}];
export const demoInventory={all:2684,neuf:1882,declasse:802,low:47,aging:112,newArrivals:63};
function IconBox({icon,kind='blue'}:{icon:UiIconName;kind?:'blue'|'amber'|'rose'|'green'}) {
  const colors={blue:'bg-accent-soft text-accent',amber:'bg-warning-soft text-warning',rose:'bg-[#fceaf0] text-[#981a49] dark:bg-[#321922] dark:text-[#f7a6c0]',green:'bg-success-soft text-success'};
  return <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl '+colors[kind]}><UiIcon name={icon} size={18}/></span>;
}
function Panel({title,subtitle,children,action}:{title:string;subtitle:string;children:ReactNode;action?:ReactNode}){
  return <section className="ml-bento min-w-0 overflow-hidden p-5 sm:p-6"><div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold tracking-[-.03em] text-ink">{title}</h2><p className="mt-1 text-[12px] text-ink-4">{subtitle}</p></div>{action}</div>{children}</section>;
}
export function CommerceHero({onStock,onCatalog}:{onStock:()=>void;onCatalog:()=>void}){
  return <div className="dq-hero relative mb-4 overflow-hidden p-5 sm:p-8">
    <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-accent/5 blur-[64px]"/>
    <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(285px,.75fr)]">
      <div>
        <div className="mb-4 flex items-center gap-2"><span className="rounded-full border border-line bg-well px-2.5 py-1 text-[10px] font-semibold tracking-[.09em] text-ink-3">CENTRE DE PILOTAGE</span><span className="h-1.5 w-1.5 rounded-full bg-success"/><span className="text-[11px] text-ink-4">Édition déstockage</span></div>
        <h2 className="max-w-[620px] text-[28px] font-normal leading-[1.14] tracking-[-.05em] text-ink sm:text-[36px]" style={{fontFamily:"var(--dq-serif)"}}>Savoir ce qui se vend. Repérer ce qui dort. <span className="dq-serif-emphasis text-accent">Agir au bon moment.</span></h2>
        <p className="mt-4 max-w-[540px] text-[13px] leading-[1.7] text-ink-3">Les données d’audience de Minilytics, reliées aux réalités d’un déstockeur : catalogue, états des produits, quantités et rotation des références.</p>
        <div className="mt-5 flex flex-wrap gap-2"><button onClick={onStock} className="dq-action dq-action-primary !min-h-10"><UiIcon name="layers" size={14}/>Voir les stocks <UiIcon name="arrow-right" size={13}/></button><button onClick={onCatalog} className="dq-action !min-h-10"><UiIcon name="grid" size={14}/>Fiches produits</button></div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[16px] border border-line bg-canvas p-4 shadow-[0_2px_12px_-10px_rgb(0_0_0_/_0.2)]"><IconBox icon="grid"/><div className="mt-4 dq-stat text-[27px] font-semibold leading-none tabular-nums text-ink">{nf(demoInventory.all)}</div><div className="mt-1.5 text-[11px] text-ink-4">Références en ligne</div></div>
        <div className="rounded-xl border border-line bg-canvas p-4"><IconBox icon="file-text" kind="rose"/><div className="mt-4 dq-stat text-[27px] font-semibold leading-none tabular-nums text-ink">{nf(demoInventory.declasse)}</div><div className="mt-1.5 text-[11px] text-ink-4">Neuf déclassé</div></div>
        <div className="rounded-xl border border-line bg-canvas p-4"><IconBox icon="bell" kind="amber"/><div className="mt-4 dq-stat text-[27px] font-semibold leading-none tabular-nums text-ink">{demoInventory.low}</div><div className="mt-1.5 text-[11px] text-ink-4">Stocks faibles</div></div>
        <div className="rounded-xl border border-line bg-canvas p-4"><IconBox icon="plus" kind="green"/><div className="mt-4 dq-stat text-[27px] font-semibold leading-none tabular-nums text-ink">+{demoInventory.newArrivals}</div><div className="mt-1.5 text-[11px] text-ink-4">Arrivages sur 7 j</div></div>
      </div>
    </div>
    <div className="relative mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[10px] text-ink-4"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent"/>Bleu : trafic & analyse</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-success"/>Vert : indicateur favorable</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-warning"/>Ambre : point à surveiller</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#981a49]"/>Bordeaux : neuf déclassé</span></div>
  </div>;
}
export function CommercePriorities({days,products,onProduct,onStock}:{days:Days;products:DemoProduct[];onProduct:(id:number)=>void;onStock:()=>void}){
  const target=products[4],factor=days/30;
  const signals=[
    {title:'Référence très consultée, peu vendue',detail:target.ref+' : '+nf(Math.round(target.views*factor))+' vues pour '+nf(Math.round(target.orders*factor))+' ventes en '+days+' jours.',icon:'eye' as UiIconName,kind:'blue' as const,cta:'Voir les clics',action:()=>onProduct(4)},
    {title:'Réapprovisionnement à surveiller',detail:products[3].ref+' : '+products[3].stock+' pièces simulées encore en stock.',icon:'bell' as UiIconName,kind:'amber' as const,cta:'Voir le stock',action:onStock},
    {title:'Rotation des invendus',detail:demoInventory.aging+' références sont illustrées comme dormantes depuis plus de 60 jours.',icon:'clock' as UiIconName,kind:'rose' as const,cta:'Prioriser',action:onStock},
  ];
  return <Panel title="Ce qui mérite ton attention" subtitle="Signaux métier pour décider quoi améliorer en priorité" action={<span className="rounded-full bg-warning-soft px-2.5 py-1 text-[10px] font-semibold text-warning">3 opportunités</span>}>
    <div className="grid gap-3 md:grid-cols-3">{signals.map(a=><button key={a.title} onClick={a.action} className="group flex flex-col items-start rounded-xl border border-line bg-canvas p-4 text-left transition-colors hover:border-accent/40 hover:bg-well"><IconBox icon={a.icon} kind={a.kind}/><h3 className="mt-4 text-[12px] font-semibold leading-snug text-ink">{a.title}</h3><p className="mt-2 min-h-[45px] text-[11px] leading-relaxed text-ink-3">{a.detail}</p><span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">{a.cta}<UiIcon name="arrow-right" size={13}/></span></button>)}</div>
  </Panel>;
}
export function CommerceCategories(){
  return <Panel title="Quels univers attirent les visiteurs ?" subtitle="Répartition illustrative des consultations produit, adaptée aux rayons de la boutique">
    <div className="grid gap-6 md:grid-cols-[.7fr_1.3fr] md:items-center"><div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full" style={{background:'conic-gradient(rgb(var(--accent)) 0% 35%, #93c5fd 35% 57%, #8aa6b2 57% 76%, #bac5d1 76% 90%, #d4d4d8 90% 97%, #e4e4e7 97% 100%)'}}><div className="flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full bg-surface"><span className="text-[23px] font-semibold text-ink">100 %</span><span className="text-[10px] text-ink-4">des fiches vues</span></div></div><div className="space-y-3.5">{cat.map((c,i)=><div key={c.name}><div className="mb-1 flex justify-between gap-2 text-[11px]"><span className="truncate text-ink-2">{c.name}</span><strong className="tabular-nums text-ink">{c.share} %</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full" style={{width:c.share*100/cat[0].share+'%',background:['rgb(var(--accent))','#93c5fd','#8aa6b2','#bac5d1','#d4d4d8','#e4e4e7'][i]}}/></div></div>)}</div></div>
  </Panel>;
}
export function StockManager({products,onProduct}:{products:DemoProduct[];onProduct:(id:number)=>void}){
  const [filter,setFilter]=useState<'all'|'neuf'|'declasse'|'low'>('all');
  const visible=products.map((p,index)=>({...p,index})).filter(p=>filter==='all'||(filter==='neuf'&&p.condition==='Neuf')||(filter==='declasse'&&p.condition==='Neuf déclassé')||(filter==='low'&&p.stock<=5));
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      {label:'Références en ligne',value:demoInventory.all,icon:'grid' as UiIconName,kind:'blue' as const},
      {label:'Neuf déclassé',value:demoInventory.declasse,icon:'file-text' as UiIconName,kind:'rose' as const},
      {label:'Stock faible',value:demoInventory.low,icon:'bell' as UiIconName,kind:'amber' as const},
      {label:'Nouveaux arrivages',value:demoInventory.newArrivals,icon:'plus' as UiIconName,kind:'green' as const}
    ].map(k=><div className="ml-bento p-5" key={k.label}><div className="flex items-center justify-between gap-2"><span className="text-[12px] text-ink-3">{k.label}</span><IconBox icon={k.icon} kind={k.kind}/></div><div className="mt-5 text-[28px] font-semibold tracking-tight text-ink">{nf(k.value)}</div><div className="mt-2 text-[11px] text-ink-4">Valeur fictive, maquette métier</div></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Répartition des états" subtitle="Séparer systématiquement NEUF et NEUF déclassé"><div className="flex h-3 overflow-hidden rounded-full"><div className="bg-accent" style={{width:demoInventory.neuf/demoInventory.all*100+'%'}}/><div className="flex-1 bg-[#981a49]"/></div><div className="mt-6 grid grid-cols-2 gap-3"><div><div className="flex items-center gap-2 text-[11px] text-ink-3"><i className="h-2 w-2 rounded-full bg-accent"/>NEUF</div><strong className="mt-1 block text-[28px] tracking-tight text-ink">{nf(demoInventory.neuf)}</strong></div><div><div className="flex items-center gap-2 text-[11px] text-ink-3"><i className="h-2 w-2 rounded-full bg-[#981a49]"/>NEUF DÉCLASSÉ</div><strong className="mt-1 block text-[28px] tracking-tight text-ink">{nf(demoInventory.declasse)}</strong></div></div></Panel>
      <Panel title="Le stock qui ne tourne pas" subtitle="Identifier les références immobiles pour accélérer le déstockage"><div className="flex items-center gap-4 rounded-xl bg-well p-4"><IconBox icon="clock" kind="amber"/><div><div className="text-[29px] font-semibold tracking-tight text-ink">{demoInventory.aging}</div><div className="text-[12px] text-ink-3">Références sans vente depuis 60 jours</div></div></div><p className="mt-5 text-[12px] leading-relaxed text-ink-3">À terme, ces informations pourront aider à cibler les baisses de prix et les annonces à rafraîchir. Aucune règle automatique de prix n’est activée.</p></Panel>
    </div>
    <Panel title="Surveiller les références" subtitle="Références du catalogue et quantités de démonstration" action={<div className="flex flex-wrap gap-1 rounded-lg border border-line p-1">{([{id:'all',name:'Tous'},{id:'neuf',name:'Neuf'},{id:'declasse',name:'Déclassé'},{id:'low',name:'Stock faible'}] as const).map(x=><button key={x.id} onClick={()=>setFilter(x.id)} className={'rounded-md px-2.5 py-1.5 text-[11px] font-semibold '+(filter===x.id?'bg-ink text-canvas':'text-ink-3 hover:bg-well')}>{x.name}</button>)}</div>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(p=><button key={p.id} onClick={()=>onProduct(p.index)} className="rounded-xl border border-line p-4 text-left hover:border-accent/50 hover:bg-well"><div className="text-[11px] font-medium text-ink-4">{p.ref} · {p.id}</div><div className="mt-1 min-h-[36px] text-[12px] font-semibold leading-snug text-ink">{p.name}</div><div className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="text-[22px] font-semibold tabular-nums text-ink">{p.stock}<span className="ml-1 text-[11px] font-normal text-ink-4">pièces</span></span><span className={'rounded-md px-2 py-1 text-[10px] font-semibold '+(p.stock<=5?'bg-warning-soft text-warning':'bg-success-soft text-success')}>{p.stock<=5?'Stock faible':'Disponible'}</span></div></button>)}</div>{!visible.length&&<p className="py-7 text-center text-[12px] text-ink-4">Aucune référence dans cette sélection.</p>}
    </Panel>
  </div>;
}

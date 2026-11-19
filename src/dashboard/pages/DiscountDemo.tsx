import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { LiveProductPages, ProductFiles, HeatmapDemo } from './DiscountDemoViews';
import { CommerceHero, CommercePriorities, CommerceCategories, StockManager } from './DiscountBusiness';
import { TrendChart } from '../components/TrendChart';
import { MetricTile } from '../components/StudioUI';
import { ThemeToggle } from '../components/ThemeToggle';
import { UiIcon, type UiIconName } from '../components/UiIcon';
import type { Activity } from '../components/LiveGlobe';

const LiveGlobe = lazy(() => import('../components/LiveGlobe').then((m) => ({ default: m.LiveGlobe })));
type View = 'overview' | 'live' | 'sales' | 'products' | 'stock' | 'heatmap' | 'acquisition' | 'ai' | 'geo';
type Days = 7 | 30 | 90;
const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const euros = (n: number) => new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const menu: { id:View; label:string; icon:UiIconName; group:string }[] = [
  { id:'overview', label:"Vue d'ensemble", icon:'bar-chart', group:'ANALYSE' },
  { id:'live', label:'En direct', icon:'activity', group:'ANALYSE' },
  { id:'sales', label:'Ventes & conversion', icon:'coins', group:'ANALYSE' },
  { id:'products', label:'Fiches produits', icon:'grid', group:'CATALOGUE' },
  { id:'stock', label:'Stocks & arrivages', icon:'layers', group:'CATALOGUE' },
  { id:'heatmap', label:'Carte des clics', icon:'mouse', group:'CATALOGUE' },
  { id:'acquisition', label:'Sources du trafic', icon:'compass', group:'ACQUISITION' },
  { id:'ai', label:'Visites issues des IA', icon:'bot', group:'ACQUISITION' },
  { id:'geo', label:'Géographie', icon:'globe', group:'ACQUISITION' },
];
const products = [
  {
    "name": "Radiateur Chaleur Douce 2000W THERMOR",
    "category": "Chauffage",
    "path": "/exemple/radiateur-thermor-2000w",
    "ref": "THERMOR",
    "id": "TH-2000",
    "condition": "Neuf déclassé",
    "views": 3231,
    "orders": 51,
    "price": 329,
    "oldPrice": 584,
    "stock": 12,
    "change": 24,
    "revenue": 16779
  },
  {
    "name": "Paroi de Douche AKW LevelBest 800x1900mm",
    "category": "Salle de bain",
    "path": "/exemple/paroi-douche-akw",
    "ref": "AKW",
    "id": "LB00216BK",
    "condition": "Neuf",
    "views": 2670,
    "orders": 44,
    "price": 99,
    "oldPrice": 477,
    "stock": 31,
    "change": 18,
    "revenue": 4356
  },
  {
    "name": "Chauffe-Eau ATLANTIC Chaufféo 50L",
    "category": "Chauffe-eau",
    "path": "/exemple/chauffe-eau-atlantic-50l",
    "ref": "ATLANTIC",
    "id": "AT-50L",
    "condition": "Neuf déclassé",
    "views": 2384,
    "orders": 39,
    "price": 199,
    "oldPrice": 439,
    "stock": 9,
    "change": 12,
    "revenue": 7761
  },
  {
    "name": "Ponceuse DEWALT XR 18V Brushless",
    "category": "Bricolage",
    "path": "/exemple/ponceuse-dewalt-xr",
    "ref": "DEWALT",
    "id": "DCW200",
    "condition": "Neuf",
    "views": 1996,
    "orders": 33,
    "price": 129,
    "oldPrice": 306,
    "stock": 3,
    "change": 9,
    "revenue": 4257
  },
  {
    "name": "Chaudière à Granulés MORVAN GM Easy 12",
    "category": "Chauffage",
    "path": "/exemple/chaudiere-morvan",
    "ref": "MORVAN",
    "id": "GM-EASY12",
    "condition": "Neuf",
    "views": 1853,
    "orders": 3,
    "price": 2849,
    "oldPrice": 11569,
    "stock": 4,
    "change": 7,
    "revenue": 8547
  }
];
const channels = [
  {name:'Recherche Google', share:47.8, count:10573, tone:'bg-ink'},
  {name:'Accès direct', share:22.4, count:4958, tone:'bg-ink-3'},
  {name:'ChatGPT & assistants IA', share:9.6, count:2119, tone:'bg-ink-3'},
  {name:'Leboncoin', share:8.5, count:1878, tone:'bg-ink-3'},
  {name:'Réseaux sociaux', share:7.4, count:1641, tone:'bg-ink-3'},
  {name:'Autres', share:4.3, count:955, tone:'bg-ink-3'},
];
const activity: Activity = {
  online: 58,
  updatedAt: 1795100000000,
  activeWindowMinutes: 5,
  recentWindowMinutes: 30,
  countries: [
    {country:'FR',visitors:32,lastSeenAt:1795100000000},
    {country:'BE',visitors:3,lastSeenAt:1795099970000},
    {country:'CH',visitors:2,lastSeenAt:1795099940000},
    {country:'ES',visitors:1,lastSeenAt:1795099900000},
  ],
  recentCountries: [
    {country:'FR',visitors:117,lastSeenAt:1795100000000},
    {country:'BE',visitors:13,lastSeenAt:1795099970000},
    {country:'CH',visitors:9,lastSeenAt:1795099940000},
    {country:'ES',visitors:6,lastSeenAt:1795099900000},
  ],
};
const stats: Record<Days,{visitors:number;views:number;orders:number;revenue:number;previous:number}> = {
  7: {visitors:4852,views:13110,orders:183,revenue:19840,previous:16340},
  30:{visitors:22184,views:62140,orders:785,revenue:83970,previous:71160},
  90:{visitors:66492,views:188740,orders:2424,revenue:262490,previous:224160},
};
const flag: Record<string,string>={FR:'🇫🇷',BE:'🇧🇪',CH:'🇨🇭',ES:'🇪🇸',DE:'🇩🇪',IT:'🇮🇹'};
function Brand() {
  return <div className="flex items-center gap-2.5" translate="no">
    <span className="grid h-9 w-9 shrink-0 grid-cols-2 grid-rows-2 gap-[3px] rounded-xl border border-line bg-surface p-[6px]"><i className="rounded-[2px] bg-[#76ba12]"/><i className="rounded-[2px] bg-[#f16812]"/><i className="rounded-[2px] bg-[#9e1644]"/><i className="rounded-[2px] bg-[#48bde2]"/></span>
    <span className="min-w-0 leading-tight"><span className="block truncate text-[13px] font-bold tracking-[-.025em] text-ink">Discount & Qualité</span><span className="block text-[10px] font-medium tracking-[.14em] text-ink-4 uppercase">PILOTAGE · DÉMO</span></span>
  </div>;
}
function Section({title,desc,children,className=''}:{title:string;desc?:string;children:React.ReactNode;className?:string}) {
  return <section className={'ml-bento min-w-0 p-5 sm:p-6 '+className}>
    <div className="mb-5"><h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>{desc && <p className="mt-1 text-[12px] text-ink-4">{desc}</p>}</div>
    {children}
  </section>;
}
function HorizontalBars({items}:{items:{label:string;num:number;detail?:string}[]}) {
  const high=Math.max(1,...items.map(x=>x.num));
  return <div className="space-y-4">{items.map(x=><div key={x.label}>
    <div className="mb-1.5 flex items-center gap-3 text-[12px]"><span className="min-w-0 flex-1 truncate text-ink-2">{x.label}</span><span className="tnum font-semibold text-ink">{x.detail??nf(x.num)}</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full bg-ink transition-all duration-300" style={{width:Math.max(3,x.num/high*100)+'%'}}/></div>
  </div>)}</div>;
}
export function DiscountDemo() {
  const [view,setView]=useState<View>('overview');
  const [days,setDays]=useState<Days>(30);
  const [tick,setTick]=useState(0);
  const [sidebar,setSidebar]=useState(false);
  const [heatProduct,setHeatProduct]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>setTick(n=>n+1),15000);return ()=>window.clearInterval(timer);},[]);
  const totals=stats[days];
  const k=days/30;
  const buckets=useMemo(()=>Array.from({length:days},(_,i)=>new Date(Date.UTC(2026,10,19-days+1+i)).toISOString().slice(0,10)),[days]);
  const visitors=useMemo(()=>{const w=buckets.map((_,i)=>1+.22*Math.sin(i*.65)+.16*Math.cos(i*.4)+.08*i/days);const sum=w.reduce((n,x)=>n+x,0);const v=w.slice(0,-1).map(x=>Math.round(x*totals.visitors/sum));v.push(totals.visitors-v.reduce((n,x)=>n+x,0));return v;},[buckets,days,totals.visitors]);
  const orders=useMemo(()=>{const sum=visitors.reduce((n,x)=>n+x,0);const v=visitors.slice(0,-1).map(x=>Math.round(x*totals.orders/sum));v.push(totals.orders-v.reduce((n,x)=>n+x,0));return v;},[visitors,totals.orders]);
  const show=(v:View)=>view==='overview'||view===v;
  const selected=menu.find(x=>x.id===view);
  const online=58+tick%4;
  const act={...activity, online};
  const navigate=(target:View)=>{setView(target);setSidebar(false);window.scrollTo({top:0,behavior:'smooth'});};
  const inspect=(index:number)=>{setHeatProduct(index);navigate('heatmap');};
  const nav=<div className="space-y-4">
    {['ANALYSE','CATALOGUE','ACQUISITION'].map(group=><div key={group}><div className="mb-2 px-3 text-[10px] font-semibold tracking-[.13em] text-ink-4">{group}</div><div className="space-y-1">{menu.filter(m=>m.group===group).map(item=><button key={item.id} type="button" onClick={()=>navigate(item.id)} className={'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] transition-colors '+(view===item.id?'bg-accent-soft font-semibold text-accent':'text-ink-3 hover:bg-well hover:text-ink')}><UiIcon name={item.icon} size={16}/><span>{item.label}</span>{view===item.id&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent"/>}</button>)}</div></div>)}
  </div>;
  return <div className="min-h-screen bg-canvas text-ink">
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[240px] flex-col border-r border-line bg-canvas px-3 lg:flex">
      <div className="flex h-[74px] items-center px-3"><Brand/></div>
      <div className="mb-5 rounded-xl border border-line bg-surface px-3 py-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success"/><span className="text-[12px] font-semibold">discountetqualite.fr</span></div><div className="mt-1 pl-4 text-[11px] text-ink-4">E-commerce · PrestaShop</div></div>
      <nav className="flex-1 overflow-y-auto">{nav}</nav>
      <div className="mb-4 rounded-xl border border-line bg-well p-3"><div className="flex items-center gap-2 text-[11px] font-semibold"><UiIcon name="shield" size={14}/> Mode démonstration</div><p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">Données fictives. Aucune connexion au catalogue, aux commandes ou au trafic réel.</p></div>
      <div className="border-t border-line px-2 py-3 text-[10px] text-ink-4">Minilytics · Édition déstockage</div>
    </aside>
    {sidebar && <div className="fixed inset-0 z-[80] bg-black/40 lg:hidden" onClick={()=>setSidebar(false)}><div onClick={e=>e.stopPropagation()} className="h-full w-[275px] overflow-y-auto bg-canvas p-4"><div className="mb-8 flex justify-between"><Brand/><button aria-label="Fermer le menu" onClick={()=>setSidebar(false)}><UiIcon name="x" size={20}/></button></div>{nav}</div></div>}
    <div className="lg:pl-[240px]">
      <header className="sticky top-0 z-40 flex h-[66px] items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
        <div className="flex min-w-0 items-center gap-3"><button onClick={()=>setSidebar(true)} className="lg:hidden" aria-label="Ouvrir le menu"><UiIcon name="menu" size={20}/></button><div className="lg:hidden"><Brand/></div><div className="hidden items-center gap-2 text-[12px] text-ink-4 lg:flex"><span>Analytics</span><UiIcon name="chevron-right" size={13}/><span className="font-medium text-ink">{selected?.label}</span></div></div>
        <div className="flex items-center gap-3"><span className="hidden items-center gap-2 text-[11px] text-ink-3 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-accent"/>Simulation active</span><ThemeToggle/><span className="rounded-md border border-line px-2 py-1 text-[10px] font-semibold uppercase tracking-[.08em]">Démo</span></div>
      </header>
      <main className="mx-auto max-w-[1480px] px-4 pb-20 pt-8 sm:px-7 lg:px-9">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.14em] text-ink-4">PILOTAGE DU DÉSTOCKAGE / DISCOUNT & QUALITÉ <span className="text-accent">✦</span></div><h1 className="text-[27px] font-semibold leading-tight tracking-[-.04em] sm:text-[33px]">{selected?.label}</h1><p className="mt-2 text-[13px] text-ink-3">Trafic, ventes, fiches produits, stocks et priorités : les données utiles pour décider.</p></div>
          <div className="flex items-center gap-2"><div className="inline-flex rounded-lg border border-line bg-surface p-1">{([7,30,90] as Days[]).map(d=><button key={d} onClick={()=>setDays(d)} aria-pressed={days===d} className={'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors '+(days===d?'bg-ink text-canvas':'text-ink-3 hover:bg-well')}>{d} j</button>)}</div><button onClick={()=>setTick(x=>x+1)} title="Actualiser la simulation" aria-label="Actualiser la simulation" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-well"><UiIcon name="refresh" size={16}/></button></div>
        </div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-well px-4 py-2.5 text-[12px] text-ink-3"><span><strong>Prototype · données simulées</strong> — les chiffres illustrent le potentiel, ils ne proviennent pas de Discount & Qualité.</span><span className="shrink-0 font-mono">V3 / 19.11.2026</span></div>
        {view==='overview'&&<CommerceHero onStock={()=>navigate('stock')} onCatalog={()=>navigate('products')}/>}
        {view==='live'&&<LiveProductPages days={days} tick={tick} onInspect={inspect}/>}
        {show('overview') || show('sales') ? <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricTile focus label="CA e-commerce" icon="coins" number="01" value={euros(totals.revenue)} caption={'Estimé · '+days+' jours'} current={totals.revenue} previous={totals.previous}/>
          <MetricTile label="Visiteurs uniques" icon="users" number="02" value={nf(totals.visitors)} caption="Audience boutique" current={totals.visitors} previous={Math.round(totals.visitors*.88)}/>
          <MetricTile label="Commandes" icon="layers" number="03" value={nf(totals.orders)} caption="Transactions simulées" current={totals.orders} previous={Math.round(totals.orders*.87)}/>
          <MetricTile label="Conversion boutique" icon="target" number="04" value={(totals.orders/totals.visitors*100).toFixed(2).replace('.',',')+' %'} caption="Visiteurs vers commandes" current={totals.orders/totals.visitors} previous={.031}/>
        </div> : null}
        {view==='overview'&&<div className="my-4"><CommercePriorities days={days} products={products} onProduct={inspect} onStock={()=>navigate('stock')}/></div>}
        {show('overview') || show('sales') ? <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,.85fr)]">
          <Section title="Évolution des performances" desc={'Visiteurs et commandes · '+days+' derniers jours (simulation)'}>
            <div className="mb-5 flex gap-5 text-[11px] text-ink-3"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-ink"/>Visiteurs</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-accent"/>Commandes</span></div>
            <TrendChart buckets={buckets} granularity="day" height={252} variant={days===90?'line':'auto'} series={[{key:'visits',label:'Visiteurs',color:'rgb(var(--ink))',values:visitors},{key:'orders',label:'Commandes',color:'rgb(var(--accent))',values:orders,axis:'right'}]}/>
          </Section>
          <Section title="En ce moment" desc="Activité de démonstration · cinq dernières minutes">
            <div className="flex items-end gap-3 border-b border-line pb-5"><div className="text-[47px] font-semibold leading-none tracking-[-.06em] tabular-nums">{online}</div><div className="pb-1 text-[12px] text-ink-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent"/>visiteurs simulés</div></div>
            <div className="mt-5 grid grid-cols-2 gap-5"><div><div className="text-[11px] text-ink-4">Panier moyen</div><div className="mt-1 text-xl font-semibold">{euros(totals.revenue/totals.orders)}</div></div><div><div className="text-[11px] text-ink-4">Pages vues</div><div className="mt-1 text-xl font-semibold">{nf(totals.views)}</div></div><div><div className="text-[11px] text-ink-4">Ajouts panier</div><div className="mt-1 text-xl font-semibold">{nf(Math.round(totals.orders*2.8))}</div></div><div><div className="text-[11px] text-ink-4">Checkout commencé</div><div className="mt-1 text-xl font-semibold">{nf(Math.round(totals.orders*1.42))}</div></div></div>
            <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[12px]"><span className="text-ink-3">Revenu par visiteur</span><strong>{euros(totals.revenue/totals.visitors)}</strong></div>
          </Section>
        </div> : null}
        {show('sales') && <div className="mb-4 grid gap-4 md:grid-cols-3">{[{title:'Vue produit → panier',num:'11,8 %',sub:'Intention d’achat'},{title:'Panier → checkout',num:'64,2 %',sub:'Progression tunnel'},{title:'Checkout → achat',num:'71,3 %',sub:'Commandes confirmées'}].map(x=><div key={x.title} className="ml-bento p-6"><div className="text-[12px] text-ink-3">{x.title}</div><div className="mt-3 text-3xl font-semibold tracking-tight">{x.num}</div><div className="mt-2 text-xs text-ink-4">{x.sub} · Simulation</div></div>)}</div>}
        {view==='overview'&&<LiveProductPages days={days} tick={tick} onInspect={inspect} compact/>}
        {show('overview') || show('geo') ? <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,1fr)]">
          <Section title="Origine géographique des visiteurs" desc="Globe interactif, pays et activité simulés" className="overflow-hidden">
            <Suspense fallback={<div className="flex h-[300px] items-center justify-center text-sm text-ink-4">Chargement du globe…</div>}><LiveGlobe example={act} exampleLabel hideIntro hideMapLink compact /></Suspense>
          </Section>
          <Section title="Répartition géographique" desc="Provenance estimée des visiteurs">
            <HorizontalBars items={[{label:'🇫🇷  France',num:84.3,detail:'84,3 %'},{label:'🇧🇪  Belgique',num:7.1,detail:'7,1 %'},{label:'🇨🇭  Suisse',num:3.5,detail:'3,5 %'},{label:'🇪🇸  Espagne',num:2.3,detail:'2,3 %'},{label:'🇩🇪  Allemagne',num:1.7,detail:'1,7 %'},{label:'🌍  Autres',num:1.1,detail:'1,1 %'}]}/>
            <div className="mt-7 rounded-xl bg-well p-3 text-[12px] text-ink-3">Le trafic national domine. Les opportunités transfrontalières peuvent être explorées dans la prochaine version.</div>
          </Section>
        </div> : null}
        {show('overview') || show('products') || show('acquisition') ? <div className="mb-4 grid gap-4 xl:grid-cols-2">
          {(show('overview')||show('acquisition'))&&<Section title="Canaux d'acquisition" desc="Les sources qui génèrent des visites"><HorizontalBars items={channels.map(x=>({label:x.name,num:x.share,detail:x.share.toFixed(1).replace('.',',')+' %'}))}/></Section>}
          {(show('overview')||show('products'))&&<Section title="Fiches les plus consultées" desc="Références inspirées du catalogue · données simulées"><div className="space-y-1">{products.map((p,i)=><div key={p.name} className="flex items-center gap-3 border-b border-line/70 py-3 last:border-0"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-well font-mono text-[11px] text-ink-3">{String(i+1).padStart(2,'0')}</span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium">{p.name}</span><span className="text-[11px] text-ink-4">{p.ref}</span></span><span className="text-right"><span className="block text-[12px] font-semibold tabular-nums">{nf(p.views)}</span><span className="text-[11px] text-ink-4">vues</span></span></div>)}</div></Section>}
        </div> : null}
        {view==='overview'&&<div className="my-4"><CommerceCategories/></div>}
        {view==='stock'&&<StockManager products={products} onProduct={inspect}/>}
        {view==='products'&&<ProductFiles days={days} onInspect={inspect}/>}
        {view==='heatmap'&&<HeatmapDemo days={days} productIndex={heatProduct} onSelectProduct={setHeatProduct}/>}
        {view==='acquisition'&&<div className="grid gap-4 md:grid-cols-2"><Section title="Appareils" desc="Visites par type de terminal"><HorizontalBars items={[{label:'Mobile',num:73,detail:'73 %'},{label:'Ordinateur',num:23,detail:'23 %'},{label:'Tablette',num:4,detail:'4 %'}]}/></Section><Section title="Pages d'entrée" desc="Portes d’accès au catalogue"><HorizontalBars items={[{label:'/',num:7820},{label:'/salle-de-bain',num:4510},{label:'/chauffage',num:3210},{label:'/destockage',num:2870},{label:'/nouveautes',num:1250}]}/></Section></div>}
        {show('ai')&&<div className="grid gap-4 lg:grid-cols-3">
          <div className="ml-bento p-6"><div className="flex items-center justify-between"><span className="text-[12px] text-ink-3">Visiteurs venus des IA</span><UiIcon name="sparkles" size={16}/></div><div className="mt-3 text-3xl font-semibold tracking-tight">{nf(Math.round(2119*k))}</div><div className="mt-2 text-[12px] text-success">+28 % vs période précédente</div></div>
          <div className="ml-bento p-6"><div className="flex items-center justify-between"><span className="text-[12px] text-ink-3">Citations de produits</span><UiIcon name="link" size={16}/></div><div className="mt-3 text-3xl font-semibold tracking-tight">{nf(Math.round(184*k))}</div><div className="mt-2 text-[12px] text-ink-4">Exemple de suivi des mentions IA</div></div>
          <div className="ml-bento p-6"><div className="flex items-center justify-between"><span className="text-[12px] text-ink-3">Bots explorateurs</span><UiIcon name="bot" size={16}/></div><div className="mt-3 text-3xl font-semibold tracking-tight">{nf(Math.round(1209*k))}</div><div className="mt-2 text-[12px] text-ink-4">Exemple de requêtes des robots</div></div>
          <Section title="Assistants qui amènent du trafic" desc="Visites attribuées aux référents IA"><HorizontalBars items={[{label:'ChatGPT',num:69,detail:'69 %'},{label:'Perplexity',num:18,detail:'18 %'},{label:'Claude',num:9,detail:'9 %'},{label:'Gemini',num:4,detail:'4 %'}]}/></Section>
          <Section title="Exploration par robots" desc="Exemples de passages de crawlers"><HorizontalBars items={[{label:'GPTBot',num:560},{label:'ClaudeBot',num:322},{label:'PerplexityBot',num:195},{label:'Google-Extended',num:132}]}/></Section>
        </div>}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[11px] text-ink-4"><span>Discount & Qualité Insights · prototype indépendant basé sur Minilytics</span><span>Sans suivi réel, sans accès aux données commerciales · {days} jours</span></footer>
      </main>
    </div>
  </div>;
}

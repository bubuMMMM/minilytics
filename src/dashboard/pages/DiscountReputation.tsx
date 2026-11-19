import { useMemo, useState, type ReactNode } from 'react';
import { UiIcon, type UiIconName } from '../components/UiIcon';

type Days = 7 | 30 | 90;
type Network = 'google'|'youtube'|'web'|'x'|'reddit'|'instagram'|'tiktok'|'linkedin';
type Mood = 'positive'|'negative'|'neutral'|'mixed';
type BrandMention = {
  id:string; platform:Network; author:string; title:string; content:string;
  date:string; mood:Mood; category:string; owned:boolean; phrase:string; priority:'haute'|'normale'|'faible';
};
const fmt=(n:number)=>new Intl.NumberFormat('fr-FR').format(n);
const platformNames:Record<Network,string>={google:'Google',youtube:'YouTube',web:'Presse & web',x:'X',reddit:'Reddit',instagram:'Instagram',tiktok:'TikTok',linkedin:'LinkedIn'};
const platformIcon:Record<Network,UiIconName>={google:'star',youtube:'play',web:'globe',x:'share',reddit:'message',instagram:'heart',tiktok:'play',linkedin:'users'};
const moodColors:Record<Mood,string>={positive:'bg-success-soft text-success',negative:'bg-danger-soft text-danger',neutral:'bg-well text-ink-3',mixed:'bg-warning-soft text-warning'};
const moodText:Record<Mood,string>={positive:'Positif',negative:'Négatif',neutral:'Neutre',mixed:'Mixte'};
const searchTerms=['"Discount & Qualité"','"Discount et Qualité"','"discountetqualite.fr"','"discountetqualite"','"Discount Qualité" "Le Pellerin"','"discountetqualite" avis'];
const items:BrandMention[]=[
  {id:'s1',platform:'google',author:'Exemple · avis client',title:'Satisfaction après la réception d’un chauffe-eau',content:'La commande a été livrée dans le délai indiqué. Le produit est conforme à la description et le prix était intéressant.',date:'Aujourd’hui',mood:'positive',category:'Livraison',owned:false,phrase:'Discount & Qualité',priority:'faible'},
  {id:'s2',platform:'x',author:'Exemple · publication publique',title:'Discussion sur le déstockage d’équipements',content:'Quelqu’un a déjà acheté du matériel de chauffage chez Discount & Qualité ? Je cherche des retours sur les modèles déclassés.',date:'Aujourd’hui',mood:'neutral',category:'Question avant achat',owned:false,phrase:'Discount & Qualité',priority:'normale'},
  {id:'s3',platform:'web',author:'Exemple · article de blog',title:'Où trouver des équipements de salle de bain à prix réduit ?',content:'Présentation illustrative des enseignes de déstockage, dont Discount et Qualité, dans un comparatif de prix.',date:'Hier',mood:'neutral',category:'Notoriété',owned:false,phrase:'Discount et Qualité',priority:'faible'},
  {id:'s4',platform:'reddit',author:'Exemple · discussion communautaire',title:'Question sur un produit neuf déclassé',content:'Les photos du défaut esthétique sont-elles suffisamment précises ? J’aimerais savoir à quoi m’attendre avant de commander.',date:'Hier',mood:'mixed',category:'État produit',owned:false,phrase:'discountetqualite.fr',priority:'normale'},
  {id:'s5',platform:'google',author:'Exemple · avis client',title:'Une livraison à suivre de près',content:'L’état du colis à la réception n’était pas celui attendu. J’attends un retour du service client sur ma demande.',date:'Il y a 2 j',mood:'negative',category:'Service client',owned:false,phrase:'Discount & Qualité',priority:'haute'},
  {id:'s6',platform:'youtube',author:'Exemple · vidéo produit',title:'Présentation d’un radiateur trouvé en déstockage',content:'Un créateur présente l’équipement commandé et les points à vérifier sur les références d’occasion ou déclassées.',date:'Il y a 3 j',mood:'positive',category:'Produit',owned:false,phrase:'discountetqualite',priority:'normale'},
  {id:'s7',platform:'instagram',author:'Exemple · publication officielle',title:'Nouvel arrivage d’équipements de chauffage',content:'Annonce illustrant la mise en avant des nouveaux arrivages de la boutique et des quantités disponibles.',date:'Il y a 4 j',mood:'positive',category:'Communication',owned:true,phrase:'Discount & Qualité',priority:'faible'},
  {id:'s8',platform:'tiktok',author:'Exemple · vidéo courte',title:'Comparatif de prix sur une ponceuse',content:'Vidéo fictive comparant le prix d’un outil à son tarif public habituel et mentionnant discountetqualite.fr.',date:'Il y a 5 j',mood:'positive',category:'Prix',owned:false,phrase:'discountetqualite.fr',priority:'normale'},
  {id:'s9',platform:'linkedin',author:'Exemple · publication entreprise',title:'Une nouvelle étape pour l’activité de déstockage',content:'Illustration d’une annonce institutionnelle à propos de l’organisation du dépôt et de la mise en ligne des produits.',date:'Il y a 6 j',mood:'neutral',category:'Entreprise',owned:true,phrase:'Discount et Qualité',priority:'faible'},
  {id:'s10',platform:'web',author:'Exemple · forum',title:'Besoin d’informations avant un achat',content:'Un internaute s’interroge sur la différence entre produit neuf et neuf déclassé sur la boutique.',date:'Il y a 7 j',mood:'mixed',category:'État produit',owned:false,phrase:'Discount & Qualité',priority:'normale'},
];
const ranges:Record<Days,{total:number,positive:number,neutral:number,negative:number,mixed:number,owned:number}> ={
  7:{total:32,positive:15,neutral:8,negative:5,mixed:4,owned:6},
  30:{total:137,positive:71,neutral:37,negative:19,mixed:10,owned:24},
  90:{total:401,positive:214,neutral:104,negative:55,mixed:28,owned:73},
};
const networkRatios:Record<Network,number>={google:27,youtube:17,web:21,x:13,reddit:8,instagram:7,tiktok:4,linkedin:3};
const queryUrl=(network:string,phrase:string)=>{
 const q=encodeURIComponent(phrase);
 if(network==='google')return 'https://www.google.com/search?q='+q;
 if(network==='news')return 'https://www.google.com/search?tbm=nws&q='+q;
 if(network==='youtube')return 'https://www.youtube.com/results?search_query='+q;
 if(network==='x')return 'https://x.com/search?q='+q+'&src=typed_query&f=live';
 if(network==='reddit')return 'https://www.reddit.com/search/?q='+q;
 if(network==='linkedin')return 'https://www.linkedin.com/search/results/content/?keywords='+q;
 if(network==='tiktok')return 'https://www.tiktok.com/search?q='+q;
 if(network==='bing')return 'https://www.bing.com/search?q='+q;
 return 'https://www.google.com/search?q='+q;
};
function Card({title,caption,children,action}:{title:string;caption?:string;children:ReactNode;action?:ReactNode}){
 return <section className="ml-bento min-w-0 overflow-hidden p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold tracking-[-.025em] text-ink">{title}</h2>{caption&&<p className="mt-1 text-[12px] text-ink-4">{caption}</p>}</div>{action}</div>{children}</section>;
}
function Chip({label,tone='neutral'}:{label:string;tone?:'neutral'|'blue'|'green'|'amber'|'red'}){
 const tones={neutral:'bg-well text-ink-3',blue:'bg-accent-soft text-accent',green:'bg-success-soft text-success',amber:'bg-warning-soft text-warning',red:'bg-danger-soft text-danger'};
 return <span className={'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold '+tones[tone]}>{label}</span>;
}
function MiniBar({name,percent,count,variant='blue'}:{name:string;percent:number;count:number;variant?:'blue'|'green'|'red'}){
 const color=variant==='red'?'bg-danger':variant==='green'?'bg-success':'bg-accent';
 return <div><div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]"><span className="truncate text-ink-2">{name}</span><span className="shrink-0 font-semibold tabular-nums text-ink">{fmt(count)} <span className="font-normal text-ink-4">· {percent} %</span></span></div><div className="h-1.5 overflow-hidden rounded-full bg-well"><div className={'h-full rounded-full '+color} style={{width:percent+'%'}}/></div></div>;
}
export function ReputationTeaser({days,onOpen}:{days:Days;onOpen:()=>void}){
 return <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
  <div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><UiIcon name="megaphone" size={21}/></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold tracking-tight text-ink">Ce qu’Internet dit de Discount & Qualité</h2><Chip label="Veilleo · aperçu" tone="blue"/></div><p className="mt-1.5 max-w-[650px] text-[12px] leading-relaxed text-ink-3">Un espace pour centraliser les avis, forums, articles, vidéos et réseaux sociaux. Aperçu interactif en {days} jours, sans suivi réel activé.</p></div></div>
  <button onClick={onOpen} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-3.5 text-[12px] font-semibold text-canvas hover:opacity-90">Explorer la réputation <UiIcon name="arrow-right" size={15}/></button>
 </div>;
}
const platforms:Network[]=['google','youtube','web','x','reddit','instagram','tiktok','linkedin'];
export function DiscountReputation({days}:{days:Days}){
 const [tab,setTab]=useState<'overview'|'mentions'|'sources'|'keywords'|'alerts'>('overview');
 const [network,setNetwork]=useState<'all'|Network>('all');
 const [mood,setMood]=useState<'all'|Mood>('all');
 const [query,setQuery]=useState('');
 const [identity,setIdentity]=useState<'all'|'earned'|'owned'>('all');
 const [selected,setSelected]=useState<string|null>(null);
 const [saved,setSaved]=useState<string[]>([]);
 const [watchwords,setWatchwords]=useState<string[]>(searchTerms.slice(0,4));
 const [newWord,setNewWord]=useState('');
 const [activeTerm,setActiveTerm]=useState(searchTerms[0]);
 const [rules,setRules]=useState({negative:true,brand:true,competitor:false,missing:false});
 const [onlyHigh,setOnlyHigh]=useState(false);
 const r=ranges[days];
 const distribution=platforms.map((p,i)=>({platform:p,share:networkRatios[p],count:i===platforms.length-1?r.total-platforms.slice(0,-1).reduce((n,q)=>n+Math.round(r.total*networkRatios[q]/100),0):Math.round(r.total*networkRatios[p]/100)}));
 const filtered=useMemo(()=>items.filter(m=>(network==='all'||m.platform===network)&&(mood==='all'||m.mood===mood)&&(identity==='all'||(identity==='owned'?m.owned:!m.owned))&&(!onlyHigh||m.priority==='haute')&&(m.title+' '+m.author+' '+m.content+' '+m.phrase+' '+m.category).toLowerCase().includes(query.toLowerCase())),[network,mood,identity,query,onlyHigh]);
 const chosen=items.find(m=>m.id===selected);
 const samples=Array.from({length:14},(_,i)=>4+Math.round(3*Math.sin(i*1.5)+2*Math.cos(i*.7))+i%4);
 const graphMax=Math.max(1,...samples);
 const external=[{id:'google',name:'Google',desc:'Résultats publics du moteur de recherche',icon:'search' as UiIconName},{id:'news',name:'Google Actualités',desc:'Articles de presse et publications indexées',icon:'globe' as UiIconName},{id:'x',name:'X',desc:'Messages accessibles dans la recherche publique',icon:'share' as UiIconName},{id:'youtube',name:'YouTube',desc:'Vidéos et contenus référencés',icon:'play' as UiIconName},{id:'reddit',name:'Reddit',desc:'Discussions et retours communautaires',icon:'message' as UiIconName},{id:'linkedin',name:'LinkedIn',desc:'Publications professionnelles accessibles',icon:'users' as UiIconName},{id:'tiktok',name:'TikTok',desc:'Vidéos publiques proposées par la plateforme',icon:'play' as UiIconName},{id:'bing',name:'Bing',desc:'Autre moteur pour étendre la recherche',icon:'search' as UiIconName}];
 const changeRule=(key:keyof typeof rules)=>setRules(s=>({...s,[key]:!s[key]}));
 return <div className="space-y-4">
  <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-7">
   <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-accent/10 blur-[76px]"/>
   <div className="relative flex flex-wrap items-start justify-between gap-5">
    <div className="max-w-[710px]"><div className="mb-3 flex items-center gap-2"><Chip label="VEILLE DE MARQUE" tone="blue"/><Chip label="Basé sur Veilleo"/><Chip label="Frontend uniquement"/></div>
     <h2 className="text-[23px] font-semibold leading-[1.12] tracking-[-.045em] text-ink sm:text-[32px]">Ta réputation se construit <span className="text-accent">aussi hors de ta boutique.</span></h2>
     <p className="mt-3 text-[13px] leading-relaxed text-ink-3">Centralise les conversations autour de Discount & Qualité, repère les sujets sensibles et retrouve directement les sources publiques. Sans installation ni clé API à saisir.</p>
    </div>
    <a href={queryUrl('google',activeTerm)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-4 text-[12px] font-semibold text-canvas hover:opacity-90"><UiIcon name="search" size={15}/> Rechercher sur le Web <UiIcon name="arrow-up-right" size={14}/></a>
   </div>
   <div className="relative mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4"><span className="flex items-center gap-2 text-[11px] text-ink-3"><UiIcon name="info" size={14} className="text-accent"/><strong className="text-ink">Simulation interactive</strong> · aucun comptage de mentions réel, aucune collecte automatique</span><span className="text-[10px] font-medium text-ink-4">{days} jours · Exemple fictif</span></div>
  </div>

  <nav aria-label="Sections de la veille" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1.5">
   {([{id:'overview',label:'Vue d’ensemble',icon:'bar-chart'},{id:'mentions',label:'Mentions',icon:'message'},{id:'sources',label:'Sources',icon:'globe'},{id:'keywords',label:'Mots-clés',icon:'search'},{id:'alerts',label:'Alertes',icon:'bell'}] as const).map(v=><button key={v.id} type="button" onClick={()=>setTab(v.id)} className={'flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition '+(tab===v.id?'bg-accent-soft text-accent':'text-ink-3 hover:bg-well hover:text-ink')}><UiIcon name={v.icon} size={15}/>{v.label}</button>)}
  </nav>

  {tab==='overview'&&<>
   <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    {[{label:'Mentions détectées',v:r.total,sub:'Sur le scénario fictif',icon:'message' as UiIconName,cls:'text-ink'},
      {label:'Mentions indépendantes',v:r.total-r.owned,sub:'Hors comptes officiels',icon:'users' as UiIconName,cls:'text-accent'},
      {label:'Mentions négatives',v:r.negative,sub:'À examiner en priorité',icon:'bell' as UiIconName,cls:'text-danger'},
      {label:'Plateformes représentées',v:platforms.length,sub:'Couverture illustrée',icon:'globe' as UiIconName,cls:'text-ink'}
    ].map(k=><div key={k.label} className="ml-bento min-w-0 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-[12px] text-ink-3">{k.label}</span><UiIcon name={k.icon} size={17} className="text-ink-4"/></div><div className={'mt-5 text-[31px] font-semibold tracking-[-.055em] tabular-nums '+k.cls}>{fmt(k.v)}</div><div className="mt-2 text-[11px] text-ink-4">{k.sub}</div></div>)}
   </div>
   <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(270px,1fr)]">
    <Card title="Évolution des conversations" caption={'Volume simulé · période '+days+' jours'} action={<Chip label="Illustration uniquement" tone="blue"/>}>
     <div className="flex h-[210px] items-end gap-1.5 border-b border-line pb-1">{samples.map((x,i)=><div key={i} className="group flex h-full flex-1 items-end"><div className="relative w-full rounded-t-md bg-accent/75 transition-all group-hover:bg-accent" style={{height:Math.max(5,x/graphMax*92)+'%'}} title={'Point de démonstration '+(i+1)} /></div>)}</div><div className="mt-3 flex justify-between text-[10px] text-ink-4"><span>Début de période</span><span>Fin de période</span></div>
     <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[11px] text-ink-4"><span>Exemples de sujets : livraison, état produit, prix, SAV</span></div>
    </Card>
    <Card title="Tonalité des mentions" caption="Scénario illustratif, pas une analyse IA réellement exécutée">
     <div className="space-y-4">{([{m:'positive' as Mood,n:r.positive},{m:'neutral' as Mood,n:r.neutral},{m:'negative' as Mood,n:r.negative},{m:'mixed' as Mood,n:r.mixed}]).map(o=><div key={o.m}><div className="mb-2 flex items-center justify-between text-[12px]"><span className="flex items-center gap-2 text-ink-2"><i className={'h-2 w-2 rounded-full '+(o.m==='positive'?'bg-success':o.m==='negative'?'bg-danger':o.m==='mixed'?'bg-warning':'bg-ink-4')}/>{moodText[o.m]}</span><strong className="tabular-nums text-ink">{fmt(o.n)} <span className="font-normal text-ink-4">· {Math.round(100*o.n/r.total)} %</span></strong></div><div className="h-2 rounded-full bg-well"><div className={'h-full rounded-full '+(o.m==='positive'?'bg-success':o.m==='negative'?'bg-danger':o.m==='mixed'?'bg-warning':'bg-ink-4')} style={{width:(o.n/r.total*100)+'%'}}/></div></div>)}</div>
     <button type="button" onClick={()=>{setMood('negative');setTab('mentions');}} className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent">Examiner les signaux négatifs <UiIcon name="arrow-right" size={14}/></button>
    </Card>
   </div>
   <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,1fr)]">
    <Card title="Où parle-t-on de la marque ?" caption="Répartition fictive des mentions par plateforme" action={<button onClick={()=>setTab('sources')} className="text-[11px] font-semibold text-accent">Explorer les sources</button>}>
     <div className="space-y-3.5">{distribution.map(p=><MiniBar key={p.platform} name={platformNames[p.platform]} percent={p.share} count={p.count}/>)}</div>
    </Card>
    <Card title="Conversations à surveiller" caption="Exemples de sujets pouvant nécessiter une réaction">
     <div className="space-y-2.5">{items.filter(m=>m.priority==='haute'||m.mood==='mixed').slice(0,4).map(m=><button key={m.id} type="button" onClick={()=>{setSelected(m.id);setTab('mentions');setMood('all');setNetwork('all');}} className="flex w-full gap-3 rounded-xl border border-line p-3 text-left transition hover:border-accent/40 hover:bg-well"><span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg '+moodColors[m.mood]}><UiIcon name={m.mood==='negative'?'bell':'message'} size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-ink">{m.title}</span><span className="mt-1 block text-[11px] text-ink-4">{platformNames[m.platform]} · {m.category}</span></span><UiIcon name="chevron-right" size={14} className="mt-2 text-ink-4"/></button>)}</div>
     <p className="mt-4 text-[11px] text-ink-4">Ces cas sont inventés pour visualiser le fonctionnement du futur module.</p>
    </Card>
   </div>
  </>}

  {tab==='mentions'&&<div className="space-y-4">
   <Card title="Boîte de réception des mentions" caption="Filtre les publications fictives, distingue les comptes officiels des discussions indépendantes.">
    <div className="mb-5 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
     <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line px-3"><UiIcon name="search" size={16} className="text-ink-4"/><input aria-label="Rechercher une mention" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Sujet, terme, publication…" className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"/></label>
     <select aria-label="Filtrer par plateforme" value={network} onChange={e=>setNetwork(e.target.value as typeof network)} className="min-h-10 rounded-lg border border-line bg-surface px-3 text-[12px] text-ink"><option value="all">Toutes les plateformes</option>{platforms.map(p=><option key={p} value={p}>{platformNames[p]}</option>)}</select>
     <select aria-label="Filtrer par sentiment" value={mood} onChange={e=>setMood(e.target.value as typeof mood)} className="min-h-10 rounded-lg border border-line bg-surface px-3 text-[12px] text-ink"><option value="all">Toutes les tonalités</option>{(['positive','negative','neutral','mixed'] as Mood[]).map(m=><option key={m} value={m}>{moodText[m]}</option>)}</select>
    </div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
     <div className="flex flex-wrap gap-1.5">{([{id:'all',label:'Toutes'},{id:'earned',label:'Mentions indépendantes'},{id:'owned',label:'Publications officielles'}] as const).map(i=><button key={i.id} onClick={()=>setIdentity(i.id)} className={'rounded-md px-2.5 py-1.5 text-[11px] font-semibold '+(identity===i.id?'bg-ink text-canvas':'bg-well text-ink-3 hover:text-ink')}>{i.label}</button>)}</div>
     <label className="flex items-center gap-2 text-[11px] text-ink-3"><input type="checkbox" checked={onlyHigh} onChange={e=>setOnlyHigh(e.target.checked)} className="accent-[rgb(var(--accent))]"/>Urgentes seulement</label>
    </div>
    <div className="mb-3 flex items-center justify-between text-[11px] text-ink-4"><span>{filtered.length} exemples affichés · Aucun résultat réel</span><button onClick={()=>{setQuery('');setMood('all');setNetwork('all');setOnlyHigh(false);setIdentity('all');setSelected(null);}} className="font-semibold text-accent">Effacer les filtres</button></div>
    <div className="space-y-2">{filtered.map(m=><div key={m.id} className={'rounded-xl border p-4 transition-colors '+(selected===m.id?'border-accent/50 bg-accent-soft/30':'border-line hover:border-line-strong')}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-1.5"><span className="inline-flex items-center gap-1 rounded-md bg-well px-2 py-1 text-[10px] font-semibold text-ink-3"><UiIcon name={platformIcon[m.platform]} size={12}/>{platformNames[m.platform]}</span><span className={'rounded-md px-2 py-1 text-[10px] font-semibold '+moodColors[m.mood]}>{moodText[m.mood]}</span><Chip label={m.owned?'Compte officiel':'Mention indépendante'}/>{m.priority==='haute'&&<Chip label="À examiner" tone="red"/>}</div><div className="flex gap-1"><button onClick={()=>setSaved(x=>x.includes(m.id)?x.filter(z=>z!==m.id):[...x,m.id])} aria-label={saved.includes(m.id)?'Retirer des favoris':'Enregistrer'} className={'flex h-8 w-8 items-center justify-center rounded-md border border-line '+(saved.includes(m.id)?'bg-accent-soft text-accent':'text-ink-4 hover:bg-well')}><UiIcon name="star" size={14}/></button><button onClick={()=>setSelected(selected===m.id?null:m.id)} aria-label="Voir le détail" className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-3 hover:bg-well"><UiIcon name={selected===m.id?'chevron-down':'chevron-right'} size={14}/></button></div></div>
      <button type="button" onClick={()=>setSelected(selected===m.id?null:m.id)} className="mt-3 block w-full text-left"><h3 className="text-[13px] font-semibold text-ink">{m.title}</h3><p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{m.content}</p></button>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-ink-4"><span>{m.author}</span><span>·</span><span>{m.date}</span><span>·</span><span>{m.category}</span></div>
      {selected===m.id&&<div className="mt-4 border-t border-line pt-4"><div className="mb-3 text-[11px] text-ink-3"><strong>Simulation de traitement :</strong> vérifier l’origine, la tonalité et l’identité de l’auteur avant toute réponse.</div><div className="flex flex-wrap gap-2"><a href={queryUrl(m.platform,m.phrase)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-canvas">Rechercher des sources réelles <UiIcon name="arrow-up-right" size={13}/></a><button type="button" onClick={()=>setTab('keywords')} className="rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-ink">Voir les mots-clés</button></div><p className="mt-3 text-[10px] text-ink-4">Ce lien lance une recherche, il ne pointe pas vers un avis ou un post inventé.</p></div>}
     </div>)}</div>
    {!filtered.length&&<div className="rounded-xl border border-dashed border-line p-8 text-center"><UiIcon name="search" size={22} className="mx-auto text-ink-4"/><h3 className="mt-3 text-[13px] font-semibold">Aucun scénario avec ces filtres</h3><p className="mt-1 text-[12px] text-ink-4">Modifie tes filtres pour afficher les exemples de mentions.</p></div>}
   </Card>
  </div>}

  {tab==='sources'&&<div className="space-y-4">
   <Card title="Rechercher une marque, sans clé API" caption="Les boutons ouvrent les moteurs et réseaux sociaux sur la requête sélectionnée. Les résultats sont ceux de leurs plateformes.">
    <label className="block max-w-xl text-[12px] font-medium text-ink-3"><span className="mb-2 block">Expression recherchée</span><select aria-label="Expression à rechercher" value={activeTerm} onChange={e=>setActiveTerm(e.target.value)} className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-[12px] text-ink">{searchTerms.map(w=><option key={w} value={w}>{w}</option>)}</select></label>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{external.map(e=><a key={e.id} href={queryUrl(e.id,activeTerm)} target="_blank" rel="noopener noreferrer" className="group flex min-h-[126px] flex-col justify-between rounded-xl border border-line p-4 transition-colors hover:border-accent/50 hover:bg-well"><div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><UiIcon name={e.icon} size={17}/></span><UiIcon name="arrow-up-right" size={15} className="text-ink-4 group-hover:text-accent"/></div><div><div className="mt-3 text-[12px] font-semibold text-ink">{e.name}</div><p className="mt-1 text-[11px] leading-snug text-ink-4">{e.desc}</p></div></a>)}</div>
    <p className="mt-5 text-[11px] text-ink-4">L’accès aux résultats peut dépendre de la connexion au réseau. Un moteur de recherche ouvert n’équivaut pas à un collecteur connecté.</p>
   </Card>
   <Card title="Couverture des sources" caption="Architecture héritée de Veilleo · statut des collecteurs pour ce frontend">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
     {[
      {name:'Recherche web & actualités',note:'Recherche manuelle publique',kind:'open'},
      {name:'YouTube',note:'Recherche publique · collecte non activée',kind:'open'},
      {name:'Google Business Profile',note:'Avis et établissement via autorisation future',kind:'planned'},
      {name:'RSS / Atom',note:'Flux d’actualités publics à raccorder plus tard',kind:'planned'},
      {name:'X & Reddit',note:'Collecte future selon les accès autorisés',kind:'planned'},
      {name:'Instagram · TikTok · LinkedIn',note:'Couverture selon intégrations disponibles',kind:'planned'},
     ].map(e=><div key={e.name} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold text-ink">{e.name}</span><Chip label={e.kind==='open'?'Recherche manuelle':'À connecter'} tone={e.kind==='open'?'blue':'neutral'}/></div><p className="mt-2 text-[11px] leading-relaxed text-ink-3">{e.note}</p></div>)}
    </div>
   </Card>
  </div>}

  {tab==='keywords'&&<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
   <Card title="Expressions à surveiller" caption="Configuration locale de l’interface, sans sauvegarde ni surveillance automatique">
    <div className="space-y-2">{watchwords.map((word,i)=><div key={word} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent">{String(i+1).padStart(2,'0')}</span><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{word}</span><a href={queryUrl('google',word)} target="_blank" rel="noopener noreferrer" className="flex h-7 w-7 items-center justify-center text-ink-4 hover:text-accent" aria-label={'Rechercher '+word}><UiIcon name="arrow-up-right" size={15}/></a><button aria-label={'Retirer '+word} onClick={()=>setWatchwords(list=>list.filter(v=>v!==word))} className="flex h-7 w-7 items-center justify-center text-ink-4 hover:text-danger"><UiIcon name="x" size={15}/></button></div>)}</div>
    <form className="mt-4 flex gap-2" onSubmit={e=>{e.preventDefault();const w=newWord.trim();if(w&&w.length<=90&&!watchwords.includes(w)&&watchwords.length<10){setWatchwords(list=>[...list,w]);setNewWord('');}}}><input aria-label="Nouvelle expression" placeholder="Ajouter un mot-clé ou une variante…" maxLength={90} value={newWord} onChange={e=>setNewWord(e.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[12px] text-ink outline-none focus:border-accent"/><button type="submit" disabled={!newWord.trim()||watchwords.length>=10} className="rounded-lg bg-ink px-3 text-[12px] font-semibold text-canvas disabled:opacity-40"><UiIcon name="plus" size={16}/></button></form>
    <p className="mt-4 text-[11px] text-ink-4">Les mots-clés sont temporaires et réinitialisés au rechargement de la page. Aucun compte ou clé API n’est nécessaire.</p>
   </Card>
   <Card title="Expressions recommandées" caption="Limiter les homonymes et distinguer la marque des expressions génériques">
    <div className="space-y-2">{searchTerms.filter(w=>!watchwords.includes(w)).map(word=><button key={word} onClick={()=>watchwords.length<10&&setWatchwords(list=>[...list,word])} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-left hover:border-accent/40 hover:bg-well"><span className="min-w-0 truncate text-[11px] text-ink-2">{word}</span><UiIcon name="plus" size={14} className="text-accent"/></button>)}</div>
    <div className="mt-5 rounded-xl bg-well p-4"><div className="flex gap-2 text-[12px] font-semibold text-ink"><UiIcon name="info" size={16} className="text-accent"/>Conseil de veille</div><p className="mt-2 text-[11px] leading-relaxed text-ink-3">Évite de suivre seulement « discount » ou « qualité » : ces termes isolés créent beaucoup de résultats hors sujet. Privilégie le nom exact, les variantes et le domaine.</p></div>
   </Card>
  </div>}

  {tab==='alerts'&&<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
   <Card title="Règles d’alerte" caption="Prévisualisation interactive : aucun e-mail ni notification n’est envoyé">
    <div className="space-y-2">{([
      {id:'negative',title:'Nouvelle mention négative',desc:'Remonter un signal lié à une mauvaise expérience ou au SAV.',icon:'bell' as UiIconName},
      {id:'brand',title:'Nouvelle citation de la marque',desc:'Repérer une publication indépendante ou un article.',icon:'megaphone' as UiIconName},
      {id:'competitor',title:'Comparaison avec un concurrent',desc:'Être informé lorsqu’une marque concurrente est citée.',icon:'compass' as UiIconName},
      {id:'missing',title:'Produit ou état mal compris',desc:'Surveiller les questions sur le neuf et le déclassé.',icon:'file-text' as UiIconName},
    ] as const).map(rule=><button key={rule.id} type="button" role="switch" aria-checked={rules[rule.id]} onClick={()=>setRules(prev=>({...prev,[rule.id]:!prev[rule.id]}))} className="flex w-full items-center gap-3 rounded-xl border border-line p-4 text-left transition-colors hover:bg-well"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><UiIcon name={rule.icon} size={18}/></span><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-ink">{rule.title}</span><span className="mt-1 block text-[11px] leading-relaxed text-ink-4">{rule.desc}</span></span><span className={'relative h-6 w-11 shrink-0 rounded-full transition '+(rules[rule.id]?'bg-accent':'bg-line-strong')}><i className={'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform '+(rules[rule.id]?'translate-x-[22px]':'translate-x-0.5')}/></span></button>)}</div>
    <p className="mt-5 flex items-start gap-2 rounded-lg bg-well p-3 text-[11px] leading-relaxed text-ink-3"><UiIcon name="info" size={15} className="mt-0.5 shrink-0 text-accent"/>Ces interrupteurs illustrent une future configuration. Ils n’enregistrent rien côté serveur et n’activent aucune surveillance.</p>
   </Card>
   <Card title="Exemple de notification" caption="Ce qu’un responsable de la boutique pourrait recevoir">
    <div className="rounded-xl border border-line bg-well p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Chip label="APERÇU FICTIF" tone="amber"/><span className="text-[10px] text-ink-4">Exemple de résumé</span></div><div className="mt-4 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger"><UiIcon name="bell" size={17}/></span><div><div className="text-[12px] font-semibold text-ink">Un commentaire mérite ton attention</div><p className="mt-2 text-[12px] leading-relaxed text-ink-3">Un utilisateur fictif pose une question sur l’état d’un produit déclassé. Vérifier la fiche et répondre depuis la plateforme d’origine.</p></div></div><div className="mt-4 border-t border-line pt-3"><span className="text-[10px] text-ink-4">Aucun message n’a été détecté ni envoyé.</span></div></div>
   </Card>
  </div>}
 </div>;
}
/**
 * Read-only Veilleo bridge for Discount & Qualité Insights.
 * Sensitive data is NEVER exposed by default; both a Veilleo read key and
 * a distinct long access passphrase are required before any upstream request.
 * This public prototype intentionally provides no account/session auth.
 */
import { timingSafeEqual } from 'node:crypto';

export const config = { runtime: 'nodejs', maxDuration: 20 };
export const maxDuration = 20;
const source = 'https://veilleo-landing.vercel.app';
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{
  status,
  headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store, no-cache, must-revalidate',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  }
});
const goodKey=(key:string, secret:string)=>{
  const a=Buffer.from(key,'utf8'), b=Buffer.from(secret,'utf8');
  return a.length===b.length && timingSafeEqual(a,b);
};
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const matchingBrand=(w:any)=>{
  const name=normalize(String(w?.name||''));
  const website=normalize(String(w?.website||''));
  return website.includes('discountetqualitefr')||(name.includes('discount')&&name.includes('qualit'));
};
async function upstream(path:string, token:string, query:URLSearchParams){
  const url=new URL('/api/v1/agent/'+path,source);
  for(const [key,value] of query.entries())url.searchParams.set(key,value);
  const response=await fetch(url,{method:'GET',headers:{
    Authorization:'Bearer '+token,
    Accept:'application/json',
    'User-Agent':'DiscountQualiteInsights/1.0 (+read-only Veilleo integration)'
  },cache:'no-store',signal:AbortSignal.timeout(12500)});
  if(!response.ok)throw Object.assign(new Error('Veilleo_API_'+response.status),{status:response.status});
  const raw=await response.json();
  if(!raw||typeof raw!=='object')throw new Error('Invalid upstream payload');
  return raw;
}
export async function GET(request:Request):Promise<Response>{
  // Only same-origin clients may use this bridge from a browser.
  const origin=request.headers.get('origin');
  if(origin){
    try{if(new URL(origin).host!==new URL(request.url).host)return json({error:'Accès non autorisé.'},403);}
    catch{return json({error:'Accès non autorisé.'},403);}
  }
  const token=process.env.VEILLEO_AGENT_API_KEY||'';
  const secret=process.env.VEILLEO_MONITOR_PASSWORD||'';
  if(!token||secret.length<16)return json({
    connected:false,
    status:'setup_required',
    message:'Connecte une clé API Veilleo de lecture et un mot de passe dédié dans les variables Vercel du projet Discount & Qualité Insights.',
    setup:['Créer un espace Veilleo pour Discount & Qualité.','Générer une clé avec mentions:read, statistics:read et workspace:read.','Configurer VEILLEO_AGENT_API_KEY et VEILLEO_MONITOR_PASSWORD (16 caractères minimum) sur la démo, puis redéployer.']
  },503);
  const pass=request.headers.get('x-veilleo-access')||'';
  if(pass.length>256||!goodKey(pass,secret))return json({connected:false,status:'unauthorized',message:'Code d’accès incorrect.'},401);
  const target=new URL(request.url);
  const period=['7','30','90'].includes(target.searchParams.get('period')||'')?String(target.searchParams.get('period')):'30';
  const page=Math.max(1,Math.min(20,Number(target.searchParams.get('page')||1)||1));
  const platform=String(target.searchParams.get('platform')||'');
  const allowed=['google','youtube','web','x','reddit','instagram','facebook','tiktok','linkedin','other'];
  if(platform&&!allowed.includes(platform))return json({error:'Plateforme inconnue.'},400);
  try{
    // Verify tenant identity BEFORE reading data. Never silently expose
    // another company from a misconfigured Veilleo token.
    const ws=await upstream('workspace',token,new URLSearchParams());
    if(!matchingBrand(ws.workspace))return json({connected:false,status:'wrong_workspace',message:'La clé Veilleo ne correspond pas à un espace Discount & Qualité. Corrige le compte ou la clé.'},409);
    const qMentions=new URLSearchParams({period,scope:'mine',page:String(page),sort:'recent'});
    if(platform)qMentions.set('platform',platform);
    const qStats=new URLSearchParams({period,scope:'mine',timezone:'Europe/Paris'});
    const [mentions,stats]=await Promise.all([
      upstream('mentions',token,qMentions),
      upstream('statistics',token,qStats)
    ]);
    return json({
      connected:true,status:'ok',period,page,platform,
      retrievedAt:new Date().toISOString(),
      workspace:{name:ws.workspace.name,website:ws.workspace.website,keywords:ws.workspace.keywords,competitors:ws.workspace.competitors},
      mentions:Array.isArray(mentions.mentions)?mentions.mentions:[],
      hasMore:mentions.hasMore===true,
      statistics:stats
    });
  }catch(err){
    const status=Number((err as {status?:number})?.status)||0;
    return json({connected:false,status:'upstream_error',
      message:status===401||status===403?'La clé Veilleo est refusée ou n’a pas toutes les autorisations de lecture.':status===429?'Veilleo limite temporairement les requêtes.':status===503?'La collecte Veilleo est indisponible ou non configurée.':'Lecture temporairement impossible. Vérifie Veilleo puis réessaie.'
    },status===429?429:502);
  }
}

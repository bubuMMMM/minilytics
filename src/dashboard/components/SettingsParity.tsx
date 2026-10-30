import { useEffect, useState, type ReactNode } from 'react';
import { api, type Site } from '../lib/api';
import { fmtAgo } from '../lib/format';

type SectionC = (p: { title: string; desc?: ReactNode; children: ReactNode }) => ReactNode;
type CodeC = (p: { children: string }) => ReactNode;

interface Alerts { inApp: boolean; emails: string[]; weekly: boolean; monthly: boolean; traffic: boolean; newGoals: boolean; goals: string[]; payments: boolean; mentions: boolean }
interface SiteSettings { allowedHostnames: string[]; alerts: Alerts; github: { repo: string | null }; reddit: { keywords: string[] }; email: { configured: boolean; from: string; provider: string } }
interface Connectors {
  github: { repo: string | null; token: boolean; lastSync: number | null; ok: boolean | null; error: string | null };
  reddit: { keywords: string[]; oauth: boolean; lastSync: number | null; ok: boolean | null; error: string | null };
  google: { configured: boolean; needs: string[]; redirectUri: string; connected: boolean; property: string | null; properties: string[] };
  meta: { configured: boolean; needs: string[]; redirectUri: string; connected: boolean; adAccount: string | null; accounts: { id: string; name: string }[] };
  x: { configured: boolean; needs: string[] };
  email: { configured: boolean; needs: string[] };
}
interface Token { id: string; name: string; role: string; sites: string[] | '*'; prefix: string; created_at: number; last_used_at: number | null }

const Badge = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={ok ? 'rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success' : 'rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning'}>{children}</span>
);
const Env = ({ names }: { names: string[] }) => <>{names.map((n, i) => <span key={n}>{i > 0 && ' + '}<code>{n}</code></span>)}</>;
const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

function useSettings(siteId: string) {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<SiteSettings>(`/api/sites/${siteId}/settings`).then(setS, (e) => setError((e as Error).message)); }, [siteId]);
  async function save(patch: Partial<SiteSettings>, ok = 'Enregistré') {
    setError('');
    try { setS(await api<SiteSettings>(`/api/sites/${siteId}/settings`, { method: 'PATCH', json: patch })); setMsg(ok); setTimeout(() => setMsg(''), 2500); } catch (e) { setError((e as Error).message); }
  }
  return { s, save, msg, error };
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent,#111)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0"><span className="text-sm font-medium">{label}</span>{hint && <span className="block text-[12px] text-ink-3">{hint}</span>}</span>
    </label>
  );
}

// ------------------------------------------------------------------ tracker options + first-party proxy

const ATTRS: [string, string][] = [
  ['data-website-id', 'Identifiant du site (obligatoire).'],
  ['data-domain', 'Domaine racine pour partager le visiteur entre sous-domaines.'],
  ['data-allowed-hostnames', 'Autres domaines du même parcours (domaines croisés), séparés par des virgules.'],
  ['data-api-url', 'Point d’envoi, ex. /stats/api/event (proxy first-party).'],
  ['data-cookieless', 'Aucun cookie : identifiant quotidien calculé côté serveur, jamais stocké.'],
  ['data-hash', 'Applis à routes #… (ou chargez /js/script.hash.js).'],
  ['data-allow-localhost', 'Mesurer aussi localhost (ignoré par défaut).'],
  ['data-allow-file-protocol', 'Mesurer les pages ouvertes en file://.'],
  ['data-debug', 'Mesurer aussi dans les iframes (ignorées par défaut).'],
  ['data-disable-payments', 'Ne pas lire session_id / checkout_id / order_id au retour de paiement.'],
  ['data-exclude-paths', 'Chemins ignorés par le script, ex. /admin,/app.'],
];

export function TrackerOptions({ site, origin, Section, Code }: { site: Site; origin: string; Section: SectionC; Code: CodeC }) {
  const [tab, setTab] = useState<'next' | 'vercel' | 'cloudflare' | 'nginx'>('next');
  const host = new URL(origin).host;
  const snippets: Record<typeof tab, string> = {
    next: `// next.config.js
module.exports = {
  async rewrites() {
    return [
      { source: '/stats/js/script.js', destination: '${origin}/js/script.js' },
      { source: '/stats/api/event', destination: '${origin}/api/event' },
    ];
  },
};

<script defer data-website-id="${site.id}" data-api-url="/stats/api/event" src="/stats/js/script.js"></script>`,
    vercel: `// vercel.json
{
  "rewrites": [
    { "source": "/stats/js/script.js", "destination": "${origin}/js/script.js" },
    { "source": "/stats/api/event", "destination": "${origin}/api/event" }
  ]
}`,
    cloudflare: `// Cloudflare Worker sur la route ${site.domain}/stats/*
export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\\/stats/, '');
    if (path !== '/js/script.js' && path !== '/api/event') return new Response('Not found', { status: 404 });
    const headers = new Headers(req.headers);
    headers.set('X-Forwarded-For', req.headers.get('CF-Connecting-IP') || '');
    return fetch('${origin}' + path, { method: req.method, headers, body: req.body });
  },
};`,
    nginx: `location = /stats/js/script.js {
  proxy_pass ${origin}/js/script.js;
  proxy_set_header Host ${host};
  proxy_ssl_server_name on;
}
location = /stats/api/event {
  proxy_pass ${origin}/api/event;
  proxy_set_header Host ${host};
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_ssl_server_name on;
}`,
  };
  return (
    <Section title="Options du script et proxy first-party" desc="Mêmes attributs que DataFast. Servez le script depuis votre propre domaine pour qu’aucun bloqueur ne l’écarte.">
      <details className="text-sm">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">Attributs disponibles</summary>
        <dl className="mt-2 divide-y divide-line rounded-xl border border-line">
          {ATTRS.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-[220px_1fr]"><dt><code className="text-[12px]">{k}</code></dt><dd className="text-[13px] text-ink-3">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-[12px] text-ink-3">Objectifs : <code>data-ml-goal</code> ou <code>data-fast-goal</code> (+ <code>data-fast-goal-*</code> en paramètres). Scroll : <code>data-fast-scroll="vu_tarifs"</code> avec <code>-threshold</code>, <code>-delay</code>. JavaScript : <code>window.datafast('signup', {'{'} plan {'}'})</code> fonctionne aussi.</p>
      </details>
      <div className="mt-3">
        <div role="tablist" aria-label="Proxy" className="mb-2 flex flex-wrap gap-1.5">
          {(['next', 'vercel', 'cloudflare', 'nginx'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'btn-dark !h-9' : 'btn !h-9'} onClick={() => setTab(t)}>{{ next: 'Next.js', vercel: 'Vercel', cloudflare: 'Cloudflare', nginx: 'Nginx' }[t]}</button>
          ))}
        </div>
        <Code>{snippets[tab]}</Code>
        <p className="mt-2 text-[12px] text-ink-3">Ensuite : <code>data-api-url="/stats/api/event"</code> et <code>src="/stats/js/script.js"</code>. L’IP du visiteur est transmise par <code>X-Forwarded-For</code> pour la géolocalisation.</p>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ cross-domain

export function CrossDomain({ site, Section, Code, canEdit }: { site: Site; Section: SectionC; Code: CodeC; canEdit: boolean }) {
  const { s, save, msg, error } = useSettings(site.id);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? s?.allowedHostnames.join('\n') ?? '';
  return (
    <Section title="Domaines croisés" desc={<>Suivez un même visiteur de {site.domain} vers votre boutique ou votre appli sur un autre domaine : les liens entre ces domaines transportent l’identifiant, et ces domaines ne comptent pas comme référents.</>}>
      {!s ? <div className="ml-skeleton h-24" /> : (
        <>
          <label className="block">
            <span className="text-[13px] font-medium">Autres domaines (un par ligne)</span>
            <textarea className="input mt-1 min-h-[80px] py-2 font-mono text-[13px]" value={value} placeholder={'app.exemple.com\nboutique.exemple.org'} disabled={!canEdit} onChange={(e) => setDraft(e.target.value)} />
          </label>
          {canEdit && <div className="mt-2 flex items-center gap-3"><button className="btn-dark" onClick={() => save({ allowedHostnames: lines(value) }).then(() => setDraft(null))}>Enregistrer</button>{msg && <span className="text-sm text-success">{msg}</span>}{error && <span className="text-sm text-danger">{error}</span>}</div>}
          {s.allowedHostnames.length > 0 && <div className="mt-3"><Code>{`<script defer data-website-id="${site.id}" data-allowed-hostnames="${s.allowedHostnames.join(',')}" src="${location.origin}/js/script.js"></script>`}</Code><p className="mt-1 text-[12px] text-ink-3">Installez ce même script (même identifiant) sur chaque domaine.</p></div>}
        </>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ alerts & reports

export function AlertsSettings({ site, Section, canEdit }: { site: Site; Section: SectionC; canEdit: boolean }) {
  const { s, save, msg, error } = useSettings(site.id);
  const [emails, setEmails] = useState<string | null>(null);
  const [goals, setGoals] = useState<string | null>(null);
  const [test, setTest] = useState('');
  if (!s) return <div id="alertes" className="scroll-mt-24"><Section title="Alertes et rapports">{<div className="ml-skeleton h-40" />}</Section></div>;
  const a = s.alerts;
  const set = (patch: Partial<Alerts>) => save({ alerts: { ...a, ...patch } });
  return (
    <div id="alertes" className="scroll-mt-24">
    <Section title="Alertes et rapports" desc="Notifications dans l’application (cloche) dès qu’un événement arrive, et rapports par e-mail chaque semaine ou chaque mois.">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Toggle label="Notifications dans l’application" checked={a.inApp} disabled={!canEdit} onChange={(v) => set({ inApp: v })} />
        <Toggle label="Pic ou chute de trafic" hint="Heure en cours comparée à la même heure des 7 derniers jours." checked={a.traffic} disabled={!canEdit} onChange={(v) => set({ traffic: v })} />
        <Toggle label="Premier objectif atteint" hint="La première fois qu’un nouvel objectif est complété." checked={a.newGoals} disabled={!canEdit} onChange={(v) => set({ newGoals: v })} />
        <Toggle label="Nouveaux paiements" checked={a.payments} disabled={!canEdit} onChange={(v) => set({ payments: v })} />
        <Toggle label="Mentions (Reddit, 𝕏)" checked={a.mentions} disabled={!canEdit} onChange={(v) => set({ mentions: v })} />
      </div>
      <label className="mt-3 block">
        <span className="text-[13px] font-medium">Objectifs à suivre à chaque conversion</span>
        <input className="input mt-1 font-mono text-[13px]" value={goals ?? a.goals.join(', ')} placeholder="signup, checkout" disabled={!canEdit} onChange={(e) => setGoals(e.target.value)} onBlur={() => goals !== null && set({ goals: lines(goals) }).then(() => setGoals(null))} />
      </label>
      <div className="mt-5 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">Rapports par e-mail</span>{s.email.configured ? <Badge ok>Envoi actif · {s.email.provider}</Badge> : <Badge ok={false}>À configurer · RESEND_API_KEY requis</Badge>}</div>
        {!s.email.configured && <p className="mt-1 text-[12px] text-ink-3">Ajoutez <code>RESEND_API_KEY</code> (et <code>REPORT_FROM_EMAIL</code>, un expéditeur vérifié) aux variables d’environnement du déploiement. En attendant, tout reste visible dans la cloche.</p>}
        <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
          <Toggle label="Rapport hebdomadaire (lundi)" checked={a.weekly} disabled={!canEdit} onChange={(v) => set({ weekly: v })} />
          <Toggle label="Rapport mensuel (le 1er)" checked={a.monthly} disabled={!canEdit} onChange={(v) => set({ monthly: v })} />
        </div>
        <label className="mt-2 block">
          <span className="text-[13px] font-medium">Destinataires</span>
          <input className="input mt-1 text-[13px]" type="text" inputMode="email" value={emails ?? a.emails.join(', ')} placeholder="vous@exemple.com" disabled={!canEdit} onChange={(e) => setEmails(e.target.value)} onBlur={() => emails !== null && set({ emails: lines(emails) }).then(() => setEmails(null))} />
          <span className="mt-1 block text-[11px] text-ink-4">Les alertes non lues sont aussi envoyées en résumé quotidien.</span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn" href={`/api/sites/${site.id}/reports/preview?kind=weekly&format=html`} target="_blank" rel="noopener">Aperçu hebdomadaire</a>
          <a className="btn" href={`/api/sites/${site.id}/reports/preview?kind=monthly&format=html`} target="_blank" rel="noopener">Aperçu mensuel</a>
          {canEdit && <button className="btn" disabled={!s.email.configured || !a.emails.length} onClick={async () => { setTest(''); try { await api(`/api/sites/${site.id}/reports/test`, { method: 'POST', json: {} }); setTest('E-mail de test envoyé'); } catch (e) { setTest((e as Error).message); } }}>Envoyer un test</button>}
        </div>
        {test && <p className="mt-2 text-[12px] text-ink-3">{test}</p>}
      </div>
      <p className="mt-2 h-5 text-sm">{msg && <span className="text-success">{msg}</span>}{error && <span className="text-danger">{error}</span>}</p>
    </Section>
    </div>
  );
}

// ------------------------------------------------------------------ connectors

export function ConnectorsSettings({ site, Section, canEdit }: { site: Site; Section: SectionC; canEdit: boolean }) {
  const { s, save } = useSettings(site.id);
  const [c, setC] = useState<Connectors | null>(null);
  const [repo, setRepo] = useState<string | null>(null);
  const [kw, setKw] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const load = () => api<Connectors>(`/api/sites/${site.id}/connectors`).then(setC);
  useEffect(() => { load(); }, [site.id]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('oauth')) setNote(q.get('connected') ? `${q.get('oauth') === 'google' ? 'Google Search Console' : 'Meta Ads'} connecté.` : `Connexion refusée : ${q.get('error') ?? ''}`);
  }, []);
  async function sync(p: 'github' | 'reddit') {
    setBusy(p);
    try { const r = await api<{ ok: boolean; found?: number; error?: string }>(`/api/sites/${site.id}/connectors/${p}/sync`, { method: 'POST', json: {} }); setNote(r.ok ? `${p === 'github' ? 'GitHub' : 'Reddit'} : ${r.found ?? 0} élément(s) trouvé(s).` : r.error ?? 'Erreur'); } finally { setBusy(''); load(); }
  }
  async function connect(p: 'google' | 'meta') {
    try { const r = await api<{ url: string }>(`/api/sites/${site.id}/oauth/${p}/start`, { method: 'POST', json: {} }); location.href = r.url; } catch (e) { setNote((e as Error).message); }
  }
  const state = (x: { lastSync: number | null; ok: boolean | null; error: string | null }) => x.lastSync ? (x.ok ? `Synchronisé ${fmtAgo(Date.now() - x.lastSync)}` : `Erreur : ${x.error}`) : 'Jamais synchronisé';
  return (
    <Section title="Sources externes" desc="Commits, mentions, recherche Google et publicités Meta à côté de vos visites. Chaque source reste « À configurer » tant que ses identifiants ne sont pas fournis.">
      {!c || !s ? <div className="ml-skeleton h-40" /> : (
        <div className="space-y-3 text-sm">
          {note && <p className="rounded-lg border border-line bg-well px-3 py-2 text-[13px]">{note}</p>}
          <div className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">GitHub · commits en annotations</span>{c.github.repo ? <Badge ok>{c.github.repo}</Badge> : <Badge ok={false}>À configurer · dépôt</Badge>}</div>
            <p className="mt-1 text-[12px] text-ink-3">Dépôt public (ou privé avec <code>GITHUB_TOKEN</code>{c.github.token ? ', présent' : ', absent'}). {c.github.repo && state(c.github)}</p>
            {canEdit && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input className="input min-w-0 flex-1 font-mono text-[13px]" placeholder="proprietaire/depot" value={repo ?? c.github.repo ?? ''} onChange={(e) => setRepo(e.target.value)} /><button className="btn-dark" onClick={async () => { await save({ github: { repo: (repo ?? '').trim() || null } }); setRepo(null); await load(); }}>Enregistrer</button>{c.github.repo && <button className="btn" disabled={busy === 'github'} onClick={() => sync('github')}>Synchroniser</button>}</div>}
          </div>
          <div className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">Reddit · mentions</span>{c.reddit.oauth ? <Badge ok>API Reddit</Badge> : c.reddit.ok ? <Badge ok>Recherche publique</Badge> : <Badge ok={false}>À configurer · REDDIT_CLIENT_ID requis</Badge>}</div>
            <p className="mt-1 text-[12px] text-ink-3">Reddit bloque souvent les serveurs cloud sans identifiants : ajoutez <Env names={['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET']} /> (appli « script » sur reddit.com/prefs/apps). {state(c.reddit)}</p>
            {canEdit && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input className="input min-w-0 flex-1 text-[13px]" placeholder={site.domain} value={kw ?? s.reddit.keywords.join(', ')} onChange={(e) => setKw(e.target.value)} /><button className="btn-dark" onClick={async () => { await save({ reddit: { keywords: lines(kw ?? '') } }); setKw(null); await load(); }}>Enregistrer</button><button className="btn" disabled={busy === 'reddit'} onClick={() => sync('reddit')}>Chercher</button></div>}
          </div>
          {(['google', 'meta'] as const).map((p) => {
            const x = c[p];
            const name = p === 'google' ? 'Google Search Console · mots-clés' : 'Meta Ads · dépenses et ROAS';
            return (
              <div key={p} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{name}</span>{x.connected ? <Badge ok>Connecté</Badge> : x.configured ? <Badge ok={false}>Prêt à connecter</Badge> : <Badge ok={false}>À configurer · identifiants OAuth requis</Badge>}</div>
                  {canEdit && x.configured && <div className="flex gap-2">{x.connected && <button className="btn text-danger" onClick={async () => { await api(`/api/sites/${site.id}/oauth/${p}`, { method: 'DELETE' }); load(); }}>Déconnecter</button>}<button className={x.connected ? 'btn' : 'btn-dark'} onClick={() => connect(p)}>{x.connected ? 'Reconnecter' : 'Connecter'}</button></div>}
                </div>
                {!x.configured && <p className="mt-1 text-[12px] text-ink-3">Ajoutez <Env names={x.needs} /> aux variables d’environnement, avec l’URL de redirection <code className="break-all">{x.redirectUri}</code>.</p>}
                {p === 'google' && c.google.connected && <p className="mt-1 text-[12px] text-ink-3">Propriété : <code>{c.google.property ?? '—'}</code></p>}
                {p === 'meta' && c.meta.connected && <p className="mt-1 text-[12px] text-ink-3">Compte publicitaire : <code>{c.meta.adAccount ?? '—'}</code></p>}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ API, CLI, MCP + plan usage

export function ApiAccess({ site, Section, Code }: { site: Site; Section: SectionC; Code: CodeC }) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [fresh, setFresh] = useState('');
  const [error, setError] = useState('');
  const load = () => api<{ tokens: Token[] }>('/api/tokens').then((r) => setTokens(r.tokens), (e) => setError((e as Error).message));
  useEffect(() => { load(); }, []);
  const origin = location.origin;
  return (
    <Section title="API, CLI et MCP" desc={<>Interrogez vos statistiques depuis un script, le terminal ou un assistant IA (Claude, Cursor, ChatGPT). <a className="underline" href="/api-docs">Documentation et bac à sable</a>.</>}>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={async (e) => { e.preventDefault(); setError(''); try { const r = await api<{ token: string }>('/api/tokens', { method: 'POST', json: { name: name || 'Jeton API', readOnly } }); setFresh(r.token); setName(''); load(); } catch (err) { setError((err as Error).message); } }}>
        <input className="input min-w-0 flex-1" placeholder="Nom du jeton (ex. Claude)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom du jeton" />
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />Lecture seule</label>
        <button className="btn-dark">Créer un jeton</button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {fresh && <div className="mt-3"><p className="mb-1 text-[13px] font-medium">Copiez-le maintenant : il ne sera plus affiché.</p><Code>{fresh}</Code></div>}
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {tokens === null ? <li className="p-3"><div className="ml-skeleton h-6" /></li> : tokens.length === 0 ? <li className="p-3 text-sm text-ink-3">Aucun jeton actif.</li> : tokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span className="min-w-0"><b>{t.name}</b> <code className="text-[12px] text-ink-3">{t.prefix}…</code> · {t.role === 'viewer' ? 'lecture seule' : 'lecture et écriture'}<span className="block text-[12px] text-ink-4">{t.last_used_at ? `Utilisé ${fmtAgo(Date.now() - t.last_used_at)}` : 'Jamais utilisé'}</span></span>
            <button className="btn text-danger" onClick={async () => { if (!confirm(`Révoquer « ${t.name} » ?`)) return; await api(`/api/tokens/${t.id}`, { method: 'DELETE' }); load(); }}>Révoquer</button>
          </li>
        ))}
      </ul>
      <details className="mt-3 text-sm">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">Serveur MCP (Claude, Cursor, ChatGPT…)</summary>
        <Code>{JSON.stringify({ mcpServers: { minilytics: { type: 'http', url: `${origin}/api/mcp`, headers: { Authorization: 'Bearer mlt_…' } } } }, null, 2)}</Code>
        <p className="mt-1 text-[12px] text-ink-3">Outils : list_sites, get_stats, top_pages, top_sources, breakdown, realtime, goals, revenue, funnels, bot_traffic, notes, mentions, visitor.</p>
      </details>
      <details className="text-sm">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">CLI et REST</summary>
        <Code>{`curl -H "Authorization: Bearer mlt_…" ${origin}/api/v1/sites/${site.id}/overview?period=7d

npx minilytics-cli login --host ${origin} --token mlt_…
minilytics stats --site ${site.id} --period 7d`}</Code>
      </details>
    </Section>
  );
}

interface Usage { plan: { id: string; name: string; eventsPerMonth: number; sites: number; members: number }; events: { used: number; limit: number; over: boolean }; sites: { used: number; limit: number }; members: { used: number; limit: number } }

export function PlanUsage({ Section }: { Section: SectionC }) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => { api<Usage>('/api/usage').then(setU, () => {}); }, []);
  if (!u) return null;
  const bar = (used: number, limit: number) => (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-well"><div className={`h-full rounded-full ${used > limit ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} /></div>
  );
  const rows: [string, number, number][] = [['Événements ce mois-ci', u.events.used, u.events.limit], ['Sites', u.sites.used, u.sites.limit], ['Membres', u.members.used, u.members.limit]];
  return (
    <Section title={`Offre ${u.plan.name}`} desc="Les événements au-delà du quota sont conservés ; sites et membres sont limités par l’offre.">
      <div className="grid gap-4 sm:grid-cols-3">
        {rows.map(([l, used, limit]) => (
          <div key={l} className="min-w-0"><div className="flex justify-between text-[13px]"><span>{l}</span><span className="tnum text-ink-3">{used.toLocaleString('fr-FR')} / {limit.toLocaleString('fr-FR')}</span></div>{bar(used, limit)}</div>
        ))}
      </div>
    </Section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';

interface Op { method: string; path: string; summary: string; params: { name: string; in: string; required?: boolean; description?: string }[] }
const TOKEN_KEY = 'ml_api_playground_token';

/** Public REST API reference (from /api/v1/openapi.json) with an in-browser playground. The token stays in this tab. */
export function ApiDocs() {
  const [ops, setOps] = useState<Op[] | null>(null);
  const [sel, setSel] = useState(0);
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } });
  const [vals, setVals] = useState<Record<string, string>>({ period: '7d' });
  const [body, setBody] = useState('{\n  "text": "Lancement"\n}');
  const [res, setRes] = useState<{ status: number; ms: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'API — Minilytics';
    fetch('/api/v1/openapi.json').then((r) => r.json()).then((spec: any) => {
      const list: Op[] = [];
      for (const [path, item] of Object.entries<any>(spec.paths)) for (const [method, op] of Object.entries<any>(item)) list.push({ method: method.toUpperCase(), path, summary: op.summary, params: op.parameters ?? [] });
      setOps(list);
    });
  }, []);
  const op = ops?.[sel];
  const url = useMemo(() => {
    if (!op) return '';
    let p = op.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vals[k] ?? `{${k}}`));
    const qp = new URLSearchParams();
    for (const x of op.params) if (x.in === 'query' && vals[x.name]) qp.set(x.name, vals[x.name]);
    const s = qp.toString();
    if (s) p += '?' + s;
    return p;
  }, [op, vals]);
  async function send() {
    if (!op) return;
    setBusy(true);
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
    const t0 = performance.now();
    try {
      const r = await fetch(url, { method: op.method, credentials: 'omit', headers: { authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json', accept: 'application/json' }, body: op.method === 'POST' ? (op.path === '/api/mcp' ? body || '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' : body) : undefined });
      const text = await r.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
      setRes({ status: r.status, ms: Math.round(performance.now() - t0), text: pretty.slice(0, 60_000) });
    } catch (e) {
      setRes({ status: 0, ms: 0, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const curl = op ? `curl${op.method === 'POST' ? ' -X POST' : ''} -H "Authorization: Bearer mlt_…" "${location.origin}${url}"` : '';
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Minilytics, accueil"><Logo /></Link>
          <nav className="flex items-center gap-2 text-sm"><a className="btn !h-9" href="/api/v1/openapi.json">OpenAPI</a><Link href="/sites" className="btn-dark !h-9">Tableau de bord</Link></nav>
        </div>
      </header>
      <main id="contenu" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="ml-kicker">Développeurs</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">API Minilytics</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-3">Lisez vos statistiques en JSON, envoyez des paiements, des objectifs et des identifications depuis votre serveur, ou branchez un assistant IA par MCP. Authentification : <code>Authorization: Bearer mlt_…</code> (jeton personnel, Réglages › API) ou la clé <code>ml_…</code> d’un site. Montants en unités mineures (centimes) de la devise du site. Limite : 240 requêtes/min.</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <aside className="card max-h-[70vh] min-w-0 overflow-auto p-2" aria-label="Points d’accès">
            {!ops ? <div className="ml-skeleton m-2 h-64" /> : ops.map((o, i) => (
              <button key={o.method + o.path} onClick={() => { setSel(i); setRes(null); }} aria-current={i === sel} className={`flex w-full min-h-[44px] items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${i === sel ? 'bg-well' : 'hover:bg-well'}`}>
                <span className={`mt-0.5 w-11 shrink-0 font-mono text-[11px] font-semibold ${o.method === 'GET' ? 'text-success' : 'text-accent'}`}>{o.method}</span>
                <span className="min-w-0"><span className="block break-all font-mono text-[12px]">{o.path}</span><span className="block text-[12px] text-ink-3">{o.summary}</span></span>
              </button>
            ))}
          </aside>
          <section className="card min-w-0 p-4 sm:p-6" aria-label="Bac à sable">
            {op && (
              <>
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-semibold">{op.method}</span><code className="break-all text-[13px]">{op.path}</code></div>
                <p className="mt-1 text-sm text-ink-3">{op.summary}</p>
                <label className="mt-4 block"><span className="text-[13px] font-medium">Jeton</span><input className="input mt-1 font-mono text-[13px]" type="password" autoComplete="off" value={token} placeholder="mlt_… ou ml_…" onChange={(e) => setToken(e.target.value)} /><span className="mt-1 block text-[11px] text-ink-4">Gardé dans cet onglet uniquement (sessionStorage), envoyé seulement à {location.host}.</span></label>
                {op.params.length > 0 && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {op.params.map((x) => (
                      <label key={x.name} className="block min-w-0"><span className="text-[13px] font-medium">{x.name}{x.required && ' *'} <span className="font-normal text-ink-4">({x.in})</span></span><input className="input mt-1 font-mono text-[13px]" value={vals[x.name] ?? ''} placeholder={x.description ?? ''} onChange={(e) => setVals((v) => ({ ...v, [x.name]: e.target.value }))} /></label>
                    ))}
                  </div>
                )}
                {op.method === 'POST' && <label className="mt-3 block"><span className="text-[13px] font-medium">Corps JSON</span><textarea className="input mt-1 min-h-[120px] py-2 font-mono text-[12px]" value={body} onChange={(e) => setBody(e.target.value)} /></label>}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button className="btn-dark" disabled={busy || !token.trim()} onClick={send}>{busy ? 'Envoi…' : 'Envoyer la requête'}</button>
                  <code className="min-w-0 break-all text-[12px] text-ink-3">{curl}</code>
                </div>
                {res && (
                  <div className="mt-4">
                    <div className="mb-1 text-[12px] text-ink-3">Réponse <b className={res.status >= 200 && res.status < 300 ? 'text-success' : 'text-danger'}>{res.status || 'erreur'}</b> · {res.ms} ms</div>
                    <pre className="code max-h-[420px] overflow-auto !p-4 !text-[12px]">{res.text}</pre>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="card min-w-0 p-4 sm:p-6"><h2 className="text-[15px] font-semibold">MCP</h2><p className="mt-1 text-sm text-ink-3">Serveur HTTP <code>{location.origin}/api/mcp</code> (JSON-RPC 2.0). Outils : list_sites, get_stats, top_pages, top_sources, breakdown, realtime, goals, revenue, funnels, bot_traffic, notes, mentions, visitor.</p><pre className="code mt-3 overflow-auto !p-4 !text-[12px]">{JSON.stringify({ mcpServers: { minilytics: { type: 'http', url: `${location.origin}/api/mcp`, headers: { Authorization: 'Bearer mlt_…' } } } }, null, 2)}</pre></div>
          <div className="card min-w-0 p-4 sm:p-6"><h2 className="text-[15px] font-semibold">CLI</h2><p className="mt-1 text-sm text-ink-3">Node 18+, sans dépendance (dossier <code>cli/</code> du dépôt).</p><pre className="code mt-3 overflow-auto !p-4 !text-[12px]">{`minilytics login --host ${location.origin} --token mlt_…
minilytics sites
minilytics stats --site <id> --period 7d
minilytics pages --limit 10 --json
minilytics mcp-config`}</pre></div>
        </section>
      </main>
    </div>
  );
}

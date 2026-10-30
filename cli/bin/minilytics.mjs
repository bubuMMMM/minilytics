#!/usr/bin/env node
// Minilytics CLI — zero dependencies. Uses the public REST API (/api/v1) with a personal token (mlt_…).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'minilytics', 'config.json');
const readConfig = () => { try { return JSON.parse(readFileSync(CONFIG, 'utf8')); } catch { return {}; } };
const args = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v ?? (args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true); }
  else pos.push(a);
}
const cfg = readConfig();
const host = (flags.host || process.env.MINILYTICS_HOST || cfg.host || '').replace(/\/$/, '');
const token = process.env.MINILYTICS_TOKEN || cfg.token;
const site = flags.site || process.env.MINILYTICS_SITE || cfg.site;
const json = !!flags.json;

function die(msg) { console.error('minilytics: ' + msg); process.exit(1); }
async function api(path, init = {}) {
  if (!host) die('aucun hôte. Lancez `minilytics login --host https://votre-instance`');
  if (!token) die('aucun jeton. Créez-en un dans Réglages → API, puis `minilytics login`');
  const r = await fetch(host + '/api/v1' + path, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) die(`${r.status} ${body.error || r.statusText}`);
  return body;
}
const q = (extra = {}) => {
  const p = new URLSearchParams();
  for (const k of ['period', 'from', 'to', 'limit', 'filters']) if (flags[k] !== undefined) p.set(k, String(flags[k]));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? '?' + s : '';
};
const needSite = () => site || die('précisez --site <id> (voir `minilytics sites`) ou `minilytics use <id>`');
const nf = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : String(n ?? '—'));
function table(rows, cols) {
  if (json) return console.log(JSON.stringify(rows, null, 2));
  if (!rows.length) return console.log('(aucune donnée)');
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  for (const r of rows) console.log(cols.map((c, i) => (typeof r[c] === 'number' ? nf(r[c]).padStart(w[i]) : String(r[c] ?? '').padEnd(w[i]))).join('  '));
}
const out = (v) => console.log(JSON.stringify(v, null, 2));

const HELP = `minilytics — vos statistiques dans le terminal

  login --host URL [--token mlt_…]   enregistre l’hôte et le jeton (ou MINILYTICS_HOST / MINILYTICS_TOKEN)
  use <site>                         site par défaut
  sites                              liste des sites
  stats                              visiteurs, visites, pages vues, rebond, durée, revenus
  pages | sources | countries | devices | campaigns | goals
  breakdown <dimension>              n’importe quelle dimension (channel, referrer, city, browser…)
  realtime                           visiteurs en ligne et pages ouvertes
  revenue                            revenus par source
  funnels [id]                       entonnoirs
  visitor <id>                       profil et parcours d’un visiteur
  bots                               trafic des robots IA
  notes [--add "texte"]              annotations
  mcp-config                         configuration MCP pour Claude, Cursor, ChatGPT…
  completion                         complétion bash/zsh

Options : --site ID  --period today|yesterday|7d|30d|month|12mo|all  --from --to  --limit N  --json`;

const BREAKDOWN = { pages: 'page', sources: 'source', countries: 'country', devices: 'device', campaigns: 'campaign' };

const [cmd, ...rest] = pos;
switch (cmd) {
  case undefined: case 'help': console.log(HELP); break;
  case 'login': {
    const t = flags.token || process.env.MINILYTICS_TOKEN || token;
    if (!flags.host && !cfg.host) die('--host requis');
    mkdirSync(join(CONFIG, '..'), { recursive: true });
    writeFileSync(CONFIG, JSON.stringify({ ...cfg, host: (flags.host || cfg.host).replace(/\/$/, ''), token: t }, null, 2), { mode: 0o600 });
    console.log('Configuration enregistrée dans ' + CONFIG + (t ? '' : ' (sans jeton : ajoutez --token)'));
    break;
  }
  case 'use': {
    if (!rest[0]) die('usage : minilytics use <site>');
    mkdirSync(join(CONFIG, '..'), { recursive: true });
    writeFileSync(CONFIG, JSON.stringify({ ...cfg, site: rest[0] }, null, 2), { mode: 0o600 });
    console.log('Site par défaut : ' + rest[0]);
    break;
  }
  case 'sites': { const r = await api('/sites'); table(r.sites ?? r, ['id', 'domain', 'name', 'currency']); break; }
  case 'stats': {
    const r = await api(`/sites/${needSite()}/overview${q()}`);
    if (json) { out(r); break; }
    const c = r.current ?? r;
    for (const [k, l] of [['visitors', 'Visiteurs'], ['sessions', 'Visites'], ['pageviews', 'Pages vues'], ['bounceRate', 'Rebond %'], ['avgDuration', 'Durée moy. (ms)'], ['revenue', 'Revenus (centimes)']]) if (c[k] !== undefined) console.log(l.padEnd(20) + nf(c[k]));
    break;
  }
  case 'pages': case 'sources': case 'countries': case 'devices': case 'campaigns': case 'breakdown': {
    const dim = cmd === 'breakdown' ? rest[0] || die('usage : minilytics breakdown <dimension>') : BREAKDOWN[cmd];
    const r = await api(`/sites/${needSite()}/breakdown/${dim}${q()}`);
    table((r.rows ?? r).map((x) => ({ [dim]: x.label ?? '(aucun)', visitors: x.visitors, pageviews: x.pageviews, revenue: x.revenue })), [dim, 'visitors', 'pageviews', 'revenue']);
    break;
  }
  case 'goals': { const r = await api(`/sites/${needSite()}/goals${q()}`); table(r.rows.map((x) => ({ goal: x.label, visitors: x.visitors, completions: x.pageviews ?? x.count })), ['goal', 'visitors', 'completions']); break; }
  case 'realtime': { const r = await api(`/sites/${needSite()}/realtime`); if (json) out(r); else { console.log(`${nf(r.online ?? r.visitors)} en ligne`); table(r.pages ?? [], Object.keys((r.pages ?? [])[0] ?? { path: 1 })); } break; }
  case 'revenue': { out(await api(`/sites/${needSite()}/revenue${q()}`)); break; }
  case 'funnels': { out(await api(`/sites/${needSite()}/funnels${rest[0] ? '/' + rest[0] : ''}${q()}`)); break; }
  case 'visitor': { out(await api(`/sites/${needSite()}/visitors/${encodeURIComponent(rest[0] || die('usage : minilytics visitor <id>'))}`)); break; }
  case 'bots': { out(await api(`/sites/${needSite()}/bots${q()}`)); break; }
  case 'notes': {
    if (flags.add) out(await api(`/sites/${needSite()}/notes`, { method: 'POST', body: JSON.stringify({ text: String(flags.add), date: flags.date }) }));
    else table(((await api(`/sites/${needSite()}/notes${q()}`)).notes ?? []).map((n) => ({ date: new Date(n.ts).toLocaleString('fr-FR'), text: n.text })), ['date', 'text']);
    break;
  }
  case 'mcp-config': {
    if (!host) die('--host requis');
    out({ mcpServers: { minilytics: { type: 'http', url: host + '/api/mcp', headers: { Authorization: 'Bearer ' + (token ? '<VOTRE_JETON mlt_…>' : '<VOTRE_JETON>') } } } });
    break;
  }
  case 'completion': {
    const words = 'login use sites stats pages sources countries devices campaigns goals breakdown realtime revenue funnels visitor bots notes mcp-config completion help';
    console.log(`complete -W "${words}" minilytics`);
    break;
  }
  default: die(`commande inconnue « ${cmd} ». Voir \`minilytics help\``);
}

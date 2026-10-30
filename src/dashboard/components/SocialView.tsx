import { useMemo, useState } from 'react';
import { api, qs } from '../lib/api';
import { useDash } from '../lib/context';
import { fmtAgo, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { InfoTip } from './InfoTip';
import { StatCard } from './StatCard';
import { UiIcon } from './UiIcon';

interface XLink { url: string; campaign: string | null; content: string | null; ref: string | null }
interface Post {
  id: string; url: string; username: string | null; name: string | null; avatar: string | null; text: string; createdAt: number;
  likes: number; reposts: number; replies: number; quotes: number; bookmarks: number; impressions: number;
  links: XLink[]; tagged: boolean; visitors: number; nearbyVisitors: number;
}
interface SocialReport {
  configured: boolean; query: string;
  sync: { at: number; ok: boolean; error: string | null; found: number } | null;
  x: { visitors: number; sessions: number; pageviews: number; engaged: number };
  networks: { source: string; visitors: number; sessions: number; pageviews: number }[];
  links: { campaign: string | null; content: string | null; ref: string | null; visitors: number; sessions: number; pageviews: number }[];
  landings: { page: string | null; visitors: number }[];
  posts: Post[];
}

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function Bars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-[13px]"><span className="min-w-0 truncate font-medium text-ink-2" title={r.label}>{r.label}</span><span className="tnum shrink-0 text-ink-3">{fmtNumber(r.value)}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function LinkBuilder({ domain }: { domain: string }) {
  const [page, setPage] = useState(`https://${domain}/`);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    try {
      const u = new URL(/^https?:\/\//.test(page) ? page : `https://${page}`);
      u.searchParams.set('utm_source', 'x');
      u.searchParams.set('utm_medium', 'social');
      u.searchParams.set('utm_campaign', slug(name) || 'post-x');
      return u.toString();
    } catch {
      return '';
    }
  }, [page, name]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard refused: the field stays selectable */ }
  };
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
      <label className="block text-[12px] font-medium text-ink-3">Page à partager
        <input className="input mt-1 w-full" inputMode="url" autoComplete="off" spellCheck={false} value={page} onChange={(e) => setPage(e.target.value)} />
      </label>
      <label className="block text-[12px] font-medium text-ink-3">Nom du post (devient la campagne)
        <input className="input mt-1 w-full" autoComplete="off" placeholder="ex. Lancement de la v2…" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row">
        <output className="min-w-0 flex-1 truncate rounded-xl border border-line bg-well px-3 py-2.5 font-mono text-[12px] text-ink-2" translate="no" aria-live="polite">{url || 'Adresse invalide : vérifiez la page à partager.'}</output>
        <button type="button" className="btn-dark shrink-0" onClick={copy} disabled={!url}><UiIcon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copié' : 'Copier le lien'}</button>
      </div>
    </div>
  );
}

function PostCard({ p }: { p: Post }) {
  return (
    <article className="ml-bento flex flex-col gap-3 p-4 sm:p-5">
      <header className="flex items-center gap-3">
        {p.avatar ? <img src={p.avatar} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 rounded-full bg-well" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-well text-[13px] font-semibold text-ink-2">{(p.name || p.username || '?').slice(0, 1).toUpperCase()}</span>}
        <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold text-ink" translate="no">{p.name ?? p.username ?? 'Compte X'}</div><div className="truncate text-[12px] text-ink-3"><span translate="no">@{p.username ?? '—'}</span> · il y a {fmtAgo(Date.now() - p.createdAt)}</div></div>
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn !h-9 shrink-0 !px-3 text-[12px]" aria-label="Voir le post sur X">Voir <UiIcon name="external" size={14} /></a>
      </header>
      <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{p.text}</p>
      <dl className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-[12px] text-ink-3">
        <div className="flex items-center gap-1.5"><UiIcon name="heart" size={14} /><dt className="sr-only">J’aime</dt><dd className="tnum">{fmtNumber(p.likes)}</dd></div>
        <div className="flex items-center gap-1.5"><UiIcon name="repeat" size={14} /><dt className="sr-only">Reposts</dt><dd className="tnum">{fmtNumber(p.reposts + p.quotes)}</dd></div>
        <div className="flex items-center gap-1.5"><UiIcon name="message" size={14} /><dt className="sr-only">Réponses</dt><dd className="tnum">{fmtNumber(p.replies)}</dd></div>
        <div className="flex items-center gap-1.5"><UiIcon name="eye" size={14} /><dt className="sr-only">Vues sur X</dt><dd className="tnum">{p.impressions ? fmtNumber(p.impressions) : '—'}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-well px-3 py-2 text-[12.5px] text-ink-2">
        {p.tagged
          ? <><b className="tnum">{fmtNumber(p.visitors)}</b> visiteur{p.visitors > 1 ? 's' : ''} attribué{p.visitors > 1 ? 's' : ''}<InfoTip text="Visiteurs arrivés par un lien de ce post qui porte une campagne (utm_campaign), un utm_content ou un ref. Compte exact." /></>
          : <><span className="tnum">≈ {fmtNumber(p.nearbyVisitors)}</span> visiteur{p.nearbyVisitors > 1 ? 's' : ''} venus de 𝕏 dans les 24 h<InfoTip text="Estimation : visiteurs venus de X sans lien tagué dans les 24 h qui suivent le post. Partagée avec les autres posts du même jour. Utilisez un lien traçable pour un compte exact." /></>}
        {!p.links.length && <span className="text-ink-3">· cite le site sans lien</span>}
      </div>
    </article>
  );
}

export function SocialView() {
  const { site, q, reloadKey } = useDash();
  const [bump, setBump] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { data, error, loading } = useApi<SocialReport>(`/api/sites/${site.id}/social?${qs(q)}`, reloadKey + bump);
  const sync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api<{ ok: boolean; found: number; error?: string }>(`/api/sites/${site.id}/social/sync`, { method: 'POST' });
      setSyncMsg(r.ok ? `${fmtNumber(r.found)} post${r.found > 1 ? 's' : ''} trouvé${r.found > 1 ? 's' : ''} sur les 7 derniers jours.` : r.error ?? 'Échec de l’actualisation.');
      setBump((b) => b + 1);
    } catch (e) {
      setSyncMsg((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };
  const x = data?.x;
  const linkRows = (data?.links ?? []).map((l) => ({
    label: l.campaign ?? l.content ?? l.ref ?? 'Sans tag (lien t.co ordinaire)', tagged: !!(l.campaign || l.content || l.ref), ...l,
  }));

  return (
    <section className="space-y-5" aria-labelledby="social-title">
      <div>
        <h2 id="social-title" className="text-lg font-semibold tracking-tight">Réseaux sociaux et 𝕏</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-ink-3">Qui vous envoie du trafic depuis les réseaux, quels liens 𝕏 convertissent, et qui parle de <span translate="no">{site.domain}</span> sur 𝕏.</p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">Impossible de charger les données sociales : {error}. Réessayez dans un instant.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard loading={loading && !data} icon="users" accent label="Visiteurs depuis 𝕏" value={x ? fmtNumber(x.visitors) : '—'} hint={x ? `${fmtNumber(x.sessions)} visites` : undefined} help="Visiteurs uniques dont la visite vient de X (t.co, x.com, twitter.com, appli X ou utm_source=x)." />
        <StatCard loading={loading && !data} icon="eye" label="Pages vues depuis 𝕏" value={x ? fmtNumber(x.pageviews) : '—'} hint={x && x.sessions ? `${(x.pageviews / x.sessions).toFixed(1).replace('.', ',')} par visite` : undefined} />
        <StatCard loading={loading && !data} icon="target" label="Visites engagées" value={x && x.sessions ? fmtPct(x.engaged / x.sessions) : '—'} hint="Plus d’une page, un objectif ou 10 s d’activité" />
        <StatCard loading={loading && !data} icon="message" label="Mentions 𝕏" value={data ? (data.configured ? fmtNumber(data.posts.length) : 'À activer') : '—'} hint={data && !data.configured ? 'Clé API X requise' : 'Posts sur la période'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="ml-bento p-5"><h3 className="mb-4 text-[15px] font-semibold">Visiteurs par réseau social</h3><Bars rows={(data?.networks ?? []).map((n) => ({ label: n.source, value: n.visitors }))} empty="Aucune visite venue d’un réseau social sur cette période." /></div>
        <div className="ml-bento p-5"><h3 className="mb-4 text-[15px] font-semibold">Pages d’arrivée depuis 𝕏</h3><Bars rows={(data?.landings ?? []).map((l) => ({ label: l.page ?? '(inconnue)', value: l.visitors }))} empty="Aucune visite venue de 𝕏 sur cette période." /></div>
      </div>

      <div className="ml-bento p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-[15px] font-semibold">Attribution des liens 𝕏</h3><p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-3">X masque le post d’origine (le référent n’est que « t.co »). Pour savoir quel post vous amène des visiteurs, partagez un lien traçable : chaque visite est rattachée à sa campagne, au visiteur près.</p></div></div>
        <LinkBuilder domain={site.domain} />
        <div className="mt-5 overflow-x-auto">
          {linkRows.length ? (
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-ink-3"><th className="py-2 font-semibold">Lien / campagne</th><th className="py-2 text-right font-semibold">Visiteurs</th><th className="hidden py-2 text-right font-semibold sm:table-cell">Visites</th><th className="hidden py-2 text-right font-semibold sm:table-cell">Pages vues</th></tr></thead>
              <tbody>{linkRows.map((l, i) => (
                <tr key={i} className="border-t border-line"><td className="py-2.5 pr-3"><span className={l.tagged ? 'font-medium text-ink' : 'text-ink-3'} translate={l.tagged ? 'no' : undefined}>{l.label}</span>{l.tagged && l.campaign && l.content && <span className="ml-2 text-ink-3" translate="no">· {l.content}</span>}</td><td className="tnum py-2.5 text-right font-semibold">{fmtNumber(l.visitors)}</td><td className="tnum hidden py-2.5 text-right sm:table-cell">{fmtNumber(l.sessions)}</td><td className="tnum hidden py-2.5 text-right sm:table-cell">{fmtNumber(l.pageviews)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="py-4 text-center text-[13px] text-ink-3">Pas encore de visite venue de 𝕏 sur cette période.</p>}
        </div>
      </div>

      <div className="ml-bento p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-[15px] font-semibold">Mentions sur 𝕏</h3><p className="mt-1 text-[13px] text-ink-3">Posts des 7 derniers jours qui partagent un lien vers <span translate="no">{site.domain}</span> ou le citent (reposts exclus).</p></div>
          {data?.configured && <button type="button" className="btn" onClick={sync} disabled={syncing}><UiIcon name="refresh" size={16} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Actualisation…' : 'Actualiser'}</button>}
        </div>
        {data && !data.configured && (
          <div className="rounded-xl border border-accent/30 bg-well p-4 text-[13px] leading-relaxed text-ink-2">
            <p className="flex items-center gap-2 font-semibold text-ink"><UiIcon name="lock" size={16} className="text-accent" /> À activer : une clé de l’API X est nécessaire</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Sur <a className="font-medium text-accent underline" href="https://developer.x.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer">developer.x.com</a>, créez une app avec un accès à la recherche récente (<code translate="no">GET /2/tweets/search/recent</code>, offre payante ou crédits à l’usage).</li>
              <li>Copiez son <b>Bearer token</b> et ajoutez-le dans le projet Vercel sous le nom <code translate="no">X_BEARER_TOKEN</code>, puis redéployez.</li>
              <li>Les mentions se chargent ensuite toutes seules (toutes les 6 h à l’ouverture de cette page, et chaque jour à 7 h).</li>
            </ol>
            <p className="mt-2 text-ink-3">Recherche utilisée : <code className="break-all" translate="no">{data.query}</code>. L’attribution des liens ci-dessus fonctionne déjà, sans clé.</p>
          </div>
        )}
        {data?.configured && data.sync && !data.sync.ok && <div role="alert" className="mb-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">Dernière actualisation en échec : {data.sync.error}</div>}
        {syncMsg && <p className="mb-3 text-[13px] text-ink-2" aria-live="polite">{syncMsg}</p>}
        {data?.configured && (data.posts.length
          ? <div className="grid gap-3 lg:grid-cols-2">{data.posts.map((p) => <PostCard key={p.id} p={p} />)}</div>
          : <p className="py-4 text-center text-[13px] text-ink-3">Aucune mention de <span translate="no">{site.domain}</span> sur 𝕏 sur cette période{data.sync ? ` (vérifié il y a ${fmtAgo(Date.now() - data.sync.at)})` : ''}.</p>)}
      </div>
    </section>
  );
}

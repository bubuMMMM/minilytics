import { useState } from 'react';
import { navigate } from '../App';
import { BOT_CATEGORY_LABEL, type BotCategory } from '../../shared/aibots';
import { qs } from '../lib/api';
import { SNIPPET_TABS, snippet, type SnippetKey } from '../lib/botSnippets';
import { useDash } from '../lib/context';
import { fmtAgo, fmtNumber } from '../lib/format';
import { useMe } from '../lib/me';
import { useApi } from '../lib/useApi';
import { BarList } from './BarList';
import { Favicon } from './Icons';
import { StatCard } from './StatCard';
import { TrendChart } from './TrendChart';
import { UiIcon } from './UiIcon';

interface BotsReport {
  range: { from: number; to: number; granularity: string };
  totals: { hits: number; bots: number; pages: number; lastHitAt: number | null };
  categories: { category: BotCategory; hits: number }[];
  bots: { bot: string; operator: string; category: BotCategory; hits: number; pages: number; last: number }[];
  pages: { path: string | null; hits: number; bots: number; names: string }[];
  series: ({ bucket: string } & Record<BotCategory, number>)[];
  usage: { used: number; limit: number; from: number };
  aiReferrals: {
    visitors: number; sessions: number; pageviews: number; revenue: number; customers: number;
    sources: { label: string; visitors: number; sessions: number }[];
    pages: { label: string | null; visitors: number }[];
    series: { bucket: string; visitors: number }[];
  };
}
interface Setup { endpoint: string; token: string; lastForwardAt: number | null; forwarded: number }

const CAT_COLOR: Record<BotCategory, string> = { training: 'rgb(var(--warning))', search: 'rgb(var(--accent))', assistant: 'rgb(var(--success))' };
const CAT_BADGE: Record<BotCategory, string> = { training: 'border-warning/40 text-warning', search: 'border-accent/40 text-accent', assistant: 'border-success/40 text-success' };
const AI_DOMAIN: Record<string, string> = { ChatGPT: 'chatgpt.com', Claude: 'claude.ai', Perplexity: 'perplexity.ai', Gemini: 'gemini.google.com', Copilot: 'copilot.microsoft.com' };

function SetupPanel({ siteId, open: initial }: { siteId: string; open: boolean }) {
  const [open, setOpen] = useState(initial);
  const [tab, setTab] = useState<SnippetKey>('next');
  const [copied, setCopied] = useState('');
  const [reveal, setReveal] = useState(false);
  const { data, error } = useApi<Setup>(open ? `/api/sites/${siteId}/bots/setup` : null);
  const copy = (k: string, t: string) => navigator.clipboard?.writeText(t).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); });
  const code = data ? snippet(tab, data.endpoint, tab === 'next' || tab === 'express' || tab === 'cloudflare' ? '<votre jeton>' : reveal ? data.token : '<votre jeton>') : '';
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="bots-setup">
      <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <span id="bots-setup" className="block text-[15px] font-semibold tracking-tight">Suivi côté serveur des robots d’IA</span>
          <span className="mt-1 block max-w-3xl text-[13px] leading-relaxed text-ink-3">Les robots n’exécutent pas JavaScript : le script ne les voit presque jamais. Votre serveur (middleware ou journaux) transmet leurs passages à Minilytics, qui ne garde que les robots d’IA reconnus.</span>
        </span>
        <span className={`mt-1 shrink-0 text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`}><UiIcon name="chevron-down" size={18} /></span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {error && <p className="text-[13px] text-ink-3">{error === 'Réservé aux admins' ? 'Le jeton d’envoi est réservé aux admins et au propriétaire.' : error}</p>}
          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-3">
                  <div className="text-[12px] text-ink-3">Adresse d’envoi</div>
                  <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate font-mono text-[12px]">{data.endpoint}</code><button className="btn shrink-0 px-2.5" onClick={() => copy('ep', data.endpoint)} aria-label="Copier l’adresse"><UiIcon name={copied === 'ep' ? 'check' : 'copy'} size={14} /></button></div>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between text-[12px] text-ink-3">Jeton d’envoi (secret, envoi des bots uniquement)<UiIcon name="key" size={14} /></div>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{reveal ? data.token : '•'.repeat(24)}</code>
                    <button className="btn shrink-0 px-2.5" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} aria-label={reveal ? 'Masquer le jeton' : 'Afficher le jeton'}><UiIcon name="eye" size={14} /></button>
                    <button className="btn shrink-0 px-2.5" onClick={() => copy('tk', data.token)} aria-label="Copier le jeton"><UiIcon name={copied === 'tk' ? 'check' : 'copy'} size={14} /></button>
                  </div>
                </div>
              </div>
              <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${data.lastForwardAt ? 'bg-success' : 'bg-line-strong'}`} aria-hidden />
                {data.lastForwardAt ? `Transfert actif : dernier envoi il y a ${fmtAgo(Date.now() - data.lastForwardAt)} (${fmtNumber(data.forwarded)} requêtes reçues).` : 'Aucun envoi reçu pour l’instant : installez l’un des extraits ci-dessous.'}
                {' '}Le jeton change si vous régénérez la clé API du site.
              </p>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="tabs min-w-0 flex-1">
                    {SNIPPET_TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'tab-active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
                  </div>
                  <button className="btn shrink-0 px-2.5" onClick={() => copy('code', code)}><UiIcon name={copied === 'code' ? 'check' : 'copy'} size={14} />{copied === 'code' ? 'Copié' : 'Copier'}</button>
                </div>
                <pre className="max-h-[420px] overflow-auto rounded-lg border border-line bg-well p-3 font-mono text-[12px] leading-relaxed"><code>{code}</code></pre>
                {(tab === 'next' || tab === 'express' || tab === 'cloudflare') && <p className="mt-2 text-[12px] text-ink-3">Le jeton se met dans une variable d’environnement <code className="font-mono">MINILYTICS_BOT_TOKEN</code> (jamais dans le code).</p>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function BotsView() {
  const { site, q, reloadKey, money } = useDash();
  const me = useMe();
  const { data, error } = useApi<BotsReport>(`/api/sites/${site.id}/bots?${qs({ ...q, filters: {} })}`, reloadKey);
  if (error) return <div className="card p-6 text-sm text-danger">{error}</div>;
  const t = data?.totals;
  const usagePct = data ? Math.min(100, (data.usage.used / data.usage.limit) * 100) : 0;
  const ai = data?.aiReferrals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="bot" label="Requêtes de robots IA" loading={!data} value={fmtNumber(t?.hits ?? 0)} hint={t?.lastHitAt ? `Dernière il y a ${fmtAgo(Date.now() - t.lastHitAt)}` : 'Aucune sur la période'} help="Passages de robots d’IA reconnus à leur User-Agent, transmis par votre serveur ou vus par le script. Ils ne comptent jamais comme visiteurs." />
        <StatCard icon="layers" label="Robots distincts" loading={!data} value={fmtNumber(t?.bots ?? 0)} hint={data?.categories.map((c) => `${BOT_CATEGORY_LABEL[c.category].split(' ')[0]} ${fmtNumber(c.hits)}`).join(' · ')} />
        <StatCard icon="file-text" label="Pages explorées" loading={!data} value={fmtNumber(t?.pages ?? 0)} />
        <div className="ml-bento min-w-0 p-4 sm:p-5">
          <div className="text-[12px] font-medium text-ink-3">Forfait · ce mois-ci</div>
          <div className="tnum mt-2 text-2xl font-semibold leading-8 tracking-tight">{data ? fmtNumber(data.usage.used) : '…'}<span className="text-[13px] font-normal text-ink-3"> / 100K</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well" role="progressbar" aria-label="Requêtes de bots IA utilisées ce mois" aria-valuenow={Math.round(usagePct)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${usagePct >= 90 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${usagePct}%` }} /></div>
          <div className="mt-1 text-[12px] text-ink-4">Au-delà de 100 000, les requêtes du mois ne sont plus enregistrées.</div>
        </div>
      </div>

      {me && me.role !== 'viewer' && data && <SetupPanel siteId={site.id} open={data.usage.used === 0 && data.totals.hits === 0} />}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="card min-w-0 p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Passages dans le temps</h2>
          <p className="mb-3 mt-1 text-[12px] text-ink-3">Par type : entraînement des modèles, index de recherche IA, assistants qui lisent une page à la demande d’un utilisateur.</p>
          {data ? (
            <TrendChart height={220} granularity={data.range.granularity} buckets={data.series.map((s) => s.bucket)} series={(['assistant', 'search', 'training'] as BotCategory[]).map((c) => ({ key: c, label: BOT_CATEGORY_LABEL[c], color: CAT_COLOR[c], values: data.series.map((s) => s[c]) }))} />
          ) : <div className="ml-skeleton h-[220px] w-full" />}
        </section>
        <section className="card min-w-0 p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Par robot</h2>
          {data ? (
            <BarList empty="Aucun robot d’IA sur cette période." rows={data.bots.map((b) => ({
              key: b.bot,
              label: <span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{b.bot}</span><span className="hidden truncate text-[12px] text-ink-3 sm:inline">{b.operator}</span><span className={`shrink-0 rounded-full border px-1.5 text-[10px] font-semibold uppercase tracking-wide ${CAT_BADGE[b.category]}`}>{BOT_CATEGORY_LABEL[b.category].split(' ')[0]}</span></span>,
              value: b.hits,
              extra: `${fmtNumber(b.pages)} p.`,
            }))} />
          ) : <div className="ml-skeleton h-40 w-full" />}
        </section>
      </div>

      <section className="card min-w-0 p-4 sm:p-5">
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Pages lues par les robots d’IA</h2>
        {data ? <BarList empty="Aucune page explorée sur cette période." rows={data.pages.map((p) => ({ key: p.path ?? '—', label: <span className="font-mono text-[12px]">{p.path ?? '—'}</span>, value: p.hits, extra: <span className="max-w-[280px] truncate">{p.names}</span> }))} /> : <div className="ml-skeleton h-40 w-full" />}
      </section>

      <section aria-labelledby="ai-traffic" className="pt-2">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ml-kicker">Acquisition</div>
            <h2 id="ai-traffic" className="mt-1 text-lg font-semibold tracking-tight">Trafic depuis l’IA</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-3">Vraies visites (avec le script) arrivées depuis ChatGPT, Perplexity, Claude, Gemini ou Copilot — à ne pas confondre avec les robots ci-dessus.</p>
          </div>
          <button className="btn" onClick={() => navigate(`/site/${site.id}?${qs({ ...q, filters: { ...q.filters, channel: 'AI' } })}`)}>Filtrer le tableau de bord <UiIcon name="arrow-right" size={15} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon="users" label="Visiteurs venus de l’IA" loading={!ai} value={fmtNumber(ai?.visitors ?? 0)} />
          <StatCard icon="activity" label="Visites" loading={!ai} value={fmtNumber(ai?.sessions ?? 0)} hint={ai ? `${fmtNumber(ai.pageviews)} pages vues` : ''} />
          <StatCard icon="target" label="Clients" loading={!ai} value={fmtNumber(ai?.customers ?? 0)} />
          <StatCard icon="zap" label="Revenus attribués" loading={!ai} value={money(ai?.revenue ?? 0, true)} accent />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className="card min-w-0 p-4 sm:p-5 lg:col-span-1">
            <h3 className="mb-3 text-[14px] font-semibold">Assistants</h3>
            {ai ? <BarList empty="Aucune visite venue d’un assistant IA." rows={ai.sources.map((s) => ({ key: s.label, label: <span className="flex items-center gap-2"><Favicon domain={AI_DOMAIN[s.label] ?? null} size={16} />{s.label}</span>, value: s.visitors }))} /> : <div className="ml-skeleton h-32 w-full" />}
          </section>
          <section className="card min-w-0 p-4 sm:p-5">
            <h3 className="mb-3 text-[14px] font-semibold">Pages d’arrivée</h3>
            {ai ? <BarList empty="Aucune page sur cette période." rows={ai.pages.map((p) => ({ key: p.label ?? '—', label: <span className="font-mono text-[12px]">{p.label ?? '—'}</span>, value: p.visitors }))} /> : <div className="ml-skeleton h-32 w-full" />}
          </section>
          <section className="card min-w-0 p-4 sm:p-5">
            <h3 className="mb-3 text-[14px] font-semibold">Visiteurs dans le temps</h3>
            {ai && data ? <TrendChart height={150} granularity={data.range.granularity} buckets={ai.series.map((s) => s.bucket)} series={[{ key: 'v', label: 'Visiteurs venus de l’IA', color: 'rgb(var(--accent))', values: ai.series.map((s) => s.visitors) }]} /> : <div className="ml-skeleton h-[150px] w-full" />}
          </section>
        </div>
      </section>
    </div>
  );
}

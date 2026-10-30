import { useEffect, useMemo, useState } from 'react';
import { UiIcon } from './UiIcon';
import { qs, type Query } from '../lib/api';

type ScrollStep = { milestone: number; sessions: number };
type Counts = {
  sessions: number; pageviews: number; scroll: ScrollStep[];
  activeMs: number; clicks: number; forms: number;
};
type Engagement = {
  updatedAt: number; summary: Counts;
  pages: Array<Counts & { path: string }>;
  internalLinks: Array<{ label: string; count: number }>;
  trackedForms: Array<{ label: string; count: number }>;
  lastPages: Array<{ path: string; sessions: number }>;
};
const nf = (v: number) => new Intl.NumberFormat('fr-FR').format(v);
const secs = (ms: number) => {
  const n = Math.round(ms / 1000);
  return n >= 60 ? Math.floor(n / 60) + ' min ' + (n % 60) + ' s' : n + ' s';
};
const pct = (a: number, b: number) => b ? Math.min(100, Math.round(a / b * 100)) + ' %' : '—';

function Metric({ label, value, caption, icon }: { label: string; value: string; caption: string; icon: 'eye' | 'clock' | 'mouse' | 'target' }) {
  return <div className="min-w-0 rounded-[17px] border border-[#e8edf7] bg-white p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-[#8895ab] sm:text-xs">{label}</span><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f3ff] text-[#596de1]"><UiIcon name={icon} size={17}/></span></div>
    <p className="mt-4 truncate text-[clamp(1.6rem,2.6vw,2.25rem)] font-semibold tracking-[-.06em] tabular-nums text-[#192643]">{value}</p>
    <p className="mt-2 truncate text-[11px] text-[#a0aec2]">{caption}</p>
  </div>;
}

export function EngagementPanel({ siteId, publicSiteId, days = 7, query, reloadKey = 0 }: {
  siteId?: string; publicSiteId?: string; days?: 7 | 30; query?: Query; reloadKey?: number;
}) {
  const [data, setData] = useState<Engagement | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState('');
  const endpoint = useMemo(() => siteId
    ? '/api/sites/' + encodeURIComponent(siteId) + '/engagement?' + (query ? qs(query) : '')
    : '/api/public/engagement?days=' + days + (publicSiteId ? '&site=' + encodeURIComponent(publicSiteId) : ''), [siteId, publicSiteId, query, days]);

  useEffect(() => {
    const ctrl = new AbortController();
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      fetch(endpoint, { credentials: 'same-origin', signal: ctrl.signal, cache: 'no-store' })
        .then(async (r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() as Promise<Engagement>; })
        .then((d) => { if (!ctrl.signal.aborted) { setData(d); setError(''); setLoading(false); } })
        .catch(() => { if (!ctrl.signal.aborted) { setError('Données comportementales indisponibles.'); setLoading(false); } });
    };
    setLoading(true);
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => { ctrl.abort(); window.clearInterval(interval); };
  }, [endpoint, retry, reloadKey]);

  const selectedRow = data?.pages.find((p) => p.path === selected) ?? null;
  const focus = selectedRow ?? data?.summary;
  const denominator = focus?.sessions ?? 0;
  const dataAvailable = !!data?.pages.length;
  const allRows = data?.pages ?? [];
  const rows = allRows.slice(0, 12);
  const scroll = focus?.scroll ?? [25,50,75,90,100].map((m) => ({ milestone:m, sessions:0 }));
  const observed = scroll.some((v) => v.sessions > 0) || (focus?.activeMs ?? 0) > 0;
  const source = [
    { label: 'Liens internes cliqués', count: focus?.clicks ?? 0, icon: 'mouse' as const },
    { label: 'Formulaires suivis', count: focus?.forms ?? 0, icon: 'target' as const },
  ];

  return <div className="space-y-4" aria-busy={loading}>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Metric label="Pages analysées" value={data ? nf(data.pages.length) : '—'} caption="Pages avec des visites" icon="eye"/>
      <Metric label="Temps actif moyen / vue" value={data && data.summary.pageviews ? secs(data.summary.activeMs / data.summary.pageviews) : '—'} caption="Mesure estimée, hors onglet inactif" icon="clock"/>
      <Metric label="Clics internes" value={data ? nf(data.summary.clicks) : '—'} caption="Navigation entre les pages" icon="mouse"/>
      <Metric label="Formulaires suivis" value={data ? nf(data.summary.forms) : '—'} caption="Soumissions explicitement marquées" icon="target"/>
    </div>
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ffd9dd] bg-[#fff6f6] px-4 py-3 text-[13px] text-[#a65363]" role="alert"><span>{error}</span><button className="btn !text-xs" onClick={() => setRetry(v => v + 1)}>Réessayer</button></div>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.28fr)_minmax(300px,.9fr)]">
      <section className="ml-bento min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-[17px] font-semibold tracking-tight">Jusqu'où scrollent les visiteurs ?</h3><p className="mt-1 text-[12px] text-[#96a3b7]">Profondeur maximale atteinte dans une session, par page</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f0f3ff] px-3 py-1.5 text-[11px] font-semibold text-[#5f70df]"><UiIcon name="bar-chart" size={14} /> Scroll depth</span>
        </div>
        <div className="mt-6">
          <label htmlFor={siteId ? 'ml-scroll-page-private' : 'ml-scroll-page-public'} className="mb-2 block text-[12px] font-semibold text-[#66738d]">Page à analyser</label>
          <select id={siteId ? 'ml-scroll-page-private' : 'ml-scroll-page-public'} className="input !py-2.5" value={selectedRow ? selected : ''} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Toutes les pages (sessions uniques)</option>
            {allRows.map((p) => <option key={p.path} value={p.path}>{p.path} · {nf(p.pageviews)} vues</option>)}
          </select>
        </div>
        <div className="mt-7 space-y-5">
          {scroll.map(({milestone, sessions}, index) => {
            const width = denominator ? Math.min(100, sessions / denominator * 100) : 0;
            return <div key={milestone}>
              <div className="mb-2 flex items-center justify-between text-[13px]"><span className="flex items-center gap-2.5 font-semibold text-[#43506a]"><span className="w-8 text-right font-mono text-[#8996ab]">{milestone}%</span><span className="font-normal text-[#8491a6]">{index === 0 ? 'Début de lecture' : index === 4 ? 'Bas de page' : index === 3 ? 'Presque au bout' : 'Page parcourue'}</span></span><span className="tabular-nums font-semibold text-[#566beb]">{denominator ? pct(sessions, denominator) : '—'}<span className="ml-2 text-[11px] font-normal text-[#a3aec0]">({nf(sessions)})</span></span></div>
              <div className="h-3 overflow-hidden rounded-full bg-[#eef1f8]"><div className="h-full rounded-full bg-gradient-to-r from-[#a4b4ff] to-[#5066ee] transition-[width] duration-500" style={{width: width + '%'}}/></div>
            </div>;
          })}
        </div>
        <div className="mt-7 rounded-[14px] border border-[#edf0fb] bg-[#f8faff] p-4 text-[12px] leading-relaxed text-[#7c89a4]">
          <span className="mb-1.5 block font-semibold text-[#516489]">{selectedRow ? selectedRow.path : 'Vue globale'} · {nf(denominator)} sessions</span>
          {observed ? 'Chaque taux correspond à la part des sessions ayant atteint ce seuil, sur la sélection.' : 'Les seuils seront renseignés au fil des nouveaux scrolls. L’historique antérieur à cette fonctionnalité ne peut pas être reconstitué.'}
        </div>
      </section>
      <section className="ml-bento min-w-0 p-5 sm:p-7">
        <div><h3 className="text-[17px] font-semibold tracking-tight">Engagement par page</h3><p className="mt-1 text-[12px] text-[#96a3b7]">Temps actif estimé, lecture et interactions</p></div>
        <div className="mt-6 grid grid-cols-2 gap-3 rounded-[16px] bg-[#f7f9fe] p-4">
          <div className="border-r border-[#e6ebf5] pr-2"><p className="text-[11px] text-[#99a5b8]">Temps actif / vue</p><p className="mt-2 text-[28px] font-semibold tracking-tight text-[#27355d]">{focus?.pageviews && focus.activeMs ? secs(focus.activeMs / focus.pageviews) : '—'}</p></div>
          <div className="pl-2"><p className="text-[11px] text-[#99a5b8]">Vues de pages</p><p className="mt-2 text-[28px] font-semibold tracking-tight text-[#27355d]">{focus ? nf(focus.pageviews) : '—'}</p></div>
        </div>
        <div className="mt-6 space-y-4">
          {source.map((item) => <div key={item.label} className="flex items-center justify-between gap-3 border-b border-[#f1f3f8] pb-4"><span className="flex items-center gap-2 text-[12px] font-medium text-[#76849b]"><UiIcon name={item.icon} size={17} className="text-[#6d80ee]"/>{item.label}</span><b className="font-semibold tabular-nums text-[#303e5c]">{nf(item.count)}</b></div>)}
        </div>
        <h4 className="mt-7 text-[13px] font-semibold text-[#445270]">Pages les plus consultées</h4>
        <div className="mt-3 max-h-[250px] space-y-1 overflow-auto">
          {rows.length ? rows.map((row) => <button key={row.path} onClick={() => setSelected(row.path)} className={'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[12px] transition hover:bg-[#f4f6ff] ' + (selected === row.path ? 'bg-[#f0f3ff] text-[#4c62dc]' : 'text-[#77849b]')}><span className="min-w-0 truncate font-medium" title={row.path}>{row.path}</span><span className="shrink-0 font-semibold tabular-nums">{nf(row.pageviews)} vues</span></button>)
            : <p className="rounded-lg border border-dashed border-[#e7eaf2] p-5 text-center text-[12px] text-[#9da8ba]">{dataAvailable ? 'Aucune page sélectionnable.' : 'Les premières visites apparaîtront ici.'}</p>}
        </div>
      </section>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      {[
        { title: 'Liens internes', description: 'Destinations les plus cliquées', rows: data?.internalLinks.map(r=>({label:r.label, value:r.count})) ?? [] },
        { title: 'Formulaires', description: 'Soumissions déclarées par le site', rows: data?.trackedForms.map(r=>({label:r.label, value:r.count})) ?? [] },
        { title: 'Dernières pages de session', description: 'Dernière page connue, pas nécessairement une sortie', rows: data?.lastPages.map(r=>({label:r.path, value:r.sessions})) ?? [] },
      ].map(group => <section key={group.title} className="ml-bento min-w-0 p-5 sm:p-6">
        <h4 className="text-[14px] font-semibold tracking-tight">{group.title}</h4><p className="mt-1 text-[11px] text-[#9ba7b9]">{group.description}</p>
        {group.rows.length ? <div className="mt-5 space-y-3">{group.rows.slice(0, 7).map((r,i)=><div key={r.label+i} className="flex items-center justify-between gap-4 text-[12px]"><span className="min-w-0 truncate text-[#77859b]" title={r.label}>{r.label}</span><span className="shrink-0 font-semibold tabular-nums text-[#43526d]">{nf(r.value)}</span></div>)}</div> : <p className="mt-5 rounded-xl bg-[#f8faff] px-4 py-8 text-center text-[12px] text-[#9ba7b9]">Aucune interaction enregistrée sur cette période.</p>}
      </section>)}
    </div>
    <p className="px-1 text-[11px] leading-relaxed text-[#96a2b5]">Le suivi du scroll et du temps actif démarre avec la nouvelle version du script. Les données précédentes restent intactes ; aucune profondeur de lecture n'est estimée rétroactivement. Le temps actif est une estimation basée sur l'onglet visible et les interactions récentes. Aucun contenu de formulaire n'est collecté.</p>
  </div>;
}

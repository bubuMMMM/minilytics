import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { navigate } from '../App';
import { OverviewCard } from '../components/OverviewCard';
import { Panel, type TabDef } from '../components/Panel';
import { Dropdown, PERIODS } from '../components/Toolbar';
import { ThemeToggle } from '../components/ThemeToggle';
import { Favicon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { UiIcon } from '../components/UiIcon';
import { filterParts, qs, type Overview, type Site } from '../lib/api';
import { DashContext, type Dash } from '../lib/context';
import { channelName, countryName, fmtMoney } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useQueryState } from '../lib/useQueryState';
import { VIEW_LABEL } from './labels';

const MapPage = lazy(() => import('../map/MapPage').then((m) => ({ default: m.MapPage })));

type View = 'overview' | 'sources' | 'pages' | 'map' | 'tech' | 'goals';
interface Hide { revenue: boolean; cities: boolean; referrers: boolean }
type Meta =
  | { locked: true; label: string; site: { name: string; domain: string }; noindex: boolean }
  | { locked: false; label: string; views: View[]; hide: Hide; noindex: boolean; expiresAt: number | null; site: { name: string; domain: string; timezone: string; currency: string; created_at: number } };


/** Tabs per view; mirrors the server whitelist (src/worker/share.ts) so nothing forbidden is ever requested. */
function tabsFor(view: View, hide: Hide): { title: string; tabs: TabDef[] }[] {
  const all: Record<Exclude<View, 'overview'>, { title: string; tabs: TabDef[] }[]> = {
    sources: [{ title: 'Sources', tabs: [
      { label: 'Canal', dim: 'channel', filter: 'channel' }, { label: 'Référent', dim: 'source', filter: 'source' },
      { label: 'Campagne', dim: 'campaign', filter: 'utm_campaign' }, { label: 'UTM source', dim: 'utm_source', filter: 'utm_source' },
      { label: 'UTM medium', dim: 'utm_medium', filter: 'utm_medium' }, { label: 'Mot-clé', dim: 'keyword', filter: 'utm_term' },
      ...(hide.referrers ? [] : [{ label: 'URL référente', dim: 'referrer' }]), { label: 'Ref', dim: 'ref', filter: 'ref' },
    ] }],
    pages: [{ title: 'Pages', tabs: [
      { label: 'Top pages', dim: 'page', filter: 'page' }, { label: 'Entrée', dim: 'entry_page', filter: 'entry_page' },
      { label: 'Sortie', dim: 'exit_page', filter: 'exit_page' }, { label: 'Liens sortants', dim: 'exit_link' }, { label: 'Domaine', dim: 'hostname', filter: 'hostname' },
    ] }],
    map: [{ title: 'Localisation', tabs: [{ label: 'Pays', dim: 'country', filter: 'country' }, ...(hide.cities ? [] : [{ label: 'Région', dim: 'region', filter: 'region' }, { label: 'Ville', dim: 'city', filter: 'city' }])] }],
    tech: [{ title: 'Technologie', tabs: [
      { label: 'Appareil', dim: 'device', filter: 'device' }, { label: 'Navigateur', dim: 'browser', filter: 'browser' }, { label: 'OS', dim: 'os', filter: 'os' },
      { label: 'Écran', dim: 'screen', filter: 'screen' }, { label: 'Langue', dim: 'language', filter: 'language' }, { label: 'Nouveaux / récurrents', dim: 'visitor_type', filter: 'visitor_type' },
    ] }],
    goals: [{ title: 'Objectifs', tabs: [{ label: 'Objectifs', dim: 'goal', filter: 'goal' }] }],
  };
  return view === 'overview' ? [] : all[view];
}

function setRobots(noindex: boolean) {
  let m = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); }
  m.content = noindex ? 'noindex, nofollow' : 'index, follow';
}

export function SharePage({ token, view: viewParam }: { token: string; view?: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<{ status: number; message: string } | null>(null);
  const load = useCallback(() => {
    fetch(`/api/share/${token}`, { credentials: 'same-origin' })
      .then(async (r) => { const b: any = await r.json().catch(() => ({})); if (!r.ok) setErr({ status: r.status, message: b.error ?? 'Lien indisponible' }); else { setErr(null); setMeta(b); } })
      .catch(() => setErr({ status: 0, message: 'Connexion impossible. Réessayez.' }));
  }, [token]);
  useEffect(load, [load]);
  useEffect(() => { setRobots(meta ? meta.noindex : true); return () => { document.querySelector('meta[name="robots"]')?.remove(); }; }, [meta]);
  useEffect(() => { if (meta) document.title = `${meta.site.name} · Statistiques — Minilytics`; }, [meta]);

  if (err) return <Centered><Status title={err.status === 410 ? 'Lien expiré' : err.status === 404 ? 'Lien introuvable' : 'Indisponible'} text={err.message} /></Centered>;
  if (!meta) return <Centered><div className="ml-loading h-40 w-full max-w-sm rounded-xl" aria-busy="true" /></Centered>;
  if (meta.locked) return <Centered><Unlock token={token} meta={meta} onDone={load} /></Centered>;
  const view: View = meta.views.includes(viewParam as View) ? (viewParam as View) : 'overview';
  return <SharedDashboard token={token} meta={meta} view={view} />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas text-ink">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6"><a href="/" className="flex min-h-[44px] items-center" aria-label="Minilytics"><Logo small /></a><ThemeToggle /></header>
      <main id="contenu" className="flex flex-1 items-center justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
function Status({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-sm text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink-3"><UiIcon name="lock" size={18} /></span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-ink-3">{text}</p>
      <p className="mt-4 text-[12px] text-ink-4">Demandez un nouveau lien à la personne qui vous l’a envoyé.</p>
    </div>
  );
}

function Unlock({ token, meta, onDone }: { token: string; meta: { label: string; site: { name: string; domain: string } }; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/share/${token}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }), credentials: 'same-origin' });
      const b: any = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b.error ?? 'Mot de passe incorrect'); setPw(''); return; }
      onDone();
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-6">
      <div className="flex items-center gap-3">
        <Favicon domain={meta.site.domain} size={28} />
        <div className="min-w-0"><div className="truncate font-semibold">{meta.site.name}</div><div className="truncate font-mono text-[12px] text-ink-3">{meta.site.domain}</div></div>
      </div>
      <h1 className="mt-5 text-[15px] font-semibold">Tableau de bord protégé</h1>
      <p className="mt-1 text-[13px] text-ink-3">Saisissez le mot de passe communiqué avec ce lien.</p>
      <label className="mt-4 block text-[12px] font-medium text-ink-2" htmlFor="share-pw">Mot de passe</label>
      <input id="share-pw" type="password" className="input mt-1.5" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus required maxLength={200} aria-invalid={!!error} aria-describedby={error ? 'share-pw-err' : undefined} />
      {error && <p id="share-pw-err" className="mt-2 text-[12px] text-danger" role="alert">{error}</p>}
      <button className="btn-dark mt-4 w-full justify-center" disabled={busy || !pw}>{busy ? 'Vérification…' : 'Ouvrir le tableau de bord'}</button>
    </form>
  );
}

function PeriodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = PERIODS.filter((p) => p.value !== 'now');
  return (
    <Dropdown align="right" button={
      <button type="button" className="btn">{options.find((p) => p.value === value)?.label ?? 'Période personnalisée'}<UiIcon name="chevron-down" size={14} /></button>
    }>
      {(close) => options.map((p) => (
        <button key={p.value} className={`flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm hover:bg-well sm:min-h-[36px] ${p.value === value ? 'font-medium text-ink' : 'text-ink-2'}`} onClick={() => { close(); onChange(p.value); }}>{p.label}</button>
      ))}
    </Dropdown>
  );
}

const FILTER_LABEL: Record<string, string> = { channel: 'Canal', source: 'Référent', utm_campaign: 'Campagne', utm_source: 'UTM source', utm_medium: 'UTM medium', utm_term: 'Mot-clé', ref: 'Ref', page: 'Page', entry_page: 'Entrée', exit_page: 'Sortie', hostname: 'Domaine', country: 'Pays', region: 'Région', city: 'Ville', device: 'Appareil', browser: 'Navigateur', os: 'OS', screen: 'Écran', language: 'Langue', visitor_type: 'Visiteurs', goal: 'Objectif' };

function SharedDashboard({ token, meta, view }: { token: string; meta: Extract<Meta, { locked: false }>; view: View }) {
  const [q, update] = useQueryState();
  const base = `/api/share/${token}`;
  const period = q.period === 'now' ? '30d' : q.period;
  const query = useMemo(() => ({ ...q, period }), [q, period]);
  const { data: overview } = useApi<Overview>(view === 'overview' ? `${base}/overview?${qs(query)}` : null);
  const site = useMemo(() => ({ id: 'share', api_key: '', dodo_webhook_secret: null, ...meta.site }) as Site, [meta.site]);
  const addFilter = useCallback((key: string, value: string) => update({ filters: { ...q.filters, [key]: value } }), [q.filters, update]);
  const dash: Dash = useMemo(() => ({
    site, q: query, reloadKey: 0, decimals: overview?.decimals ?? 2,
    money: (minor, compact) => fmtMoney(minor, site.currency, overview?.decimals ?? 2, compact),
    addFilter, openVisitor: () => {}, share: { base, hideRevenue: meta.hide.revenue },
  }), [site, query, overview?.decimals, addFilter, base, meta.hide.revenue]);

  const go = (v: View) => navigate(`/share/${token}${v === 'overview' ? '' : '/' + v}${window.location.search}`);
  const nav = (
    <nav className="-mb-px flex gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Vues partagées">
      {meta.views.map((v) => (
        <a key={v} href={`/share/${token}${v === 'overview' ? '' : '/' + v}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(v); }}
          aria-current={v === view ? 'page' : undefined}
          className={`flex min-h-[44px] shrink-0 items-center border-b-2 px-2.5 text-[13px] transition-colors ${v === view ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>{VIEW_LABEL[v]}</a>
      ))}
    </nav>
  );
  const header = (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Favicon domain={meta.site.domain} size={22} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[14px] font-semibold" translate="no">{meta.site.name}</div>
            <div className="truncate text-[11px] text-ink-3"><span className="font-mono" translate="no">{meta.site.domain}</span><span className="hidden sm:inline"> · Tableau de bord partagé, lecture seule</span></div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <a href="/?ref=share" className="hidden min-h-[36px] items-center gap-2 rounded-lg px-2 text-[12px] text-ink-3 hover:text-ink sm:inline-flex" target="_blank" rel="noopener">Propulsé par <Logo small /></a>
        </div>
      </div>
      {nav}
    </header>
  );

  if (view === 'map') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-canvas">{header}</div>}>
        <MapPage share={{ token, header, cities: !meta.hide.cities, title: meta.site.name }} />
      </Suspense>
    );
  }

  const filters = Object.entries(q.filters);
  const sections = view === 'overview'
    ? (['sources', 'pages'] as View[]).filter((v) => meta.views.includes(v)).flatMap((v) => tabsFor(v, meta.hide))
    : tabsFor(view, meta.hide);
  const expires = meta.expiresAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: meta.site.timezone }).format(meta.expiresAt) : null;

  return (
    <DashContext.Provider value={dash}>
      <div className="ml-site-bg min-h-screen pb-12 text-ink">
        {header}
        <main id="contenu" className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:py-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{VIEW_LABEL[view]}</h1>
              <p className="mt-1 text-[13px] text-ink-3">Heures en {meta.site.timezone}{expires ? ` · lien valable jusqu’au ${expires}` : ''}</p>
            </div>
            <PeriodSelect value={period} onChange={(v) => update({ period: v })} />
          </div>
          {filters.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filtres actifs">
              {filters.map(([k, v]) => {
                const f = filterParts(v);
                const label = k === 'country' ? countryName(f.v) : k === 'channel' ? channelName(f.v) : f.v;
                return (
                  <button key={k} className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-[12px] hover:border-line-strong"
                    onClick={() => { const { [k]: _drop, ...rest } = q.filters; update({ filters: rest }); }} aria-label={`Retirer le filtre ${FILTER_LABEL[k] ?? k}`}>
                    <span className="text-ink-3">{FILTER_LABEL[k] ?? k} {f.op === 'not' ? 'n’est pas' : f.op === 'contains' ? 'contient' : 'est'}</span><span className="font-medium">{label}</span><span aria-hidden className="text-ink-4">✕</span>
                  </button>
                );
              })}
              <button className="btn-ghost text-[12px]" onClick={() => update({ filters: {} })}>Tout effacer</button>
            </div>
          )}
          {view === 'overview' && <OverviewCard data={overview} />}
          {sections.length > 0 && (
            <div className={`grid gap-5 ${view === 'overview' ? 'mt-5' : ''} ${sections.length > 1 ? 'lg:grid-cols-2' : ''}`}>
              {sections.map((s) => <Panel key={s.title + view} title={s.title} tabs={s.tabs} />)}
            </div>
          )}
          <p className="mt-8 text-center text-[12px] text-ink-4">
            Statistiques agrégées et anonymes{meta.hide.revenue ? ', sans revenus' : ''}. Aucun profil de visiteur n’est partagé. ·{' '}
            <a href="/?ref=share" className="underline-offset-2 hover:underline" target="_blank" rel="noopener">Minilytics</a>
          </p>
        </main>
      </div>
    </DashContext.Provider>
  );
}

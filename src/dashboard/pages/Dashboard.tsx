import { useCallback, useMemo, useState } from 'react';
import { navigate } from '../App';
import { GoalsPanel } from '../components/GoalsPanel';
import { LiveGlobe } from '../components/LiveGlobe';
import { EngagementPanel } from '../components/EngagementPanel';
import { Logo } from '../components/Logo';
import { UiIcon } from '../components/UiIcon';
import { OverviewCard } from '../components/OverviewCard';
import { Panel, renderLabel } from '../components/Panel';
import { Toolbar } from '../components/Toolbar';
import { VisitorModal } from '../components/VisitorModal';
import { qs, type Overview, type Site } from '../lib/api';
import { DashContext, type Dash } from '../lib/context';
import { fmtMoney } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useQueryState } from '../lib/useQueryState';

const FILTER_LABELS: Record<string, { label: string; dim: string }> = {
  channel: { label: 'Channel', dim: 'channel' },
  source: { label: 'Referrer', dim: 'source' },
  utm_campaign: { label: 'Campaign', dim: 'campaign' },
  utm_term: { label: 'Keyword', dim: 'keyword' },
  utm_source: { label: 'UTM source', dim: 'utm_source' },
  utm_medium: { label: 'UTM medium', dim: 'utm_medium' },
  ref: { label: 'Ref', dim: 'ref' },
  country: { label: 'Country', dim: 'country' },
  region: { label: 'Region', dim: 'region' },
  city: { label: 'City', dim: 'city' },
  browser: { label: 'Browser', dim: 'browser' },
  os: { label: 'OS', dim: 'os' },
  device: { label: 'Device', dim: 'device' },
  page: { label: 'Visited page', dim: 'page' },
  entry_page: { label: 'Entry page', dim: 'entry_page' },
  hostname: { label: 'Hostname', dim: 'hostname' },
  goal: { label: 'Completed goal', dim: 'goal' },
};

export function Dashboard({ siteId }: { siteId: string }) {
  const [q, update] = useQueryState();
  const [reloadKey, setReloadKey] = useState(0);
  const [visitor, setVisitor] = useState<string | null>(null);
  const { data: sites } = useApi<Site[]>('/api/sites');
  const site = sites?.find((s) => s.id === siteId);
  const { data: overview, loading } = useApi<Overview>(site ? `/api/sites/${siteId}/overview?${qs(q)}` : null, reloadKey);

  const addFilter = useCallback((key: string, value: string) => update({ filters: { ...q.filters, [key]: value } }), [q.filters, update]);
  const removeFilter = (key: string) => {
    const { [key]: _, ...rest } = q.filters;
    update({ filters: rest });
  };

  const dash: Dash | null = useMemo(() => {
    if (!site) return null;
    const decimals = overview?.decimals ?? 2;
    return {
      site,
      q,
      reloadKey,
      decimals,
      money: (minor, compact) => fmtMoney(minor, site.currency, decimals, compact),
      addFilter,
      openVisitor: setVisitor,
    };
  }, [site, q, reloadKey, overview?.decimals, addFilter]);

  if (sites && !site) {
    return (
      <div className="p-10 text-center">
        Site not found.{' '}
        <button className="underline" onClick={() => navigate('/sites')}>
          Back to websites
        </button>
      </div>
    );
  }
  if (!dash || !site) return null;

  return (
    <DashContext.Provider value={dash}>
      <div className="ml-site-bg min-h-screen pb-10">
        <header className="border-b border-[#e8edf5] bg-[#ffffff]/85">
          <div className="mx-auto flex h-[76px] max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6">
            <button aria-label="Retour aux sites" onClick={() => navigate('/sites')}><Logo /></button>
            <div className="flex items-center gap-2"><button className="btn hidden sm:inline-flex" onClick={() => navigate('/')}>Voir la démo <UiIcon name="external" size={16}/></button><button className="btn" onClick={() => navigate('/sites')}><UiIcon name="layers" size={16}/><span className="hidden sm:inline">Mes sites</span></button><button className="btn-dark" onClick={() => navigate('/site/' + site.id + '/settings')}><UiIcon name="shield" size={16}/><span className="hidden sm:inline">Réglages</span></button></div>
          </div>
        </header>
        <div className="mx-auto max-w-[1480px] px-4 py-9 sm:px-6 lg:py-12">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div><div className="ml-kicker"><span className="ml-dot" /> ANALYSE / VOTRE SITE</div><h1 className="ml-heading mt-3 text-[clamp(2.3rem,4.4vw,3.7rem)]">{site.name}<span className="text-[#4f62ef]">.</span></h1><p className="mt-3 text-[13px] text-[#8290a3]">Les performances et connexions de <span className="font-medium text-[#56657e]">{site.domain}</span></p></div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8f2e7] bg-[#f1fbf6] px-4 py-2 text-[12px] font-semibold text-[#179569]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#1bb985]"/>{overview ? overview.online + ' en ligne maintenant' : 'Données en temps réel'}</div>
          </div>
          <div className="ml-panel mb-5 flex flex-wrap items-center gap-2 p-3 sm:p-4">
            <Toolbar site={site} sites={sites!} q={q} update={update} overview={overview} onRefresh={() => setReloadKey((k) => k + 1)} loading={loading} />
          </div>

        {Object.keys(q.filters).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {Object.entries(q.filters).map(([k, v]) => (
              <span key={k} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white py-1 pl-3 pr-1 text-sm shadow-card">
                <span className="text-stone-500">{FILTER_LABELS[k]?.label ?? k} is</span>
                <span className="flex items-center gap-1.5 font-medium">{renderLabel(FILTER_LABELS[k]?.dim ?? k, { label: v || null })}</span>
                <button className="rounded-lg px-1.5 text-stone-400 hover:bg-stone-100 hover:text-ink" onClick={() => removeFilter(k)} aria-label="Remove filter">
                  ✕
                </button>
              </span>
            ))}
            <button className="text-sm text-stone-500 underline-offset-2 hover:underline" onClick={() => update({ filters: {} })}>
              Clear all
            </button>
          </div>
        )}

        <div className="mt-5">
          <OverviewCard data={overview} />
        </div>

        <section className="mt-7 scroll-mt-[110px]" aria-label="Analyse comportementale">
          <div className="mb-5">
            <div className="ml-kicker">COMPORTEMENT / ENGAGEMENT</div>
            <h2 className="mt-2 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-.045em]">Découvrez comment vos pages sont parcourues<span className="text-[#4f62ef]">.</span></h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8290a3]">Scroll, temps actif réel, liens cliqués et pages de fin de session — filtrés sur la même période et les mêmes segments que vos statistiques.</p>
          </div>
          <EngagementPanel siteId={siteId} query={q} reloadKey={reloadKey}/>
        </section>
        <LiveGlobe siteId={siteId} />

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel
            tabs={[
              { label: 'Channel', dim: 'channel', filter: 'channel' },
              { label: 'Referrer', dim: 'source', filter: 'source' },
              { label: 'Campaign', dim: 'campaign', filter: 'utm_campaign' },
              { label: 'Keyword', dim: 'keyword', filter: 'utm_term' },
            ]}
          />
          <Panel
            tabs={[
              { label: 'Country', dim: 'country', filter: 'country' },
              { label: 'Region', dim: 'region', filter: 'region' },
              { label: 'City', dim: 'city', filter: 'city' },
            ]}
          />
          <Panel
            tabs={[
              { label: 'Page', dim: 'page', filter: 'page' },
              { label: 'Entry page', dim: 'entry_page', filter: 'entry_page' },
              { label: 'Exit link', dim: 'exit_link' },
              { label: 'Hostname', dim: 'hostname', filter: 'hostname' },
            ]}
          />
          <Panel
            tabs={[
              { label: 'Browser', dim: 'browser', filter: 'browser' },
              { label: 'OS', dim: 'os', filter: 'os' },
              { label: 'Device', dim: 'device', filter: 'device' },
            ]}
          />
        </div>

        <div className="mt-5">
          <GoalsPanel totalVisitors={overview?.current.visitors ?? 0} />
        </div>

        <p className="mt-8 text-center text-xs text-stone-400">
          Times in {site.timezone} · Revenue in {site.currency} ·{' '}
          <button className="underline-offset-2 hover:underline" onClick={() => navigate(`/site/${site.id}/settings`)}>
            Settings & install
          </button>
        </p>
        </div>
      </div>
      <VisitorModal key={visitor ?? 'none'} visitorId={visitor} onClose={() => setVisitor(null)} />
    </DashContext.Provider>
  );
}

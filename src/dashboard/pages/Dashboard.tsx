import { useCallback, useMemo, useState } from 'react';
import { navigate } from '../App';
import { GoalsPanel } from '../components/GoalsPanel';
import { LiveGlobe } from '../components/LiveGlobe';
import { EngagementPanel } from '../components/EngagementPanel';
import { Logo } from '../components/Logo';
import { LiveDot } from '../components/Sparkline';
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
  channel: { label: 'Canal', dim: 'channel' },
  source: { label: 'Référent', dim: 'source' },
  utm_campaign: { label: 'Campagne', dim: 'campaign' },
  utm_term: { label: 'Mot-clé', dim: 'keyword' },
  utm_source: { label: 'UTM source', dim: 'utm_source' },
  utm_medium: { label: 'UTM medium', dim: 'utm_medium' },
  ref: { label: 'Ref', dim: 'ref' },
  country: { label: 'Pays', dim: 'country' },
  region: { label: 'Région', dim: 'region' },
  city: { label: 'Ville', dim: 'city' },
  browser: { label: 'Navigateur', dim: 'browser' },
  os: { label: 'OS', dim: 'os' },
  device: { label: 'Appareil', dim: 'device' },
  page: { label: 'Page visitée', dim: 'page' },
  entry_page: { label: 'Page d’entrée', dim: 'entry_page' },
  hostname: { label: 'Domaine', dim: 'hostname' },
  goal: { label: 'Objectif atteint', dim: 'goal' },
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
            <div className="flex items-center gap-2"><button className="btn hidden sm:inline-flex" onClick={() => navigate('/')}>Voir la démo <UiIcon name="external" size={16}/></button><button className="btn" onClick={() => navigate('/site/' + site.id + '/realtime')}><LiveDot on={!!overview?.online} /><span className="hidden sm:inline">Temps réel</span></button><button className="btn" onClick={() => navigate('/sites')}><UiIcon name="layers" size={16}/><span className="hidden sm:inline">Mes sites</span></button><button className="btn-dark" onClick={() => navigate('/site/' + site.id + '/settings')}><UiIcon name="shield" size={16}/><span className="hidden sm:inline">Réglages</span></button></div>
          </div>
        </header>
        <div className="mx-auto max-w-[1480px] px-4 py-9 sm:px-6 lg:py-12">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div><div className="ml-kicker"><span className="ml-dot" /> ANALYSE / VOTRE SITE</div><h1 className="ml-heading mt-3 text-[clamp(2.3rem,4.4vw,3.7rem)]">{site.name}<span className="text-[#4f62ef]">.</span></h1><p className="mt-3 text-[13px] text-[#8290a3]">Les performances et connexions de <span className="font-medium text-[#56657e]">{site.domain}</span></p></div>
            <button onClick={() => navigate('/site/' + site.id + '/realtime')} title="Ouvrir la vue temps réel" className="inline-flex items-center gap-2 rounded-full border border-[#d8f2e7] bg-[#f1fbf6] px-4 py-2 text-[12px] font-semibold text-[#179569] transition hover:border-[#bfe9d6] hover:bg-[#e8f8f0]"><LiveDot on={!!overview?.online} />{overview ? overview.online + ' en ligne maintenant' : 'Données en temps réel'} <span aria-hidden>→</span></button>
          </div>
          <div className="ml-panel mb-5 flex flex-wrap items-center gap-2 p-3 sm:p-4">
            <Toolbar site={site} sites={sites!} q={q} update={update} overview={overview} onRefresh={() => setReloadKey((k) => k + 1)} loading={loading} />
          </div>

        {Object.keys(q.filters).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {Object.entries(q.filters).map(([k, v]) => (
              <span key={k} className="flex items-center gap-2 rounded-full border border-[#d9e0ff] bg-[#f3f5ff] py-1 pl-3 pr-1 text-sm">
                <span className="text-[#7a869d]">{FILTER_LABELS[k]?.label ?? k} =</span>
                <span className="flex items-center gap-1.5 font-medium">{renderLabel(FILTER_LABELS[k]?.dim ?? k, { label: v || null })}</span>
                <button className="rounded-lg px-1.5 text-stone-400 hover:bg-stone-100 hover:text-ink" onClick={() => removeFilter(k)} aria-label="Retirer le filtre">
                  ✕
                </button>
              </span>
            ))}
            <button className="btn-ghost" onClick={() => update({ filters: {} })}>
              Tout effacer
            </button>
          </div>
        )}

        {overview && overview.current.visitors === 0 && overview.previous.visitors === 0 && !Object.keys(q.filters).length && (
          <div className="ml-bento mt-5 flex flex-col items-start gap-4 border-dashed bg-[#f8faff] p-5 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef1ff] text-[#4f62ef]"><UiIcon name="sparkles" size={20} /></span>
            <div className="flex-1">
              <div className="font-semibold">Aucune visite sur cette période</div>
              <div className="text-[13px] text-[#8290a3]">Installez le script sur {site.domain} ou choisissez une période plus longue — les visites arrivent en quelques secondes.</div>
            </div>
            <button className="btn-dark" onClick={() => navigate(`/site/${site.id}/settings`)}>Obtenir le script</button>
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

        <section className="mt-9" aria-label="Audience">
          <div className="mb-5">
            <div className="ml-kicker">AUDIENCE / ACQUISITION</div>
            <h2 className="mt-2 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-.045em]">D’où viennent vos visiteurs<span className="text-[#4f62ef]">.</span></h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8290a3]">Cliquez sur une ligne pour filtrer tout le tableau de bord. Chaque bloc s’exporte en CSV.</p>
          </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="Sources"
            tabs={[
              { label: 'Canal', dim: 'channel', filter: 'channel' },
              { label: 'Référent', dim: 'source', filter: 'source' },
              { label: 'Campagne', dim: 'campaign', filter: 'utm_campaign' },
              { label: 'UTM source', dim: 'utm_source', filter: 'utm_source' },
              { label: 'UTM medium', dim: 'utm_medium', filter: 'utm_medium' },
              { label: 'Mot-clé', dim: 'keyword', filter: 'utm_term' },
            ]}
          />
          <Panel
            title="Pages"
            tabs={[
              { label: 'Top pages', dim: 'page', filter: 'page' },
              { label: 'Entrée', dim: 'entry_page', filter: 'entry_page' },
              { label: 'Sortie', dim: 'exit_page' },
              { label: 'Liens sortants', dim: 'exit_link' },
              { label: 'Domaine', dim: 'hostname', filter: 'hostname' },
            ]}
          />
          <Panel
            title="Localisation"
            tabs={[
              { label: 'Pays', dim: 'country', filter: 'country' },
              { label: 'Région', dim: 'region', filter: 'region' },
              { label: 'Ville', dim: 'city', filter: 'city' },
            ]}
          />
          <Panel
            title="Technologie"
            tabs={[
              { label: 'Appareil', dim: 'device', filter: 'device' },
              { label: 'Navigateur', dim: 'browser', filter: 'browser' },
              { label: 'OS', dim: 'os', filter: 'os' },
            ]}
          />
        </div>
        </section>

        <div className="mt-5">
          <GoalsPanel totalVisitors={overview?.current.visitors ?? 0} />
        </div>

        <p className="mt-8 text-center text-xs text-stone-400">
          Heures en {site.timezone} · Revenus en {site.currency} ·{' '}
          <button className="underline-offset-2 hover:underline" onClick={() => navigate(`/site/${site.id}/settings`)}>
            Réglages & installation
          </button>
        </p>
        </div>
      </div>
      <VisitorModal key={visitor ?? 'none'} visitorId={visitor} onClose={() => setVisitor(null)} />
    </DashContext.Provider>
  );
}

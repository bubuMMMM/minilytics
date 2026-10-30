import { useCallback, useMemo, useState } from 'react';
import { navigate } from '../App';
import { GoalsPanel } from '../components/GoalsPanel';
import { LiveGlobe } from '../components/LiveGlobe';
import { EngagementPanel } from '../components/EngagementPanel';
import { AppHeader, BottomNav } from '../components/AppNav';
import { LiveDot } from '../components/Sparkline';
import { UiIcon } from '../components/UiIcon';
import { OverviewCard } from '../components/OverviewCard';
import { Panel, renderLabel } from '../components/Panel';
import { Toolbar } from '../components/Toolbar';
import { VisitorModal } from '../components/VisitorModal';
import { VideosTeaser, VideosView } from '../components/VideosView';
import { BlocksView } from '../components/BlocksView';
import { SocialView } from '../components/SocialView';
import { Link } from '../components/Link';
import { qs, type Overview, type Site } from '../lib/api';
import { DashContext, useDash, type Dash } from '../lib/context';
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
  screen: { label: 'Écran', dim: 'screen' },
  language: { label: 'Langue', dim: 'language' },
  goal: { label: 'Objectif atteint', dim: 'goal' },
};

export type DashView = 'overview' | 'videos' | 'sponsors' | 'content' | 'sources' | 'social';
const VIEW_META: Record<DashView, { kicker: string; title: (name: string) => string; sub: string }> = {
  overview: { kicker: 'ANALYSE / VUE D’ENSEMBLE', title: (n) => n, sub: 'L’essentiel de votre trafic' },
  videos: { kicker: 'ANALYSE / VIDÉOS', title: () => 'Vidéos', sub: 'Lectures, temps de visionnage et rétention' },
  sponsors: { kicker: 'ANALYSE / SPONSORS', title: () => 'Sponsors', sub: 'Impressions, clics et CTR par emplacement' },
  content: { kicker: 'ANALYSE / CONTENUS', title: () => 'Contenus', sub: 'Sections et vidéos réellement vues' },
  social: { kicker: 'ANALYSE / RÉSEAUX SOCIAUX', title: () => 'Réseaux sociaux', sub: 'Visites des réseaux, liens 𝕏 et mentions' },
  sources: { kicker: 'ANALYSE / SOURCES', title: () => 'Sources', sub: 'D’où viennent vos visiteurs et avec quoi' },
};

export function Dashboard({ siteId, view = 'overview' }: { siteId: string; view?: DashView }) {
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
        Site introuvable.{' '}
        <button className="underline" onClick={() => navigate('/sites')}>
          Retour à mes sites
        </button>
      </div>
    );
  }
  if (!dash || !site) return null;

  return (
    <DashContext.Provider value={dash}>
      <div className="ml-site-bg ml-has-bottom-nav min-h-screen pb-10">
        <AppHeader siteId={site.id} active={view} online={!!overview?.online} title={site.name} />
        <main id="contenu" className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:py-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
            <div className="min-w-0"><div className="ml-kicker"><span className="ml-dot" /> {VIEW_META[view].kicker}</div><h1 className="ml-heading mt-2 text-[clamp(1.9rem,4vw,3.2rem)]" translate={view === 'overview' ? 'no' : undefined}>{VIEW_META[view].title(site.name)}<span className="text-accent">.</span></h1><p className="mt-2 text-[13px] text-ink-3">{VIEW_META[view].sub} · <span className="font-medium text-ink-2" translate="no">{site.domain}</span></p></div>
            <a href={'/site/' + site.id + '/realtime'} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('/site/' + site.id + '/realtime'); }} className="hidden items-center gap-2 rounded-full border border-line-strong bg-success-soft px-4 py-2 text-[12px] font-semibold text-success transition-colors hover:border-line-strong hover:bg-success-soft sm:inline-flex"><LiveDot on={!!overview?.online} />{overview ? overview.online + ' en ligne maintenant' : 'Données en temps réel'} <span aria-hidden>→</span></a>
          </div>
          <div className="ml-panel z-30 mb-5 flex flex-wrap items-center gap-2 p-2.5 sm:p-3 md:sticky md:top-[112px]">
            <Toolbar site={site} sites={sites!} q={q} update={update} overview={overview} onRefresh={() => setReloadKey((k) => k + 1)} loading={loading} />
          </div>

        {Object.keys(q.filters).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {Object.entries(q.filters).map(([k, v]) => (
              <span key={k} className="flex items-center gap-2 rounded-full border border-accent/30 bg-well py-1 pl-3 pr-1 text-sm">
                <span className="text-ink-3">{FILTER_LABELS[k]?.label ?? k} =</span>
                <span className="flex items-center gap-1.5 font-medium">{renderLabel(FILTER_LABELS[k]?.dim ?? k, { label: v || null })}</span>
                <button className="rounded-lg px-1.5 text-ink-4 hover:bg-well hover:text-ink" onClick={() => removeFilter(k)} aria-label="Retirer le filtre">
                  ✕
                </button>
              </span>
            ))}
            <button className="btn-ghost" onClick={() => update({ filters: {} })}>
              Tout effacer
            </button>
          </div>
        )}

        {view === 'videos' ? <div className="mt-5"><VideosView /></div>
          : view === 'sponsors' ? <div className="mt-5"><BlocksView kind="sponsor" /></div>
          : view === 'content' ? <div className="mt-5"><BlocksView kind="content" /></div>
          : view === 'social' ? <div className="mt-5"><SocialView /></div>
          : view === 'sources' ? <SourcesPanels full />
          : <>
        {overview && overview.current.visitors === 0 && overview.previous.visitors === 0 && !Object.keys(q.filters).length && (
          <div className="ml-bento mt-5 flex flex-col items-start gap-4 border-dashed bg-well p-5 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><UiIcon name="sparkles" size={20} /></span>
            <div className="flex-1">
              <div className="font-semibold">Aucune visite sur cette période</div>
              <div className="text-[13px] text-ink-3">Installez le script sur {site.domain} ou choisissez une période plus longue — les visites arrivent en quelques secondes.</div>
            </div>
            <button className="btn-dark" onClick={() => navigate(`/site/${site.id}/settings`)}>Obtenir le script</button>
          </div>
        )}

        <div className="mt-5">
          <OverviewCard data={overview} />
        </div>
        <VideosTeaser onOpen={() => navigate('/site/' + site.id + '/videos' + window.location.search)} />

        <section className="mt-7 scroll-mt-[110px]" aria-label="Analyse comportementale">
          <div className="mb-5">
            <div className="ml-kicker">COMPORTEMENT / ENGAGEMENT</div>
            <h2 className="mt-2 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-.045em]">Découvrez comment vos pages sont parcourues<span className="text-accent">.</span></h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">Scroll, temps actif réel, liens cliqués et pages de fin de session — filtrés sur la même période et les mêmes segments que vos statistiques.</p>
          </div>
          <EngagementPanel siteId={siteId} query={q} reloadKey={reloadKey}/>
        </section>
        <LiveGlobe siteId={siteId} />

        <SourcesPanels />

        <div className="mt-5">
          <GoalsPanel totalVisitors={overview?.current.visitors ?? 0} />
        </div>

        </>}
        <p className="mt-8 text-center text-xs text-ink-3">
          Heures en {site.timezone} · Revenus en {site.currency} ·{' '}
          <button className="underline-offset-2 hover:underline" onClick={() => navigate(`/site/${site.id}/settings`)}>
            Réglages & installation
          </button>
        </p>
        </main>
      </div>
      <BottomNav siteId={site.id} active={view} />
      <VisitorModal key={visitor ?? 'none'} visitorId={visitor} onClose={() => setVisitor(null)} />
    </DashContext.Provider>
  );
}

/** Acquisition & audience breakdowns. The overview shows the two key panels; the Sources view shows everything. */
function SourcesPanels({ full = false }: { full?: boolean }) {
  const { site } = useDash();
  return (
    <section className="mt-7" aria-labelledby="sources-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ml-kicker">AUDIENCE / ACQUISITION</div>
          <h2 id="sources-title" className="mt-2 text-[clamp(1.5rem,3vw,2.1rem)] font-semibold tracking-[-.045em]">D’où viennent vos visiteurs<span className="text-accent">.</span></h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">Touchez une ligne pour filtrer tout le tableau de bord. Chaque bloc s’exporte en CSV.</p>
        </div>
        {!full && <Link href={`/site/${site.id}/sources${window.location.search}`} className="btn">Toutes les sources <UiIcon name="arrow-right" size={16} /></Link>}
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
              { label: 'URL référente', dim: 'referrer' },
              { label: 'Ref', dim: 'ref', filter: 'ref' },
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
          {full && <>
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
              { label: 'Écran', dim: 'screen', filter: 'screen' },
              { label: 'Langue', dim: 'language', filter: 'language' },
              { label: 'Nouveaux / récurrents', dim: 'visitor_type' },
            ]}
          />
          <Panel
            title="Interactions"
            tabs={[
              { label: 'Actions', dim: 'action' },
              { label: 'Recherches', dim: 'search' },
              { label: 'Partages', dim: 'share' },
              { label: 'Objectifs', dim: 'goal', filter: 'goal' },
            ]}
          />
          </>}
        </div>
      {full && <LiveGlobe siteId={site.id} />}
    </section>
  );
}

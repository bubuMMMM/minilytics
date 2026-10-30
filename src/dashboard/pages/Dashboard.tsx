import { RevenueInsights } from '../components/RevenueInsights';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { GoalsPanel } from '../components/GoalsPanel';
import { LiveGlobe } from '../components/LiveGlobe';
import { EngagementPanel } from '../components/EngagementPanel';
import { AppHeader, BottomNav } from '../components/AppNav';
import { LiveDot } from '../components/Sparkline';
import { UiIcon } from '../components/UiIcon';
import { OverviewCard } from '../components/OverviewCard';
import { Panel } from '../components/Panel';
import { FilterBar } from '../components/FilterBar';
import { Toolbar } from '../components/Toolbar';
import { VisitorModal } from '../components/VisitorModal';
import { VideosTeaser, VideosView } from '../components/VideosView';
import { BlocksView } from '../components/BlocksView';
import { SocialView } from '../components/SocialView';
import { BotsView } from '../components/BotsView';
import { Link } from '../components/Link';
import { ImportedCard } from '../components/ImportedCard';
import { qs, type Overview, type Site } from '../lib/api';
import { DashContext, useDash, type Dash } from '../lib/context';
import { fmtMoney } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useQueryState } from '../lib/useQueryState';
import { useMe } from '../lib/me';

export type DashView = 'overview' | 'videos' | 'sponsors' | 'content' | 'sources' | 'social' | 'bots';
const VIEW_META: Record<DashView, { kicker: string; title: (name: string) => string; sub: string }> = {
  overview: { kicker: 'ANALYSE / VUE D’ENSEMBLE', title: (n) => n, sub: 'L’essentiel de votre trafic' },
  videos: { kicker: 'ANALYSE / VIDÉOS', title: () => 'Vidéos', sub: 'Lectures, temps de visionnage et rétention' },
  sponsors: { kicker: 'ANALYSE / SPONSORS', title: () => 'Sponsors', sub: 'Impressions, clics et CTR par emplacement' },
  content: { kicker: 'ANALYSE / CONTENUS', title: () => 'Contenus', sub: 'Sections et vidéos réellement vues' },
  social: { kicker: 'ANALYSE / RÉSEAUX SOCIAUX', title: () => 'Réseaux sociaux', sub: 'Visites des réseaux, liens 𝕏 et mentions' },
  bots: { kicker: 'ANALYSE / BOTS IA', title: () => 'Bots IA', sub: 'Robots d’IA qui lisent vos pages et visiteurs envoyés par les assistants' },
  sources: { kicker: 'ANALYSE / SOURCES', title: () => 'Sources', sub: 'D’où viennent vos visiteurs et avec quoi' },
};

export function Dashboard({ siteId, view = 'overview' }: { siteId: string; view?: DashView }) {
  const [q, update] = useQueryState();
  const [reloadKey, setReloadKey] = useState(0);
  const [visitor, setVisitor] = useState<string | null>(null);
  const me = useMe();
  const { data: sites } = useApi<Site[]>('/api/sites');
  const site = sites?.find((s) => s.id === siteId);
  const { data: overview, loading } = useApi<Overview>(site ? `/api/sites/${siteId}/overview?${qs(q)}` : null, reloadKey);

  // « Maintenant »: refresh every 30 s while the tab is visible.
  useEffect(() => {
    if (q.period !== 'now') return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') setReloadKey((k) => k + 1); }, 30_000);
    return () => clearInterval(t);
  }, [q.period]);

  const addFilter = useCallback((key: string, value: string) => update({ filters: { ...q.filters, [key]: value } }), [q.filters, update]);

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
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[26px]" translate={view === 'overview' ? 'no' : undefined}>{VIEW_META[view].title(site.name)}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">{VIEW_META[view].sub}<span aria-hidden className="text-ink-4">·</span><span className="font-mono text-[12px] text-ink-3" translate="no">{site.domain}</span>
                <a href={'/site/' + site.id + '/realtime'} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('/site/' + site.id + '/realtime'); }} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-line-strong"><LiveDot on={!!overview?.online} />{overview ? overview.online + ' en ligne' : 'Temps réel'}</a>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {me && me.role !== 'viewer' && <Link href={`/site/${site.id}/settings#partage`} className="btn" aria-label="Partager le tableau de bord"><UiIcon name="share" size={15} /><span className="hidden sm:inline">Partager</span></Link>}
              <Toolbar site={site} sites={sites!} q={q} update={update} overview={overview} onRefresh={() => setReloadKey((k) => k + 1)} loading={loading} />
            </div>
          </div>

        {view !== 'bots' && <FilterBar siteId={site.id} q={q} update={update} />}

        {view === 'videos' ? <div className="mt-5"><VideosView /></div>
          : view === 'sponsors' ? <div className="mt-5"><BlocksView kind="sponsor" /></div>
          : view === 'content' ? <div className="mt-5"><BlocksView kind="content" /></div>
          : view === 'social' ? <div className="mt-5"><SocialView /></div>
          : view === 'bots' ? <div className="mt-5"><BotsView /></div>
          : view === 'sources' ? <SourcesPanels full />
          : <>
        {overview && overview.current.visitors === 0 && overview.previous.visitors === 0 && !Object.keys(q.filters).length && (
          <div className="mt-5 flex flex-col items-start gap-4 rounded-xl border border-dashed border-line-strong p-5 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink-3"><UiIcon name="code" size={18} /></span>
            <div className="flex-1">
              <div className="font-semibold">Aucune visite sur cette période</div>
              <div className="text-[13px] text-ink-3">Installez le script sur {site.domain} ou choisissez une période plus longue — les visites arrivent en quelques secondes.</div>
            </div>
            <button className="btn-dark" onClick={() => navigate(`/site/${site.id}/settings`)}>Obtenir le script</button>
          </div>
        )}

        {q.period === 'now' && <p className="mt-4 flex items-center gap-2 text-[12px] text-ink-3" role="status"><LiveDot on /> 30 dernières minutes, minute par minute · actualisation automatique toutes les 30 s</p>}
        <div className="mt-5">
          <OverviewCard data={overview} />
        </div>
        <ImportedCard siteId={site.id} />
        <RevenueInsights />
        <VideosTeaser onOpen={() => navigate('/site/' + site.id + '/videos' + window.location.search)} />

        <section className="mt-7 scroll-mt-[110px]" aria-label="Analyse comportementale">
          <div className="mb-5">
            <div className="ml-kicker">Engagement</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Découvrez comment vos pages sont parcourues</h2>
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
          <div className="ml-kicker">Acquisition</div>
          <h2 id="sources-title" className="mt-1 text-lg font-semibold tracking-tight">D’où viennent vos visiteurs</h2>
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
              { label: 'Sortie', dim: 'exit_page', filter: 'exit_page' },
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
              { label: 'Nouveaux / récurrents', dim: 'visitor_type', filter: 'visitor_type' },
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

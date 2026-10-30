/**
 * Information architecture shared by the sidebar, the tablet tabs, the mobile sheet and ⌘K.
 * Views keep their historical URLs; anchors (#engagement, #objectifs) land on overview sections.
 */
import type { UiIconName } from '../components/UiIcon';

export type NavKey = 'overview' | 'bots' | 'map' | 'social' | 'videos' | 'sponsors' | 'content' | 'sources' | 'realtime' | 'settings' | 'sites';

export interface NavItem {
  key: string;
  /** Which page lights the item up (anchor items never do). */
  active?: NavKey;
  label: string;
  short?: string;
  hint?: string;
  icon: UiIconName;
  /** Path under /site/:id ('' = overview). Absolute paths start with '//' replaced at runtime. */
  path: string;
  /** Keep period + filters from the current URL. */
  keep?: boolean;
  /** Hidden for read-only members. */
  admin?: boolean;
  absolute?: boolean;
}
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { id: 'analyse', label: 'Analyse', items: [
    { key: 'overview', active: 'overview', label: 'Vue d’ensemble', short: 'Aperçu', icon: 'bar-chart', path: '', keep: true, hint: 'KPI, courbe, pages, sources' },
    { key: 'realtime', active: 'realtime', label: 'Temps réel', short: 'Direct', icon: 'activity', path: '/realtime', hint: 'Visiteurs en ligne maintenant' },
  ] },
  { id: 'audience', label: 'Audience', items: [
    { key: 'map', active: 'map', label: 'Carte', icon: 'globe', path: '/map', keep: true, hint: 'Globe, replay et flux en direct' },
    { key: 'engagement', label: 'Engagement', icon: 'mouse', path: '#engagement', keep: true, hint: 'Scroll, temps actif, clics' },
  ] },
  { id: 'acquisition', label: 'Acquisition', items: [
    { key: 'sources', active: 'sources', label: 'Sources', icon: 'compass', path: '/sources', keep: true, hint: 'Canaux, référents, UTM, pays, appareils' },
    { key: 'social', active: 'social', label: 'Réseaux sociaux', short: 'Réseaux', icon: 'share', path: '/social', keep: true, hint: 'Visites des réseaux, liens et mentions 𝕏' },
    { key: 'bots', active: 'bots', label: 'Bots IA', icon: 'bot', path: '/bots', keep: true, hint: 'Robots d’IA et trafic venu des assistants' },
  ] },
  { id: 'revenus', label: 'Revenus', items: [
    { key: 'goals', label: 'Objectifs et revenus', short: 'Objectifs', icon: 'target', path: '#objectifs', keep: true, hint: 'Objectifs, entonnoirs, chemins, paiements' },
    { key: 'payments', label: 'Paiements', icon: 'coins', path: '/settings/revenus', admin: true, hint: 'Stripe, Dodo, Lemon Squeezy, Paddle…' },
  ] },
  { id: 'contenu', label: 'Contenu', items: [
    { key: 'videos', active: 'videos', label: 'Vidéos', icon: 'play', path: '/videos', keep: true, hint: 'Lectures, visionnage, rétention' },
    { key: 'sponsors', active: 'sponsors', label: 'Sponsors', icon: 'megaphone', path: '/sponsors', keep: true, hint: 'Impressions, clics, CTR' },
    { key: 'content', active: 'content', label: 'Contenus', icon: 'grid', path: '/contenus', keep: true, hint: 'Sections et vidéos vues' },
  ] },
  { id: 'outils', label: 'Outils', items: [
    { key: 'share', label: 'Partage et widgets', short: 'Partage', icon: 'link', path: '/settings/partage', admin: true, hint: 'Liens publics, mot de passe, widgets' },
    { key: 'alerts', label: 'Alertes', icon: 'bell', path: '/settings/alertes', admin: true, hint: 'Notifications et rapports e-mail' },
    { key: 'api', label: 'API et MCP', icon: 'book', path: '/api-docs', absolute: true, hint: 'REST, OpenAPI, MCP, CLI' },
    { key: 'settings', active: 'settings', label: 'Réglages', icon: 'settings', path: '/settings', admin: true, hint: 'Installation, intégrations, données' },
  ] },
];

export const TITLES: Record<NavKey, string> = {
  overview: 'Vue d’ensemble', map: 'Carte', social: 'Réseaux sociaux', videos: 'Vidéos', sponsors: 'Sponsors', content: 'Contenus', bots: 'Bots IA', sources: 'Sources', realtime: 'Temps réel', settings: 'Réglages', sites: 'Mes sites',
};

export function navHref(siteId: string, item: NavItem) {
  if (item.absolute) return item.path;
  const search = item.keep && typeof window !== 'undefined' ? window.location.search : '';
  if (item.path.startsWith('#')) return `/site/${siteId}${search}${item.path}`;
  return `/site/${siteId}${item.path}${search}`;
}

export function groupOf(active: NavKey) {
  return NAV.find((g) => g.items.some((i) => i.active === active));
}

/** Réglages sub-pages (URL /site/:id/settings/:section). */
export const SETTINGS_SECTIONS: { id: string; label: string; icon: UiIconName; desc: string }[] = [
  { id: 'installation', label: 'Installation', icon: 'code', desc: 'Script de suivi, objectifs, sponsors et contenus, formulaires.' },
  { id: 'general', label: 'Général', icon: 'sliders', desc: 'Nom, domaine, fuseau horaire, devise, page publique.' },
  { id: 'script', label: 'Options du script', icon: 'zap', desc: 'Domaines croisés, sans cookie, hash, proxy, localhost.' },
  { id: 'revenus', label: 'Revenus', icon: 'coins', desc: 'Dodo Payments, Stripe, Lemon Squeezy, Polar, Paddle, Shopify… et API serveur.' },
  { id: 'partage', label: 'Partage', icon: 'link', desc: 'Tableaux de bord publics, mot de passe, expiration.' },
  { id: 'widgets', label: 'Widgets', icon: 'layout', desc: 'Compteurs, graphique, carte et badge à intégrer.' },
  { id: 'alertes', label: 'Alertes et rapports', icon: 'bell', desc: 'Notifications in-app, alertes de trafic, rapports e-mail.' },
  { id: 'integrations', label: 'Intégrations', icon: 'plug', desc: 'GitHub, Reddit, Search Console, Meta Ads, liens 𝕏 traçables.' },
  { id: 'api', label: 'API et MCP', icon: 'key', desc: 'Jetons personnels, REST v1, serveur MCP, CLI.' },
  { id: 'donnees', label: 'Données', icon: 'database', desc: 'Exclusions (chemins, IP, pays) et import Plausible.' },
  { id: 'offre', label: 'Offre et quotas', icon: 'shield', desc: 'Utilisation du mois et limites de l’offre.' },
];
/** Old one-page anchors → sub-pages. */
export const LEGACY_SETTINGS_HASH: Record<string, string> = { partage: 'partage', widgets: 'widgets', alertes: 'alertes' };

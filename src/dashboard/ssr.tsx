import { DiscountDemo } from './pages/DiscountDemo';
import { renderToString } from 'react-dom/server';
import { Landing } from './pages/Landing';
import { Signup } from './pages/Signup';
import { PublicDemo } from './pages/PublicDemo';

const ORIGIN = 'https://discount-qualite-insights-demo.vercel.app';

export type PrerenderRoute = {
  path: string;
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
};

export const ROUTES: Record<string, PrerenderRoute> = {
  '/': {
    path: '/',
    title: 'Discount & Qualité Insights — Analytics simple et précis pour vos sites',
    description: 'Discount & Qualité Insights : visiteurs, pages vues, sources, campagnes UTM, objectifs, revenus et temps réel pour tout type de site (blog, landing page, boutique, SaaS). Tableau de bord simple en français, dès 9 € par mois.',
    canonical: ORIGIN + '/',
    ogTitle: 'Discount & Qualité Insights — Vos visiteurs, enfin lisibles',
  },
  '/signup': {
    path: '/signup',
    title: 'Liste d’attente — Discount & Qualité Insights',
    description: 'Réservez votre accès à Discount & Qualité Insights. Les comptes ouvrent par vagues ; laissez votre e-mail, sans carte bancaire ni engagement.',
    canonical: ORIGIN + '/signup',
    ogTitle: 'Liste d’attente — Discount & Qualité Insights',
  },
  '/demo': {
    path: '/demo',
    title: 'Démo interactive — Discount & Qualité Insights',
    description: 'Explorez un vrai tableau de bord Discount & Qualité Insights : visiteurs, sources, pages, carte du monde et temps réel, en français.',
    canonical: ORIGIN + '/demo',
    ogTitle: 'Démo interactive — Discount & Qualité Insights',
  },
};

export function render(url: string) {
  const path = url.replace(/\/+$/, '') || '/';
  const meta = ROUTES[path];
  if (!meta) return null;
  const el = path === '/signup' ? <Signup /> : <DiscountDemo />;
  return { html: renderToString(el), ...meta };
}

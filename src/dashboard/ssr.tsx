import { renderToString } from 'react-dom/server';
import { Landing } from './pages/Landing';
import { Signup } from './pages/Signup';
import { PublicDemo } from './pages/PublicDemo';

const ORIGIN = 'https://minilytics-six.vercel.app';

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
    title: 'Minilytics — Analytics simple et précis pour vos sites',
    description: 'Minilytics : visiteurs, pages vues, sources, campagnes UTM, objectifs, revenus et temps réel pour tout type de site (blog, landing page, boutique, SaaS). Tableau de bord simple en français, dès 9 € par mois.',
    canonical: ORIGIN + '/',
    ogTitle: 'Minilytics — Vos visiteurs, enfin lisibles',
  },
  '/signup': {
    path: '/signup',
    title: 'Liste d’attente — Minilytics',
    description: 'Réservez votre accès à Minilytics. Les comptes ouvrent par vagues ; laissez votre e-mail, sans carte bancaire ni engagement.',
    canonical: ORIGIN + '/signup',
    ogTitle: 'Liste d’attente — Minilytics',
  },
  '/demo': {
    path: '/demo',
    title: 'Démo en direct — Minilytics',
    description: 'Explorez un vrai tableau de bord Minilytics : visiteurs, sources, pages, carte du monde et temps réel, en français.',
    canonical: ORIGIN + '/demo',
    ogTitle: 'Démo en direct — Minilytics',
  },
};

export function render(url: string) {
  const path = url.replace(/\/+$/, '') || '/';
  const meta = ROUTES[path];
  if (!meta) return null;
  const el = path === '/' ? <Landing /> : path === '/signup' ? <Signup /> : <PublicDemo />;
  return { html: renderToString(el), ...meta };
}

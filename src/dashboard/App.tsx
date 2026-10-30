import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './lib/api';
import { Landing, Signup } from './pages/Landing';
import { Login } from './pages/Login';

// Route-level code splitting: the landing page never downloads the charts, globe or dashboard.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Realtime = lazy(() => import('./pages/Realtime').then((m) => ({ default: m.Realtime })));
const PublicDemo = lazy(() => import('./pages/PublicDemo').then((m) => ({ default: m.PublicDemo })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Sites = lazy(() => import('./pages/Sites').then((m) => ({ default: m.Sites })));

export function navigate(to: string) {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

/** Shown only if loading takes > 200 ms, so fast navigations never flash a spinner. */
function Loading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);
  return <div className="flex min-h-screen items-center justify-center text-sm text-stone-500" aria-busy="true">{show ? 'Chargement…' : ''}</div>;
}

const SITE_VIEWS: Record<string, 'videos' | 'sponsors' | 'content' | 'sources'> = { videos: 'videos', sponsors: 'sponsors', contenus: 'content', sources: 'sources' };

export function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ loggedIn: boolean }>('/api/auth/me').then((r) => setAuth(r.loggedIn), () => setAuth(false));
    const out = () => setAuth(false);
    window.addEventListener('ml:logout', out);
    return () => window.removeEventListener('ml:logout', out);
  }, []);

  if (path === '/') return <Landing />;
  if (path === '/signup') return <Signup />;
  // A genuine, read-only public demonstration; private customer data stays behind authentication.
  if (path === '/demo') return <Suspense fallback={<Loading />}><PublicDemo /></Suspense>;
  if (auth === null) return <Loading />;
  if (!auth) return <Login onLogin={() => { setAuth(true); navigate(path === '/login' ? '/sites' : path + window.location.search); }} />;
  return <Suspense fallback={<Loading />}>{route(path)}</Suspense>;
}

function route(path: string) {
  if (path === '/admin' || path === '/sites' || path === '/login') return <Sites />;
  const m = /^\/site\/([\w-]+)(?:\/([\w-]+))?$/.exec(path);
  if (!m) return <Sites />;
  const [, id, sub] = m;
  if (!sub) return <Dashboard key={'o' + id} siteId={id} />;
  if (sub === 'settings') return <Settings siteId={id} />;
  if (sub === 'realtime') return <Realtime siteId={id} />;
  const view = SITE_VIEWS[sub];
  return view ? <Dashboard key={view + id} siteId={id} view={view} /> : <Sites />;
}

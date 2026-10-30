import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { api } from './lib/api';

// One chunk per page: the public landing no longer downloads the dashboard (recharts, panels…) and vice versa.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Realtime = lazy(() => import('./pages/Realtime').then((m) => ({ default: m.Realtime })));
const PublicDemo = lazy(() => import('./pages/PublicDemo').then((m) => ({ default: m.PublicDemo })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Sites = lazy(() => import('./pages/Sites').then((m) => ({ default: m.Sites })));

const Loading = () => <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">Chargement…</div>;

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

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes />
    </Suspense>
  );
}

function Routes(): ReactNode {
  const path = usePath();
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ loggedIn: boolean }>('/api/auth/me').then((r) => setAuth(r.loggedIn), () => setAuth(false));
    const out = () => setAuth(false);
    window.addEventListener('ml:logout', out);
    return () => window.removeEventListener('ml:logout', out);
  }, []);

  // A genuine, read-only public demonstration; private customer data stays behind authentication.
  if (path === '/' || path === '/demo') return <PublicDemo />;
  if (auth === null) return <Loading />;
  if (!auth) return <Login onLogin={() => { setAuth(true); navigate('/sites'); }} />;

  if (path === '/admin' || path === '/sites') return <Sites />;
  const settings = /^\/site\/([\w-]+)\/settings\/?$/.exec(path);
  if (settings) return <Settings siteId={settings[1]} />;
  const realtime = /^\/site\/([\w-]+)\/realtime\/?$/.exec(path);
  if (realtime) return <Realtime siteId={realtime[1]} />;
  const videos = /^\/site\/([\w-]+)\/videos\/?$/.exec(path);
  if (videos) return <Dashboard key={'v' + videos[1]} siteId={videos[1]} view="videos" />;
  const site = /^\/site\/([\w-]+)\/?$/.exec(path);
  if (site) return <Dashboard siteId={site[1]} />;
  return <Sites />;
}

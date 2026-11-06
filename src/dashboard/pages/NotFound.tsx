import { useEffect } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';

/** Unknown public URLs get a real 404 page instead of the login wall. */
export function NotFound() {
  useEffect(() => {
    document.title = 'Page introuvable — Minilytics';
    // Keep mistyped or stale URLs out of search results.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12 text-center">
      <div className="ml-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <Link href="/" aria-label="Minilytics, accueil" className="relative"><Logo /></Link>
      <main className="relative mt-10 max-w-[440px]">
        <p className="tnum font-mono text-[13px] text-ink-4">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Cette page n’existe pas.</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-3">Le lien est peut-être incomplet, ou la page a été déplacée.</p>
        <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
          <Link href="/" className="btn-dark !h-11 !px-5">Retour à l’accueil</Link>
          <Link href="/demo" className="btn !h-11 !px-5">Voir la démo</Link>
        </div>
      </main>
    </div>
  );
}

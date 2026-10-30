import { useEffect } from 'react';

/** Scrolls to `location.hash` once `ready`, and again on every client navigation (sidebar anchors, ⌘K). */
export function useHashScroll(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let t = 0;
    const go = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        const h = window.location.hash;
        if (!h || h.length < 2) return;
        const el = document.getElementById(decodeURIComponent(h.slice(1)));
        if (!el) return;
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      }, 80);
    };
    go();
    window.addEventListener('popstate', go);
    window.addEventListener('ml:hash', go);
    return () => { clearTimeout(t); window.removeEventListener('popstate', go); window.removeEventListener('ml:hash', go); };
  }, [ready]);
}

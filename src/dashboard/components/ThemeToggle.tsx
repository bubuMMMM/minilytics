import { useEffect, useState } from 'react';

function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function applyTheme(dark: boolean) {
  const d = document.documentElement;
  d.classList.toggle('dark', dark);
  d.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0b' : '#ffffff');
  try { localStorage.setItem('ml-theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
}

/** Light / dark switch (persisted). The initial theme is set before paint by /js/theme.js. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(isDark);
  useEffect(() => setDark(isDark()), []);
  return (
    <button
      type="button"
      onClick={() => { const v = !dark; applyTheme(v); setDark(v); }}
      aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={dark ? 'Thème clair' : 'Thème sombre'}
      className={'inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-well hover:text-ink md:h-9 md:w-9 ' + className}
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
      )}
    </button>
  );
}

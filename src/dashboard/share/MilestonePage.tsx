import { useEffect, useState } from 'react';
import { Favicon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { UiIcon } from '../components/UiIcon';
import type { MilestoneItem } from './MilestoneSettings';

export function MilestonePage({ token }: { token: string }) {
  const [item, setItem] = useState<MilestoneItem & { siteName: string; domain: string } | null>(null);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  useEffect(() => {
    fetch(`/api/public/milestone/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('introuvable');
        setItem(await r.json());
      })
      .catch(() => setError('Ce jalon n’existe pas ou n’est pas public.'));
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-canvas px-6 text-center">
        <p className="text-sm font-medium">{error}</p>
        <a href="/" className="mt-4 text-sm text-accent hover:underline">Retour à Minilytics</a>
      </div>
    );
  }
  if (!item) return <div className="ml-loading mx-auto mt-24 h-48 max-w-xl rounded-2xl" />;

  const image = `${item.image}?theme=${theme}`;
  return (
    <div className="min-h-svh bg-canvas px-4 py-10 text-ink">
      <div className="mx-auto flex max-w-2xl flex-col items-center">
        <a href="/" className="mb-8 rounded-md" aria-label="Minilytics, accueil"><Logo small /></a>
        <h1 className="sr-only">{item.title}</h1>
        <img src={image} alt={item.title} width={1200} height={675} className="w-full rounded-2xl border border-line shadow-xs" />
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-3">
          <Favicon domain={item.domain} size={16} />
          <span className="font-medium text-ink">{item.siteName}</span>
          <span>· {item.date}</span>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a className="btn-dark" href={item.intentUrl} target="_blank" rel="noopener noreferrer">
            <UiIcon name="share" size={15} /> Partager sur X
          </a>
          <a className="btn" href={`${image}&download=1`} download>
            <UiIcon name="download" size={15} /> Télécharger l’image
          </a>
          <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          </button>
        </div>
        <p className="mt-8 max-w-md text-center text-[12px] text-ink-4">
          Carte générée par Minilytics. Le lien ouvre une fenêtre de composition sur X : rien n’est publié automatiquement.
        </p>
      </div>
    </div>
  );
}

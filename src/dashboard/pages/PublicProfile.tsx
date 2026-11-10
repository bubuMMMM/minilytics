import { useEffect, useRef, useState } from 'react';
import { Link } from '../components/Link';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { UiIcon } from '../components/UiIcon';
import { NotFound } from './NotFound';

interface Social { network: string; url: string }
interface W { siteId: string; type: string }
interface Page {
  slug: string; title: string; bio: string; avatarUrl: string | null; coverUrl: string | null;
  socials: Social[]; theme: 'light' | 'dark' | 'auto'; accent: string; layout: 'stacked' | 'grid';
  widgets: W[];
}

const NET_LABEL: Record<string, string> = {
  website: 'Site web', x: 'X', linkedin: 'LinkedIn', github: 'GitHub', instagram: 'Instagram',
  youtube: 'YouTube', bluesky: 'Bluesky', threads: 'Threads', tiktok: 'TikTok', facebook: 'Facebook',
};

export function PublicProfile({ slug }: { slug: string }) {
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/page/${encodeURIComponent(slug)}`).then(async (r) => {
      if (!alive) return;
      if (r.status === 404) { setPage(null); return; }
      setPage(await r.json());
    }).catch(() => { if (alive) setPage(null); });
    return () => { alive = false; };
  }, [slug]);
  useEffect(() => {
    if (!page) return;
    document.title = `${page.title} · Minilytics`;
    const root = document.documentElement;
    const wantDark = page.theme === 'dark' || (page.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', wantDark);
    if (page.accent) root.style.setProperty('--accent', accentToRgb(page.accent));
    return () => { root.style.removeProperty('--accent'); };
  }, [page]);

  if (page === undefined) return <div className="flex min-h-screen items-center justify-center text-sm text-ink-3">Chargement…</div>;
  if (!page) return <NotFound />;

  const url = `${window.location.origin}/u/${page.slug}`;
  const tweet = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(page.title)}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[880px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Minilytics, accueil" className="flex min-h-[44px] items-center rounded-md"><Logo small /></Link>
          <div className="flex items-center gap-1"><ThemeToggle /><Link href="/signup" className="btn-dark !h-9">Commencer</Link></div>
        </div>
      </header>
      {page.coverUrl && (
        <div className="h-40 w-full overflow-hidden bg-well sm:h-56">
          <img src={page.coverUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        </div>
      )}
      <main id="contenu" className="mx-auto max-w-[880px] px-4 pb-16 sm:px-6">
        <div className={`${page.coverUrl ? '-mt-10' : 'mt-10'} flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`}>
          <div className="flex min-w-0 items-end gap-4">
            {page.avatarUrl
              ? <img src={page.avatarUrl} alt="" width={88} height={88} className="h-[88px] w-[88px] rounded-2xl border-4 border-canvas object-cover shadow-card" referrerPolicy="no-referrer" />
              : <span className="flex h-[88px] w-[88px] items-center justify-center rounded-2xl border-4 border-canvas bg-accent text-2xl font-semibold text-white shadow-card" aria-hidden>{initials(page.title)}</span>}
            <div className="min-w-0 pb-1">
              <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-ink [text-wrap:balance] sm:text-[32px]">{page.title}</h1>
              {page.bio && <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-ink-3 [text-wrap:pretty]">{page.bio}</p>}
            </div>
          </div>
        </div>
        {page.socials.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {page.socials.map((s) => (
              <li key={s.network + s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn !h-9 text-[13px]">{NET_LABEL[s.network] ?? s.network}</a>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={copy}><UiIcon name="copy" size={14} />{copied ? ' Copié' : ' Copier le lien'}</button>
          {'share' in navigator && <button type="button" className="btn" onClick={() => navigator.share?.({ title: page.title, text: page.bio || undefined, url }).catch(() => {})}><UiIcon name="share" size={14} /> Partager</button>}
          <a className="btn" href={tweet} target="_blank" rel="noopener noreferrer">X</a>
          <a className="btn" href={linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>

        {page.widgets.length > 0 && (
          <section className={`mt-10 grid gap-4 ${page.layout === 'grid' ? 'sm:grid-cols-2' : 'max-w-xl'}`} aria-label="Statistiques">
            {page.widgets.map((_, i) => (
              <WidgetFrame key={i} src={`/api/public/page/${page.slug}/widget/${i}`} index={i} />
            ))}
          </section>
        )}
        <p className="mt-12 text-center text-[12px] text-ink-4">Page publique Minilytics · <Link href="/" className="underline-offset-2 hover:underline">Créer la vôtre</Link></p>
      </main>
    </div>
  );
}

function initials(title: string) {
  return title.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'M';
}
function accentToRgb(hex: string) {
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function WidgetFrame({ src, index }: { src: string; index: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(120);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.minilytics !== 'widget' || e.data.id !== 'pp' + index) return;
      if (e.data.h) setH(e.data.h);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [index]);
  return <iframe ref={ref} title={`Widget ${index + 1}`} src={src} className="w-full rounded-xl bg-transparent" style={{ border: 0, height: h, maxWidth: '100%' }} loading="lazy" />;
}

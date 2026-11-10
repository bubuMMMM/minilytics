import { useEffect, useState } from 'react';
import { AccountHeader } from '../components/AppNav';
import { CodeBlock, PageHeader, Segmented } from '../components/ui';
import { UiIcon } from '../components/UiIcon';
import { api } from '../lib/api';

const NETWORKS: { key: string; label: string; placeholder: string }[] = [
  { key: 'website', label: 'Site web', placeholder: 'https://…' },
  { key: 'x', label: 'X', placeholder: 'https://x.com/vous' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/in/vous' },
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/vous' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/vous' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/@vous' },
  { key: 'bluesky', label: 'Bluesky', placeholder: 'https://bsky.app/profile/vous.bsky.social' },
  { key: 'threads', label: 'Threads', placeholder: 'https://www.threads.net/@vous' },
];
const WTYPES: { key: string; label: string }[] = [
  { key: 'live', label: 'En ligne' }, { key: 'counter', label: 'Compteur' }, { key: 'chart', label: 'Graphique' },
  { key: 'pages', label: 'Top pages' }, { key: 'map', label: 'Carte' },
];
const STYLES = [['classic','Classique'],['minimal','Minimal'],['editorial','Éditorial'],['glass','Verre'],['gradient','Dégradé'],['compact','Compact']] as const;

interface Social { network: string; url: string }
interface W { siteId: string; type: string; period?: string; style?: string; accent?: string; size?: string; theme?: string; logo?: boolean; transparent?: boolean }
interface Page {
  slug: string; title: string; bio: string; avatarUrl: string | null; coverUrl: string | null;
  socials: Social[]; theme: 'light' | 'dark' | 'auto'; accent: string; layout: 'stacked' | 'grid';
  published: boolean; widgets: W[];
}
interface Site { id: string; name: string; domain: string }

const empty = (sites: Site[]): Omit<Page, 'published'> & { published?: boolean } => ({
  slug: '', title: '', bio: '', avatarUrl: '', coverUrl: '', socials: [], theme: 'auto', accent: '2563eb',
  layout: 'stacked', widgets: sites[0] ? [{ siteId: sites[0].id, type: 'live', style: 'classic' }] : [],
});

export function ProfileSettings() {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [page, setPage] = useState<Page | null>(null);
  const [form, setForm] = useState<ReturnType<typeof empty>>(empty([]));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const origin = window.location.origin;
  const publicUrl = form.slug ? `${origin}/u/${form.slug}` : '';

  useEffect(() => {
    document.title = 'Ma page — Minilytics';
    api<{ page: Page | null; sites: Site[] }>('/api/me/page').then((r) => {
      setSites(r.sites);
      setPage(r.page);
      setForm(r.page ? { ...r.page, avatarUrl: r.page.avatarUrl ?? '', coverUrl: r.page.coverUrl ?? '' } : empty(r.sites));
    }, (e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, []);

  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    setBusy(true); setError(''); setSaved('');
    try {
      const r = await api<{ page: Page }>('/api/me/page', {
        method: 'PUT',
        json: { ...form, avatarUrl: form.avatarUrl || null, coverUrl: form.coverUrl || null },
      });
      setPage(r.page);
      setForm({ ...r.page, avatarUrl: r.page.avatarUrl ?? '', coverUrl: r.page.coverUrl ?? '' });
      setSaved('Enregistré.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function publish(published: boolean) {
    setBusy(true); setError('');
    try {
      if (!page) await save();
      const r = await api<{ page: Page }>('/api/me/page/publish', { method: 'POST', json: { published } });
      setPage(r.page);
      setForm((f) => ({ ...f, published: r.page.published }));
      setSaved(published ? 'Page publiée. Le lien est prêt à être partagé.' : 'Page dépubliée. Le lien public renvoie désormais une page introuvable.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function copy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setSaved('Lien copié.');
  }
  function shareNative() {
    if (!publicUrl) return;
    navigator.share?.({ title: form.title || 'Ma page Minilytics', text: form.bio || undefined, url: publicUrl }).catch(() => {});
  }
  const tweet = publicUrl ? `https://twitter.com/intent/tweet?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(form.title || '')}` : '';
  const linkedin = publicUrl ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}` : '';

  const addSocial = () => set({ socials: [...form.socials, { network: 'website', url: '' }].slice(0, 8) });
  const addWidget = () => set({ widgets: [...form.widgets, { siteId: sites[0]?.id, type: 'counter', style: 'classic', period: '30d' }].slice(0, 8) });

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <AccountHeader current="page" />
      <main id="contenu" className="mx-auto max-w-[880px] px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader kicker="Compte" title="Ma page publique" description="Une page à votre nom, à partager sur les réseaux. Vous choisissez ce qui est visible ; rien n’est public tant que vous ne publiez pas." />
        {loading ? <div className="ml-skeleton h-64 rounded-xl" /> : (
          <div className="space-y-6">
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            {saved && <p className="text-sm text-success" role="status">{saved}</p>}

            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-semibold">Profil</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2"><span className="label">Adresse de la page</span>
                  <span className="mt-1 flex min-w-0 items-center rounded-lg border border-line bg-well focus-within:border-accent">
                    <span className="shrink-0 pl-3 text-[13px] text-ink-4">{origin}/u/</span>
                    <input className="input !mt-0 !rounded-none !border-0 bg-transparent" value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} placeholder="votre-nom" autoComplete="off" spellCheck={false} />
                  </span>
                </label>
                <label className="block"><span className="label">Titre</span>
                  <input className="input mt-1" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Votre nom ou celui du projet" maxLength={80} /></label>
                <label className="block sm:col-span-2"><span className="label">Bio</span>
                  <textarea className="input mt-1 min-h-[88px] py-2" value={form.bio} onChange={(e) => set({ bio: e.target.value.slice(0, 280) })} placeholder="Quelques mots sur vous, en public." maxLength={280} />
                  <span className="mt-1 block text-[11px] text-ink-4">{form.bio.length}/280</span></label>
                <label className="block"><span className="label">Avatar (URL https)</span>
                  <input className="input mt-1" value={form.avatarUrl ?? ''} onChange={(e) => set({ avatarUrl: e.target.value })} placeholder="https://…" inputMode="url" /></label>
                <label className="block"><span className="label">Couverture (URL https)</span>
                  <input className="input mt-1" value={form.coverUrl ?? ''} onChange={(e) => set({ coverUrl: e.target.value })} placeholder="https://…" inputMode="url" /></label>
              </div>
            </section>

            <section className="card p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Liens sociaux</h2>
                <button type="button" className="btn" onClick={addSocial} disabled={form.socials.length >= 8}>Ajouter</button>
              </div>
              <p className="mt-1 text-[13px] text-ink-3">Uniquement des adresses https des réseaux connus. Rien n’est publié à votre place.</p>
              <ul className="mt-3 space-y-2">
                {form.socials.map((s, i) => (
                  <li key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <select className="input !w-auto" value={s.network} onChange={(e) => set({ socials: form.socials.map((x, j) => j === i ? { ...x, network: e.target.value } : x) })}>
                      {NETWORKS.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
                    </select>
                    <input className="input min-w-0 flex-1" value={s.url} placeholder={NETWORKS.find((n) => n.key === s.network)?.placeholder} onChange={(e) => set({ socials: form.socials.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} />
                    <button type="button" className="btn-ghost" aria-label="Retirer" onClick={() => set({ socials: form.socials.filter((_, j) => j !== i) })}>Retirer</button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-4 sm:p-6">
              <h2 className="text-[15px] font-semibold">Apparence</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><span className="label">Thème</span><div className="mt-1"><Segmented label="Thème" value={form.theme} onChange={(v) => set({ theme: v as Page['theme'] })} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} /></div></div>
                <div><span className="label">Mise en page</span><div className="mt-1"><Segmented label="Mise en page" value={form.layout} onChange={(v) => set({ layout: v as Page['layout'] })} options={[{ value: 'stacked', label: 'Colonne' }, { value: 'grid', label: 'Grille' }]} /></div></div>
                <label className="block"><span className="label">Couleur d’accent</span>
                  <input type="color" className="mt-1 h-10 w-16 cursor-pointer rounded-lg border border-line bg-transparent p-1" value={'#' + form.accent} onChange={(e) => set({ accent: e.target.value.slice(1).toLowerCase() })} /></label>
              </div>
            </section>

            <section className="card p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-[15px] font-semibold">Widgets</h2><p className="mt-1 text-[13px] text-ink-3">Chiffres agrégés uniquement, sans revenus. Huit au plus, dans l’ordre d’affichage.</p></div>
                <button type="button" className="btn" onClick={addWidget} disabled={!sites.length || form.widgets.length >= 8}>Ajouter</button>
              </div>
              <ul className="mt-4 space-y-3">
                {form.widgets.map((w, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[140px] flex-1"><span className="label">Site</span>
                        <select className="input mt-1" value={w.siteId} onChange={(e) => set({ widgets: form.widgets.map((x, j) => j === i ? { ...x, siteId: e.target.value } : x) })}>
                          {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.domain}</option>)}
                        </select></label>
                      <label className="min-w-[120px]"><span className="label">Type</span>
                        <select className="input mt-1" value={w.type} onChange={(e) => set({ widgets: form.widgets.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })}>
                          {WTYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select></label>
                      <label className="min-w-[120px]"><span className="label">Style</span>
                        <select className="input mt-1" value={w.style ?? 'classic'} onChange={(e) => set({ widgets: form.widgets.map((x, j) => j === i ? { ...x, style: e.target.value } : x) })}>
                          {STYLES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select></label>
                      {w.type !== 'live' && (
                        <label className="min-w-[120px]"><span className="label">Période</span>
                          <select className="input mt-1" value={w.period ?? '30d'} onChange={(e) => set({ widgets: form.widgets.map((x, j) => j === i ? { ...x, period: e.target.value } : x) })}>
                            {[['today','Aujourd’hui'],['24h','24 h'],['7d','7 jours'],['30d','30 jours'],['90d','90 jours'],['12m','12 mois'],['all','Depuis le début']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select></label>
                      )}
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost !px-2" disabled={i === 0} aria-label="Monter" onClick={() => set({ widgets: move(form.widgets, i, -1) })}>↑</button>
                        <button type="button" className="btn-ghost !px-2" disabled={i === form.widgets.length - 1} aria-label="Descendre" onClick={() => set({ widgets: move(form.widgets, i, 1) })}>↓</button>
                        <button type="button" className="btn-ghost text-danger" onClick={() => set({ widgets: form.widgets.filter((_, j) => j !== i) })}>Retirer</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-dark" disabled={busy} onClick={save}>Enregistrer</button>
              {page && !form.published && <button type="button" className="btn" disabled={busy} onClick={() => publish(true)}>Publier la page</button>}
              {form.published && <button type="button" className="btn" disabled={busy} onClick={() => publish(false)}>Dépublier</button>}
              {form.published && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[12px] font-medium text-success">En ligne</span>}
            </div>

            {page && (
              <section className="card p-4 sm:p-6">
                <h2 className="text-[15px] font-semibold">Partager</h2>
                <p className="mt-1 text-[13px] text-ink-3">Les boutons ouvrent une fenêtre de composition (X ou LinkedIn). Rien n’est envoyé automatiquement.</p>
                {form.published ? (
                  <>
                    <div className="mt-3"><CodeBlock code={publicUrl} label="URL" /></div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn" onClick={copy}><UiIcon name="copy" size={14} /> Copier le lien</button>
                      {'share' in navigator && <button type="button" className="btn" onClick={shareNative}><UiIcon name="share" size={14} /> Partager</button>}
                      <a className="btn" href={tweet} target="_blank" rel="noopener noreferrer">Partager sur X</a>
                      <a className="btn" href={linkedin} target="_blank" rel="noopener noreferrer">Partager sur LinkedIn</a>
                      <a className="btn" href={publicUrl} target="_blank" rel="noopener noreferrer">Voir la page</a>
                    </div>
                  </>
                ) : <p className="mt-2 text-[13px] text-ink-3">Publiez la page pour activer le lien public.</p>}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function move<T>(arr: T[], i: number, dir: number) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  const [it] = next.splice(i, 1);
  next.splice(j, 0, it);
  return next;
}

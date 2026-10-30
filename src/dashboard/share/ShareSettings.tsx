import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type Site } from '../lib/api';
import { fmtAgo } from '../lib/format';
import { UiIcon } from '../components/UiIcon';
import { VIEW_LABEL } from './labels';

type View = 'overview' | 'sources' | 'pages' | 'map' | 'tech' | 'goals';
interface Hide { revenue: boolean; cities: boolean; referrers: boolean }
export interface ShareLink { id: string; token: string; label: string; views: View[]; hide: Hide; noindex: boolean; expiresAt: number | null; hasPassword: boolean; viewCount: number; lastViewedAt: number | null; createdAt: number }

const ALL_VIEWS: View[] = ['overview', 'sources', 'pages', 'map', 'tech', 'goals'];
const VIEW_HINT: Record<View, string> = { overview: 'Indicateurs et courbe', sources: 'Canaux, référents, UTM', pages: 'Top, entrée, sortie, domaines', map: 'Carte, pays, régions', tech: 'Appareils, navigateurs, OS', goals: 'Objectifs atteints' };

interface Draft { label: string; views: View[]; hide: Hide; noindex: boolean; expires: string; password: string; protect: boolean }
const blank = (): Draft => ({ label: '', views: ['overview', 'sources', 'pages', 'map', 'tech'], hide: { revenue: true, cities: false, referrers: true }, noindex: true, expires: '', password: '', protect: false });
const toDay = (ts: number) => new Date(ts - new Date(ts).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function ShareSettings({ site }: { site: Site }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState('');
  const reload = () => api<ShareLink[]>(`/api/sites/${site.id}/shares`).then(setLinks, (e) => setError((e as Error).message));
  useEffect(() => { reload(); }, [site.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="partage" className="card min-w-0 scroll-mt-24 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Tableaux de bord partagés</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-3">Des liens en lecture seule, sans compte : choisissez les vues visibles, masquez les revenus ou les villes, protégez par mot de passe, fixez une date d’expiration. Tout est appliqué côté serveur.</p>
        </div>
        {editing !== 'new' && <button className="btn-dark" onClick={() => setEditing('new')}><UiIcon name="plus" size={16} /> Nouveau lien</button>}
      </div>
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      {editing === 'new' && <div className="mt-4"><LinkForm site={site} onDone={(l) => { setEditing(null); if (l) reload(); }} /></div>}
      <div className="mt-4 space-y-3">
        {links === null && <div className="ml-loading h-24 rounded-xl" />}
        {links?.length === 0 && editing !== 'new' && (
          <div className="rounded-xl border border-dashed border-line-strong p-5 text-center">
            <p className="text-sm font-medium">Aucun lien de partage</p>
            <p className="mt-1 text-[13px] text-ink-3">Créez un lien pour un investisseur, un client ou votre communauté. Vous pourrez le révoquer à tout moment.</p>
          </div>
        )}
        {links?.map((l) => editing === l.id
          ? <LinkForm key={l.id} site={site} link={l} onDone={(x) => { setEditing(null); if (x) reload(); }} />
          : <LinkRow key={l.id} site={site} link={l} onEdit={() => setEditing(l.id)} onChange={reload} />)}
      </div>
    </section>
  );
}

function LinkRow({ site, link, onEdit, onChange }: { site: Site; link: ShareLink; onEdit: () => void; onChange: () => void }) {
  const url = `${window.location.origin}/share/${link.token}`;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const expired = link.expiresAt != null && link.expiresAt <= Date.now();
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); onChange(); } finally { setBusy(false); } };
  return (
    <div className="rounded-xl border border-line p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-[14px] font-semibold">{link.label}</span>
        {link.hasPassword && <Badge icon="lock">Mot de passe</Badge>}
        {expired ? <Badge tone="danger">Expiré</Badge> : link.expiresAt ? <Badge icon="clock">Jusqu’au {new Date(link.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</Badge> : null}
        {link.hide.revenue ? <Badge>Sans revenus</Badge> : <Badge tone="accent">Revenus visibles</Badge>}
        {link.hide.cities && <Badge>Sans villes</Badge>}
        {!link.noindex && <Badge>Indexable</Badge>}
      </div>
      <p className="mt-1 text-[12px] text-ink-3">{link.views.map((v) => VIEW_LABEL[v]).join(' · ')}</p>
      <div className="mt-3 flex min-w-0 items-center gap-2">
        <input className="input min-w-0 flex-1 font-mono !text-[12px]" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={`Lien de partage ${link.label}`} />
        <button className="btn shrink-0" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          <UiIcon name={copied ? 'check' : 'copy'} size={15} /><span className="hidden sm:inline">{copied ? 'Copié' : 'Copier'}</span>
        </button>
        <a className="btn shrink-0" href={url} target="_blank" rel="noopener" aria-label="Ouvrir le lien"><UiIcon name="external" size={15} /></a>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-ink-3"><UiIcon name="eye" size={13} className="mr-1 inline -translate-y-px" />{link.viewCount} {link.viewCount > 1 ? 'vues' : 'vue'}{link.lastViewedAt ? ` · dernière il y a ${fmtAgo(Date.now() - link.lastViewedAt)}` : ''}</span>
        <div className="flex flex-wrap gap-1">
          <button className="btn-ghost text-[12px]" onClick={onEdit} disabled={busy}>Modifier</button>
          <button className="btn-ghost text-[12px]" disabled={busy} onClick={() => { if (confirm('Générer une nouvelle adresse ? L’ancienne cessera immédiatement de fonctionner.')) act(() => api(`/api/sites/${site.id}/shares/${link.id}`, { method: 'PATCH', json: { regenerate: true } })); }}>Régénérer</button>
          <button className="btn-ghost text-[12px] text-danger" disabled={busy} onClick={() => { if (confirm(`Révoquer « ${link.label} » ? Le lien cessera de fonctionner.`)) act(() => api(`/api/sites/${site.id}/shares/${link.id}`, { method: 'DELETE' })); }}>Révoquer</button>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, icon, tone }: { children: ReactNode; icon?: 'lock' | 'clock'; tone?: 'danger' | 'accent' }) {
  const cls = tone === 'danger' ? 'border-danger/30 text-danger' : tone === 'accent' ? 'border-accent/30 text-accent' : 'border-line text-ink-3';
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{icon && <UiIcon name={icon} size={11} />}{children}</span>;
}

function LinkForm({ site, link, onDone }: { site: Site; link?: ShareLink; onDone: (saved: boolean) => void }) {
  const [d, setD] = useState<Draft>(() => link
    ? { label: link.label, views: link.views, hide: link.hide, noindex: link.noindex, expires: link.expiresAt ? toDay(link.expiresAt) : '', password: '', protect: link.hasPassword }
    : blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const toggleView = (v: View) => v !== 'overview' && set({ views: d.views.includes(v) ? d.views.filter((x) => x !== v) : ALL_VIEWS.filter((x) => x === v || d.views.includes(x)) });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (d.protect && !link?.hasPassword && d.password.length < 6) { setError('Mot de passe : 6 caractères minimum.'); return; }
    const body: Record<string, unknown> = {
      label: d.label.trim() || 'Lien partagé', views: d.views, hide: d.hide, noindex: d.noindex,
      expiresAt: d.expires ? new Date(d.expires + 'T23:59:59').getTime() : null,
    };
    if (!d.protect) { if (link?.hasPassword || !link) body.password = null; }
    else if (d.password) body.password = d.password;
    setBusy(true);
    try {
      await api(link ? `/api/sites/${site.id}/shares/${link.id}` : `/api/sites/${site.id}/shares`, { method: link ? 'PATCH' : 'POST', json: body });
      onDone(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const tomorrow = toDay(Date.now() + 86_400_000);
  return (
    <form onSubmit={submit} className="rounded-xl border border-line-strong bg-well/40 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sh-label">Nom du lien</label>
          <input id="sh-label" className="input" value={d.label} maxLength={80} placeholder="Ex. Investisseurs, Client Acme, Public" onChange={(e) => set({ label: e.target.value })} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="sh-exp">Expiration <span className="font-normal text-ink-4">(facultatif)</span></label>
          <div className="flex gap-2">
            <input id="sh-exp" type="date" className="input" min={tomorrow} value={d.expires} onChange={(e) => set({ expires: e.target.value })} />
            {d.expires && <button type="button" className="btn-ghost shrink-0 text-[12px]" onClick={() => set({ expires: '' })}>Jamais</button>}
          </div>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="label">Vues visibles</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ALL_VIEWS.map((v) => (
            <label key={v} className={`flex min-h-[52px] cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-[13px] ${d.views.includes(v) ? 'border-accent/50 bg-accent/5' : 'border-line bg-surface'} ${v === 'overview' ? 'cursor-default opacity-90' : ''}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={d.views.includes(v)} disabled={v === 'overview'} onChange={() => toggleView(v)} />
              <span><span className="block font-medium">{VIEW_LABEL[v]}</span><span className="block text-[11px] text-ink-3">{v === 'overview' ? 'Toujours incluse' : VIEW_HINT[v]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="label">Données sensibles</legend>
        <div className="space-y-2">
          <Toggle checked={d.hide.revenue} onChange={(v) => set({ hide: { ...d.hide, revenue: v } })} title="Masquer les revenus" desc="Revenus, paiements, clients, conversion et revenu par visiteur sont retirés des réponses." />
          <Toggle checked={d.hide.cities} onChange={(v) => set({ hide: { ...d.hide, cities: v } })} title="Masquer villes et régions" desc="La carte et la localisation restent au niveau des pays." />
          <Toggle checked={d.hide.referrers} onChange={(v) => set({ hide: { ...d.hide, referrers: v } })} title="Masquer les URL référentes complètes" desc="Les domaines restent visibles ; les adresses exactes (qui peuvent contenir des paramètres) non." />
          <Toggle checked disabled title="Masquer les profils de visiteurs" desc="Toujours : un lien partagé n’expose jamais de visiteur, d’e-mail ni de session." />
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="label">Accès</legend>
        <div className="space-y-2">
          <Toggle checked={d.protect} onChange={(v) => set({ protect: v, password: '' })} title="Protéger par mot de passe" desc="10 essais ratés bloquent le lien 15 minutes. Changer le mot de passe déconnecte les lecteurs." />
          {d.protect && (
            <div className="pl-9">
              <input type="password" className="input max-w-xs" autoComplete="new-password" minLength={link?.hasPassword ? undefined : 6} maxLength={200}
                placeholder={link?.hasPassword ? 'Laisser vide pour conserver l’actuel' : '6 caractères minimum'} value={d.password} onChange={(e) => set({ password: e.target.value })} aria-label="Mot de passe du lien" />
            </div>
          )}
          <Toggle checked={d.noindex} onChange={(v) => set({ noindex: v })} title="Ne pas indexer (noindex)" desc="Demande aux moteurs de recherche de ne pas référencer la page." />
        </div>
      </fieldset>

      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={() => onDone(false)}>Annuler</button>
        <button className="btn-dark" disabled={busy}>{busy ? 'Enregistrement…' : link ? 'Enregistrer' : 'Créer le lien'}</button>
      </div>
    </form>
  );
}

function Toggle({ checked, onChange, title, desc, disabled }: { checked: boolean; onChange?: (v: boolean) => void; title: string; desc: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg p-1.5 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
        <span className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
      <span className="min-w-0"><span className="block text-[13px] font-medium">{title}</span><span className="block text-[12px] text-ink-3">{desc}</span></span>
    </label>
  );
}

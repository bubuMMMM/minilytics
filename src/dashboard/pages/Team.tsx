import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../App';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { UiIcon } from '../components/UiIcon';
import { api, type Site } from '../lib/api';
import { fmtAgo } from '../lib/format';
import { ROLE_LABEL, useMe, type Role } from '../lib/me';
import { useApi } from '../lib/useApi';

interface Member { id: string; email: string; name: string | null; role: Role; sites: '*' | string[]; created_at: number; last_login_at: number | null; sessions: number; lastSeen: number | null }
interface InviteRow { id: string; role: Role; sites: '*' | string[]; note: string | null; created_at: number; expires_at: number }
interface TeamData { owner: { sessions: number; lastSeen: number | null }; members: Member[]; invites: InviteRow[] }
interface SessionRow { id: string; created_at: number; last_seen_at: number; ua: string | null; current: boolean }

const ROLE_HELP: Record<'admin' | 'viewer', string> = {
  admin: 'Voit et modifie les sites choisis : réglages, objectifs, entonnoirs, imports, intégrations.',
  viewer: 'Consulte les statistiques des sites choisis, sans rien pouvoir modifier ni voir la clé API.',
};

function device(ua: string | null): string {
  if (!ua) return 'Appareil inconnu';
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const o = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return o ? `${b} · ${o}` : b;
}
const ago = (t: number | null) => (t ? `il y a ${fmtAgo(Date.now() - t)}` : 'jamais');

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1000px] items-center justify-between gap-3 px-4 sm:px-6">
          <button onClick={() => navigate('/sites')} aria-label="Mes sites" className="flex min-h-[44px] items-center rounded-md"><Logo small /></button>
          <div className="flex items-center gap-1 sm:gap-2">
            <button className="btn-ghost !text-[13px]" onClick={() => navigate('/sites')}>Mes sites</button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto max-w-[1000px] space-y-6 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">{children}</main>
    </div>
  );
}

function Card({ title, sub, children, action }: { title: string; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-3">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SitesPicker({ sites, value, onChange }: { sites: Site[]; value: '*' | string[]; onChange: (v: '*' | string[]) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="label">Accès aux sites</legend>
      <label className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-line px-3 text-[14px] sm:min-h-[38px]">
        <input type="checkbox" checked={value === '*'} onChange={(e) => onChange(e.target.checked ? '*' : [])} /> Tous les sites (y compris les futurs)
      </label>
      {value !== '*' && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {sites.map((s) => (
            <label key={s.id} className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-line px-3 text-[14px] sm:min-h-[38px]">
              <input type="checkbox" checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((x) => x !== s.id))} />
              <span className="min-w-0 truncate">{s.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Sessions() {
  const [key, setKey] = useState(0);
  const { data, error } = useApi<SessionRow[]>('/api/auth/sessions', key);
  const [busy, setBusy] = useState(false);
  const others = data?.filter((s) => !s.current).length ?? 0;
  return (
    <Card
      title="Mes sessions"
      sub="Chaque connexion est enregistrée côté serveur : vous pouvez fermer une session à distance, elle cesse de fonctionner dans les secondes qui suivent."
      action={others > 0 && (
        <button className="btn" disabled={busy} onClick={async () => {
          if (!confirm('Déconnecter tous vos autres appareils ? Cette session-ci reste ouverte.')) return;
          setBusy(true);
          try { await api('/api/auth/sessions/revoke-others', { method: 'POST' }); setKey((k) => k + 1); } finally { setBusy(false); }
        }}><UiIcon name="logout" size={15} /> Déconnecter les autres appareils</button>
      )}
    >
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {!data && !error && <div className="ml-skeleton h-16 w-full" />}
      <ul className="divide-y divide-line">
        {data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[14px] font-medium">{device(s.ua)} {s.current && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">Cette session</span>}</p>
              <p className="text-[12px] text-ink-3">Ouverte {ago(s.created_at)} · active {ago(s.last_seen_at)}</p>
            </div>
            {!s.current && <button className="btn" onClick={async () => { await api(`/api/auth/sessions/${s.id}`, { method: 'DELETE' }); setKey((k) => k + 1); }}>Déconnecter</button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InviteForm({ sites, onCreated }: { sites: Site[]; onCreated: () => void }) {
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [access, setAccess] = useState<'*' | string[]>('*');
  const [note, setNote] = useState('');
  const [link, setLink] = useState<{ url: string; expires_at: number } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  return (
    <Card title="Inviter un membre" sub="Aucun e-mail n’est envoyé : Minilytics génère un lien personnel, valable 7 jours et utilisable une seule fois, que vous partagez vous-même. La personne y crée son compte (e-mail + mot de passe).">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        if (access !== '*' && !access.length) return setError('Choisissez au moins un site.');
        try {
          setLink(await api('/api/team/invites', { method: 'POST', json: { role, sites: access, note } }));
          setCopied(false);
          onCreated();
        } catch (err) { setError((err as Error).message); }
      }}>
        <fieldset>
          <legend className="label">Rôle</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['viewer', 'admin'] as const).map((r) => (
              <label key={r} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${role === r ? 'border-accent ring-1 ring-accent' : 'border-line'}`}>
                <input type="radio" name="role" className="mt-1" checked={role === r} onChange={() => setRole(r)} />
                <span><span className="block text-[14px] font-semibold">{ROLE_LABEL[r]}</span><span className="block text-[12px] leading-relaxed text-ink-3">{ROLE_HELP[r]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <SitesPicker sites={sites} value={access} onChange={setAccess} />
        <div>
          <label className="label" htmlFor="inv-note">Pour qui ? (facultatif, visible par vous seul)</label>
          <input id="inv-note" className="input" maxLength={100} placeholder="ex. Camille — marketing" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        <button className="btn-dark"><UiIcon name="link" size={15} /> Créer le lien d’invitation</button>
      </form>
      {link && (
        <div className="mt-4 rounded-lg border border-accent/40 bg-accent-soft p-3" role="status">
          <p className="text-[13px] font-medium">Lien créé — copiez-le maintenant, il ne sera plus affiché.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly className="input min-w-0 flex-1 font-mono !text-[12px]" value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Lien d’invitation" />
            <button type="button" className="btn shrink-0" onClick={() => navigator.clipboard?.writeText(link.url).then(() => setCopied(true))}><UiIcon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copié' : 'Copier'}</button>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Expire le {new Date(link.expires_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
        </div>
      )}
    </Card>
  );
}

function MemberRow({ m, sites, onChange }: { m: Member; sites: Site[]; onChange: () => void }) {
  const [edit, setEdit] = useState(false);
  const [access, setAccess] = useState<'*' | string[]>(m.sites);
  const names = m.sites === '*' ? 'Tous les sites' : m.sites.map((id) => sites.find((s) => s.id === id)?.name ?? id).join(', ') || 'Aucun site';
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{m.name || m.email}</p>
          <p className="truncate text-[12px] text-ink-3">{m.name ? m.email + ' · ' : ''}{names} · vu {ago(m.lastSeen ?? m.last_login_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label={`Rôle de ${m.email}`} className="input !h-11 !w-auto sm:!h-9" value={m.role} onChange={async (e) => { await api(`/api/team/members/${m.id}`, { method: 'PATCH', json: { role: e.target.value } }); onChange(); }}>
            <option value="admin">Admin</option>
            <option value="viewer">Lecteur</option>
          </select>
          <button className="btn" onClick={() => setEdit((x) => !x)} aria-expanded={edit}>Sites</button>
          <button className="btn text-danger" onClick={async () => {
            if (!confirm(`Révoquer l’accès de ${m.email} ? Son compte est supprimé et toutes ses sessions sont fermées immédiatement.`)) return;
            await api(`/api/team/members/${m.id}`, { method: 'DELETE' });
            onChange();
          }}>Révoquer</button>
        </div>
      </div>
      {edit && (
        <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
          <SitesPicker sites={sites} value={access} onChange={setAccess} />
          <button className="btn-dark" disabled={access !== '*' && !access.length} onClick={async () => { await api(`/api/team/members/${m.id}`, { method: 'PATCH', json: { sites: access } }); setEdit(false); onChange(); }}>Enregistrer l’accès</button>
        </div>
      )}
    </li>
  );
}

export function Team() {
  const me = useMe();
  const owner = me?.role === 'owner';
  const [key, setKey] = useState(0);
  const { data: sites } = useApi<Site[]>('/api/sites');
  const { data: team, error } = useApi<TeamData>(owner ? '/api/team' : null, key);
  useEffect(() => { document.title = 'Équipe et sécurité — Minilytics'; }, []);
  const reload = () => setKey((k) => k + 1);
  return (
    <Shell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Équipe et sécurité</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          {me?.role ? <>Vous êtes connecté en tant que <strong className="font-semibold text-ink">{ROLE_LABEL[me.role]}</strong>{me.email ? ` (${me.email})` : ''}.</> : '\u00a0'}
        </p>
      </div>
      {owner && (
        <Card title="Membres" sub="Rôles : Propriétaire (vous, mot de passe administrateur), Admin, Lecteur. L’accès se règle site par site.">
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <ul className="divide-y divide-line">
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium">Vous</p>
                <p className="text-[12px] text-ink-3">Mot de passe administrateur · tous les sites · {team ? `${team.owner.sessions} session${team.owner.sessions > 1 ? 's' : ''} ouverte${team.owner.sessions > 1 ? 's' : ''}` : '…'}</p>
              </div>
              <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold">Propriétaire</span>
            </li>
            {team?.members.map((m) => <MemberRow key={m.id + m.role + JSON.stringify(m.sites)} m={m} sites={sites ?? []} onChange={reload} />)}
          </ul>
          {team && team.members.length === 0 && <p className="mt-2 text-[13px] text-ink-3">Aucun membre pour l’instant. Créez un lien d’invitation ci-dessous.</p>}
          {team && team.invites.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-[13px] font-semibold text-ink-2">Invitations en attente</h3>
              <ul className="mt-2 divide-y divide-line">
                {team.invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                    <span className="min-w-0">{i.note || 'Invitation'} · {ROLE_LABEL[i.role]} · {i.sites === '*' ? 'tous les sites' : `${i.sites.length} site${i.sites.length > 1 ? 's' : ''}`} · expire {new Date(i.expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                    <button className="btn" onClick={async () => { await api(`/api/team/invites/${i.id}`, { method: 'DELETE' }); reload(); }}>Annuler</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      {owner && sites && <InviteForm sites={sites} onCreated={reload} />}
      <Sessions />
    </Shell>
  );
}

export function Invite({ token, onJoined }: { token: string; onJoined: () => void }) {
  const [info, setInfo] = useState<{ valid: boolean; role?: Role; allSites?: boolean; sites?: string[] | null; expires_at?: number } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = 'Invitation — Minilytics';
    api(`/api/invites/${token}`).then(setInfo, () => setInfo({ valid: false }));
  }, [token]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <a href="/" className="flex min-h-[44px] items-center"><Logo /></a>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
          {!info && <div className="ml-skeleton h-40 w-full" />}
          {info && !info.valid && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Invitation indisponible</h1>
              <p className="mt-2 text-[14px] text-ink-3">Ce lien a expiré, a déjà été utilisé ou a été annulé. Demandez un nouveau lien à la personne qui vous a invité.</p>
              <a href="/login" className="btn mt-5">Se connecter</a>
            </>
          )}
          {info?.valid && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Rejoindre Minilytics</h1>
              <p className="mt-1 text-[14px] text-ink-3">
                Rôle : <strong className="text-ink">{ROLE_LABEL[info.role!]}</strong> · {info.allSites ? 'tous les sites' : info.sites?.join(', ')}
              </p>
              <form className="mt-6 space-y-4" aria-busy={busy} onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                if (form.password.length < 10) return setError('Mot de passe : 10 caractères minimum.');
                if (form.password !== form.confirm) return setError('Les deux mots de passe ne correspondent pas.');
                setBusy(true);
                try {
                  await api(`/api/invites/${token}/accept`, { method: 'POST', json: { name: form.name, email: form.email, password: form.password } });
                  onJoined();
                } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
              }}>
                <div><label className="label" htmlFor="iv-name">Nom</label><input id="iv-name" className="input !h-11" autoComplete="name" value={form.name} onChange={set('name')} /></div>
                <div><label className="label" htmlFor="iv-email">E-mail</label><input id="iv-email" type="email" required className="input !h-11" autoComplete="username" value={form.email} onChange={set('email')} /></div>
                <div><label className="label" htmlFor="iv-pw">Mot de passe</label><input id="iv-pw" type="password" required minLength={10} className="input !h-11" autoComplete="new-password" value={form.password} onChange={set('password')} /><p className="mt-1 text-[12px] text-ink-4">10 caractères minimum. Stocké sous forme de hachage PBKDF2.</p></div>
                <div><label className="label" htmlFor="iv-pw2">Confirmer le mot de passe</label><input id="iv-pw2" type="password" required className="input !h-11" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></div>
                {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger" role="alert">{error}</div>}
                <button className="btn-dark !h-11 w-full" disabled={busy}>{busy ? 'Création…' : 'Créer mon compte'}</button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

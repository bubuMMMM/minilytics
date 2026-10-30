import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { UiIcon } from '../components/UiIcon';
import { ThemeToggle } from '../components/ThemeToggle';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [member, setMember] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Autofocus only with a mouse: on phones the keyboard would jump up and shift the layout.
  const [autoFocus] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches);
  useEffect(() => { document.title = 'Connexion — Minilytics'; }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', json: member ? { email, password } : { password } });
      onLogin();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 401 ? (member ? 'E-mail ou mot de passe incorrect.' : 'Mot de passe incorrect. Vérifiez-le puis réessayez.') : status === 429 ? 'Trop de tentatives. Patientez quelques minutes puis réessayez.' : 'Connexion impossible pour le moment. Vérifiez votre réseau puis réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-canvas">
      <div className="ml-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[460px]" aria-hidden />
      <header className="relative">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <a href="/" aria-label="Retour à l’accueil" className="flex min-h-[44px] items-center rounded-md"><Logo /></a>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <a href="/demo" className="btn-ghost !text-[13px]">Voir la démo</a>
          </div>
        </div>
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-10 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">
          <div className="rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight">Connexion</h1>
            <p className="mt-1 text-[14px] text-ink-3">{member ? 'Connectez-vous avec le compte créé depuis votre invitation.' : 'Accédez à vos sites et à leurs statistiques.'}</p>
            <div className="tabs mt-5 w-full" role="tablist" aria-label="Type de compte">
              <button type="button" role="tab" aria-selected={!member} className={`tab flex-1 ${!member ? 'tab-active' : ''}`} onClick={() => { setMember(false); setError(''); }}>Propriétaire</button>
              <button type="button" role="tab" aria-selected={member} className={`tab flex-1 ${member ? 'tab-active' : ''}`} onClick={() => { setMember(true); setError(''); }}>Membre de l’équipe</button>
            </div>
            <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={busy}>
              {member && (
                <div>
                  <label className="label" htmlFor="email">E-mail</label>
                  <input id="email" type="email" autoComplete="username" required className="input !h-11" value={email} onChange={(e) => setEmail(e.target.value)} spellCheck={false} />
                </div>
              )}
              <div>
                <label className="label" htmlFor="pw">Mot de passe</label>
                <div className="relative">
                  <input id="pw" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="input !h-11 !pr-12" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={autoFocus} spellCheck={false} />
                  <button type="button" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-4 hover:text-ink" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} aria-pressed={showPassword}><UiIcon name="eye" size={16}/></button>
                </div>
              </div>
              {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger" role="alert">{error}</div>}
              <button className="btn-dark !h-11 w-full" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
            </form>
          </div>
          <p className="mt-5 text-center text-[13px] text-ink-3">Pas encore de compte ? <a href="/signup" className="font-medium text-ink underline-offset-4 hover:underline">Créer un compte</a></p>
        </div>
      </main>
    </div>
  );
}

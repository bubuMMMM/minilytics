import { useState } from 'react';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import { UiIcon } from '../components/UiIcon';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', json: { password } });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-site-bg flex min-h-screen flex-col bg-[#ffffff]">
      <header className="border-b border-[#e8edf5]">
        <div className="mx-auto flex h-[80px] max-w-[1380px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="/" aria-label="Retour à l'accueil"><Logo /></a>
          <a href="/" className="btn !px-3 sm:!px-4">Voir la démo <UiIcon name="arrow-up-right" size={16}/></a>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-[1280px] flex-1 items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:gap-20 lg:py-20">
        <div className="hidden overflow-hidden rounded-[28px] bg-[#f6f8ff] p-10 text-[#182641] shadow-none border border-[#e5ebfa] lg:block">
          <div className="ml-kicker !text-[#6576e8]"><span className="ml-dot" /> ACCÈS À VOS DONNÉES</div>
          <h1 className="ml-heading mt-7 text-[clamp(2.7rem,4vw,4.3rem)]">Ce qui compte,<br/>en un <span className="text-[#536af0]">coup d'œil.</span></h1>
          <p className="mt-6 max-w-[420px] text-[15px] leading-[1.8] text-[#7c8aa3]">Vos sites, vos visiteurs et vos conversions, au même endroit. Sans bruit. Sans chiffres inventés.</p>
          <div className="relative mt-12 overflow-hidden rounded-[24px] border border-[#e4ebf8] bg-[#ffffff] p-7">
            <div className="ml-hero-signal pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] opacity-70" />
            <div className="relative grid grid-cols-2 gap-4">
              {[
                { icon: 'activity' as const, title: 'Temps réel', caption: 'Le trafic en direct' },
                { icon: 'globe' as const, title: 'Live Globe', caption: 'Audience dans le monde' },
                { icon: 'bar-chart' as const, title: 'Statistiques', caption: 'Les signaux essentiels' },
                { icon: 'shield' as const, title: 'Données privées', caption: 'Accès protégé' },
              ].map(item => <div key={item.title} className="rounded-[17px] border border-[#e7edf8] bg-white p-4"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#536af0]/10 text-[#536af0]"><UiIcon name={item.icon} size={19}/></span><p className="mt-4 text-[13px] font-semibold">{item.title}</p><p className="mt-1.5 text-[11px] text-[#8996ad]">{item.caption}</p></div>)}
            </div>
          </div>
          <p className="mt-7 text-xs text-[#8190a5]">Une plateforme légère, pensée pour comprendre, pas pour compliquer.</p>
        </div>

        <div className="mx-auto w-full max-w-[440px] py-6">
          <div className="ml-kicker"><span className="ml-dot" /> ESPACE PRIVÉ</div>
          <h2 className="ml-heading mt-5 text-[clamp(2.7rem,5vw,3.8rem)]">Heureux de<br/>vous revoir<span className="text-[#4f62ef]">.</span></h2>
          <p className="mt-5 max-w-[350px] text-[14px] leading-relaxed text-[#7c8aa3]">Connectez-vous pour retrouver vos projets et vos analyses.</p>
          <form onSubmit={submit} className="mt-10 space-y-4" aria-busy={busy}>
            <div>
              <label className="label" htmlFor="pw">Mot de passe</label>
              <div className="relative">
                <input id="pw" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="input !h-[55px] !pr-16" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#92897e] hover:bg-[#f6f8ff] hover:text-[#3a4961]" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'}><UiIcon name="eye" size={19}/></button>
              </div>
            </div>
            {error && <div className="rounded-xl border border-[#ffc1ca] bg-[#fff2f5] p-3 text-[13px] text-[#bf5263]" role="alert">{error}</div>}
            <button className="btn-dark !h-[55px] w-full" disabled={busy || !password}>{busy ? 'Connexion en cours…' : 'Accéder à mes statistiques'} <UiIcon name="arrow-right" size={17}/></button>
          </form>
          <div className="mt-9 flex items-center gap-3 border-t border-[#e8edf5] pt-6 text-[12px] text-[#8996aa]"><UiIcon name="shield" size={17} className="text-[#4f62ef]"/> Vos données sont protégées par votre espace privé.</div>
        </div>
      </main>
    </div>
  );
}

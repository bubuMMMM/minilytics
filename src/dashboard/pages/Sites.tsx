import { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { Favicon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { UiIcon } from '../components/UiIcon';
import { api, type Site } from '../lib/api';
import { fmtNumber } from '../lib/format';

export function Sites() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    api<Site[]>('/api/sites', { signal: controller.signal }).then(setSites).catch((err: Error) => {
      if (!controller.signal.aborted) setLoadError(err.message || 'Impossible de charger les sites.');
    });
    return () => controller.abort();
  }, [attempt]);

  const visibleSites = sites?.filter((site) => (site.name + ' ' + site.domain).toLowerCase().includes(search.trim().toLowerCase()));
  const online = sites?.reduce((n, s) => n + (s.online ?? 0), 0) ?? 0;

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    window.dispatchEvent(new Event('ml:logout'));
    navigate('/');
  }

  return (
    <div className="ml-site-bg min-h-screen">
      <header className="border-b border-[#ece6e0] bg-[#faf9f6]/85">
        <div className="mx-auto flex h-[76px] max-w-[1380px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-12">
          <button onClick={() => navigate('/sites')} aria-label="Mes sites"><Logo /></button>
          <div className="flex items-center gap-2">
            <button className="btn hidden sm:inline-flex" onClick={() => navigate('/')}>Voir la démo <UiIcon name="arrow-up-right" size={16}/></button>
            <button className="btn !px-3 sm:!px-4" onClick={logout}><UiIcon name="logout" size={16} /><span className="hidden sm:inline">Déconnexion</span></button>
            <button className="btn-dark !px-3 sm:!px-4" onClick={() => setAdding(true)}><UiIcon name="plus" size={17}/><span className="hidden sm:inline">Ajouter un site</span><span className="sm:hidden">Ajouter</span></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-5 pb-24 pt-12 sm:px-8 sm:pt-16 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="ml-kicker"><span className="ml-dot" /> WORKSPACE / VOS PROJETS</div>
            <h1 className="ml-heading mt-4 text-[clamp(2.55rem,5vw,4.3rem)]">Votre trafic, à portée de main<span className="text-[#df795c]">.</span></h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#82786f]">Tous vos sites au même endroit. Suivez vos visiteurs, comprenez votre audience et repérez les signaux qui comptent.</p>
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {[
            { label: 'Sites connectés', value: sites ? fmtNumber(sites.length) : '—', icon: 'globe' as const },
            { label: 'Visiteurs · 24 heures', value: sites ? fmtNumber(sites.reduce((n, s) => n + (s.visitors24h ?? 0), 0)) : '—', icon: 'users' as const },
            { label: 'En ligne maintenant', value: sites ? fmtNumber(online) : '—', icon: 'activity' as const },
          ].map((card) => <div key={card.label} className="ml-panel flex min-w-0 items-center justify-between gap-4 p-5 sm:p-6">
            <div><p className="text-[12px] text-[#978d83]">{card.label}</p><p className="mt-2 text-[33px] font-semibold leading-none tracking-[-.055em]">{card.value}</p></div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fcf0e8] text-[#c88668]"><UiIcon name={card.icon} size={21}/></span>
          </div>)}
        </div>

        <div className="mt-12 flex flex-wrap items-end justify-between gap-5">
          <div><h2 className="ml-section-heading text-[26px] sm:text-[32px]">Mes sites</h2><p className="mt-2 text-[13px] text-[#998e84]">Choisissez un projet pour explorer ses statistiques.</p></div>
          {sites && sites.length > 3 && <div className="relative w-full sm:w-72"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#aaa095]"><UiIcon name="search" size={18}/></span><input aria-label="Rechercher un site" className="input !pl-11" type="search" placeholder="Rechercher un site..." value={search} onChange={(e) => setSearch(e.target.value)}/></div>}
        </div>

        {loadError && <div className="ml-panel mt-5 p-5" role="alert"><p className="text-sm text-red-700">{loadError}</p><button className="btn mt-4" onClick={() => setAttempt(n => n + 1)}>Réessayer</button></div>}
        {!sites && !loadError && <div className="mt-5 grid gap-4 sm:grid-cols-3" role="status">{[0,1,2].map((i)=><div key={i} className="ml-loading h-52 rounded-3xl" />)}</div>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSites?.map((site) => (
            <button key={site.id} onClick={() => navigate('/site/' + site.id)} className="ml-panel group flex min-h-[230px] flex-col p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:border-[#e6d2c4] hover:shadow-[0_18px_50px_rgba(48,36,26,.08)]">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[15px] border border-[#eee7e0] bg-[#f8f5f1]"><Favicon domain={site.domain} size={25} /></span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#e6eee6] bg-[#f6faf5] px-2.5 py-1.5 text-[11px] font-semibold text-[#658a72]"><i className={'inline-block h-1.5 w-1.5 rounded-full ' + (site.online ? 'animate-pulse bg-[#55b889]' : 'bg-[#aebbb2]')} />{site.online ?? 0} en ligne</span>
              </div>
              <div className="mt-4 min-w-0"><p className="truncate text-lg font-semibold tracking-tight">{site.name}</p><p className="mt-1 truncate text-[12px] text-[#958a80]">{site.domain}</p></div>
              <div className="mt-auto flex items-end justify-between border-t border-[#f0ebe6] pt-5">
                <div><p className="text-[27px] font-semibold leading-none tracking-[-.055em]">{fmtNumber(site.visitors24h ?? 0)}</p><p className="mt-1.5 text-[11px] text-[#9f958b]">Visiteurs sur 24 heures</p></div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdf2eb] text-[#cc805f] transition-all group-hover:bg-[#df795c] group-hover:text-white"><UiIcon name="arrow-up-right" size={18}/></span>
              </div>
            </button>
          ))}

          {sites && sites.length > 0 && <button onClick={() => setAdding(true)} className="group flex min-h-[230px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#dfd2c6] bg-[#f9f6f2] p-7 text-center transition hover:border-[#cf9d85] hover:bg-[#fdf4eb]"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0e8e0] text-[#bb8b71] transition group-hover:bg-[#f8dfcf]"><UiIcon name="plus" size={23}/></span><h3 className="mt-4 font-semibold">Connecter un autre site</h3><p className="mt-1 max-w-[210px] text-[12px] leading-relaxed text-[#96877b]">Une installation légère. Des données vraiment utiles.</p></button>}

          {sites && sites.length === 0 && <section className="ml-panel col-span-full overflow-hidden p-6 sm:p-10">
            <div className="ml-kicker">BIENVENUE DANS MINILYTICS</div>
            <h2 className="ml-section-heading mt-4 max-w-xl text-[30px] sm:text-[38px]">Votre premier insight commence ici.</h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-[#8c8279]">Quelques minutes suffisent pour connecter votre site et commencer à explorer de vraies visites.</p>
            <ol className="mt-10 grid gap-6 border-t border-[#eee9e3] pt-8 sm:grid-cols-3">
              {[
                ['Connectez votre site', 'Entrez votre domaine et choisissez vos réglages.'],
                ['Installez le script', 'Copiez le code de suivi dans votre site.'],
                ['Explorez les visites', 'Regardez les premières statistiques arriver.'],
              ].map(([title, detail], index) => <li key={title}><span className="font-mono text-[12px] font-semibold text-[#d98e6f]">0{index+1} /</span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-[13px] leading-relaxed text-[#92867b]">{detail}</p></li>)}
            </ol>
            <button className="btn-dark mt-9" onClick={() => setAdding(true)}>Connecter mon premier site <UiIcon name="arrow-right" size={17}/></button>
            <p className="mt-3 text-[11px] text-[#a79c91]">Les statistiques apparaissent après l'installation du script de suivi.</p>
          </section>}

          {sites && sites.length > 0 && visibleSites?.length === 0 && <p className="col-span-full py-10 text-sm text-[#968a80]">Aucun site ne correspond à « {search} ».</p>}
        </div>
      </main>
      <AddSite open={adding} onClose={() => setAdding(false)}/>
    </div>
  );
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'JPY', 'BRL'];

function AddSite({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError('');
    if (!domain.trim()) return;
    try { new Intl.DateTimeFormat('en', { timeZone: timezone.trim() }); }
    catch { setError('Fuseau horaire invalide (exemple : Europe/Paris).'); return; }
    submitting.current = true;
    setBusy(true);
    try {
      const site = await api<Site>('/api/sites', { method: 'POST', json: { domain: domain.trim(), name: name.trim(), timezone: timezone.trim(), currency } });
      navigate(`/site/${site.id}/settings`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!submitting.current) onClose(); }} title="Ajouter un site" width="max-w-md">
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <p className="text-sm text-stone-500">Un petit script à installer, et les premières statistiques arriveront automatiquement.</p>
        <fieldset disabled={busy} className="space-y-4">
        <div>
          <label className="label" htmlFor="site-domain">Domaine</label>
          <input id="site-domain" required autoCapitalize="none" spellCheck={false} aria-describedby="domain-help" className="input" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoFocus />
          <p id="domain-help" className="mt-1 text-xs text-stone-500">Saisissez un domaine ou une URL complète. Les sous-domaines sont aussi suivis.</p>
        </div>
        <div>
          <label className="label" htmlFor="site-name">Nom du site (facultatif)</label>
          <input id="site-name" maxLength={100} className="input" placeholder="My SaaS" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="site-timezone">Timezone</label>
            <input id="site-timezone" required className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="site-currency">Devise</label>
            <select id="site-currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="btn-dark w-full" disabled={busy || !domain.trim()}>
          {busy ? 'Connexion…' : 'Ajouter le site et obtenir le script'}
        </button>
      </form>
    </Modal>
  );
}

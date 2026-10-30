import { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { Favicon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { Sparkline, Trend } from '../components/Sparkline';
import { UiIcon } from '../components/UiIcon';
import { ThemeToggle } from '../components/ThemeToggle';
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

  const totals = [
    { label: 'Sites', value: sites ? fmtNumber(sites.length) : null },
    { label: 'Visiteurs · 24 h', value: sites ? fmtNumber(sites.reduce((n, s) => n + (s.visitors24h ?? 0), 0)) : null },
    { label: 'En ligne', value: sites ? fmtNumber(online) : null, live: true },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#contenu" className="ml-skip">Aller au contenu</a>
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <button onClick={() => navigate('/sites')} aria-label="Mes sites" className="flex min-h-[44px] items-center rounded-md"><Logo small /></button>
          <div className="flex items-center gap-1 sm:gap-2">
            <button className="btn-ghost hidden !text-[13px] sm:inline-flex" onClick={() => navigate('/demo')}>Démo publique</button>
            <ThemeToggle />
            <button className="btn-ghost !text-[13px]" onClick={logout} aria-label="Se déconnecter"><UiIcon name="logout" size={15} /><span className="hidden sm:inline">Déconnexion</span></button>
          </div>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Mes sites</h1>
            <p className="mt-1 text-[13px] text-ink-3">Choisissez un site pour ouvrir ses statistiques.</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {sites && sites.length > 3 && <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"><UiIcon name="search" size={15}/></span><input aria-label="Rechercher un site" className="input !pl-9" type="search" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}/></div>}
            <button className="btn-dark shrink-0" onClick={() => setAdding(true)}><UiIcon name="plus" size={15}/>Ajouter un site</button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
          {totals.map((t, i) => (
            <div key={t.label} className={`min-w-0 px-4 py-3.5 sm:px-5 ${i ? 'border-l border-line' : ''}`}>
              <dt className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">{t.live && <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-success' : 'bg-line-strong'}`} aria-hidden />}{t.label}</dt>
              <dd className="tnum mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{t.value ?? <span className="ml-skeleton inline-block h-5 w-10 align-middle" />}</dd>
            </div>
          ))}
        </dl>

        {loadError && <div className="mt-5 rounded-xl border border-line bg-surface p-5" role="alert"><p className="text-sm text-danger">{loadError}</p><button className="btn mt-4" onClick={() => setAttempt(n => n + 1)}>Réessayer</button></div>}
        {!sites && !loadError && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Chargement des sites">{[0,1,2].map((i)=><div key={i} className="h-[184px] rounded-xl border border-line bg-surface p-5"><div className="ml-skeleton h-4 w-32" /><div className="ml-skeleton mt-2 h-3 w-24" /><div className="ml-skeleton mt-8 h-12 w-full" /></div>)}</div>}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSites?.map((site) => {
            const sp = site.spark ?? [];
            const last7 = sp.slice(-7).reduce((x, y) => x + y, 0);
            const prev7 = sp.slice(-14, -7).reduce((x, y) => x + y, 0);
            return (
              <a key={site.id} href={'/site/' + site.id} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('/site/' + site.id); }}
                className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-xs transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas"><Favicon domain={site.domain} size={18} /></span>
                    <div className="min-w-0"><p className="truncate text-[15px] font-semibold tracking-tight">{site.name}</p><p className="truncate font-mono text-[12px] text-ink-3" translate="no">{site.domain}</p></div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-3"><i className={'inline-block h-1.5 w-1.5 rounded-full ' + (site.online ? 'bg-success' : 'bg-line-strong')} />{site.online ?? 0}</span>
                </div>
                <div className="mt-5 h-12 text-accent" title="Visiteurs par jour, 14 derniers jours">{sp.length > 1 ? <Sparkline data={sp} height={48} className="text-accent" /> : <div className="mt-11 h-px bg-line" />}</div>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3 text-[12px] text-ink-3">
                  <div><span className="tnum text-[15px] font-semibold text-ink">{fmtNumber(last7)}</span> <span>visiteurs · 7 j</span> <Trend cur={last7} prev={prev7} /></div>
                  <div className="text-right"><span className="tnum font-medium text-ink-2">{fmtNumber(site.visitors24h ?? 0)}</span> · 24 h</div>
                </div>
              </a>
            );
          })}

          {sites && sites.length > 0 && <button onClick={() => setAdding(true)} className="flex min-h-[184px] flex-col items-center justify-center rounded-xl border border-dashed border-line-strong p-6 text-center text-ink-3 transition-colors hover:border-ink-4 hover:text-ink"><UiIcon name="plus" size={18}/><span className="mt-2 text-[14px] font-medium">Connecter un site</span><span className="mt-1 text-[12px] text-ink-4">Une balise à coller, c’est tout.</span></button>}

          {sites && sites.length === 0 && <section className="col-span-full rounded-xl border border-line bg-surface p-6 sm:p-10">
            <h2 className="text-xl font-semibold tracking-tight">Connectez votre premier site</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-3">Quelques minutes suffisent pour commencer à voir de vraies visites.</p>
            <ol className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
              {[
                ['Ajoutez votre domaine', 'Nom, fuseau horaire et devise.'],
                ['Installez le script', 'Une balise dans le <head> de votre site.'],
                ['Explorez les visites', 'Les premières statistiques arrivent en quelques secondes.'],
              ].map(([title, detail], index) => <li key={title}><span className="flex h-6 w-6 items-center justify-center rounded-full border border-line font-mono text-[12px] text-ink-3">{index+1}</span><h3 className="mt-3 text-[14px] font-semibold">{title}</h3><p className="mt-1 text-[13px] leading-relaxed text-ink-3">{detail}</p></li>)}
            </ol>
            <button className="btn-dark mt-8" onClick={() => setAdding(true)}>Ajouter un site <UiIcon name="arrow-right" size={15}/></button>
          </section>}

          {sites && sites.length > 0 && visibleSites?.length === 0 && <p className="col-span-full py-10 text-sm text-ink-3">Aucun site ne correspond à « {search} ».</p>}
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
        <p className="text-sm text-ink-3">Un petit script à installer, et les premières statistiques arriveront automatiquement.</p>
        <fieldset disabled={busy} className="space-y-4">
        <div>
          <label className="label" htmlFor="site-domain">Domaine</label>
          <input id="site-domain" required autoCapitalize="none" spellCheck={false} aria-describedby="domain-help" className="input" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoFocus />
          <p id="domain-help" className="mt-1 text-xs text-ink-3">Saisissez un domaine ou une URL complète. Les sous-domaines sont aussi suivis.</p>
        </div>
        <div>
          <label className="label" htmlFor="site-name">Nom du site (facultatif)</label>
          <input id="site-name" maxLength={100} className="input" placeholder="Mon site" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="site-timezone">Fuseau horaire</label>
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
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="btn-dark w-full" disabled={busy || !domain.trim()}>
          {busy ? 'Connexion…' : 'Ajouter le site et obtenir le script'}
        </button>
      </form>
    </Modal>
  );
}

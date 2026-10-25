import { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import { Favicon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
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
      if (!controller.signal.aborted) setLoadError(err.message || 'Unable to load your websites.');
    });
    return () => controller.abort();
  }, [attempt]);
  const visibleSites = sites?.filter((site) => `${site.name} ${site.domain}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    window.dispatchEvent(new Event('ml:logout'));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <div className="flex gap-2">
          <button className="btn" onClick={logout}>
            Log out
          </button>
          <button className="btn-dark" onClick={() => setAdding(true)}>
            + Add website
          </button>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your websites</h1>
          <p className="mt-2 text-sm text-stone-500">See what brings visitors. Understand what brings revenue.</p>
        </div>
        {sites && sites.length > 3 && <input aria-label="Search websites" className="input sm:max-w-xs" type="search" placeholder="Search by name or domain…" value={search} onChange={(e) => setSearch(e.target.value)} />}
      </div>
      {loadError ? <div className="card mt-5 p-6" role="alert"><p className="text-sm text-red-700">{loadError}</p><button className="btn mt-4" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
        : !sites && <p className="mt-6 text-sm text-stone-500" role="status">Loading your websites…</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSites?.map((s) => (
          <button key={s.id} onClick={() => navigate(`/site/${s.id}`)} className="card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-3">
              <Favicon domain={s.domain} size={28} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="truncate text-sm text-stone-500">{s.domain}</div>
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <div>
                <div className="text-2xl font-semibold">{fmtNumber(s.visitors24h ?? 0)}</div>
                <div className="text-xs text-stone-500">visitors in the last 24h</div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-stone-600">
                <span className={`h-2 w-2 rounded-full ${s.online ? 'animate-pulse bg-green-500' : 'bg-stone-300'}`} />
                {s.online ?? 0} online
              </div>
            </div>
          </button>
        ))}
        {sites && !sites.length && (
          <div className="card col-span-full p-6 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Start here</p>
            <h2 className="mt-3 text-2xl font-semibold">Your first insight starts with one website.</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-500">Connect your site to see where visitors come from, what they do, and which sources lead to sales.</p>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                ['Add your website', 'Enter your domain and choose your reporting currency.'],
                ['Install the snippet', 'Copy the tracking code into your website.'],
                ['See your first visit', 'Visit your website and watch real traffic arrive.'],
              ].map(([title, detail], index) => <li key={title}><span className="text-sm font-semibold text-stone-400">0{index + 1}</span><h3 className="mt-2 font-medium">{title}</h3><p className="mt-1 text-sm leading-relaxed text-stone-500">{detail}</p></li>)}
            </ol>
            <button className="btn-dark mt-8" onClick={() => setAdding(true)}>Connect your first website</button>
            <p className="mt-3 text-xs text-stone-500">No data appears until you install the tracking snippet.</p>
          </div>
        )}
        {sites && sites.length > 0 && visibleSites?.length === 0 && <p className="col-span-full py-8 text-sm text-stone-500" role="status">No websites match “{search}”.</p>}
      </div>
      <AddSite open={adding} onClose={() => setAdding(false)} />
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
    catch { setError('Choose a valid timezone, for example Europe/Paris.'); return; }
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
    <Modal open={open} onClose={() => { if (!submitting.current) onClose(); }} title="Add a website" width="max-w-md">
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <p className="text-sm text-stone-500">Next, we’ll give you the tracking snippet to install.</p>
        <fieldset disabled={busy} className="space-y-4">
        <div>
          <label className="label" htmlFor="site-domain">Domain</label>
          <input id="site-domain" required autoCapitalize="none" spellCheck={false} aria-describedby="domain-help" className="input" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} autoFocus />
          <p id="domain-help" className="mt-1 text-xs text-stone-500">Paste a domain or full URL. Subdomains (app.example.com) are tracked under the same site.</p>
        </div>
        <div>
          <label className="label" htmlFor="site-name">Name (optional)</label>
          <input id="site-name" maxLength={100} className="input" placeholder="My SaaS" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="site-timezone">Timezone</label>
            <input id="site-timezone" required className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="site-currency">Revenue currency</label>
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
          {busy ? 'Connecting…' : 'Add website & get snippet'}
        </button>
      </form>
    </Modal>
  );
}

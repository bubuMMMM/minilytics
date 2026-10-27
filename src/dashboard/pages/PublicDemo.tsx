import { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { navigate } from '../App';
import { Logo } from '../components/Logo';

type Group = { label: string; value: number };
interface LiveData {
  site: { name: string; domain: string };
  days: number;
  updatedAt: number;
  current: { visitors: number; sessions: number; pageviews: number; avgDurationMs: number };
  previous: { visitors: number };
  last24h: { visitors: number };
  online: number;
  goals: number;
  outboundClicks: number;
  series: { date: string; visitors: number; pageviews: number }[];
  sources: Group[];
  pages: Group[];
  devices: Group[];
}

const number = (value: number) => new Intl.NumberFormat('fr-FR').format(value);
const dateLabel = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function duration(ms: number) {
  if (!ms) return '0 s';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? seconds + ' s' : Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s';
}

function Breakdown({ title, detail, rows, empty }: { title: string; detail: string; rows: Group[]; empty: string }) {
  const largest = Math.max(...rows.map((r) => r.value), 1);
  return (
    <section className="card min-w-0 p-5 sm:p-6">
      <div className="mb-5"><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-xs text-stone-500">{detail}</p></div>
      {rows.length ? <div className="space-y-4">
        {rows.map((r, i) => (
          <div key={r.label + i}>
            <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span className="truncate font-medium" title={r.label}>{r.label}</span><span className="shrink-0 tabular-nums text-stone-500">{number(r.value)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-[#e07b5f]" style={{ width: Math.max(2, r.value / largest * 100) + '%' }} /></div>
          </div>
        ))}
      </div> : <p className="rounded-xl bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">{empty}</p>}
    </section>
  );
}

export function PublicDemo() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(() => setRetry((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch('/api/public/demo?days=' + days, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error('Le service de statistiques ne répond pas (' + r.status + ').'); return r.json() as Promise<LiveData>; })
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message || 'Impossible de récupérer les statistiques.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, retry]);

  const view = data?.days === days ? data : null;
  const stats = [
    { label: 'Visiteurs uniques', value: view ? number(view.current.visitors) : '—', detail: 'Sur ' + days + ' jours' },
    { label: 'Pages vues', value: view ? number(view.current.pageviews) : '—', detail: 'Pages réellement consultées' },
    { label: 'Sessions', value: view ? number(view.current.sessions) : '—', detail: 'Visites enregistrées' },
    { label: 'Durée moyenne', value: view ? duration(view.current.avgDurationMs) : '—', detail: 'Temps actif par session' },
  ];
  const change = view?.previous.visitors ? Math.round(((view.current.visitors - view.previous.visitors) / view.previous.visitors) * 100) : null;

  return (
    <div className="min-h-screen bg-[#f8f6f3]">
      <header className="border-b border-stone-200/70 bg-white/80">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <button onClick={() => navigate('/')} aria-label="Accueil Minilytics"><Logo /></button>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs font-medium text-stone-500 sm:inline-flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Données réelles · Démo publique</span>
            <button onClick={() => navigate('/admin')} className="btn">Espace privé</button>
            <button onClick={() => navigate('/admin')} className="btn-dark">Ajouter mon site <span aria-hidden>↗</span></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f4d4c9] bg-[#fff0e9] px-3 py-1.5 text-xs font-semibold text-[#aa5b41]"><span className="h-1.5 w-1.5 rounded-full bg-[#e07b5f]" /> Analytics sans chiffres inventés</div>
          <h1 className="text-[clamp(2.5rem,6vw,5.25rem)] font-semibold leading-[1.05] tracking-[-0.055em]">Chaque visite raconte <span className="text-[#e07b5f]">une histoire.</span></h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-stone-600 sm:text-lg">Découvre d'où viennent tes visiteurs, quelles pages les intéressent et ce qu'ils font. Ce dashboard suit <strong>Minilytics lui-même</strong> : uniquement de vraies données, actualisées à la demande.</p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-5 sm:mt-12">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg">↗</div>
            <div><h2 className="font-semibold">minilytics-six.vercel.app</h2><p className="text-xs text-stone-500">Dashboard public · lecture seule</p></div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {view ? number(view.online) : '—'} en ligne</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1" aria-label="Période des statistiques">
              {([7, 30] as const).map((d) => <button key={d} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${days === d ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50'}`} aria-pressed={days === d} onClick={() => setDays(d)}>{d} jours</button>)}
            </div>
            <button className="btn h-11" onClick={refresh} disabled={loading} aria-label="Actualiser les données"><span className={loading ? 'inline-block animate-spin' : ''}>↻</span><span className="hidden sm:inline">Actualiser</span></button>
          </div>
        </div>

        {error && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error} {data ? 'Dernières données disponibles ci-dessous.' : ''}</span><button className="btn" onClick={refresh}>Réessayer</button></div>}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" aria-busy={loading}>
          {stats.map((stat) => <div key={stat.label} className="card min-w-0 p-4 sm:p-5"><p className="text-xs font-medium text-stone-500 sm:text-sm">{stat.label}</p><div className="mt-3 truncate text-3xl font-semibold tracking-tight sm:text-[2.5rem]">{stat.value}</div><p className="mt-2 text-xs text-stone-400">{stat.detail}</p></div>)}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <section className="card min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Évolution du trafic</h3><p className="mt-1 text-xs text-stone-500">Visiteurs uniques par jour, en UTC</p></div><span className="text-xs font-medium text-stone-500">{change === null ? 'Première période suivie' : (change >= 0 ? '↑ +' : '↓ ') + change + '% vs période précédente'}</span></div>
            <div className="mt-6 h-[260px] sm:h-[300px]">
              {view ? <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={view.series} margin={{ top: 10, right: 4, left: -23, bottom: 0 }}>
                  <defs><linearGradient id="public-visitors" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e07b5f" stopOpacity={0.28} /><stop offset="100%" stopColor="#e07b5f" stopOpacity={0.015} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#eee9e3" />
                  <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} minTickGap={18} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#a8a29e' }} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(v) => dateLabel(String(v))} formatter={(value: number) => [number(value), 'Visiteurs']} />
                  <Area type="monotone" dataKey="visitors" stroke="#e07b5f" strokeWidth={2.5} fill="url(#public-visitors)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer> : <div className="h-full animate-pulse rounded-xl bg-stone-50" />}
            </div>
          </section>
          <section className="card flex flex-col justify-between p-5 sm:p-6">
            <div><h3 className="font-semibold">En un coup d'œil</h3><p className="mt-1 text-xs text-stone-500">Ce qui s'est passé sur ce site</p></div>
            <div className="my-8 space-y-5">
              {[
                ['Visiteurs · 24 heures', view?.last24h.visitors ?? null],
                ['Clics vers d’autres sites', view?.outboundClicks ?? null],
                ['Objectifs déclenchés', view?.goals ?? null],
              ].map(([label, value]) => <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-stone-100 pb-3"><span className="text-sm text-stone-500">{label}</span><span className="text-2xl font-semibold tabular-nums">{value === null ? '—' : number(Number(value))}</span></div>)}
            </div>
            <p className="rounded-xl bg-[#fff0e9] p-3 text-xs leading-relaxed text-[#87533f]">Les chiffres viennent de la collecte réelle. Un bloqueur de publicité ou un refus de suivi peut empêcher certaines visites d’être comptées.</p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Breakdown title="Sources de trafic" detail="D'où viennent tes visiteurs ?" rows={view?.sources ?? []} empty="Les premières sources apparaîtront après des visites." />
          <Breakdown title="Pages populaires" detail="Ce que les visiteurs consultent" rows={view?.pages ?? []} empty="Aucune page vue sur cette période." />
          <Breakdown title="Appareils" detail="Mobile, ordinateur ou tablette" rows={view?.devices ?? []} empty="En attente de données d’appareil." />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-[#1c1917] p-6 text-white sm:p-9">
          <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Et si tu voyais ça sur ton site ?</h2><p className="mt-2 max-w-xl text-sm text-stone-300">Ajoute un petit script, puis visualise tes vrais visiteurs, tes sources et tes conversions.</p></div>
          <button onClick={() => navigate('/admin')} className="rounded-xl bg-[#e07b5f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#ca6d52]">Connecter mon site ↗</button>
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-400"><span>Minilytics · Analytics simples et transparents</span><span>{view ? 'Dernière mise à jour : ' + new Date(view.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Données en cours de chargement'}</span></footer>
      </main>
    </div>
  );
}

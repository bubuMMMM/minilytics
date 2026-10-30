import { useState } from 'react';
import { api, qs, type BreakdownRow } from '../lib/api';
import { useDash } from '../lib/context';
import { countryName, fmtAgo, fmtDateTime, fmtDuration, fmtNumber, fmtPct, shortId } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Avatar, BrowserIcon, DeviceIcon, Flag, OSIcon, SourceIcon } from './Icons';

type Tab = 'goal' | 'funnel' | 'user' | 'journey';

export function GoalsPanel({ totalVisitors }: { totalVisitors: number }) {
  const [tab, setTab] = useState<Tab>('journey');
  const [search, setSearch] = useState('');
  return (
    <div className="card min-w-0 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="tabs">
          {(['goal', 'funnel', 'user', 'journey'] as const).map((t) => (
            <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
              {t === 'journey' ? 'Parcours d’achat' : t === 'user' ? 'Visiteurs' : t === 'goal' ? 'Objectifs' : 'Entonnoirs'}
            </button>
          ))}
        </div>
        {(tab === 'user' || tab === 'journey') && (
          <input className="input w-full py-1.5 sm:max-w-[240px]" placeholder="🔍 Rechercher" aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
      </div>
      {tab === 'goal' && <Goals totalVisitors={totalVisitors} />}
      {tab === 'funnel' && <Funnels />}
      {tab === 'user' && <Users search={search} />}
      {tab === 'journey' && <Journey search={search} />}
    </div>
  );
}

function Goals({ totalVisitors }: { totalVisitors: number }) {
  const { site, q, reloadKey, money, addFilter } = useDash();
  const { data } = useApi<BreakdownRow[]>(`/api/sites/${site.id}/breakdown?${qs(q, { dim: 'goal' })}`, reloadKey);
  if (!data) return <div className="h-40 animate-pulse" />;
  if (!data.length)
    return (
      <div className="p-8 text-center text-sm text-stone-500">
        Aucun objectif pour l’instant. Ajoutez <code className="rounded bg-stone-100 px-1">data-ml-goal="signup_click"</code> à un bouton, ou appelez{' '}
        <code className="rounded bg-stone-100 px-1">window.minilytics('goal', 'signup')</code>.
      </div>
    );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-stone-500">
          <th className="px-3 pb-2 font-medium">Objectif</th>
          <th className="pb-2 text-right font-medium">Visiteurs</th>
          <th className="hidden pb-2 text-right font-medium sm:table-cell">Réalisations</th>
          <th className="pb-2 text-right font-medium">Conversion</th>
          <th className="hidden px-3 pb-2 text-right font-medium sm:table-cell">Revenus</th>
        </tr>
      </thead>
      <tbody>
        {data.map((g) => (
          <tr key={g.label} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50" onClick={() => addFilter('goal', g.label ?? '')} title="Filtrer sur les visiteurs ayant atteint cet objectif">
            <td className="max-w-[160px] truncate px-3 py-3 font-medium">🎯 {g.label}</td>
            <td className="py-2.5 text-right">{fmtNumber(g.visitors)}</td>
            <td className="hidden py-2.5 text-right sm:table-cell">{fmtNumber(g.pageviews ?? 0)}</td>
            <td className="py-2.5 text-right">{totalVisitors ? fmtPct(g.visitors / totalVisitors, 1) : '—'}</td>
            <td className="hidden px-3 py-2.5 text-right sm:table-cell">{money(g.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface FunnelDef {
  id: string;
  name: string;
  steps: { type: 'page' | 'goal'; value: string }[];
}

function Funnels() {
  const { site, q, reloadKey } = useDash();
  const [version, setVersion] = useState(0);
  const { data: funnels } = useApi<FunnelDef[]>(`/api/sites/${site.id}/funnels`, version);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = funnels?.find((f) => f.id === selected) ?? funnels?.[0];
  const { data: stats } = useApi<(FunnelDef['steps'][0] & { visitors: number })[]>(
    current ? `/api/sites/${site.id}/funnels/${current.id}/stats?${qs(q)}` : null,
    reloadKey + version,
  );

  if (!funnels) return <div className="h-40 animate-pulse" />;
  if (creating || !funnels.length)
    return (
      <FunnelForm
        onDone={(id) => {
          setCreating(false);
          if (id) setSelected(id);
          setVersion((v) => v + 1);
        }}
        canCancel={funnels.length > 0}
      />
    );

  const top = stats?.[0]?.visitors || 0;
  return (
    <div className="px-3 pb-3">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-full py-1.5 sm:w-auto" aria-label="Entonnoir" value={current?.id} onChange={(e) => setSelected(e.target.value)}>
          {funnels.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button className="btn py-1.5" onClick={() => setCreating(true)}>
          + Nouvel entonnoir
        </button>
        {current && (
          <button
            className="btn py-1.5 text-red-600"
            onClick={async () => {
              if (!confirm(`Supprimer l’entonnoir « ${current.name} » ?`)) return;
              await api(`/api/sites/${site.id}/funnels/${current.id}`, { method: 'DELETE' });
              setSelected(null);
              setVersion((v) => v + 1);
            }}
          >
            Supprimer
          </button>
        )}
      </div>
      <div className="space-y-3 md:hidden">
        {stats?.map((s, i) => {
          const pct = top ? s.visitors / top : 0;
          const prev = i ? stats[i - 1].visitors : s.visitors;
          return (
            <div key={i} className="rounded-xl border border-stone-100 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{i + 1}. {s.type === 'goal' ? '🎯 ' : ''}{s.value}</span>
                <span className="tnum shrink-0 font-semibold">{fmtNumber(s.visitors)} · {fmtPct(pct)}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-visitors/70" style={{ width: `${Math.max(pct * 100, 2)}%` }} /></div>
              {i > 0 && <div className="mt-1 text-xs text-red-500">−{prev ? fmtPct(1 - s.visitors / prev) : '0 %'} d’abandon</div>}
            </div>
          );
        })}
      </div>
      <div className="hidden gap-3 md:grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, stats?.length ?? 1)}, minmax(0, 1fr))` }}>
        {stats?.map((s, i) => {
          const pct = top ? s.visitors / top : 0;
          const prev = i ? stats[i - 1].visitors : s.visitors;
          return (
            <div key={i} className="min-w-0">
              <div className="flex h-48 items-end rounded-xl bg-stone-50">
                <div className="w-full rounded-xl bg-visitors/70 transition-all" style={{ height: `${Math.max(pct * 100, 2)}%` }} />
              </div>
              <div className="mt-2 truncate text-sm font-medium" title={s.value}>
                {i + 1}. {s.type === 'goal' ? '🎯 ' : ''}
                {s.value}
              </div>
              <div className="text-sm text-stone-600">
                {fmtNumber(s.visitors)} visiteurs · {fmtPct(pct)}
              </div>
              {i > 0 && <div className="text-xs text-red-500">−{prev ? fmtPct(1 - s.visitors / prev) : '0%'} d’abandon</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunnelForm({ onDone, canCancel }: { onDone: (id?: string) => void; canCancel: boolean }) {
  const { site } = useDash();
  const [name, setName] = useState('Entonnoir d’inscription');
  const [steps, setSteps] = useState<FunnelDef['steps']>([
    { type: 'page', value: '/' },
    { type: 'page', value: '/pricing' },
    { type: 'goal', value: 'checkout' },
  ]);
  const [error, setError] = useState('');
  const set = (i: number, patch: Partial<FunnelDef['steps'][0]>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form
      className="max-w-xl space-y-3 px-3 pb-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const f = await api<FunnelDef>(`/api/sites/${site.id}/funnels`, { method: 'POST', json: { name, steps } });
          onDone(f.id);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p className="text-sm text-stone-500">Les étapes sont comptées dans l’ordre, par visiteur. Les chemins acceptent les jokers, par ex. <code>/blog/*</code>.</p>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l’entonnoir" />
      {steps.map((s, i) => (
        <div key={i} className="flex gap-2">
          <select className="input w-24 shrink-0 sm:w-28" aria-label="Type d’étape" value={s.type} onChange={(e) => set(i, { type: e.target.value as 'page' | 'goal' })}>
            <option value="page">Page</option>
            <option value="goal">Objectif</option>
          </select>
          <input className="input min-w-0" aria-label="Valeur de l’étape" value={s.value} onChange={(e) => set(i, { value: e.target.value })} placeholder={s.type === 'page' ? '/pricing' : 'signup'} />
          <button type="button" aria-label="Retirer l’étape" className="btn shrink-0 px-3" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} disabled={steps.length <= 2}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setSteps((s) => [...s, { type: 'page', value: '' }])} disabled={steps.length >= 10}>
          + Étape
        </button>
        <button className="btn-dark">Enregistrer l’entonnoir</button>
        {canCancel && (
          <button type="button" className="btn" onClick={() => onDone()}>
            Annuler
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function VisitorCell({ id, name, email, country, city, device, os, browser, badge }: Record<string, any>) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar id={id} size={44} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{name || email || `Visiteur ${shortId(id)}`}</span>
          {badge}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-stone-500 sm:text-sm">
          <span className="flex items-center gap-1">
            <Flag cc={country} size={15} /> {city ? `${city}, ` : ''}
            {countryName(country)}
          </span>
          <span className="flex items-center gap-1">
            <DeviceIcon name={device} size={15} /> {device}
          </span>
          <span className="flex items-center gap-1">
            <OSIcon name={os} size={15} /> {os}
          </span>
          <span className="flex items-center gap-1">
            <BrowserIcon name={browser} size={15} /> {browser}
          </span>
        </div>
      </div>
    </div>
  );
}

function matches(r: Record<string, any>, search: string) {
  if (!search) return true;
  const s = search.toLowerCase();
  return ['name', 'email', 'pay_email', 'pay_name', 'source', 'country', 'city', 'visitor_id', 'utm_campaign', 'ref'].some((k) =>
    String(r[k] ?? '').toLowerCase().includes(s),
  );
}

function ShowAll({ total, shown, onClick }: { total: number; shown: number; onClick: () => void }) {
  if (total <= shown) return null;
  return (
    <button className="mx-auto mt-3 block min-h-[44px] text-xs font-semibold uppercase tracking-wider text-stone-500 hover:text-ink" onClick={onClick}>
      Tout afficher ({total})
    </button>
  );
}

const MATCH_LABELS: Record<string, string> = {
  return_page: 'page de retour',
  customer: 'paiement antérieur',
  email: 'e-mail',
  timing: 'clic sur le paiement juste avant',
};

function Journey({ search }: { search: string }) {
  const { site, q, reloadKey, money, openVisitor } = useDash();
  const [all, setAll] = useState(false);
  const [version, setVersion] = useState(0);
  const [rematch, setRematch] = useState<string | null>(null);
  const [reasons, setReasons] = useState<{ id: string; name: string | null; matched: boolean; reason: string | null }[]>([]);
  const { data } = useApi<any[]>(`/api/sites/${site.id}/customers?${qs(q)}`, reloadKey + version);
  if (!data) return <div className="h-40 animate-pulse" />;
  if (!data.length)
    return <div className="p-8 text-center text-sm text-stone-500">Aucun paiement sur cette période. Connectez Dodo Payments dans les réglages pour voir qui a payé et d’où il venait.</div>;
  const unmatched = data.filter((r) => !r.visitor_id).length;
  return (
    <div className="overflow-x-auto">
      {unmatched > 0 && (
        <div className="mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {unmatched} paiement{unmatched > 1 ? 's' : ''} pas encore relié{unmatched > 1 ? 's' : ''} à un visiteur.{' '}
            <a className="underline" href={`/site/${site.id}/settings`}>
              Pourquoi ?
            </a>
          </span>
          <button
            className="btn py-1.5"
            disabled={rematch === 'working'}
            onClick={async () => {
              setRematch('working');
              const r = await api<{ matched: number; checked: number; details: typeof reasons }>(`/api/sites/${site.id}/rematch`, {
                method: 'POST',
              });
              setRematch(`${r.matched} rapproché(s) sur ${r.checked}`);
              setReasons(r.details ?? []);
              setVersion((v) => v + 1);
            }}
          >
            {rematch === 'working' ? 'Rapprochement…' : rematch ?? 'Relancer le rapprochement'}
          </button>
          {reasons.length > 0 && (
            <ul className="w-full space-y-1 border-t border-amber-200 pt-2 text-xs">
              {reasons.map((r) => (
                <li key={r.id}>
                  <b>{r.name ?? r.id}</b>: {r.matched ? '✓ rapproché' : '✗ non rapproché'}
                  {r.reason ? ` · ${r.reason}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ul className="space-y-2 md:hidden">
        {data.filter((r) => matches(r, search)).slice(0, all || search ? undefined : 10).map((r) => (
          <li key={r.id}>
            <button className="w-full rounded-xl border border-stone-100 p-3 text-left active:bg-stone-50" disabled={!r.visitor_id} onClick={() => r.visitor_id && openVisitor(r.visitor_id)}>
              <VisitorCell id={r.visitor_id ?? r.id} name={r.name ?? r.pay_name} email={r.email ?? r.pay_email} country={r.country} city={null} device={r.device} os={r.os} browser={r.browser}
                badge={<span className="rounded-md border border-revenue/30 bg-revenueSoft/50 px-1.5 py-0.5 text-xs text-revenue">{r.renewal ? 'Récurrent' : 'Client'}</span>} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-stone-600">{r.session_id ? <><SourceIcon source={r.source} domain={r.referrer_domain} /> <span className="truncate">{r.source}</span></> : 'Non attribué'}</span>
                <span className="font-semibold">{money(r.amount)}</span>
              </div>
              <div className="mt-1 text-[12px] text-stone-500">{fmtDateTime(r.ts, site.timezone)}{r.first_seen ? ' · après ' + fmtAgo(r.ts - r.first_seen) : ''}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-[15px]">
        <thead>
          <tr className="text-left text-sm text-stone-500">
            <th className="px-3 pb-3 font-medium">Visiteur</th>
            <th className="pb-3 font-medium">Source</th>
            <th className="pb-3 font-medium">Dépensé</th>
            <th className="pb-3 font-medium">Délai d’achat</th>
            <th className="pb-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {data
            .filter((r) => matches(r, search))
            .slice(0, all || search ? undefined : 10)
            .map((r) => (
              <tr
                key={r.id}
                className={`border-t border-stone-100 ${r.visitor_id ? 'cursor-pointer hover:bg-stone-50' : ''}`}
                onClick={() => r.visitor_id && openVisitor(r.visitor_id)}
              >
                <td className="px-3 py-4">
                  <VisitorCell
                    id={r.visitor_id ?? r.id}
                    name={r.name ?? r.pay_name}
                    email={r.email ?? r.pay_email}
                    country={r.country}
                    city={null}
                    device={r.device}
                    os={r.os}
                    browser={r.browser}
                    badge={
                      <span className="rounded-md border border-revenue/30 bg-revenueSoft/50 px-1.5 py-0.5 text-xs text-revenue">
                        {r.renewal ? 'Récurrent' : 'Client'}
                      </span>
                    }
                  />
                </td>
                <td className="py-4">
                  {r.session_id ? (
                    <div className="flex items-center gap-2">
                      <SourceIcon source={r.source} domain={r.referrer_domain} />
                      <div>
                        <div>{r.source}</div>
                        {(r.utm_campaign || r.ref) && <div className="text-xs text-stone-500">{r.utm_campaign || r.ref}</div>}
                        {r.matched_by && r.matched_by !== 'metadata' && (
                          <div className="text-xs text-stone-400" title="Comment ce paiement a été relié au visiteur">
                            rapproché par {MATCH_LABELS[r.matched_by] ?? r.matched_by}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-stone-400" title="Aucun identifiant visiteur dans les métadonnées, ni page de retour, e-mail ou clic correspondant">
                      Non attribué
                    </span>
                  )}
                </td>
                <td className="py-4 font-medium">{money(r.amount)}</td>
                <td className="py-4">
                  {r.first_seen ? fmtAgo(r.ts - r.first_seen) : '—'}
                  {r.visits > 0 && <div className="text-xs text-stone-500">{r.visits} visite{r.visits > 1 ? 's' : ''}</div>}
                </td>
                <td className="py-4">{fmtDateTime(r.ts, site.timezone)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      </div>
      {!search && <ShowAll total={data.length} shown={all ? data.length : 10} onClick={() => setAll(true)} />}
    </div>
  );
}

function Users({ search }: { search: string }) {
  const { site, q, reloadKey, money, openVisitor } = useDash();
  const [all, setAll] = useState(false);
  const { data } = useApi<any[]>(`/api/sites/${site.id}/visitors?${qs(q)}`, reloadKey);
  if (!data) return <div className="h-40 animate-pulse" />;
  if (!data.length) return <div className="p-8 text-center text-sm text-stone-500">Aucun visiteur sur cette période.</div>;
  const rows = data.filter((r) => matches(r, search)).slice(0, all || search ? undefined : 10);
  return (
    <div>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.visitor_id}>
            <button className="w-full rounded-xl border border-stone-100 p-3 text-left active:bg-stone-50" onClick={() => openVisitor(r.visitor_id)}>
              <VisitorCell id={r.visitor_id} name={r.name} email={r.email} country={r.country} city={r.city} device={r.device} os={r.os} browser={r.browser}
                badge={r.spent > 0 ? <span className="rounded-md border border-revenue/30 bg-revenueSoft/50 px-1.5 py-0.5 text-xs text-revenue">Client</span> : null} />
              <div className="mt-3 grid grid-cols-4 gap-2 border-t border-stone-100 pt-2 text-center text-[11px] text-stone-500">
                <div><div className="tnum text-[14px] font-semibold text-ink">{r.sessions}</div>visites</div>
                <div><div className="tnum text-[14px] font-semibold text-ink">{r.pageviews}</div>pages</div>
                <div><div className="tnum text-[14px] font-semibold text-ink">{fmtDuration(r.duration)}</div>temps</div>
                <div><div className="text-[13px] font-semibold text-ink">{fmtAgo(Date.now() - r.last_seen)}</div>vu il y a</div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[13px] text-stone-600"><SourceIcon source={r.source} domain={r.referrer_domain} /> {r.source}{r.spent ? ' · ' + money(r.spent) : ''}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-[15px]">
        <thead>
          <tr className="text-left text-sm text-stone-500">
            <th className="px-3 pb-3 font-medium">Visiteur</th>
            <th className="pb-3 font-medium">Source</th>
            <th className="pb-3 text-right font-medium">Visites</th>
            <th className="pb-3 text-right font-medium">Pages</th>
            <th className="pb-3 text-right font-medium">Temps</th>
            <th className="pb-3 text-right font-medium">Dépensé</th>
            <th className="px-3 pb-3 text-right font-medium">Vu</th>
          </tr>
        </thead>
        <tbody>
          {data
            .filter((r) => matches(r, search))
            .slice(0, all || search ? undefined : 10)
            .map((r) => (
              <tr key={r.visitor_id} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50" onClick={() => openVisitor(r.visitor_id)}>
                <td className="px-3 py-3">
                  <VisitorCell
                    id={r.visitor_id}
                    name={r.name}
                    email={r.email}
                    country={r.country}
                    city={r.city}
                    device={r.device}
                    os={r.os}
                    browser={r.browser}
                    badge={r.spent > 0 ? <span className="rounded-md border border-revenue/30 bg-revenueSoft/50 px-1.5 py-0.5 text-xs text-revenue">Client</span> : null}
                  />
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <SourceIcon source={r.source} domain={r.referrer_domain} /> {r.source}
                  </div>
                </td>
                <td className="py-3 text-right">{r.sessions}</td>
                <td className="py-3 text-right">{r.pageviews}</td>
                <td className="py-3 text-right">{fmtDuration(r.duration)}</td>
                <td className="py-3 text-right">{r.spent ? money(r.spent) : '—'}</td>
                <td className="px-3 py-3 text-right text-stone-500">il y a {fmtAgo(Date.now() - r.last_seen)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      </div>
      {!search && <ShowAll total={data.length} shown={all ? data.length : 10} onClick={() => setAll(true)} />}
    </div>
  );
}

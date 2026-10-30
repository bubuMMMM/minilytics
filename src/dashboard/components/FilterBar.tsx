import { useEffect, useState } from 'react';
import { api, filterParts, qs, type BreakdownRow, type FilterOp, type Filters, type Query } from '../lib/api';
import { useApi } from '../lib/useApi';
import { renderLabel } from './Panel';
import { Dropdown } from './Toolbar';
import { UiIcon } from './UiIcon';
import { useMe } from '../lib/me';

/** Every filterable dimension: the URL key, its label, and the breakdown used for value suggestions. */
export const FILTER_LABELS: Record<string, { label: string; dim: string }> = {
  channel: { label: 'Canal', dim: 'channel' },
  source: { label: 'Référent', dim: 'source' },
  utm_campaign: { label: 'Campagne', dim: 'campaign' },
  utm_term: { label: 'Mot-clé', dim: 'keyword' },
  utm_source: { label: 'UTM source', dim: 'utm_source' },
  utm_medium: { label: 'UTM medium', dim: 'utm_medium' },
  utm_content: { label: 'UTM content', dim: 'utm_content' },
  ref: { label: 'Ref', dim: 'ref' },
  country: { label: 'Pays', dim: 'country' },
  region: { label: 'Région', dim: 'region' },
  city: { label: 'Ville', dim: 'city' },
  browser: { label: 'Navigateur', dim: 'browser' },
  os: { label: 'OS', dim: 'os' },
  device: { label: 'Appareil', dim: 'device' },
  page: { label: 'Page visitée', dim: 'page' },
  entry_page: { label: 'Page d’entrée', dim: 'entry_page' },
  exit_page: { label: 'Page de sortie', dim: 'exit_page' },
  hostname: { label: 'Domaine', dim: 'hostname' },
  screen: { label: 'Écran', dim: 'screen' },
  language: { label: 'Langue', dim: 'language' },
  goal: { label: 'Objectif atteint', dim: 'goal' },
  visitor_type: { label: 'Type de visiteur', dim: 'visitor_type' },
};

const OPS: { value: FilterOp; label: string }[] = [
  { value: 'is', label: 'est' },
  { value: 'not', label: 'n’est pas' },
  { value: 'contains', label: 'contient' },
];
const opLabel = (op: FilterOp) => OPS.find((o) => o.value === op)?.label ?? 'est';

interface Segment {
  id: string;
  name: string;
  filters: Filters;
}

/**
 * Filters bar (DataFast-style): chips with « est / n’est pas / contient », a filter builder with value
 * suggestions, and saved segments (filter combinations stored per site).
 */
export function FilterBar({ siteId, q, update }: { siteId: string; q: Query; update: (p: Partial<Query>) => void }) {
  const [version, setVersion] = useState(0);
  const { data: segments } = useApi<Segment[]>(`/api/sites/${siteId}/segments`, version);
  const entries = Object.entries(q.filters);
  const remove = (k: string) => {
    const { [k]: _, ...rest } = q.filters;
    update({ filters: rest });
  };
  const toggleOp = (k: string) => {
    const f = filterParts(q.filters[k]);
    // is → not → is (contains stays put: it only makes sense on free text).
    if (f.op === 'contains') return;
    update({ filters: { ...q.filters, [k]: f.op === 'is' ? { op: 'not', v: f.v } : f.v } });
  };
  const active = segments?.find((s) => sameFilters(s.filters, q.filters));

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Filtres">
      <Dropdown button={<button className="btn min-h-[34px] py-1"><UiIcon name="filter" size={15} />Filtrer</button>}>
        {(close) => <FilterBuilder siteId={siteId} q={q} onAdd={(k, v) => { update({ filters: { ...q.filters, [k]: v } }); close(); }} />}
      </Dropdown>
      <Dropdown button={<button className="btn min-h-[34px] py-1">{active ? <><span className="h-1.5 w-1.5 rounded-full bg-accent" />{active.name}</> : 'Segments'}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-4"><path d="m6 9 6 6 6-6" /></svg></button>}>
        {(close) => (
          <SegmentMenu
            siteId={siteId}
            segments={segments ?? []}
            current={q.filters}
            onApply={(f) => { update({ filters: f }); close(); }}
            onChange={() => setVersion((v) => v + 1)}
          />
        )}
      </Dropdown>
      {entries.map(([k, raw]) => {
        const f = filterParts(raw);
        const meta = FILTER_LABELS[k];
        return (
          <span key={k} className="flex max-w-full items-center gap-1.5 rounded-full border border-accent/30 bg-well py-1 pl-3 pr-1 text-[13px]">
            <span className="shrink-0 text-ink-3">{meta?.label ?? k}</span>
            <button
              className={`shrink-0 rounded px-1 font-medium ${f.op === 'not' ? 'text-danger' : 'text-accent'} ${f.op === 'contains' ? 'cursor-default' : 'hover:bg-surface'}`}
              onClick={() => toggleOp(k)}
              title={f.op === 'contains' ? undefined : 'Inverser (est / n’est pas)'}
            >
              {opLabel(f.op)}
            </button>
            <span className="flex min-w-0 items-center gap-1.5 font-medium">{f.op === 'contains' ? <span className="truncate">« {f.v} »</span> : renderLabel(meta?.dim ?? k, { label: f.v || null })}</span>
            <button className="rounded-lg px-1.5 text-ink-4 hover:bg-surface hover:text-ink" onClick={() => remove(k)} aria-label={`Retirer le filtre ${meta?.label ?? k}`}>
              ✕
            </button>
          </span>
        );
      })}
      {entries.length > 0 && (
        <button className="btn-ghost" onClick={() => update({ filters: {} })}>
          Tout effacer
        </button>
      )}
    </div>
  );
}

function sameFilters(a: Filters, b: Filters) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => b[k] !== undefined && JSON.stringify(filterParts(a[k])) === JSON.stringify(filterParts(b[k])));
}

function FilterBuilder({ siteId, q, onAdd }: { siteId: string; q: Query; onAdd: (key: string, v: Filters[string]) => void }) {
  const [key, setKey] = useState('source');
  const [op, setOp] = useState<FilterOp>('is');
  const [value, setValue] = useState('');
  const dim = FILTER_LABELS[key]?.dim ?? key;
  // Suggestions: the top values for this dimension in the current period (without the filter being edited).
  const { [key]: _, ...others } = q.filters;
  const { data } = useApi<BreakdownRow[]>(
    key === 'visitor_type' ? null : `/api/sites/${siteId}/breakdown?${qs({ ...q, filters: others }, { dim, limit: 30 })}`,
  );
  const options = key === 'visitor_type' ? [{ label: 'new', text: 'Nouveau' }, { label: 'returning', text: 'Récurrent' }] : (data ?? []).filter((r) => r.label).map((r) => ({ label: r.label!, text: r.label! }));
  useEffect(() => setValue(''), [key]);
  const submit = (v = value) => {
    const val = v.trim();
    if (!val) return;
    onAdd(key, op === 'is' ? val : { op, v: val });
  };
  return (
    <form className="w-[min(340px,calc(100vw-2rem))] space-y-2 p-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="text-[12px] font-medium text-ink-3">Nouveau filtre</div>
      <div className="flex gap-2">
        <select className="input min-w-0 flex-1 py-1" aria-label="Dimension" value={key} onChange={(e) => setKey(e.target.value)}>
          {Object.entries(FILTER_LABELS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
        <select className="input w-[112px] shrink-0 py-1" aria-label="Opérateur" value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
          {OPS.filter((o) => key !== 'visitor_type' || o.value !== 'contains').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <input className="input py-1" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={op === 'contains' ? 'Texte, ex. /blog' : 'Valeur'} aria-label="Valeur" />
      <div className="max-h-[220px] overflow-y-auto rounded-lg border border-line">
        {!data && key !== 'visitor_type' && <div className="ml-skeleton m-2 h-5" />}
        {options.filter((o) => !value || o.text.toLowerCase().includes(value.toLowerCase())).slice(0, 30).map((o) => (
          <button type="button" key={o.label} className="flex min-h-[40px] w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-well sm:min-h-0" onClick={() => submit(o.label)}>
            {key === 'visitor_type' ? o.text : renderLabel(dim, { label: o.label })}
          </button>
        ))}
        {options.length === 0 && data && <div className="px-3 py-2 text-[12px] text-ink-4">Aucune valeur sur la période, saisissez-en une.</div>}
      </div>
      <button className="btn-dark w-full" disabled={!value.trim()}>Ajouter le filtre</button>
    </form>
  );
}

function SegmentMenu({ siteId, segments, current, onApply, onChange }: { siteId: string; segments: Segment[]; current: Filters; onApply: (f: Filters) => void; onChange: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const hasFilters = Object.keys(current).length > 0;
  const readOnly = useMe()?.role === 'viewer';
  return (
    <div className="w-[min(320px,calc(100vw-2rem))] p-1">
      <div className="px-2 pb-1 pt-1.5 text-[12px] font-medium text-ink-3">Segments enregistrés</div>
      {segments.length === 0 && <div className="px-2 pb-2 text-[12px] text-ink-4">Aucun segment. Combinez des filtres puis enregistrez-les ici.</div>}
      {segments.map((s) => (
        <div key={s.id} className="group flex items-center gap-1 rounded-lg hover:bg-well">
          <button className="flex min-h-[44px] min-w-0 flex-1 flex-col items-start px-3 py-1.5 text-left sm:min-h-0" onClick={() => onApply(s.filters)}>
            <span className="truncate text-[13px] font-medium text-ink">{s.name}</span>
            <span className="truncate text-[11px] text-ink-4">{Object.entries(s.filters).map(([k, v]) => `${FILTER_LABELS[k]?.label ?? k} ${opLabel(filterParts(v).op)} ${filterParts(v).v}`).join(' · ')}</span>
          </button>
          {!readOnly && <button
            className="mr-1 rounded-md px-2 py-1 text-ink-4 hover:bg-surface hover:text-danger"
            aria-label={`Supprimer le segment ${s.name}`}
            onClick={async () => {
              await api(`/api/sites/${siteId}/segments/${s.id}`, { method: 'DELETE' });
              onChange();
            }}
          >
            ✕
          </button>}
        </div>
      ))}
      {!readOnly && <form
        className="mt-1 border-t border-line p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          try {
            await api(`/api/sites/${siteId}/segments`, { method: 'POST', json: { name, filters: current } });
            setName('');
            onChange();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="mb-1.5 text-[12px] font-medium text-ink-3">Enregistrer les filtres actuels</div>
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1 py-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={hasFilters ? 'ex. Clients français' : 'Ajoutez d’abord un filtre'} disabled={!hasFilters} aria-label="Nom du segment" />
          <button className="btn-dark shrink-0" disabled={!hasFilters || !name.trim()}>Enregistrer</button>
        </div>
        {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
      </form>}
    </div>
  );
}

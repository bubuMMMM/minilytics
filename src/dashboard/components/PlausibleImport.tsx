import { useState, type ReactNode } from 'react';
import { aggregatePlausible, plausibleFile } from '../../shared/plausible';
import { api, type Site } from '../lib/api';
import { fmtNumber } from '../lib/format';
import { useApi } from '../lib/useApi';
import { UiIcon } from './UiIcon';

interface ImportRow { id: string; provider: string; filename: string | null; date_from: string | null; date_to: string | null; rows: number; pageviews: number; status: string; created_at: number }
type SectionC = (p: { title: string; desc?: ReactNode; children: ReactNode }) => JSX.Element;

const fmtDay = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const CHUNK = 1500;

async function readFiles(list: FileList): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const f of Array.from(list)) {
    if (/\.zip$/i.test(f.name)) {
      const { unzipSync, strFromU8 } = await import('fflate');
      const files = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => !!plausibleFile(e.name) && e.originalSize < 200 * 1024 * 1024 });
      for (const [name, data] of Object.entries(files)) out.push({ name, text: strFromU8(data) });
    } else if (/\.csv$/i.test(f.name)) out.push({ name: f.name, text: await f.text() });
  }
  return out;
}

/** Réglages › Importer depuis Plausible: parse the export in the browser, send daily aggregates in chunks. */
export function PlausibleImport({ site, Section, canEdit }: { site: Site; Section: SectionC; canEdit: boolean }) {
  const [key, setKey] = useState(0);
  const { data: imports } = useApi<ImportRow[]>(`/api/sites/${site.id}/imports`, key);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(list: FileList | null) {
    if (!list?.length) return;
    setMsg(null);
    try {
      const files = await readFiles(list);
      const agg = aggregatePlausible(files);
      if (!agg.rows.length) {
        setMsg({ ok: false, text: 'Aucun fichier Plausible reconnu. Attendus : l’archive .zip de l’export, ou les fichiers imported_*_AAAAMMJJ_AAAAMMJJ.csv.' });
        return;
      }
      const filename = list.length === 1 ? list[0].name : `${agg.files.length} fichiers CSV`;
      const imp = await api<{ id: string; reused: boolean }>(`/api/sites/${site.id}/imports`, { method: 'POST', json: { provider: 'plausible', filename, date_from: agg.from, date_to: agg.to } });
      setProgress({ done: 0, total: agg.rows.length });
      for (let i = 0; i < agg.rows.length; i += CHUNK) {
        await api(`/api/sites/${site.id}/imports/${imp.id}/rows`, { method: 'POST', json: { rows: agg.rows.slice(i, i + CHUNK) } });
        setProgress({ done: Math.min(i + CHUNK, agg.rows.length), total: agg.rows.length });
      }
      const res = await api<{ rows: number; pageviews: number }>(`/api/sites/${site.id}/imports/${imp.id}/complete`, { method: 'POST' });
      setMsg({ ok: true, text: `${imp.reused ? 'Import mis à jour (aucun doublon)' : 'Import terminé'} : ${fmtNumber(res.rows)} lignes, ${fmtNumber(res.pageviews)} pages vues, du ${fmtDay(agg.from)} au ${fmtDay(agg.to)} (${agg.files.length} fichiers).` });
      setKey((k) => k + 1);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'Import impossible.' });
    } finally {
      setProgress(null);
    }
  }

  return (
    <Section
      title="Importer depuis Plausible"
      desc={<>Dans Plausible : Site settings › Imports &amp; Exports › <em>Export to CSV</em>, puis déposez ici l’archive .zip (ou ses CSV). Les données importées restent séparées des vôtres et sont toujours affichées avec l’étiquette « Importé ».</>}
    >
      {canEdit && (
        <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center transition-colors hover:border-ink-4 ${progress ? 'pointer-events-none opacity-60' : ''}`}>
          <UiIcon name="upload" size={20} />
          <span className="text-[14px] font-medium">{progress ? `Envoi… ${fmtNumber(progress.done)} / ${fmtNumber(progress.total)} lignes` : 'Choisir l’export Plausible (.zip ou .csv)'}</span>
          <span className="text-[12px] text-ink-3">Visiteurs, pages vues, sources, pages, pages d’entrée et de sortie, pays, appareils, navigateurs, OS et objectifs, jour par jour. Lu dans votre navigateur.</span>
          <input type="file" className="sr-only" accept=".zip,.csv,application/zip,text/csv" multiple disabled={!!progress} onChange={(e) => { run(e.target.files); e.target.value = ''; }} />
        </label>
      )}
      {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`} role="status">{msg.text}</p>}
      <div className="mt-4">
        <h3 className="text-[13px] font-semibold text-ink-2">Imports existants</h3>
        {!imports && <div className="ml-skeleton mt-2 h-10 w-full" />}
        {imports?.length === 0 && <p className="mt-1 text-[13px] text-ink-3">Aucun import pour ce site.</p>}
        <ul className="mt-2 divide-y divide-line">
          {imports?.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-[13px]">
                <p className="truncate font-medium">Plausible · {fmtDay(i.date_from)} → {fmtDay(i.date_to)}</p>
                <p className="truncate text-[12px] text-ink-3">{i.filename ?? 'CSV'} · {fmtNumber(i.rows)} lignes · {fmtNumber(i.pageviews)} pages vues · {i.status === 'done' ? `importé le ${new Date(i.created_at).toLocaleDateString('fr-FR')}` : 'import interrompu — relancez-le'}</p>
              </div>
              {canEdit && (
                <button className="btn text-danger" onClick={async () => {
                  if (!confirm('Supprimer cet import et toutes ses données importées ? Vos données collectées ne sont pas touchées.')) return;
                  await api(`/api/sites/${site.id}/imports/${i.id}`, { method: 'DELETE' });
                  setKey((k) => k + 1);
                }}>Supprimer</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

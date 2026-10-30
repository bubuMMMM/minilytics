import { useEffect, useMemo, useState } from 'react';
import { qs } from '../lib/api';
import { blockName, downloadCsv, type BlockDetail, type BlockKind, type BlockRow, type BlocksReport, type BreakRow } from '../lib/blocks';
import { useDash } from '../lib/context';
import { channelName, countryName, fmtAgo, fmtNumber, fmtPct } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Flag, SourceIcon } from './Icons';
import { Modal } from './Modal';
import { StatCard } from './StatCard';
import { TrendChart } from './TrendChart';
import { UiIcon } from './UiIcon';
import { Thumb } from './VideosView';

const COPY: Record<BlockKind, { kicker: string; title: string; intro: string; rows: string; empty: string }> = {
  sponsor: {
    kicker: 'MONÉTISATION / SPONSORS',
    title: 'Vos emplacements sponsors',
    intro: 'Pour chaque emplacement : combien de fois il a vraiment été vu, combien de clics il a reçus et son taux de clic. Une impression compte quand au moins la moitié de l’emplacement reste visible 1 seconde.',
    rows: 'Emplacements',
    empty: 'Aucune impression de sponsor sur cette période.',
  },
  content: {
    kicker: 'CONTENUS / IMPRESSIONS',
    title: 'Ce que vos visiteurs voient vraiment',
    intro: 'Les sections et vidéos réellement affichées à l’écran (pas seulement chargées), et la part qui a été cliquée. Idéal pour savoir quelles rangées de /trending ou /party fonctionnent.',
    rows: 'Sections',
    empty: 'Aucune impression de contenu sur cette période.',
  },
};

function useSelected(): [string | null, (v: string | null) => void] {
  const read = () => new URLSearchParams(window.location.search).get('block');
  const [v, setV] = useState<string | null>(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const set = (next: string | null) => {
    const u = new URL(window.location.href);
    if (next) u.searchParams.set('block', next); else u.searchParams.delete('block');
    window.history.pushState(null, '', u.pathname + u.search);
    setV(next);
  };
  return [v, set];
}
const rowKey = (b: Pick<BlockRow, 'id' | 'sponsor'>) => b.id + (b.sponsor ? '~' + b.sponsor : '');

function CtrBar({ ctr, max }: { ctr: number; max: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#eef1f6] lg:block" aria-hidden>
        <div className="h-full rounded-full bg-[#4f62ef]" style={{ width: `${max ? Math.min(100, (ctr / max) * 100) : 0}%` }} />
      </div>
      <span className="tnum w-14 text-right font-semibold">{fmtPct(ctr, 1)}</span>
    </div>
  );
}

export function BlocksView({ kind }: { kind: BlockKind }) {
  const { site, q, reloadKey } = useDash();
  const copy = COPY[kind];
  const { data, error, loading } = useApi<BlocksReport>(`/api/sites/${site.id}/blocks?${qs(q, { kind })}`, reloadKey);
  const [selected, setSelected] = useSelected();
  const [sort, setSort] = useState<'impressions' | 'clicks' | 'ctr'>('impressions');
  const notReady = error && /404|not found/i.test(error);

  const rows = useMemo(() => [...(data?.blocks ?? [])].sort((a, b) => b[sort] - a[sort]), [data, sort]);
  const maxCtr = Math.max(0, ...rows.map((r) => r.ctr));
  const t = data?.totals;
  // Deep links may carry just the placement id (?block=watch-reco-end-house) or id~sponsor.
  const sel = rows.find((r) => rowKey(r) === selected) ?? rows.find((r) => r.id === selected) ?? null;

  function exportCsv() {
    if (!data) return;
    downloadCsv(`${kind === 'sponsor' ? 'sponsors' : 'contenus'}-${site.domain}.csv`, [
      ['emplacement', 'nom', 'sponsor', 'lien', 'page', 'impressions', 'vues_uniques', 'clics', 'cliqueurs_uniques', 'ctr'],
      ...rows.map((r) => [r.id, blockName(r.id), r.sponsor, r.href, r.page, r.impressions, r.viewers, r.clicks, r.clickers, Number(r.ctr.toFixed(4))]),
    ]);
  }

  return (
    <section aria-labelledby="blocks-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="blocks-title" className="text-[17px] font-semibold tracking-[-.02em]">{copy.title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6f7d94]">{copy.intro}</p>
        </div>
        <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}><UiIcon name="download" size={16} /> Exporter en CSV</button>
      </div>

      {kind === 'sponsor' && data?.anomalies && data.anomalies.sessions > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
          <UiIcon name="info" size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            <b>{fmtNumber(data.anomalies.sessions)} {data.anomalies.sessions > 1 ? 'visites ont' : 'visite a'} un comportement inhabituel</b>{' '}
            ({fmtNumber(data.anomalies.clicks)} clic{data.anomalies.clicks > 1 ? 's' : ''} pour {fmtNumber(data.anomalies.impressions)} impression{data.anomalies.impressions > 1 ? 's' : ''}) :
            10 clics ou plus, des clics sans impression, ou plus de 3 fois plus de clics que d’impressions. Elles sont incluses dans les chiffres ci-dessous ;
            vérifiez-les avant de facturer un sponsor.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard loading={loading && !data} icon="eye" label="Impressions" value={t ? fmtNumber(t.impressions) : '—'} hint={t ? `${fmtNumber(t.viewers)} visiteurs uniques` : undefined}
          help="Affichages réels : au moins 50 % de l’élément visible pendant 1 seconde. Compté une fois par page vue et par emplacement." />
        <StatCard loading={loading && !data} icon="mouse" label="Clics" value={t ? fmtNumber(t.clicks) : '—'} hint={t ? `${fmtNumber(t.clickers)} cliqueurs uniques` : undefined}
          help="Clics gauche, clics molette et ouvertures dans un nouvel onglet. Envoyés même si la page change aussitôt." />
        <StatCard loading={loading && !data} icon="target" accent label="Taux de clic (CTR)" value={t ? fmtPct(t.ctr, 1) : '—'} hint="Clics ÷ impressions"
          help="Part des impressions qui ont donné un clic. Un bon CTR display tourne souvent autour de 0,5 à 2 %." />
        <StatCard loading={loading && !data} icon={kind === 'sponsor' ? 'megaphone' : 'grid'} label={copy.rows} value={data ? fmtNumber(rows.length) : '—'}
          hint={kind === 'sponsor' && data ? `${fmtNumber(data.sponsors.length)} sponsor${data.sponsors.length > 1 ? 's' : ''}` : 'avec au moins une impression'} />
      </div>

      {notReady ? (
        <div className="ml-bento mt-5 flex flex-col items-start gap-3 border-dashed bg-[#f8faff] p-5">
          <div className="font-semibold">La collecte des emplacements se met en place</div>
          <p className="text-[13px] text-[#6f7d94]">Cette vue se remplira automatiquement dès que le serveur exposera les statistiques d’impressions. Aucune action de votre part n’est nécessaire.</p>
        </div>
      ) : error ? (
        <div role="alert" className="ml-bento mt-5 p-5 text-[13px]">Impossible de charger les données. Vérifiez votre connexion puis actualisez la page.</div>
      ) : (
        <>
          <div className="ml-bento mt-5 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold">Évolution</h3>
              <span className="text-[12px] text-[#8b97aa]">Survolez ou utilisez ← → pour lire les valeurs</span>
            </div>
            {data ? (
              <TrendChart granularity={data.range.granularity} buckets={data.series.map((s) => s.bucket)} series={[
                { key: 'i', label: 'Impressions', color: '#4f62ef', values: data.series.map((s) => s.impressions) },
                { key: 'c', label: 'Clics', color: '#f08c2e', values: data.series.map((s) => s.clicks), axis: 'right' },
              ]} />
            ) : <div className="ml-skeleton h-[252px]" />}
          </div>

          <div className="ml-bento mt-5 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f6] px-4 py-3 sm:px-5">
              <h3 className="text-[15px] font-semibold">{copy.rows}</h3>
              <div className="tabs" role="group" aria-label="Trier par">
                {(['impressions', 'clicks', 'ctr'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={sort === k} className={`tab ${sort === k ? 'tab-active' : ''}`} onClick={() => setSort(k)}>
                    {k === 'impressions' ? 'Impressions' : k === 'clicks' ? 'Clics' : 'CTR'}
                  </button>
                ))}
              </div>
            </div>
            {!data && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="ml-skeleton h-14" />)}</div>}
            {data && !rows.length && (
              <div className="p-6 text-center">
                <p className="font-medium">{copy.empty}</p>
                <p className="mt-1 text-[13px] text-[#6f7d94]">Essayez une période plus longue, ou ajoutez <code className="rounded bg-[#f1f4f9] px-1.5 py-0.5 text-[12px]" translate="no">data-ml-block="nom-unique"</code> à l’élément à mesurer.</p>
              </div>
            )}
            {/* Phones: cards */}
            <ul className="divide-y divide-[#eef1f6] md:hidden">
              {rows.map((r) => (
                <li key={rowKey(r)}>
                  <button type="button" className="w-full px-4 py-3 text-left active:bg-[#f8faff]" onClick={() => setSelected(rowKey(r))}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold">{blockName(r.id)}</div>
                        <div className="truncate text-[12px] text-[#8b97aa]" translate="no">{r.sponsor ? r.sponsor + ' · ' : ''}{r.page ?? r.id}</div>
                      </div>
                      <span className="tnum shrink-0 rounded-full bg-[#f1f3ff] px-2 py-0.5 text-[12px] font-semibold text-[#2f3fd0]">{fmtPct(r.ctr, 1)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#8b97aa]">
                      <div><div className="tnum text-[15px] font-semibold text-[#17213a]">{fmtNumber(r.impressions)}</div>impressions</div>
                      <div><div className="tnum text-[15px] font-semibold text-[#17213a]">{fmtNumber(r.clicks)}</div>clics</div>
                      <div><div className="tnum text-[15px] font-semibold text-[#17213a]">{fmtNumber(r.clickers)}</div>cliqueurs</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {/* Tablets & desktop: table */}
            {rows.length > 0 && (
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left text-[12px] text-[#8b97aa]">
                      <th className="px-5 py-2.5 font-medium">Emplacement</th>
                      {kind === 'sponsor' && <th className="py-2.5 font-medium">Sponsor</th>}
                      <th className="py-2.5 font-medium">Page</th>
                      <th className="py-2.5 text-right font-medium">Impressions</th>
                      <th className="py-2.5 text-right font-medium">Clics</th>
                      <th className="hidden py-2.5 text-right font-medium lg:table-cell">Cliqueurs</th>
                      <th className="px-5 py-2.5 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={rowKey(r)} className="cursor-pointer border-t border-[#f1f4f9] hover:bg-[#fafbff]" onClick={() => setSelected(rowKey(r))}>
                        <td className="max-w-[280px] px-5 py-3">
                          <button type="button" className="block max-w-full truncate text-left font-semibold hover:text-[#2f3fd0]" onClick={(e) => { e.stopPropagation(); setSelected(rowKey(r)); }}>{blockName(r.id)}</button>
                          <div className="truncate font-mono text-[11px] text-[#9aa7ba]" translate="no">{r.id}</div>
                        </td>
                        {kind === 'sponsor' && <td className="max-w-[180px] truncate py-3" translate="no">{r.sponsor ?? <span className="text-[#9aa7ba]">Emplacement libre</span>}</td>}
                        <td className="max-w-[160px] truncate py-3 text-[#56657e]" translate="no">{r.page ?? '—'}</td>
                        <td className="tnum py-3 text-right">{fmtNumber(r.impressions)}</td>
                        <td className="tnum py-3 text-right">{fmtNumber(r.clicks)}</td>
                        <td className="tnum hidden py-3 text-right lg:table-cell">{fmtNumber(r.clickers)}</td>
                        <td className="px-5 py-3"><CtrBar ctr={r.ctr} max={maxCtr} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {kind === 'content' && data?.pages && data.pages.length > 0 && (
            <div className="ml-bento mt-5 p-4 sm:p-5">
              <h3 className="text-[15px] font-semibold">Impressions par page</h3>
              <p className="mb-3 text-[12px] text-[#8b97aa]">Toutes sections confondues, sur la période.</p>
              <ul className="space-y-1">
                {data.pages.map((pg) => {
                  const max = Math.max(1, ...data.pages!.map((x) => x.impressions));
                  return (
                    <li key={pg.page ?? '—'} className="relative flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-[13px]">
                      <div className="absolute inset-y-0 left-0 rounded-lg bg-[#eef1ff]" style={{ width: `${(pg.impressions / max) * 100}%` }} aria-hidden />
                      <span className="relative min-w-0 flex-1 truncate font-medium" translate="no">{pg.page ?? '—'}</span>
                      <span className="relative hidden text-[12px] text-[#6f7d94] sm:inline">{pg.blocks} section{pg.blocks > 1 ? 's' : ''}</span>
                      <span className="tnum relative w-20 text-right">{fmtNumber(pg.impressions)}</span>
                      <span className="tnum relative w-14 text-right font-semibold">{fmtPct(pg.ctr, 1)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {kind === 'sponsor' && data && data.sponsors.length > 0 && (
            <div className="ml-bento mt-5 p-4 sm:p-5">
              <h3 className="mb-3 text-[15px] font-semibold">Par sponsor</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.sponsors.map((s) => (
                  <div key={s.sponsor ?? 'libre'} className="rounded-2xl border border-[#eef1f6] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold" translate="no">{s.sponsor ?? 'Emplacements libres'}</span>
                      <span className="text-[12px] text-[#8b97aa]">{s.placements} emplacement{s.placements > 1 ? 's' : ''}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#8b97aa]">
                      <div><div className="tnum text-[17px] font-semibold text-[#17213a]">{fmtNumber(s.impressions)}</div>impressions</div>
                      <div><div className="tnum text-[17px] font-semibold text-[#17213a]">{fmtNumber(s.clicks)}</div>clics</div>
                      <div><div className="tnum text-[17px] font-semibold text-[#2f3fd0]">{fmtPct(s.ctr, 1)}</div>CTR</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BlockModal row={sel} kind={kind} onClose={() => setSelected(null)} />
    </section>
  );
}

const BREAK_TABS: { key: keyof BlockDetail['breakdown']; label: string }[] = [
  { key: 'page', label: 'Page' }, { key: 'device', label: 'Appareil' }, { key: 'country', label: 'Pays' }, { key: 'source', label: 'Source' },
  { key: 'channel', label: 'Canal' }, { key: 'utm_campaign', label: 'Campagne' }, { key: 'browser', label: 'Navigateur' }, { key: 'visitor_type', label: 'Nouveaux / récurrents' },
];

function BreakList({ dim, rows }: { dim: string; rows: BreakRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.impressions));
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-[#8b97aa]">Aucune donnée</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="relative flex min-h-[36px] items-center gap-2 rounded-lg px-2.5 text-[13px]">
          <div className="absolute inset-y-0 left-0 rounded-lg bg-[#eef1ff]" style={{ width: `${(r.impressions / max) * 100}%` }} aria-hidden />
          <span className="relative flex min-w-0 flex-1 items-center gap-2">
            {dim === 'country' ? <><Flag cc={r.label} /><span className="truncate">{countryName(r.label)}</span></>
              : dim === 'source' ? <><SourceIcon source={r.label ?? 'Direct'} /><span className="truncate">{r.label ?? 'Direct'}</span></>
              : dim === 'channel' ? <span className="truncate">{channelName(r.label)}</span>
              : dim === 'visitor_type' ? <span className="truncate">{r.label === 'new' ? 'Nouveaux' : r.label === 'returning' ? 'Récurrents' : r.label ?? '—'}</span>
              : <span className="truncate" translate="no">{r.label ?? '—'}</span>}
          </span>
          <span className="tnum relative w-16 text-right">{fmtNumber(r.impressions)}</span>
          <span className="tnum relative w-12 text-right">{fmtNumber(r.clicks)}</span>
          <span className="tnum relative w-14 text-right font-semibold">{fmtPct(r.ctr, 1)}</span>
        </li>
      ))}
    </ul>
  );
}

function BlockModal({ row, kind, onClose }: { row: BlockRow | null; kind: BlockKind; onClose: () => void }) {
  const { site, q, reloadKey } = useDash();
  const [tab, setTab] = useState<keyof BlockDetail['breakdown']>('page');
  const url = row ? `/api/sites/${site.id}/blocks/${encodeURIComponent(row.id)}?${qs(q, { kind, ...(row.sponsor ? { sponsor: row.sponsor } : {}) })}` : null;
  const { data, error } = useApi<BlockDetail>(url, reloadKey);
  return (
    <Modal open={!!row} onClose={onClose} width="max-w-3xl" title={row ? blockName(row.id) : ''}>
      {row && (
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6f7d94]">
            <span className="font-mono text-[12px]" translate="no">{row.id}</span>
            {row.sponsor && <span translate="no">· {row.sponsor}</span>}
            {row.href && <a className="inline-flex items-center gap-1 text-[#2f3fd0] underline-offset-2 hover:underline" href={row.href} target="_blank" rel="noreferrer noopener">{row.href.replace(/^https?:\/\//, '')} <UiIcon name="external" size={12} /></a>}
            {row.lastSeen && <span>· vu il y a {fmtAgo(Date.now() - row.lastSeen)}</span>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Impressions', fmtNumber(row.impressions)], ['Vues uniques', fmtNumber(row.viewers)], ['Clics', fmtNumber(row.clicks)], ['CTR', fmtPct(row.ctr, 1)]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[#f6f8fc] px-3 py-2.5"><div className="text-[11px] text-[#8b97aa]">{l}</div><div className="tnum text-[18px] font-semibold">{v}</div></div>
            ))}
          </div>
          {error && <p role="alert" className="mt-4 text-[13px] text-[#6f7d94]">Le détail n’est pas encore disponible pour cet emplacement.</p>}
          {!error && (
            <>
              <div className="mt-5">
                {data ? <TrendChart height={180} granularity={data.range.granularity} buckets={data.series.map((s) => s.bucket)} series={[
                  { key: 'i', label: 'Impressions', color: '#4f62ef', values: data.series.map((s) => s.impressions) },
                  { key: 'c', label: 'Clics', color: '#f08c2e', values: data.series.map((s) => s.clicks), axis: 'right' },
                ]} /> : <div className="ml-skeleton h-[212px]" />}
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="tabs min-w-0" role="tablist" aria-label="Répartition">
                    {BREAK_TABS.map((b) => <button key={b.key} role="tab" aria-selected={tab === b.key} className={`tab ${tab === b.key ? 'tab-active' : ''}`} onClick={() => setTab(b.key)}>{b.label}</button>)}
                  </div>
                  <span className="hidden text-[11px] text-[#9aa7ba] sm:block">impr. · clics · CTR</span>
                </div>
                {data ? <BreakList dim={tab} rows={data.breakdown[tab] ?? []} /> : <div className="ml-skeleton h-32" />}
              </div>
              {kind === 'content' && data && data.items.length > 0 && (
                <div className="mt-5">
                  <h4 className="mb-2 text-[14px] font-semibold">Vidéos vues dans cette section</h4>
                  <ul className="divide-y divide-[#f1f4f9]">
                    {data.items.map((it) => (
                      <li key={it.item} className="flex items-center gap-3 py-2">
                        <Thumb id={it.item} className="h-10 w-16 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{it.title ?? it.item}</div>
                          <div className="text-[11px] text-[#9aa7ba]">{it.pos ? `position ${it.pos} · ` : ''}{fmtNumber(it.impressions)} impressions · {fmtNumber(it.clicks)} clics</div>
                        </div>
                        <span className="tnum text-[13px] font-semibold">{fmtPct(it.ctr, 1)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}


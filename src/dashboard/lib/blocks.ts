/** Types for /api/sites/:id/blocks (contract: /workspace/minilytics-team/HANDOFF.md). */
export type BlockKind = 'sponsor' | 'content';
export interface BlockRow {
  id: string;
  kind: BlockKind;
  sponsor: string | null;
  href: string | null;
  page: string | null;
  impressions: number;
  viewers: number;
  clicks: number;
  clickers: number;
  ctr: number;
  lastSeen: number | null;
}
export interface BlockSeries { bucket: string; impressions: number; clicks: number }
export interface BlocksReport {
  range: { granularity: string };
  totals: { impressions: number; viewers: number; clicks: number; clickers: number; ctr: number };
  /** Admin only: sessions whose clicks look automated (≥10 clicks, clicks with no impression, or > 3× impressions). */
  anomalies?: { sessions: number; clicks: number; impressions: number };
  blocks: BlockRow[];
  sponsors: { sponsor: string | null; impressions: number; clicks: number; clickers: number; ctr: number; placements: number }[];
  series: BlockSeries[];
  pages?: { page: string | null; blocks: number; impressions: number; viewers: number; clicks: number; clickers: number; ctr: number }[];
}
export interface BreakRow { label: string | null; impressions: number; clicks: number; ctr: number }
export interface BlockDetail {
  range: { granularity: string };
  block: BlockRow;
  series: BlockSeries[];
  breakdown: Partial<Record<'page' | 'device' | 'country' | 'source' | 'channel' | 'browser' | 'os' | 'utm_campaign' | 'visitor_type', BreakRow[]>>;
  items: { item: string; title: string | null; pos: number | null; impressions: number; clicks: number; ctr: number }[];
}

/** "trending-justdropped-sponsor-2" → "Trending · justdropped · sponsor 2" (fallback when no label is known). */
const WORDS: Record<string, string> = {
  trending: 'Tendances', watch: 'Lecture', home: 'Accueil', party: 'Party', music: 'Musique', playlist: 'Playlist', search: 'Recherche',
  justdropped: 'Nouveautés', 'just-dropped': 'Nouveautés', mostwatched: 'Les plus vues', best: 'Les plus vues', kids: 'Enfants', playlists: 'Playlists',
  sidebar: 'colonne', recommended: 'recommandées', reco: 'recommandations', sponsor: 'sponsor', sponsor2: 'sponsor (2ᵉ position)', house: 'emplacement libre', end: 'fin de liste', dialog: 'fenêtre', empty: 'vide', hero: 'bannière', cta: 'appel à sponsor', results: 'résultats', videos: 'vidéos', bidouilleurs: 'Bidouilleurs',
};
export function blockName(id: string): string {
  const parts = id.split(/[-_:/.]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase();
    if (/^\d+$/.test(p)) { out.push('position ' + p); continue; }
    out.push(WORDS[p] ?? p);
  }
  if (!out.length) return id;
  const [first, ...rest] = out;
  return first.charAt(0).toUpperCase() + first.slice(1) + (rest.length ? ' · ' + rest.join(' ') : '');
}

export function toCsv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

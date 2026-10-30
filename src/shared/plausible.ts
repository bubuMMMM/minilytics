/**
 * Plausible CSV export → Minilytics daily aggregates (shared: the dashboard parses the files, the worker validates rows).
 * Format: https://plausible.io/docs/csv-import — files named {table}_{YYYYMMDD}_{YYYYMMDD}.csv, one row per date × dimension.
 */
export type ImportKind = 'visitors' | 'source' | 'page' | 'entry_page' | 'exit_page' | 'country' | 'device' | 'browser' | 'os' | 'goal';
export const IMPORT_KINDS: ImportKind[] = ['visitors', 'source', 'page', 'entry_page', 'exit_page', 'country', 'device', 'browser', 'os', 'goal'];

export interface ImportRow { kind: ImportKind; day: string; label: string; visitors: number; visits: number; pageviews: number; bounces: number; duration: number }

const TABLES: Record<string, { kind: ImportKind; label: (r: Record<string, string>) => string; visits?: string }> = {
  imported_visitors: { kind: 'visitors', label: () => '' },
  imported_sources: { kind: 'source', label: (r) => r.source || 'Direct / None' },
  imported_pages: { kind: 'page', label: (r) => r.page || '/' },
  imported_entry_pages: { kind: 'entry_page', label: (r) => r.entry_page || '/', visits: 'entrances' },
  imported_exit_pages: { kind: 'exit_page', label: (r) => r.exit_page || '/', visits: 'exits' },
  imported_locations: { kind: 'country', label: (r) => (r.country || '').toUpperCase() || 'XX' },
  imported_devices: { kind: 'device', label: (r) => r.device || 'Inconnu' },
  imported_browsers: { kind: 'browser', label: (r) => r.browser || 'Inconnu' },
  imported_operating_systems: { kind: 'os', label: (r) => r.operating_system || 'Inconnu' },
  imported_custom_events: { kind: 'goal', label: (r) => r.name || '', visits: 'events' },
};

/** `imported_devices_20230209_20240123.csv` (any folder prefix) → table + dates; null for other files. */
export function plausibleFile(name: string): { table: string; from: string; to: string } | null {
  const m = /(imported_[a-z_]+?)_(\d{4})(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})\.csv$/i.exec(name.split('/').pop() ?? '');
  if (!m || !TABLES[m[1].toLowerCase()]) return null;
  return { table: m[1].toLowerCase(), from: `${m[2]}-${m[3]}-${m[4]}`, to: `${m[5]}-${m[6]}-${m[7]}` };
}

/** RFC 4180 CSV (quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Aggregates one file (regions/cities, browser versions, referrers and UTMs are summed into their parent label). */
export function aggregatePlausible(files: { name: string; text: string }[]) {
  const acc = new Map<string, ImportRow>();
  const used: string[] = [];
  let from = '';
  let to = '';
  for (const f of files) {
    const meta = plausibleFile(f.name);
    const base = f.name.split('/').pop()!;
    // The same file twice (zip + loose CSV) must not double the numbers.
    if (!meta || used.includes(base)) continue;
    used.push(base);
    if (!from || meta.from < from) from = meta.from;
    if (!to || meta.to > to) to = meta.to;
    const spec = TABLES[meta.table];
    const [head, ...lines] = parseCsv(f.text.replace(/^\uFEFF/, ''));
    if (!head) continue;
    const cols = head.map((h) => h.trim().toLowerCase());
    for (const line of lines) {
      const r: Record<string, string> = {};
      cols.forEach((c, i) => (r[c] = line[i] ?? ''));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '')) continue;
      const label = spec.label(r).slice(0, 300);
      if (spec.kind === 'goal' && !label) continue;
      const key = `${spec.kind}\u0000${r.date}\u0000${label}`;
      const cur = acc.get(key) ?? { kind: spec.kind, day: r.date, label, visitors: 0, visits: 0, pageviews: 0, bounces: 0, duration: 0 };
      cur.visitors += num(r.visitors);
      cur.visits += num(r[spec.visits ?? 'visits']);
      cur.pageviews += num(r.pageviews);
      cur.bounces += num(r.bounces);
      cur.duration += num(r.visit_duration);
      acc.set(key, cur);
    }
  }
  return { rows: [...acc.values()], files: used, from, to };
}

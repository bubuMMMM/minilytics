import { useState } from 'react';
import { api, qs } from '../lib/api';
import { useDash } from '../lib/context';
import { dayInTz } from '../lib/format';
import { useApi } from '../lib/useApi';
import { useMe } from '../lib/me';

export interface Note {
  id: string;
  ts: number;
  text: string;
}

/** Bucket label (as produced by the API) of a timestamp, in the site's timezone. */
export function bucketOfTs(ts: number, g: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  if (g === 'hour') return `${day}T${get('hour')}:00`;
  if (g === 'month') return day.slice(0, 7);
  if (g === 'week') {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  return day;
}

export function useNotes() {
  const { site, q, reloadKey, share } = useDash();
  const [version, setVersion] = useState(0);
  // Notes are private to the team: shared dashboards never request them.
  const { data } = useApi<Note[]>(share ? null : `/api/sites/${site.id}/notes?${qs({ ...q, filters: {} })}`, reloadKey + version);
  return {
    list: data ?? [],
    async add(day: string, text: string) {
      // Noon in the site's day, so the note lands in that day's bucket whatever the timezone.
      const ts = Date.parse(day + 'T12:00:00Z');
      await api(`/api/sites/${site.id}/notes`, { method: 'POST', json: { ts, text } });
      setVersion((v) => v + 1);
    },
    async remove(id: string) {
      await api(`/api/sites/${site.id}/notes/${id}`, { method: 'DELETE' });
      setVersion((v) => v + 1);
    },
  };
}

export interface Annotation {
  id?: string;
  ts: number;
  kind: 'note' | 'commit' | 'mention';
  title: string;
  url?: string;
  author?: string;
  source?: string;
}

/**
 * GitHub commits and 𝕏 / Reddit mentions for the period (backend `/api/sites/:id/annotations`).
 * Notes come from useNotes (editable), so they are dropped here. Missing endpoint or error → nothing.
 */
export function useAnnotations(): Annotation[] {
  const { site, q, reloadKey, share } = useDash();
  const { data } = useApi<{ items: Annotation[] }>(share ? null : `/api/sites/${site.id}/annotations?${qs({ ...q, filters: {} })}`, reloadKey);
  return (data?.items ?? []).filter((a) => a.kind !== 'note' && Number.isFinite(a.ts));
}

const safeUrl = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);

export function AnnotationIcon({ a, size = 12 }: { a: Pick<Annotation, 'kind' | 'source'>; size?: number }) {
  if (a.kind === 'commit')
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-2" aria-hidden><circle cx="12" cy="12" r="3.5" /><path d="M3 12h5.5M15.5 12H21" /></svg>;
  if (a.source === 'x') return <span className="shrink-0 text-[11px] font-semibold leading-none text-ink" aria-hidden>𝕏</span>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-accent" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>;
}

/** Commits / mentions strip under the chart (most recent first, collapsible). */
function AnnotationChips({ items, tz }: { items: Annotation[]; tz: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.ts - a.ts);
  const shown = all ? sorted : sorted.slice(0, 4);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium text-ink-3">{items.some((a) => a.kind === 'commit') ? (items.some((a) => a.kind === 'mention') ? 'Commits et mentions' : 'Commits') : 'Mentions'}</span>
      {shown.map((a, i) => {
        const href = safeUrl(a.url);
        const body = (
          <>
            <AnnotationIcon a={a} />
            <span className="shrink-0 text-ink-3">{new Date(a.ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: tz })}</span>
            <span className="truncate text-ink">{a.title.split('\n')[0]}</span>
            {a.author && a.kind === 'commit' && <span className="hidden shrink-0 text-ink-4 sm:inline">· {a.author}</span>}
          </>
        );
        const cls = 'flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] sm:max-w-[360px]';
        return href
          ? <a key={a.id ?? i} href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-line-strong hover:bg-well`} title={a.title}>{body}</a>
          : <span key={a.id ?? i} className={cls} title={a.title}>{body}</span>;
      })}
      {sorted.length > 4 && <button type="button" className="btn-ghost" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? 'Réduire' : `+${sorted.length - 4}`}</button>}
    </div>
  );
}

/** Notes pinned on the chart (« Lancement sur 𝕏 », « Nouvelle landing »…), like DataFast's chart notes. */
export function NotesBar({ notes, annotations = [] }: { notes: ReturnType<typeof useNotes>; annotations?: Annotation[] }) {
  const { site } = useDash();
  const readOnly = useMe()?.role === 'viewer';
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => dayInTz(Date.now(), site.timezone));
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="border-t border-line px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-ink-3">Notes</span>
        {notes.list.length === 0 && !open && !readOnly && <span className="text-[12px] text-ink-4">Annotez un lancement, une campagne ou un changement pour l’expliquer sur la courbe.</span>}
        {notes.list.map((n) => (
          <span key={n.id} className="group flex max-w-full items-center gap-1.5 rounded-full border border-line bg-well py-0.5 pl-2 pr-1 text-[12px]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <span className="shrink-0 text-ink-3">{new Date(n.ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: site.timezone })}</span>
            <span className="truncate text-ink">{n.text}</span>
            {!readOnly && <button className="rounded px-1 text-ink-4 hover:text-danger" aria-label={`Supprimer la note ${n.text}`} onClick={() => notes.remove(n.id)}>✕</button>}
          </span>
        ))}
        {!open && !readOnly && <button className="btn-ghost" onClick={() => setOpen(true)}>+ Note</button>}
        {readOnly && notes.list.length === 0 && <span className="text-[12px] text-ink-4">Aucune note.</span>}
      </div>
      <AnnotationChips items={annotations} tz={site.timezone} />
      {open && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
              await notes.add(day, text);
              setText('');
              setOpen(false);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <input type="date" className="input py-1 sm:w-[160px]" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date de la note" required />
          <input className="input min-w-0 flex-1 py-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="ex. Post de lancement sur 𝕏" aria-label="Texte de la note" autoFocus />
          <div className="flex gap-2">
            <button className="btn-dark" disabled={!text.trim()}>Ajouter</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>
          </div>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </form>
      )}
    </div>
  );
}

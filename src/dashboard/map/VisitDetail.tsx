import { useApi } from '../lib/useApi';
import { fmtDuration } from '../lib/format';
import { SourceIcon } from '../components/Icons';
import { VisitorCard } from '../components/VisitorCard';
import { VisitorProfile } from '../components/VisitorProfile';
import type { Visit } from './Replay';

export interface JourneyStep {
  t: number;
  type: string;
  path: string | null;
  name?: string | null;
  duration?: number | null;
}
export interface Journey {
  sessionId: string;
  visitorId: string;
  source: string | null;
  referrer: string | null;
  channel: string | null;
  entry: string | null;
  exit: string | null;
  startedAt: number;
  lastSeen: number;
  pageviews: number;
  steps: JourneyStep[];
}

const STEP_LABEL: Record<string, (s: JourneyStep) => string> = {
  pageview: (s) => s.path || 'Page',
  goal: (s) => s.name ? `Objectif · ${s.name}` : 'Objectif',
  outbound: (s) => s.name ? `Sortie vers ${s.name.replace(/^https?:\/\//, '')}` : 'Lien sortant',
  form: (s) => s.name ? `Formulaire · ${s.name}` : 'Formulaire',
  video: (s) => s.name ? `Vidéo · ${s.name}` : 'Vidéo',
};

function sourceLabel(source: string | null) {
  if (!source || source === 'Direct/None' || source === 'Direct') return 'Accès direct';
  return source;
}

function stepTime(t: number, tz: string) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(t);
}

export function VisitJourney({ journey, tz }: { journey: Journey; tz: string }) {
  const src = sourceLabel(journey.source);
  return (
    <div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px] text-ink-2">
        <dt className="text-ink-4">Source</dt>
        <dd className="flex min-w-0 items-center gap-1.5">
          <SourceIcon source={journey.source} domain={journey.referrer} size={14} />
          <span className="truncate">{src}{journey.referrer && src !== journey.referrer ? ` · ${journey.referrer}` : ''}</span>
        </dd>
        <dt className="text-ink-4">Entrée</dt>
        <dd className="min-w-0 truncate font-mono text-[11px]">{journey.entry || '—'}</dd>
        <dt className="text-ink-4">Sortie</dt>
        <dd className="min-w-0 truncate font-mono text-[11px]">{journey.exit || journey.entry || '—'}</dd>
      </dl>
      {journey.steps.length === 0 ? (
        <p className="mt-3 text-[12px] text-ink-4">Le détail des pages n’est pas encore disponible pour cette visite.</p>
      ) : (
        <ol className="relative mt-3 ml-1.5 border-l border-line">
          {journey.steps.map((s, i) => {
            const last = i === journey.steps.length - 1;
            const label = (STEP_LABEL[s.type] ?? ((x: JourneyStep) => x.path || s.type))(s);
            const mono = s.type === 'pageview';
            return (
              <li key={`${s.t}-${i}`} className="relative pb-3 pl-4 last:pb-0">
                <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${s.type === 'goal' ? 'bg-accent' : last ? 'bg-success' : 'bg-line-strong'}`} aria-hidden />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`truncate text-[13px] ${mono ? 'font-mono text-[12px] text-ink' : 'font-medium text-ink'}`}>{label}</div>
                    {s.type !== 'pageview' && s.path && <div className="truncate font-mono text-[11px] text-ink-4">{s.path}</div>}
                  </div>
                  <div className="tnum shrink-0 text-right text-[11px] text-ink-4">
                    <div>{stepTime(s.t, tz)}</div>
                    {s.duration != null && s.duration >= 1000 && <div>{fmtDuration(s.duration)}</div>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const DAY = 24 * 60 * 60 * 1000;

export function VisitDetail({
  visit, siteId, tz, now, onBack, onReplay,
}: {
  visit: Visit; siteId: string; tz: string; now: number; onBack: () => void;
  onReplay?: () => void;
}) {
  const { data, error, loading } = useApi<Journey>(`/api/sites/${siteId}/sessions/${encodeURIComponent(visit.id)}/journey`);
  const journey = data?.sessionId === visit.id ? data : null;
  const canReplay = !!onReplay && (now - visit.t) < DAY;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-4 py-3">
        <button type="button" className="btn-ghost -ml-2" onClick={onBack}>← Visiteurs</button>
        <h2 className="mt-1 text-[15px] font-semibold tracking-tight">Profil du visiteur</h2>
        <p className="text-[12px] text-ink-3">Identité, sessions, parcours, événements et paiements.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-3">
        <VisitorCard visit={visit} tz={tz} now={now} selected />
        {canReplay && (
          <button type="button" className="btn mt-3 w-full justify-center" onClick={onReplay}>
            Rejouer cette visite sur la carte
          </button>
        )}
        <h3 className="mt-5 text-[13px] font-semibold">Parcours de cette visite</h3>
        <div className="mt-2">
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
          {!error && !journey && (loading || !data) && (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="ml-skeleton h-8 w-full rounded-md" />)}</div>
          )}
          {journey && <VisitJourney journey={journey} tz={tz} />}
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-4 text-[13px] font-semibold">Toutes les visites</h3>
          <VisitorProfile visitorId={visit.visitorId} siteId={siteId} tz={tz} highlightSessionId={visit.id} />
        </div>
      </div>
    </div>
  );
}

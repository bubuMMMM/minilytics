import { useDash } from '../lib/context';
import { countryName, fmtAgo, fmtDateTime, fmtDuration, shortId } from '../lib/format';
import { useApi } from '../lib/useApi';
import { Avatar, BrowserIcon, DeviceIcon, Flag, OSIcon, SourceIcon } from './Icons';
import { Modal } from './Modal';

interface Profile {
  visitor: { id: string; first_seen: number; name: string | null; email: string | null; user_id: string | null } | null;
  sessions: any[];
  events: { session_id: string; ts: number; type: string; name: string | null; path: string; props: string | null }[];
  payments: any[];
}

export function VisitorModal({ visitorId, onClose }: { visitorId: string | null; onClose: () => void }) {
  const { site, money } = useDash();
  // The parent remounts this per visitor (key), so `data` always belongs to `visitorId`.
  const { data: p } = useApi<Profile>(visitorId ? `/api/sites/${site.id}/visitors/${visitorId}` : null);
  const last = p?.sessions[0];
  const firstSession = p?.sessions[p.sessions.length - 1];
  const paid = p?.payments.reduce((a, x) => a + x.amount, 0) ?? 0;
  const firstPayment = p?.payments.filter((x) => x.kind === 'payment').at(-1);

  // Timeline: each visit with its events and payments, newest first.
  const bySession = new Map<string, Profile['events']>();
  for (const e of p?.events ?? []) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id)!.push(e);
  }

  return (
    <Modal open={!!visitorId} onClose={onClose} width="max-w-3xl" title="Profil du visiteur">
      {!p && <div className="h-60 animate-pulse rounded-xl bg-well" />}
      {p && (
        <div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Avatar id={visitorId!} size={64} name={p.visitor?.name} email={p.visitor?.email} />
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold">{p.visitor?.name || p.visitor?.email || `Visiteur ${shortId(visitorId!)}`}</div>
              {p.visitor?.email && p.visitor.name && <div className="text-sm text-ink-3">{p.visitor.email}</div>}
              {last && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
                  <span className="flex items-center gap-1">
                    <Flag cc={last.country} size={15} /> {last.city ? `${last.city}, ` : ''}
                    {countryName(last.country)}
                  </span>
                  <span className="flex items-center gap-1">
                    <DeviceIcon name={last.device} size={15} /> {last.device}
                  </span>
                  <span className="flex items-center gap-1">
                    <OSIcon name={last.os} size={15} /> {last.os}
                  </span>
                  <span className="flex items-center gap-1">
                    <BrowserIcon name={last.browser} size={15} /> {last.browser}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Première source" value={firstSession?.source ?? '—'} />
            <Stat label="Visites" value={String(p.sessions.length)} />
            <Stat label="Total dépensé" value={money(paid)} accent={paid > 0} />
            <Stat
              label="Délai avant 1er paiement"
              value={firstPayment && p.visitor ? fmtAgo(firstPayment.ts - p.visitor.first_seen) : '—'}
            />
          </div>

          <ActivityGrid sessions={p.sessions} tz={site.timezone} />

          <div className="mt-8 space-y-6">
            {p.sessions.map((s) => {
              const evs = [...(bySession.get(s.id) ?? [])].reverse();
              const pays = p.payments.filter((x) => x.ts >= s.started_at && x.ts <= s.last_seen_at + 30 * 60_000);
              return (
                <div key={s.id} className="relative border-l-2 border-line pl-5">
                  <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-visitors ring-4 ring-white" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold">{fmtDateTime(s.started_at, site.timezone)}</span>
                    <span className="flex items-center gap-1.5 rounded-md bg-well px-2 py-0.5">
                      <SourceIcon source={s.source} domain={s.referrer_domain} size={14} /> {s.source}
                    </span>
                    {s.referrer && <span className="max-w-full truncate sm:max-w-[260px] text-ink-3">{s.referrer}</span>}
                    {s.utm_campaign && <span className="rounded-md bg-warning-soft px-2 py-0.5 text-warning">campagne : {s.utm_campaign}</span>}
                    {s.ref && <span className="rounded-md bg-warning-soft px-2 py-0.5 text-warning">réf : {s.ref}</span>}
                    <span className="text-ink-4">{fmtDuration(s.duration)}</span>
                  </div>
                  <ol className="mt-2 space-y-1 text-sm">
                    {evs.map((e, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-14 shrink-0 text-xs leading-5 text-ink-4">
                          {new Intl.DateTimeFormat('en', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit' }).format(e.ts)}
                        </span>
                        {e.type === 'pageview' && <span className="text-ink-2">📄 {e.path}</span>}
                        {e.type === 'goal' && (
                          <span className="font-medium text-accent">
                            🎯 {e.name} <span className="font-normal text-ink-4">sur {e.path}</span>
                          </span>
                        )}
                        {e.type === 'outbound' && <span className="text-ink-2">↗ Sortie vers {e.name?.replace(/^https?:\/\//, '')}</span>}
                      </li>
                    ))}
                    {pays.map((x) => (
                      <li key={x.id} className="flex items-start gap-2">
                        <span className="w-14 shrink-0 text-xs leading-5 text-ink-4">
                          {new Intl.DateTimeFormat('en', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit' }).format(x.ts)}
                        </span>
                        <span className="font-semibold text-revenue">💰 {x.kind === 'refund' ? 'Remboursement' : 'Payé'} {money(x.amount)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
            {p.payments.length > 0 && (
              <div className="rounded-xl bg-revenueSoft/40 p-4 text-sm">
                <div className="mb-2 font-semibold">Paiements</div>
                {p.payments.map((x) => (
                  <div key={x.id} className="flex justify-between py-0.5">
                    <span>
                      {fmtDateTime(x.ts, site.timezone)} · {x.kind === 'refund' ? 'Refund' : x.renewal ? 'Renewal' : 'Payment'}
                    </span>
                    <span className="font-medium">{money(x.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-well px-4 py-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className={`mt-0.5 truncate font-semibold ${accent ? 'text-revenue' : ''}`}>{value}</div>
    </div>
  );
}

/** GitHub-style activity grid of the visitor's last 26 weeks (pages viewed per day), as in DataFast journeys. */
function ActivityGrid({ sessions, tz }: { sessions: { started_at: number; pageviews: number }[]; tz: string }) {
  const WEEKS = 26;
  const day = (ts: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
  const per = new Map<string, number>();
  for (const s of sessions) per.set(day(s.started_at), (per.get(day(s.started_at)) ?? 0) + Math.max(1, Number(s.pageviews) || 1));
  const today = new Date(day(Date.now()) + 'T00:00:00Z');
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - ((today.getUTCDay() + 6) % 7))); // Sunday of this week
  const cells: { key: string; n: number; future: boolean }[] = [];
  for (let i = WEEKS * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, n: per.get(key) ?? 0, future: d > today });
  }
  const max = Math.max(1, ...cells.map((c) => c.n));
  const active = cells.filter((c) => c.n > 0).length;
  const level = (n: number) => (n === 0 ? 'bg-well' : n / max > 0.66 ? 'bg-accent' : n / max > 0.33 ? 'bg-accent/60' : 'bg-accent/30');
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="font-medium text-ink-2">Activité sur 6 mois</span>
        <span className="text-ink-4">{active} jour{active > 1 ? 's' : ''} actif{active > 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`Activité : ${active} jours avec au moins une visite sur les 26 dernières semaines`}>
          {cells.map((c) => (
            <span key={c.key} title={c.future ? undefined : `${c.key} : ${c.n} page${c.n > 1 ? 's' : ''}`} className={`h-[11px] w-[11px] rounded-[3px] ${c.future ? 'opacity-0' : level(c.n)}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

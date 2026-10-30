import { useEffect, useState, type ReactNode } from 'react';
import { api, type Site } from '../lib/api';
import { fmtAgo } from '../lib/format';

type ProviderKey = 'stripe' | 'lemonsqueezy' | 'polar';
interface ProviderStatus {
  connected: boolean;
  connectedAt: number | null;
  lastEventAt: number | null;
  lastEvent: string | null;
  webhookUrl: string;
}
type Status = Record<ProviderKey, ProviderStatus> & { dodo: { connected: boolean; webhookUrl: string } };

const PROVIDERS: { key: ProviderKey; name: string; events: string; secretHint: string; where: string; metadata: ReactNode }[] = [
  {
    key: 'stripe',
    name: 'Stripe',
    events: 'checkout.session.completed, invoice.paid, charge.refunded',
    secretHint: 'whsec_…',
    where: 'Stripe › Développeurs › Webhooks › Ajouter une destination, puis « Clé secrète de signature ».',
    metadata: <>Passez l’identifiant visiteur à la session Checkout : <code>metadata: {'{'} ml_visitor_id {'}'}</code> (ou <code>client_reference_id</code>). Sans lui, la correspondance se fait par e-mail ou par client.</>,
  },
  {
    key: 'lemonsqueezy',
    name: 'Lemon Squeezy',
    events: 'order_created, subscription_payment_success, order_refunded',
    secretHint: 'votre « signing secret »',
    where: 'Lemon Squeezy › Settings › Webhooks › +, choisissez un « Signing secret ».',
    metadata: <>Ajoutez <code>checkout[custom][ml_visitor_id]</code> à vos liens de paiement.</>,
  },
  {
    key: 'polar',
    name: 'Polar',
    events: 'order.paid, order.refunded',
    secretHint: 'votre secret de webhook',
    where: 'Polar › Settings › Webhooks › Add endpoint (format Raw).',
    metadata: <>Passez <code>metadata: {'{'} ml_visitor_id {'}'}</code> à la session de paiement.</>,
  },
];

/** Readable cookie name the tracker sets for the visitor id. */
const VISITOR_SNIPPET = `// Côté navigateur, avant de créer le paiement
const visitorId = document.cookie.match(/(?:^|; )ml_vid=([^;]+)/)?.[1];`;

/**
 * Revenue attribution integrations (Stripe, Lemon Squeezy, Polar). Each one stays « À configurer » until the owner
 * pastes their own webhook signing secret: nothing is connected on their behalf and no key is invented.
 */
export function RevenueIntegrations({ site, Section, Code }: { site: Site; Section: (p: { title: string; desc?: ReactNode; children: ReactNode }) => ReactNode; Code: (p: { children: string }) => ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Status>(`/api/sites/${site.id}/integrations`).then(setStatus, (e) => setError((e as Error).message));
  }, [site.id]);
  return (
    <Section
      title="Stripe, Lemon Squeezy, Polar (attribution des revenus)"
      desc="Reliez votre outil de paiement : chaque vente est rattachée au visiteur et à la source qui l’a amené (revenu par source, par page d’entrée, par campagne, dans les entonnoirs)."
    >
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p.key} site={site} p={p} st={status?.[p.key] ?? null} onChange={setStatus} Code={Code} />
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">Récupérer l’identifiant visiteur pour la meilleure attribution</summary>
        <div className="mt-2"><Code>{VISITOR_SNIPPET}</Code></div>
      </details>
    </Section>
  );
}

function ProviderCard({ site, p, st, onChange, Code }: { site: Site; p: (typeof PROVIDERS)[number]; st: ProviderStatus | null; onChange: (s: Status) => void; Code: (p: { children: string }) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connected = !!st?.connected;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[14px] font-semibold">{p.name}</span>
          {st === null ? <span className="ml-skeleton h-5 w-20" /> : connected ? (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Connecté</span>
          ) : (
            <span className="rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">À configurer · secret requis</span>
          )}
        </div>
        <div className="flex gap-2">
          {connected && (
            <button
              className="btn text-danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Déconnecter ${p.name} ? Les paiements déjà enregistrés restent.`)) return;
                setBusy(true);
                try { onChange(await api<Status>(`/api/sites/${site.id}/integrations/${p.key}`, { method: 'DELETE' })); } finally { setBusy(false); }
              }}
            >
              Déconnecter
            </button>
          )}
          <button className={connected ? 'btn' : 'btn-dark'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{connected ? 'Modifier' : 'Configurer'}</button>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        {connected
          ? st?.lastEventAt ? `Dernier événement reçu ${fmtAgo(Date.now() - st.lastEventAt)} (${st.lastEvent}).` : 'En attente du premier événement de votre compte.'
          : `Nécessite votre propre secret de signature ${p.name} : rien n’est envoyé à ${p.name} depuis Minilytics.`}
      </p>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium">1. URL du webhook</div>
            <Code>{st?.webhookUrl ?? ''}</Code>
            <p className="mt-1 text-[12px] text-ink-3">Événements : <code>{p.events}</code></p>
          </div>
          <div>
            <div className="mb-1 font-medium">2. Secret de signature</div>
            <p className="mb-2 text-[12px] text-ink-3">{p.where}</p>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                setBusy(true);
                try {
                  onChange(await api<Status>(`/api/sites/${site.id}/integrations/${p.key}`, { method: 'PUT', json: { secret } }));
                  setSecret('');
                  setOpen(false);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input className="input min-w-0 flex-1 font-mono" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={p.secretHint} aria-label={`Secret de signature ${p.name}`} />
              <button className="btn-dark" disabled={busy || secret.trim().length < 8}>Enregistrer</button>
            </form>
            {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
            <p className="mt-1 text-[11px] text-ink-4">Stocké côté serveur, jamais réaffiché. Chaque webhook est vérifié avec ce secret.</p>
          </div>
          <div>
            <div className="mb-1 font-medium">3. Identifier le visiteur (recommandé)</div>
            <p className="text-[12px] text-ink-3">{p.metadata}</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface Exclusions {
  paths: string[];
  ips: string[];
  countries: string[];
  hostnames: string[];
  yourIp?: string;
}

const FIELDS: { key: keyof Omit<Exclusions, 'yourIp'>; label: string; placeholder: string; help: string }[] = [
  { key: 'paths', label: 'Chemins', placeholder: '/admin\n/app/*', help: '/admin exclut seulement /admin ; /admin/* exclut tout ce qui est sous /admin.' },
  { key: 'ips', label: 'Adresses IP', placeholder: '203.0.113.7\n10.0.*', help: 'Une IP par ligne ; * à la fin pour un préfixe.' },
  { key: 'countries', label: 'Pays (code ISO)', placeholder: 'RU\nCN', help: 'Deux lettres, ex. FR, US.' },
  { key: 'hostnames', label: 'Domaines', placeholder: 'staging.monsite.com', help: 'Préproduction, aperçus…' },
];

/** Exclusions applied at ingestion (DataFast-style): excluded visits are never stored. */
export function ExclusionsSettings({ site, Section }: { site: Site; Section: (p: { title: string; desc?: ReactNode; children: ReactNode }) => ReactNode }) {
  const [ex, setEx] = useState<Exclusions | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<Exclusions>(`/api/sites/${site.id}/exclusions`).then((e) => {
      setEx(e);
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, (e[f.key] ?? []).join('\n')])));
    });
  }, [site.id]);
  const lines = (s: string | undefined) => (s ?? '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  async function save(next = draft) {
    setError('');
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, lines(next[f.key])]));
      const r = await api<Exclusions>(`/api/sites/${site.id}/exclusions`, { method: 'PUT', json: body });
      setEx((e) => ({ ...r, yourIp: e?.yourIp }));
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, r[f.key].join('\n')])));
      const dropped = FIELDS.reduce((n, f) => n + lines(next[f.key]).length - r[f.key].length, 0);
      setMsg(dropped > 0 ? `Enregistré (${dropped} valeur${dropped > 1 ? 's' : ''} invalide${dropped > 1 ? 's' : ''} ignorée${dropped > 1 ? 's' : ''})` : 'Enregistré');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Section title="Exclusions" desc="Ces visites ne sont jamais enregistrées : vos propres visites, des pages internes, des pays ou des domaines de test.">
      {!ex && <div className="ml-skeleton h-32" />}
      {ex && (
        <>
          {ex.yourIp && ex.yourIp !== 'unknown' && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-well px-3 py-2.5 text-sm">
              <span>Votre IP actuelle : <code className="font-mono">{ex.yourIp}</code>{ex.ips.includes(ex.yourIp) && <span className="ml-2 text-success">· déjà exclue</span>}</span>
              {!ex.ips.includes(ex.yourIp) && (
                <button className="btn" onClick={() => { const next = { ...draft, ips: [lines(draft.ips).join('\n'), ex.yourIp].filter(Boolean).join('\n') }; setDraft(next); save(next); }}>
                  Exclure mes visites
                </button>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block min-w-0">
                <span className="text-[13px] font-medium">{f.label}</span>
                <textarea className="input mt-1 min-h-[88px] py-2 font-mono text-[13px]" value={draft[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                <span className="mt-1 block text-[11px] text-ink-4">{f.help}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-dark" onClick={() => save()}>Enregistrer les exclusions</button>
            {msg && <span className="text-[13px] text-success">{msg}</span>}
            {error && <span className="text-[13px] text-danger">{error}</span>}
          </div>
        </>
      )}
    </Section>
  );
}

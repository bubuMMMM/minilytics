import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../App';
import { AppHeader, BottomNav } from '../components/AppNav';
import { Favicon } from '../components/Icons';
import { buildAiPrompt } from '../lib/aiPrompt';
import { api, type Site } from '../lib/api';

function Section({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-4 sm:p-6">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-3">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative min-w-0">
      <code className="code !p-4 !pr-20 !text-[12px] sm:!p-5 sm:!text-[13px]">{children}</code>
      <button
        className="absolute right-2 top-2 min-h-[32px] rounded-md border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-xs hover:text-ink"
        onClick={() => {
          navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}

export function Settings({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [form, setForm] = useState<Partial<Site>>({});
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const origin = window.location.origin;

  useEffect(() => {
    api<Site>(`/api/sites/${siteId}`).then((s) => {
      setSite(s);
      setForm({ name: s.name, domain: s.domain, timezone: s.timezone, currency: s.currency, dodo_webhook_secret: s.dodo_webhook_secret ?? '' });
    });
  }, [siteId]);

  async function save(patch: Partial<Site>, msg = 'Enregistré') {
    setError('');
    try {
      const s = await api<Site>(`/api/sites/${siteId}`, { method: 'PATCH', json: patch });
      setSite(s);
      setSaved(msg);
      setTimeout(() => setSaved(''), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!site) return null;
  const snippet = `<script\n  defer\n  data-website-id="${site.id}"\n  src="${origin}/js/script.js"\n></script>`;
  const webhookUrl = `${origin}/api/webhooks/dodo/${site.id}`;

  return (
    <div className="ml-site-bg ml-has-bottom-nav min-h-screen">
    <AppHeader siteId={site.id} active="settings" title={site.name} />
    <main id="contenu" className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Réglages</h1><p className="mt-1 text-[13px] text-ink-3">Installation du script, objectifs, paiements et préférences.</p></div>
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">
          <Favicon domain={site.domain} size={16} /> <span className="truncate font-mono text-[12px]" translate="no">{site.domain}</span>
        </div>
      </div>

      <AiSetup site={site} origin={origin} />

      <Section title="1. Installer le script de suivi" desc={<>Collez-le dans le <code>&lt;head&gt;</code> de chaque page de {site.domain} (et de ses sous-domaines).</>}>
        <Code>{snippet}</Code>
        <details className="mt-4 text-sm">
          <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">Exemple Next.js / React</summary>
          <div className="mt-3">
            <Code>{`// app/layout.tsx
import Script from 'next/script';

<head>
  <Script defer data-website-id="${site.id}" src="${origin}/js/script.js" strategy="afterInteractive" />
</head>`}</Code>
          </div>
        </details>
        <details className="mt-3 text-sm">
          <summary className="flex min-h-[44px] cursor-pointer items-center font-medium">Contourner les bloqueurs de pub (recommandé pour la précision)</summary>
          <p className="mt-2 text-ink-2">
            Les bloqueurs de publicité peuvent bloquer les domaines d’analytics tiers. Servez le script et l’endpoint depuis votre propre domaine avec une réécriture, puis pointez le script dessus :
          </p>
          <div className="mt-3">
            <Code>{`// next.config.js
async rewrites() {
  return [
    { source: '/stats/script.js', destination: '${origin}/js/script.js' },
    { source: '/stats/event', destination: '${origin}/api/event' },
  ];
}

<script defer data-website-id="${site.id}" data-api="/stats/event" src="/stats/script.js"></script>`}</Code>
          </div>
        </details>
        <p className="mt-4 text-sm text-ink-3">
          Excluez vos propres visites : ouvrez <code>https://{site.domain}/?ml_ignore=true</code> une fois dans chaque navigateur que vous utilisez.
        </p>
      </Section>

      <Section title="2. Suivre les clics et les objectifs" desc="Les objectifs apparaissent dans l’onglet Objectifs et servent dans les entonnoirs et les filtres. Les vidéos et actions personnalisées alimentent les vues Vidéos et Interactions.">
        <Code>{`<!-- N'importe quel élément : un clic envoie l'objectif -->
<button data-ml-goal="signup_click">Commencer</button>

<!-- Des détails supplémentaires sont joints comme propriétés -->
<a href="/pricing" data-ml-goal="pricing_click" data-ml-goal-plan="pro">Tarifs</a>

<script>
  // Depuis votre code
  window.minilytics('goal', 'signup', { plan: 'pro' });

  // Action non convertissante (recherche, partage, filtre…)
  window.minilytics('event', 'search', { label: 'requête' });

  // Lecteur vidéo : start, play, pause, seek, progress, watch, complete
  window.minilytics('video', 'start', { id: 'abc', title: 'Titre', channel: 'Chaîne', duration: 212 });

  // Après connexion : associer un nom / e-mail au visiteur
  window.minilytics('identify', { user_id: '123', email: 'jane@acme.com', name: 'Jane' });
</script>`}</Code>
        <p className="mt-3 text-sm text-ink-3">Les clics vers des liens externes sont suivis automatiquement (onglet Liens sortants).</p>
      </Section>

      <Section title="Sponsors et contenus (impressions et clics)" desc="Ajoutez des attributs aux éléments à mesurer. Une impression compte quand au moins la moitié de l’élément reste visible 1 seconde, une fois par page vue. Les clics (y compris molette et nouvel onglet) partent même si la page change.">
        <Code>{`<!-- Un emplacement sponsor : vue Sponsors -->
<a href="https://sponsor.com" data-ml-block="trending-sponsor-2"
   data-ml-sponsor="Nom du sponsor">…</a>

<!-- Une section de contenus : vue Contenus -->
<section data-ml-block="home-tendances" data-ml-kind="content">
  <a href="/watch?v=ID" data-ml-item="ID" data-ml-pos="1"
     data-ml-title="Titre de la vidéo">…</a>
</section>`}</Code>
      </Section>

      <Section
        title="Nouveau · Analyse du scroll et du comportement"
        desc="Aucune nouvelle installation n'est nécessaire. La version actuelle du script mesure automatiquement le scroll, le temps actif et les clics vers les pages internes."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['25 · 50 · 75 · 90 · 100 %', 'Profondeur de scroll atteinte par page'],
            ['Temps actif', 'Temps estimé sur un onglet visible avec interaction récente'],
            ['Clics internes', 'Destinations de navigation, sans paramètres d’URL'],
          ].map(([value, label]) => <div key={value} className="rounded-xl border border-accent/30 bg-well p-4"><p className="text-[13px] font-semibold text-accent">{value}</p><p className="mt-2 text-[12px] leading-relaxed text-ink-3">{label}</p></div>)}
        </div>
        <p className="mt-5 text-sm text-ink-2">Pour suivre les soumissions d'un formulaire, ajoutez simplement <code>data-ml-form</code> à sa balise. Aucun nom de champ, réponse ou saisie n'est transmis.</p>
        <div className="mt-3">
          <Code>{`<!-- Un événement "form" à chaque soumission valide -->
<form data-ml-form="contact" action="/contact" method="post">
  <!-- Vos champs restent privés -->
  <button type="submit">Envoyer</button>
</form>

<!-- Facultatif : exclure un lien du suivi des clics -->
<a data-ml-ignore href="/account">Mon compte</a>`}</Code>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">Les nouveaux indicateurs démarrent à la mise à jour du script. Ils ne reconstituent pas l'historique. Les seuils de scroll correspondent à des sessions, pas à des enregistrements vidéo ni à un suivi de la souris.</p>
      </Section>

      <Section
        title="3. Connecter Dodo Payments (attribution des revenus)"
        desc="Les paiements sont liés au visiteur qui a payé et attribués à la source qui l’a amené."
      >
        <ol className="list-decimal space-y-4 pl-5 text-sm">
          <li>
            Dans Dodo Payments → <b>Developer → Webhooks</b>, ajoutez cet endpoint et abonnez-le à <code>payment.succeeded</code> et{' '}
            <code>refund.succeeded</code> :
            <div className="mt-2">
              <Code>{webhookUrl}</Code>
            </div>
          </li>
          <li>
            Collez le <b>secret de signature</b> du webhook (il commence par <code>whsec_</code>) :
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                className="input min-w-0 font-mono"
                type="password"
                placeholder="whsec_..."
                value={form.dodo_webhook_secret ?? ''}
                onChange={(e) => setForm({ ...form, dodo_webhook_secret: e.target.value })}
              />
              <button className="btn-dark" onClick={() => save({ dodo_webhook_secret: form.dodo_webhook_secret ?? '' }, 'Secret du webhook enregistré')}>
                Enregistrer
              </button>
            </div>
            {site.dodo_webhook_secret && <p className="mt-1 text-xs text-success">✓ Secret configuré</p>}
          </li>
          <li>
            Transmettez les cookies du visiteur en métadonnées à la création du paiement (c’est ce qui rend l’attribution exacte) :
            <div className="mt-2">
              <Code>{`import DodoPayments from 'dodopayments';
import { cookies } from 'next/headers';

const dodo = new DodoPayments({ bearerToken: process.env.DODO_PAYMENTS_API_KEY });
const jar = await cookies();

const session = await dodo.checkoutSessions.create({
  product_cart: [{ product_id: 'pdt_xxx', quantity: 1 }],
  return_url: 'https://${site.domain}/thanks',
  metadata: {
    ml_visitor_id: jar.get('ml_vid')?.value ?? '',
    ml_session_id: jar.get('ml_sid')?.value ?? '',
  },
});`}</Code>
            </div>
            <p className="mt-2 text-ink-3">
              Vous utilisez plutôt des <b>liens de paiement</b> Dodo (checkout.dodopayments.com/buy/…) ? Le script y ajoute automatiquement les métadonnées au clic, mais elles n’atteignent pas toujours le paiement : configurez aussi l’URL de retour (étape 4). Dans le navigateur, les identifiants sont lisibles avec <code>window.minilytics.attribution()</code>.
            </p>
            <p className="mt-2 text-ink-3">
              Sans métadonnées, Minilytics relie quand même le paiement quand l’acheteur revient sur votre site, quand son e-mail correspond à un visiteur passé à <code>identify()</code>, quand il s’agit d’un renouvellement, ou quand un seul visiteur a cliqué sur un lien de paiement juste avant de payer. L’onglet Parcours montre comment chaque paiement a été rapproché.
            </p>
          </li>
          <li>
            <b>Recommandé :</b> dans Dodo, réglez l’<b>URL de retour</b> de votre produit sur une page de votre site, par ex.{' '}
            <code>https://{site.domain}/thanks</code>. Dodo y ajoute <code>?payment_id=…</code>, ce qui permet de relier le paiement au visiteur exact même sans métadonnées (par exemple avec les liens de paiement).
          </li>
        </ol>
      </Section>

      <Section title="Autres moyens de paiement / API serveur" desc="Envoyez des paiements ou des objectifs depuis votre backend avec la clé API de ce site.">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input className="input min-w-0 font-mono" readOnly value={site.api_key} aria-label="Clé API" />
          <button
            className="btn"
            onClick={async () => {
              if (!confirm('Régénérer la clé API ? L’ancienne clé cesse de fonctionner immédiatement.')) return;
              const r = await api<{ api_key: string }>(`/api/sites/${siteId}/rotate-key`, { method: 'POST' });
              setSite({ ...site, api_key: r.api_key });
            }}
          >
            Régénérer
          </button>
        </div>
        <Code>{`curl -X POST ${origin}/api/v1/payments \\
  -H "Authorization: Bearer ${site.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"transaction_id":"txn_123","amount":29.99,"currency":"${site.currency}","visitor_id":"<ml_vid cookie>","email":"jane@acme.com"}'

curl -X POST ${origin}/api/v1/goals \\
  -H "Authorization: Bearer ${site.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"visitor_id":"<ml_vid cookie>","name":"signup"}'`}</Code>
      </Section>

      <LinkBuilder domain={site.domain} />

      <Section title="Page d'accueil publique">
        <p className="text-sm text-muted">Affiche les statistiques agrégées de ce site (visiteurs, pages, sources, pays) sur la page d'accueil de Minilytics, sans connexion. Aucune donnée individuelle ni clé API n'est exposée.</p>
        <label className="mt-4 flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4" checked={Number(site.is_public ?? 0) === 1}
            onChange={(e) => save({ is_public: e.target.checked ? 1 : 0 }, e.target.checked ? 'Site affiché sur la page publique' : 'Site retiré de la page publique')} />
          Afficher ce site sur la page d'accueil publique
        </label>
      </Section>

      <Section title="Général">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nom</label>
            <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Domaine</label>
            <input className="input" value={form.domain ?? ''} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </div>
          <div>
            <label className="label">Fuseau horaire</label>
            <input className="input" value={form.timezone ?? ''} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </div>
          <div>
            <label className="label">Devise des revenus</label>
            <input className="input" value={form.currency ?? ''} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
        </div>
        <button className="btn-dark mt-4" onClick={() => save({ name: form.name, domain: form.domain, timezone: form.timezone, currency: form.currency }, 'Modifications enregistrées')}>
          Enregistrer les modifications
        </button>
      </Section>

      {(saved || error) && (
        <div className={`fixed bottom-24 left-1/2 z-50 md:bottom-6 -translate-x-1/2 rounded-xl px-4 py-2 text-sm text-white shadow-lg ${error ? 'bg-danger' : 'bg-ink'}`}>
          {error || saved}
        </div>
      )}

      <Section title="Zone de danger">
        <button
          className="btn border-danger/30 text-danger"
          onClick={async () => {
            if (prompt(`Tapez ${site.domain} pour supprimer ce site et toutes ses données`) !== site.domain) return;
            await api(`/api/sites/${siteId}`, { method: 'DELETE' });
            navigate('/sites');
          }}
        >
          Supprimer le site et toutes ses données
        </button>
      </Section>
    </main>
    <BottomNav siteId={site.id} active="settings" />
    </div>
  );
}

/** One-click prompt for the owner's coding AI, so it can install everything in their codebase. */
function AiSetup({ site, origin }: { site: Site; origin: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const prompt = buildAiPrompt(site, origin);
  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><span className="rounded-full border border-line px-2 py-px text-[11px] font-medium text-ink-3">Rapide</span>Installer avec une IA</h2>
          <p className="mt-1 max-w-lg text-sm text-ink-2">
            Copiez ce prompt dans Claude Code, Cursor ou toute IA de code ouverte dans votre projet. Elle installe le script, branche l’attribution Dodo Payments, identifie les utilisateurs et ajoute les objectifs de boutons, avec les vraies valeurs de ce site. Elle ne vous demande que ce qu’elle ne trouve pas dans votre code.
          </p>
        </div>
        <button
          className="btn-dark shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? '✓ Copié' : 'Copier le prompt IA'}
        </button>
      </div>
      <button className="mt-3 min-h-[44px] text-sm font-medium text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'Masquer le prompt' : 'Aperçu du prompt'}
      </button>
      {open && <pre className="code mt-3 max-h-96 whitespace-pre-wrap">{prompt}</pre>}
      <p className="mt-3 text-xs text-ink-3">
        L’IA s’occupe du code. Le webhook Dodo reste à connecter vous-même (étape 3 ci-dessous), car cela se fait dans le tableau de bord Dodo.
      </p>
    </section>
  );
}

const PRESETS = [
  { label: 'X / Twitter', source: 'x', medium: 'social' },
  { label: 'LinkedIn', source: 'linkedin', medium: 'social' },
  { label: 'Reddit', source: 'reddit', medium: 'social' },
  { label: 'YouTube', source: 'youtube', medium: 'video' },
  { label: 'Medium', source: 'medium', medium: 'article' },
  { label: 'Newsletter', source: 'newsletter', medium: 'email' },
  { label: 'Product Hunt', source: 'producthunt', medium: 'referral' },
];

/** Build a tagged link per tweet / article, so each one shows up separately in Campaign. */
function LinkBuilder({ domain }: { domain: string }) {
  const [url, setUrl] = useState(`https://${domain}/`);
  const [preset, setPreset] = useState(PRESETS[0]);
  const [campaign, setCampaign] = useState('');
  let built = '';
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', preset.source);
    u.searchParams.set('utm_medium', preset.medium);
    if (campaign) u.searchParams.set('utm_campaign', campaign.trim().toLowerCase().replace(/\s+/g, '-'));
    built = u.toString();
  } catch {}
  return (
    <Section
      title="Générateur de liens"
      desc="X, Medium et d’autres masquent quel post exact a amené un visiteur. Utilisez un lien balisé dans chaque post : il apparaîtra par son nom dans Sources → Campagne, avec les revenus générés."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="label">Page</label>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">Où vous le publiez</label>
          <select className="input" value={preset.label} onChange={(e) => setPreset(PRESETS.find((p) => p.label === e.target.value)!)}>
            {PRESETS.map((p) => (
              <option key={p.label}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nom du post (campagne)</label>
          <input className="input" placeholder="launch-tweet, seo-guide-article…" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        </div>
      </div>
      {built && (
        <div className="mt-4">
          <Code>{built}</Code>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">
        Alternative plus courte : <code>?ref=launch-tweet</code> fonctionne aussi et apparaît comme référent.
      </p>
    </Section>
  );
}

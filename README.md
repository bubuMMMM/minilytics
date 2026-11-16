# Minilytics

Analytique web orientée revenu pour vos propres sites, inspirée de DataFast. Elle montre d’où viennent les visiteurs (tweet, article, page Google ou assistant IA), ce qu’ils ont fait, et **quelle source vous a rapporté de l’argent**. L’application tourne sur [Vercel](https://vercel.com) avec une base [Neon](https://neon.tech) (Postgres).

![Tableau de bord](docs/dashboard.png)

## Sponsors

<table>
  <tr>
    <td align="center" width="33%">
      <a href="https://diskmate.app/?ref=minilytics-github"><img src="docs/sponsors/diskmate.svg" width="64" height="64" alt="DiskMate"></a><br>
      <a href="https://diskmate.app/?ref=minilytics-github"><b>DiskMate</b></a><br>
      <sub>Disk space analyzer &amp; cleaner for Mac</sub>
    </td>
    <td align="center" width="33%">
      <a href="https://pastebuddy.app/?ref=minilytics-github"><img src="docs/sponsors/pastebuddy.svg" width="64" height="64" alt="PasteBuddy"></a><br>
      <a href="https://pastebuddy.app/?ref=minilytics-github"><b>PasteBuddy</b></a><br>
      <sub>Clipboard history for Mac: never lose what you copy</sub>
    </td>
    <td align="center" width="33%">
      <a href="https://checkout.dodopayments.com/buy/pdt_0NqWPM98xzStsrTUMLyxE?quantity=1"><b>Your logo here</b></a><br>
      <sub>Reach indie hackers and developers who self-host their analytics</sub><br><br>
      <a href="https://checkout.dodopayments.com/buy/pdt_0NqWPM98xzStsrTUMLyxE?quantity=1">Become a sponsor →</a>
    </td>
  </tr>
</table>

<p align="center">
  <a href="https://checkout.dodopayments.com/buy/pdt_0NqWPM98xzStsrTUMLyxE?quantity=1"><img src="https://img.shields.io/badge/Become%20a%20sponsor-%2419%2Fmonth%20early%20price-e07b5f?style=for-the-badge" alt="Become a sponsor: $19/month early price"></a>
</p>

## Ce qui est mesuré

- **Visiteurs, revenu, taux de conversion, revenu par visiteur, taux de rebond, durée de session, en ligne maintenant**, chacun avec un % d’évolution par rapport à la période précédente
- Un graphique des visiteurs (ligne) et du revenu (barres), à l’heure, au jour, à la semaine ou au mois
- Plages de dates : aujourd’hui, hier, 24 h, 2 jours, 7/30/90 jours, 12 mois, tout, et plage personnalisée, avec ‹ › pour reculer et avancer
- **D’où viennent les visiteurs** : canal, référent (X, Google, ChatGPT, Reddit…), campagne (`utm_campaign`), mot-clé (`utm_term`), étiquettes `?ref=`
- **Où ils sont et ce qu’ils utilisent** : pays, région, ville, navigateur, OS, appareil
- **Ce qu’ils ont fait** : pages, pages d’entrée, liens de sortie (clics sortants), clics sur boutons et objectifs personnalisés, entonnoirs
- **Qui a payé** : une liste Parcours de chaque client avec sa source, le montant, le délai de conversion, et une timeline (visite → pages → clics → paiement)
- Cliquez une ligne pour filtrer tout le tableau de bord (par exemple « uniquement les visiteurs du tweet de lancement »)
- Plusieurs sites, une seule connexion

## Déployer sur Vercel + Neon

Vous déployez **votre propre copie**. Les données restent dans votre projet Neon, et le tableau de bord a son propre mot de passe.

Il vous faut un compte [Vercel](https://vercel.com/signup), un compte [Neon](https://neon.tech), [Node.js 20+](https://nodejs.org) et Git.

**1. Récupérer le code**

```bash
git clone https://github.com/bubuMMMM/minilytics.git
cd minilytics
npm install
```

La branche de travail est `vercel-port` (pas `main`).

**2. Créer la base Neon**

Créez un projet Postgres sur Neon et copiez l’URL de connexion. Placez-la dans `.env.local` (voir `.env.example`) :

```bash
cp .env.example .env.local
# Renseignez DATABASE_URL, ADMIN_PASSWORD et SESSION_SECRET
npm run db:migrate:pg
```

`SESSION_SECRET` doit être une longue chaîne aléatoire, par exemple la sortie de `openssl rand -hex 32`.

**3. Variables d’environnement Vercel**

Dans le projet Vercel, définissez au minimum :

- `DATABASE_URL` — URL Neon (ou `POSTGRES_URL`)
- `ADMIN_PASSWORD` — mot de passe du tableau de bord
- `SESSION_SECRET` — signature des cookies de session
- `CRON_SECRET` — secret envoyé par Vercel Cron en `Authorization: Bearer …`

Optionnel : `X_BEARER_TOKEN`, `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, jetons GitHub / Reddit / Google / Meta (voir `.env.example`).

**4. Déployer**

```bash
npx vercel deploy --prod
```

Ouvrez l’URL affichée, connectez-vous, ajoutez un site et copiez sa balise de script. La page Réglages d’un site propose aussi **Copier le prompt IA** pour faire installer le script par un assistant dans votre code.

Vous pouvez attacher un domaine personnalisé du type `analytics.votre-domaine.com` dans Vercel → Project → Settings → Domains.

Les migrations se jouent avec `npm run db:migrate:pg` (dossier `migrations-pg/`, source unique du schéma). Appliquez-les à la même base que celle utilisée en production **avant** ou juste après un déploiement qui en dépend.

## Installer sur un site

```html
<script defer data-website-id="SITE_ID" src="https://VOTRE-HOTE-MINILYTICS/js/script.js"></script>
```

- **Clics / objectifs :** `<button data-ml-goal="signup_click">`, ou `window.minilytics('goal', 'signup', { plan: 'pro' })`
- **Identifier un utilisateur connecté :** `window.minilytics('identify', { user_id, email, name })`
- **Ignorer vos propres visites :** ouvrez une fois `https://votresite.com/?ml_ignore=true` dans le navigateur
- **Applications monopage** (Next.js, React Router…) : prises en charge automatiquement
- **Sous-domaines :** `app.votresite.com` et `votresite.com` partagent le même visiteur, le cookie étant posé sur le domaine racine

### Suivre un tweet ou un article précis

X, Medium, LinkedIn et d’autres masquent le contenu exact qui a envoyé quelqu’un ; le référent dit seulement `t.co` ou `medium.com`. Pour voir le post précis, étiquetez chaque lien. Les réglages proposent un constructeur d’URL :

```
https://votresite.com/?utm_source=x&utm_medium=social&utm_campaign=launch-tweet
https://votresite.com/?ref=launch-tweet            (version courte)
```

Pour le SEO, Google ne transmet jamais le mot-clé, mais la **page d’entrée** combinée au référent **Google** indique par quel article on vous a trouvés.

## Attribution des revenus avec Dodo Payments

1. Dans Dodo → Developer → Webhooks, ajoutez `https://VOTRE-HOTE/api/webhooks/dodo/SITE_ID` et abonnez-vous à `payment.succeeded` et `refund.succeeded`. Collez le secret de signature (`whsec_…`) dans les réglages du site.
2. Passez les cookies visiteur en métadonnées à la création du checkout :

```ts
const jar = await cookies(); // next/headers
await dodo.checkoutSessions.create({
  product_cart: [{ product_id: 'pdt_xxx', quantity: 1 }],
  metadata: { ml_visitor_id: jar.get('ml_vid')?.value ?? '', ml_session_id: jar.get('ml_sid')?.value ?? '' },
});
```

Vous utilisez des **liens de paiement** Dodo ? Le script ajoute `metadata_ml_visitor_id` / `metadata_ml_session_id` à tout lien `checkout.dodopayments.com` cliqué. Ces métadonnées n’arrivent pas toujours jusqu’au paiement : faites aussi l’étape 3.

3. Recommandé : l’URL de retour du checkout doit être une page de votre site (par ex. `/thanks`) qui charge le script. Dodo ajoute `?payment_id=…`, et Minilytics s’en sert pour relier le paiement au visiteur même si les métadonnées manquent.

**Règle d’attribution :** un paiement est crédité à la dernière visite du client issue d’une vraie source (dernier touché non direct). Donc « a cliqué un tweet, est revenu en direct 17 jours plus tard et a payé » est attribué au tweet. Si les métadonnées manquent, Minilytics essaie, dans l’ordre : la page de retour (`?payment_id=`), un paiement antérieur du même client (renouvellements), un e-mail passé à `identify()`, enfin le moment du checkout (uniquement s’il n’y a qu’un visiteur qui a cliqué un lien Dodo dans les 3 heures avant le paiement). L’onglet Parcours montre comment chaque paiement a été apparié ; **Réessayer l’appariement** relance ça pour les anciens paiements. Les remboursements sont soustraits du revenu.

Les autres prestataires peuvent utiliser l’API générique (la clé est dans les réglages du site) :

```bash
curl -X POST https://VOTRE-HOTE/api/v1/payments -H "Authorization: Bearer ml_..." -H "Content-Type: application/json" \
  -d '{"transaction_id":"txn_1","amount":29.99,"currency":"USD","visitor_id":"<cookie ml_vid>","email":"jane@acme.com"}'
```

## Fiabilité du script de suivi

- Les balises de script en double pour le même site sont ignorées, pour éviter les écouteurs et pages vues en double.
- Si les cookies sont bloqués ou lèvent une erreur, les identifiants restent stables en mémoire pour le document courant. Un rechargement ou un autre onglet peut encore compter comme un autre visiteur ; aucun fingerprinting n’est utilisé.
- Une restauration depuis le cache aller/retour du navigateur compte une nouvelle page vue, sans ajouter le temps passé ailleurs au temps d’engagement.
- Les liens sortants respectent les frontières exactes de domaine / sous-domaine ; un clic droit n’est pas compté comme un passage.
- Les paramètres de requête sensibles, les identifiants d’URL et les fragments sont retirés des pages et référents collectés. Ce n’est pas une garantie contre des données personnelles placées dans un chemin ou un paramètre personnalisé.
- Les propriétés d’objectifs personnalisés conservent du JSON valide dans une limite de 1 000 octets. Les propriétés trop grandes sont raccourcies ou omises, plutôt que de couper le JSON au milieu.

## Limites de précision

Aucun outil d’analytique n’est exact à 100 %. Principaux écarts et la façon dont ce projet les traite :

- **Bloqueurs de pub** : certains domaines d’analytique sont bloqués. Proxifiez le script via votre propre domaine (les réglages montrent une rewrite Next.js). Les paiements sont toujours enregistrés par le webhook, même si le navigateur a bloqué le suivi.
- **Safari** conserve au plus 7 jours les cookies posés en JavaScript. Un visiteur Safari qui revient après plus d’une semaine compte comme nouveau. L’e-mail ci-dessus permet de rattacher la plupart de ces paiements.
- **Bots** filtrés d’après l’user-agent et le drapeau `navigator.webdriver`.
- Un revenu dans une autre devise que celle du site n’est converti que lorsque Dodo fournit un montant de règlement dans la devise du site.

## Développement local

```bash
cp .env.example .env.local    # mot de passe : change-me (à modifier)
npm run db:migrate:pg         # applique migrations-pg/ sur DATABASE_URL
npm run dev                   # API http://localhost:8787 + tableau de bord http://localhost:5173
# ou séparément : npm run dev:api  et  npm run dev:web

npm run seed                  # optionnel : écrit .data/seed.sql (30 jours de démo « ShipKit »)
                              # appliquez ce fichier uniquement à une base locale, jamais la production
npm test                      # tests unitaires
npm run typecheck
npm run lint                  # ESLint du serveur
npm run check                 # typecheck + lint
npm run smoke                 # test de bout en bout contre l’API de dev
```

## Architecture

- `public/js/script.js` : le tracker, ~9 Ko (environ 3,5 Ko gzip). Cookies, pages vues, temps d’engagement, objectifs, liens sortants et étiquetage des liens Dodo
- `src/worker` : application Hono (ingestion, webhooks, API paiements / objectifs, requêtes de stats)
- `src/server` : adaptation D1 → Postgres (Neon) et liaisons d’environnement Node
- `api/index.ts` : fonction Node Vercel qui sert l’API
- `src/dashboard` : tableau de bord React (Vite, Tailwind, Recharts), fichiers statiques
- `migrations-pg/` : schéma Postgres, unique source de vérité

Voir aussi [SECURITY.md](SECURITY.md) et [CONTRIBUTING.md](CONTRIBUTING.md).

## Contribution

Les issues et les pull requests sont les bienvenues. Avant d’ouvrir une PR, lancez `npm run check && npm test`. Détails dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) : libre d’utilisation, de modification et d’auto-hébergement, y compris en usage commercial.

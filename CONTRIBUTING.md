# Contribuer à Minilytics

Merci de votre aide. Ce dépôt se déploie sur **Vercel + Neon**. La branche de développement est `vercel-port` — n’ouvrez pas de pull request vers `main`.

## Prérequis

- Node.js 20+ (24 recommandé)
- Une base Postgres (Neon ou locale) et un fichier `.env.local` (voir `.env.example`)

```bash
npm install
npm run db:migrate:pg
npm test
npm run check
```

Le développement local lance l’API Node sur le port 8787 et le tableau de bord Vite sur le port 5173 : `npm run dev`.

## Règles

- **Schéma :** seules les migrations dans `migrations-pg/` font foi. Ajoutez un fichier numéroté suivant, idempotent côté application (le script enregistre le nom dans `_migrations`). Ne réintroduisez pas de configuration Cloudflare / D1 / Wrangler.
- **Messages utilisateur :** les erreurs renvoyées à l’interface sont en français (constantes dans `src/worker/lib/errors.ts` quand c’est partagé).
- **Secrets :** aucune URL avec mot de passe, aucun jeton, aucun mot de passe admin dans le code, l’historique git, les messages de commit ou la documentation. Utilisez `.env.local`.
- **Tests :** ajoutez ou mettez à jour des tests Vitest pour tout changement d’ingestion, d’auth, d’alertes ou de schéma. Lancez `npm test && npm run check` avant d’ouvrir une PR.
- **Frontend concurrent :** ne mélangez pas dans une PR backend des travaux de perf landing / design tokens / carte-globe s’ils sont menés à part.

## Structure utile

- `src/worker` — application Hono (routes dans `src/worker/routes/`, le reste par domaine)
- `src/server` — Neon / Postgres et liaisons d’environnement
- `api/index.ts` — entrée Vercel
- `src/dashboard` — interface React
- `test/` — tests Vitest (PGlite)

## Licence

En proposant une contribution, vous l’acceptez sous la licence MIT du projet.

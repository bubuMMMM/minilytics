# Déploiement Vercel + Neon

Minilytics tourne comme une fonction Node Vercel (`api/index.ts`) avec Postgres Neon. Le schéma vit uniquement dans `migrations-pg/`.

Les étapes détaillées (variables d’environnement, migrations, domaine, développement local) sont dans le [README](../README.md).

En bref :

1. Importer le dépôt dans Vercel (framework Vite, sortie `dist` ; `vercel.json` gère le routage). Branche : `vercel-port`.
2. Ajouter **Neon** depuis le Marketplace Vercel (définit `DATABASE_URL`).
3. Définir `ADMIN_PASSWORD`, `SESSION_SECRET` et `CRON_SECRET`.
4. Appliquer les migrations : `npm run db:migrate:pg`.
5. Déployer : `npx vercel deploy --prod`.

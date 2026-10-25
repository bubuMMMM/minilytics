# Deploying on Vercel + Neon Postgres

This branch runs the same Hono app as a Vercel Function (`api/index.ts`) with Neon Postgres instead of Cloudflare D1.
`src/server/pgd1.ts` is a tiny D1-compatible wrapper over Postgres, so the worker code is mostly unchanged.

1. Import the repo in Vercel (framework: Vite, output: `dist`; `vercel.json` handles routing).
2. Add **Neon** from the Vercel Marketplace and connect it to the project (sets `DATABASE_URL`).
3. Add env vars `ADMIN_PASSWORD` and `SESSION_SECRET` (`openssl rand -hex 32`).
4. Run migrations once: `DATABASE_URL=... npm run db:migrate:pg` (Postgres versions live in `migrations-pg/`).
5. Deploy. Tracking snippet: `<script defer data-website-id="SITE_ID" src="https://YOUR-APP.vercel.app/js/script.js"></script>`

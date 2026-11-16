# Assessment only — React 19, Vite 8, Tailwind 4

Date: 16 November 2026. Current versions in this repo: React 18.3.1, Vite 6.4.5, Tailwind 3.4.19, recharts 2.15.4, vitest 4.1.12, Hono 4.13.13. This note is an assessment; no upgrades were applied.

## React 19

- **Effort:** about 1–2 days of migration plus a full visual and test pass (landing, demo, dashboard, share, signup, dark/light, 360–1440).
- **Risk:** medium. The app already uses `createRoot` / `hydrateRoot` (compatible). There are no React Server Components or form actions to adopt. The main risk is the ecosystem: recharts 2.15 is a React 18-era library; types (`@types/react` 18) and any `defaultProps` leftovers in dependencies can break the build. `react-dom/server` prerender (`renderToString` + client `hydrateRoot`) needs a hydration check after the bump, especially with `StrictMode`.
- **Recommendation:** stay on React 18 until recharts (or its successor) documents React 19 support and the prerendered public routes have a hydration test in CI. Not a P0.

## Vite 8

- **Effort:** half a day to a day if Vite 8 (or the then-current major) is a straightforward 6 → 7 → 8 hop; more if a plugin (react, legacy Cloudflare, or the SSR prerender script) lags.
- **Risk:** medium-low for a Vite 7 bump (Rolldown/environment API changes are the usual breakages); higher for a brand-new Vite 8 until the plugin ecosystem settles. This project uses a non-default root (`src/dashboard`), `manualChunks`, a post-build prerender (`vite build` + `build({ ssr: 'ssr.tsx' })`), and a proxy to the API. All of those need a clean rebuild and a landing-route size re-measure.
- **Recommendation:** do not jump majors while the audit (prerender, code-splitting, lint) is landing. Revisit after those are stable, preferably one major at a time (6 → 7, then 7 → 8 if 8 is current).

## Tailwind 4

- **Effort:** 1–3 days. Tailwind 4 is a new engine (`@tailwindcss/vite`), CSS-first configuration, and a changed import story (`@import "tailwindcss"` instead of the v3 `@tailwind` directives).
- **Risk:** medium-high. Tokens today live as RGB CSS variables in `styles.css`, wired in `tailwind.config.js` via `rgb(var(--token) / <alpha-value>)`. The v4 theme/`@theme` model can express this, but every custom class (`.btn`, `.card`, `.input`, `.ml-*`) and the dark variant (`.dark` on `<html>`, not `media`) must be re-verified. Going through a config rewrite and then discovering a utility renamed or a variant missing is the usual failure mode. No visual change is expected if the tokens stay identical, but the regression surface is the entire UI.
- **Recommendation:** defer. The token cleanup (this audit) should land on v3 first so v4 only has one source of truth to port.

## Other pins (not requested, noted)

- recharts 2.x is the largest JS cost on dashboard routes (~110 KB gzip). It is already isolated from the landing route. A React 19 upgrade should include a plan for this dependency.
- vitest 4 already works with the current Vite 6. An upgrade of Vite would be the moment to align Vitest.

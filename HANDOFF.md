
## 2026-10-30 — Page Carte gamifiée (frontend)
- Nouvelle vue `/site/:id/map` (onglet « Carte ») + `/demo/map?site=` (public, niveau pays uniquement). Lien « Voir la carte » depuis le globe de l'aperçu et la démo.
- Rendu canvas d3-geo : globe orthographique / plan Natural Earth, drag, pinch, molette, double-clic, boutons zoom, clic pays → zoom + détail (villes, régions). 110m par défaut, 50m chargé au zoom. Chunk lazy `MapPage`.
- Gamification sur données réelles : pays débloqués X/195, niveaux, succès, progression par continent, frise « Conquête », série de jours, brouillard sur pays inexplorés, toast quand un visiteur live vient d'un pays jamais vu.
- API : `GET /api/sites/:id/map`, `/map/live`, `GET /api/public/map`, `/api/public/map/live` (src/worker/map.ts).
- Migration `migrations-pg/0009_geo_coords.sql` (sessions.lat/lon + index) — appliquée en prod le 30/10. Collecte : coordonnées Vercel arrondies à 0,01°.
- Données géo statiques dans `public/maps/` régénérables via `scripts/build-geo.mjs`.

## DEPLOYED bb9f4e6 — 30 Oct 2026 23:25 (Europe/Paris) → https://minilytics-six.vercel.app, frontend agent — Partage + widgets
- e6df45a + bb9f4e6 sur vercel-port (fast-forward depuis ad5a6c0). Migration-pg 0013_share_widgets appliquée au Neon prod (tables share_links, widget_tokens).
- Partage : Réglages → « Tableaux de bord partagés » (+ bouton « Partager » dans l’en-tête du tableau de bord) ; liens multiples nommés ; vues choisies (vue d’ensemble toujours, sources, pages, carte, technologie, objectifs) ; masquer revenus (défaut), villes/régions, URL référentes complètes (défaut) ; profils visiteurs jamais exposés ; mot de passe PBKDF2 (cookie HttpOnly par lien, invalidé au changement de mot de passe ; 10 échecs/15 min par lien en base + 5/min par IP) ; expiration (410) ; noindex ; régénérer / révoquer ; compteur de vues. Page /share/:token[/vue].
- Widgets : Réglages → « Widgets » ; clé par site révocable/régénérable ; types en ligne, compteur, graphique, top pages, carte (grille de points), badge SVG ; options thème, accent, taille, période, fond transparent, FR/EN, logo ; code script (/js/widget.js, hauteur auto) ou iframe, Markdown/HTML pour le badge. Routes /api/widget/:t/{data,embed,badge.svg} : CORS *, cache edge 30–60 s, seules routes encadrables (frame-ancestors *), le reste de l’API garde X-Frame-Options SAMEORIGIN.
- Vérif prod : 1440/390 clair/sombre, page externe sur une autre origine (127.0.0.1:8090) avec 6 widgets + 2 badges OK. Liens et clé de test supprimés après vérif : share_links 0, widget_tokens 0.

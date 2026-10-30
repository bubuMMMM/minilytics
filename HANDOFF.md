
## 2026-10-30 — Page Carte gamifiée (frontend)
- Nouvelle vue `/site/:id/map` (onglet « Carte ») + `/demo/map?site=` (public, niveau pays uniquement). Lien « Voir la carte » depuis le globe de l'aperçu et la démo.
- Rendu canvas d3-geo : globe orthographique / plan Natural Earth, drag, pinch, molette, double-clic, boutons zoom, clic pays → zoom + détail (villes, régions). 110m par défaut, 50m chargé au zoom. Chunk lazy `MapPage`.
- Gamification sur données réelles : pays débloqués X/195, niveaux, succès, progression par continent, frise « Conquête », série de jours, brouillard sur pays inexplorés, toast quand un visiteur live vient d'un pays jamais vu.
- API : `GET /api/sites/:id/map`, `/map/live`, `GET /api/public/map`, `/api/public/map/live` (src/worker/map.ts).
- Migration `migrations-pg/0009_geo_coords.sql` (sessions.lat/lon + index) — appliquée en prod le 30/10. Collecte : coordonnées Vercel arrondies à 0,01°.
- Données géo statiques dans `public/maps/` régénérables via `scripts/build-geo.mjs`.

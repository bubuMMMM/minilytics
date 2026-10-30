
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

## Parité UI (frontend) — en prod depuis e3eddde (31 oct. 2026 00:08, Europe/Paris), commit frontend 9301e7b
- Carte : bouton « Rejouer » (admin seulement) → barre replay 30 min / 24 h, lecture/pause, 1×/2×/4× (la fenêtre entière dure 45 s à 1×), curseur avec repères de visites, heure Europe/Paris ; chaque visite pulse sur la carte au passage du curseur. Onglet « Direct » : flux des 30 dernières minutes (rafraîchi toutes les 15 s, onglet visible) ou, pendant un replay, les visites jusqu'au curseur ; avatar, drapeau, ville/pays, source, page d'entrée, appareil ; clic → zoom sur le lieu. Endpoint `GET /api/sites/:id/replay?window=30m|24h` (src/worker/replay.ts, 2000 visites max, test/replay.test.ts).
- Avatars : visiteurs identifiés (name/email via identify) → initiales sur dégradé + Gravatar (sha256, d=blank) ; anonymes → visages emoji inchangés. VisitorModal, objectifs, flux Direct.
- Cloche (AppHeader) : API backend notifications, sondage 60 s, badge non lues, « Tout marquer comme lu », clic → marque lu + ouvre l'URL ; masquée si l'endpoint renvoie 404 (mémorisé 10 min dans sessionStorage) ; lecteurs : lecture seule.
- Annotations : `useAnnotations()` (ChartNotes.tsx) → commits GitHub ◆ et mentions ◉ en repères sur le graphique, détail dans l'infobulle, puces « Commits et mentions » sous les notes. Jamais en partage public.
- En-tête mobile : wordmark masqué < 640 px quand un titre de site est affiché (Logo compact).

## DEPLOYED bd21a03 — 31 oct. 2026 00:38 (Europe/Paris) → https://minilytics-six.vercel.app, frontend agent — Design v3
- Navigation regroupée (src/dashboard/lib/nav.ts, source unique) : Analyse, Audience, Acquisition, Revenus, Contenu, Outils. Barre latérale fixe ≥ 1024 px (site, recherche ⌘K, groupes, pied Mes sites/Équipe/Démo/thème) ; onglets groupés en tablette ; barre basse + feuille « Plus » groupée en mobile. AccountHeader commun (Sites, Équipe).
- ⌘K : toutes les vues, chaque section de Réglages, périodes, actions (copier le script, créer un lien de partage, thème), pages générales.
- Réglages en sous-pages `/site/:id/settings/:section` (installation, general, script, revenus, partage, widgets, alertes, integrations, api, donnees, offre) avec sous-nav à gauche (puces en mobile). Anciennes URL `/settings` et `/settings#partage|widgets|alertes` toujours valides. Ancres `#engagement` et `#objectifs` sur l’aperçu.
- Composants partagés src/dashboard/components/ui.tsx : PageHeader, SectionHeader, Card, Badge (casse normale), EmptyState, Skeleton, Segmented, Tabs. Transitions ≤ 200 ms, focus-visible accent, prefers-reduced-motion global.
- Landing : nouveau hero + section de 4 captures réelles (carte, Bots IA, partage, widgets) clair/sombre dans public/landing/*.webp (≈30 Ko chacune ; carte en vue publique niveau pays).
- Corrigé : débordement horizontal Bots IA à 390 px. Audit complet : /workspace/minilytics-team/DESIGN_AUDIT.md.
- Vérif prod : 24 pages × 1440/390 × clair/sombre, 0 erreur console, 0 débordement ; share_links 0, widget_tokens 0 après vérif.

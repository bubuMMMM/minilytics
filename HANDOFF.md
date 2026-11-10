
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

## DEPLOYED 18afb7e — 31 oct. 2026 00:49 (Europe/Paris), frontend agent — Design v3 finitions
- `CodeBlock` (components/ui.tsx) : barre d’outils avec langue + « Copier » au-dessus du code (plus de chevauchement sur mobile). Utilisé dans Réglages, Widgets et API docs (curl, MCP, CLI copiables).
- /api-docs : bouton « Envoyer la requête » toujours actif ; sans jeton → champ en erreur + aide (Réglages › API) et focus. Liste des points d’accès collante sur grand écran, en-tête collant + thème + PageHeader.
- Mes sites : carte « Connecter un site » en double supprimée (le bouton « Ajouter un site » reste, et l’état vide pour 0 site).
- Graphique Bots IA : catégories en lignes pleines (option `peers` de TrendChart) ; pointillés réservés aux comparaisons. Kickers en accent, espacement 40 px entre grandes sections de l’aperçu.
- Vérif prod : 23 pages × 1440/390 × clair/sombre, 0 erreur console, 0 débordement ; share_links 0, widget_tokens 0.

## DEPLOYED 2685847 — 7 nov. 2026 (Europe/Paris) → https://minilytics-six.vercel.app — Liste d'attente, 404, partage social
- /signup n'est plus une impasse : formulaire liste d'attente (src/dashboard/pages/Signup.tsx), offre présélectionnée via `?plan=starter|growth` (boutons Tarifs), domaine facultatif, source (utm_source/ref/référent) enregistrée, objectif `liste_attente` envoyé au tracker. Écran de confirmation → démo.
- API (src/worker/waitlist.ts) : `POST /api/public/waitlist` (même origine, honeypot `company`, 5 envois valides / 10 min par IP, doublon accepté sans le dire) ; propriétaire seul : `GET /api/waitlist`, `GET /api/waitlist.csv` (anti-injection de formules), `DELETE /api/waitlist/:id`. Table créée au premier appel (CREATE TABLE IF NOT EXISTS) ; aussi dans migrations/0013 et migrations-pg/0014. Tests : test/waitlist.test.ts.
- Mes sites (propriétaire) : carte « Liste d'attente » (total, cette semaine, par offre, 5 derniers + tout afficher, retrait, export CSV).
- CTA landing : « Commencer gratuitement » → « Réserver mon accès » ; « 0,00 € aujourd'hui » → « Liste d'attente gratuite » ; FAQ « Dois-je payer » et sous-titre Tarifs mis à jour.
- URL publiques inconnues → page 404 (noindex) au lieu du mur de connexion (`isAppPath` dans App.tsx).
- SEO/partage : Open Graph + carte X (`summary_large_image`, public/og.png 1200×630), canonical, JSON-LD SoftwareApplication (offres 9/19 €), apple-touch-icon, `<noscript>`, public/robots.txt (dashboard/API/partages exclus) et public/sitemap.xml.
- Dev : le proxy Vite transmet `x-forwarded-host`, les écritures (POST) passent le contrôle CSRF en local.
- Vérif : 166 tests, typecheck, build ; signup/404/Mes sites en 1440/390 clair/sombre, 0 débordement ; prod : robots.txt, balises OG sur /signup, /api/waitlist → 401 sans session.
- À faire : brancher un e-mail de bienvenue (Resend est déjà là pour les rapports) ; passer le canonical/og:url sur le domaine final quand il existe.

## DEPLOYED b13a74c + f01724f — 10 nov. 2026 21:54 (Europe/Paris) → https://minilytics-six.vercel.app, frontend agent — Carte live, widgets, page publique
- Carte « Direct » : cartes visiteurs façon DataFast (panneau droit / feuille mobile). Identité générée stable (nom + avatar, hash du visitor id, aucune donnée perso). Drapeau, ville/pays, source + favicon, page courante, pages vues, durée (tic en direct si actif), heure d’arrivée, badge objectif / revenu seulement si réel. Clic → zoom + surbrillance du point ; survol d’un point → mini-carte. Apparition / disparition animées (≤ 200 ms, reduced-motion respecté). Compteur en ligne. Flux « En ligne » (5 min) ou « 30 min ». Replay 24 h réutilise les mêmes cartes. Nouvel endpoint `GET /api/sites/:id/live-visitors` (admin). Jamais d’IP ni de nom/e-mail dans ce flux.
- Widgets : 6 styles distincts (`classic` par défaut, rétrocompatible ; `minimal`, `editorial`, `glass`, `gradient`, `compact`), thème, accent, taille. Aperçu en direct. Choix persisté (URL `style=` + localStorage du constructeur). `widget.js` transmet `data-style`.
- Page publique `/u/:slug` (propriétaire uniquement) : titre, bio, avatar/couverture https validés, liens sociaux validés, thème/mise en page, widgets à choisir et réordonner (chiffres agrégés, jamais de revenus). Publication explicite. Copier le lien, Web Share, intents X et LinkedIn (jamais d’envoi automatique). Méta OG/Twitter + image OG SVG. Dépublier → 404 anonyme (vérifié). Réécriture Vercel `/u/:slug` → fonction API (f01724f) pour le 404 HTTP et les balises. Éditeur : `/page`.
- Migration-pg `0015_profile_pages` appliquée au Neon prod (table `profile_pages`). 0014_waitlist était encore absente de `_migrations` : `CREATE TABLE IF NOT EXISTS`, déjà en prod.
- Vérif prod : 0 erreur console sur les captures 1440/390 clair/sombre ; révocation 404 ; share_links 0, widget_tokens 0, profile_pages 0 après vérif. Tests 172/172.
- Captures : /workspace/minilytics-shots/live-widgets/ et …/prod/

## DEPLOYED 2b839e4 (7855d50 + 70ba3c4) — 10 nov. 2026 22:22 (Europe/Paris) → https://minilytics-six.vercel.app, frontend agent — OG PNG, parcours, clustering
- Image Open Graph PNG 1200×630 pour `/u/:slug` (`/api/public/page/:slug/og.png`) et les liens de partage (`/api/share/:token/og.png`), générée avec satori + resvg et Inter (latin) inclus. Les métas `og:image` / Twitter pointent vers l’URL absolue, avec largeur, hauteur et `og:image:type=image/png`. Le SVG reste en repli. `/share/:token` passe par la fonction API pour injecter les balises (sans incrémenter le compteur de vues). Vérifié en prod : `content-type: image/png`, dimensions 1200×630, magic PNG, métas correctes.
- Dépublier / révoquer est immédiat : plus de cache CDN sur le HTML et l’image (sinon un lien dépublié restait 200 jusqu’à 5 min). `DELETE /api/me/page` supprime complètement la page. Vérifié : HTML, PNG page et PNG/HTML partage → 404 tout de suite après révocation.
- Parcours visiteur (admin) : au clic sur une carte, panneau « Parcours de la visite » (pages dans l’ordre, heures, durées, source, entrée/sortie). `GET /api/sites/:id/sessions/:sid/journey`, données réelles, sans nom / e-mail / IP. Le point est mis en avant et la carte zoome dessus ; pastille « N p. » sur le marqueur s’il y a plusieurs pages.
- Regroupement des marqueurs proches (bulle avec l’effectif, clic pour zoomer et séparer). Un visiteur sélectionné reste hors du groupe. Infobulle « N visiteurs ici ». Les visites de l’onglet « 30 min » apparaissent aussi sur la carte (pulsation seulement si encore en ligne).
- Correctifs : infobulles de la carte rester dans l’écran (1440 et 390) ; bouton Rejouer au-dessus de la feuille mobile ; pied de page visible sur l’image OG.
- Vérif prod 1440/390 clair/sombre : 0 erreur console, 0 débordement. Après nettoyage : profile_pages 0, share_links 0 (un jeton widget déjà présent n’a pas été touché). Tests 177/177.
- Captures : /workspace/minilytics-shots/batch-og-journey/

## DEPLOYED 84a0f2c — 10 nov. 2026 22:49 (Europe/Paris) → https://minilytics-six.vercel.app, frontend agent — Widgets sur le téléphone
- Demande owner t32u : télécharger / installer un ou plusieurs widgets sur son téléphone.
- PWA : `manifest.webmanifest` (start_url `/sites`), icônes 192/512 + maskable, `sw.js` (cache uniquement des assets statiques ; jamais `/api/` ni `/w/`), métas iOS / theme-color clair-sombre, enregistrement du service worker en HTTPS.
- Réglages → « Widgets sur mon téléphone » (`/site/:id/settings/telephone`) : choisir un ou plusieurs widgets (styles existants, thème, période, accent), aperçu empilé, créer un écran, instructions iOS/Android (détection de plateforme), téléchargement PNG / ZIP, script Scriptable + URL d’image pour Photo Widget / KWGT, liste et révocation. Lien depuis le constructeur de widgets.
- Chaque sélection a un jeton lecture seule `wp…`, table `widget_boards` (migration-pg 0016, appliquée au Neon prod), indépendant des jetons d’embed `widget_tokens`. Six widgets max par écran, 20 écrans par site. Pas de revenus (types revenue/badge refusés). Révoquer coupe les données tout de suite (cache `s-maxage=0` / `private, no-store`, 404 vérifié en prod).
- Page publique installable `/w/:token` (réécriture Vercel vers l’API) : widgets empilés plein écran, rafraîchissement 30 s, manifeste propre (`start_url` / `scope` du jeton), consignes d’ajout à l’écran d’accueil. PNG serveur (satori + resvg, vraies données) : petit 474×474, moyen 1014×474, grand 1014×1062, fond d’écran 1170×2532, pile, plus ZIP. Aussi `GET /api/widget/:t/png` via le jeton d’embed existant.
- Limites : iOS n’offre pas de vrai widget d’écran d’accueil tiers sans Scriptable ; Android = PWA « Ajouter à l’écran d’accueil » ou appli Photo Widget/KWGT avec l’URL du PNG. Les widgets expérimentaux du manifeste (Adaptive Cards) n’ont pas été activés (peu disponibles, risque élevé). Lighthouse 13 n’a plus de catégorie PWA ; critères d’installabilité vérifiés à la main (manifeste, SW, icônes, métas, HTTPS).
- Vérif prod 1440/390 clair/sombre : 0 erreur console, 0 débordement. Écran de test créé sur le site démo puis révoqué ; n0.pub non modifié. Après nettoyage : widget_boards 0 (le jeton widget déjà présent n’a pas été touché). Tests 184/184, typecheck, build.
- Captures (y compris les PNG téléchargés) : /workspace/minilytics-shots/phone-widgets/

## DEPLOYED a41b6b2 (51d341b + a41b6b2) — 11 nov. 2026 00:09 (Europe/Paris) → https://minilytics-six.vercel.app, frontend agent — Expérience mobile
- Demande owner t33u : optimiser le site en version mobile, améliorer l’UI/UX. Branche `vercel-port` uniquement.
- Audit 360 / 390 / 430 px, clair et sombre, sur l’accueil et les tarifs, la connexion, Mes sites, l’aperçu et tous les panneaux d’analyse, la carte (feuille visiteurs), le temps réel, les réglages / widgets / téléphone, `/page`, `/api-docs`, les objectifs, le replay, plus un lien `/share/:token` et un écran `/w/:token` temporaires.
- Problèmes corrigés :
  - débordement de l’en-tête « Mes sites » à 360 px (trop d’icônes) → logo compact + menu Compte en feuille ;
  - pas de sélecteur de site sur téléphone → `SiteSwitcher` dans l’en-tête collant ; le bouton Direct redondant est retiré de l’en-tête (il reste dans la barre basse) ;
  - menus (période, filtres, site, compte) en feuille depuis le bas sur ≤ 767 px ; le menu commande aussi ; le bureau garde les popovers ;
  - cibles tactiles portées à 44 px (boutons, onglets, puces, carte, démo, accueil, copie de code, listes) ; champs texte à 16 px pour éviter le zoom iOS ;
  - tableaux de détail en cartes empilées sous `sm` ; infobulles des graphiques conservées au doigt ; feuille carte au-dessus de la barre d’onglets, avec safe-area ;
  - correctif de cascade CSS : les boutons d’aide (InfoTip) et les sélecteurs segmentés de `/page` font bien 44 px (a41b6b2).
- Bureau : barre latérale et popovers inchangés (vérifié à 1440 px, 0 débordement).
- Vérif prod 360/390/430 clair (+ sombre sur les pages clés) : 0 erreur console, 0 débordement. Lien et écran de test créés sur le site démo puis révoqués ; n0.pub non modifié. Tests 184/184, typecheck, build.
- Captures avant/après : /workspace/minilytics-shots/mobile-ux/

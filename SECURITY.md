# Sécurité

## Signalement

Si vous découvrez une faille, signalez-la **en privé** au mainteneur du dépôt. N’ouvrez pas d’issue publique qui détaillerait un exploit, et n’y joignez jamais de secrets (mots de passe, clés API, URL de base avec mot de passe, dumps).

## Principes

- Les secrets (`ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`, `CRON_SECRET`, jetons prestataires) vivent dans les variables d’environnement Vercel ou dans un `.env.local` gitignoré. Ils ne doivent pas figurer dans le dépôt, les tickets, ni les documents de contribution.
- L’ingestion (`POST /api/event`) n’accepte un événement que si l’origine / le site correspondent à un site enregistré. Cela empêche un tiers d’injecter des événements avec un `u` forgé depuis un navigateur ; un client qui contrôle aussi l’en-tête Origin (par exemple curl) peut encore forger les deux.
- Les cookies de session sont `HttpOnly`, `SameSite=Strict`, et `Secure` hors localhost. Les routes authentifiées par cookie refusent les écritures cross-site (`csrfGuard`).
- La connexion est limitée en débit (fenêtre fixe en base) et verrouillée après trop d’échecs. L’ingestion est également limitée par adresse IP.
- Les membres en lecture seule ne peuvent pas modifier les sites côté serveur. Les clés API de site (`ml_…`) permettent d’écrire des paiements et des objectifs : elles ne sont jamais renvoyées aux comptes « viewer ».
- Les URL collectées sont nettoyées (identifiants, fragments, paramètres sensibles). Ce n’est pas une garantie contre des données personnelles placées dans un chemin ou un paramètre personnalisé.
- Les webhooks (Dodo et autres) sont vérifiés par signature. Les crons Vercel exigent `Authorization: Bearer $CRON_SECRET`.

## Déploiement

- N’appliquez `npm run seed` / `.data/seed.sql` qu’à une base locale ou de développement, jamais à la production.
- Tournez `SESSION_SECRET` invalide toutes les sessions existantes. Un mot de passe admin compromis doit être changé et les autres sessions révoquées depuis le tableau de bord.
- Conservez Neon et Vercel sur des comptes dont l’accès à deux facteurs est activé.

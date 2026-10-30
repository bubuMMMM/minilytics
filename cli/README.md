# minilytics-cli

Vos statistiques Minilytics dans le terminal (Node ≥ 18, aucune dépendance).

```sh
npx minilytics-cli login --host https://minilytics-six.vercel.app --token mlt_…   # jeton : Réglages → API
minilytics sites
minilytics use <site_id>
minilytics stats --period 7d
minilytics pages --limit 10
minilytics sources --json
minilytics realtime
minilytics mcp-config      # pour Claude, Cursor, ChatGPT…
```

Le jeton est stocké dans `~/.config/minilytics/config.json` (droits 600), ou passé par `MINILYTICS_TOKEN`.

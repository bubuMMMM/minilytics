/** Copy-paste forwarders for AI bot hits (bots don't run JavaScript, so the site's server reports them). */
export const AI_UA_RE_SOURCE =
  'GPTBot|ChatGPT-User|OAI-SearchBot|Claude(Bot|-User|-SearchBot|-Web)|anthropic-ai|Perplexity(Bot|-User)|Bytespider|TikTokSpider|CCBot|meta-external(agent|fetcher)|FacebookBot|Amazonbot|DuckAssistBot|MistralAI-User|Applebot|cohere-ai|YouBot|Diffbot|AI2Bot|Google-CloudVertexBot|Timpibot|ImagesiftBot|omgili';

export type SnippetKey = 'next' | 'express' | 'cloudflare' | 'vercel' | 'nginx' | 'curl';
export const SNIPPET_TABS: [SnippetKey, string][] = [['next', 'Next.js'], ['express', 'Node / Express'], ['cloudflare', 'Cloudflare'], ['vercel', 'Vercel (Drains)'], ['nginx', 'Nginx / Apache'], ['curl', 'Tester']];

export function snippet(k: SnippetKey, endpoint: string, token: string): string {
  switch (k) {
    case 'next':
      return `// proxy.ts (Next.js 16) — ou middleware.ts (Next.js 13–15, renommez la fonction en \`middleware\`)
// Variable d’environnement : MINILYTICS_BOT_TOKEN=${token}
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

const AI_BOTS = /${AI_UA_RE_SOURCE}/i;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const ua = request.headers.get('user-agent') ?? '';
  const sig = request.headers.get('signature-agent');
  if (AI_BOTS.test(ua) || sig?.includes('chatgpt.com')) {
    // Envoyé après la réponse : aucune latence ajoutée pour le robot.
    event.waitUntil(
      fetch('${endpoint}', {
        method: 'POST',
        headers: { Authorization: \`Bearer \${process.env.MINILYTICS_BOT_TOKEN}\`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ua, path: request.nextUrl.pathname, ts: Date.now(), country: request.headers.get('x-vercel-ip-country'), signature_agent: sig }),
      }).catch(() => {}),
    );
  }
  return NextResponse.next();
}

// Toutes les pages (robots.txt et sitemap.xml compris), sans les fichiers statiques de Next.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|woff2?|map)$).*)'] };`;
    case 'express':
      return `// Node.js / Express (Node 18+ pour fetch). MINILYTICS_BOT_TOKEN=${token}
const AI_BOTS = /${AI_UA_RE_SOURCE}/i;

app.use((req, res, next) => {
  const ua = req.get('user-agent') || '';
  if (AI_BOTS.test(ua)) {
    res.on('finish', () => {
      fetch('${endpoint}', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.MINILYTICS_BOT_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ua, path: req.path, status: res.statusCode, ts: Date.now() }),
      }).catch(() => {});
    });
  }
  next();
});`;
    case 'cloudflare':
      return `// Cloudflare Worker placé devant votre site (route example.com/*). Secret : MINILYTICS_BOT_TOKEN=${token}
const AI_BOTS = /${AI_UA_RE_SOURCE}/i;

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const ua = request.headers.get('user-agent') || '';
    if (AI_BOTS.test(ua)) {
      ctx.waitUntil(fetch('${endpoint}', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.MINILYTICS_BOT_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ua, path: new URL(request.url).pathname, status: response.status, country: request.cf?.country, ts: Date.now() }),
      }));
    }
    return response;
  },
};`;
    case 'vercel':
      return `Vercel → Team Settings → Drains → Add Drain → Logs
  Sources        : Edge (requêtes des pages) — Static et Functions si vous le souhaitez
  Format         : JSON ou NDJSON
  URL            : ${endpoint}?token=${token}

Minilytics lit proxy.userAgent / proxy.path / proxy.statusCode de chaque ligne,
garde uniquement les robots d’IA et ignore le reste. Les Drains Vercel sont une
option payante (offre Pro) ; sans eux, utilisez l’onglet Next.js.`;
    case 'nginx':
      return `# Format de journal « combined » (par défaut). Nécessite curl et jq.
tail -F /var/log/nginx/access.log \\
 | grep --line-buffered -iE '${AI_UA_RE_SOURCE}' \\
 | while IFS= read -r line; do
     ua=$(printf '%s' "$line" | awk -F'"' '{print $6}')
     path=$(printf '%s' "$line" | awk '{print $7}')
     status=$(printf '%s' "$line" | awk '{print $9}')
     jq -nc --arg ua "$ua" --arg path "$path" --arg status "$status" '{ua:$ua, path:$path, status:($status|tonumber? // null)}' \\
       | curl -s -X POST '${endpoint}' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' --data-binary @- >/dev/null
   done
# Apache : même commande sur /var/log/apache2/access.log (format combined).`;
    case 'curl':
      return `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer ${token}' \\
  -H 'Content-Type: application/json' \\
  -d '{"ua":"Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)","path":"/test-minilytics"}'
# Réponse attendue : {"stored":1,"ignored":0,"overQuota":0}
# Pensez à ne pas laisser de faux trafic : ce test compte comme une vraie requête de bot.`;
  }
}

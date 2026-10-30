// Shared by the worker (to classify traffic) and the dashboard (to show icons).

export type Channel =
  | 'Direct'
  | 'Organic Search'
  | 'Organic Social'
  | 'AI'
  | 'Referral'
  | 'Email'
  | 'Paid';

interface KnownSource {
  name: string;
  domain: string; // used for the favicon
  channel: Channel;
  match: RegExp; // tested against referrer hostname, utm_source and ref
}

export const KNOWN_SOURCES: KnownSource[] = [
  { name: 'X', domain: 'x.com', channel: 'Organic Social', match: /^(t\.co|(.*\.)?(x|twitter)\.com|x|twitter|tw)$/ },
  { name: 'Google', domain: 'google.com', channel: 'Organic Search', match: /^((www\.)?google\.[a-z.]+|google)$/ },
  { name: 'Bing', domain: 'bing.com', channel: 'Organic Search', match: /^((.*\.)?bing\.com|bing)$/ },
  { name: 'DuckDuckGo', domain: 'duckduckgo.com', channel: 'Organic Search', match: /^((.*\.)?duckduckgo\.com|duckduckgo|ddg)$/ },
  { name: 'Yahoo', domain: 'yahoo.com', channel: 'Organic Search', match: /^((.*\.)?yahoo\.[a-z.]+|yahoo)$/ },
  { name: 'Yandex', domain: 'yandex.com', channel: 'Organic Search', match: /^((.*\.)?yandex\.[a-z.]+|yandex)$/ },
  { name: 'Baidu', domain: 'baidu.com', channel: 'Organic Search', match: /^((.*\.)?baidu\.com|baidu)$/ },
  { name: 'Ecosia', domain: 'ecosia.org', channel: 'Organic Search', match: /^((.*\.)?ecosia\.org|ecosia)$/ },
  { name: 'Brave Search', domain: 'search.brave.com', channel: 'Organic Search', match: /^(search\.brave\.com)$/ },
  { name: 'ChatGPT', domain: 'chatgpt.com', channel: 'AI', match: /^((.*\.)?(chatgpt\.com|openai\.com)|chatgpt|chatgpt\.com|openai)$/ },
  { name: 'Claude', domain: 'claude.ai', channel: 'AI', match: /^((.*\.)?claude\.ai|claude)$/ },
  { name: 'Perplexity', domain: 'perplexity.ai', channel: 'AI', match: /^((.*\.)?perplexity\.ai|perplexity)$/ },
  { name: 'Gemini', domain: 'gemini.google.com', channel: 'AI', match: /^(gemini\.google\.com|gemini|bard\.google\.com)$/ },
  { name: 'Copilot', domain: 'copilot.microsoft.com', channel: 'AI', match: /^(copilot\.microsoft\.com|copilot)$/ },
  { name: 'DeepSeek', domain: 'deepseek.com', channel: 'AI', match: /^((.*\.)?deepseek\.com|deepseek)$/ },
  { name: 'Grok', domain: 'grok.com', channel: 'AI', match: /^((.*\.)?grok\.com|grok)$/ },
  { name: 'YouTube', domain: 'youtube.com', channel: 'Organic Social', match: /^((.*\.)?(youtube\.com|youtu\.be)|youtube|yt)$/ },
  { name: 'LinkedIn', domain: 'linkedin.com', channel: 'Organic Social', match: /^((.*\.)?(linkedin\.com|lnkd\.in)|linkedin)$/ },
  { name: 'Reddit', domain: 'reddit.com', channel: 'Organic Social', match: /^((.*\.)?reddit\.com|reddit)$/ },
  { name: 'Facebook', domain: 'facebook.com', channel: 'Organic Social', match: /^((.*\.)?(facebook\.com|fb\.com|fb\.me)|facebook|fb)$/ },
  { name: 'Instagram', domain: 'instagram.com', channel: 'Organic Social', match: /^((.*\.)?instagram\.com|instagram|ig)$/ },
  { name: 'Threads', domain: 'threads.net', channel: 'Organic Social', match: /^((.*\.)?threads\.(net|com)|threads)$/ },
  { name: 'TikTok', domain: 'tiktok.com', channel: 'Organic Social', match: /^((.*\.)?tiktok\.com|tiktok)$/ },
  { name: 'Pinterest', domain: 'pinterest.com', channel: 'Organic Social', match: /^((.*\.)?pinterest\.[a-z.]+|pinterest)$/ },
  { name: 'Bluesky', domain: 'bsky.app', channel: 'Organic Social', match: /^((.*\.)?bsky\.app|bluesky|bsky)$/ },
  { name: 'Mastodon', domain: 'mastodon.social', channel: 'Organic Social', match: /^((.*\.)?mastodon\.[a-z.]+|mastodon)$/ },
  { name: 'Hacker News', domain: 'news.ycombinator.com', channel: 'Organic Social', match: /^(news\.ycombinator\.com|hackernews|hn)$/ },
  { name: 'Product Hunt', domain: 'producthunt.com', channel: 'Referral', match: /^((.*\.)?producthunt\.com|producthunt|ph)$/ },
  { name: 'Medium', domain: 'medium.com', channel: 'Referral', match: /^((.*\.)?medium\.com|medium)$/ },
  { name: 'Substack', domain: 'substack.com', channel: 'Referral', match: /^((.*\.)?substack\.com|substack)$/ },
  { name: 'Dev.to', domain: 'dev.to', channel: 'Referral', match: /^(dev\.to|devto)$/ },
  { name: 'Indie Hackers', domain: 'indiehackers.com', channel: 'Referral', match: /^((.*\.)?indiehackers\.com|indiehackers)$/ },
  { name: 'GitHub', domain: 'github.com', channel: 'Referral', match: /^((.*\.)?github\.com|github)$/ },
  { name: 'WhatsApp', domain: 'whatsapp.com', channel: 'Organic Social', match: /^((.*\.)?(whatsapp\.com|wa\.me)|whatsapp|wa)$/ },
  { name: 'Telegram', domain: 'telegram.org', channel: 'Organic Social', match: /^((.*\.)?(telegram\.org|t\.me)|telegram)$/ },
  { name: 'Discord', domain: 'discord.com', channel: 'Organic Social', match: /^((.*\.)?discord\.(com|gg)|discord)$/ },
  { name: 'Snapchat', domain: 'snapchat.com', channel: 'Organic Social', match: /^((.*\.)?snapchat\.com|snapchat|snap)$/ },
  { name: 'Gmail', domain: 'mail.google.com', channel: 'Email', match: /^(mail\.google\.com|gmail)$/ },
  { name: 'Outlook', domain: 'outlook.com', channel: 'Email', match: /^((.*\.)?(outlook\.(com|live\.com)|outlook\.office\.com))$/ },
  { name: 'Newsletter', domain: '', channel: 'Email', match: /^(newsletter|email|mail)$/ },
];

const PAID_MEDIUM = /^(cpc|ppc|cpm|paid|paid[_-]?social|paidsearch|ads?|display|retargeting|sponsored)$/i;
const EMAIL_MEDIUM = /^(e-?mail|newsletter)$/i;
const SOCIAL_MEDIUM = /^(social|social[_-]?media|sm)$/i;

export function findKnownSource(key: string | null | undefined): KnownSource | undefined {
  if (!key) return undefined;
  const k = key.toLowerCase().trim();
  return KNOWN_SOURCES.find((s) => s.match.test(k));
}

export function domainForSource(name: string): string | undefined {
  return KNOWN_SOURCES.find((s) => s.name === name)?.domain || undefined;
}

export interface Attribution {
  source: string;
  channel: Channel;
  referrerDomain: string | null;
}

/**
 * Decide where a visit came from. An explicit `ref` / `utm_source` wins over the HTTP referrer,
 * because that's how you tag a specific tweet or article ("?ref=launch-tweet").
 */
const ANDROID_APPS: Record<string, string> = {
  'com.google.android.gm': 'mail.google.com',
  'com.google.android.googlequicksearchbox': 'google.com',
  'com.google.android.apps.searchlite': 'google.com',
  'com.google.android.youtube': 'youtube.com',
  'com.twitter.android': 'x.com',
  'com.instagram.android': 'instagram.com',
  'com.facebook.katana': 'facebook.com',
  'com.facebook.lite': 'facebook.com',
  'com.facebook.orca': 'facebook.com',
  'com.zhiliaoapp.musically': 'tiktok.com',
  'com.ss.android.ugc.trill': 'tiktok.com',
  'com.reddit.frontpage': 'reddit.com',
  'com.linkedin.android': 'linkedin.com',
  'com.pinterest': 'pinterest.com',
  'com.instagram.barcelona': 'threads.net',
  'xyz.blueskyweb.app': 'bsky.app',
  'com.microsoft.office.outlook': 'outlook.com',
  'org.telegram.messenger': 'telegram.org',
  'com.whatsapp': 'whatsapp.com',
  'com.discord': 'discord.com',
  'com.snapchat.android': 'snapchat.com',
};
/** Map an Android package (android-app:// referrer) to the web domain of that app. */
export function androidAppDomain(pkg: string): string {
  return ANDROID_APPS[pkg.toLowerCase()] ?? pkg.toLowerCase();
}

/** In-app browsers (parsed from the user agent) usually strip the referrer: they still tell us the source. */
const IN_APP: Record<string, string> = { Instagram: 'instagram.com', Facebook: 'facebook.com', Twitter: 'x.com', TikTok: 'tiktok.com', LinkedIn: 'linkedin.com', Threads: 'threads.net', Snapchat: 'snapchat.com' };

export function classify(input: {
  referrerDomain: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  ref?: string | null;
  inAppBrowser?: string | null;
}): Attribution {
  const { utmSource, utmMedium, ref } = input;
  let referrerDomain = input.referrerDomain;
  if (!referrerDomain && input.inAppBrowser && IN_APP[input.inAppBrowser]) referrerDomain = IN_APP[input.inAppBrowser];
  const tag = utmSource || ref || null;
  const knownTag = findKnownSource(tag);
  const knownRef = findKnownSource(referrerDomain);
  const known = knownTag ?? (tag ? undefined : knownRef);

  // An explicit tag names the source, even an unknown one ("?utm_source=launch-tweet" from t.co).
  let source: string;
  if (knownTag) source = knownTag.name;
  else if (tag) source = tag;
  else if (knownRef) source = knownRef.name;
  else if (referrerDomain) source = referrerDomain;
  else source = 'Direct';

  // The channel still follows the platform the click came through when the tag is unknown.
  let channel: Channel;
  if (utmMedium && PAID_MEDIUM.test(utmMedium)) channel = 'Paid';
  else if (utmMedium && EMAIL_MEDIUM.test(utmMedium)) channel = 'Email';
  else if (known) channel = known.channel;
  else if (utmMedium && SOCIAL_MEDIUM.test(utmMedium)) channel = 'Organic Social';
  else if (knownRef) channel = knownRef.channel;
  else if (tag || referrerDomain) channel = 'Referral';
  else channel = 'Direct';

  return { source, channel, referrerDomain };
}

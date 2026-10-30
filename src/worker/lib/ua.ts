export interface ParsedUA {
  browser: string;
  os: string;
  device: 'Desktop' | 'Mobile' | 'Tablet';
}

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|httpclient|vercel|chatgpt-user|gptbot|claudebot|perplexity|bytespider|ahrefs|semrush|mj12|dotbot/i;

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
}

// Order matters: in-app browsers and Chromium forks before Chrome, Chrome before Safari.
const BROWSERS: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Twitter/i, 'Twitter'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Threads/i, 'Threads'],
  [/TikTok|musical_ly|Bytedance/i, 'TikTok'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/YaBrowser/, 'Yandex'],
  [/Vivaldi/, 'Vivaldi'],
  [/Brave/, 'Brave'],
  [/DuckDuckGo/, 'DuckDuckGo'],
  [/Arc\//, 'Arc'],
  [/Firefox|FxiOS/, 'Firefox'],
  [/; wv\)/, 'Chrome WebView'],
  [/Chrome|CriOS/, 'Chrome'],
  [/Mobile\/\w+ Safari|Version\/[\d.]+ Mobile/, 'Mobile Safari'],
  [/Safari/, 'Safari'],
  [/AppleWebKit/, 'WebKit'],
];

const OSES: [RegExp, string][] = [
  [/iPhone|iPod/, 'iOS'],
  [/iPad/, 'iPadOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'Chrome OS'],
  [/Mac OS X|Macintosh/, 'Mac OS'],
  [/Linux/, 'Linux'],
];

export function parseUA(ua: string, screenWidth?: number): ParsedUA {
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? 'Other';
  const os = OSES.find(([re]) => re.test(ua))?.[1] ?? 'Other';
  let device: ParsedUA['device'] = 'Desktop';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'Mobile';
  if (device === 'Desktop' && screenWidth && screenWidth < 600) device = 'Mobile';
  return { browser, os, device };
}

export interface UADetails {
  browserVersion: string | null;
  osVersion: string | null;
  model: string | null;
}

/** Major browser version, OS version and device model. UA client hints (`ch`) win when present. */
export function uaDetails(ua: string, ch?: { m?: unknown; pv?: unknown; bv?: unknown } | null): UADetails {
  const str = (v: unknown, n: number) => (typeof v === 'string' && /^[\w .()+-]{1,60}$/.test(v) ? v.trim().slice(0, n) || null : null);
  const bvMatch =
    /(?:Edg(?:A|iOS)?|OPR|SamsungBrowser|YaBrowser|Firefox|FxiOS|CriOS|Chrome|Instagram|FBAV)\/(\d+)/.exec(ua) ?? /Version\/(\d+)/.exec(ua);
  let osVersion: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /(?:iPhone|CPU) OS (\d+)[_.](\d+)/.exec(ua))) osVersion = `${m[1]}.${m[2]}`;
  else if ((m = /Android (\d+(?:\.\d+)?)/.exec(ua))) osVersion = m[1];
  else if ((m = /Mac OS X (\d+)[_.](\d+)/.exec(ua))) osVersion = `${m[1]}.${m[2]}`;
  else if ((m = /Windows NT (\d+\.\d+)/.exec(ua))) osVersion = m[1];
  let model: string | null = null;
  if (/iPhone/.test(ua)) model = 'iPhone';
  else if (/iPad/.test(ua)) model = 'iPad';
  else if ((m = /Android [\d.]+; (?:[a-z]{2}-[a-z]{2}; )?([^;)]+?)(?: Build\/|\))/i.exec(ua)) && !/^K$/.test(m[1])) model = m[1].trim();
  const chModel = str(ch?.m, 40);
  const chPv = str(ch?.pv, 20);
  const chBv = str(ch?.bv, 10);
  return {
    browserVersion: chBv ?? bvMatch?.[1] ?? null,
    // Windows 11 reports platformVersion ≥ 13 through client hints only.
    osVersion: chPv ?? osVersion,
    model: (chModel ?? model)?.slice(0, 40) ?? null,
  };
}

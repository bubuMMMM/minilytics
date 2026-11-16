import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const LOCAL_CHROME = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const MAX_HEIGHT = 16_000;

export interface PageShot {
  png: Buffer;
  width: number;
  height: number;
}

/** Full-page screenshot at a fixed CSS viewport width. Local Chrome when present, serverless Chromium on Vercel. */
export async function capturePage(url: string, viewportWidth: number): Promise<PageShot> {
  const local = LOCAL_CHROME.find((p) => existsSync(p));
  const viewport = { width: viewportWidth, height: viewportWidth < 768 ? 844 : 900, deviceScaleFactor: 1 as const };
  const browser = local
    ? await puppeteer.launch({
        executablePath: local,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--use-gl=swiftshader'],
      })
    : await launchServerless();
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setUserAgent(
      viewportWidth < 768
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
    page.setDefaultNavigationTimeout(25_000);
    const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 25_000 });
    if (res && res.status() >= 400) throw new Error(`La page a répondu ${res.status()}`);
    await new Promise((r) => setTimeout(r, 600));
    const box = await page.evaluate(() => ({
      w: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth),
      h: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight),
    }));
    if (box.h > MAX_HEIGHT) {
      await page.setViewport({ ...viewport, height: MAX_HEIGHT });
    }
    const raw = await page.screenshot({ type: 'png', fullPage: true, captureBeyondViewport: true });
    return { png: Buffer.from(raw), width: box.w, height: Math.min(box.h, MAX_HEIGHT) };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function launchServerless() {
  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}

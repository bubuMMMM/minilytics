import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Differential test: the minified tracker shipped in dist/ (scripts/minify-tracker.mjs) must behave like the source.
const raw = readFileSync(new URL('../public/js/script.js', import.meta.url), 'utf8');
const min = transformSync(raw, { minify: true, target: 'es2017', legalComments: 'none' }).code;

function browser(source: string, { cookies = 'normal', href = 'https://example.com/', referrer = '' } = {}) {
  const events: any[] = [];
  const listeners: Record<string, Function[]> = {};
  const jar = new Map<string, string>();
  let now = 1_000_000, nextId = 0;
  const listen = (event: string, cb: Function) => (listeners[event] ??= []).push(cb);
  const document: any = {
    currentScript: { src: 'https://analytics.example.com/js/script.js', getAttribute: (key: string) => key === 'data-website-id' ? 'website_123' : null, hasAttribute: () => false },
    referrer, visibilityState: 'visible', readyState: 'complete',
    querySelectorAll: () => [], addEventListener: listen,
  };
  Object.defineProperty(document, 'cookie', {
    get: () => { if (cookies === 'throw') throw new Error('Storage denied'); return cookies === 'blocked' ? '' : [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
    set: (value: string) => {
      if (cookies === 'throw') throw new Error('Storage denied');
      if (cookies === 'blocked') return;
      const [pair] = value.split(';'); const [key, val] = pair.split('=');
      if (value.includes('max-age=0')) jar.delete(key); else jar.set(key, val);
    },
  });
  const location = new URL(href);
  const navigator = { webdriver: false, sendBeacon: (_: string, blob: any) => { events.push(JSON.parse(blob.parts[0])); return true; } };
  const crypto = { randomUUID: () => `test-id-${++nextId}` };
  const window: any = { location, navigator, crypto, screen: { width: 1280 }, history: { pushState() {}, replaceState() {} }, addEventListener: listen };
  const context = { window, document, navigator, crypto, screen: window.screen, URL, URLSearchParams,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Blob: class { constructor(public parts: any[]) {} },
    Date: { now: () => now }, setInterval() {}, setTimeout: (fn: Function) => fn(),
    fetch: (_: string, init: any) => { events.push(JSON.parse(init.body)); return Promise.resolve({ ok: true }); },
  };
  const run = () => runInNewContext(source, context);
  const emit = (type: string, event: any = {}) => (listeners[type] ?? []).forEach((fn) => fn({ type, ...event }));
  run();
  return { events, window, document, run, emit, advance: (ms: number) => { now += ms; } };
}


function scenario(source: string) {
  const b = browser(source, { href: 'https://example.com/a?utm_source=x&token=secret#frag', referrer: 'https://google.com/' });
  b.window.minilytics('goal', 'signup', { plan: 'pro' });
  b.advance(31 * 60_000);
  b.window.minilytics('goal', 'return');
  return b.events.map(({ vid, sid, ...e }) => e);
}

describe('minified tracker', () => {
  it('is much smaller than the source', () => {
    expect(min.length).toBeLessThan(raw.length * 0.7);
  });
  it('emits exactly the same events as the source', () => {
    expect(scenario(min)).toEqual(scenario(raw));
    expect(scenario(raw).length).toBeGreaterThan(1);
  });
});

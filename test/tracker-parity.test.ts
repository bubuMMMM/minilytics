import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../public/js/script.js', import.meta.url), 'utf8');
function browser({ href = 'https://example.com/', attrs = {} as Record<string, string>, src = 'https://analytics.example.com/js/script.js' } = {}) {
  const events: any[] = [];
  const urls: string[] = [];
  const listeners: Record<string, Function[]> = {};
  const jar = new Map<string, string>();
  let nextId = 0;
  const all: Record<string, string> = { 'data-website-id': 'website_123', ...attrs };
  const document: any = {
    currentScript: { src, getAttribute: (k: string) => (k in all ? all[k] : null), hasAttribute: (k: string) => k in all },
    referrer: '', visibilityState: 'visible', readyState: 'complete',
    querySelectorAll: () => [], addEventListener: (e: string, cb: Function) => (listeners[e] ??= []).push(cb),
  };
  Object.defineProperty(document, 'cookie', {
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (value: string) => { const [pair] = value.split(';'); const [k, v] = pair.split('='); jar.set(k, v); },
  });
  const location: any = new URL(href);
  const history = { pushState() {}, replaceState(_: unknown, __: string, u: string) { const n = new URL(u, location.href); location.href = n.href; } };
  const navigator = { webdriver: false, sendBeacon: (u: string, blob: any) => { urls.push(u); events.push(JSON.parse(blob.parts[0])); return true; } };
  const window: any = { location, navigator, crypto: { randomUUID: () => `test-id-${++nextId}` }, screen: { width: 1280 }, history, addEventListener: (e: string, cb: Function) => (listeners[e] ??= []).push(cb) };
  runInNewContext(source, {
    window, document, navigator, crypto: window.crypto, screen: window.screen, URL, URLSearchParams, history,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Blob: class { constructor(public parts: any[]) {} },
    Date, setInterval() {}, setTimeout: (fn: Function) => fn(),
    fetch: (u: string, init: any) => { urls.push(u); events.push(JSON.parse(init.body)); return Promise.resolve({ ok: true }); },
  });
  return { events, urls, window, jar };
}

describe('DataFast-compatible tracker options', () => {
  it('ignores localhost unless data-allow-localhost is set', () => {
    expect(browser({ href: 'http://localhost:3000/' }).events).toHaveLength(0);
    expect(browser({ href: 'http://localhost:3000/', attrs: { 'data-allow-localhost': 'true' } }).events).toHaveLength(1);
  });
  it('sends to a first-party proxy path given by data-api-url', () => {
    const b = browser({ attrs: { 'data-api-url': '/stats/api/event' } });
    expect(b.urls[0]).toBe('https://example.com/stats/api/event');
  });
  it('cookieless mode sets no cookie and asks the server for the id', () => {
    const b = browser({ attrs: { 'data-cookieless': '' } });
    expect(b.jar.size).toBe(0);
    expect(b.events[0].cl).toBe(1);
  });
  it('hash mode (script.hash.js) sends the fragment route', () => {
    const b = browser({ href: 'https://example.com/app#/billing', src: 'https://analytics.example.com/js/script.hash.js' });
    expect(b.events[0].hp).toBe('#/billing');
  });
  it('adopts a cross-domain visitor id from the link and cleans the URL', () => {
    const b = browser({ href: 'https://shop.example.org/?_mlv=visitor_cross01&_mls=session_cross01&utm_source=x' });
    expect(b.events[0].vid).toBe('visitor_cross01');
    expect(b.window.location.href).not.toContain('_mlv');
  });
  it('exposes the datafast() alias for goals', () => {
    const b = browser();
    b.window.datafast('signup', { plan: 'pro' });
    expect(b.events.at(-1)).toMatchObject({ t: 'goal', n: 'signup' });
  });
});

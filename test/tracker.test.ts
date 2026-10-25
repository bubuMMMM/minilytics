import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { serializeProperties } from '../src/worker/collect';

const source = readFileSync(new URL('../public/js/script.js', import.meta.url), 'utf8');
function browser({ cookies = 'normal', href = 'https://example.com/', referrer = '' } = {}) {
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

describe('browser tracker regression coverage', () => {
  it('records one initial pageview even when installed twice', () => {
    const b = browser(); b.run();
    expect(b.events.filter((e) => e.t === 'pageview')).toHaveLength(1);
    b.window.minilytics('goal', 'signup');
    expect(b.events.filter((e) => e.t === 'goal')).toHaveLength(1);
  });
  it.each(['blocked', 'throw'])('retains IDs when cookie access is %s', (cookies) => {
    const b = browser({ cookies }); b.window.minilytics('goal', 'signup');
    expect(b.events[1].vid).toBe(b.events[0].vid);
    expect(b.events[1].sid).toBe(b.events[0].sid);
    b.advance(31 * 60_000); b.window.minilytics('goal', 'return');
    expect(b.events[2].vid).toBe(b.events[0].vid);
    expect(b.events[2].sid).not.toBe(b.events[0].sid);
  });
  it('removes secrets, credentials and fragments but preserves campaign attribution', () => {
    const b = browser({ href: 'https://example.com/?utm_source=x&email=private&client_secret=secret#access_token=secret', referrer: 'https://user:password@search.example.org/?token=secret&utm_source=search#private' });
    expect(b.events[0].u).toBe('https://example.com/?utm_source=x');
    expect(b.events[0].r).toBe('https://search.example.org/?utm_source=search');
  });
  it('does not treat lookalike domains as internal or right-clicks as visits', () => {
    const b = browser();
    const a = { href: 'https://notexample.com/path' };
    const target = { closest: (selector: string) => selector === 'a[href]' ? a : null };
    b.emit('auxclick', { button: 2, target });
    expect(b.events).toHaveLength(1);
    b.emit('click', { button: 0, target });
    expect(b.events.at(-1)).toMatchObject({ t: 'outbound', n: 'https://notexample.com/path' });
    a.href = 'https://app.example.com/'; b.emit('click', { button: 0, target });
    expect(b.events.filter((e) => e.t === 'outbound')).toHaveLength(1);
  });
  it('tracks restored pages without counting time spent in the back-forward cache', () => {
    const b = browser(); b.advance(5000); b.emit('pagehide');
    b.advance(120_000); b.emit('pageshow', { persisted: true });
    b.advance(3000); b.emit('pagehide');
    expect(b.events.filter((e) => e.t === 'pageview')).toHaveLength(2);
    expect(b.events.filter((e) => e.t === 'ping').reduce((sum, e) => sum + e.d, 0)).toBe(8000);
  });
  it('tracks SPA navigation once and keeps the initial referrer on the first view only', () => {
    const b = browser({ referrer: 'https://google.com/' });
    b.window.location.pathname = '/pricing'; b.window.history.pushState(); b.window.history.replaceState();
    const views = b.events.filter((e) => e.t === 'pageview');
    expect(views).toHaveLength(2); expect(views[1].r).toBe('');
  });
});

describe('goal properties', () => {
  it('keeps valid JSON within the byte budget, including multibyte text', () => {
    const props = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, '😊'.repeat(200)]));
    const serialized = serializeProperties(props)!;
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(1000);
  });
  it('preserves existing small nested properties and rejects top-level arrays', () => {
    expect(JSON.parse(serializeProperties({ plan: 'pro', seats: 2, trial: false, nested: { secret: 'x' } })!)).toEqual({ plan: 'pro', seats: 2, trial: false, nested: { secret: 'x' } });
    expect(serializeProperties([])).toBeNull();
  });
});

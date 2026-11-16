import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../public/js/script.js', import.meta.url), 'utf8');

function browser() {
  const events: any[] = [];
  const listeners: Record<string, Function[]> = {};
  const jar = new Map<string, string>();
  let now = 1_000_000, nextId = 0;
  const listen = (event: string, cb: Function) => (listeners[event] ??= []).push(cb);
  const html = { nodeType: 1, tagName: 'HTML', parentElement: null, id: '', className: '', children: [] as any[], scrollWidth: 1000, scrollHeight: 2000, clientWidth: 1000, clientHeight: 800, getAttribute: () => null };
  const body = { nodeType: 1, tagName: 'BODY', parentElement: html, id: '', className: '', children: [] as any[], scrollWidth: 1000, scrollHeight: 2000, getAttribute: () => null };
  html.children = [body];
  const document: any = {
    currentScript: { src: 'https://analytics.example.com/js/script.js', getAttribute: (key: string) => key === 'data-website-id' ? 'website_123' : null, hasAttribute: () => false },
    referrer: '', visibilityState: 'visible', readyState: 'complete',
    documentElement: html, body,
    querySelectorAll: () => [], addEventListener: listen,
  };
  Object.defineProperty(document, 'cookie', {
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (value: string) => {
      const [pair] = value.split(';'); const [key, val] = pair.split('=');
      if (value.includes('max-age=0')) jar.delete(key); else jar.set(key, val);
    },
  });
  const location = new URL('https://example.com/');
  const observed: string[] = [];
  const observers: { type: string; cb: Function }[] = [];
  const PerformanceObserver = class {
    cb: Function;
    constructor(cb: Function) { this.cb = cb; }
    observe(opts: { type: string }) { observed.push(opts.type); observers.push({ type: opts.type, cb: this.cb }); }
  };
  const performance = {
    getEntriesByType: (type: string) => {
      if (type === 'navigation') return [{ responseStart: 180 }];
      if (type === 'paint') return [{ name: 'first-contentful-paint', startTime: 420 }];
      return [];
    },
  };
  const window: any = {
    location, performance, innerWidth: 1280, innerHeight: 800,
    navigator: { webdriver: false, sendBeacon: (_: string, blob: any) => { events.push(JSON.parse(blob.parts[0])); return true; } },
    crypto: { randomUUID: () => `test-id-${++nextId}` },
    screen: { width: 1280 }, history: { pushState() {}, replaceState() {} }, addEventListener: listen,
  };
  const context = {
    window, document, navigator: window.navigator, crypto: window.crypto, screen: window.screen,
    PerformanceObserver, performance, URL, URLSearchParams,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Blob: class { constructor(public parts: any[]) {} },
    Date: { now: () => now }, setInterval() {}, setTimeout: (fn: Function) => fn(),
    fetch: (_: string, init: any) => { events.push(JSON.parse(init.body)); return Promise.resolve({ ok: true }); },
    isFinite, Math,
  };
  runInNewContext(source, context);
  const emit = (type: string, event: any = {}) => (listeners[type] ?? []).forEach((fn) => fn({ type, ...event }));
  const push = (type: string, entries: any[]) => {
    for (const o of observers) if (o.type === type) o.cb({ getEntries: () => entries });
  };
  return { events, window, document, body, html, emit, push, observed, advance: (ms: number) => { now += ms; } };
}

describe('tracker Web Vitals and heatmap', () => {
  it('observes vitals and sends one event on hide, with TTFB and FCP from navigation', () => {
    const b = browser();
    expect(b.observed).toEqual(expect.arrayContaining(['largest-contentful-paint', 'event', 'layout-shift']));
    b.push('largest-contentful-paint', [{ startTime: 1900 }]);
    b.push('event', [{ interactionId: 1, duration: 48 }]);
    b.push('layout-shift', [{ value: 0.04, startTime: 300, hadRecentInput: false }]);
    b.document.visibilityState = 'hidden';
    b.emit('visibilitychange');
    const vital = b.events.filter((e) => e.t === 'vital');
    expect(vital).toHaveLength(1);
    expect(vital[0].p).toMatchObject({ lcp: 1900, inp: 48, fcp: 420, ttfb: 180, cls: 0.04, vw: 1280 });
    b.emit('pagehide');
    expect(b.events.filter((e) => e.t === 'vital')).toHaveLength(1);
  });

  it('records normalised clicks, skips input text, and flags rage clicks', () => {
    const b = browser();
    const link = {
      nodeType: 1, tagName: 'A', id: 'cta', className: 'btn primary', parentElement: b.body,
      children: [], innerText: 'Essayer gratuitement', textContent: 'Essayer gratuitement', getAttribute: () => null,
    };
    b.body.children = [link];
    b.emit('click', { button: 0, pageX: 200, pageY: 400, target: link });
    const heat = b.events.filter((e) => e.t === 'heat');
    expect(heat).toHaveLength(1);
    expect(heat[0].n).toMatch(/a#cta/);
    expect(heat[0].p).toMatchObject({ x: 0.1563, y: 0.2, t: 'Essayer gratuitement', r: 0, vw: 1280 });

    const input = {
      nodeType: 1, tagName: 'INPUT', id: 'email', className: '', parentElement: b.body,
      children: [], value: 'ada@example.com', textContent: 'ada@example.com', getAttribute: () => null,
    };
    b.emit('click', { button: 0, pageX: 100, pageY: 100, target: input });
    const hidden = b.events.filter((e) => e.t === 'heat').at(-1);
    expect(hidden.p.t).toBe('');
    expect(hidden.n).toMatch(/input#email/);

    const spot = { button: 0, pageX: 500, pageY: 500, target: link };
    b.emit('click', spot);
    b.emit('click', spot);
    b.emit('click', spot);
    const rage = b.events.filter((e) => e.t === 'heat' && e.p.r === 1);
    expect(rage.length).toBeGreaterThanOrEqual(1);
  });

  it('does not emit a heat event when the click has no coordinates', () => {
    const b = browser();
    const before = b.events.length;
    const a = { href: 'https://notexample.com/path', closest: () => null, nodeType: 1, tagName: 'A', id: '', className: '', parentElement: b.body, children: [], getAttribute: () => null };
    const target = { closest: (selector: string) => selector === 'a[href]' ? a : null, nodeType: 1, tagName: 'A', id: '', className: '', parentElement: b.body, children: [], getAttribute: () => null };
    b.emit('click', { button: 0, target });
    expect(b.events.filter((e) => e.t === 'heat')).toHaveLength(0);
    expect(b.events.length).toBeGreaterThanOrEqual(before);
  });
});

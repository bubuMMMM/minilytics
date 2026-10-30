import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../public/js/script.js', import.meta.url), 'utf8');

/** Minimal DOM element with data attributes, closest() and a parent chain. */
function el(attrs: Record<string, string>, parent?: any): any {
  const node: any = {
    attrs, parent, isConnected: true,
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    matches: (sel: string) => sel.split(',').some((s) => {
      const m = /^\[([\w-]+)\]$/.exec(s.trim()) || /^a\[href\]$/.exec(s.trim());
      if (!m) return false;
      return s.trim() === 'a[href]' ? 'href' in attrs : m[1] in attrs;
    }),
    closest: (sel: string) => { let n = node; while (n) { if (n.matches(sel)) return n; n = n.parent; } return null; },
  };
  if (attrs.href) node.href = attrs.href;
  return node;
}

function browser() {
  const events: any[] = [];
  const beacons: any[] = [];
  const listeners: Record<string, Function[]> = {};
  const jar = new Map<string, string>();
  let now = 1_000_000, nextId = 0, nextTimer = 0;
  const timers = new Map<number, { at: number; fn: Function }>();
  const elements: any[] = [];
  const observers: any[] = [];
  const mutationCbs: Function[] = [];
  class MO { constructor(cb: Function) { mutationCbs.push(cb); } observe() {} disconnect() {} }
  const listen = (event: string, cb: Function) => (listeners[event] ??= []).push(cb);
  const document: any = {
    currentScript: { src: 'https://analytics.example.com/js/script.js', getAttribute: (k: string) => (k === 'data-website-id' ? 'website_123' : null), hasAttribute: () => false },
    referrer: '', visibilityState: 'visible', readyState: 'complete', documentElement: {},
    querySelectorAll: (sel: string) => (sel.includes('data-ml-block') ? elements : []), addEventListener: listen,
  };
  Object.defineProperty(document, 'cookie', { get: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '), set: (v: string) => { const [p] = v.split(';'); const [k, val] = p.split('='); jar.set(k, val); } });
  const location = new URL('https://example.com/trending');
  const navigator = { webdriver: false, userAgent: 'Mozilla/5.0 (iPhone) Safari', sendBeacon: (_: string, blob: any) => { beacons.push(JSON.parse(blob.parts[0])); return true; } };
  class IO {
    targets = new Set<any>();
    constructor(public cb: Function) { observers.push(this); }
    observe(t: any) { this.targets.add(t); }
    unobserve(t: any) { this.targets.delete(t); }
    disconnect() { this.targets.clear(); }
  }
  const window: any = { location, navigator, crypto: { randomUUID: () => `test-id-${++nextId}` }, screen: { width: 390 }, innerHeight: 800,
    history: { pushState() {}, replaceState() {} }, addEventListener: listen, IntersectionObserver: IO, MutationObserver: MO };
  const context = { window, document, navigator, crypto: window.crypto, screen: window.screen, URL, URLSearchParams, IntersectionObserver: IO, MutationObserver: MO,
    WeakSet, WeakMap, JSON, Math, String, Number, Object, Array,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
    Blob: class { constructor(public parts: any[]) {} },
    Date: { now: () => now }, setInterval() {},
    setTimeout: (fn: Function, ms = 0) => { const id = ++nextTimer; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (_: string, init: any) => { events.push(JSON.parse(init.body)); return Promise.resolve({ ok: true, status: 202 }); },
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
    }
    now = until;
  };
  runInNewContext(source, context);
  advance(0);
  const io = () => observers[observers.length - 1];
  /** Report an intersection for `target` the way the browser does. */
  const show = (target: any, ratio: number) => io().cb([{ target, isIntersecting: ratio > 0, intersectionRatio: ratio, intersectionRect: { height: 100 * ratio } }]);
  const emit = (type: string, event: any = {}) => (listeners[type] ?? []).forEach((fn) => fn({ type, ...event }));
  const all = () => [...events, ...beacons];
  /** Add elements to the page (React render): the tracker's MutationObserver picks them up. */
  const add = (...els: any[]) => { elements.push(...els); mutationCbs.forEach((cb) => cb([])); advance(300); };
  return { events, beacons, all, window, document, elements, add, advance, show, emit, io, location };
}

const sponsorAttrs = { 'data-ml-block': 'trending-justdropped-sponsor2-bidouilleurs', 'data-ml-kind': 'sponsor', 'data-ml-sponsor': 'Bidouilleurs', 'data-ml-href': 'https://bidouilleurs.co', href: 'https://bidouilleurs.co' };
const views = (b: ReturnType<typeof browser>) => b.all().filter((e) => e.t === 'block' && e.n === 'view').flatMap((e) => e.p.items);
const clicks = (b: ReturnType<typeof browser>) => b.all().filter((e) => e.t === 'block' && e.n === 'click');

describe('block impressions', () => {
  it('counts a sponsor once per pageview after ≥ 50 % visible for 1 s, and again after a client-side navigation', () => {
    const b = browser();
    const slot = el(sponsorAttrs); b.add(slot);
    expect(b.io().targets.has(slot)).toBe(true);
    b.show(slot, 0.6); b.advance(999);
    expect(views(b)).toHaveLength(0);
    b.advance(1); b.advance(2000);
    expect(views(b)).toEqual([expect.objectContaining({ id: 'trending-justdropped-sponsor2-bidouilleurs', k: 'sponsor', s: 'Bidouilleurs', h: 'https://bidouilleurs.co' })]);
    // Scrolling away and back on the same pageview does not count twice.
    b.show(slot, 0); b.show(slot, 1); b.advance(3000);
    expect(views(b)).toHaveLength(1);
    // Next.js client navigation: new pageview, observers re-armed, slot still on screen counts again.
    b.location.pathname = '/trending'; b.location.search = '?tab=best'; b.window.history.pushState(); b.advance(0);
    expect(b.io().targets.has(slot)).toBe(true);
    b.show(slot, 1); b.advance(3000);
    expect(views(b)).toHaveLength(2);
  });
  it('ignores brief, small or background-tab exposures', () => {
    const b = browser();
    const slot = el(sponsorAttrs); b.add(slot);
    b.show(slot, 0.3); b.advance(3000);
    b.show(slot, 0.6); b.advance(500); b.show(slot, 0.1); b.advance(3000);
    expect(views(b)).toHaveLength(0);
    b.show(slot, 0.8); b.document.visibilityState = 'hidden'; b.advance(3000);
    expect(views(b)).toHaveLength(0);
  });
  it('sends content items with their block, position and title in one batch', () => {
    const b = browser();
    const grid = el({ 'data-ml-block': 'trending-justdropped', 'data-ml-kind': 'content' });
    const cards = [1, 2, 3].map((i) => el({ 'data-ml-item': `video_${i}xxxxx`, 'data-ml-pos': String(i), 'data-ml-title': `Video ${i}` }, grid));
    b.add(grid, ...cards);
    cards.forEach((c) => b.show(c, 1)); b.advance(1000); b.advance(2000);
    const sent = b.all().filter((e) => e.t === 'block' && e.n === 'view');
    expect(sent).toHaveLength(1);
    expect(sent[0].p.items).toEqual([1, 2, 3].map((i) => expect.objectContaining({ id: 'trending-justdropped', k: 'content', i: `video_${i}xxxxx`, pos: i, tt: `Video ${i}` })));
  });
  it('flushes pending impressions by beacon when the page is hidden', () => {
    const b = browser();
    const slot = el(sponsorAttrs); b.add(slot);
    b.show(slot, 1); b.advance(1000);
    b.document.visibilityState = 'hidden'; b.emit('visibilitychange');
    expect(b.beacons.filter((e) => e.t === 'block')).toHaveLength(1);
  });
});

describe('block clicks', () => {
  it('records left and middle clicks by beacon, ignores right clicks and double events', () => {
    const b = browser();
    const slot = el(sponsorAttrs);
    const img = el({}, slot);
    b.emit('click', { button: 0, target: img });
    b.emit('click', { button: 0, target: img }); // same gesture reported twice
    b.advance(1000);
    b.emit('auxclick', { button: 1, target: img });
    b.advance(1000);
    b.emit('auxclick', { button: 2, target: img });
    const c = clicks(b);
    expect(c).toHaveLength(2);
    expect(c.every((e) => b.beacons.includes(e))).toBe(true);
    expect(c[0].p).toMatchObject({ id: 'trending-justdropped-sponsor2-bidouilleurs', k: 'sponsor', s: 'Bidouilleurs' });
  });
  it('attributes a card click to its content block and position', () => {
    const b = browser();
    const grid = el({ 'data-ml-block': 'watch-recommended', 'data-ml-kind': 'content' });
    const card = el({ 'data-ml-item': 'dQw4w9WgXcQ', 'data-ml-pos': '4', href: 'https://example.com/watch?v=dQw4w9WgXcQ' }, grid);
    b.emit('click', { button: 0, target: card });
    expect(clicks(b)[0].p).toMatchObject({ id: 'watch-recommended', i: 'dQw4w9WgXcQ', pos: 4, h: 'https://example.com/watch' });
  });
});

describe('engagement while watching', () => {
  it('treats video API calls as activity', () => {
    const b = browser();
    expect(() => b.window.minilytics('video', 'watch', { id: 'abc', s: 10 })).not.toThrow();
    expect(b.all().filter((e) => e.t === 'video')).toHaveLength(1);
  });
});

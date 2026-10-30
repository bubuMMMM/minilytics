/*! Minilytics tracker — <script defer data-website-id="SITE_ID" src="https://YOUR-HOST/js/script.js"></script> */
(function () {
  'use strict';
  var w = window, d = document, loc = w.location, nav = w.navigator;
  var script = d.currentScript;
  if (!script) return;

  var siteId = script.getAttribute('data-website-id');
  var endpoint = script.getAttribute('data-api') || new URL(script.src).origin + '/api/event';
  var allowLocal = script.hasAttribute('data-allow-localhost');
  var onlyHost = script.getAttribute('data-only-host');
  var excludedPaths = (script.getAttribute('data-exclude-paths') || '').split(',').map(function (p) { return p.trim(); }).filter(Boolean);
  function isExcluded() {
    return excludedPaths.some(function (p) { return loc.pathname === p || loc.pathname.indexOf(p + '/') === 0; });
  }
  var cookieDomain = script.getAttribute('data-domain');
  var VID = 'ml_vid', SID = 'ml_sid', YEAR = 31536000, SESSION = 1800;

  // One installation per website: duplicate tags must not register duplicate listeners.
  var installed = w.__minilyticsInstalled || (w.__minilyticsInstalled = {});
  if (installed[siteId]) return;

  var queued = (w.minilytics && w.minilytics.q) || [];
  function noop() {}

  // Opt yourself out: visit any page with ?ml_ignore=true (undo with ?ml_ignore=false).
  try {
    var ig = new URLSearchParams(loc.search).get('ml_ignore');
    if (ig === 'true') localStorage.setItem('ml_ignore', '1');
    if (ig === 'false') localStorage.removeItem('ml_ignore');
  } catch (e) {}
  var ignored = false;
  try { ignored = localStorage.getItem('ml_ignore') === '1'; } catch (e) {}
  // Automation and headless browsers never count as visitors.
  function automated() {
    try {
      if (nav.webdriver) return true;
      var ua = nav.userAgent || '';
      if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Lighthouse|Chrome-Lighthouse|bot\b|crawler|spider|Googlebot|bingbot|AdsBot|Mediapartners|facebookexternalhit|Twitterbot|Slurp|ia_archiver|prerender/i.test(ua)) return true;
      if (w._phantom || w.callPhantom || w.__nightmare || w.domAutomation || w.domAutomationController || d.documentElement.getAttribute('webdriver')) return true;
    } catch (e) {}
    return false;
  }
  var local = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local$)/.test(loc.hostname) || loc.protocol === 'file:';
  if (!siteId || ignored || automated() || (local && !allowLocal) || (onlyHost && loc.hostname !== onlyHost)) {
    w.minilytics = noop;
    w.minilytics.attribution = function () { return {}; };
    return;
  }

  installed[siteId] = true;

  // ---- cookies (first-party, shared across subdomains so app.site.com and site.com are one visitor)
  function readCookie(name) {
    try {
      var m = d.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function rootDomain() {
    if (cookieDomain) return cookieDomain;
    var parts = loc.hostname.split('.');
    if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) return null;
    for (var i = parts.length - 2; i >= 0; i--) {
      var cand = parts.slice(i).join('.');
      try { d.cookie = 'ml_t=1; path=/; domain=' + cand + '; SameSite=Lax';
      if (readCookie('ml_t')) {
        d.cookie = 'ml_t=; path=/; domain=' + cand + '; max-age=0';
        return cand;
      } } catch (e) { return null; }
    }
    return null;
  }
  var domain = rootDomain();
  function writeCookie(name, value, maxAge) {
    try { d.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; SameSite=Lax' +
      (domain ? '; domain=' + domain : '') + (loc.protocol === 'https:' ? '; Secure' : ''); } catch (e) {}
  }
  function uuid() {
    if (w.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  // In-memory fallback keeps events consistent when storage is unavailable.
  // It deliberately lasts only for this document; it is not a fingerprint.
  var memoryVid, memorySid, lastActivity = 0;
  function today(t) { try { var x = new Date(t); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); } catch (e) { return Math.floor(t / 864e5); } }
  function ids() {
    var now = Date.now();
    var vid = readCookie(VID) || memoryVid || uuid();
    // Session cookie value is "<id>.<local yyyymmdd>": a visit ends after 30 min idle OR at local midnight.
    var raw = readCookie(SID), sid = null, day = today(now);
    if (raw) { var parts = raw.split('.'); if (!parts[1] || +parts[1] === day) sid = parts[0]; }
    else if (memorySid && now - lastActivity < SESSION * 1000 && today(lastActivity) === day) sid = memorySid;
    if (!sid) sid = uuid();
    memoryVid = vid; memorySid = sid; lastActivity = now;
    writeCookie(VID, vid, YEAR);
    writeCookie(SID, sid + '.' + day, SESSION); // sliding 30 minute session
    return { vid: vid, sid: sid };
  }

  // ---- transport
  // Personal data in URLs (e.g. ?email= on a payment return page) never leaves the browser.
  var PRIVATE_PARAM = /^(e-?mail|name|phone|password|pass|token|access_token|id_token|auth|code|secret|key|api_key|license_key|license|authorization|refresh_token|session|session_id|jwt|client_secret|first_name|last_name|address)$/i;
  function cleanUrl(href) {
    try {
      var u = new URL(href);
      u.username = ''; u.password = ''; u.hash = '';
      var drop = [];
      u.searchParams.forEach(function (_, k) { if (PRIVATE_PARAM.test(k)) drop.push(k); });
      for (var i = 0; i < drop.length; i++) u.searchParams.delete(drop[i]);
      return u.toString();
    } catch (e) { return ''; }
  }
  // Device context, sent with every event so the session row created by the first one is complete.
  var ctx = {};
  try { ctx.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
  try { var cn = nav.connection; if (cn && cn.effectiveType) ctx.cn = String(cn.effectiveType).slice(0, 8); } catch (e) {}
  try { var cached = sessionStorage.getItem('ml_ch'); if (cached) ctx.ch = JSON.parse(cached); } catch (e) {}
  var chReady = !!ctx.ch || !(nav.userAgentData && nav.userAgentData.getHighEntropyValues);
  if (!chReady) {
    try {
      nav.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']).then(function (v) {
        var b = (v.fullVersionList || []).filter(function (x) { return !/Not.?A.?Brand|Chromium/i.test(x.brand); })[0];
        ctx.ch = { m: (v.model || '').slice(0, 40) || undefined, pv: (v.platformVersion || '').slice(0, 20) || undefined, bv: b ? String(b.version).split('.')[0] : undefined };
        try { sessionStorage.setItem('ml_ch', JSON.stringify(ctx.ch)); } catch (e) {}
      }).catch(noop).then(function () { chReady = true; });
    } catch (e) { chReady = true; }
  }

  // Failed sends (offline, flaky mobile network) wait in localStorage and are replayed, at most 24 h later.
  var QKEY = 'ml_retry_' + siteId;
  function loadQueue() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]') || []; } catch (e) { return []; } }
  function saveQueue(q) { try { if (q.length) localStorage.setItem(QKEY, JSON.stringify(q.slice(-40))); else localStorage.removeItem(QKEY); } catch (e) {} }
  function enqueue(body) { var q = loadQueue(); body.qt = Date.now(); q.push(body); saveQueue(q); }
  function post(body, retry) {
    var json = JSON.stringify(body);
    try {
      fetch(endpoint, { method: 'POST', body: json, keepalive: json.length < 60000, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } })
        .then(function (r) { if (r && r.status >= 500 && retry) enqueue(body); })
        .catch(function () { if (retry) enqueue(body); });
    } catch (e) { if (retry) enqueue(body); }
  }
  var flushing = false;
  function flushQueue() {
    if (flushing || nav.onLine === false) return;
    var q = loadQueue(); if (!q.length) return;
    flushing = true; saveQueue([]);
    var now = Date.now();
    for (var i = 0; i < q.length; i++) {
      var b = q[i]; if (!b || now - b.qt > 86400000) continue;
      b.age = now - b.qt; delete b.qt; post(b, false);
    }
    flushing = false;
  }
  w.addEventListener('online', flushQueue);

  function send(type, extra, beacon) {
    if (isExcluded()) return;
    var id = ids();
    var body = { w: siteId, t: type, u: cleanUrl(loc.href), vid: id.vid, sid: id.sid, sw: w.screen ? screen.width : 0, lang: (nav.language || '').slice(0, 35) || undefined,
      tz: ctx.tz, cn: ctx.cn, ch: ctx.ch };
    for (var k in extra) if (extra[k] !== undefined) body[k] = extra[k];
    var json = JSON.stringify(body);
    // text/plain keeps this a "simple" request: no CORS preflight, works with sendBeacon.
    if (beacon && nav.sendBeacon) {
      try { if (nav.sendBeacon(endpoint, new Blob([json], { type: 'text/plain' }))) return; } catch (e) {}
    }
    if (nav.onLine === false) { enqueue(body); return; }
    post(body, true);
  }

  // ---- engaged time (only while the tab is visible)
  var visibleSince = d.visibilityState === 'visible' ? Date.now() : 0;
  var pending = 0, pings = 0;
  function flushTime(beacon) {
    if (visibleSince) { pending += Date.now() - visibleSince; visibleSince = d.visibilityState === 'visible' ? Date.now() : 0; }
    if (pending >= 1000) { send('ping', { d: Math.round(pending) }, beacon); pending = 0; }
  }
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'visible') visibleSince = Date.now();
    else flushTime(true);
  });
  w.addEventListener('pagehide', function () { flushTime(true); visibleSince = 0; });
  w.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    visibleSince = d.visibilityState === 'visible' ? Date.now() : 0;
    pending = 0;
    lastPage = null; lastViewPage = null;
    pageview();
  });
  setInterval(function () {
    if (d.visibilityState === 'visible' && pings < 30) { pings++; flushTime(false); }
  }, 60000);

  // ---- interaction analytics: cumulative scroll milestones and page-level active time
  // Aggregates only: never read form values, keystrokes, cursor coordinates or element text.
  var engagementUrl = cleanUrl(loc.href), engagedMs = 0, lastSample = Date.now();
  var lastInteraction = Date.now(), pageMilestones = {}, scrollQueued = false;
  var milestones = [25, 50, 75, 90, 100];
  function markActive() { lastInteraction = Date.now(); }
  function sampleEngagement() {
    var now = Date.now();
    var elapsed = Math.min(5000, Math.max(0, now - lastSample));
    if (d.visibilityState === 'visible' && (!d.hasFocus || d.hasFocus()) &&
        now - lastInteraction < 60000) engagedMs += elapsed;
    lastSample = now;
  }
  function flushEngagement(beacon) {
    sampleEngagement();
    if (engagedMs >= 1000) {
      // Each event is a DELTA; multiple events per visit add to total active time.
      var ms = Math.min(60000, Math.round(engagedMs));
      send('engagement', { n: String(ms), u: engagementUrl }, !!beacon);
      engagedMs -= ms;
    }
  }
  function checkScroll() {
    scrollQueued = false;
    if (isExcluded() || d.visibilityState === 'hidden') return;
    var root = d.scrollingElement || d.documentElement;
    var max = Math.max(0, root.scrollHeight - w.innerHeight);
    if (max < 20) return; // do not pretend a short, non-scrollable page was read
    var percent = Math.min(100, Math.max(0, Math.floor(100 * (w.scrollY || root.scrollTop || 0) / max)));
    milestones.forEach(function (m) {
      if (percent >= m && !pageMilestones[m]) {
        pageMilestones[m] = true;
        send('scroll', { n: String(m), u: engagementUrl });
      }
    });
  }
  w.addEventListener('scroll', function () {
    markActive();
    if (!scrollQueued) {
      scrollQueued = true;
      setTimeout(checkScroll, 110);
    }
  }, { passive: true });
  d.addEventListener('pointerdown', markActive, { passive: true });
  d.addEventListener('keydown', markActive, true);
  d.addEventListener('visibilitychange', function () {
    if (d.visibilityState === 'hidden') flushEngagement(true);
    lastSample = Date.now();
    if (d.visibilityState === 'visible') markActive();
  });
  w.addEventListener('pagehide', function () { flushEngagement(true); });
  setInterval(function () {
    sampleEngagement();
    if (engagedMs >= 15000) flushEngagement(false);
  }, 5000);

  // ---- pageviews (including single-page-app navigation)
  var lastPage = null, firstView = true, lastViewAt = 0, lastViewPage = null;
  function pageview() {
    var page = loc.pathname + loc.search;
    if (page === lastPage) return;
    // React strict mode, router replaceState + pushState pairs and manual calls can fire twice in a row.
    if (page === lastViewPage && Date.now() - lastViewAt < 1500) { lastPage = page; return; }
    lastViewPage = page; lastViewAt = Date.now();
    if (lastPage !== null) { flushTime(false); flushEngagement(true); }
    lastPage = page;
    engagementUrl = cleanUrl(loc.href);
    engagedMs = 0;
    lastSample = Date.now();
    lastInteraction = Date.now();
    pageMilestones = {};
    pings = 0;
    flushBlocks(true);
    seenBlocks = {};
    send('pageview', { r: firstView ? cleanUrl(d.referrer) : '' });
    firstView = false;
    setTimeout(scanBlocks, 0);
  }
  var hist = w.history;
  if (hist && hist.pushState) {
    ['pushState', 'replaceState'].forEach(function (fn) {
      var orig = hist[fn];
      hist[fn] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
    });
    w.addEventListener('popstate', pageview);
  }

  // ---- blocks: sponsor placements and content sections/items
  // <div data-ml-block="trending-sponsor-2" data-ml-kind="sponsor" data-ml-sponsor="Acme" data-ml-href="https://acme.com">
  // <section data-ml-block="home-trending" data-ml-kind="content">…<a data-ml-item="VIDEO_ID" data-ml-pos="3">
  // An impression = at least 50 % of the element (or half the viewport for tall ones) visible for 1 s, once per pageview.
  var seenBlocks = {}, viewQueue = [], viewTimer = 0, observed = typeof WeakSet === 'function' ? new WeakSet() : null, timers = typeof WeakMap === 'function' ? new WeakMap() : null;
  function attr(el, n) { var v = el.getAttribute(n); return v ? v.slice(0, 200) : undefined; }
  function blockOf(el) {
    var item = attr(el, 'data-ml-item');
    var host = item ? (el.closest('[data-ml-block]') || el) : el;
    var id = attr(host, 'data-ml-block') || attr(el, 'data-ml-block');
    if (!id) return null;
    return { id: id.slice(0, 80), k: attr(el, 'data-ml-kind') || attr(host, 'data-ml-kind') || (attr(el, 'data-ml-sponsor') || attr(host, 'data-ml-sponsor') ? 'sponsor' : 'content'),
      s: attr(el, 'data-ml-sponsor') || attr(host, 'data-ml-sponsor'), h: attr(el, 'data-ml-href') || attr(host, 'data-ml-href'), i: item, pos: item ? +attr(el, 'data-ml-pos') || undefined : undefined };
  }
  function blockView(id, info) {
    var b = { id: String(id).slice(0, 80), k: info.kind === 'sponsor' ? 'sponsor' : 'content', s: info.sponsor, h: info.href, i: info.item, pos: info.pos };
    var key = b.id + '|' + (b.i || '');
    if (seenBlocks[key]) return;
    seenBlocks[key] = true;
    viewQueue.push(b);
    if (viewQueue.length >= 25) flushBlocks(false);
    else if (!viewTimer) viewTimer = setTimeout(function () { flushBlocks(false); }, 2000);
  }
  function flushBlocks(beacon) {
    if (viewTimer) { clearTimeout(viewTimer); viewTimer = 0; }
    if (!viewQueue.length) return;
    var items = viewQueue.splice(0, 25);
    send('block', { n: 'view', p: { items: items }, u: engagementUrl }, beacon);
    if (viewQueue.length) flushBlocks(beacon);
  }
  var io = w.IntersectionObserver ? new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i], el = en.target;
      var vh = w.innerHeight || 1;
      var visible = en.isIntersecting && (en.intersectionRatio >= 0.5 || en.intersectionRect.height >= vh * 0.5);
      var t = timers && timers.get(el);
      if (visible && !t && d.visibilityState === 'visible') {
        timers && timers.set(el, setTimeout(function (node) { return function () {
          timers && timers.delete(node);
          var b = blockOf(node);
          if (b && node.isConnected !== false) blockView(b.id, { kind: b.k, sponsor: b.s, href: b.h, item: b.i, pos: b.pos });
        }; }(el), 1000));
      } else if (!visible && t) { clearTimeout(t); timers.delete(el); }
    }
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] }) : null;
  function scanBlocks() {
    if (!io) return;
    var els = d.querySelectorAll('[data-ml-block],[data-ml-item]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (observed) { if (observed.has(el)) continue; observed.add(el); }
      io.observe(el);
    }
  }
  var scanQueued = false;
  function queueScan() { if (scanQueued) return; scanQueued = true; setTimeout(function () { scanQueued = false; scanBlocks(); }, 200); }
  if (w.MutationObserver) new MutationObserver(queueScan).observe(d.documentElement, { childList: true, subtree: true });
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') flushBlocks(true); });
  w.addEventListener('pagehide', function () { flushBlocks(true); });
  // Clicks (left, middle, ctrl/cmd + click, keyboard Enter) go out by beacon so the navigation never drops them.
  var lastBlockClick = 0, lastBlockKey = '';
  function blockClick(e) {
    if (e.type === 'auxclick' && e.button !== 1) return;
    var el = e.target && e.target.closest ? e.target.closest('[data-ml-item],[data-ml-block]') : null;
    if (!el || el.closest('[data-ml-ignore]')) return;
    var b = blockOf(el); if (!b) return;
    var key = b.id + '|' + (b.i || '');
    if (key === lastBlockKey && Date.now() - lastBlockClick < 800) return; // pointerdown + click on the same element
    lastBlockKey = key; lastBlockClick = Date.now();
    var a = e.target.closest('a[href]');
    if (!b.h && a) { try { var u = new URL(a.href, loc.href); b.h = u.origin + u.pathname; } catch (x) {} }
    send('block', { n: 'click', p: b, u: engagementUrl }, true);
  }

  // ---- goals, outbound links, Dodo Payments checkout links
  function goal(name, props) {
    if (!name) return;
    send('goal', { n: String(name).slice(0, 64), p: props || undefined }, true);
  }
  function attribution() {
    var id = ids();
    return { ml_visitor_id: id.vid, ml_session_id: id.sid };
  }
  // Dodo checkout links carry the visitor as metadata. They're tagged as soon as they appear on the page,
  // not just on click, because other scripts (e.g. Umami's click tracking) may copy the href and navigate
  // before our click handler runs.
  function tagDodoLink(a) {
    try {
      var u = new URL(a.href);
      if (!/(^|\.)dodopayments\.com$/.test(u.hostname)) return;
      var att = attribution();
      u.searchParams.set('metadata_ml_visitor_id', att.ml_visitor_id);
      u.searchParams.set('metadata_ml_session_id', att.ml_session_id);
      var next = u.toString();
      if (a.href !== next) a.href = next;
    } catch (e) {}
  }
  function tagDodoLinks() {
    var links = d.querySelectorAll('a[href*="dodopayments.com"]');
    for (var i = 0; i < links.length; i++) tagDodoLink(links[i]);
  }
  var tagQueued = false;
  function queueTag() {
    if (tagQueued) return;
    tagQueued = true;
    setTimeout(function () { tagQueued = false; tagDodoLinks(); }, 50);
  }
  if (w.MutationObserver) {
    new MutationObserver(queueTag).observe(d.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', tagDodoLinks);
  else tagDodoLinks();
  // Refresh right before a click starts, in case the session id rotated while the page sat idle.
  function onPress(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) tagDodoLink(a);
  }
  d.addEventListener('pointerdown', onPress, true);
  d.addEventListener('keydown', function (e) { if (e.key === 'Enter') onPress(e); }, true);
  function onClick(e) {
    if (e.type === 'auxclick' && e.button !== 1) return;
    var el = e.target && e.target.closest ? e.target : null;
    if (!el) return;
    var g = el.closest('[data-ml-goal]');
    if (g) {
      var props = {};
      for (var i = 0; i < g.attributes.length; i++) {
        var at = g.attributes[i];
        if (at.name.indexOf('data-ml-goal-') === 0) props[at.name.slice(13)] = at.value.slice(0, 255);
      }
      goal(g.getAttribute('data-ml-goal'), Object.keys(props).length ? props : undefined);
    }
    var a = el.closest('a[href]');
    if (a && !a.closest('[data-ml-ignore]')) {
      tagDodoLink(a);
      try {
        var u = new URL(a.href, loc.href);
        if (/^https?:$/.test(u.protocol) && u.hostname !== loc.hostname && !(domain && (u.hostname === domain || u.hostname.slice(-(domain.length + 1)) === '.' + domain))) {
          send('outbound', { n: u.origin + u.pathname }, true);
        } else if (u.origin === loc.origin && u.pathname !== loc.pathname) {
          // Only the destination path, never URL query/hash or clicked text.
          send('click', { n: u.pathname.slice(0, 200), u: engagementUrl }, true);
        }
      } catch (err) {}
    }
  }
  d.addEventListener('click', onClick, true);
  d.addEventListener('auxclick', onClick, true);
  d.addEventListener('click', blockClick, true);
  d.addEventListener('auxclick', blockClick, true);
  // Optional form completion tracking; the website owner opts in using data-ml-form.
  // No form field contents or names are collected.
  d.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches('form[data-ml-form]')) return;
    var formName = (form.getAttribute('data-ml-form') || '').slice(0, 64);
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(formName)) send('form', { n: formName }, true);
  }, true);

  // ---- public API
  function api(cmd, a, b) {
    if (cmd === 'goal' || cmd === 'track') goal(a, b);
    else if (cmd === 'identify' && a) send('identify', { p: { user_id: a.user_id || a.id, email: a.email, name: a.name } });
    else if (cmd === 'pageview') { lastPage = null; pageview(); }
    else if (cmd === 'impression' && a) blockView(a, b || {});
    // Video player lifecycle: minilytics('video', 'start'|'play'|'pause'|'seek'|'progress'|'complete'|'watch', { id, title, channel, duration, pct, s, t })
    else if (cmd === 'video' && a && b && b.id) send('video', { n: String(a).slice(0, 16), p: b }, a === 'watch' || a === 'pause' || a === 'complete');
    // Named UI interactions that are not conversions: minilytics('event', 'search', { label: 'query' })
    else if (cmd === 'event' && a) send('action', { n: String(a).slice(0, 64), p: b || undefined }, true);
  }
  api.attribution = attribution;
  w.minilytics = api;

  function start() {
    pageview();
    for (var q = 0; q < queued.length; q++) api.apply(null, queued[q]);
    flushQueue();
    scanBlocks();
  }
  if (chReady) start();
  else { var started = false, go = function () { if (!started) { started = true; start(); } }; setTimeout(go, 300); (function wait() { if (chReady) go(); else if (!started) setTimeout(wait, 20); })(); }
})();

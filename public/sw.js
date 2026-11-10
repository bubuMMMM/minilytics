/* Minilytics service worker: static assets only. Never cache /api/ or /w/ so revocation is immediate. */
const CACHE = 'ml-static-v1';
const STATIC = /^\/(assets|maps|js|icons)\//;
const STATIC_FILE = /\.(?:png|svg|webp|woff2?|ico)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/w/') || p === '/sw.js' || p === '/manifest.webmanifest') return;
  if (!(STATIC.test(p) || STATIC_FILE.test(p))) return;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      const cache = await caches.open(CACHE);
      cache.put(req, copy);
    }
    return res;
  })());
});

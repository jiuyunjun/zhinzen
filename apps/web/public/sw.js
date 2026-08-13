// Minimal service worker: app-shell + hashed-asset caching so the web app loads
// instantly on repeat visits and survives a flaky connection. Cross-origin requests
// (Firebase RTDB/Firestore/Functions, Google Maps, fonts) are left untouched.
const CACHE = 'zhinzen-v1';
const ASSET_RE = /\/assets\//;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle our own origin — never intercept Firebase/Maps/font requests.
  if (url.origin !== self.location.origin) return;

  // Hashed build assets are immutable → cache-first.
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Navigations (the HTML shell) → network-first, fall back to cache when offline.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('/index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('/index.html')) || (await cache.match(req)) || Response.error();
  }
}

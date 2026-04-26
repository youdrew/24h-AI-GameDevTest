/* Tile Explorer Service Worker — caches CDN + static assets for offline play */

// Bump VERSION whenever shipping new JS/CSS/HTML — old caches are deleted on activate.
const VERSION = 'tile-explorer-v4';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/ui.css',
  './css/responsive.css',
  './js/main.js',
  './js/game.js',
  './js/board.js',
  './js/level.js',
  './js/solver.js',
  './js/slot.js',
  './js/matcher.js',
  './js/animation.js',
  './js/audio.js',
  './js/storage.js',
  './js/leaderboard.js',
  './js/ui.js',
  './js/config.js',
  './sound/win.wav',
  './sound/failure.wav',
  './sound/SoundofUsingItems.wav',
  './sound/bomb.wav'
];

const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] precache miss', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache Supabase API or other non-app dynamic data
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/rpc/')) {
    return;
  }

  // CDN: cache-first with network fallback
  if (CDN_HOSTS.includes(url.host)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Same-origin: network-first for HTML, cache-first for assets
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
      event.respondWith(
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
      );
      return;
    }
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
  }
});

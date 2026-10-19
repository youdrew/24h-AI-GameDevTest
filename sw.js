/* Tile Explorer Service Worker — static assets and offline play */

// GitHub Pages projects share an origin, but must never share or clear caches.
// Bump VERSION whenever shipping new JS/CSS/HTML.
const APP_SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `tile-explorer:${APP_SCOPE.href}:`;
const VERSION = 'v7';
const STATIC_CACHE = `${CACHE_PREFIX}${VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_PREFIX}${VERSION}-runtime`;
const MEDIA_CACHE = `${CACHE_PREFIX}${VERSION}-media`;
const CURRENT_CACHES = new Set([STATIC_CACHE, RUNTIME_CACHE, MEDIA_CACHE]);
const INDEX_URL = new URL('index.html', APP_SCOPE).href;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/ui.css',
  './css/responsive.css',
  './assets/vendor/pixi-7.3.2.min.js',
  './js/main.js',
  './js/game.js',
  './js/board.js',
  './js/level.js',
  './js/difficulty.js',
  './js/solver.js',
  './js/slot.js',
  './js/matcher.js',
  './js/animation.js',
  './js/audio.js',
  './js/sfx-config.js',
  './js/storage.js',
  './js/leaderboard.js',
  './js/ui.js',
  './js/config.js',
  './assets/sounds/win.wav',
  './assets/sounds/failure.wav',
  './assets/sounds/SoundofUsingItems.wav',
  './assets/sounds/bomb.wav'
].map((path) => new URL(path, APP_SCOPE).href);

function isAppUrl(value) {
  const url = new URL(value);
  return url.origin === APP_SCOPE.origin && url.pathname.startsWith(APP_SCOPE.pathname);
}

async function removeOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(async (key) => {
    if (key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(key)) {
      await caches.delete(key);
      return;
    }
    // Older releases had unscoped names. Only remove one when every entry is
    // ours; mixed caches or another installation's entries must be preserved.
    if (/^tile-explorer-v\d+-(static|runtime|media)$/.test(key)) {
      const cache = await caches.open(key);
      const entries = await cache.keys();
      if (entries.every((request) => isAppUrl(request.url))) {
        await caches.delete(key);
      }
    }
  }));
}

async function storeResponse(cache, request, response) {
  if (response.ok) {
    // A full browser cache must not turn a successful network fetch into failure.
    await cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener('install', (event) => {
  // An incomplete app shell must not replace the previous working version.
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !isAppUrl(req.url)) return;

  const url = new URL(req.url);
  // Do not cache dynamic API data if a backend is added under this scope.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/rpc/')) return;

  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      try {
        const response = await fetch(req);
        return await storeResponse(cache, req, response);
      } catch {
        return await cache.match(req) || await cache.match(INDEX_URL);
      }
    }));
    return;
  }

  const path = url.pathname.slice(APP_SCOPE.pathname.length);
  if (path.startsWith('assets/pic/') || path.startsWith('assets/music/')) {
    // Theme media: serve cached content immediately and refresh in background.
    const cachePromise = caches.open(MEDIA_CACHE);
    const refresh = cachePromise.then(async (cache) => {
      const response = await fetch(req);
      return storeResponse(cache, req, response);
    });
    event.waitUntil(refresh.catch(() => {}));
    event.respondWith(cachePromise.then(async (cache) => {
      const cached = await cache.match(req);
      return cached || refresh;
    }));
    return;
  }

  // Look only in this installation's current caches, never origin-wide caches.
  event.respondWith((async () => {
    const staticCache = await caches.open(STATIC_CACHE);
    const precached = await staticCache.match(req);
    if (precached) return precached;
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    const cached = await runtimeCache.match(req);
    if (cached) return cached;
    return storeResponse(runtimeCache, req, await fetch(req));
  })());
});

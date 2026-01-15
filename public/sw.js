const CACHE_NAME = 'tamoxifen-tracker-v13';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './demo.html',
  './tracker.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Files that should always try network first (auth-critical)
const NETWORK_FIRST_FILES = ['index.html', 'tracker.js'];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for navigations and critical JS, cache-first for other assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNetworkFirst = event.request.mode === 'navigate' ||
    NETWORK_FIRST_FILES.some(f => url.pathname.endsWith(f));

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the latest for offline fallback
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          // Don't cache non-success or non-GET
          if (!response || response.status !== 200 || event.request.method !== 'GET') {
            return response;
          }
          // Clone and cache
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
  );
});

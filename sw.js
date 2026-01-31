const CACHE_NAME = 'travel-expense-v6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './shared/api-client.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install - cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // config.json 永遠走 network，不快取
  if (event.request.url.includes('config.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For CDN resources (Tailwind, XLSX), use cache-first strategy
  if (event.request.url.includes('cdn.tailwindcss.com') ||
      event.request.url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // For local assets, use network-first strategy
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// PWA Service Worker - 版本控制與自動更新
const APP_VERSION = '3.1.52';
const CACHE_NAME = 'travel-expense-v' + APP_VERSION.replace(/\./g, '');

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
  console.log('[SW] Installing version:', APP_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // 立即啟用新版本，不等待舊版本關閉
  self.skipWaiting();
});

// Activate - clean old caches and notify clients
self.addEventListener('activate', event => {
  console.log('[SW] Activating version:', APP_VERSION);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(() => {
      // 通知所有客戶端有新版本
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: APP_VERSION
          });
        });
      });
    })
  );
  // 立即接管所有頁面
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // config.json 和 version.json 永遠走 network，不快取
  if (event.request.url.includes('config.json') ||
    event.request.url.includes('version.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For CDN resources (Tailwind, XLSX, QRCode), use cache-first strategy
  if (event.request.url.includes('cdn.tailwindcss.com') ||
    event.request.url.includes('cdnjs.cloudflare.com') ||
    event.request.url.includes('cdn.jsdelivr.net')) {
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

// 監聽來自主頁面的訊息
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION });
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

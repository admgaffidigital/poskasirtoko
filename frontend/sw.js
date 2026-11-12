/**
 * Service Worker — POS Kasir Toko Bangunan
 * Cache hanya aset statis (HTML, CSS, JS, Ikon).
 * Request API (POST / script.google.com) TIDAK PERNAH di-cache!
 */

const CACHE_NAME = 'pos-kasir-static-v0.3.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './js/config.js',
  './js/routes.js',
  './js/api.js',
  './js/state.js',
  './js/app.js',
  './js/modules/auth.js',
  './js/modules/kategori.js',
  './js/modules/produk.js',
  './js/modules/supplier.js',
  './js/modules/pembelian.js',
  './js/modules/kartu-stok.js',
  './js/modules/opname.js',
  './js/modules/pengaturan.js',
  './js/modules/users.js',
  './js/modules/pos.js',
  './js/utils/format.js',
  './js/utils/ui.js',
  './js/utils/dom.js',
  './js/utils/printer.js',
  './js/utils/barcode.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Hanya metode GET yang boleh di-cache
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // Jangan pernah cache request ke Google Script API atau domain luar non-statis
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // Strategi Cache First dengan Network Fallback untuk aset statis lokal
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Ambil versi terbaru di latar belakang untuk memperbarui cache
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {/* offline, abaikan */});

        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseToCache);
        });

        return networkResponse;
      });
    }).catch(() => {
      // Jika offline dan membuka navigasi HTML, kembalikan cached index.html
      if (req.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});


/**
 * Service Worker — POS Kasir Toko Bangunan
 * Cache hanya aset statis (HTML, CSS, JS, Ikon).
 * Request API (POST / script.google.com) TIDAK PERNAH di-cache!
 */

const CACHE_NAME = 'pos-kasir-static-v1.0.70';

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
  './js/modules/hutang-piutang.js',
  './js/modules/retur.js',
  './js/modules/pelanggan.js',
  './js/modules/loyalti.js',
  './js/modules/pricetag.js',
  './js/modules/laporan.js',
  './js/modules/pengaturan.js',
  './js/modules/users.js',
  './js/modules/pos.js',
  './js/modules/biaya.js',
  './js/utils/format.js',
  './js/utils/ui.js',
  './js/utils/dom.js',
  './js/utils/printer.js',
  './js/utils/barcode.js',
  './js/utils/native.js',
  './js/utils/hpp-calculator.js',
  './js/utils/produk-picker.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

/**
 * Membersihkan properti `redirected: true` dari objek Response.
 * Spesifikasi Fetch melarang Service Worker mengembalikan redirected Response
 * untuk request yang redirect mode-nya bukan "follow" (seperti navigasi halaman).
 */
async function bersihkanRedirect(response) {
  if (!response || !response.redirected) {
    return response;
  }
  const cloned = response.clone();
  const body = await cloned.blob();
  return new Response(body, {
    status: cloned.status,
    statusText: cloned.statusText,
    headers: new Headers(cloned.headers)
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        ASSETS.map(async (assetUrl) => {
          try {
            const res = await fetch(assetUrl, { cache: 'no-cache', redirect: 'follow' });
            if (res && res.status === 200) {
              const cleanRes = await bersihkanRedirect(res);
              await cache.put(assetUrl, cleanRes);
            }
          } catch (err) {
            console.warn('[SW] Cache add warning:', assetUrl, err);
          }
        })
      );
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

  // Jangan cache file biner instalasi APK
  if (url.pathname.endsWith('.apk')) {
    return;
  }

  // Penanganan khusus request navigasi halaman (SPA / index.html) agar bebas error redirect
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const cached = (await caches.match(req)) || (await caches.match('./')) || (await caches.match('./index.html'));

          // Ambil versi terbaru di latar belakang untuk memperbarui cache
          fetch(req.url, { credentials: 'same-origin', redirect: 'follow' })
            .then(async (netRes) => {
              if (netRes && netRes.status === 200) {
                const cleanNet = await bersihkanRedirect(netRes);
                const cache = await caches.open(CACHE_NAME);
                await cache.put('./', cleanNet.clone());
                await cache.put('./index.html', cleanNet);
              }
            })
            .catch(() => { /* offline, abaikan */ });

          if (cached) {
            return await bersihkanRedirect(cached);
          }

          const networkResponse = await fetch(req.url, { credentials: 'same-origin', redirect: 'follow' });
          const cleanResponse = await bersihkanRedirect(networkResponse);
          if (cleanResponse && cleanResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('./', cleanResponse.clone());
            await cache.put('./index.html', cleanResponse.clone());
          }
          return cleanResponse;
        } catch (err) {
          const fallback = (await caches.match('./')) || (await caches.match('./index.html'));
          return fallback ? await bersihkanRedirect(fallback) : Response.error();
        }
      })()
    );
    return;
  }

  // Strategi Cache First dengan Network Fallback untuk aset statis lokal
  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          // Ambil versi terbaru di latar belakang untuk memperbarui cache
          fetch(req.url, { credentials: 'same-origin', redirect: 'follow' })
            .then(async (networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const cleanNet = await bersihkanRedirect(networkResponse);
                const cache = await caches.open(CACHE_NAME);
                await cache.put(req, cleanNet);
              }
            })
            .catch(() => { /* offline, abaikan */ });

          return await bersihkanRedirect(cachedResponse);
        }

        const networkResponse = await fetch(req.url, { credentials: 'same-origin', redirect: 'follow' });
        if (!networkResponse || networkResponse.status !== 200) {
          return await bersihkanRedirect(networkResponse);
        }

        const cleanResponse = await bersihkanRedirect(networkResponse);
        if (url.origin === self.location.origin) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, cleanResponse.clone());
        }

        return cleanResponse;
      } catch (err) {
        const fallback = await caches.match(req);
        return fallback ? await bersihkanRedirect(fallback) : Response.error();
      }
    })()
  );
});


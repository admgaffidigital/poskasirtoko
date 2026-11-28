/**
 * Service Worker — POS Kasir Toko Bangunan
 * Cache hanya aset statis (HTML, CSS, JS, Ikon).
 * Request API (POST / script.google.com) TIDAK PERNAH di-cache!
 */

const CACHE_NAME = 'pos-kasir-static-v1.0.161';
const IMAGE_CACHE_NAME = 'pos-kasir-images-v1';
const MAX_CACHED_IMAGES = 350;

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
  './js/modules/gudang.js',
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
  './js/utils/katalog-pdf.js',
  './js/utils/produk-import.js',
  './js/utils/offline-queue.js',
  './js/utils/evaluasi-pdf.js',
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
            const res = await fetch(assetUrl, { cache: 'reload', redirect: 'follow' });
            if (res && res.status === 200) {
              const cleanRes = await bersihkanRedirect(res);
              await cache.put(assetUrl, cleanRes);
            }
          } catch (err) {
            console.warn('[SW] Cache add warning:', assetUrl, err);
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== IMAGE_CACHE_NAME) {
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

  // Cache-First permanen untuk foto produk CDN Google Drive (lh3.googleusercontent.com) -> 0ms instan & tampil offline!
  if (/^lh\d+\.googleusercontent\.com$/i.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const imgCache = await caches.open(IMAGE_CACHE_NAME);
        const cached = await imgCache.match(req);
        if (cached) return cached;
        try {
          const netRes = await fetch(req);
          if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
            imgCache.put(req, netRes.clone()).then(async () => {
              const keys = await imgCache.keys();
              if (keys.length > MAX_CACHED_IMAGES) {
                const excess = keys.length - MAX_CACHED_IMAGES;
                for (let i = 0; i < excess; i++) {
                  await imgCache.delete(keys[i]);
                }
              }
            }).catch(() => {});
          }
          return netRes;
        } catch (err) {
          return Response.error();
        }
      })()
    );
    return;
  }

  // Jangan pernah cache request ke Google Script API, localhost/POS USB Bridge, atau redirect script.googleusercontent.com
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost'
  ) {
    return;
  }

  // Jangan cache manifest versi live (version.json), file biner instalasi APK, atau paket unduhan Bridge Windows
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('.apk') || url.pathname.endsWith('.bat')) {
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

  // Strategi Pure Cache-First untuk aset statis lokal berversi (CACHE_NAME berubah setiap rilis).
  // Menghilangkan puluhan background fetch berulang pada setiap boot agar bandwidth 100% fokus ke API kasir.
  event.respondWith(
    (async () => {
      try {
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
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


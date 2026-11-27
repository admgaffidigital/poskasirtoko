/**
 * api.js — Pemanggil Backend Google Apps Script Web App
 * Sesuai kontrak README bagian 9:
 * - Request POST dengan Content-Type: text/plain;charset=utf-8 (hindari preflight CORS)
 * - Format request: { action, token, payload }
 * - Format respons: { ok, data, error, code }
 * - Penanganan timeout, offline, dan error baku
 */

import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, code = 'SERVER', detail = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}

// Kunci penyimpanan cache persisten di localStorage untuk fitur Stale-While-Revalidate (SWR)
const PERSISTENT_CACHE_KEY = 'pos_api_cache_v1';

// Cache respons in-memory di sisi klien untuk query baca (read queries)
const memoryApiCache = new Map();

// Koleksi request yang sedang berjalan untuk deduplikasi request identik (In-Flight Request Coalescing)
const inFlightRequests = new Map();

// Aksi yang dapat di-cache dengan aman (TTL segar dalam milidetik; SWR stale window = 6x TTL hingga 15 menit)
const CACHE_CONFIG = {
  'kategori.list': 300000,         // 5 menit
  'pengaturan.get': 600000,        // 10 menit
  'produk.list': 120000,           // 2 menit (katalog instan per filter & paginasi)
  'pelanggan.list': 300000,        // 5 menit (instan 0ms di POS Kasir, Pelanggan, & Loyalti)
  'pelanggan.detail': 60000,       // 1 menit
  'supplier.list': 180000,         // 3 menit
  'hadiah.list': 180000,           // 3 menit
  'user.list': 60000,              // 1 menit
  'auth.me': 45000,                // 45 detik
  'kartuStok.list': 60000,         // 1 menit
  'opname.list': 60000,            // 1 menit
  'gudang.ringkasan': 45000,       // 45 detik
  'gudang.transferList': 45000,    // 45 detik
  'rusak.list': 45000,             // 45 detik
  'pembelian.list': 60000,         // 1 menit
  'pembelian.detail': 60000,       // 1 menit
  'penjualan.list': 60000,         // 1 menit
  'penjualan.detail': 60000,       // 1 menit
  'penjualan.pending.list': 45000, // 45 detik
  'penjualan.shiftKasir': 45000,   // 45 detik
  'shift.aktif': 45000,            // 45 detik
  'shift.list': 60000,             // 1 menit
  'pengiriman.list': 45000,        // 45 detik
  'penawaran.list': 45000,         // 45 detik
  'piutang.list': 60000,           // 1 menit
  'piutang.detail': 60000,         // 1 menit
  'hutang.list': 60000,            // 1 menit
  'hutang.detail': 60000,          // 1 menit
  'retur.list': 60000,             // 1 menit
  'retur.detail': 60000,           // 1 menit
  'biaya.list': 60000,             // 1 menit
  'deposit.riwayat': 60000,        // 1 menit
  'member.riwayatPoin': 60000,     // 1 menit
  'laporan.dashboard': 60000,      // 1 menit
  'laporan.penjualan': 60000,      // 1 menit
  'laporan.pembelian': 60000,      // 1 menit
  'laporan.arusKas': 60000,        // 1 menit
  'laporan.labaRugi': 60000,       // 1 menit
  'laporan.stokValuasi': 60000,    // 1 menit
  'tutupBuku.list': 60000,         // 1 menit
  'tutupBuku.rekapHarian': 30000,  // 30 detik
  'tutupBuku.evaluasiBulanan': 45000 // 45 detik
};

// Aksi yang disimpan ke localStorage agar instan (0ms) saat halaman di-reload (F5)
const PERSISTABLE_ACTIONS = new Set([
  'kategori.list',
  'pengaturan.get',
  'produk.list',
  'pelanggan.list',
  'supplier.list',
  'hadiah.list',
  'gudang.ringkasan',
  'penjualan.pending.list',
  'shift.aktif',
  'pengiriman.list',
  'retur.list',
  'pembelian.list',
  'piutang.list',
  'hutang.list',
  'biaya.list',
  'laporan.dashboard',
  'laporan.penjualan',
  'laporan.arusKas'
]);

// Pola mutasi data yang otomatis mengosongkan cache terkait secara instan
const MUTATION_PATTERNS = [
  { trigger: 'kategori.', targets: ['kategori.', 'produk.', 'laporan.'] },
  { trigger: 'produk.', targets: ['produk.', 'gudang.', 'kartuStok.', 'laporan.'] },
  { trigger: 'penjualan.', targets: ['produk.', 'gudang.', 'pelanggan.', 'penjualan.', 'shift.', 'pengiriman.', 'piutang.', 'kartuStok.', 'laporan.', 'member.', 'deposit.'] },
  { trigger: 'shift.', targets: ['shift.', 'penjualan.', 'laporan.', 'tutupBuku.'] },
  { trigger: 'tutupBuku.', targets: ['tutupBuku.', 'shift.', 'laporan.'] },
  { trigger: 'pengiriman.', targets: ['pengiriman.', 'penjualan.', 'laporan.'] },
  { trigger: 'penawaran.', targets: ['penawaran.'] },
  { trigger: 'pembelian.', targets: ['produk.', 'gudang.', 'supplier.', 'pembelian.', 'hutang.', 'kartuStok.', 'laporan.'] },
  { trigger: 'opname.', targets: ['produk.', 'gudang.', 'opname.', 'kartuStok.', 'laporan.'] },
  { trigger: 'gudang.', targets: ['gudang.', 'produk.', 'kartuStok.', 'laporan.'] },
  { trigger: 'rusak.', targets: ['rusak.', 'gudang.', 'produk.', 'kartuStok.', 'laporan.', 'tutupBuku.'] },
  { trigger: 'retur.', targets: ['produk.', 'gudang.', 'retur.', 'piutang.', 'hutang.', 'kartuStok.', 'laporan.', 'pelanggan.', 'supplier.', 'penjualan.', 'shift.', 'member.', 'deposit.'] },
  { trigger: 'piutang.', targets: ['piutang.', 'pelanggan.', 'penjualan.', 'shift.', 'laporan.', 'member.'] },
  { trigger: 'hutang.', targets: ['hutang.', 'supplier.', 'pembelian.', 'laporan.'] },
  { trigger: 'pelanggan.', targets: ['pelanggan.', 'piutang.', 'deposit.', 'laporan.'] },
  { trigger: 'deposit.', targets: ['pelanggan.', 'deposit.', 'penjualan.', 'shift.', 'laporan.'] },
  { trigger: 'supplier.', targets: ['supplier.', 'hutang.', 'laporan.'] },
  { trigger: 'hadiah.', targets: ['hadiah.', 'pelanggan.', 'member.'] },
  { trigger: 'member.', targets: ['pelanggan.', 'hadiah.', 'member.'] },
  { trigger: 'biaya.', targets: ['biaya.', 'penjualan.', 'shift.', 'laporan.'] },
  { trigger: 'kartuStok.', targets: ['kartuStok.', 'produk.', 'laporan.'] },
  { trigger: 'sistem.', targets: [''] },
  { trigger: 'pengaturan.', targets: ['pengaturan.'] },
  { trigger: 'user.', targets: ['user.', 'auth.'] },
  { trigger: 'auth.gantiPin', targets: ['auth.'] },
  { trigger: 'auth.logout', targets: [''] },
  { trigger: 'auth.login', targets: [''] }
];

let persistTimer = null;
const MAX_MEMORY_CACHE_ENTRIES = 180;
const MAX_PERSIST_BYTES = 550000; // Batas ~550 KB agar localStorage tetap ringan & cepat saat reload

function pangkasCacheMemori() {
  const now = Date.now();
  for (const [k, v] of memoryApiCache.entries()) {
    if (!v || (v.staleExpiry && now >= v.staleExpiry)) {
      memoryApiCache.delete(k);
    }
  }
  if (memoryApiCache.size > MAX_MEMORY_CACHE_ENTRIES) {
    const excess = memoryApiCache.size - MAX_MEMORY_CACHE_ENTRIES;
    let removed = 0;
    for (const k of memoryApiCache.keys()) {
      memoryApiCache.delete(k);
      if (++removed >= excess) break;
    }
  }
}

function muatCachePersisten() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(PERSISTENT_CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    const now = Date.now();
    let expiredFound = false;
    for (const [k, v] of Object.entries(obj)) {
      if (v && v.staleExpiry && now < v.staleExpiry) {
        memoryApiCache.set(k, v);
      } else {
        expiredFound = true;
      }
    }
    if (expiredFound) jadwalkanSimpanCachePersisten();
  } catch (_) { }
}

function jadwalkanSimpanCachePersisten() {
  if (typeof localStorage === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      pangkasCacheMemori();
      const obj = {};
      const now = Date.now();
      let count = 0;
      let estBytes = 2;
      for (const [k, v] of memoryApiCache.entries()) {
        const act = k.split('::')[0] || '';
        if (PERSISTABLE_ACTIONS.has(act) && v && now < v.staleExpiry && count < 40) {
          const entryJson = JSON.stringify(v);
          if (estBytes + k.length + entryJson.length > MAX_PERSIST_BYTES) continue;
          obj[k] = v;
          estBytes += k.length + entryJson.length + 6;
          count++;
        }
      }
      localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(obj));
    } catch (_) { }
  }, 150);
}

/**
 * Periksa apakah aksi + payload sudah memiliki cache yang masih segar di memori
 */
export function hasFreshApiCache(action, payload = {}, explicitToken = null) {
  if (!CACHE_CONFIG[action]) return false;
  const token = ambilTokenAktif(explicitToken);
  const payloadStr = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
  const cacheKey = `${action}::${token}::${payloadStr}`;
  const entry = memoryApiCache.get(cacheKey);
  return Boolean(entry && Date.now() < entry.expiry);
}

/**
 * Periksa apakah aksi + payload sudah punya cache instan (Fresh atau Stale-While-Revalidate)
 * agar UI tidak berkedip menampilkan skeleton saat berpindah tab/halaman.
 */
export function hasUsableApiCache(action, payload = {}, explicitToken = null) {
  if (!CACHE_CONFIG[action] || Date.now() < forceFreshUntil) return false;
  const token = ambilTokenAktif(explicitToken);
  const payloadStr = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
  const cacheKey = `${action}::${token}::${payloadStr}`;
  const entry = memoryApiCache.get(cacheKey);
  return Boolean(entry && entry.staleExpiry && Date.now() < entry.staleExpiry);
}

/**
 * Ringkasan statistik cache API klien untuk halaman Perawatan & Diagnostik Sistem
 */
export function getApiCacheStats() {
  pangkasCacheMemori();
  const now = Date.now();
  let freshCount = 0;
  let staleCount = 0;
  for (const v of memoryApiCache.values()) {
    if (v && now < v.expiry) freshCount++;
    else if (v && now < v.staleExpiry) staleCount++;
  }
  let persistedBytes = 0;
  let totalStorageBytes = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      persistedBytes = (localStorage.getItem(PERSISTENT_CACHE_KEY) || '').length;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) totalStorageBytes += key.length + (localStorage.getItem(key) || '').length;
      }
    } catch (_) { }
  }
  return {
    totalEntries: memoryApiCache.size,
    freshEntries: freshCount,
    staleEntries: staleCount,
    inFlightCount: inFlightRequests.size,
    persistedKB: Number((persistedBytes / 1024).toFixed(1)),
    totalStorageKB: Number((totalStorageBytes / 1024).toFixed(1))
  };
}

// Hidrasi cache dari localStorage saat modul dimuat pertama kali
muatCachePersisten();

function ambilTokenAktif(explicitToken) {
  let token = explicitToken;
  if (!token && typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('pos_token') || '';
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try { token = JSON.parse(raw); } catch { token = raw; }
    } else {
      token = raw;
    }
  }
  return (token || '').trim();
}

/**
 * Isi cache API secara langsung (mis. dari hasil auth.me atau prefetch gabungan)
 */
export function seedApiCache(action, payload = {}, data, explicitToken = null) {
  const ttl = CACHE_CONFIG[action];
  if (!ttl || data === undefined) return;
  const token = ambilTokenAktif(explicitToken);
  const payloadStr = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
  const cacheKey = `${action}::${token}::${payloadStr}`;
  const now = Date.now();
  memoryApiCache.set(cacheKey, {
    data,
    expiry: now + ttl,
    staleExpiry: now + Math.max(ttl * 6, 900000)
  });
  if (PERSISTABLE_ACTIONS.has(action)) {
    jadwalkanSimpanCachePersisten();
  }
}

let forceFreshUntil = 0;

/**
 * Paksa seluruh pemanggilan apiCall berikutnya selama durasi tertentu untuk melewati pembacaan cache
 * dan mengambil data segar langsung dari server (kemudian memperbarui cache).
 * @param {number} [durationMs=2000]
 */
export function forceNextApiCallsFresh(durationMs = 2000) {
  forceFreshUntil = Date.now() + durationMs;
}

/**
 * Hapus entri cache API (semua atau berdasarkan awalan aksi)
 * @param {string} [prefix=null]
 */
export function invalidateApiCache(prefix = null) {
  if (!prefix) {
    memoryApiCache.clear();
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(PERSISTENT_CACHE_KEY); } catch (_) { }
    }
    return;
  }
  for (const key of memoryApiCache.keys()) {
    const act = key.split('::')[0] || '';
    if (act.startsWith(prefix) || key.startsWith(prefix)) {
      memoryApiCache.delete(key);
    }
  }
  jadwalkanSimpanCachePersisten();
}

// Interceptor global (Capture Phase) agar seluruh tombol refresh/sinkronisasi di semua modul
// otomatis mengosongkan cache, memutar animasi ikon, dan memuat data segar dari server.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('[id^="btn-refresh"], [id^="btn-segarkan"], [id^="btn-sync"], #btn-pos-refresh, .btn-refresh, .btn-sync, #btn-menu-sync')
      : null;
    if (!btn || btn.disabled) return;

    invalidateApiCache();
    forceNextApiCallsFresh(2500);
    btn.classList.add('is-spinning');

    setTimeout(() => {
      const pending = Array.from(inFlightRequests.values());
      if (pending.length > 0) {
        Promise.allSettled(pending).finally(() => {
          btn.classList.remove('is-spinning');
        });
      } else {
        btn.classList.remove('is-spinning');
      }
    }, 550);
  }, true);
}

const READ_SUFFIXES = [
  '.list', '.transferList', '.get', '.detail', '.me', '.status', '.ping', '.aktif',
  '.kartu', '.shift', '.shiftKasir', '.riwayat', '.riwayatPoin',
  '.dashboard', '.ringkasan', '.penjualan', '.pembelian',
  '.kas', '.arusKas', '.labaRugi', '.laba_rugi', '.stokValuasi',
  '.rekapHarian', '.evaluasiBulanan'
];

function adalahAksiMutasi(action) {
  return !READ_SUFFIXES.some((s) => action.endsWith(s));
}

/**
 * Panggil aksi backend Apps Script
 * @param {string} action Nama aksi (cth: "sistem.ping", "auth.login", "produk.list")
 * @param {Object} [payload={}] Data yang dikirim
 * @param {Object} [options={}] Opsi tambahan (timeoutMs, token, skipCache)
 * @returns {Promise<any>} Data hasil dari respons backend
 */
export async function apiCall(action, payload = {}, options = {}) {
  const apiUrl = CONFIG.API_URL;
  if (!apiUrl) {
    throw new ApiError(
      'URL API Backend belum diatur. Buka menu Pengaturan > Sistem untuk mengisi URL Google Apps Script Web App.',
      'CONFIG_MISSING'
    );
  }

  // Jika ini aksi mutasi (create/update/delete/bayar/void), hapus cache terkait seketika
  if (adalahAksiMutasi(action)) {
    let matched = false;
    MUTATION_PATTERNS.forEach(({ trigger, targets }) => {
      if (action.startsWith(trigger)) {
        matched = true;
        targets.forEach((t) => invalidateApiCache(t));
      }
    });
    if (!matched) {
      const ns = action.split('.')[0];
      if (ns) invalidateApiCache(ns + '.');
      invalidateApiCache('laporan.');
    }
  }

  const token = ambilTokenAktif(options.token);
  const bypassCacheRead = Boolean(options.skipCache) || Date.now() < forceFreshUntil;
  const isCacheable = !bypassCacheRead && !!CACHE_CONFIG[action];
  const payloadStr = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
  const cacheKey = CACHE_CONFIG[action] ? `${action}::${token}::${payloadStr}` : null;

  if (!navigator.onLine) {
    // Saat offline, kembalikan data dari cache bila tersedia
    if (cacheKey && memoryApiCache.has(cacheKey)) {
      return memoryApiCache.get(cacheKey).data;
    }
    throw new ApiError(
      'Tidak ada koneksi internet. Pastikan perangkat Anda terhubung ke jaringan.',
      'OFFLINE'
    );
  }

  // Eksekutor jaringan dengan deduplikasi In-Flight Coalescing
  const eksekusiJaringan = () => {
    if (cacheKey && inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const timeoutMs = options.timeoutMs || CONFIG.API_TIMEOUT_MS || 30000;
    const requestBody = JSON.stringify({
      action,
      token,
      payload
    });

    const fetchPromise = (async () => {
      const bolehRetry = !adalahAksiMutasi(action);
      let percobaan = 0;
      const maksPercobaan = bolehRetry ? 2 : 1;

      while (percobaan < maksPercobaan) {
        percobaan++;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              // Penting: text/plain mencegah browser mengirim CORS preflight (OPTIONS)
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: requestBody,
            signal: controller.signal
          });

          clearTimeout(timer);

          if (!res.ok) {
            throw new ApiError(
              `Server mengembalikan status HTTP ${res.status} (${res.statusText})`,
              'HTTP_ERROR'
            );
          }

          const text = await res.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            console.error('[API] Respon bukan JSON valid:', text);
            throw new ApiError(
              'Format respons dari server tidak dapat dibaca.',
              'PARSE_ERROR'
            );
          }

          if (!data || typeof data !== 'object') {
            throw new ApiError('Format respons server tidak sesuai standar.', 'INVALID_RESPONSE');
          }

          if (data.ok === true) {
            if (CACHE_CONFIG[action]) {
              const ttl = CACHE_CONFIG[action];
              const now = Date.now();
              const targetKey = `${action}::${token}::${payloadStr}`;
              memoryApiCache.set(targetKey, {
                data: data.data,
                expiry: now + ttl,
                staleExpiry: now + Math.max(ttl * 6, 900000)
              });
              // Cross-seed varian cache kategori.list ({} <-> { aktif_saja: true }) agar tidak ada panggilan ganda
              if (action === 'kategori.list' && data.data && Array.isArray(data.data.items)) {
                if (Object.keys(payload).length === 0) {
                  seedApiCache('kategori.list', { aktif_saja: true }, data.data, token);
                } else if (payload.aktif_saja === true && Object.keys(payload).length === 1) {
                  seedApiCache('kategori.list', {}, data.data, token);
                }
              }
              // Cross-seed varian cache pelanggan.list agar POS Kasir, Modul Pelanggan, & Loyalti berbagi cache 0ms
              if (action === 'pelanggan.list' && data.data && Array.isArray(data.data.items)) {
                const isUnfilteredAll = (!payload.cari && !payload.q && !payload.tipe && !payload.level) &&
                  (payload.semua === true || payload.aktif_saja === false || Object.keys(payload).length === 0);
                if (isUnfilteredAll) {
                  const allItems = data.data.items;
                  const activeItems = allItems.filter((it) => it.aktif !== false);
                  const activeMembers = activeItems.filter((it) => it.tipe === 'member');
                  seedApiCache('pelanggan.list', { semua: true }, { items: activeItems, total: activeItems.length, page: 1, limit: activeItems.length }, token);
                  seedApiCache('pelanggan.list', { tipe: 'member', aktif_saja: true, limit: 100 }, { items: activeMembers, total: activeMembers.length, page: 1, limit: 100 }, token);
                  seedApiCache('pelanggan.list', { tipe: 'member', limit: 100 }, { items: activeMembers, total: activeMembers.length, page: 1, limit: 100 }, token);
                }
              }
              if (memoryApiCache.size > MAX_MEMORY_CACHE_ENTRIES) {
                pangkasCacheMemori();
              }
              if (PERSISTABLE_ACTIONS.has(action)) {
                jadwalkanSimpanCachePersisten();
              }
            }
            if (cacheKey) inFlightRequests.delete(cacheKey);
            return data.data;
          } else {
            const errMsg = data.error || 'Terjadi kesalahan pada permintaan server.';
            const errCode = data.code || 'SERVER';
            if ((errCode === 'AUTH_INVALID' || errCode === 'AUTH_REQUIRED') && action !== 'auth.login' && action !== 'auth.logout' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
              try {
                window.dispatchEvent(new CustomEvent('pos-auth-expired', { detail: { code: errCode, message: errMsg, action } }));
              } catch (_) { }
            }
            throw new ApiError(errMsg, errCode, data.data);
          }
        } catch (err) {
          clearTimeout(timer);
          const isTransientNet = !(err instanceof ApiError) && err.name !== 'AbortError';
          if (isTransientNet && percobaan < maksPercobaan && navigator.onLine) {
            await new Promise((r) => setTimeout(r, 650));
            continue;
          }
          if (cacheKey) inFlightRequests.delete(cacheKey);
          if (err instanceof ApiError) throw err;
          if (err.name === 'AbortError') {
            throw new ApiError(
              'Waktu tunggu permintaan habis (timeout). Server membutuhkan waktu lebih lama dari biasanya.',
              'TIMEOUT'
            );
          }
          console.error('[API Error]', err);
          throw new ApiError(
            'Gagal menghubungi server. Periksa koneksi internet atau izin URL Web App.',
            'NETWORK_ERROR'
          );
        }
      }
    })();

    if (cacheKey) {
      inFlightRequests.set(cacheKey, fetchPromise);
    }
    return fetchPromise;
  };

  // Periksa cache (Fresh Hit = 0ms; Stale Hit = 0ms + Revalidasi Latar Belakang SWR)
  if (isCacheable && memoryApiCache.has(cacheKey)) {
    const entry = memoryApiCache.get(cacheKey);
    const now = Date.now();
    if (now < entry.expiry) {
      return entry.data;
    }
    if (entry.staleExpiry && now < entry.staleExpiry) {
      // Stale-While-Revalidate: Kembalikan data instan (0ms) dan segarkan di latar belakang
      eksekusiJaringan().catch(() => { });
      return entry.data;
    }
    memoryApiCache.delete(cacheKey);
  }

  return await eksekusiJaringan();
}

/**
 * Objek helper API serbaguna untuk kemudahan pemanggilan (cth: api.post(action, payload))
 */
export const api = {
  call: apiCall,
  post: async (action, payload = {}, options = {}) => {
    try {
      const res = await apiCall(action, payload, options);
      return { ok: true, data: res, error: null, code: null };
    } catch (err) {
      return { ok: false, data: null, error: err.message, code: err.code || 'SERVER' };
    }
  }
};

/**
 * Helper kirimRequest: Mengembalikan objek { ok, data, error, code } tanpa melempar exception.
 */
export async function kirimRequest(action, payload = {}, options = {}) {
  return api.post(action, payload, options);
}




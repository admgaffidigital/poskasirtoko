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

// Cache respons in-memory di sisi klien untuk query baca (read queries)
const memoryApiCache = new Map();

// Koleksi request yang sedang berjalan untuk deduplikasi request identik (In-Flight Request Coalescing)
const inFlightRequests = new Map();

// Aksi yang dapat di-cache dengan aman (TTL dalam milidetik)
const CACHE_CONFIG = {
  'kategori.list': 120000,   // 2 menit
  'pengaturan.get': 180000,  // 3 menit
  'produk.list': 60000,      // 1 menit (katalog instan per filter & paginasi)
  'produk.detail': 60000,    // 1 menit
  'pelanggan.list': 60000,   // 1 menit
  'pelanggan.detail': 60000, // 1 menit
  'supplier.list': 60000,    // 1 menit
  'hadiah.list': 60000,      // 1 menit
  'user.list': 45000,        // 45 detik
  'auth.me': 20000,          // 20 detik
  'sistem.status': 30000     // 30 detik
};

// Pola mutasi data yang otomatis mengosongkan cache terkait secara instan
const MUTATION_PATTERNS = [
  { trigger: 'kategori.', target: 'kategori.' },
  { trigger: 'produk.', target: 'produk.' },
  { trigger: 'penjualan.', target: 'produk.' },     // penjualan mengurangi stok produk
  { trigger: 'penjualan.', target: 'pelanggan.' },  // penjualan mempengaruhi poin/piutang
  { trigger: 'pembelian.', target: 'produk.' },     // pembelian menambah stok produk
  { trigger: 'pembelian.', target: 'supplier.' },   // pembelian mempengaruhi hutang supplier
  { trigger: 'opname.', target: 'produk.' },        // opname menyesuaikan stok
  { trigger: 'retur.', target: 'produk.' },         // retur mengembalikan stok
  { trigger: 'pelanggan.', target: 'pelanggan.' },
  { trigger: 'supplier.', target: 'supplier.' },
  { trigger: 'hadiah.', target: 'hadiah.' },
  { trigger: 'hadiah.', target: 'pelanggan.' },
  { trigger: 'pengaturan.', target: 'pengaturan.' },
  { trigger: 'user.', target: 'user.' },
  { trigger: 'auth.logout', target: '' },           // bersihkan seluruh cache
  { trigger: 'auth.login', target: '' }             // bersihkan seluruh cache
];

/**
 * Hapus entri cache API (semua atau berdasarkan awalan aksi)
 * @param {string} [prefix=null]
 */
export function invalidateApiCache(prefix = null) {
  if (!prefix) {
    memoryApiCache.clear();
    return;
  }
  for (const key of memoryApiCache.keys()) {
    const act = key.split('::')[0] || '';
    if (act.startsWith(prefix) || key.startsWith(prefix)) {
      memoryApiCache.delete(key);
    }
  }
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

  // Jika ini aksi mutasi (create/update/delete), hapus cache terkait seketika
  MUTATION_PATTERNS.forEach(({ trigger, target }) => {
    if (action.startsWith(trigger) && !action.endsWith('.list') && !action.endsWith('.get')) {
      invalidateApiCache(target);
    }
  });

  if (!navigator.onLine) {
    throw new ApiError(
      'Tidak ada koneksi internet. Pastikan perangkat Anda terhubung ke jaringan.',
      'OFFLINE'
    );
  }

  // Ambil token dari options atau localStorage (dan bersihkan dari kutip ganda bila ada)
  let token = options.token;
  if (!token && typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('pos_token') || '';
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try { token = JSON.parse(raw); } catch { token = raw; }
    } else {
      token = raw;
    }
  }
  token = (token || '').trim();

  // Periksa cache in-memory untuk aksi baca aman (read queries)
  const isCacheable = !options.skipCache && !!CACHE_CONFIG[action];
  const payloadStr = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '';
  const cacheKey = isCacheable ? `${action}::${token}::${payloadStr}` : null;

  if (isCacheable && memoryApiCache.has(cacheKey)) {
    const entry = memoryApiCache.get(cacheKey);
    if (Date.now() < entry.expiry) {
      return entry.data;
    }
    memoryApiCache.delete(cacheKey);
  }

  // Deduplikasi: Jika request identik sedang berjalan di jaringan, bagikan Promise (In-Flight Coalescing)
  if (isCacheable && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const timeoutMs = options.timeoutMs || CONFIG.API_TIMEOUT_MS || 30000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody = JSON.stringify({
    action,
    token,
    payload
  });

  const fetchPromise = (async () => {
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

      // Periksa format respons seragam: { ok, data, error, code }
      if (!data || typeof data !== 'object') {
        throw new ApiError('Format respons server tidak sesuai standar.', 'INVALID_RESPONSE');
      }

      if (data.ok === true) {
        if (isCacheable) {
          memoryApiCache.set(cacheKey, {
            data: data.data,
            expiry: Date.now() + CACHE_CONFIG[action]
          });
        }
        return data.data;
      } else {
        // Lempar error terkontrol dari backend
        const errMsg = data.error || 'Terjadi kesalahan pada permintaan server.';
        const errCode = data.code || 'SERVER';
        throw new ApiError(errMsg, errCode, data.data);
      }
    } catch (err) {
      clearTimeout(timer);

      if (err instanceof ApiError) {
        throw err;
      }

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
    } finally {
      clearTimeout(timer);
      if (cacheKey) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (cacheKey) {
    inFlightRequests.set(cacheKey, fetchPromise);
  }

  return await fetchPromise;
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




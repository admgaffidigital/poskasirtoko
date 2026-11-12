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

/**
 * Panggil aksi backend Apps Script
 * @param {string} action Nama aksi (cth: "sistem.ping", "auth.login", "produk.list")
 * @param {Object} [payload={}] Data yang dikirim
 * @param {Object} [options={}] Opsi tambahan (timeoutMs, token)
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
  const timeoutMs = options.timeoutMs || CONFIG.API_TIMEOUT_MS || 30000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody = JSON.stringify({
    action,
    token,
    payload
  });

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
  }
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



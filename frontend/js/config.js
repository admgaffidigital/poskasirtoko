/**
 * Konfigurasi Aplikasi POS Kasir Toko Bangunan
 * Catatan: URL Web App Google Apps Script aman di-commit karena bukan rahasia (akses dijaga oleh token sesi).
 */

const LOCAL_OVERRIDE_URL = typeof localStorage !== 'undefined' ? localStorage.getItem('pos_override_api_url') : null;

export const CONFIG = {
  APP_NAME: 'POS Kasir Toko Bangunan',
  APP_SHORT_NAME: 'POS Toko',
  VERSION: '0.0.1',
  // URL deployment default (dapat disesuaikan atau diubah lewat menu Pengaturan > Sistem di UI)
  API_URL: LOCAL_OVERRIDE_URL || '',
  API_TIMEOUT_MS: 30000,
  DEBUG: true
};

/**
 * Update URL API di runtime dan simpan di localStorage
 */
export function setApiUrl(newUrl) {
  if (typeof localStorage !== 'undefined') {
    if (newUrl) {
      localStorage.setItem('pos_override_api_url', newUrl.trim());
      CONFIG.API_URL = newUrl.trim();
    } else {
      localStorage.removeItem('pos_override_api_url');
      CONFIG.API_URL = '';
    }
  }
}

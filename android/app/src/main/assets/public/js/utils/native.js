/**
 * native.js — Integrasi Fitur Native Android (Capacitor & Web APIs)
 * Meliputi: Hardware Back Button, Dynamic StatusBar, Haptic Feedback, Splash Screen
 */

import { showToast } from './ui.js';

let lastBackPressTime = 0;

/**
 * Umpan Balik Getaran Taktil (Haptic Feedback) POS
 * Menggunakan Web Vibration API yang didukung penuh di Android WebView & Chrome
 */
export const haptic = {
  /** Sentuhan ringan: klik tombol, ganti tab, navigasi (10ms) */
  light() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (_) {}
  },

  /** Sentuhan sedang: tambah barang ke keranjang, pilih kategori (25ms) */
  medium() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
      }
    } catch (_) {}
  },

  /** Sentuhan sukses: transaksi selesai, cetak nota, data tersimpan */
  success() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([15, 50, 25]);
      }
    } catch (_) {}
  },

  /** Peringatan / Stok Habis / Gagal input */
  warning() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([35, 45, 35]);
      }
    } catch (_) {}
  },

  /** Hapus item / Void transaksi */
  delete() {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([20, 60]);
      }
    } catch (_) {}
  }
};

/**
 * Sinkronisasi Status Bar Android dengan Tema Aplikasi (Terang / Gelap)
 * @param {'light'|'dark'} [mode]
 */
export async function syncStatusBarWithTheme(mode) {
  const currentTheme = mode || document.documentElement.getAttribute('data-theme') || 'light';
  const isDark = currentTheme === 'dark';

  // 1. Update HTML meta theme-color untuk browser & PWA
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#0f172a' : '#ffffff');
  }

  // 2. Update Android Native StatusBar via Capacitor Plugin jika tersedia
  try {
    const capacitor = window.Capacitor;
    if (capacitor) {
      const StatusBar = capacitor.Plugins?.StatusBar;
      if (StatusBar) {
        await StatusBar.setBackgroundColor({
          color: isDark ? '#0f172a' : '#ffffff'
        });
        // Style 'DARK' = ikon putih (untuk latar gelap); Style 'LIGHT' = ikon hitam (untuk latar terang)
        await StatusBar.setStyle({
          style: isDark ? 'DARK' : 'LIGHT'
        });
      }
    }
  } catch (err) {
    // Abaikan jika tidak di platform native
  }
}

/**
 * Menghilangkan Native Splash Screen dengan transisi halus
 */
export function hideNativeSplashScreen() {
  try {
    const capacitor = window.Capacitor;
    if (capacitor) {
      const SplashScreen = capacitor.Plugins?.SplashScreen;
      if (SplashScreen && typeof SplashScreen.hide === 'function') {
        SplashScreen.hide({ fadeOutDuration: 300 });
      }
    }
  } catch (_) {}
}

/**
 * Inisialisasi Handler Tombol Fisik / Gestur Back Android
 * Mengikuti hierarki UX native:
 * 1. Tutup modal/dialog/sheet aktif
 * 2. Kembalikan tab keranjang POS ke katalog jika di mobile
 * 3. Kembali ke riwayat hash sebelumnya jika ada
 * 4. Jika di halaman utama (root), tekan 2x dalam 2 detik untuk keluar
 */
export function setupHardwareBackButton() {
  const capacitor = window.Capacitor;
  if (!capacitor) return;

  try {
    const App = capacitor.Plugins?.App;
    if (!App || typeof App.addListener !== 'function') return;

    App.addListener('backButton', () => {
      // Prioritas 1: Tutup modal atau dialog bottom-sheet yang terbuka
      const activeModal = document.querySelector('.overlay:not(.keluar)');
      if (activeModal) {
        const btnClose = activeModal.querySelector('.btn-close-modal, .btn-batal-dialog, .btn-modal-tutup, .btn-cancel, .btn-batal-void');
        if (btnClose) {
          haptic.light();
          btnClose.click();
          return;
        }
        activeModal.classList.add('keluar');
        setTimeout(() => {
          if (activeModal.parentElement) activeModal.remove();
        }, 200);
        haptic.light();
        return;
      }

      // Prioritas 2: Di modul POS mobile, jika sedang di tab keranjang, kembali ke katalog
      const posWrapper = document.getElementById('pos-wrapper');
      if (posWrapper && posWrapper.classList.contains('mobile-show-cart')) {
        const btnBackToCatalog = document.getElementById('btn-back-to-catalog');
        if (btnBackToCatalog) {
          haptic.light();
          btnBackToCatalog.click();
          return;
        }
      }

      // Prioritas 3: Jika bukan di rute utama (#/pos atau kosong), kembali ke rute sebelumnya
      const hash = window.location.hash || '#/pos';
      if (hash !== '#/pos' && hash !== '#' && hash !== '') {
        haptic.light();
        window.history.back();
        return;
      }

      // Prioritas 4: Jika di halaman utama, double-tap back untuk keluar dari aplikasi
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        App.exitApp();
      } else {
        lastBackPressTime = now;
        haptic.medium();
        showToast('Tekan sekali lagi untuk keluar dari aplikasi', 'info', 2000);
      }
    });
  } catch (err) {
    console.warn('Gagal menginisialisasi listener backButton Capacitor:', err);
  }
}

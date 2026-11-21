/**
 * native.js — Integrasi Fitur Native Android (Capacitor & Web/PWA APIs)
 * Meliputi: Hardware/Gesture Back Button (LIFO Berurutan + Dialog Konfirmasi Keluar),
 * Dynamic StatusBar, Haptic Feedback, dan Splash Screen
 */

import { showToast, showModal, closeTopOverlay, ICONS } from './ui.js';

let isBackHandlerInitialized = false;
let isExitDialogOpen = false;
let isExitingApp = false;
let navControllerRef = null;

function isNativeCapacitor() {
  return Boolean(
    typeof window !== 'undefined' &&
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );
}

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
 * Sinkronisasi Status Bar Android dengan Tema Aplikasi (Terang / Hangat / Gelap)
 * @param {'light'|'warm'|'dark'} [mode]
 */
export async function syncStatusBarWithTheme(mode) {
  const currentTheme = mode || document.documentElement.getAttribute('data-theme') || 'light';
  const isDark = currentTheme === 'dark';
  const bgColor = isDark ? '#0f172a' : (currentTheme === 'warm' ? '#fffdf8' : '#ffffff');

  // 1. Update HTML meta theme-color untuk browser & PWA
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', bgColor);
  }

  // 2. Update Android Native StatusBar via Capacitor Plugin jika tersedia
  try {
    const capacitor = window.Capacitor;
    if (capacitor) {
      const StatusBar = capacitor.Plugins?.StatusBar;
      if (StatusBar) {
        await StatusBar.setBackgroundColor({
          color: bgColor
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
 * Hitung jumlah item aktif di keranjang POS (untuk peringatan ramah saat keluar)
 */
function hitungItemKeranjangAktif() {
  const badge = document.getElementById('cart-item-count');
  if (badge) {
    const n = parseInt(badge.textContent || '0', 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  try {
    const raw = localStorage.getItem('pos_active_cart');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length;
    }
  } catch (_) {}
  return 0;
}

/**
 * Tutup aplikasi secara bersih (APK Android / PWA / Web)
 */
function keluarDariAplikasi() {
  isExitingApp = true;
  haptic.medium();

  // 1. Jalur Native Android Bridge (MainActivity.java -> finishAndRemoveTask)
  if (window.AndroidApp && typeof window.AndroidApp.exitApp === 'function') {
    window.AndroidApp.exitApp();
    return;
  }

  // 2. Jalur Capacitor App Plugin
  const CapApp = window.Capacitor?.Plugins?.App;
  if (CapApp && typeof CapApp.exitApp === 'function') {
    CapApp.exitApp();
    return;
  }

  // 3. Jalur PWA / Browser Web
  try {
    window.close();
  } catch (_) {}
  setTimeout(() => {
    try {
      window.history.go(-2);
    } catch (_) {
      window.history.back();
    }
  }, 60);
}

/**
 * Tampilkan Dialog Konfirmasi Keluar Aplikasi yang profesional
 */
export function tampilkanDialogKeluarAplikasi() {
  const existing = document.querySelector('.overlay[data-modal-id="exit-confirm"]:not(.keluar)');
  if (existing) {
    if (typeof existing._closeModal === 'function') existing._closeModal();
    return;
  }
  if (isExitDialogOpen) return;
  isExitDialogOpen = true;
  haptic.medium();

  const jmlKeranjang = hitungItemKeranjangAktif();
  const pesanUtama = jmlKeranjang > 0
    ? `Masih ada <strong>${jmlKeranjang} item</strong> di keranjang belanja yang belum diselesaikan. Apakah Anda yakin ingin menutup aplikasi?`
    : 'Apakah Anda yakin ingin menutup aplikasi <strong>POS Kasir Toko</strong>?';

  const modal = showModal({
    title: '',
    size: 'sm',
    isSheet: false,
    modalId: 'exit-confirm',
    onClose: () => {
      isExitDialogOpen = false;
    },
    body: `
      <div class="row" style="align-items: flex-start; gap: var(--sp-3); padding: var(--sp-1) 0;">
        <div style="width: 44px; height: 44px; border-radius: var(--radius-full); background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; flex-shrink: 0;">
          ${ICONS.logout}
        </div>
        <div class="stack" style="gap: 4px; flex: 1; min-width: 0;">
          <div class="fw-bold text-base" style="color: var(--text);">Keluar dari Aplikasi?</div>
          <div class="text-sm text-muted" style="line-height: 1.5;">${pesanUtama}</div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-keluar-app">Batal</button>
        <button type="button" class="btn btn-danger btn-sm" id="btn-konfirmasi-keluar-app" style="font-weight: var(--fw-semibold);">Ya, Tutup Aplikasi</button>
      </div>
    `
  });

  const headerTitle = modal.el.querySelector('.dialog-title');
  if (headerTitle) headerTitle.style.display = 'none';

  modal.el.querySelector('#btn-batal-keluar-app')?.addEventListener('click', () => {
    haptic.light();
    modal.close();
  });

  modal.el.querySelector('#btn-konfirmasi-keluar-app')?.addEventListener('click', () => {
    modal.close();
    keluarDariAplikasi();
  });
}

/**
 * Tutup dropdown terbuka pada halaman utama (di luar modal) jika ada
 */
function tutupDropdownHalamanAktif() {
  const openCatPicker = document.querySelector('#page-content .cat-picker.is-open');
  if (openCatPicker) {
    openCatPicker.classList.remove('is-open');
    const panel = openCatPicker.querySelector('.cat-picker-panel');
    if (panel) panel.hidden = true;
    return true;
  }

  const openAutocomplete = Array.from(document.querySelectorAll('#page-content .autocomplete-dropdown')).find(
    (el) => el.style.display === 'block'
  );
  if (openAutocomplete) {
    openAutocomplete.style.display = 'none';
    return true;
  }

  return false;
}

/**
 * Handler terpusat tombol/gestur Kembali (LIFO Berurutan):
 * 1. Jika dialog konfirmasi keluar sudah terbuka -> tutup dialognya & tetap di aplikasi
 * 2. Tutup dropdown/modal/dialog/bottom-sheet paling atas (1 per 1 dari atas ke bawah)
 *    - Jika modal wajib (Login / Wajib Ganti PIN) -> tampilkan dialog keluar aplikasi
 * 3. Tutup Sidebar Drawer Mobile jika sedang terbuka
 * 4. Tutup dropdown terbuka di halaman utama
 * 5. Di POS Kasir Mobile tab Keranjang -> kembali ke tab Katalog
 * 6. Mundur 1 langkah pada stack navigasi terurut (bebas lompat-lompat)
 * 7. Di halaman utama (#/pos) -> tampilkan Dialog Konfirmasi Keluar Aplikasi
 */
export function tanganiTombolKembali() {
  // 1. Jika dialog konfirmasi keluar sedang terbuka -> tutup saja (batal keluar)
  const exitModal = document.querySelector('.overlay[data-modal-id="exit-confirm"]:not(.keluar)');
  if (exitModal) {
    haptic.light();
    if (typeof exitModal._closeModal === 'function') exitModal._closeModal();
    return;
  }

  // 2. Tutup lapisan overlay paling atas secara berurutan (LIFO)
  const overlayStatus = closeTopOverlay();
  if (overlayStatus === 'closed_dropdown' || overlayStatus === 'closed_modal') {
    haptic.light();
    return;
  }
  if (overlayStatus === 'mandatory') {
    tampilkanDialogKeluarAplikasi();
    return;
  }

  // 3. Tutup Sidebar Drawer Mobile jika terbuka
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl && sidebarEl.classList.contains('is-mobile-open')) {
    sidebarEl.classList.remove('is-mobile-open');
    document.getElementById('sidebar-backdrop')?.classList.remove('is-visible');
    haptic.light();
    return;
  }

  // 3.5. Jika mode "Tandai & Pilih" (Multi-Select) sedang aktif -> keluar dari mode pilih dulu
  if (typeof window !== 'undefined' && typeof window.__posCancelSelectMode === 'function') {
    const cancelled = window.__posCancelSelectMode();
    if (cancelled) {
      haptic.light();
      return;
    }
  }

  // 4. Tutup dropdown yang sedang terbuka di halaman aktif
  if (tutupDropdownHalamanAktif()) {
    haptic.light();
    return;
  }

  // 5. Di POS Kasir Mobile, jika sedang di tampilan Keranjang -> kembali ke Katalog
  const posWrapper = document.getElementById('pos-wrapper');
  if (posWrapper && posWrapper.getAttribute('data-mobile-view') === 'cart') {
    const btnBackToCatalog = document.getElementById('btn-back-to-catalog');
    if (btnBackToCatalog) {
      haptic.light();
      btnBackToCatalog.click();
      return;
    }
  }

  // 6. Mundur 1 langkah secara berurutan sesuai stack navigasi (bebas lompat-lompat)
  if (navControllerRef && typeof navControllerRef.canGoBack === 'function' && navControllerRef.canGoBack()) {
    haptic.light();
    navControllerRef.goBack();
    return;
  }

  const hash = (window.location.hash || '#/pos').split('?')[0];
  if (hash !== '#/pos' && hash !== '#' && hash !== '') {
    haptic.light();
    if (navControllerRef && typeof navControllerRef.goToRoot === 'function') {
      navControllerRef.goToRoot();
    } else {
      window.location.hash = '#/pos';
    }
    return;
  }

  // 7. Sudah di halaman utama (#/pos) -> tampilkan Dialog Konfirmasi Keluar Aplikasi
  tampilkanDialogKeluarAplikasi();
}

/**
 * Inisialisasi Handler Tombol Fisik / Gestur Back Android (APK Capacitor + PWA + Mobile Web)
 * @param {Object} [navController] Pengendali stack navigasi dari App
 */
export function setupHardwareBackButton(navController = null) {
  if (navController) {
    navControllerRef = navController;
  }
  if (isBackHandlerInitialized) return;
  isBackHandlerInitialized = true;

  // Jalur 1: Native Android APK via Capacitor App Plugin
  if (isNativeCapacitor()) {
    try {
      const App = window.Capacitor?.Plugins?.App;
      if (App && typeof App.addListener === 'function') {
        App.addListener('backButton', () => {
          tanganiTombolKembali();
        });
      }
    } catch (err) {
      console.warn('Gagal menginisialisasi listener backButton Capacitor:', err);
    }
    return;
  }

  // Jalur 2: Web Browser & PWA (Android Chrome / Standalone) dengan History Sentinel tunggal
  // Menjamin gestur/tombol Back menutup modal, drawer, keranjang, dan halaman secara berurutan
  if (typeof window !== 'undefined' && window.history && typeof window.history.pushState === 'function') {
    const armBackGuard = () => {
      if (isExitingApp) return;
      const curPath = (navControllerRef && typeof navControllerRef.getCurrentPath === 'function')
        ? navControllerRef.getCurrentPath()
        : (window.location.hash || '#/pos');
      try {
        if (!window.history.state || !window.history.state.__posBackGuard) {
          window.history.pushState({ __posBackGuard: true, path: curPath }, '', curPath);
        }
      } catch (_) {}
    };

    // Pasang guard sentinel awal saat aplikasi siap
    armBackGuard();

    window.addEventListener('popstate', () => {
      if (isExitingApp) return;
      // Pasang ulang guard agar tekanan Back berikutnya tetap tertangkap berurutan
      armBackGuard();
      tanganiTombolKembali();
    });
  }
}



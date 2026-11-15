/**
 * app.js — Router & Shell Aplikasi POS Kasir Toko Bangunan
 * Vanilla JS (ES Modules) tanpa build step
 */

import { CONFIG, setApiUrl } from './config.js';
import { ROUTES, cariRute } from './routes.js';
import { apiCall, invalidateApiCache } from './api.js';
import { store } from './state.js';
import {
  ICONS,
  showToast,
  showModal,
  showConfirm,
  initTheme,
  toggleTheme,
  toggleFontSize
} from './utils/ui.js';
import { $, $$, renderSkeleton, renderEmpty, renderError } from './utils/dom.js';
import { formatTanggal, escapeHtml, formatRupiah } from './utils/format.js';

// Modul-modul Fase 1, 2, 3, 4, & 5
import { pastikanLogin, konfirmasiLogout, tampilkanModalLogin, tampilkanDialogWajibGantiPin, tutupModalAuth } from './modules/auth.js';
import { renderKategoriModule } from './modules/kategori.js';
import { renderProdukModule } from './modules/produk.js';
import { renderPengaturanModule } from './modules/pengaturan.js';
import { renderUsersModule } from './modules/users.js';
import { renderPosModule } from './modules/pos.js';
import { renderSupplierModule } from './modules/supplier.js';
import { renderPembelianModule } from './modules/pembelian.js';
import { renderKartuStokModule } from './modules/kartu-stok.js';
import { renderOpnameModule } from './modules/opname.js';
import { renderHutangPiutangModule } from './modules/hutang-piutang.js';
import { renderReturModule } from './modules/retur.js';
import { renderPelangganModule } from './modules/pelanggan.js';
import { renderLoyaltiModule } from './modules/loyalti.js';
import { renderPriceTagModule } from './modules/pricetag.js';
import { renderLaporanModule } from './modules/laporan.js';
import { haptic, syncStatusBarWithTheme, hideNativeSplashScreen, setupHardwareBackButton } from './utils/native.js';
import { tampilkanModalKoneksiPrinter } from './utils/printer.js';

class App {
  constructor() {
    this.currentRoute = null;
  }

  init() {
    initTheme();
    syncStatusBarWithTheme();
    setupHardwareBackButton();
    this.renderShell();
    // Pulihkan status sidebar collapsed pilihan user dari localStorage (Mode Accurate POS)
    try {
      if (localStorage.getItem('pos_sidebar_collapsed') === 'true') {
        $('.app')?.classList.add('sidebar-collapsed');
      }
    } catch (_) {}
    this.updateBrandUI();
    this.bindGlobalEvents();
    this.initRouter();
    this.registerServiceWorker();
    hideNativeSplashScreen();
    window.bukaKoneksiPrinter = tampilkanModalKoneksiPrinter;

    // Pantau perubahan identitas toko & pengaturan secara reaktif
    store.subscribe('toko', (toko) => this.updateBrandUI(toko));
    store.subscribe('pengaturan', () => this.updateBrandUI());

    // Sinkronkan status koneksi online/offline pada badge net-pill
    const pill = $('#net-pill');
    if (pill) {
      if (navigator.onLine) {
        pill.classList.remove('is-offline');
      } else {
        pill.classList.add('is-offline');
      }
    }

    // Ambil identitas toko & pengaturan dari server
    this.muatPengaturanToko();

    // Verifikasi sesi saat aplikasi dimuat
    const token = store.get('token');
    if (token) {
      apiCall('auth.me', {})
        .then((res) => {
          store.set('user', res.user);
          if (res.pengaturan) store.set('pengaturan', res.pengaturan);
          if (res.toko) store.setToko(res.toko);
          this.updateUserUI(res.user);
          this.updateBrandUI();
          this.hangatkanCacheLatarBelakang();
          if (res.user.wajib_ganti_pin) {
            tampilkanDialogWajibGantiPin(token, (u) => {
              this.cekIzinDanRender(this.currentRoute, u);
            });
          }
        })
        .catch(() => {
          store.clearUserSession();
          this.updateUserUI(null);
          tutupModalAuth();
          const rutePublik = ['sistem', 'desainsistem'];
          if (this.currentRoute && !rutePublik.includes(this.currentRoute.id)) {
            pastikanLogin((u) => {
              this.cekIzinDanRender(this.currentRoute, u);
            });
          }
        });
    } else {
      this.updateUserUI(null);
    }
  }

  async muatPengaturanToko() {
    try {
      const res = await apiCall('pengaturan.get', {});
      if (res && res.pengaturan) {
        store.set('pengaturan', res.pengaturan);
        store.setToko({
          nama: res.pengaturan.toko_nama,
          alamat: res.pengaturan.toko_alamat,
          hp: res.pengaturan.toko_hp,
          nota_footer: res.pengaturan.nota_footer
        });
        this.updateBrandUI();
      }
    } catch (e) {
      // Jika offline atau belum login, gunakan identitas dari cache lokal
    }
  }

  /**
   * Pemanasan cache in-memory di latar belakang saat CPU idle
   * Memastikan pembukaan modul POS Kasir, Katalog, dan Satuan berlangsung instan (0ms)
   */
  hangatkanCacheLatarBelakang() {
    const warmup = () => {
      if (!store.get('token')) return;
      apiCall('kategori.list', {}).catch(() => {});
      apiCall('produk.list', { page: 1, limit: 30, sort: 'terbaru' }).catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warmup, { timeout: 2500 });
    } else {
      setTimeout(warmup, 800);
    }
  }

  updateBrandUI(toko) {
    const t = toko || store.get('toko') || {};
    const peng = store.get('pengaturan') || {};
    const nama = (t.nama || peng.toko_nama || 'POS Toko').trim();
    // Subtitle ringkas & proporsional untuk header brand navigasi aplikasi (bukan alamat jalan yang panjang)
    const sub = (nama && nama !== 'POS Toko') ? 'POS Kasir Toko' : 'Sistem Kasir & Stok';

    const elNama = $('#brand-nama-toko');
    if (elNama) {
      elNama.textContent = nama;
      elNama.title = nama;
    }

    const elSub = $('#brand-sub-toko');
    if (elSub) {
      elSub.textContent = sub;
      elSub.title = sub;
    }

    // Perbarui judul tab/browser secara dinamis
    if (this.currentRoute && this.currentRoute.title) {
      document.title = `${this.currentRoute.title} | ${nama}`;
    } else {
      document.title = `${nama} - POS Kasir`;
    }
  }

  /**
   * Fitur Sinkronisasi Data Global (Reload / Refresh Aplikasi)
   * Menyinkronkan identitas toko, pengaturan dinamis, sesi user, dan me-render ulang modul aktif
   */
  async sinkronkanDataGlobal() {
    if (this._isSyncing) return;
    this._isSyncing = true;

    const btnTop = $('#btn-sync-top');
    const btnSidebar = $('#btn-sync-sidebar');
    const btnTile = $('#btn-sync-tile');
    const btnSistem = $('#btn-sync-sistem');

    [btnTop, btnSidebar, btnTile, btnSistem].forEach((b) => b?.classList.add('is-spinning'));

    haptic.medium();
    showToast('Menyinkronkan data dari server...', 'info', 2000);

    try {
      if (!navigator.onLine) {
        showToast('Sedang mode offline. Memuat data dari cache lokal...', 'warning', 3000);
        if (this.currentRoute) this.renderPage(this.currentRoute);
        return;
      }

      // Kosongkan cache API in-memory agar seluruh request memuat data segar dari server
      invalidateApiCache();

      // 1. Periksa pembaruan Service Worker PWA di latar belakang
      if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => { });
      }

      // 2. Ambil identitas toko & pengaturan terbaru dari server
      await this.muatPengaturanToko();

      // 3. Verifikasi & sinkronkan profil user jika sedang login
      const token = store.get('token');
      if (token) {
        try {
          const res = await apiCall('auth.me', {});
          if (res && res.user) {
            store.set('user', res.user);
            if (res.pengaturan) store.set('pengaturan', res.pengaturan);
            if (res.toko) store.setToko(res.toko);
            this.updateUserUI(res.user);
            this.updateBrandUI();
          }
        } catch (authErr) {
          console.warn('Sync auth error:', authErr);
        }
      }

      // 4. Render ulang halaman aktif agar data baru segera tampil
      if (this.currentRoute) {
        this.renderPage(this.currentRoute);
      }

      haptic.success();
      showToast('Sinkronisasi data berhasil! Data terbaru telah dimuat.', 'success', 2500);
    } catch (err) {
      console.error('Gagal sinkronisasi data global:', err);
      showToast('Gagal sinkronisasi: ' + (err.message || 'Koneksi terganggu'), 'error', 3500);
    } finally {
      this._isSyncing = false;
      [btnTop, btnSidebar, btnTile, btnSistem].forEach((b) => b?.classList.remove('is-spinning'));
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').then((registration) => {
        window.swRegistration = registration;

        // Cek jika sudah ada worker baru yang menunggu
        if (registration.waiting) {
          window.swWaitingWorker = registration.waiting;
          window.appHasUpdate = true;
          this.segarkanBannerUpdate();
        }

        // Pantau jika ada worker baru yang sedang diinstal
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.swWaitingWorker = installingWorker;
              window.appHasUpdate = true;
              showToast('Pembaruan aplikasi tersedia! Ketuk tombol "Perbarui & Restart" untuk menerapkan.', 'warning');
              this.segarkanBannerUpdate();
            }
          };
        };
      }).catch((err) => {
        console.warn('Registrasi Service Worker gagal:', err);
      });

      // Deteksi jika service worker controller berubah
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }

  isAppInstalled() {
    const isCapacitor = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return isCapacitor || isStandalone;
  }

  segarkanBannerUpdate() {
    const banner = document.getElementById('banner-app-install-update');
    if (banner) {
      const isDetailed = banner.getAttribute('data-detailed') === 'true';
      banner.outerHTML = this.renderBannerAppHtml(isDetailed);
      this.pasangEventBanner(document.getElementById('banner-app-install-update'));
    }
  }

  renderBannerAppHtml(isDetailed = false) {
    const isInstalled = this.isAppInstalled();
    const hasUpdate = !!window.appHasUpdate;

    if (!isInstalled) {
      // KONDISI 1: Belum Diinstal (Dibuka lewat Web Browser biasa)
      return `
        <div id="banner-app-install-update" data-detailed="${isDetailed}" class="card card-body stack" style="background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%); border: 1px solid var(--border); border-left: 4px solid var(--primary);">
          <div class="row-between" style="flex-wrap: wrap; gap: var(--sp-3); align-items: center;">
            <div class="row" style="gap: var(--sp-3); align-items: center;">
              <div style="background: var(--primary); color: #fff; width: 44px; height: 44px; border-radius: var(--radius-xl); display: grid; place-items: center; flex-shrink: 0; box-shadow: 0 4px 10px rgba(232, 89, 12, 0.3);">
                ${ICONS.store}
              </div>
              <div>
                <div class="fw-bold" style="font-size: var(--fs-md);">Pasang Aplikasi Android (APK & PWA)</div>
                <div class="text-xs text-muted">Jalankan POS Kasir layar penuh layaknya aplikasi native di smartphone Anda</div>
              </div>
            </div>
            <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
              <a href="./download/poskasirtoko.apk" download="poskasirtoko.apk" class="btn btn-primary btn-sm" style="border-radius: var(--radius-full); text-decoration: none; font-weight: var(--fw-semibold); display: inline-flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                <span>Unduh File APK (.apk)</span>
              </a>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-pasang-pwa" style="border-radius: var(--radius-full); display: inline-flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>
                <span>Pasang via Chrome (PWA)</span>
              </button>
            </div>
          </div>

          ${isDetailed ? `
            <div style="background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); font-size: var(--fs-xs); line-height: 1.6; border: 1px solid var(--border); margin-top: var(--sp-2);">
              <div class="fw-bold text-sm text-primary" style="margin-bottom: 4px;">Pilihan 1: Unduh & Pasang File APK Android (Paling Mudah & Pasti Berhasil)</div>
              1. Ketuk tombol <strong>"Unduh File APK (.apk)"</strong> di atas untuk mengunduh <code>poskasirtoko.apk</code>.<br>
              2. Buka file hasil unduhan di HP Android Anda.<br>
              3. Jika muncul konfirmasi keamanan, aktifkan/izinkan <em>"Pasang aplikasi dari sumber ini"</em> (fitur standar Android untuk APK direct download di luar Play Store).<br>
              4. Aplikasi akan langsung terpasang sebagai aplikasi Android native dengan performa optimal.<br>
              <div class="divider" style="margin: var(--sp-2) 0;"></div>
              <div class="fw-bold text-sm text-primary" style="margin-bottom: 4px;">Pilihan 2: Pasang PWA di Google Chrome HP</div>
              1. Buka Chrome di HP Anda &gt; ketuk ikon <strong>titik tiga (⋮)</strong> di pojok kanan atas.<br>
              2. Pilih menu <strong>"Tambahkan ke Layar Utama"</strong> (<em>Add to Home screen</em>) atau <strong>"Instal aplikasi"</strong>.<br>
              3. Ikon POS Toko akan muncul di beranda HP Anda dan berjalan fullscreen tanpa bar URL browser.
            </div>
          ` : ''}
        </div>
      `;
    }

    // KONDISI 2: Sudah Terpasang sebagai Aplikasi Native (Capacitor / PWA Standalone)
    if (hasUpdate) {
      // Kasus A: Ada Pembaruan Siap Diterapkan!
      return `
        <div id="banner-app-install-update" data-detailed="${isDetailed}" class="card card-body stack" style="background: linear-gradient(135deg, rgba(232, 89, 12, 0.08) 0%, var(--surface-2) 100%); border: 1px solid var(--primary); border-left: 4px solid var(--primary);">
          <div class="row-between" style="flex-wrap: wrap; gap: var(--sp-3); align-items: center;">
            <div class="row" style="gap: var(--sp-3); align-items: center;">
              <div style="background: var(--primary); color: #fff; width: 44px; height: 44px; border-radius: var(--radius-xl); display: grid; place-items: center; flex-shrink: 0; box-shadow: 0 4px 10px rgba(232, 89, 12, 0.35);">
                ${ICONS.store}
              </div>
              <div>
                <div class="row" style="gap: 6px; align-items: center;">
                  <span class="fw-bold" style="font-size: var(--fs-md);">Pembaruan Sistem Siap Diterapkan!</span>
                  <span class="badge badge-warning badge-sm">Update Siap</span>
                </div>
                <div class="text-xs text-muted" style="margin-top: 2px;">Versi baru telah diunduh di latar belakang. Ketuk tombol untuk memperbarui tanpa perlu instal ulang APK.</div>
              </div>
            </div>
            <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-inapp-update-restart" style="border-radius: var(--radius-full); font-weight: var(--fw-semibold); display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(232, 89, 12, 0.35);">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                <span>Perbarui & Restart Aplikasi</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Kasus B: Aplikasi Up-To-Date & Terpasang Aktif
    return `
      <div id="banner-app-install-update" data-detailed="${isDetailed}" class="card card-body stack" style="background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%); border: 1px solid var(--border); border-left: 4px solid var(--green-500);">
        <div class="row-between" style="flex-wrap: wrap; gap: var(--sp-3); align-items: center;">
          <div class="row" style="gap: var(--sp-3); align-items: center;">
            <div style="background: var(--surface-3); color: var(--primary); width: 44px; height: 44px; border-radius: var(--radius-xl); display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--border);">
              ${ICONS.store}
            </div>
            <div>
              <div class="row" style="gap: 6px; align-items: center;">
                <span class="fw-bold" style="font-size: var(--fs-md);">POS Kasir Toko (Aplikasi Terpasang)</span>
                <span class="badge badge-success badge-sm badge-dot">Aktif</span>
              </div>
              <div class="text-xs text-muted" style="margin-top: 2px;">Versi v${CONFIG.VERSION || '1.0.43'} • Berjalan offline dengan performa native</div>
            </div>
          </div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-inapp-check-update" style="border-radius: var(--radius-full); font-weight: var(--fw-medium); display: inline-flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5"/></svg>
              <span>Periksa Pembaruan</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  pasangEventBanner(bannerContainer) {
    if (!bannerContainer) return;

    // Pasang via Chrome PWA
    bannerContainer.querySelector('#btn-pasang-pwa')?.addEventListener('click', () => {
      if (window.deferredPrompt) {
        window.deferredPrompt.prompt();
        window.deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            showToast('Aplikasi berhasil dipasang di layar utama!', 'success');
          }
          window.deferredPrompt = null;
        });
      } else {
        showToast('Untuk memasang PWA: Buka menu titik tiga (⋮) di Chrome & pilih "Tambahkan ke Layar Utama".', 'info');
      }
    });

    // Periksa Pembaruan
    bannerContainer.querySelector('#btn-inapp-check-update')?.addEventListener('click', async () => {
      const btn = bannerContainer.querySelector('#btn-inapp-check-update');
      if (btn) btn.disabled = true;
      showToast('Memeriksa ketersediaan pembaruan...', 'info');

      try {
        if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting || window.swWaitingWorker) {
              window.appHasUpdate = true;
              showToast('Pembaruan baru tersedia! Ketuk tombol "Perbarui & Restart".', 'warning');
              const isDetailed = bannerContainer.getAttribute('data-detailed') === 'true';
              bannerContainer.outerHTML = this.renderBannerAppHtml(isDetailed);
              this.pasangEventBanner(document.getElementById('banner-app-install-update'));
              return;
            }
          }
        }
        showToast(`Aplikasi Anda sudah menggunakan versi paling baru (v${CONFIG.VERSION || '1.0.43'})!`, 'success');
      } catch (err) {
        showToast('Gagal memeriksa pembaruan: ' + err.message, 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // Perbarui & Restart
    bannerContainer.querySelector('#btn-inapp-update-restart')?.addEventListener('click', async () => {
      showToast('Menerapkan pembaruan aplikasi & memuat ulang...', 'info');
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.waiting) {
            reg.waiting.postMessage({ action: 'skipWaiting' });
          }
          if (window.swWaitingWorker) {
            window.swWaitingWorker.postMessage({ action: 'skipWaiting' });
          }
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (e) {
        console.warn('Gagal bersihkan cache update:', e);
      }
      setTimeout(() => {
        window.location.reload(true);
      }, 600);
    });
  }

  renderShell() {
    const appEl = $('#app');
    if (!appEl) return;

    appEl.innerHTML = `
      <div class="app">
        <!-- Backdrop Mobile Sidebar Drawer -->
        <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

        <!-- Sidebar Desktop / Tablet Rail -->
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            <div class="brand-logo" id="brand-logo-sidebar" style="cursor: pointer;" title="Perkecil / Perluas Menu (Mode Accurate POS)">${ICONS.store}</div>
            <div class="brand-text">
              <span id="brand-nama-toko" title="${escapeHtml(store.getNamaToko ? store.getNamaToko() : 'POS Toko')}">${escapeHtml(store.getNamaToko ? store.getNamaToko() : 'POS Toko')}</span>
              <small id="brand-sub-toko">POS Kasir Toko</small>
            </div>
            <button type="button" class="sidebar-toggle-btn" id="btn-toggle-sidebar" title="Perkecil Menu (Mode Ikon Accurate POS)" aria-label="Buka Tutup Side Menu">
              <span class="sidebar-toggle-icon">${ICONS.chevronLeft}</span>
            </button>
          </div>

          <nav class="sidebar-nav" id="sidebar-nav">
            <!-- Nav links akan di-render dinamis -->
          </nav>

          <div class="sidebar-footer">
            <button type="button" class="btn btn-sm btn-icon btn-sync" id="btn-sync-sidebar" title="Sinkronisasi Data Global (F5)" aria-label="Sinkronisasi Data">
              ${ICONS.refresh}
            </button>
            <button type="button" class="btn btn-sm btn-icon" id="btn-theme-sidebar" title="Ubah Tema" aria-label="Ubah Tema">
              ${ICONS.moon}
            </button>
            <button type="button" class="btn btn-sm btn-icon" id="btn-font-sidebar" title="Ukuran Font" aria-label="Ukuran Font">
              <span class="fw-bold" style="font-size: var(--fs-sm);">Aa</span>
            </button>
            <button type="button" class="btn btn-sm btn-ghost grow text-xs" id="btn-user-sidebar" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              Masuk
            </button>
          </div>
        </aside>

        <!-- Main Content Area -->
        <div class="main">
          <!-- Top Bar -->
          <header class="topbar">
            <button type="button" class="btn btn-ghost btn-icon btn-sm btn-sidebar-toggle-top" id="btn-toggle-sidebar-top" title="Buka / Tutup Menu Samping" aria-label="Toggle Side Menu">
              ${ICONS.menu}
            </button>
            <div class="topbar-logo">
              <div class="brand-logo">${ICONS.store}</div>
            </div>
            <h1 class="topbar-title" id="topbar-title">POS Kasir</h1>

            <div class="topbar-actions">
              <span class="badge badge-warning net-pill ${typeof navigator !== 'undefined' && navigator.onLine ? '' : 'is-offline'}" id="net-pill">Offline</span>

              <!-- Tombol Sinkronisasi Data Global (Reload/Refresh) -->
              <button type="button" class="btn btn-ghost btn-icon btn-sm btn-sync" id="btn-sync-top" title="Sinkronisasi & Segarkan Data (F5)" aria-label="Sinkronisasi Data">
                ${ICONS.refresh}
              </button>

              <button type="button" class="btn btn-ghost btn-icon btn-sm" id="btn-theme-top" title="Ubah Tema" aria-label="Ubah Tema">
                ${ICONS.moon}
              </button>

              <button type="button" class="btn btn-ghost btn-icon btn-sm" id="btn-font-top" title="Ukuran Teks" aria-label="Ukuran Teks">
                <span class="fw-bold" style="font-size: var(--fs-sm);">Aa</span>
              </button>

              <a href="#/sistem" class="btn btn-ghost btn-icon btn-sm" title="Status Sistem" aria-label="Status Sistem">
                ${ICONS.database}
              </a>

              <!-- Tombol Profil Pengguna / Login -->
              <button type="button" class="btn btn-ghost btn-sm" id="btn-user-top" style="gap: 4px; padding: 0 8px;">
                ${ICONS.users}
                <span id="label-user-top" class="text-xs fw-semibold">Login</span>
              </button>
            </div>
          </header>

          <!-- Konten Halaman -->
          <main class="content masuk" id="page-content" role="main">
            ${renderSkeleton(3)}
          </main>
        </div>

        <!-- Bottom Navigation Mobile -->
        <nav class="bottomnav" id="bottomnav" aria-label="Navigasi Bawah">
          <!-- Item diisi oleh renderBottomNav() -->
        </nav>
      </div>
    `;

    this.renderSidebar();
    this.renderBottomNav();
  }

  updateUserUI(user) {
    const labelTop = $('#label-user-top');
    const btnSidebar = $('#btn-user-sidebar');

    if (user) {
      const namaRingkas = user.nama ? user.nama.split(' ')[0] : user.username;
      if (labelTop) labelTop.textContent = namaRingkas;
      if (btnSidebar) {
        btnSidebar.textContent = `${namaRingkas} (${user.role})`;
        btnSidebar.classList.remove('btn-ghost');
        btnSidebar.classList.add('btn-secondary');
      }
    } else {
      if (labelTop) labelTop.textContent = 'Masuk';
      if (btnSidebar) {
        btnSidebar.textContent = 'Masuk';
        btnSidebar.classList.remove('btn-secondary');
        btnSidebar.classList.add('btn-ghost');
      }
    }
  }

  renderSidebar() {
    const navEl = $('#sidebar-nav');
    if (!navEl) return;

    const user = store.get('user');
    const userRole = user ? user.role : 'kasir';

    const groups = {};
    ROUTES.forEach((r) => {
      if (r.id === 'lainnya') return;
      if (r.roles && !r.roles.includes(userRole)) return; // Sembunyikan jika tidak ada akses
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r);
    });

    let html = '';
    Object.entries(groups).forEach(([groupName, items]) => {
      html += `<div class="nav-group-title">${escapeHtml(groupName)}</div>`;
      items.forEach((r) => {
        html += `
          <a href="${r.path}" class="nav-link" data-path="${r.path}" id="nav-side-${r.id}" title="${escapeHtml(r.shortTitle || r.title)}" data-tooltip="${escapeHtml(r.shortTitle || r.title)}">
            ${r.icon}
            <span class="nav-label">${escapeHtml(r.shortTitle || r.title)}</span>
          </a>
        `;
      });
    });

    navEl.innerHTML = html;
  }

  renderBottomNav() {
    const navEl = $('#bottomnav');
    if (!navEl) return;

    const bottomRoutes = ROUTES.filter((r) => r.inBottomNav);
    let html = '';

    bottomRoutes.forEach((r) => {
      html += `
        <a href="${r.path}" class="bottomnav-link" data-path="${r.path}" id="nav-bot-${r.id}">
          <div class="ikon-wrap">${r.icon}</div>
          <span>${escapeHtml(r.shortTitle || r.title)}</span>
        </a>
      `;
    });

    navEl.innerHTML = html;

    $$('.bottomnav-link', navEl).forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic.light();
      });
    });
  }

  bindGlobalEvents() {
    const toggleTemaHandler = () => {
      const mode = toggleTheme();
      syncStatusBarWithTheme(mode);
      haptic.light();
      showToast(`Tema beralih ke mode ${mode === 'dark' ? 'Gelap' : 'Terang'}`, 'info', 1800);
    };

    const toggleFontHandler = () => {
      const mode = toggleFontSize();
      haptic.light();
      showToast(`Ukuran teks: ${mode === 'besar' ? 'Besar' : 'Normal'}`, 'info', 1800);
    };

    $('#btn-theme-top')?.addEventListener('click', toggleTemaHandler);
    $('#btn-theme-sidebar')?.addEventListener('click', toggleTemaHandler);
    $('#btn-font-top')?.addEventListener('click', toggleFontHandler);
    $('#btn-font-sidebar')?.addEventListener('click', toggleFontHandler);

    const triggerSyncHandler = () => {
      this.sinkronkanDataGlobal();
    };

    $('#btn-sync-top')?.addEventListener('click', triggerSyncHandler);
    $('#btn-sync-sidebar')?.addEventListener('click', triggerSyncHandler);

    // Kontrol Buka/Tutup Sidebar (Mode Accurate POS untuk Desktop/Tablet & Drawer untuk Mobile)
    const toggleSidebarHandler = () => {
      const appContainer = $('.app');
      const sidebarEl = $('#sidebar');
      const backdropEl = $('#sidebar-backdrop');
      const isMobile = window.innerWidth < 768;

      if (isMobile) {
        const isOpen = sidebarEl?.classList.toggle('is-mobile-open');
        backdropEl?.classList.toggle('is-visible', Boolean(isOpen));
      } else {
        const isCollapsed = appContainer?.classList.toggle('sidebar-collapsed');
        try {
          localStorage.setItem('pos_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        } catch (_) {}
        // Trigger resize event segera dan setelah animasi selesai untuk render ulang tabel & grafik
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
      }
      haptic.light();
    };

    const tutupMobileSidebar = () => {
      $('#sidebar')?.classList.remove('is-mobile-open');
      $('#sidebar-backdrop')?.classList.remove('is-visible');
    };

    $('#btn-toggle-sidebar-top')?.addEventListener('click', toggleSidebarHandler);
    $('#btn-toggle-sidebar')?.addEventListener('click', toggleSidebarHandler);
    $('#brand-logo-sidebar')?.addEventListener('click', () => {
      if ($('.app')?.classList.contains('sidebar-collapsed')) {
        toggleSidebarHandler();
      }
    });
    $('#sidebar-backdrop')?.addEventListener('click', tutupMobileSidebar);

    // Menutup mobile drawer ketika link menu sidebar diklik pada layar mobile
    $('#sidebar-nav')?.addEventListener('click', (e) => {
      if (e.target.closest('a') && window.innerWidth < 768) {
        tutupMobileSidebar();
      }
    });

    // Keyboard shortcut global: F5 atau Ctrl+R untuk reload / sinkronisasi data in-app; Ctrl+B untuk sidebar
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        this.sinkronkanDataGlobal();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarHandler();
      }
    });

    // Tangkap prompt instalasi PWA untuk tombol pasang aplikasi di HP
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
    });

    // Dialog Pengguna (Login / Logout / Ganti PIN)
    const bukaMenuUser = () => {
      const user = store.get('user');
      if (!user) {
        tampilkanModalLogin(() => {
          this.renderSidebar();
          this.navigate(window.location.hash || '#/pos');
        });
        return;
      }

      showModal({
        title: 'Akun Pengguna',
        isSheet: true,
        body: `
          <div class="stack">
            <div class="row" style="gap: var(--sp-3);">
              <div class="brand-logo" style="width: 44px; height: 44px; background: var(--surface-3); color: var(--text);">
                ${ICONS.users}
              </div>
              <div class="grow">
                <div class="fw-bold">${escapeHtml(user.nama || user.username)}</div>
                <div class="text-xs text-muted mono">@${escapeHtml(user.username)}</div>
                <span class="badge badge-primary" style="margin-top: 4px; text-transform: capitalize;">${escapeHtml(user.role)}</span>
              </div>
            </div>

            <div class="divider"></div>

            <div class="list">
              <button type="button" class="list-item" id="btn-menu-ganti-pin">
                <div class="list-item-icon">${ICONS.userCheck}</div>
                <div class="grow">
                  <div class="list-item-title">Ganti PIN Keamanan</div>
                  <div class="list-item-sub">Ubah 6 angka PIN masuk akun Anda</div>
                </div>
              </button>
              <button type="button" class="list-item text-danger" id="btn-menu-logout">
                <div class="list-item-icon" style="background: var(--danger-soft); color: var(--danger-text);">${ICONS.rotateCcw}</div>
                <div class="grow">
                  <div class="list-item-title">Keluar (Logout)</div>
                  <div class="list-item-sub">Akhiri sesi di perangkat ini</div>
                </div>
              </button>
            </div>
          </div>
        `
      });

      document.getElementById('btn-menu-ganti-pin')?.addEventListener('click', () => {
        tampilkanDialogWajibGantiPin(store.get('token'));
      });

      document.getElementById('btn-menu-logout')?.addEventListener('click', () => {
        konfirmasiLogout();
      });
    };

    $('#btn-user-top')?.addEventListener('click', bukaMenuUser);
    $('#btn-user-sidebar')?.addEventListener('click', bukaMenuUser);

    store.subscribe('user', (user) => {
      this.updateUserUI(user);
      this.renderSidebar();
    });

    store.subscribe('isOnline', (online) => {
      const pill = $('#net-pill');
      if (pill) {
        if (online) {
          pill.classList.remove('is-offline');
          showToast('Koneksi internet terhubung kembali.', 'success', 2500);
        } else {
          pill.classList.add('is-offline');
          showToast('Koneksi terputus. Anda sedang offline.', 'warning', 4000);
        }
      }
    });
  }

  initRouter() {
    const handleRoute = () => {
      const hash = window.location.hash || '#/pos';
      this.navigate(hash);
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  navigate(hash) {
    const rute = cariRute(hash);
    this.currentRoute = rute;

    const titleEl = $('#topbar-title');
    if (titleEl) titleEl.textContent = rute.title;

    // Perbarui judul tab/browser secara dinamis sesuai identitas toko
    const namaToko = store.getNamaToko ? store.getNamaToko() : 'POS Toko';
    document.title = `${rute.title} | ${namaToko}`;

    $$('.nav-link, .bottomnav-link').forEach((link) => {
      if (link.getAttribute('data-path') === rute.path) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Validasi Sesi & Hak Akses Rute
    const rutePublik = ['sistem', 'desainsistem'];
    if (!rutePublik.includes(rute.id)) {
      pastikanLogin((user) => {
        this.cekIzinDanRender(rute, user);
      });
      return;
    }

    const user = store.get('user');
    this.cekIzinDanRender(rute, user);
  }

  cekIzinDanRender(rute, user) {
    const content = $('#page-content');
    if (!content) return;

    // Periksa apakah peran user diizinkan mengakses rute ini
    if (rute.roles && user && !rute.roles.includes(user.role)) {
      showToast(`Akses ke halaman "${rute.title}" dibatasi untuk peran: ${rute.roles.join(', ')}.`, 'warning', 4000);
      window.location.hash = '#/pos';
      return;
    }

    this.renderPage(rute);
  }

  renderPage(rute) {
    const content = $('#page-content');
    if (!content) return;

    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    content.classList.remove('masuk');
    requestAnimationFrame(() => {
      content.classList.add('masuk');
    });

    if (rute.id === 'pos') {
      renderPosModule(content);
    } else if (rute.id === 'dashboard') {
      renderLaporanModule(content);
    } else if (rute.id === 'sistem') {
      this.renderHalamanSistem(content);
    } else if (rute.id === 'desainsistem') {
      this.renderHalamanDesainSistem(content);
    } else if (rute.id === 'kategori') {
      renderKategoriModule(content);
    } else if (rute.id === 'produk') {
      renderProdukModule(content);
    } else if (rute.id === 'supplier') {
      renderSupplierModule(content);
    } else if (rute.id === 'pembelian') {
      renderPembelianModule(content);
    } else if (rute.id === 'kartu-stok') {
      renderKartuStokModule(content);
    } else if (rute.id === 'opname') {
      renderOpnameModule(content);
    } else if (rute.id === 'hutang-piutang') {
      renderHutangPiutangModule(content);
    } else if (rute.id === 'retur') {
      renderReturModule(content);
    } else if (rute.id === 'pelanggan') {
      renderPelangganModule(content);
    } else if (rute.id === 'loyalti') {
      renderLoyaltiModule(content);
    } else if (rute.id === 'pricetag') {
      renderPriceTagModule(content);
    } else if (rute.id === 'pengaturan') {
      renderPengaturanModule(content);
    } else if (rute.id === 'users') {
      renderUsersModule(content);
    } else if (rute.id === 'lainnya') {
      this.renderHalamanLainnya(content);
    } else {
      this.renderPlaceholder(content, rute);
    }
  }

  /* ======================================================================== */
  /* HALAMAN STATUS SISTEM                                                    */
  /* ======================================================================== */
  renderHalamanSistem(container) {
    container.innerHTML = `
      <div class="stack">
        <div class="page-header">
          <div>
            <h2>Status & Diagnostik Sistem</h2>
            <p>Pemeriksaan konektivitas Google Apps Script Web App dan database spreadsheet</p>
          </div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sync" id="btn-sync-sistem">
              ${ICONS.refresh}
              <span>Sinkron Data Global</span>
            </button>
            <button type="button" class="btn btn-primary" id="btn-ping-sistem">
              ${ICONS.database}
              <span>Uji Koneksi Server</span>
            </button>
          </div>
        </div>

        <div class="card card-body stack">
          <div class="field">
            <label class="field-label" for="cfg-api-url">URL Google Apps Script Web App (/exec)</label>
            <div class="row">
              <input type="url" class="input grow" id="cfg-api-url" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(CONFIG.API_URL || '')}">
              <button type="button" class="btn btn-secondary" id="btn-simpan-api-url">Simpan URL</button>
            </div>
            <div class="field-hint">URL deployment Web App aktif di Google Apps Script.</div>
          </div>
        </div>

        <div id="hasil-diagnostik" class="stack">
          <div class="card card-body">
            <div class="row-between">
              <div>
                <div class="fw-semibold">Status Deployment Backend</div>
                <div class="text-sm text-muted">Klik tombol "Uji Koneksi Server" untuk memverifikasi.</div>
              </div>
              <span class="badge ${CONFIG.API_URL ? 'badge-info' : 'badge-warning'}">
                ${CONFIG.API_URL ? 'URL Terisi' : 'URL Belum Diatur'}
              </span>
            </div>
          </div>
        </div>

        <!-- Banner Pintar Status Aplikasi / Update / Unduh -->
        ${this.renderBannerAppHtml(true)}
      </div>
    `;

    this.pasangEventBanner(container.querySelector('#banner-app-install-update'));

    const inputUrl = $('#cfg-api-url', container);
    const btnSimpan = $('#btn-simpan-api-url', container);
    const btnPing = $('#btn-ping-sistem', container);
    const btnSync = $('#btn-sync-sistem', container);
    const hasilDiv = $('#hasil-diagnostik', container);

    btnSync?.addEventListener('click', () => {
      this.sinkronkanDataGlobal();
    });

    btnSimpan?.addEventListener('click', () => {
      const urlBaru = inputUrl.value.trim();
      setApiUrl(urlBaru);
      showToast('URL Backend berhasil disimpan!', 'success');
      btnPing?.click();
    });

    btnPing?.addEventListener('click', async () => {
      btnPing.setAttribute('aria-busy', 'true');
      btnPing.disabled = true;

      hasilDiv.innerHTML = `
        <div class="card card-body stack-sm">
          <div class="row"><div class="spinner"></div> <span>Menghubungi server Apps Script...</span></div>
        </div>
      `;

      const start = Date.now();
      try {
        const res = await apiCall('sistem.ping', {});
        const latency = Date.now() - start;

        hasilDiv.innerHTML = `
          <div class="card card-body stack">
            <div class="row-between">
              <div class="row" style="align-items: center; gap: var(--sp-2);">
                <span class="badge badge-success" style="font-size: 13px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Terhubung</span>
                </span>
                <span class="text-sm text-muted">Latency: ${latency} ms</span>
              </div>
              <span class="badge badge-primary">Versi API: ${escapeHtml(res.versi || '0.0.1')}</span>
            </div>

            <div class="divider"></div>

            <dl class="kv">
              <dt>Nama Sistem</dt>
              <dd>${escapeHtml(res.nama || '-')}</dd>

              <dt>Status Database</dt>
              <dd>${res.db_siap ? '<span class="text-success fw-bold">Siap (26 Sheet Lengkap)</span>' : '<span class="text-danger fw-bold">Belum Siap</span>'}</dd>

              <dt>Versi Skema Backend</dt>
              <dd>${res.versi_skema || 1}</dd>

              <dt>Versi Skema Database</dt>
              <dd>${res.versi_skema_db || '-'}</dd>

              <dt>Waktu Server (WIB)</dt>
              <dd class="num">${escapeHtml(res.waktu_server || '-')}</dd>
            </dl>
          </div>
        `;
        showToast('Koneksi ke backend Apps Script berhasil!', 'success');
      } catch (err) {
        hasilDiv.innerHTML = `
          <div class="card card-body stack">
            <div class="alert alert-danger">
              ${ICONS.alertTriangle}
              <div>
                <strong>Koneksi Gagal (${escapeHtml(err.code || 'ERROR')})</strong>
                <div>${escapeHtml(err.message)}</div>
              </div>
            </div>
          </div>
        `;
        showToast(err.message, 'error', 5000);
      } finally {
        btnPing.removeAttribute('aria-busy');
        btnPing.disabled = false;
      }
    });

    if (CONFIG.API_URL) {
      btnPing?.click();
    }
  }

  /* ======================================================================== */
  /* HALAMAN DESIGN SYSTEM                                                    */
  /* ======================================================================== */
  renderHalamanDesainSistem(container) {
    container.innerHTML = `
      <div class="stack">
        <div class="page-header">
          <div>
            <h2>Design System & Galeri Komponen</h2>
            <p>Komponen antarmuka berbasis CSS murni tokens.css & components.css</p>
          </div>
        </div>

        <div class="card card-body stack">
          <div class="section-title">Palet Warna Utama</div>
          <div class="swatch-grid">
            <div class="swatch">
              <div class="swatch-color" style="background: var(--primary)"></div>
              <div class="swatch-info"><strong>Primary</strong><br>--primary</div>
            </div>
            <div class="swatch">
              <div class="swatch-color" style="background: var(--surface)"></div>
              <div class="swatch-info"><strong>Surface</strong><br>--surface</div>
            </div>
            <div class="swatch">
              <div class="swatch-color" style="background: var(--bg)"></div>
              <div class="swatch-info"><strong>Background</strong><br>--bg</div>
            </div>
            <div class="swatch">
              <div class="swatch-color" style="background: var(--success)"></div>
              <div class="swatch-info"><strong>Success</strong><br>--success</div>
            </div>
            <div class="swatch">
              <div class="swatch-color" style="background: var(--warning)"></div>
              <div class="swatch-info"><strong>Warning</strong><br>--warning</div>
            </div>
            <div class="swatch">
              <div class="swatch-color" style="background: var(--danger)"></div>
              <div class="swatch-info"><strong>Danger</strong><br>--danger</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ======================================================================== */
  /* HALAMAN MENU LAINNYA (LISTVIEW ELEGAN & RAPI)                            */
  /* ======================================================================== */
  renderHalamanLainnya(container) {
    const user = store.get('user');
    const userRole = user ? user.role : 'kasir';

    const listRoutes = ROUTES.filter((r) => {
      if (r.id === 'lainnya') return false;
      if (r.roles && !r.roles.includes(userRole)) return false;
      return true;
    });

    const MENU_DESCRIPTIONS = {
      pos: 'Kasir transaksi penjualan, keranjang belanja & cetak struk',
      dashboard: 'Grafik omset harian, laba rugi, kas & valuasi stok',
      produk: 'Katalog barang, harga bertingkat grosir & cetak barcode',
      pembelian: 'Pencatatan faktur barang masuk distributor & update HPP',
      kategori: 'Pengelompokan barang & susunan hierarki sub-kategori',
      'kartu-stok': 'Riwayat mutasi keluar-masuk & kartu stok per barang',
      opname: 'Pemeriksaan fisik gudang & penyesuaian selisih stok',
      pricetag: 'Cetak label harga rak barcode ukuran kertas custom',
      pelanggan: 'Data member pelanggan, batas tempo piutang & poin',
      loyalti: 'Katalog reward penukaran poin member & kupon diskon',
      supplier: 'Daftar distributor rekanan toko & kontak vendor',
      'hutang-piutang': 'Buku tempo pelanggan, cicilan pembayaran & hutang',
      retur: 'Pengembalian barang rusak pelanggan & retur ke supplier',
      pengaturan: 'Profil toko, struk nota, printer & preferensi sistem',
      users: 'Manajemen pengguna, peran kasir/admin & ganti PIN',
      sistem: 'Status server backend Apps Script, memori & diagnosis',
      desainsistem: 'Pratinjau galeri komponen UI & dokumentasi visual'
    };

    const groupTitles = {
      'Transaksi': 'Transaksi & Kasir',
      'Katalog & Stok': 'Katalog & Stok Barang',
      'Mitra & Loyalitas': 'Mitra, Pelanggan & Hadiah',
      'Keuangan': 'Keuangan & Retur',
      'Sistem': 'Pengaturan & Sistem'
    };

    // Kelompokkan rute berdasarkan grupnya
    const groupedRoutes = {};
    listRoutes.forEach((r) => {
      const g = r.group || 'Lainnya';
      if (!groupedRoutes[g]) groupedRoutes[g] = [];
      groupedRoutes[g].push(r);
    });

    const namaToko = store.getNamaToko ? store.getNamaToko() : 'POS Kasir Toko';
    const namaUser = user ? (user.nama || user.username) : 'Pengguna';

    let html = `
      <div class="menu-list-container">
        <!-- Kartu Profil & Identitas Toko Ringkas -->
        <div class="card card-body" style="background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%); margin-bottom: var(--sp-2);">
          <div class="row" style="justify-content: space-between; align-items: center; gap: var(--sp-3);">
            <div class="row" style="align-items: center; gap: var(--sp-3); flex: 1; min-width: 0;">
              <div class="brand-logo" style="width: 44px; height: 44px; font-size: var(--fs-lg); border-radius: var(--radius-xl); flex-shrink: 0;">
                ${ICONS.store}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: var(--fw-bold); font-size: var(--fs-md); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(namaToko)}
                </div>
                <div class="text-xs text-muted" style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${escapeHtml(namaUser)}</span>
                  <span class="badge badge-primary" style="font-size: 10px; text-transform: uppercase; padding: 1px 7px; border-radius: var(--radius-full); font-weight: var(--fw-bold);">
                    ${escapeHtml(userRole)}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-logout-menu" title="Keluar / Ganti Akun" aria-label="Keluar / Ganti Akun" style="flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.logout}
              <span>Keluar</span>
            </button>
          </div>
        </div>

        <!-- Kolom Pencarian Cepat Menu -->
        <div class="field" style="margin-bottom: var(--sp-2);">
          <div class="input-group">
            <span class="input-icon">${ICONS.search}</span>
            <input type="search" class="input" id="search-menu-lainnya" placeholder="Cari menu, fitur, atau alat..." autocomplete="off">
          </div>
        </div>

        <!-- Group Aksi Cepat / Alat Utama -->
        <div class="menu-group-wrap" data-group-wrap="alat">
          <div class="menu-group-heading">Alat & Aksi Cepat</div>
          <div class="menu-list-card">
            <button type="button" class="menu-list-item" id="btn-sync-tile" data-search="sinkron data perbarui cache produk pelanggan stok offline cloud">
              <div class="menu-list-icon" style="background: rgba(234, 88, 12, 0.12); color: #ea580c; border-color: rgba(234, 88, 12, 0.25);">
                ${ICONS.refresh}
              </div>
              <div class="menu-list-body">
                <div class="menu-list-title">Sinkron Data Cloud</div>
                <div class="menu-list-desc">Perbarui cache produk, pelanggan & stok offline</div>
              </div>
              <div class="menu-list-chevron">${ICONS.chevronRight}</div>
            </button>

            <button type="button" class="menu-list-item" id="btn-printer-tile" data-search="printer bluetooth rawbt struk nota cetak kasir faktur">
              <div class="menu-list-icon" style="background: rgba(14, 165, 233, 0.12); color: #0284c7; border-color: rgba(14, 165, 233, 0.25);">
                ${ICONS.printer}
              </div>
              <div class="menu-list-body">
                <div class="menu-list-title">Printer Bluetooth (RawBT)</div>
                <div class="menu-list-desc">Pengaturan koneksi printer termal & tes cetak nota</div>
              </div>
              <div class="menu-list-chevron">${ICONS.chevronRight}</div>
            </button>
          </div>
        </div>
    `;

    // Render per grup rute
    Object.entries(groupedRoutes).forEach(([groupKey, items]) => {
      const displayTitle = groupTitles[groupKey] || groupKey;
      html += `
        <div class="menu-group-wrap" data-group-wrap="${escapeHtml(groupKey)}">
          <div class="menu-group-heading">${escapeHtml(displayTitle)}</div>
          <div class="menu-list-card">
      `;

      items.forEach((r) => {
        const desc = MENU_DESCRIPTIONS[r.id] || r.shortTitle || '';
        const searchKeywords = `${r.title} ${r.shortTitle || ''} ${desc} ${displayTitle}`.toLowerCase();
        html += `
          <a href="${r.path}" class="menu-list-item" data-search="${escapeHtml(searchKeywords)}">
            <div class="menu-list-icon">${r.icon}</div>
            <div class="menu-list-body">
              <div class="menu-list-title">${escapeHtml(r.title)}</div>
              <div class="menu-list-desc">${escapeHtml(desc)}</div>
            </div>
            <div class="menu-list-chevron">${ICONS.chevronRight}</div>
          </a>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    // Wadah pesan jika pencarian kosong
    html += `
        <div id="menu-search-empty" class="card card-body text-center" style="display: none; padding: var(--sp-8) var(--sp-4);">
          <div style="font-size: 32px; color: var(--text-muted); margin-bottom: var(--sp-2);">${ICONS.search}</div>
          <h4 style="margin-bottom: var(--sp-1);">Menu Tidak Ditemukan</h4>
          <p class="text-muted text-sm">Tidak ada menu atau fitur yang cocok dengan kata kunci pencarian Anda.</p>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Event handler: Sinkron data
    container.querySelector('#btn-sync-tile')?.addEventListener('click', () => {
      this.sinkronkanDataGlobal();
    });

    // Event handler: Printer Bluetooth
    container.querySelector('#btn-printer-tile')?.addEventListener('click', () => {
      tampilkanModalKoneksiPrinter();
    });

    // Event handler: Logout
    container.querySelector('#btn-logout-menu')?.addEventListener('click', () => {
      konfirmasiLogout();
    });

    // Event handler: Pencarian menu instan
    const inpSearch = container.querySelector('#search-menu-lainnya');
    const emptyMsg = container.querySelector('#menu-search-empty');
    const allGroups = container.querySelectorAll('.menu-group-wrap');

    inpSearch?.addEventListener('input', () => {
      const q = inpSearch.value.trim().toLowerCase();
      let totalVisible = 0;

      allGroups.forEach((grp) => {
        let groupHasMatch = false;
        const items = grp.querySelectorAll('.menu-list-item');
        items.forEach((item) => {
          const hay = item.getAttribute('data-search') || '';
          if (!q || hay.includes(q)) {
            item.style.display = 'flex';
            groupHasMatch = true;
            totalVisible++;
          } else {
            item.style.display = 'none';
          }
        });

        grp.style.display = groupHasMatch ? 'flex' : 'none';
      });

      if (emptyMsg) {
        emptyMsg.style.display = totalVisible === 0 ? 'block' : 'none';
      }
    });
  }

  /* ======================================================================== */
  /* PLACEHOLDER MODUL FASE BERIKUTNYA                                        */
  /* ======================================================================== */
  renderPlaceholder(container, rute) {
    container.innerHTML = `
      <div class="stack">
        <div class="page-header">
          <div>
            <h2>${escapeHtml(rute.title)}</h2>
            <p>Modul dijadwalkan pada roadmap <strong>${escapeHtml(rute.fase)}</strong></p>
          </div>
        </div>

        <div class="card card-body">
          ${renderEmpty({
      title: `Modul ${rute.title}`,
      text: `Modul ini merupakan bagian dari roadmap pengembangan ${rute.fase}. Fitur akan dibangun lengkap sesuai standar arsitektur dan aturan bisnis README.md.`,
      icon: rute.icon,
      actionButton: `
              <div class="row">
                <a href="#/produk" class="btn btn-primary">${ICONS.box} Kelola Produk</a>
                <a href="#/sistem" class="btn btn-secondary">${ICONS.database} Cek Koneksi Backend</a>
              </div>
            `
    })}
        </div>
      </div>
    `;
  }
}

// Inisialisasi saat DOM siap
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});

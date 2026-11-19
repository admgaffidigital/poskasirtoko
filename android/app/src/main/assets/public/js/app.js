/**
 * app.js — Router & Shell Aplikasi POS Kasir Toko Bangunan
 * Vanilla JS (ES Modules) tanpa build step
 */

import { CONFIG, setApiUrl } from './config.js';
import { ROUTES, cariRute } from './routes.js';
import { apiCall, invalidateApiCache, seedApiCache, forceNextApiCallsFresh } from './api.js';
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
import { renderBiayaModule } from './modules/biaya.js';
import { renderPelangganModule } from './modules/pelanggan.js';
import { renderLoyaltiModule } from './modules/loyalti.js';
import { renderPriceTagModule } from './modules/pricetag.js';
import { renderLaporanModule } from './modules/laporan.js';
import { haptic, syncStatusBarWithTheme, hideNativeSplashScreen, setupHardwareBackButton } from './utils/native.js';
import { tampilkanModalKoneksiPrinter } from './utils/printer.js';

class App {
  constructor() {
    this.currentRoute = null;
    this._activeCleanup = null;
    this._renderSeq = 0;
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

    // Verifikasi sesi & sinkronkan pengaturan toko dalam 1 request paralel saat aplikasi dimuat
    const token = store.get('token');
    if (token) {
      apiCall('auth.me', {})
        .then((res) => {
          store.set('user', res.user);
          if (res.pengaturan) {
            store.set('pengaturan', res.pengaturan);
            seedApiCache('pengaturan.get', {}, { pengaturan: res.pengaturan });
          }
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
      this.muatPengaturanToko();
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
   * Pemanasan cache in-memory & persisten di latar belakang saat CPU idle
   * Memastikan pembukaan modul POS Kasir, Katalog Produk, Kategori, dan Pelanggan berlangsung instan (0ms)
   */
  hangatkanCacheLatarBelakang() {
    const warmup = () => {
      if (!store.get('token')) return;
      apiCall('kategori.list', {}).catch(() => {});
      apiCall('kategori.list', { aktif_saja: true }).catch(() => {});
      apiCall('produk.list', { aktif_saja: true, page: 1, limit: 30 }).catch(() => {});
      apiCall('produk.list', { q: '', kategori_id: '', filter_stok: '', status: '', sort: 'terbaru', aktif_saja: false, page: 1, limit: 20 }).catch(() => {});
      apiCall('penjualan.pending.list', {}).catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warmup, { timeout: 1500 });
    } else {
      setTimeout(warmup, 400);
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

    const setSpinning = (aktif) => {
      ['#btn-sync-top', '#btn-sync-sidebar', '#btn-sync-tile', '#btn-sync-sistem'].forEach((sel) => {
        const el = $(sel);
        if (el) el.classList.toggle('is-spinning', aktif);
      });
    };

    setSpinning(true);

    haptic.medium();
    showToast('Menyinkronkan data dari server...', 'info', 2000);

    try {
      if (!navigator.onLine) {
        showToast('Sedang mode offline. Memuat data dari cache lokal...', 'warning', 3000);
        if (this.currentRoute) await this.renderPage(this.currentRoute);
        return;
      }

      // Kosongkan cache API in-memory & paksa pemanggilan berikutnya mengambil data segar dari server
      invalidateApiCache();
      forceNextApiCallsFresh(3500);

      // 1. Periksa pembaruan Service Worker PWA di latar belakang
      if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => { });
      }

      // 2. Jalankan sinkronisasi sesi/pengaturan DAN render ulang halaman aktif secara PARALEL
      const token = store.get('token');
      const syncSessionPromise = token
        ? apiCall('auth.me', {}, { skipCache: true })
            .then((res) => {
              if (res && res.user) {
                store.set('user', res.user);
                if (res.pengaturan) {
                  store.set('pengaturan', res.pengaturan);
                  seedApiCache('pengaturan.get', {}, { pengaturan: res.pengaturan });
                }
                if (res.toko) store.setToko(res.toko);
                this.updateUserUI(res.user);
                this.updateBrandUI();
              }
            })
            .catch(() => this.muatPengaturanToko())
        : this.muatPengaturanToko();

      // Render ulang halaman aktif bersamaan dengan sinkronisasi sesi
      const renderPromise = this.currentRoute
        ? Promise.resolve(this.renderPage(this.currentRoute))
        : Promise.resolve();

      // Pastikan tombol yang baru di-render ulang (seperti #btn-sync-tile / #btn-sync-sistem) tetap berputar
      setSpinning(true);

      // Jika berada di halaman Lainnya atau Sistem, muat juga data master di latar depan agar sinkronisasi nyata
      const isStaticMenuRoute = this.currentRoute && (this.currentRoute.id === 'lainnya' || this.currentRoute.id === 'sistem');
      const syncCloudMasterPromise = (isStaticMenuRoute && token)
        ? Promise.allSettled([
            apiCall('kategori.list', {}, { skipCache: true }),
            apiCall('produk.list', { aktif_saja: true, page: 1, limit: 30 }, { skipCache: true })
          ])
        : Promise.resolve();

      await Promise.all([renderPromise, syncSessionPromise, syncCloudMasterPromise]);
      this.hangatkanCacheLatarBelakang();

      haptic.success();
      showToast('Sinkronisasi data berhasil! Data terbaru telah dimuat.', 'success', 2500);
    } catch (err) {
      console.error('Gagal sinkronisasi data global:', err);
      showToast('Gagal sinkronisasi: ' + (err.message || 'Koneksi terganggu'), 'error', 3500);
    } finally {
      this._isSyncing = false;
      setSpinning(false);
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').then((registration) => {
        window.swRegistration = registration;

        // Cek update segera saat registrasi berhasil
        registration.update().catch(() => {});

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

        // Cek pembaruan realtime saat tab dibuka kembali / kembali dari latar belakang
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
        window.addEventListener('focus', () => {
          registration.update().catch(() => {});
        });

        // Cek pembaruan berkala otomatis setiap 5 menit
        setInterval(() => {
          registration.update().catch(() => {});
        }, 5 * 60 * 1000);
      }).catch((err) => {
        console.warn('Registrasi Service Worker gagal:', err);
      });

      // Deteksi jika service worker controller berubah (langsung reload otomatis saat update aktif)
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
              <div class="text-xs text-muted" style="margin-top: 2px;">Versi v${CONFIG.VERSION || '1.0.67'} • Berjalan offline dengan performa native</div>
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
        showToast(`Aplikasi Anda sudah menggunakan versi paling baru (v${CONFIG.VERSION || '1.0.67'})!`, 'success');
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

              <!-- Quick Command Palette (Ctrl+K) -->
              <button type="button" class="btn-cmd-trigger" id="btn-cmd-palette" title="Lompat Cepat Menu & Aksi (Ctrl+K)" aria-label="Cari Cepat Menu">
                ${ICONS.search}
                <span class="btn-cmd-label">Menu</span>
                <kbd class="btn-cmd-kbd">Ctrl+K</kbd>
              </button>

              <!-- Tombol Sinkronisasi Data Cepat di Topbar -->
              <button type="button" class="btn btn-ghost btn-icon btn-sm btn-sync" id="btn-sync-top" title="Sinkronisasi Data Global (F5)" aria-label="Sinkronisasi Data">
                ${ICONS.refresh}
              </button>

              <!-- Tombol Profil Pengguna / Login (Ringkas & Bersih) -->
              <button type="button" class="btn btn-ghost btn-sm" id="btn-user-top" style="gap: 6px; padding: 0 10px; border-radius: var(--radius-full); background: var(--surface-2); border: 1px solid var(--border);" title="Akun Pengguna">
                ${ICONS.users}
                <span id="label-user-top" class="text-xs fw-semibold">Login</span>
              </button>
            </div>
          </header>

          <!-- Banner Status Koneksi Realtime (Online/Offline Native Strip) -->
          <div class="net-status-bar" id="net-status-bar" role="status" aria-live="polite"></div>

          <!-- Indikator Pull-to-Refresh Mobile -->
          <div class="ptr-indicator" id="ptr-indicator" aria-hidden="true">
            ${ICONS.refresh}
            <span id="ptr-label">Tarik untuk segarkan</span>
          </div>

          <!-- Konten Halaman -->
          <main class="content masuk" id="page-content" role="main">
            ${renderSkeleton(3)}
          </main>
        </div>

        <!-- Smart Scroll-to-Top FAB -->
        <button type="button" class="scroll-top-fab" id="btn-scroll-top" title="Kembali ke Atas" aria-label="Kembali ke Atas">
          ${ICONS.arrowUp}
        </button>

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

    $('#btn-cmd-palette')?.addEventListener('click', () => {
      haptic.light();
      this.bukaCommandPalette();
    });

    // Keyboard shortcut global: F5/Ctrl+R sinkronisasi; Ctrl+B sidebar; Ctrl+K Quick Command Palette
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        this.sinkronkanDataGlobal();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarHandler();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.bukaCommandPalette();
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

      const modalUser = showModal({
        title: 'Akun Pengguna & Preferensi',
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
              <button type="button" class="list-item" id="btn-menu-tema">
                <div class="list-item-icon">${ICONS.moon}</div>
                <div class="grow">
                  <div class="list-item-title">Ubah Tema Tampilan</div>
                  <div class="list-item-sub">Beralih mode Terang / Gelap</div>
                </div>
              </button>
              <button type="button" class="list-item" id="btn-menu-font">
                <div class="list-item-icon"><span class="fw-bold" style="font-size: var(--fs-sm);">Aa</span></div>
                <div class="grow">
                  <div class="list-item-title">Ukuran Teks Tampilan</div>
                  <div class="list-item-sub">Beralih ukuran Normal / Besar</div>
                </div>
              </button>
              <button type="button" class="list-item" id="btn-menu-sync">
                <div class="list-item-icon">${ICONS.refresh}</div>
                <div class="grow">
                  <div class="list-item-title">Sinkronisasi Data</div>
                  <div class="list-item-sub">Segarkan cache data &amp; stok lokal (F5)</div>
                </div>
              </button>
              <button type="button" class="list-item" id="btn-menu-shift">
                <div class="list-item-icon" style="background: var(--primary-soft); color: var(--primary-soft-text);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg></div>
                <div class="grow">
                  <div class="list-item-title">Kas &amp; Shift Kasir (X-Report)</div>
                  <div class="list-item-sub">Hitung saldo laci &amp; cetak laporan kasir (F3)</div>
                </div>
              </button>
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

      document.getElementById('btn-menu-tema')?.addEventListener('click', () => {
        toggleTemaHandler();
        modalUser.close();
      });

      document.getElementById('btn-menu-font')?.addEventListener('click', () => {
        toggleFontHandler();
        modalUser.close();
      });

      document.getElementById('btn-menu-sync')?.addEventListener('click', () => {
        triggerSyncHandler();
        modalUser.close();
      });

      document.getElementById('btn-menu-shift')?.addEventListener('click', () => {
        modalUser.close();
        if (typeof window.bukaModalShiftKasirGlobal === 'function') {
          window.bukaModalShiftKasirGlobal();
        } else {
          window.location.hash = '#/pos';
          setTimeout(() => {
            if (typeof window.bukaModalShiftKasirGlobal === 'function') {
              window.bukaModalShiftKasirGlobal();
            }
          }, 350);
        }
      });

      document.getElementById('btn-menu-ganti-pin')?.addEventListener('click', () => {
        modalUser.close();
        tampilkanDialogWajibGantiPin(store.get('token'));
      });

      document.getElementById('btn-menu-logout')?.addEventListener('click', () => {
        modalUser.close();
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
        pill.classList.toggle('is-offline', !online);
      }
      this.updateNetStatusBar(online, false);
    });

    // Inisialisasi 6 Paket Native App (Scroll Elevation, Scroll-to-Top, Net Bar, Pull-to-Refresh)
    this.updateNetStatusBar(typeof navigator === 'undefined' ? true : navigator.onLine, true);
    this.setupScrollEnhancements();
    this.setupPullToRefresh();
  }

  /**
   * Paket 4: Banner status koneksi tipis & non-intrusif di bawah Topbar
   */
  updateNetStatusBar(online, isInitial = false) {
    const bar = $('#net-status-bar');
    if (!bar) return;
    if (this._netBarTimer) {
      clearTimeout(this._netBarTimer);
      this._netBarTimer = null;
    }

    if (!online) {
      bar.className = 'net-status-bar is-offline';
      bar.innerHTML = `${ICONS.wifiOff}<span>Koneksi internet terputus — Mode Offline (data lokal aktif)</span>`;
    } else if (!isInitial) {
      bar.className = 'net-status-bar is-reconnected';
      bar.innerHTML = `${ICONS.wifi}<span>Kembali Online — Menyinkronkan data terbaru...</span>`;
      this._netBarTimer = setTimeout(() => {
        bar.className = 'net-status-bar';
        bar.innerHTML = '';
      }, 2600);
    } else {
      bar.className = 'net-status-bar';
      bar.innerHTML = '';
    }
  }

  /**
   * Paket 3 & 5: Topbar Scroll Elevation + Smart Scroll-to-Top FAB
   */
  setupScrollEnhancements() {
    const topbar = $('.topbar');
    const btnTop = $('#btn-scroll-top');
    let ticking = false;

    const updateOnScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      topbar?.classList.toggle('is-scrolled', y > 8);
      if (btnTop) {
        const bolehTampil = y > 360 && this.currentRoute?.id !== 'pos';
        btnTop.classList.toggle('is-visible', bolehTampil);
      }
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateOnScroll);
      }
    }, { passive: true });

    btnTop?.addEventListener('click', () => {
      haptic.light();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /**
   * Paket 5: Mobile Pull-to-Refresh Native Gesture (Tarik dari puncak halaman)
   */
  setupPullToRefresh() {
    const pageContent = $('#page-content');
    const ptrEl = $('#ptr-indicator');
    const ptrLabel = $('#ptr-label');
    if (!pageContent || !ptrEl) return;

    const svgIcon = ptrEl.querySelector('svg');
    const THRESHOLD = 68;
    let startY = 0;
    let startX = 0;
    let pullDist = 0;
    let tracking = false;
    let crossedThreshold = false;

    pageContent.addEventListener('touchstart', (e) => {
      if (window.innerWidth >= 1024) return;
      if (this._isSyncing) return;
      if ((window.scrollY || 0) > 0) return;
      if (document.querySelector('.overlay') || $('#sidebar')?.classList.contains('is-mobile-open')) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (e.target.closest('input, textarea, select, .table-native-scroll, .segmented')) return;

      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pullDist = 0;
      tracking = true;
      crossedThreshold = false;
    }, { passive: true });

    pageContent.addEventListener('touchmove', (e) => {
      if (!tracking || !e.touches || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);

      // Batalkan jika pengguna menggeser horizontal atau ke atas
      if (dy <= 0 || dx > dy) {
        if (pullDist > 0) {
          pullDist = 0;
          ptrEl.classList.remove('is-visible', 'is-ready');
          ptrEl.style.transform = 'translate3d(-50%, -64px, 0)';
        }
        if (dy < -8) tracking = false;
        return;
      }

      if ((window.scrollY || 0) > 0) {
        tracking = false;
        return;
      }

      pullDist = Math.min(dy * 0.5, 86);
      if (pullDist > 12) {
        ptrEl.classList.add('is-visible');
        const offsetY = Math.min(pullDist - 54, 18);
        ptrEl.style.transform = `translate3d(-50%, ${offsetY}px, 0)`;
        if (svgIcon) {
          svgIcon.style.transform = `rotate(${Math.round(pullDist * 3.2)}deg)`;
        }

        const siap = pullDist >= THRESHOLD;
        ptrEl.classList.toggle('is-ready', siap);
        if (ptrLabel) {
          ptrLabel.textContent = siap ? 'Lepas untuk menyinkronkan' : 'Tarik untuk segarkan';
        }
        if (siap && !crossedThreshold) {
          crossedThreshold = true;
          haptic.light();
        }
      }
    }, { passive: true });

    const resetPtr = () => {
      if (!tracking) return;
      tracking = false;
      const jalankan = pullDist >= THRESHOLD;
      pullDist = 0;

      if (jalankan) {
        ptrEl.classList.add('is-refreshing');
        if (ptrLabel) ptrLabel.textContent = 'Menyinkronkan...';
        this.sinkronkanDataGlobal().finally(() => {
          ptrEl.classList.remove('is-visible', 'is-ready', 'is-refreshing');
          ptrEl.style.transform = 'translate3d(-50%, -64px, 0)';
          if (svgIcon) svgIcon.style.transform = '';
        });
      } else {
        ptrEl.classList.remove('is-visible', 'is-ready');
        ptrEl.style.transform = 'translate3d(-50%, -64px, 0)';
        if (svgIcon) svgIcon.style.transform = '';
      }
    };

    pageContent.addEventListener('touchend', resetPtr, { passive: true });
    pageContent.addEventListener('touchcancel', resetPtr, { passive: true });
  }

  /**
   * Paket 6: Quick Command Palette (Ctrl+K) — Lompat cepat modul & aksi sistem
   */
  bukaCommandPalette() {
    // Abaikan jika belum login atau palette sudah terbuka
    if (!store.get('token') || document.getElementById('cmd-palette-input')) return;

    const user = store.get('user');
    const userRole = user ? user.role : 'kasir';

    const daftarRute = ROUTES.filter((r) => {
      if (r.id === 'lainnya') return false;
      if (r.roles && !r.roles.includes(userRole)) return false;
      return true;
    }).map((r) => ({
      grup: 'Navigasi Modul',
      id: `route-${r.id}`,
      judul: r.title,
      sub: `${r.group} — ${r.shortTitle || r.title}`,
      kataKunci: `${r.title} ${r.shortTitle || ''} ${r.group} ${r.id}`.toLowerCase(),
      ikon: r.icon,
      hint: r.path.replace('#/', '/'),
      aksi: () => {
        window.location.hash = r.path;
      }
    }));

    const aksiCepat = [
      {
        grup: 'Aksi Cepat',
        id: 'act-sync',
        judul: 'Sinkronisasi Data Global',
        sub: 'Segarkan katalog, stok, & sesi dari server cloud',
        kataKunci: 'sinkron sync refresh reload muat ulang data server',
        ikon: ICONS.refresh,
        hint: 'F5',
        aksi: () => this.sinkronkanDataGlobal()
      },
      {
        grup: 'Aksi Cepat',
        id: 'act-printer',
        judul: 'Koneksi & Uji Printer Bluetooth',
        sub: 'Atur printer thermal 58mm/80mm & RawBT',
        kataKunci: 'printer bluetooth rawbt thermal cetak struk tes',
        ikon: ICONS.printer,
        hint: 'Print',
        aksi: () => tampilkanModalKoneksiPrinter()
      },
      {
        grup: 'Aksi Cepat',
        id: 'act-theme',
        judul: 'Ganti Tema Gelap / Terang',
        sub: 'Beralih antara Light Mode dan Dark Mode',
        kataKunci: 'tema theme gelap terang dark light mode malam',
        ikon: ICONS.moon,
        hint: 'Tema',
        aksi: () => {
          const mode = toggleTheme();
          syncStatusBarWithTheme(mode);
          showToast(`Tema beralih ke mode ${mode === 'dark' ? 'Gelap' : 'Terang'}`, 'info', 1800);
        }
      },
      {
        grup: 'Aksi Cepat',
        id: 'act-font',
        judul: 'Ubah Ukuran Teks (Normal / Besar)',
        sub: 'Aksesibilitas skala huruf antarmuka',
        kataKunci: 'font huruf ukuran teks aksesibilitas besar normal aa',
        ikon: ICONS.sparkles,
        hint: 'Aa',
        aksi: () => {
          const mode = toggleFontSize();
          showToast(`Ukuran teks: ${mode === 'besar' ? 'Besar' : 'Normal'}`, 'info', 1800);
        }
      }
    ];

    const semuaItem = [...daftarRute, ...aksiCepat];

    const modal = showModal({
      title: 'Lompat Cepat Menu & Aksi',
      size: 'sm',
      body: `
        <div class="cmd-palette-wrap">
          <div class="input-group">
            <span class="input-icon">${ICONS.search}</span>
            <input type="search" id="cmd-palette-input" class="input" placeholder="Ketik nama menu atau aksi (cth: stok, biaya, printer)..." autocomplete="off" data-autofocus>
          </div>
          <div class="cmd-palette-list" id="cmd-palette-list" role="listbox"></div>
          <div class="cmd-palette-foot">
            <span>Gunakan panah atas/bawah & Enter untuk memilih</span>
            <span class="mono">Esc tutup</span>
          </div>
        </div>
      `
    });

    const inputEl = modal.el.querySelector('#cmd-palette-input');
    const listEl = modal.el.querySelector('#cmd-palette-list');
    let hasilFilter = semuaItem;
    let indeksAktif = 0;

    const jalankanItem = (item) => {
      if (!item) return;
      haptic.light();
      modal.close();
      setTimeout(() => item.aksi(), 40);
    };

    const renderDaftar = () => {
      const q = (inputEl.value || '').trim().toLowerCase();
      hasilFilter = q
        ? semuaItem.filter((it) => it.kataKunci.includes(q) || it.judul.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
        : semuaItem;

      if (indeksAktif >= hasilFilter.length) indeksAktif = 0;

      if (!hasilFilter.length) {
        listEl.innerHTML = `<div class="cat-picker-empty">Menu atau aksi "${escapeHtml(inputEl.value)}" tidak ditemukan.</div>`;
        return;
      }

      let html = '';
      let grupTerakhir = '';
      hasilFilter.forEach((it, idx) => {
        if (it.grup !== grupTerakhir) {
          grupTerakhir = it.grup;
          html += `<div class="cmd-palette-group">${escapeHtml(grupTerakhir)}</div>`;
        }
        html += `
          <button type="button" class="cmd-palette-item ${idx === indeksAktif ? 'is-selected' : ''}" data-idx="${idx}" role="option" aria-selected="${idx === indeksAktif}">
            <span class="cmd-palette-icon">${it.ikon}</span>
            <span class="cmd-palette-meta">
              <span class="cmd-palette-title">${escapeHtml(it.judul)}</span>
              <span class="cmd-palette-sub">${escapeHtml(it.sub)}</span>
            </span>
            <span class="cmd-palette-hint">${escapeHtml(it.hint)}</span>
          </button>
        `;
      });

      listEl.innerHTML = html;
      listEl.querySelectorAll('.cmd-palette-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-idx'));
          jalankanItem(hasilFilter[idx]);
        });
      });
    };

    inputEl.addEventListener('input', () => {
      indeksAktif = 0;
      renderDaftar();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (!hasilFilter.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        indeksAktif = (indeksAktif + 1) % hasilFilter.length;
        renderDaftar();
        listEl.querySelector('.cmd-palette-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        indeksAktif = (indeksAktif - 1 + hasilFilter.length) % hasilFilter.length;
        renderDaftar();
        listEl.querySelector('.cmd-palette-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        jalankanItem(hasilFilter[indeksAktif]);
      }
    });

    renderDaftar();
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
    $('#btn-scroll-top')?.classList.remove('is-visible');
    $('.topbar')?.classList.remove('is-scrolled');

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

    // Bersihkan listener & resource modul sebelumnya agar bebas memory/event leak
    if (typeof this._activeCleanup === 'function') {
      try {
        this._activeCleanup();
      } catch (err) {
        console.warn('Cleanup modul sebelumnya gagal:', err);
      }
      this._activeCleanup = null;
    }

    const renderToken = ++this._renderSeq;

    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    content.classList.remove('masuk');
    requestAnimationFrame(() => {
      content.classList.add('masuk');
    });

    const isPos = rute && rute.id === 'pos';
    document.body.classList.toggle('pos-route-active', isPos);
    const appEl = document.querySelector('.app');
    if (appEl) {
      appEl.classList.toggle('pos-mode', isPos);
    }
    content.classList.toggle('pos-content-locked', isPos);

    let maybeCleanup = null;
    if (rute.id === 'pos') {
      maybeCleanup = renderPosModule(content);
    } else if (rute.id === 'dashboard') {
      maybeCleanup = renderLaporanModule(content);
    } else if (rute.id === 'sistem') {
      this.renderHalamanSistem(content);
    } else if (rute.id === 'desainsistem') {
      this.renderHalamanDesainSistem(content);
    } else if (rute.id === 'kategori') {
      maybeCleanup = renderKategoriModule(content);
    } else if (rute.id === 'produk') {
      maybeCleanup = renderProdukModule(content);
    } else if (rute.id === 'supplier') {
      maybeCleanup = renderSupplierModule(content);
    } else if (rute.id === 'pembelian') {
      maybeCleanup = renderPembelianModule(content);
    } else if (rute.id === 'kartu-stok') {
      maybeCleanup = renderKartuStokModule(content);
    } else if (rute.id === 'opname') {
      maybeCleanup = renderOpnameModule(content);
    } else if (rute.id === 'hutang-piutang') {
      maybeCleanup = renderHutangPiutangModule(content);
    } else if (rute.id === 'retur') {
      maybeCleanup = renderReturModule(content);
    } else if (rute.id === 'biaya') {
      maybeCleanup = renderBiayaModule(content);
    } else if (rute.id === 'pelanggan') {
      maybeCleanup = renderPelangganModule(content);
    } else if (rute.id === 'loyalti') {
      maybeCleanup = renderLoyaltiModule(content);
    } else if (rute.id === 'pricetag') {
      maybeCleanup = renderPriceTagModule(content);
    } else if (rute.id === 'pengaturan') {
      maybeCleanup = renderPengaturanModule(content);
    } else if (rute.id === 'users') {
      maybeCleanup = renderUsersModule(content);
    } else if (rute.id === 'lainnya') {
      this.renderHalamanLainnya(content);
    } else {
      this.renderPlaceholder(content, rute);
    }

    if (typeof maybeCleanup === 'function') {
      this._activeCleanup = maybeCleanup;
    } else if (maybeCleanup && typeof maybeCleanup.then === 'function') {
      maybeCleanup.then((fn) => {
        if (typeof fn !== 'function') return;
        if (renderToken === this._renderSeq) {
          this._activeCleanup = fn;
        } else {
          try { fn(); } catch (_) {}
        }
      }).catch(() => {});
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
      biaya: 'Pencatatan kas operasional, petty cash kasir & beban toko',
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

/**
 * app.js — Router & Shell Aplikasi POS Kasir Toko Bangunan
 * Vanilla JS (ES Modules) tanpa build step
 */

import { CONFIG, setApiUrl } from './config.js';
import { ROUTES, cariRute } from './routes.js';
import { apiCall } from './api.js';
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

class App {
  constructor() {
    this.currentRoute = null;
  }

  init() {
    initTheme();
    this.renderShell();
    this.bindGlobalEvents();
    this.initRouter();
    this.registerServiceWorker();

    // Sinkronkan status koneksi online/offline pada badge net-pill
    const pill = $('#net-pill');
    if (pill) {
      if (navigator.onLine) {
        pill.classList.remove('is-offline');
      } else {
        pill.classList.add('is-offline');
      }
    }

    // Verifikasi sesi saat aplikasi dimuat
    const token = store.get('token');
    if (token) {
      apiCall('auth.me', {})
        .then((res) => {
          store.set('user', res.user);
          this.updateUserUI(res.user);
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

  registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Registrasi Service Worker gagal:', err);
      });
    }
  }

  renderShell() {
    const appEl = $('#app');
    if (!appEl) return;

    appEl.innerHTML = `
      <div class="app">
        <!-- Sidebar Desktop / Tablet Rail -->
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            <div class="brand-logo">${ICONS.store}</div>
            <div class="brand-text">
              <span>POS Toko</span>
              <small>Toko Bangunan</small>
            </div>
          </div>

          <nav class="sidebar-nav" id="sidebar-nav">
            <!-- Nav links akan di-render dinamis -->
          </nav>

          <div class="sidebar-footer">
            <button type="button" class="btn btn-sm btn-icon" id="btn-theme-sidebar" title="Ubah Tema" aria-label="Ubah Tema">
              ${ICONS.moon}
            </button>
            <button type="button" class="btn btn-sm btn-icon" id="btn-font-sidebar" title="Ukuran Font" aria-label="Ukuran Font">
              <span class="fw-bold" style="font-size: 13px;">Aa</span>
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
            <div class="topbar-logo">
              <div class="brand-logo">${ICONS.store}</div>
            </div>
            <h1 class="topbar-title" id="topbar-title">POS Kasir</h1>

            <div class="topbar-actions">
              <span class="badge badge-warning net-pill ${typeof navigator !== 'undefined' && navigator.onLine ? '' : 'is-offline'}" id="net-pill">Offline</span>

              <button type="button" class="btn btn-ghost btn-icon btn-sm" id="btn-theme-top" title="Ubah Tema" aria-label="Ubah Tema">
                ${ICONS.moon}
              </button>

              <button type="button" class="btn btn-ghost btn-icon btn-sm" id="btn-font-top" title="Ukuran Teks" aria-label="Ukuran Teks">
                <span class="fw-bold" style="font-size: 13px;">Aa</span>
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
          <a href="${r.path}" class="nav-link" data-path="${r.path}" id="nav-side-${r.id}">
            ${r.icon}
            <span class="nav-label">${escapeHtml(r.shortTitle || r.title)}</span>
            <span class="nav-fase">${escapeHtml(r.fase)}</span>
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
  }

  bindGlobalEvents() {
    const toggleTemaHandler = () => {
      const mode = toggleTheme();
      showToast(`Tema beralih ke mode ${mode === 'dark' ? 'Gelap' : 'Terang'}`, 'info', 1800);
    };

    const toggleFontHandler = () => {
      const mode = toggleFontSize();
      showToast(`Ukuran teks: ${mode === 'besar' ? 'Besar' : 'Normal'}`, 'info', 1800);
    };

    $('#btn-theme-top')?.addEventListener('click', toggleTemaHandler);
    $('#btn-theme-sidebar')?.addEventListener('click', toggleTemaHandler);
    $('#btn-font-top')?.addEventListener('click', toggleFontHandler);
    $('#btn-font-sidebar')?.addEventListener('click', toggleFontHandler);

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
      const isLogged = pastikanLogin((user) => {
        this.cekIzinDanRender(rute, user);
      });
      if (!isLogged) return;
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

    content.classList.remove('masuk');
    void content.offsetWidth;
    content.classList.add('masuk');

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
          <div>
            <button type="button" class="btn btn-primary" id="btn-ping-sistem">
              ${ICONS.refresh}
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
      </div>
    `;

    const inputUrl = $('#cfg-api-url', container);
    const btnSimpan = $('#btn-simpan-api-url', container);
    const btnPing = $('#btn-ping-sistem', container);
    const hasilDiv = $('#hasil-diagnostik', container);

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
              <div class="row">
                <span class="badge badge-success" style="font-size: 14px; padding: 4px 10px;">✔ Terhubung</span>
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
  /* HALAMAN MENU LAINNYA (MOBILE GRID)                                       */
  /* ======================================================================== */
  renderHalamanLainnya(container) {
    const user = store.get('user');
    const userRole = user ? user.role : 'kasir';

    const listRoutes = ROUTES.filter((r) => {
      if (r.id === 'lainnya') return false;
      if (r.roles && !r.roles.includes(userRole)) return false;
      return true;
    });

    let html = `
      <div class="stack">
        <div class="page-header">
          <div>
            <h2>Semua Menu Aplikasi</h2>
            <p>Daftar seluruh modul dan fitur POS Toko Bangunan sesuai peran Anda</p>
          </div>
        </div>

        <div class="menu-grid">
    `;

    listRoutes.forEach((r) => {
      html += `
        <a href="${r.path}" class="menu-tile card">
          <div class="list-item-icon">${r.icon}</div>
          <span>${escapeHtml(r.shortTitle || r.title)}</span>
          <span class="text-xs text-muted" style="font-size: 10px;">${escapeHtml(r.fase)}</span>
        </a>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
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

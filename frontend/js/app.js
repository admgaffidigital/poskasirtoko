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
              <span class="badge badge-warning net-pill is-offline" id="net-pill">Offline</span>

              <button type="button" class="btn btn-ghost btn-icon btn-sm" id="btn-theme-top" title="Ubah Tema" aria-label="Ubah Tema">
                ${ICONS.moon}
              </button>

              <button type="button" class="btn btn-ghost btn-icon btn-sm" id="btn-font-top" title="Ukuran Teks" aria-label="Ukuran Teks">
                <span class="fw-bold" style="font-size: 13px;">Aa</span>
              </button>

              <a href="#/sistem" class="btn btn-ghost btn-icon btn-sm" title="Status Sistem" aria-label="Status Sistem">
                ${ICONS.database}
              </a>
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

  renderSidebar() {
    const navEl = $('#sidebar-nav');
    if (!navEl) return;

    // Kelompokkan rute berdasarkan group
    const groups = {};
    ROUTES.forEach((r) => {
      if (r.id === 'lainnya') return; // Sembunyikan 'lainnya' di sidebar desktop
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
    // Tombol Toggle Tema & Font
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

    // Pemantauan Online/Offline
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

    // Perbarui judul Top Bar
    const titleEl = $('#topbar-title');
    if (titleEl) titleEl.textContent = rute.title;

    // Perbarui penanda link aktif
    $$('.nav-link, .bottomnav-link').forEach((link) => {
      if (link.getAttribute('data-path') === rute.path) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Render halaman
    this.renderPage(rute);
  }

  renderPage(rute) {
    const content = $('#page-content');
    if (!content) return;

    // Animasi transisi halus
    content.classList.remove('masuk');
    void content.offsetWidth;
    content.classList.add('masuk');

    if (rute.id === 'sistem') {
      this.renderHalamanSistem(content);
    } else if (rute.id === 'desainsistem') {
      this.renderHalamanDesainSistem(content);
    } else if (rute.id === 'lainnya') {
      this.renderHalamanLainnya(content);
    } else {
      // Halaman placeholder untuk modul fase berikutnya
      this.renderPlaceholder(content, rute);
    }
  }

  /* ======================================================================== */
  /* HALAMAN STATUS SISTEM (FASE 0)                                           */
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
            <div class="field-hint">URL deployment Web App diperoleh dari menu Deploy > New deployment di Apps Script.</div>
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

        <div class="card">
          <div class="card-header">
            <span class="card-title">Panduan Ringkas Setup Database (Apps Script)</span>
          </div>
          <div class="card-body stack-sm text-sm">
            <p>1. Buka Google Spreadsheet baru (misal: <strong>DB POS Toko Bangunan</strong>).</p>
            <p>2. Klik menu <strong>Extensions > Apps Script</strong>.</p>
            <p>3. Salin isi file <code>backend/kode.gs</code> ke editor skrip Apps Script.</p>
            <p>4. Pada toolbar atas, pilih fungsi <code>setupDatabase</code> lalu klik <strong>Run</strong> dan izinkan akses.</p>
            <p>5. Catat <strong>PIN Owner awal</strong> yang dimunculkan pada kotak dialog.</p>
            <p>6. Klik menu <strong>Deploy > New deployment > Web app</strong> (Execute as: <em>Me</em>, Who has access: <em>Anyone</em>).</p>
            <p>7. Salin URL Web App dan tempelkan pada kolom URL di atas, lalu klik <strong>Simpan & Uji</strong>.</p>
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
              <dd>${res.db_siap ? '<span class="text-success fw-bold">Siap (Semua sheet & kolom lengkap)</span>' : '<span class="text-danger fw-bold">Belum Siap (Jalankan setupDatabase())</span>'}</dd>

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
            <div class="text-xs text-muted">
              Pastikan Anda telah melakukan deploy Apps Script sebagai Web App dengan izin: <em>Execute as: Me</em> dan <em>Who has access: Anyone</em>.
            </div>
          </div>
        `;
        showToast(err.message, 'error', 5000);
      } finally {
        btnPing.removeAttribute('aria-busy');
        btnPing.disabled = false;
      }
    });

    // Otomatis ping jika URL sudah terisi
    if (CONFIG.API_URL) {
      btnPing?.click();
    }
  }

  /* ======================================================================== */
  /* HALAMAN DESIGN SYSTEM & GALERI KOMPONEN (FASE 0)                         */
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

        <!-- Bagian Warna & Token -->
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

        <!-- Bagian Tombol -->
        <div class="card card-body stack">
          <div class="section-title">Varian Tombol</div>
          <div class="row">
            <button type="button" class="btn btn-primary">Primary</button>
            <button type="button" class="btn btn-secondary">Secondary</button>
            <button type="button" class="btn btn-ghost">Ghost</button>
            <button type="button" class="btn btn-success">Success</button>
            <button type="button" class="btn btn-danger">Danger</button>
            <button type="button" class="btn btn-primary" disabled>Disabled</button>
          </div>
          <div class="row">
            <button type="button" class="btn btn-primary btn-sm">Small</button>
            <button type="button" class="btn btn-primary">Regular</button>
            <button type="button" class="btn btn-primary btn-lg">Large</button>
            <button type="button" class="btn btn-primary btn-icon">${ICONS.cart}</button>
          </div>
        </div>

        <!-- Bagian Form -->
        <div class="card card-body stack">
          <div class="section-title">Elemen Formulir</div>
          <div class="form-grid cols-2">
            <div class="field">
              <label class="field-label">Input Teks Standar <span class="wajib">*</span></label>
              <input type="text" class="input" placeholder="Masukkan nama barang...">
              <span class="field-hint">Keterangan pembantu pengguna</span>
            </div>

            <div class="field">
              <label class="field-label">Input Nominal Rupiah</label>
              <div class="input-prefix">
                <span>Rp</span>
                <input type="text" class="input input-num" value="150.000">
              </div>
            </div>

            <div class="field">
              <label class="field-label">Pilihan (Select)</label>
              <select class="select">
                <option>Semen Padang 50kg</option>
                <option>Cat Avian 1kg</option>
                <option>Paku 5cm</option>
              </select>
            </div>

            <div class="field">
              <label class="field-label">Switch Toggle</label>
              <label class="switch">
                <input type="checkbox" checked>
                <span class="switch-track"></span>
                <span class="text-sm">Status Aktif Produk</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Bagian Dialog & Notifikasi Interaktif -->
        <div class="card card-body stack">
          <div class="section-title">Uji Interaktif Dialog & Toast</div>
          <div class="row">
            <button type="button" class="btn btn-secondary" id="btn-test-toast-success">Toast Sukses</button>
            <button type="button" class="btn btn-secondary" id="btn-test-toast-error">Toast Gagal</button>
            <button type="button" class="btn btn-secondary" id="btn-test-modal">Buka Modal</button>
            <button type="button" class="btn btn-secondary" id="btn-test-sheet">Buka Bottom Sheet</button>
            <button type="button" class="btn btn-danger" id="btn-test-confirm">Dialog Konfirmasi Hapus</button>
          </div>
        </div>
      </div>
    `;

    // Pasang event listener untuk demonstrasi interaktif
    $('#btn-test-toast-success', container)?.addEventListener('click', () => {
      showToast('Transaksi penjualan INV-20261112-0001 berhasil disimpan!', 'success');
    });

    $('#btn-test-toast-error', container)?.addEventListener('click', () => {
      showToast('Harga jual tidak boleh di bawah HPP (Rp 52.000)', 'error');
    });

    $('#btn-test-modal', container)?.addEventListener('click', () => {
      showModal({
        title: 'Pratinjau Nota POS',
        body: `
          <div class="stack-sm text-sm">
            <div class="text-center fw-bold text-lg">TOKO BANGUNAN MAKMUR</div>
            <div class="text-center text-xs text-muted">Jl. Raya Industri No. 45 • Telp: 0812-3456-7890</div>
            <div class="divider"></div>
            <div class="row-between"><span>Semen Gresik 50kg (2 sak)</span><span class="num">Rp 120.000</span></div>
            <div class="row-between"><span>Pasir Pasang (1 truk)</span><span class="num">Rp 650.000</span></div>
            <div class="divider"></div>
            <div class="row-between fw-bold"><span>TOTAL</span><span class="num">Rp 770.000</span></div>
          </div>
        `,
        footer: `<button type="button" class="btn btn-primary btn-block btn-close-modal">Tutup Pratinjau</button>`
      });
    });

    $('#btn-test-sheet', container)?.addEventListener('click', () => {
      showModal({
        title: 'Pilihan Pembayaran Cepat',
        isSheet: true,
        body: `
          <div class="list">
            <button type="button" class="list-item">
              <div class="list-item-icon">${ICONS.wallet}</div>
              <div class="grow">
                <div class="list-item-title">Tunai (Cash)</div>
                <div class="list-item-sub">Pembayaran tunai di kasir</div>
              </div>
            </button>
            <button type="button" class="list-item">
              <div class="list-item-icon">${ICONS.cashier}</div>
              <div class="grow">
                <div class="list-item-title">QRIS Statis / Dinamis</div>
                <div class="list-item-sub">Scan langsung lewat m-Banking</div>
              </div>
            </button>
          </div>
        `
      });
    });

    $('#btn-test-confirm', container)?.addEventListener('click', async () => {
      const setuju = await showConfirm({
        title: 'Konfirmasi Void Transaksi',
        message: 'Apakah Anda yakin ingin membatalkan transaksi ini? Stok barang akan dikembalikan ke saldo sistem.',
        confirmText: 'Ya, Void Transaksi',
        danger: true
      });
      if (setuju) {
        showToast('Transaksi berhasil dibatalkan (Void).', 'warning');
      } else {
        showToast('Batal melakukan void.', 'info');
      }
    });
  }

  /* ======================================================================== */
  /* HALAMAN MENU LAINNYA (MOBILE GRID)                                       */
  /* ======================================================================== */
  renderHalamanLainnya(container) {
    const listRoutes = ROUTES.filter((r) => r.id !== 'lainnya');

    let html = `
      <div class="stack">
        <div class="page-header">
          <div>
            <h2>Semua Menu Aplikasi</h2>
            <p>Daftar seluruh modul dan fitur POS Toko Bangunan</p>
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
                <a href="#/sistem" class="btn btn-secondary">${ICONS.database} Cek Koneksi Backend</a>
                <a href="#/desainsistem" class="btn btn-ghost">${ICONS.grid} Galeri Komponen</a>
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

/**
 * pos.js — Modul POS Kasir Penjualan Lengkap (Fase 2)
 * Fitur:
 * - Katalog produk (Grid & List view), kategori filter, cari instan
 * - Scan barcode kamera + deteksi scanner barcode fisik (USB/Bluetooth)
 * - Multi varian & multi satuan konversi
 * - Desimal qty (maks 3 digit, cth: 2.5 kg, 12.75 m)
 * - Diskon item & transaksi (nominal/persen) dengan pembatasan kasir (maks 10%)
 * - Ubah harga per item dengan validasi ketat harga ≥ HPP
 * - Tampilan harga HPP hanya untuk Owner/Admin (Kasir aman)
 * - Auto-switch harga grosir saat qty >= min_grosir_qty
 * - Tahan / Pending transaksi (Hold Cart) & lanjutkan draft
 * - Metode bayar: Tunai, QRIS, Transfer, Tempo (khusus member), Kombinasi
 * - Pengiriman: Ambil di toko / Dikirim toko dengan status barang dibawa (qty_dibawa)
 * - Aturan tempo: hanya member dan wajib dalam batas limit kredit
 * - Nomor nota INV-YYYYMMDD-0001 via Counter
 * - Cetak struk ESC/POS Bluetooth 58/80mm, RawBT, dan Cetak Browser + WhatsApp
 * - Void transaksi dengan alasan wajib (Owner & Admin)
 * - Keyboard shortcuts: F2 (Cari), F4 (Bayar), F7 (Tahan), F8 (Daftar Tahan)
 */

import { api } from '../api.js';
import { store } from '../state.js';
import { formatRupiah, parseRupiah, formatQty, parseQty, formatTanggal, escapeHtml } from '../utils/format.js';
import { showToast, showModal, ICONS } from '../utils/ui.js';
import { cetakBluetooth, cetakRawBT, cetakBrowser, buatTautanWhatsApp } from '../utils/printer.js';
import { bunyikanBeep, bukaKameraScanner, pasangScannerFisik } from '../utils/barcode.js';

export function renderPosModule(container) {
  // POS State
  const state = {
    katalog: [],
    kategori: [],
    kategoriAktif: 'semua',
    kataKunci: '',
    viewMode: localStorage.getItem('pos_view_mode') || 'grid', // 'grid' | 'list'
    mobileView: 'catalog', // 'catalog' | 'cart'
    keranjang: [],
    pelanggan: null, // null = Pelanggan Umum
    diskonTransaksi: { tipe: '', nilai: 0 },
    pengiriman: 'ambil', // 'ambil' | 'dikirim'
    alamatKirim: '',
    catatan: '',
    pendingCount: 0,
    pengaturan: store.get('pengaturan') || {},
    user: store.get('user') || {},
    isLoading: true
  };

  const isOwnerAtauAdmin = state.user.role === 'owner' || state.user.role === 'admin';

  // Render Shell POS Layout
  container.innerHTML = `
    <!-- Navigasi Tab Mobile (Hanya muncul di HP / Layar < 992px) -->
    <div class="pos-mobile-nav segmented no-print" role="tablist">
      <button type="button" id="pos-tab-catalog" class="active" aria-pressed="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <span>Katalog</span>
      </button>
      <button type="button" id="pos-tab-cart" aria-pressed="false">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span>Keranjang</span>
        <span class="badge badge-primary" id="mobile-cart-badge" style="display: none; padding: 2px 7px; font-size: 11px;">0</span>
      </button>
    </div>

    <div class="pos-wrapper" id="pos-wrapper" data-mobile-view="catalog">
      <!-- PANEL KIRI: KATALOG PRODUK -->
      <div class="pos-catalog-panel">
        <!-- Top Toolbar: Pencarian, Barcode, Kategori, Toggle View -->
        <div class="pos-toolbar">
          <!-- Baris 1: Pencarian & Tombol Scanner Kamera -->
          <div class="pos-search-row">
            <div class="input-group grow" style="position: relative;">
              <span class="input-icon" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">
                ${ICONS.search}
              </span>
              <input type="text" id="pos-search-input" class="input" placeholder="Cari nama, SKU, barcode..." style="padding-left: 38px; width: 100%; border-radius: var(--radius-full);" autocomplete="off" />
              <button type="button" id="pos-search-clear" class="btn btn-ghost btn-icon btn-sm" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none;" aria-label="Hapus pencarian">
                ${ICONS.x}
              </button>
            </div>
            <button type="button" id="btn-scan-camera" class="btn btn-secondary btn-icon" style="border-radius: var(--radius-full); width: var(--control-h); height: var(--control-h); flex-shrink: 0;" title="Scan Barcode Kamera">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="6" x="7" y="9" rx="1"/></svg>
            </button>
          </div>

          <!-- Baris 2: Toggle Tampilan Grid/List & Kategori Filter Chips -->
          <div class="pos-filter-row">
            <div class="pos-view-toggle segmented" style="border-radius: var(--radius-full); padding: 2px; flex-shrink: 0;">
              <button type="button" id="btn-view-grid" class="btn btn-ghost btn-icon btn-sm ${state.viewMode === 'grid' ? 'active' : ''}" style="border-radius: var(--radius-full);" title="Tampilan Grid">
                ${ICONS.grid}
              </button>
              <button type="button" id="btn-view-list" class="btn btn-ghost btn-icon btn-sm ${state.viewMode === 'list' ? 'active' : ''}" style="border-radius: var(--radius-full);" title="Tampilan Baris">
                ${ICONS.list}
              </button>
            </div>

            <!-- Kategori Filter Chips Bar -->
            <div class="pos-category-chips" id="pos-category-bar">
              <button type="button" class="pos-chip ${state.kategoriAktif === 'semua' ? 'active' : ''}" data-cat="semua">
                Semua Produk
              </button>
            </div>
          </div>
        </div>

        <!-- Catalog Product Grid / List Container -->
        <div class="pos-product-area" id="pos-product-area">
          <div class="empty-state text-center" style="padding: var(--sp-8);">
            <div class="spinner" style="margin: 0 auto var(--sp-3);"></div>
            <div class="text-muted">Memuat katalog produk...</div>
          </div>
        </div>
      </div>

      <!-- PANEL KANAN: KERANJANG BELANJA -->
      <div class="pos-cart-panel">
        <!-- Tombol Kembali ke Katalog (Mobile Saja) -->
        <div class="pos-cart-back-btn no-print" style="padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); background: var(--surface-2);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-back-to-catalog" style="width: 100%; justify-content: center; gap: var(--sp-2); font-weight: var(--fw-semibold);">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>← Kembali / Tambah Barang Lagi</span>
          </button>
        </div>

        <!-- Cart Header -->
        <div class="pos-cart-header">
          <div class="row" style="justify-content: space-between; align-items: center; width: 100%;">
            <div class="row" style="gap: var(--sp-2); align-items: center;">
              <span style="color: var(--primary);">${ICONS.cart}</span>
              <div class="fw-bold" style="font-size: var(--fs-md);">Keranjang Belanja</div>
              <span class="badge badge-primary" id="cart-item-count">0</span>
            </div>
            <div class="row" style="gap: var(--sp-1);">
              <button type="button" id="btn-pending-list" class="btn btn-ghost btn-sm position-relative" title="Daftar Tahan / Pending (F8)">
                ${ICONS.clipboard}
                <span class="d-none-mobile">Tahan</span>
                <span class="badge badge-warning" id="pending-badge" style="display: none; padding: 2px 6px; font-size: 10px;">0</span>
              </button>
              <button type="button" id="btn-clear-cart" class="btn btn-ghost btn-icon btn-sm text-danger" title="Kosongkan Keranjang">
                ${ICONS.rotateCcw}
              </button>
            </div>
          </div>

          <!-- Pelanggan Info Pill -->
          <div class="pos-customer-pill" id="pos-customer-pill">
            <div class="row" style="justify-content: space-between; align-items: center; width: 100%;">
              <div class="row" style="gap: var(--sp-2); align-items: center; overflow: hidden;">
                <span style="color: var(--text-muted);">${ICONS.users}</span>
                <div class="text-truncate">
                  <span class="fw-medium text-xs" id="label-pelanggan-nama">Pelanggan Umum</span>
                  <span class="text-xs text-muted" id="label-pelanggan-sub">(Tunai / Non-Tempo)</span>
                </div>
              </div>
              <button type="button" id="btn-ganti-pelanggan" class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: var(--fs-xs);">
                Pilih Member
              </button>
            </div>
          </div>
        </div>

        <!-- Cart Items List -->
        <div class="pos-cart-items" id="pos-cart-items">
          <div class="empty-state text-center" style="padding: var(--sp-8); color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: var(--sp-2); opacity: 0.5;">🛒</div>
            <div>Keranjang masih kosong</div>
            <div class="text-xs text-muted">Pilih produk dari katalog atau scan barcode (F2)</div>
          </div>
        </div>

        <!-- Cart Summary & Actions Footer -->
        <div class="pos-cart-footer">
          <!-- Subtotal & Discount Row -->
          <div class="pos-summary-row">
            <span class="text-muted text-sm">Subtotal</span>
            <span class="fw-medium text-sm mono" id="cart-subtotal">Rp 0</span>
          </div>

          <div class="pos-summary-row" id="row-diskon-transaksi" style="cursor: pointer;">
            <div class="row" style="gap: 4px; align-items: center;">
              <span class="text-muted text-sm">Diskon Transaksi</span>
              <span class="badge badge-info" id="badge-diskon-trans" style="font-size: 10px; cursor: pointer;">+ Diskon</span>
            </div>
            <span class="text-danger text-sm mono fw-medium" id="cart-diskon-trans">- Rp 0</span>
          </div>

          <div class="pos-summary-row" id="row-pajak" style="display: none;">
            <span class="text-muted text-sm" id="label-pajak">PPN</span>
            <span class="text-sm mono fw-medium" id="cart-pajak">Rp 0</span>
          </div>

          <div class="pos-summary-row" id="row-pembulatan" style="display: none;">
            <span class="text-muted text-sm">Pembulatan</span>
            <span class="text-sm mono fw-medium" id="cart-pembulatan">Rp 0</span>
          </div>

          <div class="divider" style="margin: var(--sp-2) 0;"></div>

          <!-- Grand Total Row -->
          <div class="pos-total-row">
            <div>
              <div class="text-xs text-muted">TOTAL BELANJA</div>
              <div class="fw-bold pos-grand-total mono" id="cart-grand-total">Rp 0</div>
            </div>
          </div>

          <!-- Action Buttons: Hold & Pay -->
          <div class="row" style="gap: var(--sp-2); margin-top: var(--sp-3);">
            <button type="button" id="btn-hold-cart" class="btn btn-secondary btn-lg" style="flex: 1;" title="Tahan Transaksi (F7)">
              ${ICONS.clipboard} <span class="d-none-mobile">Tahan</span> (F7)
            </button>
            <button type="button" id="btn-checkout-pay" class="btn btn-primary btn-lg" style="flex: 2; font-weight: 700; font-size: var(--fs-md);" title="Bayar Sekarang (F4)">
              ${ICONS.wallet} BAYAR (F4)
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Bottom Cart Bar (Hanya di Mobile saat katalog aktif & keranjang ada isinya) -->
    <div class="pos-mobile-floating-cart no-print" id="pos-floating-cart" style="display: none;">
      <div class="row" style="align-items: center; gap: var(--sp-3);">
        <div class="pos-floating-icon" style="background: var(--primary-soft); color: var(--primary); width: 38px; height: 38px; border-radius: var(--radius-md); display: grid; place-items: center; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </div>
        <div>
          <div class="fw-bold mono" id="floating-cart-total" style="font-size: var(--fs-md); color: var(--primary); line-height: 1.2;">Rp 0</div>
          <div class="text-xs text-muted" id="floating-cart-count">0 item</div>
        </div>
      </div>
      <button type="button" class="btn btn-primary" id="btn-floating-view-cart" style="font-weight: var(--fw-bold); padding: 7px 15px; border-radius: var(--radius-full); box-shadow: 0 2px 8px rgba(230,81,0,0.3);">
        <span>Bayar / Cek</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  `;

  // Selector Shortcuts
  const elPosWrapper = container.querySelector('#pos-wrapper');
  const elTabCatalog = container.querySelector('#pos-tab-catalog');
  const elTabCart = container.querySelector('#pos-tab-cart');
  const elMobileCartBadge = container.querySelector('#mobile-cart-badge');
  const elFloatingCart = container.querySelector('#pos-floating-cart');
  const elFloatingCartTotal = container.querySelector('#floating-cart-total');
  const elFloatingCartCount = container.querySelector('#floating-cart-count');
  const elBtnFloatingCart = container.querySelector('#btn-floating-view-cart');
  const elBtnBackToCatalog = container.querySelector('#btn-back-to-catalog');
  const elSearch = container.querySelector('#pos-search-input');
  const elSearchClear = container.querySelector('#pos-search-clear');
  const elCategoryBar = container.querySelector('#pos-category-bar');
  const elProductArea = container.querySelector('#pos-product-area');
  const elCartItems = container.querySelector('#pos-cart-items');
  const elCartCount = container.querySelector('#cart-item-count');
  const elCartSubtotal = container.querySelector('#cart-subtotal');
  const elCartDiskon = container.querySelector('#cart-diskon-trans');
  const elBadgeDiskon = container.querySelector('#badge-diskon-trans');
  const elCartPajak = container.querySelector('#cart-pajak');
  const elRowPajak = container.querySelector('#row-pajak');
  const elCartPembulatan = container.querySelector('#cart-pembulatan');
  const elRowPembulatan = container.querySelector('#row-pembulatan');
  const elCartGrandTotal = container.querySelector('#cart-grand-total');
  const elBtnClear = container.querySelector('#btn-clear-cart');
  const elBtnHold = container.querySelector('#btn-hold-cart');
  const elBtnPendingList = container.querySelector('#btn-pending-list');
  const elBadgePending = container.querySelector('#pending-badge');
  const elBtnPay = container.querySelector('#btn-checkout-pay');
  const elBtnCustomer = container.querySelector('#btn-ganti-pelanggan');
  const elLabelPelNama = container.querySelector('#label-pelanggan-nama');
  const elLabelPelSub = container.querySelector('#label-pelanggan-sub');
  const elBtnCamera = container.querySelector('#btn-scan-camera');
  const elBtnGrid = container.querySelector('#btn-view-grid');
  const elBtnList = container.querySelector('#btn-view-list');

  // ---------- Kontrol Navigasi Tampilan Mobile POS ----------
  function setMobileView(view) {
    state.mobileView = view;
    if (elPosWrapper) elPosWrapper.setAttribute('data-mobile-view', view);
    if (elTabCatalog && elTabCart) {
      elTabCatalog.classList.toggle('active', view === 'catalog');
      elTabCatalog.setAttribute('aria-pressed', view === 'catalog' ? 'true' : 'false');
      elTabCart.classList.toggle('active', view === 'cart');
      elTabCart.setAttribute('aria-pressed', view === 'cart' ? 'true' : 'false');
    }
    perbaruiFloatingCart();
    if (view === 'cart') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function perbaruiFloatingCart() {
    const count = state.keranjang.length;
    if (elMobileCartBadge) {
      elMobileCartBadge.textContent = count;
      elMobileCartBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (!elFloatingCart) return;
    if (state.mobileView === 'catalog' && count > 0) {
      elFloatingCart.style.display = 'flex';
    } else {
      elFloatingCart.style.display = 'none';
    }
  }

  elTabCatalog?.addEventListener('click', () => setMobileView('catalog'));
  elTabCart?.addEventListener('click', () => setMobileView('cart'));
  elBtnFloatingCart?.addEventListener('click', () => setMobileView('cart'));
  elBtnBackToCatalog?.addEventListener('click', () => setMobileView('catalog'));

  // ---------- Inisialisasi Data ----------
  async function muatDataKatalog() {
    state.isLoading = true;
    try {
      // Ambil kategori & produk aktif
      const [resKat, resProd, resPeng, resPending] = await Promise.all([
        api.post('kategori.list', { aktif_saja: true }),
        api.post('produk.list', { aktif_saja: true, limit: 300 }),
        api.post('pengaturan.get'),
        api.post('penjualan.pending.list')
      ]);

      if (resKat.ok) state.kategori = resKat.data.items || [];
      if (resProd.ok) state.katalog = resProd.data.items || [];
      if (resPeng.ok) {
        state.pengaturan = resPeng.data || {};
        store.set('pengaturan', state.pengaturan);
      }
      if (resPending.ok) {
        state.pendingCount = (resPending.data.items || []).length;
        perbaruiBadgePending();
      }

      renderKategoriBar();
      renderKatalog();
    } catch (err) {
      console.error('Gagal memuat katalog POS:', err);
      showToast('Gagal memuat data katalog: ' + err.message, 'error');
    } finally {
      state.isLoading = false;
    }
  }

  function perbaruiBadgePending() {
    if (state.pendingCount > 0) {
      elBadgePending.textContent = state.pendingCount;
      elBadgePending.style.display = 'inline-block';
    } else {
      elBadgePending.style.display = 'none';
    }
  }

  // ---------- Render Kategori Bar ----------
  function renderKategoriBar() {
    let html = `
      <button type="button" class="pos-chip ${state.kategoriAktif === 'semua' ? 'active' : ''}" data-cat="semua">
        Semua (${state.katalog.length})
      </button>
    `;

    // Kelompokkan parent dan sub-kategori
    const parents = state.kategori.filter((k) => !k.parent_id);
    parents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

    const subsByParent = {};
    state.kategori.forEach((k) => {
      if (k.parent_id) {
        if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
        subsByParent[k.parent_id].push(k);
      }
    });

    parents.forEach((kat) => {
      const subs = subsByParent[kat.id] || [];
      subs.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

      // Total barang di kategori induk + seluruh sub-kategorinya
      const subIds = subs.map((s) => s.id);
      const targetIds = new Set([kat.id, ...subIds]);
      const jumlahTotal = state.katalog.filter((p) => targetIds.has(p.kategori_id)).length;

      const isAktif = state.kategoriAktif === kat.id;
      const anakAktif = subs.some((s) => s.id === state.kategoriAktif);

      html += `
        <button type="button" class="pos-chip ${isAktif ? 'active' : ''}" data-cat="${kat.id}">
          ${escapeHtml(kat.nama)} (${jumlahTotal})
        </button>
      `;

      // Jika kategori induk atau salah satu sub-kategorinya sedang aktif, munculkan chip sub-kategori di sebelahnya
      if (isAktif || anakAktif) {
        subs.forEach((sub) => {
          const subJumlah = state.katalog.filter((p) => p.kategori_id === sub.id).length;
          const isSubAktif = state.kategoriAktif === sub.id;
          html += `
            <button type="button" class="pos-chip ${isSubAktif ? 'active' : ''}" data-cat="${sub.id}" style="border-left: 2px solid var(--primary); padding-left: 8px;">
              ↳ ${escapeHtml(sub.nama)} (${subJumlah})
            </button>
          `;
        });
      }
    });

    // Handle orphans jika ada
    const orphans = state.kategori.filter((k) => k.parent_id && !parents.some((p) => p.id === k.parent_id));
    orphans.forEach((kat) => {
      const jumlah = state.katalog.filter((p) => p.kategori_id === kat.id).length;
      html += `
        <button type="button" class="pos-chip ${state.kategoriAktif === kat.id ? 'active' : ''}" data-cat="${kat.id}">
          ${escapeHtml(kat.nama)} (${jumlah})
        </button>
      `;
    });

    elCategoryBar.innerHTML = html;

    elCategoryBar.querySelectorAll('.pos-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.kategoriAktif = btn.getAttribute('data-cat');
        renderKategoriBar();
        renderKatalog();
      });
    });
  }

  // ---------- Render Produk Katalog ----------
  function renderKatalog() {
    let filtered = state.katalog;

    // Filter kategori (mencakup produk di kategori induk maupun sub-kategori di bawahnya)
    if (state.kategoriAktif !== 'semua') {
      const subs = state.kategori.filter((k) => k.parent_id === state.kategoriAktif).map((k) => k.id);
      const targetCatIds = new Set([state.kategoriAktif, ...subs]);
      filtered = filtered.filter((p) => targetCatIds.has(p.kategori_id));
    }

    // Filter pencarian
    const q = state.kataKunci.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter((p) => {
        if ((p.nama || '').toLowerCase().includes(q)) return true;
        if ((p.sku || '').toLowerCase().includes(q)) return true;
        if ((p.barcode || '').toLowerCase().includes(q)) return true;
        return (p.varian || []).some((v) =>
          (v.nama_varian || '').toLowerCase().includes(q) ||
          (v.sku || '').toLowerCase().includes(q) ||
          (v.barcode || '').toLowerCase().includes(q)
        );
      });
    }

    if (filtered.length === 0) {
      elProductArea.innerHTML = `
        <div class="empty-state text-center" style="padding: var(--sp-8); color: var(--text-muted); width: 100%; border: 1px dashed var(--border); border-radius: var(--radius-xl); background: var(--surface);">
          <div style="font-size: 32px; margin-bottom: var(--sp-2);">🔍</div>
          <div class="fw-semibold text-base" style="color: var(--text);">Tidak ada produk yang cocok</div>
          <div class="text-xs text-muted" style="margin-top: 4px;">Coba ubah kata kunci pencarian atau pilih kategori lain</div>
        </div>
      `;
      return;
    }

    if (state.viewMode === 'grid') {
      renderKatalogGrid(filtered);
    } else {
      renderKatalogList(filtered);
    }
  }

  function renderKatalogGrid(items) {
    let html = `<div class="pos-grid-container">`;

    items.forEach((p) => {
      const punyaVarian = p.punya_varian && (p.varian || []).length > 0;
      const punyaSatuanKonversi = (p.satuan_konversi || []).length > 0;

      let badgeStok = '';
      const stok = Number(p.stok || 0);
      const stokMin = Number(p.stok_min || 0);

      if (stok <= 0) {
        badgeStok = `<span class="badge badge-danger">Habis</span>`;
      } else if (stok <= stokMin) {
        badgeStok = `<span class="badge badge-warning">${formatQty(stok)} ${escapeHtml(p.satuan_dasar)}</span>`;
      } else {
        badgeStok = `<span class="badge badge-success">${formatQty(stok)} ${escapeHtml(p.satuan_dasar)}</span>`;
      }

      let hppTag = '';
      if (isOwnerAtauAdmin && p.hpp) {
        hppTag = `<span class="badge badge-info" style="font-size: 9px; padding: 1px 5px;">HPP ${formatRupiah(p.hpp)}</span>`;
      }

      let infoOpsi = '';
      if (punyaVarian) {
        infoOpsi = `<span class="badge badge-dot" style="font-size: 10px; background: rgba(255,255,255,0.85); color: var(--text);">${p.varian.length} Varian</span>`;
      } else if (punyaSatuanKonversi) {
        infoOpsi = `<span class="badge badge-dot" style="font-size: 10px; background: rgba(255,255,255,0.85); color: var(--text);">${p.satuan_konversi.length + 1} Satuan</span>`;
      }

      const kodeItem = (p.sku || p.barcode) ? escapeHtml(p.sku || p.barcode) : '';

      html += `
        <div class="pos-product-card" data-id="${p.id}" tabindex="0">
          <div class="pos-card-visual">
            <div class="pos-card-icon-wrap">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div class="pos-card-badges-top">
              ${badgeStok}
            </div>
            ${infoOpsi ? `<div class="pos-card-badges-left">${infoOpsi}</div>` : ''}
          </div>

          <div class="pos-card-content">
            <div class="pos-card-meta-row">
              <span class="pos-card-sku">${kodeItem ? `SKU: ${kodeItem}` : ''}</span>
              ${hppTag}
            </div>

            <div class="pos-card-title" title="${escapeHtml(p.nama)}">${escapeHtml(p.nama)}</div>

            <div class="pos-card-bottom">
              <div class="pos-card-pricing">
                <div class="pos-card-price-main">
                  <span class="pos-card-price-val">${formatRupiah(p.harga_ritel)}</span>
                  <span class="pos-card-price-unit">/${escapeHtml(p.satuan_dasar)}</span>
                </div>
                ${p.harga_grosir && p.harga_grosir < p.harga_ritel ? `
                  <div class="pos-card-grosir-tag">
                    Grosir: ${formatRupiah(p.harga_grosir)} (≥${formatQty(p.min_grosir_qty || 1)})
                  </div>
                ` : ''}
              </div>

              <button type="button" class="pos-card-add-btn" data-id="${p.id}" title="Tambah" aria-label="Tambah">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    elProductArea.innerHTML = html;
    pasangAksiKlikKatalog();
  }

  function renderKatalogList(items) {
    let html = `<div class="pos-list-container">`;

    items.forEach((p) => {
      const punyaVarian = p.punya_varian && (p.varian || []).length > 0;
      const punyaSatuanKonversi = (p.satuan_konversi || []).length > 0;
      const stok = Number(p.stok || 0);
      const stokMin = Number(p.stok_min || 0);

      let badgeStok = '';
      if (stok <= 0) {
        badgeStok = `<span class="badge badge-danger">Habis</span>`;
      } else if (stok <= stokMin) {
        badgeStok = `<span class="badge badge-warning">${formatQty(stok)} ${escapeHtml(p.satuan_dasar)}</span>`;
      } else {
        badgeStok = `<span class="badge badge-success">${formatQty(stok)} ${escapeHtml(p.satuan_dasar)}</span>`;
      }

      let hppTag = '';
      if (isOwnerAtauAdmin && p.hpp) {
        hppTag = `<span class="badge badge-info" style="font-size: 9px; padding: 1px 5px;">HPP ${formatRupiah(p.hpp)}</span>`;
      }

      let infoOpsi = '';
      if (punyaVarian) {
        infoOpsi = `<span class="badge badge-dot" style="font-size: 10px; background: var(--surface-3);">${p.varian.length} Varian</span>`;
      } else if (punyaSatuanKonversi) {
        infoOpsi = `<span class="badge badge-dot" style="font-size: 10px; background: var(--surface-3);">${p.satuan_konversi.length + 1} Satuan</span>`;
      }

      const kodeItem = (p.sku || p.barcode) ? escapeHtml(p.sku || p.barcode) : '';

      html += `
        <div class="pos-list-item" data-id="${p.id}" tabindex="0">
          <div class="pos-list-avatar">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>

          <div class="pos-list-main">
            <div class="pos-list-title" title="${escapeHtml(p.nama)}">${escapeHtml(p.nama)}</div>
            <div class="pos-list-badges-row">
              ${badgeStok}
              ${kodeItem ? `<span class="pos-badge-sku">SKU: ${kodeItem}</span>` : ''}
              ${infoOpsi}
              ${hppTag}
            </div>
            ${p.harga_grosir && p.harga_grosir < p.harga_ritel ? `
              <div class="pos-list-grosir-tag">
                Grosir: ${formatRupiah(p.harga_grosir)} (≥${formatQty(p.min_grosir_qty || 1)})
              </div>
            ` : ''}
          </div>

          <div class="pos-list-action-col">
            <div class="pos-list-price-block">
              <span class="pos-list-price-val">${formatRupiah(p.harga_ritel)}</span>
              <span class="pos-list-unit">/${escapeHtml(p.satuan_dasar)}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm pos-btn-tambah-pill" data-id="${p.id}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              <span>Tambah</span>
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    elProductArea.innerHTML = html;
    pasangAksiKlikKatalog();
  }

  function pasangAksiKlikKatalog() {
    elProductArea.querySelectorAll('.pos-product-card, .pos-product-row, .pos-list-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-id');
        const p = state.katalog.find((x) => x.id === id);
        if (p) pilihProduk(p);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = el.getAttribute('data-id');
          const p = state.katalog.find((x) => x.id === id);
          if (p) pilihProduk(p);
        }
      });
    });
  }

  // ---------- Logika Pemilihan Produk & Varian/Satuan ----------
  function pilihProduk(p) {
    const punyaVarian = p.punya_varian && (p.varian || []).length > 0;
    const punyaSatuanKonversi = (p.satuan_konversi || []).length > 0;

    // Jika produk sederhana (tanpa varian dan tanpa satuan alternatif) -> langsung tambah ke keranjang
    if (!punyaVarian && !punyaSatuanKonversi) {
      tambahItemKeKeranjang({
        produk_id: p.id,
        varian_id: '',
        nama: p.nama,
        satuan: p.satuan_dasar,
        faktor: 1,
        qty: 1,
        qty_dibawa: 1,
        tipe_harga: 'ritel',
        harga_asli: p.harga_ritel,
        harga: p.harga_ritel,
        hpp: p.hpp || 0,
        diskon_tipe: '',
        diskon_nilai: 0,
        diskon: 0,
        subtotal: p.harga_ritel,
        _pr: p,
        _var: null
      });
      bunyikanBeep();
      return;
    }

    // Jika memiliki varian atau satuan bertingkat -> buka dialog pemilihan
    bukaModalPilihVarianSatuan(p);
  }

  function bukaModalPilihVarianSatuan(p) {
    const punyaVarian = p.punya_varian && (p.varian || []).length > 0;
    const varianList = punyaVarian ? p.varian.filter((v) => !v.deleted) : [];
    const satuanList = [{ satuan: p.satuan_dasar, faktor: 1, harga_ritel: p.harga_ritel, harga_grosir: p.harga_grosir }].concat(
      (p.satuan_konversi || []).filter((s) => !s.deleted)
    );

    let selectedVarian = varianList.length > 0 ? varianList[0] : null;
    let selectedSatuan = satuanList[0];

    const modal = showModal({
      title: `Pilih Varian & Satuan: ${p.nama}`,
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-4);">
          ${punyaVarian ? `
            <div>
              <label class="form-label fw-bold">Pilih Varian:</label>
              <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;" id="opt-varian-container">
                ${varianList.map((v, i) => `
                  <button type="button" class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-secondary'} btn-opt-var" data-vid="${v.id}">
                    ${escapeHtml(v.nama_varian)} (${formatRupiah(v.harga_ritel)})
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div>
            <label class="form-label fw-bold">Pilih Satuan:</label>
            <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;" id="opt-satuan-container">
              ${satuanList.map((s, i) => `
                <button type="button" class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-secondary'} btn-opt-sat" data-sat="${s.satuan}">
                  ${escapeHtml(s.satuan)} (Isi ${s.faktor} ${p.satuan_dasar})
                </button>
              `).join('')}
            </div>
          </div>

          <div class="row" style="gap: var(--sp-3); align-items: center;">
            <div style="flex: 1;">
              <label class="form-label">Jumlah Beli (Qty):</label>
              <div class="row" style="gap: var(--sp-1);">
                <button type="button" class="btn btn-secondary btn-icon" id="btn-modal-min">-</button>
                <input type="number" id="input-modal-qty" class="input text-center fw-bold" value="1" min="0.001" step="any" style="width: 90px;" />
                <button type="button" class="btn btn-secondary btn-icon" id="btn-modal-plus">+</button>
              </div>
            </div>
            <div style="flex: 1; text-align: right;">
              <div class="text-xs text-muted">Subtotal Estimasi:</div>
              <div class="fw-bold mono" id="modal-subtotal-est" style="font-size: var(--fs-lg); color: var(--primary);">
                Rp 0
              </div>
            </div>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-modal">Batal</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-masuk-keranjang">
            ${ICONS.cart} Masukkan Keranjang
          </button>
        </div>
      `
    });

    const elInputQty = modal.el.querySelector('#input-modal-qty');
    const elSubtotalEst = modal.el.querySelector('#modal-subtotal-est');

    const updateModalEst = () => {
      const q = parseQty(elInputQty.value) || 1;
      let hSat = selectedSatuan.harga_ritel;
      if (selectedVarian) {
        hSat = selectedVarian.harga_ritel * (selectedSatuan.faktor || 1);
      }
      const total = Math.round(hSat * q);
      elSubtotalEst.textContent = formatRupiah(total);
    };

    updateModalEst();

    // Varian Click
    modal.el.querySelectorAll('.btn-opt-var').forEach((btn) => {
      btn.addEventListener('click', () => {
        modal.el.querySelectorAll('.btn-opt-var').forEach((b) => b.className = 'btn btn-sm btn-secondary btn-opt-var');
        btn.className = 'btn btn-sm btn-primary btn-opt-var';
        const vid = btn.getAttribute('data-vid');
        selectedVarian = varianList.find((v) => v.id === vid);
        updateModalEst();
      });
    });

    // Satuan Click
    modal.el.querySelectorAll('.btn-opt-sat').forEach((btn) => {
      btn.addEventListener('click', () => {
        modal.el.querySelectorAll('.btn-opt-sat').forEach((b) => b.className = 'btn btn-sm btn-secondary btn-opt-sat');
        btn.className = 'btn btn-sm btn-primary btn-opt-sat';
        const sat = btn.getAttribute('data-sat');
        selectedSatuan = satuanList.find((s) => s.satuan === sat);
        updateModalEst();
      });
    });

    modal.el.querySelector('#btn-modal-min')?.addEventListener('click', () => {
      const cur = parseQty(elInputQty.value) || 1;
      if (cur > 1) {
        elInputQty.value = cur - 1;
        updateModalEst();
      }
    });

    modal.el.querySelector('#btn-modal-plus')?.addEventListener('click', () => {
      const cur = parseQty(elInputQty.value) || 0;
      elInputQty.value = cur + 1;
      updateModalEst();
    });

    elInputQty?.addEventListener('input', updateModalEst);

    modal.el.querySelector('#btn-batal-modal')?.addEventListener('click', () => modal.close());

    modal.el.querySelector('#btn-masuk-keranjang')?.addEventListener('click', () => {
      const qtyBeli = parseQty(elInputQty.value);
      if (qtyBeli <= 0) {
        showToast('Jumlah beli harus lebih dari 0.', 'warning');
        return;
      }

      const faktor = selectedSatuan.faktor || 1;
      const baseHpp = selectedVarian ? (selectedVarian.hpp || 0) : (p.hpp || 0);
      const snapshotHpp = Math.round(baseHpp * faktor);

      let namaItem = p.nama;
      if (selectedVarian) {
        namaItem += ` - ${selectedVarian.nama_varian}`;
      }

      let hargaJual = selectedSatuan.harga_ritel;
      if (selectedVarian) {
        hargaJual = Math.round(selectedVarian.harga_ritel * faktor);
      }

      tambahItemKeKeranjang({
        produk_id: p.id,
        varian_id: selectedVarian ? selectedVarian.id : '',
        nama: namaItem,
        satuan: selectedSatuan.satuan,
        faktor: faktor,
        qty: qtyBeli,
        qty_dibawa: qtyBeli,
        tipe_harga: 'ritel',
        harga_asli: hargaJual,
        harga: hargaJual,
        hpp: snapshotHpp,
        diskon_tipe: '',
        diskon_nilai: 0,
        diskon: 0,
        subtotal: Math.round(hargaJual * qtyBeli),
        _pr: p,
        _var: selectedVarian
      });

      bunyikanBeep();
      modal.close();
    });
  }

  // ---------- Manajemen Keranjang Belanja ----------
  function tambahItemKeKeranjang(itemBaru) {
    // Cari apakah item persis (produk_id, varian_id, satuan) sudah ada di keranjang
    const idx = state.keranjang.findIndex((it) =>
      it.produk_id === itemBaru.produk_id &&
      it.varian_id === itemBaru.varian_id &&
      it.satuan === itemBaru.satuan
    );

    if (idx !== -1) {
      // Tambahkan kuantitas
      state.keranjang[idx].qty = bulatQty(state.keranjang[idx].qty + itemBaru.qty);
      state.keranjang[idx].qty_dibawa = state.keranjang[idx].qty;
      hitungUlangItem(state.keranjang[idx]);
    } else {
      hitungUlangItem(itemBaru);
      state.keranjang.push(itemBaru);
    }

    renderKeranjang();
  }

  function bulatQty(val) {
    return Math.round(Number(val) * 1000) / 1000;
  }

  function hitungUlangItem(it) {
    // Cek auto-switch harga grosir (README aturan bisnis & 6.3)
    const p = it._pr;
    const minGrosir = Number(p.min_grosir_qty || 1);
    const punyaGrosir = p.harga_grosir && p.harga_grosir > 0;

    // Jika qty mencapai min_grosir dan belum diedit kustom manual
    if (it.tipe_harga !== 'kustom' && punyaGrosir && it.qty >= minGrosir && it.satuan === p.satuan_dasar) {
      it.tipe_harga = 'grosir';
      it.harga = p.harga_grosir;
    } else if (it.tipe_harga !== 'kustom' && it.satuan === p.satuan_dasar) {
      it.tipe_harga = 'ritel';
      it.harga = p.harga_ritel;
    }

    const subtotalKotor = Math.round(it.harga * it.qty);

    let diskonNominal = 0;
    if (it.diskon_tipe === 'persen') {
      diskonNominal = Math.round(subtotalKotor * (Number(it.diskon_nilai || 0) / 100));
    } else if (it.diskon_tipe === 'nominal') {
      diskonNominal = Math.min(Math.round(Number(it.diskon_nilai || 0)), subtotalKotor);
    }

    it.diskon = diskonNominal;
    it.subtotal = Math.max(0, subtotalKotor - diskonNominal);
  }

  function renderKeranjang() {
    elCartCount.textContent = state.keranjang.length;

    if (state.keranjang.length === 0) {
      elCartItems.innerHTML = `
        <div class="empty-state text-center" style="padding: var(--sp-8); color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: var(--sp-2); opacity: 0.5;">🛒</div>
          <div>Keranjang masih kosong</div>
          <div class="text-xs text-muted">Pilih produk dari katalog atau scan barcode (F2)</div>
        </div>
      `;
      hitungDanTampilkanTotal();
      return;
    }

    let html = '';

    state.keranjang.forEach((it, idx) => {
      const isGrosir = it.tipe_harga === 'grosir';
      const isKustom = it.tipe_harga === 'kustom';

      let labelTipeHarga = '';
      if (isGrosir) {
        labelTipeHarga = `<span class="badge badge-success" style="font-size: 9px;">Grosir</span>`;
      } else if (isKustom) {
        labelTipeHarga = `<span class="badge badge-warning" style="font-size: 9px;">Harga Kustom</span>`;
      }

      html += `
        <div class="pos-cart-item" data-idx="${idx}">
          <div class="row" style="justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1; padding-right: var(--sp-2);">
              <div class="fw-bold text-sm">${escapeHtml(it.nama)}</div>
              <div class="row" style="gap: 4px; align-items: center; margin-top: 2px;">
                <span class="badge" style="background: var(--surface-3); font-size: 10px;">${escapeHtml(it.satuan)}</span>
                ${labelTipeHarga}
                ${it.diskon > 0 ? `<span class="badge badge-danger" style="font-size: 10px;">Hemat ${formatRupiah(it.diskon)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-icon btn-sm text-danger btn-hapus-item" data-idx="${idx}" title="Hapus Item" style="width: 24px; height: 24px;">
              ${ICONS.x}
            </button>
          </div>

          <div class="row" style="justify-content: space-between; align-items: center; margin-top: var(--sp-2);">
            <!-- Qty Stepper -->
            <div class="row" style="gap: 2px; align-items: center;">
              <button type="button" class="btn btn-secondary btn-icon btn-sm btn-item-min" data-idx="${idx}" style="width: 28px; height: 28px;">-</button>
              <input type="number" class="input text-center fw-bold input-item-qty" data-idx="${idx}" value="${it.qty}" min="0.001" step="any" style="width: 65px; height: 28px; padding: 2px 4px; font-size: 12px;" />
              <button type="button" class="btn btn-secondary btn-icon btn-sm btn-item-plus" data-idx="${idx}" style="width: 28px; height: 28px;">+</button>
            </div>

            <!-- Harga & Diskon Button -->
            <div style="text-align: right;">
              <div class="row" style="gap: 4px; justify-content: flex-end; align-items: baseline;">
                <button type="button" class="btn btn-ghost btn-sm btn-edit-harga" data-idx="${idx}" style="padding: 0 4px; font-size: 11px; text-decoration: underline;" title="Ubah Harga Satuan">
                  @${formatRupiah(it.harga, false)}
                </button>
                <button type="button" class="btn btn-ghost btn-sm btn-item-diskon" data-idx="${idx}" style="padding: 0 4px; font-size: 11px; color: var(--danger-text);" title="Beri Diskon Item">
                  % Diskon
                </button>
              </div>
              <div class="fw-bold mono text-sm" style="color: var(--text);">
                ${formatRupiah(it.subtotal)}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    elCartItems.innerHTML = html;
    pasangAksiKeranjang();
    hitungDanTampilkanTotal();
  }

  function pasangAksiKeranjang() {
    // Hapus Item
    elCartItems.querySelectorAll('.btn-hapus-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        state.keranjang.splice(idx, 1);
        renderKeranjang();
      });
    });

    // Min Qty
    elCartItems.querySelectorAll('.btn-item-min').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const it = state.keranjang[idx];
        if (it.qty > 1) {
          it.qty = bulatQty(it.qty - 1);
          it.qty_dibawa = it.qty;
          hitungUlangItem(it);
          renderKeranjang();
        } else {
          state.keranjang.splice(idx, 1);
          renderKeranjang();
        }
      });
    });

    // Plus Qty
    elCartItems.querySelectorAll('.btn-item-plus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const it = state.keranjang[idx];
        it.qty = bulatQty(it.qty + 1);
        it.qty_dibawa = it.qty;
        hitungUlangItem(it);
        renderKeranjang();
      });
    });

    // Input Qty Langsung
    elCartItems.querySelectorAll('.input-item-qty').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.getAttribute('data-idx'), 10);
        const val = parseQty(inp.value);
        if (val <= 0) {
          state.keranjang.splice(idx, 1);
        } else {
          state.keranjang[idx].qty = val;
          state.keranjang[idx].qty_dibawa = val;
          hitungUlangItem(state.keranjang[idx]);
        }
        renderKeranjang();
      });
    });

    // Ubah Harga Satuan
    elCartItems.querySelectorAll('.btn-edit-harga').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        bukaModalUbahHarga(idx);
      });
    });

    // Diskon Item
    elCartItems.querySelectorAll('.btn-item-diskon').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        bukaModalDiskonItem(idx);
      });
    });
  }

  // ---------- Dialog Ubah Harga (Validasi >= HPP) ----------
  function bukaModalUbahHarga(idx) {
    const it = state.keranjang[idx];
    const hpp = it.hpp || 0;

    const modal = showModal({
      title: `Ubah Harga Satuan: ${it.nama}`,
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="text-xs text-muted">
            Harga Asli Ritel: <b>${formatRupiah(it.harga_asli)}</b> per ${it.satuan}
            ${isOwnerAtauAdmin ? `<br>HPP Satuan: <b class="text-danger">${formatRupiah(hpp)}</b>` : ''}
          </div>
          <div>
            <label class="form-label fw-bold">Harga Satuan Baru (Rp):</label>
            <input type="number" id="input-edit-harga" class="input fw-bold mono" value="${it.harga}" min="${hpp}" step="100" />
            <div class="form-hint text-xs">Harga jual tidak boleh di bawah HPP barang.</div>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-harga">Batal</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-simpan-harga">Simpan Harga</button>
        </div>
      `
    });

    const inputHarga = modal.el.querySelector('#input-edit-harga');
    modal.el.querySelector('#btn-batal-harga')?.addEventListener('click', () => modal.close());

    modal.el.querySelector('#btn-simpan-harga')?.addEventListener('click', () => {
      const hargaBaru = parseRupiah(inputHarga.value);
      if (hargaBaru <= 0) {
        showToast('Harga harus lebih dari 0.', 'warning');
        return;
      }

      // Validasi ketat Aturan Bisnis #1: harga >= HPP
      if (hargaBaru < hpp) {
        showToast(`Harga jual (${formatRupiah(hargaBaru)}) tidak boleh di bawah HPP barang!`, 'error');
        return;
      }

      it.harga = hargaBaru;
      it.tipe_harga = 'kustom';
      hitungUlangItem(it);
      renderKeranjang();
      modal.close();
      showToast('Harga satuan berhasil diperbarui.', 'success');
    });
  }

  // ---------- Dialog Diskon Item ----------
  function bukaModalDiskonItem(idx) {
    const it = state.keranjang[idx];
    const maksDiskonKasir = state.pengaturan.diskon_maks_kasir_persen || 10;
    const isKasir = state.user.role === 'kasir';

    const modal = showModal({
      title: `Diskon Item: ${it.nama}`,
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-sm ${it.diskon_tipe !== 'nominal' ? 'btn-primary' : 'btn-secondary'} btn-disc-type" data-type="persen" style="flex: 1;">
              Persen (%)
            </button>
            <button type="button" class="btn btn-sm ${it.diskon_tipe === 'nominal' ? 'btn-primary' : 'btn-secondary'} btn-disc-type" data-type="nominal" style="flex: 1;">
              Nominal (Rp)
            </button>
          </div>

          <div>
            <label class="form-label" id="label-disc-val">Nilai Diskon:</label>
            <input type="number" id="input-disc-val" class="input fw-bold mono" value="${it.diskon_nilai || 0}" min="0" />
            ${isKasir ? `<div class="form-hint text-xs text-warning">Batas maksimal diskon kasir: ${maksDiskonKasir}%.</div>` : ''}
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: space-between; align-items: center;">
          <button type="button" class="btn btn-ghost btn-sm text-danger" id="btn-hapus-diskon">Hapus Diskon</button>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-disc">Batal</button>
            <button type="button" class="btn btn-primary btn-sm" id="btn-simpan-disc">Terapkan</button>
          </div>
        </div>
      `
    });

    let currentType = it.diskon_tipe === 'nominal' ? 'nominal' : 'persen';
    const inputVal = modal.el.querySelector('#input-disc-val');

    modal.el.querySelectorAll('.btn-disc-type').forEach((b) => {
      b.addEventListener('click', () => {
        modal.el.querySelectorAll('.btn-disc-type').forEach((x) => x.className = 'btn btn-sm btn-secondary btn-disc-type');
        b.className = 'btn btn-sm btn-primary btn-disc-type';
        currentType = b.getAttribute('data-type');
        inputVal.placeholder = currentType === 'persen' ? 'Contoh: 5' : 'Contoh: 10000';
      });
    });

    modal.el.querySelector('#btn-hapus-diskon')?.addEventListener('click', () => {
      it.diskon_tipe = '';
      it.diskon_nilai = 0;
      hitungUlangItem(it);
      renderKeranjang();
      modal.close();
    });

    modal.el.querySelector('#btn-batal-disc')?.addEventListener('click', () => modal.close());

    modal.el.querySelector('#btn-simpan-disc')?.addEventListener('click', () => {
      const val = Number(inputVal.value) || 0;
      if (val < 0) {
        showToast('Nilai diskon tidak valid.', 'warning');
        return;
      }

      // Pembatasan kasir
      if (isKasir) {
        if (currentType === 'persen' && val > maksDiskonKasir) {
          showToast(`Diskon kasir maksimal ${maksDiskonKasir}%.`, 'warning');
          return;
        }
        if (currentType === 'nominal') {
          const subtotalKotor = it.harga * it.qty;
          const persenEfektif = subtotalKotor > 0 ? (val / subtotalKotor) * 100 : 0;
          if (persenEfektif > maksDiskonKasir) {
            showToast(`Potongan kasir melebihi batas ${maksDiskonKasir}%.`, 'warning');
            return;
          }
        }
      }

      // Validasi Aturan Bisnis #1: Harga setelah diskon tidak boleh < HPP
      const subtotalKotor = it.harga * it.qty;
      const diskonEst = currentType === 'persen' ? Math.round(subtotalKotor * (val / 100)) : val;
      const subtotalBersih = subtotalKotor - diskonEst;
      const totalHppItem = (it.hpp || 0) * it.qty;

      if (subtotalBersih < totalHppItem) {
        showToast('Diskon ditolak: harga setelah diskon tidak boleh di bawah HPP barang!', 'error');
        return;
      }

      it.diskon_tipe = currentType;
      it.diskon_nilai = val;
      hitungUlangItem(it);
      renderKeranjang();
      modal.close();
    });
  }

  // ---------- Kalkulasi Total Transaksi ----------
  function hitungDanTampilkanTotal() {
    let subtotalKotor = 0;
    let totalDiskonItem = 0;
    let totalHpp = 0;

    state.keranjang.forEach((it) => {
      subtotalKotor += (it.harga * it.qty);
      totalDiskonItem += it.diskon;
      totalHpp += ((it.hpp || 0) * it.qty);
    });

    const subtotalSetelahItem = subtotalKotor - totalDiskonItem;

    // Diskon Transaksi Global
    let diskonTransNominal = 0;
    if (state.diskonTransaksi.tipe === 'persen') {
      diskonTransNominal = Math.round(subtotalSetelahItem * (Number(state.diskonTransaksi.nilai || 0) / 100));
    } else if (state.diskonTransaksi.tipe === 'nominal') {
      diskonTransNominal = Math.min(Math.round(Number(state.diskonTransaksi.nilai || 0)), subtotalSetelahItem);
    }

    const totalSetelahSemuaDiskon = subtotalSetelahItem - diskonTransNominal;

    // Pajak (PPN) jika aktif di pengaturan
    let pajakNominal = 0;
    if (state.pengaturan.pajak_aktif) {
      const persenPajak = Number(state.pengaturan.pajak_persen) || 11;
      pajakNominal = Math.round(totalSetelahSemuaDiskon * (persenPajak / 100));
      elRowPajak.style.display = 'flex';
      elCartPajak.textContent = formatRupiah(pajakNominal);
    } else {
      elRowPajak.style.display = 'none';
    }

    // Pembulatan jika aktif di pengaturan
    let pembulatanNominal = 0;
    if (state.pengaturan.pembulatan_aktif) {
      const kelipatan = Number(state.pengaturan.pembulatan_kelipatan) || 100;
      const dasar = totalSetelahSemuaDiskon + pajakNominal;
      const sisa = dasar % kelipatan;
      if (sisa !== 0) pembulatanNominal = kelipatan - sisa;
      elRowPembulatan.style.display = 'flex';
      elCartPembulatan.textContent = formatRupiah(pembulatanNominal);
    } else {
      elRowPembulatan.style.display = 'none';
    }

    const grandTotal = Math.max(0, totalSetelahSemuaDiskon + pajakNominal + pembulatanNominal);

    // Tampilkan di UI
    elCartSubtotal.textContent = formatRupiah(subtotalKotor);
    elCartDiskon.textContent = '- ' + formatRupiah(diskonTransNominal);
    elBadgeDiskon.textContent = diskonTransNominal > 0
      ? (state.diskonTransaksi.tipe === 'persen' ? `${state.diskonTransaksi.nilai}%` : formatRupiah(diskonTransNominal))
      : '+ Diskon';
    elCartGrandTotal.textContent = formatRupiah(grandTotal);

    // Perbarui floating bar di mobile
    if (elFloatingCartTotal) elFloatingCartTotal.textContent = formatRupiah(grandTotal);
    if (elFloatingCartCount) elFloatingCartCount.textContent = `${state.keranjang.length} item`;
    perbaruiFloatingCart();

    return {
      subtotalKotor,
      totalDiskonItem,
      subtotalSetelahItem,
      diskonTransNominal,
      pajakNominal,
      pembulatanNominal,
      grandTotal,
      totalHpp
    };
  }

  // ---------- Dialog Diskon Transaksi ----------
  container.querySelector('#row-diskon-transaksi')?.addEventListener('click', () => {
    bukaModalDiskonTransaksi();
  });

  function bukaModalDiskonTransaksi() {
    const isKasir = state.user.role === 'kasir';
    const maksDiskonKasir = state.pengaturan.diskon_maks_kasir_persen || 10;

    const modal = showModal({
      title: 'Diskon Global Transaksi',
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-sm ${state.diskonTransaksi.tipe !== 'nominal' ? 'btn-primary' : 'btn-secondary'} btn-gdisc-type" data-type="persen" style="flex: 1;">
              Persen (%)
            </button>
            <button type="button" class="btn btn-sm ${state.diskonTransaksi.tipe === 'nominal' ? 'btn-primary' : 'btn-secondary'} btn-gdisc-type" data-type="nominal" style="flex: 1;">
              Nominal (Rp)
            </button>
          </div>

          <div>
            <label class="form-label">Nilai Diskon Transaksi:</label>
            <input type="number" id="input-gdisc-val" class="input fw-bold mono" value="${state.diskonTransaksi.nilai || 0}" min="0" />
            ${isKasir ? `<div class="form-hint text-xs text-warning">Batas diskon kasir: ${maksDiskonKasir}%.</div>` : ''}
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: space-between; align-items: center;">
          <button type="button" class="btn btn-ghost btn-sm text-danger" id="btn-hapus-gdiskon">Hapus</button>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-gdisc">Batal</button>
            <button type="button" class="btn btn-primary btn-sm" id="btn-simpan-gdisc">Terapkan</button>
          </div>
        </div>
      `
    });

    let gType = state.diskonTransaksi.tipe === 'nominal' ? 'nominal' : 'persen';
    const inputGVal = modal.el.querySelector('#input-gdisc-val');

    modal.el.querySelectorAll('.btn-gdisc-type').forEach((b) => {
      b.addEventListener('click', () => {
        modal.el.querySelectorAll('.btn-gdisc-type').forEach((x) => x.className = 'btn btn-sm btn-secondary btn-gdisc-type');
        b.className = 'btn btn-sm btn-primary btn-gdisc-type';
        gType = b.getAttribute('data-type');
      });
    });

    modal.el.querySelector('#btn-hapus-gdiskon')?.addEventListener('click', () => {
      state.diskonTransaksi = { tipe: '', nilai: 0 };
      hitungDanTampilkanTotal();
      modal.close();
    });

    modal.el.querySelector('#btn-batal-gdisc')?.addEventListener('click', () => modal.close());

    modal.el.querySelector('#btn-simpan-gdisc')?.addEventListener('click', () => {
      const val = Number(inputGVal.value) || 0;
      if (val < 0) return;

      if (isKasir && gType === 'persen' && val > maksDiskonKasir) {
        showToast(`Diskon kasir maksimal ${maksDiskonKasir}%.`, 'warning');
        return;
      }

      state.diskonTransaksi = { tipe: gType, nilai: val };
      hitungDanTampilkanTotal();
      modal.close();
    });
  }

  // ---------- Dialog Pemilihan Pelanggan / Member ----------
  elBtnCustomer?.addEventListener('click', bukaModalPilihPelanggan);

  async function bukaModalPilihPelanggan() {
    let daftarPelanggan = [];
    try {
      const res = await api.post('pelanggan.list', { semua: true });
      if (res.ok) daftarPelanggan = res.data.items || [];
    } catch (err) {
      showToast('Gagal memuat pelanggan: ' + err.message, 'error');
    }

    const modal = showModal({
      title: 'Pilih Pelanggan / Member',
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-sm ${!state.pelanggan ? 'btn-primary' : 'btn-secondary'}" id="btn-pilih-umum" style="flex: 1;">
              👤 Pelanggan Umum (Tanpa Member)
            </button>
          </div>

          <div class="divider" style="margin: var(--sp-2) 0;"></div>

          <div>
            <label class="form-label fw-bold">Cari Member Terdaftar:</label>
            <input type="text" id="input-cari-member" class="input" placeholder="Ketik nama, no HP, atau kode..." />
          </div>

          <div class="list" id="member-list-container" style="max-height: 280px; overflow-y: auto;">
            <!-- Diisi JavaScript -->
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-pel">Tutup</button>
        </div>
      `
    });

    const elInputCari = modal.el.querySelector('#input-cari-member');
    const elListContainer = modal.el.querySelector('#member-list-container');

    const renderMemberList = (q = '') => {
      let filtered = daftarPelanggan.filter((pel) => pel.tipe === 'member');
      const qLow = q.trim().toLowerCase();
      if (qLow) {
        filtered = filtered.filter((pel) =>
          (pel.nama || '').toLowerCase().includes(qLow) ||
          (pel.kode || '').toLowerCase().includes(qLow) ||
          (pel.hp || '').toLowerCase().includes(qLow)
        );
      }

      if (filtered.length === 0) {
        elListContainer.innerHTML = `<div class="text-xs text-muted text-center p-3">Member tidak ditemukan</div>`;
        return;
      }

      let h = '';
      filtered.forEach((pel) => {
        const isSelected = state.pelanggan && state.pelanggan.id === pel.id;
        h += `
          <button type="button" class="list-item btn-select-pel ${isSelected ? 'active' : ''}" data-id="${pel.id}">
            <div class="list-item-icon" style="background: var(--primary-soft); color: var(--primary);">
              ${ICONS.award}
            </div>
            <div class="grow" style="text-align: left;">
              <div class="row" style="justify-content: space-between;">
                <span class="fw-bold">${escapeHtml(pel.nama)}</span>
                <span class="badge badge-primary text-xs">${escapeHtml(pel.level || 'Reguler')}</span>
              </div>
              <div class="text-xs text-muted mono">${escapeHtml(pel.kode || '')} • ${escapeHtml(pel.hp || '-')}</div>
              <div class="text-xs text-muted" style="margin-top: 2px;">
                Poin: <b>${pel.poin || 0}</b> | Sisa Limit: <b class="text-success">${formatRupiah(pel.sisa_limit || pel.limit_kredit || 0)}</b>
              </div>
            </div>
          </button>
        `;
      });
      elListContainer.innerHTML = h;

      elListContainer.querySelectorAll('.btn-select-pel').forEach((b) => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-id');
          state.pelanggan = daftarPelanggan.find((p) => p.id === id);
          perbaruiTampilanPelanggan();
          modal.close();
        });
      });
    };

    renderMemberList();

    elInputCari?.addEventListener('input', (e) => {
      renderMemberList(e.target.value);
    });

    modal.el.querySelector('#btn-pilih-umum')?.addEventListener('click', () => {
      state.pelanggan = null;
      perbaruiTampilanPelanggan();
      modal.close();
    });

    modal.el.querySelector('#btn-tutup-pel')?.addEventListener('click', () => modal.close());
  }

  function perbaruiTampilanPelanggan() {
    if (state.pelanggan) {
      elLabelPelNama.textContent = state.pelanggan.nama;
      elLabelPelSub.textContent = `Member ${state.pelanggan.level || 'Reguler'} • Limit: ${formatRupiah(state.pelanggan.sisa_limit || state.pelanggan.limit_kredit || 0)}`;
      elBtnCustomer.textContent = 'Ganti';
    } else {
      elLabelPelNama.textContent = 'Pelanggan Umum';
      elLabelPelSub.textContent = '(Tunai / Non-Tempo)';
      elBtnCustomer.textContent = 'Pilih Member';
    }
  }

  // ---------- Dialog Checkout Pembayaran (BAYAR) ----------
  elBtnPay?.addEventListener('click', bukaModalPembayaran);

  function bukaModalPembayaran() {
    if (state.keranjang.length === 0) {
      showToast('Keranjang belanja masih kosong.', 'warning');
      return;
    }

    const totals = hitungDanTampilkanTotal();
    const grandTotal = totals.grandTotal;
    const isMember = state.pelanggan && state.pelanggan.tipe === 'member';

    const modal = showModal({
      title: 'Pembayaran & Pengiriman',
      size: 'lg',
      body: `
        <div class="pos-checkout-grid">
          <!-- Kolom Kiri: Rincian Tagihan & Opsi Pengiriman -->
          <div class="stack" style="gap: var(--sp-3);">
            <div class="card" style="background: var(--surface-2);">
              <div class="card-body" style="padding: var(--sp-3);">
                <div class="text-xs text-muted">TOTAL TAGIHAN</div>
                <div class="fw-bold mono" style="font-size: var(--fs-xl); color: var(--primary);">${formatRupiah(grandTotal)}</div>
                <div class="text-xs text-muted" style="margin-top: 4px;">
                  Pelanggan: <b>${escapeHtml(state.pelanggan ? state.pelanggan.nama : 'Pelanggan Umum')}</b>
                  ${isMember ? `(Sisa Limit: <span class="text-success">${formatRupiah(state.pelanggan.sisa_limit || 0)}</span>)` : ''}
                </div>
              </div>
            </div>

            <!-- Pilihan Pengiriman -->
            <div>
              <label class="form-label fw-bold">Opsi Pengiriman:</label>
              <div class="row" style="gap: var(--sp-2);">
                <button type="button" class="btn btn-sm ${state.pengiriman === 'ambil' ? 'btn-primary' : 'btn-secondary'} btn-opt-kirim" data-kirim="ambil" style="flex: 1;">
                  🏪 Ambil di Toko
                </button>
                <button type="button" class="btn btn-sm ${state.pengiriman === 'dikirim' ? 'btn-primary' : 'btn-secondary'} btn-opt-kirim" data-kirim="dikirim" style="flex: 1;">
                  🚚 Dikirim Toko
                </button>
              </div>
            </div>

            <!-- Alamat Kirim & Catatan (Muncul jika opsi 'dikirim') -->
            <div id="box-detail-kirim" style="display: ${state.pengiriman === 'dikirim' ? 'block' : 'none'};">
              <label class="form-label">Alamat Pengiriman:</label>
              <textarea id="checkout-alamat" class="textarea" rows="2" placeholder="Alamat lengkap tujuan pengiriman...">${escapeHtml(state.alamatKirim || (state.pelanggan?.alamat || ''))}</textarea>
            </div>

            <div>
              <label class="form-label">Catatan Nota (Opsional):</label>
              <input type="text" id="checkout-catatan" class="input" placeholder="Catatan transaksi..." value="${escapeHtml(state.catatan)}" />
            </div>
          </div>

          <!-- Kolom Kanan: Pilihan Metode Bayar & Uang Pas -->
          <div class="stack" style="gap: var(--sp-3);">
            <div>
              <label class="form-label fw-bold">Metode Pembayaran:</label>
              <div class="row" style="gap: 4px; flex-wrap: wrap;" id="metode-tabs">
                <button type="button" class="btn btn-sm btn-primary btn-tab-bayar" data-metode="tunai">Tunai</button>
                <button type="button" class="btn btn-sm btn-secondary btn-tab-bayar" data-metode="qris">QRIS</button>
                <button type="button" class="btn btn-sm btn-secondary btn-tab-bayar" data-metode="transfer">Transfer</button>
                <button type="button" class="btn btn-sm btn-secondary btn-tab-bayar ${!isMember ? 'disabled' : ''}" data-metode="tempo" ${!isMember ? 'disabled title="Tempo hanya untuk Member"' : ''}>
                  Tempo / Kredit
                </button>
                <button type="button" class="btn btn-sm btn-secondary btn-tab-bayar" data-metode="kombinasi">Kombinasi</button>
              </div>
            </div>

            <!-- Kontainer Input Pembayaran Dinamis -->
            <div id="bayar-input-container">
              <!-- Default Tunai Input -->
              <div id="sec-tunai">
                <label class="form-label">Nominal Uang Diterima (Rp):</label>
                <input type="number" id="input-tunai-terima" class="input fw-bold mono" style="font-size: var(--fs-lg);" value="${grandTotal}" min="${grandTotal}" />

                <!-- Tombol Cepat Uang Pas -->
                <div class="row" style="gap: 4px; margin-top: var(--sp-2); flex-wrap: wrap;" id="quick-cash-btns">
                  <button type="button" class="btn btn-ghost btn-sm btn-quick-cash" data-val="${grandTotal}">Uang Pas</button>
                  <button type="button" class="btn btn-ghost btn-sm btn-quick-cash" data-val="50000">50.000</button>
                  <button type="button" class="btn btn-ghost btn-sm btn-quick-cash" data-val="100000">100.000</button>
                  <button type="button" class="btn btn-ghost btn-sm btn-quick-cash" data-val="200000">200.000</button>
                  <button type="button" class="btn btn-ghost btn-sm btn-quick-cash" data-val="500000">500.000</button>
                </div>

                <div class="card" style="background: var(--surface-3); margin-top: var(--sp-3); padding: var(--sp-3);">
                  <div class="row" style="justify-content: space-between; align-items: baseline;">
                    <span class="text-sm">Kembalian:</span>
                    <span class="fw-bold mono text-success" id="label-kembalian" style="font-size: var(--fs-lg);">Rp 0</span>
                  </div>
                </div>
              </div>

              <!-- Section QRIS / Transfer -->
              <div id="sec-transfer-qris" style="display: none;">
                <label class="form-label">Nomor Referensi / Approval Code:</label>
                <input type="text" id="input-ref-bayar" class="input" placeholder="Contoh: REF-12345678" />
              </div>

              <!-- Section Tempo -->
              <div id="sec-tempo" style="display: none;">
                <div class="alert alert-info text-xs" style="margin-bottom: var(--sp-2);">
                  Jatuh tempo: <b>${state.pelanggan?.tempo_hari || 30} Hari</b> dari sekarang. Piutang akan dicatat atas nama <b>${escapeHtml(state.pelanggan?.nama || '')}</b>.
                </div>
              </div>

              <!-- Section Kombinasi -->
              <div id="sec-kombinasi" style="display: none;">
                <div class="stack" style="gap: var(--sp-2);">
                  <div class="row" style="gap: var(--sp-2); align-items: center;">
                    <span class="text-xs" style="width: 70px;">Tunai:</span>
                    <input type="number" id="komb-tunai" class="input mono" value="0" min="0" style="flex: 1;" />
                  </div>
                  <div class="row" style="gap: var(--sp-2); align-items: center;">
                    <span class="text-xs" style="width: 70px;">Transfer:</span>
                    <input type="number" id="komb-transfer" class="input mono" value="0" min="0" style="flex: 1;" />
                  </div>
                  <div class="row" style="gap: var(--sp-2); align-items: center;">
                    <span class="text-xs" style="width: 70px;">Tempo:</span>
                    <input type="number" id="komb-tempo" class="input mono" value="0" min="0" style="flex: 1;" ${!isMember ? 'disabled' : ''} />
                  </div>
                  <div class="text-xs text-muted text-right" id="komb-sisa-label">Sisa Kurang: Rp 0</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: space-between; align-items: center;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-bayar">Batal</button>
          <button type="button" class="btn btn-primary btn-lg" id="btn-proses-transaksi" style="font-weight: 700;">
            ${ICONS.check} Konfirmasi & Simpan Transaksi
          </button>
        </div>
      `
    });

    let activeMetode = 'tunai';
    const elTunaiSec = modal.el.querySelector('#sec-tunai');
    const elTrfSec = modal.el.querySelector('#sec-transfer-qris');
    const elTempoSec = modal.el.querySelector('#sec-tempo');
    const elKombSec = modal.el.querySelector('#sec-kombinasi');
    const inputTunai = modal.el.querySelector('#input-tunai-terima');
    const labelKembalian = modal.el.querySelector('#label-kembalian');
    const boxKirim = modal.el.querySelector('#box-detail-kirim');

    // Pengiriman toggle
    modal.el.querySelectorAll('.btn-opt-kirim').forEach((b) => {
      b.addEventListener('click', () => {
        modal.el.querySelectorAll('.btn-opt-kirim').forEach((x) => x.className = 'btn btn-sm btn-secondary btn-opt-kirim');
        b.className = 'btn btn-sm btn-primary btn-opt-kirim';
        state.pengiriman = b.getAttribute('data-kirim');
        boxKirim.style.display = state.pengiriman === 'dikirim' ? 'block' : 'none';
      });
    });

    // Hitung kembalian tunai
    const updateKembalian = () => {
      const uangMasuk = parseRupiah(inputTunai.value);
      const k = Math.max(0, uangMasuk - grandTotal);
      labelKembalian.textContent = formatRupiah(k);
    };

    inputTunai?.addEventListener('input', updateKembalian);

    // Tombol Cepat Uang Pas
    modal.el.querySelectorAll('.btn-quick-cash').forEach((b) => {
      b.addEventListener('click', () => {
        inputTunai.value = b.getAttribute('data-val');
        updateKembalian();
      });
    });

    // Tab Metode Bayar
    modal.el.querySelectorAll('.btn-tab-bayar').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        modal.el.querySelectorAll('.btn-tab-bayar').forEach((x) => x.className = 'btn btn-sm btn-secondary btn-tab-bayar' + (x.hasAttribute('disabled') ? ' disabled' : ''));
        btn.className = 'btn btn-sm btn-primary btn-tab-bayar';
        activeMetode = btn.getAttribute('data-metode');

        elTunaiSec.style.display = activeMetode === 'tunai' ? 'block' : 'none';
        elTrfSec.style.display = (activeMetode === 'transfer' || activeMetode === 'qris') ? 'block' : 'none';
        elTempoSec.style.display = activeMetode === 'tempo' ? 'block' : 'none';
        elKombSec.style.display = activeMetode === 'kombinasi' ? 'block' : 'none';
      });
    });

    modal.el.querySelector('#btn-tutup-bayar')?.addEventListener('click', () => modal.close());

    // Eksekusi Konfirmasi Transaksi
    modal.el.querySelector('#btn-proses-transaksi')?.addEventListener('click', async () => {
      const btnProses = modal.el.querySelector('#btn-proses-transaksi');
      btnProses.disabled = true;
      btnProses.textContent = 'Memproses...';

      try {
        // Susun payload pembayaran
        const daftarBayar = [];
        if (activeMetode === 'tunai') {
          const uangMasuk = parseRupiah(inputTunai.value);
          if (uangMasuk < grandTotal) {
            showToast('Uang pembayaran tunai kurang dari total belanja.', 'warning');
            btnProses.disabled = false;
            btnProses.textContent = 'Konfirmasi & Simpan Transaksi';
            return;
          }
          daftarBayar.push({ metode: 'tunai', jumlah: uangMasuk });
        } else if (activeMetode === 'qris' || activeMetode === 'transfer') {
          const ref = modal.el.querySelector('#input-ref-bayar').value.trim();
          daftarBayar.push({ metode: activeMetode, jumlah: grandTotal, referensi: ref });
        } else if (activeMetode === 'tempo') {
          if (!isMember) {
            showToast('Tempo hanya diizinkan untuk Member terdaftar.', 'warning');
            btnProses.disabled = false;
            return;
          }
          daftarBayar.push({ metode: 'tempo', jumlah: grandTotal });
        } else if (activeMetode === 'kombinasi') {
          const nTunai = parseRupiah(modal.el.querySelector('#komb-tunai').value);
          const nTrf = parseRupiah(modal.el.querySelector('#komb-transfer').value);
          const nTempo = parseRupiah(modal.el.querySelector('#komb-tempo').value);

          if (nTunai > 0) daftarBayar.push({ metode: 'tunai', jumlah: nTunai });
          if (nTrf > 0) daftarBayar.push({ metode: 'transfer', jumlah: nTrf });
          if (nTempo > 0) {
            if (!isMember) {
              showToast('Tempo hanya diizinkan untuk member.', 'warning');
              btnProses.disabled = false;
              return;
            }
            daftarBayar.push({ metode: 'tempo', jumlah: nTempo });
          }

          const totKomb = nTunai + nTrf + nTempo;
          if (totKomb < grandTotal) {
            showToast(`Total pembayaran kombinasi (${formatRupiah(totKomb)}) masih kurang dari tagihan.`, 'warning');
            btnProses.disabled = false;
            btnProses.textContent = 'Konfirmasi & Simpan Transaksi';
            return;
          }
        }

        // Susun payload item
        const payloadItems = state.keranjang.map((it) => ({
          produk_id: it.produk_id,
          varian_id: it.varian_id || '',
          satuan: it.satuan,
          faktor: it.faktor || 1,
          qty: it.qty,
          qty_dibawa: it.qty_dibawa !== undefined ? it.qty_dibawa : it.qty,
          tipe_harga: it.tipe_harga || 'ritel',
          harga_asli: it.harga_asli || it.harga,
          harga: it.harga,
          diskon_tipe: it.diskon_tipe || '',
          diskon_nilai: it.diskon_nilai || 0
        }));

        const alamatKirimVal = modal.el.querySelector('#checkout-alamat')?.value.trim() || '';
        const catatanVal = modal.el.querySelector('#checkout-catatan')?.value.trim() || '';

        const payload = {
          pelanggan_id: state.pelanggan ? state.pelanggan.id : '',
          pengiriman: state.pengiriman,
          alamat_kirim: alamatKirimVal,
          catatan: catatanVal,
          items: payloadItems,
          diskon_tipe: state.diskonTransaksi.tipe,
          diskon_nilai: state.diskonTransaksi.nilai,
          pembayaran: daftarBayar
        };

        const res = await api.post('penjualan.create', payload);

        if (!res.ok) {
          throw new Error(res.error || 'Gagal menyimpan transaksi.');
        }

        // Transaksi Sukses!
        bunyikanBeep();
        modal.close();

        // Tampilkan modal struk sukses
        bukaModalStrukSukses(res.data);

        // Reset keranjang
        state.keranjang = [];
        state.diskonTransaksi = { tipe: '', nilai: 0 };
        renderKeranjang();
        if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('catalog');

        // Refresh katalog produk untuk update stok lokal
        muatDataKatalog();
      } catch (err) {
        console.error('Error simpan penjualan:', err);
        showToast(err.message, 'error', 4500);
        btnProses.disabled = false;
        btnProses.textContent = 'Konfirmasi & Simpan Transaksi';
      }
    });
  }

  // ---------- Modal Struk Sukses & Cetak ----------
  function bukaModalStrukSukses(dataStruk) {
    const pj = dataStruk.penjualan || {};
    const kembalian = pj.kembalian || 0;
    const ukuranPrinter = state.pengaturan.printer_ukuran || '58';

    const modal = showModal({
      title: 'Transaksi Berhasil!',
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-4); text-align: center;">
          <div style="font-size: 48px; color: var(--success); line-height: 1;">✓</div>
          <div>
            <div class="text-xs text-muted">NOMOR NOTA</div>
            <div class="fw-bold mono" style="font-size: var(--fs-xl);">${escapeHtml(pj.no_nota || '-')}</div>
            <div class="text-sm text-muted" style="margin-top: 4px;">Total: <b>${formatRupiah(pj.total)}</b></div>
            ${kembalian > 0 ? `<div class="badge badge-success" style="font-size: 14px; margin-top: 6px;">Kembalian: ${formatRupiah(kembalian)}</div>` : ''}
          </div>

          <div class="divider"></div>

          <div class="stack" style="gap: var(--sp-2);">
            <div class="fw-bold text-xs text-muted" style="text-align: left;">PILIHAN CETAK STRUK:</div>
            <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-print-bt" style="flex: 1;">
                ${ICONS.printer} Cetak Bluetooth (${ukuranPrinter}mm)
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-print-rawbt" style="flex: 1;">
                📱 RawBT Android
              </button>
            </div>
            <div class="row" style="gap: var(--sp-2);">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-print-browser" style="flex: 1;">
                🖨️ Cetak / Pratinjau Browser
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-share-wa" style="flex: 1;">
                💬 Kirim WhatsApp
              </button>
            </div>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-primary btn-lg" id="btn-transaksi-baru" style="font-weight: 700;">
            Transaksi Baru
          </button>
        </div>
      `
    });

    modal.el.querySelector('#btn-print-bt')?.addEventListener('click', () => {
      cetakBluetooth(dataStruk, ukuranPrinter);
    });

    modal.el.querySelector('#btn-print-rawbt')?.addEventListener('click', () => {
      cetakRawBT(dataStruk, ukuranPrinter);
    });

    modal.el.querySelector('#btn-print-browser')?.addEventListener('click', () => {
      cetakBrowser(dataStruk, ukuranPrinter);
    });

    modal.el.querySelector('#btn-share-wa')?.addEventListener('click', () => {
      const noHp = dataStruk.pelanggan?.hp || '';
      const urlWa = buatTautanWhatsApp(dataStruk, noHp);
      window.open(urlWa, '_blank');
    });

    modal.el.querySelector('#btn-transaksi-baru')?.addEventListener('click', () => {
      modal.close();
      elSearch?.focus();
    });
  }

  // ---------- Tahan Transaksi (Hold Cart / F7) ----------
  elBtnHold?.addEventListener('click', tahanTransaksi);

  async function tahanTransaksi() {
    if (state.keranjang.length === 0) {
      showToast('Keranjang belanja kosong tidak bisa ditahan.', 'warning');
      return;
    }

    try {
      const payload = {
        pelanggan_id: state.pelanggan ? state.pelanggan.id : '',
        pengiriman: state.pengiriman,
        catatan: state.catatan,
        items: state.keranjang.map((it) => ({
          produk_id: it.produk_id,
          varian_id: it.varian_id || '',
          nama: it.nama,
          satuan: it.satuan,
          faktor: it.faktor || 1,
          qty: it.qty,
          qty_dibawa: it.qty_dibawa,
          tipe_harga: it.tipe_harga,
          harga_asli: it.harga_asli,
          harga: it.harga,
          hpp: it.hpp,
          diskon_tipe: it.diskon_tipe,
          diskon_nilai: it.diskon_nilai
        }))
      };

      const res = await api.post('penjualan.pending.save', payload);
      if (res.ok) {
        showToast('Transaksi berhasil ditahan.', 'success');
        state.keranjang = [];
        state.pelanggan = null;
        perbaruiTampilanPelanggan();
        renderKeranjang();

        state.pendingCount++;
        perbaruiBadgePending();
        if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('catalog');
      }
    } catch (err) {
      showToast('Gagal menahan transaksi: ' + err.message, 'error');
    }
  }

  // ---------- Daftar Transaksi Tahan (Pending List / F8) ----------
  elBtnPendingList?.addEventListener('click', bukaModalDaftarPending);

  async function bukaModalDaftarPending() {
    let pendingItems = [];
    try {
      const res = await api.post('penjualan.pending.list');
      if (res.ok) pendingItems = res.data.items || [];
    } catch (err) {
      showToast('Gagal memuat pending: ' + err.message, 'error');
      return;
    }

    const modal = showModal({
      title: 'Daftar Transaksi Ditahan (Pending)',
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-3);" id="pending-modal-list">
          ${pendingItems.length === 0 ? `
            <div class="empty-state text-center" style="padding: var(--sp-6); color: var(--text-muted);">
              Tidak ada transaksi yang sedang ditahan.
            </div>
          ` : pendingItems.map((p) => `
            <div class="card" style="background: var(--surface-2); padding: var(--sp-3);">
              <div class="row" style="justify-content: space-between; align-items: flex-start;">
                <div>
                  <div class="fw-bold">${escapeHtml(p.no_nota)}</div>
                  <div class="text-xs text-muted">Pelanggan: <b>${escapeHtml(p.pelanggan_nama || 'Umum')}</b> • ${p.item_count || 0} Barang</div>
                  <div class="text-xs text-muted">${formatTanggal(p.created_at, true)}</div>
                </div>
                <div class="text-right">
                  <div class="fw-bold mono text-sm" style="color: var(--primary);">${formatRupiah(p.total)}</div>
                  <div class="row" style="gap: var(--sp-1); margin-top: 4px; justify-content: flex-end;">
                    <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-draft" data-id="${p.id}">Hapus</button>
                    <button type="button" class="btn btn-primary btn-sm btn-muat-draft" data-id="${p.id}">Muat</button>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-pending">Tutup</button>
        </div>
      `
    });

    modal.el.querySelector('#btn-tutup-pending')?.addEventListener('click', () => modal.close());

    // Muat Draft ke Keranjang
    modal.el.querySelectorAll('.btn-muat-draft').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const draft = pendingItems.find((x) => x.id === id);
        if (!draft) return;

        // Pasang ke keranjang
        state.keranjang = (draft.items || []).map((it) => {
          const pr = state.katalog.find((x) => x.id === it.produk_id) || {};
          return {
            produk_id: it.produk_id,
            varian_id: it.varian_id || '',
            nama: it.nama,
            satuan: it.satuan,
            faktor: it.faktor || 1,
            qty: it.qty,
            qty_dibawa: it.qty_dibawa,
            tipe_harga: it.tipe_harga || 'ritel',
            harga_asli: it.harga_asli || it.harga,
            harga: it.harga,
            hpp: it.hpp || 0,
            diskon_tipe: it.diskon_tipe || '',
            diskon_nilai: it.diskon_nilai || 0,
            diskon: it.diskon || 0,
            subtotal: it.subtotal,
            _pr: pr,
            _var: null
          };
        });

        // Hapus draft yang sudah dimuat dari list pending backend
        await api.post('penjualan.pending.delete', { id: draft.id });

        state.pendingCount = Math.max(0, state.pendingCount - 1);
        perbaruiBadgePending();
        renderKeranjang();
        modal.close();
        if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('cart');
        showToast('Draft transaksi berhasil dimuat kembali ke keranjang.', 'success');
      });
    });

    // Hapus Draft
    modal.el.querySelectorAll('.btn-hapus-draft').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await api.post('penjualan.pending.delete', { id });
        state.pendingCount = Math.max(0, state.pendingCount - 1);
        perbaruiBadgePending();
        modal.close();
        showToast('Draft transaksi berhasil dihapus.', 'info');
      });
    });
  }

  // ---------- Kosongkan Keranjang ----------
  elBtnClear?.addEventListener('click', () => {
    if (state.keranjang.length === 0) return;
    if (confirm('Kosongkan semua isi keranjang belanja?')) {
      state.keranjang = [];
      state.diskonTransaksi = { tipe: '', nilai: 0 };
      renderKeranjang();
      if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('catalog');
    }
  });

  // ---------- Scan Barcode Kamera & Fisik ----------
  elBtnCamera?.addEventListener('click', () => {
    bukaKameraScanner((code) => {
      cariDanTambahBarcode(code);
    });
  });

  function cariDanTambahBarcode(code) {
    const codeClean = String(code || '').trim().toLowerCase();
    if (!codeClean) return;

    // Cari produk dengan barcode atau SKU yang cocok
    let matchProd = null;
    let matchVar = null;

    for (let i = 0; i < state.katalog.length; i++) {
      const p = state.katalog[i];
      if (String(p.barcode || '').toLowerCase() === codeClean || String(p.sku || '').toLowerCase() === codeClean) {
        matchProd = p;
        break;
      }
      const vFound = (p.varian || []).find((v) =>
        String(v.barcode || '').toLowerCase() === codeClean || String(v.sku || '').toLowerCase() === codeClean
      );
      if (vFound) {
        matchProd = p;
        matchVar = vFound;
        break;
      }
    }

    if (matchProd) {
      if (matchVar) {
        tambahItemKeKeranjang({
          produk_id: matchProd.id,
          varian_id: matchVar.id,
          nama: `${matchProd.nama} - ${matchVar.nama_varian}`,
          satuan: matchProd.satuan_dasar,
          faktor: 1,
          qty: 1,
          qty_dibawa: 1,
          tipe_harga: 'ritel',
          harga_asli: matchVar.harga_ritel,
          harga: matchVar.harga_ritel,
          hpp: matchVar.hpp || 0,
          diskon_tipe: '',
          diskon_nilai: 0,
          diskon: 0,
          subtotal: matchVar.harga_ritel,
          _pr: matchProd,
          _var: matchVar
        });
      } else {
        pilihProduk(matchProd);
      }
      bunyikanBeep();
      showToast(`Produk ditambahkan: ${matchProd.nama}`, 'success', 1800);
    } else {
      showToast(`Barcode ${code} tidak ditemukan di katalog.`, 'warning');
      elSearch.value = code;
      state.kataKunci = code;
      renderKatalog();
    }
  }

  // Pasang listener scanner fisik (USB / Bluetooth keyboard emulation)
  const lepasScannerFisik = pasangScannerFisik((code) => {
    cariDanTambahBarcode(code);
  });

  // ---------- Toolbar Pencarian & Toggle View ----------
  elSearch?.addEventListener('input', (e) => {
    state.kataKunci = e.target.value;
    elSearchClear.style.display = state.kataKunci ? 'block' : 'none';
    renderKatalog();
  });

  elSearchClear?.addEventListener('click', () => {
    state.kataKunci = '';
    elSearch.value = '';
    elSearchClear.style.display = 'none';
    renderKatalog();
    elSearch.focus();
  });

  elBtnGrid?.addEventListener('click', () => {
    state.viewMode = 'grid';
    localStorage.setItem('pos_view_mode', 'grid');
    elBtnGrid.classList.add('active');
    elBtnList.classList.remove('active');
    renderKatalog();
  });

  elBtnList?.addEventListener('click', () => {
    state.viewMode = 'list';
    localStorage.setItem('pos_view_mode', 'list');
    elBtnList.classList.add('active');
    elBtnGrid.classList.remove('active');
    renderKatalog();
  });

  // ---------- Keyboard Shortcuts Global ----------
  const handleKeyShortcuts = (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      elSearch?.focus();
      elSearch?.select();
    } else if (e.key === 'F4') {
      e.preventDefault();
      bukaModalPembayaran();
    } else if (e.key === 'F7') {
      e.preventDefault();
      tahanTransaksi();
    } else if (e.key === 'F8') {
      e.preventDefault();
      bukaModalDaftarPending();
    }
  };

  window.addEventListener('keydown', handleKeyShortcuts);

  // Inisialisasi awal
  muatDataKatalog();

  // Return cleanup bila berganti rute
  return () => {
    window.removeEventListener('keydown', handleKeyShortcuts);
    lepasScannerFisik();
  };
}


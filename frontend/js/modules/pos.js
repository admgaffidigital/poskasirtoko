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

import { api, apiCall } from '../api.js';
import { store } from '../state.js';
import { formatRupiah, parseRupiah, formatQty, parseQty, formatTanggal, escapeHtml, formatSkuLabel } from '../utils/format.js';
import { showToast, showModal, showConfirm, ICONS } from '../utils/ui.js';
import { cetakBluetooth, cetakRawBT, cetakBrowser, buatTautanWhatsApp, tampilkanModalKoneksiPrinter, bukaModalPilihanCetakPenjualan, bukaModalPilihanCetakShift, cetakPenawaranA5, buatTautanWhatsAppPenawaran, bukaModalHasilPenawaran } from '../utils/printer.js';
import { bunyikanBeep, bukaKameraScanner, pasangScannerFisik } from '../utils/barcode.js';
import { haptic } from '../utils/native.js';
import { adalahErrorJaringanOffline, tambahKeAntreanOffline } from '../utils/offline-queue.js';

export function renderPosModule(container) {
  // Tandai layout POS terkunci ala workstation kasir profesional (Accurate POS)
  container.classList.add('pos-content-locked');
  document.body.classList.add('pos-route-active');
  document.querySelector('.app')?.classList.add('pos-mode');

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
    daftarPelanggan: [],
    diskonTransaksi: { tipe: '', nilai: 0 },
    pengiriman: 'ambil', // 'ambil' | 'dikirim'
    alamatKirim: '',
    ongkir: 0,
    catatan: '',
    pendingCount: 0,
    pengaturan: store.get('pengaturan') || {},
    user: store.get('user') || {},
    isLoading: true,
    page: 1,
    pageSize: 30,
    totalProduk: 0,
    hasMore: false,
    isLoadingMore: false,
    multiSelectMode: false,
    multiSelectedMap: new Map(),
    shiftAktif: null,
    penawaranAktifId: ''
  };

  const isOwnerAtauAdmin = state.user.role === 'owner' || state.user.role === 'admin';

  // Render Shell POS Layout
  container.innerHTML = `
    <!-- Navigasi Tab Mobile (Hanya muncul di HP / Layar < 992px) -->
    <div class="pos-mobile-nav segmented no-print" role="tablist">
      <button type="button" id="pos-tab-catalog" class="active" aria-pressed="true">
        ${ICONS.grid}
        <span>Katalog</span>
      </button>
      <button type="button" id="pos-tab-cart" aria-pressed="false">
        ${ICONS.cart}
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
              ${ICONS.scan}
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

            <!-- Toggle Mode Tandai & Pilih Banyak ke Keranjang -->
            <button type="button" id="btn-pos-multi-select" class="btn btn-secondary btn-sm" style="border-radius: var(--radius-full); flex-shrink: 0; gap: 5px; padding: 0 11px; height: 34px; min-height: 34px;" title="Tandai & Pilih Banyak Barang Sekaligus ke Keranjang">
              ${ICONS.check}
              <span>Pilih</span>
            </button>

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
            ${ICONS.chevronLeft}
            <span>Kembali ke Katalog / Tambah Barang</span>
          </button>
        </div>

        <!-- Cart Header -->
        <div class="pos-cart-header">
          <!-- Top Row: Judul & Reset Cart -->
          <div class="pos-cart-title-row">
            <div class="pos-cart-heading">
              <span class="pos-cart-title-icon">${ICONS.cart}</span>
              <span class="pos-cart-title-text">Keranjang Belanja</span>
              <span class="badge badge-primary pos-cart-count-badge" id="cart-item-count">0</span>
            </div>
            <button type="button" id="btn-clear-cart" class="btn btn-ghost btn-sm text-danger pos-btn-clear" title="Kosongkan Keranjang Belanja">
              ${ICONS.rotateCcw}
              <span>Reset</span>
            </button>
          </div>

          <!-- Quick Actions Toolbar: 5 Tombol Operasional POS (Shift, Biaya, Struk, Printer, Pending) -->
          <div class="pos-cart-quickbar">
            <button type="button" id="btn-pos-shift" class="pos-quick-btn" title="Buka / Tutup Shift & Rekap Kas Kasir (F3)">
              ${ICONS.wallet}
              <span id="label-pos-shift-btn">Shift <span class="pos-kbd-hint">(F3)</span></span>
              <span id="dot-pos-shift-aktif" style="display: none; width: 7px; height: 7px; border-radius: 50%; background: var(--success); flex-shrink: 0;"></span>
            </button>
            <button type="button" id="btn-pos-kas-keluar" class="pos-quick-btn" title="Catat Pengeluaran Kasir / Petty Cash">
              ${ICONS.tag}
              <span>Biaya</span>
            </button>
            <button type="button" id="btn-pos-reprint" class="pos-quick-btn" title="Cetak Ulang Transaksi Terakhir (F9)">
              ${ICONS.printer}
              <span>Struk <span class="pos-kbd-hint">(F9)</span></span>
            </button>
            <button type="button" id="btn-pos-panduan-printer" class="pos-quick-btn" title="Atur Printer Bluetooth">
              ${ICONS.settings}
              <span>Printer</span>
            </button>
            <button type="button" id="btn-pending-list" class="pos-quick-btn position-relative" title="Daftar Transaksi Ditahan & Penawaran Harga RAB (F8)">
              ${ICONS.clipboard}
              <span>Pending/RAB <span class="pos-kbd-hint">(F8)</span></span>
              <span class="badge badge-warning badge-sm" id="pending-badge" style="display: none;">0</span>
            </button>
          </div>

          <!-- Pelanggan / Member Card -->
          <div class="pos-customer-card" id="pos-customer-pill">
            <div class="pos-customer-main">
              <div class="pos-customer-avatar">
                ${ICONS.users}
              </div>
              <div class="pos-customer-details">
                <div class="pos-customer-name" id="label-pelanggan-nama">Pelanggan Umum</div>
                <div class="pos-customer-sub" id="label-pelanggan-sub">(Tunai / Non-Tempo)</div>
              </div>
            </div>
            <button type="button" id="btn-ganti-pelanggan" class="btn btn-secondary btn-sm pos-customer-btn">
              Pilih Member
            </button>
          </div>
        </div>

        <!-- Cart Items List -->
        <div class="pos-cart-items" id="pos-cart-items">
          <div class="pos-cart-empty">
            <div class="pos-empty-icon-wrap">
              <span class="icon-fit" style="width: 36px; height: 36px;">${ICONS.cart}</span>
            </div>
            <div class="pos-empty-title">Keranjang masih kosong</div>
            <div class="pos-empty-sub">Pilih produk dari katalog atau scan barcode<span class="d-none-mobile"> (F2)</span></div>
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
              <span class="badge badge-info badge-sm" id="badge-diskon-trans" style="cursor: pointer;">+ Diskon</span>
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

          <div class="divider" style="margin: var(--sp-1) 0;"></div>

          <!-- Grand Total Row -->
          <div class="pos-total-row">
            <div class="pos-total-label">TOTAL BELANJA</div>
            <div class="fw-bold pos-grand-total mono" id="cart-grand-total">Rp 0</div>
          </div>

          <!-- Action Buttons: RAB, Hold & Pay -->
          <div class="pos-cart-action-btns">
            <button type="button" id="btn-buat-rab" class="btn btn-secondary btn-lg pos-btn-rab" style="flex: 0.85;" title="Simpan sebagai Penawaran Harga / Estimasi RAB (tanpa potong stok)">
              ${ICONS.calculator} <span>RAB</span>
            </button>
            <button type="button" id="btn-hold-cart" class="btn btn-secondary btn-lg pos-btn-hold" style="flex: 1;" title="Tahan Transaksi (F7)">
              ${ICONS.clipboard} <span>Tahan</span><span class="d-none-mobile"> (F7)</span>
            </button>
            <button type="button" id="btn-checkout-pay" class="btn btn-primary btn-lg pos-btn-pay" style="flex: 1.75;" title="Bayar Sekarang (F4)">
              ${ICONS.wallet} <span>BAYAR</span><span class="d-none-mobile"> (F4)</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Multi-Select Bar POS Kasir (Solid) -->
    <div class="bulk-action-bar no-print" id="pos-multi-bar" style="display: none;">
      <div class="bulk-action-info">
        <span class="bulk-action-count" id="pos-multi-count">0</span>
        <span>barang ditandai</span>
      </div>
      <div class="bulk-action-btns">
        <button type="button" class="btn btn-sm btn-bulk-ghost" id="btn-pos-multi-cancel">Batal</button>
        <button type="button" class="btn btn-sm btn-primary" id="btn-pos-multi-add" disabled>
          ${ICONS.cart}
          <span>Masukkan ke Keranjang</span>
        </button>
      </div>
    </div>

    <!-- Floating Bottom Cart Bar (Hanya di Mobile saat katalog aktif & keranjang ada isinya) -->
    <div class="pos-mobile-floating-cart no-print" id="pos-floating-cart" style="display: none;">
      <div class="row" style="align-items: center; gap: var(--sp-3);">
        <div class="pos-floating-icon" style="background: var(--primary-soft); color: var(--primary); width: 38px; height: 38px; border-radius: var(--radius-md); display: grid; place-items: center; flex-shrink: 0;">
          ${ICONS.cart}
        </div>
        <div>
          <div class="fw-bold mono" id="floating-cart-total" style="font-size: var(--fs-md); color: var(--primary); line-height: 1.2;">Rp 0</div>
          <div class="text-xs text-muted" id="floating-cart-count">0 item</div>
        </div>
      </div>
      <button type="button" class="btn btn-primary" id="btn-floating-view-cart" style="font-weight: var(--fw-bold); padding: 7px 15px; border-radius: var(--radius-full); box-shadow: var(--shadow-sm);">
        <span>Bayar / Cek</span>
        ${ICONS.arrowRight}
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
  const elBtnMultiSelect = container.querySelector('#btn-pos-multi-select');
  const elPosMultiBar = container.querySelector('#pos-multi-bar');
  const elPosMultiCount = container.querySelector('#pos-multi-count');
  const elBtnPosMultiCancel = container.querySelector('#btn-pos-multi-cancel');
  const elBtnPosMultiAdd = container.querySelector('#btn-pos-multi-add');

  const syncPosMultiBar = () => {
    if (elBtnMultiSelect) {
      elBtnMultiSelect.className = `btn btn-sm ${state.multiSelectMode ? 'btn-primary' : 'btn-secondary'}`;
    }
    const cnt = state.multiSelectedMap.size;
    if (elPosMultiCount) elPosMultiCount.textContent = String(cnt);
    if (elBtnPosMultiAdd) {
      elBtnPosMultiAdd.disabled = cnt === 0;
      elBtnPosMultiAdd.innerHTML = `${ICONS.cart}<span>${cnt > 0 ? `Masukkan ${cnt} ke Keranjang` : 'Masukkan ke Keranjang'}</span>`;
    }
    if (elPosMultiBar) {
      elPosMultiBar.style.display = state.multiSelectMode ? 'flex' : 'none';
    }
    perbaruiFloatingCart();
  };

  const setPosMultiSelectMode = (aktif) => {
    state.multiSelectMode = Boolean(aktif);
    if (!state.multiSelectMode) {
      state.multiSelectedMap.clear();
    }
    syncPosMultiBar();
    renderKatalog();
  };

  window.__posCancelSelectMode = () => {
    if (state.multiSelectMode) {
      setPosMultiSelectMode(false);
      return true;
    }
    return false;
  };

  elBtnMultiSelect?.addEventListener('click', () => {
    haptic.light();
    setPosMultiSelectMode(!state.multiSelectMode);
  });

  elBtnPosMultiCancel?.addEventListener('click', () => {
    haptic.light();
    setPosMultiSelectMode(false);
  });

  elBtnPosMultiAdd?.addEventListener('click', () => {
    if (state.multiSelectedMap.size === 0) return;
    let addedCount = 0;
    state.multiSelectedMap.forEach((cachedProd, id) => {
      const p = state.katalog.find((x) => x.id === id) || cachedProd;
      if (!p) return;
      const punyaVarian = p.punya_varian && Array.isArray(p.varian) && p.varian.length > 0;
      if (punyaVarian) {
        const v = p.varian.find((x) => x.aktif !== false) || p.varian[0];
        if (!v) return;
        const hargaV = Number(v.harga_ritel || p.harga_ritel || 0);
        tambahItemKeKeranjang({
          produk_id: p.id,
          varian_id: v.id || '',
          nama: `${p.nama} - ${v.nama_varian}`,
          satuan: p.satuan_dasar,
          faktor: 1,
          qty: 1,
          qty_dibawa: 1,
          tipe_harga: 'ritel',
          harga_asli: hargaV,
          harga: hargaV,
          hpp: Number(v.hpp || p.hpp || 0),
          diskon_tipe: '',
          diskon_nilai: 0,
          diskon: 0,
          subtotal: hargaV,
          _pr: p,
          _var: v
        });
      } else {
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
      }
      addedCount++;
    });

    if (addedCount > 0) {
      bunyikanBeep();
      haptic.success();
      showToast(`${addedCount} barang ditandai berhasil dimasukkan ke keranjang!`, 'success', 2400);
    }
    setPosMultiSelectMode(false);
  });

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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const count = state.keranjang.length;
    if (elMobileCartBadge) {
      elMobileCartBadge.textContent = count;
      elMobileCartBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    if (!elFloatingCart) return;
    if (isMobile && state.mobileView === 'catalog' && count > 0 && !state.multiSelectMode) {
      elFloatingCart.style.display = 'flex';
    } else {
      elFloatingCart.style.display = 'none';
    }
  }

  // Sembunyikan floating bar otomatis jika layar di-resize ke desktop/tablet
  const handleResize = () => {
    perbaruiFloatingCart();
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      if (elPosWrapper && state.mobileView === 'cart') {
        setMobileView('catalog');
      }
    }
  };
  window.addEventListener('resize', handleResize);

  elTabCatalog?.addEventListener('click', () => {
    haptic.light();
    setMobileView('catalog');
  });
  elTabCart?.addEventListener('click', () => {
    haptic.light();
    setMobileView('cart');
  });
  elFloatingCart?.addEventListener('click', () => {
    haptic.medium();
    setMobileView('cart');
  });
  elBtnFloatingCart?.addEventListener('click', (e) => {
    e.stopPropagation();
    haptic.medium();
    setMobileView('cart');
  });
  elBtnBackToCatalog?.addEventListener('click', () => {
    haptic.light();
    setMobileView('catalog');
  });

  // ---------- Inisialisasi Data & Load More ----------
  async function muatDataKatalog(reset = true) {
    if (reset) {
      state.page = 1;
      state.isLoading = true;
    }
    try {
      const payloadPrd = {
        aktif_saja: true,
        page: state.page,
        limit: state.pageSize
      };
      if (state.kategoriAktif && state.kategoriAktif !== 'semua') {
        payloadPrd.kategori_id = state.kategoriAktif;
      }
      if (state.kataKunci) {
        payloadPrd.q = state.kataKunci;
      }

      if (reset) {
        // Ambil kategori & produk aktif secara paralel tanpa diblokir oleh pending/pengaturan
        const [resKat, resProd] = await Promise.all([
          api.post('kategori.list', { aktif_saja: true }),
          api.post('produk.list', payloadPrd)
        ]);

        if (resKat.ok) state.kategori = resKat.data.items || [];
        if (resProd.ok) {
          state.katalog = resProd.data.items || [];
          state.totalProduk = resProd.data.total ?? state.katalog.length;
          state.hasMore = resProd.data.has_more ?? (state.katalog.length < state.totalProduk);
        }

        renderKategoriBar();
        renderKatalog();

        // Segarkan pengaturan & jumlah pending di latar belakang tanpa menahan katalog utama
        api.post('pengaturan.get').then((resPeng) => {
          if (resPeng.ok) {
            state.pengaturan = resPeng.data.pengaturan || resPeng.data || {};
            store.set('pengaturan', state.pengaturan);
            store.setToko({
              nama: state.pengaturan.toko_nama,
              alamat: state.pengaturan.toko_alamat,
              hp: state.pengaturan.toko_hp,
              nota_footer: state.pengaturan.nota_footer
            });
          }
        }).catch(() => { });

        api.post('penjualan.pending.list').then((resPending) => {
          if (resPending.ok) {
            state.pendingCount = (resPending.data.items || []).length;
            perbaruiBadgePending();
          }
        }).catch(() => { });

        // Pre-warm daftar pelanggan/member di latar belakang agar tombol "Pilih Member" terbuka instan (0ms)
        api.post('pelanggan.list', { semua: true }).then((resPel) => {
          if (resPel.ok && resPel.data) {
            state.daftarPelanggan = resPel.data.items || [];
          }
        }).catch(() => { });
      } else {
        // Ambil produk halaman berikutnya (Load More)
        const resProd = await api.post('produk.list', payloadPrd);
        if (resProd.ok) {
          const itemsBaru = resProd.data.items || [];
          itemsBaru.forEach((p) => {
            if (!state.katalog.some((x) => x.id === p.id)) {
              state.katalog.push(p);
            }
          });
          state.totalProduk = resProd.data.total ?? state.katalog.length;
          state.hasMore = resProd.data.has_more ?? (state.katalog.length < state.totalProduk);
          renderKategoriBar();
          renderKatalog();
        }
      }
    } catch (err) {
      console.error('Gagal memuat katalog POS:', err);
      showToast('Gagal memuat data katalog: ' + err.message, 'error');
    } finally {
      state.isLoading = false;
      state.isLoadingMore = false;
    }
  }

  async function muatLebihBanyakKatalog() {
    if (state.isLoadingMore || !state.hasMore) return;
    state.isLoadingMore = true;
    const btnLoad = elProductArea?.querySelector('#btn-load-more-pos');
    if (btnLoad) {
      btnLoad.disabled = true;
      btnLoad.innerHTML = `
        <span class="spinner-sm" style="border-color: currentColor; border-top-color: transparent; margin-right: 8px;"></span>
        <span>Memuat produk...</span>
      `;
    }
    state.page++;
    await muatDataKatalog(false);
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
        Semua (${state.katalog.length}${state.hasMore ? '+' : ''})
      </button>
    `;

    // Hitung jumlah produk per kategori dalam 1 pass O(N) agar cepat saat katalog besar
    const countByCat = new Map();
    for (let i = 0; i < state.katalog.length; i++) {
      const cid = state.katalog[i].kategori_id;
      if (cid) countByCat.set(cid, (countByCat.get(cid) || 0) + 1);
    }

    // Kelompokkan parent dan sub-kategori
    const parents = [];
    const parentIdSet = new Set();
    const subsByParent = {};
    state.kategori.forEach((k) => {
      if (!k.parent_id) {
        parents.push(k);
        parentIdSet.add(k.id);
      } else {
        if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
        subsByParent[k.parent_id].push(k);
      }
    });
    parents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

    parents.forEach((kat) => {
      const subs = subsByParent[kat.id] || [];
      subs.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

      // Total barang di kategori induk + seluruh sub-kategorinya (O(1) lookup)
      let jumlahTotal = countByCat.get(kat.id) || 0;
      for (let j = 0; j < subs.length; j++) {
        jumlahTotal += countByCat.get(subs[j].id) || 0;
      }

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
          const subJumlah = countByCat.get(sub.id) || 0;
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
    const orphans = state.kategori.filter((k) => k.parent_id && !parentIdSet.has(k.parent_id));
    orphans.forEach((kat) => {
      const jumlah = countByCat.get(kat.id) || 0;
      html += `
        <button type="button" class="pos-chip ${state.kategoriAktif === kat.id ? 'active' : ''}" data-cat="${kat.id}">
          ${escapeHtml(kat.nama)} (${jumlah})
        </button>
      `;
    });

    elCategoryBar.innerHTML = html;

    elCategoryBar.querySelectorAll('.pos-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        if (state.kategoriAktif === cat) return;
        state.kategoriAktif = cat;
        state.page = 1;
        renderKategoriBar();
        muatDataKatalog(true);
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
          <div style="margin-bottom: var(--sp-2); display: flex; justify-content: center; color: var(--text-muted); opacity: 0.4;">
            <span class="icon-fit" style="width: 38px; height: 38px;">${ICONS.search}</span>
          </div>
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
        hppTag = `<span class="badge badge-info badge-sm">HPP ${formatRupiah(p.hpp)}</span>`;
      }

      let infoOpsi = '';
      if (punyaVarian) {
        infoOpsi = `<span class="badge badge-dot badge-sm pos-card-opt-badge">${p.varian.length} Varian</span>`;
      } else if (punyaSatuanKonversi) {
        infoOpsi = `<span class="badge badge-dot badge-sm pos-card-opt-badge">${p.satuan_konversi.length + 1} Satuan</span>`;
      }

      const rawKode = p.sku || p.barcode || '';
      const skuLabel = formatSkuLabel(rawKode);
      const isMultiSelected = state.multiSelectMode && state.multiSelectedMap.has(p.id);

      html += `
        <div class="pos-product-card ${isMultiSelected ? 'is-multi-selected' : ''}" data-id="${p.id}" tabindex="0">
          <div class="pos-card-visual ${p.foto_url ? 'has-photo' : 'no-photo'}">
            ${state.multiSelectMode ? `<div class="pos-multi-check-badge">${ICONS.check}</div>` : ''}
            ${p.foto_url ? `
              <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" class="pos-card-img" loading="lazy" decoding="async" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='grid'; if (this.parentElement) { this.parentElement.classList.remove('has-photo'); this.parentElement.classList.add('no-photo'); }">
              <div class="pos-card-icon-wrap" style="display: none;">
                ${ICONS.box}
              </div>
            ` : `
              <div class="pos-card-icon-wrap">
                ${ICONS.box}
              </div>
            `}
            ${infoOpsi ? `<div class="pos-card-badges-left">${infoOpsi}</div>` : ''}
            <div class="pos-card-badges-top">
              ${badgeStok}
            </div>
          </div>

          <div class="pos-card-content">
            <div class="pos-card-meta-row">
              <span class="pos-card-sku">${skuLabel ? escapeHtml(skuLabel) : ''}</span>
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
                ${ICONS.plus}
              </button>
            </div>
          </div>
        </div>
      `;
    });

    // Tombol Load More (Muat Lebih Banyak)
    if (state.hasMore) {
      html += `
        <div class="pos-load-more-wrap" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: var(--sp-4) var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-pos-load-more" id="btn-load-more-pos" style="min-width: 250px; font-weight: 600; padding: 12px 24px; border-radius: var(--radius-lg); gap: 8px; box-shadow: var(--shadow-sm); display: inline-flex; align-items: center; justify-content: center;">
            ${ICONS.plus}
            <span>Muat Lebih Banyak (${items.length} dari ${state.totalProduk || items.length} produk)</span>
          </button>
        </div>
      `;
    } else if (items.length > 0 && state.totalProduk > state.pageSize) {
      html += `
        <div class="pos-load-all-wrap text-center text-xs text-muted" style="grid-column: 1 / -1; width: 100%; padding: var(--sp-3); display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${ICONS.check}
          <span>Semua ${items.length} produk telah dimuat</span>
        </div>
      `;
    }

    html += `</div>`;
    elProductArea.innerHTML = html;
    pasangAksiKlikKatalog();
    syncInCartBadges();
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
        hppTag = `<span class="badge badge-info badge-sm">HPP ${formatRupiah(p.hpp)}</span>`;
      }

      let infoOpsi = '';
      if (punyaVarian) {
        infoOpsi = `<span class="badge badge-dot badge-sm" style="background: var(--surface-3);">${p.varian.length} Varian</span>`;
      } else if (punyaSatuanKonversi) {
        infoOpsi = `<span class="badge badge-dot badge-sm" style="background: var(--surface-3);">${p.satuan_konversi.length + 1} Satuan</span>`;
      }

      const rawKode = p.sku || p.barcode || '';
      const skuLabel = formatSkuLabel(rawKode);
      const isMultiSelected = state.multiSelectMode && state.multiSelectedMap.has(p.id);

      html += `
        <div class="pos-list-item ${isMultiSelected ? 'is-multi-selected' : ''}" data-id="${p.id}" tabindex="0">
          ${state.multiSelectMode ? `<div class="pos-list-multi-check">${ICONS.check}</div>` : ''}
          <div class="pos-list-avatar">
            ${p.foto_url ? `
              <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" class="pos-list-img" loading="lazy" decoding="async" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='block';">
              <span class="icon-fit" style="width: 24px; height: 24px; display: none;">${ICONS.box}</span>
            ` : `
              <span class="icon-fit" style="width: 24px; height: 24px;">${ICONS.box}</span>
            `}
          </div>

          <div class="pos-list-main">
            <div class="pos-list-title" title="${escapeHtml(p.nama)}">${escapeHtml(p.nama)}</div>
            <div class="pos-list-badges-row">
              ${badgeStok}
              ${skuLabel ? `<span class="pos-badge-sku">${escapeHtml(skuLabel)}</span>` : ''}
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
              ${ICONS.plus}
              <span>Tambah</span>
            </button>
          </div>
        </div>
      `;
    });

    // Tombol Load More (Muat Lebih Banyak)
    if (state.hasMore) {
      html += `
        <div class="pos-load-more-wrap" style="width: 100%; text-align: center; padding: var(--sp-4) var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-pos-load-more" id="btn-load-more-pos" style="min-width: 250px; font-weight: 600; padding: 12px 24px; border-radius: var(--radius-lg); gap: 8px; box-shadow: var(--shadow-sm); display: inline-flex; align-items: center; justify-content: center;">
            ${ICONS.plus}
            <span>Muat Lebih Banyak (${items.length} dari ${state.totalProduk || items.length} produk)</span>
          </button>
        </div>
      `;
    } else if (items.length > 0 && state.totalProduk > state.pageSize) {
      html += `
        <div class="pos-load-all-wrap text-center text-xs text-muted" style="width: 100%; padding: var(--sp-3); display: flex; align-items: center; justify-content: center; gap: 6px;">
          ${ICONS.check}
          <span>Semua ${items.length} produk telah dimuat</span>
        </div>
      `;
    }

    html += `</div>`;
    elProductArea.innerHTML = html;
    pasangAksiKlikKatalog();
    syncInCartBadges();
  }

  // Delegasi event tunggal pada elProductArea untuk performa tinggi & hemat memori
  let klikDelegasiDipasang = false;
  function pasangAksiKlikKatalog() {
    if (klikDelegasiDipasang || !elProductArea) return;
    klikDelegasiDipasang = true;

    elProductArea.addEventListener('click', (e) => {
      if (e.target.closest('#btn-load-more-pos')) {
        muatLebihBanyakKatalog();
        return;
      }
      const el = e.target.closest('.pos-product-card, .pos-product-row, .pos-list-item');
      if (!el) return;
      const id = el.getAttribute('data-id');
      const p = state.katalog.find((x) => x.id === id);
      if (state.multiSelectMode) {
        if (state.multiSelectedMap.has(id)) {
          state.multiSelectedMap.delete(id);
          el.classList.remove('is-multi-selected');
        } else if (p) {
          state.multiSelectedMap.set(id, p);
          el.classList.add('is-multi-selected');
        }
        haptic.light();
        syncPosMultiBar();
        return;
      }
      if (p) pilihProduk(p);
    });

    elProductArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const el = e.target.closest('.pos-product-card, .pos-product-row, .pos-list-item');
        if (!el) return;
        e.preventDefault();
        const id = el.getAttribute('data-id');
        const p = state.katalog.find((x) => x.id === id);
        if (p) pilihProduk(p);
      }
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
    haptic.medium();
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
    const p = it._pr || state.katalog.find((x) => x.id === it.produk_id);
    if (!p) return;
    const minGrosir = Number(p.min_grosir_qty || 1);
    const punyaGrosir = p.harga_grosir && p.harga_grosir > 0;

    // Jika qty mencapai min_grosir dan belum diedit kustom manual
    if (it.tipe_harga !== 'kustom' && punyaGrosir && it.qty >= minGrosir && it.satuan === p.satuan_dasar) {
      it.tipe_harga = 'grosir';
      it.harga = p.harga_grosir;
    } else if (it.tipe_harga !== 'kustom' && it.satuan === p.satuan_dasar) {
      it.tipe_harga = 'ritel';
      it.harga = p.harga_ritel;
    } else if (it.tipe_harga !== 'kustom' && it.satuan !== p.satuan_dasar) {
      const konv = (p.satuan_konversi || []).find((s) => s.satuan === it.satuan && !s.deleted);
      if (konv) {
        if (konv.harga_grosir && konv.harga_grosir > 0 && it.qty >= minGrosir) {
          it.tipe_harga = 'grosir';
          it.harga = konv.harga_grosir;
        } else {
          it.tipe_harga = 'ritel';
          it.harga = konv.harga_ritel;
        }
      }
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
        <div class="pos-cart-empty">
          <div class="pos-empty-icon-wrap">
            <span class="icon-fit" style="width: 36px; height: 36px;">${ICONS.cart}</span>
          </div>
          <div class="pos-empty-title">Keranjang masih kosong</div>
          <div class="pos-empty-sub">Pilih produk dari katalog atau scan barcode (F2)</div>
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

      const p = it._pr || state.katalog.find((x) => x.id === it.produk_id);
      const punyaMultiSatuan = p && (p.satuan_konversi || []).filter((s) => !s.deleted).length > 0;
      let badgeSatuanHtml = `<span class="badge badge-sm" style="background: var(--surface-3);">${escapeHtml(it.satuan)}</span>`;
      if (punyaMultiSatuan) {
        badgeSatuanHtml = `
          <button type="button" class="badge badge-sm btn-ganti-satuan-item" data-idx="${idx}" title="Ganti Satuan Jual (${escapeHtml(it.satuan)})" style="cursor: pointer; background: var(--primary-soft); color: var(--primary-soft-text); border: 1px solid var(--primary); display: inline-flex; align-items: center; gap: 3px; font-weight: var(--fw-semibold);">
            <span>${escapeHtml(it.satuan)}</span>
            <span class="icon-fit" style="width: 11px; height: 11px;">${ICONS.chevronDown}</span>
          </button>
        `;
      }

      html += `
        <div class="pos-cart-item" data-idx="${idx}">
          <div class="pos-item-header">
            <div class="pos-item-info">
              <div class="pos-item-name">${escapeHtml(it.nama)}</div>
              <div class="pos-item-badges">
                ${badgeSatuanHtml}
                ${labelTipeHarga}
                ${it.diskon > 0 ? `<span class="badge badge-danger badge-sm">Hemat ${formatRupiah(it.diskon)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-icon btn-sm text-danger btn-hapus-item" data-idx="${idx}" title="Hapus Item" style="width: 26px; height: 26px;">
              ${ICONS.x}
            </button>
          </div>

          <div class="pos-item-controls">
            <!-- Qty Stepper -->
            <div class="pos-item-stepper">
              <button type="button" class="btn-item-min" data-idx="${idx}" title="Kurang">-</button>
              <input type="number" class="input-item-qty mono" data-idx="${idx}" value="${it.qty}" min="0.001" step="any" />
              <button type="button" class="btn-item-plus" data-idx="${idx}" title="Tambah">+</button>
            </div>

            <!-- Harga & Diskon Button -->
            <div class="pos-item-pricing">
              <div class="pos-item-actions">
                <button type="button" class="btn btn-ghost btn-sm btn-edit-harga" data-idx="${idx}" style="padding: 0 4px; font-size: var(--fs-2xs); text-decoration: underline;" title="Ubah Harga Satuan">
                  @${formatRupiah(it.harga, false)}
                </button>
                <button type="button" class="btn btn-ghost btn-sm btn-item-diskon" data-idx="${idx}" style="padding: 0 4px; font-size: var(--fs-2xs); color: var(--danger-text);" title="Beri Diskon Item">
                  % Diskon
                </button>
              </div>
              <div class="pos-item-subtotal">
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
    // Ganti Satuan Item Langsung di Keranjang (Fitur #3)
    elCartItems.querySelectorAll('.btn-ganti-satuan-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        bukaModalGantiSatuanItem(idx);
      });
    });

    // Hapus Item
    elCartItems.querySelectorAll('.btn-hapus-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic.delete();
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        state.keranjang.splice(idx, 1);
        renderKeranjang();
      });
    });

    // Min Qty
    elCartItems.querySelectorAll('.btn-item-min').forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic.light();
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
        haptic.light();
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

    syncInCartBadges();
  }

  /**
   * Tandai secara visual kartu/baris produk yang sedang berada di keranjang beserta total qty-nya.
   */
  function syncInCartBadges() {
    if (!elProductArea) return;
    const qtyByProduk = new Map();
    state.keranjang.forEach((it) => {
      qtyByProduk.set(it.produk_id, bulatQty((qtyByProduk.get(it.produk_id) || 0) + (Number(it.qty) || 0)));
    });

    elProductArea.querySelectorAll('.pos-product-card[data-id]').forEach((card) => {
      const id = card.getAttribute('data-id');
      const qty = qtyByProduk.get(id) || 0;
      card.classList.toggle('is-in-cart', qty > 0);
      const visual = card.querySelector('.pos-card-visual');
      if (!visual) return;
      let pill = visual.querySelector('.pos-in-cart-pill');
      if (qty > 0) {
        if (!pill) {
          pill = document.createElement('span');
          pill.className = 'pos-in-cart-pill';
          visual.appendChild(pill);
        }
        pill.textContent = `×${formatQty(qty)}`;
      } else if (pill) {
        pill.remove();
      }
    });

    elProductArea.querySelectorAll('.pos-list-item[data-id]').forEach((row) => {
      const id = row.getAttribute('data-id');
      const qty = qtyByProduk.get(id) || 0;
      row.classList.toggle('is-in-cart', qty > 0);
      const rightArea = row.querySelector('.pos-list-right') || row;
      let pill = row.querySelector('.pos-list-in-cart-pill');
      if (qty > 0) {
        if (!pill) {
          pill = document.createElement('span');
          pill.className = 'pos-list-in-cart-pill';
          rightArea.prepend(pill);
        }
        pill.textContent = `×${formatQty(qty)}`;
      } else if (pill) {
        pill.remove();
      }
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

  // ---------- Dialog Ganti Satuan Langsung di Keranjang (Fitur #3) ----------
  function bukaModalGantiSatuanItem(idx) {
    const it = state.keranjang[idx];
    if (!it) return;
    const p = it._pr || state.katalog.find((x) => x.id === it.produk_id);
    if (!p) {
      showToast('Data produk tidak ditemukan.', 'warning');
      return;
    }

    const satuanList = [{ satuan: p.satuan_dasar, faktor: 1, harga_ritel: p.harga_ritel, harga_grosir: p.harga_grosir }].concat(
      (p.satuan_konversi || []).filter((s) => !s.deleted)
    );

    if (satuanList.length <= 1) {
      showToast('Produk ini hanya memiliki satu jenis satuan.', 'info');
      return;
    }

    const modal = showModal({
      title: `Ganti Satuan: ${it.nama}`,
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="text-xs text-muted">
            Pilih satuan penjualan. Harga dan subtotal otomatis disesuaikan dengan faktor konversi:
          </div>
          <div class="stack" style="gap: var(--sp-2);">
            ${satuanList.map((s) => {
        const aktif = s.satuan === it.satuan;
        let hargaDisplay = s.harga_ritel;
        if (it._var) {
          hargaDisplay = Math.round((it._var.harga_ritel || 0) * (s.faktor || 1));
        } else if (it.tipe_harga === 'grosir' && s.harga_grosir > 0) {
          hargaDisplay = s.harga_grosir;
        }
        return `
                <button type="button" class="btn btn-sm btn-pilih-satuan-item ${aktif ? 'btn-primary' : 'btn-secondary'}" data-sat="${escapeHtml(s.satuan)}" style="justify-content: space-between; padding: 10px 14px; text-align: left;">
                  <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span class="fw-bold" style="font-size: var(--fs-sm);">${escapeHtml(s.satuan)} ${s.faktor > 1 ? `<small style="font-weight: normal; opacity: 0.85;">(Isi ${s.faktor} ${escapeHtml(p.satuan_dasar)})</small>` : '<small style="font-weight: normal; opacity: 0.85;">(Satuan Dasar)</small>'}</span>
                    ${s.harga_grosir && s.harga_grosir > 0 && !it._var ? `<small style="opacity: 0.8;">Grosir: ${formatRupiah(s.harga_grosir)}</small>` : ''}
                  </div>
                  <div class="mono fw-bold" style="font-size: var(--fs-sm);">
                    ${formatRupiah(hargaDisplay)}
                  </div>
                </button>
              `;
      }).join('')}
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-ganti-satuan">Batal</button>
        </div>
      `
    });

    modal.el.querySelector('#btn-batal-ganti-satuan')?.addEventListener('click', () => modal.close());

    modal.el.querySelectorAll('.btn-pilih-satuan-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const satBaru = btn.getAttribute('data-sat');
        if (satBaru === it.satuan) {
          modal.close();
          return;
        }

        const targetSat = satuanList.find((s) => s.satuan === satBaru);
        if (!targetSat) return;

        const faktorBaru = targetSat.faktor || 1;
        const baseHpp = it._var ? (it._var.hpp || 0) : (p.hpp || 0);
        const snapshotHpp = Math.round(baseHpp * faktorBaru);

        let hargaBaru = targetSat.harga_ritel;
        if (it._var) {
          hargaBaru = Math.round((it._var.harga_ritel || 0) * faktorBaru);
        } else if (it.tipe_harga === 'grosir' && targetSat.harga_grosir > 0) {
          hargaBaru = targetSat.harga_grosir;
        }

        // Cek apakah item dengan satuan tujuan sudah ada di baris keranjang lain
        const existingIdx = state.keranjang.findIndex((x, i) =>
          i !== idx &&
          x.produk_id === it.produk_id &&
          x.varian_id === it.varian_id &&
          x.satuan === targetSat.satuan
        );

        if (existingIdx !== -1) {
          // Gabungkan qty ke baris yang sudah ada
          state.keranjang[existingIdx].qty = bulatQty(state.keranjang[existingIdx].qty + it.qty);
          state.keranjang[existingIdx].qty_dibawa = state.keranjang[existingIdx].qty;
          hitungUlangItem(state.keranjang[existingIdx]);
          state.keranjang.splice(idx, 1);
          showToast(`Satuan diganti ke ${targetSat.satuan} & digabung ke baris keranjang yang sama.`, 'success');
        } else {
          it.satuan = targetSat.satuan;
          it.faktor = faktorBaru;
          it.hpp = snapshotHpp;
          it.harga_asli = hargaBaru;
          if (it.tipe_harga !== 'kustom') {
            it.harga = hargaBaru;
          }
          hitungUlangItem(it);
          showToast(`Satuan item berhasil diganti ke ${targetSat.satuan}.`, 'success');
        }

        haptic.medium();
        renderKeranjang();
        modal.close();
      });
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

  // ---------- Dialog Pemilihan Pelanggan / Member (Instan Non-Blocking) ----------
  elBtnCustomer?.addEventListener('click', bukaModalPilihPelanggan);

  async function bukaModalPilihPelanggan() {
    let daftarPelanggan = Array.isArray(state.daftarPelanggan) ? state.daftarPelanggan : [];

    const modal = showModal({
      title: 'Pilih Pelanggan / Member',
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-sm ${!state.pelanggan ? 'btn-primary' : 'btn-secondary'}" id="btn-pilih-umum" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.user}
              <span>Pelanggan Umum (Tanpa Member)</span>
            </button>
          </div>

          <div class="divider" style="margin: var(--sp-1) 0;"></div>

          <div>
            <label class="form-label fw-bold" for="input-cari-member">Cari Member Terdaftar:</label>
            <div class="row" style="gap: var(--sp-2); flex-wrap: nowrap;">
              <div class="input-group grow">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" id="input-cari-member" class="input" placeholder="Ketik nama, no HP, atau kode member..." autocomplete="off" data-autofocus />
              </div>
            </div>
          </div>

          <div class="list" id="member-list-container" style="max-height: min(380px, 50vh); overflow-y: auto;">
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
      if (!elListContainer) return;
      let filtered = daftarPelanggan.filter((pel) => pel.aktif !== false);
      const qLow = q.trim().toLowerCase();
      if (qLow) {
        filtered = filtered.filter((pel) =>
          (pel.nama || '').toLowerCase().includes(qLow) ||
          (pel.kode || '').toLowerCase().includes(qLow) ||
          (pel.hp || '').toLowerCase().includes(qLow)
        );
      }

      // Prioritaskan yang punya Saldo Titipan atau berstatus Member
      filtered.sort((a, b) => {
        const depA = Number(a.saldo_deposit) > 0 ? 1 : 0;
        const depB = Number(b.saldo_deposit) > 0 ? 1 : 0;
        if (depA !== depB) return depB - depA;
        const memA = a.tipe === 'member' ? 1 : 0;
        const memB = b.tipe === 'member' ? 1 : 0;
        if (memA !== memB) return memB - memA;
        return String(a.nama || '').localeCompare(String(b.nama || ''));
      });

      if (filtered.length === 0) {
        elListContainer.innerHTML = `<div class="text-xs text-muted text-center p-3">Pelanggan tidak ditemukan</div>`;
        return;
      }

      let h = '';
      filtered.forEach((pel) => {
        const isSelected = state.pelanggan && state.pelanggan.id === pel.id;
        const isMem = pel.tipe === 'member';
        const dep = Number(pel.saldo_deposit) || 0;
        h += `
          <button type="button" class="list-item btn-select-pel ${isSelected ? 'active' : ''}" data-id="${pel.id}">
            <div class="list-item-icon" style="background: var(--primary-soft); color: var(--primary);">
              ${isMem ? ICONS.award : ICONS.users}
            </div>
            <div class="grow" style="text-align: left;">
              <div class="row" style="justify-content: space-between; gap: 6px;">
                <span class="fw-bold">${escapeHtml(pel.nama)}</span>
                <span class="badge ${isMem ? 'badge-primary' : 'badge-info'} text-xs">${isMem ? escapeHtml(pel.level || 'Reguler') : 'Umum'}</span>
              </div>
              <div class="text-xs text-muted mono">${escapeHtml(pel.kode || '')} • ${escapeHtml(pel.hp || '-')}</div>
              <div class="text-xs text-muted" style="margin-top: 2px;">
                ${isMem ? `Poin: <b>${pel.poin || 0}</b> | Limit: <b class="text-success">${formatRupiah(pel.sisa_limit ?? pel.limit_kredit ?? 0)}</b>` : 'Pelanggan Terdaftar'}
                ${dep > 0 ? ` • <b class="text-success">Titipan: ${formatRupiah(dep)}</b>` : ''}
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

    const muatDaftarMember = async (forceRefresh = false) => {
      if (!forceRefresh && daftarPelanggan.length > 0) {
        renderMemberList(elInputCari?.value || '');
        // Revalidasi ringan di latar belakang tanpa menahan UI
        api.post('pelanggan.list', { semua: true }).then((res) => {
          if (res.ok && res.data && Array.isArray(res.data.items)) {
            daftarPelanggan = res.data.items;
            state.daftarPelanggan = daftarPelanggan;
            renderMemberList(elInputCari?.value || '');
          }
        }).catch(() => { });
        return;
      }

      if (elListContainer && daftarPelanggan.length === 0) {
        elListContainer.innerHTML = `
          <div class="row" style="justify-content: center; align-items: center; gap: 8px; padding: var(--sp-5); color: var(--text-muted);">
            <div class="spinner spinner-sm"></div>
            <span class="text-xs">Memuat data member...</span>
          </div>
        `;
      }

      try {
        const res = await api.post('pelanggan.list', { semua: true }, { skipCache: forceRefresh });
        if (res.ok && res.data) {
          daftarPelanggan = res.data.items || [];
          state.daftarPelanggan = daftarPelanggan;
        }
        renderMemberList(elInputCari?.value || '');
        if (forceRefresh) {
          showToast('Daftar member berhasil diperbarui', 'success', 1600);
        }
      } catch (err) {
        showToast('Gagal memuat pelanggan: ' + err.message, 'error');
        renderMemberList(elInputCari?.value || '');
      }
    };

    muatDaftarMember(false);

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
      const isMem = state.pelanggan.tipe === 'member';
      const dep = Number(state.pelanggan.saldo_deposit || 0);
      const depInfo = dep > 0 ? ` • Titipan: ${formatRupiah(dep)}` : '';
      if (isMem) {
        const poinSaatIni = Number(state.pelanggan.poin || 0).toLocaleString('id-ID');
        elLabelPelSub.textContent = `Member ${state.pelanggan.level || 'Reguler'} • ${poinSaatIni} Poin • Limit: ${formatRupiah(state.pelanggan.sisa_limit || state.pelanggan.limit_kredit || 0)}${depInfo}`;
      } else {
        elLabelPelSub.textContent = `Pelanggan Terdaftar${depInfo}`;
      }
      elBtnCustomer.textContent = 'Ganti';
    } else {
      elLabelPelNama.textContent = 'Pelanggan Umum';
      elLabelPelSub.textContent = '(Tunai / Non-Tempo)';
      elBtnCustomer.textContent = 'Pilih Pelanggan';
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
    const totalBarangNet = totals.grandTotal;
    const getOngkirAktif = () => (state.pengiriman === 'dikirim' ? Math.max(0, Number(state.ongkir) || 0) : 0);
    const getGrandTotalAktif = () => totalBarangNet + getOngkirAktif();
    let grandTotal = getGrandTotalAktif();
    const isMember = state.pelanggan && state.pelanggan.tipe === 'member';
    const saldoDeposit = state.pelanggan ? Math.max(0, Number(state.pelanggan.saldo_deposit) || 0) : 0;

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
                <div class="fw-bold mono" id="checkout-grand-total" style="font-size: var(--fs-xl); color: var(--primary);">${formatRupiah(grandTotal)}</div>
                <div id="checkout-ongkir-rincian" class="text-xs text-muted" style="margin-top: 2px; display: ${getOngkirAktif() > 0 ? 'block' : 'none'};">
                  Belanja Barang: <b>${formatRupiah(totalBarangNet)}</b> + Ongkir: <b class="text-primary">${formatRupiah(getOngkirAktif())}</b>
                </div>
                <div class="text-xs text-muted" style="margin-top: 4px;">
                  Pelanggan: <b>${escapeHtml(state.pelanggan ? state.pelanggan.nama : 'Pelanggan Umum')}</b>
                  ${isMember ? `(Poin: <b>${Number(state.pelanggan.poin || 0).toLocaleString('id-ID')}</b> • Sisa Limit: <span class="text-success">${formatRupiah(state.pelanggan.sisa_limit || 0)}</span>)` : ''}
                  ${saldoDeposit > 0 ? `<div style="margin-top: 3px;">Saldo Titipan Tersedia: <b class="text-success mono">${formatRupiah(saldoDeposit)}</b></div>` : ''}
                </div>
                ${isMember ? `<div id="checkout-poin-preview" class="text-xs" style="margin-top: 6px; padding: 6px 8px; border-radius: var(--radius-sm); background: var(--surface-3); color: var(--text);"></div>` : ''}
              </div>
            </div>

            <!-- Pilihan Pengiriman -->
            <div>
              <label class="form-label fw-bold">Opsi Pengiriman:</label>
              <div class="row" style="gap: var(--sp-2);">
                <button type="button" class="btn btn-sm ${state.pengiriman === 'ambil' ? 'btn-primary' : 'btn-secondary'} btn-opt-kirim" data-kirim="ambil" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                  ${ICONS.store}
                  <span>Ambil di Toko</span>
                </button>
                <button type="button" class="btn btn-sm ${state.pengiriman === 'dikirim' ? 'btn-primary' : 'btn-secondary'} btn-opt-kirim" data-kirim="dikirim" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                  ${ICONS.truck}
                  <span>Dikirim Toko</span>
                </button>
              </div>
            </div>

            <!-- Biaya Ongkir & Alamat Kirim (Muncul jika opsi 'dikirim') -->
            <div id="box-detail-kirim" class="stack" style="display: ${state.pengiriman === 'dikirim' ? 'flex' : 'none'}; gap: var(--sp-2); background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
              <div>
                <label class="form-label fw-bold" for="checkout-ongkir">Biaya Ongkos Kirim (Rp):</label>
                <input type="number" id="checkout-ongkir" class="input fw-bold mono" value="${getOngkirAktif()}" min="0" step="5000" placeholder="0 (Gratis Ongkir)" />
                <div class="row" style="gap: 4px; margin-top: 6px; flex-wrap: wrap;">
                  <button type="button" class="btn btn-xs btn-outline-secondary btn-preset-ongkir" data-val="0">Gratis</button>
                  <button type="button" class="btn btn-xs btn-secondary btn-preset-ongkir" data-val="20000">20rb</button>
                  <button type="button" class="btn btn-xs btn-secondary btn-preset-ongkir" data-val="50000">50rb</button>
                  <button type="button" class="btn btn-xs btn-secondary btn-preset-ongkir" data-val="100000">100rb</button>
                  <button type="button" class="btn btn-xs btn-secondary btn-preset-ongkir" data-val="150000">150rb</button>
                </div>
                <div class="text-xs text-muted" style="margin-top: 4px;">Isi bebas sesuai jarak/armada (tidak dihitung poin member).</div>
              </div>
              <div>
                <label class="form-label" for="checkout-alamat">Alamat Pengiriman:</label>
                <textarea id="checkout-alamat" class="textarea" rows="2" placeholder="Alamat lengkap tujuan pengiriman...">${escapeHtml(state.alamatKirim || (state.pelanggan?.alamat || ''))}</textarea>
              </div>

              <!-- Ceklist Barang Dibawa Duluan vs Dikirim Menyusul -->
              <div style="border-top: 1px dashed var(--border); padding-top: var(--sp-2);">
                <div class="row" style="justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                  <span class="form-label fw-bold text-xs" style="margin: 0;">Ceklist Barang Dikirim vs Dibawa:</span>
                  <div class="row" style="gap: 4px;">
                    <button type="button" class="btn btn-secondary btn-xs" id="btn-kirim-semua-item">Semua Dikirim</button>
                    <button type="button" class="btn btn-ghost btn-xs" id="btn-bawa-semua-item">Semua Dibawa</button>
                  </div>
                </div>
                <div id="list-ceklist-kirim-item" class="stack" style="gap: 6px; max-height: 210px; overflow-y: auto;"></div>
                <div id="ringkasan-ceklist-kirim" class="text-xs text-muted" style="margin-top: 6px;"></div>
              </div>
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
                <button type="button" class="btn btn-sm btn-secondary btn-tab-bayar ${saldoDeposit <= 0 ? 'disabled' : ''}" data-metode="deposit" ${saldoDeposit <= 0 ? 'disabled title="Pelanggan belum memiliki saldo titipan"' : ''}>
                  Saldo Titipan
                </button>
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
                  <button type="button" class="btn btn-ghost btn-sm btn-quick-cash" id="btn-quick-cash-pas" data-val="${grandTotal}">Uang Pas</button>
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

              <!-- Section Saldo Titipan / Deposit -->
              <div id="sec-deposit" style="display: none;">
                <div class="card" style="background: var(--surface-3); padding: var(--sp-3);">
                  <div class="stack" style="gap: 6px;">
                    <div class="row" style="justify-content: space-between;">
                      <span class="text-xs text-muted">Saldo Titipan Saat Ini:</span>
                      <span class="fw-bold mono text-success">${formatRupiah(saldoDeposit)}</span>
                    </div>
                    <div class="row" style="justify-content: space-between;">
                      <span class="text-xs text-muted">Dipotong untuk Nota Ini:</span>
                      <span class="fw-bold mono text-danger" id="dep-potong-label">-${formatRupiah(grandTotal)}</span>
                    </div>
                    <div class="divider" style="margin: 2px 0;"></div>
                    <div class="row" style="justify-content: space-between; align-items: baseline;">
                      <span class="text-sm fw-semibold">Sisa Saldo Setelah Bayar:</span>
                      <span class="fw-bold mono text-primary" id="dep-sisa-label" style="font-size: var(--fs-base);">${formatRupiah(Math.max(0, saldoDeposit - grandTotal))}</span>
                    </div>
                  </div>
                </div>
                <div class="text-xs text-muted" style="margin-top: 6px;">
                  Transaksi dihitung <b>Lunas</b>, sisa saldo titipan akan tercetak otomatis di struk pelanggan.
                </div>
              </div>

              <!-- Section Tempo -->
              <div id="sec-tempo" style="display: none;">
                <div class="alert alert-info text-xs" style="margin-bottom: var(--sp-2);">
                  ${ICONS.info}
                  <div>
                    <div>Jatuh tempo: <strong>${state.pelanggan?.tempo_hari || 30} Hari</strong> dari sekarang. Piutang akan dicatat atas nama <strong>${escapeHtml(state.pelanggan?.nama || '')}</strong>.</div>
                    <div style="margin-top: 4px;">Poin loyalitas transaksi tempo akan <strong>otomatis bertambah saat piutang dilunasi</strong>.</div>
                  </div>
                </div>
              </div>

              <!-- Section Kombinasi -->
              <div id="sec-kombinasi" style="display: none;">
                <div class="stack" style="gap: var(--sp-2);">
                  ${saldoDeposit > 0 ? `
                    <div class="row" style="gap: var(--sp-2); align-items: center;">
                      <span class="text-xs text-success fw-semibold" style="width: 70px;">Titipan:</span>
                      <input type="number" id="komb-deposit" class="input mono" value="0" min="0" max="${saldoDeposit}" style="flex: 1;" placeholder="Maks ${formatRupiah(saldoDeposit)}" />
                    </div>
                  ` : ''}
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
          <button type="button" class="btn btn-primary btn-lg" id="btn-proses-transaksi" style="font-weight: 600;">
            ${ICONS.check} Konfirmasi & Simpan Transaksi
          </button>
        </div>
      `
    });

    let activeMetode = 'tunai';
    const elTunaiSec = modal.el.querySelector('#sec-tunai');
    const elTrfSec = modal.el.querySelector('#sec-transfer-qris');
    const elDepositSec = modal.el.querySelector('#sec-deposit');
    const elTempoSec = modal.el.querySelector('#sec-tempo');
    const elKombSec = modal.el.querySelector('#sec-kombinasi');
    const inputTunai = modal.el.querySelector('#input-tunai-terima');
    const labelKembalian = modal.el.querySelector('#label-kembalian');
    const elDepPotong = modal.el.querySelector('#dep-potong-label');
    const elDepSisa = modal.el.querySelector('#dep-sisa-label');
    const boxKirim = modal.el.querySelector('#box-detail-kirim');
    const elPoinPreview = modal.el.querySelector('#checkout-poin-preview');
    const elGrandTotal = modal.el.querySelector('#checkout-grand-total');
    const elOngkirRincian = modal.el.querySelector('#checkout-ongkir-rincian');
    const inputOngkir = modal.el.querySelector('#checkout-ongkir');
    const btnQuickPas = modal.el.querySelector('#btn-quick-cash-pas');
    const elKombSisa = modal.el.querySelector('#komb-sisa-label');

    // Hitung pratinjau estimasi poin member (KHUSUS belanja barang, ongkir tidak mendapat poin)
    const hitungPengaliLokal = (levelNama) => {
      const k = String(levelNama || 'Reguler').trim().toLowerCase();
      const mapAlias = { perak: 'silver', silver: 'silver', emas: 'gold', gold: 'gold', platinum: 'platinum', reguler: 'reguler' };
      const target = mapAlias[k] || k;
      const daftar = Array.isArray(state.pengaturan?.level_member) ? state.pengaturan.level_member : [];
      for (const lvl of daftar) {
        const lk = String(lvl?.nama || '').trim().toLowerCase();
        if ((mapAlias[lk] || lk) === target) return Number(lvl.pengali) || 1;
      }
      return ({ reguler: 1, silver: 1.2, gold: 1.5, platinum: 2 })[target] || 1;
    };

    const perbaruiPreviewPoin = () => {
      if (!elPoinPreview || !isMember) return;
      const perRupiah = Number(state.pengaturan?.poin_per_rupiah) || 10000;
      const pengali = hitungPengaliLokal(state.pelanggan?.level);
      const calcPoin = (nominal) => (perRupiah > 0 && nominal > 0) ? Math.floor((nominal / perRupiah) * pengali) : 0;
      const ongkirAktif = getOngkirAktif();
      const catatanOngkir = ongkirAktif > 0 ? ' <span class="text-muted">(khusus belanja barang, ongkir tidak dihitung poin)</span>' : '';

      if (activeMetode === 'tempo') {
        const estLunas = calcPoin(totalBarangNet);
        elPoinPreview.innerHTML = estLunas > 0
          ? `Poin Tempo: <b>+${estLunas.toLocaleString('id-ID')} Poin</b> akan masuk otomatis saat piutang <b>Lunas</b>.${catatanOngkir}`
          : `Aturan poin: 1 poin tiap <b>${formatRupiah(perRupiah)}</b> belanja barang lunas.`;
        return;
      }

      if (activeMetode === 'kombinasi') {
        const nTempo = parseRupiah(modal.el.querySelector('#komb-tempo')?.value || 0);
        const lunasSekarang = Math.max(0, grandTotal - nTempo);
        const barangLunasSekarang = Math.min(totalBarangNet, lunasSekarang);
        const barangSisaTempo = Math.max(0, totalBarangNet - barangLunasSekarang);
        const pSekarang = calcPoin(barangLunasSekarang);
        const pNanti = calcPoin(barangSisaTempo);
        if (nTempo > 0) {
          elPoinPreview.innerHTML = `Estimasi Poin: <b>+${pSekarang.toLocaleString('id-ID')} Poin</b> langsung masuk (DP), dan <b>+${pNanti.toLocaleString('id-ID')} Poin</b> masuk saat piutang lunas.${catatanOngkir}`;
        } else {
          elPoinPreview.innerHTML = pSekarang > 0
            ? `Estimasi Poin Didapat: <b class="text-success">+${pSekarang.toLocaleString('id-ID')} Poin</b> (${pengali}x level ${escapeHtml(state.pelanggan?.level || 'Reguler')}).${catatanOngkir}`
            : `Belanja barang di bawah ${formatRupiah(perRupiah)} (belum mendapat poin).`;
        }
        return;
      }

      const est = calcPoin(totalBarangNet);
      elPoinPreview.innerHTML = est > 0
        ? `Estimasi Poin Didapat: <b class="text-success">+${est.toLocaleString('id-ID')} Poin</b> (${pengali}x level ${escapeHtml(state.pelanggan?.level || 'Reguler')}).${catatanOngkir}`
        : `Belanja barang di bawah ${formatRupiah(perRupiah)} (minimal ${formatRupiah(perRupiah)} untuk 1 poin).`;
    };

    const updateKembalian = () => {
      const uangMasuk = parseRupiah(inputTunai?.value || 0);
      const k = Math.max(0, uangMasuk - grandTotal);
      if (labelKembalian) labelKembalian.textContent = formatRupiah(k);
    };

    const updateKombSisa = () => {
      if (!elKombSisa) return;
      const nDep = parseRupiah(modal.el.querySelector('#komb-deposit')?.value || 0);
      const nTunai = parseRupiah(modal.el.querySelector('#komb-tunai')?.value || 0);
      const nTrf = parseRupiah(modal.el.querySelector('#komb-transfer')?.value || 0);
      const nTempo = parseRupiah(modal.el.querySelector('#komb-tempo')?.value || 0);
      const totBayar = nDep + nTunai + nTrf + nTempo;
      const sisa = Math.max(0, grandTotal - totBayar);
      elKombSisa.textContent = sisa > 0 ? `Sisa Kurang: ${formatRupiah(sisa)}` : `Terpenuhi (Kembalian: ${formatRupiah(Math.max(0, totBayar - grandTotal))})`;
    };

    const updateDepositPreview = () => {
      if (elDepPotong) elDepPotong.textContent = `-${formatRupiah(grandTotal)}`;
      if (elDepSisa) {
        const sisaDep = saldoDeposit - grandTotal;
        elDepSisa.textContent = sisaDep >= 0 ? formatRupiah(sisaDep) : `Kurang ${formatRupiah(Math.abs(sisaDep))}`;
        elDepSisa.className = `fw-bold mono ${sisaDep >= 0 ? 'text-primary' : 'text-danger'}`;
      }
    };

    const perbaruiTotalCheckout = (syncInputTunai = true) => {
      const oldGrand = grandTotal;
      const ongkirNow = getOngkirAktif();
      grandTotal = getGrandTotalAktif();
      if (elGrandTotal) elGrandTotal.textContent = formatRupiah(grandTotal);
      if (elOngkirRincian) {
        elOngkirRincian.style.display = ongkirNow > 0 ? 'block' : 'none';
        elOngkirRincian.innerHTML = `Belanja Barang: <b>${formatRupiah(totalBarangNet)}</b> + Ongkir: <b class="text-primary">${formatRupiah(ongkirNow)}</b>`;
      }
      if (btnQuickPas) btnQuickPas.setAttribute('data-val', String(grandTotal));
      if (inputTunai) {
        inputTunai.min = String(grandTotal);
        if (syncInputTunai && parseRupiah(inputTunai.value) === oldGrand) {
          inputTunai.value = String(grandTotal);
        }
      }
      updateKembalian();
      updateKombSisa();
      updateDepositPreview();
      perbaruiPreviewPoin();
    };

    perbaruiPreviewPoin();
    updateKombSisa();
    updateDepositPreview();

    const onKombInput = () => {
      updateKombSisa();
      perbaruiPreviewPoin();
    };
    modal.el.querySelector('#komb-deposit')?.addEventListener('input', onKombInput);
    modal.el.querySelector('#komb-tempo')?.addEventListener('input', onKombInput);
    modal.el.querySelector('#komb-tunai')?.addEventListener('input', onKombInput);
    modal.el.querySelector('#komb-transfer')?.addEventListener('input', onKombInput);

    // ---------- Ceklist Barang Dibawa Duluan vs Dikirim Menyusul ----------
    const elListCeklistKirim = modal.el.querySelector('#list-ceklist-kirim-item');
    const elRingkasanCeklistKirim = modal.el.querySelector('#ringkasan-ceklist-kirim');

    const inisialisasiStatusKirimItem = (mode) => {
      if (mode === 'dikirim') {
        const semuaMasihPenuh = state.keranjang.every((it) => it.qty_dibawa === undefined || Number(it.qty_dibawa) >= Number(it.qty));
        if (semuaMasihPenuh) {
          state.keranjang.forEach((it) => { it.qty_dibawa = 0; });
        }
      } else {
        state.keranjang.forEach((it) => { it.qty_dibawa = it.qty; });
      }
    };

    const perbaruiRingkasanCeklistKirim = () => {
      if (!elRingkasanCeklistKirim) return;
      let jmlKirim = 0;
      let jmlBawa = 0;
      let jmlParsial = 0;
      state.keranjang.forEach((it) => {
        const qty = Number(it.qty || 0);
        const dibawa = Math.min(qty, Math.max(0, Number(it.qty_dibawa !== undefined ? it.qty_dibawa : 0)));
        const kirim = Math.max(0, qty - dibawa);
        if (kirim > 0 && dibawa > 0) jmlParsial++;
        else if (kirim > 0) jmlKirim++;
        else jmlBawa++;
      });
      const totalDikirim = jmlKirim + jmlParsial;
      if (totalDikirim === 0) {
        elRingkasanCeklistKirim.innerHTML = `<span class="text-warning fw-semibold">Semua barang ditandai dibawa langsung oleh pembeli (0 item masuk Surat Jalan).</span>`;
      } else {
        const bagian = [];
        if (jmlBawa > 0) bagian.push(`<strong class="text-success">${jmlBawa} dibawa sekarang</strong>`);
        if (jmlKirim > 0) bagian.push(`<strong class="text-primary">${jmlKirim} dikirim menyusul</strong>`);
        if (jmlParsial > 0) bagian.push(`<strong class="text-warning">${jmlParsial} sebagian dibawa &amp; dikirim</strong>`);
        elRingkasanCeklistKirim.innerHTML = `Ringkasan: ${bagian.join(' • ')}`;
      }
    };

    const renderCeklistKirimItem = () => {
      if (!elListCeklistKirim) return;
      elListCeklistKirim.innerHTML = state.keranjang.map((it, idx) => {
        const qty = Number(it.qty || 0);
        const dibawa = Math.min(qty, Math.max(0, Number(it.qty_dibawa !== undefined ? it.qty_dibawa : 0)));
        const kirim = Math.round(Math.max(0, qty - dibawa) * 1000) / 1000;
        const dicentangKirim = kirim > 0;
        const badgeSt = kirim <= 0
          ? '<span class="badge badge-success text-xs">Dibawa</span>'
          : (dibawa > 0
            ? `<span class="badge badge-warning text-xs">Bawa ${formatQty(dibawa)} • Kirim ${formatQty(kirim)}</span>`
            : `<span class="badge badge-primary text-xs">Dikirim</span>`);

        return `
          <div style="background: var(--surface); border: 1px solid ${dicentangKirim ? 'var(--primary)' : 'var(--border)'}; border-radius: var(--radius-sm); padding: 7px 9px;">
            <div class="row" style="justify-content: space-between; align-items: center; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: pointer;">
                <input type="checkbox" class="chk-item-dikirim" data-idx="${idx}" ${dicentangKirim ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--primary); flex-shrink: 0;">
                <div style="min-width: 0;">
                  <div class="text-xs fw-semibold" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(it.nama)}</div>
                  <div class="text-xs text-muted">Total beli: <strong class="mono">${formatQty(qty)} ${escapeHtml(it.satuan || '')}</strong></div>
                </div>
              </label>
              <div style="flex-shrink: 0;">${badgeSt}</div>
            </div>
            ${qty > 1 ? `
              <div class="row" style="justify-content: flex-end; align-items: center; gap: 6px; margin-top: 5px; padding-top: 5px; border-top: 1px dashed var(--border);">
                <span class="text-xs text-muted">Qty Dikirim:</span>
                <input type="number" step="any" min="0" max="${qty}" class="input input-sm mono inp-qty-kirim-item" data-idx="${idx}" value="${kirim}" style="width: 72px; min-height: 28px; height: 28px; padding: 2px 6px; text-align: right;" />
                <span class="text-xs text-muted">/ ${formatQty(qty)} ${escapeHtml(it.satuan || '')}</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      elListCeklistKirim.querySelectorAll('.chk-item-dikirim').forEach((chk) => {
        chk.addEventListener('change', () => {
          const idx = Number(chk.getAttribute('data-idx'));
          const it = state.keranjang[idx];
          if (!it) return;
          it.qty_dibawa = chk.checked ? 0 : Number(it.qty || 0);
          renderCeklistKirimItem();
        });
      });

      elListCeklistKirim.querySelectorAll('.inp-qty-kirim-item').forEach((inp) => {
        inp.addEventListener('change', () => {
          const idx = Number(inp.getAttribute('data-idx'));
          const it = state.keranjang[idx];
          if (!it) return;
          const qty = Number(it.qty || 0);
          let qKirim = Number(inp.value);
          if (!isFinite(qKirim) || qKirim < 0) qKirim = 0;
          if (qKirim > qty) qKirim = qty;
          it.qty_dibawa = Math.round(Math.max(0, qty - qKirim) * 1000) / 1000;
          renderCeklistKirimItem();
        });
      });

      perbaruiRingkasanCeklistKirim();
    };

    modal.el.querySelector('#btn-kirim-semua-item')?.addEventListener('click', () => {
      state.keranjang.forEach((it) => { it.qty_dibawa = 0; });
      renderCeklistKirimItem();
    });
    modal.el.querySelector('#btn-bawa-semua-item')?.addEventListener('click', () => {
      state.keranjang.forEach((it) => { it.qty_dibawa = Number(it.qty || 0); });
      renderCeklistKirimItem();
    });

    if (state.pengiriman === 'dikirim') {
      inisialisasiStatusKirimItem('dikirim');
      renderCeklistKirimItem();
    }

    // Pengiriman toggle (Ambil di Toko otomatis nolkan ongkir & semua dibawa)
    modal.el.querySelectorAll('.btn-opt-kirim').forEach((b) => {
      b.addEventListener('click', () => {
        modal.el.querySelectorAll('.btn-opt-kirim').forEach((x) => x.className = 'btn btn-sm btn-secondary btn-opt-kirim');
        b.className = 'btn btn-sm btn-primary btn-opt-kirim';
        state.pengiriman = b.getAttribute('data-kirim');
        if (state.pengiriman === 'dikirim') {
          boxKirim.style.display = 'flex';
          inisialisasiStatusKirimItem('dikirim');
          renderCeklistKirimItem();
        } else {
          boxKirim.style.display = 'none';
          state.ongkir = 0;
          if (inputOngkir) inputOngkir.value = '0';
          inisialisasiStatusKirimItem('ambil');
        }
        perbaruiTotalCheckout(true);
      });
    });

    // Input manual ongkir + tombol preset cepat
    inputOngkir?.addEventListener('input', () => {
      state.ongkir = Math.max(0, parseRupiah(inputOngkir.value));
      perbaruiTotalCheckout(true);
    });

    modal.el.querySelectorAll('.btn-preset-ongkir').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = Math.max(0, Number(btn.getAttribute('data-val') || 0));
        state.ongkir = val;
        if (inputOngkir) inputOngkir.value = String(val);
        perbaruiTotalCheckout(true);
      });
    });

    inputTunai?.addEventListener('input', updateKembalian);

    // Tombol Cepat Uang Pas
    modal.el.querySelectorAll('.btn-quick-cash').forEach((b) => {
      b.addEventListener('click', () => {
        inputTunai.value = b.getAttribute('data-val');
        updateKembalian();
      });
    });

    // Tab Metode Bayar
    const aktifkanTabMetode = (targetMetode) => {
      activeMetode = targetMetode;
      modal.el.querySelectorAll('.btn-tab-bayar').forEach((x) => {
        const isTarget = x.getAttribute('data-metode') === targetMetode;
        x.className = `btn btn-sm ${isTarget ? 'btn-primary' : 'btn-secondary'} btn-tab-bayar` + (x.hasAttribute('disabled') ? ' disabled' : '');
      });
      elTunaiSec.style.display = activeMetode === 'tunai' ? 'block' : 'none';
      elTrfSec.style.display = (activeMetode === 'transfer' || activeMetode === 'qris') ? 'block' : 'none';
      if (elDepositSec) elDepositSec.style.display = activeMetode === 'deposit' ? 'block' : 'none';
      elTempoSec.style.display = activeMetode === 'tempo' ? 'block' : 'none';
      elKombSec.style.display = activeMetode === 'kombinasi' ? 'block' : 'none';
      updateDepositPreview();
      perbaruiPreviewPoin();
    };

    modal.el.querySelectorAll('.btn-tab-bayar').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        const m = btn.getAttribute('data-metode');
        if (m === 'deposit' && saldoDeposit > 0 && saldoDeposit < grandTotal) {
          // Saldo titipan tidak cukup untuk bayar penuh → otomatis alihkan ke Kombinasi terisi rapi
          const inpKombDep = modal.el.querySelector('#komb-deposit');
          const inpKombTunai = modal.el.querySelector('#komb-tunai');
          const sisaKurang = Math.max(0, grandTotal - saldoDeposit);
          if (inpKombDep) inpKombDep.value = String(saldoDeposit);
          if (inpKombTunai) inpKombTunai.value = String(sisaKurang);
          aktifkanTabMetode('kombinasi');
          updateKombSisa();
          showToast(`Saldo titipan ${formatRupiah(saldoDeposit)} dipasang otomatis. Silakan lunasi sisa ${formatRupiah(sisaKurang)}.`, 'info', 3500);
          return;
        }
        aktifkanTabMetode(m);
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
        } else if (activeMetode === 'deposit') {
          if (saldoDeposit < grandTotal) {
            showToast(`Saldo titipan (${formatRupiah(saldoDeposit)}) kurang dari total tagihan. Gunakan metode Kombinasi.`, 'warning', 3500);
            btnProses.disabled = false;
            btnProses.textContent = 'Konfirmasi & Simpan Transaksi';
            return;
          }
          daftarBayar.push({ metode: 'deposit', jumlah: grandTotal });
        } else if (activeMetode === 'tempo') {
          if (!isMember) {
            showToast('Tempo hanya diizinkan untuk Member terdaftar.', 'warning');
            btnProses.disabled = false;
            return;
          }
          daftarBayar.push({ metode: 'tempo', jumlah: grandTotal });
        } else if (activeMetode === 'kombinasi') {
          const nDep = parseRupiah(modal.el.querySelector('#komb-deposit')?.value || 0);
          const nTunai = parseRupiah(modal.el.querySelector('#komb-tunai').value);
          const nTrf = parseRupiah(modal.el.querySelector('#komb-transfer').value);
          const nTempo = parseRupiah(modal.el.querySelector('#komb-tempo').value);

          if (nDep > 0) {
            if (nDep > saldoDeposit) {
              showToast(`Pemakaian saldo titipan (${formatRupiah(nDep)}) melebihi saldo tersedia (${formatRupiah(saldoDeposit)}).`, 'warning');
              btnProses.disabled = false;
              btnProses.textContent = 'Konfirmasi & Simpan Transaksi';
              return;
            }
            daftarBayar.push({ metode: 'deposit', jumlah: nDep });
          }
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

          const totKomb = nDep + nTunai + nTrf + nTempo;
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
        const semuaSudahDibawa = payloadItems.every((it) => Number(it.qty_dibawa) >= Number(it.qty));

        const payload = {
          pelanggan_id: state.pelanggan ? state.pelanggan.id : '',
          pengiriman: state.pengiriman,
          alamat_kirim: alamatKirimVal,
          status_antar: state.pengiriman === 'dikirim' && semuaSudahDibawa ? 'selesai' : undefined,
          ongkir: getOngkirAktif(),
          catatan: catatanVal,
          items: payloadItems,
          diskon_tipe: state.diskonTransaksi.tipe,
          diskon_nilai: state.diskonTransaksi.nilai,
          pembayaran: daftarBayar
        };

        const res = await api.post('penjualan.create', payload);

        if (!res.ok) {
          const errObj = new Error(res.error || 'Gagal menyimpan transaksi.');
          errObj.code = res.code || 'SERVER';
          throw errObj;
        }

        // Transaksi Sukses!
        bunyikanBeep();
        haptic.success();
        modal.close();

        // Sinkronkan saldo poin, saldo titipan/deposit, total belanja & level member terbaru di layar POS dan cache daftar pelanggan
        const pelTerbaru = res.data?.pelanggan;
        if (pelTerbaru && pelTerbaru.id) {
          const totalTempoDipakai = daftarBayar.filter((b) => b.metode === 'tempo').reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
          const saldoDepBaru = pelTerbaru.saldo_deposit !== undefined ? Number(pelTerbaru.saldo_deposit) : undefined;
          if (state.pelanggan && state.pelanggan.id === pelTerbaru.id) {
            const sisaLimitLama = Number(state.pelanggan.sisa_limit ?? state.pelanggan.limit_kredit ?? 0);
            state.pelanggan = {
              ...state.pelanggan,
              poin: pelTerbaru.poin,
              total_belanja: pelTerbaru.total_belanja,
              level: pelTerbaru.level,
              ...(saldoDepBaru !== undefined ? { saldo_deposit: saldoDepBaru } : {}),
              sisa_limit: Math.max(0, sisaLimitLama - totalTempoDipakai)
            };
            perbaruiTampilanPelanggan();
          }
          if (Array.isArray(state.daftarPelanggan)) {
            const idxPel = state.daftarPelanggan.findIndex((p) => p.id === pelTerbaru.id);
            if (idxPel !== -1) {
              const sisaLama = Number(state.daftarPelanggan[idxPel].sisa_limit ?? state.daftarPelanggan[idxPel].limit_kredit ?? 0);
              state.daftarPelanggan[idxPel] = {
                ...state.daftarPelanggan[idxPel],
                poin: pelTerbaru.poin,
                total_belanja: pelTerbaru.total_belanja,
                level: pelTerbaru.level,
                ...(saldoDepBaru !== undefined ? { saldo_deposit: saldoDepBaru } : {}),
                sisa_limit: Math.max(0, sisaLama - totalTempoDipakai)
              };
            }
          }
        }
        const poinBaruDapat = Number(res.data?.penjualan?.poin_didapat || 0);
        if (poinBaruDapat > 0 && pelTerbaru) {
          showToast(`+${poinBaruDapat.toLocaleString('id-ID')} Poin ditambahkan ke ${pelTerbaru.nama} (Saldo: ${Number(pelTerbaru.poin || 0).toLocaleString('id-ID')} Poin)`, 'success', 3500);
        }

        // Jika transaksi ini berasal dari Penawaran Harga (RAB), tandai otomatis sudah dikonversi
        if (state.penawaranAktifId) {
          const rabIdKonversi = state.penawaranAktifId;
          state.penawaranAktifId = '';
          apiCall('penawaran.konversi', {
            id: rabIdKonversi,
            penjualan_id: res.data?.penjualan?.id || '',
            no_nota: res.data?.penjualan?.no_nota || ''
          }).catch(() => { });
        }

        // Tampilkan modal struk sukses
        bukaModalStrukSukses(res.data);

        // Reset keranjang & opsi pengiriman
        state.keranjang = [];
        state.diskonTransaksi = { tipe: '', nilai: 0 };
        state.pengiriman = 'ambil';
        state.alamatKirim = '';
        state.ongkir = 0;
        state.catatan = '';
        renderKeranjang();
        if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('catalog');

        // Refresh katalog produk untuk update stok lokal
        muatDataKatalog();
      } catch (err) {
        console.error('Error simpan penjualan:', err);
        haptic.warning();

        // Mode Offline Antrean Transaksi: jika internet mati / timeout, tawarkan simpan ke antrean lokal
        if (adalahErrorJaringanOffline(err)) {
          const simpanOffline = await showConfirm({
            title: 'Koneksi Terputus — Simpan ke Antrean Offline?',
            message: `Transaksi senilai ${formatRupiah(grandTotal)} tidak dapat mencapai server saat ini. Simpan ke Antrean Offline perangkat ini? Struk sementara (OFF-...) tetap bisa dicetak sekarang dan otomatis tersinkron ke server saat internet kembali menyala.`,
            confirmText: 'Simpan Offline & Cetak Struk',
            cancelText: 'Coba Lagi Nanti'
          });

          if (simpanOffline) {
            const payloadItemsOff = state.keranjang.map((it) => ({
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
            const daftarBayarOff = [];
            if (activeMetode === 'tunai') {
              daftarBayarOff.push({ metode: 'tunai', jumlah: parseRupiah(inputTunai.value) || grandTotal });
            } else if (activeMetode === 'qris' || activeMetode === 'transfer') {
              daftarBayarOff.push({ metode: activeMetode, jumlah: grandTotal, referensi: modal.el.querySelector('#input-ref-bayar')?.value.trim() || '' });
            } else if (activeMetode === 'deposit') {
              daftarBayarOff.push({ metode: 'deposit', jumlah: grandTotal });
            } else if (activeMetode === 'tempo') {
              daftarBayarOff.push({ metode: 'tempo', jumlah: grandTotal });
            } else if (activeMetode === 'kombinasi') {
              const nDep = parseRupiah(modal.el.querySelector('#komb-deposit')?.value || 0);
              const nTunai = parseRupiah(modal.el.querySelector('#komb-tunai')?.value || 0);
              const nTrf = parseRupiah(modal.el.querySelector('#komb-transfer')?.value || 0);
              const nTempo = parseRupiah(modal.el.querySelector('#komb-tempo')?.value || 0);
              if (nDep > 0) daftarBayarOff.push({ metode: 'deposit', jumlah: nDep });
              if (nTunai > 0) daftarBayarOff.push({ metode: 'tunai', jumlah: nTunai });
              if (nTrf > 0) daftarBayarOff.push({ metode: 'transfer', jumlah: nTrf });
              if (nTempo > 0) daftarBayarOff.push({ metode: 'tempo', jumlah: nTempo });
            }
            const semuaDibawaOff = payloadItemsOff.every((it) => Number(it.qty_dibawa) >= Number(it.qty));
            const payloadOff = {
              pelanggan_id: state.pelanggan ? state.pelanggan.id : '',
              pengiriman: state.pengiriman,
              alamat_kirim: modal.el.querySelector('#checkout-alamat')?.value.trim() || '',
              status_antar: state.pengiriman === 'dikirim' && semuaDibawaOff ? 'selesai' : undefined,
              ongkir: getOngkirAktif(),
              catatan: modal.el.querySelector('#checkout-catatan')?.value.trim() || '',
              items: payloadItemsOff,
              diskon_tipe: state.diskonTransaksi.tipe,
              diskon_nilai: state.diskonTransaksi.nilai,
              pembayaran: daftarBayarOff
            };

            const entryOff = tambahKeAntreanOffline(payloadOff, {
              pelangganNama: state.pelanggan ? state.pelanggan.nama : 'Pelanggan Umum',
              grandTotal,
              subtotal: totals.subtotal,
              diskonTransaksi: totals.diskonTransaksiNominal,
              pajak: totals.pajak,
              pembulatan: totals.pembulatan,
              itemsDetail: state.keranjang.slice()
            });

            bunyikanBeep();
            haptic.success();
            modal.close();
            showToast(`Disimpan di Antrean Offline (${entryOff.noNotaSementara}). Akan otomatis terkirim saat online.`, 'warning', 4500);
            bukaModalStrukSukses(entryOff.dataStrukOffline);

            state.keranjang = [];
            state.diskonTransaksi = { tipe: '', nilai: 0 };
            state.pengiriman = 'ambil';
            state.alamatKirim = '';
            state.ongkir = 0;
            state.catatan = '';
            renderKeranjang();
            if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('catalog');
            return;
          }
        }

        showToast(err.message, 'error', 4500);
        btnProses.disabled = false;
        btnProses.textContent = 'Konfirmasi & Simpan Transaksi';
      }
    });
  }

  // ---------- Modal Struk Sukses & Cetak ----------
  function bukaModalStrukSukses(dataStruk) {
    store.set('pos_terakhir', dataStruk);
    try {
      localStorage.setItem('pos_last_receipt', JSON.stringify(dataStruk));
    } catch (e) { }

    bukaModalPilihanCetakPenjualan(dataStruk, {
      isNewTransaction: true,
      onNewTransaction: () => {
        elSearch?.focus();
      }
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
        alamat_kirim: state.alamatKirim || '',
        ongkir: state.pengiriman === 'dikirim' ? (Number(state.ongkir) || 0) : 0,
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

  // ---------- Manajemen Buka & Tutup Shift Kasir (X-Report & Z-Report + Hitung Fisik Laci) ----------
  const perbaruiIndikatorShift = (shiftObj) => {
    state.shiftAktif = shiftObj || null;
    const btnShift = container.querySelector('#btn-pos-shift');
    const dotAktif = container.querySelector('#dot-pos-shift-aktif');
    if (dotAktif) {
      dotAktif.style.display = state.shiftAktif ? 'inline-block' : 'none';
    }
    if (btnShift) {
      if (state.shiftAktif) {
        btnShift.style.borderColor = 'var(--success)';
        btnShift.title = `Shift Aktif: ${state.shiftAktif.no_shift} | Modal Awal: ${formatRupiah(state.shiftAktif.modal_awal || 0)} (F3)`;
      } else {
        btnShift.style.borderColor = '';
        btnShift.title = 'Belum Buka Shift — Klik untuk Buka Shift Kasir (F3)';
      }
    }
  };

  async function muatStatusShiftAktif() {
    try {
      const res = await apiCall('shift.aktif', {});
      perbaruiIndikatorShift(res && res.shift ? res.shift : null);
    } catch (_) {
      // Abaikan diam-diam bila offline/gagal koneksi awal
    }
  }

  async function bukaModalShiftKasir(modeAwal = 'utama') {
    const user = store.get('user') || state.user || {};
    const nowDt = new Date();
    const todayStr = `${nowDt.getFullYear()}-${String(nowDt.getMonth() + 1).padStart(2, '0')}-${String(nowDt.getDate()).padStart(2, '0')}`;

    const modal = showModal({
      title: 'Manajemen Shift Kasir (Buka / Tutup Laci)',
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-3);" id="shift-kasir-container">
          <div class="text-center" style="padding: var(--sp-6);">
            <div class="spinner spinner-primary" style="margin: 0 auto var(--sp-2);"></div>
            <div class="text-muted text-sm">Memeriksa status shift kasir & menghitung kas laci...</div>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; align-items: center; gap: var(--sp-2);" id="shift-modal-footer">
          <div class="row" style="width: 100%; gap: var(--sp-2);" id="shift-footer-actions"></div>
        </div>
      `
    });

    const elContainer = modal.el.querySelector('#shift-kasir-container');
    const elFooterActions = modal.el.querySelector('#shift-footer-actions');

    let shiftAktif = null;
    let ringkasanAktif = null;
    let tabAktif = modeAwal; // 'utama' | 'tutup' | 'riwayat' | 'harian'
    let riwayatShift = null;

    const muatDataShift = async (skipCache = false) => {
      try {
        const res = await apiCall('shift.aktif', {}, { skipCache });
        shiftAktif = res && res.shift ? res.shift : null;
        ringkasanAktif = res && res.ringkasan ? res.ringkasan : null;
        perbaruiIndikatorShift(shiftAktif);
      } catch (err) {
        shiftAktif = null;
        ringkasanAktif = null;
        showToast('Gagal memuat status shift: ' + (err.message || err), 'warning');
      }
    };

    const buatBlokRincianKas = (rd) => {
      const totalBiayaKasir = Number(rd.total_biaya_kasir || 0);
      const totalPiutangTunai = Number(rd.total_piutang_tunai || 0);
      const totalDepositTunai = Number(rd.total_deposit_tunai || 0);
      const totalTarikDepositTunai = Number(rd.total_tarik_deposit_tunai || 0);
      const totalDepositPakai = Number(rd.total_deposit_pakai || 0);
      const totalRefundTunai = Number(rd.total_refund_tunai || 0);
      const totalLaci = Number(rd.kas_sistem !== undefined ? rd.kas_sistem : (rd.total_laci || 0));
      const modalVal = Number(rd.modal_awal || 0);
      const tunai = Number(rd.total_tunai || 0);

      const bagian = [`Modal: ${formatRupiah(modalVal)}`, `+ Tunai: ${formatRupiah(tunai)}`];
      if (totalPiutangTunai > 0) bagian.push(`+ Piutang Tunai: ${formatRupiah(totalPiutangTunai)}`);
      if (totalDepositTunai > 0) bagian.push(`+ Titipan Tunai: ${formatRupiah(totalDepositTunai)}`);
      if (totalTarikDepositTunai > 0) bagian.push(`- Tarik Titipan: ${formatRupiah(totalTarikDepositTunai)}`);
      if (totalBiayaKasir > 0) bagian.push(`- Kas Keluar: ${formatRupiah(totalBiayaKasir)}`);
      if (totalRefundTunai > 0) bagian.push(`- Refund Retur: ${formatRupiah(totalRefundTunai)}`);

      return `
        <div style="background: var(--primary-soft); border: 1px solid var(--primary); border-radius: var(--radius-md); padding: var(--sp-3); text-align: center;">
          <div class="text-xs fw-semibold" style="color: var(--primary-soft-text); text-transform: uppercase; letter-spacing: 0.4px;">
            Ekspektasi Uang Fisik di Laci (Sistem)
          </div>
          <div class="fw-bold mono" style="font-size: var(--fs-xl); color: var(--primary); margin: 4px 0;">
            ${formatRupiah(totalLaci)}
          </div>
          <div class="text-xs text-muted">(${bagian.join(' ')})</div>
        </div>

        <div class="detail-kv-card">
          <div class="detail-kv-row">
            <span class="text-muted">Modal Awal Laci (Float)</span>
            <span class="fw-bold mono">${formatRupiah(modalVal)}</span>
          </div>
          <div class="detail-kv-row">
            <span class="text-muted">Total Transaksi (Nota)</span>
            <span class="fw-bold">${rd.total_transaksi || 0} Penjualan</span>
          </div>
          <div class="detail-kv-row">
            <span class="text-muted">Penerimaan Tunai</span>
            <span class="fw-bold mono text-success">${formatRupiah(tunai)}</span>
          </div>
          ${totalPiutangTunai > 0 ? `
            <div class="detail-kv-row">
              <span class="text-success fw-semibold">(+) Pelunasan Piutang Tunai</span>
              <span class="fw-bold mono text-success">+${formatRupiah(totalPiutangTunai)}</span>
            </div>
          ` : ''}
          ${totalDepositTunai > 0 ? `
            <div class="detail-kv-row">
              <span class="text-success fw-semibold">(+) Terima Titipan Tunai</span>
              <span class="fw-bold mono text-success">+${formatRupiah(totalDepositTunai)}</span>
            </div>
          ` : ''}
          <div class="detail-kv-row">
            <span class="text-muted">Non-Tunai (Transfer / QRIS)</span>
            <span class="fw-bold mono text-info">${formatRupiah(rd.total_transfer || 0)}</span>
          </div>
          ${totalDepositPakai > 0 ? `
            <div class="detail-kv-row">
              <span class="text-muted">Pemakaian Saldo Titipan</span>
              <span class="fw-bold mono">${formatRupiah(totalDepositPakai)}</span>
            </div>
          ` : ''}
          ${Number(rd.total_tempo || 0) > 0 ? `
            <div class="detail-kv-row">
              <span class="text-muted">Piutang Pelanggan (Tempo)</span>
              <span class="fw-bold mono text-warning">${formatRupiah(rd.total_tempo || 0)}</span>
            </div>
          ` : ''}
          ${totalTarikDepositTunai > 0 ? `
            <div class="detail-kv-row">
              <span class="text-danger fw-semibold">(-) Pengembalian Titipan</span>
              <span class="fw-bold mono text-danger">-${formatRupiah(totalTarikDepositTunai)}</span>
            </div>
          ` : ''}
          ${totalRefundTunai > 0 ? `
            <div class="detail-kv-row">
              <span class="text-danger fw-semibold">(-) Refund Retur Tunai</span>
              <span class="fw-bold mono text-danger">-${formatRupiah(totalRefundTunai)}</span>
            </div>
          ` : ''}
          ${totalBiayaKasir > 0 ? `
            <div class="detail-kv-row">
              <span class="text-danger fw-semibold">(-) Kas Keluar Kasir</span>
              <span class="fw-bold mono text-danger">-${formatRupiah(totalBiayaKasir)}</span>
            </div>
            ${Array.isArray(rd.rincian_biaya_kasir) && rd.rincian_biaya_kasir.length > 0 ? `
              <div style="background: var(--danger-soft); border: 1px solid var(--border); border-left: 3px solid var(--danger); border-radius: var(--radius-sm); padding: 6px 10px; font-size: var(--fs-xs); margin: 4px 0;">
                ${rd.rincian_biaya_kasir.map((rb) => `
                  <div class="row" style="justify-content: space-between; padding: 2px 0;">
                    <span class="text-muted">${escapeHtml(rb.kategori)}${rb.keterangan ? ` (${escapeHtml(rb.keterangan)})` : ''}</span>
                    <span class="mono fw-semibold text-danger">-${formatRupiah(rb.nominal)}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          ` : ''}
          <div class="detail-kv-row" style="font-weight: bold; font-size: var(--fs-base); padding-top: 9px;">
            <span>Total Omset Penjualan</span>
            <span class="mono" style="color: var(--primary);">${formatRupiah(rd.total_penjualan || 0)}</span>
          </div>
        </div>
      `;
    };

    const renderNavTab = () => {
      if (shiftAktif) {
        return `
          <div class="segmented segmented-equal">
            <button type="button" class="btn btn-sm ${tabAktif === 'utama' ? 'btn-primary' : 'btn-ghost'}" data-shift-tab="utama">
              ${ICONS.chart}
              <span>X-Report</span>
            </button>
            <button type="button" class="btn btn-sm ${tabAktif === 'tutup' ? 'btn-primary' : 'btn-ghost'}" data-shift-tab="tutup">
              ${ICONS.checkCircle}
              <span>Tutup (Z)</span>
            </button>
            <button type="button" class="btn btn-sm ${tabAktif === 'riwayat' ? 'btn-primary' : 'btn-ghost'}" data-shift-tab="riwayat">
              ${ICONS.clipboard}
              <span>Riwayat</span>
            </button>
          </div>
        `;
      }
      return `
        <div class="segmented segmented-equal">
          <button type="button" class="btn btn-sm ${tabAktif === 'utama' ? 'btn-primary' : 'btn-ghost'}" data-shift-tab="utama">
            ${ICONS.wallet}
            <span>Buka Shift</span>
          </button>
          <button type="button" class="btn btn-sm ${tabAktif === 'harian' ? 'btn-primary' : 'btn-ghost'}" data-shift-tab="harian">
            ${ICONS.chart}
            <span>Harian</span>
          </button>
          <button type="button" class="btn btn-sm ${tabAktif === 'riwayat' ? 'btn-primary' : 'btn-ghost'}" data-shift-tab="riwayat">
            ${ICONS.clipboard}
            <span>Riwayat</span>
          </button>
        </div>
      `;
    };

    const pasangEventNavTab = () => {
      elContainer.querySelectorAll('[data-shift-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          tabAktif = btn.getAttribute('data-shift-tab');
          renderTampilanShift();
        });
      });
    };

    const renderTampilanShift = async () => {
      elFooterActions.innerHTML = '';

      // TAB RIWAYAT SHIFT KASIR
      if (tabAktif === 'riwayat') {
        elContainer.innerHTML = `
          ${renderNavTab()}
          <div class="text-center" style="padding: var(--sp-5);">
            <div class="spinner spinner-primary" style="margin: 0 auto var(--sp-2);"></div>
            <div class="text-muted text-sm">Memuat riwayat shift terakhir...</div>
          </div>
        `;
        pasangEventNavTab();
        try {
          const res = await apiCall('shift.list', { limit: 10 });
          riwayatShift = (res && Array.isArray(res.items)) ? res.items : [];
        } catch (err) {
          riwayatShift = [];
        }

        elContainer.innerHTML = `
          ${renderNavTab()}
          ${riwayatShift.length === 0 ? `
            <div class="empty-state" style="padding: var(--sp-5);">
              ${ICONS.clipboard}
              <p class="text-muted text-sm">Belum ada riwayat buka/tutup shift tersimpan.</p>
            </div>
          ` : `
            <div class="stack" style="gap: var(--sp-2); max-height: 360px; overflow-y: auto;">
              ${riwayatShift.map((sh) => {
          const isAktif = sh.status === 'aktif';
          const sel = Number(sh.selisih || 0);
          const badgeSelisih = isAktif
            ? `<span class="badge badge-info">Aktif</span>`
            : (sel === 0
              ? `<span class="badge badge-success">PAS Rp 0</span>`
              : (sel > 0
                ? `<span class="badge badge-info">Lebih +${formatRupiah(sel)}</span>`
                : `<span class="badge badge-danger">Kurang -${formatRupiah(Math.abs(sel))}</span>`));
          return `
                  <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3);">
                    <div class="row" style="justify-content: space-between; align-items: center; gap: var(--sp-2); margin-bottom: 4px;">
                      <div class="fw-bold mono text-sm">${escapeHtml(sh.no_shift)}</div>
                      ${badgeSelisih}
                    </div>
                    <div class="text-xs text-muted" style="margin-bottom: 6px;">
                      ${escapeHtml(sh.kasir_nama || '-')} • Buka: ${escapeHtml(formatTanggal(sh.waktu_buka, true))}${sh.waktu_tutup ? ` • Tutup: ${escapeHtml(formatTanggal(sh.waktu_tutup, true))}` : ''}
                    </div>
                    <div class="row" style="justify-content: space-between; align-items: center; font-size: var(--fs-xs);">
                      <span>Modal: <strong class="mono">${formatRupiah(sh.modal_awal || 0)}</strong> | Omset: <strong class="mono">${formatRupiah(sh.total_penjualan || 0)}</strong></span>
                      <button type="button" class="btn btn-secondary btn-xs btn-cetak-riwayat-shift" data-id="${escapeHtml(sh.id)}" style="display: inline-flex; align-items: center; gap: 4px;">
                        ${ICONS.printer}
                        <span>${isAktif ? 'X-Report' : 'Z-Report'}</span>
                      </button>
                    </div>
                  </div>
                `;
        }).join('')}
            </div>
          `}
        `;
        pasangEventNavTab();
        elContainer.querySelectorAll('.btn-cetak-riwayat-shift').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const target = riwayatShift.find((x) => x.id === id);
            if (target) {
              bukaModalPilihanCetakShift({
                ...target,
                kasir: { id: target.kasir_id, nama: target.kasir_nama },
                tipe_laporan: target.status === 'ditutup' ? 'Z-REPORT' : 'X-REPORT'
              });
            }
          });
        });
        return;
      }

      // TAB REKAP HARIAN TANPA SHIFT (Fallback bila kasir belum buka shift)
      if (!shiftAktif && tabAktif === 'harian') {
        elContainer.innerHTML = `
          ${renderNavTab()}
          <div class="text-center" style="padding: var(--sp-5);">
            <div class="spinner spinner-primary" style="margin: 0 auto var(--sp-2);"></div>
            <div class="text-muted text-sm">Menghitung rekap transaksi hari ini...</div>
          </div>
        `;
        pasangEventNavTab();
        let dataHarian = null;
        try {
          const res = await apiCall('penjualan.shiftKasir', {
            kasir_id: user.id,
            tanggal: todayStr,
            abaikan_shift_aktif: true
          });
          dataHarian = res && res.data ? res.data : res;
        } catch (_) {
          dataHarian = { tanggal: todayStr, kasir: { nama: user.nama || 'Kasir' }, modal_awal: 0, total_laci: 0 };
        }
        elContainer.innerHTML = `
          ${renderNavTab()}
          <div class="alert alert-info" style="font-size: var(--fs-xs); margin: 0; padding: 8px 12px;">
            ${ICONS.info}
            <span>Menampilkan rekap harian <strong>${escapeHtml(todayStr)}</strong> untuk kasir <strong>${escapeHtml(user.nama || user.username || 'Kasir')}</strong>. Buka Shift untuk mencatat modal awal & rekonsiliasi laci.</span>
          </div>
          ${buatBlokRincianKas(dataHarian)}
        `;
        pasangEventNavTab();
        elFooterActions.innerHTML = `
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cetak-xreport-harian" style="flex: 1; justify-content: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak X-Report</span>
          </button>
        `;
        elFooterActions.querySelector('#btn-cetak-xreport-harian')?.addEventListener('click', () => {
          bukaModalPilihanCetakShift(dataHarian);
        });
        return;
      }

      // KONDISI A: BELUM ADA SHIFT AKTIF → FORM BUKA SHIFT
      if (!shiftAktif) {
        let modalInputVal = 0;
        elContainer.innerHTML = `
          ${renderNavTab()}
          <div style="background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
            <div class="row" style="justify-content: space-between; align-items: center;">
              <div>
                <div class="text-xs text-muted">Kasir Bertugas</div>
                <div class="fw-bold" style="color: var(--text);">${escapeHtml(user.nama || user.username || 'Kasir')}</div>
              </div>
              <span class="badge badge-warning">Belum Buka Shift</span>
            </div>
          </div>

          <div class="alert alert-info" style="font-size: var(--fs-xs); margin: 0; padding: 10px 12px;">
            ${ICONS.info}
            <div>Hitung uang pecahan kembalian (modal awal / float) di laci kasir lalu klik <strong>Buka Shift Kasir</strong>. Seluruh transaksi tunai, piutang, titipan, dan kas keluar selama shift akan direkap otomatis hingga tutup toko.</div>
          </div>

          <div class="stack" style="gap: var(--sp-2);">
            <label class="form-label fw-bold text-xs" for="inp-buka-modal-awal" style="margin: 0;">Modal Awal Laci / Float Kasir (Rp)</label>
            <input type="text" inputmode="numeric" id="inp-buka-modal-awal" class="input fw-bold mono" value="0" placeholder="Rp 0" autocomplete="off" />
            <div class="row" style="gap: 6px; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-xs btn-preset-buka" data-val="100000">+100rb</button>
              <button type="button" class="btn btn-secondary btn-xs btn-preset-buka" data-val="200000">+200rb</button>
              <button type="button" class="btn btn-secondary btn-xs btn-preset-buka" data-val="500000">+500rb</button>
              <button type="button" class="btn btn-secondary btn-xs btn-preset-buka" data-val="1000000">+1 Juta</button>
              <button type="button" class="btn btn-ghost btn-xs text-muted" id="btn-reset-buka-modal">Reset 0</button>
            </div>
          </div>

          <div class="stack" style="gap: 4px;">
            <label class="form-label text-xs fw-semibold" for="inp-buka-catatan" style="margin: 0;">Catatan Buka Shift (Opsional)</label>
            <input type="text" id="inp-buka-catatan" class="input" maxlength="200" placeholder="Contoh: Shift Pagi, uang pecahan kecil Rp 2.000 & Rp 5.000 lengkap" />
          </div>
        `;
        pasangEventNavTab();

        elFooterActions.innerHTML = `
          <button type="button" class="btn btn-primary btn-sm" id="btn-aksi-buka-shift" style="flex: 1; justify-content: center; gap: 6px;">
            ${ICONS.checkCircle}
            <span>Buka Shift Kasir</span>
          </button>
        `;

        const inpModal = elContainer.querySelector('#inp-buka-modal-awal');
        const setModalVal = (val) => {
          modalInputVal = Math.max(0, Math.round(Number(val) || 0));
          if (inpModal) inpModal.value = modalInputVal > 0 ? formatRupiah(modalInputVal).replace('Rp ', '') : '0';
        };
        inpModal?.addEventListener('input', () => {
          modalInputVal = Math.max(0, parseRupiah(inpModal.value));
          inpModal.value = modalInputVal > 0 ? formatRupiah(modalInputVal).replace('Rp ', '') : '';
        });
        elContainer.querySelectorAll('.btn-preset-buka').forEach((b) => {
          b.addEventListener('click', () => setModalVal(modalInputVal + Number(b.getAttribute('data-val') || 0)));
        });
        elContainer.querySelector('#btn-reset-buka-modal')?.addEventListener('click', () => setModalVal(0));

        const btnBuka = elFooterActions.querySelector('#btn-aksi-buka-shift');
        btnBuka?.addEventListener('click', async () => {
          const catatan = (elContainer.querySelector('#inp-buka-catatan')?.value || '').trim();
          btnBuka.disabled = true;
          btnBuka.innerHTML = '<span>Membuka Shift...</span>';
          try {
            const res = await apiCall('shift.buka', {
              modal_awal: modalInputVal,
              catatan
            });
            shiftAktif = res.shift;
            ringkasanAktif = res.ringkasan;
            perbaruiIndikatorShift(shiftAktif);
            haptic.success();
            showToast(res.pesan || 'Shift kasir berhasil dibuka!', 'success');
            tabAktif = 'utama';
            renderTampilanShift();
          } catch (err) {
            showToast(err.message || 'Gagal membuka shift kasir', 'error');
            btnBuka.disabled = false;
            btnBuka.innerHTML = `${ICONS.checkCircle}<span>Buka Shift Kasir</span>`;
          }
        });
        return;
      }

      // KONDISI B1: SHIFT AKTIF → TAB REKAP BERJALAN (X-REPORT)
      if (tabAktif === 'utama') {
        const rd = ringkasanAktif || { modal_awal: shiftAktif.modal_awal || 0, kas_sistem: shiftAktif.modal_awal || 0 };
        elContainer.innerHTML = `
          ${renderNavTab()}
          <div style="background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
            <div class="row" style="justify-content: space-between; align-items: center; gap: var(--sp-2);">
              <div>
                <div class="row" style="align-items: center; gap: 6px;">
                  <span class="badge badge-success">Shift Aktif</span>
                  <span class="fw-bold mono text-sm">${escapeHtml(shiftAktif.no_shift)}</span>
                </div>
                <div class="text-xs text-muted" style="margin-top: 4px;">
                  ${escapeHtml(shiftAktif.kasir_nama || user.nama || 'Kasir')} • Dibuka: ${escapeHtml(formatTanggal(shiftAktif.waktu_buka, true))}
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-xs text-danger" id="btn-tambah-kas-keluar-shift" style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                ${ICONS.plus}
                <span>Kas Keluar</span>
              </button>
            </div>
          </div>

          ${buatBlokRincianKas(rd)}
        `;
        pasangEventNavTab();

        elContainer.querySelector('#btn-tambah-kas-keluar-shift')?.addEventListener('click', () => {
          bukaModalKasKeluarKasir(async () => {
            await muatDataShift(true);
            renderTampilanShift();
          });
        });

        elFooterActions.innerHTML = `
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cetak-xreport" style="flex: 1; justify-content: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak X-Report</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-ke-tutup-shift" style="flex: 1; justify-content: center; gap: 6px;">
            ${ICONS.checkCircle}
            <span>Tutup Shift</span>
          </button>
        `;
        elFooterActions.querySelector('#btn-cetak-xreport')?.addEventListener('click', () => {
          bukaModalPilihanCetakShift(rd);
        });
        elFooterActions.querySelector('#btn-ke-tutup-shift')?.addEventListener('click', () => {
          tabAktif = 'tutup';
          renderTampilanShift();
        });
        return;
      }

      // KONDISI B2: SHIFT AKTIF → TAB TUTUP SHIFT & HITUNG FISIK LACI (Z-REPORT)
      const rd = ringkasanAktif || { modal_awal: shiftAktif.modal_awal || 0, kas_sistem: shiftAktif.modal_awal || 0 };
      const kasSistem = Math.round(Number(rd.kas_sistem !== undefined ? rd.kas_sistem : (rd.total_laci || 0)));
      const daftarPecahan = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];
      let kasFisikVal = 0;
      let sudahInputFisik = false;

      elContainer.innerHTML = `
        ${renderNavTab()}
        <div style="background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
          <div class="row" style="justify-content: space-between; align-items: center;">
            <div>
              <div class="text-xs text-muted">Menutup Shift Kasir</div>
              <div class="fw-bold mono text-sm">${escapeHtml(shiftAktif.no_shift)} • ${escapeHtml(shiftAktif.kasir_nama || user.nama || 'Kasir')}</div>
            </div>
            <div class="text-right">
              <div class="text-xs text-muted">Kas Sistem</div>
              <div class="fw-bold mono" style="color: var(--primary);">${formatRupiah(kasSistem)}</div>
            </div>
          </div>
        </div>

        <div class="stack" style="gap: var(--sp-2);">
          <div class="row" style="justify-content: space-between; align-items: center;">
            <label class="form-label required fw-bold text-xs" for="inp-tutup-kas-fisik" style="margin: 0;">Total Uang Fisik di Laci (Rp)</label>
            <button type="button" class="btn btn-ghost btn-xs" id="btn-toggle-pecahan" style="color: var(--primary); display: inline-flex; align-items: center; gap: 4px;">
              ${ICONS.calculator}
              <span>Hitung Pecahan</span>
            </button>
          </div>
          <input type="text" inputmode="numeric" id="inp-tutup-kas-fisik" class="input fw-bold mono" placeholder="Masukkan total uang fisik yang dihitung..." autocomplete="off" style="font-size: var(--fs-md);" />
          <div class="row" style="gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-xs" id="btn-isi-sama-sistem">Sama Dengan Sistem (${formatRupiah(kasSistem)})</button>
          </div>
        </div>

        <!-- Kalkulator Pecahan Uang (Collapsible) -->
        <div id="box-kalkulator-pecahan" style="display: none; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3);">
          <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: var(--sp-2);">
            <span class="text-xs fw-bold">Hitung Lembar / Koin di Laci</span>
            <button type="button" class="btn btn-ghost btn-xs text-muted" id="btn-reset-pecahan">Reset</button>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
            ${daftarPecahan.map((nom) => `
              <div class="row" style="align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px;">
                <span class="text-xs mono fw-semibold" style="min-width: 66px;">${formatRupiah(nom)}</span>
                <span class="text-xs text-muted">x</span>
                <input type="number" min="0" step="1" class="input input-sm inp-pecahan-qty mono" data-nominal="${nom}" placeholder="0" style="width: 100%; min-height: 28px; height: 28px; padding: 2px 6px; text-align: right;" />
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Panel Live Perbandingan Selisih -->
        <div id="box-status-selisih" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3);">
          <div class="row" style="justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 4px;">
            <span class="text-muted">Kas Menurut Sistem:</span>
            <span class="fw-bold mono">${formatRupiah(kasSistem)}</span>
          </div>
          <div class="row" style="justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 6px;">
            <span class="text-muted">Uang Fisik Dihitung:</span>
            <span class="fw-bold mono" id="disp-kas-fisik">-</span>
          </div>
          <div class="row" style="justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px dashed var(--border);">
            <span class="fw-bold text-sm">Selisih Kas Laci:</span>
            <span class="badge badge-secondary mono fw-bold" id="badge-selisih-live">Belum diisi</span>
          </div>
        </div>

        <div class="stack" style="gap: 4px;">
          <label class="form-label text-xs fw-semibold" for="inp-tutup-catatan" id="label-catatan-tutup" style="margin: 0;">Catatan Tutup Shift (Opsional bila pas, wajib bila ada selisih)</label>
          <textarea id="inp-tutup-catatan" class="input" rows="2" maxlength="400" placeholder="Contoh: Setoran tunai diserahkan ke Owner / alasan selisih jika ada..."></textarea>
        </div>
      `;
      pasangEventNavTab();

      elFooterActions.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" id="btn-konfirmasi-tutup-shift" style="flex: 1; justify-content: center; gap: 6px;">
          ${ICONS.checkCircle}
          <span>Konfirmasi Tutup Shift (Z-Report)</span>
        </button>
      `;

      const inpFisik = elContainer.querySelector('#inp-tutup-kas-fisik');
      const dispFisik = elContainer.querySelector('#disp-kas-fisik');
      const badgeSelisih = elContainer.querySelector('#badge-selisih-live');
      const boxSelisih = elContainer.querySelector('#box-status-selisih');
      const labelCatatan = elContainer.querySelector('#label-catatan-tutup');

      const updateTampilanSelisih = () => {
        if (!sudahInputFisik) {
          if (dispFisik) dispFisik.textContent = '-';
          if (badgeSelisih) {
            badgeSelisih.className = 'badge badge-secondary mono fw-bold';
            badgeSelisih.textContent = 'Belum diisi';
          }
          if (boxSelisih) boxSelisih.style.borderColor = 'var(--border)';
          return;
        }
        const sel = kasFisikVal - kasSistem;
        if (dispFisik) dispFisik.textContent = formatRupiah(kasFisikVal);
        if (sel === 0) {
          badgeSelisih.className = 'badge badge-success mono fw-bold';
          badgeSelisih.textContent = 'PAS / COCOK (Rp 0)';
          boxSelisih.style.borderColor = 'var(--success)';
          if (labelCatatan) labelCatatan.classList.remove('required');
        } else if (sel > 0) {
          badgeSelisih.className = 'badge badge-info mono fw-bold';
          badgeSelisih.textContent = `LEBIH +${formatRupiah(sel)}`;
          boxSelisih.style.borderColor = 'var(--info)';
          if (labelCatatan) labelCatatan.classList.add('required');
        } else {
          badgeSelisih.className = 'badge badge-danger mono fw-bold';
          badgeSelisih.textContent = `KURANG -${formatRupiah(Math.abs(sel))}`;
          boxSelisih.style.borderColor = 'var(--danger)';
          if (labelCatatan) labelCatatan.classList.add('required');
        }
      };

      inpFisik?.addEventListener('input', () => {
        const rawText = inpFisik.value.replace(/[^\d]/g, '');
        sudahInputFisik = rawText.length > 0;
        kasFisikVal = sudahInputFisik ? parseInt(rawText, 10) : 0;
        inpFisik.value = sudahInputFisik ? formatRupiah(kasFisikVal).replace('Rp ', '') : '';
        updateTampilanSelisih();
      });

      elContainer.querySelector('#btn-isi-sama-sistem')?.addEventListener('click', () => {
        sudahInputFisik = true;
        kasFisikVal = kasSistem;
        if (inpFisik) inpFisik.value = formatRupiah(kasSistem).replace('Rp ', '');
        updateTampilanSelisih();
      });

      const boxPecahan = elContainer.querySelector('#box-kalkulator-pecahan');
      elContainer.querySelector('#btn-toggle-pecahan')?.addEventListener('click', () => {
        if (!boxPecahan) return;
        boxPecahan.style.display = boxPecahan.style.display === 'none' ? '' : 'none';
      });

      const hitungTotalPecahan = () => {
        let total = 0;
        let adaIsi = false;
        elContainer.querySelectorAll('.inp-pecahan-qty').forEach((inp) => {
          const qty = Math.max(0, parseInt(inp.value, 10) || 0);
          if (qty > 0) adaIsi = true;
          total += qty * Number(inp.getAttribute('data-nominal') || 0);
        });
        sudahInputFisik = adaIsi || total > 0;
        kasFisikVal = total;
        if (inpFisik) inpFisik.value = sudahInputFisik ? formatRupiah(total).replace('Rp ', '') : '';
        updateTampilanSelisih();
      };

      elContainer.querySelectorAll('.inp-pecahan-qty').forEach((inp) => {
        inp.addEventListener('input', hitungTotalPecahan);
      });
      elContainer.querySelector('#btn-reset-pecahan')?.addEventListener('click', () => {
        elContainer.querySelectorAll('.inp-pecahan-qty').forEach((inp) => { inp.value = ''; });
        sudahInputFisik = false;
        kasFisikVal = 0;
        if (inpFisik) inpFisik.value = '';
        updateTampilanSelisih();
      });

      const btnKonfirmasiTutup = elFooterActions.querySelector('#btn-konfirmasi-tutup-shift');
      btnKonfirmasiTutup?.addEventListener('click', async () => {
        if (!sudahInputFisik) {
          showToast('Masukkan total uang fisik di laci terlebih dahulu.', 'warning');
          inpFisik?.focus();
          return;
        }
        const sel = kasFisikVal - kasSistem;
        const catatan = (elContainer.querySelector('#inp-tutup-catatan')?.value || '').trim();
        if (sel !== 0 && !catatan) {
          showToast('Ada selisih kas laci. Wajib mengisi catatan/penjelasan selisih.', 'warning');
          elContainer.querySelector('#inp-tutup-catatan')?.focus();
          return;
        }

        const labelSel = sel === 0
          ? 'PAS (Rp 0)'
          : (sel > 0 ? `LEBIH +${formatRupiah(sel)}` : `KURANG -${formatRupiah(Math.abs(sel))}`);
        const yakin = await showConfirm({
          title: 'Konfirmasi Tutup Shift Kasir',
          message: `Tutup shift ${shiftAktif.no_shift}?\n\n• Kas Sistem: ${formatRupiah(kasSistem)}\n• Kas Fisik Laci: ${formatRupiah(kasFisikVal)}\n• Selisih: ${labelSel}`,
          confirmText: 'Ya, Tutup Shift',
          danger: sel < 0
        });
        if (!yakin) return;

        btnKonfirmasiTutup.disabled = true;
        btnKonfirmasiTutup.innerHTML = '<span>Menutup Shift...</span>';
        try {
          const res = await apiCall('shift.tutup', {
            id: shiftAktif.id,
            kas_fisik: kasFisikVal,
            catatan
          });
          perbaruiIndikatorShift(null);
          haptic.success();
          showToast(res.pesan || 'Shift kasir berhasil ditutup!', 'success', 4500);
          modal.close();
          if (res && res.ringkasan) {
            bukaModalPilihanCetakShift(res.ringkasan);
          }
        } catch (err) {
          showToast(err.message || 'Gagal menutup shift kasir', 'error');
          btnKonfirmasiTutup.disabled = false;
          btnKonfirmasiTutup.innerHTML = `${ICONS.checkCircle}<span>Konfirmasi Tutup Shift (Z-Report)</span>`;
        }
      });
    };

    await muatDataShift(true);
    await renderTampilanShift();
  }

  // Bind tombol Shift Kasir di Header POS Cart
  container.querySelector('#btn-pos-shift')?.addEventListener('click', () => bukaModalShiftKasir('utama'));
  window.bukaModalShiftKasirGlobal = bukaModalShiftKasir;

  // ---------- Modal Kas Keluar Kasir (Petty Cash Laci) ----------
  function bukaModalKasKeluarKasir(onSuccess) {
    const modal = showModal({
      title: 'Catat Kas Keluar Kasir (Petty Cash)',
      size: 'sm',
      body: `
        <form id="form-kas-keluar-kasir" class="stack" style="gap: var(--sp-3);">
          <div class="alert alert-warning" style="font-size: var(--fs-xs); margin: 0; padding: 8px 12px;">
            ${ICONS.alertTriangle}
            <div>Kas keluar ini memotong uang fisik kasir di laci dan tercatat dalam buku biaya operasional toko.</div>
          </div>
          <div>
            <label class="form-label required text-xs">Kategori Pengeluaran</label>
            <select name="kategori" id="input-kk-kategori" class="select w-full" required>
              <option value="Transportasi & Pengiriman">Transportasi & Pengiriman (Bensin/Parkir/Tol)</option>
              <option value="Upah Angkut / Kuli Bongkar">Upah Angkut / Kuli Bongkar Muat</option>
              <option value="Konsumsi & Dapur Toko">Konsumsi & Dapur Toko (Air Galon/Snack)</option>
              <option value="Perlengkapan & Kebersihan">Perlengkapan Kasir & Kebersihan</option>
              <option value="Lain-lain">Lain-lain / Keperluan Mendesak</option>
            </select>
          </div>
          <div>
            <label class="form-label required text-xs">Nominal (Rp)</label>
            <input type="text" inputmode="numeric" name="nominal" id="input-kk-nominal" class="input w-full fw-bold mono" placeholder="Contoh: 25.000" required autocomplete="off" />
          </div>
          <div>
            <label class="form-label required text-xs">Keterangan / Keperluan</label>
            <textarea name="keterangan" id="input-kk-keterangan" class="input w-full" rows="2" placeholder="Contoh: Beli bensin pickup kirim semen ke Proyek Pak Joko" required></textarea>
          </div>
          <div class="row" style="justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-kk-batal">Batal</button>
            <button type="submit" class="btn btn-primary btn-sm" id="btn-kk-simpan">Simpan Kas Keluar</button>
          </div>
        </form>
      `
    });

    const form = modal.el.querySelector('#form-kas-keluar-kasir');
    const inputNominal = modal.el.querySelector('#input-kk-nominal');
    const btnBatal = modal.el.querySelector('#btn-kk-batal');
    const btnSimpan = modal.el.querySelector('#btn-kk-simpan');

    btnBatal?.addEventListener('click', () => modal.close());

    // Format Rupiah saat mengetik
    inputNominal?.addEventListener('input', () => {
      const raw = parseRupiah(inputNominal.value);
      inputNominal.value = raw > 0 ? formatRupiah(raw).replace('Rp ', '') : '';
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const kat = modal.el.querySelector('#input-kk-kategori').value;
      const nom = parseRupiah(inputNominal.value);
      const ket = modal.el.querySelector('#input-kk-keterangan').value.trim();

      if (!nom || nom < 100) {
        showToast('Nominal pengeluaran minimal Rp 100', 'warning');
        inputNominal?.focus();
        return;
      }
      if (!ket) {
        showToast('Keterangan pengeluaran wajib diisi', 'warning');
        return;
      }

      btnSimpan.disabled = true;
      btnSimpan.textContent = 'Menyimpan...';

      try {
        const res = await apiCall('biaya.create', {
          kategori: kat,
          nominal: nom,
          keterangan: ket,
          sumber_dana: 'kas_kasir',
          shift_id: state.shiftAktif ? state.shiftAktif.id : ''
        });
        showToast(res.pesan || 'Kas keluar kasir berhasil dicatat!', 'success');
        modal.close();
        if (typeof onSuccess === 'function') {
          onSuccess();
        }
      } catch (err) {
        showToast(err.message || 'Gagal mencatat kas keluar kasir', 'danger');
        btnSimpan.disabled = false;
        btnSimpan.textContent = 'Simpan Kas Keluar';
      }
    });
  }

  // Bind tombol Kas Keluar di Quickbar POS
  container.querySelector('#btn-pos-kas-keluar')?.addEventListener('click', () => bukaModalKasKeluarKasir());
  window.bukaModalKasKeluarKasirGlobal = bukaModalKasKeluarKasir;

  // ---------- Cetak Ulang Struk Transaksi Terakhir POS ----------
  container.querySelector('#btn-pos-reprint')?.addEventListener('click', () => {
    let lastReceipt = store.get('pos_terakhir');
    if (!lastReceipt) {
      try {
        lastReceipt = JSON.parse(localStorage.getItem('pos_last_receipt'));
      } catch (e) {
        lastReceipt = null;
      }
    }
    if (!lastReceipt) {
      showToast('Belum ada transaksi terakhir untuk dicetak ulang.', 'info');
      return;
    }
    bukaModalPilihanCetakPenjualan(lastReceipt);
  });

  // ---------- Atur Printer Bluetooth dari POS Kasir ----------
  container.querySelector('#btn-pos-panduan-printer')?.addEventListener('click', () => {
    tampilkanModalKoneksiPrinter();
  });

  // ---------- Buat Penawaran Harga / Estimasi RAB (Tanpa Potong Stok) ----------
  container.querySelector('#btn-buat-rab')?.addEventListener('click', bukaModalBuatPenawaran);

  function bukaModalBuatPenawaran() {
    if (state.keranjang.length === 0) {
      showToast('Keranjang masih kosong. Tambahkan barang terlebih dahulu untuk membuat RAB.', 'warning');
      return;
    }

    const totalRingkas = hitungDanTampilkanTotal();
    const pel = state.pelanggan || null;

    const modal = showModal({
      title: 'Buat Penawaran Harga / Estimasi RAB',
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="alert alert-info" style="font-size: var(--fs-xs); margin: 0; padding: 8px 12px;">
            ${ICONS.info}
            <div>Penawaran Harga (RAB) <strong>tidak memotong stok</strong> dan dapat dikirim via PDF A5 / WhatsApp, lalu dikonversi 1-klik ke kasir saat pelanggan setuju.</div>
          </div>

          <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3); font-size: var(--fs-xs);">
            <div class="row" style="justify-content: space-between;">
              <span class="text-muted">Jumlah Barang:</span>
              <span class="fw-bold">${state.keranjang.length} Jenis Item</span>
            </div>
            <div class="row" style="justify-content: space-between; margin-top: 2px;">
              <span class="text-muted">Total Estimasi:</span>
              <span class="fw-bold mono" style="color: var(--primary);">${formatRupiah(totalRingkas.grandTotal)}</span>
            </div>
          </div>

          <div>
            <label class="form-label text-xs fw-semibold" for="inp-rab-pel-nama">Nama Pelanggan / Mandor</label>
            <input type="text" id="inp-rab-pel-nama" class="input input-sm" value="${escapeHtml(pel ? pel.nama : '')}" placeholder="Contoh: Pak Hendra (Kontraktor)" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2);">
            <div>
              <label class="form-label text-xs fw-semibold" for="inp-rab-pel-hp">No. HP / WhatsApp</label>
              <input type="tel" id="inp-rab-pel-hp" class="input input-sm" value="${escapeHtml(pel ? (pel.hp || '') : '')}" placeholder="08..." />
            </div>
            <div>
              <label class="form-label text-xs fw-semibold" for="sel-rab-berlaku">Masa Berlaku</label>
              <select id="sel-rab-berlaku" class="select select-sm w-full">
                <option value="3">3 Hari</option>
                <option value="7" selected>7 Hari (Standar)</option>
                <option value="14">14 Hari</option>
                <option value="30">30 Hari</option>
              </select>
            </div>
          </div>

          <div>
            <label class="form-label text-xs fw-semibold" for="inp-rab-proyek">Judul Proyek / RAB (Opsional)</label>
            <input type="text" id="inp-rab-proyek" class="input input-sm" placeholder="Contoh: Renovasi Atap & Plafon Ruko" />
          </div>

          <div>
            <label class="form-label text-xs fw-semibold" for="inp-rab-catatan">Catatan Tambahan (Opsional)</label>
            <textarea id="inp-rab-catatan" class="input" rows="2" placeholder="Contoh: Sudah termasuk ongkir area kota">${escapeHtml(state.catatan || '')}</textarea>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-rab">Batal</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-simpan-rab" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.checkCircle}
            <span>Simpan &amp; Cetak RAB</span>
          </button>
        </div>
      `
    });

    modal.el.querySelector('#btn-batal-rab')?.addEventListener('click', () => modal.close());

    const btnSimpanRab = modal.el.querySelector('#btn-simpan-rab');
    btnSimpanRab?.addEventListener('click', async () => {
      const pelNama = (modal.el.querySelector('#inp-rab-pel-nama')?.value || '').trim() || 'Pelanggan Umum';
      const pelHp = (modal.el.querySelector('#inp-rab-pel-hp')?.value || '').trim();
      const berlakuHari = Number(modal.el.querySelector('#sel-rab-berlaku')?.value || 7);
      const judulProyek = (modal.el.querySelector('#inp-rab-proyek')?.value || '').trim();
      const catatanRab = (modal.el.querySelector('#inp-rab-catatan')?.value || '').trim();

      btnSimpanRab.disabled = true;
      btnSimpanRab.textContent = 'Menyimpan RAB...';
      try {
        const res = await apiCall('penawaran.create', {
          pelanggan_id: pel ? pel.id : '',
          pelanggan_nama: pelNama,
          pelanggan_hp: pelHp,
          alamat_kirim: state.alamatKirim || (pel ? (pel.alamat || '') : ''),
          judul_proyek: judulProyek,
          berlaku_hari: berlakuHari,
          diskon_tipe: state.diskonTransaksi.tipe || '',
          diskon_nilai: Number(state.diskonTransaksi.nilai) || 0,
          pengiriman: state.pengiriman,
          ongkir: state.pengiriman === 'dikirim' ? (Number(state.ongkir) || 0) : 0,
          catatan: catatanRab,
          items: state.keranjang.map((it) => ({
            produk_id: it.produk_id,
            varian_id: it.varian_id || '',
            nama: it.nama,
            satuan: it.satuan,
            faktor: it.faktor || 1,
            qty: it.qty,
            tipe_harga: it.tipe_harga || 'ritel',
            harga_asli: it.harga_asli || it.harga,
            harga: it.harga,
            hpp: it.hpp || 0,
            diskon_tipe: it.diskon_tipe || '',
            diskon_nilai: it.diskon_nilai || 0,
            diskon: it.diskon || 0
          }))
        });

        haptic.success();
        showToast(res.pesan || 'Penawaran Harga berhasil disimpan!', 'success');
        modal.close();
        if (res && res.penawaran) {
          bukaModalHasilPenawaran(res.penawaran);
        }
      } catch (err) {
        showToast(err.message || 'Gagal menyimpan penawaran harga', 'error');
        btnSimpanRab.disabled = false;
        btnSimpanRab.innerHTML = `${ICONS.checkCircle}<span>Simpan &amp; Cetak RAB</span>`;
      }
    });
  }

  // ---------- Daftar Transaksi Tahan & Penawaran Harga RAB (Pending / F8) ----------
  elBtnPendingList?.addEventListener('click', () => bukaModalDaftarPending('pending'));

  async function bukaModalDaftarPending(tabAwal = 'pending') {
    let tabAktifList = tabAwal;
    let pendingItems = [];
    let rabItems = [];

    const modal = showModal({
      title: 'Daftar Pending & Penawaran Harga (RAB)',
      size: 'md',
      body: `
        <div class="stack" style="gap: var(--sp-3);" id="pending-rab-root">
          <div class="text-center" style="padding: var(--sp-5);">
            <div class="spinner spinner-primary" style="margin: 0 auto var(--sp-2);"></div>
            <div class="text-muted text-sm">Memuat daftar transaksi ditahan &amp; penawaran RAB...</div>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-pending">Tutup</button>
        </div>
      `
    });

    const elRoot = modal.el.querySelector('#pending-rab-root');
    modal.el.querySelector('#btn-tutup-pending')?.addEventListener('click', () => modal.close());

    try {
      const [resPending, resRab] = await Promise.all([
        api.post('penjualan.pending.list').catch(() => ({ ok: false })),
        apiCall('penawaran.list', { limit: 50 }).catch(() => ({ items: [] }))
      ]);
      if (resPending && resPending.ok) pendingItems = resPending.data.items || [];
      rabItems = (resRab && Array.isArray(resRab.items)) ? resRab.items : [];
    } catch (err) {
      showToast('Gagal memuat daftar: ' + err.message, 'error');
    }

    const muatItemsKeKeranjang = async (sumber, adalahRab = false) => {
      state.keranjang = (sumber.items || []).map((it) => {
        const pr = state.katalog.find((x) => x.id === it.produk_id) || {};
        return {
          produk_id: it.produk_id,
          varian_id: it.varian_id || '',
          nama: it.nama,
          satuan: it.satuan,
          faktor: it.faktor || 1,
          qty: it.qty,
          qty_dibawa: it.qty_dibawa !== undefined ? it.qty_dibawa : it.qty,
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

      if (sumber.pelanggan_id) {
        const pelCocok = (state.daftarPelanggan || []).find((pl) => pl.id === sumber.pelanggan_id) || null;
        if (pelCocok) {
          state.pelanggan = pelCocok;
        } else {
          try {
            const resPel = await api.post('pelanggan.detail', { id: sumber.pelanggan_id });
            if (resPel.ok && resPel.data?.pelanggan) state.pelanggan = resPel.data.pelanggan;
          } catch (_) { }
        }
        perbaruiTampilanPelanggan();
      }
      state.diskonTransaksi = {
        tipe: sumber.diskon_tipe || '',
        nilai: Number(sumber.diskon_nilai) || 0
      };
      state.pengiriman = sumber.pengiriman === 'dikirim' ? 'dikirim' : 'ambil';
      state.alamatKirim = sumber.alamat_kirim || '';
      state.ongkir = state.pengiriman === 'dikirim' ? (Number(sumber.ongkir) || 0) : 0;
      state.catatan = sumber.catatan || '';
      state.penawaranAktifId = adalahRab ? sumber.id : '';

      if (!adalahRab) {
        await api.post('penjualan.pending.delete', { id: sumber.id });
        state.pendingCount = Math.max(0, state.pendingCount - 1);
        perbaruiBadgePending();
      }

      renderKeranjang();
      modal.close();
      if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('cart');
      showToast(
        adalahRab
          ? `Penawaran ${sumber.no_penawaran} siap diproses di kasir! Klik BAYAR untuk menyelesaikan nota.`
          : 'Draft transaksi berhasil dimuat kembali ke keranjang.',
        'success'
      );
    };

    const renderIsiModal = () => {
      elRoot.innerHTML = `
        <div class="segmented segmented-equal">
          <button type="button" class="btn btn-sm ${tabAktifList === 'pending' ? 'btn-primary' : 'btn-ghost'}" data-pr-tab="pending">
            ${ICONS.clipboard}
            <span>Ditahan (${pendingItems.length})</span>
          </button>
          <button type="button" class="btn btn-sm ${tabAktifList === 'rab' ? 'btn-primary' : 'btn-ghost'}" data-pr-tab="rab">
            ${ICONS.calculator}
            <span>RAB (${rabItems.length})</span>
          </button>
        </div>

        <div class="stack" style="gap: var(--sp-2); max-height: 380px; overflow-y: auto;">
          ${tabAktifList === 'pending' ? (
          pendingItems.length === 0 ? `
              <div class="empty-state text-center" style="padding: var(--sp-6); color: var(--text-muted);">
                Tidak ada transaksi yang sedang ditahan.
              </div>
            ` : pendingItems.map((p) => `
              <div class="card" style="background: var(--surface-2); padding: var(--sp-3);">
                <div class="row" style="justify-content: space-between; align-items: flex-start; gap: var(--sp-2);">
                  <div>
                    <div class="fw-bold mono text-sm">${escapeHtml(p.no_nota)}</div>
                    <div class="text-xs text-muted">Pelanggan: <b>${escapeHtml(p.pelanggan_nama || 'Umum')}</b> • ${p.item_count || 0} Barang</div>
                    <div class="text-xs text-muted">${formatTanggal(p.created_at, true)}</div>
                  </div>
                  <div class="text-right">
                    <div class="fw-bold mono text-sm" style="color: var(--primary);">${formatRupiah(p.total)}</div>
                    <div class="row" style="gap: var(--sp-1); margin-top: 6px; justify-content: flex-end;">
                      <button type="button" class="btn btn-ghost btn-xs text-danger btn-hapus-draft" data-id="${p.id}">Hapus</button>
                      <button type="button" class="btn btn-primary btn-xs btn-muat-draft" data-id="${p.id}">Muat</button>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')
        ) : (
          rabItems.length === 0 ? `
              <div class="empty-state text-center" style="padding: var(--sp-6); color: var(--text-muted);">
                Belum ada Penawaran Harga (RAB) tersimpan. Klik tombol <strong>RAB</strong> di bawah keranjang untuk membuat estimasi harga proyek.
              </div>
            ` : rabItems.map((q) => {
            const badgeSt = q.status === 'dikonversi'
              ? `<span class="badge badge-success">Jadi Nota ${escapeHtml(q.no_nota_konversi || '')}</span>`
              : (q.kedaluwarsa
                ? '<span class="badge badge-warning">Kedaluwarsa</span>'
                : '<span class="badge badge-info">Aktif</span>');
            return `
                <div class="card" style="background: var(--surface-2); padding: var(--sp-3);">
                  <div class="row" style="justify-content: space-between; align-items: flex-start; gap: var(--sp-2);">
                    <div>
                      <div class="row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span class="fw-bold mono text-sm">${escapeHtml(q.no_penawaran)}</span>
                        ${badgeSt}
                      </div>
                      ${q.judul_proyek ? `<div class="text-xs fw-semibold" style="margin-top: 2px;">${escapeHtml(q.judul_proyek)}</div>` : ''}
                      <div class="text-xs text-muted">Kepada: <b>${escapeHtml(q.pelanggan_nama || 'Umum')}</b> • ${q.item_count || 0} Item</div>
                      <div class="text-xs text-muted">Berlaku s/d ${formatTanggal(q.berlaku_sampai)}</div>
                    </div>
                    <div class="text-right">
                      <div class="fw-bold mono text-sm" style="color: var(--primary);">${formatRupiah(q.total)}</div>
                    </div>
                  </div>
                  <div class="row" style="gap: 6px; margin-top: 8px; justify-content: flex-end; flex-wrap: wrap;">
                    <button type="button" class="btn btn-secondary btn-xs btn-rab-cetak" data-id="${escapeHtml(q.id)}" style="display: inline-flex; align-items: center; gap: 4px;">
                      ${ICONS.printer}
                      <span>A5</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-xs btn-rab-wa" data-id="${escapeHtml(q.id)}" style="display: inline-flex; align-items: center; gap: 4px;">
                      ${ICONS.messageCircle}
                      <span>WA</span>
                    </button>
                    <button type="button" class="btn btn-ghost btn-xs text-danger btn-rab-hapus" data-id="${escapeHtml(q.id)}">Hapus</button>
                    <button type="button" class="btn btn-primary btn-xs btn-rab-ke-kasir" data-id="${escapeHtml(q.id)}" style="display: inline-flex; align-items: center; gap: 4px;">
                      ${ICONS.cart}
                      <span>Ke Kasir</span>
                    </button>
                  </div>
                </div>
              `;
          }).join('')
        )}
        </div>
      `;

      elRoot.querySelectorAll('[data-pr-tab]').forEach((b) => {
        b.addEventListener('click', () => {
          tabAktifList = b.getAttribute('data-pr-tab');
          renderIsiModal();
        });
      });

      elRoot.querySelectorAll('.btn-muat-draft').forEach((btn) => {
        btn.addEventListener('click', () => {
          const draft = pendingItems.find((x) => x.id === btn.getAttribute('data-id'));
          if (draft) muatItemsKeKeranjang(draft, false);
        });
      });

      elRoot.querySelectorAll('.btn-hapus-draft').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await api.post('penjualan.pending.delete', { id });
          pendingItems = pendingItems.filter((x) => x.id !== id);
          state.pendingCount = Math.max(0, state.pendingCount - 1);
          perbaruiBadgePending();
          renderIsiModal();
          showToast('Draft transaksi berhasil dihapus.', 'info');
        });
      });

      elRoot.querySelectorAll('.btn-rab-cetak').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = rabItems.find((x) => x.id === btn.getAttribute('data-id'));
          if (q) cetakPenawaranA5(q);
        });
      });

      elRoot.querySelectorAll('.btn-rab-wa').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = rabItems.find((x) => x.id === btn.getAttribute('data-id'));
          if (q) window.open(buatTautanWhatsAppPenawaran(q, q.pelanggan_hp || ''), '_blank', 'noopener,noreferrer');
        });
      });

      elRoot.querySelectorAll('.btn-rab-hapus').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const yakin = await showConfirm({
            title: 'Hapus Penawaran Harga',
            message: 'Yakin ingin menghapus dokumen Penawaran Harga (RAB) ini?',
            confirmText: 'Ya, Hapus',
            danger: true
          });
          if (!yakin) return;
          try {
            await apiCall('penawaran.delete', { id });
            rabItems = rabItems.filter((x) => x.id !== id);
            renderIsiModal();
            showToast('Penawaran berhasil dihapus.', 'info');
          } catch (err) {
            showToast(err.message || 'Gagal menghapus penawaran', 'error');
          }
        });
      });

      elRoot.querySelectorAll('.btn-rab-ke-kasir').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = rabItems.find((x) => x.id === btn.getAttribute('data-id'));
          if (q) muatItemsKeKeranjang(q, true);
        });
      });
    };

    renderIsiModal();
  }

  // ---------- Kosongkan / Reset Keranjang ----------
  elBtnClear?.addEventListener('click', async () => {
    if (state.keranjang.length === 0) {
      if (state.pelanggan || state.diskonTransaksi.nilai > 0 || state.catatan || state.alamatKirim) {
        state.pelanggan = null;
        state.diskonTransaksi = { tipe: '', nilai: 0 };
        state.catatan = '';
        state.alamatKirim = '';
        perbaruiTampilanPelanggan();
        renderKeranjang();
        showToast('Pilihan member & diskon transaksi telah direset.', 'info', 1800);
      } else {
        showToast('Keranjang belanja sudah kosong.', 'info', 1500);
      }
      return;
    }
    const yakin = await showConfirm({
      title: 'Kosongkan Keranjang Belanja?',
      message: 'Semua item barang yang sudah dipilih akan dihapus dari daftar keranjang transaksi saat ini.',
      confirmText: 'Ya, Kosongkan',
      cancelText: 'Batal',
      danger: true
    });
    if (!yakin) return;
    haptic.delete();
    state.keranjang = [];
    state.diskonTransaksi = { tipe: '', nilai: 0 };
    state.pelanggan = null;
    state.catatan = '';
    state.alamatKirim = '';
    perbaruiTampilanPelanggan();
    renderKeranjang();
    showToast('Keranjang belanja telah dikosongkan.', 'info');
    if (typeof window !== 'undefined' && window.innerWidth < 992) setMobileView('catalog');
  });

  // ---------- Scan Barcode Kamera & Fisik ----------
  elBtnCamera?.addEventListener('click', () => {
    bukaKameraScanner((code) => {
      cariDanTambahBarcode(code);
    });
  });

  async function cariDanTambahBarcode(code) {
    const codeClean = String(code || '').trim().toLowerCase();
    if (!codeClean) return;

    // 1. Cari dulu pada katalog lokal yang sudah dimuat
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

    // 2. Jika belum ditemukan di memori lokal, cari ke server database
    if (!matchProd) {
      try {
        const cariRes = await api.post('produk.list', { q: codeClean, limit: 10, aktif_saja: true });
        if (cariRes.ok && cariRes.data && cariRes.data.items && cariRes.data.items.length > 0) {
          const itemsBaru = cariRes.data.items;
          itemsBaru.forEach((p) => {
            if (!state.katalog.some((x) => x.id === p.id)) state.katalog.push(p);
          });
          for (let i = 0; i < itemsBaru.length; i++) {
            const p = itemsBaru[i];
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
        }
      } catch (err) { }
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

  // ---------- Toolbar Pencarian & Toggle View (dengan Debouncing & Server Search) ----------
  let searchDebounceTimer = null;
  elSearch?.addEventListener('input', (e) => {
    state.kataKunci = e.target.value.trim();
    elSearchClear.style.display = state.kataKunci ? 'block' : 'none';
    // 1. Filter instan memori lokal (respons 0ms)
    renderKatalog();

    // 2. Jika ada query pencarian, cari ke database server dengan debounce
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.page = 1;
      muatDataKatalog(true);
    }, 320);
  });

  elSearchClear?.addEventListener('click', () => {
    clearTimeout(searchDebounceTimer);
    state.kataKunci = '';
    elSearch.value = '';
    elSearchClear.style.display = 'none';
    state.page = 1;
    muatDataKatalog(true);
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
    // Abaikan shortcut POS jika modal/dialog sedang terbuka agar tidak bertumpuk
    if (document.querySelector('.overlay')) return;
    if (e.key === 'F2') {
      e.preventDefault();
      elSearch?.focus();
      elSearch?.select();
    } else if (e.key === 'F3') {
      e.preventDefault();
      bukaModalShiftKasir();
    } else if (e.key === 'F4') {
      e.preventDefault();
      bukaModalPembayaran();
    } else if (e.key === 'F7') {
      e.preventDefault();
      tahanTransaksi();
    } else if (e.key === 'F8') {
      e.preventDefault();
      bukaModalDaftarPending();
    } else if (e.key === 'F9') {
      e.preventDefault();
      container.querySelector('#btn-pos-reprint')?.click();
    }
  };

  window.addEventListener('keydown', handleKeyShortcuts);

  // Inisialisasi awal
  muatDataKatalog();
  muatStatusShiftAktif();

  // Return cleanup bila berganti rute
  return () => {
    clearTimeout(searchDebounceTimer);
    window.removeEventListener('keydown', handleKeyShortcuts);
    window.removeEventListener('resize', handleResize);
    if (window.__posCancelSelectMode) window.__posCancelSelectMode = null;
    lepasScannerFisik();
  };
}


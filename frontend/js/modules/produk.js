/**
 * produk.js — Modul Manajemen Master Produk, Multi Satuan & Varian
 * Sesuai aturan README bagian 6.4, 7 (Aturan Bisnis 1, 10, 11, 17) & Hak Akses
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, $$, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { formatRupiah, formatQty, parseRupiah, escapeHtml } from '../utils/format.js';
import { renderKalkulatorHppToggle, renderKalkulatorHppPanel, ikatKalkulatorHpp } from '../utils/hpp-calculator.js';
import { bukaModalKatalogPdf } from '../utils/katalog-pdf.js';
import { bukaModalImportExportProduk } from '../utils/produk-import.js';

/**
 * Kompres file gambar ke format JPEG Base64 (maks 800px, kualitas 0.8)
 * Mengubah foto kamera/galeri 3-8 MB menjadi ~80-120 KB agar upload ke Google Drive super cepat & hemat kuota
 */
function kompresGambar(file, maxDimension = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File yang dipilih bukan gambar valid.'));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          dataUrl: dataUrl,
          width: width,
          height: height,
          mimeType: 'image/jpeg',
          namaFile: (file.name || 'foto_produk').replace(/\.[^.]+$/, '') + '.jpg'
        });
      };
      img.onerror = () => reject(new Error('Gagal membaca data gambar.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

let filterState = {
  q: '',
  kategori_id: '',
  filter_stok: '', // '', 'menipis', 'habis', 'tersedia'
  status: '', // '', 'aktif', 'nonaktif'
  sort: 'terbaru', // 'terbaru', 'terlama', 'nama_asc', 'nama_desc', 'stok_asc', 'stok_desc', 'harga_desc', 'harga_asc'
  aktif_saja: false,
  view: localStorage.getItem('produk_view_mode') || (typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'),
  page: 1,
  limit: 20
};

let cacheDaftarProduk = [];
let cacheDaftarKategoriPrd = [];
let produkSelectMode = false;
const produkSelectedMap = new Map();

function syncProdukBulkBar(container, canEdit) {
  const bar = $('#produk-bulk-bar', container);
  const btnToggle = $('#btn-toggle-select-produk', container);
  if (btnToggle) {
    btnToggle.className = `btn btn-sm ${produkSelectMode ? 'btn-primary' : 'btn-secondary'}`;
    btnToggle.innerHTML = `${ICONS.check}<span>${produkSelectMode ? 'Selesai Pilih' : 'Pilih'}</span>`;
  }
  if (!bar) return;
  const cnt = produkSelectedMap.size;
  const elCnt = $('#produk-bulk-count', bar);
  if (elCnt) elCnt.textContent = String(cnt);
  bar.style.display = produkSelectMode ? 'flex' : 'none';
  bar.querySelectorAll('[data-needs-sel]').forEach((b) => {
    b.disabled = cnt === 0;
  });
  const btnDel = $('#btn-bulk-prd-hapus', bar);
  if (btnDel) btnDel.style.display = canEdit ? 'inline-flex' : 'none';
  const btnKat = $('#btn-bulk-prd-kat', bar);
  if (btnKat) btnKat.style.display = canEdit ? 'inline-flex' : 'none';
  const btnStat = $('#btn-bulk-prd-status', bar);
  if (btnStat) btnStat.style.display = canEdit ? 'inline-flex' : 'none';
}

export async function renderProdukModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');
  const isKasir = user && user.role === 'kasir';
  produkSelectMode = false;
  produkSelectedMap.clear();

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Katalog & Stok Produk</h2>
          <p>Kelola daftar barang, varian, satuan konversi, harga eceran & grosir</p>
        </div>
        <div class="row" style="gap: var(--sp-2); align-items: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" id="btn-buat-katalog-pdf" title="Buat & Simpan Katalog Produk PDF A4 untuk Pelanggan / Proyek">
            ${ICONS.clipboard}
            <span>Katalog PDF</span>
          </button>
          ${canEdit ? `
            <button type="button" class="btn btn-secondary" id="btn-import-export-produk" title="Import / Update Massal Produk & Harga via Excel / CSV">
              ${ICONS.fileSpreadsheet}
              <span>Import / Export</span>
            </button>
            <button type="button" class="btn btn-secondary" id="btn-panduan-varian-header" title="Tata Cara & Panduan Penggunaan Varian dan Satuan">
              ${ICONS.helpCircle}
              <span>Panduan Varian &amp; Satuan</span>
            </button>
            <button type="button" class="btn btn-primary" id="btn-tambah-produk">
              ${ICONS.plus}
              <span>Tambah Produk</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Bilah Filter & Pencarian Komprehensif -->
      <div class="card card-body stack-sm produk-filter-card" style="gap: var(--sp-2);">
        <!-- Baris 1: Pencarian Cepat, Mode Tampilan, Pilih, & Urutkan (Rapat Tanpa Ruang Kosong) -->
        <div class="row produk-filter-top" style="gap: var(--sp-2); align-items: center;">
          <div class="input-group grow" style="min-width: 200px;">
            <span class="input-icon">${ICONS.search}</span>
            <input type="text" class="input" id="filter-produk-q" placeholder="Cari nama barang, SKU, atau barcode..." value="${escapeHtml(filterState.q)}">
          </div>

          <div class="produk-filter-controls">
            <div class="segmented" id="toggle-view" style="flex-shrink: 0;">
              <button type="button" data-view="table" aria-pressed="${filterState.view === 'table'}" title="Tampilan Tabel / Kartu">${ICONS.list}</button>
              <button type="button" data-view="grid" aria-pressed="${filterState.view === 'grid'}" title="Tampilan Grid">${ICONS.grid}</button>
            </div>

            <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-select-produk" title="Mode Tandai & Pilih Banyak Produk" style="gap: 5px; height: var(--control-h); flex-shrink: 0;">
              ${ICONS.check}
              <span>Pilih</span>
            </button>

            <!-- Dropdown Urutkan menyatu di baris yang sama agar bebas ruang kosong -->
            <div class="field grow" style="min-width: 130px;">
              <select class="select" id="filter-produk-sort" title="Urutan Tampilan">
                <option value="terbaru" ${filterState.sort === 'terbaru' ? 'selected' : ''}>Terbaru</option>
                <option value="terlama" ${filterState.sort === 'terlama' ? 'selected' : ''}>Terlama</option>
                <option value="nama_asc" ${filterState.sort === 'nama_asc' ? 'selected' : ''}>Nama (A - Z)</option>
                <option value="nama_desc" ${filterState.sort === 'nama_desc' ? 'selected' : ''}>Nama (Z - A)</option>
                <option value="stok_asc" ${filterState.sort === 'stok_asc' ? 'selected' : ''}>Stok Terendah</option>
                <option value="stok_desc" ${filterState.sort === 'stok_desc' ? 'selected' : ''}>Stok Tertinggi</option>
                <option value="harga_desc" ${filterState.sort === 'harga_desc' ? 'selected' : ''}>Harga Tertinggi</option>
                <option value="harga_asc" ${filterState.sort === 'harga_asc' ? 'selected' : ''}>Harga Terendah</option>
              </select>
            </div>

            <button type="button" class="btn btn-secondary btn-icon" id="btn-reset-filter" title="Reset Semua Filter" style="display: none; flex-shrink: 0;">
              ${ICONS.x}
            </button>
          </div>
        </div>

        <!-- Baris 2: Filter Kategori, Status & Chip Cepat (Menyatu Rapi di Desktop, 2 Baris di Mobile) -->
        <div class="produk-filter-bottom">
          <div class="produk-filter-selects">
            <div class="field">
              <select class="select" id="filter-produk-kategori" title="Kategori Produk">
                <option value="">Semua Kategori</option>
              </select>
            </div>
            <div class="field">
              <select class="select" id="filter-produk-status" title="Status Produk">
                <option value="" ${filterState.status === '' ? 'selected' : ''}>Semua Status</option>
                <option value="aktif" ${filterState.status === 'aktif' ? 'selected' : ''}>Aktif Saja</option>
                <option value="nonaktif" ${filterState.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option>
              </select>
            </div>
          </div>

          <!-- Filter Cepat Chips (1 Baris Horizontal Rapi) -->
          <div class="produk-chips-strip" id="filter-chips-wrap">
            <button type="button" class="btn btn-xs ${!filterState.filter_stok && filterState.sort === 'terbaru' && !filterState.kategori_id && !filterState.status && !filterState.q ? 'btn-primary' : 'btn-secondary'}" data-chip="semua">
              Semua Produk
            </button>
            <button type="button" class="btn btn-xs ${filterState.sort === 'terbaru' && !filterState.filter_stok ? 'btn-primary' : 'btn-secondary'}" data-chip="terbaru" style="display: inline-flex; align-items: center; gap: 4px;">
              ${ICONS.zap}
              <span>Terbaru</span>
            </button>
            <button type="button" class="btn btn-xs ${filterState.filter_stok === 'menipis' ? 'btn-warning' : 'btn-secondary'}" data-chip="menipis" style="display: inline-flex; align-items: center; gap: 4px;">
              ${ICONS.alertTriangle}
              <span>Stok Menipis</span>
            </button>
            <button type="button" class="btn btn-xs ${filterState.filter_stok === 'habis' ? 'btn-danger' : 'btn-secondary'}" data-chip="habis" style="display: inline-flex; align-items: center; gap: 4px;">
              ${ICONS.xCircle}
              <span>Stok Habis</span>
            </button>
            <button type="button" class="btn btn-xs ${filterState.filter_stok === 'tersedia' ? 'btn-primary' : 'btn-secondary'}" data-chip="tersedia" style="display: inline-flex; align-items: center; gap: 4px;">
              ${ICONS.checkCircle}
              <span>Ada Stok</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Area Tampilan Data -->
      <div id="area-daftar-produk">
        ${renderSkeleton(4)}
      </div>

      <!-- Paginasi & Kontrol Muat Produk -->
      <div id="area-paginasi-produk" class="stack-sm" style="width: 100%; margin-top: var(--sp-3);"></div>
    </div>

    <!-- Floating Bulk Action Bar Produk (Solid) -->
    <div class="bulk-action-bar no-print" id="produk-bulk-bar" style="display: none;">
      <div class="bulk-action-info">
        <span class="bulk-action-count" id="produk-bulk-count">0</span>
        <span>produk dipilih</span>
      </div>
      <div class="bulk-action-btns">
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-prd-all">Pilih Semua</button>
        <button type="button" class="btn btn-xs btn-primary" id="btn-bulk-prd-katalog" data-needs-sel disabled>
          ${ICONS.clipboard}
          <span>Katalog PDF</span>
        </button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-prd-ptag" data-needs-sel disabled>
          ${ICONS.printer}
          <span>Price Tag</span>
        </button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-prd-kat" data-needs-sel disabled>
          ${ICONS.tag}
          <span>Kategori</span>
        </button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-prd-status" data-needs-sel disabled>
          <span>Status</span>
        </button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-prd-wa" data-needs-sel disabled>
          <span>Daftar WA</span>
        </button>
        <button type="button" class="btn btn-xs btn-danger" id="btn-bulk-prd-hapus" data-needs-sel disabled>
          <span>Hapus</span>
        </button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-prd-cancel">Batal</button>
      </div>
    </div>
  `;

  // Muat opsi kategori ke dropdown filter secara paralel (non-blocking terhadap muatProduk)
  const muatFilterKategoriPromise = apiCall('kategori.list', {})
    .then((katRes) => {
      cacheDaftarKategoriPrd = katRes.items || [];
      const selKat = $('#filter-produk-kategori', container);
      if (selKat) {
        selKat.innerHTML = susunOpsiKategoriHtml(cacheDaftarKategoriPrd, filterState.kategori_id, 'Semua Kategori');
      }
    })
    .catch(() => { });

  // Pasang event filter
  let debounceTimer;
  $('#filter-produk-q', container)?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filterState.q = e.target.value.trim();
      filterState.page = 1;
      perbaruiTampilanFilter(container);
      muatProduk(container, canEdit, isKasir);
    }, 300);
  });

  // Dropdown pengurutan (Default: Terbaru selalu di atas)
  $('#filter-produk-sort', container)?.addEventListener('change', (e) => {
    filterState.sort = e.target.value;
    filterState.page = 1;
    perbaruiTampilanFilter(container);
    muatProduk(container, canEdit, isKasir);
  });

  // Dropdown kategori
  $('#filter-produk-kategori', container)?.addEventListener('change', (e) => {
    filterState.kategori_id = e.target.value;
    filterState.page = 1;
    perbaruiTampilanFilter(container);
    muatProduk(container, canEdit, isKasir);
  });

  // Dropdown status keaktifan
  $('#filter-produk-status', container)?.addEventListener('change', (e) => {
    filterState.status = e.target.value;
    filterState.page = 1;
    perbaruiTampilanFilter(container);
    muatProduk(container, canEdit, isKasir);
  });

  // Quick filter chips
  container.querySelectorAll('#filter-chips-wrap button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chip = btn.getAttribute('data-chip');
      if (chip === 'semua') {
        filterState.q = '';
        filterState.kategori_id = '';
        filterState.filter_stok = '';
        filterState.status = '';
        filterState.sort = 'terbaru';
        const inpQ = $('#filter-produk-q', container);
        if (inpQ) inpQ.value = '';
        const selKat = $('#filter-produk-kategori', container);
        if (selKat) selKat.value = '';
        const selStatus = $('#filter-produk-status', container);
        if (selStatus) selStatus.value = '';
        const selSort = $('#filter-produk-sort', container);
        if (selSort) selSort.value = 'terbaru';
      } else if (chip === 'terbaru') {
        filterState.sort = 'terbaru';
        filterState.filter_stok = '';
        const selSort = $('#filter-produk-sort', container);
        if (selSort) selSort.value = 'terbaru';
      } else if (chip === 'menipis' || chip === 'habis' || chip === 'tersedia') {
        filterState.filter_stok = chip;
      }
      filterState.page = 1;
      perbaruiTampilanFilter(container);
      muatProduk(container, canEdit, isKasir);
    });
  });

  // Tombol reset semua filter
  $('#btn-reset-filter', container)?.addEventListener('click', () => {
    filterState.q = '';
    filterState.kategori_id = '';
    filterState.filter_stok = '';
    filterState.status = '';
    filterState.sort = 'terbaru';
    filterState.page = 1;

    const inpQ = $('#filter-produk-q', container);
    if (inpQ) inpQ.value = '';
    const selKat = $('#filter-produk-kategori', container);
    if (selKat) selKat.value = '';
    const selStatus = $('#filter-produk-status', container);
    if (selStatus) selStatus.value = '';
    const selSort = $('#filter-produk-sort', container);
    if (selSort) selSort.value = 'terbaru';

    perbaruiTampilanFilter(container);
    muatProduk(container, canEdit, isKasir);
  });

  $('#toggle-view', container)?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.view = btn.getAttribute('data-view');
      try { localStorage.setItem('produk_view_mode', filterState.view); } catch (e) { }
      $('#toggle-view', container).querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', b.getAttribute('data-view') === filterState.view);
      });
      muatProduk(container, canEdit, isKasir);
    });
  });

  const keluarSelectModePrd = () => {
    if (!produkSelectMode) return false;
    produkSelectMode = false;
    produkSelectedMap.clear();
    syncProdukBulkBar(container, canEdit);
    muatProduk(container, canEdit, isKasir, false);
    return true;
  };

  window.__posCancelSelectMode = keluarSelectModePrd;

  $('#btn-toggle-select-produk', container)?.addEventListener('click', () => {
    produkSelectMode = !produkSelectMode;
    if (!produkSelectMode) produkSelectedMap.clear();
    syncProdukBulkBar(container, canEdit);
    muatProduk(container, canEdit, isKasir, false);
  });

  $('#btn-bulk-prd-cancel', container)?.addEventListener('click', () => {
    keluarSelectModePrd();
  });

  $('#btn-bulk-prd-all', container)?.addEventListener('click', () => {
    const allSelected = cacheDaftarProduk.length > 0 && cacheDaftarProduk.every((p) => produkSelectedMap.has(p.id));
    if (allSelected) {
      cacheDaftarProduk.forEach((p) => produkSelectedMap.delete(p.id));
    } else {
      cacheDaftarProduk.forEach((p) => produkSelectedMap.set(p.id, p));
    }
    syncProdukBulkBar(container, canEdit);
    muatProduk(container, canEdit, isKasir, false);
  });

  // 0. Buat Katalog Produk PDF (Header & Bulk Action Bar)
  $('#btn-buat-katalog-pdf', container)?.addEventListener('click', () => {
    const terpilih = produkSelectedMap.size > 0 ? Array.from(produkSelectedMap.values()) : [];
    bukaModalKatalogPdf({
      produkTerpilih: terpilih,
      daftarKategori: cacheDaftarKategoriPrd,
      kategoriAwal: filterState.kategori_id || ''
    });
  });

  // 0b. Import / Update Massal Produk & Harga via Excel / CSV (Owner & Admin)
  $('#btn-import-export-produk', container)?.addEventListener('click', () => {
    bukaModalImportExportProduk({
      daftarKategori: cacheDaftarKategoriPrd,
      onSelesai: async () => {
        try {
          const katRes = await apiCall('kategori.list', {}, { skipCache: true });
          cacheDaftarKategoriPrd = katRes.items || [];
          const selKat = $('#filter-produk-kategori', container);
          if (selKat) {
            selKat.innerHTML = susunOpsiKategoriHtml(cacheDaftarKategoriPrd, filterState.kategori_id, 'Semua Kategori');
          }
        } catch (_) {}
        muatProduk(container, canEdit, isKasir, true);
      }
    });
  });

  $('#btn-bulk-prd-katalog', container)?.addEventListener('click', () => {
    const terpilih = Array.from(produkSelectedMap.values());
    if (!terpilih.length) return;
    bukaModalKatalogPdf({
      produkTerpilih: terpilih,
      daftarKategori: cacheDaftarKategoriPrd,
      kategoriAwal: filterState.kategori_id || ''
    });
  });

  // 1. Cetak Price Tag Massal
  $('#btn-bulk-prd-ptag', container)?.addEventListener('click', () => {
    if (!produkSelectedMap.size) return;
    try {
      sessionStorage.setItem('pos_pricetag_preselect', JSON.stringify(Array.from(produkSelectedMap.keys())));
    } catch (_) { }
    produkSelectMode = false;
    produkSelectedMap.clear();
    if (typeof window.__posNavigate === 'function') {
      window.__posNavigate('#/pricetag');
    } else {
      window.location.hash = '#/pricetag';
    }
  });

  // 2. Pindah Kategori Massal
  $('#btn-bulk-prd-kat', container)?.addEventListener('click', () => {
    const terpilih = Array.from(produkSelectedMap.values());
    if (!terpilih.length) return;
    const modalKat = showModal({
      title: `Pindah Kategori (${terpilih.length} Produk)`,
      size: 'sm',
      body: `
        <div class="stack">
          <div class="text-sm text-muted">Pilih kategori tujuan untuk <strong>${terpilih.length}</strong> produk yang ditandai:</div>
          <div class="field">
            <label class="field-label" for="sel-bulk-kategori-target">Kategori Tujuan</label>
            <select class="select" id="sel-bulk-kategori-target">
              ${susunOpsiKategoriHtml(cacheDaftarKategoriPrd, '', '-- Tanpa Kategori --')}
            </select>
          </div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary btn-sm btn-cancel">Batal</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-konfirm-bulk-kat">Simpan Kategori</button>
      `
    });

    modalKat.el.querySelector('#btn-konfirm-bulk-kat')?.addEventListener('click', async () => {
      const targetKatId = modalKat.el.querySelector('#sel-bulk-kategori-target')?.value || '';
      const btn = modalKat.el.querySelector('#btn-konfirm-bulk-kat');
      if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
      let sukses = 0;
      for (const p of terpilih) {
        try {
          await apiCall('produk.update', {
            id: p.id,
            nama: p.nama,
            sku: p.sku || '',
            barcode: p.barcode || '',
            kategori_id: targetKatId,
            satuan_dasar: p.satuan_dasar || 'PCS',
            hpp: Number(p.hpp || 0),
            harga_ritel: Number(p.harga_ritel || 0),
            harga_grosir: Number(p.harga_grosir || p.harga_ritel || 0),
            min_grosir_qty: Number(p.min_grosir_qty || 1),
            stok_min: Number(p.stok_min || 0),
            punya_varian: Boolean(p.punya_varian),
            foto_url: p.foto_url || '',
            aktif: p.aktif !== false
          });
          sukses++;
        } catch (_) { }
      }
      modalKat.close();
      showToast(`${sukses} dari ${terpilih.length} produk berhasil dipindahkan kategorinya.`, 'success');
      keluarSelectModePrd();
    });
  });

  // 3. Ubah Status Aktif / Nonaktif Massal
  $('#btn-bulk-prd-status', container)?.addEventListener('click', () => {
    const terpilih = Array.from(produkSelectedMap.values());
    if (!terpilih.length) return;
    const modalSt = showModal({
      title: `Ubah Status (${terpilih.length} Produk)`,
      size: 'sm',
      body: `
        <div class="stack">
          <div class="text-sm text-muted">Pilih status keaktifan baru untuk <strong>${terpilih.length}</strong> produk terpilih:</div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-primary grow" id="btn-bulk-set-aktif">Aktifkan Semua</button>
            <button type="button" class="btn btn-secondary grow" id="btn-bulk-set-nonaktif">Nonaktifkan Semua</button>
          </div>
        </div>
      `
    });

    const terapkanStatus = async (statusAktif) => {
      modalSt.close();
      showToast(`Memperbarui status ${terpilih.length} produk...`, 'info', 2000);
      let sukses = 0;
      for (const p of terpilih) {
        try {
          await apiCall('produk.update', {
            id: p.id,
            nama: p.nama,
            sku: p.sku || '',
            barcode: p.barcode || '',
            kategori_id: p.kategori_id || '',
            satuan_dasar: p.satuan_dasar || 'PCS',
            hpp: Number(p.hpp || 0),
            harga_ritel: Number(p.harga_ritel || 0),
            harga_grosir: Number(p.harga_grosir || p.harga_ritel || 0),
            min_grosir_qty: Number(p.min_grosir_qty || 1),
            stok_min: Number(p.stok_min || 0),
            punya_varian: Boolean(p.punya_varian),
            foto_url: p.foto_url || '',
            aktif: statusAktif
          });
          sukses++;
        } catch (_) { }
      }
      showToast(`${sukses} produk berhasil di-${statusAktif ? 'aktifkan' : 'nonaktifkan'}.`, 'success');
      keluarSelectModePrd();
    };

    modalSt.el.querySelector('#btn-bulk-set-aktif')?.addEventListener('click', () => terapkanStatus(true));
    modalSt.el.querySelector('#btn-bulk-set-nonaktif')?.addEventListener('click', () => terapkanStatus(false));
  });

  // 4. Salin / Kirim Daftar Produk Terpilih ke WhatsApp (Untuk Pembeli / Restok Supplier)
  $('#btn-bulk-prd-wa', container)?.addEventListener('click', () => {
    const terpilih = Array.from(produkSelectedMap.values());
    if (!terpilih.length) return;
    const namaToko = store.getNamaToko ? store.getNamaToko() : 'POS Toko';
    const lines = [
      `*DAFTAR PRODUK - ${namaToko}*`,
      `Total: ${terpilih.length} item`,
      '--------------------------------',
      ...terpilih.map((p, i) => `${i + 1}. ${p.nama}${p.sku ? ` (${p.sku})` : ''} — ${formatRupiah(p.harga_ritel)}/${p.satuan_dasar} | Stok: ${formatQty(p.stok)}`)
    ];
    const teks = lines.join('\n');

    const modalWa = showModal({
      title: `Bagikan Daftar (${terpilih.length} Produk)`,
      size: 'sm',
      body: `
        <div class="stack">
          <div class="text-xs text-muted">Siap disalin atau langsung dikirim ke WhatsApp pembeli / supplier:</div>
          <textarea class="input" id="txt-bulk-wa-prd" rows="8" style="font-family: var(--font-mono); font-size: 12px;">${escapeHtml(teks)}</textarea>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-bulk-wa">Salin Teks</button>
        <a class="btn btn-primary btn-sm" id="btn-open-bulk-wa" href="https://wa.me/?text=${encodeURIComponent(teks)}" target="_blank" rel="noopener">Kirim WhatsApp</a>
      `
    });

    modalWa.el.querySelector('#btn-copy-bulk-wa')?.addEventListener('click', async () => {
      const val = modalWa.el.querySelector('#txt-bulk-wa-prd')?.value || teks;
      try {
        await navigator.clipboard.writeText(val);
        showToast('Daftar produk berhasil disalin ke clipboard!', 'success');
      } catch (_) {
        showToast('Salin teks langsung dari kotak di atas.', 'info');
      }
    });
  });

  // 5. Hapus Massal Produk
  $('#btn-bulk-prd-hapus', container)?.addEventListener('click', async () => {
    const terpilih = Array.from(produkSelectedMap.values());
    if (!terpilih.length) return;
    const setuju = await showConfirm({
      title: `Hapus ${terpilih.length} Produk Terpilih?`,
      message: `Anda akan menghapus ${terpilih.length} produk sekaligus. Data stok & riwayat transaksi tetap aman dalam arsip sistem.`,
      confirmText: `Ya, Hapus ${terpilih.length} Produk`,
      danger: true
    });
    if (!setuju) return;

    showToast(`Menghapus ${terpilih.length} produk...`, 'info', 2000);
    let sukses = 0;
    for (const p of terpilih) {
      try {
        await apiCall('produk.delete', { id: p.id });
        sukses++;
      } catch (_) { }
    }
    showToast(`${sukses} dari ${terpilih.length} produk berhasil dihapus.`, 'success');
    keluarSelectModePrd();
  });

  if (canEdit) {
    $('#btn-panduan-varian-header', container)?.addEventListener('click', () => {
      bukaModalPanduanVarianSatuan();
    });
    $('#btn-tambah-produk', container)?.addEventListener('click', () => {
      bukaModalFormProduk(container, null);
    });
  }

  perbaruiTampilanFilter(container);
  await Promise.all([muatProduk(container, canEdit, isKasir), muatFilterKategoriPromise]);

  return () => {
    produkSelectMode = false;
    produkSelectedMap.clear();
    if (window.__posCancelSelectMode === keluarSelectModePrd) {
      window.__posCancelSelectMode = null;
    }
  };
}

function perbaruiTampilanFilter(c) {
  const isFilterAktif = !!(filterState.q || filterState.kategori_id || filterState.filter_stok || filterState.status || filterState.sort !== 'terbaru');
  const btnReset = $('#btn-reset-filter', c);
  if (btnReset) {
    btnReset.style.display = isFilterAktif ? 'inline-flex' : 'none';
  }

  // Perbarui styling tombol chips
  c.querySelectorAll('#filter-chips-wrap button').forEach((btn) => {
    const chip = btn.getAttribute('data-chip');
    let isActive = false;
    if (chip === 'semua') {
      isActive = !filterState.filter_stok && filterState.sort === 'terbaru' && !filterState.kategori_id && !filterState.status && !filterState.q;
    } else if (chip === 'terbaru') {
      isActive = filterState.sort === 'terbaru' && !filterState.filter_stok;
    } else if (chip === 'menipis') {
      isActive = filterState.filter_stok === 'menipis';
    } else if (chip === 'habis') {
      isActive = filterState.filter_stok === 'habis';
    } else if (chip === 'tersedia') {
      isActive = filterState.filter_stok === 'tersedia';
    }

    btn.classList.remove('btn-primary', 'btn-secondary', 'btn-warning', 'btn-danger');
    if (isActive) {
      if (chip === 'menipis') btn.classList.add('btn-warning');
      else if (chip === 'habis') btn.classList.add('btn-danger');
      else btn.classList.add('btn-primary');
    } else {
      btn.classList.add('btn-secondary');
    }
  });
}

function urutkanDaftarProdukLokal(items, sortMode) {
  const mode = sortMode || 'terbaru';
  return [...items].sort((a, b) => {
    if (mode === 'terlama') {
      const tA = String(a.created_at || '');
      const tB = String(b.created_at || '');
      if (tA && tB && tA !== tB) return tA.localeCompare(tB);
      return 0;
    }
    if (mode === 'nama_asc') {
      return String(a.nama || '').localeCompare(String(b.nama || ''));
    }
    if (mode === 'nama_desc') {
      return String(b.nama || '').localeCompare(String(a.nama || ''));
    }
    if (mode === 'stok_asc') {
      return Number(a.stok || 0) - Number(b.stok || 0);
    }
    if (mode === 'stok_desc') {
      return Number(b.stok || 0) - Number(a.stok || 0);
    }
    if (mode === 'harga_asc') {
      return Number(a.harga_ritel || 0) - Number(b.harga_ritel || 0);
    }
    if (mode === 'harga_desc') {
      return Number(b.harga_ritel || 0) - Number(a.harga_ritel || 0);
    }
    // Default: 'terbaru' (created_at DESC)
    const tA = String(a.created_at || '');
    const tB = String(b.created_at || '');
    if (tA && tB && tA !== tB) return tB.localeCompare(tA);
    return 0;
  });
}

async function muatProduk(container, canEdit, isKasir, isAppend = false) {
  const area = $('#area-daftar-produk', container);
  const areaPaginasi = $('#area-paginasi-produk', container);
  if (!area) return;

  try {
    const { view: _viewMode, ...payloadProduk } = filterState;
    if (!isAppend) {
      const res = await apiCall('produk.list', payloadProduk);
      cacheDaftarProduk = urutkanDaftarProdukLokal(res.items || [], filterState.sort);
      window._totalProdukTerakhir = res.total || 0;
    } else {
      filterState.page++;
      const { view: _v2, ...payloadNext } = filterState;
      const res = await apiCall('produk.list', payloadNext);
      const itemsBaru = res.items || [];
      itemsBaru.forEach((p) => {
        if (!cacheDaftarProduk.some((x) => x.id === p.id)) {
          cacheDaftarProduk.push(p);
        }
      });
      cacheDaftarProduk = urutkanDaftarProdukLokal(cacheDaftarProduk, filterState.sort);
      window._totalProdukTerakhir = res.total || 0;
    }

    const items = cacheDaftarProduk;
    const total = window._totalProdukTerakhir || items.length;

    if (!items.length) {
      const adaFilter = !!(filterState.q || filterState.kategori_id || filterState.filter_stok || filterState.status || filterState.sort !== 'terbaru');
      area.innerHTML = `
        <div class="card card-body">
          ${renderEmpty({
        title: 'Produk Tidak Ditemukan',
        text: filterState.q ? `Tidak ada barang yang cocok dengan kata kunci "${filterState.q}".` : (adaFilter ? 'Tidak ada produk yang cocok dengan kombinasi filter yang dipilih.' : 'Belum ada produk yang didaftarkan ke sistem.'),
        icon: ICONS.box,
        actionButton: adaFilter
          ? `<button type="button" class="btn btn-secondary btn-reset-dari-empty">${ICONS.refresh} Reset Filter</button>`
          : (canEdit && !filterState.q ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">${ICONS.plus}<span>Tambah Produk Pertama</span></button>` : '')
      })}
        </div>
      `;
      area.querySelector('.btn-reset-dari-empty')?.addEventListener('click', () => {
        $('#btn-reset-filter', container)?.click();
      });
      area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
        bukaModalFormProduk(container, null);
      });
      if (areaPaginasi) areaPaginasi.innerHTML = '';
      return;
    }

    if (filterState.view === 'table') {
      let html = `
        <div class="card">
          <div class="table-wrap">
            <table class="table table-produk">
              <thead>
                <tr>
                  ${produkSelectMode ? '<th style="width: 38px; text-align: center;">Pilih</th>' : ''}
                  <th style="min-width: 150px;">Nama Produk</th>
                  <th style="width: 120px; min-width: 110px; white-space: nowrap;">SKU / Barcode</th>
                  <th style="width: 65px; min-width: 60px; text-align: center;">Satuan</th>
                  ${!isKasir ? '<th style="text-align: right; width: 95px; min-width: 85px; white-space: nowrap;">HPP</th>' : ''}
                  <th style="text-align: right; width: 100px; min-width: 90px; white-space: nowrap;">Harga Ritel</th>
                  <th style="text-align: right; width: 100px; min-width: 90px; white-space: nowrap;">Harga Grosir</th>
                  <th style="text-align: center; width: 65px; min-width: 60px; white-space: nowrap;">Stok</th>
                  ${canEdit ? '<th style="width: 175px; min-width: 170px; text-align: right; white-space: nowrap;">Aksi</th>' : ''}
                </tr>
              </thead>
              <tbody>
      `;

      items.forEach((p) => {
        const stokBadge = dapatkanBadgeStok(p.stok, p.stok_min);
        const isChecked = produkSelectMode && produkSelectedMap.has(p.id);
        html += `
          <tr class="prd-selectable-item ${isChecked ? 'is-bulk-selected' : ''}" data-prd-id="${escapeHtml(p.id)}">
            ${produkSelectMode ? `
              <td data-label="Pilih" style="width: 38px; text-align: center;">
                <input type="checkbox" class="bulk-checkbox cb-prd-select" data-id="${escapeHtml(p.id)}" ${isChecked ? 'checked' : ''} aria-label="Pilih ${escapeHtml(p.nama)}">
              </td>
            ` : ''}
            <td data-label="Produk">
              <div class="prd-table-head" style="display: flex; align-items: flex-start; gap: var(--sp-3); width: 100%; flex-wrap: nowrap;">
                <div class="prd-table-avatar" style="flex-shrink: 0;">
                  ${p.foto_url ? `
                    <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" loading="lazy" decoding="async" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='grid';">
                    <div style="display: none; width: 100%; height: 100%; place-items: center;">${ICONS.package}</div>
                  ` : ICONS.package}
                </div>
                <div class="grow" style="flex: 1 1 auto; min-width: 0;">
                  <div class="fw-bold text-md prd-table-nama" style="word-break: break-word; line-height: 1.35;">${escapeHtml(p.nama)}</div>
                  <div class="row" style="gap: 4px; margin-top: 3px; flex-wrap: wrap;">
                    ${p.sku ? `<span class="mono text-xs text-muted d-none-desktop" style="white-space: nowrap;">${escapeHtml(p.sku)}</span>` : ''}
                    ${p.kategori_nama ? `<span class="badge badge-secondary badge-sm d-none-mobile">${escapeHtml(p.kategori_nama)}</span>` : ''}
                    ${p.punya_varian && p.varian && p.varian.length ? `<span class="badge badge-info badge-sm">${p.varian.length} Varian</span>` : ''}
                    ${p.satuan_konversi && p.satuan_konversi.length ? `<span class="badge badge-sm">+${p.satuan_konversi.length} Satuan</span>` : ''}
                  </div>
                </div>
                <div class="d-none-desktop" style="flex-shrink: 0; margin-left: auto; align-self: flex-start; padding-top: 2px;">
                  <span class="badge ${stokBadge.kelas}" style="white-space: nowrap;">${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar)}</span>
                </div>
              </div>
            </td>
            <td data-label="SKU / Barcode" class="d-none-mobile" style="white-space: nowrap;">
              <div class="mono text-xs" style="white-space: nowrap;">${escapeHtml(p.sku || '-')}</div>
              <div class="text-xs text-muted" style="white-space: nowrap;">${escapeHtml(p.barcode || '')}</div>
            </td>
            <td data-label="Satuan"><span class="table-cell-val">${escapeHtml(p.satuan_dasar)}</span></td>
            ${!isKasir ? `<td class="num" data-label="HPP"><span class="table-cell-val">${formatRupiah(p.hpp)}</span></td>` : ''}
            <td class="num fw-bold text-primary" data-label="Harga Ritel"><span class="table-cell-val">${formatRupiah(p.harga_ritel)}</span></td>
            <td class="num text-muted" data-label="Harga Grosir"><span class="table-cell-val">${p.harga_grosir ? formatRupiah(p.harga_grosir) : '-'}</span></td>
            <td style="text-align: center; white-space: nowrap;" data-label="Stok" class="d-none-mobile">
              <span class="badge ${stokBadge.kelas}">${formatQty(p.stok)}</span>
            </td>
            ${canEdit ? `
              <td style="text-align: right; width: 175px; min-width: 170px; white-space: nowrap;" data-label="Aksi">
                <div class="table-actions" style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px;">
                  <button type="button" class="btn btn-outline-primary btn-xs btn-quick-edit-prd" data-id="${p.id}" title="Edit Cepat Harga & Stok" style="padding: 0 6px; height: 26px; min-height: 26px; font-size: 11px;">
                    ${ICONS.zap}
                    <span>Cepat</span>
                  </button>
                  <button type="button" class="btn btn-secondary btn-xs btn-edit-prd" data-id="${p.id}" title="Edit Lengkap" style="padding: 0 6px; height: 26px; min-height: 26px; font-size: 11px; border: 1px solid var(--border-strong);">
                    ${ICONS.edit}
                    <span>Ubah</span>
                  </button>
                  <button type="button" class="btn btn-outline-secondary btn-xs btn-duplikat-prd" data-id="${p.id}" title="Duplikat / Salin Produk" style="padding: 0 6px; height: 26px; min-height: 26px; font-size: 11px;">
                    ${ICONS.copy}
                    <span>Salin</span>
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-xs btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}" title="Hapus Produk" style="padding: 0 5px; height: 26px; min-height: 26px;">
                    ${ICONS.trash}
                    <span class="d-none-desktop">Hapus</span>
                  </button>
                </div>
              </td>
            ` : ''}
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
      area.innerHTML = html;
    } else {
      // Grid View
      let html = '<div class="card-grid">';
      items.forEach((p) => {
        const stokBadge = dapatkanBadgeStok(p.stok, p.stok_min);
        const isChecked = produkSelectMode && produkSelectedMap.has(p.id);
        html += `
          <div class="card stack-sm prd-selectable-item ${isChecked ? 'is-bulk-selected' : ''}" data-prd-id="${escapeHtml(p.id)}" style="padding: var(--sp-4); position: relative;">
            ${produkSelectMode ? `
              <div class="row-between items-center" style="margin-bottom: var(--sp-1);">
                <label class="row items-center text-xs fw-semibold" style="gap: 6px; cursor: pointer;">
                  <input type="checkbox" class="bulk-checkbox cb-prd-select" data-id="${escapeHtml(p.id)}" ${isChecked ? 'checked' : ''}>
                  <span>${isChecked ? 'Ditandai' : 'Tandai'}</span>
                </label>
              </div>
            ` : ''}
            <div class="prd-grid-thumb ${p.foto_url ? 'has-photo' : 'no-photo'}">
              ${p.foto_url ? `
                <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" class="prd-grid-thumb-img" loading="lazy" decoding="async" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex'; if (this.parentElement) { this.parentElement.classList.remove('has-photo'); this.parentElement.classList.add('no-photo'); }">
                <div class="prd-grid-thumb-empty" style="display: none;">
                  <div class="prd-grid-thumb-icon">${ICONS.package}</div>
                  <span>Belum ada foto</span>
                </div>
              ` : `
                <div class="prd-grid-thumb-empty">
                  <div class="prd-grid-thumb-icon">${ICONS.package}</div>
                  <span>Belum ada foto</span>
                </div>
              `}
            </div>
            <div class="row-between" style="align-items: center; gap: 6px;">
              <span class="badge ${stokBadge.kelas}">Stok: ${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar)}</span>
              ${p.sku ? `<span class="mono text-xs text-muted" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.sku)}</span>` : ''}
            </div>

            <div class="fw-semibold text-md" style="min-height: 40px; margin-top: 2px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${escapeHtml(p.nama)}">
              ${escapeHtml(p.nama)}
            </div>

            <div class="row-between" style="margin-top: auto; padding-top: var(--sp-2); border-top: 1px solid var(--border);">
              <div>
                <div class="text-xs text-muted">Harga Ritel</div>
                <div class="fw-bold num text-lg text-primary">${formatRupiah(p.harga_ritel)}</div>
              </div>
              ${!isKasir && p.hpp !== null ? `
                <div style="text-align: right;">
                  <div class="text-xs text-muted">HPP</div>
                  <div class="num text-sm text-muted">${formatRupiah(p.hpp)}</div>
                </div>
              ` : ''}
            </div>

            ${canEdit ? `
              <div class="table-actions" style="display: flex; align-items: center; width: 100%; gap: 4px; margin-top: var(--sp-2);">
                <button type="button" class="btn btn-outline-primary btn-xs btn-quick-edit-prd" data-id="${p.id}" title="Edit Cepat Harga & Stok" style="flex: 1 1 0%; padding: 0 4px; height: 32px; font-size: 11.5px; justify-content: center; gap: 3px;">
                  ${ICONS.zap}
                  <span>Cepat</span>
                </button>
                <button type="button" class="btn btn-secondary btn-xs btn-edit-prd" data-id="${p.id}" title="Edit Lengkap" style="flex: 1 1 0%; padding: 0 4px; height: 32px; font-size: 11.5px; justify-content: center; gap: 3px; border: 1px solid var(--border-strong);">
                  ${ICONS.edit}
                  <span>Ubah</span>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-xs btn-duplikat-prd" data-id="${p.id}" title="Duplikat / Salin Produk" style="flex: 1 1 0%; padding: 0 4px; height: 32px; font-size: 11.5px; justify-content: center; gap: 3px;">
                  ${ICONS.copy}
                  <span>Salin</span>
                </button>
                <button type="button" class="btn btn-outline-danger btn-xs btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}" title="Hapus Produk" style="width: 32px; height: 32px; flex-shrink: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                  ${ICONS.trash}
                </button>
              </div>
            ` : ''}
          </div>
        `;
      });
      html += '</div>';
      area.innerHTML = html;
    }

    // Pasang interaksi Mode Tandai & Pilih (Checkbox + Klik Baris/Kartu + Long-Press HP)
    const toggleItemSelectPrd = (id, rowEl) => {
      if (!id) return;
      const obj = items.find((x) => x.id === id);
      if (produkSelectedMap.has(id)) {
        produkSelectedMap.delete(id);
        rowEl?.classList.remove('is-bulk-selected');
      } else {
        if (obj) produkSelectedMap.set(id, obj);
        rowEl?.classList.add('is-bulk-selected');
      }
      const cb = rowEl?.querySelector('.cb-prd-select');
      if (cb) cb.checked = produkSelectedMap.has(id);
      syncProdukBulkBar(container, canEdit);
    };

    if (produkSelectMode) {
      area.querySelectorAll('.cb-prd-select').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          const id = cb.getAttribute('data-id');
          const rowEl = cb.closest('.prd-selectable-item');
          const obj = items.find((x) => x.id === id);
          if (cb.checked) {
            if (obj) produkSelectedMap.set(id, obj);
            rowEl?.classList.add('is-bulk-selected');
          } else {
            produkSelectedMap.delete(id);
            rowEl?.classList.remove('is-bulk-selected');
          }
          syncProdukBulkBar(container, canEdit);
        });
      });

      area.querySelectorAll('.prd-selectable-item').forEach((el) => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          if (e.target.closest('button, a, input, label')) return;
          toggleItemSelectPrd(el.getAttribute('data-prd-id'), el);
        });
      });
    } else {
      // Long-press (450ms) pada layar sentuh langsung mengaktifkan mode Tandai & Pilih
      area.querySelectorAll('.prd-selectable-item').forEach((el) => {
        let lpTimer = null;
        el.addEventListener('touchstart', (e) => {
          if (e.target.closest('button, a, input')) return;
          lpTimer = setTimeout(() => {
            const id = el.getAttribute('data-prd-id');
            const obj = items.find((x) => x.id === id);
            produkSelectMode = true;
            if (id && obj) produkSelectedMap.set(id, obj);
            syncProdukBulkBar(container, canEdit);
            muatProduk(container, canEdit, isKasir, false);
          }, 450);
        }, { passive: true });
        const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        el.addEventListener('touchend', clearLp, { passive: true });
        el.addEventListener('touchmove', clearLp, { passive: true });
        el.addEventListener('touchcancel', clearLp, { passive: true });
      });
    }
    syncProdukBulkBar(container, canEdit);

    // Pasang tombol aksi Ubah, Duplikat, Edit Cepat & Hapus
    if (canEdit) {
      area.querySelectorAll('.btn-quick-edit-prd').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const p = items.find((x) => x.id === id);
          if (p) bukaModalEditCepat(container, p);
        });
      });

      area.querySelectorAll('.btn-duplikat-prd').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const p = items.find((x) => x.id === id);
          if (p) bukaModalFormProduk(container, p, true);
        });
      });

      area.querySelectorAll('.btn-edit-prd').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const p = items.find((x) => x.id === id);
          if (p) bukaModalFormProduk(container, p, false);
        });
      });

      area.querySelectorAll('.btn-del-prd').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const nama = btn.getAttribute('data-nama');
          const setuju = await showConfirm({
            title: 'Hapus Produk',
            message: `Apakah Anda yakin ingin menghapus produk "${nama}"? Data stok dan riwayat akan tetap aman dalam arsip sistem.`,
            confirmText: 'Ya, Hapus Produk',
            danger: true
          });
          if (!setuju) return;

          try {
            await apiCall('produk.delete', { id });
            showToast('Produk berhasil dihapus.', 'success');
            await muatProduk(container, canEdit, isKasir);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    // Render kontrol paginasi tunggal yang rapi & bersih tanpa duplikasi tombol
    if (areaPaginasi) {
      const totalHal = Math.ceil(total / filterState.limit) || 1;
      areaPaginasi.innerHTML = `
        <div class="produk-pagination-bar">
          <div class="text-sm text-muted">
            Menampilkan <strong style="color: var(--text);">${items.length}</strong> dari <strong style="color: var(--text);">${total}</strong> barang
          </div>
          ${totalHal > 1 ? `
            <div class="pagination-controls">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-hal-sebelum" ${filterState.page <= 1 ? 'disabled' : ''}>
                ← Sebelumnya
              </button>
              <span class="pagination-page-indicator">
                ${filterState.page} / ${totalHal}
              </span>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-hal-berikut" ${filterState.page >= totalHal ? 'disabled' : ''}>
                Berikutnya →
              </button>
            </div>
          ` : ''}
        </div>
      `;

      $('#btn-hal-sebelum', areaPaginasi)?.addEventListener('click', () => {
        if (filterState.page > 1) {
          filterState.page--;
          muatProduk(container, canEdit, isKasir, false);
        }
      });
      $('#btn-hal-berikut', areaPaginasi)?.addEventListener('click', () => {
        if (filterState.page < totalHal) {
          filterState.page++;
          muatProduk(container, canEdit, isKasir, false);
        }
      });
    }
  } catch (err) {
    if (area) {
      area.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div><strong>Gagal Memuat Produk</strong>: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
}

function dapatkanBadgeStok(stok, stokMin) {
  const s = Number(stok) || 0;
  const min = Number(stokMin) || 0;
  if (s <= 0) return { kelas: 'badge-danger', teks: 'Habis' };
  if (s <= min) return { kelas: 'badge-warning', teks: 'Menipis' };
  return { kelas: 'badge-success', teks: 'Aman' };
}

function susunOpsiKategoriHtml(daftarKategori, selectedId = '', placeholder = '-- Tanpa Kategori --') {
  let html = `<option value="">${escapeHtml(placeholder)}</option>`;
  const parents = (daftarKategori || []).filter((k) => !k.parent_id);
  parents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

  const subsByParent = {};
  (daftarKategori || []).forEach((k) => {
    if (k.parent_id) {
      if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
      subsByParent[k.parent_id].push(k);
    }
  });

  parents.forEach((p) => {
    const subs = subsByParent[p.id] || [];
    subs.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

    if (subs.length > 0) {
      html += `<optgroup label="${escapeHtml(p.nama)}">`;
      const isParentSel = selectedId === p.id ? 'selected' : '';
      html += `<option value="${p.id}" ${isParentSel}>${escapeHtml(p.nama)} (Utama)</option>`;
      subs.forEach((c) => {
        const isChildSel = selectedId === c.id ? 'selected' : '';
        html += `<option value="${c.id}" ${isChildSel}>&nbsp;&nbsp;&nbsp;&nbsp;↳ ${escapeHtml(c.nama)}</option>`;
      });
      html += `</optgroup>`;
    } else {
      const isParentSel = selectedId === p.id ? 'selected' : '';
      html += `<option value="${p.id}" ${isParentSel}>${escapeHtml(p.nama)}</option>`;
    }
  });

  // Handle orphans jika ada
  const orphans = (daftarKategori || []).filter((k) => k.parent_id && !parents.some((p) => p.id === k.parent_id));
  if (orphans.length > 0) {
    html += `<optgroup label="Lainnya">`;
    orphans.forEach((o) => {
      const isOrphanSel = selectedId === o.id ? 'selected' : '';
      html += `<option value="${o.id}" ${isOrphanSel}>${escapeHtml(o.nama)}</option>`;
    });
    html += `</optgroup>`;
  }

  return html;
}

/**
 * Hitung digit checksum EAN-13 (modulo 10).
 */
function hitungChecksumEan13(str12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(str12.charAt(i), 10) || 0;
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const rem = sum % 10;
  return rem === 0 ? 0 : 10 - rem;
}

/**
 * Generate barcode 13-digit EAN-13 in-house retail (Prefix 20 + yyMMdd + 4-digit random + check digit).
 */
function generateEan13Barcode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd4 = String(Math.floor(1000 + Math.random() * 9000));
  const raw12 = '20' + yy + mm + dd + rnd4;
  const checksum = hitungChecksumEan13(raw12);
  return raw12 + String(checksum);
}

/**
 * Generate kode SKU otomatis: SKU-YYYYMMDD-XXXX
 */
function generateSkuCode(prefix = 'SKU') {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd4 = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${y}${m}${day}-${rnd4}`;
}

/**
 * Modal Panduan & Tata Cara Penggunaan Varian dan Satuan Kemasan
 */
export function bukaModalPanduanVarianSatuan() {
  const namaToko = store.getNamaToko ? store.getNamaToko() : 'POS Kasir Toko';
  showModal({
    title: 'Panduan & Tata Cara: Varian dan Satuan Kemasan',
    size: 'lg',
    body: `
      <div class="stack" style="gap: var(--sp-4);">
        <!-- Ringkasan Inti -->
        <div class="guide-callout">
          <div class="guide-callout-title">
            Perbedaan Utama: Kapan Pakai Varian? Kapan Pakai Satuan Kemasan?
          </div>
          <p class="text-sm text-muted">Keduanya memiliki fungsi yang berbeda dalam operasional toko bangunan:</p>
          <ul class="prose-list text-sm">
            <li><strong>Varian Produk:</strong> Digunakan jika barang memiliki <strong>karakteristik fisik atau spesifikasi berbeda</strong> sehingga stok fisiknya wajib dihitung terpisah di gudang (contoh: Pipa Tipe C vs Tipe D; Cat Putih 5kg vs Abu-abu 5kg).</li>
            <li><strong>Konversi Satuan Kemasan (Multi Satuan):</strong> Digunakan jika <strong>satu barang fisik yang sama persis</strong> dijual eceran maupun dalam kemasan grosir/dus/ikat/rol (contoh: Pipa dijual per Batang atau per Ikat; Semen per Sak atau per Truk).</li>
          </ul>
        </div>

        <!-- Tabel Perbandingan Komprehensif -->
        <div class="stack" style="gap: var(--sp-2);">
          <div class="fw-semibold text-md">Tabel Komparasi Fitur</div>
          <div class="table-wrap" style="border: 1px solid var(--border); border-radius: var(--radius-lg);">
            <table class="table table-guide">
              <thead>
                <tr>
                  <th style="width: 22%;">Aspek</th>
                  <th style="width: 39%;">Varian Produk (Warna / Ukuran / Tebal)</th>
                  <th style="width: 39%;">Konversi Satuan Kemasan (Multi Satuan)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Fungsi Utama</td>
                  <td data-label="Varian Produk">Membedakan jenis barang dengan spesifikasi berbeda.</td>
                  <td data-label="Multi Satuan">Menjual barang yang sama dalam kemasan grosir / partai besar.</td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Pengelolaan Stok</td>
                  <td data-label="Varian Produk"><strong>Terpisah per varian.</strong> Jika Cat Putih laku 1 kaleng, hanya stok Cat Putih yang berkurang.</td>
                  <td data-label="Multi Satuan"><strong>Satu stok fisik induk</strong> (satuan dasar). Jual 1 Ikat Pipa (isi 25 btg) otomatis memotong 25 btg dari stok pipa.</td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Barcode &amp; SKU</td>
                  <td data-label="Varian Produk">Tiap varian memiliki barcode dan SKU mandiri.</td>
                  <td data-label="Multi Satuan">Tiap kemasan bisa memiliki barcode kemasan tersendiri (misal barcode di kardus luar).</td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Contoh Kasus Toko Bangunan</td>
                  <td data-label="Varian Produk">
                    <ul class="prose-list text-xs" style="margin-top: 0;">
                      <li>Cat: <em>Putih 5kg</em>, <em>Krem 5kg</em>, <em>Abu-abu 5kg</em></li>
                      <li>Besi Beton: <em>8mm</em>, <em>10mm</em>, <em>12mm</em></li>
                      <li>Pipa PVC: <em>Tebal C</em>, <em>Tebal D</em>, <em>Tebal AW</em></li>
                    </ul>
                  </td>
                  <td data-label="Multi Satuan">
                    <ul class="prose-list text-xs" style="margin-top: 0;">
                      <li>Pipa: 1 Ikat = 25 Batang (Faktor: <code>25</code>)</li>
                      <li>Kabel: 1 Rol = 50 Meter (Faktor: <code>50</code>)</li>
                      <li>Semen: 1 Truk = 100 Sak (Faktor: <code>100</code>)</li>
                      <li>Keramik: 1 Dus = 1.44 m&sup2; (Faktor: <code>1.44</code>)</li>
                    </ul>
                  </td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Di Kasir POS</td>
                  <td data-label="Varian Produk">Kasir memilih varian saat item ditambahkan ke keranjang.</td>
                  <td data-label="Multi Satuan">Kasir dapat beralih satuan langsung di keranjang melalui badge <code>BTG</code>.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tata Cara 1: Varian Produk -->
        <div class="guide-card">
          <div class="guide-card-title">1. Tata Cara Mengatur Varian Produk</div>
          <ol class="prose-list text-sm">
            <li>Buka formulir Tambah/Ubah Produk, lalu pilih tab <strong>Varian &amp; Satuan</strong>.</li>
            <li>Aktifkan sakelar <strong>"Produk memiliki beberapa varian (Warna, Ukuran, Tebal)"</strong>.</li>
            <li>Klik tombol <strong>Varian</strong> untuk menambahkan baris varian baru.</li>
            <li>Isi <strong>Nama Varian</strong> sesuai spesifikasi barang (contoh: <code>Putih 5kg</code>, <code>Tebal Tipe C</code>, atau <code>10mm</code>).</li>
            <li>Kolom <strong>SKU Varian</strong> &amp; <strong>Barcode Varian</strong> boleh dikosongkan agar dibuat otomatis (EAN-13 standar retail).</li>
            <li>Isi <strong>Harga Jual Ritel</strong> dan <strong>Stok Awal</strong> fisik untuk masing-masing varian (total stok induk otomatis dijumlahkan).</li>
          </ol>
        </div>

        <!-- Tata Cara 2: Satuan Kemasan -->
        <div class="guide-card">
          <div class="guide-card-title">2. Tata Cara Mengatur Satuan Kemasan (Multi Satuan)</div>
          <ol class="prose-list text-sm">
            <li>Pastikan <strong>Satuan Dasar</strong> di Tab 1 (Informasi Dasar) sudah diisi (contoh: <code>BTG</code>, <code>MTR</code>, <code>PCS</code>, <code>SAK</code>, <code>KG</code>).</li>
            <li>Pada Tab <strong>Varian &amp; Satuan</strong> bagian Konversi Satuan Kemasan, klik tombol <strong>Satuan Kemasan</strong>.</li>
            <li>Isi <strong>Nama Kemasan</strong> (contoh: <code>IKAT</code>, <code>DUS</code>, <code>ROL</code>, <code>TRUK</code>, <code>LUSIN</code>).</li>
            <li>Isi <strong>Isi / Faktor</strong> dengan jumlah satuan dasar dalam 1 kemasan:
              <ul class="prose-list text-xs text-muted">
                <li>1 Ikat berisi 25 Batang pipa &rarr; Faktor = <code>25</code></li>
                <li>1 Rol kabel berisi 50 Meter &rarr; Faktor = <code>50</code></li>
                <li>1 Truk semen berisi 100 Sak &rarr; Faktor = <code>100</code></li>
              </ul>
            </li>
            <li>Isi <strong>Harga per Kemasan (Rp)</strong> untuk 1 kemasan utuh (disarankan lebih hemat dibanding beli eceran).</li>
          </ol>
        </div>

        <!-- Tips Kasir POS -->
        <div class="guide-callout">
          <div class="guide-callout-title">Tips Penggunaan di Kasir POS</div>
          <ul class="prose-list text-sm">
            <li>Kasir dapat menjual eceran maupun kemasan grosir secara fleksibel dalam satu transaksi.</li>
            <li>Untuk mengubah satuan barang di keranjang, cukup tekan badge satuan (misal <code>BTG</code> lalu pilih <code>IKAT</code>). Subtotal dihitung ulang dan stok fisik gudang otomatis terpotong sesuai faktor konversinya.</li>
          </ul>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; align-items: center;">
        <span class="text-xs text-muted">${escapeHtml(namaToko)}</span>
        <button type="button" class="btn btn-primary btn-sm btn-close-modal">Saya Mengerti</button>
      </div>
    `
  });
}

/**
 * Inisialisasi Searchable Category Combobox (Dropdown Kategori dengan Pencarian Cepat)
 * Menampilkan hirarki Induk > Sub, highlight pencarian, dan integrasi input hidden #prd-kategori
 */
function initSearchableCategoryPicker(modalEl, daftarKategori = [], initialId = '') {
  const wrap = $('#cat-picker-wrap', modalEl);
  if (!wrap) return;

  const inputHidden = $('#prd-kategori', modalEl);
  const btnTrigger = $('#cat-picker-btn', modalEl);
  const lblTrigger = $('#cat-picker-label', modalEl);
  const btnClear = $('#cat-picker-clear', modalEl);
  const dropdown = $('#cat-picker-dropdown', modalEl);
  const searchInput = $('#cat-picker-search', modalEl);
  const listEl = $('#cat-picker-list', modalEl);

  const katMap = new Map();
  (daftarKategori || []).forEach((k) => katMap.set(k.id, k));

  const parents = (daftarKategori || []).filter((k) => !k.parent_id);
  parents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

  const subsByParent = {};
  (daftarKategori || []).forEach((k) => {
    if (k.parent_id) {
      if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
      subsByParent[k.parent_id].push(k);
    }
  });
  Object.keys(subsByParent).forEach((pid) => {
    subsByParent[pid].sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));
  });

  const orphans = (daftarKategori || []).filter((k) => k.parent_id && !katMap.has(k.parent_id));

  function getCategoryDisplay(id) {
    if (!id || !katMap.has(id)) return '-- Tanpa Kategori --';
    const k = katMap.get(id);
    if (k.parent_id && katMap.has(k.parent_id)) {
      const parent = katMap.get(k.parent_id);
      return `${parent.nama} > ${k.nama}`;
    }
    return k.nama;
  }

  function updateSelected(id) {
    inputHidden.value = id || '';
    if (id && katMap.has(id)) {
      lblTrigger.textContent = getCategoryDisplay(id);
      lblTrigger.classList.remove('text-muted');
      if (btnClear) btnClear.style.display = 'inline-flex';
    } else {
      inputHidden.value = '';
      lblTrigger.textContent = '-- Tanpa Kategori --';
      lblTrigger.classList.add('text-muted');
      if (btnClear) btnClear.style.display = 'none';
    }
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark style="background: var(--primary-soft); color: var(--primary-soft-text); padding: 0 3px; border-radius: 3px; font-weight: var(--fw-semibold);">$1</mark>');
  }

  function renderList(query = '') {
    const q = (query || '').trim().toLowerCase();
    const currentId = inputHidden.value;
    let html = '';

    // Opsi: Tanpa Kategori
    if (!q || '-- tanpa kategori --'.includes(q) || 'tanpa kategori'.includes(q)) {
      const isSel = !currentId;
      html += `
        <div class="cat-picker-item ${isSel ? 'is-selected' : ''}" data-id="" role="option" aria-selected="${isSel}">
          <span class="cat-picker-item-icon" style="color: var(--text-muted);">${ICONS.tag}</span>
          <span class="grow" style="font-style: italic; color: var(--text-muted);">-- Tanpa Kategori --</span>
          ${isSel ? `<span class="cat-picker-check">${ICONS.check}</span>` : ''}
        </div>
      `;
    }

    let matchCount = 0;

    parents.forEach((p) => {
      const pNama = String(p.nama || '');
      const pMatches = !q || pNama.toLowerCase().includes(q);
      const subs = subsByParent[p.id] || [];
      const matchingSubs = subs.filter((s) => !q || String(s.nama || '').toLowerCase().includes(q));

      if (pMatches || matchingSubs.length > 0) {
        matchCount++;
        const isParentSel = currentId === p.id;
        html += `
          <div class="cat-picker-item is-parent ${isParentSel ? 'is-selected' : ''}" data-id="${p.id}" role="option" aria-selected="${isParentSel}">
            <span class="cat-picker-item-icon" style="color: var(--primary);">${ICONS.folder}</span>
            <span class="grow fw-semibold">${highlightMatch(pNama, q)} <span class="badge badge-subtle text-2xs" style="margin-left: 4px; font-weight: normal;">Utama</span></span>
            ${isParentSel ? `<span class="cat-picker-check">${ICONS.check}</span>` : ''}
          </div>
        `;

        const subsToShow = q ? (pMatches ? subs : matchingSubs) : subs;
        subsToShow.forEach((s) => {
          matchCount++;
          const sNama = String(s.nama || '');
          const isSubSel = currentId === s.id;
          html += `
            <div class="cat-picker-item is-sub ${isSubSel ? 'is-selected' : ''}" data-id="${s.id}" role="option" aria-selected="${isSubSel}">
              <span class="cat-picker-indent">↳</span>
              <span class="cat-picker-item-icon" style="color: var(--text-muted);">${ICONS.tag}</span>
              <span class="grow">${highlightMatch(sNama, q)}</span>
              ${isSubSel ? `<span class="cat-picker-check">${ICONS.check}</span>` : ''}
            </div>
          `;
        });
      }
    });

    if (orphans.length > 0) {
      orphans.forEach((o) => {
        const oNama = String(o.nama || '');
        if (!q || oNama.toLowerCase().includes(q)) {
          matchCount++;
          const isSel = currentId === o.id;
          html += `
            <div class="cat-picker-item ${isSel ? 'is-selected' : ''}" data-id="${o.id}" role="option" aria-selected="${isSel}">
              <span class="cat-picker-item-icon" style="color: var(--text-muted);">${ICONS.tag}</span>
              <span class="grow">${highlightMatch(oNama, q)}</span>
              ${isSel ? `<span class="cat-picker-check">${ICONS.check}</span>` : ''}
            </div>
          `;
        }
      });
    }

    if (matchCount === 0 && q) {
      html = `<div class="cat-picker-empty">Tidak ada kategori yang cocok dengan "${escapeHtml(q)}"</div>`;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.cat-picker-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = item.getAttribute('data-id') || '';
        updateSelected(id);
        closeDropdown();
        btnTrigger?.focus();
      });
    });
  }

  const scrollParent = wrap.closest('.dialog-body') || modalEl;

  function positionDropdown() {
    if (!wrap.classList.contains('is-open') || !btnTrigger) return;
    const rect = btnTrigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    // Lebar leluasa agar nama kategori Induk > Sub panjang terbaca penuh
    const desiredW = vw <= 640
      ? Math.min(vw - margin * 2, 480)
      : Math.max(rect.width, Math.min(460, vw - margin * 2));

    let left = rect.left;
    if (left + desiredW > vw - margin) {
      left = Math.max(margin, vw - margin - desiredW);
    }
    if (left < margin) left = margin;

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const idealH = 400;

    dropdown.style.position = 'fixed';
    dropdown.style.width = `${Math.round(desiredW)}px`;
    dropdown.style.left = `${Math.round(left)}px`;
    dropdown.style.right = 'auto';
    dropdown.style.zIndex = '2050';

    // Pilih sisi yang paling lega (bawah atau atas) agar tidak pernah terpotong dialog-body
    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
      const availH = Math.min(idealH, Math.max(220, spaceBelow - 6));
      dropdown.style.top = `${Math.round(rect.bottom + 6)}px`;
      dropdown.style.bottom = 'auto';
      dropdown.style.maxHeight = `${Math.round(availH)}px`;
    } else {
      const availH = Math.min(idealH, Math.max(220, spaceAbove - 6));
      dropdown.style.top = 'auto';
      dropdown.style.bottom = `${Math.round(vh - rect.top + 6)}px`;
      dropdown.style.maxHeight = `${Math.round(availH)}px`;
    }
  }

  function openDropdown() {
    // Pindahkan dropdown ke document.body agar bebas dari clipping overflow dialog-body & footer
    if (dropdown.parentElement !== document.body) {
      document.body.appendChild(dropdown);
    }
    wrap.classList.add('is-open');
    dropdown.classList.add('is-floating');
    dropdown.style.display = 'flex';
    btnTrigger?.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    renderList('');
    positionDropdown();
    setTimeout(() => {
      const activeItem = listEl.querySelector('.cat-picker-item.is-selected');
      activeItem?.scrollIntoView({ block: 'nearest' });
      searchInput?.focus();
    }, 30);
  }

  function closeDropdown() {
    wrap.classList.remove('is-open');
    dropdown.classList.remove('is-floating');
    dropdown.style.display = 'none';
    btnTrigger?.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown() {
    if (wrap.classList.contains('is-open')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  btnTrigger?.addEventListener('click', (e) => {
    if (e.target.closest('#cat-picker-clear')) return;
    toggleDropdown();
  });

  btnTrigger?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openDropdown();
    }
  });

  btnClear?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateSelected('');
    renderList(searchInput?.value || '');
  });

  searchInput?.addEventListener('input', () => {
    renderList(searchInput.value);
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDropdown();
      btnTrigger?.focus();
    }
  });

  const onDocClick = (e) => {
    if (!wrap.contains(e.target) && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  };
  const onReposition = () => positionDropdown();

  document.addEventListener('click', onDocClick);
  window.addEventListener('resize', onReposition);
  scrollParent?.addEventListener('scroll', onReposition, { passive: true });

  const observer = new MutationObserver((mutations, obs) => {
    if (!document.body.contains(wrap)) {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('resize', onReposition);
      scrollParent?.removeEventListener('scroll', onReposition);
      dropdown.remove();
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  updateSelected(initialId);
}

/**
 * Modal Edit Cepat Produk (Quick Edit Modal)
 * Fokus pada HPP, Harga Jual Ritel, Grosir, Batas Stok Minimum & Status
 */
function bukaModalEditCepat(container, p) {
  if (!p) return;

  const bodyHtml = `
    <form id="form-quick-edit" class="stack" novalidate style="gap: var(--sp-3);">
      <div class="alert alert-subtle" style="padding: var(--sp-2) var(--sp-3); display: flex; align-items: center; justify-content: space-between; border-radius: var(--radius-md); background: var(--surface-2); border: 1px solid var(--border);">
        <div style="min-width: 0; flex: 1; padding-right: 8px;">
          <div class="fw-bold text-sm" style="word-break: break-word;">${escapeHtml(p.nama)}</div>
          <div class="text-2xs text-muted mono" style="margin-top: 2px;">
            ${escapeHtml(p.sku || '-')} &bull; Satuan: <span class="fw-bold text-primary">${escapeHtml(p.satuan_dasar)}</span>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-xs text-primary btn-ke-form-lengkap" style="flex-shrink: 0; font-size: 11px;">
          Form Lengkap &nearr;
        </button>
      </div>

      <!-- HPP (Harga Modal Acuan) -->
      <div class="field">
        <div class="hpp-field-head">
          <label class="field-label" for="qe-hpp" style="margin-bottom: 0;">HPP (Harga Modal Pokok)</label>
          ${renderKalkulatorHppToggle('qe')}
        </div>
        <div class="input-prefix">
          <span>Rp</span>
          <input type="text" class="input input-num fw-bold" id="qe-hpp" value="${formatRupiah(p.hpp, false)}" placeholder="0">
        </div>
        <span class="field-hint">Harga modal acuan untuk menghitung margin keuntungan.</span>
        ${renderKalkulatorHppPanel('qe', p.satuan_dasar || 'PCS')}
      </div>

      <!-- Harga Jual Ritel & Live Margin -->
      <div class="field">
        <div class="row-between items-center" style="margin-bottom: 2px;">
          <label class="field-label" for="qe-ritel" style="margin-bottom: 0;">Harga Jual Ritel (Rp) <span class="wajib">*</span></label>
          <span id="qe-badge-margin" class="badge badge-success text-2xs font-mono">Margin: 0%</span>
        </div>
        <div class="input-prefix">
          <span>Rp</span>
          <input type="text" class="input input-num fw-bold text-primary" id="qe-ritel" value="${formatRupiah(p.harga_ritel, false)}" placeholder="0" data-autofocus>
        </div>
      </div>

      <!-- Harga Jual Grosir & Minimal Qty -->
      <div class="form-grid cols-2" style="gap: var(--sp-2);">
        <div class="field">
          <label class="field-label" for="qe-grosir">Harga Jual Grosir (Rp)</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-num" id="qe-grosir" value="${formatRupiah(p.harga_grosir || p.harga_ritel, false)}" placeholder="0">
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="qe-min-grosir">Min Pembelian Grosir</label>
          <div class="input-suffix">
            <input type="number" class="input input-num" id="qe-min-grosir" value="${p.min_grosir_qty || 1}" min="1">
            <span class="text-xs uppercase" style="font-weight: 600;">${escapeHtml(p.satuan_dasar)}</span>
          </div>
        </div>
      </div>

      <!-- Batas Stok Minimum & Status Aktif -->
      <div class="form-grid cols-2" style="gap: var(--sp-2); align-items: flex-end;">
        <div class="field">
          <label class="field-label" for="qe-stok-min">Batas Stok Minimum</label>
          <input type="number" class="input input-num" id="qe-stok-min" value="${p.stok_min !== undefined ? p.stok_min : 0}">
          <span class="field-hint">Peringatan stok menipis jika stok di bawah batas ini.</span>
        </div>
        <div class="field" style="padding-bottom: 8px;">
          <label class="switch">
            <input type="checkbox" id="qe-aktif" ${p.aktif !== false ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Status Produk Aktif</span>
          </label>
        </div>
      </div>

      <!-- Footer Tombol -->
      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-2);">
        <button type="button" class="btn btn-ghost btn-close-modal" id="btn-batal-qe">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-qe">Simpan Perubahan</button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: 'Edit Cepat Produk',
    body: bodyHtml,
    size: 'md'
  });

  const form = $('#form-quick-edit', modal.el);
  const inputHpp = $('#qe-hpp', form);
  const inputRitel = $('#qe-ritel', form);
  const inputGrosir = $('#qe-grosir', form);
  const marginBadge = $('#qe-badge-margin', form);

  const formatInputRp = (el) => {
    el.addEventListener('input', () => {
      const val = parseRupiah(el.value);
      el.value = formatRupiah(val, false);
      updateMarginBadge();
    });
  };
  formatInputRp(inputHpp);
  formatInputRp(inputRitel);
  formatInputRp(inputGrosir);

  ikatKalkulatorHpp({
    root: form,
    prefix: 'qe',
    inputHppEl: inputHpp,
    getSatuan: () => p.satuan_dasar || 'PCS'
  });

  function updateMarginBadge() {
    const hpp = parseRupiah(inputHpp.value) || 0;
    const ritel = parseRupiah(inputRitel.value) || 0;
    if (hpp > 0 && ritel > 0) {
      const laba = ritel - hpp;
      const margin = ((laba / ritel) * 100).toFixed(1);
      marginBadge.textContent = `Margin: ${margin}% | Laba: ${formatRupiah(laba)}`;
      marginBadge.className = laba < 0 ? 'badge badge-danger text-2xs font-mono' : 'badge badge-success text-2xs font-mono';
    } else {
      marginBadge.textContent = 'Margin: -';
      marginBadge.className = 'badge badge-subtle text-2xs font-mono';
    }
  }
  updateMarginBadge();

  $('.btn-ke-form-lengkap', form)?.addEventListener('click', () => {
    modal.close();
    bukaModalFormProduk(container, p);
  });

  $('#btn-batal-qe', form)?.addEventListener('click', () => modal.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hpp = parseRupiah(inputHpp.value);
    const harga_ritel = parseRupiah(inputRitel.value);
    const harga_grosir = parseRupiah(inputGrosir.value) || harga_ritel;
    const min_grosir_qty = parseFloat($('#qe-min-grosir', form).value) || 1;
    const stok_min = parseFloat($('#qe-stok-min', form).value) || 0;
    const aktif = $('#qe-aktif', form).checked;

    if (harga_ritel <= 0) {
      inputRitel.focus();
      showToast('Harga jual ritel wajib diisi dan harus lebih dari 0!', 'error');
      return;
    }

    if (hpp > 0 && harga_ritel < hpp) {
      const setujuRugi = await showConfirm({
        title: 'Peringatan Harga di Bawah HPP',
        message: `Harga jual ritel (${formatRupiah(harga_ritel)}) lebih rendah dari HPP modal (${formatRupiah(hpp)}). Apakah Anda yakin ingin melanjutkan?`,
        confirmText: 'Ya, Lanjutkan',
        danger: true
      });
      if (!setujuRugi) return;
    }

    const btnSimpan = $('#btn-simpan-qe', form);
    btnSimpan.disabled = true;
    btnSimpan.textContent = 'Menyimpan...';

    try {
      await apiCall('produk.update', {
        ...p,
        hpp,
        harga_ritel,
        harga_grosir,
        min_grosir_qty,
        stok_min,
        aktif
      });
      showToast('Harga & data produk berhasil diperbarui.', 'success');
      modal.close();
      const canEdit = store.get('user')?.role !== 'kasir';
      const isKasir = store.get('user')?.role === 'kasir';
      await muatProduk(container, canEdit, isKasir);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan perubahan produk.', 'error');
      btnSimpan.disabled = false;
      btnSimpan.textContent = 'Simpan Perubahan';
    }
  });
}

/**
 * Modal Form Tambah / Edit Produk Lengkap (Mendukung Fitur Duplikat Produk)
 */
async function bukaModalFormProduk(container, produk, isDuplikat = false) {
  const isEdit = !isDuplikat && !!produk;
  let isSubmitting = false;
  let daftarKategori = [];
  try {
    const kRes = await apiCall('kategori.list', {});
    daftarKategori = kRes.items || [];
  } catch (e) { }

  const pData = isDuplikat && produk ? {
    ...produk,
    id: undefined,
    nama: `${produk.nama || ''} (Salinan)`.trim(),
    sku: '',
    barcode: '',
    stok: 0,
    foto_url: produk.foto_url || '',
    varian: Array.isArray(produk.varian) ? produk.varian.map((v) => ({
      ...v,
      id: undefined,
      sku: '',
      barcode: '',
      stok: 0
    })) : [],
    satuan_konversi: Array.isArray(produk.satuan_konversi) ? produk.satuan_konversi.map((s) => ({
      ...s,
      id: undefined,
      barcode: ''
    })) : []
  } : (produk || null);

  const hasData = isEdit || isDuplikat;

  const bodyHtml = `
    <form id="form-produk" class="stack" novalidate>
      <!-- Navigasi Tab Form -->
      <div class="segmented" id="tab-form-produk" style="width: 100%;">
        <button type="button" class="grow" data-tab="dasar" aria-pressed="true">Informasi Dasar</button>
        <button type="button" class="grow" data-tab="harga" aria-pressed="false">Harga & Stok</button>
        <button type="button" class="grow" data-tab="varian" aria-pressed="false">Varian & Satuan</button>
      </div>

      <!-- Tab 1: Dasar -->
      <div class="tab-pane stack" id="pane-dasar">
        <!-- Foto Produk (Google Drive) -->
        <div class="field" style="margin-bottom: var(--sp-2);">
          <label class="field-label">Foto Produk (Google Drive)</label>
          <div class="row items-center" style="gap: var(--sp-3); flex-wrap: wrap;">
            <!-- Box Preview Foto (1:1 Square) -->
            <div id="prd-foto-preview-box" style="width: 90px; height: 90px; border-radius: var(--radius-lg); border: 2px dashed var(--border); display: grid; place-items: center; overflow: hidden; background: var(--surface-2); position: relative; flex-shrink: 0;">
              <img src="${hasData && pData.foto_url ? escapeHtml(pData.foto_url) : ''}" alt="Foto" id="prd-foto-img-preview" style="width: 100%; height: 100%; object-fit: cover; ${hasData && pData.foto_url ? '' : 'display: none;'}">
              <div id="prd-foto-placeholder" style="text-align: center; color: var(--text-muted); ${hasData && pData.foto_url ? 'display: none;' : ''}">
                <span class="icon-fit" style="width: 26px; height: 26px;">${ICONS.image}</span>
                <div style="font-size: 9px; margin-top: 2px;">Belum Ada</div>
              </div>
              <div id="prd-foto-loading" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.65); place-items: center; color: #fff; font-size: 11px; font-weight: 500;">
                <span class="spinner-sm" style="border-color: #fff; border-top-color: transparent;"></span>
              </div>
            </div>

            <!-- Tombol Aksi Upload & Input Tersembunyi -->
            <div class="stack" style="gap: var(--sp-1); flex: 1; min-width: 200px;">
              <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-pilih-foto" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.image}
                  <span>Pilih Galeri</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-kamera-foto" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.camera}
                  <span>Kamera</span>
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger" id="btn-hapus-foto" style="${hasData && pData.foto_url ? '' : 'display: none;'} display: inline-flex; align-items: center; gap: 4px;">
                  ${ICONS.trash}
                  <span>Hapus</span>
                </button>
              </div>
              <input type="file" id="input-file-foto" accept="image/*" style="display: none;">
              <input type="file" id="input-kamera-foto" accept="image/*" capture="environment" style="display: none;">
              <input type="hidden" id="prd-foto-url" value="${hasData && pData.foto_url ? escapeHtml(pData.foto_url) : ''}">
              <span class="field-hint" id="prd-foto-hint">Tersimpan di Google Drive Toko Anda (otomatis dikompres &lt; 150 KB).</span>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="prd-nama">Nama Produk <span class="wajib">*</span></label>
          <input type="text" class="input" id="prd-nama" value="${hasData ? escapeHtml(pData.nama || '') : ''}" placeholder="Cth: Semen Padang 50kg, Cat Dulux Pentalite 2.5L" data-autofocus>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <div class="row items-center justify-between" style="margin-bottom: 4px;">
              <label class="field-label" for="prd-sku" style="margin-bottom: 0;">Kode SKU</label>
              <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-sku" title="Buat SKU Otomatis" style="padding: 2px 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">${ICONS.sparkles}<span>Auto</span></button>
            </div>
            <input type="text" class="input mono uppercase" id="prd-sku" value="${isEdit ? escapeHtml(pData.sku || '') : ''}" placeholder="Auto (cth: SKU-20261113-0001)">
            <span class="field-hint">Kosongkan jika ingin dibuat otomatis</span>
          </div>
          <div class="field">
            <div class="row items-center justify-between" style="margin-bottom: 4px;">
              <label class="field-label" for="prd-barcode" style="margin-bottom: 0;">Barcode</label>
              <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-barcode" title="Buat Barcode EAN-13 Otomatis" style="padding: 2px 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">${ICONS.sparkles}<span>Auto</span></button>
            </div>
            <input type="text" class="input mono" id="prd-barcode" value="${isEdit ? escapeHtml(pData.barcode || '') : ''}" placeholder="Auto (13 digit EAN-13)">
            <span class="field-hint">Kosongkan jika ingin dibuat otomatis</span>
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="cat-picker-btn">Kategori</label>
            <div class="cat-picker-container" id="cat-picker-wrap">
              <input type="hidden" id="prd-kategori" name="kategori_id" value="${hasData ? escapeHtml(pData.kategori_id || '') : ''}">
              <div class="cat-picker-trigger" id="cat-picker-btn" tabindex="0" role="combobox" aria-haspopup="listbox" aria-expanded="false" title="Pilih Kategori Produk">
                <span class="cat-picker-icon">${ICONS.tag}</span>
                <span class="cat-picker-label grow" id="cat-picker-label">-- Tanpa Kategori --</span>
                <button type="button" class="cat-picker-clear" id="cat-picker-clear" title="Hapus Kategori" style="display: none;" aria-label="Hapus Kategori">
                  ${ICONS.x}
                </button>
                <span class="cat-picker-arrow">${ICONS.chevronDown}</span>
              </div>
              <div class="cat-picker-dropdown" id="cat-picker-dropdown" style="display: none;">
                <div class="cat-picker-search-wrap">
                  <span class="input-icon">${ICONS.search}</span>
                  <input type="text" class="input input-sm cat-picker-search-input" id="cat-picker-search" placeholder="Cari kategori atau sub..." autocomplete="off">
                </div>
                <div class="cat-picker-list" id="cat-picker-list" role="listbox">
                  <!-- Diisi secara dinamis -->
                </div>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="prd-satuan">Satuan Dasar <span class="wajib">*</span></label>
            <input type="text" class="input uppercase" id="prd-satuan" value="${hasData ? escapeHtml((pData.satuan_dasar || 'PCS').toUpperCase()) : 'PCS'}" placeholder="Cth: SAK, KG, DUS, BATANG, METER, PCS">
          </div>
        </div>

        <div class="field">
          <label class="switch">
            <input type="checkbox" id="prd-aktif" ${!hasData || pData.aktif ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Status Produk Aktif (dapat dijual di kasir)</span>
          </label>
        </div>
      </div>

      <!-- Tab 2: Harga & Stok -->
      <div class="tab-pane stack hidden" id="pane-harga">
        <!-- Input HPP (Harga Modal Acuan) -->
        <div class="field">
          <div class="hpp-field-head">
            <label class="field-label" for="prd-hpp" style="margin-bottom: 0;">
              <span>HPP (Harga Beli Pokok / Modal) <span class="wajib">*</span></span>
            </label>
            ${renderKalkulatorHppToggle('prd')}
          </div>
          <div class="input-prefix" style="max-width: 320px;">
            <span>Rp</span>
            <input type="text" class="input input-num fw-bold" id="prd-hpp" value="${hasData ? formatRupiah(pData.hpp, false) : '0'}" placeholder="0">
          </div>
          <span class="field-hint">Dasar acuan perhitungan persentase margin keuntungan ritel dan grosir.</span>
          ${renderKalkulatorHppPanel('prd', hasData ? (pData.satuan_dasar || 'PCS') : 'PCS')}
        </div>

        <div class="divider"></div>

        <!-- 1. Kalkulator Otomatis Margin & Harga Ritel (Eceran) -->
        <div class="card card-body stack" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); gap: var(--sp-2);">
          <div class="row-between items-center" style="flex-wrap: wrap; gap: var(--sp-1);">
            <div>
              <span class="fw-bold text-sm" style="color: var(--primary);">1. Harga Jual Ritel (Eceran)</span>
              <div class="text-xs text-muted">Penjualan umum per satuan dasar ke konsumen</div>
            </div>
            <div id="badge-margin-ritel" class="badge badge-success text-xs font-mono">
              Margin: 0% | Laba: Rp 0
            </div>
          </div>

          <div class="form-grid cols-2" style="gap: var(--sp-3); margin-top: 4px;">
            <div class="field">
              <label class="field-label" for="prd-margin-ritel">
                <span>Margin Keuntungan Ritel (%)</span>
              </label>
              <div class="input-prefix">
                <span>%</span>
                <input type="number" step="0.1" class="input input-num fw-semibold" id="prd-margin-ritel" placeholder="Cth: 20">
              </div>
              <!-- Chip Preset Cepat Margin Ritel -->
              <div class="cluster" style="gap: 4px; margin-top: 4px;">
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="10">+10%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="15">+15%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="20">+20%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="25">+25%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="30">+30%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="50">+50%</button>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="prd-ritel">
                <span>Harga Jual Ritel (Rp) <span class="wajib">*</span></span>
              </label>
              <div class="input-prefix">
                <span>Rp</span>
                <input type="text" class="input input-num fw-bold text-md" id="prd-ritel" value="${hasData ? formatRupiah(pData.harga_ritel, false) : '0'}">
              </div>
              <span class="field-hint">Ketik harga langsung atau tentukan persen di sebelah kiri.</span>
            </div>
          </div>
        </div>

        <!-- 2. Kalkulator Otomatis Margin & Harga Grosir (Partai / Tukang) -->
        <div class="card card-body stack" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); gap: var(--sp-2); margin-top: var(--sp-1);">
          <div class="row-between items-center" style="flex-wrap: wrap; gap: var(--sp-1);">
            <div>
              <span class="fw-bold text-sm" style="color: var(--warning-text);">2. Harga Jual Grosir (Partai / Tukang)</span>
              <div class="text-xs text-muted">Harga khusus belanja borongan proyek atau mitra rekanan</div>
            </div>
            <div id="badge-margin-grosir" class="badge badge-warning text-xs font-mono">
              Margin: 0% | Laba: Rp 0
            </div>
          </div>

          <div class="form-grid cols-2" style="gap: var(--sp-3); margin-top: 4px;">
            <div class="field">
              <label class="field-label" for="prd-margin-grosir">
                <span>Margin Keuntungan Grosir (%)</span>
              </label>
              <div class="input-prefix">
                <span>%</span>
                <input type="number" step="0.1" class="input input-num fw-semibold" id="prd-margin-grosir" placeholder="Cth: 10">
              </div>
              <!-- Chip Preset Cepat Margin Grosir -->
              <div class="cluster" style="gap: 4px; margin-top: 4px;">
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="5">+5%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="8">+8%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="10">+10%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="12">+12%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="15">+15%</button>
              </div>
            </div>

            <div class="form-grid cols-2" style="gap: var(--sp-2);">
              <div class="field">
                <label class="field-label" for="prd-grosir">
                  <span>Harga Grosir (Rp)</span>
                </label>
                <div class="input-prefix">
                  <span>Rp</span>
                  <input type="text" class="input input-num fw-semibold" id="prd-grosir" value="${hasData && pData.harga_grosir ? formatRupiah(pData.harga_grosir, false) : ''}" placeholder="Sama dg ritel">
                </div>
              </div>

              <div class="field">
                <label class="field-label" for="prd-min-grosir">
                  <span>Min. Qty Grosir</span>
                </label>
                <input type="number" class="input input-num" id="prd-min-grosir" value="${hasData ? pData.min_grosir_qty || 1 : 1}" min="1">
              </div>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-stok">${isEdit ? 'Stok Sistem Saat Ini' : 'Stok Awal Fisik'}</label>
            <input type="number" step="0.001" class="input input-num" id="prd-stok" value="${isEdit ? pData.stok || 0 : 0}" ${isEdit ? 'disabled' : ''}>
            ${isEdit ? '<span class="field-hint">Gunakan modul Stok Opname / Pembelian untuk mengubah stok produk yang sudah ada.</span>' : ''}
          </div>

          <div class="field">
            <label class="field-label" for="prd-stok-min">Batas Stok Minimum</label>
            <input type="number" class="input input-num" id="prd-stok-min" value="${hasData ? (pData.stok_min !== undefined && pData.stok_min !== null ? pData.stok_min : 0) : 0}">
            <span class="field-hint">Peringatan stok menipis muncul jika saldo di bawah batas ini.</span>
          </div>
        </div>
      </div>

      <!-- Tab 3: Varian & Satuan -->
      <div class="tab-pane stack hidden" id="pane-varian">
        <!-- Kotak Ringkasan Panduan & Tata Cara -->
        <div class="guide-callout">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed var(--border-strong);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-flex; align-items: center; color: var(--primary);">${ICONS.info}</span>
              <span class="fw-semibold text-xs" style="color: var(--primary);">Tata Cara Penggunaan Varian &amp; Satuan Kemasan</span>
            </div>
            <button type="button" class="btn btn-secondary btn-xs" id="btn-buka-panduan-lengkap-varian">
              Buka Panduan Lengkap &raquo;
            </button>
          </div>
          <ul class="prose-list text-xs" style="margin-top: 0;">
            <li><strong>1. Varian Produk:</strong> Gunakan jika barang punya spesifikasi fisik berbeda yang stoknya dihitung terpisah (contoh: Pipa <em>Tebal C</em> &amp; <em>Tebal D</em>; Cat <em>Putih 5kg</em> &amp; <em>Abu 5kg</em>; Besi <em>8mm</em> &amp; <em>10mm</em>).</li>
            <li><strong>2. Satuan Kemasan (Multi Satuan):</strong> Gunakan jika 1 barang fisik dijual eceran maupun kemasan grosir (contoh: <code>BTG</code> &rarr; <code>1 IKAT = 25 BTG</code>; <code>MTR</code> &rarr; <code>1 ROL = 50 MTR</code>; <code>SAK</code> &rarr; <code>1 TRUK = 100 SAK</code>).</li>
          </ul>
        </div>

        <div class="field">
          <label class="switch">
            <input type="checkbox" id="prd-punya-varian" ${hasData && pData.punya_varian ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Produk memiliki beberapa varian (Warna, Ukuran, Tebal)</span>
          </label>
        </div>

        <div id="area-input-varian" class="stack ${hasData && pData.punya_varian ? '' : 'hidden'}">
          <div class="row-between">
            <span class="section-title">Daftar Varian Produk</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tambah-baris-varian">${ICONS.plus}<span>Varian</span></button>
          </div>
          <span class="field-hint">Tiap varian memiliki nama spesifikasi, barcode, harga ritel, dan stok fisik tersendiri.</span>
          <div id="wadah-varian" class="stack-sm"></div>
        </div>

        <div class="divider"></div>

        <div class="stack" style="padding-bottom: var(--sp-2);">
          <div class="row-between">
            <span class="section-title">Konversi Satuan Kemasan (Multi Satuan)</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tambah-baris-satuan">${ICONS.plus}<span>Satuan Kemasan</span></button>
          </div>
          <span class="field-hint">Tentukan kemasan grosir/dus/ikat/rol untuk memudahkan kasir menjual dalam jumlah besar. Contoh: 1 Dus = 24 pcs, 1 Truk = 100 sak, 1 Ikat = 25 btg.</span>
          <div id="wadah-satuan" class="stack-sm"></div>
        </div>
      </div>
    </form>
  `;

  const footerHtml = `
    <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
      <button type="button" class="btn btn-secondary btn-close-modal" id="btn-batal-produk">Batal</button>
      <button type="submit" form="form-produk" class="btn btn-primary" id="btn-simpan-produk">
        ${isDuplikat ? 'Simpan Produk Salinan' : (isEdit ? 'Simpan Perubahan' : 'Tambah Produk')}
      </button>
    </div>
  `;

  let modalTitle = 'Tambah Produk Baru';
  if (isDuplikat) {
    modalTitle = `Duplikat Produk: ${escapeHtml(produk?.nama || '')}`;
  } else if (isEdit) {
    modalTitle = 'Ubah Data Produk';
  }

  const modal = showModal({
    title: modalTitle,
    body: bodyHtml,
    footer: footerHtml,
    size: 'lg'
  });

  const form = $('#form-produk', modal.el);

  // Inisialisasi Searchable Category Combobox (Dropdown dengan Pencarian Cepat)
  initSearchableCategoryPicker(modal.el, daftarKategori, hasData ? (pData.kategori_id || '') : '');

  // Tombol Batal Form Produk
  $('#btn-batal-produk', modal.el)?.addEventListener('click', () => {
    modal.close();
  });

  // Tab switching helper
  const switchTab = (target) => {
    $('#tab-form-produk', modal.el)?.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-tab') === target);
    });
    $('.tab-pane#pane-dasar', modal.el)?.classList.toggle('hidden', target !== 'dasar');
    $('.tab-pane#pane-harga', modal.el)?.classList.toggle('hidden', target !== 'harga');
    $('.tab-pane#pane-varian', modal.el)?.classList.toggle('hidden', target !== 'varian');
  };

  $('#tab-form-produk', modal.el)?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  // Toggle punya varian
  const checkVarian = $('#prd-punya-varian', form);
  const areaVarian = $('#area-input-varian', form);
  checkVarian?.addEventListener('change', () => {
    areaVarian.classList.toggle('hidden', !checkVarian.checked);
  });

  // Format ribuan otomatis pada input HPP & Ritel
  const formatInputRp = (el) => {
    el.addEventListener('input', () => {
      const val = parseRupiah(el.value);
      el.value = formatRupiah(val, false);
    });
  };
  formatInputRp($('#prd-hpp', form));
  formatInputRp($('#prd-ritel', form));
  formatInputRp($('#prd-grosir', form));

  // -------------------------------------------------------------
  // Kalkulator Otomatis Persentase Margin & Laba (2-Arah)
  // -------------------------------------------------------------
  const inpHpp = $('#prd-hpp', form);
  const inpSatuanForm = $('#prd-satuan', form);
  const hppCalcPrd = ikatKalkulatorHpp({
    root: form,
    prefix: 'prd',
    inputHppEl: inpHpp,
    getSatuan: () => (inpSatuanForm?.value || 'PCS').trim() || 'PCS'
  });
  inpSatuanForm?.addEventListener('input', () => hppCalcPrd?.syncLabelSatuan());
  const inpRitel = $('#prd-ritel', form);
  const inpMarginRitel = $('#prd-margin-ritel', form);
  const badgeMarginRitel = $('#badge-margin-ritel', form);

  const inpGrosir = $('#prd-grosir', form);
  const inpMarginGrosir = $('#prd-margin-grosir', form);
  const badgeMarginGrosir = $('#badge-margin-grosir', form);

  const updateBadgeMargin = (badge, hpp, harga, isGrosir = false) => {
    if (!badge) return;
    if (hpp <= 0 && harga <= 0) {
      badge.className = 'badge text-xs font-mono';
      badge.style.background = 'var(--surface-3)';
      badge.style.color = 'var(--text-muted)';
      badge.textContent = 'Margin: 0% | Laba: Rp 0';
      return;
    }
    const laba = harga - hpp;
    const marginPct = hpp > 0 ? ((laba / hpp) * 100) : 0;
    const pctStr = (marginPct >= 0 ? '+' : '') + marginPct.toFixed(1) + '%';

    if (laba < 0) {
      badge.className = 'badge badge-danger text-xs font-mono';
      badge.textContent = `RUGI ${formatRupiah(Math.abs(laba))} (${pctStr})`;
    } else if (laba === 0) {
      badge.className = 'badge badge-warning text-xs font-mono';
      badge.textContent = `Balik Modal (Rp 0 / 0%)`;
    } else {
      badge.className = isGrosir ? 'badge badge-warning text-xs font-mono' : 'badge badge-success text-xs font-mono';
      badge.textContent = `Margin: ${pctStr} | Laba: ${formatRupiah(laba)}`;
    }
  };

  const syncDariHarga = (target) => {
    const hpp = parseRupiah(inpHpp.value) || 0;
    if (target === 'ritel') {
      const harga = parseRupiah(inpRitel.value) || 0;
      if (hpp > 0 && harga > 0) {
        const pct = ((harga - hpp) / hpp) * 100;
        inpMarginRitel.value = pct.toFixed(1);
      } else {
        inpMarginRitel.value = '';
      }
      updateBadgeMargin(badgeMarginRitel, hpp, harga, false);
    } else if (target === 'grosir') {
      const harga = parseRupiah(inpGrosir.value) || 0;
      if (hpp > 0 && harga > 0) {
        const pct = ((harga - hpp) / hpp) * 100;
        inpMarginGrosir.value = pct.toFixed(1);
      } else {
        inpMarginGrosir.value = '';
      }
      updateBadgeMargin(badgeMarginGrosir, hpp, harga, true);
    }
  };

  const syncDariMargin = (target) => {
    const hpp = parseRupiah(inpHpp.value) || 0;
    if (target === 'ritel') {
      const pct = parseFloat(inpMarginRitel.value);
      if (hpp > 0 && !isNaN(pct)) {
        const hitungan = hpp * (1 + pct / 100);
        const bulat = Math.round(hitungan / 100) * 100;
        inpRitel.value = formatRupiah(bulat, false);
        updateBadgeMargin(badgeMarginRitel, hpp, bulat, false);
      }
    } else if (target === 'grosir') {
      const pct = parseFloat(inpMarginGrosir.value);
      if (hpp > 0 && !isNaN(pct)) {
        const hitungan = hpp * (1 + pct / 100);
        const bulat = Math.round(hitungan / 100) * 100;
        inpGrosir.value = formatRupiah(bulat, false);
        updateBadgeMargin(badgeMarginGrosir, hpp, bulat, true);
      }
    }
  };

  inpHpp?.addEventListener('input', () => {
    if (inpMarginRitel?.value !== '') syncDariMargin('ritel');
    else syncDariHarga('ritel');

    if (inpMarginGrosir?.value !== '') syncDariMargin('grosir');
    else if (inpGrosir?.value) syncDariHarga('grosir');
  });

  inpRitel?.addEventListener('input', () => syncDariHarga('ritel'));
  inpMarginRitel?.addEventListener('input', () => syncDariMargin('ritel'));

  inpGrosir?.addEventListener('input', () => syncDariHarga('grosir'));
  inpMarginGrosir?.addEventListener('input', () => syncDariMargin('grosir'));

  // Tombol Preset Margin Cepat
  form.querySelectorAll('.btn-chip-margin-ritel').forEach((chip) => {
    chip.addEventListener('click', () => {
      const pct = parseFloat(chip.getAttribute('data-margin'));
      inpMarginRitel.value = pct;
      syncDariMargin('ritel');
    });
  });

  form.querySelectorAll('.btn-chip-margin-grosir').forEach((chip) => {
    chip.addEventListener('click', () => {
      const pct = parseFloat(chip.getAttribute('data-margin'));
      inpMarginGrosir.value = pct;
      syncDariMargin('grosir');
    });
  });

  // Hitung awal saat form dibuka
  syncDariHarga('ritel');
  if (inpGrosir?.value) syncDariHarga('grosir');

  // Quick generator SKU & Barcode induk
  $('#btn-auto-sku', form)?.addEventListener('click', () => {
    const input = $('#prd-sku', form);
    if (input) {
      input.value = generateSkuCode('SKU');
      showToast(`Kode SKU dibuat: ${input.value}`, 'info', 2000);
    }
  });

  $('#btn-auto-barcode', form)?.addEventListener('click', () => {
    const input = $('#prd-barcode', form);
    if (input) {
      input.value = generateEan13Barcode();
      showToast(`Barcode EAN-13 dibuat: ${input.value}`, 'info', 2000);
    }
  });

  // Upload & Manajemen Foto Produk ke Google Drive
  const imgPreview = $('#prd-foto-img-preview', form);
  const placeholderPreview = $('#prd-foto-placeholder', form);
  const loadingPreview = $('#prd-foto-loading', form);
  const inputUrl = $('#prd-foto-url', form);
  const btnHapusFoto = $('#btn-hapus-foto', form);
  const inputFile = $('#input-file-foto', form);
  const inputCam = $('#input-kamera-foto', form);

  const prosesUploadFoto = async (file) => {
    if (!file) return;
    try {
      if (loadingPreview) loadingPreview.style.display = 'grid';
      showToast('Mengompresi & mengunggah foto ke Google Drive...', 'info', 3000);
      const kompresi = await kompresGambar(file, 800, 0.8);
      const res = await apiCall('produk.uploadFoto', {
        nama_file: kompresi.namaFile,
        mime_type: kompresi.mimeType,
        base64: kompresi.dataUrl
      });
      if (inputUrl) inputUrl.value = res.foto_url;
      if (imgPreview) {
        imgPreview.src = res.foto_url;
        imgPreview.style.display = 'block';
      }
      if (placeholderPreview) placeholderPreview.style.display = 'none';
      if (btnHapusFoto) btnHapusFoto.style.display = 'inline-flex';
      showToast('Foto produk berhasil disimpan di Google Drive!', 'success');
    } catch (err) {
      showToast('Gagal upload foto: ' + err.message, 'error', 4500);
    } finally {
      if (loadingPreview) loadingPreview.style.display = 'none';
      if (inputFile) inputFile.value = '';
      if (inputCam) inputCam.value = '';
    }
  };

  $('#btn-pilih-foto', form)?.addEventListener('click', () => inputFile?.click());
  $('#btn-kamera-foto', form)?.addEventListener('click', () => inputCam?.click());
  inputFile?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) prosesUploadFoto(e.target.files[0]);
  });
  inputCam?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) prosesUploadFoto(e.target.files[0]);
  });
  btnHapusFoto?.addEventListener('click', () => {
    if (inputUrl) inputUrl.value = '';
    if (imgPreview) {
      imgPreview.src = '';
      imgPreview.style.display = 'none';
    }
    if (placeholderPreview) placeholderPreview.style.display = 'block';
    if (btnHapusFoto) btnHapusFoto.style.display = 'none';
    showToast('Foto produk dihapus dari formulir.', 'info');
  });

  // Render Varian Awal
  const wadahVarian = $('#wadah-varian', form);
  const renderBarisVarian = (v = {}) => {
    const row = document.createElement('div');
    row.className = 'card card-body baris-varian';
    row.style.padding = 'var(--sp-3)';
    row.style.border = '1px solid var(--border)';
    row.style.background = 'var(--surface-1)';
    row.innerHTML = `
      <input type="hidden" class="var-id" value="${v.id || ''}">
      <div class="form-grid cols-3" style="gap: var(--sp-2);">
        <div>
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Nama Varian *</label>
          <input type="text" class="input var-nama" placeholder="Cth: Putih 5kg / 10mm" value="${escapeHtml(v.nama_varian || '')}">
        </div>
        <div>
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">SKU Varian (Auto)</label>
          <input type="text" class="input mono uppercase var-sku" placeholder="Auto SKU" value="${escapeHtml(v.sku || '')}" title="Kosongkan jika ingin dibuat otomatis">
        </div>
        <div>
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Barcode Varian (Auto)</label>
          <input type="text" class="input mono var-barcode" placeholder="Auto Barcode" value="${escapeHtml(v.barcode || '')}" title="Kosongkan jika ingin dibuat otomatis">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--sp-2); margin-top: var(--sp-2); align-items: end;">
        <div>
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">HPP / Modal Varian</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-num var-hpp" placeholder="Ikut Induk" value="${v.hpp ? formatRupiah(v.hpp, false) : ''}">
          </div>
        </div>
        <div>
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Harga Ritel Varian *</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-num var-ritel" placeholder="0" value="${v.harga_ritel ? formatRupiah(v.harga_ritel, false) : ''}">
          </div>
        </div>
        <div>
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Harga Grosir Varian</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-num var-grosir" placeholder="Sama Ritel" value="${v.harga_grosir ? formatRupiah(v.harga_grosir, false) : ''}">
          </div>
        </div>
        <div class="row" style="gap: 6px; align-items: flex-end;">
          <div style="flex: 1; min-width: 0;">
            <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Stok Varian</label>
            <input type="number" step="any" class="input input-num var-stok" placeholder="0" value="${v.stok !== undefined ? v.stok : ''}">
          </div>
          <button type="button" class="btn btn-outline-danger btn-icon btn-sm btn-hapus-baris-varian" title="Hapus Varian" aria-label="Hapus Varian" style="height: 38px; width: 38px; flex-shrink: 0;">${ICONS.trash}</button>
        </div>
      </div>
    `;
    formatInputRp(row.querySelector('.var-hpp'));
    formatInputRp(row.querySelector('.var-ritel'));
    formatInputRp(row.querySelector('.var-grosir'));
    row.querySelector('.btn-hapus-baris-varian').addEventListener('click', () => row.remove());
    wadahVarian.appendChild(row);
  };

  if (hasData && pData.varian) {
    pData.varian.forEach((v) => renderBarisVarian(v));
  }
  $('#btn-tambah-baris-varian', form)?.addEventListener('click', () => renderBarisVarian());

  // Render Satuan Konversi Awal
  const wadahSatuan = $('#wadah-satuan', form);
  const renderBarisSatuan = (s = {}) => {
    const row = document.createElement('div');
    row.className = 'card card-body baris-satuan';
    row.style.padding = 'var(--sp-3)';
    row.style.border = '1px solid var(--border)';
    row.style.background = 'var(--surface-1)';
    row.innerHTML = `
      <div class="row" style="gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 120px;">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Nama Satuan Kemasan *</label>
          <input type="text" class="input uppercase sat-nama" placeholder="Cth: DUS / IKAT / ROL" value="${escapeHtml((s.satuan || '').toUpperCase())}">
        </div>
        <div style="padding-bottom: 10px; font-weight: bold; font-size: var(--fs-base);">=</div>
        <div style="width: 100px;">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Isi / Faktor *</label>
          <input type="number" step="0.001" class="input input-num sat-faktor" placeholder="Cth: 24" value="${s.faktor || ''}">
        </div>
        <div style="padding-bottom: 10px;" class="text-xs fw-semibold text-muted satuan-dasar-label">
          ${escapeHtml(($('#prd-satuan', form).value || 'PCS').toUpperCase())}
        </div>
        <div style="flex: 1; min-width: 130px;">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Barcode Kemasan (Auto)</label>
          <input type="text" class="input mono sat-barcode" placeholder="Auto Barcode" value="${escapeHtml(s.barcode || '')}" title="Kosongkan jika ingin dibuat otomatis">
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Harga per Kemasan (Rp) *</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-num sat-ritel" placeholder="0" value="${s.harga_ritel ? formatRupiah(s.harga_ritel, false) : ''}">
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-baris-satuan" title="Hapus Satuan Kemasan" style="height: 38px; margin-bottom: 1px;">Hapus</button>
      </div>
    `;
    row.querySelector('.sat-nama')?.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
    formatInputRp(row.querySelector('.sat-ritel'));
    row.querySelector('.btn-hapus-baris-satuan').addEventListener('click', () => row.remove());
    wadahSatuan.appendChild(row);
  };

  if (hasData && pData.satuan_konversi) {
    pData.satuan_konversi.forEach((s) => renderBarisSatuan(s));
  }
  $('#btn-tambah-baris-satuan', form)?.addEventListener('click', () => renderBarisSatuan());

  // Buka dialog panduan lengkap dari tombol di Tab 3
  $('#btn-buka-panduan-lengkap-varian', form)?.addEventListener('click', () => {
    bukaModalPanduanVarianSatuan();
  });

  // Sinkronisasi dinamis nama satuan dasar ke baris konversi (selalu uppercase)
  $('#prd-satuan', form)?.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
    const val = (e.target.value || '').trim() || 'PCS';
    form.querySelectorAll('.satuan-dasar-label').forEach((el) => {
      el.textContent = val;
    });
  });

  // Jika membuka mode Duplikat Produk, auto-focus dan blok nama agar langsung siap diedit
  if (isDuplikat) {
    const inputNama = $('#prd-nama', modal.el);
    if (inputNama) {
      setTimeout(() => {
        inputNama.focus();
        inputNama.select();
      }, 80);
    }
  }

  // Submit Handler Form Produk
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nama = $('#prd-nama', form).value.trim().replace(/\s+/g, ' ');
    if (!nama) {
      switchTab('dasar');
      $('#prd-nama', form)?.focus();
      showToast('Nama produk wajib diisi!', 'error');
      return;
    }

    const satuan_dasar = ($('#prd-satuan', form).value || '').trim().toUpperCase() || 'PCS';
    const hpp = parseRupiah($('#prd-hpp', form).value);
    const harga_ritel = parseRupiah($('#prd-ritel', form).value);

    if (harga_ritel <= 0) {
      switchTab('harga');
      $('#prd-ritel', form)?.focus();
      showToast('Harga jual ritel wajib diisi dan harus lebih dari 0!', 'error');
      return;
    }

    // Validasi harga >= HPP
    if (hpp > 0 && harga_ritel < hpp) {
      switchTab('harga');
      $('#prd-ritel', form)?.focus();
      showToast(`Harga ritel (Rp ${formatRupiah(harga_ritel, false)}) tidak boleh di bawah HPP (Rp ${formatRupiah(hpp, false)})!`, 'error', 4500);
      return;
    }

    const harga_grosir = parseRupiah($('#prd-grosir', form).value) || harga_ritel;
    if (hpp > 0 && harga_grosir < hpp) {
      switchTab('harga');
      $('#prd-grosir', form)?.focus();
      showToast(`Harga grosir tidak boleh di bawah HPP!`, 'error', 4500);
      return;
    }

    let sku = $('#prd-sku', form).value.trim();
    let barcode = $('#prd-barcode', form).value.trim();

    // Auto-generate SKU & Barcode jika kosong
    if (!sku) {
      sku = generateSkuCode('SKU');
      $('#prd-sku', form).value = sku;
    }
    if (!barcode) {
      barcode = generateEan13Barcode();
      $('#prd-barcode', form).value = barcode;
    }

    const kategori_id = $('#prd-kategori', form).value;
    const min_grosir_qty = parseFloat($('#prd-min-grosir', form).value) || 1;
    const stok = parseFloat($('#prd-stok', form).value) || 0;
    const stok_min = parseFloat($('#prd-stok-min', form).value) || 0;
    const aktif = $('#prd-aktif', form).checked;
    const punya_varian = checkVarian.checked;

    // Susun data varian
    const varian = [];
    if (punya_varian) {
      const barisVarian = form.querySelectorAll('.baris-varian');
      if (barisVarian.length === 0) {
        switchTab('varian');
        showToast('Tambahkan minimal 1 varian atau matikan opsi varian!', 'error');
        return;
      }
      for (const b of barisVarian) {
        const vNama = b.querySelector('.var-nama').value.trim();
        const vHppInput = parseRupiah(b.querySelector('.var-hpp')?.value || '');
        const vHpp = vHppInput > 0 ? vHppInput : hpp;
        const vRitel = parseRupiah(b.querySelector('.var-ritel').value);
        const vGrosirInput = parseRupiah(b.querySelector('.var-grosir')?.value || '');
        const vGrosir = vGrosirInput > 0 ? vGrosirInput : vRitel;
        if (!vNama) {
          switchTab('varian');
          b.querySelector('.var-nama').focus();
          showToast('Nama varian tidak boleh kosong!', 'error');
          return;
        }
        if (vRitel <= 0) {
          switchTab('varian');
          b.querySelector('.var-ritel').focus();
          showToast(`Harga ritel varian "${vNama}" wajib diisi!`, 'error');
          return;
        }
        if (vHpp > 0 && vRitel < vHpp) {
          switchTab('varian');
          b.querySelector('.var-ritel').focus();
          showToast(`Harga varian "${vNama}" tidak boleh di bawah HPP (${formatRupiah(vHpp)})!`, 'error');
          return;
        }
        if (vHpp > 0 && vGrosir < vHpp) {
          switchTab('varian');
          b.querySelector('.var-grosir')?.focus();
          showToast(`Harga grosir varian "${vNama}" tidak boleh di bawah HPP (${formatRupiah(vHpp)})!`, 'error');
          return;
        }

        let vSku = b.querySelector('.var-sku').value.trim();
        if (!vSku) vSku = `${sku}-V${varian.length + 1}`;
        let vBarcode = b.querySelector('.var-barcode').value.trim();
        if (!vBarcode) vBarcode = generateEan13Barcode();

        varian.push({
          id: b.querySelector('.var-id').value || undefined,
          nama_varian: vNama,
          sku: vSku,
          barcode: vBarcode,
          hpp: vHpp,
          harga_ritel: vRitel,
          harga_grosir: vGrosir,
          stok: parseFloat(b.querySelector('.var-stok').value) || 0
        });
      }
    }

    // Susun data satuan konversi
    const satuan_konversi = [];
    const barisSatuan = form.querySelectorAll('.baris-satuan');
    for (const s of barisSatuan) {
      const sNama = s.querySelector('.sat-nama').value.trim().toUpperCase();
      const sFaktor = parseFloat(s.querySelector('.sat-faktor').value);
      const sRitel = parseRupiah(s.querySelector('.sat-ritel').value);
      if (!sNama && isNaN(sFaktor) && sRitel === 0) continue;
      if (!sNama) {
        switchTab('varian');
        s.querySelector('.sat-nama').focus();
        showToast('Nama satuan kemasan wajib diisi!', 'error');
        return;
      }
      if (!sFaktor || sFaktor <= 0) {
        switchTab('varian');
        s.querySelector('.sat-faktor').focus();
        showToast(`Faktor konversi satuan "${sNama}" harus lebih dari 0!`, 'error');
        return;
      }
      if (sRitel <= 0) {
        switchTab('varian');
        s.querySelector('.sat-ritel').focus();
        showToast(`Harga jual ritel untuk satuan "${sNama}" wajib diisi!`, 'error');
        return;
      }

      let sBarcode = (s.querySelector('.sat-barcode')?.value || '').trim();
      if (!sBarcode) sBarcode = generateEan13Barcode();

      satuan_konversi.push({
        satuan: sNama,
        faktor: sFaktor,
        barcode: sBarcode,
        harga_ritel: sRitel,
        harga_grosir: sRitel
      });
    }

    const foto_url = ($('#prd-foto-url', form)?.value || '').trim();

    const payload = {
      id: isEdit ? pData.id : undefined,
      nama, sku, barcode, kategori_id, satuan_dasar,
      hpp, harga_ritel, harga_grosir, min_grosir_qty,
      stok, stok_min, aktif, punya_varian,
      foto_url,
      varian, satuan_konversi
    };

    const btnSimpan = $('#btn-simpan-produk', modal.el);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;
    isSubmitting = true;

    try {
      if (isEdit) {
        await apiCall('produk.update', payload);
        showToast('Data produk berhasil diperbarui.', 'success');
      } else {
        await apiCall('produk.create', payload);
        showToast(isDuplikat ? 'Produk salinan berhasil dibuat!' : 'Produk baru berhasil ditambahkan.', 'success');
        // Reset filter ke halaman 1 dan urutan terbaru agar produk baru langsung tampil paling atas
        filterState.page = 1;
        filterState.sort = 'terbaru';
        perbaruiTampilanFilter(container);
      }
      modal.close();
      await muatProduk(container, true, false);
    } catch (err) {
      showToast(err.message, 'error', 4500);
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
      isSubmitting = false;
    }
  });
}


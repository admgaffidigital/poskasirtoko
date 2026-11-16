/**
 * produk.js — Modul Manajemen Master Produk, Multi Satuan & Varian
 * Sesuai aturan README bagian 6.4, 7 (Aturan Bisnis 1, 10, 11, 17) & Hak Akses
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, $$, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { formatRupiah, formatQty, parseRupiah, escapeHtml } from '../utils/format.js';

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

export async function renderProdukModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');
  const isKasir = user && user.role === 'kasir';

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Katalog & Stok Produk</h2>
          <p>Kelola daftar barang, varian, satuan konversi, harga eceran & grosir</p>
        </div>
        ${canEdit ? `
          <div class="row" style="gap: var(--sp-2); align-items: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary" id="btn-panduan-varian-header" title="Tata Cara & Panduan Penggunaan Varian dan Satuan">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              <span>Panduan Varian &amp; Satuan</span>
            </button>
            <button type="button" class="btn btn-primary" id="btn-tambah-produk">
              <span>+ Tambah Produk</span>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Bilah Filter & Pencarian Komprehensif -->
      <div class="card card-body stack-sm" style="gap: var(--sp-3);">
        <!-- Baris 1: Pencarian Cepat & Pengaturan Tampilan -->
        <div class="row" style="gap: var(--sp-2);">
          <div class="input-group grow" style="min-width: 200px;">
            <span class="input-icon">${ICONS.search}</span>
            <input type="text" class="input" id="filter-produk-q" placeholder="Cari nama barang, SKU, atau barcode..." value="${escapeHtml(filterState.q)}">
          </div>

          <div class="segmented" id="toggle-view">
            <button type="button" data-view="table" aria-pressed="${filterState.view === 'table'}" title="Tampilan Tabel / Kartu">${ICONS.list}</button>
            <button type="button" data-view="grid" aria-pressed="${filterState.view === 'grid'}" title="Tampilan Grid">${ICONS.grid}</button>
          </div>

          <button type="button" class="btn btn-secondary btn-icon" id="btn-reset-filter" title="Reset Semua Filter" style="display: none;">
            ${ICONS.refresh}
          </button>
        </div>

        <!-- Baris 2: Dropdown Filter & Pengurutan (Urutkan, Kategori, Status Stok, Status Keaktifan) -->
        <div class="row" style="gap: var(--sp-2); align-items: center; flex-wrap: wrap;">
          <!-- Dropdown Urutkan (Default: Terbaru selalu di atas) -->
          <div class="field" style="flex: 1 1 180px; min-width: 150px;">
            <select class="select" id="filter-produk-sort" title="Urutan Tampilan">
              <option value="terbaru" ${filterState.sort === 'terbaru' ? 'selected' : ''}>Terbaru (Baru Ditambahkan)</option>
              <option value="terlama" ${filterState.sort === 'terlama' ? 'selected' : ''}>Terlama (Awal Ditambahkan)</option>
              <option value="nama_asc" ${filterState.sort === 'nama_asc' ? 'selected' : ''}>Nama Barang (A - Z)</option>
              <option value="nama_desc" ${filterState.sort === 'nama_desc' ? 'selected' : ''}>Nama Barang (Z - A)</option>
              <option value="stok_asc" ${filterState.sort === 'stok_asc' ? 'selected' : ''}>Stok Terendah (Menipis)</option>
              <option value="stok_desc" ${filterState.sort === 'stok_desc' ? 'selected' : ''}>Stok Tertinggi</option>
              <option value="harga_desc" ${filterState.sort === 'harga_desc' ? 'selected' : ''}>Harga Ritel Tertinggi</option>
              <option value="harga_asc" ${filterState.sort === 'harga_asc' ? 'selected' : ''}>Harga Ritel Terendah</option>
            </select>
          </div>

          <!-- Dropdown Kategori -->
          <div class="field" style="flex: 1 1 180px; min-width: 150px;">
            <select class="select" id="filter-produk-kategori" title="Kategori Produk">
              <option value="">Semua Kategori</option>
            </select>
          </div>


          <!-- Dropdown Status Keaktifan -->
          <div class="field" style="flex: 1 1 140px; min-width: 130px;">
            <select class="select" id="filter-produk-status" title="Status Produk">
              <option value="" ${filterState.status === '' ? 'selected' : ''}>Semua Status</option>
              <option value="aktif" ${filterState.status === 'aktif' ? 'selected' : ''}>Aktif Saja</option>
              <option value="nonaktif" ${filterState.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option>
            </select>
          </div>
        </div>

        <!-- Baris 3: Filter Cepat Chips -->
        <div class="row" style="gap: 6px; overflow-x: auto; padding-bottom: 2px;" id="filter-chips-wrap">
          <button type="button" class="btn btn-xs ${!filterState.filter_stok && filterState.sort === 'terbaru' && !filterState.kategori_id && !filterState.status && !filterState.q ? 'btn-primary' : 'btn-secondary'}" data-chip="semua">
            Semua Produk
          </button>
          <button type="button" class="btn btn-xs ${filterState.sort === 'terbaru' && !filterState.filter_stok ? 'btn-primary' : 'btn-secondary'}" data-chip="terbaru" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Terbaru</span>
          </button>
          <button type="button" class="btn btn-xs ${filterState.filter_stok === 'menipis' ? 'btn-warning' : 'btn-secondary'}" data-chip="menipis" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
            <span>Stok Menipis</span>
          </button>
          <button type="button" class="btn btn-xs ${filterState.filter_stok === 'habis' ? 'btn-danger' : 'btn-secondary'}" data-chip="habis" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
            <span>Stok Habis</span>
          </button>
          <button type="button" class="btn btn-xs ${filterState.filter_stok === 'tersedia' ? 'btn-primary' : 'btn-secondary'}" data-chip="tersedia" style="display: inline-flex; align-items: center; gap: 4px;">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Ada Stok</span>
          </button>
        </div>
      </div>

      <!-- Area Tampilan Data -->
      <div id="area-daftar-produk">
        ${renderSkeleton(4)}
      </div>

      <!-- Paginasi & Kontrol Muat Produk -->
      <div id="area-paginasi-produk" class="stack-sm" style="width: 100%; margin-top: var(--sp-3);"></div>
    </div>
  `;

  // Muat opsi kategori ke dropdown filter
  try {
    const katRes = await apiCall('kategori.list', {});
    const selKat = $('#filter-produk-kategori', container);
    if (selKat) {
      selKat.innerHTML = susunOpsiKategoriHtml(katRes.items || [], filterState.kategori_id, 'Semua Kategori');
    }
  } catch (e) {
    // Abaikan jika gagal muat filter
  }

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

  if (canEdit) {
    $('#btn-panduan-varian-header', container)?.addEventListener('click', () => {
      bukaModalPanduanVarianSatuan();
    });
    $('#btn-tambah-produk', container)?.addEventListener('click', () => {
      bukaModalFormProduk(container, null);
    });
  }

  perbaruiTampilanFilter(container);
  await muatProduk(container, canEdit, isKasir);
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
    if (!isAppend) {
      const res = await apiCall('produk.list', filterState);
      cacheDaftarProduk = urutkanDaftarProdukLokal(res.items || [], filterState.sort);
      window._totalProdukTerakhir = res.total || 0;
    } else {
      filterState.page++;
      const res = await apiCall('produk.list', filterState);
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
          : (canEdit && !filterState.q ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">+ Tambah Produk Pertama</button>` : '')
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
                  <th style="min-width: 220px;">Nama Produk</th>
                  <th style="min-width: 140px; white-space: nowrap;">SKU / Barcode</th>
                  <th style="min-width: 80px;">Satuan</th>
                  ${!isKasir ? '<th style="text-align: right; min-width: 110px; white-space: nowrap;">HPP</th>' : ''}
                  <th style="text-align: right; min-width: 115px; white-space: nowrap;">Harga Ritel</th>
                  <th style="text-align: right; min-width: 115px; white-space: nowrap;">Harga Grosir</th>
                  <th style="text-align: center; min-width: 80px; white-space: nowrap;">Stok</th>
                  ${canEdit ? '<th style="width: 170px; min-width: 170px; text-align: right; white-space: nowrap;">Aksi</th>' : ''}
                </tr>
              </thead>
              <tbody>
      `;

      items.forEach((p) => {
        const stokBadge = dapatkanBadgeStok(p.stok, p.stok_min);
        html += `
          <tr>
            <td data-label="Produk">
              <div class="prd-table-head" style="display: flex; align-items: flex-start; gap: var(--sp-3); width: 100%; flex-wrap: nowrap;">
                <div class="prd-table-avatar" style="flex-shrink: 0;">
                  ${p.foto_url ? `
                    <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" loading="lazy" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='grid';">
                    <div style="display: none; width: 100%; height: 100%; place-items: center;">${ICONS.package}</div>
                  ` : ICONS.package}
                </div>
                <div class="grow" style="flex: 1 1 auto; min-width: 0;">
                  <div class="fw-bold text-md prd-table-nama" style="word-break: break-word; line-height: 1.35;">${escapeHtml(p.nama)}</div>
                  <div class="row" style="gap: 4px; margin-top: 3px; flex-wrap: wrap;">
                    ${p.sku ? `<span class="mono text-xs text-muted" style="white-space: nowrap;">${escapeHtml(p.sku)}</span>` : ''}
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
              <td style="text-align: right; min-width: 170px; width: 170px; white-space: nowrap;" data-label="Aksi">
                <div class="table-actions">
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-prd" data-id="${p.id}" title="Edit Produk">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    <span>Ubah</span>
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-sm btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}" title="Hapus Produk">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span>Hapus</span>
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
        html += `
          <div class="card stack-sm" style="padding: var(--sp-4);">
            ${p.foto_url ? `
              <div style="aspect-ratio: 1 / 1; width: 100%; border-radius: var(--radius-md); overflow: hidden; background: var(--surface-2); margin-bottom: var(--sp-2); border: 1px solid var(--border); position: relative;">
                <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" onerror="this.parentElement.style.display='none';">
              </div>
            ` : ''}
            <div class="row-between">
              <span class="badge ${stokBadge.kelas}">Stok: ${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar)}</span>
              ${p.sku ? `<span class="mono text-xs text-muted">${escapeHtml(p.sku)}</span>` : ''}
            </div>

            <div class="fw-semibold text-md" style="min-height: 44px; margin-top: var(--sp-1);">
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
              <div class="row" style="margin-top: var(--sp-2); gap: var(--sp-2);">
                <button type="button" class="btn btn-secondary btn-sm grow btn-edit-prd" data-id="${p.id}">Ubah</button>
                <button type="button" class="btn btn-ghost btn-sm text-danger btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}">Hapus</button>
              </div>
            ` : ''}
          </div>
        `;
      });
      html += '</div>';
      area.innerHTML = html;
    }

    // Pasang tombol aksi Ubah & Hapus
    if (canEdit) {
      area.querySelectorAll('.btn-edit-prd').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const p = items.find((x) => x.id === id);
          if (p) bukaModalFormProduk(container, p);
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
  showModal({
    title: '💡 Panduan & Tata Cara: Varian dan Satuan Kemasan',
    size: 'lg',
    body: `
      <div class="stack" style="gap: var(--sp-4); font-size: var(--fs-sm); line-height: 1.6;">
        <!-- Ringkasan Inti -->
        <div class="alert alert-info alert-block" style="display: block !important; width: 100% !important; background: var(--surface-2); border: 1px solid rgba(232, 89, 12, 0.35); border-left: 4px solid var(--primary); border-radius: var(--radius-md); padding: var(--sp-3); box-sizing: border-box;">
          <div class="fw-bold" style="color: var(--primary); margin-bottom: 6px; font-size: var(--fs-base);">
            Perbedaan Utama: Kapan Pakai Varian? Kapan Pakai Satuan Kemasan?
          </div>
          <div style="line-height: 1.6;">
            Keduanya memiliki fungsi yang sangat berbeda dalam operasional toko bangunan:
            <ul style="margin: 6px 0 0 18px; padding: 0;">
              <li><b>Varian Produk:</b> Digunakan jika barang memiliki <u>karakteristik fisik atau spesifikasi yang berbeda</u> sehingga stok fisiknya wajib dihitung terpisah di gudang (contoh: Pipa Tipe C vs Tipe D; Cat Putih 5kg vs Abu-abu 5kg).</li>
              <li><b>Konversi Satuan Kemasan (Multi Satuan):</b> Digunakan jika <u>satu barang fisik yang sama persis</u> bisa dijual eceran maupun dalam kemasan grosir/dus/ikat/rol (contoh: Pipa dijual per Batang atau per Ikat; Semen per Sak atau per Truk).</li>
            </ul>
          </div>
        </div>

        <!-- Tabel Perbandingan Komprehensif -->
        <div>
          <div class="fw-bold" style="margin-bottom: var(--sp-2); font-size: var(--fs-base);">
            Tabel Komparasi Fitur
          </div>
          <div class="table-wrap" style="border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">
            <table class="table" style="margin: 0; font-size: var(--fs-xs); min-width: 0; width: 100%;">
              <thead style="background: var(--surface-2);">
                <tr>
                  <th style="width: 22%;">Aspek</th>
                  <th style="width: 39%;">Varian Produk (Warna / Ukuran / Tebal)</th>
                  <th style="width: 39%;">Konversi Satuan Kemasan (Multi Satuan)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Fungsi Utama</td>
                  <td data-label="Varian Produk"><span class="table-cell-val" style="white-space: normal;">Membedakan jenis barang dengan spesifikasi berbeda.</span></td>
                  <td data-label="Multi Satuan"><span class="table-cell-val" style="white-space: normal;">Menjual barang yang sama dalam kemasan grosir / partai besar.</span></td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Pengelolaan Stok</td>
                  <td data-label="Varian Produk"><span class="table-cell-val" style="white-space: normal;"><b>Terpisah per varian</b>. Jika Cat Putih laku 1 kaleng, hanya stok Cat Putih yang berkurang.</span></td>
                  <td data-label="Multi Satuan"><span class="table-cell-val" style="white-space: normal;"><b>Satu stok fisik induk</b> (satuan dasar). Jual 1 Ikat Pipa (isi 25 btg) otomatis memotong 25 btg dari stok pipa.</span></td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Barcode & SKU</td>
                  <td data-label="Varian Produk"><span class="table-cell-val" style="white-space: normal;">Tiap varian memiliki barcode dan SKU mandiri.</span></td>
                  <td data-label="Multi Satuan"><span class="table-cell-val" style="white-space: normal;">Tiap kemasan bisa memiliki barcode kemasan tersendiri (misal barcode di kardus luar).</span></td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Contoh Kasus Toko Bangunan</td>
                  <td data-label="Varian Produk">
                    <div class="cell-stack">
                      <span>• Cat: <i>Putih 5kg</i>, <i>Krem 5kg</i>, <i>Abu-abu 5kg</i></span>
                      <span>• Besi Beton: <i>8mm</i>, <i>10mm</i>, <i>12mm</i></span>
                      <span>• Pipa PVC: <i>Tebal C</i>, <i>Tebal D</i>, <i>Tebal AW</i></span>
                    </div>
                  </td>
                  <td data-label="Multi Satuan">
                    <div class="cell-stack">
                      <span>• Pipa: 1 Ikat = 25 Batang (Faktor: 25)</span>
                      <span>• Kabel: 1 Rol = 50 Meter (Faktor: 50)</span>
                      <span>• Semen: 1 Truk = 100 Sak (Faktor: 100)</span>
                      <span>• Keramik: 1 Dus = 1.44 m² (Faktor: 1.44)</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td data-label="Aspek" class="fw-semibold">Di Kasir POS</td>
                  <td data-label="Varian Produk"><span class="table-cell-val" style="white-space: normal;">Kasir memilih varian saat item ditambahkan ke keranjang.</span></td>
                  <td data-label="Multi Satuan"><span class="table-cell-val" style="white-space: normal;">Kasir dapat beralih satuan langsung di keranjang belanja melalui tombol badge <code>[ BTG ▾ ]</code>.</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tata Cara 1: Varian Produk -->
        <div class="card" style="padding: var(--sp-3); border: 1px solid var(--border); background: var(--surface-1);">
          <div class="fw-bold" style="color: var(--primary); margin-bottom: 6px; font-size: var(--fs-base);">
            1. Tata Cara Mengatur Varian Produk
          </div>
          <ol style="margin: 0; padding-left: 20px;" class="stack-xs text-xs">
            <li>Buka formulir Tambah/Ubah Produk, lalu buka tab <b>Varian & Satuan</b>.</li>
            <li>Aktifkan sakelar <b>"Produk memiliki beberapa varian (Warna, Ukuran, Tebal)"</b>.</li>
            <li>Tekan tombol <b>"+ Varian"</b> untuk menambahkan baris varian baru.</li>
            <li>Isi <b>Nama Varian</b> sesuai spesifikasi barang (contoh: <code>Putih 5kg</code>, <code>Tebal Tipe C</code>, atau <code>10mm</code>).</li>
            <li>Kolom <b>SKU Varian</b> & <b>Barcode Varian</b> boleh dikosongkan jika ingin sistem membuatnya secara otomatis (kode EAN-13 standar retail).</li>
            <li>Isi <b>Harga Jual Ritel</b> untuk varian tersebut.</li>
            <li>Isi <b>Stok Awal</b> fisik yang ada di toko untuk varian tersebut. (Total stok produk induk akan dihitung otomatis oleh sistem sebagai akumulasi seluruh varian).</li>
          </ol>
        </div>

        <!-- Tata Cara 2: Satuan Kemasan -->
        <div class="card" style="padding: var(--sp-3); border: 1px solid var(--border); background: var(--surface-1);">
          <div class="fw-bold" style="color: var(--primary); margin-bottom: 6px; font-size: var(--fs-base);">
            2. Tata Cara Mengatur Satuan Kemasan (Multi Satuan)
          </div>
          <ol style="margin: 0; padding-left: 20px;" class="stack-xs text-xs">
            <li>Pastikan <b>Satuan Dasar</b> di Tab 1 (Informasi Dasar) sudah diisi terlebih dahulu (contoh: <code>BTG</code>, <code>MTR</code>, <code>PCS</code>, <code>SAK</code>, atau <code>KG</code>). Satuan dasar adalah unit terkecil yang biasa diecer.</li>
            <li>Pada Tab <b>Varian & Satuan</b> bagian Konversi Satuan Kemasan, klik tombol <b>"+ Satuan Kemasan"</b>.</li>
            <li>Isi <b>Nama Kemasan</b> (contoh: <code>IKAT</code>, <code>DUS</code>, <code>ROL</code>, <code>TRUK</code>, <code>LUSIN</code>).</li>
            <li>Isi <b>Isi / Faktor</b> dengan jumlah satuan dasar di dalam 1 kemasan tersebut:
              <br><span class="text-muted">• Jika 1 Ikat berisi 25 Batang pipa &rarr; Masukkan Faktor = <code>25</code>.</span>
              <br><span class="text-muted">• Jika 1 Rol kabel berisi 50 Meter &rarr; Masukkan Faktor = <code>50</code>.</span>
              <br><span class="text-muted">• Jika 1 Truk semen berisi 100 Sak &rarr; Masukkan Faktor = <code>100</code>.</span>
            </li>
            <li>Isi <b>Harga per Kemasan (Rp)</b>: Masukkan harga jual untuk 1 kemasan utuh. (Disarankan memberi harga grosir lebih murah daripada membeli eceran sebagai daya tarik pelanggan borongan).</li>
          </ol>
        </div>

        <!-- Tips Kasir POS -->
        <div style="background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); border-left: 4px solid var(--primary);">
          <div class="fw-bold" style="margin-bottom: 2px;">
            💡 Tips Penggunaan di Kasir POS:
          </div>
          <div class="text-xs text-muted" style="line-height: 1.5;">
            Saat transaksi di kasir:
            <ul style="margin: 4px 0 0 16px; padding: 0;">
              <li>Kasir dapat menjual eceran maupun kemasan secara fleksibel.</li>
              <li>Untuk mengubah satuan barang di keranjang belanja, kasir cukup menekan badge satuan (contoh: <code>[ BTG ▾ ]</code> lalu pilih <code>IKAT</code>). Subtotal otomatis dihitung ulang, dan stok fisik di gudang otomatis terpotong sesuai faktor konversinya (1 Ikat memotong 25 Batang stok).</li>
            </ul>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; align-items: center;">
        <span class="text-xs text-muted">POS Kasir Toko Bangunan</span>
        <button type="button" class="btn btn-primary btn-sm btn-close-modal">Saya Mengerti</button>
      </div>
    `
  });
}

/**
 * Modal Form Tambah / Edit Produk Lengkap
 */
async function bukaModalFormProduk(container, produk) {
  const isEdit = !!produk;
  let isSubmitting = false;
  let daftarKategori = [];
  try {
    const kRes = await apiCall('kategori.list', {});
    daftarKategori = kRes.items || [];
  } catch (e) { }

  const optionsKat = susunOpsiKategoriHtml(daftarKategori, isEdit ? produk.kategori_id : '', '-- Tanpa Kategori --');

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
              <img src="${isEdit && produk.foto_url ? escapeHtml(produk.foto_url) : ''}" alt="Foto" id="prd-foto-img-preview" style="width: 100%; height: 100%; object-fit: cover; ${isEdit && produk.foto_url ? '' : 'display: none;'}">
              <div id="prd-foto-placeholder" style="text-align: center; color: var(--text-muted); ${isEdit && produk.foto_url ? 'display: none;' : ''}">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
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
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  <span>Pilih Galeri</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-kamera-foto" style="display: inline-flex; align-items: center; gap: 6px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                  <span>Kamera</span>
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger" id="btn-hapus-foto" style="${isEdit && produk.foto_url ? '' : 'display: none;'} display: inline-flex; align-items: center; gap: 4px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>Hapus</span>
                </button>
              </div>
              <input type="file" id="input-file-foto" accept="image/*" style="display: none;">
              <input type="file" id="input-kamera-foto" accept="image/*" capture="environment" style="display: none;">
              <input type="hidden" id="prd-foto-url" value="${isEdit && produk.foto_url ? escapeHtml(produk.foto_url) : ''}">
              <span class="field-hint" id="prd-foto-hint">Tersimpan di Google Drive Toko Anda (otomatis dikompres &lt; 150 KB).</span>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="prd-nama">Nama Produk <span class="wajib">*</span></label>
          <input type="text" class="input" id="prd-nama" value="${isEdit ? escapeHtml(produk.nama) : ''}" placeholder="Cth: Semen Padang 50kg, Cat Dulux Pentalite 2.5L" data-autofocus>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <div class="row items-center justify-between" style="margin-bottom: 4px;">
              <label class="field-label" for="prd-sku" style="margin-bottom: 0;">Kode SKU</label>
              <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-sku" title="Buat SKU Otomatis" style="padding: 2px 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg><span>Auto</span></button>
            </div>
            <input type="text" class="input mono uppercase" id="prd-sku" value="${isEdit ? escapeHtml(produk.sku || '') : ''}" placeholder="Auto (cth: SKU-20261113-0001)">
            <span class="field-hint">Kosongkan jika ingin dibuat otomatis</span>
          </div>
          <div class="field">
            <div class="row items-center justify-between" style="margin-bottom: 4px;">
              <label class="field-label" for="prd-barcode" style="margin-bottom: 0;">Barcode</label>
              <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-barcode" title="Buat Barcode EAN-13 Otomatis" style="padding: 2px 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg><span>Auto</span></button>
            </div>
            <input type="text" class="input mono" id="prd-barcode" value="${isEdit ? escapeHtml(produk.barcode || '') : ''}" placeholder="Auto (13 digit EAN-13)">
            <span class="field-hint">Kosongkan jika ingin dibuat otomatis</span>
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-kategori">Kategori</label>
            <select class="select" id="prd-kategori">${optionsKat}</select>
          </div>
          <div class="field">
            <label class="field-label" for="prd-satuan">Satuan Dasar <span class="wajib">*</span></label>
            <input type="text" class="input" id="prd-satuan" value="${isEdit ? escapeHtml(produk.satuan_dasar) : 'pcs'}" placeholder="Cth: sak, kg, dus, batang, meter">
          </div>
        </div>

        <div class="field">
          <label class="switch">
            <input type="checkbox" id="prd-aktif" ${!isEdit || produk.aktif ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Status Produk Aktif (dapat dijual di kasir)</span>
          </label>
        </div>
      </div>

      <!-- Tab 2: Harga & Stok -->
      <div class="tab-pane stack hidden" id="pane-harga">
        <!-- Input HPP (Harga Modal Acuan) -->
        <div class="field">
          <label class="field-label" for="prd-hpp">
            <span>HPP (Harga Beli Pokok / Modal) <span class="wajib">*</span></span>
          </label>
          <div class="input-prefix" style="max-width: 320px;">
            <span>Rp</span>
            <input type="text" class="input input-num fw-bold" id="prd-hpp" value="${isEdit ? formatRupiah(produk.hpp, false) : '0'}" placeholder="0">
          </div>
          <span class="field-hint">Dasar acuan perhitungan persentase margin keuntungan ritel dan grosir.</span>
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
                <input type="text" class="input input-num fw-bold text-md" id="prd-ritel" value="${isEdit ? formatRupiah(produk.harga_ritel, false) : '0'}">
              </div>
              <span class="field-hint">Ketik harga langsung atau tentukan persen di sebelah kiri.</span>
            </div>
          </div>
        </div>

        <!-- 2. Kalkulator Otomatis Margin & Harga Grosir (Partai / Tukang) -->
        <div class="card card-body stack" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); gap: var(--sp-2); margin-top: var(--sp-1);">
          <div class="row-between items-center" style="flex-wrap: wrap; gap: var(--sp-1);">
            <div>
              <span class="fw-bold text-sm" style="color: var(--amber-600, #d97706);">2. Harga Jual Grosir (Partai / Tukang)</span>
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
                  <input type="text" class="input input-num fw-semibold" id="prd-grosir" value="${isEdit && produk.harga_grosir ? formatRupiah(produk.harga_grosir, false) : ''}" placeholder="Sama dg ritel">
                </div>
              </div>

              <div class="field">
                <label class="field-label" for="prd-min-grosir">
                  <span>Min. Qty Grosir</span>
                </label>
                <input type="number" class="input input-num" id="prd-min-grosir" value="${isEdit ? produk.min_grosir_qty || 1 : 1}" min="1">
              </div>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-stok">${isEdit ? 'Stok Sistem Saat Ini' : 'Stok Awal Fisik'}</label>
            <input type="number" step="0.001" class="input input-num" id="prd-stok" value="${isEdit ? produk.stok || 0 : 0}" ${isEdit ? 'disabled' : ''}>
            ${isEdit ? '<span class="field-hint">Gunakan modul Stok Opname / Pembelian untuk mengubah stok produk yang sudah ada.</span>' : ''}
          </div>

          <div class="field">
            <label class="field-label" for="prd-stok-min">Batas Stok Minimum</label>
            <input type="number" class="input input-num" id="prd-stok-min" value="${isEdit ? produk.stok_min || 0 : 5}">
            <span class="field-hint">Peringatan stok menipis muncul jika saldo di bawah batas ini.</span>
          </div>
        </div>
      </div>

      <!-- Tab 3: Varian & Satuan -->
      <div class="tab-pane stack hidden" id="pane-varian">
        <!-- Kotak Ringkasan Panduan & Tata Cara -->
        <div class="alert alert-info alert-block" style="display: block !important; width: 100% !important; border: 1px solid rgba(232, 89, 12, 0.35); border-left: 4px solid var(--primary); background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed rgba(232, 89, 12, 0.25);">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 16px;">💡</span>
              <span class="fw-bold" style="color: var(--primary); font-size: var(--fs-xs);">Tata Cara Penggunaan Varian &amp; Satuan Kemasan</span>
            </div>
            <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-buka-panduan-lengkap-varian" style="font-size: var(--fs-xs); font-weight: 600; text-decoration: underline; padding: 3px 8px; background: rgba(232, 89, 12, 0.08); border-radius: var(--radius-sm);">
              Buka Panduan Lengkap &raquo;
            </button>
          </div>
          <div style="display: block; width: 100%; font-size: var(--fs-xs); color: var(--text-muted); line-height: 1.6;">
            <div style="margin-bottom: 5px;">
              <b style="color: var(--text);">1. Varian Produk:</b> Gunakan jika barang punya <u>spesifikasi fisik berbeda</u> yang stoknya dihitung terpisah (contoh: Pipa varian <i>Tebal C</i> &amp; <i>Tebal D</i>; Cat <i>Putih 5kg</i> &amp; <i>Abu 5kg</i>; Besi <i>8mm</i> &amp; <i>10mm</i>).
            </div>
            <div>
              <b style="color: var(--text);">2. Satuan Kemasan (Multi Satuan):</b> Gunakan jika 1 barang fisik bisa <u>dijual eceran maupun kemasan grosir</u> (contoh: Satuan dasar <code>BTG</code> &rarr; <code>1 IKAT = 25 BTG</code>; <code>MTR</code> &rarr; <code>1 ROL = 50 MTR</code>; <code>SAK</code> &rarr; <code>1 TRUK = 100 SAK</code>).
            </div>
          </div>
        </div>

        <div class="field">
          <label class="switch">
            <input type="checkbox" id="prd-punya-varian" ${isEdit && produk.punya_varian ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Produk memiliki beberapa varian (Warna, Ukuran, Tebal)</span>
          </label>
        </div>

        <div id="area-input-varian" class="stack ${isEdit && produk.punya_varian ? '' : 'hidden'}">
          <div class="row-between">
            <span class="section-title">Daftar Varian Produk</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tambah-baris-varian">+ Varian</button>
          </div>
          <span class="field-hint">Tiap varian memiliki nama spesifikasi, barcode, harga ritel, dan stok fisik tersendiri.</span>
          <div id="wadah-varian" class="stack-sm"></div>
        </div>

        <div class="divider"></div>

        <div class="stack">
          <div class="row-between">
            <span class="section-title">Konversi Satuan Kemasan (Multi Satuan)</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tambah-baris-satuan">+ Satuan Kemasan</button>
          </div>
          <span class="field-hint">Tentukan kemasan grosir/dus/ikat/rol untuk memudahkan kasir menjual dalam jumlah besar. Contoh: 1 Dus = 24 pcs, 1 Truk = 100 sak, 1 Ikat = 25 btg.</span>
          <div id="wadah-satuan" class="stack-sm"></div>
        </div>
      </div>

      <!-- Footer Tombol -->
      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-3);">
        <button type="button" class="btn btn-ghost btn-close-modal" id="btn-batal-produk">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-produk">
          ${isEdit ? 'Simpan Perubahan' : 'Tambah Produk'}
        </button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: isEdit ? 'Ubah Data Produk' : 'Tambah Produk Baru',
    body: bodyHtml,
    size: 'lg'
  });

  const form = $('#form-produk', modal.el);

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
      <div class="row" style="margin-top: var(--sp-2); gap: var(--sp-2); align-items: flex-end;">
        <div class="grow">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Harga Jual Ritel Varian (Rp) *</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-num var-ritel" placeholder="0" value="${v.harga_ritel ? formatRupiah(v.harga_ritel, false) : ''}">
          </div>
        </div>
        <div style="max-width: 120px;">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Stok Awal</label>
          <input type="number" class="input input-num var-stok" placeholder="0" value="${v.stok !== undefined ? v.stok : ''}">
        </div>
        <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-baris-varian" title="Hapus Varian" style="height: 38px; margin-bottom: 1px;">Hapus</button>
      </div>
    `;
    formatInputRp(row.querySelector('.var-ritel'));
    row.querySelector('.btn-hapus-baris-varian').addEventListener('click', () => row.remove());
    wadahVarian.appendChild(row);
  };

  if (isEdit && produk.varian) {
    produk.varian.forEach((v) => renderBarisVarian(v));
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
          <input type="text" class="input sat-nama" placeholder="Cth: Dus / Ikat / Rol" value="${escapeHtml(s.satuan || '')}">
        </div>
        <div style="padding-bottom: 10px; font-weight: bold; font-size: var(--fs-base);">=</div>
        <div style="width: 100px;">
          <label class="form-label text-2xs fw-semibold text-muted" style="margin-bottom: 2px;">Isi / Faktor *</label>
          <input type="number" step="0.001" class="input input-num sat-faktor" placeholder="Cth: 24" value="${s.faktor || ''}">
        </div>
        <div style="padding-bottom: 10px;" class="text-xs fw-semibold text-muted satuan-dasar-label">
          ${escapeHtml($('#prd-satuan', form).value || 'pcs')}
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
    formatInputRp(row.querySelector('.sat-ritel'));
    row.querySelector('.btn-hapus-baris-satuan').addEventListener('click', () => row.remove());
    wadahSatuan.appendChild(row);
  };

  if (isEdit && produk.satuan_konversi) {
    produk.satuan_konversi.forEach((s) => renderBarisSatuan(s));
  }
  $('#btn-tambah-baris-satuan', form)?.addEventListener('click', () => renderBarisSatuan());

  // Buka dialog panduan lengkap dari tombol di Tab 3
  $('#btn-buka-panduan-lengkap-varian', form)?.addEventListener('click', () => {
    bukaModalPanduanVarianSatuan();
  });

  // Sinkronisasi dinamis nama satuan dasar ke baris konversi
  $('#prd-satuan', form)?.addEventListener('input', (e) => {
    const val = (e.target.value || '').trim() || 'pcs';
    form.querySelectorAll('.satuan-dasar-label').forEach((el) => {
      el.textContent = val;
    });
  });

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

    const satuan_dasar = ($('#prd-satuan', form).value || '').trim() || 'pcs';
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
        const vRitel = parseRupiah(b.querySelector('.var-ritel').value);
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
        if (hpp > 0 && vRitel < hpp) {
          switchTab('varian');
          b.querySelector('.var-ritel').focus();
          showToast(`Harga varian "${vNama}" tidak boleh di bawah HPP!`, 'error');
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
          hpp: hpp,
          harga_ritel: vRitel,
          harga_grosir: vRitel,
          stok: parseFloat(b.querySelector('.var-stok').value) || 0
        });
      }
    }

    // Susun data satuan konversi
    const satuan_konversi = [];
    const barisSatuan = form.querySelectorAll('.baris-satuan');
    for (const s of barisSatuan) {
      const sNama = s.querySelector('.sat-nama').value.trim();
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
      id: isEdit ? produk.id : undefined,
      nama, sku, barcode, kategori_id, satuan_dasar,
      hpp, harga_ritel, harga_grosir, min_grosir_qty,
      stok, stok_min, aktif, punya_varian,
      foto_url,
      varian, satuan_konversi
    };

    const btnSimpan = $('#btn-simpan-produk', form);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;
    isSubmitting = true;

    try {
      if (isEdit) {
        await apiCall('produk.update', payload);
        showToast('Data produk berhasil diperbarui.', 'success');
      } else {
        await apiCall('produk.create', payload);
        showToast('Produk baru berhasil ditambahkan.', 'success');
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


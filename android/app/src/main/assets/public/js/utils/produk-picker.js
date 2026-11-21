/**
 * produk-picker.js — Modal / Bottom Sheet Katalog Pemilih Produk Reusable
 * Memberikan ruang lega untuk memilih produk & varian di desktop maupun mobile
 * (digunakan oleh POS Pembelian, Stok Opname, dan Kartu Stok).
 */

import { apiCall } from '../api.js';
import { ICONS, showModal } from './ui.js';
import { escapeHtml, formatRupiah, formatQty, formatSkuLabel } from './format.js';

/**
 * Meratakan daftar produk (dan varian jika ada) menjadi daftar baris siap pilih.
 * @param {Array} produkList
 * @param {boolean} [expandVariants=true]
 * @returns {Array}
 */
function flattenProdukItems(produkList, expandVariants = true) {
  const rows = [];
  (produkList || []).forEach((p) => {
    const satuanDasar = p.satuan_dasar || 'Pcs';
    const kategoriId = String(p.kategori_id || '');
    const kategoriNama = p.nama_kategori || p.kategori_nama || '';

    if (expandVariants && p.punya_varian && Array.isArray(p.varian) && p.varian.length > 0) {
      p.varian.forEach((v) => {
        const skuVal = v.sku || p.sku || '';
        const barcodeVal = v.barcode || p.barcode || '';
        rows.push({
          id: p.id,
          varian_id: v.id || '',
          nama: `${p.nama} - ${v.nama_varian}`,
          nama_induk: p.nama,
          nama_varian: v.nama_varian || '',
          sku: skuVal,
          barcode: barcodeVal,
          satuan_dasar: satuanDasar,
          stok: Number(v.stok || 0),
          stok_min: Number(v.stok_min ?? p.stok_min ?? 0),
          hpp: Number(v.hpp || p.hpp || 0),
          harga_jual: Number(v.harga_jual || p.harga_jual || 0),
          kategori_id: kategoriId,
          kategori_nama: kategoriNama,
          foto_url: p.foto_url || ''
        });
      });
    } else {
      rows.push({
        id: p.id,
        varian_id: '',
        nama: p.nama,
        nama_induk: p.nama,
        nama_varian: '',
        sku: p.sku || '',
        barcode: p.barcode || '',
        satuan_dasar: satuanDasar,
        stok: Number(p.stok || 0),
        stok_min: Number(p.stok_min || 0),
        hpp: Number(p.hpp || 0),
        harga_jual: Number(p.harga_jual || 0),
        kategori_id: kategoriId,
        kategori_nama: kategoriNama,
        foto_url: p.foto_url || ''
      });
    }
  });
  return rows;
}

/**
 * Buka Modal (Desktop) / Bottom Sheet (Mobile) Katalog Pemilih Produk yang lega.
 * @param {Object} options
 * @param {string} [options.title='Pilih Produk dari Katalog']
 * @param {'beli'|'opname'|'kartu-stok'} [options.mode='beli']
 * @param {string} [options.initialQuery='']
 * @param {Function} options.onSelect - Callback menerima objek item terpilih
 * @returns {{ close: Function, el: HTMLElement }}
 */
export function bukaModalPilihProduk({
  title = 'Pilih Produk dari Katalog',
  mode = 'beli',
  initialQuery = '',
  multiSelect = false,
  onSelect,
  onSelectMultiple = null
}) {
  const expandVariants = mode !== 'kartu-stok';
  const aktifSaja = mode !== 'kartu-stok';
  const allowMulti = Boolean(multiSelect && typeof onSelectMultiple === 'function');
  const selectedMap = new Map();
  let isMultiActive = allowMulti;
  let currentFilteredRows = [];

  const getRowKey = (item) => `${item.id}::${item.varian_id || ''}`;

  const bodyHtml = `
    <div class="prod-picker-wrap">
      <div class="prod-picker-toolbar">
        <div class="prod-picker-search-row">
          <div class="input-group grow">
            <span class="input-icon">${ICONS.search}</span>
            <input
              type="search"
              class="input"
              id="picker-search-input"
              placeholder="Cari nama produk, varian, SKU, atau barcode..."
              value="${escapeHtml(initialQuery)}"
              autocomplete="off"
            >
          </div>
          <select class="input prod-picker-cat-select" id="picker-kategori-select" aria-label="Filter Kategori">
            <option value="">Semua Kategori</option>
          </select>
        </div>

        <div class="prod-picker-filter-row">
          <div class="prod-picker-chips" id="picker-stok-chips" role="group" aria-label="Filter Stok">
            <button type="button" class="prod-picker-chip is-active" data-stok-filter="semua">Semua</button>
            <button type="button" class="prod-picker-chip" data-stok-filter="tersedia">Stok Tersedia</button>
            <button type="button" class="prod-picker-chip" data-stok-filter="habis">Stok Habis / Menipis</button>
            ${allowMulti ? `
              <button type="button" class="prod-picker-chip is-active" id="picker-toggle-multi" title="Aktifkan/Matikan Mode Tandai Banyak">
                ${ICONS.check} Mode Tandai Banyak
              </button>
            ` : ''}
          </div>
          <span class="prod-picker-count" id="picker-count-label">Memuat katalog...</span>
        </div>
      </div>

      <div class="prod-picker-list-area" id="picker-list-area">
        <div class="prod-picker-loading">
          <div class="spinner" aria-hidden="true"></div>
          <span>Memuat daftar produk...</span>
        </div>
      </div>
    </div>
  `;

  const footerHtml = allowMulti ? `
    <div class="row-between items-center" style="width: 100%; gap: var(--sp-2); flex-wrap: wrap;">
      <div class="row" style="gap: 6px; align-items: center;">
        <button type="button" class="btn btn-secondary btn-sm" id="picker-btn-select-all">Tandai Tampil</button>
        <button type="button" class="btn btn-ghost btn-sm" id="picker-btn-clear-sel">Kosongkan</button>
        <span class="text-xs text-muted fw-semibold" id="picker-selected-label">0 ditandai</span>
      </div>
      <div class="row" style="gap: 6px; align-items: center;">
        <button type="button" class="btn btn-secondary btn-sm" id="picker-btn-tutup">Tutup</button>
        <button type="button" class="btn btn-primary btn-sm" id="picker-btn-confirm-multi" disabled>
          ${ICONS.check}
          <span>Tambahkan Terpilih</span>
        </button>
      </div>
    </div>
  ` : `
    <div class="row-between items-center" style="width: 100%; gap: var(--sp-2);">
      <span class="text-xs text-muted">Ketuk produk untuk langsung memilih</span>
      <button type="button" class="btn btn-secondary" id="picker-btn-tutup">Tutup</button>
    </div>
  `;

  let allRows = [];
  let loadedFull = false;
  let activeStokFilter = 'semua';
  let serverSearchTimer = null;
  let isClosed = false;

  const modal = showModal({
    title,
    body: bodyHtml,
    footer: footerHtml,
    size: 'lg',
    onClose: () => {
      isClosed = true;
      clearTimeout(serverSearchTimer);
    }
  });

  const inputCari = modal.el.querySelector('#picker-search-input');
  const selectKat = modal.el.querySelector('#picker-kategori-select');
  const chipsWrap = modal.el.querySelector('#picker-stok-chips');
  const countLabel = modal.el.querySelector('#picker-count-label');
  const listArea = modal.el.querySelector('#picker-list-area');
  const btnToggleMulti = modal.el.querySelector('#picker-toggle-multi');
  const lblSelected = modal.el.querySelector('#picker-selected-label');
  const btnConfirmMulti = modal.el.querySelector('#picker-btn-confirm-multi');

  const syncMultiFooter = () => {
    if (!allowMulti) return;
    const cnt = selectedMap.size;
    if (lblSelected) lblSelected.textContent = `${cnt} ditandai`;
    if (btnConfirmMulti) {
      btnConfirmMulti.disabled = cnt === 0;
      btnConfirmMulti.innerHTML = `${ICONS.check}<span>${cnt > 0 ? `Tambahkan ${cnt} Produk` : 'Tambahkan Terpilih'}</span>`;
    }
  };

  modal.el.querySelector('#picker-btn-tutup')?.addEventListener('click', () => modal.close());

  btnToggleMulti?.addEventListener('click', () => {
    isMultiActive = !isMultiActive;
    btnToggleMulti.classList.toggle('is-active', isMultiActive);
    if (!isMultiActive) selectedMap.clear();
    syncMultiFooter();
    renderRows(currentFilteredRows);
  });

  modal.el.querySelector('#picker-btn-select-all')?.addEventListener('click', () => {
    if (!isMultiActive) {
      isMultiActive = true;
      btnToggleMulti?.classList.add('is-active');
    }
    currentFilteredRows.forEach((item) => selectedMap.set(getRowKey(item), item));
    syncMultiFooter();
    renderRows(currentFilteredRows);
  });

  modal.el.querySelector('#picker-btn-clear-sel')?.addEventListener('click', () => {
    selectedMap.clear();
    syncMultiFooter();
    renderRows(currentFilteredRows);
  });

  btnConfirmMulti?.addEventListener('click', () => {
    const chosenList = Array.from(selectedMap.values());
    if (!chosenList.length) return;
    modal.close();
    if (chosenList.length === 1 && typeof onSelect === 'function') {
      onSelect(chosenList[0]);
    } else if (typeof onSelectMultiple === 'function') {
      onSelectMultiple(chosenList);
    }
  });

  function getFilteredRows(sourceRows) {
    const q = (inputCari?.value || '').trim().toLowerCase();
    const katId = selectKat?.value || '';

    return sourceRows.filter((item) => {
      if (katId && String(item.kategori_id) !== katId) return false;

      if (activeStokFilter === 'tersedia' && item.stok <= 0) return false;
      if (activeStokFilter === 'habis' && item.stok > Math.max(0, item.stok_min)) return false;

      if (q) {
        const hay = `${item.nama} ${item.sku} ${item.barcode} ${item.kategori_nama}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderRows(rows) {
    if (!listArea || isClosed) return;
    currentFilteredRows = rows;

    if (countLabel) {
      countLabel.textContent = `${rows.length} item ditampilkan`;
    }

    if (!rows.length) {
      const q = (inputCari?.value || '').trim();
      listArea.innerHTML = `
        <div class="prod-picker-empty">
          <div class="prod-picker-empty-icon">${ICONS.box}</div>
          <div class="fw-semibold text-sm">${q ? `Produk "${escapeHtml(q)}" tidak ditemukan` : 'Belum ada produk yang cocok'}</div>
          <div class="text-xs text-muted">Coba ubah kata kunci pencarian atau pilih kategori lain.</div>
        </div>
      `;
      return;
    }

    const html = rows.map((item, idx) => {
      const skuFmt = formatSkuLabel(item.sku);
      const skuBadge = skuFmt ? `<span class="badge badge-secondary">${escapeHtml(skuFmt)}</span>` : '';
      const katBadge = item.kategori_nama
        ? `<span class="badge badge-info">${escapeHtml(item.kategori_nama)}</span>`
        : '';
      const stokClass = item.stok <= 0 ? 'badge-danger' : (item.stok_min > 0 && item.stok <= item.stok_min ? 'badge-warning' : 'badge-success');
      const stokBadge = `<span class="badge ${stokClass}">Stok: ${formatQty(item.stok)} ${escapeHtml(item.satuan_dasar)}</span>`;
      const isSelected = isMultiActive && selectedMap.has(getRowKey(item));

      let sideLabel = 'HPP / Beli';
      let sideValue = formatRupiah(item.hpp);
      if (mode === 'opname' || mode === 'kartu-stok') {
        sideLabel = 'Stok Sistem';
        sideValue = `${formatQty(item.stok)} ${escapeHtml(item.satuan_dasar)}`;
      }

      const titleHtml = item.nama_varian
        ? `${escapeHtml(item.nama_induk)} <span class="prod-picker-variant">• ${escapeHtml(item.nama_varian)}</span>`
        : escapeHtml(item.nama);

      return `
        <button type="button" class="prod-picker-item ${isSelected ? 'is-bulk-selected' : ''}" data-picker-idx="${idx}">
          ${isMultiActive
          ? `<div class="prod-picker-check">${ICONS.check}</div>`
          : `<div class="prod-picker-item-icon">${ICONS.box}</div>`
        }
          <div class="prod-picker-item-main">
            <div class="prod-picker-item-title">${titleHtml}</div>
            <div class="prod-picker-item-meta">
              ${skuBadge}
              ${stokBadge}
              ${katBadge}
            </div>
          </div>
          <div class="prod-picker-item-side">
            <div class="prod-picker-side-label">${sideLabel}</div>
            <div class="prod-picker-side-value tabular">${sideValue}</div>
          </div>
        </button>
      `;
    }).join('');

    listArea.innerHTML = `<div class="prod-picker-grid">${html}</div>`;

    listArea.querySelectorAll('.prod-picker-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-picker-idx'));
        const chosen = rows[idx];
        if (!chosen) return;

        if (isMultiActive) {
          const k = getRowKey(chosen);
          if (selectedMap.has(k)) {
            selectedMap.delete(k);
            btn.classList.remove('is-bulk-selected');
          } else {
            selectedMap.set(k, chosen);
            btn.classList.add('is-bulk-selected');
          }
          syncMultiFooter();
          return;
        }

        modal.close();
        if (typeof onSelect === 'function') {
          onSelect(chosen);
        }
      });
    });
  }

  function applyFilter() {
    const filtered = getFilteredRows(allRows);
    renderRows(filtered);

    // Fallback ke pencarian server bila katalog besar (>250 item) dan hasil lokal kosong
    const q = (inputCari?.value || '').trim();
    if (!loadedFull && q.length >= 2 && filtered.length === 0) {
      clearTimeout(serverSearchTimer);
      serverSearchTimer = setTimeout(async () => {
        if (isClosed) return;
        try {
          if (countLabel) countLabel.textContent = 'Mencari di server...';
          const res = await apiCall('produk.list', { q, limit: 50, aktif_saja: aktifSaja });
          if (isClosed) return;
          const serverRows = flattenProdukItems(res.items || [], expandVariants);
          renderRows(getFilteredRows(serverRows));
        } catch (err) {
          console.warn('Gagal pencarian server katalog:', err);
        }
      }, 280);
    }
  }

  inputCari?.addEventListener('input', applyFilter);
  selectKat?.addEventListener('change', applyFilter);

  chipsWrap?.querySelectorAll('.prod-picker-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeStokFilter = chip.getAttribute('data-stok-filter') || 'semua';
      chipsWrap.querySelectorAll('.prod-picker-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      applyFilter();
    });
  });

  // Muat kategori & produk secara paralel
  (async () => {
    try {
      const [resProd, resKat] = await Promise.all([
        apiCall('produk.list', { limit: 250, aktif_saja: aktifSaja }),
        apiCall('kategori.list', {}).catch(() => ({ items: [] }))
      ]);
      if (isClosed) return;

      const katMap = new Map();
      const katList = resKat.items || [];
      if (selectKat) {
        let opts = '<option value="">Semua Kategori</option>';
        katList.forEach((k) => {
          katMap.set(String(k.id), k.nama);
          opts += `<option value="${escapeHtml(k.id)}">${escapeHtml(k.nama)}</option>`;
        });
        selectKat.innerHTML = opts;
      }

      const rawProds = (resProd.items || []).map((p) => ({
        ...p,
        nama_kategori: p.nama_kategori || p.kategori_nama || katMap.get(String(p.kategori_id || '')) || ''
      }));

      allRows = flattenProdukItems(rawProds, expandVariants);
      const totalServer = Number(resProd.total || rawProds.length);
      loadedFull = rawProds.length >= totalServer;

      applyFilter();
      setTimeout(() => inputCari?.focus(), 60);
    } catch (err) {
      if (isClosed) return;
      if (listArea) {
        listArea.innerHTML = `
          <div class="alert alert-danger">
            ${ICONS.alertTriangle}
            <div>Gagal memuat katalog produk: ${escapeHtml(err.message)}</div>
          </div>
        `;
      }
      if (countLabel) countLabel.textContent = 'Gagal memuat';
    }
  })();

  return modal;
}

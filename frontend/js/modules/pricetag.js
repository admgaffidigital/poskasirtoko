/**
 * pricetag.js — Modul Cetak Price Tag & Label Rak Material Toko Bangunan
 * Sesuai Fase 5 Roadmap POS Kasir Toko Bangunan
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatTanggal } from '../utils/format.js';
import { generateBarcodeSvg } from '../utils/barcode.js';

export async function renderPriceTagModule(container) {
  container.innerHTML = `
    <div class="stack no-print">
      <div class="page-header">
        <div>
          <h2>Cetak Price Tag & Label Rak</h2>
          <p>Pembuat label harga rak material bangunan dengan barcode, satuan jual, dan harga grosir</p>
        </div>
        <div class="row" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-primary" id="btn-cetak-label-semua">
            ${ICONS.printer}
            <span>Cetak Label Terpilih</span>
          </button>
        </div>
      </div>

      <div class="grid grid-2" style="gap: var(--sp-4); align-items: flex-start;">
        <!-- Kolom Kiri: Pemilihan Produk & Format -->
        <div class="card card-body stack">
          <h3 style="margin-bottom: var(--sp-1);">1. Pilih Produk & Pengaturan Label</h3>
          
          <div class="field">
            <label class="field-label" for="search-ptag-produk">Cari Produk / SKU</label>
            <div class="input-group">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-ptag-produk" placeholder="Cari nama semen, besi, cat, keramik, SKU...">
            </div>
          </div>

          <div class="row" style="gap: var(--sp-2); align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: var(--sp-2);">
            <div class="row" style="gap: var(--sp-2); align-items: center;">
              <button type="button" class="btn btn-xs btn-secondary" id="btn-pilih-semua-ptag">Pilih Semua</button>
              <button type="button" class="btn btn-xs btn-ghost" id="btn-batal-semua-ptag">Kosongkan</button>
            </div>
            <span class="text-xs text-muted fw-semibold" id="label-terpilih-count">0 produk dipilih</span>
          </div>

          <!-- Daftar Produk dengan Checkbox -->
          <div id="area-list-produk-ptag" style="max-height: 320px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-2);">
            ${renderSkeleton(4)}
          </div>

          <div class="card card-body stack" style="background: var(--surface-2); padding: var(--sp-3); margin-top: var(--sp-2); gap: var(--sp-2);">
            <span class="fw-semibold text-xs text-muted uppercase">2. TEMPLATE UKURAN & TAMPILAN LABEL</span>
            
            <div class="row" style="gap: var(--sp-2);">
              <div class="field grow">
                <label class="field-label" for="select-template-label">Ukuran Kertas / Label Rak</label>
                <select class="input" id="select-template-label">
                  <option value="standar" selected>Standar Rak Toko (60 x 40 mm)</option>
                  <option value="kompak">Kompak Gondola (70 x 30 mm)</option>
                  <option value="display">Display Pallet / Promo (100 x 60 mm)</option>
                  <option value="a4">Kertas HVS A4 Grid (24 Label)</option>
                </select>
              </div>

              <div class="field" style="width: 140px;">
                <label class="field-label" for="input-jumlah-salinan">Salinan per Item</label>
                <input type="number" class="input input-num fw-bold" id="input-jumlah-salinan" min="1" max="100" value="1">
              </div>
            </div>

            <div class="stack" style="gap: var(--sp-2); margin-top: var(--sp-1);">
              <label style="display: flex; align-items: center; gap: 10px; font-size: var(--fs-xs); cursor: pointer; user-select: none;">
                <input type="checkbox" id="check-show-barcode" checked style="width: 18px; height: 18px; accent-color: var(--primary);">
                <span class="fw-medium">Tampilkan Barcode SVG & SKU</span>
              </label>
              <label style="display: flex; align-items: center; gap: 10px; font-size: var(--fs-xs); cursor: pointer; user-select: none;">
                <input type="checkbox" id="check-show-grosir" checked style="width: 18px; height: 18px; accent-color: var(--primary);">
                <span class="fw-medium">Tampilkan Harga Grosir (di bawah harga ritel)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 10px; font-size: var(--fs-xs); cursor: pointer; user-select: none;">
                <input type="checkbox" id="check-show-toko" checked style="width: 18px; height: 18px; accent-color: var(--primary);">
                <span class="fw-medium">Tampilkan Header Nama Toko</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Kolom Kanan: Live Preview Pratinjau Price Tag -->
        <div class="card card-body stack ptag-preview-sticky">
          <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: var(--sp-2);">
            <h3 style="margin: 0;">Pratinjau Hasil Cetak</h3>
            <span class="badge badge-info text-xs" id="badge-template-aktif">Ukuran: 60 x 40 mm</span>
          </div>

          <div id="area-preview-ptag" class="ptag-preview-box">
            <div class="text-muted text-xs text-center" style="margin-top: 80px;">
              ${ICONS.printer}
              <div style="margin-top: var(--sp-1);">Centang produk untuk melihat pratinjau label harga rak</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Area Khusus Cetak (Hanya tampil saat print) -->
    <div id="print-area-ptag" class="only-print"></div>
  `;

  // Suntikkan style print khusus Price Tag jika belum ada
  if (!document.getElementById('style-pricetag-print')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'style-pricetag-print';
    styleEl.innerHTML = `
      @media screen {
        .only-print { display: none !important; }
      }
      @media print {
        body * { visibility: hidden; }
        .no-print, .sidebar, .topbar, .bottom-nav { display: none !important; }
        #print-area-ptag, #print-area-ptag * { visibility: visible; }
        #print-area-ptag {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          display: flex !important;
          flex-wrap: wrap;
          gap: 4mm;
          padding: 2mm;
          background: #ffffff !important;
        }
        .ptag-card-print {
          page-break-inside: avoid;
          box-shadow: none !important;
          border: 1px dashed #718096 !important;
          color: #000000 !important;
          background: #ffffff !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  let semuaProduk = [];
  const terpilihIds = new Set();

  const areaList = $('#area-list-produk-ptag', container);
  const areaPreview = $('#area-preview-ptag', container);
  const printArea = $('#print-area-ptag', container);
  const lblCount = $('#label-terpilih-count', container);

  const selTemplate = $('#select-template-label', container);
  const inputSalinan = $('#input-jumlah-salinan', container);
  const chkBarcode = $('#check-show-barcode', container);
  const chkGrosir = $('#check-show-grosir', container);
  const chkToko = $('#check-show-toko', container);

  // Fungsi Render Pratinjau & Print Area
  const updatePreview = () => {
    lblCount.textContent = `${terpilihIds.size} produk dipilih`;
    if (terpilihIds.size === 0) {
      areaPreview.innerHTML = `
        <div class="text-muted text-xs text-center" style="margin-top: 80px;">
          ${ICONS.printer}
          <div style="margin-top: var(--sp-1);">Centang produk untuk melihat pratinjau label harga rak</div>
        </div>
      `;
      printArea.innerHTML = '';
      return;
    }

    const tpl = selTemplate.value;
    const showBarcode = chkBarcode.checked;
    const showGrosir = chkGrosir.checked;
    const showToko = chkToko.checked;
    const salinan = Math.max(1, parseInt(inputSalinan.value || 1, 10));

    // Nama toko dari state/pengaturan
    const user = store.get('user');
    const namaToko = 'TOKO BANGUNAN';
    const tglHariIni = formatTanggal(new Date());

    let cardWidth = '240px';
    let cardHeight = '150px';
    if (tpl === 'kompak') { cardWidth = '270px'; cardHeight = '120px'; }
    if (tpl === 'display') { cardWidth = '340px'; cardHeight = '210px'; }
    if (tpl === 'a4') { cardWidth = '220px'; cardHeight = '130px'; }

    const badges = {
      standar: 'Ukuran: 60 x 40 mm (Standar)',
      kompak: 'Ukuran: 70 x 30 mm (Kompak Gondola)',
      display: 'Ukuran: 100 x 60 mm (Display Pallet)',
      a4: 'Ukuran: Kertas A4 Grid (24 Label)'
    };
    $('#badge-template-aktif', container).textContent = badges[tpl] || badges.standar;

    const cardsHtml = [];
    terpilihIds.forEach((id) => {
      const prod = semuaProduk.find((p) => p.id === id);
      if (!prod) return;

      const barcodeValue = prod.barcode || prod.sku || prod.id.substring(0, 8);
      const barcodeSvg = showBarcode ? generateBarcodeSvg(barcodeValue, { height: tpl === 'kompak' ? 30 : 40, showText: true }) : '';

      const card = `
        <div class="ptag-card ptag-card-print" style="
          width: ${cardWidth};
          min-height: ${cardHeight};
          background: #ffffff;
          border: 1px solid #1a202c;
          border-radius: 4px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #000000;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          <!-- Header Label -->
          <div>
            ${showToko ? `
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin-bottom: 4px; display: flex; justify-content: space-between;">
                <span>${escapeHtml(namaToko)}</span>
                <span style="font-size: 8px; font-weight: normal; color: #4a5568;">${tglHariIni}</span>
              </div>
            ` : ''}

            <div style="font-size: ${tpl === 'display' ? '16px' : '13px'}; font-weight: 800; line-height: 1.2; text-transform: uppercase; color: #1a202c; margin-bottom: 4px;">
              ${escapeHtml(prod.nama)}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 10px; font-weight: 600; background: #edf2f7; padding: 1px 4px; border-radius: 2px;">
                SATUAN: ${escapeHtml((prod.satuan_dasar || 'PCS').toUpperCase())}
              </span>
              <span style="font-size: 9px; font-family: monospace; color: #4a5568;">
                SKU: ${escapeHtml(prod.sku || '-')}
              </span>
            </div>
          </div>

          <!-- Bagian Harga Ritel & Grosir -->
          <div style="margin: 4px 0; text-align: center;">
            <div style="font-size: ${tpl === 'display' ? '28px' : '22px'}; font-weight: 900; color: #c53030; line-height: 1;">
              ${formatRupiah(prod.harga_ritel)}
            </div>
            ${showGrosir && prod.harga_grosir ? `
              <div style="font-size: 10px; font-weight: 600; color: #2b6cb0; margin-top: 2px;">
                Grosir: ${formatRupiah(prod.harga_grosir)}
              </div>
            ` : ''}
          </div>

          <!-- Barcode SVG -->
          ${showBarcode ? `
            <div style="margin-top: 2px;">
              ${barcodeSvg}
            </div>
          ` : ''}
        </div>
      `;

      for (let s = 0; s < salinan; s++) {
        cardsHtml.push(card);
      }
    });

    areaPreview.innerHTML = cardsHtml.join('');
    printArea.innerHTML = cardsHtml.join('');
  };

  // Muat daftar produk dari backend
  try {
    const resP = await apiCall('produk.list', { limit: 200, aktif_saja: true });
    semuaProduk = resP.items || [];

    const renderDaftarChecklist = (list) => {
      if (list.length === 0) {
        areaList.innerHTML = '<div class="text-xs text-muted" style="padding: var(--sp-2);">Produk tidak ditemukan</div>';
        return;
      }

      areaList.innerHTML = list.map((p) => {
        const isChecked = terpilihIds.has(p.id);
        const stok = Number(p.stok || 0);
        return `
          <label class="ptag-prod-item ${isChecked ? 'is-selected' : ''}">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <input type="checkbox" class="cb-ptag-item" data-id="${escapeHtml(p.id)}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--primary);">
              <div style="min-width: 0;">
                <div class="fw-semibold text-sm" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.nama)}</div>
                <div class="text-xs text-muted" style="display: flex; gap: 6px; align-items: center; margin-top: 2px; flex-wrap: wrap;">
                  ${(p.sku && p.sku !== '-') ? `<span class="badge badge-secondary" style="font-size: 10px; padding: 1px 5px;">SKU: ${escapeHtml(p.sku)}</span>` : ''}
                  <span>${escapeHtml(p.satuan_dasar || '')}</span>
                  <span class="badge ${stok > 0 ? 'badge-success' : 'badge-danger'}" style="font-size: 10px; padding: 1px 6px;">Stok: ${formatQty(stok)}</span>
                </div>
              </div>
            </div>
            <div class="fw-bold mono text-sm" style="color: var(--primary); white-space: nowrap;">${formatRupiah(p.harga_ritel)}</div>
          </label>
        `;
      }).join('');

      areaList.querySelectorAll('.cb-ptag-item').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id = cb.getAttribute('data-id');
          const parentLabel = cb.closest('.ptag-prod-item');
          if (cb.checked) {
            terpilihIds.add(id);
            if (parentLabel) parentLabel.classList.add('is-selected');
          } else {
            terpilihIds.delete(id);
            if (parentLabel) parentLabel.classList.remove('is-selected');
          }
          updatePreview();
        });
      });
    };

    renderDaftarChecklist(semuaProduk);

    // Filter Pencarian
    const inputSearch = $('#search-ptag-produk', container);
    inputSearch?.addEventListener('input', () => {
      const q = inputSearch.value.trim().toLowerCase();
      const filtered = semuaProduk.filter((p) => {
        return p.nama.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q));
      });
      renderDaftarChecklist(filtered);
    });

    // Tombol Pilih Semua / Kosongkan
    $('#btn-pilih-semua-ptag', container)?.addEventListener('click', () => {
      semuaProduk.forEach((p) => terpilihIds.add(p.id));
      renderDaftarChecklist(semuaProduk);
      updatePreview();
    });

    $('#btn-batal-semua-ptag', container)?.addEventListener('click', () => {
      terpilihIds.clear();
      renderDaftarChecklist(semuaProduk);
      updatePreview();
    });

    // Pilihan Template & Opsi
    selTemplate?.addEventListener('change', updatePreview);
    inputSalinan?.addEventListener('input', updatePreview);
    chkBarcode?.addEventListener('change', updatePreview);
    chkGrosir?.addEventListener('change', updatePreview);
    chkToko?.addEventListener('change', updatePreview);

    // Tombol Cetak
    $('#btn-cetak-label-semua', container)?.addEventListener('click', () => {
      if (terpilihIds.size === 0) {
        showToast('Pilih minimal satu produk untuk dicetak label harganya', 'warning');
        return;
      }
      window.print();
    });

  } catch (err) {
    areaList.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat katalog produk')}</div>`;
  }
}


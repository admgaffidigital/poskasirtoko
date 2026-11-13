/**
 * opname.js — Modul Stok Opname Fisik vs Sistem (Owner & Admin)
 * Sesuai Fase 3 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #8 & #12
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatQty, parseQty, formatTanggal } from '../utils/format.js';
import { bukaKameraScanner } from '../utils/barcode.js';

export async function renderOpnameModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Stok Opname Fisik Gudang</h2>
          <p>Pemeriksaan dan penyesuaian kuantitas fisik riil vs catatan sistem beserta alasan selisih</p>
        </div>
        ${canEdit ? `
          <div>
            <button type="button" class="btn btn-primary" id="btn-tambah-opname">
              <span>+ Input Opname Baru</span>
            </button>
          </div>
        ` : ''}
      </div>

      <div class="card card-body stack">
        <!-- Filter Bar -->
        <div class="row" style="gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap;">
          <div class="field" style="width: 160px;">
            <label class="field-label" for="filter-opname-status">Status</label>
            <select class="input" id="filter-opname-status">
              <option value="">Semua Status</option>
              <option value="disetujui">Disetujui</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div class="field grow">
            <label class="field-label" for="search-opname">Cari Dokumen</label>
            <div class="input-group">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-opname" placeholder="Cari no opname, nama produk, atau alasan...">
            </div>
          </div>

          <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-opname" title="Muat Ulang" style="margin-bottom: 2px;">
            ${ICONS.refresh}
          </button>
        </div>

        <div id="area-tabel-opname" style="margin-top: var(--sp-2);">
          ${renderSkeleton(4)}
        </div>
      </div>
    </div>
  `;

  $('#filter-opname-status', container)?.addEventListener('change', () => muatDataOpname(container, canEdit));
  $('#btn-refresh-opname', container)?.addEventListener('click', () => muatDataOpname(container, canEdit));

  let timeoutCari = null;
  $('#search-opname', container)?.addEventListener('input', (e) => {
    clearTimeout(timeoutCari);
    timeoutCari = setTimeout(() => {
      muatDataOpname(container, canEdit);
    }, 300);
  });

  if (canEdit) {
    $('#btn-tambah-opname', container)?.addEventListener('click', () => {
      bukaModalInputOpname(container);
    });
  }

  await muatDataOpname(container, canEdit);
}

async function muatDataOpname(container, canEdit) {
  const area = $('#area-tabel-opname', container);
  if (!area) return;

  const status = $('#filter-opname-status', container)?.value || '';
  const q = $('#search-opname', container)?.value.trim() || '';

  try {
    const res = await apiCall('opname.list', { status, q, limit: 100 });
    const items = res.items || [];

    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: 'Belum Ada Catatan Opname',
        text: 'Lakukan pemeriksaan fisik berkala untuk memastikan kecocokan stok fisik dan sistem.',
        icon: ICONS.clipboard,
        actionButton: canEdit ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">+ Input Opname Baru</button>` : ''
      });
      area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
        bukaModalInputOpname(container);
      });
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>No. Opname</th>
              <th>Tanggal</th>
              <th>Produk & Varian</th>
              <th style="text-align: right;">Stok Sistem</th>
              <th style="text-align: right;">Hasil Fisik</th>
              <th style="text-align: right;">Selisih</th>
              <th>Alasan Selisih</th>
              <th style="text-align: center;">Status</th>
              ${canEdit ? '<th style="width: 100px; text-align: center;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((op) => {
      const isKurang = op.selisih < 0;
      const isLebih = op.selisih > 0;
      const badgeStatus = op.status === 'disetujui' ? 'badge-success' : 'badge-warning';

      html += `
        <tr>
          <td data-label="No. Opname">
            <div class="tabular fw-bold text-sm">${escapeHtml(op.no_opname)}</div>
          </td>
          <td class="text-xs text-muted" data-label="Tanggal">
            ${formatTanggal(op.tanggal)}
          </td>
          <td data-label="Produk & Varian">
            <div class="fw-semibold">${escapeHtml(op.produk_nama)}</div>
            ${op.varian_nama ? `<div class="text-xs text-primary">${escapeHtml(op.varian_nama)}</div>` : ''}
          </td>
          <td style="text-align: right;" class="tabular" data-label="Stok Sistem">
            ${formatQty(op.qty_sistem)} ${escapeHtml(op.satuan_dasar)}
          </td>
          <td style="text-align: right;" class="tabular fw-semibold" data-label="Hasil Fisik">
            ${formatQty(op.qty_fisik)} ${escapeHtml(op.satuan_dasar)}
          </td>
          <td style="text-align: right;" class="tabular fw-bold ${isKurang ? 'text-danger' : (isLebih ? 'text-success' : 'text-muted')}" data-label="Selisih">
            ${isLebih ? '+' : ''}${formatQty(op.selisih)}
          </td>
          <td class="text-xs text-muted" style="max-width: 220px;" data-label="Alasan Selisih">
            ${escapeHtml(op.alasan || '-')}
          </td>
          <td style="text-align: center;" data-label="Status">
            <span class="badge ${badgeStatus}">
              ${op.status === 'disetujui' ? 'Disetujui' : 'Draft'}
            </span>
            ${op.penyetuju_nama ? `<div class="text-xs text-muted" style="margin-top: 2px;">oleh ${escapeHtml(op.penyetuju_nama)}</div>` : ''}
          </td>
          ${canEdit ? `
            <td style="text-align: right;" data-label="Aksi">
              <div class="table-actions">
                ${op.status === 'draft' ? `
                  <button type="button" class="btn btn-primary btn-sm btn-approve-opname" data-id="${op.id}" data-no="${escapeHtml(op.no_opname)}" title="Setujui dan sesuaikan stok">
                    Setujui
                  </button>
                ` : `
                  <span class="badge badge-success text-2xs">Selesai</span>
                `}
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
    `;

    area.innerHTML = html;

    // Event listener setujui draft
    area.querySelectorAll('.btn-approve-opname').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const no = btn.getAttribute('data-no');
        const setuju = await showConfirm({
          title: 'Persetujuan Stok Opname',
          message: `Apakah Anda yakin ingin menyetujui dokumen opname "${no}"? Stok master produk akan otomatis disesuaikan dan dicatat di Kartu Stok.`,
          confirmText: 'Ya, Setujui & Terapkan',
          cancelText: 'Batal'
        });

        if (!setuju) return;

        try {
          await apiCall('opname.approve', { id });
          showToast(`Dokumen opname ${no} berhasil disetujui.`, 'success');
          muatDataOpname(container, canEdit);
        } catch (err) {
          showToast(err.message, 'error', 4500);
        }
      });
    });
  } catch (err) {
    if (area) {
      area.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div>Gagal memuat data opname: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
}

async function bukaModalInputOpname(container) {
  const modal = showModal({
    title: 'Input Stok Opname Fisik',
    body: `
      <form id="form-input-opname" class="stack" style="gap: var(--sp-3);">
        <div class="field autocomplete-field">
          <label class="field-label" for="op-cari-produk">Pilih Produk / Varian <span class="wajib">*</span></label>
          <div class="input-group">
            <span class="input-icon">${ICONS.search}</span>
            <input type="text" class="input" id="op-cari-produk" placeholder="Ketik nama produk, SKU, atau varian..." autocomplete="off" required>
            <button type="button" class="btn btn-ghost btn-sm btn-icon" id="btn-scan-barcode-opname" title="Scan Barcode Kamera">
              ${ICONS.scan || ICONS.box}
            </button>
          </div>
          <div id="op-dropdown-produk" class="autocomplete-dropdown"></div>
        </div>

        <div class="row" style="gap: var(--sp-2);">
          <div class="field grow">
            <label class="field-label">Stok Sistem Saat Ini</label>
            <input type="text" class="input tabular" id="op-stok-sistem" value="-" readonly style="background: var(--surface-2); font-weight: 600;">
          </div>
          <div class="field grow">
            <label class="field-label" for="op-qty-fisik">Hasil Hitung Fisik <span class="wajib">*</span></label>
            <input type="number" class="input tabular fw-bold" id="op-qty-fisik" step="any" min="0" placeholder="0" required disabled>
          </div>
        </div>

        <div class="card" style="padding: var(--sp-3); background: var(--surface-2); border: 1px solid var(--border);">
          <div class="row-between text-sm">
            <span class="text-muted fw-semibold">Kalkulasi Selisih (Fisik - Sistem):</span>
            <span class="tabular fw-bold text-base" id="op-selisih-kalkulasi">-</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="op-alasan">Alasan Selisih / Catatan Pemeriksaan <span class="wajib">*</span></label>
          <textarea class="textarea" id="op-alasan" rows="3" placeholder="Cth: Barang rusak / bocor di pojok gudang, susut, atau bonus belum tercatat" required></textarea>
        </div>

        <div class="field">
          <label class="checkbox-label" style="display: flex; align-items: center; gap: var(--sp-2); cursor: pointer;">
            <input type="checkbox" id="op-langsung-setuju" checked>
            <span class="text-sm">Langsung terapkan & sesuaikan stok sistem saat disimpan</span>
          </label>
        </div>
      </form>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-ghost" id="btn-batal-opname">Batal</button>
        <button type="submit" form="form-input-opname" class="btn btn-primary" id="btn-simpan-opname" disabled>Simpan Dokumen Opname</button>
      </div>
    `
  });

  modal.el.querySelector('#btn-batal-opname')?.addEventListener('click', () => modal.close());

  let targetProduk = null;
  const inputCari = $('#op-cari-produk', modal.el);
  const dropdown = $('#op-dropdown-produk', modal.el);
  const inputStokSistem = $('#op-stok-sistem', modal.el);
  const inputQtyFisik = $('#op-qty-fisik', modal.el);
  const labelSelisih = $('#op-selisih-kalkulasi', modal.el);
  const btnSimpan = $('#btn-simpan-opname', modal.el);
  let timeoutCari = null;

  // Scan Barcode Kamera
  modal.el.querySelector('#btn-scan-barcode-opname')?.addEventListener('click', () => {
    bukaKameraScanner(async (kode) => {
      inputCari.value = kode;
      try {
        const res = await apiCall('produk.list', { q: kode, limit: 1, aktif_saja: true });
        const prods = res.items || [];
        if (prods.length > 0) {
          pilihItemOpname(prods[0].id, '', prods[0].nama, prods[0].stok, prods[0].satuan_dasar);
        } else {
          showToast(`Produk dengan barcode "${kode}" tidak ditemukan`, 'warning');
        }
      } catch (e) {
        showToast('Gagal memproses barcode: ' + e.message, 'error');
      }
    });
  });

  const pilihItemOpname = (prodId, varId, nama, stok, satuan) => {
    targetProduk = { id: prodId, varian_id: varId, nama, stok: Number(stok) || 0, satuan };
    inputCari.value = nama;
    dropdown.style.display = 'none';

    inputStokSistem.value = `${formatQty(stok)} ${satuan}`;
    inputQtyFisik.disabled = false;
    inputQtyFisik.value = stok;
    btnSimpan.disabled = false;
    updateSelisih();
    inputQtyFisik.focus();
  };

  inputCari?.addEventListener('input', () => {
    clearTimeout(timeoutCari);
    const q = inputCari.value.trim();
    if (q.length < 2) {
      if (dropdown) dropdown.style.display = 'none';
      return;
    }

    timeoutCari = setTimeout(async () => {
      try {
        const res = await apiCall('produk.list', { q, limit: 10, aktif_saja: true });
        const prods = res.items || [];
        if (!prods.length) {
          dropdown.innerHTML = `<div class="p-3 text-sm text-muted text-center">Produk "${escapeHtml(q)}" tidak ditemukan.</div>`;
          dropdown.style.display = 'block';
          return;
        }

        let html = `
          <div class="autocomplete-header">
            <span>Ditemukan ${prods.length} produk</span>
            <span>Ketuk untuk memilih</span>
          </div>
        `;
        prods.forEach((p) => {
          if (p.punya_varian && p.varian && p.varian.length) {
            p.varian.forEach((v) => {
              const skuText = v.sku || p.sku || '';
              const skuBadge = (skuText && skuText !== '-') ? `<span class="badge badge-secondary">SKU: ${escapeHtml(skuText)}</span>` : '';
              const stokVal = Number(v.stok || 0);
              const stokBadge = `<span class="badge ${stokVal > 0 ? 'badge-success' : 'badge-danger'}">Stok: ${formatQty(stokVal)} ${escapeHtml(p.satuan_dasar || 'Pcs')}</span>`;

              html += `
                <div class="autocomplete-item item-op-select"
                     data-prod-id="${p.id}" data-var-id="${v.id}" data-nama="${escapeHtml(p.nama + ' - ' + v.nama_varian)}"
                     data-stok="${v.stok}" data-satuan="${escapeHtml(p.satuan_dasar || 'Pcs')}">
                  <div class="autocomplete-item-icon">
                    ${ICONS.box}
                  </div>
                  <div class="autocomplete-item-main">
                    <div class="autocomplete-item-title">${escapeHtml(p.nama)} <span class="text-primary font-normal">• ${escapeHtml(v.nama_varian)}</span></div>
                    <div class="autocomplete-item-meta">
                      ${skuBadge}
                      ${stokBadge}
                    </div>
                  </div>
                  <div class="autocomplete-item-side">
                    <div class="autocomplete-item-side-label">Stok Sistem</div>
                    <div class="autocomplete-item-side-value">${formatQty(v.stok)} ${escapeHtml(p.satuan_dasar || 'Pcs')}</div>
                  </div>
                </div>
              `;
            });
          } else {
            const skuText = p.sku || '';
            const skuBadge = (skuText && skuText !== '-') ? `<span class="badge badge-secondary">SKU: ${escapeHtml(skuText)}</span>` : '';
            const stokVal = Number(p.stok || 0);
            const stokBadge = `<span class="badge ${stokVal > 0 ? 'badge-success' : 'badge-danger'}">Stok: ${formatQty(stokVal)} ${escapeHtml(p.satuan_dasar || 'Pcs')}</span>`;

            html += `
              <div class="autocomplete-item item-op-select"
                   data-prod-id="${p.id}" data-var-id="" data-nama="${escapeHtml(p.nama)}"
                   data-stok="${p.stok}" data-satuan="${escapeHtml(p.satuan_dasar || 'Pcs')}">
                <div class="autocomplete-item-icon">
                  ${ICONS.box}
                </div>
                <div class="autocomplete-item-main">
                  <div class="autocomplete-item-title">${escapeHtml(p.nama)}</div>
                  <div class="autocomplete-item-meta">
                    ${skuBadge}
                    ${stokBadge}
                  </div>
                </div>
                <div class="autocomplete-item-side">
                  <div class="autocomplete-item-side-label">Stok Sistem</div>
                  <div class="autocomplete-item-side-value">${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar || 'Pcs')}</div>
                </div>
              </div>
            `;
          }
        });

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.item-op-select').forEach((el) => {
          el.addEventListener('click', () => {
            const prodId = el.getAttribute('data-prod-id');
            const varId = el.getAttribute('data-var-id');
            const nama = el.getAttribute('data-nama');
            const stok = Number(el.getAttribute('data-stok')) || 0;
            const satuan = el.getAttribute('data-satuan');

            pilihItemOpname(prodId, varId, nama, stok, satuan);
          });
        });
      } catch (err) {
        console.warn('Gagal cari produk opname:', err);
      }
    }, 250);
  });

  // Sembunyikan dropdown bila klik di luar
  modal.el.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== inputCari) {
      dropdown.style.display = 'none';
    }
  });

  const updateSelisih = () => {
    if (!targetProduk) return;
    const fisik = parseQty(inputQtyFisik.value);
    const selisih = Math.round((fisik - targetProduk.stok) * 1000) / 1000;
    labelSelisih.textContent = `${selisih > 0 ? '+' : ''}${formatQty(selisih)} ${targetProduk.satuan}`;
    if (selisih < 0) {
      labelSelisih.className = 'tabular fw-bold text-base text-danger';
    } else if (selisih > 0) {
      labelSelisih.className = 'tabular fw-bold text-base text-success';
    } else {
      labelSelisih.className = 'tabular fw-bold text-base text-muted';
    }
  };

  inputQtyFisik?.addEventListener('input', updateSelisih);

  const form = $('#form-input-opname', modal.el);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!targetProduk) {
      showToast('Produk wajib dipilih.', 'warning');
      return;
    }

    const fisik = parseQty(inputQtyFisik.value);
    const alasan = $('#op-alasan', form).value.trim();
    const langsungSetuju = $('#op-langsung-setuju', form).checked;

    if (!alasan) {
      showToast('Alasan selisih opname wajib diisi.', 'warning');
      return;
    }

    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;

    try {
      const res = await apiCall('opname.create', {
        produk_id: targetProduk.id,
        varian_id: targetProduk.varian_id || '',
        qty_fisik: fisik,
        alasan: alasan,
        langsung_setuju: langsungSetuju
      });

      showToast(`Stok opname ${res.no_opname} berhasil disimpan!`, 'success');
      modal.close();
      muatDataOpname(container, true);
    } catch (err) {
      showToast(err.message, 'error', 4500);
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
    }
  });

  btnSimpan?.addEventListener('click', () => {
    form?.requestSubmit();
  });
}


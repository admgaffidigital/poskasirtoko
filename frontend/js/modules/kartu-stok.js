/**
 * kartu-stok.js — Modul Kartu Stok & Buku Besar Mutasi Barang (Owner & Admin)
 * Sesuai Fase 3 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #5
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatQty, formatTanggal } from '../utils/format.js';

export async function renderKartuStokModule(container) {
  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Buku Besar Kartu Stok</h2>
          <p>Catatan kronologis mutasi keluar-masuk barang, penyesuaian HPP, dan saldo stok fisik</p>
        </div>
      </div>

      <div class="card card-body stack">
        <!-- Filter Bar -->
        <div class="row" style="gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap;">
          <div class="field grow" style="min-width: 220px;">
            <label class="field-label" for="filter-ks-produk">Pilih Produk</label>
            <select class="input" id="filter-ks-produk">
              <option value="">-- Semua Produk --</option>
            </select>
          </div>

          <div class="field" style="width: 150px;">
            <label class="field-label" for="filter-ks-tipe">Jenis Mutasi</label>
            <select class="input" id="filter-ks-tipe">
              <option value="">Semua Mutasi</option>
              <option value="beli">Beli (Masuk)</option>
              <option value="jual">Jual (Keluar)</option>
              <option value="opname">Stok Opname</option>
              <option value="void">Void Transaksi</option>
              <option value="retur_jual">Retur Jual</option>
              <option value="retur_beli">Retur Beli</option>
            </select>
          </div>

          <div class="field" style="width: 140px;">
            <label class="field-label" for="filter-ks-dari">Dari Tanggal</label>
            <input type="date" class="input" id="filter-ks-dari">
          </div>

          <div class="field" style="width: 140px;">
            <label class="field-label" for="filter-ks-sampai">Sampai Tanggal</label>
            <input type="date" class="input" id="filter-ks-sampai">
          </div>

          <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-ks" title="Muat Ulang" style="margin-bottom: 2px;">
            ${ICONS.refresh}
          </button>
        </div>

        <div class="input-group" style="margin-top: var(--sp-1);">
          <span class="input-icon">${ICONS.search}</span>
          <input type="search" class="input" id="search-ks" placeholder="Cari nomor dokumen referensi, nama barang, SKU, atau keterangan mutasi...">
        </div>

        <!-- Tabel Riwayat Mutasi -->
        <div id="area-tabel-kartu-stok" style="margin-top: var(--sp-2);">
          ${renderSkeleton(5)}
        </div>
      </div>
    </div>
  `;

  // Muat opsi dropdown produk
  try {
    const res = await apiCall('produk.list', { limit: 200, aktif_saja: false });
    const selectProd = $('#filter-ks-produk', container);
    if (selectProd) {
      let opts = '<option value="">-- Semua Produk --</option>';
      (res.items || []).forEach((p) => {
        opts += `<option value="${p.id}">${escapeHtml(p.nama)} (${escapeHtml(p.sku || '-')})</option>`;
      });
      selectProd.innerHTML = opts;
    }
  } catch (err) {
    console.warn('Gagal memuat opsi filter produk:', err);
  }

  // Event Listeners
  const pemicuMuat = () => {
    muatDataKartuStok(container);
  };

  $('#filter-ks-produk', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-tipe', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-dari', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-sampai', container)?.addEventListener('change', pemicuMuat);
  $('#btn-refresh-ks', container)?.addEventListener('click', pemicuMuat);

  let timeoutCari = null;
  $('#search-ks', container)?.addEventListener('input', (e) => {
    clearTimeout(timeoutCari);
    timeoutCari = setTimeout(() => {
      muatDataKartuStok(container);
    }, 300);
  });

  await muatDataKartuStok(container);
}

async function muatDataKartuStok(container) {
  const area = $('#area-tabel-kartu-stok', container);
  if (!area) return;

  const produkId = $('#filter-ks-produk', container)?.value || '';
  const tipe = $('#filter-ks-tipe', container)?.value || '';
  const dari = $('#filter-ks-dari', container)?.value || '';
  const sampai = $('#filter-ks-sampai', container)?.value || '';
  const q = $('#search-ks', container)?.value.trim() || '';

  try {
    const res = await apiCall('kartuStok.list', {
      produk_id: produkId,
      tipe: tipe,
      dari: dari,
      sampai: sampai,
      q: q,
      limit: 100
    });

    const items = res.items || [];
    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: 'Tidak Ada Mutasi Stok',
        text: 'Belum ada catatan mutasi stok yang sesuai dengan kriteria filter saat ini.',
        icon: ICONS.clipboard
      });
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 140px;">Waktu</th>
              <th>Nama Produk & Varian</th>
              <th style="width: 100px;">Jenis</th>
              <th>No. Referensi</th>
              <th style="text-align: right;">Mutasi (+/-)</th>
              <th style="text-align: right;">Saldo Akhir</th>
              <th style="text-align: right;">HPP Mutasi</th>
              <th>Petugas</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((ks) => {
      const isMasuk = ks.qty > 0;
      let badgeClass = 'badge-info';
      let labelTipe = ks.tipe;

      if (ks.tipe === 'beli') {
        badgeClass = 'badge-success';
        labelTipe = 'Beli';
      } else if (ks.tipe === 'jual') {
        badgeClass = 'badge-danger';
        labelTipe = 'Jual';
      } else if (ks.tipe === 'opname') {
        badgeClass = 'badge-info';
        labelTipe = 'Opname';
      } else if (ks.tipe === 'void') {
        badgeClass = 'badge-warning';
        labelTipe = 'Void';
      }

      html += `
        <tr>
          <td class="text-xs text-muted">
            ${formatTanggal(ks.created_at)}
          </td>
          <td>
            <div class="fw-semibold">${escapeHtml(ks.produk_nama)}</div>
            ${ks.varian_nama ? `<div class="text-xs text-primary">${escapeHtml(ks.varian_nama)}</div>` : ''}
            <div class="text-xs text-muted">SKU: ${escapeHtml(ks.produk_sku || '-')}</div>
          </td>
          <td>
            <span class="badge ${badgeClass}">${labelTipe}</span>
          </td>
          <td>
            <span class="tabular fw-bold text-sm">${escapeHtml(ks.ref_id || '-')}</span>
          </td>
          <td style="text-align: right;" class="tabular fw-bold ${isMasuk ? 'text-success' : 'text-danger'}">
            ${isMasuk ? '+' : ''}${formatQty(ks.qty)} ${escapeHtml(ks.satuan_dasar)}
          </td>
          <td style="text-align: right;" class="tabular fw-semibold">
            ${formatQty(ks.saldo)} ${escapeHtml(ks.satuan_dasar)}
          </td>
          <td style="text-align: right;" class="tabular">
            ${formatRupiah(ks.hpp)}
          </td>
          <td class="text-sm">
            ${escapeHtml(ks.petugas_nama || '-')}
          </td>
          <td class="text-xs text-muted" style="max-width: 200px;">
            ${escapeHtml(ks.keterangan || '-')}
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    area.innerHTML = html;
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>Gagal memuat kartu stok: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}


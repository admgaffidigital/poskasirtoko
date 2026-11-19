/**
 * kartu-stok.js — Modul Kartu Stok & Buku Besar Mutasi Barang (Owner & Admin)
 * Sesuai Fase 3 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #5
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatQty, formatTanggal } from '../utils/format.js';

export async function renderKartuStokModule(container) {
  const user = store.get('user');
  const isOwner = user && user.role === 'owner';

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
        <div class="ks-filter-bar">
          <div class="field" style="min-width: 0;">
            <label class="field-label" for="filter-ks-produk">Pilih Produk</label>
            <select class="input" id="filter-ks-produk">
              <option value="">-- Semua Produk --</option>
            </select>
          </div>

          <div class="field" style="min-width: 0;">
            <label class="field-label" for="filter-ks-tipe">Jenis Mutasi</label>
            <select class="input" id="filter-ks-tipe">
              <option value="">Semua Mutasi</option>
              <option value="beli">Beli (Masuk)</option>
              <option value="jual">Jual (Keluar)</option>
              <option value="opname">Stok Opname</option>
              <option value="koreksi">Saldo Awal / Koreksi</option>
              <option value="void">Void Transaksi</option>
              <option value="retur_jual">Retur Jual</option>
              <option value="retur_beli">Retur Beli</option>
            </select>
          </div>

          <div class="field" style="min-width: 0;">
            <label class="field-label" for="filter-ks-dari">Dari Tanggal</label>
            <input type="date" class="input" id="filter-ks-dari">
          </div>

          <div class="field" style="min-width: 0;">
            <label class="field-label" for="filter-ks-sampai">Sampai Tanggal</label>
            <input type="date" class="input" id="filter-ks-sampai">
          </div>

          <div class="row items-center" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-icon ks-btn-refresh" id="btn-refresh-ks" title="Muat Ulang">
              ${ICONS.refresh}
            </button>
            ${isOwner ? `
              <button type="button" class="btn btn-outline-danger btn-sm" id="btn-bersihkan-sampah-ks" title="Bersihkan Mutasi Produk Terhapus (Khusus Owner)" style="display: inline-flex; align-items: center; gap: 6px; height: 40px; white-space: nowrap; padding: 0 12px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>Bersihkan Sampah</span>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="row-between items-center" style="margin-top: var(--sp-1); gap: var(--sp-2); flex-wrap: wrap;">
          <div class="input-group" style="flex: 1 1 200px; min-width: 0; width: 100%;">
            <span class="input-icon">${ICONS.search}</span>
            <input type="search" class="input" id="search-ks" placeholder="Cari nomor dokumen referensi, nama barang, SKU, atau keterangan mutasi...">
          </div>
          <label class="switch" style="cursor: pointer; display: inline-flex; align-items: center; gap: 8px; user-select: none;">
            <input type="checkbox" id="filter-ks-sembunyikan-terhapus" checked>
            <span class="switch-track"></span>
            <span class="text-xs fw-medium text-muted">Sembunyikan Produk Terhapus</span>
          </label>
        </div>

        <!-- Tabel Riwayat Mutasi -->
        <div id="area-tabel-kartu-stok" style="margin-top: var(--sp-2);">
          ${renderSkeleton(5)}
        </div>
      </div>
    </div>
  `;

  // Muat opsi dropdown produk secara paralel (non-blocking terhadap tabel kartu stok)
  const muatDropdownProdukPromise = apiCall('produk.list', { limit: 500, aktif_saja: false })
    .then((res) => {
      const selectProd = $('#filter-ks-produk', container);
      if (selectProd) {
        let opts = '<option value="">-- Semua Produk --</option>';
        (res.items || []).forEach((p) => {
          opts += `<option value="${p.id}">${escapeHtml(p.nama)} (${escapeHtml(p.sku || '-')})</option>`;
        });
        selectProd.innerHTML = opts;
      }
    })
    .catch((err) => {
      console.warn('Gagal memuat opsi filter produk:', err);
    });

  // Event Listeners
  const pemicuMuat = () => {
    muatDataKartuStok(container);
  };

  $('#filter-ks-produk', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-tipe', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-dari', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-sampai', container)?.addEventListener('change', pemicuMuat);
  $('#filter-ks-sembunyikan-terhapus', container)?.addEventListener('change', pemicuMuat);
  $('#btn-refresh-ks', container)?.addEventListener('click', async () => {
    await muatDataKartuStok(container);
    showToast('Data kartu stok berhasil diperbarui', 'success', 1800);
  });

  if (isOwner) {
    $('#btn-bersihkan-sampah-ks', container)?.addEventListener('click', async () => {
      const setuju = await showConfirm({
        title: 'Bersihkan Seluruh Mutasi Produk Terhapus?',
        message: 'Sistem akan menghapus seluruh catatan kartu stok dari produk yang sudah dihapus dari master produk toko (data sampah uji coba). Tindakan ini khusus Owner.',
        confirmText: 'Ya, Bersihkan Sampah',
        danger: true
      });

      if (!setuju) return;

      try {
        const res = await apiCall('kartuStok.bersihkanSampah', {});
        showToast(res.pesan || 'Mutasi produk terhapus berhasil dibersihkan.', 'success', 3000);
        await muatDataKartuStok(container);
      } catch (err) {
        showToast(err.message || 'Gagal membersihkan sampah kartu stok.', 'error');
      }
    });
  }

  let timeoutCari = null;
  $('#search-ks', container)?.addEventListener('input', (e) => {
    clearTimeout(timeoutCari);
    timeoutCari = setTimeout(() => {
      muatDataKartuStok(container);
    }, 300);
  });

  await Promise.all([muatDataKartuStok(container), muatDropdownProdukPromise]);
}

async function muatDataKartuStok(container) {
  const area = $('#area-tabel-kartu-stok', container);
  if (!area) return;

  const isOwner = store.get('user')?.role === 'owner';
  const produkId = $('#filter-ks-produk', container)?.value || '';
  const tipe = $('#filter-ks-tipe', container)?.value || '';
  const dari = $('#filter-ks-dari', container)?.value || '';
  const sampai = $('#filter-ks-sampai', container)?.value || '';
  const sembunyikanTerhapus = $('#filter-ks-sembunyikan-terhapus', container)?.checked ?? true;
  const q = $('#search-ks', container)?.value.trim() || '';

  try {
    const res = await apiCall('kartuStok.list', {
      produk_id: produkId,
      tipe: tipe,
      dari: dari,
      sampai: sampai,
      sembunyikan_terhapus: sembunyikanTerhapus,
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
        <table class="table table-kartu-stok">
          <thead>
            <tr>
              <th style="width: 80px; min-width: 75px; white-space: nowrap;">Waktu</th>
              <th style="min-width: 140px;">Nama Produk & Varian</th>
              <th style="width: 80px; min-width: 75px; text-align: center; white-space: nowrap;">Jenis</th>
              <th style="width: 110px; min-width: 95px; white-space: nowrap;">No. Referensi</th>
              <th style="text-align: right; width: 75px; min-width: 70px; white-space: nowrap;">Mutasi</th>
              <th style="text-align: right; width: 75px; min-width: 70px; white-space: nowrap;">Saldo</th>
              <th style="text-align: right; width: 85px; min-width: 80px; white-space: nowrap;">HPP</th>
              <th style="width: 85px; min-width: 75px; white-space: nowrap;">Petugas</th>
              <th style="min-width: 110px; max-width: 180px;">Keterangan</th>
              ${isOwner ? '<th style="width: 44px; min-width: 40px; text-align: center; white-space: nowrap;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((ks) => {
      const isMasuk = ks.qty > 0;
      let badgeClass = 'badge-info';
      let labelTipe = ks.tipe || 'Mutasi';

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
      } else if (ks.tipe === 'koreksi') {
        badgeClass = 'badge-secondary';
        labelTipe = 'Saldo Awal';
      } else if (ks.tipe === 'retur_jual') {
        badgeClass = 'badge-success';
        labelTipe = 'Retur Jual';
      } else if (ks.tipe === 'retur_beli') {
        badgeClass = 'badge-danger';
        labelTipe = 'Retur Beli';
      }

      // Pemisahan Tanggal & Waktu agar hemat ruang horizontal
      const rawTgl = formatTanggal(ks.created_at) || '-';
      const partsTgl = rawTgl.split(' ');
      const tglOnly = partsTgl[0] || rawTgl;
      const jamOnly = partsTgl.slice(1).join(' ');

      // Format No. Referensi (bersihkan UUID acak pada Saldo Awal)
      let tampilanRef = ks.ref_id || '-';
      const isSaldoAwal = ks.tipe === 'koreksi' && (tampilanRef === 'STOK-AWAL' || tampilanRef === ks.produk_id || /^[0-9a-f-]{36}$/i.test(tampilanRef));
      const refHtml = isSaldoAwal
        ? '<span class="badge badge-secondary" style="font-size: 11px; font-weight: 600; padding: 2px 7px;">STOK-AWAL</span>'
        : `<span class="tabular font-mono fw-bold text-xs" style="white-space: nowrap;">${escapeHtml(tampilanRef)}</span>`;

      html += `
        <tr>
          <td data-label="Waktu" style="white-space: nowrap;">
            <div class="tabular font-mono text-xs fw-semibold" style="line-height: 1.2;">${escapeHtml(tglOnly)}</div>
            ${jamOnly ? `<div class="tabular font-mono text-2xs text-muted" style="line-height: 1.2; margin-top: 2px;">${escapeHtml(jamOnly)}</div>` : ''}
          </td>
          <td data-label="Produk & Varian">
            <div class="cell-stack" style="gap: 2px;">
              <div class="fw-semibold text-sm" style="line-height: 1.25;">${escapeHtml(ks.produk_nama)}</div>
              ${ks.varian_nama ? `<div class="text-xs text-primary fw-medium">${escapeHtml(ks.varian_nama)}</div>` : ''}
              <div class="text-2xs text-muted font-mono">SKU: ${escapeHtml(ks.produk_sku || '-')}</div>
            </div>
          </td>
          <td data-label="Jenis" style="text-align: center; white-space: nowrap;">
            <span class="badge ${badgeClass}" style="font-size: 11px; padding: 2px 7px;">${labelTipe}</span>
          </td>
          <td data-label="No. Referensi">
            ${refHtml}
          </td>
          <td style="text-align: right; white-space: nowrap;" class="tabular font-mono text-xs fw-bold ${isMasuk ? 'text-success' : 'text-danger'}" data-label="Mutasi">
            ${isMasuk ? '+' : ''}${formatQty(ks.qty)} <span class="text-2xs fw-normal text-muted">${escapeHtml(ks.satuan_dasar)}</span>
          </td>
          <td style="text-align: right; white-space: nowrap;" class="tabular font-mono text-xs fw-semibold" data-label="Saldo Akhir">
            ${formatQty(ks.saldo)} <span class="text-2xs fw-normal text-muted">${escapeHtml(ks.satuan_dasar)}</span>
          </td>
          <td style="text-align: right; white-space: nowrap;" class="tabular font-mono text-xs" data-label="HPP Mutasi">
            ${formatRupiah(ks.hpp)}
          </td>
          <td data-label="Petugas" style="white-space: nowrap;">
            <div class="text-xs" style="max-width: 90px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(ks.petugas_nama || '-')}">
              ${escapeHtml(ks.petugas_nama || '-')}
            </div>
          </td>
          <td data-label="Keterangan" style="min-width: 110px; max-width: 180px;">
            <div class="text-xs text-muted ks-cell-keterangan" title="${escapeHtml(ks.keterangan || '-')}">
              ${escapeHtml(ks.keterangan || '-')}
            </div>
          </td>
          ${isOwner ? `
            <td data-label="Aksi" style="text-align: center; white-space: nowrap;">
              <div class="table-actions">
                <button type="button" class="btn btn-outline-danger btn-xs btn-del-ks" data-id="${ks.id}" data-nama="${escapeHtml(ks.produk_nama)}" data-ref="${escapeHtml(ks.ref_id || '-')}" title="Hapus Catatan Mutasi (Khusus Owner)" style="display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 4px 8px; border-radius: var(--radius-sm);">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span class="d-none-desktop">Hapus Catatan Mutasi</span>
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
    `;

    area.innerHTML = html;

    // Pasang handler tombol hapus per baris (khusus Owner)
    if (isOwner) {
      area.querySelectorAll('.btn-del-ks').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const nama = btn.getAttribute('data-nama');
          const ref = btn.getAttribute('data-ref');

          const setuju = await showConfirm({
            title: 'Hapus Catatan Mutasi Stok?',
            message: `Apakah Anda yakin ingin menghapus catatan mutasi "${nama}" (No. Ref: ${ref})? Tindakan ini khusus Owner untuk membersihkan data sampah/uji coba.`,
            confirmText: 'Ya, Hapus Mutasi',
            danger: true
          });

          if (!setuju) return;

          try {
            await apiCall('kartuStok.delete', { id });
            showToast('Catatan mutasi berhasil dihapus.', 'success');
            await muatDataKartuStok(container);
          } catch (err) {
            showToast(err.message || 'Gagal menghapus catatan mutasi.', 'error');
          }
        });
      });
    }
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>Gagal memuat kartu stok: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}


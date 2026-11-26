/**
 * gudang.js — Modul Gudang & Mutasi Stok Multi-Lokasi (Toko ⇄ Gudang) & Barang Rusak
 * Dapat diakses oleh semua role (Owner, Admin, Kasir) sesuai matriks otorisasi:
 * - Tab 1: Transfer Stok (Gudang → Toko: Semua Role; Toko → Gudang: Owner/Admin; Void: Owner)
 * - Tab 2: Barang Rusak / Susut (Lapor: Semua Role; Setujui/Tolak & Klaim Supplier: Owner/Admin)
 * - Tab 3: Ringkasan Stok Lokasi (Toko vs Gudang + 1-klik Isi ke Toko)
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatQty, parseQty, formatTanggal } from '../utils/format.js';
import { bukaModalPilihProduk } from '../utils/produk-picker.js';
import { cetakBonMutasiGudang } from '../utils/printer.js';

const KATEGORI_RUSAK_LIST = [
  'Pecah / Retak',
  'Membatu / Kena Air',
  'Cacat Pabrik',
  'Kedaluwarsa / Kering',
  'Hilang / Susut',
  'Lainnya'
];

export async function renderGudangModule(container) {
  const user = store.get('user') || {};
  const role = user.role || 'kasir';
  const isOwner = role === 'owner';
  const isOwnerAdmin = role === 'owner' || role === 'admin';

  const state = {
    tabAktif: 'ringkasan',
    // Tab Ringkasan
    filterRingkasan: 'semua',
    qRingkasan: '',
    dataRingkasan: null,
    // Tab Transfer
    arahTransfer: 'gudang_ke_toko',
    keranjangTransfer: [],
    filterArahRiwayat: '',
    qRiwayatTransfer: '',
    // Tab Barang Rusak
    filterRusakStatus: '',
    filterRusakLokasi: '',
    qRusak: ''
  };

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <div class="page-header">
        <div>
          <h2>Gudang &amp; Mutasi Stok</h2>
          <p>Pantau posisi stok Toko vs Gudang, migrasi barang antar lokasi, dan kelola laporan barang rusak</p>
        </div>
        <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-quick-lapor-rusak" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.alertTriangle}
            <span>Lapor Barang Rusak</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-quick-ke-transfer" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.truck}
            <span>Transfer Gudang → Toko</span>
          </button>
        </div>
      </div>

      <!-- Segmented 3 Tabs -->
      <div class="segmented" id="gudang-tabs" role="tablist">
        <button type="button" class="segmented-btn active" data-tab="ringkasan" role="tab" aria-selected="true">
          ${ICONS.box}
          <span>Stok Toko vs Gudang</span>
        </button>
        <button type="button" class="segmented-btn" data-tab="transfer" role="tab" aria-selected="false">
          ${ICONS.truck}
          <span>Transfer Stok</span>
        </button>
        <button type="button" class="segmented-btn" data-tab="rusak" role="tab" aria-selected="false">
          ${ICONS.alertTriangle}
          <span>Barang Rusak</span>
          <span class="badge badge-danger badge-xs" id="badge-tab-rusak-menunggu" style="display: none; margin-left: 4px;">0</span>
        </button>
      </div>

      <div id="gudang-tab-content">
        ${renderSkeleton(5)}
      </div>
    </div>
  `;

  const tabContent = $('#gudang-tab-content', container);
  const badgeRusak = $('#badge-tab-rusak-menunggu', container);

  const perbaruiBadgeRusak = (jumlah) => {
    if (!badgeRusak) return;
    if (jumlah > 0) {
      badgeRusak.textContent = String(jumlah);
      badgeRusak.style.display = 'inline-flex';
    } else {
      badgeRusak.style.display = 'none';
    }
  };

  const pindahTab = async (tabName) => {
    state.tabAktif = tabName;
    container.querySelectorAll('#gudang-tabs .segmented-btn').forEach((btn) => {
      const aktif = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('active', aktif);
      btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
    });

    if (tabName === 'ringkasan') {
      await renderTabRingkasan();
    } else if (tabName === 'transfer') {
      await renderTabTransfer();
    } else if (tabName === 'rusak') {
      await renderTabRusak();
    }
  };

  container.querySelectorAll('#gudang-tabs .segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => pindahTab(btn.getAttribute('data-tab')));
  });

  $('#btn-quick-ke-transfer', container)?.addEventListener('click', () => {
    state.arahTransfer = 'gudang_ke_toko';
    pindahTab('transfer');
  });

  $('#btn-quick-lapor-rusak', container)?.addEventListener('click', () => {
    bukaModalLaporRusak();
  });

  /* ======================================================================== */
  /* TAB 3 (DEFAULT): RINGKASAN STOK TOKO VS GUDANG                           */
  /* ======================================================================== */
  async function renderTabRingkasan() {
    tabContent.innerHTML = `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="tb-kpi-grid" id="gudang-kpi-area">
          ${renderSkeleton(2)}
        </div>

        <div class="card card-body stack" style="gap: var(--sp-3);">
          <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div class="row" style="gap: 6px; flex-wrap: wrap;" id="ringkasan-filter-chips">
              <button type="button" class="btn btn-sm ${state.filterRingkasan === 'semua' ? 'btn-primary' : 'btn-secondary'}" data-filter="semua">Semua Barang</button>
              <button type="button" class="btn btn-sm ${state.filterRingkasan === 'perlu_isi' ? 'btn-primary' : 'btn-secondary'}" data-filter="perlu_isi">Perlu Isi Ulang Toko</button>
              <button type="button" class="btn btn-sm ${state.filterRingkasan === 'ada_gudang' ? 'btn-primary' : 'btn-secondary'}" data-filter="ada_gudang">Ada di Gudang</button>
              <button type="button" class="btn btn-sm ${state.filterRingkasan === 'kosong' ? 'btn-primary' : 'btn-secondary'}" data-filter="kosong">Kosong Total</button>
            </div>
            <div class="input-group" style="flex: 1 1 220px; max-width: 340px;">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-ringkasan-gudang" placeholder="Cari produk, SKU, atau kategori..." value="${escapeHtml(state.qRingkasan)}">
            </div>
          </div>

          <div id="area-tabel-ringkasan-gudang">
            ${renderSkeleton(5)}
          </div>
        </div>
      </div>
    `;

    tabContent.querySelectorAll('#ringkasan-filter-chips button').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filterRingkasan = btn.getAttribute('data-filter') || 'semua';
        tabContent.querySelectorAll('#ringkasan-filter-chips button').forEach((b) => {
          b.className = `btn btn-sm ${b.getAttribute('data-filter') === state.filterRingkasan ? 'btn-primary' : 'btn-secondary'}`;
        });
        muatDataRingkasan();
      });
    });

    let tCari = null;
    $('#search-ringkasan-gudang', tabContent)?.addEventListener('input', (e) => {
      clearTimeout(tCari);
      tCari = setTimeout(() => {
        state.qRingkasan = e.target.value.trim();
        muatDataRingkasan();
      }, 280);
    });

    await muatDataRingkasan();
  }

  async function muatDataRingkasan() {
    const kpiArea = $('#gudang-kpi-area', tabContent);
    const tblArea = $('#area-tabel-ringkasan-gudang', tabContent);
    if (!tblArea) return;

    try {
      const res = await apiCall('gudang.ringkasan', {
        filter: state.filterRingkasan,
        q: state.qRingkasan,
        limit: 250
      });
      state.dataRingkasan = res;
      const r = res.ringkasan || {};
      perbaruiBadgeRusak(Number(r.rusak_menunggu || 0));

      if (kpiArea) {
        kpiArea.innerHTML = `
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Total Item Aktif</span>
              <div class="stat-card-icon icon-blue">${ICONS.box}</div>
            </div>
            <div class="stat-card-value mono">${formatQty(r.total_item || 0)}</div>
            <div class="stat-card-desc">${formatQty(r.ada_gudang || 0)} item tersimpan di gudang</div>
          </div>

          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Perlu Isi Ulang Toko</span>
              <div class="stat-card-icon ${r.perlu_isi_toko > 0 ? 'icon-amber' : 'icon-emerald'}">${ICONS.alertTriangle}</div>
            </div>
            <div class="stat-card-value mono" style="color: ${r.perlu_isi_toko > 0 ? 'var(--warning)' : 'var(--success)'};">${formatQty(r.perlu_isi_toko || 0)}</div>
            <div class="stat-card-desc">${r.perlu_isi_toko > 0 ? 'Toko menipis/habis tapi gudang ada' : 'Stok etalase toko aman'}</div>
          </div>

          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Total Unit di Toko</span>
              <div class="stat-card-icon icon-emerald">${ICONS.store}</div>
            </div>
            <div class="stat-card-value mono" style="color: var(--success);">${formatQty(r.total_unit_toko || 0)}</div>
            <div class="stat-card-desc">Siap jual langsung di etalase</div>
          </div>

          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Total Unit di Gudang</span>
              <div class="stat-card-icon icon-purple">${ICONS.truck}</div>
            </div>
            <div class="stat-card-value mono" style="color: var(--primary);">${formatQty(r.total_unit_gudang || 0)}</div>
            <div class="stat-card-desc">Cadangan stok &amp; kirim proyek</div>
          </div>
        `;
      }

      const items = res.items || [];
      if (!items.length) {
        tblArea.innerHTML = renderEmpty({
          title: 'Tidak Ada Barang yang Cocok',
          text: 'Coba ubah filter lokasi atau kata kunci pencarian.',
          icon: ICONS.box
        });
        return;
      }

      tblArea.innerHTML = `
        <div class="table-wrap">
          <table class="table table-card-2col">
            <thead>
              <tr>
                <th>Produk &amp; SKU</th>
                <th>Kategori</th>
                <th style="text-align: right;">Stok Toko</th>
                <th style="text-align: right;">Stok Gudang</th>
                <th style="text-align: right;">Total Stok</th>
                <th style="text-align: right; width: 140px;">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it) => {
                const tokoCls = it.stok_toko <= 0 ? 'text-danger' : (it.stok_toko <= it.stok_min ? 'text-warning' : 'text-success');
                return `
                  <tr>
                    <td data-label="Produk">
                      <div class="cell-stack" style="gap: 2px;">
                        <div class="fw-semibold text-sm">${escapeHtml(it.nama)}</div>
                        <div class="row" style="gap: 6px; align-items: center;">
                          <span class="text-2xs text-muted font-mono">${escapeHtml(it.sku || '-')}</span>
                          ${it.perlu_isi_toko ? '<span class="badge badge-warning badge-xs">Perlu Isi Toko</span>' : ''}
                        </div>
                      </div>
                    </td>
                    <td data-label="Kategori"><span class="badge badge-info">${escapeHtml(it.kategori || 'Umum')}</span></td>
                    <td data-label="Stok Toko" style="text-align: right;" class="tabular font-mono fw-bold ${tokoCls}">
                      ${formatQty(it.stok_toko)} <span class="text-2xs fw-normal text-muted">${escapeHtml(it.satuan)}</span>
                    </td>
                    <td data-label="Stok Gudang" style="text-align: right;" class="tabular font-mono fw-bold ${it.stok_gudang > 0 ? 'text-primary' : 'text-muted'}">
                      ${formatQty(it.stok_gudang)} <span class="text-2xs fw-normal text-muted">${escapeHtml(it.satuan)}</span>
                    </td>
                    <td data-label="Total Stok" style="text-align: right;" class="tabular font-mono fw-semibold">
                      ${formatQty(it.stok)} <span class="text-2xs fw-normal text-muted">${escapeHtml(it.satuan)}</span>
                    </td>
                    <td data-label="Aksi Cepat" style="text-align: right;">
                      <div class="table-actions">
                        ${it.stok_gudang > 0 ? `
                          <button type="button" class="btn btn-primary btn-xs btn-isi-ke-toko"
                            data-prod-id="${escapeHtml(it.produk_id)}"
                            data-var-id="${escapeHtml(it.varian_id || '')}"
                            data-nama="${escapeHtml(it.nama)}"
                            data-satuan="${escapeHtml(it.satuan)}"
                            data-toko="${it.stok_toko}"
                            data-gudang="${it.stok_gudang}">
                            ${ICONS.arrowRight}
                            <span>Isi ke Toko</span>
                          </button>
                        ` : '<span class="text-xs text-muted">Gudang Kosong</span>'}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      tblArea.querySelectorAll('.btn-isi-ke-toko').forEach((btn) => {
        btn.addEventListener('click', () => {
          bukaModalTransferCepat({
            produk_id: btn.getAttribute('data-prod-id'),
            varian_id: btn.getAttribute('data-var-id') || '',
            nama: btn.getAttribute('data-nama'),
            satuan: btn.getAttribute('data-satuan') || 'PCS',
            stok_toko: Number(btn.getAttribute('data-toko') || 0),
            stok_gudang: Number(btn.getAttribute('data-gudang') || 0)
          });
        });
      });
    } catch (err) {
      tblArea.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div>Gagal memuat ringkasan stok lokasi: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }

  function bukaModalTransferCepat(item) {
    const modal = showModal({
      title: 'Ambil Stok dari Gudang → Toko',
      size: 'sm',
      body: `
        <form id="form-transfer-cepat" class="stack" style="gap: var(--sp-3);">
          <div class="card" style="padding: var(--sp-3); background: var(--surface-2); border: 1px solid var(--border);">
            <div class="fw-bold text-sm">${escapeHtml(item.nama)}</div>
            <div class="row-between text-xs" style="margin-top: 6px;">
              <span class="text-muted">Stok Toko saat ini:</span>
              <span class="font-mono fw-bold ${item.stok_toko <= 0 ? 'text-danger' : 'text-success'}">${formatQty(item.stok_toko)} ${escapeHtml(item.satuan)}</span>
            </div>
            <div class="row-between text-xs" style="margin-top: 2px;">
              <span class="text-muted">Tersedia di Gudang:</span>
              <span class="font-mono fw-bold text-primary">${formatQty(item.stok_gudang)} ${escapeHtml(item.satuan)}</span>
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="tc-qty">Jumlah Diambil (${escapeHtml(item.satuan)}) <span class="wajib">*</span></label>
            <input type="number" class="input tabular fw-bold" id="tc-qty" min="0.001" max="${item.stok_gudang}" step="any" inputmode="decimal" value="${Math.min(item.stok_gudang, Math.max(1, Math.min(10, item.stok_gudang)))}" required>
            <div class="field-hint">Maksimal tersedia di gudang: ${formatQty(item.stok_gudang)} ${escapeHtml(item.satuan)}</div>
          </div>

          <div class="field">
            <label class="field-label" for="tc-pembawa">Petugas / Pembawa Barang (Opsional)</label>
            <input type="text" class="input" id="tc-pembawa" placeholder="Cth: Budi / Karyawan Gudang">
          </div>

          <div class="field">
            <label class="field-label" for="tc-catatan">Catatan (Opsional)</label>
            <input type="text" class="input" id="tc-catatan" placeholder="Cth: Isi ulang etalase toko">
          </div>
        </form>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-tc">Batal</button>
          <button type="submit" form="form-transfer-cepat" class="btn btn-primary btn-sm" id="btn-simpan-tc">
            ${ICONS.check}
            <span>Pindahkan ke Toko</span>
          </button>
        </div>
      `
    });

    modal.el.querySelector('#btn-batal-tc')?.addEventListener('click', () => modal.close());
    const form = modal.el.querySelector('#form-transfer-cepat');
    const btnSimpan = modal.el.querySelector('#btn-simpan-tc');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qty = parseQty(modal.el.querySelector('#tc-qty')?.value);
      const pembawa = modal.el.querySelector('#tc-pembawa')?.value.trim() || '';
      const catatan = modal.el.querySelector('#tc-catatan')?.value.trim() || '';

      if (qty <= 0 || qty > item.stok_gudang) {
        showToast(`Jumlah harus lebih dari 0 dan maksimal ${formatQty(item.stok_gudang)} ${item.satuan}.`, 'warning');
        return;
      }

      btnSimpan.disabled = true;
      btnSimpan.setAttribute('aria-busy', 'true');
      try {
        const res = await apiCall('gudang.transfer', {
          arah: 'gudang_ke_toko',
          pembawa,
          catatan,
          items: [{
            produk_id: item.produk_id,
            varian_id: item.varian_id,
            satuan: item.satuan,
            faktor: 1,
            qty
          }]
        });
        modal.close();
        showToast(res.pesan || 'Stok berhasil dipindahkan ke Toko!', 'success', 3500);
        tampilkanModalSuksesTransfer(res.mutasi);
        await muatDataRingkasan();
      } catch (err) {
        showToast(err.message || 'Gagal melakukan transfer stok.', 'error', 4500);
        btnSimpan.disabled = false;
        btnSimpan.removeAttribute('aria-busy');
      }
    });
  }

  /* ======================================================================== */
  /* TAB 1: TRANSFER STOK MULTI-ITEM & RIWAYAT (TRF-...)                      */
  /* ======================================================================== */
  async function renderTabTransfer() {
    tabContent.innerHTML = `
      <div class="stack" style="gap: var(--sp-4);">
        <!-- Form Transfer Baru -->
        <div class="card card-body stack" style="gap: var(--sp-3);">
          <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div>
              <h3 style="margin: 0;">Buat Transfer / Migrasi Stok</h3>
              <p class="text-xs text-muted" style="margin: 2px 0 0;">Stok lokasi asal langsung berkurang &amp; stok tujuan langsung bertambah secara berpasangan di Kartu Stok</p>
            </div>
            <div class="row" style="gap: 6px;">
              <button type="button" class="btn btn-sm ${state.arahTransfer === 'gudang_ke_toko' ? 'btn-primary' : 'btn-secondary'} btn-pilih-arah" data-arah="gudang_ke_toko">
                Gudang → Toko
              </button>
              ${isOwnerAdmin ? `
                <button type="button" class="btn btn-sm ${state.arahTransfer === 'toko_ke_gudang' ? 'btn-primary' : 'btn-secondary'} btn-pilih-arah" data-arah="toko_ke_gudang">
                  Toko → Gudang
                </button>
              ` : ''}
            </div>
          </div>

          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div class="field grow" style="min-width: 180px;">
              <label class="field-label" for="trf-pembawa">Petugas / Pembawa Barang (Opsional)</label>
              <input type="text" class="input" id="trf-pembawa" placeholder="Nama karyawan yang mengambil/mengantar barang">
            </div>
            <div class="field grow" style="min-width: 200px;">
              <label class="field-label" for="trf-catatan">Catatan Mutasi (Opsional)</label>
              <input type="text" class="input" id="trf-catatan" placeholder="Cth: Isi ulang rak depan / stok proyek">
            </div>
          </div>

          <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <span class="text-sm fw-semibold">Daftar Barang Dipindahkan (<span id="trf-count-label">0</span>)</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-trf-pilih-produk" style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.plus}
              <span>Tambah Barang dari Katalog</span>
            </button>
          </div>

          <div id="area-keranjang-transfer"></div>

          <div class="row" style="justify-content: flex-end; gap: var(--sp-2);">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-trf-reset">Kosongkan Daftar</button>
            <button type="button" class="btn btn-primary" id="btn-trf-simpan" disabled style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.check}
              <span>Simpan Transfer &amp; Pindahkan Stok</span>
            </button>
          </div>
        </div>

        <!-- Riwayat Transfer -->
        <div class="card card-body stack" style="gap: var(--sp-3);">
          <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <h3 style="margin: 0;">Riwayat Transfer Stok (TRF)</h3>
            <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
              <select class="input input-sm" id="filter-riwayat-arah" style="width: auto; min-width: 150px;">
                <option value="">Semua Arah</option>
                <option value="gudang_ke_toko" ${state.filterArahRiwayat === 'gudang_ke_toko' ? 'selected' : ''}>Gudang → Toko</option>
                <option value="toko_ke_gudang" ${state.filterArahRiwayat === 'toko_ke_gudang' ? 'selected' : ''}>Toko → Gudang</option>
              </select>
              <div class="input-group" style="width: 240px;">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" class="input input-sm" id="search-riwayat-trf" placeholder="Cari no TRF, barang, pembawa..." value="${escapeHtml(state.qRiwayatTransfer)}">
              </div>
            </div>
          </div>

          <div id="area-tabel-riwayat-transfer">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>
    `;

    tabContent.querySelectorAll('.btn-pilih-arah').forEach((btn) => {
      btn.addEventListener('click', () => {
        const arahBaru = btn.getAttribute('data-arah');
        if (arahBaru === state.arahTransfer) return;
        state.arahTransfer = arahBaru;
        tabContent.querySelectorAll('.btn-pilih-arah').forEach((b) => {
          b.className = `btn btn-sm ${b.getAttribute('data-arah') === state.arahTransfer ? 'btn-primary' : 'btn-secondary'} btn-pilih-arah`;
        });
        renderKeranjangTransfer();
      });
    });

    $('#btn-trf-pilih-produk', tabContent)?.addEventListener('click', () => {
      bukaModalPilihProduk({
        title: state.arahTransfer === 'gudang_ke_toko' ? 'Pilih Barang dari Gudang' : 'Pilih Barang dari Toko',
        mode: 'opname',
        multiSelect: true,
        onSelect: (chosen) => tambahKeKeranjangTransfer([chosen]),
        onSelectMultiple: (list) => tambahKeKeranjangTransfer(list)
      });
    });

    $('#btn-trf-reset', tabContent)?.addEventListener('click', () => {
      state.keranjangTransfer = [];
      renderKeranjangTransfer();
    });

    $('#btn-trf-simpan', tabContent)?.addEventListener('click', () => simpanTransferMulti());

    $('#filter-riwayat-arah', tabContent)?.addEventListener('change', (e) => {
      state.filterArahRiwayat = e.target.value;
      muatRiwayatTransfer();
    });

    let tCariTrf = null;
    $('#search-riwayat-trf', tabContent)?.addEventListener('input', (e) => {
      clearTimeout(tCariTrf);
      tCariTrf = setTimeout(() => {
        state.qRiwayatTransfer = e.target.value.trim();
        muatRiwayatTransfer();
      }, 280);
    });

    renderKeranjangTransfer();
    await muatRiwayatTransfer();
  }

  function tambahKeKeranjangTransfer(list) {
    const asal = state.arahTransfer === 'gudang_ke_toko' ? 'gudang' : 'toko';
    let ditambahkan = 0;
    (list || []).forEach((ch) => {
      const stAsal = asal === 'gudang' ? Number(ch.stok_gudang || 0) : Number(ch.stok_toko || 0);
      if (stAsal <= 0) {
        showToast(`Stok ${asal === 'gudang' ? 'Gudang' : 'Toko'} untuk "${ch.nama}" kosong (0).`, 'warning', 3200);
        return;
      }
      const existing = state.keranjangTransfer.find((x) => x.produk_id === ch.id && x.varian_id === (ch.varian_id || ''));
      if (existing) return;

      const opsiSatuan = [{ satuan: (ch.satuan_dasar || 'PCS').toUpperCase(), faktor: 1 }];
      (ch.satuan_konversi || []).forEach((sk) => {
        if (!sk.deleted && sk.satuan) {
          opsiSatuan.push({ satuan: String(sk.satuan).toUpperCase(), faktor: Number(sk.faktor) || 1 });
        }
      });

      state.keranjangTransfer.push({
        produk_id: ch.id,
        varian_id: ch.varian_id || '',
        nama: ch.nama,
        satuan: opsiSatuan[0].satuan,
        satuan_dasar: opsiSatuan[0].satuan,
        faktor: 1,
        opsi_satuan: opsiSatuan,
        qty: Math.min(1, stAsal),
        stok_toko: Number(ch.stok_toko || 0),
        stok_gudang: Number(ch.stok_gudang || 0)
      });
      ditambahkan++;
    });
    if (ditambahkan > 0) {
      showToast(`${ditambahkan} barang ditambahkan ke daftar transfer.`, 'success', 2000);
    }
    renderKeranjangTransfer();
  }

  function renderKeranjangTransfer() {
    const area = $('#area-keranjang-transfer', tabContent);
    const lblCount = $('#trf-count-label', tabContent);
    const btnSimpan = $('#btn-trf-simpan', tabContent);
    if (!area) return;

    const asal = state.arahTransfer === 'gudang_ke_toko' ? 'gudang' : 'toko';
    const labelAsal = asal === 'gudang' ? 'Gudang' : 'Toko';

    if (lblCount) lblCount.textContent = String(state.keranjangTransfer.length);
    if (btnSimpan) btnSimpan.disabled = state.keranjangTransfer.length === 0;

    if (!state.keranjangTransfer.length) {
      area.innerHTML = `
        <div class="alert alert-info" style="margin: 0;">
          ${ICONS.info}
          <div>Klik <strong>Tambah Barang dari Katalog</strong> untuk memilih satu atau banyak barang yang ingin dipindahkan (${state.arahTransfer === 'gudang_ke_toko' ? 'Gudang → Toko' : 'Toko → Gudang'}).</div>
        </div>
      `;
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Barang</th>
              <th style="text-align: right;">Stok Asal (${labelAsal})</th>
              <th style="width: 120px;">Satuan</th>
              <th style="width: 110px; text-align: right;">Qty Pindah</th>
              <th style="text-align: right;">Total Dasar</th>
              <th style="width: 44px; text-align: center;"></th>
            </tr>
          </thead>
          <tbody>
            ${state.keranjangTransfer.map((it, idx) => {
              const stokAsal = asal === 'gudang' ? it.stok_gudang : it.stok_toko;
              const qtyDasar = Math.round((Number(it.qty) || 0) * (Number(it.faktor) || 1) * 1000) / 1000;
              const kurang = qtyDasar > stokAsal;
              return `
                <tr>
                  <td data-label="Barang">
                    <div class="cell-stack" style="gap: 2px;">
                      <div class="fw-semibold text-sm">${escapeHtml(it.nama)}</div>
                      <div class="text-2xs text-muted font-mono">Toko: ${formatQty(it.stok_toko)} • Gudang: ${formatQty(it.stok_gudang)} ${escapeHtml(it.satuan_dasar)}</div>
                    </div>
                  </td>
                  <td data-label="Stok Asal" style="text-align: right;" class="tabular font-mono fw-semibold ${stokAsal <= 0 ? 'text-danger' : 'text-primary'}">
                    ${formatQty(stokAsal)} ${escapeHtml(it.satuan_dasar)}
                  </td>
                  <td data-label="Satuan">
                    <select class="input input-sm sel-trf-satuan" data-idx="${idx}">
                      ${it.opsi_satuan.map((os) => `<option value="${escapeHtml(os.satuan)}" data-faktor="${os.faktor}" ${os.satuan === it.satuan ? 'selected' : ''}>${escapeHtml(os.satuan)}${os.faktor > 1 ? ` (×${os.faktor})` : ''}</option>`).join('')}
                    </select>
                  </td>
                  <td data-label="Qty Pindah" style="text-align: right;">
                    <input type="number" class="input input-sm tabular fw-bold inp-trf-qty" data-idx="${idx}" min="0.001" step="any" inputmode="decimal" value="${it.qty}" style="text-align: right; ${kurang ? 'border-color: var(--danger);' : ''}">
                  </td>
                  <td data-label="Total Dasar" style="text-align: right;" class="tabular font-mono text-xs ${kurang ? 'text-danger fw-bold' : 'text-muted'}">
                    ${formatQty(qtyDasar)} ${escapeHtml(it.satuan_dasar)}${kurang ? ' (Melebihi!)' : ''}
                  </td>
                  <td data-label="Aksi" style="text-align: center;">
                    <button type="button" class="btn btn-outline-danger btn-xs btn-trf-del" data-idx="${idx}" title="Hapus baris">
                      ${ICONS.trash}
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    area.querySelectorAll('.sel-trf-satuan').forEach((sel) => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.getAttribute('data-idx'));
        const it = state.keranjangTransfer[idx];
        if (!it) return;
        const opt = sel.options[sel.selectedIndex];
        it.satuan = sel.value;
        it.faktor = Number(opt?.getAttribute('data-faktor')) || 1;
        renderKeranjangTransfer();
      });
    });

    area.querySelectorAll('.inp-trf-qty').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.getAttribute('data-idx'));
        const it = state.keranjangTransfer[idx];
        if (!it) return;
        const val = parseQty(inp.value);
        if (val <= 0) {
          inp.value = String(it.qty);
          return;
        }
        it.qty = val;
        renderKeranjangTransfer();
      });
    });

    area.querySelectorAll('.btn-trf-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        state.keranjangTransfer.splice(idx, 1);
        renderKeranjangTransfer();
      });
    });
  }

  async function simpanTransferMulti() {
    if (!state.keranjangTransfer.length) return;
    const asal = state.arahTransfer === 'gudang_ke_toko' ? 'gudang' : 'toko';
    for (const it of state.keranjangTransfer) {
      const stokAsal = asal === 'gudang' ? it.stok_gudang : it.stok_toko;
      const qd = Math.round((Number(it.qty) || 0) * (Number(it.faktor) || 1) * 1000) / 1000;
      if (qd <= 0 || qd > stokAsal) {
        showToast(`Qty "${it.nama}" (${formatQty(qd)} ${it.satuan_dasar}) melebihi stok ${asal === 'gudang' ? 'Gudang' : 'Toko'} (${formatQty(stokAsal)}).`, 'error', 4000);
        return;
      }
    }

    const btnSimpan = $('#btn-trf-simpan', tabContent);
    btnSimpan.disabled = true;
    btnSimpan.setAttribute('aria-busy', 'true');

    try {
      const pembawa = $('#trf-pembawa', tabContent)?.value.trim() || '';
      const catatan = $('#trf-catatan', tabContent)?.value.trim() || '';
      const res = await apiCall('gudang.transfer', {
        arah: state.arahTransfer,
        pembawa,
        catatan,
        items: state.keranjangTransfer.map((it) => ({
          produk_id: it.produk_id,
          varian_id: it.varian_id,
          satuan: it.satuan,
          faktor: it.faktor,
          qty: it.qty
        }))
      });

      state.keranjangTransfer = [];
      if ($('#trf-pembawa', tabContent)) $('#trf-pembawa', tabContent).value = '';
      if ($('#trf-catatan', tabContent)) $('#trf-catatan', tabContent).value = '';
      renderKeranjangTransfer();
      showToast(res.pesan || 'Transfer stok berhasil dicatat!', 'success', 3500);
      tampilkanModalSuksesTransfer(res.mutasi);
      await muatRiwayatTransfer();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan transfer stok.', 'error', 4500);
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = state.keranjangTransfer.length === 0;
    }
  }

  function tampilkanModalSuksesTransfer(mutasi) {
    if (!mutasi) return;
    const labelArah = mutasi.arah === 'toko_ke_gudang' ? 'Toko → Gudang' : 'Gudang → Toko';
    const modal = showModal({
      title: 'Transfer Stok Berhasil!',
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3); text-align: center;">
          <div style="display: flex; justify-content: center; color: var(--success);">
            <div style="width: 42px; height: 42px;">${ICONS.checkCircle}</div>
          </div>
          <div>
            <div class="text-xs text-muted">NOMOR DOKUMEN MUTASI</div>
            <div class="fw-bold font-mono text-lg">${escapeHtml(mutasi.no_mutasi || '-')}</div>
            <div class="text-sm fw-semibold" style="margin-top: 2px;">Arah: ${labelArah}</div>
            <div class="text-xs text-muted" style="margin-top: 2px;">${mutasi.total_item || 0} jenis barang • Total ${formatQty(mutasi.total_qty_dasar || 0)} unit dasar</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-cetak-bon-trf-sukses" style="width: 100%; justify-content: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak Bon Pengambilan Gudang</span>
          </button>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-tutup-sukses-trf">Selesai</button>
        </div>
      `
    });
    modal.el.querySelector('#btn-tutup-sukses-trf')?.addEventListener('click', () => modal.close());
    modal.el.querySelector('#btn-cetak-bon-trf-sukses')?.addEventListener('click', () => {
      modal.close();
      cetakBonMutasiGudang(mutasi);
    });
  }

  async function muatRiwayatTransfer() {
    const area = $('#area-tabel-riwayat-transfer', tabContent);
    if (!area) return;

    try {
      const res = await apiCall('gudang.transferList', {
        arah: state.filterArahRiwayat,
        q: state.qRiwayatTransfer,
        limit: 80
      });
      const items = res.items || [];
      if (!items.length) {
        area.innerHTML = renderEmpty({
          title: 'Belum Ada Riwayat Transfer',
          text: 'Dokumen perpindahan stok Gudang ⇄ Toko akan tercatat rapi di sini.',
          icon: ICONS.truck
        });
        return;
      }

      area.innerHTML = `
        <div class="table-wrap">
          <table class="table table-card-2col">
            <thead>
              <tr>
                <th>No. Mutasi</th>
                <th>Tanggal</th>
                <th>Arah</th>
                <th>Ringkasan Barang</th>
                <th>Petugas &amp; Pembawa</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: right;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((m, idx) => {
                const isVoid = m.status === 'void';
                const labelArah = m.arah === 'toko_ke_gudang' ? 'Toko → Gudang' : 'Gudang → Toko';
                const barangPreview = (m.items || []).slice(0, 2).map((x) => `${x.nama} (${formatQty(x.qty)} ${x.satuan})`).join(', ');
                const sisaBarang = (m.items || []).length > 2 ? ` +${m.items.length - 2} lainnya` : '';
                return `
                  <tr style="${isVoid ? 'opacity: 0.65;' : ''}">
                    <td data-label="No. Mutasi">
                      <span class="font-mono fw-bold text-sm" style="${isVoid ? 'text-decoration: line-through;' : ''}">${escapeHtml(m.no_mutasi)}</span>
                    </td>
                    <td data-label="Tanggal" class="text-xs text-muted">${formatTanggal(m.tanggal)}</td>
                    <td data-label="Arah">
                      <span class="badge ${m.arah === 'gudang_ke_toko' ? 'badge-primary' : 'badge-info'}">${labelArah}</span>
                    </td>
                    <td data-label="Ringkasan Barang" class="text-xs">
                      <div class="fw-medium">${escapeHtml(barangPreview || '-')}${escapeHtml(sisaBarang)}</div>
                      ${m.catatan ? `<div class="text-muted" style="margin-top: 2px;">${escapeHtml(m.catatan)}</div>` : ''}
                    </td>
                    <td data-label="Petugas" class="text-xs">
                      <div>${escapeHtml(m.petugas_nama || '-')}</div>
                      ${m.pembawa ? `<div class="text-muted">Pembawa: ${escapeHtml(m.pembawa)}</div>` : ''}
                    </td>
                    <td data-label="Status" style="text-align: center;">
                      <span class="badge ${isVoid ? 'badge-danger' : 'badge-success'}">${isVoid ? 'Dibatalkan' : 'Selesai'}</span>
                    </td>
                    <td data-label="Aksi" style="text-align: right;">
                      <div class="table-actions">
                        <button type="button" class="btn btn-secondary btn-xs btn-detail-trf" data-idx="${idx}" title="Rincian Mutasi">
                          ${ICONS.eye}
                          <span>Detail</span>
                        </button>
                        <button type="button" class="btn btn-primary btn-xs btn-cetak-trf" data-idx="${idx}" title="Cetak Bon Gudang">
                          ${ICONS.printer}
                          <span>Bon</span>
                        </button>
                        ${isOwner && !isVoid ? `
                          <button type="button" class="btn btn-outline-danger btn-xs btn-void-trf" data-idx="${idx}" title="Batalkan Transfer (Khusus Owner)">
                            ${ICONS.rotateCcw}
                            <span>Void</span>
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      area.querySelectorAll('.btn-detail-trf').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = items[Number(btn.getAttribute('data-idx'))];
          if (m) bukaModalDetailTransfer(m);
        });
      });

      area.querySelectorAll('.btn-cetak-trf').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = items[Number(btn.getAttribute('data-idx'))];
          if (m) cetakBonMutasiGudang(m);
        });
      });

      area.querySelectorAll('.btn-void-trf').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = items[Number(btn.getAttribute('data-idx'))];
          if (m) bukaModalVoidTransfer(m);
        });
      });
    } catch (err) {
      area.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div>Gagal memuat riwayat transfer: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }

  function bukaModalDetailTransfer(m) {
    const labelArah = m.arah === 'toko_ke_gudang' ? 'Toko → Gudang' : 'Gudang → Toko';
    const modal = showModal({
      title: `Detail Transfer — ${m.no_mutasi}`,
      size: 'lg',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          ${m.status === 'void' ? `
            <div class="alert alert-danger">
              ${ICONS.alertTriangle}
              <div>
                <strong>DIBATALKAN (VOID)</strong> oleh ${escapeHtml(m.void_oleh_nama || 'Owner')} pada ${formatTanggal(m.void_at)}.<br>
                Alasan: ${escapeHtml(m.void_alasan || '-')}
              </div>
            </div>
          ` : ''}
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--sp-2); font-size: var(--fs-sm);">
            <div><span class="text-muted">Tanggal:</span> <strong>${formatTanggal(m.tanggal)}</strong></div>
            <div><span class="text-muted">Arah:</span> <strong>${labelArah}</strong></div>
            <div><span class="text-muted">Input Oleh:</span> <strong>${escapeHtml(m.petugas_nama || '-')}</strong></div>
            <div><span class="text-muted">Pembawa:</span> <strong>${escapeHtml(m.pembawa || '-')}</strong></div>
          </div>
          ${m.catatan ? `<div class="text-sm"><span class="text-muted">Catatan:</span> ${escapeHtml(m.catatan)}</div>` : ''}
          <div class="table-wrap">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Nama Barang</th>
                  <th style="text-align: right;">Qty Pindah</th>
                  <th style="text-align: right;">Stok Toko (Sblm → Ssdh)</th>
                  <th style="text-align: right;">Stok Gudang (Sblm → Ssdh)</th>
                </tr>
              </thead>
              <tbody>
                ${(m.items || []).map((it) => `
                  <tr>
                    <td data-label="Barang" class="fw-medium">${escapeHtml(it.nama)}</td>
                    <td data-label="Qty Pindah" style="text-align: right;" class="tabular font-mono fw-bold">
                      ${formatQty(it.qty)} ${escapeHtml(it.satuan)}
                      ${it.faktor > 1 ? `<div class="text-2xs text-muted">(${formatQty(it.qty_dasar)} ${escapeHtml(it.satuan_dasar)})</div>` : ''}
                    </td>
                    <td data-label="Stok Toko" style="text-align: right;" class="tabular font-mono text-xs">
                      ${formatQty(it.stok_toko_sebelum)} → <strong>${formatQty(it.stok_toko_sesudah)}</strong>
                    </td>
                    <td data-label="Stok Gudang" style="text-align: right;" class="tabular font-mono text-xs">
                      ${formatQty(it.stok_gudang_sebelum)} → <strong>${formatQty(it.stok_gudang_sesudah)}</strong>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `,
      footer: `
        <div class="row-between" style="width: 100%; gap: var(--sp-2);">
          <button type="button" class="btn btn-primary btn-sm" id="btn-det-trf-cetak">
            ${ICONS.printer}
            <span>Cetak Bon Gudang</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-det-trf-tutup">Tutup</button>
        </div>
      `
    });
    modal.el.querySelector('#btn-det-trf-tutup')?.addEventListener('click', () => modal.close());
    modal.el.querySelector('#btn-det-trf-cetak')?.addEventListener('click', () => cetakBonMutasiGudang(m));
  }

  function bukaModalVoidTransfer(m) {
    const modal = showModal({
      title: `Batalkan Transfer ${m.no_mutasi}`,
      size: 'sm',
      body: `
        <form id="form-void-trf" class="stack" style="gap: var(--sp-3);">
          <div class="alert alert-danger" style="margin: 0;">
            ${ICONS.alertTriangle}
            <div>Membatalkan transfer akan mengembalikan seluruh stok dari lokasi tujuan ke lokasi asal &amp; mencatat mutasi balik di Kartu Stok.</div>
          </div>
          <div class="field">
            <label class="field-label" for="inp-void-trf-alasan">Alasan Pembatalan <span class="wajib">*</span></label>
            <textarea class="textarea" id="inp-void-trf-alasan" rows="3" minlength="4" placeholder="Cth: Salah input barang / qty keliru" required></textarea>
          </div>
        </form>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-void-trf">Batal</button>
          <button type="submit" form="form-void-trf" class="btn btn-danger btn-sm" id="btn-submit-void-trf">Ya, Batalkan Transfer</button>
        </div>
      `
    });
    modal.el.querySelector('#btn-batal-void-trf')?.addEventListener('click', () => modal.close());
    const form = modal.el.querySelector('#form-void-trf');
    const btn = modal.el.querySelector('#btn-submit-void-trf');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = modal.el.querySelector('#inp-void-trf-alasan')?.value.trim() || '';
      if (alasan.length < 4) {
        showToast('Alasan pembatalan minimal 4 karakter.', 'warning');
        return;
      }
      btn.disabled = true;
      try {
        const res = await apiCall('gudang.transferVoid', { id: m.id, alasan });
        modal.close();
        showToast(res.pesan || 'Transfer berhasil dibatalkan.', 'success');
        await muatRiwayatTransfer();
      } catch (err) {
        showToast(err.message || 'Gagal membatalkan transfer.', 'error', 4500);
        btn.disabled = false;
      }
    });
  }

  /* ======================================================================== */
  /* TAB 2: PENGELOLAAN BARANG RUSAK / SUSUT & KLAIM SUPPLIER (RSK-...)       */
  /* ======================================================================== */
  async function renderTabRusak() {
    tabContent.innerHTML = `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="tb-kpi-grid" id="rusak-kpi-area">
          ${renderSkeleton(2)}
        </div>

        <div class="card card-body stack" style="gap: var(--sp-3);">
          <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
              <select class="input input-sm" id="filter-rusak-status" style="width: auto; min-width: 150px;">
                <option value="">Semua Status</option>
                <option value="diajukan" ${state.filterRusakStatus === 'diajukan' ? 'selected' : ''}>Menunggu Persetujuan</option>
                <option value="disetujui" ${state.filterRusakStatus === 'disetujui' ? 'selected' : ''}>Disetujui</option>
                <option value="ditolak" ${state.filterRusakStatus === 'ditolak' ? 'selected' : ''}>Ditolak</option>
              </select>
              <select class="input input-sm" id="filter-rusak-lokasi" style="width: auto; min-width: 130px;">
                <option value="">Semua Lokasi</option>
                <option value="toko" ${state.filterRusakLokasi === 'toko' ? 'selected' : ''}>Stok Toko</option>
                <option value="gudang" ${state.filterRusakLokasi === 'gudang' ? 'selected' : ''}>Stok Gudang</option>
              </select>
              <div class="input-group" style="width: 230px;">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" class="input input-sm" id="search-rusak" placeholder="Cari no RSK, barang, kategori..." value="${escapeHtml(state.qRusak)}">
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="btn-tab-lapor-rusak" style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.plus}
              <span>Lapor Barang Rusak</span>
            </button>
          </div>

          <div id="area-tabel-rusak">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>
    `;

    $('#btn-tab-lapor-rusak', tabContent)?.addEventListener('click', () => bukaModalLaporRusak());
    $('#filter-rusak-status', tabContent)?.addEventListener('change', (e) => {
      state.filterRusakStatus = e.target.value;
      muatDataRusak();
    });
    $('#filter-rusak-lokasi', tabContent)?.addEventListener('change', (e) => {
      state.filterRusakLokasi = e.target.value;
      muatDataRusak();
    });
    let tCariRsk = null;
    $('#search-rusak', tabContent)?.addEventListener('input', (e) => {
      clearTimeout(tCariRsk);
      tCariRsk = setTimeout(() => {
        state.qRusak = e.target.value.trim();
        muatDataRusak();
      }, 280);
    });

    await muatDataRusak();
  }

  async function muatDataRusak() {
    const kpiArea = $('#rusak-kpi-area', tabContent);
    const tblArea = $('#area-tabel-rusak', tabContent);
    if (!tblArea) return;

    try {
      const res = await apiCall('rusak.list', {
        status: state.filterRusakStatus,
        lokasi: state.filterRusakLokasi,
        q: state.qRusak,
        limit: 150
      });
      const r = res.ringkasan || {};
      perbaruiBadgeRusak(Number(r.diajukan || 0));

      if (kpiArea) {
        kpiArea.innerHTML = `
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Menunggu Persetujuan</span>
              <div class="stat-card-icon ${r.diajukan > 0 ? 'icon-amber' : 'icon-emerald'}">${ICONS.alertTriangle}</div>
            </div>
            <div class="stat-card-value mono" style="color: ${r.diajukan > 0 ? 'var(--warning)' : 'var(--text-muted)'};">${formatQty(r.diajukan || 0)}</div>
            <div class="stat-card-desc">Laporan kasir menunggu verifikasi</div>
          </div>

          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Laporan Disetujui</span>
              <div class="stat-card-icon icon-blue">${ICONS.checkCircle}</div>
            </div>
            <div class="stat-card-value mono">${formatQty(r.disetujui || 0)}</div>
            <div class="stat-card-desc">Stok sudah dipotong &amp; tercatat</div>
          </div>

          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Klaim Supplier Aktif</span>
              <div class="stat-card-icon icon-purple">${ICONS.truck}</div>
            </div>
            <div class="stat-card-value mono" style="color: var(--primary);">${formatQty(r.klaim_menunggu || 0)}</div>
            <div class="stat-card-desc">Menunggu penggantian dari supplier</div>
          </div>

          ${isOwner ? `
            <div class="stat-card-pro">
              <div class="stat-card-header">
                <span class="stat-card-title">Total Kerugian Rusak</span>
                <div class="stat-card-icon icon-rose">${ICONS.banknote}</div>
              </div>
              <div class="stat-card-value mono" style="color: var(--danger);">${formatRupiah(r.total_kerugian || 0)}</div>
              <div class="stat-card-desc">Otomatis mengurangi Laba Bersih Riil</div>
            </div>
          ` : `
            <div class="stat-card-pro">
              <div class="stat-card-header">
                <span class="stat-card-title">Total Laporan</span>
                <div class="stat-card-icon icon-emerald">${ICONS.clipboard}</div>
              </div>
              <div class="stat-card-value mono">${formatQty(r.total_laporan || 0)}</div>
              <div class="stat-card-desc">Seluruh catatan kerusakan</div>
            </div>
          `}
        `;
      }

      const items = res.items || [];
      if (!items.length) {
        tblArea.innerHTML = renderEmpty({
          title: 'Belum Ada Laporan Barang Rusak',
          text: 'Laporkan barang pecah, membatu, cacat pabrik, atau susut agar stok fisik tetap akurat.',
          icon: ICONS.alertTriangle
        });
        return;
      }

      tblArea.innerHTML = `
        <div class="table-wrap">
          <table class="table table-card-2col">
            <thead>
              <tr>
                <th>No. Laporan</th>
                <th>Barang &amp; Kategori</th>
                <th style="text-align: center;">Lokasi</th>
                <th style="text-align: right;">Qty Rusak</th>
                ${isOwner ? '<th style="text-align: right;">Kerugian (HPP)</th>' : ''}
                <th>Tindak Lanjut</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: right;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => {
                const stCls = it.status === 'disetujui' ? 'badge-success' : (it.status === 'ditolak' ? 'badge-danger' : 'badge-warning');
                const stLbl = it.status === 'disetujui' ? 'Disetujui' : (it.status === 'ditolak' ? 'Ditolak' : 'Diajukan');
                let tindakHtml = '<span class="badge badge-secondary">Hapus Buku</span>';
                if (it.tindak_lanjut === 'klaim_supplier') {
                  if (it.klaim_status === 'diganti_barang') {
                    tindakHtml = '<span class="badge badge-success">Diganti Supplier</span>';
                  } else if (it.klaim_status === 'ditolak_supplier') {
                    tindakHtml = '<span class="badge badge-danger">Klaim Ditolak</span>';
                  } else {
                    tindakHtml = '<span class="badge badge-info">Klaim Supplier</span>';
                  }
                }
                return `
                  <tr>
                    <td data-label="No. Laporan">
                      <div class="font-mono fw-bold text-sm">${escapeHtml(it.no_rusak)}</div>
                      <div class="text-2xs text-muted">${formatTanggal(it.tanggal)}</div>
                    </td>
                    <td data-label="Barang">
                      <div class="cell-stack" style="gap: 2px;">
                        <div class="fw-semibold text-sm">${escapeHtml(it.nama)}</div>
                        <div class="text-xs text-muted">${escapeHtml(it.kategori_rusak)} • Pelapor: ${escapeHtml(it.pelapor_nama || '-')}</div>
                        <div class="text-2xs text-muted">${escapeHtml(it.keterangan || '-')}</div>
                      </div>
                    </td>
                    <td data-label="Lokasi" style="text-align: center;">
                      <span class="badge ${it.lokasi === 'gudang' ? 'badge-primary' : 'badge-secondary'}">${it.lokasi === 'gudang' ? 'Gudang' : 'Toko'}</span>
                    </td>
                    <td data-label="Qty Rusak" style="text-align: right;" class="tabular font-mono fw-bold text-danger">
                      -${formatQty(it.qty)} <span class="text-2xs fw-normal text-muted">${escapeHtml(it.satuan)}</span>
                    </td>
                    ${isOwner ? `
                      <td data-label="Kerugian" style="text-align: right;" class="tabular font-mono fw-semibold ${Number(it.nilai_kerugian || 0) > 0 ? 'text-danger' : 'text-muted'}">
                        ${formatRupiah(it.nilai_kerugian || 0)}
                      </td>
                    ` : ''}
                    <td data-label="Tindak Lanjut">${tindakHtml}</td>
                    <td data-label="Status" style="text-align: center;">
                      <span class="badge ${stCls}">${stLbl}</span>
                    </td>
                    <td data-label="Aksi" style="text-align: right;">
                      <div class="table-actions">
                        ${it.foto_url ? `
                          <button type="button" class="btn btn-secondary btn-xs btn-foto-rusak" data-idx="${idx}" title="Lihat Foto Bukti">
                            ${ICONS.image}
                            <span>Foto</span>
                          </button>
                        ` : ''}
                        ${isOwnerAdmin && it.status === 'diajukan' ? `
                          <button type="button" class="btn btn-primary btn-xs btn-approve-rusak" data-idx="${idx}">Setujui</button>
                          <button type="button" class="btn btn-outline-danger btn-xs btn-reject-rusak" data-idx="${idx}">Tolak</button>
                        ` : ''}
                        ${isOwnerAdmin && it.status === 'disetujui' && it.tindak_lanjut === 'klaim_supplier' && it.klaim_status === 'menunggu' ? `
                          <button type="button" class="btn btn-primary btn-xs btn-klaim-rusak" data-idx="${idx}">Selesaikan Klaim</button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      tblArea.querySelectorAll('.btn-foto-rusak').forEach((btn) => {
        btn.addEventListener('click', () => {
          const it = items[Number(btn.getAttribute('data-idx'))];
          if (!it || !it.foto_url) return;
          showModal({
            title: `Foto Bukti — ${it.no_rusak}`,
            size: 'md',
            body: `
              <div class="stack" style="gap: var(--sp-2); text-align: center;">
                <img src="${escapeHtml(it.foto_url)}" alt="Bukti kerusakan" style="max-width: 100%; max-height: 60vh; border-radius: var(--radius-md); object-fit: contain; margin: 0 auto;">
                <div class="text-xs text-muted">${escapeHtml(it.nama)} — ${escapeHtml(it.keterangan || '')}</div>
              </div>
            `
          });
        });
      });

      tblArea.querySelectorAll('.btn-approve-rusak').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const it = items[Number(btn.getAttribute('data-idx'))];
          if (!it) return;
          const ok = await showConfirm({
            title: `Setujui Laporan ${it.no_rusak}?`,
            message: `Stok ${it.lokasi === 'gudang' ? 'Gudang' : 'Toko'} untuk "${it.nama}" akan dipotong sebesar ${formatQty(it.qty)} ${it.satuan} dan dicatat ke Kartu Stok serta Laba Rugi.`,
            confirmText: 'Ya, Setujui & Potong Stok'
          });
          if (!ok) return;
          try {
            const resApr = await apiCall('rusak.approve', { id: it.id });
            showToast(resApr.pesan || 'Laporan disetujui.', 'success');
            await muatDataRusak();
          } catch (err) {
            showToast(err.message || 'Gagal menyetujui laporan.', 'error', 4500);
          }
        });
      });

      tblArea.querySelectorAll('.btn-reject-rusak').forEach((btn) => {
        btn.addEventListener('click', () => {
          const it = items[Number(btn.getAttribute('data-idx'))];
          if (it) bukaModalTolakRusak(it);
        });
      });

      tblArea.querySelectorAll('.btn-klaim-rusak').forEach((btn) => {
        btn.addEventListener('click', () => {
          const it = items[Number(btn.getAttribute('data-idx'))];
          if (it) bukaModalSelesaikanKlaim(it);
        });
      });
    } catch (err) {
      tblArea.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div>Gagal memuat data barang rusak: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }

  function bukaModalLaporRusak() {
    let itemDipilih = null;
    let fotoUrl = '';

    const modal = showModal({
      title: 'Lapor Barang Rusak / Susut',
      size: 'md',
      body: `
        <form id="form-lapor-rusak" class="stack" style="gap: var(--sp-3);">
          ${!isOwnerAdmin ? `
            <div class="alert alert-info" style="margin: 0; font-size: var(--fs-xs);">
              ${ICONS.info}
              <div>Laporan Anda akan berstatus <strong>Menunggu Persetujuan</strong>. Stok baru dipotong setelah diverifikasi Owner/Admin.</div>
            </div>
          ` : ''}

          <div class="field">
            <div class="row-between items-center" style="margin-bottom: 6px;">
              <label class="field-label" style="margin: 0;">Produk / Varian <span class="wajib">*</span></label>
              <button type="button" class="btn btn-secondary btn-xs" id="btn-rsk-pilih-produk">
                ${ICONS.grid}
                <span>Pilih dari Katalog</span>
              </button>
            </div>
            <input type="text" class="input" id="rsk-nama-produk" placeholder="Klik Pilih dari Katalog..." readonly required style="background: var(--surface-2);">
            <div class="text-xs text-muted" id="rsk-info-stok" style="margin-top: 4px;"></div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2);">
            <div class="field">
              <label class="field-label" for="rsk-lokasi">Lokasi Kerusakan <span class="wajib">*</span></label>
              <select class="input" id="rsk-lokasi">
                <option value="toko">Stok Toko (Etalase)</option>
                <option value="gudang">Stok Gudang</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="rsk-qty">Jumlah Rusak <span class="wajib">*</span></label>
              <input type="number" class="input tabular fw-bold" id="rsk-qty" min="0.001" step="any" inputmode="decimal" value="1" required>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2);">
            <div class="field">
              <label class="field-label" for="rsk-kategori">Kategori Kerusakan</label>
              <select class="input" id="rsk-kategori">
                ${KATEGORI_RUSAK_LIST.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="rsk-tindak">Tindak Lanjut</label>
              <select class="input" id="rsk-tindak">
                <option value="write_off">Hapus Buku (Write-Off / Rugi)</option>
                <option value="klaim_supplier">Klaim Tukar Supplier</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="rsk-keterangan">Keterangan / Kronologi <span class="wajib">*</span></label>
            <textarea class="textarea" id="rsk-keterangan" rows="3" minlength="3" placeholder="Cth: 2 sak semen mengeras terkena rembesan hujan di sudut gudang" required></textarea>
          </div>

          <div class="field">
            <label class="field-label">Foto Bukti (Opsional)</label>
            <div class="row items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
              <input type="file" id="rsk-foto-file" accept="image/*" style="display: none;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-rsk-upload-foto" style="display: inline-flex; align-items: center; gap: 6px;">
                ${ICONS.camera}
                <span>Unggah Foto Bukti</span>
              </button>
              <span class="text-xs text-muted" id="rsk-foto-status">Belum ada foto</span>
            </div>
          </div>
        </form>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-rsk">Batal</button>
          <button type="submit" form="form-lapor-rusak" class="btn btn-primary btn-sm" id="btn-simpan-rsk">
            ${ICONS.check}
            <span>${isOwnerAdmin ? 'Simpan & Potong Stok' : 'Ajukan Laporan'}</span>
          </button>
        </div>
      `
    });

    modal.el.querySelector('#btn-batal-rsk')?.addEventListener('click', () => modal.close());

    const inpNama = modal.el.querySelector('#rsk-nama-produk');
    const lblInfo = modal.el.querySelector('#rsk-info-stok');
    const selLokasi = modal.el.querySelector('#rsk-lokasi');
    const inpFile = modal.el.querySelector('#rsk-foto-file');
    const lblFoto = modal.el.querySelector('#rsk-foto-status');

    modal.el.querySelector('#btn-rsk-pilih-produk')?.addEventListener('click', () => {
      bukaModalPilihProduk({
        title: 'Pilih Barang yang Rusak',
        mode: 'opname',
        onSelect: (chosen) => {
          itemDipilih = chosen;
          if (inpNama) inpNama.value = chosen.nama;
          if (lblInfo) {
            lblInfo.textContent = `Stok Toko: ${formatQty(chosen.stok_toko)} ${chosen.satuan_dasar} • Stok Gudang: ${formatQty(chosen.stok_gudang)} ${chosen.satuan_dasar}`;
          }
          // Jika toko 0 tapi gudang ada, otomatis pilih lokasi gudang
          if (selLokasi) {
            if (chosen.stok_toko <= 0 && chosen.stok_gudang > 0) selLokasi.value = 'gudang';
            else selLokasi.value = 'toko';
          }
        }
      });
    });

    modal.el.querySelector('#btn-rsk-upload-foto')?.addEventListener('click', () => inpFile?.click());
    inpFile?.addEventListener('change', async () => {
      const file = inpFile.files?.[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        showToast('Ukuran foto maksimal 3 MB.', 'warning');
        return;
      }
      if (lblFoto) lblFoto.textContent = 'Mengunggah foto...';
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const resUp = await apiCall('produk.uploadFoto', {
          nama_file: file.name,
          mime_type: file.type || 'image/jpeg',
          base64
        });
        fotoUrl = resUp.url || resUp.foto_url || '';
        if (lblFoto) lblFoto.textContent = fotoUrl ? 'Foto bukti terunggah' : 'Gagal unggah foto';
      } catch (err) {
        if (lblFoto) lblFoto.textContent = 'Gagal unggah foto';
        showToast('Gagal mengunggah foto: ' + err.message, 'error');
      }
    });

    const form = modal.el.querySelector('#form-lapor-rusak');
    const btnSimpan = modal.el.querySelector('#btn-simpan-rsk');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!itemDipilih) {
        showToast('Silakan pilih produk terlebih dahulu.', 'warning');
        return;
      }
      const qty = parseQty(modal.el.querySelector('#rsk-qty')?.value);
      const lokasi = selLokasi?.value || 'toko';
      const kategoriRusak = modal.el.querySelector('#rsk-kategori')?.value || KATEGORI_RUSAK_LIST[0];
      const tindakLanjut = modal.el.querySelector('#rsk-tindak')?.value || 'write_off';
      const keterangan = modal.el.querySelector('#rsk-keterangan')?.value.trim() || '';

      if (qty <= 0) {
        showToast('Jumlah rusak harus lebih dari 0.', 'warning');
        return;
      }
      if (keterangan.length < 3) {
        showToast('Keterangan kerusakan minimal 3 karakter.', 'warning');
        return;
      }

      btnSimpan.disabled = true;
      btnSimpan.setAttribute('aria-busy', 'true');
      try {
        const res = await apiCall('rusak.create', {
          produk_id: itemDipilih.id,
          varian_id: itemDipilih.varian_id || '',
          satuan: itemDipilih.satuan_dasar || 'PCS',
          faktor: 1,
          qty,
          lokasi,
          kategori_rusak: kategoriRusak,
          tindak_lanjut: tindakLanjut,
          keterangan,
          foto_url: fotoUrl
        });
        modal.close();
        showToast(res.pesan || 'Laporan barang rusak berhasil disimpan.', 'success', 4000);
        if (state.tabAktif === 'rusak') {
          await muatDataRusak();
        } else {
          await pindahTab('rusak');
        }
      } catch (err) {
        showToast(err.message || 'Gagal menyimpan laporan.', 'error', 4500);
        btnSimpan.disabled = false;
        btnSimpan.removeAttribute('aria-busy');
      }
    });
  }

  function bukaModalTolakRusak(it) {
    const modal = showModal({
      title: `Tolak Laporan ${it.no_rusak}`,
      size: 'sm',
      body: `
        <form id="form-tolak-rsk" class="stack" style="gap: var(--sp-3);">
          <div class="text-sm">Menolak laporan <strong>${escapeHtml(it.nama)}</strong> (${formatQty(it.qty)} ${escapeHtml(it.satuan)}). Stok tidak akan dipotong.</div>
          <div class="field">
            <label class="field-label" for="inp-tolak-rsk-alasan">Alasan Penolakan <span class="wajib">*</span></label>
            <textarea class="textarea" id="inp-tolak-rsk-alasan" rows="3" placeholder="Cth: Barang masih layak jual / salah hitung" required></textarea>
          </div>
        </form>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-tolak-rsk">Batal</button>
          <button type="submit" form="form-tolak-rsk" class="btn btn-danger btn-sm" id="btn-submit-tolak-rsk">Tolak Laporan</button>
        </div>
      `
    });
    modal.el.querySelector('#btn-batal-tolak-rsk')?.addEventListener('click', () => modal.close());
    const form = modal.el.querySelector('#form-tolak-rsk');
    const btn = modal.el.querySelector('#btn-submit-tolak-rsk');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alasan = modal.el.querySelector('#inp-tolak-rsk-alasan')?.value.trim() || '';
      btn.disabled = true;
      try {
        const res = await apiCall('rusak.reject', { id: it.id, alasan });
        modal.close();
        showToast(res.pesan || 'Laporan ditolak.', 'success');
        await muatDataRusak();
      } catch (err) {
        showToast(err.message || 'Gagal menolak laporan.', 'error');
        btn.disabled = false;
      }
    });
  }

  function bukaModalSelesaikanKlaim(it) {
    const modal = showModal({
      title: `Selesaikan Klaim Supplier — ${it.no_rusak}`,
      size: 'sm',
      body: `
        <form id="form-klaim-rsk" class="stack" style="gap: var(--sp-3);">
          <div class="text-sm">Barang: <strong>${escapeHtml(it.nama)}</strong> (${formatQty(it.qty)} ${escapeHtml(it.satuan)})</div>

          <div class="field">
            <label class="field-label" for="klaim-hasil">Hasil Klaim Supplier <span class="wajib">*</span></label>
            <select class="input" id="klaim-hasil">
              <option value="diganti_barang">Diganti Barang Baru oleh Supplier (Stok Kembali &amp; Rugi = Rp 0)</option>
              <option value="ditolak_supplier">Ditolak Supplier (Masuk Kerugian / Write-Off)</option>
            </select>
          </div>

          <div class="field" id="wrap-klaim-lokasi">
            <label class="field-label" for="klaim-lokasi">Masukkan Barang Pengganti ke Lokasi</label>
            <select class="input" id="klaim-lokasi">
              <option value="gudang" ${it.lokasi === 'gudang' ? 'selected' : ''}>Stok Gudang</option>
              <option value="toko" ${it.lokasi === 'toko' ? 'selected' : ''}>Stok Toko</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="klaim-catatan">Catatan Penyelesaian (Opsional)</label>
            <input type="text" class="input" id="klaim-catatan" placeholder="Cth: Diganti sales PT Semen saat kirim faktur baru">
          </div>
        </form>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-klaim-rsk">Batal</button>
          <button type="submit" form="form-klaim-rsk" class="btn btn-primary btn-sm" id="btn-submit-klaim-rsk">Simpan Hasil Klaim</button>
        </div>
      `
    });

    modal.el.querySelector('#btn-batal-klaim-rsk')?.addEventListener('click', () => modal.close());
    const selHasil = modal.el.querySelector('#klaim-hasil');
    const wrapLok = modal.el.querySelector('#wrap-klaim-lokasi');
    selHasil?.addEventListener('change', () => {
      if (wrapLok) wrapLok.style.display = selHasil.value === 'diganti_barang' ? '' : 'none';
    });

    const form = modal.el.querySelector('#form-klaim-rsk');
    const btn = modal.el.querySelector('#btn-submit-klaim-rsk');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const res = await apiCall('rusak.selesaikanKlaim', {
          id: it.id,
          hasil: selHasil?.value || 'diganti_barang',
          lokasi_tujuan: modal.el.querySelector('#klaim-lokasi')?.value || 'gudang',
          catatan: modal.el.querySelector('#klaim-catatan')?.value.trim() || ''
        });
        modal.close();
        showToast(res.pesan || 'Klaim supplier selesai.', 'success', 4000);
        await muatDataRusak();
      } catch (err) {
        showToast(err.message || 'Gagal menyelesaikan klaim.', 'error', 4500);
        btn.disabled = false;
      }
    });
  }

  // Muat tab awal (Ringkasan Stok Toko vs Gudang)
  await renderTabRingkasan();
}

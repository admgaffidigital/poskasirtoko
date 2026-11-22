/**
 * retur.js — Modul Retur Penjualan & Retur Pembelian
 * Sesuai Fase 4 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #4, #7, #12, #16
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatQty, parseQty, formatTanggal } from '../utils/format.js';

let tabAktifRetur = 'jual';

export async function renderReturModule(container) {
  const user = store.get('user');
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');
  const isBeli = tabAktifRetur === 'beli';

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Retur Penjualan & Pembelian</h2>
          <p>Pengembalian barang pelanggan, retur cacat pabrik ke supplier, dan penyesuaian Moving Average HPP</p>
        </div>
        <div class="row" style="gap: var(--sp-2);">
          <div class="segmented" id="tabs-retur" role="tablist">
            <button type="button" id="tab-btn-retur-jual" class="btn btn-sm" aria-pressed="${!isBeli}">
              ${ICONS.rotateCcw}
              <span>Retur Penjualan <span class="d-none-mobile">(Pelanggan)</span></span>
            </button>
            <button type="button" id="tab-btn-retur-beli" class="btn btn-sm" aria-pressed="${isBeli}">
              ${ICONS.truck}
              <span>Retur Pembelian <span class="d-none-mobile">(Supplier)</span></span>
            </button>
          </div>
          <button type="button" class="btn btn-primary" id="btn-tambah-retur" style="${isBeli && !isOwnerOrAdmin ? 'display: none;' : ''}">
            ${ICONS.plus}
            <span>${isBeli ? 'Buat Retur Pembelian' : 'Buat Retur Penjualan'}</span>
          </button>
        </div>
      </div>

      <!-- Panel Retur Penjualan -->
      <div id="panel-retur-jual" class="card card-body stack" style="${isBeli ? 'display: none;' : 'display: flex;'}">
        <!-- Filter Bar Jual -->
        <div class="simple-filter-bar">
          <div class="field filter-select-field">
            <label class="field-label" for="filter-rj-status">Status Persetujuan</label>
            <select class="input" id="filter-rj-status">
              <option value="">Semua Status</option>
              <option value="diajukan">Diajukan (Menunggu)</option>
              <option value="disetujui">Disetujui</option>
              <option value="ditolak">Ditolak</option>
            </select>
          </div>

          <div class="field filter-search-field">
            <label class="field-label" for="search-rj">Cari Dokumen Retur</label>
            <div class="input-group">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-rj" placeholder="Cari no retur RT, no nota INV, nama pelanggan, atau alasan...">
            </div>
          </div>
        </div>

        <div id="area-tabel-retur-jual" style="margin-top: var(--sp-2);">
          ${renderSkeleton(4)}
        </div>
      </div>

      <!-- Panel Retur Pembelian -->
      <div id="panel-retur-beli" class="card card-body stack" style="${isBeli ? 'display: flex;' : 'display: none;'}">
        ${!isOwnerOrAdmin ? `
          <div class="text-center" style="padding: var(--sp-6);">
            <div style="font-size: 40px; margin-bottom: var(--sp-2); color: var(--warning-text);">${ICONS.alertTriangle}</div>
            <h3 style="margin-bottom: var(--sp-2);">Akses Terbatas</h3>
            <p class="text-muted" style="max-width: 480px; margin: 0 auto;">
              Modul Retur Pembelian ke Supplier hanya dapat diakses oleh Pemilik Toko (Owner) dan Administrator.
            </p>
          </div>
        ` : `
          <!-- Filter Bar Beli -->
          <div class="simple-filter-bar">
            <div class="field filter-select-field">
              <label class="field-label" for="filter-rb-status">Status Persetujuan</label>
              <select class="input" id="filter-rb-status">
                <option value="">Semua Status</option>
                <option value="diajukan">Diajukan</option>
                <option value="disetujui">Disetujui</option>
                <option value="ditolak">Ditolak</option>
              </select>
            </div>

            <div class="field filter-search-field">
              <label class="field-label" for="search-rb">Cari Retur Pembelian</label>
              <div class="input-group">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" class="input" id="search-rb" placeholder="Cari no retur RT, no faktur PB, nama supplier, atau alasan...">
              </div>
            </div>
          </div>

          <div id="area-tabel-retur-beli" style="margin-top: var(--sp-2);">
            ${renderSkeleton(4)}
          </div>
        `}
      </div>
    </div>
  `;

  // Binding Tab Switching
  const btnTabJual = $('#tab-btn-retur-jual', container);
  const btnTabBeli = $('#tab-btn-retur-beli', container);
  const panelJual = $('#panel-retur-jual', container);
  const panelBeli = $('#panel-retur-beli', container);
  const btnTambah = $('#btn-tambah-retur', container);

  btnTabJual?.addEventListener('click', () => {
    tabAktifRetur = 'jual';
    btnTabJual.setAttribute('aria-pressed', 'true');
    btnTabBeli.setAttribute('aria-pressed', 'false');
    panelJual.style.display = 'flex';
    panelBeli.style.display = 'none';
    if (btnTambah) {
      btnTambah.style.display = 'inline-flex';
      btnTambah.innerHTML = `${ICONS.plus}<span>Buat Retur Penjualan</span>`;
    }
    muatDataReturJual(container);
  });

  btnTabBeli?.addEventListener('click', () => {
    tabAktifRetur = 'beli';
    btnTabBeli.setAttribute('aria-pressed', 'true');
    btnTabJual.setAttribute('aria-pressed', 'false');
    panelBeli.style.display = 'flex';
    panelJual.style.display = 'none';
    if (btnTambah) {
      if (isOwnerOrAdmin) {
        btnTambah.style.display = 'inline-flex';
        btnTambah.innerHTML = `${ICONS.plus}<span>Buat Retur Pembelian</span>`;
      } else {
        btnTambah.style.display = 'none';
      }
    }
    if (isOwnerOrAdmin) {
      muatDataReturBeli(container);
    }
  });

  btnTambah?.addEventListener('click', () => {
    if (tabAktifRetur === 'jual') {
      bukaModalFormReturJual(container);
    } else {
      bukaModalFormReturBeli(container);
    }
  });

  // Filter Event Listeners Jual
  let timeoutCariRj = null;
  const inputSearchRj = $('#search-rj', container);
  const selStatusRj = $('#filter-rj-status', container);

  const triggerMuatRj = () => muatDataReturJual(container);

  inputSearchRj?.addEventListener('input', () => {
    clearTimeout(timeoutCariRj);
    timeoutCariRj = setTimeout(triggerMuatRj, 300);
  });
  selStatusRj?.addEventListener('change', triggerMuatRj);

  // Filter Event Listeners Beli
  if (isOwnerOrAdmin) {
    let timeoutCariRb = null;
    const inputSearchRb = $('#search-rb', container);
    const selStatusRb = $('#filter-rb-status', container);

    const triggerMuatRb = () => muatDataReturBeli(container);

    inputSearchRb?.addEventListener('input', () => {
      clearTimeout(timeoutCariRb);
      timeoutCariRb = setTimeout(triggerMuatRb, 300);
    });
    selStatusRb?.addEventListener('change', triggerMuatRb);
  }

  // Muat data awal sesuai tab aktif
  if (isBeli && isOwnerOrAdmin) {
    await muatDataReturBeli(container);
  } else {
    await muatDataReturJual(container);
  }
}

/* ========================================================================== */
/* TABEL DATA RETUR PENJUALAN                                                 */
/* ========================================================================== */

async function muatDataReturJual(container) {
  const area = $('#area-tabel-retur-jual', container);
  if (!area) return;

  const cari = $('#search-rj', container)?.value.trim() || '';
  const status = $('#filter-rj-status', container)?.value || '';

  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('retur.list', {
      tipe: 'jual',
      cari,
      q: cari,
      status,
      limit: 100
    });

    const items = (res.items || []).map((it) => ({
      ...it,
      dibuat_at: it.dibuat_at || it.tanggal || it.created_at,
      no_transaksi_asal: it.no_transaksi_asal || it.no_referensi_asal || '-',
      nama_pihak: it.nama_pihak || it.pihak_nama || 'Pelanggan Umum',
      nama_pembuat: it.nama_pembuat || '-'
    }));
    if (items.length === 0) {
      area.innerHTML = renderEmpty('Belum ada data retur penjualan', 'Semua transaksi penjualan berjalan lancar tanpa retur');
      return;
    }

    const user = store.get('user');
    const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table table-card-2col">
          <thead>
            <tr>
              <th>No Retur & Tgl</th>
              <th>Nota Penjualan Asal</th>
              <th>Pelanggan</th>
              <th class="num">Nilai Retur</th>
              <th>Refund</th>
              <th>Status</th>
              <th>Diajukan Oleh</th>
              <th style="text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => {
      let badgeStatus = '<span class="badge badge-warning">Diajukan</span>';
      if (it.status === 'disetujui') badgeStatus = '<span class="badge badge-success">Disetujui</span>';
      if (it.status === 'ditolak') badgeStatus = '<span class="badge badge-danger">Ditolak</span>';

      const metodeRefund = it.metode_refund === 'potong_piutang'
        ? 'Potong Piutang'
        : (it.metode_refund === 'deposit' ? 'Saldo Titipan' : 'Kas Toko');

      return `
                <tr data-id="${escapeHtml(it.id)}">
                  <td data-label="No Retur & Tgl">
                    <div class="fw-semibold">${escapeHtml(it.no_retur || '-')}</div>
                    <div class="text-xs text-muted">${formatTanggal(it.dibuat_at, true)}</div>
                  </td>
                  <td data-label="Nota Asal">
                    <span class="font-mono fw-semibold">${escapeHtml(it.no_transaksi_asal || '-')}</span>
                  </td>
                  <td data-label="Pelanggan">
                    <div class="fw-semibold">${escapeHtml(it.nama_pihak || 'Pelanggan Umum')}</div>
                  </td>
                  <td class="num fw-bold text-danger" data-label="Nilai Retur">${formatRupiah(it.total)}</td>
                  <td data-label="Refund"><span class="badge badge-info">${escapeHtml(metodeRefund)}</span></td>
                  <td data-label="Status">${badgeStatus}</td>
                  <td class="text-xs text-muted" data-label="Petugas">${escapeHtml(it.nama_pembuat || '-')}</td>
                  <td style="text-align: right;" data-label="Aksi">
                    <div class="table-actions">
                      <button type="button" class="btn btn-sm btn-secondary btn-detail-rt" data-id="${escapeHtml(it.id)}" title="Lihat Rincian Retur">
                        Rincian
                      </button>
                      ${it.status === 'diajukan' && isOwnerOrAdmin ? `
                        <button type="button" class="btn btn-sm btn-success btn-setujui-rt" data-id="${escapeHtml(it.id)}" title="Setujui Retur">
                          Setujui
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger btn-tolak-rt" data-id="${escapeHtml(it.id)}" title="Tolak Retur">
                          Tolak
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

    // Pasang listeners
    area.querySelectorAll('.btn-detail-rt').forEach((btn) => {
      btn.addEventListener('click', () => {
        bukaModalDetailRetur(container, btn.getAttribute('data-id'), () => muatDataReturJual(container));
      });
    });

    area.querySelectorAll('.btn-setujui-rt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const setuju = await showConfirm(
          'Setujui Dokumen Retur Ini?',
          'Menyetujui retur akan mengembalikan kuantitas stok ke gudang, menghitung ulang Moving Average HPP memakai harga snapshot asal, serta menyesuaikan poin member/piutang.'
        );
        if (setuju) {
          try {
            const resA = await apiCall('retur.approve', { id });
            showToast(resA.pesan || 'Retur berhasil disetujui', 'success');
            await muatDataReturJual(container);
          } catch (err) {
            showToast(err.message || 'Gagal menyetujui retur', 'error');
          }
        }
      });
    });

    area.querySelectorAll('.btn-tolak-rt').forEach((btn) => {
      btn.addEventListener('click', () => {
        bukaModalTolakRetur(container, btn.getAttribute('data-id'), () => muatDataReturJual(container));
      });
    });

  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat data retur penjualan')}</div>
    `;
  }
}

/* ========================================================================== */
/* TABEL DATA RETUR PEMBELIAN                                                 */
/* ========================================================================== */

async function muatDataReturBeli(container) {
  const area = $('#area-tabel-retur-beli', container);
  if (!area) return;

  const cari = $('#search-rb', container)?.value.trim() || '';
  const status = $('#filter-rb-status', container)?.value || '';

  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('retur.list', {
      tipe: 'beli',
      cari,
      q: cari,
      status,
      limit: 100
    });

    const items = (res.items || []).map((it) => ({
      ...it,
      dibuat_at: it.dibuat_at || it.tanggal || it.created_at,
      no_transaksi_asal: it.no_transaksi_asal || it.no_referensi_asal || '-',
      nama_pihak: it.nama_pihak || it.pihak_nama || 'Supplier Umum',
      nama_pembuat: it.nama_pembuat || '-'
    }));
    if (items.length === 0) {
      area.innerHTML = renderEmpty('Belum ada retur pembelian ke supplier', 'Tidak ada barang cacat atau barang yang dikembalikan ke vendor');
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table table-card-2col">
          <thead>
            <tr>
              <th>No Retur & Tgl</th>
              <th>Faktur Pembelian Asal</th>
              <th>Supplier</th>
              <th class="num">Nilai Retur</th>
              <th>Metode Refund</th>
              <th>Status</th>
              <th>Petugas</th>
              <th style="text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => {
      let badgeStatus = '<span class="badge badge-warning">Diajukan</span>';
      if (it.status === 'disetujui') badgeStatus = '<span class="badge badge-success">Disetujui</span>';
      if (it.status === 'ditolak') badgeStatus = '<span class="badge badge-danger">Ditolak</span>';

      const metodeRefund = it.metode_refund === 'potong_hutang' ? 'Potong Hutang' : 'Kas Masuk';

      return `
                <tr data-id="${escapeHtml(it.id)}">
                  <td data-label="No Retur & Tgl">
                    <div class="fw-semibold">${escapeHtml(it.no_retur || '-')}</div>
                    <div class="text-xs text-muted">${formatTanggal(it.dibuat_at, true)}</div>
                  </td>
                  <td data-label="Faktur Asal">
                    <span class="font-mono fw-semibold">${escapeHtml(it.no_transaksi_asal || '-')}</span>
                  </td>
                  <td data-label="Supplier">
                    <div class="fw-semibold">${escapeHtml(it.nama_pihak || 'Supplier Umum')}</div>
                  </td>
                  <td class="num fw-bold text-success" data-label="Nilai Retur">${formatRupiah(it.total)}</td>
                  <td data-label="Refund"><span class="badge badge-info">${escapeHtml(metodeRefund)}</span></td>
                  <td data-label="Status">${badgeStatus}</td>
                  <td class="text-xs text-muted" data-label="Petugas">${escapeHtml(it.nama_pembuat || '-')}</td>
                  <td style="text-align: right;" data-label="Aksi">
                    <div class="table-actions">
                      <button type="button" class="btn btn-sm btn-secondary btn-detail-rb" data-id="${escapeHtml(it.id)}" title="Lihat Rincian Retur">
                        Rincian
                      </button>
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    area.querySelectorAll('.btn-detail-rb').forEach((btn) => {
      btn.addEventListener('click', () => {
        bukaModalDetailRetur(container, btn.getAttribute('data-id'), () => muatDataReturBeli(container));
      });
    });

  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat data retur pembelian')}</div>
    `;
  }
}

/* ========================================================================== */
/* FORM INPUT RETUR PENJUALAN BARU                                            */
/* ========================================================================== */

function bukaModalFormReturJual(container) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  modalBody.innerHTML = `
    <div class="stack" id="step-cari-nota">
      <div class="field">
        <label class="field-label" for="rj-no-nota">Nomor Nota Penjualan (INV-...) *</label>
        <div class="input-group">
          <input type="text" class="input font-mono uppercase" id="rj-no-nota" placeholder="Contoh: INV-20261112-0001" autocomplete="off" required>
          <button type="button" class="btn btn-secondary" id="btn-cek-nota">Cek Nota</button>
        </div>
        <span class="text-xs text-muted">Masukkan nomor nota lengkap yang tertera pada struk fisik pelanggan</span>
      </div>
      <div id="area-hasil-nota" style="margin-top: var(--sp-2);"></div>
    </div>
  `;

  const modalInstance = showModal({
    title: 'Buat Retur Penjualan (Pelanggan)',
    body: modalBody,
    size: 'lg'
  });

  const inputNota = $('#rj-no-nota', modalBody);
  const btnCekNota = $('#btn-cek-nota', modalBody);
  const areaHasil = $('#area-hasil-nota', modalBody);

  inputNota?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnCekNota?.click();
    }
  });

  btnCekNota?.addEventListener('click', async () => {
    const noNota = inputNota.value.trim().toUpperCase();
    if (!noNota) {
      showToast('Masukkan nomor nota penjualan terlebih dahulu', 'warning');
      return;
    }

    btnCekNota.disabled = true;
    btnCekNota.innerHTML = '<span class="spinner spinner-sm"></span> Cek...';
    areaHasil.innerHTML = renderSkeleton(3);

    try {
      let pj = null;
      let items = [];
      let pel = {};

      try {
        const resDetail = await apiCall('penjualan.detail', { no_nota: noNota });
        if (resDetail && resDetail.penjualan && !resDetail.penjualan.void) {
          pj = resDetail.penjualan;
          items = resDetail.items || [];
          pel = resDetail.pelanggan || {};
        }
      } catch (errDet) {
        // Fallback cari lewat penjualan.list
        const resList = await apiCall('penjualan.list', { cari: noNota, limit: 1 });
        const notaDitemukan = (resList.items || []).find((x) => (x.no_nota === noNota || x.id === noNota) && !x.void);
        if (notaDitemukan) {
          const resDetail = await apiCall('penjualan.detail', { id: notaDitemukan.id });
          pj = resDetail.penjualan || notaDitemukan;
          items = resDetail.items || [];
          pel = resDetail.pelanggan || {};
        }
      }

      if (!pj) {
        btnCekNota.disabled = false;
        btnCekNota.innerHTML = 'Cek Nota';
        areaHasil.innerHTML = `
          <div class="alert alert-warning">
            ${ICONS.alertTriangle}
            <div>Nota penjualan <strong>${escapeHtml(noNota)}</strong> tidak ditemukan atau sudah dibatalkan (void).</div>
          </div>
        `;
        return;
      }

      // Cek apakah ada piutang aktif
      let adaPiutangAktif = false;
      let sisaPiutang = 0;
      try {
        const resPt = await apiCall('piutang.list', { cari: pj.no_nota, limit: 1 });
        const pt = (resPt.items || []).find((x) => x.penjualan_id === pj.id && x.status !== 'lunas');
        if (pt) {
          adaPiutangAktif = true;
          sisaPiutang = pt.sisa;
        }
      } catch (_) { }

      btnCekNota.disabled = false;
      btnCekNota.innerHTML = 'Cek Nota';

      renderFormPilihItemReturJual(container, modalInstance, modalBody, pj, items, pel, adaPiutangAktif, sisaPiutang);

    } catch (err) {
      btnCekNota.disabled = false;
      btnCekNota.innerHTML = 'Cek Nota';
      areaHasil.innerHTML = `
        <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memeriksa nota')}</div>
      `;
    }
  });
}

function renderFormPilihItemReturJual(container, modalInstance, modalBody, pj, items, pel, adaPiutangAktif, sisaPiutang) {
  const user = store.get('user');
  const isKasir = user && user.role === 'kasir';

  modalBody.innerHTML = `
    <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
      <div class="pel-modal-profile-top">
        <div class="grow" style="min-width: 0;">
          <span class="text-xs text-muted">Nota Terverifikasi</span>
          <div class="fw-bold font-mono" style="font-size: var(--fs-base);">${escapeHtml(pj.no_nota)}</div>
          <div class="text-xs text-muted">Tanggal: ${formatTanggal(pj.tanggal || pj.created_at, true)}</div>
        </div>
        <span class="badge ${pel.tipe === 'member' ? 'badge-primary' : 'badge-info'}">
          ${pel.tipe === 'member' ? `Member • ${escapeHtml(pel.level || 'Reguler')}` : 'Non-Member'}
        </span>
      </div>
      <div class="pel-modal-profile-stats">
        <div class="pel-modal-stat-item">
          <span class="text-2xs text-muted uppercase fw-semibold">Pelanggan</span>
          <div class="fw-bold" style="font-size: var(--fs-sm);">${escapeHtml(pel.nama || pj.nama_pelanggan || 'Pelanggan Umum')}</div>
        </div>
        <div class="pel-modal-stat-divider"></div>
        <div class="pel-modal-stat-item" style="text-align: right;">
          <span class="text-2xs text-muted uppercase fw-semibold">Total Nota Asal</span>
          <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(pj.total || 0)}</div>
        </div>
      </div>
    </div>

    <form id="form-submit-retur-jual" class="stack">
      <div class="stack" style="gap: var(--sp-1);">
        <label class="field-label">Pilih Item & Jumlah yang Diretur *</label>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 36px;">Pilih</th>
                <th>Produk / Varian</th>
                <th class="num">Harga Jual</th>
                <th class="num">Qty Beli</th>
                <th class="num" style="width: 110px;">Qty Retur</th>
                <th class="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr>
                  <td data-label="Pilih">
                    <div class="row-between" style="width: 100%; align-items: center;">
                      <span class="fw-bold d-none-desktop">${escapeHtml(it.nama || it.nama_produk || it.produk_nama || 'Produk')}</span>
                      <input type="checkbox" class="cb-retur-item" data-idx="${idx}" checked style="width: 18px; height: 18px;">
                    </div>
                  </td>
                  <td data-label="Produk / Varian">
                    <div class="cell-stack">
                      <div class="fw-semibold">${escapeHtml(it.nama || it.nama_produk || it.produk_nama || 'Produk')}</div>
                      ${it.nama_varian ? `<div class="text-xs text-muted">Varian: ${escapeHtml(it.nama_varian)}</div>` : ''}
                      <div class="text-xs text-muted font-mono">Snapshot HPP: ${formatRupiah(it.hpp_snapshot || it.hpp || 0)}</div>
                    </div>
                  </td>
                  <td class="num" data-label="Harga Jual">${formatRupiah(it.harga)}</td>
                  <td class="num font-mono" data-label="Qty Beli">${formatQty(it.qty)} ${escapeHtml(it.satuan || '')}</td>
                  <td class="num" data-label="Qty Retur">
                    <input type="number" class="input input-sm input-num input-qty-retur" data-idx="${idx}"
                           min="0.001" max="${it.qty}" step="any" value="${it.qty}" style="width: 90px;">
                  </td>
                  <td class="num fw-bold subtotal-retur-item" data-idx="${idx}" data-label="Subtotal">${formatRupiah(it.harga * it.qty)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="row" style="justify-content: space-between; align-items: center; padding: var(--sp-2) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
        <span class="fw-bold">Total Nilai Retur:</span>
        <span class="stat-value text-danger" id="total-nilai-retur-label">Rp 0</span>
      </div>

      <div class="field">
        <label class="field-label" for="rj-metode-refund">Metode Pengembalian Dana (Refund) *</label>
        <select class="input" id="rj-metode-refund" required>
          ${adaPiutangAktif ? `
            <option value="potong_piutang">Potong Sisa Piutang Nota (Sisa Tagihan: ${formatRupiah(sisaPiutang)})</option>
          ` : ''}
          ${pj.pelanggan_id ? `
            <option value="deposit">Kembalikan ke Saldo Titipan (Deposit Pelanggan)</option>
          ` : ''}
          <option value="kas">${adaPiutangAktif ? 'Kembalikan Uang Kas / Tunai ke Pelanggan' : 'Pengembalian Uang Tunai / Kas Toko'}</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="rj-alasan">Alasan Retur Barang *</label>
        <textarea class="input" id="rj-alasan" rows="2" placeholder="Contoh: Keramik retak dalam dus, pelanggan tukar ukuran, sisa proyek pembangunan..." required></textarea>
      </div>

      <div class="alert alert-info text-xs">
        ${ICONS.info}
        <div>
          ${isKasir ? `
            <strong>Permohonan Kasir:</strong> Retur ini akan diajukan ke sistem dengan status <strong>Diajukan</strong>
            dan menunggu persetujuan (approval) Pemilik Toko sebelum stok dan kas disesuaikan.
          ` : `
            <strong>Aturan Bisnis #12:</strong> Moving Average HPP produk akan dihitung ulang secara otomatis menggunakan
            HPP snapshot barang pada saat transaksi penjualan berlangsung.
          `}
        </div>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-form-rj">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-form-rj">
          ${ICONS.check}
          <span>${isKasir ? 'Ajukan Retur ke Owner' : 'Simpan & Setujui Retur'}</span>
        </button>
      </div>
    </form>
  `;

  $('#btn-batal-form-rj', modalBody)?.addEventListener('click', () => modalInstance.close());

  // Logika kalkulasi total nilai retur secara realtime
  const hitungTotalRetur = () => {
    let grandTotal = 0;
    const cbs = modalBody.querySelectorAll('.cb-retur-item');
    cbs.forEach((cb) => {
      const idx = parseInt(cb.getAttribute('data-idx'), 10);
      const inputQ = modalBody.querySelector(`.input-qty-retur[data-idx="${idx}"]`);
      const labelSub = modalBody.querySelector(`.subtotal-retur-item[data-idx="${idx}"]`);
      const item = items[idx];

      if (cb.checked && inputQ && item) {
        inputQ.disabled = false;
        let q = parseQty(inputQ.value);
        if (q > item.qty) {
          q = item.qty;
          inputQ.value = q;
        }
        if (q < 0) {
          q = 0;
          inputQ.value = 0;
        }
        const sub = Math.round(q * item.harga);
        if (labelSub) labelSub.textContent = formatRupiah(sub);
        grandTotal += sub;
      } else {
        if (inputQ) inputQ.disabled = true;
        if (labelSub) labelSub.textContent = 'Rp 0';
      }
    });

    const lblTotal = $('#total-nilai-retur-label', modalBody);
    if (lblTotal) lblTotal.textContent = formatRupiah(grandTotal);
    return grandTotal;
  };

  modalBody.querySelectorAll('.cb-retur-item').forEach((cb) => cb.addEventListener('change', hitungTotalRetur));
  modalBody.querySelectorAll('.input-qty-retur').forEach((inp) => inp.addEventListener('input', hitungTotalRetur));
  hitungTotalRetur();

  // Submit Handler
  $('#form-submit-retur-jual', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const alasan = $('#rj-alasan', modalBody)?.value.trim();
    const metode_refund = $('#rj-metode-refund', modalBody)?.value;

    const payloadItems = [];
    modalBody.querySelectorAll('.cb-retur-item').forEach((cb) => {
      if (cb.checked) {
        const idx = parseInt(cb.getAttribute('data-idx'), 10);
        const item = items[idx];
        const inputQ = modalBody.querySelector(`.input-qty-retur[data-idx="${idx}"]`);
        const qty = parseQty(inputQ ? inputQ.value : 0);
        if (qty > 0) {
          payloadItems.push({
            produk_id: item.produk_id,
            varian_id: item.varian_id || '',
            nama: item.nama || item.nama_produk || item.produk_nama || '',
            satuan: item.satuan || '',
            faktor: item.faktor || 1,
            qty: qty,
            harga: item.harga,
            hpp: item.hpp_snapshot || item.hpp || 0
          });
        }
      }
    });

    if (payloadItems.length === 0) {
      showToast('Pilih minimal satu item barang yang akan diretur', 'warning');
      return;
    }

    const btnSub = $('#btn-submit-form-rj', modalBody);
    if (btnSub) {
      btnSub.disabled = true;
      btnSub.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';
    }

    try {
      const resCreate = await apiCall('retur.create', {
        tipe: 'jual',
        ref_id: pj.id,
        alasan,
        metode_refund,
        items: payloadItems
      });

      modalInstance.close();
      showToast(resCreate.pesan || `Dokumen retur ${resCreate.no_retur} berhasil dibuat`, 'success');
      await muatDataReturJual(container);
    } catch (err) {
      showToast(err.message || 'Gagal membuat retur penjualan', 'error');
      if (btnSub) {
        btnSub.disabled = false;
        btnSub.innerHTML = `${ICONS.check} <span>${isKasir ? 'Ajukan Retur ke Owner' : 'Simpan & Setujui Retur'}</span>`;
      }
    }
  });
}

/* ========================================================================== */
/* FORM INPUT RETUR PEMBELIAN SUPPLIER BARU                                   */
/* ========================================================================== */

function bukaModalFormReturBeli(container) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  modalBody.innerHTML = `
    <div class="stack" id="step-cari-faktur">
      <div class="field">
        <label class="field-label" for="rb-no-faktur">Nomor Faktur Pembelian (PB-...) *</label>
        <div class="input-group">
          <input type="text" class="input font-mono uppercase" id="rb-no-faktur" placeholder="Contoh: PB-20261112-0001" autocomplete="off" required>
          <button type="button" class="btn btn-secondary" id="btn-cek-faktur">Cek Faktur</button>
        </div>
        <span class="text-xs text-muted">Masukkan nomor faktur pembelian barang dari supplier</span>
      </div>
      <div id="area-hasil-faktur" style="margin-top: var(--sp-2);"></div>
    </div>
  `;

  const modalInstance = showModal({
    title: 'Buat Retur Pembelian ke Supplier',
    body: modalBody,
    size: 'lg'
  });

  const inputFaktur = $('#rb-no-faktur', modalBody);
  const btnCekFaktur = $('#btn-cek-faktur', modalBody);
  const areaHasil = $('#area-hasil-faktur', modalBody);

  inputFaktur?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnCekFaktur?.click();
    }
  });

  btnCekFaktur?.addEventListener('click', async () => {
    const noFaktur = inputFaktur.value.trim().toUpperCase();
    if (!noFaktur) {
      showToast('Masukkan nomor faktur pembelian terlebih dahulu', 'warning');
      return;
    }

    btnCekFaktur.disabled = true;
    btnCekFaktur.innerHTML = '<span class="spinner spinner-sm"></span> Cek...';
    areaHasil.innerHTML = renderSkeleton(3);

    try {
      const resList = await apiCall('pembelian.list', { cari: noFaktur, limit: 1 });
      const fakturDitemukan = (resList.items || []).find((x) => x.no_faktur === noFaktur || x.id === noFaktur);

      if (!fakturDitemukan) {
        btnCekFaktur.disabled = false;
        btnCekFaktur.innerHTML = 'Cek Faktur';
        areaHasil.innerHTML = `
          <div class="alert alert-warning">
            ${ICONS.alertTriangle}
            <div>Faktur pembelian <strong>${escapeHtml(noFaktur)}</strong> tidak ditemukan.</div>
          </div>
        `;
        return;
      }

      const resDetail = await apiCall('pembelian.detail', { id: fakturDitemukan.id });
      const pb = resDetail.pembelian || fakturDitemukan;
      const items = resDetail.items || [];
      const sup = resDetail.supplier || {};

      let adaHutangAktif = false;
      let sisaHutang = 0;
      try {
        const resHt = await apiCall('hutang.list', { cari: pb.no_faktur, limit: 1 });
        const ht = (resHt.items || []).find((x) => x.pembelian_id === pb.id && x.status !== 'lunas');
        if (ht) {
          adaHutangAktif = true;
          sisaHutang = ht.sisa;
        }
      } catch (_) { }

      btnCekFaktur.disabled = false;
      btnCekFaktur.innerHTML = 'Cek Faktur';

      renderFormPilihItemReturBeli(container, modalInstance, modalBody, pb, items, sup, adaHutangAktif, sisaHutang);

    } catch (err) {
      btnCekFaktur.disabled = false;
      btnCekFaktur.innerHTML = 'Cek Faktur';
      areaHasil.innerHTML = `
        <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memeriksa faktur')}</div>
      `;
    }
  });
}

function renderFormPilihItemReturBeli(container, modalInstance, modalBody, pb, items, sup, adaHutangAktif, sisaHutang) {
  modalBody.innerHTML = `
    <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
      <div class="pel-modal-profile-top">
        <div class="grow" style="min-width: 0;">
          <span class="text-xs text-muted">Faktur Pembelian</span>
          <div class="fw-bold font-mono" style="font-size: var(--fs-base);">${escapeHtml(pb.no_faktur)}</div>
          <div class="text-xs text-muted">Tanggal: ${formatTanggal(pb.tanggal || pb.created_at, true)}</div>
        </div>
        ${pb.no_faktur_supplier ? `<span class="badge badge-info font-mono">Ref: ${escapeHtml(pb.no_faktur_supplier)}</span>` : ''}
      </div>
      <div class="pel-modal-profile-stats">
        <div class="pel-modal-stat-item">
          <span class="text-2xs text-muted uppercase fw-semibold">Distributor / Supplier</span>
          <div class="fw-bold" style="font-size: var(--fs-sm);">${escapeHtml(sup.nama || pb.nama_supplier || 'Supplier Umum')}</div>
        </div>
        <div class="pel-modal-stat-divider"></div>
        <div class="pel-modal-stat-item" style="text-align: right;">
          <span class="text-2xs text-muted uppercase fw-semibold">Total Faktur Asal</span>
          <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(pb.total || 0)}</div>
        </div>
      </div>
    </div>

    <form id="form-submit-retur-beli" class="stack">
      <div class="stack" style="gap: var(--sp-1);">
        <label class="field-label">Pilih Item Pembelian yang Diretur ke Vendor *</label>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 36px;">Pilih</th>
                <th>Produk / Varian</th>
                <th class="num">Harga Beli</th>
                <th class="num">Qty Beli</th>
                <th class="num" style="width: 110px;">Qty Retur</th>
                <th class="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr>
                  <td data-label="Pilih">
                    <div class="row-between" style="width: 100%; align-items: center;">
                      <span class="fw-bold d-none-desktop">${escapeHtml(it.nama || it.nama_produk || it.produk_nama || 'Produk')}</span>
                      <input type="checkbox" class="cb-retur-item-beli" data-idx="${idx}" checked style="width: 18px; height: 18px;">
                    </div>
                  </td>
                  <td data-label="Produk / Varian">
                    <div class="cell-stack">
                      <div class="fw-semibold">${escapeHtml(it.nama || it.nama_produk || it.produk_nama || 'Produk')}</div>
                      ${it.nama_varian ? `<div class="text-xs text-muted">Varian: ${escapeHtml(it.nama_varian)}</div>` : ''}
                    </div>
                  </td>
                  <td class="num" data-label="Harga Beli">${formatRupiah(it.harga_beli)}</td>
                  <td class="num font-mono" data-label="Qty Beli">${formatQty(it.qty)} ${escapeHtml(it.satuan || '')}</td>
                  <td class="num" data-label="Qty Retur">
                    <input type="number" class="input input-sm input-num input-qty-retur-beli" data-idx="${idx}"
                           min="0.001" max="${it.qty}" step="any" value="${it.qty}" style="width: 90px;">
                  </td>
                  <td class="num fw-bold subtotal-retur-beli-item" data-idx="${idx}" data-label="Subtotal">${formatRupiah(it.harga_beli * it.qty)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="row" style="justify-content: space-between; align-items: center; padding: var(--sp-2) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
        <span class="fw-bold">Total Nilai Retur ke Supplier:</span>
        <span class="stat-value text-success" id="total-nilai-retur-beli-label">Rp 0</span>
      </div>

      <div class="field">
        <label class="field-label" for="rb-metode-refund">Metode Pengembalian Nilai (Refund) *</label>
        <select class="input" id="rb-metode-refund" required>
          ${adaHutangAktif ? `
            <option value="potong_hutang">Potong Sisa Hutang Faktur (Sisa Hutang: ${formatRupiah(sisaHutang)})</option>
            <option value="kas">Vendor Mengembalikan Kas / Transfer Dana</option>
          ` : `
            <option value="kas">Vendor Mengembalikan Kas / Transfer Dana</option>
          `}
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="rb-alasan">Alasan Pengembalian ke Vendor *</label>
        <textarea class="input" id="rb-alasan" rows="2" placeholder="Contoh: Besi bengkok cacat pabrik, semen basah dari gudang distributor..." required></textarea>
      </div>

      <div class="alert alert-info text-xs">
        ${ICONS.info}
        <div>
          <strong>Aturan Bisnis #12:</strong> Retur pembelian mengurangi stok fisik pada gudang dengan HPP berjalan.
          Sesuai standar akuntansi moving average, HPP barang di sistem <strong>tidak berubah</strong> saat retur pembelian.
        </div>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-form-rb">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-form-rb">
          ${ICONS.check}
          <span>Simpan & Setujui Retur</span>
        </button>
      </div>
    </form>
  `;

  $('#btn-batal-form-rb', modalBody)?.addEventListener('click', () => modalInstance.close());

  const hitungTotalReturBeli = () => {
    let grandTotal = 0;
    const cbs = modalBody.querySelectorAll('.cb-retur-item-beli');
    cbs.forEach((cb) => {
      const idx = parseInt(cb.getAttribute('data-idx'), 10);
      const inputQ = modalBody.querySelector(`.input-qty-retur-beli[data-idx="${idx}"]`);
      const labelSub = modalBody.querySelector(`.subtotal-retur-beli-item[data-idx="${idx}"]`);
      const item = items[idx];

      if (cb.checked && inputQ && item) {
        inputQ.disabled = false;
        let q = parseQty(inputQ.value);
        if (q > item.qty) {
          q = item.qty;
          inputQ.value = q;
        }
        if (q < 0) {
          q = 0;
          inputQ.value = 0;
        }
        const sub = Math.round(q * item.harga_beli);
        if (labelSub) labelSub.textContent = formatRupiah(sub);
        grandTotal += sub;
      } else {
        if (inputQ) inputQ.disabled = true;
        if (labelSub) labelSub.textContent = 'Rp 0';
      }
    });

    const lblTotal = $('#total-nilai-retur-beli-label', modalBody);
    if (lblTotal) lblTotal.textContent = formatRupiah(grandTotal);
    return grandTotal;
  };

  modalBody.querySelectorAll('.cb-retur-item-beli').forEach((cb) => cb.addEventListener('change', hitungTotalReturBeli));
  modalBody.querySelectorAll('.input-qty-retur-beli').forEach((inp) => inp.addEventListener('input', hitungTotalReturBeli));
  hitungTotalReturBeli();

  $('#form-submit-retur-beli', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const alasan = $('#rb-alasan', modalBody)?.value.trim();
    const metode_refund = $('#rb-metode-refund', modalBody)?.value;

    const payloadItems = [];
    modalBody.querySelectorAll('.cb-retur-item-beli').forEach((cb) => {
      if (cb.checked) {
        const idx = parseInt(cb.getAttribute('data-idx'), 10);
        const item = items[idx];
        const inputQ = modalBody.querySelector(`.input-qty-retur-beli[data-idx="${idx}"]`);
        const qty = parseQty(inputQ ? inputQ.value : 0);
        if (qty > 0) {
          payloadItems.push({
            produk_id: item.produk_id,
            varian_id: item.varian_id || '',
            nama: item.nama || item.nama_produk || item.produk_nama || '',
            satuan: item.satuan || '',
            faktor: item.faktor || 1,
            qty: qty,
            harga: item.harga_beli,
            hpp: item.harga_beli
          });
        }
      }
    });

    if (payloadItems.length === 0) {
      showToast('Pilih minimal satu item barang yang akan diretur ke vendor', 'warning');
      return;
    }

    const btnSub = $('#btn-submit-form-rb', modalBody);
    if (btnSub) {
      btnSub.disabled = true;
      btnSub.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';
    }

    try {
      const resCreate = await apiCall('retur.create', {
        tipe: 'beli',
        ref_id: pb.id,
        alasan,
        metode_refund,
        items: payloadItems
      });

      modalInstance.close();
      showToast(resCreate.pesan || `Dokumen retur pembelian ${resCreate.no_retur} berhasil dicatat`, 'success');
      await muatDataReturBeli(container);
    } catch (err) {
      showToast(err.message || 'Gagal membuat retur pembelian', 'error');
      if (btnSub) {
        btnSub.disabled = false;
        btnSub.innerHTML = `${ICONS.check} <span>Simpan & Setujui Retur</span>`;
      }
    }
  });
}

/* ========================================================================== */
/* MODAL DETAIL DOKUMEN RETUR                                                 */
/* ========================================================================== */

async function bukaModalDetailRetur(container, returId, onRefresh) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';
  modalBody.innerHTML = renderSkeleton(4);

  const modalInstance = showModal({
    title: 'Rincian Dokumen Retur',
    body: modalBody,
    width: '600px'
  });

  try {
    const res = await apiCall('retur.detail', { id: returId });
    const rt = res.retur || {};
    const items = res.items || [];
    const pihak = res.pihak || {};
    const txAsal = res.transaksi_asal || {};

    const user = store.get('user');
    const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

    let badgeStatus = '<span class="badge badge-warning">Diajukan</span>';
    if (rt.status === 'disetujui') badgeStatus = '<span class="badge badge-success">Disetujui</span>';
    if (rt.status === 'ditolak') badgeStatus = '<span class="badge badge-danger">Ditolak</span>';

    const judulPihak = rt.tipe === 'jual' ? 'Pelanggan' : 'Supplier / Distributor';
    const noTx = txAsal.no_nota || txAsal.no_faktur || rt.ref_id || '-';

    modalBody.innerHTML = `
      <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="pel-modal-profile-top">
          <div class="grow" style="min-width: 0;">
            <span class="text-xs text-muted">No Retur</span>
            <div class="fw-bold font-mono" style="font-size: var(--fs-md); line-height: 1.3;">${escapeHtml(rt.no_retur || '-')}</div>
            <div class="text-xs text-muted" style="margin-top: 2px;">Tgl: ${formatTanggal(rt.tanggal || rt.created_at, true)}</div>
            <div class="text-xs" style="margin-top: 2px;">Referensi: <span class="font-mono fw-semibold">${escapeHtml(noTx)}</span></div>
          </div>
          ${badgeStatus}
        </div>
        <div class="pel-modal-profile-stats">
          <div class="pel-modal-stat-item">
            <span class="text-2xs text-muted uppercase fw-semibold">Metode Refund</span>
            <div style="margin-top: 2px;"><span class="badge badge-info">${escapeHtml(
              rt.metode_refund === 'potong_piutang' ? 'Potong Piutang'
                : (rt.metode_refund === 'potong_hutang' ? 'Potong Hutang'
                  : (rt.metode_refund === 'deposit' ? 'Saldo Titipan' : 'Kas Toko'))
            )}</span></div>
          </div>
          <div class="pel-modal-stat-divider"></div>
          <div class="pel-modal-stat-item" style="text-align: right;">
            <span class="text-2xs text-muted uppercase fw-semibold">Total Nilai Retur</span>
            <div class="fw-bold text-danger tabular" style="font-size: var(--fs-lg);">${formatRupiah(rt.total)}</div>
          </div>
        </div>
      </div>

      <div class="row" style="gap: var(--sp-2); font-size: var(--fs-sm); flex-wrap: wrap;">
        <div class="grow" style="min-width: 140px;">
          <span class="text-xs text-muted uppercase fw-semibold">${judulPihak}</span>
          <div class="fw-semibold">${escapeHtml(pihak.nama || '-')}</div>
          <div class="text-xs text-muted">${escapeHtml(pihak.hp || pihak.kontak || '-')}</div>
        </div>
        <div class="grow" style="min-width: 140px;">
          <span class="text-xs text-muted uppercase fw-semibold">Alasan Retur</span>
          <div class="fw-semibold">${escapeHtml(rt.alasan || '-')}</div>
        </div>
      </div>

      <div class="stack" style="gap: var(--sp-1); margin-top: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">ITEM BARANG YANG DIRETUR</span>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Produk / Varian</th>
                <th class="num">Qty Retur</th>
                <th class="num">Harga</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it) => `
                <tr>
                  <td data-label="Produk / Varian">
                    <div class="cell-stack">
                      <div class="fw-semibold">${escapeHtml(it.nama_produk || it.nama || 'Produk')}</div>
                      ${it.nama_varian ? `<div class="text-xs text-muted">Varian: ${escapeHtml(it.nama_varian)}</div>` : ''}
                    </div>
                  </td>
                  <td class="num font-mono" data-label="Qty Retur">${formatQty(it.qty)} ${escapeHtml(it.satuan || '')}</td>
                  <td class="num" data-label="Harga">${formatRupiah(it.harga)}</td>
                  <td class="num fw-bold" data-label="Total">${formatRupiah(it.total || it.subtotal || (Number(it.qty) * Number(it.harga)))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-tutup-detail-rt">Tutup</button>
        ${rt.status === 'diajukan' && isOwnerOrAdmin ? `
          <button type="button" class="btn btn-danger" id="btn-modal-tolak-rt">Tolak</button>
          <button type="button" class="btn btn-success" id="btn-modal-setujui-rt">Setujui Retur</button>
        ` : ''}
      </div>
    `;

    $('#btn-tutup-detail-rt', modalBody)?.addEventListener('click', () => modalInstance.close());

    $('#btn-modal-setujui-rt', modalBody)?.addEventListener('click', async () => {
      const setuju = await showConfirm(
        'Setujui Permohonan Retur Ini?',
        'Stok akan disesuaikan, Moving Average HPP dihitung ulang, dan penyesuaian dana/piutang akan langsung dieksekusi.'
      );
      if (setuju) {
        try {
          const resA = await apiCall('retur.approve', { id: rt.id });
          modalInstance.close();
          showToast(resA.pesan || 'Retur berhasil disetujui', 'success');
          if (onRefresh) onRefresh();
        } catch (err) {
          showToast(err.message || 'Gagal menyetujui retur', 'error');
        }
      }
    });

    $('#btn-modal-tolak-rt', modalBody)?.addEventListener('click', () => {
      modalInstance.close();
      bukaModalTolakRetur(container, rt.id, onRefresh);
    });

  } catch (err) {
    modalBody.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat rincian retur')}</div>
    `;
  }
}

/* ========================================================================== */
/* MODAL TOLAK PERMOHONAN RETUR                                               */
/* ========================================================================== */

function bukaModalTolakRetur(container, returId, onRefresh) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  modalBody.innerHTML = `
    <form id="form-tolak-rt" class="stack">
      <div class="field">
        <label class="field-label" for="alasan-tolak-input">Alasan Penolakan Permohonan Retur *</label>
        <textarea class="input" id="alasan-tolak-input" rows="3" placeholder="Jelaskan alasan penolakan retur (misal: kemasan rusak akibat kelalaian pembeli, melewati batas waktu 7 hari, dsb)..." required></textarea>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-tolak">Batal</button>
        <button type="submit" class="btn btn-danger" id="btn-konfirmasi-tolak">
          Tolak Permohonan
        </button>
      </div>
    </form>
  `;

  const modalInstance = showModal({
    title: 'Tolak Permohonan Retur',
    body: modalBody,
    width: '460px'
  });

  $('#btn-batal-tolak', modalBody)?.addEventListener('click', () => modalInstance.close());

  $('#form-tolak-rt', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alasan_tolak = $('#alasan-tolak-input', modalBody)?.value.trim();
    if (!alasan_tolak) {
      showToast('Alasan penolakan wajib diisi', 'warning');
      return;
    }

    try {
      const res = await apiCall('retur.reject', { id: returId, alasan_tolak });
      modalInstance.close();
      showToast(res.pesan || 'Permohonan retur telah ditolak', 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      showToast(err.message || 'Gagal menolak retur', 'error');
    }
  });
}


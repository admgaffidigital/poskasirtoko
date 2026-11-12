/**
 * hutang-piutang.js — Modul Keuangan: Hutang Supplier & Piutang Pelanggan
 * Sesuai Fase 4 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #7 & #16
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, parseRupiah, formatTanggal } from '../utils/format.js';

export async function renderHutangPiutangModule(container) {
  const user = store.get('user');
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Keuangan: Hutang & Piutang</h2>
          <p>Pengelolaan tagihan tempo pelanggan, cicilan pelunasan, pengingat WhatsApp, dan hutang supplier</p>
        </div>
        <div class="segmented" id="tabs-hp" role="tablist">
          <button type="button" id="tab-btn-piutang" class="btn btn-sm" aria-pressed="true">
            ${ICONS.wallet}
            <span>Piutang Pelanggan</span>
          </button>
          <button type="button" id="tab-btn-hutang" class="btn btn-sm" aria-pressed="false">
            ${ICONS.truck}
            <span>Hutang Supplier</span>
          </button>
        </div>
      </div>

      <!-- Konten Tab 1: Piutang Pelanggan -->
      <div id="panel-piutang" class="stack">
        <!-- Stat Cards Piutang -->
        <div class="grid grid-3" style="gap: var(--sp-3);" id="stat-cards-piutang">
          <div class="card card-body stat-card">
            <span class="text-xs text-muted fw-semibold">TOTAL SISA PIUTANG</span>
            <div class="stat-value text-primary" id="stat-piutang-total">Rp 0</div>
            <span class="text-xs text-muted" id="stat-piutang-ket">Dari semua nota tempo aktif</span>
          </div>
          <div class="card card-body stat-card">
            <span class="text-xs text-muted fw-semibold">JATUH TEMPO LEWAT (OVERDUE)</span>
            <div class="stat-value text-danger" id="stat-piutang-overdue">0 Nota</div>
            <span class="text-xs text-muted">Perlu segera ditagih</span>
          </div>
          <div class="card card-body stat-card">
            <span class="text-xs text-muted fw-semibold">JUMLAH TRANSAKSI PIUTANG</span>
            <div class="stat-value" id="stat-piutang-count">0 Transaksi</div>
            <span class="text-xs text-muted" id="stat-piutang-pelanggan">-</span>
          </div>
        </div>

        <div class="card card-body stack">
          <!-- Filter Bar Piutang -->
          <div class="row" style="gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap;">
            <div class="field" style="width: 170px;">
              <label class="field-label" for="filter-pt-status">Status Piutang</label>
              <select class="input" id="filter-pt-status">
                <option value="">Semua Status</option>
                <option value="belum">Belum Lunas</option>
                <option value="sebagian">Sebagian</option>
                <option value="lunas">Lunas</option>
              </select>
            </div>

            <div class="field grow">
              <label class="field-label" for="search-pt">Cari Piutang</label>
              <div class="input-group">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" class="input" id="search-pt" placeholder="Cari no nota INV, nama pelanggan, atau HP...">
              </div>
            </div>

            <div class="field" style="display: flex; align-items: center; padding-bottom: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); cursor: pointer;">
                <input type="checkbox" id="check-pt-overdue">
                <span class="fw-semibold text-danger">Hanya Jatuh Tempo Lewat</span>
              </label>
            </div>

            <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-pt" title="Muat Ulang" style="margin-bottom: 2px;">
              ${ICONS.refresh}
            </button>
          </div>

          <div id="area-tabel-piutang" style="margin-top: var(--sp-2);">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>

      <!-- Konten Tab 2: Hutang Supplier -->
      <div id="panel-hutang" class="stack" style="display: none;">
        ${!isOwnerOrAdmin ? `
          <div class="card card-body text-center" style="padding: var(--sp-6);">
            <div style="font-size: 40px; margin-bottom: var(--sp-2); color: var(--warning-text);">${ICONS.alertTriangle}</div>
            <h3 style="margin-bottom: var(--sp-2);">Akses Terbatas</h3>
            <p class="text-muted" style="max-width: 480px; margin: 0 auto;">
              Modul Hutang Supplier hanya dapat diakses oleh Pemilik Toko (Owner) dan Administrator.
              Silakan login dengan akun yang memiliki wewenang.
            </p>
          </div>
        ` : `
          <!-- Stat Cards Hutang -->
          <div class="grid grid-3" style="gap: var(--sp-3);" id="stat-cards-hutang">
            <div class="card card-body stat-card">
              <span class="text-xs text-muted fw-semibold">TOTAL SISA HUTANG SUPPLIER</span>
              <div class="stat-value text-danger" id="stat-hutang-total">Rp 0</div>
              <span class="text-xs text-muted">Kewajiban pengadaan barang berjalan</span>
            </div>
            <div class="card card-body stat-card">
              <span class="text-xs text-muted fw-semibold">JATUH TEMPO LEWAT (OVERDUE)</span>
              <div class="stat-value text-warning" id="stat-hutang-overdue">0 Faktur</div>
              <span class="text-xs text-muted">Perlu segera diselesaikan</span>
            </div>
            <div class="card card-body stat-card">
              <span class="text-xs text-muted fw-semibold">FAKTUR HUTANG AKTIF</span>
              <div class="stat-value" id="stat-hutang-count">0 Faktur</div>
              <span class="text-xs text-muted" id="stat-hutang-supplier">-</span>
            </div>
          </div>

          <div class="card card-body stack">
            <!-- Filter Bar Hutang -->
            <div class="row" style="gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap;">
              <div class="field" style="width: 170px;">
                <label class="field-label" for="filter-ht-status">Status Hutang</label>
                <select class="input" id="filter-ht-status">
                  <option value="">Semua Status</option>
                  <option value="belum">Belum Lunas</option>
                  <option value="sebagian">Sebagian</option>
                  <option value="lunas">Lunas</option>
                </select>
              </div>

              <div class="field grow">
                <label class="field-label" for="search-ht">Cari Hutang</label>
                <div class="input-group">
                  <span class="input-icon">${ICONS.search}</span>
                  <input type="search" class="input" id="search-ht" placeholder="Cari no faktur PB, faktur supplier, atau nama supplier...">
                </div>
              </div>

              <div class="field" style="display: flex; align-items: center; padding-bottom: 8px;">
                <label style="display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); cursor: pointer;">
                  <input type="checkbox" id="check-ht-overdue">
                  <span class="fw-semibold text-danger">Hanya Jatuh Tempo Lewat</span>
                </label>
              </div>

              <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-ht" title="Muat Ulang" style="margin-bottom: 2px;">
                ${ICONS.refresh}
              </button>
            </div>

            <div id="area-tabel-hutang" style="margin-top: var(--sp-2);">
              ${renderSkeleton(4)}
            </div>
          </div>
        `}
      </div>
    </div>
  `;

  // Binding Tab Switching
  const btnTabPiutang = $('#tab-btn-piutang', container);
  const btnTabHutang = $('#tab-btn-hutang', container);
  const panelPiutang = $('#panel-piutang', container);
  const panelHutang = $('#panel-hutang', container);

  btnTabPiutang?.addEventListener('click', () => {
    btnTabPiutang.setAttribute('aria-pressed', 'true');
    btnTabHutang.setAttribute('aria-pressed', 'false');
    panelPiutang.style.display = 'flex';
    panelHutang.style.display = 'none';
  });

  btnTabHutang?.addEventListener('click', () => {
    btnTabHutang.setAttribute('aria-pressed', 'true');
    btnTabPiutang.setAttribute('aria-pressed', 'false');
    panelHutang.style.display = 'flex';
    panelPiutang.style.display = 'none';
    if (isOwnerOrAdmin) {
      muatDataHutang(container);
    }
  });

  // Event Listeners Filter Piutang
  let timeoutCariPt = null;
  const inputSearchPt = $('#search-pt', container);
  const selStatusPt = $('#filter-pt-status', container);
  const chkOverduePt = $('#check-pt-overdue', container);

  const triggerMuatPt = () => muatDataPiutang(container);

  inputSearchPt?.addEventListener('input', () => {
    clearTimeout(timeoutCariPt);
    timeoutCariPt = setTimeout(triggerMuatPt, 300);
  });
  selStatusPt?.addEventListener('change', triggerMuatPt);
  chkOverduePt?.addEventListener('change', triggerMuatPt);
  $('#btn-refresh-pt', container)?.addEventListener('click', triggerMuatPt);

  // Event Listeners Filter Hutang (jika owner/admin)
  if (isOwnerOrAdmin) {
    let timeoutCariHt = null;
    const inputSearchHt = $('#search-ht', container);
    const selStatusHt = $('#filter-ht-status', container);
    const chkOverdueHt = $('#check-ht-overdue', container);

    const triggerMuatHt = () => muatDataHutang(container);

    inputSearchHt?.addEventListener('input', () => {
      clearTimeout(timeoutCariHt);
      timeoutCariHt = setTimeout(triggerMuatHt, 300);
    });
    selStatusHt?.addEventListener('change', triggerMuatHt);
    chkOverdueHt?.addEventListener('change', triggerMuatHt);
    $('#btn-refresh-ht', container)?.addEventListener('click', triggerMuatHt);
  }

  // Muat data awal tab piutang
  await muatDataPiutang(container);
}

/* ========================================================================== */
/* LOGIKA DATA PIUTANG PELANGGAN                                              */
/* ========================================================================== */

async function muatDataPiutang(container) {
  const area = $('#area-tabel-piutang', container);
  if (!area) return;

  const cari = $('#search-pt', container)?.value.trim() || '';
  const status = $('#filter-pt-status', container)?.value || '';
  const jatuh_tempo_lewat = $('#check-pt-overdue', container)?.checked || false;

  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('piutang.list', {
      cari,
      status,
      jatuh_tempo_lewat,
      limit: 100
    });

    const items = res.items || [];
    const totalSisa = res.total_sisa_piutang || 0;
    const overdueCount = items.filter((it) => it.jatuh_tempo_lewat && it.status !== 'lunas').length;

    // Perbarui stat cards
    const statTotal = $('#stat-piutang-total', container);
    const statOverdue = $('#stat-piutang-overdue', container);
    const statCount = $('#stat-piutang-count', container);
    const statPelanggan = $('#stat-piutang-pelanggan', container);

    if (statTotal) statTotal.textContent = formatRupiah(totalSisa);
    if (statOverdue) statOverdue.textContent = `${overdueCount} Nota`;
    if (statCount) statCount.textContent = `${items.length} Nota`;

    const setPelangganUnik = new Set(items.map((it) => it.pelanggan_id).filter(Boolean));
    if (statPelanggan) statPelanggan.textContent = `${setPelangganUnik.size} Pelanggan terkait`;

    if (items.length === 0) {
      area.innerHTML = renderEmpty('Tidak ada data piutang ditemukan', 'Semua tagihan lunas atau belum ada penjualan tempo');
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>No Nota & Tgl</th>
              <th>Pelanggan</th>
              <th class="num">Total Tagihan</th>
              <th class="num">Sisa Piutang</th>
              <th>Status</th>
              <th>Jatuh Tempo</th>
              <th style="text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => {
              let badgeStatus = '<span class="badge badge-warning">Belum Lunas</span>';
              if (it.status === 'sebagian') badgeStatus = '<span class="badge badge-info">Sebagian</span>';
              if (it.status === 'lunas') badgeStatus = '<span class="badge badge-success">Lunas</span>';

              const isOverdue = it.jatuh_tempo_lewat && it.status !== 'lunas';
              const tglJatuhTempo = it.jatuh_tempo ? formatTanggal(it.jatuh_tempo) : '-';

              return `
                <tr data-id="${escapeHtml(it.id)}">
                  <td>
                    <div class="fw-semibold">${escapeHtml(it.no_nota || '-')}</div>
                    <div class="text-xs text-muted">${formatTanggal(it.tanggal_nota, true)}</div>
                  </td>
                  <td>
                    <div class="fw-semibold">${escapeHtml(it.nama_pelanggan || 'Pelanggan Umum')}</div>
                    <div class="text-xs text-muted">${escapeHtml(it.hp_pelanggan || '-')}</div>
                  </td>
                  <td class="num fw-semibold">${formatRupiah(it.total)}</td>
                  <td class="num">
                    <span class="fw-bold ${it.sisa > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(it.sisa)}</span>
                  </td>
                  <td>${badgeStatus}</td>
                  <td>
                    <div class="${isOverdue ? 'text-danger fw-bold' : ''}">
                      ${tglJatuhTempo}
                    </div>
                    ${isOverdue ? '<span class="badge badge-danger text-xs">Lewat Tempo</span>' : ''}
                  </td>
                  <td style="text-align: right;">
                    <div class="row" style="gap: var(--sp-1); justify-content: flex-end;">
                      ${it.sisa > 0 ? `
                        <button type="button" class="btn btn-sm btn-primary btn-bayar-pt" data-id="${escapeHtml(it.id)}" title="Bayar Cicilan / Pelunasan">
                          Bayar
                        </button>
                      ` : ''}
                      ${it.sisa > 0 && it.hp_pelanggan ? `
                        <button type="button" class="btn btn-sm btn-secondary btn-wa-pt" data-id="${escapeHtml(it.id)}" title="Kirim Tagihan via WhatsApp">
                          WA
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-sm btn-ghost btn-detail-pt" data-id="${escapeHtml(it.id)}" title="Lihat Rincian & Riwayat Cicilan">
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

    // Pasang Event Listeners pada Tombol Aksi Piutang
    area.querySelectorAll('.btn-bayar-pt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const piutang = items.find((x) => x.id === id);
        if (piutang) bukaModalBayarPiutang(container, piutang);
      });
    });

    area.querySelectorAll('.btn-wa-pt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const piutang = items.find((x) => x.id === id);
        if (piutang) kirimPesanWhatsAppTagihan(piutang);
      });
    });

    area.querySelectorAll('.btn-detail-pt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        bukaModalDetailPiutang(id);
      });
    });

  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>
          <div class="fw-semibold">Gagal memuat daftar piutang</div>
          <div class="text-xs">${escapeHtml(err.message || 'Terjadi kesalahan sistem')}</div>
        </div>
      </div>
    `;
  }
}

/* ========================================================================== */
/* LOGIKA DATA HUTANG SUPPLIER                                                */
/* ========================================================================== */

async function muatDataHutang(container) {
  const area = $('#area-tabel-hutang', container);
  if (!area) return;

  const cari = $('#search-ht', container)?.value.trim() || '';
  const status = $('#filter-ht-status', container)?.value || '';
  const jatuh_tempo_lewat = $('#check-ht-overdue', container)?.checked || false;

  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('hutang.list', {
      cari,
      status,
      jatuh_tempo_lewat,
      limit: 100
    });

    const items = res.items || [];
    const totalSisa = res.total_sisa_hutang || 0;
    const overdueCount = items.filter((it) => it.jatuh_tempo_lewat && it.status !== 'lunas').length;

    // Perbarui stat cards
    const statTotal = $('#stat-hutang-total', container);
    const statOverdue = $('#stat-hutang-overdue', container);
    const statCount = $('#stat-hutang-count', container);
    const statSupplier = $('#stat-hutang-supplier', container);

    if (statTotal) statTotal.textContent = formatRupiah(totalSisa);
    if (statOverdue) statOverdue.textContent = `${overdueCount} Faktur`;
    if (statCount) statCount.textContent = `${items.length} Faktur`;

    const setSupplierUnik = new Set(items.map((it) => it.supplier_id).filter(Boolean));
    if (statSupplier) statSupplier.textContent = `${setSupplierUnik.size} Supplier terkait`;

    if (items.length === 0) {
      area.innerHTML = renderEmpty('Tidak ada data hutang ditemukan', 'Semua kewajiban pembelian ke supplier telah lunas');
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>No Faktur & Tgl</th>
              <th>Supplier</th>
              <th>No Faktur Vendor</th>
              <th class="num">Total Faktur</th>
              <th class="num">Sisa Hutang</th>
              <th>Status</th>
              <th>Jatuh Tempo</th>
              <th style="text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => {
              let badgeStatus = '<span class="badge badge-warning">Belum Lunas</span>';
              if (it.status === 'sebagian') badgeStatus = '<span class="badge badge-info">Sebagian</span>';
              if (it.status === 'lunas') badgeStatus = '<span class="badge badge-success">Lunas</span>';

              const isOverdue = it.jatuh_tempo_lewat && it.status !== 'lunas';
              const tglJatuhTempo = it.jatuh_tempo ? formatTanggal(it.jatuh_tempo) : '-';

              return `
                <tr data-id="${escapeHtml(it.id)}">
                  <td>
                    <div class="fw-semibold">${escapeHtml(it.no_faktur || '-')}</div>
                    <div class="text-xs text-muted">${formatTanggal(it.tanggal_faktur, true)}</div>
                  </td>
                  <td>
                    <div class="fw-semibold">${escapeHtml(it.nama_supplier || 'Supplier Umum')}</div>
                    <div class="text-xs text-muted">${escapeHtml(it.hp_supplier || '-')}</div>
                  </td>
                  <td>
                    <span class="text-xs font-mono">${escapeHtml(it.no_faktur_supplier || '-')}</span>
                  </td>
                  <td class="num fw-semibold">${formatRupiah(it.total)}</td>
                  <td class="num">
                    <span class="fw-bold ${it.sisa > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(it.sisa)}</span>
                  </td>
                  <td>${badgeStatus}</td>
                  <td>
                    <div class="${isOverdue ? 'text-danger fw-bold' : ''}">
                      ${tglJatuhTempo}
                    </div>
                    ${isOverdue ? '<span class="badge badge-danger text-xs">Lewat Tempo</span>' : ''}
                  </td>
                  <td style="text-align: right;">
                    <div class="row" style="gap: var(--sp-1); justify-content: flex-end;">
                      ${it.sisa > 0 ? `
                        <button type="button" class="btn btn-sm btn-primary btn-bayar-ht" data-id="${escapeHtml(it.id)}" title="Bayar Hutang Supplier">
                          Bayar
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-sm btn-ghost btn-detail-ht" data-id="${escapeHtml(it.id)}" title="Lihat Rincian & Riwayat Pembayaran">
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

    // Pasang Event Listeners pada Tombol Aksi Hutang
    area.querySelectorAll('.btn-bayar-ht').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const hutang = items.find((x) => x.id === id);
        if (hutang) bukaModalBayarHutang(container, hutang);
      });
    });

    area.querySelectorAll('.btn-detail-ht').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        bukaModalDetailHutang(id);
      });
    });

  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>
          <div class="fw-semibold">Gagal memuat data hutang</div>
          <div class="text-xs">${escapeHtml(err.message || 'Terjadi kesalahan sistem')}</div>
        </div>
      </div>
    `;
  }
}

/* ========================================================================== */
/* MODAL PEMBAYARAN CICILAN / PELUNASAN PIUTANG                               */
/* ========================================================================== */

function bukaModalBayarPiutang(container, piutang) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  modalBody.innerHTML = `
    <div class="card card-body" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <span class="text-xs text-muted">No Nota Penjualan</span>
          <div class="fw-bold">${escapeHtml(piutang.no_nota || '-')}</div>
          <div class="text-xs">${escapeHtml(piutang.nama_pelanggan || 'Pelanggan Umum')}</div>
        </div>
        <div style="text-align: right;">
          <span class="text-xs text-muted">Sisa Piutang Saat Ini</span>
          <div class="fw-bold text-danger" style="font-size: var(--fs-lg);">${formatRupiah(piutang.sisa)}</div>
        </div>
      </div>
    </div>

    <form id="form-bayar-pt" class="stack">
      <div class="field">
        <label class="field-label" for="pt-nominal">Nominal Pembayaran *</label>
        <div class="input-group">
          <span class="input-icon" style="font-size: 13px; font-weight: 600;">Rp</span>
          <input type="text" class="input fw-bold" id="pt-nominal" value="${formatRupiah(piutang.sisa, false)}" required autocomplete="off">
        </div>
        <div class="row" style="gap: var(--sp-2); margin-top: var(--sp-1);">
          <button type="button" class="btn btn-xs btn-secondary" id="btn-pt-lunas">Bayar Lunas (100%)</button>
          <button type="button" class="btn btn-xs btn-secondary" id="btn-pt-50">Bayar 50%</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="pt-metode">Metode Pembayaran *</label>
        <select class="input" id="pt-metode" required>
          <option value="tunai">Tunai / Cash</option>
          <option value="transfer">Transfer Bank (BCA / Mandiri / BRI / BNI)</option>
          <option value="qris">QRIS Statis Toko</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="pt-catatan">Catatan / Referensi</label>
        <input type="text" class="input" id="pt-catatan" placeholder="Contoh: Cicilan transfer BCA an. Pak Agus">
      </div>

      <div class="alert alert-info text-xs" style="margin-top: var(--sp-2);">
        ${ICONS.info}
        <div>
          <strong>Aturan Bisnis #7 & #16:</strong> Poin loyalitas member dan akumulasi total belanja
          hanya akan dihadiahkan ke pelanggan saat piutang tempo telah diselesaikan secara <strong>LUNAS</strong>.
        </div>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-pt">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-pt">
          ${ICONS.check}
          <span>Simpan Pembayaran</span>
        </button>
      </div>
    </form>
  `;

  const inputNominal = $('#pt-nominal', modalBody);
  inputNominal?.addEventListener('input', () => {
    const angka = parseRupiah(inputNominal.value);
    inputNominal.value = formatRupiah(angka, false);
  });

  $('#btn-pt-lunas', modalBody)?.addEventListener('click', () => {
    inputNominal.value = formatRupiah(piutang.sisa, false);
  });

  $('#btn-pt-50', modalBody)?.addEventListener('click', () => {
    const separuh = Math.floor(piutang.sisa / 2);
    inputNominal.value = formatRupiah(separuh, false);
  });

  const modalInstance = showModal({
    title: 'Bayar Cicilan / Pelunasan Piutang',
    body: modalBody,
    width: '460px'
  });

  $('#btn-batal-pt', modalBody)?.addEventListener('click', () => modalInstance.close());

  $('#form-bayar-pt', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jumlah = parseRupiah(inputNominal.value);
    const metode = $('#pt-metode', modalBody)?.value;
    const catatan = $('#pt-catatan', modalBody)?.value.trim();

    if (jumlah <= 0) {
      showToast('Nominal pembayaran harus lebih besar dari Rp 0', 'error');
      return;
    }
    if (jumlah > piutang.sisa) {
      showToast(`Nominal pembayaran (${formatRupiah(jumlah)}) melebihi sisa piutang (${formatRupiah(piutang.sisa)})`, 'error');
      return;
    }

    const btnSimpan = $('#btn-simpan-pt', modalBody);
    if (btnSimpan) {
      btnSimpan.disabled = true;
      btnSimpan.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';
    }

    try {
      const res = await apiCall('piutang.bayar', {
        id: piutang.id,
        jumlah,
        metode,
        catatan
      });

      modalInstance.close();
      let pesanSukses = res.pesan || 'Pembayaran piutang berhasil dicatat';
      if (res.poin_didapat && res.poin_didapat > 0) {
        pesanSukses += ` (Pelanggan mendapatkan ${res.poin_didapat} poin loyalitas!)`;
      }
      showToast(pesanSukses, 'success');
      await muatDataPiutang(container);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pembayaran piutang', 'error');
      if (btnSimpan) {
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = `${ICONS.check} <span>Simpan Pembayaran</span>`;
      }
    }
  });
}

/* ========================================================================== */
/* MODAL PEMBAYARAN CICILAN / PELUNASAN HUTANG                                */
/* ========================================================================== */

function bukaModalBayarHutang(container, hutang) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  modalBody.innerHTML = `
    <div class="card card-body" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <span class="text-xs text-muted">No Faktur Pembelian</span>
          <div class="fw-bold">${escapeHtml(hutang.no_faktur || '-')}</div>
          <div class="text-xs">${escapeHtml(hutang.nama_supplier || 'Supplier Umum')}</div>
        </div>
        <div style="text-align: right;">
          <span class="text-xs text-muted">Sisa Hutang Saat Ini</span>
          <div class="fw-bold text-danger" style="font-size: var(--fs-lg);">${formatRupiah(hutang.sisa)}</div>
        </div>
      </div>
    </div>

    <form id="form-bayar-ht" class="stack">
      <div class="field">
        <label class="field-label" for="ht-nominal">Nominal Pembayaran Hutang *</label>
        <div class="input-group">
          <span class="input-icon" style="font-size: 13px; font-weight: 600;">Rp</span>
          <input type="text" class="input fw-bold" id="ht-nominal" value="${formatRupiah(hutang.sisa, false)}" required autocomplete="off">
        </div>
        <div class="row" style="gap: var(--sp-2); margin-top: var(--sp-1);">
          <button type="button" class="btn btn-xs btn-secondary" id="btn-ht-lunas">Bayar Lunas (100%)</button>
          <button type="button" class="btn btn-xs btn-secondary" id="btn-ht-50">Bayar 50%</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="ht-metode">Metode Pembayaran *</label>
        <select class="input" id="ht-metode" required>
          <option value="transfer">Transfer Bank (BCA / Mandiri / Rekening Vendor)</option>
          <option value="tunai">Tunai / Kas Toko</option>
          <option value="giro">Giro / Cek Jatuh Tempo</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="ht-catatan">Catatan / No Referensi Transfer</label>
        <input type="text" class="input" id="ht-catatan" placeholder="Contoh: Bukti transfer rek Mandiri No Trx 88921">
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-ht">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-ht">
          ${ICONS.check}
          <span>Simpan Pembayaran</span>
        </button>
      </div>
    </form>
  `;

  const inputNominal = $('#ht-nominal', modalBody);
  inputNominal?.addEventListener('input', () => {
    const angka = parseRupiah(inputNominal.value);
    inputNominal.value = formatRupiah(angka, false);
  });

  $('#btn-ht-lunas', modalBody)?.addEventListener('click', () => {
    inputNominal.value = formatRupiah(hutang.sisa, false);
  });

  $('#btn-ht-50', modalBody)?.addEventListener('click', () => {
    const separuh = Math.floor(hutang.sisa / 2);
    inputNominal.value = formatRupiah(separuh, false);
  });

  const modalInstance = showModal({
    title: 'Bayar Hutang ke Supplier',
    body: modalBody,
    width: '460px'
  });

  $('#btn-batal-ht', modalBody)?.addEventListener('click', () => modalInstance.close());

  $('#form-bayar-ht', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jumlah = parseRupiah(inputNominal.value);
    const metode = $('#ht-metode', modalBody)?.value;
    const catatan = $('#ht-catatan', modalBody)?.value.trim();

    if (jumlah <= 0) {
      showToast('Nominal pembayaran harus lebih besar dari Rp 0', 'error');
      return;
    }
    if (jumlah > hutang.sisa) {
      showToast(`Nominal pembayaran (${formatRupiah(jumlah)}) melebihi sisa hutang (${formatRupiah(hutang.sisa)})`, 'error');
      return;
    }

    const btnSimpan = $('#btn-simpan-ht', modalBody);
    if (btnSimpan) {
      btnSimpan.disabled = true;
      btnSimpan.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';
    }

    try {
      const res = await apiCall('hutang.bayar', {
        id: hutang.id,
        jumlah,
        metode,
        catatan
      });

      modalInstance.close();
      showToast(res.pesan || 'Pembayaran hutang supplier berhasil dicatat', 'success');
      await muatDataHutang(container);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pembayaran hutang', 'error');
      if (btnSimpan) {
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = `${ICONS.check} <span>Simpan Pembayaran</span>`;
      }
    }
  });
}

/* ========================================================================== */
/* MODAL DETAIL & RIWAYAT PEMBAYARAN                                          */
/* ========================================================================== */

async function bukaModalDetailPiutang(piutangId) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';
  modalBody.innerHTML = renderSkeleton(3);

  const modalInstance = showModal({
    title: 'Rincian Piutang & Riwayat Cicilan',
    body: modalBody,
    width: '560px'
  });

  try {
    const res = await apiCall('piutang.detail', { id: piutangId });
    const pt = res.piutang || {};
    const pel = res.pelanggan || {};
    const riwayat = res.riwayat_pembayaran || [];

    modalBody.innerHTML = `
      <div class="card card-body" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="row" style="justify-content: space-between;">
          <div>
            <span class="text-xs text-muted">No Nota Penjualan</span>
            <div class="fw-bold">${escapeHtml(pt.no_nota || '-')}</div>
            <div class="text-xs">${escapeHtml(pel.nama || 'Pelanggan Umum')} (${escapeHtml(pel.hp || '-')})</div>
          </div>
          <div style="text-align: right;">
            <span class="text-xs text-muted">Sisa Tagihan</span>
            <div class="fw-bold ${pt.sisa > 0 ? 'text-danger' : 'text-success'}" style="font-size: var(--fs-lg);">
              ${formatRupiah(pt.sisa)}
            </div>
            <span class="badge ${pt.status === 'lunas' ? 'badge-success' : 'badge-warning'}">${pt.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div class="stack" style="gap: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">RIWAYAT PEMBAYARAN CICILAN</span>
        ${riwayat.length === 0 ? `
          <div class="text-muted text-xs" style="padding: var(--sp-3); text-align: center;">Belum ada cicilan tercatat.</div>
        ` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Metode</th>
                  <th>Petugas</th>
                  <th class="num">Nominal</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                ${riwayat.map((rw) => `
                  <tr>
                    <td class="text-xs">${formatTanggal(rw.created_at, true)}</td>
                    <td><span class="badge badge-info">${escapeHtml(rw.metode)}</span></td>
                    <td class="text-xs">${escapeHtml(rw.nama_petugas || '-')}</td>
                    <td class="num fw-bold text-success">${formatRupiah(rw.jumlah)}</td>
                    <td class="text-xs text-muted">${escapeHtml(rw.catatan || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-tutup-detail-pt">Tutup</button>
      </div>
    `;

    $('#btn-tutup-detail-pt', modalBody)?.addEventListener('click', () => modalInstance.close());
  } catch (err) {
    modalBody.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat rincian')}</div>
    `;
  }
}

async function bukaModalDetailHutang(hutangId) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';
  modalBody.innerHTML = renderSkeleton(3);

  const modalInstance = showModal({
    title: 'Rincian Hutang & Riwayat Pembayaran Supplier',
    body: modalBody,
    width: '560px'
  });

  try {
    const res = await apiCall('hutang.detail', { id: hutangId });
    const ht = res.hutang || {};
    const sup = res.supplier || {};
    const riwayat = res.riwayat_pembayaran || [];

    modalBody.innerHTML = `
      <div class="card card-body" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="row" style="justify-content: space-between;">
          <div>
            <span class="text-xs text-muted">No Faktur Pembelian</span>
            <div class="fw-bold">${escapeHtml(ht.no_faktur || '-')}</div>
            <div class="text-xs">${escapeHtml(sup.nama || 'Supplier Umum')} (PIC: ${escapeHtml(sup.kontak || '-')})</div>
          </div>
          <div style="text-align: right;">
            <span class="text-xs text-muted">Sisa Hutang Toko</span>
            <div class="fw-bold ${ht.sisa > 0 ? 'text-danger' : 'text-success'}" style="font-size: var(--fs-lg);">
              ${formatRupiah(ht.sisa)}
            </div>
            <span class="badge ${ht.status === 'lunas' ? 'badge-success' : 'badge-warning'}">${ht.status.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div class="stack" style="gap: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">RIWAYAT PEMBAYARAN KE SUPPLIER</span>
        ${riwayat.length === 0 ? `
          <div class="text-muted text-xs" style="padding: var(--sp-3); text-align: center;">Belum ada pembayaran tercatat.</div>
        ` : `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Metode</th>
                  <th>Petugas</th>
                  <th class="num">Nominal</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                ${riwayat.map((rw) => `
                  <tr>
                    <td class="text-xs">${formatTanggal(rw.created_at, true)}</td>
                    <td><span class="badge badge-info">${escapeHtml(rw.metode)}</span></td>
                    <td class="text-xs">${escapeHtml(rw.nama_petugas || '-')}</td>
                    <td class="num fw-bold text-success">${formatRupiah(rw.jumlah)}</td>
                    <td class="text-xs text-muted">${escapeHtml(rw.catatan || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-tutup-detail-ht">Tutup</button>
      </div>
    `;

    $('#btn-tutup-detail-ht', modalBody)?.addEventListener('click', () => modalInstance.close());
  } catch (err) {
    modalBody.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat rincian')}</div>
    `;
  }
}

/* ========================================================================== */
/* PENGINGAT WHATSAPP TAGIHAN PIUTANG                                         */
/* ========================================================================== */

function kirimPesanWhatsAppTagihan(piutang) {
  if (!piutang.hp_pelanggan) {
    showToast('Pelanggan ini tidak memiliki nomor HP', 'warning');
    return;
  }

  // Normalisasi no hp: 0812... -> 62812...
  let hp = String(piutang.hp_pelanggan).replace(/[^0-9]/g, '');
  if (hp.startsWith('0')) {
    hp = '62' + hp.substring(1);
  } else if (!hp.startsWith('62')) {
    hp = '62' + hp;
  }

  const tglJatuhTempo = piutang.jatuh_tempo ? formatTanggal(piutang.jatuh_tempo) : 'segera';
  const pesan = `Halo Bpk/Ibu *${piutang.nama_pelanggan || 'Pelanggan'}*,\n\nKami dari Toko Bangunan ingin menginformasikan tagihan transaksi belanja tempo dengan rincian berikut:\n- No Nota: *${piutang.no_nota || '-'}*\n- Total Belanja: *${formatRupiah(piutang.total)}*\n- Sisa Tagihan: *${formatRupiah(piutang.sisa)}*\n- Jatuh Tempo: *${tglJatuhTempo}*\n\nPembayaran dapat dilakukan melalui kasir toko kami atau transfer bank. Mohon konfirmasi apabila pembayaran telah dilakukan.\n\nTerima kasih banyak atas kerja sama dan kepercayaan Anda! 🙏`;

  const url = `https://wa.me/${hp}?text=${encodeURIComponent(pesan)}`;
  window.open(url, '_blank');
}

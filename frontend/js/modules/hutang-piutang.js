/**
 * hutang-piutang.js — Modul Keuangan: Hutang Supplier & Piutang Pelanggan
 * Sesuai Fase 4 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #7 & #16
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, parseRupiah, formatTanggal } from '../utils/format.js';
import { bukaModalPilihanCetakPenjualan, bukaModalPilihanCetakPembelian } from '../utils/printer.js';
import { bukaTautanEksternal } from '../utils/native.js';

let tabAktifHp = 'piutang';

export async function renderHutangPiutangModule(container) {
  const user = store.get('user');
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');
  const isHutangTab = tabAktifHp === 'hutang';

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Keuangan: Hutang & Piutang</h2>
          <p>Pengelolaan tagihan tempo pelanggan, cicilan pelunasan, pengingat WhatsApp, dan hutang supplier</p>
        </div>
        <div class="segmented" id="tabs-hp" role="tablist">
          <button type="button" id="tab-btn-piutang" class="btn btn-sm" aria-pressed="${!isHutangTab}">
            ${ICONS.wallet}
            <span>Piutang <span class="d-none-mobile">Pelanggan</span></span>
          </button>
          <button type="button" id="tab-btn-hutang" class="btn btn-sm" aria-pressed="${isHutangTab}">
            ${ICONS.truck}
            <span>Hutang <span class="d-none-mobile">Supplier</span></span>
          </button>
        </div>
      </div>

      <!-- Konten Tab 1: Piutang Pelanggan -->
      <div id="panel-piutang" class="stack" style="${isHutangTab ? 'display: none;' : ''}">
        <!-- Stat Cards Piutang (Responsif Proporsional) -->
        <div class="stat-grid-3" id="stat-cards-piutang">
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Total Sisa Piutang</span>
              <div class="stat-card-icon icon-rose">${ICONS.wallet}</div>
            </div>
            <div class="stat-card-value text-primary" id="stat-piutang-total">Rp 0</div>
            <div class="stat-card-desc" id="stat-piutang-ket">Dari semua nota tempo aktif</div>
          </div>
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Jatuh Tempo Lewat</span>
              <div class="stat-card-icon icon-rose">${ICONS.alertTriangle}</div>
            </div>
            <div class="stat-card-value text-danger" id="stat-piutang-overdue">0 Nota</div>
            <div class="stat-card-desc">Perlu segera ditagih</div>
          </div>
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Transaksi Piutang</span>
              <div class="stat-card-icon icon-blue">${ICONS.clipboard}</div>
            </div>
            <div class="stat-card-value" id="stat-piutang-count">0 Transaksi</div>
            <div class="stat-card-desc" id="stat-piutang-pelanggan">Tagihan pelanggan berjalan</div>
          </div>
        </div>

        <div class="card card-body stack">
          <!-- Filter Bar Piutang -->
          <div class="simple-filter-bar">
            <div class="field filter-select-field">
              <label class="field-label" for="filter-pt-status">Status Piutang</label>
              <select class="input" id="filter-pt-status">
                <option value="">Semua Status</option>
                <option value="belum">Belum Lunas</option>
                <option value="sebagian">Sebagian</option>
                <option value="lunas">Lunas</option>
              </select>
            </div>

            <div class="field filter-search-field">
              <label class="field-label" for="search-pt">Cari Piutang</label>
              <div class="input-group">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" class="input" id="search-pt" placeholder="Cari no nota INV, nama pelanggan, atau HP...">
              </div>
            </div>

            <div class="field filter-extra-field" style="display: flex; gap: var(--sp-3); flex-wrap: wrap; align-items: center;">
              <label style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); cursor: pointer;">
                <input type="checkbox" id="check-pt-overdue" style="width: 16px; height: 16px; accent-color: var(--danger);">
                <span class="fw-semibold text-danger">Hanya Lewat Tempo</span>
              </label>
              <label style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); cursor: pointer;">
                <input type="checkbox" id="check-pt-segera" style="width: 16px; height: 16px; accent-color: var(--warning);">
                <span class="fw-semibold text-warning">Perlu Ditagih (Lewat &amp; H-3)</span>
              </label>
            </div>
          </div>

          <div id="banner-pengingat-piutang"></div>

          <div id="area-tabel-piutang" style="margin-top: var(--sp-2);">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>

      <!-- Konten Tab 2: Hutang Supplier -->
      <div id="panel-hutang" class="stack" style="${isHutangTab ? 'display: flex;' : 'display: none;'}">
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
          <!-- Stat Cards Hutang (Responsif Proporsional) -->
          <div class="stat-grid-3" id="stat-cards-hutang">
            <div class="stat-card-pro">
              <div class="stat-card-header">
                <span class="stat-card-title">Total Sisa Hutang</span>
                <div class="stat-card-icon icon-rose">${ICONS.wallet}</div>
              </div>
              <div class="stat-card-value text-danger" id="stat-hutang-total">Rp 0</div>
              <div class="stat-card-desc">Kewajiban pengadaan berjalan</div>
            </div>
            <div class="stat-card-pro">
              <div class="stat-card-header">
                <span class="stat-card-title">Jatuh Tempo Lewat</span>
                <div class="stat-card-icon icon-amber">${ICONS.alertTriangle}</div>
              </div>
              <div class="stat-card-value text-warning" id="stat-hutang-overdue">0 Faktur</div>
              <div class="stat-card-desc">Perlu segera diselesaikan</div>
            </div>
            <div class="stat-card-pro">
              <div class="stat-card-header">
                <span class="stat-card-title">Faktur Hutang Aktif</span>
                <div class="stat-card-icon icon-blue">${ICONS.truck}</div>
              </div>
              <div class="stat-card-value" id="stat-hutang-count">0 Faktur</div>
              <div class="stat-card-desc" id="stat-hutang-supplier">Tagihan supplier berjalan</div>
            </div>
          </div>

          <div class="card card-body stack">
            <!-- Filter Bar Hutang -->
            <div class="simple-filter-bar">
              <div class="field filter-select-field">
                <label class="field-label" for="filter-ht-status">Status Hutang</label>
                <select class="input" id="filter-ht-status">
                  <option value="">Semua Status</option>
                  <option value="belum">Belum Lunas</option>
                  <option value="sebagian">Sebagian</option>
                  <option value="lunas">Lunas</option>
                </select>
              </div>

              <div class="field filter-search-field">
                <label class="field-label" for="search-ht">Cari Hutang</label>
                <div class="input-group">
                  <span class="input-icon">${ICONS.search}</span>
                  <input type="search" class="input" id="search-ht" placeholder="Cari no faktur PB, faktur supplier, atau nama supplier...">
                </div>
              </div>

              <div class="field filter-extra-field">
                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); cursor: pointer;">
                  <input type="checkbox" id="check-ht-overdue" style="width: 16px; height: 16px; accent-color: var(--danger);">
                  <span class="fw-semibold text-danger">Hanya Jatuh Tempo Lewat</span>
                </label>
              </div>
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
    tabAktifHp = 'piutang';
    btnTabPiutang.setAttribute('aria-pressed', 'true');
    btnTabHutang.setAttribute('aria-pressed', 'false');
    panelPiutang.style.display = 'flex';
    panelHutang.style.display = 'none';
    muatDataPiutang(container);
  });

  btnTabHutang?.addEventListener('click', () => {
    tabAktifHp = 'hutang';
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
  const chkSegeraPt = $('#check-pt-segera', container);

  const triggerMuatPt = () => muatDataPiutang(container);

  inputSearchPt?.addEventListener('input', () => {
    clearTimeout(timeoutCariPt);
    timeoutCariPt = setTimeout(triggerMuatPt, 300);
  });
  selStatusPt?.addEventListener('change', triggerMuatPt);
  chkOverduePt?.addEventListener('change', () => {
    if (chkOverduePt.checked && chkSegeraPt) chkSegeraPt.checked = false;
    triggerMuatPt();
  });
  chkSegeraPt?.addEventListener('change', () => {
    if (chkSegeraPt.checked && chkOverduePt) chkOverduePt.checked = false;
    triggerMuatPt();
  });

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
  }

  // Muat data awal sesuai tab aktif
  if (isHutangTab && isOwnerOrAdmin) {
    await muatDataHutang(container);
  } else {
    await muatDataPiutang(container);
  }
}

/* ========================================================================== */
/* LOGIKA DATA PIUTANG PELANGGAN                                              */
/* ========================================================================== */

function hitungSelisihHariTempo(jatuhTempoStr) {
  if (!jatuhTempoStr) return null;
  const tglStr = String(jatuhTempoStr).trim().substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tglStr)) return null;
  const now = new Date();
  const hariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = tglStr.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  return Math.round((target - hariIni) / 86400000);
}

async function muatDataPiutang(container) {
  const area = $('#area-tabel-piutang', container);
  const banner = $('#banner-pengingat-piutang', container);
  if (!area) return;

  const cari = $('#search-pt', container)?.value.trim() || '';
  const status = $('#filter-pt-status', container)?.value || '';
  const jatuh_tempo_lewat = $('#check-pt-overdue', container)?.checked || false;
  const hanyaSegeraAtauLewat = $('#check-pt-segera', container)?.checked || false;

  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('piutang.list', {
      cari,
      q: cari,
      status,
      jatuh_tempo_lewat,
      lewat_jatuh_tempo: jatuh_tempo_lewat,
      limit: 100
    });

    const semuaItems = (res.items || []).map((it) => {
      const sisa = Number(it.sisa != null ? it.sisa : (it.sisa_piutang != null ? it.sisa_piutang : (Number(it.total || 0) - Number(it.terbayar || 0))));
      const selisihHari = it.status !== 'lunas' && sisa > 0 ? hitungSelisihHariTempo(it.jatuh_tempo) : null;
      const isOverdue = Boolean(it.jatuh_tempo_lewat || it.lewat_jatuh_tempo || (selisihHari !== null && selisihHari < 0));
      const isSegera = !isOverdue && selisihHari !== null && selisihHari >= 0 && selisihHari <= 3;
      return {
        ...it,
        sisa,
        selisih_hari: selisihHari,
        segera_tempo: isSegera,
        nama_pelanggan: it.nama_pelanggan || it.pelanggan_nama || 'Pelanggan Umum',
        hp_pelanggan: it.hp_pelanggan || it.pelanggan_hp || '',
        tanggal_nota: it.tanggal_nota || it.tanggal_penjualan || it.created_at,
        jatuh_tempo_lewat: isOverdue
      };
    });

    const items = hanyaSegeraAtauLewat
      ? semuaItems.filter((it) => it.status !== 'lunas' && it.sisa > 0 && (it.jatuh_tempo_lewat || it.segera_tempo))
      : semuaItems;

    const sumSisaPiutang = semuaItems.reduce((acc, it) => acc + (it.status !== 'lunas' ? (Number(it.sisa) || 0) : 0), 0);
    const totalSisa = (Number(res.total_sisa_piutang) || Number(res.total_piutang_berjalan) || sumSisaPiutang);
    const daftarOverdue = semuaItems.filter((it) => it.jatuh_tempo_lewat && it.status !== 'lunas' && it.sisa > 0);
    const daftarSegera = semuaItems.filter((it) => it.segera_tempo && it.status !== 'lunas' && it.sisa > 0);
    const overdueCount = daftarOverdue.length;

    // Render Banner Peringatan Proaktif (Lewat Tempo & H-3 Segera Jatuh Tempo)
    if (banner) {
      if (daftarOverdue.length > 0 || daftarSegera.length > 0) {
        const nominalPrioritas = [...daftarOverdue, ...daftarSegera].reduce((s, x) => s + Number(x.sisa || 0), 0);
        banner.innerHTML = `
          <div class="alert ${daftarOverdue.length > 0 ? 'alert-danger' : 'alert-warning'}" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--sp-2); margin: 0;">
            <div class="row" style="gap: 8px; align-items: center;">
              ${ICONS.alertTriangle}
              <div class="text-xs">
                <strong>Pengingat Jatuh Tempo Piutang:</strong>
                ${daftarOverdue.length > 0 ? `<strong>${daftarOverdue.length} nota lewat tempo</strong>` : ''}${daftarOverdue.length > 0 && daftarSegera.length > 0 ? ' &amp; ' : ''}${daftarSegera.length > 0 ? `<strong>${daftarSegera.length} nota H-3 jatuh tempo</strong>` : ''}
                (Total: <strong class="mono">${formatRupiah(nominalPrioritas)}</strong>).
              </div>
            </div>
            ${!hanyaSegeraAtauLewat ? `
              <button type="button" class="btn btn-sm btn-secondary" id="btn-banner-filter-segera" style="flex-shrink: 0;">
                Tampilkan Prioritas Tagih
              </button>
            ` : ''}
          </div>
        `;
        banner.querySelector('#btn-banner-filter-segera')?.addEventListener('click', () => {
          const chkSegera = $('#check-pt-segera', container);
          const chkOverdue = $('#check-pt-overdue', container);
          if (chkOverdue) chkOverdue.checked = false;
          if (chkSegera) {
            chkSegera.checked = true;
            muatDataPiutang(container);
          }
        });
      } else {
        banner.innerHTML = '';
      }
    }

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
      area.innerHTML = renderEmpty('Tidak ada data piutang ditemukan', 'Semua tagihan lunas atau belum ada penjualan tempo sesuai filter');
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table table-card-2col">
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
      const isReturPenuh = it.status_retur === 'penuh';
      const isReturSebagian = !isReturPenuh && it.status_retur === 'sebagian';
      const noReturStr = Array.isArray(it.daftar_no_retur) && it.daftar_no_retur.length ? it.daftar_no_retur.join(', ') : '';

      let badgeStatus = '<span class="badge badge-warning">Belum Lunas</span>';
      if (isReturPenuh) {
        badgeStatus = '<span class="badge badge-danger">Diretur Penuh</span>';
      } else {
        if (it.status === 'sebagian') badgeStatus = '<span class="badge badge-info">Sebagian</span>';
        if (it.status === 'lunas') badgeStatus = '<span class="badge badge-success">Lunas</span>';
        if (isReturSebagian) badgeStatus += ' <span class="badge badge-warning badge-xs">Diretur Sebagian</span>';
      }

      const isOverdue = !isReturPenuh && it.jatuh_tempo_lewat && it.status !== 'lunas';
      const isSegera = !isReturPenuh && it.segera_tempo && it.status !== 'lunas';
      const tglJatuhTempo = it.jatuh_tempo ? formatTanggal(it.jatuh_tempo) : '-';

      let badgeTempoHtml = '';
      if (isOverdue) {
        const hariLewat = it.selisih_hari !== null && it.selisih_hari < 0 ? Math.abs(it.selisih_hari) : 0;
        badgeTempoHtml = `<span class="badge badge-danger text-xs">${hariLewat > 0 ? `Lewat ${hariLewat} Hari` : 'Lewat Tempo'}</span>`;
      } else if (isSegera) {
        badgeTempoHtml = it.selisih_hari === 0
          ? '<span class="badge badge-danger text-xs">Tempo Hari Ini</span>'
          : `<span class="badge badge-warning text-xs">H-${it.selisih_hari} (Segera)</span>`;
      }

      return `
                <tr data-id="${escapeHtml(it.id)}" style="${isReturPenuh ? 'opacity: 0.7; background: var(--bg-surface-variant);' : ''}">
                  <td data-label="No Nota & Tgl">
                    <div class="fw-semibold" style="${isReturPenuh ? 'text-decoration: line-through;' : ''}">${escapeHtml(it.no_nota || '-')}</div>
                    ${noReturStr ? `<div class="text-2xs font-mono text-danger">Retur: ${escapeHtml(noReturStr)}</div>` : ''}
                    <div class="text-xs text-muted">${formatTanggal(it.tanggal_nota, true)}</div>
                  </td>
                  <td data-label="Pelanggan">
                    <div class="cell-stack">
                      <div class="fw-semibold">${escapeHtml(it.nama_pelanggan || 'Pelanggan Umum')}</div>
                      <div class="text-xs text-muted">${escapeHtml(it.hp_pelanggan || '-')}</div>
                    </div>
                  </td>
                  <td class="num fw-semibold" data-label="Total Tagihan">
                    <span style="${isReturPenuh ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${formatRupiah(it.total)}</span>
                    ${Number(it.total_retur || 0) > 0 ? `<div class="text-2xs text-danger">Retur -${formatRupiah(it.total_retur)}</div>` : ''}
                  </td>
                  <td class="num" data-label="Sisa Piutang">
                    <span class="fw-bold ${it.sisa > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(it.sisa)}</span>
                  </td>
                  <td data-label="Status">${badgeStatus}</td>
                  <td data-label="Jatuh Tempo">
                    <div class="cell-stack">
                      <div class="${isOverdue ? 'text-danger fw-bold' : (isSegera ? 'text-warning fw-bold' : '')}">
                        ${tglJatuhTempo}
                      </div>
                      ${badgeTempoHtml}
                    </div>
                  </td>
                  <td style="text-align: right;" data-label="Aksi">
                    <div class="table-actions">
                      ${it.sisa > 0 ? `
                        <button type="button" class="btn btn-sm btn-primary btn-bayar-pt" data-id="${escapeHtml(it.id)}" title="Bayar Cicilan / Pelunasan">
                          Bayar
                        </button>
                      ` : ''}
                      ${it.sisa > 0 && it.hp_pelanggan ? `
                        <button type="button" class="btn btn-sm ${(isOverdue || isSegera) ? 'btn-warning' : 'btn-secondary'} btn-wa-pt" data-id="${escapeHtml(it.id)}" title="Kirim Pengingat Tagihan via WhatsApp" style="display: inline-flex; align-items: center; gap: 4px;">
                          ${ICONS.messageCircle}
                          <span>Tagih WA</span>
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-sm btn-secondary btn-detail-pt" data-id="${escapeHtml(it.id)}" title="Lihat Rincian & Riwayat Cicilan">
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
        if (piutang) {
          const semuaAktifPelanggan = semuaItems.filter((x) =>
            x.pelanggan_id && x.pelanggan_id === piutang.pelanggan_id && x.status !== 'lunas' && x.sisa > 0
          );
          kirimPesanWhatsAppTagihan(piutang, semuaAktifPelanggan);
        }
      });
    });

    area.querySelectorAll('.btn-detail-pt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        bukaModalDetailPiutang(id);
      });
    });

  } catch (err) {
    if (area) {
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
      q: cari,
      status,
      jatuh_tempo_lewat,
      lewat_jatuh_tempo: jatuh_tempo_lewat,
      limit: 100
    });

    const items = (res.items || []).map((it) => ({
      ...it,
      sisa: Number(it.sisa != null ? it.sisa : (it.sisa_hutang != null ? it.sisa_hutang : (Number(it.total || 0) - Number(it.terbayar || 0)))),
      nama_supplier: it.nama_supplier || it.supplier_nama || 'Supplier Umum',
      hp_supplier: it.hp_supplier || it.supplier_hp || '',
      tanggal_faktur: it.tanggal_faktur || it.tanggal_pembelian || it.created_at,
      jatuh_tempo_lewat: Boolean(it.jatuh_tempo_lewat || it.lewat_jatuh_tempo)
    }));

    const sumSisaHutang = items.reduce((acc, it) => acc + (it.status !== 'lunas' ? (Number(it.sisa) || 0) : 0), 0);
    const totalSisa = (Number(res.total_sisa_hutang) || Number(res.total_hutang_berjalan) || sumSisaHutang);
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
        <table class="table table-card-2col">
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
                  <td data-label="No Faktur & Tgl">
                    <div class="fw-semibold">${escapeHtml(it.no_faktur || '-')}</div>
                    <div class="text-xs text-muted">${formatTanggal(it.tanggal_faktur, true)}</div>
                  </td>
                  <td data-label="Supplier">
                    <div class="cell-stack">
                      <div class="fw-semibold">${escapeHtml(it.nama_supplier || 'Supplier Umum')}</div>
                      <div class="text-xs text-muted">${escapeHtml(it.hp_supplier || '-')}</div>
                    </div>
                  </td>
                  <td data-label="No Faktur Vendor">
                    <span class="text-xs font-mono">${escapeHtml(it.no_faktur_supplier || '-')}</span>
                  </td>
                  <td class="num fw-semibold" data-label="Total Faktur">${formatRupiah(it.total)}</td>
                  <td class="num" data-label="Sisa Hutang">
                    <span class="fw-bold ${it.sisa > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(it.sisa)}</span>
                  </td>
                  <td data-label="Status">${badgeStatus}</td>
                  <td data-label="Jatuh Tempo">
                    <div class="cell-stack">
                      <div class="${isOverdue ? 'text-danger fw-bold' : ''}">
                        ${tglJatuhTempo}
                      </div>
                      ${isOverdue ? '<span class="badge badge-danger text-xs">Lewat Tempo</span>' : ''}
                    </div>
                  </td>
                  <td style="text-align: right;" data-label="Aksi">
                    <div class="table-actions">
                      ${it.sisa > 0 ? `
                        <button type="button" class="btn btn-sm btn-primary btn-bayar-ht" data-id="${escapeHtml(it.id)}" title="Bayar Hutang Supplier">
                          Bayar
                        </button>
                      ` : ''}
                      <button type="button" class="btn btn-sm btn-secondary btn-detail-ht" data-id="${escapeHtml(it.id)}" title="Lihat Rincian & Riwayat Pembayaran">
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
    if (area) {
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
}

/* ========================================================================== */
/* MODAL PEMBAYARAN CICILAN / PELUNASAN PIUTANG                               */
/* ========================================================================== */

function bukaModalBayarPiutang(container, piutang) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';
  const namaPelanggan = piutang.nama_pelanggan || piutang.pelanggan_nama || 'Pelanggan Umum';

  modalBody.innerHTML = `
    <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
      <div class="pel-modal-profile-top">
        <div class="grow" style="min-width: 0;">
          <span class="text-xs text-muted">No Nota Penjualan</span>
          <div class="fw-bold font-mono" style="font-size: var(--fs-md);">${escapeHtml(piutang.no_nota || '-')}</div>
          <div class="text-xs fw-medium" style="margin-top: 2px;">${escapeHtml(namaPelanggan)}</div>
        </div>
        <span class="badge ${piutang.status === 'sebagian' ? 'badge-info' : 'badge-warning'}">
          ${piutang.status === 'sebagian' ? 'Sebagian' : 'Belum Lunas'}
        </span>
      </div>
      <div class="pel-modal-profile-stats">
        <div class="pel-modal-stat-item">
          <span class="text-2xs text-muted uppercase fw-semibold">Total Tagihan</span>
          <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(piutang.total || 0)}</div>
        </div>
        <div class="pel-modal-stat-divider"></div>
        <div class="pel-modal-stat-item" style="text-align: right;">
          <span class="text-2xs text-muted uppercase fw-semibold">Sisa Piutang Saat Ini</span>
          <div class="fw-bold text-danger tabular" style="font-size: var(--fs-lg);">${formatRupiah(piutang.sisa)}</div>
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
  const namaSupplier = hutang.nama_supplier || hutang.supplier_nama || 'Supplier Umum';

  modalBody.innerHTML = `
    <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
      <div class="pel-modal-profile-top">
        <div class="grow" style="min-width: 0;">
          <span class="text-xs text-muted">No Faktur Pembelian</span>
          <div class="fw-bold font-mono" style="font-size: var(--fs-md);">${escapeHtml(hutang.no_faktur || '-')}</div>
          <div class="text-xs fw-medium" style="margin-top: 2px;">${escapeHtml(namaSupplier)}</div>
        </div>
        <span class="badge ${hutang.status === 'sebagian' ? 'badge-info' : 'badge-warning'}">
          ${hutang.status === 'sebagian' ? 'Sebagian' : 'Belum Lunas'}
        </span>
      </div>
      <div class="pel-modal-profile-stats">
        <div class="pel-modal-stat-item">
          <span class="text-2xs text-muted uppercase fw-semibold">Total Faktur</span>
          <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(hutang.total || 0)}</div>
        </div>
        <div class="pel-modal-stat-divider"></div>
        <div class="pel-modal-stat-item" style="text-align: right;">
          <span class="text-2xs text-muted uppercase fw-semibold">Sisa Hutang Saat Ini</span>
          <div class="fw-bold text-danger tabular" style="font-size: var(--fs-lg);">${formatRupiah(hutang.sisa)}</div>
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
    const pj = res.penjualan || {};
    const pel = res.pelanggan || {};
    const riwayat = res.riwayat_pembayaran || [];
    const noNota = pt.no_nota || pj.no_nota || '-';
    const labelStatus = pt.status === 'lunas' ? 'Lunas' : (pt.status === 'sebagian' ? 'Sebagian' : 'Belum Lunas');
    const badgeClass = pt.status === 'lunas' ? 'badge-success' : (pt.status === 'sebagian' ? 'badge-info' : 'badge-warning');

    modalBody.innerHTML = `
      <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="pel-modal-profile-top">
          <div class="grow" style="min-width: 0;">
            <span class="text-xs text-muted">No Nota Penjualan</span>
            <div class="fw-bold font-mono" style="font-size: var(--fs-md); line-height: 1.3;">${escapeHtml(noNota)}</div>
            <div class="text-xs fw-medium" style="margin-top: 2px;">${escapeHtml(pel.nama || 'Pelanggan Umum')}${pel.hp ? ` (${escapeHtml(pel.hp)})` : ''}</div>
          </div>
          <span class="badge ${badgeClass}">${escapeHtml(labelStatus)}</span>
        </div>
        <div class="pel-modal-profile-stats">
          <div class="pel-modal-stat-item">
            <span class="text-2xs text-muted uppercase fw-semibold">Total Tagihan</span>
            <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(pt.total || 0)}</div>
          </div>
          <div class="pel-modal-stat-divider"></div>
          <div class="pel-modal-stat-item" style="text-align: right;">
            <span class="text-2xs text-muted uppercase fw-semibold">Sisa Tagihan</span>
            <div class="fw-bold tabular ${pt.sisa > 0 ? 'text-danger' : 'text-success'}" style="font-size: var(--fs-lg);">
              ${formatRupiah(pt.sisa)}
            </div>
          </div>
        </div>
      </div>

      <div class="stack" style="gap: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">RIWAYAT PEMBAYARAN CICILAN</span>
        ${riwayat.length === 0 ? `
          <div class="text-muted text-xs" style="padding: var(--sp-3); text-align: center;">Belum ada cicilan tercatat.</div>
        ` : `
          <div class="table-wrap">
            <table class="table" style="min-width: 0; width: 100%;">
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
                    <td class="text-xs" data-label="Tanggal">${formatTanggal(rw.tanggal || rw.created_at, true)}</td>
                    <td data-label="Metode"><span class="badge badge-info">${escapeHtml(String(rw.metode || '-').toLowerCase() === 'qris' ? 'QRIS' : String(rw.metode || '-').replace(/^\w/, (c) => c.toUpperCase()))}</span></td>
                    <td class="text-xs" data-label="Petugas">${escapeHtml(rw.nama_petugas || '-')}</td>
                    <td class="num fw-bold text-success" data-label="Nominal">${formatRupiah(rw.jumlah)}</td>
                    <td class="text-xs text-muted" data-label="Catatan">${escapeHtml(rw.catatan || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        ${pt.penjualan_id ? `
          <button type="button" class="btn btn-primary btn-sm" id="btn-cetak-nota-piutang">
            ${ICONS.printer}
            <span>Cetak Nota</span>
          </button>
        ` : ''}
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-detail-pt">Tutup</button>
      </div>
    `;

    $('#btn-cetak-nota-piutang', modalBody)?.addEventListener('click', async () => {
      try {
        const resDetail = await apiCall('penjualan.detail', { id: pt.penjualan_id });
        bukaModalPilihanCetakPenjualan(resDetail);
      } catch (e) {
        showToast('Gagal memuat detail nota: ' + e.message, 'error');
      }
    });

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
    const pb = res.pembelian || {};
    const sup = res.supplier || {};
    const riwayat = res.riwayat_pembayaran || [];
    const noFaktur = ht.no_faktur || pb.no_faktur || '-';
    const noFakturVendor = ht.no_faktur_supplier || pb.no_faktur_supplier || '';
    const labelStatus = ht.status === 'lunas' ? 'Lunas' : (ht.status === 'sebagian' ? 'Sebagian' : 'Belum Lunas');
    const badgeClass = ht.status === 'lunas' ? 'badge-success' : (ht.status === 'sebagian' ? 'badge-info' : 'badge-warning');

    modalBody.innerHTML = `
      <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="pel-modal-profile-top">
          <div class="grow" style="min-width: 0;">
            <span class="text-xs text-muted">No Faktur Pembelian</span>
            <div class="fw-bold font-mono" style="font-size: var(--fs-md); line-height: 1.3;">${escapeHtml(noFaktur)}</div>
            ${noFakturVendor ? `<div class="text-xs text-muted font-mono">Faktur Vendor: ${escapeHtml(noFakturVendor)}</div>` : ''}
            <div class="text-xs fw-medium" style="margin-top: 2px;">${escapeHtml(sup.nama || 'Supplier Umum')}${sup.kontak ? ` (PIC: ${escapeHtml(sup.kontak)})` : ''}</div>
          </div>
          <span class="badge ${badgeClass}">${escapeHtml(labelStatus)}</span>
        </div>
        <div class="pel-modal-profile-stats">
          <div class="pel-modal-stat-item">
            <span class="text-2xs text-muted uppercase fw-semibold">Total Faktur</span>
            <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(ht.total || 0)}</div>
          </div>
          <div class="pel-modal-stat-divider"></div>
          <div class="pel-modal-stat-item" style="text-align: right;">
            <span class="text-2xs text-muted uppercase fw-semibold">Sisa Hutang Toko</span>
            <div class="fw-bold tabular ${ht.sisa > 0 ? 'text-danger' : 'text-success'}" style="font-size: var(--fs-lg);">
              ${formatRupiah(ht.sisa)}
            </div>
          </div>
        </div>
      </div>

      <div class="stack" style="gap: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">RIWAYAT PEMBAYARAN KE SUPPLIER</span>
        ${riwayat.length === 0 ? `
          <div class="text-muted text-xs" style="padding: var(--sp-3); text-align: center;">Belum ada pembayaran tercatat.</div>
        ` : `
          <div class="table-wrap">
            <table class="table" style="min-width: 0; width: 100%;">
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
                    <td class="text-xs" data-label="Tanggal">${formatTanggal(rw.tanggal || rw.created_at, true)}</td>
                    <td data-label="Metode"><span class="badge badge-info">${escapeHtml(String(rw.metode || '-').toLowerCase() === 'qris' ? 'QRIS' : String(rw.metode || '-').replace(/^\w/, (c) => c.toUpperCase()))}</span></td>
                    <td class="text-xs" data-label="Petugas">${escapeHtml(rw.nama_petugas || '-')}</td>
                    <td class="num fw-bold text-success" data-label="Nominal">${formatRupiah(rw.jumlah)}</td>
                    <td class="text-xs text-muted" data-label="Catatan">${escapeHtml(rw.catatan || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        ${ht.pembelian_id ? `
          <button type="button" class="btn btn-primary btn-sm" id="btn-cetak-faktur-hutang">
            ${ICONS.printer}
            <span>Cetak Faktur</span>
          </button>
        ` : ''}
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-detail-ht">Tutup</button>
      </div>
    `;

    $('#btn-cetak-faktur-hutang', modalBody)?.addEventListener('click', async () => {
      try {
        const resDetail = await apiCall('pembelian.detail', { id: ht.pembelian_id });
        bukaModalPilihanCetakPembelian(resDetail);
      } catch (e) {
        showToast('Gagal memuat detail faktur: ' + e.message, 'error');
      }
    });

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

function kirimPesanWhatsAppTagihan(piutang, semuaPiutangPelanggan = []) {
  const hpPelanggan = piutang.hp_pelanggan || piutang.pelanggan_hp;
  const namaPelanggan = piutang.nama_pelanggan || piutang.pelanggan_nama || 'Pelanggan';

  if (!hpPelanggan) {
    showToast('Pelanggan ini tidak memiliki nomor HP', 'warning');
    return;
  }

  let hp = String(hpPelanggan).replace(/[^0-9]/g, '');
  if (hp.startsWith('0')) {
    hp = '62' + hp.substring(1);
  } else if (!hp.startsWith('62')) {
    hp = '62' + hp;
  }

  const namaToko = store.getNamaToko ? store.getNamaToko() : 'Toko Kami';
  const bukaWa = (teks) => bukaTautanEksternal(`https://wa.me/${hp}?text=${encodeURIComponent(teks)}`);

  const buatPesanSatuNota = () => {
    const tglJatuhTempo = piutang.jatuh_tempo ? formatTanggal(piutang.jatuh_tempo) : 'segera';
    const selHari = piutang.selisih_hari;
    let kalimatPembuka = `Kami dari *${namaToko}* ingin menginformasikan rincian tagihan transaksi belanja tempo Anda:`;
    if (selHari !== null && selHari < 0) {
      kalimatPembuka = `Kami dari *${namaToko}* ingin mengingatkan dengan hormat bahwa tagihan transaksi berikut telah *melewati jatuh tempo ${Math.abs(selHari)} hari* (jatuh tempo ${tglJatuhTempo}):`;
    } else if (selHari === 0) {
      kalimatPembuka = `Kami dari *${namaToko}* ingin mengingatkan dengan hormat bahwa tagihan transaksi berikut *jatuh tempo HARI INI (${tglJatuhTempo})*:`;
    } else if (selHari !== null && selHari > 0 && selHari <= 3) {
      kalimatPembuka = `Kami dari *${namaToko}* ingin mengingatkan secara ramah bahwa tagihan transaksi berikut akan jatuh tempo dalam *${selHari} hari lagi (${tglJatuhTempo})*:`;
    }
    return `Halo Bpk/Ibu *${namaPelanggan}*,\n\n${kalimatPembuka}\n- No Nota: *${piutang.no_nota || '-'}*\n- Total Belanja: ${formatRupiah(piutang.total)}\n- Sisa Tagihan: *${formatRupiah(piutang.sisa)}*\n- Jatuh Tempo: *${tglJatuhTempo}*\n\nPembayaran dapat dilakukan langsung di kasir toko kami atau melalui transfer bank. Mohon konfirmasi apabila pembayaran sudah dilakukan.\n\nTerima kasih banyak atas kerja sama dan kepercayaan Anda.`;
  };

  if (Array.isArray(semuaPiutangPelanggan) && semuaPiutangPelanggan.length > 1) {
    const totalSemua = semuaPiutangPelanggan.reduce((s, x) => s + Number(x.sisa || 0), 0);
    const modal = showModal({
      title: `Kirim Pengingat WA — ${namaPelanggan}`,
      size: 'sm',
      body: `
        <div class="stack" style="gap: var(--sp-3);">
          <div class="text-sm text-muted">
            Pelanggan ini memiliki <strong>${semuaPiutangPelanggan.length} nota belum lunas</strong> dengan total sisa tagihan <strong class="mono text-danger">${formatRupiah(totalSemua)}</strong>.
          </div>
          <div class="stack" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-primary btn-sm" id="btn-wa-rekap-semua" style="width: 100%; justify-content: center; gap: 6px;">
              ${ICONS.messageCircle}
              <span>Kirim Rekap Gabungan (${semuaPiutangPelanggan.length} Nota)</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-wa-nota-ini" style="width: 100%; justify-content: center; gap: 6px;">
              ${ICONS.clipboard}
              <span>Kirim Nota ${escapeHtml(piutang.no_nota || '')} Saja</span>
            </button>
          </div>
        </div>
      `,
      footer: `
        <div class="row" style="width: 100%; justify-content: flex-end;">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-batal-wa-pt">Batal</button>
        </div>
      `
    });

    modal.el.querySelector('#btn-wa-rekap-semua')?.addEventListener('click', () => {
      const daftarBaris = semuaPiutangPelanggan.map((x, idx) =>
        `${idx + 1}. *${x.no_nota || '-'}* — Sisa *${formatRupiah(x.sisa)}* (Tempo: ${x.jatuh_tempo ? formatTanggal(x.jatuh_tempo) : '-'})`
      ).join('\n');
      const pesanGabung = `Halo Bpk/Ibu *${namaPelanggan}*,\n\nKami dari *${namaToko}* ingin mengirimkan rekap tagihan belanja tempo yang masih berjalan:\n\n${daftarBaris}\n\n*TOTAL SISA TAGIHAN: ${formatRupiah(totalSemua)}*\n\nPembayaran dapat dilakukan di kasir toko atau transfer bank. Mohon konfirmasi apabila sudah melakukan pembayaran.\n\nTerima kasih atas kerja sama Anda.`;
      bukaWa(pesanGabung);
      modal.close();
    });
    modal.el.querySelector('#btn-wa-nota-ini')?.addEventListener('click', () => {
      bukaWa(buatPesanSatuNota());
      modal.close();
    });
    modal.el.querySelector('#btn-batal-wa-pt')?.addEventListener('click', () => modal.close());
    return;
  }

  bukaWa(buatPesanSatuNota());
}


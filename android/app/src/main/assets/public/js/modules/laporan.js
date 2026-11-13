/**
 * laporan.js — Modul Dashboard Eksekutif & Laporan Usaha (Fase 6)
 * Menampilkan ringkasan metrik penjualan, pembelian, arus kas, laba rugi,
 * valuasi aset persediaan stok, grafik tren harian ringan SVG, dan ekspor CSV/cetak.
 */

import { kirimRequest } from '../api.js';
import { store } from '../state.js';
import { $, $$, escapeHtml } from '../utils/dom.js';
import { formatRupiah, formatTanggal, formatAngka } from '../utils/format.js';
import { ICONS, showToast, showModal } from '../utils/ui.js';
import { haptic } from '../utils/native.js';

// State lokal modul laporan
let stateLaporan = {
  tabAktif: 'dashboard', // 'dashboard', 'penjualan', 'pembelian', 'aruskas', 'labarugi', 'stok'
  periode: '30_hari',
  dari: '',
  sampai: '',
  dataDashboard: null,
  dataPenjualan: null,
  dataPembelian: null,
  dataArusKas: null,
  dataLabaRugi: null,
  dataStokValuasi: null,
  filterStok: { status_stok: 'semua', kategori_id: '', q: '' },
  filterPenjualan: { status_bayar: '', metode_bayar: '' },
  filterPembelian: { status_bayar: '', supplier_id: '' }
};

/**
 * Entry point modul laporan
 */
export async function renderLaporanModule(container) {
  const user = store.get('user');
  const isOwner = user && user.role === 'owner';

  // Inisialisasi tanggal default (30 hari terakhir)
  inisialisasiTanggalDefault();

  container.innerHTML = `
    <div class="stack" id="modul-laporan-root">
      <!-- Header Modul -->
      <div class="page-header no-print">
        <div>
          <h2>Dashboard & Laporan Usaha</h2>
          <p>Ringkasan performa penjualan, pembelian, arus kas, persediaan stok, dan laba kotor toko</p>
        </div>
        <div class="cluster" style="flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" id="btn-cetak-laporan" title="Cetak atau simpan sebagai PDF">
            ${ICONS.printer}
            <span>Cetak PDF</span>
          </button>
          <button type="button" class="btn btn-secondary" id="btn-ekspor-laporan" title="Unduh data dalam format CSV/Excel">
            ${ICONS.download}
            <span>Ekspor CSV</span>
          </button>
          <button type="button" class="btn btn-primary" id="btn-segarkan-laporan" title="Muat ulang data terkini">
            ${ICONS.refresh}
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      <!-- Baris Filter Periode Cepat & Rentang Tanggal -->
      <div class="card no-print" style="margin-bottom: var(--sp-3);">
        <div class="card-body" style="padding: var(--sp-3) var(--sp-4);">
          <!-- Baris Utama: Preset & Badge Indikator -->
          <div class="cluster" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-3);">
            <div class="cluster" style="align-items: center; gap: var(--sp-2); flex-wrap: wrap;">
              <span style="font-weight: var(--fw-semibold); font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Periode:</span>
              <div class="segmented" id="seg-periode" role="group" style="overflow-x: auto; max-width: 100%;">
                <button type="button" class="btn btn-sm ${stateLaporan.periode === 'hari_ini' ? 'btn-primary' : 'btn-ghost'}" data-periode="hari_ini">Hari Ini</button>
                <button type="button" class="btn btn-sm ${stateLaporan.periode === '7_hari' ? 'btn-primary' : 'btn-ghost'}" data-periode="7_hari">7 Hari</button>
                <button type="button" class="btn btn-sm ${stateLaporan.periode === '30_hari' ? 'btn-primary' : 'btn-ghost'}" data-periode="30_hari">30 Hari</button>
                <button type="button" class="btn btn-sm ${stateLaporan.periode === 'bulan_ini' ? 'btn-primary' : 'btn-ghost'}" data-periode="bulan_ini">Bulan Ini</button>
                <button type="button" class="btn btn-sm ${stateLaporan.periode === 'tahun_ini' ? 'btn-primary' : 'btn-ghost'}" data-periode="tahun_ini">Tahun Ini</button>
                <button type="button" class="btn btn-sm ${stateLaporan.periode === 'kustom' ? 'btn-primary' : 'btn-ghost'}" data-periode="kustom">Kustom</button>
              </div>
            </div>

            <!-- Badge Tanggal Berjalan Aktif -->
            <div class="badge badge-secondary" id="badge-periode-aktif" style="padding: 6px 12px; font-size: 11.5px; font-family: var(--font-mono); font-weight: var(--fw-semibold); border-radius: var(--radius-full); background: var(--surface-2); border: 1px solid var(--border);">
              📅 ${formatTanggal(stateLaporan.dari)} s/d ${formatTanggal(stateLaporan.sampai)}
            </div>
          </div>

          <!-- Bagian Pilihan Tanggal Manual (Hanya muncul jika mode Kustom) -->
          <div id="box-kustom-tanggal" style="${stateLaporan.periode === 'kustom' ? 'display: flex;' : 'display: none;'} align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px dashed var(--border); flex-wrap: wrap;">
            <span style="font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--text-muted);">Tentukan Rentang Tanggal:</span>
            <div class="cluster" style="align-items: center; gap: var(--sp-2); flex-wrap: wrap;">
              <div class="row" style="align-items: center; gap: var(--sp-2);">
                <label for="inp-lap-dari" style="font-size: var(--fs-xs); color: var(--text-muted); flex-shrink: 0;">Dari:</label>
                <input type="date" id="inp-lap-dari" class="input input-sm" value="${stateLaporan.dari}" style="width: 140px; max-width: 100%;">
              </div>
              <div class="row" style="align-items: center; gap: var(--sp-2);">
                <label for="inp-lap-sampai" style="font-size: var(--fs-xs); color: var(--text-muted); flex-shrink: 0;">Sampai:</label>
                <input type="date" id="inp-lap-sampai" class="input input-sm" value="${stateLaporan.sampai}" style="width: 140px; max-width: 100%;">
              </div>
              <button type="button" class="btn btn-sm btn-primary" id="btn-terapkan-tanggal" style="font-weight: var(--fw-bold);">Terapkan Rentang</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Segmented Tab Navigation -->
      <div class="segmented no-print" id="tabs-laporan" role="tablist" style="margin-bottom: var(--sp-3); overflow-x: auto;">
        <button type="button" id="tab-btn-dashboard" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'dashboard'}">
          ${ICONS.chart}
          <span>Ringkasan Eksekutif</span>
        </button>
        <button type="button" id="tab-btn-penjualan" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'penjualan'}">
          ${ICONS.shoppingBag}
          <span>Penjualan</span>
        </button>
        <button type="button" id="tab-btn-pembelian" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'pembelian'}">
          ${ICONS.truck}
          <span>Pembelian</span>
        </button>
        <button type="button" id="tab-btn-aruskas" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'aruskas'}">
          ${ICONS.wallet}
          <span>Arus Kas</span>
        </button>
        ${isOwner ? `
          <button type="button" id="tab-btn-labarugi" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'labarugi'}">
            ${ICONS.award}
            <span>Laba Rugi & Margin</span>
          </button>
        ` : ''}
        <button type="button" id="tab-btn-stok" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'stok'}">
          ${ICONS.box}
          <span>Valuasi Stok</span>
        </button>
      </div>

      <!-- Wadah Konten Tab Aktif -->
      <div id="konten-tab-laporan">
        <!-- Render dinamis tab -->
      </div>
    </div>
  `;

  pasangEventHeader(container);
  muatDataTabAktif(container);
}

/** Inisialisasi tanggal YYYY-MM-DD */
function inisialisasiTanggalDefault() {
  const skrg = new Date();
  const formatTgl = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const t = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${t}`;
  };

  if (!stateLaporan.sampai) stateLaporan.sampai = formatTgl(skrg);
  if (!stateLaporan.dari) {
    const d30 = new Date(skrg.getTime() - 29 * 24 * 60 * 60 * 1000);
    stateLaporan.dari = formatTgl(d30);
  }
}

/** Pasang event listener kontrol header */
function pasangEventHeader(container) {
  // Tombol Tab
  const daftarTab = ['dashboard', 'penjualan', 'pembelian', 'aruskas', 'labarugi', 'stok'];
  daftarTab.forEach((tabId) => {
    const btn = $(`#tab-btn-${tabId}`, container);
    if (btn) {
      btn.addEventListener('click', () => {
        stateLaporan.tabAktif = tabId;
        $$('#tabs-laporan button', container).forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        muatDataTabAktif(container);
      });
    }
  });

  // Tombol Shortcut Periode
  $$('#seg-periode button', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const per = btn.getAttribute('data-periode');
      stateLaporan.periode = per;

      $$('#seg-periode button', container).forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-ghost');
      });
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-primary');
      haptic.light();

      const boxKustom = $('#box-kustom-tanggal', container);
      if (per === 'kustom') {
        if (boxKustom) boxKustom.style.display = 'flex';
        $('#inp-lap-dari', container)?.focus();
        return;
      } else {
        if (boxKustom) boxKustom.style.display = 'none';
      }

      const skrg = new Date();
      const formatTgl = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const t = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${t}`;
      };

      const hariIni = formatTgl(skrg);
      stateLaporan.sampai = hariIni;

      if (per === 'hari_ini') {
        stateLaporan.dari = hariIni;
      } else if (per === '7_hari') {
        const d7 = new Date(skrg.getTime() - 6 * 24 * 60 * 60 * 1000);
        stateLaporan.dari = formatTgl(d7);
      } else if (per === '30_hari') {
        const d30 = new Date(skrg.getTime() - 29 * 24 * 60 * 60 * 1000);
        stateLaporan.dari = formatTgl(d30);
      } else if (per === 'bulan_ini') {
        const dAwal = new Date(skrg.getFullYear(), skrg.getMonth(), 1);
        stateLaporan.dari = formatTgl(dAwal);
      } else if (per === 'tahun_ini') {
        const dThn = new Date(skrg.getFullYear(), 0, 1);
        stateLaporan.dari = formatTgl(dThn);
      }

      const inpDari = $('#inp-lap-dari', container);
      const inpSampai = $('#inp-lap-sampai', container);
      if (inpDari) inpDari.value = stateLaporan.dari;
      if (inpSampai) inpSampai.value = stateLaporan.sampai;

      const badgeAktif = $('#badge-periode-aktif', container);
      if (badgeAktif) {
        badgeAktif.textContent = `📅 ${formatTanggal(stateLaporan.dari)} s/d ${formatTanggal(stateLaporan.sampai)}`;
      }

      muatDataTabAktif(container);
    });
  });

  // Tombol Terapkan Tanggal Manual
  const btnTerapkan = $('#btn-terapkan-tanggal', container);
  if (btnTerapkan) {
    btnTerapkan.addEventListener('click', () => {
      const d = $('#inp-lap-dari', container).value;
      const s = $('#inp-lap-sampai', container).value;
      if (!d || !s) {
        showToast('Tanggal Dari dan Sampai wajib diisi.', 'warning');
        return;
      }
      if (d > s) {
        showToast('Tanggal Dari tidak boleh melebihi Tanggal Sampai.', 'warning');
        return;
      }
      stateLaporan.dari = d;
      stateLaporan.sampai = s;
      stateLaporan.periode = 'kustom';
      haptic.light();

      $$('#seg-periode button', container).forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-ghost');
      });
      const btnKustom = $('#seg-periode [data-periode="kustom"]', container);
      if (btnKustom) {
        btnKustom.classList.remove('btn-ghost');
        btnKustom.classList.add('btn-primary');
      }

      const badgeAktif = $('#badge-periode-aktif', container);
      if (badgeAktif) {
        badgeAktif.textContent = `📅 ${formatTanggal(stateLaporan.dari)} s/d ${formatTanggal(stateLaporan.sampai)}`;
      }

      muatDataTabAktif(container);
    });
  }

  // Tombol Segarkan
  const btnRefresh = $('#btn-segarkan-laporan', container);
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      showToast('Memperbarui data laporan...', 'info', 1200);
      muatDataTabAktif(container);
    });
  }

  // Tombol Cetak PDF
  const btnCetak = $('#btn-cetak-laporan', container);
  if (btnCetak) {
    btnCetak.addEventListener('click', () => {
      window.print();
    });
  }

  // Tombol Ekspor CSV
  const btnEkspor = $('#btn-ekspor-laporan', container);
  if (btnEkspor) {
    btnEkspor.addEventListener('click', () => {
      jalankanEksporCsv();
    });
  }
}

/**
 * Muat data sesuai tab aktif
 */
async function muatDataTabAktif(container) {
  const target = $('#konten-tab-laporan', container);
  if (!target) return;

  target.innerHTML = `
    <div class="card" style="padding: var(--sp-8); text-align: center;">
      <div class="spinner" style="margin: 0 auto var(--sp-3);"></div>
      <p style="color: var(--text-muted); font-size: var(--fs-sm);">Memuat data laporan...</p>
    </div>
  `;

  try {
    const payload = {
      dari: stateLaporan.dari,
      sampai: stateLaporan.sampai,
      periode: stateLaporan.periode
    };

    if (stateLaporan.tabAktif === 'dashboard') {
      const res = await kirimRequest('laporan.dashboard', payload);
      if (res && res.ok) {
        stateLaporan.dataDashboard = res.data;
        renderTabDashboard(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat dashboard');
      }
    } else if (stateLaporan.tabAktif === 'penjualan') {
      const p = { ...payload, ...stateLaporan.filterPenjualan, limit: 150 };
      const res = await kirimRequest('laporan.penjualan', p);
      if (res && res.ok) {
        stateLaporan.dataPenjualan = res.data;
        renderTabPenjualan(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat laporan penjualan');
      }
    } else if (stateLaporan.tabAktif === 'pembelian') {
      const p = { ...payload, ...stateLaporan.filterPembelian, limit: 150 };
      const res = await kirimRequest('laporan.pembelian', p);
      if (res && res.ok) {
        stateLaporan.dataPembelian = res.data;
        renderTabPembelian(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat laporan pembelian');
      }
    } else if (stateLaporan.tabAktif === 'aruskas') {
      const res = await kirimRequest('laporan.arusKas', payload);
      if (res && res.ok) {
        stateLaporan.dataArusKas = res.data;
        renderTabArusKas(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat arus kas');
      }
    } else if (stateLaporan.tabAktif === 'labarugi') {
      const res = await kirimRequest('laporan.labaRugi', payload);
      if (res && res.ok) {
        stateLaporan.dataLabaRugi = res.data;
        renderTabLabaRugi(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat laba rugi');
      }
    } else if (stateLaporan.tabAktif === 'stok') {
      const p = { ...stateLaporan.filterStok, limit: 200 };
      const res = await kirimRequest('laporan.stokValuasi', p);
      if (res && res.ok) {
        stateLaporan.dataStokValuasi = res.data;
        renderTabStokValuasi(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat valuasi stok');
      }
    }
  } catch (err) {
    target.innerHTML = renderErrorState(err.message || 'Terjadi kesalahan sistem saat memuat laporan.');
  }
}

function renderErrorState(pesan) {
  return `
    <div class="card" style="padding: var(--sp-6); text-align: center; border-color: var(--danger);">
      <div style="font-size: var(--fs-xl); color: var(--danger); margin-bottom: var(--sp-2);">⚠️ Gagal Memuat Data</div>
      <p style="color: var(--text-muted); font-size: var(--fs-sm);">${escapeHtml(pesan)}</p>
    </div>
  `;
}

/* ========================================================================== */
/* 1. RENDER TAB: DASHBOARD EKSEKUTIF                                         */
/* ========================================================================== */
function renderTabDashboard(container, data) {
  const user = store.get('user');
  const isOwner = user && user.role === 'owner';
  const r = data.ringkasan || {};

  // Grafik Tren Harian Ringan Pure SVG
  const tren = data.tren || [];
  const svgChartHtml = buatSvgTrenChart(tren, isOwner);

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Kartu Ringkasan Metrik Utama -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="card stat">
          <div class="stat-label">Omset Penjualan Bersih</div>
          <div class="stat-value" style="color: var(--primary);">${formatRupiah(r.total_penjualan || 0)}</div>
          <div class="stat-delta">
            <span class="badge badge-info">${formatAngka(r.total_transaksi || 0)} Transaksi</span>
            <span style="color: var(--text-muted); font-size: var(--fs-xs); margin-left: 4px;">(${formatAngka(r.total_item_terjual || 0)} item)</span>
          </div>
        </div>

        <div class="card stat">
          <div class="stat-label">Total Pembelian Stok</div>
          <div class="stat-value" style="color: var(--warning);">${formatRupiah(r.total_pembelian || 0)}</div>
          <div class="stat-delta">
            <span class="badge badge-warning">${formatAngka(r.total_faktur_beli || 0)} Faktur Beli</span>
          </div>
        </div>

        <div class="card stat">
          <div class="stat-label">Piutang Pelanggan Aktif</div>
          <div class="stat-value" style="color: ${r.total_piutang_aktif > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
            ${formatRupiah(r.total_piutang_aktif || 0)}
          </div>
          <div class="stat-delta">
            <span class="badge ${r.count_piutang_aktif > 0 ? 'badge-danger' : 'badge-success'}">${formatAngka(r.count_piutang_aktif || 0)} Nota Tempo</span>
          </div>
        </div>

        <div class="card stat">
          <div class="stat-label">Hutang Supplier Aktif</div>
          <div class="stat-value" style="color: ${r.total_hutang_aktif > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
            ${formatRupiah(r.total_hutang_aktif || 0)}
          </div>
          <div class="stat-delta">
            <span class="badge ${r.count_hutang_aktif > 0 ? 'badge-danger' : 'badge-success'}">${formatAngka(r.count_hutang_aktif || 0)} Tagihan Supplier</span>
          </div>
        </div>

        ${isOwner ? `
          <div class="card stat">
            <div class="stat-label">Nilai Aset Persediaan</div>
            <div class="stat-value" style="color: var(--success);">${formatRupiah(r.total_nilai_aset_stok || 0)}</div>
            <div class="stat-delta">
              <span class="badge badge-success">Modal Berjalan (HPP)</span>
            </div>
          </div>

          <div class="card stat">
            <div class="stat-label">Laba Kotor Berjalan</div>
            <div class="stat-value" style="color: var(--success);">${formatRupiah(r.laba_kotor || 0)}</div>
            <div class="stat-delta">
              <span class="badge badge-success">Margin ${r.margin_persen || 0}%</span>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Grafik Tren Harian -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center;">
          <h3 class="card-title">${ICONS.chart} Tren Harian Penjualan & Pembelian</h3>
          <div class="cluster" style="font-size: var(--fs-xs); gap: var(--sp-3);">
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 10px; background: var(--primary); display: inline-block; border-radius: 2px;"></span> Penjualan
            </span>
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="width: 10px; height: 10px; background: var(--warning); display: inline-block; border-radius: 2px;"></span> Pembelian
            </span>
          </div>
        </div>
        <div class="card-body" style="padding: var(--sp-4); overflow-x: auto;">
          ${svgChartHtml}
        </div>
      </div>

      <!-- Grid 2 Kolom: Produk Terlaris & Pelanggan Terbaik -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">
        <!-- Produk Terlaris -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${ICONS.award} Produk Paling Laris (Top 10)</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 40px;">No</th>
                    <th>Nama Material</th>
                    <th style="text-align: right;">Qty Terjual</th>
                    <th style="text-align: right;">Kontribusi Omset</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.produk_terlaris || []).length === 0 ? `
                    <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada penjualan di periode ini</td></tr>
                  ` : (data.produk_terlaris || []).map((p, idx) => `
                    <tr>
                      <td style="font-weight: var(--fw-bold); color: var(--text-muted);">${idx + 1}</td>
                      <td>
                        <div style="font-weight: var(--fw-medium);">${escapeHtml(p.nama)}</div>
                      </td>
                      <td style="text-align: right; font-weight: var(--fw-semibold);">
                        ${formatAngka(p.qty_terjual)} <span style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(p.satuan || '')}</span>
                      </td>
                      <td style="text-align: right; font-weight: var(--fw-bold); color: var(--primary);">
                        ${formatRupiah(p.total_omset)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Pelanggan Terbaik -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${ICONS.users} Pelanggan Belanja Terbesar (Top 10)</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 40px;">No</th>
                    <th>Nama Pelanggan</th>
                    <th>Tipe / Level</th>
                    <th style="text-align: right;">Transaksi</th>
                    <th style="text-align: right;">Total Belanja</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.pelanggan_terbaik || []).length === 0 ? `
                    <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada transaksi member di periode ini</td></tr>
                  ` : (data.pelanggan_terbaik || []).map((m, idx) => `
                    <tr>
                      <td style="font-weight: var(--fw-bold); color: var(--text-muted);">${idx + 1}</td>
                      <td>
                        <div style="font-weight: var(--fw-medium);">${escapeHtml(m.nama)}</div>
                        <div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(m.kode || '-')}</div>
                      </td>
                      <td>
                        <span class="badge ${m.tipe === 'member' ? 'badge-primary' : 'badge-info'}">
                          ${escapeHtml(m.level || m.tipe)}
                        </span>
                      </td>
                      <td style="text-align: right; font-weight: var(--fw-semibold);">
                        ${formatAngka(m.total_transaksi)}x
                      </td>
                      <td style="text-align: right; font-weight: var(--fw-bold); color: var(--success);">
                        ${formatRupiah(m.total_belanja)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid 2 Kolom: Metode Pembayaran & Stok Kritis -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">
        <!-- Breakdown Metode Pembayaran -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${ICONS.wallet} Komposisi Metode Pembayaran</h3>
          </div>
          <div class="card-body">
            ${buatKomposisiMetodeBayar(data.metode_bayar || {}, r.total_penjualan || 1)}
          </div>
        </div>

        <!-- Stok Kritis & Kosong -->
        <div class="card">
          <div class="card-header" style="justify-content: space-between; align-items: center;">
            <h3 class="card-title">${ICONS.alertTriangle} Peringatan Stok Menipis / Habis</h3>
            <a href="#/pembelian" class="btn btn-sm btn-secondary no-print" style="text-decoration: none;">+ Order Supplier</a>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Produk Material</th>
                    <th style="text-align: right;">Stok</th>
                    <th style="text-align: right;">Batas Min</th>
                    <th style="text-align: center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.stok_kritis || []).length === 0 ? `
                    <tr><td colspan="4" style="text-align: center; color: var(--success); padding: var(--sp-4);">🎉 Stok semua barang dalam batas aman!</td></tr>
                  ` : (data.stok_kritis || []).map((s) => `
                    <tr>
                      <td>
                        <div style="font-weight: var(--fw-medium);">${escapeHtml(s.nama)}</div>
                        <div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(s.sku || '')}</div>
                      </td>
                      <td style="text-align: right; font-weight: var(--fw-bold); color: ${s.stok <= 0 ? 'var(--danger)' : 'var(--warning)'};">
                        ${formatAngka(s.stok)} ${escapeHtml(s.satuan)}
                      </td>
                      <td style="text-align: right; color: var(--text-muted);">
                        ${formatAngka(s.stok_min)} ${escapeHtml(s.satuan)}
                      </td>
                      <td style="text-align: center;">
                        <span class="badge ${s.status === 'habis' ? 'badge-danger' : 'badge-warning'}">
                          ${s.status === 'habis' ? 'HABIS' : 'KRITIS'}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/** Generator Grafik SVG Tren Harian Murni Ringan */
function buatSvgTrenChart(tren, isOwner) {
  if (!tren || tren.length === 0) {
    return `<div style="text-align: center; padding: var(--sp-6); color: var(--text-muted); font-size: var(--fs-sm);">Belum ada data transaksi harian dalam rentang tanggal ini.</div>`;
  }

  const h = 200;
  const w = Math.max(600, tren.length * 45);
  const paddingBawah = 30;
  const paddingTop = 20;
  const paddingKiri = 60;
  const chartHeight = h - paddingBawah - paddingTop;
  const chartWidth = w - paddingKiri - 20;

  let maxVal = 0;
  tren.forEach((t) => {
    maxVal = Math.max(maxVal, t.penjualan || 0, t.pembelian || 0);
  });
  if (maxVal === 0) maxVal = 1000000;

  const stepX = chartWidth / Math.max(1, tren.length);
  const barWidth = Math.max(4, Math.min(14, stepX * 0.35));

  let barsHtml = '';
  let labelsHtml = '';

  // Garis horizontal pembagi (Grid lines)
  let gridHtml = '';
  for (let i = 0; i <= 4; i++) {
    const yVal = maxVal * (i / 4);
    const yPos = paddingTop + chartHeight - (chartHeight * (i / 4));
    gridHtml += `
      <line x1="${paddingKiri}" y1="${yPos}" x2="${w - 20}" y2="${yPos}" stroke="var(--border)" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${paddingKiri - 8}" y="${yPos + 4}" font-size="10" fill="var(--text-muted)" text-anchor="end">${singkatNominal(yVal)}</text>
    `;
  }

  tren.forEach((t, i) => {
    const x = paddingKiri + (i * stepX) + (stepX / 2);
    const jY = chartHeight * ((t.penjualan || 0) / maxVal);
    const bY = chartHeight * ((t.pembelian || 0) / maxVal);

    // Bar Penjualan (Biru/Primer)
    barsHtml += `
      <rect x="${x - barWidth - 1}" y="${paddingTop + chartHeight - jY}" width="${barWidth}" height="${Math.max(1, jY)}" rx="2" fill="var(--primary)" opacity="0.9">
        <title>Tanggal ${t.tanggal}: Penjualan ${formatRupiah(t.penjualan || 0)} (${t.transaksi || 0} nota)</title>
      </rect>
    `;

    // Bar Pembelian (Kuning/Peringatan)
    barsHtml += `
      <rect x="${x + 1}" y="${paddingTop + chartHeight - bY}" width="${barWidth}" height="${Math.max(1, bY)}" rx="2" fill="var(--warning)" opacity="0.9">
        <title>Tanggal ${t.tanggal}: Pembelian ${formatRupiah(t.pembelian || 0)}</title>
      </rect>
    `;

    // Label Tanggal (Hanya tampilkan secukupnya agar tidak tumpang tindih)
    if (tren.length <= 15 || i % Math.ceil(tren.length / 10) === 0) {
      const labelTgl = t.tanggal ? t.tanggal.substring(5) : '';
      labelsHtml += `
        <text x="${x}" y="${h - 8}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${labelTgl}</text>
      `;
    }
  });

  return `
    <div style="width: 100%; overflow-x: auto;">
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" style="width: 100%; min-width: ${w}px; height: ${h}px; display: block; font-family: inherit;">
        ${gridHtml}
        ${barsHtml}
        ${labelsHtml}
      </svg>
    </div>
  `;
}

function singkatNominal(n) {
  if (n >= 1000000000) return (n / 1000000000).toFixed(1) + 'M';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'jt';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'rb';
  return String(Math.round(n));
}

function buatKomposisiMetodeBayar(metodeMap, totalOmset) {
  const list = [
    { key: 'tunai', nama: 'Tunai (Kas Kasir)', warna: 'var(--success)' },
    { key: 'transfer', nama: 'Transfer Bank', warna: 'var(--primary)' },
    { key: 'qris', nama: 'QRIS', warna: 'var(--info)' },
    { key: 'tempo', nama: 'Tempo / Kredit', warna: 'var(--danger)' }
  ];

  return `
    <div class="stack" style="gap: var(--sp-3);">
      ${list.map((m) => {
        const item = metodeMap[m.key] || { total: 0, count: 0 };
        const persen = totalOmset > 0 ? Math.round((item.total / totalOmset) * 100) : 0;
        return `
          <div>
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-xs); margin-bottom: 4px;">
              <span style="font-weight: var(--fw-medium); color: var(--text-main);">${escapeHtml(m.nama)} (${formatAngka(item.count)}x)</span>
              <span style="font-weight: var(--fw-bold);">${formatRupiah(item.total)} (${persen}%)</span>
            </div>
            <div style="width: 100%; height: 8px; background: var(--bg-surface-variant); border-radius: 4px; overflow: hidden;">
              <div style="width: ${persen}%; height: 100%; background: ${m.warna}; border-radius: 4px;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ========================================================================== */
/* 2. RENDER TAB: LAPORAN PENJUALAN                                           */
/* ========================================================================== */
function renderTabPenjualan(container, data) {
  const user = store.get('user');
  const role = user?.role;
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';
  const canVoid = isOwner || isAdmin;
  const r = data.ringkasan || {};
  const items = data.items || [];

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Kartu Ringkasan Penjualan -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="card stat">
          <div class="stat-label">Total Omset Penjualan</div>
          <div class="stat-value" style="color: var(--primary);">${formatRupiah(r.total_omset || 0)}</div>
          <div class="stat-delta"><span class="badge badge-primary">${formatAngka(r.total_transaksi || 0)} Transaksi</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Total Diskon Diberikan</div>
          <div class="stat-value" style="color: var(--warning);">${formatRupiah(r.total_diskon || 0)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Total Pajak / PPN</div>
          <div class="stat-value" style="color: var(--info);">${formatRupiah(r.total_pajak || 0)}</div>
        </div>
        ${isOwner ? `
          <div class="card stat">
            <div class="stat-label">Total Laba Penjualan</div>
            <div class="stat-value" style="color: var(--success);">${formatRupiah(r.total_laba || 0)}</div>
          </div>
        ` : ''}
      </div>

      <!-- Tabel Transaksi Penjualan -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <h3 class="card-title">${ICONS.shoppingBag} Daftar Nota Penjualan (${items.length} data)</h3>
          <div class="cluster no-print" style="gap: var(--sp-2);">
            <select id="sel-filter-bayar-jual" class="input input-sm" style="width: 140px;">
              <option value="">Semua Status</option>
              <option value="lunas" ${stateLaporan.filterPenjualan.status_bayar === 'lunas' ? 'selected' : ''}>Lunas</option>
              <option value="tempo" ${stateLaporan.filterPenjualan.status_bayar === 'tempo' ? 'selected' : ''}>Tempo</option>
              <option value="sebagian" ${stateLaporan.filterPenjualan.status_bayar === 'sebagian' ? 'selected' : ''}>Sebagian</option>
            </select>
            <select id="sel-filter-metode-jual" class="input input-sm" style="width: 140px;">
              <option value="">Semua Metode</option>
              <option value="tunai" ${stateLaporan.filterPenjualan.metode_bayar === 'tunai' ? 'selected' : ''}>Tunai</option>
              <option value="transfer" ${stateLaporan.filterPenjualan.metode_bayar === 'transfer' ? 'selected' : ''}>Transfer</option>
              <option value="qris" ${stateLaporan.filterPenjualan.metode_bayar === 'qris' ? 'selected' : ''}>QRIS</option>
              <option value="tempo" ${stateLaporan.filterPenjualan.metode_bayar === 'tempo' ? 'selected' : ''}>Tempo</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>No Nota</th>
                  <th>Tanggal</th>
                  <th>Kasir</th>
                  <th>Pelanggan</th>
                  <th>Metode</th>
                  <th>Status</th>
                  <th style="text-align: right;">Total Transaksi</th>
                  ${isOwner ? `<th style="text-align: right;">Laba Kotor</th>` : ''}
                  <th class="no-print" style="text-align: center; width: ${canVoid ? '100px' : '60px'};">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="${isOwner ? (canVoid ? 9 : 9) : (canVoid ? 8 : 8)}" style="text-align: center; color: var(--text-muted); padding: var(--sp-6);">Tidak ada data penjualan sesuai filter</td></tr>
                ` : items.map((j) => {
                  const isVoided = j.status === 'void';
                  return `
                  <tr style="${isVoided ? 'opacity: 0.65; background: var(--bg-surface-variant);' : ''}">
                    <td data-label="No Nota">
                      <span style="font-family: monospace; font-weight: var(--fw-bold); ${isVoided ? 'text-decoration: line-through;' : ''}">${escapeHtml(j.no_nota)}</span>
                    </td>
                    <td style="font-size: var(--fs-xs); color: var(--text-muted);" data-label="Tanggal">${formatTanggal(j.tanggal)}</td>
                    <td data-label="Kasir">${escapeHtml(j.kasir_nama || 'Kasir')}</td>
                    <td data-label="Pelanggan">${escapeHtml(j.pelanggan_nama || 'Umum')}</td>
                    <td data-label="Metode"><span class="badge badge-info">${escapeHtml(j.metode_bayar || 'tunai')}</span></td>
                    <td data-label="Status">
                      ${isVoided ? `
                        <span class="badge badge-danger" title="Transaksi Dibatalkan / Void">Dibatalkan</span>
                      ` : `
                        <span class="badge ${j.status_bayar === 'lunas' ? 'badge-success' : (j.status_bayar === 'tempo' || j.status_bayar === 'belum_lunas' ? 'badge-danger' : 'badge-warning')}">
                          ${escapeHtml(j.status_bayar || 'lunas')}
                        </span>
                      `}
                    </td>
                    <td style="text-align: right; font-weight: var(--fw-bold); ${isVoided ? 'text-decoration: line-through;' : ''}" data-label="Total Transaksi">${formatRupiah(j.total)}</td>
                    ${isOwner ? `
                      <td style="text-align: right; font-weight: var(--fw-semibold); color: ${isVoided ? 'var(--text-muted)' : 'var(--success)'};" data-label="Laba Kotor">
                        ${isVoided ? '-' : formatRupiah(j.laba_kotor || 0)}
                      </td>
                    ` : ''}
                    <td class="no-print" style="text-align: center; white-space: nowrap;" data-label="Aksi">
                      <div class="cluster" style="justify-content: center; gap: 4px;">
                        <button type="button" class="btn btn-sm btn-ghost btn-detail-nota" data-id="${j.id}" title="Lihat Rincian Item">
                          ${ICONS.eye}
                        </button>
                        ${canVoid && !isVoided ? `
                          <button type="button" class="btn btn-sm btn-ghost text-danger btn-void-nota" data-id="${j.id}" data-nonota="${escapeHtml(j.no_nota)}" data-total="${formatRupiah(j.total)}" title="Batalkan / Hapus Transaksi (Hanya Owner & Admin)">
                            ${ICONS.trash}
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  // Filter change listener
  const selBayar = $('#sel-filter-bayar-jual', container);
  const selMetode = $('#sel-filter-metode-jual', container);
  if (selBayar) {
    selBayar.addEventListener('change', () => {
      stateLaporan.filterPenjualan.status_bayar = selBayar.value;
      muatDataTabAktif(container.closest('#modul-laporan-root'));
    });
  }
  if (selMetode) {
    selMetode.addEventListener('change', () => {
      stateLaporan.filterPenjualan.metode_bayar = selMetode.value;
      muatDataTabAktif(container.closest('#modul-laporan-root'));
    });
  }

  // Tombol Rincian Nota Modal
  $$('.btn-detail-nota', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      bukaModalDetailNota(id, () => {
        muatDataTabAktif(container.closest('#modul-laporan-root'));
      });
    });
  });

  // Tombol Batalkan / Hapus Nota (Khusus Owner & Admin)
  if (canVoid) {
    $$('.btn-void-nota', container).forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const noNota = btn.getAttribute('data-nonota');
        const total = btn.getAttribute('data-total');
        konfirmasiVoidNota(id, noNota, total, () => {
          muatDataTabAktif(container.closest('#modul-laporan-root'));
        });
      });
    });
  }
}

/**
 * Modal Konfirmasi & Eksekusi Pembatalan Nota (Void)
 * Fitur Khusus: Hanya Owner dan Admin yang memiliki otorisasi
 */
function konfirmasiVoidNota(penjualanId, noNota, totalFormatted, onSelesai) {
  const user = store.get('user');
  const role = user?.role;
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin';

  if (!isOwner && !isAdmin) {
    showToast('Akses ditolak: Hanya Pemilik (Owner) dan Admin yang dapat membatalkan pesanan.', 'error');
    return;
  }

  const roleLabel = isOwner ? 'Pemilik Toko (Owner)' : 'Administrator';

  const modalBody = `
    <div class="stack" style="gap: var(--sp-3);">
      <div class="alert alert-danger" style="display: flex; gap: var(--sp-2); align-items: flex-start;">
        <span style="flex-shrink: 0; margin-top: 2px;">${ICONS.alertTriangle}</span>
        <div style="font-size: var(--fs-sm);">
          <strong>Otorisasi Pembatalan Nota (Void)</strong>
          <p style="margin: 4px 0 0 0;">
            Anda masuk sebagai <strong>${roleLabel}</strong>. Membatalkan nota <strong>${escapeHtml(noNota)}</strong> (${totalFormatted}) akan:
          </p>
          <ul style="margin: 6px 0 0 var(--sp-4); padding: 0; line-height: 1.5;">
            <li>Mengembalikan seluruh stok barang pada transaksi ini ke master persediaan otomatis.</li>
            <li>Mencatat riwayat mutasi balik ('void') pada kartu stok untuk audit barang.</li>
            <li>Membatalkan jurnal arus kas masuk terkait transaksi ini.</li>
          </ul>
          ${isAdmin ? `
            <div style="margin-top: 6px; padding: 4px 8px; background: rgba(0,0,0,0.06); border-radius: 4px; font-size: var(--fs-xs);">
              ℹ️ Catatan Admin: Sesuai SOP, Admin hanya dapat membatalkan transaksi hari ini. Untuk transaksi tanggal lampau silakan hubungi Pemilik Toko.
            </div>
          ` : ''}
        </div>
      </div>

      <div class="form-group">
        <label class="label" for="input-alasan-void" style="font-weight: var(--fw-semibold);">
          Alasan Pembatalan (Wajib Diisi): <span style="color: var(--danger);">*</span>
        </label>
        <textarea id="input-alasan-void" class="input" rows="3" placeholder="Contoh: Pembeli keliru memilih varian / salah input kasir / pelanggan membatalkan pembelian" style="resize: vertical; font-size: var(--fs-sm);"></textarea>
        <div style="font-size: var(--fs-xs); color: var(--text-muted); margin-top: 4px;">
          Alasan akan tercatat permanen di riwayat audit pembatalan transaksi.
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <div class="cluster" style="justify-content: flex-end; gap: var(--sp-2);">
      <button type="button" class="btn btn-secondary btn-sm btn-batal-void">Batal</button>
      <button type="button" class="btn btn-danger btn-sm btn-submit-void">
        ${ICONS.trash}
        <span>Ya, Batalkan Nota Ini</span>
      </button>
    </div>
  `;

  const modal = showModal({
    title: `Batalkan Nota: ${escapeHtml(noNota)}`,
    body: modalBody,
    footer: footerHtml,
    size: 'md'
  });

  const btnBatal = modal.el.querySelector('.btn-batal-void');
  if (btnBatal) btnBatal.addEventListener('click', () => modal.close());

  const btnSubmit = modal.el.querySelector('.btn-submit-void');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const inputAlasan = modal.el.querySelector('#input-alasan-void');
      const alasan = inputAlasan ? inputAlasan.value.trim() : '';

      if (!alasan) {
        showToast('Alasan pembatalan wajib diisi.', 'warning');
        inputAlasan?.focus();
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Memproses...</span>';

      try {
        const res = await kirimRequest('penjualan.void', { id: penjualanId, alasan });
        if (!res || !res.ok) {
          showToast(res ? (res.error || res.message) : 'Gagal membatalkan transaksi', 'error');
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = `${ICONS.trash} <span>Ya, Batalkan Nota Ini</span>`;
          return;
        }

        modal.close();
        haptic.delete();
        showToast(`Nota ${escapeHtml(noNota)} berhasil dibatalkan (void). Stok barang telah dikembalikan!`, 'success', 4000);
        if (typeof onSelesai === 'function') onSelesai();
      } catch (err) {
        showToast(err.message || 'Terjadi kesalahan sistem saat membatalkan transaksi', 'error');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `${ICONS.trash} <span>Ya, Batalkan Nota Ini</span>`;
      }
    });
  }
}

/** Modal Detail Nota Penjualan */
async function bukaModalDetailNota(penjualanId, onUpdated) {
  try {
    const res = await kirimRequest('penjualan.detail', { id: penjualanId });
    if (!res || !res.ok) {
      showToast(res ? (res.error || res.message) : 'Gagal mengambil detail nota', 'error');
      return;
    }

    const d = res.data;
    const j = d.penjualan;
    const items = d.items || [];
    const user = store.get('user');
    const role = user?.role;
    const canVoid = role === 'owner' || role === 'admin';
    const isVoided = j.status === 'void';

    const modalBody = `
      <div class="stack" style="gap: var(--sp-3);">
        ${isVoided ? `
          <div class="alert alert-danger" style="display: flex; gap: var(--sp-2); align-items: flex-start; margin-bottom: var(--sp-1);">
            <span style="flex-shrink: 0; margin-top: 2px;">${ICONS.alertTriangle}</span>
            <div style="font-size: var(--fs-sm);">
              <strong>TRANSAKSI INI TELAH DIBATALKAN (VOID)</strong>
              ${j.alasan_void ? `<div style="margin-top: 2px;"><strong>Alasan:</strong> ${escapeHtml(j.alasan_void)}</div>` : ''}
              ${j.void_at ? `<div style="font-size: var(--fs-xs); color: var(--text-muted); margin-top: 2px;">Waktu Batal: ${formatTanggal(j.void_at)}</div>` : ''}
            </div>
          </div>
        ` : ''}

        <div class="cluster" style="justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: var(--sp-2);">
          <div>
            <div style="font-weight: var(--fw-bold); font-size: var(--fs-lg); font-family: monospace; ${isVoided ? 'text-decoration: line-through;' : ''}">${escapeHtml(j.no_nota)}</div>
            <div style="font-size: var(--fs-xs); color: var(--text-muted);">${formatTanggal(j.tanggal)}</div>
          </div>
          <div style="text-align: right;">
            ${isVoided ? `
              <span class="badge badge-danger">Dibatalkan (Void)</span>
            ` : `
              <span class="badge ${j.status_bayar === 'lunas' ? 'badge-success' : 'badge-danger'}">${escapeHtml(j.status_bayar || 'lunas')}</span>
            `}
          </div>
        </div>

        <div style="font-size: var(--fs-sm); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-2);">
          <div>Kasir: <strong>${escapeHtml(d.kasir?.nama || d.kasir?.username || j.kasir_id || '-')}</strong></div>
          <div>Pelanggan: <strong>${escapeHtml(d.pelanggan?.nama || j.pelanggan_id || 'Pelanggan Umum')}</strong></div>
          <div>Metode Bayar: <strong>${escapeHtml(j.metode_bayar || 'tunai').toUpperCase()}</strong></div>
        </div>

        <div class="table-wrap">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Item Barang</th>
                <th style="text-align: right;">Qty</th>
                <th style="text-align: right;">Harga</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it) => `
                <tr>
                  <td>
                    <div style="font-weight: var(--fw-medium);">${escapeHtml(it.nama)}</div>
                    <div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(it.satuan || '')}</div>
                  </td>
                  <td style="text-align: right;">${formatAngka(it.qty)}</td>
                  <td style="text-align: right;">${formatRupiah(it.harga)}</td>
                  <td style="text-align: right; font-weight: var(--fw-semibold);">${formatRupiah(it.subtotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: var(--sp-2);">
          <div class="cluster" style="justify-content: space-between; font-size: var(--fs-sm);">
            <span>Subtotal:</span><span>${formatRupiah(j.subtotal)}</span>
          </div>
          ${j.diskon > 0 ? `
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-sm); color: var(--warning);">
              <span>Diskon:</span><span>- ${formatRupiah(j.diskon)}</span>
            </div>
          ` : ''}
          ${j.pajak > 0 ? `
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-sm); color: var(--info);">
              <span>PPN / Pajak:</span><span>+ ${formatRupiah(j.pajak)}</span>
            </div>
          ` : ''}
          <div class="cluster" style="justify-content: space-between; font-weight: var(--fw-bold); font-size: var(--fs-base); margin-top: 4px;">
            <span>TOTAL TRANSAKSI:</span><span style="color: var(--primary);">${formatRupiah(j.total)}</span>
          </div>
        </div>
      </div>
    `;

    const footerHtml = `
      <div class="cluster" style="justify-content: space-between; width: 100%; flex-wrap: wrap; gap: var(--sp-2);">
        <div>
          ${canVoid && !isVoided ? `
            <button type="button" class="btn btn-danger btn-sm btn-modal-void-nota" title="Batalkan / Hapus Transaksi Ini">
              ${ICONS.trash}
              <span>Batalkan Transaksi (Void)</span>
            </button>
          ` : ''}
        </div>
        <button type="button" class="btn btn-secondary btn-sm btn-modal-tutup">Tutup</button>
      </div>
    `;

    const modal = showModal({
      title: 'Rincian Transaksi Penjualan',
      body: modalBody,
      footer: footerHtml
    });

    const btnTutup = modal.el.querySelector('.btn-modal-tutup');
    if (btnTutup) btnTutup.addEventListener('click', () => modal.close());

    const btnVoid = modal.el.querySelector('.btn-modal-void-nota');
    if (btnVoid) {
      btnVoid.addEventListener('click', () => {
        modal.close();
        konfirmasiVoidNota(j.id, j.no_nota, formatRupiah(j.total), onUpdated);
      });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ========================================================================== */
/* 3. RENDER TAB: LAPORAN PEMBELIAN                                           */
/* ========================================================================== */
function renderTabPembelian(container, data) {
  const r = data.ringkasan || {};
  const items = data.items || [];

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Kartu Ringkasan Pembelian -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="card stat">
          <div class="stat-label">Total Pembelian Barang</div>
          <div class="stat-value" style="color: var(--warning);">${formatRupiah(r.total_pembelian || 0)}</div>
          <div class="stat-delta"><span class="badge badge-warning">${formatAngka(r.total_faktur || 0)} Faktur Masuk</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Total Telah Dibayar</div>
          <div class="stat-value" style="color: var(--success);">${formatRupiah(r.total_terbayar || 0)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Total Sisa Hutang Faktur</div>
          <div class="stat-value" style="color: ${r.total_sisa_hutang > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
            ${formatRupiah(r.total_sisa_hutang || 0)}
          </div>
        </div>
      </div>

      <!-- Tabel Faktur Pembelian -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center;">
          <h3 class="card-title">${ICONS.truck} Daftar Faktur Pembelian Supplier (${items.length} data)</h3>
          <div class="cluster no-print" style="gap: var(--sp-2);">
            <select id="sel-filter-bayar-beli" class="input input-sm" style="width: 150px;">
              <option value="">Semua Status</option>
              <option value="lunas" ${stateLaporan.filterPembelian.status_bayar === 'lunas' ? 'selected' : ''}>Lunas</option>
              <option value="sebagian" ${stateLaporan.filterPembelian.status_bayar === 'sebagian' ? 'selected' : ''}>Sebagian (Tempo)</option>
              <option value="hutang" ${stateLaporan.filterPembelian.status_bayar === 'hutang' ? 'selected' : ''}>Belum Dibayar</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>No Faktur</th>
                  <th>No Ref Supplier</th>
                  <th>Tanggal</th>
                  <th>Nama Supplier</th>
                  <th>Status</th>
                  <th style="text-align: right;">Total Nilai</th>
                  <th style="text-align: right;">Dibayar</th>
                  <th style="text-align: right;">Sisa Hutang</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: var(--sp-6);">Tidak ada faktur pembelian sesuai filter</td></tr>
                ` : items.map((pb) => `
                  <tr>
                    <td data-label="No Faktur"><span style="font-family: monospace; font-weight: var(--fw-bold);">${escapeHtml(pb.no_faktur)}</span></td>
                    <td data-label="Ref Supplier"><span style="font-family: monospace; color: var(--text-muted);">${escapeHtml(pb.no_faktur_supplier || '-')}</span></td>
                    <td style="font-size: var(--fs-xs); color: var(--text-muted);" data-label="Tanggal">${formatTanggal(pb.tanggal)}</td>
                    <td style="font-weight: var(--fw-medium);" data-label="Supplier">${escapeHtml(pb.supplier_nama)}</td>
                    <td data-label="Status">
                      <span class="badge ${pb.status_bayar === 'lunas' ? 'badge-success' : 'badge-danger'}">
                        ${escapeHtml(pb.status_bayar)}
                      </span>
                    </td>
                    <td style="text-align: right; font-weight: var(--fw-bold);" data-label="Total Nilai">${formatRupiah(pb.total)}</td>
                    <td style="text-align: right; color: var(--success);" data-label="Dibayar">${formatRupiah(pb.bayar)}</td>
                    <td style="text-align: right; font-weight: var(--fw-bold); color: ${pb.sisa_hutang > 0 ? 'var(--danger)' : 'var(--text-muted)'};" data-label="Sisa Hutang">
                      ${formatRupiah(pb.sisa_hutang)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const selBeli = $('#sel-filter-bayar-beli', container);
  if (selBeli) {
    selBeli.addEventListener('change', () => {
      stateLaporan.filterPembelian.status_bayar = selBeli.value;
      muatDataTabAktif(container.closest('#modul-laporan-root'));
    });
  }
}

/* ========================================================================== */
/* 4. RENDER TAB: BUKU ARUS KAS                                               */
/* ========================================================================== */
function renderTabArusKas(container, data) {
  const r = data.ringkasan || {};
  const masuk = data.rincian_masuk || {};
  const keluar = data.rincian_keluar || {};

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Kartu Ringkasan Arus Kas -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="card stat">
          <div class="stat-label">Total Arus Kas Masuk</div>
          <div class="stat-value" style="color: var(--success);">${formatRupiah(r.total_kas_masuk || 0)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Total Arus Kas Keluar</div>
          <div class="stat-value" style="color: var(--danger);">${formatRupiah(r.total_kas_keluar || 0)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Arus Kas Bersih (Net Flow)</div>
          <div class="stat-value" style="color: ${r.arus_kas_bersih >= 0 ? 'var(--primary)' : 'var(--danger)'};">
            ${formatRupiah(r.arus_kas_bersih || 0)}
          </div>
        </div>
        <div class="card stat">
          <div class="stat-label">Kas Fisik Kasir (Tunai)</div>
          <div class="stat-value" style="color: var(--text-main);">${formatRupiah(r.saldo_tunai_kasir || 0)}</div>
          <div class="stat-delta"><span class="badge badge-info">Tunai di Laci Kasir</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Bank & QRIS (Non-Tunai)</div>
          <div class="stat-value" style="color: var(--text-main);">${formatRupiah(r.saldo_bank_non_tunai || 0)}</div>
          <div class="stat-delta"><span class="badge badge-info">Rekening Toko</span></div>
        </div>
      </div>

      <!-- Detail Rincian Kas Masuk & Kas Keluar -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">
        <!-- Rincian Kas Masuk -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title" style="color: var(--success);">${ICONS.arrowDownLeft || ICONS.wallet} Rincian Kas Masuk (Penerimaan)</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap keep-table">
              <table class="table">
                <tbody>
                  <tr>
                    <td>Penjualan Tunai Kasir</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah(masuk.penjualan_tunai || 0)}</td>
                  </tr>
                  <tr>
                    <td>Penjualan via Transfer Bank</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah(masuk.penjualan_transfer || 0)}</td>
                  </tr>
                  <tr>
                    <td>Penjualan via QRIS</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah(masuk.penjualan_qris || 0)}</td>
                  </tr>
                  <tr>
                    <td>Pelunasan Piutang (Tunai)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah(masuk.piutang_tunai || 0)}</td>
                  </tr>
                  <tr>
                    <td>Pelunasan Piutang (Transfer / QRIS)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah((masuk.piutang_transfer || 0) + (masuk.piutang_qris || 0))}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-variant); font-weight: var(--fw-bold);">
                    <td>TOTAL KAS MASUK</td>
                    <td style="text-align: right; color: var(--success);">${formatRupiah(r.total_kas_masuk || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Rincian Kas Keluar -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title" style="color: var(--danger);">${ICONS.arrowUpRight || ICONS.wallet} Rincian Kas Keluar (Pengeluaran)</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap keep-table">
              <table class="table">
                <tbody>
                  <tr>
                    <td>Pembelian Stok Barang (Tunai)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.pembelian_tunai || 0)}</td>
                  </tr>
                  <tr>
                    <td>Pembelian Stok Barang (Transfer Bank)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.pembelian_transfer || 0)}</td>
                  </tr>
                  <tr>
                    <td>Pembayaran Hutang Supplier (Tunai)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.hutang_tunai || 0)}</td>
                  </tr>
                  <tr>
                    <td>Pembayaran Hutang Supplier (Transfer)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.hutang_transfer || 0)}</td>
                  </tr>
                  <tr>
                    <td>Refund Retur Penjualan (Kas)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.refund_retur_tunai || 0)}</td>
                  </tr>
                  <tr style="background: var(--bg-surface-variant); font-weight: var(--fw-bold);">
                    <td>TOTAL KAS KELUAR</td>
                    <td style="text-align: right; color: var(--danger);">${formatRupiah(r.total_kas_keluar || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ========================================================================== */
/* 5. RENDER TAB: LABA RUGI & MARGIN (KHUSUS OWNER)                           */
/* ========================================================================== */
function renderTabLabaRugi(container, data) {
  const r = data.ringkasan || {};
  const kategoriList = data.analisis_kategori || [];
  const produkMargin = data.produk_margin_teratas || [];

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Ringkasan Laporan Laba Rugi Toko -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${ICONS.award} Laporan Laba Rugi Komprehensif</h3>
        </div>
        <div class="card-body">
          <div class="stack" style="gap: var(--sp-2); max-width: 650px; margin: 0 auto;">
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base);">
              <span>Penjualan Kotor (Gross Sales):</span>
              <span style="font-weight: var(--fw-semibold);">${formatRupiah(r.omset_kotor || 0)}</span>
            </div>
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); color: var(--warning);">
              <span>Potongan Diskon Penjualan:</span>
              <span style="font-weight: var(--fw-semibold);">- ${formatRupiah(r.total_diskon || 0)}</span>
            </div>
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-lg); font-weight: var(--fw-bold); border-top: 1px solid var(--border); padding-top: var(--sp-2);">
              <span>Penjualan Bersih (Net Sales):</span>
              <span style="color: var(--primary);">${formatRupiah(r.omset_bersih || 0)}</span>
            </div>

            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); color: var(--danger); margin-top: var(--sp-2);">
              <span>Harga Pokok Penjualan (HPP / COGS):</span>
              <span style="font-weight: var(--fw-semibold);">- ${formatRupiah(r.total_hpp || 0)}</span>
            </div>
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); font-weight: var(--fw-bold); border-top: 1px solid var(--border); padding-top: var(--sp-1);">
              <span>Laba Kotor Awal:</span>
              <span>${formatRupiah(r.laba_kotor_sebelum_retur || 0)}</span>
            </div>

            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); color: var(--danger);">
              <span>Pengurang: Retur Penjualan Disetujui:</span>
              <span style="font-weight: var(--fw-semibold);">- ${formatRupiah(r.total_retur_penjualan || 0)}</span>
            </div>

            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-xl); font-weight: var(--fw-bold); background: var(--bg-surface-variant); padding: var(--sp-3); border-radius: var(--radius-md); margin-top: var(--sp-2);">
              <span>LABA KOTOR BERSIH:</span>
              <span style="color: var(--success);">${formatRupiah(r.laba_kotor_bersih || 0)} (${r.margin_persen || 0}%)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid: Analisis Kategori & Produk Margin Tertinggi -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));">
        <!-- Laba & Margin per Kategori -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${ICONS.tag} Analisis Laba & Margin per Kategori</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Kategori Material</th>
                    <th style="text-align: right;">Omset</th>
                    <th style="text-align: right;">Laba Kotor</th>
                    <th style="text-align: right;">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  ${kategoriList.length === 0 ? `
                    <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada data kategori</td></tr>
                  ` : kategoriList.map((k) => `
                    <tr>
                      <td style="font-weight: var(--fw-medium);">${escapeHtml(k.kategori)}</td>
                      <td style="text-align: right;">${formatRupiah(k.omset)}</td>
                      <td style="text-align: right; font-weight: var(--fw-bold); color: var(--success);">${formatRupiah(k.laba)}</td>
                      <td style="text-align: right;"><span class="badge badge-success">${k.margin_persen}%</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 10 Produk Kontribusi Laba Tertinggi -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${ICONS.award} 10 Produk Penyumbang Laba Terbesar</h3>
          </div>
          <div class="card-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Produk Material</th>
                    <th style="text-align: right;">Qty</th>
                    <th style="text-align: right;">Total Laba</th>
                    <th style="text-align: right;">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  ${produkMargin.length === 0 ? `
                    <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada data produk</td></tr>
                  ` : produkMargin.map((p) => `
                    <tr>
                      <td style="font-weight: var(--fw-medium);">${escapeHtml(p.nama)}</td>
                      <td style="text-align: right;">${formatAngka(p.qty)}</td>
                      <td style="text-align: right; font-weight: var(--fw-bold); color: var(--success);">${formatRupiah(p.laba)}</td>
                      <td style="text-align: right;"><span class="badge badge-info">${p.margin_persen}%</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ========================================================================== */
/* 6. RENDER TAB: VALUASI STOK                                                */
/* ========================================================================== */
function renderTabStokValuasi(container, data) {
  const user = store.get('user');
  const isOwner = user && user.role === 'owner';
  const r = data.ringkasan || {};
  const items = data.items || [];

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Kartu Ringkasan Valuasi Stok -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="card stat">
          <div class="stat-label">Total Jenis Item Aktif</div>
          <div class="stat-value" style="color: var(--primary);">${formatAngka(r.total_item || 0)}</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Total Kuantitas Fisik</div>
          <div class="stat-value" style="color: var(--info);">${formatAngka(r.total_unit_stok || 0)} Unit</div>
        </div>
        ${isOwner ? `
          <div class="card stat">
            <div class="stat-label">Estimasi Nilai Modal Aset</div>
            <div class="stat-value" style="color: var(--success);">${formatRupiah(r.total_nilai_aset || 0)}</div>
            <div class="stat-delta"><span class="badge badge-success">Valuasi HPP Berjalan</span></div>
          </div>
        ` : ''}
        <div class="card stat">
          <div class="stat-label">Stok Kosong / Habis</div>
          <div class="stat-value" style="color: ${r.total_habis > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatAngka(r.total_habis || 0)}</div>
          <div class="stat-delta"><span class="badge ${r.total_habis > 0 ? 'badge-danger' : 'badge-success'}">${r.total_habis > 0 ? 'Perlu Restock' : 'Aman'}</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">Stok Menipis (Kritis)</div>
          <div class="stat-value" style="color: ${r.total_kritis > 0 ? 'var(--warning)' : 'var(--text-muted)'};">${formatAngka(r.total_kritis || 0)}</div>
        </div>
      </div>

      <!-- Tabel Daftar Valuasi Stok -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <h3 class="card-title">${ICONS.box} Daftar Persediaan Barang & Nilai Aset (${items.length} item)</h3>
          <div class="cluster no-print" style="gap: var(--sp-2); flex-wrap: wrap;">
            <input type="text" id="inp-cari-stok" class="input input-sm" placeholder="Cari nama / SKU..." value="${escapeHtml(stateLaporan.filterStok.q || '')}" style="width: 180px;">
            <select id="sel-status-stok" class="input input-sm" style="width: 140px;">
              <option value="semua" ${stateLaporan.filterStok.status_stok === 'semua' ? 'selected' : ''}>Semua Status</option>
              <option value="kritis" ${stateLaporan.filterStok.status_stok === 'kritis' ? 'selected' : ''}>Kritis (Menipis)</option>
              <option value="habis" ${stateLaporan.filterStok.status_stok === 'habis' ? 'selected' : ''}>Habis (0)</option>
              <option value="aman" ${stateLaporan.filterStok.status_stok === 'aman' ? 'selected' : ''}>Aman</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>SKU / Barcode</th>
                  <th>Nama Produk & Material</th>
                  <th>Kategori</th>
                  <th style="text-align: right;">Stok Fisik</th>
                  <th style="text-align: right;">Batas Min</th>
                  <th style="text-align: center;">Status</th>
                  <th style="text-align: right;">HPP Satuan</th>
                  ${isOwner ? `<th style="text-align: right;">Nilai Aset</th>` : ''}
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="${isOwner ? 8 : 7}" style="text-align: center; color: var(--text-muted); padding: var(--sp-6);">Tidak ada data persediaan stok sesuai filter</td></tr>
                ` : items.map((it) => `
                  <tr>
                    <td data-label="SKU / Barcode">
                      <div style="font-family: monospace; font-weight: var(--fw-medium);">${escapeHtml(it.sku || '-')}</div>
                      ${it.barcode ? `<div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(it.barcode)}</div>` : ''}
                    </td>
                    <td style="font-weight: var(--fw-medium);" data-label="Produk">${escapeHtml(it.nama)}</td>
                    <td data-label="Kategori"><span class="badge badge-info">${escapeHtml(it.kategori)}</span></td>
                    <td style="text-align: right; font-weight: var(--fw-bold); color: ${it.stok <= 0 ? 'var(--danger)' : (it.status === 'kritis' ? 'var(--warning)' : 'var(--text-main)')};" data-label="Stok Fisik">
                      ${formatAngka(it.stok)} ${escapeHtml(it.satuan)}
                    </td>
                    <td style="text-align: right; color: var(--text-muted);" data-label="Batas Min">
                      ${formatAngka(it.stok_min)} ${escapeHtml(it.satuan)}
                    </td>
                    <td style="text-align: center;" data-label="Status">
                      <span class="badge ${it.status === 'habis' ? 'badge-danger' : (it.status === 'kritis' ? 'badge-warning' : 'badge-success')}">
                        ${it.status.toUpperCase()}
                      </span>
                    </td>
                    <td style="text-align: right;" data-label="HPP Satuan">${formatRupiah(it.hpp)}</td>
                    ${isOwner ? `
                      <td style="text-align: right; font-weight: var(--fw-bold); color: var(--success);" data-label="Nilai Aset">
                        ${formatRupiah(it.nilai_aset || 0)}
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const selStatus = $('#sel-status-stok', container);
  const inpCari = $('#inp-cari-stok', container);

  if (selStatus) {
    selStatus.addEventListener('change', () => {
      stateLaporan.filterStok.status_stok = selStatus.value;
      muatDataTabAktif(container.closest('#modul-laporan-root'));
    });
  }

  let cariTimeout;
  if (inpCari) {
    inpCari.addEventListener('input', () => {
      clearTimeout(cariTimeout);
      cariTimeout = setTimeout(() => {
        stateLaporan.filterStok.q = inpCari.value;
        muatDataTabAktif(container.closest('#modul-laporan-root'));
      }, 400);
    });
  }
}

/* ========================================================================== */
/* EKSPOR CSV ENGINE                                                          */
/* ========================================================================== */
function jalankanEksporCsv() {
  const tab = stateLaporan.tabAktif;
  const tglStr = `${stateLaporan.dari}_sd_${stateLaporan.sampai}`;

  if (tab === 'dashboard' || tab === 'penjualan') {
    const data = stateLaporan.dataPenjualan;
    if (!data || !data.items || data.items.length === 0) {
      showToast('Belum ada data penjualan untuk diekspor.', 'warning');
      return;
    }
    const headers = ['No Nota', 'Tanggal', 'Kasir', 'Pelanggan', 'Metode Bayar', 'Status Bayar', 'Subtotal', 'Diskon', 'Total'];
    const rows = data.items.map((j) => [
      j.no_nota,
      j.tanggal,
      j.kasir_nama,
      j.pelanggan_nama,
      j.metode_bayar,
      j.status_bayar,
      j.subtotal,
      j.diskon,
      j.total
    ]);
    unduhCsv(`laporan_penjualan_${tglStr}.csv`, headers, rows);
  } else if (tab === 'pembelian') {
    const data = stateLaporan.dataPembelian;
    if (!data || !data.items || data.items.length === 0) {
      showToast('Belum ada data pembelian untuk diekspor.', 'warning');
      return;
    }
    const headers = ['No Faktur', 'Ref Supplier', 'Tanggal', 'Supplier', 'Status Bayar', 'Subtotal', 'Diskon', 'Total', 'Dibayar', 'Sisa Hutang'];
    const rows = data.items.map((pb) => [
      pb.no_faktur,
      pb.no_faktur_supplier,
      pb.tanggal,
      pb.supplier_nama,
      pb.status_bayar,
      pb.subtotal,
      pb.diskon,
      pb.total,
      pb.bayar,
      pb.sisa_hutang
    ]);
    unduhCsv(`laporan_pembelian_${tglStr}.csv`, headers, rows);
  } else if (tab === 'aruskas') {
    const data = stateLaporan.dataArusKas;
    if (!data) {
      showToast('Belum ada data arus kas untuk diekspor.', 'warning');
      return;
    }
    const headers = ['Pos Arus Kas', 'Jenis Aliran', 'Nominal (Rp)'];
    const rows = [
      ['Penjualan Tunai Kasir', 'Kas Masuk', data.rincian_masuk.penjualan_tunai || 0],
      ['Penjualan Transfer Bank', 'Kas Masuk', data.rincian_masuk.penjualan_transfer || 0],
      ['Penjualan QRIS', 'Kas Masuk', data.rincian_masuk.penjualan_qris || 0],
      ['Pelunasan Piutang Pelanggan', 'Kas Masuk', (data.rincian_masuk.piutang_tunai || 0) + (data.rincian_masuk.piutang_transfer || 0)],
      ['TOTAL KAS MASUK', 'Subtotal', data.ringkasan.total_kas_masuk || 0],
      ['Pembelian Stok Tunai', 'Kas Keluar', data.rincian_keluar.pembelian_tunai || 0],
      ['Pembayaran Hutang Supplier', 'Kas Keluar', (data.rincian_keluar.hutang_tunai || 0) + (data.rincian_keluar.hutang_transfer || 0)],
      ['Refund Retur Tunai', 'Kas Keluar', data.rincian_keluar.refund_retur_tunai || 0],
      ['TOTAL KAS KELUAR', 'Subtotal', data.ringkasan.total_kas_keluar || 0],
      ['ARUS KAS BERSIH', 'Net Cash Flow', data.ringkasan.arus_kas_bersih || 0]
    ];
    unduhCsv(`laporan_arus_kas_${tglStr}.csv`, headers, rows);
  } else if (tab === 'labarugi') {
    const data = stateLaporan.dataLabaRugi;
    if (!data) {
      showToast('Belum ada data laba rugi untuk diekspor.', 'warning');
      return;
    }
    const headers = ['Komponen Laba Rugi', 'Nilai (Rp)', 'Keterangan'];
    const rows = [
      ['Penjualan Kotor', data.ringkasan.omset_kotor || 0, 'Gross Sales'],
      ['Potongan Diskon', data.ringkasan.total_diskon || 0, 'Diskon Faktur & Item'],
      ['Penjualan Bersih', data.ringkasan.omset_bersih || 0, 'Net Sales'],
      ['Harga Pokok Penjualan (HPP)', data.ringkasan.total_hpp || 0, 'Cost of Goods Sold (Snapshot)'],
      ['Laba Kotor Sebelum Retur', data.ringkasan.laba_kotor_sebelum_retur || 0, 'Gross Profit Awal'],
      ['Retur Penjualan', data.ringkasan.total_retur_penjualan || 0, 'Barang Kembali'],
      ['Laba Kotor Bersih Akhir', data.ringkasan.laba_kotor_bersih || 0, `Margin: ${data.ringkasan.margin_persen || 0}%`]
    ];
    unduhCsv(`laporan_laba_rugi_${tglStr}.csv`, headers, rows);
  } else if (tab === 'stok') {
    const data = stateLaporan.dataStokValuasi;
    if (!data || !data.items || data.items.length === 0) {
      showToast('Belum ada data stok untuk diekspor.', 'warning');
      return;
    }
    const headers = ['SKU', 'Barcode', 'Nama Barang', 'Kategori', 'Satuan', 'Stok Saat Ini', 'Stok Minimum', 'Status', 'HPP', 'Nilai Aset'];
    const rows = data.items.map((it) => [
      it.sku,
      it.barcode,
      it.nama,
      it.kategori,
      it.satuan,
      it.stok,
      it.stok_min,
      it.status,
      it.hpp,
      it.nilai_aset || 0
    ]);
    unduhCsv(`valuasi_persediaan_stok_${tglStr}.csv`, headers, rows);
  }
}

/** Helper Unduh File CSV dengan UTF-8 BOM untuk kompatibilitas Excel */
function unduhCsv(namaFile, headers, rows) {
  const barisCsv = [];
  barisCsv.push(headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','));

  rows.forEach((row) => {
    barisCsv.push(row.map((val) => `"${String(val !== undefined && val !== null ? val : '').replace(/"/g, '""')}"`).join(','));
  });

  const isiCsv = '\uFEFF' + barisCsv.join('\r\n');
  const blob = new Blob([isiCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', namaFile);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`Berhasil mengunduh ${namaFile}`, 'success');
}

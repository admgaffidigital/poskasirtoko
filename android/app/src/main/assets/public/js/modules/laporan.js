/**
 * laporan.js — Modul Dashboard Eksekutif & Laporan Usaha (Fase 6)
 * Menampilkan ringkasan metrik penjualan, pembelian, arus kas, laba rugi,
 * valuasi aset persediaan stok, grafik tren harian ringan SVG, dan ekspor CSV/cetak.
 */

import { kirimRequest, hasUsableApiCache } from '../api.js';
import { store } from '../state.js';
import { $, $$, escapeHtml, renderSkeleton } from '../utils/dom.js';
import { formatRupiah, parseRupiah, formatQty, formatTanggal, formatAngka } from '../utils/format.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { haptic } from '../utils/native.js';
import { bukaModalPilihanCetakPenjualan, bukaModalPilihanCetakPembelian, bukaModalPilihanCetakShift, cetakFakturA5, bukaModalCetakSuratJalan } from '../utils/printer.js';
import { cetakLaporanEvaluasiBulananPdf, eksporEvaluasiBulananExcel, formatLabelBulan } from '../utils/evaluasi-pdf.js';

// State lokal modul laporan
let stateLaporan = {
  tabAktif: 'dashboard', // 'dashboard', 'penjualan', 'pembelian', 'aruskas', 'labarugi', 'stok', 'shift', 'pengiriman', 'tutupbuku'
  periode: '30_hari',
  periodeBulanan: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  dari: '',
  sampai: '',
  dataDashboard: null,
  dataPenjualan: null,
  dataPembelian: null,
  dataArusKas: null,
  dataLabaRugi: null,
  dataStokValuasi: null,
  dataShift: null,
  dataPengiriman: null,
  dataTutupBuku: null,
  filterStok: { status_stok: 'semua', kategori_id: '', q: '' },
  filterPenjualan: { status_bayar: '', metode_bayar: '' },
  filterPembelian: { status_bayar: '', supplier_id: '' },
  filterShift: { status: 'semua' },
  filterPengiriman: { status_antar: 'semua' }
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
      <!-- Header Modul: Standar .page-header (Judul & Tombol Segarkan Berdampingan) -->
      <div class="page-header page-header-inline no-print">
        <div>
          <h2>Dashboard & Laporan Usaha</h2>
          <p>Ringkasan performa penjualan, pembelian, arus kas, persediaan stok, dan laba toko</p>
        </div>
      </div>

      <!-- Baris Filter Periode Cepat & Rentang Tanggal -->
      <div class="card no-print" style="margin-bottom: var(--sp-3);">
        <div class="card-body" style="padding: var(--sp-3);">
          <!-- Baris Atas: Label & Badge Rentang Tanggal Aktif -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); gap: var(--sp-2);">
            <span style="font-weight: var(--fw-bold); font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Periode:</span>
            <div class="badge badge-secondary" id="badge-periode-aktif" style="padding: 4px 10px; font-size: var(--fs-xs); font-family: var(--font-mono); font-weight: var(--fw-semibold); border-radius: var(--radius-full); background: var(--surface-2); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.calendar}
              <span>${formatTanggal(stateLaporan.dari)} s/d ${formatTanggal(stateLaporan.sampai)}</span>
            </div>
          </div>

          <!-- Segmented Control Preset Periode -->
          <div class="segmented" id="seg-periode" role="group" style="width: 100%; box-sizing: border-box;">
            <button type="button" class="btn btn-sm ${stateLaporan.periode === 'hari_ini' ? 'btn-primary' : 'btn-ghost'}" data-periode="hari_ini">Hari Ini</button>
            <button type="button" class="btn btn-sm ${stateLaporan.periode === '7_hari' ? 'btn-primary' : 'btn-ghost'}" data-periode="7_hari">7 Hari</button>
            <button type="button" class="btn btn-sm ${stateLaporan.periode === '30_hari' ? 'btn-primary' : 'btn-ghost'}" data-periode="30_hari">30 Hari</button>
            <button type="button" class="btn btn-sm ${stateLaporan.periode === 'bulan_ini' ? 'btn-primary' : 'btn-ghost'}" data-periode="bulan_ini">Bulan Ini</button>
            <button type="button" class="btn btn-sm ${stateLaporan.periode === 'tahun_ini' ? 'btn-primary' : 'btn-ghost'}" data-periode="tahun_ini">Tahun Ini</button>
            <button type="button" class="btn btn-sm ${stateLaporan.periode === 'kustom' ? 'btn-primary' : 'btn-ghost'}" data-periode="kustom">Kustom</button>
          </div>

          <!-- Bagian Pilihan Tanggal Manual (Hanya muncul jika mode Kustom) -->
          <div id="box-kustom-tanggal" class="date-range-bar" style="${stateLaporan.periode === 'kustom' ? '' : 'display: none;'}">
            <div class="date-range-field">
              <label for="inp-lap-dari">Dari</label>
              <input type="date" id="inp-lap-dari" class="input input-sm" value="${stateLaporan.dari}">
            </div>
            <div class="date-range-field">
              <label for="inp-lap-sampai">Sampai</label>
              <input type="date" id="inp-lap-sampai" class="input input-sm" value="${stateLaporan.sampai}">
            </div>
            <button type="button" class="btn btn-sm btn-primary date-range-apply" id="btn-terapkan-tanggal">Terapkan Rentang</button>
          </div>
        </div>
      </div>

      <!-- Segmented Tab Navigation -->
      <div class="segmented no-print" id="tabs-laporan" role="tablist" style="margin-bottom: var(--sp-3); overflow-x: auto; max-width: 100%; width: 100%; box-sizing: border-box;">
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
        <button type="button" id="tab-btn-shift" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'shift'}">
          ${ICONS.cashier}
          <span>Shift Kasir</span>
        </button>
        <button type="button" id="tab-btn-pengiriman" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'pengiriman'}">
          ${ICONS.truck}
          <span>Pengiriman</span>
        </button>
        <button type="button" id="tab-btn-tutupbuku" class="btn btn-sm" aria-pressed="${stateLaporan.tabAktif === 'tutupbuku'}">
          ${ICONS.calendar}
          <span>Tutup Bulanan</span>
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
  const daftarTab = ['dashboard', 'penjualan', 'pembelian', 'aruskas', 'labarugi', 'stok', 'shift', 'pengiriman', 'tutupbuku'];
  daftarTab.forEach((tabId) => {
    const btn = $(`#tab-btn-${tabId}`, container);
    if (btn) {
      btn.addEventListener('click', () => {
        stateLaporan.tabAktif = tabId;
        $$('#tabs-laporan button', container).forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        if (typeof btn.scrollIntoView === 'function') {
          btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
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
        if (boxKustom) boxKustom.style.display = '';
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
        badgeAktif.innerHTML = `
          ${ICONS.calendar}
          <span>${formatTanggal(stateLaporan.dari)} s/d ${formatTanggal(stateLaporan.sampai)}</span>
        `;
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
        badgeAktif.innerHTML = `
          ${ICONS.calendar}
          <span>${formatTanggal(stateLaporan.dari)} s/d ${formatTanggal(stateLaporan.sampai)}</span>
        `;
      }

      muatDataTabAktif(container);
    });
  }
}

let laporanReqSeq = 0;

/**
 * Muat data sesuai tab aktif (bebas kedipan skeleton bila cache SWR siap & bebas balapan klik cepat)
 */
async function muatDataTabAktif(container) {
  const target = $('#konten-tab-laporan', container);
  if (!target) return;

  const seq = ++laporanReqSeq;
  const payload = {
    dari: stateLaporan.dari,
    sampai: stateLaporan.sampai,
    periode: stateLaporan.periode
  };

  let targetAction = 'laporan.dashboard';
  let targetPayload = payload;
  if (stateLaporan.tabAktif === 'penjualan') {
    targetAction = 'laporan.penjualan';
    targetPayload = { ...payload, ...stateLaporan.filterPenjualan, limit: 150 };
  } else if (stateLaporan.tabAktif === 'pembelian') {
    targetAction = 'laporan.pembelian';
    targetPayload = { ...payload, ...stateLaporan.filterPembelian, limit: 150 };
  } else if (stateLaporan.tabAktif === 'aruskas') {
    targetAction = 'laporan.arusKas';
  } else if (stateLaporan.tabAktif === 'labarugi') {
    targetAction = 'laporan.labaRugi';
  } else if (stateLaporan.tabAktif === 'stok') {
    targetAction = 'laporan.stokValuasi';
    targetPayload = { ...stateLaporan.filterStok, limit: 200 };
  } else if (stateLaporan.tabAktif === 'shift') {
    targetAction = 'shift.list';
    targetPayload = {
      dari: stateLaporan.dari,
      sampai: stateLaporan.sampai,
      status: stateLaporan.filterShift.status === 'semua' ? '' : stateLaporan.filterShift.status,
      limit: 150
    };
  } else if (stateLaporan.tabAktif === 'pengiriman') {
    targetAction = 'pengiriman.list';
    targetPayload = {
      dari: stateLaporan.dari,
      sampai: stateLaporan.sampai,
      status_antar: stateLaporan.filterPengiriman.status_antar === 'semua' ? '' : stateLaporan.filterPengiriman.status_antar,
      limit: 150
    };
  } else if (stateLaporan.tabAktif === 'tutupbuku') {
    targetAction = 'tutupBuku.evaluasiBulanan';
    targetPayload = { periode: stateLaporan.periodeBulanan };
  }

  if (!hasUsableApiCache(targetAction, targetPayload)) {
    target.innerHTML = `
      <div class="stack" style="gap: var(--sp-4);">
        <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
          ${Array.from({ length: 4 }).map(() => `
            <div class="stat-card-pro">
              <div class="skeleton" style="height: 14px; width: 55%; border-radius: 4px;"></div>
              <div class="skeleton" style="height: 28px; width: 75%; margin-top: 10px; border-radius: 6px;"></div>
              <div class="skeleton" style="height: 12px; width: 45%; margin-top: 8px; border-radius: 4px;"></div>
            </div>
          `).join('')}
        </div>
        <div class="card card-body">
          ${renderSkeleton(5)}
        </div>
      </div>
    `;
  }

  try {
    const res = await kirimRequest(targetAction, targetPayload);
    if (seq !== laporanReqSeq) return; // Abaikan respons lama jika user sudah berpindah tab/periode

    if (stateLaporan.tabAktif === 'dashboard') {
      if (res && res.ok) {
        stateLaporan.dataDashboard = res.data;
        renderTabDashboard(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat dashboard');
      }
    } else if (stateLaporan.tabAktif === 'penjualan') {
      if (res && res.ok) {
        stateLaporan.dataPenjualan = res.data;
        renderTabPenjualan(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat laporan penjualan');
      }
    } else if (stateLaporan.tabAktif === 'pembelian') {
      if (res && res.ok) {
        stateLaporan.dataPembelian = res.data;
        renderTabPembelian(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat laporan pembelian');
      }
    } else if (stateLaporan.tabAktif === 'aruskas') {
      if (res && res.ok) {
        stateLaporan.dataArusKas = res.data;
        renderTabArusKas(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat arus kas');
      }
    } else if (stateLaporan.tabAktif === 'labarugi') {
      if (res && res.ok) {
        stateLaporan.dataLabaRugi = res.data;
        renderTabLabaRugi(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat laba rugi');
      }
    } else if (stateLaporan.tabAktif === 'stok') {
      if (res && res.ok) {
        stateLaporan.dataStokValuasi = res.data;
        renderTabStokValuasi(target, res.data);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat valuasi stok');
      }
    } else if (stateLaporan.tabAktif === 'shift') {
      if (res && res.ok) {
        stateLaporan.dataShift = res.data;
        renderTabShiftKasir(target, res.data, container);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat riwayat shift kasir');
      }
    } else if (stateLaporan.tabAktif === 'pengiriman') {
      if (res && res.ok) {
        stateLaporan.dataPengiriman = res.data;
        renderTabPengiriman(target, res.data, container);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat antrean pengiriman');
      }
    } else if (stateLaporan.tabAktif === 'tutupbuku') {
      if (res && res.ok) {
        stateLaporan.dataTutupBuku = res.data;
        renderTabTutupBuku(target, res.data, container);
      } else {
        target.innerHTML = renderErrorState(res ? res.error : 'Gagal memuat evaluasi tutup buku bulanan');
      }
    }
  } catch (err) {
    if (seq !== laporanReqSeq) return;
    target.innerHTML = renderErrorState(err.message || 'Terjadi kesalahan sistem saat memuat laporan.');
  }
}

function renderErrorState(pesan) {
  return `
    <div class="card" style="padding: var(--sp-6); text-align: center; border-color: var(--danger);">
      <div style="font-size: var(--fs-xl); color: var(--danger); margin-bottom: var(--sp-2); display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
        <span class="icon-fit" style="width: 22px; height: 22px;">${ICONS.alertTriangle}</span>
        <span>Gagal Memuat Data</span>
      </div>
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

  const produkTerlaris = data.produk_terlaris || [];
  const pelangganTerbaik = data.pelanggan_terbaik || [];
  const stokKritis = data.stok_kritis || [];
  const MAX_RINGKAS = 5;

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-3);">
      <!-- Kartu Ringkasan Metrik Utama (Simetris Tanpa Kartu Yatim) -->
      <div class="dash-kpi-grid">
        ${isOwner ? `
          <div class="stat-card-pro dash-kpi-hero">
            <div class="dash-hero-inner">
              <div>
                <div class="stat-card-title" style="margin-bottom: 4px;">Laba Bersih Riil Toko</div>
                <div class="stat-card-value tabular" style="color: ${(r.laba_bersih_riil || 0) >= 0 ? 'var(--primary)' : 'var(--danger)'};">${formatRupiah(r.laba_bersih_riil || 0)}</div>
              </div>
              <div class="stack" style="align-items: flex-end; gap: 4px;">
                <span class="badge badge-primary">Margin Bersih ${r.margin_bersih_persen || 0}%</span>
                <span class="text-xs text-muted">Omset − HPP − Biaya Operasional</span>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Omset Penjualan</span>
            <div class="stat-card-icon icon-amber">${ICONS.shoppingBag}</div>
          </div>
          <div class="stat-card-value tabular" style="color: var(--primary);">${formatRupiah(r.total_penjualan || 0)}</div>
          <div class="stat-card-desc">${formatAngka(r.total_transaksi || 0)} transaksi • ${formatAngka(r.total_item_terjual || 0)} item</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Pembelian Stok</span>
            <div class="stat-card-icon icon-blue">${ICONS.truck}</div>
          </div>
          <div class="stat-card-value tabular" style="color: var(--warning-text);">${formatRupiah(r.total_pembelian || 0)}</div>
          <div class="stat-card-desc">${formatAngka(r.total_faktur_beli || 0)} faktur beli</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Piutang Aktif</span>
            <div class="stat-card-icon icon-rose">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value tabular" style="color: ${r.total_piutang_aktif > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatRupiah(r.total_piutang_aktif || 0)}</div>
          <div class="stat-card-desc">${formatAngka(r.count_piutang_aktif || 0)} nota tempo</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Hutang Supplier</span>
            <div class="stat-card-icon icon-rose">${ICONS.clipboard}</div>
          </div>
          <div class="stat-card-value tabular" style="color: ${r.total_hutang_aktif > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatRupiah(r.total_hutang_aktif || 0)}</div>
          <div class="stat-card-desc">${formatAngka(r.count_hutang_aktif || 0)} tagihan berjalan</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Biaya Operasional</span>
            <div class="stat-card-icon icon-rose">${ICONS.arrowUpRight}</div>
          </div>
          <div class="stat-card-value tabular" style="color: var(--danger);">${formatRupiah(r.total_biaya_operasional || 0)}</div>
          <div class="stat-card-desc">Beban kas toko</div>
        </div>

        ${isOwner ? `
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Nilai Aset Stok</span>
              <div class="stat-card-icon icon-emerald">${ICONS.box}</div>
            </div>
            <div class="stat-card-value tabular" style="color: var(--success-text);">${formatRupiah(r.total_nilai_aset_stok || 0)}</div>
            <div class="stat-card-desc">Modal berjalan (HPP)</div>
          </div>
        ` : `
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Stok Perlu Restok</span>
              <div class="stat-card-icon icon-amber">${ICONS.alertTriangle}</div>
            </div>
            <div class="stat-card-value tabular" style="color: ${stokKritis.length > 0 ? 'var(--danger)' : 'var(--success-text)'};">${formatAngka(stokKritis.length)} Item</div>
            <div class="stat-card-desc">${stokKritis.length > 0 ? 'Di bawah batas minimum' : 'Semua stok aman'}</div>
          </div>
        `}
      </div>

      <!-- Grafik Tren Harian -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <h3 class="card-title">${ICONS.chart} Tren Harian Penjualan & Pembelian</h3>
          <div class="cluster" style="font-size: var(--fs-xs); gap: var(--sp-3);">
            <span style="display: inline-flex; align-items: center; gap: 5px;">
              <span style="width: 10px; height: 10px; background: var(--primary); display: inline-block; border-radius: 2px;"></span> Penjualan
            </span>
            <span style="display: inline-flex; align-items: center; gap: 5px;">
              <span style="width: 10px; height: 10px; background: var(--warning); display: inline-block; border-radius: 2px;"></span> Pembelian
            </span>
          </div>
        </div>
        <div class="card-body" style="padding: var(--sp-3) var(--sp-4);">
          ${svgChartHtml}
        </div>
      </div>

      <!-- Grid 2 Kolom: Produk Terlaris & Pelanggan Terbaik (Compact Native Ranking List) -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));">
        <!-- Produk Terlaris -->
        <div class="card" id="card-dash-terlaris">
          <div class="card-header" style="justify-content: space-between; align-items: center;">
            <h3 class="card-title">${ICONS.award} Produk Paling Laris</h3>
            <span class="badge badge-info badge-sm">Top ${produkTerlaris.length}</span>
          </div>
          <div class="dash-list">
            ${produkTerlaris.length === 0 ? `
              <div class="text-xs text-muted text-center" style="padding: var(--sp-5);">Belum ada penjualan di periode ini</div>
            ` : produkTerlaris.map((p, idx) => `
              <div class="dash-row ${idx >= MAX_RINGKAS ? 'is-hidden-extra' : ''}">
                <div class="dash-rank ${idx < 3 ? `rank-${idx + 1}` : ''}">${idx + 1}</div>
                <div class="dash-row-main">
                  <div class="dash-row-title" title="${escapeHtml(p.nama)}">${escapeHtml(p.nama)}</div>
                  <div class="dash-row-sub">Terjual <b>${formatAngka(p.qty_terjual)} ${escapeHtml(p.satuan || '')}</b></div>
                </div>
                <div class="dash-row-right">
                  <div class="dash-row-val" style="color: var(--primary);">${formatRupiah(p.total_omset)}</div>
                </div>
              </div>
            `).join('')}
          </div>
          ${produkTerlaris.length > MAX_RINGKAS ? `
            <div class="dash-list-footer">
              <button type="button" class="btn btn-ghost btn-xs btn-toggle-dash-list" data-target="#card-dash-terlaris" data-total="${produkTerlaris.length}">
                Lihat Semua (${produkTerlaris.length} Produk)
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Pelanggan Terbaik -->
        <div class="card" id="card-dash-pelanggan">
          <div class="card-header" style="justify-content: space-between; align-items: center;">
            <h3 class="card-title">${ICONS.users} Pelanggan Terbesar</h3>
            <span class="badge badge-primary badge-sm">Top ${pelangganTerbaik.length}</span>
          </div>
          <div class="dash-list">
            ${pelangganTerbaik.length === 0 ? `
              <div class="text-xs text-muted text-center" style="padding: var(--sp-5);">Belum ada transaksi member di periode ini</div>
            ` : pelangganTerbaik.map((m, idx) => `
              <div class="dash-row ${idx >= MAX_RINGKAS ? 'is-hidden-extra' : ''}">
                <div class="dash-rank ${idx < 3 ? `rank-${idx + 1}` : ''}">${idx + 1}</div>
                <div class="dash-row-main">
                  <div class="dash-row-title" title="${escapeHtml(m.nama)}">${escapeHtml(m.nama)}</div>
                  <div class="dash-row-sub">
                    <span class="badge badge-sm ${m.tipe === 'member' ? 'badge-primary' : 'badge-info'}">${escapeHtml(m.level || m.tipe)}</span>
                    <span>${formatAngka(m.total_transaksi)}x belanja</span>
                  </div>
                </div>
                <div class="dash-row-right">
                  <div class="dash-row-val" style="color: var(--success-text);">${formatRupiah(m.total_belanja)}</div>
                </div>
              </div>
            `).join('')}
          </div>
          ${pelangganTerbaik.length > MAX_RINGKAS ? `
            <div class="dash-list-footer">
              <button type="button" class="btn btn-ghost btn-xs btn-toggle-dash-list" data-target="#card-dash-pelanggan" data-total="${pelangganTerbaik.length}">
                Lihat Semua (${pelangganTerbaik.length} Pelanggan)
              </button>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Grid 2 Kolom: Metode Pembayaran & Stok Kritis (Ringkas + Lihat Semua) -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));">
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
        <div class="card" id="card-dash-stok-kritis">
          <div class="card-header" style="justify-content: space-between; align-items: center; gap: var(--sp-2);">
            <h3 class="card-title">${ICONS.alertTriangle} Stok Menipis / Habis <span class="badge ${stokKritis.length > 0 ? 'badge-danger' : 'badge-success'} badge-sm">${stokKritis.length}</span></h3>
            <a href="#/pembelian" class="btn btn-xs btn-secondary no-print" style="text-decoration: none; flex-shrink: 0;">${ICONS.plus}<span>Order</span></a>
          </div>
          <div class="dash-list">
            ${stokKritis.length === 0 ? `
              <div class="text-xs text-center" style="color: var(--success-text); padding: var(--sp-5); display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span class="icon-fit" style="width: 16px; height: 16px;">${ICONS.checkCircle}</span>
                <span>Semua stok barang dalam batas aman</span>
              </div>
            ` : stokKritis.map((s, idx) => `
              <div class="dash-row ${idx >= MAX_RINGKAS ? 'is-hidden-extra' : ''}">
                <div class="dash-row-main">
                  <div class="dash-row-title" title="${escapeHtml(s.nama)}">${escapeHtml(s.nama)}</div>
                  <div class="dash-row-sub">
                    <span class="mono">${escapeHtml(s.sku || '-')}</span>
                    <span>• Min ${formatAngka(s.stok_min)} ${escapeHtml(s.satuan)}</span>
                  </div>
                </div>
                <div class="dash-row-right">
                  <div class="dash-row-val" style="color: ${s.stok <= 0 ? 'var(--danger)' : 'var(--warning-text)'};">${formatAngka(s.stok)} ${escapeHtml(s.satuan)}</div>
                  <span class="badge badge-sm ${s.status === 'habis' ? 'badge-danger' : 'badge-warning'}">${s.status === 'habis' ? 'HABIS' : 'KRITIS'}</span>
                </div>
              </div>
            `).join('')}
          </div>
          ${stokKritis.length > MAX_RINGKAS ? `
            <div class="dash-list-footer">
              <button type="button" class="btn btn-ghost btn-xs btn-toggle-dash-list" data-target="#card-dash-stok-kritis" data-total="${stokKritis.length}">
                Lihat Semua (${stokKritis.length} Item)
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  // Toggle "Lihat Semua / Ringkas" pada daftar dashboard
  container.querySelectorAll('.btn-toggle-dash-list').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cardSel = btn.getAttribute('data-target');
      const total = btn.getAttribute('data-total') || '';
      const card = container.querySelector(cardSel);
      if (!card) return;
      const expanded = btn.getAttribute('data-expanded') === 'true';
      card.querySelectorAll('.dash-row').forEach((row, idx) => {
        if (idx >= MAX_RINGKAS) {
          row.classList.toggle('is-hidden-extra', expanded);
        }
      });
      btn.setAttribute('data-expanded', expanded ? 'false' : 'true');
      btn.textContent = expanded ? `Lihat Semua (${total})` : 'Tampilkan Ringkas';
    });
  });
}

/** Generator Grafik SVG Tren Harian Murni Ringan */
function buatSvgTrenChart(tren, isOwner) {
  if (!tren || tren.length === 0) {
    return `<div style="text-align: center; padding: var(--sp-6); color: var(--text-muted); font-size: var(--fs-sm);">Belum ada data transaksi harian dalam rentang tanggal ini.</div>`;
  }

  const h = 200;
  const w = Math.max(320, tren.length * 42);
  const paddingBawah = 30;
  const paddingTop = 20;
  const paddingKiri = 48;
  const chartHeight = h - paddingBawah - paddingTop;
  const chartWidth = w - paddingKiri - 16;

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
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" style="width: 100%; ${tren.length > 8 ? `min-width: ${w}px;` : ''} height: ${h}px; display: block; font-family: inherit;">
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
    { key: 'deposit', nama: 'Saldo Titipan (Deposit)', warna: 'var(--warning)' },
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

function formatLabelStatusBayar(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'lunas') return 'Lunas';
  if (s === 'belum_lunas') return 'Belum Lunas';
  if (s === 'sebagian') return 'Sebagian';
  if (s === 'hutang') return 'Hutang';
  if (s === 'tempo') return 'Tempo';
  return st || '-';
}

function formatLabelMetodeBayar(m) {
  const s = String(m || '').toLowerCase();
  if (s === 'tunai') return 'Tunai';
  if (s === 'transfer') return 'Transfer';
  if (s === 'qris') return 'QRIS';
  if (s === 'deposit') return 'Saldo Titipan';
  if (s === 'tempo') return 'Tempo';
  if (s === 'kombinasi' || s === 'campuran') return 'Kombinasi';
  return m || '-';
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
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Omset Penjualan</span>
            <div class="stat-card-icon icon-emerald">${ICONS.shoppingBag}</div>
          </div>
          <div class="stat-card-value" style="color: var(--primary);">${formatRupiah(r.total_omset || 0)}</div>
          <div class="stat-card-desc" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="badge badge-primary">${formatAngka(r.total_transaksi || 0)} Transaksi Aktif</span>
            ${(r.total_void || 0) > 0 ? `<span class="badge badge-danger">${formatAngka(r.total_void)} Batal</span>` : ''}
          </div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Diskon Diberikan</span>
            <div class="stat-card-icon icon-amber">${ICONS.tag}</div>
          </div>
          <div class="stat-card-value" style="color: var(--warning);">${formatRupiah(r.total_diskon || 0)}</div>
          <div class="stat-card-desc">Potongan item &amp; nota aktif</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Pajak / PPN</span>
            <div class="stat-card-icon icon-blue">${ICONS.clipboard}</div>
          </div>
          <div class="stat-card-value" style="color: var(--info);">${formatRupiah(r.total_pajak || 0)}</div>
          <div class="stat-card-desc">Akumulasi PPN periode terpilih</div>
        </div>
        ${isOwner ? `
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Total Laba Penjualan</span>
              <div class="stat-card-icon icon-emerald">${ICONS.award}</div>
            </div>
            <div class="stat-card-value" style="color: var(--success);">${formatRupiah(r.total_laba || 0)}</div>
            <div class="stat-card-desc">Laba kotor transaksi aktif</div>
          </div>
        ` : ''}
      </div>

      <!-- Tabel Transaksi Penjualan -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <h3 class="card-title">${ICONS.shoppingBag} Daftar Nota Penjualan (${items.length} data)</h3>
          <div class="lap-subfilter-bar no-print">
            <select id="sel-filter-bayar-jual" class="input input-sm">
              <option value="">Semua Status</option>
              <option value="lunas" ${stateLaporan.filterPenjualan.status_bayar === 'lunas' ? 'selected' : ''}>Lunas</option>
              <option value="belum_lunas" ${stateLaporan.filterPenjualan.status_bayar === 'belum_lunas' ? 'selected' : ''}>Belum Lunas (Tempo)</option>
              <option value="sebagian" ${stateLaporan.filterPenjualan.status_bayar === 'sebagian' ? 'selected' : ''}>Sebagian</option>
            </select>
            <select id="sel-filter-metode-jual" class="input input-sm">
              <option value="">Semua Metode</option>
              <option value="tunai" ${stateLaporan.filterPenjualan.metode_bayar === 'tunai' ? 'selected' : ''}>Tunai</option>
              <option value="transfer" ${stateLaporan.filterPenjualan.metode_bayar === 'transfer' ? 'selected' : ''}>Transfer</option>
              <option value="qris" ${stateLaporan.filterPenjualan.metode_bayar === 'qris' ? 'selected' : ''}>QRIS</option>
              <option value="deposit" ${stateLaporan.filterPenjualan.metode_bayar === 'deposit' ? 'selected' : ''}>Saldo Titipan</option>
              <option value="tempo" ${stateLaporan.filterPenjualan.metode_bayar === 'tempo' ? 'selected' : ''}>Tempo</option>
              <option value="kombinasi" ${stateLaporan.filterPenjualan.metode_bayar === 'kombinasi' ? 'selected' : ''}>Kombinasi</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table table-card-2col">
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
                  <th class="no-print" style="text-align: center; width: ${canVoid ? '160px' : '100px'};">Aksi</th>
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
                    <td data-label="Metode"><span class="badge badge-info">${escapeHtml(formatLabelMetodeBayar(j.metode_bayar || 'tunai'))}</span></td>
                    <td data-label="Status">
                      ${isVoided ? `
                        <span class="badge badge-danger" title="Transaksi Dibatalkan / Void">Dibatalkan</span>
                      ` : `
                        <span class="badge ${j.status_bayar === 'lunas' ? 'badge-success' : (j.status_bayar === 'tempo' || j.status_bayar === 'belum_lunas' ? 'badge-danger' : 'badge-warning')}">
                          ${escapeHtml(formatLabelStatusBayar(j.status_bayar || 'lunas'))}
                        </span>
                      `}
                    </td>
                    <td class="tabular" style="text-align: right; white-space: nowrap; font-weight: var(--fw-bold); ${isVoided ? 'text-decoration: line-through;' : ''}" data-label="Total Transaksi">${formatRupiah(j.total)}</td>
                    ${isOwner ? `
                      <td class="tabular" style="text-align: right; white-space: nowrap; font-weight: var(--fw-semibold); color: ${isVoided ? 'var(--text-muted)' : 'var(--success)'};" data-label="Laba Kotor">
                        ${isVoided ? '-' : formatRupiah(j.laba_kotor || 0)}
                      </td>
                    ` : ''}
                    <td class="no-print" style="text-align: right;" data-label="Aksi">
                      <div class="table-actions">
                        <button type="button" class="btn btn-sm btn-primary btn-cetak-nota" data-id="${j.id}" title="Cetak Struk Penjualan">
                          ${ICONS.printer}
                          <span>Cetak</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary btn-detail-nota" data-id="${j.id}" title="Lihat Rincian Item">
                          ${ICONS.eye}
                          <span>Rincian</span>
                        </button>
                        ${canVoid && !isVoided ? `
                          <button type="button" class="btn btn-sm btn-outline-danger btn-void-nota" data-id="${j.id}" data-nonota="${escapeHtml(j.no_nota)}" data-total="${formatRupiah(j.total)}" title="Batalkan / Void Transaksi">
                            ${ICONS.trash}
                            <span>Void</span>
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

  // Tombol Cetak Struk Nota Langsung
  $$('.btn-cetak-nota', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      try {
        const res = await kirimRequest('penjualan.detail', { id });
        if (!res || !res.ok) {
          showToast(res ? (res.error || res.message) : 'Gagal mengambil detail nota', 'error');
          return;
        }
        bukaModalPilihanCetakPenjualan(res.data);
      } catch (err) {
        showToast('Gagal memuat detail nota: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

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
            <div style="margin-top: 6px; padding: 8px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--fs-xs); display: flex; align-items: flex-start; gap: 6px;">
              <span class="icon-fit" style="width: 14px; height: 14px; margin-top: 2px;">${ICONS.info}</span>
              <span><strong>Catatan Admin:</strong> Sesuai SOP, Admin hanya dapat membatalkan transaksi hari ini. Untuk transaksi tanggal lampau silakan hubungi Pemilik Toko.</span>
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
              ${(j.void_alasan || j.alasan_void) ? `<div style="margin-top: 2px;"><strong>Alasan:</strong> ${escapeHtml(j.void_alasan || j.alasan_void)}</div>` : ''}
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
              <span class="badge ${j.status_bayar === 'lunas' ? 'badge-success' : (j.status_bayar === 'sebagian' ? 'badge-warning' : 'badge-danger')}">${escapeHtml(formatLabelStatusBayar(j.status_bayar || 'lunas'))}</span>
            `}
          </div>
        </div>

        <div style="font-size: var(--fs-sm); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-2);">
          <div>Kasir: <strong>${escapeHtml(d.kasir?.nama || d.kasir?.username || j.kasir_id || '-')}</strong></div>
          <div>Pelanggan: <strong>${escapeHtml(d.pelanggan?.nama || j.pelanggan_id || 'Pelanggan Umum')}</strong></div>
          <div>Metode Bayar: <strong>${escapeHtml(formatLabelMetodeBayar(j.metode_bayar || 'tunai'))}</strong></div>
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
                  <td data-label="Item Barang">
                    <div class="row-between" style="width: 100%; align-items: center; gap: 8px;">
                      <span style="font-weight: var(--fw-medium);">${escapeHtml(it.nama)}</span>
                      <span style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(it.satuan || '')}</span>
                    </div>
                  </td>
                  <td data-label="Qty" style="text-align: right;">${formatAngka(it.qty)} ${escapeHtml(it.satuan || '')}</td>
                  <td data-label="Harga Satuan" style="text-align: right;">${formatRupiah(it.harga)}</td>
                  <td data-label="Subtotal" style="text-align: right; font-weight: var(--fw-semibold);">${formatRupiah(it.subtotal)}</td>
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
          ${Number(j.ongkir) > 0 ? `
            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-sm); color: var(--primary);">
              <span>Ongkos Kirim:</span><span>+ ${formatRupiah(j.ongkir)}</span>
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
        <div class="cluster" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-primary btn-sm btn-modal-cetak-nota" title="Cetak Struk Penjualan">
            ${ICONS.printer}
            <span>Cetak Struk</span>
          </button>
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

    const btnCetakStruk = modal.el.querySelector('.btn-modal-cetak-nota');
    if (btnCetakStruk) {
      btnCetakStruk.addEventListener('click', () => {
        bukaModalPilihanCetakPenjualan(d);
      });
    }

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
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Pembelian Barang</span>
            <div class="stat-card-icon icon-amber">${ICONS.truck}</div>
          </div>
          <div class="stat-card-value" style="color: var(--warning);">${formatRupiah(r.total_pembelian || 0)}</div>
          <div class="stat-card-desc"><span class="badge badge-warning">${formatAngka(r.total_faktur || 0)} Faktur Masuk</span></div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Telah Dibayar</span>
            <div class="stat-card-icon icon-emerald">${ICONS.check}</div>
          </div>
          <div class="stat-card-value" style="color: var(--success);">${formatRupiah(r.total_terbayar || 0)}</div>
          <div class="stat-card-desc">Pembayaran lunas &amp; cicilan supplier</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Sisa Hutang Faktur</span>
            <div class="stat-card-icon icon-rose">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value" style="color: ${r.total_sisa_hutang > 0 ? 'var(--danger)' : 'var(--text-muted)'};">
            ${formatRupiah(r.total_sisa_hutang || 0)}
          </div>
          <div class="stat-card-desc">${r.total_sisa_hutang > 0 ? 'Tagihan tempo belum lunas' : 'Seluruh faktur periode ini lunas'}</div>
        </div>
      </div>

      <!-- Tabel Faktur Pembelian -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <h3 class="card-title">${ICONS.truck} Daftar Faktur Pembelian Supplier (${items.length} data)</h3>
          <div class="lap-subfilter-bar no-print">
            <select id="sel-filter-bayar-beli" class="input input-sm lap-subfilter-full">
              <option value="">Semua Status</option>
              <option value="lunas" ${stateLaporan.filterPembelian.status_bayar === 'lunas' ? 'selected' : ''}>Lunas</option>
              <option value="sebagian" ${stateLaporan.filterPembelian.status_bayar === 'sebagian' ? 'selected' : ''}>Sebagian (Tempo)</option>
              <option value="hutang" ${stateLaporan.filterPembelian.status_bayar === 'hutang' ? 'selected' : ''}>Belum Dibayar</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table table-card-2col">
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
                  <th class="no-print" style="text-align: right; width: 100px;">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: var(--sp-6);">Tidak ada faktur pembelian sesuai filter</td></tr>
                ` : items.map((pb) => `
                  <tr>
                    <td data-label="No Faktur"><span style="font-family: monospace; font-weight: var(--fw-bold);">${escapeHtml(pb.no_faktur)}</span></td>
                    <td data-label="Ref Supplier"><span style="font-family: monospace; color: var(--text-muted);">${escapeHtml(pb.no_faktur_supplier || '-')}</span></td>
                    <td style="font-size: var(--fs-xs); color: var(--text-muted);" data-label="Tanggal">${formatTanggal(pb.tanggal)}</td>
                    <td style="font-weight: var(--fw-medium);" data-label="Supplier">${escapeHtml(pb.supplier_nama)}</td>
                    <td data-label="Status">
                      <span class="badge ${pb.status_bayar === 'lunas' ? 'badge-success' : (pb.status_bayar === 'sebagian' ? 'badge-warning' : 'badge-danger')}">
                        ${escapeHtml(formatLabelStatusBayar(pb.status_bayar))}
                      </span>
                    </td>
                    <td class="tabular" style="text-align: right; white-space: nowrap; font-weight: var(--fw-bold);" data-label="Total Nilai">${formatRupiah(pb.total)}</td>
                    <td class="tabular" style="text-align: right; white-space: nowrap; color: var(--success);" data-label="Dibayar">${formatRupiah(pb.bayar)}</td>
                    <td class="tabular" style="text-align: right; white-space: nowrap; font-weight: var(--fw-bold); color: ${pb.sisa_hutang > 0 ? 'var(--danger)' : 'var(--text-muted)'};" data-label="Sisa Hutang">
                      ${formatRupiah(pb.sisa_hutang)}
                    </td>
                    <td class="no-print" style="text-align: right;" data-label="Aksi">
                      <div class="table-actions">
                        <button type="button" class="btn btn-sm btn-primary btn-cetak-laporan-beli" data-id="${pb.id}" title="Cetak Struk Faktur">
                          ${ICONS.printer}
                          <span>Cetak</span>
                        </button>
                      </div>
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

  // Tombol Cetak Faktur Pembelian Langsung
  $$('.btn-cetak-laporan-beli', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      try {
        const res = await kirimRequest('pembelian.detail', { id });
        if (!res || !res.ok) {
          showToast(res ? (res.error || res.message) : 'Gagal memuat rincian faktur pembelian', 'error');
          return;
        }
        bukaModalPilihanCetakPembelian(res.data);
      } catch (err) {
        showToast('Gagal memuat faktur pembelian: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

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
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Arus Kas Masuk</span>
            <div class="stat-card-icon icon-emerald">${ICONS.arrowDownLeft}</div>
          </div>
          <div class="stat-card-value" style="color: var(--success);">${formatRupiah(r.total_kas_masuk || 0)}</div>
          <div class="stat-card-desc">Penjualan bersih &amp; pelunasan piutang</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Arus Kas Keluar</span>
            <div class="stat-card-icon icon-rose">${ICONS.arrowUpRight}</div>
          </div>
          <div class="stat-card-value" style="color: var(--danger);">${formatRupiah(r.total_kas_keluar || 0)}</div>
          <div class="stat-card-desc">Pembelian, hutang, refund &amp; biaya</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Arus Kas Bersih (Net Flow)</span>
            <div class="stat-card-icon icon-blue">${ICONS.chart}</div>
          </div>
          <div class="stat-card-value" style="color: ${r.arus_kas_bersih >= 0 ? 'var(--primary)' : 'var(--danger)'};">
            ${formatRupiah(r.arus_kas_bersih || 0)}
          </div>
          <div class="stat-card-desc">Selisih kas masuk dikurangi kas keluar</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Kas Fisik Kasir (Tunai)</span>
            <div class="stat-card-icon icon-amber">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value" style="color: var(--text-main);">${formatRupiah(r.saldo_tunai_kasir || 0)}</div>
          <div class="stat-card-desc"><span class="badge badge-info">Tunai di Laci Kasir</span></div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Bank &amp; QRIS (Non-Tunai)</span>
            <div class="stat-card-icon icon-purple">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value" style="color: var(--text-main);">${formatRupiah(r.saldo_bank_non_tunai || 0)}</div>
          <div class="stat-card-desc"><span class="badge badge-info">Rekening Toko</span></div>
        </div>
      </div>

      <!-- Detail Rincian Kas Masuk & Kas Keluar -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));">
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
                  ${(masuk.deposit_masuk_tunai || 0) > 0 ? `
                    <tr>
                      <td>Titipan / Deposit Pelanggan (Tunai)</td>
                      <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah(masuk.deposit_masuk_tunai)}</td>
                    </tr>
                  ` : ''}
                  ${(masuk.deposit_masuk_bank || 0) > 0 ? `
                    <tr>
                      <td>Titipan / Deposit Pelanggan (Transfer / QRIS)</td>
                      <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--success);">${formatRupiah(masuk.deposit_masuk_bank)}</td>
                    </tr>
                  ` : ''}
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
                  <tr>
                    <td>Biaya Operasional Toko (Tunai Kasir / Toko)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.biaya_operasional_tunai || 0)}</td>
                  </tr>
                  <tr>
                    <td>Biaya Operasional Toko (Transfer Bank)</td>
                    <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.biaya_operasional_bank || 0)}</td>
                  </tr>
                  ${(keluar.deposit_tarik_tunai || 0) > 0 ? `
                    <tr>
                      <td>Pengembalian Saldo Titipan Pelanggan (Tunai)</td>
                      <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.deposit_tarik_tunai)}</td>
                    </tr>
                  ` : ''}
                  ${(keluar.deposit_tarik_bank || 0) > 0 ? `
                    <tr>
                      <td>Pengembalian Saldo Titipan Pelanggan (Transfer)</td>
                      <td style="text-align: right; font-weight: var(--fw-semibold); color: var(--danger);">${formatRupiah(keluar.deposit_tarik_bank)}</td>
                    </tr>
                  ` : ''}
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
  const analisisBiaya = data.analisis_biaya || [];

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
            ${Number(r.total_ongkir || 0) > 0 ? `
              <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); color: var(--info);">
                <span>Pendapatan Jasa Kirim (Ongkir):</span>
                <span style="font-weight: var(--fw-semibold);">+ ${formatRupiah(r.total_ongkir || 0)}</span>
              </div>
            ` : ''}
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
            ${Number(r.total_retur_hpp || 0) > 0 ? `
              <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); color: var(--success);">
                <span>Penambah: HPP Barang Retur Kembali ke Stok:</span>
                <span style="font-weight: var(--fw-semibold);">+ ${formatRupiah(r.total_retur_hpp || 0)}</span>
              </div>
            ` : ''}

            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-lg); font-weight: var(--fw-bold); background: var(--bg-surface-variant); padding: var(--sp-3); border-radius: var(--radius-md); margin-top: var(--sp-2);">
              <span>Laba Kotor Bersih Produk:</span>
              <span style="color: var(--success);">${formatRupiah(r.laba_kotor_bersih || 0)} (${r.margin_persen || 0}%)</span>
            </div>

            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-base); color: var(--danger); margin-top: var(--sp-1);">
              <span>Pengurang: Total Biaya Operasional:</span>
              <span style="font-weight: var(--fw-semibold);">- ${formatRupiah(r.total_biaya_operasional || 0)}</span>
            </div>

            <div class="cluster" style="justify-content: space-between; font-size: var(--fs-xl); font-weight: var(--fw-bold); background: var(--primary-soft); border: 2px solid var(--primary); padding: var(--sp-3); border-radius: var(--radius-md); margin-top: var(--sp-2);">
              <span style="color: var(--primary);">LABA BERSIH RIIL TOKO:</span>
              <span style="color: ${(r.laba_bersih_riil || 0) >= 0 ? 'var(--primary)' : 'var(--danger)'};">${formatRupiah(r.laba_bersih_riil || 0)} (${r.margin_bersih_persen || 0}%)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid 2 Kolom Penuh Lebar (50/50 Desktop, 1 Kolom Mobile): Kategori Produk & Biaya Operasional -->
      <div class="lap-grid-2col">
        <!-- Laba & Margin per Kategori -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${ICONS.tag} Analisis Laba & Margin per Kategori</h3>
          </div>
          <div class="card-body card-table-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Kategori Material</th>
                    <th style="text-align: right; white-space: nowrap;">Omset</th>
                    <th style="text-align: right; white-space: nowrap;">Laba Kotor</th>
                    <th style="text-align: right; white-space: nowrap;">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  ${kategoriList.length === 0 ? `
                    <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada data kategori</td></tr>
                  ` : kategoriList.map((k) => `
                    <tr>
                      <td data-label="Kategori Material" style="font-weight: var(--fw-medium);">${escapeHtml(k.kategori)}</td>
                      <td class="tabular" data-label="Omset" style="text-align: right; white-space: nowrap;">${formatRupiah(k.omset)}</td>
                      <td class="tabular" data-label="Laba Kotor" style="text-align: right; white-space: nowrap; font-weight: var(--fw-bold); color: var(--success);">${formatRupiah(k.laba)}</td>
                      <td data-label="Margin" style="text-align: right; white-space: nowrap;"><span class="badge badge-success">${k.margin_persen}%</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Rincian Pengeluaran Biaya Operasional -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title" style="color: var(--danger);">${ICONS.calculator} Rincian Biaya Operasional per Kategori</h3>
          </div>
          <div class="card-body card-table-body" style="padding: 0;">
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Kategori Pengeluaran</th>
                    <th style="text-align: right; white-space: nowrap;">Total Biaya</th>
                    <th style="text-align: right; white-space: nowrap;">Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  ${analisisBiaya.length === 0 ? `
                    <tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada pengeluaran operasional</td></tr>
                  ` : analisisBiaya.map((b) => `
                    <tr>
                      <td data-label="Kategori Pengeluaran" style="font-weight: var(--fw-medium);">${escapeHtml(b.kategori)}</td>
                      <td class="tabular" data-label="Total Biaya" style="text-align: right; white-space: nowrap; font-weight: var(--fw-bold); color: var(--danger);">${formatRupiah(b.nominal)}</td>
                      <td data-label="Porsi" style="text-align: right; white-space: nowrap;"><span class="badge badge-secondary">${b.persen}%</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- 10 Produk Kontribusi Laba Tertinggi (Penuh Lebar) -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${ICONS.award} 10 Produk Penyumbang Laba Terbesar</h3>
        </div>
        <div class="card-body card-table-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Produk Material</th>
                  <th style="text-align: right; white-space: nowrap;">Qty</th>
                  <th style="text-align: right; white-space: nowrap;">Total Laba</th>
                  <th style="text-align: right; white-space: nowrap;">Margin</th>
                </tr>
              </thead>
              <tbody>
                ${produkMargin.length === 0 ? `
                  <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: var(--sp-4);">Belum ada data produk</td></tr>
                ` : produkMargin.map((p) => `
                  <tr>
                    <td data-label="Produk Material" style="font-weight: var(--fw-medium);">${escapeHtml(p.nama)}</td>
                    <td class="tabular" data-label="Qty Terjual" style="text-align: right; white-space: nowrap;">${formatAngka(p.qty)}</td>
                    <td class="tabular" data-label="Total Laba" style="text-align: right; white-space: nowrap; font-weight: var(--fw-bold); color: var(--success);">${formatRupiah(p.laba)}</td>
                    <td data-label="Margin" style="text-align: right; white-space: nowrap;"><span class="badge badge-info">${p.margin_persen}%</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
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
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Jenis Item Aktif</span>
            <div class="stat-card-icon icon-blue">${ICONS.box}</div>
          </div>
          <div class="stat-card-value" style="color: var(--primary);">${formatAngka(r.total_item || 0)}</div>
          <div class="stat-card-desc">Produk &amp; varian terdaftar aktif</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Kuantitas Fisik</span>
            <div class="stat-card-icon icon-purple">${ICONS.package}</div>
          </div>
          <div class="stat-card-value" style="color: var(--info);">${formatAngka(r.total_unit_stok || 0)} Unit</div>
          <div class="stat-card-desc">Akumulasi seluruh satuan dasar</div>
        </div>
        ${isOwner ? `
          <div class="stat-card-pro">
            <div class="stat-card-header">
              <span class="stat-card-title">Estimasi Nilai Modal Aset</span>
              <div class="stat-card-icon icon-emerald">${ICONS.award}</div>
            </div>
            <div class="stat-card-value" style="color: var(--success);">${formatRupiah(r.total_nilai_aset || 0)}</div>
            <div class="stat-card-desc"><span class="badge badge-success">Valuasi HPP Berjalan</span></div>
          </div>
        ` : ''}
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Stok Kosong / Habis</span>
            <div class="stat-card-icon icon-rose">${ICONS.alertTriangle}</div>
          </div>
          <div class="stat-card-value" style="color: ${r.total_habis > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatAngka(r.total_habis || 0)}</div>
          <div class="stat-card-desc"><span class="badge ${r.total_habis > 0 ? 'badge-danger' : 'badge-success'}">${r.total_habis > 0 ? 'Perlu Restock' : 'Aman'}</span></div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Stok Menipis (Kritis)</span>
            <div class="stat-card-icon icon-amber">${ICONS.alertTriangle}</div>
          </div>
          <div class="stat-card-value" style="color: ${r.total_kritis > 0 ? 'var(--warning)' : 'var(--text-muted)'};">${formatAngka(r.total_kritis || 0)}</div>
          <div class="stat-card-desc">Stok di bawah batas minimum</div>
        </div>
      </div>

      <!-- Tabel Daftar Valuasi Stok -->
      <div class="card">
        <div class="card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <h3 class="card-title">${ICONS.box} Daftar Persediaan Barang & Nilai Aset (${items.length} item)</h3>
          <div class="lap-subfilter-bar no-print">
            <input type="text" id="inp-cari-stok" class="input input-sm" placeholder="Cari nama / SKU..." value="${escapeHtml(stateLaporan.filterStok.q || '')}">
            <select id="sel-status-stok" class="input input-sm lap-subfilter-full">
              <option value="semua" ${stateLaporan.filterStok.status_stok === 'semua' ? 'selected' : ''}>Semua Status</option>
              <option value="kritis" ${stateLaporan.filterStok.status_stok === 'kritis' ? 'selected' : ''}>Kritis (Menipis)</option>
              <option value="habis" ${stateLaporan.filterStok.status_stok === 'habis' ? 'selected' : ''}>Habis (0)</option>
              <option value="aman" ${stateLaporan.filterStok.status_stok === 'aman' ? 'selected' : ''}>Aman</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          <div class="table-wrap">
            <table class="table table-card-2col">
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
                      <div class="cell-stack">
                        <div style="font-family: monospace; font-weight: var(--fw-medium);">${escapeHtml(it.sku || '-')}</div>
                        ${it.barcode ? `<div style="font-size: var(--fs-xs); color: var(--text-muted);">${escapeHtml(it.barcode)}</div>` : ''}
                      </div>
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
  } else if (tab === 'shift') {
    const data = stateLaporan.dataShift;
    if (!data || !data.items || data.items.length === 0) {
      showToast('Belum ada data shift kasir untuk diekspor.', 'warning');
      return;
    }
    const headers = ['No Shift', 'Kasir', 'Waktu Buka', 'Waktu Tutup', 'Status', 'Modal Awal', 'Jumlah Nota', 'Omset Shift', 'Kas Sistem', 'Kas Fisik', 'Selisih', 'Catatan Tutup'];
    const rows = data.items.map((sh) => [
      sh.no_shift,
      sh.kasir_nama,
      sh.waktu_buka,
      sh.waktu_tutup || '-',
      sh.status,
      sh.modal_awal || 0,
      sh.total_transaksi || 0,
      sh.total_penjualan || 0,
      sh.kas_sistem || 0,
      sh.status === 'ditutup' ? (sh.kas_fisik || 0) : '',
      sh.status === 'ditutup' ? (sh.selisih || 0) : '',
      sh.catatan_tutup || ''
    ]);
    unduhCsv(`laporan_shift_kasir_${tglStr}.csv`, headers, rows);
  }
}

/* ========================================================================== */
/* 7. RENDER TAB: RIWAYAT & AUDIT SHIFT KASIR (Z-REPORT)                      */
/* ========================================================================== */
function renderTabShiftKasir(container, data, rootContainer) {
  const r = (data && data.ringkasan) || {};
  const items = (data && Array.isArray(data.items)) ? data.items : [];
  const totalSelisih = Number(r.total_selisih || 0);
  const warnaSelisih = totalSelisih === 0 ? 'var(--success)' : (totalSelisih > 0 ? 'var(--info)' : 'var(--danger)');
  const iconClsSelisih = totalSelisih === 0 ? 'icon-emerald' : (totalSelisih > 0 ? 'icon-blue' : 'icon-rose');
  const teksSelisihTotal = totalSelisih === 0
    ? 'Rp 0 (Pas)'
    : (totalSelisih > 0 ? `+${formatRupiah(totalSelisih)}` : `-${formatRupiah(Math.abs(totalSelisih))}`);

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <div class="card-grid stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Shift Kasir</span>
            <div class="stat-card-icon icon-blue">${ICONS.cashier}</div>
          </div>
          <div class="stat-card-value mono">${formatAngka(r.total_shift || 0)} Shift</div>
          <div class="stat-card-desc">${r.shift_aktif || 0} aktif • ${r.shift_ditutup || 0} ditutup</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Omset Shift</span>
            <div class="stat-card-icon icon-purple">${ICONS.chart}</div>
          </div>
          <div class="stat-card-value mono" style="color: var(--primary);">${formatRupiah(r.total_omset || 0)}</div>
          <div class="stat-card-desc">Akumulasi penjualan shift</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Kas Fisik Disetor</span>
            <div class="stat-card-icon icon-emerald">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value mono">${formatRupiah(r.total_kas_fisik || 0)}</div>
          <div class="stat-card-desc">Dari ${r.shift_ditutup || 0} shift ditutup</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Selisih Laci</span>
            <div class="stat-card-icon ${iconClsSelisih}">${ICONS.checkCircle}</div>
          </div>
          <div class="stat-card-value mono" style="color: ${warnaSelisih};">${teksSelisihTotal}</div>
          <div class="stat-card-desc">${r.jumlah_pas || 0} pas • ${r.jumlah_lebih || 0} lebih • ${r.jumlah_kurang || 0} kurang</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--sp-3);">
          <div>
            <h3 class="card-title" style="margin: 0;">${ICONS.cashier} Audit &amp; Riwayat Shift Kasir</h3>
            <p class="text-xs text-muted" style="margin: 2px 0 0;">Pantau modal awal, kas sistem, uang fisik disetor, dan selisih laci</p>
          </div>
          <div class="card-filter-inline no-print">
            <select id="sel-filter-status-shift" class="select select-sm">
              <option value="semua" ${stateLaporan.filterShift.status === 'semua' ? 'selected' : ''}>Semua Status</option>
              <option value="aktif" ${stateLaporan.filterShift.status === 'aktif' ? 'selected' : ''}>Shift Aktif</option>
              <option value="ditutup" ${stateLaporan.filterShift.status === 'ditutup' ? 'selected' : ''}>Sudah Ditutup</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-csv-shift" style="display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;">
              ${ICONS.download}
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          ${items.length === 0 ? `
            <div class="empty-state" style="padding: var(--sp-6);">
              ${ICONS.cashier}
              <p class="text-muted text-sm">Belum ada catatan buka/tutup shift pada periode ini.</p>
            </div>
          ` : `
            <div class="table-wrap">
              <table class="table table-card-2col">
                <thead>
                  <tr>
                    <th>No. Shift</th>
                    <th>Kasir</th>
                    <th>Waktu Shift</th>
                    <th class="text-right">Modal Awal</th>
                    <th class="text-right">Kas Sistem</th>
                    <th class="text-right">Kas Fisik</th>
                    <th class="text-right">Selisih</th>
                    <th>Status</th>
                    <th class="text-right no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((sh) => {
                    const isAktif = sh.status === 'aktif';
                    const sel = Number(sh.selisih || 0);
                    const badgeSelisih = isAktif
                      ? '<span class="text-muted text-xs">Berjalan</span>'
                      : (sel === 0
                        ? '<span class="badge badge-success mono">PAS Rp 0</span>'
                        : (sel > 0
                          ? `<span class="badge badge-info mono">+${formatRupiah(sel)}</span>`
                          : `<span class="badge badge-danger mono">-${formatRupiah(Math.abs(sel))}</span>`));
                    return `
                      <tr>
                        <td data-label="No. Shift">
                          <div class="cell-stack">
                            <div class="fw-bold mono text-sm">${escapeHtml(sh.no_shift)}</div>
                            <div class="text-xs text-muted">${sh.total_transaksi || 0} nota • Omset ${formatRupiah(sh.total_penjualan || 0)}</div>
                          </div>
                        </td>
                        <td data-label="Kasir">
                          <div class="cell-stack">
                            <div class="fw-semibold">${escapeHtml(sh.kasir_nama || '-')}</div>
                            ${sh.catatan_tutup ? `<div class="text-xs text-muted">${escapeHtml(sh.catatan_tutup)}</div>` : ''}
                          </div>
                        </td>
                        <td data-label="Waktu Shift">
                          <div class="cell-stack">
                            <div class="text-xs mono">Buka: ${escapeHtml(formatTanggal(sh.waktu_buka, true))}</div>
                            <div class="text-xs mono text-muted">Tutup: ${sh.waktu_tutup ? escapeHtml(formatTanggal(sh.waktu_tutup, true)) : '-'}</div>
                          </div>
                        </td>
                        <td data-label="Modal Awal" class="text-right mono">${formatRupiah(sh.modal_awal || 0)}</td>
                        <td data-label="Kas Sistem" class="text-right mono fw-semibold">${formatRupiah(sh.kas_sistem || 0)}</td>
                        <td data-label="Kas Fisik" class="text-right mono fw-semibold">${isAktif ? '-' : formatRupiah(sh.kas_fisik || 0)}</td>
                        <td data-label="Selisih" class="text-right">${badgeSelisih}</td>
                        <td data-label="Status">
                          ${isAktif
                            ? '<span class="badge badge-warning">Aktif</span>'
                            : '<span class="badge badge-secondary">Ditutup</span>'}
                        </td>
                        <td data-label="Aksi" class="text-right no-print">
                          <div class="table-actions">
                            <button type="button" class="btn btn-secondary btn-sm btn-cetak-shift-lap" data-id="${escapeHtml(sh.id)}" title="Cetak Rekap Shift">
                              ${ICONS.printer}
                              <span>${isAktif ? 'Cetak X' : 'Cetak Z'}</span>
                            </button>
                            ${isAktif ? `
                              <button type="button" class="btn btn-primary btn-sm btn-tutup-paksa-shift" data-id="${escapeHtml(sh.id)}" title="Tutup Shift Kasir Ini">
                                Tutup Shift
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
          `}
        </div>
      </div>
    </div>
  `;

  $('#sel-filter-status-shift', container)?.addEventListener('change', (e) => {
    stateLaporan.filterShift.status = e.target.value;
    muatDataTabAktif(rootContainer);
  });

  $('#btn-csv-shift', container)?.addEventListener('click', () => jalankanEksporCsv());

  $$('.btn-cetak-shift-lap', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const sh = items.find((x) => x.id === id);
      if (sh) {
        bukaModalPilihanCetakShift({
          ...sh,
          kasir: { id: sh.kasir_id, nama: sh.kasir_nama },
          tipe_laporan: sh.status === 'ditutup' ? 'Z-REPORT' : 'X-REPORT'
        });
      }
    });
  });

  $$('.btn-tutup-paksa-shift', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const sh = items.find((x) => x.id === id);
      if (sh) bukaModalTutupShiftAdmin(sh, rootContainer);
    });
  });
}

function bukaModalTutupShiftAdmin(sh, rootContainer) {
  const kasSistem = Math.round(Number(sh.kas_sistem || 0));
  const modal = showModal({
    title: `Tutup Shift ${sh.no_shift}`,
    size: 'sm',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3);">
          <div class="text-xs text-muted">Kasir: <strong>${escapeHtml(sh.kasir_nama || '-')}</strong></div>
          <div class="text-xs text-muted">Waktu Buka: ${escapeHtml(formatTanggal(sh.waktu_buka, true))}</div>
          <div class="fw-bold mono" style="color: var(--primary); margin-top: 4px;">Kas Sistem: ${formatRupiah(kasSistem)}</div>
        </div>
        <div>
          <label class="form-label required text-xs fw-bold" for="inp-admin-kas-fisik">Uang Fisik di Laci (Rp)</label>
          <input type="text" inputmode="numeric" id="inp-admin-kas-fisik" class="input fw-bold mono" value="${formatRupiah(kasSistem).replace('Rp ', '')}" autocomplete="off" />
        </div>
        <div>
          <label class="form-label text-xs fw-semibold" for="inp-admin-catatan-shift">Catatan Tutup Shift</label>
          <textarea id="inp-admin-catatan-shift" class="input" rows="2" placeholder="Wajib diisi bila terdapat selisih kas..."></textarea>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-tutup-admin">Batal</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-simpan-tutup-admin">Tutup Shift</button>
      </div>
    `
  });

  const inpFisik = modal.el.querySelector('#inp-admin-kas-fisik');
  inpFisik?.addEventListener('input', () => {
    const raw = inpFisik.value.replace(/[^\d]/g, '');
    inpFisik.value = raw ? formatRupiah(parseInt(raw, 10)).replace('Rp ', '') : '';
  });

  modal.el.querySelector('#btn-batal-tutup-admin')?.addEventListener('click', () => modal.close());

  const btnSimpan = modal.el.querySelector('#btn-simpan-tutup-admin');
  btnSimpan?.addEventListener('click', async () => {
    const rawStr = (inpFisik?.value || '').replace(/[^\d]/g, '');
    if (!rawStr) {
      showToast('Uang fisik di laci wajib diisi.', 'warning');
      return;
    }
    const kasFisik = parseInt(rawStr, 10);
    const catatan = (modal.el.querySelector('#inp-admin-catatan-shift')?.value || '').trim();
    const sel = kasFisik - kasSistem;
    if (sel !== 0 && !catatan) {
      showToast('Terdapat selisih kas. Catatan wajib diisi.', 'warning');
      return;
    }
    const ok = await showConfirm({
      title: 'Konfirmasi Tutup Shift',
      message: `Tutup shift ${sh.no_shift} milik ${sh.kasir_nama} dengan kas fisik ${formatRupiah(kasFisik)}?`,
      confirmText: 'Ya, Tutup',
      danger: sel < 0
    });
    if (!ok) return;

    btnSimpan.disabled = true;
    btnSimpan.textContent = 'Menyimpan...';
    try {
      const res = await kirimRequest('shift.tutup', { id: sh.id, kas_fisik: kasFisik, catatan });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Gagal menutup shift');
      showToast(res.data?.pesan || 'Shift berhasil ditutup!', 'success');
      modal.close();
      muatDataTabAktif(rootContainer);
      if (res.data && res.data.ringkasan) {
        bukaModalPilihanCetakShift(res.data.ringkasan);
      }
    } catch (err) {
      showToast(err.message || 'Gagal menutup shift', 'error');
      btnSimpan.disabled = false;
      btnSimpan.textContent = 'Tutup Shift';
    }
  });
}

/* ========================================================================== */
/* 8. RENDER TAB: ANTREAN PENGIRIMAN, SURAT JALAN & KIRIM BERTAHAP            */
/* ========================================================================== */
function renderTabPengiriman(container, data, rootContainer) {
  const r = (data && data.ringkasan) || {};
  const items = (data && Array.isArray(data.items)) ? data.items : [];

  const badgeStatusAntar = (st) => {
    if (st === 'belum_dikirim') return '<span class="badge badge-warning">Menunggu Kirim</span>';
    if (st === 'diantar') return '<span class="badge badge-info">Sedang Diantar</span>';
    if (st === 'sebagian') return '<span class="badge badge-primary">Kirim Sebagian</span>';
    if (st === 'selesai') return '<span class="badge badge-success">Selesai</span>';
    return `<span class="badge badge-secondary">${escapeHtml(st || '-')}</span>`;
  };

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <div class="card-grid stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Menunggu Kirim</span>
            <div class="stat-card-icon icon-amber">${ICONS.package}</div>
          </div>
          <div class="stat-card-value mono" style="color: var(--warning);">${formatAngka(r.belum_dikirim || 0)} Nota</div>
          <div class="stat-card-desc">Siap muat &amp; Surat Jalan</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Sedang Diantar</span>
            <div class="stat-card-icon icon-blue">${ICONS.truck}</div>
          </div>
          <div class="stat-card-value mono" style="color: var(--info);">${formatAngka(r.diantar || 0)} Nota</div>
          <div class="stat-card-desc">Dalam perjalanan proyek</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Kirim Sebagian</span>
            <div class="stat-card-icon icon-purple">${ICONS.clipboard}</div>
          </div>
          <div class="stat-card-value mono" style="color: var(--primary);">${formatAngka(r.sebagian || 0)} Nota</div>
          <div class="stat-card-desc">Bon barang / sisa antar</div>
        </div>

        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Selesai Diterima</span>
            <div class="stat-card-icon icon-emerald">${ICONS.checkCircle}</div>
          </div>
          <div class="stat-card-value mono" style="color: var(--success);">${formatAngka(r.selesai || 0)} Nota</div>
          <div class="stat-card-desc">Total ${formatAngka(r.total_antrean || 0)} pengiriman</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--sp-3);">
          <div>
            <h3 class="card-title" style="margin: 0;">${ICONS.truck} Antrean Pengiriman &amp; Surat Jalan</h3>
            <p class="text-xs text-muted" style="margin: 2px 0 0;">Cetak Surat Jalan tanpa harga, Faktur Besar A5, &amp; kirim bertahap</p>
          </div>
          <div class="card-filter-inline no-print">
            <select id="sel-filter-status-antar" class="select select-sm">
              <option value="semua" ${stateLaporan.filterPengiriman.status_antar === 'semua' ? 'selected' : ''}>Semua Status</option>
              <option value="belum_dikirim" ${stateLaporan.filterPengiriman.status_antar === 'belum_dikirim' ? 'selected' : ''}>Menunggu Kirim</option>
              <option value="diantar" ${stateLaporan.filterPengiriman.status_antar === 'diantar' ? 'selected' : ''}>Sedang Diantar</option>
              <option value="sebagian" ${stateLaporan.filterPengiriman.status_antar === 'sebagian' ? 'selected' : ''}>Kirim Sebagian (Bon)</option>
              <option value="selesai" ${stateLaporan.filterPengiriman.status_antar === 'selesai' ? 'selected' : ''}>Selesai</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding: 0;">
          ${items.length === 0 ? `
            <div class="empty-state" style="padding: var(--sp-6);">
              ${ICONS.truck}
              <p class="text-muted text-sm">Belum ada antrean pengiriman pada periode dan filter ini.</p>
            </div>
          ` : `
            <div class="table-wrap">
              <table class="table table-card-2col">
                <thead>
                  <tr>
                    <th>No. Nota</th>
                    <th>Pelanggan &amp; Alamat</th>
                    <th>Muatan Barang</th>
                    <th>Status</th>
                    <th class="text-right no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((k) => {
                    const semuaIt = k.items || [];
                    const itBelumKirim = semuaIt.filter((it) => Number(it.sisa_kirim || 0) > 0);
                    const jmlSudahBawa = semuaIt.length - itBelumKirim.length;
                    const sumberTampil = itBelumKirim.length > 0 ? itBelumKirim : semuaIt;
                    const ringkasItem = sumberTampil.slice(0, 2).map((it) => {
                      const qShow = itBelumKirim.length > 0 ? it.sisa_kirim : it.qty;
                      return `${escapeHtml(it.nama)} (${formatQty(qShow)} ${escapeHtml(it.satuan || '')})`;
                    }).join(', ');
                    const ekstraItem = sumberTampil.length > 2 ? ` +${sumberTampil.length - 2} lainnya` : '';
                    return `
                      <tr>
                        <td data-label="No. Nota">
                          <div class="cell-stack">
                            <div class="fw-bold mono text-sm">${escapeHtml(k.no_nota)}</div>
                            <div class="text-xs text-muted">${escapeHtml(formatTanggal(k.tanggal, true))}</div>
                          </div>
                        </td>
                        <td data-label="Pelanggan & Alamat">
                          <div class="cell-stack">
                            <div class="fw-semibold">${escapeHtml(k.pelanggan_nama || 'Umum')}${k.pelanggan_hp ? ` <span class="text-xs text-muted mono">(${escapeHtml(k.pelanggan_hp)})</span>` : ''}</div>
                            <div class="text-xs text-muted">${escapeHtml(k.alamat_kirim || '-')}</div>
                          </div>
                        </td>
                        <td data-label="Muatan Barang">
                          <div class="cell-stack">
                            <div class="text-xs">${ringkasItem}${ekstraItem}</div>
                            ${k.total_qty_sisa > 0 ? `<div class="text-xs fw-semibold text-warning">Sisa kirim: ${formatQty(k.total_qty_sisa)} unit${jmlSudahBawa > 0 ? ` (${jmlSudahBawa} item sudah dibawa)` : ''}</div>` : ''}
                          </div>
                        </td>
                        <td data-label="Status">
                          ${badgeStatusAntar(k.status_antar)}
                        </td>
                        <td data-label="Aksi" class="text-right no-print">
                          <div class="table-actions">
                            <button type="button" class="btn btn-secondary btn-sm btn-sj-antrean" data-id="${escapeHtml(k.id)}" title="Cetak Surat Jalan (Tanpa Harga)">
                              ${ICONS.truck}
                              <span>Surat Jalan</span>
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm btn-faktur-antrean" data-id="${escapeHtml(k.id)}" title="Cetak Faktur Besar A5">
                              ${ICONS.clipboard}
                              <span>Faktur A5</span>
                            </button>
                            <button type="button" class="btn btn-primary btn-sm btn-update-antrean" data-id="${escapeHtml(k.id)}" title="Update Status & Kirim Bertahap">
                              ${ICONS.edit}
                              <span>Update</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  $('#sel-filter-status-antar', container)?.addEventListener('change', (e) => {
    stateLaporan.filterPengiriman.status_antar = e.target.value;
    muatDataTabAktif(rootContainer);
  });

  const ambilDetailDanJalankan = async (id, fn) => {
    try {
      const res = await kirimRequest('penjualan.detail', { id });
      if (!res || !res.ok || !res.data) throw new Error((res && res.error) || 'Gagal memuat detail nota');
      fn(res.data);
    } catch (err) {
      showToast(err.message || 'Gagal memuat detail nota', 'error');
    }
  };

  $$('.btn-sj-antrean', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      ambilDetailDanJalankan(btn.getAttribute('data-id'), (d) => bukaModalCetakSuratJalan(d));
    });
  });

  $$('.btn-faktur-antrean', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      ambilDetailDanJalankan(btn.getAttribute('data-id'), (d) => cetakFakturA5(d));
    });
  });

  $$('.btn-update-antrean', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = items.find((x) => x.id === btn.getAttribute('data-id'));
      if (target) bukaModalUpdatePengiriman(target, rootContainer);
    });
  });
}

function bukaModalUpdatePengiriman(k, rootContainer) {
  const modal = showModal({
    title: `Update Pengiriman — ${k.no_nota}`,
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3); font-size: var(--fs-xs);">
          <div><strong>Pelanggan:</strong> ${escapeHtml(k.pelanggan_nama || 'Umum')}</div>
          <div><strong>Alamat:</strong> ${escapeHtml(k.alamat_kirim || '-')}</div>
        </div>

        <div>
          <label class="form-label required text-xs fw-bold" for="sel-upd-status-antar">Status Pengiriman</label>
          <select id="sel-upd-status-antar" class="select w-full">
            <option value="belum_dikirim" ${k.status_antar === 'belum_dikirim' ? 'selected' : ''}>Menunggu Kirim</option>
            <option value="diantar" ${k.status_antar === 'diantar' ? 'selected' : ''}>Sedang Diantar (Dalam Perjalanan)</option>
            <option value="sebagian" ${k.status_antar === 'sebagian' ? 'selected' : ''}>Kirim Sebagian (Bon Barang / Bertahap)</option>
            <option value="selesai" ${k.status_antar === 'selesai' ? 'selected' : ''}>Selesai Diterima Penuh</option>
          </select>
        </div>

        <div id="box-qty-parsial" class="stack" style="gap: 6px; ${k.status_antar === 'sebagian' ? '' : 'display: none;'}">
          <div class="text-xs fw-bold">Atur Jumlah Barang Sudah Dikirim / Diambil:</div>
          ${(k.items || []).map((it) => `
            <div class="row" style="justify-content: space-between; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 10px;">
              <div style="flex: 1; min-width: 0;">
                <div class="text-xs fw-semibold">${escapeHtml(it.nama)}</div>
                <div class="text-xs text-muted">Pesan: ${formatQty(it.qty)} ${escapeHtml(it.satuan || '')}</div>
              </div>
              <div class="row" style="align-items: center; gap: 4px; flex-shrink: 0;">
                <span class="text-xs text-muted">Dikirim:</span>
                <input type="number" step="any" min="0" max="${it.qty}" class="input input-sm mono inp-qty-dibawa" data-item-id="${escapeHtml(it.id)}" value="${it.qty_dibawa}" style="width: 78px; text-align: right;" />
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-2);">
          <div>
            <label class="form-label text-xs fw-semibold" for="inp-upd-sopir">Nama Sopir / Kurir</label>
            <input type="text" id="inp-upd-sopir" class="input input-sm" placeholder="Opsional" />
          </div>
          <div>
            <label class="form-label text-xs fw-semibold" for="inp-upd-cat-kirim">Catatan Kirim</label>
            <input type="text" id="inp-upd-cat-kirim" class="input input-sm" placeholder="Misal: Diterima mandor" />
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-upd-kirim">Batal</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-simpan-upd-kirim">Simpan Status</button>
      </div>
    `
  });

  const selStatus = modal.el.querySelector('#sel-upd-status-antar');
  const boxParsial = modal.el.querySelector('#box-qty-parsial');
  selStatus?.addEventListener('change', () => {
    if (boxParsial) boxParsial.style.display = selStatus.value === 'sebagian' ? '' : 'none';
  });

  modal.el.querySelector('#btn-batal-upd-kirim')?.addEventListener('click', () => modal.close());

  const btnSimpan = modal.el.querySelector('#btn-simpan-upd-kirim');
  btnSimpan?.addEventListener('click', async () => {
    const statusAntar = selStatus?.value || 'belum_dikirim';
    const sopir = (modal.el.querySelector('#inp-upd-sopir')?.value || '').trim();
    const catatanKirim = (modal.el.querySelector('#inp-upd-cat-kirim')?.value || '').trim();
    const itemsKirim = [];
    if (statusAntar === 'sebagian') {
      modal.el.querySelectorAll('.inp-qty-dibawa').forEach((inp) => {
        itemsKirim.push({
          item_id: inp.getAttribute('data-item-id'),
          qty_dibawa: Number(inp.value || 0)
        });
      });
    }

    btnSimpan.disabled = true;
    btnSimpan.textContent = 'Menyimpan...';
    try {
      const res = await kirimRequest('pengiriman.updateStatus', {
        id: k.id,
        status_antar: statusAntar,
        sopir,
        catatan_kirim: catatanKirim,
        items_kirim: itemsKirim
      });
      if (!res || !res.ok) throw new Error((res && res.error) || 'Gagal memperbarui status pengiriman');
      haptic.success();
      showToast(res.data?.pesan || 'Status pengiriman diperbarui!', 'success');
      modal.close();
      muatDataTabAktif(rootContainer);
    } catch (err) {
      showToast(err.message || 'Gagal memperbarui pengiriman', 'error');
      btnSimpan.disabled = false;
      btnSimpan.textContent = 'Simpan Status';
    }
  });
}

/**
 * TAB 9: TUTUP BUKU BULANAN, KUNCI PERIODE, & EVALUASI ANALISA (MoM + Slow-Moving + PDF A4)
 */
function renderTabTutupBuku(target, data, rootContainer) {
  const user = store.get('user');
  const isOwner = user && user.role === 'owner';
  const r = data?.ringkasan || {};
  const mom = data?.perbandingan_mom || {};
  const terkunci = data?.status_buku === 'terkunci';
  const labelBln = formatLabelBulan(data?.periode);
  const labelLalu = formatLabelBulan(mom.periode_lalu);

  const badgeMoM = (val, invertGood = false) => {
    const n = Number(val || 0);
    const sign = n > 0 ? '+' : '';
    const isGood = invertGood ? n <= 0 : n >= 0;
    const cls = n === 0 ? 'badge-neutral' : (isGood ? 'badge-success' : 'badge-danger');
    return `<span class="badge ${cls} text-xs mono">${sign}${n.toFixed(1)}% vs ${escapeHtml(labelLalu)}</span>`;
  };

  const nowD = new Date();
  const ymIni = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
  const prevD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const ymLalu = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

  target.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Baris Kontrol Periode Bulan & Aksi Tutup Buku -->
      <div class="card card-body stack-sm" style="gap: var(--sp-3);">
        <div class="row-between items-center" style="flex-wrap: wrap; gap: var(--sp-2);">
          <div class="row items-center" style="gap: var(--sp-2); flex-wrap: wrap;">
            <label class="form-label text-xs fw-bold" for="inp-tb-bulan" style="margin: 0;">Pilih Bulan Evaluasi:</label>
            <input type="month" id="inp-tb-bulan" class="input input-sm" value="${escapeHtml(data?.periode || stateLaporan.periodeBulanan)}" style="width: 170px;">
            <button type="button" class="btn btn-xs ${data?.periode === ymIni ? 'btn-primary' : 'btn-secondary'}" id="btn-tb-bulan-ini">Bulan Ini</button>
            <button type="button" class="btn btn-xs ${data?.periode === ymLalu ? 'btn-primary' : 'btn-secondary'}" id="btn-tb-bulan-lalu">Bulan Lalu</button>
            <span class="badge ${terkunci ? 'badge-success' : 'badge-warning'}">${terkunci ? 'Terkunci (Sudah Tutup Buku)' : 'Periode Terbuka'}</span>
          </div>

          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tb-cetak-pdf" style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.printer}
              <span>Laporan PDF A4</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tb-ekspor-excel" style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.fileSpreadsheet}
              <span>Excel Bulanan</span>
            </button>
            ${isOwner ? (terkunci ? `
              <button type="button" class="btn btn-outline-danger btn-sm" id="btn-tb-buka-kunci" style="display: inline-flex; align-items: center; gap: 6px;">
                ${ICONS.rotateCcw}
                <span>Buka Kunci Periode</span>
              </button>
            ` : `
              <button type="button" class="btn btn-primary btn-sm" id="btn-tb-tutup-bulanan" style="display: inline-flex; align-items: center; gap: 6px;">
                ${ICONS.checkCircle}
                <span>Tutup Buku &amp; Kunci ${escapeHtml(labelBln)}</span>
              </button>
            `) : ''}
          </div>
        </div>

        ${r.shift_aktif_count > 0 && !terkunci ? `
          <div class="alert alert-warning text-xs" style="margin: 0;">
            ${ICONS.alertTriangle}
            <div>Masih ada <strong>${r.shift_aktif_count} shift kasir aktif</strong> pada bulan ${escapeHtml(labelBln)}. Tutup semua shift kasir terlebih dahulu sebelum mengunci Tutup Buku Bulanan.</div>
          </div>
        ` : ''}

        ${terkunci && data?.arsip ? `
          <div class="alert alert-success text-xs" style="margin: 0;">
            ${ICONS.checkCircle}
            <div>Periode <strong>${escapeHtml(labelBln)}</strong> telah ditutup buku oleh <strong>${escapeHtml(data.arsip.ditutup_oleh_nama || 'Owner')}</strong> pada ${escapeHtml(formatTanggal(data.arsip.waktu_tutup, true))}. Seluruh transaksi pada bulan ini terkunci untuk menjaga integritas laporan.${data.arsip.catatan ? ` Catatan: <em>${escapeHtml(data.arsip.catatan)}</em>` : ''}</div>
          </div>
        ` : ''}
      </div>

      <!-- KPI Utama + Perbandingan MoM -->
      <div class="card-grid" style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));">
        <div class="stat-card-pro">
          <div class="stat-label">Omset Bersih (${escapeHtml(labelBln)})</div>
          <div class="stat-value mono text-primary">${formatRupiah(r.omset_bersih || 0)}</div>
          <div class="stat-sub">${badgeMoM(mom.omset_persen)} • ${r.total_transaksi || 0} nota</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Laba Kotor &amp; Margin</div>
          <div class="stat-value mono">${formatRupiah(r.laba_kotor || 0)}</div>
          <div class="stat-sub">Margin: <strong>${Number(r.margin_persen || 0).toFixed(1)}%</strong> • ${badgeMoM(mom.laba_kotor_persen)}</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Biaya Operasional</div>
          <div class="stat-value mono text-danger">${formatRupiah(r.total_biaya || 0)}</div>
          <div class="stat-sub">${badgeMoM(mom.biaya_persen, true)}</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Laba Bersih Riil</div>
          <div class="stat-value mono ${Number(r.laba_bersih || 0) >= 0 ? 'text-success' : 'text-danger'}">${formatRupiah(r.laba_bersih || 0)}</div>
          <div class="stat-sub">${badgeMoM(mom.laba_bersih_persen)}</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Arus Kas Bersih</div>
          <div class="stat-value mono">${formatRupiah(r.arus_kas_bersih || 0)}</div>
          <div class="stat-sub">Masuk: ${formatRupiah(r.arus_kas_masuk || 0)} • Keluar: ${formatRupiah(r.arus_kas_keluar || 0)}</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Valuasi Aset Stok</div>
          <div class="stat-value mono">${formatRupiah(r.valuasi_stok || 0)}</div>
          <div class="stat-sub">Pembelian bulan ini: ${formatRupiah(r.total_pembelian || 0)}</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Piutang &amp; Hutang Berjalan</div>
          <div class="stat-value mono">${formatRupiah(r.saldo_piutang || 0)}</div>
          <div class="stat-sub">Piutang • Hutang Supplier: <strong>${formatRupiah(r.saldo_hutang || 0)}</strong></div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-label">Disiplin Shift (${r.total_shift || 0} Shift)</div>
          <div class="stat-value mono ${Number(r.selisih_shift || 0) < 0 ? 'text-danger' : 'text-success'}">${Number(r.selisih_shift || 0) >= 0 ? '+' : ''}${formatRupiah(r.selisih_shift || 0)}</div>
          <div class="stat-sub">Akumulasi selisih fisik laci kasir</div>
        </div>
      </div>

      <!-- Top 10 Produk Terlaris & Performa Kategori -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: var(--sp-4);">
        <div class="card card-body stack-sm">
          <div class="fw-bold text-sm">Top 10 Produk Terlaris (${escapeHtml(labelBln)})</div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Produk</th><th class="text-right">Qty</th><th class="text-right">Omset</th><th class="text-right">Laba</th></tr></thead>
              <tbody>
                ${(data?.top_produk_terlaris || []).length ? data.top_produk_terlaris.map((p) => `
                  <tr>
                    <td data-label="Produk" class="fw-semibold text-xs">${escapeHtml(p.nama)}</td>
                    <td data-label="Qty" class="text-right mono text-xs">${formatQty(p.qty)}</td>
                    <td data-label="Omset" class="text-right mono text-xs">${formatRupiah(p.omset)}</td>
                    <td data-label="Laba" class="text-right mono text-xs text-success">${formatRupiah(p.laba)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" class="text-center text-muted text-xs">Belum ada penjualan pada bulan ini.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card card-body stack-sm">
          <div class="row-between items-center" style="flex-wrap: wrap; gap: 6px;">
            <div class="fw-bold text-sm">Barang Slow-Moving / Dead Stock (0 Terjual)</div>
            <span class="badge badge-warning mono text-xs">${data?.total_slow_moving || 0} item • Modal ${formatRupiah(data?.nilai_slow_moving || 0)}</span>
          </div>
          <div class="text-xs text-muted">Produk aktif yang masih memiliki stok tetapi belum terjual sama sekali di bulan ${escapeHtml(labelBln)} — bahan evaluasi promo/diskon cuci gudang.</div>
          <div class="table-wrap" style="max-height: 310px; overflow-y: auto;">
            <table class="table">
              <thead><tr><th>Produk</th><th class="text-right">Stok</th><th class="text-right">Modal Tertahan</th></tr></thead>
              <tbody>
                ${(data?.slow_moving || []).length ? data.slow_moving.map((d) => `
                  <tr>
                    <td data-label="Produk" class="text-xs"><div class="fw-semibold">${escapeHtml(d.nama)}</div><div class="text-muted mono">${escapeHtml(d.sku)}</div></td>
                    <td data-label="Stok" class="text-right mono text-xs">${formatQty(d.stok)} ${escapeHtml(d.satuan)}</td>
                    <td data-label="Modal Tertahan" class="text-right mono text-xs text-warning fw-bold">${formatRupiah(d.nilai_modal)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="3" class="text-center text-success text-xs">Luar biasa! Semua produk berstok bergerak terjual di bulan ini.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Riwayat Arsip Tutup Buku Multi-Bulan -->
      <div class="card card-body stack-sm">
        <div class="fw-bold text-sm">Arsip Perbandingan Tutup Buku Bulanan (Multi-Bulan)</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Periode</th>
                <th>Status</th>
                <th class="text-right">Nota</th>
                <th class="text-right">Omset Bersih</th>
                <th class="text-right">Laba Kotor</th>
                <th class="text-right">Biaya</th>
                <th class="text-right">Laba Bersih</th>
                <th class="text-right">Selisih Shift</th>
              </tr>
            </thead>
            <tbody>
              ${(data?.riwayat_bulanan || []).length ? data.riwayat_bulanan.map((tb) => `
                <tr>
                  <td data-label="Periode" class="fw-bold mono text-xs">${escapeHtml(formatLabelBulan(tb.periode))}</td>
                  <td data-label="Status"><span class="badge ${tb.status === 'terkunci' ? 'badge-success' : 'badge-warning'} text-xs">${tb.status === 'terkunci' ? 'Terkunci' : 'Dibuka'}</span></td>
                  <td data-label="Nota" class="text-right mono text-xs">${tb.total_transaksi || 0}</td>
                  <td data-label="Omset Bersih" class="text-right mono text-xs">${formatRupiah(tb.omset_bersih || 0)}</td>
                  <td data-label="Laba Kotor" class="text-right mono text-xs">${formatRupiah(tb.laba_kotor || 0)}</td>
                  <td data-label="Biaya" class="text-right mono text-xs text-danger">${formatRupiah(tb.total_biaya || 0)}</td>
                  <td data-label="Laba Bersih" class="text-right mono text-xs fw-bold ${Number(tb.laba_bersih || 0) >= 0 ? 'text-success' : 'text-danger'}">${formatRupiah(tb.laba_bersih || 0)}</td>
                  <td data-label="Selisih Shift" class="text-right mono text-xs">${formatRupiah(tb.selisih_shift || 0)}</td>
                </tr>
              `).join('') : '<tr><td colspan="8" class="text-center text-muted text-xs">Belum ada arsip Tutup Buku Bulanan tersimpan. Klik "Tutup Buku &amp; Kunci" di akhir bulan untuk menyimpan rekam evaluasi permanen.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Event ganti bulan
  const muatBulan = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return;
    stateLaporan.periodeBulanan = ym;
    muatDataTabAktif(rootContainer);
  };
  target.querySelector('#inp-tb-bulan')?.addEventListener('change', (e) => muatBulan(e.target.value));
  target.querySelector('#btn-tb-bulan-ini')?.addEventListener('click', () => muatBulan(ymIni));
  target.querySelector('#btn-tb-bulan-lalu')?.addEventListener('click', () => muatBulan(ymLalu));

  // Event PDF & Excel
  target.querySelector('#btn-tb-cetak-pdf')?.addEventListener('click', () => {
    showToast('Menyiapkan Laporan Evaluasi Bulanan PDF A4...', 'info', 2500);
    cetakLaporanEvaluasiBulananPdf(data);
  });
  target.querySelector('#btn-tb-ekspor-excel')?.addEventListener('click', () => {
    eksporEvaluasiBulananExcel(data);
    showToast(`Workbook Excel Evaluasi ${labelBln} berhasil diunduh!`, 'success');
  });

  // Event Tutup Buku & Kunci Bulanan (Owner)
  target.querySelector('#btn-tb-tutup-bulanan')?.addEventListener('click', () => {
    const mTutup = showModal({
      title: `Tutup Buku & Kunci Periode ${labelBln}`,
      size: 'sm',
      body: `
        <div class="stack-sm">
          <div class="alert alert-warning text-xs" style="margin: 0;">
            ${ICONS.alertTriangle}
            <div>Setelah ditutup buku, seluruh transaksi penjualan, pembelian, void, dan biaya pada bulan <strong>${escapeHtml(labelBln)}</strong> akan <strong>terkunci</strong> agar angka evaluasi tidak berubah. Owner tetap dapat membuka kunci sewaktu-waktu bila ada koreksi darurat.</div>
          </div>
          <div class="detail-kv-card">
            <div class="detail-kv-row"><span class="text-muted">Omset Bersih</span><span class="fw-bold mono">${formatRupiah(r.omset_bersih || 0)}</span></div>
            <div class="detail-kv-row"><span class="text-muted">Laba Bersih Riil</span><span class="fw-bold mono text-success">${formatRupiah(r.laba_bersih || 0)}</span></div>
          </div>
          <div class="field">
            <label class="field-label text-xs" for="inp-cat-tutup-bulanan">Catatan Evaluasi Owner (Opsional)</label>
            <textarea id="inp-cat-tutup-bulanan" class="textarea" rows="2" placeholder="Cth: Target omset tercapai, fokus cuci gudang cat slow-moving bulan depan"></textarea>
          </div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-outline btn-sm btn-cancel">Batal</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-ok-tutup-bulanan">Ya, Tutup &amp; Kunci Bulan Ini</button>
      `
    });
    const btnOk = mTutup.el.querySelector('#btn-ok-tutup-bulanan');
    btnOk?.addEventListener('click', async () => {
      const cat = (mTutup.el.querySelector('#inp-cat-tutup-bulanan')?.value || '').trim();
      btnOk.disabled = true;
      btnOk.textContent = 'Mengunci Periode...';
      try {
        const res = await kirimRequest('tutupBuku.tutupBulanan', { periode: data.periode, catatan: cat });
        if (!res || !res.ok) throw new Error((res && res.error) || 'Gagal menutup buku bulanan');
        haptic.success();
        showToast(res.data?.pesan || `Tutup Buku ${labelBln} berhasil!`, 'success', 4000);
        mTutup.close();
        muatDataTabAktif(rootContainer);
      } catch (err) {
        showToast(err.message, 'error', 4500);
        btnOk.disabled = false;
        btnOk.textContent = 'Ya, Tutup & Kunci Bulan Ini';
      }
    });
  });

  // Event Buka Kunci Periode (Owner)
  target.querySelector('#btn-tb-buka-kunci')?.addEventListener('click', () => {
    const mBuka = showModal({
      title: `Buka Kunci Periode ${labelBln}`,
      size: 'sm',
      body: `
        <div class="stack-sm">
          <div class="text-xs text-muted">Masukkan alasan pembukaan kunci periode <strong>${escapeHtml(labelBln)}</strong> (akan tercatat di Log Audit):</div>
          <div class="field">
            <label class="field-label text-xs" for="inp-alasan-buka-kunci">Alasan Buka Kunci <span class="wajib">*</span></label>
            <input type="text" id="inp-alasan-buka-kunci" class="input" placeholder="Cth: Koreksi input biaya listrik bulan lalu">
          </div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-outline btn-sm btn-cancel">Batal</button>
        <button type="button" class="btn btn-danger btn-sm" id="btn-ok-buka-kunci">Buka Kunci</button>
      `
    });
    const btnOk = mBuka.el.querySelector('#btn-ok-buka-kunci');
    btnOk?.addEventListener('click', async () => {
      const alasan = (mBuka.el.querySelector('#inp-alasan-buka-kunci')?.value || '').trim();
      if (alasan.length < 4) {
        showToast('Alasan pembukaan kunci wajib minimal 4 karakter.', 'warning');
        return;
      }
      btnOk.disabled = true;
      btnOk.textContent = 'Membuka Kunci...';
      try {
        const res = await kirimRequest('tutupBuku.bukaKunci', { periode: data.periode, alasan });
        if (!res || !res.ok) throw new Error((res && res.error) || 'Gagal membuka kunci periode');
        showToast(res.data?.pesan || 'Kunci periode berhasil dibuka!', 'success');
        mBuka.close();
        muatDataTabAktif(rootContainer);
      } catch (err) {
        showToast(err.message, 'error', 4500);
        btnOk.disabled = false;
        btnOk.textContent = 'Buka Kunci';
      }
    });
  });
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

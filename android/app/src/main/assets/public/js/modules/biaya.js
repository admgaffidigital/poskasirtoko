/**
 * biaya.js — Modul Pengeluaran & Biaya Operasional Toko Bangunan
 * Mengelola biaya operasional, kas kecil (petty cash), pemotongan kasir, dan integrasi laba rugi.
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatTanggal, parseRupiah } from '../utils/format.js';

let filterPeriode = '30d';
let filterKategori = '';
let filterSumber = '';
let searchKeyword = '';
let customDari = '';
let customSampai = '';
let cacheDataBiaya = null;

const DAFTAR_KATEGORI = [
  'Transportasi & Pengiriman',
  'Upah Angkut / Kuli Bongkar',
  'Listrik, Air & Internet',
  'Gaji & Uang Makan Karyawan',
  'Sewa Tempat & Bangunan',
  'Pemeliharaan & Servis Kendaraan',
  'Perlengkapan & ATK Kasir',
  'Konsumsi & Dapur Toko',
  'Pajak, Retribusi & Izin',
  'Lain-lain'
];

export async function renderBiayaModule(container) {
  const user = store.get('user') || {};
  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-4);">
      <!-- Header Modul -->
      <div class="page-header">
        <div>
          <h2 style="display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span>Biaya Operasional Toko</span>
          </h2>
          <p>Pencatatan pengeluaran kas operasional, petty cash kasir, transportasi pengiriman, dan biaya rutin</p>
        </div>
        <div class="row" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-refresh-biaya" title="Segarkan Data">
            ${ICONS.rotateCcw}
            <span>Segarkan</span>
          </button>
          <button type="button" class="btn btn-primary" id="btn-tambah-biaya">
            <span>+ Catat Biaya Baru</span>
          </button>
        </div>
      </div>

      <!-- Filter Card -->
      <div class="card card-body stack" style="gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);">
        <!-- Baris 1: Preset Rentang Tanggal -->
        <div class="row" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <div class="row" style="gap: 6px; align-items: center; flex-wrap: wrap;">
            <span class="text-xs text-muted fw-semibold">PERIODE:</span>
            <div class="segmented" id="biaya-preset-group">
              <button type="button" class="btn btn-xs ${filterPeriode === 'today' ? 'active' : ''}" data-p="today">Hari Ini</button>
              <button type="button" class="btn btn-xs ${filterPeriode === '7d' ? 'active' : ''}" data-p="7d">7 Hari</button>
              <button type="button" class="btn btn-xs ${filterPeriode === '30d' ? 'active' : ''}" data-p="30d">30 Hari</button>
              <button type="button" class="btn btn-xs ${filterPeriode === 'bulan_ini' ? 'active' : ''}" data-p="bulan_ini">Bulan Ini</button>
              <button type="button" class="btn btn-xs ${filterPeriode === 'tahun_ini' ? 'active' : ''}" data-p="tahun_ini">Tahun Ini</button>
              <button type="button" class="btn btn-xs ${filterPeriode === 'custom' ? 'active' : ''}" data-p="custom">Kustom</button>
            </div>
          </div>
          <div id="biaya-custom-range" class="row" style="gap: 6px; align-items: center; ${filterPeriode === 'custom' ? '' : 'display: none;'}">
            <input type="date" id="biaya-tgl-dari" class="input input-sm" value="${customDari}" />
            <span class="text-xs text-muted">s/d</span>
            <input type="date" id="biaya-tgl-sampai" class="input input-sm" value="${customSampai}" />
            <button type="button" class="btn btn-secondary btn-sm" id="btn-terapkan-tgl">Terapkan</button>
          </div>
        </div>

        <!-- Baris 2: Filter Dropdown & Search -->
        <div class="row" style="gap: var(--sp-2); align-items: center; flex-wrap: wrap;">
          <div style="min-width: 180px; flex: 1;">
            <select class="input input-sm w-full" id="filter-biaya-kategori">
              <option value="">Semua Kategori Biaya</option>
              ${DAFTAR_KATEGORI.map(k => `<option value="${escapeHtml(k)}" ${filterKategori === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
            </select>
          </div>
          <div style="min-width: 160px;">
            <select class="input input-sm w-full" id="filter-biaya-sumber">
              <option value="">Semua Sumber Dana</option>
              <option value="kas_kasir" ${filterSumber === 'kas_kasir' ? 'selected' : ''}>Kas Kasir (Petty Cash)</option>
              <option value="kas_toko" ${filterSumber === 'kas_toko' ? 'selected' : ''}>Kas Besar Toko</option>
              <option value="bank" ${filterSumber === 'bank' ? 'selected' : ''}>Transfer / Rekening Bank</option>
            </select>
          </div>
          <div style="min-width: 220px; flex: 2;">
            <div class="input-group">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" id="search-biaya" class="input input-sm w-full" placeholder="Cari nomor biaya, keterangan, atau kasir..." value="${escapeHtml(searchKeyword)}" />
            </div>
          </div>
        </div>
      </div>

      <!-- Ringkasan Metrik Finansial -->
      <div id="biaya-cards-container" class="grid grid-4" style="gap: var(--sp-3);">
        <div class="card card-body stat-card" style="border-top: 3px solid var(--danger);">
          <div class="stat-label">TOTAL PENGELUARAN BIAYA</div>
          <div class="stat-value mono text-danger" id="stat-total-biaya">Rp 0</div>
          <div class="stat-sub text-muted" id="stat-count-biaya">0 Transaksi</div>
        </div>
        <div class="card card-body stat-card" style="border-top: 3px solid #F59E0B;">
          <div class="stat-label">KAS KASIR (PETTY CASH)</div>
          <div class="stat-value mono text-warning" id="stat-kasir-biaya">Rp 0</div>
          <div class="stat-sub text-muted">Uang laci kasir</div>
        </div>
        <div class="card card-body stat-card" style="border-top: 3px solid #3B82F6;">
          <div class="stat-label">KAS BESAR TOKO</div>
          <div class="stat-value mono text-primary" id="stat-toko-biaya">Rp 0</div>
          <div class="stat-sub text-muted">Kas operasional toko</div>
        </div>
        <div class="card card-body stat-card" style="border-top: 3px solid #8B5CF6;">
          <div class="stat-label">TRANSFER BANK</div>
          <div class="stat-value mono text-info" id="stat-bank-biaya">Rp 0</div>
          <div class="stat-sub text-muted">Rekening toko</div>
        </div>
      </div>

      <!-- Rincian Kategori Biaya (Bar Ringkasan) -->
      <div id="biaya-breakdown-card" class="card card-body stack" style="gap: var(--sp-2); display: none;">
        <div class="fw-bold text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px;">Komposisi Pengeluaran per Kategori</div>
        <div id="biaya-breakdown-container" class="row" style="gap: 8px; flex-wrap: wrap;"></div>
      </div>

      <!-- Tabel Daftar Pengeluaran -->
      <div class="card">
        <div class="table-container">
          <table class="table" id="tabel-biaya">
            <thead>
              <tr>
                <th>No Transaksi</th>
                <th>Tanggal & Waktu</th>
                <th>Kategori</th>
                <th>Keterangan</th>
                <th>Sumber Dana</th>
                <th class="text-right">Nominal</th>
                <th>Petugas</th>
                <th class="text-center" style="width: 80px;">Aksi</th>
              </tr>
            </thead>
            <tbody id="tbody-biaya">
              <tr>
                <td colspan="8" class="text-center" style="padding: var(--sp-6);">
                  ${renderSkeleton('table', 5)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Bind Events
  const elPresetGroup = container.querySelector('#biaya-preset-group');
  const elCustomRange = container.querySelector('#biaya-custom-range');
  const elTglDari = container.querySelector('#biaya-tgl-dari');
  const elTglSampai = container.querySelector('#biaya-tgl-sampai');
  const elFilterKategori = container.querySelector('#filter-biaya-kategori');
  const elFilterSumber = container.querySelector('#filter-biaya-sumber');
  const elSearch = container.querySelector('#search-biaya');

  elPresetGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-p]');
    if (!btn) return;
    elPresetGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterPeriode = btn.getAttribute('data-p');

    if (filterPeriode === 'custom') {
      elCustomRange.style.display = 'flex';
    } else {
      elCustomRange.style.display = 'none';
      muatDataBiaya();
    }
  });

  container.querySelector('#btn-terapkan-tgl')?.addEventListener('click', () => {
    customDari = elTglDari.value;
    customSampai = elTglSampai.value;
    if (!customDari || !customSampai) {
      showToast('Pilih tanggal dari dan sampai', 'warning');
      return;
    }
    muatDataBiaya();
  });

  elFilterKategori?.addEventListener('change', () => {
    filterKategori = elFilterKategori.value;
    muatDataBiaya();
  });

  elFilterSumber?.addEventListener('change', () => {
    filterSumber = elFilterSumber.value;
    muatDataBiaya();
  });

  let debounceSearch = null;
  elSearch?.addEventListener('input', () => {
    clearTimeout(debounceSearch);
    debounceSearch = setTimeout(() => {
      searchKeyword = elSearch.value.trim();
      muatDataBiaya();
    }, 350);
  });

  container.querySelector('#btn-refresh-biaya')?.addEventListener('click', () => {
    muatDataBiaya();
  });

  container.querySelector('#btn-tambah-biaya')?.addEventListener('click', () => {
    bukaModalTambahBiaya(() => muatDataBiaya());
  });

  // Load awal
  await muatDataBiaya();

  async function muatDataBiaya() {
    const tbody = container.querySelector('#tbody-biaya');
    if (!tbody) return;

    try {
      const payload = {
        periode: filterPeriode,
        dari: filterPeriode === 'custom' ? customDari : undefined,
        sampai: filterPeriode === 'custom' ? customSampai : undefined,
        kategori: filterKategori || undefined,
        sumber_dana: filterSumber || undefined,
        q: searchKeyword || undefined,
        limit: 200
      };

      const res = await apiCall('biaya.list', payload);
      cacheDataBiaya = res;
      renderRingkasan(res.ringkasan || {});
      renderTabel(res.items || []);
    } catch (err) {
      console.error('Gagal memuat data biaya:', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-danger" style="padding: var(--sp-6);">
            Gagal memuat data biaya: ${escapeHtml(err.message || 'Terjadi kesalahan.')}
          </td>
        </tr>
      `;
    }
  }

  function renderRingkasan(ring) {
    const elTotal = container.querySelector('#stat-total-biaya');
    const elCount = container.querySelector('#stat-count-biaya');
    const elKasir = container.querySelector('#stat-kasir-biaya');
    const elToko = container.querySelector('#stat-toko-biaya');
    const elBank = container.querySelector('#stat-bank-biaya');

    if (elTotal) elTotal.textContent = formatRupiah(ring.total_nominal || 0);
    if (elCount) elCount.textContent = `${ring.total_transaksi || 0} Pengeluaran`;
    if (elKasir) elKasir.textContent = formatRupiah(ring.total_kas_kasir || 0);
    if (elToko) elToko.textContent = formatRupiah(ring.total_kas_toko || 0);
    if (elBank) elBank.textContent = formatRupiah(ring.total_bank || 0);

    // Breakdown Kategori
    const bdCard = container.querySelector('#biaya-breakdown-card');
    const bdContainer = container.querySelector('#biaya-breakdown-container');
    if (bdCard && bdContainer) {
      const cats = ring.analisis_kategori || [];
      if (cats.length > 0) {
        bdCard.style.display = 'flex';
        bdContainer.innerHTML = cats.map(c => `
          <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 6px 12px; display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-xs);">
            <span class="fw-semibold">${escapeHtml(c.kategori)}:</span>
            <span class="mono fw-bold text-danger">${formatRupiah(c.nominal)}</span>
            <span class="badge badge-secondary badge-xs">${c.persen}%</span>
          </div>
        `).join('');
      } else {
        bdCard.style.display = 'none';
      }
    }
  }

  function renderTabel(items) {
    const tbody = container.querySelector('#tbody-biaya');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center" style="padding: var(--sp-6);">
            ${renderEmpty('Belum ada transaksi biaya pengeluaran pada periode ini.', '+ Catat Pengeluaran Baru', () => bukaModalTambahBiaya(() => muatDataBiaya()))}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map(item => {
      let badgeSumber = '';
      if (item.sumber_dana === 'kas_kasir') {
        badgeSumber = '<span class="badge badge-warning">Kas Kasir</span>';
      } else if (item.sumber_dana === 'bank') {
        badgeSumber = '<span class="badge badge-info">Transfer Bank</span>';
      } else {
        badgeSumber = '<span class="badge badge-primary">Kas Toko</span>';
      }

      return `
        <tr>
          <td class="mono fw-bold">${escapeHtml(item.no_transaksi)}</td>
          <td class="mono text-xs">${formatTanggal(item.tanggal || item.created_at, true)}</td>
          <td><span class="badge badge-secondary">${escapeHtml(item.kategori)}</span></td>
          <td style="max-width: 280px; word-break: break-word;">
            <div>${escapeHtml(item.keterangan || '-')}</div>
            ${item.bukti_url ? `<a href="${escapeHtml(item.bukti_url)}" target="_blank" class="text-xs text-primary" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">Lihat Bukti Foto</a>` : ''}
          </td>
          <td>${badgeSumber}</td>
          <td class="text-right mono fw-bold text-danger" style="font-size: var(--fs-sm);">${formatRupiah(item.nominal)}</td>
          <td class="text-xs text-muted">${escapeHtml(item.user_nama || '-')}</td>
          <td class="text-center">
            ${isOwnerOrAdmin ? `
              <button type="button" class="btn btn-ghost btn-xs text-danger btn-hapus-biaya" data-id="${item.id}" data-no="${escapeHtml(item.no_transaksi)}" title="Batalkan Biaya">
                ${ICONS.trash}
              </button>
            ` : '<span class="text-muted text-xs">-</span>'}
          </td>
        </tr>
      `;
    }).join('');

    // Bind tombol hapus
    tbody.querySelectorAll('.btn-hapus-biaya').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const no = btn.getAttribute('data-no');
        const konfirmasi = await showConfirm(`Batalkan pengeluaran ${no}? Data yang dibatalkan tidak akan diperhitungkan lagi pada kasir maupun laporan laba rugi.`, 'Batalkan Pengeluaran');
        if (!konfirmasi) return;

        try {
          btn.disabled = true;
          const res = await apiCall('biaya.delete', { id });
          showToast(res.pesan || 'Biaya berhasil dibatalkan.', 'success');
          muatDataBiaya();
        } catch (err) {
          showToast(err.message || 'Gagal membatalkan biaya', 'danger');
          btn.disabled = false;
        }
      });
    });
  }
}

/**
 * Modal Tambah / Catat Pengeluaran Biaya Operasional Toko
 */
export function bukaModalTambahBiaya(onSuccess) {
  const modal = showModal({
    title: '💸 Catat Pengeluaran & Biaya Toko',
    size: 'md',
    body: `
      <form id="form-tambah-biaya" class="stack" style="gap: var(--sp-3);">
        <div class="row" style="gap: var(--sp-3);">
          <div style="flex: 1;">
            <label class="form-label required">Kategori Pengeluaran</label>
            <select name="kategori" id="modal-biaya-kategori" class="select w-full" required>
              ${DAFTAR_KATEGORI.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('')}
            </select>
          </div>
          <div style="flex: 1;">
            <label class="form-label required">Sumber Dana</label>
            <select name="sumber_dana" id="modal-biaya-sumber" class="select w-full" required>
              <option value="kas_toko">Kas Besar Toko</option>
              <option value="kas_kasir">Kas Kasir (Petty Cash Laci)</option>
              <option value="bank">Transfer / Rekening Bank Toko</option>
            </select>
          </div>
        </div>

        <div>
          <label class="form-label required">Nominal Pengeluaran (Rp)</label>
          <input type="text" inputmode="numeric" name="nominal" id="modal-biaya-nominal" class="input w-full fw-bold mono" style="font-size: var(--fs-lg); color: var(--danger);" placeholder="Contoh: 150.000" required autocomplete="off" />
        </div>

        <div>
          <label class="form-label required">Keterangan / Keperluan Lengkap</label>
          <textarea name="keterangan" id="modal-biaya-keterangan" class="input w-full" rows="3" placeholder="Contoh: Beli bensin mobil pikap Carry & tol pengiriman 50 sak semen ke Proyek Perumahan Graha Asri" required></textarea>
        </div>

        <div>
          <label class="form-label">Bukti Nota / Struk Kuitansi (URL Opsional)</label>
          <input type="url" name="bukti_url" id="modal-biaya-bukti" class="input w-full" placeholder="https://..." />
          <div class="text-xs text-muted" style="margin-top: 4px;">Opsional: Tautan foto nota atau dokumen pendukung.</div>
        </div>

        <div class="row" style="justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-2);">
          <button type="button" class="btn btn-secondary" id="modal-biaya-batal">Batal</button>
          <button type="submit" class="btn btn-primary" id="modal-biaya-simpan">Simpan Pengeluaran</button>
        </div>
      </form>
    `
  });

  const form = modal.el.querySelector('#form-tambah-biaya');
  const inputNominal = modal.el.querySelector('#modal-biaya-nominal');
  const btnBatal = modal.el.querySelector('#modal-biaya-batal');
  const btnSimpan = modal.el.querySelector('#modal-biaya-simpan');

  btnBatal?.addEventListener('click', () => modal.close());

  // Input mask Rupiah
  inputNominal?.addEventListener('input', () => {
    const raw = parseRupiah(inputNominal.value);
    inputNominal.value = raw > 0 ? formatRupiah(raw).replace('Rp ', '') : '';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kategori = modal.el.querySelector('#modal-biaya-kategori').value;
    const sumberDana = modal.el.querySelector('#modal-biaya-sumber').value;
    const nominal = parseRupiah(inputNominal.value);
    const keterangan = modal.el.querySelector('#modal-biaya-keterangan').value.trim();
    const buktiUrl = modal.el.querySelector('#modal-biaya-bukti').value.trim();

    if (!nominal || nominal < 100) {
      showToast('Nominal pengeluaran minimal Rp 100', 'warning');
      inputNominal?.focus();
      return;
    }
    if (!keterangan) {
      showToast('Keterangan pengeluaran wajib diisi', 'warning');
      return;
    }

    btnSimpan.disabled = true;
    btnSimpan.textContent = 'Menyimpan...';

    try {
      const res = await apiCall('biaya.create', {
        kategori,
        sumber_dana: sumberDana,
        nominal,
        keterangan,
        bukti_url: buktiUrl
      });

      showToast(res.pesan || 'Pengeluaran berhasil dicatat!', 'success');
      modal.close();
      if (typeof onSuccess === 'function') onSuccess();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pengeluaran', 'danger');
      btnSimpan.disabled = false;
      btnSimpan.textContent = 'Simpan Pengeluaran';
    }
  });
}

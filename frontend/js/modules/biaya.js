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

function getLabelPeriode() {
  if (filterPeriode === 'today') return 'Hari Ini';
  if (filterPeriode === '7d') return '7 Hari Terakhir';
  if (filterPeriode === '30d') return '30 Hari Terakhir';
  if (filterPeriode === 'bulan_ini') return 'Bulan Ini';
  if (filterPeriode === 'tahun_ini') return 'Tahun Ini';
  if (filterPeriode === 'custom') {
    if (customDari && customSampai) {
      return `${formatTanggal(customDari)} s/d ${formatTanggal(customSampai)}`;
    }
    return 'Rentang Kustom';
  }
  return '30 Hari Terakhir';
}

export async function renderBiayaModule(container) {
  const user = store.get('user') || {};
  const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-3);">
      <!-- Header Modul (Ramping & Proporsional Ala Native App) -->
      <div class="page-header">
        <div>
          <h2>Biaya Operasional Toko</h2>
          <p class="d-none-mobile">Pencatatan pengeluaran kas operasional, petty cash kasir, transportasi, dan biaya rutin</p>
        </div>
        <div>
          <button type="button" class="btn btn-primary" id="btn-tambah-biaya">
            ${ICONS.plus}
            <span>Catat Biaya</span>
          </button>
        </div>
      </div>

      <!-- Filter Card -->
      <div class="card card-body stack" style="gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);">
        <!-- Baris 1: Label Periode & Badge Rentang Aktif -->
        <div class="row" style="justify-content: space-between; align-items: center; gap: var(--sp-2);">
          <span style="font-weight: var(--fw-bold); font-size: var(--fs-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Periode:</span>
          <div class="badge badge-secondary" id="badge-biaya-periode" style="padding: 4px 10px; font-size: var(--fs-xs); font-family: var(--font-mono); font-weight: var(--fw-semibold); border-radius: var(--radius-full); background: var(--surface-2); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.calendar}
            <span id="label-biaya-periode-aktif">${getLabelPeriode()}</span>
          </div>
        </div>

        <!-- Baris 2: Segmented Preset Buttons (Grid 3x2 Simetris di Mobile) -->
        <div class="biaya-preset-group" id="biaya-preset-group">
          <button type="button" class="${filterPeriode === 'today' ? 'active' : ''}" data-p="today">Hari Ini</button>
          <button type="button" class="${filterPeriode === '7d' ? 'active' : ''}" data-p="7d">7 Hari</button>
          <button type="button" class="${filterPeriode === '30d' ? 'active' : ''}" data-p="30d">30 Hari</button>
          <button type="button" class="${filterPeriode === 'bulan_ini' ? 'active' : ''}" data-p="bulan_ini">Bulan Ini</button>
          <button type="button" class="${filterPeriode === 'tahun_ini' ? 'active' : ''}" data-p="tahun_ini">Tahun Ini</button>
          <button type="button" class="${filterPeriode === 'custom' ? 'active' : ''}" data-p="custom">Kustom</button>
        </div>

        <!-- Baris Kustom Tanggal (Jika Mode Kustom Aktif) -->
        <div id="biaya-custom-range" class="date-range-bar" style="${filterPeriode === 'custom' ? '' : 'display: none;'}">
          <div class="date-range-field">
            <label for="biaya-tgl-dari">Dari</label>
            <input type="date" id="biaya-tgl-dari" class="input input-sm" value="${customDari}" />
          </div>
          <div class="date-range-field">
            <label for="biaya-tgl-sampai">Sampai</label>
            <input type="date" id="biaya-tgl-sampai" class="input input-sm" value="${customSampai}" />
          </div>
          <button type="button" class="btn btn-primary btn-sm date-range-apply" id="btn-terapkan-tgl">Terapkan Rentang</button>
        </div>

        <!-- Baris 3: Filter Kategori, Sumber Dana, dan Pencarian -->
        <div class="filter-bar-responsive">
          <div class="field filter-tipe" style="margin-bottom: 0;">
            <label class="field-label text-xs fw-semibold" for="filter-biaya-kategori">Kategori Biaya</label>
            <select class="input input-sm w-full" id="filter-biaya-kategori">
              <option value="">Semua Kategori</option>
              ${DAFTAR_KATEGORI.map(k => `<option value="${escapeHtml(k)}" ${filterKategori === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
            </select>
          </div>

          <div class="field filter-level" style="margin-bottom: 0;">
            <label class="field-label text-xs fw-semibold" for="filter-biaya-sumber">Sumber Dana</label>
            <select class="input input-sm w-full" id="filter-biaya-sumber">
              <option value="">Semua Sumber</option>
              <option value="kas_kasir" ${filterSumber === 'kas_kasir' ? 'selected' : ''}>Kas Kasir (Petty Cash)</option>
              <option value="kas_toko" ${filterSumber === 'kas_toko' ? 'selected' : ''}>Kas Besar Toko</option>
              <option value="bank" ${filterSumber === 'bank' ? 'selected' : ''}>Transfer Bank</option>
            </select>
          </div>

          <div class="filter-search-wrap">
            <div class="field grow" style="margin-bottom: 0;">
              <label class="field-label text-xs fw-semibold" for="search-biaya">Cari Pengeluaran</label>
              <div class="input-group">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" id="search-biaya" class="input input-sm w-full" placeholder="Cari nomor biaya, keterangan, atau kasir..." value="${escapeHtml(searchKeyword)}" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Ringkasan Metrik Finansial (Grid 2x2 Simetris di Mobile) -->
      <div id="biaya-cards-container" class="stat-grid">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Pengeluaran</span>
            <div class="stat-card-icon icon-rose">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value text-danger" id="stat-total-biaya">Rp 0</div>
          <div class="stat-card-desc" id="stat-count-biaya">0 Pengeluaran</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Petty Cash Kasir</span>
            <div class="stat-card-icon icon-amber">${ICONS.cashier}</div>
          </div>
          <div class="stat-card-value text-warning" id="stat-kasir-biaya">Rp 0</div>
          <div class="stat-card-desc">Uang laci kasir</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Kas Besar Toko</span>
            <div class="stat-card-icon icon-blue">${ICONS.store}</div>
          </div>
          <div class="stat-card-value text-primary" id="stat-toko-biaya">Rp 0</div>
          <div class="stat-card-desc">Kas operasional toko</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Transfer Bank</span>
            <div class="stat-card-icon icon-purple">${ICONS.arrowUpRight}</div>
          </div>
          <div class="stat-card-value" style="color: var(--purple-text);" id="stat-bank-biaya">Rp 0</div>
          <div class="stat-card-desc">Rekening bank toko</div>
        </div>
      </div>

      <!-- Rincian Kategori Biaya (Bar Ringkasan) -->
      <div id="biaya-breakdown-card" class="card card-body stack" style="gap: var(--sp-2); display: none;">
        <div class="fw-bold text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px;">Komposisi Pengeluaran per Kategori</div>
        <div id="biaya-breakdown-container" class="row" style="gap: 8px; flex-wrap: wrap;"></div>
      </div>

      <!-- Area Tabel & Kartu Daftar Pengeluaran -->
      <div class="card card-body" id="area-tabel-biaya" style="padding: 0; overflow: hidden;">
        <div style="padding: var(--sp-4);">
          ${renderSkeleton(5)}
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
  const elLabelPeriode = container.querySelector('#label-biaya-periode-aktif');

  function perbaruiLabelPeriode() {
    if (elLabelPeriode) elLabelPeriode.textContent = getLabelPeriode();
  }

  elPresetGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-p]');
    if (!btn) return;
    elPresetGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterPeriode = btn.getAttribute('data-p');

    if (filterPeriode === 'custom') {
      elCustomRange.style.display = '';
      perbaruiLabelPeriode();
    } else {
      elCustomRange.style.display = 'none';
      perbaruiLabelPeriode();
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
    perbaruiLabelPeriode();
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

  container.querySelector('#btn-tambah-biaya')?.addEventListener('click', () => {
    bukaModalTambahBiaya(() => muatDataBiaya());
  });

  // Load awal
  await muatDataBiaya();

  async function muatDataBiaya() {
    const areaTabel = container.querySelector('#area-tabel-biaya');
    if (!areaTabel) return;

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
      areaTabel.innerHTML = `
        <div style="padding: var(--sp-4);">
          ${renderEmpty({
            title: 'Gagal Memuat Data Biaya',
            text: err.message || 'Terjadi gangguan saat mengambil data dari server.',
            icon: ICONS.alertTriangle,
            actionButton: `<button type="button" class="btn btn-secondary btn-sm" id="btn-retry-biaya">${ICONS.refresh} Coba Lagi</button>`
          })}
        </div>
      `;
      areaTabel.querySelector('#btn-retry-biaya')?.addEventListener('click', () => muatDataBiaya());
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
    const areaTabel = container.querySelector('#area-tabel-biaya');
    if (!areaTabel) return;

    if (!items || items.length === 0) {
      areaTabel.innerHTML = renderEmpty({
        title: 'Belum Ada Transaksi Biaya',
        text: 'Tidak ada catatan pengeluaran biaya operasional pada periode ini.',
        icon: ICONS.wallet,
        actionButton: `<button type="button" class="btn btn-primary btn-sm" id="btn-empty-catat">${ICONS.plus} <span>Catat Biaya Baru</span></button>`
      });
      areaTabel.querySelector('#btn-empty-catat')?.addEventListener('click', () => {
        bukaModalTambahBiaya(() => muatDataBiaya());
      });
      return;
    }

    areaTabel.innerHTML = `
      <div class="table-wrap">
        <table class="table table-card-2col" id="tabel-biaya">
          <thead>
            <tr>
              <th style="min-width: 140px;">No Transaksi</th>
              <th style="min-width: 130px;">Tanggal & Waktu</th>
              <th style="min-width: 150px;">Kategori</th>
              <th style="min-width: 200px;">Keterangan</th>
              <th style="min-width: 110px;">Sumber Dana</th>
              <th class="num text-right" style="min-width: 120px;">Nominal</th>
              <th style="min-width: 100px;">Petugas</th>
              <th style="text-align: right; min-width: 80px; width: 80px;">Aksi</th>
            </tr>
          </thead>
          <tbody id="tbody-biaya">
            ${items.map(item => {
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
                  <td data-label="No Transaksi" class="mono fw-bold">${escapeHtml(item.no_transaksi)}</td>
                  <td data-label="Tanggal & Waktu" class="mono text-xs">${formatTanggal(item.tanggal || item.created_at, true)}</td>
                  <td data-label="Kategori"><span class="badge badge-secondary">${escapeHtml(item.kategori)}</span></td>
                  <td data-label="Keterangan" style="max-width: 280px; word-break: break-word;">
                    <div>${escapeHtml(item.keterangan || '-')}</div>
                    ${item.bukti_url ? `<a href="${escapeHtml(item.bukti_url)}" target="_blank" class="text-xs text-primary" style="display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">Lihat Bukti Foto</a>` : ''}
                  </td>
                  <td data-label="Sumber Dana">${badgeSumber}</td>
                  <td data-label="Nominal" class="num text-right mono fw-bold text-danger">${formatRupiah(item.nominal)}</td>
                  <td data-label="Petugas" class="text-xs text-muted">${escapeHtml(item.user_nama || '-')}</td>
                  <td data-label="Aksi" style="text-align: right;">
                    ${isOwnerOrAdmin ? `
                      <button type="button" class="btn btn-ghost btn-xs text-danger btn-hapus-biaya" data-id="${item.id}" data-no="${escapeHtml(item.no_transaksi)}" title="Batalkan Biaya">
                        ${ICONS.trash}
                      </button>
                    ` : '<span class="text-muted text-xs">-</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Bind tombol hapus
    areaTabel.querySelectorAll('.btn-hapus-biaya').forEach(btn => {
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
    title: 'Catat Pengeluaran & Biaya Toko',
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
          <button type="submit" class="btn btn-primary" id="modal-biaya-simpan">
            ${ICONS.plus}
            <span>Simpan Pengeluaran</span>
          </button>
        </div>
      </form>
    `
  });

  const form = modal.el.querySelector('#form-tambah-biaya');
  const inputNominal = modal.el.querySelector('#modal-biaya-nominal');
  const btnBatal = modal.el.querySelector('#modal-biaya-batal');
  const btnSimpan = modal.el.querySelector('#modal-biaya-simpan');

  btnBatal?.addEventListener('click', () => modal.close());

  // Input mask Rupiah saat mengetik
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
    btnSimpan.innerHTML = `<span>Menyimpan...</span>`;

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
      btnSimpan.innerHTML = `${ICONS.plus} <span>Simpan Pengeluaran</span>`;
    }
  });
}

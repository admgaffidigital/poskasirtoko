/**
 * produk.js — Modul Manajemen Master Produk, Multi Satuan & Varian
 * Sesuai aturan README bagian 6.4, 7 (Aturan Bisnis 1, 10, 11, 17) & Hak Akses
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, $$, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { formatRupiah, formatQty, parseRupiah, escapeHtml } from '../utils/format.js';

let filterState = {
  q: '',
  kategori_id: '',
  aktif_saja: false,
  view: 'table', // 'table' | 'grid'
  page: 1,
  limit: 20
};

export async function renderProdukModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');
  const isKasir = user && user.role === 'kasir';

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Katalog & Stok Produk</h2>
          <p>Kelola daftar barang, varian, satuan konversi, harga eceran & grosir</p>
        </div>
        ${canEdit ? `
          <div>
            <button type="button" class="btn btn-primary" id="btn-tambah-produk">
              <span>+ Tambah Produk</span>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Bilah Filter & Pencarian -->
      <div class="card card-body">
        <div class="row">
          <div class="input-group grow">
            <span class="input-icon">${ICONS.search}</span>
            <input type="text" class="input" id="filter-produk-q" placeholder="Cari nama barang, SKU, atau barcode..." value="${escapeHtml(filterState.q)}">
          </div>

          <select class="select" id="filter-produk-kategori" style="max-width: 200px;">
            <option value="">Semua Kategori</option>
          </select>

          <div class="segmented" id="toggle-view">
            <button type="button" data-view="table" aria-pressed="${filterState.view === 'table'}">${ICONS.list}</button>
            <button type="button" data-view="grid" aria-pressed="${filterState.view === 'grid'}">${ICONS.grid}</button>
          </div>
        </div>
      </div>

      <!-- Area Tampilan Data -->
      <div id="area-daftar-produk">
        ${renderSkeleton(4)}
      </div>

      <!-- Paginasi -->
      <div id="area-paginasi-produk" class="row-between"></div>
    </div>
  `;

  // Muat opsi kategori ke dropdown filter
  try {
    const katRes = await apiCall('kategori.list', {});
    const selKat = $('#filter-produk-kategori', container);
    (katRes.items || []).forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = k.nama;
      selKat.appendChild(opt);
    });
  } catch (e) {
    // Abaikan jika gagal muat filter
  }

  // Pasang event filter
  let debounceTimer;
  $('#filter-produk-q', container)?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filterState.q = e.target.value.trim();
      filterState.page = 1;
      muatProduk(container, canEdit, isKasir);
    }, 300);
  });

  $('#filter-produk-kategori', container)?.addEventListener('change', (e) => {
    filterState.kategori_id = e.target.value;
    filterState.page = 1;
    muatProduk(container, canEdit, isKasir);
  });

  $('#toggle-view', container)?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.view = btn.getAttribute('data-view');
      $('#toggle-view', container).querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', b.getAttribute('data-view') === filterState.view);
      });
      muatProduk(container, canEdit, isKasir);
    });
  });

  if (canEdit) {
    $('#btn-tambah-produk', container)?.addEventListener('click', () => {
      bukaModalFormProduk(container, null);
    });
  }

  await muatProduk(container, canEdit, isKasir);
}

async function muatProduk(container, canEdit, isKasir) {
  const area = $('#area-daftar-produk', container);
  const areaPaginasi = $('#area-paginasi-produk', container);

  try {
    const res = await apiCall('produk.list', filterState);
    const items = res.items || [];
    const total = res.total || 0;

    if (!items.length) {
      area.innerHTML = `
        <div class="card card-body">
          ${renderEmpty({
            title: 'Produk Tidak Ditemukan',
            text: filterState.q ? `Tidak ada barang yang cocok dengan kata kunci "${filterState.q}".` : 'Belum ada produk yang didaftarkan ke sistem.',
            icon: ICONS.box,
            actionButton: canEdit && !filterState.q ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">+ Tambah Produk Pertama</button>` : ''
          })}
        </div>
      `;
      area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
        bukaModalFormProduk(container, null);
      });
      if (areaPaginasi) areaPaginasi.innerHTML = '';
      return;
    }

    if (filterState.view === 'table') {
      let html = `
        <div class="card">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Nama Produk</th>
                  <th>SKU / Barcode</th>
                  <th>Satuan</th>
                  ${!isKasir ? '<th style="text-align: right;">HPP</th>' : ''}
                  <th style="text-align: right;">Harga Ritel</th>
                  <th style="text-align: right;">Harga Grosir</th>
                  <th style="text-align: center;">Stok</th>
                  ${canEdit ? '<th style="width: 130px; text-align: right;">Aksi</th>' : ''}
                </tr>
              </thead>
              <tbody>
      `;

      items.forEach((p) => {
        const stokBadge = dapatkanBadgeStok(p.stok, p.stok_min);
        html += `
          <tr>
            <td>
              <div class="fw-semibold">${escapeHtml(p.nama)}</div>
              ${p.punya_varian && p.varian && p.varian.length ? `<span class="badge badge-info" style="font-size: 11px;">${p.varian.length} Varian</span>` : ''}
              ${p.satuan_konversi && p.satuan_konversi.length ? `<span class="badge" style="font-size: 11px;">+${p.satuan_konversi.length} Satuan</span>` : ''}
            </td>
            <td>
              <div class="mono text-xs">${escapeHtml(p.sku || '-')}</div>
              <div class="text-xs text-muted">${escapeHtml(p.barcode || '')}</div>
            </td>
            <td>${escapeHtml(p.satuan_dasar)}</td>
            ${!isKasir ? `<td class="num">${formatRupiah(p.hpp)}</td>` : ''}
            <td class="num fw-semibold">${formatRupiah(p.harga_ritel)}</td>
            <td class="num text-muted">${p.harga_grosir ? formatRupiah(p.harga_grosir) : '-'}</td>
            <td style="text-align: center;">
              <span class="badge ${stokBadge.kelas}">${formatQty(p.stok)}</span>
            </td>
            ${canEdit ? `
              <td style="text-align: right;">
                <div class="row" style="justify-content: flex-end; gap: var(--sp-1);">
                  <button type="button" class="btn btn-ghost btn-sm btn-edit-prd" data-id="${p.id}">Ubah</button>
                  <button type="button" class="btn btn-ghost btn-sm text-danger btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}">Hapus</button>
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
        </div>
      `;
      area.innerHTML = html;
    } else {
      // Grid View
      let html = '<div class="card-grid">';
      items.forEach((p) => {
        const stokBadge = dapatkanBadgeStok(p.stok, p.stok_min);
        html += `
          <div class="card stack-sm" style="padding: var(--sp-4);">
            <div class="row-between">
              <span class="badge ${stokBadge.kelas}">Stok: ${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar)}</span>
              ${p.sku ? `<span class="mono text-xs text-muted">${escapeHtml(p.sku)}</span>` : ''}
            </div>

            <div class="fw-semibold text-md" style="min-height: 44px; margin-top: var(--sp-1);">
              ${escapeHtml(p.nama)}
            </div>

            <div class="row-between" style="margin-top: auto; padding-top: var(--sp-2); border-top: 1px solid var(--border);">
              <div>
                <div class="text-xs text-muted">Harga Ritel</div>
                <div class="fw-bold num text-lg text-primary">${formatRupiah(p.harga_ritel)}</div>
              </div>
              ${!isKasir && p.hpp !== null ? `
                <div style="text-align: right;">
                  <div class="text-xs text-muted">HPP</div>
                  <div class="num text-sm text-muted">${formatRupiah(p.hpp)}</div>
                </div>
              ` : ''}
            </div>

            ${canEdit ? `
              <div class="row" style="margin-top: var(--sp-2); gap: var(--sp-2);">
                <button type="button" class="btn btn-secondary btn-sm grow btn-edit-prd" data-id="${p.id}">Ubah</button>
                <button type="button" class="btn btn-ghost btn-sm text-danger btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}">Hapus</button>
              </div>
            ` : ''}
          </div>
        `;
      });
      html += '</div>';
      area.innerHTML = html;
    }

    // Pasang tombol aksi Ubah & Hapus
    if (canEdit) {
      area.querySelectorAll('.btn-edit-prd').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const p = items.find((x) => x.id === id);
          if (p) bukaModalFormProduk(container, p);
        });
      });

      area.querySelectorAll('.btn-del-prd').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const nama = btn.getAttribute('data-nama');
          const setuju = await showConfirm({
            title: 'Hapus Produk',
            message: `Apakah Anda yakin ingin menghapus produk "${nama}"? Data stok dan riwayat akan tetap aman dalam arsip sistem.`,
            confirmText: 'Ya, Hapus Produk',
            danger: true
          });
          if (!setuju) return;

          try {
            await apiCall('produk.delete', { id });
            showToast('Produk berhasil dihapus.', 'success');
            await muatProduk(container, canEdit, isKasir);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    // Render kontrol paginasi
    if (areaPaginasi) {
      const totalHal = Math.ceil(total / filterState.limit) || 1;
      areaPaginasi.innerHTML = `
        <div class="text-sm text-muted">Menampilkan ${items.length} dari ${total} barang</div>
        <div class="row" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-hal-sebelum" ${filterState.page <= 1 ? 'disabled' : ''}>← Sebelumnya</button>
          <span class="text-sm fw-medium">${filterState.page} / ${totalHal}</span>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-hal-berikut" ${filterState.page >= totalHal ? 'disabled' : ''}>Berikutnya →</button>
        </div>
      `;

      $('#btn-hal-sebelum', areaPaginasi)?.addEventListener('click', () => {
        if (filterState.page > 1) {
          filterState.page--;
          muatProduk(container, canEdit, isKasir);
        }
      });
      $('#btn-hal-berikut', areaPaginasi)?.addEventListener('click', () => {
        if (filterState.page < totalHal) {
          filterState.page++;
          muatProduk(container, canEdit, isKasir);
        }
      });
    }
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div><strong>Gagal Memuat Produk</strong>: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function dapatkanBadgeStok(stok, stokMin) {
  const s = Number(stok) || 0;
  const min = Number(stokMin) || 0;
  if (s <= 0) return { kelas: 'badge-danger', teks: 'Habis' };
  if (s <= min) return { kelas: 'badge-warning', teks: 'Menipis' };
  return { kelas: 'badge-success', teks: 'Aman' };
}

/**
 * Modal Form Tambah / Edit Produk Lengkap
 */
async function bukaModalFormProduk(container, produk) {
  const isEdit = !!produk;
  let daftarKategori = [];
  try {
    const kRes = await apiCall('kategori.list', {});
    daftarKategori = kRes.items || [];
  } catch (e) {}

  let optionsKat = '<option value="">-- Tanpa Kategori --</option>';
  daftarKategori.forEach((k) => {
    const sel = isEdit && produk.kategori_id === k.id ? 'selected' : '';
    optionsKat += `<option value="${k.id}" ${sel}>${escapeHtml(k.nama)}</option>`;
  });

  const bodyHtml = `
    <form id="form-produk" class="stack">
      <!-- Navigasi Tab Form -->
      <div class="segmented" id="tab-form-produk" style="width: 100%;">
        <button type="button" class="grow" data-tab="dasar" aria-pressed="true">Informasi Dasar</button>
        <button type="button" class="grow" data-tab="harga" aria-pressed="false">Harga & Stok</button>
        <button type="button" class="grow" data-tab="varian" aria-pressed="false">Varian & Satuan</button>
      </div>

      <!-- Tab 1: Dasar -->
      <div class="tab-pane stack" id="pane-dasar">
        <div class="field">
          <label class="field-label" for="prd-nama">Nama Produk <span class="wajib">*</span></label>
          <input type="text" class="input" id="prd-nama" value="${isEdit ? escapeHtml(produk.nama) : ''}" placeholder="Cth: Semen Padang 50kg, Cat Dulux Pentalite 2.5L" required autofocus>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-sku">Kode SKU</label>
            <input type="text" class="input mono" id="prd-sku" value="${isEdit ? escapeHtml(produk.sku || '') : ''}" placeholder="Cth: SMN-PDG-50">
          </div>
          <div class="field">
            <label class="field-label" for="prd-barcode">Barcode</label>
            <input type="text" class="input mono" id="prd-barcode" value="${isEdit ? escapeHtml(produk.barcode || '') : ''}" placeholder="Scan atau input barcode">
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-kategori">Kategori</label>
            <select class="select" id="prd-kategori">${optionsKat}</select>
          </div>
          <div class="field">
            <label class="field-label" for="prd-satuan">Satuan Dasar <span class="wajib">*</span></label>
            <input type="text" class="input" id="prd-satuan" value="${isEdit ? escapeHtml(produk.satuan_dasar) : 'pcs'}" placeholder="Cth: sak, kg, dus, batang, meter" required>
          </div>
        </div>

        <div class="field">
          <label class="switch">
            <input type="checkbox" id="prd-aktif" ${!isEdit || produk.aktif ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Status Produk Aktif (dapat dijual di kasir)</span>
          </label>
        </div>
      </div>

      <!-- Tab 2: Harga & Stok -->
      <div class="tab-pane stack hidden" id="pane-harga">
        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-hpp">HPP (Harga Beli Pokok) <span class="wajib">*</span></label>
            <div class="input-prefix">
              <span>Rp</span>
              <input type="text" class="input input-num" id="prd-hpp" value="${isEdit ? formatRupiah(produk.hpp, false) : '0'}" required>
            </div>
            <span class="field-hint">Harga jual di bawah HPP tidak diizinkan.</span>
          </div>

          <div class="field">
            <label class="field-label" for="prd-ritel">Harga Jual Ritel (Eceran) <span class="wajib">*</span></label>
            <div class="input-prefix">
              <span>Rp</span>
              <input type="text" class="input input-num fw-bold" id="prd-ritel" value="${isEdit ? formatRupiah(produk.harga_ritel, false) : '0'}" required>
            </div>
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-grosir">Harga Grosir (Opsional)</label>
            <div class="input-prefix">
              <span>Rp</span>
              <input type="text" class="input input-num" id="prd-grosir" value="${isEdit && produk.harga_grosir ? formatRupiah(produk.harga_grosir, false) : ''}" placeholder="Sama dengan ritel jika kosong">
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="prd-min-grosir">Minimal Qty Grosir</label>
            <input type="number" class="input input-num" id="prd-min-grosir" value="${isEdit ? produk.min_grosir_qty || 1 : 1}" min="1">
          </div>
        </div>

        <div class="divider"></div>

        <div class="form-grid cols-2">
          <div class="field">
            <label class="field-label" for="prd-stok">${isEdit ? 'Stok Sistem Saat Ini' : 'Stok Awal Fisik'}</label>
            <input type="number" step="0.001" class="input input-num" id="prd-stok" value="${isEdit ? produk.stok || 0 : 0}" ${isEdit ? 'disabled' : ''}>
            ${isEdit ? '<span class="field-hint">Gunakan modul Stok Opname / Pembelian untuk mengubah stok produk yang sudah ada.</span>' : ''}
          </div>

          <div class="field">
            <label class="field-label" for="prd-stok-min">Batas Stok Minimum</label>
            <input type="number" class="input input-num" id="prd-stok-min" value="${isEdit ? produk.stok_min || 0 : 5}">
            <span class="field-hint">Peringatan stok menipis muncul jika saldo di bawah batas ini.</span>
          </div>
        </div>
      </div>

      <!-- Tab 3: Varian & Satuan -->
      <div class="tab-pane stack hidden" id="pane-varian">
        <div class="field">
          <label class="switch">
            <input type="checkbox" id="prd-punya-varian" ${isEdit && produk.punya_varian ? 'checked' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Produk memiliki beberapa varian (Warna, Ukuran, Tebal)</span>
          </label>
        </div>

        <div id="area-input-varian" class="stack ${isEdit && produk.punya_varian ? '' : 'hidden'}">
          <div class="row-between">
            <span class="section-title">Daftar Varian Produk</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tambah-baris-varian">+ Varian</button>
          </div>
          <div id="wadah-varian" class="stack-sm"></div>
        </div>

        <div class="divider"></div>

        <div class="stack">
          <div class="row-between">
            <span class="section-title">Konversi Satuan Kemasan (Multi Satuan)</span>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-tambah-baris-satuan">+ Satuan Kemasan</button>
          </div>
          <span class="field-hint">Contoh: 1 Dus = 24 pcs, 1 Truk = 100 sak</span>
          <div id="wadah-satuan" class="stack-sm"></div>
        </div>
      </div>

      <!-- Footer Tombol -->
      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-3);">
        <button type="button" class="btn btn-ghost btn-close-modal">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-produk">
          ${isEdit ? 'Simpan Perubahan' : 'Tambah Produk'}
        </button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: isEdit ? 'Ubah Data Produk' : 'Tambah Produk Baru',
    body: bodyHtml,
    size: 'lg'
  });

  const form = $('#form-produk', modal.el);

  // Tab switching
  $('#tab-form-produk', modal.el)?.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      $('#tab-form-produk', modal.el).querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', b.getAttribute('data-tab') === target);
      });
      $('.tab-pane#pane-dasar', modal.el).classList.toggle('hidden', target !== 'dasar');
      $('.tab-pane#pane-harga', modal.el).classList.toggle('hidden', target !== 'harga');
      $('.tab-pane#pane-varian', modal.el).classList.toggle('hidden', target !== 'varian');
    });
  });

  // Toggle punya varian
  const checkVarian = $('#prd-punya-varian', form);
  const areaVarian = $('#area-input-varian', form);
  checkVarian?.addEventListener('change', () => {
    areaVarian.classList.toggle('hidden', !checkVarian.checked);
  });

  // Format ribuan otomatis pada input HPP & Ritel
  const formatInputRp = (el) => {
    el.addEventListener('input', () => {
      const val = parseRupiah(el.value);
      el.value = formatRupiah(val, false);
    });
  };
  formatInputRp($('#prd-hpp', form));
  formatInputRp($('#prd-ritel', form));
  formatInputRp($('#prd-grosir', form));

  // Render Varian Awal
  const wadahVarian = $('#wadah-varian', form);
  const renderBarisVarian = (v = {}) => {
    const row = document.createElement('div');
    row.className = 'card card-body baris-varian';
    row.style.padding = 'var(--sp-3)';
    row.innerHTML = `
      <input type="hidden" class="var-id" value="${v.id || ''}">
      <div class="form-grid cols-3" style="gap: var(--sp-2);">
        <input type="text" class="input var-nama" placeholder="Nama Varian (cth: Putih 5kg)" value="${escapeHtml(v.nama_varian || '')}" required>
        <input type="text" class="input mono var-sku" placeholder="SKU Varian" value="${escapeHtml(v.sku || '')}">
        <input type="text" class="input mono var-barcode" placeholder="Barcode" value="${escapeHtml(v.barcode || '')}">
      </div>
      <div class="row" style="margin-top: var(--sp-2); gap: var(--sp-2);">
        <div class="input-prefix grow">
          <span>Rp</span>
          <input type="text" class="input input-num var-ritel" placeholder="Harga Ritel" value="${formatRupiah(v.harga_ritel || 0, false)}" required>
        </div>
        <input type="number" class="input input-num var-stok" placeholder="Stok" value="${v.stok || 0}" style="max-width: 110px;">
        <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-baris-varian">Hapus</button>
      </div>
    `;
    formatInputRp(row.querySelector('.var-ritel'));
    row.querySelector('.btn-hapus-baris-varian').addEventListener('click', () => row.remove());
    wadahVarian.appendChild(row);
  };

  if (isEdit && produk.varian) {
    produk.varian.forEach((v) => renderBarisVarian(v));
  }
  $('#btn-tambah-baris-varian', form)?.addEventListener('click', () => renderBarisVarian());

  // Render Satuan Konversi Awal
  const wadahSatuan = $('#wadah-satuan', form);
  const renderBarisSatuan = (s = {}) => {
    const row = document.createElement('div');
    row.className = 'card card-body baris-satuan';
    row.style.padding = 'var(--sp-3)';
    row.innerHTML = `
      <div class="row" style="gap: var(--sp-2);">
        <input type="text" class="input sat-nama" placeholder="Satuan (cth: Dus)" value="${escapeHtml(s.satuan || '')}" style="max-width: 140px;" required>
        <span class="text-sm">=</span>
        <input type="number" step="0.001" class="input input-num sat-faktor" placeholder="Faktor (cth: 24)" value="${s.faktor || ''}" style="max-width: 110px;" required>
        <span class="text-xs text-muted satuan-dasar-label">${escapeHtml($('#prd-satuan', form).value || 'pcs')}</span>
        <div class="input-prefix grow">
          <span>Rp</span>
          <input type="text" class="input input-num sat-ritel" placeholder="Harga Jual per Satuan" value="${formatRupiah(s.harga_ritel || 0, false)}" required>
        </div>
        <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-baris-satuan">Hapus</button>
      </div>
    `;
    formatInputRp(row.querySelector('.sat-ritel'));
    row.querySelector('.btn-hapus-baris-satuan').addEventListener('click', () => row.remove());
    wadahSatuan.appendChild(row);
  };

  if (isEdit && produk.satuan_konversi) {
    produk.satuan_konversi.forEach((s) => renderBarisSatuan(s));
  }
  $('#btn-tambah-baris-satuan', form)?.addEventListener('click', () => renderBarisSatuan());

  // Submit Handler Form Produk
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#prd-nama', form).value.trim();
    const sku = $('#prd-sku', form).value.trim();
    const barcode = $('#prd-barcode', form).value.trim();
    const kategori_id = $('#prd-kategori', form).value;
    const satuan_dasar = $('#prd-satuan', form).value.trim();
    const hpp = parseRupiah($('#prd-hpp', form).value);
    const harga_ritel = parseRupiah($('#prd-ritel', form).value);
    const harga_grosir = parseRupiah($('#prd-grosir', form).value) || harga_ritel;
    const min_grosir_qty = parseFloat($('#prd-min-grosir', form).value) || 1;
    const stok = parseFloat($('#prd-stok', form).value) || 0;
    const stok_min = parseFloat($('#prd-stok-min', form).value) || 0;
    const aktif = $('#prd-aktif', form).checked;
    const punya_varian = checkVarian.checked;

    // Validasi harga >= HPP
    if (harga_ritel < hpp) {
      showToast(`Harga ritel (Rp ${formatRupiah(harga_ritel, false)}) tidak boleh di bawah HPP (Rp ${formatRupiah(hpp, false)})!`, 'error', 4500);
      return;
    }
    if (harga_grosir < hpp) {
      showToast(`Harga grosir tidak boleh di bawah HPP!`, 'error', 4500);
      return;
    }

    // Susun data varian
    const varian = [];
    if (punya_varian) {
      const barisVarian = form.querySelectorAll('.baris-varian');
      for (const b of barisVarian) {
        const vNama = b.querySelector('.var-nama').value.trim();
        const vRitel = parseRupiah(b.querySelector('.var-ritel').value);
        if (!vNama) continue;
        if (vRitel < hpp) {
          showToast(`Harga varian "${vNama}" tidak boleh di bawah HPP!`, 'error');
          return;
        }
        varian.push({
          id: b.querySelector('.var-id').value || undefined,
          nama_varian: vNama,
          sku: b.querySelector('.var-sku').value.trim(),
          barcode: b.querySelector('.var-barcode').value.trim(),
          hpp: hpp,
          harga_ritel: vRitel,
          harga_grosir: vRitel,
          stok: parseFloat(b.querySelector('.var-stok').value) || 0
        });
      }
    }

    // Susun data satuan konversi
    const satuan_konversi = [];
    const barisSatuan = form.querySelectorAll('.baris-satuan');
    for (const s of barisSatuan) {
      const sNama = s.querySelector('.sat-nama').value.trim();
      const sFaktor = parseFloat(s.querySelector('.sat-faktor').value);
      const sRitel = parseRupiah(s.querySelector('.sat-ritel').value);
      if (!sNama || !sFaktor) continue;
      satuan_konversi.push({
        satuan: sNama,
        faktor: sFaktor,
        harga_ritel: sRitel,
        harga_grosir: sRitel
      });
    }

    const payload = {
      id: isEdit ? produk.id : undefined,
      nama, sku, barcode, kategori_id, satuan_dasar,
      hpp, harga_ritel, harga_grosir, min_grosir_qty,
      stok, stok_min, aktif, punya_varian,
      varian, satuan_konversi
    };

    const btnSimpan = $('#btn-simpan-produk', form);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;

    try {
      if (isEdit) {
        await apiCall('produk.update', payload);
        showToast('Data produk berhasil diperbarui.', 'success');
      } else {
        await apiCall('produk.create', payload);
        showToast('Produk baru berhasil ditambahkan.', 'success');
      }
      modal.close();
      await muatProduk(container, true, false);
    } catch (err) {
      showToast(err.message, 'error', 4500);
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
    }
  });
}


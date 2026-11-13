/**
 * produk.js — Modul Manajemen Master Produk, Multi Satuan & Varian
 * Sesuai aturan README bagian 6.4, 7 (Aturan Bisnis 1, 10, 11, 17) & Hak Akses
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, $$, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { formatRupiah, formatQty, parseRupiah, escapeHtml } from '../utils/format.js';

/**
 * Kompres file gambar ke format JPEG Base64 (maks 800px, kualitas 0.8)
 * Mengubah foto kamera/galeri 3-8 MB menjadi ~80-120 KB agar upload ke Google Drive super cepat & hemat kuota
 */
function kompresGambar(file, maxDimension = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File yang dipilih bukan gambar valid.'));
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({
          dataUrl: dataUrl,
          width: width,
          height: height,
          mimeType: 'image/jpeg',
          namaFile: (file.name || 'foto_produk').replace(/\.[^.]+$/, '') + '.jpg'
        });
      };
      img.onerror = () => reject(new Error('Gagal membaca data gambar.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

let filterState = {
  q: '',
  kategori_id: '',
  aktif_saja: false,
  view: localStorage.getItem('produk_view_mode') || (typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table'),
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
    if (selKat) {
      selKat.innerHTML = susunOpsiKategoriHtml(katRes.items || [], filterState.kategori_id, 'Semua Kategori');
    }
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
      try { localStorage.setItem('produk_view_mode', filterState.view); } catch (e) {}
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
  if (!area) return;

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
            <td data-label="Produk">
              <div class="row" style="align-items: center; gap: var(--sp-3); width: 100%;">
                <div class="prd-table-avatar">
                  ${p.foto_url ? `
                    <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" loading="lazy" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='grid';">
                    <div style="display: none; width: 100%; height: 100%; place-items: center;">${ICONS.package}</div>
                  ` : ICONS.package}
                </div>
                <div class="grow" style="min-width: 0;">
                  <div class="fw-bold text-md prd-table-nama">${escapeHtml(p.nama)}</div>
                  <div class="row" style="gap: 4px; margin-top: 3px; flex-wrap: wrap;">
                    ${p.sku ? `<span class="mono text-xs text-muted">${escapeHtml(p.sku)}</span>` : ''}
                    ${p.punya_varian && p.varian && p.varian.length ? `<span class="badge badge-info badge-sm">${p.varian.length} Varian</span>` : ''}
                    ${p.satuan_konversi && p.satuan_konversi.length ? `<span class="badge badge-sm">+${p.satuan_konversi.length} Satuan</span>` : ''}
                  </div>
                </div>
                <div class="d-none-desktop">
                  <span class="badge ${stokBadge.kelas}">${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar)}</span>
                </div>
              </div>
            </td>
            <td data-label="SKU / Barcode" class="d-none-mobile">
              <div class="mono text-xs">${escapeHtml(p.sku || '-')}</div>
              <div class="text-xs text-muted">${escapeHtml(p.barcode || '')}</div>
            </td>
            <td data-label="Satuan">${escapeHtml(p.satuan_dasar)}</td>
            ${!isKasir ? `<td class="num" data-label="HPP">${formatRupiah(p.hpp)}</td>` : ''}
            <td class="num fw-bold text-primary" data-label="Harga Ritel">${formatRupiah(p.harga_ritel)}</td>
            <td class="num text-muted" data-label="Harga Grosir">${p.harga_grosir ? formatRupiah(p.harga_grosir) : '-'}</td>
            <td style="text-align: center;" data-label="Stok" class="d-none-mobile">
              <span class="badge ${stokBadge.kelas}">${formatQty(p.stok)}</span>
            </td>
            ${canEdit ? `
              <td style="text-align: right;" data-label="Aksi">
                <div class="table-actions">
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-prd" data-id="${p.id}" title="Edit Produk">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    <span>Ubah</span>
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-sm btn-del-prd" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}" title="Hapus Produk">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span>Hapus</span>
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
            ${p.foto_url ? `
              <div style="height: 110px; border-radius: var(--radius-md); overflow: hidden; background: var(--surface-2); margin-bottom: var(--sp-2); border: 1px solid var(--border);">
                <img src="${escapeHtml(p.foto_url)}" alt="${escapeHtml(p.nama)}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" onerror="this.parentElement.style.display='none';">
              </div>
            ` : ''}
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
    if (area) {
      area.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div><strong>Gagal Memuat Produk</strong>: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
}

function dapatkanBadgeStok(stok, stokMin) {
  const s = Number(stok) || 0;
  const min = Number(stokMin) || 0;
  if (s <= 0) return { kelas: 'badge-danger', teks: 'Habis' };
  if (s <= min) return { kelas: 'badge-warning', teks: 'Menipis' };
  return { kelas: 'badge-success', teks: 'Aman' };
}

function susunOpsiKategoriHtml(daftarKategori, selectedId = '', placeholder = '-- Tanpa Kategori --') {
  let html = `<option value="">${escapeHtml(placeholder)}</option>`;
  const parents = (daftarKategori || []).filter((k) => !k.parent_id);
  parents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

  const subsByParent = {};
  (daftarKategori || []).forEach((k) => {
    if (k.parent_id) {
      if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
      subsByParent[k.parent_id].push(k);
    }
  });

  parents.forEach((p) => {
    const subs = subsByParent[p.id] || [];
    subs.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

    if (subs.length > 0) {
      html += `<optgroup label="📁 ${escapeHtml(p.nama)}">`;
      const isParentSel = selectedId === p.id ? 'selected' : '';
      html += `<option value="${p.id}" ${isParentSel}>📁 ${escapeHtml(p.nama)} (Utama)</option>`;
      subs.forEach((c) => {
        const isChildSel = selectedId === c.id ? 'selected' : '';
        html += `<option value="${c.id}" ${isChildSel}>&nbsp;&nbsp;&nbsp;&nbsp;↳ ${escapeHtml(c.nama)}</option>`;
      });
      html += `</optgroup>`;
    } else {
      const isParentSel = selectedId === p.id ? 'selected' : '';
      html += `<option value="${p.id}" ${isParentSel}>📁 ${escapeHtml(p.nama)}</option>`;
    }
  });

  // Handle orphans jika ada
  const orphans = (daftarKategori || []).filter((k) => k.parent_id && !parents.some((p) => p.id === k.parent_id));
  if (orphans.length > 0) {
    html += `<optgroup label="Lainnya">`;
    orphans.forEach((o) => {
      const isOrphanSel = selectedId === o.id ? 'selected' : '';
      html += `<option value="${o.id}" ${isOrphanSel}>🏷️ ${escapeHtml(o.nama)}</option>`;
    });
    html += `</optgroup>`;
  }

  return html;
}

/**
 * Hitung digit checksum EAN-13 (modulo 10).
 */
function hitungChecksumEan13(str12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(str12.charAt(i), 10) || 0;
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const rem = sum % 10;
  return rem === 0 ? 0 : 10 - rem;
}

/**
 * Generate barcode 13-digit EAN-13 in-house retail (Prefix 20 + yyMMdd + 4-digit random + check digit).
 */
function generateEan13Barcode() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd4 = String(Math.floor(1000 + Math.random() * 9000));
  const raw12 = '20' + yy + mm + dd + rnd4;
  const checksum = hitungChecksumEan13(raw12);
  return raw12 + String(checksum);
}

/**
 * Generate kode SKU otomatis: SKU-YYYYMMDD-XXXX
 */
function generateSkuCode(prefix = 'SKU') {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd4 = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${y}${m}${day}-${rnd4}`;
}

/**
 * Modal Form Tambah / Edit Produk Lengkap
 */
async function bukaModalFormProduk(container, produk) {
  const isEdit = !!produk;
  let isSubmitting = false;
  let daftarKategori = [];
  try {
    const kRes = await apiCall('kategori.list', {});
    daftarKategori = kRes.items || [];
  } catch (e) {}

  const optionsKat = susunOpsiKategoriHtml(daftarKategori, isEdit ? produk.kategori_id : '', '-- Tanpa Kategori --');

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
        <!-- Foto Produk (Google Drive) -->
        <div class="field" style="margin-bottom: var(--sp-2);">
          <label class="field-label">Foto Produk (Google Drive)</label>
          <div class="row items-center" style="gap: var(--sp-3); flex-wrap: wrap;">
            <!-- Box Preview Foto -->
            <div id="prd-foto-preview-box" style="width: 80px; height: 80px; border-radius: var(--radius-lg); border: 2px dashed var(--border); display: grid; place-items: center; overflow: hidden; background: var(--surface-2); position: relative; flex-shrink: 0;">
              <img src="${isEdit && produk.foto_url ? escapeHtml(produk.foto_url) : ''}" alt="Foto" id="prd-foto-img-preview" style="width: 100%; height: 100%; object-fit: cover; ${isEdit && produk.foto_url ? '' : 'display: none;'}">
              <div id="prd-foto-placeholder" style="text-align: center; color: var(--text-muted); ${isEdit && produk.foto_url ? 'display: none;' : ''}">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                <div style="font-size: 9px; margin-top: 2px;">Belum Ada</div>
              </div>
              <div id="prd-foto-loading" style="display: none; position: absolute; inset: 0; background: rgba(0,0,0,0.65); place-items: center; color: #fff; font-size: 11px; font-weight: 500;">
                <span class="spinner-sm" style="border-color: #fff; border-top-color: transparent;"></span>
              </div>
            </div>

            <!-- Tombol Aksi Upload & Input Tersembunyi -->
            <div class="stack" style="gap: var(--sp-1); flex: 1; min-width: 200px;">
              <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-pilih-foto" style="display: inline-flex; align-items: center; gap: 6px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                  <span>Pilih Galeri</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-kamera-foto" style="display: inline-flex; align-items: center; gap: 6px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                  <span>Kamera</span>
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger" id="btn-hapus-foto" style="${isEdit && produk.foto_url ? '' : 'display: none;'} display: inline-flex; align-items: center; gap: 4px;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  <span>Hapus</span>
                </button>
              </div>
              <input type="file" id="input-file-foto" accept="image/*" style="display: none;">
              <input type="file" id="input-kamera-foto" accept="image/*" capture="environment" style="display: none;">
              <input type="hidden" id="prd-foto-url" value="${isEdit && produk.foto_url ? escapeHtml(produk.foto_url) : ''}">
              <span class="field-hint" id="prd-foto-hint">Tersimpan di Google Drive Toko Anda (otomatis dikompres &lt; 150 KB).</span>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="prd-nama">Nama Produk <span class="wajib">*</span></label>
          <input type="text" class="input" id="prd-nama" value="${isEdit ? escapeHtml(produk.nama) : ''}" placeholder="Cth: Semen Padang 50kg, Cat Dulux Pentalite 2.5L" required autofocus>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <div class="row items-center justify-between" style="margin-bottom: 4px;">
              <label class="field-label" for="prd-sku" style="margin-bottom: 0;">Kode SKU</label>
              <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-sku" title="Buat SKU Otomatis" style="padding: 1px 6px; font-size: 11px;">🎲 Auto</button>
            </div>
            <input type="text" class="input mono uppercase" id="prd-sku" value="${isEdit ? escapeHtml(produk.sku || '') : ''}" placeholder="Auto (cth: SKU-20261113-0001)">
            <span class="field-hint">Kosongkan jika ingin dibuat otomatis</span>
          </div>
          <div class="field">
            <div class="row items-center justify-between" style="margin-bottom: 4px;">
              <label class="field-label" for="prd-barcode" style="margin-bottom: 0;">Barcode</label>
              <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-barcode" title="Buat Barcode EAN-13 Otomatis" style="padding: 1px 6px; font-size: 11px;">🎲 Auto</button>
            </div>
            <input type="text" class="input mono" id="prd-barcode" value="${isEdit ? escapeHtml(produk.barcode || '') : ''}" placeholder="Auto (13 digit EAN-13)">
            <span class="field-hint">Kosongkan jika ingin dibuat otomatis</span>
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
        <!-- Input HPP (Harga Modal Acuan) -->
        <div class="field">
          <label class="field-label" for="prd-hpp">
            <span>HPP (Harga Beli Pokok / Modal) <span class="wajib">*</span></span>
          </label>
          <div class="input-prefix" style="max-width: 320px;">
            <span>Rp</span>
            <input type="text" class="input input-num fw-bold" id="prd-hpp" value="${isEdit ? formatRupiah(produk.hpp, false) : '0'}" required placeholder="0">
          </div>
          <span class="field-hint">Dasar acuan perhitungan persentase margin keuntungan ritel dan grosir.</span>
        </div>

        <div class="divider"></div>

        <!-- 1. Kalkulator Otomatis Margin & Harga Ritel (Eceran) -->
        <div class="card card-body stack" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); gap: var(--sp-2);">
          <div class="row-between items-center" style="flex-wrap: wrap; gap: var(--sp-1);">
            <div>
              <span class="fw-bold text-sm" style="color: var(--primary);">1. Harga Jual Ritel (Eceran)</span>
              <div class="text-xs text-muted">Penjualan umum per satuan dasar ke konsumen</div>
            </div>
            <div id="badge-margin-ritel" class="badge badge-success text-xs font-mono">
              Margin: 0% | Laba: Rp 0
            </div>
          </div>

          <div class="form-grid cols-2" style="gap: var(--sp-3); margin-top: 4px;">
            <div class="field">
              <label class="field-label" for="prd-margin-ritel">
                <span>Margin Keuntungan Ritel (%)</span>
              </label>
              <div class="input-prefix">
                <span>%</span>
                <input type="number" step="0.1" class="input input-num fw-semibold" id="prd-margin-ritel" placeholder="Cth: 20">
              </div>
              <!-- Chip Preset Cepat Margin Ritel -->
              <div class="cluster" style="gap: 4px; margin-top: 4px;">
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="10">+10%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="15">+15%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="20">+20%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="25">+25%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="30">+30%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-ritel" data-margin="50">+50%</button>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="prd-ritel">
                <span>Harga Jual Ritel (Rp) <span class="wajib">*</span></span>
              </label>
              <div class="input-prefix">
                <span>Rp</span>
                <input type="text" class="input input-num fw-bold text-md" id="prd-ritel" value="${isEdit ? formatRupiah(produk.harga_ritel, false) : '0'}" required>
              </div>
              <span class="field-hint">Ketik harga langsung atau tentukan persen di sebelah kiri.</span>
            </div>
          </div>
        </div>

        <!-- 2. Kalkulator Otomatis Margin & Harga Grosir (Partai / Tukang) -->
        <div class="card card-body stack" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); gap: var(--sp-2); margin-top: var(--sp-1);">
          <div class="row-between items-center" style="flex-wrap: wrap; gap: var(--sp-1);">
            <div>
              <span class="fw-bold text-sm" style="color: var(--amber-600, #d97706);">2. Harga Jual Grosir (Partai / Tukang)</span>
              <div class="text-xs text-muted">Harga khusus belanja borongan proyek atau mitra rekanan</div>
            </div>
            <div id="badge-margin-grosir" class="badge badge-warning text-xs font-mono">
              Margin: 0% | Laba: Rp 0
            </div>
          </div>

          <div class="form-grid cols-2" style="gap: var(--sp-3); margin-top: 4px;">
            <div class="field">
              <label class="field-label" for="prd-margin-grosir">
                <span>Margin Keuntungan Grosir (%)</span>
              </label>
              <div class="input-prefix">
                <span>%</span>
                <input type="number" step="0.1" class="input input-num fw-semibold" id="prd-margin-grosir" placeholder="Cth: 10">
              </div>
              <!-- Chip Preset Cepat Margin Grosir -->
              <div class="cluster" style="gap: 4px; margin-top: 4px;">
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="5">+5%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="8">+8%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="10">+10%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="12">+12%</button>
                <button type="button" class="btn btn-xs btn-outline btn-chip-margin-grosir" data-margin="15">+15%</button>
              </div>
            </div>

            <div class="form-grid cols-2" style="gap: var(--sp-2);">
              <div class="field">
                <label class="field-label" for="prd-grosir">
                  <span>Harga Grosir (Rp)</span>
                </label>
                <div class="input-prefix">
                  <span>Rp</span>
                  <input type="text" class="input input-num fw-semibold" id="prd-grosir" value="${isEdit && produk.harga_grosir ? formatRupiah(produk.harga_grosir, false) : ''}" placeholder="Sama dg ritel">
                </div>
              </div>

              <div class="field">
                <label class="field-label" for="prd-min-grosir">
                  <span>Min. Qty Grosir</span>
                </label>
                <input type="number" class="input input-num" id="prd-min-grosir" value="${isEdit ? produk.min_grosir_qty || 1 : 1}" min="1">
              </div>
            </div>
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

  // -------------------------------------------------------------
  // Kalkulator Otomatis Persentase Margin & Laba (2-Arah)
  // -------------------------------------------------------------
  const inpHpp = $('#prd-hpp', form);
  const inpRitel = $('#prd-ritel', form);
  const inpMarginRitel = $('#prd-margin-ritel', form);
  const badgeMarginRitel = $('#badge-margin-ritel', form);

  const inpGrosir = $('#prd-grosir', form);
  const inpMarginGrosir = $('#prd-margin-grosir', form);
  const badgeMarginGrosir = $('#badge-margin-grosir', form);

  const updateBadgeMargin = (badge, hpp, harga, isGrosir = false) => {
    if (!badge) return;
    if (hpp <= 0 && harga <= 0) {
      badge.className = 'badge text-xs font-mono';
      badge.style.background = 'var(--surface-3)';
      badge.style.color = 'var(--text-muted)';
      badge.textContent = 'Margin: 0% | Laba: Rp 0';
      return;
    }
    const laba = harga - hpp;
    const marginPct = hpp > 0 ? ((laba / hpp) * 100) : 0;
    const pctStr = (marginPct >= 0 ? '+' : '') + marginPct.toFixed(1) + '%';

    if (laba < 0) {
      badge.className = 'badge badge-danger text-xs font-mono';
      badge.textContent = `RUGI ${formatRupiah(Math.abs(laba))} (${pctStr})`;
    } else if (laba === 0) {
      badge.className = 'badge badge-warning text-xs font-mono';
      badge.textContent = `Balik Modal (Rp 0 / 0%)`;
    } else {
      badge.className = isGrosir ? 'badge badge-warning text-xs font-mono' : 'badge badge-success text-xs font-mono';
      badge.textContent = `Margin: ${pctStr} | Laba: ${formatRupiah(laba)}`;
    }
  };

  const syncDariHarga = (target) => {
    const hpp = parseRupiah(inpHpp.value) || 0;
    if (target === 'ritel') {
      const harga = parseRupiah(inpRitel.value) || 0;
      if (hpp > 0 && harga > 0) {
        const pct = ((harga - hpp) / hpp) * 100;
        inpMarginRitel.value = pct.toFixed(1);
      } else {
        inpMarginRitel.value = '';
      }
      updateBadgeMargin(badgeMarginRitel, hpp, harga, false);
    } else if (target === 'grosir') {
      const harga = parseRupiah(inpGrosir.value) || 0;
      if (hpp > 0 && harga > 0) {
        const pct = ((harga - hpp) / hpp) * 100;
        inpMarginGrosir.value = pct.toFixed(1);
      } else {
        inpMarginGrosir.value = '';
      }
      updateBadgeMargin(badgeMarginGrosir, hpp, harga, true);
    }
  };

  const syncDariMargin = (target) => {
    const hpp = parseRupiah(inpHpp.value) || 0;
    if (target === 'ritel') {
      const pct = parseFloat(inpMarginRitel.value);
      if (hpp > 0 && !isNaN(pct)) {
        const hitungan = hpp * (1 + pct / 100);
        const bulat = Math.round(hitungan / 100) * 100;
        inpRitel.value = formatRupiah(bulat, false);
        updateBadgeMargin(badgeMarginRitel, hpp, bulat, false);
      }
    } else if (target === 'grosir') {
      const pct = parseFloat(inpMarginGrosir.value);
      if (hpp > 0 && !isNaN(pct)) {
        const hitungan = hpp * (1 + pct / 100);
        const bulat = Math.round(hitungan / 100) * 100;
        inpGrosir.value = formatRupiah(bulat, false);
        updateBadgeMargin(badgeMarginGrosir, hpp, bulat, true);
      }
    }
  };

  inpHpp?.addEventListener('input', () => {
    if (inpMarginRitel?.value !== '') syncDariMargin('ritel');
    else syncDariHarga('ritel');

    if (inpMarginGrosir?.value !== '') syncDariMargin('grosir');
    else if (inpGrosir?.value) syncDariHarga('grosir');
  });

  inpRitel?.addEventListener('input', () => syncDariHarga('ritel'));
  inpMarginRitel?.addEventListener('input', () => syncDariMargin('ritel'));

  inpGrosir?.addEventListener('input', () => syncDariHarga('grosir'));
  inpMarginGrosir?.addEventListener('input', () => syncDariMargin('grosir'));

  // Tombol Preset Margin Cepat
  form.querySelectorAll('.btn-chip-margin-ritel').forEach((chip) => {
    chip.addEventListener('click', () => {
      const pct = parseFloat(chip.getAttribute('data-margin'));
      inpMarginRitel.value = pct;
      syncDariMargin('ritel');
    });
  });

  form.querySelectorAll('.btn-chip-margin-grosir').forEach((chip) => {
    chip.addEventListener('click', () => {
      const pct = parseFloat(chip.getAttribute('data-margin'));
      inpMarginGrosir.value = pct;
      syncDariMargin('grosir');
    });
  });

  // Hitung awal saat form dibuka
  syncDariHarga('ritel');
  if (inpGrosir?.value) syncDariHarga('grosir');

  // Quick generator SKU & Barcode induk
  $('#btn-auto-sku', form)?.addEventListener('click', () => {
    const input = $('#prd-sku', form);
    if (input) {
      input.value = generateSkuCode('SKU');
      showToast(`Kode SKU dibuat: ${input.value}`, 'info', 2000);
    }
  });

  $('#btn-auto-barcode', form)?.addEventListener('click', () => {
    const input = $('#prd-barcode', form);
    if (input) {
      input.value = generateEan13Barcode();
      showToast(`Barcode EAN-13 dibuat: ${input.value}`, 'info', 2000);
    }
  });

  // Upload & Manajemen Foto Produk ke Google Drive
  const imgPreview = $('#prd-foto-img-preview', form);
  const placeholderPreview = $('#prd-foto-placeholder', form);
  const loadingPreview = $('#prd-foto-loading', form);
  const inputUrl = $('#prd-foto-url', form);
  const btnHapusFoto = $('#btn-hapus-foto', form);
  const inputFile = $('#input-file-foto', form);
  const inputCam = $('#input-kamera-foto', form);

  const prosesUploadFoto = async (file) => {
    if (!file) return;
    try {
      if (loadingPreview) loadingPreview.style.display = 'grid';
      showToast('Mengompresi & mengunggah foto ke Google Drive...', 'info', 3000);
      const kompresi = await kompresGambar(file, 800, 0.8);
      const res = await apiCall('produk.uploadFoto', {
        nama_file: kompresi.namaFile,
        mime_type: kompresi.mimeType,
        base64: kompresi.dataUrl
      });
      if (inputUrl) inputUrl.value = res.foto_url;
      if (imgPreview) {
        imgPreview.src = res.foto_url;
        imgPreview.style.display = 'block';
      }
      if (placeholderPreview) placeholderPreview.style.display = 'none';
      if (btnHapusFoto) btnHapusFoto.style.display = 'inline-flex';
      showToast('Foto produk berhasil disimpan di Google Drive!', 'success');
    } catch (err) {
      showToast('Gagal upload foto: ' + err.message, 'error', 4500);
    } finally {
      if (loadingPreview) loadingPreview.style.display = 'none';
      if (inputFile) inputFile.value = '';
      if (inputCam) inputCam.value = '';
    }
  };

  $('#btn-pilih-foto', form)?.addEventListener('click', () => inputFile?.click());
  $('#btn-kamera-foto', form)?.addEventListener('click', () => inputCam?.click());
  inputFile?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) prosesUploadFoto(e.target.files[0]);
  });
  inputCam?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) prosesUploadFoto(e.target.files[0]);
  });
  btnHapusFoto?.addEventListener('click', () => {
    if (inputUrl) inputUrl.value = '';
    if (imgPreview) {
      imgPreview.src = '';
      imgPreview.style.display = 'none';
    }
    if (placeholderPreview) placeholderPreview.style.display = 'block';
    if (btnHapusFoto) btnHapusFoto.style.display = 'none';
    showToast('Foto produk dihapus dari formulir.', 'info');
  });

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
        <input type="text" class="input mono uppercase var-sku" placeholder="Auto SKU Varian" value="${escapeHtml(v.sku || '')}" title="Kosongkan jika ingin dibuat otomatis">
        <input type="text" class="input mono var-barcode" placeholder="Auto Barcode Varian" value="${escapeHtml(v.barcode || '')}" title="Kosongkan jika ingin dibuat otomatis">
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
        <input type="text" class="input sat-nama" placeholder="Satuan (cth: Dus)" value="${escapeHtml(s.satuan || '')}" style="max-width: 130px;" required>
        <span class="text-sm">=</span>
        <input type="number" step="0.001" class="input input-num sat-faktor" placeholder="Faktor (cth: 24)" value="${s.faktor || ''}" style="max-width: 90px;" required>
        <span class="text-xs text-muted satuan-dasar-label">${escapeHtml($('#prd-satuan', form).value || 'pcs')}</span>
        <input type="text" class="input mono sat-barcode" placeholder="Auto Barcode Satuan" value="${escapeHtml(s.barcode || '')}" style="max-width: 150px;" title="Kosongkan jika ingin dibuat otomatis">
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
    if (isSubmitting) return;

    const nama = $('#prd-nama', form).value.trim();
    let sku = $('#prd-sku', form).value.trim();
    let barcode = $('#prd-barcode', form).value.trim();

    // Auto-generate SKU & Barcode jika kosong
    if (!sku) {
      sku = generateSkuCode('SKU');
      $('#prd-sku', form).value = sku;
    }
    if (!barcode) {
      barcode = generateEan13Barcode();
      $('#prd-barcode', form).value = barcode;
    }

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

        let vSku = b.querySelector('.var-sku').value.trim();
        if (!vSku) vSku = `${sku}-V${varian.length + 1}`;
        let vBarcode = b.querySelector('.var-barcode').value.trim();
        if (!vBarcode) vBarcode = generateEan13Barcode();

        varian.push({
          id: b.querySelector('.var-id').value || undefined,
          nama_varian: vNama,
          sku: vSku,
          barcode: vBarcode,
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

      let sBarcode = (s.querySelector('.sat-barcode')?.value || '').trim();
      if (!sBarcode) sBarcode = generateEan13Barcode();

      satuan_konversi.push({
        satuan: sNama,
        faktor: sFaktor,
        barcode: sBarcode,
        harga_ritel: sRitel,
        harga_grosir: sRitel
      });
    }

    const foto_url = ($('#prd-foto-url', form)?.value || '').trim();

    const payload = {
      id: isEdit ? produk.id : undefined,
      nama, sku, barcode, kategori_id, satuan_dasar,
      hpp, harga_ritel, harga_grosir, min_grosir_qty,
      stok, stok_min, aktif, punya_varian,
      foto_url,
      varian, satuan_konversi
    };

    const btnSimpan = $('#btn-simpan-produk', form);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;
    isSubmitting = true;

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
      isSubmitting = false;
    }
  });
}


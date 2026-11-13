/**
 * kategori.js — Modul CRUD Kategori & Sub Kategori Produk (Owner & Admin)
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';

let kategoriCache = [];

export async function renderKategoriModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Kategori Produk</h2>
          <p>Pengelompokan barang dan bahan bangunan untuk mempermudah pencarian kasir</p>
        </div>
        ${canEdit ? `
          <div>
            <button type="button" class="btn btn-primary" id="btn-tambah-kategori">
              ${ICONS.plus || ''}
              <span>Tambah Kategori</span>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Info Panduan Sub Kategori -->
      <div class="card card-body" style="background: linear-gradient(135deg, rgba(234, 88, 12, 0.06) 0%, rgba(249, 115, 22, 0.02) 100%); border-left: 4px solid var(--primary); padding: var(--sp-3) var(--sp-4);">
        <div class="row" style="align-items: flex-start; gap: var(--sp-3);">
          <div style="color: var(--primary); font-size: 1.25rem; line-height: 1; margin-top: 2px;">
            ${ICONS.info}
          </div>
          <div class="grow" style="font-size: var(--fs-sm);">
            <strong style="color: var(--text-heading); display: block; margin-bottom: 3px;">Panduan Struktur Kategori & Sub Kategori:</strong>
            <div style="color: var(--text-muted); line-height: 1.6;">
              • <strong>Kategori Utama</strong> (Cth: <em>PIPA PVC</em>, <em>CAT & PELAPIS</em>, <em>SEMEN</em>) berfungsi sebagai kelompok induk.<br>
              • <strong>Sub Kategori</strong> (Cth: <em>Pipa AW</em>, <em>Pipa D</em>, <em>Fitting</em> di bawah <em>PIPA PVC</em>) dibuat dengan klik tombol <strong>+ Sub</strong> pada baris kategori induknya.<br>
              • Di kasir dan katalog, saat kasir memilih kategori utama, seluruh barang di dalam sub-kategori juga otomatis ditampilkan.
            </div>
          </div>
        </div>
      </div>

      <div class="card card-body" id="area-kategori">
        ${renderSkeleton(3)}
      </div>
    </div>
  `;

  await muatKategori(container, canEdit);

  if (canEdit) {
    $('#btn-tambah-kategori', container)?.addEventListener('click', () => {
      bukaModalFormKategori(container, null, kategoriCache);
    });
  }
}

async function muatKategori(container, canEdit) {
  const area = $('#area-kategori', container);
  if (!area) return;
  try {
    const res = await apiCall('kategori.list', {});
    const items = res.items || [];
    kategoriCache = items;

    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: 'Kategori Belum Ada',
        text: 'Mulai dengan menambahkan kategori utama seperti "Bahan Bangunan", "Cat & Pelapis", dsb.',
        icon: ICONS.tag,
        actionButton: canEdit ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">${ICONS.plus || ''}<span>Tambah Kategori</span></button>` : ''
      });
      area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
        bukaModalFormKategori(container, null, kategoriCache);
      });
      return;
    }

    // Peta nama kategori
    const petaKategori = {};
    items.forEach((k) => { petaKategori[k.id] = k.nama; });

    // Kelompokkan Kategori Utama & Sub Kategori
    const parents = items.filter((k) => !k.parent_id);
    parents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

    const subsByParent = {};
    items.forEach((k) => {
      if (k.parent_id) {
        if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
        subsByParent[k.parent_id].push(k);
      }
    });

    Object.keys(subsByParent).forEach((pid) => {
      subsByParent[pid].sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));
    });

    // Sub kategori yang induknya sudah terhapus (orphan)
    const orphans = items.filter((k) => k.parent_id && !petaKategori[k.parent_id]);

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Nama Kategori</th>
              <th>Tipe & Hirarki</th>
              <th style="width: 80px; text-align: right;">Urutan</th>
              ${canEdit ? '<th style="width: 250px; text-align: right;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
    `;

    // Render Parent & Sub Categories
    parents.forEach((p) => {
      const subs = subsByParent[p.id] || [];
      html += `
        <tr class="kat-row-parent" style="border-top: 1px solid var(--border);">
          <td data-label="Kategori">
            <div class="row" style="align-items: center; gap: var(--sp-2);">
              <div class="prd-table-avatar" style="width: 36px; height: 36px; background: var(--primary-soft); color: var(--primary);">
                ${ICONS.folder || ICONS.tag}
              </div>
              <div class="grow">
                <div class="fw-bold text-md" style="color: var(--text-heading);">${escapeHtml(p.nama)}</div>
              </div>
            </div>
          </td>
          <td data-label="Tipe & Hirarki">
            <div class="row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
              <span class="badge badge-primary">Kategori Utama</span>
              ${subs.length > 0
                ? `<span class="badge badge-info">${subs.length} Sub Kategori</span>`
                : `<span class="text-xs text-muted">(Belum ada sub)</span>`
              }
            </div>
          </td>
          <td class="num" data-label="Urutan">${p.urutan || 0}</td>
          ${canEdit ? `
            <td style="text-align: right;" data-label="Aksi">
              <div class="cluster" style="justify-content: flex-end; gap: 6px; flex-wrap: nowrap;">
                <button type="button" class="btn btn-primary btn-sm btn-tambah-sub" data-parent-id="${p.id}" data-parent-nama="${escapeHtml(p.nama)}" title="Tambah Sub Kategori di bawah ${escapeHtml(p.nama)}" style="border-radius: var(--radius-full);">
                  ${ICONS.plus || ''}
                  <span>Sub</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-edit-kat" data-id="${p.id}" title="Ubah" style="border-radius: var(--radius-full);">
                  ${ICONS.settings}
                  <span>Ubah</span>
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-kat" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}" data-sub-count="${subs.length}" title="Hapus" style="border-radius: var(--radius-full);">
                  ${ICONS.x}
                  <span>Hapus</span>
                </button>
              </div>
            </td>
          ` : ''}
        </tr>
      `;

      // Render Sub-kategori anak di bawah parent
      subs.forEach((c) => {
        html += `
          <tr class="kat-row-sub" style="background-color: var(--surface-2); border-left: 3px solid var(--primary-soft);">
            <td data-label="Kategori">
              <div class="row" style="align-items: center; gap: var(--sp-2); padding-left: var(--sp-4);">
                <span style="color: var(--primary); font-weight: bold; font-family: monospace; font-size: 1.15rem; line-height: 1;">↳</span>
                <div class="prd-table-avatar" style="width: 28px; height: 28px; background: var(--surface-3); color: var(--text-muted);">
                  ${ICONS.tag}
                </div>
                <div class="grow">
                  <div class="fw-medium text-sm" style="color: var(--text-body);">${escapeHtml(c.nama)}</div>
                </div>
              </div>
            </td>
            <td data-label="Tipe & Hirarki">
              <span class="badge badge-sm" style="background: var(--surface-3); border: 1px solid var(--border);">Sub Kategori</span>
              <div class="text-xs text-muted" style="margin-top: 2px;">Induk: <strong>${escapeHtml(p.nama)}</strong></div>
            </td>
            <td class="num" data-label="Urutan">${c.urutan || 0}</td>
            ${canEdit ? `
              <td style="text-align: right;" data-label="Aksi">
                <div class="cluster" style="justify-content: flex-end; gap: 6px; flex-wrap: nowrap;">
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-kat" data-id="${c.id}" title="Ubah" style="border-radius: var(--radius-full);">
                    ${ICONS.settings}
                    <span>Ubah</span>
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-kat" data-id="${c.id}" data-nama="${escapeHtml(c.nama)}" data-sub-count="0" title="Hapus" style="border-radius: var(--radius-full);">
                    ${ICONS.x}
                    <span>Hapus</span>
                  </button>
                </div>
              </td>
            ` : ''}
          </tr>
        `;
      });
    });

    // Render orphan sub categories jika ada
    orphans.forEach((o) => {
      html += `
        <tr class="kat-row-orphan" style="background-color: var(--warning-soft); border-left: 3px solid var(--warning);">
          <td data-label="Kategori">
            <div class="row" style="align-items: center; gap: var(--sp-2); padding-left: var(--sp-2);">
              <div class="prd-table-avatar" style="width: 28px; height: 28px;">${ICONS.alertTriangle}</div>
              <div class="fw-medium">${escapeHtml(o.nama)}</div>
            </div>
          </td>
          <td data-label="Tipe & Hirarki">
            <span class="badge badge-warning">Induk Tidak Ditemukan</span>
          </td>
          <td class="num" data-label="Urutan">${o.urutan || 0}</td>
          ${canEdit ? `
            <td style="text-align: right;" data-label="Aksi">
              <div class="cluster" style="justify-content: flex-end; gap: 6px; flex-wrap: nowrap;">
                <button type="button" class="btn btn-secondary btn-sm btn-edit-kat" data-id="${o.id}" title="Ubah">
                  ${ICONS.settings}
                  <span>Ubah</span>
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-kat" data-id="${o.id}" data-nama="${escapeHtml(o.nama)}" data-sub-count="0" title="Hapus">
                  ${ICONS.x}
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
    `;

    area.innerHTML = html;

    // Pasang handler tombol
    if (canEdit) {
      // Tombol + Sub Kategori langsung pada Kategori Induk
      area.querySelectorAll('.btn-tambah-sub').forEach((btn) => {
        btn.addEventListener('click', () => {
          const parentId = btn.getAttribute('data-parent-id');
          bukaModalFormKategori(container, null, kategoriCache, parentId);
        });
      });

      // Tombol Ubah Kategori
      area.querySelectorAll('.btn-edit-kat').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const kat = items.find((x) => x.id === id);
          if (kat) bukaModalFormKategori(container, kat, kategoriCache);
        });
      });

      // Tombol Hapus Kategori
      area.querySelectorAll('.btn-hapus-kat').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const nama = btn.getAttribute('data-nama');
          const subCount = parseInt(btn.getAttribute('data-sub-count') || '0', 10);

          if (subCount > 0) {
            showToast(`Kategori "${nama}" masih memiliki ${subCount} sub-kategori. Hapus atau pindahkan sub-kategori terlebih dahulu sebelum menghapus kategori utama ini.`, 'warning', 4500);
            return;
          }

          const setuju = await showConfirm({
            title: 'Hapus Kategori',
            message: `Apakah Anda yakin ingin menghapus kategori "${nama}"?`,
            confirmText: 'Ya, Hapus',
            danger: true
          });
          if (!setuju) return;

          try {
            await apiCall('kategori.delete', { id });
            showToast('Kategori berhasil dihapus.', 'success');
            await muatKategori(container, canEdit);
          } catch (err) {
            showToast(err.message, 'error', 4500);
          }
        });
      });
    }
  } catch (err) {
    if (area) {
      area.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div><strong>Gagal Memuat Kategori</strong>: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
}

function bukaModalFormKategori(container, kat, semuaKategori = [], defaultParentId = '') {
  const isEdit = !!kat;
  const activeParentId = isEdit ? (kat.parent_id || '') : (defaultParentId || '');

  // Hanya kategori utama (yang tidak memiliki parent_id) yang boleh dipilih sebagai induk, dan bukan dirinya sendiri
  const listPilihanInduk = (semuaKategori || []).filter((k) => {
    if (isEdit && k.id === kat.id) return false;
    if (k.parent_id) return false; // Mencegah nested > 2 level
    return true;
  });

  const parentTerpilih = (semuaKategori || []).find((k) => k.id === activeParentId);

  let optionsParent = '<option value="">-- Kategori Utama (Tanpa Induk) --</option>';
  listPilihanInduk.forEach((k) => {
    const selected = activeParentId === k.id ? 'selected' : '';
    optionsParent += `<option value="${k.id}" ${selected}>📁 ${escapeHtml(k.nama)}</option>`;
  });

  let modalTitle = 'Tambah Kategori Baru';
  if (isEdit) {
    modalTitle = `Ubah Kategori: ${kat.nama}`;
  } else if (parentTerpilih) {
    modalTitle = `Tambah Sub Kategori (${parentTerpilih.nama})`;
  }

  const initialHint = activeParentId && parentTerpilih
    ? `Akan disimpan sebagai <strong>Sub-Kategori</strong> di bawah induk <em>${escapeHtml(parentTerpilih.nama)}</em>.`
    : `Pilih kategori induk jika ini adalah sub-kategori. Kosongkan jika ini adalah <strong>Kategori Utama</strong>.`;

  const bodyHtml = `
    <form id="form-kategori" class="stack">
      <div class="field">
        <label class="field-label" for="kat-nama">Nama Kategori <span class="wajib">*</span></label>
        <input type="text" class="input" id="kat-nama" value="${isEdit ? escapeHtml(kat.nama) : ''}" placeholder="Cth: PIPA AW, SEMEN GRESIK, CAT TEMBOK" required autofocus>
      </div>

      <div class="field">
        <label class="field-label" for="kat-parent">Kategori Induk (Pilih Induk untuk Sub-Kategori)</label>
        <select class="select" id="kat-parent">
          ${optionsParent}
        </select>
        <span class="field-hint" id="hint-kat-parent">${initialHint}</span>
      </div>

      <div class="field">
        <label class="field-label" for="kat-urutan">Nomor Urut Tampilan</label>
        <input type="number" class="input input-num" id="kat-urutan" value="${isEdit ? kat.urutan || 0 : 0}">
      </div>

      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-2)">
        <button type="button" class="btn btn-ghost btn-close-modal">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-kat">
          ${isEdit ? 'Simpan Perubahan' : 'Tambah Kategori'}
        </button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: modalTitle,
    body: bodyHtml
  });

  const form = $('#form-kategori', modal.el);

  // Update hint saat dropdown induk berubah
  $('#kat-parent', form)?.addEventListener('change', (e) => {
    const val = e.target.value;
    const hintEl = $('#hint-kat-parent', form);
    if (!hintEl) return;
    if (val) {
      const selectedParent = (semuaKategori || []).find((k) => k.id === val);
      hintEl.innerHTML = `Akan disimpan sebagai <strong>Sub-Kategori</strong> di bawah induk <em>${escapeHtml(selectedParent?.nama || '')}</em>.`;
    } else {
      hintEl.innerHTML = `Akan disimpan sebagai <strong>Kategori Utama</strong> (level teratas tanpa induk).`;
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#kat-nama', form).value.trim();
    const parent_id = $('#kat-parent', form).value.trim();
    const urutan = parseInt($('#kat-urutan', form).value, 10) || 0;

    if (!nama) {
      showToast('Nama kategori wajib diisi.', 'warning');
      return;
    }

    const btnSimpan = $('#btn-simpan-kat', form);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;

    try {
      if (isEdit) {
        await apiCall('kategori.update', { id: kat.id, nama, parent_id, urutan });
        showToast('Kategori berhasil diperbarui.', 'success');
      } else {
        await apiCall('kategori.create', { nama, parent_id, urutan });
        showToast('Kategori baru berhasil ditambahkan.', 'success');
      }
      modal.close();
      await muatKategori(container, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
    }
  });
}

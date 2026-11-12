/**
 * kategori.js — Modul CRUD Kategori & Sub Kategori Produk (Owner & Admin)
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';

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
              <span>+ Tambah Kategori</span>
            </button>
          </div>
        ` : ''}
      </div>

      <div class="card card-body" id="area-kategori">
        ${renderSkeleton(3)}
      </div>
    </div>
  `;

  await muatKategori(container, canEdit);

  if (canEdit) {
    $('#btn-tambah-kategori', container)?.addEventListener('click', () => {
      bukaModalFormKategori(container, null);
    });
  }
}

async function muatKategori(container, canEdit) {
  const area = $('#area-kategori', container);
  try {
    const res = await apiCall('kategori.list', {});
    const items = res.items || [];

    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: 'Kategori Belum Ada',
        text: 'Mulai dengan menambahkan kategori utama seperti "Bahan Bangunan", "Cat & Pelapis", dsb.',
        icon: ICONS.tag,
        actionButton: canEdit ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">+ Tambah Kategori</button>` : ''
      });
      area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
        bukaModalFormKategori(container, null);
      });
      return;
    }

    // Peta nama parent
    const petaKategori = {};
    items.forEach((k) => { petaKategori[k.id] = k.nama; });

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 60px;">Urutan</th>
              <th>Nama Kategori</th>
              <th>Kategori Induk</th>
              ${canEdit ? '<th style="width: 140px; text-align: right;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((k) => {
      const namaParent = k.parent_id && petaKategori[k.parent_id] ? petaKategori[k.parent_id] : '-';
      html += `
        <tr>
          <td class="num">${k.urutan || 0}</td>
          <td>
            <div class="fw-semibold">${escapeHtml(k.nama)}</div>
          </td>
          <td>
            <span class="text-sm text-muted">${escapeHtml(namaParent)}</span>
          </td>
          ${canEdit ? `
            <td style="text-align: right;">
              <div class="row" style="justify-content: flex-end; gap: var(--sp-1);">
                <button type="button" class="btn btn-ghost btn-sm btn-edit-kat" data-id="${k.id}" title="Ubah">
                  Ubah
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-kat" data-id="${k.id}" data-nama="${escapeHtml(k.nama)}" title="Hapus">
                  Hapus
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

    // Pasang handler edit & hapus
    if (canEdit) {
      area.querySelectorAll('.btn-edit-kat').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const kat = items.find((x) => x.id === id);
          if (kat) bukaModalFormKategori(container, kat, items);
        });
      });

      area.querySelectorAll('.btn-hapus-kat').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const nama = btn.getAttribute('data-nama');
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
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div><strong>Gagal Memuat Kategori</strong>: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function bukaModalFormKategori(container, kat, semuaKategori = []) {
  const isEdit = !!kat;
  const listPilihan = semuaKategori.filter((k) => !isEdit || k.id !== kat.id);

  let optionsParent = '<option value="">-- Kategori Utama (Tanpa Induk) --</option>';
  listPilihan.forEach((k) => {
    const selected = isEdit && kat.parent_id === k.id ? 'selected' : '';
    optionsParent += `<option value="${k.id}" ${selected}>${escapeHtml(k.nama)}</option>`;
  });

  const bodyHtml = `
    <form id="form-kategori" class="stack">
      <div class="field">
        <label class="field-label" for="kat-nama">Nama Kategori <span class="wajib">*</span></label>
        <input type="text" class="input" id="kat-nama" value="${isEdit ? escapeHtml(kat.nama) : ''}" placeholder="Cth: Bahan Bangunan, Cat Kayu & Besi" required autofocus>
      </div>

      <div class="field">
        <label class="field-label" for="kat-parent">Kategori Induk (Sub-Kategori)</label>
        <select class="select" id="kat-parent">
          ${optionsParent}
        </select>
        <span class="field-hint">Kosongkan jika ini adalah kategori induk/utama.</span>
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
    title: isEdit ? 'Ubah Kategori' : 'Tambah Kategori Baru',
    body: bodyHtml
  });

  const form = $('#form-kategori', modal.el);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#kat-nama', form).value.trim();
    const parent_id = $('#kat-parent', form).value.trim();
    const urutan = parseInt($('#kat-urutan', form).value, 10) || 0;

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


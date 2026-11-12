/**
 * supplier.js — Modul Data Supplier & Rekap Saldo Hutang (Owner & Admin)
 * Sesuai Fase 3 Roadmap POS Kasir Toko Bangunan
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah } from '../utils/format.js';

export async function renderSupplierModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Data Supplier & Distributor</h2>
          <p>Pemasok material bahan bangunan, riwayat pengadaan, dan saldo hutang aktif</p>
        </div>
        ${canEdit ? `
          <div>
            <button type="button" class="btn btn-primary" id="btn-tambah-supplier">
              <span>+ Tambah Supplier</span>
            </button>
          </div>
        ` : ''}
      </div>

      <div class="card card-body">
        <div class="row" style="gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-3);">
          <div class="input-group grow">
            <span class="input-icon">${ICONS.search}</span>
            <input type="search" class="input" id="search-supplier" placeholder="Cari nama supplier, kontak PIC, HP, atau alamat...">
          </div>
          <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-supplier" title="Muat Ulang" aria-label="Muat Ulang">
            ${ICONS.refresh}
          </button>
        </div>

        <div id="area-supplier-list">
          ${renderSkeleton(4)}
        </div>
      </div>
    </div>
  `;

  let timeoutCari = null;
  const inputSearch = $('#search-supplier', container);
  inputSearch?.addEventListener('input', () => {
    clearTimeout(timeoutCari);
    timeoutCari = setTimeout(() => {
      muatSupplierList(container, canEdit, inputSearch.value.trim());
    }, 300);
  });

  $('#btn-refresh-supplier', container)?.addEventListener('click', () => {
    muatSupplierList(container, canEdit, inputSearch ? inputSearch.value.trim() : '');
  });

  if (canEdit) {
    $('#btn-tambah-supplier', container)?.addEventListener('click', () => {
      bukaModalSupplier(container, null);
    });
  }

  await muatSupplierList(container, canEdit, '');
}

async function muatSupplierList(container, canEdit, query = '') {
  const area = $('#area-supplier-list', container);
  if (!area) return;

  try {
    const res = await apiCall('supplier.list', { q: query, limit: 100 });
    const items = res.items || [];

    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: query ? 'Supplier Tidak Ditemukan' : 'Belum Ada Supplier',
        text: query ? `Tidak ada supplier dengan kata kunci "${escapeHtml(query)}"` : 'Tambahkan supplier pertama untuk mulai mencatat pembelian dan stok masuk.',
        icon: ICONS.truck,
        actionButton: canEdit && !query ? `<button type="button" class="btn btn-secondary btn-tambah-pertama">+ Tambah Supplier</button>` : ''
      });
      area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
        bukaModalSupplier(container, null);
      });
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Nama Supplier</th>
              <th>Kontak PIC & HP</th>
              <th>Alamat</th>
              <th style="text-align: right;">Saldo Hutang</th>
              <th style="text-align: center;">Faktur</th>
              <th style="text-align: center;">Status</th>
              ${canEdit ? '<th style="width: 140px; text-align: right;">Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((s) => {
      const waLink = s.hp ? `https://wa.me/${s.hp.replace(/^0/, '62').replace(/[^0-9]/g, '')}` : '';
      html += `
        <tr>
          <td data-label="Supplier">
            <div class="fw-semibold">${escapeHtml(s.nama)}</div>
            ${s.catatan ? `<div class="text-xs text-muted">${escapeHtml(s.catatan)}</div>` : ''}
          </td>
          <td data-label="Kontak PIC">
            <div>${escapeHtml(s.kontak || '-')}</div>
            ${s.hp ? `
              <a href="${waLink}" target="_blank" rel="noopener" class="text-xs text-primary" style="display: inline-flex; align-items: center; gap: 4px;">
                ${escapeHtml(s.hp)}
              </a>
            ` : '<span class="text-xs text-muted">-</span>'}
          </td>
          <td data-label="Alamat">
            <div class="text-sm text-muted" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(s.alamat || '-')}
            </div>
          </td>
          <td style="text-align: right;" data-label="Saldo Hutang">
            <div class="tabular fw-bold ${s.saldo_hutang > 0 ? 'text-danger' : 'text-muted'}">
              ${formatRupiah(s.saldo_hutang)}
            </div>
          </td>
          <td style="text-align: center;" data-label="Faktur">
            <span class="badge ${s.total_pembelian > 0 ? 'badge-info' : ''}">${s.total_pembelian || 0}</span>
          </td>
          <td style="text-align: center;" data-label="Status">
            <span class="badge ${s.aktif ? 'badge-success' : 'badge-warning'}">
              ${s.aktif ? 'Aktif' : 'Nonaktif'}
            </span>
          </td>
          ${canEdit ? `
            <td style="text-align: right;" data-label="Aksi">
              <div class="row" style="justify-content: flex-end; gap: var(--sp-1); width: 100%;">
                <button type="button" class="btn btn-ghost btn-sm btn-edit-supplier" data-id="${s.id}" title="Ubah">
                  Ubah
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-danger btn-hapus-supplier" data-id="${s.id}" data-nama="${escapeHtml(s.nama)}" title="Hapus">
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

    // Event listener edit
    area.querySelectorAll('.btn-edit-supplier').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const sup = items.find((x) => x.id === id);
        if (sup) bukaModalSupplier(container, sup);
      });
    });

    // Event listener hapus
    area.querySelectorAll('.btn-hapus-supplier').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const nama = btn.getAttribute('data-nama');
        const yakin = await showConfirm({
          title: 'Hapus Supplier',
          message: `Apakah Anda yakin ingin menghapus data supplier "${nama}"? Supplier yang memiliki saldo hutang aktif tidak dapat dihapus.`,
          confirmText: 'Ya, Hapus',
          cancelText: 'Batal'
        });

        if (!yakin) return;

        try {
          await apiCall('supplier.delete', { id });
          showToast(`Supplier "${nama}" berhasil dihapus.`, 'success');
          muatSupplierList(container, canEdit, $('#search-supplier', container)?.value.trim() || '');
        } catch (err) {
          showToast(err.message, 'error', 4500);
        }
      });
    });
  } catch (err) {
    if (area) {
      area.innerHTML = `
        <div class="alert alert-danger">
          ${ICONS.alertTriangle}
          <div>Gagal memuat data supplier: ${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
}

function bukaModalSupplier(container, supplier = null) {
  const isEdit = !!supplier;
  const modal = showModal({
    title: isEdit ? 'Ubah Data Supplier' : 'Tambah Supplier Baru',
    body: `
      <form id="form-supplier" class="stack">
        <div class="field">
          <label class="field-label" for="sup-nama">Nama Perusahaan / Supplier <span class="wajib">*</span></label>
          <input type="text" class="input" id="sup-nama" value="${escapeHtml(supplier?.nama || '')}" placeholder="Contoh: PT Semen Perkasa Abadi" required autofocus>
        </div>

        <div class="row" style="gap: var(--sp-2);">
          <div class="field grow">
            <label class="field-label" for="sup-kontak">Nama Kontak / PIC</label>
            <input type="text" class="input" id="sup-kontak" value="${escapeHtml(supplier?.kontak || '')}" placeholder="Nama sales / pengelola">
          </div>
          <div class="field grow">
            <label class="field-label" for="sup-hp">Nomor HP / WhatsApp</label>
            <input type="tel" class="input" id="sup-hp" value="${escapeHtml(supplier?.hp || '')}" placeholder="08xxxxxxxxxx">
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="sup-alamat">Alamat Gudang / Kantor</label>
          <textarea class="input" id="sup-alamat" rows="2" placeholder="Alamat lengkap distributor">${escapeHtml(supplier?.alamat || '')}</textarea>
        </div>

        <div class="field">
          <label class="field-label" for="sup-catatan">Catatan / No. Rekening Pembayaran</label>
          <input type="text" class="input" id="sup-catatan" value="${escapeHtml(supplier?.catatan || '')}" placeholder="Contoh: BCA 123456789 a.n PT Semen Perkasa">
        </div>

        <div class="field">
          <label class="checkbox-label" style="display: flex; align-items: center; gap: var(--sp-2); cursor: pointer;">
            <input type="checkbox" id="sup-aktif" ${supplier ? (supplier.aktif ? 'checked' : '') : 'checked'}>
            <span>Status Supplier Aktif</span>
          </label>
        </div>

        <div class="row" style="justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-2);">
          <button type="button" class="btn btn-ghost" id="btn-batal-modal">Batal</button>
          <button type="submit" class="btn btn-primary" id="btn-simpan-supplier">
            ${isEdit ? 'Simpan Perubahan' : 'Tambah Supplier'}
          </button>
        </div>
      </form>
    `
  });

  modal.el.querySelector('#btn-batal-modal')?.addEventListener('click', () => modal.close());

  const form = $('#form-supplier', modal.el);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSimpan = $('#btn-simpan-supplier', modal.el);
    const nama = $('#sup-nama', form).value.trim();
    const kontak = $('#sup-kontak', form).value.trim();
    const hp = $('#sup-hp', form).value.trim();
    const alamat = $('#sup-alamat', form).value.trim();
    const catatan = $('#sup-catatan', form).value.trim();
    const aktif = $('#sup-aktif', form).checked;

    if (!nama) {
      showToast('Nama supplier wajib diisi.', 'warning');
      return;
    }

    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;

    try {
      if (isEdit) {
        await apiCall('supplier.update', { id: supplier.id, nama, kontak, hp, alamat, catatan, aktif });
        showToast('Data supplier berhasil diperbarui.', 'success');
      } else {
        await apiCall('supplier.create', { nama, kontak, hp, alamat, catatan, aktif });
        showToast('Supplier baru berhasil ditambahkan.', 'success');
      }
      modal.close();
      muatSupplierList(container, true, $('#search-supplier', container)?.value.trim() || '');
    } catch (err) {
      showToast(err.message, 'error', 4500);
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
    }
  });
}


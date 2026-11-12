/**
 * users.js — Modul Manajemen Pengguna & Akun Petugas (Khusus Owner)
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { formatTanggal, escapeHtml } from '../utils/format.js';

export async function renderUsersModule(container) {
  const user = store.get('user');
  if (!user || user.role !== 'owner') {
    container.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>
          <strong>Akses Ditolak</strong>
          <div>Manajemen akun pengguna hanya dapat diakses oleh Pemilik Toko (Owner).</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Manajemen Pengguna</h2>
          <p>Kelola akun kasir, admin, hak akses peran, dan reset PIN keamanan</p>
        </div>
        <div>
          <button type="button" class="btn btn-primary" id="btn-tambah-user">
            <span>+ Tambah Pengguna</span>
          </button>
        </div>
      </div>

      <div class="card card-body" id="area-tabel-users">
        ${renderSkeleton(3)}
      </div>
    </div>
  `;

  $('#btn-tambah-user', container)?.addEventListener('click', () => {
    bukaModalFormUser(container, null);
  });

  await muatUsers(container);
}

async function muatUsers(container) {
  const area = $('#area-tabel-users', container);
  const userAktif = store.get('user');

  try {
    const res = await apiCall('user.list', {});
    const items = res.items || [];

    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: 'Pengguna Kosong',
        text: 'Belum ada pengguna terdaftar.',
        icon: ICONS.users
      });
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Nama Lengkap</th>
              <th>Peran (Role)</th>
              <th>Status</th>
              <th>Login Terakhir</th>
              <th style="width: 170px; text-align: right;">Aksi</th>
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((u) => {
      const isSaya = userAktif && userAktif.id === u.id;
      let badgeRole = 'badge-primary';
      if (u.role === 'admin') badgeRole = 'badge-info';
      if (u.role === 'kasir') badgeRole = 'badge';

      html += `
        <tr>
          <td data-label="Username">
            <div class="fw-semibold mono">${escapeHtml(u.username)}</div>
            ${isSaya ? '<span class="badge badge-success text-xs">Akun Anda</span>' : ''}
            ${u.wajib_ganti_pin ? '<span class="badge badge-warning text-xs">Wajib Ganti PIN</span>' : ''}
          </td>
          <td data-label="Nama Lengkap">${escapeHtml(u.nama || '-')}</td>
          <td data-label="Role">
            <span class="badge ${badgeRole}" style="text-transform: capitalize;">${escapeHtml(u.role)}</span>
          </td>
          <td data-label="Status">
            ${u.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-danger">Nonaktif</span>'}
            ${u.kunci_sampai ? `<span class="badge badge-danger text-xs">Terkunci hingga ${escapeHtml(u.kunci_sampai)}</span>` : ''}
          </td>
          <td class="text-xs text-muted" data-label="Login Terakhir">
            ${u.last_login ? formatTanggal(u.last_login, true) : 'Belum pernah'}
          </td>
          <td style="text-align: right;" data-label="Aksi">
            <div class="row" style="justify-content: flex-end; gap: var(--sp-1); width: 100%;">
              <button type="button" class="btn btn-ghost btn-sm btn-edit-user" data-id="${u.id}">Ubah</button>
              <button type="button" class="btn btn-ghost btn-sm text-warning btn-reset-pin-user" data-id="${u.id}" data-user="${escapeHtml(u.username)}">Reset PIN</button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    area.innerHTML = html;

    // Pasang handler tombol Ubah & Reset PIN
    area.querySelectorAll('.btn-edit-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const u = items.find((x) => x.id === id);
        if (u) bukaModalFormUser(container, u);
      });
    });

    area.querySelectorAll('.btn-reset-pin-user').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const username = btn.getAttribute('data-user');
        bukaModalResetPin(container, id, username);
      });
    });
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div><strong>Gagal Memuat Pengguna</strong>: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

function bukaModalFormUser(container, user) {
  const isEdit = !!user;
  const userAktif = store.get('user');
  const isSaya = isEdit && userAktif && userAktif.id === user.id;

  const bodyHtml = `
    <form id="form-user" class="stack">
      <div class="field">
        <label class="field-label" for="usr-username">Username <span class="wajib">*</span></label>
        <input type="text" class="input mono" id="usr-username" value="${isEdit ? escapeHtml(user.username) : ''}" placeholder="Cth: kasir_budi" ${isEdit ? 'disabled' : 'required'} autofocus>
        <span class="field-hint">Hanya huruf, angka, garis bawah, dan titik.</span>
      </div>

      <div class="field">
        <label class="field-label" for="usr-nama">Nama Lengkap <span class="wajib">*</span></label>
        <input type="text" class="input" id="usr-nama" value="${isEdit ? escapeHtml(user.nama) : ''}" placeholder="Nama petugas kasir / admin" required>
      </div>

      <div class="field">
        <label class="field-label" for="usr-role">Hak Akses Peran (Role) <span class="wajib">*</span></label>
        <select class="select" id="usr-role" ${isSaya ? 'disabled' : ''}>
          <option value="kasir" ${isEdit && user.role === 'kasir' ? 'selected' : ''}>Kasir (Hanya Penjualan, Tanpa HPP)</option>
          <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>Admin (Stok, Pembelian, Produk, Lihat HPP)</option>
          <option value="owner" ${isEdit && user.role === 'owner' ? 'selected' : ''}>Owner (Semua Fitur, Laba, Pengaturan, User)</option>
        </select>
        ${isSaya ? '<span class="field-hint">Anda tidak dapat mengubah peran akun Anda sendiri saat sedang login.</span>' : ''}
      </div>

      ${!isEdit ? `
        <div class="field">
          <label class="field-label" for="usr-pin">PIN Awal (6 Digit Angka) <span class="wajib">*</span></label>
          <input type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" class="input tabular" id="usr-pin" placeholder="••••••" required>
          <span class="field-hint">Pengguna akan diminta mengganti PIN saat pertama kali masuk.</span>
        </div>
      ` : `
        <div class="field">
          <label class="switch">
            <input type="checkbox" id="usr-aktif" ${user.aktif ? 'checked' : ''} ${isSaya ? 'disabled' : ''}>
            <span class="switch-track"></span>
            <span class="text-sm fw-medium">Akun Pengguna Aktif</span>
          </label>
          ${isSaya ? '<span class="field-hint">Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.</span>' : ''}
        </div>
      `}

      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-2);">
        <button type="button" class="btn btn-ghost btn-close-modal">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-usr">
          ${isEdit ? 'Simpan Perubahan' : 'Tambah Pengguna'}
        </button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: isEdit ? `Ubah Data Pengguna (${user.username})` : 'Tambah Pengguna Baru',
    body: bodyHtml
  });

  const form = $('#form-user', modal.el);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#usr-nama', form).value.trim();
    const role = $('#usr-role', form).value;

    const btnSimpan = $('#btn-simpan-usr', form);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;

    try {
      if (isEdit) {
        const aktif = $('#usr-aktif', form).checked;
        await apiCall('user.update', { id: user.id, nama, role, aktif });
        showToast('Data pengguna berhasil diperbarui.', 'success');
      } else {
        const username = $('#usr-username', form).value.trim();
        const pin = $('#usr-pin', form).value.trim();
        if (!/^\d{6}$/.test(pin)) {
          showToast('PIN harus berupa 6 angka.', 'warning');
          return;
        }
        await apiCall('user.create', { username, nama, role, pin });
        showToast(`Pengguna "${username}" berhasil ditambahkan.`, 'success');
      }
      modal.close();
      await muatUsers(container);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
    }
  });
}

function bukaModalResetPin(container, userId, username) {
  const bodyHtml = `
    <form id="form-reset-pin" class="stack">
      <div class="alert alert-warning">
        ${ICONS.alertTriangle}
        <div>
          <strong>Reset Keamanan</strong>
          <div>PIN baru akan memaksa akun <strong>${escapeHtml(username)}</strong> untuk langsung mengganti PIN saat login berikutnya. Seluruh sesi aktif di perangkat lain akan diputus otomatis.</div>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="reset-pin-baru">PIN Baru Sementara (6 Angka) <span class="wajib">*</span></label>
        <input type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" class="input tabular" id="reset-pin-baru" placeholder="6 angka" required autofocus>
      </div>

      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-2);">
        <button type="button" class="btn btn-ghost btn-close-modal">Batal</button>
        <button type="submit" class="btn btn-danger" id="btn-submit-reset">Reset Sekarang</button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: `Reset PIN: ${username}`,
    body: bodyHtml
  });

  const form = $('#form-reset-pin', modal.el);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pinBaru = $('#reset-pin-baru', form).value.trim();

    if (!/^\d{6}$/.test(pinBaru)) {
      showToast('PIN harus berupa 6 angka.', 'warning');
      return;
    }

    const btnSubmit = $('#btn-submit-reset', form);
    btnSubmit.setAttribute('aria-busy', 'true');
    btnSubmit.disabled = true;

    try {
      await apiCall('user.resetPin', { id: userId, pin_baru: pinBaru });
      showToast(`PIN ${username} berhasil direset!`, 'success');
      modal.close();
      await muatUsers(container);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSubmit.removeAttribute('aria-busy');
      btnSubmit.disabled = false;
    }
  });
}


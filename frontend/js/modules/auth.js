/**
 * auth.js — Modul Autentikasi Front End (Login, Logout, Ganti PIN)
 * Sesuai aturan README bagian 6.1 & 11:
 * - Username + 6 digit PIN
 * - Sesi token 6 jam di state & localStorage
 * - Kunci login setelah 5x gagal
 * - Wajib ganti PIN saat login pertama / setelah reset
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, escapeHtml } from '../utils/dom.js';

let modalLoginRef = null;

/**
 * Periksa apakah pengguna sudah login.
 * Jika belum, tampilkan modal login secara otomatis.
 */
export function pastikanLogin(onSuccess) {
  const token = store.get('token');
  const user = store.get('user');

  if (token && user) {
    if (user.wajib_ganti_pin) {
      tampilkanDialogWajibGantiPin();
    } else if (onSuccess) {
      onSuccess(user);
    }
    return true;
  }

  tampilkanModalLogin(onSuccess);
  return false;
}

/**
 * Tampilkan modal login dengan form username & PIN 6 digit
 */
export function tampilkanModalLogin(onSuccess) {
  if (modalLoginRef) return;

  const formHtml = `
    <form id="form-login" class="stack" autocomplete="off">
      <div class="text-center" style="margin-bottom: var(--sp-2)">
        <div class="brand-logo" style="margin: 0 auto var(--sp-2); width: 48px; height: 48px;">
          ${ICONS.store}
        </div>
        <h3>Masuk ke POS Kasir</h3>
        <p class="text-xs text-muted">Masukkan username dan PIN 6 digit Anda</p>
      </div>

      <div class="field">
        <label class="field-label" for="login-username">Username <span class="wajib">*</span></label>
        <div class="input-group">
          <span class="input-icon">${ICONS.users}</span>
          <input type="text" class="input" id="login-username" placeholder="Contoh: owner" required autofocus>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="login-pin">PIN Kasir (6 Digit) <span class="wajib">*</span></label>
        <div class="input-group">
          <span class="input-icon">${ICONS.userCheck}</span>
          <input type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" class="input tabular" id="login-pin" placeholder="••••••" required>
        </div>
        <div class="field-hint">PIN berupa 6 angka rahasia akun Anda.</div>
      </div>

      <button type="submit" class="btn btn-primary btn-block btn-lg" id="btn-submit-login" style="margin-top: var(--sp-2)">
        <span>Masuk ke Sistem</span>
      </button>
    </form>
  `;

  modalLoginRef = showModal({
    title: 'Login Pengguna',
    body: formHtml,
    closeOnOverlay: false
  });

  const form = $('#form-login', modalLoginRef.el);
  const btnSubmit = $('#btn-submit-login', modalLoginRef.el);

  // Sembunyikan tombol close bawaan modal agar wajib login
  const btnClose = modalLoginRef.el.querySelector('.btn-close-modal');
  if (btnClose) btnClose.style.display = 'none';

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#login-username', form).value.trim();
    const pin = $('#login-pin', form).value.trim();

    if (!username) {
      showToast('Username wajib diisi.', 'warning');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      showToast('PIN harus berupa 6 angka.', 'warning');
      return;
    }

    btnSubmit.setAttribute('aria-busy', 'true');
    btnSubmit.disabled = true;

    try {
      const res = await apiCall('auth.login', { username, pin });
      store.setUserSession(res.token, res.user);

      showToast(`Selamat datang, ${res.user.nama || res.user.username}!`, 'success');

      const modalToClose = modalLoginRef;
      modalLoginRef = null;
      modalToClose.close();

      if (res.user.wajib_ganti_pin) {
        tampilkanDialogWajibGantiPin();
      } else if (onSuccess) {
        onSuccess(res.user);
      }
    } catch (err) {
      showToast(err.message, 'error', 4500);
      const inputPin = $('#login-pin', form);
      if (inputPin) {
        inputPin.value = '';
        inputPin.focus();
      }
    } finally {
      btnSubmit.removeAttribute('aria-busy');
      btnSubmit.disabled = false;
    }
  });
}

/**
 * Tampilkan dialog wajib ganti PIN untuk akun baru atau setelah direset
 */
export function tampilkanDialogWajibGantiPin() {
  const modal = showModal({
    title: 'Wajib Ganti PIN',
    closeOnOverlay: false,
    body: `
      <form id="form-ganti-pin" class="stack">
        <div class="alert alert-warning">
          ${ICONS.alertTriangle}
          <div>
            <strong>Keamanan Akun</strong>
            <div>Akun Anda memerlukan penggantian PIN 6 digit baru sebelum dapat bertransaksi.</div>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="pin-lama">PIN Saat Ini <span class="wajib">*</span></label>
          <input type="password" inputmode="numeric" maxlength="6" class="input" id="pin-lama" placeholder="PIN saat ini" required autofocus>
        </div>

        <div class="field">
          <label class="field-label" for="pin-baru">PIN Baru (6 Angka) <span class="wajib">*</span></label>
          <input type="password" inputmode="numeric" maxlength="6" class="input" id="pin-baru" placeholder="6 angka baru" required>
        </div>

        <div class="field">
          <label class="field-label" for="pin-baru-konfirm">Konfirmasi PIN Baru <span class="wajib">*</span></label>
          <input type="password" inputmode="numeric" maxlength="6" class="input" id="pin-baru-konfirm" placeholder="Ulangi 6 angka baru" required>
        </div>

        <button type="submit" class="btn btn-primary btn-block" id="btn-submit-ganti-pin">
          Simpan PIN Baru
        </button>
      </form>
    `
  });

  const btnClose = modal.el.querySelector('.btn-close-modal');
  if (btnClose) btnClose.style.display = 'none';

  const form = $('#form-ganti-pin', modal.el);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pinLama = $('#pin-lama', form).value.trim();
    const pinBaru = $('#pin-baru', form).value.trim();
    const pinKonfirm = $('#pin-baru-konfirm', form).value.trim();

    if (!/^\d{6}$/.test(pinBaru)) {
      showToast('PIN baru harus berupa 6 angka.', 'warning');
      return;
    }
    if (pinBaru !== pinKonfirm) {
      showToast('Konfirmasi PIN baru tidak cocok.', 'warning');
      return;
    }

    try {
      await apiCall('auth.gantiPin', { pin_lama: pinLama, pin_baru: pinBaru });
      const user = store.get('user');
      if (user) {
        user.wajib_ganti_pin = false;
        store.set('user', user);
      }
      modal.close();
      showToast('PIN berhasil diganti! Selamat bekerja.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/**
 * Konfirmasi dan proses logout
 */
export async function konfirmasiLogout() {
  const setuju = await showConfirm({
    title: 'Keluar dari Sistem',
    message: 'Apakah Anda yakin ingin logout? Anda harus memasukkan PIN kembali untuk masuk.',
    confirmText: 'Ya, Logout',
    cancelText: 'Batal'
  });

  if (!setuju) return;

  try {
    await apiCall('auth.logout', {});
  } catch (e) {
    // Abaikan jika token sudah tidak aktif di server
  }

  store.clearUserSession();
  showToast('Anda telah logout.', 'info');
  tampilkanModalLogin(() => {
    window.location.hash = '#/pos';
  });
}


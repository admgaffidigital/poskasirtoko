/**
 * pengaturan.js — Modul Pengaturan Umum Toko (Khusus Owner)
 * Profil toko, ukuran printer thermal 58/80mm, pajak PPN, pembulatan, dan aturan poin
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast } from '../utils/ui.js';
import { $, renderSkeleton } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';

export async function renderPengaturanModule(container) {
  const user = store.get('user');
  if (!user || user.role !== 'owner') {
    container.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>
          <strong>Akses Dibatasi</strong>
          <div>Halaman Pengaturan Umum hanya dapat diakses oleh peran Pemilik Toko (Owner).</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Pengaturan Umum</h2>
          <p>Konfigurasi profil toko, format nota, printer thermal Bluetooth, dan aturan transaksi</p>
        </div>
        <div>
          <button type="submit" form="form-pengaturan" class="btn btn-primary" id="btn-simpan-pengaturan">
            Simpan Perubahan
          </button>
        </div>
      </div>

      <div class="card card-body" id="area-form-pengaturan">
        ${renderSkeleton(4)}
      </div>
    </div>
  `;

  await muatPengaturan(container);
}

async function muatPengaturan(container) {
  const area = $('#area-form-pengaturan', container);

  try {
    const res = await apiCall('pengaturan.get', {});
    const cfg = res.pengaturan || {};

    // Sinkronkan ke store lokal
    store.set('pengaturan', cfg);
    store.setToko({
      nama: cfg.toko_nama,
      alamat: cfg.toko_alamat,
      hp: cfg.toko_hp,
      nota_footer: cfg.nota_footer
    });

    area.innerHTML = `
      <form id="form-pengaturan" class="stack">
        <!-- 1. Profil Toko -->
        <div>
          <div class="section-title">Profil & Identitas Toko</div>
          <div class="form-grid cols-2" style="margin-top: var(--sp-2);">
            <div class="field">
              <label class="field-label" for="cfg-toko-nama">Nama Toko <span class="wajib">*</span></label>
              <input type="text" class="input" id="cfg-toko-nama" value="${escapeHtml(cfg.toko_nama || '')}" required>
            </div>
            <div class="field">
              <label class="field-label" for="cfg-toko-hp">Nomor HP / WhatsApp Toko</label>
              <input type="text" class="input" id="cfg-toko-hp" value="${escapeHtml(cfg.toko_hp || '')}" placeholder="Cth: 08123456789">
            </div>
          </div>
          <div class="field" style="margin-top: var(--sp-3);">
            <label class="field-label" for="cfg-toko-alamat">Alamat Lengkap Toko</label>
            <textarea class="textarea" id="cfg-toko-alamat" rows="2">${escapeHtml(cfg.toko_alamat || '')}</textarea>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 2. Printer & Format Nota -->
        <div>
          <div class="section-title">Format Nota & Printer Thermal</div>
          <div class="form-grid cols-2" style="margin-top: var(--sp-2);">
            <div class="field">
              <label class="field-label" for="cfg-printer-ukuran">Lebar Kertas Printer</label>
              <select class="select" id="cfg-printer-ukuran">
                <option value="58" ${cfg.printer_ukuran === '58' ? 'selected' : ''}>58 mm (32 Karakter per Baris)</option>
                <option value="80" ${cfg.printer_ukuran === '80' ? 'selected' : ''}>80 mm (48 Karakter per Baris)</option>
              </select>
              <span class="field-hint">Standar kertas mini printer kasir toko.</span>
            </div>

            <div class="field">
              <label class="field-label" for="cfg-diskon-kasir">Batas Diskon Maksimal Kasir (%)</label>
              <input type="number" class="input input-num" id="cfg-diskon-kasir" value="${cfg.diskon_maks_kasir_persen || 10}" min="0" max="100">
              <span class="field-hint">Diskon di atas persentase ini memerlukan persetujuan Owner/Admin.</span>
            </div>
          </div>

          <div class="field" style="margin-top: var(--sp-3);">
            <label class="field-label" for="cfg-nota-footer">Pesan Kaki Nota (Footer)</label>
            <textarea class="textarea" id="cfg-nota-footer" rows="2">${escapeHtml(cfg.nota_footer || '')}</textarea>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 3. Aturan Transaksi & Pajak -->
        <div>
          <div class="section-title">Aturan Transaksi, Pajak, & Pembulatan</div>
          <div class="form-grid cols-2" style="margin-top: var(--sp-2);">
            <div class="card card-body stack-sm">
              <label class="switch">
                <input type="checkbox" id="cfg-pajak-aktif" ${cfg.pajak_aktif ? 'checked' : ''}>
                <span class="switch-track"></span>
                <span class="text-sm fw-semibold">Kenakan Pajak (PPN)</span>
              </label>
              <div class="field" style="margin-top: var(--sp-2);">
                <label class="field-label" for="cfg-pajak-persen">Tarif PPN (%)</label>
                <input type="number" class="input input-num" id="cfg-pajak-persen" value="${cfg.pajak_persen || 11}" min="0" max="100">
              </div>
            </div>

            <div class="card card-body stack-sm">
              <label class="switch">
                <input type="checkbox" id="cfg-pembulatan-aktif" ${cfg.pembulatan_aktif ? 'checked' : ''}>
                <span class="switch-track"></span>
                <span class="text-sm fw-semibold">Pembulatan Total Belanja</span>
              </label>
              <span class="field-hint">Membulatkan total belanja ke kelipatan Rp 100 terdekat untuk mempermudah kembalian kasir.</span>
            </div>
          </div>

          <div class="card card-body" style="margin-top: var(--sp-3);">
            <label class="switch">
              <input type="checkbox" id="cfg-stok-minus" ${cfg.stok_minus ? 'checked' : ''}>
              <span class="switch-track"></span>
              <div>
                <span class="text-sm fw-semibold">Izinkan Transaksi Saat Stok Minus</span>
                <div class="text-xs text-muted">Secara default kasir dilarang menjual barang jika stok fisik tidak mencukupi untuk mencegah selisih stok.</div>
              </div>
            </label>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 4. Loyalitas & Poin Member -->
        <div>
          <div class="section-title">Aturan Poin Loyalitas Member</div>
          <div class="field" style="margin-top: var(--sp-2); max-width: 320px;">
            <label class="field-label" for="cfg-poin-rupiah">Belanja untuk Mendapat 1 Poin (Rp)</label>
            <div class="input-prefix">
              <span>Rp</span>
              <input type="number" class="input input-num" id="cfg-poin-rupiah" value="${cfg.poin_per_rupiah || 10000}" min="1000" step="500">
            </div>
            <span class="field-hint">Standar: 1 poin tiap kelipatan Rp 10.000 belanja lunas.</span>
          </div>
        </div>
      </form>
    `;

    const form = $('#form-pengaturan', container);
    const btnSimpan = $('#btn-simpan-pengaturan', container);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      btnSimpan.setAttribute('aria-busy', 'true');
      btnSimpan.disabled = true;

      const payload = {
        toko_nama: $('#cfg-toko-nama', form).value.trim(),
        toko_hp: $('#cfg-toko-hp', form).value.trim(),
        toko_alamat: $('#cfg-toko-alamat', form).value.trim(),
        printer_ukuran: $('#cfg-printer-ukuran', form).value,
        diskon_maks_kasir_persen: parseFloat($('#cfg-diskon-kasir', form).value) || 10,
        nota_footer: $('#cfg-nota-footer', form).value.trim(),
        pajak_aktif: $('#cfg-pajak-aktif', form).checked,
        pajak_persen: parseFloat($('#cfg-pajak-persen', form).value) || 11,
        pembulatan_aktif: $('#cfg-pembulatan-aktif', form).checked,
        stok_minus: $('#cfg-stok-minus', form).checked,
        poin_per_rupiah: parseInt($('#cfg-poin-rupiah', form).value, 10) || 10000
      };

      try {
        const res = await apiCall('pengaturan.set', payload);
        const cfgBaru = res.pengaturan || payload;
        store.set('pengaturan', cfgBaru);
        const tokoBaru = {
          nama: cfgBaru.toko_nama,
          alamat: cfgBaru.toko_alamat,
          hp: cfgBaru.toko_hp,
          nota_footer: cfgBaru.nota_footer
        };
        store.setToko(tokoBaru);
        showToast(`Identitas toko "${tokoBaru.nama}" berhasil diperbarui di seluruh sistem!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSimpan.removeAttribute('aria-busy');
        btnSimpan.disabled = false;
      }
    });
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div><strong>Gagal Memuat Pengaturan</strong>: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}


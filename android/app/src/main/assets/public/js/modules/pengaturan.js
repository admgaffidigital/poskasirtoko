/**
 * pengaturan.js — Modul Pengaturan Umum Toko (Khusus Owner)
 * Profil toko, ukuran printer thermal 58/80mm, pajak PPN, pembulatan, dan aturan poin
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, bukaModalTemaWarna, THEME_MODES, ACCENT_PALETTES, FONT_FAMILIES } from '../utils/ui.js';
import { syncStatusBarWithTheme, unduhFilePintar } from '../utils/native.js';
import { $, renderSkeleton } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';
import { tampilkanModalKoneksiPrinter, bukaAplikasiRawBT, cetakUjiStruk } from '../utils/printer.js';
import { jumlahAntreanOffline, bukaModalAntreanOffline } from '../utils/offline-queue.js';

function escapeXmlExcel(val) {
  const s = val === null || val === undefined ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unduhBlobFile(namaFile, konten, mime) {
  unduhFilePintar(namaFile, konten, mime);
}

/** Bangun Workbook Microsoft Excel Multi-Sheet (SpreadsheetML XML .xls) dari payload sistem.backup */
function buatWorkbookExcelMultiSheet(backupData) {
  const sheets = backupData?.sheets || {};
  const daftarTab = [
    'Produk', 'Varian', 'Kategori', 'Pelanggan', 'Supplier',
    'Penjualan', 'Penjualan_Item', 'Pembelian', 'Piutang', 'Hutang',
    'Biaya', 'Shift_Kasir', 'Pengaturan'
  ];

  const xmlSheets = daftarTab.map((namaTab) => {
    const rows = Array.isArray(sheets[namaTab]) ? sheets[namaTab] : [];
    const cols = rows.length > 0 ? Object.keys(rows[0]) : ['Info'];
    const headerCells = cols.map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXmlExcel(c)}</Data></Cell>`).join('');
    const bodyRows = rows.length > 0
      ? rows.map((r) => {
        const cells = cols.map((c) => {
          const v = r[c];
          if (typeof v === 'number' && Number.isFinite(v)) {
            return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
          }
          if (typeof v === 'boolean') {
            return `<Cell><Data ss:Type="String">${v ? 'YA' : 'TIDAK'}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${escapeXmlExcel(v)}</Data></Cell>`;
        }).join('');
        return `<Row>${cells}</Row>`;
      }).join('')
      : '<Row><Cell><Data ss:Type="String">(Belum ada data)</Data></Cell></Row>';

    return `<Worksheet ss:Name="${escapeXmlExcel(namaTab.slice(0, 31))}"><Table><Row>${headerCells}</Row>${bodyRows}</Table></Worksheet>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1"/></Style>
 </Styles>
 ${xmlSheets}
</Workbook>`;
}

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

    const temaCloud = cfg.tampilan_tema && cfg.tampilan_tema.updatedAt ? cfg.tampilan_tema : null;
    const labelTemaCloud = temaCloud
      ? `${THEME_MODES.find((m) => m.id === temaCloud.theme)?.nama || temaCloud.theme} • ${ACCENT_PALETTES.find((a) => a.id === temaCloud.accent)?.nama || temaCloud.accent} • ${FONT_FAMILIES.find((f) => f.id === temaCloud.fontFamily)?.nama || temaCloud.fontFamily} (${temaCloud.fontPct || 100}%)`
      : 'Belum disinkronkan (masih lokal perangkat)';

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
              <label class="field-label" for="cfg-printer-jalur">Jalur Cetak Struk Utama</label>
              <select class="select" id="cfg-printer-jalur">
                <option value="otomatis" ${(!cfg.printer_jalur || cfg.printer_jalur === 'otomatis') ? 'selected' : ''}>Otomatis (RawBT di Android / Direct POS USB di PC)</option>
                <option value="usb_direct" ${cfg.printer_jalur === 'usb_direct' ? 'selected' : ''}>Direct POS USB / ESC-POS (Desktop Windows / WebUSB / Serial)</option>
                <option value="rawbt" ${cfg.printer_jalur === 'rawbt' ? 'selected' : ''}>RawBT Android (Printer Bluetooth Thermal)</option>
                <option value="webbluetooth" ${cfg.printer_jalur === 'webbluetooth' ? 'selected' : ''}>Web Bluetooth Direct (BLE Browser)</option>
                <option value="browser" ${cfg.printer_jalur === 'browser' ? 'selected' : ''}>Cetak / Pratinjau Browser (Semua Perangkat / PDF)</option>
              </select>
              <span class="field-hint">Metode cetak default yang aktif otomatis saat transaksi kasir selesai.</span>
            </div>
          </div>

          <div class="form-grid cols-2" style="margin-top: var(--sp-2);">
            <div class="field">
              <label class="field-label" for="cfg-diskon-kasir">Batas Diskon Maksimal Kasir (%)</label>
              <input type="number" class="input input-num" id="cfg-diskon-kasir" value="${cfg.diskon_maks_kasir_persen ?? 10}" min="0" max="100">
              <span class="field-hint">Diskon di atas persentase ini memerlukan persetujuan Owner/Admin.</span>
            </div>
          </div>

          <div class="card card-body stack-sm" style="margin-top: var(--sp-3); background: var(--surface-2); border: 1.5px solid var(--border);">
            <div class="row-between" style="flex-wrap: wrap; gap: var(--sp-2);">
              <div>
                <div class="fw-bold text-sm" style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--primary);">${ICONS.printer}</span>
                  <span>Koneksi Printer Thermal (Direct POS USB PC &amp; RawBT Android)</span>
                </div>
                <div class="text-xs text-muted" style="margin-top: 2px;">
                  Sambungkan printer thermal 58/80mm langsung lewat Direct ESC/POS USB di PC atau RawBT Bluetooth di Android.
                </div>
              </div>
              <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-cfg-buka-rawbt" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.smartphone}
                  <span>Buka RawBT</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-cfg-uji-rawbt" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.printer}
                  <span>Uji Cetak</span>
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="btn-cfg-panduan-printer" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.settings}
                  <span>Panduan Sambungkan</span>
                </button>
              </div>
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
                <input type="number" class="input input-num" id="cfg-pajak-persen" value="${cfg.pajak_persen ?? 11}" min="0" max="100">
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

          <div class="form-grid cols-2" style="margin-top: var(--sp-3);">
            <div class="card card-body">
              <label class="switch">
                <input type="checkbox" id="cfg-stok-minus" ${cfg.stok_minus ? 'checked' : ''}>
                <span class="switch-track"></span>
                <div>
                  <span class="text-sm fw-semibold">Izinkan Transaksi Saat Stok Minus</span>
                  <div class="text-xs text-muted">Secara default kasir dilarang menjual barang jika stok fisik tidak mencukupi untuk mencegah selisih stok.</div>
                </div>
              </label>
            </div>

            <div class="card card-body">
              <label class="switch">
                <input type="checkbox" id="cfg-wajib-buka-shift" ${cfg.wajib_buka_shift !== false ? 'checked' : ''}>
                <span class="switch-track"></span>
                <div>
                  <span class="text-sm fw-semibold">Wajib Buka Shift Sebelum Transaksi POS</span>
                  <div class="text-xs text-muted">Berlaku untuk semua role (Owner, Admin, &amp; Kasir). Transaksi &amp; tutup harian terkontrol penuh, termasuk peringatan shift kemarin belum ditutup.</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 4. Loyalitas & Poin Member -->
        <div>
          <div class="section-title">Aturan Poin Loyalitas Member</div>
          <div class="form-grid cols-2" style="margin-top: var(--sp-2);">
            <div class="field">
              <label class="field-label" for="cfg-poin-rupiah">Belanja untuk Mendapat 1 Poin (Rp)</label>
              <div class="input-prefix">
                <span>Rp</span>
                <input type="number" class="input input-num" id="cfg-poin-rupiah" value="${cfg.poin_per_rupiah || 10000}" min="100" step="100">
              </div>
              <span class="field-hint">Standar: 1 poin tiap kelipatan Rp 10.000 belanja lunas (khusus pelanggan Member). Untuk transaksi Piutang/Tempo, poin otomatis ditambahkan saat piutang berstatus <strong>Lunas</strong>.</span>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 5. Personalisasi Warna Tema & Suasana Aplikasi -->
        <div>
          <div class="section-title">Personalisasi Tema, Warna & Suasana Aplikasi</div>
          <div class="card card-body stack-sm" style="margin-top: var(--sp-2); background: var(--surface-2); border: 1.5px solid var(--border);">
            <div class="row-between" style="flex-wrap: wrap; gap: var(--sp-2); align-items: center;">
              <div>
                <div class="fw-bold text-sm" style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--primary);">${ICONS.palette}</span>
                  <span>Kustomisasi Warna Aksen & Suasana Latar</span>
                </div>
                <div class="text-xs text-muted" style="margin-top: 2px;">
                  Sesuaikan 6 warna aksen (Oranye Bata, Biru Samudra, Hijau Zamrud, Toska, Ungu Royal, Merah Ruby) dan suasana latar (Terang Sejuk, Terang Hangat Eye-Care, atau Gelap Malam).
                </div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="btn-cfg-buka-tema" style="display: inline-flex; align-items: center; gap: 6px;">
                ${ICONS.palette}
                <span>Pilih Warna & Suasana Tema</span>
              </button>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 6. Backup Data 1-Klik, Ekspor Excel Lengkap, & Antrean Offline -->
        <div>
          <div class="section-title">Backup Data 1-Klik, Ekspor Excel, &amp; Sinkronisasi Cloud</div>
          <div class="form-grid cols-2" style="margin-top: var(--sp-2); align-items: stretch;">
            <div class="card card-body stack-sm" style="background: var(--surface-2); border: 1.5px solid var(--border); justify-content: space-between; gap: var(--sp-3);">
              <div class="stack-sm">
                <div class="fw-bold text-sm" style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--primary);">${ICONS.hardDrive}</span>
                  <span>Backup Lengkap Database (JSON &amp; Excel)</span>
                </div>
                <div class="text-xs text-muted">
                  Unduh arsip cadangan seluruh 30 tabel database (Produk, Penjualan, Pembelian, Piutang, Hutang, Pelanggan, Shift, &amp; Pengaturan). Password/PIN dan token sesi otomatis disensor demi keamanan.
                </div>
              </div>
              <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
                <button type="button" class="btn btn-primary btn-sm" id="btn-cfg-backup-json" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.download}
                  <span>Backup JSON Lengkap</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-cfg-backup-excel" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.fileSpreadsheet}
                  <span>Export Excel Multi-Sheet</span>
                </button>
              </div>
            </div>

            <div class="card card-body stack-sm" style="background: var(--surface-2); border: 1.5px solid var(--border); justify-content: space-between; gap: var(--sp-3);">
              <div class="stack-sm">
                <div class="fw-bold text-sm" style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--primary);">${ICONS.cloud}</span>
                  <span>Status Sinkron Cloud &amp; Antrean Offline</span>
                </div>
                <div class="text-xs text-muted">
                  Preset Katalog PDF tersimpan di Cloud: <strong class="mono">${Array.isArray(cfg.katalog_pdf_presets) ? cfg.katalog_pdf_presets.length : 0} preset</strong>.<br>
                  Tema &amp; Tipografi Cloud: <strong id="lbl-cfg-tema-cloud">${escapeHtml(labelTemaCloud)}</strong>.<br>
                  Antrean Transaksi Offline di perangkat ini: <strong class="mono" id="lbl-cfg-offline-count">${jumlahAntreanOffline()} transaksi</strong>.
                </div>
              </div>
              <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-cfg-antrean-offline" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.refresh}
                  <span>Kelola Antrean Offline</span>
                </button>
              </div>
            </div>
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

      const parsedDiskonKasir = parseFloat($('#cfg-diskon-kasir', form).value);
      const parsedPajakPersen = parseFloat($('#cfg-pajak-persen', form).value);
      const payload = {
        toko_nama: $('#cfg-toko-nama', form).value.trim(),
        toko_hp: $('#cfg-toko-hp', form).value.trim(),
        toko_alamat: $('#cfg-toko-alamat', form).value.trim(),
        printer_ukuran: $('#cfg-printer-ukuran', form).value,
        printer_jalur: $('#cfg-printer-jalur', form).value,
        diskon_maks_kasir_persen: Number.isFinite(parsedDiskonKasir) ? parsedDiskonKasir : 10,
        nota_footer: $('#cfg-nota-footer', form).value.trim(),
        pajak_aktif: $('#cfg-pajak-aktif', form).checked,
        pajak_persen: Number.isFinite(parsedPajakPersen) ? parsedPajakPersen : 11,
        pembulatan_aktif: $('#cfg-pembulatan-aktif', form).checked,
        stok_minus: $('#cfg-stok-minus', form).checked,
        wajib_buka_shift: $('#cfg-wajib-buka-shift', form).checked,
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

    // Listener Aksi Cepat Koneksi & Uji Printer Bluetooth RawBT
    $('#btn-cfg-buka-rawbt', container)?.addEventListener('click', () => {
      bukaAplikasiRawBT();
    });

    $('#btn-cfg-uji-rawbt', container)?.addEventListener('click', () => {
      const ukuran = $('#cfg-printer-ukuran', form)?.value || '58';
      const jalur = $('#cfg-printer-jalur', form)?.value || 'rawbt';
      const targetJalur = jalur === 'webbluetooth' ? 'bluetooth' : (jalur === 'browser' ? 'browser' : 'rawbt');
      cetakUjiStruk(targetJalur, ukuran);
    });

    $('#btn-cfg-panduan-printer', container)?.addEventListener('click', () => {
      tampilkanModalKoneksiPrinter();
    });

    $('#btn-cfg-buka-tema', container)?.addEventListener('click', () => {
      bukaModalTemaWarna((c) => {
        syncStatusBarWithTheme(c.theme);
        const lblTema = $('#lbl-cfg-tema-cloud', container);
        if (lblTema) {
          const nMode = THEME_MODES.find((m) => m.id === c.theme)?.nama || c.theme;
          const nAcc = ACCENT_PALETTES.find((a) => a.id === c.accent)?.nama || c.accent;
          const nFont = FONT_FAMILIES.find((f) => f.id === c.fontFamily)?.nama || c.fontFamily;
          lblTema.textContent = `${nMode} • ${nAcc} • ${nFont} (${c.fontPct || 100}%)`;
        }
      });
    });

    // Listener Backup Data 1-Klik (JSON 30 Sheet & Workbook Excel Multi-Sheet)
    const jalankanBackupData = async (mode) => {
      const btn = $(mode === 'excel' ? '#btn-cfg-backup-excel' : '#btn-cfg-backup-json', container);
      const htmlAsli = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Mengambil Data Cloud...';
      }
      try {
        const res = await apiCall('sistem.backup', {});
        const now = new Date();
        const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
        if (mode === 'excel') {
          const xml = buatWorkbookExcelMultiSheet(res);
          unduhBlobFile(`backup-excel-pos-kasir-${stamp}.xls`, '\uFEFF' + xml, 'application/vnd.ms-excel;charset=utf-8');
          showToast(`Workbook Excel Multi-Sheet (${res.total_baris || 0} baris data) berhasil diunduh!`, 'success', 4000);
        } else {
          const jsonStr = JSON.stringify(res, null, 2);
          unduhBlobFile(`backup-lengkap-pos-kasir-${stamp}.json`, jsonStr, 'application/json;charset=utf-8');
          showToast(`Backup JSON Lengkap (${res.total_sheet || 30} sheet, ${res.total_baris || 0} baris) berhasil diunduh!`, 'success', 4000);
        }
      } catch (err) {
        showToast('Gagal mengunduh backup: ' + err.message, 'error', 4500);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = htmlAsli;
        }
      }
    };

    $('#btn-cfg-backup-json', container)?.addEventListener('click', () => jalankanBackupData('json'));
    $('#btn-cfg-backup-excel', container)?.addEventListener('click', () => jalankanBackupData('excel'));

    $('#btn-cfg-antrean-offline', container)?.addEventListener('click', () => {
      bukaModalAntreanOffline({
        onSelesai: () => {
          const lbl = $('#lbl-cfg-offline-count', container);
          if (lbl) lbl.textContent = `${jumlahAntreanOffline()} transaksi`;
        }
      });
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


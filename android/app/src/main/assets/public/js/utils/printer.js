/**
/**
 * printer.js — Utilitas Cetak Struk POS (Thermal ESC/POS 58mm & 80mm)
 * Mendukung 3 jalur cetak (README bagian 2 & 10):
 * 1. Web Bluetooth (Direct BLE thermal printer)
 * 2. RawBT (Aplikasi Android intent rawbt:data:base64)
 * 3. Browser Print (Fallback modal pratinjau thermal + window.print)
 * + Kirim Struk Digital via WhatsApp
 */

import { formatRupiah, formatQty, formatTanggal, escapeHtml } from './format.js';
import { showToast, showModal, ICONS } from './ui.js';
import { store } from '../state.js';

/** Lebar kolom karakter printer thermal standar */
export const LEBAR_KERTAS = {
  '58': 32, // Lebar 58mm: 32 karakter per baris font standard
  '80': 48  // Lebar 80mm: 48 karakter per baris font standard
};

/**
 * Format teks dua kolom rata kiri-kanan (cth: "Subtotal" di kiri, "Rp 150.000" di kanan)
 * @param {string} kiri
 * @param {string} kanan
 * @param {number} lebar
 * @returns {string}
 */
export function formatDuaKolom(kiri, kanan, lebar) {
  const k = String(kiri || '');
  const r = String(kanan || '');
  const sisa = lebar - k.length - r.length;
  if (sisa <= 0) {
    // Jika terlalu panjang, potong teks kiri
    const kPotong = k.substring(0, Math.max(1, lebar - r.length - 1)) + ' ';
    return kPotong + r;
  }
  return k + ' '.repeat(sisa) + r;
}

/**
 * Buat baris garis pemisah horizontal
 * @param {number} lebar
 * @param {string} [karakter='-']
 * @returns {string}
 */
export function buatGaris(lebar, karakter = '-') {
  return karakter.repeat(lebar);
}

/**
 * Format teks di tengah (center aligned)
 * @param {string} teks
 * @param {number} lebar
 * @returns {string}
 */
export function formatTengah(teks, lebar) {
  const t = String(teks || '').trim();
  if (t.length >= lebar) return t.substring(0, lebar);
  const spasiKiri = Math.floor((lebar - t.length) / 2);
  const spasiKanan = lebar - t.length - spasiKiri;
  return ' '.repeat(spasiKiri) + t + ' '.repeat(spasiKanan);
}

/**
 * Susun teks polos nota lengkap siap cetak atau salin
 * @param {Object} data  Data struk { penjualan, items, pembayaran, pelanggan, kasir, toko }
 * @param {'58'|'80'} [ukuran='58']
 * @returns {string}
 */
export function susunTeksStruk(data, ukuran = '58') {
  const lebar = LEBAR_KERTAS[ukuran] || 32;
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pembayaran = data.pembayaran || [];
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const toko = data.toko || store.get('toko') || {
    nama: namaFallback,
    alamat: store.get('pengaturan')?.toko_alamat || '',
    hp: store.get('pengaturan')?.toko_hp || '',
    nota_footer: store.get('pengaturan')?.nota_footer || ''
  };
  const kasir = data.kasir || { nama: 'Kasir' };
  const pelanggan = data.pelanggan || null;

  const baris = [];

  // Header Toko
  baris.push(formatTengah((toko.nama || namaFallback).toUpperCase(), lebar));
  if (toko.alamat) {
    const alamatPecah = toko.alamat.split('\n');
    alamatPecah.forEach((al) => baris.push(formatTengah(al, lebar)));
  }
  if (toko.hp) {
    baris.push(formatTengah('Telp/WA: ' + toko.hp, lebar));
  }
  baris.push(buatGaris(lebar, '='));

  // Metadata Nota
  baris.push(formatDuaKolom('No. Nota : ' + (pj.no_nota || '-'), '', lebar));
  baris.push(formatDuaKolom('Tanggal  : ' + formatTanggal(pj.tanggal, true), '', lebar));
  baris.push(formatDuaKolom('Kasir    : ' + (kasir.nama || 'Kasir'), '', lebar));
  baris.push(formatDuaKolom('Pelanggan: ' + (pelanggan ? pelanggan.nama : 'Umum'), '', lebar));

  if (pj.pengiriman === 'dikirim') {
    baris.push(formatDuaKolom('Kirim    : Dikirim Toko', '', lebar));
    if (pj.alamat_kirim) {
      baris.push('Alamat: ' + pj.alamat_kirim.substring(0, lebar - 8));
    }
  }

  baris.push(buatGaris(lebar, '-'));

  // Daftar Item
  items.forEach((it) => {
    // Baris 1: Nama barang
    let namaLengkap = it.nama || 'Barang';
    if (it.satuan) namaLengkap += ` (${it.satuan})`;
    baris.push(namaLengkap);

    // Baris 2: Qty x Harga Satuan ... Subtotal
    const hargaSatuan = formatRupiah(it.harga, false);
    const qtyStr = `${formatQty(it.qty)} x ${hargaSatuan}`;
    const subtotalStr = formatRupiah(it.subtotal);
    baris.push(formatDuaKolom('  ' + qtyStr, subtotalStr, lebar));

    // Catatan diskon item jika ada
    if (it.diskon > 0) {
      const diskonKet = it.diskon_tipe === 'persen' ? `(Diskon ${it.diskon_nilai}%)` : `(Potongan)`;
      baris.push(formatDuaKolom('  ' + diskonKet, '-' + formatRupiah(it.diskon), lebar));
    }

    // Status pengiriman parsial bila ada barang belum dibawa
    if (pj.pengiriman === 'dikirim' && it.qty_dibawa !== undefined && it.qty_dibawa < it.qty) {
      const sisaAntar = it.qty - it.qty_dibawa;
      baris.push(`  [Dibawa: ${formatQty(it.qty_dibawa)}, Sisa Antar: ${formatQty(sisaAntar)}]`);
    }
  });

  baris.push(buatGaris(lebar, '-'));

  // Ringkasan Pembayaran
  baris.push(formatDuaKolom('Subtotal', formatRupiah(pj.subtotal), lebar));

  if (pj.diskon > 0) {
    const diskonKet = pj.diskon_tipe === 'persen' ? `Diskon (${pj.diskon_nilai}%)` : 'Diskon';
    baris.push(formatDuaKolom(diskonKet, '-' + formatRupiah(pj.diskon), lebar));
  }

  if (pj.pajak > 0) {
    baris.push(formatDuaKolom('PPN', formatRupiah(pj.pajak), lebar));
  }

  if (pj.pembulatan !== 0) {
    baris.push(formatDuaKolom('Pembulatan', formatRupiah(pj.pembulatan), lebar));
  }

  baris.push(buatGaris(lebar, '='));
  baris.push(formatDuaKolom('TOTAL', formatRupiah(pj.total), lebar));
  baris.push(buatGaris(lebar, '-'));

  // Rincian Metode Bayar
  pembayaran.forEach((byr) => {
    const labelMetode = String(byr.metode || 'tunai').toUpperCase();
    baris.push(formatDuaKolom(`Bayar (${labelMetode})`, formatRupiah(byr.jumlah), lebar));
  });

  if (pj.kembalian > 0) {
    baris.push(formatDuaKolom('Kembalian', formatRupiah(pj.kembalian), lebar));
  }

  // Poin yang didapat jika ada
  if (pj.poin_didapat > 0 && pelanggan) {
    baris.push(buatGaris(lebar, '-'));
    baris.push(formatDuaKolom('Poin Didapat', `+${pj.poin_didapat} Poin`, lebar));
    if (pelanggan.poin !== undefined) {
      baris.push(formatDuaKolom('Total Saldo Poin', `${pelanggan.poin} Poin`, lebar));
    }
  }

  // Footer Nota
  baris.push(buatGaris(lebar, '='));
  const footerText = toko.nota_footer || 'Terima kasih atas kunjungan Anda.\nBarang yang sudah dibeli dapat diretur sesuai ketentuan.';
  footerText.split('\n').forEach((f) => baris.push(formatTengah(f, lebar)));

  baris.push('');
  baris.push('');

  return baris.join('\n');
}

/**
 * Hasilkan perintah biner ESC/POS untuk printer thermal
 * @param {string} teksStruk
 * @returns {Uint8Array}
 */
export function teksKeEscPos(teksStruk) {
  const bytes = [];

  // Inisialisasi printer: ESC @ (1B 40)
  bytes.push(0x1b, 0x40);

  // Set character code table ke PC437 (Standar)
  bytes.push(0x1b, 0x74, 0x00);

  // Parse baris demi baris teks
  const baris = teksStruk.split('\n');

  baris.forEach((line) => {
    // Normal size, normal weight
    bytes.push(0x1b, 0x21, 0x00);

    // Encode string ke ASCII bytes
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      bytes.push(code > 127 ? 63 : code); // replace non-ASCII dengan '?'
    }
    // Line Feed (0A)
    bytes.push(0x0a);
  });

  // Feed 4 baris & Cut paper: GS V A 0 (1D 56 41 00)
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a);
  bytes.push(0x1d, 0x56, 0x41, 0x00);

  return new Uint8Array(bytes);
}

/** Cache perangkat printer Web Bluetooth yang sedang terhubung */
let bluetoothDevice = null;
let bluetoothCharacteristic = null;

/**
 * 1. Cetak via Web Bluetooth Direct BLE (Chrome / Android / Desktop)
 * @param {Object} dataStruk
 * @param {'58'|'80'} [ukuran='58']
 * @returns {Promise<boolean>}
 */
export async function cetakBluetooth(dataStruk, ukuran = '58') {
  if (!navigator.bluetooth) {
    showToast('Web Bluetooth tidak didukung di browser ini. Gunakan RawBT atau Cetak Browser.', 'warning', 4500);
    return false;
  }

  try {
    showToast('Mencari printer Bluetooth...', 'info', 2000);

    // Hubungkan atau pakai koneksi lama jika masih aktif
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected || !bluetoothCharacteristic) {
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standar thermal printer BLE
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent service
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Pos-58 common
          '0000ffe0-0000-1000-8000-00805f9b34fb'  // HM-10 / generic serial
        ]
      });

      const server = await bluetoothDevice.gatt.connect();

      // Cari service yang tersedia
      let targetService = null;
      const services = await server.getPrimaryServices();
      if (services.length > 0) {
        targetService = services[0];
      }

      if (!targetService) {
        throw new Error('Service printer Bluetooth tidak ditemukan.');
      }

      const characteristics = await targetService.getCharacteristics();
      bluetoothCharacteristic = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);

      if (!bluetoothCharacteristic) {
        throw new Error('Karakteristik write Bluetooth tidak ditemukan.');
      }
    }

    const teksStruk = susunTeksStruk(dataStruk, ukuran);
    const escposBytes = teksKeEscPos(teksStruk);

    // Kirim dalam pecahan chunk (512 bytes) agar buffer printer tidak overflow
    const chunkSize = 512;
    for (let i = 0; i < escposBytes.length; i += chunkSize) {
      const chunk = escposBytes.slice(i, i + chunkSize);
      await bluetoothCharacteristic.writeValue(chunk);
    }

    showToast('Struk berhasil dicetak via Bluetooth.', 'success', 3000);
    return true;
  } catch (err) {
    console.error('Gagal cetak Bluetooth:', err);
    if (err.name === 'NotFoundError') {
      showToast('Pencarian Bluetooth dibatalkan.', 'info', 2000);
    } else {
      showToast('Gagal cetak Bluetooth: ' + (err.message || 'Koneksi terputus'), 'error', 4500);
    }
    return false;
  }
}

/**
 * Buka aplikasi RawBT di Android, atau buka Google Play Store jika belum terpasang
 * @returns {boolean}
 */
export function bukaAplikasiRawBT() {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (!isAndroid) {
    showToast('Aplikasi RawBT khusus untuk perangkat Android. Pada komputer/laptop, gunakan dialog Cetak Browser atau Web Bluetooth.', 'warning', 4500);
    return false;
  }

  try {
    // Intent URL launcher resmi Android dengan fallback ke Play Store
    const intentUri = 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=ru.a402d.rawbtprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dru.a402d.rawbtprinter;end;';
    const a = document.createElement('a');
    a.href = intentUri;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 150);
    showToast('Membuka aplikasi RawBT...', 'info', 2000);
    return true;
  } catch (err) {
    window.location.href = 'rawbt:';
    return true;
  }
}

/**
 * Buka halaman Google Play Store untuk mengunduh aplikasi RawBT
 */
export function pasangAplikasiRawBT() {
  const url = 'https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter';
  window.open(url, '_blank');
}

/**
 * Buat data struk uji/test untuk pengujian printer thermal
 * @param {'58'|'80'} [ukuran='58']
 * @returns {Object}
 */
export function buatDataStrukUji(ukuran = '58') {
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const cfg = store.get('pengaturan') || {};
  return {
    toko: {
      nama: namaFallback,
      alamat: cfg.toko_alamat || 'Alamat Toko',
      hp: cfg.toko_hp || '',
      nota_footer: '*** UJI KONEKSI PRINTER BERHASIL ***\nPrinter Bluetooth siap mencetak nota kasir!'
    },
    penjualan: {
      no_nota: 'TEST-PRINTER',
      tanggal: new Date(),
      subtotal: 75000,
      diskon: 5000,
      diskon_tipe: 'persen',
      diskon_nilai: 10,
      pajak: 0,
      pembulatan: 0,
      total: 70000,
      kembalian: 30000,
      poin_didapat: 7
    },
    items: [
      { nama: 'Item Tes Uji 1 (58/80mm)', satuan: 'Pcs', qty: 1, harga: 50000, subtotal: 50000, diskon: 0 },
      { nama: 'Item Tes Uji 2 (Diskon)', satuan: 'Btg', qty: 1, harga: 25000, subtotal: 20000, diskon: 5000, diskon_tipe: 'persen', diskon_nilai: 20 }
    ],
    pembayaran: [
      { metode: 'tunai', jumlah: 100000 }
    ],
    kasir: { nama: store.get('user')?.nama || 'Operator' },
    pelanggan: { nama: 'Pelanggan Uji', poin: 50 }
  };
}

/**
 * Eksekusi uji cetak struk (Test Print)
 * @param {'rawbt'|'bluetooth'|'browser'} [jalur='rawbt']
 * @param {'58'|'80'} [ukuran='58']
 */
export async function cetakUjiStruk(jalur = 'rawbt', ukuran = '58') {
  const data = buatDataStrukUji(ukuran);
  if (jalur === 'bluetooth') {
    return await cetakBluetooth(data, ukuran);
  } else if (jalur === 'browser') {
    return cetakBrowser(data, ukuran);
  } else {
    return cetakRawBT(data, ukuran);
  }
}

/**
 * 2. Cetak via RawBT Android App
 * Membuka aplikasi RawBT melalui URI intent rawbt:data:base64
 * @param {Object} dataStruk
 * @param {'58'|'80'} [ukuran='58']
 */
export function cetakRawBT(dataStruk, ukuran = '58') {
  let base64Data = '';
  try {
    const teksStruk = susunTeksStruk(dataStruk, ukuran);
    const escposBytes = teksKeEscPos(teksStruk);

    // Convert bytes ke base64 string
    let binary = '';
    const len = escposBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(escposBytes[i]);
    }
    base64Data = window.btoa(binary);

    // Intent URL resmi Android untuk RawBT dengan fallback Google Play Store
    const intentUri = `intent:base64,${base64Data}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dru.a402d.rawbtprinter;end;`;

    // Coba luncurkan lewat anchor click (standar WebView & Browser)
    const a = document.createElement('a');
    a.href = intentUri;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 150);

    showToast('Mengirim struk ke printer via RawBT...', 'info', 2500);
    return true;
  } catch (err) {
    try {
      if (!base64Data) throw err;
      const rawbtUri = `rawbt:data:base64,${base64Data}`;
      window.location.href = rawbtUri;
      return true;
    } catch (e2) {
      console.error('Gagal cetak RawBT:', err);
      showToast('Gagal memproses struk untuk RawBT: ' + err.message, 'error', 3500);
      return false;
    }
  }
}

/**
 * Tampilkan modal panduan & koneksi printer thermal Bluetooth via RawBT
 */
export function tampilkanModalKoneksiPrinter() {
  const cfg = store.get('pengaturan') || {};
  const ukuranKertas = cfg.printer_ukuran || '58';

  const modal = showModal({
    title: 'Koneksi Printer Bluetooth (RawBT)',
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="card card-body" style="background: linear-gradient(135deg, rgba(234, 88, 12, 0.08), rgba(249, 115, 22, 0.04)); border: 1.5px solid var(--primary-soft);">
          <div class="row" style="align-items: flex-start; gap: var(--sp-3);">
            <div style="background: var(--primary); color: #fff; width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${ICONS.printer}
            </div>
            <div class="stack-sm" style="flex: 1;">
              <div class="fw-bold text-base" style="color: var(--text);">Sambungkan Printer Thermal Bluetooth</div>
              <p class="text-sm text-muted" style="margin: 0; line-height: 1.4;">
                Aplikasi POS Kasir menggunakan <strong>RawBT Print Service</strong> untuk mencetak nota kasir secara instan, stabil, dan otomatis ke printer Bluetooth thermal Anda di Android.
              </p>
            </div>
          </div>
        </div>

        <!-- Tombol Aksi Cepat -->
        <div class="stack-sm">
          <div class="fw-bold text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px;">Aksi Cepat &amp; Uji Cetak:</div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm grow" id="btn-modal-open-rawbt" style="min-width: 140px;">
              📱 Buka Aplikasi RawBT
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-modal-test-rawbt" style="min-width: 140px;">
              🧪 Uji Cetak RawBT (${ukuranKertas}mm)
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap; margin-top: 2px;">
            <button type="button" class="btn btn-ghost btn-sm grow" id="btn-modal-test-ble">
              📶 Uji Web Bluetooth Direct
            </button>
            <button type="button" class="btn btn-ghost btn-sm grow" id="btn-modal-test-browser">
              🖨️ Uji Cetak Browser
            </button>
          </div>
        </div>

        <div class="divider" style="margin: var(--sp-1) 0;"></div>

        <!-- 4 Langkah Panduan -->
        <div class="stack-sm">
          <div class="fw-bold text-sm" style="color: var(--text);">4 Langkah Mudah Menyambungkan Printer:</div>
          
          <div class="stack" style="gap: var(--sp-2); margin-top: 4px;">
            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">1</span>
              <div>
                <strong>Pasang Aplikasi RawBT</strong> dari Google Play Store di HP/Tablet Android Anda jika belum ada.
                <div style="margin-top: 4px;">
                  <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-modal-download-rawbt" style="padding: 2px 8px; border: 1px solid var(--primary-soft);">
                    📥 Unduh RawBT di Google Play Store
                  </button>
                </div>
              </div>
            </div>

            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">2</span>
              <div>
                <strong>Nyalakan Printer &amp; Bluetooth</strong>: Hidupkan printer thermal Anda. Buka menu Bluetooth di HP, cari nama printer (cth: <em>RPP02N, PT-210, MPT-II, POS-58</em>), lalu pasangkan/pairing (PIN bawaan biasanya <code>0000</code> atau <code>1234</code>).
              </div>
            </div>

            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">3</span>
              <div>
                <strong>Pilih Printer di RawBT</strong>: Buka aplikasi RawBT &gt; buka menu <strong>Settings (Pengaturan)</strong> &gt; pilih tipe koneksi <strong>Bluetooth</strong> &gt; tekan <strong>Pilih Printer</strong> dan pilih nama printer Anda.
              </div>
            </div>

            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">4</span>
              <div>
                <strong>Tekan Tombol Uji Cetak</strong>: Tekan tombol <span class="badge badge-secondary">🧪 Uji Cetak RawBT</span> di atas. Jika kertas struk keluar, printer Anda sudah <strong>100% SIAP</strong> digunakan mencetak nota kasir!
              </div>
            </div>
          </div>
        </div>

        <div class="alert alert-info text-xs" style="margin-top: var(--sp-1); padding: 8px 12px;">
          💡 <strong>Tips Kasir:</strong> Setelah printer terhubung di RawBT, Anda tidak perlu mengulang proses koneksi lagi. Setiap kali selesai transaksi kasir, struk dapat langsung dicetak cukup dengan 1 kali klik.
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-modal-ke-pengaturan">
          ⚙️ Pengaturan Nota &amp; Kertas
        </button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-modal-tutup-koneksi">
          Selesai / Tutup
        </button>
      </div>
    `
  });

  modal.el.querySelector('#btn-modal-open-rawbt')?.addEventListener('click', () => {
    bukaAplikasiRawBT();
  });

  modal.el.querySelector('#btn-modal-download-rawbt')?.addEventListener('click', () => {
    pasangAplikasiRawBT();
  });

  modal.el.querySelector('#btn-modal-test-rawbt')?.addEventListener('click', () => {
    cetakUjiStruk('rawbt', ukuranKertas);
  });

  modal.el.querySelector('#btn-modal-test-ble')?.addEventListener('click', () => {
    cetakUjiStruk('bluetooth', ukuranKertas);
  });

  modal.el.querySelector('#btn-modal-test-browser')?.addEventListener('click', () => {
    cetakUjiStruk('browser', ukuranKertas);
  });

  modal.el.querySelector('#btn-modal-ke-pengaturan')?.addEventListener('click', () => {
    modal.close();
    window.location.hash = '#/pengaturan';
  });

  modal.el.querySelector('#btn-modal-tutup-koneksi')?.addEventListener('click', () => {
    modal.close();
  });
}

/**
 * 3. Cetak Struk via Browser (Thermal Preview Modal + window.print)
 * Bekerja di semua perangkat termasuk iPhone, desktop, dan tablet tanpa printer thermal fisik
 * @param {Object} dataStruk
 * @param {'58'|'80'} [ukuran='58']
 */
export function cetakBrowser(dataStruk, ukuran = '58') {
  const teksStruk = susunTeksStruk(dataStruk, ukuran);
  const lebarPx = ukuran === '80' ? '300px' : '230px';

  const modal = showModal({
    title: 'Pratinjau Struk Cetak',
    size: 'sm',
    body: `
      <div class="thermal-receipt-container" style="display: flex; justify-content: center; background: var(--surface-3); padding: var(--sp-4); border-radius: var(--radius-md);">
        <div id="print-area-thermal" class="thermal-receipt-sheet" style="
          width: ${lebarPx};
          background: #ffffff;
          color: #000000;
          font-family: 'Courier New', Courier, monospace;
          font-size: ${ukuran === '80' ? '12px' : '11px'};
          line-height: 1.25;
          padding: 16px 12px;
          box-shadow: var(--shadow-md);
          white-space: pre;
          overflow-x: hidden;
        ">${teksStruk}</div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-struk">Tutup</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-eksekusi-print">
          ${ICONS.printer} Cetak Struk
        </button>
      </div>
    `
  });

  modal.el.querySelector('#btn-tutup-struk')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-eksekusi-print')?.addEventListener('click', () => {
    // Siapkan print iframe atau print window
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cetak Nota ${dataStruk.penjualan?.no_nota || ''}</title>
        <style>
          @page {
            size: ${ukuran === '80' ? '80mm auto' : '58mm auto'};
            margin: 0;
          }
          body {
            margin: 0;
            padding: 8px 6px;
            font-family: 'Courier New', Courier, monospace;
            font-size: ${ukuran === '80' ? '12px' : '10px'};
            line-height: 1.25;
            color: #000;
            background: #fff;
            white-space: pre;
          }
        </style>
      </head>
      <body>${teksStruk}</body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => {
        if (printFrame.parentElement) printFrame.remove();
      }, 1000);
    }, 250);
  });
}

/**
 * 4. Buat URL WhatsApp untuk kirim struk digital ke pelanggan
 * @param {Object} dataStruk
 * @param {string} [nomorHp='']
 * @returns {string}
 */
export function buatTautanWhatsApp(dataStruk, nomorHp = '') {
  const pj = dataStruk.penjualan || {};
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const toko = dataStruk.toko || store.get('toko') || { nama: namaFallback };
  const items = dataStruk.items || [];

  let pesan = `*STRUK PENJUALAN - ${(toko.nama || namaFallback).toUpperCase()}*\n`;
  pesan += `No. Nota: *${pj.no_nota || '-'}*\n`;
  pesan += `Tanggal : ${formatTanggal(pj.tanggal, true)}\n`;
  pesan += `--------------------------------\n`;

  items.forEach((it) => {
    pesan += `• ${it.nama} (${formatQty(it.qty)} ${it.satuan})\n`;
    pesan += `  ${formatRupiah(it.subtotal)}\n`;
  });

  pesan += `--------------------------------\n`;
  if (pj.diskon > 0) pesan += `Diskon: -${formatRupiah(pj.diskon)}\n`;
  pesan += `*TOTAL : ${formatRupiah(pj.total)}*\n`;
  pesan += `Metode : ${String(pj.metode_bayar || 'tunai').toUpperCase()}\n`;
  pesan += `Status : ${String(pj.status_bayar || 'lunas').toUpperCase()}\n\n`;
  pesan += `${toko.nota_footer || 'Terima kasih atas kunjungan Anda.'}`;

  // Bersihkan format nomor HP (ganti 08... jadi 628...)
  let hpBersih = String(nomorHp || '').replace(/[^0-9]/g, '');
  if (hpBersih.startsWith('0')) {
    hpBersih = '62' + hpBersih.substring(1);
  }

  const encoded = encodeURIComponent(pesan);
  return hpBersih ? `https://wa.me/${hpBersih}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}


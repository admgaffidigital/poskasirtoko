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

  if (Number(pj.ongkir) > 0) {
    baris.push(formatDuaKolom('Ongkos Kirim', formatRupiah(pj.ongkir), lebar));
  }

  if (pj.pembulatan !== 0) {
    baris.push(formatDuaKolom('Pembulatan', formatRupiah(pj.pembulatan), lebar));
  }

  baris.push(buatGaris(lebar, '='));
  baris.push(formatDuaKolom('TOTAL', formatRupiah(pj.total), lebar));
  baris.push(buatGaris(lebar, '-'));

  // Rincian Metode Bayar
  let pakaiDeposit = String(pj.metode_bayar || '').toLowerCase() === 'deposit';
  pembayaran.forEach((byr) => {
    const mLow = String(byr.metode || 'tunai').toLowerCase();
    if (mLow === 'deposit') pakaiDeposit = true;
    const labelMetode = mLow === 'deposit' ? 'SALDO TITIPAN' : mLow.toUpperCase();
    baris.push(formatDuaKolom(`Bayar (${labelMetode})`, formatRupiah(byr.jumlah), lebar));
  });

  if (pj.kembalian > 0) {
    baris.push(formatDuaKolom('Kembalian', formatRupiah(pj.kembalian), lebar));
  }

  // Sisa Saldo Titipan / Deposit jika transaksi menggunakan saldo deposit
  if (pakaiDeposit && pelanggan && pelanggan.saldo_deposit !== undefined) {
    baris.push(formatDuaKolom('Sisa Saldo Titipan', formatRupiah(pelanggan.saldo_deposit), lebar));
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
 * Kirim buffer bytes ESC/POS ke printer Web Bluetooth
 * @param {Uint8Array} escposBytes
 * @returns {Promise<boolean>}
 */
async function kirimBytesKeBluetooth(escposBytes) {
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

    // Kirim dalam pecahan chunk (512 bytes) agar buffer printer tidak overflow
    const chunkSize = 512;
    for (let i = 0; i < escposBytes.length; i += chunkSize) {
      const chunk = escposBytes.slice(i, i + chunkSize);
      await bluetoothCharacteristic.writeValue(chunk);
    }

    showToast('Struk berhasil dicetak via Bluetooth.', 'success', 3000);
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') {
      showToast('Pencarian perangkat Bluetooth dibatalkan.', 'info', 2200);
    } else {
      console.error('Gagal cetak Bluetooth:', err);
      showToast('Gagal cetak Bluetooth: ' + (err?.message || 'Koneksi terputus'), 'error', 4500);
    }
    return false;
  }
}

/**
 * 1. Cetak via Web Bluetooth Direct BLE (Chrome / Android / Desktop)
 * @param {Object} dataStruk
 * @param {'58'|'80'} [ukuran='58']
 * @returns {Promise<boolean>}
 */
export async function cetakBluetooth(dataStruk, ukuran = '58') {
  const teksStruk = susunTeksStruk(dataStruk, ukuran);
  const escposBytes = teksKeEscPos(teksStruk);
  return await kirimBytesKeBluetooth(escposBytes);
}

/**
 * Helper internal: konversi Uint8Array ESC/POS ke string Base64
 * @param {Uint8Array} escposBytes
 * @returns {string}
 */
function escPosKeBase64(escposBytes) {
  let binary = '';
  const len = escposBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(escposBytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper internal: deteksi apakah berjalan di Android (APK Native atau Browser Android)
 * @returns {boolean}
 */
function adalahPerangkatAndroid() {
  return Boolean(window.AndroidRawBT) || /android/i.test(navigator.userAgent || '');
}

/**
 * Helper internal terpusat: kirim perintah ESC/POS ke RawBT Android.
 * Prioritas:
 * 1. Native Android APK Bridge (`window.AndroidRawBT.printBase64`) — instan, stabil, bebas ERR_UNKNOWN_URL_SCHEME
 * 2. Chrome Android Intent URL (`intent:base64,...#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;...`)
 * @param {Uint8Array} escposBytes
 * @param {string} [label='struk']
 * @returns {boolean}
 */
function kirimEscPosKeRawBT(escposBytes, label = 'struk') {
  let base64Data = '';
  try {
    base64Data = escPosKeBase64(escposBytes);

    // Jalur 1: Native Android APK Bridge (Capacitor MainActivity.java)
    if (window.AndroidRawBT && typeof window.AndroidRawBT.printBase64 === 'function') {
      const hasil = window.AndroidRawBT.printBase64(base64Data);
      if (hasil === 'OK') {
        showToast(`Mengirim ${label} ke printer via RawBT...`, 'success', 2400);
        return true;
      }
      if (hasil === 'NOT_INSTALLED') {
        showToast('Aplikasi RawBT belum terpasang di HP ini. Membuka Google Play Store...', 'warning', 4500);
        return false;
      }
    }

    // Jalur 2: Intent URL resmi Android (Chrome PWA / Browser Android)
    const intentUri = `intent:base64,${base64Data}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dru.a402d.rawbtprinter;end;`;
    const a = document.createElement('a');
    a.href = intentUri;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 150);

    showToast(`Mengirim ${label} ke printer via RawBT...`, 'info', 2500);
    return true;
  } catch (err) {
    try {
      if (!base64Data) throw err;
      window.location.href = `rawbt:base64,${base64Data}`;
      return true;
    } catch (e2) {
      console.error('Gagal cetak RawBT:', err);
      showToast(`Gagal memproses ${label} untuk RawBT: ` + (err?.message || ''), 'error', 3500);
      return false;
    }
  }
}

/**
 * Buka Pengaturan Bluetooth Android secara langsung (khusus APK Android Native)
 */
export function bukaPengaturanBluetoothHP() {
  if (window.AndroidRawBT && typeof window.AndroidRawBT.openBluetoothSettings === 'function') {
    window.AndroidRawBT.openBluetoothSettings();
    showToast('Membuka Pengaturan Bluetooth HP...', 'info', 2000);
    return true;
  }
  showToast('Buka menu Setelan (Settings) > Bluetooth di HP Anda lalu pasangkan (pair) printer thermal.', 'info', 4000);
  return false;
}

/**
 * Buka aplikasi RawBT di Android, atau buka Google Play Store jika belum terpasang
 * @returns {boolean}
 */
export function bukaAplikasiRawBT() {
  if (!adalahPerangkatAndroid()) {
    showToast('Aplikasi RawBT khusus untuk perangkat Android. Pada komputer/laptop, gunakan dialog Cetak Browser atau Web Bluetooth.', 'warning', 4500);
    return false;
  }

  // Jalur 1: Native Android APK Bridge (langsung buka RawBT tanpa error WebView)
  if (window.AndroidRawBT && typeof window.AndroidRawBT.openRawBT === 'function') {
    const hasil = window.AndroidRawBT.openRawBT();
    if (hasil === 'OK') {
      showToast('Membuka aplikasi RawBT...', 'success', 2000);
      return true;
    }
    if (hasil === 'NOT_INSTALLED') {
      showToast('Aplikasi RawBT belum terpasang. Membuka Google Play Store...', 'warning', 4000);
      return false;
    }
  }

  try {
    // Jalur 2: Intent URL launcher resmi Android dengan fallback ke Play Store
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
  if (window.AndroidRawBT && typeof window.AndroidRawBT.openPlayStoreRawBT === 'function') {
    window.AndroidRawBT.openPlayStoreRawBT();
    showToast('Membuka RawBT di Google Play Store...', 'info', 2000);
    return;
  }
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
  if (!adalahPerangkatAndroid()) {
    showToast('RawBT khusus Android. Dialihkan ke dialog Cetak Browser komputer...', 'info', 3000);
    return cetakBrowser(dataStruk, ukuran);
  }

  const teksStruk = susunTeksStruk(dataStruk, ukuran);
  const escposBytes = teksKeEscPos(teksStruk);
  return kirimEscPosKeRawBT(escposBytes, 'struk penjualan');
}

/**
 * Tampilkan modal panduan & koneksi printer thermal Bluetooth via RawBT
 */
export function tampilkanModalKoneksiPrinter() {
  const cfg = store.get('pengaturan') || {};
  let ukuranKertas = cfg.printer_ukuran === '80' ? '80' : '58';

  const hasNativeBridge = Boolean(window.AndroidRawBT);
  let rawbtInstalled = null;
  let btEnabled = null;
  if (hasNativeBridge) {
    try {
      rawbtInstalled = typeof window.AndroidRawBT.isRawBTInstalled === 'function' ? Boolean(window.AndroidRawBT.isRawBTInstalled()) : null;
      btEnabled = typeof window.AndroidRawBT.isBluetoothEnabled === 'function' ? Boolean(window.AndroidRawBT.isBluetoothEnabled()) : null;
    } catch (_) { }
  }

  const statusBadgesHtml = hasNativeBridge ? `
    <div class="row" style="gap: 6px; flex-wrap: wrap; margin-top: 8px;">
      ${rawbtInstalled === true
      ? '<span class="badge badge-success badge-dot">RawBT Terpasang &amp; Siap</span>'
      : '<span class="badge badge-warning badge-dot">RawBT Belum Terpasang</span>'}
      ${btEnabled === true
      ? '<span class="badge badge-success badge-dot">Bluetooth HP Aktif</span>'
      : (btEnabled === false ? '<span class="badge badge-danger badge-dot">Bluetooth HP Mati</span>' : '')}
    </div>
  ` : '';

  const modal = showModal({
    title: 'Koneksi Printer Bluetooth (RawBT)',
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="card card-body" style="background: var(--primary-soft); border: 1.5px solid rgba(var(--primary-rgb, 232, 89, 12), 0.25);">
          <div class="row" style="align-items: flex-start; gap: var(--sp-3);">
            <div style="background: var(--primary); color: #fff; width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${ICONS.printer}
            </div>
            <div class="stack-sm" style="flex: 1; min-width: 0;">
              <div class="fw-bold text-base" style="color: var(--text);">Sambungkan Printer Thermal Bluetooth</div>
              <p class="text-sm text-muted" style="margin: 0; line-height: 1.45;">
                Aplikasi POS Kasir terhubung langsung secara native ke <strong>RawBT Print Service</strong> untuk mencetak nota kasir secara instan dan stabil di HP/Tablet Android.
              </p>
              ${statusBadgesHtml}
            </div>
          </div>
        </div>

        <!-- Pilih Ukuran Kertas Cepat -->
        <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap; padding: 8px 12px; border-radius: var(--radius-md); background: var(--surface-2); border: 1px solid var(--border);">
          <span class="text-xs fw-semibold text-muted">Ukuran Kertas Uji Cetak:</span>
          <div class="row" style="gap: 6px;" id="modal-printer-size-toggle">
            <button type="button" class="btn btn-xs ${ukuranKertas === '58' ? 'btn-primary' : 'btn-secondary'}" data-paper-size="58">58 mm (Standar)</button>
            <button type="button" class="btn btn-xs ${ukuranKertas === '80' ? 'btn-primary' : 'btn-secondary'}" data-paper-size="80">80 mm (Lebar)</button>
          </div>
        </div>

        <!-- Tombol Aksi Cepat -->
        <div class="stack-sm">
          <div class="fw-bold text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px;">Aksi Cepat &amp; Uji Cetak:</div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            ${rawbtInstalled === false ? `
              <button type="button" class="btn btn-primary btn-sm grow" id="btn-modal-install-rawbt-top" style="min-width: 150px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.download}
                <span>Pasang RawBT (Play Store)</span>
              </button>
            ` : `
              <button type="button" class="btn btn-primary btn-sm grow" id="btn-modal-test-rawbt" style="min-width: 150px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.printer}
                <span id="lbl-btn-test-rawbt">Uji Cetak RawBT (${ukuranKertas}mm)</span>
              </button>
            `}
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-modal-open-rawbt" style="min-width: 140px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.smartphone}
              <span>Buka Aplikasi RawBT</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap; margin-top: 2px;">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-modal-open-bt-settings" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth}
              <span>Pengaturan Bluetooth HP</span>
            </button>
            <button type="button" class="btn btn-ghost btn-sm grow" id="btn-modal-test-ble" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth}
              <span>Uji Web Bluetooth</span>
            </button>
            <button type="button" class="btn btn-ghost btn-sm grow" id="btn-modal-test-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.printer}
              <span>Uji Cetak Browser</span>
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
                  <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-modal-download-rawbt" style="padding: 2px 8px; border: 1px solid rgba(var(--primary-rgb, 232, 89, 12), 0.25); display: inline-flex; align-items: center; gap: 4px;">
                    ${ICONS.download}
                    <span>Unduh RawBT di Google Play Store</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">2</span>
              <div>
                <strong>Nyalakan Printer &amp; Bluetooth</strong>: Ketuk tombol <strong>Pengaturan Bluetooth HP</strong> di atas, cari nama printer (cth: <em>RPP02N, PT-210, MPT-II, POS-58</em>), lalu pasangkan/pairing (PIN bawaan biasanya <code>0000</code> atau <code>1234</code>).
              </div>
            </div>

            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">3</span>
              <div>
                <strong>Pilih Printer di RawBT</strong>: Ketuk <strong>Buka Aplikasi RawBT</strong> &gt; buka menu <strong>Settings (Pengaturan)</strong> &gt; pilih tipe koneksi <strong>Bluetooth</strong> &gt; tekan <strong>Pilih Printer</strong> dan pilih nama printer Anda.
              </div>
            </div>

            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">4</span>
              <div>
                <strong>Tekan Tombol Uji Cetak</strong>: Ketuk tombol <span class="badge badge-secondary" style="font-weight: var(--fw-semibold);">Uji Cetak RawBT</span> di atas. Jika kertas struk keluar, printer Anda sudah <strong>100% SIAP</strong> digunakan mencetak nota kasir!
              </div>
            </div>
          </div>
        </div>

        <div class="alert alert-info text-xs" style="margin-top: var(--sp-1); padding: 8px 12px; display: flex; align-items: flex-start; gap: 6px;">
          ${ICONS.info}
          <div><strong>Tips Kasir:</strong> Setelah printer dipilih satu kali di aplikasi RawBT, Anda tidak perlu menyambungkan ulang. Cetak nota dari POS Kasir cukup 1 klik dan langsung terkirim ke printer.</div>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-modal-ke-pengaturan" style="display: inline-flex; align-items: center; gap: 6px;">
          ${ICONS.settings}
          <span>Pengaturan Nota &amp; Kertas</span>
        </button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-modal-tutup-koneksi">
          Selesai / Tutup
        </button>
      </div>
    `
  });

  modal.el.querySelectorAll('[data-paper-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ukuranKertas = btn.getAttribute('data-paper-size') === '80' ? '80' : '58';
      modal.el.querySelectorAll('[data-paper-size]').forEach((b) => {
        b.className = `btn btn-xs ${b === btn ? 'btn-primary' : 'btn-secondary'}`;
      });
      const lbl = modal.el.querySelector('#lbl-btn-test-rawbt');
      if (lbl) lbl.textContent = `Uji Cetak RawBT (${ukuranKertas}mm)`;
    });
  });

  modal.el.querySelector('#btn-modal-open-rawbt')?.addEventListener('click', () => {
    bukaAplikasiRawBT();
  });

  modal.el.querySelector('#btn-modal-open-bt-settings')?.addEventListener('click', () => {
    bukaPengaturanBluetoothHP();
  });

  modal.el.querySelector('#btn-modal-install-rawbt-top')?.addEventListener('click', () => {
    pasangAplikasiRawBT();
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
    if (typeof window.__posNavigate === 'function') {
      window.__posNavigate('#/pengaturan');
    } else {
      window.location.hash = '#/pengaturan';
    }
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
  if (Number(pj.ongkir) > 0) pesan += `Ongkos Kirim: ${formatRupiah(pj.ongkir)}\n`;
  const metodeBayarWa = String(pj.metode_bayar || 'tunai').toLowerCase();
  const pembayaranList = Array.isArray(dataStruk.pembayaran) ? dataStruk.pembayaran : [];
  const pakaiDepositWa = metodeBayarWa === 'deposit' || pembayaranList.some((b) => String(b.metode || '').toLowerCase() === 'deposit');
  const pelWa = dataStruk.pelanggan || null;
  pesan += `*TOTAL : ${formatRupiah(pj.total)}*\n`;
  pesan += `Metode : ${metodeBayarWa === 'deposit' ? 'SALDO TITIPAN' : metodeBayarWa.toUpperCase()}\n`;
  pesan += `Status : ${String(pj.status_bayar || 'lunas').toUpperCase()}\n`;
  if (pakaiDepositWa && pelWa && pelWa.saldo_deposit !== undefined) {
    pesan += `Sisa Saldo Titipan : ${formatRupiah(pelWa.saldo_deposit)}\n`;
  }
  pesan += `\n${toko.nota_footer || 'Terima kasih atas kunjungan Anda.'}`;

  // Bersihkan format nomor HP (ganti 08... jadi 628...)
  let hpBersih = String(nomorHp || '').replace(/[^0-9]/g, '');
  if (hpBersih.startsWith('0')) {
    hpBersih = '62' + hpBersih.substring(1);
  }

  const encoded = encodeURIComponent(pesan);
  return hpBersih ? `https://wa.me/${hpBersih}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * Buka dialog modal pilihan cetak struk penjualan (RawBT, Web Bluetooth, Browser, WA)
 * @param {Object} dataStruk { penjualan, items, pembayaran, pelanggan, kasir, toko }
 * @param {Object} [options={}] { isNewTransaction: boolean, onNewTransaction: Function }
 */
export function bukaModalPilihanCetakPenjualan(dataStruk, options = {}) {
  const cfg = store.get('pengaturan') || {};
  const tokoData = store.get('toko') || {};
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';

  dataStruk.toko = dataStruk.toko || {
    nama: cfg.toko_nama || tokoData.nama || namaFallback,
    alamat: cfg.toko_alamat || tokoData.alamat || '',
    hp: cfg.toko_hp || tokoData.hp || '',
    nota_footer: cfg.nota_footer || tokoData.nota_footer || ''
  };

  const ukuran = cfg.printer_ukuran || '58';
  const jalurUtama = cfg.printer_jalur || 'rawbt';
  const isRawBtUtama = jalurUtama === 'rawbt' || jalurUtama === 'otomatis';

  const pj = dataStruk.penjualan || {};
  const pel = dataStruk.pelanggan || null;
  const items = dataStruk.items || [];
  const kembalian = Number(pj.kembalian || 0);

  const modal = showModal({
    title: options.isNewTransaction ? 'Transaksi Berhasil!' : 'Cetak Struk Penjualan',
    size: 'sm',
    body: `
      <div class="stack" style="gap: var(--sp-3); text-align: center;">
        <div style="display: flex; justify-content: center; align-items: center; color: ${options.isNewTransaction ? 'var(--success)' : 'var(--primary)'};">
          <div style="width: 44px; height: 44px;">
            ${options.isNewTransaction ? ICONS.checkCircle : ICONS.printer}
          </div>
        </div>
        <div>
          <div class="text-xs text-muted">NOMOR NOTA PENJUALAN</div>
          <div class="fw-bold mono text-lg">${escapeHtml(pj.no_nota || '-')}</div>
          <div class="text-sm text-muted" style="margin-top: 4px;">
            Pelanggan: <strong>${escapeHtml(pel ? pel.nama : (pj.pelanggan_nama || 'Pelanggan Umum'))}</strong>
          </div>
          <div class="text-sm fw-bold text-primary" style="margin-top: 2px;">
            Total: ${formatRupiah(pj.total)} (${String(pj.status_bayar || 'lunas').toUpperCase()})
          </div>
          ${options.isNewTransaction && kembalian > 0 ? `
            <div class="badge badge-success" style="font-size: 13px; margin-top: 6px;">
              Kembalian: ${formatRupiah(kembalian)}
            </div>
          ` : ''}
        </div>

        <div class="divider"></div>

        <div class="stack" style="gap: var(--sp-2);">
          <div class="row-between">
            <span class="fw-bold text-xs text-muted">PILIHAN CETAK STRUK:</span>
            <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-panduan-printer-modal-jual" style="padding: 2px 6px; display: inline-flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Atur Printer</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn ${isRawBtUtama ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-print-jual-rawbt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>
              <span>RawBT Android (${ukuran}mm)</span>
            </button>
            <button type="button" class="btn ${isRawBtUtama ? 'btn-secondary' : 'btn-primary'} btn-sm grow" id="btn-print-jual-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/></svg>
              <span>Bluetooth Direct</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-jual-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              <span>Cetak / Browser</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-share-jual-wa" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: ${options.isNewTransaction ? 'space-between' : 'flex-end'};">
        ${options.isNewTransaction ? `
          <button type="button" class="btn btn-ghost btn-sm" id="btn-tutup-modal-cetak-jual">Tutup</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-transaksi-baru-modal" style="font-weight: 600;">
            Transaksi Baru
          </button>
        ` : `
          <button type="button" class="btn btn-ghost btn-sm" id="btn-tutup-modal-cetak-jual">Tutup</button>
        `}
      </div>
    `
  });

  modal.el.querySelector('#btn-print-jual-rawbt')?.addEventListener('click', () => {
    cetakRawBT(dataStruk, ukuran);
  });

  modal.el.querySelector('#btn-print-jual-bt')?.addEventListener('click', () => {
    cetakBluetooth(dataStruk, ukuran);
  });

  modal.el.querySelector('#btn-print-jual-browser')?.addEventListener('click', () => {
    cetakBrowser(dataStruk, ukuran);
  });

  modal.el.querySelector('#btn-panduan-printer-modal-jual')?.addEventListener('click', () => {
    tampilkanModalKoneksiPrinter();
  });

  modal.el.querySelector('#btn-share-jual-wa')?.addEventListener('click', () => {
    const noHp = pel ? pel.hp : (dataStruk.pelanggan_hp || '');
    const urlWa = buatTautanWhatsApp(dataStruk, noHp);
    window.open(urlWa, '_blank');
  });

  modal.el.querySelector('#btn-tutup-modal-cetak-jual')?.addEventListener('click', () => {
    modal.close();
  });

  if (options.isNewTransaction) {
    modal.el.querySelector('#btn-transaksi-baru-modal')?.addEventListener('click', () => {
      modal.close();
      if (typeof options.onNewTransaction === 'function') {
        options.onNewTransaction();
      }
    });
  }
}

/* ========================================================================== */
/* MODUL CETAK STRUK PEMBELIAN & BARANG MASUK KE SUPPLIER                     */
/* ========================================================================== */

/**
 * Susun teks nota pembelian / barang masuk (Thermal 58mm & 80mm)
 * @param {Object} data  { pembelian, items, supplier, hutang, toko, petugas }
 * @param {'58'|'80'} [ukuran='58']
 * @returns {string}
 */
export function susunTeksStrukPembelian(data, ukuran = '58') {
  const lebar = LEBAR_KERTAS[ukuran] || 32;
  const pb = data.pembelian || {};
  const items = data.items || [];
  const sup = data.supplier || { nama: 'Supplier Umum' };
  const hutang = data.hutang || null;
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const cfg = store.get('pengaturan') || {};
  const toko = data.toko || store.get('toko') || {
    nama: namaFallback,
    alamat: cfg.toko_alamat || '',
    hp: cfg.toko_hp || '',
    nota_footer: cfg.nota_footer || ''
  };
  const petugas = data.petugas || store.get('user') || { nama: 'Petugas' };

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
  baris.push(formatTengah('FAKTUR PEMBELIAN / BARANG MASUK', lebar));
  baris.push(buatGaris(lebar, '-'));

  // Metadata Faktur
  baris.push(formatDuaKolom('No. Faktur : ' + (pb.no_faktur || '-'), '', lebar));
  baris.push(formatDuaKolom('Tanggal    : ' + formatTanggal(pb.tanggal, true), '', lebar));
  baris.push(formatDuaKolom('Supplier   : ' + (sup.nama || '-'), '', lebar));
  if (pb.no_faktur_supplier) {
    baris.push(formatDuaKolom('Ref Asli   : ' + pb.no_faktur_supplier, '', lebar));
  }
  baris.push(formatDuaKolom('Petugas    : ' + (petugas.nama || 'Petugas'), '', lebar));

  baris.push(buatGaris(lebar, '-'));

  // Daftar Barang Masuk
  items.forEach((it) => {
    let namaBarang = it.nama || 'Barang';
    if (it.satuan) namaBarang += ` (${it.satuan})`;
    baris.push(namaBarang);

    const hargaSatuan = formatRupiah(it.harga_beli, false);
    const qtyStr = `${formatQty(it.qty)} x ${hargaSatuan}`;
    const subtotalStr = formatRupiah(it.subtotal);
    baris.push(formatDuaKolom('  ' + qtyStr, subtotalStr, lebar));

    if (Number(it.diskon_persen) > 0 || Number(it.diskon_item) > 0) {
      const diskonKet = Number(it.diskon_persen) > 0 ? `(Disk ${formatQty(it.diskon_persen)}%)` : `(Potongan)`;
      const diskonRp = Number(it.diskon_item) || Math.round(Number(it.qty || 0) * Number(it.harga_beli || 0) * (Number(it.diskon_persen) / 100));
      baris.push(formatDuaKolom('  ' + diskonKet, '-' + formatRupiah(diskonRp), lebar));
    }
  });

  baris.push(buatGaris(lebar, '-'));

  // Ringkasan Keuangan
  baris.push(formatDuaKolom('Subtotal Kotor', formatRupiah(pb.subtotal), lebar));

  if (Number(pb.diskon_item) > 0) {
    baris.push(formatDuaKolom('Diskon Supplier', '-' + formatRupiah(pb.diskon_item), lebar));
  }
  if (Number(pb.diskon) > 0) {
    baris.push(formatDuaKolom('Diskon Faktur', '-' + formatRupiah(pb.diskon), lebar));
  }
  if (Number(pb.ongkir) > 0) {
    baris.push(formatDuaKolom(pb.biaya_masuk_hutang === false ? 'Ongkir (Terpisah)' : 'Ongkos Kirim', formatRupiah(pb.ongkir), lebar));
  }
  if (Number(pb.biaya_bongkar) > 0) {
    baris.push(formatDuaKolom(pb.biaya_masuk_hutang === false ? 'Bongkar (Terpisah)' : 'Biaya Bongkar', formatRupiah(pb.biaya_bongkar), lebar));
  }

  baris.push(buatGaris(lebar, '='));
  baris.push(formatDuaKolom('TOTAL TAGIHAN', formatRupiah(pb.total), lebar));
  baris.push(buatGaris(lebar, '-'));

  baris.push(formatDuaKolom('Dibayar', formatRupiah(pb.bayar || 0), lebar));
  const statusStr = String(pb.status_bayar || 'lunas').toUpperCase();
  baris.push(formatDuaKolom('Status Bayar', statusStr, lebar));

  const sisaHutang = hutang ? hutang.sisa : Math.max(0, Number(pb.total || 0) - Number(pb.bayar || 0));
  if (sisaHutang > 0) {
    baris.push(formatDuaKolom('Sisa Hutang', formatRupiah(sisaHutang), lebar));
    const jatuhTempoTgl = pb.jatuh_tempo || (hutang ? hutang.jatuh_tempo : '');
    if (jatuhTempoTgl) {
      baris.push(formatDuaKolom('Jatuh Tempo', formatTanggal(jatuhTempoTgl), lebar));
    }
  }

  if (pb.catatan) {
    baris.push(buatGaris(lebar, '-'));
    baris.push('Catatan: ' + pb.catatan.substring(0, lebar * 2));
  }

  baris.push(buatGaris(lebar, '='));
  baris.push(formatTengah('Bukti Sah Verifikasi Stok Masuk', lebar));
  baris.push(formatTengah('Terima kasih atas kerja samanya', lebar));

  baris.push('');
  baris.push('');

  return baris.join('\n');
}

/**
 * Cetak struk pembelian via RawBT Android
 * @param {Object} dataPembelian
 * @param {'58'|'80'} [ukuran='58']
 * @returns {boolean}
 */
export function cetakRawBTPembelian(dataPembelian, ukuran = '58') {
  if (!adalahPerangkatAndroid()) {
    showToast('RawBT khusus Android. Dialihkan ke dialog Cetak Browser komputer...', 'info', 3000);
    return cetakBrowserPembelian(dataPembelian, ukuran);
  }

  const teksStruk = susunTeksStrukPembelian(dataPembelian, ukuran);
  const escposBytes = teksKeEscPos(teksStruk);
  return kirimEscPosKeRawBT(escposBytes, 'faktur pembelian');
}

/**
 * Cetak struk pembelian via Web Bluetooth BLE
 * @param {Object} dataPembelian
 * @param {'58'|'80'} [ukuran='58']
 * @returns {Promise<boolean>}
 */
export async function cetakBluetoothPembelian(dataPembelian, ukuran = '58') {
  const teksStruk = susunTeksStrukPembelian(dataPembelian, ukuran);
  const escposBytes = teksKeEscPos(teksStruk);
  return await kirimBytesKeBluetooth(escposBytes);
}

/**
 * Cetak struk pembelian via dialog cetak browser / preview modal
 * @param {Object} dataPembelian
 * @param {'58'|'80'} [ukuran='58']
 */
export function cetakBrowserPembelian(dataPembelian, ukuran = '58') {
  const teksStruk = susunTeksStrukPembelian(dataPembelian, ukuran);
  const lebarPx = ukuran === '80' ? '300px' : '230px';
  const pb = dataPembelian.pembelian || {};

  const modal = showModal({
    title: `Pratinjau Faktur Pembelian: ${pb.no_faktur || ''}`,
    size: 'sm',
    body: `
      <div class="thermal-receipt-container" style="display: flex; justify-content: center; background: var(--surface-3); padding: var(--sp-4); border-radius: var(--radius-md);">
        <div id="print-area-thermal-beli" class="thermal-receipt-sheet" style="
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
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-struk-beli">Tutup</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-eksekusi-print-beli">
          ${ICONS.printer} Cetak Faktur
        </button>
      </div>
    `
  });

  modal.el.querySelector('#btn-tutup-struk-beli')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-eksekusi-print-beli')?.addEventListener('click', () => {
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
        <title>Faktur Pembelian ${pb.no_faktur || ''}</title>
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
 * Buka dialog modal pilihan cetak faktur pembelian (RawBT, Web Bluetooth, Browser, WA)
 * @param {Object} dataPembelian { pembelian, items, supplier, hutang }
 */
export function bukaModalPilihanCetakPembelian(dataPembelian) {
  const cfg = store.get('pengaturan') || {};
  const ukuran = cfg.printer_ukuran || '58';
  const jalurUtama = cfg.printer_jalur || 'rawbt';
  const isRawBtUtama = jalurUtama === 'rawbt' || jalurUtama === 'otomatis';

  const pb = dataPembelian.pembelian || {};
  const sup = dataPembelian.supplier || {};

  const modal = showModal({
    title: 'Cetak Faktur Pembelian',
    size: 'sm',
    body: `
      <div class="stack" style="gap: var(--sp-3); text-align: center;">
        <div style="display: flex; justify-content: center; align-items: center; color: var(--primary);">
          <div style="width: 44px; height: 44px;">
            ${ICONS.printer}
          </div>
        </div>
        <div>
          <div class="text-xs text-muted">FAKTUR PEMBELIAN / BARANG MASUK</div>
          <div class="fw-bold mono text-lg">${escapeHtml(pb.no_faktur || '-')}</div>
          <div class="text-sm text-muted" style="margin-top: 4px;">
            Supplier: <strong>${escapeHtml(sup.nama || '-')}</strong>
          </div>
          <div class="text-sm fw-bold text-primary" style="margin-top: 2px;">
            Total: ${formatRupiah(pb.total)} (${String(pb.status_bayar || 'lunas').toUpperCase()})
          </div>
        </div>

        <div class="divider"></div>

        <div class="stack" style="gap: var(--sp-2);">
          <div class="row-between">
            <span class="fw-bold text-xs text-muted">PILIHAN JALUR CETAK:</span>
            <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-panduan-printer-modal-beli" style="padding: 2px 6px; display: inline-flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Atur Printer</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn ${isRawBtUtama ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-print-beli-rawbt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>
              <span>RawBT Android (${ukuran}mm)</span>
            </button>
            <button type="button" class="btn ${isRawBtUtama ? 'btn-secondary' : 'btn-primary'} btn-sm grow" id="btn-print-beli-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/></svg>
              <span>Bluetooth Direct</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-beli-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              <span>Cetak / Browser</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-share-beli-wa" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-tutup-modal-cetak-beli">Tutup</button>
      </div>
    `
  });

  modal.el.querySelector('#btn-print-beli-rawbt')?.addEventListener('click', () => {
    cetakRawBTPembelian(dataPembelian, ukuran);
  });

  modal.el.querySelector('#btn-print-beli-bt')?.addEventListener('click', () => {
    cetakBluetoothPembelian(dataPembelian, ukuran);
  });

  modal.el.querySelector('#btn-print-beli-browser')?.addEventListener('click', () => {
    cetakBrowserPembelian(dataPembelian, ukuran);
  });

  modal.el.querySelector('#btn-panduan-printer-modal-beli')?.addEventListener('click', () => {
    tampilkanModalKoneksiPrinter();
  });

  modal.el.querySelector('#btn-share-beli-wa')?.addEventListener('click', () => {
    const noHp = sup.hp || '';
    const urlWa = buatTautanWhatsAppPembelian(dataPembelian, noHp);
    window.open(urlWa, '_blank');
  });

  modal.el.querySelector('#btn-tutup-modal-cetak-beli')?.addEventListener('click', () => {
    modal.close();
  });
}

/**
 * Buat URL WhatsApp untuk kirim konfirmasi penerimaan barang/faktur pembelian ke supplier
 * @param {Object} dataPembelian
 * @param {string} [nomorHp='']
 * @returns {string}
 */
export function buatTautanWhatsAppPembelian(dataPembelian, nomorHp = '') {
  const pb = dataPembelian.pembelian || {};
  const sup = dataPembelian.supplier || {};
  const items = dataPembelian.items || [];
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const toko = dataPembelian.toko || store.get('toko') || { nama: namaFallback };

  let pesan = `*BUKTI PEMBELIAN & PENERIMAAN BARANG*\n`;
  pesan += `Toko: *${(toko.nama || namaFallback).toUpperCase()}*\n`;
  pesan += `No. Faktur: *${pb.no_faktur || '-'}*\n`;
  if (pb.no_faktur_supplier) pesan += `Ref Asli  : ${pb.no_faktur_supplier}\n`;
  pesan += `Tanggal   : ${formatTanggal(pb.tanggal, true)}\n`;
  pesan += `Supplier  : ${sup.nama || '-'}\n`;
  pesan += `--------------------------------\n`;

  items.forEach((it) => {
    pesan += `• ${it.nama} (${formatQty(it.qty)} ${it.satuan})\n`;
    pesan += `  @ ${formatRupiah(it.harga_beli)}`;
    if (Number(it.diskon_persen) > 0) pesan += ` (Disk ${formatQty(it.diskon_persen)}%)`;
    pesan += ` = ${formatRupiah(it.subtotal)}\n`;
  });

  pesan += `--------------------------------\n`;
  if (Number(pb.diskon_item) > 0) pesan += `Diskon Supplier: -${formatRupiah(pb.diskon_item)}\n`;
  if (Number(pb.diskon) > 0) pesan += `Diskon Faktur  : -${formatRupiah(pb.diskon)}\n`;
  if (Number(pb.ongkir) > 0) pesan += `Ongkos Kirim   : ${formatRupiah(pb.ongkir)}${pb.biaya_masuk_hutang === false ? ' (Bayar Terpisah → HPP)' : ''}\n`;
  if (Number(pb.biaya_bongkar) > 0) pesan += `Biaya Bongkar  : ${formatRupiah(pb.biaya_bongkar)}${pb.biaya_masuk_hutang === false ? ' (Bayar Terpisah → HPP)' : ''}\n`;
  pesan += `*TOTAL TAGIHAN : ${formatRupiah(pb.total)}*\n`;
  pesan += `Dibayar       : ${formatRupiah(pb.bayar || 0)}\n`;
  pesan += `Status Bayar  : ${String(pb.status_bayar || 'lunas').toUpperCase()}\n`;

  const sisa = Number(pb.total || 0) - Number(pb.bayar || 0);
  if (sisa > 0) {
    pesan += `Sisa Hutang   : ${formatRupiah(sisa)}\n`;
    if (pb.jatuh_tempo) pesan += `Jatuh Tempo   : ${formatTanggal(pb.jatuh_tempo)}\n`;
  }

  let hpBersih = String(nomorHp || '').replace(/[^0-9]/g, '');
  if (hpBersih.startsWith('0')) {
    hpBersih = '62' + hpBersih.substring(1);
  }

  const encoded = encodeURIComponent(pesan);
  return hpBersih ? `https://wa.me/${hpBersih}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/* ========================================================================== */
/* MODUL CETAK REKAPITULASI SHIFT KASIR (X-REPORT)                            */
/* ========================================================================== */

/**
 * Susun teks struk rekapitulasi kas shift kasir / X-Report (Thermal 58mm & 80mm)
 * @param {Object} data  { toko, kasir, tanggal, modal_awal, total_transaksi, total_penjualan, total_tunai, total_transfer, total_tempo, total_laci }
 * @param {'58'|'80'} [ukuran='58']
 * @returns {string}
 */
export function susunTeksXReport(data, ukuran = '58') {
  const lebar = LEBAR_KERTAS[ukuran] || 32;
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const toko = data.toko || store.get('toko') || {
    nama: namaFallback,
    alamat: store.get('pengaturan')?.toko_alamat || '',
    hp: store.get('pengaturan')?.toko_hp || ''
  };
  const kasir = data.kasir || { nama: 'Kasir' };
  const modalAwal = Number(data.modal_awal || 0);
  const totalTransaksi = Number(data.total_transaksi || 0);
  const totalTunai = Number(data.total_tunai || 0);
  const totalTransfer = Number(data.total_transfer || 0);
  const totalTempo = Number(data.total_tempo || 0);
  const totalPenjualan = Number(data.total_penjualan || 0);
  const totalPiutangTunai = Number(data.total_piutang_tunai || 0);
  const totalDepositTunai = Number(data.total_deposit_tunai || 0);
  const totalTarikDepositTunai = Number(data.total_tarik_deposit_tunai || 0);
  const totalRefundTunai = Number(data.total_refund_tunai || 0);
  const totalBiayaKasir = Number(data.total_biaya_kasir || 0);
  const totalLaci = Number(data.total_laci !== undefined ? data.total_laci : Math.max(0, modalAwal + totalTunai + totalPiutangTunai + totalDepositTunai - totalBiayaKasir - totalRefundTunai - totalTarikDepositTunai));

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
  baris.push(formatTengah('REKAP SHIFT KASIR (X-REPORT)', lebar));
  baris.push(buatGaris(lebar, '-'));

  // Info Petugas & Waktu
  baris.push(formatDuaKolom('Waktu Cetak', formatTanggal(new Date(), true), lebar));
  baris.push(formatDuaKolom('Petugas/Kasir', (kasir.nama || kasir.username || 'Kasir'), lebar));
  baris.push(formatDuaKolom('Tanggal Shift', data.tanggal || formatTanggal(new Date()).substring(0, 10), lebar));
  baris.push(buatGaris(lebar, '-'));

  // Rincian Kas & Transaksi
  baris.push(formatDuaKolom('Modal Awal Laci', formatRupiah(modalAwal), lebar));
  baris.push(formatDuaKolom('Total Transaksi', `${totalTransaksi} Nota`, lebar));
  baris.push(buatGaris(lebar, '.'));

  baris.push(formatDuaKolom('Penerimaan Tunai', formatRupiah(totalTunai), lebar));
  if (totalPiutangTunai > 0) {
    baris.push(formatDuaKolom('(+) Piutang Tunai', '+' + formatRupiah(totalPiutangTunai), lebar));
  }
  if (totalDepositTunai > 0) {
    baris.push(formatDuaKolom('(+) Titipan Tunai', '+' + formatRupiah(totalDepositTunai), lebar));
  }
  baris.push(formatDuaKolom('Non-Tunai (QRIS/Bank)', formatRupiah(totalTransfer), lebar));
  if (totalTempo > 0) {
    baris.push(formatDuaKolom('Piutang (Tempo Bon)', formatRupiah(totalTempo), lebar));
  }
  if (totalTarikDepositTunai > 0) {
    baris.push(formatDuaKolom('(-) Tarik Titipan', '-' + formatRupiah(totalTarikDepositTunai), lebar));
  }
  if (totalRefundTunai > 0) {
    baris.push(formatDuaKolom('(-) Refund Retur', '-' + formatRupiah(totalRefundTunai), lebar));
  }
  if (totalBiayaKasir > 0) {
    baris.push(buatGaris(lebar, '.'));
    baris.push(formatDuaKolom('(-) Kas Keluar Kasir', '-' + formatRupiah(totalBiayaKasir), lebar));
    if (Array.isArray(data.rincian_biaya_kasir)) {
      data.rincian_biaya_kasir.forEach((rb) => {
        const ket = rb.kategori + (rb.keterangan ? ' ' + rb.keterangan : '');
        baris.push(formatDuaKolom('  ' + ket.substring(0, Math.floor(lebar * 0.55)), '-' + formatRupiah(rb.nominal), lebar));
      });
    }
  }
  baris.push(buatGaris(lebar, '-'));
  baris.push(formatDuaKolom('TOTAL OMSET SHIFT', formatRupiah(totalPenjualan), lebar));
  baris.push(buatGaris(lebar, '='));

  // Saldo Akhir Uang Fisik di Laci
  baris.push(formatDuaKolom('UANG FISIK LACI', formatRupiah(totalLaci), lebar));
  baris.push(formatTengah(totalBiayaKasir > 0 ? '(Modal + Tunai - Kas Keluar)' : '(Modal Awal + Kas Tunai)', lebar));
  baris.push(buatGaris(lebar, '='));

  // Tanda Tangan Serah Terima
  baris.push('');
  baris.push(formatDuaKolom('   ( Kasir )', '( Supervisor )  ', lebar));
  baris.push('');
  baris.push('');
  baris.push(formatDuaKolom('   .........', '..............  ', lebar));
  baris.push(buatGaris(lebar, '-'));
  baris.push(formatTengah('POS KASIR TOKO BANGUNAN', lebar));

  return baris.join('\n');
}

/**
 * Cetak X-Report shift via aplikasi RawBT (Android)
 */
export async function cetakRawBTShift(dataReport, ukuran = '58') {
  if (!adalahPerangkatAndroid()) {
    showToast('RawBT khusus Android. Dialihkan ke dialog Cetak Browser komputer...', 'info', 3000);
    return cetakBrowserShift(dataReport, ukuran);
  }

  const teks = susunTeksXReport(dataReport, ukuran);
  const escposBytes = teksKeEscPos(teks);
  return kirimEscPosKeRawBT(escposBytes, 'rekap shift');
}

/**
 * Cetak X-Report shift via Web Bluetooth
 */
export async function cetakBluetoothShift(dataReport, ukuran = '58') {
  const teks = susunTeksXReport(dataReport, ukuran);
  const escposBytes = teksKeEscPos(teks);
  return await kirimBytesKeBluetooth(escposBytes);
}

/**
 * Cetak X-Report shift via browser print dialog
 */
export function cetakBrowserShift(dataReport, ukuran = '58') {
  const teks = susunTeksXReport(dataReport, ukuran);
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) {
    showToast('Popup diblokir browser. Izinkan popup untuk mencetak.', 'warning');
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Rekap Shift (X-Report)</title>
        <style>
          @page { size: ${ukuran === '80' ? '80mm' : '58mm'} auto; margin: 2mm; }
          body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.3; white-space: pre-wrap; padding: 4px; margin: 0; }
        </style>
      </head>
      <body>${escapeHtml(teks)}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 400);
}

/**
 * Dialog pilihan cetak struk rekap shift (RawBT / Bluetooth / Browser)
 * @param {Object} dataReport
 */
export function bukaModalPilihanCetakShift(dataReport) {
  const cfg = store.get('pengaturan') || {};
  const ukuran = cfg.printer_lebar === '80' ? '80' : '58';
  const teksStruk = susunTeksXReport(dataReport, ukuran);

  const modal = showModal({
    title: 'Cetak Rekap Shift (X-Report)',
    body: `
      <div class="stack" style="gap: var(--sp-4);">
        <div class="alert alert-info">
          ${ICONS.printer}
          <div>
            <strong>Rekap Shift Kasir Siap Dicetak</strong><br>
            Pilih jalur pencetakan yang sesuai dengan printer kasir Anda.
          </div>
        </div>

        <div>
          <label class="form-label text-xs fw-semibold">Pratinjau Struk X-Report (${ukuran}mm):</label>
          <pre class="struk-preview mono" style="background: var(--surface-2); padding: var(--sp-3); border-radius: var(--radius-md); font-size: 11px; line-height: 1.35; max-height: 240px; overflow-y: auto; border: 1px solid var(--border); white-space: pre-wrap; word-break: break-all;">${escapeHtml(teksStruk)}</pre>
        </div>

        <div class="stack" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-primary btn-sm" id="btn-print-shift-rawbt" style="width: 100%; justify-content: center; gap: 8px;">
            ${ICONS.printer}
            <span>Cetak via RawBT Printer (Android)</span>
          </button>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-shift-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth || ICONS.printer}
              <span>Web Bluetooth</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-shift-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
              <span>Browser / PDF</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-tutup-modal-cetak-shift">Tutup</button>
      </div>
    `
  });

  modal.el.querySelector('#btn-print-shift-rawbt')?.addEventListener('click', () => {
    cetakRawBTShift(dataReport, ukuran);
  });

  modal.el.querySelector('#btn-print-shift-bt')?.addEventListener('click', () => {
    cetakBluetoothShift(dataReport, ukuran);
  });

  modal.el.querySelector('#btn-print-shift-browser')?.addEventListener('click', () => {
    cetakBrowserShift(dataReport, ukuran);
  });

  modal.el.querySelector('#btn-tutup-modal-cetak-shift')?.addEventListener('click', () => {
    modal.close();
  });
}


/**
/**
 * printer.js — Utilitas Cetak Struk POS (Thermal ESC/POS 58mm & 80mm)
 * Mendukung 3 jalur cetak (README bagian 2 & 10):
 * 1. Web Bluetooth (Direct BLE thermal printer)
 * 2. RawBT (Aplikasi Android intent rawbt:data:base64)
 * 3. Browser Print (Fallback modal pratinjau thermal + window.print)
 * + Kirim Struk Digital via WhatsApp
 */

import { formatRupiah, formatQty, formatTanggal } from './format.js';
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
  const toko = data.toko || store.get('toko') || { nama: 'TOKO BANGUNAN', alamat: '', hp: '', nota_footer: '' };
  const kasir = data.kasir || { nama: 'Kasir' };
  const pelanggan = data.pelanggan || null;

  const baris = [];

  // Header Toko
  baris.push(formatTengah(toko.nama || 'TOKO BANGUNAN', lebar));
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
 * 2. Cetak via RawBT Android App
 * Membuka aplikasi RawBT melalui URI intent rawbt:data:base64
 * @param {Object} dataStruk
 * @param {'58'|'80'} [ukuran='58']
 */
export function cetakRawBT(dataStruk, ukuran = '58') {
  try {
    const teksStruk = susunTeksStruk(dataStruk, ukuran);
    const escposBytes = teksKeEscPos(teksStruk);

    // Convert bytes ke base64 string
    let binary = '';
    const len = escposBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(escposBytes[i]);
    }
    const base64Data = window.btoa(binary);

    const rawbtUri = `rawbt:data:base64,${base64Data}`;
    window.location.href = rawbtUri;

    showToast('Mengirim struk ke RawBT...', 'info', 2500);
    return true;
  } catch (err) {
    console.error('Gagal cetak RawBT:', err);
    showToast('Gagal memproses struk untuk RawBT: ' + err.message, 'error', 3500);
    return false;
  }
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
  const toko = dataStruk.toko || store.get('toko') || { nama: 'Toko Bangunan' };
  const items = dataStruk.items || [];

  let pesan = `*STRUK PENJUALAN - ${toko.nama || 'TOKO BANGUNAN'}*\n`;
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

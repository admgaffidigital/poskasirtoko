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
 * Format teks di tengah (center aligned) dengan word-wrap otomatis agar alamat/judul panjang tidak terpotong
 * @param {string} teks
 * @param {number} lebar
 * @returns {string}
 */
export function formatTengah(teks, lebar) {
  const t = String(teks || '').trim();
  if (!t) return '';

  const rataSatuBaris = (str) => {
    const s = str.trim();
    if (s.length >= lebar) return s.substring(0, lebar);
    const spasiKiri = Math.floor((lebar - s.length) / 2);
    const spasiKanan = lebar - s.length - spasiKiri;
    return ' '.repeat(spasiKiri) + s + ' '.repeat(spasiKanan);
  };

  if (t.length <= lebar) return rataSatuBaris(t);

  const kataList = t.split(/\s+/);
  const hasilBaris = [];
  let barisAktif = '';

  kataList.forEach((kata) => {
    if (!barisAktif) {
      if (kata.length <= lebar) {
        barisAktif = kata;
      } else {
        // Pecah kata yang lebih panjang dari lebar kertas
        let sisa = kata;
        while (sisa.length > lebar) {
          hasilBaris.push(rataSatuBaris(sisa.substring(0, lebar)));
          sisa = sisa.substring(lebar);
        }
        barisAktif = sisa;
      }
    } else if ((barisAktif.length + 1 + kata.length) <= lebar) {
      barisAktif += ' ' + kata;
    } else {
      hasilBaris.push(rataSatuBaris(barisAktif));
      if (kata.length <= lebar) {
        barisAktif = kata;
      } else {
        let sisa = kata;
        while (sisa.length > lebar) {
          hasilBaris.push(rataSatuBaris(sisa.substring(0, lebar)));
          sisa = sisa.substring(lebar);
        }
        barisAktif = sisa;
      }
    }
  });

  if (barisAktif) hasilBaris.push(rataSatuBaris(barisAktif));
  return hasilBaris.join('\n');
}

/**
 * Helper konsisten: hitung ringkasan pembayaran riil, cicilan piutang, sisa tagihan,
 * dan status retur agar Struk Thermal, Faktur A5, dan WhatsApp 100% sinkron & bebas korupsi bayar.
 */
function hitungRingkasanBayarDokumen(data) {
  const pj = data.penjualan || {};
  const pembayaran = Array.isArray(data.pembayaran) ? data.pembayaran : [];
  const piutang = data.piutang || null;
  const cicilan = Array.isArray(data.cicilan_piutang) ? data.cicilan_piutang : [];
  const total = Math.round(Number(pj.total || 0));
  const totalRetur = Math.min(total, Math.round(Number(data.total_retur || pj.total_retur || 0)));
  const totalBersih = Math.max(0, total - totalRetur);
  const statusRetur = data.status_retur || pj.status_retur || (totalRetur <= 0 ? '' : (total > 0 && totalRetur >= total ? 'penuh' : 'sebagian'));

  // Hitung pembayaran riil (tidak menghitung porsi tempo sebagai uang masuk)
  const nonTempoAwal = pembayaran
    .filter((b) => String(b.metode || '').toLowerCase() !== 'tempo')
    .reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  const totalCicilan = cicilan.reduce((s, c) => s + (Number(c.jumlah) || 0), 0);

  let bayarRiil = 0;
  let sisaTagihan = 0;
  let kembalian = Number(pj.kembalian || 0);
  let jatuhTempo = pj.jatuh_tempo || (piutang ? (piutang.jatuh_tempo || '') : '');

  if (statusRetur === 'penuh') {
    bayarRiil = 0;
    sisaTagihan = 0;
    kembalian = 0;
  } else if (piutang) {
    const dpAwal = Math.max(0, total - (Number(piutang.total) || 0));
    const terbayarPiutang = Number(piutang.terbayar || totalCicilan || 0);
    bayarRiil = Math.min(total, Math.round(dpAwal + terbayarPiutang));
    sisaTagihan = piutang.status === 'lunas' ? 0 : Math.max(0, Math.round(Number(piutang.sisa || 0)));
    kembalian = 0;
  } else if (data.sisa_tagihan !== undefined || pj.sisa_tagihan !== undefined) {
    sisaTagihan = Math.max(0, Math.round(Number(data.sisa_tagihan !== undefined ? data.sisa_tagihan : pj.sisa_tagihan)));
    bayarRiil = sisaTagihan > 0
      ? Math.max(0, total - sisaTagihan)
      : Math.round(Number(pj.bayar || nonTempoAwal || total));
    if (sisaTagihan > 0) kembalian = 0;
  } else {
    const adaTempo = pembayaran.some((b) => String(b.metode || '').toLowerCase() === 'tempo');
    if (adaTempo) {
      const porsiTempo = pembayaran
        .filter((b) => String(b.metode || '').toLowerCase() === 'tempo')
        .reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
      bayarRiil = Math.min(total, Math.round(nonTempoAwal + totalCicilan));
      sisaTagihan = Math.max(0, Math.round(porsiTempo - totalCicilan));
      kembalian = 0;
    } else {
      const rawBayar = Math.round(Number(pj.bayar || nonTempoAwal || 0));
      bayarRiil = (kembalian <= 0 && rawBayar > total && total > 0) ? total : rawBayar;
      sisaTagihan = 0;
    }
  }

  return {
    total,
    totalRetur,
    totalBersih,
    statusRetur,
    bayarRiil,
    kembalian,
    sisaTagihan,
    jatuhTempo,
    cicilan,
    pakaiDeposit: String(pj.metode_bayar || '').toLowerCase() === 'deposit' ||
      pembayaran.some((b) => String(b.metode || '').toLowerCase() === 'deposit')
  };
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

    // Status pengiriman / barang dibawa duluan vs dikirim menyusul
    if (pj.pengiriman === 'dikirim' && it.qty_dibawa !== undefined) {
      const qTot = Number(it.qty || 0);
      const qBawa = Math.min(qTot, Math.max(0, Number(it.qty_dibawa)));
      const sisaAntar = Math.round(Math.max(0, qTot - qBawa) * 1000) / 1000;
      if (sisaAntar <= 0) {
        baris.push('  [Sudah Dibawa Pembeli]');
      } else if (qBawa <= 0) {
        baris.push(`  [Dikirim Toko: ${formatQty(sisaAntar)} ${it.satuan || ''}]`);
      } else {
        baris.push(`  [Dibawa: ${formatQty(qBawa)}, Kirim: ${formatQty(sisaAntar)}]`);
      }
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

  const ringBayar = hitungRingkasanBayarDokumen(data);
  if (ringBayar.totalRetur > 0) {
    baris.push(formatDuaKolom('Retur Disetujui', '-' + formatRupiah(ringBayar.totalRetur), lebar));
    baris.push(formatDuaKolom('TOTAL BERSIH', formatRupiah(ringBayar.totalBersih), lebar));
  }
  baris.push(buatGaris(lebar, '-'));

  // Rincian Metode Bayar & Cicilan Piutang
  pembayaran.forEach((byr) => {
    const mLow = String(byr.metode || 'tunai').toLowerCase();
    const labelMetode = mLow === 'deposit' ? 'SALDO TITIPAN' : mLow.toUpperCase();
    const prefix = mLow === 'tempo' ? 'Tempo Awal' : `Bayar (${labelMetode})`;
    baris.push(formatDuaKolom(prefix, formatRupiah(byr.jumlah), lebar));
  });
  ringBayar.cicilan.forEach((c, idx) => {
    const mLow = String(c.metode || 'tunai').toLowerCase();
    baris.push(formatDuaKolom(`Cicilan ${idx + 1} (${mLow.toUpperCase()})`, formatRupiah(c.jumlah), lebar));
  });

  if (ringBayar.bayarRiil > 0 && (ringBayar.sisaTagihan > 0 || ringBayar.cicilan.length > 0)) {
    baris.push(formatDuaKolom('Total Dibayar', formatRupiah(ringBayar.bayarRiil), lebar));
  }
  if (ringBayar.sisaTagihan > 0) {
    baris.push(formatDuaKolom('SISA TAGIHAN', formatRupiah(ringBayar.sisaTagihan), lebar));
    if (ringBayar.jatuhTempo) {
      baris.push(formatDuaKolom('Jatuh Tempo', formatTanggal(ringBayar.jatuhTempo), lebar));
    }
  }
  if (ringBayar.kembalian > 0) {
    baris.push(formatDuaKolom('Kembalian', formatRupiah(ringBayar.kembalian), lebar));
  }

  // Sisa Saldo Titipan / Deposit jika transaksi menggunakan saldo deposit
  if (ringBayar.pakaiDeposit && pelanggan && pelanggan.saldo_deposit !== undefined) {
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
 * Hasilkan perintah biner ESC/POS untuk printer thermal 58mm & 80mm
 * Mendukung BOLD + Double Height nama toko, BOLD otomatis pada baris TOTAL/judul, auto-cut, & buka laci kasir (ESC p)
 * @param {string} teksStruk
 * @param {Object} [opsi={}] { bukaLaci?: boolean, autoCut?: boolean }
 * @returns {Uint8Array}
 */
export function teksKeEscPos(teksStruk, opsi = {}) {
  const bytes = [];

  // Inisialisasi printer: ESC @ (1B 40)
  bytes.push(0x1b, 0x40);

  // Set character code table ke PC437 (Standar)
  bytes.push(0x1b, 0x74, 0x00);

  // Buka laci kasir (Cash Drawer Kick: ESC p 0 25 250) jika diminta
  if (opsi && opsi.bukaLaci) {
    bytes.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }

  // Parse baris demi baris teks
  const baris = String(teksStruk || '').split('\n');
  let barisNamaTokoSudah = false;

  baris.forEach((line) => {
    const trimmed = line.trim();
    const isHeaderToko = !barisNamaTokoSudah && trimmed.length > 0;
    const isBarisTebal = !isHeaderToko && (
      /^(TOTAL|GRAND TOTAL|TOTAL TAGIHAN|TOTAL OMSET|UANG FISIK LACI)\b/i.test(trimmed) ||
      /^(REKAP SHIFT|LAPORAN TUTUP SHIFT|SURAT JALAN BARANG|FAKTUR PEMBELIAN|REKONSILIASI FISIK LACI)/i.test(trimmed)
    );

    if (isHeaderToko) {
      barisNamaTokoSudah = true;
      // Bold + Double Height agar nama toko tajam & gagah tanpa meluber lebar kolom
      bytes.push(0x1b, 0x21, 0x18);
      bytes.push(0x1b, 0x45, 0x01);
    } else if (isBarisTebal) {
      bytes.push(0x1b, 0x21, 0x08);
      bytes.push(0x1b, 0x45, 0x01);
    } else {
      bytes.push(0x1b, 0x21, 0x00);
      bytes.push(0x1b, 0x45, 0x00);
    }

    // Encode string ke ASCII bytes
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      bytes.push(code > 127 ? 63 : code); // replace non-ASCII dengan '?'
    }
    // Line Feed (0A)
    bytes.push(0x0a);
  });

  // Reset style normal
  bytes.push(0x1b, 0x21, 0x00, 0x1b, 0x45, 0x00);

  // Feed 4 baris & Partial Cut paper: GS V 66 0 (1D 56 42 00) — kompatibel luas Epson/Xprinter/Eppos/Panda/POS-80
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a);
  if (opsi.autoCut !== false) {
    bytes.push(0x1d, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(bytes);
}

/** Cache perangkat printer Web Bluetooth yang sedang terhubung */
let bluetoothDevice = null;
let bluetoothCharacteristic = null;

/** Cache port printer Web Serial (USB / Bluetooth COM Desktop) */
let serialPortAktif = null;

/** Cache perangkat printer WebUSB (Direct USB ESC/POS Desktop) */
let webUsbDeviceAktif = null;
let webUsbEndpointOut = null;

const KEY_KALIBRASI_THERMAL = 'pos_thermal_web_cal_v1';

/**
 * Ambil pengaturan kalibrasi cetak thermal web & Direct USB Desktop untuk perangkat ini
 */
export function ambilKalibrasiThermal() {
  const def = {
    lebar58Mm: 48,   // Area cetak riil kertas 58mm (head thermal 48mm)
    lebar80Mm: 72,   // Area cetak riil kertas 80mm (head thermal 72mm)
    ukuranFont: 'normal', // 'kecil' | 'normal' | 'besar'
    feedBawahMm: 10, // Ruang aman potong/sobek kertas di bawah struk
    baudRate: 9600,
    usbBridgeUrl: 'http://127.0.0.1:9199',
    usbPrinterName: '',
    usbMode: 'bridge', // 'bridge' | 'webusb' | 'serial'
    bukaLaciOtomatis: false
  };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_KALIBRASI_THERMAL) : null;
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return {
      lebar58Mm: Number(parsed.lebar58Mm) || def.lebar58Mm,
      lebar80Mm: Number(parsed.lebar80Mm) || def.lebar80Mm,
      ukuranFont: ['kecil', 'normal', 'besar'].includes(parsed.ukuranFont) ? parsed.ukuranFont : def.ukuranFont,
      feedBawahMm: Number.isFinite(Number(parsed.feedBawahMm)) ? Number(parsed.feedBawahMm) : def.feedBawahMm,
      baudRate: Number(parsed.baudRate) || def.baudRate,
      usbBridgeUrl: String(parsed.usbBridgeUrl || def.usbBridgeUrl).replace(/\/+$/, ''),
      usbPrinterName: String(parsed.usbPrinterName || ''),
      usbMode: ['bridge', 'webusb', 'serial'].includes(parsed.usbMode) ? parsed.usbMode : def.usbMode,
      bukaLaciOtomatis: Boolean(parsed.bukaLaciOtomatis)
    };
  } catch (_) {
    return def;
  }
}

/**
 * Simpan pengaturan kalibrasi cetak thermal web & Direct USB Desktop untuk perangkat ini
 */
export function simpanKalibrasiThermal(patch) {
  const cur = ambilKalibrasiThermal();
  const next = { ...cur, ...(patch || {}) };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY_KALIBRASI_THERMAL, JSON.stringify(next));
    }
  } catch (_) { }
  return next;
}

/** Konversi Uint8Array ke Base64 secara aman */
function bytesKeBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Cek dukungan Web Serial API (Chrome/Edge Desktop) */
export function dukungWebSerial() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** Cek dukungan WebUSB API (Chrome/Edge Desktop) */
export function dukungWebUsb() {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/**
 * Cek status POS USB Bridge Windows lokal (http://127.0.0.1:9199/status)
 * @returns {Promise<{aktif: boolean, printers: string[], default_printer: string, url: string}>}
 */
export async function cekStatusUsbBridge(timeoutMs = 1400) {
  const cal = ambilKalibrasiThermal();
  const url = cal.usbBridgeUrl || 'http://127.0.0.1:9199';
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${url}/status`, {
      method: 'GET',
      mode: 'cors',
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return { aktif: false, printers: [], default_printer: '', url };
    const data = await res.json();
    return {
      aktif: Boolean(data && data.ok),
      printers: Array.isArray(data?.printers) ? data.printers : [],
      default_printer: String(data?.default_printer || ''),
      url
    };
  } catch (_) {
    if (timer) clearTimeout(timer);
    return { aktif: false, printers: [], default_printer: '', url };
  }
}

/**
 * Kirim bytes RAW ESC/POS ke POS USB Bridge Windows lokal (winspool.drv RAW mode)
 * 100% kompatibel semua printer thermal USB Windows tanpa perlu ganti driver.
 */
export async function kirimEscPosKeUsbBridge(escposBytes, namaPrinter = '', docName = 'POS Kasir ESC/POS') {
  const cal = ambilKalibrasiThermal();
  const url = cal.usbBridgeUrl || 'http://127.0.0.1:9199';
  const targetPrinter = namaPrinter || cal.usbPrinterName || '';
  const res = await fetch(`${url}/print`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      printer: targetPrinter,
      doc_name: docName,
      data_base64: bytesKeBase64(escposBytes)
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Kirim bytes RAW ESC/POS langsung lewat WebUSB API (Chrome/Edge Desktop)
 * Cocok untuk printer thermal USB mode WinUSB / Linux / macOS.
 */
export async function kirimEscPosKeWebUsb(escposBytes) {
  if (!dukungWebUsb()) {
    showToast('WebUSB hanya didukung di Chrome / Edge Desktop.', 'warning', 4000);
    return false;
  }
  try {
    if (!webUsbDeviceAktif || !webUsbDeviceAktif.opened) {
      showToast('Pilih printer thermal USB pada dialog perangkat browser...', 'info', 3000);
      webUsbDeviceAktif = await navigator.usb.requestDevice({
        filters: [{ classCode: 7 }, { classCode: 255 }]
      });
      await webUsbDeviceAktif.open();
      if (webUsbDeviceAktif.configuration === null) {
        await webUsbDeviceAktif.selectConfiguration(1);
      }
      let claimed = false;
      let epOut = null;
      for (const iface of webUsbDeviceAktif.configuration.interfaces) {
        for (const alt of iface.alternates) {
          const outEp = (alt.endpoints || []).find((ep) => ep.direction === 'out' && ep.type === 'bulk');
          if (outEp) {
            await webUsbDeviceAktif.claimInterface(iface.interfaceNumber);
            if (alt.alternateSetting !== 0) {
              await webUsbDeviceAktif.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting);
            }
            epOut = outEp.endpointNumber;
            claimed = true;
            break;
          }
        }
        if (claimed) break;
      }
      if (!claimed || epOut === null) {
        throw new Error('Endpoint cetak USB (Bulk OUT) tidak ditemukan pada perangkat ini.');
      }
      webUsbEndpointOut = epOut;
    }

    const CHUNK = 512;
    for (let i = 0; i < escposBytes.length; i += CHUNK) {
      await webUsbDeviceAktif.transferOut(webUsbEndpointOut, escposBytes.slice(i, i + CHUNK));
    }
    showToast(`Struk terkirim langsung ke USB (${webUsbDeviceAktif.productName || 'POS USB'}).`, 'success');
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') return false;
    webUsbDeviceAktif = null;
    webUsbEndpointOut = null;
    const msg = String(err?.message || err || '');
    if (/access denied|claim|protected/i.test(msg)) {
      showToast('Driver Windows sedang memakai port USB. Gunakan POS USB Bridge Windows agar tidak perlu ganti driver!', 'warning', 6000);
    } else {
      showToast('Gagal cetak WebUSB: ' + msg, 'error', 4500);
    }
    return false;
  }
}

/**
 * Router pintar cetak Direct ESC/POS USB dari Desktop:
 * 1) Mode Bridge Windows (paling stabil & 1-klik tanpa ganti driver)
 * 2) Mode WebUSB (navigator.usb)
 * 3) Mode Web Serial COM (navigator.serial)
 */
export async function cetakDirectUsbDesktop(escposBytes, labelDokumen = 'struk') {
  const cal = ambilKalibrasiThermal();

  if (cal.usbMode === 'webusb') {
    return await kirimEscPosKeWebUsb(escposBytes);
  }
  if (cal.usbMode === 'serial') {
    return await kirimEscPosKeSerial(escposBytes);
  }

  // Default: POS USB Bridge Windows (http://127.0.0.1:9199)
  try {
    const res = await kirimEscPosKeUsbBridge(escposBytes, cal.usbPrinterName, `POS Kasir - ${labelDokumen}`);
    showToast(`Cetak ESC/POS OK → ${res.printer || 'Printer USB'}`, 'success', 2500);
    return true;
  } catch (err) {
    // Jika bridge belum berjalan, cek apakah user sudah punya koneksi WebUSB/Serial aktif
    if (webUsbDeviceAktif && webUsbDeviceAktif.opened) {
      return await kirimEscPosKeWebUsb(escposBytes);
    }
    if (serialPortAktif && serialPortAktif.writable) {
      return await kirimEscPosKeSerial(escposBytes);
    }
    showToast('POS USB Bridge Windows belum aktif. Membuka pengaturan & unduh Bridge 1-klik...', 'warning', 4500);
    tampilkanModalKoneksiPrinter();
    return false;
  }
}

/**
 * Kirim sinyal buka laci kasir (Cash Drawer Kick: ESC p 0 25 250) ke printer thermal USB Desktop
 */
export async function bukaLaciKasirUsb() {
  const bytes = new Uint8Array([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
  return await cetakDirectUsbDesktop(bytes, 'Buka Laci Kasir');
}

/** Cetak Struk Penjualan langsung ke Printer POS USB Desktop (Direct ESC/POS) */
export async function cetakUsbDirect(dataStruk, ukuran = '58') {
  const cal = ambilKalibrasiThermal();
  const pj = dataStruk?.penjualan || {};
  const isTunai = String(pj.metode_bayar || 'tunai').toLowerCase() === 'tunai' || (Array.isArray(dataStruk?.pembayaran) && dataStruk.pembayaran.some((b) => String(b.metode || '').toLowerCase() === 'tunai'));
  const teksStruk = susunTeksStruk(dataStruk, ukuran);
  const bytes = teksKeEscPos(teksStruk, { bukaLaci: cal.bukaLaciOtomatis && isTunai });
  return await cetakDirectUsbDesktop(bytes, pj.no_nota || 'Nota Penjualan');
}

/** Cetak Faktur Pembelian langsung ke Printer POS USB Desktop (Direct ESC/POS) */
export async function cetakUsbDirectPembelian(dataPembelian, ukuran = '58') {
  const teksStruk = susunTeksStrukPembelian(dataPembelian, ukuran);
  const bytes = teksKeEscPos(teksStruk);
  return await cetakDirectUsbDesktop(bytes, dataPembelian?.pembelian?.no_faktur || 'Faktur Pembelian');
}

/** Cetak Rekap Shift (X/Z-Report) langsung ke Printer POS USB Desktop (Direct ESC/POS) */
export async function cetakUsbDirectShift(dataReport, ukuran = '58') {
  const teksStruk = susunTeksXReport(dataReport, ukuran);
  const bytes = teksKeEscPos(teksStruk);
  return await cetakDirectUsbDesktop(bytes, dataReport?.no_shift || 'Rekap Shift');
}

/** Cetak Surat Jalan langsung ke Printer POS USB Desktop (Direct ESC/POS) */
export async function cetakUsbDirectSuratJalan(dataStruk, ukuran = '58', opsi = {}) {
  const teksStruk = susunTeksSuratJalan(dataStruk, ukuran, opsi);
  const bytes = teksKeEscPos(teksStruk);
  return await cetakDirectUsbDesktop(bytes, dataStruk?.penjualan?.no_nota || 'Surat Jalan');
}

/**
 * Kirim buffer biner ESC/POS langsung ke printer thermal USB/COM (Web Serial API)
 * Hasil 100% tajam native hardware, panjang eksak, auto-cut aktif, tanpa dialog Chrome.
 * @param {Uint8Array} escposBytes
 * @returns {Promise<boolean>}
 */
export async function kirimEscPosKeSerial(escposBytes) {
  if (!dukungWebSerial()) {
    showToast('Direct USB Serial hanya didukung di Chrome / Edge Desktop.', 'warning', 4000);
    return false;
  }
  const cal = ambilKalibrasiThermal();
  try {
    if (!serialPortAktif) {
      showToast('Pilih port USB/COM printer thermal pada dialog browser...', 'info', 3000);
      serialPortAktif = await navigator.serial.requestPort();
    }
    if (!serialPortAktif.readable && !serialPortAktif.writable) {
      await serialPortAktif.open({ baudRate: cal.baudRate || 9600 });
    }
    const writer = serialPortAktif.writable.getWriter();
    try {
      const CHUNK = 256;
      for (let i = 0; i < escposBytes.length; i += CHUNK) {
        await writer.write(escposBytes.slice(i, i + CHUNK));
      }
    } finally {
      writer.releaseLock();
    }
    showToast('Struk berhasil dikirim langsung ke printer USB/Serial (ESC/POS).', 'success');
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') {
      return false;
    }
    // Reset port jika terputus agar pemilihan berikutnya bersih
    try {
      if (serialPortAktif) await serialPortAktif.close();
    } catch (_) { }
    serialPortAktif = null;
    showToast('Gagal kirim ke printer USB Serial: ' + (err?.message || 'Port sibuk/terputus'), 'error', 4500);
    return false;
  }
}

/**
 * Susun CSS khusus cetak thermal 203 DPI hitam pekat (#000) & tajam anti-buram
 */
function buatCssThermal203Dpi(ukuran = '58', kalibrasi = null, tinggiPageMm = null) {
  const cal = kalibrasi || ambilKalibrasiThermal();
  const is80 = String(ukuran) === '80';
  const lebarKertasMm = is80 ? 80 : 58;
  const lebarCetakMm = is80 ? cal.lebar80Mm : cal.lebar58Mm;
  const fontMap = {
    kecil: is80 ? 9.2 : 8.2,
    normal: is80 ? 10.2 : 9.2,
    besar: is80 ? 11.2 : 10.0
  };
  const basePt = fontMap[cal.ukuranFont] || fontMap.normal;
  const headPt = Number((basePt + 2.0).toFixed(1));
  const subPt = Number(Math.max(7.4, basePt - 1.0).toFixed(1));
  const totalPt = Number((basePt + 1.4).toFixed(1));
  const feedMm = Math.max(2, Number(cal.feedBawahMm ?? 10));

  const pageRule = tinggiPageMm
    ? `@page { size: ${lebarKertasMm}mm ${tinggiPageMm}mm; margin: 0; }`
    : `@page { size: ${lebarKertasMm}mm auto; margin: 0; }`;

  return `
    ${pageRule}
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      width: ${lebarCetakMm}mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
    }
    body {
      font-family: 'Segoe UI', 'Roboto', 'Arial', 'Helvetica Neue', sans-serif;
      font-size: ${basePt}pt;
      font-weight: 600;
      line-height: 1.32;
      padding: 1.5mm 0.8mm ${feedMm}mm 0.8mm;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .rcpt-root { width: 100%; }
    .rcpt-center { text-align: center; }
    .rcpt-toko { font-size: ${headPt}pt; font-weight: 800; letter-spacing: 0.2px; line-height: 1.2; text-transform: uppercase; }
    .rcpt-sub { font-size: ${subPt}pt; font-weight: 600; line-height: 1.28; margin-top: 1px; }
    .rcpt-title { font-size: ${basePt}pt; font-weight: 800; text-align: center; letter-spacing: 0.3px; margin: 2px 0; text-transform: uppercase; }
    .rcpt-hr-solid { border: 0; border-top: 1.5px solid #000000; margin: 4px 0; }
    .rcpt-hr-dash { border: 0; border-top: 1px dashed #000000; margin: 4px 0; }
    .rcpt-hr-dot { border: 0; border-top: 1px dotted #000000; margin: 3px 0; }
    .rcpt-row { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; margin: 1.5px 0; }
    .rcpt-row-label { flex: 1 1 auto; min-width: 0; }
    .rcpt-row-val { flex: 0 0 auto; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    .rcpt-meta { font-size: ${subPt}pt; }
    .rcpt-meta .rcpt-row-label { font-weight: 600; }
    .rcpt-meta .rcpt-row-val { font-weight: 700; white-space: normal; text-align: right; max-width: 64%; }
    .rcpt-item { margin: 3.5px 0; }
    .rcpt-item-nama { font-weight: 700; line-height: 1.25; }
    .rcpt-item-detail { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; padding-left: 6px; font-size: ${subPt}pt; }
    .rcpt-item-qty { font-variant-numeric: tabular-nums; font-weight: 600; }
    .rcpt-item-sub { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
    .rcpt-item-tag { padding-left: 6px; font-size: ${subPt}pt; font-weight: 700; }
    .rcpt-total-row { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; font-size: ${totalPt}pt; font-weight: 800; margin: 3px 0; }
    .rcpt-total-row .rcpt-row-val { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .rcpt-footer { text-align: center; font-size: ${subPt}pt; font-weight: 600; line-height: 1.3; margin-top: 4px; white-space: pre-line; }
    .rcpt-note { font-size: ${subPt}pt; font-weight: 600; margin: 3px 0; }
    .rcpt-ttd { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; text-align: center; font-size: ${subPt}pt; font-weight: 700; }
    .rcpt-ttd-col { flex: 1; }
    .rcpt-ttd-sp { height: 26px; }
    .rcpt-ttd-ln { border-top: 1px dashed #000000; padding-top: 2px; }
  `;
}

/** Bungkus isi struk HTML menjadi dokumen cetak thermal lengkap */
function bungkusDokumenThermalHtml(judul, bodyHtml, ukuran = '58', kalibrasi = null, tinggiPageMm = null) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(judul || 'Struk Thermal')}</title>
  <style>${buatCssThermal203Dpi(ukuran, kalibrasi, tinggiPageMm)}</style>
</head>
<body>
  <div class="rcpt-root">${bodyHtml}</div>
</body>
</html>`;
}

/**
 * Cetak dokumen thermal HTML ke printer browser dengan pengukuran tinggi halaman EXACT (mm)
 * sehingga panjang kertas berhenti presisi di akhir struk (tidak keluar kertas kosong panjang).
 */
function cetakHtmlThermalAutoHeight(judul, bodyHtml, ukuran = '58', kalibrasi = null) {
  const cal = kalibrasi || ambilKalibrasiThermal();
  const is80 = String(ukuran) === '80';
  const lebarKertasMm = is80 ? 80 : 58;
  const lebarCetakMm = is80 ? cal.lebar80Mm : cal.lebar58Mm;

  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.left = '-9999px';
  printFrame.style.top = '0';
  printFrame.style.width = `${lebarCetakMm}mm`;
  printFrame.style.height = '1000mm';
  printFrame.style.border = '0';
  printFrame.style.visibility = 'hidden';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(bungkusDokumenThermalHtml(judul, bodyHtml, ukuran, cal, null));
  doc.close();

  setTimeout(() => {
    try {
      const rootEl = doc.querySelector('.rcpt-root') || doc.body;
      const bodyStyle = printFrame.contentWindow.getComputedStyle(doc.body);
      const padTop = parseFloat(bodyStyle.paddingTop) || 0;
      const padBottom = parseFloat(bodyStyle.paddingBottom) || 0;
      const kontenPx = Math.ceil((rootEl.getBoundingClientRect().height || rootEl.scrollHeight || 200) + padTop + padBottom);
      // Konversi presisi CSS px (96 dpi) ke mm (25.4 mm/inch) + margin pengaman 2mm
      const tinggiExactMm = Math.max(45, Math.ceil((kontenPx * 25.4) / 96) + 2);

      // Suntikkan @page size exact (lebar x tinggi mm) agar Chrome/Edge memotong kertas pas di akhir struk
      const styleExact = doc.createElement('style');
      styleExact.textContent = `@page { size: ${lebarKertasMm}mm ${tinggiExactMm}mm; margin: 0; }`;
      doc.head.appendChild(styleExact);
    } catch (_) { }

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => {
        if (printFrame.parentElement) printFrame.remove();
      }, 1500);
    }, 80);
  }, 180);
}

/** Susun HTML thermal 203 DPI untuk Struk Penjualan */
function buatHtmlThermalPenjualan(data) {
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pembayaran = data.pembayaran || [];
  const toko = ambilInfoTokoDokumen(data);
  const kasir = data.kasir || { nama: pj.kasir_nama || 'Kasir' };
  const pelanggan = data.pelanggan || null;

  const ringBayar = hitungRingkasanBayarDokumen(data);
  const bayarHtml = [
    ...pembayaran.map((byr) => {
      const mLow = String(byr.metode || 'tunai').toLowerCase();
      const labelMetode = mLow === 'deposit' ? 'SALDO TITIPAN' : mLow.toUpperCase();
      const judul = mLow === 'tempo' ? 'Tempo Awal' : `Bayar (${labelMetode})`;
      return `<div class="rcpt-row"><span class="rcpt-row-label">${escapeHtml(judul)}</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(byr.jumlah))}</span></div>`;
    }),
    ...ringBayar.cicilan.map((c, idx) => {
      const mLow = String(c.metode || 'tunai').toLowerCase();
      return `<div class="rcpt-row"><span class="rcpt-row-label">Cicilan ${idx + 1} (${escapeHtml(mLow.toUpperCase())})</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(c.jumlah))}</span></div>`;
    })
  ].join('');

  const itemsHtml = items.map((it) => {
    let namaLengkap = it.nama || 'Barang';
    if (it.satuan) namaLengkap += ` (${it.satuan})`;
    const diskonHtml = Number(it.diskon || 0) > 0
      ? `<div class="rcpt-item-detail"><span>${it.diskon_tipe === 'persen' ? `(Diskon ${it.diskon_nilai}%)` : '(Potongan)'}</span><span class="rcpt-item-sub">-${escapeHtml(formatRupiah(it.diskon))}</span></div>`
      : '';
    let tagKirim = '';
    if (pj.pengiriman === 'dikirim' && it.qty_dibawa !== undefined) {
      const qTot = Number(it.qty || 0);
      const qBawa = Math.min(qTot, Math.max(0, Number(it.qty_dibawa)));
      const sisa = Math.round(Math.max(0, qTot - qBawa) * 1000) / 1000;
      if (sisa <= 0) tagKirim = `<div class="rcpt-item-tag">[Sudah Dibawa Pembeli]</div>`;
      else if (qBawa <= 0) tagKirim = `<div class="rcpt-item-tag">[Dikirim Toko: ${escapeHtml(formatQty(sisa))} ${escapeHtml(it.satuan || '')}]</div>`;
      else tagKirim = `<div class="rcpt-item-tag">[Dibawa: ${escapeHtml(formatQty(qBawa))}, Kirim: ${escapeHtml(formatQty(sisa))}]</div>`;
    }
    return `
      <div class="rcpt-item">
        <div class="rcpt-item-nama">${escapeHtml(namaLengkap)}</div>
        <div class="rcpt-item-detail">
          <span class="rcpt-item-qty">${escapeHtml(formatQty(it.qty))} x ${escapeHtml(formatRupiah(it.harga, false))}</span>
          <span class="rcpt-item-sub">${escapeHtml(formatRupiah(it.subtotal))}</span>
        </div>
        ${diskonHtml}
        ${tagKirim}
      </div>
    `;
  }).join('');

  const footerText = toko.nota_footer || 'Terima kasih atas kunjungan Anda.\nBarang yang sudah dibeli dapat diretur sesuai ketentuan.';

  return `
    <div class="rcpt-center">
      <div class="rcpt-toko">${escapeHtml(toko.nama || 'TOKO')}</div>
      ${toko.alamat ? `<div class="rcpt-sub">${escapeHtml(toko.alamat)}</div>` : ''}
      ${toko.hp ? `<div class="rcpt-sub">Telp/WA: ${escapeHtml(toko.hp)}</div>` : ''}
    </div>
    <hr class="rcpt-hr-solid">
    <div class="rcpt-meta">
      <div class="rcpt-row"><span class="rcpt-row-label">No. Nota</span><span class="rcpt-row-val">${escapeHtml(pj.no_nota || '-')}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Tanggal</span><span class="rcpt-row-val">${escapeHtml(formatTanggal(pj.tanggal, true))}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Kasir</span><span class="rcpt-row-val">${escapeHtml(kasir.nama || 'Kasir')}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Pelanggan</span><span class="rcpt-row-val">${escapeHtml(pelanggan ? pelanggan.nama : (pj.pelanggan_nama || 'Umum'))}</span></div>
      ${pj.pengiriman === 'dikirim' ? `<div class="rcpt-row"><span class="rcpt-row-label">Pengiriman</span><span class="rcpt-row-val">Dikirim Toko</span></div>` : ''}
      ${pj.pengiriman === 'dikirim' && pj.alamat_kirim ? `<div class="rcpt-note">Alamat: ${escapeHtml(pj.alamat_kirim)}</div>` : ''}
    </div>
    <hr class="rcpt-hr-dash">
    ${itemsHtml}
    <hr class="rcpt-hr-dash">
    <div class="rcpt-row"><span class="rcpt-row-label">Subtotal</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pj.subtotal))}</span></div>
    ${Number(pj.diskon || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">${pj.diskon_tipe === 'persen' ? `Diskon (${pj.diskon_nilai}%)` : 'Diskon'}</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(pj.diskon))}</span></div>` : ''}
    ${Number(pj.pajak || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">PPN</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pj.pajak))}</span></div>` : ''}
    ${Number(pj.ongkir || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Ongkos Kirim</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pj.ongkir))}</span></div>` : ''}
    ${Number(pj.pembulatan || 0) !== 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Pembulatan</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pj.pembulatan))}</span></div>` : ''}
    <hr class="rcpt-hr-solid">
    <div class="rcpt-total-row"><span>TOTAL</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pj.total))}</span></div>
    ${ringBayar.totalRetur > 0 ? `
      <div class="rcpt-row"><span class="rcpt-row-label">Retur Disetujui</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(ringBayar.totalRetur))}</span></div>
      <div class="rcpt-total-row"><span>TOTAL BERSIH</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(ringBayar.totalBersih))}</span></div>
    ` : ''}
    <hr class="rcpt-hr-dash">
    ${bayarHtml}
    ${ringBayar.bayarRiil > 0 && (ringBayar.sisaTagihan > 0 || ringBayar.cicilan.length > 0) ? `<div class="rcpt-row"><span class="rcpt-row-label">Total Dibayar</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(ringBayar.bayarRiil))}</span></div>` : ''}
    ${ringBayar.sisaTagihan > 0 ? `
      <div class="rcpt-total-row"><span>SISA TAGIHAN</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(ringBayar.sisaTagihan))}</span></div>
      ${ringBayar.jatuhTempo ? `<div class="rcpt-row"><span class="rcpt-row-label">Jatuh Tempo</span><span class="rcpt-row-val">${escapeHtml(formatTanggal(ringBayar.jatuhTempo))}</span></div>` : ''}
    ` : ''}
    ${ringBayar.kembalian > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Kembalian</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(ringBayar.kembalian))}</span></div>` : ''}
    ${ringBayar.pakaiDeposit && pelanggan && pelanggan.saldo_deposit !== undefined ? `<div class="rcpt-row"><span class="rcpt-row-label">Sisa Saldo Titipan</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pelanggan.saldo_deposit))}</span></div>` : ''}
    ${Number(pj.poin_didapat || 0) > 0 && pelanggan ? `
      <hr class="rcpt-hr-dot">
      <div class="rcpt-row"><span class="rcpt-row-label">Poin Didapat</span><span class="rcpt-row-val">+${escapeHtml(String(pj.poin_didapat))} Poin</span></div>
      ${pelanggan.poin !== undefined ? `<div class="rcpt-row"><span class="rcpt-row-label">Total Saldo Poin</span><span class="rcpt-row-val">${escapeHtml(String(pelanggan.poin))} Poin</span></div>` : ''}
    ` : ''}
    <hr class="rcpt-hr-solid">
    <div class="rcpt-footer">${escapeHtml(footerText)}</div>
  `;
}

/** Susun HTML thermal 203 DPI untuk Faktur Pembelian */
function buatHtmlThermalPembelian(data) {
  const pb = data.pembelian || {};
  const items = data.items || [];
  const sup = data.supplier || { nama: 'Supplier Umum' };
  const hutang = data.hutang || null;
  const toko = ambilInfoTokoDokumen(data);
  const petugas = data.petugas || store.get('user') || { nama: 'Petugas' };
  const sisaHutang = hutang ? hutang.sisa : Math.max(0, Number(pb.total || 0) - Number(pb.bayar || 0));
  const jatuhTempoTgl = pb.jatuh_tempo || (hutang ? hutang.jatuh_tempo : '');

  const itemsHtml = items.map((it) => {
    let namaBarang = it.nama || 'Barang';
    if (it.satuan) namaBarang += ` (${it.satuan})`;
    const adaDiskon = Number(it.diskon_persen) > 0 || Number(it.diskon_item) > 0;
    const diskonRp = Number(it.diskon_item) || Math.round(Number(it.qty || 0) * Number(it.harga_beli || 0) * (Number(it.diskon_persen || 0) / 100));
    return `
      <div class="rcpt-item">
        <div class="rcpt-item-nama">${escapeHtml(namaBarang)}</div>
        <div class="rcpt-item-detail">
          <span class="rcpt-item-qty">${escapeHtml(formatQty(it.qty))} x ${escapeHtml(formatRupiah(it.harga_beli, false))}</span>
          <span class="rcpt-item-sub">${escapeHtml(formatRupiah(it.subtotal))}</span>
        </div>
        ${adaDiskon ? `<div class="rcpt-item-detail"><span>${Number(it.diskon_persen) > 0 ? `(Disk ${formatQty(it.diskon_persen)}%)` : '(Potongan)'}</span><span class="rcpt-item-sub">-${escapeHtml(formatRupiah(diskonRp))}</span></div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="rcpt-center">
      <div class="rcpt-toko">${escapeHtml(toko.nama || 'TOKO')}</div>
      ${toko.alamat ? `<div class="rcpt-sub">${escapeHtml(toko.alamat)}</div>` : ''}
      ${toko.hp ? `<div class="rcpt-sub">Telp/WA: ${escapeHtml(toko.hp)}</div>` : ''}
    </div>
    <hr class="rcpt-hr-solid">
    <div class="rcpt-title">FAKTUR PEMBELIAN / BARANG MASUK</div>
    <hr class="rcpt-hr-dash">
    <div class="rcpt-meta">
      <div class="rcpt-row"><span class="rcpt-row-label">No. Faktur</span><span class="rcpt-row-val">${escapeHtml(pb.no_faktur || '-')}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Tanggal</span><span class="rcpt-row-val">${escapeHtml(formatTanggal(pb.tanggal, true))}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Supplier</span><span class="rcpt-row-val">${escapeHtml(sup.nama || '-')}</span></div>
      ${pb.no_faktur_supplier ? `<div class="rcpt-row"><span class="rcpt-row-label">Ref Asli</span><span class="rcpt-row-val">${escapeHtml(pb.no_faktur_supplier)}</span></div>` : ''}
      <div class="rcpt-row"><span class="rcpt-row-label">Petugas</span><span class="rcpt-row-val">${escapeHtml(petugas.nama || 'Petugas')}</span></div>
    </div>
    <hr class="rcpt-hr-dash">
    ${itemsHtml}
    <hr class="rcpt-hr-dash">
    <div class="rcpt-row"><span class="rcpt-row-label">Subtotal Kotor</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pb.subtotal))}</span></div>
    ${Number(pb.diskon_item || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Diskon Supplier</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(pb.diskon_item))}</span></div>` : ''}
    ${Number(pb.diskon || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Diskon Faktur</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(pb.diskon))}</span></div>` : ''}
    ${Number(pb.ongkir || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">${pb.biaya_masuk_hutang === false ? 'Ongkir (Terpisah)' : 'Ongkos Kirim'}</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pb.ongkir))}</span></div>` : ''}
    ${Number(pb.biaya_bongkar || 0) > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">${pb.biaya_masuk_hutang === false ? 'Bongkar (Terpisah)' : 'Biaya Bongkar'}</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pb.biaya_bongkar))}</span></div>` : ''}
    <hr class="rcpt-hr-solid">
    <div class="rcpt-total-row"><span>TOTAL TAGIHAN</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pb.total))}</span></div>
    <hr class="rcpt-hr-dash">
    <div class="rcpt-row"><span class="rcpt-row-label">Dibayar</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(pb.bayar || 0))}</span></div>
    <div class="rcpt-row"><span class="rcpt-row-label">Status Bayar</span><span class="rcpt-row-val">${escapeHtml(String(pb.status_bayar || 'lunas').toUpperCase())}</span></div>
    ${sisaHutang > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Sisa Hutang</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(sisaHutang))}</span></div>` : ''}
    ${sisaHutang > 0 && jatuhTempoTgl ? `<div class="rcpt-row"><span class="rcpt-row-label">Jatuh Tempo</span><span class="rcpt-row-val">${escapeHtml(formatTanggal(jatuhTempoTgl))}</span></div>` : ''}
    ${pb.catatan ? `<hr class="rcpt-hr-dot"><div class="rcpt-note">Catatan: ${escapeHtml(pb.catatan)}</div>` : ''}
    <hr class="rcpt-hr-solid">
    <div class="rcpt-footer">Bukti Sah Verifikasi Stok Masuk\nTerima kasih atas kerja samanya</div>
  `;
}

/** Susun HTML thermal 203 DPI untuk Rekap Shift Kasir (X-Report / Z-Report) */
function buatHtmlThermalShift(data) {
  const toko = ambilInfoTokoDokumen(data);
  const kasir = data.kasir || { nama: data.kasir_nama || 'Kasir' };
  const isZReport = data.status === 'ditutup' || data.tipe_laporan === 'Z-REPORT';
  const modalAwal = Number(data.modal_awal || 0);
  const totalTransaksi = Number(data.total_transaksi || 0);
  const totalTunai = Number(data.total_tunai || 0);
  const totalTransfer = Number(data.total_transfer || 0);
  const totalTempo = Number(data.total_tempo || 0);
  const totalDepositPakai = Number(data.total_deposit_pakai || 0);
  const totalPenjualan = Number(data.total_penjualan || 0);
  const totalPiutangTunai = Number(data.total_piutang_tunai || 0);
  const totalDepositTunai = Number(data.total_deposit_tunai || 0);
  const totalTarikDepositTunai = Number(data.total_tarik_deposit_tunai || 0);
  const totalRefundTunai = Number(data.total_refund_tunai || 0);
  const totalBiayaKasir = Number(data.total_biaya_kasir || 0);
  const kasSistem = Number(data.kas_sistem !== undefined ? data.kas_sistem : (data.total_laci !== undefined ? data.total_laci : Math.max(0, modalAwal + totalTunai + totalPiutangTunai + totalDepositTunai - totalBiayaKasir - totalRefundTunai - totalTarikDepositTunai)));
  const kasFisik = Number(data.kas_fisik || 0);
  const selisih = Number(data.selisih !== undefined ? data.selisih : (kasFisik - kasSistem));
  const teksSelisih = selisih === 0 ? 'PAS (Rp 0)' : (selisih > 0 ? 'LEBIH +' + formatRupiah(selisih) : 'KURANG -' + formatRupiah(Math.abs(selisih)));

  const rincianBiayaHtml = (totalBiayaKasir > 0 && Array.isArray(data.rincian_biaya_kasir))
    ? data.rincian_biaya_kasir.map((rb) => `<div class="rcpt-item-detail"><span>${escapeHtml(rb.kategori + (rb.keterangan ? ' ' + rb.keterangan : ''))}</span><span class="rcpt-item-sub">-${escapeHtml(formatRupiah(rb.nominal))}</span></div>`).join('')
    : '';

  return `
    <div class="rcpt-center">
      <div class="rcpt-toko">${escapeHtml(toko.nama || 'TOKO')}</div>
      ${toko.alamat ? `<div class="rcpt-sub">${escapeHtml(toko.alamat)}</div>` : ''}
      ${toko.hp ? `<div class="rcpt-sub">Telp/WA: ${escapeHtml(toko.hp)}</div>` : ''}
    </div>
    <hr class="rcpt-hr-solid">
    <div class="rcpt-title">${isZReport ? 'LAPORAN TUTUP SHIFT (Z-REPORT)' : 'REKAP SHIFT KASIR (X-REPORT)'}</div>
    <hr class="rcpt-hr-dash">
    <div class="rcpt-meta">
      ${data.no_shift ? `<div class="rcpt-row"><span class="rcpt-row-label">No. Shift</span><span class="rcpt-row-val">${escapeHtml(data.no_shift)}</span></div>` : ''}
      <div class="rcpt-row"><span class="rcpt-row-label">Petugas/Kasir</span><span class="rcpt-row-val">${escapeHtml(kasir.nama || kasir.username || 'Kasir')}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">${data.waktu_buka ? 'Waktu Buka' : 'Tanggal Shift'}</span><span class="rcpt-row-val">${escapeHtml(data.waktu_buka ? formatTanggal(data.waktu_buka, true) : (data.tanggal || formatTanggal(new Date()).substring(0, 10)))}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">${isZReport && data.waktu_tutup ? 'Waktu Tutup' : 'Waktu Cetak'}</span><span class="rcpt-row-val">${escapeHtml(isZReport && data.waktu_tutup ? formatTanggal(data.waktu_tutup, true) : formatTanggal(new Date(), true))}</span></div>
    </div>
    <hr class="rcpt-hr-dash">
    <div class="rcpt-row"><span class="rcpt-row-label">Modal Awal Laci</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(modalAwal))}</span></div>
    <div class="rcpt-row"><span class="rcpt-row-label">Total Transaksi</span><span class="rcpt-row-val">${escapeHtml(`${totalTransaksi} Nota`)}</span></div>
    <hr class="rcpt-hr-dot">
    <div class="rcpt-row"><span class="rcpt-row-label">Penerimaan Tunai</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(totalTunai))}</span></div>
    ${totalPiutangTunai > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">(+) Piutang Tunai</span><span class="rcpt-row-val">+${escapeHtml(formatRupiah(totalPiutangTunai))}</span></div>` : ''}
    ${totalDepositTunai > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">(+) Titipan Tunai</span><span class="rcpt-row-val">+${escapeHtml(formatRupiah(totalDepositTunai))}</span></div>` : ''}
    <div class="rcpt-row"><span class="rcpt-row-label">Non-Tunai (QRIS/Bank)</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(totalTransfer))}</span></div>
    ${totalDepositPakai > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Pakai Saldo Titipan</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(totalDepositPakai))}</span></div>` : ''}
    ${totalTempo > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">Piutang (Tempo Bon)</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(totalTempo))}</span></div>` : ''}
    ${totalTarikDepositTunai > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">(-) Tarik Titipan</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(totalTarikDepositTunai))}</span></div>` : ''}
    ${totalRefundTunai > 0 ? `<div class="rcpt-row"><span class="rcpt-row-label">(-) Refund Retur</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(totalRefundTunai))}</span></div>` : ''}
    ${totalBiayaKasir > 0 ? `<hr class="rcpt-hr-dot"><div class="rcpt-row"><span class="rcpt-row-label">(-) Kas Keluar Kasir</span><span class="rcpt-row-val">-${escapeHtml(formatRupiah(totalBiayaKasir))}</span></div>${rincianBiayaHtml}` : ''}
    <hr class="rcpt-hr-dash">
    <div class="rcpt-total-row"><span>TOTAL OMSET</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(totalPenjualan))}</span></div>
    <hr class="rcpt-hr-solid">
    ${isZReport ? `
      <div class="rcpt-title">REKONSILIASI FISIK LACI</div>
      <div class="rcpt-row"><span class="rcpt-row-label">Kas Menurut Sistem</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(kasSistem))}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Kas Fisik Dihitung</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(kasFisik))}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Selisih Laci</span><span class="rcpt-row-val">${escapeHtml(teksSelisih)}</span></div>
      ${data.catatan_tutup ? `<hr class="rcpt-hr-dot"><div class="rcpt-note">Catatan: ${escapeHtml(data.catatan_tutup)}</div>` : ''}
      ${data.ditutup_oleh_nama && data.ditutup_oleh_nama !== (kasir.nama || '') ? `<div class="rcpt-row"><span class="rcpt-row-label">Ditutup Oleh</span><span class="rcpt-row-val">${escapeHtml(data.ditutup_oleh_nama)}</span></div>` : ''}
    ` : `
      <div class="rcpt-total-row"><span>UANG FISIK LACI</span><span class="rcpt-row-val">${escapeHtml(formatRupiah(kasSistem))}</span></div>
      <div class="rcpt-center rcpt-sub">${totalBiayaKasir > 0 ? '(Modal + Tunai - Kas Keluar)' : '(Modal Awal + Kas Tunai)'}</div>
    `}
    <hr class="rcpt-hr-solid">
    <div class="rcpt-ttd">
      <div class="rcpt-ttd-col"><div>Kasir</div><div class="rcpt-ttd-sp"></div><div class="rcpt-ttd-ln">${escapeHtml(kasir.nama || '')}</div></div>
      <div class="rcpt-ttd-col"><div>Supervisor</div><div class="rcpt-ttd-sp"></div><div class="rcpt-ttd-ln">Penerima</div></div>
    </div>
    <hr class="rcpt-hr-dash">
    <div class="rcpt-footer">POS KASIR TOKO BANGUNAN</div>
  `;
}

/** Susun HTML thermal 203 DPI untuk Surat Jalan (TANPA HARGA — khusus sopir/kuli) */
function buatHtmlThermalSuratJalan(data, opsi = {}) {
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pel = data.pelanggan || null;
  const toko = ambilInfoTokoDokumen(data);
  const noSj = String(pj.no_nota || '-').replace(/^INV-/, 'SJ-');
  const hasilSaring = saringItemSuratJalan(items, !!opsi.sertakanSudahDibawa);
  const daftarMuat = hasilSaring.daftarTampil;
  const hpPel = (pel && pel.hp) || pj.pelanggan_hp || '';
  const alamat = pj.alamat_kirim || (pel && pel.alamat) || '';

  let totalUnitKirim = 0;
  const itemsHtml = daftarMuat.map((it, idx) => {
    const qtyMuat = hasilSaring.adaSisa ? it._sisa : it._qty;
    totalUnitKirim += qtyMuat;
    let detailHtml = '';
    if (hasilSaring.adaSisa && it._sisa <= 0) {
      detailHtml = `<div class="rcpt-item-detail"><span>(Sudah dibawa pembeli)</span><span class="rcpt-item-sub">${escapeHtml(formatQty(it._qty))} ${escapeHtml(it.satuan || '')}</span></div>`;
    } else if (it._dibawa > 0 && it._sisa > 0) {
      detailHtml = `<div class="rcpt-item-detail"><span>[ ] KIRIM: ${escapeHtml(formatQty(it._sisa))} ${escapeHtml(it.satuan || '')}</span><span class="rcpt-item-sub">Bawa: ${escapeHtml(formatQty(it._dibawa))}</span></div>`;
    } else {
      detailHtml = `<div class="rcpt-item-detail"><span>[ ] KIRIM: ${escapeHtml(formatQty(qtyMuat))} ${escapeHtml(it.satuan || '')}</span><span class="rcpt-item-sub">OK</span></div>`;
    }
    return `
      <div class="rcpt-item">
        <div class="rcpt-item-nama">${idx + 1}. ${escapeHtml(it.nama || 'Barang')}</div>
        ${detailHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="rcpt-center">
      <div class="rcpt-toko">${escapeHtml(toko.nama || 'TOKO')}</div>
      ${toko.alamat ? `<div class="rcpt-sub">${escapeHtml(toko.alamat)}</div>` : ''}
      ${toko.hp ? `<div class="rcpt-sub">Telp/WA: ${escapeHtml(toko.hp)}</div>` : ''}
    </div>
    <hr class="rcpt-hr-solid">
    <div class="rcpt-title">SURAT JALAN BARANG</div>
    <div class="rcpt-center rcpt-sub">(TANPA HARGA / CEK MUATAN)</div>
    <hr class="rcpt-hr-dash">
    <div class="rcpt-meta">
      <div class="rcpt-row"><span class="rcpt-row-label">No. SJ</span><span class="rcpt-row-val">${escapeHtml(noSj)}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Ref Nota</span><span class="rcpt-row-val">${escapeHtml(pj.no_nota || '-')}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Tanggal</span><span class="rcpt-row-val">${escapeHtml(formatTanggal(pj.tanggal || new Date(), true))}</span></div>
      <div class="rcpt-row"><span class="rcpt-row-label">Penerima</span><span class="rcpt-row-val">${escapeHtml(pel ? pel.nama : (pj.pelanggan_nama || 'Umum'))}</span></div>
      ${hpPel ? `<div class="rcpt-row"><span class="rcpt-row-label">HP/WA</span><span class="rcpt-row-val">${escapeHtml(hpPel)}</span></div>` : ''}
      ${opsi.sopir ? `<div class="rcpt-row"><span class="rcpt-row-label">Sopir</span><span class="rcpt-row-val">${escapeHtml(opsi.sopir)}</span></div>` : ''}
      ${opsi.noPlat ? `<div class="rcpt-row"><span class="rcpt-row-label">Armada</span><span class="rcpt-row-val">${escapeHtml(opsi.noPlat)}</span></div>` : ''}
      ${alamat ? `<div class="rcpt-note">Alamat Kirim: ${escapeHtml(alamat)}</div>` : ''}
    </div>
    <hr class="rcpt-hr-dash">
    ${itemsHtml}
    <hr class="rcpt-hr-dash">
    <div class="rcpt-row"><span class="rcpt-row-label">Total Jenis Muat</span><span class="rcpt-row-val">${daftarMuat.length} Jenis</span></div>
    <div class="rcpt-row"><span class="rcpt-row-label">Total Unit Kirim</span><span class="rcpt-row-val">${escapeHtml(formatQty(totalUnitKirim))}</span></div>
    ${!opsi.sertakanSudahDibawa && hasilSaring.sudahDibawaList.length > 0 && hasilSaring.adaSisa ? `<hr class="rcpt-hr-dot"><div class="rcpt-note">Info: ${hasilSaring.sudahDibawaList.length} item lain di nota ini sudah dibawa pembeli.</div>` : ''}
    ${(opsi.catatan || pj.catatan) ? `<hr class="rcpt-hr-dot"><div class="rcpt-note">Catatan: ${escapeHtml(opsi.catatan || pj.catatan)}</div>` : ''}
    <hr class="rcpt-hr-solid">
    <div class="rcpt-center rcpt-sub">Barang diterima dalam kondisi baik</div>
    <div class="rcpt-ttd">
      <div class="rcpt-ttd-col"><div>Pengirim</div><div class="rcpt-ttd-sp"></div><div class="rcpt-ttd-ln">Gudang/Sopir</div></div>
      <div class="rcpt-ttd-col"><div>Penerima</div><div class="rcpt-ttd-sp"></div><div class="rcpt-ttd-ln">Pembeli</div></div>
    </div>
  `;
}

/**
 * Modal Pratinjau & Cetak Thermal Web Presisi (203 DPI + Auto-Height + Kalibrasi + Direct USB Serial)
 */
function bukaModalPratinjauThermalWeb({ judulModal, judulDokumen, bodyHtml, ukuranAwal = '58', ambilTeksEscPos = null }) {
  let ukuranAktif = String(ukuranAwal) === '80' ? '80' : '58';
  let cal = ambilKalibrasiThermal();
  const adaDirectUsb = !adalahPerangkatAndroid() && typeof ambilTeksEscPos === 'function';

  const lebarOpsiHtml = (uk, aktifVal) => {
    const daftar = uk === '80' ? [68, 70, 72, 74, 76, 78] : [44, 46, 48, 50, 52, 54];
    return daftar.map((v) => `<option value="${v}" ${Number(aktifVal) === v ? 'selected' : ''}>${v} mm${(uk === '80' ? v === 72 : v === 48) ? ' (Std)' : ''}</option>`).join('');
  };

  const modal = showModal({
    title: judulModal || 'Pratinjau Cetak Thermal Presisi',
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="thermal-cal-bar">
          <div>
            <label class="form-label text-xs fw-semibold" for="cal-th-kertas" style="margin-bottom: 2px;">Kertas</label>
            <select id="cal-th-kertas" class="input input-sm">
              <option value="58" ${ukuranAktif === '58' ? 'selected' : ''}>58 mm</option>
              <option value="80" ${ukuranAktif === '80' ? 'selected' : ''}>80 mm</option>
            </select>
          </div>
          <div>
            <label class="form-label text-xs fw-semibold" for="cal-th-lebar" style="margin-bottom: 2px;">Lebar Cetak</label>
            <select id="cal-th-lebar" class="input input-sm">
              ${lebarOpsiHtml(ukuranAktif, ukuranAktif === '80' ? cal.lebar80Mm : cal.lebar58Mm)}
            </select>
          </div>
          <div>
            <label class="form-label text-xs fw-semibold" for="cal-th-font" style="margin-bottom: 2px;">Ukuran Huruf</label>
            <select id="cal-th-font" class="input input-sm">
              <option value="kecil" ${cal.ukuranFont === 'kecil' ? 'selected' : ''}>Kecil</option>
              <option value="normal" ${cal.ukuranFont === 'normal' ? 'selected' : ''}>Normal (Tajam)</option>
              <option value="besar" ${cal.ukuranFont === 'besar' ? 'selected' : ''}>Besar (Tebal)</option>
            </select>
          </div>
          <div>
            <label class="form-label text-xs fw-semibold" for="cal-th-feed" style="margin-bottom: 2px;">Sisa Potong</label>
            <select id="cal-th-feed" class="input input-sm">
              ${[4, 8, 10, 14, 18].map((v) => `<option value="${v}" ${cal.feedBawahMm === v ? 'selected' : ''}>${v} mm${v === 10 ? ' (Std)' : ''}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="thermal-preview-stage" style="max-height: 360px;">
          <iframe id="iframe-preview-thermal" class="thermal-wysiwyg-frame" title="Pratinjau Struk Thermal"></iframe>
        </div>

        <div class="alert alert-info" style="font-size: 12px; padding: var(--sp-2) var(--sp-3);">
          ${ICONS.info}
          <div>
            <strong>Tips Cetak Presisi dari Browser:</strong> Di dialog Print Chrome/Edge, pastikan <strong>Margins: None</strong>, <strong>Scale: 100%</strong>, dan matikan <strong>Headers &amp; footers</strong>. Panjang kertas otomatis disesuaikan persis dengan isi struk.
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-pratinjau-th">Tutup</button>
        <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
          ${adaDirectUsb ? `
            <button type="button" class="btn btn-primary btn-sm" id="btn-cetak-serial-th" style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.zap}
              <span>Direct POS USB (ESC/POS)</span>
            </button>
          ` : ''}
          <button type="button" class="btn ${adaDirectUsb ? 'btn-secondary' : 'btn-primary'} btn-sm" id="btn-eksekusi-cetak-th" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak Browser (${ukuranAktif}mm)</span>
          </button>
        </div>
      </div>
    `
  });

  const iframe = modal.el.querySelector('#iframe-preview-thermal');
  const selKertas = modal.el.querySelector('#cal-th-kertas');
  const selLebar = modal.el.querySelector('#cal-th-lebar');
  const selFont = modal.el.querySelector('#cal-th-font');
  const selFeed = modal.el.querySelector('#cal-th-feed');
  const btnCetak = modal.el.querySelector('#btn-eksekusi-cetak-th');

  const renderPratinjau = () => {
    const lebarCetakMm = ukuranAktif === '80' ? cal.lebar80Mm : cal.lebar58Mm;
    const lebarPx = Math.round((lebarCetakMm * 96) / 25.4) + 12;
    iframe.style.width = `${lebarPx}px`;
    iframe.style.height = '320px';
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(bungkusDokumenThermalHtml(judulDokumen, bodyHtml, ukuranAktif, cal, null));
    doc.close();
    setTimeout(() => {
      try {
        const h = Math.ceil((doc.body.scrollHeight || 300) + 8);
        iframe.style.height = `${Math.max(180, Math.min(h, 680))}px`;
      } catch (_) { }
    }, 60);
    if (btnCetak) {
      btnCetak.innerHTML = `${ICONS.printer} <span>Cetak Browser (${ukuranAktif}mm)</span>`;
    }
  };

  renderPratinjau();

  selKertas?.addEventListener('change', () => {
    ukuranAktif = selKertas.value === '80' ? '80' : '58';
    selLebar.innerHTML = lebarOpsiHtml(ukuranAktif, ukuranAktif === '80' ? cal.lebar80Mm : cal.lebar58Mm);
    renderPratinjau();
  });

  selLebar?.addEventListener('change', () => {
    const val = Number(selLebar.value) || (ukuranAktif === '80' ? 72 : 48);
    cal = simpanKalibrasiThermal(ukuranAktif === '80' ? { lebar80Mm: val } : { lebar58Mm: val });
    renderPratinjau();
  });

  selFont?.addEventListener('change', () => {
    cal = simpanKalibrasiThermal({ ukuranFont: selFont.value });
    renderPratinjau();
  });

  selFeed?.addEventListener('change', () => {
    cal = simpanKalibrasiThermal({ feedBawahMm: Number(selFeed.value) });
    renderPratinjau();
  });

  btnCetak?.addEventListener('click', () => {
    cetakHtmlThermalAutoHeight(judulDokumen, bodyHtml, ukuranAktif, cal);
  });

  modal.el.querySelector('#btn-cetak-serial-th')?.addEventListener('click', async () => {
    if (typeof ambilTeksEscPos === 'function') {
      const teks = ambilTeksEscPos(ukuranAktif);
      await cetakDirectUsbDesktop(teksKeEscPos(teks), judulDokumen || 'Struk Thermal');
    }
  });

  modal.el.querySelector('#btn-tutup-pratinjau-th')?.addEventListener('click', () => modal.close());
}

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
  window.open(url, '_blank', 'noopener,noreferrer');
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
 * @param {'rawbt'|'bluetooth'|'browser'|'usb_direct'|'webusb'|'serial'} [jalur='rawbt']
 * @param {'58'|'80'} [ukuran='58']
 */
export async function cetakUjiStruk(jalur = 'rawbt', ukuran = '58') {
  const data = buatDataStrukUji(ukuran);
  if (jalur === 'usb_direct') {
    return await cetakUsbDirect(data, ukuran);
  } else if (jalur === 'webusb') {
    const teks = susunTeksStruk(data, ukuran);
    return await kirimEscPosKeWebUsb(teksKeEscPos(teks));
  } else if (jalur === 'serial') {
    const teks = susunTeksStruk(data, ukuran);
    return await kirimEscPosKeSerial(teksKeEscPos(teks));
  } else if (jalur === 'bluetooth') {
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
 * Tampilkan modal panduan & koneksi printer thermal (Direct POS USB Desktop & RawBT Bluetooth Android)
 */
export function tampilkanModalKoneksiPrinter() {
  const cfg = store.get('pengaturan') || {};
  let ukuranKertas = cfg.printer_ukuran === '80' ? '80' : '58';
  let cal = ambilKalibrasiThermal();
  const isAndroid = adalahPerangkatAndroid();

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

  const panelDesktopUsbHtml = `
    <div class="card card-body stack-sm" style="background: var(--primary-soft); border: 1.5px solid var(--border-strong);">
      <div class="row-between" style="align-items: flex-start; gap: var(--sp-2); flex-wrap: wrap;">
        <div class="row" style="align-items: flex-start; gap: var(--sp-2); flex: 1; min-width: 220px;">
          <div style="background: var(--primary); color: var(--text-inverse); width: 38px; height: 38px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${ICONS.zap}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="fw-bold text-sm" style="color: var(--text);">Direct POS USB / ESC-POS (Desktop PC)</div>
            <div class="text-xs text-muted" style="margin-top: 2px; line-height: 1.4;">
              Cetak <strong>RAW ESC/POS asli</strong> langsung ke printer thermal USB 58/80mm (Eppos, Panda, Xprinter, Epson, POS-58/80) — <strong>1 klik, 100% tajam, auto-cut, tanpa dialog Chrome!</strong>
            </div>
          </div>
        </div>
        <span class="badge badge-neutral" id="badge-status-usb-bridge">Mengecek Bridge...</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-2); margin-top: 4px;">
        <div>
          <label class="form-label text-xs fw-semibold" for="sel-usb-mode" style="margin-bottom: 2px;">Jalur Direct USB PC</label>
          <select id="sel-usb-mode" class="input input-sm">
            <option value="bridge" ${cal.usbMode === 'bridge' ? 'selected' : ''}>POS USB Bridge Windows (Rekomendasi)</option>
            <option value="webusb" ${cal.usbMode === 'webusb' ? 'selected' : ''}>Direct WebUSB (Tanpa Bridge / WinUSB)</option>
            <option value="serial" ${cal.usbMode === 'serial' ? 'selected' : ''}>Direct USB Serial / COM Port</option>
          </select>
        </div>
        <div id="wrap-usb-bridge-printer">
          <label class="form-label text-xs fw-semibold" for="sel-usb-printer-name" style="margin-bottom: 2px;">Printer USB Windows</label>
          <div style="display: flex; flex-wrap: nowrap; align-items: center; gap: 6px;">
            <select id="sel-usb-printer-name" class="input input-sm" style="flex: 1; min-width: 0; width: auto;">
              <option value="${escapeHtml(cal.usbPrinterName)}">${cal.usbPrinterName ? escapeHtml(cal.usbPrinterName) : '(Default Printer Windows)'}</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm btn-icon" id="btn-refresh-usb-bridge" title="Segarkan daftar printer Windows" style="flex-shrink: 0;">${ICONS.refresh}</button>
          </div>
        </div>
      </div>

      <label class="text-xs" style="display: flex; flex-wrap: nowrap; gap: 8px; cursor: pointer; align-items: center; margin-top: 2px;">
        <input type="checkbox" id="chk-usb-buka-laci" ${cal.bukaLaciOtomatis ? 'checked' : ''} style="width: 15px; height: 15px; flex-shrink: 0; accent-color: var(--primary);">
        <span>Buka Laci Kasir (Cash Drawer) otomatis saat cetak struk tunai</span>
      </label>

      <div class="row" style="gap: var(--sp-2); flex-wrap: wrap; margin-top: 4px;">
        <button type="button" class="btn btn-primary btn-sm grow" id="btn-modal-test-usb-direct" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
          ${ICONS.zap}
          <span id="lbl-btn-test-usb">Uji Cetak Direct POS USB (${ukuranKertas}mm)</span>
        </button>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-test-laci" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
          ${ICONS.wallet}
          <span>Tes Buka Laci</span>
        </button>
        <a href="./download/POS-Kasir-USB-Bridge.bat" download="POS-Kasir-USB-Bridge.bat" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none;">
          ${ICONS.download}
          <span>Unduh Bridge Windows</span>
        </a>
      </div>

      <div class="text-xs text-muted" style="line-height: 1.45; border-top: 1px dashed var(--border-strong); padding-top: 6px;">
        <strong>Cara Pakai di Windows (30 Detik, Tanpa Install Driver Baru):</strong>
        1) Klik <strong>Unduh Bridge Windows</strong> (atau jalankan <code>tools/pos-usb-bridge/jalankan-bridge.bat</code>), 2) Klik 2× file <code>POS-Kasir-USB-Bridge.bat</code>, 3) Tekan tombol segarkan lalu pilih nama printer thermal Anda &amp; klik <strong>Uji Cetak Direct POS USB</strong>!
      </div>
    </div>
  `;

  const modal = showModal({
    title: isAndroid ? 'Koneksi Printer Bluetooth (RawBT)' : 'Koneksi Printer Thermal (Direct POS USB & Bluetooth)',
    size: isAndroid ? 'md' : 'lg',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <!-- Pilih Ukuran Kertas Cepat -->
        <div class="row-between items-center" style="gap: var(--sp-2); flex-wrap: wrap; padding: 8px 12px; border-radius: var(--radius-md); background: var(--surface-2); border: 1px solid var(--border);">
          <span class="text-xs fw-semibold text-muted">Ukuran Kertas Uji Cetak:</span>
          <div class="row" style="gap: 6px;" id="modal-printer-size-toggle">
            <button type="button" class="btn btn-xs ${ukuranKertas === '58' ? 'btn-primary' : 'btn-secondary'}" data-paper-size="58">58 mm (32 Kolom)</button>
            <button type="button" class="btn btn-xs ${ukuranKertas === '80' ? 'btn-primary' : 'btn-secondary'}" data-paper-size="80">80 mm (48 Kolom)</button>
          </div>
        </div>

        ${!isAndroid ? panelDesktopUsbHtml : ''}

        <div class="card card-body" style="background: ${isAndroid ? 'var(--primary-soft)' : 'var(--surface-2)'}; border: 1.5px solid var(--border);">
          <div class="row" style="align-items: flex-start; gap: var(--sp-3);">
            <div style="background: var(--primary); color: var(--text-inverse); width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              ${ICONS.printer}
            </div>
            <div class="stack-sm" style="flex: 1; min-width: 0;">
              <div class="fw-bold text-sm" style="color: var(--text);">Printer Bluetooth Android (RawBT) &amp; Jalur Alternatif</div>
              <p class="text-xs text-muted" style="margin: 0; line-height: 1.45;">
                Untuk HP/Tablet Android, gunakan <strong>RawBT Print Service</strong> agar cetak nota kasir instan lewat Bluetooth.
              </p>
              ${statusBadgesHtml}
            </div>
          </div>
        </div>

        <!-- Tombol Aksi Cepat -->
        <div class="stack-sm">
          <div class="fw-bold text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.5px;">Aksi Cepat &amp; Uji Jalur Lain:</div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            ${rawbtInstalled === false ? `
              <button type="button" class="btn ${isAndroid ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-modal-install-rawbt-top" style="min-width: 150px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.download}
                <span>Pasang RawBT (Play Store)</span>
              </button>
            ` : `
              <button type="button" class="btn ${isAndroid ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-modal-test-rawbt" style="min-width: 150px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
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
              <span>Bluetooth HP</span>
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

        ${isAndroid ? `
        <div class="divider" style="margin: var(--sp-1) 0;"></div>
        <div class="stack-sm">
          <div class="fw-bold text-sm" style="color: var(--text);">4 Langkah Mudah Menyambungkan Printer Android:</div>
          <div class="stack" style="gap: var(--sp-2); margin-top: 4px;">
            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">1</span>
              <div>
                <strong>Pasang Aplikasi RawBT</strong> dari Google Play Store di HP/Tablet Android Anda.
                <div style="margin-top: 4px;">
                  <button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-modal-download-rawbt" style="padding: 2px 8px; border: 1px solid var(--border-strong); display: inline-flex; align-items: center; gap: 4px;">
                    ${ICONS.download}
                    <span>Unduh RawBT di Google Play Store</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">2</span>
              <div><strong>Nyalakan Printer &amp; Bluetooth</strong> lalu pairing nama printer (PIN: <code>0000</code> atau <code>1234</code>).</div>
            </div>
            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">3</span>
              <div><strong>Pilih Printer di RawBT</strong>: Buka RawBT &gt; Settings &gt; Bluetooth &gt; Pilih Printer Anda.</div>
            </div>
            <div class="row" style="align-items: flex-start; gap: 10px; font-size: 13px;">
              <span class="badge badge-primary" style="border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 0;">4</span>
              <div><strong>Tekan Uji Cetak RawBT</strong> — jika kertas keluar, printer siap dipakai kasir!</div>
            </div>
          </div>
        </div>
        ` : ''}
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

  const segarkanBridgeStatus = async () => {
    const badge = modal.el.querySelector('#badge-status-usb-bridge');
    const selPrn = modal.el.querySelector('#sel-usb-printer-name');
    if (!badge) return;
    badge.className = 'badge badge-neutral';
    badge.textContent = 'Mengecek Bridge...';
    const st = await cekStatusUsbBridge();
    if (st.aktif) {
      badge.className = 'badge badge-success badge-dot';
      badge.textContent = `Bridge Aktif (${st.printers.length} Printer)`;
      if (selPrn) {
        const curName = cal.usbPrinterName || '';
        const opsi = [`<option value="">(Default: ${escapeHtml(st.default_printer || 'Otomatis')})</option>`];
        st.printers.forEach((pName) => {
          opsi.push(`<option value="${escapeHtml(pName)}" ${curName === pName ? 'selected' : ''}>${escapeHtml(pName)}</option>`);
        });
        selPrn.innerHTML = opsi.join('');
      }
    } else {
      badge.className = 'badge badge-warning badge-dot';
      badge.textContent = 'Bridge Belum Aktif';
    }
  };

  if (!isAndroid) {
    segarkanBridgeStatus();
    const selMode = modal.el.querySelector('#sel-usb-mode');
    const wrapPrn = modal.el.querySelector('#wrap-usb-bridge-printer');
    const syncModeUi = () => {
      if (wrapPrn) wrapPrn.style.display = (selMode?.value || 'bridge') === 'bridge' ? '' : 'none';
    };
    syncModeUi();
    selMode?.addEventListener('change', () => {
      cal = simpanKalibrasiThermal({ usbMode: selMode.value });
      syncModeUi();
    });
    modal.el.querySelector('#sel-usb-printer-name')?.addEventListener('change', (e) => {
      cal = simpanKalibrasiThermal({ usbPrinterName: e.target.value });
      showToast(`Printer USB dipilih: ${e.target.value || 'Default Windows'}`, 'success', 2000);
    });
    modal.el.querySelector('#chk-usb-buka-laci')?.addEventListener('change', (e) => {
      cal = simpanKalibrasiThermal({ bukaLaciOtomatis: Boolean(e.target.checked) });
    });
    modal.el.querySelector('#btn-refresh-usb-bridge')?.addEventListener('click', segarkanBridgeStatus);
    modal.el.querySelector('#btn-modal-test-usb-direct')?.addEventListener('click', () => {
      cetakUjiStruk('usb_direct', ukuranKertas);
    });
    modal.el.querySelector('#btn-modal-test-laci')?.addEventListener('click', () => {
      bukaLaciKasirUsb();
    });
  }

  modal.el.querySelectorAll('[data-paper-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ukuranKertas = btn.getAttribute('data-paper-size') === '80' ? '80' : '58';
      modal.el.querySelectorAll('[data-paper-size]').forEach((b) => {
        b.className = `btn btn-xs ${b === btn ? 'btn-primary' : 'btn-secondary'}`;
      });
      const lbl = modal.el.querySelector('#lbl-btn-test-rawbt');
      if (lbl) lbl.textContent = `Uji Cetak RawBT (${ukuranKertas}mm)`;
      const lblUsb = modal.el.querySelector('#lbl-btn-test-usb');
      if (lblUsb) lblUsb.textContent = `Uji Cetak Direct POS USB (${ukuranKertas}mm)`;
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
  const htmlBody = buatHtmlThermalPenjualan(dataStruk);
  bukaModalPratinjauThermalWeb({
    judulModal: `Pratinjau Cetak Thermal — ${dataStruk.penjualan?.no_nota || 'Nota'}`,
    judulDokumen: `Cetak Nota ${dataStruk.penjualan?.no_nota || ''}`,
    bodyHtml: htmlBody,
    ukuranAwal: ukuran,
    ambilTeksEscPos: (uk) => susunTeksStruk(dataStruk, uk)
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

  const adaCampuranKirim = pj.pengiriman === 'dikirim' && items.some((it) => Number(it.qty_dibawa || 0) > 0);
  items.forEach((it) => {
    let ketWa = '';
    if (adaCampuranKirim && it.qty_dibawa !== undefined) {
      const qTot = Number(it.qty || 0);
      const qBawa = Math.min(qTot, Math.max(0, Number(it.qty_dibawa)));
      const qSisa = Math.round(Math.max(0, qTot - qBawa) * 1000) / 1000;
      if (qSisa <= 0) ketWa = ' _[Sudah Dibawa]_';
      else if (qBawa <= 0) ketWa = ' _[Dikirim Toko]_';
      else ketWa = ` _[Dibawa: ${formatQty(qBawa)}, Kirim: ${formatQty(qSisa)}]_`;
    }
    pesan += `• ${it.nama} (${formatQty(it.qty)} ${it.satuan})${ketWa}\n`;
    pesan += `  ${formatRupiah(it.subtotal)}\n`;
  });

  pesan += `--------------------------------\n`;
  if (pj.diskon > 0) pesan += `Diskon: -${formatRupiah(pj.diskon)}\n`;
  if (Number(pj.ongkir) > 0) pesan += `Ongkos Kirim: ${formatRupiah(pj.ongkir)}\n`;
  const metodeBayarWa = String(pj.metode_bayar || 'tunai').toLowerCase();
  const ringBayarWa = hitungRingkasanBayarDokumen(dataStruk);
  const pelWa = dataStruk.pelanggan || null;
  pesan += `*TOTAL : ${formatRupiah(pj.total)}*\n`;
  if (ringBayarWa.totalRetur > 0) {
    pesan += `Retur Disetujui : -${formatRupiah(ringBayarWa.totalRetur)}\n`;
    pesan += `*TOTAL BERSIH : ${formatRupiah(ringBayarWa.totalBersih)}*\n`;
  }
  pesan += `Metode : ${metodeBayarWa === 'deposit' ? 'SALDO TITIPAN' : metodeBayarWa.toUpperCase()}\n`;
  pesan += `Status : ${ringBayarWa.statusRetur === 'penuh' ? 'DIRETUR PENUH' : String(pj.status_bayar || 'lunas').toUpperCase()}\n`;
  if (ringBayarWa.bayarRiil > 0 && ringBayarWa.sisaTagihan > 0) {
    pesan += `Sudah Dibayar : ${formatRupiah(ringBayarWa.bayarRiil)}\n`;
    pesan += `*Sisa Tagihan : ${formatRupiah(ringBayarWa.sisaTagihan)}*\n`;
  }
  if (ringBayarWa.pakaiDeposit && pelWa && pelWa.saldo_deposit !== undefined) {
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
            ${!adalahPerangkatAndroid() ? `
              <button type="button" class="btn btn-primary btn-sm" id="btn-print-jual-usb-direct" style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.zap}
                <span>Direct POS USB / ESC-POS (${ukuran}mm)</span>
              </button>
            ` : `
              <button type="button" class="btn ${isRawBtUtama ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-print-jual-rawbt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.smartphone}
                <span>RawBT Android (${ukuran}mm)</span>
              </button>
            `}
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-jual-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth}
              <span>Bluetooth Direct</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-jual-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.printer}
              <span>Thermal Browser</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-share-jual-wa" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.messageCircle}
              <span>WhatsApp</span>
            </button>
          </div>
          <div class="divider" style="margin: 2px 0;"></div>
          <div class="fw-bold text-xs text-muted" style="text-align: left;">DOKUMEN PROYEK & PENGIRIMAN:</div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-jual-faktur-a5" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.clipboard}
              <span>Faktur Besar (A5)</span>
            </button>
            <button type="button" class="btn ${pj.pengiriman === 'dikirim' ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-print-jual-surat-jalan" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.truck}
              <span>Surat Jalan</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: ${options.isNewTransaction ? 'space-between' : 'flex-end'};">
        ${options.isNewTransaction ? `
          <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-modal-cetak-jual">Tutup</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-transaksi-baru-modal" style="font-weight: 600;">
            Transaksi Baru
          </button>
        ` : `
          <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-modal-cetak-jual">Tutup</button>
        `}
      </div>
    `
  });

  modal.el.querySelector('#btn-print-jual-usb-direct')?.addEventListener('click', () => {
    cetakUsbDirect(dataStruk, ukuran);
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
    window.open(urlWa, '_blank', 'noopener,noreferrer');
  });

  modal.el.querySelector('#btn-print-jual-faktur-a5')?.addEventListener('click', () => {
    cetakFakturA5(dataStruk);
  });

  modal.el.querySelector('#btn-print-jual-surat-jalan')?.addEventListener('click', () => {
    bukaModalCetakSuratJalan(dataStruk);
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
  const pb = dataPembelian.pembelian || {};
  const htmlBody = buatHtmlThermalPembelian(dataPembelian);
  bukaModalPratinjauThermalWeb({
    judulModal: `Pratinjau Faktur Pembelian — ${pb.no_faktur || ''}`,
    judulDokumen: `Faktur Pembelian ${pb.no_faktur || ''}`,
    bodyHtml: htmlBody,
    ukuranAwal: ukuran,
    ambilTeksEscPos: (uk) => susunTeksStrukPembelian(dataPembelian, uk)
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
            ${!adalahPerangkatAndroid() ? `
              <button type="button" class="btn btn-primary btn-sm" id="btn-print-beli-usb-direct" style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.zap}
                <span>Direct POS USB / ESC-POS (${ukuran}mm)</span>
              </button>
            ` : `
              <button type="button" class="btn ${isRawBtUtama ? 'btn-primary' : 'btn-secondary'} btn-sm grow" id="btn-print-beli-rawbt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.smartphone}
                <span>RawBT Android (${ukuran}mm)</span>
              </button>
            `}
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-beli-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth}
              <span>Bluetooth Direct</span>
            </button>
          </div>
          <div class="row" style="gap: var(--sp-2);">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-beli-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.printer}
              <span>Cetak / Browser</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-share-beli-wa" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.messageCircle}
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-modal-cetak-beli">Tutup</button>
      </div>
    `
  });

  modal.el.querySelector('#btn-print-beli-usb-direct')?.addEventListener('click', () => {
    cetakUsbDirectPembelian(dataPembelian, ukuran);
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
    window.open(urlWa, '_blank', 'noopener,noreferrer');
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
  const kasir = data.kasir || { nama: data.kasir_nama || 'Kasir' };
  const isZReport = data.status === 'ditutup' || data.tipe_laporan === 'Z-REPORT';
  const modalAwal = Number(data.modal_awal || 0);
  const totalTransaksi = Number(data.total_transaksi || 0);
  const totalTunai = Number(data.total_tunai || 0);
  const totalTransfer = Number(data.total_transfer || 0);
  const totalTempo = Number(data.total_tempo || 0);
  const totalDepositPakai = Number(data.total_deposit_pakai || 0);
  const totalPenjualan = Number(data.total_penjualan || 0);
  const totalPiutangTunai = Number(data.total_piutang_tunai || 0);
  const totalDepositTunai = Number(data.total_deposit_tunai || 0);
  const totalTarikDepositTunai = Number(data.total_tarik_deposit_tunai || 0);
  const totalRefundTunai = Number(data.total_refund_tunai || 0);
  const totalBiayaKasir = Number(data.total_biaya_kasir || 0);
  const kasSistem = Number(data.kas_sistem !== undefined ? data.kas_sistem : (data.total_laci !== undefined ? data.total_laci : Math.max(0, modalAwal + totalTunai + totalPiutangTunai + totalDepositTunai - totalBiayaKasir - totalRefundTunai - totalTarikDepositTunai)));
  const kasFisik = Number(data.kas_fisik || 0);
  const selisih = Number(data.selisih !== undefined ? data.selisih : (kasFisik - kasSistem));

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
  baris.push(formatTengah(isZReport ? 'LAPORAN TUTUP SHIFT (Z-REPORT)' : 'REKAP SHIFT KASIR (X-REPORT)', lebar));
  baris.push(buatGaris(lebar, '-'));

  // Info Petugas & Waktu
  if (data.no_shift) {
    baris.push(formatDuaKolom('No. Shift', data.no_shift, lebar));
  }
  baris.push(formatDuaKolom('Petugas/Kasir', (kasir.nama || kasir.username || 'Kasir'), lebar));
  if (data.waktu_buka) {
    baris.push(formatDuaKolom('Waktu Buka', formatTanggal(data.waktu_buka, true), lebar));
  } else {
    baris.push(formatDuaKolom('Tanggal Shift', data.tanggal || formatTanggal(new Date()).substring(0, 10), lebar));
  }
  if (isZReport && data.waktu_tutup) {
    baris.push(formatDuaKolom('Waktu Tutup', formatTanggal(data.waktu_tutup, true), lebar));
  } else {
    baris.push(formatDuaKolom('Waktu Cetak', formatTanggal(new Date(), true), lebar));
  }
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
  if (totalDepositPakai > 0) {
    baris.push(formatDuaKolom('Pakai Saldo Titipan', formatRupiah(totalDepositPakai), lebar));
  }
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

  // Saldo Akhir & Rekonsiliasi Fisik Laci
  if (isZReport) {
    baris.push(formatTengah('REKONSILIASI FISIK LACI', lebar));
    baris.push(formatDuaKolom('Kas Menurut Sistem', formatRupiah(kasSistem), lebar));
    baris.push(formatDuaKolom('Kas Fisik Dihitung', formatRupiah(kasFisik), lebar));
    const teksSelisih = selisih === 0
      ? 'PAS (Rp 0)'
      : (selisih > 0 ? 'LEBIH +' + formatRupiah(selisih) : 'KURANG -' + formatRupiah(Math.abs(selisih)));
    baris.push(formatDuaKolom('Selisih Laci', teksSelisih, lebar));
    if (data.catatan_tutup) {
      baris.push(buatGaris(lebar, '.'));
      baris.push('Catatan: ' + String(data.catatan_tutup));
    }
    if (data.ditutup_oleh_nama && data.ditutup_oleh_nama !== (kasir.nama || '')) {
      baris.push(formatDuaKolom('Ditutup Oleh', data.ditutup_oleh_nama, lebar));
    }
  } else {
    baris.push(formatDuaKolom('UANG FISIK LACI', formatRupiah(kasSistem), lebar));
    baris.push(formatTengah(totalBiayaKasir > 0 ? '(Modal + Tunai - Kas Keluar)' : '(Modal Awal + Kas Tunai)', lebar));
  }
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
 * Cetak X-Report / Z-Report shift via browser print dialog (HTML 203 DPI Presisi + Auto-Height)
 */
export function cetakBrowserShift(dataReport, ukuran = '58') {
  const isZReport = dataReport && (dataReport.status === 'ditutup' || dataReport.tipe_laporan === 'Z-REPORT');
  const htmlBody = buatHtmlThermalShift(dataReport);
  bukaModalPratinjauThermalWeb({
    judulModal: isZReport ? 'Pratinjau Z-Report (Thermal Presisi)' : 'Pratinjau X-Report (Thermal Presisi)',
    judulDokumen: isZReport ? 'Laporan Tutup Shift (Z-Report)' : 'Rekap Shift (X-Report)',
    bodyHtml: htmlBody,
    ukuranAwal: ukuran,
    ambilTeksEscPos: (uk) => susunTeksXReport(dataReport, uk)
  });
}

/**
 * Buat tautan WhatsApp rekap shift kasir (X-Report / Z-Report) untuk dikirim ke Owner/Supervisor
 */
export function buatTautanWhatsAppShift(dataReport) {
  const teks = susunTeksXReport(dataReport, '58');
  const isZReport = dataReport && (dataReport.status === 'ditutup' || dataReport.tipe_laporan === 'Z-REPORT');
  const judul = isZReport ? '*LAPORAN TUTUP SHIFT (Z-REPORT)*' : '*REKAP SHIFT KASIR (X-REPORT)*';
  const pesan = `${judul}\n\`\`\`\n${teks}\n\`\`\``;
  return `https://wa.me/?text=${encodeURIComponent(pesan)}`;
}

/**
 * Dialog pilihan cetak struk rekap shift (RawBT / Bluetooth / Browser / WhatsApp)
 * @param {Object} dataReport
 */
export function bukaModalPilihanCetakShift(dataReport) {
  const cfg = store.get('pengaturan') || {};
  const ukuran = (cfg.printer_ukuran === '80' || cfg.printer_lebar === '80') ? '80' : '58';
  const isZReport = dataReport && (dataReport.status === 'ditutup' || dataReport.tipe_laporan === 'Z-REPORT');
  const teksStruk = susunTeksXReport(dataReport, ukuran);

  const modal = showModal({
    title: isZReport ? 'Cetak Laporan Tutup Shift (Z-Report)' : 'Cetak Rekap Shift (X-Report)',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="alert ${isZReport ? 'alert-success' : 'alert-info'}">
          ${ICONS.printer}
          <div>
            <strong>${isZReport ? 'Laporan Tutup Shift (Z-Report) Siap Dicetak' : 'Rekap Shift Kasir Siap Dicetak'}</strong><br>
            Pilih jalur pencetakan thermal (${ukuran}mm) atau kirim rekap ke WhatsApp.
          </div>
        </div>

        <div>
          <div class="row-between" style="margin-bottom: var(--sp-1);">
            <label class="form-label text-xs fw-semibold" style="margin: 0;">Pratinjau Struk ${isZReport ? 'Z-Report' : 'X-Report'} (${ukuran}mm)</label>
            <span class="badge badge-neutral">${LEBAR_KERTAS[ukuran] || 32} kolom</span>
          </div>
          <div class="thermal-preview-stage">
            <pre class="thermal-preview-paper mono">${escapeHtml(teksStruk)}</pre>
          </div>
        </div>

        <div class="stack" style="gap: var(--sp-2);">
          ${!adalahPerangkatAndroid() ? `
            <button type="button" class="btn btn-primary btn-sm" id="btn-print-shift-usb-direct" style="width: 100%; justify-content: center; gap: 8px;">
              ${ICONS.zap}
              <span>Direct POS USB / ESC-POS (${ukuran}mm)</span>
            </button>
          ` : `
            <button type="button" class="btn btn-primary btn-sm" id="btn-print-shift-rawbt" style="width: 100%; justify-content: center; gap: 8px;">
              ${ICONS.printer}
              <span>Cetak via RawBT Printer (Android)</span>
            </button>
          `}
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-shift-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth || ICONS.printer}
              <span>Web Bluetooth</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-print-shift-browser" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.printer}
              <span>Browser / PDF</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-share-shift-wa" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.messageCircle}
              <span>Kirim WA</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-modal-cetak-shift">Tutup</button>
      </div>
    `
  });

  modal.el.querySelector('#btn-print-shift-usb-direct')?.addEventListener('click', () => {
    cetakUsbDirectShift(dataReport, ukuran);
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

  modal.el.querySelector('#btn-share-shift-wa')?.addEventListener('click', () => {
    window.open(buatTautanWhatsAppShift(dataReport), '_blank', 'noopener,noreferrer');
  });

  modal.el.querySelector('#btn-tutup-modal-cetak-shift')?.addEventListener('click', () => {
    modal.close();
  });
}

/* ========================================================================== */
/* MODUL SURAT JALAN (TANPA HARGA) & FAKTUR BESAR A5 (PROYEK / KONTRAKTOR)    */
/* ========================================================================== */

/** Helper cetak dokumen HTML via iframe tersembunyi (anti-popup blocker) */
function cetakHtmlViaIframe(htmlDoc) {
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
  doc.write(htmlDoc);
  doc.close();

  setTimeout(() => {
    printFrame.contentWindow.focus();
    printFrame.contentWindow.print();
    setTimeout(() => {
      if (printFrame.parentElement) printFrame.remove();
    }, 1500);
  }, 300);
}

/** Helper ambil profil toko untuk dokumen A5/Surat Jalan */
function ambilInfoTokoDokumen(data) {
  const cfg = store.get('pengaturan') || {};
  const tokoStore = store.get('toko') || {};
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO BANGUNAN';
  return (data && data.toko) || {
    nama: cfg.toko_nama || tokoStore.nama || namaFallback,
    alamat: cfg.toko_alamat || tokoStore.alamat || '',
    hp: cfg.toko_hp || tokoStore.hp || '',
    nota_footer: cfg.nota_footer || tokoStore.nota_footer || ''
  };
}

/**
 * Saring item untuk Surat Jalan agar sopir/kuli HANYA memuat barang yang harus dikirim (anti kirim ganda barang yang sudah dibawa duluan).
 */
function saringItemSuratJalan(items, sertakanSudahDibawa = false) {
  const normal = (items || []).map((it) => {
    const qty = Number(it.qty || 0);
    const dibawa = it.qty_dibawa !== undefined ? Math.min(qty, Math.max(0, Number(it.qty_dibawa))) : 0;
    const sisa = Math.round(Math.max(0, qty - dibawa) * 1000) / 1000;
    return { ...it, _qty: qty, _dibawa: dibawa, _sisa: sisa };
  });
  const hanyaSisa = normal.filter((it) => it._sisa > 0);
  const sudahDibawaList = normal.filter((it) => it._sisa <= 0);
  const adaSisa = hanyaSisa.length > 0;
  return {
    daftarTampil: (!sertakanSudahDibawa && adaSisa) ? hanyaSisa : normal,
    hanyaSisa,
    sudahDibawaList,
    adaSisa,
    adaCampuran: adaSisa && (sudahDibawaList.length > 0 || hanyaSisa.some((it) => it._dibawa > 0))
  };
}

/**
 * Susun teks Surat Jalan Thermal 58mm/80mm (100% TANPA HARGA — khusus sopir/kuli & penerima)
 * @param {Object} data
 * @param {'58'|'80'} [ukuran='58']
 * @param {Object} [opsi={}] { sopir, noPlat, catatan, sertakanSudahDibawa }
 */
export function susunTeksSuratJalan(data, ukuran = '58', opsi = {}) {
  const lebar = LEBAR_KERTAS[ukuran] || 32;
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pel = data.pelanggan || null;
  const toko = ambilInfoTokoDokumen(data);
  const noSj = String(pj.no_nota || '-').replace(/^INV-/, 'SJ-');
  const hasilSaring = saringItemSuratJalan(items, !!opsi.sertakanSudahDibawa);
  const daftarMuat = hasilSaring.daftarTampil;

  const baris = [];
  baris.push(formatTengah((toko.nama || 'TOKO').toUpperCase(), lebar));
  if (toko.alamat) {
    toko.alamat.split('\n').forEach((al) => baris.push(formatTengah(al, lebar)));
  }
  if (toko.hp) baris.push(formatTengah('Telp/WA: ' + toko.hp, lebar));
  baris.push(buatGaris(lebar, '='));
  baris.push(formatTengah('SURAT JALAN BARANG', lebar));
  baris.push(formatTengah('(TANPA HARGA / CEK MUATAN)', lebar));
  baris.push(buatGaris(lebar, '-'));

  baris.push(formatDuaKolom('No. SJ', noSj, lebar));
  baris.push(formatDuaKolom('Ref Nota', pj.no_nota || '-', lebar));
  baris.push(formatDuaKolom('Tanggal', formatTanggal(pj.tanggal || new Date(), true), lebar));
  baris.push(formatDuaKolom('Penerima', (pel ? pel.nama : (pj.pelanggan_nama || 'Umum')), lebar));
  const hpPel = (pel && pel.hp) || pj.pelanggan_hp || '';
  if (hpPel) baris.push(formatDuaKolom('HP/WA', hpPel, lebar));
  const alamat = pj.alamat_kirim || (pel && pel.alamat) || '';
  if (alamat) {
    baris.push('Alamat Kirim:');
    baris.push('  ' + alamat);
  }
  if (opsi.sopir) baris.push(formatDuaKolom('Sopir', opsi.sopir, lebar));
  if (opsi.noPlat) baris.push(formatDuaKolom('Armada', opsi.noPlat, lebar));
  baris.push(buatGaris(lebar, '-'));

  let totalUnitKirim = 0;
  daftarMuat.forEach((it, idx) => {
    const qtyMuat = hasilSaring.adaSisa ? it._sisa : it._qty;
    totalUnitKirim += qtyMuat;
    baris.push(`${idx + 1}. ${it.nama || 'Barang'}`);
    if (hasilSaring.adaSisa && it._sisa <= 0) {
      baris.push(formatDuaKolom(`   (Sudah dibawa pembeli)`, `${formatQty(it._qty)} ${it.satuan || ''}`, lebar));
    } else if (it._dibawa > 0 && it._sisa > 0) {
      baris.push(formatDuaKolom(`   [ ] KIRIM: ${formatQty(it._sisa)} ${it.satuan || ''}`, `(Bawa:${formatQty(it._dibawa)})`, lebar));
    } else {
      baris.push(formatDuaKolom(`   [ ] KIRIM: ${formatQty(qtyMuat)} ${it.satuan || ''}`, 'OK', lebar));
    }
  });

  baris.push(buatGaris(lebar, '-'));
  baris.push(formatDuaKolom('Total Jenis Muat', `${daftarMuat.length} Jenis`, lebar));
  baris.push(formatDuaKolom('Total Unit Kirim', formatQty(totalUnitKirim), lebar));
  if (!opsi.sertakanSudahDibawa && hasilSaring.sudahDibawaList.length > 0 && hasilSaring.adaSisa) {
    baris.push(buatGaris(lebar, '.'));
    baris.push(`Info: ${hasilSaring.sudahDibawaList.length} item lain di nota ini sudah dibawa pembeli.`);
  }
  if (opsi.catatan || pj.catatan) {
    baris.push(buatGaris(lebar, '.'));
    baris.push('Catatan: ' + String(opsi.catatan || pj.catatan));
  }
  baris.push(buatGaris(lebar, '='));
  baris.push(formatTengah('Barang diterima dlm kondisi baik', lebar));
  baris.push('');
  baris.push(formatDuaKolom(' ( Pengirim )', '( Penerima ) ', lebar));
  baris.push('');
  baris.push('');
  baris.push(formatDuaKolom('  ..........', '..........  ', lebar));
  baris.push(buatGaris(lebar, '-'));

  return baris.join('\n');
}

/** Buat tautan WhatsApp Surat Jalan tanpa harga (siap kirim ke sopir / kuli / penerima proyek) */
export function buatTautanWhatsAppSuratJalan(data, opsi = {}) {
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pel = data.pelanggan || null;
  const toko = ambilInfoTokoDokumen(data);
  const noSj = String(pj.no_nota || '-').replace(/^INV-/, 'SJ-');
  const alamat = pj.alamat_kirim || (pel && pel.alamat) || '-';
  const hpPel = (pel && pel.hp) || pj.pelanggan_hp || '';
  const hasilSaring = saringItemSuratJalan(items, !!opsi.sertakanSudahDibawa);
  const daftarMuat = hasilSaring.daftarTampil;

  let pesan = `*SURAT JALAN - ${(toko.nama || 'TOKO').toUpperCase()}*\n`;
  pesan += `No. SJ   : *${noSj}* (Ref: ${pj.no_nota || '-'})\n`;
  pesan += `Tanggal  : ${formatTanggal(pj.tanggal || new Date(), true)}\n`;
  pesan += `Penerima : *${pel ? pel.nama : (pj.pelanggan_nama || 'Pelanggan Umum')}*${hpPel ? ` (${hpPel})` : ''}\n`;
  pesan += `Alamat   : ${alamat}\n`;
  if (opsi.sopir) pesan += `Sopir    : ${opsi.sopir}${opsi.noPlat ? ` (${opsi.noPlat})` : ''}\n`;
  pesan += `--------------------------------\n`;
  pesan += `*DAFTAR BARANG DIKIRIM:*\n`;
  daftarMuat.forEach((it, idx) => {
    const qtyMuat = hasilSaring.adaSisa ? it._sisa : it._qty;
    if (hasilSaring.adaSisa && it._sisa <= 0) {
      pesan += `${idx + 1}. ${it.nama} — _Sudah dibawa pembeli (${formatQty(it._qty)} ${it.satuan || ''})_\n`;
    } else if (it._dibawa > 0 && it._sisa > 0) {
      pesan += `${idx + 1}. ${it.nama} — *KIRIM ${formatQty(it._sisa)} ${it.satuan || ''}* (dari total ${formatQty(it._qty)}, sudah dibawa ${formatQty(it._dibawa)})\n`;
    } else {
      pesan += `${idx + 1}. ${it.nama} — *${formatQty(qtyMuat)} ${it.satuan || ''}*\n`;
    }
  });
  pesan += `--------------------------------\n`;
  if (!opsi.sertakanSudahDibawa && hasilSaring.sudahDibawaList.length > 0 && hasilSaring.adaSisa) {
    pesan += `_Catatan: ${hasilSaring.sudahDibawaList.length} barang lain pada nota ini sudah dibawa langsung oleh pembeli (tidak perlu dimuat)._\n`;
  }
  if (opsi.catatan || pj.catatan) {
    pesan += `Catatan: ${opsi.catatan || pj.catatan}\n`;
  }
  pesan += `Mohon dicek jumlah & kondisi barang saat diterima.`;
  return `https://wa.me/?text=${encodeURIComponent(pesan)}`;
}

/** Susun HTML dokumen resmi Surat Jalan A5 Landscape (100% Tanpa Harga) */
function buatHtmlSuratJalanA5(data, opsi = {}) {
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pel = data.pelanggan || null;
  const toko = ambilInfoTokoDokumen(data);
  const noSj = String(pj.no_nota || '-').replace(/^INV-/, 'SJ-');
  const alamat = pj.alamat_kirim || (pel && pel.alamat) || '-';
  const hpPel = (pel && pel.hp) || pj.pelanggan_hp || '-';
  const hasilSaring = saringItemSuratJalan(items, !!opsi.sertakanSudahDibawa);
  const daftarMuat = hasilSaring.daftarTampil;
  const tampilKolomBawa = hasilSaring.adaCampuran;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Surat Jalan ${escapeHtml(noSj)}</title>
  <style>
    @page { size: A5 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 0; font-size: 11px; line-height: 1.4; }
    .doc { width: 100%; max-width: 194mm; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
    .toko-nama { font-size: 16px; font-weight: 800; letter-spacing: 0.3px; }
    .toko-sub { font-size: 10px; color: #374151; max-width: 95mm; white-space: pre-line; }
    .doc-badge { text-align: right; }
    .doc-title { font-size: 17px; font-weight: 800; letter-spacing: 1px; border: 2px solid #111827; padding: 3px 10px; display: inline-block; }
    .doc-no { font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; margin-top: 4px; }
    .meta-grid { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; font-size: 10.5px; }
    .meta-box { flex: 1; border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 8px; }
    .meta-row { display: flex; gap: 6px; margin-bottom: 2px; }
    .meta-lbl { width: 72px; color: #4b5563; flex-shrink: 0; }
    .meta-val { font-weight: 600; flex: 1; }
    table.keep-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10.5px; }
    table.keep-table th { background: #f3f4f6; border: 1px solid #374151; padding: 5px 6px; text-align: left; font-weight: 700; }
    table.keep-table td { border: 1px solid #9ca3af; padding: 5px 6px; vertical-align: top; }
    .c { text-align: center; }
    .r { text-align: right; font-family: 'Courier New', monospace; font-weight: 700; white-space: nowrap; }
    .note-box { border: 1px dashed #6b7280; padding: 5px 8px; font-size: 10px; margin-bottom: 10px; }
    .ttd-grid { display: flex; justify-content: space-between; gap: 16px; margin-top: 12px; text-align: center; font-size: 10.5px; }
    .ttd-col { flex: 1; }
    .ttd-space { height: 42px; }
    .ttd-line { border-top: 1px solid #111827; padding-top: 3px; font-weight: 600; }
    .foot { margin-top: 10px; font-size: 9px; color: #4b5563; border-top: 1px solid #d1d5db; padding-top: 4px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="hdr">
      <div>
        <div class="toko-nama">${escapeHtml((toko.nama || 'TOKO BANGUNAN').toUpperCase())}</div>
        ${toko.alamat ? `<div class="toko-sub">${escapeHtml(toko.alamat)}</div>` : ''}
        ${toko.hp ? `<div class="toko-sub">Telp / WA: ${escapeHtml(toko.hp)}</div>` : ''}
      </div>
      <div class="doc-badge">
        <div class="doc-title">SURAT JALAN</div>
        <div class="doc-no">${escapeHtml(noSj)}</div>
        <div style="font-size: 9.5px; color: #4b5563;">Ref. Nota: ${escapeHtml(pj.no_nota || '-')}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-box">
        <div class="meta-row"><span class="meta-lbl">Kepada Yth</span><span class="meta-val">${escapeHtml(pel ? pel.nama : (pj.pelanggan_nama || 'Pelanggan Umum'))}</span></div>
        <div class="meta-row"><span class="meta-lbl">Telp / WA</span><span class="meta-val">${escapeHtml(hpPel)}</span></div>
        <div class="meta-row"><span class="meta-lbl">Alamat Kirim</span><span class="meta-val">${escapeHtml(alamat)}</span></div>
      </div>
      <div class="meta-box">
        <div class="meta-row"><span class="meta-lbl">Tanggal</span><span class="meta-val">${escapeHtml(formatTanggal(pj.tanggal || new Date(), true))}</span></div>
        <div class="meta-row"><span class="meta-lbl">Sopir / Kurir</span><span class="meta-val">${escapeHtml(opsi.sopir || '...........................')}</span></div>
        <div class="meta-row"><span class="meta-lbl">Armada / Plat</span><span class="meta-val">${escapeHtml(opsi.noPlat || '...........................')}</span></div>
      </div>
    </div>

    <table class="keep-table">
      <thead>
        <tr>
          <th class="c" style="width: 28px;">No</th>
          <th>Nama Barang / Material</th>
          <th class="c" style="width: 60px;">Satuan</th>
          ${tampilKolomBawa ? `<th class="r" style="width: 62px;">Pesan</th><th class="r" style="width: 66px;">Dibawa</th>` : ''}
          <th class="r" style="width: 72px;">Qty Kirim</th>
          <th class="c" style="width: 55px;">Cek</th>
        </tr>
      </thead>
      <tbody>
        ${daftarMuat.map((it, i) => {
    const qtyMuat = hasilSaring.adaSisa ? it._sisa : it._qty;
    const sudahBawaPenuh = hasilSaring.adaSisa && it._sisa <= 0;
    return `
            <tr style="${sudahBawaPenuh ? 'color: #6b7280;' : ''}">
              <td class="c">${i + 1}</td>
              <td><strong>${escapeHtml(it.nama || 'Barang')}</strong>${sudahBawaPenuh ? ' <em>(Sudah dibawa pembeli)</em>' : ''}</td>
              <td class="c">${escapeHtml(it.satuan || '-')}</td>
              ${tampilKolomBawa ? `<td class="r">${formatQty(it._qty)}</td><td class="r">${formatQty(it._dibawa)}</td>` : ''}
              <td class="r">${sudahBawaPenuh ? '0' : formatQty(qtyMuat)}</td>
              <td class="c">${sudahBawaPenuh ? 'OK' : '[ &nbsp;&nbsp; ]'}</td>
            </tr>
          `;
  }).join('')}
      </tbody>
    </table>

    ${(!opsi.sertakanSudahDibawa && hasilSaring.sudahDibawaList.length > 0 && hasilSaring.adaSisa) ? `
      <div class="note-box"><strong>Info Muatan:</strong> ${hasilSaring.sudahDibawaList.length} jenis barang lain pada nota ${escapeHtml(pj.no_nota || '')} sudah dibawa langsung oleh pembeli dan tidak termasuk muatan sopir.</div>
    ` : ''}

    ${(opsi.catatan || pj.catatan) ? `<div class="note-box"><strong>Catatan Pengiriman:</strong> ${escapeHtml(opsi.catatan || pj.catatan)}</div>` : ''}

    <div class="ttd-grid">
      <div class="ttd-col">
        <div>Hormat Kami (Gudang / Admin)</div>
        <div class="ttd-space"></div>
        <div class="ttd-line">( .................................... )</div>
      </div>
      <div class="ttd-col">
        <div>Pengirim / Sopir</div>
        <div class="ttd-space"></div>
        <div class="ttd-line">( ${opsi.sopir ? escapeHtml(opsi.sopir) : '....................................'} )</div>
      </div>
      <div class="ttd-col">
        <div>Penerima Barang</div>
        <div class="ttd-space"></div>
        <div class="ttd-line">( Nama Terang &amp; Stempel )</div>
      </div>
    </div>

    <div class="foot">
      <span>Mohon periksa jumlah &amp; kondisi barang saat diterima. Barang yang sudah ditandatangani dianggap lengkap &amp; baik.</span>
      <span>Dokumen Pengiriman (Tanpa Harga)</span>
    </div>
  </div>
</body>
</html>`;
}

/** Cetak Surat Jalan Thermal Web (58/80mm Presisi 203 DPI + Auto-Height) */
export function cetakSuratJalanThermalBrowser(dataStruk, ukuran = '58', opsi = {}) {
  const noSj = String(dataStruk?.penjualan?.no_nota || '-').replace(/^INV-/, 'SJ-');
  const htmlBody = buatHtmlThermalSuratJalan(dataStruk, opsi);
  bukaModalPratinjauThermalWeb({
    judulModal: `Surat Jalan Thermal — ${noSj}`,
    judulDokumen: `Surat Jalan ${noSj}`,
    bodyHtml: htmlBody,
    ukuranAwal: ukuran,
    ambilTeksEscPos: (uk) => susunTeksSuratJalan(dataStruk, uk, opsi)
  });
}

/** Cetak langsung Surat Jalan A5 (Printer Biasa / PDF) */
export function cetakSuratJalanA5(dataStruk, opsi = {}) {
  const htmlDoc = buatHtmlSuratJalanA5(dataStruk, opsi);
  cetakHtmlViaIframe(htmlDoc);
}

/** Dialog Cetak Surat Jalan (Isi Sopir/Armada opsional -> A5 / Thermal RawBT / Bluetooth / WA Sopir) */
export function bukaModalCetakSuratJalan(dataStruk) {
  const cfg = store.get('pengaturan') || {};
  const ukuran = (cfg.printer_ukuran === '80' || cfg.printer_lebar === '80') ? '80' : '58';
  const pj = dataStruk.penjualan || {};
  const pel = dataStruk.pelanggan || null;
  const items = dataStruk.items || [];
  const noSj = String(pj.no_nota || '-').replace(/^INV-/, 'SJ-');
  const infoSaring = saringItemSuratJalan(items, false);
  const jmlKirimJenis = infoSaring.adaSisa ? infoSaring.hanyaSisa.length : items.length;
  const jmlKirimUnit = infoSaring.adaSisa
    ? infoSaring.hanyaSisa.reduce((s, x) => s + x._sisa, 0)
    : items.reduce((s, x) => s + Number(x.qty || 0), 0);

  const modal = showModal({
    title: `Surat Jalan — ${noSj}`,
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="alert alert-info" style="font-size: var(--fs-xs); margin: 0; padding: 8px 12px;">
          ${ICONS.truck}
          <div><strong>Surat Jalan Tanpa Harga</strong> — Khusus sopir, kuli muat, dan tanda terima barang di lokasi proyek.</div>
        </div>

        <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--sp-3); font-size: var(--fs-xs);">
          <div><strong>Penerima:</strong> ${escapeHtml(pel ? pel.nama : (pj.pelanggan_nama || 'Pelanggan Umum'))}</div>
          <div><strong>Alamat:</strong> ${escapeHtml(pj.alamat_kirim || (pel && pel.alamat) || '-')}</div>
          <div><strong>Muatan Dikirim:</strong> <strong style="color: var(--primary);">${jmlKirimJenis} jenis barang (${formatQty(jmlKirimUnit)} unit)</strong></div>
          ${(infoSaring.sudahDibawaList.length > 0 && infoSaring.adaSisa) ? `
            <div class="text-success" style="margin-top: 2px;"><strong>Sudah Dibawa Pembeli:</strong> ${infoSaring.sudahDibawaList.length} jenis barang (otomatis tidak ikut muatan sopir)</div>
          ` : ''}
        </div>

        ${(infoSaring.sudahDibawaList.length > 0 && infoSaring.adaSisa) ? `
          <label style="display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); cursor: pointer;">
            <input type="checkbox" id="chk-sj-sertakan-dibawa" style="width: 16px; height: 16px; accent-color: var(--primary);">
            <span>Sertakan juga barang yang sudah dibawa pembeli (sebagai info di Surat Jalan)</span>
          </label>
        ` : ''}

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-2);">
          <div>
            <label class="form-label text-xs fw-semibold" for="inp-sj-sopir">Nama Sopir / Kurir (Opsional)</label>
            <input type="text" id="inp-sj-sopir" class="input input-sm" placeholder="Contoh: Pak Budi" />
          </div>
          <div>
            <label class="form-label text-xs fw-semibold" for="inp-sj-plat">Armada / No. Plat (Opsional)</label>
            <input type="text" id="inp-sj-plat" class="input input-sm" placeholder="Contoh: Pickup L300" />
          </div>
        </div>

        <div>
          <label class="form-label text-xs fw-semibold" for="inp-sj-catatan">Catatan Untuk Sopir / Penerima (Opsional)</label>
          <input type="text" id="inp-sj-catatan" class="input input-sm" value="${escapeHtml(pj.catatan || '')}" placeholder="Contoh: Turunkan di dekat pagar proyek" />
        </div>

        <div class="stack" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-primary btn-sm" id="btn-sj-cetak-a5" style="width: 100%; justify-content: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak Surat Jalan Resmi (A5 / PDF)</span>
          </button>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            ${!adalahPerangkatAndroid() ? `
              <button type="button" class="btn btn-secondary btn-sm grow" id="btn-sj-usb-direct" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.zap}
                <span>Direct POS USB (${ukuran}mm)</span>
              </button>
            ` : `
              <button type="button" class="btn btn-secondary btn-sm grow" id="btn-sj-rawbt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                ${ICONS.smartphone}
                <span>RawBT (${ukuran}mm)</span>
              </button>
            `}
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-sj-thermal-web" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.printer}
              <span>Thermal Web (${ukuran}mm)</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-sj-bt" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.bluetooth}
              <span>Bluetooth</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm grow" id="btn-sj-wa" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              ${ICONS.messageCircle}
              <span>Kirim WA Sopir</span>
            </button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-modal-sj">Tutup</button>
      </div>
    `
  });

  const ambilOpsi = () => ({
    sopir: (modal.el.querySelector('#inp-sj-sopir')?.value || '').trim(),
    noPlat: (modal.el.querySelector('#inp-sj-plat')?.value || '').trim(),
    catatan: (modal.el.querySelector('#inp-sj-catatan')?.value || '').trim(),
    sertakanSudahDibawa: Boolean(modal.el.querySelector('#chk-sj-sertakan-dibawa')?.checked)
  });

  modal.el.querySelector('#btn-sj-cetak-a5')?.addEventListener('click', () => {
    cetakSuratJalanA5(dataStruk, ambilOpsi());
  });
  modal.el.querySelector('#btn-sj-usb-direct')?.addEventListener('click', () => {
    cetakUsbDirectSuratJalan(dataStruk, ukuran, ambilOpsi());
  });
  modal.el.querySelector('#btn-sj-thermal-web')?.addEventListener('click', () => {
    cetakSuratJalanThermalBrowser(dataStruk, ukuran, ambilOpsi());
  });
  modal.el.querySelector('#btn-sj-rawbt')?.addEventListener('click', () => {
    const teks = susunTeksSuratJalan(dataStruk, ukuran, ambilOpsi());
    if (!adalahPerangkatAndroid()) {
      showToast('RawBT khusus Android. Membuka cetak Thermal Web presisi...', 'info', 2500);
      cetakSuratJalanThermalBrowser(dataStruk, ukuran, ambilOpsi());
      return;
    }
    kirimEscPosKeRawBT(teksKeEscPos(teks), 'surat jalan');
  });
  modal.el.querySelector('#btn-sj-bt')?.addEventListener('click', async () => {
    const teks = susunTeksSuratJalan(dataStruk, ukuran, ambilOpsi());
    await kirimBytesKeBluetooth(teksKeEscPos(teks));
  });
  modal.el.querySelector('#btn-sj-wa')?.addEventListener('click', () => {
    window.open(buatTautanWhatsAppSuratJalan(dataStruk, ambilOpsi()), '_blank', 'noopener,noreferrer');
  });
  modal.el.querySelector('#btn-tutup-modal-sj')?.addEventListener('click', () => modal.close());
}

/** Susun HTML Faktur / Nota Besar Resmi ukuran A5 Landscape (untuk Proyek, Kontraktor, & Instansi) */
function buatHtmlFakturA5(data) {
  const pj = data.penjualan || {};
  const items = data.items || [];
  const pembayaran = Array.isArray(data.pembayaran) ? data.pembayaran : [];
  const pel = data.pelanggan || null;
  const kasir = data.kasir || { nama: pj.kasir_nama || 'Kasir' };
  const toko = ambilInfoTokoDokumen(data);

  const ringBayar = hitungRingkasanBayarDokumen(data);
  const statusBayar = String(pj.status_bayar || 'lunas').toLowerCase();
  const labelStatus = ringBayar.statusRetur === 'penuh'
    ? 'DIRETUR PENUH'
    : (statusBayar === 'lunas' ? 'LUNAS' : (statusBayar === 'sebagian' ? 'BAYAR SEBAGIAN' : 'BELUM LUNAS / TEMPO'));
  const subtotal = Number(pj.subtotal || items.reduce((s, x) => s + Number(x.subtotal || 0), 0));
  const diskon = Number(pj.diskon || 0);
  const pajak = Number(pj.pajak || 0);
  const ongkir = Number(pj.ongkir || 0);
  const total = ringBayar.total;
  const bayar = ringBayar.bayarRiil;
  const kembalian = ringBayar.kembalian;
  const sisaTagihan = ringBayar.sisaTagihan;
  const pakaiDeposit = ringBayar.pakaiDeposit;

  const bagianMetode = [];
  if (pembayaran.length > 0) {
    pembayaran.forEach((b) => {
      const mUp = String(b.metode || 'tunai').toUpperCase();
      bagianMetode.push(`${mUp === 'DEPOSIT' ? 'SALDO TITIPAN' : mUp} (${formatRupiah(b.jumlah)})`);
    });
  } else {
    bagianMetode.push(String(pj.metode_bayar || 'TUNAI').toUpperCase());
  }
  const labelMetode = bagianMetode.join(', ');
  const labelCicilan = ringBayar.cicilan.length > 0
    ? ringBayar.cicilan.map((c, idx) => `Cicilan ${idx + 1}: ${String(c.metode || 'tunai').toUpperCase()} ${formatRupiah(c.jumlah)} (${formatTanggal(c.tanggal)})`).join(' • ')
    : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Faktur ${escapeHtml(pj.no_nota || '')}</title>
  <style>
    @page { size: A5 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.38; }
    .doc { width: 100%; max-width: 194mm; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 7px; margin-bottom: 8px; }
    .toko-nama { font-size: 16px; font-weight: 800; }
    .toko-sub { font-size: 9.5px; color: #374151; max-width: 95mm; white-space: pre-line; }
    .faktur-hdr { text-align: right; }
    .faktur-title { font-size: 15px; font-weight: 800; letter-spacing: 0.6px; }
    .faktur-no { font-family: 'Courier New', monospace; font-weight: 700; font-size: 11px; margin-top: 2px; }
    .st-badge { display: inline-block; margin-top: 3px; padding: 2px 8px; border: 1.5px solid #111827; font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; }
    .meta-row-wrap { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 10px; }
    .meta-col { flex: 1; }
    .meta-item { display: flex; gap: 6px; margin-bottom: 2px; }
    .meta-lbl { width: 68px; color: #4b5563; flex-shrink: 0; }
    .meta-val { font-weight: 600; flex: 1; }
    table.keep-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
    table.keep-table th { background: #f3f4f6; border: 1px solid #374151; padding: 4px 6px; text-align: left; font-weight: 700; }
    table.keep-table td { border: 1px solid #9ca3af; padding: 4px 6px; vertical-align: top; }
    .c { text-align: center; }
    .r { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
    .bottom-wrap { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .left-block { flex: 1.15; font-size: 9.5px; }
    .right-block { flex: 1; min-width: 62mm; }
    .sum-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; font-size: 10px; white-space: nowrap; }
    .sum-total { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; margin-top: 3px; border-top: 2px solid #111827; border-bottom: 2px solid #111827; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .ttd-wrap { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; text-align: center; }
    .ttd-box { flex: 1; }
    .ttd-sp { height: 36px; }
    .ttd-ln { border-top: 1px solid #111827; padding-top: 2px; font-weight: 600; }
    .foot-note { margin-top: 6px; color: #4b5563; font-size: 9px; white-space: pre-line; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="hdr">
      <div>
        <div class="toko-nama">${escapeHtml((toko.nama || 'TOKO BANGUNAN').toUpperCase())}</div>
        ${toko.alamat ? `<div class="toko-sub">${escapeHtml(toko.alamat)}</div>` : ''}
        ${toko.hp ? `<div class="toko-sub">Telp / WA: ${escapeHtml(toko.hp)}</div>` : ''}
      </div>
      <div class="faktur-hdr">
        <div class="faktur-title">FAKTUR PENJUALAN</div>
        <div class="faktur-no">${escapeHtml(pj.no_nota || '-')}</div>
        <div class="st-badge">${escapeHtml(labelStatus)}</div>
      </div>
    </div>

    <div class="meta-row-wrap">
      <div class="meta-col">
        <div class="meta-item"><span class="meta-lbl">Pelanggan</span><span class="meta-val">${escapeHtml(pel ? pel.nama : (pj.pelanggan_nama || 'Pelanggan Umum'))}</span></div>
        ${((pel && pel.hp) || pj.pelanggan_hp) ? `<div class="meta-item"><span class="meta-lbl">Telp / WA</span><span class="meta-val">${escapeHtml((pel && pel.hp) || pj.pelanggan_hp)}</span></div>` : ''}
        ${(pj.alamat_kirim || (pel && pel.alamat)) ? `<div class="meta-item"><span class="meta-lbl">Alamat</span><span class="meta-val">${escapeHtml(pj.alamat_kirim || (pel && pel.alamat))}</span></div>` : ''}
      </div>
      <div class="meta-col">
        <div class="meta-item"><span class="meta-lbl">Tanggal</span><span class="meta-val">${escapeHtml(formatTanggal(pj.tanggal || new Date(), true))}</span></div>
        <div class="meta-item"><span class="meta-lbl">Kasir</span><span class="meta-val">${escapeHtml(kasir.nama || 'Kasir')}</span></div>
        <div class="meta-item"><span class="meta-lbl">Pengiriman</span><span class="meta-val">${pj.pengiriman === 'dikirim' ? 'Dikirim Toko' : 'Ambil di Toko'}</span></div>
      </div>
    </div>

    <table class="keep-table">
      <thead>
        <tr>
          <th class="c" style="width: 26px;">No</th>
          <th>Nama Barang</th>
          <th class="r" style="width: 52px;">Qty</th>
          <th class="c" style="width: 55px;">Satuan</th>
          <th class="r" style="width: 82px;">Harga</th>
          <th class="r" style="width: 65px;">Diskon</th>
          <th class="r" style="width: 90px;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, idx) => {
    let ketKirimHtml = '';
    if (pj.pengiriman === 'dikirim' && it.qty_dibawa !== undefined) {
      const qTot = Number(it.qty || 0);
      const qBawa = Math.min(qTot, Math.max(0, Number(it.qty_dibawa)));
      const qSisa = Math.round(Math.max(0, qTot - qBawa) * 1000) / 1000;
      if (qSisa <= 0) ketKirimHtml = `<div style="font-size: 8.5px; color: #374151;">[Sudah Dibawa Pembeli]</div>`;
      else if (qBawa <= 0) ketKirimHtml = `<div style="font-size: 8.5px; color: #374151;">[Dikirim Toko]</div>`;
      else ketKirimHtml = `<div style="font-size: 8.5px; color: #374151;">[Dibawa: ${formatQty(qBawa)}, Kirim: ${formatQty(qSisa)}]</div>`;
    }
    return `
          <tr>
            <td class="c">${idx + 1}</td>
            <td><strong>${escapeHtml(it.nama || 'Barang')}</strong>${ketKirimHtml}</td>
            <td class="r">${formatQty(it.qty || 0)}</td>
            <td class="c">${escapeHtml(it.satuan || '-')}</td>
            <td class="r">${formatRupiah(it.harga || 0)}</td>
            <td class="r">${Number(it.diskon || 0) > 0 ? '-' + formatRupiah(it.diskon) : '-'}</td>
            <td class="r"><strong>${formatRupiah(it.subtotal || 0)}</strong></td>
          </tr>
        `;
  }).join('')}
      </tbody>
    </table>

    <div class="bottom-wrap">
      <div class="left-block">
        <div><strong>Pembayaran:</strong> ${escapeHtml(labelMetode)}</div>
        ${labelCicilan ? `<div><strong>Riwayat Cicilan:</strong> ${escapeHtml(labelCicilan)}</div>` : ''}
        ${sisaTagihan > 0 && ringBayar.jatuhTempo ? `<div><strong>Jatuh Tempo:</strong> ${escapeHtml(formatTanggal(ringBayar.jatuhTempo))}</div>` : ''}
        ${pakaiDeposit && pel && pel.saldo_deposit !== undefined ? `<div><strong>Sisa Saldo Titipan:</strong> ${formatRupiah(pel.saldo_deposit)}</div>` : ''}
        ${pj.catatan ? `<div><strong>Catatan:</strong> ${escapeHtml(pj.catatan)}</div>` : ''}
        <div class="ttd-wrap">
          <div class="ttd-box">
            <div>Penerima / Pembeli</div>
            <div class="ttd-sp"></div>
            <div class="ttd-ln">( ........................... )</div>
          </div>
          <div class="ttd-box">
            <div>Hormat Kami</div>
            <div class="ttd-sp"></div>
            <div class="ttd-ln">( ${escapeHtml(toko.nama || 'Toko')} )</div>
          </div>
        </div>
        ${toko.nota_footer ? `<div class="foot-note">${escapeHtml(toko.nota_footer)}</div>` : ''}
      </div>

      <div class="right-block">
        <div class="sum-row"><span>Subtotal</span><span class="r">${formatRupiah(subtotal)}</span></div>
        ${diskon > 0 ? `<div class="sum-row"><span>Total Diskon</span><span class="r">-${formatRupiah(diskon)}</span></div>` : ''}
        ${pajak > 0 ? `<div class="sum-row"><span>PPN / Pajak</span><span class="r">${formatRupiah(pajak)}</span></div>` : ''}
        ${ongkir > 0 ? `<div class="sum-row"><span>Ongkos Kirim</span><span class="r">${formatRupiah(ongkir)}</span></div>` : ''}
        <div class="sum-total"><span>GRAND TOTAL</span><span class="r">${formatRupiah(total)}</span></div>
        ${ringBayar.totalRetur > 0 ? `<div class="sum-row"><span>Retur Disetujui</span><span class="r">-${formatRupiah(ringBayar.totalRetur)}</span></div><div class="sum-row" style="font-weight:700;"><span>TOTAL BERSIH</span><span class="r">${formatRupiah(ringBayar.totalBersih)}</span></div>` : ''}
        ${bayar > 0 ? `<div class="sum-row"><span>${sisaTagihan > 0 || ringBayar.cicilan.length > 0 ? 'Dibayar / Cicilan' : 'Dibayar'}</span><span class="r">${formatRupiah(bayar)}</span></div>` : ''}
        ${sisaTagihan > 0 ? `<div class="sum-row" style="font-weight: 800; border-top: 1px dashed #111827; padding-top: 3px; margin-top: 2px;"><span>SISA TAGIHAN</span><span class="r">${formatRupiah(sisaTagihan)}</span></div>` : ''}
        ${kembalian > 0 ? `<div class="sum-row"><span>Kembalian</span><span class="r">${formatRupiah(kembalian)}</span></div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Helper pasang pratinjau dokumen A5 Landscape dengan skala otomatis proporsional (bebas kepotong di layar HP) */
function pasangPreviewA5Proporsional(modalEl, viewportSelector, iframeSelector, htmlDoc) {
  const viewport = modalEl.querySelector(viewportSelector);
  const iframe = modalEl.querySelector(iframeSelector);
  if (!viewport || !iframe) return;

  const baseW = 760;
  const baseH = 540;
  iframe.srcdoc = htmlDoc;

  const sesuaikanSkala = () => {
    const availW = viewport.clientWidth || 320;
    const scale = Math.min(1, availW / baseW);
    iframe.style.width = `${baseW}px`;
    iframe.style.height = `${baseH}px`;
    iframe.style.transform = `scale(${scale})`;
    viewport.style.height = `${Math.ceil(baseH * scale)}px`;
  };

  requestAnimationFrame(sesuaikanSkala);
  setTimeout(sesuaikanSkala, 120);
}

/** Buka pratinjau & cetak Faktur Besar A5 (Proyek / Kontraktor / PDF) */
export function cetakFakturA5(dataStruk) {
  const htmlDoc = buatHtmlFakturA5(dataStruk);
  const pj = dataStruk.penjualan || {};

  const modal = showModal({
    title: `Faktur Besar A5 — ${pj.no_nota || ''}`,
    size: 'lg',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="alert alert-info" style="font-size: var(--fs-xs); margin: 0; padding: 8px 12px;">
          ${ICONS.clipboard}
          <div>Format <strong>Faktur Resmi A5 Landscape</strong> siap dicetak di printer kantor (Inkjet/Laser/Dot-Matrix) atau disimpan ke PDF.</div>
        </div>
        <div class="a5-preview-stage">
          <div class="a5-preview-viewport" id="vp-preview-faktur-a5">
            <iframe id="iframe-preview-faktur-a5" title="Pratinjau Faktur A5"></iframe>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: space-between; align-items: center; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-faktur-a5">Tutup</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-print-faktur-a5-now" style="flex: 1; max-width: 240px; justify-content: center; gap: 6px;">
          ${ICONS.printer}
          <span>Cetak / Simpan PDF (A5)</span>
        </button>
      </div>
    `
  });

  pasangPreviewA5Proporsional(modal.el, '#vp-preview-faktur-a5', '#iframe-preview-faktur-a5', htmlDoc);

  modal.el.querySelector('#btn-tutup-faktur-a5')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-print-faktur-a5-now')?.addEventListener('click', () => {
    cetakHtmlViaIframe(htmlDoc);
  });
}

/* ========================================================================== */
/* MODUL PENAWARAN HARGA / ESTIMASI RAB (A5 LANDSCAPE & WHATSAPP)             */
/* ========================================================================== */

/** Buat tautan WhatsApp rincian Penawaran Harga / Estimasi RAB ke pelanggan / mandor */
export function buatTautanWhatsAppPenawaran(rab, nomorHp = '') {
  const toko = ambilInfoTokoDokumen(rab);
  const items = Array.isArray(rab.items) ? rab.items : (Array.isArray(rab.items_json) ? rab.items_json : []);
  const berlakuTgl = rab.berlaku_sampai ? formatTanggal(rab.berlaku_sampai) : '-';

  let pesan = `*PENAWARAN HARGA / ESTIMASI RAB*\n`;
  pesan += `*${(toko.nama || 'TOKO BANGUNAN').toUpperCase()}*\n`;
  pesan += `No. RAB  : *${rab.no_penawaran || '-'}*\n`;
  if (rab.judul_proyek) pesan += `Proyek   : *${rab.judul_proyek}*\n`;
  pesan += `Kepada   : ${rab.pelanggan_nama || 'Bpk/Ibu Pelanggan'}\n`;
  pesan += `Tanggal  : ${formatTanggal(rab.tanggal || new Date())}\n`;
  pesan += `Berlaku  : s/d ${berlakuTgl}\n`;
  pesan += `--------------------------------\n`;

  items.forEach((it, idx) => {
    pesan += `${idx + 1}. ${it.nama}\n`;
    pesan += `   ${formatQty(it.qty)} ${it.satuan || ''} x ${formatRupiah(it.harga)} = *${formatRupiah(it.subtotal)}*\n`;
  });

  pesan += `--------------------------------\n`;
  if (Number(rab.diskon || 0) > 0) pesan += `Diskon       : -${formatRupiah(rab.diskon)}\n`;
  if (Number(rab.ongkir || 0) > 0) pesan += `Est. Ongkir  : ${formatRupiah(rab.ongkir)}\n`;
  pesan += `*ESTIMASI TOTAL : ${formatRupiah(rab.total || 0)}*\n`;
  if (rab.catatan) pesan += `\nCatatan: ${rab.catatan}\n`;
  pesan += `\n_Harga berlaku s/d ${berlakuTgl} dan dapat berubah sewaktu-waktu. Apabila setuju, silakan konfirmasi agar segera kami proses._`;
  if (toko.hp) pesan += `\nInfo & Order: ${toko.hp}`;

  let hpBersih = String(nomorHp || rab.pelanggan_hp || '').replace(/[^0-9]/g, '');
  if (hpBersih.startsWith('0')) hpBersih = '62' + hpBersih.substring(1);
  const encoded = encodeURIComponent(pesan);
  return hpBersih ? `https://wa.me/${hpBersih}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/** Susun HTML Dokumen Penawaran Harga / Estimasi RAB ukuran A5 Landscape */
function buatHtmlPenawaranA5(rab) {
  const toko = ambilInfoTokoDokumen(rab);
  const items = Array.isArray(rab.items) ? rab.items : (Array.isArray(rab.items_json) ? rab.items_json : []);
  const subtotal = Number(rab.subtotal || items.reduce((s, x) => s + Number(x.subtotal || 0), 0));
  const diskon = Number(rab.diskon || 0);
  const ongkir = Number(rab.ongkir || 0);
  const total = Number(rab.total || 0);
  const berlakuTgl = rab.berlaku_sampai ? formatTanggal(rab.berlaku_sampai) : '-';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Penawaran Harga ${escapeHtml(rab.no_penawaran || '')}</title>
  <style>
    @page { size: A5 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.38; }
    .doc { width: 100%; max-width: 194mm; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 7px; margin-bottom: 8px; }
    .toko-nama { font-size: 16px; font-weight: 800; }
    .toko-sub { font-size: 9.5px; color: #374151; max-width: 95mm; white-space: pre-line; }
    .rab-hdr { text-align: right; }
    .rab-title { font-size: 15px; font-weight: 800; letter-spacing: 0.6px; }
    .rab-no { font-family: 'Courier New', monospace; font-weight: 700; font-size: 11px; margin-top: 2px; }
    .rab-badge { display: inline-block; margin-top: 3px; padding: 2px 8px; border: 1.5px solid #111827; font-size: 9px; font-weight: 800; }
    .meta-row-wrap { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 10px; }
    .meta-col { flex: 1; }
    .meta-item { display: flex; gap: 6px; margin-bottom: 2px; }
    .meta-lbl { width: 76px; color: #4b5563; flex-shrink: 0; }
    .meta-val { font-weight: 600; flex: 1; }
    table.keep-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
    table.keep-table th { background: #f3f4f6; border: 1px solid #374151; padding: 4px 6px; text-align: left; font-weight: 700; }
    table.keep-table td { border: 1px solid #9ca3af; padding: 4px 6px; vertical-align: top; }
    .c { text-align: center; }
    .r { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
    .bottom-wrap { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .left-block { flex: 1.2; font-size: 9.5px; }
    .right-block { flex: 1; min-width: 62mm; }
    .sum-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; font-size: 10px; white-space: nowrap; }
    .sum-total { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; margin-top: 3px; border-top: 2px solid #111827; border-bottom: 2px solid #111827; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .ttd-wrap { display: flex; justify-content: flex-start; gap: 24px; margin-top: 12px; text-align: center; }
    .ttd-box { width: 42mm; }
    .ttd-sp { height: 34px; }
    .ttd-ln { border-top: 1px solid #111827; padding-top: 2px; font-weight: 600; }
    .syarat { margin-top: 6px; font-size: 9px; color: #4b5563; border-left: 2px solid #9ca3af; padding-left: 6px; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="hdr">
      <div>
        <div class="toko-nama">${escapeHtml((toko.nama || 'TOKO BANGUNAN').toUpperCase())}</div>
        ${toko.alamat ? `<div class="toko-sub">${escapeHtml(toko.alamat)}</div>` : ''}
        ${toko.hp ? `<div class="toko-sub">Telp / WA: ${escapeHtml(toko.hp)}</div>` : ''}
      </div>
      <div class="rab-hdr">
        <div class="rab-title">PENAWARAN HARGA / RAB</div>
        <div class="rab-no">${escapeHtml(rab.no_penawaran || '-')}</div>
        <div class="rab-badge">BERLAKU S/D ${escapeHtml(berlakuTgl.toUpperCase())}</div>
      </div>
    </div>

    <div class="meta-row-wrap">
      <div class="meta-col">
        <div class="meta-item"><span class="meta-lbl">Kepada Yth</span><span class="meta-val">${escapeHtml(rab.pelanggan_nama || 'Pelanggan Umum')}</span></div>
        ${rab.judul_proyek ? `<div class="meta-item"><span class="meta-lbl">Proyek / RAB</span><span class="meta-val">${escapeHtml(rab.judul_proyek)}</span></div>` : ''}
        ${rab.alamat_kirim ? `<div class="meta-item"><span class="meta-lbl">Alamat</span><span class="meta-val">${escapeHtml(rab.alamat_kirim)}</span></div>` : ''}
      </div>
      <div class="meta-col">
        <div class="meta-item"><span class="meta-lbl">Tanggal</span><span class="meta-val">${escapeHtml(formatTanggal(rab.tanggal || new Date()))}</span></div>
        <div class="meta-item"><span class="meta-lbl">Petugas</span><span class="meta-val">${escapeHtml(rab.kasir_nama || 'Admin')}</span></div>
        ${rab.pelanggan_hp ? `<div class="meta-item"><span class="meta-lbl">Telp / WA</span><span class="meta-val">${escapeHtml(rab.pelanggan_hp)}</span></div>` : ''}
      </div>
    </div>

    <table class="keep-table">
      <thead>
        <tr>
          <th class="c" style="width: 26px;">No</th>
          <th>Nama Barang / Material</th>
          <th class="r" style="width: 52px;">Qty</th>
          <th class="c" style="width: 55px;">Satuan</th>
          <th class="r" style="width: 82px;">Harga Satuan</th>
          <th class="r" style="width: 65px;">Diskon</th>
          <th class="r" style="width: 90px;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, idx) => `
          <tr>
            <td class="c">${idx + 1}</td>
            <td><strong>${escapeHtml(it.nama || 'Barang')}</strong></td>
            <td class="r">${formatQty(it.qty || 0)}</td>
            <td class="c">${escapeHtml(it.satuan || '-')}</td>
            <td class="r">${formatRupiah(it.harga || 0)}</td>
            <td class="r">${Number(it.diskon || 0) > 0 ? '-' + formatRupiah(it.diskon) : '-'}</td>
            <td class="r"><strong>${formatRupiah(it.subtotal || 0)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="bottom-wrap">
      <div class="left-block">
        ${rab.catatan ? `<div><strong>Catatan:</strong> ${escapeHtml(rab.catatan)}</div>` : ''}
        <div class="syarat">
          Penawaran harga ini bukan bukti pembayaran &amp; belum memotong stok.<br>
          Harga berlaku hingga <strong>${escapeHtml(berlakuTgl)}</strong> dan sewaktu-waktu dapat berubah mengikuti harga bahan bangunan.
        </div>
        <div class="ttd-wrap">
          <div class="ttd-box">
            <div>Hormat Kami,</div>
            <div class="ttd-sp"></div>
            <div class="ttd-ln">${escapeHtml(toko.nama || 'Toko')}</div>
          </div>
        </div>
      </div>

      <div class="right-block">
        <div class="sum-row"><span>Subtotal Estimasi</span><span class="r">${formatRupiah(subtotal)}</span></div>
        ${diskon > 0 ? `<div class="sum-row"><span>Diskon</span><span class="r">-${formatRupiah(diskon)}</span></div>` : ''}
        ${ongkir > 0 ? `<div class="sum-row"><span>Estimasi Ongkir</span><span class="r">${formatRupiah(ongkir)}</span></div>` : ''}
        <div class="sum-total"><span>TOTAL ESTIMASI</span><span class="r">${formatRupiah(total)}</span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Buka pratinjau & cetak Penawaran Harga / Estimasi RAB A5 */
export function cetakPenawaranA5(rab) {
  const htmlDoc = buatHtmlPenawaranA5(rab);
  const modal = showModal({
    title: `Penawaran Harga A5 — ${rab.no_penawaran || ''}`,
    size: 'lg',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="alert alert-info" style="font-size: var(--fs-xs); margin: 0; padding: 8px 12px;">
          ${ICONS.clipboard}
          <div>Dokumen <strong>Penawaran Harga / RAB (A5 Landscape)</strong> siap dicetak atau disimpan menjadi file PDF untuk dikirim ke kontraktor/proyek.</div>
        </div>
        <div class="a5-preview-stage">
          <div class="a5-preview-viewport" id="vp-preview-rab-a5">
            <iframe id="iframe-preview-rab-a5" title="Pratinjau Penawaran A5"></iframe>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: space-between; align-items: center; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-rab-a5">Tutup</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-print-rab-a5-now" style="flex: 1; max-width: 240px; justify-content: center; gap: 6px;">
          ${ICONS.printer}
          <span>Cetak / Simpan PDF (A5)</span>
        </button>
      </div>
    `
  });

  pasangPreviewA5Proporsional(modal.el, '#vp-preview-rab-a5', '#iframe-preview-rab-a5', htmlDoc);

  modal.el.querySelector('#btn-tutup-rab-a5')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-print-rab-a5-now')?.addEventListener('click', () => cetakHtmlViaIframe(htmlDoc));
}

/** Modal hasil setelah membuat Penawaran Harga / RAB (langsung bisa Cetak A5 atau Kirim WA) */
export function bukaModalHasilPenawaran(rab) {
  const modal = showModal({
    title: 'Penawaran Harga / RAB Tersimpan!',
    size: 'sm',
    body: `
      <div class="stack" style="gap: var(--sp-3); text-align: center;">
        <div style="display: flex; justify-content: center; color: var(--success);">
          <div style="width: 42px; height: 42px;">${ICONS.checkCircle}</div>
        </div>
        <div>
          <div class="text-xs text-muted">NOMOR PENAWARAN HARGA</div>
          <div class="fw-bold mono text-lg">${escapeHtml(rab.no_penawaran || '-')}</div>
          ${rab.judul_proyek ? `<div class="text-sm fw-semibold" style="margin-top: 2px;">${escapeHtml(rab.judul_proyek)}</div>` : ''}
          <div class="text-xs text-muted" style="margin-top: 2px;">Kepada: <strong>${escapeHtml(rab.pelanggan_nama || 'Pelanggan Umum')}</strong></div>
          <div class="text-sm fw-bold mono" style="color: var(--primary); margin-top: 4px;">Estimasi: ${formatRupiah(rab.total || 0)}</div>
          <div class="text-xs text-muted">Stok tidak dipotong • Bisa dikonversi 1-klik ke kasir di menu Pending/RAB</div>
        </div>
        <div class="stack" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-primary btn-sm" id="btn-rab-hasil-a5" style="width: 100%; justify-content: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak / Simpan PDF Penawaran (A5)</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-rab-hasil-wa" style="width: 100%; justify-content: center; gap: 6px;">
            ${ICONS.messageCircle}
            <span>Kirim Penawaran via WhatsApp</span>
          </button>
        </div>
      </div>
    `,
    footer: `
      <div class="row" style="width: 100%; justify-content: flex-end;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-rab-hasil-tutup">Selesai</button>
      </div>
    `
  });

  modal.el.querySelector('#btn-rab-hasil-a5')?.addEventListener('click', () => cetakPenawaranA5(rab));
  modal.el.querySelector('#btn-rab-hasil-wa')?.addEventListener('click', () => {
    window.open(buatTautanWhatsAppPenawaran(rab, rab.pelanggan_hp || ''), '_blank', 'noopener,noreferrer');
  });
  modal.el.querySelector('#btn-rab-hasil-tutup')?.addEventListener('click', () => modal.close());
}

/**
 * Susun teks polos Bon Pengambilan / Mutasi Stok Gudang (58mm / 80mm)
 * @param {Object} mutasi
 * @param {'58'|'80'} [ukuran='58']
 * @returns {string}
 */
export function susunTeksBonMutasiGudang(mutasi, ukuran = '58') {
  const lebar = LEBAR_KERTAS[ukuran] || 32;
  const toko = ambilInfoTokoDokumen({});
  const items = Array.isArray(mutasi?.items) ? mutasi.items : (Array.isArray(mutasi?.items_json) ? mutasi.items_json : []);
  const labelArah = mutasi?.arah === 'toko_ke_gudang' ? 'TOKO -> GUDANG' : 'GUDANG -> TOKO';

  const baris = [];
  baris.push(formatTengah((toko.nama || 'TOKO').toUpperCase(), lebar));
  baris.push(buatGaris(lebar, '='));
  baris.push(formatTengah('BON PENGAMBILAN / MUTASI STOK', lebar));
  baris.push(formatTengah(labelArah, lebar));
  baris.push(buatGaris(lebar, '-'));
  baris.push('No Mutasi: ' + (mutasi?.no_mutasi || '-'));
  baris.push('Tanggal  : ' + formatTanggal(mutasi?.tanggal, true));
  baris.push('Petugas  : ' + (mutasi?.petugas_nama || store.get('user')?.nama || 'Petugas'));
  if (mutasi?.pembawa) baris.push('Pembawa  : ' + mutasi.pembawa);
  baris.push(buatGaris(lebar, '-'));

  items.forEach((it, i) => {
    baris.push(`${i + 1}. ${it.nama || 'Barang'}`);
    const qtyLabel = `${formatQty(it.qty)} ${it.satuan || ''}`;
    const infoDasar = Number(it.faktor || 1) > 1 ? `(${formatQty(it.qty_dasar)} ${it.satuan_dasar || ''})` : '';
    baris.push(formatDuaKolom('   Ambil: ' + qtyLabel, infoDasar, lebar));
  });

  baris.push(buatGaris(lebar, '-'));
  baris.push(formatDuaKolom('Total Jenis', `${items.length} barang`, lebar));
  baris.push(formatDuaKolom('Total Unit Dasar', `${formatQty(mutasi?.total_qty_dasar || 0)}`, lebar));
  if (mutasi?.catatan) {
    baris.push(buatGaris(lebar, '-'));
    baris.push('Catatan: ' + mutasi.catatan);
  }
  baris.push(buatGaris(lebar, '='));
  baris.push(formatDuaKolom('Petugas Gudang', 'Penerima/Kasir', lebar));
  baris.push('');
  baris.push(formatDuaKolom('(............)', '(............)', lebar));
  baris.push('');
  return baris.join('\n');
}

/**
 * Buka pratinjau & cetak Bon Pengambilan / Mutasi Stok Gudang (58mm / 80mm / Direct USB)
 * @param {Object} mutasi
 */
export function cetakBonMutasiGudang(mutasi) {
  const ukuranDefault = String(store.get('pengaturan')?.printer_ukuran || '58') === '80' ? '80' : '58';
  let ukuranAktif = ukuranDefault;

  const buatHtmlBon = (uk) => {
    const teks = susunTeksBonMutasiGudang(mutasi, uk);
    const css = buatCssThermal203Dpi(uk);
    return `<!doctype html><html><head><meta charset="utf-8"><style>${css} pre.bon-pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:inherit;line-height:1.35;}</style></head><body><div class="rcpt-wrap"><pre class="bon-pre">${escapeHtml(teks)}</pre></div></body></html>`;
  };

  const modal = showModal({
    title: `Bon Pengambilan Gudang — ${mutasi?.no_mutasi || ''}`,
    size: 'sm',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="row-between items-center" style="gap: var(--sp-2);">
          <span class="text-xs text-muted">Lebar Kertas Thermal:</span>
          <div class="row" style="gap: 4px;">
            <button type="button" class="btn btn-xs ${ukuranAktif === '58' ? 'btn-primary' : 'btn-secondary'} btn-uk-bon" data-uk="58">58mm</button>
            <button type="button" class="btn btn-xs ${ukuranAktif === '80' ? 'btn-primary' : 'btn-secondary'} btn-uk-bon" data-uk="80">80mm</button>
          </div>
        </div>
        <pre id="pre-bon-gudang" style="margin: 0; padding: var(--sp-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); font-family: var(--font-mono); font-size: var(--fs-xs); line-height: 1.4; overflow-x: auto; max-height: 50vh;">${escapeHtml(susunTeksBonMutasiGudang(mutasi, ukuranAktif))}</pre>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; gap: var(--sp-2); flex-wrap: wrap;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-bon-tutup">Tutup</button>
        <div class="row" style="gap: 6px;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-bon-usb" title="Cetak Direct USB ESC/POS">USB Direct</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-bon-print" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.printer}
            <span>Cetak Bon</span>
          </button>
        </div>
      </div>
    `
  });

  const preEl = modal.el.querySelector('#pre-bon-gudang');
  modal.el.querySelectorAll('.btn-uk-bon').forEach((btn) => {
    btn.addEventListener('click', () => {
      ukuranAktif = btn.getAttribute('data-uk') || '58';
      modal.el.querySelectorAll('.btn-uk-bon').forEach((b) => {
        b.className = `btn btn-xs ${b.getAttribute('data-uk') === ukuranAktif ? 'btn-primary' : 'btn-secondary'} btn-uk-bon`;
      });
      if (preEl) preEl.textContent = susunTeksBonMutasiGudang(mutasi, ukuranAktif);
    });
  });

  modal.el.querySelector('#btn-bon-tutup')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#btn-bon-print')?.addEventListener('click', () => {
    cetakHtmlViaIframe(buatHtmlBon(ukuranAktif));
  });
  modal.el.querySelector('#btn-bon-usb')?.addEventListener('click', async () => {
    const bytes = teksKeEscPos(susunTeksBonMutasiGudang(mutasi, ukuranAktif));
    await cetakDirectUsbDesktop(bytes, mutasi?.no_mutasi || 'Bon Gudang');
  });
}


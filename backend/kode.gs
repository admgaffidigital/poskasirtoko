/**
 * ============================================================================
 *  POS KASIR TOKO BANGUNAN — Backend Google Apps Script
 * ============================================================================
 *  Sumber kebenaran: README.md (bagian 2, 5, 7, 8, 9) & docs/database.md.
 *
 *  Isi file (urut):
 *    1. Konstanta aplikasi & kode error
 *    2. SKEMA database (tipe tiap kolom)
 *    3. Pengaturan default
 *    4. Router (doPost / doGet) & daftar RUTE
 *    5. Sesi & hak akses (kerangka; logika login di Fase 1)
 *    6. Lapisan data (baca/tulis bertipe, soft delete, sanitasi)
 *    7. Lock, cache, counter nomor dokumen, audit, pengaturan
 *    8. Utilitas (ID, waktu, hash, validasi, matematika bisnis)
 *    9. Handler aksi
 *   10. Setup: setupDatabase, setupTriggers, backupSekarang, menu Spreadsheet
 *
 *  Konvensi:
 *    - Fungsi berakhiran "_" = privat (tidak bisa dipanggil dari menu/trigger).
 *    - Semua uang = integer Rupiah. Qty = maks 3 digit desimal.
 *    - Semua waktu = teks "yyyy-MM-dd HH:mm:ss" zona Asia/Jakarta.
 * ============================================================================
 */

/* ========================================================================== */
/* 1. KONSTANTA                                                               */
/* ========================================================================== */

const APP = Object.freeze({
  NAMA: 'POS Kasir Toko Bangunan',
  VERSI: '0.0.1',
  VERSI_SKEMA: 1,
  TZ: 'Asia/Jakarta',
  FORMAT_WAKTU: 'yyyy-MM-dd HH:mm:ss',
  LOCK_TIMEOUT_MS: 30000,
  CACHE_DETIK_DEFAULT: 600, // 10 menit
  CACHE_POTONGAN_BYTE: 90000, // < 100 KB batas CacheService per key
  MAKS_PANJANG_TEKS: 5000,
  BACKUP_FOLDER: 'Backup POS',
  BACKUP_SIMPAN: 30,
  PAGE_LIMIT_DEFAULT: 50,
  PAGE_LIMIT_MAKS: 200
});

const ROLE = Object.freeze({ OWNER: 'owner', ADMIN: 'admin', KASIR: 'kasir' });
const SEMUA_ROLE = Object.freeze([ROLE.OWNER, ROLE.ADMIN, ROLE.KASIR]);

/** Kode error baku (README bagian 9). */
const KODE = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_LOCKED: 'AUTH_LOCKED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  STOK_KURANG: 'STOK_KURANG',
  HARGA_DI_BAWAH_HPP: 'HARGA_DI_BAWAH_HPP',
  LIMIT_KREDIT: 'LIMIT_KREDIT',
  TEMPO_NON_MEMBER: 'TEMPO_NON_MEMBER',
  POIN_KURANG: 'POIN_KURANG',
  CONFLICT: 'CONFLICT',
  SERVER: 'SERVER'
});

/** Error terkontrol: pesannya aman ditampilkan ke pengguna. */
class AppError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'AppError';
    this.code = KODE[code] ? code : KODE.SERVER;
    this.detail = detail === undefined ? null : detail;
  }
}

/** Lempar AppError (singkatan agar kode handler ringkas). */
function gagal_(code, message, detail) {
  throw new AppError(code, message, detail);
}

/* ========================================================================== */
/* 2. SKEMA DATABASE                                                          */
/* ========================================================================== */
/*
 * Tipe kolom:
 *   s = teks (format sel "@", aman untuk SKU/barcode/HP berawalan 0)
 *   n = angka
 *   b = boolean (disimpan sebagai teks TRUE/FALSE)
 *   d = waktu (teks "yyyy-MM-dd HH:mm:ss" WIB)
 *   j = JSON (disimpan sebagai teks)
 *
 * Kolom umum: "id" di awal, lalu kolom khusus, lalu kolom audit di akhir.
 * MIGRASI: tambah kolom baru HANYA di akhir daftar kolom khusus; setupDatabase()
 * akan menambahkannya di ujung kanan sheet lama. Pembacaan selalu berdasarkan
 * nama header, bukan posisi, sehingga aman.
 */
const KOLOM_AWAL = [['id', 's']];
const KOLOM_AKHIR = [['created_at', 'd'], ['updated_at', 'd'], ['created_by', 's'], ['deleted', 'b']];

const SKEMA = {
  Users: [['username', 's'], ['nama', 's'], ['role', 's'], ['pin_hash', 's'], ['salt', 's'], ['aktif', 'b'],
    ['wajib_ganti_pin', 'b'], ['gagal_login', 'n'], ['kunci_sampai', 'd'], ['last_login', 'd']],
  Sesi: [['user_id', 's'], ['token_hash', 's'], ['kedaluwarsa', 'd'], ['terakhir_aktif', 'd'], ['perangkat', 's']],
  Kategori: [['nama', 's'], ['parent_id', 's'], ['urutan', 'n']],
  Produk: [['sku', 's'], ['barcode', 's'], ['nama', 's'], ['kategori_id', 's'], ['satuan_dasar', 's'], ['hpp', 'n'],
    ['harga_ritel', 'n'], ['harga_grosir', 'n'], ['min_grosir_qty', 'n'], ['stok', 'n'], ['stok_min', 'n'],
    ['punya_varian', 'b'], ['foto_url', 's'], ['aktif', 'b']],
  Varian: [['produk_id', 's'], ['nama_varian', 's'], ['sku', 's'], ['barcode', 's'], ['hpp', 'n'], ['harga_ritel', 'n'],
    ['harga_grosir', 'n'], ['stok', 'n'], ['stok_min', 'n'], ['aktif', 'b']],
  Satuan_Konversi: [['produk_id', 's'], ['satuan', 's'], ['faktor', 'n'], ['barcode', 's'], ['harga_ritel', 'n'],
    ['harga_grosir', 'n']],
  Pelanggan: [['kode', 's'], ['nama', 's'], ['hp', 's'], ['alamat', 's'], ['tipe', 's'], ['level', 's'],
    ['limit_kredit', 'n'], ['tempo_hari', 'n'], ['poin', 'n'], ['total_belanja', 'n'], ['aktif', 'b']],
  Supplier: [['nama', 's'], ['kontak', 's'], ['hp', 's'], ['alamat', 's'], ['catatan', 's'], ['aktif', 'b']],
  Penjualan: [['no_nota', 's'], ['tanggal', 'd'], ['kasir_id', 's'], ['pelanggan_id', 's'], ['subtotal', 'n'],
    ['diskon_tipe', 's'], ['diskon_nilai', 'n'], ['diskon', 'n'], ['pajak', 'n'], ['pembulatan', 'n'], ['total', 'n'],
    ['bayar', 'n'], ['kembalian', 'n'], ['metode_bayar', 's'], ['status_bayar', 's'], ['pengiriman', 's'],
    ['alamat_kirim', 's'], ['status_antar', 's'], ['catatan', 's'], ['status', 's'], ['void_alasan', 's'],
    ['void_oleh', 's'], ['void_at', 'd'], ['poin_didapat', 'n']],
  Penjualan_Item: [['penjualan_id', 's'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'], ['satuan', 's'],
    ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['qty_dibawa', 'n'], ['tipe_harga', 's'], ['harga_asli', 'n'],
    ['harga', 'n'], ['hpp', 'n'], ['diskon_tipe', 's'], ['diskon_nilai', 'n'], ['diskon', 'n'], ['subtotal', 'n']],
  Penjualan_Bayar: [['penjualan_id', 's'], ['metode', 's'], ['jumlah', 'n'], ['referensi', 's']],
  Pembelian: [['no_faktur', 's'], ['no_faktur_supplier', 's'], ['tanggal', 'd'], ['supplier_id', 's'],
    ['subtotal', 'n'], ['diskon', 'n'], ['total', 'n'], ['bayar', 'n'], ['status_bayar', 's'], ['jatuh_tempo', 'd'],
    ['catatan', 's'], ['status', 's']],
  Pembelian_Item: [['pembelian_id', 's'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'], ['satuan', 's'],
    ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['harga_beli', 'n'], ['subtotal', 'n']],
  Piutang: [['penjualan_id', 's'], ['pelanggan_id', 's'], ['total', 'n'], ['terbayar', 'n'], ['sisa', 'n'],
    ['jatuh_tempo', 'd'], ['status', 's']],
  Hutang: [['pembelian_id', 's'], ['supplier_id', 's'], ['total', 'n'], ['terbayar', 'n'], ['sisa', 'n'],
    ['jatuh_tempo', 'd'], ['status', 's']],
  Pembayaran: [['tipe', 's'], ['ref_id', 's'], ['jumlah', 'n'], ['metode', 's'], ['tanggal', 'd'], ['catatan', 's']],
  Poin_Log: [['pelanggan_id', 's'], ['jumlah', 'n'], ['jenis', 's'], ['ref_id', 's'], ['saldo', 'n']],
  Hadiah: [['nama', 's'], ['deskripsi', 's'], ['poin_dibutuhkan', 'n'], ['stok', 'n'], ['aktif', 'b']],
  Penukaran_Hadiah: [['no_tukar', 's'], ['pelanggan_id', 's'], ['hadiah_id', 's'], ['qty', 'n'], ['poin', 'n'],
    ['catatan', 's']],
  Kartu_Stok: [['produk_id', 's'], ['varian_id', 's'], ['tipe', 's'], ['qty', 'n'], ['saldo', 'n'], ['hpp', 'n'],
    ['ref_id', 's'], ['user_id', 's'], ['keterangan', 's']],
  Opname: [['no_opname', 's'], ['tanggal', 'd'], ['produk_id', 's'], ['varian_id', 's'], ['qty_sistem', 'n'],
    ['qty_fisik', 'n'], ['selisih', 'n'], ['alasan', 's'], ['status', 's'], ['disetujui_oleh', 's'],
    ['disetujui_at', 'd']],
  Retur: [['no_retur', 's'], ['tipe', 's'], ['ref_id', 's'], ['pihak_id', 's'], ['tanggal', 'd'], ['total', 'n'],
    ['metode_refund', 's'], ['alasan', 's'], ['status', 's'], ['disetujui_oleh', 's'], ['disetujui_at', 'd']],
  Retur_Item: [['retur_id', 's'], ['ref_item_id', 's'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'],
    ['satuan', 's'], ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['harga', 'n'], ['hpp', 'n'],
    ['subtotal', 'n']],
  Pengaturan: [['key', 's'], ['value', 'j']],
  Log_Audit: [['user_id', 's'], ['aksi', 's'], ['modul', 's'], ['ref_id', 's'], ['detail_json', 'j']],
  Counter: [['key', 's'], ['nilai', 'n']]
};

/** Daftar kolom lengkap [nama, tipe] sebuah sheet (umum + khusus). */
function kolomSheet_(namaSheet) {
  const khusus = SKEMA[namaSheet];
  if (!khusus) gagal_(KODE.SERVER, 'Sheet tidak dikenal di SKEMA: ' + namaSheet);
  return KOLOM_AWAL.concat(khusus, KOLOM_AKHIR);
}

/** Peta nama kolom → tipe untuk sebuah sheet. */
function tipeKolom_(namaSheet) {
  const peta = {};
  kolomSheet_(namaSheet).forEach(function (k) { peta[k[0]] = k[1]; });
  return peta;
}

/* ========================================================================== */
/* 3. PENGATURAN DEFAULT (dari Keputusan Teknis Final)                        */
/* ========================================================================== */

const PENGATURAN_DEFAULT = {
  toko_nama: 'Toko Bangunan',
  toko_alamat: '',
  toko_hp: '',
  toko_logo_url: '',
  nota_footer: 'Terima kasih atas kunjungan Anda.\nBarang yang sudah dibeli dapat diretur sesuai ketentuan toko.',
  printer_ukuran: '58', // '58' (32 karakter) | '80' (48 karakter)
  printer_jalur: 'otomatis', // otomatis | webbluetooth | rawbt | browser
  poin_per_rupiah: 10000,
  level_member: [
    { nama: 'Reguler', min_belanja: 0, pengali: 1 },
    { nama: 'Perak', min_belanja: 10000000, pengali: 1.25 },
    { nama: 'Emas', min_belanja: 50000000, pengali: 1.5 }
  ],
  pajak_aktif: false,
  pajak_persen: 11,
  pembulatan_aktif: false,
  pembulatan_kelipatan: 100,
  stok_minus: false,
  tempo_default_hari: 30,
  limit_kredit_default: 0,
  diskon_maks_kasir_persen: 10,
  audit_diskon_persen: 10,
  sesi_jam: 6,
  login_maks_gagal: 5,
  login_kunci_menit: 15,
  versi_skema: APP.VERSI_SKEMA
};

/* ========================================================================== */
/* 4. ROUTER                                                                  */
/* ========================================================================== */
/*
 * Setiap rute: {
 *   handler: function(ctx) → data,
 *   publik:  true bila tanpa token (hanya sistem.ping & auth.login),
 *   roles:   daftar role yang diizinkan (default: semua role yang login),
 *   tulis:   true bila mengubah data → dijalankan di dalam LockService
 * }
 * ctx = { action, payload, token, user, waktu }
 */
const RUTE = {
  'sistem.ping': { publik: true, handler: aksiSistemPing_ }
  // Fase 1: auth.login, auth.logout, auth.me, auth.gantiPin, kategori.*, produk.*, pengaturan.*, user.*
};

/** Entry point Web App (semua aksi). */
function doPost(e) {
  let action = '';
  try {
    const req = parseRequest_(e);
    action = req.action;
    const rute = Object.prototype.hasOwnProperty.call(RUTE, action) ? RUTE[action] : null;
    if (!rute) gagal_(KODE.NOT_FOUND, 'Aksi "' + action + '" tidak dikenal.');

    const ctx = { action: action, payload: req.payload, token: req.token, user: null, waktu: sekarang_() };
    if (!rute.publik) ctx.user = wajibSesi_(ctx.token, rute.roles);

    const data = rute.tulis ? denganKunci_(function () { return rute.handler(ctx); }) : rute.handler(ctx);
    return jsonOut_(responsSukses_(data));
  } catch (err) {
    return jsonOut_(responsGagal_(err, action));
  }
}

/** GET hanya untuk cek cepat di browser bahwa Web App aktif. */
function doGet() {
  return jsonOut_(responsSukses_({
    nama: APP.NAMA,
    versi: APP.VERSI,
    pesan: 'Backend aktif. Gunakan POST dengan body JSON { action, token, payload }.'
  }));
}

/** Parse & validasi bentuk request. */
function parseRequest_(e) {
  const isi = e && e.postData && e.postData.contents;
  if (!isi) gagal_(KODE.VALIDATION, 'Request kosong.');
  let req;
  try {
    req = JSON.parse(isi);
  } catch (err) {
    gagal_(KODE.VALIDATION, 'Format request tidak valid (bukan JSON).');
  }
  if (!req || typeof req !== 'object' || Array.isArray(req)) gagal_(KODE.VALIDATION, 'Format request tidak valid.');
  const action = typeof req.action === 'string' ? req.action.trim() : '';
  if (!/^[a-zA-Z]+(\.[a-zA-Z]+){1,2}$/.test(action)) gagal_(KODE.VALIDATION, 'Nama aksi tidak valid.');
  const payload = req.payload === undefined || req.payload === null ? {} : req.payload;
  if (typeof payload !== 'object' || Array.isArray(payload)) gagal_(KODE.VALIDATION, 'Payload harus berupa objek.');
  const token = typeof req.token === 'string' ? req.token.trim() : '';
  return { action: action, payload: payload, token: token };
}

function responsSukses_(data) {
  return { ok: true, data: data === undefined ? null : data, error: null, code: null };
}

/** Ubah error apa pun menjadi respons seragam. Error tak terduga tidak membocorkan detail. */
function responsGagal_(err, action) {
  if (err instanceof AppError) {
    return { ok: false, data: err.detail, error: err.message, code: err.code };
  }
  console.error('[SERVER] aksi=' + action + ' :: ' + (err && err.stack ? err.stack : err));
  return { ok: false, data: null, error: 'Terjadi kesalahan di server. Silakan coba lagi.', code: KODE.SERVER };
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ========================================================================== */
/* 5. SESI & HAK AKSES                                                        */
/* ========================================================================== */

/**
 * Wajib sesi valid + role diizinkan. Mengembalikan objek user aman (tanpa hash).
 * Hak akses SELALU ditegakkan di sini, bukan hanya di front end.
 */
function wajibSesi_(token, roles) {
  if (!token) gagal_(KODE.AUTH_REQUIRED, 'Silakan login terlebih dahulu.');
  const user = validasiSesi_(token);
  cekRole_(user, roles);
  return user;
}

/** Lempar FORBIDDEN bila role user tidak ada di daftar. */
function cekRole_(user, roles) {
  const izin = roles && roles.length ? roles : SEMUA_ROLE;
  if (!user || izin.indexOf(user.role) === -1) {
    gagal_(KODE.FORBIDDEN, 'Anda tidak memiliki akses untuk tindakan ini.');
  }
}

/**
 * Validasi token sesi → user.
 * Diimplementasikan penuh pada FASE 1 (login multiuser). Pada Fase 0 belum ada
 * aksi yang membutuhkan login, sehingga semua token dianggap tidak valid.
 */
function validasiSesi_(token) { // eslint-disable-line no-unused-vars
  gagal_(KODE.AUTH_INVALID, 'Fitur login belum tersedia (Fase 1).');
}

/* ========================================================================== */
/* 6. LAPISAN DATA                                                            */
/* ========================================================================== */

/** Spreadsheet database (ID disimpan oleh setupDatabase, fallback ke spreadsheet induk). */
function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) gagal_(KODE.SERVER, 'Database belum disiapkan. Jalankan setupDatabase() terlebih dahulu.');
  return ss;
}

/** Ambil sheet sesuai SKEMA; lempar error ramah bila belum dibuat. */
function sheet_(namaSheet) {
  if (!SKEMA[namaSheet]) gagal_(KODE.SERVER, 'Sheet tidak dikenal: ' + namaSheet);
  const sh = ss_().getSheetByName(namaSheet);
  if (!sh) gagal_(KODE.SERVER, 'Sheet "' + namaSheet + '" belum ada. Jalankan setupDatabase().');
  return sh;
}

/** Baca header aktual sheet → { nama: indeks0 }. */
function petaHeader_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return {};
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const peta = {};
  header.forEach(function (h, i) { if (h !== '') peta[String(h)] = i; });
  return peta;
}

/**
 * Ubah nilai JS → nilai sel sesuai tipe kolom.
 * Teks berawalan = + - @ diberi apostrof (cegah formula injection; apostrof
 * tidak ikut tersimpan sebagai nilai sehingga data tetap utuh saat dibaca).
 */
function keSel_(nilai, tipe, namaKolom) {
  if (nilai === undefined || nilai === null) return tipe === 'b' ? 'FALSE' : '';
  switch (tipe) {
    case 'n': {
      if (nilai === '') return '';
      const n = Number(nilai);
      if (!isFinite(n)) gagal_(KODE.VALIDATION, 'Kolom "' + namaKolom + '" harus berupa angka.');
      return n;
    }
    case 'b':
      return nilai === true || String(nilai).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
    case 'd':
      return nilai instanceof Date ? formatWaktu_(nilai) : String(nilai);
    case 'j':
      // Selalu JSON.stringify (termasuk string) agar tipe kembali utuh saat dibaca.
      return amankanTeks_(JSON.stringify(nilai));
    default: {
      let t = String(nilai);
      if (t.length > APP.MAKS_PANJANG_TEKS) t = t.substring(0, APP.MAKS_PANJANG_TEKS);
      return amankanTeks_(t);
    }
  }
}

/** Awali apostrof bila teks berpotensi dibaca sebagai formula. */
function amankanTeks_(t) {
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/** Ubah nilai sel → nilai JS sesuai tipe kolom. */
function dariSel_(nilai, tipe) {
  switch (tipe) {
    case 'n':
      return nilai === '' || nilai === null ? 0 : Number(nilai) || 0;
    case 'b':
      return nilai === true || String(nilai).toUpperCase() === 'TRUE';
    case 'd':
      return nilai instanceof Date ? formatWaktu_(nilai) : String(nilai === null ? '' : nilai);
    case 'j':
      if (nilai === '' || nilai === null) return null;
      try { return JSON.parse(String(nilai)); } catch (e) { return String(nilai); }
    default:
      return nilai === null ? '' : String(nilai);
  }
}

/**
 * Baca semua baris sheet sebagai array objek bertipe.
 * opsi.termasukTerhapus = true untuk ikut membaca baris soft delete.
 * Setiap objek mendapat properti non-enumerable "_baris" (nomor baris sheet).
 */
function bacaSemua_(namaSheet, opsi) {
  opsi = opsi || {};
  const sh = sheet_(namaSheet);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const nilai = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const header = nilai[0].map(String);
  const tipe = tipeKolom_(namaSheet);
  const hasil = [];
  for (let r = 1; r < nilai.length; r++) {
    const baris = nilai[r];
    if (baris[0] === '' || baris[0] === null) continue; // baris kosong
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const kol = header[c];
      if (!kol || !tipe[kol]) continue; // kolom di luar skema diabaikan
      obj[kol] = dariSel_(baris[c], tipe[kol]);
    }
    if (!opsi.termasukTerhapus && obj.deleted) continue;
    Object.defineProperty(obj, '_baris', { value: r + 1, enumerable: false });
    hasil.push(obj);
  }
  return hasil;
}

/** Cari satu baris berdasarkan id (null bila tidak ada / terhapus). */
function cariById_(namaSheet, id, opsi) {
  if (!id) return null;
  const semua = bacaSemua_(namaSheet, opsi);
  for (let i = 0; i < semua.length; i++) if (semua[i].id === id) return semua[i];
  return null;
}

/**
 * Tambah banyak baris sekaligus (satu panggilan setValues).
 * Mengisi id, created_at, updated_at, created_by, deleted otomatis.
 * @return {Object[]} objek yang tersimpan (dengan id).
 */
function tambahBaris_(namaSheet, daftar, userId) {
  if (!daftar || !daftar.length) return [];
  const sh = sheet_(namaSheet);
  const header = petaHeader_(sh);
  const lebar = sh.getLastColumn();
  const tipe = tipeKolom_(namaSheet);
  const waktu = sekarang_();
  const tersimpan = [];
  const baris = daftar.map(function (input) {
    const obj = Object.assign({}, input);
    obj.id = obj.id || uuid_();
    obj.created_at = waktu;
    obj.updated_at = waktu;
    obj.created_by = userId || obj.created_by || 'sistem';
    obj.deleted = false;
    tersimpan.push(obj);
    const row = new Array(lebar).fill('');
    Object.keys(header).forEach(function (kol) {
      if (tipe[kol]) row[header[kol]] = keSel_(obj[kol], tipe[kol], kol);
    });
    return row;
  });
  const mulai = sh.getLastRow() + 1;
  pastikanBaris_(sh, mulai + baris.length - 1);
  sh.getRange(mulai, 1, baris.length, lebar).setValues(baris);
  return tersimpan;
}

/** Pastikan grid sheet memiliki minimal "barisDibutuhkan" baris (tambah 500 cadangan). */
function pastikanBaris_(sh, barisDibutuhkan) {
  const maks = sh.getMaxRows();
  if (barisDibutuhkan > maks) sh.insertRowsAfter(maks, barisDibutuhkan - maks + 500);
}

/**
 * Ubah banyak baris berdasarkan id. perubahan: [{ id, data: {kolom: nilai} }].
 * Kolom id/created_at/created_by tidak bisa diubah. Menulis per baris yang berubah
 * (biasanya sedikit); untuk perubahan massal gunakan tulisUlangKolom_ di fase terkait.
 * @return {Object[]} objek setelah diubah.
 */
function ubahBaris_(namaSheet, perubahan, userId) { // eslint-disable-line no-unused-vars
  if (!perubahan || !perubahan.length) return [];
  const sh = sheet_(namaSheet);
  const header = petaHeader_(sh);
  const lebar = sh.getLastColumn();
  const tipe = tipeKolom_(namaSheet);
  const semua = bacaSemua_(namaSheet, { termasukTerhapus: true });
  const indeks = {};
  semua.forEach(function (o) { indeks[o.id] = o; });
  const waktu = sekarang_();
  const terlarang = { id: 1, created_at: 1, created_by: 1 };

  return perubahan.map(function (p) {
    const lama = indeks[p.id];
    if (!lama) gagal_(KODE.NOT_FOUND, 'Data tidak ditemukan (' + namaSheet + ').');
    const baru = Object.assign({}, lama);
    Object.keys(p.data || {}).forEach(function (k) {
      if (tipe[k] && !terlarang[k]) baru[k] = p.data[k];
    });
    baru.updated_at = waktu;
    const row = new Array(lebar).fill('');
    Object.keys(header).forEach(function (kol) {
      if (tipe[kol]) row[header[kol]] = keSel_(baru[kol], tipe[kol], kol);
    });
    sh.getRange(lama._baris, 1, 1, lebar).setValues([row]);
    return baru;
  });
}

/** Soft delete (deleted = TRUE). */
function hapusLunak_(namaSheet, id, userId) { // eslint-disable-line no-unused-vars
  return ubahBaris_(namaSheet, [{ id: id, data: { deleted: true } }], userId)[0];
}

/**
 * Paginasi & pencarian sederhana di memori.
 * @param {Object[]} items  data
 * @param {Object} payload  { page, limit, q }
 * @param {string[]} kolomCari kolom yang dicari untuk q
 */
function paginasi_(items, payload, kolomCari) { // eslint-disable-line no-unused-vars
  payload = payload || {};
  let data = items;
  const q = String(payload.q || '').trim().toLowerCase();
  if (q && kolomCari && kolomCari.length) {
    data = data.filter(function (o) {
      return kolomCari.some(function (k) { return String(o[k] || '').toLowerCase().indexOf(q) !== -1; });
    });
  }
  const limit = Math.min(Math.max(parseInt(payload.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(payload.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;
  return { items: data.slice(mulai, mulai + limit), total: data.length, page: page, limit: limit };
}

/* ========================================================================== */
/* 7. LOCK, CACHE, COUNTER, AUDIT, PENGATURAN                                 */
/* ========================================================================== */

/** Jalankan fn di dalam script lock. Lock selalu dilepas di finally. */
function denganKunci_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(APP.LOCK_TIMEOUT_MS)) {
    gagal_(KODE.CONFLICT, 'Server sedang sibuk memproses transaksi lain. Silakan coba lagi.');
  }
  try {
    const hasil = fn();
    SpreadsheetApp.flush();
    return hasil;
  } finally {
    lock.releaseLock();
  }
}

/** Simpan JSON ke cache; otomatis dipecah bila > batas per key. */
function cacheSimpan_(key, nilai, detik) {
  const cache = CacheService.getScriptCache();
  const teks = JSON.stringify(nilai);
  const durasi = detik || APP.CACHE_DETIK_DEFAULT;
  try {
    if (teks.length <= APP.CACHE_POTONGAN_BYTE) {
      cache.putAll({ [key]: teks, [key + '__n']: '0' }, durasi);
      return;
    }
    const potongan = {};
    let n = 0;
    for (let i = 0; i < teks.length; i += APP.CACHE_POTONGAN_BYTE) {
      potongan[key + '__' + n] = teks.substring(i, i + APP.CACHE_POTONGAN_BYTE);
      n++;
    }
    potongan[key + '__n'] = String(n);
    cache.putAll(potongan, durasi);
  } catch (err) {
    console.warn('Cache gagal disimpan (' + key + '): ' + err); // cache opsional, jangan gagalkan aksi
  }
}

/** Ambil JSON dari cache; null bila tidak ada / rusak. */
function cacheAmbil_(key) {
  const cache = CacheService.getScriptCache();
  const n = cache.get(key + '__n');
  if (n === null) return null;
  try {
    if (n === '0') {
      const t = cache.get(key);
      return t === null ? null : JSON.parse(t);
    }
    const kunci = [];
    for (let i = 0; i < Number(n); i++) kunci.push(key + '__' + i);
    const bagian = cache.getAll(kunci);
    let teks = '';
    for (let j = 0; j < kunci.length; j++) {
      if (bagian[kunci[j]] === undefined) return null; // potongan hilang → anggap kosong
      teks += bagian[kunci[j]];
    }
    return JSON.parse(teks);
  } catch (err) {
    return null;
  }
}

/** Hapus cache (termasuk potongan). */
function cacheHapus_(key) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key + '__n') || 0);
  const kunci = [key, key + '__n'];
  for (let i = 0; i < n; i++) kunci.push(key + '__' + i);
  cache.removeAll(kunci);
}

/**
 * Nomor dokumen berurutan harian: PREFIX-YYYYMMDD-0001.
 * WAJIB dipanggil di dalam denganKunci_ agar tidak ada nomor ganda.
 */
function nomorBerikut_(prefix) {
  const valid = ['INV', 'PB', 'RT', 'OP', 'TK'];
  if (valid.indexOf(prefix) === -1) gagal_(KODE.SERVER, 'Prefix nomor tidak dikenal: ' + prefix);
  const key = prefix + '-' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd');
  const baris = bacaSemua_('Counter').filter(function (c) { return c.key === key; })[0];
  let nilai;
  if (baris) {
    nilai = baris.nilai + 1;
    ubahBaris_('Counter', [{ id: baris.id, data: { nilai: nilai } }], 'sistem');
  } else {
    nilai = 1;
    tambahBaris_('Counter', [{ key: key, nilai: nilai }], 'sistem');
  }
  return key + '-' + ('000' + nilai).slice(-4);
}

/** Catat aksi sensitif ke Log_Audit. Tidak pernah menggagalkan aksi utama. */
function catatAudit_(userId, aksi, modul, refId, detail) {
  try {
    tambahBaris_('Log_Audit', [{
      user_id: userId || 'anonim', aksi: aksi, modul: modul, ref_id: refId || '', detail_json: detail || {}
    }], userId || 'sistem');
  } catch (err) {
    console.error('Gagal mencatat audit: ' + err);
  }
}

/** Pengaturan aktif (default + nilai tersimpan), di-cache. */
function ambilPengaturan_() {
  const cache = cacheAmbil_('pengaturan');
  if (cache) return cache;
  const hasil = JSON.parse(JSON.stringify(PENGATURAN_DEFAULT));
  bacaSemua_('Pengaturan').forEach(function (p) { hasil[p.key] = p.value; });
  cacheSimpan_('pengaturan', hasil, 3600);
  return hasil;
}

/* ========================================================================== */
/* 8. UTILITAS                                                                */
/* ========================================================================== */

function uuid_() { return Utilities.getUuid(); }

function formatWaktu_(tgl) { return Utilities.formatDate(tgl, APP.TZ, APP.FORMAT_WAKTU); }

/** Waktu sekarang WIB "yyyy-MM-dd HH:mm:ss". */
function sekarang_() { return formatWaktu_(new Date()); }

/** SHA-256 → heksadesimal. */
function sha256Hex_(teks) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(teks), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function buatSalt_() { return uuid_().replace(/-/g, ''); }

/** Hash PIN dengan salt per user. */
function hashPin_(pin, salt) { return sha256Hex_(salt + ':' + String(pin)); }

/** Token sesi acak (64 heks). Yang disimpan di server hanya hash-nya. */
function buatToken_() { return (uuid_() + uuid_()).replace(/-/g, ''); }

/** PIN acak 6 digit dari UUID (sumber acak Google). */
function pinAcak_() {
  const heks = uuid_().replace(/-/g, '').substring(0, 12);
  return ('000000' + (parseInt(heks, 16) % 1000000)).slice(-6);
}

/** Bulatkan qty ke maks 3 digit desimal. */
function bulatQty_(n) { return Math.round(Number(n) * 1000) / 1000; }

/** Subtotal baku: Math.round(qty × harga). */
function hitungSubtotal_(qty, harga) { return Math.round(bulatQty_(qty) * Number(harga)); }

/**
 * HPP rata-rata bergerak per satuan dasar (README aturan 10).
 * Bila stok lama ≤ 0 → HPP baru = harga beli efektif.
 */
function hitungHppBaru_(stokLama, hppLama, qtyMasuk, hargaBeli) {
  stokLama = Number(stokLama) || 0;
  qtyMasuk = Number(qtyMasuk) || 0;
  if (qtyMasuk <= 0) return Math.round(Number(hppLama) || 0);
  if (stokLama <= 0) return Math.round(Number(hargaBeli) || 0);
  return Math.round((stokLama * hppLama + qtyMasuk * hargaBeli) / (stokLama + qtyMasuk));
}

/** Validator input. Semua melempar VALIDATION dengan pesan Bahasa Indonesia. */
const V_ = {
  teks: function (nilai, label, opsi) {
    opsi = opsi || {};
    const t = nilai === undefined || nilai === null ? '' : String(nilai).trim();
    if (opsi.wajib && !t) gagal_(KODE.VALIDATION, label + ' wajib diisi.');
    const maks = opsi.maks || 200;
    if (t.length > maks) gagal_(KODE.VALIDATION, label + ' maksimal ' + maks + ' karakter.');
    if (opsi.pola && t && !opsi.pola.test(t)) gagal_(KODE.VALIDATION, label + ' tidak valid.');
    return t;
  },
  angka: function (nilai, label, opsi) {
    opsi = opsi || {};
    if ((nilai === '' || nilai === undefined || nilai === null) && !opsi.wajib) return opsi.bawaan || 0;
    const n = Number(nilai);
    if (nilai === '' || nilai === null || !isFinite(n)) gagal_(KODE.VALIDATION, label + ' harus berupa angka.');
    if (opsi.min !== undefined && n < opsi.min) gagal_(KODE.VALIDATION, label + ' minimal ' + opsi.min + '.');
    if (opsi.max !== undefined && n > opsi.max) gagal_(KODE.VALIDATION, label + ' maksimal ' + opsi.max + '.');
    return n;
  },
  /** Rupiah: integer ≥ 0. */
  rupiah: function (nilai, label, opsi) {
    const n = V_.angka(nilai, label, Object.assign({ min: 0 }, opsi || {}));
    if (!Number.isInteger(n)) gagal_(KODE.VALIDATION, label + ' harus bilangan bulat Rupiah.');
    return n;
  },
  /** Qty: > 0, maks 3 digit desimal. */
  qty: function (nilai, label, opsi) {
    const n = V_.angka(nilai, label, Object.assign({ wajib: true }, opsi || {}));
    if (n <= 0) gagal_(KODE.VALIDATION, label + ' harus lebih dari 0.');
    if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) {
      gagal_(KODE.VALIDATION, label + ' maksimal 3 angka di belakang koma.');
    }
    return bulatQty_(n);
  },
  pilihan: function (nilai, label, daftar) {
    if (daftar.indexOf(nilai) === -1) gagal_(KODE.VALIDATION, label + ' harus salah satu dari: ' + daftar.join(', ') + '.');
    return nilai;
  },
  pin: function (nilai) {
    return V_.teks(nilai, 'PIN', { wajib: true, maks: 6, pola: /^\d{6}$/ });
  }
};

/* ========================================================================== */
/* 9. HANDLER AKSI                                                            */
/* ========================================================================== */

/** sistem.ping — cek koneksi & kesiapan database (publik, tanpa data sensitif). */
function aksiSistemPing_() {
  let dbSiap = false;
  let versiSkemaDb = null;
  try {
    const ss = ss_();
    dbSiap = Object.keys(SKEMA).every(function (n) { return !!ss.getSheetByName(n); });
    if (dbSiap) versiSkemaDb = ambilPengaturan_().versi_skema;
  } catch (err) {
    dbSiap = false;
  }
  return {
    pesan: 'pong',
    nama: APP.NAMA,
    versi: APP.VERSI,
    versi_skema: APP.VERSI_SKEMA,
    versi_skema_db: versiSkemaDb,
    db_siap: dbSiap,
    waktu_server: sekarang_()
  };
}

/* ========================================================================== */
/* 10. SETUP, TRIGGER, BACKUP, MENU                                           */
/* ========================================================================== */

/** Menu khusus di Spreadsheet (muncul saat Spreadsheet dibuka). */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🏗️ POS')
      .addItem('1. Setup / perbarui database', 'setupDatabase')
      .addItem('2. Pasang trigger backup harian', 'setupTriggers')
      .addSeparator()
      .addItem('Backup sekarang', 'backupSekarang')
      .addItem('Reset PIN Owner (darurat)', 'resetPinOwner')
      .addToUi();
  } catch (err) {
    // Dipanggil di luar konteks UI (mis. dari editor) → abaikan.
  }
}

/** Tampilkan pesan ke pengguna: dialog bila ada UI, selalu ke log eksekusi. */
function infoAdmin_(judul, pesan) {
  console.log('[' + judul + ']\n' + pesan);
  try {
    SpreadsheetApp.getUi().alert(judul, pesan, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (err) {
    // Dijalankan dari editor: lihat "Execution log".
  }
}

/**
 * Membuat / memperbarui seluruh sheet sesuai SKEMA (aman dijalankan ulang):
 *  - membuat sheet yang belum ada + header + format kolom,
 *  - menambahkan kolom baru di ujung kanan bila skema bertambah (tanpa hapus data),
 *  - mengisi pengaturan default yang belum ada,
 *  - membuat akun Owner awal (PIN acak) bila belum ada Owner aktif.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Jalankan setupDatabase() dari Apps Script yang terikat ke Spreadsheet database.');

  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  const laporan = [];
  let pinOwner = null;
  try {
    ss.setSpreadsheetTimeZone(APP.TZ);
    PropertiesService.getScriptProperties().setProperty('DB_SPREADSHEET_ID', ss.getId());

    Object.keys(SKEMA).forEach(function (nama) {
      const hasil = siapkanSheet_(ss, nama);
      if (hasil) laporan.push(hasil);
    });
    hapusSheetBawaanKosong_(ss);

    // Pengaturan default: hanya key yang belum ada.
    const adaKey = {};
    bacaSemua_('Pengaturan', { termasukTerhapus: true }).forEach(function (p) { adaKey[p.key] = p; });
    const baru = Object.keys(PENGATURAN_DEFAULT)
      .filter(function (k) { return !adaKey[k]; })
      .map(function (k) { return { key: k, value: PENGATURAN_DEFAULT[k] }; });
    if (baru.length) {
      tambahBaris_('Pengaturan', baru, 'sistem');
      laporan.push('Pengaturan default ditambahkan: ' + baru.length + ' key.');
    }
    if (adaKey.versi_skema && adaKey.versi_skema.value !== APP.VERSI_SKEMA) {
      ubahBaris_('Pengaturan', [{ id: adaKey.versi_skema.id, data: { value: APP.VERSI_SKEMA } }], 'sistem');
      laporan.push('Versi skema diperbarui ke ' + APP.VERSI_SKEMA + '.');
    }
    cacheHapus_('pengaturan');

    // Owner awal.
    const adaOwner = bacaSemua_('Users').some(function (u) { return u.role === ROLE.OWNER && u.aktif; });
    if (!adaOwner) {
      pinOwner = pinAcak_();
      const salt = buatSalt_();
      tambahBaris_('Users', [{
        username: 'owner', nama: 'Pemilik Toko', role: ROLE.OWNER, pin_hash: hashPin_(pinOwner, salt), salt: salt,
        aktif: true, wajib_ganti_pin: true, gagal_login: 0, kunci_sampai: '', last_login: ''
      }], 'sistem');
      catatAudit_('sistem', 'buat_owner_awal', 'USER', '', { username: 'owner' });
      laporan.push('Akun Owner awal dibuat.');
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  let pesan = 'Database siap (skema v' + APP.VERSI_SKEMA + ', ' + Object.keys(SKEMA).length + ' sheet).\n\n' +
    (laporan.length ? laporan.join('\n') : 'Tidak ada perubahan.');
  if (pinOwner) {
    pesan += '\n\n=== CATAT SEKARANG (hanya ditampilkan sekali) ===\nUsername: owner\nPIN: ' + pinOwner +
      '\nAnda wajib mengganti PIN saat login pertama.';
  }
  infoAdmin_('Setup Database', pesan);
  return { laporan: laporan, owner_dibuat: !!pinOwner };
}

/**
 * Siapkan satu sheet: buat bila belum ada, lengkapi header, format kolom.
 * @return {string|null} ringkasan perubahan.
 */
function siapkanSheet_(ss, nama) {
  const kolom = kolomSheet_(nama);
  let sh = ss.getSheetByName(nama);
  let ringkasan = null;

  if (!sh) {
    sh = ss.insertSheet(nama);
    pastikanKolom_(sh, kolom.length);
    sh.getRange(1, 1, 1, kolom.length).setValues([kolom.map(function (k) { return k[0]; })]);
    ringkasan = 'Sheet dibuat: ' + nama;
  } else {
    const headerLama = petaHeader_(sh);
    const kurang = kolom.filter(function (k) { return headerLama[k[0]] === undefined; });
    if (kurang.length) {
      const mulai = sh.getLastColumn() + 1;
      pastikanKolom_(sh, mulai + kurang.length - 1);
      sh.getRange(1, mulai, 1, kurang.length).setValues([kurang.map(function (k) { return k[0]; })]);
      ringkasan = '[MIGRASI] Kolom ditambahkan di ' + nama + ': ' + kurang.map(function (k) { return k[0]; }).join(', ');
    }
  }

  // Format: header tebal & dibekukan; kolom non-angka diformat teks (satu panggilan RangeList).
  const header = petaHeader_(sh);
  const lebar = sh.getLastColumn();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, lebar).setFontWeight('bold').setBackground('#1F2933').setFontColor('#FFFFFF');
  const a1Teks = kolom
    .filter(function (k) { return k[1] !== 'n'; })
    .map(function (k) { const h = hurufKolom_(header[k[0]] + 1); return h + ':' + h; });
  if (a1Teks.length) sh.getRangeList(a1Teks).setNumberFormat('@');
  return ringkasan;
}

/** Pastikan grid sheet memiliki minimal "jumlah" kolom. */
function pastikanKolom_(sh, jumlah) {
  const maks = sh.getMaxColumns();
  if (jumlah > maks) sh.insertColumnsAfter(maks, jumlah - maks);
}

/** 1 → A, 27 → AA. */
function hurufKolom_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Hapus sheet bawaan (Sheet1/Lembar1) bila kosong & di luar skema. */
function hapusSheetBawaanKosong_(ss) {
  ss.getSheets().forEach(function (sh) {
    const nama = sh.getName();
    if (!SKEMA[nama] && /^(Sheet|Lembar)\s?\d+$/i.test(nama) && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });
}

/** Pasang trigger backup harian (jendela 23:00–24:00 WIB). Aman dijalankan ulang. */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupTerjadwal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupTerjadwal').timeBased().everyDays(1).atHour(23).inTimezone(APP.TZ).create();
  // Fase 1 menambahkan trigger pembersihan sesi kedaluwarsa di sini.
  infoAdmin_('Trigger', 'Trigger backup harian terpasang (setiap hari antara pukul 23:00–24:00 WIB).');
}

/** Dipanggil trigger harian. */
function backupTerjadwal() {
  try {
    backupSekarang({ diam: true });
  } catch (err) {
    console.error('Backup terjadwal gagal: ' + (err && err.stack ? err.stack : err));
  }
}

/**
 * Salin Spreadsheet database ke folder Drive "Backup POS", simpan 30 salinan terbaru.
 * Salinan lama dipindah ke Sampah Drive (masih bisa dipulihkan ±30 hari).
 */
function backupSekarang(opsi) {
  opsi = opsi || {};
  const ss = ss_();
  const folder = folderBackup_();
  const nama = 'Backup POS - ' + ss.getName() + ' - ' + Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HHmm');
  const salinan = DriveApp.getFileById(ss.getId()).makeCopy(nama, folder);

  // Rotasi: simpan N terbaru.
  const daftar = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('Backup POS - ') === 0) daftar.push(f);
  }
  daftar.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  const dibuang = daftar.slice(APP.BACKUP_SIMPAN);
  dibuang.forEach(function (f) { f.setTrashed(true); });

  catatAudit_('sistem', 'backup', 'SETTING', salinan.getId(), { nama: nama, dibuang: dibuang.length });
  if (!opsi.diam) {
    infoAdmin_('Backup', 'Backup berhasil: ' + nama + '\nFolder: ' + APP.BACKUP_FOLDER +
      '\nSalinan lama dipindah ke Sampah: ' + dibuang.length);
  }
  return { file_id: salinan.getId(), nama: nama, dibuang: dibuang.length };
}

/** Folder backup (ID diingat agar tidak membuat folder ganda). */
function folderBackup_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* folder terhapus → buat baru */ }
  }
  const ada = DriveApp.getFoldersByName(APP.BACKUP_FOLDER);
  const folder = ada.hasNext() ? ada.next() : DriveApp.createFolder(APP.BACKUP_FOLDER);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * DARURAT: reset PIN akun Owner pertama yang aktif ke PIN acak baru.
 * Hanya bisa dijalankan oleh pemilik Spreadsheet dari editor/menu (bukan lewat API).
 */
function resetPinOwner() {
  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  let owner;
  let pin;
  try {
    owner = bacaSemua_('Users').filter(function (u) { return u.role === ROLE.OWNER; })[0];
    if (!owner) throw new Error('Belum ada akun Owner. Jalankan setupDatabase().');
    pin = pinAcak_();
    const salt = buatSalt_();
    ubahBaris_('Users', [{
      id: owner.id,
      data: { pin_hash: hashPin_(pin, salt), salt: salt, aktif: true, wajib_ganti_pin: true, gagal_login: 0, kunci_sampai: '' }
    }], 'sistem');
    catatAudit_('sistem', 'reset_pin_owner_darurat', 'USER', owner.id, { username: owner.username });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  infoAdmin_('Reset PIN Owner', 'Username: ' + owner.username + '\nPIN baru: ' + pin +
    '\nWajib diganti saat login berikutnya.');
}

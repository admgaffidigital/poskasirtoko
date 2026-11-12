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
  VERSI: '1.0.0',
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
  'sistem.ping': { publik: true, handler: aksiSistemPing_ },

  // Auth (Fase 1)
  'auth.login': { publik: true, tulis: true, handler: aksiAuthLogin_ },
  'auth.logout': { publik: false, tulis: true, handler: aksiAuthLogout_ },
  'auth.me': { publik: false, handler: aksiAuthMe_ },
  'auth.gantiPin': { publik: false, tulis: true, handler: aksiAuthGantiPin_ },

  // Kategori (Fase 1)
  'kategori.list': { publik: false, roles: SEMUA_ROLE, handler: aksiKategoriList_ },
  'kategori.create': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiKategoriCreate_ },
  'kategori.update': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiKategoriUpdate_ },
  'kategori.delete': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiKategoriDelete_ },

  // Produk (Fase 1)
  'produk.list': { publik: false, roles: SEMUA_ROLE, handler: aksiProdukList_ },
  'produk.create': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiProdukCreate_ },
  'produk.update': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiProdukUpdate_ },
  'produk.delete': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiProdukDelete_ },

  // Pengaturan (Fase 1)
  'pengaturan.get': { publik: false, roles: SEMUA_ROLE, handler: aksiPengaturanGet_ },
  'pengaturan.set': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiPengaturanSet_ },

  // User Management (Fase 1)
  'user.list': { publik: false, roles: [ROLE.OWNER], handler: aksiUserList_ },
  'user.create': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiUserCreate_ },
  'user.update': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiUserUpdate_ },
  'user.resetPin': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiUserResetPin_ },

  // POS Penjualan (Fase 2)
  'penjualan.create': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPenjualanCreate_ },
  'penjualan.pending.save': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPenjualanPendingSave_ },
  'penjualan.pending.list': { publik: false, roles: SEMUA_ROLE, handler: aksiPenjualanPendingList_ },
  'penjualan.pending.delete': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPenjualanPendingDelete_ },
  'penjualan.detail': { publik: false, roles: SEMUA_ROLE, handler: aksiPenjualanDetail_ },
  'penjualan.void': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiPenjualanVoid_ },
  'pelanggan.list': { publik: false, roles: SEMUA_ROLE, handler: aksiPelangganList_ },

  // Supplier (Fase 3)
  'supplier.list': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiSupplierList_ },
  'supplier.create': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiSupplierCreate_ },
  'supplier.update': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiSupplierUpdate_ },
  'supplier.delete': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiSupplierDelete_ },

  // POS Pembelian (Fase 3)
  'pembelian.list': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiPembelianList_ },
  'pembelian.detail': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiPembelianDetail_ },
  'pembelian.create': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiPembelianCreate_ },

  // Kartu Stok (Fase 3)
  'kartuStok.list': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiKartuStokList_ },

  // Stok Opname (Fase 3)
  'opname.list': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiOpnameList_ },
  'opname.create': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiOpnameCreate_ },
  'opname.approve': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiOpnameApprove_ },

  // Piutang & Hutang (Fase 4)
  'piutang.list': { publik: false, roles: SEMUA_ROLE, handler: aksiPiutangList_ },
  'piutang.detail': { publik: false, roles: SEMUA_ROLE, handler: aksiPiutangDetail_ },
  'piutang.bayar': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPiutangBayar_ },
  'hutang.list': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiHutangList_ },
  'hutang.detail': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiHutangDetail_ },
  'hutang.bayar': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiHutangBayar_ },

  // Retur Penjualan & Pembelian (Fase 4)
  'retur.list': { publik: false, roles: SEMUA_ROLE, handler: aksiReturList_ },
  'retur.detail': { publik: false, roles: SEMUA_ROLE, handler: aksiReturDetail_ },
  'retur.create': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiReturCreate_ },
  'retur.approve': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiReturApprove_ },
  'retur.reject': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiReturReject_ },

  // Pelanggan & Member (Fase 5)
  'pelanggan.detail': { publik: false, roles: SEMUA_ROLE, handler: aksiPelangganDetail_ },
  'pelanggan.create': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPelangganCreate_ },
  'pelanggan.update': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPelangganUpdate_ },
  'pelanggan.delete': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiPelangganDelete_ },

  // Katalog Hadiah & Loyalitas Poin (Fase 5)
  'hadiah.list': { publik: false, roles: SEMUA_ROLE, handler: aksiHadiahList_ },
  'hadiah.create': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiHadiahCreate_ },
  'hadiah.update': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiHadiahUpdate_ },
  'hadiah.delete': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiHadiahDelete_ },
  'member.tukarPoin': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiMemberTukarPoin_ },
  'member.riwayatPoin': { publik: false, roles: SEMUA_ROLE, handler: aksiMemberRiwayatPoin_ },

  // Laporan & Dashboard (Fase 6)
  'laporan.dashboard': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiLaporanDashboard_ },
  'laporan.penjualan': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiLaporanPenjualan_ },
  'laporan.pembelian': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiLaporanPembelian_ },
  'laporan.labaRugi': { publik: false, roles: [ROLE.OWNER], handler: aksiLaporanLabaRugi_ },
  'laporan.arusKas': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiLaporanArusKas_ },
  'laporan.stokValuasi': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiLaporanStokValuasi_ }
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
  let token = typeof req.token === 'string' ? req.token.trim() : '';
  if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
    token = token.substring(1, token.length - 1).trim();
  }
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
 * Tahan pembersihan cache: membaca dari sheet `Sesi` dan memverifikasi waktu kedaluwarsa.
 */
function validasiSesi_(token) {
  if (!token || typeof token !== 'string') {
    gagal_(KODE.AUTH_INVALID, 'Token sesi tidak valid.');
  }
  let t = token.trim();
  // Bersihkan kutip ganda bila client menyimpan string JSON berlebih
  if (t.startsWith('"') && t.endsWith('"') && t.length > 2) {
    t = t.substring(1, t.length - 1).trim();
  }
  const th = sha256Hex_(t);
  const cacheKey = 'sesi_' + th;
  const dariCache = cacheAmbil_(cacheKey);
  if (dariCache && dariCache.id) {
    return dariCache;
  }

  const semuaSesi = bacaSemua_('Sesi');
  const sesi = semuaSesi.filter(function (s) { return s.token_hash === th && !s.deleted; })[0];
  if (!sesi) {
    gagal_(KODE.AUTH_INVALID, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.');
  }

  // Cek kedaluwarsa waktu
  if (sesi.kedaluwarsa) {
    const tExp = new Date(String(sesi.kedaluwarsa).replace(' ', 'T')).getTime();
    if (isFinite(tExp) && tExp < Date.now()) {
      hapusLunak_('Sesi', sesi.id, 'sistem');
      gagal_(KODE.AUTH_INVALID, 'Sesi Anda telah kedaluwarsa. Silakan login kembali.');
    }
  }

  const u = cariById_('Users', sesi.user_id);
  if (!u || !u.aktif || u.deleted) {
    gagal_(KODE.AUTH_INVALID, 'Akun pengguna tidak aktif atau tidak ditemukan.');
  }

  const userAman = {
    id: u.id,
    username: u.username,
    nama: u.nama,
    role: u.role,
    wajib_ganti_pin: !!u.wajib_ganti_pin
  };

  cacheSimpan_(cacheKey, userAman, 300); // Cache 5 menit
  return userAman;
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
  const valid = ['INV', 'PB', 'RT', 'OP', 'TK', 'MBR'];
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
  nonNegatif: function (nilai, label, opsi) {
    return V_.angka(nilai, label, Object.assign({ min: 0 }, opsi || {}));
  },
  positif: function (nilai, label, opsi) {
    return V_.angka(nilai, label, Object.assign({ min: 1 }, opsi || {}));
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

/* ---------- 9.1 AUTENTIKASI & SESI ---------- */

/** auth.login — Login dengan username & 6-digit PIN. */
function aksiAuthLogin_(ctx) {
  const p = ctx.payload || {};
  const username = V_.teks(p.username, 'Username', { wajib: true, maks: 50 });
  const pin = V_.pin(p.pin);

  const semuaUser = bacaSemua_('Users');
  const user = semuaUser.filter(function (u) {
    return String(u.username || '').toLowerCase() === username.toLowerCase();
  })[0];

  if (!user || user.deleted) {
    gagal_(KODE.AUTH_INVALID, 'Username atau PIN salah.');
  }

  if (!user.aktif) {
    gagal_(KODE.FORBIDDEN, 'Akun pengguna ini telah dinonaktifkan.');
  }

  // Cek apakah akun sedang terkunci karena gagal 5x
  if (user.kunci_sampai) {
    const tKunci = new Date(String(user.kunci_sampai).replace(' ', 'T')).getTime();
    if (isFinite(tKunci) && tKunci > Date.now()) {
      gagal_(KODE.AUTH_LOCKED, 'Akun Anda terkunci sementara hingga ' + user.kunci_sampai + ' karena salah PIN 5 kali.');
    }
  }

  // Verifikasi hash PIN
  const hashMasuk = hashPin_(pin, user.salt);
  if (hashMasuk !== user.pin_hash) {
    const peng = ambilPengaturan_();
    const maksGagal = peng.login_maks_gagal || 5;
    const kunciMenit = peng.login_kunci_menit || 15;
    const gagalBaru = (Number(user.gagal_login) || 0) + 1;
    let waktuKunciStr = '';

    if (gagalBaru >= maksGagal) {
      waktuKunciStr = formatWaktu_(new Date(Date.now() + kunciMenit * 60 * 1000));
    }

    ubahBaris_('Users', [{
      id: user.id,
      data: { gagal_login: gagalBaru, kunci_sampai: waktuKunciStr }
    }], 'sistem');

    catatAudit_(user.id, 'login_gagal', 'AUTH', user.id, { username: user.username, percobaan: gagalBaru });

    if (waktuKunciStr) {
      gagal_(KODE.AUTH_LOCKED, 'PIN salah 5 kali berturut-turut. Akun dikunci selama 15 menit (hingga ' + waktuKunciStr + ').');
    } else {
      const sisa = maksGagal - gagalBaru;
      gagal_(KODE.AUTH_INVALID, 'Username atau PIN salah. Sisa percobaan: ' + sisa + ' kali.');
    }
  }

  // Login berhasil: reset counter gagal & update last_login
  const waktuSekarang = sekarang_();
  ubahBaris_('Users', [{
    id: user.id,
    data: { gagal_login: 0, kunci_sampai: '', last_login: waktuSekarang }
  }], 'sistem');

  // Buat sesi baru
  const token = buatToken_();
  const tokenHash = sha256Hex_(token);
  const peng = ambilPengaturan_();
  const durasiJam = Number(peng.sesi_jam) || 6;
  const tglKedaluwarsa = formatWaktu_(new Date(Date.now() + durasiJam * 3600 * 1000));

  tambahBaris_('Sesi', [{
    user_id: user.id,
    token_hash: tokenHash,
    kedaluwarsa: tglKedaluwarsa,
    terakhir_aktif: waktuSekarang,
    perangkat: p.perangkat || 'Web'
  }], user.id);

  const userAman = {
    id: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role,
    wajib_ganti_pin: !!user.wajib_ganti_pin
  };

  cacheSimpan_('sesi_' + tokenHash, userAman, 300);
  catatAudit_(user.id, 'login_sukses', 'AUTH', user.id, { username: user.username, role: user.role });

  return {
    token: token,
    user: userAman
  };
}

/** auth.logout — Mengakhiri sesi aktif. */
function aksiAuthLogout_(ctx) {
  let t = (ctx.token || '').trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length > 2) {
    t = t.substring(1, t.length - 1).trim();
  }
  const th = sha256Hex_(t);
  const semuaSesi = bacaSemua_('Sesi');
  const sesi = semuaSesi.filter(function (s) { return s.token_hash === th && !s.deleted; })[0];
  if (sesi) {
    hapusLunak_('Sesi', sesi.id, ctx.user.id);
  }
  cacheHapus_('sesi_' + th);
  catatAudit_(ctx.user.id, 'logout', 'AUTH', ctx.user.id, {});
  return { pesan: 'Logout berhasil.' };
}

/** auth.me — Mengambil data profil sesi pengguna yang sedang aktif. */
function aksiAuthMe_(ctx) {
  return { user: ctx.user };
}

/** auth.gantiPin — Mengganti PIN user sendiri. */
function aksiAuthGantiPin_(ctx) {
  const p = ctx.payload || {};
  const pinLama = V_.pin(p.pin_lama);
  const pinBaru = V_.pin(p.pin_baru);

  if (pinLama === pinBaru) {
    gagal_(KODE.VALIDATION, 'PIN baru harus berbeda dengan PIN lama.');
  }

  const u = cariById_('Users', ctx.user.id);
  if (!u || u.deleted) {
    gagal_(KODE.AUTH_INVALID, 'Data pengguna tidak ditemukan.');
  }

  if (hashPin_(pinLama, u.salt) !== u.pin_hash) {
    gagal_(KODE.VALIDATION, 'PIN lama Anda salah.');
  }

  const saltBaru = buatSalt_();
  ubahBaris_('Users', [{
    id: u.id,
    data: {
      pin_hash: hashPin_(pinBaru, saltBaru),
      salt: saltBaru,
      wajib_ganti_pin: false
    }
  }], ctx.user.id);

  // Perbarui cache sesi
  ctx.user.wajib_ganti_pin = false;
  cacheSimpan_('sesi_' + sha256Hex_(ctx.token), ctx.user, 300);
  catatAudit_(ctx.user.id, 'ganti_pin', 'AUTH', u.id, {});

  return { pesan: 'PIN Anda berhasil diperbarui.' };
}

/* ---------- 9.2 KATEGORI PRODUK ---------- */

/** kategori.list — Mengambil semua kategori aktif. */
function aksiKategoriList_() {
  const items = bacaSemua_('Kategori').filter(function (k) { return !k.deleted; });
  items.sort(function (a, b) {
    const ua = Number(a.urutan) || 0;
    const ub = Number(b.urutan) || 0;
    if (ua !== ub) return ua - ub;
    return String(a.nama || '').localeCompare(String(b.nama || ''));
  });
  return { items: items };
}

/** kategori.create — Tambah kategori baru (Owner & Admin). */
function aksiKategoriCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Kategori', { wajib: true, maks: 100 });
  const parentId = p.parent_id ? String(p.parent_id).trim() : '';
  const urutan = V_.angka(p.urutan, 'Urutan', { bawaan: 0 });

  const dibuat = tambahBaris_('Kategori', [{
    nama: nama,
    parent_id: parentId,
    urutan: urutan
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'kategori_tambah', 'KATEGORI', dibuat.id, { nama: nama });
  return dibuat;
}

/** kategori.update — Edit kategori (Owner & Admin). */
function aksiKategoriUpdate_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Kategori', { wajib: true });
  const nama = V_.teks(p.nama, 'Nama Kategori', { wajib: true, maks: 100 });
  const parentId = p.parent_id ? String(p.parent_id).trim() : '';
  const urutan = V_.angka(p.urutan, 'Urutan', { bawaan: 0 });

  if (parentId === id) {
    gagal_(KODE.VALIDATION, 'Kategori tidak dapat menjadi induk dirinya sendiri.');
  }

  const diubah = ubahBaris_('Kategori', [{
    id: id,
    data: { nama: nama, parent_id: parentId, urutan: urutan }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'kategori_ubah', 'KATEGORI', id, { nama: nama });
  return diubah;
}

/** kategori.delete — Hapus kategori (soft delete). */
function aksiKategoriDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Kategori', { wajib: true });

  // Cek apakah ada produk aktif yang masih menggunakan kategori ini
  const produkTerkait = bacaSemua_('Produk').some(function (pr) {
    return pr.kategori_id === id && !pr.deleted;
  });
  if (produkTerkait) {
    gagal_(KODE.CONFLICT, 'Kategori ini tidak dapat dihapus karena masih digunakan oleh produk aktif.');
  }

  hapusLunak_('Kategori', id, ctx.user.id);
  catatAudit_(ctx.user.id, 'kategori_hapus', 'KATEGORI', id, {});
  return { pesan: 'Kategori berhasil dihapus.' };
}

/* ---------- 9.3 PRODUK, VARIAN & SATUAN KONVERSI ---------- */

/** produk.list — Daftar produk dengan varian & satuan, filter & paginasi. */
function aksiProdukList_(ctx) {
  const p = ctx.payload || {};
  const isKasir = ctx.user.role === ROLE.KASIR;

  const produk = bacaSemua_('Produk');
  const varianSemua = bacaSemua_('Varian');
  const satuanSemua = bacaSemua_('Satuan_Konversi');

  // Indeks varian dan satuan konversi berdasarkan produk_id
  const petaVarian = {};
  varianSemua.forEach(function (v) {
    if (v.deleted) return;
    if (!petaVarian[v.produk_id]) petaVarian[v.produk_id] = [];
    const vCopy = Object.assign({}, v);
    if (isKasir) vCopy.hpp = null; // Kasir TIDAK BOLEH melihat HPP
    petaVarian[v.produk_id].push(vCopy);
  });

  const petaSatuan = {};
  satuanSemua.forEach(function (s) {
    if (s.deleted) return;
    if (!petaSatuan[s.produk_id]) petaSatuan[s.produk_id] = [];
    petaSatuan[s.produk_id].push(Object.assign({}, s));
  });

  // Susun data produk lengkap
  const daftarLengkap = produk.map(function (pr) {
    const prAman = Object.assign({}, pr);
    if (isKasir) prAman.hpp = null; // Kasir TIDAK BOLEH melihat HPP
    prAman.varian = petaVarian[pr.id] || [];
    prAman.satuan_konversi = petaSatuan[pr.id] || [];
    return prAman;
  });

  // Filter kategori
  let tersaring = daftarLengkap;
  if (p.kategori_id) {
    tersaring = tersaring.filter(function (pr) { return pr.kategori_id === p.kategori_id; });
  }

  // Filter hanya produk aktif
  if (p.aktif_saja) {
    tersaring = tersaring.filter(function (pr) { return pr.aktif; });
  }

  // Pencarian q (nama, sku, barcode, nama varian, barcode varian)
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    tersaring = tersaring.filter(function (pr) {
      if (String(pr.nama || '').toLowerCase().indexOf(q) !== -1) return true;
      if (String(pr.sku || '').toLowerCase().indexOf(q) !== -1) return true;
      if (String(pr.barcode || '').toLowerCase().indexOf(q) !== -1) return true;
      return pr.varian.some(function (v) {
        return String(v.nama_varian || '').toLowerCase().indexOf(q) !== -1 ||
          String(v.sku || '').toLowerCase().indexOf(q) !== -1 ||
          String(v.barcode || '').toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  // Paginasi
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: tersaring.slice(mulai, mulai + limit),
    total: tersaring.length,
    page: page,
    limit: limit
  };
}

/** produk.create — Tambah master produk lengkap (Owner & Admin). */
function aksiProdukCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Produk', { wajib: true, maks: 200 });
  const sku = V_.teks(p.sku, 'SKU Produk', { maks: 50 });
  const barcode = V_.teks(p.barcode, 'Barcode', { maks: 50 });
  const kategoriId = p.kategori_id ? String(p.kategori_id).trim() : '';
  const satuanDasar = V_.teks(p.satuan_dasar, 'Satuan Dasar', { wajib: true, maks: 30 });
  const hpp = V_.rupiah(p.hpp, 'HPP', { bawaan: 0 });
  const hargaRitel = V_.rupiah(p.harga_ritel, 'Harga Ritel', { wajib: true });
  const hargaGrosir = V_.rupiah(p.harga_grosir, 'Harga Grosir', { bawaan: hargaRitel });
  const minGrosirQty = V_.qty(p.min_grosir_qty || 1, 'Min Grosir Qty');
  const stok = V_.angka(p.stok, 'Stok Awal', { bawaan: 0 });
  const stokMin = V_.angka(p.stok_min, 'Stok Minimum', { bawaan: 0 });
  const punyaVarian = !!p.punya_varian;
  const fotoUrl = V_.teks(p.foto_url, 'Foto URL', { maks: 500 });
  const aktif = p.aktif !== false;

  // Aturan Bisnis #1: Harga jual tidak boleh < HPP
  if (hargaRitel < hpp) {
    gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel (' + hargaRitel + ') tidak boleh di bawah HPP (' + hpp + ').');
  }
  if (hargaGrosir < hpp) {
    gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir (' + hargaGrosir + ') tidak boleh di bawah HPP (' + hpp + ').');
  }

  // Simpan record master produk
  const produkBaru = tambahBaris_('Produk', [{
    sku: sku,
    barcode: barcode,
    nama: nama,
    kategori_id: kategoriId,
    satuan_dasar: satuanDasar,
    hpp: hpp,
    harga_ritel: hargaRitel,
    harga_grosir: hargaGrosir,
    min_grosir_qty: minGrosirQty,
    stok: stok,
    stok_min: stokMin,
    punya_varian: punyaVarian,
    foto_url: fotoUrl,
    aktif: aktif
  }], ctx.user.id)[0];

  // Simpan varian jika ada
  const varianInput = Array.isArray(p.varian) ? p.varian : [];
  let totalStokVarian = 0;
  if (punyaVarian && varianInput.length) {
    const barisVarian = varianInput.map(function (v) {
      const vHpp = V_.rupiah(v.hpp || hpp, 'HPP Varian', { bawaan: hpp });
      const vRitel = V_.rupiah(v.harga_ritel || hargaRitel, 'Harga Ritel Varian', { wajib: true });
      const vGrosir = V_.rupiah(v.harga_grosir || hargaGrosir, 'Harga Grosir Varian', { bawaan: vRitel });
      if (vRitel < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel varian tidak boleh di bawah HPP.');
      if (vGrosir < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir varian tidak boleh di bawah HPP.');
      const vStok = V_.angka(v.stok, 'Stok Varian', { bawaan: 0 });
      totalStokVarian += vStok;
      return {
        produk_id: produkBaru.id,
        nama_varian: V_.teks(v.nama_varian, 'Nama Varian', { wajib: true }),
        sku: V_.teks(v.sku, 'SKU Varian', { maks: 50 }),
        barcode: V_.teks(v.barcode, 'Barcode Varian', { maks: 50 }),
        hpp: vHpp,
        harga_ritel: vRitel,
        harga_grosir: vGrosir,
        stok: vStok,
        stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
        aktif: v.aktif !== false
      };
    });
    tambahBaris_('Varian', barisVarian, ctx.user.id);

    // Update stok produk induk sesuai jumlah stok varian (Aturan Bisnis #17)
    ubahBaris_('Produk', [{ id: produkBaru.id, data: { stok: totalStokVarian } }], ctx.user.id);
    produkBaru.stok = totalStokVarian;
  }

  // Simpan satuan konversi jika ada
  const satuanInput = Array.isArray(p.satuan_konversi) ? p.satuan_konversi : [];
  if (satuanInput.length) {
    const barisSatuan = satuanInput.map(function (s) {
      const faktor = V_.angka(s.faktor, 'Faktor Satuan', { wajib: true, min: 0.001 });
      const hppSatuan = Math.round(hpp * faktor);
      const sRitel = V_.rupiah(s.harga_ritel, 'Harga Ritel Satuan (' + s.satuan + ')', { wajib: true });
      const sGrosir = V_.rupiah(s.harga_grosir, 'Harga Grosir Satuan', { bawaan: sRitel });
      if (sRitel < hppSatuan) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga konversi satuan ' + s.satuan + ' tidak boleh di bawah HPP konversi (' + hppSatuan + ').');
      return {
        produk_id: produkBaru.id,
        satuan: V_.teks(s.satuan, 'Nama Satuan Konversi', { wajib: true }),
        faktor: faktor,
        barcode: V_.teks(s.barcode, 'Barcode Satuan', { maks: 50 }),
        harga_ritel: sRitel,
        harga_grosir: sGrosir
      };
    });
    tambahBaris_('Satuan_Konversi', barisSatuan, ctx.user.id);
  }

  // Catat stok awal ke Kartu_Stok jika ada saldo awal (Aturan Bisnis #5)
  const saldoAkhir = punyaVarian ? totalStokVarian : stok;
  if (saldoAkhir > 0) {
    tambahBaris_('Kartu_Stok', [{
      produk_id: produkBaru.id,
      varian_id: '',
      tipe: 'koreksi',
      qty: saldoAkhir,
      saldo: saldoAkhir,
      hpp: hpp,
      ref_id: produkBaru.id,
      user_id: ctx.user.id,
      keterangan: 'Saldo stok awal saat produk dibuat'
    }], ctx.user.id);
  }

  catatAudit_(ctx.user.id, 'produk_tambah', 'PRODUK', produkBaru.id, { nama: nama, sku: sku, hpp: hpp, harga_ritel: hargaRitel });
  return produkBaru;
}

/** produk.update — Edit master produk & sinkronisasi varian/satuan (Owner & Admin). */
function aksiProdukUpdate_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Produk', { wajib: true });
  const lama = cariById_('Produk', id);
  if (!lama || lama.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  const nama = V_.teks(p.nama, 'Nama Produk', { wajib: true, maks: 200 });
  const sku = V_.teks(p.sku, 'SKU Produk', { maks: 50 });
  const barcode = V_.teks(p.barcode, 'Barcode', { maks: 50 });
  const kategoriId = p.kategori_id ? String(p.kategori_id).trim() : '';
  const satuanDasar = V_.teks(p.satuan_dasar, 'Satuan Dasar', { wajib: true, maks: 30 });
  const hpp = V_.rupiah(p.hpp, 'HPP', { bawaan: lama.hpp });
  const hargaRitel = V_.rupiah(p.harga_ritel, 'Harga Ritel', { wajib: true });
  const hargaGrosir = V_.rupiah(p.harga_grosir, 'Harga Grosir', { bawaan: hargaRitel });
  const minGrosirQty = V_.qty(p.min_grosir_qty || 1, 'Min Grosir Qty');
  const stokMin = V_.angka(p.stok_min, 'Stok Minimum', { bawaan: 0 });
  const punyaVarian = !!p.punya_varian;
  const fotoUrl = V_.teks(p.foto_url, 'Foto URL', { maks: 500 });
  const aktif = p.aktif !== false;

  if (hargaRitel < hpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel tidak boleh di bawah HPP.');
  if (hargaGrosir < hpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir tidak boleh di bawah HPP.');

  // Update data produk induk
  const diubah = ubahBaris_('Produk', [{
    id: id,
    data: {
      sku: sku,
      barcode: barcode,
      nama: nama,
      kategori_id: kategoriId,
      satuan_dasar: satuanDasar,
      hpp: hpp,
      harga_ritel: hargaRitel,
      harga_grosir: hargaGrosir,
      min_grosir_qty: minGrosirQty,
      stok_min: stokMin,
      punya_varian: punyaVarian,
      foto_url: fotoUrl,
      aktif: aktif
    }
  }], ctx.user.id)[0];

  // Sinkronisasi varian jika array dikirimkan
  if (Array.isArray(p.varian)) {
    const varianLama = bacaSemua_('Varian').filter(function (v) { return v.produk_id === id && !v.deleted; });
    const idBaru = {};
    let totalStokVarian = 0;

    p.varian.forEach(function (v) {
      const vHpp = V_.rupiah(v.hpp || hpp, 'HPP Varian', { bawaan: hpp });
      const vRitel = V_.rupiah(v.harga_ritel || hargaRitel, 'Harga Ritel Varian', { wajib: true });
      const vGrosir = V_.rupiah(v.harga_grosir || hargaGrosir, 'Harga Grosir Varian', { bawaan: vRitel });
      if (vRitel < vHpp || vGrosir < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga varian tidak boleh di bawah HPP.');
      const vStok = V_.angka(v.stok, 'Stok Varian', { bawaan: 0 });
      totalStokVarian += vStok;

      if (v.id) {
        idBaru[v.id] = true;
        ubahBaris_('Varian', [{
          id: v.id,
          data: {
            nama_varian: V_.teks(v.nama_varian, 'Nama Varian', { wajib: true }),
            sku: V_.teks(v.sku, 'SKU Varian', { maks: 50 }),
            barcode: V_.teks(v.barcode, 'Barcode Varian', { maks: 50 }),
            hpp: vHpp,
            harga_ritel: vRitel,
            harga_grosir: vGrosir,
            stok: vStok,
            stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
            aktif: v.aktif !== false
          }
        }], ctx.user.id);
      } else {
        const vBaru = tambahBaris_('Varian', [{
          produk_id: id,
          nama_varian: V_.teks(v.nama_varian, 'Nama Varian', { wajib: true }),
          sku: V_.teks(v.sku, 'SKU Varian', { maks: 50 }),
          barcode: V_.teks(v.barcode, 'Barcode Varian', { maks: 50 }),
          hpp: vHpp,
          harga_ritel: vRitel,
          harga_grosir: vGrosir,
          stok: vStok,
          stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
          aktif: v.aktif !== false
        }], ctx.user.id)[0];
        idBaru[vBaru.id] = true;
      }
    });

    // Soft delete varian yang dihilangkan
    varianLama.forEach(function (vl) {
      if (!idBaru[vl.id]) hapusLunak_('Varian', vl.id, ctx.user.id);
    });

    if (punyaVarian) {
      ubahBaris_('Produk', [{ id: id, data: { stok: totalStokVarian } }], ctx.user.id);
      diubah.stok = totalStokVarian;
    }
  }

  // Sinkronisasi satuan konversi
  if (Array.isArray(p.satuan_konversi)) {
    const satuanLama = bacaSemua_('Satuan_Konversi').filter(function (s) { return s.produk_id === id && !s.deleted; });
    satuanLama.forEach(function (sl) { hapusLunak_('Satuan_Konversi', sl.id, ctx.user.id); });

    const barisSatuan = p.satuan_konversi.map(function (s) {
      const faktor = V_.angka(s.faktor, 'Faktor Satuan', { wajib: true, min: 0.001 });
      const hppSatuan = Math.round(hpp * faktor);
      const sRitel = V_.rupiah(s.harga_ritel, 'Harga Ritel Satuan', { wajib: true });
      const sGrosir = V_.rupiah(s.harga_grosir, 'Harga Grosir Satuan', { bawaan: sRitel });
      if (sRitel < hppSatuan) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga konversi satuan ' + s.satuan + ' tidak boleh di bawah HPP.');
      return {
        produk_id: id,
        satuan: V_.teks(s.satuan, 'Nama Satuan', { wajib: true }),
        faktor: faktor,
        barcode: V_.teks(s.barcode, 'Barcode Satuan', { maks: 50 }),
        harga_ritel: sRitel,
        harga_grosir: sGrosir
      };
    });
    if (barisSatuan.length) tambahBaris_('Satuan_Konversi', barisSatuan, ctx.user.id);
  }

  catatAudit_(ctx.user.id, 'produk_ubah', 'PRODUK', id, { nama: nama, sku: sku });
  return diubah;
}

/** produk.delete — Soft delete produk & varian terkait (Owner & Admin). */
function aksiProdukDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Produk', { wajib: true });

  hapusLunak_('Produk', id, ctx.user.id);

  // Soft delete seluruh varian & satuan konversi terkait
  bacaSemua_('Varian').filter(function (v) { return v.produk_id === id && !v.deleted; }).forEach(function (v) {
    hapusLunak_('Varian', v.id, ctx.user.id);
  });
  bacaSemua_('Satuan_Konversi').filter(function (s) { return s.produk_id === id && !s.deleted; }).forEach(function (s) {
    hapusLunak_('Satuan_Konversi', s.id, ctx.user.id);
  });

  catatAudit_(ctx.user.id, 'produk_hapus', 'PRODUK', id, {});
  return { pesan: 'Produk berhasil dihapus.' };
}

/* ---------- 9.4 PENGATURAN UMUM ---------- */

/** pengaturan.get — Membaca konfigurasi operasional toko. */
function aksiPengaturanGet_() {
  return { pengaturan: ambilPengaturan_() };
}

/** pengaturan.set — Mengubah konfigurasi operasional toko (Khusus Owner). */
function aksiPengaturanSet_(ctx) {
  const p = ctx.payload || {};
  const kunciDukungan = Object.keys(PENGATURAN_DEFAULT);
  const barisPengaturan = bacaSemua_('Pengaturan', { termasukTerhapus: true });
  const petaId = {};
  barisPengaturan.forEach(function (row) { petaId[row.key] = row.id; });

  const diubah = [];
  const ditambah = [];

  kunciDukungan.forEach(function (k) {
    if (p[k] !== undefined) {
      let val = p[k];
      if (k === 'diskon_maks_kasir_persen') val = V_.angka(val, 'Maks Diskon Kasir', { min: 0, max: 100 });
      if (k === 'pajak_persen') val = V_.angka(val, 'Pajak Persen', { min: 0, max: 100 });
      if (k === 'printer_ukuran') val = val === '80' ? '80' : '58';

      if (petaId[k]) {
        diubah.push({ id: petaId[k], data: { value: val } });
      } else {
        ditambah.push({ key: k, value: val });
      }
    }
  });

  if (diubah.length) ubahBaris_('Pengaturan', diubah, ctx.user.id);
  if (ditambah.length) tambahBaris_('Pengaturan', ditambah, ctx.user.id);

  cacheHapus_('pengaturan');
  catatAudit_(ctx.user.id, 'pengaturan_ubah', 'SETTING', '', { perubahan: p });

  return { pengaturan: ambilPengaturan_() };
}

/* ---------- 9.5 MANAJEMEN MULTI AKUN PENGGUNA ---------- */

/** user.list — Daftar akun pengguna (Khusus Owner). */
function aksiUserList_() {
  const users = bacaSemua_('Users').map(function (u) {
    return {
      id: u.id,
      username: u.username,
      nama: u.nama,
      role: u.role,
      aktif: !!u.aktif,
      wajib_ganti_pin: !!u.wajib_ganti_pin,
      gagal_login: Number(u.gagal_login) || 0,
      kunci_sampai: u.kunci_sampai || '',
      last_login: u.last_login || '',
      created_at: u.created_at || ''
    };
  });
  return { items: users };
}

/** user.create — Tambah akun pengguna baru (Khusus Owner). */
function aksiUserCreate_(ctx) {
  const p = ctx.payload || {};
  const username = V_.teks(p.username, 'Username', { wajib: true, maks: 30, pola: /^[a-zA-Z0-9_.-]+$/ });
  const nama = V_.teks(p.nama, 'Nama Lengkap', { wajib: true, maks: 100 });
  const role = V_.pilihan(p.role, 'Role', SEMUA_ROLE);
  const pin = V_.pin(p.pin);

  // Cek duplikasi username
  const sudahAda = bacaSemua_('Users').some(function (u) {
    return String(u.username || '').toLowerCase() === username.toLowerCase() && !u.deleted;
  });
  if (sudahAda) {
    gagal_(KODE.CONFLICT, 'Username "' + username + '" sudah digunakan oleh pengguna lain.');
  }

  const salt = buatSalt_();
  const dibuat = tambahBaris_('Users', [{
    username: username,
    nama: nama,
    role: role,
    pin_hash: hashPin_(pin, salt),
    salt: salt,
    aktif: true,
    wajib_ganti_pin: true,
    gagal_login: 0,
    kunci_sampai: '',
    last_login: ''
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'user_tambah', 'USER', dibuat.id, { username: username, role: role });

  return {
    id: dibuat.id,
    username: dibuat.username,
    nama: dibuat.nama,
    role: dibuat.role,
    aktif: true,
    wajib_ganti_pin: true
  };
}

/** user.update — Ubah nama, role, status aktif pengguna (Khusus Owner). */
function aksiUserUpdate_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Pengguna', { wajib: true });
  const nama = V_.teks(p.nama, 'Nama Lengkap', { wajib: true, maks: 100 });
  const role = V_.pilihan(p.role, 'Role', SEMUA_ROLE);
  const aktif = p.aktif !== false;

  // Proteksi akun sendiri
  if (id === ctx.user.id && !aktif) {
    gagal_(KODE.VALIDATION, 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.');
  }
  if (id === ctx.user.id && role !== ctx.user.role) {
    gagal_(KODE.VALIDATION, 'Anda tidak dapat mengubah role akun Anda sendiri saat sedang login.');
  }

  const diubah = ubahBaris_('Users', [{
    id: id,
    data: { nama: nama, role: role, aktif: aktif }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'user_ubah', 'USER', id, { role: role, aktif: aktif });

  return {
    id: diubah.id,
    username: diubah.username,
    nama: diubah.nama,
    role: diubah.role,
    aktif: diubah.aktif
  };
}

/** user.resetPin — Reset PIN akun pengguna lain ke PIN baru (Khusus Owner). */
function aksiUserResetPin_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Pengguna', { wajib: true });
  const pinBaru = V_.pin(p.pin_baru);

  const u = cariById_('Users', id);
  if (!u || u.deleted) gagal_(KODE.NOT_FOUND, 'Pengguna tidak ditemukan.');

  const saltBaru = buatSalt_();
  ubahBaris_('Users', [{
    id: id,
    data: {
      pin_hash: hashPin_(pinBaru, saltBaru),
      salt: saltBaru,
      wajib_ganti_pin: true,
      gagal_login: 0,
      kunci_sampai: ''
    }
  }], ctx.user.id);

  // Batalkan sesi aktif pengguna yang di-reset PIN-nya di perangkat lain
  bacaSemua_('Sesi').filter(function (s) { return s.user_id === id && !s.deleted; }).forEach(function (s) {
    hapusLunak_('Sesi', s.id, ctx.user.id);
    cacheHapus_('sesi_' + s.token_hash);
  });

  catatAudit_(ctx.user.id, 'user_reset_pin', 'USER', id, { username: u.username });

  return { pesan: 'PIN pengguna ' + u.username + ' berhasil direset. Pengguna wajib mengganti PIN saat login berikutnya.' };
}

/* ========================================================================== */
/* FASE 2: HANDLER POS PENJUALAN                                              */
/* ========================================================================== */

/** pelanggan.list — Daftar pelanggan aktif, limit kredit, dan piutang berjalan. */
function aksiPelangganList_(ctx) {
  const p = ctx.payload || {};
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const semuaPiutang = bacaSemua_('Piutang');

  // Hitung total piutang berjalan aktif per pelanggan (status !== 'lunas')
  const piutangPeta = {};
  semuaPiutang.forEach(function (pt) {
    if (pt.deleted || pt.status === 'lunas') return;
    const pid = pt.pelanggan_id;
    if (!pid) return;
    piutangPeta[pid] = (piutangPeta[pid] || 0) + (Number(pt.sisa) || 0);
  });

  let data = semuaPelanggan.map(function (pel) {
    const copy = Object.assign({}, pel);
    const hutangAktif = piutangPeta[pel.id] || 0;
    const limitKredit = Number(pel.limit_kredit) || 0;
    copy.piutang_berjalan = hutangAktif;
    copy.sisa_limit = Math.max(0, limitKredit - hutangAktif);
    return copy;
  });

  // Filter aktif
  if (p.aktif_saja !== false) {
    data = data.filter(function (pel) { return pel.aktif; });
  }

  // Filter tipe (member / umum)
  if (p.tipe) {
    data = data.filter(function (pel) { return pel.tipe === p.tipe; });
  }

  // Filter level member
  if (p.level) {
    data = data.filter(function (pel) { return pel.level === p.level; });
  }

  // Pencarian (nama, kode, hp, alamat)
  const q = String(p.cari || p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pel) {
      return String(pel.nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(pel.kode || '').toLowerCase().indexOf(q) !== -1 ||
        String(pel.hp || '').toLowerCase().indexOf(q) !== -1 ||
        String(pel.alamat || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan nama
  data.sort(function (a, b) { return String(a.nama || '').localeCompare(String(b.nama || '')); });

  if (p.semua) {
    return { items: data, total: data.length, page: 1, limit: data.length };
  }

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/**
 * penjualan.create — Simpan transaksi penjualan final atomik (Semua Role).
 * Validasi: stok, harga ≥ HPP (item & total), limit kredit tempo (hanya member), diskon kasir.
 * Menghasilkan: nomor nota INV-..., snapshot HPP, kurangi stok + Kartu_Stok, Piutang (bila tempo), Poin (bila member).
 */
function aksiPenjualanCreate_(ctx) {
  const payload = ctx.payload || {};
  const pengaturan = ambilPengaturan_();
  const isKasir = ctx.user.role === ROLE.KASIR;
  const rawItems = payload.items;

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Keranjang penjualan tidak boleh kosong.');
  }

  // Siapkan indeks data referensi untuk efisiensi batch
  const semuaProduk = bacaSemua_('Produk');
  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const semuaVarian = bacaSemua_('Varian');
  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  const semuaSatuan = bacaSemua_('Satuan_Konversi');
  const satuanPeta = {};
  semuaSatuan.forEach(function (s) {
    const kunci = s.produk_id + '_' + s.satuan;
    satuanPeta[kunci] = s;
  });

  // Validasi & kalkulasi item per item
  let subtotalKotor = 0;
  let totalDiskonItem = 0;
  let totalHppTransaksi = 0;
  const itemsOlah = [];

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const pid = V_.teks(it.produk_id, 'Produk item ke-' + (i + 1), { wajib: true });
    const pr = produkPeta[pid];
    if (!pr || pr.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan atau sudah dihapus.');

    let varObj = null;
    if (pr.punya_varian) {
      const vid = V_.teks(it.varian_id, 'Varian produk ' + pr.nama, { wajib: true });
      varObj = varianPeta[vid];
      if (!varObj || varObj.deleted || varObj.produk_id !== pr.id) {
        gagal_(KODE.NOT_FOUND, 'Varian produk ' + pr.nama + ' tidak valid.');
      }
    }

    const qty = V_.qty(it.qty, 'Jumlah produk ' + pr.nama);
    const satuanNama = V_.teks(it.satuan || pr.satuan_dasar, 'Satuan produk ' + pr.nama, { wajib: true });

    // Tentukan faktor konversi satuan
    let faktor = 1;
    if (satuanNama !== pr.satuan_dasar) {
      const kunciSatuan = pr.id + '_' + satuanNama;
      const dataSatuan = satuanPeta[kunciSatuan];
      if (!dataSatuan || dataSatuan.deleted) {
        gagal_(KODE.VALIDATION, 'Satuan ' + satuanNama + ' tidak terdaftar pada produk ' + pr.nama + '.');
      }
      faktor = Number(dataSatuan.faktor) || 1;
      if (faktor <= 0) gagal_(KODE.VALIDATION, 'Faktor konversi satuan tidak valid.');
    }

    const qtyDasar = bulatQty_(qty * faktor);
    const qtyDibawa = it.qty_dibawa !== undefined && it.qty_dibawa !== null
      ? V_.angka(it.qty_dibawa, 'Qty dibawa ' + pr.nama, { min: 0 })
      : qty;
    if (qtyDibawa > qty) {
      gagal_(KODE.VALIDATION, 'Qty dibawa (' + qtyDibawa + ') tidak boleh lebih besar dari qty beli (' + qty + ').');
    }

    // Cek kecukupan stok (Aturan Bisnis & Pengaturan stok_minus)
    const stokSekarang = varObj ? Number(varObj.stok || 0) : Number(pr.stok || 0);
    if (!pengaturan.stok_minus && stokSekarang < qtyDasar) {
      const labelNama = varObj ? pr.nama + ' (' + varObj.nama_varian + ')' : pr.nama;
      gagal_(KODE.STOK_KURANG, 'Stok ' + labelNama + ' tidak mencukupi (sisa: ' + stokSekarang + ' ' + pr.satuan_dasar + ', diminta: ' + qtyDasar + ' ' + pr.satuan_dasar + ').');
    }

    // Tentukan HPP snapshot per satuan jual (README Aturan 11)
    const hppDasar = varObj ? Number(varObj.hpp || 0) : Number(pr.hpp || 0);
    const hppSnapshot = Math.round(hppDasar * faktor);
    const totalHppItem = Math.round(hppSnapshot * qty);

    // Tentukan harga jual
    const hargaAsli = V_.rupiah(it.harga_asli !== undefined ? it.harga_asli : it.harga, 'Harga asli');
    const hargaJual = V_.rupiah(it.harga, 'Harga jual ' + pr.nama);
    const subtotalBarangKotor = Math.round(hargaJual * qty);

    // Diskon per item
    let diskonItemNilai = 0;
    const diskonTipe = it.diskon_tipe === 'persen' ? 'persen' : (it.diskon_tipe === 'nominal' ? 'nominal' : '');
    const diskonInput = Number(it.diskon_nilai || 0);

    if (diskonTipe === 'persen') {
      if (diskonInput < 0 || diskonInput > 100) gagal_(KODE.VALIDATION, 'Diskon persen harus antara 0 - 100%.');
      if (isKasir && diskonInput > (pengaturan.diskon_maks_kasir_persen || 10)) {
        gagal_(KODE.FORBIDDEN, 'Diskon item ' + pr.nama + ' (' + diskonInput + '%) melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
      }
      diskonItemNilai = Math.round(subtotalBarangKotor * (diskonInput / 100));
    } else if (diskonTipe === 'nominal') {
      if (diskonInput < 0) gagal_(KODE.VALIDATION, 'Diskon nominal tidak boleh minus.');
      const persenEfektif = subtotalBarangKotor > 0 ? (diskonInput / subtotalBarangKotor) * 100 : 0;
      if (isKasir && persenEfektif > (pengaturan.diskon_maks_kasir_persen || 10)) {
        gagal_(KODE.FORBIDDEN, 'Diskon item ' + pr.nama + ' melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
      }
      diskonItemNilai = Math.min(Math.round(diskonInput), subtotalBarangKotor);
    }

    const subtotalItemBersih = Math.max(0, subtotalBarangKotor - diskonItemNilai);

    // Aturan Bisnis #1: Harga jual tidak boleh < HPP per item setelah diskon
    if (subtotalItemBersih < totalHppItem) {
      const labelNama = varObj ? pr.nama + ' (' + varObj.nama_varian + ')' : pr.nama;
      gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga jual setelah diskon untuk ' + labelNama + ' (' + formatRupiah_(Math.round(subtotalItemBersih / qty)) + ') berada di bawah HPP (' + formatRupiah_(hppSnapshot) + ').');
    }

    subtotalKotor += subtotalBarangKotor;
    totalDiskonItem += diskonItemNilai;
    totalHppTransaksi += totalHppItem;

    itemsOlah.push({
      produk_id: pr.id,
      varian_id: varObj ? varObj.id : '',
      nama: varObj ? pr.nama + ' - ' + varObj.nama_varian : pr.nama,
      satuan: satuanNama,
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      qty_dibawa: qtyDibawa,
      tipe_harga: it.tipe_harga || 'ritel',
      harga_asli: hargaAsli,
      harga: hargaJual,
      hpp: hppSnapshot,
      diskon_tipe: diskonTipe,
      diskon_nilai: diskonInput,
      diskon: diskonItemNilai,
      subtotal: subtotalItemBersih,
      _pr: pr,
      _var: varObj
    });
  }

  const subtotalSetelahDiskonItem = subtotalKotor - totalDiskonItem;

  // Diskon Transaksi (Global)
  let diskonTransaksiNilai = 0;
  const diskonTransTipe = payload.diskon_tipe === 'persen' ? 'persen' : (payload.diskon_tipe === 'nominal' ? 'nominal' : '');
  const diskonTransInput = Number(payload.diskon_nilai || 0);

  if (diskonTransTipe === 'persen') {
    if (diskonTransInput < 0 || diskonTransInput > 100) gagal_(KODE.VALIDATION, 'Diskon transaksi persen harus antara 0 - 100%.');
    if (isKasir && diskonTransInput > (pengaturan.diskon_maks_kasir_persen || 10)) {
      gagal_(KODE.FORBIDDEN, 'Diskon transaksi (' + diskonTransInput + '%) melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
    }
    diskonTransaksiNilai = Math.round(subtotalSetelahDiskonItem * (diskonTransInput / 100));
  } else if (diskonTransTipe === 'nominal') {
    if (diskonTransInput < 0) gagal_(KODE.VALIDATION, 'Diskon transaksi tidak boleh minus.');
    const persenEfektifTrans = subtotalSetelahDiskonItem > 0 ? (diskonTransInput / subtotalSetelahDiskonItem) * 100 : 0;
    if (isKasir && persenEfektifTrans > (pengaturan.diskon_maks_kasir_persen || 10)) {
      gagal_(KODE.FORBIDDEN, 'Diskon transaksi melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
    }
    diskonTransaksiNilai = Math.min(Math.round(diskonTransInput), subtotalSetelahDiskonItem);
  }

  const totalSetelahSemuaDiskon = subtotalSetelahDiskonItem - diskonTransaksiNilai;

  // Aturan Bisnis #1: Total penjualan setelah diskon transaksi tidak boleh di bawah total HPP transaksi
  if (totalSetelahSemuaDiskon < totalHppTransaksi) {
    gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Total transaksi setelah diskon (' + formatRupiah_(totalSetelahSemuaDiskon) + ') berada di bawah total HPP transaksi (' + formatRupiah_(totalHppTransaksi) + ').');
  }

  // Pajak (PPN)
  let pajakNilai = 0;
  if (pengaturan.pajak_aktif) {
    const persenPajak = Number(pengaturan.pajak_persen) || 11;
    pajakNilai = Math.round(totalSetelahSemuaDiskon * (persenPajak / 100));
  }

  // Pembulatan
  let pembulatanNilai = 0;
  if (pengaturan.pembulatan_aktif) {
    const kelipatan = Number(pengaturan.pembulatan_kelipatan) || 100;
    const dasarBulat = totalSetelahSemuaDiskon + pajakNilai;
    const sisaBagi = dasarBulat % kelipatan;
    if (sisaBagi !== 0) {
      pembulatanNilai = kelipatan - sisaBagi;
    }
  }

  const grandTotal = Math.round(totalSetelahSemuaDiskon + pajakNilai + pembulatanNilai);

  // Validasi Pelanggan & Pembayaran
  const pelangganId = payload.pelanggan_id ? String(payload.pelanggan_id).trim() : '';
  let pelanggan = null;
  if (pelangganId) {
    pelanggan = cariById_('Pelanggan', pelangganId);
    if (!pelanggan || pelanggan.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');
  }

  const rawBayar = payload.pembayaran;
  if (!rawBayar || !Array.isArray(rawBayar) || rawBayar.length === 0) {
    gagal_(KODE.VALIDATION, 'Metode dan rincian pembayaran wajib diisi.');
  }

  let totalTunai = 0;
  let totalNonTunai = 0;
  let totalTempo = 0;
  const daftarBayarValid = [];

  for (let b = 0; b < rawBayar.length; b++) {
    const byr = rawBayar[b];
    const metode = V_.pilihan(byr.metode, 'Metode pembayaran ke-' + (b + 1), ['tunai', 'transfer', 'qris', 'tempo']);
    const jumlah = V_.rupiah(byr.jumlah, 'Nominal ' + metode);
    if (jumlah <= 0) continue;

    if (metode === 'tunai') {
      totalTunai += jumlah;
    } else {
      totalNonTunai += jumlah;
      if (metode === 'tempo') totalTempo += jumlah;
    }

    daftarBayarValid.push({
      metode: metode,
      jumlah: jumlah,
      referensi: V_.teks(byr.referensi, 'Referensi pembayaran', { maks: 100 })
    });
  }

  if (daftarBayarValid.length === 0) {
    gagal_(KODE.VALIDATION, 'Jumlah pembayaran yang dimasukkan harus lebih dari 0.');
  }

  // Aturan Bisnis #3: Tempo HANYA untuk member terdaftar; Pembeli umum harus non-tempo & lunas
  if (totalTempo > 0) {
    if (!pelanggan || pelanggan.tipe !== 'member') {
      gagal_(KODE.TEMPO_NON_MEMBER, 'Pembayaran tempo/kredit hanya diizinkan untuk pelanggan member terdaftar.');
    }

    // Aturan Bisnis #2: Piutang berjalan + tempo baru tidak boleh melebihi limit kredit
    const semuaPiutang = bacaSemua_('Piutang');
    let piutangBerjalan = 0;
    semuaPiutang.forEach(function (pt) {
      if (pt.deleted || pt.status === 'lunas' || pt.pelanggan_id !== pelanggan.id) return;
      piutangBerjalan += (Number(pt.sisa) || 0);
    });

    const limitKreditPelanggan = Number(pelanggan.limit_kredit || 0);
    const sisaLimit = Math.max(0, limitKreditPelanggan - piutangBerjalan);
    if (totalTempo > sisaLimit) {
      gagal_(KODE.LIMIT_KREDIT, 'Limit kredit tidak mencukupi. Sisa limit: ' + formatRupiah_(sisaLimit) + ', pengajuan tempo: ' + formatRupiah_(totalTempo) + '.');
    }
  }

  const totalSemuaBayar = totalTunai + totalNonTunai;
  if (totalSemuaBayar < grandTotal) {
    gagal_(KODE.VALIDATION, 'Pembayaran kurang dari total tagihan (Total: ' + formatRupiah_(grandTotal) + ', Dibayar: ' + formatRupiah_(totalSemuaBayar) + ').');
  }

  if (totalNonTunai > grandTotal) {
    gagal_(KODE.VALIDATION, 'Pembayaran non-tunai (' + formatRupiah_(totalNonTunai) + ') melebihi total tagihan (' + formatRupiah_(grandTotal) + ').');
  }

  const kembalian = totalTunai > 0 ? Math.max(0, totalSemuaBayar - grandTotal) : 0;
  const bayarTercatat = Math.min(totalSemuaBayar, grandTotal + kembalian);

  // Status Pengiriman & Status Barang Dibawa (README 6.3 & Aturan 9)
  const pengiriman = payload.pengiriman === 'dikirim' ? 'dikirim' : 'ambil';
  const alamatKirim = V_.teks(payload.alamat_kirim, 'Alamat pengiriman', { maks: 300 });

  let adaBelumDibawa = false;
  let adaSudahDibawa = false;
  itemsOlah.forEach(function (it) {
    if (it.qty_dibawa < it.qty) adaBelumDibawa = true;
    if (it.qty_dibawa > 0) adaSudahDibawa = true;
  });

  let statusAntar = 'selesai';
  if (adaBelumDibawa) {
    statusAntar = adaSudahDibawa ? 'sebagian' : 'belum_dikirim';
  }

  // Tentukan Metode Bayar Utama & Status Bayar
  let metodeBayarUtama = 'tunai';
  if (totalTempo > 0) {
    metodeBayarUtama = totalTempo === grandTotal ? 'tempo' : 'kombinasi';
  } else if (daftarBayarValid.length > 1) {
    metodeBayarUtama = 'kombinasi';
  } else {
    metodeBayarUtama = daftarBayarValid[0].metode;
  }

  const statusBayar = totalTempo > 0 ? (totalTempo === grandTotal ? 'belum_lunas' : 'sebagian') : 'lunas';

  // Generate Nomor Faktur Resmi INV-YYYYMMDD-0001 (Atomic via Sheet Counter)
  const noNota = nomorBerikut_('INV');
  const waktuTransaksi = sekarang_();

  // Hitung Loyalty Points (Aturan Bisnis #7: hanya dari transaksi tunai/non-tempo lunas saat final)
  let poinDidapat = 0;
  const bayarLunasSaatIni = grandTotal - totalTempo;
  if (pelanggan && pelanggan.tipe === 'member' && bayarLunasSaatIni > 0 && pengaturan.poin_per_rupiah > 0) {
    let pengali = 1;
    (pengaturan.level_member || []).forEach(function (lvl) {
      if (lvl.nama === pelanggan.level) pengali = Number(lvl.pengali) || 1;
    });
    poinDidapat = Math.floor((bayarLunasSaatIni / pengaturan.poin_per_rupiah) * pengali);
  }

  // 1. Simpan Header Penjualan
  const dataPenjualan = {
    no_nota: noNota,
    tanggal: waktuTransaksi,
    kasir_id: ctx.user.id,
    pelanggan_id: pelanggan ? pelanggan.id : '',
    subtotal: subtotalKotor,
    diskon_tipe: diskonTransTipe,
    diskon_nilai: diskonTransInput,
    diskon: totalDiskonItem + diskonTransaksiNilai,
    pajak: pajakNilai,
    pembulatan: pembulatanNilai,
    total: grandTotal,
    bayar: bayarTercatat,
    kembalian: kembalian,
    metode_bayar: metodeBayarUtama,
    status_bayar: statusBayar,
    pengiriman: pengiriman,
    alamat_kirim: alamatKirim,
    status_antar: statusAntar,
    catatan: V_.teks(payload.catatan, 'Catatan penjualan', { maks: 300 }),
    status: 'final',
    void_alasan: '',
    void_oleh: '',
    void_at: '',
    poin_didapat: poinDidapat
  };

  const penjualanTersimpan = tambahBaris_('Penjualan', [dataPenjualan], ctx.user.id)[0];

  // 2. Simpan Item Penjualan
  const barisItems = itemsOlah.map(function (it) {
    return {
      penjualan_id: penjualanTersimpan.id,
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      nama: it.nama,
      satuan: it.satuan,
      faktor: it.faktor,
      qty: it.qty,
      qty_dasar: it.qty_dasar,
      qty_dibawa: it.qty_dibawa,
      tipe_harga: it.tipe_harga,
      harga_asli: it.harga_asli,
      harga: it.harga,
      hpp: it.hpp,
      diskon_tipe: it.diskon_tipe,
      diskon_nilai: it.diskon_nilai,
      diskon: it.diskon,
      subtotal: it.subtotal
    };
  });
  const itemsTersimpan = tambahBaris_('Penjualan_Item', barisItems, ctx.user.id);

  // 3. Simpan Baris Pembayaran
  const barisBayar = daftarBayarValid.map(function (byr) {
    return {
      penjualan_id: penjualanTersimpan.id,
      metode: byr.metode,
      jumlah: byr.jumlah,
      referensi: byr.referensi
    };
  });
  const bayarTersimpan = tambahBaris_('Penjualan_Bayar', barisBayar, ctx.user.id);

  // 4. Pengurangan Stok & Pencatatan Kartu_Stok (Aturan Bisnis #5)
  itemsOlah.forEach(function (it) {
    let saldoAkhir = 0;
    if (it._var) {
      const stokVarianLama = Number(it._var.stok || 0);
      const stokVarianBaru = bulatQty_(stokVarianLama - it.qty_dasar);
      ubahBaris_('Varian', [{ id: it._var.id, data: { stok: stokVarianBaru } }], ctx.user.id);
      it._var.stok = stokVarianBaru;

      // Hitung ulang total stok induk produk dari semua varian
      const varianLain = semuaVarian.filter(function (v) { return v.produk_id === it._pr.id && !v.deleted; });
      let totalStokInduk = 0;
      varianLain.forEach(function (v) { totalStokInduk += (v.id === it._var.id ? stokVarianBaru : Number(v.stok || 0)); });
      ubahBaris_('Produk', [{ id: it._pr.id, data: { stok: bulatQty_(totalStokInduk) } }], ctx.user.id);
      saldoAkhir = stokVarianBaru;
    } else {
      const stokProdukLama = Number(it._pr.stok || 0);
      const stokProdukBaru = bulatQty_(stokProdukLama - it.qty_dasar);
      ubahBaris_('Produk', [{ id: it._pr.id, data: { stok: stokProdukBaru } }], ctx.user.id);
      it._pr.stok = stokProdukBaru;
      saldoAkhir = stokProdukBaru;
    }

    tambahBaris_('Kartu_Stok', [{
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      tipe: 'jual',
      qty: -it.qty_dasar,
      saldo: saldoAkhir,
      hpp: it.hpp,
      ref_id: noNota,
      user_id: ctx.user.id,
      keterangan: 'Penjualan ' + noNota + ' (' + it.qty + ' ' + it.satuan + ')'
    }], ctx.user.id);
  });

  // 5. Catat Piutang Pelanggan (Bila ada pembayaran tempo)
  if (totalTempo > 0 && pelanggan) {
    const tempoHari = Number(pelanggan.tempo_hari) || Number(pengaturan.tempo_default_hari) || 30;
    const tglSekarang = new Date();
    const tglJatuhTempo = new Date(tglSekarang.getTime() + tempoHari * 24 * 60 * 60 * 1000);

    tambahBaris_('Piutang', [{
      penjualan_id: penjualanTersimpan.id,
      pelanggan_id: pelanggan.id,
      total: totalTempo,
      terbayar: 0,
      sisa: totalTempo,
      jatuh_tempo: formatWaktu_(tglJatuhTempo),
      status: 'belum'
    }], ctx.user.id);
  }

  // 6. Update Poin & Total Belanja Member (Aturan Bisnis #7 & #16)
  if (pelanggan && pelanggan.tipe === 'member') {
    const totalBelanjaLama = Number(pelanggan.total_belanja || 0);
    const totalBelanjaBaru = totalBelanjaLama + bayarLunasSaatIni;
    const poinLama = Number(pelanggan.poin || 0);
    const poinBaru = poinLama + poinDidapat;

    // Evaluasi kenaikan level member berdasarkan total belanja baru
    let levelBaru = pelanggan.level || 'Reguler';
    (pengaturan.level_member || []).forEach(function (lvl) {
      if (totalBelanjaBaru >= (Number(lvl.min_belanja) || 0)) {
        levelBaru = lvl.nama;
      }
    });

    ubahBaris_('Pelanggan', [{
      id: pelanggan.id,
      data: {
        total_belanja: totalBelanjaBaru,
        poin: poinBaru,
        level: levelBaru
      }
    }], ctx.user.id);

    if (poinDidapat > 0) {
      tambahBaris_('Poin_Log', [{
        pelanggan_id: pelanggan.id,
        jumlah: poinDidapat,
        jenis: 'dapat',
        ref_id: noNota,
        saldo: poinBaru
      }], ctx.user.id);
    }
  }

  // 7. Bersihkan Draft Pending bila transaksi ini berasal dari pending
  if (payload.pending_id) {
    const pendingLama = cariById_('Penjualan', payload.pending_id);
    if (pendingLama && pendingLama.status === 'pending') {
      hapusLunak_('Penjualan', pendingLama.id, ctx.user.id);
      bacaSemua_('Penjualan_Item').filter(function (pi) { return pi.penjualan_id === pendingLama.id; }).forEach(function (pi) {
        hapusLunak_('Penjualan_Item', pi.id, ctx.user.id);
      });
    }
  }

  // 8. Catat Audit Log (dan tandai bila diskon tinggi)
  const totalSemuaDiskon = totalDiskonItem + diskonTransaksiNilai;
  const persenTotalDiskon = subtotalKotor > 0 ? (totalSemuaDiskon / subtotalKotor) * 100 : 0;
  const auditDiskonPerlu = persenTotalDiskon >= (pengaturan.audit_diskon_persen || 10);

  catatAudit_(ctx.user.id, 'penjualan_create', 'PENJUALAN', noNota, {
    total: grandTotal,
    pelanggan: pelanggan ? pelanggan.nama : 'Umum',
    metode: metodeBayarUtama,
    diskon_tinggi: auditDiskonPerlu,
    total_diskon: totalSemuaDiskon
  });

  // Hapus cache katalog produk
  cacheHapus_('produk');

  return {
    penjualan: penjualanTersimpan,
    items: itemsTersimpan,
    pembayaran: bayarTersimpan,
    pelanggan: pelanggan,
    kasir: {
      id: ctx.user.id,
      nama: ctx.user.nama || ctx.user.username
    }
  };
}

/** penjualan.pending.save — Simpan draft transaksi (Tahan Transaksi / Hold Cart). */
function aksiPenjualanPendingSave_(ctx) {
  const payload = ctx.payload || {};
  const rawItems = payload.items;
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Keranjang kosong tidak bisa disimpan sebagai draft.');
  }

  const noDraft = 'HOLD-' + Utilities.formatDate(new Date(), APP.TZ, 'HHmmss') + '-' + ('000' + Math.floor(Math.random() * 1000)).slice(-3);
  let subtotalKotor = 0;
  rawItems.forEach(function (it) {
    subtotalKotor += Math.round((Number(it.harga) || 0) * (Number(it.qty) || 0));
  });

  const diskonNilai = Number(payload.diskon || 0);
  const totalEstimasi = Math.max(0, subtotalKotor - diskonNilai);

  // Jika memperbarui pending lama
  if (payload.id) {
    const lama = cariById_('Penjualan', payload.id);
    if (lama && lama.status === 'pending') {
      hapusLunak_('Penjualan', lama.id, ctx.user.id);
      bacaSemua_('Penjualan_Item').filter(function (pi) { return pi.penjualan_id === lama.id; }).forEach(function (pi) {
        hapusLunak_('Penjualan_Item', pi.id, ctx.user.id);
      });
    }
  }

  const dataPending = {
    no_nota: noDraft,
    tanggal: sekarang_(),
    kasir_id: ctx.user.id,
    pelanggan_id: payload.pelanggan_id ? String(payload.pelanggan_id).trim() : '',
    subtotal: subtotalKotor,
    diskon_tipe: payload.diskon_tipe || '',
    diskon_nilai: Number(payload.diskon_nilai || 0),
    diskon: diskonNilai,
    pajak: 0,
    pembulatan: 0,
    total: totalEstimasi,
    bayar: 0,
    kembalian: 0,
    metode_bayar: 'tunai',
    status_bayar: 'belum_lunas',
    pengiriman: payload.pengiriman || 'ambil',
    alamat_kirim: payload.alamat_kirim || '',
    status_antar: 'belum_dikirim',
    catatan: V_.teks(payload.catatan, 'Catatan draft', { maks: 300 }),
    status: 'pending',
    void_alasan: '',
    void_oleh: '',
    void_at: '',
    poin_didapat: 0
  };

  const pendingTersimpan = tambahBaris_('Penjualan', [dataPending], ctx.user.id)[0];

  const barisItems = rawItems.map(function (it) {
    return {
      penjualan_id: pendingTersimpan.id,
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      nama: it.nama || 'Item',
      satuan: it.satuan || 'Pcs',
      faktor: Number(it.faktor) || 1,
      qty: Number(it.qty) || 1,
      qty_dasar: bulatQty_((Number(it.qty) || 1) * (Number(it.faktor) || 1)),
      qty_dibawa: Number(it.qty_dibawa) || Number(it.qty) || 1,
      tipe_harga: it.tipe_harga || 'ritel',
      harga_asli: Number(it.harga_asli) || Number(it.harga) || 0,
      harga: Number(it.harga) || 0,
      hpp: Number(it.hpp) || 0,
      diskon_tipe: it.diskon_tipe || '',
      diskon_nilai: Number(it.diskon_nilai) || 0,
      diskon: Number(it.diskon) || 0,
      subtotal: Math.round((Number(it.harga) || 0) * (Number(it.qty) || 0))
    };
  });
  tambahBaris_('Penjualan_Item', barisItems, ctx.user.id);

  return {
    id: pendingTersimpan.id,
    no_nota: pendingTersimpan.no_nota,
    total: pendingTersimpan.total,
    item_count: barisItems.length
  };
}

/** penjualan.pending.list — Daftar transaksi yang sedang ditahan. */
function aksiPenjualanPendingList_() {
  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelPeta = {};
  semuaPelanggan.forEach(function (pel) { pelPeta[pel.id] = pel; });

  const semuaItems = bacaSemua_('Penjualan_Item');
  const itemPeta = {};
  semuaItems.forEach(function (it) {
    if (it.deleted) return;
    if (!itemPeta[it.penjualan_id]) itemPeta[it.penjualan_id] = [];
    itemPeta[it.penjualan_id].push(it);
  });

  const pending = semuaPenjualan
    .filter(function (p) { return p.status === 'pending' && !p.deleted; })
    .map(function (p) {
      const copy = Object.assign({}, p);
      const pel = pelPeta[p.pelanggan_id];
      copy.pelanggan_nama = pel ? pel.nama : 'Umum';
      copy.items = itemPeta[p.id] || [];
      copy.item_count = copy.items.length;
      return copy;
    });

  pending.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  return { items: pending, total: pending.length };
}

/** penjualan.pending.delete — Hapus draft transaksi yang ditahan. */
function aksiPenjualanPendingDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Pending', { wajib: true });
  const pending = cariById_('Penjualan', id);
  if (!pending || pending.status !== 'pending') {
    gagal_(KODE.NOT_FOUND, 'Draft transaksi tidak ditemukan.');
  }

  hapusLunak_('Penjualan', pending.id, ctx.user.id);
  bacaSemua_('Penjualan_Item').filter(function (pi) { return pi.penjualan_id === pending.id; }).forEach(function (pi) {
    hapusLunak_('Penjualan_Item', pi.id, ctx.user.id);
  });

  return { pesan: 'Draft transaksi ' + pending.no_nota + ' berhasil dihapus.' };
}

/** penjualan.detail — Lihat rincian transaksi lengkap untuk struk / audit. */
function aksiPenjualanDetail_(ctx) {
  const p = ctx.payload || {};
  const id = p.id || p.no_nota;
  if (!id) gagal_(KODE.VALIDATION, 'ID atau nomor nota penjualan wajib disertakan.');

  let penjualan = cariById_('Penjualan', id);
  if (!penjualan) {
    const semua = bacaSemua_('Penjualan');
    for (let i = 0; i < semua.length; i++) {
      if (semua[i].no_nota === id) {
        penjualan = semua[i];
        break;
      }
    }
  }

  if (!penjualan) gagal_(KODE.NOT_FOUND, 'Transaksi penjualan tidak ditemukan.');

  const items = bacaSemua_('Penjualan_Item').filter(function (it) {
    return it.penjualan_id === penjualan.id && !it.deleted;
  });

  const pembayaran = bacaSemua_('Penjualan_Bayar').filter(function (byr) {
    return byr.penjualan_id === penjualan.id && !byr.deleted;
  });

  const pelanggan = penjualan.pelanggan_id ? cariById_('Pelanggan', penjualan.pelanggan_id) : null;
  const kasir = penjualan.kasir_id ? cariById_('Users', penjualan.kasir_id) : null;

  return {
    penjualan: penjualan,
    items: items,
    pembayaran: pembayaran,
    pelanggan: pelanggan,
    kasir: kasir ? { id: kasir.id, nama: kasir.nama || kasir.username } : null
  };
}

/**
 * penjualan.void — Batalkan transaksi final (Owner & Admin).
 * Aturan Bisnis #13:
 * - Admin hanya transaksi hari ini; Owner kapan saja.
 * - Tolak bila sudah memiliki retur atau pembayaran cicilan piutang.
 * - Membalikkan stok (+ Kartu_Stok tipe 'void'), poin, total belanja, dan piutang.
 */
function aksiPenjualanVoid_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Penjualan', { wajib: true });
  const alasan = V_.teks(p.alasan, 'Alasan pembatalan (void)', { wajib: true, maks: 200 });

  const penjualan = cariById_('Penjualan', id);
  if (!penjualan) gagal_(KODE.NOT_FOUND, 'Transaksi penjualan tidak ditemukan.');
  if (penjualan.status === 'void') gagal_(KODE.CONFLICT, 'Transaksi ini sudah dibatalkan sebelumnya.');
  if (penjualan.status !== 'final') gagal_(KODE.VALIDATION, 'Hanya transaksi berstatus final yang bisa dibatalkan.');

  // Validasi batasan waktu pembatalan berdasarkan role (README Aturan 13)
  const isOwner = ctx.user.role === ROLE.OWNER;
  if (!isOwner) {
    const tglTransaksi = String(penjualan.tanggal || '').slice(0, 10);
    const tglHariIni = sekarang_().slice(0, 10);
    if (tglTransaksi !== tglHariIni) {
      gagal_(KODE.FORBIDDEN, 'Admin hanya dapat membatalkan transaksi pada hari yang sama. Hubungi Owner untuk pembatalan transaksi tanggal lampau.');
    }
  }

  // Cek apakah sudah ada retur terkait transaksi ini
  const semuaRetur = bacaSemua_('Retur');
  const adaRetur = semuaRetur.some(function (r) {
    return r.ref_id === penjualan.id && !r.deleted && r.status !== 'ditolak';
  });
  if (adaRetur) {
    gagal_(KODE.CONFLICT, 'Transaksi ini tidak dapat dibatalkan (void) karena sudah memiliki riwayat retur barang. Gunakan modul retur.');
  }

  // Cek apakah ada pembayaran piutang berjalan yang sudah dicicil
  const piutangTerkait = bacaSemua_('Piutang').filter(function (pt) {
    return pt.penjualan_id === penjualan.id && !pt.deleted;
  })[0];

  if (piutangTerkait && Number(piutangTerkait.terbayar || 0) > 0) {
    gagal_(KODE.CONFLICT, 'Transaksi ini tidak dapat dibatalkan (void) karena piutang sudah memiliki riwayat pembayaran cicilan (' + formatRupiah_(piutangTerkait.terbayar) + ').');
  }

  // 1. Kembalikan Stok & Catat Kartu_Stok Tipe 'void'
  const items = bacaSemua_('Penjualan_Item').filter(function (it) {
    return it.penjualan_id === penjualan.id && !it.deleted;
  });

  const semuaProduk = bacaSemua_('Produk');
  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const semuaVarian = bacaSemua_('Varian');
  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  items.forEach(function (it) {
    let saldoAkhir = 0;
    if (it.varian_id) {
      const v = varianPeta[it.varian_id];
      if (v) {
        const stokBaru = bulatQty_(Number(v.stok || 0) + Number(it.qty_dasar || 0));
        ubahBaris_('Varian', [{ id: v.id, data: { stok: stokBaru } }], ctx.user.id);
        v.stok = stokBaru;

        // Update total produk induk
        const varianLain = semuaVarian.filter(function (vl) { return vl.produk_id === v.produk_id && !vl.deleted; });
        let totalStokInduk = 0;
        varianLain.forEach(function (vl) { totalStokInduk += (vl.id === v.id ? stokBaru : Number(vl.stok || 0)); });
        ubahBaris_('Produk', [{ id: v.produk_id, data: { stok: bulatQty_(totalStokInduk) } }], ctx.user.id);
        saldoAkhir = stokBaru;
      }
    } else {
      const pr = produkPeta[it.produk_id];
      if (pr) {
        const stokBaru = bulatQty_(Number(pr.stok || 0) + Number(it.qty_dasar || 0));
        ubahBaris_('Produk', [{ id: pr.id, data: { stok: stokBaru } }], ctx.user.id);
        pr.stok = stokBaru;
        saldoAkhir = stokBaru;
      }
    }

    tambahBaris_('Kartu_Stok', [{
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      tipe: 'void',
      qty: it.qty_dasar,
      saldo: saldoAkhir,
      hpp: it.hpp,
      ref_id: penjualan.no_nota,
      user_id: ctx.user.id,
      keterangan: 'Void penjualan ' + penjualan.no_nota + ': ' + alasan
    }], ctx.user.id);
  });

  // 2. Batalkan Poin & Kurangi Total Belanja Member
  if (penjualan.pelanggan_id) {
    const pel = cariById_('Pelanggan', penjualan.pelanggan_id);
    if (pel && pel.tipe === 'member') {
      const poinKembali = Number(penjualan.poin_didapat || 0);
      const poinLama = Number(pel.poin || 0);
      const poinBaru = Math.max(0, poinLama - poinKembali);
      const belanjaLama = Number(pel.total_belanja || 0);
      const belanjaBaru = Math.max(0, belanjaLama - Number(penjualan.total || 0));

      ubahBaris_('Pelanggan', [{
        id: pel.id,
        data: {
          poin: poinBaru,
          total_belanja: belanjaBaru
        }
      }], ctx.user.id);

      if (poinKembali > 0) {
        tambahBaris_('Poin_Log', [{
          pelanggan_id: pel.id,
          jumlah: -poinKembali,
          jenis: 'void',
          ref_id: penjualan.no_nota,
          saldo: poinBaru
        }], ctx.user.id);
      }
    }
  }

  // 3. Batalkan Piutang (Jika ada)
  if (piutangTerkait) {
    hapusLunak_('Piutang', piutangTerkait.id, ctx.user.id);
  }

  // 4. Ubah Status Penjualan menjadi Void
  const waktuVoid = sekarang_();
  ubahBaris_('Penjualan', [{
    id: penjualan.id,
    data: {
      status: 'void',
      void_alasan: alasan,
      void_oleh: ctx.user.id,
      void_at: waktuVoid
    }
  }], ctx.user.id);

  // 5. Catat Audit Log
  catatAudit_(ctx.user.id, 'penjualan_void', 'PENJUALAN', penjualan.no_nota, {
    alasan: alasan,
    total: penjualan.total,
    void_oleh: ctx.user.username
  });

  // Hapus cache katalog produk
  cacheHapus_('produk');

  return {
    pesan: 'Transaksi ' + penjualan.no_nota + ' berhasil dibatalkan (void).',
    no_nota: penjualan.no_nota
  };
}

/** Helper pemformat Rupiah internal backend untuk pesan error. */
function formatRupiah_(angka) {
  return 'Rp ' + Math.round(Number(angka) || 0).toLocaleString('id-ID');
}

/* ---------- 9.3 SUPPLIER, PEMBELIAN, KARTU STOK & OPNAME (FASE 3) ---------- */

/** supplier.list — Daftar supplier dengan agregasi saldo hutang & riwayat pembelian. */
function aksiSupplierList_(ctx) {
  const p = ctx.payload || {};
  const semuaSupplier = bacaSemua_('Supplier');
  const semuaHutang = bacaSemua_('Hutang');
  const semuaPembelian = bacaSemua_('Pembelian');

  // Peta saldo hutang aktif per supplier
  const hutangPeta = {};
  semuaHutang.forEach(function (h) {
    if (h.deleted || h.status === 'lunas') return;
    const sid = h.supplier_id;
    if (!sid) return;
    hutangPeta[sid] = (hutangPeta[sid] || 0) + (Number(h.sisa) || 0);
  });

  // Peta total transaksi pembelian per supplier
  const pembelianCountPeta = {};
  semuaPembelian.forEach(function (pb) {
    if (pb.deleted) return;
    const sid = pb.supplier_id;
    if (!sid) return;
    pembelianCountPeta[sid] = (pembelianCountPeta[sid] || 0) + 1;
  });

  let data = semuaSupplier.map(function (sup) {
    const copy = Object.assign({}, sup);
    copy.saldo_hutang = hutangPeta[sup.id] || 0;
    copy.total_pembelian = pembelianCountPeta[sup.id] || 0;
    return copy;
  });

  if (p.aktif_saja === true) {
    data = data.filter(function (s) { return s.aktif; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (s) {
      return String(s.nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(s.kontak || '').toLowerCase().indexOf(q) !== -1 ||
        String(s.hp || '').toLowerCase().indexOf(q) !== -1 ||
        String(s.alamat || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan berdasarkan nama
  data.sort(function (a, b) {
    return String(a.nama || '').localeCompare(String(b.nama || ''));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/** supplier.create — Tambah supplier baru (Owner & Admin). */
function aksiSupplierCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Supplier', { wajib: true, maks: 150 });
  const kontak = V_.teks(p.kontak, 'Kontak/PIC', { maks: 100 });
  const hp = V_.teks(p.hp, 'Nomor HP/WA', { maks: 30 });
  const alamat = V_.teks(p.alamat, 'Alamat Supplier', { maks: 300 });
  const catatan = V_.teks(p.catatan, 'Catatan Supplier', { maks: 500 });
  const aktif = p.aktif !== false;

  const hasil = tambahBaris_('Supplier', [{
    nama: nama,
    kontak: kontak,
    hp: hp,
    alamat: alamat,
    catatan: catatan,
    aktif: aktif
  }], ctx.user.id);

  const supplierBaru = hasil[0];
  catatAudit_(ctx.user.id, 'supplier_create', 'SUPPLIER', supplierBaru.id, { nama: nama });

  return {
    supplier: supplierBaru,
    pesan: 'Supplier "' + nama + '" berhasil ditambahkan.'
  };
}

/** supplier.update — Perbarui data supplier (Owner & Admin). */
function aksiSupplierUpdate_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID supplier wajib diberikan.');

  const supplier = cariById_('Supplier', p.id);
  if (!supplier) gagal_(KODE.NOT_FOUND, 'Data supplier tidak ditemukan.');

  const dataUbah = {};
  if (p.nama !== undefined) dataUbah.nama = V_.teks(p.nama, 'Nama Supplier', { wajib: true, maks: 150 });
  if (p.kontak !== undefined) dataUbah.kontak = V_.teks(p.kontak, 'Kontak/PIC', { maks: 100 });
  if (p.hp !== undefined) dataUbah.hp = V_.teks(p.hp, 'Nomor HP/WA', { maks: 30 });
  if (p.alamat !== undefined) dataUbah.alamat = V_.teks(p.alamat, 'Alamat Supplier', { maks: 300 });
  if (p.catatan !== undefined) dataUbah.catatan = V_.teks(p.catatan, 'Catatan Supplier', { maks: 500 });
  if (p.aktif !== undefined) dataUbah.aktif = Boolean(p.aktif);

  ubahBaris_('Supplier', [{ id: supplier.id, data: dataUbah }], ctx.user.id);
  catatAudit_(ctx.user.id, 'supplier_update', 'SUPPLIER', supplier.id, dataUbah);

  return {
    pesan: 'Data supplier berhasil diperbarui.'
  };
}

/** supplier.delete — Hapus supplier (Owner & Admin; ditolak bila ada hutang aktif). */
function aksiSupplierDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID supplier wajib diberikan.');

  const supplier = cariById_('Supplier', p.id);
  if (!supplier) gagal_(KODE.NOT_FOUND, 'Data supplier tidak ditemukan.');

  // Periksa apakah masih ada hutang aktif
  const semuaHutang = bacaSemua_('Hutang');
  const adaHutangAktif = semuaHutang.some(function (h) {
    return h.supplier_id === supplier.id && !h.deleted && h.status !== 'lunas' && Number(h.sisa) > 0;
  });

  if (adaHutangAktif) {
    gagal_(KODE.CONFLICT, 'Supplier "' + supplier.nama + '" tidak dapat dihapus karena masih memiliki saldo hutang aktif.');
  }

  hapusLunak_('Supplier', supplier.id, ctx.user.id);
  catatAudit_(ctx.user.id, 'supplier_delete', 'SUPPLIER', supplier.id, { nama: supplier.nama });

  return {
    pesan: 'Supplier "' + supplier.nama + '" berhasil dihapus.'
  };
}

/** pembelian.list — Daftar riwayat faktur pembelian barang. */
function aksiPembelianList_(ctx) {
  const p = ctx.payload || {};
  const semuaPembelian = bacaSemua_('Pembelian');
  const semuaSupplier = bacaSemua_('Supplier');
  const supplierPeta = {};
  semuaSupplier.forEach(function (s) { supplierPeta[s.id] = s.nama; });

  let data = semuaPembelian.map(function (pb) {
    const copy = Object.assign({}, pb);
    copy.supplier_nama = supplierPeta[pb.supplier_id] || 'Supplier Umum';
    return copy;
  });

  // Filter supplier
  if (p.supplier_id) {
    data = data.filter(function (pb) { return pb.supplier_id === p.supplier_id; });
  }

  // Filter status bayar
  if (p.status_bayar) {
    data = data.filter(function (pb) { return pb.status_bayar === p.status_bayar; });
  }

  // Filter rentang tanggal
  if (p.dari) {
    data = data.filter(function (pb) { return String(pb.tanggal || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (pb) { return String(pb.tanggal || '').substring(0, 10) <= p.sampai; });
  }

  // Pencarian no_faktur atau no_faktur_supplier atau supplier_nama
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pb) {
      return String(pb.no_faktur || '').toLowerCase().indexOf(q) !== -1 ||
        String(pb.no_faktur_supplier || '').toLowerCase().indexOf(q) !== -1 ||
        String(pb.supplier_nama || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan terbaru di atas
  data.sort(function (a, b) {
    return String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/** pembelian.detail — Rincian lengkap faktur pembelian, item, & status hutang. */
function aksiPembelianDetail_(ctx) {
  const p = ctx.payload || {};
  let pembelian = null;
  if (p.id) {
    pembelian = cariById_('Pembelian', p.id);
  } else if (p.no_faktur) {
    const semua = bacaSemua_('Pembelian');
    pembelian = semua.filter(function (pb) { return pb.no_faktur === p.no_faktur && !pb.deleted; })[0];
  }

  if (!pembelian) gagal_(KODE.NOT_FOUND, 'Data faktur pembelian tidak ditemukan.');

  const supplier = cariById_('Supplier', pembelian.supplier_id) || { nama: 'Supplier Umum' };
  const semuaItems = bacaSemua_('Pembelian_Item');
  const items = semuaItems.filter(function (it) { return it.pembelian_id === pembelian.id && !it.deleted; });

  const semuaHutang = bacaSemua_('Hutang');
  const hutang = semuaHutang.filter(function (h) { return h.pembelian_id === pembelian.id && !h.deleted; })[0] || null;

  return {
    pembelian: pembelian,
    supplier: supplier,
    items: items,
    hutang: hutang
  };
}

/**
 * pembelian.create — Simpan pembelian barang masuk (Atomik via LockService).
 * Sesuai Aturan Bisnis #10:
 * - Update stok bertambah (satuan dasar)
 * - Hitung Moving Average HPP baru (alokasi diskon proporsional)
 * - Catat mutasi di Kartu_Stok tipe 'beli'
 * - Catat Hutang bila belum lunas / tempo
 */
function aksiPembelianCreate_(ctx) {
  const payload = ctx.payload || {};
  const rawItems = payload.items;

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Daftar barang pembelian tidak boleh kosong.');
  }

  const supplierId = payload.supplier_id ? String(payload.supplier_id).trim() : '';
  const supplier = cariById_('Supplier', supplierId);
  if (!supplier) {
    gagal_(KODE.VALIDATION, 'Supplier wajib dipilih dan terdaftar di master data.');
  }

  const noFakturSupplier = V_.teks(payload.no_faktur_supplier, 'No Faktur Supplier', { maks: 100 });
  const catatan = V_.teks(payload.catatan, 'Catatan Pembelian', { maks: 500 });
  const diskonFaktur = V_.rupiah(payload.diskon, 'Diskon Faktur', { bawaan: 0 });
  const nominalBayar = V_.rupiah(payload.bayar, 'Nominal Bayar', { bawaan: 0 });
  const tanggalBeli = payload.tanggal ? String(payload.tanggal).trim() : sekarang_();
  const jatuhTempo = payload.jatuh_tempo ? String(payload.jatuh_tempo).trim() : '';

  // Validasi dan normalisasi tiap item
  const itemsDiproses = [];
  let subtotalKotor = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const produk = cariById_('Produk', it.produk_id);
    if (!produk || produk.deleted) {
      gagal_(KODE.NOT_FOUND, 'Produk item ke-' + (i + 1) + ' tidak ditemukan.');
    }

    let varian = null;
    if (it.varian_id) {
      varian = cariById_('Varian', it.varian_id);
      if (!varian || varian.deleted) {
        gagal_(KODE.NOT_FOUND, 'Varian produk item ke-' + (i + 1) + ' tidak ditemukan.');
      }
    }

    const qty = V_.qty(it.qty, 'Qty Beli (' + (it.nama || produk.nama) + ')');
    const faktor = Math.max(1, Number(it.faktor) || 1);
    const qtyDasar = Math.round(qty * faktor * 1000) / 1000;
    const hargaBeli = V_.rupiah(it.harga_beli, 'Harga Beli (' + (it.nama || produk.nama) + ')', { wajib: true, min: 0 });
    const itemSubtotal = Math.round(qty * hargaBeli);

    subtotalKotor += itemSubtotal;

    itemsDiproses.push({
      produk: produk,
      varian: varian,
      nama: it.nama || (varian ? produk.nama + ' - ' + varian.nama_varian : produk.nama),
      satuan: it.satuan || produk.satuan_dasar,
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      harga_beli: hargaBeli,
      subtotal: itemSubtotal
    });
  }

  const grandTotal = Math.max(0, subtotalKotor - diskonFaktur);
  const statusBayar = nominalBayar >= grandTotal ? 'lunas' : (nominalBayar > 0 ? 'sebagian' : 'hutang');
  const sisaHutang = Math.max(0, grandTotal - nominalBayar);

  // Generate Nomor Faktur Resmi PB-YYYYMMDD-0001
  const noFaktur = nomorBerikut_('PB');

  // 1. Simpan Header Pembelian
  const resBeli = tambahBaris_('Pembelian', [{
    no_faktur: noFaktur,
    no_faktur_supplier: noFakturSupplier,
    tanggal: tanggalBeli,
    supplier_id: supplier.id,
    subtotal: subtotalKotor,
    diskon: diskonFaktur,
    total: grandTotal,
    bayar: nominalBayar,
    status_bayar: statusBayar,
    jatuh_tempo: sisaHutang > 0 ? jatuhTempo : '',
    catatan: catatan,
    status: 'selesai'
  }], ctx.user.id);

  const pembelianBaru = resBeli[0];

  // 2. Simpan Item Pembelian & Proses Efek Stok + HPP Moving Average
  const rowsItemBeli = [];
  const rowsKartuStok = [];
  const perbaruiProdukList = [];
  const perbaruiVarianList = [];

  itemsDiproses.forEach(function (item) {
    // Alokasi diskon proporsional untuk harga beli efektif (Aturan Bisnis #10)
    let diskonItem = 0;
    if (subtotalKotor > 0 && diskonFaktur > 0) {
      diskonItem = Math.round(diskonFaktur * (item.subtotal / subtotalKotor));
    }
    const itemNet = Math.max(0, item.subtotal - diskonItem);
    const hargaBeliEfektif = itemNet / item.qty;
    const hargaBeliDasarEfektif = hargaBeliEfektif / item.faktor;

    rowsItemBeli.push({
      pembelian_id: pembelianBaru.id,
      produk_id: item.produk.id,
      varian_id: item.varian ? item.varian.id : '',
      nama: item.nama,
      satuan: item.satuan,
      faktor: item.faktor,
      qty: item.qty,
      qty_dasar: item.qty_dasar,
      harga_beli: item.harga_beli,
      subtotal: item.subtotal
    });

    if (item.varian) {
      const stokLamaVarian = Number(item.varian.stok || 0);
      const hppLamaVarian = Number(item.varian.hpp || 0);
      const hppBaruVarian = hitungHppBaru_(stokLamaVarian, hppLamaVarian, item.qty_dasar, hargaBeliDasarEfektif);
      const stokBaruVarian = Math.round((stokLamaVarian + item.qty_dasar) * 1000) / 1000;

      perbaruiVarianList.push({
        id: item.varian.id,
        data: {
          stok: stokBaruVarian,
          hpp: hppBaruVarian
        }
      });

      // Update stok total produk induk
      const stokLamaProduk = Number(item.produk.stok || 0);
      const stokBaruProduk = Math.round((stokLamaProduk + item.qty_dasar) * 1000) / 1000;
      perbaruiProdukList.push({
        id: item.produk.id,
        data: {
          stok: stokBaruProduk
        }
      });

      rowsKartuStok.push({
        produk_id: item.produk.id,
        varian_id: item.varian.id,
        tipe: 'beli',
        qty: item.qty_dasar,
        saldo: stokBaruVarian,
        hpp: hppBaruVarian,
        ref_id: noFaktur,
        user_id: ctx.user.id,
        keterangan: 'Pembelian ' + noFaktur + ' (' + supplier.nama + ')'
      });
    } else {
      const stokLama = Number(item.produk.stok || 0);
      const hppLama = Number(item.produk.hpp || 0);
      const hppBaru = hitungHppBaru_(stokLama, hppLama, item.qty_dasar, hargaBeliDasarEfektif);
      const stokBaru = Math.round((stokLama + item.qty_dasar) * 1000) / 1000;

      perbaruiProdukList.push({
        id: item.produk.id,
        data: {
          stok: stokBaru,
          hpp: hppBaru
        }
      });

      rowsKartuStok.push({
        produk_id: item.produk.id,
        varian_id: '',
        tipe: 'beli',
        qty: item.qty_dasar,
        saldo: stokBaru,
        hpp: hppBaru,
        ref_id: noFaktur,
        user_id: ctx.user.id,
        keterangan: 'Pembelian ' + noFaktur + ' (' + supplier.nama + ')'
      });
    }
  });

  if (rowsItemBeli.length > 0) tambahBaris_('Pembelian_Item', rowsItemBeli, ctx.user.id);
  if (perbaruiProdukList.length > 0) ubahBaris_('Produk', perbaruiProdukList, ctx.user.id);
  if (perbaruiVarianList.length > 0) ubahBaris_('Varian', perbaruiVarianList, ctx.user.id);
  if (rowsKartuStok.length > 0) tambahBaris_('Kartu_Stok', rowsKartuStok, ctx.user.id);

  // 3. Catat Hutang bila pembayaran belum lunas
  if (sisaHutang > 0) {
    tambahBaris_('Hutang', [{
      pembelian_id: pembelianBaru.id,
      supplier_id: supplier.id,
      total: sisaHutang,
      terbayar: 0,
      sisa: sisaHutang,
      jatuh_tempo: jatuhTempo,
      status: 'belum'
    }], ctx.user.id);
  }

  // 4. Catat Pembayaran awal / DP bila ada bayar > 0
  if (nominalBayar > 0) {
    tambahBaris_('Pembayaran', [{
      tipe: 'hutang',
      ref_id: pembelianBaru.id,
      jumlah: nominalBayar,
      metode: payload.metode_bayar || 'tunai',
      tanggal: sekarang_(),
      catatan: 'Pembayaran faktur ' + noFaktur
    }], ctx.user.id);
  }

  // 5. Catat Log Audit
  catatAudit_(ctx.user.id, 'pembelian_create', 'PEMBELIAN', noFaktur, {
    supplier: supplier.nama,
    total: grandTotal,
    item_count: itemsDiproses.length,
    status_bayar: statusBayar
  });

  // Hapus cache katalog produk
  cacheHapus_('produk');

  return {
    pesan: 'Pembelian ' + noFaktur + ' berhasil disimpan.',
    no_faktur: noFaktur,
    id: pembelianBaru.id,
    total: grandTotal,
    status_bayar: statusBayar
  };
}

/** kartuStok.list — Buku besar riwayat mutasi stok barang lengkap. */
function aksiKartuStokList_(ctx) {
  const p = ctx.payload || {};
  const semuaKartu = bacaSemua_('Kartu_Stok');
  const semuaProduk = bacaSemua_('Produk');
  const semuaVarian = bacaSemua_('Varian');
  const semuaUsers = bacaSemua_('Users');

  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  let data = semuaKartu.map(function (ks) {
    const pr = produkPeta[ks.produk_id];
    const vr = ks.varian_id ? varianPeta[ks.varian_id] : null;
    return {
      id: ks.id,
      created_at: ks.created_at,
      produk_id: ks.produk_id,
      produk_nama: pr ? pr.nama : 'Produk Tidak Ditemukan',
      produk_sku: pr ? pr.sku : '',
      satuan_dasar: pr ? pr.satuan_dasar : '',
      varian_id: ks.varian_id || '',
      varian_nama: vr ? vr.nama_varian : '',
      tipe: ks.tipe,
      qty: ks.qty,
      saldo: ks.saldo,
      hpp: ks.hpp,
      ref_id: ks.ref_id,
      user_id: ks.user_id,
      petugas_nama: userPeta[ks.user_id] || ks.user_id || 'Sistem',
      keterangan: ks.keterangan
    };
  });

  // Filter produk
  if (p.produk_id) {
    data = data.filter(function (ks) { return ks.produk_id === p.produk_id; });
  }

  // Filter varian
  if (p.varian_id) {
    data = data.filter(function (ks) { return ks.varian_id === p.varian_id; });
  }

  // Filter tipe mutasi
  if (p.tipe) {
    data = data.filter(function (ks) { return ks.tipe === p.tipe; });
  }

  // Filter rentang tanggal
  if (p.dari) {
    data = data.filter(function (ks) { return String(ks.created_at || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (ks) { return String(ks.created_at || '').substring(0, 10) <= p.sampai; });
  }

  // Pencarian q (nama produk, sku, ref_id, keterangan)
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (ks) {
      return String(ks.produk_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(ks.produk_sku || '').toLowerCase().indexOf(q) !== -1 ||
        String(ks.ref_id || '').toLowerCase().indexOf(q) !== -1 ||
        String(ks.keterangan || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan terbaru di atas
  data.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/** opname.list — Daftar dokumen stok opname fisik vs sistem. */
function aksiOpnameList_(ctx) {
  const p = ctx.payload || {};
  const semuaOpname = bacaSemua_('Opname');
  const semuaProduk = bacaSemua_('Produk');
  const semuaVarian = bacaSemua_('Varian');
  const semuaUsers = bacaSemua_('Users');

  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  let data = semuaOpname.map(function (op) {
    const pr = produkPeta[op.produk_id];
    const vr = op.varian_id ? varianPeta[op.varian_id] : null;
    return {
      id: op.id,
      no_opname: op.no_opname,
      tanggal: op.tanggal,
      produk_id: op.produk_id,
      produk_nama: pr ? pr.nama : 'Produk Tidak Ditemukan',
      produk_sku: pr ? pr.sku : '',
      satuan_dasar: pr ? pr.satuan_dasar : '',
      varian_id: op.varian_id || '',
      varian_nama: vr ? vr.nama_varian : '',
      qty_sistem: op.qty_sistem,
      qty_fisik: op.qty_fisik,
      selisih: op.selisih,
      alasan: op.alasan,
      status: op.status,
      disetujui_oleh: op.disetujui_oleh,
      penyetuju_nama: userPeta[op.disetujui_oleh] || '',
      disetujui_at: op.disetujui_at
    };
  });

  if (p.status) {
    data = data.filter(function (op) { return op.status === p.status; });
  }

  if (p.produk_id) {
    data = data.filter(function (op) { return op.produk_id === p.produk_id; });
  }

  if (p.dari) {
    data = data.filter(function (op) { return String(op.tanggal || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (op) { return String(op.tanggal || '').substring(0, 10) <= p.sampai; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (op) {
      return String(op.no_opname || '').toLowerCase().indexOf(q) !== -1 ||
        String(op.produk_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(op.alasan || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) {
    return String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/**
 * opname.create — Buat dokumen stok opname.
 * Jika langsung_setuju === true: stok sistem langsung disesuaikan dan dicatat di Kartu_Stok.
 * Aturan Bisnis #12: Opname TIDAK MENGUBAH HPP.
 */
function aksiOpnameCreate_(ctx) {
  const p = ctx.payload || {};
  if (!p.produk_id) gagal_(KODE.VALIDATION, 'Produk wajib dipilih.');

  const produk = cariById_('Produk', p.produk_id);
  if (!produk || produk.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  let varian = null;
  if (p.varian_id) {
    varian = cariById_('Varian', p.varian_id);
    if (!varian || varian.deleted) gagal_(KODE.NOT_FOUND, 'Varian produk tidak ditemukan.');
  }

  const stokSistemSaatIni = varian ? Number(varian.stok || 0) : Number(produk.stok || 0);
  const hppSaatIni = varian ? Number(varian.hpp || 0) : Number(produk.hpp || 0);
  const qtyFisik = V_.qty(p.qty_fisik, 'Kuantitas Fisik Riil');
  const selisih = Math.round((qtyFisik - stokSistemSaatIni) * 1000) / 1000;
  const alasan = V_.teks(p.alasan, 'Alasan Selisih', { wajib: true, maks: 300 });

  const langsungSetuju = p.langsung_setuju === true;
  const noOpname = nomorBerikut_('OP');
  const waktuOpname = sekarang_();

  const dataOpname = {
    no_opname: noOpname,
    tanggal: waktuOpname,
    produk_id: produk.id,
    varian_id: varian ? varian.id : '',
    qty_sistem: stokSistemSaatIni,
    qty_fisik: qtyFisik,
    selisih: selisih,
    alasan: alasan,
    status: langsungSetuju ? 'disetujui' : 'draft',
    disetujui_oleh: langsungSetuju ? ctx.user.id : '',
    disetujui_at: langsungSetuju ? waktuOpname : ''
  };

  const resOp = tambahBaris_('Opname', [dataOpname], ctx.user.id);
  const opnameBaru = resOp[0];

  if (langsungSetuju) {
    // Terapkan penyesuaian stok
    if (varian) {
      ubahBaris_('Varian', [{
        id: varian.id,
        data: { stok: qtyFisik }
      }], ctx.user.id);

      // Hitung ulang total stok induk produk
      const semuaV = bacaSemua_('Varian').filter(function (v) { return v.produk_id === produk.id && !v.deleted; });
      let totalVarianStok = 0;
      semuaV.forEach(function (v) {
        totalVarianStok += (v.id === varian.id ? qtyFisik : Number(v.stok || 0));
      });
      ubahBaris_('Produk', [{
        id: produk.id,
        data: { stok: Math.round(totalVarianStok * 1000) / 1000 }
      }], ctx.user.id);
    } else {
      ubahBaris_('Produk', [{
        id: produk.id,
        data: { stok: qtyFisik }
      }], ctx.user.id);
    }

    // Catat mutasi di Kartu_Stok (Aturan Bisnis #12: HPP tidak berubah)
    tambahBaris_('Kartu_Stok', [{
      produk_id: produk.id,
      varian_id: varian ? varian.id : '',
      tipe: 'opname',
      qty: selisih,
      saldo: qtyFisik,
      hpp: hppSaatIni,
      ref_id: noOpname,
      user_id: ctx.user.id,
      keterangan: 'Stok opname ' + noOpname + ': ' + alasan
    }], ctx.user.id);

    // Catat audit (Aturan Bisnis #8: aksi sensitif opname masuk Log_Audit)
    catatAudit_(ctx.user.id, 'opname_approve', 'STOK', noOpname, {
      produk: produk.nama,
      varian: varian ? varian.nama_varian : '',
      qty_sistem: stokSistemSaatIni,
      qty_fisik: qtyFisik,
      selisih: selisih,
      alasan: alasan
    });

    cacheHapus_('produk');
  }

  return {
    pesan: 'Dokumen stok opname ' + noOpname + (langsungSetuju ? ' berhasil diterapkan.' : ' disimpan sebagai draft.'),
    no_opname: noOpname,
    id: opnameBaru.id,
    status: dataOpname.status
  };
}

/** opname.approve — Setujui penyesuaian stok opname dari status draft (Owner & Admin). */
function aksiOpnameApprove_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID opname wajib diberikan.');

  const opname = cariById_('Opname', p.id);
  if (!opname || opname.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen stok opname tidak ditemukan.');
  if (opname.status !== 'draft') {
    gagal_(KODE.CONFLICT, 'Hanya dokumen opname berstatus "draft" yang dapat disetujui.');
  }

  const produk = cariById_('Produk', opname.produk_id);
  if (!produk) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  let varian = null;
  if (opname.varian_id) {
    varian = cariById_('Varian', opname.varian_id);
  }

  const hppSaatIni = varian ? Number(varian.hpp || 0) : Number(produk.hpp || 0);
  const qtyFisik = Number(opname.qty_fisik);
  const waktuSetuju = sekarang_();

  // Terapkan penyesuaian stok ke master
  if (varian) {
    ubahBaris_('Varian', [{ id: varian.id, data: { stok: qtyFisik } }], ctx.user.id);
    const semuaV = bacaSemua_('Varian').filter(function (v) { return v.produk_id === produk.id && !v.deleted; });
    let totalVarianStok = 0;
    semuaV.forEach(function (v) {
      totalVarianStok += (v.id === varian.id ? qtyFisik : Number(v.stok || 0));
    });
    ubahBaris_('Produk', [{ id: produk.id, data: { stok: Math.round(totalVarianStok * 1000) / 1000 } }], ctx.user.id);
  } else {
    ubahBaris_('Produk', [{ id: produk.id, data: { stok: qtyFisik } }], ctx.user.id);
  }

  // Catat di Kartu_Stok
  tambahBaris_('Kartu_Stok', [{
    produk_id: produk.id,
    varian_id: varian ? varian.id : '',
    tipe: 'opname',
    qty: opname.selisih,
    saldo: qtyFisik,
    hpp: hppSaatIni,
    ref_id: opname.no_opname,
    user_id: ctx.user.id,
    keterangan: 'Persetujuan opname ' + opname.no_opname + ': ' + opname.alasan
  }], ctx.user.id);

  // Ubah status Opname
  ubahBaris_('Opname', [{
    id: opname.id,
    data: {
      status: 'disetujui',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktuSetuju
    }
  }], ctx.user.id);

  catatAudit_(ctx.user.id, 'opname_approve', 'STOK', opname.no_opname, {
    selisih: opname.selisih,
    alasan: opname.alasan
  });

  cacheHapus_('produk');

  return {
    pesan: 'Dokumen stok opname ' + opname.no_opname + ' berhasil disetujui dan stok disesuaikan.',
    no_opname: opname.no_opname
  };
}

/* ---------- 9.4 HUTANG, PIUTANG, DAN RETUR (FASE 4) ---------- */

/** piutang.list — Daftar piutang pelanggan atas penjualan tempo. */
function aksiPiutangList_(ctx) {
  const p = ctx.payload || {};
  const semuaPiutang = bacaSemua_('Piutang');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const semuaPenjualan = bacaSemua_('Penjualan');

  const pelangganPeta = {};
  semuaPelanggan.forEach(function (pel) { pelangganPeta[pel.id] = pel; });

  const penjualanPeta = {};
  semuaPenjualan.forEach(function (pj) { penjualanPeta[pj.id] = pj; });

  const hariIni = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  let totalPiutangBerjalan = 0;

  let data = semuaPiutang.map(function (pt) {
    const pel = pelangganPeta[pt.pelanggan_id] || {};
    const pj = penjualanPeta[pt.penjualan_id] || {};
    const sisa = Number(pt.sisa) || 0;

    if (pt.status !== 'lunas') {
      totalPiutangBerjalan += sisa;
    }

    const tJatuh = String(pt.jatuh_tempo || '').substring(0, 10);
    const sudahLewat = pt.status !== 'lunas' && tJatuh && tJatuh < hariIni;

    return {
      id: pt.id,
      penjualan_id: pt.penjualan_id,
      no_nota: pj.no_nota || '-',
      tanggal_penjualan: pj.tanggal || pt.created_at,
      pelanggan_id: pt.pelanggan_id,
      pelanggan_nama: pel.nama || 'Pelanggan Umum',
      pelanggan_kode: pel.kode || '',
      pelanggan_hp: pel.hp || '',
      total: Number(pt.total) || 0,
      terbayar: Number(pt.terbayar) || 0,
      sisa: sisa,
      jatuh_tempo: pt.jatuh_tempo || '',
      lewat_jatuh_tempo: sudahLewat,
      status: pt.status
    };
  });

  // Filter status
  if (p.status) {
    data = data.filter(function (pt) { return pt.status === p.status; });
  }

  // Filter pelanggan
  if (p.pelanggan_id) {
    data = data.filter(function (pt) { return pt.pelanggan_id === p.pelanggan_id; });
  }

  // Filter lewat jatuh tempo saja
  if (p.lewat_jatuh_tempo === true) {
    data = data.filter(function (pt) { return pt.lewat_jatuh_tempo; });
  }

  // Pencarian q (no_nota, nama pelanggan, no hp)
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pt) {
      return String(pt.no_nota || '').toLowerCase().indexOf(q) !== -1 ||
        String(pt.pelanggan_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(pt.pelanggan_hp || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan: belum lunas di atas, lalu jatuh tempo terdekat
  data.sort(function (a, b) {
    if (a.status !== 'lunas' && b.status === 'lunas') return -1;
    if (a.status === 'lunas' && b.status !== 'lunas') return 1;
    return String(a.jatuh_tempo || '9999').localeCompare(String(b.jatuh_tempo || '9999'));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    total_piutang_berjalan: totalPiutangBerjalan,
    page: page,
    limit: limit
  };
}

/** piutang.detail — Rincian piutang, nota penjualan, dan riwayat cicilan. */
function aksiPiutangDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID piutang wajib diberikan.');

  const piutang = cariById_('Piutang', p.id);
  if (!piutang) gagal_(KODE.NOT_FOUND, 'Data piutang tidak ditemukan.');

  const penjualan = cariById_('Penjualan', piutang.penjualan_id) || {};
  const pelanggan = cariById_('Pelanggan', piutang.pelanggan_id) || {};
  const semuaBayar = bacaSemua_('Pembayaran');
  const riwayatPembayaran = semuaBayar
    .filter(function (byr) { return byr.tipe === 'piutang' && byr.ref_id === piutang.id && !byr.deleted; })
    .sort(function (a, b) { return String(b.tanggal || '').localeCompare(String(a.tanggal || '')); });

  return {
    piutang: piutang,
    penjualan: penjualan,
    pelanggan: pelanggan,
    riwayat_pembayaran: riwayatPembayaran
  };
}

/**
 * piutang.bayar — Catat cicilan atau pelunasan piutang pelanggan.
 * Penegakan Aturan Bisnis #7 & #16:
 * Transaksi tempo baru mendapatkan poin loyalitas dan akumulasi total_belanja
 * saat piutang dilunasi (status menjadi 'lunas').
 */
function aksiPiutangBayar_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID piutang wajib diberikan.');

  const piutang = cariById_('Piutang', p.id);
  if (!piutang || piutang.deleted) gagal_(KODE.NOT_FOUND, 'Data piutang tidak ditemukan.');
  if (piutang.status === 'lunas') {
    gagal_(KODE.CONFLICT, 'Piutang ini sudah berstatus lunas.');
  }

  const sisaSebelum = Number(piutang.sisa) || 0;
  const jumlahBayar = V_.rupiah(p.jumlah, 'Jumlah Pembayaran', { wajib: true, min: 1 });

  if (jumlahBayar > sisaSebelum) {
    gagal_(KODE.VALIDATION, 'Jumlah bayar (' + formatRupiah_(jumlahBayar) + ') melebihi sisa piutang (' + formatRupiah_(sisaSebelum) + ').');
  }

  const sisaBaru = Math.max(0, sisaSebelum - jumlahBayar);
  const terbayarBaru = (Number(piutang.terbayar) || 0) + jumlahBayar;
  const statusBaru = sisaBaru === 0 ? 'lunas' : 'sebagian';
  const waktuBayar = sekarang_();

  // 1. Perbarui record Piutang
  ubahBaris_('Piutang', [{
    id: piutang.id,
    data: {
      terbayar: terbayarBaru,
      sisa: sisaBaru,
      status: statusBaru
    }
  }], ctx.user.id);

  // 2. Catat ke sheet Pembayaran
  tambahBaris_('Pembayaran', [{
    tipe: 'piutang',
    ref_id: piutang.id,
    jumlah: jumlahBayar,
    metode: p.metode || 'tunai',
    tanggal: waktuBayar,
    catatan: p.catatan || ('Pembayaran piutang nota ' + (piutang.penjualan_id || ''))
  }], ctx.user.id);

  // 3. Update status bayar di Penjualan asal
  if (piutang.penjualan_id) {
    const pj = cariById_('Penjualan', piutang.penjualan_id);
    if (pj) {
      const bayarBaru = (Number(pj.bayar) || 0) + jumlahBayar;
      ubahBaris_('Penjualan', [{
        id: pj.id,
        data: {
          bayar: bayarBaru,
          status_bayar: statusBaru
        }
      }], ctx.user.id);
    }
  }

  // 4. Aturan Bisnis #7 & #16: Jika lunas dan pelanggan adalah Member, berikan poin dari nilai tempo
  let poinDiberikan = 0;
  if (statusBaru === 'lunas' && piutang.pelanggan_id) {
    const pel = cariById_('Pelanggan', piutang.pelanggan_id);
    if (pel && pel.tipe === 'member') {
      const pengaturan = ambilPengaturan_();
      if (pengaturan.poin_per_rupiah > 0) {
        let pengali = 1;
        (pengaturan.level_member || []).forEach(function (lvl) {
          if (lvl.nama === pel.level) pengali = Number(lvl.pengali) || 1;
        });
        poinDiberikan = Math.floor((Number(piutang.total) / pengaturan.poin_per_rupiah) * pengali);
      }

      const totalBelanjaLama = Number(pel.total_belanja || 0);
      const totalBelanjaBaru = totalBelanjaLama + Number(piutang.total);
      const poinLama = Number(pel.poin || 0);
      const poinBaru = poinLama + poinDiberikan;

      ubahBaris_('Pelanggan', [{
        id: pel.id,
        data: {
          poin: poinBaru,
          total_belanja: totalBelanjaBaru
        }
      }], ctx.user.id);

      if (poinDiberikan > 0) {
        tambahBaris_('Poin_Log', [{
          pelanggan_id: pel.id,
          jumlah: poinDiberikan,
          jenis: 'dapat',
          ref_id: piutang.id,
          saldo: poinBaru
        }], ctx.user.id);
      }
    }
  }

  // 5. Catat Log Audit
  catatAudit_(ctx.user.id, 'piutang_bayar', 'KEUANGAN', piutang.id, {
    jumlah: jumlahBayar,
    sisa: sisaBaru,
    status: statusBaru,
    poin_diberikan: poinDiberikan
  });

  return {
    pesan: 'Pembayaran ' + formatRupiah_(jumlahBayar) + ' berhasil dicatat. Status: ' + statusBaru + '.',
    sisa: sisaBaru,
    status: statusBaru,
    poin_didapat: poinDiberikan
  };
}

/** hutang.list — Daftar hutang ke supplier atas pembelian tempo (Owner & Admin). */
function aksiHutangList_(ctx) {
  const p = ctx.payload || {};
  const semuaHutang = bacaSemua_('Hutang');
  const semuaSupplier = bacaSemua_('Supplier');
  const semuaPembelian = bacaSemua_('Pembelian');

  const supplierPeta = {};
  semuaSupplier.forEach(function (s) { supplierPeta[s.id] = s; });

  const pembelianPeta = {};
  semuaPembelian.forEach(function (pb) { pembelianPeta[pb.id] = pb; });

  const hariIni = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  let totalHutangBerjalan = 0;

  let data = semuaHutang.map(function (ht) {
    const sup = supplierPeta[ht.supplier_id] || {};
    const pb = pembelianPeta[ht.pembelian_id] || {};
    const sisa = Number(ht.sisa) || 0;

    if (ht.status !== 'lunas') {
      totalHutangBerjalan += sisa;
    }

    const tJatuh = String(ht.jatuh_tempo || '').substring(0, 10);
    const sudahLewat = ht.status !== 'lunas' && tJatuh && tJatuh < hariIni;

    return {
      id: ht.id,
      pembelian_id: ht.pembelian_id,
      no_faktur: pb.no_faktur || '-',
      no_faktur_supplier: pb.no_faktur_supplier || '',
      tanggal_pembelian: pb.tanggal || ht.created_at,
      supplier_id: ht.supplier_id,
      supplier_nama: sup.nama || 'Supplier Umum',
      supplier_hp: sup.hp || '',
      total: Number(ht.total) || 0,
      terbayar: Number(ht.terbayar) || 0,
      sisa: sisa,
      jatuh_tempo: ht.jatuh_tempo || '',
      lewat_jatuh_tempo: sudahLewat,
      status: ht.status
    };
  });

  if (p.status) {
    data = data.filter(function (ht) { return ht.status === p.status; });
  }

  if (p.supplier_id) {
    data = data.filter(function (ht) { return ht.supplier_id === p.supplier_id; });
  }

  if (p.lewat_jatuh_tempo === true) {
    data = data.filter(function (ht) { return ht.lewat_jatuh_tempo; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (ht) {
      return String(ht.no_faktur || '').toLowerCase().indexOf(q) !== -1 ||
        String(ht.no_faktur_supplier || '').toLowerCase().indexOf(q) !== -1 ||
        String(ht.supplier_nama || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) {
    if (a.status !== 'lunas' && b.status === 'lunas') return -1;
    if (a.status === 'lunas' && b.status !== 'lunas') return 1;
    return String(a.jatuh_tempo || '9999').localeCompare(String(b.jatuh_tempo || '9999'));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    total_hutang_berjalan: totalHutangBerjalan,
    page: page,
    limit: limit
  };
}

/** hutang.detail — Rincian hutang ke supplier dan riwayat pembayaran cicilan. */
function aksiHutangDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hutang wajib diberikan.');

  const hutang = cariById_('Hutang', p.id);
  if (!hutang) gagal_(KODE.NOT_FOUND, 'Data hutang tidak ditemukan.');

  const pembelian = cariById_('Pembelian', hutang.pembelian_id) || {};
  const supplier = cariById_('Supplier', hutang.supplier_id) || {};
  const semuaBayar = bacaSemua_('Pembayaran');
  const riwayatPembayaran = semuaBayar
    .filter(function (byr) { return byr.tipe === 'hutang' && byr.ref_id === hutang.id && !byr.deleted; })
    .sort(function (a, b) { return String(b.tanggal || '').localeCompare(String(a.tanggal || '')); });

  return {
    hutang: hutang,
    pembelian: pembelian,
    supplier: supplier,
    riwayat_pembayaran: riwayatPembayaran
  };
}

/** hutang.bayar — Catat cicilan atau pelunasan hutang ke supplier (Owner & Admin). */
function aksiHutangBayar_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hutang wajib diberikan.');

  const hutang = cariById_('Hutang', p.id);
  if (!hutang || hutang.deleted) gagal_(KODE.NOT_FOUND, 'Data hutang tidak ditemukan.');
  if (hutang.status === 'lunas') {
    gagal_(KODE.CONFLICT, 'Hutang ini sudah berstatus lunas.');
  }

  const sisaSebelum = Number(hutang.sisa) || 0;
  const jumlahBayar = V_.rupiah(p.jumlah, 'Jumlah Pembayaran', { wajib: true, min: 1 });

  if (jumlahBayar > sisaSebelum) {
    gagal_(KODE.VALIDATION, 'Jumlah bayar (' + formatRupiah_(jumlahBayar) + ') melebihi sisa hutang (' + formatRupiah_(sisaSebelum) + ').');
  }

  const sisaBaru = Math.max(0, sisaSebelum - jumlahBayar);
  const terbayarBaru = (Number(hutang.terbayar) || 0) + jumlahBayar;
  const statusBaru = sisaBaru === 0 ? 'lunas' : 'sebagian';
  const waktuBayar = sekarang_();

  // 1. Update record Hutang
  ubahBaris_('Hutang', [{
    id: hutang.id,
    data: {
      terbayar: terbayarBaru,
      sisa: sisaBaru,
      status: statusBaru
    }
  }], ctx.user.id);

  // 2. Tambah record Pembayaran
  tambahBaris_('Pembayaran', [{
    tipe: 'hutang',
    ref_id: hutang.id,
    jumlah: jumlahBayar,
    metode: p.metode || 'tunai',
    tanggal: waktuBayar,
    catatan: p.catatan || ('Pembayaran hutang faktur ' + (hutang.pembelian_id || ''))
  }], ctx.user.id);

  // 3. Update status bayar di Pembelian asal
  if (hutang.pembelian_id) {
    const pb = cariById_('Pembelian', hutang.pembelian_id);
    if (pb) {
      const bayarBaru = (Number(pb.bayar) || 0) + jumlahBayar;
      ubahBaris_('Pembelian', [{
        id: pb.id,
        data: {
          bayar: bayarBaru,
          status_bayar: statusBaru
        }
      }], ctx.user.id);
    }
  }

  // 4. Catat Log Audit
  catatAudit_(ctx.user.id, 'hutang_bayar', 'KEUANGAN', hutang.id, {
    jumlah: jumlahBayar,
    sisa: sisaBaru,
    status: statusBaru
  });

  return {
    pesan: 'Pembayaran hutang ' + formatRupiah_(jumlahBayar) + ' berhasil dicatat. Status: ' + statusBaru + '.',
    sisa: sisaBaru,
    status: statusBaru
  };
}

/** retur.list — Daftar dokumen retur penjualan & pembelian. */
function aksiReturList_(ctx) {
  const p = ctx.payload || {};
  const semuaRetur = bacaSemua_('Retur');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const semuaSupplier = bacaSemua_('Supplier');
  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaPembelian = bacaSemua_('Pembelian');

  const pihakPeta = {};
  semuaPelanggan.forEach(function (pel) { pihakPeta[pel.id] = pel.nama; });
  semuaSupplier.forEach(function (sup) { pihakPeta[sup.id] = sup.nama; });

  const refNotaPeta = {};
  semuaPenjualan.forEach(function (pj) { refNotaPeta[pj.id] = pj.no_nota; });
  semuaPembelian.forEach(function (pb) { refNotaPeta[pb.id] = pb.no_faktur; });

  let data = semuaRetur.map(function (rt) {
    return {
      id: rt.id,
      no_retur: rt.no_retur,
      tipe: rt.tipe,
      ref_id: rt.ref_id,
      no_referensi_asal: refNotaPeta[rt.ref_id] || rt.ref_id || '-',
      pihak_id: rt.pihak_id,
      pihak_nama: pihakPeta[rt.pihak_id] || (rt.tipe === 'jual' ? 'Pelanggan Umum' : 'Supplier Umum'),
      tanggal: rt.tanggal,
      total: Number(rt.total) || 0,
      metode_refund: rt.metode_refund,
      alasan: rt.alasan,
      status: rt.status,
      disetujui_oleh: rt.disetujui_oleh,
      disetujui_at: rt.disetujui_at
    };
  });

  if (p.tipe) {
    data = data.filter(function (rt) { return rt.tipe === p.tipe; });
  }

  if (p.status) {
    data = data.filter(function (rt) { return rt.status === p.status; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (rt) {
      return String(rt.no_retur || '').toLowerCase().indexOf(q) !== -1 ||
        String(rt.no_referensi_asal || '').toLowerCase().indexOf(q) !== -1 ||
        String(rt.pihak_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(rt.alasan || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) {
    return String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/** retur.detail — Rincian dokumen retur, item yang diretur, dan referensi transaksi. */
function aksiReturDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID retur wajib diberikan.');

  const retur = cariById_('Retur', p.id);
  if (!retur) gagal_(KODE.NOT_FOUND, 'Data retur tidak ditemukan.');

  const semuaItems = bacaSemua_('Retur_Item');
  const items = semuaItems.filter(function (it) { return it.retur_id === retur.id && !it.deleted; });

  let pihak = null;
  let transaksiAsal = null;

  if (retur.tipe === 'jual') {
    pihak = cariById_('Pelanggan', retur.pihak_id) || { nama: 'Pelanggan Umum' };
    transaksiAsal = cariById_('Penjualan', retur.ref_id);
  } else {
    pihak = cariById_('Supplier', retur.pihak_id) || { nama: 'Supplier Umum' };
    transaksiAsal = cariById_('Pembelian', retur.ref_id);
  }

  return {
    retur: retur,
    items: items,
    pihak: pihak,
    transaksi_asal: transaksiAsal
  };
}

/**
 * retur.create — Membuat retur penjualan atau retur pembelian.
 * Aturan Bisnis #4, #7, #12, #16:
 * - Kasir: status 'diajukan'.
 * - Owner / Admin: status 'disetujui' (langsung menerapkan efek stok, HPP, kas/piutang/hutang, dan poin).
 */
function aksiReturCreate_(ctx) {
  const p = ctx.payload || {};
  const tipe = String(p.tipe || '').trim().toLowerCase();
  if (tipe !== 'jual' && tipe !== 'beli') {
    gagal_(KODE.VALIDATION, 'Tipe retur harus "jual" atau "beli".');
  }

  const refId = String(p.ref_id || '').trim();
  if (!refId) gagal_(KODE.VALIDATION, 'ID transaksi asal (ref_id) wajib diberikan.');

  const alasan = V_.teks(p.alasan, 'Alasan Retur', { wajib: true, maks: 300 });
  const metodeRefund = String(p.metode_refund || 'kas').trim();
  const rawItems = p.items;

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Daftar barang yang diretur tidak boleh kosong.');
  }

  let pihakId = '';
  let transaksiAsal = null;

  if (tipe === 'jual') {
    transaksiAsal = cariById_('Penjualan', refId);
    if (!transaksiAsal || transaksiAsal.deleted) {
      gagal_(KODE.NOT_FOUND, 'Transaksi penjualan asal tidak ditemukan.');
    }
    if (transaksiAsal.status !== 'final') {
      gagal_(KODE.CONFLICT, 'Hanya penjualan berstatus "final" yang dapat diretur.');
    }
    pihakId = transaksiAsal.pelanggan_id || '';
  } else {
    transaksiAsal = cariById_('Pembelian', refId);
    if (!transaksiAsal || transaksiAsal.deleted) {
      gagal_(KODE.NOT_FOUND, 'Faktur pembelian asal tidak ditemukan.');
    }
    pihakId = transaksiAsal.supplier_id || '';
  }

  const isOwnerAdmin = ctx.user.role === ROLE.OWNER || ctx.user.role === ROLE.ADMIN;
  const statusAwal = isOwnerAdmin ? 'disetujui' : 'diajukan';
  const waktuSekarang = sekarang_();
  const noRetur = nomorBerikut_('RT');

  let totalRetur = 0;
  const itemsValid = [];

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const qty = V_.qty(it.qty, 'Qty Retur Item ' + (i + 1));
    const faktor = Math.max(1, Number(it.faktor) || 1);
    const qtyDasar = Math.round(qty * faktor * 1000) / 1000;
    const harga = V_.rupiah(it.harga, 'Harga Item ' + (i + 1), { wajib: true, min: 0 });
    const hpp = Number(it.hpp) || 0;
    const itemSubtotal = Math.round(qty * harga);

    totalRetur += itemSubtotal;

    itemsValid.push({
      ref_item_id: it.ref_item_id || '',
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      nama: it.nama || '',
      satuan: it.satuan || '',
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      harga: harga,
      hpp: hpp,
      subtotal: itemSubtotal
    });
  }

  // Simpan Dokumen Retur
  const resRetur = tambahBaris_('Retur', [{
    no_retur: noRetur,
    tipe: tipe,
    ref_id: refId,
    pihak_id: pihakId,
    tanggal: waktuSekarang,
    total: totalRetur,
    metode_refund: metodeRefund,
    alasan: alasan,
    status: statusAwal,
    disetujui_oleh: isOwnerAdmin ? ctx.user.id : '',
    disetujui_at: isOwnerAdmin ? waktuSekarang : ''
  }], ctx.user.id);

  const returBaru = resRetur[0];

  // Simpan Item Retur
  const rowsReturItem = itemsValid.map(function (it) {
    return Object.assign({ retur_id: returBaru.id }, it);
  });
  tambahBaris_('Retur_Item', rowsReturItem, ctx.user.id);

  // Jika langsung disetujui, terapkan efeknya seketika
  if (statusAwal === 'disetujui') {
    terapkanEfekRetur_(returBaru, itemsValid, transaksiAsal, ctx);
  } else {
    catatAudit_(ctx.user.id, 'retur_ajukan', 'RETUR', noRetur, {
      tipe: tipe,
      total: totalRetur,
      alasan: alasan
    });
  }

  return {
    pesan: statusAwal === 'disetujui'
      ? 'Dokumen retur ' + noRetur + ' berhasil disetujui dan diterapkan.'
      : 'Permohonan retur ' + noRetur + ' berhasil diajukan dan menunggu persetujuan Owner/Admin.',
    no_retur: noRetur,
    status: statusAwal
  };
}

/** retur.approve — Menyetujui permohonan retur yang diajukan kasir (Owner & Admin). */
function aksiReturApprove_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID retur wajib diberikan.');

  const retur = cariById_('Retur', p.id);
  if (!retur || retur.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen retur tidak ditemukan.');
  if (retur.status !== 'diajukan') {
    gagal_(KODE.CONFLICT, 'Hanya retur berstatus "diajukan" yang dapat disetujui.');
  }

  const items = bacaSemua_('Retur_Item').filter(function (it) { return it.retur_id === retur.id && !it.deleted; });
  let transaksiAsal = null;
  if (retur.tipe === 'jual') {
    transaksiAsal = cariById_('Penjualan', retur.ref_id);
  } else {
    transaksiAsal = cariById_('Pembelian', retur.ref_id);
  }

  const waktuSetuju = sekarang_();
  ubahBaris_('Retur', [{
    id: retur.id,
    data: {
      status: 'disetujui',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktuSetuju
    }
  }], ctx.user.id);

  retur.status = 'disetujui';
  retur.disetujui_oleh = ctx.user.id;
  retur.disetujui_at = waktuSetuju;

  terapkanEfekRetur_(retur, items, transaksiAsal, ctx);

  return {
    pesan: 'Dokumen retur ' + retur.no_retur + ' berhasil disetujui dan efek stok/finansial telah diterapkan.',
    no_retur: retur.no_retur
  };
}

/** retur.reject — Menolak permohonan retur (Owner & Admin). */
function aksiReturReject_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID retur wajib diberikan.');

  const retur = cariById_('Retur', p.id);
  if (!retur || retur.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen retur tidak ditemukan.');
  if (retur.status !== 'diajukan') {
    gagal_(KODE.CONFLICT, 'Hanya retur berstatus "diajukan" yang dapat ditolak.');
  }

  const waktuTolak = sekarang_();
  const alasanTolak = V_.teks(p.alasan_tolak, 'Alasan Penolakan', { maks: 300 }) || 'Ditolak oleh ' + ctx.user.username;

  ubahBaris_('Retur', [{
    id: retur.id,
    data: {
      status: 'ditolak',
      alasan: retur.alasan + ' [Ditolak: ' + alasanTolak + ']',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktuTolak
    }
  }], ctx.user.id);

  catatAudit_(ctx.user.id, 'retur_reject', 'RETUR', retur.no_retur, { alasan_tolak: alasanTolak });

  return {
    pesan: 'Permohonan retur ' + retur.no_retur + ' telah ditolak.',
    no_retur: retur.no_retur
  };
}

/**
 * Helper internal untuk menerapkan seluruh efek atomik persetujuan retur:
 * - Stok & Moving Average HPP (Aturan Bisnis #12 & #10)
 * - Kartu Stok (Aturan Bisnis #5)
 * - Poin Loyalitas & Total Belanja Member (Aturan Bisnis #7 & #16)
 * - Potong Piutang / Hutang / Kas Refund
 */
function terapkanEfekRetur_(retur, items, transaksiAsal, ctx) {
  const tipe = retur.tipe;
  const perbaruiProdukList = [];
  const perbaruiVarianList = [];
  const rowsKartuStok = [];

  items.forEach(function (it) {
    const qtyDasar = Number(it.qty_dasar) || 0;

    if (tipe === 'jual') {
      // 1. RETUR JUAL: Kembalikan stok & hitung ulang HPP memakai HPP snapshot item asal (Aturan Bisnis #12)
      if (it.varian_id) {
        const v = cariById_('Varian', it.varian_id);
        const p = cariById_('Produk', it.produk_id);
        const stokLamaV = Number(v.stok || 0);
        const hppLamaV = Number(v.hpp || 0);
        const hppSnapshot = Number(it.hpp || 0);
        const hppBaruV = hitungHppBaru_(stokLamaV, hppLamaV, qtyDasar, hppSnapshot);
        const stokBaruV = Math.round((stokLamaV + qtyDasar) * 1000) / 1000;

        perbaruiVarianList.push({ id: v.id, data: { stok: stokBaruV, hpp: hppBaruV } });

        const stokLamaP = Number(p.stok || 0);
        const stokBaruP = Math.round((stokLamaP + qtyDasar) * 1000) / 1000;
        perbaruiProdukList.push({ id: p.id, data: { stok: stokBaruP } });

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: it.varian_id,
          tipe: 'retur_jual',
          qty: qtyDasar,
          saldo: stokBaruV,
          hpp: hppBaruV,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur penjualan ' + retur.no_retur + ': ' + retur.alasan
        });
      } else {
        const p = cariById_('Produk', it.produk_id);
        const stokLama = Number(p.stok || 0);
        const hppLama = Number(p.hpp || 0);
        const hppSnapshot = Number(it.hpp || 0);
        const hppBaru = hitungHppBaru_(stokLama, hppLama, qtyDasar, hppSnapshot);
        const stokBaru = Math.round((stokLama + qtyDasar) * 1000) / 1000;

        perbaruiProdukList.push({ id: p.id, data: { stok: stokBaru, hpp: hppBaru } });

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: '',
          tipe: 'retur_jual',
          qty: qtyDasar,
          saldo: stokBaru,
          hpp: hppBaru,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur penjualan ' + retur.no_retur + ': ' + retur.alasan
        });
      }
    } else {
      // 2. RETUR BELI: Kurangi stok pada HPP berjalan (Aturan Bisnis #12: HPP tidak berubah)
      if (it.varian_id) {
        const v = cariById_('Varian', it.varian_id);
        const p = cariById_('Produk', it.produk_id);
        const stokLamaV = Number(v.stok || 0);
        const hppV = Number(v.hpp || 0);
        const stokBaruV = Math.max(0, Math.round((stokLamaV - qtyDasar) * 1000) / 1000);

        perbaruiVarianList.push({ id: v.id, data: { stok: stokBaruV } });

        const stokLamaP = Number(p.stok || 0);
        const stokBaruP = Math.max(0, Math.round((stokLamaP - qtyDasar) * 1000) / 1000);
        perbaruiProdukList.push({ id: p.id, data: { stok: stokBaruP } });

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: it.varian_id,
          tipe: 'retur_beli',
          qty: -qtyDasar,
          saldo: stokBaruV,
          hpp: hppV,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur pembelian ' + retur.no_retur + ': ' + retur.alasan
        });
      } else {
        const p = cariById_('Produk', it.produk_id);
        const stokLama = Number(p.stok || 0);
        const hppP = Number(p.hpp || 0);
        const stokBaru = Math.max(0, Math.round((stokLama - qtyDasar) * 1000) / 1000);

        perbaruiProdukList.push({ id: p.id, data: { stok: stokBaru } });

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: '',
          tipe: 'retur_beli',
          qty: -qtyDasar,
          saldo: stokBaru,
          hpp: hppP,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur pembelian ' + retur.no_retur + ': ' + retur.alasan
        });
      }
    }
  });

  if (perbaruiProdukList.length > 0) ubahBaris_('Produk', perbaruiProdukList, ctx.user.id);
  if (perbaruiVarianList.length > 0) ubahBaris_('Varian', perbaruiVarianList, ctx.user.id);
  if (rowsKartuStok.length > 0) tambahBaris_('Kartu_Stok', rowsKartuStok, ctx.user.id);

  // 3. Efek Finansial & Piutang/Hutang
  if (tipe === 'jual') {
    // Kurangi poin & total belanja member jika ada
    if (retur.pihak_id) {
      const pel = cariById_('Pelanggan', retur.pihak_id);
      if (pel && pel.tipe === 'member') {
        const pengaturan = ambilPengaturan_();
        let poinPotong = 0;
        if (pengaturan.poin_per_rupiah > 0) {
          let pengali = 1;
          (pengaturan.level_member || []).forEach(function (l) { if (l.nama === pel.level) pengali = Number(l.pengali) || 1; });
          poinPotong = Math.floor((Number(retur.total) / pengaturan.poin_per_rupiah) * pengali);
        }

        const poinLama = Number(pel.poin || 0);
        const poinBaru = Math.max(0, poinLama - poinPotong);
        const belanjaLama = Number(pel.total_belanja || 0);
        const belanjaBaru = Math.max(0, belanjaLama - Number(retur.total));

        ubahBaris_('Pelanggan', [{
          id: pel.id,
          data: { poin: poinBaru, total_belanja: belanjaBaru }
        }], ctx.user.id);

        if (poinPotong > 0) {
          tambahBaris_('Poin_Log', [{
            pelanggan_id: pel.id,
            jumlah: -poinPotong,
            jenis: 'retur',
            ref_id: retur.no_retur,
            saldo: poinBaru
          }], ctx.user.id);
        }
      }
    }

    // Refund: potong piutang jika ada
    if (retur.metode_refund === 'potong_piutang') {
      const pt = bacaSemua_('Piutang').filter(function (p) { return p.penjualan_id === retur.ref_id && !p.deleted && p.status !== 'lunas'; })[0];
      if (pt) {
        const sisaBaru = Math.max(0, (Number(pt.sisa) || 0) - Number(retur.total));
        ubahBaris_('Piutang', [{
          id: pt.id,
          data: {
            sisa: sisaBaru,
            status: sisaBaru === 0 ? 'lunas' : 'sebagian'
          }
        }], ctx.user.id);
      }
    }
  } else {
    // Retur Beli: potong hutang jika metode_refund === 'potong_hutang'
    if (retur.metode_refund === 'potong_hutang') {
      const ht = bacaSemua_('Hutang').filter(function (h) { return h.pembelian_id === retur.ref_id && !h.deleted && h.status !== 'lunas'; })[0];
      if (ht) {
        const sisaBaru = Math.max(0, (Number(ht.sisa) || 0) - Number(retur.total));
        ubahBaris_('Hutang', [{
          id: ht.id,
          data: {
            sisa: sisaBaru,
            status: sisaBaru === 0 ? 'lunas' : 'sebagian'
          }
        }], ctx.user.id);
      }
    }
  }

  // 4. Catat Audit Log
  catatAudit_(ctx.user.id, 'retur_approve', 'RETUR', retur.no_retur, {
    tipe: tipe,
    total: retur.total,
    metode_refund: retur.metode_refund
  });

  cacheHapus_('produk');
}

/* ========================================================================== */
/* 9.5 FASE 5: PELANGGAN, MEMBER, KATALOG HADIAH, & PENUKARAN POIN            */
/* ========================================================================== */

/** pelanggan.detail — Rincian pelanggan, piutang aktif, riwayat transaksi & mutasi poin. */
function aksiPelangganDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID pelanggan wajib diberikan.');

  const pel = cariById_('Pelanggan', p.id);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');

  // Ambil saldo piutang aktif
  const semuaPiutang = bacaSemua_('Piutang');
  let piutangBerjalan = 0;
  const daftarPiutang = [];
  semuaPiutang.forEach(function (pt) {
    if (pt.pelanggan_id === pel.id && !pt.deleted) {
      if (pt.status !== 'lunas') piutangBerjalan += (Number(pt.sisa) || 0);
      daftarPiutang.push(pt);
    }
  });

  const limitKredit = Number(pel.limit_kredit) || 0;
  const sisaLimit = Math.max(0, limitKredit - piutangBerjalan);

  // Riwayat Penjualan (15 transaksi terakhir)
  const semuaPenjualan = bacaSemua_('Penjualan');
  const riwayatPenjualan = semuaPenjualan
    .filter(function (pj) { return pj.pelanggan_id === pel.id && !pj.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .slice(0, 15);

  // Riwayat Mutasi Poin (Poin_Log)
  const semuaPoin = bacaSemua_('Poin_Log');
  const riwayatPoin = semuaPoin
    .filter(function (pl) { return pl.pelanggan_id === pel.id && !pl.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .slice(0, 20);

  // Riwayat Penukaran Hadiah
  const semuaTukar = bacaSemua_('Penukaran_Hadiah');
  const semuaHadiah = bacaSemua_('Hadiah');
  const hadiahPeta = {};
  semuaHadiah.forEach(function (h) { hadiahPeta[h.id] = h.nama; });

  const riwayatPenukaran = semuaTukar
    .filter(function (tk) { return tk.pelanggan_id === pel.id && !tk.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .map(function (tk) {
      const copy = Object.assign({}, tk);
      copy.nama_hadiah = hadiahPeta[tk.hadiah_id] || 'Hadiah';
      return copy;
    });

  return {
    pelanggan: pel,
    piutang_berjalan: piutangBerjalan,
    sisa_limit: sisaLimit,
    daftar_piutang: daftarPiutang,
    riwayat_penjualan: riwayatPenjualan,
    riwayat_poin: riwayatPoin,
    riwayat_penukaran: riwayatPenukaran
  };
}

/** pelanggan.create — Tambah pelanggan atau member baru. */
function aksiPelangganCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Pelanggan', { min: 2, maks: 100 });
  const tipe = p.tipe === 'member' ? 'member' : 'umum';
  const hp = String(p.hp || '').trim();

  if (tipe === 'member' && !hp) {
    gagal_(KODE.VALIDATION, 'Nomor HP wajib diisi untuk pelanggan berstatus Member.');
  }

  const semuaPelanggan = bacaSemua_('Pelanggan');

  // Validasi keunikan nomor HP untuk member aktif
  if (tipe === 'member' && hp) {
    const hpSudahAda = semuaPelanggan.some(function (pel) {
      return !pel.deleted && pel.tipe === 'member' && pel.hp === hp;
    });
    if (hpSudahAda) {
      gagal_(KODE.CONFLICT, 'Nomor HP "' + hp + '" sudah terdaftar untuk member lain.');
    }
  }

  // Kode Member: jika tidak diberikan, auto-generate via Counter MBR
  let kode = String(p.kode || '').trim().toUpperCase();
  if (tipe === 'member' && !kode) {
    kode = denganKunci_(function () {
      return nomorBerikut_('MBR');
    });
  } else if (!kode) {
    kode = 'PLG-' + Date.now().toString(36).toUpperCase();
  }

  const limitKredit = V_.nonNegatif(p.limit_kredit, 'Limit Kredit') || 0;
  const tempoHari = V_.nonNegatif(p.tempo_hari, 'Tempo Hari') || 30;
  const level = V_.teks(p.level, 'Level Member', { maks: 30 }) || 'Reguler';

  const barisBaru = {
    kode: kode,
    nama: nama,
    hp: hp,
    alamat: String(p.alamat || '').trim(),
    tipe: tipe,
    level: level,
    limit_kredit: limitKredit,
    tempo_hari: tempoHari,
    poin: 0,
    total_belanja: 0,
    aktif: p.aktif !== false
  };

  const tersimpan = tambahBaris_('Pelanggan', [barisBaru], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'pelanggan_create', 'PELANGGAN', tersimpan.id, {
    kode: kode,
    nama: nama,
    tipe: tipe
  });

  return {
    pesan: 'Pelanggan ' + nama + ' berhasil ditambahkan.',
    pelanggan: tersimpan
  };
}

/** pelanggan.update — Perbarui data pelanggan/member. */
function aksiPelangganUpdate_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID pelanggan wajib diberikan.');

  const pel = cariById_('Pelanggan', p.id);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');

  const isKasir = ctx.user.role === ROLE.KASIR;
  const dataUbah = {};

  if (p.nama !== undefined) dataUbah.nama = V_.teks(p.nama, 'Nama Pelanggan', { min: 2, maks: 100 });
  if (p.hp !== undefined) {
    const hpBaru = String(p.hp || '').trim();
    if (pel.tipe === 'member' && !hpBaru) {
      gagal_(KODE.VALIDATION, 'Nomor HP tidak boleh dikosongkan untuk member.');
    }
    if (pel.tipe === 'member' && hpBaru && hpBaru !== pel.hp) {
      const semuaPelanggan = bacaSemua_('Pelanggan');
      const duplikat = semuaPelanggan.some(function (x) {
        return x.id !== pel.id && !x.deleted && x.tipe === 'member' && x.hp === hpBaru;
      });
      if (duplikat) gagal_(KODE.CONFLICT, 'Nomor HP "' + hpBaru + '" sudah digunakan oleh member lain.');
    }
    dataUbah.hp = hpBaru;
  }
  if (p.alamat !== undefined) dataUbah.alamat = String(p.alamat || '').trim();
  if (p.aktif !== undefined) dataUbah.aktif = Boolean(p.aktif);

  // Field finansial & level hanya boleh diubah oleh Owner & Admin
  if (!isKasir) {
    if (p.tipe !== undefined) dataUbah.tipe = p.tipe === 'member' ? 'member' : 'umum';
    if (p.level !== undefined) dataUbah.level = V_.teks(p.level, 'Level', { maks: 30 }) || 'Reguler';
    if (p.limit_kredit !== undefined) dataUbah.limit_kredit = V_.nonNegatif(p.limit_kredit, 'Limit Kredit');
    if (p.tempo_hari !== undefined) dataUbah.tempo_hari = V_.nonNegatif(p.tempo_hari, 'Tempo Hari');
    if (p.kode !== undefined && p.kode) dataUbah.kode = String(p.kode).trim().toUpperCase();
  }

  ubahBaris_('Pelanggan', [{ id: pel.id, data: dataUbah }], ctx.user.id);

  catatAudit_(ctx.user.id, 'pelanggan_update', 'PELANGGAN', pel.id, dataUbah);

  return {
    pesan: 'Data pelanggan berhasil diperbarui.',
    id: pel.id
  };
}

/** pelanggan.delete — Hapus pelanggan (soft-delete). Dicegah jika masih ada piutang aktif. */
function aksiPelangganDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID pelanggan wajib diberikan.');

  const pel = cariById_('Pelanggan', p.id);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');

  // Cek piutang berjalan aktif (Aturan Bisnis)
  const semuaPiutang = bacaSemua_('Piutang');
  const piutangAktif = semuaPiutang.filter(function (pt) {
    return pt.pelanggan_id === pel.id && !pt.deleted && pt.status !== 'lunas';
  });

  if (piutangAktif.length > 0) {
    let totalSisa = 0;
    piutangAktif.forEach(function (pt) { totalSisa += (Number(pt.sisa) || 0); });
    gagal_(KODE.CONFLICT, 'Pelanggan ' + pel.nama + ' tidak dapat dihapus karena masih memiliki saldo piutang aktif sebesar Rp ' + totalSisa.toLocaleString('id-ID') + '. Selesaikan piutang terlebih dahulu.');
  }

  hapusLunak_('Pelanggan', pel.id, ctx.user.id);

  catatAudit_(ctx.user.id, 'pelanggan_delete', 'PELANGGAN', pel.id, { nama: pel.nama, kode: pel.kode });

  return {
    pesan: 'Pelanggan ' + pel.nama + ' berhasil dihapus.',
    id: pel.id
  };
}

/** hadiah.list — Katalog hadiah poin loyalitas. */
function aksiHadiahList_(ctx) {
  const p = ctx.payload || {};
  const semuaHadiah = bacaSemua_('Hadiah');
  let data = semuaHadiah.filter(function (h) { return !h.deleted; });

  if (p.aktif_saja !== false) {
    data = data.filter(function (h) { return h.aktif; });
  }

  const q = String(p.cari || p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (h) {
      return String(h.nama || '').toLowerCase().indexOf(q) !== -1 ||
             String(h.deskripsi || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) { return Number(a.poin_dibutuhkan || 0) - Number(b.poin_dibutuhkan || 0); });

  return { items: data, total: data.length };
}

/** hadiah.create — Tambah item hadiah penukaran poin (Owner & Admin). */
function aksiHadiahCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Hadiah', { min: 2, maks: 100 });
  const poin = V_.positif(p.poin_dibutuhkan, 'Poin Dibutuhkan');
  const stok = V_.nonNegatif(p.stok, 'Stok Hadiah');
  const deskripsi = V_.teks(p.deskripsi, 'Deskripsi Hadiah', { maks: 300 }) || '';

  const baris = {
    nama: nama,
    deskripsi: deskripsi,
    poin_dibutuhkan: poin,
    stok: stok,
    aktif: p.aktif !== false
  };

  const tersimpan = tambahBaris_('Hadiah', [baris], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'hadiah_create', 'HADIAH', tersimpan.id, { nama: nama, poin: poin, stok: stok });

  return {
    pesan: 'Hadiah ' + nama + ' berhasil ditambahkan.',
    hadiah: tersimpan
  };
}

/** hadiah.update — Ubah data hadiah (Owner & Admin). */
function aksiHadiahUpdate_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hadiah wajib diberikan.');

  const h = cariById_('Hadiah', p.id);
  if (!h || h.deleted) gagal_(KODE.NOT_FOUND, 'Data hadiah tidak ditemukan.');

  const dataUbah = {};
  if (p.nama !== undefined) dataUbah.nama = V_.teks(p.nama, 'Nama Hadiah', { min: 2, maks: 100 });
  if (p.deskripsi !== undefined) dataUbah.deskripsi = String(p.deskripsi || '').trim();
  if (p.poin_dibutuhkan !== undefined) dataUbah.poin_dibutuhkan = V_.positif(p.poin_dibutuhkan, 'Poin Dibutuhkan');
  if (p.stok !== undefined) dataUbah.stok = V_.nonNegatif(p.stok, 'Stok Hadiah');
  if (p.aktif !== undefined) dataUbah.aktif = Boolean(p.aktif);

  ubahBaris_('Hadiah', [{ id: h.id, data: dataUbah }], ctx.user.id);

  catatAudit_(ctx.user.id, 'hadiah_update', 'HADIAH', h.id, dataUbah);

  return {
    pesan: 'Data hadiah berhasil diperbarui.',
    id: h.id
  };
}

/** hadiah.delete — Soft-delete hadiah (Owner & Admin). */
function aksiHadiahDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hadiah wajib diberikan.');

  const h = cariById_('Hadiah', p.id);
  if (!h || h.deleted) gagal_(KODE.NOT_FOUND, 'Data hadiah tidak ditemukan.');

  hapusLunak_('Hadiah', h.id, ctx.user.id);

  catatAudit_(ctx.user.id, 'hadiah_delete', 'HADIAH', h.id, { nama: h.nama });

  return {
    pesan: 'Hadiah ' + h.nama + ' berhasil dihapus.',
    id: h.id
  };
}

/** member.tukarPoin — Eksekusi penukaran poin member dengan hadiah fisik toko. */
function aksiMemberTukarPoin_(ctx) {
  const p = ctx.payload || {};
  if (!p.pelanggan_id) gagal_(KODE.VALIDATION, 'Pelanggan member wajib dipilih.');
  if (!p.hadiah_id) gagal_(KODE.VALIDATION, 'Hadiah yang akan ditukar wajib dipilih.');

  const qty = Math.max(1, parseInt(p.qty, 10) || 1);

  return denganKunci_(function () {
    const pel = cariById_('Pelanggan', p.pelanggan_id);
    if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Member tidak ditemukan.');
    if (pel.tipe !== 'member') gagal_(KODE.VALIDATION, 'Penukaran poin hanya berlaku untuk pelanggan Member.');
    if (!pel.aktif) gagal_(KODE.VALIDATION, 'Akun member ini sedang tidak aktif.');

    const hadiah = cariById_('Hadiah', p.hadiah_id);
    if (!hadiah || hadiah.deleted) gagal_(KODE.NOT_FOUND, 'Hadiah tidak ditemukan.');
    if (!hadiah.aktif) gagal_(KODE.VALIDATION, 'Hadiah "' + hadiah.nama + '" saat ini tidak aktif.');

    const stokTersedia = Number(hadiah.stok || 0);
    if (stokTersedia < qty) {
      gagal_(KODE.CONFLICT, 'Stok hadiah "' + hadiah.nama + '" tidak mencukupi (tersedia: ' + stokTersedia + ', diminta: ' + qty + ').');
    }

    const poinPerUnit = Number(hadiah.poin_dibutuhkan || 0);
    const totalPoinButuh = poinPerUnit * qty;
    const saldoPoinMember = Number(pel.poin || 0);

    if (saldoPoinMember < totalPoinButuh) {
      gagal_(KODE.VALIDATION, 'Saldo poin member (' + saldoPoinMember + ' poin) tidak mencukupi untuk menukar ' + qty + ' ' + hadiah.nama + ' (butuh ' + totalPoinButuh + ' poin).');
    }

    const noTukar = nomorBerikut_('TK');
    const poinBaru = saldoPoinMember - totalPoinButuh;
    const stokBaru = stokTersedia - qty;

    // 1. Kurangi stok hadiah
    ubahBaris_('Hadiah', [{
      id: hadiah.id,
      data: { stok: stokBaru }
    }], ctx.user.id);

    // 2. Kurangi saldo poin member
    ubahBaris_('Pelanggan', [{
      id: pel.id,
      data: { poin: poinBaru }
    }], ctx.user.id);

    // 3. Catat di Penukaran_Hadiah
    const penukaranRecord = {
      no_tukar: noTukar,
      pelanggan_id: pel.id,
      hadiah_id: hadiah.id,
      qty: qty,
      poin: totalPoinButuh,
      catatan: String(p.catatan || '').trim()
    };
    tambahBaris_('Penukaran_Hadiah', [penukaranRecord], ctx.user.id);

    // 4. Catat di Poin_Log
    tambahBaris_('Poin_Log', [{
      pelanggan_id: pel.id,
      jumlah: -totalPoinButuh,
      jenis: 'tukar',
      ref_id: noTukar,
      saldo: poinBaru
    }], ctx.user.id);

    // 5. Catat Audit Log
    catatAudit_(ctx.user.id, 'member_tukar_poin', 'LOYALITAS', noTukar, {
      member: pel.nama,
      hadiah: hadiah.nama,
      qty: qty,
      poin_tukar: totalPoinButuh,
      sisa_poin: poinBaru
    });

    return {
      pesan: 'Penukaran poin berhasil diproses. Nomor bukti: ' + noTukar,
      no_tukar: noTukar,
      hadiah_nama: hadiah.nama,
      qty: qty,
      poin_ditukar: totalPoinButuh,
      sisa_poin: poinBaru,
      sisa_stok: stokBaru
    };
  });
}

/** member.riwayatPoin — Riwayat transaksi penambahan/pengurangan poin member. */
function aksiMemberRiwayatPoin_(ctx) {
  const p = ctx.payload || {};
  if (!p.pelanggan_id) gagal_(KODE.VALIDATION, 'ID pelanggan member wajib diberikan.');

  const semuaLog = bacaSemua_('Poin_Log');
  const data = semuaLog
    .filter(function (l) { return l.pelanggan_id === p.pelanggan_id && !l.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/* ========================================================================== */
/* 9.6 FASE 6: DASHBOARD & LAPORAN USAHA                                      */
/* ========================================================================== */

/** Helper: Konversi atau hitung rentang tanggal YYYY-MM-DD secara konsisten. */
function hitungRentangTanggal_(dari, sampai, periode) {
  const sekarang = new Date();
  const formatTgl = function (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const t = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + t;
  };

  const hariIni = formatTgl(sekarang);
  if (dari && sampai) {
    return { dari: String(dari).substring(0, 10), sampai: String(sampai).substring(0, 10) };
  }

  if (periode === 'hari_ini') {
    return { dari: hariIni, sampai: hariIni };
  } else if (periode === '7_hari') {
    const d7 = new Date(sekarang.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { dari: formatTgl(d7), sampai: hariIni };
  } else if (periode === 'bulan_ini') {
    const awalBulan = new Date(sekarang.getFullYear(), sekarang.getMonth(), 1);
    return { dari: formatTgl(awalBulan), sampai: hariIni };
  } else if (periode === 'tahun_ini') {
    const awalTahun = new Date(sekarang.getFullYear(), 0, 1);
    return { dari: formatTgl(awalTahun), sampai: hariIni };
  } else if (periode === 'semua') {
    return { dari: '2000-01-01', sampai: hariIni };
  }

  // Standar: 30 hari terakhir
  const d30 = new Date(sekarang.getTime() - 29 * 24 * 60 * 60 * 1000);
  return {
    dari: dari ? String(dari).substring(0, 10) : formatTgl(d30),
    sampai: sampai ? String(sampai).substring(0, 10) : hariIni
  };
}

/**
 * laporan.dashboard — Data komprehensif dashboard eksekutif:
 * Omset penjualan, pembelian, piutang/hutang berjalan, stok kritis,
 * top produk, top member, breakdown metode bayar, dan grafik tren harian.
 * Catatan Hak Akses: Laba kotor, margin, dan total nilai aset persediaan HANYA dikirimkan jika role === 'owner'.
 */
function aksiLaporanDashboard_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  // 1. Data Penjualan Final dalam Rentang Tanggal
  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanFinal = semuaPenjualan.filter(function (j) {
    if (j.deleted || j.status !== 'final') return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  const penjualanIdSet = {};
  let totalPenjualan = 0;
  let totalDiskonPenjualan = 0;
  let totalPajakPenjualan = 0;
  let totalSubtotalPenjualan = 0;

  penjualanFinal.forEach(function (j) {
    penjualanIdSet[j.id] = true;
    totalPenjualan += Number(j.total) || 0;
    totalDiskonPenjualan += Number(j.diskon) || 0;
    totalPajakPenjualan += Number(j.pajak) || 0;
    totalSubtotalPenjualan += Number(j.subtotal) || 0;
  });

  // 2. Data Penjualan Item (Item Terjual, HPP COGS, Produk Terlaris)
  const semuaJualItem = bacaSemua_('Penjualan_Item');
  let totalItemTerjual = 0;
  let totalHpp = 0;
  const produkAgg = {};

  semuaJualItem.forEach(function (it) {
    if (it.deleted || !penjualanIdSet[it.penjualan_id]) return;
    const qty = Number(it.qty_dasar) || Number(it.qty) || 0;
    const subtotal = Number(it.subtotal) || 0;
    const hpp = Number(it.hpp) || 0;

    totalItemTerjual += qty;
    totalHpp += (hpp * qty);

    const key = it.produk_id || it.nama;
    if (!produkAgg[key]) {
      produkAgg[key] = {
        produk_id: it.produk_id,
        nama: it.nama,
        satuan: it.satuan || 'Pcs',
        qty_terjual: 0,
        total_omset: 0
      };
    }
    produkAgg[key].qty_terjual += qty;
    produkAgg[key].total_omset += subtotal;
  });

  const produkTerlaris = Object.values(produkAgg)
    .sort(function (a, b) { return b.qty_terjual - a.qty_terjual; })
    .slice(0, 10);

  // 3. Data Pembelian dalam Rentang Tanggal
  const semuaPembelian = bacaSemua_('Pembelian');
  const pembelianRentang = semuaPembelian.filter(function (pb) {
    if (pb.deleted || pb.status === 'batal') return false;
    const tgl = String(pb.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  let totalPembelian = 0;
  let totalBeliBayar = 0;
  pembelianRentang.forEach(function (pb) {
    totalPembelian += Number(pb.total) || 0;
    totalBeliBayar += Number(pb.bayar) || 0;
  });

  // 4. Data Hutang & Piutang Aktif Berjalan
  const semuaPiutang = bacaSemua_('Piutang');
  let totalPiutangAktif = 0;
  let countPiutangAktif = 0;
  semuaPiutang.forEach(function (pi) {
    if (!pi.deleted && pi.status !== 'lunas') {
      totalPiutangAktif += Number(pi.sisa) || 0;
      countPiutangAktif++;
    }
  });

  const semuaHutang = bacaSemua_('Hutang');
  let totalHutangAktif = 0;
  let countHutangAktif = 0;
  semuaHutang.forEach(function (h) {
    if (!h.deleted && h.status !== 'lunas') {
      totalHutangAktif += Number(h.sisa) || 0;
      countHutangAktif++;
    }
  });

  // 5. Data Stok Kritis & Estimasi Aset Persediaan
  const semuaProduk = bacaSemua_('Produk');
  const semuaVarian = bacaSemua_('Varian');
  const varianByProduk = {};
  semuaVarian.forEach(function (v) {
    if (v.deleted || !v.aktif) return;
    if (!varianByProduk[v.produk_id]) varianByProduk[v.produk_id] = [];
    varianByProduk[v.produk_id].push(v);
  });

  const stokKritis = [];
  let totalAsetStok = 0;

  semuaProduk.forEach(function (pdk) {
    if (pdk.deleted || !pdk.aktif) return;

    if (pdk.punya_varian && varianByProduk[pdk.id] && varianByProduk[pdk.id].length > 0) {
      varianByProduk[pdk.id].forEach(function (v) {
        const s = Number(v.stok) || 0;
        const sMin = Number(v.stok_min) || 0;
        const h = Number(v.hpp) || 0;
        totalAsetStok += (s * h);

        if (s <= sMin) {
          stokKritis.push({
            id: v.id,
            produk_id: pdk.id,
            nama: pdk.nama + ' (' + v.nama_varian + ')',
            sku: v.sku || pdk.sku || '-',
            satuan: pdk.satuan_dasar || 'Pcs',
            stok: s,
            stok_min: sMin,
            status: s <= 0 ? 'habis' : 'kritis'
          });
        }
      });
    } else {
      const s = Number(pdk.stok) || 0;
      const sMin = Number(pdk.stok_min) || 0;
      const h = Number(pdk.hpp) || 0;
      totalAsetStok += (s * h);

      if (s <= sMin) {
        stokKritis.push({
          id: pdk.id,
          produk_id: pdk.id,
          nama: pdk.nama,
          sku: pdk.sku || '-',
          satuan: pdk.satuan_dasar || 'Pcs',
          stok: s,
          stok_min: sMin,
          status: s <= 0 ? 'habis' : 'kritis'
        });
      }
    }
  });

  stokKritis.sort(function (a, b) { return a.stok - b.stok; });

  // 6. Data Pelanggan Terbaik (Top Customers)
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelangganMap = {};
  semuaPelanggan.forEach(function (pel) {
    pelangganMap[pel.id] = { nama: pel.nama, kode: pel.kode, tipe: pel.tipe, level: pel.level };
  });

  const memberAgg = {};
  penjualanFinal.forEach(function (j) {
    if (!j.pelanggan_id) return;
    const info = pelangganMap[j.pelanggan_id] || { nama: 'Pelanggan Umum', kode: '-', tipe: 'umum', level: 'reguler' };
    if (!memberAgg[j.pelanggan_id]) {
      memberAgg[j.pelanggan_id] = {
        pelanggan_id: j.pelanggan_id,
        nama: info.nama,
        kode: info.kode,
        tipe: info.tipe,
        level: info.level,
        total_transaksi: 0,
        total_belanja: 0
      };
    }
    memberAgg[j.pelanggan_id].total_transaksi += 1;
    memberAgg[j.pelanggan_id].total_belanja += (Number(j.total) || 0);
  });

  const pelangganTerbaik = Object.values(memberAgg)
    .sort(function (a, b) { return b.total_belanja - a.total_belanja; })
    .slice(0, 10);

  // 7. Komposisi Metode Pembayaran
  const semuaJualBayar = bacaSemua_('Penjualan_Bayar');
  const metodeBayarAgg = {
    tunai: { total: 0, count: 0 },
    transfer: { total: 0, count: 0 },
    qris: { total: 0, count: 0 },
    tempo: { total: 0, count: 0 }
  };

  semuaJualBayar.forEach(function (byr) {
    if (byr.deleted || !penjualanIdSet[byr.penjualan_id]) return;
    const m = String(byr.metode || 'tunai').toLowerCase();
    const jml = Number(byr.jumlah) || 0;
    if (metodeBayarAgg[m]) {
      metodeBayarAgg[m].total += jml;
      metodeBayarAgg[m].count += 1;
    }
  });

  // 8. Grafik Tren Harian
  const trenPeta = {};
  penjualanFinal.forEach(function (j) {
    const tgl = String(j.tanggal || '').substring(0, 10);
    if (!trenPeta[tgl]) {
      trenPeta[tgl] = { tanggal: tgl, penjualan: 0, pembelian: 0, transaksi: 0 };
    }
    trenPeta[tgl].penjualan += (Number(j.total) || 0);
    trenPeta[tgl].transaksi += 1;
  });

  pembelianRentang.forEach(function (pb) {
    const tgl = String(pb.tanggal || '').substring(0, 10);
    if (!trenPeta[tgl]) {
      trenPeta[tgl] = { tanggal: tgl, penjualan: 0, pembelian: 0, transaksi: 0 };
    }
    trenPeta[tgl].pembelian += (Number(pb.total) || 0);
  });

  const tren = Object.values(trenPeta).sort(function (a, b) {
    return a.tanggal.localeCompare(b.tanggal);
  });

  // Hitung Laba Kotor (Khusus Owner)
  const labaKotor = isOwner ? Math.round(totalPenjualan - totalHpp) : null;
  const marginPersen = isOwner ? (totalPenjualan > 0 ? Math.round((labaKotor / totalPenjualan) * 10000) / 100 : 0) : null;

  return {
    rentang: rentang,
    ringkasan: {
      total_penjualan: totalPenjualan,
      subtotal_penjualan: totalSubtotalPenjualan,
      diskon_penjualan: totalDiskonPenjualan,
      pajak_penjualan: totalPajakPenjualan,
      total_transaksi: penjualanFinal.length,
      total_item_terjual: totalItemTerjual,
      total_pembelian: totalPembelian,
      total_faktur_beli: pembelianRentang.length,
      total_piutang_aktif: totalPiutangAktif,
      count_piutang_aktif: countPiutangAktif,
      total_hutang_aktif: totalHutangAktif,
      count_hutang_aktif: countHutangAktif,
      total_nilai_aset_stok: isOwner ? Math.round(totalAsetStok) : null,
      laba_kotor: labaKotor,
      margin_persen: marginPersen
    },
    produk_terlaris: produkTerlaris,
    pelanggan_terbaik: pelangganTerbaik,
    stok_kritis: stokKritis.slice(0, 15),
    metode_bayar: metodeBayarAgg,
    tren: tren
  };
}

/**
 * laporan.penjualan — Rincian laporan transaksi penjualan dengan filter lengkap.
 */
function aksiLaporanPenjualan_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaUsers = bacaSemua_('Users');
  const userMap = {};
  semuaUsers.forEach(function (u) { userMap[u.id] = u.nama || u.username; });

  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelMap = {};
  semuaPelanggan.forEach(function (pel) { pelMap[pel.id] = pel.nama; });

  // Map HPP snapshot item jika Owner
  const semuaItems = isOwner ? bacaSemua_('Penjualan_Item') : [];
  const hppByJual = {};
  const itemCountByJual = {};
  if (isOwner) {
    semuaItems.forEach(function (it) {
      if (it.deleted) return;
      const h = Number(it.hpp) || 0;
      const q = Number(it.qty_dasar) || Number(it.qty) || 0;
      hppByJual[it.penjualan_id] = (hppByJual[it.penjualan_id] || 0) + (h * q);
      itemCountByJual[it.penjualan_id] = (itemCountByJual[it.penjualan_id] || 0) + 1;
    });
  }

  let filtered = semuaPenjualan.filter(function (j) {
    if (j.deleted) return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return false;

    if (p.status && j.status !== p.status) return false;
    if (p.kasir_id && j.kasir_id !== p.kasir_id) return false;
    if (p.pelanggan_id && j.pelanggan_id !== p.pelanggan_id) return false;
    if (p.metode_bayar && j.metode_bayar !== p.metode_bayar) return false;
    if (p.status_bayar && j.status_bayar !== p.status_bayar) return false;

    return true;
  });

  // Urutkan transaksi terbaru lebih dahulu
  filtered.sort(function (a, b) {
    return new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0);
  });

  let totalOmset = 0;
  let totalDiskon = 0;
  let totalPajak = 0;
  let totalLaba = 0;

  const items = filtered.map(function (j) {
    const total = Number(j.total) || 0;
    const diskon = Number(j.diskon) || 0;
    const pajak = Number(j.pajak) || 0;

    totalOmset += total;
    totalDiskon += diskon;
    totalPajak += pajak;

    const row = {
      id: j.id,
      no_nota: j.no_nota,
      tanggal: j.tanggal,
      kasir_id: j.kasir_id,
      kasir_nama: userMap[j.kasir_id] || 'Kasir',
      pelanggan_id: j.pelanggan_id,
      pelanggan_nama: j.pelanggan_id ? (pelMap[j.pelanggan_id] || 'Pelanggan Umum') : 'Pelanggan Umum',
      subtotal: Number(j.subtotal) || 0,
      diskon: diskon,
      pajak: pajak,
      pembulatan: Number(j.pembulatan) || 0,
      total: total,
      bayar: Number(j.bayar) || 0,
      kembalian: Number(j.kembalian) || 0,
      metode_bayar: j.metode_bayar,
      status_bayar: j.status_bayar,
      pengiriman: j.pengiriman,
      status_antar: j.status_antar,
      status: j.status
    };

    if (isOwner) {
      const hppTot = hppByJual[j.id] || 0;
      const laba = Math.round(total - hppTot);
      row.laba_kotor = laba;
      row.hpp_total = hppTot;
      totalLaba += laba;
    }

    return row;
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    rentang: rentang,
    ringkasan: {
      total_omset: totalOmset,
      total_diskon: totalDiskon,
      total_pajak: totalPajak,
      total_transaksi: filtered.length,
      total_laba: isOwner ? totalLaba : null
    },
    items: items.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
  };
}

/**
 * laporan.pembelian — Rincian laporan transaksi pembelian barang masuk ke supplier.
 */
function aksiLaporanPembelian_(ctx) {
  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  const semuaPembelian = bacaSemua_('Pembelian');
  const semuaSupplier = bacaSemua_('Supplier');
  const supMap = {};
  semuaSupplier.forEach(function (s) { supMap[s.id] = s.nama; });

  let filtered = semuaPembelian.filter(function (pb) {
    if (pb.deleted || pb.status === 'batal') return false;
    const tgl = String(pb.tanggal || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return false;

    if (p.supplier_id && pb.supplier_id !== p.supplier_id) return false;
    if (p.status_bayar && pb.status_bayar !== p.status_bayar) return false;

    return true;
  });

  filtered.sort(function (a, b) {
    return new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0);
  });

  let totalBeli = 0;
  let totalDiskon = 0;
  let totalBayar = 0;
  let totalSisaHutang = 0;

  const items = filtered.map(function (pb) {
    const total = Number(pb.total) || 0;
    const diskon = Number(pb.diskon) || 0;
    const bayar = Number(pb.bayar) || 0;
    const sisa = Math.max(0, total - bayar);

    totalBeli += total;
    totalDiskon += diskon;
    totalBayar += bayar;
    totalSisaHutang += sisa;

    return {
      id: pb.id,
      no_faktur: pb.no_faktur,
      no_faktur_supplier: pb.no_faktur_supplier || '-',
      tanggal: pb.tanggal,
      supplier_id: pb.supplier_id,
      supplier_nama: supMap[pb.supplier_id] || 'Supplier Umum',
      subtotal: Number(pb.subtotal) || 0,
      diskon: diskon,
      total: total,
      bayar: bayar,
      status_bayar: pb.status_bayar,
      jatuh_tempo: pb.jatuh_tempo || '-',
      sisa_hutang: sisa,
      catatan: pb.catatan || ''
    };
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    rentang: rentang,
    ringkasan: {
      total_pembelian: totalBeli,
      total_diskon: totalDiskon,
      total_terbayar: totalBayar,
      total_sisa_hutang: totalSisaHutang,
      total_faktur: filtered.length
    },
    items: items.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
  };
}

/**
 * laporan.labaRugi — Laporan laba kotor, HPP (COGS), margin %, dan analisis per kategori produk.
 * Khusus role OWNER.
 */
function aksiLaporanLabaRugi_(ctx) {
  if (ctx.user.role !== ROLE.OWNER) {
    gagal_(KODE.FORBIDDEN, 'Laporan laba rugi hanya dapat diakses oleh Pemilik Toko (Owner).');
  }

  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanFinal = semuaPenjualan.filter(function (j) {
    if (j.deleted || j.status !== 'final') return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  const penjualanIdSet = {};
  let omsetKotor = 0;
  let totalDiskon = 0;
  let totalPajak = 0;
  let omsetBersih = 0;

  penjualanFinal.forEach(function (j) {
    penjualanIdSet[j.id] = true;
    omsetKotor += (Number(j.subtotal) || 0);
    totalDiskon += (Number(j.diskon) || 0);
    totalPajak += (Number(j.pajak) || 0);
    omsetBersih += (Number(j.total) || 0);
  });

  // HPP dari Penjualan_Item
  const semuaItems = bacaSemua_('Penjualan_Item');
  const semuaProduk = bacaSemua_('Produk');
  const semuaKategori = bacaSemua_('Kategori');

  const katMap = {};
  semuaKategori.forEach(function (k) { katMap[k.id] = k.nama; });

  const prodKatMap = {};
  semuaProduk.forEach(function (pdk) { prodKatMap[pdk.id] = pdk.kategori_id; });

  let totalHpp = 0;
  const katAgg = {};
  const itemMarginAgg = {};

  semuaItems.forEach(function (it) {
    if (it.deleted || !penjualanIdSet[it.penjualan_id]) return;
    const qty = Number(it.qty_dasar) || Number(it.qty) || 0;
    const subtotal = Number(it.subtotal) || 0;
    const hpp = Number(it.hpp) || 0;
    const hppItemTotal = hpp * qty;
    const labaItem = subtotal - hppItemTotal;

    totalHpp += hppItemTotal;

    // Per Kategori
    const katId = prodKatMap[it.produk_id] || 'tanpa_kategori';
    const katNama = katMap[katId] || 'Lain-lain / Umum';
    if (!katAgg[katId]) {
      katAgg[katId] = { kategori_id: katId, kategori: katNama, omset: 0, hpp: 0, laba: 0 };
    }
    katAgg[katId].omset += subtotal;
    katAgg[katId].hpp += hppItemTotal;
    katAgg[katId].laba += labaItem;

    // Per Item
    const key = it.produk_id || it.nama;
    if (!itemMarginAgg[key]) {
      itemMarginAgg[key] = { nama: it.nama, qty: 0, omset: 0, hpp: 0, laba: 0 };
    }
    itemMarginAgg[key].qty += qty;
    itemMarginAgg[key].omset += subtotal;
    itemMarginAgg[key].hpp += hppItemTotal;
    itemMarginAgg[key].laba += labaItem;
  });

  // Hitung Nilai Retur Penjualan dalam Rentang
  const semuaRetur = bacaSemua_('Retur');
  let totalReturJual = 0;
  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui') return false;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      totalReturJual += (Number(rt.total) || 0);
    }
  });

  const labaKotorKotor = Math.round(omsetBersih - totalHpp);
  const labaKotorBersih = Math.round(labaKotorKotor - totalReturJual);
  const marginPersen = omsetBersih > 0 ? Math.round((labaKotorBersih / omsetBersih) * 10000) / 100 : 0;

  // Format array kategori
  const kategoriList = Object.values(katAgg).map(function (k) {
    k.margin_persen = k.omset > 0 ? Math.round((k.laba / k.omset) * 10000) / 100 : 0;
    return k;
  }).sort(function (a, b) { return b.laba - a.laba; });

  // Format array produk (Top 10 Laba Tertinggi)
  const produkLabaTertinggi = Object.values(itemMarginAgg).map(function (it) {
    it.margin_persen = it.omset > 0 ? Math.round((it.laba / it.omset) * 10000) / 100 : 0;
    return it;
  }).sort(function (a, b) { return b.laba - a.laba; }).slice(0, 10);

  return {
    rentang: rentang,
    ringkasan: {
      omset_kotor: omsetKotor,
      total_diskon: totalDiskon,
      total_pajak: totalPajak,
      omset_bersih: omsetBersih,
      total_hpp: totalHpp,
      laba_kotor_sebelum_retur: labaKotorKotor,
      total_retur_penjualan: totalReturJual,
      laba_kotor_bersih: labaKotorBersih,
      margin_persen: marginPersen
    },
    analisis_kategori: kategoriList,
    produk_margin_teratas: produkLabaTertinggi
  };
}

/**
 * laporan.arusKas — Buku kas & laporan arus kas masuk-keluar toko.
 */
function aksiLaporanArusKas_(ctx) {
  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  // 1. Kas Masuk Penjualan Langsung
  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanIdSet = {};
  semuaPenjualan.forEach(function (j) {
    if (!j.deleted && j.status === 'final') {
      const tgl = String(j.tanggal || '').substring(0, 10);
      if (tgl >= rentang.dari && tgl <= rentang.sampai) {
        penjualanIdSet[j.id] = true;
      }
    }
  });

  const semuaJualBayar = bacaSemua_('Penjualan_Bayar');
  let masukJualTunai = 0;
  let masukJualTransfer = 0;
  let masukJualQris = 0;

  semuaJualBayar.forEach(function (byr) {
    if (byr.deleted || !penjualanIdSet[byr.penjualan_id]) return;
    const m = String(byr.metode || '').toLowerCase();
    const jml = Number(byr.jumlah) || 0;
    if (m === 'tunai') masukJualTunai += jml;
    else if (m === 'transfer') masukJualTransfer += jml;
    else if (m === 'qris') masukJualQris += jml;
  });

  // 2. Kas Masuk Cicilan / Pelunasan Piutang & Kas Keluar Pembayaran Supplier
  const semuaPembelian = bacaSemua_('Pembelian');
  const beliIdSet = {};
  semuaPembelian.forEach(function (pb) { beliIdSet[pb.id] = true; });

  const semuaPembayaran = bacaSemua_('Pembayaran');
  let masukPiutangTunai = 0;
  let masukPiutangTransfer = 0;
  let masukPiutangQris = 0;

  let keluarBeliTunai = 0;
  let keluarBeliTransfer = 0;
  let keluarHutangTunai = 0;
  let keluarHutangTransfer = 0;

  semuaPembayaran.forEach(function (byr) {
    if (byr.deleted) return;
    const tgl = String(byr.tanggal || byr.created_at || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return;

    const m = String(byr.metode || '').toLowerCase();
    const jml = Number(byr.jumlah) || 0;

    if (byr.tipe === 'piutang') {
      if (m === 'tunai') masukPiutangTunai += jml;
      else if (m === 'transfer') masukPiutangTransfer += jml;
      else if (m === 'qris') masukPiutangQris += jml;
      else masukPiutangTunai += jml;
    } else if (byr.tipe === 'hutang') {
      // Bedakan pembayaran awal faktur beli vs cicilan hutang lanjutan
      if (beliIdSet[byr.ref_id]) {
        if (m === 'transfer') keluarBeliTransfer += jml;
        else keluarBeliTunai += jml;
      } else {
        if (m === 'transfer') keluarHutangTransfer += jml;
        else keluarHutangTunai += jml;
      }
    }
  });

  // 3. Kas Keluar Refund Retur Penjualan Tunai
  const semuaRetur = bacaSemua_('Retur');
  let keluarRefundRetur = 0;
  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui') return;
    if (rt.metode_refund !== 'kas') return;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      keluarRefundRetur += (Number(rt.total) || 0);
    }
  });

  const totalMasukTunai = masukJualTunai + masukPiutangTunai;
  const totalMasukBank = masukJualTransfer + masukPiutangTransfer + masukJualQris + masukPiutangQris;
  const totalKasMasuk = totalMasukTunai + totalMasukBank;

  const totalKeluarTunai = keluarBeliTunai + keluarHutangTunai + keluarRefundRetur;
  const totalKeluarBank = keluarBeliTransfer + keluarHutangTransfer;
  const totalKasKeluar = totalKeluarTunai + totalKeluarBank;

  const arusKasBersih = totalKasMasuk - totalKasKeluar;
  const saldoTunaiKasir = totalMasukTunai - totalKeluarTunai;
  const saldoBankNonTunai = totalMasukBank - totalKeluarBank;

  return {
    rentang: rentang,
    ringkasan: {
      total_kas_masuk: totalKasMasuk,
      total_kas_keluar: totalKasKeluar,
      arus_kas_bersih: arusKasBersih,
      saldo_tunai_kasir: saldoTunaiKasir,
      saldo_bank_non_tunai: saldoBankNonTunai
    },
    rincian_masuk: {
      penjualan_tunai: masukJualTunai,
      penjualan_transfer: masukJualTransfer,
      penjualan_qris: masukJualQris,
      piutang_tunai: masukPiutangTunai,
      piutang_transfer: masukPiutangTransfer,
      piutang_qris: masukPiutangQris,
      subtotal_tunai: totalMasukTunai,
      subtotal_bank: totalMasukBank
    },
    rincian_keluar: {
      pembelian_tunai: keluarBeliTunai,
      pembelian_transfer: keluarBeliTransfer,
      hutang_tunai: keluarHutangTunai,
      hutang_transfer: keluarHutangTransfer,
      refund_retur_tunai: keluarRefundRetur,
      subtotal_tunai: totalKeluarTunai,
      subtotal_bank: totalKeluarBank
    }
  };
}

/**
 * laporan.stokValuasi — Laporan valuasi nilai persediaan stok dan status stok fisik.
 */
function aksiLaporanStokValuasi_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;

  const semuaProduk = bacaSemua_('Produk');
  const semuaVarian = bacaSemua_('Varian');
  const semuaKategori = bacaSemua_('Kategori');

  const katMap = {};
  semuaKategori.forEach(function (k) { katMap[k.id] = k.nama; });

  const varianByProduk = {};
  semuaVarian.forEach(function (v) {
    if (v.deleted || !v.aktif) return;
    if (!varianByProduk[v.produk_id]) varianByProduk[v.produk_id] = [];
    varianByProduk[v.produk_id].push(v);
  });

  const list = [];
  let totalUnitStok = 0;
  let totalAsetStok = 0;
  let countHabis = 0;
  let countKritis = 0;
  let countAman = 0;

  semuaProduk.forEach(function (pdk) {
    if (pdk.deleted || !pdk.aktif) return;
    const katNama = katMap[pdk.kategori_id] || 'Umum';

    if (pdk.punya_varian && varianByProduk[pdk.id] && varianByProduk[pdk.id].length > 0) {
      varianByProduk[pdk.id].forEach(function (v) {
        const s = Number(v.stok) || 0;
        const sMin = Number(v.stok_min) || 0;
        const h = Number(v.hpp) || 0;
        const nilai = s * h;
        totalUnitStok += s;
        totalAsetStok += nilai;

        let status = 'aman';
        if (s <= 0) { status = 'habis'; countHabis++; }
        else if (s <= sMin) { status = 'kritis'; countKritis++; }
        else { countAman++; }

        list.push({
          id: v.id,
          produk_id: pdk.id,
          sku: v.sku || pdk.sku || '-',
          barcode: v.barcode || pdk.barcode || '',
          nama: pdk.nama + ' (' + v.nama_varian + ')',
          kategori_id: pdk.kategori_id,
          kategori: katNama,
          satuan: pdk.satuan_dasar || 'Pcs',
          stok: s,
          stok_min: sMin,
          hpp: h,
          nilai_aset: nilai,
          status: status
        });
      });
    } else {
      const s = Number(pdk.stok) || 0;
      const sMin = Number(pdk.stok_min) || 0;
      const h = Number(pdk.hpp) || 0;
      const nilai = s * h;
      totalUnitStok += s;
      totalAsetStok += nilai;

      let status = 'aman';
      if (s <= 0) { status = 'habis'; countHabis++; }
      else if (s <= sMin) { status = 'kritis'; countKritis++; }
      else { countAman++; }

      list.push({
        id: pdk.id,
        produk_id: pdk.id,
        sku: pdk.sku || '-',
        barcode: pdk.barcode || '',
        nama: pdk.nama,
        kategori_id: pdk.kategori_id,
        kategori: katNama,
        satuan: pdk.satuan_dasar || 'Pcs',
        stok: s,
        stok_min: sMin,
        hpp: h,
        nilai_aset: nilai,
        status: status
      });
    }
  });

  let filtered = list;

  if (p.kategori_id) {
    filtered = filtered.filter(function (it) { return it.kategori_id === p.kategori_id; });
  }

  if (p.status_stok && p.status_stok !== 'semua') {
    filtered = filtered.filter(function (it) { return it.status === p.status_stok; });
  }

  if (p.q) {
    const q = String(p.q).toLowerCase().trim();
    filtered = filtered.filter(function (it) {
      return (
        it.nama.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.barcode.toLowerCase().includes(q)
      );
    });
  }

  filtered.sort(function (a, b) { return a.stok - b.stok; });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    ringkasan: {
      total_item: list.length,
      total_unit_stok: totalUnitStok,
      total_nilai_aset: isOwner ? Math.round(totalAsetStok) : null,
      total_habis: countHabis,
      total_kritis: countKritis,
      total_aman: countAman
    },
    items: filtered.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
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

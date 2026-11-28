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
  PAGE_LIMIT_MAKS: 500
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
    ['punya_varian', 'b'], ['foto_url', 's'], ['aktif', 'b'], ['stok_toko', 'n'], ['stok_gudang', 'n']],
  Varian: [['produk_id', 's'], ['nama_varian', 's'], ['sku', 's'], ['barcode', 's'], ['hpp', 'n'], ['harga_ritel', 'n'],
    ['harga_grosir', 'n'], ['stok', 'n'], ['stok_min', 'n'], ['aktif', 'b'], ['stok_toko', 'n'], ['stok_gudang', 'n']],
  Satuan_Konversi: [['produk_id', 's'], ['satuan', 's'], ['faktor', 'n'], ['barcode', 's'], ['harga_ritel', 'n'],
    ['harga_grosir', 'n']],
  Pelanggan: [['kode', 's'], ['nama', 's'], ['hp', 's'], ['alamat', 's'], ['tipe', 's'], ['level', 's'],
    ['limit_kredit', 'n'], ['tempo_hari', 'n'], ['poin', 'n'], ['total_belanja', 'n'], ['aktif', 'b'],
    ['saldo_deposit', 'n']],
  Supplier: [['nama', 's'], ['kontak', 's'], ['hp', 's'], ['alamat', 's'], ['catatan', 's'], ['aktif', 'b']],
  Penjualan: [['no_nota', 's'], ['tanggal', 'd'], ['kasir_id', 's'], ['pelanggan_id', 's'], ['subtotal', 'n'],
    ['diskon_tipe', 's'], ['diskon_nilai', 'n'], ['diskon', 'n'], ['pajak', 'n'], ['pembulatan', 'n'], ['total', 'n'],
    ['bayar', 'n'], ['kembalian', 'n'], ['metode_bayar', 's'], ['status_bayar', 's'], ['pengiriman', 's'],
    ['alamat_kirim', 's'], ['status_antar', 's'], ['catatan', 's'], ['status', 's'], ['void_alasan', 's'],
    ['void_oleh', 's'], ['void_at', 'd'], ['poin_didapat', 'n'], ['ongkir', 'n']],
  Penjualan_Item: [['penjualan_id', 's'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'], ['satuan', 's'],
    ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['qty_dibawa', 'n'], ['tipe_harga', 's'], ['harga_asli', 'n'],
    ['harga', 'n'], ['hpp', 'n'], ['diskon_tipe', 's'], ['diskon_nilai', 'n'], ['diskon', 'n'], ['subtotal', 'n'],
    ['lokasi_stok', 's']],
  Penjualan_Bayar: [['penjualan_id', 's'], ['metode', 's'], ['jumlah', 'n'], ['referensi', 's']],
  Pembelian: [['no_faktur', 's'], ['no_faktur_supplier', 's'], ['tanggal', 'd'], ['supplier_id', 's'],
    ['subtotal', 'n'], ['diskon', 'n'], ['total', 'n'], ['bayar', 'n'], ['status_bayar', 's'], ['jatuh_tempo', 'd'],
    ['catatan', 's'], ['status', 's'], ['diskon_item', 'n'], ['ongkir', 'n'], ['biaya_bongkar', 'n'],
    ['biaya_masuk_hutang', 'b'], ['metode_alokasi_biaya', 's']],
  Pembelian_Item: [['pembelian_id', 's'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'], ['satuan', 's'],
    ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['harga_beli', 'n'], ['subtotal', 'n'],
    ['diskon_persen', 'n'], ['diskon_item', 'n'], ['lokasi_masuk', 's'], ['qty_toko', 'n'], ['qty_gudang', 'n']],
  Piutang: [['penjualan_id', 's'], ['pelanggan_id', 's'], ['total', 'n'], ['terbayar', 'n'], ['sisa', 'n'],
    ['jatuh_tempo', 'd'], ['status', 's']],
  Hutang: [['pembelian_id', 's'], ['supplier_id', 's'], ['total', 'n'], ['terbayar', 'n'], ['sisa', 'n'],
    ['jatuh_tempo', 'd'], ['status', 's']],
  Pembayaran: [['tipe', 's'], ['ref_id', 's'], ['jumlah', 'n'], ['metode', 's'], ['tanggal', 'd'], ['catatan', 's']],
  Poin_Log: [['pelanggan_id', 's'], ['jumlah', 'n'], ['jenis', 's'], ['ref_id', 's'], ['saldo', 'n']],
  Deposit_Log: [['no_bukti', 's'], ['pelanggan_id', 's'], ['jenis', 's'], ['metode', 's'], ['jumlah', 'n'],
    ['saldo', 'n'], ['ref_id', 's'], ['catatan', 's']],
  Hadiah: [['nama', 's'], ['deskripsi', 's'], ['poin_dibutuhkan', 'n'], ['stok', 'n'], ['aktif', 'b']],
  Penukaran_Hadiah: [['no_tukar', 's'], ['pelanggan_id', 's'], ['hadiah_id', 's'], ['qty', 'n'], ['poin', 'n'],
    ['catatan', 's']],
  Kartu_Stok: [['produk_id', 's'], ['varian_id', 's'], ['tipe', 's'], ['qty', 'n'], ['saldo', 'n'], ['hpp', 'n'],
    ['ref_id', 's'], ['user_id', 's'], ['keterangan', 's'], ['lokasi', 's'], ['saldo_toko', 'n'], ['saldo_gudang', 'n']],
  Opname: [['no_opname', 's'], ['tanggal', 'd'], ['produk_id', 's'], ['varian_id', 's'], ['qty_sistem', 'n'],
    ['qty_fisik', 'n'], ['selisih', 'n'], ['alasan', 's'], ['status', 's'], ['disetujui_oleh', 's'],
    ['disetujui_at', 'd'], ['lokasi', 's']],
  Retur: [['no_retur', 's'], ['tipe', 's'], ['ref_id', 's'], ['pihak_id', 's'], ['tanggal', 'd'], ['total', 'n'],
    ['metode_refund', 's'], ['alasan', 's'], ['status', 's'], ['disetujui_oleh', 's'], ['disetujui_at', 'd'], ['lokasi', 's']],
  Retur_Item: [['retur_id', 's'], ['ref_item_id', 's'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'],
    ['satuan', 's'], ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['harga', 'n'], ['hpp', 'n'],
    ['subtotal', 'n']],
  Biaya: [['no_transaksi', 's'], ['tanggal', 'd'], ['kategori', 's'], ['nominal', 'n'], ['keterangan', 's'],
    ['sumber_dana', 's'], ['shift_id', 's'], ['user_id', 's'], ['user_nama', 's'], ['bukti_url', 's'],
    ['status', 's']],
  Shift_Kasir: [['no_shift', 's'], ['kasir_id', 's'], ['kasir_nama', 's'], ['waktu_buka', 'd'], ['waktu_tutup', 'd'],
    ['status', 's'], ['modal_awal', 'n'], ['total_transaksi', 'n'], ['total_penjualan', 'n'], ['total_tunai', 'n'],
    ['total_transfer', 'n'], ['total_tempo', 'n'], ['total_deposit_pakai', 'n'], ['total_diskon', 'n'],
    ['total_piutang_tunai', 'n'], ['total_deposit_tunai', 'n'], ['total_tarik_deposit_tunai', 'n'],
    ['total_refund_tunai', 'n'], ['total_biaya_kasir', 'n'], ['kas_sistem', 'n'], ['kas_fisik', 'n'],
    ['selisih', 'n'], ['catatan_buka', 's'], ['catatan_tutup', 's'], ['ditutup_oleh', 's'],
    ['ditutup_oleh_nama', 's']],
  Penawaran: [['no_penawaran', 's'], ['tanggal', 'd'], ['berlaku_sampai', 'd'], ['kasir_id', 's'], ['kasir_nama', 's'],
    ['pelanggan_id', 's'], ['pelanggan_nama', 's'], ['pelanggan_hp', 's'], ['alamat_kirim', 's'], ['judul_proyek', 's'],
    ['subtotal', 'n'], ['diskon_tipe', 's'], ['diskon_nilai', 'n'], ['diskon', 'n'], ['ongkir', 'n'], ['total', 'n'],
    ['pengiriman', 's'], ['catatan', 's'], ['items_json', 'j'], ['status', 's'], ['penjualan_id', 's'],
    ['no_nota_konversi', 's']],
  Tutup_Buku: [['periode', 's'], ['tipe', 's'], ['status', 's'], ['waktu_tutup', 'd'], ['ditutup_oleh', 's'],
    ['ditutup_oleh_nama', 's'], ['omset_kotor', 'n'], ['total_diskon', 'n'], ['omset_bersih', 'n'], ['total_hpp', 'n'],
    ['laba_kotor', 'n'], ['total_biaya', 'n'], ['laba_bersih', 'n'], ['margin_persen', 'n'], ['total_transaksi', 'n'],
    ['total_pembelian', 'n'], ['arus_kas_masuk', 'n'], ['arus_kas_keluar', 'n'], ['arus_kas_bersih', 'n'],
    ['saldo_piutang', 'n'], ['saldo_hutang', 'n'], ['valuasi_stok', 'n'], ['selisih_shift', 'n'],
    ['setoran_owner', 'n'], ['sisa_modal_besok', 'n'], ['catatan', 's'], ['snapshot_json', 'j']],
  Mutasi_Lokasi: [['no_mutasi', 's'], ['tanggal', 'd'], ['arah', 's'], ['asal', 's'], ['tujuan', 's'], ['pembawa', 's'],
    ['catatan', 's'], ['total_item', 'n'], ['total_qty_dasar', 'n'], ['items_json', 'j'], ['status', 's'],
    ['void_alasan', 's'], ['void_oleh', 's'], ['void_at', 'd']],
  Barang_Rusak: [['no_rusak', 's'], ['tanggal', 'd'], ['produk_id', 's'], ['varian_id', 's'], ['nama', 's'], ['satuan', 's'],
    ['faktor', 'n'], ['qty', 'n'], ['qty_dasar', 'n'], ['lokasi', 's'], ['kategori_rusak', 's'], ['tindak_lanjut', 's'],
    ['hpp', 'n'], ['nilai_kerugian', 'n'], ['foto_url', 's'], ['keterangan', 's'], ['status', 's'], ['pelapor_id', 's'],
    ['pelapor_nama', 's'], ['disetujui_oleh', 's'], ['disetujui_at', 'd'], ['klaim_status', 's'], ['klaim_at', 'd'],
    ['klaim_catatan', 's']],
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
  printer_jalur: 'otomatis', // otomatis | usb_direct | rawbt | webbluetooth | browser
  katalog_pdf_presets: [],
  tampilan_tema: {
    theme: 'light',
    accent: 'orange',
    fontFamily: 'system',
    fontPct: 100,
    fontStyle: 'standar',
    updatedAt: ''
  },
  poin_per_rupiah: 10000,
  level_member: [
    { nama: 'Reguler', min_belanja: 0, pengali: 1 },
    { nama: 'Silver', min_belanja: 10000000, pengali: 1.2 },
    { nama: 'Gold', min_belanja: 50000000, pengali: 1.5 },
    { nama: 'Platinum', min_belanja: 100000000, pengali: 2 }
  ],
  pajak_aktif: false,
  pajak_persen: 11,
  pembulatan_aktif: false,
  pembulatan_kelipatan: 100,
  stok_minus: false,
  wajib_buka_shift: true,
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
  'sistem.maintenance': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiSistemMaintenance_ },
  'sistem.backup': { publik: false, roles: [ROLE.OWNER], handler: aksiSistemBackup_ },
  'sistem.percantikSheet': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiSistemPercantikSheet_ },
  'sistem.resetGoLive': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiSistemResetGoLive_ },

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
  'produk.uploadFoto': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiProdukUploadFoto_ },
  'produk.importMassal': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiProdukImportMassal_ },

  // Pengaturan (Fase 1)
  'pengaturan.get': { publik: false, roles: SEMUA_ROLE, handler: aksiPengaturanGet_ },
  'pengaturan.set': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiPengaturanSet_ },
  'pengaturan.simpanPresetKatalog': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPengaturanSimpanPresetKatalog_ },
  'pengaturan.simpanTema': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPengaturanSimpanTema_ },

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
  'penjualan.list': { publik: false, roles: SEMUA_ROLE, handler: aksiPenjualanList_ },
  'penjualan.detail': { publik: false, roles: SEMUA_ROLE, handler: aksiPenjualanDetail_ },
  'penjualan.shiftKasir': { publik: false, roles: SEMUA_ROLE, handler: aksiPenjualanShiftKasir_ },
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
  'kartuStok.delete': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiKartuStokDelete_ },
  'kartuStok.bersihkanSampah': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiKartuStokBersihkanSampah_ },

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

  // Saldo Titipan / Deposit Pelanggan
  'deposit.tambah': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiDepositTambah_ },
  'deposit.tarik': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiDepositTarik_ },
  'deposit.riwayat': { publik: false, roles: SEMUA_ROLE, handler: aksiDepositRiwayat_ },

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
  'laporan.stokValuasi': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], handler: aksiLaporanStokValuasi_ },

  // Biaya Operasional & Kas Keluar
  'biaya.list': { publik: false, roles: SEMUA_ROLE, handler: aksiBiayaList_ },
  'biaya.create': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiBiayaCreate_ },
  'biaya.delete': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiBiayaDelete_ },

  // Manajemen Buka & Tutup Shift Kasir (Z-Report & Hitung Fisik Laci)
  'shift.aktif': { publik: false, roles: SEMUA_ROLE, handler: aksiShiftAktif_ },
  'shift.buka': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiShiftBuka_ },
  'shift.tutup': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiShiftTutup_ },
  'shift.list': { publik: false, roles: SEMUA_ROLE, handler: aksiShiftList_ },

  // Antrean Pengiriman, Surat Jalan, & Kirim Bertahap (Bon Barang)
  'pengiriman.list': { publik: false, roles: SEMUA_ROLE, handler: aksiPengirimanList_ },
  'pengiriman.updateStatus': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPengirimanUpdateStatus_ },

  // Penawaran Harga / Estimasi RAB (Quotation -> 1-Klik Jadi Nota)
  'penawaran.list': { publik: false, roles: SEMUA_ROLE, handler: aksiPenawaranList_ },
  'penawaran.create': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPenawaranCreate_ },
  'penawaran.konversi': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPenawaranKonversi_ },
  'penawaran.delete': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiPenawaranDelete_ },

  // Tutup Harian (EOD) & Tutup Buku Bulanan + Evaluasi Analisa
  'tutupBuku.rekapHarian': { publik: false, roles: SEMUA_ROLE, handler: aksiTutupBukuRekapHarian_ },
  'tutupBuku.tutupHarian': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiTutupBukuTutupHarian_ },
  'tutupBuku.evaluasiBulanan': { publik: false, roles: [ROLE.OWNER], handler: aksiTutupBukuEvaluasiBulanan_ },
  'tutupBuku.tutupBulanan': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiTutupBukuTutupBulanan_ },
  'tutupBuku.bukaKunci': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiTutupBukuBukaKunci_ },
  'tutupBuku.list': { publik: false, roles: [ROLE.OWNER], handler: aksiTutupBukuList_ },

  // Multi-Lokasi Stok (Toko & Gudang), Migrasi/Transfer Stok, & Pengelolaan Barang Rusak
  'gudang.ringkasan': { publik: false, roles: SEMUA_ROLE, handler: aksiGudangRingkasan_ },
  'gudang.transfer': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiGudangTransfer_ },
  'gudang.transferList': { publik: false, roles: SEMUA_ROLE, handler: aksiGudangTransferList_ },
  'gudang.transferVoid': { publik: false, roles: [ROLE.OWNER], tulis: true, handler: aksiGudangTransferVoid_ },
  'rusak.list': { publik: false, roles: SEMUA_ROLE, handler: aksiRusakList_ },
  'rusak.create': { publik: false, roles: SEMUA_ROLE, tulis: true, handler: aksiRusakCreate_ },
  'rusak.approve': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiRusakApprove_ },
  'rusak.reject': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiRusakReject_ },
  'rusak.selesaikanKlaim': { publik: false, roles: [ROLE.OWNER, ROLE.ADMIN], tulis: true, handler: aksiRusakSelesaikanKlaim_ }
};

/** Cache pembacaan per-request untuk optimasi performa sheet. */
var _CACHE_BACA_REQ = {};
var _HEADER_CACHE_REQ = {};
var _SS_REQ = null;
var _SHEET_MAP_REQ = {};
var _LOCK_DEPTH_REQ = 0;

/** Entry point Web App (semua aksi). */
function doPost(e) {
  _CACHE_BACA_REQ = {};
  _HEADER_CACHE_REQ = {};
  _SS_REQ = null;
  _SHEET_MAP_REQ = {};
  _LOCK_DEPTH_REQ = 0;
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

  // Cek kedaluwarsa waktu (WIB +07:00 independen dari timezone server)
  if (sesi.kedaluwarsa) {
    const tExp = parseWaktuWibMs_(sesi.kedaluwarsa);
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

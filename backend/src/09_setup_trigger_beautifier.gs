/* ========================================================================== */
/* 10. SETUP, TRIGGER, BACKUP, MENU                                           */
/* ========================================================================== */

/** Menu khusus di Spreadsheet (muncul saat Spreadsheet dibuka). */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('POS Kasir')
      .addItem('1. Setup / perbarui database', 'setupDatabase')
      .addItem('2. Pasang trigger backup harian', 'setupTriggers')
      .addSeparator()
      .addItem('🎨 Percantik Tampilan Spreadsheet', 'percantikTampilanSpreadsheet')
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
  _CACHE_BACA_REQ = {};
  _SS_REQ = null;
  _SHEET_MAP_REQ = {};
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

/** Dipanggil trigger harian (backup + pembersihan sesi kedaluwarsa otomatis). */
function backupTerjadwal() {
  try {
    bersihkanSesiKedaluwarsa_();
  } catch (errSesi) {
    console.warn('Pembersihan sesi terjadwal gagal: ' + errSesi);
  }
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

/* ========================================================================== */
/* PERCANTIK TAMPILAN SPREADSHEET (BEAUTIFIER & SINKRONISASI 33 SHEET)        */
/* ========================================================================== */

/**
 * Peta warna tab & urutan terstruktur untuk seluruh 33 sheet database.
 */
const TAB_WARNA_SPREADSHEET_ = {
  // 1. Master Data (Biru Elegan)
  'Produk': '#2563EB',
  'Varian': '#3B82F6',
  'Satuan_Konversi': '#60A5FA',
  'Kategori': '#1D4ED8',
  'Pelanggan': '#1E40AF',
  'Supplier': '#1E3A8A',

  // 2. Transaksi Kasir & Penjualan (Hijau Emerald)
  'Penjualan': '#059669',
  'Penjualan_Item': '#10B981',
  'Penjualan_Bayar': '#34D399',
  'Shift_Kasir': '#0D9488',
  'Penawaran': '#0284C7',

  // 3. Pengadaan & Pembelian (Oranye Hangat)
  'Pembelian': '#EA580C',
  'Pembelian_Item': '#F97316',

  // 4. Inventori Gudang, Multi-Lokasi & Barang Rusak (Amber Emas & Merah Bata)
  'Kartu_Stok': '#D97706',
  'Mutasi_Lokasi': '#0F766E',
  'Barang_Rusak': '#B91C1C',
  'Opname': '#F59E0B',
  'Retur': '#B45309',
  'Retur_Item': '#78350F',

  // 5. Keuangan, Tagihan & Tutup Buku (Ungu Violet & Merah)
  'Piutang': '#8B5CF6',
  'Hutang': '#7C3AED',
  'Pembayaran': '#A78BFA',
  'Deposit_Log': '#06B6D4',
  'Biaya': '#EF4444',
  'Tutup_Buku': '#4F46E5',

  // 6. Loyalitas & Hadiah Member (Pink Magenta)
  'Hadiah': '#DB2777',
  'Penukaran_Hadiah': '#EC4899',
  'Poin_Log': '#F472B6',

  // 7. Pengaturan & Sistem (Dark Slate)
  'Users': '#334155',
  'Sesi': '#475569',
  'Pengaturan': '#64748B',
  'Log_Audit': '#1E293B',
  'Counter': '#0F172A'
};

const URUTAN_SHEET_SPREADSHEET_ = [
  'Produk', 'Varian', 'Satuan_Konversi', 'Kategori', 'Pelanggan', 'Supplier',
  'Penjualan', 'Penjualan_Item', 'Penjualan_Bayar', 'Shift_Kasir', 'Penawaran',
  'Pembelian', 'Pembelian_Item',
  'Kartu_Stok', 'Mutasi_Lokasi', 'Barang_Rusak', 'Opname', 'Retur', 'Retur_Item',
  'Piutang', 'Hutang', 'Pembayaran', 'Deposit_Log', 'Biaya', 'Tutup_Buku',
  'Hadiah', 'Penukaran_Hadiah', 'Poin_Log',
  'Users', 'Sesi', 'Pengaturan', 'Log_Audit', 'Counter'
];

/**
 * Menyelaraskan skema 33 sheet (buat sheet baru + tambahkan kolom baru tanpa hapus data),
 * mengurutkan tab per kelompok modul, dan menata desain seluruh tabel agar tampil modern & konsisten.
 */
function jalankanPercantikSpreadsheet_(ss) {
  const migrasiLog = [];

  // Langkah A: Sinkronkan seluruh 33 sheet & kolom terbaru dari SKEMA (zero-data-loss)
  Object.keys(SKEMA).forEach(function (nama) {
    const info = siapkanSheet_(ss, nama);
    if (info) migrasiLog.push(info);
  });
  hapusSheetBawaanKosong_(ss);

  // Langkah B: Urutkan posisi tab sheet per kelompok modul (aman jika mock tidak mendukung moveActiveSheet)
  try {
    let pos = 1;
    URUTAN_SHEET_SPREADSHEET_.forEach(function (nama) {
      const sh = ss.getSheetByName(nama);
      if (sh && typeof ss.setActiveSheet === 'function' && typeof ss.moveActiveSheet === 'function') {
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(pos);
        pos++;
      }
    });
  } catch (e) {}

  const sheets = ss.getSheets();
  let totalDitata = 0;

  sheets.forEach(function (sh) {
    const nama = sh.getName();
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastCol < 1) return;

    // 1. Set Warna Tab Sheet per Modul
    const warnaTab = TAB_WARNA_SPREADSHEET_[nama] || '#64748B';
    try { sh.setTabColor(warnaTab); } catch (e) {}

    // 2. Pastikan Baris 1 Dibekukan (Freeze Header) & Gridlines Aktif
    try { sh.setFrozenRows(1); } catch (e) {}
    try { sh.setHiddenGridlines(false); } catch (e) {}

    // 3. Format Header (Row 1): Dark Slate Modern
    const headerRange = sh.getRange(1, 1, 1, lastCol);
    try {
      headerRange
        .setBackground('#1E293B')
        .setFontColor('#F8FAFC')
        .setFontFamily('Roboto')
        .setFontSize(10)
        .setFontWeight('bold')
        .setVerticalAlignment('middle')
        .setHorizontalAlignment('center');
    } catch (e) {}
    try { sh.setRowHeight(1, 34); } catch (e) {}

    const headerValues = headerRange.getValues()[0];

    // 4. Format Data Rows (Minimal 50 baris agar sheet kosong tetap langsung cantik saat terisi)
    const maxRows = typeof sh.getMaxRows === 'function' ? sh.getMaxRows() : Math.max(lastRow, 50);
    const barisTarget = Math.max(lastRow, Math.min(maxRows, 50));
    const jumlahData = barisTarget - 1;

    if (jumlahData >= 1) {
      const dataRange = sh.getRange(2, 1, jumlahData, lastCol);
      try {
        dataRange
          .setFontFamily('Roboto')
          .setFontSize(10)
          .setFontColor('#0F172A')
          .setVerticalAlignment('middle');
      } catch (e) {}

      // Zebra Striping Halus (Alternating Colors)
      try {
        const existingBandings = sh.getBandings();
        for (let b = 0; b < existingBandings.length; b++) {
          existingBandings[b].remove();
        }
        sh.getRange(1, 1, barisTarget, lastCol)
          .applyRowBanding()
          .setHeaderRowColor('#1E293B')
          .setFirstRowColor('#FFFFFF')
          .setSecondRowColor('#F8FAFC');
      } catch (e) {}

      // Garis Border Horizontal Halus Antar Baris
      try {
        sh.getRange(1, 1, barisTarget, lastCol)
          .setBorder(null, null, true, null, false, true, '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID);
      } catch (e) {}

      // Tinggi Baris Data Konsisten (26px)
      try {
        sh.setRowHeights(2, jumlahData, 26);
      } catch (e) {
        try {
          const batasBaris = Math.min(barisTarget, 50);
          for (let r = 2; r <= batasBaris; r++) sh.setRowHeight(r, 26);
        } catch (e2) {}
      }

      // 5. Format Presisi per Nama Kolom (Bebas Salah Format Rupiah pada Qty/Stok!)
      const condRules = [];
      const addRule = function (regex, bg, fg, bold, italic, range) {
        try {
          if (typeof SpreadsheetApp.newConditionalFormatRule !== 'function') return;
          let b = SpreadsheetApp.newConditionalFormatRule()
            .whenTextMatches(regex)
            .setBackground(bg)
            .setFontColor(fg);
          if (bold) b = b.setBold(true);
          if (italic) b = b.setItalic(true);
          condRules.push(b.setRanges([range]).build());
        } catch (e) {}
      };

      headerValues.forEach(function (h, idx) {
        const colIdx = idx + 1;
        const colName = String(h || '').trim().toLowerCase();
        const colRange = sh.getRange(2, colIdx, jumlahData, 1);

        const isQtyStok = (
          /^(qty|qty_dasar|qty_dibawa|qty_toko|qty_gudang|qty_sistem|qty_fisik|stok|stok_toko|stok_gudang|stok_min|min_grosir_qty|faktor|total_qty_dasar)$/.test(colName) ||
          (nama === 'Kartu_Stok' && /^(saldo|saldo_toko|saldo_gudang)$/.test(colName)) ||
          (nama === 'Opname' && colName === 'selisih')
        );
        const isPersen = /persen$/.test(colName);
        const isCounterBulat = (
          /^(total_item|total_transaksi|poin|poin_didapat|poin_dibutuhkan|tempo_hari|gagal_login|urutan)$/.test(colName) ||
          (nama === 'Poin_Log' && /^(jumlah|saldo)$/.test(colName)) ||
          (nama === 'Counter' && colName === 'nilai')
        );
        const isRupiahMerah = (nama === 'Biaya' && colName === 'nominal') || (nama === 'Barang_Rusak' && colName === 'nilai_kerugian');
        const isRupiah = !isQtyStok && !isPersen && !isCounterBulat && (
          /harga|hpp|subtotal|bayar|terbayar|sisa|kembalian|nominal|diskon|ongkir|biaya|pajak|pembulatan|limit_kredit|nilai_aset|nilai_kerugian|omset|laba|arus_kas|valuasi|setoran|modal_awal|kas_sistem|kas_fisik|selisih|saldo_deposit|saldo_piutang|saldo_hutang|total_belanja|total_penjualan|total_pembelian|total_tunai|total_transfer|total_tempo|total_deposit|total_tarik|total_refund|total_piutang|total_hpp|^total$/.test(colName) ||
          ((nama === 'Deposit_Log' || nama === 'Penjualan_Bayar' || nama === 'Pembayaran') && /^(jumlah|saldo)$/.test(colName))
        );
        const isTanggal = /tanggal|jatuh_tempo|berlaku_sampai|created_at|updated_at|waktu|disetujui_at|void_at|klaim_at|last_login|kunci_sampai|kedaluwarsa|terakhir_aktif|expired/.test(colName);
        const isJsonOrUrl = /_json$|foto_url|bukti_url|^value$/.test(colName);
        const isKeterangan = /keterangan|catatan|deskripsi|alamat|alasan/.test(colName);
        const isKode = /^(id|kode|sku|barcode|periode|hp|satuan|satuan_dasar)$|_id$|^no_/.test(colName);
        const isStatusCol = /^(status|status_bayar|status_antar|klaim_status)$/.test(colName);
        const isLokasiCol = /^(lokasi|lokasi_stok|lokasi_masuk|asal|tujuan)$/.test(colName);
        const isArahCol = colName === 'arah';

        try {
          if (isRupiahMerah) {
            colRange.setNumberFormat('"Rp"#,##0').setHorizontalAlignment('right').setFontWeight('bold').setFontColor('#DC2626');
          } else if (isPersen) {
            colRange.setNumberFormat('0.0"%"').setHorizontalAlignment('right');
          } else if (isQtyStok) {
            colRange.setNumberFormat('#,##0.###').setHorizontalAlignment('right');
          } else if (isCounterBulat) {
            colRange.setNumberFormat('#,##0').setHorizontalAlignment('right');
          } else if (isRupiah) {
            colRange.setNumberFormat('"Rp"#,##0').setHorizontalAlignment('right');
          } else if (isTanggal) {
            colRange.setNumberFormat('yyyy-mm-dd hh:mm').setHorizontalAlignment('center');
          } else if (isJsonOrUrl) {
            colRange.setHorizontalAlignment('left');
            if (typeof colRange.setWrapStrategy === 'function' && SpreadsheetApp.WrapStrategy) {
              colRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
            }
          } else if (isKeterangan) {
            colRange.setHorizontalAlignment('left').setWrap(true);
          } else if (isKode) {
            colRange.setHorizontalAlignment('center');
          } else if (isStatusCol || isLokasiCol || isArahCol || /^(sumber_dana|metode|metode_bayar|metode_refund|tipe|jenis|role|pengiriman|level|tindak_lanjut|aktif|deleted|punya_varian|wajib_ganti_pin)$/.test(colName)) {
            colRange.setHorizontalAlignment('center');
          }
        } catch (e) {}

        // 6. Badge Warna Bersyarat (Status, Lokasi Toko/Gudang, Arah Transfer, Deleted)
        if (isStatusCol) {
          addRule('(?i)^(aktif|lunas|selesai|setuju|disetujui|diganti_barang|diambil)$', '#DCFCE7', '#166534', true, false, colRange);
          addRule('(?i)^(terkunci|dikirim|dibuka_kembali)$', '#DBEAFE', '#1E40AF', true, false, colRange);
          addRule('(?i)^(tempo|sebagian|draft|pending|diajukan|menunggu|belum_lunas|diproses)$', '#FEF3C7', '#92400E', true, false, colRange);
          addRule('(?i)^(batal|belum|kritis|habis|tolak|ditolak|ditolak_supplier|hutang)$', '#FEE2E2', '#991B1B', true, false, colRange);
          addRule('(?i)^(void|nonaktif|ditutup)$', '#F1F5F9', '#64748B', false, true, colRange);
        } else if (isLokasiCol) {
          addRule('(?i)^toko$', '#CCFBF1', '#115E59', true, false, colRange);
          addRule('(?i)^gudang$', '#E0E7FF', '#3730A3', true, false, colRange);
          addRule('(?i)^split$', '#FEF3C7', '#92400E', true, false, colRange);
        } else if (isArahCol) {
          addRule('(?i)^gudang_ke_toko$', '#DCFCE7', '#166534', true, false, colRange);
          addRule('(?i)^toko_ke_gudang$', '#DBEAFE', '#1E40AF', true, false, colRange);
        } else if (colName === 'deleted') {
          addRule('(?i)^true$', '#F1F5F9', '#94A3B8', false, true, colRange);
        }
      });

      if (condRules.length > 0 && typeof sh.setConditionalFormatRules === 'function') {
        try { sh.setConditionalFormatRules(condRules); } catch (e) {}
      }
    }

    // 7. Auto-Fit & Penyetelan Lebar Kolom Proporsional (Anti-Terpotong & Anti-Lebar Berlebih)
    headerValues.forEach(function (h, idx) {
      const colIdx = idx + 1;
      const colName = String(h || '').trim().toLowerCase();
      try {
        sh.autoResizeColumn(colIdx);
        const lebarAuto = sh.getColumnWidth(colIdx);

        let minLebar = 95;
        let maxLebar = 320;
        if (/_json$|foto_url|bukti_url|^value$/.test(colName)) { minLebar = 150; maxLebar = 240; }
        else if (/keterangan|catatan|deskripsi|alamat|alasan/.test(colName)) { minLebar = 230; maxLebar = 320; }
        else if (/^no_|no_transaksi|no_faktur|no_nota|no_retur/.test(colName)) { minLebar = 165; maxLebar = 210; }
        else if (/tanggal|jatuh_tempo|created_at|updated_at|waktu|disetujui_at|void_at|klaim_at/.test(colName)) { minLebar = 148; maxLebar = 185; }
        else if (/nominal|harga|hpp|total|subtotal|bayar|sisa|nilai|omset|laba|valuasi|saldo/.test(colName)) { minLebar = 128; maxLebar = 175; }
        else if (/kategori/.test(colName)) { minLebar = 160; maxLebar = 220; }
        else if (/nama/.test(colName)) { minLebar = 195; maxLebar = 280; }
        else if (/lokasi|arah|status|metode|sumber_dana|tindak_lanjut/.test(colName)) { minLebar = 118; maxLebar = 165; }
        else if (/id|sku|barcode|kode/.test(colName)) { minLebar = 125; maxLebar = 190; }

        const lebarFinal = Math.min(maxLebar, Math.max(lebarAuto + 16, minLebar));
        sh.setColumnWidth(colIdx, lebarFinal);
      } catch (e) {}
    });

    totalDitata++;
  });

  SpreadsheetApp.flush();
  const semuaNamaSkema = Object.keys(SKEMA);
  const semuaTerdaftar = semuaNamaSkema.every(function (n) {
    return Boolean(TAB_WARNA_SPREADSHEET_[n]) && URUTAN_SHEET_SPREADSHEET_.indexOf(n) !== -1;
  });
  return {
    total_sheet: totalDitata,
    total_skema: semuaNamaSkema.length,
    semua_terdaftar: semuaTerdaftar,
    migrasi: migrasiLog
  };
}

/**
 * Menu Spreadsheet: POS Kasir -> Percantik Tampilan Spreadsheet.
 */
function percantikTampilanSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || ss_();
  if (!ss) throw new Error('Fungsi ini harus dijalankan dari Google Spreadsheet database.');

  const hasil = jalankanPercantikSpreadsheet_(ss);
  try {
    ss.toast('Semua ' + hasil.total_sheet + ' sheet berhasil disinkronkan & dipercantik!', 'Sukses', 5);
  } catch (e) {}
  infoAdmin_(
    'Tampilan Spreadsheet Dipercantik',
    'Berhasil menyinkronkan & menata seluruh ' + hasil.total_sheet + ' sheet database!\n\n' +
    'Fitur yang diterapkan:\n' +
    '- Sinkronisasi otomatis seluruh ' + hasil.total_skema + ' sheet & kolom terbaru (termasuk Stok Toko/Gudang, Mutasi_Lokasi, Barang_Rusak, Tutup_Buku)\n' +
    '- Urutan tab rapi per kelompok modul & warna tab konsisten\n' +
    '- Header Dark Slate modern, freeze baris 1 & zebra striping halus\n' +
    '- Format presisi: Rupiah, Qty/Stok desimal, Persen, Tanggal, & clip JSON\n' +
    '- Badge warna otomatis untuk Status, Lokasi (Toko/Gudang/Split), & Arah Transfer'
  );
  return hasil;
}

/**
 * sistem.percantikSheet — Endpoint API (Khusus Owner) untuk menyinkronkan skema & menata tampilan seluruh 33 sheet Spreadsheet langsung dari aplikasi.
 */
function aksiSistemPercantikSheet_(ctx) {
  const ss = ss_();
  const hasil = jalankanPercantikSpreadsheet_(ss);
  catatAudit_(ctx.user.id, 'sistem_percantik_sheet', 'SISTEM', '', {
    total_sheet: hasil.total_sheet,
    migrasi_count: hasil.migrasi.length
  });
  return {
    pesan: 'Seluruh ' + hasil.total_sheet + ' sheet Spreadsheet berhasil disinkronkan & dipercantik konsisten!',
    total_sheet: hasil.total_sheet,
    total_skema: hasil.total_skema,
    semua_terdaftar: hasil.semua_terdaftar,
    migrasi: hasil.migrasi,
    waktu_server: sekarang_()
  };
}

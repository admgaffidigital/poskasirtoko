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
/* PERCANTIK TAMPILAN SPREADSHEET (BEAUTIFIER DATABASE ENGINE)                */
/* ========================================================================== */

/**
 * Menata otomatis seluruh 26 sheet agar tampil profesional, estetik,
 * dan rapi ala database modern (Airtable / Notion style):
 *  - Warna tab sheet per kategori modul
 *  - Freeze header baris 1 & gridlines aktif
 *  - Header dark slate elegan (#1E293B) dengan teks putih bold
 *  - Zebra striping halus (#FFFFFF & #F8FAFC)
 *  - Format angka mata uang Rupiah & format tanggal rapi
 *  - Badge warna bersyarat otomatis untuk kolom status
 *  - Auto-fit lebar kolom dengan ruang padding nyaman
 */
function percantikTampilanSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Fungsi ini harus dijalankan dari Google Spreadsheet database.');

  // Peta Warna Tab per Kelompok Modul
  const TAB_WARNA = {
    // 1. Master Data (Biru Elegan)
    'Produk': '#2563EB',
    'Kategori': '#2563EB',
    'Varian': '#3B82F6',
    'Satuan_Konversi': '#60A5FA',
    'Pelanggan': '#1D4ED8',
    'Supplier': '#1E40AF',

    // 2. Transaksi Kasir & Penjualan (Hijau Emerald)
    'Penjualan': '#059669',
    'Penjualan_Item': '#10B981',
    'Penjualan_Bayar': '#34D399',
    'Shift_Kasir': '#0D9488',
    'Penawaran': '#0284C7',

    // 3. Pengadaan & Pembelian (Oranye Hangat)
    'Pembelian': '#EA580C',
    'Pembelian_Item': '#F97316',

    // 4. Keuangan & Tagihan (Ungu Violet & Merah)
    'Hutang': '#7C3AED',
    'Piutang': '#8B5CF6',
    'Pembayaran': '#A78BFA',
    'Deposit_Log': '#06B6D4',
    'Biaya': '#EF4444',

    // 5. Inventori Gudang & Stok (Amber Emas)
    'Kartu_Stok': '#D97706',
    'Opname': '#F59E0B',
    'Retur': '#B45309',
    'Retur_Item': '#78350F',

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

  const sheets = ss.getSheets();
  let totalDitata = 0;

  sheets.forEach(function (sh) {
    const nama = sh.getName();
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastCol < 1) return;

    // 1. Set Warna Tab Sheet
    const warnaTab = TAB_WARNA[nama] || '#64748B';
    try {
      sh.setTabColor(warnaTab);
    } catch (e) {}

    // 2. Pastikan Baris 1 Dibekukan (Freeze Header) & Gridlines Aktif
    try {
      sh.setFrozenRows(1);
    } catch (e) {}
    try {
      sh.setHiddenGridlines(false);
    } catch (e) {}

    // 3. Format Header (Row 1): Dark Slate Header Elegan
    const headerRange = sh.getRange(1, 1, 1, lastCol);
    headerRange
      .setBackground('#1E293B')
      .setFontColor('#F8FAFC')
      .setFontFamily('Roboto')
      .setFontSize(10)
      .setFontWeight('bold')
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center');
    try {
      sh.setRowHeight(1, 32);
    } catch (e) {}

    // Baca nama-nama kolom di Baris 1
    const headerValues = headerRange.getValues()[0];

    // 4. Format Data Rows (Format Baris 2 ke Bawah, Minimal 50 Baris agar Sheet Baru Langsung Cantik)
    const maxRows = sh.getMaxRows();
    const barisTarget = Math.max(lastRow, Math.min(maxRows, 50));
    const jumlahData = barisTarget - 1;

    if (jumlahData >= 1) {
      const dataRange = sh.getRange(2, 1, jumlahData, lastCol);
      dataRange
        .setFontFamily('Roboto')
        .setFontSize(10)
        .setVerticalAlignment('middle');

      // Terapkan Zebra Striping Halus (Alternating Colors)
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

      // Terapkan Garis Grid Halus Antar Baris
      try {
        sh.getRange(1, 1, barisTarget, lastCol)
          .setBorder(null, null, null, null, null, true, '#E2E8F0', SpreadsheetApp.BorderStyle.SOLID);
      } catch (e) {}

      // Terapkan Tinggi Baris Data Nyaman (26px)
      try {
        sh.setRowHeights(2, jumlahData, 26);
      } catch (e) {
        try {
          const batasBaris = Math.min(barisTarget, 50);
          for (let r = 2; r <= batasBaris; r++) {
            sh.setRowHeight(r, 26);
          }
        } catch (e2) {}
      }

      // 5. Format Angka, Uang, Tanggal, dan Status Berdasarkan Nama Kolom
      headerValues.forEach(function (h, idx) {
        const colIdx = idx + 1;
        const colName = String(h || '').trim().toLowerCase();
        const colRange = sh.getRange(2, colIdx, jumlahData, 1);

        // Kolom Nominal Khusus Biaya (Rupiah, Tebal, Merah Elegan)
        if (nama === 'Biaya' && colName === 'nominal') {
          colRange
            .setNumberFormat('"Rp"#,##0')
            .setHorizontalAlignment('right')
            .setFontWeight('bold')
            .setFontColor('#DC2626');
        }
        // Kolom Mata Uang Standar Lainnya
        else if (/harga|hpp|total|subtotal|bayar|sisa|kembalian|nominal|diskon|terbayar|limit_kredit|nilai_aset|saldo/i.test(colName)) {
          colRange.setNumberFormat('"Rp"#,##0').setHorizontalAlignment('right');
        }
        // Kolom Kuantitas / Angka (Qty, Stok, Poin, Faktor, Hari)
        else if (/qty|stok|stok_min|poin|faktor|tempo_hari/i.test(colName)) {
          colRange.setNumberFormat('#,##0').setHorizontalAlignment('right');
        }
        // Kolom Tanggal & Waktu (Created, Updated, Tanggal, Jatuh Tempo)
        else if (/tanggal|jatuh_tempo|created_at|updated_at|waktu|expired/i.test(colName)) {
          colRange.setNumberFormat('yyyy-mm-dd hh:mm').setHorizontalAlignment('center');
        }
        // Kolom Kode / ID / SKU / Nomor Transaksi / Barcode
        else if (/id|kode|no_faktur|no_nota|no_transaksi|no_retur|sku|barcode/i.test(colName)) {
          colRange.setHorizontalAlignment('center');
        }
        // Kolom Keterangan / Deskripsi / Alamat (Wrap Text Rapi)
        else if (/keterangan|catatan|deskripsi|alamat/i.test(colName)) {
          colRange.setHorizontalAlignment('left').setWrap(true);
        }
        // Kolom Status / Sumber Dana / Metode / Tipe / Role
        else if (/status|sumber_dana|metode|tipe|role/i.test(colName)) {
          colRange.setHorizontalAlignment('center');
        }
      });

      // 6. Aturan Format Bersyarat (Badge Status)
      const statusColIdx = headerValues.findIndex(function (h) {
        return String(h || '').trim().toLowerCase() === 'status';
      });

      if (statusColIdx !== -1) {
        const statusRange = sh.getRange(2, statusColIdx + 1, jumlahData, 1);
        try {
          const rules = [];

          // Hijau Pastel: Aktif, Lunas, Selesai, Setuju
          rules.push(SpreadsheetApp.newConditionalFormatRule()
            .whenTextMatches('(?i)^(aktif|lunas|selesai|setuju)$')
            .setBackground('#DCFCE7')
            .setFontColor('#166534')
            .setBold(true)
            .setRanges([statusRange])
            .build());

          // Kuning/Amber Pastel: Tempo, Sebagian, Draft, Pending
          rules.push(SpreadsheetApp.newConditionalFormatRule()
            .whenTextMatches('(?i)^(tempo|sebagian|draft|pending)$')
            .setBackground('#FEF3C7')
            .setFontColor('#92400E')
            .setBold(true)
            .setRanges([statusRange])
            .build());

          // Merah Muda Pastel: Batal, Belum, Kritis, Habis, Tolak, Hutang
          rules.push(SpreadsheetApp.newConditionalFormatRule()
            .whenTextMatches('(?i)^(batal|belum|kritis|habis|tolak|hutang)$')
            .setBackground('#FEE2E2')
            .setFontColor('#991B1B')
            .setBold(true)
            .setRanges([statusRange])
            .build());

          // Abu-abu Lembut: Void, Nonaktif
          rules.push(SpreadsheetApp.newConditionalFormatRule()
            .whenTextMatches('(?i)^(void|nonaktif)$')
            .setBackground('#F1F5F9')
            .setFontColor('#64748B')
            .setItalic(true)
            .setRanges([statusRange])
            .build());

          sh.setConditionalFormatRules(rules);
        } catch (e) {}
      }
    }

    // 7. Auto-Fit & Penyetelan Lebar Kolom Proporsional (Anti-Terpotong)
    headerValues.forEach(function (h, idx) {
      const colIdx = idx + 1;
      const colName = String(h || '').trim().toLowerCase();
      try {
        sh.autoResizeColumn(colIdx);
        const lebarAuto = sh.getColumnWidth(colIdx);

        let minLebar = 95;
        if (/keterangan|catatan|deskripsi|alamat/i.test(colName)) minLebar = 280;
        else if (/no_transaksi|no_faktur|no_nota|no_retur/i.test(colName)) minLebar = 165;
        else if (/tanggal|jatuh_tempo|created_at|updated_at|waktu/i.test(colName)) minLebar = 145;
        else if (/nominal|harga|hpp|total|subtotal|bayar|sisa|nilai/i.test(colName)) minLebar = 135;
        else if (/kategori/i.test(colName)) minLebar = 180;
        else if (/nama/i.test(colName)) minLebar = 210;
        else if (/sumber_dana|metode/i.test(colName)) minLebar = 125;
        else if (/status/i.test(colName)) minLebar = 105;
        else if (/bukti_url|foto/i.test(colName)) minLebar = 150;
        else if (/id|sku|barcode|kode/i.test(colName)) minLebar = 130;

        sh.setColumnWidth(colIdx, Math.max(lebarAuto + 16, minLebar));
      } catch (e) {}
    });

    totalDitata++;
  });

  SpreadsheetApp.flush();
  try {
    ss.toast('Semua ' + totalDitata + ' sheet berhasil dipercantik dengan desain modern! ✨', 'Sukses', 5);
  } catch (e) {}
  infoAdmin_('Tampilan Dipercantik ✨', 'Berhasil mempercantik tampilan ' + totalDitata + ' sheet!\n\nFitur yang diterapkan:\n- Warna Header Dark Slate Modern & Freeze Baris 1\n- Warna Tab Sheet per Modul (Master, Kasir, Pengadaan, Keuangan, Gudang)\n- Zebra Striping Halus (Banding Row)\n- Format Angka Rupiah & Tanggal Rapi\n- Badge Warna Otomatis untuk Kolom Status');
}

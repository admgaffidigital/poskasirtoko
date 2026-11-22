/* ========================================================================== */
/* 6. LAPISAN DATA                                                            */
/* ========================================================================== */

/** Spreadsheet database (ID disimpan oleh setupDatabase, fallback ke spreadsheet induk). */
function ss_() {
  if (_SS_REQ) return _SS_REQ;
  const id = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) gagal_(KODE.SERVER, 'Database belum disiapkan. Jalankan setupDatabase() terlebih dahulu.');
  _SS_REQ = ss;
  return ss;
}

/** Ambil sheet sesuai SKEMA; otomatis buat sheet & header baru jika belum ada (zero-migration). */
function sheet_(namaSheet) {
  if (!SKEMA[namaSheet]) gagal_(KODE.SERVER, 'Sheet tidak dikenal: ' + namaSheet);
  if (_SHEET_MAP_REQ && _SHEET_MAP_REQ[namaSheet]) return _SHEET_MAP_REQ[namaSheet];
  let sh = ss_().getSheetByName(namaSheet);
  if (!sh) {
    sh = ss_().insertSheet(namaSheet);
    const cols = kolomSheet_(namaSheet).map(function (k) { return k[0]; });
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
  if (_SHEET_MAP_REQ) _SHEET_MAP_REQ[namaSheet] = sh;
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
 * Sheet yang di-cache di CacheService (L2) lintas-request untuk memangkas RPC Google Sheets.
 * Setiap kali ada tambahBaris_/ubahBaris_/hapusLunak_, cache sheet terkait langsung dihapus (0% data basi).
 */
const MASTER_CACHE_SHEETS = Object.freeze({
  Kategori: 180,
  Produk: 120,
  Varian: 120,
  Satuan_Konversi: 120,
  Pelanggan: 180,
  Supplier: 180,
  Hadiah: 180,
  Users: 180,
  Penjualan: 90,
  Penjualan_Item: 90,
  Penjualan_Bayar: 90,
  Pembelian: 90,
  Pembelian_Item: 90,
  Piutang: 90,
  Hutang: 90,
  Pembayaran: 90,
  Retur: 90,
  Retur_Item: 90,
  Biaya: 90,
  Deposit_Log: 90
});

/** Hapus cache L2 CacheService untuk sheet master saat ada penulisan data. */
function hapusCacheSheetMaster_(namaSheet) {
  if (MASTER_CACHE_SHEETS[namaSheet]) {
    cacheHapus_('sh_v1_' + namaSheet);
  }
}

/**
 * Baca semua baris sheet sebagai array objek bertipe.
 * opsi.termasukTerhapus = true untuk ikut membaca baris soft delete.
 * Setiap objek mendapat properti non-enumerable "_baris" (nomor baris sheet).
 */
function bacaSemua_(namaSheet, opsi) {
  opsi = opsi || {};
  const cacheKey = namaSheet + (opsi.termasukTerhapus ? '_semua' : '_aktif');
  if (_CACHE_BACA_REQ && _CACHE_BACA_REQ[cacheKey]) {
    return _CACHE_BACA_REQ[cacheKey];
  }
  if (!opsi.termasukTerhapus && _CACHE_BACA_REQ && _CACHE_BACA_REQ[namaSheet + '_semua']) {
    const aktif = _CACHE_BACA_REQ[namaSheet + '_semua'].filter(function (o) { return !o.deleted; });
    _CACHE_BACA_REQ[cacheKey] = aktif;
    return aktif;
  }

  // L2 CacheService lintas-request untuk sheet master (hemat ~400-1200ms per baca)
  const pakaiCacheMaster = !opsi.termasukTerhapus && !opsi.lewatCache && !!MASTER_CACHE_SHEETS[namaSheet];
  if (pakaiCacheMaster) {
    const cached = cacheAmbil_('sh_v1_' + namaSheet);
    if (cached && Array.isArray(cached.items) && Array.isArray(cached.rows) && cached.items.length === cached.rows.length) {
      const dipulihkan = cached.items.map(function (it, idx) {
        const obj = Object.assign({}, it);
        Object.defineProperty(obj, '_baris', { value: cached.rows[idx], enumerable: false });
        return obj;
      });
      if (_CACHE_BACA_REQ) _CACHE_BACA_REQ[cacheKey] = dipulihkan;
      return dipulihkan;
    }
  }

  const sh = sheet_(namaSheet);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    if (_CACHE_BACA_REQ) _CACHE_BACA_REQ[cacheKey] = [];
    if (pakaiCacheMaster) cacheSimpan_('sh_v1_' + namaSheet, { items: [], rows: [] }, MASTER_CACHE_SHEETS[namaSheet]);
    return [];
  }
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
  if (_CACHE_BACA_REQ) _CACHE_BACA_REQ[cacheKey] = hasil;
  if (pakaiCacheMaster) {
    cacheSimpan_('sh_v1_' + namaSheet, {
      items: hasil,
      rows: hasil.map(function (o) { return o._baris; })
    }, MASTER_CACHE_SHEETS[namaSheet]);
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
/**
 * Pastikan seluruh kolom dalam skema terbaru sudah ada di header baris 1 sheet lama
 * (migrasi otomatis tanpa perlu jalankan setupDatabase manual).
 */
function pastikanKolomSkema_(sh, namaSheet) {
  if (_HEADER_CACHE_REQ && _HEADER_CACHE_REQ[namaSheet]) {
    return _HEADER_CACHE_REQ[namaSheet];
  }
  const daftarNama = Object.keys(tipeKolom_(namaSheet));
  let header = petaHeader_(sh);
  const kurang = daftarNama.filter(function (nama) { return header[nama] === undefined; });
  if (kurang.length) {
    const mulaiKol = sh.getLastColumn() + 1;
    const maksKol = sh.getMaxColumns();
    if (mulaiKol + kurang.length - 1 > maksKol) {
      sh.insertColumnsAfter(maksKol, mulaiKol + kurang.length - 1 - maksKol);
    }
    sh.getRange(1, mulaiKol, 1, kurang.length).setValues([kurang]);
    header = petaHeader_(sh);
  }
  if (_HEADER_CACHE_REQ) _HEADER_CACHE_REQ[namaSheet] = header;
  return header;
}

function tambahBaris_(namaSheet, daftar, userId) {
  if (_CACHE_BACA_REQ) {
    delete _CACHE_BACA_REQ[namaSheet + '_aktif'];
    delete _CACHE_BACA_REQ[namaSheet + '_semua'];
  }
  hapusCacheSheetMaster_(namaSheet);
  if (!daftar || !daftar.length) return [];
  const sh = sheet_(namaSheet);
  const header = pastikanKolomSkema_(sh, namaSheet);
  const lebar = Object.keys(header).reduce(function (m, k) { return Math.max(m, header[k] + 1); }, 0) || sh.getLastColumn();
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
  const header = pastikanKolomSkema_(sh, namaSheet);
  const lebar = Object.keys(header).reduce(function (m, k) { return Math.max(m, header[k] + 1); }, 0) || sh.getLastColumn();
  const tipe = tipeKolom_(namaSheet);
  const semua = bacaSemua_(namaSheet, { termasukTerhapus: true });
  if (_CACHE_BACA_REQ) {
    delete _CACHE_BACA_REQ[namaSheet + '_aktif'];
    delete _CACHE_BACA_REQ[namaSheet + '_semua'];
  }
  hapusCacheSheetMaster_(namaSheet);
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

/** Jalankan fn di dalam script lock (re-entrant safe). Lock hanya dilepas pada lapisan terluar. */
function denganKunci_(fn) {
  if (_LOCK_DEPTH_REQ > 0) {
    _LOCK_DEPTH_REQ++;
    try {
      return fn();
    } finally {
      _LOCK_DEPTH_REQ--;
    }
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(APP.LOCK_TIMEOUT_MS)) {
    gagal_(KODE.CONFLICT, 'Server sedang sibuk memproses transaksi lain. Silakan coba lagi.');
  }
  _LOCK_DEPTH_REQ = 1;
  try {
    const hasil = fn();
    SpreadsheetApp.flush();
    return hasil;
  } finally {
    _LOCK_DEPTH_REQ = 0;
    lock.releaseLock();
  }
}

/** Simpan JSON ke cache; otomatis dipecah bila > batas per key (batas aman 600KB agar tidak memenuhi kuota). */
function cacheSimpan_(key, nilai, detik) {
  const cache = CacheService.getScriptCache();
  const teks = JSON.stringify(nilai);
  if (teks.length > 600000) return;
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

/** Ambil JSON dari cache dalam 1 RPC untuk entri standar; null bila tidak ada / rusak. */
function cacheAmbil_(key) {
  const cache = CacheService.getScriptCache();
  const awal = cache.getAll([key, key + '__n']);
  const n = awal[key + '__n'];
  if (n === undefined || n === null) return null;
  try {
    if (n === '0') {
      const t = awal[key];
      return t === undefined || t === null ? null : JSON.parse(t);
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
  const valid = ['INV', 'PB', 'RT', 'OP', 'TK', 'MBR', 'SKU', 'BC', 'PLG', 'EXP', 'DEP'];
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

/**
 * Hitung digit checksum EAN-13 (modulo 10).
 * Digit posisi genap (0-based indeks ganjil) dikali 3, posisi ganjil dikali 1.
 */
function hitungChecksumEan13_(str12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(str12.charAt(i), 10) || 0;
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const rem = sum % 10;
  return rem === 0 ? 0 : 10 - rem;
}

/**
 * Generate barcode 13-digit EAN-13 in-house retail GS1 (Prefix 20 + yyMMdd + 4-digit seq + check digit).
 * Format numerik murni 13 digit, 100% kompatibel dengan scanner USB/Bluetooth & kamera.
 */
function barcodeBerikut_() {
  const tglStr = Utilities.formatDate(new Date(), APP.TZ, 'yyMMdd');
  const key = 'BC-' + tglStr;
  const baris = bacaSemua_('Counter').filter(function (c) { return c.key === key; })[0];
  let nilai;
  if (baris) {
    nilai = baris.nilai + 1;
    ubahBaris_('Counter', [{ id: baris.id, data: { nilai: nilai } }], 'sistem');
  } else {
    nilai = 1;
    tambahBaris_('Counter', [{ key: key, nilai: nilai }], 'sistem');
  }
  const seq = ('000' + nilai).slice(-4);
  const raw12 = '20' + tglStr + seq;
  const checksum = hitungChecksumEan13_(raw12);
  return raw12 + String(checksum);
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

/** Hitung faktor pengali poin berdasarkan level member (case-insensitive + kompatibel alias Perak/Silver, Emas/Gold, Platinum). */
function hitungPengaliPoin_(levelNama, pengaturan) {
  const norm = String(levelNama || 'Reguler').trim().toLowerCase();
  const alias = { perak: 'silver', silver: 'silver', emas: 'gold', gold: 'gold', platinum: 'platinum', reguler: 'reguler' };
  const target = alias[norm] || norm;

  const daftar = Array.isArray(pengaturan && pengaturan.level_member) ? pengaturan.level_member : [];
  for (let i = 0; i < daftar.length; i++) {
    const lvl = daftar[i];
    const lvlNorm = String(lvl && lvl.nama || '').trim().toLowerCase();
    const lvlCanonical = alias[lvlNorm] || lvlNorm;
    if (lvlCanonical === target) {
      return Number(lvl.pengali) || 1;
    }
  }
  const bawaan = { reguler: 1, silver: 1.2, gold: 1.5, platinum: 2 };
  return bawaan[target] || 1;
}

/**
 * Evaluasi kenaikan level member berdasarkan total belanja baru.
 * Hanya menaikkan level secara otomatis dan TIDAK PERNAH menurunkan level member yang sudah lebih tinggi.
 */
function evaluasiLevelMember_(levelLama, totalBelanjaBaru, pengaturan) {
  const rankMap = { reguler: 0, silver: 1, perak: 1, gold: 2, emas: 2, platinum: 3 };
  const namaKanonik = { perak: 'Silver', silver: 'Silver', emas: 'Gold', gold: 'Gold', platinum: 'Platinum', reguler: 'Reguler' };

  const lamaRaw = String(levelLama || 'Reguler').trim();
  const lamaKey = lamaRaw.toLowerCase();
  let levelTerbaik = namaKanonik[lamaKey] || lamaRaw || 'Reguler';
  let rankTerbaik = rankMap[lamaKey] !== undefined ? rankMap[lamaKey] : 0;

  const daftar = Array.isArray(pengaturan && pengaturan.level_member) && pengaturan.level_member.length
    ? pengaturan.level_member
    : PENGATURAN_DEFAULT.level_member;

  daftar.forEach(function (lvl) {
    const minBelanja = Number(lvl && lvl.min_belanja) || 0;
    if (totalBelanjaBaru >= minBelanja) {
      const k = String(lvl.nama || '').trim().toLowerCase();
      const r = rankMap[k] !== undefined ? rankMap[k] : 0;
      if (r > rankTerbaik) {
        rankTerbaik = r;
        levelTerbaik = namaKanonik[k] || lvl.nama;
      }
    }
  });
  return levelTerbaik;
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
  /** Qty boleh nol: >= 0, maks 3 digit desimal (cth: stok opname fisik kosong). */
  qtyNol: function (nilai, label, opsi) {
    const n = V_.angka(nilai, label, Object.assign({ wajib: true, min: 0 }, opsi || {}));
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
    // 1 RPC getSheets() jauh lebih cepat daripada 27 panggilan getSheetByName()
    const namaAda = {};
    ss.getSheets().forEach(function (sh) { namaAda[sh.getName()] = true; });
    dbSiap = Object.keys(SKEMA).every(function (n) { return !!namaAda[n]; });
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

/** Bersihkan sesi kedaluwarsa di sheet Sesi agar verifikasi login tetap ringan. */
function bersihkanSesiKedaluwarsa_() {
  const sekarangMs = Date.now();
  const semuaSesi = bacaSemua_('Sesi');
  const perubahan = [];
  semuaSesi.forEach(function (s) {
    if (!s.kedaluwarsa) return;
    const tExp = new Date(String(s.kedaluwarsa).replace(' ', 'T')).getTime();
    if (isFinite(tExp) && tExp < sekarangMs) {
      perubahan.push({ id: s.id, data: { deleted: true } });
    }
  });
  if (perubahan.length) {
    ubahBaris_('Sesi', perubahan, 'sistem');
  }
  return perubahan.length;
}

/** sistem.maintenance — Segarkan cache server, bersihkan sesi kedaluwarsa, & cek kesehatan DB (Owner/Admin). */
function aksiSistemMaintenance_(ctx) {
  const namaMaster = Object.keys(MASTER_CACHE_SHEETS);
  namaMaster.forEach(function (n) { cacheHapus_('sh_v1_' + n); });
  cacheHapus_('pengaturan');

  const sesiDibersihkan = bersihkanSesiKedaluwarsa_();

  const ringkasan = {
    produk: bacaSemua_('Produk', { lewatCache: true }).length,
    kategori: bacaSemua_('Kategori', { lewatCache: true }).length,
    pelanggan: bacaSemua_('Pelanggan', { lewatCache: true }).length,
    penjualan: bacaSemua_('Penjualan').length,
    pembelian: bacaSemua_('Pembelian').length,
    sesi_aktif: bacaSemua_('Sesi').length
  };

  catatAudit_(ctx.user.id, 'sistem_maintenance', 'SISTEM', '', {
    cache_dibersihkan: namaMaster.length,
    sesi_dibersihkan: sesiDibersihkan
  });

  return {
    pesan: 'Perawatan server dan penyegaran cache berhasil.',
    cache_dibersihkan: namaMaster.length,
    sesi_dibersihkan: sesiDibersihkan,
    ringkasan_db: ringkasan,
    waktu_server: sekarang_()
  };
}

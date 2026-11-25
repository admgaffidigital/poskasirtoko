/**
 * test_debug_final.js — Suite Audit & Debugging Final POS Kasir Toko Bangunan
 * Menguji seluruh skenario batas (edge cases):
 * 1. Zero Division (Omset 0, Transaksi 0, Poin per rupiah 0, Diskon 100%)
 * 2. Fresh Database / Zero Data (semua laporan & modul berjalan tanpa exception)
 * 3. Soft-Delete Exclusion (semua sheet memastikan data deleted diabaikan)
 * 4. Matriks Otorisasi Peran Lengkap (Owner vs Admin vs Kasir)
 * 5. Ketahanan Malformed Request & Invalid Token di doPost
 * 6. Konsistensi Stok, Void, dan Arus Kas
 */

const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

function chain() {
  const o = {};
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setHorizontalAlignment',
   'setWrap', 'setValues', 'setValue', 'setFontColor'].forEach(m => { o[m] = () => o; });
  return o;
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.maxRows = 1000;
    this.maxCols = 30;
    this.formatTeks = new Set();
    this.formulaDitulis = 0;
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) {
      const row = this.data[r];
      if (row && row.some(v => v !== '' && v !== undefined && v !== null)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.data.forEach(row => (row || []).forEach((v, i) => {
      if (v !== '' && v !== undefined && v !== null) m = Math.max(m, i + 1);
    }));
    return m;
  }
  insertRowsAfter(_, n) { this.maxRows += n; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  setFrozenRows() {}
  getRangeList(list) {
    const self = this;
    return {
      setNumberFormat(f) {
        if (f === '@') list.forEach(a => self.formatTeks.add(a));
        return this;
      }
    };
  }
  getRange(r, c, nr = 1, nc = 1) {
    if (r < 1 || c < 1 || r + nr - 1 > this.maxRows || c + nc - 1 > this.maxCols) {
      throw new Error(`Range out of bounds ${this.name}: r${r} c${c} nr${nr} nc${nc}`);
    }
    const sh = this;
    const o = chain();
    o.getValues = () => {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const row = [];
        for (let j = 0; j < nc; j++) {
          const v = (sh.data[r - 1 + i] || [])[c - 1 + j];
          row.push(v === undefined ? '' : v);
        }
        out.push(row);
      }
      return out;
    };
    o.setValues = (vals) => {
      if (vals.length !== nr || vals.some(x => x.length !== nc)) throw new Error('Dimensi setValues tidak cocok');
      vals.forEach((row, i) => {
        const idx = r - 1 + i;
        sh.data[idx] = sh.data[idx] || [];
        row.forEach((v, j) => {
          let simpan = v;
          if (typeof v === 'string' && v.startsWith("'")) simpan = v.substring(1);
          sh.data[idx][c - 1 + j] = simpan;
        });
      });
      return o;
    };
    return o;
  }
}

class MockSS {
  constructor() { this.sheets = [new MockSheet('Sheet1')]; this.tz = 'Asia/Jakarta'; }
  getId() { return 'SSID'; }
  getName() { return 'DB POS'; }
  setSpreadsheetTimeZone(t) { this.tz = t; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(n) { const s = new MockSheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

function setupMockEnv() {
  const ss = new MockSS();
  const cacheMap = new Map();
  const props = new Map();
  const lock = {
    tryLock: () => true,
    waitLock: () => true,
    releaseLock: () => {}
  };

  function fmtDate(d, tz, pola) {
    const w = new Date(d.getTime() + 7 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    return pola.replace('yyyy', w.getUTCFullYear()).replace('MM', p(w.getUTCMonth() + 1)).replace('dd', p(w.getUTCDate()))
      .replace('HH', p(w.getUTCHours())).replace('mm', p(w.getUTCMinutes())).replace('ss', p(w.getUTCSeconds()));
  }

  const sandbox = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Number: Number,
    String: String,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    parseInt: parseInt,
    isFinite: isFinite,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      flush: () => {},
      getUi: () => { throw new Error('no ui'); }
    },
    DriveApp: {
      getFolderById: (id) => ({
        createFile: (blob) => ({
          getId: () => 'mock-drive-id-12345',
          getUrl: () => 'https://drive.google.com/file/d/mock-drive-id-12345/view',
          getName: () => blob.getName ? blob.getName() : 'foto.jpg',
          setSharing: () => {}
        })
      }),
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' }
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: fmtDate,
      computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      base64Decode: (str) => Buffer.from(str, 'base64'),
      newBlob: (bytes, mime, name) => ({
        getBytes: () => bytes,
        getContentType: () => mime,
        getName: () => name
      })
    },
    LockService: {
      getScriptLock: () => lock
    },
    CacheService: {
      getScriptCache: () => ({
        putAll(o) { Object.entries(o).forEach(([k, v]) => cacheMap.set(k, v)); },
        get: k => cacheMap.has(k) ? cacheMap.get(k) : null,
        getAll(ks) { const o = {}; ks.forEach(k => { if (cacheMap.has(k)) o[k] = cacheMap.get(k); }); return o; },
        put: (k, v) => cacheMap.set(k, v),
        remove: k => cacheMap.delete(k),
        removeAll: ks => ks.forEach(k => cacheMap.delete(k))
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => props.has(k) ? props.get(k) : null,
        setProperty: (k, v) => props.set(k, String(v))
      })
    },
    ContentService: {
      createTextOutput: s => ({
        content: s,
        mime: '',
        setMimeType: function (m) { this.mime = m; return this; }
      }),
      MimeType: { JSON: 'application/json' }
    }
  };

  const code = require('./_load_gas')();
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  sandbox.ss = ss;
  return sandbox;
}

async function runAudit() {
  console.log('🚀 MEMULAI AUDIT DEBUGGING FINAL & STRESS TEST...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error('     Error:', e.message);
      failed++;
    }
  }

  const app = setupMockEnv();
  const callApi = (action, token, payload) => JSON.parse(app.doPost({
    postData: { contents: JSON.stringify({ action: action, token: token, payload: payload }) }
  }).content);

  // Test Skenario 1: Database Setup
  test('1. Setup Database Baru Berjalan Mulus', () => {
    app.setupDatabase();
    const sheets = app.ss.getSheets().map(s => s.name);
    assert.strictEqual(sheets.includes('Sheet1'), false, 'Sheet1 bawaan harus dihapus');
    assert.strictEqual(sheets.includes('Users'), true);
    assert.strictEqual(sheets.includes('Penjualan'), true);
    assert.strictEqual(sheets.includes('Pembelian'), true);
    assert.strictEqual(sheets.includes('Log_Audit'), true);
    const ownerInit = app.bacaSemua_('Users').find(u => u.username === 'owner');
    app.aksiPengaturanSet_({ user: ownerInit, payload: { wajib_buka_shift: false } });
  });

  // Ambil token owner pertama
  let tokenOwner = '';
  let tokenAdmin = '';
  let tokenKasir = '';

  test('2. Autentikasi Pengguna & Penegakan Wajib Ganti PIN', () => {
    const users = app.bacaSemua_('Users');
    const owner = users.find(u => u.username === 'owner');
    assert(owner, 'Akun owner harus dibuat saat setup');
    assert.strictEqual(owner.wajib_ganti_pin, true, 'Akun awal wajib_ganti_pin = true');

    // Login owner (kita set pin_hash baru agar dapat login deterministik)
    const saltBaru = 'test_salt_123';
    const pinBaru = '123456';
    const hash = app.hashPin_(pinBaru, saltBaru);

    app.ubahBaris_('Users', [{
      id: owner.id,
      data: { pin_hash: hash, salt: saltBaru, wajib_ganti_pin: true }
    }], 'sistem');

    const resLogin = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'owner', pin: '123456' } }) }
    }).content);

    assert.strictEqual(resLogin.ok, true);
    assert.strictEqual(resLogin.data.user.wajib_ganti_pin, true);
    tokenOwner = resLogin.data.token;

    // Ganti PIN
    const resGanti = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'auth.gantiPin',
          token: tokenOwner,
          payload: { pin_lama: '123456', pin_baru: '654321' }
        })
      }
    }).content);

    assert.strictEqual(resGanti.ok, true, 'auth.gantiPin berhasil');
    const ownerUpdated = app.cariById_('Users', owner.id);
    assert.strictEqual(ownerUpdated.wajib_ganti_pin, false, 'wajib_ganti_pin harus jadi false');

    // Buat akun Admin & Kasir untuk pengujian matriks peran
    const resAddAdmin = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'user.create',
          token: tokenOwner,
          payload: { username: 'admin1', nama: 'Admin Toko', role: 'admin', pin: '111111' }
        })
      }
    }).content);
    assert.strictEqual(resAddAdmin.ok, true);

    const resAddKasir = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'user.create',
          token: tokenOwner,
          payload: { username: 'kasir1', nama: 'Kasir Toko', role: 'kasir', pin: '222222' }
        })
      }
    }).content);
    assert.strictEqual(resAddKasir.ok, true);

    // Login Admin
    const loginAdmin = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'admin1', pin: '111111' } }) }
    }).content);
    tokenAdmin = loginAdmin.data.token;

    // Login Kasir
    const loginKasir = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'kasir1', pin: '222222' } }) }
    }).content);
    tokenKasir = loginKasir.data.token;
  });

  // Test Skenario 3: Zero Division pada Database Kosong (Fresh Install)
  test('3. Semua Laporan Berjalan Mulus pada Database Kosong (Tanpa Transaksi)', () => {
    // Dashboard Owner
    const dashOwner = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.dashboard', token: tokenOwner, payload: {} }) }
    }).content);
    assert.strictEqual(dashOwner.ok, true);
    assert.strictEqual(dashOwner.data.ringkasan.total_penjualan, 0);
    assert.strictEqual(dashOwner.data.ringkasan.laba_kotor, 0);
    assert.strictEqual(dashOwner.data.ringkasan.margin_persen, 0);
    assert.strictEqual(dashOwner.data.ringkasan.total_nilai_aset_stok, 0);
    assert.strictEqual(Array.isArray(dashOwner.data.produk_terlaris), true);
    assert.strictEqual(dashOwner.data.produk_terlaris.length, 0);
    assert.strictEqual(Array.isArray(dashOwner.data.tren), true);

    // Dashboard Admin (Laba & Aset Masked)
    const dashAdmin = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.dashboard', token: tokenAdmin, payload: {} }) }
    }).content);
    assert.strictEqual(dashAdmin.ok, true);
    assert.strictEqual(dashAdmin.data.ringkasan.laba_kotor, null);
    assert.strictEqual(dashAdmin.data.ringkasan.margin_persen, null);
    assert.strictEqual(dashAdmin.data.ringkasan.total_nilai_aset_stok, null);

    // Laporan Penjualan
    const lapJual = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.penjualan', token: tokenOwner, payload: {} }) }
    }).content);
    assert.strictEqual(lapJual.ok, true);
    assert.strictEqual(lapJual.data.ringkasan.total_omset, 0);

    // Laporan Pembelian
    const lapBeli = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.pembelian', token: tokenOwner, payload: {} }) }
    }).content);
    assert.strictEqual(lapBeli.ok, true);
    assert.strictEqual(lapBeli.data.ringkasan.total_pembelian, 0);

    // Laporan Laba Rugi
    const lapLR = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.labaRugi', token: tokenOwner, payload: {} }) }
    }).content);
    assert.strictEqual(lapLR.ok, true);
    assert.strictEqual(lapLR.data.ringkasan.omset_bersih, 0);
    assert.strictEqual(lapLR.data.ringkasan.margin_persen, 0);

    // Laporan Arus Kas
    const lapKas = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.arusKas', token: tokenOwner, payload: {} }) }
    }).content);
    assert.strictEqual(lapKas.ok, true);
    assert.strictEqual(lapKas.data.ringkasan.total_kas_masuk, 0);
    assert.strictEqual(lapKas.data.ringkasan.total_kas_keluar, 0);

    // Laporan Valuasi Stok
    const lapStok = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.stokValuasi', token: tokenOwner, payload: {} }) }
    }).content);
    assert.strictEqual(lapStok.ok, true);
    assert.strictEqual(lapStok.data.ringkasan.total_nilai_aset, 0);
  });

  // Test Skenario 4: Matriks Akses Peran Lengkap
  test('4. Penegakan Hak Akses Peran (Owner vs Admin vs Kasir)', () => {
    // 1. Kasir mencoba akses laporan laba rugi -> DITOLAK
    const resKasirLR = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.labaRugi', token: tokenKasir, payload: {} }) }
    }).content);
    assert.strictEqual(resKasirLR.ok, false);
    assert.strictEqual(resKasirLR.code, 'FORBIDDEN');

    // 2. Admin mencoba akses laporan laba rugi -> DITOLAK
    const resAdminLR = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'laporan.labaRugi', token: tokenAdmin, payload: {} }) }
    }).content);
    assert.strictEqual(resAdminLR.ok, false);
    assert.strictEqual(resAdminLR.code, 'FORBIDDEN');

    // 3. Kasir mencoba akses manajemen user -> DITOLAK
    const resKasirUser = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'user.list', token: tokenKasir, payload: {} }) }
    }).content);
    assert.strictEqual(resKasirUser.ok, false);
    assert.strictEqual(resKasirUser.code, 'FORBIDDEN');

    // 4. Admin mencoba akses manajemen user -> DITOLAK
    const resAdminUser = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'user.list', token: tokenAdmin, payload: {} }) }
    }).content);
    assert.strictEqual(resAdminUser.ok, false);
    assert.strictEqual(resAdminUser.code, 'FORBIDDEN');

    // 5. Kasir mencoba akses ubah pengaturan toko -> DITOLAK
    const resKasirPeng = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'pengaturan.set', token: tokenKasir, payload: { toko_nama: 'Toko Kasir' } }) }
    }).content);
    assert.strictEqual(resKasirPeng.ok, false);
    assert.strictEqual(resKasirPeng.code, 'FORBIDDEN');

    // 6. Admin mencoba akses ubah pengaturan toko -> DITOLAK
    const resAdminPeng = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'pengaturan.set', token: tokenAdmin, payload: { toko_nama: 'Toko Admin' } }) }
    }).content);
    assert.strictEqual(resAdminPeng.ok, false);
    assert.strictEqual(resAdminPeng.code, 'FORBIDDEN');

    // 7. Kasir mencoba buat faktur pembelian -> DITOLAK
    const resKasirBeli = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'pembelian.create', token: tokenKasir, payload: {} }) }
    }).content);
    assert.strictEqual(resKasirBeli.ok, false);
    assert.strictEqual(resKasirBeli.code, 'FORBIDDEN');

    // 8. Kasir mencoba approve stok opname -> DITOLAK
    const resKasirOpname = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'opname.approve', token: tokenKasir, payload: { opname_id: 'OP-1' } }) }
    }).content);
    assert.strictEqual(resKasirOpname.ok, false);
    assert.strictEqual(resKasirOpname.code, 'FORBIDDEN');
  });

  // Test Skenario 5: Edge Cases Perhitungan Matematika & Transaksi
  let produkSemenId = '';
  test('5. Pembuatan Master Data & Edge Cases Perhitungan (Diskon 100%, Moving Average Stok Minus)', () => {
    // Buat kategori
    const resKat = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'kategori.create',
          token: tokenOwner,
          payload: { nama: 'Material Semen' }
        })
      }
    }).content);
    assert.strictEqual(resKat.ok, true);
    const katId = resKat.data.id;

    // Buat Produk dengan stok awal 20 sak
    const resProd = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'produk.create',
          token: tokenOwner,
          payload: {
            nama: 'Semen Holcim 50kg',
            kategori_id: katId,
            satuan_dasar: 'sak',
            harga_ritel: 60000,
            hpp: 50000,
            stok: 20,
            stok_min: 5
          }
        })
      }
    }).content);
    assert.strictEqual(resProd.ok, true);
    produkSemenId = resProd.data.id;

    // Moving average saat stok lama = -2 (stok minus), qty masuk = 10, harga beli = 52000
    const hppBaruMinus = app.hitungHppBaru_(-2, 50000, 10, 52000);
    assert.strictEqual(hppBaruMinus, 52000, 'Jika stok lama <= 0, HPP baru harus sama dengan harga beli');

    // Moving average saat qtyMasuk = 0
    const hppNolQty = app.hitungHppBaru_(10, 50000, 0, 52000);
    assert.strictEqual(hppNolQty, 50000, 'Jika qty masuk <= 0, HPP tidak boleh berubah');

    // Normal moving average: 10 sak @ 50.000 + 10 sak @ 55.000 = 20 sak @ 52.500
    const hppNormal = app.hitungHppBaru_(10, 50000, 10, 55000);
    assert.strictEqual(hppNormal, 52500);
  });

  test('6. Kasir Ditolak Memberi Diskon Melebihi Batas (10%)', () => {
    // Kasir mencoba beri diskon 20%
    const resDiskonKelebihan = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'penjualan.create',
          token: tokenKasir,
          payload: {
            items: [{ produk_id: produkSemenId, qty: 1, harga: 60000, diskon_tipe: 'persen', diskon_nilai: 20 }],
            pembayaran: [{ metode: 'tunai', jumlah: 48000 }]
          }
        })
      }
    }).content);
    assert.strictEqual(resDiskonKelebihan.ok, false);
    assert.strictEqual(resDiskonKelebihan.code, 'FORBIDDEN');
  });

  test('7. Pembelian Stok Masuk & Penjualan Diskon 100% (Sample / Promo Gratis)', () => {
    // Tambah Supplier
    const resSup = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'supplier.create',
          token: tokenOwner,
          payload: { nama: 'Distributor Semen Maju' }
        })
      }
    }).content);
    assert.strictEqual(resSup.ok, true);
    const supId = resSup.data.supplier.id;

    // Pembelian 10 sak @ 50.000
    const resBeli = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'pembelian.create',
          token: tokenOwner,
          payload: {
            supplier_id: supId,
            items: [{ produk_id: produkSemenId, qty: 10, satuan: 'sak', harga_beli: 50000 }],
            bayar: 500000
          }
        })
      }
    }).content);
    assert.strictEqual(resBeli.ok, true);

    const semenSetelahBeli = app.cariById_('Produk', produkSemenId);
    assert.strictEqual(semenSetelahBeli.stok, 30); // 20 + 10

    // Uji Aturan Bisnis #1: Diskon 100% pada barang ber-HPP > 0 DITOLAK
    const resSampleTolak = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'penjualan.create',
          token: tokenKasir,
          payload: {
            items: [{ produk_id: produkSemenId, qty: 1, harga: 60000, diskon_tipe: 'persen', diskon_nilai: 100 }],
            pembayaran: [{ metode: 'tunai', jumlah: 0 }]
          }
        })
      }
    }).content);
    assert.strictEqual(resSampleTolak.ok, false);
    assert.strictEqual(resSampleTolak.code, 'FORBIDDEN'); // Kasir diskon > 10%

    // Penjualan oleh Owner dengan Diskon Wajar (Harga 60k - diskon 10k = 50k == HPP)
    const resSampleOwner = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'penjualan.create',
          token: tokenOwner,
          payload: {
            items: [{ produk_id: produkSemenId, qty: 1, harga: 60000, diskon_tipe: 'nominal', diskon_nilai: 10000 }],
            pembayaran: [{ metode: 'tunai', jumlah: 50000 }]
          }
        })
      }
    }).content);
    assert.strictEqual(resSampleOwner.ok, true, 'Penjualan sama dengan HPP diperbolehkan');
    assert.strictEqual(resSampleOwner.data.penjualan.total, 50000);

    // Stok berkurang jadi 29
    const semenSetelahSample = app.cariById_('Produk', produkSemenId);
    assert.strictEqual(semenSetelahSample.stok, 29);
  });

  test('8. Penjualan Normal, Tempo, dan Pelunasan Piutang Terintegrasi', () => {
    // Tambah Member dengan limit_kredit Rp 5.000.000
    const resPel = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'pelanggan.create',
          token: tokenOwner,
          payload: { nama: 'Haji Dul', hp: '081234567890', tipe: 'member', limit_kredit: 5000000 }
        })
      }
    }).content);
    assert.strictEqual(resPel.ok, true);
    const pelId = resPel.data.pelanggan.id;
    console.log('PEL ID:', pelId, 'PEL OBJ:', app.cariById_('Pelanggan', pelId));

    // Jual 5 sak tempo ke Haji Dul (5 * 60.000 = 300.000, bayar DP 100.000 tunai, sisa piutang tempo 200.000)
    const resJualTempo = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'penjualan.create',
          token: tokenKasir,
          payload: {
            pelanggan_id: pelId,
            items: [{ produk_id: produkSemenId, qty: 5, harga: 60000 }],
            pembayaran: [
              { metode: 'tunai', jumlah: 100000 },
              { metode: 'tempo', jumlah: 200000 }
            ]
          }
        })
      }
    }).content);
    if (!resJualTempo.ok) console.error('RES JUAL TEMPO ERR:', resJualTempo);
    assert.strictEqual(resJualTempo.ok, true);
    assert.strictEqual(resJualTempo.data.penjualan.status_bayar, 'sebagian');

    // Piutang tercatat
    const piutangs = app.bacaSemua_('Piutang');
    const piutangDul = piutangs.find(p => p.pelanggan_id === pelId && !p.deleted);
    assert(piutangDul);
    assert.strictEqual(piutangDul.sisa, 200000);

    // Pelunasan Piutang via Kasir (200.000 transfer)
    const resLunas = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'piutang.bayar',
          token: tokenKasir,
          payload: {
            id: piutangDul.id,
            jumlah: 200000,
            metode: 'transfer',
            catatan: 'Pelunasan transfer BCA'
          }
        })
      }
    }).content);
    if (!resLunas.ok) console.error('RES LUNAS ERR:', resLunas);
    assert.strictEqual(resLunas.ok, true);
    assert.strictEqual(resLunas.data.status, 'lunas');
    assert.strictEqual(resLunas.data.sisa, 0);

    // Poin member harus bertambah dari pelunasan tempo
    const dulUpdated = app.cariById_('Pelanggan', pelId);
    assert(dulUpdated.poin > 0, 'Member mendapat poin dari pelunasan tempo');
  });

  test('9. Void Transaksi Mengembalikan Stok & Membatalkan Piutang', () => {
    // Catat penjualan tunai 2 sak
    const resJual = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'penjualan.create',
          token: tokenKasir,
          payload: {
            items: [{ produk_id: produkSemenId, qty: 2, harga: 60000 }],
            pembayaran: [{ metode: 'tunai', jumlah: 120000 }]
          }
        })
      }
    }).content);
    if (!resJual.ok) console.error('RES JUAL ERR:', resJual);
    assert.strictEqual(resJual.ok, true);

    const stokSebelumVoid = app.cariById_('Produk', produkSemenId).stok;

    // Void oleh Owner
    const resVoid = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'penjualan.void',
          token: tokenOwner,
          payload: {
            id: resJual.data.penjualan.id,
            alasan: 'Salah input kasir pelanggan batal'
          }
        })
      }
    }).content);
    assert.strictEqual(resVoid.ok, true);

    const semenSetelahVoid = app.cariById_('Produk', produkSemenId);
    assert.strictEqual(semenSetelahVoid.stok, stokSebelumVoid + 2, 'Stok harus kembali utuh setelah nota divoid');
  });

  test('10. Soft-Delete Integrity (Kategori, Produk, Supplier, Sesi)', () => {
    // 1. Kategori soft-delete
    const resKat = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'kategori.create',
          token: tokenOwner,
          payload: { nama: 'Kategori Uji Hapus' }
        })
      }
    }).content);
    const delKatId = resKat.data.id;

    const resDelKat = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'kategori.delete',
          token: tokenOwner,
          payload: { id: delKatId }
        })
      }
    }).content);
    assert.strictEqual(resDelKat.ok, true);

    const listKat = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'kategori.list', token: tokenOwner, payload: {} }) }
    }).content);
    const adaDiListKat = listKat.data.items.some(k => k.id === delKatId);
    assert.strictEqual(adaDiListKat, false, 'Kategori yang dihapus lunak tidak boleh muncul di list');

    // 2. Produk soft-delete
    const resProdBaru = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'produk.create',
          token: tokenOwner,
          payload: {
            nama: 'Produk Uji Hapus',
            satuan_dasar: 'pcs',
            harga_ritel: 15000,
            hpp: 10000,
            stok: 5
          }
        })
      }
    }).content);
    const delProdId = resProdBaru.data.id;

    const resDelProd = JSON.parse(app.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'produk.delete',
          token: tokenOwner,
          payload: { id: delProdId }
        })
      }
    }).content);
    assert.strictEqual(resDelProd.ok, true);

    const listProd = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'produk.list', token: tokenOwner, payload: {} }) }
    }).content);
    const adaDiListProd = listProd.data.items.some(p => p.id === delProdId);
    assert.strictEqual(adaDiListProd, false, 'Produk yang dihapus lunak tidak boleh muncul di list');
  });

  test('11. Ketahanan Malformed Request, Bad JSON, & Invalid Token', () => {
    // Request kosong
    const resKosong = JSON.parse(app.doPost({ postData: { contents: '' } }).content);
    assert.strictEqual(resKosong.ok, false);
    assert.strictEqual(resKosong.code, 'VALIDATION');

    // Request non-JSON
    const resBadJson = JSON.parse(app.doPost({ postData: { contents: 'NOT_A_JSON' } }).content);
    assert.strictEqual(resBadJson.ok, false);
    assert.strictEqual(resBadJson.code, 'VALIDATION');

    // Action tidak terdaftar
    const resAksiPalsu = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'hacker.injection', payload: {} }) }
    }).content);
    assert.strictEqual(resAksiPalsu.ok, false);
    assert.strictEqual(resAksiPalsu.code, 'NOT_FOUND');

    // Token palsu
    const resTokenPalsu = JSON.parse(app.doPost({
      postData: { contents: JSON.stringify({ action: 'produk.list', token: 'TOKEN_PALSU_XYZ', payload: {} }) }
    }).content);
    assert.strictEqual(resTokenPalsu.ok, false);
    assert.strictEqual(resTokenPalsu.code, 'AUTH_INVALID');

    // GET Request Cek Status
    const resGet = JSON.parse(app.doGet().content);
    assert.strictEqual(resGet.ok, true);
    assert.strictEqual(resGet.data.versi, '1.0.0');
  });

  test('12. Auto-Generate SKU, Barcode EAN-13, Kode Member, dan Normalisasi HP Member', () => {
    // 1. Produk tanpa SKU & Barcode otomatis dibuatkan oleh backend
    const resPrdAuto = callApi('produk.create', tokenOwner, {
      nama: 'Triplek Meranti 9mm Super',
      kategori_id: '',
      satuan_dasar: 'lembar',
      hpp: 85000,
      harga_ritel: 110000,
      punya_varian: true,
      varian: [
        { nama_varian: 'Ukuran Standar 122x244', harga_ritel: 110000, stok: 20 }
      ],
      satuan_konversi: [
        { satuan: 'Ikat (5 lbr)', faktor: 5, harga_ritel: 525000 }
      ]
    });
    assert.strictEqual(resPrdAuto.ok, true, 'Produk auto-generate harus sukses dibuat');
    const pData = resPrdAuto.data;
    assert.ok(pData.sku && pData.sku.startsWith('SKU-'), 'SKU induk otomatis dibuat');
    assert.strictEqual(pData.barcode.length, 13, 'Barcode EAN-13 induk 13 digit');
    assert.ok(pData.barcode.startsWith('20'), 'Barcode in-house diawali 20');

    // Cek varian & satuan di DB
    const semuaVarian = app.bacaSemua_('Varian').filter(v => v.produk_id === pData.id);
    assert.strictEqual(semuaVarian.length, 1);
    assert.ok(semuaVarian[0].sku.startsWith(pData.sku + '-V'), 'SKU varian diturunkan dari SKU induk');
    assert.strictEqual(semuaVarian[0].barcode.length, 13, 'Barcode varian 13 digit EAN-13');

    const semuaSatuan = app.bacaSemua_('Satuan_Konversi').filter(s => s.produk_id === pData.id);
    assert.strictEqual(semuaSatuan.length, 1);
    assert.strictEqual(semuaSatuan[0].barcode.length, 13, 'Barcode satuan konversi 13 digit EAN-13');

    // 2. Member Baru dengan HP format internasional (+62) dan tanpa kode member
    const resMember1 = callApi('pelanggan.create', tokenOwner, {
      nama: 'Pak Slamet Mandiri',
      tipe: 'member',
      hp: '+62 878-9988-7766',
      limit_kredit: 10000000
    });
    assert.strictEqual(resMember1.ok, true, 'Member baru harus berhasil disimpan');
    const m1 = resMember1.data.pelanggan;
    assert.ok(m1.kode && m1.kode.startsWith('MBR-'), 'Kode member otomatis di-generate');
    assert.strictEqual(m1.hp, '087899887766', 'Nomor HP dinormalisasi ke 08...');

    // 3. Mendaftar nomor yang sama dengan format berbeda (62878... spasi) harus ditolak informatif
    const resDuplikat = callApi('pelanggan.create', tokenOwner, {
      nama: 'Slamet Palsu',
      tipe: 'member',
      hp: '62 878 9988 7766'
    });
    assert.strictEqual(resDuplikat.ok, false);
    assert.strictEqual(resDuplikat.code, 'CONFLICT');
    assert.ok(resDuplikat.error.includes('Pak Slamet Mandiri'), 'Pesan error menyebutkan nama member yang bentrok');
    assert.ok(resDuplikat.error.includes(m1.kode), 'Pesan error menyebutkan kode member yang bentrok');

    // 4. Nomor HP pada member nonaktif tidak memblokir pendaftaran member baru
    const resMemberNonaktif = callApi('pelanggan.create', tokenOwner, {
      nama: 'Member Inaktif Lama',
      tipe: 'member',
      hp: '085511223344',
      aktif: false
    });
    assert.strictEqual(resMemberNonaktif.ok, true);

    const resMemberBaruPakaiHpSama = callApi('pelanggan.create', tokenOwner, {
      nama: 'Member Aktif Baru',
      tipe: 'member',
      hp: '+6285511223344'
    });
    assert.strictEqual(resMemberBaruPakaiHpSama.ok, true, 'Nomor dari member nonaktif tidak memblokir member baru');
  });

  test('13. Kustomisasi Identitas Toko Dinamis (Pengaturan, Struk, Sesi Login, & Penjualan)', () => {
    // 1. Owner mengubah identitas toko di Pengaturan
    const resSetPengaturan = callApi('pengaturan.set', tokenOwner, {
      toko_nama: 'TB BINTANG TIMUR JAYA',
      toko_alamat: 'Jl. Ahmad Yani No. 99, Surabaya',
      toko_hp: '081299887766',
      nota_footer: 'Barang yang sudah dibeli tidak dapat ditukar kecuali perjanjian awal.'
    });
    assert.strictEqual(resSetPengaturan.ok, true, 'Pengaturan identitas toko berhasil diubah');
    assert.strictEqual(resSetPengaturan.data.pengaturan.toko_nama, 'TB BINTANG TIMUR JAYA');
    assert.strictEqual(resSetPengaturan.data.toko.nama, 'TB BINTANG TIMUR JAYA');

    // 2. pengaturan.get harus mengembalikan identitas toko terbaru
    const resGetPengaturan = callApi('pengaturan.get', tokenOwner, {});
    assert.strictEqual(resGetPengaturan.ok, true);
    assert.strictEqual(resGetPengaturan.data.toko.nama, 'TB BINTANG TIMUR JAYA');
    assert.strictEqual(resGetPengaturan.data.toko.hp, '081299887766');

    // 3. auth.me dan auth.login mengembalikan toko identitas terbaru
    const resMe = callApi('auth.me', tokenOwner, {});
    assert.strictEqual(resMe.ok, true);
    assert.strictEqual(resMe.data.toko.nama, 'TB BINTANG TIMUR JAYA');

    // 4. Transaksi penjualan baru otomatis menyertakan identitas toko yang telah diubah
    const resJual = callApi('penjualan.create', tokenKasir, {
      items: [{ produk_id: produkSemenId, qty: 1, harga: 60000 }],
      pembayaran: [{ metode: 'tunai', jumlah: 60000 }]
    });
    assert.strictEqual(resJual.ok, true);
    assert.strictEqual(resJual.data.toko.nama, 'TB BINTANG TIMUR JAYA', 'Struk penjualan baru harus memuat nama toko kustom');

    // 5. penjualan.detail untuk cetak ulang juga menyertakan identitas toko terbaru
    const resDetailJual = callApi('penjualan.detail', tokenKasir, { id: resJual.data.penjualan.id });
    assert.strictEqual(resDetailJual.ok, true);
    assert.strictEqual(resDetailJual.data.toko.nama, 'TB BINTANG TIMUR JAYA', 'Detail nota untuk cetak ulang memuat identitas toko kustom');

    // 6. penjualan.list untuk mencari riwayat penjualan berdasarkan no_nota atau nama pelanggan
    const resListJual = callApi('penjualan.list', tokenKasir, { cari: resJual.data.penjualan.no_nota });
    assert.strictEqual(resListJual.ok, true);
    assert.strictEqual(resListJual.data.items.length, 1);
    assert.strictEqual(resListJual.data.items[0].no_nota, resJual.data.penjualan.no_nota);
  });

  test('14. Integrasi Upload Foto Produk ke Google Drive & Penyimpanan Foto URL Produk', () => {
    // 1. Upload foto produk base64 ke Google Drive
    const mockBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const resUpload = callApi('produk.uploadFoto', tokenOwner, {
      nama_file: 'semen_tiga_roda_50kg.jpg',
      base64: mockBase64
    });
    assert.strictEqual(resUpload.ok, true, 'Upload foto produk ke Google Drive berhasil');
    assert.strictEqual(resUpload.data.file_id, 'mock-drive-id-12345');
    assert.strictEqual(resUpload.data.foto_url, 'https://lh3.googleusercontent.com/d/mock-drive-id-12345');

    // 2. Buat produk baru dengan foto_url dari Google Drive
    const resPrdFoto = callApi('produk.create', tokenOwner, {
      nama: 'Semen Tiga Roda 50kg Berfoto',
      kategori_id: '',
      satuan_dasar: 'sak',
      hpp: 55000,
      harga_ritel: 68000,
      stok: 100,
      foto_url: resUpload.data.foto_url
    });
    assert.strictEqual(resPrdFoto.ok, true, 'Produk berfoto berhasil dibuat');
    assert.strictEqual(resPrdFoto.data.foto_url, 'https://lh3.googleusercontent.com/d/mock-drive-id-12345');

    // 3. Pastikan produk.list mengembalikan foto_url untuk kasir & katalog
    const resListPrd = callApi('produk.list', tokenKasir, { q: 'Berfoto' });
    assert.strictEqual(resListPrd.ok, true);
    assert.ok(resListPrd.data.items.length > 0);
    assert.strictEqual(resListPrd.data.items[0].foto_url, 'https://lh3.googleusercontent.com/d/mock-drive-id-12345');
  });

  test('15. Perawatan Server (sistem.maintenance), Cache Master L2 & Pembersihan Sesi Kedaluwarsa', () => {
    // 1. Kasir tidak boleh menjalankan sistem.maintenance
    const resKasirMaint = callApi('sistem.maintenance', tokenKasir, {});
    assert.strictEqual(resKasirMaint.ok, false);
    assert.strictEqual(resKasirMaint.code, 'FORBIDDEN');

    // 2. Tambahkan 1 sesi kedaluwarsa buatan untuk memastikan pembersihan bekerja
    app.tambahBaris_('Sesi', [{
      user_id: 'u-expired-test',
      token_hash: 'hash_expired_test_123',
      kedaluwarsa: '2020-01-01 00:00:00',
      terakhir_aktif: '2020-01-01 00:00:00',
      perangkat: 'TestOld'
    }], 'sistem');

    // 3. Owner menjalankan sistem.maintenance
    const resMaint = callApi('sistem.maintenance', tokenOwner, {});
    assert.strictEqual(resMaint.ok, true, 'sistem.maintenance harus sukses untuk Owner');
    assert.ok(resMaint.data.cache_dibersihkan >= 7, 'Minimal 7 tabel master dibersihkan dari cache');
    assert.ok(resMaint.data.sesi_dibersihkan >= 1, 'Sesi kedaluwarsa harus ikut dibersihkan');
    assert.ok(resMaint.data.ringkasan_db && resMaint.data.ringkasan_db.produk > 0, 'Ringkasan DB mengembalikan jumlah produk aktif');

    // 4. Verifikasi cache L2 sheet master otomatis terinvalidasi setelah kategori.create
    const katAwal = callApi('kategori.list', tokenOwner, {});
    const jmlAwal = katAwal.data.items.length;
    const buatKat = callApi('kategori.create', tokenOwner, { nama: 'Kategori Cache L2 Uji' });
    assert.strictEqual(buatKat.ok, true);
    const katSetelah = callApi('kategori.list', tokenOwner, {});
    assert.strictEqual(katSetelah.data.items.length, jmlAwal + 1, 'Cache L2 Kategori wajib langsung segar setelah tambah data');
  });

  test('16. Akurasi Poin Loyalitas: Level Silver/Gold/Platinum, Anti-Downgrade, Piutang Lunas, & Retur Berbasis Nota Asal', () => {
    // 1. Set aturan poin Rp 10.000 = 1 poin
    const setCfg = callApi('pengaturan.set', tokenOwner, { poin_per_rupiah: 10000 });
    assert.strictEqual(setCfg.ok, true);
    assert.strictEqual(setCfg.data.pengaturan.poin_per_rupiah, 10000);

    // 2. Buat member level Gold (pengali 1.5x) dengan limit kredit Rp 1.000.000
    const resPel = callApi('pelanggan.create', tokenOwner, {
      nama: 'Member Gold Uji Poin',
      hp: '081234567891',
      tipe: 'member',
      level: 'Gold',
      limit_kredit: 1000000,
      tempo_hari: 30
    });
    assert.strictEqual(resPel.ok, true);
    const pelId = resPel.data.pelanggan.id;

    // Buat produk uji khusus dengan HPP Rp 15.000 & Harga Ritel Rp 20.000 agar angka poin 100% deterministik
    const resProdUji = callApi('produk.create', tokenOwner, {
      nama: 'Produk Uji Poin Loyalitas',
      satuan_dasar: 'Pcs',
      hpp: 15000,
      harga_ritel: 20000,
      stok: 50
    });
    assert.strictEqual(resProdUji.ok, true, 'Produk uji poin harus berhasil dibuat');
    const prod = resProdUji.data.produk || resProdUji.data;

    // 3. Transaksi Tunai Rp 100.000 (qty 5 x Rp 20.000) -> 100.000 / 10.000 * 1.5 = 15 poin
    const resTunai = callApi('penjualan.create', tokenOwner, {
      pelanggan_id: pelId,
      items: [{ produk_id: prod.id, satuan: prod.satuan_dasar, faktor: 1, qty: 5, harga: 20000, tipe_harga: 'ritel' }],
      pembayaran: [{ metode: 'tunai', jumlah: 100000 }]
    });
    assert.strictEqual(resTunai.ok, true, 'Transaksi tunai member Gold harus sukses');
    assert.strictEqual(resTunai.data.penjualan.poin_didapat, 15, 'Member Gold wajib mendapat pengali 1.5x (15 poin)');
    assert.strictEqual(resTunai.data.pelanggan.poin, 15, 'Respons penjualan.create wajib membawa saldo poin terbaru (15)');
    assert.strictEqual(resTunai.data.pelanggan.level, 'Gold', 'Level Gold tidak boleh turun otomatis menjadi Reguler');

    // 4. Transaksi Tempo Rp 100.000 -> poin saat transaksi = 0
    const resTempo = callApi('penjualan.create', tokenOwner, {
      pelanggan_id: pelId,
      items: [{ produk_id: prod.id, satuan: prod.satuan_dasar, faktor: 1, qty: 5, harga: 20000, tipe_harga: 'ritel' }],
      pembayaran: [{ metode: 'tempo', jumlah: 100000 }]
    });
    assert.strictEqual(resTempo.ok, true);
    assert.strictEqual(resTempo.data.penjualan.poin_didapat, 0, 'Transaksi tempo belum mendapat poin sebelum lunas');
    assert.strictEqual(resTempo.data.pelanggan.poin, 15, 'Saldo poin member tetap 15 saat transaksi tempo dibuat');

    // 5. Retur 2 qty (Rp 40.000) dari NOTA TEMPO (belum lunas, poin_didapat = 0) -> saldo poin TIDAK BOLEH terpotong!
    const resReturTempo = callApi('retur.create', tokenOwner, {
      tipe: 'jual',
      ref_id: resTempo.data.penjualan.id,
      pihak_id: pelId,
      alasan: 'Uji retur nota tempo belum lunas',
      metode_refund: 'potong_piutang',
      items: [{ produk_id: prod.id, nama: prod.nama, satuan: prod.satuan_dasar, faktor: 1, qty: 2, harga: 20000 }]
    });
    assert.strictEqual(resReturTempo.ok, true);
    const pelAfterReturTempo = callApi('pelanggan.detail', tokenOwner, { id: pelId });
    assert.strictEqual(pelAfterReturTempo.data.pelanggan.poin, 15, 'Retur dari nota tempo tanpa poin tidak boleh memotong poin member');

    // 6. Lunasi sisa piutang Rp 60.000 (100.000 - retur 40.000) -> dapat 60.000 / 10.000 * 1.5 = 9 poin -> saldo jadi 24
    const listPt = callApi('piutang.list', tokenOwner, { pelanggan_id: pelId });
    const ptTarget = listPt.data.items.find((pt) => pt.penjualan_id === resTempo.data.penjualan.id);
    assert.ok(ptTarget && ptTarget.sisa === 60000, 'Sisa piutang setelah retur potong piutang harus Rp 60.000');
    const resBayarPt = callApi('piutang.bayar', tokenOwner, { id: ptTarget.id, jumlah: 60000, metode: 'tunai' });
    assert.strictEqual(resBayarPt.ok, true);
    assert.strictEqual(resBayarPt.data.poin_didapat, 9, 'Pelunasan sisa piutang Rp 60.000 untuk Gold wajib menghasilkan 9 poin');
    assert.strictEqual(resBayarPt.data.poin_saldo, 24, 'Saldo poin member harus menjadi 24');

    // 7. Retur 2 qty (Rp 40.000) dari NOTA TUNAI (yang mendapat 15 poin) -> potong langsung 6 poin (40.000 / 10.000 * 1.5) -> saldo jadi 18!
    const resReturTunai = callApi('retur.create', tokenOwner, {
      tipe: 'jual',
      ref_id: resTunai.data.penjualan.id,
      pihak_id: pelId,
      alasan: 'Uji retur nota tunai berpoin',
      metode_refund: 'tunai',
      items: [{ produk_id: prod.id, nama: prod.nama, satuan: prod.satuan_dasar, faktor: 1, qty: 2, harga: 20000 }]
    });
    assert.strictEqual(resReturTunai.ok, true);
    const pelAfterReturTunai = callApi('pelanggan.detail', tokenOwner, { id: pelId });
    assert.strictEqual(pelAfterReturTunai.data.pelanggan.poin, 18, 'Retur Rp 40.000 dari nota tunai Gold wajib langsung memotong 6 poin (24 -> 18)');

    // 8. Verifikasi laporan.penjualan tidak menghitung nota berstatus void ke total_omset & total_laba
    const lapSebelumVoid = callApi('laporan.penjualan', tokenOwner, { periode: 'bulan_ini' });
    assert.strictEqual(lapSebelumVoid.ok, true);
    const omsetSebelum = lapSebelumVoid.data.ringkasan.total_omset;
    const txSebelum = lapSebelumVoid.data.ringkasan.total_transaksi;

    const jualUntukVoid = callApi('penjualan.create', tokenOwner, {
      items: [{ produk_id: prod.id, satuan: prod.satuan_dasar, faktor: 1, qty: 2, harga: 20000, tipe_harga: 'ritel' }],
      pembayaran: [{ metode: 'tunai', jumlah: 40000 }]
    });
    assert.strictEqual(jualUntukVoid.ok, true);
    const voidRes = callApi('penjualan.void', tokenOwner, { id: jualUntukVoid.data.penjualan.id, alasan: 'Uji eksklusi void di laporan' });
    assert.strictEqual(voidRes.ok, true);

    const lapSetelahVoid = callApi('laporan.penjualan', tokenOwner, { periode: 'bulan_ini' });
    assert.strictEqual(lapSetelahVoid.ok, true);
    assert.strictEqual(lapSetelahVoid.data.ringkasan.total_omset, omsetSebelum, 'Nota void TIDAK BOLEH masuk total_omset laporan.penjualan');
    assert.strictEqual(lapSetelahVoid.data.ringkasan.total_transaksi, txSebelum, 'Nota void TIDAK BOLEH masuk total_transaksi aktif');
    assert.ok(lapSetelahVoid.data.ringkasan.total_void >= 1, 'ringkasan.total_void wajib menghitung nota dibatalkan secara terpisah');
  });

  // =========================================================================
  // 17. AKURASI AKUNTANSI: ARUS KAS KEMBALIAN, LABA RETUR+HPP, GUARD QTY RETUR,
  //     SINKRONISASI STATUS POTONG PIUTANG/HUTANG, & SHIFT KASIR KOMPREHENSIF
  // =========================================================================
  await test('17. Akurasi Akuntansi: Arus Kas Bebas Kembalian, Laba Retur+HPP, Guard Qty Retur, Potong Piutang, & Shift Kasir', () => {
    const envAcc = setupMockEnv();
    envAcc.setupDatabase();
    const ownerRow = envAcc.bacaSemua_('Users').find(u => u.username === 'owner');
    envAcc.aksiPengaturanSet_({ user: ownerRow, payload: { wajib_buka_shift: false } });

    // Buat produk HPP Rp 8.000, Harga Jual Rp 10.000, Stok 50
    const prRes = envAcc.aksiProdukCreate_({
      user: ownerRow,
      payload: {
        nama: 'Paku Beton Audit Akuntansi',
        satuan_dasar: 'PCS',
        hpp: 8000,
        harga_ritel: 10000,
        stok: 50,
        stok_min: 5
      }
    });
    const pr = prRes.produk || prRes;

    // 17a. Penjualan tunai 6 PCS = Rp 60.000, bayar tunai Rp 100.000 (kembalian Rp 40.000)
    const jualTunai = envAcc.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        items: [{ produk_id: pr.id, qty: 6, harga: 10000 }],
        pembayaran: [{ metode: 'tunai', jumlah: 100000 }]
      }
    });
    assert(jualTunai.penjualan.total === 60000 && jualTunai.penjualan.kembalian === 40000, 'Penjualan tunai Rp 60.000 dgn kembalian Rp 40.000');

    const arusKas1 = envAcc.aksiLaporanArusKas_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(arusKas1.rincian_masuk.penjualan_tunai === 60000, `Arus kas masuk tunai harus bersih Rp 60.000 (bukan Rp 100.000), aktual: ${arusKas1.rincian_masuk.penjualan_tunai}`);

    const dash1 = envAcc.aksiLaporanDashboard_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(dash1.metode_bayar.tunai.total === 60000, `Dashboard komposisi tunai harus bersih Rp 60.000, aktual: ${dash1.metode_bayar.tunai.total}`);

    // 17b. Retur melebihi qty asal harus DITOLAK
    let gagalReturBerlebih = false;
    try {
      envAcc.aksiReturCreate_({
        user: ownerRow,
        payload: {
          tipe: 'jual',
          ref_id: jualTunai.penjualan.id,
          alasan: 'Uji retur melebihi qty',
          metode_refund: 'kas',
          items: [{ produk_id: pr.id, qty: 7, harga: 10000, hpp: 8000, nama: pr.nama }]
        }
      });
    } catch (e) {
      gagalReturBerlebih = String(e.message || '').includes('melebihi sisa qty');
    }
    assert(gagalReturBerlebih, 'Retur melebihi qty transaksi asal wajib ditolak backend');

    // 17c. Retur sebagian 2 PCS (Omset Rp 20.000, HPP kembali Rp 16.000, dampak laba Rp 4.000) via refund kas
    envAcc.aksiReturCreate_({
      user: ownerRow,
      payload: {
        tipe: 'jual',
        ref_id: jualTunai.penjualan.id,
        alasan: 'Kelebihan beli 2 pcs',
        metode_refund: 'kas',
        items: [{ produk_id: pr.id, qty: 2, harga: 10000, hpp: 8000, nama: pr.nama }]
      }
    });

    // Cek retur kedua melebihi sisa (6 - 2 = 4, coba retur 5 -> harus ditolak!)
    let gagalReturDobel = false;
    try {
      envAcc.aksiReturCreate_({
        user: ownerRow,
        payload: {
          tipe: 'jual',
          ref_id: jualTunai.penjualan.id,
          alasan: 'Uji retur dobel melebihi sisa',
          metode_refund: 'kas',
          items: [{ produk_id: pr.id, qty: 5, harga: 10000, hpp: 8000, nama: pr.nama }]
        }
      });
    } catch (e) {
      gagalReturDobel = String(e.message || '').includes('melebihi sisa qty');
    }
    assert(gagalReturDobel, 'Retur kedua yang melebihi akumulasi sisa nota wajib ditolak');

    // Verifikasi Laba Kotor Bersih di Laba Rugi & Dashboard 100% SINKRON:
    // Jual 6 PCS: omset 60.000, HPP 48.000 -> Laba awal 12.000. Retur 2 PCS: omset -20.000, HPP +16.000 -> dampak laba -4.000 -> Laba bersih = 8.000!
    const lr = envAcc.aksiLaporanLabaRugi_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    const dash2 = envAcc.aksiLaporanDashboard_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(lr.ringkasan.total_retur_penjualan === 20000 && lr.ringkasan.total_retur_hpp === 16000, 'Laba Rugi mencatat omset retur & HPP retur secara akurat');
    assert(lr.ringkasan.laba_kotor_bersih === 8000, `Laba kotor bersih setelah retur 2 pcs harus Rp 8.000 (bukan rugi palsu), aktual: ${lr.ringkasan.laba_kotor_bersih}`);
    assert(dash2.ringkasan.laba_kotor === lr.ringkasan.laba_kotor_bersih && dash2.ringkasan.laba_bersih_riil === lr.ringkasan.laba_bersih_riil,
      `Dashboard (${dash2.ringkasan.laba_bersih_riil}) dan Laba Rugi (${lr.ringkasan.laba_bersih_riil}) wajib 100% sinkron`);

    // 17d. Retur potong_piutang melunasi piutang -> Penjualan.status_bayar wajib ikut 'lunas'
    const pelRes = envAcc.aksiPelangganCreate_({
      user: ownerRow,
      payload: { nama: 'Kontraktor Audit', hp: '081999888777', tipe: 'member', limit_kredit: 5000000, tempo_hari: 30 }
    });
    const pelId = (pelRes.pelanggan || pelRes).id;

    const jualTempo = envAcc.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        items: [{ produk_id: pr.id, qty: 3, harga: 10000 }],
        pembayaran: [{ metode: 'tempo', jumlah: 30000 }]
      }
    });
    envAcc.aksiReturCreate_({
      user: ownerRow,
      payload: {
        tipe: 'jual',
        ref_id: jualTempo.penjualan.id,
        alasan: 'Batal pakai, potong piutang penuh',
        metode_refund: 'potong_piutang',
        items: [{ produk_id: pr.id, qty: 3, harga: 10000, hpp: 8000, nama: pr.nama }]
      }
    });
    const pjTempoAfter = envAcc.cariById_('Penjualan', jualTempo.penjualan.id);
    assert(pjTempoAfter.status_bayar === 'lunas', `Status bayar Penjualan tempo yang habis dipotong retur wajib sinkron jadi 'lunas', aktual: ${pjTempoAfter.status_bayar}`);

    // 17e. Shift Kasir menghitung modal + tunai bersih + piutang tunai - refund tunai
    // Buat penjualan tempo lain Rp 20.000 lalu bayar piutang tunai Rp 15.000 hari ini
    const jualTempo2 = envAcc.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        items: [{ produk_id: pr.id, qty: 2, harga: 10000 }],
        pembayaran: [{ metode: 'tempo', jumlah: 20000 }]
      }
    });
    const pt2 = envAcc.bacaSemua_('Piutang').find(x => x.penjualan_id === jualTempo2.penjualan.id && !x.deleted);
    envAcc.aksiPiutangBayar_({ user: ownerRow, payload: { id: pt2.id, jumlah: 15000, metode: 'tunai' } });

    const shift = envAcc.aksiPenjualanShiftKasir_({ user: ownerRow, payload: { modal_awal: 100000 } });
    // Laci = Modal 100.000 + Tunai bersih 60.000 + Piutang tunai 15.000 - Refund tunai 20.000 = 155.000
    assert(shift.total_tunai === 60000, `Shift total_tunai harus Rp 60.000, aktual: ${shift.total_tunai}`);
    assert(shift.total_piutang_tunai === 15000, `Shift total_piutang_tunai harus Rp 15.000, aktual: ${shift.total_piutang_tunai}`);
    assert(shift.total_refund_tunai === 20000, `Shift total_refund_tunai harus Rp 20.000, aktual: ${shift.total_refund_tunai}`);
    assert(shift.total_laci === 155000, `Shift total_laci harus Rp 155.000, aktual: ${shift.total_laci}`);

    // 17f. Void nota tempo belum lunas TIDAK boleh memotong total_belanja member sebelumnya
    envAcc.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        items: [{ produk_id: pr.id, qty: 5, harga: 10000 }],
        pembayaran: [{ metode: 'tunai', jumlah: 50000 }]
      }
    });
    const belanjaSebelumTempo = envAcc.cariById_('Pelanggan', pelId).total_belanja;
    const jualTempoVoid = envAcc.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        items: [{ produk_id: pr.id, qty: 4, harga: 10000 }],
        pembayaran: [{ metode: 'tempo', jumlah: 40000 }]
      }
    });
    envAcc.aksiPenjualanVoid_({
      user: ownerRow,
      payload: { id: jualTempoVoid.penjualan.id, alasan: 'Batal order tempo' }
    });
    const belanjaSetelahVoidTempo = envAcc.cariById_('Pelanggan', pelId).total_belanja;
    assert(belanjaSetelahVoidTempo === belanjaSebelumTempo,
      `Void nota tempo belum lunas tidak boleh mengurangi total_belanja member sebelumnya (${belanjaSebelumTempo} -> ${belanjaSetelahVoidTempo})`);

    // 17g. Draft Opname disetujui setelah ada mutasi stok -> Kartu_Stok mencatat selisih aktual
    const stokAwalOp = Number(envAcc.cariById_('Produk', pr.id).stok);
    const opDraft = envAcc.aksiOpnameCreate_({
      user: ownerRow,
      payload: { produk_id: pr.id, qty_fisik: stokAwalOp - 2, alasan: 'Cek gudang pagi', langsung_setuju: false }
    });
    // Terjadi penjualan 1 unit sebelum opname disetujui
    envAcc.aksiPenjualanCreate_({
      user: ownerRow,
      payload: { items: [{ produk_id: pr.id, qty: 1, harga: 10000 }], pembayaran: [{ metode: 'tunai', jumlah: 10000 }] }
    });
    envAcc.aksiOpnameApprove_({ user: ownerRow, payload: { id: opDraft.id } });
    const ksOp = envAcc.bacaSemua_('Kartu_Stok').find(k => k.ref_id === opDraft.no_opname);
    assert(ksOp && Number(ksOp.qty) === -1 && Number(ksOp.saldo) === stokAwalOp - 2,
      `Opname approve wajib mencatat selisih aktual (-1), aktual: qty=${ksOp?.qty}, saldo=${ksOp?.saldo}`);

    // 17h. Keamanan RBAC Kasir (blokir retur beli supplier & kunci biaya kasir ke kas_kasir) + re-entrant lock
    const kasirCtx = { id: 'kasir-audit', username: 'kasiraudit', nama: 'Kasir Audit', role: 'kasir' };
    let kasirTolakReturBeli = false;
    try {
      envAcc.aksiReturCreate_({
        user: kasirCtx,
        payload: { tipe: 'beli', ref_id: 'fake-pb', alasan: 'Coba retur beli', items: [{ produk_id: pr.id, qty: 1, harga: 8000 }] }
      });
    } catch (e) {
      kasirTolakReturBeli = String(e.message || '').includes('Owner atau Admin');
    }
    assert(kasirTolakReturBeli, 'Kasir wajib ditolak membuat retur pembelian ke supplier');

    const biayaKasir = envAcc.aksiBiayaCreate_({
      user: kasirCtx,
      payload: { kategori: 'Parkir', nominal: 5000, keterangan: 'Uji RBAC sumber dana', sumber_dana: 'bank' }
    });
    assert(biayaKasir.item && biayaKasir.item.sumber_dana === 'kas_kasir',
      `Biaya oleh Kasir wajib dikunci ke sumber_dana kas_kasir, aktual: ${biayaKasir.item?.sumber_dana}`);

    // Uji nested denganKunci_ (re-entrant safe tanpa premature unlock)
    const nestedLockRes = envAcc.denganKunci_(() => envAcc.denganKunci_(() => 'LOCK_OK'));
    assert(nestedLockRes === 'LOCK_OK', 'denganKunci_ mendukung pemanggilan bersarang (re-entrant safe)');
  });

  // =========================================================================
  // 18. JASA ONGKOS KIRIM (MANUAL, POIN KHUSUS BARANG, TEMPO & LABA RUGI)
  // =========================================================================
  await test('18. Jasa Ongkos Kirim: Manual Fleksibel, Poin Khusus Barang (Tanpa Ongkir), Tempo Lunas, & Laba Rugi', () => {
    const envOng = setupMockEnv();
    envOng.setupDatabase();
    const ownerRow = envOng.bacaSemua_('Users').find(u => u.username === 'owner');
    envOng.aksiPengaturanSet_({ user: ownerRow, payload: { wajib_buka_shift: false } });

    const prRes = envOng.aksiProdukCreate_({
      user: ownerRow,
      payload: {
        nama: 'Semen 50kg Ongkir Test',
        satuan_dasar: 'SAK',
        hpp: 50000,
        harga_ritel: 60000,
        stok: 100,
        stok_min: 5
      }
    });
    const pr = prRes.produk || prRes;

    const pelRes = envOng.aksiPelangganCreate_({
      user: ownerRow,
      payload: { nama: 'Pak Mandor Ongkir', hp: '081333444555', tipe: 'member', limit_kredit: 5000000, tempo_hari: 30 }
    });
    const pelId = (pelRes.pelanggan || pelRes).id;

    // 18a. Ambil di Toko tapi kirim ongkir 50.000 -> backend wajib nolkan ongkir
    const ambilRes = envOng.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        pengiriman: 'ambil',
        ongkir: 50000,
        items: [{ produk_id: pr.id, qty: 1, harga: 60000 }],
        pembayaran: [{ metode: 'tunai', jumlah: 60000 }]
      }
    });
    assert(Number(ambilRes.penjualan.ongkir) === 0 && ambilRes.penjualan.total === 60000, 'Opsi ambil di toko wajib memaksa ongkir = 0');

    // 18b. Dikirim Toko: Barang 2 SAK = Rp 120.000 + Ongkir Rp 75.000 = Rp 195.000 (Tunai)
    // Poin (10.000/poin Reguler 1x) wajib 12 poin (dari 120.000 barang), BUKAN 19 poin!
    const kirimTunai = envOng.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        pengiriman: 'dikirim',
        alamat_kirim: 'Jl. Proyek Selatan No. 9',
        ongkir: 75000,
        items: [{ produk_id: pr.id, qty: 2, harga: 60000 }],
        pembayaran: [{ metode: 'tunai', jumlah: 200000 }]
      }
    });
    assert(kirimTunai.penjualan.ongkir === 75000 && kirimTunai.penjualan.total === 195000 && kirimTunai.penjualan.kembalian === 5000,
      'Total tagihan dikirim = barang (120rb) + ongkir (75rb) = 195rb');
    assert(kirimTunai.penjualan.poin_didapat === 12,
      `Poin transaksi tunai + ongkir wajib 12 (khusus barang 120rb), aktual: ${kirimTunai.penjualan.poin_didapat}`);

    // 18c. Dikirim Toko Tempo Penuh: Barang 1 SAK (60.000) + Ongkir (40.000) = 100.000 -> saat lunas poin wajib 6 (bukan 10!)
    const kirimTempo = envOng.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pelanggan_id: pelId,
        pengiriman: 'dikirim',
        alamat_kirim: 'Desa Sebelah 12km',
        ongkir: 40000,
        items: [{ produk_id: pr.id, qty: 1, harga: 60000 }],
        pembayaran: [{ metode: 'tempo', jumlah: 100000 }]
      }
    });
    assert(kirimTempo.penjualan.poin_didapat === 0, 'Transaksi tempo belum lunas mendapat 0 poin awal');
    const ptTempo = envOng.bacaSemua_('Piutang').find(x => x.penjualan_id === kirimTempo.penjualan.id && !x.deleted);
    const lunasTempo = envOng.aksiPiutangBayar_({ user: ownerRow, payload: { id: ptTempo.id, jumlah: 100000, metode: 'transfer' } });
    assert(lunasTempo.poin_didapat === 6,
      `Pelunasan piutang tempo + ongkir wajib memberi 6 poin (khusus barang 60rb), aktual: ${lunasTempo.poin_didapat}`);

    // Total belanja member = 60rb + 120rb + 60rb = 240rb (0% ongkir!)
    const pelAfter = envOng.cariById_('Pelanggan', pelId);
    assert(pelAfter.total_belanja === 240000 && pelAfter.poin === 24,
      `Akumulasi total_belanja member (${pelAfter.total_belanja}) & poin (${pelAfter.poin}) wajib 100% bebas ongkir`);

    // 18d. Laba Rugi mencatat total_ongkir = 75rb + 40rb = 115rb & sinkron dengan Dashboard
    const lr = envOng.aksiLaporanLabaRugi_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    const dash = envOng.aksiLaporanDashboard_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(lr.ringkasan.total_ongkir === 115000, `Laba Rugi total_ongkir harus Rp 115.000, aktual: ${lr.ringkasan.total_ongkir}`);
    assert(lr.ringkasan.laba_bersih_riil === dash.ringkasan.laba_bersih_riil,
      `Laba Rugi (${lr.ringkasan.laba_bersih_riil}) & Dashboard (${dash.ringkasan.laba_bersih_riil}) wajib sinkron termasuk ongkir`);
  });

  // =========================================================================
  // 19. LANDED COST PEMBELIAN: ONGKIR + BIAYA BONGKAR -> HPP FINAL ANTI-BONCOS
  // =========================================================================
  await test('19. Landed Cost Pembelian: Konversi Ongkir & Biaya Bongkar ke HPP Final (Masuk Hutang vs Tunai Terpisah & Rata Qty)', () => {
    const envLc = setupMockEnv();
    envLc.setupDatabase();
    const ownerRow = envLc.bacaSemua_('Users').find(u => u.username === 'owner');

    const supRes = envLc.aksiSupplierCreate_({
      user: ownerRow,
      payload: { nama: 'PT Distributor Semen Nusantara', kontak: 'Pak Budi', hp: '081222333444' }
    });
    const supId = (supRes.supplier || supRes).id;

    const semenRes = envLc.aksiProdukCreate_({
      user: ownerRow,
      payload: { nama: 'Semen 50kg Landed', satuan_dasar: 'SAK', hpp: 0, harga_ritel: 55000, stok: 0, stok_min: 5 }
    });
    const semen = semenRes.produk || semenRes;

    // 19a. 100 SAK @ Rp 45.000 = Rp 4.500.000 + Ongkir Rp 200.000 + Bongkar Rp 100.000 (Masuk Tagihan Supplier, tempo penuh)
    const pb1 = envLc.aksiPembelianCreate_({
      user: ownerRow,
      payload: {
        supplier_id: supId,
        ongkir: 200000,
        biaya_bongkar: 100000,
        biaya_masuk_hutang: true,
        metode_alokasi_biaya: 'proporsional',
        bayar: 0,
        jatuh_tempo: '2026-12-22',
        items: [{ produk_id: semen.id, qty: 100, harga_beli: 45000, satuan: 'SAK', faktor: 1 }]
      }
    });
    const semenAfter1 = envLc.cariById_('Produk', semen.id);
    const ht1 = envLc.bacaSemua_('Hutang').find(h => h.pembelian_id === pb1.id && !h.deleted);
    assert(pb1.total === 4800000 && ht1 && ht1.sisa === 4800000, `Tagihan & hutang masuk ongkir+bongkar wajib Rp 4.800.000, aktual: ${pb1.total}`);
    assert(semenAfter1.hpp === 48000, `HPP final semen wajib naik ke Rp 48.000/sak, aktual: ${semenAfter1.hpp}`);

    // 19b. 50 SAK @ Rp 45.000 = Rp 2.250.000 (Tempo supplier) + Ongkir 100rb + Bongkar 50rb (Bayar tunai terpisah ke kuli/ekspedisi)
    const pb2 = envLc.aksiPembelianCreate_({
      user: ownerRow,
      payload: {
        supplier_id: supId,
        ongkir: 100000,
        biaya_bongkar: 50000,
        biaya_masuk_hutang: false,
        metode_alokasi_biaya: 'proporsional',
        bayar: 0,
        jatuh_tempo: '2026-12-22',
        items: [{ produk_id: semen.id, qty: 50, harga_beli: 45000, satuan: 'SAK', faktor: 1 }]
      }
    });
    const semenAfter2 = envLc.cariById_('Produk', semen.id);
    const ht2 = envLc.bacaSemua_('Hutang').find(h => h.pembelian_id === pb2.id && !h.deleted);
    const arusKas = envLc.aksiLaporanArusKas_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(pb2.total === 2250000 && ht2 && ht2.sisa === 2250000,
      `Hutang supplier pada ongkir/bongkar bayar terpisah wajib murni barang Rp 2.250.000, aktual: ${pb2.total}`);
    assert(semenAfter2.hpp === 48000,
      `HPP moving average semen tetap akurat Rp 48.000 meski ongkir/bongkar dibayar terpisah, aktual: ${semenAfter2.hpp}`);
    assert(arusKas.rincian_keluar.pembelian_tunai === 150000,
      `Arus kas keluar pembelian tunai wajib mencatat Rp 150.000 ongkir/bongkar terpisah, aktual: ${arusKas.rincian_keluar.pembelian_tunai}`);

    // 19c. Metode Alokasi Rata per Qty (2 barang harga beda, total qty 20, bongkar Rp 20.000 -> masing-masing +Rp 1.000/unit)
    const pA = (envLc.aksiProdukCreate_({ user: ownerRow, payload: { nama: 'Besi 12mm', satuan_dasar: 'BTG', hpp: 0, harga_ritel: 120000, stok: 0, stok_min: 0 } })).produk || null;
    const pARow = pA || envLc.bacaSemua_('Produk').find(x => x.nama === 'Besi 12mm');
    const pB = (envLc.aksiProdukCreate_({ user: ownerRow, payload: { nama: 'Kawat Bendrat', satuan_dasar: 'KG', hpp: 0, harga_ritel: 25000, stok: 0, stok_min: 0 } })).produk || null;
    const pBRow = pB || envLc.bacaSemua_('Produk').find(x => x.nama === 'Kawat Bendrat');

    envLc.aksiPembelianCreate_({
      user: ownerRow,
      payload: {
        supplier_id: supId,
        ongkir: 0,
        biaya_bongkar: 20000,
        biaya_masuk_hutang: true,
        metode_alokasi_biaya: 'qty',
        bayar: 1120000,
        items: [
          { produk_id: pARow.id, qty: 10, harga_beli: 100000, satuan: 'BTG', faktor: 1 },
          { produk_id: pBRow.id, qty: 10, harga_beli: 10000, satuan: 'KG', faktor: 1 }
        ]
      }
    });
    const hppA = envLc.cariById_('Produk', pARow.id).hpp;
    const hppB = envLc.cariById_('Produk', pBRow.id).hpp;
    assert(hppA === 101000 && hppB === 11000,
      `Alokasi rata per qty wajib menaikkan masing-masing +Rp 1.000/unit (A=101rb, B=11rb), aktual: A=${hppA}, B=${hppB}`);
  });

  test('20. Saldo Titipan / Deposit Pelanggan: Top-Up, Bayar POS Anti-Dobel Kas, Poin, Void, Retur, Tarik & Guard Hapus', () => {
    const envDep = setupMockEnv();
    envDep.setupDatabase();
    const ownerRow = envDep.bacaSemua_('Users').find(u => u.username === 'owner');
    envDep.aksiPengaturanSet_({ user: ownerRow, payload: { wajib_buka_shift: false } });
    const kasirRes = envDep.aksiUserCreate_({
      user: ownerRow,
      payload: { username: 'kasirdep', nama: 'Kasir Deposit', role: 'kasir', pin: '123456' }
    });
    const kasirRow = envDep.bacaSemua_('Users').find(u => u.username === 'kasirdep');

    const pelCreate = envDep.aksiPelangganCreate_({
      user: ownerRow,
      payload: { nama: 'Pak Harto Proyek', hp: '081299998888', tipe: 'member', level: 'Reguler', limit_kredit: 0 }
    });
    const pelId = pelCreate.pelanggan.id;

    const prodCreate = envDep.aksiProdukCreate_({
      user: ownerRow,
      payload: { nama: 'Cat Tembok 25kg', satuan_dasar: 'PAIL', hpp: 80000, harga_ritel: 100000, stok: 50, stok_min: 5 }
    });
    const prodId = (prodCreate.produk || prodCreate).id;

    // 20a. Top-up Tunai Rp 500.000 (oleh kasir) + Transfer Rp 300.000 (oleh owner) -> saldo Rp 800.000, 0 omset, 0 poin
    const dep1 = envDep.aksiDepositTambah_({
      user: kasirRow,
      payload: { pelanggan_id: pelId, jumlah: 500000, metode: 'tunai', catatan: 'Titipan awal proyek' }
    });
    const dep2 = envDep.aksiDepositTambah_({
      user: ownerRow,
      payload: { pelanggan_id: pelId, jumlah: 300000, metode: 'transfer', catatan: 'Tambahan titipan transfer' }
    });
    assert(dep1.saldo_deposit === 500000 && dep2.saldo_deposit === 800000, `Saldo titipan wajib Rp 800.000, aktual: ${dep2.saldo_deposit}`);

    const arusKasAwal = envDep.aksiLaporanArusKas_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(arusKasAwal.rincian_masuk.deposit_masuk_tunai === 500000 && arusKasAwal.rincian_masuk.deposit_masuk_bank === 300000,
      `Arus kas masuk wajib catat deposit tunai 500rb & bank 300rb`);
    assert(arusKasAwal.ringkasan.total_kas_masuk === 800000, `Total kas masuk awal wajib Rp 800.000`);

    const shiftKasir1 = envDep.aksiPenjualanShiftKasir_({ user: kasirRow, payload: {} });
    assert(shiftKasir1.total_deposit_tunai === 500000 && shiftKasir1.total_laci === 500000,
      `Shift kasir wajib mencatat titipan tunai Rp 500.000 di laci, aktual: ${shiftKasir1.total_laci}`);

    const lapJualAwal = envDep.aksiLaporanPenjualan_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(lapJualAwal.ringkasan.total_omset === 0, 'Terima titipan tidak boleh masuk omset penjualan');
    assert(envDep.cariById_('Pelanggan', pelId).poin === 0, 'Terima titipan tidak boleh memberikan poin member');

    // 20b. Belanja POS Rp 200.000 barang + Rp 50.000 ongkir = Rp 250.000 dibayar PENUH via Deposit
    const jualDep = envDep.aksiPenjualanCreate_({
      user: kasirRow,
      payload: {
        pelanggan_id: pelId,
        pengiriman: 'dikirim',
        ongkir: 50000,
        items: [{ produk_id: prodId, satuan: 'PAIL', faktor: 1, qty: 2, harga: 100000, tipe_harga: 'ritel' }],
        pembayaran: [{ metode: 'deposit', jumlah: 250000 }]
      }
    });
    assert(jualDep.pelanggan.saldo_deposit === 550000, `Saldo deposit wajib turun ke Rp 550.000, aktual: ${jualDep.pelanggan.saldo_deposit}`);
    assert(jualDep.penjualan.poin_didapat === 20, `Belanja lunas via deposit (barang Rp 200rb, ongkir Rp 50rb) wajib beri 20 poin, aktual: ${jualDep.penjualan.poin_didapat}`);

    // Anti double-counting Arus Kas: pemakaian deposit TIDAK BOLEH menambah total_kas_masuk!
    const arusKasSetelahPakai = envDep.aksiLaporanArusKas_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(arusKasSetelahPakai.ringkasan.total_kas_masuk === 800000,
      `Anti double-count: total_kas_masuk wajib tetap Rp 800.000 setelah belanja pakai deposit, aktual: ${arusKasSetelahPakai.ringkasan.total_kas_masuk}`);

    // 20c. Belanja Kombinasi: 7 item = Rp 700.000 -> Deposit Rp 550.000 + Tunai Rp 150.000
    const jualKomb = envDep.aksiPenjualanCreate_({
      user: kasirRow,
      payload: {
        pelanggan_id: pelId,
        items: [{ produk_id: prodId, satuan: 'PAIL', faktor: 1, qty: 7, harga: 100000, tipe_harga: 'ritel' }],
        pembayaran: [
          { metode: 'deposit', jumlah: 550000 },
          { metode: 'tunai', jumlah: 150000 }
        ]
      }
    });
    assert(jualKomb.pelanggan.saldo_deposit === 0, `Saldo deposit wajib habis Rp 0, aktual: ${jualKomb.pelanggan.saldo_deposit}`);
    const arusKasKomb = envDep.aksiLaporanArusKas_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(arusKasKomb.rincian_masuk.penjualan_tunai === 150000 && arusKasKomb.ringkasan.total_kas_masuk === 950000,
      `Kombinasi deposit+tunai hanya memasukkan porsi tunai Rp 150.000 ke Arus Kas (total Rp 950.000), aktual: ${arusKasKomb.ringkasan.total_kas_masuk}`);

    // 20d. Belanja pakai deposit saat saldo = 0 wajib ditolak
    let gagalSaldoKurang = false;
    try {
      envDep.aksiPenjualanCreate_({
        user: kasirRow,
        payload: {
          pelanggan_id: pelId,
          items: [{ produk_id: prodId, satuan: 'PAIL', faktor: 1, qty: 1, harga: 100000, tipe_harga: 'ritel' }],
          pembayaran: [{ metode: 'deposit', jumlah: 100000 }]
        }
      });
    } catch (e) {
      gagalSaldoKurang = true;
    }
    assert(gagalSaldoKurang === true, 'Belanja deposit melebihi saldo wajib ditolak');

    // 20e. Void nota jualDep (Rp 250.000 deposit) wajib mengembalikan saldo Rp 250.000 ke pelanggan
    envDep.aksiPenjualanVoid_({
      user: ownerRow,
      payload: { id: jualDep.penjualan.id, alasan: 'Batal order proyek' }
    });
    assert(envDep.cariById_('Pelanggan', pelId).saldo_deposit === 250000,
      `Void nota deposit wajib mengembalikan saldo Rp 250.000, aktual: ${envDep.cariById_('Pelanggan', pelId).saldo_deposit}`);

    // 20f. Retur 1 item (Rp 100.000) dari jualKomb dengan metode_refund = 'deposit' -> saldo jadi Rp 350.000
    envDep.aksiReturCreate_({
      user: ownerRow,
      payload: {
        tipe: 'jual',
        ref_id: jualKomb.penjualan.id,
        alasan: 'Sisa cat tidak terpakai',
        metode_refund: 'deposit',
        items: [{ produk_id: prodId, nama: 'Cat Tembok 25kg', satuan: 'PAIL', faktor: 1, qty: 1, harga: 100000, hpp: 80000 }]
      }
    });
    assert(envDep.cariById_('Pelanggan', pelId).saldo_deposit === 350000,
      `Refund retur ke deposit wajib menambah saldo menjadi Rp 350.000, aktual: ${envDep.cariById_('Pelanggan', pelId).saldo_deposit}`);

    // 20g. Hapus pelanggan saat masih ada saldo deposit wajib ditolak
    let gagalHapusPel = false;
    try {
      envDep.aksiPelangganDelete_({ user: ownerRow, payload: { id: pelId } });
    } catch (e) {
      gagalHapusPel = true;
    }
    assert(gagalHapusPel === true, 'Penghapusan pelanggan dengan saldo deposit > 0 wajib ditolak');

    // 20h. RBAC deposit.tarik: Kasir dilarang via router resmi (FORBIDDEN), Owner boleh tarik tunai Rp 100.000 -> masuk arus kas keluar & kurangi laci
    const resKasirTarik = callApi('deposit.tarik', tokenKasir, { pelanggan_id: pelId, jumlah: 50000, metode: 'tunai' });
    assert(resKasirTarik.ok === false && resKasirTarik.code === 'FORBIDDEN',
      `Kasir wajib ditolak (FORBIDDEN) saat memanggil deposit.tarik, aktual: ${resKasirTarik.code}`);
    const tarikRes = envDep.aksiDepositTarik_({
      user: ownerRow,
      payload: { pelanggan_id: pelId, jumlah: 100000, metode: 'tunai', catatan: 'Kembalikan sebagian sisa titipan' }
    });
    assert(tarikRes.saldo_deposit === 250000, `Saldo setelah penarikan Rp 100rb wajib Rp 250.000, aktual: ${tarikRes.saldo_deposit}`);
    const arusKasAkhir = envDep.aksiLaporanArusKas_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(arusKasAkhir.rincian_keluar.deposit_tarik_tunai === 100000,
      `Arus kas keluar wajib mencatat pengembalian deposit tunai Rp 100.000, aktual: ${arusKasAkhir.rincian_keluar.deposit_tarik_tunai}`);
  });

  // =========================================================================
  // TEST 21: MANAJEMEN BUKA & TUTUP SHIFT KASIR (MODAL AWAL, HITUNG LACI, SELISIH, Z-REPORT)
  // =========================================================================
  test('21. Buka & Tutup Shift Kasir: Modal Awal, Rekap Laci Akurat, Validasi Selisih, Z-Report, & RBAC', () => {
    const envShf = setupMockEnv();
    envShf.setupDatabase();
    const ownerRow = envShf.bacaSemua_('Users').find((u) => u.role === 'owner');
    const saltK = envShf.buatSalt_();
    const kasir1 = envShf.tambahBaris_('Users', [{
      username: 'kasir_pagi', nama: 'Kasir Pagi', role: 'kasir',
      pin_hash: envShf.hashPin_('111111', saltK), salt: saltK, aktif: true
    }], ownerRow.id)[0];
    const kasir2 = envShf.tambahBaris_('Users', [{
      username: 'kasir_sore', nama: 'Kasir Sore', role: 'kasir',
      pin_hash: envShf.hashPin_('222222', saltK), salt: saltK, aktif: true
    }], ownerRow.id)[0];

    const prod = envShf.tambahBaris_('Produk', [{
      sku: 'SKU-SHF-1', nama: 'Semen 50kg', satuan_dasar: 'SAK',
      hpp: 55000, harga_ritel: 70000, stok: 50, aktif: true
    }], ownerRow.id)[0];

    // 21a. Awalnya belum ada shift aktif
    const awal = envShf.aksiShiftAktif_({ user: kasir1, payload: {} });
    assert(awal.shift === null, 'Sebelum buka shift, shift.aktif wajib null');

    // 21b. Buka shift dengan modal awal Rp 200.000
    const buka = envShf.aksiShiftBuka_({ user: kasir1, payload: { modal_awal: 200000, catatan: 'Shift Pagi siap' } });
    assert(buka.shift && buka.shift.status === 'aktif' && /^SHF-\d{8}-\d{4}$/.test(buka.shift.no_shift),
      `Nomor shift wajib format SHF-YYYYMMDD-0001, aktual: ${buka.shift && buka.shift.no_shift}`);
    assert(buka.shift.modal_awal === 200000, 'Modal awal wajib tersimpan Rp 200.000');

    // 21c. Cegah buka shift ganda oleh kasir yang sama
    let gagalGanda = false;
    try {
      envShf.aksiShiftBuka_({ user: kasir1, payload: { modal_awal: 100000 } });
    } catch (e) {
      gagalGanda = e.code === 'CONFLICT';
    }
    assert(gagalGanda === true, 'Kasir tidak boleh membuka 2 shift aktif bersamaan (CONFLICT)');

    // 21d. Transaksi tunai 2 sak = Rp 140.000 (bayar Rp 150.000, kembalian Rp 10.000) + Kas Keluar Rp 25.000
    envShf.aksiPenjualanCreate_({
      user: kasir1,
      payload: {
        items: [{ produk_id: prod.id, satuan: 'SAK', faktor: 1, qty: 2, harga: 70000, tipe_harga: 'ritel' }],
        pembayaran: [{ metode: 'tunai', jumlah: 150000 }]
      }
    });
    envShf.aksiBiayaCreate_({
      user: kasir1,
      payload: {
        kategori: 'Konsumsi & Dapur Toko',
        nominal: 25000,
        keterangan: 'Beli air galon',
        sumber_dana: 'kas_kasir',
        shift_id: buka.shift.id
      }
    });

    // Ekspektasi kas laci = 200.000 (modal) + 140.000 (tunai bersih) - 25.000 (kas keluar) = Rp 315.000
    const cekAktif = envShf.aksiShiftAktif_({ user: kasir1, payload: {} });
    assert(cekAktif.ringkasan.kas_sistem === 315000,
      `Ekspektasi kas sistem wajib Rp 315.000, aktual: ${cekAktif.ringkasan.kas_sistem}`);
    assert(cekAktif.ringkasan.total_transaksi === 1 && cekAktif.ringkasan.total_biaya_kasir === 25000,
      'Ringkasan shift wajib menghitung 1 transaksi & Rp 25.000 kas keluar');

    // 21e. RBAC: Kasir 2 tidak boleh menutup shift milik Kasir 1
    let gagalRbac = false;
    try {
      envShf.aksiShiftTutup_({ user: kasir2, payload: { id: buka.shift.id, kas_fisik: 315000 } });
    } catch (e) {
      gagalRbac = e.code === 'FORBIDDEN';
    }
    assert(gagalRbac === true, 'Kasir lain dilarang menutup shift milik kasir lain (FORBIDDEN)');

    // 21f. Validasi selisih: kas_fisik Rp 310.000 (kurang Rp 5.000) TANPA catatan wajib ditolak
    let gagalTanpaCatatan = false;
    try {
      envShf.aksiShiftTutup_({ user: kasir1, payload: { id: buka.shift.id, kas_fisik: 310000, catatan: '' } });
    } catch (e) {
      gagalTanpaCatatan = e.code === 'VALIDATION';
    }
    assert(gagalTanpaCatatan === true, 'Tutup shift dengan selisih kas tanpa catatan wajib ditolak (VALIDATION)');

    // 21g. Tutup shift dengan catatan selisih -> sukses, status = 'ditutup', selisih = -5000, Z-Report siap
    const tutup = envShf.aksiShiftTutup_({
      user: kasir1,
      payload: { id: buka.shift.id, kas_fisik: 310000, catatan: 'Salah kembalian Rp 5.000' }
    });
    assert(tutup.shift.status === 'ditutup', 'Status shift setelah ditutup wajib "ditutup"');
    assert(tutup.shift.kas_sistem === 315000 && tutup.shift.kas_fisik === 310000 && tutup.shift.selisih === -5000,
      `Snapshot Z-Report wajib mencatat sistem 315rb, fisik 310rb, selisih -5000, aktual: ${tutup.shift.selisih}`);
    assert(tutup.ringkasan.tipe_laporan === 'Z-REPORT', 'Ringkasan tutup shift wajib bertipe Z-REPORT');

    // 21h. Setelah ditutup, shift.aktif kembali null dan shift.list Owner menampilkan ringkasan akurat
    const pascaTutup = envShf.aksiShiftAktif_({ user: kasir1, payload: {} });
    assert(pascaTutup.shift === null, 'Setelah ditutup, shift.aktif wajib null');
    const listOwner = envShf.aksiShiftList_({ user: ownerRow, payload: {} });
    assert(listOwner.items.length === 1 && listOwner.ringkasan.total_selisih === -5000 && listOwner.ringkasan.jumlah_kurang === 1,
      `shift.list wajib merangkum 1 shift ditutup dengan selisih -5000, aktual: ${JSON.stringify(listOwner.ringkasan)}`);
  });

  // =========================================================================
  // TEST 22: ANTREAN PENGIRIMAN, SURAT JALAN, & KIRIM BERTAHAP (BON BARANG)
  // =========================================================================
  test('22. Antrean Pengiriman & Bon Barang Bertahap: Status Menunggu -> Sebagian -> Selesai', () => {
    const envKrm = setupMockEnv();
    envKrm.setupDatabase();
    const ownerRow = envKrm.bacaSemua_('Users').find((u) => u.role === 'owner');
    envKrm.aksiPengaturanSet_({ user: ownerRow, payload: { wajib_buka_shift: false } });
    const prod = envKrm.tambahBaris_('Produk', [{
      sku: 'SKU-KRM-1', nama: 'Semen Tiga Roda 50kg', satuan_dasar: 'SAK',
      hpp: 55000, harga_ritel: 70000, stok: 100, aktif: true
    }], ownerRow.id)[0];

    // 22a. Penjualan dikirim 50 sak -> otomatis status_antar = 'belum_dikirim' & muncul di pengiriman.list
    const jualKirim = envKrm.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        pengiriman: 'dikirim',
        alamat_kirim: 'Proyek Ruko Jl. Merdeka No. 8',
        ongkir: 50000,
        items: [{ produk_id: prod.id, satuan: 'SAK', faktor: 1, qty: 50, qty_dibawa: 0, harga: 70000, tipe_harga: 'ritel' }],
        pembayaran: [{ metode: 'tunai', jumlah: 3550000 }]
      }
    });
    assert(jualKirim.penjualan.status_antar === 'belum_dikirim',
      `Penjualan dikirim wajib berstatus awal belum_dikirim, aktual: ${jualKirim.penjualan.status_antar}`);

    const antrean1 = envKrm.aksiPengirimanList_({ user: ownerRow, payload: {} });
    assert(antrean1.items.length === 1 && antrean1.ringkasan.belum_dikirim === 1 && antrean1.items[0].total_qty_sisa === 50,
      'Antrean pengiriman wajib mencatat 1 nota menunggu kirim dengan sisa 50 sak');

    // 22b. Kirim bertahap 20 sak dulu (status 'sebagian') -> qty_dibawa = 20, sisa_kirim = 30
    const itemId = antrean1.items[0].items[0].id;
    const updSebagian = envKrm.aksiPengirimanUpdateStatus_({
      user: ownerRow,
      payload: {
        id: jualKirim.penjualan.id,
        status_antar: 'sebagian',
        sopir: 'Pak Budi',
        catatan_kirim: 'Kirim kloter 1',
        items_kirim: [{ item_id: itemId, qty_dibawa: 20 }]
      }
    });
    assert(updSebagian.penjualan.status_antar === 'sebagian', 'Status wajib berubah menjadi sebagian');
    const antrean2 = envKrm.aksiPengirimanList_({ user: ownerRow, payload: {} });
    assert(antrean2.items[0].total_qty_sisa === 30 && antrean2.ringkasan.sebagian === 1,
      `Sisa kirim setelah kloter 1 (20 sak) wajib 30 sak, aktual: ${antrean2.items[0].total_qty_sisa}`);

    // 22c. Cegah kirim melebihi qty pesanan (60 > 50)
    let gagalLebih = false;
    try {
      envKrm.aksiPengirimanUpdateStatus_({
        user: ownerRow,
        payload: {
          id: jualKirim.penjualan.id,
          status_antar: 'sebagian',
          items_kirim: [{ item_id: itemId, qty_dibawa: 60 }]
        }
      });
    } catch (e) {
      gagalLebih = e.code === 'VALIDATION';
    }
    assert(gagalLebih === true, 'Input qty dikirim melebihi qty pesanan wajib ditolak');

    // 22d. Tandai selesai -> qty_dibawa otomatis penuh 50 & sisa = 0
    const updSelesai = envKrm.aksiPengirimanUpdateStatus_({
      user: ownerRow,
      payload: { id: jualKirim.penjualan.id, status_antar: 'selesai', sopir: 'Pak Budi', catatan_kirim: 'Lunas terima kloter 2' }
    });
    assert(updSelesai.penjualan.status_antar === 'selesai', 'Status pengiriman wajib selesai');
    const antrean3 = envKrm.aksiPengirimanList_({ user: ownerRow, payload: {} });
    assert(antrean3.items[0].total_qty_sisa === 0 && antrean3.ringkasan.selesai === 1,
      'Setelah selesai, total_qty_sisa wajib 0 dan masuk ringkasan selesai');
  });

  // =========================================================================
  // TEST 23: PENAWARAN HARGA / ESTIMASI RAB (TANPA POTONG STOK & KONVERSI NOTA)
  // =========================================================================
  test('23. Penawaran Harga / Estimasi RAB: Buat RAB Tanpa Potong Stok, List, Konversi ke Nota, & Hapus', () => {
    const envRab = setupMockEnv();
    envRab.setupDatabase();
    const ownerRow = envRab.bacaSemua_('Users').find((u) => u.role === 'owner');
    const prod = envRab.tambahBaris_('Produk', [{
      sku: 'SKU-RAB-1', nama: 'Besi Beton 10mm', satuan_dasar: 'BTG',
      hpp: 58000, harga_ritel: 72000, stok: 80, aktif: true
    }], ownerRow.id)[0];

    // 23a. Buat RAB 20 batang + ongkir Rp 40.000 -> total = 1.440.000 + 40.000 = 1.480.000, stok TETAP 80
    const buat = envRab.aksiPenawaranCreate_({
      user: ownerRow,
      payload: {
        pelanggan_nama: 'Pak Hendra Mandor',
        pelanggan_hp: '081234567899',
        judul_proyek: 'Cor Dak Lantai 2',
        berlaku_hari: 7,
        pengiriman: 'dikirim',
        ongkir: 40000,
        items: [{ produk_id: prod.id, nama: prod.nama, satuan: 'BTG', faktor: 1, qty: 20, harga: 72000 }]
      }
    });
    assert(buat.penawaran && /^RAB-\d{8}-\d{4}$/.test(buat.penawaran.no_penawaran),
      `Nomor RAB wajib format RAB-YYYYMMDD-0001, aktual: ${buat.penawaran && buat.penawaran.no_penawaran}`);
    assert(buat.penawaran.total === 1480000, `Total RAB wajib Rp 1.480.000, aktual: ${buat.penawaran.total}`);
    assert(envRab.cariById_('Produk', prod.id).stok === 80, 'Pembuatan RAB TIDAK BOLEH memotong stok produk');

    // 23b. Pastikan RAB tidak masuk omset laporan penjualan
    const lap = envRab.aksiLaporanPenjualan_({ user: ownerRow, payload: { periode: 'hari_ini' } });
    assert(lap.ringkasan.total_omset === 0, 'Penawaran RAB tidak boleh masuk omset penjualan');

    // 23c. List RAB & konversi menjadi nota resmi
    const list1 = envRab.aksiPenawaranList_({ user: ownerRow, payload: {} });
    assert(list1.items.length === 1 && list1.items[0].items.length === 1 && list1.items[0].status === 'aktif',
      'penawaran.list wajib menampilkan 1 RAB aktif lengkap dengan array items');

    const konv = envRab.aksiPenawaranKonversi_({
      user: ownerRow,
      payload: { id: buat.penawaran.id, penjualan_id: 'pj-dummy-1', no_nota: 'INV-20261123-0001' }
    });
    assert(konv.penawaran.status === 'dikonversi' && konv.penawaran.no_nota_konversi === 'INV-20261123-0001',
      'penawaran.konversi wajib menandai status dikonversi dan menyimpan nomor nota');

    // 23d. Hapus RAB
    envRab.aksiPenawaranDelete_({ user: ownerRow, payload: { id: buat.penawaran.id } });
    const list2 = envRab.aksiPenawaranList_({ user: ownerRow, payload: {} });
    assert(list2.items.length === 0, 'RAB yang dihapus tidak boleh muncul di penawaran.list');
  });

  // =========================================================================
  // TEST 24: IMPORT / UPDATE MASSAL PRODUK & VARIAN VIA EXCEL / CSV
  // =========================================================================
  test('24. Import Massal Produk & Varian: Tambah + Auto-Kategori, Update Harga Aman, Koreksi Stok, Varian Rule #17, & RBAC', () => {
    const envImp = setupMockEnv();
    envImp.setupDatabase();
    const ownerRow = envImp.bacaSemua_('Users').find((u) => u.role === 'owner');
    const kasirRow = envImp.bacaSemua_('Users').find((u) => u.role === 'kasir') || envImp.tambahBaris_('Users', [{
      username: 'kasir_imp', nama: 'Kasir Import', role: 'kasir', pin_hash: 'x', salt: 'y', aktif: true
    }], ownerRow.id)[0];

    // 24a. Import 2 produk baru (+ 1 kategori baru otomatis) & 1 baris invalid (harga < HPP)
    const res1 = envImp.aksiProdukImportMassal_({
      user: ownerRow,
      payload: {
        items: [
          { _baris: 2, tipe: 'produk', sku: 'IMP-SMN-01', nama: 'Semen Padang 50Kg', kategori_nama: 'Semen Import', satuan_dasar: 'SAK', hpp: 55000, harga_ritel: 66000, harga_grosir: 63000, stok: 40 },
          { _baris: 3, tipe: 'produk', sku: 'IMP-CAT-01', nama: 'Cat Tembok 5Kg', kategori_nama: 'Semen Import', satuan_dasar: 'PAIL', hpp: 80000, harga_ritel: 105000, harga_grosir: 98000, stok: 15 },
          { _baris: 4, tipe: 'produk', sku: 'IMP-ERR-01', nama: 'Barang Rugi', satuan_dasar: 'PCS', hpp: 50000, harga_ritel: 40000, stok: 5 }
        ],
        opsi: { perbarui_harga: true, perbarui_stok: false, buat_kategori_otomatis: true }
      }
    });
    assert(res1.ditambah === 2 && res1.kategori_dibuat === 1 && res1.gagal.length === 1,
      `Hasil import 1 wajib tambah 2 produk, 1 kategori baru, 1 gagal; aktual: ${JSON.stringify(res1)}`);

    const prdSemen = envImp.bacaSemua_('Produk').find((p) => p.sku === 'IMP-SMN-01');
    assert(prdSemen && prdSemen.harga_ritel === 66000 && prdSemen.stok === 40, 'Produk baru hasil import wajib tersimpan lengkap');

    // 24b. Update harga massal TANPA timpa stok (opsi default perbarui_stok: false)
    const res2 = envImp.aksiProdukImportMassal_({
      user: ownerRow,
      payload: {
        items: [{ _baris: 2, tipe: 'produk', sku: 'IMP-SMN-01', hpp: 57000, harga_ritel: 70000, harga_grosir: 67000, stok: 999 }],
        opsi: { perbarui_harga: true, perbarui_stok: false }
      }
    });
    assert(res2.diperbarui === 1, 'Update harga berdasarkan SKU wajib memperbarui 1 produk');
    const prdAfter2 = envImp.cariById_('Produk', prdSemen.id);
    assert(prdAfter2.harga_ritel === 70000 && prdAfter2.stok === 40,
      `Harga harus berubah ke 70000 dan stok TETAP aman 40 saat perbarui_stok=false, aktual stok=${prdAfter2.stok}`);

    // 24c. Update stok eksplisit (perbarui_stok: true) wajib mencatat Kartu_Stok koreksi
    const res3 = envImp.aksiProdukImportMassal_({
      user: ownerRow,
      payload: {
        items: [{ _baris: 2, tipe: 'produk', id: prdSemen.id, stok: 55 }],
        opsi: { perbarui_harga: false, perbarui_info: false, perbarui_stok: true }
      }
    });
    assert(res3.diperbarui === 1 && envImp.cariById_('Produk', prdSemen.id).stok === 55, 'Stok harus berubah ke 55 saat perbarui_stok=true');
    const ksKoreksi = envImp.bacaSemua_('Kartu_Stok').filter((k) => k.produk_id === prdSemen.id && k.tipe === 'koreksi' && k.qty === 15);
    assert(ksKoreksi.length === 1 && ksKoreksi[0].saldo === 55 && ksKoreksi[0].hpp === 57000 && ksKoreksi[0].user_id === ownerRow.id && Boolean(ksKoreksi[0].keterangan),
      `Perubahan stok via import massal wajib tercatat lengkap sesuai skema Kartu_Stok (saldo=55, hpp=57000, user_id, keterangan), aktual: ${JSON.stringify(ksKoreksi[0])}`);

    // 24d. Tambah & update varian via import massal -> stok induk rekalkulasi otomatis (Rule #17)
    const resVar = envImp.aksiProdukImportMassal_({
      user: ownerRow,
      payload: {
        items: [
          { _baris: 2, tipe: 'varian', sku_induk: 'IMP-CAT-01', nama_varian: 'Putih Salju', sku: 'IMP-CAT-01-V1', hpp: 80000, harga_ritel: 110000, stok: 12 },
          { _baris: 3, tipe: 'varian', sku_induk: 'IMP-CAT-01', nama_varian: 'Abu Beton', sku: 'IMP-CAT-01-V2', hpp: 82000, harga_ritel: 112000, stok: 8 }
        ],
        opsi: { perbarui_harga: true, perbarui_stok: true }
      }
    });
    assert(resVar.varian_ditambah === 2, 'Harus menambah 2 varian baru');
    const prdCat = envImp.bacaSemua_('Produk').find((p) => p.sku === 'IMP-CAT-01');
    assert(prdCat.punya_varian === true && prdCat.stok === 20, `Stok induk cat wajib sum varian = 20, aktual: ${prdCat.stok}`);

    // 24e. RBAC via Router nyata (callApi): Kasir wajib ditolak FORBIDDEN
    const resKasirImp = callApi('produk.importMassal', tokenKasir, {
      items: [{ tipe: 'produk', nama: 'Coba Kasir', harga_ritel: 10000 }]
    });
    assert(resKasirImp.ok === false && resKasirImp.code === 'FORBIDDEN',
      `RBAC produk.importMassal wajib menolak Kasir (FORBIDDEN), aktual: ${JSON.stringify(resKasirImp)}`);
    assert(kasirRow && kasirRow.role === 'kasir', 'Kasir dummy tersedia untuk verifikasi');
  });

  // =========================================================================
  // TEST 25: CLOUD SYNC PRESET KATALOG PDF & BACKUP DATA 1-KLIK (REDACT SENSITIF)
  // =========================================================================
  test('25. Sinkronisasi Cloud Preset Katalog PDF & Backup Data 1-Klik (30 Sheet + Sensor Data Sensitif)', () => {
    const envSync = setupMockEnv();
    envSync.setupDatabase();
    const ownerRow = envSync.bacaSemua_('Users').find((u) => u.role === 'owner');

    // 25a. Simpan preset katalog ke Cloud Pengaturan
    const resPreset = envSync.aksiPengaturanSimpanPresetKatalog_({
      user: ownerRow,
      payload: {
        presets: [{
          id: 'pr_besi_1',
          nama: 'Katalog Besi & Baja',
          productIds: ['p1', 'p2', 'p3'],
          config: { judul: 'KATALOG BESI PROYEK', layout: 'table', modeHarga: 'grosir', tema: 'blue' }
        }]
      }
    });
    assert(resPreset.presets.length === 1 && resPreset.presets[0].nama === 'Katalog Besi & Baja',
      'pengaturan.simpanPresetKatalog wajib menyimpan dan mengembalikan daftar preset');

    // 25b. pengaturan.get wajib memuat preset katalog dari Cloud untuk perangkat lain
    const resGet = envSync.aksiPengaturanGet_({ user: ownerRow, payload: {} });
    assert(Array.isArray(resGet.pengaturan.katalog_pdf_presets) && resGet.pengaturan.katalog_pdf_presets.length === 1,
      'pengaturan.get wajib menyertakan katalog_pdf_presets hasil sinkronisasi Cloud');
    assert(resGet.pengaturan.katalog_pdf_presets[0].config.layout === 'table', 'Konfigurasi layout preset Cloud harus utuh');

    // 25c. sistem.backup (Khusus Owner) mengembalikan seluruh 30 sheet & menyensor pin_hash, salt, token_hash
    envSync.tambahBaris_('Sesi', [{
      user_id: ownerRow.id, token_hash: 'rahasia_token_xyz', kedaluwarsa: '2099-01-01 00:00:00', terakhir_aktif: '2026-11-25 10:00:00', perangkat: 'Chrome'
    }], ownerRow.id);
    const resBackup = envSync.aksiSistemBackup_({ user: ownerRow, payload: {} });
    assert(resBackup.total_sheet === 31 && resBackup.sheets && Array.isArray(resBackup.sheets.Produk),
      `sistem.backup wajib mengekspor seluruh 31 sheet database, aktual: ${resBackup.total_sheet}`);
    const userBackup = resBackup.sheets.Users[0];
    assert(userBackup && userBackup.pin_hash === undefined && userBackup.salt === undefined,
      'Backup Users WAJIB menyensor kolom pin_hash dan salt');
    const sesiBackup = resBackup.sheets.Sesi[0];
    assert(sesiBackup && sesiBackup.token_hash === undefined,
      'Backup Sesi WAJIB menyensor kolom token_hash');

    // 25d. RBAC sistem.backup via Router nyata: Kasir ditolak FORBIDDEN, Owner sukses
    const resBackupKasir = callApi('sistem.backup', tokenKasir, {});
    assert(resBackupKasir.ok === false && resBackupKasir.code === 'FORBIDDEN',
      `RBAC sistem.backup wajib menolak Kasir (FORBIDDEN), aktual: ${JSON.stringify(resBackupKasir)}`);
    const resBackupOwner = callApi('sistem.backup', tokenOwner, {});
    assert(resBackupOwner.ok === true && resBackupOwner.data.total_sheet === 31,
      'Owner wajib dapat mengeksekusi sistem.backup penuh (31 sheet)');
  });

  // =========================================================================
  // TEST 26: SINKRONISASI CLOUD TEMA, WARNA AKSEN, & TIPOGRAFI LINTAS PERANGKAT
  // =========================================================================
  test('26. Sinkronisasi Cloud Tema, Warna & Tipografi: Simpan, Sanitasi Batas, & Muat Lintas Sesi', () => {
    // 26a. Simpan tema valid via Router nyata (pengaturan.simpanTema)
    const resSimpan = callApi('pengaturan.simpanTema', tokenOwner, {
      theme: 'warm',
      accent: 'teal',
      fontFamily: 'jakarta',
      fontPct: 92,
      fontStyle: 'tegas'
    });
    assert(resSimpan.ok === true, `pengaturan.simpanTema wajib sukses, aktual: ${JSON.stringify(resSimpan)}`);
    assert(resSimpan.data.tampilan_tema.theme === 'warm' &&
      resSimpan.data.tampilan_tema.accent === 'teal' &&
      resSimpan.data.tampilan_tema.fontFamily === 'jakarta' &&
      resSimpan.data.tampilan_tema.fontPct === 92 &&
      resSimpan.data.tampilan_tema.fontStyle === 'tegas' &&
      Boolean(resSimpan.data.tampilan_tema.updatedAt),
      'Hasil simpan tema harus menyimpan seluruh 5 preferensi & stempel waktu updatedAt');

    // 26b. pengaturan.get & auth.me wajib mengembalikan tampilan_tema terbaru untuk perangkat lain
    const resGet = callApi('pengaturan.get', tokenKasir, {});
    assert(resGet.ok === true && resGet.data.pengaturan.tampilan_tema.accent === 'teal' && resGet.data.pengaturan.tampilan_tema.fontFamily === 'jakarta',
      'Perangkat lain (Kasir) wajib menerima tema Cloud terbaru lewat pengaturan.get');
    const resMe = callApi('auth.me', tokenKasir, {});
    assert(resMe.ok === true && resMe.data.pengaturan.tampilan_tema.theme === 'warm' && resMe.data.pengaturan.tampilan_tema.fontPct === 92,
      'auth.me saat boot aplikasi wajib menyertakan tampilan_tema Cloud terbaru');

    // 26c. Sanitasi nilai di luar daftar valid & clamp fontPct (85..125)
    const resClamp = callApi('pengaturan.simpanTema', tokenKasir, {
      theme: 'pelangi_invalid',
      accent: 'kuning_invalid',
      fontFamily: 'comicsans',
      fontPct: 500,
      fontStyle: 'aneh'
    });
    assert(resClamp.ok === true, 'Input invalid harus disanitasi aman ke fallback tanpa crash');
    assert(resClamp.data.tampilan_tema.theme === 'light' &&
      resClamp.data.tampilan_tema.accent === 'orange' &&
      resClamp.data.tampilan_tema.fontFamily === 'system' &&
      resClamp.data.tampilan_tema.fontPct === 125 &&
      resClamp.data.tampilan_tema.fontStyle === 'standar',
      `Sanitasi & clamp fontPct wajib tepat, aktual: ${JSON.stringify(resClamp.data.tampilan_tema)}`);
  });

  // =========================================================================
  // TEST 27: WAJIB BUKA SHIFT (SEMUA ROLE), TUTUP HARIAN (EOD), & TUTUP BULANAN + PERIOD LOCK
  // =========================================================================
  test('27. Wajib Buka Shift (Semua Role), Deteksi Shift Kemarin, Tutup Harian EOD, & Tutup Buku Bulanan (Period Lock)', () => {
    const envTb = setupMockEnv();
    envTb.setupDatabase();
    const ownerRow = envTb.bacaSemua_('Users').find((u) => u.role === 'owner');
    const prod = envTb.tambahBaris_('Produk', [{
      sku: 'SKU-TB-1', nama: 'Semen Holcim 50Kg', satuan_dasar: 'SAK',
      hpp: 50000, harga_ritel: 65000, stok: 30, aktif: true
    }], ownerRow.id)[0];
    const prodDead = envTb.tambahBaris_('Produk', [{
      sku: 'SKU-DEAD-1', nama: 'Cat Anti Bocor Slow', satuan_dasar: 'PAIL',
      hpp: 120000, harga_ritel: 150000, stok: 5, aktif: true
    }], ownerRow.id)[0];

    // 27a. Default wajib_buka_shift = true -> transaksi TANPA buka shift WAJIB ditolak (termasuk Owner)
    let ditolakTanpaShift = false;
    try {
      envTb.aksiPenjualanCreate_({
        user: ownerRow,
        payload: {
          items: [{ produk_id: prod.id, satuan: 'SAK', faktor: 1, qty: 2, harga: 65000 }],
          pembayaran: [{ metode: 'tunai', jumlah: 130000 }]
        }
      });
    } catch (e) {
      ditolakTanpaShift = String(e.message || '').includes('SHIFT_BELUM_DIBUKA');
    }
    assert(ditolakTanpaShift === true, 'Saat wajib_buka_shift aktif, Owner/Kasir wajib ditolak transaksi bila belum buka shift');

    // 27b. Buka shift -> transaksi sukses!
    const shBuka = envTb.aksiShiftBuka_({ user: ownerRow, payload: { modal_awal: 300000, catatan: 'Shift pagi' } });
    assert(shBuka.shift && shBuka.shift.status === 'aktif', 'Shift berhasil dibuka');
    const jualOk = envTb.aksiPenjualanCreate_({
      user: ownerRow,
      payload: {
        items: [{ produk_id: prod.id, satuan: 'SAK', faktor: 1, qty: 2, harga: 65000 }],
        pembayaran: [{ metode: 'tunai', jumlah: 130000 }]
      }
    });
    assert(jualOk.penjualan && jualOk.penjualan.total === 130000, 'Setelah buka shift, transaksi penjualan wajib sukses');

    // 27c. Tutup Harian saat masih ada shift aktif wajib ditolak
    const tglHariIni = envTb.sekarang_().substring(0, 10);
    const blnIni = tglHariIni.substring(0, 7);
    let eodDitolak = false;
    try {
      envTb.aksiTutupBukuTutupHarian_({
        user: ownerRow,
        payload: { tanggal: tglHariIni, setoran_owner: 130000, sisa_modal_besok: 300000 }
      });
    } catch (e) {
      eodDitolak = e.code === 'CONFLICT';
    }
    assert(eodDitolak === true, 'Tutup Harian wajib menolak bila masih ada shift aktif hari ini');

    // 27d. Tutup shift lalu Tutup Harian -> sukses & shift.aktif menyarankan sisa_modal_besok!
    envTb.aksiShiftTutup_({ user: ownerRow, payload: { id: shBuka.shift.id, kas_fisik: 430000, catatan: 'Klop' } });
    const eodOk = envTb.aksiTutupBukuTutupHarian_({
      user: ownerRow,
      payload: { tanggal: tglHariIni, setoran_owner: 130000, sisa_modal_besok: 300000, catatan: 'Setor Owner' }
    });
    assert(eodOk.arsip && eodOk.arsip.setoran_owner === 130000 && eodOk.arsip.sisa_modal_besok === 300000,
      'Arsip Tutup Harian wajib menyimpan setoran_owner dan sisa_modal_besok');

    const cekShiftNext = envTb.aksiShiftAktif_({ user: ownerRow, payload: {} });
    assert(cekShiftNext.saran_modal_awal === 300000, `shift.aktif wajib menyarankan modal awal dari sisa_modal_besok (300000), aktual: ${cekShiftNext.saran_modal_awal}`);

    // 27e. Evaluasi Bulanan: omset = 130000, laba kotor = 30000, slow_moving memuat prodDead (modal 600000)
    const evalBln = envTb.aksiTutupBukuEvaluasiBulanan_({ user: ownerRow, payload: { periode: blnIni } });
    assert(evalBln.ringkasan.omset_bersih === 130000 && evalBln.ringkasan.laba_kotor === 30000,
      `Evaluasi bulanan wajib menghitung omset 130000 & laba kotor 30000, aktual: ${JSON.stringify(evalBln.ringkasan)}`);
    assert(evalBln.slow_moving.some((d) => d.id === prodDead.id && d.nilai_modal === 600000),
      'Evaluasi bulanan wajib mendeteksi produk slow-moving / dead stock beserta nilai modal tertahan');

    // 27f. Tutup Buku Bulanan -> periode terkunci, transaksi & biaya pada bulan terkunci DITOLAK, & snapshot beku!
    const tutupBln = envTb.aksiTutupBukuTutupBulanan_({ user: ownerRow, payload: { periode: blnIni, catatan: 'Tutup buku akhir bulan' } });
    assert(tutupBln.arsip && tutupBln.arsip.status === 'terkunci', 'Tutup buku bulanan wajib mengunci periode');

    const valuasiSaatTutup = evalBln.ringkasan.valuasi_stok;
    envTb.ubahBaris_('Produk', [{ id: prodDead.id, data: { stok: 99 } }], ownerRow.id);
    const evalTerkunci = envTb.aksiTutupBukuEvaluasiBulanan_({ user: ownerRow, payload: { periode: blnIni } });
    assert(evalTerkunci.dari_snapshot === true && evalTerkunci.ringkasan.valuasi_stok === valuasiSaatTutup,
      `Bulan terkunci wajib menyajikan snapshot beku (${valuasiSaatTutup}) meski stok berubah di masa depan, aktual: ${evalTerkunci.ringkasan.valuasi_stok}`);
    envTb.ubahBaris_('Produk', [{ id: prodDead.id, data: { stok: 5 } }], ownerRow.id);

    let biayaTerkunci = false;
    try {
      envTb.aksiBiayaCreate_({ user: ownerRow, payload: { kategori: 'Listrik', nominal: 50000, keterangan: 'Tes kunci periode' } });
    } catch (e) {
      biayaTerkunci = String(e.message || '').includes('PERIODE_TERKUNCI');
    }
    assert(biayaTerkunci === true, 'Periode bulanan terkunci wajib menolak pencatatan biaya baru');

    // 27g. RBAC: Kasir dilarang tutupBuku.tutupBulanan; Owner bisa bukaKunci dengan alasan
    const resKasirTutup = callApi('tutupBuku.tutupBulanan', tokenKasir, { periode: blnIni });
    assert(resKasirTutup.ok === false && resKasirTutup.code === 'FORBIDDEN', 'Kasir wajib ditolak menjalankan tutupBuku.tutupBulanan');

    const bukaKunci = envTb.aksiTutupBukuBukaKunci_({ user: ownerRow, payload: { periode: blnIni, alasan: 'Koreksi darurat audit' } });
    assert(bukaKunci.arsip && bukaKunci.arsip.status === 'dibuka_kembali', 'Owner wajib bisa membuka kunci periode dengan alasan');

    // Setelah dibuka kunci, biaya kembali bisa dicatat
    const biayaOk = envTb.aksiBiayaCreate_({ user: ownerRow, payload: { kategori: 'Listrik', nominal: 50000, keterangan: 'Setelah buka kunci' } });
    assert(biayaOk && biayaOk.no_transaksi, 'Setelah buka kunci periode, transaksi/biaya kembali diizinkan');

    // 27h. Deteksi Shift Kemarin Belum Ditutup -> shift.aktif flag true & transaksi diblokir SHIFT_KEMARIN_BELUM_TUTUP
    const shLama = envTb.aksiShiftBuka_({ user: ownerRow, payload: { modal_awal: 200000, catatan: 'Shift kemarin simulasi' } });
    envTb.ubahBaris_('Shift_Kasir', [{ id: shLama.shift.id, data: { waktu_buka: '2026-01-01 08:00:00' } }], ownerRow.id);
    const cekKemarin = envTb.aksiShiftAktif_({ user: ownerRow, payload: {} });
    assert(cekKemarin.shift_kemarin_belum_tutup === true, 'shift.aktif wajib mendeteksi shift kemarin yang belum ditutup');
    let blokirShiftKemarin = false;
    try {
      envTb.aksiPenjualanCreate_({
        user: ownerRow,
        payload: {
          items: [{ produk_id: prod.id, satuan: 'SAK', faktor: 1, qty: 1, harga: 65000 }],
          pembayaran: [{ metode: 'tunai', jumlah: 65000 }]
        }
      });
    } catch (e) {
      blokirShiftKemarin = String(e.message || '').includes('SHIFT_KEMARIN_BELUM_TUTUP');
    }
    assert(blokirShiftKemarin === true, 'Transaksi wajib diblokir (SHIFT_KEMARIN_BELUM_TUTUP) bila shift hari kemarin belum ditutup');
  });

  console.log('\n=============================================');
  console.log(`TOTAL UJI AUDIT: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log('=============================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit();

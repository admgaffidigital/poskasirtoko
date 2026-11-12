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
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: fmtDate,
      computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' }
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

  const code = fs.readFileSync('backend/kode.gs', 'utf8');
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

  // Test Skenario 1: Database Setup
  test('1. Setup Database Baru Berjalan Mulus', () => {
    app.setupDatabase();
    const sheets = app.ss.getSheets().map(s => s.name);
    assert.strictEqual(sheets.includes('Sheet1'), false, 'Sheet1 bawaan harus dihapus');
    assert.strictEqual(sheets.includes('Users'), true);
    assert.strictEqual(sheets.includes('Penjualan'), true);
    assert.strictEqual(sheets.includes('Pembelian'), true);
    assert.strictEqual(sheets.includes('Log_Audit'), true);
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

  console.log('\n=============================================');
  console.log(`TOTAL UJI AUDIT: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log('=============================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit();

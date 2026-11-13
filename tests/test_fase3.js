/**
 * test_fase3.js — Uji Otomatis Lengkap Fase 3 (Stok & Pembelian)
 * Menguji: Supplier, POS Pembelian, Kartu Stok, dan Stok Opname
 */

const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

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
  constructor() { this.sheets = [new MockSheet('Sheet1')]; this.tz = null; }
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
    }
  };

  const code = fs.readFileSync('backend/kode.gs', 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  return sandbox;
}

async function runTests() {
  console.log('[SETUP] Memulai Pengujian Fase 3 (Stok & Pembelian)...');
  const env = setupMockEnv();

  // Inisialisasi Database
  env.setupDatabase();
  console.log('✔ Setup database berhasil');

  let passed = 0;
  let failed = 0;
  function assert(cond, msg) {
    if (cond) {
      console.log('  ✔ ' + msg);
      passed++;
    } else {
      console.error('  ✘ GAGAL: ' + msg);
      failed++;
    }
  }

  // Login Owner
  const ownerUser = env.bacaSemua_('Users').find(u => u.username === 'owner');
  const ctxOwner = {
    user: { id: ownerUser.id, username: 'owner', role: 'owner' },
    payload: {},
    token: 'token-owner'
  };

  // Setup Kategori & Produk dasar untuk pengujian
  console.log('\n[TEST 1] Setup Data Produk & Varian untuk Beli');
  const katRes = env.tambahBaris_('Kategori', [{ nama: 'Material', urutan: 1 }], ctxOwner.user.id);
  const katId = katRes[0].id;

  // Produk non-varian: Semen Tiga Roda (stok awal 10 sak, HPP 50.000)
  const prodRes = env.tambahBaris_('Produk', [{
    sku: 'SMN-01',
    nama: 'Semen Tiga Roda 50kg',
    kategori_id: katId,
    satuan_dasar: 'sak',
    hpp: 50000,
    harga_ritel: 65000,
    harga_grosir: 60000,
    stok: 10,
    stok_min: 5,
    punya_varian: false,
    aktif: true
  }], ctxOwner.user.id);
  const semenId = prodRes[0].id;

  // Produk bervarian: Cat Tembok 5kg (varian Putih stok 5 HPP 80.000, varian Biru stok 5 HPP 85.000)
  const catRes = env.tambahBaris_('Produk', [{
    sku: 'CAT-01',
    nama: 'Cat Tembok 5kg',
    kategori_id: katId,
    satuan_dasar: 'kaleng',
    hpp: 82500,
    harga_ritel: 110000,
    harga_grosir: 105000,
    stok: 10,
    stok_min: 2,
    punya_varian: true,
    aktif: true
  }], ctxOwner.user.id);
  const catId = catRes[0].id;

  const varPutihRes = env.tambahBaris_('Varian', [{
    produk_id: catId,
    nama_varian: 'Putih',
    sku: 'CAT-01-W',
    hpp: 80000,
    harga_ritel: 110000,
    harga_grosir: 105000,
    stok: 5,
    stok_min: 2,
    aktif: true
  }], ctxOwner.user.id);
  const varPutihId = varPutihRes[0].id;

  assert(semenId && catId && varPutihId, 'Master produk & varian berhasil disiapkan');

  // ==========================================
  // [TEST 2] CRUD Master Supplier
  // ==========================================
  console.log('\n[TEST 2] CRUD Master Supplier');
  const resSupCreate = env.aksiSupplierCreate_({
    ...ctxOwner,
    payload: {
      nama: 'PT Semen Perkasa',
      kontak: 'Budi Hartono',
      hp: '081234567890',
      alamat: 'Jl. Raya Industri No. 45',
      catatan: 'BCA 123456789 a.n PT Semen Perkasa'
    }
  });
  const supId = resSupCreate.supplier.id;
  assert(resSupCreate.supplier.nama === 'PT Semen Perkasa', 'supplier.create berhasil menambahkan PT Semen Perkasa');

  // Supplier List
  const supList = env.aksiSupplierList_({ ...ctxOwner, payload: { q: 'Perkasa' } });
  assert(supList.items.length === 1 && supList.items[0].id === supId, 'supplier.list menampilkan supplier sesuai pencarian');
  assert(supList.items[0].saldo_hutang === 0, 'saldo hutang awal supplier adalah Rp 0');

  // Supplier Update
  env.aksiSupplierUpdate_({
    ...ctxOwner,
    payload: { id: supId, kontak: 'Budi Santoso (Updated)' }
  });
  const supUpdated = env.cariById_('Supplier', supId);
  assert(supUpdated.kontak === 'Budi Santoso (Updated)', 'supplier.update berhasil memperbarui data kontak');

  // ==========================================
  // [TEST 3] Pembelian Tunai Normal & Moving Average HPP
  // ==========================================
  console.log('\n[TEST 3] Pembelian Tunai Normal (Moving Average HPP)');
  // Semen: stok lama 10 @ HPP 50.000.
  // Beli masuk: 10 sak @ harga beli 55.000, total 550.000 tunai lunas.
  // Rumus HPP baru: (10 * 50.000 + 10 * 55.000) / (10 + 10) = 1.050.000 / 20 = 52.500.
  const resBeli1 = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      no_faktur_supplier: 'FP-99881',
      diskon: 0,
      bayar: 550000,
      items: [{
        produk_id: semenId,
        satuan: 'sak',
        faktor: 1,
        qty: 10,
        harga_beli: 550000 / 10
      }]
    }
  });

  assert(resBeli1.status_bayar === 'lunas', 'Status bayar pembelian tunai pas adalah "lunas"');
  assert(resBeli1.no_faktur.startsWith('PB-'), 'Nomor faktur berformat PB-YYYYMMDD-XXXX');

  const semenSetelahBeli = env.cariById_('Produk', semenId);
  assert(semenSetelahBeli.stok === 20, 'Stok semen bertambah dari 10 menjadi 20 sak');
  assert(semenSetelahBeli.hpp === 52500, 'HPP moving average terhitung tepat: Rp 52.500');

  // Periksa Kartu Stok
  const ksBeli = env.bacaSemua_('Kartu_Stok').filter(k => k.ref_id === resBeli1.no_faktur);
  assert(ksBeli.length === 1, 'Tercatat 1 baris mutasi di Kartu_Stok');
  assert(ksBeli[0].tipe === 'beli' && ksBeli[0].qty === 10 && ksBeli[0].saldo === 20, 'Kartu_Stok tipe beli, qty +10, saldo 20');

  // ==========================================
  // [TEST 4] Pembelian dengan Diskon Faktur Proporsional (Aturan Bisnis #10)
  // ==========================================
  console.log('\n[TEST 4] Pembelian dengan Diskon Faktur Proporsional');
  // Semen saat ini: stok 20 @ HPP 52.500.
  // Beli: 10 sak @ 60.000 = 600.000.
  // Diskon faktur: 50.000 -> Total tagihan 550.000.
  // Harga beli efektif: 550.000 / 10 = 55.000.
  // HPP baru: (20 * 52.500 + 10 * 55.000) / 30 = (1.050.000 + 550.000) / 30 = 1.600.000 / 30 = 53.333.
  const resBeli2 = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      diskon: 50000,
      bayar: 550000,
      items: [{
        produk_id: semenId,
        satuan: 'sak',
        faktor: 1,
        qty: 10,
        harga_beli: 60000
      }]
    }
  });

  const semenSetelahBeli2 = env.cariById_('Produk', semenId);
  assert(semenSetelahBeli2.stok === 30, 'Stok semen bertambah menjadi 30 sak');
  assert(semenSetelahBeli2.hpp === 53333, 'HPP dihitung dari harga beli efektif setelah diskon proporsional: Rp 53.333');

  // ==========================================
  // [TEST 5] Pembelian Produk Multi-Varian
  // ==========================================
  console.log('\n[TEST 5] Pembelian Produk Multi-Varian');
  // Cat Putih: stok lama 5 @ HPP 80.000.
  // Beli: 5 kaleng @ 90.000 = 450.000.
  // HPP baru varian putih: (5 * 80.000 + 5 * 90.000) / 10 = 85.000.
  const resBeli3 = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      bayar: 450000,
      items: [{
        produk_id: catId,
        varian_id: varPutihId,
        satuan: 'kaleng',
        faktor: 1,
        qty: 5,
        harga_beli: 90000
      }]
    }
  });

  const varPutihSetelahBeli = env.cariById_('Varian', varPutihId);
  const catSetelahBeli = env.cariById_('Produk', catId);
  assert(varPutihSetelahBeli.stok === 10, 'Stok varian putih bertambah menjadi 10');
  assert(varPutihSetelahBeli.hpp === 85000, 'HPP varian putih terhitung tepat Rp 85.000');
  assert(catSetelahBeli.stok === 15, 'Stok total produk induk cat bertambah menjadi 15');

  // ==========================================
  // [TEST 6] Pembelian Tempo / Hutang & Proteksi Hapus Supplier
  // ==========================================
  console.log('\n[TEST 6] Pembelian Tempo / Hutang ke Supplier');
  // Total 1.000.000, DP 200.000, sisa hutang 800.000
  const resBeliTempo = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      bayar: 200000,
      jatuh_tempo: '2026-12-12',
      items: [{
        produk_id: semenId,
        satuan: 'sak',
        faktor: 1,
        qty: 10,
        harga_beli: 100000
      }]
    }
  });

  assert(resBeliTempo.status_bayar === 'sebagian', 'Status bayar adalah "sebagian"');
  const semuaHutang = env.bacaSemua_('Hutang').filter(h => h.pembelian_id === resBeliTempo.id);
  assert(semuaHutang.length === 1, 'Tercatat 1 record Hutang');
  assert(semuaHutang[0].sisa === 800000, 'Sisa hutang tercatat Rp 800.000');

  // Supplier List sekarang harus mencatat saldo hutang
  const supListWithHutang = env.aksiSupplierList_({ ...ctxOwner, payload: { q: 'Perkasa' } });
  assert(supListWithHutang.items[0].saldo_hutang === 800000, 'supplier.list menampilkan saldo hutang berjalan Rp 800.000');

  // Coba hapus supplier saat masih ada hutang aktif
  let tolakHapus = false;
  try {
    env.aksiSupplierDelete_({ ...ctxOwner, payload: { id: supId } });
  } catch (err) {
    tolakHapus = (err.code === 'CONFLICT');
  }
  assert(tolakHapus, 'supplier.delete menolak penghapusan supplier saat saldo hutang masih aktif (CONFLICT)');

  // ==========================================
  // [TEST 7] Rincian Faktur Pembelian (pembelian.detail & pembelian.list)
  // ==========================================
  console.log('\n[TEST 7] Riwayat & Rincian Pembelian');
  const listBeli = env.aksiPembelianList_({ ...ctxOwner, payload: { supplier_id: supId } });
  assert(listBeli.total === 4, 'pembelian.list menampilkan 4 faktur pembelian untuk supplier ini');

  const detBeli = env.aksiPembelianDetail_({ ...ctxOwner, payload: { id: resBeliTempo.id } });
  assert(detBeli.pembelian.no_faktur === resBeliTempo.no_faktur, 'pembelian.detail mengambil faktur yang benar');
  assert(detBeli.items.length === 1, 'pembelian.detail memuat rincian item');
  assert(detBeli.hutang && detBeli.hutang.sisa === 800000, 'pembelian.detail memuat status hutang terkait');

  // ==========================================
  // [TEST 8] Kartu Stok (kartuStok.list)
  // ==========================================
  console.log('\n[TEST 8] Audit Buku Besar Kartu Stok');
  const ksListSemen = env.aksiKartuStokList_({ ...ctxOwner, payload: { produk_id: semenId } });
  assert(ksListSemen.items.length >= 3, 'kartuStok.list menampilkan riwayat mutasi semen');
  assert(ksListSemen.items[0].produk_nama.includes('Semen'), 'kartuStok.list memperkaya nama produk');
  assert(ksListSemen.items[0].petugas_nama === 'Pemilik Toko' || ksListSemen.items[0].petugas_nama === 'owner', 'kartuStok.list memperkaya nama petugas (Pemilik Toko)');

  // ==========================================
  // [TEST 9] Stok Opname Langsung Disetujui (Aturan Bisnis #8 & #12)
  // ==========================================
  console.log('\n[TEST 9] Stok Opname Langsung Disetujui (HPP Tetap)');
  // Semen saat ini stok 40.
  // Hitung fisik ternyata hanya 38 (selisih -2 sak, alasan: sobek bocor).
  const hppSebelumOpname = env.cariById_('Produk', semenId).hpp;
  const resOpname1 = env.aksiOpnameCreate_({
    ...ctxOwner,
    payload: {
      produk_id: semenId,
      qty_fisik: 38,
      alasan: 'Sobek bocor saat bongkar muat',
      langsung_setuju: true
    }
  });

  assert(resOpname1.status === 'disetujui', 'Status opname langsung_setuju adalah "disetujui"');
  const semenSetelahOpname = env.cariById_('Produk', semenId);
  assert(semenSetelahOpname.stok === 38, 'Stok sistem disesuaikan menjadi 38 sak');
  assert(semenSetelahOpname.hpp === hppSebelumOpname, 'Aturan Bisnis #12 terpenuhi: HPP TIDAK BERUBAH saat opname');

  // Periksa Kartu Stok untuk opname
  const ksOpname = env.bacaSemua_('Kartu_Stok').filter(k => k.ref_id === resOpname1.no_opname);
  assert(ksOpname.length === 1, 'Opname tercatat di Kartu_Stok');
  assert(ksOpname[0].tipe === 'opname' && ksOpname[0].qty === -2 && ksOpname[0].saldo === 38, 'Kartu_Stok opname qty -2, saldo akhir 38');

  // Periksa Log Audit (Aturan Bisnis #8)
  const auditOpname = env.bacaSemua_('Log_Audit').filter(a => a.modul === 'STOK');
  assert(auditOpname.length >= 1, 'Aturan Bisnis #8 terpenuhi: Opname dicatat di Log_Audit');

  // Regresi: fisik KOSONG (0) harus bisa disesuaikan, stok sistem menjadi 0
  const resOpnameNol = env.aksiOpnameCreate_({
    ...ctxOwner,
    payload: {
      produk_id: semenId,
      qty_fisik: 0,
      alasan: 'Fisik kosong, stok sistem salah catat',
      langsung_setuju: true
    }
  });
  assert(resOpnameNol.status === 'disetujui', 'Opname dengan fisik 0 berhasil disetujui');
  assert(env.cariById_('Produk', semenId).stok === 0, 'Stok sistem disesuaikan menjadi 0 (fisik kosong)');
  const ksNol = env.bacaSemua_('Kartu_Stok').filter(k => k.ref_id === resOpnameNol.no_opname);
  assert(ksNol.length === 1 && ksNol[0].qty === -38 && ksNol[0].saldo === 0, 'Kartu_Stok opname fisik 0: qty -38, saldo 0');

  // ==========================================
  // [TEST 10] Stok Opname Alur Draft -> Approve
  // ==========================================
  console.log('\n[TEST 10] Stok Opname Alur Draft -> Approve');
  // Varian Cat Putih stok 10. Hitung fisik 12 (kelebihan 2 kaleng bonus vendor).
  const resOpnameDraft = env.aksiOpnameCreate_({
    ...ctxOwner,
    payload: {
      produk_id: catId,
      varian_id: varPutihId,
      qty_fisik: 12,
      alasan: 'Bonus vendor belum tercatat',
      langsung_setuju: false
    }
  });

  assert(resOpnameDraft.status === 'draft', 'Status awal opname adalah "draft"');
  const varPutihSebelumApprove = env.cariById_('Varian', varPutihId);
  assert(varPutihSebelumApprove.stok === 10, 'Stok varian putih belum berubah selama masih draft');

  // Approve Draft
  const resApprove = env.aksiOpnameApprove_({
    ...ctxOwner,
    payload: { id: resOpnameDraft.id }
  });

  const varPutihSetelahApprove = env.cariById_('Varian', varPutihId);
  assert(varPutihSetelahApprove.stok === 12, 'Setelah approve, stok varian putih disesuaikan menjadi 12');
  const opnameFinal = env.cariById_('Opname', resOpnameDraft.id);
  assert(opnameFinal.status === 'disetujui', 'Status opname berubah menjadi "disetujui"');

  // ==========================================
  // [TEST 11] Diskon Persen Supplier Per Produk
  // ==========================================
  console.log('\n[TEST 11] Diskon Persen Supplier Per Produk');
  // Semen stok 0 (setelah opname fisik kosong). Beli 10 sak @ 100.000 = 1.000.000.
  // Diskon supplier 10% -> 900.000. Diskon faktur 50.000 -> tagihan 850.000.
  // HPP efektif = 850.000 / 10 = 85.000 (stok lama 0).
  const resBeliDiskon = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      diskon: 50000,
      bayar: 850000,
      items: [{
        produk_id: semenId,
        satuan: 'sak',
        faktor: 1,
        qty: 10,
        harga_beli: 100000,
        diskon_persen: 10
      }]
    }
  });
  const pbDiskon = env.cariById_('Pembelian', resBeliDiskon.id);
  assert(pbDiskon.subtotal === 1000000, 'Subtotal kotor faktur Rp 1.000.000');
  assert(pbDiskon.diskon_item === 100000, 'Total diskon supplier per barang Rp 100.000');
  assert(pbDiskon.total === 850000, 'Total tagihan = 1.000.000 - 100.000 - 50.000 = Rp 850.000');
  assert(resBeliDiskon.status_bayar === 'lunas', 'Status bayar lunas pada tagihan setelah diskon');
  const itemDiskon = env.bacaSemua_('Pembelian_Item').filter(i => i.pembelian_id === pbDiskon.id)[0];
  assert(itemDiskon.diskon_persen === 10 && itemDiskon.diskon_item === 100000, 'Item menyimpan diskon_persen 10% dan nilai Rp 100.000');
  assert(itemDiskon.harga_beli === 100000 && itemDiskon.subtotal === 900000, 'Harga beli tetap kotor, subtotal item bersih Rp 900.000');
  assert(env.cariById_('Produk', semenId).hpp === 85000, 'HPP dihitung dari harga bersih setelah diskon % dan diskon faktur: Rp 85.000');

  let ditolakPersen = false;
  try {
    env.aksiPembelianCreate_({
      ...ctxOwner,
      payload: { supplier_id: supId, diskon: 0, bayar: 0, items: [{ produk_id: semenId, satuan: 'sak', faktor: 1, qty: 1, harga_beli: 1000, diskon_persen: 150 }] }
    });
  } catch (e) { ditolakPersen = true; }
  assert(ditolakPersen, 'Diskon persen di atas 100% ditolak validasi');

  // Selesai
  console.log('\n=============================================');
  console.log(`TOTAL UJI FASE 3: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log('=============================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal error dalam tes:', err);
  process.exit(1);
});

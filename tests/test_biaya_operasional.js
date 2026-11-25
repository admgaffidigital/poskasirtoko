/**
 * test_biaya_operasional.js — Pengujian Komprehensif Biaya Operasional Toko & Integrasi Kasir
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
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      flush: () => {},
      getUi: () => ({ alert: () => {}, createMenu: () => ({ addItem: () => ({ addItem: () => ({ addSeparator: () => ({ addItem: () => ({ addToUi: () => {} }) }) }) }) }) })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => props.get(k) || null,
        setProperty: (k, v) => props.set(k, String(v)),
        getProperties: () => Object.fromEntries(props)
      })
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
    LockService: {
      getScriptLock: () => lock
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: fmtDate,
      computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeHmacSha256Signature: (val, key) => crypto.createHmac('sha256', key).update(val).digest(),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      newBlob: () => ({})
    }
  };

  const context = vm.createContext(sandbox);
  const code = require('./_load_gas')();
  vm.runInContext(code, context);

  return sandbox;
}

let passed = 0;
let failed = 0;
function assert(kondisi, pesan) {
  if (kondisi) {
    console.log(`  ✔ [PASS] ${pesan}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${pesan}`);
    failed++;
  }
}

async function run() {
  console.log(`🧪 Memulai Pengujian Modul Biaya Operasional & Integrasi Keuangan...`);
  const env = setupMockEnv();

  // Setup DB
  env.setupDatabase();

  const ctxOwner = { user: { id: 'user-owner', username: 'owner', role: 'owner', nama: 'Bapak Owner' } };
  const ctxKasir = { user: { id: 'user-kasir-1', username: 'kasir1', role: 'kasir', nama: 'Kasir Susi' } };
  env.aksiPengaturanSet_({ ...ctxOwner, payload: { wajib_buka_shift: false } });

  // 1. Catat Biaya Kasir (Petty cash untuk bensin pickup toko)
  const resB1 = env.aksiBiayaCreate_({
    ...ctxKasir,
    payload: {
      kategori: 'Transportasi & Pengiriman',
      nominal: 25000,
      keterangan: 'Bensin pickup bawa pasir ke Proyek Citra',
      sumber_dana: 'kas_kasir'
    }
  });
  assert(resB1 && resB1.no_transaksi && resB1.no_transaksi.startsWith('EXP-'), `Biaya kasir berhasil dibuat: ${resB1.no_transaksi}`);

  // 2. Catat Biaya Toko (Listrik Toko dari kas toko)
  const resB2 = env.aksiBiayaCreate_({
    ...ctxOwner,
    payload: {
      kategori: 'Listrik, Air & Internet',
      nominal: 150000,
      keterangan: 'Token listrik PLN toko',
      sumber_dana: 'kas_toko'
    }
  });
  assert(resB2 && resB2.no_transaksi, `Biaya kas toko berhasil dibuat: ${resB2.no_transaksi}`);

  // 3. Catat Biaya Bank (Transfer gaji kuli)
  const resB3 = env.aksiBiayaCreate_({
    ...ctxOwner,
    payload: {
      kategori: 'Upah Angkut / Kuli Bongkar',
      nominal: 300000,
      keterangan: 'Transfer upah bongkar semen 2 truk',
      sumber_dana: 'bank'
    }
  });
  assert(resB3 && resB3.no_transaksi, `Biaya transfer bank berhasil dibuat: ${resB3.no_transaksi}`);

  // 4. Uji List Biaya (biaya.list)
  const listBiaya = env.aksiBiayaList_({
    ...ctxOwner,
    payload: { periode: 'today' }
  });
  assert(listBiaya.items.length === 3, `Jumlah transaksi biaya hari ini harus 3. Hasil: ${listBiaya.items.length}`);
  assert(listBiaya.ringkasan.total_nominal === 475000, `Total biaya operasional harus 475.000. Hasil: ${listBiaya.ringkasan.total_nominal}`);
  assert(listBiaya.ringkasan.total_kas_kasir === 25000, `Total kas kasir harus 25.000. Hasil: ${listBiaya.ringkasan.total_kas_kasir}`);
  assert(listBiaya.ringkasan.total_kas_toko === 150000, `Total kas toko harus 150.000. Hasil: ${listBiaya.ringkasan.total_kas_toko}`);
  assert(listBiaya.ringkasan.total_bank === 300000, `Total bank harus 300.000. Hasil: ${listBiaya.ringkasan.total_bank}`);

  // 5. Uji Integrasi ke Shift Kasir (penjualan.shiftKasir)
  // Buat penjualan tunai 100.000 oleh Kasir Susi
  const prod = env.aksiProdukCreate_({
    ...ctxOwner,
    payload: {
      nama: 'Semen Gresik 40kg',
      kategori_id: '',
      satuan_dasar: 'ZAK',
      harga_ritel: 50000,
      hpp: 42000,
      stok: 100,
      stok_min: 10
    }
  });
  const prodId = prod.produk ? prod.produk.id : (prod.item ? prod.item.id : prod.id);

  env.aksiPenjualanCreate_({
    ...ctxKasir,
    payload: {
      metode_bayar: 'tunai',
      pembayaran: [{ metode: 'tunai', jumlah: 100000 }],
      items: [{ produk_id: prodId, nama: 'Semen Gresik 40kg', satuan: 'ZAK', faktor: 1, qty: 2, harga: 50000, hpp: 42000, subtotal: 100000 }]
    }
  });

  const shiftKasir = env.aksiPenjualanShiftKasir_({
    ...ctxKasir,
    payload: {
      kasir_id: 'user-kasir-1',
      modal_awal: 100000
    }
  });

  // Modal 100.000 + Tunai 100.000 - Biaya Kasir 25.000 = Total Laci 175.000!
  assert(shiftKasir.total_biaya_kasir === 25000, `Pengeluaran kasir di shift harus 25.000. Hasil: ${shiftKasir.total_biaya_kasir}`);
  assert(shiftKasir.total_laci === 175000, `Uang fisik laci kasir harus 175.000. Hasil: ${shiftKasir.total_laci}`);

  // 6. Uji Integrasi ke Laporan Laba Rugi
  const labaRugi = env.aksiLaporanLabaRugi_({
    ...ctxOwner,
    payload: { periode: 'today' }
  });
  assert(labaRugi.ringkasan.total_biaya_operasional === 475000, `Biaya operasional di Laba Rugi harus 475.000. Hasil: ${labaRugi.ringkasan.total_biaya_operasional}`);
  // Omset 100.000 - HPP 84.000 = Laba Kotor 16.000.
  // Laba Bersih Riil = 16.000 - 475.000 = -459.000
  assert(labaRugi.ringkasan.laba_bersih_riil === -459000, `Laba bersih riil harus -459.000. Hasil: ${labaRugi.ringkasan.laba_bersih_riil}`);

  // 7. Uji Integrasi ke Laporan Arus Kas
  const arusKas = env.aksiLaporanArusKas_({
    ...ctxOwner,
    payload: { periode: 'today' }
  });
  assert(arusKas.rincian_keluar.biaya_operasional_tunai === 175000, `Arus kas keluar biaya tunai (kasir 25k + toko 150k) harus 175.000. Hasil: ${arusKas.rincian_keluar.biaya_operasional_tunai}`);
  assert(arusKas.rincian_keluar.biaya_operasional_bank === 300000, `Arus kas keluar biaya bank harus 300.000. Hasil: ${arusKas.rincian_keluar.biaya_operasional_bank}`);

  // 8. Uji Pembatalan / Hapus Biaya (biaya.delete)
  const delRes = env.aksiBiayaDelete_({
    ...ctxOwner,
    payload: { id: resB1.item.id }
  });
  assert(delRes && delRes.id, `Hapus biaya kasir berhasil.`);

  // Shift kasir setelah biaya dihapus: biaya kasir kembali 0, uang fisik laci kembali 200.000!
  const shiftKasirAfter = env.aksiPenjualanShiftKasir_({
    ...ctxKasir,
    payload: { kasir_id: 'user-kasir-1', modal_awal: 100000 }
  });
  assert(shiftKasirAfter.total_biaya_kasir === 0, `Biaya kasir setelah dibatalkan harus 0. Hasil: ${shiftKasirAfter.total_biaya_kasir}`);
  assert(shiftKasirAfter.total_laci === 200000, `Uang fisik laci setelah biaya dibatalkan harus 200.000. Hasil: ${shiftKasirAfter.total_laci}`);

  console.log(`\n=============================================`);
  console.log(`TOTAL UJI BIAYA OPERASIONAL: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log(`=============================================`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

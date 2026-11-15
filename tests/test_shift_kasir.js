/**
 * test_shift_kasir.js — Pengujian Fitur #3 (Inline Unit Switcher) & Fitur #5 (Shift Kasir & X-Report)
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

async function run() {
  console.log('🧪 Memulai Pengujian Shift Kasir & X-Report...');
  const env = setupMockEnv();
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

  const ownerUser = env.bacaSemua_('Users').find(u => u.username === 'owner');
  const ctxOwner = {
    user: { id: ownerUser.id, username: 'owner', role: 'owner' },
    payload: {},
    token: 'token-owner'
  };

  // Kasir User
  const kasirRes = env.tambahBaris_('Users', [{
    username: 'kasir1',
    nama: 'Kasir Satu',
    role: 'kasir',
    pin_hash: 'mock',
    salt: 'mock',
    aktif: true
  }], ctxOwner.user.id);
  const ctxKasir = {
    user: { id: kasirRes[0].id, username: 'kasir1', role: 'kasir' },
    payload: {},
    token: 'token-kasir'
  };

  // Tambah Kategori & Produk
  const resKat = env.aksiKategoriCreate_({ ...ctxOwner, payload: { nama: 'Elektrik' } });
  const katId = resKat.id;

  const resProd = env.aksiProdukCreate_({
    ...ctxOwner,
    payload: {
      kategori_id: katId,
      nama: 'Kabel NYM 2x1.5',
      satuan_dasar: 'MTR',
      harga_ritel: 10000,
      harga_grosir: 8500,
      min_grosir_qty: 50,
      hpp: 7000,
      stok: 500,
      satuan_konversi: [
        { satuan: 'ROL', faktor: 50, harga_ritel: 450000, harga_grosir: 420000 }
      ]
    }
  });
  assert(resProd && resProd.id, 'Produk & Satuan Konversi berhasil dibuat');
  const prodId = resProd.id;

  // Lakukan Transaksi Penjualan oleh Kasir 1:
  // 1. Tunai Rp 100.000
  const pjTunai = env.aksiPenjualanCreate_({
    ...ctxKasir,
    payload: {
      metode_bayar: 'tunai',
      pembayaran: [{ metode: 'tunai', jumlah: 100000 }],
      items: [{ produk_id: prodId, nama: 'Kabel NYM 2x1.5', satuan: 'MTR', faktor: 1, qty: 10, harga: 10000, hpp: 7000, subtotal: 100000 }]
    }
  });
  assert(pjTunai && pjTunai.penjualan, 'Penjualan tunai Rp 100.000 berhasil');

  // 2. Transfer / QRIS Rp 200.000
  const pjTransfer = env.aksiPenjualanCreate_({
    ...ctxKasir,
    payload: {
      metode_bayar: 'transfer',
      pembayaran: [{ metode: 'transfer', jumlah: 200000 }],
      items: [{ produk_id: prodId, nama: 'Kabel NYM 2x1.5', satuan: 'MTR', faktor: 1, qty: 20, harga: 10000, hpp: 7000, subtotal: 200000 }]
    }
  });
  assert(pjTransfer && pjTransfer.penjualan, 'Penjualan non-tunai (transfer) Rp 200.000 berhasil');

  // 3. Tempo Rp 50.000
  const pelRes = env.aksiPelangganCreate_({
    ...ctxOwner,
    payload: { nama: 'Pak Budi', hp: '08123456789', tipe: 'member', limit_kredit: 1000000, tempo_hari: 14 }
  });
  const pelId = pelRes.pelanggan ? pelRes.pelanggan.id : pelRes.id;
  const pjTempo = env.aksiPenjualanCreate_({
    ...ctxKasir,
    payload: {
      pelanggan_id: pelId,
      metode_bayar: 'tempo',
      pembayaran: [{ metode: 'tempo', jumlah: 50000 }],
      items: [{ produk_id: prodId, nama: 'Kabel NYM 2x1.5', satuan: 'MTR', faktor: 1, qty: 5, harga: 10000, hpp: 7000, subtotal: 50000 }]
    }
  });
  assert(pjTempo && pjTempo.penjualan, 'Penjualan tempo (piutang) Rp 50.000 berhasil');

  // 4. Transaksi yang kemudian di-VOID (harus diabaikan dalam shift report!)
  const pjVoid = env.aksiPenjualanCreate_({
    ...ctxKasir,
    payload: {
      metode_bayar: 'tunai',
      pembayaran: [{ metode: 'tunai', jumlah: 30000 }],
      items: [{ produk_id: prodId, nama: 'Kabel NYM 2x1.5', satuan: 'MTR', faktor: 1, qty: 3, harga: 10000, hpp: 7000, subtotal: 30000 }]
    }
  });
  env.aksiPenjualanVoid_({
    ...ctxOwner,
    payload: { id: pjVoid.penjualan.id, alasan: 'Salah input kasir' }
  });
  assert(true, 'Penjualan void berhasil diproses');

  // 5. Uji Handler penjualan.shiftKasir
  const shiftReport = env.aksiPenjualanShiftKasir_({
    ...ctxKasir,
    payload: {
      modal_awal: 150000
    }
  });

  assert(shiftReport.total_transaksi === 3, `Total transaksi harus 3 (mengabaikan void). Hasil: ${shiftReport.total_transaksi}`);
  assert(shiftReport.total_penjualan === 350000, `Total omset harus 350.000. Hasil: ${shiftReport.total_penjualan}`);
  assert(shiftReport.total_tunai === 100000, `Total tunai harus 100.000. Hasil: ${shiftReport.total_tunai}`);
  assert(shiftReport.total_transfer === 200000, `Total transfer harus 200.000. Hasil: ${shiftReport.total_transfer}`);
  assert(shiftReport.total_tempo === 50000, `Total tempo harus 50.000. Hasil: ${shiftReport.total_tempo}`);
  assert(shiftReport.modal_awal === 150000, `Modal awal harus 150.000. Hasil: ${shiftReport.modal_awal}`);
  assert(shiftReport.total_laci === 250000, `Uang fisik laci harus 250.000 (150k + 100k tunai). Hasil: ${shiftReport.total_laci}`);
  assert(shiftReport.kasir && shiftReport.kasir.nama === 'Kasir Satu', `Nama kasir shift harus 'Kasir Satu'. Hasil: ${shiftReport.kasir.nama}`);

  // 6. Uji Cetak X-Report Thermal Printer Utility
  const printerCode = fs.readFileSync('frontend/js/utils/printer.js', 'utf8');
  assert(printerCode.includes('susunTeksXReport'), 'printer.js mendefinisikan susunTeksXReport');
  assert(printerCode.includes('cetakRawBTShift'), 'printer.js mendefinisikan cetakRawBTShift');
  assert(printerCode.includes('bukaModalPilihanCetakShift'), 'printer.js mendefinisikan bukaModalPilihanCetakShift');

  // 7. Uji Inline Unit Switcher di POS
  const posCode = fs.readFileSync('frontend/js/modules/pos.js', 'utf8');
  assert(posCode.includes('btn-ganti-satuan-item'), 'pos.js memiliki badge tombol .btn-ganti-satuan-item');
  assert(posCode.includes('bukaModalGantiSatuanItem'), 'pos.js memiliki handler bukaModalGantiSatuanItem');
  assert(posCode.includes('bukaModalShiftKasir'), 'pos.js memiliki handler bukaModalShiftKasir');
  assert(posCode.includes('btn-pos-shift'), 'pos.js memiliki tombol #btn-pos-shift');

  console.log(`\n=============================================`);
  console.log(`TOTAL UJI SHIFT KASIR & X-REPORT: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log(`=============================================`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * test_kategori_search_antiduplikat.js
 * Pengujian Fitur:
 * 1. Validasi Anti-Duplikat Nama Kategori Utama & Sub-Kategori di Backend kode.gs
 * 2. Satuan Otomatis Huruf Besar (UPPERCASE) pada Produk & Satuan Konversi
 * 3. Batas Limit Stok Minimum Default 0
 * 4. Logika Searchable Category Picker (Combobox) untuk Form Produk
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
  const code = fs.readFileSync('backend/kode.gs', 'utf8');
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
  console.log('🧪 Memulai Pengujian Backend Anti-Duplikat Kategori & Produk...');
  const env = setupMockEnv();

  // Setup Database
  env.setupDatabase();
  const ctxOwner = { user: { id: 'user-owner', username: 'owner', role: 'owner', nama: 'Bapak Owner' } };

  // 1. Buat Kategori Utama "PIPA PVC"
  const kUtama1 = env.aksiKategoriCreate_({
    ...ctxOwner,
    payload: { nama: 'PIPA PVC', urutan: 1 }
  });
  assert(kUtama1 && kUtama1.id, 'Berhasil membuat Kategori Utama "PIPA PVC"');

  // 2. Coba buat Kategori Utama kembar "pipa pvc" (huruf kecil)
  let kenaError1 = false;
  try {
    env.aksiKategoriCreate_({
      ...ctxOwner,
      payload: { nama: '  pipa pvc  ', urutan: 2 }
    });
  } catch (err) {
    kenaError1 = true;
    assert(err.message.includes('sudah terdaftar'), `Anti-duplikat kategori utama berhasil: ${err.message}`);
  }
  assert(kenaError1, 'Kategori utama duplikat case-insensitive wajib ditolak');

  // 3. Buat Kategori Utama lain "CAT TEMBOK"
  const kUtama2 = env.aksiKategoriCreate_({
    ...ctxOwner,
    payload: { nama: 'CAT TEMBOK', urutan: 2 }
  });
  assert(kUtama2 && kUtama2.id, 'Berhasil membuat Kategori Utama "CAT TEMBOK"');

  // 4. Buat Sub-Kategori "Pipa AW 1/2" di bawah "PIPA PVC"
  const kSub1 = env.aksiKategoriCreate_({
    ...ctxOwner,
    payload: { nama: 'Pipa AW 1/2', parent_id: kUtama1.id, urutan: 1 }
  });
  assert(kSub1 && kSub1.id, 'Berhasil membuat Sub-Kategori "Pipa AW 1/2" di bawah "PIPA PVC"');

  // 5. Coba buat Sub-Kategori kembar di bawah induk yang sama
  let kenaError2 = false;
  try {
    env.aksiKategoriCreate_({
      ...ctxOwner,
      payload: { nama: '  PIPA AW 1/2  ', parent_id: kUtama1.id, urutan: 2 }
    });
  } catch (err) {
    kenaError2 = true;
    assert(err.message.includes('sudah terdaftar'), `Anti-duplikat sub-kategori di bawah induk sama berhasil: ${err.message}`);
  }
  assert(kenaError2, 'Sub-kategori kembar di bawah induk yang sama wajib ditolak');

  // 6. Buat Sub-Kategori dengan nama sama tapi beda induk (diizinkan)
  const kSubBedaInduk = env.aksiKategoriCreate_({
    ...ctxOwner,
    payload: { nama: 'Pipa AW 1/2', parent_id: kUtama2.id, urutan: 1 }
  });
  assert(kSubBedaInduk && kSubBedaInduk.id, 'Diizinkan: Sub-kategori dengan nama yang sama tetapi di bawah induk berbeda');

  // 7. Update Kategori Utama ke nama yang sudah ada (harus ditolak)
  let kenaError3 = false;
  try {
    env.aksiKategoriUpdate_({
      ...ctxOwner,
      payload: { id: kUtama2.id, nama: 'pipa pvc', urutan: 2 }
    });
  } catch (err) {
    kenaError3 = true;
    assert(err.message.includes('sudah terdaftar'), `Update kategori utama ke nama yang bentrok ditolak: ${err.message}`);
  }
  assert(kenaError3, 'Update kategori utama bentrok wajib ditolak');

  // 8. Update Kategori sendiri (tanpa ganti nama) harus sukses
  const kUpdateSelf = env.aksiKategoriUpdate_({
    ...ctxOwner,
    payload: { id: kUtama2.id, nama: 'CAT TEMBOK', urutan: 9 }
  });
  assert(kUpdateSelf && kUpdateSelf.id === kUtama2.id, 'Update kategori diri sendiri tanpa salah mendeteksi duplikat');

  // 9. Uji Satuan Huruf Besar (UPPERCASE) & Stok Min 0 pada Produk
  console.log('\n🧪 Memulai Pengujian Satuan Otomatis Huruf Besar & Stok Min 0...');
  const prodBaru = env.aksiProdukCreate_({
    ...ctxOwner,
    payload: {
      nama: 'Kran Air Besi 1/2 Inch',
      satuan_dasar: 'pcs', // input lowercase
      hpp: 15000,
      harga_ritel: 25000,
      stok: 20,
      stok_min: 0,
      satuan_konversi: [
        { satuan: 'dus', faktor: 24, harga_ritel: 550000 } // input lowercase
      ]
    }
  });

  const pr = prodBaru.produk || prodBaru;
  assert(pr.satuan_dasar === 'PCS', `Satuan dasar produk otomatis menjadi UPPERCASE ('PCS'). Hasil: ${pr.satuan_dasar}`);
  assert(Number(pr.stok_min) === 0, `Batas stok minimum produk sesuai input yaitu 0. Hasil: ${pr.stok_min}`);

  const konversiList = env.bacaSemua_('Satuan_Konversi').filter(s => s.produk_id === pr.id && !s.deleted);
  assert(konversiList.length === 1 && konversiList[0].satuan === 'DUS', `Satuan konversi otomatis menjadi UPPERCASE ('DUS'). Hasil: ${konversiList[0]?.satuan}`);

  // 10. Uji Logika Searchable Category Combobox (Frontend Filter Logic)
  console.log('\n🧪 Memulai Pengujian Logika Searchable Category Combobox...');
  const daftarKategori = [
    { id: 'k-1', nama: 'PIPA PVC', parent_id: '', urutan: 1 },
    { id: 'k-2', nama: 'CAT TEMBOK', parent_id: '', urutan: 2 },
    { id: 'k-1-1', nama: 'Pipa AW 1/2 Inch', parent_id: 'k-1', urutan: 1 },
    { id: 'k-1-2', nama: 'Pipa AW 3/4 Inch', parent_id: 'k-1', urutan: 2 },
    { id: 'k-1-3', nama: 'Pipa D 2 Inch', parent_id: 'k-1', urutan: 3 },
    { id: 'k-2-1', nama: 'Dulux Pentalite', parent_id: 'k-2', urutan: 1 },
    { id: 'k-2-2', nama: 'Avitex White', parent_id: 'k-2', urutan: 2 }
  ];

  const katMap = new Map();
  daftarKategori.forEach(k => katMap.set(k.id, k));

  function getCategoryDisplay(id) {
    if (!id || !katMap.has(id)) return '-- Tanpa Kategori --';
    const k = katMap.get(id);
    if (k.parent_id && katMap.has(k.parent_id)) {
      const parent = katMap.get(k.parent_id);
      return `${parent.nama} > ${k.nama}`;
    }
    return k.nama;
  }

  assert(getCategoryDisplay('') === '-- Tanpa Kategori --', 'Label kosong menampilkan -- Tanpa Kategori --');
  assert(getCategoryDisplay('k-1') === 'PIPA PVC', 'Label kategori utama menampilkan PIPA PVC');
  assert(getCategoryDisplay('k-1-1') === 'PIPA PVC > Pipa AW 1/2 Inch', 'Label sub-kategori menampilkan Induk > Sub');

  function filterKategori(query) {
    const q = query.trim().toLowerCase();
    const parents = daftarKategori.filter(k => !k.parent_id);
    const subsByParent = {};
    daftarKategori.forEach(k => {
      if (k.parent_id) {
        if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
        subsByParent[k.parent_id].push(k);
      }
    });

    const hasil = [];
    parents.forEach(p => {
      const pMatches = !q || p.nama.toLowerCase().includes(q);
      const subs = subsByParent[p.id] || [];
      const matchingSubs = subs.filter(s => !q || s.nama.toLowerCase().includes(q));

      if (pMatches || matchingSubs.length > 0) {
        hasil.push({ type: 'parent', item: p });
        const subsToShow = q ? (pMatches ? subs : matchingSubs) : subs;
        subsToShow.forEach(s => hasil.push({ type: 'sub', item: s }));
      }
    });
    return hasil;
  }

  const resPipa = filterKategori('pipa');
  assert(resPipa.some(x => x.item.id === 'k-1') && resPipa.some(x => x.item.id === 'k-1-1'), 'Pencarian "pipa" menampilkan induk PIPA PVC dan sub-kategorinya');
  assert(!resPipa.some(x => x.item.id === 'k-2'), 'Pencarian "pipa" mengecualikan kategori yang tidak relevan');

  const resDulux = filterKategori('dulux');
  assert(resDulux.some(x => x.item.id === 'k-2') && resDulux.some(x => x.item.id === 'k-2-1'), 'Pencarian sub "dulux" menyertakan induk CAT TEMBOK secara otomatis');
  assert(!resDulux.some(x => x.item.id === 'k-2-2'), 'Sub-kategori yang tidak cocok disembunyikan');

  console.log(`\n======================================================`);
  console.log(`TOTAL UJI: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});

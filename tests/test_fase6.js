/**
 * test_fase6.js — Uji Otomatis Lengkap Fase 6 (Dashboard Eksekutif & Laporan Usaha)
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
  setFrozenRows() { }
  getRangeList(list) {
    const self = this;
    return {
      setNumberFormat(f) {
        if (f === '@') list.forEach(a => self.formatTeks.add(a));
        return this;
      }
    };
  }
  getRange(r, c, nr, nc) {
    const self = this;
    if (typeof r === 'string') return { setNumberFormat: () => chain(), setValue: () => chain(), setFontWeight: () => chain() };
    const numRows = nr || 1;
    const numCols = nc || 1;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < numRows; i++) {
          const rowIdx = r - 1 + i;
          const rowData = self.data[rowIdx] || [];
          const row = [];
          for (let j = 0; j < numCols; j++) {
            const colIdx = c - 1 + j;
            const v = rowData[colIdx];
            row.push(v === undefined ? '' : v);
          }
          out.push(row);
        }
        return out;
      },
      setValues(vals) {
        for (let i = 0; i < vals.length; i++) {
          const rowIdx = r - 1 + i;
          if (!self.data[rowIdx]) self.data[rowIdx] = [];
          for (let j = 0; j < vals[i].length; j++) {
            const colIdx = c - 1 + j;
            const val = vals[i][j];
            if (typeof val === 'string' && val.startsWith('=')) self.formulaDitulis++;
            self.data[rowIdx][colIdx] = val;
          }
        }
        return chain();
      },
      setValue(v) { return this.setValues([[v]]); },
      setNumberFormat() { return chain(); },
      setFontWeight() { return chain(); },
      setBackground() { return chain(); },
      setHorizontalAlignment() { return chain(); },
      setWrap() { return chain(); },
      setFontColor() { return chain(); }
    };
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
  toast() { }
}

function setupMockEnv() {
  const ss = new MockSS();
  const cacheMap = new Map();
  const props = new Map();
  const lock = {
    tryLock: () => true,
    waitLock: () => true,
    releaseLock: () => { }
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
      flush: () => { },
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
        mime: null,
        setMimeType(m) { this.mime = m; return this; }
      }),
      MimeType: { JSON: 'JSON' }
    }
  };

  const code = fs.readFileSync('backend/kode.gs', 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

async function runTests() {
  console.log('[SETUP] Memulai Pengujian Fase 6 (Dashboard & Laporan Usaha)...');
  const env = setupMockEnv();
  env.setupDatabase();
  console.log('✔ Setup database berhasil');

  // Ambil user owner pertama
  const users = env.bacaSemua_('Users');
  const owner = users.find(u => u.username === 'owner');
  assert(owner !== undefined, 'User owner terdaftar');

  const ctxOwner = {
    user: { id: owner.id, username: owner.username, role: 'owner' },
    payload: {},
    token: 'token-owner',
    waktu: env.sekarang_()
  };

  // Buat akun Admin
  const adminRes = env.tambahBaris_('Users', [{
    username: 'admin1',
    nama: 'Admin Toko',
    role: 'admin',
    pin_hash: 'mock',
    salt: 'mock',
    aktif: true
  }], ctxOwner.user.id);
  const ctxAdmin = {
    user: { id: adminRes[0].id, username: 'admin1', role: 'admin' },
    payload: {},
    token: 'token-admin',
    waktu: env.sekarang_()
  };

  // Buat akun Kasir
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
    token: 'token-kasir',
    waktu: env.sekarang_()
  };

  // ==========================================
  // [SETUP DATA PRODUK, SUPPLIER, & MEMBER]
  // ==========================================
  const katRes = env.tambahBaris_('Kategori', [{ nama: 'Material Semen' }], ctxOwner.user.id);
  const katId = katRes[0].id;

  const pdkRes = env.tambahBaris_('Produk', [
    {
      sku: 'SMN-TIGA-RODA',
      barcode: '899123456781',
      nama: 'Semen Tiga Roda 50kg',
      kategori_id: katId,
      satuan_dasar: 'Sak',
      hpp: 55000,
      harga_ritel: 65000,
      stok: 100,
      stok_min: 20,
      aktif: true
    },
    {
      sku: 'CAT-DULUX-5KG',
      barcode: '899123456782',
      nama: 'Cat Dulux WeatherShield 5kg',
      kategori_id: katId,
      satuan_dasar: 'Pail',
      hpp: 150000,
      harga_ritel: 190000,
      stok: 5,
      stok_min: 10, // Kritis
      aktif: true
    },
    {
      sku: 'BSI-10MM',
      barcode: '899123456783',
      nama: 'Besi Beton 10mm SNI',
      kategori_id: katId,
      satuan_dasar: 'Batang',
      hpp: 70000,
      harga_ritel: 85000,
      stok: 0, // Habis
      stok_min: 15,
      aktif: true
    }
  ], ctxOwner.user.id);

  const prodSemen = pdkRes[0];
  const prodCat = pdkRes[1];
  const prodBesi = pdkRes[2];

  const supRes = env.tambahBaris_('Supplier', [{
    nama: 'PT Semen Perkasa Indonesia',
    kontak: 'Sales Semen',
    hp: '0811998877',
    aktif: true
  }], ctxOwner.user.id);
  const supId = supRes[0].id;

  const pelRes = env.tambahBaris_('Pelanggan', [
    {
      nama: 'Haji Agus Mandiri',
      kode: 'MBR-001',
      hp: '081234567890',
      tipe: 'member',
      level: 'Gold',
      limit_kredit: 10000000,
      poin: 100,
      total_belanja: 2000000,
      aktif: true
    },
    {
      nama: 'Pak Mandor Joko',
      kode: 'MBR-002',
      hp: '081234567891',
      tipe: 'member',
      level: 'Silver',
      limit_kredit: 5000000,
      poin: 50,
      total_belanja: 1000000,
      aktif: true
    }
  ], ctxOwner.user.id);
  const memberAgus = pelRes[0];
  const memberJoko = pelRes[1];

  const hariIni = env.sekarang_().substring(0, 10);

  // Buat 1 Pembelian barang masuk ke Supplier
  const pbRes = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      tanggal: hariIni,
      items: [
        { produk_id: prodSemen.id, satuan: 'Sak', faktor: 1, qty: 50, harga_beli: 55000 }
      ],
      diskon: 0,
      bayar: 1500000, // Bayar 1.5jt, sisa hutang 1.25jt
      catatan: 'Kulakan semen awal bulan'
    }
  });
  assert(pbRes.status_bayar === 'sebagian', 'Pembelian berhasil dicatat sebagian hutang');

  // Buat 1 Penjualan Tunai Lunas (Pelanggan Haji Agus: 10 sak semen = 650.000)
  const pj1 = env.aksiPenjualanCreate_({
    ...ctxOwner,
    payload: {
      pelanggan_id: memberAgus.id,
      kasir_id: ctxKasir.user.id,
      items: [
        { produk_id: prodSemen.id, satuan: 'Sak', faktor: 1, qty: 10, harga: 65000, hpp: 55000 }
      ],
      diskon_nilai: 0,
      pembayaran: [
        { metode: 'tunai', jumlah: 650000 }
      ]
    }
  });
  assert(pj1.penjualan.status === 'final', 'Penjualan tunai 1 final');
  assert(pj1.penjualan.total === 650000, 'Total penjualan tunai tepat Rp 650.000');

  // Buat 1 Penjualan Tempo Kredit (Pelanggan Joko: 2 cat = 380.000)
  const pj2 = env.aksiPenjualanCreate_({
    ...ctxOwner,
    payload: {
      pelanggan_id: memberJoko.id,
      kasir_id: ctxKasir.user.id,
      items: [
        { produk_id: prodCat.id, satuan: 'Pail', faktor: 1, qty: 2, harga: 190000, hpp: 150000 }
      ],
      diskon_nilai: 0,
      pembayaran: [
        { metode: 'tempo', jumlah: 380000 }
      ]
    }
  });
  assert(pj2.penjualan.status_bayar === 'belum_lunas', 'Penjualan tempo 2 berhasil dicatat');

  // Buat 1 Pembayaran Cicilan Piutang Joko (Rp 180.000 via Transfer)
  const piutangJoko = env.bacaSemua_('Piutang').find(pi => pi.penjualan_id === pj2.penjualan.id);
  assert(piutangJoko !== undefined, 'Record piutang tercatat');

  const cicilRes = env.aksiPiutangBayar_({
    ...ctxOwner,
    payload: {
      id: piutangJoko.id,
      jumlah: 180000,
      metode: 'transfer',
      catatan: 'Cicilan transfer mandiri'
    }
  });
  assert(cicilRes.sisa === 200000, 'Sisa piutang Joko berkurang menjadi Rp 200.000');

  // ==========================================
  // [TEST 1] laporan.dashboard (Hak Akses Owner)
  // ==========================================
  console.log('\n[TEST 1] laporan.dashboard oleh Owner (Laba & Aset Terbuka)');
  const dashOwner = env.aksiLaporanDashboard_({
    ...ctxOwner,
    payload: { periode: 'hari_ini' }
  });

  assert(dashOwner.ringkasan.total_penjualan === 1030000, 'Total omset penjualan tepat: Rp 1.030.000 (650k + 380k)');
  assert(dashOwner.ringkasan.total_transaksi === 2, 'Total transaksi penjualan final: 2 nota');
  assert(dashOwner.ringkasan.total_pembelian === 2750000, 'Total pembelian tepat: Rp 2.750.000 (50 x 55k)');
  assert(dashOwner.ringkasan.total_piutang_aktif === 200000, 'Total piutang aktif berjalan tepat Rp 200.000');
  assert(dashOwner.ringkasan.total_hutang_aktif === 1250000, 'Total hutang supplier berjalan tepat Rp 1.250.000');

  // Verifikasi Laba Kotor & Margin untuk Owner
  // HPP = (10 x 55.000) + (2 x 150.000) = 550.000 + 300.000 = 850.000
  // Laba = 1.030.000 - 850.000 = 180.000
  assert(dashOwner.ringkasan.laba_kotor === 180000, 'Laba kotor terhitung tepat untuk Owner: Rp 180.000');
  assert(dashOwner.ringkasan.margin_persen > 17 && dashOwner.ringkasan.margin_persen < 18, 'Margin laba kotor terhitung tepat: ~17.48%');
  assert(typeof dashOwner.ringkasan.total_nilai_aset_stok === 'number', 'Total aset nilai stok dikirim untuk Owner');

  // Produk Terlaris
  assert(dashOwner.produk_terlaris.length >= 2, 'Daftar produk terlaris memuat item');
  assert(dashOwner.produk_terlaris[0].nama === 'Semen Tiga Roda 50kg', 'Top 1 produk terlaris adalah Semen Tiga Roda');
  assert(dashOwner.produk_terlaris[0].qty_terjual === 10, 'Kuantitas semen terjual adalah 10 sak');

  // Stok Kritis
  assert(dashOwner.stok_kritis.length >= 2, 'Stok kritis & habis terdeteksi');
  const catAlert = dashOwner.stok_kritis.find(s => s.nama.includes('Cat Dulux'));
  const besiAlert = dashOwner.stok_kritis.find(s => s.nama.includes('Besi Beton'));
  assert(catAlert && catAlert.status === 'kritis', 'Cat Dulux berstatus "kritis"');
  assert(besiAlert && besiAlert.status === 'habis', 'Besi Beton berstatus "habis"');

  // Pelanggan Terbaik
  assert(dashOwner.pelanggan_terbaik.length >= 2, 'Daftar pelanggan terbaik memuat member');
  assert(dashOwner.pelanggan_terbaik[0].nama === 'Haji Agus Mandiri', 'Pelanggan belanja tertinggi adalah Haji Agus');

  // Tren Harian
  assert(dashOwner.tren.length >= 1, 'Data tren harian tersedia');
  assert(dashOwner.tren[0].penjualan === 1030000, 'Tren penjualan hari ini tercatat Rp 1.030.000');

  // ==========================================
  // [TEST 2] laporan.dashboard oleh Admin (Laba & Aset Disembunyikan)
  // ==========================================
  console.log('\n[TEST 2] laporan.dashboard oleh Admin (Laba & Aset Masked)');
  const dashAdmin = env.aksiLaporanDashboard_({
    ...ctxAdmin,
    payload: { periode: 'hari_ini' }
  });

  assert(dashAdmin.ringkasan.total_penjualan === 1030000, 'Admin dapat melihat omset penjualan');
  assert(dashAdmin.ringkasan.laba_kotor === null, 'Laba kotor disembunyikan untuk Admin (null)');
  assert(dashAdmin.ringkasan.margin_persen === null, 'Margin disembunyikan untuk Admin (null)');
  assert(dashAdmin.ringkasan.total_nilai_aset_stok === null, 'Total nilai aset agregat disembunyikan untuk Admin (null)');

  // ==========================================
  // [TEST 3] laporan.penjualan
  // ==========================================
  console.log('\n[TEST 3] laporan.penjualan (Rincian & Ringkasan Transaksi)');
  const lapJual = env.aksiLaporanPenjualan_({
    ...ctxOwner,
    payload: { periode: 'hari_ini' }
  });

  assert(lapJual.ringkasan.total_omset === 1030000, 'Ringkasan total omset penjualan tepat');
  assert(lapJual.ringkasan.total_transaksi === 2, 'Total transaksi penjualan 2');
  assert(lapJual.ringkasan.total_laba === 180000, 'Owner dapat melihat total laba penjualan Rp 180.000');
  assert(lapJual.items.length === 2, 'Item penjualan memuat 2 transaksi');
  assert(lapJual.items[0].kasir_nama.length > 0, 'Nama kasir diperkaya');
  assert(lapJual.items[0].pelanggan_nama.length > 0, 'Nama pelanggan diperkaya');

  // Cek jika diakses Admin: total_laba harus null
  const lapJualAdmin = env.aksiLaporanPenjualan_({
    ...ctxAdmin,
    payload: { periode: 'hari_ini' }
  });
  assert(lapJualAdmin.ringkasan.total_laba === null, 'Total laba penjualan disembunyikan untuk Admin');

  // ==========================================
  // [TEST 4] laporan.pembelian
  // ==========================================
  console.log('\n[TEST 4] laporan.pembelian (Rincian & Ringkasan Faktur Beli)');
  const lapBeli = env.aksiLaporanPembelian_({
    ...ctxOwner,
    payload: { periode: 'hari_ini' }
  });

  assert(lapBeli.ringkasan.total_pembelian === 2750000, 'Total pembelian tepat Rp 2.750.000');
  assert(lapBeli.ringkasan.total_terbayar === 1500000, 'Total bayar tepat Rp 1.500.000');
  assert(lapBeli.ringkasan.total_sisa_hutang === 1250000, 'Total sisa hutang tepat Rp 1.250.000');
  assert(lapBeli.items.length === 1, 'Memuat 1 faktur pembelian');
  assert(lapBeli.items[0].supplier_nama === 'PT Semen Perkasa Indonesia', 'Nama supplier diperkaya');

  // ==========================================
  // [TEST 5] laporan.labaRugi (Khusus Owner)
  // ==========================================
  console.log('\n[TEST 5] laporan.labaRugi (Analisis Laba Kotor, HPP, & Kategori)');
  const lapLaba = env.aksiLaporanLabaRugi_({
    ...ctxOwner,
    payload: { periode: 'hari_ini' }
  });

  assert(lapLaba.ringkasan.omset_bersih === 1030000, 'Omset bersih tepat Rp 1.030.000');
  assert(lapLaba.ringkasan.total_hpp === 850000, 'Total COGS / HPP tepat Rp 850.000');
  assert(lapLaba.ringkasan.laba_kotor_bersih === 180000, 'Laba kotor bersih tepat Rp 180.000');
  assert(lapLaba.analisis_kategori.length >= 1, 'Rincian laba per kategori tersedia');
  assert(lapLaba.analisis_kategori[0].kategori === 'Material Semen', 'Kategori Material Semen tercatat');
  assert(lapLaba.produk_margin_teratas.length >= 2, 'Rincian produk margin teratas tersedia');

  // Proteksi Akses: Admin Ditolak FORBIDDEN
  let adminDitolakLaba = false;
  try {
    env.aksiLaporanLabaRugi_({
      ...ctxAdmin,
      payload: { periode: 'hari_ini' }
    });
  } catch (e) {
    adminDitolakLaba = (e.code === 'FORBIDDEN');
  }
  assert(adminDitolakLaba, 'Admin ditolak mengakses laporan laba rugi (FORBIDDEN)');

  // ==========================================
  // [TEST 6] laporan.arusKas (Buku Kas Masuk - Keluar)
  // ==========================================
  console.log('\n[TEST 6] laporan.arusKas (Arus Kas Masuk & Keluar Toko)');
  const lapKas = env.aksiLaporanArusKas_({
    ...ctxOwner,
    payload: { periode: 'hari_ini' }
  });

  // Kas Masuk:
  // Penjualan tunai = 650.000
  // Pembayaran piutang transfer = 180.000
  // Total masuk = 830.000
  assert(lapKas.ringkasan.total_kas_masuk === 830000, 'Total kas masuk tepat Rp 830.000 (Tunai 650k + Transfer 180k)');
  assert(lapKas.rincian_masuk.penjualan_tunai === 650000, 'Kas masuk penjualan tunai tepat Rp 650.000');
  assert(lapKas.rincian_masuk.piutang_transfer === 180000, 'Kas masuk piutang transfer tepat Rp 180.000');

  // Kas Keluar:
  // Pembelian tunai = 1.500.000
  assert(lapKas.ringkasan.total_kas_keluar === 1500000, 'Total kas keluar tepat Rp 1.500.000');
  assert(lapKas.rincian_keluar.pembelian_tunai === 1500000, 'Kas keluar pembelian tunai tepat');

  // Saldo Tunai Kasir = Masuk Tunai (650k) - Keluar Tunai (1.500k) = -850.000
  assert(lapKas.ringkasan.saldo_tunai_kasir === -850000, 'Saldo tunai kasir terhitung konsisten');
  // Saldo Bank = Masuk Bank (180k) - Keluar Bank (0) = 180.000
  assert(lapKas.ringkasan.saldo_bank_non_tunai === 180000, 'Saldo bank non-tunai tepat Rp 180.000');

  // ==========================================
  // [TEST 7] laporan.stokValuasi (Nilai Persediaan & Status Stok)
  // ==========================================
  console.log('\n[TEST 7] laporan.stokValuasi (Valuasi Persediaan Fisik)');
  const lapStokOwner = env.aksiLaporanStokValuasi_({
    ...ctxOwner,
    payload: { status_stok: 'semua' }
  });

  assert(lapStokOwner.ringkasan.total_item >= 3, 'Total item barang terdaftar');
  assert(typeof lapStokOwner.ringkasan.total_nilai_aset === 'number', 'Owner dapat melihat total valuasi aset stok');
  assert(lapStokOwner.ringkasan.total_habis >= 1, 'Tercatat ada produk habis');
  assert(lapStokOwner.ringkasan.total_kritis >= 1, 'Tercatat ada produk kritis');

  // Admin melihat list tapi total_nilai_aset null
  const lapStokAdmin = env.aksiLaporanStokValuasi_({
    ...ctxAdmin,
    payload: { status_stok: 'semua' }
  });
  assert(lapStokAdmin.ringkasan.total_nilai_aset === null, 'Admin melihat total valuasi aset agregat sebagai null');
  assert(lapStokAdmin.items.length >= 3, 'Admin tetap dapat melihat daftar stok dan HPP per item');

  // Filter Kritis
  const lapStokKritis = env.aksiLaporanStokValuasi_({
    ...ctxOwner,
    payload: { status_stok: 'kritis' }
  });
  assert(lapStokKritis.items.every(it => it.status === 'kritis'), 'Filter stok status "kritis" tepat');

  console.log('\n=============================================');
  console.log(`TOTAL UJI FASE 6: ${testsRun} | LULUS: ${testsPassed} | GAGAL: ${testsFailed}`);
  console.log('=============================================');
}

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log('  ✔ ' + message);
  } else {
    testsFailed++;
    console.error('  ✖ GAGAL: ' + message);
    throw new Error('Assertion failed: ' + message);
  }
}

runTests().catch(e => {
  console.error('\nFatal test error:', e);
  process.exit(1);
});

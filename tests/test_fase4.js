/**
 * test_fase5.js — Uji Otomatis Lengkap Fase 4 (Keuangan: Hutang, Piutang, Retur)
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
  console.log('[SETUP] Memulai Pengujian Fase 4 (Keuangan: Hutang, Piutang, Retur)...');
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

  // Data Pelanggan Member (Pak Haji Agus, Limit 10 Juta)
  const pelRes = env.tambahBaris_('Pelanggan', [{
    kode: 'MBR-001',
    nama: 'Haji Agus Mandiri',
    hp: '08123456789',
    tipe: 'member',
    level: 'Reguler',
    limit_kredit: 10000000,
    tempo_hari: 30,
    poin: 0,
    total_belanja: 0,
    aktif: true
  }], ctxOwner.user.id);
  const pelId = pelRes[0].id;

  // Data Supplier
  const supRes = env.tambahBaris_('Supplier', [{
    nama: 'Distributor Baja Utama',
    kontak: 'Pak Hendra',
    hp: '0855667788',
    aktif: true
  }], ctxOwner.user.id);
  const supId = supRes[0].id;

  // Data Produk (Besi Beton 10mm, HPP 60.000, Jual 75.000, Stok 100)
  const prodRes = env.tambahBaris_('Produk', [{
    sku: 'BSI-10',
    nama: 'Besi Beton 10mm SNI',
    satuan_dasar: 'batang',
    hpp: 60000,
    harga_ritel: 75000,
    harga_grosir: 72000,
    stok: 100,
    punya_varian: false,
    aktif: true
  }], ctxOwner.user.id);
  const besiId = prodRes[0].id;

  // ==========================================
  // [TEST 1] Setup Penjualan Tempo & Verifikasi Piutang
  // ==========================================
  console.log('\n[TEST 1] Penjualan Tempo & Catatan Piutang');
  // Jual 10 batang @ 75.000 = 750.000. Bayar DP 250.000 (tunai) + Tempo 500.000.
  const resJualTempo = env.aksiPenjualanCreate_({
    ...ctxOwner,
    payload: {
      pelanggan_id: pelId,
      metode_bayar: 'kombinasi',
      pembayaran: [
        { metode: 'tunai', jumlah: 250000 },
        { metode: 'tempo', jumlah: 500000 }
      ],
      items: [{
        produk_id: besiId,
        satuan: 'batang',
        faktor: 1,
        qty: 10,
        harga: 75000
      }]
    }
  });

  assert(resJualTempo.penjualan.no_nota.startsWith('INV-'), 'Penjualan tempo berhasil dibuat: ' + resJualTempo.penjualan.no_nota);
  const ptList = env.aksiPiutangList_({ ...ctxOwner, payload: { pelanggan_id: pelId } });
  assert(ptList.items.length === 1, 'Tercatat 1 piutang pelanggan di piutang.list');
  const piutangId = ptList.items[0].id;
  assert(ptList.items[0].total === 500000 && ptList.items[0].sisa === 500000, 'Sisa piutang awal tepat Rp 500.000');
  assert(ptList.items[0].status === 'belum', 'Status awal piutang adalah "belum"');

  // ==========================================
  // [TEST 2] Pembayaran Sebagian Piutang (Cicilan)
  // ==========================================
  console.log('\n[TEST 2] Pembayaran Cicilan Piutang');
  const resCicil1 = env.aksiPiutangBayar_({
    ...ctxOwner,
    payload: {
      id: piutangId,
      jumlah: 200000,
      metode: 'transfer',
      catatan: 'Cicilan 1 via BCA'
    }
  });

  assert(resCicil1.status === 'sebagian', 'Status piutang setelah cicil 1 adalah "sebagian"');
  assert(resCicil1.sisa === 300000, 'Sisa piutang berkurang menjadi Rp 300.000');
  assert(resCicil1.poin_didapat === 0, 'Poin belum diberikan saat piutang baru sebagian (Aturan Bisnis #7)');

  // Verifikasi Rincian Piutang (piutang.detail)
  const detPt = env.aksiPiutangDetail_({ ...ctxOwner, payload: { id: piutangId } });
  assert(detPt.riwayat_pembayaran.length === 1, 'piutang.detail memuat 1 riwayat pembayaran');
  assert(detPt.riwayat_pembayaran[0].jumlah === 200000, 'Nominal riwayat pembayaran tercatat Rp 200.000');

  // ==========================================
  // [TEST 3] Pelunasan Piutang & Hak Poin Loyalitas (Aturan Bisnis #7 & #16)
  // ==========================================
  console.log('\n[TEST 3] Pelunasan Piutang & Perolehan Poin Member');
  // Pelunasan sisa 300.000.
  // Saat lunas: member mendapatkan poin dari total transaksi tempo 500.000!
  // Sesuai aturan: poin_per_rupiah = 10.000 -> 500.000 / 10.000 = 50 poin.
  const resLunas = env.aksiPiutangBayar_({
    ...ctxOwner,
    payload: {
      id: piutangId,
      jumlah: 300000,
      metode: 'tunai',
      catatan: 'Pelunasan sisa'
    }
  });

  assert(resLunas.status === 'lunas', 'Status piutang berubah menjadi "lunas"');
  assert(resLunas.sisa === 0, 'Sisa piutang menjadi Rp 0');
  assert(resLunas.poin_didapat === 50, 'Aturan Bisnis #7 terpenuhi: Poin loyalitas (50 poin) diberikan saat piutang lunas');

  const pelSetelahLunas = env.cariById_('Pelanggan', pelId);
  // Poin awal dari DP 250.000 = 25 poin + poin lunas tempo 50 poin = 75 poin
  assert(pelSetelahLunas.poin === 75, 'Saldo poin member bertambah tepat menjadi 75 poin');
  assert(pelSetelahLunas.total_belanja === 750000, 'Total belanja seumur hidup member terakumulasi Rp 750.000');

  // ==========================================
  // [TEST 4] Validasi Bayar Piutang Melebihi Sisa
  // ==========================================
  console.log('\n[TEST 4] Validasi Pembayaran Piutang Berlebih');
  let tolakLebih = false;
  try {
    env.aksiPiutangBayar_({
      ...ctxOwner,
      payload: { id: piutangId, jumlah: 50000 }
    });
  } catch (err) {
    tolakLebih = (err.code === 'CONFLICT' || err.code === 'VALIDATION');
  }
  assert(tolakLebih, 'Pembayaran pada piutang yang sudah lunas ditolak');

  // ==========================================
  // [TEST 5] Hutang Supplier & Pembayaran Cicilan (hutang.bayar)
  // ==========================================
  console.log('\n[TEST 5] Pembayaran Hutang ke Supplier');
  // Buat faktur pembelian tempo: 1.000.000, bayar DP 0, sisa hutang 1.000.000
  const resBeliTempo = env.aksiPembelianCreate_({
    ...ctxOwner,
    payload: {
      supplier_id: supId,
      bayar: 0,
      jatuh_tempo: '2026-12-01',
      items: [{
        produk_id: besiId,
        satuan: 'batang',
        faktor: 1,
        qty: 15,
        harga_beli: 60000 // 900.000
      }]
    }
  });

  const htList = env.aksiHutangList_({ ...ctxOwner, payload: { supplier_id: supId } });
  assert(htList.items.length === 1, 'hutang.list menampilkan 1 hutang aktif');
  const hutangId = htList.items[0].id;
  assert(htList.items[0].sisa === 900000, 'Sisa hutang awal Rp 900.000');

  // Bayar cicilan hutang 400.000
  const resBayarHt = env.aksiHutangBayar_({
    ...ctxOwner,
    payload: {
      id: hutangId,
      jumlah: 400000,
      metode: 'transfer',
      catatan: 'Cicilan 1 via Mandiri'
    }
  });

  assert(resBayarHt.status === 'sebagian', 'Status hutang menjadi "sebagian"');
  assert(resBayarHt.sisa === 500000, 'Sisa hutang berkurang menjadi Rp 500.000');

  // Verifikasi rincian hutang (hutang.detail)
  const detHt = env.aksiHutangDetail_({ ...ctxOwner, payload: { id: hutangId } });
  assert(detHt.riwayat_pembayaran.length === 1, 'hutang.detail memuat riwayat pembayaran cicilan');

  // ==========================================
  // [TEST 6] Retur Penjualan (Aturan Bisnis #12: HPP Moving Average Pakai Snapshot)
  // ==========================================
  console.log('\n[TEST 6] Retur Penjualan (HPP Moving Average Pakai Snapshot)');
  // Besi saat ini: stok = 100 - 10 (jual) + 15 (beli) = 105 batang @ HPP 60.000.
  // Buat penjualan tunai baru: jual 5 batang @ 75.000 (HPP snapshot 60.000).
  const resJualBaru = env.aksiPenjualanCreate_({
    ...ctxOwner,
    payload: {
      pelanggan_id: pelId,
      metode_bayar: 'tunai',
      bayar: 375000,
      pembayaran: [
        { metode: 'tunai', jumlah: 375000 }
      ],
      items: [{
        produk_id: besiId,
        satuan: 'batang',
        faktor: 1,
        qty: 5,
        harga: 75000
      }]
    }
  });
  // Stok besi sekarang: 100 batang.
  const besiSebelumRetur = env.cariById_('Produk', besiId);
  assert(besiSebelumRetur.stok === 100, 'Stok besi sebelum retur jual adalah 100 batang');

  // Pelanggan meretur 2 batang (kelebihan beli proyek).
  // HPP snapshot item asal = 60.000.
  // Rumus HPP baru: (100 * 60.000 + 2 * 60.000) / 102 = 60.000.
  const resReturJual = env.aksiReturCreate_({
    ...ctxOwner,
    payload: {
      tipe: 'jual',
      ref_id: resJualBaru.penjualan.id,
      alasan: 'Kelebihan belanja proyek',
      metode_refund: 'kas',
      items: [{
        produk_id: besiId,
        satuan: 'batang',
        faktor: 1,
        qty: 2,
        harga: 75000,
        hpp: 60000
      }]
    }
  });

  assert(resReturJual.status === 'disetujui', 'Retur oleh Owner langsung berstatus "disetujui"');
  assert(resReturJual.no_retur.startsWith('RT-'), 'Nomor retur berformat RT-YYYYMMDD-XXXX');

  const besiSetelahRetur = env.cariById_('Produk', besiId);
  assert(besiSetelahRetur.stok === 102, 'Stok besi bertambah kembali 2 batang menjadi 102');
  assert(besiSetelahRetur.hpp === 60000, 'HPP dihitung ulang memakai HPP snapshot item asal (Rp 60.000)');

  // Periksa Kartu Stok untuk retur jual
  const ksReturJual = env.bacaSemua_('Kartu_Stok').filter(k => k.ref_id === resReturJual.no_retur);
  assert(ksReturJual.length === 1 && ksReturJual[0].tipe === 'retur_jual' && ksReturJual[0].qty === 2, 'Kartu_Stok mencatat tipe retur_jual qty +2');

  // Periksa pengurangan poin & total belanja pelanggan (Aturan Bisnis #7 & #16)
  // Nilai retur: 2 * 75.000 = 150.000 -> kurangi 15 poin!
  const pelSetelahRetur = env.cariById_('Pelanggan', pelId);
  assert(pelSetelahRetur.poin < 75 + 37, 'Poin member berkurang sesuai proporsi nilai retur');
  const poinLogRetur = env.bacaSemua_('Poin_Log').filter(pl => pl.ref_id === resReturJual.no_retur);
  assert(poinLogRetur.length === 1 && poinLogRetur[0].jenis === 'retur' && poinLogRetur[0].jumlah === -15, 'Poin_Log mencatat jenis retur dengan jumlah -15');

  // ==========================================
  // [TEST 7] Retur Pembelian ke Supplier (Aturan Bisnis #12: HPP Tidak Berubah)
  // ==========================================
  console.log('\n[TEST 7] Retur Pembelian ke Supplier (HPP Tidak Berubah)');
  // Besi saat ini stok 102 @ HPP 60.000.
  // Retur 2 batang ke supplier karena cacat bengkok.
  const resReturBeli = env.aksiReturCreate_({
    ...ctxOwner,
    payload: {
      tipe: 'beli',
      ref_id: resBeliTempo.id,
      alasan: 'Besi bengkok cacat pabrik',
      metode_refund: 'potong_hutang',
      items: [{
        produk_id: besiId,
        satuan: 'batang',
        faktor: 1,
        qty: 2,
        harga: 60000,
        hpp: 60000
      }]
    }
  });

  const besiSetelahReturBeli = env.cariById_('Produk', besiId);
  assert(besiSetelahReturBeli.stok === 100, 'Stok besi berkurang 2 batang menjadi 100');
  assert(besiSetelahReturBeli.hpp === 60000, 'Aturan Bisnis #12 terpenuhi: Retur pembelian TIDAK MENGUBAH HPP');

  // Periksa bahwa hutang ke supplier berkurang (metode_refund === 'potong_hutang')
  // Sisa hutang tadi 500.000 - retur 120.000 = 380.000.
  const htSetelahRetur = env.cariById_('Hutang', hutangId);
  assert(htSetelahRetur.sisa === 380000, 'Sisa hutang berkurang Rp 120.000 menjadi Rp 380.000 via potong_hutang');

  // ==========================================
  // [TEST 8] Alur Pengajuan Retur Kasir (Draft/Diajukan -> Disetujui Owner)
  // ==========================================
  console.log('\n[TEST 8] Alur Retur oleh Kasir (Diajukan -> Disetujui Owner)');
  const resAjukanKasir = env.aksiReturCreate_({
    ...ctxKasir,
    payload: {
      tipe: 'jual',
      ref_id: resJualBaru.penjualan.id,
      alasan: 'Pelanggan salah ukuran (diajukan kasir)',
      metode_refund: 'kas',
      items: [{
        produk_id: besiId,
        satuan: 'batang',
        faktor: 1,
        qty: 1,
        harga: 75000,
        hpp: 60000
      }]
    }
  });

  assert(resAjukanKasir.status === 'diajukan', 'Retur yang dibuat kasir berstatus "diajukan"');
  const stokSaatDiajukan = env.cariById_('Produk', besiId).stok;
  assert(stokSaatDiajukan === 100, 'Stok belum berubah selama retur masih berstatus diajukan');

  // Kasir dilarang menyetujui retur (FORBIDDEN)
  let tolakApproveKasir = false;
  try {
    env.aksiReturApprove_({ ...ctxKasir, payload: { id: resAjukanKasir.id } });
  } catch (err) {
    tolakApproveKasir = true;
  }
  assert(tolakApproveKasir, 'Kasir ditolak saat mencoba approve retur (FORBIDDEN)');

  // Owner menyetujui retur
  const resApproveOwner = env.aksiReturApprove_({
    ...ctxOwner,
    payload: { id: env.bacaSemua_('Retur').find(r => r.no_retur === resAjukanKasir.no_retur).id }
  });

  const stokSetelahSetuju = env.cariById_('Produk', besiId).stok;
  assert(stokSetelahSetuju === 101, 'Setelah disetujui Owner, stok bertambah menjadi 101 batang');

  // Selesai
  console.log('\n=============================================');
  console.log(`TOTAL UJI FASE 4: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log('=============================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal error dalam tes:', err);
  process.exit(1);
});


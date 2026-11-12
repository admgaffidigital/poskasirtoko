/**
 * test_fase5.js — Uji Otomatis Lengkap Fase 5 (Pelanggan, Member, Hadiah, & Loyalitas)
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
  console.log('[SETUP] Memulai Pengujian Fase 5 (Pelanggan, Member, Hadiah, & Loyalitas)...');
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
      console.error('  ❌ GAGAL: ' + msg);
      failed++;
    }
  }

  const ownerUser = env.bacaSemua_('Users').find(u => u.username === 'owner');
  const ctxOwner = {
    user: { id: ownerUser.id, username: 'owner', role: 'owner' },
    payload: {},
    token: 'token-owner'
  };

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

  // ==========================================
  // [TEST 1] Tambah Pelanggan & Member Baru (pelanggan.create)
  // ==========================================
  console.log('\n[TEST 1] Tambah Pelanggan & Member Baru');
  
  // 1. Pelanggan Umum
  const resPelUmum = env.aksiPelangganCreate_({
    ...ctxOwner,
    payload: {
      nama: 'Bpk. Budi Santoso (Umum)',
      hp: '0811223344',
      alamat: 'Jl. Merdeka No. 10',
      tipe: 'umum'
    }
  });
  assert(resPelUmum.pelanggan.nama === 'Bpk. Budi Santoso (Umum)', 'Pelanggan umum berhasil dibuat');
  assert(resPelUmum.pelanggan.tipe === 'umum', 'Tipe pelanggan adalah "umum"');

  // 2. Pelanggan Member (Pak Haji Agus, auto-generate MBR)
  const resMember1 = env.aksiPelangganCreate_({
    ...ctxOwner,
    payload: {
      nama: 'Haji Agus Mandiri',
      hp: '081234567890',
      alamat: 'Komplek Permata Indah Blok A/5',
      tipe: 'member',
      level: 'Gold',
      limit_kredit: 15000000,
      tempo_hari: 45
    }
  });

  const member1 = resMember1.pelanggan;
  assert(member1.tipe === 'member', 'Pelanggan member berhasil didaftarkan');
  assert(member1.kode.startsWith('MBR-'), 'Kode member otomatis berformat MBR-YYYYMMDD-XXXX: ' + member1.kode);
  assert(member1.limit_kredit === 15000000, 'Limit kredit tercatat Rp 15.000.000');
  assert(member1.tempo_hari === 45, 'Tempo kredit tercatat 45 hari');

  // 3. Validasi: Member wajib isi HP
  let tolakTanpaHp = false;
  try {
    env.aksiPelangganCreate_({
      ...ctxOwner,
      payload: { nama: 'Member Tanpa HP', tipe: 'member', hp: '' }
    });
  } catch (e) {
    tolakTanpaHp = (e.code === 'VALIDATION');
  }
  assert(tolakTanpaHp, 'Pendaftaran member tanpa nomor HP ditolak (VALIDATION)');

  // 4. Validasi: Nomor HP unik untuk member
  let tolakDuplikatHp = false;
  try {
    env.aksiPelangganCreate_({
      ...ctxOwner,
      payload: { nama: 'Member HP Kembar', tipe: 'member', hp: '081234567890' }
    });
  } catch (e) {
    tolakDuplikatHp = (e.code === 'CONFLICT');
  }
  assert(tolakDuplikatHp, 'Pendaftaran member dengan nomor HP kembar ditolak (CONFLICT)');

  // ==========================================
  // [TEST 2] Update Profil Pelanggan & Matriks Akses Kasir
  // ==========================================
  console.log('\n[TEST 2] Update Profil Pelanggan & Matriks Akses');
  
  // Kasir memperbarui alamat pelanggan (diizinkan)
  env.aksiPelangganUpdate_({
    ...ctxKasir,
    payload: {
      id: member1.id,
      alamat: 'Komplek Permata Indah Blok A/7 (Pindah Rumah)',
      limit_kredit: 99999999 // Kasir coba ubah limit kredit
    }
  });

  const memberSetelahKasirUpdate = env.cariById_('Pelanggan', member1.id);
  assert(memberSetelahKasirUpdate.alamat.includes('Blok A/7'), 'Kasir berhasil memperbarui alamat pelanggan');
  assert(memberSetelahKasirUpdate.limit_kredit === 15000000, 'Percobaan kasir menaikkan limit kredit diabaikan oleh sistem');

  // Owner memperbarui limit kredit & level (diizinkan)
  env.aksiPelangganUpdate_({
    ...ctxOwner,
    payload: {
      id: member1.id,
      limit_kredit: 20000000,
      level: 'Platinum'
    }
  });

  const memberSetelahOwnerUpdate = env.cariById_('Pelanggan', member1.id);
  assert(memberSetelahOwnerUpdate.limit_kredit === 20000000, 'Owner berhasil menaikkan limit kredit menjadi Rp 20.000.000');
  assert(memberSetelahOwnerUpdate.level === 'Platinum', 'Owner berhasil memperbarui level menjadi Platinum');

  // ==========================================
  // [TEST 3] Rincian Pelanggan & Integrasi Piutang/Poin (pelanggan.detail)
  // ==========================================
  console.log('\n[TEST 3] Rincian Pelanggan & Piutang Berjalan');

  // Berikan poin awal 500 dan buat 1 piutang aktif 1.000.000
  env.ubahBaris_('Pelanggan', [{ id: member1.id, data: { poin: 500, total_belanja: 5000000 } }], ctxOwner.user.id);
  
  env.tambahBaris_('Piutang', [{
    penjualan_id: 'INV-MOCK-01',
    pelanggan_id: member1.id,
    total: 1000000,
    terbayar: 0,
    sisa: 1000000,
    jatuh_tempo: '2026-12-31',
    status: 'belum'
  }], ctxOwner.user.id);

  const detPel = env.aksiPelangganDetail_({ ...ctxOwner, payload: { id: member1.id } });
  assert(detPel.pelanggan.poin === 500, 'pelanggan.detail memuat saldo poin 500');
  assert(detPel.piutang_berjalan === 1000000, 'pelanggan.detail memuat piutang berjalan Rp 1.000.000');
  assert(detPel.sisa_limit === 19000000, 'Sisa limit kredit terhitung tepat: Rp 19.000.000');

  // ==========================================
  // [TEST 4] Proteksi Penghapusan Pelanggan Berpiutang (pelanggan.delete)
  // ==========================================
  console.log('\n[TEST 4] Proteksi Penghapusan Pelanggan Berpiutang');
  let tolakHapusMember = false;
  try {
    env.aksiPelangganDelete_({ ...ctxOwner, payload: { id: member1.id } });
  } catch (e) {
    tolakHapusMember = (e.code === 'CONFLICT');
  }
  assert(tolakHapusMember, 'Penghapusan pelanggan yang memiliki saldo piutang aktif ditolak (CONFLICT)');

  // ==========================================
  // [TEST 5] CRUD Master Hadiah Poin (hadiah.*)
  // ==========================================
  console.log('\n[TEST 5] CRUD Master Hadiah Poin');
  
  const resHadiah1 = env.aksiHadiahCreate_({
    ...ctxOwner,
    payload: {
      nama: 'Kaos Toko Bangunan Eksklusif',
      deskripsi: 'Bahan Cotton Combed 30s Nyaman',
      poin_dibutuhkan: 150,
      stok: 10,
      aktif: true
    }
  });

  const hadiahId = resHadiah1.hadiah.id;
  assert(resHadiah1.hadiah.nama === 'Kaos Toko Bangunan Eksklusif', 'Hadiah kaos berhasil ditambahkan');
  assert(resHadiah1.hadiah.poin_dibutuhkan === 150, 'Poin dibutuhkan tepat 150 poin');

  const listHadiah = env.aksiHadiahList_({ ...ctxOwner, payload: { cari: 'kaos' } });
  assert(listHadiah.items.length === 1, 'hadiah.list menemukan hadiah sesuai pencarian');

  // Update stok hadiah
  env.aksiHadiahUpdate_({
    ...ctxOwner,
    payload: { id: hadiahId, stok: 5 }
  });
  const hadiahSetelahUpdate = env.cariById_('Hadiah', hadiahId);
  assert(hadiahSetelahUpdate.stok === 5, 'hadiah.update berhasil memperbarui stok menjadi 5');

  // ==========================================
  // [TEST 6] Validasi Penukaran Hadiah (Poin Tidak Cukup)
  // ==========================================
  console.log('\n[TEST 6] Validasi Penukaran Hadiah (Saldo Poin Tidak Cukup)');
  // Member punya 500 poin. Ingin tukar 4 kaos @ 150 poin = 600 poin (kurang 100 poin).
  let tolakPoinKurang = false;
  try {
    env.aksiMemberTukarPoin_({
      ...ctxKasir,
      payload: {
        pelanggan_id: member1.id,
        hadiah_id: hadiahId,
        qty: 4
      }
    });
  } catch (e) {
    tolakPoinKurang = (e.code === 'VALIDATION');
  }
  assert(tolakPoinKurang, 'Penukaran hadiah saat saldo poin tidak cukup ditolak (VALIDATION)');

  // ==========================================
  // [TEST 7] Validasi Penukaran Hadiah (Stok Hadiah Tidak Cukup)
  // ==========================================
  console.log('\n[TEST 7] Validasi Penukaran Hadiah (Stok Habis / Kurang)');
  // Stok hadiah cuma 5. Buat hadiah lain dengan stok 0.
  const resHadiahHabis = env.aksiHadiahCreate_({
    ...ctxOwner,
    payload: {
      nama: 'Payung Lipat Toko',
      poin_dibutuhkan: 100,
      stok: 0,
      aktif: true
    }
  });

  let tolakStokHabis = false;
  try {
    env.aksiMemberTukarPoin_({
      ...ctxKasir,
      payload: {
        pelanggan_id: member1.id,
        hadiah_id: resHadiahHabis.hadiah.id,
        qty: 1
      }
    });
  } catch (e) {
    tolakStokHabis = (e.code === 'CONFLICT');
  }
  assert(tolakStokHabis, 'Penukaran hadiah yang kehabisan stok ditolak (CONFLICT)');

  // ==========================================
  // [TEST 8] Eksekusi Sukses Tukar Poin Member (member.tukarPoin)
  // ==========================================
  console.log('\n[TEST 8] Eksekusi Sukses Tukar Poin Member');
  // Member punya 500 poin. Tukar 2 kaos @ 150 poin = 300 poin. Sisa poin = 200.
  // Stok hadiah 5 - 2 = 3.
  const resTukar = env.aksiMemberTukarPoin_({
    ...ctxKasir,
    payload: {
      pelanggan_id: member1.id,
      hadiah_id: hadiahId,
      qty: 2,
      catatan: 'Diberikan langsung di kasir oleh Kasir Satu'
    }
  });

  assert(resTukar.no_tukar.startsWith('TK-'), 'Nomor bukti penukaran berformat TK-YYYYMMDD-XXXX: ' + resTukar.no_tukar);
  assert(resTukar.sisa_poin === 200, 'Sisa saldo poin member berkurang tepat menjadi 200');
  assert(resTukar.sisa_stok === 3, 'Sisa stok hadiah di toko berkurang menjadi 3 unit');

  // Verifikasi pencatatan di sheet Penukaran_Hadiah
  const semuaTukar = env.bacaSemua_('Penukaran_Hadiah');
  const recordTukar = semuaTukar.find(t => t.no_tukar === resTukar.no_tukar);
  assert(recordTukar && recordTukar.poin === 300 && recordTukar.qty === 2, 'Tercatat di sheet Penukaran_Hadiah dengan poin 300');

  // Verifikasi pencatatan di sheet Poin_Log (Aturan Bisnis)
  const semuaLogPoin = env.bacaSemua_('Poin_Log');
  const logTukar = semuaLogPoin.find(l => l.ref_id === resTukar.no_tukar);
  assert(logTukar && logTukar.jenis === 'tukar' && logTukar.jumlah === -300 && logTukar.saldo === 200, 'Poin_Log mencatat mutasi jenis "tukar" dengan jumlah -300 dan saldo 200');

  // Verifikasi pencatatan di Log_Audit
  const logAudit = env.bacaSemua_('Log_Audit').filter(a => a.modul === 'LOYALITAS');
  assert(logAudit.length >= 1, 'Penukaran hadiah tercatat di Log_Audit');

  // ==========================================
  // [TEST 9] Riwayat Mutasi Poin Member (member.riwayatPoin)
  // ==========================================
  console.log('\n[TEST 9] Riwayat Mutasi Poin Member');
  const riwayatLog = env.aksiMemberRiwayatPoin_({
    ...ctxKasir,
    payload: { pelanggan_id: member1.id }
  });

  assert(riwayatLog.items.length >= 1, 'member.riwayatPoin memuat riwayat mutasi poin member');
  assert(riwayatLog.items[0].ref_id === resTukar.no_tukar, 'Riwayat teratas adalah transaksi penukaran hadiah terakhir');

  // Selesai
  console.log('\n=============================================');
  console.log(`TOTAL UJI FASE 5: ${passed + failed} | LULUS: ${passed} | GAGAL: ${failed}`);
  console.log('=============================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal error dalam tes:', err);
  process.exit(1);
});


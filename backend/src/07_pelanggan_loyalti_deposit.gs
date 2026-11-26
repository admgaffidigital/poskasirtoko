/* ========================================================================== */
/* 9.5 FASE 5: PELANGGAN, MEMBER, KATALOG HADIAH, & PENUKARAN POIN            */
/* ========================================================================== */

/**
 * Normalisasi nomor HP Indonesia:
 * - Menghapus karakter non-digit selain tanda tambah.
 * - Mengubah format "+62..." atau "62..." menjadi "0...".
 * - Mengubah format tanpa nol awalan "8..." menjadi "08...".
 */
function bersihkanHp_(hp) {
  if (hp === null || hp === undefined) return '';
  let str = String(hp).trim().replace(/[^\d+]/g, '');
  if (str.indexOf('+62') === 0) {
    str = '0' + str.slice(3);
  } else if (str.indexOf('62') === 0) {
    str = '0' + str.slice(2);
  } else if (str.length > 0 && str.indexOf('8') === 0) {
    str = '0' + str;
  }
  return str.replace(/\D/g, '');
}

/** pelanggan.detail — Rincian pelanggan, piutang aktif, riwayat transaksi & mutasi poin. */
function aksiPelangganDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID pelanggan wajib diberikan.');

  const pel = cariById_('Pelanggan', p.id);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');

  // Ambil saldo piutang aktif
  const semuaPiutang = bacaSemua_('Piutang');
  let piutangBerjalan = 0;
  const daftarPiutang = [];
  semuaPiutang.forEach(function (pt) {
    if (pt.pelanggan_id === pel.id && !pt.deleted) {
      if (pt.status !== 'lunas') piutangBerjalan += (Number(pt.sisa) || 0);
      daftarPiutang.push(pt);
    }
  });

  const limitKredit = Number(pel.limit_kredit) || 0;
  const sisaLimit = Math.max(0, limitKredit - piutangBerjalan);

  // Riwayat Penjualan (15 transaksi terakhir)
  const semuaPenjualan = bacaSemua_('Penjualan');
  const riwayatPenjualan = semuaPenjualan
    .filter(function (pj) { return pj.pelanggan_id === pel.id && !pj.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .slice(0, 15);

  // Riwayat Mutasi Poin (Poin_Log)
  const semuaPoin = bacaSemua_('Poin_Log');
  const riwayatPoin = semuaPoin
    .filter(function (pl) { return pl.pelanggan_id === pel.id && !pl.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .slice(0, 20);

  // Riwayat Penukaran Hadiah
  const semuaTukar = bacaSemua_('Penukaran_Hadiah');
  const semuaHadiah = bacaSemua_('Hadiah');
  const hadiahPeta = {};
  semuaHadiah.forEach(function (h) { hadiahPeta[h.id] = h.nama; });

  const riwayatPenukaran = semuaTukar
    .filter(function (tk) { return tk.pelanggan_id === pel.id && !tk.deleted; })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .map(function (tk) {
      const copy = Object.assign({}, tk);
      copy.nama_hadiah = hadiahPeta[tk.hadiah_id] || 'Hadiah';
      return copy;
    });

  // Riwayat Mutasi Saldo Titipan / Deposit (20 terakhir)
  const semuaDeposit = bacaSemua_('Deposit_Log');
  const riwayatDeposit = semuaDeposit
    .filter(function (dl) { return dl.pelanggan_id === pel.id && !dl.deleted; })
    .sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); })
    .slice(0, 20);

  const pelCopy = Object.assign({}, pel, {
    saldo_deposit: Number(pel.saldo_deposit) || 0
  });

  return {
    pelanggan: pelCopy,
    piutang_berjalan: piutangBerjalan,
    sisa_limit: sisaLimit,
    daftar_piutang: daftarPiutang,
    riwayat_penjualan: riwayatPenjualan,
    riwayat_poin: riwayatPoin,
    riwayat_penukaran: riwayatPenukaran,
    riwayat_deposit: riwayatDeposit
  };
}

/** pelanggan.create — Tambah pelanggan atau member baru. */
function aksiPelangganCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Pelanggan', { min: 2, maks: 100 });
  const tipe = p.tipe === 'member' ? 'member' : 'umum';
  const hpRaw = String(p.hp || '').trim();
  const hpBersih = bersihkanHp_(hpRaw);

  if (tipe === 'member' && (!hpBersih || hpBersih.length < 7)) {
    gagal_(KODE.VALIDATION, 'Nomor HP wajib diisi (minimal 7 digit) untuk pelanggan berstatus Member.');
  }

  const semuaPelanggan = bacaSemua_('Pelanggan');

  // Validasi keunikan nomor HP untuk member aktif
  if (tipe === 'member' && hpBersih) {
    let memberBentrok = null;
    for (let i = 0; i < semuaPelanggan.length; i++) {
      const pel = semuaPelanggan[i];
      if (pel.deleted || pel.aktif === false || pel.tipe !== 'member') continue;
      const pelHp = bersihkanHp_(pel.hp);
      if (pelHp && pelHp === hpBersih) {
        memberBentrok = pel;
        break;
      }
    }
    if (memberBentrok) {
      gagal_(KODE.CONFLICT, 'Nomor HP ' + hpBersih + ' sudah terdaftar untuk member: "' + memberBentrok.nama + '" (Kode: ' + (memberBentrok.kode || '-') + ').');
    }
  }

  // Kode Member: jika tidak diberikan, auto-generate via Counter MBR / PLG
  let kode = String(p.kode || '').trim().toUpperCase();
  if (tipe === 'member' && !kode) {
    kode = nomorBerikut_('MBR');
  } else if (!kode) {
    kode = nomorBerikut_('PLG');
  }

  const limitKredit = V_.nonNegatif(p.limit_kredit, 'Limit Kredit') || 0;
  const tempoHari = V_.nonNegatif(p.tempo_hari, 'Tempo Hari') || 30;
  const level = V_.teks(p.level, 'Level Member', { maks: 30 }) || 'Reguler';

  const barisBaru = {
    kode: kode,
    nama: nama,
    hp: hpBersih || hpRaw,
    alamat: String(p.alamat || '').trim(),
    tipe: tipe,
    level: level,
    limit_kredit: limitKredit,
    tempo_hari: tempoHari,
    poin: 0,
    total_belanja: 0,
    aktif: p.aktif !== false
  };

  const tersimpan = tambahBaris_('Pelanggan', [barisBaru], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'pelanggan_create', 'PELANGGAN', tersimpan.id, {
    kode: kode,
    nama: nama,
    tipe: tipe
  });

  return {
    pesan: 'Pelanggan ' + nama + ' berhasil ditambahkan.',
    pelanggan: tersimpan
  };
}

/** pelanggan.update — Perbarui data pelanggan/member. */
function aksiPelangganUpdate_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID pelanggan wajib diberikan.');

  const pel = cariById_('Pelanggan', p.id);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');

  const isKasir = ctx.user.role === ROLE.KASIR;
  const dataUbah = {};

  if (p.nama !== undefined) dataUbah.nama = V_.teks(p.nama, 'Nama Pelanggan', { min: 2, maks: 100 });
  if (p.hp !== undefined) {
    const hpBaruRaw = String(p.hp || '').trim();
    const hpBaruBersih = bersihkanHp_(hpBaruRaw);
    if (pel.tipe === 'member' && (!hpBaruBersih || hpBaruBersih.length < 7)) {
      gagal_(KODE.VALIDATION, 'Nomor HP tidak boleh dikosongkan (minimal 7 digit) untuk member.');
    }
    const pelHpBersih = bersihkanHp_(pel.hp);
    if (pel.tipe === 'member' && hpBaruBersih && hpBaruBersih !== pelHpBersih) {
      const semuaPelanggan = bacaSemua_('Pelanggan');
      let memberBentrok = null;
      for (let i = 0; i < semuaPelanggan.length; i++) {
        const x = semuaPelanggan[i];
        if (x.id === pel.id || x.deleted || x.aktif === false || x.tipe !== 'member') continue;
        const xHp = bersihkanHp_(x.hp);
        if (xHp && xHp === hpBaruBersih) {
          memberBentrok = x;
          break;
        }
      }
      if (memberBentrok) {
        gagal_(KODE.CONFLICT, 'Nomor HP ' + hpBaruBersih + ' sudah digunakan oleh member: "' + memberBentrok.nama + '" (Kode: ' + (memberBentrok.kode || '-') + ').');
      }
    }
    dataUbah.hp = hpBaruBersih || hpBaruRaw;
  }
  if (p.alamat !== undefined) dataUbah.alamat = String(p.alamat || '').trim();
  if (p.aktif !== undefined) dataUbah.aktif = Boolean(p.aktif);

  // Field finansial & level hanya boleh diubah oleh Owner & Admin
  if (!isKasir) {
    if (p.tipe !== undefined) dataUbah.tipe = p.tipe === 'member' ? 'member' : 'umum';
    if (p.level !== undefined) dataUbah.level = V_.teks(p.level, 'Level', { maks: 30 }) || 'Reguler';
    if (p.limit_kredit !== undefined) dataUbah.limit_kredit = V_.nonNegatif(p.limit_kredit, 'Limit Kredit');
    if (p.tempo_hari !== undefined) dataUbah.tempo_hari = V_.nonNegatif(p.tempo_hari, 'Tempo Hari');
    if (p.kode !== undefined && p.kode) dataUbah.kode = String(p.kode).trim().toUpperCase();
  }

  ubahBaris_('Pelanggan', [{ id: pel.id, data: dataUbah }], ctx.user.id);

  catatAudit_(ctx.user.id, 'pelanggan_update', 'PELANGGAN', pel.id, dataUbah);

  return {
    pesan: 'Data pelanggan berhasil diperbarui.',
    id: pel.id
  };
}

/** pelanggan.delete — Hapus pelanggan (soft-delete). Dicegah jika masih ada piutang aktif. */
function aksiPelangganDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID pelanggan wajib diberikan.');

  const pel = cariById_('Pelanggan', p.id);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');

  // Cek piutang berjalan aktif (Aturan Bisnis)
  const semuaPiutang = bacaSemua_('Piutang');
  const piutangAktif = semuaPiutang.filter(function (pt) {
    return pt.pelanggan_id === pel.id && !pt.deleted && pt.status !== 'lunas';
  });

  if (piutangAktif.length > 0) {
    let totalSisa = 0;
    piutangAktif.forEach(function (pt) { totalSisa += (Number(pt.sisa) || 0); });
    gagal_(KODE.CONFLICT, 'Pelanggan ' + pel.nama + ' tidak dapat dihapus karena masih memiliki saldo piutang aktif sebesar Rp ' + totalSisa.toLocaleString('id-ID') + '. Selesaikan piutang terlebih dahulu.');
  }

  // Cek saldo titipan / deposit aktif
  const saldoDepositAktif = Number(pel.saldo_deposit) || 0;
  if (saldoDepositAktif > 0) {
    gagal_(KODE.CONFLICT, 'Pelanggan ' + pel.nama + ' tidak dapat dihapus karena masih memiliki Saldo Titipan sebesar ' + formatRupiah_(saldoDepositAktif) + '. Kembalikan saldo terlebih dahulu.');
  }

  hapusLunak_('Pelanggan', pel.id, ctx.user.id);

  catatAudit_(ctx.user.id, 'pelanggan_delete', 'PELANGGAN', pel.id, { nama: pel.nama, kode: pel.kode });

  return {
    pesan: 'Pelanggan ' + pel.nama + ' berhasil dihapus.',
    id: pel.id
  };
}

/**
 * deposit.tambah — Terima titipan uang / top-up saldo deposit pelanggan (Semua Role).
 * Masuk arus kas (tunai/transfer/qris) & shift kasir (jika tunai), TIDAK masuk omset/laba/poin.
 */
function aksiDepositTambah_(ctx) {
  const p = ctx.payload || {};
  const pelangganId = V_.teks(p.pelanggan_id, 'ID Pelanggan', { wajib: true });
  const jumlah = V_.rupiah(p.jumlah, 'Nominal Titipan', { wajib: true, min: 1 });
  const metode = V_.pilihan(p.metode || 'tunai', 'Metode Penerimaan', ['tunai', 'transfer', 'qris']);
  const catatan = V_.teks(p.catatan, 'Catatan Titipan', { maks: 250 });

  const pel = cariById_('Pelanggan', pelangganId);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');
  if (pel.aktif === false) gagal_(KODE.VALIDATION, 'Pelanggan berstatus nonaktif tidak dapat menerima titipan.');
  cekPeriodeTerkunci_(sekarang_());

  const saldoLama = Number(pel.saldo_deposit) || 0;
  const saldoBaru = saldoLama + jumlah;
  const noBukti = nomorBerikut_('DEP');

  ubahBaris_('Pelanggan', [{
    id: pel.id,
    data: { saldo_deposit: saldoBaru }
  }], ctx.user.id);

  const logBaru = tambahBaris_('Deposit_Log', [{
    no_bukti: noBukti,
    pelanggan_id: pel.id,
    jenis: 'masuk',
    metode: metode,
    jumlah: jumlah,
    saldo: saldoBaru,
    ref_id: noBukti,
    catatan: catatan || ('Titipan saldo via ' + metode.toUpperCase())
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'deposit_tambah', 'DEPOSIT', noBukti, {
    pelanggan_id: pel.id,
    pelanggan_nama: pel.nama,
    jumlah: jumlah,
    metode: metode,
    saldo_akhir: saldoBaru
  });

  return {
    pesan: 'Titipan sebesar ' + formatRupiah_(jumlah) + ' untuk ' + pel.nama + ' berhasil dicatat.',
    no_bukti: noBukti,
    saldo_deposit: saldoBaru,
    pelanggan: Object.assign({}, pel, { saldo_deposit: saldoBaru }),
    log: logBaru
  };
}

/**
 * deposit.tarik — Pengembalian / pencairan sisa saldo titipan pelanggan (Owner & Admin).
 * Masuk arus kas keluar (tunai/transfer) & mengurangi laci shift kasir (jika tunai).
 */
function aksiDepositTarik_(ctx) {
  const p = ctx.payload || {};
  const pelangganId = V_.teks(p.pelanggan_id, 'ID Pelanggan', { wajib: true });
  const jumlah = V_.rupiah(p.jumlah, 'Nominal Penarikan', { wajib: true, min: 1 });
  const metode = V_.pilihan(p.metode || 'tunai', 'Metode Pengembalian', ['tunai', 'transfer']);
  const catatan = V_.teks(p.catatan, 'Catatan Pengembalian', { maks: 250 });

  const pel = cariById_('Pelanggan', pelangganId);
  if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');
  cekPeriodeTerkunci_(sekarang_());

  const saldoLama = Number(pel.saldo_deposit) || 0;
  if (jumlah > saldoLama) {
    gagal_(KODE.VALIDATION, 'Nominal pengembalian melebihi saldo titipan saat ini (' + formatRupiah_(saldoLama) + ').');
  }

  const saldoBaru = Math.max(0, saldoLama - jumlah);
  const noBukti = nomorBerikut_('DEP');

  ubahBaris_('Pelanggan', [{
    id: pel.id,
    data: { saldo_deposit: saldoBaru }
  }], ctx.user.id);

  const logBaru = tambahBaris_('Deposit_Log', [{
    no_bukti: noBukti,
    pelanggan_id: pel.id,
    jenis: 'tarik',
    metode: metode,
    jumlah: -jumlah,
    saldo: saldoBaru,
    ref_id: noBukti,
    catatan: catatan || ('Pengembalian saldo titipan via ' + metode.toUpperCase())
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'deposit_tarik', 'DEPOSIT', noBukti, {
    pelanggan_id: pel.id,
    pelanggan_nama: pel.nama,
    jumlah: jumlah,
    metode: metode,
    saldo_akhir: saldoBaru
  });

  return {
    pesan: 'Pengembalian saldo titipan sebesar ' + formatRupiah_(jumlah) + ' untuk ' + pel.nama + ' berhasil dicatat.',
    no_bukti: noBukti,
    saldo_deposit: saldoBaru,
    pelanggan: Object.assign({}, pel, { saldo_deposit: saldoBaru }),
    log: logBaru
  };
}

/** deposit.riwayat — Daftar mutasi saldo titipan pelanggan (filter opsional pelanggan_id). */
function aksiDepositRiwayat_(ctx) {
  const p = ctx.payload || {};
  const pelId = p.pelanggan_id ? String(p.pelanggan_id).trim() : '';
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 200);

  const semuaPel = bacaSemua_('Pelanggan');
  const pelPeta = {};
  semuaPel.forEach(function (pel) { pelPeta[pel.id] = pel.nama; });

  let rows = bacaSemua_('Deposit_Log').filter(function (dl) {
    if (dl.deleted) return false;
    if (pelId && dl.pelanggan_id !== pelId) return false;
    return true;
  });

  rows.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  const items = rows.slice(0, limit).map(function (dl) {
    const copy = Object.assign({}, dl);
    copy.pelanggan_nama = pelPeta[dl.pelanggan_id] || 'Pelanggan';
    return copy;
  });

  return {
    items: items,
    total: rows.length
  };
}

/** hadiah.list — Katalog hadiah poin loyalitas. */
function aksiHadiahList_(ctx) {
  const p = ctx.payload || {};
  const semuaHadiah = bacaSemua_('Hadiah');
  let data = semuaHadiah.filter(function (h) { return !h.deleted; });

  if (p.aktif_saja !== false) {
    data = data.filter(function (h) { return h.aktif; });
  }

  const q = String(p.cari || p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (h) {
      return String(h.nama || '').toLowerCase().indexOf(q) !== -1 ||
             String(h.deskripsi || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) { return Number(a.poin_dibutuhkan || 0) - Number(b.poin_dibutuhkan || 0); });

  return { items: data, total: data.length };
}

/** hadiah.create — Tambah item hadiah penukaran poin (Owner & Admin). */
function aksiHadiahCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Hadiah', { min: 2, maks: 100 });
  const poin = V_.positif(p.poin_dibutuhkan, 'Poin Dibutuhkan');
  const stok = V_.nonNegatif(p.stok, 'Stok Hadiah');
  const deskripsi = V_.teks(p.deskripsi, 'Deskripsi Hadiah', { maks: 300 }) || '';

  const baris = {
    nama: nama,
    deskripsi: deskripsi,
    poin_dibutuhkan: poin,
    stok: stok,
    aktif: p.aktif !== false
  };

  const tersimpan = tambahBaris_('Hadiah', [baris], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'hadiah_create', 'HADIAH', tersimpan.id, { nama: nama, poin: poin, stok: stok });

  return {
    pesan: 'Hadiah ' + nama + ' berhasil ditambahkan.',
    hadiah: tersimpan
  };
}

/** hadiah.update — Ubah data hadiah (Owner & Admin). */
function aksiHadiahUpdate_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hadiah wajib diberikan.');

  const h = cariById_('Hadiah', p.id);
  if (!h || h.deleted) gagal_(KODE.NOT_FOUND, 'Data hadiah tidak ditemukan.');

  const dataUbah = {};
  if (p.nama !== undefined) dataUbah.nama = V_.teks(p.nama, 'Nama Hadiah', { min: 2, maks: 100 });
  if (p.deskripsi !== undefined) dataUbah.deskripsi = String(p.deskripsi || '').trim();
  if (p.poin_dibutuhkan !== undefined) dataUbah.poin_dibutuhkan = V_.positif(p.poin_dibutuhkan, 'Poin Dibutuhkan');
  if (p.stok !== undefined) dataUbah.stok = V_.nonNegatif(p.stok, 'Stok Hadiah');
  if (p.aktif !== undefined) dataUbah.aktif = Boolean(p.aktif);

  ubahBaris_('Hadiah', [{ id: h.id, data: dataUbah }], ctx.user.id);

  catatAudit_(ctx.user.id, 'hadiah_update', 'HADIAH', h.id, dataUbah);

  return {
    pesan: 'Data hadiah berhasil diperbarui.',
    id: h.id
  };
}

/** hadiah.delete — Soft-delete hadiah (Owner & Admin). */
function aksiHadiahDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hadiah wajib diberikan.');

  const h = cariById_('Hadiah', p.id);
  if (!h || h.deleted) gagal_(KODE.NOT_FOUND, 'Data hadiah tidak ditemukan.');

  hapusLunak_('Hadiah', h.id, ctx.user.id);

  catatAudit_(ctx.user.id, 'hadiah_delete', 'HADIAH', h.id, { nama: h.nama });

  return {
    pesan: 'Hadiah ' + h.nama + ' berhasil dihapus.',
    id: h.id
  };
}

/** member.tukarPoin — Eksekusi penukaran poin member dengan hadiah fisik toko. */
function aksiMemberTukarPoin_(ctx) {
  const p = ctx.payload || {};
  if (!p.pelanggan_id) gagal_(KODE.VALIDATION, 'Pelanggan member wajib dipilih.');
  if (!p.hadiah_id) gagal_(KODE.VALIDATION, 'Hadiah yang akan ditukar wajib dipilih.');

  const qty = Math.max(1, parseInt(p.qty, 10) || 1);

  return denganKunci_(function () {
    const pel = cariById_('Pelanggan', p.pelanggan_id);
    if (!pel || pel.deleted) gagal_(KODE.NOT_FOUND, 'Member tidak ditemukan.');
    if (pel.tipe !== 'member') gagal_(KODE.VALIDATION, 'Penukaran poin hanya berlaku untuk pelanggan Member.');
    if (!pel.aktif) gagal_(KODE.VALIDATION, 'Akun member ini sedang tidak aktif.');

    const hadiah = cariById_('Hadiah', p.hadiah_id);
    if (!hadiah || hadiah.deleted) gagal_(KODE.NOT_FOUND, 'Hadiah tidak ditemukan.');
    if (!hadiah.aktif) gagal_(KODE.VALIDATION, 'Hadiah "' + hadiah.nama + '" saat ini tidak aktif.');

    const stokTersedia = Number(hadiah.stok || 0);
    if (stokTersedia < qty) {
      gagal_(KODE.CONFLICT, 'Stok hadiah "' + hadiah.nama + '" tidak mencukupi (tersedia: ' + stokTersedia + ', diminta: ' + qty + ').');
    }

    const poinPerUnit = Number(hadiah.poin_dibutuhkan || 0);
    const totalPoinButuh = poinPerUnit * qty;
    const saldoPoinMember = Number(pel.poin || 0);

    if (saldoPoinMember < totalPoinButuh) {
      gagal_(KODE.VALIDATION, 'Saldo poin member (' + saldoPoinMember + ' poin) tidak mencukupi untuk menukar ' + qty + ' ' + hadiah.nama + ' (butuh ' + totalPoinButuh + ' poin).');
    }

    const noTukar = nomorBerikut_('TK');
    const poinBaru = saldoPoinMember - totalPoinButuh;
    const stokBaru = stokTersedia - qty;

    // 1. Kurangi stok hadiah
    ubahBaris_('Hadiah', [{
      id: hadiah.id,
      data: { stok: stokBaru }
    }], ctx.user.id);

    // 2. Kurangi saldo poin member
    ubahBaris_('Pelanggan', [{
      id: pel.id,
      data: { poin: poinBaru }
    }], ctx.user.id);

    // 3. Catat di Penukaran_Hadiah
    const penukaranRecord = {
      no_tukar: noTukar,
      pelanggan_id: pel.id,
      hadiah_id: hadiah.id,
      qty: qty,
      poin: totalPoinButuh,
      catatan: String(p.catatan || '').trim()
    };
    tambahBaris_('Penukaran_Hadiah', [penukaranRecord], ctx.user.id);

    // 4. Catat di Poin_Log
    tambahBaris_('Poin_Log', [{
      pelanggan_id: pel.id,
      jumlah: -totalPoinButuh,
      jenis: 'tukar',
      ref_id: noTukar,
      saldo: poinBaru
    }], ctx.user.id);

    // 5. Catat Audit Log
    catatAudit_(ctx.user.id, 'member_tukar_poin', 'LOYALITAS', noTukar, {
      member: pel.nama,
      hadiah: hadiah.nama,
      qty: qty,
      poin_tukar: totalPoinButuh,
      sisa_poin: poinBaru
    });

    return {
      pesan: 'Penukaran poin berhasil diproses. Nomor bukti: ' + noTukar,
      no_tukar: noTukar,
      hadiah_nama: hadiah.nama,
      qty: qty,
      poin_ditukar: totalPoinButuh,
      sisa_poin: poinBaru,
      sisa_stok: stokBaru
    };
  });
}

/** member.riwayatPoin — Riwayat transaksi penambahan/pengurangan poin member. */
function aksiMemberRiwayatPoin_(ctx) {
  const p = ctx.payload || {};
  const filterPelangganId = String(p.pelanggan_id || '').trim();
  const filterJenis = String(p.jenis || '').trim().toLowerCase();

  if (!filterPelangganId && !filterJenis) {
    gagal_(KODE.VALIDATION, 'ID pelanggan member wajib diberikan.');
  }

  const semuaLog = bacaSemua_('Poin_Log');
  const mapPel = {};
  if (!filterPelangganId) {
    bacaSemua_('Pelanggan').forEach(function (pl) {
      mapPel[pl.id] = pl.nama;
    });
  }

  const data = semuaLog
    .filter(function (l) {
      if (l.deleted) return false;
      if (filterPelangganId && l.pelanggan_id !== filterPelangganId) return false;
      if (filterJenis && String(l.jenis || '').toLowerCase() !== filterJenis) return false;
      return true;
    })
    .sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); })
    .map(function (l) {
      if (!filterPelangganId && mapPel[l.pelanggan_id]) {
        return Object.assign({}, l, { nama_pelanggan: mapPel[l.pelanggan_id] });
      }
      return l;
    });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

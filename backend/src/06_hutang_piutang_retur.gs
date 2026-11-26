/* ---------- 9.4 HUTANG, PIUTANG, DAN RETUR (FASE 4) ---------- */

/** piutang.list — Daftar piutang pelanggan atas penjualan tempo. */
function aksiPiutangList_(ctx) {
  const p = ctx.payload || {};
  const semuaPiutang = bacaSemua_('Piutang');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const semuaPenjualan = bacaSemua_('Penjualan');

  const pelangganPeta = {};
  semuaPelanggan.forEach(function (pel) { pelangganPeta[pel.id] = pel; });

  const penjualanPeta = {};
  semuaPenjualan.forEach(function (pj) { penjualanPeta[pj.id] = pj; });

  const returByJualPt = {};
  bacaSemua_('Retur').forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui' || !rt.ref_id) return;
    if (!returByJualPt[rt.ref_id]) returByJualPt[rt.ref_id] = { total_retur: 0, no_retur_list: [] };
    returByJualPt[rt.ref_id].total_retur += (Number(rt.total) || 0);
    if (rt.no_retur) returByJualPt[rt.ref_id].no_retur_list.push(rt.no_retur);
  });

  const hariIni = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  let totalPiutangBerjalan = 0;

  let data = semuaPiutang.map(function (pt) {
    const pel = pelangganPeta[pt.pelanggan_id] || {};
    const pj = penjualanPeta[pt.penjualan_id] || {};
    const sisa = Number(pt.sisa) || 0;
    const totTagihan = Number(pt.total) || 0;
    const totNotaPj = Number(pj.total) || totTagihan;
    const infoRet = returByJualPt[pt.penjualan_id] || { total_retur: 0, no_retur_list: [] };
    const retNota = Math.min(totNotaPj, Math.round(infoRet.total_retur || 0));
    const statusRetur = retNota <= 0 ? '' : (totNotaPj > 0 && retNota >= totNotaPj ? 'penuh' : 'sebagian');

    if (pt.status !== 'lunas') {
      totalPiutangBerjalan += sisa;
    }

    const tJatuh = String(pt.jatuh_tempo || '').substring(0, 10);
    const sudahLewat = pt.status !== 'lunas' && tJatuh && tJatuh < hariIni;

    const namaPelanggan = pel.nama || 'Pelanggan Umum';
    const hpPelanggan = pel.hp || '';
    const tglPenjualan = pj.tanggal || pt.created_at;

    return {
      id: pt.id,
      penjualan_id: pt.penjualan_id,
      no_nota: pj.no_nota || '-',
      tanggal_penjualan: tglPenjualan,
      tanggal_nota: tglPenjualan,
      pelanggan_id: pt.pelanggan_id,
      pelanggan_nama: namaPelanggan,
      nama_pelanggan: namaPelanggan,
      pelanggan_kode: pel.kode || '',
      pelanggan_hp: hpPelanggan,
      hp_pelanggan: hpPelanggan,
      total: totTagihan,
      terbayar: Number(pt.terbayar) || 0,
      sisa: sisa,
      total_retur: retNota,
      status_retur: statusRetur,
      daftar_no_retur: infoRet.no_retur_list,
      jatuh_tempo: pt.jatuh_tempo || '',
      lewat_jatuh_tempo: sudahLewat,
      jatuh_tempo_lewat: sudahLewat,
      status: pt.status
    };
  });

  // Filter status
  if (p.status) {
    data = data.filter(function (pt) { return pt.status === p.status; });
  }

  // Filter pelanggan
  if (p.pelanggan_id) {
    data = data.filter(function (pt) { return pt.pelanggan_id === p.pelanggan_id; });
  }

  // Filter lewat jatuh tempo saja (mendukung lewat_jatuh_tempo & jatuh_tempo_lewat)
  if (p.lewat_jatuh_tempo === true || p.jatuh_tempo_lewat === true) {
    data = data.filter(function (pt) { return pt.lewat_jatuh_tempo; });
  }

  // Pencarian q / cari (no_nota, nama pelanggan, no hp)
  const q = String(p.q || p.cari || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pt) {
      return String(pt.no_nota || '').toLowerCase().indexOf(q) !== -1 ||
        String(pt.pelanggan_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(pt.pelanggan_hp || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan: belum lunas di atas, lalu jatuh tempo terdekat
  data.sort(function (a, b) {
    if (a.status !== 'lunas' && b.status === 'lunas') return -1;
    if (a.status === 'lunas' && b.status !== 'lunas') return 1;
    return String(a.jatuh_tempo || '9999').localeCompare(String(b.jatuh_tempo || '9999'));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    total_piutang_berjalan: totalPiutangBerjalan,
    total_sisa_piutang: totalPiutangBerjalan,
    page: page,
    limit: limit
  };
}

/** piutang.detail — Rincian piutang, nota penjualan, dan riwayat cicilan. */
function aksiPiutangDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID piutang wajib diberikan.');

  const piutang = cariById_('Piutang', p.id);
  if (!piutang) gagal_(KODE.NOT_FOUND, 'Data piutang tidak ditemukan.');

  const penjualan = cariById_('Penjualan', piutang.penjualan_id) || {};
  const pelanggan = cariById_('Pelanggan', piutang.pelanggan_id) || {};
  const semuaUsers = bacaSemua_('Users');
  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username || '-'; });

  const semuaBayar = bacaSemua_('Pembayaran');
  const riwayatPembayaran = semuaBayar
    .filter(function (byr) { return byr.tipe === 'piutang' && byr.ref_id === piutang.id && !byr.deleted; })
    .map(function (byr) {
      return Object.assign({}, byr, {
        nama_petugas: byr.nama_petugas || userPeta[byr.created_by] || '-'
      });
    })
    .sort(function (a, b) { return String(b.tanggal || b.created_at || '').localeCompare(String(a.tanggal || a.created_at || '')); });

  const piutangLengkap = Object.assign({}, piutang, {
    no_nota: piutang.no_nota || penjualan.no_nota || '-',
    tanggal_nota: penjualan.tanggal || piutang.created_at
  });

  return {
    piutang: piutangLengkap,
    penjualan: penjualan,
    pelanggan: pelanggan,
    riwayat_pembayaran: riwayatPembayaran
  };
}

/**
 * piutang.bayar — Catat cicilan atau pelunasan piutang pelanggan.
 * Penegakan Aturan Bisnis #7 & #16:
 * Transaksi tempo baru mendapatkan poin loyalitas dan akumulasi total_belanja
 * saat piutang dilunasi (status menjadi 'lunas').
 */
function aksiPiutangBayar_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID piutang wajib diberikan.');

  const piutang = cariById_('Piutang', p.id);
  if (!piutang || piutang.deleted) gagal_(KODE.NOT_FOUND, 'Data piutang tidak ditemukan.');
  if (piutang.status === 'lunas') {
    gagal_(KODE.CONFLICT, 'Piutang ini sudah berstatus lunas.');
  }

  const sisaSebelum = Number(piutang.sisa) || 0;
  const jumlahBayar = V_.rupiah(p.jumlah, 'Jumlah Pembayaran', { wajib: true, min: 1 });

  if (jumlahBayar > sisaSebelum) {
    gagal_(KODE.VALIDATION, 'Jumlah bayar (' + formatRupiah_(jumlahBayar) + ') melebihi sisa piutang (' + formatRupiah_(sisaSebelum) + ').');
  }

  const sisaBaru = Math.max(0, sisaSebelum - jumlahBayar);
  const terbayarBaru = (Number(piutang.terbayar) || 0) + jumlahBayar;
  const statusBaru = sisaBaru === 0 ? 'lunas' : 'sebagian';
  const waktuBayar = sekarang_();
  cekPeriodeTerkunci_(waktuBayar);

  // 1. Perbarui record Piutang
  ubahBaris_('Piutang', [{
    id: piutang.id,
    data: {
      terbayar: terbayarBaru,
      sisa: sisaBaru,
      status: statusBaru
    }
  }], ctx.user.id);

  // 2. Catat ke sheet Pembayaran
  tambahBaris_('Pembayaran', [{
    tipe: 'piutang',
    ref_id: piutang.id,
    jumlah: jumlahBayar,
    metode: p.metode || 'tunai',
    tanggal: waktuBayar,
    catatan: p.catatan || ('Pembayaran piutang nota ' + (piutang.penjualan_id || ''))
  }], ctx.user.id);

  // 3. Update status bayar & total bayar riil di Penjualan asal (anti dobel hitung porsi tempo)
  if (piutang.penjualan_id) {
    const pj = cariById_('Penjualan', piutang.penjualan_id);
    if (pj) {
      const totalNotaPj = Number(pj.total) || 0;
      const dpAwalPj = Math.max(0, totalNotaPj - (Number(piutang.total) || 0));
      const bayarBaru = Math.min(totalNotaPj, Math.round(dpAwalPj + terbayarBaru));
      ubahBaris_('Penjualan', [{
        id: pj.id,
        data: {
          bayar: bayarBaru,
          kembalian: 0,
          status_bayar: statusBaru
        }
      }], ctx.user.id);
    }
  }

  // 4. Aturan Bisnis #7 & #16: Jika lunas dan pelanggan adalah Member, berikan poin dari nilai tempo
  let poinDiberikan = 0;
  let poinSaldoBaru = null;
  let levelMemberBaru = null;
  if (statusBaru === 'lunas' && piutang.pelanggan_id) {
    const pel = cariById_('Pelanggan', piutang.pelanggan_id);
    if (pel && String(pel.tipe || '').toLowerCase() === 'member') {
      const pengaturan = ambilPengaturan_();
      const nominalPerPoin = Number(pengaturan.poin_per_rupiah) || 0;
      const pjAsalPoin = piutang.penjualan_id ? cariById_('Penjualan', piutang.penjualan_id) : null;
      const ongkirNota = pjAsalPoin ? Math.max(0, Number(pjAsalPoin.ongkir || 0)) : 0;
      const totalNota = pjAsalPoin ? Math.max(0, Number(pjAsalPoin.total || 0)) : Number(piutang.total || 0);
      const totalBarangNota = Math.max(0, totalNota - ongkirNota);
      // Porsi barang yang sudah mendapat poin di awal (DP saat checkout) tidak dihitung ulang
      const bayarLunasAwal = Math.max(0, totalNota - Number(piutang.total || 0));
      const porsiBarangAwal = Math.min(totalBarangNota, bayarLunasAwal);
      const sisaBarangBelumPoin = Math.max(0, totalBarangNota - porsiBarangAwal);
      const nominalLunasEfektif = Math.min(terbayarBaru, sisaBarangBelumPoin);
      if (nominalPerPoin > 0 && nominalLunasEfektif > 0) {
        const pengali = hitungPengaliPoin_(pel.level, pengaturan);
        poinDiberikan = Math.floor((nominalLunasEfektif / nominalPerPoin) * pengali);
      }

      const totalBelanjaLama = Number(pel.total_belanja || 0);
      const totalBelanjaBaru = totalBelanjaLama + nominalLunasEfektif;
      const poinLama = Number(pel.poin || 0);
      const poinBaru = poinLama + poinDiberikan;
      const levelBaru = evaluasiLevelMember_(pel.level, totalBelanjaBaru, pengaturan);
      poinSaldoBaru = poinBaru;
      levelMemberBaru = levelBaru;

      ubahBaris_('Pelanggan', [{
        id: pel.id,
        data: {
          poin: poinBaru,
          total_belanja: totalBelanjaBaru,
          level: levelBaru
        }
      }], ctx.user.id);

      // Sinkronkan juga poin_didapat pada nota Penjualan asal agar riwayat & void akurat
      if (piutang.penjualan_id && poinDiberikan > 0) {
        const pjAsal = cariById_('Penjualan', piutang.penjualan_id);
        if (pjAsal) {
          ubahBaris_('Penjualan', [{
            id: pjAsal.id,
            data: {
              poin_didapat: (Number(pjAsal.poin_didapat) || 0) + poinDiberikan
            }
          }], ctx.user.id);
        }
      }

      if (poinDiberikan > 0) {
        tambahBaris_('Poin_Log', [{
          pelanggan_id: pel.id,
          jumlah: poinDiberikan,
          jenis: 'dapat',
          ref_id: piutang.id,
          saldo: poinBaru
        }], ctx.user.id);
      }
    }
  }

  // 5. Catat Log Audit
  catatAudit_(ctx.user.id, 'piutang_bayar', 'KEUANGAN', piutang.id, {
    jumlah: jumlahBayar,
    sisa: sisaBaru,
    status: statusBaru,
    poin_diberikan: poinDiberikan
  });

  return {
    pesan: 'Pembayaran ' + formatRupiah_(jumlahBayar) + ' berhasil dicatat. Status: ' + statusBaru + '.',
    sisa: sisaBaru,
    status: statusBaru,
    poin_didapat: poinDiberikan,
    poin_saldo: poinSaldoBaru,
    level_baru: levelMemberBaru
  };
}

/** hutang.list — Daftar hutang ke supplier atas pembelian tempo (Owner & Admin). */
function aksiHutangList_(ctx) {
  const p = ctx.payload || {};
  const semuaHutang = bacaSemua_('Hutang');
  const semuaSupplier = bacaSemua_('Supplier');
  const semuaPembelian = bacaSemua_('Pembelian');

  const supplierPeta = {};
  semuaSupplier.forEach(function (s) { supplierPeta[s.id] = s; });

  const pembelianPeta = {};
  semuaPembelian.forEach(function (pb) { pembelianPeta[pb.id] = pb; });

  const hariIni = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
  let totalHutangBerjalan = 0;

  let data = semuaHutang.map(function (ht) {
    const sup = supplierPeta[ht.supplier_id] || {};
    const pb = pembelianPeta[ht.pembelian_id] || {};
    const sisa = Number(ht.sisa) || 0;

    if (ht.status !== 'lunas') {
      totalHutangBerjalan += sisa;
    }

    const tJatuh = String(ht.jatuh_tempo || '').substring(0, 10);
    const sudahLewat = ht.status !== 'lunas' && tJatuh && tJatuh < hariIni;

    const namaSupplier = sup.nama || 'Supplier Umum';
    const hpSupplier = sup.hp || sup.kontak || '';
    const tglPembelian = pb.tanggal || ht.created_at;

    return {
      id: ht.id,
      pembelian_id: ht.pembelian_id,
      no_faktur: pb.no_faktur || '-',
      no_faktur_supplier: pb.no_faktur_supplier || '',
      tanggal_pembelian: tglPembelian,
      tanggal_faktur: tglPembelian,
      supplier_id: ht.supplier_id,
      supplier_nama: namaSupplier,
      nama_supplier: namaSupplier,
      supplier_hp: hpSupplier,
      hp_supplier: hpSupplier,
      total: Number(ht.total) || 0,
      terbayar: Number(ht.terbayar) || 0,
      sisa: sisa,
      jatuh_tempo: ht.jatuh_tempo || '',
      lewat_jatuh_tempo: sudahLewat,
      jatuh_tempo_lewat: sudahLewat,
      status: ht.status
    };
  });

  if (p.status) {
    data = data.filter(function (ht) { return ht.status === p.status; });
  }

  if (p.supplier_id) {
    data = data.filter(function (ht) { return ht.supplier_id === p.supplier_id; });
  }

  if (p.lewat_jatuh_tempo === true || p.jatuh_tempo_lewat === true) {
    data = data.filter(function (ht) { return ht.lewat_jatuh_tempo; });
  }

  const q = String(p.q || p.cari || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (ht) {
      return String(ht.no_faktur || '').toLowerCase().indexOf(q) !== -1 ||
        String(ht.no_faktur_supplier || '').toLowerCase().indexOf(q) !== -1 ||
        String(ht.supplier_nama || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) {
    if (a.status !== 'lunas' && b.status === 'lunas') return -1;
    if (a.status === 'lunas' && b.status !== 'lunas') return 1;
    return String(a.jatuh_tempo || '9999').localeCompare(String(b.jatuh_tempo || '9999'));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    total_hutang_berjalan: totalHutangBerjalan,
    total_sisa_hutang: totalHutangBerjalan,
    page: page,
    limit: limit
  };
}

/** hutang.detail — Rincian hutang ke supplier dan riwayat pembayaran cicilan. */
function aksiHutangDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hutang wajib diberikan.');

  const hutang = cariById_('Hutang', p.id);
  if (!hutang) gagal_(KODE.NOT_FOUND, 'Data hutang tidak ditemukan.');

  const pembelian = cariById_('Pembelian', hutang.pembelian_id) || {};
  const supplier = cariById_('Supplier', hutang.supplier_id) || {};
  const semuaUsers = bacaSemua_('Users');
  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username || '-'; });

  const semuaBayar = bacaSemua_('Pembayaran');
  const riwayatPembayaran = semuaBayar
    .filter(function (byr) { return byr.tipe === 'hutang' && byr.ref_id === hutang.id && !byr.deleted; })
    .map(function (byr) {
      return Object.assign({}, byr, {
        nama_petugas: byr.nama_petugas || userPeta[byr.created_by] || '-'
      });
    })
    .sort(function (a, b) { return String(b.tanggal || b.created_at || '').localeCompare(String(a.tanggal || a.created_at || '')); });

  const hutangLengkap = Object.assign({}, hutang, {
    no_faktur: hutang.no_faktur || pembelian.no_faktur || '-',
    no_faktur_supplier: pembelian.no_faktur_supplier || '',
    tanggal_faktur: pembelian.tanggal || hutang.created_at
  });

  return {
    hutang: hutangLengkap,
    pembelian: pembelian,
    supplier: supplier,
    riwayat_pembayaran: riwayatPembayaran
  };
}

/** hutang.bayar — Catat cicilan atau pelunasan hutang ke supplier (Owner & Admin). */
function aksiHutangBayar_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID hutang wajib diberikan.');

  const hutang = cariById_('Hutang', p.id);
  if (!hutang || hutang.deleted) gagal_(KODE.NOT_FOUND, 'Data hutang tidak ditemukan.');
  if (hutang.status === 'lunas') {
    gagal_(KODE.CONFLICT, 'Hutang ini sudah berstatus lunas.');
  }

  const sisaSebelum = Number(hutang.sisa) || 0;
  const jumlahBayar = V_.rupiah(p.jumlah, 'Jumlah Pembayaran', { wajib: true, min: 1 });

  if (jumlahBayar > sisaSebelum) {
    gagal_(KODE.VALIDATION, 'Jumlah bayar (' + formatRupiah_(jumlahBayar) + ') melebihi sisa hutang (' + formatRupiah_(sisaSebelum) + ').');
  }

  const sisaBaru = Math.max(0, sisaSebelum - jumlahBayar);
  const terbayarBaru = (Number(hutang.terbayar) || 0) + jumlahBayar;
  const statusBaru = sisaBaru === 0 ? 'lunas' : 'sebagian';
  const waktuBayar = sekarang_();
  cekPeriodeTerkunci_(waktuBayar);

  // 1. Update record Hutang
  ubahBaris_('Hutang', [{
    id: hutang.id,
    data: {
      terbayar: terbayarBaru,
      sisa: sisaBaru,
      status: statusBaru
    }
  }], ctx.user.id);

  // 2. Tambah record Pembayaran
  tambahBaris_('Pembayaran', [{
    tipe: 'hutang',
    ref_id: hutang.id,
    jumlah: jumlahBayar,
    metode: p.metode || 'tunai',
    tanggal: waktuBayar,
    catatan: p.catatan || ('Pembayaran hutang faktur ' + (hutang.pembelian_id || ''))
  }], ctx.user.id);

  // 3. Update status bayar di Pembelian asal
  if (hutang.pembelian_id) {
    const pb = cariById_('Pembelian', hutang.pembelian_id);
    if (pb) {
      const bayarBaru = (Number(pb.bayar) || 0) + jumlahBayar;
      ubahBaris_('Pembelian', [{
        id: pb.id,
        data: {
          bayar: bayarBaru,
          status_bayar: statusBaru
        }
      }], ctx.user.id);
    }
  }

  // 4. Catat Log Audit
  catatAudit_(ctx.user.id, 'hutang_bayar', 'KEUANGAN', hutang.id, {
    jumlah: jumlahBayar,
    sisa: sisaBaru,
    status: statusBaru
  });

  return {
    pesan: 'Pembayaran hutang ' + formatRupiah_(jumlahBayar) + ' berhasil dicatat. Status: ' + statusBaru + '.',
    sisa: sisaBaru,
    status: statusBaru
  };
}

/** retur.list — Daftar dokumen retur penjualan & pembelian. */
function aksiReturList_(ctx) {
  const p = ctx.payload || {};
  const semuaRetur = bacaSemua_('Retur');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const semuaSupplier = bacaSemua_('Supplier');
  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaPembelian = bacaSemua_('Pembelian');
  const semuaUsers = bacaSemua_('Users');

  const pihakPeta = {};
  semuaPelanggan.forEach(function (pel) { pihakPeta[pel.id] = pel.nama; });
  semuaSupplier.forEach(function (sup) { pihakPeta[sup.id] = sup.nama; });

  const refNotaPeta = {};
  semuaPenjualan.forEach(function (pj) { refNotaPeta[pj.id] = pj.no_nota; });
  semuaPembelian.forEach(function (pb) { refNotaPeta[pb.id] = pb.no_faktur; });

  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username || '-'; });

  let data = semuaRetur.map(function (rt) {
    const noRef = refNotaPeta[rt.ref_id] || rt.ref_id || '-';
    const namaPihak = pihakPeta[rt.pihak_id] || (rt.tipe === 'jual' ? 'Pelanggan Umum' : 'Supplier Umum');
    const tglRetur = rt.tanggal || rt.created_at;
    const namaPembuat = userPeta[rt.created_by] || '-';

    return {
      id: rt.id,
      no_retur: rt.no_retur,
      tipe: rt.tipe,
      ref_id: rt.ref_id,
      no_referensi_asal: noRef,
      no_transaksi_asal: noRef,
      pihak_id: rt.pihak_id,
      pihak_nama: namaPihak,
      nama_pihak: namaPihak,
      tanggal: tglRetur,
      dibuat_at: tglRetur,
      nama_pembuat: namaPembuat,
      total: Number(rt.total) || 0,
      metode_refund: rt.metode_refund,
      alasan: rt.alasan,
      status: rt.status,
      disetujui_oleh: rt.disetujui_oleh,
      disetujui_at: rt.disetujui_at
    };
  });

  if (ctx.user && ctx.user.role === ROLE.KASIR) {
    data = data.filter(function (rt) { return rt.tipe === 'jual'; });
  }

  if (p.tipe) {
    data = data.filter(function (rt) { return rt.tipe === p.tipe; });
  }

  if (p.status) {
    data = data.filter(function (rt) { return rt.status === p.status; });
  }

  const q = String(p.q || p.cari || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (rt) {
      return String(rt.no_retur || '').toLowerCase().indexOf(q) !== -1 ||
        String(rt.no_referensi_asal || '').toLowerCase().indexOf(q) !== -1 ||
        String(rt.pihak_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(rt.alasan || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  data.sort(function (a, b) {
    return String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: data.slice(mulai, mulai + limit),
    total: data.length,
    page: page,
    limit: limit
  };
}

/** retur.detail — Rincian dokumen retur, item yang diretur, dan referensi transaksi. */
function aksiReturDetail_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID retur wajib diberikan.');

  const retur = cariById_('Retur', p.id);
  if (!retur) gagal_(KODE.NOT_FOUND, 'Data retur tidak ditemukan.');

  const isKasir = ctx.user && ctx.user.role === ROLE.KASIR;
  if (isKasir && retur.tipe === 'beli') {
    gagal_(KODE.FORBIDDEN, 'Retur pembelian ke supplier hanya dapat diakses oleh Owner atau Admin.');
  }

  const semuaProduk = bacaSemua_('Produk');
  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr.nama; });

  const semuaItems = bacaSemua_('Retur_Item');
  const items = semuaItems
    .filter(function (it) { return it.retur_id === retur.id && !it.deleted; })
    .map(function (it) {
      const namaBarang = it.nama || it.nama_produk || produkPeta[it.produk_id] || 'Produk';
      const sub = Number(it.subtotal || it.total || (Number(it.qty) * Number(it.harga))) || 0;
      const itemOut = Object.assign({}, it, {
        nama: namaBarang,
        nama_produk: namaBarang,
        subtotal: sub,
        total: sub
      });
      if (isKasir) delete itemOut.hpp;
      return itemOut;
    });

  let pihak = null;
  let transaksiAsal = null;

  if (retur.tipe === 'jual') {
    pihak = cariById_('Pelanggan', retur.pihak_id) || { nama: 'Pelanggan Umum' };
    transaksiAsal = cariById_('Penjualan', retur.ref_id);
  } else {
    pihak = cariById_('Supplier', retur.pihak_id) || { nama: 'Supplier Umum' };
    transaksiAsal = cariById_('Pembelian', retur.ref_id);
  }

  return {
    retur: retur,
    items: items,
    pihak: pihak,
    transaksi_asal: transaksiAsal
  };
}

/**
 * retur.create — Membuat retur penjualan atau retur pembelian.
 * Aturan Bisnis #4, #7, #12, #16:
 * - Kasir: status 'diajukan'.
 * - Owner / Admin: status 'disetujui' (langsung menerapkan efek stok, HPP, kas/piutang/hutang, dan poin).
 */
function aksiReturCreate_(ctx) {
  const p = ctx.payload || {};
  const tipe = String(p.tipe || '').trim().toLowerCase();
  if (tipe !== 'jual' && tipe !== 'beli') {
    gagal_(KODE.VALIDATION, 'Tipe retur harus "jual" atau "beli".');
  }
  if (tipe === 'beli' && ctx.user.role === ROLE.KASIR) {
    gagal_(KODE.FORBIDDEN, 'Retur pembelian ke supplier hanya dapat dibuat oleh Owner atau Admin.');
  }

  const refId = String(p.ref_id || '').trim();
  if (!refId) gagal_(KODE.VALIDATION, 'ID transaksi asal (ref_id) wajib diberikan.');

  const alasan = V_.teks(p.alasan, 'Alasan Retur', { wajib: true, maks: 300 });
  const metodeRefund = String(p.metode_refund || 'kas').trim();
  const rawItems = p.items;

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Daftar barang yang diretur tidak boleh kosong.');
  }

  let pihakId = '';
  let transaksiAsal = null;

  if (tipe === 'jual') {
    transaksiAsal = cariById_('Penjualan', refId);
    if (!transaksiAsal || transaksiAsal.deleted) {
      gagal_(KODE.NOT_FOUND, 'Transaksi penjualan asal tidak ditemukan.');
    }
    if (transaksiAsal.status !== 'final') {
      gagal_(KODE.CONFLICT, 'Hanya penjualan berstatus "final" yang dapat diretur.');
    }
    pihakId = transaksiAsal.pelanggan_id || '';
    if (metodeRefund === 'deposit' && !pihakId) {
      gagal_(KODE.VALIDATION, 'Pengembalian ke Saldo Titipan (Deposit) hanya berlaku untuk transaksi pelanggan terdaftar.');
    }
  } else {
    if (metodeRefund === 'deposit') {
      gagal_(KODE.VALIDATION, 'Metode refund Saldo Titipan tidak berlaku untuk retur pembelian.');
    }
    transaksiAsal = cariById_('Pembelian', refId);
    if (!transaksiAsal || transaksiAsal.deleted) {
      gagal_(KODE.NOT_FOUND, 'Faktur pembelian asal tidak ditemukan.');
    }
    if (transaksiAsal.status === 'batal') {
      gagal_(KODE.CONFLICT, 'Faktur pembelian yang sudah dibatalkan tidak dapat diretur.');
    }
    pihakId = transaksiAsal.supplier_id || '';
  }

  // Validasi batas qty retur terhadap item pada transaksi asal & riwayat retur aktif sebelumnya
  const itemAsalList = (tipe === 'jual' ? bacaSemua_('Penjualan_Item') : bacaSemua_('Pembelian_Item')).filter(function (it) {
    const parentField = tipe === 'jual' ? it.penjualan_id : it.pembelian_id;
    return !it.deleted && parentField === refId;
  });

  const qtyAsalById = {};
  const qtyAsalByProd = {};
  itemAsalList.forEach(function (it) {
    const qd = Number(it.qty_dasar) || (Number(it.qty || 0) * Math.max(1, Number(it.faktor) || 1));
    if (it.id) qtyAsalById[it.id] = (qtyAsalById[it.id] || 0) + qd;
    const pk = String(it.produk_id || '') + '::' + String(it.varian_id || '');
    qtyAsalByProd[pk] = (qtyAsalByProd[pk] || 0) + qd;
  });

  const returAktifIds = {};
  bacaSemua_('Retur').forEach(function (r) {
    if (!r.deleted && r.tipe === tipe && r.ref_id === refId && r.status !== 'ditolak') {
      returAktifIds[r.id] = true;
    }
  });

  const qtySudahReturById = {};
  const qtySudahReturByProd = {};
  bacaSemua_('Retur_Item').forEach(function (ri) {
    if (ri.deleted || !returAktifIds[ri.retur_id]) return;
    const qd = Number(ri.qty_dasar) || (Number(ri.qty || 0) * Math.max(1, Number(ri.faktor) || 1));
    if (ri.ref_item_id) qtySudahReturById[ri.ref_item_id] = (qtySudahReturById[ri.ref_item_id] || 0) + qd;
    const pk = String(ri.produk_id || '') + '::' + String(ri.varian_id || '');
    qtySudahReturByProd[pk] = (qtySudahReturByProd[pk] || 0) + qd;
  });

  const qtyReqById = {};
  const qtyReqByProd = {};

  const isOwnerAdmin = ctx.user.role === ROLE.OWNER || ctx.user.role === ROLE.ADMIN;
  const statusAwal = isOwnerAdmin ? 'disetujui' : 'diajukan';
  const waktuSekarang = sekarang_();
  cekPeriodeTerkunci_(waktuSekarang);
  const pengaturanRetur = ambilPengaturan_();
  const kebutuhanStokReturBeli = {};
  const noRetur = nomorBerikut_('RT');

  let totalRetur = 0;
  const itemsValid = [];

  // Agregasi nilai & HPP item nota asal agar harga/HPP retur penjualan dihitung SERVER-SIDE
  // (tidak mempercayai input klien yang dapat dimanipulasi untuk menggelembungkan refund/HPP).
  const asalAgg = {};
  let rasioNetNotaJual = 1;
  if (tipe === 'jual' && itemAsalList.length > 0) {
    let sumSubAsal = 0;
    itemAsalList.forEach(function (ai) {
      const pkA = String(ai.produk_id || '') + '::' + String(ai.varian_id || '');
      const qdA = Number(ai.qty_dasar) || (Number(ai.qty || 0) * Math.max(1, Number(ai.faktor) || 1));
      if (!asalAgg[pkA]) asalAgg[pkA] = { sub: 0, qd: 0, hppTotal: 0 };
      asalAgg[pkA].sub += Number(ai.subtotal) || 0;
      asalAgg[pkA].qd += qdA;
      asalAgg[pkA].hppTotal += hitungTotalHppItem_(ai);
      sumSubAsal += Number(ai.subtotal) || 0;
    });
    const barangNetAsal = Math.max(0, Number(transaksiAsal.total || 0) - Math.max(0, Number(transaksiAsal.ongkir || 0)));
    if (sumSubAsal > 0 && barangNetAsal < sumSubAsal) rasioNetNotaJual = barangNetAsal / sumSubAsal;
  }

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const qty = V_.qty(it.qty, 'Qty Retur Item ' + (i + 1));
    const faktor = Math.max(1, Number(it.faktor) || 1);
    const qtyDasar = Math.round(qty * faktor * 1000) / 1000;
    let harga = V_.rupiah(it.harga, 'Harga Item ' + (i + 1), { wajib: true, min: 0 });
    let hpp = Number(it.hpp) || 0;
    if (tipe === 'jual') {
      const aggItem = asalAgg[String(it.produk_id || '') + '::' + String(it.varian_id || '')];
      if (aggItem && aggItem.qd > 0) {
        harga = Math.round((aggItem.sub / aggItem.qd) * rasioNetNotaJual * faktor);
        hpp = Math.round((aggItem.hppTotal / aggItem.qd) * faktor);
      }
    }
    const itemSubtotal = Math.round(qty * harga);

    // Cek batas qty terhadap nota/faktur asal (jika item asal tersedia)
    if (itemAsalList.length > 0) {
      const refItemId = it.ref_item_id || '';
      const pk = String(it.produk_id || '') + '::' + String(it.varian_id || '');
      const pakaiId = Boolean(refItemId && qtyAsalById[refItemId] !== undefined);
      const maksAsal = pakaiId ? (qtyAsalById[refItemId] || 0) : (qtyAsalByProd[pk] || 0);
      const sudahRetur = pakaiId ? (qtySudahReturById[refItemId] || 0) : (qtySudahReturByProd[pk] || 0);
      const reqAkumulasi = (pakaiId ? (qtyReqById[refItemId] || 0) : (qtyReqByProd[pk] || 0)) + qtyDasar;

      if (maksAsal <= 0) {
        gagal_(KODE.VALIDATION, 'Barang "' + (it.nama || it.nama_produk || ('Item ' + (i + 1))) + '" tidak ditemukan pada transaksi asal.');
      }
      const sisaBoleh = Math.max(0, Math.round((maksAsal - sudahRetur) * 1000) / 1000);
      if (reqAkumulasi > sisaBoleh + 0.0001) {
        gagal_(KODE.VALIDATION, 'Qty retur "' + (it.nama || it.nama_produk || ('Item ' + (i + 1))) + '" melebihi sisa qty transaksi asal (tersisa ' + sisaBoleh + ' satuan dasar).');
      }
      if (pakaiId) qtyReqById[refItemId] = reqAkumulasi;
      else qtyReqByProd[pk] = reqAkumulasi;
    }

    totalRetur += itemSubtotal;

    // Untuk retur pembelian ke supplier, pastikan stok gudang mencukupi secara akumulatif (kecuali stok_minus aktif)
    if (tipe === 'beli' && !pengaturanRetur.stok_minus) {
      const kStok = String(it.produk_id || '') + '::' + String(it.varian_id || '');
      const butuhStok = bulatQty_((kebutuhanStokReturBeli[kStok] || 0) + qtyDasar);
      kebutuhanStokReturBeli[kStok] = butuhStok;
      const objStok = it.varian_id ? cariById_('Varian', it.varian_id) : cariById_('Produk', it.produk_id);
      const stokAda = objStok ? Number(objStok.stok || 0) : 0;
      if (stokAda < butuhStok) {
        gagal_(KODE.STOK_KURANG, 'Stok gudang "' + (it.nama || it.nama_produk || 'Barang') + '" tidak mencukupi untuk retur ke supplier (sisa: ' + stokAda + ', diminta retur: ' + butuhStok + ').');
      }
    }

    itemsValid.push({
      ref_item_id: it.ref_item_id || '',
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      nama: it.nama || it.nama_produk || '',
      satuan: it.satuan || '',
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      harga: harga,
      hpp: hpp,
      subtotal: itemSubtotal
    });
  }

  // Batasi nominal retur penjualan: tidak melebihi sisa nilai barang bersih nota asal (setelah diskon),
  // dan bila seluruh sisa qty barang diretur, nominal dipaskan tepat ke sisa nilai agar status "Diretur Penuh" presisi.
  if (tipe === 'jual' && transaksiAsal && Number(transaksiAsal.total || 0) > 0 && itemsValid.length > 0) {
    const ongkirNotaR = Math.max(0, Number(transaksiAsal.ongkir || 0));
    const barangNetR = Math.max(0, Number(transaksiAsal.total || 0) - ongkirNotaR);
    const sudahReturNominal = bacaSemua_('Retur').reduce(function (acc, r) {
      return (!r.deleted && r.tipe === 'jual' && r.ref_id === refId && r.status !== 'ditolak')
        ? acc + (Number(r.total) || 0) : acc;
    }, 0);
    const sisaBarangR = Math.max(0, Math.round(barangNetR - sudahReturNominal));

    const reqThis = {};
    itemsValid.forEach(function (iv) {
      const k = String(iv.produk_id || '') + '::' + String(iv.varian_id || '');
      reqThis[k] = (reqThis[k] || 0) + iv.qty_dasar;
    });
    let habisSemua = itemAsalList.length > 0;
    Object.keys(qtyAsalByProd).forEach(function (k) {
      const sisaQ = (qtyAsalByProd[k] || 0) - (qtySudahReturByProd[k] || 0);
      if ((reqThis[k] || 0) < sisaQ - 0.0001) habisSemua = false;
    });

    let targetTotal = Math.min(totalRetur, sisaBarangR);
    if (habisSemua) targetTotal = sisaBarangR;

    if (targetTotal !== totalRetur) {
      const sumSubIv = itemsValid.reduce(function (s, iv) { return s + iv.subtotal; }, 0);
      if (sumSubIv > 0) {
        const rasioSkala = targetTotal / sumSubIv;
        let akum = 0;
        itemsValid.forEach(function (iv, idx) {
          let sb = idx === itemsValid.length - 1 ? (targetTotal - akum) : Math.round(iv.subtotal * rasioSkala);
          sb = Math.max(0, sb);
          akum += sb;
          iv.subtotal = sb;
          iv.harga = iv.qty > 0 ? Math.round(sb / iv.qty) : iv.harga;
        });
      }
      totalRetur = targetTotal;
    }
  }

  // Simpan Dokumen Retur
  const resRetur = tambahBaris_('Retur', [{
    no_retur: noRetur,
    tipe: tipe,
    ref_id: refId,
    pihak_id: pihakId,
    tanggal: waktuSekarang,
    total: totalRetur,
    metode_refund: metodeRefund,
    alasan: alasan,
    status: statusAwal,
    disetujui_oleh: isOwnerAdmin ? ctx.user.id : '',
    disetujui_at: isOwnerAdmin ? waktuSekarang : '',
    lokasi: p.lokasi ? normalisasiLokasi_(p.lokasi, 'toko') : ''
  }], ctx.user.id);

  const returBaru = resRetur[0];

  // Simpan Item Retur
  const rowsReturItem = itemsValid.map(function (it) {
    return Object.assign({ retur_id: returBaru.id }, it);
  });
  tambahBaris_('Retur_Item', rowsReturItem, ctx.user.id);

  // Jika langsung disetujui, terapkan efeknya seketika
  if (statusAwal === 'disetujui') {
    terapkanEfekRetur_(returBaru, itemsValid, transaksiAsal, ctx);
  } else {
    catatAudit_(ctx.user.id, 'retur_ajukan', 'RETUR', noRetur, {
      tipe: tipe,
      total: totalRetur,
      alasan: alasan
    });
  }

  return {
    pesan: statusAwal === 'disetujui'
      ? 'Dokumen retur ' + noRetur + ' berhasil disetujui dan diterapkan.'
      : 'Permohonan retur ' + noRetur + ' berhasil diajukan dan menunggu persetujuan Owner/Admin.',
    no_retur: noRetur,
    status: statusAwal
  };
}

/** retur.approve — Menyetujui permohonan retur yang diajukan kasir (Owner & Admin). */
function aksiReturApprove_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID retur wajib diberikan.');

  const retur = cariById_('Retur', p.id);
  if (!retur || retur.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen retur tidak ditemukan.');
  if (retur.status !== 'diajukan') {
    gagal_(KODE.CONFLICT, 'Hanya retur berstatus "diajukan" yang dapat disetujui.');
  }

  const items = bacaSemua_('Retur_Item').filter(function (it) { return it.retur_id === retur.id && !it.deleted; });
  let transaksiAsal = null;
  if (retur.tipe === 'jual') {
    transaksiAsal = cariById_('Penjualan', retur.ref_id);
  } else {
    transaksiAsal = cariById_('Pembelian', retur.ref_id);
  }

  const waktuSetuju = sekarang_();
  cekPeriodeTerkunci_(waktuSetuju);
  ubahBaris_('Retur', [{
    id: retur.id,
    data: {
      status: 'disetujui',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktuSetuju
    }
  }], ctx.user.id);

  retur.status = 'disetujui';
  retur.disetujui_oleh = ctx.user.id;
  retur.disetujui_at = waktuSetuju;

  terapkanEfekRetur_(retur, items, transaksiAsal, ctx);

  return {
    pesan: 'Dokumen retur ' + retur.no_retur + ' berhasil disetujui dan efek stok/finansial telah diterapkan.',
    no_retur: retur.no_retur
  };
}

/** retur.reject — Menolak permohonan retur (Owner & Admin). */
function aksiReturReject_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID retur wajib diberikan.');

  const retur = cariById_('Retur', p.id);
  if (!retur || retur.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen retur tidak ditemukan.');
  if (retur.status !== 'diajukan') {
    gagal_(KODE.CONFLICT, 'Hanya retur berstatus "diajukan" yang dapat ditolak.');
  }

  const waktuTolak = sekarang_();
  const alasanTolak = V_.teks(p.alasan_tolak, 'Alasan Penolakan', { maks: 300 }) || 'Ditolak oleh ' + ctx.user.username;

  ubahBaris_('Retur', [{
    id: retur.id,
    data: {
      status: 'ditolak',
      alasan: retur.alasan + ' [Ditolak: ' + alasanTolak + ']',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktuTolak
    }
  }], ctx.user.id);

  catatAudit_(ctx.user.id, 'retur_reject', 'RETUR', retur.no_retur, { alasan_tolak: alasanTolak });

  return {
    pesan: 'Permohonan retur ' + retur.no_retur + ' telah ditolak.',
    no_retur: retur.no_retur
  };
}

/**
 * Helper internal untuk menerapkan seluruh efek atomik persetujuan retur:
 * - Stok & Moving Average HPP (Aturan Bisnis #12 & #10)
 * - Kartu Stok (Aturan Bisnis #5)
 * - Poin Loyalitas & Total Belanja Member (Aturan Bisnis #7 & #16)
 * - Potong Piutang / Hutang / Kas Refund
 */
function terapkanEfekRetur_(retur, items, transaksiAsal, ctx) {
  const tipe = retur.tipe;
  const pengaturan = ambilPengaturan_();
  const updateProdukMap = {};
  const updateVarianMap = {};
  const rowsKartuStok = [];

  const produkStateMap = {};
  bacaSemua_('Produk').forEach(function (pr) { produkStateMap[pr.id] = pr; });
  const semuaVarianRetur = bacaSemua_('Varian');
  const varianStateMap = {};
  semuaVarianRetur.forEach(function (v) { varianStateMap[v.id] = v; });

  // Validasi kecukupan stok untuk retur pembelian sebelum menulis ke database
  if (tipe === 'beli' && !pengaturan.stok_minus) {
    const butuhBeliMap = {};
    items.forEach(function (it) {
      const qd = Number(it.qty_dasar) || 0;
      const k = String(it.produk_id || '') + '::' + String(it.varian_id || '');
      butuhBeliMap[k] = bulatQty_((butuhBeliMap[k] || 0) + qd);
      const refObj = it.varian_id ? varianStateMap[it.varian_id] : produkStateMap[it.produk_id];
      const stokAda = refObj ? Number(refObj.stok || 0) : 0;
      if (stokAda < butuhBeliMap[k]) {
        gagal_(KODE.STOK_KURANG, 'Stok gudang "' + (it.nama || 'Barang') + '" tidak mencukupi untuk menyetujui retur pembelian (sisa: ' + stokAda + ', diminta: ' + butuhBeliMap[k] + ').');
      }
    });
  }

  items.forEach(function (it) {
    const qtyDasar = Number(it.qty_dasar) || 0;
    const hppDasarSnapshot = hitungHppDasarItem_(it);
    const lokExplicit = retur.lokasi ? normalisasiLokasi_(retur.lokasi, 'toko') : '';

    if (tipe === 'jual') {
      const lokJual = lokExplicit || 'toko';
      // 1. RETUR JUAL: Kembalikan stok ke lokasi tujuan & hitung ulang HPP memakai HPP dasar snapshot item asal
      if (it.varian_id) {
        const v = varianStateMap[it.varian_id];
        const p = produkStateMap[it.produk_id];
        if (!v || !p) return;
        const lv = bacaStokLokasi_(v);
        const hppLamaV = Number(v.hpp || 0);
        const hppBaruV = hitungHppBaru_(lv.stok, hppLamaV, qtyDasar, hppDasarSnapshot);
        const stTV = lokJual === 'toko' ? bulatQty_(lv.stok_toko + qtyDasar) : lv.stok_toko;
        const stGV = lokJual === 'gudang' ? bulatQty_(lv.stok_gudang + qtyDasar) : lv.stok_gudang;
        const stokBaruV = bulatQty_(stTV + stGV);

        v.stok_toko = stTV;
        v.stok_gudang = stGV;
        v.stok = stokBaruV;
        v.hpp = hppBaruV;
        updateVarianMap[v.id] = { stok: stokBaruV, stok_toko: stTV, stok_gudang: stGV, hpp: hppBaruV };

        const lp = bacaStokLokasi_(p);
        const stTP = lokJual === 'toko' ? bulatQty_(lp.stok_toko + qtyDasar) : lp.stok_toko;
        const stGP = lokJual === 'gudang' ? bulatQty_(lp.stok_gudang + qtyDasar) : lp.stok_gudang;
        const stokBaruP = bulatQty_(stTP + stGP);
        p.stok_toko = stTP;
        p.stok_gudang = stGP;
        p.stok = stokBaruP;
        updateProdukMap[p.id] = { stok: stokBaruP, stok_toko: stTP, stok_gudang: stGP };

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: it.varian_id,
          tipe: 'retur_jual',
          lokasi: lokJual,
          qty: qtyDasar,
          saldo: stokBaruV,
          saldo_toko: stTV,
          saldo_gudang: stGV,
          hpp: hppBaruV,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur penjualan ' + retur.no_retur + ': ' + retur.alasan
        });
      } else {
        const p = produkStateMap[it.produk_id];
        if (!p) return;
        const lp = bacaStokLokasi_(p);
        const hppLama = Number(p.hpp || 0);
        const hppBaru = hitungHppBaru_(lp.stok, hppLama, qtyDasar, hppDasarSnapshot);
        const stTP = lokJual === 'toko' ? bulatQty_(lp.stok_toko + qtyDasar) : lp.stok_toko;
        const stGP = lokJual === 'gudang' ? bulatQty_(lp.stok_gudang + qtyDasar) : lp.stok_gudang;
        const stokBaru = bulatQty_(stTP + stGP);

        p.stok_toko = stTP;
        p.stok_gudang = stGP;
        p.stok = stokBaru;
        p.hpp = hppBaru;
        updateProdukMap[p.id] = { stok: stokBaru, stok_toko: stTP, stok_gudang: stGP, hpp: hppBaru };

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: '',
          tipe: 'retur_jual',
          lokasi: lokJual,
          qty: qtyDasar,
          saldo: stokBaru,
          saldo_toko: stTP,
          saldo_gudang: stGP,
          hpp: hppBaru,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur penjualan ' + retur.no_retur + ': ' + retur.alasan
        });
      }
    } else {
      // 2. RETUR BELI: Kurangi stok pada HPP berjalan (Aturan Bisnis #12: HPP tidak berubah)
      if (it.varian_id) {
        const v = varianStateMap[it.varian_id];
        const p = produkStateMap[it.produk_id];
        if (!v || !p) return;
        const lv = bacaStokLokasi_(v);
        const hppV = Number(v.hpp || 0);
        const lokBeli = lokExplicit || (lv.stok_gudang >= qtyDasar ? 'gudang' : 'toko');
        let ambilG = lokBeli === 'gudang' ? Math.min(lv.stok_gudang, qtyDasar) : 0;
        let ambilT = bulatQty_(qtyDasar - ambilG);
        if (lokBeli === 'toko') {
          ambilT = Math.min(lv.stok_toko, qtyDasar);
          ambilG = bulatQty_(qtyDasar - ambilT);
        }
        const stTV = bulatQty_(lv.stok_toko - ambilT);
        const stGV = bulatQty_(lv.stok_gudang - ambilG);
        const stokBaruV = bulatQty_(stTV + stGV);

        v.stok_toko = stTV;
        v.stok_gudang = stGV;
        v.stok = stokBaruV;
        updateVarianMap[v.id] = { stok: stokBaruV, stok_toko: stTV, stok_gudang: stGV };

        const lp = bacaStokLokasi_(p);
        const stTP = bulatQty_(lp.stok_toko - ambilT);
        const stGP = bulatQty_(lp.stok_gudang - ambilG);
        const stokBaruP = bulatQty_(stTP + stGP);
        p.stok_toko = stTP;
        p.stok_gudang = stGP;
        p.stok = stokBaruP;
        updateProdukMap[p.id] = { stok: stokBaruP, stok_toko: stTP, stok_gudang: stGP };

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: it.varian_id,
          tipe: 'retur_beli',
          lokasi: lokBeli,
          qty: -qtyDasar,
          saldo: stokBaruV,
          saldo_toko: stTV,
          saldo_gudang: stGV,
          hpp: hppV,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur pembelian ' + retur.no_retur + ': ' + retur.alasan
        });
      } else {
        const p = produkStateMap[it.produk_id];
        if (!p) return;
        const lp = bacaStokLokasi_(p);
        const hppP = Number(p.hpp || 0);
        const lokBeli = lokExplicit || (lp.stok_gudang >= qtyDasar ? 'gudang' : 'toko');
        let ambilG = lokBeli === 'gudang' ? Math.min(lp.stok_gudang, qtyDasar) : 0;
        let ambilT = bulatQty_(qtyDasar - ambilG);
        if (lokBeli === 'toko') {
          ambilT = Math.min(lp.stok_toko, qtyDasar);
          ambilG = bulatQty_(qtyDasar - ambilT);
        }
        const stTP = bulatQty_(lp.stok_toko - ambilT);
        const stGP = bulatQty_(lp.stok_gudang - ambilG);
        const stokBaru = bulatQty_(stTP + stGP);

        p.stok_toko = stTP;
        p.stok_gudang = stGP;
        p.stok = stokBaru;
        updateProdukMap[p.id] = { stok: stokBaru, stok_toko: stTP, stok_gudang: stGP };

        rowsKartuStok.push({
          produk_id: it.produk_id,
          varian_id: '',
          tipe: 'retur_beli',
          lokasi: lokBeli,
          qty: -qtyDasar,
          saldo: stokBaru,
          saldo_toko: stTP,
          saldo_gudang: stGP,
          hpp: hppP,
          ref_id: retur.no_retur,
          user_id: ctx.user.id,
          keterangan: 'Retur pembelian ' + retur.no_retur + ': ' + retur.alasan
        });
      }
    }
  });

  const perbaruiProdukList = Object.keys(updateProdukMap).map(function (id) { return { id: id, data: updateProdukMap[id] }; });
  const perbaruiVarianList = Object.keys(updateVarianMap).map(function (id) { return { id: id, data: updateVarianMap[id] }; });
  if (perbaruiProdukList.length > 0) ubahBaris_('Produk', perbaruiProdukList, ctx.user.id);
  if (perbaruiVarianList.length > 0) ubahBaris_('Varian', perbaruiVarianList, ctx.user.id);
  if (rowsKartuStok.length > 0) tambahBaris_('Kartu_Stok', rowsKartuStok, ctx.user.id);

  // 3. Efek Finansial & Piutang/Hutang
  if (tipe === 'jual') {
    const pjAsal = retur.ref_id ? cariById_('Penjualan', retur.ref_id) : null;
    const poinNotaTersisa = pjAsal ? Math.max(0, Number(pjAsal.poin_didapat || 0)) : 0;

    // Kurangi poin & total belanja member HANYA jika nota sebelumnya memang sudah mendapatkan poin / sudah dibayar
    if (retur.pihak_id) {
      const pel = cariById_('Pelanggan', retur.pihak_id);
      if (pel && String(pel.tipe || '').toLowerCase() === 'member') {
        const pengaturan = ambilPengaturan_();
        let poinPotong = 0;

        if (poinNotaTersisa > 0) {
          const totalNotaAsal = pjAsal ? Number(pjAsal.total || 0) : 0;
          const nominalPerPoin = Number(pengaturan.poin_per_rupiah) || 0;
          if (totalNotaAsal > 0 && Number(retur.total) >= totalNotaAsal) {
            // Retur penuh dari nota yang mendapat poin -> potong seluruh sisa poin nota tersebut
            poinPotong = poinNotaTersisa;
          } else if (nominalPerPoin > 0) {
            // Retur sebagian -> potong proporsional sesuai aturan poin, maksimal sebesar sisa poin nota asal
            const pengali = hitungPengaliPoin_(pel.level, pengaturan);
            const hitungProporsional = Math.floor((Number(retur.total) / nominalPerPoin) * pengali);
            poinPotong = Math.min(poinNotaTersisa, hitungProporsional);
          } else {
            poinPotong = poinNotaTersisa;
          }
        }

        // Kurangi total_belanja hanya sebesar bagian yang memang sudah pernah dibayar (bukan piutang belum lunas)
        const statusBayarAsal = pjAsal ? String(pjAsal.status_bayar || '') : 'lunas';
        const bayarTercatatAsal = pjAsal ? Math.min(Number(pjAsal.total || 0), Number(pjAsal.bayar || 0)) : Number(retur.total);
        const belanjaDikurangi = statusBayarAsal === 'belum_lunas'
          ? 0
          : (statusBayarAsal === 'sebagian' ? Math.min(Number(retur.total), bayarTercatatAsal) : Number(retur.total));

        const poinLama = Number(pel.poin || 0);
        const poinBaru = Math.max(0, poinLama - poinPotong);
        const belanjaLama = Number(pel.total_belanja || 0);
        const belanjaBaru = Math.max(0, belanjaLama - belanjaDikurangi);

        if (poinPotong > 0 || belanjaDikurangi > 0) {
          ubahBaris_('Pelanggan', [{
            id: pel.id,
            data: { poin: poinBaru, total_belanja: belanjaBaru }
          }], ctx.user.id);
        }

        if (poinPotong > 0) {
          // Perbarui sisa poin_didapat pada nota asal agar retur berulang tidak memotong melebihi poin nota
          if (pjAsal) {
            ubahBaris_('Penjualan', [{
              id: pjAsal.id,
              data: { poin_didapat: Math.max(0, poinNotaTersisa - poinPotong) }
            }], ctx.user.id);
          }

          tambahBaris_('Poin_Log', [{
            pelanggan_id: pel.id,
            jumlah: -poinPotong,
            jenis: 'retur',
            ref_id: retur.no_retur,
            saldo: poinBaru
          }], ctx.user.id);
        }
      }
    }

    // Refund: potong piutang jika ada & sinkronkan status_bayar di Penjualan asal
    if (retur.metode_refund === 'potong_piutang') {
      const pt = bacaSemua_('Piutang').filter(function (p) { return p.penjualan_id === retur.ref_id && !p.deleted && p.status !== 'lunas'; })[0];
      if (pt) {
        const sisaBaru = Math.max(0, (Number(pt.sisa) || 0) - Number(retur.total));
        const statusPiutangBaru = sisaBaru === 0 ? 'lunas' : 'sebagian';
        ubahBaris_('Piutang', [{
          id: pt.id,
          data: {
            sisa: sisaBaru,
            status: statusPiutangBaru
          }
        }], ctx.user.id);

        if (pjAsal) {
          ubahBaris_('Penjualan', [{
            id: pjAsal.id,
            data: { status_bayar: statusPiutangBaru }
          }], ctx.user.id);
        }
      }
    }

    // Refund: kembalikan ke Saldo Titipan / Deposit Pelanggan
    if (retur.metode_refund === 'deposit' && retur.pihak_id) {
      const pelDep = cariById_('Pelanggan', retur.pihak_id);
      if (pelDep && !pelDep.deleted) {
        const nilaiRetur = Number(retur.total) || 0;
        const saldoBaru = (Number(pelDep.saldo_deposit) || 0) + nilaiRetur;
        ubahBaris_('Pelanggan', [{
          id: pelDep.id,
          data: { saldo_deposit: saldoBaru }
        }], ctx.user.id);

        tambahBaris_('Deposit_Log', [{
          no_bukti: nomorBerikut_('DEP'),
          pelanggan_id: pelDep.id,
          jenis: 'retur',
          metode: 'deposit',
          jumlah: nilaiRetur,
          saldo: saldoBaru,
          ref_id: retur.no_retur,
          catatan: 'Pengembalian dana retur ' + retur.no_retur
        }], ctx.user.id);
      }
    }

    // Jika total retur disetujui sudah mencapai 100% nilai nota pengiriman, batalkan status antrean pengiriman secara otomatis
    if (pjAsal && Number(pjAsal.total || 0) > 0 && pjAsal.pengiriman === 'dikirim') {
      const akumulasiReturPj = bacaSemua_('Retur').reduce(function (acc, r) {
        return (!r.deleted && r.tipe === 'jual' && r.status === 'disetujui' && r.ref_id === pjAsal.id)
          ? acc + (Number(r.total) || 0) : acc;
      }, 0);
      if (akumulasiReturPj >= Number(pjAsal.total || 0)) {
        ubahBaris_('Penjualan', [{
          id: pjAsal.id,
          data: { status_antar: 'diretur' }
        }], ctx.user.id);
      }
    }
  } else {
    // Retur Beli: potong hutang jika metode_refund === 'potong_hutang' & sinkronkan status_bayar di Pembelian asal
    if (retur.metode_refund === 'potong_hutang') {
      const ht = bacaSemua_('Hutang').filter(function (h) { return h.pembelian_id === retur.ref_id && !h.deleted && h.status !== 'lunas'; })[0];
      if (ht) {
        const sisaBaru = Math.max(0, (Number(ht.sisa) || 0) - Number(retur.total));
        const statusHutangBaru = sisaBaru === 0 ? 'lunas' : 'sebagian';
        ubahBaris_('Hutang', [{
          id: ht.id,
          data: {
            sisa: sisaBaru,
            status: statusHutangBaru
          }
        }], ctx.user.id);

        if (retur.ref_id) {
          const pbAsal = cariById_('Pembelian', retur.ref_id);
          if (pbAsal) {
            ubahBaris_('Pembelian', [{
              id: pbAsal.id,
              data: { status_bayar: statusHutangBaru }
            }], ctx.user.id);
          }
        }
      }
    }
  }

  // 4. Catat Audit Log
  catatAudit_(ctx.user.id, 'retur_approve', 'RETUR', retur.no_retur, {
    tipe: tipe,
    total: retur.total,
    metode_refund: retur.metode_refund
  });

  cacheHapus_('produk');
}

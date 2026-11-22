/* ========================================================================== */
/* 9.6 FASE 6: DASHBOARD & LAPORAN USAHA                                      */
/* ========================================================================== */

/** Helper: Konversi atau hitung rentang tanggal YYYY-MM-DD secara konsisten. */
function hitungRentangTanggal_(dari, sampai, periode) {
  const sekarang = new Date();
  const formatTgl = function (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const t = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + t;
  };

  const hariIni = formatTgl(sekarang);
  if (dari && sampai) {
    return { dari: String(dari).substring(0, 10), sampai: String(sampai).substring(0, 10) };
  }

  if (periode === 'hari_ini') {
    return { dari: hariIni, sampai: hariIni };
  } else if (periode === '7_hari') {
    const d7 = new Date(sekarang.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { dari: formatTgl(d7), sampai: hariIni };
  } else if (periode === 'bulan_ini') {
    const awalBulan = new Date(sekarang.getFullYear(), sekarang.getMonth(), 1);
    return { dari: formatTgl(awalBulan), sampai: hariIni };
  } else if (periode === 'tahun_ini') {
    const awalTahun = new Date(sekarang.getFullYear(), 0, 1);
    return { dari: formatTgl(awalTahun), sampai: hariIni };
  } else if (periode === 'semua') {
    return { dari: '2000-01-01', sampai: hariIni };
  }

  // Standar: 30 hari terakhir
  const d30 = new Date(sekarang.getTime() - 29 * 24 * 60 * 60 * 1000);
  return {
    dari: dari ? String(dari).substring(0, 10) : formatTgl(d30),
    sampai: sampai ? String(sampai).substring(0, 10) : hariIni
  };
}

/**
 * laporan.dashboard — Data komprehensif dashboard eksekutif:
 * Omset penjualan, pembelian, piutang/hutang berjalan, stok kritis,
 * top produk, top member, breakdown metode bayar, dan grafik tren harian.
 * Catatan Hak Akses: Laba kotor, margin, dan total nilai aset persediaan HANYA dikirimkan jika role === 'owner'.
 */
/**
 * Helper bersama: menghitung total retur penjualan disetujui, HPP barang retur yang kembali ke stok,
 * dan dampak bersih terhadap laba kotor (omset retur - HPP kembali ke stok) dalam rentang tanggal.
 */
function hitungEfekReturPenjualan_(rentang) {
  const semuaRetur = bacaSemua_('Retur');
  const returIdSet = {};
  let totalReturJual = 0;

  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui') return;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      returIdSet[rt.id] = true;
      totalReturJual += (Number(rt.total) || 0);
    }
  });

  let totalReturHpp = 0;
  if (Object.keys(returIdSet).length > 0) {
    bacaSemua_('Retur_Item').forEach(function (it) {
      if (it.deleted || !returIdSet[it.retur_id]) return;
      const qtyDasar = Number(it.qty_dasar) || (Number(it.qty || 0) * Math.max(1, Number(it.faktor) || 1));
      const hpp = Number(it.hpp) || 0;
      totalReturHpp += (hpp * qtyDasar);
    });
  }

  return {
    total_retur_jual: Math.round(totalReturJual),
    total_retur_hpp: Math.round(totalReturHpp),
    dampak_laba_retur: Math.round(totalReturJual - totalReturHpp)
  };
}

/**
 * Helper bersama: agregasi Penjualan_Bayar per metode secara bersih (menghilangkan uang kembalian
 * pada data historis maupun data baru sehingga arus kas tunai 100% akurat).
 */
function agregasiBayarBersih_(penjualanFinal, semuaJualBayar) {
  const totalNotaMap = {};
  penjualanFinal.forEach(function (j) {
    totalNotaMap[j.id] = Number(j.total) || 0;
  });

  const byrByNota = {};
  semuaJualBayar.forEach(function (byr) {
    if (byr.deleted || totalNotaMap[byr.penjualan_id] === undefined) return;
    if (!byrByNota[byr.penjualan_id]) byrByNota[byr.penjualan_id] = [];
    byrByNota[byr.penjualan_id].push(byr);
  });

  const hasil = {
    tunai: { total: 0, count: 0 },
    transfer: { total: 0, count: 0 },
    qris: { total: 0, count: 0 },
    tempo: { total: 0, count: 0 },
    deposit: { total: 0, count: 0 }
  };

  Object.keys(byrByNota).forEach(function (pjId) {
    const list = byrByNota[pjId];
    const totalNota = totalNotaMap[pjId];
    let sumByr = 0;
    list.forEach(function (b) { sumByr += Number(b.jumlah) || 0; });
    let sisaKelebihan = Math.max(0, sumByr - totalNota);

    list.forEach(function (byr) {
      const m = String(byr.metode || 'tunai').toLowerCase();
      let jml = Number(byr.jumlah) || 0;
      if (m === 'tunai' && sisaKelebihan > 0) {
        const pot = Math.min(jml, sisaKelebihan);
        jml -= pot;
        sisaKelebihan -= pot;
      }
      if (hasil[m]) {
        hasil[m].total += jml;
        hasil[m].count += 1;
      }
    });
  });

  return hasil;
}

function aksiLaporanDashboard_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  // 1. Data Penjualan Final dalam Rentang Tanggal
  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanFinal = semuaPenjualan.filter(function (j) {
    if (j.deleted || j.status !== 'final') return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  const penjualanIdSet = {};
  let totalPenjualan = 0;
  let totalDiskonPenjualan = 0;
  let totalPajakPenjualan = 0;
  let totalSubtotalPenjualan = 0;

  penjualanFinal.forEach(function (j) {
    penjualanIdSet[j.id] = true;
    totalPenjualan += Number(j.total) || 0;
    totalDiskonPenjualan += Number(j.diskon) || 0;
    totalPajakPenjualan += Number(j.pajak) || 0;
    totalSubtotalPenjualan += Number(j.subtotal) || 0;
  });

  // 2. Data Penjualan Item (Item Terjual, HPP COGS, Produk Terlaris)
  const semuaJualItem = bacaSemua_('Penjualan_Item');
  let totalItemTerjual = 0;
  let totalHpp = 0;
  const produkAgg = {};

  semuaJualItem.forEach(function (it) {
    if (it.deleted || !penjualanIdSet[it.penjualan_id]) return;
    const qty = Number(it.qty_dasar) || Number(it.qty) || 0;
    const subtotal = Number(it.subtotal) || 0;
    const hpp = Number(it.hpp) || 0;

    totalItemTerjual += qty;
    totalHpp += (hpp * qty);

    const key = it.produk_id || it.nama;
    if (!produkAgg[key]) {
      produkAgg[key] = {
        produk_id: it.produk_id,
        nama: it.nama,
        satuan: it.satuan || 'Pcs',
        qty_terjual: 0,
        total_omset: 0
      };
    }
    produkAgg[key].qty_terjual += qty;
    produkAgg[key].total_omset += subtotal;
  });

  const produkTerlaris = Object.values(produkAgg)
    .sort(function (a, b) { return b.qty_terjual - a.qty_terjual; })
    .slice(0, 10);

  // 3. Data Pembelian dalam Rentang Tanggal
  const semuaPembelian = bacaSemua_('Pembelian');
  const pembelianRentang = semuaPembelian.filter(function (pb) {
    if (pb.deleted || pb.status === 'batal') return false;
    const tgl = String(pb.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  let totalPembelian = 0;
  let totalBeliBayar = 0;
  pembelianRentang.forEach(function (pb) {
    totalPembelian += Number(pb.total) || 0;
    totalBeliBayar += Number(pb.bayar) || 0;
  });

  // 4. Data Hutang & Piutang Aktif Berjalan
  const semuaPiutang = bacaSemua_('Piutang');
  let totalPiutangAktif = 0;
  let countPiutangAktif = 0;
  semuaPiutang.forEach(function (pi) {
    if (!pi.deleted && pi.status !== 'lunas') {
      totalPiutangAktif += Number(pi.sisa) || 0;
      countPiutangAktif++;
    }
  });

  const semuaHutang = bacaSemua_('Hutang');
  let totalHutangAktif = 0;
  let countHutangAktif = 0;
  semuaHutang.forEach(function (h) {
    if (!h.deleted && h.status !== 'lunas') {
      totalHutangAktif += Number(h.sisa) || 0;
      countHutangAktif++;
    }
  });

  // 5. Data Stok Kritis & Estimasi Aset Persediaan
  const semuaProduk = bacaSemua_('Produk');
  const semuaVarian = bacaSemua_('Varian');
  const varianByProduk = {};
  semuaVarian.forEach(function (v) {
    if (v.deleted || !v.aktif) return;
    if (!varianByProduk[v.produk_id]) varianByProduk[v.produk_id] = [];
    varianByProduk[v.produk_id].push(v);
  });

  const stokKritis = [];
  let totalAsetStok = 0;

  semuaProduk.forEach(function (pdk) {
    if (pdk.deleted || !pdk.aktif) return;

    if (pdk.punya_varian && varianByProduk[pdk.id] && varianByProduk[pdk.id].length > 0) {
      varianByProduk[pdk.id].forEach(function (v) {
        const s = Number(v.stok) || 0;
        const sMin = Number(v.stok_min) || 0;
        const h = Number(v.hpp) || 0;
        totalAsetStok += (s * h);

        if (s <= sMin) {
          stokKritis.push({
            id: v.id,
            produk_id: pdk.id,
            nama: pdk.nama + ' (' + v.nama_varian + ')',
            sku: v.sku || pdk.sku || '-',
            satuan: pdk.satuan_dasar || 'Pcs',
            stok: s,
            stok_min: sMin,
            status: s <= 0 ? 'habis' : 'kritis'
          });
        }
      });
    } else {
      const s = Number(pdk.stok) || 0;
      const sMin = Number(pdk.stok_min) || 0;
      const h = Number(pdk.hpp) || 0;
      totalAsetStok += (s * h);

      if (s <= sMin) {
        stokKritis.push({
          id: pdk.id,
          produk_id: pdk.id,
          nama: pdk.nama,
          sku: pdk.sku || '-',
          satuan: pdk.satuan_dasar || 'Pcs',
          stok: s,
          stok_min: sMin,
          status: s <= 0 ? 'habis' : 'kritis'
        });
      }
    }
  });

  stokKritis.sort(function (a, b) { return a.stok - b.stok; });

  // 6. Data Pelanggan Terbaik (Top Customers)
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelangganMap = {};
  semuaPelanggan.forEach(function (pel) {
    pelangganMap[pel.id] = { nama: pel.nama, kode: pel.kode, tipe: pel.tipe, level: pel.level };
  });

  const memberAgg = {};
  penjualanFinal.forEach(function (j) {
    if (!j.pelanggan_id) return;
    const info = pelangganMap[j.pelanggan_id] || { nama: 'Pelanggan Umum', kode: '-', tipe: 'umum', level: 'reguler' };
    if (!memberAgg[j.pelanggan_id]) {
      memberAgg[j.pelanggan_id] = {
        pelanggan_id: j.pelanggan_id,
        nama: info.nama,
        kode: info.kode,
        tipe: info.tipe,
        level: info.level,
        total_transaksi: 0,
        total_belanja: 0
      };
    }
    memberAgg[j.pelanggan_id].total_transaksi += 1;
    memberAgg[j.pelanggan_id].total_belanja += (Number(j.total) || 0);
  });

  const pelangganTerbaik = Object.values(memberAgg)
    .sort(function (a, b) { return b.total_belanja - a.total_belanja; })
    .slice(0, 10);

  // 7. Komposisi Metode Pembayaran (bersih tanpa uang kembalian)
  const semuaJualBayar = bacaSemua_('Penjualan_Bayar');
  const metodeBayarAgg = agregasiBayarBersih_(penjualanFinal, semuaJualBayar);

  // 8. Grafik Tren Harian
  const trenPeta = {};
  penjualanFinal.forEach(function (j) {
    const tgl = String(j.tanggal || '').substring(0, 10);
    if (!trenPeta[tgl]) {
      trenPeta[tgl] = { tanggal: tgl, penjualan: 0, pembelian: 0, transaksi: 0 };
    }
    trenPeta[tgl].penjualan += (Number(j.total) || 0);
    trenPeta[tgl].transaksi += 1;
  });

  pembelianRentang.forEach(function (pb) {
    const tgl = String(pb.tanggal || '').substring(0, 10);
    if (!trenPeta[tgl]) {
      trenPeta[tgl] = { tanggal: tgl, penjualan: 0, pembelian: 0, transaksi: 0 };
    }
    trenPeta[tgl].pembelian += (Number(pb.total) || 0);
  });

  const tren = Object.values(trenPeta).sort(function (a, b) {
    return a.tanggal.localeCompare(b.tanggal);
  });

  // Hitung Laba Kotor, Efek Retur Penjualan (sinkron dengan Laba Rugi) & Biaya Operasional (Khusus Owner)
  const efekRetur = hitungEfekReturPenjualan_(rentang);
  const semuaBiaya = bacaSemua_('Biaya');
  let totalBiayaOperasional = 0;
  semuaBiaya.forEach(function (b) {
    if (b.deleted || b.status === 'batal') return;
    const tgl = String(b.tanggal || b.created_at || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      totalBiayaOperasional += (Number(b.nominal) || 0);
    }
  });

  const labaKotor = isOwner ? Math.round((totalPenjualan - totalHpp) - efekRetur.dampak_laba_retur) : null;
  const marginPersen = isOwner ? (totalPenjualan > 0 ? Math.round((labaKotor / totalPenjualan) * 10000) / 100 : 0) : null;
  const labaBersihRiil = isOwner ? Math.round((labaKotor || 0) - totalBiayaOperasional) : null;
  const marginBersihPersen = isOwner ? (totalPenjualan > 0 ? Math.round((labaBersihRiil / totalPenjualan) * 10000) / 100 : 0) : null;

  return {
    rentang: rentang,
    ringkasan: {
      total_penjualan: totalPenjualan,
      subtotal_penjualan: totalSubtotalPenjualan,
      diskon_penjualan: totalDiskonPenjualan,
      pajak_penjualan: totalPajakPenjualan,
      total_transaksi: penjualanFinal.length,
      total_item_terjual: totalItemTerjual,
      total_pembelian: totalPembelian,
      total_faktur_beli: pembelianRentang.length,
      total_piutang_aktif: totalPiutangAktif,
      count_piutang_aktif: countPiutangAktif,
      total_hutang_aktif: totalHutangAktif,
      count_hutang_aktif: countHutangAktif,
      total_nilai_aset_stok: isOwner ? Math.round(totalAsetStok) : null,
      laba_kotor: labaKotor,
      margin_persen: marginPersen,
      total_biaya_operasional: totalBiayaOperasional,
      laba_bersih_riil: labaBersihRiil,
      margin_bersih_persen: marginBersihPersen
    },
    produk_terlaris: produkTerlaris,
    pelanggan_terbaik: pelangganTerbaik,
    stok_kritis: stokKritis.slice(0, 15),
    metode_bayar: metodeBayarAgg,
    tren: tren
  };
}

/**
 * laporan.penjualan — Rincian laporan transaksi penjualan dengan filter lengkap.
 */
function aksiLaporanPenjualan_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaUsers = bacaSemua_('Users');
  const userMap = {};
  semuaUsers.forEach(function (u) { userMap[u.id] = u.nama || u.username; });

  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelMap = {};
  semuaPelanggan.forEach(function (pel) { pelMap[pel.id] = pel.nama; });

  // Map HPP snapshot item jika Owner
  const semuaItems = isOwner ? bacaSemua_('Penjualan_Item') : [];
  const hppByJual = {};
  const itemCountByJual = {};
  if (isOwner) {
    semuaItems.forEach(function (it) {
      if (it.deleted) return;
      const h = Number(it.hpp) || 0;
      const q = Number(it.qty_dasar) || Number(it.qty) || 0;
      hppByJual[it.penjualan_id] = (hppByJual[it.penjualan_id] || 0) + (h * q);
      itemCountByJual[it.penjualan_id] = (itemCountByJual[it.penjualan_id] || 0) + 1;
    });
  }

  let filtered = semuaPenjualan.filter(function (j) {
    if (j.deleted) return false;
    if (!p.status && j.status === 'pending') return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return false;

    if (p.status && j.status !== p.status) return false;
    if (p.kasir_id && j.kasir_id !== p.kasir_id) return false;
    if (p.pelanggan_id && j.pelanggan_id !== p.pelanggan_id) return false;
    if (p.metode_bayar && j.metode_bayar !== p.metode_bayar) return false;
    if (p.status_bayar && j.status_bayar !== p.status_bayar) return false;

    return true;
  });

  // Urutkan transaksi terbaru lebih dahulu
  filtered.sort(function (a, b) {
    return new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0);
  });

  let totalOmset = 0;
  let totalDiskon = 0;
  let totalPajak = 0;
  let totalLaba = 0;
  let totalTransaksiAktif = 0;
  let totalVoid = 0;

  const items = filtered.map(function (j) {
    const total = Number(j.total) || 0;
    const diskon = Number(j.diskon) || 0;
    const pajak = Number(j.pajak) || 0;
    const isVoid = j.status === 'void';
    const isAktif = !isVoid && j.status !== 'pending';

    if (isAktif) {
      totalOmset += total;
      totalDiskon += diskon;
      totalPajak += pajak;
      totalTransaksiAktif += 1;
    } else if (isVoid) {
      totalVoid += 1;
    }

    const row = {
      id: j.id,
      no_nota: j.no_nota,
      tanggal: j.tanggal,
      kasir_id: j.kasir_id,
      kasir_nama: userMap[j.kasir_id] || 'Kasir',
      pelanggan_id: j.pelanggan_id,
      pelanggan_nama: j.pelanggan_id ? (pelMap[j.pelanggan_id] || 'Pelanggan Umum') : 'Pelanggan Umum',
      subtotal: Number(j.subtotal) || 0,
      diskon: diskon,
      pajak: pajak,
      pembulatan: Number(j.pembulatan) || 0,
      total: total,
      bayar: Number(j.bayar) || 0,
      kembalian: Number(j.kembalian) || 0,
      metode_bayar: j.metode_bayar,
      status_bayar: j.status_bayar,
      pengiriman: j.pengiriman,
      status_antar: j.status_antar,
      status: j.status
    };

    if (isOwner) {
      const hppTot = hppByJual[j.id] || 0;
      const laba = isAktif ? Math.round(total - hppTot) : 0;
      row.laba_kotor = laba;
      row.hpp_total = hppTot;
      if (isAktif) totalLaba += laba;
    }

    return row;
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    rentang: rentang,
    ringkasan: {
      total_omset: totalOmset,
      total_diskon: totalDiskon,
      total_pajak: totalPajak,
      total_transaksi: totalTransaksiAktif,
      total_void: totalVoid,
      total_laba: isOwner ? totalLaba : null
    },
    items: items.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
  };
}

/**
 * laporan.pembelian — Rincian laporan transaksi pembelian barang masuk ke supplier.
 */
function aksiLaporanPembelian_(ctx) {
  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  const semuaPembelian = bacaSemua_('Pembelian');
  const semuaSupplier = bacaSemua_('Supplier');
  const supMap = {};
  semuaSupplier.forEach(function (s) { supMap[s.id] = s.nama; });

  // Ambil sisa hutang riil dari sheet Hutang agar sinkron setelah cicilan maupun retur potong_hutang
  const hutangByBeli = {};
  bacaSemua_('Hutang').forEach(function (h) {
    if (!h.deleted && h.pembelian_id) {
      hutangByBeli[h.pembelian_id] = h;
    }
  });

  let filtered = semuaPembelian.filter(function (pb) {
    if (pb.deleted || pb.status === 'batal') return false;
    const tgl = String(pb.tanggal || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return false;

    if (p.supplier_id && pb.supplier_id !== p.supplier_id) return false;
    if (p.status_bayar && pb.status_bayar !== p.status_bayar) return false;

    return true;
  });

  filtered.sort(function (a, b) {
    return new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0);
  });

  let totalBeli = 0;
  let totalDiskon = 0;
  let totalBayar = 0;
  let totalSisaHutang = 0;

  const items = filtered.map(function (pb) {
    const total = Number(pb.total) || 0;
    const diskon = Number(pb.diskon) || 0;
    const bayar = Number(pb.bayar) || 0;
    const htTerkait = hutangByBeli[pb.id];
    const sisa = htTerkait
      ? (htTerkait.status === 'lunas' ? 0 : Math.max(0, Number(htTerkait.sisa) || 0))
      : (pb.status_bayar === 'lunas' ? 0 : Math.max(0, total - bayar));

    totalBeli += total;
    totalDiskon += diskon;
    totalBayar += bayar;
    totalSisaHutang += sisa;

    return {
      id: pb.id,
      no_faktur: pb.no_faktur,
      no_faktur_supplier: pb.no_faktur_supplier || '-',
      tanggal: pb.tanggal,
      supplier_id: pb.supplier_id,
      supplier_nama: supMap[pb.supplier_id] || 'Supplier Umum',
      subtotal: Number(pb.subtotal) || 0,
      diskon: diskon,
      total: total,
      bayar: bayar,
      status_bayar: pb.status_bayar,
      jatuh_tempo: pb.jatuh_tempo || '-',
      sisa_hutang: sisa,
      catatan: pb.catatan || ''
    };
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    rentang: rentang,
    ringkasan: {
      total_pembelian: totalBeli,
      total_diskon: totalDiskon,
      total_terbayar: totalBayar,
      total_sisa_hutang: totalSisaHutang,
      total_faktur: filtered.length
    },
    items: items.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
  };
}

/**
 * laporan.labaRugi — Laporan laba kotor, HPP (COGS), margin %, dan analisis per kategori produk.
 * Khusus role OWNER.
 */
function aksiLaporanLabaRugi_(ctx) {
  if (ctx.user.role !== ROLE.OWNER) {
    gagal_(KODE.FORBIDDEN, 'Laporan laba rugi hanya dapat diakses oleh Pemilik Toko (Owner).');
  }

  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanFinal = semuaPenjualan.filter(function (j) {
    if (j.deleted || j.status !== 'final') return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  const penjualanIdSet = {};
  let omsetKotor = 0;
  let totalDiskon = 0;
  let totalPajak = 0;
  let totalOngkir = 0;
  let omsetBersih = 0;

  penjualanFinal.forEach(function (j) {
    penjualanIdSet[j.id] = true;
    omsetKotor += (Number(j.subtotal) || 0);
    totalDiskon += (Number(j.diskon) || 0);
    totalPajak += (Number(j.pajak) || 0);
    totalOngkir += (Number(j.ongkir) || 0);
    omsetBersih += (Number(j.total) || 0);
  });

  // HPP dari Penjualan_Item
  const semuaItems = bacaSemua_('Penjualan_Item');
  const semuaProduk = bacaSemua_('Produk');
  const semuaKategori = bacaSemua_('Kategori');

  const katMap = {};
  semuaKategori.forEach(function (k) { katMap[k.id] = k.nama; });

  const prodKatMap = {};
  semuaProduk.forEach(function (pdk) { prodKatMap[pdk.id] = pdk.kategori_id; });

  let totalHpp = 0;
  const katAgg = {};
  const itemMarginAgg = {};

  semuaItems.forEach(function (it) {
    if (it.deleted || !penjualanIdSet[it.penjualan_id]) return;
    const qty = Number(it.qty_dasar) || Number(it.qty) || 0;
    const subtotal = Number(it.subtotal) || 0;
    const hpp = Number(it.hpp) || 0;
    const hppItemTotal = hpp * qty;
    const labaItem = subtotal - hppItemTotal;

    totalHpp += hppItemTotal;

    // Per Kategori
    const katId = prodKatMap[it.produk_id] || 'tanpa_kategori';
    const katNama = katMap[katId] || 'Lain-lain / Umum';
    if (!katAgg[katId]) {
      katAgg[katId] = { kategori_id: katId, kategori: katNama, omset: 0, hpp: 0, laba: 0 };
    }
    katAgg[katId].omset += subtotal;
    katAgg[katId].hpp += hppItemTotal;
    katAgg[katId].laba += labaItem;

    // Per Item
    const key = it.produk_id || it.nama;
    if (!itemMarginAgg[key]) {
      itemMarginAgg[key] = { nama: it.nama, qty: 0, omset: 0, hpp: 0, laba: 0 };
    }
    itemMarginAgg[key].qty += qty;
    itemMarginAgg[key].omset += subtotal;
    itemMarginAgg[key].hpp += hppItemTotal;
    itemMarginAgg[key].laba += labaItem;
  });

  // Hitung Nilai Retur Penjualan & HPP Barang Kembali ke Stok (akurat secara akuntansi)
  const efekRetur = hitungEfekReturPenjualan_(rentang);
  const totalReturJual = efekRetur.total_retur_jual;
  const totalReturHpp = efekRetur.total_retur_hpp;
  const dampakLabaRetur = efekRetur.dampak_laba_retur;

  const labaKotorKotor = Math.round(omsetBersih - totalHpp);
  const labaKotorBersih = Math.round(labaKotorKotor - dampakLabaRetur);
  const marginPersen = omsetBersih > 0 ? Math.round((labaKotorBersih / omsetBersih) * 10000) / 100 : 0;

  // Format array kategori
  const kategoriList = Object.values(katAgg).map(function (k) {
    k.margin_persen = k.omset > 0 ? Math.round((k.laba / k.omset) * 10000) / 100 : 0;
    return k;
  }).sort(function (a, b) { return b.laba - a.laba; });

  // Format array produk (Top 10 Laba Tertinggi)
  const produkLabaTertinggi = Object.values(itemMarginAgg).map(function (it) {
    it.margin_persen = it.omset > 0 ? Math.round((it.laba / it.omset) * 10000) / 100 : 0;
    return it;
  }).sort(function (a, b) { return b.laba - a.laba; }).slice(0, 10);

  // Hitung Biaya Operasional Toko dalam Rentang
  const semuaBiaya = bacaSemua_('Biaya');
  let totalBiayaOperasional = 0;
  const biayaKatAgg = {};

  semuaBiaya.forEach(function (b) {
    if (b.deleted || b.status === 'batal') return;
    const tgl = String(b.tanggal || b.created_at || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      const nom = Number(b.nominal) || 0;
      totalBiayaOperasional += nom;
      const kat = b.kategori || 'Lain-lain';
      biayaKatAgg[kat] = (biayaKatAgg[kat] || 0) + nom;
    }
  });

  const labaBersihRiil = Math.round(labaKotorBersih - totalBiayaOperasional);
  const marginBersihPersen = omsetBersih > 0 ? Math.round((labaBersihRiil / omsetBersih) * 10000) / 100 : 0;

  const rincianBiayaList = Object.keys(biayaKatAgg).map(function (kat) {
    return {
      kategori: kat,
      nominal: biayaKatAgg[kat],
      persen: totalBiayaOperasional > 0 ? Math.round((biayaKatAgg[kat] / totalBiayaOperasional) * 100) : 0
    };
  }).sort(function (a, b) { return b.nominal - a.nominal; });

  return {
    rentang: rentang,
    ringkasan: {
      omset_kotor: omsetKotor,
      total_diskon: totalDiskon,
      total_pajak: totalPajak,
      total_ongkir: totalOngkir,
      omset_bersih: omsetBersih,
      total_hpp: totalHpp,
      laba_kotor_sebelum_retur: labaKotorKotor,
      total_retur_penjualan: totalReturJual,
      total_retur_hpp: totalReturHpp,
      dampak_laba_retur: dampakLabaRetur,
      laba_kotor_bersih: labaKotorBersih,
      margin_persen: marginPersen,
      total_biaya_operasional: totalBiayaOperasional,
      laba_bersih_riil: labaBersihRiil,
      margin_bersih_persen: marginBersihPersen
    },
    analisis_kategori: kategoriList,
    analisis_biaya: rincianBiayaList,
    produk_margin_teratas: produkLabaTertinggi
  };
}

/**
 * laporan.arusKas — Buku kas & laporan arus kas masuk-keluar toko.
 */
function aksiLaporanArusKas_(ctx) {
  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);

  // 1. Kas Masuk Penjualan Langsung (bersih tanpa kelebihan uang kembalian)
  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanFinal = semuaPenjualan.filter(function (j) {
    if (j.deleted || j.status !== 'final') return false;
    const tgl = String(j.tanggal || '').substring(0, 10);
    return tgl >= rentang.dari && tgl <= rentang.sampai;
  });

  const semuaJualBayar = bacaSemua_('Penjualan_Bayar');
  const jualBayarBersih = agregasiBayarBersih_(penjualanFinal, semuaJualBayar);
  const masukJualTunai = jualBayarBersih.tunai.total;
  const masukJualTransfer = jualBayarBersih.transfer.total;
  const masukJualQris = jualBayarBersih.qris.total;

  // 2. Kas Masuk Cicilan / Pelunasan Piutang & Kas Keluar Pembayaran Supplier
  const semuaPembelian = bacaSemua_('Pembelian');
  const beliIdSet = {};
  semuaPembelian.forEach(function (pb) { beliIdSet[pb.id] = true; });

  const semuaPembayaran = bacaSemua_('Pembayaran');
  let masukPiutangTunai = 0;
  let masukPiutangTransfer = 0;
  let masukPiutangQris = 0;

  let keluarBeliTunai = 0;
  let keluarBeliTransfer = 0;
  let keluarHutangTunai = 0;
  let keluarHutangTransfer = 0;

  semuaPembayaran.forEach(function (byr) {
    if (byr.deleted) return;
    const tgl = String(byr.tanggal || byr.created_at || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return;

    const m = String(byr.metode || '').toLowerCase();
    const jml = Number(byr.jumlah) || 0;

    if (byr.tipe === 'piutang') {
      if (m === 'tunai') masukPiutangTunai += jml;
      else if (m === 'transfer') masukPiutangTransfer += jml;
      else if (m === 'qris') masukPiutangQris += jml;
      else masukPiutangTunai += jml;
    } else if (byr.tipe === 'hutang') {
      // Bedakan pembayaran awal faktur beli vs cicilan hutang lanjutan
      if (beliIdSet[byr.ref_id]) {
        if (m === 'transfer') keluarBeliTransfer += jml;
        else keluarBeliTunai += jml;
      } else {
        if (m === 'transfer') keluarHutangTransfer += jml;
        else keluarHutangTunai += jml;
      }
    }
  });

  // 3. Kas Keluar Refund Retur Penjualan Tunai
  const semuaRetur = bacaSemua_('Retur');
  let keluarRefundRetur = 0;
  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui') return;
    if (rt.metode_refund !== 'kas') return;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      keluarRefundRetur += (Number(rt.total) || 0);
    }
  });

  // 4. Kas Keluar Biaya Operasional Toko
  const semuaBiaya = bacaSemua_('Biaya');
  let keluarBiayaTunai = 0;
  let keluarBiayaBank = 0;
  semuaBiaya.forEach(function (b) {
    if (b.deleted || b.status === 'batal') return;
    const tgl = String(b.tanggal || b.created_at || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return;
    const sumber = String(b.sumber_dana || 'kas_toko').toLowerCase();
    const nom = Number(b.nominal) || 0;
    if (sumber === 'bank' || sumber === 'transfer') {
      keluarBiayaBank += nom;
    } else {
      keluarBiayaTunai += nom;
    }
  });

  // 5. Mutasi Saldo Titipan / Deposit Pelanggan (HANYA terima titipan & pengembalian saldo yang menyentuh uang fisik/bank;
  // pemakaian saldo di POS tidak dihitung lagi agar tidak terjadi double-counting arus kas)
  const semuaDepositLog = bacaSemua_('Deposit_Log');
  let masukDepositTunai = 0;
  let masukDepositBank = 0;
  let keluarDepositTunai = 0;
  let keluarDepositBank = 0;

  semuaDepositLog.forEach(function (dl) {
    if (dl.deleted) return;
    const tgl = String(dl.created_at || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return;
    const m = String(dl.metode || 'tunai').toLowerCase();
    const jml = Math.abs(Number(dl.jumlah) || 0);
    if (jml <= 0) return;

    if (dl.jenis === 'masuk') {
      if (m === 'tunai') masukDepositTunai += jml;
      else masukDepositBank += jml;
    } else if (dl.jenis === 'tarik') {
      if (m === 'tunai') keluarDepositTunai += jml;
      else keluarDepositBank += jml;
    }
  });

  const totalMasukTunai = masukJualTunai + masukPiutangTunai + masukDepositTunai;
  const totalMasukBank = masukJualTransfer + masukPiutangTransfer + masukJualQris + masukPiutangQris + masukDepositBank;
  const totalKasMasuk = totalMasukTunai + totalMasukBank;

  const totalKeluarTunai = keluarBeliTunai + keluarHutangTunai + keluarRefundRetur + keluarBiayaTunai + keluarDepositTunai;
  const totalKeluarBank = keluarBeliTransfer + keluarHutangTransfer + keluarBiayaBank + keluarDepositBank;
  const totalKasKeluar = totalKeluarTunai + totalKeluarBank;

  const arusKasBersih = totalKasMasuk - totalKasKeluar;
  const saldoTunaiKasir = totalMasukTunai - totalKeluarTunai;
  const saldoBankNonTunai = totalMasukBank - totalKeluarBank;

  return {
    rentang: rentang,
    ringkasan: {
      total_kas_masuk: totalKasMasuk,
      total_kas_keluar: totalKasKeluar,
      arus_kas_bersih: arusKasBersih,
      saldo_tunai_kasir: saldoTunaiKasir,
      saldo_bank_non_tunai: saldoBankNonTunai
    },
    rincian_masuk: {
      penjualan_tunai: masukJualTunai,
      penjualan_transfer: masukJualTransfer,
      penjualan_qris: masukJualQris,
      piutang_tunai: masukPiutangTunai,
      piutang_transfer: masukPiutangTransfer,
      piutang_qris: masukPiutangQris,
      deposit_masuk_tunai: masukDepositTunai,
      deposit_masuk_bank: masukDepositBank,
      subtotal_tunai: totalMasukTunai,
      subtotal_bank: totalMasukBank
    },
    rincian_keluar: {
      pembelian_tunai: keluarBeliTunai,
      pembelian_transfer: keluarBeliTransfer,
      hutang_tunai: keluarHutangTunai,
      hutang_transfer: keluarHutangTransfer,
      refund_retur_tunai: keluarRefundRetur,
      biaya_operasional_tunai: keluarBiayaTunai,
      biaya_operasional_bank: keluarBiayaBank,
      deposit_tarik_tunai: keluarDepositTunai,
      deposit_tarik_bank: keluarDepositBank,
      subtotal_tunai: totalKeluarTunai,
      subtotal_bank: totalKeluarBank
    }
  };
}

/**
 * laporan.stokValuasi — Laporan valuasi nilai persediaan stok dan status stok fisik.
 */
function aksiLaporanStokValuasi_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;

  const semuaProduk = bacaSemua_('Produk');
  const semuaVarian = bacaSemua_('Varian');
  const semuaKategori = bacaSemua_('Kategori');

  const katMap = {};
  semuaKategori.forEach(function (k) { katMap[k.id] = k.nama; });

  const varianByProduk = {};
  semuaVarian.forEach(function (v) {
    if (v.deleted || !v.aktif) return;
    if (!varianByProduk[v.produk_id]) varianByProduk[v.produk_id] = [];
    varianByProduk[v.produk_id].push(v);
  });

  const list = [];
  let totalUnitStok = 0;
  let totalAsetStok = 0;
  let countHabis = 0;
  let countKritis = 0;
  let countAman = 0;

  semuaProduk.forEach(function (pdk) {
    if (pdk.deleted || !pdk.aktif) return;
    const katNama = katMap[pdk.kategori_id] || 'Umum';

    if (pdk.punya_varian && varianByProduk[pdk.id] && varianByProduk[pdk.id].length > 0) {
      varianByProduk[pdk.id].forEach(function (v) {
        const s = Number(v.stok) || 0;
        const sMin = Number(v.stok_min) || 0;
        const h = Number(v.hpp) || 0;
        const nilai = s * h;
        totalUnitStok += s;
        totalAsetStok += nilai;

        let status = 'aman';
        if (s <= 0) { status = 'habis'; countHabis++; }
        else if (s <= sMin) { status = 'kritis'; countKritis++; }
        else { countAman++; }

        list.push({
          id: v.id,
          produk_id: pdk.id,
          sku: v.sku || pdk.sku || '-',
          barcode: v.barcode || pdk.barcode || '',
          nama: pdk.nama + ' (' + v.nama_varian + ')',
          kategori_id: pdk.kategori_id,
          kategori: katNama,
          satuan: pdk.satuan_dasar || 'Pcs',
          stok: s,
          stok_min: sMin,
          hpp: h,
          nilai_aset: nilai,
          status: status
        });
      });
    } else {
      const s = Number(pdk.stok) || 0;
      const sMin = Number(pdk.stok_min) || 0;
      const h = Number(pdk.hpp) || 0;
      const nilai = s * h;
      totalUnitStok += s;
      totalAsetStok += nilai;

      let status = 'aman';
      if (s <= 0) { status = 'habis'; countHabis++; }
      else if (s <= sMin) { status = 'kritis'; countKritis++; }
      else { countAman++; }

      list.push({
        id: pdk.id,
        produk_id: pdk.id,
        sku: pdk.sku || '-',
        barcode: pdk.barcode || '',
        nama: pdk.nama,
        kategori_id: pdk.kategori_id,
        kategori: katNama,
        satuan: pdk.satuan_dasar || 'Pcs',
        stok: s,
        stok_min: sMin,
        hpp: h,
        nilai_aset: nilai,
        status: status
      });
    }
  });

  let filtered = list;

  if (p.kategori_id) {
    filtered = filtered.filter(function (it) { return it.kategori_id === p.kategori_id; });
  }

  if (p.status_stok && p.status_stok !== 'semua') {
    filtered = filtered.filter(function (it) { return it.status === p.status_stok; });
  }

  if (p.q) {
    const q = String(p.q).toLowerCase().trim();
    filtered = filtered.filter(function (it) {
      return (
        it.nama.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.barcode.toLowerCase().includes(q)
      );
    });
  }

  filtered.sort(function (a, b) { return a.stok - b.stok; });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    ringkasan: {
      total_item: list.length,
      total_unit_stok: totalUnitStok,
      total_nilai_aset: isOwner ? Math.round(totalAsetStok) : null,
      total_habis: countHabis,
      total_kritis: countKritis,
      total_aman: countAman
    },
    items: filtered.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
  };
}

/* ========================================================================== */
/* 9.7 FASE 7: BIAYA OPERASIONAL & PENGELUARAN KAS                           */
/* ========================================================================== */

/**
 * biaya.list — Mengambil riwayat pengeluaran kas operasional dengan filter rentang, kategori, dan sumber dana.
 */
function aksiBiayaList_(ctx) {
  const p = ctx.payload || {};
  const rentang = hitungRentangTanggal_(p.dari, p.sampai, p.periode);
  const targetKategori = p.kategori ? String(p.kategori).trim().toLowerCase() : null;
  const targetSumber = p.sumber_dana ? String(p.sumber_dana).trim().toLowerCase() : null;
  const targetQ = p.q ? String(p.q).trim().toLowerCase() : null;

  const semuaBiaya = bacaSemua_('Biaya');
  let totalNominal = 0;
  let totalKasKasir = 0;
  let totalKasToko = 0;
  let totalBank = 0;
  const kategoriAgg = {};

  const filtered = [];

  semuaBiaya.forEach(function (b) {
    if (b.deleted || b.status === 'batal') return;
    const tgl = String(b.tanggal || b.created_at || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return;

    const kat = b.kategori || 'Lain-lain';
    const sumber = String(b.sumber_dana || 'kas_toko').toLowerCase();
    const nom = Number(b.nominal) || 0;

    // Filter kategori jika diberikan
    if (targetKategori && kat.toLowerCase() !== targetKategori) return;

    // Filter sumber dana jika diberikan
    if (targetSumber && sumber !== targetSumber) return;

    // Filter pencarian query
    if (targetQ) {
      const hay = (String(b.no_transaksi || '') + ' ' + kat + ' ' + String(b.keterangan || '') + ' ' + String(b.user_nama || '')).toLowerCase();
      if (hay.indexOf(targetQ) === -1) return;
    }

    totalNominal += nom;
    if (sumber === 'kas_kasir') totalKasKasir += nom;
    else if (sumber === 'bank' || sumber === 'transfer') totalBank += nom;
    else totalKasToko += nom;

    kategoriAgg[kat] = (kategoriAgg[kat] || 0) + nom;

    filtered.push({
      id: b.id,
      no_transaksi: b.no_transaksi || ('EXP-' + String(b.id || '').substring(0, 6)),
      tanggal: b.tanggal || b.created_at,
      kategori: kat,
      nominal: nom,
      keterangan: b.keterangan || '',
      sumber_dana: sumber,
      shift_id: b.shift_id || '',
      user_id: b.user_id || '',
      user_nama: b.user_nama || '',
      bukti_url: b.bukti_url || '',
      status: b.status || 'aktif',
      created_at: b.created_at
    });
  });

  // Urutkan dari yang terbaru (descending)
  filtered.sort(function (a, b) {
    const tA = String(a.tanggal || a.created_at || '');
    const tB = String(b.tanggal || b.created_at || '');
    return tB.localeCompare(tA);
  });

  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  const rincianKategori = Object.keys(kategoriAgg).map(function (k) {
    return {
      kategori: k,
      nominal: kategoriAgg[k],
      persen: totalNominal > 0 ? Math.round((kategoriAgg[k] / totalNominal) * 100) : 0
    };
  }).sort(function (a, b) { return b.nominal - a.nominal; });

  return {
    rentang: rentang,
    ringkasan: {
      total_nominal: totalNominal,
      total_transaksi: filtered.length,
      total_kas_kasir: totalKasKasir,
      total_kas_toko: totalKasToko,
      total_bank: totalBank,
      analisis_kategori: rincianKategori
    },
    items: filtered.slice(mulai, mulai + limit),
    total: filtered.length,
    page: page,
    limit: limit
  };
}

/**
 * biaya.create — Mencatat transaksi pengeluaran kas / biaya operasional baru.
 */
function aksiBiayaCreate_(ctx) {
  const p = ctx.payload || {};

  const kategori = V_.teks(p.kategori, 'Kategori Biaya', { min: 2, maks: 100 });
  const nominal = V_.angka(p.nominal, 'Nominal Biaya', { min: 100 });
  const keterangan = V_.teks(p.keterangan, 'Keterangan', { min: 2, maks: 500 });
  let sumberDana = String(p.sumber_dana || 'kas_toko').trim().toLowerCase();
  if (sumberDana !== 'kas_kasir' && sumberDana !== 'bank' && sumberDana !== 'kas_toko') {
    sumberDana = 'kas_toko';
  }
  // Kasir hanya boleh mencatat kas keluar dari laci kasir (petty cash), bukan brankas toko atau rekening bank
  if (ctx.user.role === ROLE.KASIR) {
    sumberDana = 'kas_kasir';
  }

  const shiftId = p.shift_id ? String(p.shift_id).trim() : '';
  const buktiUrl = p.bukti_url ? String(p.bukti_url).trim() : '';

  return denganKunci_(function () {
    const noTransaksi = nomorBerikut_('EXP');
    const waktuSkrg = sekarang_();

    const dataBiaya = {
      no_transaksi: noTransaksi,
      tanggal: waktuSkrg,
      kategori: kategori,
      nominal: nominal,
      keterangan: keterangan,
      sumber_dana: sumberDana,
      shift_id: shiftId,
      user_id: ctx.user.id,
      user_nama: ctx.user.nama || ctx.user.username,
      bukti_url: buktiUrl,
      status: 'aktif'
    };

    const baru = tambahBaris_('Biaya', [dataBiaya], ctx.user.id);
    const itemCreated = baru && baru[0] ? baru[0] : dataBiaya;

    catatAudit_(ctx.user.id, 'biaya_create', 'BIAYA', noTransaksi, {
      kategori: kategori,
      nominal: nominal,
      sumber_dana: sumberDana,
      keterangan: keterangan
    });

    return {
      pesan: 'Pengeluaran kas ' + noTransaksi + ' berhasil dicatat.',
      no_transaksi: noTransaksi,
      item: itemCreated
    };
  });
}

/**
 * biaya.delete — Membatalkan pencatatan biaya operasional (Hanya Owner & Admin).
 */
function aksiBiayaDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID biaya wajib diberikan.');

  return denganKunci_(function () {
    const item = cariById_('Biaya', p.id);
    if (!item || item.deleted) gagal_(KODE.NOT_FOUND, 'Data biaya tidak ditemukan.');

    // Soft delete menggunakan hapusLunak_
    hapusLunak_('Biaya', item.id, ctx.user.id);

    catatAudit_(ctx.user.id, 'biaya_delete', 'BIAYA', item.no_transaksi || item.id, {
      kategori: item.kategori,
      nominal: item.nominal,
      alasan: p.alasan || 'Dibatalkan oleh ' + ctx.user.username
    });

    return {
      pesan: 'Biaya ' + (item.no_transaksi || item.id) + ' berhasil dibatalkan.',
      id: item.id
    };
  });
}

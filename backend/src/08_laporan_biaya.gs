/* ========================================================================== */
/* 9.6 FASE 6: DASHBOARD & LAPORAN USAHA                                      */
/* ========================================================================== */

/** Helper: Konversi atau hitung rentang tanggal YYYY-MM-DD secara konsisten (WIB Asia/Jakarta). */
function hitungRentangTanggal_(dari, sampai, periode) {
  const sekarang = new Date();
  const formatTgl = function (d) {
    return formatWaktu_(d).substring(0, 10);
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
    return { dari: hariIni.substring(0, 7) + '-01', sampai: hariIni };
  } else if (periode === 'tahun_ini') {
    return { dari: hariIni.substring(0, 4) + '-01-01', sampai: hariIni };
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
  const returByTgl = {};
  const returByPel = {};
  const returByJual = {};
  let totalReturJual = 0;

  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui') return;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      const nom = Number(rt.total) || 0;
      returIdSet[rt.id] = true;
      totalReturJual += nom;
      returByTgl[tgl] = (returByTgl[tgl] || 0) + nom;
      if (rt.pihak_id) returByPel[rt.pihak_id] = (returByPel[rt.pihak_id] || 0) + nom;
      if (rt.ref_id) returByJual[rt.ref_id] = (returByJual[rt.ref_id] || 0) + nom;
    }
  });

  let totalReturHpp = 0;
  let totalReturQty = 0;
  const returItems = [];
  if (Object.keys(returIdSet).length > 0) {
    bacaSemua_('Retur_Item').forEach(function (it) {
      if (it.deleted || !returIdSet[it.retur_id]) return;
      totalReturHpp += hitungTotalHppItem_(it);
      totalReturQty += (Number(it.qty_dasar) || Number(it.qty) || 0);
      returItems.push(it);
    });
  }

  return {
    total_retur_jual: Math.round(totalReturJual),
    total_retur_hpp: Math.round(totalReturHpp),
    total_retur_qty: bulatQty_(totalReturQty),
    dampak_laba_retur: Math.round(totalReturJual - totalReturHpp),
    retur_items: returItems,
    retur_by_tgl: returByTgl,
    retur_by_pelanggan: returByPel,
    retur_by_jual: returByJual
  };
}

/**
 * Helper bersama: menghitung total retur pembelian disetujui dalam rentang tanggal (dan per tanggal).
 */
function hitungEfekReturPembelian_(rentang) {
  const semuaRetur = bacaSemua_('Retur');
  let totalReturBeli = 0;
  const returByTgl = {};
  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'beli' || rt.status !== 'disetujui') return;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      const nom = Number(rt.total) || 0;
      totalReturBeli += nom;
      returByTgl[tgl] = (returByTgl[tgl] || 0) + nom;
    }
  });
  return {
    total_retur_beli: Math.round(totalReturBeli),
    retur_by_tgl: returByTgl
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

    totalItemTerjual += qty;
    totalHpp += hitungTotalHppItem_(it);

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

  // Hitung Laba Kotor, Efek Retur Penjualan & Pembelian, Kerugian Barang Rusak & Biaya Operasional (100% sinkron lintas semua laporan)
  const efekRetur = hitungEfekReturPenjualan_(rentang);
  const efekReturBeli = hitungEfekReturPembelian_(rentang);

  // Kurangkan item retur penjualan dari agregasi produkTerlaris & totalItemTerjual agar ranking 100% bersih
  efekRetur.retur_items.forEach(function (ri) {
    const qtyR = Number(ri.qty_dasar) || Number(ri.qty) || 0;
    const subR = Number(ri.subtotal) || 0;
    const key = ri.produk_id || ri.nama;
    if (produkAgg[key]) {
      produkAgg[key].qty_terjual = Math.max(0, bulatQty_(produkAgg[key].qty_terjual - qtyR));
      produkAgg[key].total_omset = Math.max(0, Math.round(produkAgg[key].total_omset - subR));
    }
  });
  const produkTerlarisBersih = Object.values(produkAgg)
    .filter(function (x) { return x.qty_terjual > 0 || x.total_omset > 0; })
    .sort(function (a, b) { return b.qty_terjual - a.qty_terjual; })
    .slice(0, 10);

  // Kurangkan retur penjualan dari agregasi pelangganTerbaik
  Object.keys(efekRetur.retur_by_pelanggan).forEach(function (pid) {
    if (memberAgg[pid]) {
      memberAgg[pid].total_belanja = Math.max(0, Math.round(memberAgg[pid].total_belanja - efekRetur.retur_by_pelanggan[pid]));
    }
  });
  const pelangganTerbaikBersih = Object.values(memberAgg)
    .filter(function (m) { return m.total_belanja > 0; })
    .sort(function (a, b) { return b.total_belanja - a.total_belanja; })
    .slice(0, 10);

  // Kurangkan retur penjualan & pembelian dari grafik tren harian
  Object.keys(efekRetur.retur_by_tgl).forEach(function (tgl) {
    if (trenPeta[tgl]) {
      trenPeta[tgl].penjualan = Math.max(0, Math.round(trenPeta[tgl].penjualan - efekRetur.retur_by_tgl[tgl]));
    }
  });
  Object.keys(efekReturBeli.retur_by_tgl).forEach(function (tgl) {
    if (trenPeta[tgl]) {
      trenPeta[tgl].pembelian = Math.max(0, Math.round(trenPeta[tgl].pembelian - efekReturBeli.retur_by_tgl[tgl]));
    }
  });
  const trenBersih = Object.values(trenPeta).sort(function (a, b) {
    return a.tanggal.localeCompare(b.tanggal);
  });

  // Hitung transaksi aktif (tidak menghitung nota yang diretur penuh)
  let countDireturPenuh = 0;
  penjualanFinal.forEach(function (j) {
    const tot = Number(j.total) || 0;
    const rTot = efekRetur.retur_by_jual[j.id] || 0;
    if (tot > 0 && rTot >= tot) countDireturPenuh += 1;
  });

  const totalPenjualanBersih = Math.max(0, Math.round(totalPenjualan - efekRetur.total_retur_jual));
  const totalPembelianBersih = Math.max(0, Math.round(totalPembelian - efekReturBeli.total_retur_beli));
  const totalItemTerjualBersih = Math.max(0, bulatQty_(totalItemTerjual - efekRetur.total_retur_qty));
  const totalTransaksiBersih = Math.max(0, penjualanFinal.length - countDireturPenuh);

  const semuaBiaya = bacaSemua_('Biaya');
  let totalBiayaOperasional = 0;
  semuaBiaya.forEach(function (b) {
    if (b.deleted || b.status === 'batal') return;
    const tgl = String(b.tanggal || b.created_at || '').substring(0, 10);
    if (tgl >= rentang.dari && tgl <= rentang.sampai) {
      totalBiayaOperasional += (Number(b.nominal) || 0);
    }
  });

  let totalKerugianRusak = 0;
  try {
    bacaSemua_('Barang_Rusak').forEach(function (rsk) {
      if (rsk.deleted || rsk.status !== 'disetujui' || rsk.klaim_status === 'diganti_barang') return;
      const tgl = String(rsk.tanggal || rsk.created_at || '').substring(0, 10);
      if (tgl >= rentang.dari && tgl <= rentang.sampai) {
        totalKerugianRusak += (Number(rsk.nilai_kerugian) || 0);
      }
    });
  } catch (_) {}

  const labaKotor = isOwner ? Math.round((totalPenjualan - totalHpp) - efekRetur.dampak_laba_retur) : null;
  const marginPersen = isOwner ? (totalPenjualanBersih > 0 ? Math.round((labaKotor / totalPenjualanBersih) * 10000) / 100 : 0) : null;
  const labaBersihRiil = isOwner ? Math.round((labaKotor || 0) - totalBiayaOperasional - totalKerugianRusak) : null;
  const marginBersihPersen = isOwner ? (totalPenjualanBersih > 0 ? Math.round((labaBersihRiil / totalPenjualanBersih) * 10000) / 100 : 0) : null;

  return {
    rentang: rentang,
    ringkasan: {
      total_penjualan: totalPenjualanBersih,
      total_penjualan_kotor: Math.round(totalPenjualan),
      subtotal_penjualan: totalSubtotalPenjualan,
      diskon_penjualan: totalDiskonPenjualan,
      pajak_penjualan: totalPajakPenjualan,
      total_transaksi: totalTransaksiBersih,
      total_item_terjual: totalItemTerjualBersih,
      total_pembelian: totalPembelianBersih,
      total_pembelian_kotor: Math.round(totalPembelian),
      total_retur_pembelian: efekReturBeli.total_retur_beli,
      total_faktur_beli: pembelianRentang.length,
      total_piutang_aktif: totalPiutangAktif,
      count_piutang_aktif: countPiutangAktif,
      total_hutang_aktif: totalHutangAktif,
      count_hutang_aktif: countHutangAktif,
      total_nilai_aset_stok: isOwner ? Math.round(totalAsetStok) : null,
      total_retur_penjualan: efekRetur.total_retur_jual,
      laba_kotor: labaKotor,
      margin_persen: marginPersen,
      total_biaya_operasional: totalBiayaOperasional,
      total_kerugian_rusak: isOwner ? Math.round(totalKerugianRusak) : null,
      laba_bersih_riil: labaBersihRiil,
      margin_bersih_persen: marginBersihPersen
    },
    produk_terlaris: produkTerlarisBersih,
    pelanggan_terbaik: pelangganTerbaikBersih,
    stok_kritis: stokKritis.slice(0, 15),
    metode_bayar: metodeBayarAgg,
    tren: trenBersih
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

  // Map HPP snapshot item jika Owner & Map Retur Penjualan Disetujui per Nota
  const semuaItems = isOwner ? bacaSemua_('Penjualan_Item') : [];
  const hppByJual = {};
  const itemCountByJual = {};
  if (isOwner) {
    semuaItems.forEach(function (it) {
      if (it.deleted) return;
      hppByJual[it.penjualan_id] = (hppByJual[it.penjualan_id] || 0) + hitungTotalHppItem_(it);
      itemCountByJual[it.penjualan_id] = (itemCountByJual[it.penjualan_id] || 0) + 1;
    });
  }

  const semuaReturJual = bacaSemua_('Retur').filter(function (rt) {
    return !rt.deleted && rt.tipe === 'jual' && rt.status === 'disetujui';
  });
  const returIdToJual = {};
  const returByJual = {};
  semuaReturJual.forEach(function (rt) {
    if (!rt.ref_id) return;
    returIdToJual[rt.id] = rt.ref_id;
    if (!returByJual[rt.ref_id]) {
      returByJual[rt.ref_id] = { total_retur: 0, retur_hpp: 0, no_retur_list: [] };
    }
    returByJual[rt.ref_id].total_retur += (Number(rt.total) || 0);
    if (rt.no_retur) returByJual[rt.ref_id].no_retur_list.push(rt.no_retur);
  });
  if (isOwner && semuaReturJual.length > 0) {
    bacaSemua_('Retur_Item').forEach(function (ri) {
      if (ri.deleted) return;
      const jualId = returIdToJual[ri.retur_id];
      if (!jualId || !returByJual[jualId]) return;
      returByJual[jualId].retur_hpp += hitungTotalHppItem_(ri);
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
    if (p.status_bayar === 'diretur') {
      const infoR = returByJual[j.id];
      if (!infoR || infoR.total_retur <= 0) return false;
    } else if (p.status_bayar === 'aktif_bersih') {
      const infoR = returByJual[j.id];
      const totR = infoR ? infoR.total_retur : 0;
      if (j.status === 'void' || (Number(j.total || 0) > 0 && totR >= Number(j.total || 0))) return false;
    } else if (p.status_bayar && j.status_bayar !== p.status_bayar) {
      return false;
    }

    return true;
  });

  // Urutkan transaksi terbaru lebih dahulu
  filtered.sort(function (a, b) {
    return new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0);
  });

  let totalOmsetKotor = 0;
  let totalRetur = 0;
  let totalOmset = 0;
  let totalDiskon = 0;
  let totalPajak = 0;
  let totalLaba = 0;
  let totalTransaksiAktif = 0;
  let totalVoid = 0;
  let totalDireturPenuh = 0;
  let totalDireturSebagian = 0;

  const items = filtered.map(function (j) {
    const total = Number(j.total) || 0;
    const diskon = Number(j.diskon) || 0;
    const pajak = Number(j.pajak) || 0;
    const isVoid = j.status === 'void';
    const isAktif = !isVoid && j.status !== 'pending';
    const infoR = returByJual[j.id] || { total_retur: 0, retur_hpp: 0, no_retur_list: [] };
    const returNota = isAktif ? Math.min(total, Math.round(infoR.total_retur || 0)) : 0;
    const totalBersih = isAktif ? Math.max(0, total - returNota) : 0;
    const statusRetur = returNota <= 0 ? '' : (returNota >= total && total > 0 ? 'penuh' : 'sebagian');

    if (isAktif) {
      totalOmsetKotor += total;
      totalRetur += returNota;
      totalOmset += totalBersih;
      if (statusRetur === 'penuh') {
        totalDireturPenuh += 1;
      } else {
        totalDiskon += diskon;
        totalPajak += pajak;
        totalTransaksiAktif += 1;
        if (statusRetur === 'sebagian') totalDireturSebagian += 1;
      }
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
      total_retur: returNota,
      total_bersih: totalBersih,
      status_retur: statusRetur,
      daftar_no_retur: infoR.no_retur_list,
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
      const returHpp = isAktif ? Math.round(infoR.retur_hpp || 0) : 0;
      const dampakLabaRetur = returNota - returHpp;
      const laba = isAktif ? (statusRetur === 'penuh' ? 0 : Math.round((total - hppTot) - dampakLabaRetur)) : 0;
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
      total_omset_kotor: totalOmsetKotor,
      total_retur: totalRetur,
      total_diskon: totalDiskon,
      total_pajak: totalPajak,
      total_transaksi: totalTransaksiAktif,
      total_void: totalVoid,
      total_diretur_penuh: totalDireturPenuh,
      total_diretur_sebagian: totalDireturSebagian,
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

  // Ambil sisa hutang riil dari sheet Hutang & Map Retur Pembelian Disetujui per Faktur
  const hutangByBeli = {};
  bacaSemua_('Hutang').forEach(function (h) {
    if (!h.deleted && h.pembelian_id) {
      hutangByBeli[h.pembelian_id] = h;
    }
  });

  const returByBeli = {};
  bacaSemua_('Retur').forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'beli' || rt.status !== 'disetujui' || !rt.ref_id) return;
    if (!returByBeli[rt.ref_id]) {
      returByBeli[rt.ref_id] = { total_retur: 0, no_retur_list: [] };
    }
    returByBeli[rt.ref_id].total_retur += (Number(rt.total) || 0);
    if (rt.no_retur) returByBeli[rt.ref_id].no_retur_list.push(rt.no_retur);
  });

  let filtered = semuaPembelian.filter(function (pb) {
    if (pb.deleted || pb.status === 'batal') return false;
    const tgl = String(pb.tanggal || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return false;

    if (p.supplier_id && pb.supplier_id !== p.supplier_id) return false;
    if (p.status_bayar === 'diretur') {
      const infoRB = returByBeli[pb.id];
      if (!infoRB || infoRB.total_retur <= 0) return false;
    } else if (p.status_bayar && pb.status_bayar !== p.status_bayar) {
      return false;
    }

    return true;
  });

  filtered.sort(function (a, b) {
    return new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0);
  });

  let totalBeliKotor = 0;
  let totalReturBeli = 0;
  let totalBeli = 0;
  let totalDiskon = 0;
  let totalBayar = 0;
  let totalSisaHutang = 0;
  let totalDireturPenuh = 0;

  const items = filtered.map(function (pb) {
    const total = Number(pb.total) || 0;
    const diskon = Number(pb.diskon) || 0;
    const bayar = Number(pb.bayar) || 0;
    const infoRB = returByBeli[pb.id] || { total_retur: 0, no_retur_list: [] };
    const returFaktur = Math.min(total, Math.round(infoRB.total_retur || 0));
    const totalBersih = Math.max(0, total - returFaktur);
    const statusRetur = returFaktur <= 0 ? '' : (returFaktur >= total && total > 0 ? 'penuh' : 'sebagian');
    const htTerkait = hutangByBeli[pb.id];
    const sisa = htTerkait
      ? (htTerkait.status === 'lunas' ? 0 : Math.max(0, Number(htTerkait.sisa) || 0))
      : (pb.status_bayar === 'lunas' ? 0 : Math.max(0, totalBersih - bayar));

    totalBeliKotor += total;
    totalReturBeli += returFaktur;
    totalBeli += totalBersih;
    if (statusRetur === 'penuh') {
      totalDireturPenuh += 1;
    } else {
      totalDiskon += diskon;
    }
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
      total_retur: returFaktur,
      total_bersih: totalBersih,
      status_retur: statusRetur,
      daftar_no_retur: infoRB.no_retur_list,
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
      total_pembelian_kotor: totalBeliKotor,
      total_retur: totalReturBeli,
      total_diretur_penuh: totalDireturPenuh,
      total_diskon: totalDiskon,
      total_terbayar: totalBayar,
      total_sisa_hutang: totalSisaHutang,
      total_faktur: Math.max(0, filtered.length - totalDireturPenuh)
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
    const hppItemTotal = hitungTotalHppItem_(it);
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

  // Hitung Nilai Retur Penjualan & HPP Barang Kembali ke Stok (100% sinkron dengan Dashboard & Laporan Penjualan)
  const efekRetur = hitungEfekReturPenjualan_(rentang);
  const totalReturJual = efekRetur.total_retur_jual;
  const totalReturHpp = efekRetur.total_retur_hpp;
  const dampakLabaRetur = efekRetur.dampak_laba_retur;

  // Kurangkan item retur dari analisis kategori & produk margin teratas
  efekRetur.retur_items.forEach(function (ri) {
    const qtyR = Number(ri.qty_dasar) || Number(ri.qty) || 0;
    const subR = Number(ri.subtotal) || 0;
    const hppR = hitungTotalHppItem_(ri);
    const labaR = subR - hppR;

    const katId = prodKatMap[ri.produk_id] || 'tanpa_kategori';
    if (katAgg[katId]) {
      katAgg[katId].omset = Math.max(0, Math.round(katAgg[katId].omset - subR));
      katAgg[katId].hpp = Math.max(0, Math.round(katAgg[katId].hpp - hppR));
      katAgg[katId].laba = Math.round(katAgg[katId].laba - labaR);
    }

    const key = ri.produk_id || ri.nama;
    if (itemMarginAgg[key]) {
      itemMarginAgg[key].qty = Math.max(0, bulatQty_(itemMarginAgg[key].qty - qtyR));
      itemMarginAgg[key].omset = Math.max(0, Math.round(itemMarginAgg[key].omset - subR));
      itemMarginAgg[key].hpp = Math.max(0, Math.round(itemMarginAgg[key].hpp - hppR));
      itemMarginAgg[key].laba = Math.round(itemMarginAgg[key].laba - labaR);
    }
  });

  const omsetSebelumRetur = omsetBersih;
  const omsetBersihSetelahRetur = Math.max(0, Math.round(omsetSebelumRetur - totalReturJual));
  const totalHppBersih = Math.max(0, Math.round(totalHpp - totalReturHpp));
  const labaKotorKotor = Math.round(omsetSebelumRetur - totalHpp);
  const labaKotorBersih = Math.round(labaKotorKotor - dampakLabaRetur);
  const marginPersen = omsetBersihSetelahRetur > 0 ? Math.round((labaKotorBersih / omsetBersihSetelahRetur) * 10000) / 100 : 0;

  // Format array kategori (hanya yang memiliki aktivitas bersih)
  const kategoriList = Object.values(katAgg)
    .filter(function (k) { return k.omset > 0 || k.laba !== 0; })
    .map(function (k) {
      k.margin_persen = k.omset > 0 ? Math.round((k.laba / k.omset) * 10000) / 100 : 0;
      return k;
    }).sort(function (a, b) { return b.laba - a.laba; });

  // Format array produk (Top 10 Laba Tertinggi bersih setelah retur)
  const produkLabaTertinggi = Object.values(itemMarginAgg)
    .filter(function (it) { return it.qty > 0 || it.omset > 0; })
    .map(function (it) {
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

  // Hitung Kerugian Barang Rusak / Susut disetujui (bukan yang sudah diganti supplier)
  let totalKerugianRusak = 0;
  bacaSemua_('Barang_Rusak').forEach(function (rsk) {
    if (rsk.deleted || rsk.status !== 'disetujui') return;
    if (rsk.klaim_status === 'diganti_barang') return;
    const tglR = String(rsk.tanggal || rsk.created_at || '').substring(0, 10);
    if (tglR >= rentang.dari && tglR <= rentang.sampai) {
      totalKerugianRusak += Math.round(Number(rsk.nilai_kerugian) || 0);
    }
  });

  const labaBersihRiil = Math.round(labaKotorBersih - totalBiayaOperasional - totalKerugianRusak);
  const marginBersihPersen = omsetBersihSetelahRetur > 0 ? Math.round((labaBersihRiil / omsetBersihSetelahRetur) * 10000) / 100 : 0;

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
      omset_sebelum_retur: omsetSebelumRetur,
      omset_bersih: omsetBersihSetelahRetur,
      total_hpp: totalHpp,
      total_hpp_bersih: totalHppBersih,
      laba_kotor_sebelum_retur: labaKotorKotor,
      total_retur_penjualan: totalReturJual,
      total_retur_hpp: totalReturHpp,
      dampak_laba_retur: dampakLabaRetur,
      laba_kotor_bersih: labaKotorBersih,
      margin_persen: marginPersen,
      total_biaya_operasional: totalBiayaOperasional,
      total_kerugian_rusak: totalKerugianRusak,
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

  // 3. Refund Retur Penjualan (Kas Keluar) & Refund Retur Pembelian dari Supplier (Kas Masuk)
  const semuaRetur = bacaSemua_('Retur');
  let keluarRefundRetur = 0;
  let keluarRefundReturBank = 0;
  let masukRefundReturBeliTunai = 0;
  let masukRefundReturBeliBank = 0;
  semuaRetur.forEach(function (rt) {
    if (rt.deleted || rt.status !== 'disetujui') return;
    const tgl = String(rt.tanggal || '').substring(0, 10);
    if (tgl < rentang.dari || tgl > rentang.sampai) return;
    const nom = Number(rt.total) || 0;
    const mr = String(rt.metode_refund || '').toLowerCase();
    if (rt.tipe === 'jual') {
      if (mr === 'kas') keluarRefundRetur += nom;
      else if (mr === 'transfer') keluarRefundReturBank += nom;
    } else if (rt.tipe === 'beli') {
      if (mr === 'kas') masukRefundReturBeliTunai += nom;
      else if (mr === 'transfer') masukRefundReturBeliBank += nom;
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

  const totalMasukTunai = masukJualTunai + masukPiutangTunai + masukDepositTunai + masukRefundReturBeliTunai;
  const totalMasukBank = masukJualTransfer + masukPiutangTransfer + masukJualQris + masukPiutangQris + masukDepositBank + masukRefundReturBeliBank;
  const totalKasMasuk = totalMasukTunai + totalMasukBank;

  const totalKeluarTunai = keluarBeliTunai + keluarHutangTunai + keluarRefundRetur + keluarBiayaTunai + keluarDepositTunai;
  const totalKeluarBank = keluarBeliTransfer + keluarHutangTransfer + keluarRefundReturBank + keluarBiayaBank + keluarDepositBank;
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
      refund_retur_beli_tunai: masukRefundReturBeliTunai,
      refund_retur_beli_bank: masukRefundReturBeliBank,
      subtotal_tunai: totalMasukTunai,
      subtotal_bank: totalMasukBank
    },
    rincian_keluar: {
      pembelian_tunai: keluarBeliTunai,
      pembelian_transfer: keluarBeliTransfer,
      hutang_tunai: keluarHutangTunai,
      hutang_transfer: keluarHutangTransfer,
      refund_retur_tunai: keluarRefundRetur,
      refund_retur_bank: keluarRefundReturBank,
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
  let totalUnitToko = 0;
  let totalUnitGudang = 0;
  let totalAsetStok = 0;
  let countHabis = 0;
  let countKritis = 0;
  let countAman = 0;

  semuaProduk.forEach(function (pdk) {
    if (pdk.deleted || !pdk.aktif) return;
    const katNama = katMap[pdk.kategori_id] || 'Umum';

    if (pdk.punya_varian && varianByProduk[pdk.id] && varianByProduk[pdk.id].length > 0) {
      varianByProduk[pdk.id].forEach(function (v) {
        const lv = bacaStokLokasi_(v);
        const s = lv.stok;
        const sMin = Number(v.stok_min) || 0;
        const h = Number(v.hpp) || 0;
        const nilai = s * h;
        totalUnitStok += s;
        totalUnitToko += lv.stok_toko;
        totalUnitGudang += lv.stok_gudang;
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
          stok_toko: lv.stok_toko,
          stok_gudang: lv.stok_gudang,
          stok_min: sMin,
          hpp: h,
          nilai_aset: nilai,
          status: status
        });
      });
    } else {
      const lp = bacaStokLokasi_(pdk);
      const s = lp.stok;
      const sMin = Number(pdk.stok_min) || 0;
      const h = Number(pdk.hpp) || 0;
      const nilai = s * h;
      totalUnitStok += s;
      totalUnitToko += lp.stok_toko;
      totalUnitGudang += lp.stok_gudang;
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
        stok_toko: lp.stok_toko,
        stok_gudang: lp.stok_gudang,
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
      total_unit_toko: bulatQty_(totalUnitToko),
      total_unit_gudang: bulatQty_(totalUnitGudang),
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
    cekPeriodeTerkunci_(waktuSkrg);

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
    cekPeriodeTerkunci_(item.tanggal || item.created_at || sekarang_());

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

/* ========================================================================== */
/* TUTUP HARIAN (EOD) & TUTUP BUKU BULANAN + EVALUASI ANALISA                 */
/* ========================================================================== */

/** Helper: Hitung tanggal awal & akhir sebuah bulan YYYY-MM */
function rentangBulan_(ymStr) {
  const parts = String(ymStr || '').split('-');
  const tahun = parseInt(parts[0], 10);
  const bulan = parseInt(parts[1], 10);
  if (!isFinite(tahun) || !isFinite(bulan) || bulan < 1 || bulan > 12) {
    gagal_(KODE.VALIDATION, 'Format bulan wajib YYYY-MM (contoh: 2026-11).');
  }
  const mm = ('0' + bulan).slice(-2);
  const hariAkhir = new Date(tahun, bulan, 0).getDate();
  const ddAkhir = ('0' + hariAkhir).slice(-2);
  return {
    periode: tahun + '-' + mm,
    dari: tahun + '-' + mm + '-01',
    sampai: tahun + '-' + mm + '-' + ddAkhir,
    tahun: tahun,
    bulan: bulan
  };
}

/** Helper: Bulan sebelumnya dari YYYY-MM */
function bulanSebelumnya_(ymStr) {
  const r = rentangBulan_(ymStr);
  let y = r.tahun;
  let m = r.bulan - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + ('0' + m).slice(-2);
}

/** Helper: Hitung persentase pertumbuhan MoM aman */
function hitungMoM_(sekarangVal, laluVal) {
  const cur = Number(sekarangVal) || 0;
  const prev = Number(laluVal) || 0;
  if (prev === 0) return cur > 0 ? 100 : (cur < 0 ? -100 : 0);
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

/**
 * tutupBuku.rekapHarian — Rekap gabungan End-of-Day (EOD) seluruh shift & transaksi pada 1 tanggal.
 */
function aksiTutupBukuRekapHarian_(ctx) {
  const p = ctx.payload || {};
  const tanggal = (p.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(String(p.tanggal).trim()))
    ? String(p.tanggal).trim()
    : sekarang_().substring(0, 10);

  const semuaShift = bacaSemua_('Shift_Kasir').filter(function (s) {
    if (s.deleted) return false;
    return String(s.waktu_buka || '').substring(0, 10) === tanggal;
  });

  const shiftAktifHariIni = semuaShift.filter(function (s) { return s.status === 'aktif'; });
  const shiftSelesaiHariIni = semuaShift.filter(function (s) { return s.status === 'tutup'; });

  const semuaPending = bacaSemua_('Penjualan').filter(function (j) {
    return !j.deleted && j.status === 'pending';
  });

  const lr = aksiLaporanLabaRugi_({ user: ctx.user, payload: { dari: tanggal, sampai: tanggal } });
  const ak = aksiLaporanArusKas_({ user: ctx.user, payload: { dari: tanggal, sampai: tanggal } });

  const penjualanHari = bacaSemua_('Penjualan').filter(function (j) {
    return !j.deleted && j.status === 'final' && String(j.tanggal || '').substring(0, 10) === tanggal;
  });

  let totalModalAwal = 0;
  let totalKasSistem = 0;
  let totalKasFisik = 0;
  let totalSelisih = 0;
  let totalTunaiShift = 0;
  let totalTransferShift = 0;
  let totalTempoShift = 0;
  let totalBiayaKasirShift = 0;

  semuaShift.forEach(function (s) {
    totalModalAwal += Number(s.modal_awal || 0);
    if (s.status === 'tutup') {
      totalKasSistem += Number(s.kas_sistem || 0);
      totalKasFisik += Number(s.kas_fisik || 0);
      totalSelisih += Number(s.selisih || 0);
      totalTunaiShift += Number(s.total_tunai || 0);
      totalTransferShift += Number(s.total_transfer || 0);
      totalTempoShift += Number(s.total_tempo || 0);
      totalBiayaKasirShift += Number(s.total_biaya_kasir || 0);
    } else {
      const live = hitungRekapShiftKasir_(s.kasir_id, {
        shiftId: s.id,
        waktuMulai: s.waktu_buka,
        waktuSelesai: sekarang_(),
        targetTgl: tanggal,
        modalAwal: Number(s.modal_awal || 0),
        fallbackUser: { id: s.kasir_id, nama: s.kasir_nama }
      });
      totalKasSistem += Number(live.total_laci || 0);
      totalTunaiShift += Number(live.total_tunai || 0);
      totalTransferShift += Number(live.total_transfer || 0);
      totalTempoShift += Number(live.total_tempo || 0);
      totalBiayaKasirShift += Number(live.total_biaya_kasir || 0);
    }
  });

  // Cek apakah sudah pernah ditutup harian
  const arsipEks = bacaSemua_('Tutup_Buku').filter(function (tb) {
    return !tb.deleted && tb.tipe === 'harian' && tb.periode === tanggal;
  })[0] || null;

  return {
    tanggal: tanggal,
    sudah_tutup_harian: Boolean(arsipEks),
    arsip: arsipEks,
    precheck: {
      shift_aktif_count: shiftAktifHariIni.length,
      shift_selesai_count: shiftSelesaiHariIni.length,
      shift_aktif_list: shiftAktifHariIni.map(function (s) {
        return { id: s.id, no_shift: s.no_shift, kasir_nama: s.kasir_nama, waktu_buka: s.waktu_buka };
      }),
      pending_count: semuaPending.length
    },
    ringkasan: {
      total_transaksi: penjualanHari.length,
      omset_kotor: lr.ringkasan.omset_kotor,
      total_diskon: lr.ringkasan.total_diskon,
      omset_bersih: lr.ringkasan.omset_bersih,
      total_hpp: lr.ringkasan.total_hpp,
      laba_kotor: lr.ringkasan.laba_kotor_bersih,
      total_biaya: lr.ringkasan.total_biaya_operasional,
      total_kerugian_rusak: lr.ringkasan.total_kerugian_rusak || 0,
      laba_bersih: lr.ringkasan.laba_bersih_riil,
      arus_kas_masuk: ak.ringkasan.total_kas_masuk,
      arus_kas_keluar: ak.ringkasan.total_kas_keluar,
      arus_kas_bersih: ak.ringkasan.arus_kas_bersih,
      total_modal_awal: totalModalAwal,
      total_tunai: totalTunaiShift,
      total_transfer: totalTransferShift,
      total_tempo: totalTempoShift,
      total_biaya_kasir: totalBiayaKasirShift,
      total_kas_sistem: totalKasSistem,
      total_kas_fisik: totalKasFisik,
      total_selisih: totalSelisih
    },
    shifts: semuaShift.map(function (s) {
      return {
        id: s.id,
        no_shift: s.no_shift,
        kasir_nama: s.kasir_nama,
        status: s.status,
        waktu_buka: s.waktu_buka,
        waktu_tutup: s.waktu_tutup,
        modal_awal: Number(s.modal_awal || 0),
        total_penjualan: Number(s.total_penjualan || 0),
        kas_sistem: Number(s.kas_sistem || 0),
        kas_fisik: Number(s.kas_fisik || 0),
        selisih: Number(s.selisih || 0)
      };
    })
  };
}

/**
 * tutupBuku.tutupHarian — Simpan arsip Tutup Harian (EOD), setoran ke Owner, & sisa modal besok.
 */
function aksiTutupBukuTutupHarian_(ctx) {
  const p = ctx.payload || {};
  const tanggal = (p.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(String(p.tanggal).trim()))
    ? String(p.tanggal).trim()
    : sekarang_().substring(0, 10);

  cekPeriodeTerkunci_(tanggal);

  const rekap = aksiTutupBukuRekapHarian_({ user: ctx.user, payload: { tanggal: tanggal } });
  if (rekap.precheck.shift_aktif_count > 0) {
    gagal_(KODE.CONFLICT, 'Masih ada ' + rekap.precheck.shift_aktif_count + ' shift kasir yang belum ditutup hari ini (' +
      rekap.precheck.shift_aktif_list.map(function (s) { return s.no_shift + ' - ' + s.kasir_nama; }).join(', ') +
      '). Tutup semua shift kasir terlebih dahulu sebelum Tutup Harian.');
  }

  const setoranOwner = Math.round(V_.nonNegatif(p.setoran_owner, 'Setoran ke Owner', { bawaan: 0 }));
  const sisaModalBesok = Math.round(V_.nonNegatif(p.sisa_modal_besok, 'Sisa Modal untuk Besok', { bawaan: 0 }));
  const catatan = V_.teks(p.catatan || '', 'Catatan Tutup Harian', { maks: 500 });
  const waktu = sekarang_();
  const namaPenutup = ctx.user.nama || ctx.user.username || 'User';
  const r = rekap.ringkasan;

  const dataRow = {
    periode: tanggal,
    tipe: 'harian',
    status: 'selesai',
    waktu_tutup: waktu,
    ditutup_oleh: ctx.user.id,
    ditutup_oleh_nama: namaPenutup,
    omset_kotor: r.omset_kotor,
    total_diskon: r.total_diskon,
    omset_bersih: r.omset_bersih,
    total_hpp: r.total_hpp,
    laba_kotor: r.laba_kotor,
    total_biaya: r.total_biaya,
    laba_bersih: r.laba_bersih,
    margin_persen: r.omset_bersih > 0 ? Math.round((r.laba_kotor / r.omset_bersih) * 10000) / 100 : 0,
    total_transaksi: r.total_transaksi,
    total_pembelian: 0,
    arus_kas_masuk: r.arus_kas_masuk,
    arus_kas_keluar: r.arus_kas_keluar,
    arus_kas_bersih: r.arus_kas_bersih,
    saldo_piutang: 0,
    saldo_hutang: 0,
    valuasi_stok: 0,
    selisih_shift: r.total_selisih,
    setoran_owner: setoranOwner,
    sisa_modal_besok: sisaModalBesok,
    catatan: catatan,
    snapshot_json: { shifts: rekap.shifts, ringkasan: r }
  };

  let tersimpan;
  if (rekap.arsip && rekap.arsip.id) {
    tersimpan = ubahBaris_('Tutup_Buku', [{ id: rekap.arsip.id, data: dataRow }], ctx.user.id)[0];
  } else {
    tersimpan = tambahBaris_('Tutup_Buku', [dataRow], ctx.user.id)[0];
  }

  catatAudit_(ctx.user.id, 'tutup_harian', 'TUTUP_BUKU', tanggal, {
    omset_bersih: r.omset_bersih,
    laba_bersih: r.laba_bersih,
    selisih_shift: r.total_selisih,
    setoran_owner: setoranOwner,
    sisa_modal_besok: sisaModalBesok
  });

  return {
    pesan: 'Tutup Harian tanggal ' + tanggal + ' berhasil disimpan.',
    arsip: tersimpan,
    ringkasan: r
  };
}

/** Helper internal: Hitung KPI lengkap satu bulan YYYY-MM */
function hitungMetrikSatuBulan_(ctx, ymStr) {
  const rBln = rentangBulan_(ymStr);
  const lr = aksiLaporanLabaRugi_({ user: ctx.user, payload: { dari: rBln.dari, sampai: rBln.sampai } });
  const ak = aksiLaporanArusKas_({ user: ctx.user, payload: { dari: rBln.dari, sampai: rBln.sampai } });

  const semuaPenjualan = bacaSemua_('Penjualan').filter(function (j) {
    if (j.deleted || j.status !== 'final') return false;
    const t = String(j.tanggal || '').substring(0, 10);
    return t >= rBln.dari && t <= rBln.sampai;
  });
  const idJualSet = {};
  semuaPenjualan.forEach(function (j) { idJualSet[j.id] = true; });

  const semuaPembelian = bacaSemua_('Pembelian').filter(function (pb) {
    if (pb.deleted || pb.status === 'batal') return false;
    const t = String(pb.tanggal || '').substring(0, 10);
    return t >= rBln.dari && t <= rBln.sampai;
  });
  const efekReturBln = hitungEfekReturPenjualan_({ dari: rBln.dari, sampai: rBln.sampai });
  const efekReturBeliBln = hitungEfekReturPembelian_({ dari: rBln.dari, sampai: rBln.sampai });
  const totalPembelian = Math.max(0, Math.round(
    semuaPembelian.reduce(function (s, pb) { return s + (Number(pb.total) || 0); }, 0) - efekReturBeliBln.total_retur_beli
  ));

  const semuaShift = bacaSemua_('Shift_Kasir').filter(function (sh) {
    if (sh.deleted) return false;
    const t = String(sh.waktu_buka || '').substring(0, 10);
    return t >= rBln.dari && t <= rBln.sampai;
  });
  const shiftAktifCount = semuaShift.filter(function (s) { return s.status === 'aktif'; }).length;
  const totalSelisihShift = semuaShift.reduce(function (acc, s) { return acc + (s.status === 'tutup' ? (Number(s.selisih) || 0) : 0); }, 0);

  // Hitung produk terjual di bulan ini (bersih setelah retur penjualan, untuk Top 10 & Slow-Moving/Dead Stock)
  const terjualPerProdukId = {};
  const itemTerlarisMap = {};
  bacaSemua_('Penjualan_Item').forEach(function (it) {
    if (it.deleted || !idJualSet[it.penjualan_id]) return;
    if (it.produk_id) terjualPerProdukId[it.produk_id] = (terjualPerProdukId[it.produk_id] || 0) + (Number(it.qty_dasar || it.qty) || 0);
    const k = it.produk_id || it.nama;
    if (!itemTerlarisMap[k]) {
      itemTerlarisMap[k] = { produk_id: it.produk_id || '', nama: it.nama || '-', qty: 0, omset: 0, hpp: 0, laba: 0 };
    }
    const sub = Number(it.subtotal) || 0;
    const hppTot = hitungTotalHppItem_(it);
    itemTerlarisMap[k].qty = bulatQty_(itemTerlarisMap[k].qty + (Number(it.qty) || 0));
    itemTerlarisMap[k].omset += sub;
    itemTerlarisMap[k].hpp += Math.round(hppTot);
    itemTerlarisMap[k].laba += Math.round(sub - hppTot);
  });

  efekReturBln.retur_items.forEach(function (ri) {
    const qtyDasarR = Number(ri.qty_dasar) || Number(ri.qty) || 0;
    if (ri.produk_id && terjualPerProdukId[ri.produk_id]) {
      terjualPerProdukId[ri.produk_id] = Math.max(0, bulatQty_(terjualPerProdukId[ri.produk_id] - qtyDasarR));
    }
    const k = ri.produk_id || ri.nama;
    if (itemTerlarisMap[k]) {
      const subR = Number(ri.subtotal) || 0;
      const hppR = hitungTotalHppItem_(ri);
      itemTerlarisMap[k].qty = Math.max(0, bulatQty_(itemTerlarisMap[k].qty - (Number(ri.qty) || 0)));
      itemTerlarisMap[k].omset = Math.max(0, Math.round(itemTerlarisMap[k].omset - subR));
      itemTerlarisMap[k].hpp = Math.max(0, Math.round(itemTerlarisMap[k].hpp - hppR));
      itemTerlarisMap[k].laba = Math.round(itemTerlarisMap[k].laba - (subR - hppR));
    }
  });

  const topProdukTerlaris = Object.values(itemTerlarisMap)
    .filter(function (x) { return x.qty > 0 || x.omset > 0; })
    .sort(function (a, b) { return b.omset - a.omset; })
    .slice(0, 10);

  // Saldo Piutang, Hutang, Valuasi Stok & Dead Stock (stok > 0, 0 penjualan di bulan ini)
  const saldoPiutang = bacaSemua_('Piutang').reduce(function (acc, pt) {
    return (!pt.deleted && pt.status !== 'lunas') ? acc + (Number(pt.sisa) || 0) : acc;
  }, 0);
  const saldoHutang = bacaSemua_('Hutang').reduce(function (acc, ht) {
    return (!ht.deleted && ht.status !== 'lunas') ? acc + (Number(ht.sisa) || 0) : acc;
  }, 0);

  const varianByProduk = {};
  bacaSemua_('Varian').forEach(function (v) {
    if (v.deleted) return;
    if (!varianByProduk[v.produk_id]) varianByProduk[v.produk_id] = [];
    varianByProduk[v.produk_id].push(v);
  });

  let valuasiStok = 0;
  const deadStockList = [];
  bacaSemua_('Produk').forEach(function (pr) {
    if (pr.deleted || pr.aktif === false) return;
    let stTotal = 0;
    let nilaiModal = 0;
    let hppTampil = Number(pr.hpp) || 0;

    if (pr.punya_varian && varianByProduk[pr.id] && varianByProduk[pr.id].length > 0) {
      varianByProduk[pr.id].forEach(function (v) {
        const sv = Number(v.stok) || 0;
        const hv = Number(v.hpp) || 0;
        if (sv > 0) {
          stTotal += sv;
          nilaiModal += Math.round(sv * hv);
        }
      });
      if (stTotal > 0) hppTampil = Math.round(nilaiModal / stTotal);
    } else {
      const st = Number(pr.stok) || 0;
      const hp = Number(pr.hpp) || 0;
      if (st > 0) {
        stTotal = st;
        nilaiModal = Math.round(st * hp);
      }
    }

    if (stTotal > 0) valuasiStok += nilaiModal;
    if (stTotal > 0 && !terjualPerProdukId[pr.id]) {
      deadStockList.push({
        id: pr.id,
        sku: pr.sku || '-',
        nama: pr.nama || '-',
        satuan: pr.satuan_dasar || 'PCS',
        stok: bulatQty_(stTotal),
        hpp: hppTampil,
        nilai_modal: nilaiModal
      });
    }
  });
  deadStockList.sort(function (a, b) { return b.nilai_modal - a.nilai_modal; });

  return {
    periode: rBln.periode,
    rentang: { dari: rBln.dari, sampai: rBln.sampai },
    ringkasan: {
      omset_kotor: lr.ringkasan.omset_kotor,
      total_diskon: lr.ringkasan.total_diskon,
      omset_bersih: lr.ringkasan.omset_bersih,
      total_hpp: lr.ringkasan.total_hpp,
      laba_kotor: lr.ringkasan.laba_kotor_bersih,
      margin_persen: lr.ringkasan.margin_persen,
      total_biaya: lr.ringkasan.total_biaya_operasional,
      total_kerugian_rusak: lr.ringkasan.total_kerugian_rusak || 0,
      laba_bersih: lr.ringkasan.laba_bersih_riil,
      margin_bersih_persen: lr.ringkasan.margin_bersih_persen,
      total_transaksi: semuaPenjualan.length,
      total_pembelian: totalPembelian,
      arus_kas_masuk: ak.ringkasan.total_kas_masuk,
      arus_kas_keluar: ak.ringkasan.total_kas_keluar,
      arus_kas_bersih: ak.ringkasan.arus_kas_bersih,
      saldo_piutang: saldoPiutang,
      saldo_hutang: saldoHutang,
      valuasi_stok: valuasiStok,
      total_shift: semuaShift.length,
      shift_aktif_count: shiftAktifCount,
      selisih_shift: totalSelisihShift
    },
    top_produk_terlaris: topProdukTerlaris,
    produk_margin_teratas: lr.produk_margin_teratas || [],
    analisis_kategori: lr.analisis_kategori || [],
    analisis_biaya: lr.analisis_biaya || [],
    slow_moving: deadStockList.slice(0, 25),
    total_slow_moving: deadStockList.length,
    nilai_slow_moving: deadStockList.reduce(function (s, d) { return s + d.nilai_modal; }, 0)
  };
}

/**
 * tutupBuku.evaluasiBulanan — Laporan Evaluasi & Analisa Bulanan lengkap dengan perbandingan MoM.
 */
function aksiTutupBukuEvaluasiBulanan_(ctx) {
  const p = ctx.payload || {};
  const ymTarget = (p.periode && /^\d{4}-\d{2}$/.test(String(p.periode).trim()))
    ? String(p.periode).trim()
    : sekarang_().substring(0, 7);
  const ymLalu = bulanSebelumnya_(ymTarget);

  const semuaArsip = bacaSemua_('Tutup_Buku').filter(function (tb) { return !tb.deleted; });
  const arsipBulanIni = semuaArsip.filter(function (tb) {
    return tb.tipe === 'bulanan' && tb.periode === ymTarget;
  })[0] || null;
  const arsipBulanLalu = semuaArsip.filter(function (tb) {
    return tb.tipe === 'bulanan' && tb.periode === ymLalu;
  })[0] || null;

  const riwayatBulanan = semuaArsip
    .filter(function (tb) { return tb.tipe === 'bulanan'; })
    .sort(function (a, b) { return String(b.periode || '').localeCompare(String(a.periode || '')); })
    .slice(0, 24);

  const riwayatHarianBulanIni = semuaArsip
    .filter(function (tb) { return tb.tipe === 'harian' && String(tb.periode || '').indexOf(ymTarget) === 0; })
    .sort(function (a, b) { return String(b.periode || '').localeCompare(String(a.periode || '')); });

  const cfg = ambilPengaturan_();
  const tokoInfo = {
    nama: cfg.toko_nama || 'Toko Bangunan',
    alamat: cfg.toko_alamat || '',
    hp: cfg.toko_hp || ''
  };

  // Jika periode sudah dikunci resmi & memiliki snapshot_json lengkap, sajikan angka beku dari arsip
  // agar valuasi stok, piutang, hutang, dan slow-moving bulan lampau tetap 100% permanen.
  const snap = arsipBulanIni && arsipBulanIni.status === 'terkunci' &&
    arsipBulanIni.snapshot_json && typeof arsipBulanIni.snapshot_json === 'object' &&
    arsipBulanIni.snapshot_json.ringkasan
    ? arsipBulanIni.snapshot_json
    : null;

  if (snap) {
    const rBln = rentangBulan_(ymTarget);
    const snapSlow = Array.isArray(snap.slow_moving) ? snap.slow_moving : [];
    return {
      periode: ymTarget,
      rentang: { dari: rBln.dari, sampai: rBln.sampai },
      status_buku: arsipBulanIni.status,
      dari_snapshot: true,
      arsip: arsipBulanIni,
      ringkasan: snap.ringkasan,
      perbandingan_mom: snap.perbandingan_mom || { periode_lalu: ymLalu, omset_persen: 0, laba_kotor_persen: 0, biaya_persen: 0, laba_bersih_persen: 0, transaksi_persen: 0, ringkasan_lalu: {} },
      top_produk_terlaris: Array.isArray(snap.top_produk_terlaris) ? snap.top_produk_terlaris : [],
      produk_margin_teratas: Array.isArray(snap.produk_margin_teratas) ? snap.produk_margin_teratas : [],
      analisis_kategori: Array.isArray(snap.analisis_kategori) ? snap.analisis_kategori : [],
      analisis_biaya: Array.isArray(snap.analisis_biaya) ? snap.analisis_biaya : [],
      slow_moving: snapSlow,
      total_slow_moving: Number(snap.total_slow_moving !== undefined ? snap.total_slow_moving : snapSlow.length),
      nilai_slow_moving: Number(snap.nilai_slow_moving || 0),
      riwayat_bulanan: riwayatBulanan,
      riwayat_harian: riwayatHarianBulanIni,
      toko: tokoInfo
    };
  }

  const metrikIni = hitungMetrikSatuBulan_(ctx, ymTarget);
  const ringkasanLalu = arsipBulanLalu
    ? {
      omset_bersih: Number(arsipBulanLalu.omset_bersih || 0),
      laba_kotor: Number(arsipBulanLalu.laba_kotor || 0),
      total_biaya: Number(arsipBulanLalu.total_biaya || 0),
      laba_bersih: Number(arsipBulanLalu.laba_bersih || 0),
      total_transaksi: Number(arsipBulanLalu.total_transaksi || 0),
      arus_kas_bersih: Number(arsipBulanLalu.arus_kas_bersih || 0)
    }
    : hitungMetrikSatuBulan_(ctx, ymLalu).ringkasan;

  const r = metrikIni.ringkasan;
  const mom = {
    periode_lalu: ymLalu,
    omset_persen: hitungMoM_(r.omset_bersih, ringkasanLalu.omset_bersih),
    laba_kotor_persen: hitungMoM_(r.laba_kotor, ringkasanLalu.laba_kotor),
    biaya_persen: hitungMoM_(r.total_biaya, ringkasanLalu.total_biaya),
    laba_bersih_persen: hitungMoM_(r.laba_bersih, ringkasanLalu.laba_bersih),
    transaksi_persen: hitungMoM_(r.total_transaksi, ringkasanLalu.total_transaksi),
    ringkasan_lalu: ringkasanLalu
  };

  return {
    periode: ymTarget,
    rentang: metrikIni.rentang,
    status_buku: arsipBulanIni ? arsipBulanIni.status : 'terbuka',
    dari_snapshot: false,
    arsip: arsipBulanIni,
    ringkasan: r,
    perbandingan_mom: mom,
    top_produk_terlaris: metrikIni.top_produk_terlaris,
    produk_margin_teratas: metrikIni.produk_margin_teratas,
    analisis_kategori: metrikIni.analisis_kategori,
    analisis_biaya: metrikIni.analisis_biaya,
    slow_moving: metrikIni.slow_moving,
    total_slow_moving: metrikIni.total_slow_moving,
    nilai_slow_moving: metrikIni.nilai_slow_moving,
    riwayat_bulanan: riwayatBulanan,
    riwayat_harian: riwayatHarianBulanIni,
    toko: tokoInfo
  };
}

/**
 * tutupBuku.tutupBulanan — Tutup Buku & Kunci Periode Bulanan (Khusus Owner).
 */
function aksiTutupBukuTutupBulanan_(ctx) {
  const p = ctx.payload || {};
  const ymTarget = (p.periode && /^\d{4}-\d{2}$/.test(String(p.periode).trim()))
    ? String(p.periode).trim()
    : sekarang_().substring(0, 7);
  const catatan = V_.teks(p.catatan || '', 'Catatan Tutup Buku Bulanan', { maks: 500 });

  const evaluasi = aksiTutupBukuEvaluasiBulanan_({ user: ctx.user, payload: { periode: ymTarget } });
  if (evaluasi.status_buku === 'terkunci') {
    gagal_(KODE.CONFLICT, 'Periode bulan ' + ymTarget + ' sudah ditutup buku (terkunci).');
  }
  if (evaluasi.ringkasan.shift_aktif_count > 0) {
    gagal_(KODE.CONFLICT, 'Masih ada ' + evaluasi.ringkasan.shift_aktif_count + ' shift kasir yang belum ditutup pada bulan ' + ymTarget + '. Tutup semua shift terlebih dahulu.');
  }

  const r = evaluasi.ringkasan;
  const waktu = sekarang_();
  const namaPenutup = ctx.user.nama || ctx.user.username || 'Owner';
  const dataRow = {
    periode: ymTarget,
    tipe: 'bulanan',
    status: 'terkunci',
    waktu_tutup: waktu,
    ditutup_oleh: ctx.user.id,
    ditutup_oleh_nama: namaPenutup,
    omset_kotor: r.omset_kotor,
    total_diskon: r.total_diskon,
    omset_bersih: r.omset_bersih,
    total_hpp: r.total_hpp,
    laba_kotor: r.laba_kotor,
    total_biaya: r.total_biaya,
    laba_bersih: r.laba_bersih,
    margin_persen: r.margin_persen,
    total_transaksi: r.total_transaksi,
    total_pembelian: r.total_pembelian,
    arus_kas_masuk: r.arus_kas_masuk,
    arus_kas_keluar: r.arus_kas_keluar,
    arus_kas_bersih: r.arus_kas_bersih,
    saldo_piutang: r.saldo_piutang,
    saldo_hutang: r.saldo_hutang,
    valuasi_stok: r.valuasi_stok,
    selisih_shift: r.selisih_shift,
    setoran_owner: 0,
    sisa_modal_besok: 0,
    catatan: catatan,
    snapshot_json: {
      ringkasan: r,
      perbandingan_mom: evaluasi.perbandingan_mom,
      top_produk_terlaris: evaluasi.top_produk_terlaris,
      produk_margin_teratas: evaluasi.produk_margin_teratas || [],
      analisis_kategori: evaluasi.analisis_kategori,
      analisis_biaya: evaluasi.analisis_biaya,
      slow_moving: evaluasi.slow_moving || [],
      total_slow_moving: evaluasi.total_slow_moving,
      nilai_slow_moving: evaluasi.nilai_slow_moving
    }
  };

  let tersimpan;
  if (evaluasi.arsip && evaluasi.arsip.id) {
    tersimpan = ubahBaris_('Tutup_Buku', [{ id: evaluasi.arsip.id, data: dataRow }], ctx.user.id)[0];
  } else {
    tersimpan = tambahBaris_('Tutup_Buku', [dataRow], ctx.user.id)[0];
  }

  catatAudit_(ctx.user.id, 'tutup_buku_bulanan', 'TUTUP_BUKU', ymTarget, {
    omset_bersih: r.omset_bersih,
    laba_bersih: r.laba_bersih,
    margin_persen: r.margin_persen,
    selisih_shift: r.selisih_shift,
    catatan: catatan
  });

  return {
    pesan: 'Tutup Buku Bulanan ' + ymTarget + ' berhasil disimpan & periode telah dikunci.',
    arsip: tersimpan
  };
}

/**
 * tutupBuku.bukaKunci — Buka kunci periode bulanan untuk koreksi darurat (Khusus Owner, wajib alasan).
 */
function aksiTutupBukuBukaKunci_(ctx) {
  const p = ctx.payload || {};
  const ymTarget = V_.teks(p.periode, 'Periode Bulan', { wajib: true, maks: 10 });
  const alasan = V_.teks(p.alasan, 'Alasan Buka Kunci Periode', { wajib: true, min: 4, maks: 300 });

  const arsip = bacaSemua_('Tutup_Buku').filter(function (tb) {
    return !tb.deleted && tb.tipe === 'bulanan' && tb.periode === ymTarget;
  })[0];

  if (!arsip) gagal_(KODE.NOT_FOUND, 'Arsip Tutup Buku bulan ' + ymTarget + ' tidak ditemukan.');
  if (arsip.status !== 'terkunci') gagal_(KODE.CONFLICT, 'Periode bulan ' + ymTarget + ' saat ini tidak dalam keadaan terkunci.');

  const diubah = ubahBaris_('Tutup_Buku', [{
    id: arsip.id,
    data: {
      status: 'dibuka_kembali',
      catatan: (arsip.catatan ? arsip.catatan + ' | ' : '') + 'Dibuka kembali: ' + alasan
    }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'tutup_buku_buka_kunci', 'TUTUP_BUKU', ymTarget, { alasan: alasan });

  return {
    pesan: 'Kunci periode bulan ' + ymTarget + ' berhasil dibuka kembali.',
    arsip: diubah
  };
}

/**
 * tutupBuku.list — Daftar riwayat Tutup Harian & Tutup Buku Bulanan.
 */
function aksiTutupBukuList_(ctx) {
  const p = ctx.payload || {};
  let items = bacaSemua_('Tutup_Buku').filter(function (tb) { return !tb.deleted; });
  if (p.tipe === 'harian' || p.tipe === 'bulanan') {
    items = items.filter(function (tb) { return tb.tipe === p.tipe; });
  }
  items.sort(function (a, b) { return String(b.periode || '').localeCompare(String(a.periode || '')); });
  return { items: items, total: items.length };
}

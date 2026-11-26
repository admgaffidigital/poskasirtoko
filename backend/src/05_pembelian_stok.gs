/* ---------- 9.3 SUPPLIER, PEMBELIAN, KARTU STOK & OPNAME (FASE 3) ---------- */

/** supplier.list — Daftar supplier dengan agregasi saldo hutang & riwayat pembelian. */
function aksiSupplierList_(ctx) {
  const p = ctx.payload || {};
  const semuaSupplier = bacaSemua_('Supplier');
  const semuaHutang = bacaSemua_('Hutang');
  const semuaPembelian = bacaSemua_('Pembelian');

  // Peta saldo hutang aktif per supplier
  const hutangPeta = {};
  semuaHutang.forEach(function (h) {
    if (h.deleted || h.status === 'lunas') return;
    const sid = h.supplier_id;
    if (!sid) return;
    hutangPeta[sid] = (hutangPeta[sid] || 0) + (Number(h.sisa) || 0);
  });

  // Peta total transaksi pembelian per supplier
  const pembelianCountPeta = {};
  semuaPembelian.forEach(function (pb) {
    if (pb.deleted) return;
    const sid = pb.supplier_id;
    if (!sid) return;
    pembelianCountPeta[sid] = (pembelianCountPeta[sid] || 0) + 1;
  });

  let data = semuaSupplier.map(function (sup) {
    const copy = Object.assign({}, sup);
    copy.saldo_hutang = hutangPeta[sup.id] || 0;
    copy.total_pembelian = pembelianCountPeta[sup.id] || 0;
    return copy;
  });

  if (p.aktif_saja === true) {
    data = data.filter(function (s) { return s.aktif; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (s) {
      return String(s.nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(s.kontak || '').toLowerCase().indexOf(q) !== -1 ||
        String(s.hp || '').toLowerCase().indexOf(q) !== -1 ||
        String(s.alamat || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan berdasarkan nama
  data.sort(function (a, b) {
    return String(a.nama || '').localeCompare(String(b.nama || ''));
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

/** supplier.create — Tambah supplier baru (Owner & Admin). */
function aksiSupplierCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Supplier', { wajib: true, maks: 150 });
  const kontak = V_.teks(p.kontak, 'Kontak/PIC', { maks: 100 });
  const hp = V_.teks(p.hp, 'Nomor HP/WA', { maks: 30 });
  const alamat = V_.teks(p.alamat, 'Alamat Supplier', { maks: 300 });
  const catatan = V_.teks(p.catatan, 'Catatan Supplier', { maks: 500 });
  const aktif = p.aktif !== false;

  const hasil = tambahBaris_('Supplier', [{
    nama: nama,
    kontak: kontak,
    hp: hp,
    alamat: alamat,
    catatan: catatan,
    aktif: aktif
  }], ctx.user.id);

  const supplierBaru = hasil[0];
  catatAudit_(ctx.user.id, 'supplier_create', 'SUPPLIER', supplierBaru.id, { nama: nama });

  return {
    supplier: supplierBaru,
    pesan: 'Supplier "' + nama + '" berhasil ditambahkan.'
  };
}

/** supplier.update — Perbarui data supplier (Owner & Admin). */
function aksiSupplierUpdate_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID supplier wajib diberikan.');

  const supplier = cariById_('Supplier', p.id);
  if (!supplier) gagal_(KODE.NOT_FOUND, 'Data supplier tidak ditemukan.');

  const dataUbah = {};
  if (p.nama !== undefined) dataUbah.nama = V_.teks(p.nama, 'Nama Supplier', { wajib: true, maks: 150 });
  if (p.kontak !== undefined) dataUbah.kontak = V_.teks(p.kontak, 'Kontak/PIC', { maks: 100 });
  if (p.hp !== undefined) dataUbah.hp = V_.teks(p.hp, 'Nomor HP/WA', { maks: 30 });
  if (p.alamat !== undefined) dataUbah.alamat = V_.teks(p.alamat, 'Alamat Supplier', { maks: 300 });
  if (p.catatan !== undefined) dataUbah.catatan = V_.teks(p.catatan, 'Catatan Supplier', { maks: 500 });
  if (p.aktif !== undefined) dataUbah.aktif = Boolean(p.aktif);

  ubahBaris_('Supplier', [{ id: supplier.id, data: dataUbah }], ctx.user.id);
  catatAudit_(ctx.user.id, 'supplier_update', 'SUPPLIER', supplier.id, dataUbah);

  return {
    pesan: 'Data supplier berhasil diperbarui.'
  };
}

/** supplier.delete — Hapus supplier (Owner & Admin; ditolak bila ada hutang aktif). */
function aksiSupplierDelete_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID supplier wajib diberikan.');

  const supplier = cariById_('Supplier', p.id);
  if (!supplier) gagal_(KODE.NOT_FOUND, 'Data supplier tidak ditemukan.');

  // Periksa apakah masih ada hutang aktif
  const semuaHutang = bacaSemua_('Hutang');
  const adaHutangAktif = semuaHutang.some(function (h) {
    return h.supplier_id === supplier.id && !h.deleted && h.status !== 'lunas' && Number(h.sisa) > 0;
  });

  if (adaHutangAktif) {
    gagal_(KODE.CONFLICT, 'Supplier "' + supplier.nama + '" tidak dapat dihapus karena masih memiliki saldo hutang aktif.');
  }

  hapusLunak_('Supplier', supplier.id, ctx.user.id);
  catatAudit_(ctx.user.id, 'supplier_delete', 'SUPPLIER', supplier.id, { nama: supplier.nama });

  return {
    pesan: 'Supplier "' + supplier.nama + '" berhasil dihapus.'
  };
}

/** pembelian.list — Daftar riwayat faktur pembelian barang. */
function aksiPembelianList_(ctx) {
  const p = ctx.payload || {};
  const semuaPembelian = bacaSemua_('Pembelian');
  const semuaSupplier = bacaSemua_('Supplier');
  const supplierPeta = {};
  semuaSupplier.forEach(function (s) { supplierPeta[s.id] = s.nama; });

  let data = semuaPembelian.map(function (pb) {
    const copy = Object.assign({}, pb);
    copy.supplier_nama = supplierPeta[pb.supplier_id] || 'Supplier Umum';
    return copy;
  });

  // Filter supplier
  if (p.supplier_id) {
    data = data.filter(function (pb) { return pb.supplier_id === p.supplier_id; });
  }

  // Filter status bayar
  if (p.status_bayar) {
    data = data.filter(function (pb) { return pb.status_bayar === p.status_bayar; });
  }

  // Filter rentang tanggal
  if (p.dari) {
    data = data.filter(function (pb) { return String(pb.tanggal || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (pb) { return String(pb.tanggal || '').substring(0, 10) <= p.sampai; });
  }

  // Pencarian no_faktur atau no_faktur_supplier atau supplier_nama
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pb) {
      return String(pb.no_faktur || '').toLowerCase().indexOf(q) !== -1 ||
        String(pb.no_faktur_supplier || '').toLowerCase().indexOf(q) !== -1 ||
        String(pb.supplier_nama || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan terbaru di atas
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

/** pembelian.detail — Rincian lengkap faktur pembelian, item, & status hutang. */
function aksiPembelianDetail_(ctx) {
  const p = ctx.payload || {};
  let pembelian = null;
  if (p.id) {
    pembelian = cariById_('Pembelian', p.id);
  } else if (p.no_faktur) {
    const semua = bacaSemua_('Pembelian');
    pembelian = semua.filter(function (pb) { return pb.no_faktur === p.no_faktur && !pb.deleted; })[0];
  }

  if (!pembelian) gagal_(KODE.NOT_FOUND, 'Data faktur pembelian tidak ditemukan.');

  const supplier = cariById_('Supplier', pembelian.supplier_id) || { nama: 'Supplier Umum' };
  const semuaItems = bacaSemua_('Pembelian_Item');
  const items = semuaItems.filter(function (it) { return it.pembelian_id === pembelian.id && !it.deleted; });

  const semuaHutang = bacaSemua_('Hutang');
  const hutang = semuaHutang.filter(function (h) { return h.pembelian_id === pembelian.id && !h.deleted; })[0] || null;

  return {
    pembelian: pembelian,
    supplier: supplier,
    items: items,
    hutang: hutang
  };
}

/**
 * pembelian.create — Simpan pembelian barang masuk (Atomik via LockService).
 * Sesuai Aturan Bisnis #10:
 * - Update stok bertambah (satuan dasar)
 * - Hitung Moving Average HPP baru (alokasi diskon proporsional)
 * - Catat mutasi di Kartu_Stok tipe 'beli'
 * - Catat Hutang bila belum lunas / tempo
 */
function aksiPembelianCreate_(ctx) {
  const payload = ctx.payload || {};
  const rawItems = payload.items;

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Daftar barang pembelian tidak boleh kosong.');
  }

  const supplierId = payload.supplier_id ? String(payload.supplier_id).trim() : '';
  const supplier = cariById_('Supplier', supplierId);
  if (!supplier) {
    gagal_(KODE.VALIDATION, 'Supplier wajib dipilih dan terdaftar di master data.');
  }

  const noFakturSupplier = V_.teks(payload.no_faktur_supplier, 'No Faktur Supplier', { maks: 100 });
  const catatan = V_.teks(payload.catatan, 'Catatan Pembelian', { maks: 500 });
  const diskonFaktur = V_.rupiah(payload.diskon, 'Diskon Faktur', { bawaan: 0 });
  const ongkirBeli = V_.rupiah(payload.ongkir, 'Ongkos Kirim Pembelian', { bawaan: 0, min: 0 });
  const biayaBongkar = V_.rupiah(payload.biaya_bongkar, 'Biaya Bongkar Pembelian', { bawaan: 0, min: 0 });
  const totalBiayaTambahan = ongkirBeli + biayaBongkar;
  const biayaMasukHutang = payload.biaya_masuk_hutang !== false;
  const metodeAlokasi = String(payload.metode_alokasi_biaya || 'proporsional').trim().toLowerCase() === 'qty' ? 'qty' : 'proporsional';
  const nominalBayar = V_.rupiah(payload.bayar, 'Nominal Bayar', { bawaan: 0 });
  const tanggalBeli = payload.tanggal ? String(payload.tanggal).trim() : sekarang_();
  cekPeriodeTerkunci_(tanggalBeli);
  const jatuhTempo = payload.jatuh_tempo ? String(payload.jatuh_tempo).trim() : '';

  // Validasi dan normalisasi tiap item
  const itemsDiproses = [];
  let subtotalKotor = 0;      // sebelum diskon apa pun
  let totalDiskonItem = 0;    // total diskon % per produk
  let subtotalBersih = 0;     // setelah diskon item, sebelum diskon faktur

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const produk = cariById_('Produk', it.produk_id);
    if (!produk || produk.deleted) {
      gagal_(KODE.NOT_FOUND, 'Produk item ke-' + (i + 1) + ' tidak ditemukan.');
    }

    let varian = null;
    if (it.varian_id) {
      varian = cariById_('Varian', it.varian_id);
      if (!varian || varian.deleted) {
        gagal_(KODE.NOT_FOUND, 'Varian produk item ke-' + (i + 1) + ' tidak ditemukan.');
      }
    }

    const qty = V_.qty(it.qty, 'Qty Beli (' + (it.nama || produk.nama) + ')');
    const faktor = Math.max(1, Number(it.faktor) || 1);
    const qtyDasar = Math.round(qty * faktor * 1000) / 1000;
    const hargaBeli = V_.rupiah(it.harga_beli, 'Harga Beli (' + (it.nama || produk.nama) + ')', { wajib: true, min: 0 });
    // Diskon persen dari supplier per produk (0-100, maks 2 desimal)
    const diskonPersen = Math.round(V_.angka(it.diskon_persen, 'Diskon % (' + (it.nama || produk.nama) + ')', { min: 0, max: 100 }) * 100) / 100;
    const itemKotor = Math.round(qty * hargaBeli);
    const diskonItem = Math.min(itemKotor, Math.round(itemKotor * diskonPersen / 100));
    const itemSubtotal = itemKotor - diskonItem;

    subtotalKotor += itemKotor;
    totalDiskonItem += diskonItem;
    subtotalBersih += itemSubtotal;

    const lokObjItem = bacaStokLokasi_(varian || produk);
    const rawLokMasuk = String(it.lokasi_masuk || payload.lokasi_masuk || '').trim().toLowerCase();
    let lokasiMasuk = 'toko';
    let qtyTokoItem = qty;
    let qtyGudangItem = 0;

    if (rawLokMasuk === 'split') {
      qtyTokoItem = bulatQty_(V_.nonNegatif(it.qty_toko, 'Qty Masuk Toko (' + (it.nama || produk.nama) + ')', { bawaan: 0 }));
      qtyGudangItem = bulatQty_(V_.nonNegatif(it.qty_gudang, 'Qty Masuk Gudang (' + (it.nama || produk.nama) + ')', { bawaan: 0 }));
      if (Math.abs(bulatQty_(qtyTokoItem + qtyGudangItem) - qty) > 0.002) {
        gagal_(KODE.VALIDATION, 'Total pembagian Qty Toko (' + qtyTokoItem + ') + Gudang (' + qtyGudangItem + ') harus sama dengan Qty Beli (' + qty + ') untuk ' + (it.nama || produk.nama) + '.');
      }
      lokasiMasuk = (qtyTokoItem > 0 && qtyGudangItem > 0) ? 'split' : (qtyGudangItem > 0 ? 'gudang' : 'toko');
    } else if (rawLokMasuk === 'gudang') {
      lokasiMasuk = 'gudang';
      qtyTokoItem = 0;
      qtyGudangItem = qty;
    } else if (rawLokMasuk === 'toko') {
      lokasiMasuk = 'toko';
      qtyTokoItem = qty;
      qtyGudangItem = 0;
    } else {
      // Smart default: jika stok toko masih ada (> 0) otomatis ke Gudang, jika stok toko kosong (<= 0) langsung ke Toko
      if (lokObjItem.stok_toko > 0 && rawLokMasuk === 'otomatis') {
        lokasiMasuk = 'gudang';
        qtyTokoItem = 0;
        qtyGudangItem = qty;
      } else {
        lokasiMasuk = 'toko';
        qtyTokoItem = qty;
        qtyGudangItem = 0;
      }
    }

    itemsDiproses.push({
      produk: produk,
      varian: varian,
      nama: it.nama || (varian ? produk.nama + ' - ' + varian.nama_varian : produk.nama),
      satuan: it.satuan || produk.satuan_dasar,
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      lokasi_masuk: lokasiMasuk,
      qty_toko: qtyTokoItem,
      qty_gudang: qtyGudangItem,
      qty_toko_dasar: bulatQty_(qtyTokoItem * faktor),
      qty_gudang_dasar: bulatQty_(qtyGudangItem * faktor),
      harga_beli: hargaBeli,
      diskon_persen: diskonPersen,
      diskon_item: diskonItem,
      subtotal: itemSubtotal
    });
  }

  if (diskonFaktur > subtotalBersih) {
    gagal_(KODE.VALIDATION, 'Diskon faktur tidak boleh melebihi subtotal setelah diskon item.');
  }
  const totalBarangNet = Math.max(0, subtotalBersih - diskonFaktur);
  // Jika biaya kirim/bongkar ditagihkan di nota supplier -> masuk grandTotal/Hutang; jika dibayar tunai terpisah -> grandTotal murni barang, tapi tetap masuk HPP
  const grandTotal = biayaMasukHutang ? (totalBarangNet + totalBiayaTambahan) : totalBarangNet;
  const bayarEfektif = Math.min(nominalBayar, grandTotal);
  const statusBayar = bayarEfektif >= grandTotal ? 'lunas' : (bayarEfektif > 0 ? 'sebagian' : 'hutang');
  const sisaHutang = Math.max(0, grandTotal - bayarEfektif);

  // Generate Nomor Faktur Resmi PB-YYYYMMDD-0001
  const noFaktur = nomorBerikut_('PB');

  // 1. Simpan Header Pembelian
  const resBeli = tambahBaris_('Pembelian', [{
    no_faktur: noFaktur,
    no_faktur_supplier: noFakturSupplier,
    tanggal: tanggalBeli,
    supplier_id: supplier.id,
    subtotal: subtotalKotor,
    diskon_item: totalDiskonItem,
    diskon: diskonFaktur,
    ongkir: ongkirBeli,
    biaya_bongkar: biayaBongkar,
    biaya_masuk_hutang: biayaMasukHutang,
    metode_alokasi_biaya: metodeAlokasi,
    total: grandTotal,
    bayar: bayarEfektif,
    status_bayar: statusBayar,
    jatuh_tempo: sisaHutang > 0 ? jatuhTempo : '',
    catatan: catatan,
    status: 'selesai'
  }], ctx.user.id);

  const pembelianBaru = resBeli[0];

  // 2. Simpan Item Pembelian & Proses Efek Stok + HPP Moving Average secara berantai (aman untuk multi-varian & multi-baris produk sama)
  const rowsItemBeli = [];
  const rowsKartuStok = [];
  const updateProdukMap = {};
  const updateVarianMap = {};
  const produkStateMap = {};
  const varianStateMap = {};
  const semuaVarianBeli = bacaSemua_('Varian');
  semuaVarianBeli.forEach(function (v) {
    if (!v.deleted) varianStateMap[v.id] = v;
  });
  itemsDiproses.forEach(function (it) {
    if (!produkStateMap[it.produk.id]) produkStateMap[it.produk.id] = it.produk;
    if (it.varian && !varianStateMap[it.varian.id]) varianStateMap[it.varian.id] = it.varian;
  });
  const totalQtyDasarFaktur = itemsDiproses.reduce(function (acc, it) { return acc + (Number(it.qty_dasar) || 0); }, 0);
  const ketLanded = totalBiayaTambahan > 0 ? ' [+Ongkir/Bongkar]' : '';

  itemsDiproses.forEach(function (item) {
    // Alokasi diskon proporsional + alokasi Landed Cost (ongkir & biaya bongkar) ke HPP efektif
    let diskonItemFaktur = 0;
    if (subtotalBersih > 0 && diskonFaktur > 0) {
      diskonItemFaktur = Math.round(diskonFaktur * (item.subtotal / subtotalBersih));
    }
    let biayaTambahanItem = 0;
    if (totalBiayaTambahan > 0) {
      if (metodeAlokasi === 'qty' && totalQtyDasarFaktur > 0) {
        biayaTambahanItem = Math.round(totalBiayaTambahan * (item.qty_dasar / totalQtyDasarFaktur));
      } else if (subtotalBersih > 0) {
        biayaTambahanItem = Math.round(totalBiayaTambahan * (item.subtotal / subtotalBersih));
      } else {
        biayaTambahanItem = Math.round(totalBiayaTambahan / itemsDiproses.length);
      }
    }
    const itemNet = Math.max(0, item.subtotal - diskonItemFaktur + biayaTambahanItem);
    const hargaBeliEfektif = itemNet / item.qty;
    const hargaBeliDasarEfektif = hargaBeliEfektif / item.faktor;

    rowsItemBeli.push({
      pembelian_id: pembelianBaru.id,
      produk_id: item.produk.id,
      varian_id: item.varian ? item.varian.id : '',
      nama: item.nama,
      satuan: item.satuan,
      faktor: item.faktor,
      qty: item.qty,
      qty_dasar: item.qty_dasar,
      harga_beli: item.harga_beli,
      diskon_persen: item.diskon_persen,
      diskon_item: item.diskon_item,
      subtotal: item.subtotal,
      lokasi_masuk: item.lokasi_masuk || 'toko',
      qty_toko: item.qty_toko || 0,
      qty_gudang: item.qty_gudang || 0
    });

    const prRef = produkStateMap[item.produk.id];
    const qTokoDasar = Number(item.qty_toko_dasar || 0);
    const qGudangDasar = Number(item.qty_gudang_dasar || 0);

    if (item.varian) {
      const varRef = varianStateMap[item.varian.id] || item.varian;
      const lv = bacaStokLokasi_(varRef);
      const hppLamaVarian = Number(varRef.hpp || 0);
      const hppBaruVarian = hitungHppBaru_(lv.stok, hppLamaVarian, item.qty_dasar, hargaBeliDasarEfektif);
      const stTokoBaruV = bulatQty_(lv.stok_toko + qTokoDasar);
      const stGudangBaruV = bulatQty_(lv.stok_gudang + qGudangDasar);
      const stokBaruVarian = bulatQty_(stTokoBaruV + stGudangBaruV);

      varRef.stok_toko = stTokoBaruV;
      varRef.stok_gudang = stGudangBaruV;
      varRef.stok = stokBaruVarian;
      varRef.hpp = hppBaruVarian;
      updateVarianMap[varRef.id] = { stok: stokBaruVarian, stok_toko: stTokoBaruV, stok_gudang: stGudangBaruV, hpp: hppBaruVarian };

      // Akumulasi stok total & lokasi produk induk secara berantai di memori (anti-overwrite multi-varian)
      const lp = bacaStokLokasi_(prRef);
      const stTokoBaruP = bulatQty_(lp.stok_toko + qTokoDasar);
      const stGudangBaruP = bulatQty_(lp.stok_gudang + qGudangDasar);
      const stokBaruProduk = bulatQty_(stTokoBaruP + stGudangBaruP);
      prRef.stok_toko = stTokoBaruP;
      prRef.stok_gudang = stGudangBaruP;
      prRef.stok = stokBaruProduk;
      updateProdukMap[prRef.id] = { stok: stokBaruProduk, stok_toko: stTokoBaruP, stok_gudang: stGudangBaruP };

      if (qTokoDasar > 0) {
        rowsKartuStok.push({
          produk_id: prRef.id,
          varian_id: varRef.id,
          tipe: 'beli',
          lokasi: 'toko',
          qty: qTokoDasar,
          saldo: qGudangDasar > 0 ? bulatQty_(lv.stok + qTokoDasar) : stokBaruVarian,
          saldo_toko: stTokoBaruV,
          saldo_gudang: qGudangDasar > 0 ? lv.stok_gudang : stGudangBaruV,
          hpp: hppBaruVarian,
          ref_id: noFaktur,
          user_id: ctx.user.id,
          keterangan: 'Pembelian ' + noFaktur + ' → Toko (' + supplier.nama + ')' + ketLanded
        });
      }
      if (qGudangDasar > 0) {
        rowsKartuStok.push({
          produk_id: prRef.id,
          varian_id: varRef.id,
          tipe: 'beli',
          lokasi: 'gudang',
          qty: qGudangDasar,
          saldo: stokBaruVarian,
          saldo_toko: stTokoBaruV,
          saldo_gudang: stGudangBaruV,
          hpp: hppBaruVarian,
          ref_id: noFaktur,
          user_id: ctx.user.id,
          keterangan: 'Pembelian ' + noFaktur + ' → Gudang (' + supplier.nama + ')' + ketLanded
        });
      }
    } else {
      const lp = bacaStokLokasi_(prRef);
      const hppLama = Number(prRef.hpp || 0);
      const hppBaru = hitungHppBaru_(lp.stok, hppLama, item.qty_dasar, hargaBeliDasarEfektif);
      const stTokoBaru = bulatQty_(lp.stok_toko + qTokoDasar);
      const stGudangBaru = bulatQty_(lp.stok_gudang + qGudangDasar);
      const stokBaru = bulatQty_(stTokoBaru + stGudangBaru);

      prRef.stok_toko = stTokoBaru;
      prRef.stok_gudang = stGudangBaru;
      prRef.stok = stokBaru;
      prRef.hpp = hppBaru;
      updateProdukMap[prRef.id] = { stok: stokBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru, hpp: hppBaru };

      if (qTokoDasar > 0) {
        rowsKartuStok.push({
          produk_id: prRef.id,
          varian_id: '',
          tipe: 'beli',
          lokasi: 'toko',
          qty: qTokoDasar,
          saldo: qGudangDasar > 0 ? bulatQty_(lp.stok + qTokoDasar) : stokBaru,
          saldo_toko: stTokoBaru,
          saldo_gudang: qGudangDasar > 0 ? lp.stok_gudang : stGudangBaru,
          hpp: hppBaru,
          ref_id: noFaktur,
          user_id: ctx.user.id,
          keterangan: 'Pembelian ' + noFaktur + ' → Toko (' + supplier.nama + ')' + ketLanded
        });
      }
      if (qGudangDasar > 0) {
        rowsKartuStok.push({
          produk_id: prRef.id,
          varian_id: '',
          tipe: 'beli',
          lokasi: 'gudang',
          qty: qGudangDasar,
          saldo: stokBaru,
          saldo_toko: stTokoBaru,
          saldo_gudang: stGudangBaru,
          hpp: hppBaru,
          ref_id: noFaktur,
          user_id: ctx.user.id,
          keterangan: 'Pembelian ' + noFaktur + ' → Gudang (' + supplier.nama + ')' + ketLanded
        });
      }
    }
  });

  const perbaruiProdukList = Object.keys(updateProdukMap).map(function (id) { return { id: id, data: updateProdukMap[id] }; });
  const perbaruiVarianList = Object.keys(updateVarianMap).map(function (id) { return { id: id, data: updateVarianMap[id] }; });
  if (rowsItemBeli.length > 0) tambahBaris_('Pembelian_Item', rowsItemBeli, ctx.user.id);
  if (perbaruiProdukList.length > 0) ubahBaris_('Produk', perbaruiProdukList, ctx.user.id);
  if (perbaruiVarianList.length > 0) ubahBaris_('Varian', perbaruiVarianList, ctx.user.id);
  if (rowsKartuStok.length > 0) tambahBaris_('Kartu_Stok', rowsKartuStok, ctx.user.id);

  // 3. Catat Hutang bila pembayaran belum lunas
  if (sisaHutang > 0) {
    tambahBaris_('Hutang', [{
      pembelian_id: pembelianBaru.id,
      supplier_id: supplier.id,
      total: sisaHutang,
      terbayar: 0,
      sisa: sisaHutang,
      jatuh_tempo: jatuhTempo,
      status: 'belum'
    }], ctx.user.id);
  }

  // 4. Catat Pembayaran awal / DP bila ada bayar > 0
  if (bayarEfektif > 0) {
    tambahBaris_('Pembayaran', [{
      tipe: 'hutang',
      ref_id: pembelianBaru.id,
      jumlah: bayarEfektif,
      metode: payload.metode_bayar || 'tunai',
      tanggal: sekarang_(),
      catatan: 'Pembayaran faktur ' + noFaktur
    }], ctx.user.id);
  }

  // 4b. Jika ongkir/bongkar dibayar tunai terpisah (bukan ke supplier), catat arus kas keluar pembelian agar kas tetap sinkron
  if (!biayaMasukHutang && totalBiayaTambahan > 0) {
    tambahBaris_('Pembayaran', [{
      tipe: 'hutang',
      ref_id: pembelianBaru.id,
      jumlah: totalBiayaTambahan,
      metode: 'tunai',
      tanggal: sekarang_(),
      catatan: 'Ongkir/bongkar tunai terpisah faktur ' + noFaktur
    }], ctx.user.id);
  }

  // 5. Catat Log Audit
  catatAudit_(ctx.user.id, 'pembelian_create', 'PEMBELIAN', noFaktur, {
    supplier: supplier.nama,
    total: grandTotal,
    ongkir: ongkirBeli,
    biaya_bongkar: biayaBongkar,
    biaya_masuk_hutang: biayaMasukHutang,
    metode_alokasi_biaya: metodeAlokasi,
    item_count: itemsDiproses.length,
    status_bayar: statusBayar
  });

  // Hapus cache katalog produk
  cacheHapus_('produk');

  return {
    pesan: 'Pembelian ' + noFaktur + ' berhasil disimpan.',
    no_faktur: noFaktur,
    id: pembelianBaru.id,
    total: grandTotal,
    status_bayar: statusBayar
  };
}

/** kartuStok.list — Buku besar riwayat mutasi stok barang lengkap. */
function aksiKartuStokList_(ctx) {
  const p = ctx.payload || {};
  const semuaKartu = bacaSemua_('Kartu_Stok');
  const semuaProduk = bacaSemua_('Produk', { termasukTerhapus: true });
  const semuaVarian = bacaSemua_('Varian', { termasukTerhapus: true });
  const semuaUsers = bacaSemua_('Users', { termasukTerhapus: true });

  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  let data = semuaKartu.map(function (ks) {
    const pr = produkPeta[ks.produk_id];
    const vr = ks.varian_id ? varianPeta[ks.varian_id] : null;
    let namaPr = pr ? pr.nama : 'Produk Tidak Ditemukan';
    if (pr && pr.deleted) namaPr += ' (Dihapus)';
    return {
      id: ks.id,
      created_at: ks.created_at,
      produk_id: ks.produk_id,
      produk_nama: namaPr,
      produk_sku: pr ? pr.sku : '-',
      satuan_dasar: pr ? (pr.satuan_dasar || 'PCS').toUpperCase() : 'PCS',
      varian_id: ks.varian_id || '',
      varian_nama: vr ? vr.nama_varian : '',
      tipe: ks.tipe,
      lokasi: ks.lokasi || 'toko',
      qty: ks.qty,
      saldo: ks.saldo,
      saldo_toko: (ks.saldo_toko === 0 && ks.saldo_gudang === 0 && Number(ks.saldo || 0) !== 0 && ks.lokasi !== 'gudang') ? Number(ks.saldo || 0) : Number(ks.saldo_toko || 0),
      saldo_gudang: Number(ks.saldo_gudang || 0),
      hpp: ks.hpp,
      ref_id: ks.ref_id,
      user_id: ks.user_id,
      petugas_nama: userPeta[ks.user_id] || ks.user_id || 'Sistem',
      keterangan: ks.keterangan
    };
  });

  // Filter produk
  if (p.produk_id) {
    data = data.filter(function (ks) { return ks.produk_id === p.produk_id; });
  }

  // Filter varian
  if (p.varian_id) {
    data = data.filter(function (ks) { return ks.varian_id === p.varian_id; });
  }

  // Filter tipe mutasi
  if (p.tipe) {
    data = data.filter(function (ks) { return ks.tipe === p.tipe; });
  }

  // Filter lokasi (toko / gudang)
  if (p.lokasi === 'toko' || p.lokasi === 'gudang') {
    data = data.filter(function (ks) { return (ks.lokasi || 'toko') === p.lokasi; });
  }

  // Filter rentang tanggal
  if (p.dari) {
    data = data.filter(function (ks) { return String(ks.created_at || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (ks) { return String(ks.created_at || '').substring(0, 10) <= p.sampai; });
  }

  // Pencarian q (nama produk, sku, ref_id, keterangan)
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (ks) {
      return String(ks.produk_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(ks.produk_sku || '').toLowerCase().indexOf(q) !== -1 ||
        String(ks.ref_id || '').toLowerCase().indexOf(q) !== -1 ||
        String(ks.keterangan || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Filter sembunyikan produk terhapus (opsional)
  if (p.sembunyikan_terhapus) {
    data = data.filter(function (ks) {
      const pr = produkPeta[ks.produk_id];
      return pr && !pr.deleted;
    });
  }

  // Urutkan terbaru di atas
  data.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
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

/** kartuStok.delete — Hapus (soft-delete) satu catatan kartu stok (Khusus Owner). */
function aksiKartuStokDelete_(ctx) {
  if (ctx.user.role !== ROLE.OWNER) gagal_(KODE.FORBIDDEN, 'Hanya Owner yang berhak menghapus riwayat kartu stok.');
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Kartu Stok', { wajib: true });

  const ks = cariById_('Kartu_Stok', id);
  if (!ks) gagal_(KODE.NOT_FOUND, 'Catatan kartu stok tidak ditemukan.');

  hapusLunak_('Kartu_Stok', id, ctx.user.id);
  catatAudit_(ctx.user.id, 'kartu_stok_hapus', 'KARTU_STOK', id, { produk_id: ks.produk_id, tipe: ks.tipe, qty: ks.qty, ref_id: ks.ref_id });
  return { pesan: 'Catatan kartu stok berhasil dihapus.' };
}

/** kartuStok.bersihkanSampah — Bersihkan seluruh mutasi dari produk yang sudah terhapus (Khusus Owner). */
function aksiKartuStokBersihkanSampah_(ctx) {
  if (ctx.user.role !== ROLE.OWNER) gagal_(KODE.FORBIDDEN, 'Hanya Owner yang berhak membersihkan riwayat kartu stok.');

  const semuaKartu = bacaSemua_('Kartu_Stok');
  const semuaProduk = bacaSemua_('Produk', { termasukTerhapus: true });

  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const idDihapus = [];
  semuaKartu.forEach(function (ks) {
    const pr = produkPeta[ks.produk_id];
    if (!pr || pr.deleted) {
      idDihapus.push(ks.id);
    }
  });

  if (idDihapus.length === 0) {
    return { pesan: 'Tidak ada catatan kartu stok dari produk terhapus.', total_dibersihkan: 0 };
  }

  idDihapus.forEach(function (id) {
    hapusLunak_('Kartu_Stok', id, ctx.user.id);
  });

  catatAudit_(ctx.user.id, 'kartu_stok_bersihkan_sampah', 'KARTU_STOK', '', { total_dibersihkan: idDihapus.length });
  return { pesan: idDihapus.length + ' catatan kartu stok dari produk terhapus berhasil dibersihkan.', total_dibersihkan: idDihapus.length };
}

/** opname.list — Daftar dokumen stok opname fisik vs sistem. */
function aksiOpnameList_(ctx) {
  const p = ctx.payload || {};
  const semuaOpname = bacaSemua_('Opname');
  const semuaProduk = bacaSemua_('Produk', { termasukTerhapus: true });
  const semuaVarian = bacaSemua_('Varian', { termasukTerhapus: true });
  const semuaUsers = bacaSemua_('Users', { termasukTerhapus: true });

  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  let data = semuaOpname.map(function (op) {
    const pr = produkPeta[op.produk_id];
    const vr = op.varian_id ? varianPeta[op.varian_id] : null;
    let namaPr = pr ? pr.nama : 'Produk Tidak Ditemukan';
    if (pr && pr.deleted) namaPr += ' (Dihapus)';
    return {
      id: op.id,
      no_opname: op.no_opname,
      tanggal: op.tanggal,
      produk_id: op.produk_id,
      produk_nama: namaPr,
      produk_sku: pr ? pr.sku : '-',
      satuan_dasar: pr ? (pr.satuan_dasar || 'PCS').toUpperCase() : 'PCS',
      varian_id: op.varian_id || '',
      varian_nama: vr ? vr.nama_varian : '',
      lokasi: op.lokasi || 'toko',
      qty_sistem: op.qty_sistem,
      qty_fisik: op.qty_fisik,
      selisih: op.selisih,
      alasan: op.alasan,
      status: op.status,
      disetujui_oleh: op.disetujui_oleh,
      penyetuju_nama: userPeta[op.disetujui_oleh] || '',
      disetujui_at: op.disetujui_at
    };
  });

  if (p.status) {
    data = data.filter(function (op) { return op.status === p.status; });
  }

  if (p.produk_id) {
    data = data.filter(function (op) { return op.produk_id === p.produk_id; });
  }

  if (p.dari) {
    data = data.filter(function (op) { return String(op.tanggal || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (op) { return String(op.tanggal || '').substring(0, 10) <= p.sampai; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (op) {
      return String(op.no_opname || '').toLowerCase().indexOf(q) !== -1 ||
        String(op.produk_nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(op.alasan || '').toLowerCase().indexOf(q) !== -1;
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

/**
 * opname.create — Buat dokumen stok opname.
 * Jika langsung_setuju === true: stok sistem langsung disesuaikan dan dicatat di Kartu_Stok.
 * Aturan Bisnis #12: Opname TIDAK MENGUBAH HPP.
 */
function aksiOpnameCreate_(ctx) {
  const p = ctx.payload || {};
  if (!p.produk_id) gagal_(KODE.VALIDATION, 'Produk wajib dipilih.');

  const produk = cariById_('Produk', p.produk_id);
  if (!produk || produk.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  let varian = null;
  if (p.varian_id) {
    varian = cariById_('Varian', p.varian_id);
    if (!varian || varian.deleted) gagal_(KODE.NOT_FOUND, 'Varian produk tidak ditemukan.');
  }

  const lokasiOpname = normalisasiLokasi_(p.lokasi, 'toko');
  const lokAwal = bacaStokLokasi_(varian || produk);
  const stokSistemSaatIni = lokasiOpname === 'gudang' ? lokAwal.stok_gudang : lokAwal.stok_toko;
  const hppSaatIni = varian ? Number(varian.hpp || 0) : Number(produk.hpp || 0);
  const qtyFisik = V_.qtyNol(p.qty_fisik, 'Kuantitas Fisik Riil');
  const selisih = bulatQty_(qtyFisik - stokSistemSaatIni);
  const alasan = V_.teks(p.alasan, 'Alasan Selisih', { wajib: true, maks: 300 });

  const langsungSetuju = p.langsung_setuju === true;
  const waktuOpname = sekarang_();
  if (langsungSetuju) cekPeriodeTerkunci_(waktuOpname);
  const noOpname = nomorBerikut_('OP');

  const dataOpname = {
    no_opname: noOpname,
    tanggal: waktuOpname,
    produk_id: produk.id,
    varian_id: varian ? varian.id : '',
    lokasi: lokasiOpname,
    qty_sistem: stokSistemSaatIni,
    qty_fisik: qtyFisik,
    selisih: selisih,
    alasan: alasan,
    status: langsungSetuju ? 'disetujui' : 'draft',
    disetujui_oleh: langsungSetuju ? ctx.user.id : '',
    disetujui_at: langsungSetuju ? waktuOpname : ''
  };

  const resOp = tambahBaris_('Opname', [dataOpname], ctx.user.id);
  const opnameBaru = resOp[0];

  if (langsungSetuju) {
    const stTokoBaru = lokasiOpname === 'toko' ? qtyFisik : lokAwal.stok_toko;
    const stGudangBaru = lokasiOpname === 'gudang' ? qtyFisik : lokAwal.stok_gudang;
    const stokTotalBaru = bulatQty_(stTokoBaru + stGudangBaru);

    // Terapkan penyesuaian stok tepat pada lokasi opname
    if (varian) {
      ubahBaris_('Varian', [{
        id: varian.id,
        data: { stok: stokTotalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru }
      }], ctx.user.id);

      const semuaV = bacaSemua_('Varian').filter(function (v) { return v.produk_id === produk.id && !v.deleted; });
      let totToko = 0;
      let totGudang = 0;
      semuaV.forEach(function (v) {
        if (v.id === varian.id) {
          totToko += stTokoBaru;
          totGudang += stGudangBaru;
        } else {
          const lv = bacaStokLokasi_(v);
          totToko += lv.stok_toko;
          totGudang += lv.stok_gudang;
        }
      });
      ubahBaris_('Produk', [{
        id: produk.id,
        data: { stok: bulatQty_(totToko + totGudang), stok_toko: bulatQty_(totToko), stok_gudang: bulatQty_(totGudang) }
      }], ctx.user.id);
    } else {
      ubahBaris_('Produk', [{
        id: produk.id,
        data: { stok: stokTotalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru }
      }], ctx.user.id);
    }

    // Catat mutasi di Kartu_Stok (Aturan Bisnis #12: HPP tidak berubah)
    tambahBaris_('Kartu_Stok', [{
      produk_id: produk.id,
      varian_id: varian ? varian.id : '',
      tipe: 'opname',
      lokasi: lokasiOpname,
      qty: selisih,
      saldo: stokTotalBaru,
      saldo_toko: stTokoBaru,
      saldo_gudang: stGudangBaru,
      hpp: hppSaatIni,
      ref_id: noOpname,
      user_id: ctx.user.id,
      keterangan: 'Stok opname ' + (lokasiOpname === 'gudang' ? 'Gudang' : 'Toko') + ' ' + noOpname + ': ' + alasan
    }], ctx.user.id);

    // Catat audit (Aturan Bisnis #8: aksi sensitif opname masuk Log_Audit)
    catatAudit_(ctx.user.id, 'opname_approve', 'STOK', noOpname, {
      produk: produk.nama,
      varian: varian ? varian.nama_varian : '',
      qty_sistem: stokSistemSaatIni,
      qty_fisik: qtyFisik,
      selisih: selisih,
      alasan: alasan
    });

    cacheHapus_('produk');
  }

  return {
    pesan: 'Dokumen stok opname ' + noOpname + (langsungSetuju ? ' berhasil diterapkan.' : ' disimpan sebagai draft.'),
    no_opname: noOpname,
    id: opnameBaru.id,
    status: dataOpname.status
  };
}

/** opname.approve — Setujui penyesuaian stok opname dari status draft (Owner & Admin). */
function aksiOpnameApprove_(ctx) {
  const p = ctx.payload || {};
  if (!p.id) gagal_(KODE.VALIDATION, 'ID opname wajib diberikan.');

  const opname = cariById_('Opname', p.id);
  if (!opname || opname.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen stok opname tidak ditemukan.');
  if (opname.status !== 'draft') {
    gagal_(KODE.CONFLICT, 'Hanya dokumen opname berstatus "draft" yang dapat disetujui.');
  }

  const produk = cariById_('Produk', opname.produk_id);
  if (!produk) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  let varian = null;
  if (opname.varian_id) {
    varian = cariById_('Varian', opname.varian_id);
  }

  const lokasiOpname = normalisasiLokasi_(opname.lokasi, 'toko');
  const lokAktual = bacaStokLokasi_(varian || produk);
  const stokSistemAktual = lokasiOpname === 'gudang' ? lokAktual.stok_gudang : lokAktual.stok_toko;
  const hppSaatIni = varian ? Number(varian.hpp || 0) : Number(produk.hpp || 0);
  const qtyFisik = Number(opname.qty_fisik);
  const selisihAktual = bulatQty_(qtyFisik - stokSistemAktual);
  const waktuSetuju = sekarang_();
  cekPeriodeTerkunci_(waktuSetuju);

  const stTokoBaru = lokasiOpname === 'toko' ? qtyFisik : lokAktual.stok_toko;
  const stGudangBaru = lokasiOpname === 'gudang' ? qtyFisik : lokAktual.stok_gudang;
  const stokTotalBaru = bulatQty_(stTokoBaru + stGudangBaru);

  // Terapkan penyesuaian stok tepat pada lokasi opname
  if (varian) {
    ubahBaris_('Varian', [{ id: varian.id, data: { stok: stokTotalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru } }], ctx.user.id);
    const semuaV = bacaSemua_('Varian').filter(function (v) { return v.produk_id === produk.id && !v.deleted; });
    let totToko = 0;
    let totGudang = 0;
    semuaV.forEach(function (v) {
      if (v.id === varian.id) {
        totToko += stTokoBaru;
        totGudang += stGudangBaru;
      } else {
        const lv = bacaStokLokasi_(v);
        totToko += lv.stok_toko;
        totGudang += lv.stok_gudang;
      }
    });
    ubahBaris_('Produk', [{ id: produk.id, data: { stok: bulatQty_(totToko + totGudang), stok_toko: bulatQty_(totToko), stok_gudang: bulatQty_(totGudang) } }], ctx.user.id);
  } else {
    ubahBaris_('Produk', [{ id: produk.id, data: { stok: stokTotalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru } }], ctx.user.id);
  }

  // Catat di Kartu_Stok memakai selisih aktual saat persetujuan agar buku besar stok 100% rekonsiliasi
  tambahBaris_('Kartu_Stok', [{
    produk_id: produk.id,
    varian_id: varian ? varian.id : '',
    tipe: 'opname',
    lokasi: lokasiOpname,
    qty: selisihAktual,
    saldo: stokTotalBaru,
    saldo_toko: stTokoBaru,
    saldo_gudang: stGudangBaru,
    hpp: hppSaatIni,
    ref_id: opname.no_opname,
    user_id: ctx.user.id,
    keterangan: 'Persetujuan opname ' + (lokasiOpname === 'gudang' ? 'Gudang' : 'Toko') + ' ' + opname.no_opname + ': ' + opname.alasan
  }], ctx.user.id);

  // Ubah status Opname + perbarui qty_sistem & selisih aktual saat persetujuan
  ubahBaris_('Opname', [{
    id: opname.id,
    data: {
      qty_sistem: stokSistemAktual,
      selisih: selisihAktual,
      status: 'disetujui',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktuSetuju
    }
  }], ctx.user.id);

  catatAudit_(ctx.user.id, 'opname_approve', 'STOK', opname.no_opname, {
    qty_sistem: stokSistemAktual,
    qty_fisik: qtyFisik,
    selisih: selisihAktual,
    alasan: opname.alasan
  });

  cacheHapus_('produk');

  return {
    pesan: 'Dokumen stok opname ' + opname.no_opname + ' berhasil disetujui dan stok disesuaikan.',
    no_opname: opname.no_opname
  };
}

/* ========================================================================== */
/* MULTI-LOKASI STOK (TOKO & GUDANG), TRANSFER STOK, & BARANG RUSAK / SUSUT   */
/* ========================================================================== */

/**
 * gudang.ringkasan — Ringkasan posisi Stok Toko vs Stok Gudang untuk semua produk & varian (Semua Role).
 */
function aksiGudangRingkasan_(ctx) {
  const p = ctx.payload || {};
  const isKasir = ctx.user.role === ROLE.KASIR;
  const semuaProduk = bacaSemua_('Produk').filter(function (pr) { return !pr.deleted && pr.aktif !== false; });
  const semuaVarian = bacaSemua_('Varian').filter(function (v) { return !v.deleted && v.aktif !== false; });
  const semuaKategori = bacaSemua_('Kategori');
  const katPeta = {};
  semuaKategori.forEach(function (k) { katPeta[k.id] = k.nama; });

  const varianByProd = {};
  semuaVarian.forEach(function (v) {
    if (!varianByProd[v.produk_id]) varianByProd[v.produk_id] = [];
    varianByProd[v.produk_id].push(v);
  });

  const items = [];
  let totalUnitToko = 0;
  let totalUnitGudang = 0;
  let countPerluIsi = 0;
  let countAdaGudang = 0;
  let countKosongTotal = 0;

  semuaProduk.forEach(function (pr) {
    const katNama = katPeta[pr.kategori_id] || 'Umum';
    if (pr.punya_varian && varianByProd[pr.id] && varianByProd[pr.id].length > 0) {
      varianByProd[pr.id].forEach(function (v) {
        const lok = bacaStokLokasi_(v);
        const sMin = Number(v.stok_min || 0);
        const perluIsi = lok.stok_toko <= sMin && lok.stok_gudang > 0;
        totalUnitToko = bulatQty_(totalUnitToko + lok.stok_toko);
        totalUnitGudang = bulatQty_(totalUnitGudang + lok.stok_gudang);
        if (perluIsi) countPerluIsi++;
        if (lok.stok_gudang > 0) countAdaGudang++;
        if (lok.stok <= 0) countKosongTotal++;

        items.push({
          id: v.id,
          produk_id: pr.id,
          varian_id: v.id,
          sku: v.sku || pr.sku || '-',
          nama: pr.nama + ' - ' + v.nama_varian,
          produk_nama: pr.nama,
          varian_nama: v.nama_varian,
          kategori: katNama,
          satuan: (pr.satuan_dasar || 'PCS').toUpperCase(),
          stok_toko: lok.stok_toko,
          stok_gudang: lok.stok_gudang,
          stok: lok.stok,
          stok_min: sMin,
          hpp: isKasir ? null : Number(v.hpp || 0),
          perlu_isi_toko: perluIsi
        });
      });
    } else {
      const lok = bacaStokLokasi_(pr);
      const sMin = Number(pr.stok_min || 0);
      const perluIsi = lok.stok_toko <= sMin && lok.stok_gudang > 0;
      totalUnitToko = bulatQty_(totalUnitToko + lok.stok_toko);
      totalUnitGudang = bulatQty_(totalUnitGudang + lok.stok_gudang);
      if (perluIsi) countPerluIsi++;
      if (lok.stok_gudang > 0) countAdaGudang++;
      if (lok.stok <= 0) countKosongTotal++;

      items.push({
        id: pr.id,
        produk_id: pr.id,
        varian_id: '',
        sku: pr.sku || '-',
        nama: pr.nama,
        produk_nama: pr.nama,
        varian_nama: '',
        kategori: katNama,
        satuan: (pr.satuan_dasar || 'PCS').toUpperCase(),
        stok_toko: lok.stok_toko,
        stok_gudang: lok.stok_gudang,
        stok: lok.stok,
        stok_min: sMin,
        hpp: isKasir ? null : Number(pr.hpp || 0),
        perlu_isi_toko: perluIsi
      });
    }
  });

  const rusakMenunggu = bacaSemua_('Barang_Rusak').filter(function (r) { return !r.deleted && r.status === 'diajukan'; }).length;

  let filtered = items;
  if (p.filter === 'perlu_isi') {
    filtered = filtered.filter(function (it) { return it.perlu_isi_toko; });
  } else if (p.filter === 'ada_gudang') {
    filtered = filtered.filter(function (it) { return it.stok_gudang > 0; });
  } else if (p.filter === 'kosong') {
    filtered = filtered.filter(function (it) { return it.stok <= 0; });
  }

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(function (it) {
      return String(it.nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(it.sku || '').toLowerCase().indexOf(q) !== -1 ||
        String(it.kategori || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Prioritaskan barang yang perlu segera diisi ke toko di urutan teratas
  filtered.sort(function (a, b) {
    if (a.perlu_isi_toko !== b.perlu_isi_toko) return a.perlu_isi_toko ? -1 : 1;
    if (b.stok_gudang !== a.stok_gudang) return b.stok_gudang - a.stok_gudang;
    return String(a.nama || '').localeCompare(String(b.nama || ''));
  });

  return {
    ringkasan: {
      total_item: items.length,
      perlu_isi_toko: countPerluIsi,
      ada_gudang: countAdaGudang,
      kosong_total: countKosongTotal,
      total_unit_toko: totalUnitToko,
      total_unit_gudang: totalUnitGudang,
      rusak_menunggu: rusakMenunggu
    },
    items: filtered.slice(0, Math.min(Math.max(parseInt(p.limit, 10) || 200, 1), 500)),
    total: filtered.length
  };
}

/**
 * gudang.transfer — Migrasi / transfer stok antar lokasi (Gudang -> Toko untuk Semua Role; Toko -> Gudang untuk Owner/Admin).
 * Mencatat pencatatan berpasangan (double-entry) di Kartu_Stok + dokumen arsip Mutasi_Lokasi (TRF-YYYYMMDD-0001).
 */
function aksiGudangTransfer_(ctx) {
  const p = ctx.payload || {};
  const arah = String(p.arah || 'gudang_ke_toko').trim().toLowerCase();
  if (arah !== 'gudang_ke_toko' && arah !== 'toko_ke_gudang') {
    gagal_(KODE.VALIDATION, 'Arah transfer wajib "gudang_ke_toko" atau "toko_ke_gudang".');
  }
  if (arah === 'toko_ke_gudang' && ctx.user.role === ROLE.KASIR) {
    gagal_(KODE.FORBIDDEN, 'Transfer balik dari Toko ke Gudang hanya dapat dilakukan oleh Owner atau Admin.');
  }

  const rawItems = Array.isArray(p.items) ? p.items : [];
  if (!rawItems.length) gagal_(KODE.VALIDATION, 'Daftar barang yang akan dimigrasi tidak boleh kosong.');

  const waktu = sekarang_();
  cekPeriodeTerkunci_(waktu);

  const asal = arah === 'gudang_ke_toko' ? 'gudang' : 'toko';
  const tujuan = arah === 'gudang_ke_toko' ? 'toko' : 'gudang';
  const pembawa = V_.teks(p.pembawa || '', 'Nama Petugas/Pembawa', { maks: 100 });
  const catatan = V_.teks(p.catatan || '', 'Catatan Transfer', { maks: 300 });

  const produkMap = {};
  bacaSemua_('Produk').forEach(function (pr) { produkMap[pr.id] = pr; });
  const varianMap = {};
  const semuaVarian = bacaSemua_('Varian');
  semuaVarian.forEach(function (v) { varianMap[v.id] = v; });
  const satuanMap = {};
  bacaSemua_('Satuan_Konversi').forEach(function (s) {
    if (!s.deleted) satuanMap[s.produk_id + '_' + String(s.satuan || '').toUpperCase()] = s;
  });

  // Validasi akumulatif kecukupan stok asal
  const butuhMap = {};
  const itemsValid = [];
  let totalQtyDasar = 0;

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const pr = produkMap[String(it.produk_id || '').trim()];
    if (!pr || pr.deleted) gagal_(KODE.NOT_FOUND, 'Produk item ke-' + (i + 1) + ' tidak ditemukan.');

    let vr = null;
    if (pr.punya_varian) {
      vr = varianMap[String(it.varian_id || '').trim()];
      if (!vr || vr.deleted || vr.produk_id !== pr.id) {
        gagal_(KODE.VALIDATION, 'Varian wajib dipilih untuk produk ' + pr.nama + '.');
      }
    } else if (it.varian_id) {
      vr = varianMap[String(it.varian_id || '').trim()] || null;
    }

    const qty = V_.qty(it.qty, 'Qty Transfer (' + pr.nama + ')');
    const satuanNama = String(it.satuan || pr.satuan_dasar || 'PCS').trim().toUpperCase();
    let faktor = Math.max(0.001, Number(it.faktor) || 1);
    if (satuanNama !== String(pr.satuan_dasar || 'PCS').toUpperCase()) {
      const satRec = satuanMap[pr.id + '_' + satuanNama];
      if (satRec) faktor = Number(satRec.faktor) || 1;
    } else {
      faktor = 1;
    }
    const qtyDasar = bulatQty_(qty * faktor);

    const kStok = pr.id + '::' + (vr ? vr.id : '');
    butuhMap[kStok] = bulatQty_((butuhMap[kStok] || 0) + qtyDasar);
    const lokAsalObj = bacaStokLokasi_(vr || pr);
    const stokAsalTersedia = asal === 'gudang' ? lokAsalObj.stok_gudang : lokAsalObj.stok_toko;
    if (stokAsalTersedia < butuhMap[kStok]) {
      const label = vr ? pr.nama + ' - ' + vr.nama_varian : pr.nama;
      gagal_(KODE.STOK_KURANG, 'Stok ' + (asal === 'gudang' ? 'Gudang' : 'Toko') + ' "' + label + '" tidak mencukupi (tersedia: ' + stokAsalTersedia + ' ' + pr.satuan_dasar + ', diminta: ' + butuhMap[kStok] + ').');
    }

    totalQtyDasar = bulatQty_(totalQtyDasar + qtyDasar);
    itemsValid.push({
      produk: pr,
      varian: vr,
      produk_id: pr.id,
      varian_id: vr ? vr.id : '',
      nama: vr ? pr.nama + ' - ' + vr.nama_varian : pr.nama,
      sku: (vr && vr.sku) || pr.sku || '-',
      satuan: satuanNama,
      satuan_dasar: (pr.satuan_dasar || 'PCS').toUpperCase(),
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      hpp: vr ? Number(vr.hpp || 0) : Number(pr.hpp || 0)
    });
  }

  const noMutasi = nomorBerikut_('TRF');
  const updateProdukMap = {};
  const updateVarianMap = {};
  const rowsKartuStok = [];
  const itemsArsip = [];

  itemsValid.forEach(function (it) {
    const targetObj = it.varian || it.produk;
    const lokSebelum = bacaStokLokasi_(targetObj);
    const stTokoBaru = tujuan === 'toko'
      ? bulatQty_(lokSebelum.stok_toko + it.qty_dasar)
      : bulatQty_(lokSebelum.stok_toko - it.qty_dasar);
    const stGudangBaru = tujuan === 'gudang'
      ? bulatQty_(lokSebelum.stok_gudang + it.qty_dasar)
      : bulatQty_(lokSebelum.stok_gudang - it.qty_dasar);
    const totalBaru = bulatQty_(stTokoBaru + stGudangBaru);

    if (it.varian) {
      it.varian.stok_toko = stTokoBaru;
      it.varian.stok_gudang = stGudangBaru;
      it.varian.stok = totalBaru;
      updateVarianMap[it.varian.id] = { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru };

      const lp = bacaStokLokasi_(it.produk);
      const prTokoBaru = tujuan === 'toko'
        ? bulatQty_(lp.stok_toko + it.qty_dasar)
        : bulatQty_(lp.stok_toko - it.qty_dasar);
      const prGudangBaru = tujuan === 'gudang'
        ? bulatQty_(lp.stok_gudang + it.qty_dasar)
        : bulatQty_(lp.stok_gudang - it.qty_dasar);
      const prTotalBaru = bulatQty_(prTokoBaru + prGudangBaru);
      it.produk.stok_toko = prTokoBaru;
      it.produk.stok_gudang = prGudangBaru;
      it.produk.stok = prTotalBaru;
      updateProdukMap[it.produk.id] = { stok: prTotalBaru, stok_toko: prTokoBaru, stok_gudang: prGudangBaru };
    } else {
      it.produk.stok_toko = stTokoBaru;
      it.produk.stok_gudang = stGudangBaru;
      it.produk.stok = totalBaru;
      updateProdukMap[it.produk.id] = { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru };
    }

    const labelArah = arah === 'gudang_ke_toko' ? 'Gudang → Toko' : 'Toko → Gudang';
    const ketTambahan = (pembawa ? ' [Pembawa: ' + pembawa + ']' : '') + (catatan ? ' - ' + catatan : '');

    // Pencatatan berpasangan (Double-Entry) di Kartu_Stok: keluar dari asal + masuk ke tujuan
    rowsKartuStok.push({
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      tipe: 'transfer_keluar',
      lokasi: asal,
      qty: -it.qty_dasar,
      saldo: totalBaru,
      saldo_toko: stTokoBaru,
      saldo_gudang: stGudangBaru,
      hpp: it.hpp,
      ref_id: noMutasi,
      user_id: ctx.user.id,
      keterangan: 'Transfer ' + labelArah + ' ' + noMutasi + ' (' + it.qty + ' ' + it.satuan + ')' + ketTambahan
    });
    rowsKartuStok.push({
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      tipe: 'transfer_masuk',
      lokasi: tujuan,
      qty: it.qty_dasar,
      saldo: totalBaru,
      saldo_toko: stTokoBaru,
      saldo_gudang: stGudangBaru,
      hpp: it.hpp,
      ref_id: noMutasi,
      user_id: ctx.user.id,
      keterangan: 'Transfer ' + labelArah + ' ' + noMutasi + ' (' + it.qty + ' ' + it.satuan + ')' + ketTambahan
    });

    itemsArsip.push({
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      nama: it.nama,
      sku: it.sku,
      satuan: it.satuan,
      satuan_dasar: it.satuan_dasar,
      faktor: it.faktor,
      qty: it.qty,
      qty_dasar: it.qty_dasar,
      stok_toko_sebelum: lokSebelum.stok_toko,
      stok_toko_sesudah: stTokoBaru,
      stok_gudang_sebelum: lokSebelum.stok_gudang,
      stok_gudang_sesudah: stGudangBaru
    });
  });

  const updProduk = Object.keys(updateProdukMap).map(function (id) { return { id: id, data: updateProdukMap[id] }; });
  const updVarian = Object.keys(updateVarianMap).map(function (id) { return { id: id, data: updateVarianMap[id] }; });
  if (updVarian.length) ubahBaris_('Varian', updVarian, ctx.user.id);
  if (updProduk.length) ubahBaris_('Produk', updProduk, ctx.user.id);
  if (rowsKartuStok.length) tambahBaris_('Kartu_Stok', rowsKartuStok, ctx.user.id);

  const mutasiBaru = tambahBaris_('Mutasi_Lokasi', [{
    no_mutasi: noMutasi,
    tanggal: waktu,
    arah: arah,
    asal: asal,
    tujuan: tujuan,
    pembawa: pembawa,
    catatan: catatan,
    total_item: itemsArsip.length,
    total_qty_dasar: totalQtyDasar,
    items_json: itemsArsip,
    status: 'selesai',
    void_alasan: '',
    void_oleh: '',
    void_at: ''
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'gudang_transfer', 'STOK', noMutasi, {
    arah: arah,
    total_item: itemsArsip.length,
    total_qty_dasar: totalQtyDasar,
    pembawa: pembawa
  });
  cacheHapus_('produk');

  return {
    pesan: 'Transfer stok ' + noMutasi + ' (' + itemsArsip.length + ' barang) berhasil dicatat.',
    mutasi: Object.assign({}, mutasiBaru, {
      petugas_nama: ctx.user.nama || ctx.user.username || 'Petugas',
      items: itemsArsip
    })
  };
}

/** gudang.transferList — Riwayat dokumen mutasi lokasi (TRF-...) lengkap. */
function aksiGudangTransferList_(ctx) {
  const p = ctx.payload || {};
  const userPeta = {};
  bacaSemua_('Users', { termasukTerhapus: true }).forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  let list = bacaSemua_('Mutasi_Lokasi').map(function (m) {
    const items = Array.isArray(m.items_json) ? m.items_json : [];
    return Object.assign({}, m, {
      items: items,
      petugas_nama: userPeta[m.created_by] || m.created_by || 'Petugas',
      void_oleh_nama: m.void_oleh ? (userPeta[m.void_oleh] || m.void_oleh) : ''
    });
  });

  if (p.arah === 'gudang_ke_toko' || p.arah === 'toko_ke_gudang') {
    list = list.filter(function (m) { return m.arah === p.arah; });
  }
  if (p.dari) {
    list = list.filter(function (m) { return String(m.tanggal || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    list = list.filter(function (m) { return String(m.tanggal || '').substring(0, 10) <= p.sampai; });
  }
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    list = list.filter(function (m) {
      const hay = (String(m.no_mutasi || '') + ' ' + String(m.pembawa || '') + ' ' + String(m.catatan || '') + ' ' + String(m.petugas_nama || '')).toLowerCase();
      if (hay.indexOf(q) !== -1) return true;
      return m.items.some(function (it) { return String(it.nama || '').toLowerCase().indexOf(q) !== -1; });
    });
  }

  list.sort(function (a, b) { return String(b.tanggal || '').localeCompare(String(a.tanggal || '')); });
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 50, 1), 200);
  return { items: list.slice(0, limit), total: list.length };
}

/** gudang.transferVoid — Batalkan dokumen transfer stok salah input (Khusus Owner, wajib alasan). */
function aksiGudangTransferVoid_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Transfer', { wajib: true });
  const alasan = V_.teks(p.alasan, 'Alasan Pembatalan Transfer', { wajib: true, min: 4, maks: 300 });

  const mutasi = cariById_('Mutasi_Lokasi', id);
  if (!mutasi || mutasi.deleted) gagal_(KODE.NOT_FOUND, 'Dokumen transfer tidak ditemukan.');
  if (mutasi.status === 'void') gagal_(KODE.CONFLICT, 'Dokumen transfer ini sudah dibatalkan sebelumnya.');

  const waktu = sekarang_();
  cekPeriodeTerkunci_(mutasi.tanggal || waktu);
  cekPeriodeTerkunci_(waktu);

  const items = Array.isArray(mutasi.items_json) ? mutasi.items_json : [];
  const produkMap = {};
  bacaSemua_('Produk').forEach(function (pr) { produkMap[pr.id] = pr; });
  const varianMap = {};
  bacaSemua_('Varian').forEach(function (v) { varianMap[v.id] = v; });

  const asalBalik = mutasi.tujuan; // diambil kembali dari tujuan awal
  const tujuanBalik = mutasi.asal; // dikembalikan ke asal awal
  const updateProdukMap = {};
  const updateVarianMap = {};
  const rowsKartuStok = [];

  items.forEach(function (it) {
    const pr = produkMap[it.produk_id];
    if (!pr) return;
    const vr = it.varian_id ? varianMap[it.varian_id] : null;
    const qd = Number(it.qty_dasar || 0);
    if (qd <= 0) return;

    const targetObj = vr || pr;
    const lok = bacaStokLokasi_(targetObj);
    const stokDiAsalBalik = asalBalik === 'toko' ? lok.stok_toko : lok.stok_gudang;
    if (stokDiAsalBalik < qd) {
      gagal_(KODE.STOK_KURANG, 'Tidak dapat membatalkan transfer: stok ' + (asalBalik === 'toko' ? 'Toko' : 'Gudang') + ' untuk "' + it.nama + '" tersisa ' + stokDiAsalBalik + ' (kurang dari ' + qd + ' yang akan dikembalikan).');
    }

    const stTokoBaru = tujuanBalik === 'toko' ? bulatQty_(lok.stok_toko + qd) : bulatQty_(lok.stok_toko - qd);
    const stGudangBaru = tujuanBalik === 'gudang' ? bulatQty_(lok.stok_gudang + qd) : bulatQty_(lok.stok_gudang - qd);
    const totalBaru = bulatQty_(stTokoBaru + stGudangBaru);
    const hpp = vr ? Number(vr.hpp || 0) : Number(pr.hpp || 0);

    if (vr) {
      vr.stok_toko = stTokoBaru;
      vr.stok_gudang = stGudangBaru;
      vr.stok = totalBaru;
      updateVarianMap[vr.id] = { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru };

      const lp = bacaStokLokasi_(pr);
      const prT = tujuanBalik === 'toko' ? bulatQty_(lp.stok_toko + qd) : bulatQty_(lp.stok_toko - qd);
      const prG = tujuanBalik === 'gudang' ? bulatQty_(lp.stok_gudang + qd) : bulatQty_(lp.stok_gudang - qd);
      pr.stok_toko = prT;
      pr.stok_gudang = prG;
      pr.stok = bulatQty_(prT + prG);
      updateProdukMap[pr.id] = { stok: pr.stok, stok_toko: prT, stok_gudang: prG };
    } else {
      pr.stok_toko = stTokoBaru;
      pr.stok_gudang = stGudangBaru;
      pr.stok = totalBaru;
      updateProdukMap[pr.id] = { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru };
    }

    rowsKartuStok.push({
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      tipe: 'void',
      lokasi: asalBalik,
      qty: -qd,
      saldo: totalBaru,
      saldo_toko: stTokoBaru,
      saldo_gudang: stGudangBaru,
      hpp: hpp,
      ref_id: mutasi.no_mutasi,
      user_id: ctx.user.id,
      keterangan: 'Batal transfer ' + mutasi.no_mutasi + ': ' + alasan
    });
    rowsKartuStok.push({
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      tipe: 'void',
      lokasi: tujuanBalik,
      qty: qd,
      saldo: totalBaru,
      saldo_toko: stTokoBaru,
      saldo_gudang: stGudangBaru,
      hpp: hpp,
      ref_id: mutasi.no_mutasi,
      user_id: ctx.user.id,
      keterangan: 'Batal transfer ' + mutasi.no_mutasi + ' (balik ke ' + (tujuanBalik === 'gudang' ? 'Gudang' : 'Toko') + '): ' + alasan
    });
  });

  const updP = Object.keys(updateProdukMap).map(function (k) { return { id: k, data: updateProdukMap[k] }; });
  const updV = Object.keys(updateVarianMap).map(function (k) { return { id: k, data: updateVarianMap[k] }; });
  if (updV.length) ubahBaris_('Varian', updV, ctx.user.id);
  if (updP.length) ubahBaris_('Produk', updP, ctx.user.id);
  if (rowsKartuStok.length) tambahBaris_('Kartu_Stok', rowsKartuStok, ctx.user.id);

  ubahBaris_('Mutasi_Lokasi', [{
    id: mutasi.id,
    data: { status: 'void', void_alasan: alasan, void_oleh: ctx.user.id, void_at: waktu }
  }], ctx.user.id);

  catatAudit_(ctx.user.id, 'gudang_transfer_void', 'STOK', mutasi.no_mutasi, { alasan: alasan });
  cacheHapus_('produk');

  return { pesan: 'Transfer ' + mutasi.no_mutasi + ' berhasil dibatalkan & stok dikembalikan.' };
}

/** Helper internal: Terapkan pemotongan stok saat laporan Barang_Rusak disetujui. */
function terapkanEfekBarangRusak_(rec, ctx) {
  const pr = cariById_('Produk', rec.produk_id);
  if (!pr || pr.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');
  const vr = rec.varian_id ? cariById_('Varian', rec.varian_id) : null;
  const lok = normalisasiLokasi_(rec.lokasi, 'toko');
  const qd = Number(rec.qty_dasar || 0);
  const pengaturan = ambilPengaturan_();

  const targetObj = vr || pr;
  const lokSebelum = bacaStokLokasi_(targetObj);
  const stokTersedia = lok === 'gudang' ? lokSebelum.stok_gudang : lokSebelum.stok_toko;
  if (!pengaturan.stok_minus && stokTersedia < qd) {
    gagal_(KODE.STOK_KURANG, 'Stok ' + (lok === 'gudang' ? 'Gudang' : 'Toko') + ' "' + rec.nama + '" tidak mencukupi untuk disetujui rusak (tersedia: ' + stokTersedia + ', laporan: ' + qd + ').');
  }

  const stTokoBaru = lok === 'toko' ? bulatQty_(lokSebelum.stok_toko - qd) : lokSebelum.stok_toko;
  const stGudangBaru = lok === 'gudang' ? bulatQty_(lokSebelum.stok_gudang - qd) : lokSebelum.stok_gudang;
  const totalBaru = bulatQty_(stTokoBaru + stGudangBaru);
  const hpp = vr ? Number(vr.hpp || 0) : Number(pr.hpp || 0);

  if (vr) {
    ubahBaris_('Varian', [{ id: vr.id, data: { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru } }], ctx.user.id);
    const lp = bacaStokLokasi_(pr);
    const prT = lok === 'toko' ? bulatQty_(lp.stok_toko - qd) : lp.stok_toko;
    const prG = lok === 'gudang' ? bulatQty_(lp.stok_gudang - qd) : lp.stok_gudang;
    ubahBaris_('Produk', [{ id: pr.id, data: { stok: bulatQty_(prT + prG), stok_toko: prT, stok_gudang: prG } }], ctx.user.id);
  } else {
    ubahBaris_('Produk', [{ id: pr.id, data: { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru } }], ctx.user.id);
  }

  tambahBaris_('Kartu_Stok', [{
    produk_id: pr.id,
    varian_id: vr ? vr.id : '',
    tipe: 'rusak',
    lokasi: lok,
    qty: -qd,
    saldo: totalBaru,
    saldo_toko: stTokoBaru,
    saldo_gudang: stGudangBaru,
    hpp: hpp,
    ref_id: rec.no_rusak,
    user_id: ctx.user.id,
    keterangan: 'Barang rusak (' + rec.kategori_rusak + ') di ' + (lok === 'gudang' ? 'Gudang' : 'Toko') + ' ' + rec.no_rusak + ': ' + (rec.keterangan || '-')
  }], ctx.user.id);

  cacheHapus_('produk');
}

/** rusak.list — Daftar laporan barang rusak / susut + ringkasan kerugian. */
function aksiRusakList_(ctx) {
  const p = ctx.payload || {};
  const isOwner = ctx.user.role === ROLE.OWNER;
  const userPeta = {};
  bacaSemua_('Users', { termasukTerhapus: true }).forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  let list = bacaSemua_('Barang_Rusak').map(function (r) {
    return Object.assign({}, r, {
      hpp: isOwner ? Number(r.hpp || 0) : null,
      nilai_kerugian: isOwner ? Number(r.nilai_kerugian || 0) : null,
      penyetuju_nama: r.disetujui_oleh ? (userPeta[r.disetujui_oleh] || r.disetujui_oleh) : ''
    });
  });

  if (p.status) list = list.filter(function (r) { return r.status === p.status; });
  if (p.lokasi === 'toko' || p.lokasi === 'gudang') list = list.filter(function (r) { return r.lokasi === p.lokasi; });
  if (p.tindak_lanjut) list = list.filter(function (r) { return r.tindak_lanjut === p.tindak_lanjut; });
  if (p.dari) list = list.filter(function (r) { return String(r.tanggal || '').substring(0, 10) >= p.dari; });
  if (p.sampai) list = list.filter(function (r) { return String(r.tanggal || '').substring(0, 10) <= p.sampai; });

  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    list = list.filter(function (r) {
      const hay = (String(r.no_rusak || '') + ' ' + String(r.nama || '') + ' ' + String(r.kategori_rusak || '') + ' ' + String(r.keterangan || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  let countDiajukan = 0;
  let countDisetujui = 0;
  let countKlaimAktif = 0;
  let totalKerugian = 0;
  list.forEach(function (r) {
    if (r.status === 'diajukan') countDiajukan++;
    if (r.status === 'disetujui') {
      countDisetujui++;
      if (r.tindak_lanjut === 'klaim_supplier' && r.klaim_status === 'menunggu') countKlaimAktif++;
      if (r.klaim_status !== 'diganti_barang') totalKerugian += Number(r.nilai_kerugian || 0);
    }
  });

  list.sort(function (a, b) { return String(b.tanggal || '').localeCompare(String(a.tanggal || '')); });
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || 100, 1), 300);

  return {
    ringkasan: {
      total_laporan: list.length,
      diajukan: countDiajukan,
      disetujui: countDisetujui,
      klaim_menunggu: countKlaimAktif,
      total_kerugian: isOwner ? Math.round(totalKerugian) : null
    },
    items: list.slice(0, limit),
    total: list.length
  };
}

/** rusak.create — Lapor barang rusak / susut. Kasir -> 'diajukan'; Owner/Admin -> langsung 'disetujui' & potong stok. */
function aksiRusakCreate_(ctx) {
  const p = ctx.payload || {};
  const pr = cariById_('Produk', String(p.produk_id || '').trim());
  if (!pr || pr.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  let vr = null;
  if (pr.punya_varian) {
    vr = cariById_('Varian', String(p.varian_id || '').trim());
    if (!vr || vr.deleted || vr.produk_id !== pr.id) gagal_(KODE.VALIDATION, 'Varian wajib dipilih untuk produk ' + pr.nama + '.');
  } else if (p.varian_id) {
    vr = cariById_('Varian', String(p.varian_id || '').trim());
  }

  const lokasi = normalisasiLokasi_(p.lokasi, 'toko');
  const qty = V_.qty(p.qty, 'Qty Barang Rusak');
  const faktor = Math.max(0.001, Number(p.faktor) || 1);
  const qtyDasar = bulatQty_(qty * faktor);
  const kategoriRusak = V_.teks(p.kategori_rusak || 'Pecah / Rusak Fisik', 'Kategori Kerusakan', { wajib: true, maks: 80 });
  const tindakLanjut = p.tindak_lanjut === 'klaim_supplier' ? 'klaim_supplier' : 'write_off';
  const keterangan = V_.teks(p.keterangan || '', 'Keterangan Kerusakan', { wajib: true, min: 3, maks: 400 });
  const fotoUrl = V_.teks(p.foto_url || '', 'URL Foto Bukti', { maks: 500 });

  const waktu = sekarang_();
  cekPeriodeTerkunci_(waktu);

  const lokObj = bacaStokLokasi_(vr || pr);
  const stokTersedia = lokasi === 'gudang' ? lokObj.stok_gudang : lokObj.stok_toko;
  const pengaturan = ambilPengaturan_();
  if (!pengaturan.stok_minus && stokTersedia < qtyDasar) {
    gagal_(KODE.STOK_KURANG, 'Stok ' + (lokasi === 'gudang' ? 'Gudang' : 'Toko') + ' hanya tersisa ' + stokTersedia + ' ' + pr.satuan_dasar + ', tidak bisa melaporkan rusak ' + qtyDasar + '.');
  }

  const isOwnerAdmin = ctx.user.role === ROLE.OWNER || ctx.user.role === ROLE.ADMIN;
  const statusAwal = isOwnerAdmin ? 'disetujui' : 'diajukan';
  const hppDasar = vr ? Number(vr.hpp || 0) : Number(pr.hpp || 0);
  const nilaiKerugian = Math.round(qtyDasar * hppDasar);
  const noRusak = nomorBerikut_('RSK');

  const rec = tambahBaris_('Barang_Rusak', [{
    no_rusak: noRusak,
    tanggal: waktu,
    produk_id: pr.id,
    varian_id: vr ? vr.id : '',
    nama: vr ? pr.nama + ' - ' + vr.nama_varian : pr.nama,
    satuan: String(p.satuan || pr.satuan_dasar || 'PCS').toUpperCase(),
    faktor: faktor,
    qty: qty,
    qty_dasar: qtyDasar,
    lokasi: lokasi,
    kategori_rusak: kategoriRusak,
    tindak_lanjut: tindakLanjut,
    hpp: hppDasar,
    nilai_kerugian: nilaiKerugian,
    foto_url: fotoUrl,
    keterangan: keterangan,
    status: statusAwal,
    pelapor_id: ctx.user.id,
    pelapor_nama: ctx.user.nama || ctx.user.username || 'Petugas',
    disetujui_oleh: isOwnerAdmin ? ctx.user.id : '',
    disetujui_at: isOwnerAdmin ? waktu : '',
    klaim_status: tindakLanjut === 'klaim_supplier' ? 'menunggu' : '',
    klaim_at: '',
    klaim_catatan: ''
  }], ctx.user.id)[0];

  if (isOwnerAdmin) {
    terapkanEfekBarangRusak_(rec, ctx);
  }

  catatAudit_(ctx.user.id, isOwnerAdmin ? 'rusak_create_approve' : 'rusak_ajukan', 'STOK', noRusak, {
    nama: rec.nama,
    lokasi: lokasi,
    qty_dasar: qtyDasar,
    kategori_rusak: kategoriRusak,
    tindak_lanjut: tindakLanjut,
    nilai_kerugian: nilaiKerugian
  });

  return {
    pesan: isOwnerAdmin
      ? 'Laporan barang rusak ' + noRusak + ' disetujui & stok ' + (lokasi === 'gudang' ? 'Gudang' : 'Toko') + ' telah dipotong.'
      : 'Laporan barang rusak ' + noRusak + ' berhasil diajukan untuk persetujuan Owner/Admin.',
    item: rec
  };
}

/** rusak.approve — Setujui laporan barang rusak dari kasir (Owner & Admin). */
function aksiRusakApprove_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Laporan Rusak', { wajib: true });
  const rec = cariById_('Barang_Rusak', id);
  if (!rec || rec.deleted) gagal_(KODE.NOT_FOUND, 'Laporan barang rusak tidak ditemukan.');
  if (rec.status !== 'diajukan') gagal_(KODE.CONFLICT, 'Hanya laporan berstatus "diajukan" yang dapat disetujui.');

  const waktu = sekarang_();
  cekPeriodeTerkunci_(waktu);

  terapkanEfekBarangRusak_(rec, ctx);

  const diubah = ubahBaris_('Barang_Rusak', [{
    id: rec.id,
    data: { status: 'disetujui', disetujui_oleh: ctx.user.id, disetujui_at: waktu }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'rusak_approve', 'STOK', rec.no_rusak, {
    nama: rec.nama,
    lokasi: rec.lokasi,
    qty_dasar: rec.qty_dasar,
    nilai_kerugian: rec.nilai_kerugian
  });

  return { pesan: 'Laporan barang rusak ' + rec.no_rusak + ' disetujui & stok berhasil dipotong.', item: diubah };
}

/** rusak.reject — Tolak laporan barang rusak (Owner & Admin). */
function aksiRusakReject_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Laporan Rusak', { wajib: true });
  const alasan = V_.teks(p.alasan || 'Ditolak setelah pemeriksaan fisik', 'Alasan Penolakan', { maks: 300 });
  const rec = cariById_('Barang_Rusak', id);
  if (!rec || rec.deleted) gagal_(KODE.NOT_FOUND, 'Laporan barang rusak tidak ditemukan.');
  if (rec.status !== 'diajukan') gagal_(KODE.CONFLICT, 'Hanya laporan berstatus "diajukan" yang dapat ditolak.');

  const waktu = sekarang_();
  const diubah = ubahBaris_('Barang_Rusak', [{
    id: rec.id,
    data: {
      status: 'ditolak',
      keterangan: (rec.keterangan ? rec.keterangan + ' | ' : '') + '[Ditolak: ' + alasan + ']',
      disetujui_oleh: ctx.user.id,
      disetujui_at: waktu
    }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'rusak_reject', 'STOK', rec.no_rusak, { alasan: alasan });
  return { pesan: 'Laporan barang rusak ' + rec.no_rusak + ' ditolak.', item: diubah };
}

/** rusak.selesaikanKlaim — Tindak lanjut klaim supplier: 'diganti_barang' (stok kembali) atau 'ditolak_supplier' (jadi kerugian). */
function aksiRusakSelesaikanKlaim_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Laporan Rusak', { wajib: true });
  const hasil = String(p.hasil || '').trim().toLowerCase();
  if (hasil !== 'diganti_barang' && hasil !== 'ditolak_supplier') {
    gagal_(KODE.VALIDATION, 'Hasil klaim wajib "diganti_barang" atau "ditolak_supplier".');
  }
  const catatan = V_.teks(p.catatan || '', 'Catatan Klaim', { maks: 300 });

  const rec = cariById_('Barang_Rusak', id);
  if (!rec || rec.deleted) gagal_(KODE.NOT_FOUND, 'Laporan barang rusak tidak ditemukan.');
  if (rec.status !== 'disetujui' || rec.tindak_lanjut !== 'klaim_supplier') {
    gagal_(KODE.CONFLICT, 'Hanya laporan barang rusak berstatus disetujui dengan tindak lanjut Klaim Supplier yang dapat diselesaikan.');
  }
  if (rec.klaim_status === 'diganti_barang' || rec.klaim_status === 'ditolak_supplier') {
    gagal_(KODE.CONFLICT, 'Klaim supplier ini sudah diselesaikan sebelumnya.');
  }

  const waktu = sekarang_();
  cekPeriodeTerkunci_(waktu);

  if (hasil === 'diganti_barang') {
    const lokTujuan = normalisasiLokasi_(p.lokasi_tujuan || rec.lokasi, 'gudang');
    const pr = cariById_('Produk', rec.produk_id);
    if (!pr || pr.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');
    const vr = rec.varian_id ? cariById_('Varian', rec.varian_id) : null;
    const qd = Number(rec.qty_dasar || 0);
    const targetObj = vr || pr;
    const lok = bacaStokLokasi_(targetObj);
    const stTokoBaru = lokTujuan === 'toko' ? bulatQty_(lok.stok_toko + qd) : lok.stok_toko;
    const stGudangBaru = lokTujuan === 'gudang' ? bulatQty_(lok.stok_gudang + qd) : lok.stok_gudang;
    const totalBaru = bulatQty_(stTokoBaru + stGudangBaru);
    const hpp = vr ? Number(vr.hpp || 0) : Number(pr.hpp || 0);

    if (vr) {
      ubahBaris_('Varian', [{ id: vr.id, data: { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru } }], ctx.user.id);
      const lp = bacaStokLokasi_(pr);
      const prT = lokTujuan === 'toko' ? bulatQty_(lp.stok_toko + qd) : lp.stok_toko;
      const prG = lokTujuan === 'gudang' ? bulatQty_(lp.stok_gudang + qd) : lp.stok_gudang;
      ubahBaris_('Produk', [{ id: pr.id, data: { stok: bulatQty_(prT + prG), stok_toko: prT, stok_gudang: prG } }], ctx.user.id);
    } else {
      ubahBaris_('Produk', [{ id: pr.id, data: { stok: totalBaru, stok_toko: stTokoBaru, stok_gudang: stGudangBaru } }], ctx.user.id);
    }

    tambahBaris_('Kartu_Stok', [{
      produk_id: pr.id,
      varian_id: vr ? vr.id : '',
      tipe: 'klaim_ganti',
      lokasi: lokTujuan,
      qty: qd,
      saldo: totalBaru,
      saldo_toko: stTokoBaru,
      saldo_gudang: stGudangBaru,
      hpp: hpp,
      ref_id: rec.no_rusak,
      user_id: ctx.user.id,
      keterangan: 'Penggantian klaim supplier ' + rec.no_rusak + ' → ' + (lokTujuan === 'gudang' ? 'Gudang' : 'Toko') + (catatan ? ': ' + catatan : '')
    }], ctx.user.id);
    cacheHapus_('produk');
  }

  const diubah = ubahBaris_('Barang_Rusak', [{
    id: rec.id,
    data: {
      klaim_status: hasil,
      klaim_at: waktu,
      klaim_catatan: catatan,
      nilai_kerugian: hasil === 'diganti_barang' ? 0 : rec.nilai_kerugian,
      tindak_lanjut: hasil === 'ditolak_supplier' ? 'write_off' : rec.tindak_lanjut
    }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'rusak_klaim_' + hasil, 'STOK', rec.no_rusak, { hasil: hasil, catatan: catatan });

  return {
    pesan: hasil === 'diganti_barang'
      ? 'Klaim ' + rec.no_rusak + ' selesai: barang pengganti dari supplier telah ditambahkan kembali ke stok.'
      : 'Klaim ' + rec.no_rusak + ' ditolak supplier & dibukukan sebagai kerugian barang rusak.',
    item: diubah
  };
}

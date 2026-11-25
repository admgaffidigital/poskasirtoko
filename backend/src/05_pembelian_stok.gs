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

    itemsDiproses.push({
      produk: produk,
      varian: varian,
      nama: it.nama || (varian ? produk.nama + ' - ' + varian.nama_varian : produk.nama),
      satuan: it.satuan || produk.satuan_dasar,
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
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

  // 2. Simpan Item Pembelian & Proses Efek Stok + HPP Moving Average (termasuk Landed Cost Ongkir & Bongkar)
  const rowsItemBeli = [];
  const rowsKartuStok = [];
  const perbaruiProdukList = [];
  const perbaruiVarianList = [];
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
      subtotal: item.subtotal
    });

    if (item.varian) {
      const stokLamaVarian = Number(item.varian.stok || 0);
      const hppLamaVarian = Number(item.varian.hpp || 0);
      const hppBaruVarian = hitungHppBaru_(stokLamaVarian, hppLamaVarian, item.qty_dasar, hargaBeliDasarEfektif);
      const stokBaruVarian = Math.round((stokLamaVarian + item.qty_dasar) * 1000) / 1000;

      perbaruiVarianList.push({
        id: item.varian.id,
        data: {
          stok: stokBaruVarian,
          hpp: hppBaruVarian
        }
      });

      // Update stok total produk induk
      const stokLamaProduk = Number(item.produk.stok || 0);
      const stokBaruProduk = Math.round((stokLamaProduk + item.qty_dasar) * 1000) / 1000;
      perbaruiProdukList.push({
        id: item.produk.id,
        data: {
          stok: stokBaruProduk
        }
      });

      rowsKartuStok.push({
        produk_id: item.produk.id,
        varian_id: item.varian.id,
        tipe: 'beli',
        qty: item.qty_dasar,
        saldo: stokBaruVarian,
        hpp: hppBaruVarian,
        ref_id: noFaktur,
        user_id: ctx.user.id,
        keterangan: 'Pembelian ' + noFaktur + ' (' + supplier.nama + ')' + ketLanded
      });
    } else {
      const stokLama = Number(item.produk.stok || 0);
      const hppLama = Number(item.produk.hpp || 0);
      const hppBaru = hitungHppBaru_(stokLama, hppLama, item.qty_dasar, hargaBeliDasarEfektif);
      const stokBaru = Math.round((stokLama + item.qty_dasar) * 1000) / 1000;

      perbaruiProdukList.push({
        id: item.produk.id,
        data: {
          stok: stokBaru,
          hpp: hppBaru
        }
      });

      rowsKartuStok.push({
        produk_id: item.produk.id,
        varian_id: '',
        tipe: 'beli',
        qty: item.qty_dasar,
        saldo: stokBaru,
        hpp: hppBaru,
        ref_id: noFaktur,
        user_id: ctx.user.id,
        keterangan: 'Pembelian ' + noFaktur + ' (' + supplier.nama + ')' + ketLanded
      });
    }
  });

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
      qty: ks.qty,
      saldo: ks.saldo,
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

  const stokSistemSaatIni = varian ? Number(varian.stok || 0) : Number(produk.stok || 0);
  const hppSaatIni = varian ? Number(varian.hpp || 0) : Number(produk.hpp || 0);
  const qtyFisik = V_.qtyNol(p.qty_fisik, 'Kuantitas Fisik Riil');
  const selisih = Math.round((qtyFisik - stokSistemSaatIni) * 1000) / 1000;
  const alasan = V_.teks(p.alasan, 'Alasan Selisih', { wajib: true, maks: 300 });

  const langsungSetuju = p.langsung_setuju === true;
  const noOpname = nomorBerikut_('OP');
  const waktuOpname = sekarang_();

  const dataOpname = {
    no_opname: noOpname,
    tanggal: waktuOpname,
    produk_id: produk.id,
    varian_id: varian ? varian.id : '',
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
    // Terapkan penyesuaian stok
    if (varian) {
      ubahBaris_('Varian', [{
        id: varian.id,
        data: { stok: qtyFisik }
      }], ctx.user.id);

      // Hitung ulang total stok induk produk
      const semuaV = bacaSemua_('Varian').filter(function (v) { return v.produk_id === produk.id && !v.deleted; });
      let totalVarianStok = 0;
      semuaV.forEach(function (v) {
        totalVarianStok += (v.id === varian.id ? qtyFisik : Number(v.stok || 0));
      });
      ubahBaris_('Produk', [{
        id: produk.id,
        data: { stok: Math.round(totalVarianStok * 1000) / 1000 }
      }], ctx.user.id);
    } else {
      ubahBaris_('Produk', [{
        id: produk.id,
        data: { stok: qtyFisik }
      }], ctx.user.id);
    }

    // Catat mutasi di Kartu_Stok (Aturan Bisnis #12: HPP tidak berubah)
    tambahBaris_('Kartu_Stok', [{
      produk_id: produk.id,
      varian_id: varian ? varian.id : '',
      tipe: 'opname',
      qty: selisih,
      saldo: qtyFisik,
      hpp: hppSaatIni,
      ref_id: noOpname,
      user_id: ctx.user.id,
      keterangan: 'Stok opname ' + noOpname + ': ' + alasan
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

  const stokSistemAktual = varian ? Number(varian.stok || 0) : Number(produk.stok || 0);
  const hppSaatIni = varian ? Number(varian.hpp || 0) : Number(produk.hpp || 0);
  const qtyFisik = Number(opname.qty_fisik);
  const selisihAktual = Math.round((qtyFisik - stokSistemAktual) * 1000) / 1000;
  const waktuSetuju = sekarang_();

  // Terapkan penyesuaian stok ke master
  if (varian) {
    ubahBaris_('Varian', [{ id: varian.id, data: { stok: qtyFisik } }], ctx.user.id);
    const semuaV = bacaSemua_('Varian').filter(function (v) { return v.produk_id === produk.id && !v.deleted; });
    let totalVarianStok = 0;
    semuaV.forEach(function (v) {
      totalVarianStok += (v.id === varian.id ? qtyFisik : Number(v.stok || 0));
    });
    ubahBaris_('Produk', [{ id: produk.id, data: { stok: Math.round(totalVarianStok * 1000) / 1000 } }], ctx.user.id);
  } else {
    ubahBaris_('Produk', [{ id: produk.id, data: { stok: qtyFisik } }], ctx.user.id);
  }

  // Catat di Kartu_Stok memakai selisih aktual saat persetujuan agar buku besar stok 100% rekonsiliasi
  tambahBaris_('Kartu_Stok', [{
    produk_id: produk.id,
    varian_id: varian ? varian.id : '',
    tipe: 'opname',
    qty: selisihAktual,
    saldo: qtyFisik,
    hpp: hppSaatIni,
    ref_id: opname.no_opname,
    user_id: ctx.user.id,
    keterangan: 'Persetujuan opname ' + opname.no_opname + ': ' + opname.alasan
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

/* ---------- 9.2 KATEGORI PRODUK ---------- */

/** kategori.list — Mengambil semua kategori aktif. */
function aksiKategoriList_() {
  const items = bacaSemua_('Kategori').filter(function (k) { return !k.deleted; });
  items.sort(function (a, b) {
    const ua = Number(a.urutan) || 0;
    const ub = Number(b.urutan) || 0;
    if (ua !== ub) return ua - ub;
    return String(a.nama || '').localeCompare(String(b.nama || ''));
  });
  return { items: items };
}

/** kategori.create — Tambah kategori baru (Owner & Admin). */
function aksiKategoriCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Kategori', { wajib: true, maks: 100 });
  const parentId = p.parent_id ? String(p.parent_id).trim() : '';
  const urutan = V_.angka(p.urutan, 'Urutan', { bawaan: 0 });

  const namaTrim = nama.trim().toLowerCase();
  const kategoriSemua = bacaSemua_('Kategori');

  if (!parentId) {
    // Validasi Kategori Utama tidak boleh duplikat nama (case-insensitive & trimmed)
    const adaDuplikat = kategoriSemua.some(function (k) {
      return !k.deleted && !k.parent_id && String(k.nama || '').trim().toLowerCase() === namaTrim;
    });
    if (adaDuplikat) {
      gagal_(KODE.CONFLICT, 'Kategori utama "' + nama + '" sudah terdaftar. Silakan gunakan nama lain.');
    }
  } else {
    // Validasi Sub-Kategori tidak boleh kembar di bawah kategori induk yang sama
    const adaDuplikat = kategoriSemua.some(function (k) {
      return !k.deleted && String(k.parent_id || '') === parentId && String(k.nama || '').trim().toLowerCase() === namaTrim;
    });
    if (adaDuplikat) {
      gagal_(KODE.CONFLICT, 'Sub-kategori "' + nama + '" di bawah kategori induk ini sudah terdaftar. Silakan gunakan nama lain.');
    }
  }

  const dibuat = tambahBaris_('Kategori', [{
    nama: nama,
    parent_id: parentId,
    urutan: urutan
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'kategori_tambah', 'KATEGORI', dibuat.id, { nama: nama });
  return dibuat;
}

/** kategori.update — Edit kategori (Owner & Admin). */
function aksiKategoriUpdate_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Kategori', { wajib: true });
  const nama = V_.teks(p.nama, 'Nama Kategori', { wajib: true, maks: 100 });
  const parentId = p.parent_id ? String(p.parent_id).trim() : '';
  const urutan = V_.angka(p.urutan, 'Urutan', { bawaan: 0 });

  if (parentId === id) {
    gagal_(KODE.VALIDATION, 'Kategori tidak dapat menjadi induk dirinya sendiri.');
  }

  const namaTrim = nama.trim().toLowerCase();
  const kategoriSemua = bacaSemua_('Kategori');

  if (!parentId) {
    // Validasi Kategori Utama tidak boleh duplikat nama (selain dirinya sendiri)
    const adaDuplikat = kategoriSemua.some(function (k) {
      return !k.deleted && k.id !== id && !k.parent_id && String(k.nama || '').trim().toLowerCase() === namaTrim;
    });
    if (adaDuplikat) {
      gagal_(KODE.CONFLICT, 'Kategori utama "' + nama + '" sudah terdaftar. Silakan gunakan nama lain.');
    }
  } else {
    // Validasi Sub-Kategori tidak boleh kembar di bawah kategori induk yang sama (selain dirinya sendiri)
    const adaDuplikat = kategoriSemua.some(function (k) {
      return !k.deleted && k.id !== id && String(k.parent_id || '') === parentId && String(k.nama || '').trim().toLowerCase() === namaTrim;
    });
    if (adaDuplikat) {
      gagal_(KODE.CONFLICT, 'Sub-kategori "' + nama + '" di bawah kategori induk ini sudah terdaftar. Silakan gunakan nama lain.');
    }
  }

  const diubah = ubahBaris_('Kategori', [{
    id: id,
    data: { nama: nama, parent_id: parentId, urutan: urutan }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'kategori_ubah', 'KATEGORI', id, { nama: nama });
  return diubah;
}

/** kategori.delete — Hapus kategori (soft delete). */
function aksiKategoriDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Kategori', { wajib: true });

  // Cek apakah ada produk aktif yang masih menggunakan kategori ini
  const produkTerkait = bacaSemua_('Produk').some(function (pr) {
    return pr.kategori_id === id && !pr.deleted;
  });
  if (produkTerkait) {
    gagal_(KODE.CONFLICT, 'Kategori ini tidak dapat dihapus karena masih digunakan oleh produk aktif.');
  }

  hapusLunak_('Kategori', id, ctx.user.id);
  catatAudit_(ctx.user.id, 'kategori_hapus', 'KATEGORI', id, {});
  return { pesan: 'Kategori berhasil dihapus.' };
}

/* ---------- 9.3 PRODUK, VARIAN & SATUAN KONVERSI ---------- */

/** produk.list — Daftar produk dengan varian & satuan, filter & paginasi. */
function aksiProdukList_(ctx) {
  const p = ctx.payload || {};
  const isKasir = ctx.user.role === ROLE.KASIR;

  const produk = bacaSemua_('Produk');
  const varianSemua = bacaSemua_('Varian');
  const satuanSemua = bacaSemua_('Satuan_Konversi');

  // Indeks varian dan satuan konversi berdasarkan produk_id
  const petaVarian = {};
  varianSemua.forEach(function (v) {
    if (v.deleted) return;
    if (!petaVarian[v.produk_id]) petaVarian[v.produk_id] = [];
    const vCopy = Object.assign({}, v);
    const lokV = bacaStokLokasi_(vCopy);
    vCopy.stok_toko = lokV.stok_toko;
    vCopy.stok_gudang = lokV.stok_gudang;
    vCopy.stok = lokV.stok;
    if (isKasir) vCopy.hpp = null; // Kasir TIDAK BOLEH melihat HPP
    petaVarian[v.produk_id].push(vCopy);
  });

  const petaSatuan = {};
  satuanSemua.forEach(function (s) {
    if (s.deleted) return;
    if (!petaSatuan[s.produk_id]) petaSatuan[s.produk_id] = [];
    petaSatuan[s.produk_id].push(Object.assign({}, s));
  });

  // Susun data produk lengkap (termasuk posisi stok_toko & stok_gudang zero-migration)
  const daftarLengkap = produk.map(function (pr, idx) {
    const prAman = Object.assign({}, pr);
    prAman._idx = idx; // Indeks baris asli untuk fallback stable sort
    const vars = petaVarian[pr.id] || [];
    if (prAman.punya_varian && vars.length > 0) {
      let totToko = 0;
      let totGudang = 0;
      vars.forEach(function (v) {
        totToko += Number(v.stok_toko || 0);
        totGudang += Number(v.stok_gudang || 0);
      });
      const lokPr = bacaStokLokasi_(prAman);
      // Jika total varian cocok dengan stok induk, gunakan sum per lokasi; jika tidak, fallback normalisasi induk
      if (Math.abs(bulatQty_(totToko + totGudang) - lokPr.stok) <= 0.001) {
        prAman.stok_toko = bulatQty_(totToko);
        prAman.stok_gudang = bulatQty_(totGudang);
      } else {
        prAman.stok_toko = lokPr.stok_toko;
        prAman.stok_gudang = lokPr.stok_gudang;
      }
    } else {
      const lokPr = bacaStokLokasi_(prAman);
      prAman.stok_toko = lokPr.stok_toko;
      prAman.stok_gudang = lokPr.stok_gudang;
      prAman.stok = lokPr.stok;
    }
    if (isKasir) prAman.hpp = null; // Kasir TIDAK BOLEH melihat HPP
    prAman.varian = vars;
    prAman.satuan_konversi = petaSatuan[pr.id] || [];
    return prAman;
  });

  // Filter kategori (mencakup produk di kategori terpilih serta seluruh sub-kategorinya)
  let tersaring = daftarLengkap;
  if (p.kategori_id) {
    const targetKatIds = {};
    targetKatIds[p.kategori_id] = true;
    bacaSemua_('Kategori').forEach(function (k) {
      if (!k.deleted && k.parent_id === p.kategori_id) {
        targetKatIds[k.id] = true;
      }
    });
    tersaring = tersaring.filter(function (pr) { return !!targetKatIds[pr.kategori_id]; });
  }

  // Filter hanya produk aktif / status
  if (p.aktif_saja || p.status === 'aktif') {
    tersaring = tersaring.filter(function (pr) { return pr.aktif === true || String(pr.aktif).toUpperCase() === 'TRUE'; });
  } else if (p.status === 'nonaktif') {
    tersaring = tersaring.filter(function (pr) { return pr.aktif === false || String(pr.aktif).toUpperCase() === 'FALSE'; });
  }

  // Filter status stok (menipis, habis, tersedia)
  if (p.filter_stok === 'menipis') {
    tersaring = tersaring.filter(function (pr) {
      const s = Number(pr.stok || 0);
      const min = Number(pr.stok_min || 0);
      return s > 0 && s <= min;
    });
  } else if (p.filter_stok === 'habis') {
    tersaring = tersaring.filter(function (pr) {
      return Number(pr.stok || 0) <= 0;
    });
  } else if (p.filter_stok === 'tersedia') {
    tersaring = tersaring.filter(function (pr) {
      return Number(pr.stok || 0) > 0;
    });
  }

  // Pencarian q (nama, sku, barcode, nama varian, barcode varian)
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    tersaring = tersaring.filter(function (pr) {
      if (String(pr.nama || '').toLowerCase().indexOf(q) !== -1) return true;
      if (String(pr.sku || '').toLowerCase().indexOf(q) !== -1) return true;
      if (String(pr.barcode || '').toLowerCase().indexOf(q) !== -1) return true;
      return pr.varian.some(function (v) {
        return String(v.nama_varian || '').toLowerCase().indexOf(q) !== -1 ||
          String(v.sku || '').toLowerCase().indexOf(q) !== -1 ||
          String(v.barcode || '').toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  // Pengurutan (Sorting) — Default: 'terbaru' (Produk baru dibuat/ditambahkan tampil paling atas)
  const sortBy = String(p.sort || 'terbaru').toLowerCase();
  tersaring.sort(function (a, b) {
    if (sortBy === 'terlama') {
      const tA = String(a.created_at || '');
      const tB = String(b.created_at || '');
      if (tA && tB && tA !== tB) return tA.localeCompare(tB);
      return (a._idx || 0) - (b._idx || 0);
    }
    if (sortBy === 'nama_asc') {
      return String(a.nama || '').localeCompare(String(b.nama || ''));
    }
    if (sortBy === 'nama_desc') {
      return String(b.nama || '').localeCompare(String(a.nama || ''));
    }
    if (sortBy === 'stok_asc') {
      return Number(a.stok || 0) - Number(b.stok || 0);
    }
    if (sortBy === 'stok_desc') {
      return Number(b.stok || 0) - Number(a.stok || 0);
    }
    if (sortBy === 'harga_asc') {
      return Number(a.harga_ritel || 0) - Number(b.harga_ritel || 0);
    }
    if (sortBy === 'harga_desc') {
      return Number(b.harga_ritel || 0) - Number(a.harga_ritel || 0);
    }

    // Default: 'terbaru' -> created_at DESC, atau baris sheet paling bawah (indeks lebih tinggi) di atas
    const tA = String(a.created_at || '');
    const tB = String(b.created_at || '');
    if (tA && tB && tA !== tB) {
      return tB.localeCompare(tA);
    }
    return (b._idx || 0) - (a._idx || 0);
  });

  // Bersihkan properti internal _idx
  tersaring.forEach(function (pr) {
    delete pr._idx;
  });

  // Paginasi
  const limit = Math.min(Math.max(parseInt(p.limit, 10) || APP.PAGE_LIMIT_DEFAULT, 1), APP.PAGE_LIMIT_MAKS);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  const mulai = (page - 1) * limit;

  return {
    items: tersaring.slice(mulai, mulai + limit),
    total: tersaring.length,
    page: page,
    limit: limit,
    has_more: (mulai + limit) < tersaring.length
  };
}

/** produk.create — Tambah master produk lengkap (Owner & Admin). */
function aksiProdukCreate_(ctx) {
  const p = ctx.payload || {};
  const nama = V_.teks(p.nama, 'Nama Produk', { wajib: true, maks: 200 });

  // Auto-generate SKU & Barcode jika tidak diisi manual
  let sku = V_.teks(p.sku, 'SKU Produk', { maks: 50 });
  if (!sku) {
    sku = nomorBerikut_('SKU');
  }
  let barcode = V_.teks(p.barcode, 'Barcode', { maks: 50 });
  if (!barcode) {
    barcode = barcodeBerikut_();
  }

  const kategoriId = p.kategori_id ? String(p.kategori_id).trim() : '';
  const satuanDasar = V_.teks(p.satuan_dasar, 'Satuan Dasar', { wajib: true, maks: 30 }).toUpperCase();
  const hpp = V_.rupiah(p.hpp, 'HPP', { bawaan: 0 });
  const hargaRitel = V_.rupiah(p.harga_ritel, 'Harga Ritel', { wajib: true });
  const hargaGrosir = V_.rupiah(p.harga_grosir, 'Harga Grosir', { bawaan: hargaRitel });
  const minGrosirQty = V_.qty(p.min_grosir_qty || 1, 'Min Grosir Qty');
  const hasStokLok = p.stok_toko !== undefined || p.stok_gudang !== undefined;
  const stokTokoAwal = hasStokLok ? V_.angka(p.stok_toko, 'Stok Awal Toko', { bawaan: 0 }) : V_.angka(p.stok, 'Stok Awal', { bawaan: 0 });
  const stokGudangAwal = hasStokLok ? V_.angka(p.stok_gudang, 'Stok Awal Gudang', { bawaan: 0 }) : 0;
  const stok = bulatQty_(stokTokoAwal + stokGudangAwal);
  const stokMin = V_.angka(p.stok_min, 'Stok Minimum', { bawaan: 0 });
  const punyaVarian = !!p.punya_varian;
  const fotoUrl = V_.teks(p.foto_url, 'Foto URL', { maks: 500 });
  const aktif = p.aktif !== false;

  // Aturan Bisnis #1: Harga jual tidak boleh < HPP
  if (hargaRitel < hpp) {
    gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel (' + hargaRitel + ') tidak boleh di bawah HPP (' + hpp + ').');
  }
  if (hargaGrosir < hpp) {
    gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir (' + hargaGrosir + ') tidak boleh di bawah HPP (' + hpp + ').');
  }

  // Simpan record master produk
  const produkBaru = tambahBaris_('Produk', [{
    sku: sku,
    barcode: barcode,
    nama: nama,
    kategori_id: kategoriId,
    satuan_dasar: satuanDasar,
    hpp: hpp,
    harga_ritel: hargaRitel,
    harga_grosir: hargaGrosir,
    min_grosir_qty: minGrosirQty,
    stok: stok,
    stok_toko: stokTokoAwal,
    stok_gudang: stokGudangAwal,
    stok_min: stokMin,
    punya_varian: punyaVarian,
    foto_url: fotoUrl,
    aktif: aktif
  }], ctx.user.id)[0];

  // Simpan varian jika ada
  const varianInput = Array.isArray(p.varian) ? p.varian : [];
  let totalStokVarian = 0;
  let totalStokTokoVarian = 0;
  let totalStokGudangVarian = 0;
  if (punyaVarian && varianInput.length) {
    const barisVarian = varianInput.map(function (v, idx) {
      const vHpp = V_.rupiah(v.hpp || hpp, 'HPP Varian', { bawaan: hpp });
      const vRitel = V_.rupiah(v.harga_ritel || hargaRitel, 'Harga Ritel Varian', { wajib: true });
      const vGrosir = V_.rupiah(v.harga_grosir || hargaGrosir, 'Harga Grosir Varian', { bawaan: vRitel });
      if (vRitel < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel varian tidak boleh di bawah HPP.');
      if (vGrosir < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir varian tidak boleh di bawah HPP.');
      const vHasLok = v.stok_toko !== undefined || v.stok_gudang !== undefined;
      const vStokToko = vHasLok ? V_.angka(v.stok_toko, 'Stok Toko Varian', { bawaan: 0 }) : V_.angka(v.stok, 'Stok Varian', { bawaan: 0 });
      const vStokGudang = vHasLok ? V_.angka(v.stok_gudang, 'Stok Gudang Varian', { bawaan: 0 }) : 0;
      const vStok = bulatQty_(vStokToko + vStokGudang);
      totalStokVarian = bulatQty_(totalStokVarian + vStok);
      totalStokTokoVarian = bulatQty_(totalStokTokoVarian + vStokToko);
      totalStokGudangVarian = bulatQty_(totalStokGudangVarian + vStokGudang);

      let vSku = V_.teks(v.sku, 'SKU Varian', { maks: 50 });
      if (!vSku) {
        vSku = sku + '-V' + (idx + 1);
      }
      let vBarcode = V_.teks(v.barcode, 'Barcode Varian', { maks: 50 });
      if (!vBarcode) {
        vBarcode = barcodeBerikut_();
      }

      return {
        produk_id: produkBaru.id,
        nama_varian: V_.teks(v.nama_varian, 'Nama Varian', { wajib: true }),
        sku: vSku,
        barcode: vBarcode,
        hpp: vHpp,
        harga_ritel: vRitel,
        harga_grosir: vGrosir,
        stok: vStok,
        stok_toko: vStokToko,
        stok_gudang: vStokGudang,
        stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
        aktif: v.aktif !== false
      };
    });
    tambahBaris_('Varian', barisVarian, ctx.user.id);

    // Update stok produk induk sesuai jumlah stok varian (Aturan Bisnis #17)
    ubahBaris_('Produk', [{ id: produkBaru.id, data: { stok: totalStokVarian, stok_toko: totalStokTokoVarian, stok_gudang: totalStokGudangVarian } }], ctx.user.id);
    produkBaru.stok = totalStokVarian;
    produkBaru.stok_toko = totalStokTokoVarian;
    produkBaru.stok_gudang = totalStokGudangVarian;
  }

  // Simpan satuan konversi jika ada
  const satuanInput = Array.isArray(p.satuan_konversi) ? p.satuan_konversi : [];
  if (satuanInput.length) {
    const barisSatuan = satuanInput.map(function (s) {
      const faktor = V_.angka(s.faktor, 'Faktor Satuan', { wajib: true, min: 0.001 });
      const hppSatuan = Math.round(hpp * faktor);
      const sRitel = V_.rupiah(s.harga_ritel, 'Harga Ritel Satuan (' + s.satuan + ')', { wajib: true });
      const sGrosir = V_.rupiah(s.harga_grosir, 'Harga Grosir Satuan', { bawaan: sRitel });
      if (sRitel < hppSatuan) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga konversi satuan ' + s.satuan + ' tidak boleh di bawah HPP konversi (' + hppSatuan + ').');

      let sBarcode = V_.teks(s.barcode, 'Barcode Satuan', { maks: 50 });
      if (!sBarcode) {
        sBarcode = barcodeBerikut_();
      }

      return {
        produk_id: produkBaru.id,
        satuan: V_.teks(s.satuan, 'Nama Satuan Konversi', { wajib: true }).toUpperCase(),
        faktor: faktor,
        barcode: sBarcode,
        harga_ritel: sRitel,
        harga_grosir: sGrosir
      };
    });
    tambahBaris_('Satuan_Konversi', barisSatuan, ctx.user.id);
  }

  // Catat stok awal ke Kartu_Stok jika ada saldo awal (Aturan Bisnis #5)
  const saldoAkhir = punyaVarian ? totalStokVarian : stok;
  if (saldoAkhir > 0) {
    tambahBaris_('Kartu_Stok', [{
      produk_id: produkBaru.id,
      varian_id: '',
      tipe: 'koreksi',
      qty: saldoAkhir,
      saldo: saldoAkhir,
      hpp: hpp,
      ref_id: 'STOK-AWAL',
      user_id: ctx.user.id,
      keterangan: 'Saldo stok awal saat produk dibuat'
    }], ctx.user.id);
  }

  catatAudit_(ctx.user.id, 'produk_tambah', 'PRODUK', produkBaru.id, { nama: nama, sku: sku, hpp: hpp, harga_ritel: hargaRitel });
  return produkBaru;
}

/** produk.update — Edit master produk & sinkronisasi varian/satuan (Owner & Admin). */
function aksiProdukUpdate_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Produk', { wajib: true });
  const lama = cariById_('Produk', id);
  if (!lama || lama.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan.');

  const nama = V_.teks(p.nama, 'Nama Produk', { wajib: true, maks: 200 });
  let sku = V_.teks(p.sku, 'SKU Produk', { maks: 50 });
  if (!sku) {
    sku = lama.sku || nomorBerikut_('SKU');
  }
  let barcode = V_.teks(p.barcode, 'Barcode', { maks: 50 });
  if (!barcode) {
    barcode = lama.barcode || barcodeBerikut_();
  }
  const kategoriId = p.kategori_id ? String(p.kategori_id).trim() : '';
  const satuanDasar = V_.teks(p.satuan_dasar, 'Satuan Dasar', { wajib: true, maks: 30 }).toUpperCase();
  const hpp = V_.rupiah(p.hpp, 'HPP', { bawaan: lama.hpp });
  const hargaRitel = V_.rupiah(p.harga_ritel, 'Harga Ritel', { wajib: true });
  const hargaGrosir = V_.rupiah(p.harga_grosir, 'Harga Grosir', { bawaan: hargaRitel });
  const minGrosirQty = V_.qty(p.min_grosir_qty || 1, 'Min Grosir Qty');
  const stokMin = V_.angka(p.stok_min, 'Stok Minimum', { bawaan: 0 });
  const punyaVarian = !!p.punya_varian;
  const fotoUrl = V_.teks(p.foto_url, 'Foto URL', { maks: 500 });
  const aktif = p.aktif !== false;

  if (hargaRitel < hpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel tidak boleh di bawah HPP.');
  if (hargaGrosir < hpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir tidak boleh di bawah HPP.');

  // Update data produk induk
  const diubah = ubahBaris_('Produk', [{
    id: id,
    data: {
      sku: sku,
      barcode: barcode,
      nama: nama,
      kategori_id: kategoriId,
      satuan_dasar: satuanDasar,
      hpp: hpp,
      harga_ritel: hargaRitel,
      harga_grosir: hargaGrosir,
      min_grosir_qty: minGrosirQty,
      stok_min: stokMin,
      punya_varian: punyaVarian,
      foto_url: fotoUrl,
      aktif: aktif
    }
  }], ctx.user.id)[0];

  // Sinkronisasi varian jika array dikirimkan
  if (Array.isArray(p.varian)) {
    const varianLama = bacaSemua_('Varian').filter(function (v) { return v.produk_id === id && !v.deleted; });
    const idBaru = {};
    let totalStokVarian = 0;

    p.varian.forEach(function (v, idx) {
      const vHpp = V_.rupiah(v.hpp || hpp, 'HPP Varian', { bawaan: hpp });
      const vRitel = V_.rupiah(v.harga_ritel || hargaRitel, 'Harga Ritel Varian', { wajib: true });
      const vGrosir = V_.rupiah(v.harga_grosir || hargaGrosir, 'Harga Grosir Varian', { bawaan: vRitel });
      if (vRitel < vHpp || vGrosir < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga varian tidak boleh di bawah HPP.');
      const vStok = V_.angka(v.stok, 'Stok Varian', { bawaan: 0 });
      totalStokVarian += vStok;

      let vSku = V_.teks(v.sku, 'SKU Varian', { maks: 50 });
      if (!vSku) {
        vSku = (sku || lama.sku) + '-V' + (idx + 1);
      }
      let vBarcode = V_.teks(v.barcode, 'Barcode Varian', { maks: 50 });
      if (!vBarcode) {
        vBarcode = barcodeBerikut_();
      }

      if (v.id) {
        idBaru[v.id] = true;
        ubahBaris_('Varian', [{
          id: v.id,
          data: {
            nama_varian: V_.teks(v.nama_varian, 'Nama Varian', { wajib: true }),
            sku: vSku,
            barcode: vBarcode,
            hpp: vHpp,
            harga_ritel: vRitel,
            harga_grosir: vGrosir,
            stok: vStok,
            stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
            aktif: v.aktif !== false
          }
        }], ctx.user.id);
      } else {
        const vBaru = tambahBaris_('Varian', [{
          produk_id: id,
          nama_varian: V_.teks(v.nama_varian, 'Nama Varian', { wajib: true }),
          sku: vSku,
          barcode: vBarcode,
          hpp: vHpp,
          harga_ritel: vRitel,
          harga_grosir: vGrosir,
          stok: vStok,
          stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
          aktif: v.aktif !== false
        }], ctx.user.id)[0];
        idBaru[vBaru.id] = true;
      }
    });

    // Soft delete varian yang dihilangkan
    varianLama.forEach(function (vl) {
      if (!idBaru[vl.id]) hapusLunak_('Varian', vl.id, ctx.user.id);
    });

    if (punyaVarian) {
      ubahBaris_('Produk', [{ id: id, data: { stok: totalStokVarian } }], ctx.user.id);
      diubah.stok = totalStokVarian;
    }
  }

  // Sinkronisasi satuan konversi
  if (Array.isArray(p.satuan_konversi)) {
    const satuanLama = bacaSemua_('Satuan_Konversi').filter(function (s) { return s.produk_id === id && !s.deleted; });
    satuanLama.forEach(function (sl) { hapusLunak_('Satuan_Konversi', sl.id, ctx.user.id); });

    const barisSatuan = p.satuan_konversi.map(function (s) {
      const faktor = V_.angka(s.faktor, 'Faktor Satuan', { wajib: true, min: 0.001 });
      const hppSatuan = Math.round(hpp * faktor);
      const sRitel = V_.rupiah(s.harga_ritel, 'Harga Ritel Satuan', { wajib: true });
      const sGrosir = V_.rupiah(s.harga_grosir, 'Harga Grosir Satuan', { bawaan: sRitel });
      if (sRitel < hppSatuan) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga konversi satuan ' + s.satuan + ' tidak boleh di bawah HPP.');

      let sBarcode = V_.teks(s.barcode, 'Barcode Satuan', { maks: 50 });
      if (!sBarcode) {
        sBarcode = barcodeBerikut_();
      }

      return {
        produk_id: id,
        satuan: V_.teks(s.satuan, 'Nama Satuan', { wajib: true }).toUpperCase(),
        faktor: faktor,
        barcode: sBarcode,
        harga_ritel: sRitel,
        harga_grosir: sGrosir
      };
    });
    if (barisSatuan.length) tambahBaris_('Satuan_Konversi', barisSatuan, ctx.user.id);
  }

  catatAudit_(ctx.user.id, 'produk_ubah', 'PRODUK', id, { nama: nama, sku: sku });
  return diubah;
}

/** produk.delete — Soft delete produk & varian terkait (Owner & Admin). */
function aksiProdukDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Produk', { wajib: true });

  hapusLunak_('Produk', id, ctx.user.id);

  // Soft delete seluruh varian & satuan konversi terkait
  bacaSemua_('Varian').filter(function (v) { return v.produk_id === id && !v.deleted; }).forEach(function (v) {
    hapusLunak_('Varian', v.id, ctx.user.id);
  });
  bacaSemua_('Satuan_Konversi').filter(function (s) { return s.produk_id === id && !s.deleted; }).forEach(function (s) {
    hapusLunak_('Satuan_Konversi', s.id, ctx.user.id);
  });

  catatAudit_(ctx.user.id, 'produk_hapus', 'PRODUK', id, {});
  return { pesan: 'Produk berhasil dihapus.' };
}

/**
 * produk.uploadFoto — Unggah foto produk ke Google Drive (Owner & Admin).
 * File disimpan langsung ke folder Google Drive pengguna:
 * ID Folder: 1qE_KTzzT1wHJ9SFb5dEnPuz_OoUcheeM
 */
function aksiProdukUploadFoto_(ctx) {
  const p = ctx.payload || {};
  if (!p.base64) gagal_(KODE.VALIDATION, 'Data gambar (base64) wajib disertakan.');

  const FOLDER_DEFAULT_ID = '1qE_KTzzT1wHJ9SFb5dEnPuz_OoUcheeM';
  const folderId = (p.folder_id && String(p.folder_id).trim()) || FOLDER_DEFAULT_ID;

  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (err) {
    gagal_(KODE.VALIDATION, 'Folder Google Drive tidak ditemukan atau izin akses belum diberikan: ' + err.message);
  }

  let rawBase64 = String(p.base64).trim();
  let mimeType = p.mime_type || 'image/jpeg';
  if (rawBase64.indexOf(',') !== -1) {
    const parts = rawBase64.split(',');
    const matchMime = parts[0].match(/:(.*?);/);
    if (matchMime && matchMime[1]) {
      mimeType = matchMime[1];
    }
    rawBase64 = parts[1];
  }

  let decodedBytes;
  try {
    decodedBytes = Utilities.base64Decode(rawBase64);
  } catch (errDec) {
    gagal_(KODE.VALIDATION, 'Format data base64 gambar tidak valid.');
  }

  const ext = mimeType.indexOf('png') !== -1 ? 'png' : (mimeType.indexOf('webp') !== -1 ? 'webp' : 'jpg');
  const timestamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss');
  const namaFileBersih = (p.nama_file ? String(p.nama_file).replace(/[^a-zA-Z0-9_\-\.]/g, '_') : 'produk_' + timestamp) + '.' + ext;

  const blob = Utilities.newBlob(decodedBytes, mimeType, namaFileBersih);
  const file = folder.createFile(blob);

  // Buat file dapat dilihat publik dengan tautan
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (eShare) {
    // Abaikan jika setSharing gagal pada domain Workspace terisolasi
  }

  const fileId = file.getId();
  // URL CDN Google kecepatan tinggi tanpa hambatan CORS
  const fotoUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
  const webViewUrl = file.getUrl();

  catatAudit_(ctx.user.id, 'produk_upload_foto', 'PRODUK', fileId, { nama_file: namaFileBersih, file_id: fileId });

  return {
    pesan: 'Foto produk berhasil diunggah ke Google Drive.',
    file_id: fileId,
    foto_url: fotoUrl,
    view_url: webViewUrl,
    nama_file: file.getName()
  };
}

/**
 * produk.importMassal — Import & Update Massal Produk/Varian & Harga dari Excel/CSV (Owner & Admin).
 * Mendukung:
 * - Tambah produk baru (+ auto-buat kategori jika belum ada)
 * - Update produk eksisting berdasarkan `id` atau `sku`
 * - Update/tambah varian eksisting berdasarkan `varian_id` atau `sku` varian
 * - Proteksi Aturan Bisnis #1 (harga_ritel/harga_grosir >= hpp), #5 (Kartu_Stok koreksi), #17 (stok induk = sum varian)
 */
function aksiProdukImportMassal_(ctx) {
  const p = ctx.payload || {};
  const items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) gagal_(KODE.VALIDATION, 'Daftar baris import tidak boleh kosong.');
  if (items.length > 500) gagal_(KODE.VALIDATION, 'Maksimal 500 baris per 1 kali import massal agar proses tetap cepat.');

  const opsi = p.opsi || {};
  const perbaruiHarga = opsi.perbarui_harga !== false;
  const perbaruiInfo = opsi.perbarui_info !== false;
  const perbaruiStok = opsi.perbarui_stok === true;
  const buatKategoriOtomatis = opsi.buat_kategori_otomatis !== false;

  // Muat seluruh master eksisting sekali di awal untuk lookup cepat
  const semuaKat = bacaSemua_('Kategori');
  const katById = {};
  const katByNama = {};
  semuaKat.forEach(function (k) {
    katById[k.id] = k;
    katByNama[String(k.nama || '').trim().toLowerCase()] = k;
  });

  const semuaPrd = bacaSemua_('Produk');
  const prdById = {};
  const prdBySku = {};
  const prdByNama = {};
  semuaPrd.forEach(function (pr) {
    prdById[pr.id] = pr;
    if (pr.sku) prdBySku[String(pr.sku).trim().toLowerCase()] = pr;
    if (pr.nama) prdByNama[String(pr.nama).trim().toLowerCase()] = pr;
  });

  const semuaVar = bacaSemua_('Varian');
  const varById = {};
  const varBySku = {};
  const varByPrdNama = {};
  semuaVar.forEach(function (v) {
    varById[v.id] = v;
    if (v.sku) varBySku[String(v.sku).trim().toLowerCase()] = v;
    varByPrdNama[v.produk_id + '::' + String(v.nama_varian || '').trim().toLowerCase()] = v;
  });

  const produkBaruQueue = [];
  const produkUpdateQueue = [];
  const varianBaruQueue = [];
  const varianUpdateQueue = [];
  const kartuStokQueue = [];
  const indukRekalkulasiSet = {};
  const gagalList = [];

  let kategoriDibuat = 0;
  let ditambah = 0;
  let diperbarui = 0;
  let varianDitambah = 0;
  let varianDiperbarui = 0;
  let dilewati = 0;

  function parseAngkaOpsional_(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = Number(val);
    return isFinite(n) ? n : null;
  }

  function selesaikanKategori_(katIdInput, katNamaInput) {
    const idTrim = String(katIdInput || '').trim();
    if (idTrim && katById[idTrim]) return idTrim;
    const namaTrim = String(katNamaInput || '').trim();
    if (!namaTrim) return '';
    const key = namaTrim.toLowerCase();
    if (katByNama[key]) return katByNama[key].id;
    if (!buatKategoriOtomatis) return '';
    const baru = tambahBaris_('Kategori', [{
      nama: namaTrim.slice(0, 80),
      parent_id: '',
      urutan: Object.keys(katById).length + 1
    }], ctx.user.id)[0];
    katById[baru.id] = baru;
    katByNama[key] = baru;
    kategoriDibuat++;
    return baru.id;
  }

  items.forEach(function (raw, idx) {
    const noBaris = raw && raw._baris ? Number(raw._baris) : (idx + 1);
    try {
      if (!raw || typeof raw !== 'object') {
        gagalList.push({ baris: noBaris, pesan: 'Format baris tidak valid.' });
        return;
      }

      const tipeRaw = String(raw.tipe || '').trim().toLowerCase();
      const isVarian = tipeRaw === 'varian' || (!!raw.varian_id && tipeRaw !== 'produk');
      const skuTrim = String(raw.sku || '').trim();
      const skuKey = skuTrim.toLowerCase();

      if (isVarian) {
        const varIdTrim = String(raw.varian_id || raw.id || '').trim();
        let targetVar = (varIdTrim && varById[varIdTrim]) || (skuKey && varBySku[skuKey]) || null;

        // Coba cocokkan berdasarkan produk induk + nama_varian
        const namaVarian = String(raw.nama_varian || '').trim();
        let indukPrd = null;
        if (targetVar) {
          indukPrd = prdById[targetVar.produk_id] || null;
        } else {
          const pIdIn = String(raw.produk_id || '').trim();
          const pSkuIn = String(raw.sku_induk || '').trim().toLowerCase();
          const pNamaIn = String(raw.nama || raw.nama_produk || '').trim().toLowerCase();
          indukPrd = (pIdIn && prdById[pIdIn]) || (pSkuIn && prdBySku[pSkuIn]) || (pNamaIn && prdByNama[pNamaIn]) || null;
          if (indukPrd && namaVarian) {
            targetVar = varByPrdNama[indukPrd.id + '::' + namaVarian.toLowerCase()] || null;
          }
        }

        if (targetVar) {
          const hppIn = parseAngkaOpsional_(raw.hpp);
          const ritelIn = parseAngkaOpsional_(raw.harga_ritel);
          const grosirIn = parseAngkaOpsional_(raw.harga_grosir);
          const stokIn = parseAngkaOpsional_(raw.stok);
          const stokMinIn = parseAngkaOpsional_(raw.stok_min);

          const hppFinal = (perbaruiHarga && hppIn !== null) ? Math.max(0, Math.round(hppIn)) : Number(targetVar.hpp || 0);
          const ritelFinal = (perbaruiHarga && ritelIn !== null) ? Math.max(0, Math.round(ritelIn)) : Number(targetVar.harga_ritel || 0);
          const grosirFinal = (perbaruiHarga && grosirIn !== null) ? Math.max(0, Math.round(grosirIn)) : Number(targetVar.harga_grosir || ritelFinal);

          if (ritelFinal < hppFinal) {
            gagalList.push({ baris: noBaris, pesan: 'Harga ritel varian (' + ritelFinal + ') di bawah HPP (' + hppFinal + ').' });
            return;
          }
          if (grosirFinal < hppFinal) {
            gagalList.push({ baris: noBaris, pesan: 'Harga grosir varian (' + grosirFinal + ') di bawah HPP (' + hppFinal + ').' });
            return;
          }

          const patch = {};
          if (perbaruiInfo) {
            if (namaVarian) patch.nama_varian = namaVarian.slice(0, 120);
            if (raw.barcode !== undefined && String(raw.barcode).trim()) patch.barcode = String(raw.barcode).trim().slice(0, 50);
            if (stokMinIn !== null) patch.stok_min = Math.max(0, stokMinIn);
            if (raw.aktif !== undefined) patch.aktif = raw.aktif !== false;
          }
          if (perbaruiHarga) {
            patch.hpp = hppFinal;
            patch.harga_ritel = ritelFinal;
            patch.harga_grosir = grosirFinal;
          }
          if (perbaruiStok && stokIn !== null) {
            const stokLama = bulatQty_(Number(targetVar.stok || 0));
            const stokBaru = bulatQty_(Math.max(0, stokIn));
            if (stokBaru !== stokLama) {
              patch.stok = stokBaru;
              targetVar.stok = stokBaru;
              indukRekalkulasiSet[targetVar.produk_id] = true;
              kartuStokQueue.push({
                produk_id: targetVar.produk_id,
                varian_id: targetVar.id,
                tipe: 'koreksi',
                qty: bulatQty_(stokBaru - stokLama),
                saldo: stokBaru,
                hpp: hppFinal,
                ref_id: 'IMPORT-VAR-' + targetVar.sku,
                user_id: ctx.user.id,
                keterangan: 'Import massal Excel/CSV (Varian ' + (patch.nama_varian || targetVar.nama_varian) + ')'
              });
            }
          }

          if (Object.keys(patch).length > 0) {
            Object.assign(targetVar, patch);
            varianUpdateQueue.push({ id: targetVar.id, data: patch });
            varianDiperbarui++;
          } else {
            dilewati++;
          }
        } else {
          if (!indukPrd) {
            gagalList.push({ baris: noBaris, pesan: 'Produk induk untuk varian "' + (namaVarian || skuTrim || '-') + '" tidak ditemukan.' });
            return;
          }
          if (!namaVarian) {
            gagalList.push({ baris: noBaris, pesan: 'Nama varian wajib diisi untuk baris tipe varian baru.' });
            return;
          }
          const vHpp = Math.max(0, Math.round(parseAngkaOpsional_(raw.hpp) !== null ? parseAngkaOpsional_(raw.hpp) : Number(indukPrd.hpp || 0)));
          const vRitel = Math.max(0, Math.round(parseAngkaOpsional_(raw.harga_ritel) !== null ? parseAngkaOpsional_(raw.harga_ritel) : Number(indukPrd.harga_ritel || 0)));
          const vGrosir = Math.max(0, Math.round(parseAngkaOpsional_(raw.harga_grosir) !== null ? parseAngkaOpsional_(raw.harga_grosir) : vRitel));
          if (vRitel < vHpp || vGrosir < vHpp) {
            gagalList.push({ baris: noBaris, pesan: 'Harga jual varian baru di bawah HPP.' });
            return;
          }
          const vStok = Math.max(0, parseAngkaOpsional_(raw.stok) || 0);
          const vSku = skuTrim || (indukPrd.sku + '-V' + (Object.keys(varById).length + varianBaruQueue.length + 1));
          const vBarcode = String(raw.barcode || '').trim() || barcodeBerikut_();
          const objVarBaru = {
            produk_id: indukPrd.id,
            nama_varian: namaVarian.slice(0, 120),
            sku: vSku.slice(0, 50),
            barcode: vBarcode.slice(0, 50),
            hpp: vHpp,
            harga_ritel: vRitel,
            harga_grosir: vGrosir,
            stok: vStok,
            stok_min: Math.max(0, parseAngkaOpsional_(raw.stok_min) || 0),
            aktif: raw.aktif !== false
          };
          varianBaruQueue.push(objVarBaru);
          indukRekalkulasiSet[indukPrd.id] = true;
          varianDitambah++;
        }
        return;
      }

      // === BARIS PRODUK ===
      const idTrim = String(raw.id || '').trim();
      const targetPrd = (idTrim && prdById[idTrim]) || (skuKey && prdBySku[skuKey]) || null;

      if (targetPrd) {
        const hppIn = parseAngkaOpsional_(raw.hpp);
        const ritelIn = parseAngkaOpsional_(raw.harga_ritel);
        const grosirIn = parseAngkaOpsional_(raw.harga_grosir);
        const minGrosirIn = parseAngkaOpsional_(raw.min_grosir_qty);
        const stokIn = parseAngkaOpsional_(raw.stok);
        const stokMinIn = parseAngkaOpsional_(raw.stok_min);

        const hppFinal = (perbaruiHarga && hppIn !== null) ? Math.max(0, Math.round(hppIn)) : Number(targetPrd.hpp || 0);
        const ritelFinal = (perbaruiHarga && ritelIn !== null) ? Math.max(0, Math.round(ritelIn)) : Number(targetPrd.harga_ritel || 0);
        const grosirFinal = (perbaruiHarga && grosirIn !== null) ? Math.max(0, Math.round(grosirIn)) : Number(targetPrd.harga_grosir || ritelFinal);

        if (ritelFinal < hppFinal) {
          gagalList.push({ baris: noBaris, pesan: 'Harga ritel "' + targetPrd.nama + '" (' + ritelFinal + ') di bawah HPP (' + hppFinal + ').' });
          return;
        }
        if (grosirFinal < hppFinal) {
          gagalList.push({ baris: noBaris, pesan: 'Harga grosir "' + targetPrd.nama + '" (' + grosirFinal + ') di bawah HPP (' + hppFinal + ').' });
          return;
        }

        const patch = {};
        if (perbaruiInfo) {
          const namaIn = String(raw.nama || raw.nama_produk || '').trim();
          if (namaIn) patch.nama = namaIn.slice(0, 200);
          if (raw.barcode !== undefined && String(raw.barcode).trim()) patch.barcode = String(raw.barcode).trim().slice(0, 50);
          const satIn = String(raw.satuan_dasar || raw.satuan || '').trim();
          if (satIn) patch.satuan_dasar = satIn.slice(0, 30).toUpperCase();
          if (raw.kategori_id || raw.kategori || raw.kategori_nama) {
            const kId = selesaikanKategori_(raw.kategori_id, raw.kategori_nama || raw.kategori);
            if (kId) patch.kategori_id = kId;
          }
          if (stokMinIn !== null) patch.stok_min = Math.max(0, stokMinIn);
          if (raw.aktif !== undefined) patch.aktif = raw.aktif !== false;
        }
        if (perbaruiHarga) {
          patch.hpp = hppFinal;
          patch.harga_ritel = ritelFinal;
          patch.harga_grosir = grosirFinal;
          if (minGrosirIn !== null && minGrosirIn > 0) patch.min_grosir_qty = minGrosirIn;
        }
        if (perbaruiStok && stokIn !== null && !targetPrd.punya_varian) {
          const stokLama = bulatQty_(Number(targetPrd.stok || 0));
          const stokBaru = bulatQty_(Math.max(0, stokIn));
          if (stokBaru !== stokLama) {
            patch.stok = stokBaru;
            kartuStokQueue.push({
              produk_id: targetPrd.id,
              varian_id: '',
              tipe: 'koreksi',
              qty: bulatQty_(stokBaru - stokLama),
              saldo: stokBaru,
              hpp: hppFinal,
              ref_id: 'IMPORT-' + (targetPrd.sku || targetPrd.id),
              user_id: ctx.user.id,
              keterangan: 'Import massal Excel/CSV'
            });
          }
        }

        if (Object.keys(patch).length > 0) {
          Object.assign(targetPrd, patch);
          produkUpdateQueue.push({ id: targetPrd.id, data: patch });
          diperbarui++;
        } else {
          dilewati++;
        }
      } else {
        // Tambah Produk Baru
        const namaBaru = String(raw.nama || raw.nama_produk || '').trim();
        if (!namaBaru) {
          gagalList.push({ baris: noBaris, pesan: 'Nama produk wajib diisi untuk produk baru.' });
          return;
        }
        const hppBaru = Math.max(0, Math.round(parseAngkaOpsional_(raw.hpp) || 0));
        const ritelIn = parseAngkaOpsional_(raw.harga_ritel);
        if (ritelIn === null || ritelIn < 0) {
          gagalList.push({ baris: noBaris, pesan: 'Harga ritel wajib diisi angka valid untuk produk "' + namaBaru + '".' });
          return;
        }
        const ritelBaru = Math.round(ritelIn);
        const grosirIn = parseAngkaOpsional_(raw.harga_grosir);
        const grosirBaru = grosirIn !== null ? Math.round(grosirIn) : ritelBaru;

        if (ritelBaru < hppBaru) {
          gagalList.push({ baris: noBaris, pesan: 'Harga ritel "' + namaBaru + '" (' + ritelBaru + ') di bawah HPP (' + hppBaru + ').' });
          return;
        }
        if (grosirBaru < hppBaru) {
          gagalList.push({ baris: noBaris, pesan: 'Harga grosir "' + namaBaru + '" (' + grosirBaru + ') di bawah HPP (' + hppBaru + ').' });
          return;
        }

        const skuBaru = skuTrim ? skuTrim.slice(0, 50) : nomorBerikut_('SKU');
        const barcodeBaru = String(raw.barcode || '').trim().slice(0, 50) || barcodeBerikut_();
        const satuanBaru = (String(raw.satuan_dasar || raw.satuan || 'PCS').trim() || 'PCS').slice(0, 30).toUpperCase();
        const katIdBaru = selesaikanKategori_(raw.kategori_id, raw.kategori_nama || raw.kategori);
        const stokBaru = Math.max(0, parseAngkaOpsional_(raw.stok) || 0);
        const stokMinBaru = Math.max(0, parseAngkaOpsional_(raw.stok_min) || 0);
        const minGrosirBaru = Math.max(1, parseAngkaOpsional_(raw.min_grosir_qty) || 1);

        const objBaru = {
          sku: skuBaru,
          barcode: barcodeBaru,
          nama: namaBaru.slice(0, 200),
          kategori_id: katIdBaru,
          satuan_dasar: satuanBaru,
          hpp: hppBaru,
          harga_ritel: ritelBaru,
          harga_grosir: grosirBaru,
          min_grosir_qty: minGrosirBaru,
          stok: stokBaru,
          stok_min: stokMinBaru,
          punya_varian: false,
          foto_url: String(raw.foto_url || '').trim().slice(0, 500),
          aktif: raw.aktif !== false
        };
        produkBaruQueue.push(objBaru);
        ditambah++;
      }
    } catch (errBaris) {
      gagalList.push({ baris: noBaris, pesan: errBaris && errBaris.message ? errBaris.message : 'Baris gagal diproses.' });
    }
  });

  // Eksekusi batch tulis ke Spreadsheet
  if (produkBaruQueue.length > 0) {
    const hasilBaru = tambahBaris_('Produk', produkBaruQueue, ctx.user.id);
    hasilBaru.forEach(function (pr) {
      prdById[pr.id] = pr;
      if (pr.sku) prdBySku[String(pr.sku).trim().toLowerCase()] = pr;
      if (Number(pr.stok || 0) > 0) {
        const stokAwalPrd = bulatQty_(Number(pr.stok));
        kartuStokQueue.push({
          produk_id: pr.id,
          varian_id: '',
          tipe: 'koreksi',
          qty: stokAwalPrd,
          saldo: stokAwalPrd,
          hpp: Number(pr.hpp || 0),
          ref_id: 'IMPORT-' + (pr.sku || pr.id),
          user_id: ctx.user.id,
          keterangan: 'Stok awal import massal Excel/CSV'
        });
      }
    });
  }

  if (produkUpdateQueue.length > 0) {
    ubahBaris_('Produk', produkUpdateQueue, ctx.user.id);
  }

  if (varianBaruQueue.length > 0) {
    const hasilVarBaru = tambahBaris_('Varian', varianBaruQueue, ctx.user.id);
    hasilVarBaru.forEach(function (v) {
      if (Number(v.stok || 0) > 0) {
        const stokAwalVar = bulatQty_(Number(v.stok));
        kartuStokQueue.push({
          produk_id: v.produk_id,
          varian_id: v.id,
          tipe: 'koreksi',
          qty: stokAwalVar,
          saldo: stokAwalVar,
          hpp: Number(v.hpp || 0),
          ref_id: 'IMPORT-VAR-' + (v.sku || v.id),
          user_id: ctx.user.id,
          keterangan: 'Stok awal varian import massal'
        });
      }
    });
  }

  if (varianUpdateQueue.length > 0) {
    ubahBaris_('Varian', varianUpdateQueue, ctx.user.id);
  }

  // Rekalkulasi stok produk induk yang variannya berubah (Aturan Bisnis #17)
  const daftarIndukRekal = Object.keys(indukRekalkulasiSet);
  if (daftarIndukRekal.length > 0) {
    const semuaVarTerbaru = bacaSemua_('Varian');
    const rekalUpdates = [];
    daftarIndukRekal.forEach(function (pId) {
      const varInduk = semuaVarTerbaru.filter(function (v) { return v.produk_id === pId && v.aktif !== false; });
      const sumStok = varInduk.reduce(function (acc, v) { return acc + (Number(v.stok) || 0); }, 0);
      rekalUpdates.push({ id: pId, data: { punya_varian: true, stok: sumStok } });
    });
    if (rekalUpdates.length > 0) {
      ubahBaris_('Produk', rekalUpdates, ctx.user.id);
    }
  }

  if (kartuStokQueue.length > 0) {
    tambahBaris_('Kartu_Stok', kartuStokQueue, ctx.user.id);
  }

  catatAudit_(ctx.user.id, 'produk_import_massal', 'PRODUK', '', {
    ditambah: ditambah,
    diperbarui: diperbarui,
    varian_ditambah: varianDitambah,
    varian_diperbarui: varianDiperbarui,
    kategori_dibuat: kategoriDibuat,
    dilewati: dilewati,
    gagal: gagalList.length,
    perbarui_stok: perbaruiStok
  });

  return {
    pesan: 'Import massal selesai: ' + ditambah + ' produk baru, ' + diperbarui + ' produk diperbarui, ' + varianDiperbarui + ' varian diperbarui' + (gagalList.length ? ', ' + gagalList.length + ' baris gagal.' : '.'),
    ditambah: ditambah,
    diperbarui: diperbarui,
    varian_ditambah: varianDitambah,
    varian_diperbarui: varianDiperbarui,
    kategori_dibuat: kategoriDibuat,
    dilewati: dilewati,
    total_diproses: items.length,
    gagal: gagalList
  };
}

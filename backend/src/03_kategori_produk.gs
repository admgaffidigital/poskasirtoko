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
    if (isKasir) vCopy.hpp = null; // Kasir TIDAK BOLEH melihat HPP
    petaVarian[v.produk_id].push(vCopy);
  });

  const petaSatuan = {};
  satuanSemua.forEach(function (s) {
    if (s.deleted) return;
    if (!petaSatuan[s.produk_id]) petaSatuan[s.produk_id] = [];
    petaSatuan[s.produk_id].push(Object.assign({}, s));
  });

  // Susun data produk lengkap
  const daftarLengkap = produk.map(function (pr, idx) {
    const prAman = Object.assign({}, pr);
    prAman._idx = idx; // Indeks baris asli untuk fallback stable sort
    if (isKasir) prAman.hpp = null; // Kasir TIDAK BOLEH melihat HPP
    prAman.varian = petaVarian[pr.id] || [];
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
  const stok = V_.angka(p.stok, 'Stok Awal', { bawaan: 0 });
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
    stok_min: stokMin,
    punya_varian: punyaVarian,
    foto_url: fotoUrl,
    aktif: aktif
  }], ctx.user.id)[0];

  // Simpan varian jika ada
  const varianInput = Array.isArray(p.varian) ? p.varian : [];
  let totalStokVarian = 0;
  if (punyaVarian && varianInput.length) {
    const barisVarian = varianInput.map(function (v, idx) {
      const vHpp = V_.rupiah(v.hpp || hpp, 'HPP Varian', { bawaan: hpp });
      const vRitel = V_.rupiah(v.harga_ritel || hargaRitel, 'Harga Ritel Varian', { wajib: true });
      const vGrosir = V_.rupiah(v.harga_grosir || hargaGrosir, 'Harga Grosir Varian', { bawaan: vRitel });
      if (vRitel < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga ritel varian tidak boleh di bawah HPP.');
      if (vGrosir < vHpp) gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga grosir varian tidak boleh di bawah HPP.');
      const vStok = V_.angka(v.stok, 'Stok Varian', { bawaan: 0 });
      totalStokVarian += vStok;

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
        stok_min: V_.angka(v.stok_min, 'Stok Min Varian', { bawaan: stokMin }),
        aktif: v.aktif !== false
      };
    });
    tambahBaris_('Varian', barisVarian, ctx.user.id);

    // Update stok produk induk sesuai jumlah stok varian (Aturan Bisnis #17)
    ubahBaris_('Produk', [{ id: produkBaru.id, data: { stok: totalStokVarian } }], ctx.user.id);
    produkBaru.stok = totalStokVarian;
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

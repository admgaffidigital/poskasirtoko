/* ========================================================================== */
/* FASE 2: HANDLER POS PENJUALAN                                              */
/* ========================================================================== */

/** pelanggan.list — Daftar pelanggan aktif, limit kredit, dan piutang berjalan. */
function aksiPelangganList_(ctx) {
  const p = ctx.payload || {};
  let data = bacaSemua_('Pelanggan');

  // Filter aktif lebih awal sebelum baca sheet Piutang
  if (p.aktif_saja !== false) {
    data = data.filter(function (pel) { return pel.aktif; });
  }

  // Filter tipe (member / umum)
  if (p.tipe) {
    data = data.filter(function (pel) { return pel.tipe === p.tipe; });
  }

  // Filter level member
  if (p.level) {
    data = data.filter(function (pel) { return pel.level === p.level; });
  }

  // Pencarian (nama, kode, hp, alamat)
  const q = String(p.cari || p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pel) {
      return String(pel.nama || '').toLowerCase().indexOf(q) !== -1 ||
        String(pel.kode || '').toLowerCase().indexOf(q) !== -1 ||
        String(pel.hp || '').toLowerCase().indexOf(q) !== -1 ||
        String(pel.alamat || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Hitung total piutang berjalan aktif hanya jika ada pelanggan yang dikembalikan
  const piutangPeta = {};
  if (data.length > 0) {
    const semuaPiutang = bacaSemua_('Piutang');
    semuaPiutang.forEach(function (pt) {
      if (pt.deleted || pt.status === 'lunas') return;
      const pid = pt.pelanggan_id;
      if (!pid) return;
      piutangPeta[pid] = (piutangPeta[pid] || 0) + (Number(pt.sisa) || 0);
    });
  }

  data = data.map(function (pel) {
    const copy = Object.assign({}, pel);
    const hutangAktif = piutangPeta[pel.id] || 0;
    const limitKredit = Number(pel.limit_kredit) || 0;
    copy.piutang_berjalan = hutangAktif;
    copy.sisa_limit = Math.max(0, limitKredit - hutangAktif);
    copy.saldo_deposit = Number(pel.saldo_deposit) || 0;
    return copy;
  });

  // Urutkan nama
  data.sort(function (a, b) { return String(a.nama || '').localeCompare(String(b.nama || '')); });

  if (p.semua) {
    return { items: data, total: data.length, page: 1, limit: data.length };
  }

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
 * penjualan.create — Simpan transaksi penjualan final atomik (Semua Role).
 * Validasi: stok, harga ≥ HPP (item & total), limit kredit tempo (hanya member), diskon kasir.
 * Menghasilkan: nomor nota INV-..., snapshot HPP, kurangi stok + Kartu_Stok, Piutang (bila tempo), Poin (bila member).
 */
function aksiPenjualanCreate_(ctx) {
  const payload = ctx.payload || {};
  const pengaturan = ambilPengaturan_();
  const isKasir = ctx.user.role === ROLE.KASIR;
  const rawItems = payload.items;

  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Keranjang penjualan tidak boleh kosong.');
  }

  // Kunci Periode Bulanan: cegah transaksi pada bulan yang sudah ditutup buku
  const waktuSekarang = sekarang_();
  cekPeriodeTerkunci_(waktuSekarang);

  // Kebijakan Wajib Buka Shift (berlaku untuk semua role bila aktif di Pengaturan)
  if (pengaturan.wajib_buka_shift !== false) {
    const shiftAktifUser = cariShiftAktifKasir_(ctx.user.id);
    if (!shiftAktifUser) {
      gagal_(KODE.VALIDATION, 'SHIFT_BELUM_DIBUKA: Anda wajib membuka Shift Kasir terlebih dahulu sebelum melakukan transaksi di POS.');
    }
    const hariIniStr = waktuSekarang.substring(0, 10);
    const tglBukaShift = String(shiftAktifUser.waktu_buka || '').substring(0, 10);
    if (tglBukaShift && tglBukaShift < hariIniStr) {
      gagal_(KODE.VALIDATION, 'SHIFT_KEMARIN_BELUM_TUTUP: Shift kasir ' + shiftAktifUser.no_shift + ' dari tanggal ' + tglBukaShift + ' belum ditutup. Wajib tutup shift hari sebelumnya terlebih dahulu.');
    }
  }

  // Siapkan indeks data referensi untuk efisiensi batch
  const semuaProduk = bacaSemua_('Produk');
  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const semuaVarian = bacaSemua_('Varian');
  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  const semuaSatuan = bacaSemua_('Satuan_Konversi');
  const satuanPeta = {};
  semuaSatuan.forEach(function (s) {
    const kunci = s.produk_id + '_' + s.satuan;
    satuanPeta[kunci] = s;
  });

  // Validasi & kalkulasi item per item
  let subtotalKotor = 0;
  let totalDiskonItem = 0;
  let totalHppTransaksi = 0;
  const itemsOlah = [];

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const pid = V_.teks(it.produk_id, 'Produk item ke-' + (i + 1), { wajib: true });
    const pr = produkPeta[pid];
    if (!pr || pr.deleted) gagal_(KODE.NOT_FOUND, 'Produk tidak ditemukan atau sudah dihapus.');

    let varObj = null;
    if (pr.punya_varian) {
      const vid = V_.teks(it.varian_id, 'Varian produk ' + pr.nama, { wajib: true });
      varObj = varianPeta[vid];
      if (!varObj || varObj.deleted || varObj.produk_id !== pr.id) {
        gagal_(KODE.NOT_FOUND, 'Varian produk ' + pr.nama + ' tidak valid.');
      }
    }

    const qty = V_.qty(it.qty, 'Jumlah produk ' + pr.nama);
    const satuanNama = V_.teks(it.satuan || pr.satuan_dasar, 'Satuan produk ' + pr.nama, { wajib: true });

    // Tentukan faktor konversi satuan
    let faktor = 1;
    if (satuanNama !== pr.satuan_dasar) {
      const kunciSatuan = pr.id + '_' + satuanNama;
      const dataSatuan = satuanPeta[kunciSatuan];
      if (!dataSatuan || dataSatuan.deleted) {
        gagal_(KODE.VALIDATION, 'Satuan ' + satuanNama + ' tidak terdaftar pada produk ' + pr.nama + '.');
      }
      faktor = Number(dataSatuan.faktor) || 1;
      if (faktor <= 0) gagal_(KODE.VALIDATION, 'Faktor konversi satuan tidak valid.');
    }

    const qtyDasar = bulatQty_(qty * faktor);
    const qtyDibawa = it.qty_dibawa !== undefined && it.qty_dibawa !== null
      ? V_.angka(it.qty_dibawa, 'Qty dibawa ' + pr.nama, { min: 0 })
      : qty;
    if (qtyDibawa > qty) {
      gagal_(KODE.VALIDATION, 'Qty dibawa (' + qtyDibawa + ') tidak boleh lebih besar dari qty beli (' + qty + ').');
    }

    // Cek kecukupan stok (Aturan Bisnis & Pengaturan stok_minus)
    const stokSekarang = varObj ? Number(varObj.stok || 0) : Number(pr.stok || 0);
    if (!pengaturan.stok_minus && stokSekarang < qtyDasar) {
      const labelNama = varObj ? pr.nama + ' (' + varObj.nama_varian + ')' : pr.nama;
      gagal_(KODE.STOK_KURANG, 'Stok ' + labelNama + ' tidak mencukupi (sisa: ' + stokSekarang + ' ' + pr.satuan_dasar + ', diminta: ' + qtyDasar + ' ' + pr.satuan_dasar + ').');
    }

    // Tentukan HPP snapshot per satuan jual (README Aturan 11)
    const hppDasar = varObj ? Number(varObj.hpp || 0) : Number(pr.hpp || 0);
    const hppSnapshot = Math.round(hppDasar * faktor);
    const totalHppItem = Math.round(hppSnapshot * qty);

    // Tentukan harga jual
    const hargaAsli = V_.rupiah(it.harga_asli !== undefined ? it.harga_asli : it.harga, 'Harga asli');
    const hargaJual = V_.rupiah(it.harga, 'Harga jual ' + pr.nama);
    const subtotalBarangKotor = Math.round(hargaJual * qty);

    // Diskon per item
    let diskonItemNilai = 0;
    const diskonTipe = it.diskon_tipe === 'persen' ? 'persen' : (it.diskon_tipe === 'nominal' ? 'nominal' : '');
    const diskonInput = Number(it.diskon_nilai || 0);

    if (diskonTipe === 'persen') {
      if (diskonInput < 0 || diskonInput > 100) gagal_(KODE.VALIDATION, 'Diskon persen harus antara 0 - 100%.');
      if (isKasir && diskonInput > (pengaturan.diskon_maks_kasir_persen || 10)) {
        gagal_(KODE.FORBIDDEN, 'Diskon item ' + pr.nama + ' (' + diskonInput + '%) melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
      }
      diskonItemNilai = Math.round(subtotalBarangKotor * (diskonInput / 100));
    } else if (diskonTipe === 'nominal') {
      if (diskonInput < 0) gagal_(KODE.VALIDATION, 'Diskon nominal tidak boleh minus.');
      const persenEfektif = subtotalBarangKotor > 0 ? (diskonInput / subtotalBarangKotor) * 100 : 0;
      if (isKasir && persenEfektif > (pengaturan.diskon_maks_kasir_persen || 10)) {
        gagal_(KODE.FORBIDDEN, 'Diskon item ' + pr.nama + ' melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
      }
      diskonItemNilai = Math.min(Math.round(diskonInput), subtotalBarangKotor);
    }

    const subtotalItemBersih = Math.max(0, subtotalBarangKotor - diskonItemNilai);

    // Aturan Bisnis #1: Harga jual tidak boleh < HPP per item setelah diskon
    if (subtotalItemBersih < totalHppItem) {
      const labelNama = varObj ? pr.nama + ' (' + varObj.nama_varian + ')' : pr.nama;
      gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Harga jual setelah diskon untuk ' + labelNama + ' (' + formatRupiah_(Math.round(subtotalItemBersih / qty)) + ') berada di bawah HPP (' + formatRupiah_(hppSnapshot) + ').');
    }

    subtotalKotor += subtotalBarangKotor;
    totalDiskonItem += diskonItemNilai;
    totalHppTransaksi += totalHppItem;

    itemsOlah.push({
      produk_id: pr.id,
      varian_id: varObj ? varObj.id : '',
      nama: varObj ? pr.nama + ' - ' + varObj.nama_varian : pr.nama,
      satuan: satuanNama,
      faktor: faktor,
      qty: qty,
      qty_dasar: qtyDasar,
      qty_dibawa: qtyDibawa,
      tipe_harga: it.tipe_harga || 'ritel',
      harga_asli: hargaAsli,
      harga: hargaJual,
      hpp: hppSnapshot,
      diskon_tipe: diskonTipe,
      diskon_nilai: diskonInput,
      diskon: diskonItemNilai,
      subtotal: subtotalItemBersih,
      _pr: pr,
      _var: varObj
    });
  }

  const subtotalSetelahDiskonItem = subtotalKotor - totalDiskonItem;

  // Diskon Transaksi (Global)
  let diskonTransaksiNilai = 0;
  const diskonTransTipe = payload.diskon_tipe === 'persen' ? 'persen' : (payload.diskon_tipe === 'nominal' ? 'nominal' : '');
  const diskonTransInput = Number(payload.diskon_nilai || 0);

  if (diskonTransTipe === 'persen') {
    if (diskonTransInput < 0 || diskonTransInput > 100) gagal_(KODE.VALIDATION, 'Diskon transaksi persen harus antara 0 - 100%.');
    if (isKasir && diskonTransInput > (pengaturan.diskon_maks_kasir_persen || 10)) {
      gagal_(KODE.FORBIDDEN, 'Diskon transaksi (' + diskonTransInput + '%) melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
    }
    diskonTransaksiNilai = Math.round(subtotalSetelahDiskonItem * (diskonTransInput / 100));
  } else if (diskonTransTipe === 'nominal') {
    if (diskonTransInput < 0) gagal_(KODE.VALIDATION, 'Diskon transaksi tidak boleh minus.');
    const persenEfektifTrans = subtotalSetelahDiskonItem > 0 ? (diskonTransInput / subtotalSetelahDiskonItem) * 100 : 0;
    if (isKasir && persenEfektifTrans > (pengaturan.diskon_maks_kasir_persen || 10)) {
      gagal_(KODE.FORBIDDEN, 'Diskon transaksi melebihi batas maksimal kasir (' + pengaturan.diskon_maks_kasir_persen + '%).');
    }
    diskonTransaksiNilai = Math.min(Math.round(diskonTransInput), subtotalSetelahDiskonItem);
  }

  const totalSetelahSemuaDiskon = subtotalSetelahDiskonItem - diskonTransaksiNilai;

  // Aturan Bisnis #1: Total penjualan setelah diskon transaksi tidak boleh di bawah total HPP transaksi
  if (totalSetelahSemuaDiskon < totalHppTransaksi) {
    gagal_(KODE.HARGA_DI_BAWAH_HPP, 'Total transaksi setelah diskon (' + formatRupiah_(totalSetelahSemuaDiskon) + ') berada di bawah total HPP transaksi (' + formatRupiah_(totalHppTransaksi) + ').');
  }

  // Pajak (PPN)
  let pajakNilai = 0;
  if (pengaturan.pajak_aktif) {
    const persenPajak = Number(pengaturan.pajak_persen) || 11;
    pajakNilai = Math.round(totalSetelahSemuaDiskon * (persenPajak / 100));
  }

  // Biaya Ongkos Kirim (hanya berlaku bila opsi pengiriman === 'dikirim', fleksibel manual Rp 0+)
  const pengirimanAwal = payload.pengiriman === 'dikirim' ? 'dikirim' : 'ambil';
  const ongkirNilai = pengirimanAwal === 'dikirim'
    ? V_.rupiah(payload.ongkir, 'Biaya Ongkos Kirim', { bawaan: 0, min: 0 })
    : 0;

  // Pembulatan (dihitung pada total barang + pajak agar ongkir manual tetap utuh)
  let pembulatanNilai = 0;
  if (pengaturan.pembulatan_aktif) {
    const kelipatan = Number(pengaturan.pembulatan_kelipatan) || 100;
    const dasarBulat = totalSetelahSemuaDiskon + pajakNilai;
    const sisaBagi = dasarBulat % kelipatan;
    if (sisaBagi !== 0) {
      pembulatanNilai = kelipatan - sisaBagi;
    }
  }

  const totalBarangNet = Math.round(totalSetelahSemuaDiskon + pajakNilai + pembulatanNilai);
  const grandTotal = Math.round(totalBarangNet + ongkirNilai);

  // Validasi Pelanggan & Pembayaran
  const pelangganId = payload.pelanggan_id ? String(payload.pelanggan_id).trim() : '';
  let pelanggan = null;
  if (pelangganId) {
    pelanggan = cariById_('Pelanggan', pelangganId);
    if (!pelanggan || pelanggan.deleted) gagal_(KODE.NOT_FOUND, 'Data pelanggan tidak ditemukan.');
  }

  const rawBayar = payload.pembayaran;
  if (!rawBayar || !Array.isArray(rawBayar) || rawBayar.length === 0) {
    gagal_(KODE.VALIDATION, 'Metode dan rincian pembayaran wajib diisi.');
  }

  let totalTunai = 0;
  let totalNonTunai = 0;
  let totalTempo = 0;
  let totalDeposit = 0;
  const daftarBayarValid = [];

  for (let b = 0; b < rawBayar.length; b++) {
    const byr = rawBayar[b];
    const metode = V_.pilihan(byr.metode, 'Metode pembayaran ke-' + (b + 1), ['tunai', 'transfer', 'qris', 'tempo', 'deposit']);
    const jumlah = V_.rupiah(byr.jumlah, 'Nominal ' + metode);
    if (jumlah <= 0) continue;

    if (metode === 'tunai') {
      totalTunai += jumlah;
    } else {
      totalNonTunai += jumlah;
      if (metode === 'tempo') totalTempo += jumlah;
      if (metode === 'deposit') totalDeposit += jumlah;
    }

    daftarBayarValid.push({
      metode: metode,
      jumlah: jumlah,
      referensi: V_.teks(byr.referensi, 'Referensi pembayaran', { maks: 100 })
    });
  }

  if (daftarBayarValid.length === 0) {
    gagal_(KODE.VALIDATION, 'Jumlah pembayaran yang dimasukkan harus lebih dari 0.');
  }

  // Validasi Saldo Titipan / Deposit Pelanggan
  if (totalDeposit > 0) {
    if (!pelanggan) {
      gagal_(KODE.VALIDATION, 'Pembayaran menggunakan Saldo Titipan/Deposit hanya untuk pelanggan terdaftar.');
    }
    const saldoDepositSaatIni = Number(pelanggan.saldo_deposit || 0);
    if (totalDeposit > saldoDepositSaatIni) {
      gagal_(KODE.VALIDATION, 'Saldo titipan/deposit tidak mencukupi. Saldo saat ini: ' + formatRupiah_(saldoDepositSaatIni) + ', digunakan: ' + formatRupiah_(totalDeposit) + '.');
    }
  }

  // Aturan Bisnis #3: Tempo HANYA untuk member terdaftar; Pembeli umum harus non-tempo & lunas
  if (totalTempo > 0) {
    if (!pelanggan || pelanggan.tipe !== 'member') {
      gagal_(KODE.TEMPO_NON_MEMBER, 'Pembayaran tempo/kredit hanya diizinkan untuk pelanggan member terdaftar.');
    }

    // Aturan Bisnis #2: Piutang berjalan + tempo baru tidak boleh melebihi limit kredit
    const semuaPiutang = bacaSemua_('Piutang');
    let piutangBerjalan = 0;
    semuaPiutang.forEach(function (pt) {
      if (pt.deleted || pt.status === 'lunas' || pt.pelanggan_id !== pelanggan.id) return;
      piutangBerjalan += (Number(pt.sisa) || 0);
    });

    const limitKreditPelanggan = Number(pelanggan.limit_kredit || 0);
    const sisaLimit = Math.max(0, limitKreditPelanggan - piutangBerjalan);
    if (totalTempo > sisaLimit) {
      gagal_(KODE.LIMIT_KREDIT, 'Limit kredit tidak mencukupi. Sisa limit: ' + formatRupiah_(sisaLimit) + ', pengajuan tempo: ' + formatRupiah_(totalTempo) + '.');
    }
  }

  const totalSemuaBayar = totalTunai + totalNonTunai;
  if (totalSemuaBayar < grandTotal) {
    gagal_(KODE.VALIDATION, 'Pembayaran kurang dari total tagihan (Total: ' + formatRupiah_(grandTotal) + ', Dibayar: ' + formatRupiah_(totalSemuaBayar) + ').');
  }

  if (totalNonTunai > grandTotal) {
    gagal_(KODE.VALIDATION, 'Pembayaran non-tunai (' + formatRupiah_(totalNonTunai) + ') melebihi total tagihan (' + formatRupiah_(grandTotal) + ').');
  }

  const kembalian = totalTunai > 0 ? Math.max(0, totalSemuaBayar - grandTotal) : 0;
  const bayarTercatat = Math.min(totalSemuaBayar, grandTotal + kembalian);

  // Status Pengiriman & Status Barang Dibawa (README 6.3 & Aturan 9)
  const pengiriman = payload.pengiriman === 'dikirim' ? 'dikirim' : 'ambil';
  const alamatKirim = V_.teks(payload.alamat_kirim, 'Alamat pengiriman', { maks: 300 });

  let adaBelumDibawa = false;
  let adaSudahDibawa = false;
  itemsOlah.forEach(function (it) {
    if (it.qty_dibawa < it.qty) adaBelumDibawa = true;
    if (it.qty_dibawa > 0) adaSudahDibawa = true;
  });

  let statusAntar = 'selesai';
  if (adaBelumDibawa) {
    statusAntar = adaSudahDibawa ? 'sebagian' : 'belum_dikirim';
  } else if (pengiriman === 'dikirim') {
    statusAntar = payload.status_antar === 'selesai' ? 'selesai' : 'belum_dikirim';
  }

  // Tentukan Metode Bayar Utama & Status Bayar
  let metodeBayarUtama = 'tunai';
  if (totalTempo > 0) {
    metodeBayarUtama = totalTempo === grandTotal ? 'tempo' : 'kombinasi';
  } else if (daftarBayarValid.length > 1) {
    metodeBayarUtama = 'kombinasi';
  } else {
    metodeBayarUtama = daftarBayarValid[0].metode;
  }

  const statusBayar = totalTempo > 0 ? (totalTempo === grandTotal ? 'belum_lunas' : 'sebagian') : 'lunas';

  // Generate Nomor Faktur Resmi INV-YYYYMMDD-0001 (Atomic via Sheet Counter)
  const noNota = nomorBerikut_('INV');
  const waktuTransaksi = sekarang_();

  // Hitung Loyalty Points (Aturan Bisnis #7: hanya dari belanja BARANG lunas saat final, ongkir tidak mendapat poin)
  let poinDidapat = 0;
  const bayarLunasSaatIni = Math.max(0, grandTotal - totalTempo);
  const bayarBarangSaatIni = Math.min(totalBarangNet, bayarLunasSaatIni);
  const nominalPerPoin = Number(pengaturan.poin_per_rupiah) || 0;
  if (pelanggan && String(pelanggan.tipe || '').toLowerCase() === 'member' && bayarBarangSaatIni > 0 && nominalPerPoin > 0) {
    const pengali = hitungPengaliPoin_(pelanggan.level, pengaturan);
    poinDidapat = Math.floor((bayarBarangSaatIni / nominalPerPoin) * pengali);
  }

  // 1. Simpan Header Penjualan
  const dataPenjualan = {
    no_nota: noNota,
    tanggal: waktuTransaksi,
    kasir_id: ctx.user.id,
    pelanggan_id: pelanggan ? pelanggan.id : '',
    subtotal: subtotalKotor,
    diskon_tipe: diskonTransTipe,
    diskon_nilai: diskonTransInput,
    diskon: totalDiskonItem + diskonTransaksiNilai,
    pajak: pajakNilai,
    pembulatan: pembulatanNilai,
    ongkir: ongkirNilai,
    total: grandTotal,
    bayar: bayarTercatat,
    kembalian: kembalian,
    metode_bayar: metodeBayarUtama,
    status_bayar: statusBayar,
    pengiriman: pengiriman,
    alamat_kirim: alamatKirim,
    status_antar: statusAntar,
    catatan: V_.teks(payload.catatan, 'Catatan penjualan', { maks: 300 }),
    status: 'final',
    void_alasan: '',
    void_oleh: '',
    void_at: '',
    poin_didapat: poinDidapat
  };

  const penjualanTersimpan = tambahBaris_('Penjualan', [dataPenjualan], ctx.user.id)[0];

  // 2. Simpan Item Penjualan
  const barisItems = itemsOlah.map(function (it) {
    return {
      penjualan_id: penjualanTersimpan.id,
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      nama: it.nama,
      satuan: it.satuan,
      faktor: it.faktor,
      qty: it.qty,
      qty_dasar: it.qty_dasar,
      qty_dibawa: it.qty_dibawa,
      tipe_harga: it.tipe_harga,
      harga_asli: it.harga_asli,
      harga: it.harga,
      hpp: it.hpp,
      diskon_tipe: it.diskon_tipe,
      diskon_nilai: it.diskon_nilai,
      diskon: it.diskon,
      subtotal: it.subtotal
    };
  });
  const itemsTersimpan = tambahBaris_('Penjualan_Item', barisItems, ctx.user.id);

  // 3. Simpan Baris Pembayaran (untuk tunai, catat nominal bersih yang masuk laci setelah dikurangi kembalian)
  let sisaKembalianAlokasi = kembalian;
  const barisBayar = daftarBayarValid.map(function (byr) {
    let jmlBersih = byr.jumlah;
    if (byr.metode === 'tunai' && sisaKembalianAlokasi > 0) {
      const potong = Math.min(jmlBersih, sisaKembalianAlokasi);
      jmlBersih -= potong;
      sisaKembalianAlokasi -= potong;
    }
    return {
      penjualan_id: penjualanTersimpan.id,
      metode: byr.metode,
      jumlah: jmlBersih,
      referensi: byr.referensi
    };
  });
  const bayarTersimpan = tambahBaris_('Penjualan_Bayar', barisBayar, ctx.user.id);

  // 4. Pengurangan Stok & Pencatatan Kartu_Stok secara BATCH (Aturan Bisnis #5 — hemat puluhan RPC)
  const updateVarianMap = {};
  const updateProdukMap = {};
  const barisKartuStok = [];

  itemsOlah.forEach(function (it) {
    let saldoAkhir = 0;
    if (it._var) {
      const stokVarianLama = Number(it._var.stok || 0);
      const stokVarianBaru = bulatQty_(stokVarianLama - it.qty_dasar);
      it._var.stok = stokVarianBaru;
      updateVarianMap[it._var.id] = { stok: stokVarianBaru };

      // Hitung ulang total stok induk produk dari semua varian
      const varianLain = semuaVarian.filter(function (v) { return v.produk_id === it._pr.id && !v.deleted; });
      let totalStokInduk = 0;
      varianLain.forEach(function (v) { totalStokInduk += Number(v.stok || 0); });
      const totalIndukBulat = bulatQty_(totalStokInduk);
      it._pr.stok = totalIndukBulat;
      updateProdukMap[it._pr.id] = { stok: totalIndukBulat };
      saldoAkhir = stokVarianBaru;
    } else {
      const stokProdukLama = Number(it._pr.stok || 0);
      const stokProdukBaru = bulatQty_(stokProdukLama - it.qty_dasar);
      it._pr.stok = stokProdukBaru;
      updateProdukMap[it._pr.id] = { stok: stokProdukBaru };
      saldoAkhir = stokProdukBaru;
    }

    barisKartuStok.push({
      produk_id: it.produk_id,
      varian_id: it.varian_id,
      tipe: 'jual',
      qty: -it.qty_dasar,
      saldo: saldoAkhir,
      hpp: it.hpp,
      ref_id: noNota,
      user_id: ctx.user.id,
      keterangan: 'Penjualan ' + noNota + ' (' + it.qty + ' ' + it.satuan + ')'
    });
  });

  const daftarUpdateVarian = Object.keys(updateVarianMap).map(function (vid) { return { id: vid, data: updateVarianMap[vid] }; });
  const daftarUpdateProduk = Object.keys(updateProdukMap).map(function (pid) { return { id: pid, data: updateProdukMap[pid] }; });
  if (daftarUpdateVarian.length) ubahBaris_('Varian', daftarUpdateVarian, ctx.user.id);
  if (daftarUpdateProduk.length) ubahBaris_('Produk', daftarUpdateProduk, ctx.user.id);
  if (barisKartuStok.length) tambahBaris_('Kartu_Stok', barisKartuStok, ctx.user.id);

  // 5. Catat Piutang Pelanggan (Bila ada pembayaran tempo)
  if (totalTempo > 0 && pelanggan) {
    const tempoHari = Number(pelanggan.tempo_hari) || Number(pengaturan.tempo_default_hari) || 30;
    const tglSekarang = new Date();
    const tglJatuhTempo = new Date(tglSekarang.getTime() + tempoHari * 24 * 60 * 60 * 1000);

    tambahBaris_('Piutang', [{
      penjualan_id: penjualanTersimpan.id,
      pelanggan_id: pelanggan.id,
      total: totalTempo,
      terbayar: 0,
      sisa: totalTempo,
      jatuh_tempo: formatWaktu_(tglJatuhTempo),
      status: 'belum'
    }], ctx.user.id);
  }

  // 6. Update Poin, Total Belanja Member & Pemotongan Saldo Titipan/Deposit Pelanggan
  let pelangganRespon = pelanggan ? Object.assign({}, pelanggan, { saldo_deposit: Number(pelanggan.saldo_deposit || 0) }) : null;
  if (pelanggan) {
    const isMemberPel = String(pelanggan.tipe || '').toLowerCase() === 'member';
    const dataUpdatePel = {};
    let saldoDepositBaru = Number(pelanggan.saldo_deposit || 0);

    if (totalDeposit > 0) {
      saldoDepositBaru = Math.max(0, saldoDepositBaru - totalDeposit);
      dataUpdatePel.saldo_deposit = saldoDepositBaru;
    }

    if (isMemberPel) {
      const totalBelanjaLama = Number(pelanggan.total_belanja || 0);
      const totalBelanjaBaru = totalBelanjaLama + bayarBarangSaatIni;
      const poinLama = Number(pelanggan.poin || 0);
      const poinBaru = poinLama + poinDidapat;

      // Evaluasi kenaikan level member secara aman (tidak pernah menurunkan level yang sudah tinggi)
      const levelBaru = evaluasiLevelMember_(pelanggan.level, totalBelanjaBaru, pengaturan);

      dataUpdatePel.total_belanja = totalBelanjaBaru;
      dataUpdatePel.poin = poinBaru;
      dataUpdatePel.level = levelBaru;

      pelangganRespon = Object.assign({}, pelangganRespon, {
        total_belanja: totalBelanjaBaru,
        poin: poinBaru,
        level: levelBaru,
        saldo_deposit: saldoDepositBaru
      });

      if (poinDidapat > 0) {
        tambahBaris_('Poin_Log', [{
          pelanggan_id: pelanggan.id,
          jumlah: poinDidapat,
          jenis: 'dapat',
          ref_id: noNota,
          saldo: poinBaru
        }], ctx.user.id);
      }
    } else if (totalDeposit > 0) {
      pelangganRespon = Object.assign({}, pelangganRespon, {
        saldo_deposit: saldoDepositBaru
      });
    }

    if (Object.keys(dataUpdatePel).length > 0) {
      ubahBaris_('Pelanggan', [{
        id: pelanggan.id,
        data: dataUpdatePel
      }], ctx.user.id);
    }

    if (totalDeposit > 0) {
      tambahBaris_('Deposit_Log', [{
        no_bukti: nomorBerikut_('DEP'),
        pelanggan_id: pelanggan.id,
        jenis: 'pakai',
        metode: 'deposit',
        jumlah: -totalDeposit,
        saldo: saldoDepositBaru,
        ref_id: noNota,
        catatan: 'Pembayaran nota ' + noNota
      }], ctx.user.id);
    }
  }

  // 7. Bersihkan Draft Pending bila transaksi ini berasal dari pending
  if (payload.pending_id) {
    const pendingLama = cariById_('Penjualan', payload.pending_id);
    if (pendingLama && pendingLama.status === 'pending') {
      hapusLunak_('Penjualan', pendingLama.id, ctx.user.id);
      bacaSemua_('Penjualan_Item').filter(function (pi) { return pi.penjualan_id === pendingLama.id; }).forEach(function (pi) {
        hapusLunak_('Penjualan_Item', pi.id, ctx.user.id);
      });
    }
  }

  // 8. Catat Audit Log (dan tandai bila diskon tinggi)
  const totalSemuaDiskon = totalDiskonItem + diskonTransaksiNilai;
  const persenTotalDiskon = subtotalKotor > 0 ? (totalSemuaDiskon / subtotalKotor) * 100 : 0;
  const auditDiskonPerlu = persenTotalDiskon >= (pengaturan.audit_diskon_persen || 10);

  catatAudit_(ctx.user.id, 'penjualan_create', 'PENJUALAN', noNota, {
    total: grandTotal,
    pelanggan: pelanggan ? pelanggan.nama : 'Umum',
    metode: metodeBayarUtama,
    diskon_tinggi: auditDiskonPerlu,
    total_diskon: totalSemuaDiskon
  });

  // Hapus cache katalog produk
  cacheHapus_('produk');

  return {
    penjualan: penjualanTersimpan,
    items: itemsTersimpan,
    pembayaran: bayarTersimpan,
    pelanggan: pelangganRespon,
    kasir: {
      id: ctx.user.id,
      nama: ctx.user.nama || ctx.user.username
    },
    toko: {
      nama: pengaturan.toko_nama || 'Toko',
      alamat: pengaturan.toko_alamat || '',
      hp: pengaturan.toko_hp || '',
      nota_footer: pengaturan.nota_footer || ''
    }
  };
}

/** penjualan.pending.save — Simpan draft transaksi (Tahan Transaksi / Hold Cart). */
function aksiPenjualanPendingSave_(ctx) {
  const payload = ctx.payload || {};
  const rawItems = payload.items;
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Keranjang kosong tidak bisa disimpan sebagai draft.');
  }

  const noDraft = 'HOLD-' + Utilities.formatDate(new Date(), APP.TZ, 'HHmmss') + '-' + ('000' + Math.floor(Math.random() * 1000)).slice(-3);
  let subtotalKotor = 0;
  rawItems.forEach(function (it) {
    subtotalKotor += Math.round((Number(it.harga) || 0) * (Number(it.qty) || 0));
  });

  const diskonNilai = Number(payload.diskon || 0);
  const totalEstimasi = Math.max(0, subtotalKotor - diskonNilai);

  // Jika memperbarui pending lama
  if (payload.id) {
    const lama = cariById_('Penjualan', payload.id);
    if (lama && lama.status === 'pending') {
      hapusLunak_('Penjualan', lama.id, ctx.user.id);
      bacaSemua_('Penjualan_Item').filter(function (pi) { return pi.penjualan_id === lama.id; }).forEach(function (pi) {
        hapusLunak_('Penjualan_Item', pi.id, ctx.user.id);
      });
    }
  }

  const dataPending = {
    no_nota: noDraft,
    tanggal: sekarang_(),
    kasir_id: ctx.user.id,
    pelanggan_id: payload.pelanggan_id ? String(payload.pelanggan_id).trim() : '',
    subtotal: subtotalKotor,
    diskon_tipe: payload.diskon_tipe || '',
    diskon_nilai: Number(payload.diskon_nilai || 0),
    diskon: diskonNilai,
    pajak: 0,
    pembulatan: 0,
    ongkir: payload.pengiriman === 'dikirim' ? Math.max(0, Number(payload.ongkir) || 0) : 0,
    total: totalEstimasi + (payload.pengiriman === 'dikirim' ? Math.max(0, Number(payload.ongkir) || 0) : 0),
    bayar: 0,
    kembalian: 0,
    metode_bayar: 'tunai',
    status_bayar: 'belum_lunas',
    pengiriman: payload.pengiriman || 'ambil',
    alamat_kirim: payload.alamat_kirim || '',
    status_antar: 'belum_dikirim',
    catatan: V_.teks(payload.catatan, 'Catatan draft', { maks: 300 }),
    status: 'pending',
    void_alasan: '',
    void_oleh: '',
    void_at: '',
    poin_didapat: 0
  };

  const pendingTersimpan = tambahBaris_('Penjualan', [dataPending], ctx.user.id)[0];

  const barisItems = rawItems.map(function (it) {
    return {
      penjualan_id: pendingTersimpan.id,
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      nama: it.nama || 'Item',
      satuan: it.satuan || 'Pcs',
      faktor: Number(it.faktor) || 1,
      qty: Number(it.qty) || 1,
      qty_dasar: bulatQty_((Number(it.qty) || 1) * (Number(it.faktor) || 1)),
      qty_dibawa: Number(it.qty_dibawa) || Number(it.qty) || 1,
      tipe_harga: it.tipe_harga || 'ritel',
      harga_asli: Number(it.harga_asli) || Number(it.harga) || 0,
      harga: Number(it.harga) || 0,
      hpp: Number(it.hpp) || 0,
      diskon_tipe: it.diskon_tipe || '',
      diskon_nilai: Number(it.diskon_nilai) || 0,
      diskon: Number(it.diskon) || 0,
      subtotal: Math.round((Number(it.harga) || 0) * (Number(it.qty) || 0))
    };
  });
  tambahBaris_('Penjualan_Item', barisItems, ctx.user.id);

  return {
    id: pendingTersimpan.id,
    no_nota: pendingTersimpan.no_nota,
    total: pendingTersimpan.total,
    item_count: barisItems.length
  };
}

/** penjualan.pending.list — Daftar transaksi yang sedang ditahan. */
function aksiPenjualanPendingList_() {
  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelPeta = {};
  semuaPelanggan.forEach(function (pel) { pelPeta[pel.id] = pel; });

  const semuaItems = bacaSemua_('Penjualan_Item');
  const itemPeta = {};
  semuaItems.forEach(function (it) {
    if (it.deleted) return;
    if (!itemPeta[it.penjualan_id]) itemPeta[it.penjualan_id] = [];
    itemPeta[it.penjualan_id].push(it);
  });

  const pending = semuaPenjualan
    .filter(function (p) { return p.status === 'pending' && !p.deleted; })
    .map(function (p) {
      const copy = Object.assign({}, p);
      const pel = pelPeta[p.pelanggan_id];
      copy.pelanggan_nama = pel ? pel.nama : 'Umum';
      copy.items = itemPeta[p.id] || [];
      copy.item_count = copy.items.length;
      return copy;
    });

  pending.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  return { items: pending, total: pending.length };
}

/** penjualan.pending.delete — Hapus draft transaksi yang ditahan. */
function aksiPenjualanPendingDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Pending', { wajib: true });
  const pending = cariById_('Penjualan', id);
  if (!pending || pending.status !== 'pending') {
    gagal_(KODE.NOT_FOUND, 'Draft transaksi tidak ditemukan.');
  }

  hapusLunak_('Penjualan', pending.id, ctx.user.id);
  bacaSemua_('Penjualan_Item').filter(function (pi) { return pi.penjualan_id === pending.id; }).forEach(function (pi) {
    hapusLunak_('Penjualan_Item', pi.id, ctx.user.id);
  });

  return { pesan: 'Draft transaksi ' + pending.no_nota + ' berhasil dihapus.' };
}

/** penjualan.list — Daftar riwayat penjualan dengan pencarian dan filter */
function aksiPenjualanList_(ctx) {
  const p = ctx.payload || {};
  const semuaPenjualan = bacaSemua_('Penjualan');
  const semuaPelanggan = bacaSemua_('Pelanggan');
  const pelangganPeta = {};
  semuaPelanggan.forEach(function (pl) { pelangganPeta[pl.id] = pl.nama; });

  let data = semuaPenjualan.map(function (pj) {
    const copy = Object.assign({}, pj);
    copy.pelanggan_nama = pelangganPeta[pj.pelanggan_id] || (pj.pelanggan_id ? 'Pelanggan' : 'Umum (Non-Member)');
    return copy;
  });

  // Jangan tampilkan draft pending di daftar penjualan final
  data = data.filter(function (pj) { return pj.status !== 'pending'; });

  // Filter void (default hanya non-void kecuali diminta)
  if (!p.include_void) {
    data = data.filter(function (pj) { return pj.status !== 'void' && !pj.void; });
  }

  // Filter pelanggan
  if (p.pelanggan_id) {
    data = data.filter(function (pj) { return pj.pelanggan_id === p.pelanggan_id; });
  }

  // Filter status bayar
  if (p.status_bayar) {
    data = data.filter(function (pj) { return pj.status_bayar === p.status_bayar; });
  }

  // Filter tanggal
  if (p.dari) {
    data = data.filter(function (pj) { return String(pj.tanggal || '').substring(0, 10) >= p.dari; });
  }
  if (p.sampai) {
    data = data.filter(function (pj) { return String(pj.tanggal || '').substring(0, 10) <= p.sampai; });
  }

  // Pencarian no_nota atau pelanggan_nama
  const q = String(p.q || p.cari || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function (pj) {
      return String(pj.no_nota || '').toLowerCase().indexOf(q) !== -1 ||
        String(pj.pelanggan_nama || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Urutkan tanggal desc
  data.sort(function (a, b) {
    return String(b.tanggal || '').localeCompare(String(a.tanggal || ''));
  });

  const total = data.length;
  const page = Math.max(1, parseInt(p.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(p.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const items = data.slice(offset, offset + limit);

  return {
    items: items,
    total: total,
    page: page,
    limit: limit,
    total_halaman: Math.ceil(total / limit)
  };
}

/** penjualan.detail — Lihat rincian transaksi lengkap untuk struk / audit. */
function aksiPenjualanDetail_(ctx) {
  const p = ctx.payload || {};
  const id = p.id || p.no_nota;
  if (!id) gagal_(KODE.VALIDATION, 'ID atau nomor nota penjualan wajib disertakan.');

  let penjualan = cariById_('Penjualan', id);
  if (!penjualan) {
    const semua = bacaSemua_('Penjualan');
    for (let i = 0; i < semua.length; i++) {
      if (semua[i].no_nota === id) {
        penjualan = semua[i];
        break;
      }
    }
  }

  if (!penjualan) gagal_(KODE.NOT_FOUND, 'Transaksi penjualan tidak ditemukan.');

  const items = bacaSemua_('Penjualan_Item').filter(function (it) {
    return it.penjualan_id === penjualan.id && !it.deleted;
  });

  const pembayaran = bacaSemua_('Penjualan_Bayar').filter(function (byr) {
    return byr.penjualan_id === penjualan.id && !byr.deleted;
  });

  const pelangganRaw = penjualan.pelanggan_id ? cariById_('Pelanggan', penjualan.pelanggan_id) : null;
  const pelanggan = pelangganRaw ? Object.assign({}, pelangganRaw, { saldo_deposit: Number(pelangganRaw.saldo_deposit) || 0 }) : null;
  const kasir = penjualan.kasir_id ? cariById_('Users', penjualan.kasir_id) : null;
  const peng = ambilPengaturan_();

  return {
    penjualan: penjualan,
    items: items,
    pembayaran: pembayaran,
    pelanggan: pelanggan,
    kasir: kasir ? { id: kasir.id, nama: kasir.nama || kasir.username } : null,
    toko: {
      nama: peng.toko_nama || 'Toko',
      alamat: peng.toko_alamat || '',
      hp: peng.toko_hp || '',
      nota_footer: peng.nota_footer || ''
    }
  };
}

/** Helper cek apakah timestamp transaksi masuk rentang shift (waktu penuh) atau tanggal harian. */
function cocokRentangWaktuShift_(tsUtama, tsCadangan, opsi) {
  const s1 = String(tsUtama || '').trim();
  const s2 = String(tsCadangan || '').trim();
  if (opsi.waktuMulai) {
    const waktuPenuh = s1.length >= 19 ? s1 : (s2.length >= 19 ? s2 : '');
    if (waktuPenuh) {
      return waktuPenuh >= opsi.waktuMulai && waktuPenuh <= opsi.waktuSelesai;
    }
    const tglSaja = (s1 || s2).substring(0, 10);
    if (!tglSaja) return false;
    return tglSaja >= opsi.waktuMulai.substring(0, 10) && tglSaja <= opsi.waktuSelesai.substring(0, 10);
  }
  const tgl = (s1 || s2).substring(0, 10);
  return tgl === opsi.targetTgl;
}

/**
 * Mesin hitung rekapitulasi kas & transaksi untuk shift kasir (dipakai oleh X-Report, Shift Aktif, & Z-Report Tutup Shift).
 */
function hitungRekapShiftKasir_(targetKasirId, opsi) {
  opsi = opsi || {};
  const semuaUsers = bacaSemua_('Users');
  const userPeta = {};
  semuaUsers.forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  const semuaPenjualan = bacaSemua_('Penjualan');
  const penjualanShift = semuaPenjualan.filter(function (pj) {
    if (pj.deleted || pj.void || pj.status === 'void' || pj.status === 'pending') return false;
    if (!cocokRentangWaktuShift_(pj.tanggal, pj.created_at, opsi)) return false;
    if (targetKasirId && pj.created_by !== targetKasirId && pj.kasir_id !== targetKasirId) return false;
    return true;
  });

  // Kelompokkan rincian Penjualan_Bayar per nota (akurat untuk metode kombinasi & anti-kelebihan hitung kembalian)
  const bayarByPenjualan = {};
  bacaSemua_('Penjualan_Bayar').forEach(function (byr) {
    if (byr.deleted) return;
    if (!bayarByPenjualan[byr.penjualan_id]) bayarByPenjualan[byr.penjualan_id] = [];
    bayarByPenjualan[byr.penjualan_id].push(byr);
  });

  let totalTransaksi = penjualanShift.length;
  let totalPenjualan = 0;
  let totalTunai = 0;
  let totalTransfer = 0;
  let totalTempo = 0;
  let totalDepositPakai = 0;
  let totalDiskon = 0;

  penjualanShift.forEach(function (pj) {
    const tot = Number(pj.total) || 0;
    totalPenjualan += tot;
    totalDiskon += Number(pj.diskon) || 0;

    const rincianBayar = bayarByPenjualan[pj.id];
    if (rincianBayar && rincianBayar.length > 0) {
      let sumByr = 0;
      rincianBayar.forEach(function (b) { sumByr += Number(b.jumlah) || 0; });
      let sisaKelebihan = Math.max(0, sumByr - tot);

      rincianBayar.forEach(function (b) {
        const m = String(b.metode || 'tunai').toLowerCase();
        let jml = Number(b.jumlah) || 0;
        if (m === 'tunai' && sisaKelebihan > 0) {
          const pot = Math.min(jml, sisaKelebihan);
          jml -= pot;
          sisaKelebihan -= pot;
        }
        if (m === 'tunai') totalTunai += jml;
        else if (m === 'transfer' || m === 'qris' || m === 'debit') totalTransfer += jml;
        else if (m === 'tempo') totalTempo += jml;
        else if (m === 'deposit') totalDepositPakai += jml;
      });
    } else {
      const m = String(pj.metode_bayar || 'tunai').toLowerCase();
      if (m === 'tunai') {
        totalTunai += tot;
      } else if (m === 'transfer' || m === 'qris' || m === 'debit') {
        totalTransfer += tot;
      } else if (m === 'tempo') {
        totalTempo += tot;
      } else if (m === 'deposit') {
        totalDepositPakai += tot;
      } else {
        const bayarNet = Math.max(0, (Number(pj.bayar) || tot) - (Number(pj.kembalian) || 0));
        totalTunai += Math.min(tot, bayarNet);
      }
    }
  });

  const modalAwal = Math.max(0, Math.round(Number(opsi.modalAwal) || 0));

  // Penerimaan Pelunasan Piutang Tunai (masuk ke laci kasir)
  let totalPiutangTunai = 0;
  bacaSemua_('Pembayaran').forEach(function (byr) {
    if (byr.deleted || byr.tipe !== 'piutang') return;
    if (!cocokRentangWaktuShift_(byr.created_at, byr.tanggal, opsi)) return;
    if (targetKasirId && byr.created_by !== targetKasirId) return;
    const m = String(byr.metode || 'tunai').toLowerCase();
    if (m === 'tunai') {
      totalPiutangTunai += Number(byr.jumlah) || 0;
    }
  });

  // Refund Retur Penjualan Tunai (keluar dari laci kasir)
  let totalRefundTunai = 0;
  bacaSemua_('Retur').forEach(function (rt) {
    if (rt.deleted || rt.tipe !== 'jual' || rt.status !== 'disetujui') return;
    if (String(rt.metode_refund || '').toLowerCase() !== 'kas') return;
    if (!cocokRentangWaktuShift_(rt.disetujui_at, rt.tanggal, opsi)) return;
    const pelaksanaId = rt.disetujui_oleh || rt.created_by;
    if (targetKasirId && pelaksanaId !== targetKasirId && rt.created_by !== targetKasirId) return;
    totalRefundTunai += Number(rt.total) || 0;
  });

  // Pengeluaran Kasir (Petty Cash / Kas Keluar dari Laci Kasir)
  const semuaBiaya = bacaSemua_('Biaya');
  let totalBiayaKasir = 0;
  const rincianBiayaKasir = [];

  semuaBiaya.forEach(function (b) {
    if (b.deleted || b.status === 'batal') return;
    const cocokShiftId = opsi.shiftId && b.shift_id && b.shift_id === opsi.shiftId;
    if (opsi.shiftId && b.shift_id && b.shift_id !== opsi.shiftId) return;
    if (!cocokShiftId) {
      if (!cocokRentangWaktuShift_(b.created_at, b.tanggal, opsi)) return;
      if (targetKasirId && b.user_id !== targetKasirId) return;
    }
    const sumber = String(b.sumber_dana || 'kas_kasir').toLowerCase();
    if (sumber === 'kas_kasir') {
      const nom = Number(b.nominal) || 0;
      totalBiayaKasir += nom;
      rincianBiayaKasir.push({
        id: b.id,
        no_transaksi: b.no_transaksi || ('EXP-' + String(b.id || '').substring(0, 6)),
        kategori: b.kategori,
        nominal: nom,
        keterangan: b.keterangan || '',
        waktu: String(b.created_at || b.tanggal || '').substring(11, 16)
      });
    }
  });

  // Terima Titipan / Tarik Titipan Pelanggan Tunai (masuk/keluar laci kasir)
  let totalDepositTunai = 0;
  let totalTarikDepositTunai = 0;
  bacaSemua_('Deposit_Log').forEach(function (dl) {
    if (dl.deleted) return;
    if (!cocokRentangWaktuShift_(dl.created_at, '', opsi)) return;
    if (targetKasirId && dl.created_by !== targetKasirId) return;
    const m = String(dl.metode || '').toLowerCase();
    if (m !== 'tunai') return;
    const jml = Number(dl.jumlah) || 0;
    if (dl.jenis === 'masuk' && jml > 0) {
      totalDepositTunai += jml;
    } else if (dl.jenis === 'tarik' && jml !== 0) {
      totalTarikDepositTunai += Math.abs(jml);
    }
  });

  const totalLaci = Math.max(0, modalAwal + totalTunai + totalPiutangTunai + totalDepositTunai - totalBiayaKasir - totalRefundTunai - totalTarikDepositTunai);

  return {
    tanggal: opsi.targetTgl || (opsi.waktuMulai ? opsi.waktuMulai.substring(0, 10) : sekarang_().substring(0, 10)),
    kasir: {
      id: targetKasirId || (opsi.fallbackUser ? opsi.fallbackUser.id : ''),
      nama: userPeta[targetKasirId] || (opsi.fallbackUser ? (opsi.fallbackUser.nama || opsi.fallbackUser.username) : 'Kasir')
    },
    modal_awal: modalAwal,
    total_transaksi: totalTransaksi,
    total_penjualan: totalPenjualan,
    total_tunai: totalTunai,
    total_transfer: totalTransfer,
    total_tempo: totalTempo,
    total_deposit_pakai: totalDepositPakai,
    total_diskon: totalDiskon,
    total_piutang_tunai: totalPiutangTunai,
    total_deposit_tunai: totalDepositTunai,
    total_tarik_deposit_tunai: totalTarikDepositTunai,
    total_refund_tunai: totalRefundTunai,
    total_biaya_kasir: totalBiayaKasir,
    rincian_biaya_kasir: rincianBiayaKasir,
    total_laci: totalLaci,
    kas_sistem: totalLaci
  };
}

/** Cari shift kasir aktif milik userId tertentu (null bila belum buka shift). */
function cariShiftAktifKasir_(kasirId) {
  if (!kasirId) return null;
  const semua = bacaSemua_('Shift_Kasir');
  for (let i = semua.length - 1; i >= 0; i--) {
    const s = semua[i];
    if (!s.deleted && s.status === 'aktif' && s.kasir_id === kasirId) return s;
  }
  return null;
}

/** penjualan.shiftKasir — Ringkasan kas, transaksi, dan saldo laci untuk shift kasir (X-Report). */
function aksiPenjualanShiftKasir_(ctx) {
  const p = ctx.payload || {};
  const user = ctx.user;
  const isOwnerOrAdmin = user.role === ROLE.OWNER || user.role === ROLE.ADMIN;

  const targetTgl = p.tanggal || formatWaktu_(new Date()).substring(0, 10);
  const targetKasirId = p.kasir_id || (isOwnerOrAdmin && p.semua_kasir ? '' : user.id);

  // Cek apakah ada shift aktif yang relevan (kecuali user secara eksplisit meminta tanggal berbeda atau semua kasir)
  let shiftAktif = null;
  if (p.shift_id) {
    shiftAktif = cariById_('Shift_Kasir', p.shift_id);
  } else if (targetKasirId && (!p.tanggal || p.tanggal === formatWaktu_(new Date()).substring(0, 10))) {
    shiftAktif = cariShiftAktifKasir_(targetKasirId);
  }

  let opsiHitung;
  if (shiftAktif && !p.abaikan_shift_aktif) {
    opsiHitung = {
      shiftId: shiftAktif.id,
      waktuMulai: shiftAktif.waktu_buka,
      waktuSelesai: shiftAktif.waktu_tutup || sekarang_(),
      targetTgl: String(shiftAktif.waktu_buka || targetTgl).substring(0, 10),
      modalAwal: p.modal_awal !== undefined && p.modal_awal !== null ? Number(p.modal_awal) : Number(shiftAktif.modal_awal || 0),
      fallbackUser: user
    };
  } else {
    opsiHitung = {
      targetTgl: targetTgl,
      modalAwal: Number(p.modal_awal) || 0,
      fallbackUser: user
    };
  }

  const hasil = hitungRekapShiftKasir_(targetKasirId, opsiHitung);
  if (shiftAktif) {
    hasil.shift_id = shiftAktif.id;
    hasil.no_shift = shiftAktif.no_shift;
    hasil.status = shiftAktif.status;
    hasil.waktu_buka = shiftAktif.waktu_buka;
    hasil.waktu_tutup = shiftAktif.waktu_tutup || '';
    hasil.catatan_buka = shiftAktif.catatan_buka || '';
    hasil.shift_aktif = shiftAktif;
  } else {
    hasil.shift_aktif = null;
  }
  return hasil;
}

/** shift.aktif — Cek status shift aktif kasir + hitung live ekspektasi kas laci. */
function aksiShiftAktif_(ctx) {
  const p = ctx.payload || {};
  const user = ctx.user;
  const pengaturan = ambilPengaturan_();
  const wajibBukaShift = pengaturan.wajib_buka_shift !== false;
  const isOwnerOrAdmin = user.role === ROLE.OWNER || user.role === ROLE.ADMIN;
  const targetKasirId = (isOwnerOrAdmin && p.kasir_id) ? String(p.kasir_id) : user.id;
  const hariIni = sekarang_().substring(0, 10);

  // Cek saran modal awal dari Tutup Harian terakhir (sisa_modal_besok)
  let saranModalAwal = 0;
  try {
    const arsipHarian = bacaSemua_('Tutup_Buku')
      .filter(function (tb) { return !tb.deleted && tb.tipe === 'harian' && Number(tb.sisa_modal_besok || 0) > 0; })
      .sort(function (a, b) { return String(b.periode || '').localeCompare(String(a.periode || '')); });
    if (arsipHarian.length > 0) {
      saranModalAwal = Number(arsipHarian[0].sisa_modal_besok || 0);
    }
  } catch (_) {}

  const semuaShiftAktif = bacaSemua_('Shift_Kasir').filter(function (s) {
    return !s.deleted && s.status === 'aktif';
  });
  const shiftAktifLainCount = semuaShiftAktif.filter(function (s) { return s.kasir_id !== targetKasirId; }).length;

  const shiftAktif = cariShiftAktifKasir_(targetKasirId);
  if (!shiftAktif) {
    return {
      shift: null,
      ringkasan: null,
      wajib_buka_shift: wajibBukaShift,
      shift_kemarin_belum_tutup: false,
      saran_modal_awal: saranModalAwal,
      shift_aktif_lain_count: shiftAktifLainCount
    };
  }

  const tglShift = String(shiftAktif.waktu_buka || '').substring(0, 10);
  const shiftKemarinBelumTutup = Boolean(tglShift && tglShift < hariIni);

  const rekap = hitungRekapShiftKasir_(shiftAktif.kasir_id, {
    shiftId: shiftAktif.id,
    waktuMulai: shiftAktif.waktu_buka,
    waktuSelesai: sekarang_(),
    targetTgl: tglShift,
    modalAwal: Number(shiftAktif.modal_awal || 0),
    fallbackUser: user
  });
  rekap.shift_id = shiftAktif.id;
  rekap.no_shift = shiftAktif.no_shift;
  rekap.status = shiftAktif.status;
  rekap.waktu_buka = shiftAktif.waktu_buka;
  rekap.catatan_buka = shiftAktif.catatan_buka || '';
  rekap.tipe_laporan = 'X-REPORT';

  return {
    shift: shiftAktif,
    ringkasan: rekap,
    wajib_buka_shift: wajibBukaShift,
    shift_kemarin_belum_tutup: shiftKemarinBelumTutup,
    saran_modal_awal: saranModalAwal,
    shift_aktif_lain_count: shiftAktifLainCount
  };
}

/** shift.buka — Buka shift kasir baru dengan modal awal (float laci). */
function aksiShiftBuka_(ctx) {
  const p = ctx.payload || {};
  const user = ctx.user;
  cekPeriodeTerkunci_(sekarang_());
  const modalAwal = Math.round(V_.nonNegatif(p.modal_awal, 'Modal awal laci', { bawaan: 0 }));
  const catatanBuka = V_.teks(p.catatan || p.catatan_buka || '', 'Catatan buka shift', { maks: 300 });

  const sudahAktif = cariShiftAktifKasir_(user.id);
  if (sudahAktif) {
    gagal_(KODE.CONFLICT, 'Anda masih memiliki shift kasir aktif (' + sudahAktif.no_shift + '). Tutup shift tersebut terlebih dahulu.');
  }

  const noShift = nomorBerikut_('SHF');
  const waktuBuka = sekarang_();
  const namaKasir = user.nama || user.username || 'Kasir';

  const baru = tambahBaris_('Shift_Kasir', [{
    no_shift: noShift,
    kasir_id: user.id,
    kasir_nama: namaKasir,
    waktu_buka: waktuBuka,
    waktu_tutup: '',
    status: 'aktif',
    modal_awal: modalAwal,
    total_transaksi: 0,
    total_penjualan: 0,
    total_tunai: 0,
    total_transfer: 0,
    total_tempo: 0,
    total_deposit_pakai: 0,
    total_diskon: 0,
    total_piutang_tunai: 0,
    total_deposit_tunai: 0,
    total_tarik_deposit_tunai: 0,
    total_refund_tunai: 0,
    total_biaya_kasir: 0,
    kas_sistem: modalAwal,
    kas_fisik: 0,
    selisih: 0,
    catatan_buka: catatanBuka,
    catatan_tutup: '',
    ditutup_oleh: '',
    ditutup_oleh_nama: ''
  }], user.id)[0];

  catatAudit_(user.id, 'shift_buka', 'SHIFT', noShift, {
    modal_awal: modalAwal,
    catatan_buka: catatanBuka
  });

  const rekap = hitungRekapShiftKasir_(user.id, {
    shiftId: baru.id,
    waktuMulai: waktuBuka,
    waktuSelesai: waktuBuka,
    targetTgl: waktuBuka.substring(0, 10),
    modalAwal: modalAwal,
    fallbackUser: user
  });
  rekap.shift_id = baru.id;
  rekap.no_shift = noShift;
  rekap.status = 'aktif';
  rekap.waktu_buka = waktuBuka;
  rekap.catatan_buka = catatanBuka;
  rekap.tipe_laporan = 'X-REPORT';

  return {
    shift: baru,
    ringkasan: rekap,
    pesan: 'Shift kasir ' + noShift + ' berhasil dibuka dengan modal awal ' + formatRupiah_(modalAwal) + '.'
  };
}

/** shift.tutup — Tutup shift kasir, hitung fisik laci vs kas sistem, simpan snapshot Z-Report & audit selisih. */
function aksiShiftTutup_(ctx) {
  const p = ctx.payload || {};
  const user = ctx.user;
  const isOwnerOrAdmin = user.role === ROLE.OWNER || user.role === ROLE.ADMIN;

  let shift = null;
  if (p.id) {
    shift = cariById_('Shift_Kasir', String(p.id).trim());
  } else {
    shift = cariShiftAktifKasir_(user.id);
  }

  if (!shift || shift.deleted) {
    gagal_(KODE.NOT_FOUND, 'Shift kasir aktif tidak ditemukan.');
  }
  if (shift.status !== 'aktif') {
    gagal_(KODE.CONFLICT, 'Shift ' + shift.no_shift + ' sudah ditutup sebelumnya.');
  }
  if (!isOwnerOrAdmin && shift.kasir_id !== user.id) {
    gagal_(KODE.FORBIDDEN, 'Anda hanya dapat menutup shift kasir milik Anda sendiri.');
  }

  if (p.kas_fisik === undefined || p.kas_fisik === null || p.kas_fisik === '') {
    gagal_(KODE.VALIDATION, 'Jumlah uang fisik di laci wajib diisi.');
  }
  const kasFisik = Math.round(V_.nonNegatif(p.kas_fisik, 'Jumlah uang fisik di laci', { wajib: true }));
  const catatanTutup = V_.teks(p.catatan || p.catatan_tutup || '', 'Catatan tutup shift', { maks: 400 });

  const waktuTutup = sekarang_();
  const rekap = hitungRekapShiftKasir_(shift.kasir_id, {
    shiftId: shift.id,
    waktuMulai: shift.waktu_buka,
    waktuSelesai: waktuTutup,
    targetTgl: String(shift.waktu_buka || '').substring(0, 10),
    modalAwal: Number(shift.modal_awal || 0),
    fallbackUser: { id: shift.kasir_id, nama: shift.kasir_nama }
  });

  const kasSistem = Math.round(Number(rekap.total_laci || 0));
  const selisih = kasFisik - kasSistem;

  if (selisih !== 0 && !catatanTutup) {
    const labelSelisih = selisih > 0 ? ('lebih +' + formatRupiah_(selisih)) : ('kurang -' + formatRupiah_(Math.abs(selisih)));
    gagal_(KODE.VALIDATION, 'Terdapat selisih kas ' + labelSelisih + '. Catatan/penjelasan selisih wajib diisi.');
  }

  const namaPenutup = user.nama || user.username || 'Kasir';
  const shiftTutup = ubahBaris_('Shift_Kasir', [{
    id: shift.id,
    data: {
      waktu_tutup: waktuTutup,
      status: 'ditutup',
      total_transaksi: rekap.total_transaksi,
      total_penjualan: rekap.total_penjualan,
      total_tunai: rekap.total_tunai,
      total_transfer: rekap.total_transfer,
      total_tempo: rekap.total_tempo,
      total_deposit_pakai: rekap.total_deposit_pakai,
      total_diskon: rekap.total_diskon,
      total_piutang_tunai: rekap.total_piutang_tunai,
      total_deposit_tunai: rekap.total_deposit_tunai,
      total_tarik_deposit_tunai: rekap.total_tarik_deposit_tunai,
      total_refund_tunai: rekap.total_refund_tunai,
      total_biaya_kasir: rekap.total_biaya_kasir,
      kas_sistem: kasSistem,
      kas_fisik: kasFisik,
      selisih: selisih,
      catatan_tutup: catatanTutup,
      ditutup_oleh: user.id,
      ditutup_oleh_nama: namaPenutup
    }
  }], user.id)[0];

  catatAudit_(user.id, 'shift_tutup', 'SHIFT', shift.no_shift, {
    kasir_id: shift.kasir_id,
    kasir_nama: shift.kasir_nama,
    modal_awal: shift.modal_awal,
    kas_sistem: kasSistem,
    kas_fisik: kasFisik,
    selisih: selisih,
    catatan_tutup: catatanTutup
  });

  rekap.shift_id = shiftTutup.id;
  rekap.no_shift = shiftTutup.no_shift;
  rekap.status = 'ditutup';
  rekap.waktu_buka = shiftTutup.waktu_buka;
  rekap.waktu_tutup = waktuTutup;
  rekap.kas_sistem = kasSistem;
  rekap.kas_fisik = kasFisik;
  rekap.selisih = selisih;
  rekap.catatan_buka = shiftTutup.catatan_buka || '';
  rekap.catatan_tutup = catatanTutup;
  rekap.ditutup_oleh_nama = namaPenutup;
  rekap.tipe_laporan = 'Z-REPORT';

  return {
    shift: shiftTutup,
    ringkasan: rekap,
    pesan: 'Shift ' + shiftTutup.no_shift + ' berhasil ditutup. ' +
      (selisih === 0 ? 'Kas fisik PAS dengan sistem!' : (selisih > 0 ? 'Selisih kas LEBIH +' + formatRupiah_(selisih) : 'Selisih kas KURANG -' + formatRupiah_(Math.abs(selisih))))
  };
}

/** shift.list — Daftar riwayat shift kasir (untuk audit Owner/Admin di Laporan & riwayat kasir). */
function aksiShiftList_(ctx) {
  const p = ctx.payload || {};
  const user = ctx.user;
  const isOwnerOrAdmin = user.role === ROLE.OWNER || user.role === ROLE.ADMIN;
  const dari = String(p.dari || '').trim().substring(0, 10);
  const sampai = String(p.sampai || '').trim().substring(0, 10);
  const statusFilter = String(p.status || '').trim().toLowerCase();
  const kasirFilter = isOwnerOrAdmin ? String(p.kasir_id || '').trim() : user.id;

  const semua = bacaSemua_('Shift_Kasir').filter(function (s) {
    if (s.deleted) return false;
    if (kasirFilter && s.kasir_id !== kasirFilter) return false;
    if (statusFilter && statusFilter !== 'semua' && String(s.status || '').toLowerCase() !== statusFilter) return false;
    const tglBuka = String(s.waktu_buka || s.created_at || '').substring(0, 10);
    if (dari && tglBuka && tglBuka < dari) return false;
    if (sampai && tglBuka && tglBuka > sampai) return false;
    return true;
  });

  // Urutkan terbaru di atas
  semua.sort(function (a, b) {
    return String(b.waktu_buka || b.created_at || '').localeCompare(String(a.waktu_buka || a.created_at || ''));
  });

  // Enrich shift aktif dengan hitungan live agar Owner/Admin langsung melihat posisi kas saat ini
  const waktuSkrg = sekarang_();
  let totalOmset = 0;
  let totalKasSistem = 0;
  let totalKasFisik = 0;
  let totalSelisih = 0;
  let shiftAktifCount = 0;
  let shiftDitutupCount = 0;
  let jumlahPas = 0;
  let jumlahLebih = 0;
  let jumlahKurang = 0;

  const enriched = semua.map(function (s) {
    const item = Object.assign({}, s);
    if (item.status === 'aktif') {
      shiftAktifCount++;
      const live = hitungRekapShiftKasir_(item.kasir_id, {
        shiftId: item.id,
        waktuMulai: item.waktu_buka,
        waktuSelesai: waktuSkrg,
        targetTgl: String(item.waktu_buka || '').substring(0, 10),
        modalAwal: Number(item.modal_awal || 0),
        fallbackUser: { id: item.kasir_id, nama: item.kasir_nama }
      });
      item.total_transaksi = live.total_transaksi;
      item.total_penjualan = live.total_penjualan;
      item.total_tunai = live.total_tunai;
      item.total_transfer = live.total_transfer;
      item.total_tempo = live.total_tempo;
      item.total_deposit_pakai = live.total_deposit_pakai;
      item.total_diskon = live.total_diskon;
      item.total_piutang_tunai = live.total_piutang_tunai;
      item.total_deposit_tunai = live.total_deposit_tunai;
      item.total_tarik_deposit_tunai = live.total_tarik_deposit_tunai;
      item.total_refund_tunai = live.total_refund_tunai;
      item.total_biaya_kasir = live.total_biaya_kasir;
      item.rincian_biaya_kasir = live.rincian_biaya_kasir;
      item.kas_sistem = live.total_laci;
      item.total_laci = live.total_laci;
      totalOmset += Number(live.total_penjualan || 0);
      totalKasSistem += Number(live.total_laci || 0);
    } else {
      shiftDitutupCount++;
      item.total_laci = Number(item.kas_sistem || 0);
      const sel = Number(item.selisih || 0);
      totalOmset += Number(item.total_penjualan || 0);
      totalKasSistem += Number(item.kas_sistem || 0);
      totalKasFisik += Number(item.kas_fisik || 0);
      totalSelisih += sel;
      if (sel === 0) jumlahPas++;
      else if (sel > 0) jumlahLebih++;
      else jumlahKurang++;
    }
    return item;
  });

  const hasilPag = paginasi_(enriched, p, ['no_shift', 'kasir_nama', 'catatan_buka', 'catatan_tutup']);
  hasilPag.ringkasan = {
    total_shift: enriched.length,
    shift_aktif: shiftAktifCount,
    shift_ditutup: shiftDitutupCount,
    total_omset: totalOmset,
    total_kas_sistem: totalKasSistem,
    total_kas_fisik: totalKasFisik,
    total_selisih: totalSelisih,
    jumlah_pas: jumlahPas,
    jumlah_lebih: jumlahLebih,
    jumlah_kurang: jumlahKurang
  };
  return hasilPag;
}

/**
 * pengiriman.list — Daftar antrean pengiriman toko & barang titipan/ambil bertahap (Bon Barang).
 */
function aksiPengirimanList_(ctx) {
  const p = ctx.payload || {};
  const dari = String(p.dari || '').trim().substring(0, 10);
  const sampai = String(p.sampai || '').trim().substring(0, 10);
  const statusFilter = String(p.status_antar || p.status || '').trim().toLowerCase();

  const pelPeta = {};
  bacaSemua_('Pelanggan').forEach(function (pl) { pelPeta[pl.id] = pl; });
  const userPeta = {};
  bacaSemua_('Users').forEach(function (u) { userPeta[u.id] = u.nama || u.username; });

  const itemsByPj = {};
  bacaSemua_('Penjualan_Item').forEach(function (it) {
    if (it.deleted) return;
    if (!itemsByPj[it.penjualan_id]) itemsByPj[it.penjualan_id] = [];
    itemsByPj[it.penjualan_id].push(it);
  });

  const semua = bacaSemua_('Penjualan').filter(function (pj) {
    if (pj.deleted || pj.status === 'void' || pj.status === 'pending') return false;
    const adalahKirim = pj.pengiriman === 'dikirim';
    const belumSelesai = pj.status_antar && pj.status_antar !== 'selesai';
    if (!adalahKirim && !belumSelesai) return false;
    const tgl = String(pj.tanggal || pj.created_at || '').substring(0, 10);
    if (dari && tgl && tgl < dari) return false;
    if (sampai && tgl && tgl > sampai) return false;
    return true;
  });

  semua.sort(function (a, b) {
    return String(b.tanggal || b.created_at || '').localeCompare(String(a.tanggal || a.created_at || ''));
  });

  let cntBelum = 0;
  let cntDiantar = 0;
  let cntSebagian = 0;
  let cntSelesai = 0;

  const lengkap = semua.map(function (pj) {
    const st = String(pj.status_antar || 'belum_dikirim').toLowerCase();
    if (st === 'belum_dikirim') cntBelum++;
    else if (st === 'diantar') cntDiantar++;
    else if (st === 'sebagian') cntSebagian++;
    else if (st === 'selesai') cntSelesai++;

    const pel = pj.pelanggan_id ? pelPeta[pj.pelanggan_id] : null;
    const daftarItem = (itemsByPj[pj.id] || []).map(function (it) {
      const qty = bulatQty_(Number(it.qty || 0));
      const dibawa = bulatQty_(Number(it.qty_dibawa !== undefined ? it.qty_dibawa : qty));
      const sisa = bulatQty_(Math.max(0, qty - dibawa));
      return {
        id: it.id,
        produk_id: it.produk_id,
        varian_id: it.varian_id || '',
        nama: it.nama,
        satuan: it.satuan,
        qty: qty,
        qty_dibawa: dibawa,
        sisa_kirim: sisa
      };
    });

    let totalQtyPesan = 0;
    let totalQtySisa = 0;
    daftarItem.forEach(function (it) {
      totalQtyPesan += it.qty;
      totalQtySisa += it.sisa_kirim;
    });

    return {
      id: pj.id,
      no_nota: pj.no_nota,
      tanggal: pj.tanggal,
      pengiriman: pj.pengiriman,
      alamat_kirim: pj.alamat_kirim || (pel ? pel.alamat : '') || '',
      status_antar: st,
      ongkir: Number(pj.ongkir || 0),
      total: Number(pj.total || 0),
      status_bayar: pj.status_bayar || 'lunas',
      catatan: pj.catatan || '',
      pelanggan_id: pj.pelanggan_id || '',
      pelanggan_nama: pel ? pel.nama : 'Pelanggan Umum',
      pelanggan_hp: pel ? (pel.hp || '') : '',
      kasir_nama: userPeta[pj.kasir_id] || 'Kasir',
      jumlah_item: daftarItem.length,
      total_qty_pesan: bulatQty_(totalQtyPesan),
      total_qty_sisa: bulatQty_(totalQtySisa),
      items: daftarItem
    };
  });

  const tersaring = statusFilter && statusFilter !== 'semua'
    ? lengkap.filter(function (x) { return x.status_antar === statusFilter; })
    : lengkap;

  const hasilPag = paginasi_(tersaring, p, ['no_nota', 'pelanggan_nama', 'alamat_kirim', 'catatan']);
  hasilPag.ringkasan = {
    total_antrean: lengkap.length,
    belum_dikirim: cntBelum,
    diantar: cntDiantar,
    sebagian: cntSebagian,
    selesai: cntSelesai
  };
  return hasilPag;
}

/**
 * pengiriman.updateStatus — Perbarui status pengiriman (Menunggu -> Diantar -> Sebagian -> Selesai)
 * serta mendukung pencatatan pengiriman/pengambilan bertahap per item (qty_dibawa).
 */
function aksiPengirimanUpdateStatus_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Penjualan', { wajib: true });
  const statusBaru = String(p.status_antar || '').trim().toLowerCase();
  if (['belum_dikirim', 'diantar', 'sebagian', 'selesai'].indexOf(statusBaru) === -1) {
    gagal_(KODE.VALIDATION, 'Status pengiriman tidak valid.');
  }
  const sopir = V_.teks(p.sopir || '', 'Nama sopir/pengirim', { maks: 100 });
  const catatanKirim = V_.teks(p.catatan_kirim || '', 'Catatan pengiriman', { maks: 250 });

  const pj = cariById_('Penjualan', id);
  if (!pj || pj.deleted) gagal_(KODE.NOT_FOUND, 'Transaksi penjualan tidak ditemukan.');
  if (pj.status === 'void') gagal_(KODE.CONFLICT, 'Transaksi sudah dibatalkan (void) dan tidak dapat dikirim.');

  const semuaItem = bacaSemua_('Penjualan_Item').filter(function (it) {
    return !it.deleted && it.penjualan_id === pj.id;
  });

  const perubahanItem = [];
  const itemPeta = {};
  semuaItem.forEach(function (it) { itemPeta[it.id] = it; });

  if (statusBaru === 'selesai') {
    // Jika ditandai Selesai, pastikan seluruh item tercatat qty_dibawa = qty penuh
    semuaItem.forEach(function (it) {
      if (bulatQty_(Number(it.qty_dibawa || 0)) < bulatQty_(Number(it.qty || 0))) {
        perubahanItem.push({ id: it.id, data: { qty_dibawa: bulatQty_(Number(it.qty || 0)) } });
      }
    });
  } else if (Array.isArray(p.items_kirim) && p.items_kirim.length > 0) {
    p.items_kirim.forEach(function (ik) {
      const target = itemPeta[ik.item_id || ik.id];
      if (!target) return;
      const qtyMaks = bulatQty_(Number(target.qty || 0));
      let qtyBaru;
      if (ik.qty_dibawa !== undefined && ik.qty_dibawa !== null) {
        qtyBaru = bulatQty_(V_.nonNegatif(ik.qty_dibawa, 'Qty dikirim ' + target.nama));
      } else if (ik.qty_kirim_tambah !== undefined && ik.qty_kirim_tambah !== null) {
        const tambah = bulatQty_(V_.nonNegatif(ik.qty_kirim_tambah, 'Qty kirim tambahan ' + target.nama));
        qtyBaru = bulatQty_(Number(target.qty_dibawa || 0) + tambah);
      } else {
        return;
      }
      if (qtyBaru > qtyMaks) {
        gagal_(KODE.VALIDATION, 'Total qty dikirim untuk "' + target.nama + '" (' + qtyBaru + ') melebihi qty pesanan (' + qtyMaks + ').');
      }
      if (qtyBaru !== bulatQty_(Number(target.qty_dibawa || 0))) {
        perubahanItem.push({ id: target.id, data: { qty_dibawa: qtyBaru } });
        target.qty_dibawa = qtyBaru;
      }
    });
  }

  if (perubahanItem.length > 0) {
    ubahBaris_('Penjualan_Item', perubahanItem, ctx.user.id);
  }

  // Evaluasi status akhir bila semua item sudah tercapai saat input parsial
  let statusFinal = statusBaru;
  if (statusBaru === 'sebagian' && semuaItem.length > 0) {
    const semuaTerkirim = semuaItem.every(function (it) {
      return bulatQty_(Number(it.qty_dibawa || 0)) >= bulatQty_(Number(it.qty || 0));
    });
    if (semuaTerkirim) statusFinal = 'selesai';
  }

  const dataUpdatePj = { status_antar: statusFinal };
  if (sopir || catatanKirim) {
    const infoBaru = '[' + sekarang_().substring(0, 16) + '] ' +
      (sopir ? 'Sopir: ' + sopir + (catatanKirim ? ' - ' : '') : '') +
      (catatanKirim || '');
    const catLama = String(pj.catatan || '').trim();
    dataUpdatePj.catatan = (catLama ? catLama + ' | ' + infoBaru : infoBaru).substring(0, 500);
  }

  const pjBaru = ubahBaris_('Penjualan', [{ id: pj.id, data: dataUpdatePj }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'pengiriman_update', 'PENGIRIMAN', pj.no_nota, {
    status_lama: pj.status_antar,
    status_baru: statusFinal,
    sopir: sopir,
    catatan_kirim: catatanKirim
  });

  const labelStatus = {
    belum_dikirim: 'Menunggu Kirim',
    diantar: 'Sedang Diantar',
    sebagian: 'Dikirim Sebagian',
    selesai: 'Selesai Diterima'
  };

  return {
    penjualan: pjBaru,
    items: semuaItem,
    pesan: 'Status pengiriman ' + pj.no_nota + ' diperbarui menjadi "' + (labelStatus[statusFinal] || statusFinal) + '".'
  };
}

/**
 * penawaran.create — Buat Penawaran Harga / Estimasi RAB (tanpa memotong stok & tanpa masuk omset).
 */
function aksiPenawaranCreate_(ctx) {
  const p = ctx.payload || {};
  const rawItems = p.items;
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    gagal_(KODE.VALIDATION, 'Daftar barang penawaran tidak boleh kosong.');
  }

  const user = ctx.user;
  const pel = p.pelanggan_id ? cariById_('Pelanggan', String(p.pelanggan_id).trim()) : null;
  const pelNama = V_.teks(p.pelanggan_nama || (pel ? pel.nama : 'Pelanggan Umum'), 'Nama pelanggan/penerima', { maks: 120 });
  const pelHp = V_.teks(p.pelanggan_hp || (pel ? pel.hp : ''), 'HP pelanggan', { maks: 30 });
  const alamatKirim = V_.teks(p.alamat_kirim || (pel ? pel.alamat : ''), 'Alamat proyek/kirim', { maks: 300 });
  const judulProyek = V_.teks(p.judul_proyek || '', 'Judul proyek / RAB', { maks: 150 });
  const catatan = V_.teks(p.catatan || '', 'Catatan penawaran', { maks: 400 });
  const berlakuHari = Math.min(90, Math.max(1, Math.round(Number(p.berlaku_hari) || 7)));

  let subtotalKotor = 0;
  let totalDiskonItem = 0;
  const itemsBersih = rawItems.map(function (it) {
    const qty = bulatQty_(V_.angka(it.qty, 'Qty ' + (it.nama || 'item'), { min: 0.001 }));
    const harga = Math.round(V_.nonNegatif(it.harga, 'Harga ' + (it.nama || 'item')));
    const diskonItem = Math.round(Math.max(0, Number(it.diskon || 0)));
    const subKotor = hitungSubtotal_(qty, harga);
    const subNet = Math.max(0, subKotor - diskonItem);
    subtotalKotor += subKotor;
    totalDiskonItem += diskonItem;
    return {
      produk_id: String(it.produk_id || ''),
      varian_id: String(it.varian_id || ''),
      nama: String(it.nama || 'Barang'),
      satuan: String(it.satuan || 'Pcs'),
      faktor: Number(it.faktor) || 1,
      qty: qty,
      qty_dibawa: qty,
      tipe_harga: String(it.tipe_harga || 'ritel'),
      harga_asli: Math.round(Number(it.harga_asli || harga)),
      harga: harga,
      hpp: Math.round(Number(it.hpp || 0)),
      diskon_tipe: String(it.diskon_tipe || ''),
      diskon_nilai: Number(it.diskon_nilai || 0),
      diskon: diskonItem,
      subtotal: subNet
    };
  });

  const diskonTipe = String(p.diskon_tipe || '').trim();
  const diskonNilai = Math.max(0, Number(p.diskon_nilai || 0));
  let diskonTrans = 0;
  const subSetelahItem = Math.max(0, subtotalKotor - totalDiskonItem);
  if (diskonTipe === 'persen') {
    diskonTrans = Math.round(subSetelahItem * Math.min(100, diskonNilai) / 100);
  } else if (diskonTipe === 'nominal') {
    diskonTrans = Math.min(subSetelahItem, Math.round(diskonNilai));
  } else if (p.diskon !== undefined) {
    diskonTrans = Math.min(subSetelahItem, Math.max(0, Math.round(Number(p.diskon) || 0)));
  }

  const pengiriman = p.pengiriman === 'dikirim' ? 'dikirim' : 'ambil';
  const ongkir = pengiriman === 'dikirim' ? Math.max(0, Math.round(Number(p.ongkir || 0))) : 0;
  const totalDiskon = totalDiskonItem + diskonTrans;
  const grandTotal = Math.max(0, subtotalKotor - totalDiskon) + ongkir;

  const noPenawaran = nomorBerikut_('RAB');
  const nowDt = new Date();
  const tglSkrg = formatWaktu_(nowDt);
  const tglBerlaku = formatWaktu_(new Date(nowDt.getTime() + berlakuHari * 86400000)).substring(0, 10) + ' 23:59:59';

  const baru = tambahBaris_('Penawaran', [{
    no_penawaran: noPenawaran,
    tanggal: tglSkrg,
    berlaku_sampai: tglBerlaku,
    kasir_id: user.id,
    kasir_nama: user.nama || user.username || 'Kasir',
    pelanggan_id: pel ? pel.id : '',
    pelanggan_nama: pelNama,
    pelanggan_hp: pelHp,
    alamat_kirim: alamatKirim,
    judul_proyek: judulProyek,
    subtotal: subtotalKotor,
    diskon_tipe: diskonTipe,
    diskon_nilai: diskonNilai,
    diskon: totalDiskon,
    ongkir: ongkir,
    total: grandTotal,
    pengiriman: pengiriman,
    catatan: catatan,
    items_json: itemsBersih,
    status: 'aktif',
    penjualan_id: '',
    no_nota_konversi: ''
  }], user.id)[0];

  catatAudit_(user.id, 'penawaran_create', 'PENAWARAN', noPenawaran, {
    pelanggan_nama: pelNama,
    judul_proyek: judulProyek,
    total: grandTotal,
    item_count: itemsBersih.length
  });

  const hasil = Object.assign({}, baru);
  hasil.items = itemsBersih;
  return {
    penawaran: hasil,
    pesan: 'Penawaran Harga ' + noPenawaran + ' berhasil disimpan.'
  };
}

/** penawaran.list — Daftar Penawaran Harga / RAB. */
function aksiPenawaranList_(ctx) {
  const p = ctx.payload || {};
  const statusFilter = String(p.status || '').trim().toLowerCase();
  const tglSkrg = sekarang_();

  const semua = bacaSemua_('Penawaran').filter(function (q) {
    if (q.deleted) return false;
    if (statusFilter && statusFilter !== 'semua' && String(q.status || '').toLowerCase() !== statusFilter) return false;
    return true;
  }).map(function (q) {
    const copy = Object.assign({}, q);
    copy.items = Array.isArray(q.items_json) ? q.items_json : [];
    copy.item_count = copy.items.length;
    copy.kedaluwarsa = copy.status === 'aktif' && copy.berlaku_sampai && String(copy.berlaku_sampai) < tglSkrg;
    return copy;
  });

  semua.sort(function (a, b) {
    return String(b.tanggal || b.created_at || '').localeCompare(String(a.tanggal || a.created_at || ''));
  });

  return paginasi_(semua, p, ['no_penawaran', 'pelanggan_nama', 'judul_proyek', 'catatan']);
}

/** penawaran.konversi — Tandai Penawaran Harga sudah dikonversi menjadi Nota Penjualan resmi. */
function aksiPenawaranKonversi_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Penawaran', { wajib: true });
  const penjualanId = V_.teks(p.penjualan_id || '', 'ID Penjualan', { maks: 80 });
  const noNota = V_.teks(p.no_nota || '', 'Nomor Nota', { maks: 80 });

  const rab = cariById_('Penawaran', id);
  if (!rab || rab.deleted) gagal_(KODE.NOT_FOUND, 'Penawaran tidak ditemukan.');

  const baru = ubahBaris_('Penawaran', [{
    id: rab.id,
    data: {
      status: 'dikonversi',
      penjualan_id: penjualanId,
      no_nota_konversi: noNota
    }
  }], ctx.user.id)[0];

  return { penawaran: baru, pesan: 'Penawaran ' + rab.no_penawaran + ' ditandai sudah menjadi nota ' + noNota + '.' };
}

/** penawaran.delete — Hapus (soft delete) Penawaran Harga / RAB. */
function aksiPenawaranDelete_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Penawaran', { wajib: true });
  const rab = cariById_('Penawaran', id);
  if (!rab || rab.deleted) gagal_(KODE.NOT_FOUND, 'Penawaran tidak ditemukan.');
  hapusLunak_('Penawaran', rab.id, ctx.user.id);
  catatAudit_(ctx.user.id, 'penawaran_delete', 'PENAWARAN', rab.no_penawaran, {});
  return { id: rab.id, pesan: 'Penawaran ' + rab.no_penawaran + ' berhasil dihapus.' };
}

/**
 * penjualan.void — Batalkan transaksi final (Owner & Admin).
 * Aturan Bisnis #13:
 * - Admin hanya transaksi hari ini; Owner kapan saja.
 * - Tolak bila sudah memiliki retur atau pembayaran cicilan piutang.
 * - Membalikkan stok (+ Kartu_Stok tipe 'void'), poin, total belanja, dan piutang.
 */
function aksiPenjualanVoid_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Penjualan', { wajib: true });
  const alasan = V_.teks(p.alasan, 'Alasan pembatalan (void)', { wajib: true, maks: 200 });

  const penjualan = cariById_('Penjualan', id);
  if (!penjualan) gagal_(KODE.NOT_FOUND, 'Transaksi penjualan tidak ditemukan.');
  if (penjualan.status === 'void') gagal_(KODE.CONFLICT, 'Transaksi ini sudah dibatalkan sebelumnya.');
  if (penjualan.status !== 'final') gagal_(KODE.VALIDATION, 'Hanya transaksi berstatus final yang bisa dibatalkan.');

  // Validasi batasan waktu pembatalan berdasarkan role (README Aturan 13)
  const isOwner = ctx.user.role === ROLE.OWNER;
  if (!isOwner) {
    const tglTransaksi = String(penjualan.tanggal || '').slice(0, 10);
    const tglHariIni = sekarang_().slice(0, 10);
    if (tglTransaksi !== tglHariIni) {
      gagal_(KODE.FORBIDDEN, 'Admin hanya dapat membatalkan transaksi pada hari yang sama. Hubungi Owner untuk pembatalan transaksi tanggal lampau.');
    }
  }

  // Cek apakah sudah ada retur terkait transaksi ini
  const semuaRetur = bacaSemua_('Retur');
  const adaRetur = semuaRetur.some(function (r) {
    return r.ref_id === penjualan.id && !r.deleted && r.status !== 'ditolak';
  });
  if (adaRetur) {
    gagal_(KODE.CONFLICT, 'Transaksi ini tidak dapat dibatalkan (void) karena sudah memiliki riwayat retur barang. Gunakan modul retur.');
  }

  // Cek apakah ada pembayaran piutang berjalan yang sudah dicicil
  const piutangTerkait = bacaSemua_('Piutang').filter(function (pt) {
    return pt.penjualan_id === penjualan.id && !pt.deleted;
  })[0];

  if (piutangTerkait && Number(piutangTerkait.terbayar || 0) > 0) {
    gagal_(KODE.CONFLICT, 'Transaksi ini tidak dapat dibatalkan (void) karena piutang sudah memiliki riwayat pembayaran cicilan (' + formatRupiah_(piutangTerkait.terbayar) + ').');
  }

  cekPeriodeTerkunci_(penjualan.tanggal || sekarang_());

  // 1. Kembalikan Stok & Catat Kartu_Stok Tipe 'void'
  const items = bacaSemua_('Penjualan_Item').filter(function (it) {
    return it.penjualan_id === penjualan.id && !it.deleted;
  });

  const semuaProduk = bacaSemua_('Produk');
  const produkPeta = {};
  semuaProduk.forEach(function (pr) { produkPeta[pr.id] = pr; });

  const semuaVarian = bacaSemua_('Varian');
  const varianPeta = {};
  semuaVarian.forEach(function (v) { varianPeta[v.id] = v; });

  items.forEach(function (it) {
    let saldoAkhir = 0;
    if (it.varian_id) {
      const v = varianPeta[it.varian_id];
      if (v) {
        const stokBaru = bulatQty_(Number(v.stok || 0) + Number(it.qty_dasar || 0));
        ubahBaris_('Varian', [{ id: v.id, data: { stok: stokBaru } }], ctx.user.id);
        v.stok = stokBaru;

        // Update total produk induk
        const varianLain = semuaVarian.filter(function (vl) { return vl.produk_id === v.produk_id && !vl.deleted; });
        let totalStokInduk = 0;
        varianLain.forEach(function (vl) { totalStokInduk += (vl.id === v.id ? stokBaru : Number(vl.stok || 0)); });
        ubahBaris_('Produk', [{ id: v.produk_id, data: { stok: bulatQty_(totalStokInduk) } }], ctx.user.id);
        saldoAkhir = stokBaru;
      }
    } else {
      const pr = produkPeta[it.produk_id];
      if (pr) {
        const stokBaru = bulatQty_(Number(pr.stok || 0) + Number(it.qty_dasar || 0));
        ubahBaris_('Produk', [{ id: pr.id, data: { stok: stokBaru } }], ctx.user.id);
        pr.stok = stokBaru;
        saldoAkhir = stokBaru;
      }
    }

    tambahBaris_('Kartu_Stok', [{
      produk_id: it.produk_id,
      varian_id: it.varian_id || '',
      tipe: 'void',
      qty: it.qty_dasar,
      saldo: saldoAkhir,
      hpp: it.hpp,
      ref_id: penjualan.no_nota,
      user_id: ctx.user.id,
      keterangan: 'Void penjualan ' + penjualan.no_nota + ': ' + alasan
    }], ctx.user.id);
  });

  // 2. Batalkan Poin, Kurangi Total Belanja Member & Kembalikan Saldo Titipan (Deposit) jika dipakai pada nota ini
  if (penjualan.pelanggan_id) {
    const pel = cariById_('Pelanggan', penjualan.pelanggan_id);
    if (pel) {
      const dataBalikPel = {};

      // Cek apakah nota ini dibayar menggunakan saldo deposit
      let totalDepositKembali = 0;
      bacaSemua_('Penjualan_Bayar').forEach(function (byr) {
        if (!byr.deleted && byr.penjualan_id === penjualan.id && String(byr.metode || '').toLowerCase() === 'deposit') {
          totalDepositKembali += (Number(byr.jumlah) || 0);
        }
      });

      let saldoDepositBaru = Number(pel.saldo_deposit || 0);
      if (totalDepositKembali > 0) {
        saldoDepositBaru += totalDepositKembali;
        dataBalikPel.saldo_deposit = saldoDepositBaru;
      }

      let poinKembali = 0;
      let poinBaru = Number(pel.poin || 0);
      if (String(pel.tipe || '').toLowerCase() === 'member') {
        poinKembali = Number(penjualan.poin_didapat || 0);
        const poinLama = Number(pel.poin || 0);
        poinBaru = Math.max(0, poinLama - poinKembali);
        const belanjaLama = Number(pel.total_belanja || 0);
        const ongkirNota = Math.max(0, Number(penjualan.ongkir || 0));
        const totalBarangNota = Math.max(0, Number(penjualan.total || 0) - ongkirNota);
        const porsiTempoAwal = piutangTerkait ? Number(piutangTerkait.total || 0) : 0;
        const porsiLunasAwal = piutangTerkait
          ? Math.max(0, Number(penjualan.total || 0) - porsiTempoAwal)
          : (String(penjualan.status_bayar || '') === 'belum_lunas' ? 0 : Number(penjualan.total || 0));
        const porsiSudahMasukBelanja = Math.min(totalBarangNota, porsiLunasAwal);
        const belanjaBaru = Math.max(0, belanjaLama - porsiSudahMasukBelanja);

        if (poinKembali > 0 || porsiSudahMasukBelanja > 0) {
          dataBalikPel.poin = poinBaru;
          dataBalikPel.total_belanja = belanjaBaru;
        }
      }

      if (Object.keys(dataBalikPel).length > 0) {
        ubahBaris_('Pelanggan', [{
          id: pel.id,
          data: dataBalikPel
        }], ctx.user.id);
      }

      if (poinKembali > 0) {
        tambahBaris_('Poin_Log', [{
          pelanggan_id: pel.id,
          jumlah: -poinKembali,
          jenis: 'void',
          ref_id: penjualan.no_nota,
          saldo: poinBaru
        }], ctx.user.id);
      }

      if (totalDepositKembali > 0) {
        tambahBaris_('Deposit_Log', [{
          no_bukti: nomorBerikut_('DEP'),
          pelanggan_id: pel.id,
          jenis: 'void',
          metode: 'deposit',
          jumlah: totalDepositKembali,
          saldo: saldoDepositBaru,
          ref_id: penjualan.no_nota,
          catatan: 'Pengembalian saldo titipan dari void ' + penjualan.no_nota
        }], ctx.user.id);
      }
    }
  }

  // 3. Batalkan Piutang (Jika ada)
  if (piutangTerkait) {
    hapusLunak_('Piutang', piutangTerkait.id, ctx.user.id);
  }

  // 4. Ubah Status Penjualan menjadi Void
  const waktuVoid = sekarang_();
  ubahBaris_('Penjualan', [{
    id: penjualan.id,
    data: {
      status: 'void',
      void_alasan: alasan,
      void_oleh: ctx.user.id,
      void_at: waktuVoid
    }
  }], ctx.user.id);

  // 5. Catat Audit Log
  catatAudit_(ctx.user.id, 'penjualan_void', 'PENJUALAN', penjualan.no_nota, {
    alasan: alasan,
    total: penjualan.total,
    void_oleh: ctx.user.username
  });

  // Hapus cache katalog produk
  cacheHapus_('produk');

  return {
    pesan: 'Transaksi ' + penjualan.no_nota + ' berhasil dibatalkan (void).',
    no_nota: penjualan.no_nota
  };
}

/** Helper pemformat Rupiah internal backend untuk pesan error. */
function formatRupiah_(angka) {
  return 'Rp ' + Math.round(Number(angka) || 0).toLocaleString('id-ID');
}

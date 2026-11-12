# 🗄️ Dokumentasi Struktur Database Spreadsheet

Database POS Kasir Toko Bangunan menggunakan **Google Spreadsheet** dengan arsitektur 1 sheet per entitas. Seluruh definisi teknis skema terpusat di konstanta `SKEMA` pada `backend/kode.gs`.

> **Versi Skema:** 1 · **Jumlah Sheet:** 26 · **Zona Waktu:** `Asia/Jakarta` (WIB)

---

## 1. Aturan Kolom Baku (Semua Sheet)

Setiap sheet memiliki format kolom yang seragam:
1. **Kolom Pertama:** `id` (UUID v4 via `Utilities.getUuid()`).
2. **Kolom Khusus Entitas:** Sesuai definisi tabel di bawah.
3. **Kolom Terakhir (Audit):**
   - `created_at` (teks: `yyyy-MM-dd HH:mm:ss`)
   - `updated_at` (teks: `yyyy-MM-dd HH:mm:ss`)
   - `created_by` (ID pengguna atau `sistem`)
   - `deleted` (boolean: `TRUE` / `FALSE`) — **Soft Delete**

> **PENTING (Format Teks):** Seluruh kolom tipe teks diformat `@` (Plain Text) oleh `setupDatabase()` agar data seperti SKU, Barcode, atau Nomor HP yang berawalan angka `0` (misal `08123456789`) atau `0089...` tidak terpotong menjadi angka desimal oleh Spreadsheet.
> **Sanitasi Formula:** Nilai teks berawalan `=`, `+`, `-`, atau `@` otomatis diberi awalan tanda kutip tunggal (`'`) saat ditulis untuk mencegah *Spreadsheet Formula Injection*.

---

## 2. Rincian 26 Sheet & Tipe Kolom

Keterangan tipe data:
- `s` = Teks (String)
- `n` = Angka (Number / Integer Rupiah / Desimal Qty)
- `b` = Boolean (`TRUE`/`FALSE`)
- `d` = Tanggal / Waktu (`yyyy-MM-dd HH:mm:ss`)
- `j` = Objek JSON (Teks terenkode)

---

### 1. `Users`
Data akun pengguna (multiuser).
- `username` (s): Username unik untuk login
- `nama` (s): Nama lengkap petugas/pemilik
- `role` (s): `owner` | `admin` | `kasir`
- `pin_hash` (s): Hash SHA-256 dari `salt + ":" + PIN`
- `salt` (s): String acak 32 heksadesimal per pengguna
- `aktif` (b): Status aktif akun
- `wajib_ganti_pin` (b): TRUE jika user baru / setelah reset PIN
- `gagal_login` (n): Jumlah percobaan login salah berurutan
- `kunci_sampai` (d): Waktu berakhirnya kunci akun jika gagal 5x
- `last_login` (d): Waktu login terakhir

### 2. `Sesi`
Sesi login aktif.
- `user_id` (s): Relasi ke `Users.id`
- `token_hash` (s): Hash SHA-256 dari token sesi
- `kedaluwarsa` (d): Waktu kedaluwarsa sesi (6 jam sejak aktif)
- `terakhir_aktif` (d): Waktu request terakhir
- `perangkat` (s): Keterangan User-Agent / perangkat

### 3. `Kategori`
Kategori dan sub-kategori produk bangunan.
- `nama` (s): Nama kategori (cth: "Bahan Bangunan", "Cat & Pelapis")
- `parent_id` (s): ID kategori induk (kosong jika kategori utama)
- `urutan` (n): Nomor urut tampilan

### 4. `Produk`
Master katalog barang.
- `sku` (s): Kode barang internal
- `barcode` (s): Barcode pabrik (EAN-13, dsb)
- `nama` (s): Nama barang
- `kategori_id` (s): Relasi ke `Kategori.id`
- `satuan_dasar` (s): Satuan terkecil (cth: "sak", "kg", "batang", "meter")
- `hpp` (n): Harga Pokok Penjualan bergerak per satuan dasar
- `harga_ritel` (n): Harga jual eceran
- `harga_grosir` (n): Harga jual grosir
- `min_grosir_qty` (n): Minimal kuantitas untuk harga grosir
- `stok` (n): Jumlah stok dalam satuan dasar
- `stok_min` (n): Batas peringatan stok menipis
- `punya_varian` (b): TRUE jika produk memiliki varian
- `foto_url` (s): URL foto produk
- `aktif` (b): Status aktif barang

### 5. `Varian`
Varian barang (warna, ukuran, tebal).
- `produk_id` (s): Relasi ke `Produk.id`
- `nama_varian` (s): Cth: "Putih", "Hitam", "Tebal 0.3mm"
- `sku` (s): SKU unik varian
- `barcode` (s): Barcode unik varian
- `hpp` (n): HPP khusus varian
- `harga_ritel` (n): Harga eceran varian
- `harga_grosir` (n): Harga grosir varian
- `stok` (n): Stok varian
- `stok_min` (n): Batas stok minimal varian
- `aktif` (b): Status aktif varian

### 6. `Satuan_Konversi`
Multi satuan jual/beli per produk.
- `produk_id` (s): Relasi ke `Produk.id`
- `satuan` (s): Satuan turunan (cth: "dus", "pak", "truk", "roll")
- `faktor` (n): Pengali ke satuan dasar (cth: 1 dus = 24 pcs -> faktor = 24)
- `barcode` (s): Barcode khusus kemasan satuan ini
- `harga_ritel` (n): Harga eceran per satuan ini
- `harga_grosir` (n): Harga grosir per satuan ini

### 7. `Pelanggan`
Data pelanggan toko dan member royalti.
- `kode` (s): Kode member (cth: "MBR-0001")
- `nama` (s): Nama pelanggan
- `hp` (s): Nomor kontak WhatsApp/telepon
- `alamat` (s): Alamat pengiriman
- `tipe` (s): `umum` | `member`
- `level` (s): `Reguler` | `Perak` | `Emas`
- `limit_kredit` (n): Batas piutang tempo maksimal (Rupiah)
- `tempo_hari` (n): Batas waktu jatuh tempo (hari, cth: 30)
- `poin` (n): Saldo poin aktif saat ini
- `total_belanja` (n): Akumulasi belanja bersih seumur hidup
- `aktif` (b): Status aktif

### 8. `Supplier`
Pemasok material & barang.
- `nama` (s): Nama toko / distributor pemasok
- `kontak` (s): Nama person in charge (sales/PIC)
- `hp` (s): Nomor kontak supplier
- `alamat` (s): Alamat kantor/gudang supplier
- `catatan` (s): Catatan pembayaran / rekening
- `aktif` (b): Status aktif

### 9. `Penjualan`
Header transaksi penjualan kasir.
- `no_nota` (s): Nomor nota `INV-YYYYMMDD-0001`
- `tanggal` (d): Waktu transaksi
- `kasir_id` (s): Relasi ke `Users.id`
- `pelanggan_id` (s): Relasi ke `Pelanggan.id` (kosong jika umum)
- `subtotal` (n): Total sebelum diskon transaksi & pajak
- `diskon_tipe` (s): `persen` | `nominal`
- `diskon_nilai` (n): Nilai input diskon (misal 10 atau 15000)
- `diskon` (n): Nominal potongan diskon transaksi (Rupiah)
- `pajak` (n): Nominal PPN jika aktif
- `pembulatan` (n): Pembulatan akhir ke kelipatan Rp100 (+/-)
- `total` (n): Total akhir yang wajib dibayar
- `bayar` (n): Total uang yang diserahkan/dibayar
- `kembalian` (n): Kembalian (jika ada tunai)
- `metode_bayar` (s): `tunai` | `transfer` | `qris` | `tempo` | `kombinasi`
- `status_bayar` (s): `lunas` | `sebagian` | `tempo`
- `pengiriman` (s): `ambil_sendiri` | `dikirim`
- `alamat_kirim` (s): Alamat tujuan antar
- `status_antar` (s): `selesai` | `sebagian` | `menunggu`
- `catatan` (s): Catatan transaksi
- `status` (s): `pending` | `final` | `void`
- `void_alasan` (s): Alasan pembatalan (wajib jika void)
- `void_oleh` (s): Relasi ke `Users.id` yang menyetujui void
- `void_at` (d): Waktu pembatalan
- `poin_didapat` (n): Jumlah poin yang didapat dari nota ini

### 10. `Penjualan_Item`
Item barang pada transaksi penjualan.
- `penjualan_id` (s): Relasi ke `Penjualan.id`
- `produk_id` (s): Relasi ke `Produk.id`
- `varian_id` (s): Relasi ke `Varian.id` (kosong jika tanpa varian)
- `nama` (s): Snapshot nama barang saat dijual
- `satuan` (s): Satuan yang dipilih (cth: "sak")
- `faktor` (n): Faktor konversi ke satuan dasar
- `qty` (n): Jumlah beli dalam satuan transaksi
- `qty_dasar` (n): `qty × faktor` (satuan dasar pengurang stok)
- `qty_dibawa` (n): Qty yang langsung dibawa pulang di kasir
- `tipe_harga` (s): `ritel` | `grosir` | `manual`
- `harga_asli` (n): Harga asli sebelum edit kasir
- `harga` (n): Harga jual final per satuan transaksi
- `hpp` (n): **Snapshot HPP per satuan transaksi saat dijual**
- `diskon_tipe` (s): `persen` | `nominal`
- `diskon_nilai` (n): Input diskon per item
- `diskon` (n): Nominal diskon per item (Rupiah)
- `subtotal` (n): Subtotal bersih per item

### 11. `Penjualan_Bayar`
Rincian metode pembayaran (terutama pembayaran kombinasi).
- `penjualan_id` (s): Relasi ke `Penjualan.id`
- `metode` (s): `tunai` | `transfer` | `qris` | `tempo`
- `jumlah` (n): Nominal dibayar
- `referensi` (s): Nomor referensi transfer / approval QRIS

### 12. `Pembelian`
Header faktur pembelian dari supplier.
- `no_faktur` (s): Nomor sistem `PB-YYYYMMDD-0001`
- `no_faktur_supplier` (s): Nomor faktur fisik dari supplier
- `tanggal` (d): Tanggal masuk barang
- `supplier_id` (s): Relasi ke `Supplier.id`
- `subtotal` (n): Subtotal pembelian
- `diskon` (n): Diskon faktur dari supplier
- `total` (n): Total tagihan pembelian
- `bayar` (n): Nominal dibayar (DP / lunas)
- `status_bayar` (s): `lunas` | `sebagian` | `hutang`
- `jatuh_tempo` (d): Tanggal jatuh tempo hutang
- `catatan` (s): Catatan pembelian
- `status` (s): `draft` | `selesai` | `batal`

### 13. `Pembelian_Item`
Item barang yang dibeli dari supplier.
- `pembelian_id` (s): Relasi ke `Pembelian.id`
- `produk_id` (s): Relasi ke `Produk.id`
- `varian_id` (s): Relasi ke `Varian.id`
- `nama` (s): Nama barang
- `satuan` (s): Satuan beli
- `faktor` (n): Faktor konversi ke satuan dasar
- `qty` (n): Jumlah beli
- `qty_dasar` (n): `qty × faktor`
- `harga_beli` (n): Harga beli per satuan beli
- `subtotal` (n): Subtotal item pembelian

### 14. `Piutang`
Catatan piutang pelanggan atas penjualan tempo.
- `penjualan_id` (s): Relasi ke `Penjualan.id`
- `pelanggan_id` (s): Relasi ke `Pelanggan.id`
- `total` (n): Total tagihan awal tempo
- `terbayar` (n): Akumulasi cicilan terbayar
- `sisa` (n): Sisa piutang yang belum dilunasi
- `jatuh_tempo` (d): Batas waktu jatuh tempo
- `status` (s): `belum` | `sebagian` | `lunas`

### 15. `Hutang`
Catatan hutang toko kepada supplier.
- `pembelian_id` (s): Relasi ke `Pembelian.id`
- `supplier_id` (s): Relasi ke `Supplier.id`
- `total` (n): Total hutang awal
- `terbayar` (n): Akumulasi pembayaran
- `sisa` (n): Sisa hutang berjalan
- `jatuh_tempo` (d): Tanggal jatuh tempo
- `status` (s): `belum` | `sebagian` | `lunas`

### 16. `Pembayaran`
Riwayat cicilan atau pelunasan hutang/piutang.
- `tipe` (s): `piutang` | `hutang`
- `ref_id` (s): Relasi ke `Piutang.id` atau `Hutang.id`
- `jumlah` (n): Nominal cicilan dibayar
- `metode` (s): `tunai` | `transfer` | `qris`
- `tanggal` (d): Waktu pembayaran
- `catatan` (s): Keterangan / bank pengirim

### 17. `Poin_Log`
Audit mutasi poin pelanggan.
- `pelanggan_id` (s): Relasi ke `Pelanggan.id`
- `jumlah` (n): Perubahan poin (+/-)
- `jenis` (s): `dapat` | `tukar` | `retur` | `void` | `koreksi`
- `ref_id` (s): ID referensi transaksi terkait
- `saldo` (n): Saldo akhir poin setelah mutasi

### 18. `Hadiah`
Katalog hadiah penukaran poin membership.
- `nama` (s): Nama hadiah (cth: "Kaos Toko", "Kipas Angin", "Potongan Belanja")
- `deskripsi` (s): Keterangan hadiah
- `poin_dibutuhkan` (n): Jumlah poin yang harus ditukar
- `stok` (n): Ketersediaan stok fisik hadiah
- `aktif` (b): Status aktif di katalog

### 19. `Penukaran_Hadiah`
Riwayat klaim penukaran hadiah oleh member.
- `no_tukar` (s): Nomor bukti penukaran `TK-YYYYMMDD-0001`
- `pelanggan_id` (s): Relasi ke `Pelanggan.id`
- `hadiah_id` (s): Relasi ke `Hadiah.id`
- `qty` (n): Jumlah hadiah yang ditukar
- `poin` (n): Total poin yang dipotong
- `catatan` (s): Catatan serah terima

### 20. `Kartu_Stok`
Buku besar mutasi seluruh pergerakan barang (wajib tercatat).
- `produk_id` (s): Relasi ke `Produk.id`
- `varian_id` (s): Relasi ke `Varian.id`
- `tipe` (s): `jual` | `beli` | `retur_jual` | `retur_beli` | `opname` | `void` | `koreksi`
- `qty` (n): Perubahan kuantitas dalam satuan dasar (+/-)
- `saldo` (n): Saldo stok fisik setelah mutasi
- `hpp` (n): Nilai HPP pada saat mutasi terjadi
- `ref_id` (s): ID dokumen transaksi terkait
- `user_id` (s): Petugas yang memicu mutasi
- `keterangan` (s): Catatan penjelasan mutasi

### 21. `Opname`
Pemeriksaan fisik stok gudang vs sistem.
- `no_opname` (s): Nomor dokumen `OP-YYYYMMDD-0001`
- `tanggal` (d): Waktu opname
- `produk_id` (s): Relasi ke `Produk.id`
- `varian_id` (s): Relasi ke `Varian.id`
- `qty_sistem` (n): Stok tercatat di sistem sebelum opname
- `qty_fisik` (n): Stok riil hasil hitungan fisik kasir/gudang
- `selisih` (n): `qty_fisik - qty_sistem`
- `alasan` (s): Penyebab selisih (rusak, hilang, susut, dsb)
- `status` (s): `draft` | `disetujui` | `ditolak`
- `disetujui_oleh` (s): Relasi ke `Users.id` (Owner/Admin)
- `disetujui_at` (d): Waktu persetujuan penyesuaian stok

### 22. `Retur`
Header dokumen retur penjualan atau pembelian.
- `no_retur` (s): Nomor retur `RT-YYYYMMDD-0001`
- `tipe` (s): `jual` (pelanggan meretur) | `beli` (toko meretur ke supplier)
- `ref_id` (s): Relasi ke `Penjualan.id` atau `Pembelian.id` asal
- `pihak_id` (s): Relasi ke `Pelanggan.id` atau `Supplier.id`
- `tanggal` (d): Waktu retur
- `total` (n): Total nilai retur
- `metode_refund` (s): `kas` | `potong_piutang` | `potong_hutang`
- `alasan` (s): Alasan retur
- `status` (s): `diajukan` | `disetujui` | `ditolak`
- `disetujui_oleh` (s): Relasi ke `Users.id`
- `disetujui_at` (d): Waktu persetujuan

### 23. `Retur_Item`
Item barang yang diretur.
- `retur_id` (s): Relasi ke `Retur.id`
- `ref_item_id` (s): Relasi ke `Penjualan_Item.id` atau `Pembelian_Item.id`
- `produk_id` (s): Relasi ke `Produk.id`
- `varian_id` (s): Relasi ke `Varian.id`
- `nama` (s): Nama barang
- `satuan` (s): Satuan retur
- `faktor` (n): Faktor konversi ke satuan dasar
- `qty` (n): Jumlah barang diretur
- `qty_dasar` (n): `qty × faktor`
- `harga` (n): Harga satuan retur
- `hpp` (n): Snapshot HPP asal
- `subtotal` (n): Subtotal nominal retur

### 24. `Pengaturan`
Konfigurasi operasional toko (key-value JSON).
- `key` (s): Kunci pengaturan (cth: `toko_nama`, `poin_per_rupiah`)
- `value` (j): Nilai pengaturan tersimpan dalam format teks JSON

### 25. `Log_Audit`
Pencatatan jejak audit aksi sensitif sistem.
- `user_id` (s): Pengguna yang melakukan aksi
- `aksi` (s): Nama tindakan (misal: `void_penjualan`, `ganti_harga`, `reset_pin`)
- `modul` (s): Modul sistem (cth: `POS`, `PRODUK`, `USER`)
- `ref_id` (s): ID entitas terkait
- `detail_json` (j): Payload detail perubahan sebelum/sesudah

### 26. `Counter`
Penghitung sekuensial nomor urut harian untuk mencegah nomor nota ganda/loncat.
- `key` (s): Kunci counter (cth: `INV-20261112`, `PB-20261112`)
- `nilai` (n): Nomor urut terakhir hari tersebut

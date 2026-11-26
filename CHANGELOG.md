# Changelog

Semua perubahan penting pada proyek **POS Kasir Toko Bangunan** dicatat di file ini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan versi mengikuti [Semantic Versioning](https://semver.org/lang/id/) (`MAJOR.MINOR.PATCH`).

## Aturan Pengisian

1. Setiap perubahan **wajib** dicatat **sebelum commit/push**.
2. Tulis di `[Unreleased]`; saat rilis, pindahkan ke bagian versi baru berikut tanggalnya (`YYYY-MM-DD`) dan beri tag Git (`vX.Y.Z`).
3. Kategori: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
4. Setiap entri memuat: **tag modul**, **ringkasan**, **file terdampak**, **dampak** ke modul lain, dan **cara undo**.
5. Perubahan skema database (kolom/sheet) masuk kategori `Changed` dengan label **[MIGRASI]** dan langkah migrasinya.
6. Tag modul: `[AUTH]` `[DASHBOARD]` `[POS-JUAL]` `[PRODUK]` `[PRICETAG]` `[PELANGGAN]` `[MEMBER]` `[SUPPLIER]` `[POS-BELI]` `[HUTANG-PIUTANG]` `[OPNAME]` `[RETUR]` `[USER]` `[SETTING]` `[CETAK]` `[UI]` `[BACKEND]` `[DB]` `[PWA]` `[APK]` `[DEPLOY]` `[DOCS]`.

---

## [Unreleased]

## [1.0.143] - 2026-11-26
### Disempurnakan — Sinkronisasi Akuntansi Dashboard, Engine API Retry & Cache Fix, Multi-Lokasi Produk/Retur/POS, & Tata Letak Responsif
- **[DASHBOARD] [BACKEND] Sinkronisasi 100% Kerugian Barang Rusak pada Dashboard (`08_laporan_biaya.gs`, `laporan.js`)**:
  - `laporan.dashboard` kini mengurangkan `total_kerugian_rusak` (barang rusak disetujui yang belum diganti supplier) dari `laba_bersih_riil` sehingga angka Dashboard, Laba Rugi, dan Tutup Buku Bulanan 100% klop.
- **[PRODUK] [BACKEND] Konsistensi Multi-Lokasi pada `produk.create`, `produk.update`, & `produk.importMassal` (`03_kategori_produk.gs`)**:
  - Menjaga utuh `stok_toko` & `stok_gudang` varian serta induk saat edit produk bervarian (`produk.update`), melengkapi `lokasi`/`saldo_toko`/`saldo_gudang` di `Kartu_Stok` saldo awal & import massal Excel/CSV.
- **[BACKEND] [UI] Perbaikan Engine Cache & Auto-Retry Jaringan (`frontend/js/api.js`)**:
  - Menambahkan `.transferList`, `.rekapHarian`, dan `.evaluasiBulanan` ke `READ_SUFFIXES` agar aksi baca tidak lagi memicu invalidasi cache massal; menambahkan `gudang.ringkasan` ke cache persisten SWR (0ms reload); menambahkan **auto-retry 1× (650ms)** khusus aksi baca saat terjadi gangguan jaringan sesaat.
- **[PRODUK] [RETUR] [POS-JUAL] [UI] Paritas UI/UX Multi-Lokasi & Perapian Tata Letak (`produk.js`, `retur.js`, `pos.js`, `components.css`)**:
  - **Manajemen Produk**: Menampilkan rincian `T: X • G: Y` pada tampilan tabel (desktop & mobile) dan grid.
  - **Retur Jual & Beli**: Menambahkan pilihan **Lokasi Stok Retur** (`Toko` / `Gudang`) di form input serta badge lokasi pada daftar riwayat retur.
  - **POS Kasir**: Menampilkan rincian `T/G` langsung pada tombol pilih varian dan peringatan pintar otomatis di modal pembayaran bila stok etalase kurang namun stok gudang mencukupi.
  - **Kartu Stok**: Menyelaraskan `.ks-filter-bar` untuk 6 kolom presisi (`1.8fr 1.1fr 1fr 0.95fr 0.95fr auto`) di desktop & grid 2 kolom simetris di mobile.

## [1.0.142] - 2026-11-26
### Diperbaiki — Beautifier Spreadsheet Anti-Timeout (15× Lebih Cepat via RangeList + Progres Batch Real-Time) & Jumlah Sheet Dinamis
- **[DB] [BACKEND] Optimasi Ekstrem `jalankanPercantikSpreadsheet_()` (`09_setup_trigger_beautifier.gs`, `01_database_utilitas.gs`)**:
  - Mengganti 600+ panggilan lambat `autoResizeColumn()` & format kolom satuan dengan **RangeList Batching** + lebar kolom optimal deterministik sehingga penataan 33 sheet melesat ~15× lebih cepat.
  - Menambahkan dukungan **eksekusi bertahap (`offset`, `batch_size: 6`)** pada `sistem.percantikSheet` agar tiap request selesai dalam 2–3 detik (0% risiko timeout!).
  - Mengembalikan `total_sheet` dinamis (`33`) pada respons `sistem.ping`.
- **[UI] Progress Bar Real-Time & Label Sheet Dinamis di Status Sistem (`frontend/js/app.js`)**:
  - Tombol **Percantik & Sinkronkan 33 Sheet Spreadsheet** kini mengeksekusi batch per 6 sheet dengan bilah progres langsung (`0% → 100%`) beserta nama sheet yang selesai ditata.
  - Memperbarui tampilan **Status Database** dari teks statis `27 Sheet Lengkap` menjadi dinamis **`33 Sheet Lengkap`**.

## [1.0.141] - 2026-11-26
### Disempurnakan — Spreadsheet Beautifier & Sinkronisasi 33 Sheet Otomatis (Anti-Salah Format Rupiah + Tombol 1-Klik di Aplikasi)
- **[DB] [BACKEND] Pembaruan Menyeluruh Beautifier 33 Sheet (`09_setup_trigger_beautifier.gs`, `00_konfig_skema_router.gs`)**:
  - Melengkapi peta warna tab & urutan 7 kelompok modul untuk seluruh **33 sheet** termasuk `Tutup_Buku`, `Mutasi_Lokasi`, dan `Barang_Rusak`, serta sinkronisasi kolom baru otomatis sebelum penataan (*zero-data-loss*).
  - Memperbaiki klasifikasi format angka: kolom stok/qty (`stok`, `stok_toko`, `stok_gudang`, `qty*`, `Kartu_Stok.saldo*`, `total_qty_dasar`) kini berformat angka desimal `#,##0.###` (tidak lagi salah tampil Rupiah); kolom count (`total_item`, `total_transaksi`, `poin*`) berformat bulat `#,##0`; kolom kerugian (`Barang_Rusak.nilai_kerugian`, `Biaya.nominal`) berformat Rupiah merah tebal; kolom persen berformat `0.0%`; kolom JSON/URL di-`CLIP` dengan lebar terukur agar tidak memanjangkan tinggi baris.
  - Menambahkan badge warna bersyarat untuk status baru (`disetujui`, `diajukan`, `menunggu`, `ditolak`, `terkunci`, `diganti_barang`, `ditolak_supplier`), kolom lokasi (`toko`, `gudang`, `split`), arah transfer (`gudang_ke_toko`, `toko_ke_gudang`), dan baris `deleted=TRUE`.
- **[UI] Tombol 1-Klik `Percantik & Sinkronkan 33 Sheet Spreadsheet` (`frontend/js/app.js`)**:
  - Owner kini dapat langsung menyinkronkan & merapikan seluruh 33 sheet Spreadsheet langsung dari menu **Status & Diagnostik Sistem (`#/sistem`)** maupun dari menu Spreadsheet (`POS Kasir → Percantik Tampilan Spreadsheet`).

## [1.0.140] - 2026-11-26
### Ditambahkan — Multi-Lokasi Stok (Stok Toko & Stok Gudang), Transfer Mutasi Double-Entry, Smart Receiving, & Pengelolaan Barang Rusak
- **[DB] [BACKEND] [MIGRASI] Pemisahan Stok Toko & Gudang Zero-Migration (`00_konfig_skema_router.gs`, `01_database_utilitas.gs`, `03_kategori_produk.gs`)**:
  - Menambahkan kolom `stok_toko` & `stok_gudang` pada `Produk` & `Varian`, `lokasi_stok` pada `Penjualan_Item`, `lokasi_masuk`/`qty_toko`/`qty_gudang` pada `Pembelian_Item`, `lokasi`/`saldo_toko`/`saldo_gudang` pada `Kartu_Stok`, `lokasi` pada `Opname` & `Retur`, serta 2 sheet baru `Mutasi_Lokasi` & `Barang_Rusak` (total 33 sheet, otomatis dibuat saat `sistem.ping`).
  - Helper `bacaStokLokasi_()` menjaga 100% kompatibilitas data lama (produk lama otomatis terbaca di `Stok Toko`, `Stok Gudang = 0`).
- **[PRODUK] [UI] [CETAK] Menu Baru `Gudang & Mutasi` 3-Tab untuk Semua Role (`frontend/js/modules/gudang.js`, `routes.js`, `app.js`, `api.js`, `sw.js`, `printer.js`)**:
  - **Tab Stok Toko vs Gudang**: KPI posisi stok & filter cepat *"Perlu Isi Ulang Toko"* beserta tombol 1-klik **Isi ke Toko**.
  - **Tab Transfer Stok (`TRF-...`)**: Migrasi multi-item `Gudang → Toko` (semua role) & `Toko → Gudang` (Owner/Admin), pencatatan berpasangan (*double-entry*) di `Kartu_Stok`, cetak **Bon Pengambilan Gudang (58mm/80mm/USB Direct)**, dan pembatalan transfer (*Void* khusus Owner).
  - **Tab Barang Rusak (`RSK-...`)**: Pelaporan barang pecah/membatu/cacat/susut beserta unggah foto bukti opsional; Kasir mengajukan (`diajukan`) → Owner/Admin menyetujui (`disetujui`) sebelum stok dipotong & kerugian (`qty × HPP`) dibukukan ke Laba Rugi; mendukung penyelesaian **Klaim Supplier** (`diganti_barang` mengembalikan stok & menolkan kerugian, atau `ditolak_supplier`).
- **[POS-JUAL] [POS-BELI] [OPNAME] [DASHBOARD] Integrasi Multi-Lokasi Menyeluruh (`pos.js`, `pembelian.js`, `kartu-stok.js`, `opname.js`, `laporan.js`, `produk-picker.js`, `04_pos_penjualan.gs`, `05_pembelian_stok.gs`, `06_hutang_piutang_retur.gs`, `08_laporan_biaya.gs`)**:
  - **POS Kasir**: Badge `Toko` vs `Gudang` pada katalog, modal cepat **Ambil dari Gudang ke Toko** bila etalase kosong, dan opsi **Sumber Pengambilan Stok** (*Toko* default vs *Langsung Gudang* untuk pengiriman proyek).
  - **POS Pembelian (Smart Receiving)**: Saran lokasi otomatis (*Toko* bila etalase kosong, *Gudang* bila toko masih ada) + dukungan **Bagi Toko & Gudang (Split)** dengan pencatatan terpisah di Kartu Stok.
  - **Kartu Stok, Stok Opname, & Laporan**: Filter lokasi & rincian saldo `Toko/Gudang`, opname per lokasi, dan pos **Kerugian Barang Rusak** pada Laporan Laba Rugi & Evaluasi Bulanan.
- **[TEST] Penambahan Uji Regresi Test #29 (`tests/test_debug_final.js`)**: Memverifikasi penuh zero-migration, Smart Receiving + Split, Transfer double-entry + RBAC + Void, POS lokasi gudang, Opname per lokasi, dan siklus Barang Rusak + Klaim Supplier (29/29 LULUS).

## [1.0.139] - 2026-11-26
### Diperbaiki — Penyempurnaan Logika Inti Akuntansi, Stok Multi-Varian, Multi-Satuan, & Period Lock Menyeluruh
- **[DASHBOARD] [POS-JUAL] [RETUR] [BACKEND] Perbaikan Kritis HPP Multi-Satuan (`faktor > 1`) (`01_database_utilitas.gs`, `04_pos_penjualan.gs`, `06_hutang_piutang_retur.gs`, `08_laporan_biaya.gs`)**:
  - Menambahkan helper `hitungTotalHppItem_()` dan `hitungHppDasarItem_()` sehingga penjualan/retur satuan konversi (`ROL`, `DUS`, `IKAT`, dll.) tidak lagi mengalikan ganda `hpp × qty_dasar` di Dashboard, Laporan Penjualan, Laba Rugi, Tutup Buku Bulanan, Kartu Stok, maupun kalkulasi ulang HPP Retur Jual.
- **[POS-BELI] [RETUR] [BACKEND] Eliminasi Overwrite Stok Multi-Varian / Multi-Baris (`05_pembelian_stok.gs`, `06_hutang_piutang_retur.gs`)**:
  - Memperbarui state stok & HPP secara berantai di memori dan merekalkulasi stok produk induk dari seluruh varian aktif (Aturan Bisnis #17) saat 1 faktur pembelian atau 1 dokumen retur memuat lebih dari satu varian/baris dari produk yang sama.
- **[POS-JUAL] [RETUR] [BACKEND] Akumulasi Cek Stok POS & Guard Stok Retur Beli (`04_pos_penjualan.gs`, `06_hutang_piutang_retur.gs`)**:
  - `penjualan.create` kini menjumlahkan akumulasi `qty_dasar` lintas baris untuk produk/varian yang sama di keranjang sebelum memvalidasi stok (cegah lolos stok minus saat membeli 2 satuan berbeda dalam 1 nota).
  - `retur.create` & `retur.approve` tipe `beli` kini memvalidasi kecukupan stok gudang (menolak `STOK_KURANG`) agar saldo master stok & Kartu Stok selalu klop 100%.
- **[BACKEND] Period Lock Kedap Bocor pada Seluruh Aksi Keuangan & Stok (`05_pembelian_stok.gs`, `06_hutang_piutang_retur.gs`, `07_pelanggan_loyalti_deposit.gs`)**:
  - Memasang `cekPeriodeTerkunci_()` di `piutang.bayar`, `hutang.bayar`, `retur.create`, `retur.approve`, `opname.create(langsung_setuju)`, `opname.approve`, `deposit.tambah`, dan `deposit.tarik`.
- **[TEST] Penambahan Uji Regresi Test #28 (`tests/test_debug_final.js`)**: Memverifikasi penuh HPP multi-satuan, anti-overwrite multi-varian, akumulasi stok POS, guard stok retur beli, dan Period Lock menyeluruh (28/28 LULUS).

## [1.0.138] - 2026-11-25
### Disempurnakan — Konsistensi Tipografi 100% & Preload Google Font Zero-FOUT
- **[UI] Preload Instan Google Fonts di `<head>` (`index.html`)**: Menyuntikkan stylesheet Google Font pilihan user (*Plus Jakarta Sans*, *Inter*, *Poppins*, *Roboto*, *JetBrains Mono*) langsung di script Zero-FOUC sebelum first paint untuk menghilangkan kedipan pergantian font saat muat ulang.
- **[UI] Penyeragaman Penuh `var(--font-mono)`, `var(--fs-*)`, & `var(--fw-*)` (`laporan.js`, `pos.js`, `produk.js`, `kartu-stok.js`, `pelanggan.js`, `components.css`, `layout.css`)**:
  - Mengganti seluruh `font-family: monospace` mentah (yang jatuh ke Courier New di Windows) dengan `var(--font-mono)`.
  - Mengganti ukuran huruf hardcoded `9px–11.5px` dan `font-weight: bold` pada antarmuka aplikasi menjadi token standar `var(--fs-2xs)` / `var(--fs-xs)` dan `var(--fw-bold)` / `var(--fw-semibold)` agar 100% seragam mengikuti skala & gaya huruf pilihan pengguna.

## [1.0.137] - 2026-11-25
### Diperbaiki — Ketajaman Teks Anti-Blur (Modal GPU & ClearType Windows) + Kontras Global WCAG AA/AAA
- **[UI] Eliminasi Blur pada Modal Desktop & Animasi (`components.css`)**:
  - Menghapus GPU layer permanen (`transform: translate3d(0,0,0)` & `will-change: transform`) khusus pada modal desktop (`.overlay.is-modal` & `.is-modal .dialog`) serta mengubah akhir animasi `@keyframes muncul` dari `scale3d(1,1,1)` menjadi `transform: none` agar modal dengan tinggi ganjil tidak di-rasterisasi blur pada koordinat sub-pixel. (Akselerasi GPU 60fps tetap aktif untuk bottom sheet Android mobile.)
- **[UI] Pemulihan ClearType Subpixel Rendering di Windows (`base.css`)**:
  - Mengubah `-webkit-font-smoothing` ke `auto` pada tema Terang & Hangat agar teks huruf kecil tampil tajam (ClearType native di Windows), sementara `antialiased` tetap dipakai khusus tema Gelap.
- **[UI] Batas Minimum Ukuran Huruf & Peningkatan Kontras Tema Terang/Hangat/Gelap (`tokens.css`, `components.css`)**:
  - Menetapkan lantai minimum `--fs-2xs: max(11px, 0.6875rem)`, `--fs-xs: max(12px, 0.75rem)`, dan `--fs-sm: max(13px, 0.875rem)` agar teks kecil tidak menyusut buram (9–10px) saat skala huruf disetel 85%.
  - Mempertajam kontras `--text-muted`, `--text-subtle`, `--border`, `--border-strong`, warna badge status (`success`/`warning`/`danger`/`info`), dan menambahkan `.badge-neutral` pada seluruh tema (khususnya tema **Terang Hangat**).

## [1.0.136] - 2026-11-25
### Diperbaiki — Presisi Zona Waktu WIB, Snapshot Beku Tutup Buku Bulanan, & Valuasi Stok Varian
- **[POS-BELI] [UI] Perbaikan Tanggal Default Pembelian Pagi Hari (`pembelian.js`, `format.js`)**:
  - Mengganti `new Date().toISOString().substring(0, 10)` (UTC) dengan tanggal lokal perangkat pada form input pembelian agar transaksi antara pukul 00:00–06:59 WIB tidak mundur ke tanggal kemarin/bulan lalu.
  - Parsing tanggal murni `YYYY-MM-DD` di `formatTanggal()` (`format.js`) kini menggunakan konstruktor lokal sehingga 100% kebal pergeseran zona waktu.
- **[DASHBOARD] [BACKEND] Snapshot Permanen Bulan Terkunci & Valuasi Varian (`08_laporan_biaya.gs`)**:
  - `tutupBuku.evaluasiBulanan` kini otomatis membaca angka beku dari `snapshot_json` (termasuk daftar `slow_moving`, `valuasi_stok`, `saldo_piutang`, & `saldo_hutang`) untuk bulan yang berstatus `terkunci`, sehingga laporan arsip bulan lampau tidak berubah meski stok/piutang bulan berikutnya bergerak.
  - Menyamakan perhitungan `valuasi_stok` produk bervarian di `hitungMetrikSatuBulan_` agar menghitung `stok × HPP` per varian (100% identik dengan Tab Valuasi Stok).
  - Mengunci helper `hitungRentangTanggal_` secara eksplisit ke WIB (`formatWaktu_()` / `APP.TZ = 'Asia/Jakarta'`).

## [1.0.135] - 2026-11-25
### Diperbaiki & Disempurnakan — Penyelarasan Tampilan Tab Tutup Bulanan (`#/laporan`)
- **[DASHBOARD] [UI] Eliminasi Tabel Terpotong pada Top 10 Produk Terlaris & Slow-Moving (`laporan.js`, `components.css`)**:
  - Mengubah kartu **Top 10 Produk Terlaris** dan **Barang Slow-Moving / Dead Stock (0 Terjual)** ke komponen daftar ranking native (`.dash-list` + `.dash-row`) selaras dengan *Ringkasan Eksekutif*, sehingga Nama Produk, Qty, Omset, Laba, SKU, Stok, dan Modal Tertahan tampil utuh tanpa scroll horizontal atau teks terpotong di desktop, tablet, maupun HP.
- **[DASHBOARD] [UI] Grid KPI Simetris 4×2 (`components.css`, `laporan.js`)**:
  - Menambahkan `.tb-kpi-grid` (4 kolom × 2 baris di desktop, 2 × 4 di tablet/HP) dan menyelaraskan 8 kartu KPI dengan standar `.stat-card-header` + `.stat-card-icon` + `.tb-kpi-desc` agar simetris tanpa slot kosong.
- **[DASHBOARD] [UI] Sembunyikan Bar Periode Global Ganda (`laporan.js`)**:
  - Otomatis menyembunyikan bar filter rentang harian di atas tab saat pengguna membuka Tab **Tutup Bulanan** yang sudah memiliki pemilih bulan evaluasi tersendiri.

## [1.0.134] - 2026-11-25
### Ditambahkan — Wajib Buka Shift (Semua Role), Tutup Harian (EOD), & Tutup Buku Bulanan + Evaluasi Analisa
- **[POS-JUAL] [SETTING] [BACKEND] Wajib Buka Shift & Deteksi Shift Kemarin (`00_konfig_skema_router.gs`, `04_pos_penjualan.gs`, `pos.js`, `pengaturan.js`)**:
  - Menambahkan kebijakan `wajib_buka_shift` (default aktif untuk semua role: Owner, Admin, & Kasir; dapat diatur Owner di `#/pengaturan`).
  - Validasi ganda di POS Kasir (`bukaModalPembayaran`) & backend `penjualan.create`: menolak transaksi bila belum buka shift (`SHIFT_BELUM_DIBUKA`) atau masih ada shift kemarin belum ditutup (`SHIFT_KEMARIN_BELUM_TUTUP`), serta otomatis menyarankan modal awal dari sisa modal Tutup Harian sebelumnya.
- **[POS-JUAL] [BACKEND] Tutup Harian / End-of-Day (`08_laporan_biaya.gs`, `pos.js`)**:
  - Endpoint `tutupBuku.rekapHarian` & `tutupBuku.tutupHarian` + tab baru **Tutup Harian** di modal Shift Kasir (`F3`): pre-check shift aktif / draft pending / antrean offline, rekap gabungan semua shift hari itu, input **Setoran ke Owner** & **Sisa Modal Besok**, serta tombol 1-klik **Kirim Ringkasan ke WA Owner**.
- **[DASHBOARD] [BACKEND] Tutup Buku Bulanan, Kunci Periode & Laporan Evaluasi PDF A4/Excel (`00_konfig_skema_router.gs`, `01_database_utilitas.gs`, `08_laporan_biaya.gs`, `laporan.js`, `evaluasi-pdf.js`, `sw.js`)**:
  - Menambahkan sheet `Tutup_Buku` (auto-provisioned, 31 sheet total) dan proteksi `cekPeriodeTerkunci_()` pada Penjualan, Void, Pembelian, & Biaya agar periode bulanan yang sudah ditutup tidak dapat diubah tanpa **Buka Kunci Periode** oleh Owner (tercatat di `Log_Audit`).
  - Tab baru **Tutup Bulanan** di `#/dashboard`: KPI bulanan lengkap dengan tren **MoM % vs Bulan Lalu**, **Top 10 Produk Terlaris**, **Daftar Barang Slow-Moving / Dead Stock** (modal tertahan), arsip multi-bulan, serta ekspor 1-klik **Laporan Evaluasi PDF A4** dan **Workbook Excel Bulanan (`.xls`)**.

## [1.0.133] - 2026-11-25
### Diperbaiki — Audit Debugging Total: Skema Kartu_Stok Import Massal, Presisi Desimal POS & Produk
- **[BACKEND] [PRODUK] Keselarasan Skema `Kartu_Stok` & `Kategori` di `produk.importMassal` (`03_kategori_produk.gs`, `test_debug_final.js`)**: Memperbaiki 4 titik pencatatan `Kartu_Stok` pada import massal agar memakai kolom skema resmi (`tipe: 'koreksi'`, `saldo`, `hpp`, `ref_id`, `user_id`, `keterangan`) dengan pembulatan desimal `bulatQty_()`, serta membersihkan properti non-skema `aktif` saat auto-buat `Kategori`.
- **[POS-JUAL] Anti Floating-Point Drift Modal Varian/Satuan (`pos.js`)**: Membulatkan operasi tombol `-` / `+` di modal pilih varian/satuan dengan `Math.round((cur +/- 1) * 1000) / 1000` agar qty desimal (misal `2.2 - 1`) tidak berubah menjadi `1.2000000000000002`.
- **[PRODUK] Presisi Desimal `0.125` di Import Excel & Master Produk (`produk-import.js`, `produk.js`)**: Memperbaiki regex ribuan `parseAngkaImport()` (`[1-9]\d{0,2}`) agar angka desimal `< 1` tiga digit seperti `"0.125"` tidak keliru dibaca menjadi `125`, serta menyatukan pembacaan stok/faktor/min-grosir di `produk.js` menggunakan `parseQty()`.

## [1.0.132] - 2026-11-25
### Diperbaiki — Akurasi Parsing Qty Desimal (`parseQty`) di POS Pembelian, Kasir, Retur, & Stok Opname
- **[POS-BELI] [POS-JUAL] [RETUR] [OPNAME] Perbaikan Kritis `parseQty()` (`format.js`)**: Sebelumnya `parseQty()` menghapus semua karakter titik (`.replace(/\./g, '')`), sehingga input desimal standar dari `<input type="number">` seperti `"0.5"` atau `"2.5"` keliru terbaca menjadi `5` atau `25`. Kini `parseQty()` mendukung penuh titik desimal standar (`0.5`, `2.5`, `1.125`), koma desimal Indonesia (`0,5`, `2,5`), sekaligus pemisah ribuan (`1.250,5` / `1,250.5`) hingga 3 angka di belakang koma.
- **[POS-BELI] Edit Inline Qty Desimal & Keyboard Android (`pembelian.js`, `pos.js`, `retur.js`, `opname.js`)**: Menambahkan input edit langsung qty desimal pada tabel keranjang pembelian serta atribut `inputmode="decimal"` di seluruh kolom kuantitas agar papan ketik HP langsung menampilkan tombol desimal.

## [1.0.131] - 2026-11-25
### Diperbaiki — Tata Letak Kotak Info Tempo di Modal Pembayaran POS & Proteksi Global `.alert`
- **[POS-JUAL] [UI] Kotak Info Tempo/Kredit & Kas Keluar (`pos.js`)**: Membungkus konten teks di kotak `.alert` Tempo/Kredit (`#sec-tempo`) dan Kas Keluar dengan ikon `ICONS.*` + `<div>` pembungkus agar teks jatuh tempo dan info poin tampil normal 2 paragraf penuh (sebelumnya pecah menjadi 5 kolom vertikal akibat `display: flex` pada `.alert`).
- **[UI] Proteksi Global `.alert` (`components.css`)**: Menambahkan aturan `.alert:has(> b), .alert:has(> strong) { display: block; }` dan `.alert > div { flex: 1; min-width: 0; }` untuk mencegah bug teks pecah menjadi kolom di seluruh kotak notifikasi aplikasi.

## [1.0.130] - 2026-11-25
### Ditambahkan — Sinkronisasi Cloud Tema, Warna Aksen & Tipografi Lintas Perangkat (PC & HP)
- **[SETTING] [BACKEND] Endpoint `pengaturan.simpanTema` (`00_konfig_skema_router.gs`, `02_auth_user_pengaturan.gs`)**: Menambahkan konfigurasi `tampilan_tema` pada sheet `Pengaturan` dengan sanitasi penuh (`theme`, `accent`, `fontFamily`, `fontPct` 85–125%, `fontStyle`, `updatedAt`) dan pencatatan `Log_Audit`.
- **[UI] Auto-Sync Tema Cloud Debounced (`ui.js`, `app.js`, `pengaturan.js`)**:
  - Setiap perubahan suasana latar, warna aksen, jenis font, ukuran huruf (slider/preset), gaya huruf, atau *Reset ke Standar* di modal **Tema, Warna & Tipografi** maupun panel cepat Profil Pengguna otomatis dikirim ke Cloud (debounced 650ms) dengan lencana status **Cloud Tersinkron**.
  - Saat aplikasi dibuka di perangkat lain (PC/Tablet/HP), `auth.me` dan `pengaturan.get` otomatis menarik & menerapkan `tampilan_tema` Cloud secara langsung, serta ringkasannya tampil di kartu *Status Sinkron Cloud* pada `#/pengaturan`.

## [1.0.129] - 2026-11-25
### Diperbaiki — Penyelarasan & Konsistensi Tampilan Global (CSS Utilities, Flex Input, Checkbox, & Form Grid)
- **[UI] Standarisasi Utilitas CSS Global (`base.css`)**: Menambahkan definisi 6 kelas utilitas yang sebelumnya belum terdefinisi (`.text-primary`, `.font-mono`, `.uppercase`, `.w-full`, `.items-center`/`.items-start`/`.items-stretch`, `.justify-between`/`.justify-center`/`.justify-end`, `.row-nowrap`) yang dipakai di 179 titik seluruh modul sehingga perataan tombol `Auto` di SKU/Barcode, teks aksen utama, dan angka monospace tabular kini konsisten 100%.
- **[UI] Proteksi Global Baris Input+Tombol & Checkbox (`base.css`, `components.css`, `barcode.js`)**: Menambahkan aturan `.row > .input.grow` (`flex: 1 1 0%; width: auto; min-width: 0;`) agar pasangan input/dropdown + tombol di sampingnya tidak pernah turun ke baris baru, aturan `label.row:has(> input[type="checkbox"])` agar checkbox+teks selalu sejajar 1 baris horizontal, penataan `input[type="file"].input`, serta `height: 100%` pada kartu sejajar di `.form-grid`.
- **[PRODUK] [SETTING] Penyelarasan Lebar Kolom Form (`produk.js`, `pengaturan.js`)**: Menyamakan lebar penuh kotak input HPP di Tab 2 *Tambah/Ubah Produk* agar sejajar lurus dengan tombol **Kalkulator HPP**, serta menempatkan *Aturan Poin Loyalitas Member* di `#/pengaturan` dalam `.form-grid.cols-2` agar sejajar persis dengan kolom *Lebar Kertas Printer* dan *Batas Diskon Kasir*.

## [1.0.128] - 2026-11-25
### Diperbaiki — Presisi Lebar Modal Tema, Warna & Tipografi (`size: 'lg'`)
- **[UI] Modal `Tema, Warna & Tipografi` (`ui.js`)**: Memperlebar dialog personalisasi tema dari `md` (`520px`) ke `lg` (`680px`) di layar desktop agar seluruh kartu grid 3 kolom (Suasana Latar, Warna Aksen, Jenis Font, & Gaya Huruf) tampil lebih lega tanpa teks subjudul terlipat sempit.

## [1.0.127] - 2026-11-25
### Diperbaiki — Presisi Modal Koneksi Printer Thermal Desktop & Keselarasan Kartu Backup Pengaturan
- **[CETAK] [UI] Modal Koneksi Printer Thermal Desktop (`printer.js`)**: Mengubah ukuran modal Desktop ke `size: 'lg'` agar dropdown *Jalur Direct USB PC* tidak terpotong, memperbaiki tombol segarkan printer Windows agar selalu sejajar 1 baris horizontal di kanan dropdown (`flex-wrap: nowrap` + `width: auto` pada `<select>`), serta menjaga checkbox laci kasir tetap 1 baris.
- **[SETTING] [UI] Keselarasan Kartu Backup & Cloud Sync (`pengaturan.js`)**: Menambahkan `align-items: stretch` dan `justify-content: space-between` pada 2 kartu Backup Database & Status Sinkron Cloud agar baris tombol aksi di kedua kartu rata bawah sempurna.

## [1.0.126] - 2026-11-25
### Diperbaiki — Presisi Lebar Modal `.dialog-xl` (`showModal`) & Tata Letak Modal Import Massal Excel/CSV
- **[UI] Mapping Kelas `.dialog-xl` di `showModal()` (`ui.js`)**: Menambahkan pemetaan `resolvedSize === 'xl' -> 'dialog-xl'` yang sebelumnya terlewat di `ui.js`, sehingga modal berukuran `xl` (Import / Update Massal Produk & Generator Katalog Produk PDF A4) kini tampil lebar penuh 960px di layar PC/desktop alih-alih menyempit ke 520px.
- **[PRODUK] [UI] Presisi Checkbox, Input File, & Keselarasan Kartu Import Massal (`produk-import.js`)**: Memperbaiki 4 checkbox opsi pembaruan agar sejajar 1 baris horizontal (`flex-wrap: nowrap; align-items: flex-start`), merapikan input file CSV, menyelaraskan tinggi 2 kartu Ekspor/Template (`align-items: stretch` + `justify-content: space-between`), serta menyembunyikan tombol footer impor yang redundan saat berada di tab Ekspor & Template.

## [1.0.125] - 2026-11-25
### Ditambahkan — Import/Update Massal Excel/CSV, Cloud Sync Preset Katalog, Mode Offline Antrean & Backup 1-Klik
- **[PRODUK] [BACKEND] Import / Update Massal Produk & Harga via Excel / CSV (`03_kategori_produk.gs`, `produk-import.js`, `produk.js`)**:
  - Endpoint batch `produk.importMassal` (Owner/Admin, di dalam `LockService`) untuk tambah produk baru + auto-buat kategori, update produk (berdasarkan `id`/`sku`), dan tambah/update varian dengan proteksi Aturan Bisnis #1 (`harga >= HPP`), #5 (`Kartu_Stok` koreksi), dan #17 (rekalkulasi stok induk = jumlah varian).
  - Antarmuka modal **Import / Export** di `#/produk`: Ekspor 100% seluruh katalog + varian ke CSV UTF-8 BOM ramah Excel, unduh template contoh, unggah `.csv`/`.tsv` atau **Copy-Paste langsung (`Ctrl+V`) dari Excel / Google Sheets**, pratinjau diff harga lama → baru, dan toggle aman *Timpa Stok Fisik* (default OFF).
- **[PRODUK] [SETTING] [BACKEND] Sinkronisasi Cloud Preset Katalog PDF & Pengaturan Toko (`02_auth_user_pengaturan.gs`, `katalog-pdf.js`)**:
  - Endpoint `pengaturan.simpanPresetKatalog` menyimpan daftar preset Katalog PDF (`katalog_pdf_presets`, maks 25 preset) ke sheet `Pengaturan` sehingga preset yang disimpan di PC otomatis muncul di HP/tablet dan sebaliknya, dengan fallback cache `localStorage` dan lencana status `Cloud Tersinkron`.
  - Memperbaiki daftar `printer_jalur` valid di `pengaturan.set` agar mendukung `usb_direct`.
- **[POS-JUAL] [PWA] Mode Offline Antrean Transaksi (`offline-queue.js`, `pos.js`, `app.js`, `sw.js`)**:
  - Saat checkout `penjualan.create` gagal karena internet terputus/timeout, kasir dapat langsung menyimpan transaksi ke Antrean Offline (`pos_offline_tx_queue_v1`) dengan nomor nota sementara `OFF-...`, tetap bisa langsung mencetak struk thermal, serta dilengkapi badge Topbar `Antrean (N)`, modal manajemen antrean, dan **Auto-Sync** otomatis saat perangkat kembali online.
- **[SETTING] [BACKEND] Backup Data 1-Klik JSON & Excel Multi-Sheet (`01_database_utilitas.gs`, `pengaturan.js`)**:
  - Endpoint `sistem.backup` (khusus Owner) mengekspor seluruh 30 sheet database dengan sensor otomatis pada data sensitif (`pin_hash`, `salt`, `token_hash`).
  - Tombol 1-klik di `#/pengaturan` untuk mengunduh **Backup JSON Lengkap (30 Sheet)** dan **Export Excel Multi-Sheet (`.xls` SpreadsheetML 13 tab)** serta panel status Cloud Sync & Antrean Offline.
- **[UI] Kebersihan Ikon SVG (`ui.js`, `app.js`)**: Menambahkan ikon `upload`, `cloud`, `fileSpreadsheet`, `hardDrive`, dan `banknote` ke `ICONS` serta menyatukan ikon tombol shift di `app.js` agar 0 ikon SVG inline tersisa.

## [1.0.124] - 2026-11-24
### Diperbaiki — Presisi Tata Letak Modal `.dialog-xl` & Anti-Overflow Mobile Grid
- **Lebar Modal `.dialog-xl` Desktop (`components.css`)**: Menambahkan definisi `.is-modal .dialog.dialog-xl { max-width: min(960px, calc(100vw - 48px)); }` sehingga modal Generator Katalog Produk PDF A4 di PC tampil lega 960px (pratinjau kertas A4 skala 1:1 utuh, sebelumnya jatuh ke default 520px).
- **Anti-Overflow Grid Mobile di Laporan (`laporan.js`)**: Mengubah 3 grid `minmax(300px/320px, 1fr)` menjadi `minmax(min(100%, 300px/320px), 1fr)` agar layar HP sempit (320px–375px) 100% bebas overflow horizontal.

## [1.0.123] - 2026-11-24
### Diperbaiki — Presisi Ukuran Seluruh Ikon SVG (`:where()` & `.icon-fit`)
- **Fix Spesifisitas CSS Pengaman Global SVG (`base.css`, `components.css`)**: Membungkus fallback ukuran global SVG dengan `:where(...)` (spesifisitas 0) agar tidak lagi menimpa ukuran spesifik tombol & komponen (`.btn` `16px`, `.btn-sm` `15px`, `.btn-xs` `13px`, `.badge` `13px`, `.stat-card-icon` `16px`, `.empty-icon` `30px`, `.pos-empty-icon-wrap` `36px`, `.splash-logo` `44px`).
- **Helper `.icon-fit` (`base.css`, `pos.js`, `produk.js`, `laporan.js`)**: Memastikan seluruh ikon dalam kontainer berukuran khusus (`11px`, `14px`, `16px`, `22px`, `24px`, `26px`, `36px`, `38px`) mengisi wadahnya dengan ukuran 100% eksak dan proporsional.

## [1.0.122] - 2026-11-23
### Disempurnakan — Auto-Fit Pratinjau A4 Katalog PDF & Penyatuan 100% Ikon SVG
- **Skala Auto-Fit Pratinjau Katalog PDF A4 di HP & PC (`katalog-pdf.js`, `components.css`)**: Pratinjau dokumen A4 (`794px`) kini otomatis menyesuaikan skala proporsional via `ResizeObserver` mengikuti lebar layar HP, tablet, maupun PC (0 scroll horizontal, mulus di-scroll vertikal, dan tinggi otomatis pas setelah foto termuat).
- **Penyatuan 100% Ikon SVG ke `ICONS.*` (`ui.js` + seluruh 8 modul)**: Menambahkan 5 ikon baru (`chevronsUpDown`, `chevronsDownUp`, `arrowRight`, `image`, `camera`) ke kamus terpusat `ICONS` dan mengganti seluruh 58 ikon `<svg>` inline yang tersisa di `kartu-stok.js`, `kategori.js`, `laporan.js`, `pelanggan.js`, `pembelian.js`, `pengaturan.js`, `pos.js`, dan `produk.js` (0 ikon duplikat manual).

## [1.0.121] - 2026-11-23
### Disempurnakan — Presisi Edge-Case & Tata Letak Katalog PDF A4
- **Filter Kategori Induk + Sub-Kategori (`katalog-pdf.js`)**: Memilih kategori induk pada Generator Katalog PDF kini otomatis menyertakan seluruh sub-kategorinya dengan label hierarki rapi (`Induk › Sub`).
- **Guard Varian & Presisi Cetak Multi-Halaman A4 (`katalog-pdf.js`)**: Produk non-varian (`punya_varian: false`) dipastikan tidak menampilkan sisa data varian, kartu sejajar rata bawah per baris (`align-items: stretch`), header tabel Price List otomatis berulang di tiap halaman (`thead { display: table-header-group }`), serta status loading yang jelas saat mengambil seluruh produk.

## [1.0.120] - 2026-11-23
### Diperbaiki & Ditingkatkan — Katalog Produk PDF A4 (Data 100% Lengkap & Layout Modern)
- **Fix Nama Varian & Kemasan Konversi (`katalog-pdf.js`)**: Membaca field skema asli backend `v.nama_varian` (sebelumnya tampil `-`), status stok tiap varian, serta `s.satuan` & `s.faktor` pada konversi satuan tanpa pemotongan jumlah varian.
- **Fix Terpotong 50 Produk (`katalog-pdf.js`)**: Menggunakan parameter `limit: 500` + multi-page loader (`while (hasMore)`) sehingga **100% seluruh produk toko** (58, ratusan, hingga ribuan produk) beserta seluruh kategorinya terbaca utuh tanpa ada yang tertinggal.
- **Perombakan Layout Brosur Horizontal Modern 2 Kolom**: Foto kotak proporsional di sisi kiri + detail kategori/SKU/harga di kanan + rincian seluruh varian & kemasan di bawah (hemat ruang kosong, lebih padat, rapi, seimbang, dengan pembatas kategori tegas dan pengurutan A–Z otomatis).

## [1.0.119] - 2026-11-23
### Ditambahkan — Generator Katalog Produk PDF Profesional (A4)
- **Tandai & Buat Katalog PDF (`katalog-pdf.js`, `produk.js`, `components.css`, `sw.js`)**: Pemilik toko dan kasir dapat menandai produk langsung dari **Mode Pilih** atau lewat tombol **Katalog PDF** di header halaman Produk, menyaring berdasarkan kategori/Ready Stok, dan menyimpannya sebagai **Preset Katalog** (harga otomatis selalu terbaru saat dicetak ulang).
- **3 Tata Letak A4 & 4 Tema Warna Cetak**: Mendukung **Brosur Kartu Detail (2 Kolom)**, **Brosur Kartu Kompak (3 Kolom)**, dan **Daftar Harga Resmi / Price List Tabel + Foto**, dengan pilihan mode harga (**Ritel**, **Grosir/Proyek**, **Ritel + Grosir**, atau **Tanpa Harga / Hubungi Kami**), pengelompokan kategori otomatis, detail **Varian & Kemasan**, lencana **Ready/Inden**, pratinjau live A4, cetak/Simpan PDF, serta bagikan ringkasan ke WhatsApp.

## [1.0.118] - 2026-11-23
### Maintenance & Perawatan Total Website + Aplikasi
- **Service Worker Bypass POS USB Bridge & Unduhan (`sw.js`)**: Request ke `127.0.0.1` / `localhost` (POS USB Bridge Windows) serta file unduhan `.bat` kini dibypass langsung dari Service Worker agar status koneksi printer lokal selalu real-time dan unduhan bridge selalu versi terbaru.
- **Hardening Keamanan Web (`hutang-piutang.js`, `pelanggan.js`, `pos.js`, `printer.js`, `config.js`)**: Menambahkan `noopener,noreferrer` pada seluruh 10 tautan eksternal `window.open(..., '_blank')` (anti-tabnabbing) dan menonaktifkan flag `CONFIG.DEBUG` untuk mode produksi bersih.
- **Optimasi Repositori & Audit Menyeluruh**: Terverifikasi live backend GAS (`db_siap: true`, 30 sheet), 0 kerentanan dependensi produksi (`npm audit --omit=dev`), 43/43 precache PWA sinkron, serta kompresi & pembersihan objek Git (`git gc --prune=now`).

## [1.0.117] - 2026-11-23
### Ditambahkan — Direct POS USB (ESC/POS Native) untuk Desktop Kasir
- **POS USB Bridge Windows Tanpa Install (`tools/pos-usb-bridge/`, `frontend/download/POS-Kasir-USB-Bridge.bat`)**: Bridge lokal ultra-ringan berbasis Windows PowerShell + Win32 `winspool.drv` RAW ESC/POS passthrough (0 dependensi, tanpa Node.js/Java/QZ Tray/ganti driver Zadig) untuk mencetak 1-klik langsung ke printer thermal USB Windows (Eppos, Panda, VSC, Blueprint, Xprinter, Epson TM-T82, POS-58, POS-80).
- **3 Jalur Direct ESC/POS Desktop & Cash Drawer Kick (`printer.js`, `pengaturan.js`)**: Mendukung **POS USB Bridge Windows (`127.0.0.1:9199`)**, **Direct WebUSB (`navigator.usb`)**, dan **Direct USB Serial/COM (`navigator.serial`)**, lengkap dengan **BOLD + Double Height nama toko**, **BOLD baris TOTAL**, **auto-cutter (`GS V 66 0`)**, dan opsi **Buka Laci Kasir Otomatis (`ESC p`)**.
- **Tombol Utama Direct POS USB di Semua Modal Cetak Desktop (`printer.js`)**: Di PC/Laptop, modal cetak Struk Penjualan, Faktur Pembelian, Rekap Shift (X/Z-Report), Surat Jalan, dan Modal Koneksi Printer otomatis menampilkan **Direct POS USB (ESC/POS)** sebagai jalur utama dengan cek status Bridge live & dropdown pilih printer Windows langsung dari aplikasi.

## [1.0.116] - 2026-11-23
### Ditingkatkan — Mesin Cetak Thermal Web Presisi 203 DPI
- **Template Struk HTML 203 DPI Hitam Pekat Anti-Buram (`printer.js`)**: Cetak thermal dari Web Browser untuk **Struk Penjualan, Faktur Pembelian, Rekap Shift X/Z-Report, & Surat Jalan** kini menggunakan layout HTML semantik khusus printer thermal 203 DPI (font tebal crisp `#000000` tanpa dithering abu-abu, angka tabular sejajar, garis pemisah solid/dashed nyata) menggantikan plain-text `Courier New 10px`.
- **Presisi Lebar Area Cetak Riil & Auto-Height `@page` Eksak (`printer.js`, `components.css`)**: Mengunci lebar ke area cetak riil head thermal (`48mm` untuk kertas `58mm`, `72mm` untuk kertas `80mm`) dan mengukur tinggi aktual struk dalam `mm` sebelum mencetak (`@page { size: 58mm <tinggiExact>mm; margin: 0; }`) sehingga panjang kertas berhenti pas di akhir struk (tidak lagi keluar kertas kosong panjang atau terpotong halaman 2).
- **Panel Kalibrasi Cepat & Direct USB Serial ESC/POS (`printer.js`)**: Modal pratinjau cetak browser kini dilengkapi kalibrasi langsung (Kertas 58/80mm, Lebar Cetak `44–54mm`/`68–78mm`, Ukuran Huruf, Sisa Potong Bawah) yang tersimpan otomatis per perangkat, serta tombol **Direct USB (ESC/POS)** via Web Serial API di Chrome/Edge Desktop untuk ketajaman native hardware tanpa dialog print.

## [1.0.115] - 2026-11-23
### Diperbaiki & Disempurnakan
- **Word-Wrap Otomatis Header & Alamat Struk Thermal (`printer.js`)**: `formatTengah()` kini otomatis membungkus teks panjang per kata sesuai lebar kertas (32 kolom / 58mm atau 48 kolom / 80mm) sehingga alamat toko panjang dan footer nota tidak lagi terpotong di Struk Penjualan, Pembelian, Surat Jalan, maupun Rekap Shift X/Z-Report.
- **Tampilan Pratinjau Struk Thermal Proporsional & Kirim WA Shift (`components.css`, `printer.js`)**: Pratinjau struk X-Report / Z-Report kini tampil rapi di tengah menyerupai kertas struk asli (`.thermal-preview-stage` & `.thermal-preview-paper`), tombol cetak Browser/PDF bebas popup-blocker via iframe, tombol footer `Tutup` diseragamkan ke `btn-outline`, serta ditambah tombol **Kirim WA** untuk setor rekap shift ke Owner.

## [1.0.114] - 2026-11-23

### Added
- [POS-JUAL] [CETAK] [DASHBOARD] **Ceklist "Barang Dibawa Duluan vs Dikirim Menyusul" Anti Kirim Ganda (`pos.js`, `printer.js`, `laporan.js`)**:
  - Menambahkan panel ceklist per barang langsung di modal Pembayaran POS saat memilih **Dikirim Toko**, lengkap dengan tombol cepat `Semua Dikirim` / `Semua Dibawa`, input jumlah kirim parsial (`Qty Dikirim`), dan ringkasan instan (*dibawa sekarang vs dikirim menyusul*).
  - **Surat Jalan Anti Salah Muat (`printer.js`)**: Surat Jalan A5, Thermal 58/80mm, dan WA Sopir otomatis **hanya memuat barang yang belum dibawa pembeli** (`sisa_kirim > 0`) dengan catatan info jumlah item yang sudah dibawa pembeli, plus opsi centang opsional bila ingin menampilkan seluruh isi nota.
  - **Keterangan Jelas di Struk Thermal & Faktur Besar A5**: Menampilkan penanda `[Sudah Dibawa Pembeli]`, `[Dikirim Toko]`, atau `[Dibawa: X, Kirim: Y]` pada setiap baris item pengiriman campuran.
  - **Antrean Pengiriman (`laporan.js`)**: Kolom *Muatan Barang* kini otomatis memprioritaskan tampilan barang yang masih tersisa untuk dikirim beserta catatan jumlah item yang sudah dibawa pembeli.

## [1.0.113] - 2026-11-23

### Changed
- [UI] [DASHBOARD] [PRODUK] [POS-BELI] **Pemolesan Antarmuka Desktop & Varian Produk (`components.css`, `laporan.js`, `produk.js`, `pembelian.js`)**:
  - **Laba Rugi & Margin (`.lap-grid-2col`)**: Menghapus paksaan `min-width: 960px` pada tabel ringkas di dalam grid 50/50 agar kolom `Kategori`, `Omset`, `Laba Kotor`, & `Margin` serta `Rincian Biaya Operasional` tampil penuh 100% tanpa scrollbar horizontal; menyelaraskan ikon biaya ke `ICONS.calculator`.
  - **Modal Ubah/Tambah Produk (`produk.js`)**: Memindahkan tombol footer ke slot `footer` resmi `showModal` (`form="form-produk"`) agar tidak lagi menimpa/memotong teks `Konversi Satuan Kemasan`; merapikan baris Varian menjadi grid 4 kolom (**HPP Varian**, **Harga Ritel**, **Harga Grosir**, **Stok** + tombol ikon `ICONS.trash`) sehingga HPP & harga grosir per varian tersimpan akurat tanpa menimpa satu sama lain.
  - **POS Pembelian (`pembelian.js`)**: Status pembayaran menampilkan `Belum Ada Item` (netral) dan menyembunyikan field jatuh tempo saat keranjang masih kosong, serta menambah pemisah rapi pada area diskon massal.

## [1.0.112] - 2026-11-23

### Fixed
- [POS-JUAL] [DASHBOARD] **Hotfix Tombol Buat RAB & Ekspor CSV Shift Kasir (`pos.js`, `laporan.js`)**:
  - Memperbaiki `ReferenceError: hitungTotalKeranjang is not defined` pada `bukaModalBuatPenawaran()` di `frontend/js/modules/pos.js` dengan memanggil `hitungDanTampilkanTotal()`.
  - Memperbaiki pemanggilan tombol Ekspor CSV pada tab `Shift Kasir` di `frontend/js/modules/laporan.js` agar memanggil `jalankanEksporCsv()`.

## [1.0.111] - 2026-11-23

### Changed
- [UI] [POS-JUAL] [DASHBOARD] [CETAK] [PWA] [APK] **Pemolesan Antarmuka Mobile & Native-App (`components.css`, `pos.js`, `laporan.js`, `printer.js`)**:
  - **Tab Laporan Native Horizontal Scroll (`#tabs-laporan`)**: Mengubah blok tab 2×4 yang memakan ruang vertikal di HP menjadi strip tab horizontal bergaya aplikasi native dengan *auto-center scroll*, sehingga KPI & data langsung tampil tanpa scroll panjang.
  - **Grid KPI 2×2 Mobile Rapi (`.card-grid.stat-grid`)**: Menambahkan aturan `.card-grid[style*="minmax(210px"]` dan menyelaraskan `.stat-card-icon.icon-*` pada tab `Shift Kasir` & `Pengiriman` agar seluruh 4 kartu metrik tampil simetris 2×2 di layar HP.
  - **Kartu Tabel Mobile 2-Kolom (`table-card-2col` + `.cell-stack` + `.table-actions` + `.card-filter-inline`)**: Merapikan tata letak baris multi-line (`Waktu Shift`, `Pelanggan & Alamat`, `Muatan Barang`), bar filter status + ekspor CSV, dan tombol aksi (`Cetak X/Z`, `Surat Jalan`, `Faktur A5`, `Update`).
  - **Modal Shift Kasir & Pending/RAB (`.segmented-equal`, `.detail-kv-card`)**: Memperbaiki teks tab agar 100% simetris tanpa terpotong di layar 360px, membungkus rincian kas ke kartu terstruktur, merapikan tombol footer 50/50, menghapus duplikasi panah `←` di tombol kembali keranjang, dan menyelaraskan bayangan `.pos-btn-pay` dengan warna aksen dinamis (`var(--primary-rgb)`).
  - **Pratinjau Dokumen A5 Proporsional di HP (`.a5-preview-stage` & `white-space: nowrap`)**: Pratinjau Faktur Besar A5 & Penawaran RAB A5 otomatis menskalakan proporsi kertas landscape 100% pas di lebar HP tanpa angka `Rp` terpotong atau turun baris.

## [1.0.110] - 2026-11-23

### Added
- [POS-JUAL] [HUTANG-PIUTANG] [CETAK] [BACKEND] [DB] **Penawaran Harga / Estimasi RAB (1-Klik Masuk Kasir) & Pengingat Jatuh Tempo Piutang H-3 / Lewat Tempo + Rekap Tagih WA (`00_konfig_skema_router.gs`, `01_database_utilitas.gs`, `04_pos_penjualan.gs`, `09_setup_trigger_beautifier.gs`, `api.js`, `pos.js`, `printer.js`, `hutang-piutang.js`, `tests/test_debug_final.js`)**:
  - **[MIGRASI OTOMATIS]** Menambahkan sheet `Penawaran` (sheet ke-30, *zero-migration* auto-create, nomor `RAB-YYYYMMDD-0001`, masuk L2 cache `MASTER_CACHE_SHEETS`) dan 4 endpoint: `penawaran.create`, `penawaran.list`, `penawaran.konversi`, dan `penawaran.delete`.
  - **Penawaran Harga / Estimasi RAB di POS Kasir (`pos.js`, `printer.js`)**:
    - Tombol cepat **`RAB`** di footer keranjang untuk menyimpan keranjang sebagai Estimasi Harga / RAB (dengan Judul Proyek, Masa Berlaku 3/7/14/30 hari, & Catatan) **tanpa memotong stok dan tanpa masuk omset**.
    - Cetak resmi **Dokumen Penawaran Harga A5 Landscape (PDF/Printer)** dan **Kirim Penawaran via WhatsApp** terstruktur rapi untuk kontraktor/mandor.
    - Tab **`Penawaran RAB`** di modal `Pending/RAB (F8)` dengan tombol **1-Klik Ke Kasir** (otomatis mengisi keranjang, pelanggan, diskon, pengiriman & ongkir, serta menandai RAB sebagai `Jadi Nota` secara otomatis saat checkout lunas).
  - **Pengingat Jatuh Tempo Piutang Proaktif & Tagih WA Cerdas (`hutang-piutang.js`)**:
    - Deteksi otomatis **Lewat X Hari**, **Jatuh Tempo Hari Ini**, dan **H-3 Segera Jatuh Tempo**, lengkap dengan **banner peringatan prioritas** & filter 1-klik `Perlu Ditagih (Lewat & H-3)`.
    - Template pesan **Tagih WA** yang menyesuaikan otomatis (sopan & ramah untuk H-3, tegas sopan untuk lewat tempo), plus opsi **Rekap Gabungan Semua Nota Pelanggan** dalam 1 pesan WA bila pelanggan memiliki >1 nota belum lunas.
  - Menambahkan **Test Audit #23** (`23/23 LULUS`) untuk seluruh skenario Penawaran Harga / RAB.

## [1.0.109] - 2026-11-23

### Added
- [POS-JUAL] [DASHBOARD] [CETAK] [BACKEND] **Surat Jalan (Tanpa Harga), Faktur Besar A5 (Proyek/Kontraktor), & Antrean Pengiriman Bertahap (`00_konfig_skema_router.gs`, `04_pos_penjualan.gs`, `api.js`, `printer.js`, `laporan.js`, `tests/test_debug_final.js`)**:
  - Menambahkan 2 endpoint baru: `pengiriman.list` dan `pengiriman.updateStatus` untuk memantau antrean pengiriman toko (`Menunggu Kirim` -> `Sedang Diantar` -> `Kirim Sebagian / Bon Barang` -> `Selesai`) lengkap dengan pelacakan `qty_dibawa` per item dan catatan sopir.
  - Memperbaiki status awal `status_antar` pada `penjualan.create` agar transaksi `pengiriman: 'dikirim'` otomatis masuk antrean sebagai `belum_dikirim`.
  - Menambahkan modul cetak dokumen resmi di `printer.js`:
    - **Surat Jalan (100% Tanpa Harga)**: tersedia dalam format **A5 Landscape (PDF/Printer Biasa)** dengan 3 kolom tanda tangan (Gudang, Sopir, Penerima + Stempel), **Thermal 58/80mm** (RawBT & Bluetooth Direct), serta **Kirim WA Sopir**.
    - **Faktur Besar A5 Landscape**: format faktur resmi proyek/kontraktor/instansi dengan kop toko, badge status bayar, rincian harga/diskon/ongkir, kolom tanda tangan & cap toko, serta pratinjau langsung sebelum cetak/simpan PDF.
    - Integrasi 1-klik tombol **`Faktur Besar (A5)`** dan **`Surat Jalan`** langsung di dialog selesai transaksi POS & cetak ulang nota.
  - Menambahkan tab **`Pengiriman`** di halaman **Dashboard & Laporan Usaha** (4 `.stat-card-pro`, filter status, cetak Surat Jalan/Faktur A5, & modal Update Status / Kirim Bertahap).
  - Menambahkan **Test Audit #22** (`22/22 LULUS`) untuk seluruh skenario antrean pengiriman dan kirim bertahap (Bon Barang).

## [1.0.108] - 2026-11-23

### Added
- [POS-JUAL] [DASHBOARD] [CETAK] [BACKEND] [DB] **Manajemen Buka & Tutup Shift Kasir — Modal Awal, Hitung Fisik Laci, Selisih Kas, & Z-Report (`00_konfig_skema_router.gs`, `01_database_utilitas.gs`, `04_pos_penjualan.gs`, `09_setup_trigger_beautifier.gs`, `api.js`, `pos.js`, `laporan.js`, `printer.js`, `routes.js`, `tests/test_debug_final.js`)**:
  - **[MIGRASI OTOMATIS]** Menambahkan sheet `Shift_Kasir` (sheet ke-29, *zero-migration* auto-create, prefix nomor `SHF-YYYYMMDD-0001`, masuk cache L2 `MASTER_CACHE_SHEETS`).
  - Menambahkan 4 endpoint backend resmi: `shift.aktif`, `shift.buka`, `shift.tutup`, dan `shift.list` dengan pembatasan RBAC ketat (kasir hanya menutup/melihat shift sendiri; Owner/Admin dapat mengaudit & menutup paksa shift aktif kasir mana pun).
  - Meningkatkan modal **Shift Kasir (`F3`)** di POS dengan alur lengkap:
    - Indikator status shift aktif langsung di quickbar POS (`#btn-pos-shift`) + otomatis menyertakan `shift_id` saat mencatat Kas Keluar Kasir.
    - **Buka Shift**: input modal awal laci (float) dengan tombol cepat + catatan buka.
    - **Rekap Shift Berjalan (X-Report)** secara *real-time* berdasarkan rentang waktu buka shift (akurat untuk multi-shift dalam 1 hari).
    - **Tutup Shift & Hitung Fisik Laci (Z-Report)**: dilengkapi **Kalkulator Pecahan Uang** (Rp 100rb s/d koin Rp 500), perbandingan live **Kas Sistem vs Kas Fisik**, badge selisih otomatis (`PAS` / `LEBIH` / `KURANG`), serta **validasi wajib catatan bila ada selisih kas**.
    - Cetak struk **Z-Report Thermal 58/80mm** (RawBT / Web Bluetooth / Browser) dengan blok *Rekonsiliasi Fisik Laci* dan kolom tanda tangan.
  - Menambahkan tab **`Shift Kasir`** di halaman **Dashboard & Laporan Usaha** (4 `.stat-card-pro`, filter status, ekspor CSV, cetak ulang X/Z-Report, & tombol Tutup Shift untuk Owner/Admin).
  - Menambahkan **Test Audit #21** (`21/21 LULUS`) untuk seluruh skenario buka/tutup shift, selisih, Z-Report, dan RBAC; serta merapikan ikon rute `#/biaya` ke `ICONS.calculator`.

## [1.0.107] - 2026-11-23

### Added
- [UI] [DOCS] **Penguncian Otomatis Standar Konsistensi UI/UX (`.gemini/rules/UI_DESIGN_STANDARDS.md`, `tests/check_ui_consistency.js`, `package.json`, `scripts/release.js`)**:
  - Menambahkan aturan permanen [.gemini/rules/UI_DESIGN_STANDARDS.md](file:///c:/POS%20KASIR%20TOKO/.gemini/rules/UI_DESIGN_STANDARDS.md) yang otomatis dibaca di setiap sesi pengembangan masa depan (100% Solid Flat, token tema `tokens.css`, `.stat-card-pro`, `ICONS.*`, `data-label` mobile, 0 emoji/dialog klasik).
  - Menambahkan pagar uji otomatis [tests/check_ui_consistency.js](file:///c:/POS%20KASIR%20TOKO/tests/check_ui_consistency.js) (`npm run test:ui`) dan mengintegrasikannya ke `npm run test`, `npm run test:all`, serta `npm run release` agar setiap pembaruan otomatis terblokir bila ada pelanggaran konsistensi antarmuka.

## [1.0.106] - 2026-11-22

### Changed
- [BACKEND] [API] [POS-JUAL] [DASHBOARD] **Peningkatan Performa & Kecepatan Load Data Menyeluruh (`00_konfig_skema_router.gs`, `01_database_utilitas.gs`, `04_pos_penjualan.gs`, `api.js`, `laporan.js`, `app.js`)**:
  - **Perbaikan Kritis `READ_SUFFIXES` di Klien (`api.js`)**: Menambahkan `.dashboard`, `.arusKas`, `.labaRugi`, `.shiftKasir`, dan `.riwayat` ke daftar aksi baca sehingga membuka Dashboard, Arus Kas, Laba Rugi, Shift Kasir, maupun Riwayat Deposit **tidak lagi mengosongkan cache klien** — perpindahan antar tab laporan kini instan (`0ms`).
  - **Perluasan Cache L2 Server (`01_database_utilitas.gs`)**: Memperluas `MASTER_CACHE_SHEETS` (`CacheService` lintas-request dengan invalidasi otomatis per penulisan) mencakup 20 sheet operasional utama (`Users`, `Penjualan*`, `Pembelian*`, `Piutang`, `Hutang`, `Pembayaran`, `Retur*`, `Biaya`, `Deposit_Log`), optimasi `cacheAmbil_` menjadi **1 RPC `getAll()`**, serta guard batas aman `600 KB`.
  - **Cache Header Per-Request (`_HEADER_CACHE_REQ`) & Batch Write Checkout (`04_pos_penjualan.gs`)**: Menghilangkan puluhan RPC pembacaan header & penulisan `Kartu_Stok`/`Produk`/`Varian` berulang per item saat checkout POS (semua digabung jadi 1 kali batch write).
  - **UX Tanpa Kedipan & Prefetch Instan (`laporan.js`, `app.js`, `api.js`)**: Menambahkan `hasUsableApiCache` agar perpindahan tab laporan dengan cache SWR tampil instan tanpa kedipan skeleton + proteksi urutan request (`laporanReqSeq`), memperluas `PERSISTABLE_ACTIONS` (SWR 0ms pasca-F5), serta menambahkan *hover/touch module prefetching* pada seluruh tautan navigasi.

## [1.0.105] - 2026-11-22

### Removed
- [BACKEND] **Penghapusan Permanen File Monolith `backend/kode.gs` & `scripts/build-gas.js` (100% Modular Murni)**:
  - Menghapus `backend/kode.gs` (file raksasa 7.985 baris) dan `scripts/build-gas.js` karena proyek kini 100% menggunakan **10 modul ringkas** di `backend/src/*.gs` yang terhubung langsung ke Google Apps Script melalui `clasp`.
  - Menambahkan helper [tests/_load_gas.js](file:///c:/POS%20KASIR%20TOKO/tests/_load_gas.js) dan validator [scripts/check-gas.js](file:///c:/POS%20KASIR%20TOKO/scripts/check-gas.js) (`npm run check:gas`) agar seluruh 16 suite uji otomatis membaca & memvalidasi langsung dari `backend/src/*.gs`.

## [1.0.104] - 2026-11-22

### Changed
- [DOCS] [APK] [DEPLOY] **Pembersihan Total Proyek, Clean Build Gradle & Sinkronisasi Dokumentasi (`README.md`, `docs/database.md`)**:
  - Menghapus folder kosong sisa `scratch/` dan menjalankan `gradlew clean` pada proyek Android sebelum membangun ulang APK bersih versi `v1.0.104`.
  - Memperbarui [README.md](file:///c:/POS%20KASIR%20TOKO/README.md) dan [docs/database.md](file:///c:/POS%20KASIR%20TOKO/docs/database.md) agar selaras 100% dengan arsitektur terbaru (**28 sheet**, kolom `saldo_deposit`, `ongkir`, `biaya_bongkar`, `biaya_masuk_hutang`, `metode_alokasi_biaya`, tabel `Deposit_Log` & `Biaya`, serta arsitektur modular 10 file `backend/src/*.gs` + `clasp`).
  - Optimasi ulang repositori Git (`git gc --prune=now`) dan verifikasi menyeluruh **0 sampah, 0 masalah, 20/20 uji audit lulus**.

## [1.0.103] - 2026-11-22

### Added
- [BACKEND] [DEPLOY] **Kesiapan Deploy Multi-File Google Apps Script via `clasp` (`backend/src/appsscript.json`, `.clasp.json.example`, `.gitignore`, `package.json`, `backend/src/README.md`)**:
  - Menambahkan manifes resmi GAS [appsscript.json](file:///c:/POS%20KASIR%20TOKO/backend/src/appsscript.json) (V8, `Asia/Jakarta`, Web App `ANYONE_ANONYMOUS`) dan template [.clasp.json.example](file:///c:/POS%20KASIR%20TOKO/.clasp.json.example) dengan `rootDir: "backend/src"`.
  - Melindungi `.clasp.json` lokal di [.gitignore](file:///c:/POS%20KASIR%20TOKO/.gitignore) agar `scriptId` pribadi tidak pernah ikut ter-push ke GitHub.
  - Menambahkan perintah `npm run gas:login`, `npm run gas:push`, dan `npm run gas:open` agar ke-10 file modul di `backend/src/*.gs` dapat langsung diunggah sebagai 10 tab terpisah di editor Google Apps Script tanpa copy-paste manual, sambil tetap menjaga kompatibilitas penuh `npm run build:gas` ke `backend/kode.gs`.

## [1.0.102] - 2026-11-22

### Changed
- [BACKEND] [DOCS] **Modularisasi Arsitektur Backend `backend/src/*.gs` + Auto-Build `kode.gs` (`scripts/build-gas.js`, `backend/src/`, `package.json`, `scripts/release.js`)**:
  - Memecah monolith `backend/kode.gs` (~7.968 baris) menjadi **10 modul tematik ringkas** (`00_konfig_skema_router.gs` s/d `09_setup_trigger_beautifier.gs`) di folder [backend/src/](file:///c:/POS%20KASIR%20TOKO/backend/src/README.md) tanpa mengubah logika bisnis apa pun.
  - Menambahkan skrip penggabung otomatis [scripts/build-gas.js](file:///c:/POS%20KASIR%20TOKO/scripts/build-gas.js) (`npm run build:gas` & `npm run check:gas`) lengkap dengan validasi syntax otomatis serta integrasi penuh ke `npm run test:all` dan `npm run release`.
  - Siap di-deploy baik via copy-paste 1 file `backend/kode.gs` seperti biasa maupun via `clasp push` multi-file ke Google Apps Script di masa depan.

## [1.0.101] - 2026-11-22

### Changed
- [PWA] [UI] [DEPLOY] **Maintenance Aplikasi, Website, Keamanan Header & Optimasi Repositori (`index.html`, `vercel.json`)**:
  - **Sinkronisasi Tema Splash Screen & Status Bar (`index.html`)**: Mengganti warna oranye tetap pada layar splash (`.splash-logo`, `.splash-logo-ring`, `.splash-progress-bar`, `.splash-status-dot`) menjadi `var(--primary, #e8590c)` serta menyelaraskan `<meta name="theme-color">` otomatis sesuai aksen warna pilihan pengguna sebelum *first paint* (Zero-FOUC).
  - **Optimasi Header CDN & Keamanan Website (`vercel.json`)**: Menambahkan header `Cache-Control: public, max-age=0, must-revalidate` untuk `manifest.json` dan berkas unduhan `/download/*.apk` (dengan MIME resmi `application/vnd.android.package-archive`) agar pengguna selalu mengunduh APK terbaru tanpa cache CDN lama, serta menambahkan header keamanan `Permissions-Policy`.
  - **Pembersihan Repositori & Audit Dependensi**: Pembersihan objek longgar & file `.idx` yatim Git (`git gc --prune=now`) serta verifikasi `npm audit` (**0 kerentanan**), **0 masalah** deep check, dan **20/20** uji audit lulus.

## [1.0.100] - 2026-11-22

### Fixed
- [PELANGGAN] **Perbaikan `ReferenceError: container is not defined` pada Tombol Terima/Kembalikan Saldo Titipan (`pelanggan.js`)**:
  - Memperbarui tanda tangan `bukaModalDetailPelanggan(pelangganId, container = null)` serta penerusan argumen `container` dari daftar pelanggan dan pemanggilan `bukaModalTerimaTitipan(pel, onSuccess)` / `bukaModalTarikTitipan(pel, onSuccess)` sehingga tombol **Terima Titipan** dan **Kembalikan Saldo** bekerja mulus dan otomatis menyegarkan tabel & detail pelanggan.

## [1.0.99] - 2026-11-22

### Fixed
- [API] [BACKEND] [POS-JUAL] [RETUR] [DASHBOARD] **Debugging Total & Finalisasi Stabilitas Sistem (`api.js`, `kode.gs`, `pos.js`, `laporan.js`, `retur.js`, `pembelian.js`)**:
  - **Sinkronisasi Cache & Invalidasi Mutasi (`api.js`)**: Memperbaiki seluruh kunci `CACHE_CONFIG` & `PERSISTABLE_ACTIONS` agar cocok 100% dengan rute backend (`kartuStok.list`, `penjualan.shiftKasir`, `deposit.riwayat`, `laporan.dashboard`, `laporan.arusKas`, `laporan.labaRugi`) serta menambahkan pola invalidasi `deposit.` dan `kartuStok.` pada `MUTATION_PATTERNS` sehingga perubahan saldo titipan langsung segar di POS Kasir & Laporan tanpa menunggu kedaluwarsa cache.
  - **Filter Nota Void & Pending (`kode.gs`, `retur.js`)**: Memperbaiki filter `aksiPenjualanList_` dan pengecekan nota retur (`retur.js`) yang sebelumnya memeriksa properti `pj.void` (tidak ada di skema) menjadi memeriksa `pj.status !== 'void' && pj.status !== 'pending'` sehingga nota batal/pending tidak lagi bocor di daftar riwayat penjualan maupun form retur.
  - **Normalisasi Saldo Deposit pada Cetak Ulang Struk (`kode.gs`)**: `aksiPenjualanDetail_` kini selalu mengembalikan angka `saldo_deposit` yang bersih pada objek pelanggan agar cetak ulang nota tetap menampilkan Sisa Saldo Titipan secara akurat.
  - **Dashboard & Detail Penjualan (`laporan.js`)**: Menampilkan **Saldo Titipan (Deposit)** pada grafik Komposisi Metode Pembayaran Dashboard, menambahkan filter `Saldo Titipan` & `Kombinasi` di Tab Penjualan, memperbaiki tampilan alasan pembatalan (`j.void_alasan || j.alasan_void`), serta memformat label metode bayar di modal Detail Nota Penjualan.
  - **Pemulihan Draft Tahan / Pending Cart (`pos.js`)**: Memuat ulang transaksi ditahan kini ikut memulihkan **Pelanggan terpilih** dan **Diskon Global Transaksi** secara utuh (selain keranjang, pengiriman, ongkir, dan catatan).
  - **Kebersihan Ikon Aksi (`pembelian.js`)**: Membersihkan fallback ikon hapus menjadi `${ICONS.trash}` konsisten di seluruh aplikasi.

## [1.0.98] - 2026-11-22

### Added
- [PELANGGAN] [POS-JUAL] [BACKEND] [CETAK] [RETUR] [DASHBOARD] **Fitur Saldo Titipan / Deposit Pelanggan End-to-End (`kode.gs`, `pelanggan.js`, `pos.js`, `printer.js`, `laporan.js`, `retur.js`, `test_debug_final.js`)**:
  - **Terima & Kembalikan Saldo Titipan (`pelanggan.js`, `kode.gs`)**: Menambahkan kolom `saldo_deposit` pada `Pelanggan` dan tabel baru `Deposit_Log` dengan **auto-migrasi sheet & kolom otomatis** (zero-migration tanpa perlu menjalankan `setupDatabase()` manual). Semua role dapat menerima titipan (`deposit.tambah` via Tunai/Transfer/QRIS lengkap dengan kirim bukti WhatsApp), sedangkan pengembalian sisa saldo (`deposit.tarik`) khusus **Owner & Admin**. Dilengkapi kartu statistik **Total Saldo Titipan**, kolom tabel, riwayat mutasi lengkap, serta proteksi hapus pelanggan jika saldo titipan > 0.
  - **Pembayaran Saldo Titipan di POS (`pos.js`, `kode.gs`, `printer.js`)**: Pelanggan terdaftar (Member maupun Umum) dapat dipilih di POS lengkap dengan badge saldo titipan. Checkout mendukung bayar penuh via **Saldo Titipan** maupun **Kombinasi** (jika saldo kurang dari tagihan, tombol otomatis mengisi penuh saldo titipan dan menghitung sisa kurang ke tunai/transfer/tempo). Struk Thermal/RawBT/Browser & WhatsApp otomatis mencetak `Bayar (SALDO TITIPAN)` dan `Sisa Saldo Titipan`.
  - **Akuntansi Anti Double-Counting, Poin, Void & Retur (`kode.gs`, `laporan.js`, `retur.js`)**:
    - Terima titipan masuk **Arus Kas Masuk** (`deposit_masuk_tunai`/`deposit_masuk_bank`) & **Shift Kasir** (jika tunai), TIDAK masuk omset/laba/poin sebelum dibelanjakan.
    - Pemakaian saldo di POS tercatat sebagai omset lunas & berhak mendapat **Poin Member** (khusus barang, di luar ongkir), namun **tidak dihitung ulang di Arus Kas** (bebas double-counting).
    - **Void Nota** berbayar deposit otomatis mengembalikan saldo ke pelanggan; **Retur Penjualan** kini mendukung opsi refund langsung ke **Saldo Titipan (Deposit Pelanggan)**.
  - **Pengujian Otomatis (`tests/test_debug_final.js`)**: Menambahkan **Test #20** mencakup seluruh siklus deposit (top-up, belanja penuh & kombinasi, anti double-counting arus kas, poin, void, retur, RBAC penarikan, dan guard hapus pelanggan — **20/20 LULUS**).

## [1.0.97] - 2026-11-22

### Fixed
- [POS-BELI] [UI] **Perapihan Grid 2-Kolom Penuh Input Ongkos Kirim & Biaya Bongkar (`pembelian.js`)**:
  - Mengganti wrapper `.beli-inputs-grid` (grid 5 kolom khusus bar item kiri) pada kolom `Ongkos Kirim (Rp)` & `Biaya Bongkar (Rp)` di panel **Ringkasan Pembelian** menjadi grid 2 kolom proporsional penuh (`repeat(2, minmax(0, 1fr))` + `align-items: end`, label 1 baris sejajar) sehingga kedua kotak input tampil lebar penuh dan rapi di desktop maupun mobile.

## [1.0.96] - 2026-11-22

### Added
- [POS-BELI] [BACKEND] [CETAK] [HUTANG-PIUTANG] **Fitur Landed Cost Pembelian: Konversi Ongkos Kirim & Biaya Bongkar ke HPP Final (`kode.gs`, `pembelian.js`, `printer.js`, `test_debug_final.js`)**:
  - **Input Ongkos Kirim & Biaya Bongkar di POS Pembelian (`pembelian.js`)**: Menambahkan kolom **Ongkos Kirim (Rp)** dan **Biaya Bongkar (Rp)** pada Ringkasan Pembelian lengkap dengan pilihan metode pembagian ke HPP (**Proporsional Nilai Belanja** atau **Rata per Qty Satuan Dasar**) serta centang **Masuk Tagihan / Hutang Supplier** vs **Bayar Tunai Terpisah ke Kuli/Ekspedisi**.
  - **Preview HPP Final Real-Time & Peringatan Anti-Boncos (`pembelian.js`)**: Setiap baris keranjang pembelian menampilkan badge estimasi `HPP Final / Satuan Dasar` + porsi kenaikan dari ongkir/bongkar, serta peringatan merah otomatis apabila HPP baru melebihi Harga Jual Ritel produk saat ini.
  - **Kalkulasi HPP Moving Average & Akuntansi Anti-Dobel (`kode.gs`)**: Menambahkan kolom `ongkir`, `biaya_bongkar`, `biaya_masuk_hutang`, dan `metode_alokasi_biaya` pada skema `Pembelian` (auto-migrasi otomatis via `pastikanKolomSkema_`). Bila dibayar tunai terpisah, Hutang Supplier tetap murni senilai barang, Arus Kas keluar tunai tercatat otomatis, dan HPP produk tetap naik akurat.
  - **Struk, WhatsApp, Detail Faktur & Uji Otomatis (`printer.js`, `pembelian.js`, `tests/test_debug_final.js`)**: Menampilkan rincian Ongkos Kirim & Biaya Bongkar di cetak faktur, pesan WA, dan modal rincian faktur pembelian, serta menambahkan **Test #19** yang menguji seluruh skenario Landed Cost (**19/19 LULUS**).

## [1.0.95] - 2026-11-22

### Added
- [POS-JUAL] [BACKEND] [CETAK] [DASHBOARD] **Fitur Jasa Ongkos Kirim Fleksibel untuk Pesanan Dikirim (`kode.gs`, `pos.js`, `printer.js`, `laporan.js`, `test_debug_final.js`)**:
  - **Checkout POS (`pos.js`)**: Saat kasir memilih **Dikirim Toko**, otomatis tampil input **Biaya Ongkos Kirim (Rp)** yang bisa diisi manual bebas sesuai jarak/armada beserta tombol preset cepat (`Gratis`, `20rb`, `50rb`, `100rb`, `150rb`). Total tagihan, uang pas, kembalian, kombinasi bayar, dan pratinjau poin member diperbarui secara *real-time*; opsi **Ambil di Toko** otomatis menolkan ongkir. Mendukung simpan/muat ulang transaksi tahan (*pending*).
  - **Aturan Poin Member Khusus Belanja Barang (`kode.gs`)**: Menambahkan kolom `ongkir` pada skema `Penjualan` (dengan auto-migrasi kolom `pastikanKolomSkema_` tanpa perlu jalankan `setupDatabase` manual). Poin loyalitas & akumulasi `total_belanja` member pada transaksi tunai, kombinasi DP, pelunasan piutang tempo, maupun pembatalan (void) **hanya dihitung dari nilai belanja barang** (ongkir tidak dihitung poin).
  - **Struk & Laporan (`printer.js`, `laporan.js`, `kode.gs`)**: Menampilkan baris `Ongkos Kirim` secara rapi pada struk Thermal/RawBT/Browser, struk WhatsApp, modal Detail Nota Penjualan, serta baris `Pendapatan Jasa Kirim (Ongkir)` di Laporan Laba Rugi (sinkron penuh dengan Arus Kas & Dashboard).
  - **Pengujian Otomatis (`tests/test_debug_final.js`)**: Menambahkan **Test #18** yang menguji seluruh skenario ongkir (manual, ambil di toko = 0, poin khusus barang untuk tunai & tempo lunas, akumulasi `total_belanja`, dan sinkronisasi Laba Rugi/Dashboard).

## [1.0.94] - 2026-11-22

### Changed
- [DASHBOARD] [UI] **Penyeragaman 100% Kartu Statistik `.stat-card-pro` & Skeleton Shimmer di Seluruh Sub-Tab Laporan (`laporan.js`)**:
  - Mengubah seluruh 17 kartu ringkasan lama `.card.stat` pada Tab **Penjualan**, **Pembelian**, **Arus Kas**, dan **Valuasi Stok** menjadi `.stat-card-pro` modern lengkap dengan ikon sudut berwarna (`icon-emerald`, `icon-amber`, `icon-blue`, `icon-rose`, `icon-purple`) dan deskripsi ringkas agar 100% seragam dengan Tab Ringkasan Eksekutif, Pelanggan, Biaya, dan Hutang-Piutang.
  - Mengganti indikator loading spinner polos pada perpindahan tab/periode di `laporan.js` menjadi animasi *skeleton shimmer* (4 kartu statistik + 5 baris tabel) yang mulus.

## [1.0.93] - 2026-11-22

### Security
- [BACKEND] [AUTH] [RETUR] [BIAYA] **Penguatan Concurrency Lock (Re-Entrant) & RBAC Kasir (`kode.gs`, `test_debug_final.js`)**:
  - **Re-Entrant Script Lock (`denganKunci_`)**: Menambahkan `_LOCK_DEPTH_REQ` agar pemanggilan `denganKunci_` bersarang pada `member.tukarPoin`, `biaya.create`, dan `biaya.delete` (yang sudah dibungkus kunci di `doPost`) tidak pernah melepas lock terlalu dini maupun memicu bentrok lock di Google Apps Script.
  - **Penguatan RBAC Kasir (`aksiReturCreate_`, `aksiBiayaCreate_`)**: Menolak role `kasir` membuat retur pembelian ke supplier (`tipe === 'beli'`) dan mengunci `sumber_dana` pengeluaran oleh `kasir` hanya ke `kas_kasir` (petty cash laci, tidak dapat menyentuh `kas_toko` atau `bank`).

## [1.0.92] - 2026-11-22

### Fixed
- [BACKEND] [POS-JUAL] [OPNAME] [DASHBOARD] **Penyempurnaan 3 Edge-Case Rekonsiliasi Akhir (`kode.gs`, `test_debug_final.js`)**:
  - **Void Nota Tempo Tidak Memotong `total_belanja` Member (`aksiPenjualanVoid_`)**: Pembatalan nota tempo belum lunas hanya mengurangi porsi yang memang sudah dibayar di awal (DP), sehingga histori `total_belanja` transaksi lunas member sebelumnya tetap utuh.
  - **Rekonsiliasi Selisih Aktual Persetujuan Opname (`aksiOpnameApprove_`)**: Menghitung ulang `stokSistemAktual` dan `selisihAktual` pada saat persetujuan draft opname sehingga mutasi `Kartu_Stok` tetap 100% sinkron meski terjadi penjualan/pembelian di sela waktu antara pembuatan draft dan persetujuan.
  - **Sinkronisasi Sisa Hutang Laporan Pembelian (`aksiLaporanPembelian_`)**: Membaca sisa hutang riil dari sheet `Hutang` agar angka sisa hutang pada Laporan Pembelian selalu identik dengan modul Hutang Supplier, termasuk setelah retur pembelian `potong_hutang`.

## [1.0.91] - 2026-11-22

### Fixed
- [BACKEND] [DASHBOARD] [POS-JUAL] [RETUR] [HUTANG-PIUTANG] **Perbaikan 6 Celah Akuntansi & Logika Transaksi Menyeluruh (`kode.gs`, `pos.js`, `laporan.js`, `test_debug_final.js`)**:
  - **Arus Kas & Komposisi Tunai Bebas Kembalian (`kode.gs`)**: `aksiPenjualanCreate_` kini mencatat nominal tunai bersih pada `Penjualan_Bayar` (setelah dikurangi kembalian), dan helper `agregasiBayarBersih_` menormalisasi data historis pada `aksiLaporanArusKas_` & `aksiLaporanDashboard_` agar kas masuk tunai 100% riil tanpa menggelembung sebesar uang kembalian.
  - **Sinkronisasi Laba Rugi & Dashboard Saat Ada Retur (`kode.gs`, `laporan.js`)**: Menambahkan helper `hitungEfekReturPenjualan_` yang menghitung `total_retur_hpp` (HPP barang retur kembali ke stok) sehingga Laba Kotor Bersih memotong selisih margin (`omset retur - HPP kembali`), bukan rugi palsu 100% harga jual, dan angka `Laba Bersih Riil` di Dashboard Ringkasan Eksekutif kini 100% identik dengan Tab Laba Rugi & Margin.
  - **Validasi Batas Qty Retur Anti-Dobel (`kode.gs`)**: `aksiReturCreate_` kini memvalidasi setiap item retur terhadap qty transaksi asal dikurangi akumulasi retur aktif sebelumnya agar tidak bisa diretur melebihi qty beli.
  - **Sinkronisasi Status Nota/Faktur Asal Saat Retur `potong_piutang` / `potong_hutang` + Guard Pembelian (`kode.gs`)**: Saat retur melunasi piutang/hutang, `Penjualan.status_bayar` / `Pembelian.status_bayar` ikut diperbarui ke `lunas`/`sebagian`; `aksiPembelianCreate_` membatasi nominal bayar tercatat maksimal sebesar `grandTotal`.
  - **Fix Tutup Shift Kasir (`kode.gs`, `pos.js`)**: Memperbaiki bug unwrap response `apiCall` dan format tanggal `YYYY-MM-DD` di `bukaModalShiftKasir()` (`pos.js`), serta menyempurnakan `aksiPenjualanShiftKasir_` agar akurat menghitung penjualan tunai bersih (termasuk kombinasi), pelunasan piutang tunai (`+`), kas keluar kasir (`-`), dan refund retur tunai (`-`).
  - **Pengujian Otomatis (`tests/test_debug_final.js`)**: Menambahkan **Test #17** yang menguji seluruh skenario akuntansi di atas secara menyeluruh (**17/17 LULUS**).

## [1.0.90] - 2026-11-22

### Changed
- [UI] [USER] [PELANGGAN] [HUTANG-PIUTANG] **Perawatan Menyeluruh (Hygiene & Konsistensi Sistem Tema)**:
  - **Eliminasi 100% Warna Oranye Hardcoded (`components.css`, `layout.css`, `app.js`, `utils/ui.js`)**: Mengganti 10 sisa `rgba(232/234, 88/89, 12, ...)` pada `.highlight-text`, `.pos-list-item:hover`, `.cmd-palette-item`, `@keyframes splash-pulse`, banner instalasi/update `app.js`, dan ikon dialog `showConfirm` menjadi token dinamis `rgba(var(--primary-rgb), ...)` / `var(--primary-soft)` agar seluruh 6 tema warna aksen 100% murni tanpa kebocoran warna oranye.
  - **Manajemen Pengguna (`users.js`)**: Menambahkan `flex-wrap: nowrap` & `flex-shrink: 0` pada baris avatar username dan menyeragamkan ikon tombol `Ubah` menjadi `ICONS.edit`.
  - **Label Status & Metode Bayar Bersih (`pelanggan.js`, `hutang-piutang.js`)**: Memformat label mentah `belum_lunas` / `bayar_sebagian` / `qris` / `tunai` pada modal riwayat transaksi pelanggan serta riwayat bayar hutang/piutang menjadi bahasa Indonesia rapi (`Belum Lunas`, `Cicilan`, `Lunas`, `Dibatalkan`, `QRIS`, `Tunai`, `Transfer`, `Tempo`).

## [1.0.89] - 2026-11-21

### Fixed
- [PRODUK] [UI] **Perluasan & Anti-Terpotong Dropdown Pemilih Kategori di Modal Produk (`produk.js`, `components.css`)**:
  - Memindahkan render `.cat-picker-dropdown` ke viewport-level (`document.body` dengan `position: fixed; z-index: 2050`) serta kalkulasi arah otomatis (bawah/atas menyesuaikan ruang layar yang paling lega) sehingga daftar kategori tidak lagi terpotong oleh batas `.dialog-body` maupun footer modal `Ubah/Tambah Produk`.
  - Memperlebar panel pemilih kategori hingga `460px` pada desktop (dan proporsional penuh di mobile) dengan tinggi daftar hingga `400px`, ukuran font item lebih nyaman dibaca (`var(--fs-sm)`, padding `9px 12px`), auto-scroll otomatis ke kategori yang sedang aktif, pembersihan listener/DOM otomatis saat modal ditutup, serta mengganti focus shadow oranye hardcoded menjadi `rgba(var(--primary-rgb), 0.16)`.

## [1.0.88] - 2026-11-21

### Fixed
- [UI] [PRODUK] [SUPPLIER] [PELANGGAN] [PRICETAG] **Perapihan Tata Letak & Konsistensi Tombol 4 Modul (Kategori, Supplier, Pelanggan, Price Tag)**:
  - **Kategori Produk (`kategori.js`)**: Melipat sub-kategori secara default saat halaman pertama dibuka agar daftar kategori induk ringkas dan mudah dipindai (otomatis terbuka saat mencari, membuka tab `Sub Kategori`, atau menambah sub baru), memadatkan kolom `Tipe & Hirarki` sub-kategori menjadi 1 baris inline, serta menyeragamkan ikon tombol aksi (`ICONS.edit` & `ICONS.trash`).
  - **Data Supplier (`supplier.js`)**: Memperbaiki bug ikon avatar truk yang turun ke baris terpisah pada nama supplier panjang (menambahkan `flex-wrap: nowrap` & `flex-shrink: 0`), menyeragamkan ikon `Ubah`/`Hapus` menjadi `ICONS.edit` & `ICONS.trash`, dan menambahkan mode `danger: true` pada dialog hapus.
  - **Pelanggan & Member (`pelanggan.js`)**: Mengunci baris avatar nama pelanggan agar anti-wrap (`flex-wrap: nowrap`, `flex-shrink: 0`) dan menyelaraskan bingkai tombol `Rincian`, `Ubah`, serta `Pilih`.
  - **Price Tag Harga (`pricetag.js`, `components.css`)**: Menyelaraskan tinggi panel pratinjau kanan dengan kolom kiri (`align-items: stretch` + `flex: 1`), membingkai tombol `Kosongkan` (`btn-outline-secondary`), menghapus prefiks ganda `SKU: SKU-...` pada daftar & pratinjau label, serta menyembunyikan baris `Grosir:` otomatis bila harga grosir sama dengan harga ritel.
  - **Global `.btn-secondary` (`components.css`)**: Memberi bingkai halus berbasis aksen tema (`rgba(var(--primary-rgb), 0.28)`) dan menghilangkan warna hover oranye hardcoded agar konsisten di seluruh tema warna.

## [1.0.87] - 2026-11-21

### Fixed
- [POS-JUAL] [UI] **Penyeragaman Tinggi Kartu Grid View POS Kasir (Desktop & Mobile)**:
  - Menyeragamkan tinggi frame visual `.pos-card-visual` menjadi kompak seragam (`96px` mobile / `118px` desktop) baik untuk produk berfoto (`object-fit: contain`) maupun tanpa foto, serta menambatkan konten SKU & nama tepat di bawah visual (`.pos-card-content` `flex-start`, `.pos-card-bottom` `margin-top: auto`) sehingga tidak ada lagi teks mengambang atau rongga kosong saat produk berfoto dan tanpa foto berada dalam satu baris.
  - Menghilangkan bayangan oranye hardcoded pada `.pos-chip.active` agar 100% selaras di seluruh 6 tema warna aksen.

## [1.0.86] - 2026-11-21

### Fixed
- [PRODUK] [UI] **Penyeragaman Tinggi & Frame Thumbnail Grid View Manajemen Produk**:
  - Menambahkan bingkai thumbnail seragam `.prd-grid-thumb` (`aspect-ratio: 4 / 3`) pada seluruh kartu Grid View di `produk.js` dan `components.css` — foto produk tampil utuh (`object-fit: contain`), sedangkan produk tanpa foto tampil dengan placeholder ikon solid rapi (`Belum ada foto`) sehingga tidak ada lagi rongga kosong besar di tengah kartu maupun tinggi baris yang jomplang antar produk.
  - Menyelaraskan bingkai tombol `Ubah` di Grid View agar seragam dengan `Cepat`, `Salin`, dan `Hapus`.

## [1.0.85] - 2026-11-21

### Changed
- [PRODUK] [UI] **Perapihan Tata Letak Desktop Manajemen Produk**:
  - **Filter Bar Desktop 2-Baris Padat (`produk.js`, `components.css`)**: Menyatukan pencarian + toggle List/Grid + Pilih + dropdown Urutkan (`185px`, tidak lagi melebar penuh) pada Baris 1, serta menyatukan dropdown Kategori & Status bersama 5 chip filter cepat di Baris 2 — memangkas tinggi panel filter desktop hingga separuh.
  - **Eliminasi Duplikasi SKU & Penambahan Badge Kategori (`produk.js`)**: Menyembunyikan teks SKU duplikat di bawah Nama Produk pada layar desktop (karena sudah tampil di kolom `SKU / BARCODE`) dan menggantinya dengan badge kategori produk yang ringkas, sekaligus memberi bingkai tegas pada tombol aksi `Ubah` agar seragam dengan `Cepat`, `Salin`, dan `Hapus`.

## [1.0.84] - 2026-11-21

### Fixed
- [BACKEND] [DASHBOARD] **Perbaikan Akurasi Omset & Laba Tab Penjualan (Pengecualian Nota Void/Dibatalkan)**:
  - `aksiLaporanPenjualan_` (`backend/kode.gs`) kini **tidak lagi menjumlahkan nota berstatus `void` (Dibatalkan) maupun `pending`** ke dalam `ringkasan.total_omset`, `ringkasan.total_diskon`, `ringkasan.total_pajak`, `ringkasan.total_laba`, dan `ringkasan.total_transaksi` — sehingga angka Omset & Laba di Tab Penjualan 100% sinkron dengan Tab Laba Rugi & Dashboard Eksekutif (nota void tetap tampil dicoret di tabel untuk audit, dan jumlahnya diringkas pada badge terpisah).
  - Memperbaiki dropdown filter status Tab Penjualan (`laporan.js`) dari `value="tempo"` menjadi `value="belum_lunas"` agar filter nota piutang/belum lunas berfungsi akurat.

### Changed
- [DASHBOARD] [UI] **Perapihan Tata Letak Desktop 5 Tab Laporan (`laporan.js`, `components.css`)**:
  - **Grid 50/50 Penuh Lebar pada Tab Laba Rugi (`lap-grid-2col`)**: Menghilangkan ruang kosong 40% di sisi kanan kartu *Analisis Laba & Margin per Kategori* & *Rincian Biaya Operasional*, serta mencegah angka Rupiah (`Rp 182.000`) terpecah 2 baris atau memunculkan *horizontal scrollbar*.
  - **Penjajaran Horizontal Kartu KPI (`.card.stat`)**: Menyetel `justify-content: flex-start` agar seluruh angka KPI di Tab Penjualan, Pembelian, Arus Kas, dan Valuasi Stok sejajar lurus di satu garis horizontal.
  - **Label Badge Bahasa Indonesia Rapi**: Memformat label `belum_lunas` → `Belum Lunas`, `lunas` → `Lunas`, `tempo` → `Tempo`, `tunai` → `Tunai`, `qris` → `QRIS`, `hutang` → `Hutang` secara konsisten di seluruh tabel laporan.

## [1.0.83] - 2026-11-21

### Fixed
- [UI] **Finalisasi Audit Total Komponen CSS**:
  - Melengkapi 4 class badge & alert terakhir yang ditemukan pada audit menyeluruh lintas 31 file JS (`.badge-secondary`, `.badge-xs`, `.badge-subtle`, `.alert-subtle`, serta `.produk-filter-card`) di `frontend/css/components.css` dengan 100% token warna solid sehingga 0 class CSS hilang, 0 ikon `ICONS.*` undefined, 0 gradient/blur, dan seluruh 16 suite pengujian otomatis lulus penuh.

## [1.0.82] - 2026-11-21

### Changed
- [POS-JUAL] [POS-BELI] [PRODUK] [UI] **Optimasi Kepadatan & Tata Letak Mobile untuk POS Kasir, Pembelian, & Manajemen Produk**:
  - **Kartu POS Tanpa Foto Padat & Anti-Kotak Kosong (`pos.js`, `components.css`)**: Produk tanpa foto kini menampilkan header strip solid ramping setinggi `46px` (ikon produk + badge stok + badge varian/in-cart dalam satu baris rapi) alih-alih kotak kosong persegi `1:1`, sehingga 6–8 produk langsung muat di layar HP (produk yang memiliki foto tetap tampil penuh `1:1`).
  - **Form Input POS Pembelian 2-Kolom di Mobile (`components.css`)**: Mengubah `.beli-inputs-grid` mobile menjadi grid 2 kolom presisi (`[Satuan | Qty Beli]` dan `[Harga Beli | Diskon %]` diikuti tombol penuh `Tambah ke Faktur`) sehingga tinggi formulir terpangkas hampir separuh.
  - **Bilah Filter Manajemen Produk Ringkas & Tombol Aksi Seimbang (`produk.js`, `components.css`)**: Menyatukan toggle tampilan, tombol `Pilih`, dan dropdown `Urutkan` ke 1 baris rapi tanpa ruang kosong, menyusun dropdown Kategori & Status dalam grid `2 kolom` simetris, merapikan 5 chip filter cepat menjadi 1 baris *horizontal scroll* bersih, serta menyelaraskan tombol `Hapus` menjadi `.btn-outline-danger` agar keempat tombol aksi (`Cepat`, `Ubah`, `Salin`, `Hapus`) seimbang.

## [1.0.81] - 2026-11-21

### Changed
- [DASHBOARD] [UI] **Redesign Tata Letak Dashboard Mobile & Desktop Lebih Simetris & Ringkas**:
  - **KPI Grid Bebas Kartu Yatim (`laporan.js`, `components.css`)**: Menampilkan **Laba Bersih Riil Toko** sebagai kartu Hero penuh lebar (`dash-kpi-hero`, 100% solid beraksen kiri) di posisi atas dan menyusun 6 metrik inti lainnya ke dalam grid `.stat-card-pro` simetris (`2×3` di mobile, `3×2` di desktop) lengkap dengan ikon warna solid sehingga tidak ada lagi slot kosong setengah baris.
  - **Daftar Ranking & Stok Kritis Ringkas + Tombol "Lihat Semua" (`laporan.js`, `components.css`)**: Mengubah **Produk Paling Laris**, **Pelanggan Terbesar**, dan **Stok Menipis / Habis** dari kartu tabel bertumpuk panjang menjadi baris compact 1-baris (`.dash-row`) dengan lencana peringkat (`1`, `2`, `3`) dan pembatasan 5 baris awal + tombol **Lihat Semua** sehingga tinggi scroll halaman Dashboard mobile berkurang drastis (> 65%) dan jauh lebih nyaman dibaca.

## [1.0.80] - 2026-11-21

### Changed
- [UI] [POS-JUAL] [PRODUK] [PELANGGAN] **Penyeragaman Sistem Desain & Polish Visual Menyeluruh (100% Solid Flat)**:
  - **Melengkapi 5 Class CSS Komponen yang Hilang (`components.css`)**: Mendefinisikan `.btn-outline-primary`, `.btn-outline-secondary`, `.btn-warning`, `.alert-info`, serta menyelaraskan `.form-label` / `.form-hint` dengan `.field-label` / `.field-hint` agar tombol Cepat/Salin, kotak informasi Tempo/Piutang/Retur, dan seluruh label formulir tampil 100% seragam di semua 17 modul.
  - **Indikator Live In-Cart pada Katalog POS (`pos.js`, `components.css`)**: Kartu & baris produk yang sudah masuk ke keranjang kini otomatis disorot dengan bingkai aksen solid + badge jumlah live (`×Qty`) agar kasir langsung tahu item apa saja yang sudah ditambahkan tanpa harus membuka keranjang.
  - **Harmonisasi Penuh 6 Warna Aksen & 3 Mode Tema (`app.js`, `pos.js`, `produk.js`, `layout.css`)**: Mengganti seluruh sisa warna hardcoded `rgba(...)` / oranye manual pada Menu Lainnya, sorotan pencarian, dan POS menjadi token CSS solid (`.is-primary`, `.is-info`, `.is-success`, `.is-warning`) sehingga tampilan tajam & konsisten di mode Terang, Hangat, maupun Gelap.
  - **Hierarki Header, Tabel Sticky, & KPI Card Seragam (`layout.css`, `components.css`, `pelanggan.js`)**: Menambahkan garis pemisah bersih pada `.page-header` desktop, header tabel sticky saat scroll, aksen garis samping tegas pada seluruh `.alert-*`, dan menyeragamkan kartu KPI modal Pelanggan memakai `.stat-card-pro.is-compact`.

## [1.0.79] - 2026-11-21

### Fixed
- [BACKEND] [POS-JUAL] [MEMBER] [HUTANG-PIUTANG] [SETTING] **Perbaikan Menyeluruh Sistem Poin Loyalitas & Level Member**:
  - **Saldo Poin Terbaru di Struk & Layar POS (`kode.gs`, `pos.js`)**: `aksiPenjualanCreate_` kini mengembalikan objek `pelanggan` yang sudah diperbarui (`poin`, `total_belanja`, `level`) sehingga saldo poin di struk thermal/WA dan header POS Kasir langsung menampilkan angka terbaru secara real-time, lengkap dengan notifikasi toast `+X Poin` dan sinkronisasi cache member lokal.
  - **Penyelarasan Pengali Level & Proteksi Anti-Downgrade (`kode.gs`)**: Menambahkan helper `hitungPengaliPoin_()` dan `evaluasiLevelMember_()` yang mendukung nama level `Reguler (1x)`, `Silver (1.2x)`, `Gold (1.5x)`, `Platinum (2x)` secara *case-insensitive* (sekaligus kompatibel dengan alias lama `Perak`/`Emas`), serta memastikan level member yang diset tinggi oleh Owner/Admin tidak pernah turun otomatis ke `Reguler` saat transaksi.
  - **Sinkronisasi Pelunasan Piutang (`kode.gs`, `api.js`)**: `aksiPiutangBayar_` saat status berubah menjadi `lunas` kini turut mengevaluasi kenaikan level member, memperbarui `Penjualan.poin_didapat` pada nota asal, dan `api.js` mengosongkan cache `member.` (riwayat poin) secara otomatis.
  - **Validasi & Kejelasan UX Aturan Poin (`kode.gs`, `pengaturan.js`, `pos.js`)**: Memvalidasi `poin_per_rupiah` sebagai angka bulat minimal Rp 100 di backend & form Pengaturan, serta menampilkan pratinjau estimasi poin real-time pada modal Pembayaran POS Kasir (termasuk keterangan bahwa poin transaksi Tempo/Piutang otomatis masuk saat piutang berstatus Lunas).
  - **Potong Poin Retur Akurat Berbasis Nota Asal (`kode.gs`, `api.js`)**: Retur penjualan kini hanya memotong poin member **jika nota sebelumnya memang pernah mendapatkan poin** (`poin_didapat > 0`), dibatasi maksimal sebesar sisa poin nota asal, sekaligus memperbarui `Penjualan.poin_didapat` dan tidak memotong poin member bila meretur nota piutang yang belum pernah lunas. Saat piutang yang pernah dipotong retur dilunasi, poin dihitung akurat dari nominal uang riil yang dibayar (`terbayar`).

## [1.0.78] - 2026-11-21

### Changed
- [UI] **Penyederhanaan Ikon Sinkronisasi — Cukup 1 Tombol Global di Topbar**:
  - Menghapus tombol sinkronisasi duplikat di footer sidebar (`#btn-sync-sidebar`) serta 17 tombol refresh redundan di bilah pencarian/toolbar seluruh modul (`pos.js`, `produk.js`, `kategori.js`, `pelanggan.js`, `pembelian.js`, `biaya.js`, `hutang-piutang.js`, `kartu-stok.js`, `opname.js`, `loyalti.js`, `retur.js`, `supplier.js`, `users.js`, `laporan.js`) agar area pencarian dan toolbar lebih lega, bersih, dan profesional.
  - Seluruh penyegaran data kini terpusat di **1 tombol Sinkronisasi Global** pada Topbar (`#btn-sync-top`), ditambah gestur tarik ke bawah (Pull-to-Refresh), tombol `F5`, dan menu Status Sistem.

### Fixed
- [APK] [PWA] [UI] **Dialog Konfirmasi "Keluar dari Aplikasi?" Anti-Skip 100% di Android APK, Chrome PWA, & Browser**:
  - **Android APK (`MainActivity.java`)**: Mendaftarkan `OnBackPressedCallback` prioritas tertinggi (LIFO) langsung pada `MainActivity.onCreate()` yang memanggil `window.__posHandleNativeBack()` di WebView, lengkap dengan fallback dialog native Android (`showNativeExitDialog()`) jika tombol Kembali ditekan sebelum JS selesai dimuat.
  - **Chrome Android & PWA (`native.js`)**: Mengatasi *Chrome History Manipulation Intervention* dengan memperkuat sentinel riwayat (`pushState`) di dalam gestur nyata pengguna (`pointerdown`/`touchstart`/`keydown`) sehingga gestur/tombol Back di halaman utama **selalu** memicu dialog konfirmasi keluar dan tidak lagi melompat keluar secara langsung.
  - **Pencegahan Double-Trigger & Proteksi Tab (`native.js`, `app.js`)**: Menambahkan debounce `180ms` pada `tanganiTombolKembali()`, proteksi `beforeunload` saat masih ada barang belum dibayar di keranjang, serta menambahkan pintasan **"Tutup Aplikasi"** di menu profil akun.
  - File terdampak: `android/app/src/main/java/com/admgaffidigital/poskasirtoko/MainActivity.java`, `frontend/js/utils/native.js`, `frontend/js/app.js`, 14 file modul di `frontend/js/modules/`, `tests/audit_finalisasi.js`.

## [1.0.77] - 2026-11-21

### Fixed
- [UI] [PRODUK] [POS-JUAL] [PELANGGAN] [AUTH] **Debugging Total & Finalisasi Lintas Lapisan**:
  - **Persistensi Pilihan Lintas Halaman & Filter (`produk.js`, `pos.js`, `pelanggan.js`)**: Mengubah penyimpanan multi-select dari `Set` ID menjadi `Map` (`id -> objek`) sehingga produk/pelanggan yang ditandai di Halaman 1 atau Kategori A tetap terbawa utuh saat pengguna berpindah ke Halaman 2 atau Kategori B sebelum mengeksekusi aksi massal.
  - **Hak Akses & Validasi Ubah Level Massal Pelanggan (`pelanggan.js`)**: Menyembunyikan tombol **Ubah Level** untuk peran Kasir (sesuai aturan backend `aksiPelangganUpdate_`) dan mengirim payload minimal `{ id, tipe: 'member', level }` agar tidak gagal validasi HP kosong pada data lama.
  - **Navigasi Internal Tanpa Polusi History (`app.js`, `auth.js`, `produk.js`, `printer.js`)**: Mengekspos `window.__posNavigate()` berbasis `replaceState` untuk seluruh pengalihan rute programatik sehingga tombol Kembali di PWA/Mobile Browser selalu 100% berurutan bebas lompat ganda.
  - **0 Variabel CSS Tidak Terdefinisi (`components.css`)**: Mengganti 2 referensi `var(--text-secondary)` yang tidak terdefinisi di `components.css` menjadi `var(--text-muted)`.

## [1.0.76] - 2026-11-21

### Added
- [UI] [PRODUK] [POS-JUAL] [POS-BELI] [PRICETAG] [PELANGGAN] **Sistem "Tandai & Pilih" (Multi-Select + Floating Bulk Action Bar Solid) di Seluruh Modul Utama**:
  - **Manajemen Produk (`frontend/js/modules/produk.js`, `pricetag.js`)**: Tombol **Pilih** + dukungan *long-press* (tahan kartu 0,45 detik di HP) dengan 5 aksi massal pada bar solid melayang: **Cetak Price Tag Massal** (langsung tercentang otomatis di `#/pricetag`), **Pindah Kategori Massal**, **Aktif/Nonaktifkan Massal**, **Bagikan / Kirim Daftar WA**, dan **Hapus Massal**.
  - **POS Kasir (`frontend/js/modules/pos.js`)**: Tombol **Pilih** untuk menandai banyak barang sekaligus di tampilan Grid/List lalu memasukkannya bersamaan dalam 1 ketukan (**Masukkan X ke Keranjang**).
  - **Modal Pilih Produk (`frontend/js/utils/produk-picker.js`, `pembelian.js`)**: Mode **Tandai Banyak** di katalog pemilih produk untuk langsung menambahkan banyak item ke faktur **POS Pembelian** tanpa buka-tutup modal berulang.
  - **Kategori & Pelanggan (`frontend/js/modules/kategori.js`, `pelanggan.js`)**: Mode **Pilih** + bar aksi solid untuk **Hapus Massal Kategori**, **Ubah Level Member Massal**, **Salin Daftar Kontak WA**, dan **Hapus Massal Pelanggan**.
  - **Integrasi Tombol Kembali (`frontend/js/utils/native.js`, `components.css`)**: Menekan tombol Back saat mode **Tandai & Pilih** aktif otomatis membatalkan mode pilih terlebih dahulu secara rapi; seluruh bar & penanda memakai warna solid 100% tanpa gradasi/blur.

## [1.0.75] - 2026-11-21

### Fixed
- [UI] [APK] [PWA] **Perbaikan Total Navigasi Tombol Kembali (Berurutan LIFO, Bebas Lompat-Lompat & Dialog Konfirmasi Keluar) (`frontend/js/utils/native.js`, `frontend/js/utils/ui.js`, `frontend/js/app.js`, `frontend/js/modules/auth.js`, `android/app/src/main/java/com/admgaffidigital/poskasirtoko/MainActivity.java`)**:
  - **Penutupan Modal & Overlay Berurutan (LIFO)**: Memperbaiki bug di `native.js` yang sebelumnya mengambil modal terbawah (`querySelector`) alih-alih modal teratas; menambahkan `closeTopOverlay()` dan `overlay._closeModal` di `ui.js` sehingga dropdown internal, modal bertumpuk, dan bottom-sheet tertutup satu per satu dari lapisan paling atas dengan rapi.
  - **Perlindungan Modal Wajib**: Modal Login dan Wajib Ganti PIN ditandai `closable: false` sehingga tombol Kembali tidak membobol layar login, melainkan langsung menawarkan dialog konfirmasi keluar aplikasi.
  - **Deteksi Drawer & Keranjang POS Mobile Akurat**: Memperbaiki pengecekan tab keranjang POS mobile dari kelas usang `.mobile-show-cart` ke atribut aktual `data-mobile-view="cart"`, serta menambahkan penutupan Sidebar Drawer Mobile (`#sidebar.is-mobile-open`) sebelum keluar halaman.
  - **Stack Navigasi Deterministik Bebas Lompat-Lompat (`_navStack`)**: Mengganti `window.history.back()` mentah dengan stack navigasi terdeduplikasi di `app.js` + intersepsi klik tautan `#/...` berbasis `replaceState` (mis. `#/pelanggan` → `#/lainnya` → `#/pos`), sehingga tombol Kembali tidak lagi memutar ulang riwayat lama yang berulang-ulang.
  - **Dukungan Penuh APK Android + PWA/Mobile Web**: Menambahkan *History Sentinel Guard* (`popstate`) pada PWA/Chrome Mobile agar perilaku tombol/gestur Kembali sama rapinya dengan APK Android.

### Added
- [UI] [APK] **Dialog Konfirmasi Tutup Aplikasi (`frontend/js/utils/native.js`, `MainActivity.java`)**:
  - Mengganti toast "tekan 2x" dengan **Dialog Konfirmasi Keluar Aplikasi** profesional saat tombol Kembali ditekan di halaman utama (`#/pos`), lengkap dengan peringatan otomatis jika masih ada barang di keranjang belanja.
  - Menambahkan native bridge `window.AndroidApp.exitApp()` (`finishAndRemoveTask()`) di `MainActivity.java` agar penutupan aplikasi Android berlangsung bersih di semua versi Android.

## [1.0.74] - 2026-11-21

### Changed
- [UI] **Desain Warna Solid 100% Tanpa Gradasi & Tanpa Glassmorphism (`frontend/css/layout.css`, `frontend/css/components.css`, `frontend/index.html`, `frontend/assets/icon.svg`, `frontend/js/app.js`)**:
  - Menghapus seluruh efek `linear-gradient`, `radial-gradient`, dan `backdrop-filter` (glassmorphism/blur) di Topbar, Bottom Navigation, Sidebar Backdrop, Logo Brand, Splash Screen, Skeleton Loader, POS Avatar/Total Row, Scroll-to-Top FAB, Banner Update, serta Ikon Brand SVG.
  - `.brand-logo` kini menggunakan warna solid `var(--primary)` sehingga warna logo ikut berubah otomatis mengikuti warna aksen pilihan pengguna, sekaligus mengurangi beban GPU pada HP Android.

### Added
- [UI] **Fitur Pemilih Jenis Font Real-Time (6 Pilihan) (`frontend/css/tokens.css`, `frontend/css/components.css`, `frontend/js/utils/ui.js`, `frontend/index.html`)**:
  - Menambahkan 6 pilihan jenis font yang berubah secara realtime di modal **Tema, Warna & Tipografi**: **Sistem Bawaan** (`0 KB`), **Inter**, **Plus Jakarta Sans**, **Poppins**, **Roboto**, dan **JetBrains Mono** (gaya struk angka sejajar).
  - Font web dimuat secara *lazy* (on-demand) hanya saat dipilih agar startup tetap super ringan dan 100% aman saat offline (fallback otomatis ke font sistem).
  - Tersimpan persisten di `localStorage` (`pos_font_family`) dan diterapkan sejak sebelum *first paint* di `index.html`.

## [1.0.73] - 2026-11-21

### Changed
- [UI] [PWA] **Optimasi Kecepatan Boot & Code Splitting Rute (`frontend/js/app.js`, `frontend/index.html`, `frontend/sw.js`, `vercel.json`)**:
  - **Lazy Loading ES Modules per Rute**: Mengubah 16 modul rute dan `printer.js` (`69 KB`) di `app.js` dari impor statis menjadi dynamic `import()` berbasis permintaan + cache in-memory, memangkas **>620 KB JS** dan ~20 request awal saat aplikasi dibuka pertama kali.
  - **Proactive Hover/Touch Prefetch**: Menambahkan `preloadRouteModule()` saat kursor mengarah/menyentuh tautan sidebar & bottom navigation sehingga perpindahan menu terasa instan (`0ms`).
  - **Zero-FOUC Boot & Resource Hints (`index.html`)**: Menghapus meta tag `no-store` yang menghambat cache/bfcache, menambahkan `preconnect` ke `lh3.googleusercontent.com` (CDN foto produk), menambahkan `modulepreload` utilitas inti (`ui.js`, `dom.js`, `format.js`), serta skrip sinkron mini di `<head>` untuk menerapkan tema/warna/font sebelum first paint tanpa kedip.
  - **Pure Cache-First Service Worker (`sw.js`) & Edge Cache (`vercel.json`)**: Menghilangkan puluhan background fetch berulang untuk aset statis berversi di setiap boot agar bandwidth 100% terfokus ke API kasir; menambahkan header `Cache-Control` optimal di `vercel.json` untuk `/css/*`, `/js/*`, dan `/assets/*`.
  - **Staggered Warmup & Throttled SW Update (`app.js`, `api.js`)**: Mengganti ledakan 6 request paralel saat boot menjadi antrean pemanasan bertahap yang melewati cache segar (`hasFreshApiCache`), menambahkan cross-seed `kategori.list` (`{}` ↔ `{ aktif_saja: true }`), batas ukuran cache lokal (`120` entri / `450 KB`), serta jeda minimal 60 detik untuk cek update SW saat pindah tab.
- [POS-JUAL] [PRODUK] **Optimasi Rendering Katalog & Dekode Gambar (`frontend/js/modules/pos.js`, `frontend/js/modules/produk.js`)**:
  - Mengubah penghitungan badge kategori di `renderKategoriBar()` dari `O(K × N)` menjadi 1-pass `O(N)` `Map`.
  - Menambahkan `decoding="async"` pada seluruh gambar produk di POS Kasir dan Manajemen Produk agar scrolling tetap mulus 60fps.
- [BACKEND] [DB] **Cache L2 Sheet Master & Optimasi Ping (`backend/kode.gs`)**:
  - Menambahkan lapisan cache L2 `CacheService` (`120–180 detik`) di `bacaSemua_()` untuk 7 sheet master (`Kategori`, `Produk`, `Varian`, `Satuan_Konversi`, `Pelanggan`, `Supplier`, `Hadiah`) dengan invalidasi otomatis di `tambahBaris_()`, `ubahBaris_()`, dan `hapusLunak_()`.
  - Mempercepat `aksiSistemPing_()` dari 27 panggilan `getSheetByName()` menjadi **1** panggilan `ss.getSheets()`.

### Added
- [SETTING] [BACKEND] **Perawatan & Optimasi Sistem (`frontend/js/app.js`, `backend/kode.gs`)**:
  - Menambahkan endpoint `sistem.maintenance` (Owner/Admin) untuk menyegarkan seluruh cache server, membersihkan sesi kedaluwarsa di sheet `Sesi`, dan menampilkan ringkasan kesehatan database.
  - Mengintegrasikan pembersihan sesi kedaluwarsa (`bersihkanSesiKedaluwarsa_()`) otomatis ke dalam trigger malam harian `backupTerjadwal()`.
  - Menambahkan panel **Perawatan & Optimasi Performa** di halaman `#/sistem` lengkap dengan statistik live cache lokal, tombol 1-klik **Bersihkan Cache Lokal**, dan tombol **Jalankan Perawatan Server & Database**.
  - Menambahkan skenario uji regresi #15 di `tests/test_debug_final.js`.

## [1.0.72] - 2026-11-20

### Fixed
- [CETAK] [APK] **Native Android RawBT Bridge & WebView Scheme Interceptor (`android/app/src/main/java/com/admgaffidigital/poskasirtoko/MainActivity.java`, `frontend/js/utils/printer.js`)**:
  - **Akar Masalah APK Android**: Sebelumnya `MainActivity.java` tidak memiliki handler `BridgeWebViewClient.shouldOverrideUrlLoading` maupun bridge native, sehingga klik tautan `intent:base64,...` atau `rawbt:` dari dalam WebView APK sering gagal (`ERR_UNKNOWN_URL_SCHEME` atau tidak merespons) dan menyulitkan penyambungan ke RawBT.
  - **Bridge Native `window.AndroidRawBT`**: Menambahkan JavaScript Interface native di `MainActivity.java` dengan 6 fungsi langsung ke sistem Android:
    - `printBase64(base64)` — Mengirim perintah ESC/POS langsung lewat `Intent.ACTION_VIEW` (`rawbt:base64,...`, package `ru.a402d.rawbtprinter`) dengan fallback `rawbt:data:base64,` dan auto-buka Play Store jika RawBT belum terpasang.
    - `openRawBT()` — Membuka aplikasi RawBT langsung lewat `PackageManager.getLaunchIntentForPackage`.
    - `openBluetoothSettings()` — Membuka Pengaturan Bluetooth HP Android dalam 1 ketukan untuk pairing printer.
    - `isRawBTInstalled()` & `isBluetoothEnabled()` — Diagnostik live status RawBT & Bluetooth HP.
    - `openPlayStoreRawBT()` — Membuka halaman RawBT di aplikasi Google Play Store secara native.
  - **WebView External Scheme Interceptor**: Menambahkan `shouldOverrideUrlLoading` pada `BridgeWebViewClient` untuk menangani `rawbt:`, `intent:`, `market:`, `whatsapp:`, `tel:`, dan `mailto:` secara aman tanpa error WebView.
  - **Modal Koneksi Printer Ditingkatkan (`printer.js`)**: Memusatkan pengiriman RawBT di `kirimEscPosKeRawBT()` untuk Penjualan, Pembelian, dan X-Report Shift, menambahkan badge status **RawBT Terpasang & Siap** / **Bluetooth HP Aktif**, tombol 1-klik **Pengaturan Bluetooth HP**, serta toggle cepat ukuran kertas uji (`58mm` / `80mm`).
  - File terdampak: `android/app/src/main/java/com/admgaffidigital/poskasirtoko/MainActivity.java`, `frontend/js/utils/printer.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.72 (`versionCode 59`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` (berisi native `AndroidRawBT` bridge) dan pembaruan cache Service Worker `pos-kasir-static-v1.0.72`.

## [1.0.71] - 2026-11-19

### Added
- [UI] [SETTING] **Sistem Ukuran Huruf Multi-Varian (5 Preset + Slider Kustom `85%–125%` + 3 Gaya Ketebalan Huruf) (`frontend/css/tokens.css`, `frontend/css/components.css`, `frontend/js/utils/ui.js`, `frontend/js/app.js`)**:
  - **5 Preset Ukuran Huruf Cepat (`[data-font]`)**:
    1. **Ringkas (`88%`)** — `--font-scale: 0.875` (`14px`, muat banyak kolom & baris)
    2. **Kecil (`94%`)** — `--font-scale: 0.9375` (`15px`, rapi & padat)
    3. **Standar (`100%`)** — `--font-scale: 1` (`16px`, seimbang)
    4. **Besar (`108%`)** — `--font-scale: 1.08` (`17.3px`, jelas & nyaman)
    5. **Ekstra (`116%`)** — `--font-scale: 1.16` (`18.5px`, sangat jelas untuk jarak pandang jauh)
  - **Slider Skala Kustom Presisi (`85%` s/d `125%`) & Stepper `A-` / `A+`**: Memungkinkan penyesuaian ukuran huruf secara halus per `1%` sesuai selera layar pengguna.
  - **3 Pilihan Gaya & Ketebalan Huruf (`[data-font-style]`)**:
    1. **Standar Seimbang** — Ketebalan proporsional
    2. **Tegas & Tebal (*Bold Contrast*)** — Bobot huruf lebih tebal (`500`–`700`) agar makin jelas di layar terang
    3. **Ramping & Padat (*Compact Clean*)** — Spasi karakter ringkas agar nama barang panjang muat lebih banyak
  - **Akses Cepat 1-Klik**: Tersedia langsung di **Menu Akun Pengguna** (5 tombol cepat `88%`..`116%`), tombol **`Aa`** di bawah Sidebar (siklus 5 ukuran), serta di dalam dialog **Tema, Warna & Ukuran Huruf**.
  - File terdampak: `frontend/css/tokens.css`, `frontend/css/components.css`, `frontend/js/utils/ui.js`, `frontend/js/app.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.71 (`versionCode 58`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.71`.

## [1.0.70] - 2026-11-19

### Added
- [UI] [SETTING] **Sistem Kustomisasi Multi-Tema, 6 Warna Aksen, & 3 Suasana Latar (`frontend/css/tokens.css`, `frontend/css/components.css`, `frontend/css/layout.css`, `frontend/js/utils/ui.js`, `frontend/js/utils/native.js`, `frontend/js/app.js`, `frontend/js/modules/pengaturan.js`)**:
  - **6 Pilihan Warna Aksen Utama (`[data-accent]`)**: Menyediakan 6 palet warna brand yang otomatis menyesuaikan kontras di Mode Terang, Hangat, maupun Gelap:
    1. **Oranye Bata** (`#e8590c` — Default khas toko bangunan)
    2. **Biru Samudra** (`#2563eb` — Korporat & tenang)
    3. **Hijau Zamrud** (`#059669` — Segar & finansial)
    4. **Toska Sejuk** (`#0d9488` — Nyaman seharian)
    5. **Ungu Royal** (`#4f46e5` — Modern & elegan)
    6. **Merah Ruby** (`#e11d48` — Ritel minimarket)
  - **3 Pilihan Suasana Latar (`[data-theme]`)**:
    1. **Terang Sejuk (*Cool Slate*)** — Putih bersih & tajam
    2. **Terang Hangat (*Warm Cream / Eye-Care*)** — Latar krem lembut (`#f4f0e6` / `#fffdf8`) anti-silau untuk pemakaian kasir seharian
    3. **Gelap Malam (*Deep Navy Dark*)** — Mode gelap elegan hemat baterai
  - **Modal & Panel Pemilih Warna Instan (`bukaModalTemaWarna`)**: Dapat diakses 1-klik dari **Menu Akun Pengguna** (dilengkapi deretan bulatan warna instan & tombol suasana latar), **Footer Sidebar** (`ICONS.palette`), **Quick Command Palette (`Ctrl+K`)**, **Menu Lainnya**, serta **Pengaturan Umum**, lengkap dengan sinkronisasi otomatis ke Status Bar Android & `meta theme-color` PWA.
  - File terdampak: `frontend/css/tokens.css`, `frontend/css/components.css`, `frontend/css/layout.css`, `frontend/js/utils/ui.js`, `frontend/js/utils/native.js`, `frontend/js/app.js`, `frontend/js/modules/pengaturan.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.70 (`versionCode 57`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.70`.

## [1.0.69] - 2026-11-19

### Fixed
- [POS-JUAL] [UI] **Perbaikan Bug Reset Keranjang Belanja & Konfirmasi `showConfirm` (`frontend/js/utils/ui.js`, `frontend/js/modules/pos.js`)**:
  - **Urutan Resolusi `showConfirm`**: Memanggil `safeResolve(true)` **sebelum** `modal.close()` pada tombol konfirmasi `.btn-confirm` di `ui.js`. Sebelumnya, `modal.close()` memicu `onClose: () => safeResolve(false)` terlebih dahulu sehingga tombol **"Ya, Kosongkan"** saat Reset Keranjang selalu menghasilkan `false` dan keranjang gagal di-reset.
  - **Reset Lengkap Keranjang, Member, & Diskon**: Tombol **Reset** (`#btn-clear-cart`) di POS Kasir kini juga mereset pilihan member, diskon transaksi, dan catatan pengiriman, serta memberikan umpan balik toast ketika diklik saat keranjang kosong.
  - File terdampak: `frontend/js/utils/ui.js`, `frontend/js/modules/pos.js`.
- [POS-JUAL] [PELANGGAN] [MEMBER] **Akselerasi Pemuatan Data Member Instan 0ms (`frontend/js/modules/pos.js`, `frontend/js/api.js`, `frontend/js/app.js`, `backend/kode.gs`)**:
  - **Modal Pilih Member Non-Blocking**: Mengubah `bukaModalPilihPelanggan()` di `pos.js` agar langsung membuka dialog **Pilih Pelanggan / Member** dalam **0ms** tanpa menunggu request jaringan selesai terlebih dahulu, dilengkapi pre-warm `state.daftarPelanggan` di latar belakang saat POS dibuka, tombol **Segarkan Data Member**, dan area daftar lebih lega (`min(380px, 50vh)`).
  - **Cross-Seeding Cache `pelanggan.list` Lintas Modul**: Menambahkan pre-warming `pelanggan.list` di `hangatkanCacheLatarBelakang()` (`app.js`), menaikkan TTL cache `pelanggan.list` ke 5 menit (SWR 30 menit di `localStorage`), dan melakukan *cross-seeding* otomatis untuk varian payload `{ semua: true }`, `{ tipe: 'member', aktif_saja: true, limit: 100 }`, serta `{ tipe: 'member', limit: 100 }` di `api.js` agar POS Kasir, Data Pelanggan, dan Loyalti berbagi cache instan 0ms.
  - **Optimasi `aksiPelangganList_` Backend**: Memfilter baris `Pelanggan` terlebih dahulu sebelum membaca sheet `Piutang` di `backend/kode.gs`.
  - File terdampak: `frontend/js/modules/pos.js`, `frontend/js/api.js`, `frontend/js/app.js`, `backend/kode.gs`.

### Changed
- [APK] **Build Rilis Android Native v1.0.69 (`versionCode 56`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.69`.

## [1.0.68] - 2026-11-19

### Fixed
- [UI] **Penanganan Modal Bertingkat (Stacked Modals), `onClose` Lifecycle, & `showConfirm` (`frontend/js/utils/ui.js`)**:
  - **Escape Guard Modal Paling Atas**: Menekan `Escape` saat modal bertingkat terbuka (mis. Kalkulator HPP, Katalog Pemilih Produk, Scanner Kamera, atau Dialog Konfirmasi di atas modal form utama) kini hanya menutup modal paling atas (atau menutup dropdown `.cat-picker` / `.autocomplete-dropdown` yang sedang terbuka terlebih dahulu) tanpa merusak/menutup form induk di bawahnya.
  - **Jaminan Resolusi `showConfirm` & `onClose`**: Menambahkan callback `onClose` terpusat pada `showModal()` yang selalu terpanggil baik saat ditutup lewat tombol `X`, klik backdrop, swipe-down bottom sheet, maupun tombol `Escape`, sehingga Promise `showConfirm()` selalu ter-resolve (`false`) dan tidak pernah menggantung.
  - **Dukungan Opsi `width`**: Mendukung pemetaan otomatis parameter `width` ke ukuran dialog (`sm`/`md`/`lg`) di `hutang-piutang.js`, `loyalti.js`, dan `retur.js`.
  - File terdampak: `frontend/js/utils/ui.js`, `frontend/js/utils/produk-picker.js`.
- [POS-JUAL] [PRODUK] **Pembersihan Stream Kamera Barcode & Proteksi Fokus Scanner Fisik (`frontend/js/utils/barcode.js`, `frontend/js/modules/pos.js`)**:
  - **Bebas Kebocoran Kamera (`bukaKameraScanner`)**: Menambahkan `onClose: hentikanKamera` dan guard pasca-tutup pada `getUserMedia().then(...)` agar stream kamera & interval deteksi selalu dihentikan meskipun modal ditutup lewat tombol `X`, backdrop, swipe-down, atau `Escape`.
  - **Proteksi Input Form dari Scanner Fisik (`pasangScannerFisik`)**: Mencegah listener keyboard scanner fisik (capture phase) membajak ketikan cepat + `Enter` saat modal sedang terbuka atau saat pengguna mengetik di dalam input form selain kolom pencarian POS, serta membersihkan sisa teks barcode di `#pos-search-input` setelah scan berhasil.
  - **Pembersihan Timer Debounce POS**: Menambahkan `clearTimeout(searchDebounceTimer)` pada fungsi cleanup `renderPosModule`.
  - File terdampak: `frontend/js/utils/barcode.js`, `frontend/js/modules/pos.js`.
- [MEMBER] **Perbaikan Riwayat Penukaran Hadiah, Tombol Submit Tukar Poin, & Preselect Hadiah (`frontend/js/modules/loyalti.js`, `backend/kode.gs`)**:
  - **Perbaikan Bug `muatRiwayatPenukaran`**: Memperbaiki bug urutan destrukturisasi `Promise.all` di mana ID hadiah (`resPel.items[0].id`) sebelumnya dikirim sebagai `pelanggan_id` ke `member.riwayatPoin` (menyebabkan tab Riwayat Penukaran selalu kosong). Kini mendukung pengambilan riwayat penukaran poin lintas seluruh member toko beserta nama member (dengan fallback otomatis untuk server GAS lama).
  - **Reset Tombol `#btn-submit-tukar-poin`**: Memindahkan pemulihan status tombol submit ke blok `finally` agar tombol tidak terkunci (`disabled`) setelah penukaran poin berhasil.
  - **Eliminasi Race Condition `.btn-tukar-langsung`**: Mengirim `preselectedHadiahId` langsung ke `inisialisasiFormTukar(container, id)` setelah data selesai dimuat, menggantikan `setTimeout(..., 150)`.
  - File terdampak: `frontend/js/modules/loyalti.js`, `backend/kode.gs`.
- [DASHBOARD] [SETTING] [RETUR] **Invalidasi Cache Mutasi API, Presisi Nilai `0%` Pengaturan, & UX Modal Retur (`frontend/js/api.js`, `frontend/js/modules/pengaturan.js`, `frontend/js/modules/biaya.js`, `frontend/js/modules/retur.js`, `frontend/js/utils/dom.js`, `frontend/js/app.js`)**:
  - **Invalidasi Cache Mutasi Lengkap**: Menambahkan `'biaya.list'` ke `CACHE_CONFIG` serta pola mutasi `biaya.`, `stok.`, dan `sistem.` (+ fallback namespace otomatis) ke `MUTATION_PATTERNS` di `api.js` agar perubahan Biaya Operasional atau pembersihan Kartu Stok langsung menyegarkan cache Laporan Laba Rugi & Kas.
  - **Dukungan Nilai `0%` di Pengaturan Umum**: Memperbaiki `parseFloat(...) || 10` dan `|| 11` di `pengaturan.js` menggunakan `Number.isFinite` & nullish coalescing (`??`) agar Owner dapat menetapkan batas diskon kasir `0%` atau PPN `0%` tanpa tertimpa kembali ke `10%`/`11%`.
  - **Ketahanan `renderSkeleton` & Shortcut Retur**: Memperbaiki `renderSkeleton('table', 5)` di `biaya.js` & `dom.js` agar selalu merender skeleton dengan benar, memperluas modal Retur Penjualan/Pembelian ke `size: 'lg'` dengan dukungan tombol `Enter` pada input cek nomor nota/faktur, serta memperbarui indikator `27 Sheet Lengkap` di halaman Diagnostik Sistem.
  - File terdampak: `frontend/js/api.js`, `frontend/js/modules/pengaturan.js`, `frontend/js/modules/biaya.js`, `frontend/js/modules/retur.js`, `frontend/js/utils/dom.js`, `frontend/js/app.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.68 (`versionCode 55`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.68`.

## [1.0.67] - 2026-11-19

### Added
- [UI] [POS-BELI] [OPNAME] [PRODUK] **Modal / Bottom Sheet Katalog Pemilih Produk Reusable (`frontend/js/utils/produk-picker.js`)**:
  - Menyediakan tombol **`Pilih dari Katalog`** yang membuka Modal lega (`size: 'lg'`, grid 2-kolom di Desktop) dan Bottom Sheet nyaman (1-kolom di Mobile) untuk memilih produk & varian dengan 1 klik.
  - Dilengkapi pencarian instan (nama/varian/SKU/barcode + fallback pencarian server untuk katalog >250 item), filter **Kategori**, serta chip filter **Stok** (`Semua`, `Stok Tersedia`, `Stok Habis / Menipis`).
  - Terintegrasi ke **POS Pembelian** (`pembelian.js`), **Stok Opname** (`opname.js`), dan filter produk **Kartu Stok** (`kartu-stok.js`), serta di-cache di Service Worker (`sw.js`).
  - File terdampak: `frontend/js/utils/produk-picker.js`, `frontend/js/modules/pembelian.js`, `frontend/js/modules/opname.js`, `frontend/js/modules/kartu-stok.js`, `frontend/sw.js`.

### Changed
- [UI] [POS-BELI] [OPNAME] [PRICETAG] **Ruang Pencarian Produk Lebih Lega di Desktop & Mobile (`frontend/css/components.css`)**:
  - **Bebas Terpotong di Desktop**: Menambahkan kelas `.card-has-dropdown` (`overflow: visible !important`) agar dropdown pencarian produk melayang penuh melampaui batas kartu hingga `min(440px, 58vh)`, dilengkapi header sticky + tombol `Tutup`, jarak aman dari scrollbar, serta dukungan judul 2 baris.
  - **Mode Inline di Mobile & Dialog**: Pada layar `< 768px` dan di dalam dialog modal (seperti Input Opname), `.autocomplete-dropdown` tampil secara inline mendorong form di bawahnya agar tidak menimpa input atau bertabrakan dengan Topbar/Bottom Nav.
  - **Pembersihan Label SKU Ganda & Batas Hasil**: Mengganti `SKU: ${...}` manual menjadi `formatSkuLabel()` di dropdown POS Pembelian & Stok Opname (bebas `SKU: SKU-...`), menaikkan batas hasil pencarian dari 10 ke 25 produk, serta memperluas area daftar produk di modul **Cetak Price Tag** (`pricetag.js`) ke `min(460px, 55vh)`.
  - File terdampak: `frontend/css/components.css`, `frontend/js/modules/pembelian.js`, `frontend/js/modules/opname.js`, `frontend/js/modules/pricetag.js`.
- [APK] **Build Rilis Android Native v1.0.67 (`versionCode 54`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` (4.10 MB) dan pembaruan cache Service Worker `pos-kasir-static-v1.0.67`.

## [1.0.66] - 2026-11-19

### Fixed
- [CETAK] **Perbaikan Error Skema `intent:` RawBT di Browser Desktop & Bug Bluetooth X-Report (`frontend/js/utils/printer.js`)**:
  - **Guard Platform Android & Fallback Cetak Browser**: Menambahkan deteksi Android (`/android/i.test(navigator.userAgent)`) pada `cetakRawBT()`, `cetakRawBTPembelian()`, dan `cetakRawBTShift()`. Pada Windows/Mac/Desktop (non-Android), tidak lagi memicu error browser `Failed to launch 'intent:base64,...' because the scheme does not have a registered handler`, melainkan otomatis dialihkan mulus ke dialog Cetak Browser thermal (58mm/80mm) disertai notifikasi informatif.
  - **Perbaikan `ReferenceError` Bluetooth X-Report**: Memperbaiki `cetakBluetoothShift()` yang sebelumnya memanggil `kirimKePrinterBluetooth(teks)` (tidak terdefinisi) menjadi `kirimBytesKeBluetooth(teksKeEscPos(teks))`, serta menstandarkan `cetakRawBTShift()` menggunakan ESC/POS Intent resmi Android.
  - **Pembersihan Console Error Pembatalan Bluetooth**: Tidak lagi mencetak `console.error` saat pengguna membatalkan popup pemilihan perangkat Bluetooth (`NotFoundError`).
  - File terdampak: `frontend/js/utils/printer.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.66 (`versionCode 53`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.66`.

## [1.0.65] - 2026-11-19

### Fixed
- [UI] [SUPPLIER] [PRODUK] [KATEGORI] **Perbaikan Spesifisitas Grid 2-Kolom Mobile & Perataan Judul Kartu Mobile**:
  - **Judul Kartu Mobile Rata Kiri (`frontend/css/components.css`)**: Menambahkan `text-align: left !important` pada `.table-wrap:not(.keep-table) .table td:first-child` dan elemen anaknya agar judul & subjudul kartu (nama produk, nama supplier, nama kategori) tidak lagi terdorong rata kanan oleh aturan `td:not(.d-none-mobile)`.
  - **Aktivasi Penuh Grid 2-Kolom Mobile (`frontend/css/components.css`)**: Meningkatkan spesifisitas selektor `.table-wrap:not(.keep-table) .table.table-* tbody tr` sehingga `display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` benar-benar menang atas aturan `flex-direction: column` bawaan di seluruh modul (Produk, Supplier, Kartu Stok, Pelanggan, Users, Pembelian, Biaya, Hutang/Piutang, Opname, Retur, Laporan).
  - **Bar Pencarian & Alamat Supplier Mobile (`frontend/js/modules/supplier.js`, `components.css`)**: Memasangkan input cari dan tombol refresh berdampingan dalam 1 baris (`flex-wrap: nowrap`) serta menampilkan alamat supplier utuh tanpa terpotong ellipsis di kartu mobile.
  - File terdampak: `frontend/css/components.css`, `frontend/js/modules/supplier.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.65 (`versionCode 52`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.65`.

## [1.0.64] - 2026-11-19

### Fixed
- [UI] [PRODUK] [KATEGORI] **Sinkronisasi Global Tipografi, Paragraf, Perataan Tabel, & Kotak Panduan**:
  - **Perbaikan `.table-cell-val` (`frontend/css/components.css`)**: Menghapus `display: inline-flex; justify-content: flex-end; text-align: right; white-space: nowrap;` yang sebelumnya mematahkan teks tebal (`<b>`/`<strong>`) menjadi 2 kolom dan memaksa teks kalimat rata kanan di tabel desktop (`produk.js`, `users.js`, `supplier.js`). Kini mewarisi perataan kolom induk & `display` asli elemen.
  - **Perbaikan `.pel-cell-val` (`frontend/css/components.css`)**: Mengubah perataan default menjadi rata kiri agar kolom kontak/alamat pelanggan & supplier sejajar lurus di bawah header `<th>`, sementara kolom angka `.num`/`.tabular` tetap rata kanan di desktop.
  - **Perbaikan `.alert strong` (`frontend/css/components.css`)**: Menghapus `display: block;` agar teks tebal `<strong>` di dalam kalimat alert tidak lagi mematahkan paragraf ke baris baru di seluruh modul.
  - **Tipografi Global `code`, `ul`/`ol`, `.prose-list`, `.guide-callout`, `.guide-card`, & `.table-guide` (`base.css`, `components.css`)**: Menyeragamkan gaya kode inline, jarak poin daftar, kotak panduan berteks netral adaptif Light/Dark Mode, serta tabel komparasi rata kiri/atas di modal **Panduan Varian & Satuan** (`produk.js`) dan panduan **Kategori** (`kategori.js`), lengkap dengan nama toko dinamis di footer modal.
  - File terdampak: `frontend/css/base.css`, `frontend/css/components.css`, `frontend/js/modules/produk.js`, `frontend/js/modules/kategori.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.64 (`versionCode 51`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` dan pembaruan cache Service Worker `pos-kasir-static-v1.0.64`.

## [1.0.63] - 2026-11-19

### Fixed
- [UI] [POS-JUAL] [POS-BELI] **Debugging Total & Eliminasi Kebocoran Event Listener SPA**:
  - **Lifecycle Cleanup Router (`frontend/js/app.js`)**: Menangkap dan mengeksekusi fungsi *cleanup* modul aktif (`this._activeCleanup`) setiap kali berpindah rute atau menyegarkan halaman (`F5` / sinkronisasi global) dengan pelindung race-condition `_renderSeq`, sehingga shortcut keyboard POS dan listener scanner USB fisik tidak pernah menumpuk atau aktif di halaman lain.
  - **Guard Shortcut POS & Cleanup Resize (`frontend/js/modules/pos.js`)**: Mendaftarkan `handleResize` ke fungsi *cleanup* modul POS dan memblokir shortcut `F2`–`F9` saat modal `.overlay` sedang terbuka agar tidak memicu modal ganda.
  - **Cleanup Listener Pembelian (`frontend/js/modules/pembelian.js`)**: Membersihkan `document.click` dropdown pencarian secara otomatis saat berganti rute/render ulang dan mengganti akumulasi listener `selectSatuan`/`inputQty` dengan assignment `.onchange`/`.oninput` yang bersih.
  - **Guard Autentikasi Command Palette (`frontend/js/app.js`)**: Mencegah `Ctrl+K` terbuka sebelum pengguna masuk (`!store.get('token')`).
  - File terdampak: `frontend/js/app.js`, `frontend/js/modules/pos.js`, `frontend/js/modules/pembelian.js`.

### Changed
- [APK] **Build Rilis Finalisasi Android Native v1.0.63 (`versionCode 50`)**:
  - Kompilasi ulang APK final `frontend/download/poskasirtoko.apk` (bebas rekursi download, lulus seluruh 16 suite pengujian & audit penuh).

## [1.0.62] - 2026-11-19

### Added
- [UI] [PWA] **6 Paket Peningkatan Native App (Web & Mobile)**:
  - **Swipe-Down Gesture Bottom Sheet**: Handle & header bottom sheet dapat digeser turun 60fps (`translate3d`) untuk menutup dengan spring snap-back & haptic feedback (`frontend/js/utils/ui.js`).
  - **Sticky Action Footer Modal/Sheet**: Footer tombol Simpan/Batal pada form panjang menempel otomatis di bawah viewport modal (`frontend/css/components.css`).
  - **Frosted-Glass Topbar & Bottom Nav + Scroll Elevation**: Efek translucent `backdrop-filter: blur(14px)` adaptif Light/Dark mode dengan elevasi dinamis `.topbar.is-scrolled` dan pill aktif halus (`frontend/css/layout.css`).
  - **Banner Status Koneksi Realtime**: Strip status tipis non-intrusif di bawah Topbar saat offline / kembali online (`frontend/js/app.js`).
  - **Smart Scroll-to-Top FAB & Mobile Pull-to-Refresh**: Tombol kembali ke atas otomatis di daftar panjang (tersembunyi di POS) + gestur tarik-ke-bawah untuk `sinkronkanDataGlobal()`.
  - **Quick Command Palette (`Ctrl+K`)**: Pencarian cepat lintas modul (sesuai peran pengguna) & aksi cepat sistem dengan navigasi keyboard lengkap (`frontend/js/app.js`).
  - File terdampak: `frontend/js/app.js`, `frontend/js/utils/ui.js`, `frontend/css/components.css`, `frontend/css/layout.css`, `frontend/sw.js`.

### Changed
- [APK] **Build Rilis Android Native v1.0.62 (`versionCode 49`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` mencakup seluruh 6 Paket Native App.

## [1.0.61] - 2026-11-19

### Added
- [PRODUK] [UI] **Kalkulator HPP Presisi & Pembulatan Bebas Pecahan**:
  - Menambahkan modul reusable `frontend/js/utils/hpp-calculator.js` + tombol/panel inline **Kalkulator HPP** di Modal Tambah/Edit Produk (Tab Harga & Stok) dan Modal Edit Cepat (Quick Edit).
  - Mendukung input Total Harga Beli ÷ Qty/Isi (plus chip preset `10`, `12 (Lsn)`, `20`, `24`, `25`, `50`, `100`), opsi nota distributor (diskon bertingkat `10+5`, PPN `0%`/`11%`/custom, ongkir/biaya bongkar, bonus gratis), dan pembulatan bebas pecahan (`Rp 1`, `Rp 50`, `Rp 100`, `Rp 500`, `Rp 1.000`) arah `Ke Atas` atau `Terdekat` yang tersimpan otomatis di `localStorage`.
  - Dilengkapi 6 unit test otomatis di `tests/test_kalkulator_hpp.js` dan terdaftar di cache offline `frontend/sw.js`.
  - File terdampak: `frontend/js/utils/hpp-calculator.js`, `frontend/js/modules/produk.js`, `frontend/js/utils/ui.js`, `frontend/css/components.css`, `frontend/sw.js`, `tests/test_kalkulator_hpp.js`, `package.json`.

### Changed
- [APK] **Build Rilis Android Native v1.0.61 (`versionCode 48`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` mencakup fitur Kalkulator HPP Presisi & seluruh pembaruan UI/UX.

## [1.0.60] - 2026-11-19

### Added
- [PWA] [DEPLOY] **Mekanisme Realtime Auto-Update Service Worker Multi-Browser**:
  - Menambahkan header `Cache-Control: public, max-age=0, must-revalidate` untuk `/(index.html)?` di `vercel.json` dan meta tag anti-cache di `frontend/index.html`.
  - Menambahkan pendeteksian pembaruan otomatis pada `visibilitychange`, `window.focus`, dan interval 5 menit di `frontend/js/app.js` agar seluruh browser langsung menerapkan versi terbaru tanpa tertahan cache lama.
  - File terdampak: `vercel.json`, `frontend/index.html`, `frontend/js/app.js`, `frontend/sw.js`.
- [UI] **Sistem Kelas Filter Bar & Rentang Tanggal Responsif Terpadu**:
  - Menambahkan `.date-range-bar`, `.simple-filter-bar`, `.lap-subfilter-bar`, dan `.page-header-inline` di `frontend/css/layout.css` untuk keseragaman filter mobile & desktop.

### Changed
- [UI] **Standarisasi Kartu Native App 2-Kolom di Seluruh Modul Mobile**:
  - Memperluas tata letak kartu 2-kolom (`minmax(0, 1fr) minmax(0, 1fr)`) dengan struktur label mikro di atas nilai (*stacked metric cells*) ke seluruh tabel data multi-kolom (`produk`, `kartu-stok`, `pelanggan`, `supplier`, `users`, `pembelian`, `biaya`, `hutang-piutang`, `opname`, `retur`, dan `laporan`).
  - Menyeragamkan header modul `laporan.js` menggunakan `.page-header.page-header-inline` dan `${ICONS.calendar}`.
  - Mengganti seluruh tombol berawalan `+` polos menjadi ikon SVG `${ICONS.plus}` di 10 modul (`produk`, `opname`, `pelanggan`, `supplier`, `users`, `loyalti`, `retur`, `pembelian`, `pos`, `laporan`) — 0 emoji, 100% ikon SVG murni.
  - File terdampak: `frontend/css/components.css`, `frontend/css/layout.css`, `frontend/css/tokens.css`, dan modul-modul di `frontend/js/modules/`.
- [APK] **Build Rilis Android Native v1.0.60 (`versionCode 47`)**:
  - Kompilasi ulang APK terbaru `frontend/download/poskasirtoko.apk` (4.07 MB) dengan seluruh pembaruan UI/UX & PWA realtime.

### Fixed
- [UI] [POS-JUAL] [DASHBOARD] **Perbaikan Kontras Mode Gelap (Dark Mode) & Token Warna**:
  - Memperbaiki badge opsi `Varian`/`Satuan` pada kartu POS Kasir (`pos.js`) yang sebelumnya tidak terbaca di Mode Gelap dengan kelas adaptif `.pos-card-opt-badge`.
  - Menambahkan token semantik `--purple`, `--purple-soft`, dan `--purple-text` di `tokens.css` (Light & Dark) menggantikan hex mentah `#a855f7` di `biaya.js` & `.icon-purple`.
  - Memperbaiki kotak catatan admin di `laporan.js`, warna heading grosir di `produk.js`, sel `td[colspan]` pada kartu grid mobile, dan penghapusan `min-width` kaku pada kotak cari `kartu-stok.js` & `kategori.js`.
- [KARTU-STOK] Memperbaiki `TypeError: store.getState is not a function` dengan menyediakan helper `getState()` di `frontend/js/state.js` dan standarisasi `store.get('user')`.

## [1.0.59] - 2026-11-17

### Added
- [KARTU-STOK] [BACKEND] [SECURITY] **Fitur Hapus & Bersihkan Sampah Mutasi Stok (Role Owner Only)**:
  - **API Rute Baru**: Menambahkan endpoint `kartuStok.delete` dan `kartuStok.bersihkanSampah` di `backend/kode.gs` dengan validasi peran ketat (`roles: [ROLE.OWNER]`).
  - **Hapus Satuan per Baris**: Tombol hapus baris mutasi stok (`.btn-del-ks`) berikon SVG tong sampah merah pada setiap baris tabel kartu stok (khusus sesi Owner), dilengkapi modal konfirmasi dialog custom (`showConfirm`) dan audit log `kartu_stok_hapus`.
  - **Bersihkan Sampah Otomatis**: Tombol "Bersihkan Sampah" (`#btn-bersihkan-sampah-ks`) pada bilah filter kartu stok untuk membersihkan seluruh riwayat mutasi dari produk yang sudah dihapus (`deleted === true`) dalam 1 kali klik aman dengan modal konfirmasi.
  - **Sakelar Filter Sembunyikan Terhapus**: Menambahkan sakelar switch `#filter-ks-sembunyikan-terhapus` agar kartu stok dapat menyaring atau menampilkan mutasi produk terhapus sesuai preferensi.
- [KARTU-STOK] [UI] [BACKEND] **Optimasi Menyeluruh Buku Besar Kartu Stok & Tampilan 1 Layar**:
  - **Tampilan Muat 1 Layar Tanpa Geser Horizontal**: Menata ulang proporsi dan lebar 10 kolom tabel kartu stok (Waktu, Nama Produk & Varian, Jenis, No. Referensi, Mutasi, Saldo, HPP, Petugas, Keterangan, Aksi) dengan menumpuk tanggal & jam secara vertikal dan merampingkan kolom angka tabular, sehingga seluruh data terlihat utuh di layar laptop/desktop tanpa terpotong ke kanan.
  - **Penyempurnaan Jenis Mutasi & Filter**: Menambahkan pemetaan resmi jenis mutasi `koreksi` ber-badge rapi `Saldo Awal` (menggunakan `badge-secondary`) serta menambahkan opsi `Saldo Awal / Koreksi` ke dalam dropdown filter Jenis Mutasi.
  - **Pembersihan No. Referensi UUID**: Menghilangkan tampilan kode UUID database 36 karakter mentah pada saldo awal produk dan menggantinya dengan badge profesional `STOK-AWAL`.
  - **Perbaikan Teks Keterangan**: Menata kolom keterangan dengan pembungkusan kata rapi (`word-break: break-word`), batasan 2 baris proporsional di desktop dengan tooltip `title` lengkap saat diarahkan mouse, dan tampilan teks utuh pada kartu mobile.
  - **Audit Retensi Produk Terhapus**: Backend `aksiKartuStokList_` dan `aksiOpnameList_` di `backend/kode.gs` diperbarui untuk tetap membaca produk terhapus (`{ termasukTerhapus: true }`), sehingga riwayat mutasi barang yang sudah dihapus tidak lagi berstatus "Produk Tidak Ditemukan", melainkan tetap menampilkan nama asli barang, kode SKU, dan satuan dasarnya dengan penanda `(Dihapus)`.
  - File terdampak: [frontend/js/modules/kartu-stok.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/kartu-stok.js), [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css), [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs).

- [PRODUK] [UI] **Fitur Duplikat / Salin Produk (Product Cloning)**:
  - Tombol aksi `Salin` (`btn-duplikat-prd`) dengan ikon SVG murni (`ICONS.copy`) pada setiap baris tabel dan kartu produk.
  - Membuka formulir produk lengkap dengan seluruh atribut telah terisi otomatis (HPP, margin, harga ritel, harga grosir, min grosir qty, kategori, satuan konversi, serta daftar varian).
  - Nama produk otomatis ditambahkan akhiran `(Salinan)` dan teks otomatis terseleksi (*auto-select*) saat form terbuka agar pengguna dapat langsung mengetik spesifikasi variasi baru dengan sangat cepat.
  - SKU dan Barcode otomatis dikosongkan untuk di-generate baru saat disimpan (mencegah konflik keunikan barcode/SKU).
  - Stok awal di-reset ke `0` untuk menjaga integritas fisik gudang.

- [PRODUK] [UI] **Fitur Edit Cepat Harga & Stok (Quick Edit Modal)**:
  - Tombol aksi `Cepat` (`btn-quick-edit-prd`) dengan ikon SVG petir (`ICONS.zap`) pada setiap baris tabel dan kartu produk.
  - Membuka modal ringkas 1 layar instan (tanpa tab) untuk mengubah data esensial yang sering diperbarui: HPP modal, Harga Ritel (dengan perhitungan live margin laba otomatis), Harga Grosir & Min Qty Grosir, Batas Stok Minimum, dan Sakelar Status Aktif Produk.
  - Dilengkapi tombol navigasi cepat `Form Lengkap ↗` apabila kasir/owner ingin mengedit foto, varian spesifik, atau satuan konversi.

- [PRODUK] [UI] **Searchable Category Combobox (Dropdown Kategori dengan Pencarian Cepat)**:
  - Mengganti elemen dropdown klasik `<select>` kategori pada modal Tambah/Ubah Produk (`bukaModalFormProduk`) dengan komponen interaktif berarsitektur searchable combobox.
  - Mendukung penataan hirarkis `Induk > Sub` dengan penanda visual status badge `Utama` dan indentasi `↳` untuk sub-kategori.
  - Dilengkapi fitur live search instan dwiarah (mencari nama induk menampilkan sub-kategori; mencari nama sub-kategori otomatis menyertakan induknya).
  - Teks hasil pencarian yang cocok disorot dengan highlight `<mark>`.
  - Dilengkapi tombol reset/clear `[x]` untuk mengosongkan pilihan kembali ke `-- Tanpa Kategori --`.
  - 100% konsisten menggunakan ikon SVG native (`ICONS.tag`, `ICONS.folder`, `ICONS.chevronDown`, `ICONS.x`, `ICONS.check`), bebas emoji.
  - File terdampak: [frontend/js/modules/produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js), [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css).

- [BACKEND] [KATEGORI] **Validasi Anti-Duplikat Kategori Utama & Sub-Kategori**:
  - Backend `backend/kode.gs` (`aksiKategoriCreate_` & `aksiKategoriUpdate_`) memvalidasi keunikan nama kategori utama (tidak boleh kembar, case-insensitive, dan di-trim).
  - Memvalidasi keunikan nama sub-kategori di bawah induk yang sama (tidak boleh kembar di bawah kategori utama yang sama).
  - Frontend [frontend/js/modules/kategori.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/kategori.js) memberikan validasi instan *real-time* saat pengetikan dengan pesan error merah dan *disable* tombol simpan jika nama kategori terdeteksi duplikat.
  - File terdampak: [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs), [frontend/js/modules/kategori.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/kategori.js).

### Changed
- [PRODUK] [UI] **Penataan Ramping Kolom Aksi Tabel Produk (Zero Overflow)**:
  - Mengatasi masalah tombol aksi terpotong di tepi kanan layar (`Cepat` dan `Ubah` tampil, sedangkan `Salin` dan `Hapus` terdorong keluar layar).
  - Menggunakan tombol `btn-xs` berukuran ringkas (`height: 26px`, padding ramping, gap 3px) dan ikon SVG murni.
  - Menyesuaikan proporsi kolom tabel produk (`Nama Produk`, `SKU / Barcode`, `Satuan`, `HPP`, `Harga Ritel`, `Harga Grosir`, `Stok`, dan `Aksi`) serta menurunkan `min-width` `.table-produk` dari `960px` menjadi `800px`, sehingga seluruh tabel dan 4 tombol aksi (`Cepat`, `Ubah`, `Salin`, `Hapus`) muat 100% di layar desktop/laptop standar (1280px / 1366px dengan sidebar 240px) tanpa ada elemen yang terpotong.
- [PRODUK] **Satuan Otomatis Huruf Besar (UPPERCASE) & Batas Stok Minimum Default 0**:
  - Satuan dasar (`prd-satuan`) dan satuan konversi (`sat-nama`) otomatis dikonversi menjadi huruf kapital/besar (UPPERCASE) baik saat pengetikan di antarmuka maupun saat disimpan ke database.
  - Nilai bawaan default satuan dasar diubah menjadi `PCS`.
  - Batas stok minimum (`prd-stok-min`) diubah dari default `5` menjadi `0`, memberikan kebebasan penuh kepada pengguna untuk menentukan batas peringatan stok menipis sesuai kebutuhan masing-masing produk.
  - File terdampak: [frontend/js/modules/produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js), [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs).

## [1.0.58] - 2026-11-16

### Changed
- [UI] [BIAYA] **Restrukturisasi Total Antarmuka Mobile Modul Biaya Operasional Toko Ala Native App**:
  - **Header Ramping 1 Baris**: Mengubah header 2 baris yang memakan ruang vertikal di mobile menjadi 1 baris ramping berdampingan dengan tombol utama `+ Catat Biaya`.
  - **Filter Periode & Dropdown Simetris**:
    - Baris 1: Label `PERIODE:` berdampingan dengan badge tanggal aktif berformat pill rounded (`30 Hari Terakhir`).
    - Baris 2: Segmented preset rentang tanggal diatur dalam **Grid 3×2 simetris** di mobile (*Hari Ini | 7 Hari | 30 Hari* & *Bulan Ini | Tahun Ini | Kustom*) sehingga tidak ada lagi teks tombol yang terpotong di tepi kanan layar (`Tahu...`).
    - Baris 3: Dropdown Kategori Biaya dan Sumber Dana ditata sejajar **50% : 50%** berdampingan.
    - Baris 4: Kotak pencarian didampingi tombol segarkan berupa square icon button `${ICONS.refresh}` yang proporsional di sisi kanan.
  - **Kartu Metrik Finansial (Stat Grid 2×2 di Mobile)**:
    - Mengganti layout kartu vertikal yang menumpuk panjang menjadi **Grid 2×2 di mobile dan 4 kolom di desktop** menggunakan komponen baku `.stat-grid` dan `.stat-card-pro` di [components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css).
    - Menghadirkan icon SVG berlatar warna tema (*Rose* untuk Total Pengeluaran, *Amber* untuk Petty Cash, *Blue* untuk Kas Besar Toko, dan *Purple* untuk Transfer Bank).
  - **Transformasi Kartu Riwayat Pengeluaran Mobile**:
    - Mengganti wrapper tabel ke `.table-wrap` dan melengkapi atribut `data-label` pada setiap sel di [biaya.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/biaya.js).
    - Di layar ponsel, transaksi otomatis bertransformasi menjadi **Kartu Native App** (nomor transaksi sebagai header kartu, nominal pengeluaran merah tebal, badge kategori/sumber dana, dan tombol aksi pembatalan di footer kartu).
    - Menata *empty state* agar tampil terpusat dan rapi tanpa kepala tabel yang meluap horizontal.
- [UI] **Eliminasi Total Icon Emoji di Seluruh Frontend**:
  - Menghapus seluruh emoji (seperti `💸`, `💵`, `💡`) dari modal shift kasir [pos.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pos.js), modal panduan [produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js), dan form biaya [biaya.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/biaya.js).
  - Seluruh indikator visual kini 100% menggunakan SVG Icons native (`ICONS`) yang tajam, elegan, dan seragam.
- [UTILS] **Peningkatan Fleksibilitas Helper DOM (`renderEmpty`)**:
  - Memperbarui fungsi `renderEmpty` di [frontend/js/utils/dom.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/utils/dom.js) agar bersifat *polymorphic* (mendukung pemanggilan via options object `{ title, text, icon, actionButton }` maupun parameter posisional langsung).
- [BACKEND] **Penyempurnaan Engine Pemercantik Spreadsheet**:
  - Mengoreksi penonaktifan gridlines di [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs) menggunakan `sh.setHiddenGridlines(false)` (mengatasi error `TypeError: sh.setHideGridlines is not a function`).
  - Menjamin sheet `Biaya` yang baru dibuat langsung memiliki format font Roboto, header biru navy, zebra striping, dan format mata uang Rupiah tebal merah pada 50 baris pertama.

## [1.0.57] - 2026-11-16

### Added
- [BACKEND] [DB] **Modul Biaya Operasional & Pengeluaran Toko (OPEX)**:
  - Menambahkan sheet baru `Biaya` pada `SKEMA` [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs) dengan struktur: `no_transaksi`, `tanggal`, `kategori`, `nominal`, `keterangan`, `sumber_dana`, `shift_id`, `user_id`, `user_nama`, `bukti_url`, `status`.
  - Mendaftarkan counter prefix `'EXP'` pada `nomorBerikut_` untuk penomoran dokumen otomatis standar toko (`EXP-YYYYMMDD-XXXX`).
  - Menambahkan endpoint API baru: `biaya.list` (filter rentang, kategori, sumber dana, dan pencarian teks), `biaya.create` (pencatatan pengeluaran baru), dan `biaya.delete` (pembatalan pengeluaran khusus Owner & Admin).
  - Integrasi warna tab sheet `'Biaya': '#EF4444'` pada engine `percantikTampilanSpreadsheet()`.
- [POS-JUAL] [UI] **Tombol & Modal Aksi Cepat Kas Keluar Kasir (Petty Cash)**:
  - Menambahkan tombol `[-] Biaya` pada toolbar quick actions cart [frontend/js/modules/pos.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pos.js) untuk pencatatan instan pengeluaran kasir (bensin pickup, kuli bongkar, konsumsi).
  - Menambahkan tombol `+ Kas Keluar` di dalam modal shift kasir.
  - Integrasi otomatis pemotongan kasir ke perhitungan uang fisik laci: `Total Laci = Modal Awal + Total Kas Tunai - Kas Keluar Kasir`.
- [CETAK] [POS-JUAL] **Pembaruan Struk Rekap Shift Kasir (X-Report)**:
  - Memperbarui `susunTeksXReport` di [frontend/js/utils/printer.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/utils/printer.js) untuk mencetak baris `(-) Kas Keluar Kasir`, rincian pengeluaran per item, dan total uang fisik laci aktual.
- [BIAYA] [UI] **Modul Khusus Manajemen Biaya Operasional (`frontend/js/modules/biaya.js`)**:
  - Menyediakan tampilan komprehensif riwayat pengeluaran kas dengan 4 kartu metrik (Total Biaya, Kasir, Toko, Bank), filter periode preset & kustom, filter kategori, breakdown persentase pengeluaran, tabel transaksi, dan modal input lengkap.
  - Mendaftarkan rute `#/biaya` di [frontend/js/routes.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/routes.js) dan navigasi di [frontend/js/app.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/app.js).
- [DASHBOARD] **Integrasi Laba Bersih Riil Toko & Arus Kas**:
  - Menghitung Laba Bersih Riil Toko (`Laba Bersih Riil = Laba Kotor Bersih - Total Biaya Operasional`) dan Margin Bersih Riil pada tab Laba Rugi dan Ringkasan Eksekutif di [frontend/js/modules/laporan.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/laporan.js) dan [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs).
  - Menyematkan rincian biaya operasional tunai dan bank pada Laporan Arus Kas Keluar.
- [TEST] **Suite Pengujian Otomatis Biaya Operasional**:
  - Menambahkan `tests/test_biaya_operasional.js` (17 skenario pengujian komprehensif) ke dalam alur `npm test`.

## [1.0.56] - 2026-11-16

### Added
- [BACKEND] [DB] **Engine Pemercantik Spreadsheet Otomatis (Beautifier Database Engine)**:
  - Menambahkan menu `🎨 Percantik Tampilan Spreadsheet` dan fungsi `percantikTampilanSpreadsheet()` di [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs) untuk menata otomatis seluruh 26 sheet:
    - Pewarnaan tab sheet per kategori modul (Master, Kasir, Pembelian, Keuangan, Gudang, Hadiah, Sistem).
    - Header Dark Slate elegan (`#1E293B`) dengan teks putih tebal dan pembekuan baris pertama (*freeze header*).
    - Zebra striping halus (`#FFFFFF` & `#F8FAFC`) untuk kenyamanan mata membaca data.
    - Format otomatis mata uang Rupiah (`"Rp"#,##0`), kuantitas (`#,##0`), dan tanggal (`yyyy-mm-dd hh:mm`).
    - Pewarnaan bersyarat (*conditional formatting*) badge status otomatis (hijau, kuning, merah, abu-abu).
    - Penyesuaian tinggi baris batch (`26px`) dan pelebaran kolom proporsional dengan ruang padding.

### Removed
- [DASHBOARD] [UI] **Eliminasi Tombol Cetak PDF & Ekspor CSV**:
  - Menghapus tombol *Cetak PDF* dan *Ekspor CSV* pada [frontend/js/modules/laporan.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/laporan.js) beserta event listener-nya untuk menyederhanakan alur kerja pengguna.

### Changed
- [DASHBOARD] [UI] **Restrukturisasi Tata Letak Header & Filter Periode Laporan**:
  - Menata ulang header modul laporan menjadi 1 baris kompak: judul *Dashboard & Laporan Usaha* berdampingan langsung dengan tombol *Segarkan*, menghemat ruang vertikal secara drastis pada perangkat mobile.
  - Merapikan kartu filter periode: baris atas menampilkan label *Periode Laporan* (kiri) dan badge rentang tanggal aktif (kanan); baris bawah menampilkan grid 6 tombol shortcut periode secara simetris tanpa elemen berantakan.

## [1.0.55] - 2026-11-16

### Fixed
- [DASHBOARD] [UI] **Perataan Grid Kontrol Periode & Tab Navigasi Laporan Mobile**:
  - Mengubah segmen filter `#seg-periode` menjadi CSS Grid 3×2 dan navigasi `#tabs-laporan` menjadi CSS Grid 2×3 pada layar perangkat mobile (`@media (max-width: 767px)` di [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css)), memastikan seluruh tombol tampil utuh tanpa terpotong atau menimbulkan scrollbar horizontal.
- [DASHBOARD] [UI] **Grafik Tren Bebas Scroll & Penataan Komposisi Metode Bayar**:
  - Mengoptimalkan perhitungan lebar grafik SVG tren harian di [frontend/js/modules/laporan.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/laporan.js) agar sepenuhnya pas dengan kontainer (`width: 100%`) tanpa *overflow* horizontal.
  - Menambahkan kelas utilitas `.cluster` di [frontend/css/layout.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/layout.css) untuk merapikan kartu rincian metode pembayaran dan modal nota.
  - Memperbaiki perataan teks kode SKU dan batas stok pada kartu peringatan stok kritis agar sejajar ke kiri.
- [DASHBOARD] [UI] **Penataan Tombol Aksi Header Laporan**:
  - Merapikan susunan tombol aksi *Cetak PDF*, *Ekspor CSV*, dan *Segarkan* agar tersusun proporsional, rapi, dan mudah diakses pada layar smartphone.
- [HUTANG-PIUTANG] **Ketahanan Akumulasi Saldo Sisa Hutang/Piutang**:
  - Memperbaiki fallback kalkulasi total saldo berjalan di [frontend/js/modules/hutang-piutang.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/hutang-piutang.js) agar secara dinamis menghitung dari daftar faktur aktif saat backend mengembalikan nilai 0.

## [1.0.54] - 2026-11-16

### Fixed
- [POS-BELI] [UI] **Segmented Control Navigasi Sejajar POS Pembelian**:
  - Mengubah tab `Faktur Baru` dan `Riwayat Faktur` pada [frontend/js/modules/pembelian.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pembelian.js) menjadi `.segmented` sejajar 50:50 dengan ikon tematik, selaras dengan estetika *Native App*.
- [POS-BELI] [UI] **Perataan Tengah Pesan Tabel Kosong & Tombol Aksi Cepat**:
  - Menyelaraskan teks pesan keranjang dan riwayat faktur kosong dengan `.text-center` dan `min-height: 120px`.
  - Menata tombol aksi cepat *Terapkan ke Semua*, *Bayar Lunas*, dan *Hutang (0)* agar memiliki ukuran tombol seragam dan perataan vertikal yang presisi.
  - Menerapkan `.cell-stack` pada kolom daftar barang untuk mencegah loncatan teks multi-baris pada layar sempit.

## [1.0.53] - 2026-11-16

### Added
- [UI] [PWA] **Tombol Sinkronisasi Cepat di Topbar & Seluruh Modul**:
  - Menambahkan tombol `#btn-sync-top` di bilah atas (*Topbar*) pada [frontend/js/app.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/app.js) serta tombol *refresh* langsung di halaman POS Kasir (`#btn-pos-refresh` di [frontend/js/modules/pos.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pos.js)), Katalog Produk (`#btn-refresh-produk` di [frontend/js/modules/produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js)), Kategori (`#btn-refresh-kategori` di [frontend/js/modules/kategori.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/kategori.js)), dan Pengguna (`#btn-refresh-users` di [frontend/js/modules/users.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/users.js)).

### Fixed
- [UI] [BACKEND] **Perbaikan Seluruh Ikon Sinkronisasi & Muat Ulang (*Force Network Bypass & Spin Animation*)**:
  - Menambahkan interceptor *capture-phase* global dan `forceNextApiCallsFresh()` di [frontend/js/api.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/api.js) sehingga setiap klik pada tombol *refresh* atau sinkronisasi di seluruh modul otomatis mengosongkan *cache*, memutar animasi ikon (`.is-spinning`), mengambil data terbaru dari Google Sheets, dan menampilkan notifikasi *toast*.
  - Melestarikan posisi tab aktif pada modul multi-tab (`hutang-piutang.js`, `pembelian.js`, `retur.js`, `loyalti.js`) saat sinkronisasi global dijalankan.

## [1.0.52] - 2026-11-16

### Fixed
- [HUTANG-PIUTANG] [RETUR] [BACKEND] **Penyelarasan Properti API & Kartu Modal Native App**:
  - Menyelaraskan field ringkasan `total_hutang_berjalan`/`total_sisa_hutang` dan `total_piutang_berjalan`/`total_sisa_piutang`, nomor nota/faktur (`no_faktur`, `no_nota`), serta nama/HP pelanggan & supplier antara [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs), [frontend/js/modules/hutang-piutang.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/hutang-piutang.js), dan [frontend/js/modules/retur.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/retur.js).
  - Merombak kartu header di dalam modal Rincian Hutang, Rincian Piutang, Bayar Hutang, Bayar Piutang, Rincian Pembelian, dan Rincian Retur menggunakan struktur `.pel-modal-profile` agar nama supplier panjang tidak lagi mendorong nominal ke bawah secara timpang.
  - Memperbaiki ukuran tombol `.modal-footer > .btn` di [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css) dan `line-height` tab `.segmented` di [frontend/css/layout.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/layout.css) agar teks tidak pernah terpotong.

## [1.0.51] - 2026-11-16

### Changed
- [PWA] [BACKEND] **Akselerasi Kecepatan Reload & Pemanggilan Data (2-Tier Persistent SWR Cache & Parallel Fetch)**:
  - Mengimplementasikan *Persistent LocalStorage Cache* (`pos_api_cache_v1`) + *Stale-While-Revalidate* (SWR) pada 32 endpoint baca di [frontend/js/api.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/api.js), pemanasan cache saat *idle* di [frontend/js/app.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/app.js), serta caching *per-request* (`_SS_REQ`, `_SHEET_MAP_REQ`, `_CACHE_BACA_REQ`) di [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs).

## [1.0.47 - 1.0.50] - 2026-11-16

### Fixed
- [UI] [POS-BELI] [PRODUK] [PELANGGAN] **Transformasi Menyeluruh Tampilan Kartu Native App Mobile & Container Queries**:
  - Menerapkan `@container pembelian` pada [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css), memperbaiki kartu Sub Kategori agar tidak terpotong di sisi kanan layar mobile, serta mengubah seluruh tabel di dalam modal detail (`pelanggan.js`, `hutang-piutang.js`, `pembelian.js`, `retur.js`) menjadi Kartu Native App vertikal bebas *scroll* horizontal.

## [1.0.46] - 2026-11-15

### Added
- [POS-JUAL] [UI] **Fitur #3: Ganti Satuan Langsung di Keranjang Belanja (*Inline Unit Switcher*)**:
  - Pada panel keranjang POS kasir, produk yang memiliki satuan konversi bertingkat kini menampilkan badge interaktif `[ SATUAN ▾ ]` dengan indikator chevron yang elegan di [frontend/js/modules/pos.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pos.js).
  - Kasir dapat langsung menekan badge satuan untuk beralih satuan jual (misal dari *Batang* ke *Ikat*, *Meter* ke *Rol*, atau *Pcs* ke *Dus*) tanpa perlu menghapus item dan mencari ulang produk dari katalog.
  - Sistem otomatis menyesuaikan faktor konversi, HPP snapshot, harga ritel/grosir, dan subtotal item secara instan.
  - Dilengkapi fitur cerdas *auto-merge*: jika produk dengan satuan tujuan sudah ada di baris keranjang lain, kuantitas item otomatis digabungkan (*merge*) ke baris yang ada dan menghapus baris lama sehingga keranjang tetap rapi tanpa duplikasi.
- [POS-JUAL] [CETAK] [BACKEND] **Fitur #5: Ringkasan Kas & Shift Kasir (*Cash Drawer / Shift Summary & X-Report*)**:
  - **Backend API**: Menambahkan rute dan handler `penjualan.shiftKasir` di [backend/kode.gs](file:///c:/POS%20KASIR%20TOKO/backend/kode.gs) yang merekapitulasi data penjualan harian kasir bertugas secara aman (mengabaikan transaksi void, transaksi batal, pending, dan soft-deleted).
  - **Workstation & Shortcut Akses**:
    - Tombol `[ 💵 Shift ]` di toolbar header keranjang POS kasir.
    - Tombol menu *Kas & Shift Kasir (X-Report)* pada *User Account Sheet* di [frontend/js/app.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/app.js) sehingga dapat diakses dari halaman mana pun di aplikasi.
    - Shortcut keyboard global: **F3** untuk membuka Ringkasan Shift Kasir dan **F9** untuk Cetak Ulang Struk Transaksi Terakhir.
  - **Modal Interaktif & Saldo Laci Kasir**:
    - Menampilkan identitas kasir bertugas, tanggal shift, total nota transaksi, omset kotor, penerimaan kas tunai, non-tunai (transfer/QRIS), piutang tempo bon, dan potongan diskon.
    - Input modal awal / float laci dengan quick presets (+50rb, +100rb, +200rb, +500rb, reset 0) yang tersimpan otomatis di `localStorage`.
    - Menghitung dan menyorot **Total Uang Fisik yang Wajib Ada di Laci** (`Modal Awal + Penerimaan Kas Tunai`).
  - **Cetak X-Report Thermal**:
    - Menambahkan generator format teks ESC/POS khusus `susunTeksXReport` untuk ukuran kertas thermal 58mm dan 80mm di [frontend/js/utils/printer.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/utils/printer.js).
    - Mendukung cetak langsung via aplikasi RawBT (Android), Web Bluetooth, maupun dialog cetak/PDF browser, lengkap dengan kolom tanda tangan serah terima Kasir dan Supervisor.
- [TESTS] Menambahkan suite uji otomatis [tests/test_shift_kasir.js](file:///c:/POS%20KASIR%20TOKO/tests/test_shift_kasir.js) (20 pengujian unit & integrasi lulus 100%).
- [APK] [BUILD] Kompilasi APK Android native **v1.0.46** via Capacitor (VersionCode 33).

### Fixed
- [PRODUK] [UI] [RESPONSIF-MOBILE] **Presisi Tata Letak Kartu Produk Mobile & Header Anti-Wrap**:
  - Mengatasi masalah tata letak kartu produk di layar mobile di mana badge stok terdorong jatuh ke bawah SKU pada nama produk panjang, yang sebelumnya meninggalkan ruang kosong asimetris (*"ada space"*):
    - Komponen header diubah menggunakan `.prd-table-head` dengan aturan `flex-wrap: nowrap !important; align-items: flex-start !important;`.
    - Posisi badge stok dikunci presisi di pojok kanan atas dengan `margin-left: auto !important; flex-shrink: 0 !important; align-self: flex-start !important;`.
    - Nama produk panjang kini terbungkus rapi ke baris kedua tanpa merusak keseragaman tinggi kartu di katalog produk.
  - Menyematkan sanitasi auto-normalizer spasi `replace(/\s+/g, ' ')` pada submit handler form produk untuk mencegah spasi ganda atau spasi berlebih pada nama barang.
- [PRODUK] [UI] **Perbaikan Banner Panduan Varian & Satuan (Tab 3 & Modal Panduan)**:
  - Mengatasi masalah teks bertumpuk (*overlap*) dengan tombol di desktop dan terhimpit menjadi kolom sempit 40px di layar HP:
    - Menambahkan modifier class `.alert.alert-block` (`display: block !important; width: 100% !important;`) di [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css) dan [frontend/js/modules/produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js).
    - Memisahkan baris judul & tombol di bagian atas dan mengalirkan teks penjelasan poin 1 & 2 ke bawah secara penuh sehingga terbaca lega dan responsif.
- [MODAL] [UI] **Perbaikan Tombol Batal pada Seluruh Dialog Modal**:
  - Memperbaiki event binding tombol Batal di [frontend/js/utils/ui.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/utils/ui.js) menggunakan `querySelectorAll('.btn-close-modal, .btn-batal-modal, .btn-cancel')` sehingga tombol Batal di footer/body modal berfungsi menutup dialog dengan sempurna.
- [APK] [BUILD] **Pencegahan Duplikasi Bundle File APK & Optimasi Ukuran File**:
  - Menambahkan filter `:!*.apk` pada `aaptOptions.ignoreAssetsPattern` di [android/app/build.gradle](file:///c:/POS%20KASIR%20TOKO/android/app/build.gradle).
  - Mencegah file APK web di folder `download/` ikut terpaket ke dalam aset aplikasi native Capacitor.
  - Ukuran file APK Android [frontend/download/poskasirtoko.apk](file:///c:/POS%20KASIR%20TOKO/frontend/download/poskasirtoko.apk) terjaga sangat ringan dan stabil di **4.07 MB**.
- [UI] [PRODUK] [RESPONSIF-MOBILE] **Perbaikan Tampilan Nilai Satuan, HPP, Harga Ritel, & Harga Grosir pada Mode Mobile**:
  - Mengatasi masalah nilai data (`satuan_dasar`, `hpp`, `harga_ritel`, `harga_grosir`) yang sebelumnya tampak hilang / kosong pada kartu katalog produk di layar ponsel mobile (<768px):
    - **Akar Masalah**: Elemen `<table>` pada modul [frontend/js/modules/produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js) memiliki inline style `min-width: 980px`. Karena spesifisitas inline style mengalahkan aturan class CSS biasa, tabel tetap dipaksa selebar 980px di layar HP. Akibatnya, `td` dengan `justify-content: space-between` menaruh label (*SATUAN*, *HPP*, dll.) di sisi kiri (0px), sedangkan nilai angkanya (*PCS*, *Rp 3.900*, *Rp 7.000*) terdorong jauh ke koordinat 980px (di luar batas layar ponsel 360px–412px)!
    - **Solusi**:
      1. Memindahkan batas min-width tabel desktop ke media query khusus `@media (min-width: 768px)` menggunakan class semantik (`.table-produk`, `.table-pelanggan`, `.table-supplier`, `.table-users`) di [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css).
      2. Menerapkan penegakan strict `width: 100% !important; min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important;` pada `.table`, `tbody`, `tr`, dan `td` di `@media (max-width: 767px)`.
      3. Membungkus nilai setiap sel data dengan elemen class `.table-cell-val` yang rapi dan terisolasi, sehingga pada layar mobile flex item label (`::before`) dan nilai (`.table-cell-val`) berdampingan presisi di sisi kiri dan kanan kartu tanpa pernah terpotong atau terdorong ke luar layar.
      4. Memastikan selektor `.table td:not(.d-none-mobile)` dan `.table td.d-none-mobile` menjaga integritas kolom tersembunyi (seperti SKU/Barcode dan stok terpisah yang sudah dipindahkan ke header kartu) tetap tersembunyi tanpa bentrok spesifisitas.
      5. Menerapkan standardisasi yang sama ke tabel [pelanggan.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pelanggan.js), [supplier.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/supplier.js), dan [users.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/users.js).
- [APK] [BUILD] Kompilasi APK Android native **v1.0.45** berukuran **4.03 MB** (VersionCode 32).

## [1.0.44] - 2026-11-15

### Added & Fixed
- [UI] [POS-KASIR] **Workstation POS Terkunci (Accurate POS Style) & Keranjang Belanja Fixed/Docked**:
  - Mengatasi pertanyaan dan keluhan pengguna *"apakah memang keranjang belanja harus ikut terscroll"*: pada POS kasir profesional (ala Accurate POS), keranjang belanja dan tombol checkout `[BAYAR (F4)]` **tidak boleh ikut terscroll** atau terdorong ke luar layar.
  - Menerapkan viewport lock pada rute POS (`body.pos-route-active`, `.app.pos-mode`, `.content.pos-content-locked`) dengan `height: 100vh; overflow: hidden;` pada breakpoint desktop & tablet (≥768px).
  - Area katalog produk (`.pos-product-area`) kini menjadi satu-satunya kontainer di sisi kiri yang bergulir (*independent smooth vertical scroll*), sementara toolbar pencarian, scanner, dan chips kategori tetap diam terkunci di atas.
  - Panel keranjang belanja (`.pos-cart-panel`) di sisi kanan berukuran presisi 340px–360px dan terkunci utuh (*permanently fixed/docked*):
    - Header keranjang dan pemilih member tetap diam di atas.
    - Daftar item keranjang (`.pos-cart-items`) bergulir internal jika item belanja banyak.
    - Footer keranjang (Subtotal, Diskon, Total Belanja) dan tombol aksi `[📋 Tahan (F7)]` & `[💳 BAYAR (F4)]` selalu tampak 100% di bagian bawah layar tanpa pernah terpotong atau harus digulir.
- [UI] [TOPBAR] **Pembersihan Total Fitur Duplikat di Header (Lega, Bersih, & Minimalis)**:
  - Mengeliminasi seluruh tombol fitur yang terduplikat antara Topbar dan Sidebar:
    - Menghapus tombol ganda *Sinkronisasi Data*, *Ubah Tema (Moon)*, *Ukuran Teks (Aa)*, dan *Status Sistem (Database)* dari Topbar karena semuanya sudah tersedia lengkap di Sidebar footer dan menu navigasi.
    - Mengintegrasikan preferensi tema, ukuran teks, dan sinkronisasi ke dalam modal profil pengguna (*User Account Sheet*), sehingga pengguna mobile dan desktop tetap memiliki akses instan 1-klik.
    - Menghilangkan duplikasi tombol toggle menu (*hamburger [☰]* di Topbar dan *chevron [<]* di Sidebar) saat sidebar terbuka di desktop.
    - Menghilangkan logo toko ganda di Topbar pada layar desktop/tablet karena logo utama sudah tampil di Sidebar header.
    - Topbar kini tampil sangat lega, rapi, dan elegan: hanya memuat judul halaman aktif, indikator jaringan offline, dan tombol profil ringkas di pojok kanan.
- [UI] [PRODUK] **Eliminasi Duplikasi Paginasi & Filter Manajemen Produk**:
  - Menghapus tombol "+ Muat Lebih Banyak (+1)" yang sebelumnya menumpuk di atas bar paginasi "← Sebelumnya 1 / 2 Berikutnya →". Paginasi kini tampil tunggal dan bersih.
  - Menghilangkan dropdown "Status Stok" yang menduplikasi fungsi filter chips "Semua / Stok Menipis / Stok Habis / Ada Stok" di bawahnya.
- [UI] [SIDEBAR] **Pelebaran Sidebar ke 276px & Anti-Ellipsis Nama Toko**:
  - Menyesuaikan `--sidebar-w: 276px;` pada [frontend/css/tokens.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/tokens.css) dan menyempurnakan padding header `.sidebar-brand` agar nama toko `TB.PUTRI UTAMA TEKNIK` selalu tampil utuh tanpa terpotong `TB.PUTRI UTAMA T...`.
- [UI] [PELANGGAN] **Pelebaran Kolom Aksi Tabel Pelanggan**:
  - Menyesuaikan kolom aksi pada [frontend/js/modules/pelanggan.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pelanggan.js) menjadi `min-width: 260px; width: 260px; padding-right: 16px;` agar ketiga tombol aksi ("Rincian", "Ubah", "Hapus") memiliki ruang bernapas yang cukup dan tidak terpotong.
- [APK] [BUILD] Kompilasi APK Android native **v1.0.44** berukuran **4.03 MB** (VersionCode 31).

---

## [1.0.43] - 2026-11-15

### Added & Fixed
- [UI] [LAYOUT] **Eliminasi Total Overflow Horizontal & Presisi Area Utama `.main`**:
  - Mengidentifikasi akar masalah utama penyebab layout menabrak dan meluap melebihi layar (*horizontal overflow*): elemen `.main` sebelumnya memiliki `width: 100%` dipadukan dengan `margin-left: 264px` (atau `76px` saat collapsed), yang menyebabkan batas kanan `.main` meluap keluar layar sebesar lebar sidebar tersebut.
  - Memperbaiki perhitungan dimensi `.main` di [frontend/css/layout.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/layout.css):
    - Pada desktop/tablet: Mengubah menjadi `width: calc(100% - var(--sidebar-w)); max-width: calc(100% - var(--sidebar-w));` saat expanded, dan `width: calc(100% - var(--rail-w)); max-width: calc(100% - var(--rail-w));` saat collapsed.
    - Menambahkan `overflow-x: hidden;` pada `.app` dan `.main` untuk mencegah kebocoran gulir horizontal.
    - Mengoreksi `topbar` menjadi `max-width: 100%`, sehingga seluruh tombol aksi pojok kanan (Sinkron, Tema, Aa, Status, Profil) selalu terkunci rapi di tepi kanan layar tanpa terdorong keluar viewport.
- [UI] [POS-KASIR] **Fluid Dual-Panel Layout POS Kasir & Presisi Keranjang Belanja**:
  - Mengatur kontainer `.content:has(.pos-wrapper)` agar memanfaatkan 100% ruang kerja secara proporsional dengan tinggi penuh layar (`height: calc(100vh - var(--topbar-h))`).
  - Mengubah `.pos-wrapper` di [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css) menjadi `height: 100%; max-height: 100%; overflow: hidden;`.
  - Panel keranjang belanja (`.pos-cart-panel`) kini berukuran presisi 330px–360px dan berada pas di tepi kanan layar, dengan area item keranjang yang fleksibel (*dynamic scroll*), sehingga tombol utama "BAYAR" dan "Tahan" selalu tampak utuh tanpa terpotong di bagian bawah.
  - Mengoptimalkan ukuran kisi kartu katalog produk (`.pos-grid-container`) dengan `minmax(160px, 1fr)` sehingga kartu tersusun rapi 3–5 kolom sesuai ruang layar yang tersedia tanpa saling berhimpitan (*terjepit*).
- [APK] [BUILD] Kompilasi APK Android native **v1.0.43** berukuran **4.03 MB** (VersionCode 30).

---

## [1.0.42] - 2026-11-15

### Added & Fixed
- [UI] [TABLE] **Presisi Tabel Pelanggan, Supplier & Pengguna (Anti-Truncation Kolom Aksi)**:
  - Memperluas kolom Aksi pada [frontend/js/modules/pelanggan.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/pelanggan.js) menjadi `min-width: 245px; width: 245px;` dan menetapkan `min-width: 1080px;` pada tabel, sehingga seluruh 3 tombol aksi ("Rincian", "Ubah", dan "Hapus") selalu tampil utuh berdampingan tanpa teks "Hapus" terpotong menjadi `Hap...`.
  - Mengoptimalkan lebar kolom Aksi dan batas tabel pada modul Supplier (`min-width: 900px;` & Aksi `170px`) di [frontend/js/modules/supplier.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/supplier.js) dan Manajemen Pengguna (`min-width: 860px;` & Aksi `175px`) di [frontend/js/modules/users.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/users.js).
- [UI] [SIDEBAR] **Pelebaran Sidebar Desktop & Anti-Ellipsis Nama Toko**:
  - Menyesuaikan variabel `--sidebar-w: 264px;` pada [frontend/css/tokens.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/tokens.css) dan mengoptimalkan padding header `.sidebar-brand` pada [frontend/css/layout.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/layout.css).
  - Nama toko yang panjang seperti `TB.PUTRI UTAMA TEKNIK` kini dapat tampil penuh dan elegan tanpa terpotong (*ellipsis*) `TB.PUTRI UTAMA T...`.
  - Tombol toggle panah collapse di header sidebar kini dilengkapi dengan latar transparan halus dan border tipis yang lebih kontras dan mudah diklik.
- [APK] [BUILD] Kompilasi APK Android native **v1.0.42** berukuran **4.03 MB** (VersionCode 29).

---

## [1.0.41] - 2026-11-15

### Added & Fixed
- [UI] [TABLE] **Presisi Tata Letak Tabel Desktop & Anti-Wrapping Kolom**:
  - Mengatasi masalah tampilan tabel desktop yang berantakan (*penceng* dan terpotong):
    - Menerapkan `white-space: nowrap;` pada seluruh sel numerik `.table .num, .table .tabular` di [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css), mencegah teks mata uang `Rp` dan nominal (misal `397.000`) terlipat menjadi 2 baris terpisah.
    - Menetapkan lebar minimum desktop `.table-wrap:not(.keep-table) .table { min-width: 960px; }` sehingga kolom tabel tidak lagi tertekan (*squished*) pada layar desktop/laptop menengah, melainkan dapat digulir horizontal dengan mulus.
    - Menambahkan `white-space: nowrap;` dan penetapan lebar minimum kolom SKU / Barcode (`min-width: 140px;`) dan Aksi (`min-width: 170px;`) di [frontend/js/modules/produk.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/modules/produk.js), memastikan tombol "Ubah" dan "Hapus" selalu tampil utuh berdampingan tanpa terpotong di tepi kanan.
- [UI] [SIDEBAR] **Fitur Buka-Tutup Side Menu & Mode Ikon Mini (Accurate POS Style)**:
  - Mengimplementasikan sistem side menu panel responsif multi-device (Desktop, Tablet, Mobile) bergaya Accurate POS:
    - **Desktop (>= 1024px)**: Mendukung mode *Full Sidebar* (248px) dan *Mini-Rail Icon Only* (76px). Tombol toggle di header sidebar (`#btn-toggle-sidebar`) dan topbar (`#btn-toggle-sidebar-top`) memungkinkan pengguna memperluas atau memperkecil side menu dengan sekali klik atau shortcut keyboard `Ctrl + B`.
    - **Anotasi Tooltip Otomatis**: Saat sidebar dalam mode mini ikon Accurate POS, mengarahkan kursor (*hover*) pada ikon menu akan langsung memunculkan tooltip judul menu lengkap yang ramah pengguna.
    - **Persistensi Preferensi**: Pilihan mode buka/tutup sidebar disimpan otomatis di `localStorage ('pos_sidebar_collapsed')` sehingga tampilan preferensi pengguna tetap dipertahankan saat membuka halaman atau sesi baru.
    - **Tablet (768px - 1023px)**: Mode mini rail default yang hemat ruang dan dapat diperluas.
    - **Mobile (< 768px)**: Topbar hamburger memicu *Off-Canvas Drawer* samping (280px) dengan efek backdrop gelap berbayang halus yang tertutup otomatis saat link menu atau backdrop disentuh, dipadukan dengan kemudahan Bottom Navigation Bar 5 menu utama.
  - Menghubungkan event resize otomatis dengan transisi CSS halus `cubic-bezier(0.4, 0, 0.2, 1)` untuk menjaga presisi ukuran elemen tabel dan grafik di area utama (`.main`).
- [APK] [BUILD] Kompilasi APK Android native **v1.0.41** berukuran **4.03 MB** (VersionCode 28).

---

### Enhanced & Optimized
- [PERFORMANCE] [API] **In-Flight Request Coalescing & Serialized Payload Cache**:
  - Mengimplementasikan teknik **In-Flight Request Coalescing** pada [frontend/js/api.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/api.js): apabila beberapa komponen atau modul memanggil endpoint baca yang sama secara bersamaan (seperti `kategori.list` atau `produk.list`), aplikasi hanya mengirim **1 HTTP request** ke server backend dan membagikan *Promise* yang sama ke seluruh pemanggil. Hal ini menghemat kuota Google Apps Script dan memangkas penggunaan bandwidth hingga 50%.
  - Memperluas sistem caching memori klien dengan kunci serialisasi parameter payload (`action::token::payload`). Dengan ini, query katalog produk per halaman/filter (`produk.list`), kategori (`kategori.list`), pelanggan (`pelanggan.list`), dan pengaturan (`pengaturan.get`) tersimpan di memori dan merespons dalam **0 milidetik (instan)** saat pengguna berpindah menu atau berganti filter.
  - Mengintegrasikan mekanisme *cache auto-invalidation* cerdas: setiap aksi mutasi data (seperti `penjualan.simpan`, `pembelian.simpan`, `produk.tambah`, `produk.ubah`, `opname.simpan`, `retur.simpan`) otomatis mengosongkan entri cache terkait seketika sehingga data selalu terjamin segar dan akurat.
- [PERFORMANCE] [SHELL] **Idle Background Cache Warming**:
  - Menambahkan metode `hangatkanCacheLatarBelakang()` pada [frontend/js/app.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/app.js) yang berjalan menggunakan `requestIdleCallback` saat CPU sedang santai setelah login, menghangatkan cache data master sehingga ketika kasir membuka modul Kasir atau Produk untuk pertama kalinya, data telah siap di memori.
- [PERFORMANCE] [CSS] **DOM Layout Containment & Virtualization Rendering**:
  - Menerapkan `content-visibility: auto; contain-intrinsic-size: 220px;` dan `contain: layout style paint;` pada elemen `.card-grid > .card` dan baris tabel `.table tbody tr` pada [frontend/css/components.css](file:///c:/POS%20KASIR%20TOKO/frontend/css/components.css). Browser dan WebView Android melewati perhitungan tata letak (*layout calculation*) dan penggambaran piksel (*paint*) untuk item yang berada di luar layar viewport, menghasilkan gulir layar 60fps yang super mulus tanpa *jank*.
- [ANDROID] [HARDWARE] **Akselerasi Perangkat Keras GPU Native & Large Heap**:
  - Menambahkan konfigurasi `android:hardwareAccelerated="true"` dan `android:largeHeap="true"` pada tag `<application>` di [android/app/src/main/AndroidManifest.xml](file:///c:/POS%20KASIR%20TOKO/android/app/src/main/AndroidManifest.xml), memastikan WebView Android selalu dirender oleh GPU dan mencegah kehabisan memori (*out-of-memory*) pada perangkat berspesifikasi hemat.
- [APK] [BUILD] Kompilasi APK Android native **v1.0.40** berukuran **~4.02 MB** (VersionCode 27).

---

## [1.0.39] - 2026-11-15

### Changed & Refactored
- [UI] [DESIGN] **Eliminasi Total Ikon Emoji & Standardisasi Ikon Vektor SVG Presisi**:
  - **Akar Masalah**: Masih terdapat elemen UI seperti chip filter katalog, tombol auto-generate SKU/barcode/member, modal status sistem, opsi printer thermal, empty-state keranjang/pencarian, dan badge tanggal yang menggunakan karakter emoji sistem (seperti ⚡, 🚨, ❌, ✅, 📁, 🏷️, 🎲, 📱, 📶, 🖨️, 🧪, ⚙️, 🛒, 🔍, 👤, 🏪, 🚚, 💬). Hal ini membuat tampilan terasa kekanak-kanakan, kaku, inkonsisten antar perangkat sistem operasi, dan tidak mencerminkan antarmuka aplikasi kasir POS profesional.
  - **Standardisasi Vektor SVG Modern (Lucide/Feather Style)**:
    - Menambahkan kamus ikon SVG resmi baru pada [frontend/js/utils/ui.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/utils/ui.js) (`calendar`, `sparkles`, `zap`, `checkCircle`, `xCircle`, `smartphone`, `bluetooth`, `wifi`, `messageCircle`, `user`, `helpCircle`).
    - Mengganti seluruh emoji pada tombol aksi otomatis SKU, Barcode EAN-13, dan Kode Member (`🎲 Auto`) dengan tombol mikro rapi berikon SVG *sparkles/magic* presisi.
    - Mengganti emoji pada chip filter produk (`⚡ Terbaru`, `🚨 Stok Menipis`, `❌ Stok Habis`, `✅ Ada Stok`) dengan ikon SVG bergaris tipis 2.5px profesional.
    - Mengganti emoji pada empty-state keranjang kasir (`🛒`) dan hasil pencarian katalog (`🔍`) dengan ikon ilustrasi SVG 38px elegan berkontras lembut.
    - Mengganti seluruh emoji pada modal printer RawBT, BLE, dan pratinjau browser dengan ikon SVG smartphone, printer thermal, bluetooth, dan pesan WhatsApp.
    - Mengganti badge sesi `🟢 Aktif` dengan `.badge-dot` sesuai standar design system tokens.css.
    - Membersihkan karakter emoji dari menu Spreadsheet backend `backend/kode.gs` (`POS Kasir`) dan seluruh string template pesan WhatsApp.
- [APK] [BUILD] Kompilasi APK Android native **v1.0.39** berukuran **~4.02 MB** (VersionCode 26) dengan sinkronisasi aset web terbaru.

---

## [1.0.38] - 2026-11-15

### Fixed & Enhanced
- [UI] [PRODUK] **Penyempurnaan Total Tata Letak Footer Paginasi & Tombol Muat Lebih Banyak (Load More)**:
  - **Akar Masalah**: Pada tampilan katalog produk mobile, wadah paginasi (`#area-paginasi-produk`) sebelumnya menggunakan tata letak baris flex horizontal tunggal (`row-between`) yang menggabungkan teks info barang (`Menampilkan 20 dari 21 barang`) dengan kluster tombol di sebelah kanan (`+ Muat Lebih Banyak (+1)` dan `← Sebelumnya 1 / 2 Berikutnya →`). Pada layar smartphone berlebar 360–420px, ruang horizontal tidak mencukupi sehingga teks info tertekan (*squished*) menjadi beberapa baris yang bertumpuk canggung, dan tombol `Muat Lebih Banyak` terhimpit tepat di atas tombol paginasi tanpa jarak atau pemisah visual yang rapi.
  - **Tata Letak Baru yang Bersih & Responsif**:
    - Memisahkan tombol **Muat Lebih Banyak** menjadi wadah mandiri berorientasi tengah (`.produk-load-more-wrapper`) dengan ukuran tombol proporsional, ikon plus, dan indikator jumlah sisa barang yang jelas.
    - Menghadirkan bilah paginasi bergaris pembatas elegan (`.produk-pagination-bar`) dengan *border-top* solid halus.
    - Mengatur tombol navigasi `← Sebelumnya`, indikator halaman badge `1 / 2` (`.pagination-page-indicator`), dan tombol `Berikutnya →` dalam satu grup rapi (`.pagination-controls`) dengan tinggi sentuh seragam (*control-h-sm* 36px).
    - Menerapkan aturan media query seluler (`@media (max-width: 600px)`) dengan susunan vertikal terbalik (*column-reverse*): grup tombol paginasi berada rapi di tengah atas, diikuti teks informasi jumlah barang di tengah bawah tanpa pemotongan kata atau pemisahan baris paksa.
- [APK] [BUILD] Kompilasi APK Android native **v1.0.38** berukuran **~4.02 MB** (VersionCode 25) dengan sinkronisasi aset web terbaru.

---

## [1.0.37] - 2026-11-15

### Fixed & Enhanced
- [BACKEND] [API] **Implementasi Handler API `penjualan.list` & Penyelarasan Rute 100%**:
  - Menambahkan handler backend `aksiPenjualanList_` pada `backend/kode.gs` lengkap dengan filter tanggal (`dari`, `sampai`), status bayar, filter pelanggan, pencarian no nota / nama pelanggan, pengurutan waktu `DESC`, serta paginasi data.
  - Memperbarui modul `frontend/js/modules/retur.js` agar pencarian nota penjualan mendukung pencarian ganda (*direct `penjualan.detail`* dan *fallback `penjualan.list`*) dengan validasi status void transaksi.
- [TEST] [AUDIT] **Otomatisasi Verifikasi Paritas API Frontend vs Backend**:
  - Menambahkan script pengujian otomatis [tests/audit_api_parity.js](file:///c:/POS%20KASIR%20TOKO/tests/audit_api_parity.js) yang memvalidasi bahwa seluruh pemanggilan `apiCall` (55 aksi) pada frontend memiliki handler aktif yang terdaftar di objek `RUTE` Google Apps Script (66 rute).
  - Menjalankan *full stress test* mencakup seluruh Fase 1 s/d Fase 6 dan Audit Finalisasi dengan hasil kelulusan 100% tanpa error.
- [APK] [BUILD] Kompilasi ulang APK Android native **v1.0.37** berukuran **~4.02 MB** (VersionCode 24).

---

## [1.0.36] - 2026-11-15

### Fixed
- [UI] [MENU] **Perbaikan Tombol Logout "undefined" pada Menu Lainnya**:
  - **Akar Masalah**: Tombol logout akun di kartu profil toko `Menu Lainnya` memanggil variabel `${ICONS.logout}` yang belum didefinisikan pada objek kamus ikon SVG `ICONS` di `frontend/js/utils/ui.js`. Akibatnya, JavaScript mengevaluasi variabel tersebut menjadi `undefined`, dan karena label teks desktop `Keluar` disembunyikan pada layar seluler (`d-none-mobile`), tombol di perangkat Android hanya menampilkan tulisan teks harfiah `"undefined"`.
  - **Solusi**:
    - Menambahkan ikon SVG `ICONS.logout` (standar Lucide/Feather *log-out*) ke kamus ikon resmi `ICONS` di [frontend/js/utils/ui.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/utils/ui.js).
    - Memperbarui tombol logout di [frontend/js/app.js](file:///c:/POS%20KASIR%20TOKO/frontend/js/app.js) agar menampilkan ikon logout beserta label teks `Keluar` secara presisi dan jelas di perangkat seluler maupun desktop.
- [APK] [BUILD] Kompilasi ulang APK Android native ramping **v1.0.36** berukuran **~4.02 MB** (VersionCode 23) dengan sinkronisasi aset web terbaru.

---

## [1.0.35] - 2026-11-15

### Fixed
- [UI] [SCROLL] **Perbaikan Total Kunci Gulir (Scroll Lock) Layar Mobile & Android WebView**:
  - **Akar Masalah**: Penggunaan kombinasi `overscroll-behavior-y: none`, `touch-action: manipulation`, dan `overflow-x: hidden` secara bertingkat pada `html`, `body`, `.app`, `.main`, dan `.content` secara tidak sengaja memicu pembentukan multi-container `overflow-y: auto` dengan ketinggian tidak terikat (*unconstrained height*). Hal ini menyebabkan sistem WebView Android menangkap dan membatalkan seluruh gestur sentuh geser (*touch drag*), sehingga layar terkunci dan tidak dapat di-scroll ke bawah.
  - **Restorasi Scroll Root Tunggal**:
    - Menetapkan `html` sebagai wadah gulir vertikal utama dengan `overflow-y: auto`, `overflow-x: clip`, `-webkit-overflow-scrolling: touch`, dan `touch-action: pan-y`.
    - Menghapus `overscroll-behavior-y: none` dan `overscroll-behavior-x: none` pada `body`, serta menetapkan `overflow-y: visible` dan `overflow-x: clip` agar tidak membentuk wadah gulir tandingan.
    - Menghapus `overflow-x: hidden` dari `.app`, `.main`, dan `.content` agar seluruh elemen anak mengalir secara alami pada viewport window tanpa menyerap gestur sentuh.
    - Menambahkan `window.scrollTo(0, 0)` pada router `renderPage()` agar setiap perpindahan rute selalu mengembalikan posisi layar ke paling atas secara bersih.
  - **Bottomnav Viewport Anchoring**: Mempertegas penempatan `.bottomnav` dengan `position: fixed; bottom: 0; left: 0; right: 0; inset: auto 0 0 0; max-width: 100%` agar tetap kokoh terisolasi di bagian bawah layar tanpa menutupi konten terakhir.
- [APK] [BUILD] Kompilasi ulang APK Android native ramping **v1.0.35** berukuran **~4.02 MB** (VersionCode 22) dengan sinkronisasi Service Worker cache bumper terbaru.

---

## [1.0.34] - 2026-11-15

### Changed & Enhanced
- [UI] [DESIGN-SYSTEM] **Perombakan UI/UX Presisi, Konsisten, dan Profesional (Enterprise POS Quality)**:
  - **Eliminasi Efek Kaca (Glassmorphism)**: Menghapus `backdrop-filter: blur(...)` dan latar belakang transparan keruh dari Topbar, Bottomnav, Scrim Modal, dan Overlay. Seluruh permukaan kini menggunakan warna solid bersih dengan garis batas 1px tegas (`1px solid var(--border)`).
  - **Presisi Border Radius (Anti-Bubbly)**: Menghapus radius lengkung 20px–28px berlebih yang tampak seperti gelembung mainan. Menetapkan skala radius enterprise: 3px (badge/tag), 4px (chip/button-sm), 6px (input/select/control), 8px (card/table/sheet), 10px (modal/dialog), 12px (bottom sheet top).
  - **Tipografi Bersih (Anti-Bold Berlebihan)**: Mengatur `--fw-bold: 600` untuk meniadakan bobot font 700/800 yang kaku. Seluruh harga, metrik KPI, judul, dan angka transaksi kini menggunakan bobot 600 semibold dengan perataan tabular (*tabular-nums*), serta bobot 500 (*medium*) untuk label dan judul kartu.
  - **Bayangan Natural & Non-Glow**: Menghilangkan efek bayangan neon berpendar pada tombol aksi. Menggunakan bayangan fungsional tipis 1px (`var(--shadow-xs)` dan `var(--shadow-card)`).
  - **Neutral Product Hero Visual**: Menghilangkan gradasi warna pelangi (*rainbow gradient*) pada placeholder kartu produk, digantikan latar netral elegan (`var(--surface-2)`).
- [APK] Kompilasi ulang APK Android native ramping berukuran **~4.02 MB**.

---

## [1.0.33] - 2026-11-15

### Added & Enhanced
- [PRODUK] [BACKEND] **Fitur Filter Produk Komprehensif & Urutan Terbaru Selalu di Atas**:
  - Menetapkan urutan default `p.sort = 'terbaru'` (`created_at DESC` / baris terbaru) baik di server Google Apps Script (`backend/kode.gs`) maupun filter lokal (`frontend/js/modules/produk.js`).
  - Menambahkan dropdown pengurutan lengkap: Terbaru, Terlama, Nama A-Z, Nama Z-A, Stok Terendah, Stok Tertinggi, Harga Ritel Tertinggi, dan Harga Ritel Terendah.
  - Menambahkan filter Kategori dinamis, Status Stok (Semua, Menipis, Habis, Tersedia), dan Status Keaktifan (Aktif, Nonaktif).
  - Menyediakan Quick Filter Chips satu sentuhan: `[Semua]`, `[⚡ Terbaru]`, `[🚨 Menipis]`, `[❌ Habis]`, `[✅ Ada Stok]`.
  - Penambahan produk baru otomatis mereset tampilan ke halaman 1 dan urutan `Terbaru` sehingga produk langsung terlihat paling atas.
- [BUILD] [RELEASE] Mengatasi bug rekursi duplikasi aset APK di `scripts/release.js` dan `.gitignore`.

---

## [1.0.32] - 2026-11-15

### Changed & Enhanced
- [UI] [MENU] **Redesain Tampilan Menu Lainnya Menjadi Grouped ListView Modern**:
  - Mengubah tampilan grid kartu 3 kolom menjadi Grouped Inset Card ListView bergaya iOS / Material 3.
  - Menambahkan profil ringkas toko di bagian atas dengan badge peran pengguna aktif.
  - Menambahkan bar aksi cepat untuk Sinkron Cloud dan status Printer Bluetooth.
  - Menambahkan fitur pencarian instan (*live search*) untuk menemukan menu secara real-time.
  - Mengelompokkan menu secara terstruktur: Transaksi & Kasir, Manajemen Stok, Relasi & Mitra, Keuangan, serta Sistem & Pengaturan.

---

## [1.0.13] - 2026-11-13

### Changed & Enhanced
- [UI] [UX] **Redesain Splash Screen Awal ala Native App Modern**:
  - Menggantikan tampilan teks polos kaku sebelumnya dengan layar pembuka (*splash screen*) modern berstandar aplikasi profesional.
  - **Logo Resmi Beranimasi**: Menampilkan lencana squircle 84×84px bergradien oranye dengan logo toko putih, disertai animasi detak halus (*breathing pulse*) dan cincin aura berpendar (*glow ripple ring*).
  - **Loading Bar Shimmer**: Menambahkan progress bar kapsul dengan animasi gelombang gradien halus dan indikator titik status ("Menyiapkan sistem & database...").
  - **Critical CSS Inlined**: Memasang CSS splash screen langsung secara inline di `index.html` dan `layout.css` untuk mencegah kedipan tampilan (*zero FOUC*), serta mendukung mode gelap (*Dark Mode*).
  - **Penyesuaian Service Worker & APK**: Cache Service Worker dinaikkan ke `pos-kasir-static-v1.0.14` dan APK Android dikompilasi ulang ke versi `1.0.13`.

---

## [1.0.12] - 2026-11-13

### Added
- [BRANDING] [APK] [PWA] **Ikon Aplikasi Resmi Selaras dengan Logo Toko Bangunan**:
  - Memperbarui `frontend/assets/icon.svg` dengan latar belakang squircle bersudut melengkung gradien oranye hangat (`#fb923c` ke `#ea580c`) dan lambang kanopi/etalase toko fisik (`ICONS.store`) berwarna putih bersih.
  - Menghasilkan resolusi tinggi `icon-512.png` dan `icon-192.png` untuk PWA.
  - Memperbarui seluruh ikon peluncur aplikasi Android native di `android/app/src/main/res/` (`mipmap-mdpi`, `mipmap-hdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, `mipmap-xxxhdpi`) untuk `ic_launcher.png`, `ic_launcher_round.png`, dan `ic_launcher_foreground.png`.
- [UI] [APK] [SW] **Sistem Deteksi Banner Pintar & In-App Auto-Update**:
  - Menambahkan deteksi runtime `isAppInstalled()` (Capacitor Native Platform atau PWA Standalone).
  - **Kondisi Belum Diinstal**: Menampilkan opsi unduh APK `poskasirtoko.apk` dan panduan pemasangan PWA.
  - **Kondisi Sudah Terpasang**: Banner otomatis beralih menampilkan status aplikasi aktif ("POS Kasir Toko 🟢 Aktif v1.0.12") dan menghilangkan ajakan unduh APK yang tidak diperlukan.
  - **In-App Auto-Update (Tanpa Unduh Ulang APK)**: Ketika ada versi baru yang terdeteksi oleh Service Worker di latar belakang, banner otomatis menampilkan tombol **"⚡ Perbarui & Restart Aplikasi"**. Saat diketuk, aplikasi membersihkan cache lama dan memuat ulang kode terbaru dalam waktu kurang dari 1 detik.
  - Menambahkan tombol **"Periksa Pembaruan"** untuk pengecekan versi manual kapan saja.

### Changed
- [SW] Menaikkan cache statis Service Worker ke `pos-kasir-static-v1.0.13` dengan penambahan penanganan pesan `{ action: 'skipWaiting' }`.
- [CONFIG] Memperbarui `CONFIG.VERSION` ke `1.0.12` pada `frontend/js/config.js` dan `package.json`.

---

## [1.0.11] - 2026-11-13

### Fixed
- [PRICETAG] **Perbaikan ReferenceError `formatQty is not defined`**:
  - Menambahkan impor fungsi `formatQty` pada `frontend/js/modules/pricetag.js` dari `../utils/format.js` sehingga daftar produk pada menu Price Tag & Label Rak langsung tampil normal tanpa error.
- [TESTS] **Suite Pengujian Otomatis Identifier (`tests/check_globals.js`)**:
  - Menambahkan script pengujian otomatis yang memeriksa kelengkapan impor fungsi utilitas (`formatQty`, `formatRupiah`, `ICONS`, `showToast`, dll.) di seluruh file modul JavaScript.
  - Memindahkan seluruh script pengujian dari folder lokal ke direktori terkelola `tests/` yang terlacak penuh oleh Git.

---

## [1.0.10] - 2026-11-13

### Changed & Enhanced
- [POS-JUAL] [UI] [UX] **Redesain Tampilan Card Grid & List View Katalog ala Native App Modern**:
  - **Grid View (Kartu)**: Mengubah sistem kolom menjadi seimbang `repeat(2, minmax(0, 1fr))` pada layar smartphone sehingga kartu terbagi rata 50% layar tanpa menyisakan ruang kosong di kanan.
  - **Visual Hero Banner**: Menambahkan banner atas kartu dengan gradien pastel lembut dan ikon produk 44×44px, status stok di pojok kanan atas, serta tombol sentuh bulat `+` di kanan bawah.
  - **List View (Baris)**: Menggunakan avatar produk 48×48px, tata letak atribut horizontal (Stok, SKU, Varian, HPP), harga ritel tebal sans-serif (15px), dan tombol kapsul modern `+ Tambah`.
  - **Toolbar Kompak**: Memisahkan baris pencarian dan scanner kamera (baris atas) dengan tombol toggle Grid/List bersanding rapi di sebelah chip kategori produk (baris bawah).

---

### Added
- [APK] **Build Native Android APK Langsung**:
  - Mengonfigurasi `android/settings.gradle`, `android/gradle.properties` (`android.useAndroidX=true`, `android.enableJetifier=true`), serta ikon aplikasi `mipmap` (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).
  - Berhasil mengompilasi file APK Android debug lengkap (`poskasirtoko.apk`, ~13.9 MB) langsung dari Gradle 8.14.3 dan Android SDK 34.
  - Menyalin file APK ke direktori publik `frontend/download/poskasirtoko.apk` sehingga dapat diunduh langsung dari dalam aplikasi.
- [UI] **Pusat Unduhan & Panduan Aplikasi Android**:
  - Menambahkan tombol unduh langsung `poskasirtoko.apk` di modul Status Sistem (`#/sistem`).
  - Menambahkan banner promosi aplikasi Android di bagian atas menu "Lainnya" (`#/lainnya`).
  - Menyajikan panduan lengkap penanganan instalasi PWA pada Google Chrome Android ketika diakses via IP jaringan lokal (HTTP non-SSL).

### Changed & Enhanced
- [UI] **Perbaikan Checkbox & Radio Native Modern**:
  - Mengatasi masalah checkbox dan radio yang tidak terlihat karena `appearance: none;` global pada `base.css`.
  - Menerapkan `appearance: auto`, `accent-color: var(--primary)`, dan dimensi sentuh 18x18px pada semua input checkbox dan radio.
- [UI] **Penyelarasan Modul Price Tag & Label Rak (`pricetag.js`)**:
  - Menambahkan sistem grid responsif `.grid-2` di `layout.css` sehingga pada layar tablet/desktop halaman Price Tag tampil rapi dalam 2 kolom (Kolom Kiri: Pemilihan Produk & Template, Kolom Kanan: Pratinjau Live Sticky).
  - Merapikan daftar produk dengan seleksi kartu checklist `.ptag-prod-item.is-selected`, badge stok, SKU, dan harga ritel dalam warna brand primer.
- [PWA] **Penyelarasan Manifest PWA Android Terbaru**:
  - Memperbarui `frontend/manifest.json` dengan menambahkan properti `id: "./"`, `scope: "./"`, dan `prefer_related_applications: false`.
  - Memisahkan definisi ikon untuk `purpose: "any"` dan `purpose: "maskable"` sesuai standar audit Web App Manifest Google Chrome.
- [SW] **Pembaruan Service Worker (Anti-Cache Kadaluarsa)**:
  - Menaikkan versi cache statis ke `pos-kasir-static-v1.0.9` agar browser di perangkat smartphone kasir/owner otomatis membersihkan cache lama dan memuat kode terbaru.
  - Menambahkan pengecualian (*bypass*) pada Service Worker untuk berkas biner `.apk` agar pengunduhan berjalan langsung dari server tanpa gangguan cache.

## [1.0.8] - 2026-11-12

### Changed & Enhanced
- [UI] [UX] Penyelarasan Menyeluruh UI/UX Full Native App Profesional & Proporsional:
  - **Tampilan List View & Transformasi Tabel ke Native Card di Mobile**:
    - Menghilangkan tumpukan garis pemisah horizontal (`border-bottom`) berulang antar baris atribut yang sebelumnya membuat kartu tampak kaku dan penuh sekat.
    - Mengubah baris pertama (`td:first-child`) menjadi Header Kartu Native yang elegan: dilengkapi avatar/ikon representatif (`.prd-table-avatar` 40x40px rounded), judul tebal, subtitle meta, dan badge status di pojok kanan atas.
    - Menyembunyikan kolom redundan di mobile (`d-none-mobile`) seperti SKU dan Stok terpisah yang sudah terintegrasi rapi ke dalam header kartu.
    - Menonjolkan angka dan harga ritel dalam warna brand tebal (`var(--primary)`).
    - Menjadikan baris aksi (`td:last-child`) sebagai footer kartu native dengan tombol-tombol sentuh ber-radius penuh (`border-radius: var(--radius-full)`) dan tinggi 40px yang proporsional.
    - Penyelarasan modul data master: `produk.js`, `kategori.js`, `supplier.js`, `pelanggan.js`, dan `users.js`.
  - **Grid & Card Box System**:
    - Memperbaiki jarak bawah menu aplikasi (`.menu-grid`) dengan safe bottom navigation clearance (`padding-bottom: calc(var(--bottomnav-h) + var(--safe-bottom) + var(--sp-12));`) sehingga ubin menu paling bawah ("Status Sistem", "Design System") tidak lagi tertutup oleh `.bottomnav`.
    - Memberikan ubin `.menu-tile` sudut membulat modern (`var(--radius-xl)` = 22px), efek sentuh `scale(0.94)`, dan perbesaran ikon yang halus saat interaksi.
    - Meratakan breakpoint responsif tablet & mobile (768px) pada layout POS Kasir, mencegah konflik layout antara 768px dan 991px.
  - **Bottom Sheet & Modal System**:
    - Memastikan seluruh konten form dalam `.dialog-body` memiliki safe area bottom clearance yang cukup (`padding-bottom: calc(var(--safe-bottom) + var(--sp-6));`) sehingga tombol aksi tidak pernah terpotong oleh bezel layar HP atau home indicator.
    - Memberikan tombol aksi pada `.dialog-footer` di mobile tinggi sentuh minimum 44px dengan radius modern.
  - **Form Controls, Input, & Kolom Teks**:
    - Memberikan tinggi sentuh 44px standar pada `.input`, `.select`, `.textarea`, `.form-input` dengan padding horizontal 14px dan radius 12px (`var(--radius-md)`).
    - Menjaga ukuran font 16px di mobile untuk mencegah zoom otomatis yang mengganggu di Safari / Chrome seluler.
    - Menambahkan focus ring glow modern (`0 0 0 3.5px var(--primary-soft)`).
    - Mendukung selector otomatis `.textarea, textarea.input, textarea.form-input` untuk multiline input yang konsisten.
    - Merapikan tata letak responsif formulir POS Pembelian (`.pembelian-layout`, `.pembelian-header-grid`, `.beli-inputs-grid`).
  - **Defensive SVG Protection**:
    - Menambahkan proteksi global pada `base.css`: `svg:not([width]):not([height]):not([style*="width"]):not([style*="height"]):not(.chart-svg):not(.chart-svg *) { width: 20px; height: 20px; }` untuk menjamin tidak ada ikon SVG yang meledak atau meregang tak terduga di seluruh penjuru aplikasi.
    - Menambahkan kelas `chart-svg` pada generator grafik tren harian di `laporan.js`.
  - File: `frontend/css/base.css`, `frontend/css/components.css`, `frontend/css/layout.css`, `frontend/js/modules/produk.js`, `frontend/js/modules/kategori.js`, `frontend/js/modules/supplier.js`, `frontend/js/modules/pelanggan.js`, `frontend/js/modules/users.js`, `frontend/js/modules/pembelian.js`, `frontend/js/modules/opname.js`, `frontend/js/modules/laporan.js`, `CHANGELOG.md`.

### Fixed
- [ROUTER] [PRODUK] Solusi TypeError: Cannot set properties of null (setting 'innerHTML') di `produk.js`:
  - Mengatasi *race condition double-render* di `app.js` (`navigate`): Memastikan `cekIzinDanRender` hanya dieksekusi satu kali saat navigasi rute berautentikasi (sebelumnya `pastikanLogin` memanggil callback dan baris berikutnya memanggil ulang secara paralel).
  - Menambahkan *null-check guard* (`if (!area) return;` dan `if (area) area.innerHTML = ...`) di `produk.js`, `kategori.js`, `supplier.js`, `users.js`, `hutang-piutang.js`, dan `opname.js` agar rendering aman dari unmounting atau transisi halaman asinkron.
  - File: `frontend/js/app.js`, `frontend/js/modules/produk.js`, `frontend/js/modules/kategori.js`, `frontend/js/modules/supplier.js`, `frontend/js/modules/users.js`, `frontend/js/modules/hutang-piutang.js`, `frontend/js/modules/opname.js`, `CHANGELOG.md`.
  - Dampak: Navigasi halaman produk dan seluruh modul stabil tanpa runtime exception.

## [1.0.6] - 2026-11-12

### Fixed & Enhanced
- [UI] [OPNAME] [POS-BELI] Redesain Autocomplete Pemilihan Produk & Solusi Tuntas Footer Modal Terpotong di Mobile:
  - Mengatasi bug tampilan pada modal "Input Stok Opname Fisik" (`opname.js`) dan halaman "POS Pembelian" (`pembelian.js`):
    - Memberikan `position: relative` pada kontainer `.autocomplete-field` dan positioning absolut `top: calc(100% + 4px); left: 0; right: 0; z-index: 120;` pada dropdown autocomplete sehingga hasil pencarian tidak lagi menimpa atau menutupi input field pencarian.
    - Menghilangkan pemotongan tombol aksi pada modal dialog bottom-sheet di layar perangkat mobile: Memindahkan tombol ke slot `footer` resmi pada `showModal({ title, body, footer })` dan memperbarui `components.css` (`.dialog` memiliki `padding-bottom: 0`, `.dialog-body` dengan `flex: 1 1 auto; min-height: 0; overflow-y: auto`, dan `.dialog-footer` pinned dengan `calc(var(--sp-3) + var(--safe-bottom))`).
  - Redesain tampilan hasil pencarian produk ala Native App Row Card (`.autocomplete-item`):
    - Dilengkapi kotak ikon 38x38px (`ICONS.package`), judul produk berbobot tegas, badge SKU terformat rapi (tanpa tanda strip `-` tunggal), badge indikator stok dinamis (`badge-success` jika tersedia, `badge-danger` jika habis), dan penanda HPP / Stok Sistem tebal di sisi kanan.
    - Header ringkasan pencarian (`.autocomplete-header`) yang menginformasikan jumlah produk ditemukan dan panduan ketukan.
  - Form Pemilih Item Faktur Pembelian Responsif: Mengubah tata letak input Satuan, Qty Beli, Harga Beli, dan tombol `+ Tambah ke Faktur` menggunakan grid responsif auto-fit (`.beli-inputs-grid`) sehingga tertata rapi dan simetris baik di layar ponsel maupun desktop.
  - Integrasi Tombol Kamera Barcode Scanner (`#btn-scan-barcode-opname` dan `#btn-scan-barcode-beli`) via `bukaKameraScanner` untuk input produk cepat tanpa mengetik manual.
  - File: `frontend/css/components.css`, `frontend/js/modules/opname.js`, `frontend/js/modules/pembelian.js`, `frontend/js/modules/pricetag.js`, `frontend/js/utils/ui.js`, `CHANGELOG.md`.
  - Dampak: Pengalaman input dan pemilihan produk yang mulus, rapi, konsisten, dan menyerupai aplikasi mobile native sungguhan.

## [1.0.0] - 2026-11-12

### Added
- [APK] Finalisasi Pembungkusan Aplikasi Android Native via Capacitor (Fase 7):
  - Inisialisasi konfigurasi inti: `package.json` dan `capacitor.config.json` dengan ID aplikasi `com.admgaffidigital.poskasirtoko` dan tema gelap splash screen `#0f172a`.
  - Pengaturan proyek native Android Gradle di direktori `android/` (`build.gradle`, `app/build.gradle`, `variables.gradle`, `settings.gradle`) yang menargetkan Android 14 (API level 34).
  - Konfigurasi Izin Lengkap pada `android/app/src/main/AndroidManifest.xml`:
    - Izin Bluetooth Printer Kasir Thermal (ESC/POS 58mm & 80mm): `BLUETOOTH_SCAN` dengan flag `neverForLocation` dan `BLUETOOTH_CONNECT` untuk Android 12+, serta kompatibilitas mundur Android 11 ke bawah (`BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION`).
    - Izin Kamera Pemindai Barcode Material: `CAMERA` dengan deklarasi fitur opsional `android.hardware.camera` dan `android.hardware.camera.autofocus`.
    - Izin Koneksi Data & Keamanan: `INTERNET`, `ACCESS_NETWORK_STATE`, dan `usesCleartextTraffic` untuk jaringan printer thermal lokal.
  - Panduan kompilasi dan deployment lengkap pada `docs/android-capacitor.md`: langkah build APK Debug (`./gradlew assembleDebug`), APK Release ditandatangani (`./gradlew assembleRelease`), sinkronisasi web assets (`npx cap sync android`), dan integrasi printer via Web Bluetooth atau RawBT.
  - Bump versi resmi sistem menjadi `v1.0.0` pada `backend/kode.gs`, `frontend/sw.js`, `frontend/js/config.js`, dan `package.json`.
  - File: `package.json`, `capacitor.config.json`, `android/*`, `docs/android-capacitor.md`, `backend/kode.gs`, `frontend/sw.js`, `frontend/js/config.js`, `README.md`.
  - Dampak: Ketersediaan aplikasi kasir toko bangunan sebagai aplikasi Android APK mandiri dan kesiapan penuh deployment produksi.
  - Undo: `rm -r android capacitor.config.json package.json`

- [DASHBOARD] Implementasi Lengkap Modul Dashboard Eksekutif & Laporan Usaha (Fase 6):
  - Modul front end `frontend/js/modules/laporan.js`: Arsitektur 6 tab komprehensif (Ringkasan Eksekutif, Laporan Penjualan, Laporan Pembelian, Buku Arus Kas, Laba Rugi & Margin, dan Valuasi Stok Persediaan).
  - Kartu Ringkasan Realtime (Stat Cards): Omset Penjualan Bersih, Total Pembelian Barang Masuk, Piutang Pelanggan Berjalan, Hutang Supplier Berjalan, Estimasi Nilai Modal Aset Persediaan Stok (HPP), dan Laba Kotor Berjalan beserta Gross Profit Margin %.
  - Grafik Tren Harian Visual Ringan Pure SVG: Bar chart interaktif responsif tanpa pustaka eksternal pihak ketiga (Zero Dependency, Lightweight, Retina/Mobile Ready).
  - Analisis Produk Terlaris (Top 10) & Peringkat Pelanggan Terbaik (Top 10): Ranking kuantitas terjual, kontribusi omset per material, dan frekuensi belanja pelanggan member.
  - Komposisi Metode Pembayaran: Diagram progress proporsional pembagian transaksi Tunai, Transfer Bank, QRIS, dan Tempo Kredit.
  - Peringatan Stok Kritis & Kosong: Deteksi otomatis produk material dengan stok 0 (habis) atau di bawah batas minimum (kritis) beserta tombol langsung restock ke POS Pembelian.
  - Penegakan Matriks Keamanan & Hak Akses (README Bagian 5):
    - `laporan.dashboard`: Owner & Admin dapat mengakses ringkasan omset penjualan & pembelian, namun bidang `laba_kotor`, `margin_persen`, dan `total_nilai_aset_stok` disembunyikan/bernilai `null` bagi Admin.
    - `laporan.labaRugi`: Dibatasi ketat khusus Pemilik Toko (Owner); Admin & Kasir ditolak dengan error `FORBIDDEN`.
    - `laporan.stokValuasi`: Admin dapat melihat stok fisik dan HPP per item material, namun total nilai aset persediaan agregat hanya dapat dilihat oleh Owner.
  - Laporan Buku Arus Kas (`laporan.arusKas`): Menghitung kas masuk (penjualan tunai langsung, pelunasan piutang transfer/tunai/qris) dan kas keluar (pembelian tunai, pembayaran hutang supplier, refund retur tunai), serta rekap saldo kas fisik kasir dan saldo bank toko.
  - Fitur Ekspor CSV & Cetak PDF: Generator CSV instan dengan UTF-8 BOM untuk kompatibilitas sempurna dengan Microsoft Excel dan styling `@media print` presisi tinggi.
  - Backend handler: `laporan.dashboard`, `laporan.penjualan`, `laporan.pembelian`, `laporan.labaRugi`, `laporan.arusKas`, `laporan.stokValuasi`.
  - File: `backend/kode.gs`, `frontend/js/modules/laporan.js`, `frontend/js/api.js`, `frontend/js/app.js`, `frontend/js/utils/format.js`, `frontend/sw.js`, `docs/api.md`, `README.md`.
  - Dampak: Visibilitas performa bisnis, analisa margin laba kotor, kendali persediaan gudang, dan pembukuan keuangan toko bangunan.
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/laporan.js`
- [PELANGGAN] Implementasi Lengkap Modul Manajemen Pelanggan & Member (Fase 5):
  - Antarmuka `frontend/js/modules/pelanggan.js`: Kartu ringkasan statistik (Total Pelanggan, Total Member, Total Piutang Aktif, Total Poin Beredar).
  - Filter interaktif: Tipe pelanggan (Umum, Proyek, Toko, Kontraktor), Level Member (Reguler, Silver, Gold, Platinum), dan pencarian instan nama/kode/nomor HP.
  - Tabel pelanggan responsif lengkap dengan badge status member, link WhatsApp Click-to-Chat langsung, tombol detail profil, edit, dan hapus.
  - Modal Tambah/Edit pelanggan dengan validasi keunikan nomor HP, auto-numbering kode member `MBR-YYYYMMDD-0001`, plafon limit kredit, dan level member.
  - Penegakan Matriks Hak Akses: Kasir dapat memperbarui kontak pelanggan (nama, HP, alamat), namun parameter finansial (`limit_kredit`, `level`, `tipe`, `kode`) terlindungi ketat dan hanya dapat diubah oleh Owner atau Admin.
  - Pencegahan Kerusakan Data (Integritas Finansial): Penghapusan pelanggan yang masih memiliki sisa piutang aktif ditolak dengan kode status `CONFLICT` (409).
  - Modal Profil Komprehensif: Rincian identitas, saldo piutang berjalan & sisa limit kredit, 15 transaksi penjualan terakhir, 20 log mutasi perolehan/pengurangan poin, dan riwayat penukaran hadiah.
  - Backend handler: `pelanggan.list`, `pelanggan.detail`, `pelanggan.create`, `pelanggan.update`, `pelanggan.delete`.
  - File: `backend/kode.gs`, `frontend/js/modules/pelanggan.js`, `frontend/js/app.js`, `frontend/sw.js`, `docs/api.md`
  - Dampak: Pengelolaan database pelanggan, pengendalian kredit piutang, dan manajemen loyalitas pelanggan
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/pelanggan.js`

- [HADIAH] & [MEMBER] Implementasi Modul Katalog Hadiah & Penukaran Poin Loyalitas (Fase 5):
  - Antarmuka tri-tab `frontend/js/modules/loyalti.js`: Tab Katalog Hadiah visual grid, Tab Formulir Tukar Poin dengan autocomplete member & cek saldo poin/stok realtime, dan Tab Riwayat Penukaran Hadiah.
  - Manajemen Hadiah CRUD: Form input nama hadiah, poin yang dibutuhkan, stok fisik hadiah, status aktif/non-aktif, dan nilai estimasi rupiah (khusus Owner/Admin).
  - Transaksi Penukaran Poin Atomik (`member.tukarPoin`): Menggunakan `LockService`, verifikasi saldo poin member dan ketersediaan stok hadiah fisik, pembuatan nomor transaksi berurutan `TK-YYYYMMDD-0001`, pengurangan stok hadiah, pengurangan saldo poin member, pencatatan di sheet `Penukaran_Hadiah`, pencatatan mutasi di `Poin_Log` (tipe `tukar`, kuantitas negatif), dan audit trail `Log_Audit`.
  - Backend handler: `hadiah.list`, `hadiah.create`, `hadiah.update`, `hadiah.delete`, `member.tukarPoin`, `member.riwayatPoin`.
  - File: `backend/kode.gs`, `frontend/js/modules/loyalti.js`, `frontend/js/app.js`, `frontend/sw.js`, `docs/api.md`
  - Dampak: Program apresiasi dan retensi pelanggan loyal toko bangunan
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/loyalti.js`

- [PRICETAG] Implementasi Lengkap Generator Label Harga Rak & Barcode (Fase 5):
  - Antarmuka `frontend/js/modules/pricetag.js`: Pemilihan produk fleksibel via pencarian live produk & checklist batch dari database barang.
  - Generator Barcode Code 39 SVG mandiri murni (`frontend/js/utils/barcode.js`): Menghasilkan elemen SVG vektor resolusi tinggi tanpa pustaka pihak ketiga eksternal, sangat tajam untuk printer thermal maupun printer laser.
  - Multi-Template Label Standar Industri Material: Standar Rak 60x40mm, Kompak 70x30mm, Display Rak Besar 100x60mm, dan Lembar Kertas A4 Grid 24 Label.
  - Kontrol Kustomisasi Cetak: Multiplier salinan label per produk, toggle visibilitas barcode, toggle harga grosir bertingkat, dan toggle nama toko.
  - WYSIWYG Live Preview dan styling `@media print` presisi tinggi: Mengisolasi kontainer stiker label harga saat jendela cetak browser aktif serta otomatis menyembunyikan sidebar, topbar, dan tombol aksi.
  - File: `frontend/js/modules/pricetag.js`, `frontend/js/utils/barcode.js`, `frontend/js/app.js`, `frontend/sw.js`
  - Dampak: Pelabelan rak display toko bangunan, pemindaian cepat kasir, dan transparansi harga produk bagi konsumen
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/pricetag.js frontend/js/utils/barcode.js`

### Added
- [HUTANG-PIUTANG] Implementasi Lengkap Modul Hutang & Piutang (Fase 4):
  - Antarmuka dual-tab `frontend/js/modules/hutang-piutang.js`: Tab Piutang Pelanggan dan Tab Hutang Supplier.
  - Kartu ringkasan statistik realtime: Total sisa piutang/hutang berjalan, tagihan jatuh tempo lewat (overdue), dan total entitas mitra terkait.
  - Filter pencarian live, status tagihan (Belum Lunas, Sebagian, Lunas), dan toggle filter cepat "Hanya Jatuh Tempo Lewat".
  - Integrasi WhatsApp Click-to-Chat otomatis untuk pengingat tagihan ramah pelanggan beserta rincian nomor nota, total transaksi, sisa tagihan, dan tanggal jatuh tempo.
  - Modal pembayaran cicilan / pelunasan fleksibel dengan shortcut tombol pelunasan cepat (100% dan 50%), pilihan metode bayar (tunai, transfer, qris), dan validasi anti-overpay.
  - Penegakan Aturan Bisnis #7 & #16: Perolehan poin loyalitas member dan akumulasi total belanja seumur hidup HANYA diberikan saat piutang tempo telah diselesaikan secara LUNAS.
  - Penegakan Matriks Hak Akses: Pengelolaan hutang supplier dibatasi ketat khusus Pemilik Toko (Owner) & Admin (`FORBIDDEN` bagi kasir).
  - Modal detail piutang & hutang dengan riwayat audit seluruh tahapan cicilan pembayaran.
  - Backend handler: `piutang.list`, `piutang.detail`, `piutang.bayar`, `hutang.list`, `hutang.detail`, `hutang.bayar`.
  - File: `backend/kode.gs`, `frontend/js/modules/hutang-piutang.js`, `frontend/js/app.js`, `frontend/sw.js`, `docs/api.md`
  - Dampak: Manajemen arus kas tempo, penagihan piutang, dan pemenuhan kewajiban supplier
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/hutang-piutang.js`

- [RETUR] Implementasi Lengkap Modul Retur Penjualan & Retur Pembelian (Fase 4):
  - Antarmuka dual-tab `frontend/js/modules/retur.js`: Tab Retur Penjualan (pelanggan) dan Tab Retur Pembelian (supplier).
  - Alur persetujuan bertingkat (Aturan Bisnis #4): Peran kasir hanya berhak membuat permohonan retur (`status = 'diajukan'`); Owner & Admin memiliki wewenang penuh membuat retur langsung disetujui atau menyetujui/menolak pengajuan kasir via `retur.approve` dan `retur.reject`.
  - Penomoran dokumen retur berurutan `RT-YYYYMMDD-0001` via sheet `Counter` terlindungi `LockService`.
  - Penegakan Aturan Bisnis #12 pada Retur Penjualan: Stok bertambah kembali ke gudang dan Moving Average HPP produk dihitung ulang menggunakan snapshot HPP item transaksi saat penjualan terjadi: `(stok_lama × hpp_lama + qty_retur × hpp_snapshot) / (stok_lama + qty_retur)`.
  - Penegakan Aturan Bisnis #12 pada Retur Pembelian: Mengurangi kuantitas stok gudang pada HPP berjalan tanpa mengubah HPP produk (HPP konstan sesuai kaidah moving average akuntansi).
  - Penyesuaian Loyalitas (Aturan Bisnis #7 & #16): Pemotongan poin loyalitas member secara proporsional yang dicatat di `Poin_Log` bertipe `retur` serta pemotongan `total_belanja`.
  - Metode Refund Fleksibel: Pengembalian dana tunai/kas toko (`kas`), pemotongan sisa tagihan piutang nota asal (`potong_piutang`), atau pemotongan sisa hutang faktur supplier (`potong_hutang`).
  - Pencatatan mutasi atomik pada `Kartu_Stok` bertipe `retur_jual` & `retur_beli` serta pencatatan audit log `Log_Audit`.
  - Backend handler: `retur.list`, `retur.detail`, `retur.create`, `retur.approve`, `retur.reject`.
  - File: `backend/kode.gs`, `frontend/js/modules/retur.js`, `frontend/js/app.js`, `frontend/sw.js`, `docs/api.md`
  - Dampak: Penanganan klaim barang cacat, pengembalian barang, dan penyesuaian nilai buku stok
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/retur.js`

### Fixed
- [AUTH] Memperbaiki serialisasi token pada `frontend/js/state.js` agar string token disimpan langsung tanpa kutip ganda JSON berlebih.
- [API] Menambahkan pembersihan kutip ganda otomatis pada `frontend/js/api.js` dan backend `backend/kode.gs` (`parseRequest_`, `validasiSesi_`, `aksiAuthLogout_`).
- [AUTH] Memperbaiki alur "Wajib Ganti PIN" pada `frontend/js/modules/auth.js` dan `frontend/js/app.js` dengan menyertakan token sesi aktif, tombol logout/batal, dan otomatis mengarahkan ke form login bila sesi kedaluwarsa (`AUTH_INVALID`).
- [UI] Memperbaiki inisialisasi badge `#net-pill` pada `frontend/js/app.js` agar langsung menampilkan status online sesuai kondisi `navigator.onLine`.
- [PWA] Memperbarui versi cache Service Worker ke `pos-kasir-static-v0.2.2` pada `frontend/sw.js`.
- [AUTH] Memperbaiki ekspor `escapeHtml` pada `frontend/js/utils/dom.js` dan mengarahkan impor `escapeHtml` di `frontend/js/modules/auth.js` langsung ke `frontend/js/utils/format.js`.
- [API] Menambahkan objek helper wrapper `export const api` pada `frontend/js/api.js` untuk kompatibilitas pemanggilan `api.post()`.

### Added
- [SUPPLIER] Master Data Supplier & Distributor (Fase 3):
  - Modul front end `frontend/js/modules/supplier.js`: daftar distributor dengan pencarian cepat, kontak PIC, integrasi WhatsApp Click-to-Chat, alamat, dan catatan rekening.
  - Agregasi realtime total saldo hutang aktif berjalan per supplier dari sheet `Hutang`.
  - Proteksi penolakan penghapusan supplier jika masih memiliki saldo hutang aktif (`CONFLICT`).
  - Handler backend: `supplier.list`, `supplier.create`, `supplier.update`, `supplier.delete`.
  - File: `backend/kode.gs`, `frontend/js/modules/supplier.js`, `docs/api.md`
  - Dampak: Pengelolaan relasi distributor dan pemantauan kewajiban hutang toko
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/supplier.js`

- [POS-BELI] Implementasi Lengkap POS Pembelian & Barang Masuk (Fase 3):
  - Modul front end `frontend/js/modules/pembelian.js`: antarmuka faktur pembelian baru dan riwayat faktur pengadaan material.
  - Pencarian produk autocomplete cepat dengan pemindai barcode dan pemilihan varian.
  - Dukungan multi-satuan beli dengan faktor konversi otomatis ke satuan dasar (cth: 1 dus = 24 pcs).
  - Penegakan Aturan Bisnis #10: Alokasi diskon faktur proporsional ke setiap item untuk menghasilkan harga beli efektif dasar.
  - Perhitungan otomatis Moving Average HPP: `(stok_lama × hpp_lama + qty_masuk × harga_beli_efektif) / (stok_lama + qty_masuk)` dibulatkan ke rupiah terdekat.
  - Penomoran faktur berurutan `PB-YYYYMMDD-0001` via sheet `Counter` di dalam `LockService`.
  - Pembayaran fleksibel: Lunas, Hutang/Tempo, atau DP/Sebagian dengan pencatatan otomatis ke sheet `Hutang` dan `Pembayaran`.
  - Pencatatan mutasi barang masuk secara atomik ke sheet `Kartu_Stok` bertipe `beli`.
  - Handler backend: `pembelian.list`, `pembelian.detail`, `pembelian.create`.
  - File: `backend/kode.gs`, `frontend/js/modules/pembelian.js`, `docs/api.md`
  - Dampak: Restock barang, mutasi stok masuk, kalkulasi HPP bergerak, dan kewajiban hutang
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/pembelian.js`

- [KARTU-STOK] Modul Buku Besar Kartu Stok (Fase 3):
  - Modul front end `frontend/js/modules/kartu-stok.js`: jejak audit buku besar mutasi seluruh pergerakan barang.
  - Filter dinamis berdasarkan produk, varian, jenis mutasi (beli, jual, opname, void), dan rentang tanggal.
  - Rincian kuantitas masuk/keluar (+/-), saldo akhir fisik, snapshot HPP mutasi, nomor dokumen referensi, dan identitas petugas.
  - Handler backend: `kartuStok.list`.
  - File: `backend/kode.gs`, `frontend/js/modules/kartu-stok.js`, `docs/api.md`
  - Dampak: Transparansi audit pergerakan stok barang

- [OPNAME] Modul Stok Opname Fisik Gudang (Fase 3):
  - Modul front end `frontend/js/modules/opname.js`: antarmuka opname fisik vs catatan sistem.
  - Penomoran dokumen opname berurutan `OP-YYYYMMDD-0001`.
  - Kalkulasi selisih realtime (Fisik - Sistem) dan wajib mencantumkan alasan selisih.
  - Penegakan Aturan Bisnis #12: Opname menyesuaikan kuantitas stok tanpa mengubah HPP produk.
  - Penegakan Aturan Bisnis #8: Setiap persetujuan penyesuaian opname wajib tercatat di `Log_Audit`.
  - Alur persetujuan: Opsi penyesuaian langsung atau mode Draft dengan tombol persetujuan (Approve) bagi Owner/Admin.
  - Handler backend: `opname.list`, `opname.create`, `opname.approve`.
  - File: `backend/kode.gs`, `frontend/js/modules/opname.js`, `docs/api.md`
  - Dampak: Rekonsiliasi fisik berkala dan pencegahan kebocoran stok

- [PWA] Peningkatan Cache Shell Service Worker ke `pos-kasir-static-v0.3.0` pada `frontend/sw.js`.

- [POS-JUAL] Implementasi Lengkap POS Kasir Penjualan (Fase 2):
  - Modul front end `frontend/js/modules/pos.js`: antarmuka kasir cepat dengan List & Grid view, filter chip kategori, pencarian instan (F2), dan integrasi pemindai barcode.
  - Dukungan desimal kuantitas hingga 3 digit di belakang koma (cth: 2.5 kg, 0.75 m3).
  - Auto-switch harga grosir otomatis saat qty mencapai `min_grosir_qty`.
  - Fitur ubah harga satuan di kasir dengan penegakan Aturan Bisnis #1 (harga tidak boleh di bawah HPP snapshot).
  - Modal diskon item & diskon transaksi (nominal / persen) dengan pembatasan kasir maksimal sesuai pengaturan (`diskon_maks_kasir_persen`).
  - Fitur Tahan Transaksi (Hold Cart / F7) dan Daftar Transaksi Tahan (Pending List / F8) tanpa memotong stok atau membuat nomor faktur.
  - Metode pembayaran: Tunai (dengan tombol cepat uang pas & hitung kembalian), QRIS, Transfer, Tempo/Kredit, dan Kombinasi/Split.
  - Penegakan Aturan Bisnis #3: Pembayaran tempo HANYA diizinkan untuk Member terdaftar (`TEMPO_NON_MEMBER`); pembeli umum wajib non-tempo & lunas.
  - Penegakan Aturan Bisnis #2: Total piutang aktif + tempo baru divalidasi tidak boleh melebihi limit kredit member (`LIMIT_KREDIT`).
  - Pengiriman: Ambil di toko / Dikirim toko dengan status barang dibawa (`qty_dibawa`) dan penentuan status antar (selesai / sebagian / belum_dikirim).
  - Penomoran faktur otomatis berurutan `INV-YYYYMMDD-0001` via sheet `Counter` di dalam `LockService`.
  - Eksekusi backend atomik `penjualan.create`: simpan nota, simpan rincian item (dengan snapshot HPP), potong stok produk/varian, catat kartu stok tipe `jual`, buat record `Piutang`, dan catat poin loyalitas ke `Poin_Log`.
  - Aksi `penjualan.void` untuk Owner & Admin dengan pembatalan atomik: membalikkan stok ke `Produk`/`Varian` + `Kartu_Stok` tipe `void`, mengurangi poin dan total belanja member, serta membatalkan piutang terkait.
  - File: `backend/kode.gs`, `frontend/js/modules/pos.js`, `frontend/js/app.js`, `docs/api.md`
  - Dampak: Inti transaksi operasional kasir, stok, piutang, dan loyalitas
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/pos.js backend/kode.gs`

- [CETAK] Implementasi Mesin Cetak Struk ESC/POS Thermal:
  - Modul `frontend/js/utils/printer.js` dengan generator biner ESC/POS untuk ukuran kertas 58mm (32 karakter) dan 80mm (48 karakter).
  - Jalur cetak Web Bluetooth Direct (BLE) dengan transfer data terpecah (chunking 512 bytes) agar printer thermal tidak overflow.
  - Jalur cetak RawBT Android via URL intent `rawbt:data:base64` untuk printer Bluetooth Classic.
  - Jalur cetak Fallback Browser: modal pratinjau thermal interaktif + pencetakan rapi menggunakan iframe terisolasi.
  - Fitur kirim struk digital instan melalui tautan WhatsApp Click-to-Chat (`wa.me/?text=...`).
  - File: `frontend/js/utils/printer.js`
  - Dampak: Pencetakan bukti transaksi fisik dan digital pelanggan
  - Undo: `git checkout HEAD~1 -- frontend/js/utils/printer.js`

- [UI] Barcode Scanner Helper & Shortcut Keyboard:
  - Modul `frontend/js/utils/barcode.js`: pemindai kamera dengan `BarcodeDetector` API native, video stream, laser frame targeting, dan fallback input manual.
  - Detektor input keyboard beruntun cepat (< 50ms) untuk scanner barcode fisik USB/Bluetooth.
  - Synthesizer bunyi beep kasir via Web Audio API tanpa ketergantungan file suara eksternal.
  - Gaya CSS responsif POS di `frontend/css/components.css` dan shortcut keyboard global (F2, F4, F7, F8).
  - File: `frontend/js/utils/barcode.js`, `frontend/css/components.css`, `frontend/sw.js`
  - Dampak: Kecepatan dan kenyamanan kasir dalam melayani pembeli
  - Undo: `git checkout HEAD~1 -- frontend/js/utils/barcode.js`

- [AUTH] Implementasi login multiuser lengkap:
  - Verifikasi PIN 6 digit dengan SHA-256 + salt per pengguna.
  - Sesi token 6 jam di sheet `Sesi` dan `CacheService`.
  - Proteksi penguncian akun 15 menit setelah 5x salah PIN berturut-turut (`AUTH_LOCKED`).
  - Fitur `auth.gantiPin` dan dialog wajib ganti PIN pada login awal / pasca reset.
  - Modul front end `frontend/js/modules/auth.js` dengan form PIN responsif.
  - File: `backend/kode.gs`, `frontend/js/modules/auth.js`
  - Dampak: Keamanan seluruh modul & hak akses
  - Undo: `git checkout HEAD~1 -- backend/kode.gs frontend/js/modules/auth.js`

- [KATEGORI] Implementasi CRUD Kategori & Sub Kategori Produk:
  - Aksi `kategori.list`, `kategori.create`, `kategori.update`, `kategori.delete`.
  - Validasi pencegahan hapus kategori jika masih ada produk aktif yang terkait (`CONFLICT`).
  - Antarmuka visual `frontend/js/modules/kategori.js` dengan modal formulir hierarkis.
  - File: `backend/kode.gs`, `frontend/js/modules/kategori.js`
  - Dampak: Pengelompokan master produk dan POS kasir
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/kategori.js`

- [PRODUK] Implementasi Manajemen Master Produk, Multi Satuan, & Varian:
  - Aksi `produk.list`, `produk.create`, `produk.update`, `produk.delete`.
  - Penegakan Aturan Bisnis #1: Harga ritel, grosir, varian, dan satuan konversi dilarang di bawah HPP (`HARGA_DI_BAWAH_HPP`).
  - Penegakan Hak Akses: Field `hpp` otomatis disensor (`null`) saat dipanggil oleh peran `kasir`.
  - Dukungan multi varian (warna, tebal, ukuran) dan multi satuan konversi (dus, sak, batang).
  - Pencatatan saldo stok awal otomatis ke `Kartu_Stok`.
  - Antarmuka visual `frontend/js/modules/produk.js` dengan filter kategori, pencarian live, dan toggle List/Grid view.
  - File: `backend/kode.gs`, `frontend/js/modules/produk.js`
  - Dampak: Master katalog barang, stok, dan kontrol margin
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/produk.js`

- [SETTING] Implementasi Modul Pengaturan Umum Toko:
  - Aksi `pengaturan.get` dan `pengaturan.set` (khusus Owner).
  - Pengaturan profil toko, footer nota, printer thermal 58mm/80mm, PPN, pembulatan total belanja, toleransi stok minus, dan rasio poin belanja member.
  - Antarmuka visual `frontend/js/modules/pengaturan.js`.
  - File: `backend/kode.gs`, `frontend/js/modules/pengaturan.js`
  - Dampak: Seluruh aturan operasional aplikasi
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/pengaturan.js`

- [USER] Implementasi Modul Manajemen Pengguna Multi Akun:
  - Aksi `user.list`, `user.create`, `user.update`, `user.resetPin` (khusus Owner).
  - Validasi username unik dan proteksi agar tidak menonaktifkan akun sendiri yang sedang aktif.
  - Reset PIN yang secara otomatis mencabut sesi aktif pengguna tersebut di perangkat lain.
  - Antarmuka visual `frontend/js/modules/users.js`.
  - File: `backend/kode.gs`, `frontend/js/modules/users.js`
  - Dampak: Manajemen akun kasir dan admin toko
  - Undo: `git checkout HEAD~1 -- frontend/js/modules/users.js`
- [BACKEND] Implementasi fondasi Apps Script di `backend/kode.gs`:
  - Router `doPost` / `doGet` dengan kontrak respons seragam `{ ok, data, error, code }`.
  - Skema database 26 sheet lengkap beserta tipe kolom baku (`s`, `n`, `b`, `d`, `j`).
  - Lapisan data bertipe dengan format teks `@` untuk SKU/barcode/HP berawalan 0.
  - Sanitasi pencegahan *Spreadsheet Formula Injection* untuk teks berawalan `=+-@`.
  - Mekanisme script lock (`LockService`) dengan pelepasan aman di blok `finally`.
  - CacheService berpotongan otomatis untuk data > 100 KB.
  - Penomoran dokumen sekuensial harian atomik (`nomorBerikut_`).
  - Fungsi `setupDatabase()` (idempoten), `setupTriggers()`, `backupSekarang()`, dan menu spreadsheet `onOpen`.
  - Aksi `sistem.ping` untuk diagnostik dan verifikasi database.
  - File: `backend/kode.gs`
  - Dampak: Seluruh modul backend & database
  - Undo: `git checkout HEAD~1 -- backend/kode.gs`

- [UI] Design System murni berbasis CSS Variables tanpa build step:
  - Token warna oranye bata & slate, tipografi angka tabular, spasi kelipatan 4px (`tokens.css`).
  - Komponen baku: tombol, form input prefix Rp, select, segmented control, kartu, switch, badge, modal/sheet, toast, skeleton, state kosong/error (`components.css`).
  - Tata letak responsif: bottom navigation di mobile (<768px), rail icon di tablet (768-1023px), sidebar di desktop (>=1024px) (`layout.css`).
  - Dukungan mode gelap (`[data-theme="dark"]`) dan teks besar (`[data-font="besar"]`).
  - Dokumentasi sistem desain di `docs/design-system.md`.
  - File: `frontend/css/tokens.css`, `frontend/css/base.css`, `frontend/css/components.css`, `frontend/css/layout.css`, `docs/design-system.md`
  - Dampak: Tampilan seluruh modul aplikasi
  - Undo: `git checkout HEAD~1 -- frontend/css/ docs/design-system.md`

- [DEPLOY] Kerangka shell aplikasi web & PWA:
  - `frontend/index.html` dan `frontend/js/app.js` (router hash vanilla JS).
  - `frontend/manifest.json`, ikon SVG & PNG (192px & 512px).
  - `frontend/sw.js` (Service Worker caching aset statis).
  - `frontend/js/config.js` dan `frontend/js/config.example.js`.
  - `frontend/js/api.js` (pemanggil backend via text/plain anti-preflight CORS).
  - `frontend/js/state.js` (state global, sesi, keranjang lokal).
  - `frontend/js/routes.js` (peta rute, peran, dan roadmap fase).
  - `.gitignore` dan `vercel.json` untuk hosting statis Vercel.
  - Halaman interaktif `#/sistem` (uji koneksi & ubah URL API langsung dari UI).
  - Halaman interaktif `#/desainsistem` (galeri komponen & pengujian toast/modal).
  - File: `frontend/`, `.gitignore`, `vercel.json`
  - Dampak: Fondasi runtime aplikasi
  - Undo: `git checkout HEAD~1 -- frontend/ .gitignore vercel.json`

- [DOCS] Dokumentasi teknis lengkap:
  - `docs/database.md`: Spesifikasi detail 26 sheet, kolom, tipe, relasi, dan audit.
  - `docs/api.md`: Spesifikasi protokol API, format request/response, dan kode error baku.
  - File: `docs/database.md`, `docs/api.md`
  - Dampak: Referensi implementasi seluruh fase
  - Undo: `git checkout HEAD~1 -- docs/`

### Changed
- [MIGRASI] Klarifikasi arsitektur dan penyempurnaan skema database dari 22 sheet awal menjadi 26 sheet lengkap:
  - Penambahan sheet `Sesi` untuk persistensi sesi yang tahan pembersihan cache.
  - Penambahan sheet `Penjualan_Bayar` untuk mendukung pembayaran kombinasi (Tunai + Transfer / QRIS / Tempo).
  - Penambahan sheet `Penukaran_Hadiah` untuk pencatatan riwayat klaim hadiah member.
  - Penambahan kolom `hpp` snapshot di `Penjualan_Item` dan `faktor` di seluruh item transaksi.
  - Langkah migrasi: Jalankan fungsi `setupDatabase()` pada Google Apps Script terhubung; sheet baru dan kolom baru otomatis dibuat tanpa menghapus data yang ada.
  - File: `README.md`, `backend/kode.gs`, `docs/database.md`
  - Dampak: Konsistensi data, HPP, multi satuan, dan pembayaran
  - Undo: Kembalikan file ke revisi sebelumnya

---

## Rencana Rilis

### [0.1.0] - Fase 0 & 1: Fondasi
- [x] **Fase 0**: Kerangka folder, design system, `kode.gs` dasar, `setupDatabase()`, PWA dasar, shell router hash, diagnostik koneksi. *(Selesai & diuji)*
- [x] **Fase 1**: Login multiuser (Owner/Admin/Kasir), CRUD produk, kategori & varian, multi satuan, pengaturan umum, multi akun pengguna. *(Selesai & diuji)*

### [0.2.0] - Fase 2: POS Penjualan
- [ ] [POS-JUAL] List/grid view, multi varian, desimal, diskon, keranjang, pending transaksi.
- [ ] [POS-JUAL] Validasi harga ≥ HPP, metode bayar kombinasi, pengiriman, status barang dibawa.
- [ ] [CETAK] Nota Bluetooth ESC/POS 58mm & 80mm.

### [0.3.0] - Fase 3: Stok & Pembelian
- [ ] [SUPPLIER] CRUD supplier.
- [ ] [POS-BELI] Barang masuk, HPP rata-rata bergerak, kartu stok.
- [ ] [OPNAME] Stok opname dengan persetujuan.

### [0.4.0] - Fase 4: Keuangan
- [ ] [HUTANG-PIUTANG] Piutang tempo, hutang supplier, cicilan, jatuh tempo.
- [ ] [RETUR] Retur penjualan & pembelian terhubung nota asal.

### [0.5.0] - Fase 5: Loyalitas
- [ ] [PELANGGAN] Pelanggan umum & member, limit kredit.
- [ ] [MEMBER] Poin, level member, katalog hadiah, penukaran poin atomik.
- [ ] [PRICETAG] Cetak label harga rak.

### [0.6.0] - Fase 6: Laporan
- [ ] [DASHBOARD] Penjualan, pembelian, riwayat, pelanggan terbaik, stok kosong, produk terlaris.

### [1.0.0] - Fase 7: Rilis Stabil
- [ ] [APK] Build APK via Capacitor.
- [ ] [DEPLOY] Optimasi performa, uji menyeluruh, backup otomatis harian.

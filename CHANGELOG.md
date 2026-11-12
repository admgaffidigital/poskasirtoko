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

### Fixed
- [AUTH] Memperbaiki serialisasi token pada `frontend/js/state.js` agar string token disimpan langsung tanpa kutip ganda JSON berlebih.
- [API] Menambahkan pembersihan kutip ganda otomatis pada `frontend/js/api.js` dan backend `backend/kode.gs` (`parseRequest_`, `validasiSesi_`, `aksiAuthLogout_`).
- [AUTH] Memperbaiki alur "Wajib Ganti PIN" pada `frontend/js/modules/auth.js` dan `frontend/js/app.js` dengan menyertakan token sesi aktif, tombol logout/batal, dan otomatis mengarahkan ke form login bila sesi kedaluwarsa (`AUTH_INVALID`).
- [UI] Memperbaiki inisialisasi badge `#net-pill` pada `frontend/js/app.js` agar langsung menampilkan status online sesuai kondisi `navigator.onLine`.
- [PWA] Memperbarui versi cache Service Worker ke `pos-kasir-static-v0.2.2` pada `frontend/sw.js`.
- [AUTH] Memperbaiki ekspor `escapeHtml` pada `frontend/js/utils/dom.js` dan mengarahkan impor `escapeHtml` di `frontend/js/modules/auth.js` langsung ke `frontend/js/utils/format.js`.
- [API] Menambahkan objek helper wrapper `export const api` pada `frontend/js/api.js` untuk kompatibilitas pemanggilan `api.post()`.

### Added
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

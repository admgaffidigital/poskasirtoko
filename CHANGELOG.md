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

### Added
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
- [ ] **Fase 1**: Login multiuser (Owner/Admin/Kasir), CRUD produk, kategori & varian, multi satuan, pengaturan umum, multi akun pengguna.

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

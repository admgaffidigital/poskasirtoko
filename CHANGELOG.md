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

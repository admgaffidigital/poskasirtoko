# 🏗️ POS Kasir Toko Bangunan

Aplikasi Point of Sale (POS) untuk toko bangunan: penjualan, pembelian, stok, membership, hutang-piutang, dan laporan dalam satu sistem. Berjalan di **Web** dan **Android (APK)** dengan tampilan ala aplikasi native, responsif, dan ramah mobile.

> **Status:** Fase 0 (persiapan) selesai, menunggu review · **Versi:** 0.0.1 · **Versi skema DB:** 1 · **Dokumen wajib dibaca agent:** `README.md` → `CHANGELOG.md` → `PROMPT_ANTIGRAVITY.md`

---

## 📑 Daftar Isi

1. [Tujuan](#1-tujuan)
2. [Keputusan Teknis Final](#2-keputusan-teknis-final)
3. [Arsitektur & Tech Stack](#3-arsitektur--tech-stack)
4. [Prinsip UI/UX](#4-prinsip-uiux)
5. [Peran & Hak Akses](#5-peran--hak-akses)
6. [Modul & Fitur](#6-modul--fitur)
7. [Aturan Bisnis](#7-aturan-bisnis)
8. [Struktur Database (Spreadsheet)](#8-struktur-database-spreadsheet)
9. [Kontrak API](#9-kontrak-api)
10. [Alur Kerja Sistem](#10-alur-kerja-sistem)
11. [Keamanan](#11-keamanan)
12. [Struktur Folder](#12-struktur-folder)
13. [Pedoman untuk AI Agent](#13-pedoman-untuk-ai-agent)
14. [Changelog, Backup, Undo/Redo](#14-changelog-backup-undoredo)
15. [Instalasi & Deploy](#15-instalasi--deploy)
16. [Definition of Done](#16-definition-of-done)
17. [Roadmap](#17-roadmap)
18. [Ide Inovasi](#18-ide-inovasi)
19. [Batasan yang Diketahui](#19-batasan-yang-diketahui)

---

## 1. Tujuan

- Mempercepat transaksi kasir toko bangunan (multi varian, desimal, ritel/grosir).
- Mengontrol stok, HPP, dan margin secara akurat.
- Mengelola pelanggan member, poin, serta penjualan tempo/kredit.
- Menyajikan laporan yang mudah dibaca pemilik toko.
- Mudah dikelola, dikembangkan, dirawat, dan direvisi secara terstruktur.

## 2. Keputusan Teknis Final

Keputusan ini **mengikat**. Agent tidak boleh mengubahnya tanpa persetujuan tertulis dari pemilik proyek. (Klarifikasi K1–K18 disetujui pemilik proyek pada 2026-11-12, lihat CHANGELOG.)

| Topik | Keputusan | Alasan |
|---|---|---|
| Framework front end | **Vanilla JavaScript (ES Modules) + HTML + CSS**, tanpa build step | Paling stabil untuk agent AI, deploy statis di Vercel, mudah dirawat |
| Styling | CSS murni dengan **CSS variables** (design system sendiri) | Konsisten, tanpa dependensi |
| PWA | Ya (`manifest.json` + service worker, cache aset statis saja) | Bisa dipasang di HP dan jadi dasar APK |
| APK Android | **Capacitor** membungkus build web (Fase 7) | Akses Bluetooth native (termasuk Bluetooth Classic) |
| Metode HPP | **Rata-rata bergerak (moving average)**, per **satuan dasar** | Sederhana dan stabil di Spreadsheet; FIFO tidak dipakai |
| Mata uang | Rupiah (IDR), **integer tanpa desimal** | Hindari galat floating point |
| Qty | Boleh desimal, maksimal **3 digit** di belakang koma | Mendukung meter/kg/liter |
| Pembulatan | `subtotal = Math.round(qty × harga)`; pembulatan total ke kelipatan Rp100 terdekat bisa diaktifkan di Pengaturan (default: mati) | Konsisten dan dapat ditelusuri |
| Urutan hitung | diskon item → subtotal → diskon transaksi → pajak (jika aktif) → pembulatan | Satu urutan baku di front end dan backend |
| Stok minus | **Tidak diizinkan** (bisa diaktifkan Owner di Pengaturan) | Cegah selisih stok |
| Pajak (PPN) | **Mati** secara default, bisa diaktifkan di Pengaturan (default 11%) | Sebagian besar toko tidak memakai |
| Poin | **1 poin per Rp10.000** dari total setelah diskon, dibulatkan ke bawah, × pengali level (dapat diubah di Pengaturan) | Sederhana |
| Level member | Reguler, Perak (≥ Rp10 jt), Emas (≥ Rp50 jt) dari `total_belanja` bersih; pengali poin 1×, 1,25×, 1,5× (dapat diubah) | Memberi insentif |
| Tempo default | 30 hari; limit kredit per pelanggan (default 0 = harus diatur Owner/Admin dulu) | Aman secara default |
| Pelanggan umum | Transaksi tanpa pelanggan → `pelanggan_id` kosong | Tidak perlu record "Umum" |
| Pembayaran | Tunai, Transfer, QRIS, Tempo, atau **kombinasi**; rinciannya di sheet `Penjualan_Bayar` | Kombinasi bisa dilacak per metode |
| Pending transaksi | Disimpan **di server** (`Penjualan.status = pending`), **tidak menahan stok**, belum punya nomor nota; nomor diberikan saat final | Bisa dilanjutkan di perangkat lain, nomor nota tidak bolong |
| Offline | Di luar cakupan v1.0. Keranjang aktif disimpan di `localStorage` agar tidak hilang saat refresh | Validasi stok & nomor nota wajib di server |
| Sesi login | Token acak; yang disimpan hanya **hash token** di sheet `Sesi` + `CacheService` (cache sebagai percepatan); berlaku 6 jam, diperpanjang saat aktif | Tahan terhadap cache yang terhapus |
| Hash PIN | SHA-256 + salt per user (`Utilities.computeDigest`) | Tidak menyimpan teks polos |
| Kunci login | 5 kali gagal → kunci 15 menit; penghitung disimpan di sheet `Users` (`gagal_login`, `kunci_sampai`) | Tidak hilang saat cache dibersihkan |
| Akun Owner awal | `setupDatabase()` membuat user `owner` dengan **PIN acak 6 digit** yang ditampilkan sekali; wajib ganti PIN saat login pertama | Tidak ada PIN default yang di-hardcode |
| Printer | **ESC/POS** 58mm = 32 karakter, 80mm = 48 karakter. Jalur: (1) Web Bluetooth (printer BLE, Chrome Android), (2) aplikasi **RawBT** (printer Bluetooth Classic di Android), (3) cetak browser sebagai cadangan, (4) plugin Bluetooth Capacitor di APK | Banyak printer thermal murah hanya Bluetooth Classic |
| Format nomor | `INV-YYYYMMDD-0001` (jual), `PB-…` (beli), `RT-…` (retur), `OP-…` (opname), `TK-…` (tukar poin); urutan reset harian lewat sheet `Counter` | Mudah dilacak |
| Penyimpanan data | Tiap kolom punya tipe (`teks`, `angka`, `boolean`, `waktu`, `json`); kolom teks diformat teks (`@`) agar SKU/barcode/HP berawalan 0 tidak rusak; waktu disimpan sebagai teks `yyyy-MM-dd HH:mm:ss` (WIB) | Data tidak diubah otomatis oleh Spreadsheet |
| Daftar data | Aksi `*.list` memakai paginasi (`page`, `limit`, default 50, maks 200) | Spreadsheet & Apps Script lambat untuk data besar |
| Konfigurasi front end | `frontend/js/config.js` **di-commit**; hanya berisi URL Web App (bukan rahasia) | Deploy Vercel tanpa build step tetap berjalan |
| Zona waktu | `Asia/Jakarta` | Seragam |

## 3. Arsitektur & Tech Stack

| Lapisan | Teknologi |
|---|---|
| Editor / Dev | VS Code & Antigravity |
| Front end | Vanilla JS (ES Modules), push ke **GitHub** |
| Hosting | **Vercel** (auto-deploy branch `main`, output directory `frontend`) |
| Back end | **Google Apps Script** (`backend/kode.gs`) sebagai Web App |
| Database | **Google Spreadsheet** (satu sheet per entitas) |
| Platform | Web + Android APK (PWA → Capacitor) |

```
[Web / APK] ──HTTPS POST──► [Vercel: frontend] ──► [Apps Script Web App: kode.gs] ──► [Google Spreadsheet]
```

**Catatan teknis penting Apps Script:**
- Kirim request dengan `Content-Type: text/plain;charset=utf-8` (body JSON string) agar **tidak memicu CORS preflight**, yang tidak didukung Apps Script.
- Deploy Web App: *Execute as: Me*, *Who has access: Anyone*. Keamanan dijaga lewat token sesi, bukan lewat akses Google.
- Gunakan `LockService.getScriptLock()` pada semua operasi tulis.
- Gunakan operasi batch (`getValues`/`setValues`), bukan per-sel. Cache pembacaan berat dengan `CacheService` (maks 100 KB per key → data besar dipecah per potongan).
- Batas eksekusi ±6 menit per panggilan; kuota harian berlaku. Hindari loop panggilan berlebihan dari front end.

## 4. Prinsip UI/UX

- **Native-app feel**: bottom navigation di mobile, sidebar di desktop, transisi halus, tanpa reload halaman.
- **Responsif**: mobile-first (360px), tablet, desktop.
- **Konsisten**: satu design system (warna, tipografi, spasi, komponen) — lihat `docs/design-system.md`.
- **Ramah mobile**: target sentuh ≥ 44px, input angka memakai keypad numerik, tombol aksi utama mudah dijangkau ibu jari.
- **Cepat**: loading skeleton, cache aset statis, keranjang aktif tersimpan lokal (bukan antrean transaksi offline).
- **Aksesibel**: kontras jelas, label ringkas, pesan error mudah dipahami, mode gelap, opsi ukuran font besar.
- **Bahasa**: seluruh UI Bahasa Indonesia, format angka `1.234.567` dan tanggal `dd/mm/yyyy`.

## 5. Peran & Hak Akses

| Fitur | Owner | Admin | Kasir |
|---|:-:|:-:|:-:|
| Dashboard penjualan & pembelian | ✅ | ✅ | ❌ |
| Dashboard laba, HPP agregat, margin | ✅ | ❌ | ❌ |
| POS Penjualan | ✅ | ✅ | ✅ |
| Lihat HPP & margin per produk (Produk/POS) | ✅ | ✅ | ❌ |
| Produk & kategori (tambah/edit/hapus) | ✅ | ✅ | lihat saja |
| Price Tag | ✅ | ✅ | ❌ |
| Pelanggan (lihat, tambah) | ✅ | ✅ | ✅ |
| Pelanggan (edit limit kredit, tempo, hapus) | ✅ | ✅ | ❌ |
| Supplier | ✅ | ✅ | ❌ |
| POS Pembelian | ✅ | ✅ | ❌ |
| Kartu Stok | ✅ | ✅ | ❌ |
| Hutang & Piutang | ✅ | ✅ | lihat piutang saja |
| Stok Opname | ✅ | ✅ | ❌ |
| Retur | ✅ (langsung disetujui) | ✅ (langsung disetujui) | ajukan (perlu persetujuan) |
| Void transaksi hari yang sama | ✅ | ✅ | ❌ |
| Void transaksi hari sebelumnya | ✅ | ❌ | ❌ |
| Hadiah (kelola katalog) | ✅ | ✅ | ❌ |
| Tukar poin pelanggan | ✅ | ✅ | ✅ |
| Diskon di atas batas (`diskon_maks_kasir_persen`, default 10%) | ✅ | ✅ | ❌ |
| Multi akun pengguna | ✅ | ❌ | ❌ |
| Pengaturan umum & backup manual | ✅ | ❌ | ❌ |

> Hak akses **harus ditegakkan di backend**, bukan hanya disembunyikan di tampilan.

## 6. Modul & Fitur

### 6.1 Login Multiuser
Akun Owner / Admin / Kasir, username + PIN, sesi token, log login, kunci setelah gagal berulang, wajib ganti PIN pada login pertama/setelah reset.

### 6.2 Dashboard Laporan
Penjualan & Pembelian (harian/mingguan/bulanan), Riwayat Penjualan, Riwayat Pembelian, Pelanggan Terbaik, Stok Kosong/hampir habis, Produk Terlaris, filter rentang tanggal. Laba/HPP hanya untuk Owner.

### 6.3 POS Penjualan
- Tampilan produk **List view** dan **Grid view**, pencarian cepat + scan barcode (termasuk barcode satuan konversi).
- **Multi varian**, **multi satuan**, **desimal**, **diskon** (per item dan per transaksi, nominal atau persen).
- **Edit harga tidak boleh di bawah HPP** (dibandingkan per satuan jual: `hpp × faktor`).
- Menampilkan harga **HPP**, **ritel**, **grosir** (HPP hanya untuk role berizin).
- Keranjang belanja (tersimpan lokal) dan **pending transaksi** di server (simpan, lanjutkan, hapus).
- Jenis pembayaran: Tunai, Transfer, QRIS, Tempo/Kredit, atau kombinasi.
- Pengiriman: **Ambil di toko** / **Dikirim toko** (alamat + catatan).
- **Status bawa barang**: tandai item yang sudah dibawa dan yang belum; sisa menjadi daftar antar.
- **Tempo/Kredit hanya untuk member terdaftar.** Pembeli umum: Tunai/Transfer/QRIS (atau kombinasinya) dan wajib lunas.
- **Cetak nota** ESC/POS 58mm & 80mm (jalur cetak lihat bagian 2).

### 6.4 Produk
Buat, edit, hapus (soft delete), kategori & sub kategori, varian, satuan & konversi satuan (dengan barcode per satuan), harga ritel/grosir, HPP, stok minimum, barcode/SKU, foto.

### 6.5 Price Tag Harga
Cetak label harga rak: pilih produk, ukuran label, jumlah salinan, pratinjau.

### 6.6 Pelanggan
Pelanggan umum dan member, riwayat transaksi, limit kredit, tempo hari, saldo piutang.

### 6.7 Royalti Membership
Level member, perolehan poin, katalog hadiah, penukaran poin (dicatat di `Penukaran_Hadiah`), riwayat poin.

### 6.8 Supplier
Data supplier, riwayat pembelian, saldo hutang.

### 6.9 POS Pembelian
Input barang masuk (dengan satuan & konversi), update stok, hitung ulang HPP (rata-rata bergerak), pembayaran tunai atau hutang.

### 6.10 Hutang & Piutang
Piutang pelanggan tempo dan hutang ke supplier: cicilan, jatuh tempo, status, pengingat.

### 6.11 Stok Opname
Hitung fisik vs sistem, selisih otomatis, penyesuaian dengan alasan, persetujuan Owner/Admin.

### 6.12 Retur Penjualan & Pembelian
Retur terhubung ke nota asal (per item); efek ke stok, kas, poin, dan piutang/hutang. Retur dari Kasir berstatus `diajukan` dan baru berefek setelah disetujui Owner/Admin.

### 6.13 Multi Akun Pengguna
Tambah/nonaktifkan user, atur role, reset PIN (memaksa ganti PIN), paksa logout.

### 6.14 Pengaturan Umum
Profil toko, logo, footer nota, ukuran kertas printer, jalur cetak, aturan poin/level, pajak, pembulatan, stok minus, batas diskon kasir, backup manual.

## 7. Aturan Bisnis

1. Harga jual **tidak boleh < HPP** (validasi di front end **dan** backend). Berlaku untuk harga per item setelah diskon item, dan total setelah diskon transaksi tidak boleh di bawah total HPP transaksi.
2. Tempo/kredit **hanya member**; total piutang aktif + sisa tempo transaksi baru tidak boleh melebihi limit kredit. Tempo boleh sebagian (DP + sisa tempo).
3. Pembeli umum (tanpa pelanggan/tipe umum): Tunai/Transfer/QRIS atau kombinasinya, wajib lunas. Member boleh semua metode.
4. Transaksi final tidak diedit langsung; koreksi lewat **retur / void + alasan wajib**.
5. Setiap perubahan stok tercatat di `Kartu_Stok` (siapa, kapan, kenapa, qty dalam satuan dasar, saldo, HPP).
6. Hapus data = **soft delete** (`deleted = TRUE`).
7. **Poin hanya dari transaksi lunas**: tunai/non-tempo saat final; tempo saat piutangnya lunas. Retur dan void mengurangi poin terkait (saldo poin minimum 0, kekurangannya dicatat di `Log_Audit`).
8. Aksi sensitif (diskon di atas `audit_diskon_persen`, void, opname, ubah harga/HPP, ubah role, reset PIN, ubah pengaturan, login gagal) masuk `Log_Audit`.
9. Pengiriman parsial: `qty_dibawa` per item menentukan sisa antar; nota menampilkan sisa.
10. HPP dihitung ulang saat pembelian (per satuan dasar): `hpp_baru = (stok_lama × hpp_lama + qty_masuk × harga_beli_efektif) / (stok_lama + qty_masuk)`, dibulatkan ke rupiah. Jika `stok_lama ≤ 0` maka `hpp_baru = harga_beli_efektif`. Diskon faktur pembelian dialokasikan proporsional ke item untuk `harga_beli_efektif`.
11. `Penjualan_Item.hpp` menyimpan **HPP per satuan jual saat transaksi** (snapshot) agar laba historis tidak berubah.
12. Retur penjualan mengembalikan stok dan menghitung ulang HPP memakai HPP snapshot item asal (rumus aturan 10). Retur pembelian mengurangi stok pada HPP berjalan (HPP tidak berubah). Opname tidak mengubah HPP.
13. Void hanya untuk transaksi hari yang sama (Owner/Admin) atau kapan saja oleh Owner; efeknya membalik stok, kas, poin, piutang. Transaksi yang sudah punya retur atau pembayaran piutang tidak boleh di-void (gunakan retur).
14. Penukaran poin mengurangi poin dan stok hadiah secara atomik; poin tidak boleh negatif.
15. Diskon oleh Kasir dibatasi `diskon_maks_kasir_persen` dari subtotal (default 10%); di atas itu ditolak backend dengan kode `FORBIDDEN`.
16. `total_belanja` pelanggan bertambah saat transaksi final (bukan pending) dan berkurang saat retur/void; level dihitung ulang dari nilai ini.
17. Produk bervarian: stok, HPP, dan harga dikelola per varian; `Produk.stok` = jumlah stok varian (dihitung backend, hanya untuk tampilan).
18. Pending tidak menahan stok; stok divalidasi ulang saat transaksi difinalkan.

## 8. Struktur Database (Spreadsheet)

**Kolom umum di SEMUA sheet:** `id` (UUID, kolom pertama) dan di akhir: `created_at`, `updated_at`, `created_by`, `deleted` (TRUE/FALSE). Baris pertama = header, tidak boleh diubah urutannya tanpa migrasi tercatat di CHANGELOG. Detail tipe tiap kolom ada di `docs/database.md` dan konstanta `SKEMA` di `backend/kode.gs` (sumber kebenaran teknis).

Total **26 sheet**:

| Sheet | Kolom khusus |
|---|---|
| `Users` | username, nama, role, pin_hash, salt, aktif, wajib_ganti_pin, gagal_login, kunci_sampai, last_login |
| `Sesi` | user_id, token_hash, kedaluwarsa, terakhir_aktif, perangkat |
| `Kategori` | nama, parent_id, urutan |
| `Produk` | sku, barcode, nama, kategori_id, satuan_dasar, hpp, harga_ritel, harga_grosir, min_grosir_qty, stok, stok_min, punya_varian, foto_url, aktif |
| `Varian` | produk_id, nama_varian, sku, barcode, hpp, harga_ritel, harga_grosir, stok, stok_min, aktif |
| `Satuan_Konversi` | produk_id, satuan, faktor, barcode, harga_ritel, harga_grosir |
| `Pelanggan` | kode, nama, hp, alamat, tipe (umum/member), level, limit_kredit, tempo_hari, poin, total_belanja, aktif |
| `Supplier` | nama, kontak, hp, alamat, catatan, aktif |
| `Penjualan` | no_nota, tanggal, kasir_id, pelanggan_id, subtotal, diskon_tipe, diskon_nilai, diskon, pajak, pembulatan, total, bayar, kembalian, metode_bayar, status_bayar, pengiriman, alamat_kirim, status_antar, catatan, status (pending/final/void), void_alasan, void_oleh, void_at, poin_didapat |
| `Penjualan_Item` | penjualan_id, produk_id, varian_id, nama, satuan, faktor, qty, qty_dasar, qty_dibawa, tipe_harga, harga_asli, harga, hpp, diskon_tipe, diskon_nilai, diskon, subtotal |
| `Penjualan_Bayar` | penjualan_id, metode (tunai/transfer/qris/tempo), jumlah, referensi |
| `Pembelian` | no_faktur, no_faktur_supplier, tanggal, supplier_id, subtotal, diskon, total, bayar, status_bayar, jatuh_tempo, catatan, status |
| `Pembelian_Item` | pembelian_id, produk_id, varian_id, nama, satuan, faktor, qty, qty_dasar, harga_beli, subtotal |
| `Piutang` | penjualan_id, pelanggan_id, total, terbayar, sisa, jatuh_tempo, status (belum/sebagian/lunas) |
| `Hutang` | pembelian_id, supplier_id, total, terbayar, sisa, jatuh_tempo, status |
| `Pembayaran` | tipe (piutang/hutang), ref_id, jumlah, metode, tanggal, catatan |
| `Poin_Log` | pelanggan_id, jumlah (+/−), jenis (dapat/tukar/retur/void/koreksi), ref_id, saldo |
| `Hadiah` | nama, deskripsi, poin_dibutuhkan, stok, aktif |
| `Penukaran_Hadiah` | no_tukar, pelanggan_id, hadiah_id, qty, poin, catatan |
| `Kartu_Stok` | produk_id, varian_id, tipe (jual/beli/retur_jual/retur_beli/opname/void/koreksi), qty (+/−, satuan dasar), saldo, hpp, ref_id, user_id, keterangan |
| `Opname` | no_opname, tanggal, produk_id, varian_id, qty_sistem, qty_fisik, selisih, alasan, status (draft/disetujui/ditolak), disetujui_oleh, disetujui_at |
| `Retur` | no_retur, tipe (jual/beli), ref_id, pihak_id, tanggal, total, metode_refund, alasan, status (diajukan/disetujui/ditolak), disetujui_oleh, disetujui_at |
| `Retur_Item` | retur_id, ref_item_id, produk_id, varian_id, nama, satuan, faktor, qty, qty_dasar, harga, hpp, subtotal |
| `Pengaturan` | key, value (JSON) |
| `Log_Audit` | user_id, aksi, modul, ref_id, detail_json |
| `Counter` | key (mis. INV-20261112), nilai |

## 9. Kontrak API

**Request** (semua via `POST`, body JSON string, header `Content-Type: text/plain;charset=utf-8`):

```json
{ "action": "modul.aksi", "token": "…", "payload": { } }
```

**Respons seragam:**

```json
{ "ok": true, "data": { }, "error": null, "code": null }
{ "ok": false, "data": null, "error": "Pesan ramah pengguna", "code": "KODE_ERROR" }
```

**Kode error baku:** `AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_LOCKED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `STOK_KURANG`, `HARGA_DI_BAWAH_HPP`, `LIMIT_KREDIT`, `TEMPO_NON_MEMBER`, `POIN_KURANG`, `CONFLICT`, `SERVER`.

**Penamaan aksi:** `sistem.ping`, `auth.login`, `auth.logout`, `auth.me`, `auth.gantiPin`, `produk.list`, `produk.create`, `produk.update`, `produk.delete`, `penjualan.create`, `penjualan.pending.save`, `penjualan.void`, `pembelian.create`, `piutang.bayar`, `hutang.bayar`, `opname.create`, `opname.approve`, `retur.create`, `retur.approve`, `member.tukarPoin`, `laporan.dashboard`, `pengaturan.get`, `pengaturan.set`, dan seterusnya mengikuti pola `modul.aksi`.

**Paginasi** untuk semua aksi daftar: payload `{ page, limit, q, ... }`, respons `data: { items, total, page, limit }`.

Dokumentasi lengkap tiap aksi wajib ditulis di `docs/api.md` saat modul dibuat.

## 10. Alur Kerja Sistem

**Penjualan**
```
Login → pilih produk/varian/satuan → keranjang → diskon/edit harga (≥ HPP)
→ pilih pelanggan → metode bayar & pengiriman → konfirmasi
→ backend (dalam satu Lock): validasi semua → nomor nota → simpan nota + item + bayar
→ kurangi stok + Kartu_Stok → poin (bila lunas) → Piutang (bila tempo) → Log_Audit → cetak nota
```

**Pembelian**
```
Pilih supplier → input barang, satuan & harga beli → simpan
→ tambah stok → hitung ulang HPP → Kartu_Stok → catat Hutang bila belum lunas
```

**Retur**
```
Cari nota asal → pilih item (≤ qty yang belum diretur) → alasan
→ (Kasir: diajukan → disetujui Owner/Admin) → sesuaikan stok, kas, poin, piutang/hutang → Log_Audit
```

## 11. Keamanan

- Jangan simpan PIN teks polos; gunakan hash + salt. Token sesi disimpan sebagai hash.
- Semua aksi divalidasi **token + role** di backend.
- Validasi dan sanitasi seluruh input. Nilai **teks** berawalan `=`, `+`, `-`, `@` diberi awalan apostrof (`'`) saat ditulis ke Spreadsheet (cegah formula injection) — **tidak ditolak**, sehingga nomor HP `+62…` tetap valid. Kolom angka divalidasi sebagai angka.
- Spreadsheet database **tidak dibagikan** ke publik; hanya akun pemilik.
- URL Web App bukan rahasia (terlihat oleh siapa pun yang membuka aplikasi) sehingga boleh ada di `frontend/js/config.js`. **Tidak ada** rahasia/kredensial lain di front end atau repo.
- Batasi percobaan login; catat kegagalan ke `Log_Audit`.
- Front end selalu meng-escape data sebelum ditampilkan sebagai HTML (cegah XSS).

## 12. Struktur Folder

Root repositori = folder proyek ini.

```
./
├── README.md
├── CHANGELOG.md
├── PROMPT_ANTIGRAVITY.md
├── .gitignore
├── vercel.json
├── docs/
│   ├── database.md
│   ├── api.md
│   └── design-system.md
├── frontend/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/ (tokens.css, base.css, components.css, layout.css)
│   ├── js/
│   │   ├── config.js       # URL Web App (di-commit, bukan rahasia)
│   │   ├── app.js          # bootstrap & router hash
│   │   ├── routes.js       # daftar rute, menu, role, fase
│   │   ├── api.js          # pemanggil backend
│   │   ├── state.js        # state global + penyimpanan lokal
│   │   ├── modules/        # satu file per fitur: auth, pos, produk, pembelian, laporan, dst.
│   │   └── utils/          # format, dom, ui (komponen), printer, barcode
│   └── assets/ (icons/)
└── backend/
    └── kode.gs
```

Backup data tidak disimpan di repo; backup ada di Google Drive (lihat bagian 14).

## 13. Pedoman untuk AI Agent

1. **Jangan asal mengerjakan.** Satu fase/modul dalam satu waktu.
2. **Analisis sebab-akibat dulu**, baru kode.
3. **Baca README & CHANGELOG** sebelum memulai; keduanya sumber kebenaran.
4. **Konsisten** dengan design system, penamaan, struktur folder, dan keputusan teknis final.
5. **Jangan merusak fitur lain**: cek dampak ke stok, kas, poin, piutang.
6. **Lakukan debugging** dan uji manual sebelum menyatakan selesai.
7. **Catat setiap perubahan** di `CHANGELOG.md`.
8. **Beri ide inovatif** dan berkreasi maksimal, ditandai **[USULAN]**; jangan ubah aturan bisnis tanpa persetujuan.
9. **Presisi dan akurat**: bila ragu atau data kurang, tanyakan; jangan menebak.
10. **Jangan hardcode** rahasia.
11. Perubahan kolom wajib dilakukan serentak di `SKEMA` (`kode.gs`), `docs/database.md`, README bagian 8, dan CHANGELOG **[MIGRASI]**.

## 14. Changelog, Backup, Undo/Redo

- **Git**: commit kecil dan bermakna, satu fitur satu branch, merge ke `main` setelah diuji.
- Format commit: `feat(pos): …`, `fix(stok): …`, `refactor:`, `docs:`, `chore:`.
- **Tag rilis** di Git setiap versi (`v0.1.0`) agar mudah rollback.
- **`CHANGELOG.md`** wajib diperbarui pada setiap perubahan.
- **Backup data**: trigger Apps Script harian (jendela 23:00–24:00 WIB, sesuai perilaku trigger Apps Script) menyalin Spreadsheet ke folder Drive `Backup POS`, simpan 30 salinan terakhir; fungsi `setupTriggers()` dan `backupSekarang()` tersedia di `kode.gs`.
- **Rollback**: Vercel → redeploy deployment sebelumnya; Apps Script → pilih versi deployment lama; data → pulihkan dari salinan backup.
- **Migrasi skema**: setiap perubahan kolom dicatat di CHANGELOG (kategori `Changed`, label **[MIGRASI]**) dan `docs/database.md`; `setupDatabase()` aman dijalankan ulang dan akan menambahkan sheet/kolom yang belum ada tanpa menghapus data.

## 15. Instalasi & Deploy

1. **Buat repo GitHub** dan push isi folder ini.
2. **Buat Spreadsheet** kosong (mis. "DB POS Toko Bangunan") → *Extensions › Apps Script*.
3. Tempel isi `backend/kode.gs` ke file `Code.gs`. Di *Project Settings* set zona waktu `Asia/Jakarta`.
4. Pilih fungsi `setupDatabase` → *Run* → izinkan akses. **Catat PIN Owner** yang muncul (dialog di Spreadsheet & *Execution log*). Lalu jalankan `setupTriggers`.
5. **Deploy** → *New deployment* → *Web app* → Execute as *Me*, Access *Anyone* → salin URL (`…/exec`).
6. Isi `API_URL` di `frontend/js/config.js` dengan URL tersebut, commit & push.
7. Hubungkan repo ke **Vercel** (Framework: *Other*, Build command: kosong, Output directory: `frontend`) lalu deploy.
8. Buka URL Vercel → menu **Sistem** → *Cek Koneksi* harus berstatus terhubung. Login dengan akun `owner` (Fase 1) dan **segera ganti PIN**.
9. **Printer Bluetooth**: pasangkan di HP, pilih ukuran 58/80mm dan jalur cetak di Pengaturan.
10. **APK** (Fase 7): bungkus dengan Capacitor, build di Android Studio.

> Setiap kali `kode.gs` diubah: *Deploy › Manage deployments › Edit › Version: New version* agar URL tetap sama dan perubahan aktif.

## 16. Definition of Done

Sebuah modul dianggap selesai jika:
- [ ] Sesuai README (aturan bisnis & hak akses) dan keputusan teknis final.
- [ ] Validasi di front end **dan** backend.
- [ ] Efek ke stok/kas/poin/piutang benar dan tercatat di `Kartu_Stok` / `Log_Audit`.
- [ ] Tampil baik di layar 360px, tablet, dan desktop.
- [ ] Penanganan error dan state kosong/loading tersedia.
- [ ] Daftar uji manual dijalankan dan hasilnya dicatat.
- [ ] `docs/api.md` dan `docs/database.md` diperbarui.
- [ ] `CHANGELOG.md` diperbarui.

## 17. Roadmap

- [x] **Fase 0 – Persiapan**: kerangka folder, design system, `kode.gs` dasar, `setupDatabase()`, PWA dasar *(Selesai)*
- [x] **Fase 1 – Fondasi**: login multiuser, produk, kategori, varian, pengaturan, multi akun *(Selesai & diuji)*
- [x] **Fase 2 – POS Penjualan**: kasir, pending transaksi, nota Bluetooth *(Selesai & diuji)*
- [x] **Fase 3 – Stok & Pembelian**: supplier, POS pembelian, kartu stok, stok opname *(Selesai & diuji)*
- [ ] **Fase 4 – Keuangan**: hutang & piutang, retur
- [ ] **Fase 5 – Loyalitas**: pelanggan, membership, poin & hadiah, price tag
- [ ] **Fase 6 – Laporan**: dashboard lengkap
- [ ] **Fase 7 – Finalisasi**: APK Capacitor, optimasi, uji menyeluruh, backup otomatis

## 18. Ide Inovasi

- Mode **offline-first** dengan sinkronisasi otomatis (pasca v1.0).
- **Kalkulator kebutuhan material** (luas dinding → semen/bata/cat).
- Kirim nota via **WhatsApp** (tautan/PDF).
- **Pengingat piutang** otomatis.
- **Scan barcode** lewat kamera HP.
- **Notifikasi stok minimum** untuk Owner.
- **Rekomendasi restock** dari produk terlaris.
- Dashboard **laba rugi** dan margin per produk.
- Mode **tutup kasir** (rekap kas harian & selisih); sampai ada, kas dihitung dari `Penjualan_Bayar` + `Pembayaran` + refund retur.
- **Arsip tahunan** sheet besar (`Kartu_Stok`, `Log_Audit`, `Penjualan_Item`) ke Spreadsheet arsip.

## 19. Batasan yang Diketahui

- Web Bluetooth hanya mendukung printer **BLE** dan hanya di Chrome/Edge (Android/desktop), tidak di iOS. Printer Bluetooth Classic di web memakai aplikasi RawBT atau cetak browser.
- Apps Script: ±6 menit per eksekusi, kuota harian, latensi 1–3 detik per panggilan. Gunakan cache dan batch.
- Spreadsheet: maks 10 juta sel per file. Lakukan arsip berkala bila data tumbuh besar.
- `CacheService` dapat dikosongkan sewaktu-waktu oleh Google; data penting tetap di sheet.

---

_Dokumen ini adalah panduan utama proyek. Setiap perubahan fitur atau aturan wajib diperbarui di sini dan di `CHANGELOG.md`._

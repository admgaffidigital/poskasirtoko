# 🔌 Dokumentasi Kontrak API Backend

Backend POS Kasir Toko Bangunan berjalan di atas **Google Apps Script Web App** (`backend/kode.gs`) dengan antarmuka seragam berbasis POST JSON.

---

## 1. Protokol Komunikasi

- **Metode HTTP:** `POST` untuk semua aksi.
- **Header Permintaan:** `Content-Type: text/plain;charset=utf-8`
  > **Penting:** Penggunaan header `text/plain` wajib dilakukan untuk menghindari browser mengirim request *CORS Preflight (OPTIONS)*, yang tidak didukung oleh endpoint Google Apps Script.
- **Keamanan:** Setiap request (kecuali `sistem.ping` dan `auth.login`) wajib menyertakan token sesi valid pada parameter `token`. Hak akses pengguna diverifikasi di backend pada level eksekusi aksi.

---

## 2. Format Baku Request & Response

### 2.1 Format Request
Semua panggilan dikirim dengan body JSON string berstruktur:

```json
{
  "action": "modul.aksi",
  "token": "a1b2c3d4...",
  "payload": {
    "key": "value"
  }
}
```

### 2.2 Format Response Berhasil
```json
{
  "ok": true,
  "data": {
    /* Objek atau Array hasil */
  },
  "error": null,
  "code": null
}
```

### 2.3 Format Response Gagal
```json
{
  "ok": false,
  "data": null,
  "error": "Pesan kesalahan ramah pengguna dalam Bahasa Indonesia",
  "code": "KODE_ERROR_BAKU"
}
```

---

## 3. Daftar Kode Error Baku (`code`)

| Kode Error | Keterangan & Kondisi |
|---|---|
| `AUTH_REQUIRED` | Request membutuhkan login, tetapi parameter `token` kosong |
| `AUTH_INVALID` | Token sesi salah, kadaluwarsa, atau tidak terdaftar |
| `AUTH_LOCKED` | Akun terkunci sementara setelah 5x gagal memasukkan PIN berturut-turut |
| `FORBIDDEN` | Pengguna tidak memiliki role yang diizinkan untuk aksi ini |
| `VALIDATION` | Data input tidak memenuhi syarat (tipe salah, wajib diisi, dsb) |
| `NOT_FOUND` | Data atau aksi tidak ditemukan di sistem |
| `STOK_KURANG` | Stok barang tidak mencukupi dan pengaturan `stok_minus` dinonaktifkan |
| `HARGA_DI_BAWAH_HPP` | Kasir mencoba menjual barang dengan harga di bawah snapshot HPP |
| `LIMIT_KREDIT` | Transaksi tempo melebihi batas limit kredit pelanggan yang diizinkan |
| `TEMPO_NON_MEMBER` | Transaksi tempo/kredit diajukan untuk pelanggan umum (bukan member) |
| `POIN_KURANG` | Poin member tidak mencukupi untuk menukar hadiah yang dipilih |
| `CONFLICT` | LockService timeout karena server sedang memproses transaksi bersamaan |
| `SERVER` | Terjadi kesalahan internal tak terduga pada skrip server |

---

## 4. Standar Paginasi & Pencarian

Untuk seluruh aksi pengambilan daftar data (`*.list`), format request payload adalah:
```json
{
  "page": 1,
  "limit": 50,
  "q": "kata kunci pencarian"
}
```
Dan struktur respons `data` adalah:
```json
{
  "items": [ /* array objek data */ ],
  "total": 120,
  "page": 1,
  "limit": 50
}
```

---

## 5. Aksi yang Tersedia

### 5.1 Sistem & Diagnostik
- `sistem.ping`: Memeriksa status backend & kesiapan spreadsheet (Publik, payload: `{}`).

### 5.2 Autentikasi (`auth.*`)
- `auth.login`:
  - Akses: Publik
  - Payload: `{ "username": "owner", "pin": "123456" }`
  - Response `data`: `{ "token": "...", "user": { "id", "username", "nama", "role", "wajib_ganti_pin" } }`
  - Proteksi: 5x gagal PIN berturut-turut -> akun dikunci 15 menit (`AUTH_LOCKED`).
- `auth.logout`:
  - Akses: Semua role yang login
  - Payload: `{}`
  - Efek: Menghapus sesi di sheet `Sesi` dan membersihkan cache.
- `auth.me`:
  - Akses: Semua role yang login
  - Response `data`: `{ "user": { "id", "username", "nama", "role", "wajib_ganti_pin" } }`
- `auth.gantiPin`:
  - Akses: Semua role yang login
  - Payload: `{ "pin_lama": "123456", "pin_baru": "654321" }`
  - Response `data`: `{ "pesan": "PIN Anda berhasil diperbarui." }`

### 5.3 Kategori (`kategori.*`)
- `kategori.list`:
  - Akses: Semua role yang login
  - Response `data`: `{ "items": [ { "id", "nama", "parent_id", "urutan" } ] }`
- `kategori.create`:
  - Akses: Owner & Admin
  - Payload: `{ "nama": "Cat & Pelapis", "parent_id": "", "urutan": 1 }`
- `kategori.update`:
  - Akses: Owner & Admin
  - Payload: `{ "id": "...", "nama": "...", "parent_id": "...", "urutan": 2 }`
- `kategori.delete`:
  - Akses: Owner & Admin
  - Payload: `{ "id": "..." }`
  - Validasi: Ditolak (`CONFLICT`) jika masih digunakan oleh produk aktif.

### 5.4 Master Produk (`produk.*`)
- `produk.list`:
  - Akses: Semua role yang login
  - Payload: `{ "page": 1, "limit": 50, "q": "semen", "kategori_id": "", "aktif_saja": false }`
  - Hak Akses Khusus: Jika role pemanggil adalah `kasir`, field `hpp` pada produk dan seluruh varian otomatis disensor (`null`).
  - Response `data`: `{ "items": [ { "id", "nama", "sku", "barcode", "hpp", "harga_ritel", "harga_grosir", "stok", "stok_min", "varian": [...], "satuan_konversi": [...] } ], "total", "page", "limit" }`
- `produk.create`:
  - Akses: Owner & Admin
  - Payload: `{ "nama", "sku", "barcode", "kategori_id", "satuan_dasar", "hpp", "harga_ritel", "harga_grosir", "stok", "stok_min", "varian": [...], "satuan_konversi": [...] }`
  - Aturan Bisnis #1: Harga jual (ritel/grosir/varian/satuan) dilarang < HPP (`HARGA_DI_BAWAH_HPP`).
- `produk.update`:
  - Akses: Owner & Admin
  - Payload: `{ "id", ... }`
  - Efek: Memperbarui produk induk dan menyinkronkan daftar varian & satuan konversi.
- `produk.delete`:
  - Akses: Owner & Admin
  - Payload: `{ "id": "..." }`
  - Efek: Soft delete produk beserta seluruh varian dan satuan konversi terkait.

### 5.5 Pengaturan Umum (`pengaturan.*`)
- `pengaturan.get`:
  - Akses: Semua role yang login
  - Response `data`: `{ "pengaturan": { "toko_nama", "toko_hp", "printer_ukuran", "pajak_aktif", "pembulatan_aktif", ... } }`
- `pengaturan.set`:
  - Akses: Khusus Owner
  - Payload: Objek key-value pengaturan yang diubah.

### 5.6 Manajemen Pengguna (`user.*`)
- `user.list`:
  - Akses: Khusus Owner
  - Response `data`: `{ "items": [ { "id", "username", "nama", "role", "aktif", "wajib_ganti_pin", "last_login" } ] }` (tanpa pin_hash dan salt).
- `user.create`:
  - Akses: Khusus Owner
  - Payload: `{ "username": "kasir1", "nama": "Siti", "role": "kasir", "pin": "112233" }`
  - Efek: Akun dibuat dengan `wajib_ganti_pin: true`.
- `user.update`:
  - Akses: Khusus Owner
  - Payload: `{ "id": "...", "nama": "...", "role": "admin", "aktif": true }`
  - Validasi: Tidak dapat menonaktifkan atau mengubah role akun sendiri yang sedang aktif.
- `user.resetPin`:
  - Akses: Khusus Owner
  - Payload: `{ "id": "...", "pin_baru": "654321" }`
  - Efek: Reset hash PIN dan otomatis membatalkan seluruh sesi aktif pengguna tersebut di perangkat lain.

### 5.7 Pelanggan (`pelanggan.*`)
- `pelanggan.list`:
  - Akses: Semua role yang login (Owner, Admin, Kasir)
  - Payload: `{ "q": "...", "tipe": "member", "semua": true }`
  - Response `data`: `{ "items": [ { "id", "kode", "nama", "hp", "alamat", "tipe", "level", "limit_kredit", "tempo_hari", "poin", "total_belanja", "piutang_berjalan", "sisa_limit", "aktif" } ] }`
  - Efek: Menghitung akumulasi piutang berjalan aktif dan sisa limit kredit pelanggan tempo secara real-time.

### 5.8 POS Penjualan (`penjualan.*`)
- `penjualan.create`:
  - Akses: Semua role yang login (Owner, Admin, Kasir)
  - Tulis / LockService: Ya (Atomik)
  - Payload:
    ```json
    {
      "pelanggan_id": "...",
      "pengiriman": "ambil" | "dikirim",
      "alamat_kirim": "...",
      "catatan": "...",
      "items": [
        {
          "produk_id": "...",
          "varian_id": "...",
          "satuan": "ZAK",
          "faktor": 1,
          "qty": 2,
          "qty_dibawa": 2,
          "tipe_harga": "ritel",
          "harga": 65000,
          "diskon_tipe": "persen",
          "diskon_nilai": 5
        }
      ],
      "diskon_tipe": "nominal",
      "diskon_nilai": 0,
      "pembayaran": [
        { "metode": "tunai", "jumlah": 150000, "referensi": "" }
      ],
      "pending_id": "..."
    }
    ```
  - Validasi:
    - Stok cukup (bila `stok_minus === false`).
    - Harga jual item dan total transaksi tidak boleh di bawah HPP (`HARGA_DI_BAWAH_HPP`).
    - Diskon kasir tidak boleh melebihi batas `diskon_maks_kasir_persen` (default 10%).
    - Pembayaran tempo HANYA diizinkan untuk pelanggan tipe `member` (`TEMPO_NON_MEMBER`).
    - Total piutang berjalan + tempo baru tidak boleh melampaui limit kredit (`LIMIT_KREDIT`).
  - Efek:
    - Menghasilkan nomor nota resmi `INV-YYYYMMDD-0001` via sheet `Counter`.
    - Menyimpan data ke `Penjualan`, `Penjualan_Item` (dengan snapshot HPP), dan `Penjualan_Bayar`.
    - Mengurangi stok di `Produk`/`Varian` dan mencatat pengeluaran ke `Kartu_Stok` (tipe `jual`).
    - Menambahkan `Piutang` jika ada pembayaran tempo.
    - Menghitung dan menambahkan poin loyalitas + total belanja pelanggan member pada porsi pembayaran lunas (Aturan #7 & #16).
    - Menghapus draft `pending` jika transaksi difinalkan dari antrean tahan.
    - Mencatat aksi dan peringatan diskon tinggi ke `Log_Audit`.
- `penjualan.pending.save`:
  - Akses: Semua role yang login
  - Tulis: Ya
  - Payload: `{ "pelanggan_id", "pengiriman", "catatan", "items": [...] }`
  - Efek: Menyimpan transaksi dengan status `pending` (draft) tanpa memotong stok dan tanpa nomor INV resmi.
- `penjualan.pending.list`:
  - Akses: Semua role yang login
  - Response `data`: `{ "items": [ { "id", "no_nota", "total", "item_count", "pelanggan_nama", "created_at", "items" } ] }`
- `penjualan.pending.delete`:
  - Akses: Semua role yang login
  - Payload: `{ "id": "..." }`
  - Efek: Soft delete draft transaksi yang ditahan.
- `penjualan.detail`:
  - Akses: Semua role yang login
  - Payload: `{ "id": "..." }` atau `{ "no_nota": "..." }`
  - Response `data`: `{ "penjualan", "items", "pembayaran", "pelanggan", "kasir" }`
- `penjualan.void`:
  - Akses: Owner & Admin (Kasir ditolak `FORBIDDEN`)
  - Tulis: Ya (Atomik)
  - Payload: `{ "id": "...", "alasan": "..." }`
  - Validasi:
    - Admin hanya transaksi pada hari yang sama; Owner kapan saja.
    - Menolak transaksi yang sudah memiliki riwayat retur atau cicilan piutang (`CONFLICT`).
  - Efek:
    - Membalikkan pengurangan stok ke `Produk`/`Varian` dan mencatat kartu stok masuk bertipe `void`.
    - Membatalkan perolehan poin dan akumulasi belanja member terkait.
    - Membatalkan catatan `Piutang` jika ada tempo.
    - Mengubah status penjualan menjadi `void` dan mencatat alasan serta user ke `Log_Audit`.

---

## 6. Modul Stok & Pembelian (Fase 3)

### 6.1 Supplier
- `supplier.list`:
  - Akses: `owner`, `admin`
  - Payload: `{ "q": "...", "page": 1, "limit": 50, "aktif_saja": true }`
  - Response `data`: `{ "items": [ { "id", "nama", "kontak", "hp", "alamat", "catatan", "aktif", "saldo_hutang", "total_pembelian" } ], "total", "page", "limit" }`
- `supplier.create`:
  - Akses: `owner`, `admin` (Tulis: Ya)
  - Payload: `{ "nama", "kontak", "hp", "alamat", "catatan", "aktif" }`
  - Response `data`: `{ "supplier", "pesan" }`
- `supplier.update`:
  - Akses: `owner`, `admin` (Tulis: Ya)
  - Payload: `{ "id", "nama", "kontak", "hp", "alamat", "catatan", "aktif" }`
  - Response `data`: `{ "pesan" }`
- `supplier.delete`:
  - Akses: `owner`, `admin` (Tulis: Ya)
  - Payload: `{ "id": "..." }`
  - Validasi: Ditolak dengan `CONFLICT` bila supplier masih memiliki saldo hutang aktif (`sisa > 0`).

### 6.2 POS Pembelian
- `pembelian.list`:
  - Akses: `owner`, `admin`
  - Payload: `{ "q": "...", "supplier_id": "...", "status_bayar": "...", "dari": "YYYY-MM-DD", "sampai": "YYYY-MM-DD", "page": 1, "limit": 50 }`
  - Response `data`: `{ "items": [ { "id", "no_faktur", "no_faktur_supplier", "tanggal", "supplier_id", "supplier_nama", "subtotal", "diskon", "total", "bayar", "status_bayar" } ], "total", "page", "limit" }`
- `pembelian.detail`:
  - Akses: `owner`, `admin`
  - Payload: `{ "id": "..." }` atau `{ "no_faktur": "..." }`
  - Response `data`: `{ "pembelian", "items", "supplier", "hutang" }`
- `pembelian.create`:
  - Akses: `owner`, `admin` (Tulis: Ya - Atomik LockService)
  - Payload:
    ```json
    {
      "supplier_id": "...",
      "no_faktur_supplier": "...",
      "tanggal": "YYYY-MM-DD HH:mm:ss",
      "diskon": 0,
      "bayar": 500000,
      "jatuh_tempo": "YYYY-MM-DD",
      "catatan": "...",
      "items": [
        {
          "produk_id": "...",
          "varian_id": "...",
          "nama": "...",
          "satuan": "sak",
          "faktor": 1,
          "qty": 10,
          "harga_beli": 55000
        }
      ]
    }
    ```
  - Efek:
    - Menghasilkan nomor faktur berurutan `PB-YYYYMMDD-0001`.
    - Alokasi diskon faktur proporsional ke setiap item untuk menghitung harga beli efektif.
    - Menghitung ulang Moving Average HPP: `(stok_lama * hpp_lama + qty_dasar * harga_beli_dasar_efektif) / (stok_lama + qty_dasar)`.
    - Menambah stok pada `Produk` / `Varian`.
    - Mencatat mutasi di `Kartu_Stok` dengan tipe `beli`, saldo baru, dan snapshot HPP baru.
    - Mencatat saldo hutang di `Hutang` bila `bayar < total` (status `belum` atau `sebagian`).
    - Mencatat pembayaran DP di `Pembayaran` bila `bayar > 0`.
    - Mencatat riwayat audit di `Log_Audit`.

### 6.3 Kartu Stok
- `kartuStok.list`:
  - Akses: `owner`, `admin`
  - Payload: `{ "produk_id": "...", "varian_id": "...", "tipe": "...", "dari": "YYYY-MM-DD", "sampai": "YYYY-MM-DD", "q": "...", "page": 1, "limit": 50 }`
  - Response `data`: `{ "items": [ { "id", "created_at", "produk_id", "produk_nama", "produk_sku", "satuan_dasar", "varian_id", "varian_nama", "tipe", "qty", "saldo", "hpp", "ref_id", "petugas_nama", "keterangan" } ], "total", "page", "limit" }`

### 6.4 Stok Opname
- `opname.list`:
  - Akses: `owner`, `admin`
  - Payload: `{ "status": "disetujui|draft", "produk_id": "...", "dari": "...", "sampai": "...", "q": "...", "page": 1, "limit": 50 }`
  - Response `data`: `{ "items": [ { "id", "no_opname", "tanggal", "produk_nama", "varian_nama", "qty_sistem", "qty_fisik", "selisih", "alasan", "status", "penyetuju_nama", "disetujui_at" } ], "total", "page", "limit" }`
- `opname.create`:
  - Akses: `owner`, `admin` (Tulis: Ya)
  - Payload: `{ "produk_id": "...", "varian_id": "...", "qty_fisik": 45, "alasan": "...", "langsung_setuju": true|false }`
  - Efek:
    - Menghasilkan nomor dokumen `OP-YYYYMMDD-0001`.
    - Jika `langsung_setuju === true`: langsung menyesuaikan stok master, mencatat `Kartu_Stok` tipe `opname`, mencatat `Log_Audit` (aksi sensitif), dan HPP tidak berubah (Aturan Bisnis #12).
    - Jika `langsung_setuju === false`: tersimpan sebagai status `draft`.
- `opname.approve`:
  - Akses: `owner`, `admin` (Tulis: Ya)
  - Payload: `{ "id": "..." }`
  - Efek: Menyetujui dokumen draft, menyesuaikan stok master fisik, mencatat `Kartu_Stok` tipe `opname`, dan mencatat `Log_Audit`.

---

## 7. Modul Fase 4 – Keuangan (Hutang, Piutang, & Retur)

### 7.1 Piutang Pelanggan
- `piutang.list`:
  - Akses: `owner`, `admin`, `kasir`
  - Payload: `{ "status": "belum|sebagian|lunas", "pelanggan_id": "...", "jatuh_tempo_lewat": true|false, "cari": "...", "page": 1, "limit": 50 }`
  - Response `data`: `{ "items": [ { "id", "penjualan_id", "no_nota", "pelanggan_id", "nama_pelanggan", "hp_pelanggan", "total", "sisa", "jatuh_tempo", "status", "jatuh_tempo_lewat", "tanggal_nota" } ], "total_sisa_piutang", "total_data", "page", "total_halaman" }`
- `piutang.detail`:
  - Akses: `owner`, `admin`, `kasir`
  - Payload: `{ "id": "..." }`
  - Response `data`: `{ "piutang": { ... }, "penjualan": { ... }, "pelanggan": { ... }, "riwayat_pembayaran": [ { "id", "created_at", "jumlah", "metode", "catatan", "nama_petugas" } ] }`
- `piutang.bayar`:
  - Akses: `owner`, `admin`, `kasir` (Tulis: Ya)
  - Payload: `{ "id": "...", "jumlah": 200000, "metode": "tunai|transfer|qris", "catatan": "..." }`
  - Aturan Bisnis #7 & #16:
    - Mengurangi `sisa` piutang. Jika `sisa === 0`, status berubah menjadi `lunas`.
    - Poin loyalitas member dan akumulasi `total_belanja` HANYA diberikan saat piutang lunas.
    - Mencatat pembayaran pada sheet `Pembayaran`.
    - Mengembalikan `{ "pesan", "piutang_id", "status", "jumlah_bayar", "sisa", "poin_didapat" }`.

### 7.2 Hutang Supplier
- `hutang.list`:
  - Akses: `owner`, `admin` (Kasir: Dilarang / FORBIDDEN)
  - Payload: `{ "status": "belum|sebagian|lunas", "supplier_id": "...", "jatuh_tempo_lewat": true|false, "cari": "...", "page": 1, "limit": 50 }`
  - Response `data`: `{ "items": [ { "id", "pembelian_id", "no_faktur", "no_faktur_supplier", "supplier_id", "nama_supplier", "hp_supplier", "total", "sisa", "jatuh_tempo", "status", "jatuh_tempo_lewat", "tanggal_faktur" } ], "total_sisa_hutang", "total_data", "page", "total_halaman" }`
- `hutang.detail`:
  - Akses: `owner`, `admin`
  - Payload: `{ "id": "..." }`
  - Response `data`: `{ "hutang": { ... }, "pembelian": { ... }, "supplier": { ... }, "riwayat_pembayaran": [ ... ] }`
- `hutang.bayar`:
  - Akses: `owner`, `admin` (Tulis: Ya)
  - Payload: `{ "id": "...", "jumlah": 500000, "metode": "transfer|tunai|giro", "catatan": "..." }`
  - Efek: Mengurangi `sisa` hutang supplier dan mencatat riwayat cicilan di sheet `Pembayaran`.

### 7.3 Retur Penjualan & Retur Pembelian
- `retur.list`:
  - Akses: `owner`, `admin`, `kasir`
  - Payload: `{ "tipe": "jual|beli", "status": "diajukan|disetujui|ditolak", "pihak_id": "...", "cari": "...", "page": 1, "limit": 50 }`
  - Response `data`: `{ "items": [ { "id", "no_retur", "tipe", "ref_id", "no_transaksi_asal", "pihak_id", "nama_pihak", "total", "metode_refund", "alasan", "status", "dibuat_at", "nama_pembuat", "disetujui_oleh", "disetujui_at" } ], "total_retur_nominal", "total_data", "page", "total_halaman" }`
- `retur.detail`:
  - Akses: `owner`, `admin`, `kasir`
  - Payload: `{ "id": "..." }`
  - Response `data`: `{ "retur": { ... }, "items": [ ... ], "pihak": { ... }, "transaksi_asal": { ... } }`
- `retur.create`:
  - Akses: `owner`, `admin`, `kasir` (Tulis: Ya)
  - Payload:
    ```json
    {
      "tipe": "jual|beli",
      "ref_id": "ID_PENJUALAN_ATAU_PEMBELIAN",
      "alasan": "Keramik pecah dalam kardus",
      "metode_refund": "potong_piutang|potong_hutang|kas",
      "items": [
        {
          "produk_id": "...",
          "varian_id": "...",
          "satuan": "dus",
          "faktor": 1,
          "qty": 2,
          "harga": 85000,
          "hpp": 70000
        }
      ]
    }
    ```
  - Matriks & Aturan Bisnis #4, #7, #12, #16:
    - Dokumen berurutan: `RT-YYYYMMDD-0001`.
    - **Kasir:** status otomatis `diajukan` (menunggu persetujuan Owner/Admin).
    - **Owner / Admin:** status langsung `disetujui` dan efek retur langsung diterapkan.
    - **Retur Penjualan:** Stok bertambah. Moving Average HPP dihitung ulang memakai HPP snapshot item transaksi asal: `(stok_lama * hpp_lama + qty_retur * hpp_snapshot) / (stok_lama + qty_retur)`. Poin member dipotong proporsional di `Poin_Log` (jenis: `retur`) dan `total_belanja` berkurang. Refund memotong sisa piutang nota jika metode `potong_piutang`.
    - **Retur Pembelian:** Stok berkurang pada HPP berjalan. Sesuai standar akuntansi moving average, HPP tidak berubah. Refund memotong sisa hutang faktur jika metode `potong_hutang`.
- `retur.approve`:
  - Akses: `owner`, `admin` (Tulis: Ya, Kasir DILARANG)
  - Payload: `{ "id": "..." }`
  - Efek: Menyetujui pengajuan retur kasir, menerapkan perubahan stok fisik, kalkulasi moving average HPP, pemotongan poin member, dan penyesuaian piutang/hutang.
- `retur.reject`:
  - Akses: `owner`, `admin` (Tulis: Ya, Kasir DILARANG)
  - Payload: `{ "id": "...", "alasan_tolak": "..." }`
  - Efek: Mengubah status menjadi `ditolak` beserta alasan audit.

---

## 8. Peta Aksi Fase Selanjutnya (Roadmap)

- **Fase 5 (Loyalitas):**
  - `pelanggan.create`, `pelanggan.update`
  - `hadiah.list`, `hadiah.create`, `member.tukarPoin`
- **Fase 6 (Laporan):**
  - `laporan.dashboard`, `laporan.penjualan`, `laporan.stok`



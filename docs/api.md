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

---

## 6. Peta Aksi Fase Selanjutnya (Roadmap)

- **Fase 2 (POS Penjualan):**
  - `auth.login`, `auth.logout`, `auth.me`, `auth.gantiPin`
  - `kategori.list`, `kategori.create`, `kategori.update`, `kategori.delete`
  - `produk.list`, `produk.create`, `produk.update`, `produk.delete`
  - `pengaturan.get`, `pengaturan.set`
  - `user.list`, `user.create`, `user.update`, `user.resetPin`
- **Fase 2 (POS Penjualan):**
  - `penjualan.create`, `penjualan.pending.save`, `penjualan.pending.list`, `penjualan.void`
- **Fase 3 (Stok & Pembelian):**
  - `supplier.list`, `supplier.create`, `supplier.update`
  - `pembelian.create`, `kartustok.list`, `opname.create`, `opname.approve`
- **Fase 4 (Keuangan):**
  - `piutang.list`, `piutang.bayar`, `hutang.list`, `hutang.bayar`, `retur.create`, `retur.approve`
- **Fase 5 (Loyalitas):**
  - `pelanggan.list`, `pelanggan.create`, `pelanggan.update`
  - `hadiah.list`, `hadiah.create`, `member.tukarPoin`
- **Fase 6 (Laporan):**
  - `laporan.dashboard`, `laporan.penjualan`, `laporan.stok`


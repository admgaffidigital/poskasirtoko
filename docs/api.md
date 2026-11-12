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

## 5. Aksi yang Tersedia (Fase 0)

### `sistem.ping`
Memeriksa status operasional backend, ketersediaan database spreadsheet, dan versi skema.
- **Akses:** Publik (tanpa token)
- **Payload:** `{}`
- **Contoh Response `data`:**
  ```json
  {
    "pesan": "pong",
    "nama": "POS Kasir Toko Bangunan",
    "versi": "0.0.1",
    "versi_skema": 1,
    "versi_skema_db": 1,
    "db_siap": true,
    "waktu_server": "2026-11-12 13:30:00"
  }
  ```

---

## 6. Peta Aksi Fase Selanjutnya (Roadmap)

- **Fase 1 (Fondasi):**
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

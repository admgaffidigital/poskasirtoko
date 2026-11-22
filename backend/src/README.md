# Arsitektur Modular Backend (`backend/src/`)

Seluruh kode backend Google Apps Script dipecah menjadi **10 modul tematik** yang ringkas agar mudah dibaca, dirawat, dan dikembangkan di masa depan.

## Daftar Modul

| No | File Modul | Cakupan Utama |
|---|---|---|
| 00 | `00_konfig_skema_router.gs` | Konstanta `APP`/`ROLE`/`KODE`, `SKEMA` (28 tabel), `PENGATURAN_DEFAULT`, `RUTE` (76 aksi), `doGet`/`doPost`, Sesi & RBAC |
| 01 | `01_database_utilitas.gs` | Lapisan data (`sheet_` zero-migration, `pastikanKolomSkema_`, Cache L1/L2, CRUD baris), `LockService`, `nomorBerikut_`, `catatAudit_`, Validator `V_`, `sistem.ping`/`maintenance` |
| 02 | `02_auth_user_pengaturan.gs` | Login, Logout, Ganti PIN, Pengaturan Toko, Manajemen Multi-User |
| 03 | `03_kategori_produk.gs` | Kategori Hierarki, Produk, Varian, Satuan Konversi, Upload Foto Google Drive |
| 04 | `04_pos_penjualan.gs` | `pelanggan.list`, POS Penjualan (`create`, Ongkir, Deposit, Poin), Hold/Pending, Shift Kasir (X-Report), Void |
| 05 | `05_pembelian_stok.gs` | Supplier, POS Pembelian (*Landed Cost* Ongkir+Bongkar → HPP Moving Average), Kartu Stok, Stok Opname |
| 06 | `06_hutang_piutang_retur.gs` | Piutang Pelanggan, Hutang Supplier, Pembayaran Cicilan, Retur Jual/Beli (Kas/Potong Piutang/Deposit) |
| 07 | `07_pelanggan_loyalti_deposit.gs` | Pelanggan & Member, Saldo Titipan/Deposit (`deposit.tambah`/`tarik`/`riwayat`), Katalog Hadiah, Tukar Poin |
| 08 | `08_laporan_biaya.gs` | Dashboard Eksekutif, Laporan Penjualan, Pembelian, Arus Kas, Laba Rugi, Valuasi Stok, Biaya Operasional |
| 09 | `09_setup_trigger_beautifier.gs` | `setupDatabase()`, Trigger Backup Harian, Menu Spreadsheet, `percantikTampilanSpreadsheet()` |

## Alur Kerja Pengembangan & Deploy

1. **Edit** file modul yang relevan di `backend/src/` (misalnya `07_pelanggan_loyalti_deposit.gs`).
2. **Gabungkan otomatis** ke `backend/kode.gs`:
   ```bash
   npm run build:gas
   ```
   *(Juga otomatis dijalankan saat `npm run test:all` dan `npm run release`.)*
3. **Deploy ke Google Apps Script**:
   - **Cara 1 — Otomatis Multi-File via `clasp` (Direkomendasikan, 0 Copy-Paste)**:
     1. Aktifkan *Google Apps Script API* di https://script.google.com/home/usersettings (cukup 1 kali).
     2. Login sekali dari terminal: `npm run gas:login`
     3. Salin `.clasp.json.example` menjadi `.clasp.json`, lalu isi `scriptId` dari URL editor GAS Anda (`.clasp.json` otomatis diabaikan Git sehingga aman).
     4. Jalankan `npm run gas:push` → seluruh **10 file kecil `.gs`** langsung masuk rapi sebagai 10 tab terpisah di editor Google Apps Script (tidak lagi 1 file panjang!).
   - **Cara 2 — Manual 1 File (`kode.gs`)**: Salin hasil gabung otomatis `backend/kode.gs` ke editor Google Apps Script → **Deploy → Versi Baru**.

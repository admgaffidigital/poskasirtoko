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
2. **Validasi syntax & uji otomatis**:
   ```bash
   npm run check:gas
   npm run test:all
   ```
3. **Deploy langsung ke Google Apps Script (Multi-File via `clasp`)**:
   ```bash
   npm run gas:push
   ```
   Seluruh **10 file kecil `.gs`** langsung tersinkron ke 10 tab terpisah di editor Google Apps Script tanpa file monolith `kode.gs`.
   *(Setup awal bila di komputer baru: aktifkan GAS API → `npm run gas:login` → salin `.clasp.json.example` menjadi `.clasp.json` isi `scriptId`.)*

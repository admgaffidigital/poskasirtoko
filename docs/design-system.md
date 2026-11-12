# 🎨 Design System: POS Kasir Toko Bangunan

Dokumentasi sistem desain antarmuka POS Kasir Toko Bangunan. Dibangun menggunakan **CSS murni tanpa dependensi** dengan pendekatan *design token* (CSS Variables) dan *mobile-first*.

---

## 1. Prinsip Utama

1. **Native-App Feel**: Transisi halus, navigasi bawah (bottom navigation) di layar sentuh ponsel, sidebar di desktop, dialog modal dan bottom sheet kontekstual tanpa reload halaman.
2. **Karakter Toko Bangunan**: Palet warna Oranye Bata (*Terracotta / Brick Orange*) yang tegas, profesional, dipadukan dengan warna netral Baja Slate yang kontras dan bersih.
3. **Ramah Kasir & Mobile-First**: Target sentuh tombol dan elemen form minimal **44 × 44 px**, input angka sejajar kanan dengan font tabular, label jelas, dan penanganan error ramah.
4. **Aksesibilitas & Fleksibilitas**: Mendukung mode Gelap (*Dark Mode*) dan opsi teks besar (*Large Font*) untuk kenyamanan mata saat operasional toko dalam durasi panjang.

---

## 2. Design Tokens (`css/tokens.css`)

### 2.1 Palet Warna

| Token | Warna Terang (Light) | Warna Gelap (Dark) | Keterangan |
|---|---|---|---|
| `--primary` | `#e8590c` (Oranye Bata 600) | `#f76b1c` | Warna brand utama, tombol aksi primer |
| `--primary-hover` | `#d9480f` | `#ff8a3d` | Status hover tombol primer |
| `--primary-soft` | `#fff4e6` | `rgba(247,107,28,0.14)` | Latar badge, ikon aktif, chip |
| `--surface` | `#ffffff` | `#111a2e` | Latar kartu, modal, header |
| `--surface-2` | `#f8fafc` | `#17223a` | Latar selang-seling tabel, hover list |
| `--surface-3` | `#e2e8f0` | `#1f2c47` | Latar segmented control, divider tebal |
| `--bg` | `#f1f5f9` | `#0a101e` | Latar belakang keseluruhan aplikasi |
| `--border` | `#e2e8f0` | `#24324f` | Garis batas kartu, tabel |
| `--text` | `#0f172a` | `#f1f5f9` | Teks utama dengan kontras tinggi |
| `--text-muted` | `#64748b` | `#94a3b8` | Teks sekunder, keterangan, hint |
| `--success` | `#16a34a` | `#22c55e` | Status lunas, stok cukup, transaksi sukses |
| `--warning` | `#d97706` | `#f59e0b` | Stok menipis, peringatan, tempo jatuh tempo |
| `--danger` | `#dc2626` | `#ef4444` | Stok kosong, void, batas kredit, error |
| `--info` | `#2563eb` | `#3b82f6` | Status pending, panduan, info sistem |

### 2.2 Tipografi

- **Font Keluarga**: `"Inter", "Segoe UI", Roboto, sans-serif`
- **Font Monospace**: `"JetBrains Mono", Consolas, monospace` (untuk SKU, nota, token)
- **Skala Ukuran**:
  - `fs-xs` (12px): Badge, label sekunder
  - `fs-sm` (14px): Teks isi, tabel, hint
  - `fs-md` (16px): Input form, teks standar (mencegah auto-zoom iOS)
  - `fs-lg` (18px): Judul kartu, subheader
  - `fs-xl` (20px): Judul halaman
  - `fs-2xl` (24px): Angka total bayar, nilai statistik
- **Angka Tabular (`.num`)**: Menggunakan `font-variant-numeric: tabular-nums` agar kolom nominal uang dan kuantitas selalu rata dan mudah dibaca kasir.

### 2.3 Spasi & Radius

- **Skala Spasi**: Kelipatan 4px (`--sp-1`: 4px, `--sp-2`: 8px, `--sp-3`: 12px, `--sp-4`: 16px, `--sp-6`: 24px, `--sp-8`: 32px).
- **Border Radius**:
  - Tombol & Input: `10px` (`--radius-md`)
  - Kartu & Dialog: `14px` (`--radius-lg`) / `20px` (`--radius-xl`)
  - Badge & Chip: `999px` (`--radius-full`)

---

## 3. Breakpoint & Tata Letak Responsif (`css/layout.css`)

```
+-----------------------------------------------------------+
| 0px - 767px (Mobile):                                     |
| [ Top Bar ]                                               |
| [ Konten Layar Penuh ]                                    |
| [ Bottom Navigation Bar (5 tombol utama) ]                |
+-----------------------------------------------------------+
| 768px - 1023px (Tablet):                                  |
| [ Rail Sidebar Ikon 76px ] [ Top Bar + Konten Utama ]     |
+-----------------------------------------------------------+
| >= 1024px (Desktop):                                      |
| [ Sidebar Penuh 248px ]    [ Top Bar + Konten Utama ]     |
+-----------------------------------------------------------+
```

---

## 4. Panduan Komponen (`css/components.css`)

### 4.1 Tombol (`.btn`)
- `.btn-primary`: Aksi utama (Simpan Transaksi, Bayar, Tambah Produk).
- `.btn-secondary`: Aksi pendukung (Pilih Pelanggan, Diskon).
- `.btn-ghost`: Aksi tanpa border (Tutup, Navigasi kembali).
- `.btn-danger`: Aksi destruktif (Void Transaksi, Hapus Produk).
- `aria-busy="true"`: Menampilkan spinner putar otomatis di dalam tombol saat proses berjalan.

### 4.2 Formulir (`.field`, `.input`, `.select`)
- Input nominal Rupiah dilengkapi `.input-prefix` ("Rp") dan `.input-num`.
- Kuantitas desimal menggunakan keyboard numerik (`inputmode="decimal"`).
- Switch toggle (`.switch`) untuk opsi seperti Stok Minus dan Status Aktif.

### 4.3 Modal & Bottom Sheet (`.overlay`, `.dialog`)
- Pada layar seluler (<768px), dialog muncul sebagai **Bottom Sheet** yang mudah dijangkau satu tangan.
- Pada layar desktop (≥768px), dialog muncul sebagai **Modal Tengah**.
- Penutupan dapat dilakukan lewat tombol X, klik area gelap (overlay), atau tombol keyboard `Escape`.

### 4.4 Notifikasi Toast (`.toast-area`, `.toast`)
- Muncul di area atas bottom navigation pada mobile, atau pojok kanan bawah pada desktop.
- Varian: `success`, `error`, `warning`, `info`.
- Otomatis hilang setelah durasi yang ditentukan atau dapat ditutup manual.

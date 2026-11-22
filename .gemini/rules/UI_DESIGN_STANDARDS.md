# STANDAR MUTLAK KONSISTENSI UI/UX ANTAMUKA POS KASIR TOKO
==========================================================
Aturan ini WAJIB dipatuhi setiap kali membuat halaman baru, menambah komponen, atau memodifikasi tampilan di `frontend/`. Seluruh aturan ini juga diverifikasi otomatis oleh `tests/check_ui_consistency.js` pada setiap `npm run test` dan `npm run release`.

## 1. Desain 100% Solid Flat (Tanpa Efek Berat)
- **DILARANG** menggunakan `linear-gradient`, `radial-gradient`, `conic-gradient`, maupun `backdrop-filter` di seluruh CSS/JS/HTML.
- Gunakan warna solid bersih dari variabel tema agar tampilan tajam, profesional, dan ringan 60fps di Android WebView.

## 2. 100% Variabel Tema (`frontend/css/tokens.css`)
- **DILARANG** melakukan *hardcode* warna aksen (seperti `#e8590c`, `#ea580c`, `rgba(232, 89, 12, ...)`) di luar `tokens.css`, definisi palet `ACCENT_PALETTES` di `ui.js`, dan fallback `var(--primary, #e8590c)` di `index.html`.
- Wajib menggunakan token CSS baku:
  - Aksen: `var(--primary)`, `var(--primary-hover)`, `var(--primary-soft)`, `var(--primary-soft-text)`, `rgba(var(--primary-rgb), ...)`
  - Permukaan: `var(--bg)`, `var(--surface)`, `var(--surface-2)`, `var(--surface-3)`, `var(--border)`
  - Teks & Status: `var(--text)`, `var(--text-muted)`, `var(--success)`, `var(--warning)`, `var(--danger)`, `var(--info)`
- Semua elemen wajib berfungsi rapi di **3 mode tema** (`light`, `dark`, `warm`) dan **7 aksen warna**.

## 3. Komponen & Pola Baku Aplikasi
- **Kartu Statistik / Metrik**: Wajib menggunakan `.stat-card-pro` (bukan `.card.stat` lama) dengan `.stat-card-header`, `.stat-card-title`, `.stat-card-icon`, `.stat-card-value`, `.stat-card-desc`.
- **Ikon**: 100% wajib memakai `ICONS.*` yang terdaftar di `frontend/js/utils/ui.js` (**0 emoji**). Ikon ubah = `ICONS.edit`, ikon hapus = `ICONS.trash`.
- **Dialog & Notifikasi**: Wajib memakai `showToast()`, `showModal()`, dan `showConfirm({ ..., danger: true })` (**0 `alert()`, `confirm()`, `prompt()` bawaan browser**).
- **Tabel Responsif Mobile**: Setiap `<td>` pada tabel di luar `.keep-table` wajib memiliki atribut `data-label="..."` agar otomatis berubah rapi menjadi tampilan kartu native di layar HP.
- **Avatar & Baris Identitas**: Baris yang memuat `.prd-table-avatar` wajib `flex-wrap: nowrap` dengan `flex-shrink: 0` pada avatar agar tidak pernah terdorong ke baris baru.
- **Loading State**: Wajib menampilkan `renderSkeleton(...)` saat mengambil data baru, dan melewati skeleton bila cache SWR (`hasUsableApiCache`) sudah tersedia agar perpindahan tab bebas kedipan.

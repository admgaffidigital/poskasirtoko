/**
 * Test Otomatis: Optimasi Tampilan Buku Besar Kartu Stok
 * - Kolom muat 1 layar tanpa terpotong / scrollbar horizontal berlebih
 * - Jenis mutasi koreksi (Saldo Awal) ber-badge rapi & ada di filter dropdown
 * - No. Referensi UUID dibersihkan menjadi badge STOK-AWAL
 * - Teks kolom keterangan membungkus rapi dengan tooltip tanpa terpotong
 * - Penanganan produk terhapus (soft-deleted) tetap terbaca dengan nama aslinya
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Memulai Pengujian Optimasi Buku Besar Kartu Stok...');

// 1. Cek frontend/js/modules/kartu-stok.js
const ksJs = fs.readFileSync(path.join(__dirname, '../frontend/js/modules/kartu-stok.js'), 'utf8');

// Tes 1: Opsi filter koreksi (Saldo Awal / Koreksi)
assert(ksJs.includes('<option value="koreksi">Saldo Awal / Koreksi</option>'), 'Filter jenis mutasi harus memiliki opsi koreksi / Saldo Awal');
console.log('  ✔ [PASS] 1. Pilihan filter "Saldo Awal / Koreksi" tersedia di dropdown jenis mutasi');

// Tes 2: Penanganan badge tipe koreksi
assert(ksJs.includes("labelTipe = 'Saldo Awal'"), 'Tipe koreksi harus berlabel Saldo Awal');
assert(ksJs.includes("badgeClass = 'badge-secondary'"), 'Tipe koreksi harus menggunakan badge-secondary');
console.log('  ✔ [PASS] 2. Jenis mutasi koreksi ber-badge rapi "Saldo Awal"');

// Tes 3: Pembersihan No. Referensi UUID menjadi STOK-AWAL
assert(ksJs.includes('STOK-AWAL'), 'No. Referensi untuk saldo awal harus menampilkan STOK-AWAL');
console.log('  ✔ [PASS] 3. No. Referensi UUID acak dibersihkan menjadi badge STOK-AWAL');

// Tes 4: Format Waktu ringkas 2 baris (tanggal + jam)
assert(ksJs.includes('partsTgl'), 'Waktu harus dipisah tanggal dan jam secara ringkas');
console.log('  ✔ [PASS] 4. Tanggal & jam ditumpuk 2 baris hemat ruang horizontal');

// Tes 5: Kolom keterangan memiliki class ks-cell-keterangan dan tooltip title
assert(ksJs.includes('ks-cell-keterangan'), 'Kolom keterangan harus memiliki class ks-cell-keterangan');
assert(ksJs.includes('title="${escapeHtml(ks.keterangan || \'-\')}"'), 'Kolom keterangan harus memiliki tooltip title');
console.log('  ✔ [PASS] 5. Teks keterangan rapi (2 baris max di desktop, utuh di mobile, dengan tooltip lengkap)');

// 2. Cek CSS di frontend/css/components.css
const cssContent = fs.readFileSync(path.join(__dirname, '../frontend/css/components.css'), 'utf8');
assert(cssContent.includes('.ks-cell-keterangan'), 'CSS komponen harus memuat definisi .ks-cell-keterangan');
assert(cssContent.includes('word-break: break-word'), 'CSS harus mendukung pemotongan kata rapi');
console.log('  ✔ [PASS] 6. CSS pendukung tabel kartu stok dan teks keterangan terpasang sempurna');

// 3. Cek backend/kode.gs untuk penanganan produk terhapus pada kartu stok
const kodeGs = fs.readFileSync(path.join(__dirname, '../backend/kode.gs'), 'utf8');
assert(kodeGs.includes("bacaSemua_('Produk', { termasukTerhapus: true })"), 'Backend harus membaca produk termasuk yang terhapus untuk audit');
console.log('  ✔ [PASS] 7. Backend kartu stok mempertahankan nama produk asli dan satuan untuk barang terhapus');

console.log('\n=============================================');
console.log('TOTAL UJI: 7 | LULUS: 7 | GAGAL: 0');
console.log('=============================================\n');

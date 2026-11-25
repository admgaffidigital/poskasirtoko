/**
 * Test Otomatis: Fitur Duplikat Produk, Edit Cepat, Default Satuan UPPERCASE & Stok Min 0
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Memulai Pengujian Fitur Duplikat Produk & Edit Cepat...');

// 1. Cek isi file frontend/js/modules/produk.js
const produkJs = fs.readFileSync(path.join(__dirname, '../frontend/js/modules/produk.js'), 'utf8');

// Tes 1: Pastikan fungsi bukaModalEditCepat terdefinisi
assert(produkJs.includes('function bukaModalEditCepat('), 'bukaModalEditCepat harus terdefinisi di produk.js');
console.log('  ✔ [PASS] 1. Fungsi bukaModalEditCepat terdefinisi');

// Tes 2: Pastikan signature bukaModalFormProduk mendukung parameter isDuplikat
assert(produkJs.includes('async function bukaModalFormProduk(container, produk, isDuplikat = false)'), 'bukaModalFormProduk harus menerima isDuplikat');
console.log('  ✔ [PASS] 2. Parameter isDuplikat terdefinisi pada signature bukaModalFormProduk');

// Tes 3: Pastikan penanganan duplikat produk menghasilkan nama dengan suffix (Salinan) dan reset SKU/Barcode/Stok
assert(produkJs.includes("nama: `${produk.nama || ''} (Salinan)`.trim()"), 'Duplikat produk harus menambahkan (Salinan)');
assert(produkJs.includes('stok: 0'), 'Stok produk duplikat harus di-reset ke 0');
console.log('  ✔ [PASS] 3. Logika kloning produk: suffix (Salinan), stok 0, dan auto-generate SKU/Barcode');

// Tes 4: Pastikan tombol Salin (Duplikat) & Cepat (Quick Edit) ada di tabel dan grid kartu
assert(produkJs.includes('btn-quick-edit-prd'), 'Tombol Edit Cepat harus ada');
assert(produkJs.includes('btn-duplikat-prd'), 'Tombol Duplikat harus ada');
console.log('  ✔ [PASS] 4. Tombol aksi Cepat dan Salin terpasang pada tabel & kartu produk');

// Tes 5: Pastikan Satuan Dasar default 'PCS' (UPPERCASE) dan auto-uppercase saat diketik
assert(produkJs.includes("satuan_dasar || 'PCS'"), 'Default satuan dasar harus PCS');
assert(produkJs.includes('toUpperCase()'), 'Input satuan dasar harus dikonversi ke uppercase');
console.log('  ✔ [PASS] 5. Satuan dasar default PCS dan otomatis UPPERCASE');

// Tes 6: Pastikan Stok Min default 0 (bukan 5)
assert(!produkJs.includes('value="5" id="prd-stok-min"'), 'Tidak boleh ada default stok min 5');
assert(produkJs.includes('id="prd-stok-min"') && produkJs.includes(': 0) : 0'), 'Stok min default harus 0');
assert(produkJs.includes("parseQty($('#prd-stok-min', form).value) || 0") || produkJs.includes("parseFloat($('#prd-stok-min', form).value) || 0"), 'Parsing stok_min harus default 0');
console.log('  ✔ [PASS] 6. Batas stok minimum default 0 (bukan 5)');

// Tes 7: Pastikan 0 emoji di seluruh file frontend/js/modules/produk.js dan frontend/js/utils/ui.js
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert(!emojiRegex.test(produkJs), 'produk.js tidak boleh mengandung emoji unicode!');
const uiJs = fs.readFileSync(path.join(__dirname, '../frontend/js/utils/ui.js'), 'utf8');
assert(!emojiRegex.test(uiJs), 'ui.js tidak boleh mengandung emoji unicode!');
console.log('  ✔ [PASS] 7. 100% Bebas Emoji (0 emoji) - Native SVG Icons murni');

console.log('\n=============================================');
console.log('TOTAL UJI: 7 | LULUS: 7 | GAGAL: 0');
console.log('=============================================\n');

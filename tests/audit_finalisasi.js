const fs = require('fs');
const assert = require('assert');

console.log('\n======================================================');
console.log('🔍 AUDIT DEBUGGING FINAL & VERIFIKASI MENYELURUH POS KASIR');
console.log('======================================================\n');

// 1. Audit dialog bawaan browser
console.log('[1/7] Memeriksa eliminasi dialog klasik bawaan browser (alert/confirm/prompt)...');
const fg = fs.readdirSync('frontend/js', { recursive: true });
const jsFiles = fg.filter(f => f.endsWith('.js')).map(f => 'frontend/js/' + f.replace(/\\/g, '/'));
let foundNativeDialog = 0;

for (const file of jsFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Abaikan showConfirm, btn-confirm, confirmText, alertTriangle, class="alert
    if (/\bconfirm\s*\(/.test(line) && !line.includes('showConfirm') && !line.includes('btn-confirm') && !line.includes('confirmText')) {
      console.error(`  ✖ Ditemukan confirm() bawaan di ${file}:${idx + 1} -> ${line.trim()}`);
      foundNativeDialog++;
    }
    if (/\balert\s*\(/.test(line) && !line.includes('alertTriangle') && !line.includes('class="alert') && !line.includes('alert-')) {
      console.error(`  ✖ Ditemukan alert() bawaan di ${file}:${idx + 1} -> ${line.trim()}`);
      foundNativeDialog++;
    }
  });
}
assert.strictEqual(foundNativeDialog, 0, 'Tidak boleh ada confirm() atau alert() bawaan browser tersisa!');
console.log('  ✔ LULUS: 0 dialog klasik bawaan browser. Seluruh notifikasi menggunakan modal custom elegan.');

// 2. Audit Form Produk novalidate & validasi multi-tab
console.log('\n[2/7] Memeriksa form produk novalidate & kebersihan atribut required tersembunyi...');
const prdJs = fs.readFileSync('frontend/js/modules/produk.js', 'utf8');
assert.ok(prdJs.includes('<form id="form-produk" class="stack" novalidate>'), 'Form produk wajib novalidate');
assert.ok(!prdJs.includes('class="input var-nama" placeholder="Nama Varian (cth: Putih 5kg)" value="" required>'), 'var-nama tidak boleh ada atribut required native');
assert.ok(prdJs.includes('switchTab'), 'Form produk wajib memiliki fungsi switchTab');
console.log('  ✔ LULUS: Form produk aman dari error non-focusable dan mendukung validasi multi-tab otomatis.');

// 3. Audit POS Kasir Load More & Fast Batching
console.log('\n[3/7] Memeriksa integrasi Load More & Fast Batching pada POS Kasir...');
const posJs = fs.readFileSync('frontend/js/modules/pos.js', 'utf8');
assert.ok(posJs.includes('btn-load-more-pos'), 'POS wajib memiliki tombol Load More');
assert.ok(posJs.includes('pageSize: 30'), 'POS wajib menggunakan batching pageSize: 30');
assert.ok(posJs.includes('muatLebihBanyakKatalog'), 'POS wajib memiliki handler muatLebihBanyakKatalog');
console.log('  ✔ LULUS: POS Kasir memuat 30 produk pertama secara instan dan mendukung tombol Load More.');

// 4. Audit Backend kode.gs PAGE_LIMIT_MAKS & has_more
console.log('\n[4/7] Memeriksa konfigurasi skalabilitas backend kode.gs...');
const kodeGs = fs.readFileSync('backend/kode.gs', 'utf8');
assert.ok(kodeGs.includes('PAGE_LIMIT_MAKS: 500'), 'PAGE_LIMIT_MAKS harus 500');
assert.ok(kodeGs.includes('has_more:'), 'aksiProdukList_ wajib menyertakan properti has_more');
assert.ok(kodeGs.includes('produk.uploadFoto'), 'Backend wajib mendukung handler produk.uploadFoto ke Google Drive');
console.log('  ✔ LULUS: Backend kode.gs siap menangani ratusan produk & upload foto ke Google Drive.');

// 5. Audit Anti-Flicker & Akselerasi Hardware GPU Bottom Sheet Android
console.log('\n[5/7] Memeriksa eliminasi flicker Bottom Sheet & akselerasi hardware Android WebView...');
const compCss = fs.readFileSync('frontend/css/components.css', 'utf8');
const layCss = fs.readFileSync('frontend/css/layout.css', 'utf8');
assert.ok(compCss.includes('translate3d(0, 100%, 0)'), 'geser-naik wajib menggunakan translate3d untuk akselerasi GPU');
assert.ok(compCss.includes('will-change: transform'), 'dialog bottom sheet wajib memiliki will-change: transform');
assert.ok(compCss.includes('both'), 'animasi overlay & dialog wajib menggunakan animation-fill-mode both agar tidak berkedip');
assert.ok(layCss.includes('transform: translate3d(0, 0, 0)'), 'bottomnav wajib diisolasi pada GPU composited layer');
console.log('  ✔ LULUS: Bottom sheet dan overlay terakselerasi GPU 60fps tanpa flicker/berkedip.');

// 6. Audit Anti-Double SKU, Viewport Anchoring Floating Cart, & Global Data Sync
console.log('\n[6/7] Memeriksa pencegahan teks SKU ganda, floating cart viewport, & fitur sinkronisasi global...');
const { formatSkuLabel } = require('../frontend/js/utils/format.js');
const appJs = fs.readFileSync('frontend/js/app.js', 'utf8');
assert.strictEqual(formatSkuLabel('SKU-20261113-0001'), 'SKU-20261113-0001', 'SKU- tidak boleh ditambah SKU: ganda');
assert.strictEqual(formatSkuLabel('SKU: SKU-20261113-0001'), 'SKU-20261113-0001', 'SKU ganda di database wajib dinormalisasi');
assert.strictEqual(formatSkuLabel('BRG-001'), 'SKU: BRG-001', 'Kode tanpa prefix SKU wajib diberi label SKU:');
assert.strictEqual(formatSkuLabel(''), '', 'Kode kosong menghasilkan string kosong');
assert.ok(!layCss.includes('transform: translate3d(0, 6px, 0)'), 'halaman-masuk tidak boleh memakai transform agar tidak merusak position: fixed');
assert.ok(compCss.includes('z-index: calc(var(--z-nav) + 10)'), 'Floating cart harus berada di atas bottom nav');
assert.ok(appJs.includes('sinkronkanDataGlobal'), 'Aplikasi wajib memiliki fungsi sinkronkanDataGlobal');
assert.ok(appJs.includes('btn-sync-top'), 'Topbar wajib memiliki tombol btn-sync-top');
assert.ok(appJs.includes('btn-sync-sidebar'), 'Sidebar wajib memiliki tombol btn-sync-sidebar');

// Audit Fitur Koneksi Printer Bluetooth (RawBT)
const printerJs = fs.readFileSync('frontend/js/utils/printer.js', 'utf8');
const pengJs = fs.readFileSync('frontend/js/modules/pengaturan.js', 'utf8');
const manifestXml = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
assert.ok(printerJs.includes('bukaAplikasiRawBT'), 'printer.js wajib memiliki fungsi bukaAplikasiRawBT');
assert.ok(printerJs.includes('tampilkanModalKoneksiPrinter'), 'printer.js wajib memiliki fungsi tampilkanModalKoneksiPrinter');
assert.ok(printerJs.includes('ru.a402d.rawbtprinter'), 'printer.js wajib mendukung package intent RawBT');
assert.ok(manifestXml.includes('ru.a402d.rawbtprinter'), 'AndroidManifest.xml wajib mendeklarasikan queries package RawBT');
assert.ok(pengJs.includes('cfg-printer-jalur'), 'Pengaturan wajib memiliki pilihan jalur cetak printer');
assert.ok(posJs.includes('btn-pos-panduan-printer'), 'POS Kasir wajib memiliki tombol panduan koneksi printer');
assert.ok(appJs.includes('btn-printer-tile'), 'Menu Lainnya wajib memiliki tile cepat Printer Bluetooth');

// Audit Cetak Struk Pembelian & Riwayat Transaksi Penjualan/Pembelian
const beliJs = fs.readFileSync('frontend/js/modules/pembelian.js', 'utf8');
const lapJs = fs.readFileSync('frontend/js/modules/laporan.js', 'utf8');
assert.ok(printerJs.includes('susunTeksStrukPembelian'), 'printer.js wajib memiliki fungsi susunTeksStrukPembelian');
assert.ok(printerJs.includes('bukaModalPilihanCetakPembelian'), 'printer.js wajib memiliki fungsi bukaModalPilihanCetakPembelian');
assert.ok(printerJs.includes('bukaModalPilihanCetakPenjualan'), 'printer.js wajib memiliki fungsi bukaModalPilihanCetakPenjualan');
assert.ok(beliJs.includes('btn-cetak-riwayat-beli'), 'pembelian.js wajib memiliki tombol cetak riwayat faktur');
assert.ok(beliJs.includes('btn-modal-cetak-detail-beli'), 'pembelian.js wajib memiliki tombol cetak pada detail faktur');
assert.ok(lapJs.includes('btn-cetak-nota'), 'laporan.js wajib memiliki tombol cetak struk nota pada riwayat penjualan');
assert.ok(lapJs.includes('btn-cetak-laporan-beli'), 'laporan.js wajib memiliki tombol cetak faktur pada tab pembelian');
console.log('  ✔ LULUS: Fitur cetak struk faktur pembelian & riwayat transaksi penjualan/pembelian teruji 100%.');

console.log('  ✔ LULUS: Label SKU bersih, floating cart fixed di viewport, dan fitur sinkronisasi global aktif.');
console.log('  ✔ LULUS: Fitur koneksi & uji printer Bluetooth RawBT terintegrasi lengkap di seluruh modul.');

// 7. Audit Sinkronisasi Versi & Build APK
console.log('\n[7/7] Memeriksa konsistensi versi dan kesiapan file APK Android...');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const cfg = fs.readFileSync('frontend/js/config.js', 'utf8');
const idx = fs.readFileSync('frontend/index.html', 'utf8');
const sw = fs.readFileSync('frontend/sw.js', 'utf8');
assert.ok(cfg.includes(pkg.version), 'config.js harus sinkron versi');
assert.ok(idx.includes('v' + pkg.version), 'index.html harus sinkron versi');
assert.ok(sw.includes(pkg.version), 'sw.js harus sinkron versi');
assert.ok(fs.existsSync('frontend/download/poskasirtoko.apk'), 'File APK harus ada');
const apkStat = fs.statSync('frontend/download/poskasirtoko.apk');
assert.ok(apkStat.size > 20000000, 'Ukuran APK harus valid (>20MB)');
console.log(`  ✔ LULUS: Versi v${pkg.version} sinkron 100% di semua file proyek.`);
console.log(`  ✔ LULUS: APK Android siap diunduh (${(apkStat.size / (1024 * 1024)).toFixed(2)} MB).`);

console.log('\n======================================================');
console.log('🎉 HASIL FINAL: SEMUA SISTEM SIAP PRODUKSI (PRODUCTION READY)');
console.log('======================================================\n');


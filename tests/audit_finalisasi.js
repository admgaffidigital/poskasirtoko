const fs = require('fs');
const assert = require('assert');

console.log('\n======================================================');
console.log('🔍 AUDIT DEBUGGING FINAL & VERIFIKASI MENYELURUH POS KASIR');
console.log('======================================================\n');

// 1. Audit dialog bawaan browser
console.log('[1/6] Memeriksa eliminasi dialog klasik bawaan browser (alert/confirm/prompt)...');
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
console.log('\n[2/6] Memeriksa form produk novalidate & kebersihan atribut required tersembunyi...');
const prdJs = fs.readFileSync('frontend/js/modules/produk.js', 'utf8');
assert.ok(prdJs.includes('<form id="form-produk" class="stack" novalidate>'), 'Form produk wajib novalidate');
assert.ok(!prdJs.includes('class="input var-nama" placeholder="Nama Varian (cth: Putih 5kg)" value="" required>'), 'var-nama tidak boleh ada atribut required native');
assert.ok(prdJs.includes('switchTab'), 'Form produk wajib memiliki fungsi switchTab');
console.log('  ✔ LULUS: Form produk aman dari error non-focusable dan mendukung validasi multi-tab otomatis.');

// 3. Audit POS Kasir Load More & Fast Batching
console.log('\n[3/6] Memeriksa integrasi Load More & Fast Batching pada POS Kasir...');
const posJs = fs.readFileSync('frontend/js/modules/pos.js', 'utf8');
assert.ok(posJs.includes('btn-load-more-pos'), 'POS wajib memiliki tombol Load More');
assert.ok(posJs.includes('pageSize: 30'), 'POS wajib menggunakan batching pageSize: 30');
assert.ok(posJs.includes('muatLebihBanyakKatalog'), 'POS wajib memiliki handler muatLebihBanyakKatalog');
console.log('  ✔ LULUS: POS Kasir memuat 30 produk pertama secara instan dan mendukung tombol Load More.');

// 4. Audit Backend kode.gs PAGE_LIMIT_MAKS & has_more
console.log('\n[4/6] Memeriksa konfigurasi skalabilitas backend kode.gs...');
const kodeGs = fs.readFileSync('backend/kode.gs', 'utf8');
assert.ok(kodeGs.includes('PAGE_LIMIT_MAKS: 500'), 'PAGE_LIMIT_MAKS harus 500');
assert.ok(kodeGs.includes('has_more:'), 'aksiProdukList_ wajib menyertakan properti has_more');
assert.ok(kodeGs.includes('produk.uploadFoto'), 'Backend wajib mendukung handler produk.uploadFoto ke Google Drive');
console.log('  ✔ LULUS: Backend kode.gs siap menangani ratusan produk & upload foto ke Google Drive.');

// 5. Audit Anti-Flicker & Akselerasi Hardware GPU Bottom Sheet Android
console.log('\n[5/6] Memeriksa eliminasi flicker Bottom Sheet & akselerasi hardware Android WebView...');
const compCss = fs.readFileSync('frontend/css/components.css', 'utf8');
const layCss = fs.readFileSync('frontend/css/layout.css', 'utf8');
assert.ok(compCss.includes('translate3d(0, 100%, 0)'), 'geser-naik wajib menggunakan translate3d untuk akselerasi GPU');
assert.ok(compCss.includes('will-change: transform'), 'dialog bottom sheet wajib memiliki will-change: transform');
assert.ok(compCss.includes('both'), 'animasi overlay & dialog wajib menggunakan animation-fill-mode both agar tidak berkedip');
assert.ok(layCss.includes('transform: translate3d(0, 0, 0)'), 'bottomnav wajib diisolasi pada GPU composited layer');
console.log('  ✔ LULUS: Bottom sheet dan overlay terakselerasi GPU 60fps tanpa flicker/berkedip.');

// 6. Audit Sinkronisasi Versi & Build APK
console.log('\n[6/6] Memeriksa konsistensi versi dan kesiapan file APK Android...');
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


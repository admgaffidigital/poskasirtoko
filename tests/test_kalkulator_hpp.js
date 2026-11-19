/**
 * Test Otomatis: Kalkulator HPP Presisi & Pembulatan Bebas Pecahan
 * Menguji:
 * 1. Pembagian dasar & pembulatan bebas pecahan (Rp 1, Rp 50, Rp 100, Rp 500, Rp 1.000)
 * 2. Mode pembulatan Ke Atas (ceil / aman margin) vs Terdekat (round)
 * 3. Proteksi floating-point epsilon (hasil bulat pas tidak melonjak)
 * 4. Diskon tunggal & diskon bertingkat ala distributor (cth: 10+5 -> efektif 14.5%)
 * 5. Kombinasi lengkap Landed Cost: Diskon Bertingkat + PPN 11% + Ongkir + Bonus Barang Gratis
 * 6. Edge case input kosong/nol/negatif/string aneh (bebas NaN & Infinity)
 * 7. Integrasi UI pada Modal Tambah/Edit Produk, Modal Edit Cepat, SW cache, & CSS
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const {
  parseDiskonBertingkat,
  bulatkanHpp,
  hitungHppPresisi
} = require('../frontend/js/utils/hpp-calculator.js');

console.log('🧪 Memulai Pengujian Kalkulator HPP Presisi & Pembulatan...');

let total = 0;
let lulus = 0;

function tes(nama, fn) {
  total++;
  fn();
  lulus++;
  console.log(`  ✔ [PASS] ${total}. ${nama}`);
}

// 1. Pembagian pecahan 100.000 / 12 = 8.333,333...
tes('Pembulatan bebas pecahan (Rp 100.000 ÷ 12 = 8.333,33) di seluruh kelipatan', () => {
  const r1Ceil = hitungHppPresisi({ hargaTotal: 100000, qty: 12, kelipatanBulat: 1, modeBulat: 'ceil' });
  assert.strictEqual(r1Ceil.valid, true);
  assert.strictEqual(Number.isInteger(r1Ceil.hppFinal), true);
  assert.strictEqual(r1Ceil.hppFinal, 8334);

  const r1Round = hitungHppPresisi({ hargaTotal: 100000, qty: 12, kelipatanBulat: 1, modeBulat: 'round' });
  assert.strictEqual(r1Round.hppFinal, 8333);

  const r50 = hitungHppPresisi({ hargaTotal: 100000, qty: 12, kelipatanBulat: 50, modeBulat: 'ceil' });
  assert.strictEqual(r50.hppFinal, 8350);

  const r100 = hitungHppPresisi({ hargaTotal: 100000, qty: 12, kelipatanBulat: 100, modeBulat: 'ceil' });
  assert.strictEqual(r100.hppFinal, 8400);

  const r500 = hitungHppPresisi({ hargaTotal: 100000, qty: 12, kelipatanBulat: 500, modeBulat: 'ceil' });
  assert.strictEqual(r500.hppFinal, 8500);

  const r1000 = hitungHppPresisi({ hargaTotal: 100000, qty: 12, kelipatanBulat: 1000, modeBulat: 'ceil' });
  assert.strictEqual(r1000.hppFinal, 9000);
});

// 2. Hasil bagi pas tidak melonjak kelipatan (proteksi epsilon IEEE-754)
tes('Proteksi epsilon IEEE-754: hasil pas tidak melonjak saat pembulatan ke atas', () => {
  const kabel = hitungHppPresisi({ hargaTotal: 400000, qty: 50, kelipatanBulat: 100, modeBulat: 'ceil' });
  assert.strictEqual(kabel.hppFinal, 8000);
  assert.strictEqual(kabel.selisihBulat, 0);

  // Kasus IEEE-754 terkenal: 100000 * 0.855 / 10 = 8550.000000000002
  const klem = hitungHppPresisi({ hargaTotal: 100000, qty: 10, diskonStr: '10+5', kelipatanBulat: 50, modeBulat: 'ceil' });
  assert.strictEqual(klem.hppFinal, 8550);

  assert.strictEqual(bulatkanHpp(8000.000000000001, 100, 'ceil'), 8000);
});

// 3. Parsing & perhitungan diskon bertingkat ala distributor bahan bangunan
tes('Diskon bertingkat (10+5 -> efektif 14.5%, bukan 15%) akurat presisi', () => {
  assert.deepStrictEqual(parseDiskonBertingkat('10+5'), [10, 5]);
  assert.deepStrictEqual(parseDiskonBertingkat('15 + 5 + 2,5%'), [15, 5, 2.5]);
  assert.deepStrictEqual(parseDiskonBertingkat(''), []);

  const res = hitungHppPresisi({ hargaTotal: 100000, qty: 10, diskonStr: '10+5', kelipatanBulat: 1, modeBulat: 'ceil' });
  assert.ok(Math.abs(res.hargaSetelahDiskon - 85500) < 1e-6);
  assert.ok(Math.abs(res.diskonEfektifPersen - 14.5) < 1e-6);
  assert.strictEqual(res.hppFinal, 8550);
});

// 4. Kombinasi lengkap Landed Cost: Diskon bertingkat + PPN 11% + Ongkir + Bonus Gratis
tes('Kombinasi penuh Landed Cost (Diskon 10+5% + PPN 11% + Ongkir + Bonus 5 pcs)', () => {
  // Harga 100.000 -> Diskon 10+5% = 85.500 -> PPN 11% (+9.405) = 94.905 -> + Ongkir 5.095 = 100.000
  // Qty 100 + Bonus 5 = 105 pcs -> 100.000 / 105 = 952,38095...
  const res = hitungHppPresisi({
    hargaTotal: 100000,
    qty: 100,
    diskonStr: '10+5',
    ppnPersen: 11,
    ongkir: 5095,
    qtyBonus: 5,
    kelipatanBulat: 50,
    modeBulat: 'ceil'
  });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.totalQty, 105);
  assert.ok(Math.abs(res.totalModal - 100000) < 1e-6);
  assert.ok(Math.abs(res.hppEksak - (100000 / 105)) < 1e-6);
  assert.strictEqual(res.hppFinal, 1000); // 952.38 ke atas Rp 50 -> 1.000
  assert.strictEqual(Number.isInteger(res.hppFinal), true);
});

// 5. Edge case aman (0, negatif, NaN)
tes('Edge case input nol/kosong/negatif aman dari NaN & Infinity', () => {
  const kosong = hitungHppPresisi({ hargaTotal: 0, qty: 0 });
  assert.strictEqual(kosong.valid, false);
  assert.strictEqual(kosong.hppFinal, 0);

  const qtyNol = hitungHppPresisi({ hargaTotal: 50000, qty: 0 });
  assert.strictEqual(qtyNol.valid, false);
  assert.strictEqual(qtyNol.hppFinal, 0);

  const negatif = hitungHppPresisi({ hargaTotal: -10000, qty: -5 });
  assert.strictEqual(negatif.valid, false);
  assert.strictEqual(negatif.hppFinal, 0);
});

// 6. Integrasi frontend (produk.js, ui.js, components.css, sw.js)
tes('Integrasi Kalkulator HPP di Form Produk, Quick Edit, UI Icons, CSS, & Service Worker', () => {
  const prdJs = fs.readFileSync(path.join(__dirname, '../frontend/js/modules/produk.js'), 'utf8');
  const uiJs = fs.readFileSync(path.join(__dirname, '../frontend/js/utils/ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../frontend/css/components.css'), 'utf8');
  const swJs = fs.readFileSync(path.join(__dirname, '../frontend/sw.js'), 'utf8');

  assert.ok(uiJs.includes('calculator:'), 'ui.js wajib memiliki ICONS.calculator');
  assert.ok(prdJs.includes("renderKalkulatorHppToggle('prd')"), 'Modal Tambah/Edit Produk wajib memiliki toggle Kalkulator HPP');
  assert.ok(prdJs.includes("renderKalkulatorHppPanel('prd'"), 'Modal Tambah/Edit Produk wajib memiliki panel Kalkulator HPP');
  assert.ok(prdJs.includes("renderKalkulatorHppToggle('qe')"), 'Modal Edit Cepat wajib memiliki toggle Kalkulator HPP');
  assert.ok(prdJs.includes("renderKalkulatorHppPanel('qe'"), 'Modal Edit Cepat wajib memiliki panel Kalkulator HPP');
  assert.ok(css.includes('.hpp-calc-panel'), 'components.css wajib memuat gaya .hpp-calc-panel');
  assert.ok(swJs.includes('./js/utils/hpp-calculator.js'), 'sw.js wajib meng-cache hpp-calculator.js');
});

console.log('\n=============================================');
console.log(`TOTAL UJI KALKULATOR HPP: ${total} | LULUS: ${lulus} | GAGAL: 0`);
console.log('=============================================\n');

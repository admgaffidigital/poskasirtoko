/**
 * hpp-calculator.js — Kalkulator HPP Presisi & Bebas Pecahan
 * Menghitung Harga Pokok Penjualan (Landed Cost) per satuan dasar dari:
 * - Total Harga Beli (per dus/rol/ikat/nota) ÷ Qty Isi
 * - Opsi lanjutan: Diskon bertingkat (cth: 10+5), PPN (%), Ongkir/Biaya Bongkar, Bonus Gratis
 * - Pembulatan presisi bebas pecahan/desimal (Rp 1 / Rp 50 / Rp 100 / Rp 500 / Rp 1.000)
 *   dengan pilihan arah Ke Atas (Aman Margin) atau Terdekat.
 */

import { formatRupiah, parseRupiah, formatQty, escapeHtml } from './format.js';
import { ICONS, showToast } from './ui.js';

const STORAGE_PREF_KEY = 'pos_hpp_calc_pref';
const KELIPATAN_VALID = [1, 50, 100, 500, 1000];
const QTY_PRESETS = [10, 12, 20, 24, 25, 50, 100];

/**
 * Muat preferensi pembulatan terakhir dari localStorage (aman di browser maupun Node)
 * @returns {{ kelipatan: number, mode: 'ceil'|'round' }}
 */
export function muatPreferensiBulatHpp() {
  const def = { kelipatan: 1, mode: 'ceil' };
  try {
    if (typeof localStorage === 'undefined') return def;
    const raw = localStorage.getItem(STORAGE_PREF_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    const kelipatan = KELIPATAN_VALID.includes(Number(parsed.kelipatan)) ? Number(parsed.kelipatan) : 1;
    const mode = parsed.mode === 'round' ? 'round' : 'ceil';
    return { kelipatan, mode };
  } catch {
    return def;
  }
}

/**
 * Simpan preferensi pembulatan terakhir ke localStorage
 * @param {number} kelipatan
 * @param {'ceil'|'round'} mode
 */
export function simpanPreferensiBulatHpp(kelipatan, mode) {
  try {
    if (typeof localStorage === 'undefined') return;
    const k = KELIPATAN_VALID.includes(Number(kelipatan)) ? Number(kelipatan) : 1;
    const m = mode === 'round' ? 'round' : 'ceil';
    localStorage.setItem(STORAGE_PREF_KEY, JSON.stringify({ kelipatan: k, mode: m }));
  } catch {
    // Abaikan jika storage penuh / mode privat
  }
}

/**
 * Parse string diskon tunggal atau bertingkat (cth: "10", "10+5", "15 + 5 + 2,5")
 * @param {string|number} input
 * @returns {number[]} Daftar persentase diskon valid (0..100)
 */
export function parseDiskonBertingkat(input) {
  if (input === null || input === undefined || input === '') return [];
  const str = String(input).trim();
  if (!str) return [];

  return str
    .split('+')
    .map((bagian) => {
      const bersih = bagian.replace(/%/g, '').replace(',', '.').trim();
      const angka = parseFloat(bersih);
      if (!Number.isFinite(angka) || angka <= 0) return null;
      return Math.min(100, angka);
    })
    .filter((v) => v !== null);
}

/**
 * Pembulatan HPP menjadi bilangan bulat Rupiah (integer, bebas pecahan/desimal)
 * dengan proteksi epsilon IEEE-754 agar hasil bagi pas tidak melonjak kelipatan.
 * @param {number} nilaiEksak
 * @param {number} [kelipatan=1] - 1, 50, 100, 500, 1000
 * @param {'ceil'|'round'} [mode='ceil'] - 'ceil' (ke atas, aman margin) | 'round' (terdekat)
 * @returns {number} Integer Rupiah (>= 0)
 */
export function bulatkanHpp(nilaiEksak, kelipatan = 1, mode = 'ceil') {
  const n = Number(nilaiEksak);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const step = Number(kelipatan) > 0 ? Math.round(Number(kelipatan)) : 1;
  const rasio = n / step;
  const terdekat = Math.round(rasio);

  // Proteksi floating-point noise (misal 8000.000000000001 tetap 8000, bukan 8100)
  if (Math.abs(rasio - terdekat) < 1e-9) {
    return Math.max(0, Math.round(terdekat * step));
  }

  if (mode === 'round') {
    return Math.max(0, Math.round(rasio) * step);
  }
  return Math.max(0, Math.ceil(rasio - 1e-9) * step);
}

/**
 * Format angka eksak dengan maksimal 2 desimal (format Indonesia) untuk transparansi hitungan
 * @param {number} val
 * @returns {string}
 */
export function formatRupiahEksak(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 'Rp 0';
  const bulat = Math.abs(n - Math.round(n)) < 1e-6;
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: bulat ? 0 : 2,
    maximumFractionDigits: bulat ? 0 : 2
  }).format(n);
  return `Rp ${formatted}`;
}

/**
 * Mesin hitung HPP presisi penuh (Landed Cost)
 * Urutan akuntansi:
 * 1. Harga Awal dikurangi Diskon Bertingkat secara berjenjang
 * 2. Ditambah PPN (%) dari harga bersih setelah diskon
 * 3. Ditambah Ongkir / Biaya Bongkar
 * 4. Dibagi Total Qty Efektif (Qty Beli + Bonus Gratis)
 * 5. Dibulatkan hanya di tahap akhir agar bebas pecahan & bebas akumulasi galat
 *
 * @param {object} params
 * @param {number} params.hargaTotal
 * @param {number} params.qty
 * @param {string|number} [params.diskonStr='']
 * @param {number} [params.ppnPersen=0]
 * @param {number} [params.ongkir=0]
 * @param {number} [params.qtyBonus=0]
 * @param {number} [params.kelipatanBulat=1]
 * @param {'ceil'|'round'} [params.modeBulat='ceil']
 */
export function hitungHppPresisi({
  hargaTotal = 0,
  qty = 0,
  diskonStr = '',
  ppnPersen = 0,
  ongkir = 0,
  qtyBonus = 0,
  kelipatanBulat = 1,
  modeBulat = 'ceil'
} = {}) {
  const hargaAwal = Math.max(0, Number(hargaTotal) || 0);
  const qtyBeli = Math.max(0, Number(qty) || 0);
  const bonus = Math.max(0, Number(qtyBonus) || 0);
  const totalQty = qtyBeli + bonus;
  const daftarDiskon = parseDiskonBertingkat(diskonStr);
  const ppnPct = Math.min(100, Math.max(0, Number(ppnPersen) || 0));
  const biayaTambahan = Math.max(0, Number(ongkir) || 0);
  const step = Number(kelipatanBulat) > 0 ? Math.round(Number(kelipatanBulat)) : 1;
  const mode = modeBulat === 'round' ? 'round' : 'ceil';

  if (hargaAwal <= 0 || totalQty <= 0) {
    return {
      valid: false,
      hargaAwal,
      daftarDiskon,
      totalDiskonRp: 0,
      diskonEfektifPersen: 0,
      hargaSetelahDiskon: hargaAwal,
      ppnPersen: ppnPct,
      ppnRp: 0,
      ongkir: biayaTambahan,
      totalModal: 0,
      qtyBeli,
      qtyBonus: bonus,
      totalQty,
      hppEksak: 0,
      hppFinal: 0,
      selisihBulat: 0,
      kelipatanBulat: step,
      modeBulat: mode
    };
  }

  // 1. Diskon bertingkat berjenjang
  let hargaSetelahDiskon = hargaAwal;
  for (const d of daftarDiskon) {
    hargaSetelahDiskon = hargaSetelahDiskon * (1 - d / 100);
  }
  const totalDiskonRp = hargaAwal - hargaSetelahDiskon;
  const diskonEfektifPersen = hargaAwal > 0 ? (totalDiskonRp / hargaAwal) * 100 : 0;

  // 2. PPN dari harga bersih setelah diskon
  const ppnRp = hargaSetelahDiskon * (ppnPct / 100);

  // 3. Total modal (termasuk ongkir / biaya bongkar)
  const totalModal = hargaSetelahDiskon + ppnRp + biayaTambahan;

  // 4. HPP eksak per satuan dasar
  const hppEksak = totalModal / totalQty;

  // 5. Pembulatan final (integer murni tanpa pecahan)
  const hppFinal = bulatkanHpp(hppEksak, step, mode);
  const selisihBulat = hppFinal - hppEksak;

  return {
    valid: true,
    hargaAwal,
    daftarDiskon,
    totalDiskonRp,
    diskonEfektifPersen,
    hargaSetelahDiskon,
    ppnPersen: ppnPct,
    ppnRp,
    ongkir: biayaTambahan,
    totalModal,
    qtyBeli,
    qtyBonus: bonus,
    totalQty,
    hppEksak,
    hppFinal,
    selisihBulat,
    kelipatanBulat: step,
    modeBulat: mode
  };
}

/**
 * Render HTML tombol toggle + panel inline Kalkulator HPP
 * @param {object} opts
 * @param {string} opts.prefix - Prefix ID unik (cth: 'prd' atau 'qe')
 * @param {string} [opts.satuanLabel='PCS']
 */
export function renderKalkulatorHppToggle(prefix) {
  return `
    <button type="button" class="btn btn-secondary btn-xs hpp-calc-toggle" id="${prefix}-btn-toggle-hpp-calc" aria-expanded="false" aria-controls="${prefix}-hpp-calc-panel">
      ${ICONS.calculator}
      <span>Kalkulator HPP</span>
    </button>
  `;
}

export function renderKalkulatorHppPanel(prefix, satuanLabel = 'PCS') {
  const pref = muatPreferensiBulatHpp();
  const sat = escapeHtml((satuanLabel || 'PCS').toUpperCase());

  return `
    <div class="hpp-calc-panel hidden" id="${prefix}-hpp-calc-panel" role="region" aria-label="Kalkulator HPP">
      <div class="hpp-calc-header">
        <div class="hpp-calc-title">
          ${ICONS.calculator}
          <span>Kalkulator HPP per <strong class="hpp-calc-satuan-txt">${sat}</strong></span>
        </div>
        <button type="button" class="btn btn-ghost btn-xs text-muted" id="${prefix}-hpp-calc-reset" title="Reset Hitungan">
          ${ICONS.rotateCcw}
          <span>Reset</span>
        </button>
      </div>

      <!-- Input Utama: Harga Total & Qty Isi -->
      <div class="hpp-calc-grid">
        <div class="field">
          <label class="field-label text-xs" for="${prefix}-calc-harga">Total Harga Beli (Nota / Kemasan)</label>
          <div class="input-prefix">
            <span>Rp</span>
            <input type="text" class="input input-sm input-num fw-semibold" id="${prefix}-calc-harga" inputmode="numeric" placeholder="Cth: 100.000">
          </div>
        </div>
        <div class="field">
          <label class="field-label text-xs" for="${prefix}-calc-qty">Qty / Isi (<span class="hpp-calc-satuan-txt">${sat}</span>)</label>
          <div class="input-suffix">
            <input type="number" class="input input-sm input-num fw-semibold" id="${prefix}-calc-qty" min="0" step="any" inputmode="decimal" placeholder="Cth: 12">
            <span class="text-2xs fw-semibold hpp-calc-satuan-txt">${sat}</span>
          </div>
        </div>
      </div>

      <!-- Preset Cepat Qty -->
      <div class="hpp-calc-preset-row">
        <span class="hpp-calc-micro-label">Isi cepat:</span>
        <div class="hpp-calc-chips">
          ${QTY_PRESETS.map((q) => `
            <button type="button" class="btn btn-xs btn-outline hpp-calc-qty-chip" data-qty="${q}">${q === 12 ? '12 (Lsn)' : q}</button>
          `).join('')}
        </div>
      </div>

      <!-- Opsi Lanjutan (Diskon Bertingkat, PPN, Ongkir, Bonus) -->
      <button type="button" class="hpp-calc-adv-toggle" id="${prefix}-calc-adv-toggle" aria-expanded="false">
        <span>Opsi Nota Distributor (Diskon Bertingkat, PPN, Ongkir, Bonus)</span>
        <span class="hpp-calc-adv-arrow">${ICONS.chevronDown}</span>
      </button>

      <div class="hpp-calc-adv-body hidden" id="${prefix}-calc-adv-body">
        <div class="hpp-calc-grid">
          <div class="field">
            <label class="field-label text-xs" for="${prefix}-calc-diskon">Diskon Supplier (%)</label>
            <input type="text" class="input input-sm" id="${prefix}-calc-diskon" placeholder="Cth: 10 atau 10+5">
            <span class="field-hint">Pakai tanda + untuk diskon bertingkat.</span>
          </div>
          <div class="field">
            <div class="row-between items-center">
              <label class="field-label text-xs" for="${prefix}-calc-ppn" style="margin-bottom: 0;">PPN (%)</label>
              <div class="hpp-calc-mini-chips">
                <button type="button" class="btn btn-xs btn-outline hpp-calc-ppn-chip" data-ppn="0">0%</button>
                <button type="button" class="btn btn-xs btn-outline hpp-calc-ppn-chip" data-ppn="11">11%</button>
              </div>
            </div>
            <div class="input-suffix">
              <input type="number" class="input input-sm input-num" id="${prefix}-calc-ppn" min="0" max="100" step="0.1" inputmode="decimal" placeholder="0">
              <span class="text-2xs fw-semibold">%</span>
            </div>
          </div>
          <div class="field">
            <label class="field-label text-xs" for="${prefix}-calc-ongkir">Ongkir / Biaya Bongkar</label>
            <div class="input-prefix">
              <span>Rp</span>
              <input type="text" class="input input-sm input-num" id="${prefix}-calc-ongkir" inputmode="numeric" placeholder="0">
            </div>
          </div>
          <div class="field">
            <label class="field-label text-xs" for="${prefix}-calc-bonus">Bonus Barang Gratis</label>
            <div class="input-suffix">
              <input type="number" class="input input-sm input-num" id="${prefix}-calc-bonus" min="0" step="any" inputmode="decimal" placeholder="0">
              <span class="text-2xs fw-semibold hpp-calc-satuan-txt">${sat}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Kontrol Pembulatan Bebas Pecahan -->
      <div class="hpp-calc-round-bar">
        <div class="hpp-calc-round-top">
          <span class="hpp-calc-micro-label">Pembulatan HPP (Bebas Pecahan):</span>
          <div class="segmented hpp-calc-mode-seg" role="group" aria-label="Arah Pembulatan">
            <button type="button" class="btn btn-xs hpp-calc-mode-btn" data-mode="ceil" aria-pressed="${pref.mode === 'ceil'}">Ke Atas</button>
            <button type="button" class="btn btn-xs hpp-calc-mode-btn" data-mode="round" aria-pressed="${pref.mode === 'round'}">Terdekat</button>
          </div>
        </div>
        <div class="hpp-calc-chips">
          ${KELIPATAN_VALID.map((step) => `
            <button type="button" class="btn btn-xs ${pref.kelipatan === step ? 'btn-primary' : 'btn-outline'} hpp-calc-step-chip" data-step="${step}">
              ${step === 1 ? 'Rp 1 (Utuh)' : `Rp ${formatRupiah(step, false)}`}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Kotak Ringkasan & Hasil Final HPP -->
      <div class="hpp-calc-result" id="${prefix}-calc-result">
        <div class="hpp-calc-breakdown text-xs text-muted" id="${prefix}-calc-breakdown">
          Masukkan <strong>Total Harga Beli</strong> dan <strong>Qty / Isi</strong> untuk menghitung HPP otomatis.
        </div>
        <div class="hpp-calc-final-row">
          <div>
            <div class="hpp-calc-micro-label">FINAL HPP PER <span class="hpp-calc-satuan-txt">${sat}</span></div>
            <div class="hpp-calc-final-val tabular" id="${prefix}-calc-final-val">Rp 0</div>
            <div class="hpp-calc-exact-meta text-2xs text-muted tabular" id="${prefix}-calc-exact-meta">Bebas pecahan desimal</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="${prefix}-calc-apply" disabled>
            ${ICONS.check}
            <span>Terapkan ke HPP</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Mengikat seluruh event interaksi & kalkulasi realtime Kalkulator HPP
 * @param {object} cfg
 * @param {HTMLElement} cfg.root - Container form/modal
 * @param {string} cfg.prefix - Prefix ID ('prd' atau 'qe')
 * @param {HTMLInputElement} cfg.inputHppEl - Input HPP target yang akan diisi
 * @param {() => string} [cfg.getSatuan] - Fungsi pengambil label satuan aktif
 * @param {(hasil: object) => void} [cfg.onApply] - Callback opsional setelah diterapkan
 */
export function ikatKalkulatorHpp({ root, prefix, inputHppEl, getSatuan, onApply }) {
  if (!root || !inputHppEl) return;

  const btnToggle = root.querySelector(`#${prefix}-btn-toggle-hpp-calc`);
  const panel = root.querySelector(`#${prefix}-hpp-calc-panel`);
  if (!btnToggle || !panel) return;

  const inpHarga = panel.querySelector(`#${prefix}-calc-harga`);
  const inpQty = panel.querySelector(`#${prefix}-calc-qty`);
  const inpDiskon = panel.querySelector(`#${prefix}-calc-diskon`);
  const inpPpn = panel.querySelector(`#${prefix}-calc-ppn`);
  const inpOngkir = panel.querySelector(`#${prefix}-calc-ongkir`);
  const inpBonus = panel.querySelector(`#${prefix}-calc-bonus`);
  const btnAdvToggle = panel.querySelector(`#${prefix}-calc-adv-toggle`);
  const advBody = panel.querySelector(`#${prefix}-calc-adv-body`);
  const btnReset = panel.querySelector(`#${prefix}-hpp-calc-reset`);
  const btnApply = panel.querySelector(`#${prefix}-calc-apply`);
  const elBreakdown = panel.querySelector(`#${prefix}-calc-breakdown`);
  const elFinalVal = panel.querySelector(`#${prefix}-calc-final-val`);
  const elExactMeta = panel.querySelector(`#${prefix}-calc-exact-meta`);

  const pref = muatPreferensiBulatHpp();
  let kelipatanAktif = pref.kelipatan;
  let modeAktif = pref.mode;
  let hasilTerakhir = null;

  const syncLabelSatuan = () => {
    const sat = ((getSatuan ? getSatuan() : 'PCS') || 'PCS').toUpperCase();
    panel.querySelectorAll('.hpp-calc-satuan-txt').forEach((el) => {
      el.textContent = sat;
    });
    return sat;
  };

  const hitungUlang = () => {
    const sat = syncLabelSatuan();
    const hargaTotal = parseRupiah(inpHarga.value);
    const qty = parseFloat(String(inpQty.value || '').replace(',', '.')) || 0;
    const diskonStr = inpDiskon ? inpDiskon.value : '';
    const ppnPersen = inpPpn ? (parseFloat(String(inpPpn.value || '').replace(',', '.')) || 0) : 0;
    const ongkir = inpOngkir ? parseRupiah(inpOngkir.value) : 0;
    const qtyBonus = inpBonus ? (parseFloat(String(inpBonus.value || '').replace(',', '.')) || 0) : 0;

    const hasil = hitungHppPresisi({
      hargaTotal,
      qty,
      diskonStr,
      ppnPersen,
      ongkir,
      qtyBonus,
      kelipatanBulat: kelipatanAktif,
      modeBulat: modeAktif
    });
    hasilTerakhir = hasil;

    if (!hasil.valid) {
      elFinalVal.textContent = 'Rp 0';
      elExactMeta.textContent = 'Bebas pecahan desimal';
      elBreakdown.innerHTML = 'Masukkan <strong>Total Harga Beli</strong> dan <strong>Qty / Isi</strong> untuk menghitung HPP otomatis.';
      btnApply.disabled = true;
      return;
    }

    elFinalVal.textContent = formatRupiah(hasil.hppFinal);
    btnApply.disabled = false;

    // Rincian langkah hitung transparan
    const langkah = [`Harga ${formatRupiah(hasil.hargaAwal)}`];
    if (hasil.totalDiskonRp > 0) {
      const labelDisk = hasil.daftarDiskon.join('+');
      langkah.push(`Diskon (${labelDisk}% / efek ${hasil.diskonEfektifPersen.toFixed(1)}%): -${formatRupiahEksak(hasil.totalDiskonRp)}`);
    }
    if (hasil.ppnRp > 0) {
      langkah.push(`PPN ${hasil.ppnPersen}%: +${formatRupiahEksak(hasil.ppnRp)}`);
    }
    if (hasil.ongkir > 0) {
      langkah.push(`Ongkir: +${formatRupiah(hasil.ongkir)}`);
    }
    const labelQty = hasil.qtyBonus > 0
      ? `${formatQty(hasil.qtyBeli)} + ${formatQty(hasil.qtyBonus)} bonus = ${formatQty(hasil.totalQty)} ${escapeHtml(sat)}`
      : `${formatQty(hasil.totalQty)} ${escapeHtml(sat)}`;
    langkah.push(`Total Modal ${formatRupiahEksak(hasil.totalModal)} ÷ ${labelQty}`);
    elBreakdown.innerHTML = langkah.join(' <span class="hpp-calc-sep">&rarr;</span> ');

    // Info eksak & selisih pembulatan
    const adaSelisih = Math.abs(hasil.selisihBulat) >= 0.005;
    if (adaSelisih) {
      const tanda = hasil.selisihBulat >= 0 ? '+' : '-';
      const labelMode = modeAktif === 'ceil' ? 'ke atas' : 'terdekat';
      elExactMeta.innerHTML = `Hitungan eksak: <strong>${formatRupiahEksak(hasil.hppEksak)}</strong> (${tanda}${formatRupiahEksak(Math.abs(hasil.selisihBulat))} dibulatkan ${labelMode} Rp ${formatRupiah(kelipatanAktif, false)})`;
    } else {
      elExactMeta.innerHTML = `Hitungan eksak: <strong>${formatRupiahEksak(hasil.hppEksak)}</strong> (bulat pas tanpa pecahan)`;
    }
  };

  // Format ribuan otomatis untuk input harga & ongkir
  [inpHarga, inpOngkir].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => {
      const val = parseRupiah(el.value);
      el.value = val > 0 ? formatRupiah(val, false) : '';
      hitungUlang();
    });
  });

  [inpQty, inpDiskon, inpPpn, inpBonus].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', hitungUlang);
  });

  // Toggle buka/tutup panel kalkulator
  btnToggle.addEventListener('click', () => {
    const akanBuka = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !akanBuka);
    btnToggle.setAttribute('aria-expanded', akanBuka ? 'true' : 'false');
    btnToggle.classList.toggle('is-active', akanBuka);
    if (akanBuka) {
      syncLabelSatuan();
      hitungUlang();
      setTimeout(() => inpHarga?.focus(), 60);
    }
  });

  // Toggle opsi lanjutan distributor
  btnAdvToggle?.addEventListener('click', () => {
    const akanBuka = advBody.classList.contains('hidden');
    advBody.classList.toggle('hidden', !akanBuka);
    btnAdvToggle.setAttribute('aria-expanded', akanBuka ? 'true' : 'false');
    btnAdvToggle.classList.toggle('is-open', akanBuka);
  });

  // Chip preset Qty cepat
  panel.querySelectorAll('.hpp-calc-qty-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      inpQty.value = chip.getAttribute('data-qty') || '';
      hitungUlang();
      if (!parseRupiah(inpHarga.value)) {
        inpHarga.focus();
      }
    });
  });

  // Chip preset PPN cepat
  panel.querySelectorAll('.hpp-calc-ppn-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (inpPpn) {
        inpPpn.value = chip.getAttribute('data-ppn') || '0';
        hitungUlang();
      }
    });
  });

  // Pilihan kelipatan pembulatan
  panel.querySelectorAll('.hpp-calc-step-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      kelipatanAktif = Number(chip.getAttribute('data-step')) || 1;
      panel.querySelectorAll('.hpp-calc-step-chip').forEach((b) => {
        const aktif = Number(b.getAttribute('data-step')) === kelipatanAktif;
        b.classList.toggle('btn-primary', aktif);
        b.classList.toggle('btn-outline', !aktif);
      });
      simpanPreferensiBulatHpp(kelipatanAktif, modeAktif);
      hitungUlang();
    });
  });

  // Pilihan arah pembulatan (Ke Atas / Terdekat)
  panel.querySelectorAll('.hpp-calc-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modeAktif = btn.getAttribute('data-mode') === 'round' ? 'round' : 'ceil';
      panel.querySelectorAll('.hpp-calc-mode-btn').forEach((b) => {
        b.setAttribute('aria-pressed', b.getAttribute('data-mode') === modeAktif ? 'true' : 'false');
      });
      simpanPreferensiBulatHpp(kelipatanAktif, modeAktif);
      hitungUlang();
    });
  });

  // Tombol Reset
  btnReset?.addEventListener('click', () => {
    inpHarga.value = '';
    inpQty.value = '';
    if (inpDiskon) inpDiskon.value = '';
    if (inpPpn) inpPpn.value = '';
    if (inpOngkir) inpOngkir.value = '';
    if (inpBonus) inpBonus.value = '';
    hitungUlang();
    inpHarga.focus();
  });

  // Tombol Terapkan ke HPP
  btnApply?.addEventListener('click', () => {
    if (!hasilTerakhir || !hasilTerakhir.valid) return;
    const finalInt = Math.round(hasilTerakhir.hppFinal);
    inputHppEl.value = formatRupiah(finalInt, false);
    inputHppEl.dispatchEvent(new Event('input', { bubbles: true }));

    // Tutup panel & beri konfirmasi singkat
    panel.classList.add('hidden');
    btnToggle.setAttribute('aria-expanded', 'false');
    btnToggle.classList.remove('is-active');

    const sat = syncLabelSatuan();
    showToast(`Final HPP diterapkan: ${formatRupiah(finalInt)} / ${sat}`, 'success', 2200);
    if (typeof onApply === 'function') {
      onApply(hasilTerakhir);
    }
  });

  return { syncLabelSatuan, hitungUlang };
}

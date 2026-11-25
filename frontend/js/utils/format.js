/**
 * format.js — Utilitas pemformatan data, angka, mata uang, dan tanggal
 * Sesuai keputusan teknis final (README bagian 2 & 7):
 * - Rupiah integer tanpa desimal
 * - Qty desimal maksimal 3 digit di belakang koma
 * - Tanggal format dd/mm/yyyy
 * - Sanitasi teks XSS
 */

/**
 * Format angka ke Rupiah (cth: Rp 1.250.000)
 * @param {number|string} val
 * @param {boolean} [denganSimbol=true]
 * @returns {string}
 */
export function formatRupiah(val, denganSimbol = true) {
  const n = Math.round(Number(val) || 0);
  const formatted = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0
  }).format(n);
  return denganSimbol ? `Rp ${formatted}` : formatted;
}

/**
 * Parse string Rupiah/input angka menjadi integer
 * @param {string|number} str
 * @returns {number}
 */
export function parseRupiah(str) {
  if (typeof str === 'number') return Math.round(str) || 0;
  if (!str) return 0;
  // Hapus semua karakter kecuali angka dan minus
  const cleaned = String(str).replace(/[^0-9-]/g, '');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format kuantitas (desimal maksimal 3 digit, hilangkan nol buntut jika bulat)
 * @param {number|string} val
 * @returns {string}
 */
export function formatQty(val) {
  const n = Number(val) || 0;
  // Dibulatkan ke 3 desimal
  const rounded = Math.round(n * 1000) / 1000;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(rounded);
}

/**
 * Parse input string kuantitas menjadi angka float (maks 3 desimal).
 * Mendukung titik desimal standar HTML <input type="number"> ("0.5", "2.5", "1.125"),
 * koma desimal Indonesia ("0,5", "2,5"), maupun pemisah ribuan ("1.250,5" / "1,250.5").
 * @param {string|number} str
 * @returns {number}
 */
export function parseQty(str) {
  if (typeof str === 'number') return Number.isFinite(str) ? Math.round(str * 1000) / 1000 : 0;
  if (str === null || str === undefined) return 0;
  let s = String(str).trim().replace(/\s+/g, '');
  if (!s) return 0;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Jika koma di belakang titik -> format Indonesia (1.250,5)
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Format internasional (1,250.5)
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Koma tunggal sebagai desimal Indonesia ("2,5", "0,75")
    const commaCount = (s.match(/,/g) || []).length;
    s = commaCount === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot) {
    // Titik tunggal (cth: "0.5", "2.5", "1.25", "1.125" dari <input type="number">) adalah desimal;
    // Hanya titik jamak ("1.000.000") yang merupakan pemisah ribuan.
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(s);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1000) / 1000;
}

/**
 * Format tanggal dari string ISO atau Date objek ke "dd/MM/yyyy" atau "dd/MM/yyyy HH:mm"
 * @param {string|Date} dateVal
 * @param {boolean} [denganWaktu=false]
 * @returns {string}
 */
export function formatTanggal(dateVal, denganWaktu = false) {
  if (!dateVal) return '-';
  let d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    // Parse "yyyy-MM-dd" murni secara lokal agar kebal pergeseran UTC; "yyyy-MM-dd HH:mm:ss" ke ISO lokal
    const raw = String(dateVal).trim();
    const mDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (mDateOnly) {
      d = new Date(Number(mDateOnly[1]), Number(mDateOnly[2]) - 1, Number(mDateOnly[3]));
    } else {
      const s = raw.replace(' ', 'T');
      d = new Date(s);
    }
  }

  if (isNaN(d.getTime())) return String(dateVal);

  const pad = (num) => String(num).padStart(2, '0');
  const tgl = pad(d.getDate());
  const bln = pad(d.getMonth() + 1);
  const thn = d.getFullYear();

  if (!denganWaktu) {
    return `${tgl}/${bln}/${thn}`;
  }

  const jam = pad(d.getHours());
  const mnt = pad(d.getMinutes());
  return `${tgl}/${bln}/${thn} ${jam}:${mnt}`;
}

/**
 * Sanitasi string untuk mencegah XSS saat disisipkan ke innerHTML
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format persentase
 * @param {number|string} val
 * @returns {string}
 */
export function formatPersen(val) {
  const n = Number(val) || 0;
  return `${n}%`;
}

/**
 * Format angka umum (alias untuk formatQty)
 * @param {number|string} val
 * @returns {string}
 */
export function formatAngka(val) {
  return formatQty(val);
}

/**
 * Format label SKU pintar agar tidak menghasilkan teks ganda seperti 'SKU: SKU-...'
 * @param {string} kode
 * @returns {string}
 */
export function formatSkuLabel(kode) {
  if (!kode) return '';
  let str = String(kode).trim();
  if (!str || str === '-') return '';
  // Bersihkan jika string sudah diawali duplikasi 'SKU: SKU-...' atau sejenisnya
  str = str.replace(/^sku[\s:-]+sku[\s:-]*/i, 'SKU-');
  if (/^sku[\s:-]/i.test(str)) {
    return str;
  }
  return `SKU: ${str}`;
}



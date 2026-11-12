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
 * Parse input string kuantitas menjadi angka float (maks 3 desimal)
 * @param {string|number} str
 * @returns {number}
 */
export function parseQty(str) {
  if (typeof str === 'number') return Math.round(str * 1000) / 1000;
  if (!str) return 0;
  // Format Indonesia koma sebagai desimal
  const normalized = String(str).replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  if (isNaN(parsed)) return 0;
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
    // String format: "yyyy-MM-dd HH:mm:ss" atau ISO
    const s = String(dateVal).replace(' ', 'T');
    d = new Date(s);
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


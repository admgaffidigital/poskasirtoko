/**
 * produk-import.js — Import & Update Massal Produk / Varian & Harga via Excel / CSV
 * Fitur:
 * - Ekspor 100% seluruh katalog produk + varian ke CSV UTF-8 BOM ramah Microsoft Excel
 * - Unduh template kosong siap isi (dengan contoh toko bangunan)
 * - Unggah file .csv/.tsv/.txt ATAU Copy-Paste langsung (Ctrl+V) dari Excel / Google Sheets
 * - Pratinjau otomatis: deteksi + Produk Baru, Update Produk, Update Varian, diff harga lama -> baru, & validasi HPP
 * - Perlindungan stok aman (opsi Update Stok default OFF agar tidak menimpa transaksi kasir)
 */

import { apiCall } from '../api.js';
import { ICONS, showModal, showToast, showConfirm } from './ui.js';
import { formatRupiah, formatQty, escapeHtml } from './format.js';
import { unduhFilePintar } from './native.js';

const KOLOM_EKSPOR = [
  'TIPE',
  'ID',
  'SKU',
  'BARCODE',
  'NAMA_PRODUK',
  'NAMA_VARIAN',
  'KATEGORI',
  'SATUAN',
  'HPP',
  'HARGA_RITEL',
  'HARGA_GROSIR',
  'MIN_GROSIR',
  'STOK',
  'STOK_MIN',
  'AKTIF'
];

function escapeCsvCell(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function unduhFileTeks(namaFile, isi, mime = 'text/csv;charset=utf-8') {
  unduhFilePintar(namaFile, isi, mime);
}

/** Muat 100% seluruh produk (aktif & nonaktif) lintas halaman untuk ekspor & pencocokan import */
async function muatSemuaProdukUntukImport() {
  const semua = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 20) {
    const res = await apiCall('produk.list', { page, limit: 500 }, { skipCache: page === 1 });
    const items = Array.isArray(res?.items) ? res.items : [];
    semua.push(...items);
    hasMore = Boolean(res?.has_more) && items.length > 0;
    page++;
  }
  return semua;
}

/** Ekspor seluruh produk & varian ke file CSV siap buka di Microsoft Excel */
export function eksporProdukCsvExcel(produkList = [], daftarKategori = []) {
  const petaKat = new Map();
  (daftarKategori || []).forEach((k) => {
    if (k && k.id) petaKat.set(k.id, k.nama || '');
  });

  const baris = [KOLOM_EKSPOR.join(',')];
  (produkList || []).forEach((p) => {
    const namaKat = petaKat.get(p.kategori_id) || p.kategori_nama || '';
    baris.push([
      'produk',
      p.id || '',
      p.sku || '',
      p.barcode || '',
      p.nama || '',
      '',
      namaKat,
      p.satuan_dasar || 'PCS',
      Math.round(Number(p.hpp || 0)),
      Math.round(Number(p.harga_ritel || 0)),
      Math.round(Number(p.harga_grosir || p.harga_ritel || 0)),
      Number(p.min_grosir_qty || 1),
      Number(p.stok || 0),
      Number(p.stok_min || 0),
      p.aktif !== false ? 'YA' : 'TIDAK'
    ].map(escapeCsvCell).join(','));

    if (p.punya_varian && Array.isArray(p.varian)) {
      p.varian.forEach((v) => {
        if (!v || v.deleted) return;
        baris.push([
          'varian',
          v.id || '',
          v.sku || '',
          v.barcode || '',
          p.nama || '',
          v.nama_varian || '',
          namaKat,
          p.satuan_dasar || 'PCS',
          Math.round(Number(v.hpp || p.hpp || 0)),
          Math.round(Number(v.harga_ritel || 0)),
          Math.round(Number(v.harga_grosir || v.harga_ritel || 0)),
          Number(p.min_grosir_qty || 1),
          Number(v.stok || 0),
          Number(v.stok_min || 0),
          v.aktif !== false ? 'YA' : 'TIDAK'
        ].map(escapeCsvCell).join(','));
      });
    }
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  unduhFileTeks(`katalog-produk-pos-${stamp}.csv`, '\uFEFF' + baris.join('\r\n'));
  return baris.length - 1;
}

/** Unduh template CSV contoh untuk tambah produk massal */
export function unduhTemplateImportProduk() {
  const contoh = [
    KOLOM_EKSPOR.join(','),
    ['produk', '', 'SMN-GR-50', '', 'Semen Gresik 50 Kg', '', 'Semen & Pasir', 'SAK', 58000, 68000, 65000, 10, 120, 20, 'YA'].map(escapeCsvCell).join(','),
    ['produk', '', 'CAT-AV-5KG', '', 'Cat Tembok Avitex 5 Kg', '', 'Cat & Pelapis', 'PAIL', 95000, 125000, 118000, 5, 30, 5, 'YA'].map(escapeCsvCell).join(','),
    ['produk', '', 'PVC-RU-3/4', '', 'Pipa PVC Rucika AW 3/4 Inch', '', 'Pipa & Sanitasi', 'BTG', 24000, 32000, 29500, 10, 80, 15, 'YA'].map(escapeCsvCell).join(',')
  ];
  unduhFileTeks('template-import-produk-pos.csv', '\uFEFF' + contoh.join('\r\n'));
}

/** Bersihkan string angka/rupiah Indonesia ("Rp 65.000", "65,000", "12.5") menjadi Number */
export function parseAngkaImport(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/^rp\.?\s*/i, '').replace(/\s+/g, '');
  // Jika pola ribuan titik Indonesia (misal 65.000 atau 1.250.000; hindari 0.125 agar tetap desimal!)
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (/^-?\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/[^0-9.\-]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Deteksi delimiter otomatis (Tab untuk Copy-Paste Excel, ; untuk Excel ID, atau , untuk CSV standar) */
function deteksiDelimiter(firstLine) {
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  if (tabs >= semis && tabs >= commas && tabs > 0) return '\t';
  if (semis > commas && semis > 0) return ';';
  return ',';
}

/** Parser RFC4180 tahan kutip & newline di dalam sel */
function splitBarisCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c || '').trim() !== ''));
}

const PETA_HEADER = {
  tipe: 'tipe',
  type: 'tipe',
  jenis: 'tipe',
  id: 'id',
  produk_id: 'produk_id',
  varian_id: 'varian_id',
  sku: 'sku',
  kode: 'sku',
  kode_barang: 'sku',
  sku_induk: 'sku_induk',
  barcode: 'barcode',
  ean: 'barcode',
  nama: 'nama',
  nama_produk: 'nama',
  nama_barang: 'nama',
  produk: 'nama',
  barang: 'nama',
  nama_varian: 'nama_varian',
  varian: 'nama_varian',
  kategori: 'kategori_nama',
  kategori_nama: 'kategori_nama',
  category: 'kategori_nama',
  satuan: 'satuan_dasar',
  satuan_dasar: 'satuan_dasar',
  unit: 'satuan_dasar',
  hpp: 'hpp',
  modal: 'hpp',
  harga_beli: 'hpp',
  harga_modal: 'hpp',
  harga_ritel: 'harga_ritel',
  harga_eceran: 'harga_ritel',
  harga_jual: 'harga_ritel',
  harga: 'harga_ritel',
  ritel: 'harga_ritel',
  harga_grosir: 'harga_grosir',
  grosir: 'harga_grosir',
  min_grosir: 'min_grosir_qty',
  min_grosir_qty: 'min_grosir_qty',
  stok: 'stok',
  stock: 'stok',
  qty: 'stok',
  stok_min: 'stok_min',
  min_stok: 'stok_min',
  aktif: 'aktif',
  status: 'aktif'
};

/** Parse teks CSV/TSV (dari unggah file atau paste Excel) menjadi array objek produk terstruktur */
export function parseTeksTabelImport(rawText) {
  const bersih = String(rawText || '').replace(/^\uFEFF/, '').trim();
  if (!bersih) return { rows: [], delimiter: ',', headers: [] };

  const firstLine = bersih.split(/\r?\n/)[0] || '';
  const delimiter = deteksiDelimiter(firstLine);
  const matrix = splitBarisCsv(bersih, delimiter);
  if (matrix.length < 2) return { rows: [], delimiter, headers: matrix[0] || [] };

  const rawHeaders = matrix[0].map((h) => String(h || '').trim());
  const mappedKeys = rawHeaders.map((h) => {
    const norm = h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return PETA_HEADER[norm] || '';
  });

  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const obj = { _baris: i + 1 };
    mappedKeys.forEach((key, colIdx) => {
      if (!key) return;
      const val = cols[colIdx] !== undefined ? String(cols[colIdx]).trim() : '';
      if (!val && key !== 'nama' && key !== 'sku') return;
      if (['hpp', 'harga_ritel', 'harga_grosir', 'min_grosir_qty', 'stok', 'stok_min'].includes(key)) {
        const num = parseAngkaImport(val);
        if (num !== null) obj[key] = num;
      } else if (key === 'aktif') {
        const low = val.toLowerCase();
        obj.aktif = !['tidak', 'nonaktif', 'false', '0', 'no', 'off'].includes(low);
      } else {
        obj[key] = val;
      }
    });
    if (!obj.tipe) {
      obj.tipe = obj.nama_varian ? 'varian' : 'produk';
    } else {
      obj.tipe = String(obj.tipe).toLowerCase().includes('var') ? 'varian' : 'produk';
    }
    if (obj.tipe === 'varian' && obj.id && !obj.varian_id) {
      obj.varian_id = obj.id;
    }
    rows.push(obj);
  }

  return { rows, delimiter, headers: rawHeaders };
}

/** Analisis pratinjau diff sebelum dikirim ke server */
function analisisPratinjauImport(rows, produkEksisting, opsi) {
  const prdById = new Map();
  const prdBySku = new Map();
  const prdByNama = new Map();
  const varById = new Map();
  const varBySku = new Map();
  const varByPrdNama = new Map();

  (produkEksisting || []).forEach((p) => {
    if (!p) return;
    prdById.set(p.id, p);
    if (p.sku) prdBySku.set(String(p.sku).trim().toLowerCase(), p);
    if (p.nama) prdByNama.set(String(p.nama).trim().toLowerCase(), p);
    if (Array.isArray(p.varian)) {
      p.varian.forEach((v) => {
        if (!v || v.deleted) return;
        const vWrap = { ...v, _indukNama: p.nama };
        varById.set(v.id, vWrap);
        if (v.sku) varBySku.set(String(v.sku).trim().toLowerCase(), vWrap);
        if (v.nama_varian) varByPrdNama.set(`${p.id}::${String(v.nama_varian).trim().toLowerCase()}`, vWrap);
      });
    }
  });

  const hasil = [];
  let cntBaru = 0;
  let cntUpdatePrd = 0;
  let cntUpdateVar = 0;
  let cntError = 0;

  rows.forEach((r) => {
    const skuKey = String(r.sku || '').trim().toLowerCase();
    if (r.tipe === 'varian') {
      let targetVar = (r.varian_id && varById.get(r.varian_id)) || (skuKey && varBySku.get(skuKey)) || null;
      const induk = targetVar
        ? prdById.get(targetVar.produk_id)
        : ((r.produk_id && prdById.get(r.produk_id)) || (r.sku_induk && prdBySku.get(String(r.sku_induk).trim().toLowerCase())) || (r.nama && prdByNama.get(String(r.nama).trim().toLowerCase())) || null);
      if (!targetVar && induk && r.nama_varian) {
        targetVar = varByPrdNama.get(`${induk.id}::${String(r.nama_varian).trim().toLowerCase()}`) || null;
      }

      const hpp = r.hpp !== undefined ? r.hpp : Number(targetVar?.hpp ?? induk?.hpp ?? 0);
      const ritel = r.harga_ritel !== undefined ? r.harga_ritel : Number(targetVar?.harga_ritel ?? induk?.harga_ritel ?? 0);
      const grosir = r.harga_grosir !== undefined ? r.harga_grosir : Number(targetVar?.harga_grosir ?? ritel);

      let err = '';
      if (!targetVar && !induk) err = 'Produk induk tidak ditemukan';
      else if (!targetVar && !r.nama_varian) err = 'Nama varian wajib diisi';
      else if (ritel < hpp) err = `Harga ritel (${formatRupiah(ritel)}) < HPP (${formatRupiah(hpp)})`;
      else if (grosir < hpp) err = `Harga grosir (${formatRupiah(grosir)}) < HPP (${formatRupiah(hpp)})`;

      if (err) {
        cntError++;
        hasil.push({ row: r, status: 'error', label: 'Error', detail: err, hargaLama: null, hargaBaru: ritel });
      } else if (targetVar) {
        cntUpdateVar++;
        hasil.push({
          row: r,
          status: 'update_var',
          label: 'Update Varian',
          detail: `${targetVar._indukNama || r.nama || ''} • ${r.nama_varian || targetVar.nama_varian}`,
          hargaLama: Number(targetVar.harga_ritel || 0),
          hargaBaru: opsi.perbarui_harga ? ritel : Number(targetVar.harga_ritel || 0)
        });
      } else {
        cntBaru++;
        hasil.push({
          row: r,
          status: 'baru',
          label: '+ Varian Baru',
          detail: `${induk.nama} • ${r.nama_varian}`,
          hargaLama: null,
          hargaBaru: ritel
        });
      }
      return;
    }

    // Produk
    const targetPrd = (r.id && prdById.get(r.id)) || (skuKey && prdBySku.get(skuKey)) || null;
    if (targetPrd) {
      const hpp = r.hpp !== undefined ? r.hpp : Number(targetPrd.hpp || 0);
      const ritel = r.harga_ritel !== undefined ? r.harga_ritel : Number(targetPrd.harga_ritel || 0);
      const grosir = r.harga_grosir !== undefined ? r.harga_grosir : Number(targetPrd.harga_grosir || ritel);
      let err = '';
      if (opsi.perbarui_harga && ritel < hpp) err = `Harga ritel (${formatRupiah(ritel)}) < HPP (${formatRupiah(hpp)})`;
      else if (opsi.perbarui_harga && grosir < hpp) err = `Harga grosir (${formatRupiah(grosir)}) < HPP (${formatRupiah(hpp)})`;

      if (err) {
        cntError++;
        hasil.push({ row: r, status: 'error', label: 'Error', detail: err, hargaLama: Number(targetPrd.harga_ritel || 0), hargaBaru: ritel });
      } else {
        cntUpdatePrd++;
        hasil.push({
          row: r,
          status: 'update_prd',
          label: 'Update Produk',
          detail: r.nama || targetPrd.nama,
          hargaLama: Number(targetPrd.harga_ritel || 0),
          hargaBaru: opsi.perbarui_harga ? ritel : Number(targetPrd.harga_ritel || 0)
        });
      }
    } else {
      const hpp = r.hpp !== undefined ? r.hpp : 0;
      const ritel = r.harga_ritel;
      const grosir = r.harga_grosir !== undefined ? r.harga_grosir : ritel;
      let err = '';
      if (!r.nama) err = 'Nama produk kosong';
      else if (ritel === undefined || ritel === null || ritel < 0) err = 'Harga ritel wajib diisi angka';
      else if (ritel < hpp) err = `Harga ritel (${formatRupiah(ritel)}) < HPP (${formatRupiah(hpp)})`;
      else if (grosir < hpp) err = `Harga grosir (${formatRupiah(grosir)}) < HPP (${formatRupiah(hpp)})`;

      if (err) {
        cntError++;
        hasil.push({ row: r, status: 'error', label: 'Error', detail: err, hargaLama: null, hargaBaru: ritel || 0 });
      } else {
        cntBaru++;
        hasil.push({
          row: r,
          status: 'baru',
          label: '+ Produk Baru',
          detail: `${r.nama}${r.kategori_nama ? ` (${r.kategori_nama})` : ''}`,
          hargaLama: null,
          hargaBaru: ritel
        });
      }
    }
  });

  return { hasil, cntBaru, cntUpdatePrd, cntUpdateVar, cntError };
}

/** Buka Modal Import & Export Massal Produk Excel / CSV */
export async function bukaModalImportExportProduk({ daftarKategori = [], onSelesai = null } = {}) {
  let semuaProduk = [];
  let parsedRows = [];
  let tabAktif = 'import';

  const modal = showModal({
    title: 'Import / Update Massal Produk & Harga (Excel / CSV)',
    size: 'xl',
    body: `
      <div class="stack">
        <div class="row-between" style="flex-wrap: wrap; gap: var(--sp-2);">
          <div class="segmented" id="tabs-import-produk">
            <button type="button" data-itab="import" aria-pressed="true">1. Unggah / Tempel Excel</button>
            <button type="button" data-itab="export" aria-pressed="false">2. Ekspor &amp; Template Excel</button>
          </div>
          <span class="badge badge-info" id="lbl-import-master-status">Memuat katalog master...</span>
        </div>

        <!-- PANEL EXPORT & TEMPLATE -->
        <div id="panel-import-export" class="stack" style="display: none;">
          <div class="form-grid cols-2" style="align-items: stretch;">
            <div class="card card-body stack-sm" style="background: var(--surface-2); justify-content: space-between; gap: var(--sp-3);">
              <div class="stack-sm">
                <div class="fw-bold text-sm" style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--primary);">${ICONS.fileSpreadsheet}</span>
                  <span>Ekspor Seluruh Katalog Produk &amp; Varian</span>
                </div>
                <div class="text-xs text-muted">
                  Unduh 100% produk dan seluruh variannya dalam format CSV UTF-8 yang langsung rapi dibuka di Microsoft Excel atau Google Sheets. Ubah harga massal, lalu impor kembali di tab 1.
                </div>
              </div>
              <div>
                <button type="button" class="btn btn-primary btn-sm" id="btn-ekspor-produk-csv" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.download}
                  <span>Ekspor Katalog Lengkap (.CSV)</span>
                </button>
              </div>
            </div>

            <div class="card card-body stack-sm" style="background: var(--surface-2); justify-content: space-between; gap: var(--sp-3);">
              <div class="stack-sm">
                <div class="fw-bold text-sm" style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--primary);">${ICONS.clipboard}</span>
                  <span>Unduh Template Tambah Produk Baru</span>
                </div>
                <div class="text-xs text-muted">
                  Cocok untuk menginput puluhan/ratusan barang toko bangunan baru sekaligus. Kategori yang belum ada akan otomatis dibuatkan oleh sistem.
                </div>
              </div>
              <div>
                <button type="button" class="btn btn-secondary btn-sm" id="btn-unduh-template-csv" style="display: inline-flex; align-items: center; gap: 6px;">
                  ${ICONS.download}
                  <span>Unduh Template Contoh (.CSV)</span>
                </button>
              </div>
            </div>
          </div>

          <div class="alert alert-info text-xs">
            ${ICONS.info}
            <div>
              <strong>Alur Update Harga Tercepat (Tanpa Simpan File):</strong> Buka daftar produk di Excel / Google Sheets &rarr; ubah kolom <code>HPP</code>, <code>HARGA_RITEL</code>, atau <code>HARGA_GROSIR</code> &rarr; blok seluruh tabel termasuk baris judul &rarr; tekan <strong>Ctrl+C</strong> &rarr; pindah ke tab <strong>1. Unggah / Tempel Excel</strong> dan langsung tekan <strong>Ctrl+V</strong>.
            </div>
          </div>
        </div>

        <!-- PANEL IMPORT / UPDATE MASSAL -->
        <div id="panel-import-upload" class="stack-sm">
          <div class="form-grid cols-2" style="align-items: start;">
            <div class="card card-body stack-sm" style="background: var(--surface-2); padding: var(--sp-3);">
              <div class="field">
                <label class="field-label" for="inp-file-import-csv">Pilih File CSV / TSV dari Komputer atau HP</label>
                <input type="file" id="inp-file-import-csv" class="input" accept=".csv,.tsv,.txt,text/csv,text/plain" style="padding: 7px 10px; height: auto;">
                <span class="field-hint">Mendukung pemisah koma (<code>,</code>), titik koma (<code>;</code> Excel Indonesia), dan tab (<code>TSV</code>).</span>
              </div>
            </div>

            <div class="card card-body stack-sm" style="background: var(--surface-2); padding: var(--sp-3); gap: 8px;">
              <div class="text-xs fw-bold">Opsi Pembaruan Data Eksisting</div>
              <label class="text-xs" style="display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 8px; cursor: pointer; line-height: 1.4;">
                <input type="checkbox" id="chk-imp-harga" checked style="width: 15px; height: 15px; margin-top: 2px; flex-shrink: 0; accent-color: var(--primary);">
                <span>Perbarui Harga (HPP, Harga Ritel, Harga Grosir)</span>
              </label>
              <label class="text-xs" style="display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 8px; cursor: pointer; line-height: 1.4;">
                <input type="checkbox" id="chk-imp-info" checked style="width: 15px; height: 15px; margin-top: 2px; flex-shrink: 0; accent-color: var(--primary);">
                <span>Perbarui Info Produk (Nama, Kategori, Satuan, Barcode, Status)</span>
              </label>
              <label class="text-xs" style="display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 8px; cursor: pointer; line-height: 1.4;">
                <input type="checkbox" id="chk-imp-kat" checked style="width: 15px; height: 15px; margin-top: 2px; flex-shrink: 0; accent-color: var(--primary);">
                <span>Auto-buat Kategori baru jika nama kategori belum terdaftar</span>
              </label>
              <label class="text-xs" style="display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 8px; cursor: pointer; line-height: 1.4;">
                <input type="checkbox" id="chk-imp-stok" style="width: 15px; height: 15px; margin-top: 2px; flex-shrink: 0; accent-color: var(--danger);">
                <span class="text-warning fw-semibold">Timpa Stok Fisik (Default MATI agar aman dari penjualan kasir)</span>
              </label>
            </div>
          </div>

          <div class="field">
            <div class="row-between">
              <label class="field-label" for="txt-paste-excel">Atau Tempel (Ctrl+V) Langsung Tabel dari Excel / Google Sheets</label>
              <button type="button" class="btn btn-ghost btn-xs" id="btn-bersih-paste-excel">Kosongkan</button>
            </div>
            <textarea id="txt-paste-excel" class="textarea mono" rows="4" placeholder="Tempel baris Excel/CSV di sini (sertakan baris judul kolom seperti: SKU, NAMA_PRODUK, KATEGORI, SATUAN, HPP, HARGA_RITEL, HARGA_GROSIR, STOK)..."></textarea>
          </div>

          <div id="area-preview-import" class="stack-sm"></div>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; gap: var(--sp-2); flex-wrap: wrap;">
        <button type="button" class="btn btn-outline btn-sm btn-cancel">Tutup</button>
        <div class="row" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-shortcut-ekspor-csv" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.download}
            <span>Ekspor Katalog</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-eksekusi-import" disabled style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.upload}
            <span id="lbl-btn-eksekusi-import">Jalankan Import (0 Baris)</span>
          </button>
        </div>
      </div>
    `
  });

  const elMasterStatus = modal.el.querySelector('#lbl-import-master-status');
  const panelUpload = modal.el.querySelector('#panel-import-upload');
  const panelExport = modal.el.querySelector('#panel-import-export');
  const txtPaste = modal.el.querySelector('#txt-paste-excel');
  const inpFile = modal.el.querySelector('#inp-file-import-csv');
  const areaPreview = modal.el.querySelector('#area-preview-import');
  const btnEksekusi = modal.el.querySelector('#btn-eksekusi-import');
  const lblEksekusi = modal.el.querySelector('#lbl-btn-eksekusi-import');

  const bacaOpsi = () => ({
    perbarui_harga: Boolean(modal.el.querySelector('#chk-imp-harga')?.checked),
    perbarui_info: Boolean(modal.el.querySelector('#chk-imp-info')?.checked),
    buat_kategori_otomatis: Boolean(modal.el.querySelector('#chk-imp-kat')?.checked),
    perbarui_stok: Boolean(modal.el.querySelector('#chk-imp-stok')?.checked)
  });

  const renderPreview = () => {
    if (!parsedRows.length) {
      areaPreview.innerHTML = `<div class="text-xs text-muted" style="padding: var(--sp-3); text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-md);">Unggah file CSV atau tempel data dari Excel di atas untuk melihat pratinjau perubahan sebelum disimpan.</div>`;
      btnEksekusi.disabled = true;
      lblEksekusi.textContent = 'Jalankan Import (0 Baris)';
      return;
    }

    const opsi = bacaOpsi();
    const { hasil, cntBaru, cntUpdatePrd, cntUpdateVar, cntError } = analisisPratinjauImport(parsedRows, semuaProduk, opsi);
    const validCount = hasil.length - cntError;
    btnEksekusi.disabled = validCount === 0 || hasil.length > 500;
    lblEksekusi.textContent = `Proses ${validCount} Baris Valid`;

    const sliceTampil = hasil.slice(0, 80);
    areaPreview.innerHTML = `
      <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
        <span class="badge badge-success">+ Baru: ${cntBaru}</span>
        <span class="badge badge-primary">Update Produk: ${cntUpdatePrd}</span>
        <span class="badge badge-info">Update Varian: ${cntUpdateVar}</span>
        ${cntError > 0 ? `<span class="badge badge-danger">Error: ${cntError}</span>` : ''}
        ${hasil.length > 500 ? `<span class="badge badge-danger">Melebihi batas 500 baris per batch!</span>` : ''}
      </div>
      <div class="table-wrap" style="max-height: 290px; overflow: auto;">
        <table class="table keep-table">
          <thead>
            <tr>
              <th>Baris</th>
              <th>Aksi</th>
              <th>SKU</th>
              <th>Produk / Varian</th>
              <th class="text-right">Harga Ritel</th>
              <th class="text-right">Stok</th>
            </tr>
          </thead>
          <tbody>
            ${sliceTampil.map((it) => {
              const badgeCls = it.status === 'error'
                ? 'badge-danger'
                : (it.status === 'baru' ? 'badge-success' : (it.status === 'update_var' ? 'badge-info' : 'badge-primary'));
              const hargaTeks = it.hargaLama !== null && it.hargaLama !== it.hargaBaru
                ? `<span class="text-muted" style="text-decoration: line-through;">${formatRupiah(it.hargaLama)}</span> &rarr; <strong class="text-primary">${formatRupiah(it.hargaBaru)}</strong>`
                : formatRupiah(it.hargaBaru || 0);
              return `
                <tr>
                  <td class="mono text-xs">${it.row._baris}</td>
                  <td><span class="badge ${badgeCls}">${escapeHtml(it.label)}</span></td>
                  <td class="mono text-xs">${escapeHtml(it.row.sku || '(Auto)')}</td>
                  <td class="text-xs">${escapeHtml(it.detail)}</td>
                  <td class="text-right mono text-xs">${hargaTeks}</td>
                  <td class="text-right mono text-xs">${it.row.stok !== undefined ? formatQty(it.row.stok) : '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${hasil.length > sliceTampil.length ? `<div class="text-xs text-muted">Menampilkan ${sliceTampil.length} baris pertama dari total ${hasil.length} baris yang akan diproses.</div>` : ''}
    `;
  };

  const prosesTeksMasukan = (raw) => {
    const parsed = parseTeksTabelImport(raw);
    parsedRows = parsed.rows;
    renderPreview();
  };

  // Tab switch
  const footerAksiImport = modal.el.querySelector('#btn-eksekusi-import')?.parentElement;
  modal.el.querySelectorAll('#tabs-import-produk button').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabAktif = btn.getAttribute('data-itab');
      modal.el.querySelectorAll('#tabs-import-produk button').forEach((b) => {
        b.setAttribute('aria-pressed', b.getAttribute('data-itab') === tabAktif ? 'true' : 'false');
      });
      panelUpload.style.display = tabAktif === 'import' ? 'flex' : 'none';
      panelExport.style.display = tabAktif === 'export' ? 'flex' : 'none';
      if (footerAksiImport) {
        footerAksiImport.style.display = tabAktif === 'import' ? 'flex' : 'none';
      }
    });
  });

  // File input & paste events
  inpFile?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      txtPaste.value = text;
      prosesTeksMasukan(text);
      showToast(`File "${file.name}" terbaca (${parsedRows.length} baris).`, 'info', 2200);
    } catch (err) {
      showToast('Gagal membaca file: ' + err.message, 'error');
    }
  });

  let pasteTimer = null;
  txtPaste?.addEventListener('input', () => {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => prosesTeksMasukan(txtPaste.value), 200);
  });

  modal.el.querySelector('#btn-bersih-paste-excel')?.addEventListener('click', () => {
    txtPaste.value = '';
    if (inpFile) inpFile.value = '';
    parsedRows = [];
    renderPreview();
  });

  ['#chk-imp-harga', '#chk-imp-info', '#chk-imp-kat', '#chk-imp-stok'].forEach((sel) => {
    modal.el.querySelector(sel)?.addEventListener('change', renderPreview);
  });

  const jalankanEkspor = () => {
    if (!semuaProduk.length) {
      showToast('Data katalog belum termuat atau masih kosong.', 'warning');
      return;
    }
    const n = eksporProdukCsvExcel(semuaProduk, daftarKategori);
    showToast(`Berhasil mengekspor ${n} baris produk & varian ke file CSV Excel!`, 'success');
  };

  modal.el.querySelector('#btn-ekspor-produk-csv')?.addEventListener('click', jalankanEkspor);
  modal.el.querySelector('#btn-shortcut-ekspor-csv')?.addEventListener('click', jalankanEkspor);
  modal.el.querySelector('#btn-unduh-template-csv')?.addEventListener('click', () => {
    unduhTemplateImportProduk();
    showToast('Template CSV contoh berhasil diunduh.', 'success');
  });

  // Eksekusi import ke backend GAS
  btnEksekusi?.addEventListener('click', async () => {
    const opsi = bacaOpsi();
    const { hasil, cntBaru, cntUpdatePrd, cntUpdateVar, cntError } = analisisPratinjauImport(parsedRows, semuaProduk, opsi);
    const validItems = hasil.filter((h) => h.status !== 'error').map((h) => h.row);
    if (!validItems.length) {
      showToast('Tidak ada baris valid untuk diproses.', 'warning');
      return;
    }

    const ok = await showConfirm({
      title: 'Konfirmasi Import Massal Produk?',
      message: `Sistem akan memproses ${validItems.length} baris valid (${cntBaru} baru, ${cntUpdatePrd} update produk, ${cntUpdateVar} update varian${cntError ? `, ${cntError} baris error dilewati` : ''}).${opsi.perbarui_stok ? ' PERHATIAN: Opsi Timpa Stok Fisik AKTIF dan akan mencatat koreksi di Kartu Stok.' : ''}`,
      confirmText: 'Ya, Proses Sekarang',
      danger: opsi.perbarui_stok
    });
    if (!ok) return;

    btnEksekusi.disabled = true;
    lblEksekusi.textContent = 'Memproses ke Server...';
    try {
      const res = await apiCall('produk.importMassal', {
        items: validItems,
        opsi
      });
      showToast(res.pesan || 'Import massal berhasil dijalankan!', 'success', 4500);
      modal.close();
      if (typeof onSelesai === 'function') onSelesai(res);
    } catch (err) {
      showToast('Gagal import massal: ' + err.message, 'error', 4500);
      btnEksekusi.disabled = false;
      lblEksekusi.textContent = `Proses ${validItems.length} Baris Valid`;
    }
  });

  renderPreview();

  // Muat seluruh katalog dari server di latar belakang
  try {
    semuaProduk = await muatSemuaProdukUntukImport();
    if (elMasterStatus) {
      elMasterStatus.className = 'badge badge-success';
      elMasterStatus.textContent = `${semuaProduk.length} produk siap dicocokkan`;
    }
    if (parsedRows.length) renderPreview();
  } catch (err) {
    if (elMasterStatus) {
      elMasterStatus.className = 'badge badge-warning';
      elMasterStatus.textContent = 'Gagal memuat katalog master';
    }
  }
}

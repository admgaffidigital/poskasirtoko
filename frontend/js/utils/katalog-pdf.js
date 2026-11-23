/**
 * katalog-pdf.js — Generator Katalog Produk PDF A4 Profesional untuk Toko Bangunan
 * Fitur:
 * - Pilih produk dari Mode Pilih / filter kategori / preset tersimpan
 * - 3 Layout A4: Brosur Kartu 2 Kolom (Detail), Brosur Kartu 3 Kolom (Kompak), & Price List Tabel Resmi
 * - 4 Mode Harga: Ritel, Grosir/Proyek, Ritel + Grosir, atau Tanpa Harga ("Hubungi Kami")
 * - 4 Tema Warna Cetak: Teal Teknik, Oranye Bangunan, Biru Proyek, & Hitam-Putih Hemat Tinta
 * - Rincian Varian & Konversi Satuan, Pengelompokan Kategori Otomatis, Anti-Potong Halaman, & Live Preview A4
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { formatRupiah, formatQty, formatTanggal, escapeHtml } from './format.js';
import { showToast, showModal, showConfirm, ICONS } from './ui.js';

const KEY_KATALOG_PRESETS = 'pos_katalog_pdf_presets_v1';

const TEMA_KATALOG = {
  teal: { nama: 'Teal Teknik', primary: '#0f766e', soft: '#f0fdfa', border: '#99f6e4', ink: '#134e4a' },
  orange: { nama: 'Oranye Bangunan', primary: '#c2410c', soft: '#fff7ed', border: '#fed7aa', ink: '#7c2d12' },
  blue: { nama: 'Biru Proyek', primary: '#1d4ed8', soft: '#eff6ff', border: '#bfdbfe', ink: '#1e3a8a' },
  bw: { nama: 'Hitam-Putih (Hemat Tinta)', primary: '#111827', soft: '#f9fafb', border: '#d1d5db', ink: '#111827' }
};

/** Ambil daftar preset katalog tersimpan di perangkat */
export function ambilPresetKatalog() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_KATALOG_PRESETS) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

/** Simpan / perbarui preset katalog di perangkat */
export function simpanPresetKatalog(preset) {
  const list = ambilPresetKatalog();
  const idx = list.findIndex((x) => x.id === preset.id || x.nama.toLowerCase() === String(preset.nama || '').toLowerCase());
  const item = {
    id: preset.id || 'pr_' + Date.now(),
    nama: String(preset.nama || 'Katalog Kustom').trim(),
    productIds: Array.isArray(preset.productIds) ? preset.productIds : [],
    config: preset.config || {},
    updatedAt: new Date().toISOString()
  };
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY_KATALOG_PRESETS, JSON.stringify(list.slice(0, 20)));
    }
  } catch (_) {}
  return item;
}

/** Hapus preset katalog */
export function hapusPresetKatalog(presetId) {
  const list = ambilPresetKatalog().filter((x) => x.id !== presetId);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY_KATALOG_PRESETS, JSON.stringify(list));
    }
  } catch (_) {}
  return list;
}

/** Normalisasi URL foto Google Drive / URL biasa agar ramah cetak A4 */
function normalisasiUrlFotoKatalog(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('data:image/')) return u;
  const mDrive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([a-zA-Z0-9_-]+)/);
  if (mDrive && mDrive[1]) {
    return `https://lh3.googleusercontent.com/d/${mDrive[1]}=w400`;
  }
  return u;
}

/** Ambil informasi profil toko dari pengaturan */
function ambilInfoTokoKatalog() {
  const cfg = store.get('pengaturan') || {};
  const tokoStore = store.get('toko') || {};
  const namaFallback = store.getNamaToko ? store.getNamaToko() : 'TOKO BANGUNAN';
  return {
    nama: cfg.toko_nama || tokoStore.nama || namaFallback,
    alamat: cfg.toko_alamat || tokoStore.alamat || '',
    hp: cfg.toko_hp || tokoStore.hp || ''
  };
}

/** Hitung rentang/label harga produk untuk katalog */
function formatBlokHargaKatalog(prd, modeHarga) {
  if (modeHarga === 'tanpa_harga') {
    return { utama: 'Hubungi Kami', sekunder: '' };
  }

  const satuan = prd.satuan_dasar || 'PCS';
  const varianAktif = Array.isArray(prd.varian) ? prd.varian.filter((v) => !v.deleted) : [];

  if (prd.punya_varian && varianAktif.length > 0) {
    const fieldUtama = modeHarga === 'grosir' ? 'harga_grosir' : 'harga_ritel';
    const hargaVals = varianAktif.map((v) => Number(v[fieldUtama] || v.harga_ritel || 0)).filter((n) => n > 0);
    if (hargaVals.length > 0) {
      const minH = Math.min(...hargaVals);
      const maxH = Math.max(...hargaVals);
      const utama = minH === maxH
        ? `${formatRupiah(minH)} / ${satuan}`
        : `${formatRupiah(minH)} - ${formatRupiah(maxH)}`;
      if (modeHarga === 'keduanya') {
        const gVals = varianAktif.map((v) => Number(v.harga_grosir || v.harga_ritel || 0)).filter((n) => n > 0);
        const minG = gVals.length ? Math.min(...gVals) : 0;
        return { utama, sekunder: minG > 0 ? `Grosir mulai ${formatRupiah(minG)}` : '' };
      }
      return { utama, sekunder: modeHarga === 'grosir' ? 'Harga Grosir / Proyek' : `${varianAktif.length} pilihan varian` };
    }
  }

  const hRitel = Number(prd.harga_ritel || 0);
  const hGrosir = Number(prd.harga_grosir || hRitel || 0);
  const minGrosir = Number(prd.min_grosir_qty || 1);

  if (modeHarga === 'grosir') {
    return {
      utama: `${formatRupiah(hGrosir)} / ${satuan}`,
      sekunder: minGrosir > 1 ? `Min. beli ${formatQty(minGrosir)} ${satuan}` : 'Harga Grosir / Proyek'
    };
  }
  if (modeHarga === 'keduanya') {
    const adaBeda = hGrosir > 0 && hGrosir !== hRitel;
    return {
      utama: `${formatRupiah(hRitel)} / ${satuan}`,
      sekunder: adaBeda
        ? `Grosir: ${formatRupiah(hGrosir)}${minGrosir > 1 ? ` (min ${formatQty(minGrosir)})` : ''}`
        : ''
    };
  }
  return { utama: `${formatRupiah(hRitel)} / ${satuan}`, sekunder: '' };
}

/**
 * Susun dokumen HTML A4 lengkap siap cetak / Simpan PDF untuk Katalog Produk Toko Bangunan
 * @param {Array<Object>} produkList
 * @param {Object} opsi
 * @param {Map<string, string>} [petaKategori]
 * @returns {string}
 */
export function buatHtmlKatalogPdf(produkList, opsi = {}, petaKategori = new Map()) {
  const toko = ambilInfoTokoKatalog();
  const tema = TEMA_KATALOG[opsi.tema] || TEMA_KATALOG.teal;
  const layout = ['grid2', 'grid3', 'table'].includes(opsi.layout) ? opsi.layout : 'grid2';
  const modeHarga = ['ritel', 'grosir', 'keduanya', 'tanpa_harga'].includes(opsi.modeHarga) ? opsi.modeHarga : 'ritel';
  const groupByCategory = opsi.groupByCategory !== false;
  const showPhoto = opsi.showPhoto !== false;
  const showVariants = opsi.showVariants !== false;
  const showStock = opsi.showStock !== false;
  const showSku = opsi.showSku !== false;

  const bulanTahun = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const judul = String(opsi.judul || 'KATALOG PRODUK & DAFTAR HARGA').trim();
  const subjudul = String(opsi.subjudul || `Edisi ${bulanTahun}`).trim();
  const catatan = String(opsi.catatan || `Harga dapat berubah sewaktu-waktu mengikuti harga pasar bahan bangunan.${toko.hp ? ` Pemesanan & info stok terbaru via WhatsApp: ${toko.hp}` : ''}`).trim();

  const labelModeHargaMap = {
    ritel: 'HARGA ECERAN / RITEL',
    grosir: 'HARGA GROSIR / PROYEK',
    keduanya: 'HARGA RITEL & GROSIR',
    tanpa_harga: 'BROSUR PRODUK'
  };

  // Kelompokkan produk per kategori jika diaktifkan
  const grupMap = new Map();
  (produkList || []).forEach((p) => {
    const namaKat = groupByCategory
      ? (petaKategori.get(p.kategori_id) || p.kategori_nama || 'Produk Lainnya')
      : 'Daftar Produk Pilihan';
    if (!grupMap.has(namaKat)) grupMap.set(namaKat, []);
    grupMap.get(namaKat).push(p);
  });

  const renderPlaceholderSvg = () => `
    <div class="ph-img">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
        <path d="m3.3 7 8.7 5 8.7-5"/>
        <path d="M12 22V12"/>
      </svg>
    </div>
  `;

  const renderKartuProduk = (p) => {
    const foto = showPhoto ? normalisasiUrlFotoKatalog(p.foto_url) : '';
    const harga = formatBlokHargaKatalog(p, modeHarga);
    const ready = Number(p.stok || 0) > 0 || (p.punya_varian && Array.isArray(p.varian) && p.varian.some((v) => !v.deleted && Number(v.stok || 0) > 0));
    const varianList = showVariants && p.punya_varian && Array.isArray(p.varian)
      ? p.varian.filter((v) => !v.deleted)
      : [];
    const konversiList = showVariants && Array.isArray(p.satuan_konversi)
      ? p.satuan_konversi.filter((s) => !s.deleted)
      : [];

    const varianHtml = varianList.length > 0 ? `
      <div class="var-box">
        <div class="var-hdr">Pilihan Varian / Ukuran:</div>
        <table class="var-tbl">
          ${varianList.slice(0, layout === 'grid3' ? 4 : 8).map((v) => {
            const vHarga = modeHarga === 'tanpa_harga'
              ? 'Hubungi'
              : formatRupiah(modeHarga === 'grosir' ? (v.harga_grosir || v.harga_ritel || 0) : (v.harga_ritel || 0));
            return `<tr><td class="var-nm">${escapeHtml(v.nama || '-')}</td><td class="var-pr">${escapeHtml(vHarga)}</td></tr>`;
          }).join('')}
          ${varianList.length > (layout === 'grid3' ? 4 : 8) ? `<tr><td colspan="2" class="var-more">+ ${varianList.length - (layout === 'grid3' ? 4 : 8)} varian lainnya</td></tr>` : ''}
        </table>
      </div>
    ` : '';

    const konversiHtml = konversiList.length > 0 ? `
      <div class="conv-line">
        Kemasan: ${konversiList.map((s) => {
          const teksSat = `1 ${escapeHtml(s.nama_satuan)} = ${formatQty(s.isi_dalam_dasar)} ${escapeHtml(p.satuan_dasar || 'PCS')}`;
          const hSat = modeHarga !== 'tanpa_harga' && Number(s.harga_ritel || 0) > 0 ? ` (${formatRupiah(modeHarga === 'grosir' ? (s.harga_grosir || s.harga_ritel) : s.harga_ritel)})` : '';
          return teksSat + hSat;
        }).join(' &bull; ')}
      </div>
    ` : '';

    return `
      <div class="prod-card">
        ${showPhoto ? `
          <div class="prod-img-wrap">
            ${foto ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(p.nama || '')}" crossorigin="anonymous" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="ph-img" style="display:none;"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>` : renderPlaceholderSvg()}
            ${showStock ? `<span class="stk-pill ${ready ? 'stk-ok' : 'stk-no'}">${ready ? 'Ready' : 'Inden'}</span>` : ''}
          </div>
        ` : ''}
        <div class="prod-body">
          <div class="prod-meta-top">
            ${showSku && p.sku ? `<span class="sku-tag">${escapeHtml(p.sku)}</span>` : '<span></span>'}
            ${!showPhoto && showStock ? `<span class="stk-inline ${ready ? 'stk-ok' : 'stk-no'}">${ready ? 'Ready' : 'Inden'}</span>` : ''}
          </div>
          <div class="prod-name">${escapeHtml(p.nama || 'Produk')}</div>
          <div class="price-box">
            <div class="price-main">${escapeHtml(harga.utama)}</div>
            ${harga.sekunder ? `<div class="price-sub">${escapeHtml(harga.sekunder)}</div>` : ''}
          </div>
          ${varianHtml}
          ${konversiHtml}
        </div>
      </div>
    `;
  };

  let nomorUrutTabel = 1;
  const kontenGrupHtml = Array.from(grupMap.entries()).map(([namaKat, items]) => {
    const headerKatHtml = groupByCategory ? `
      <div class="cat-bar">
        <span class="cat-name">${escapeHtml(namaKat)}</span>
        <span class="cat-cnt">${items.length} produk</span>
      </div>
    ` : '';

    if (layout === 'table') {
      const rowsHtml = items.map((p) => {
        const no = nomorUrutTabel++;
        const foto = showPhoto ? normalisasiUrlFotoKatalog(p.foto_url) : '';
        const harga = formatBlokHargaKatalog(p, modeHarga);
        const ready = Number(p.stok || 0) > 0 || (p.punya_varian && Array.isArray(p.varian) && p.varian.some((v) => !v.deleted && Number(v.stok || 0) > 0));
        const varianList = showVariants && p.punya_varian && Array.isArray(p.varian) ? p.varian.filter((v) => !v.deleted) : [];
        const konversiList = showVariants && Array.isArray(p.satuan_konversi) ? p.satuan_konversi.filter((s) => !s.deleted) : [];
        const detailVarian = varianList.length > 0
          ? `<div class="tbl-sub">Varian: ${varianList.map((v) => `${escapeHtml(v.nama)}${modeHarga !== 'tanpa_harga' ? ` (${formatRupiah(modeHarga === 'grosir' ? (v.harga_grosir || v.harga_ritel || 0) : (v.harga_ritel || 0))})` : ''}`).join(' &bull; ')}</div>`
          : '';
        const detailKonv = konversiList.length > 0
          ? `<div class="tbl-sub">Kemasan: ${konversiList.map((s) => `1 ${escapeHtml(s.nama_satuan)} = ${formatQty(s.isi_dalam_dasar)} ${escapeHtml(p.satuan_dasar || 'PCS')}`).join(' &bull; ')}</div>`
          : '';

        return `
          <tr>
            <td class="c">${no}</td>
            ${showPhoto ? `<td class="c">${foto ? `<img class="tbl-thumb" src="${escapeHtml(foto)}" alt="" crossorigin="anonymous" onerror="this.style.display='none'">` : '<div class="tbl-thumb-ph">-</div>'}</td>` : ''}
            <td>
              <div class="tbl-nm">${escapeHtml(p.nama || 'Produk')}</div>
              ${showSku && p.sku ? `<div class="tbl-sku">SKU: ${escapeHtml(p.sku)}</div>` : ''}
              ${detailVarian}
              ${detailKonv}
            </td>
            <td class="c">${escapeHtml(p.satuan_dasar || 'PCS')}</td>
            ${modeHarga === 'keduanya' ? `
              <td class="r"><strong>${escapeHtml(formatRupiah(p.harga_ritel || 0))}</strong></td>
              <td class="r">${escapeHtml(formatRupiah(p.harga_grosir || p.harga_ritel || 0))}</td>
            ` : `
              <td class="r"><strong>${escapeHtml(harga.utama)}</strong>${harga.sekunder ? `<div class="tbl-sub">${escapeHtml(harga.sekunder)}</div>` : ''}</td>
            `}
            ${showStock ? `<td class="c"><span class="stk-inline ${ready ? 'stk-ok' : 'stk-no'}">${ready ? 'Ready' : 'Inden'}</span></td>` : ''}
          </tr>
        `;
      }).join('');

      return `
        <section class="cat-section">
          ${headerKatHtml}
          <table class="pl-table">
            <thead>
              <tr>
                <th class="c" style="width: 28px;">No</th>
                ${showPhoto ? '<th class="c" style="width: 44px;">Foto</th>' : ''}
                <th>Nama Produk &amp; Spesifikasi</th>
                <th class="c" style="width: 56px;">Satuan</th>
                ${modeHarga === 'keduanya'
                  ? '<th class="r" style="width: 88px;">Harga Ritel</th><th class="r" style="width: 88px;">Harga Grosir</th>'
                  : `<th class="r" style="width: 112px;">${modeHarga === 'grosir' ? 'Harga Grosir' : (modeHarga === 'tanpa_harga' ? 'Keterangan' : 'Harga')}</th>`}
                ${showStock ? '<th class="c" style="width: 54px;">Stok</th>' : ''}
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </section>
      `;
    }

    return `
      <section class="cat-section">
        ${headerKatHtml}
        <div class="prod-grid ${layout === 'grid3' ? 'cols-3' : 'cols-2'}">
          ${items.map(renderKartuProduk).join('')}
        </div>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(judul)} - ${escapeHtml(toko.nama)}</title>
  <style>
    @page { size: A4 portrait; margin: 11mm 10mm 12mm 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: 'Segoe UI', 'Roboto', Arial, Helvetica, sans-serif;
      font-size: 10px;
      line-height: 1.38;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc { width: 100%; max-width: 190mm; margin: 0 auto; }

    /* Kop / Header Katalog Profesional */
    .hero {
      border: 1.5px solid ${tema.primary};
      border-top: 6px solid ${tema.primary};
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 12px;
      background: ${tema.soft};
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
    }
    .hero-left { flex: 1.3; min-width: 0; }
    .hero-right { flex: 0.9; text-align: right; }
    .toko-name { font-size: 16px; font-weight: 800; color: ${tema.ink}; letter-spacing: 0.3px; }
    .toko-meta { font-size: 9.5px; color: #374151; margin-top: 3px; white-space: pre-line; }
    .cat-title { font-size: 13.5px; font-weight: 800; color: ${tema.primary}; letter-spacing: 0.4px; }
    .cat-sub { font-size: 9.5px; font-weight: 600; color: #374151; margin-top: 2px; }
    .cat-badge {
      display: inline-block;
      margin-top: 5px;
      padding: 2px 8px;
      border-radius: 99px;
      background: ${tema.primary};
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.4px;
    }

    /* Pembatas Kategori */
    .cat-section { margin-bottom: 12px; }
    .cat-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 10px;
      background: ${tema.primary};
      color: #ffffff;
      border-radius: 4px;
      margin-bottom: 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .cat-name { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
    .cat-cnt { font-size: 9px; font-weight: 600; opacity: 0.92; }

    /* Grid Kartu Produk */
    .prod-grid { display: grid; gap: 8px; }
    .prod-grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .prod-grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

    .prod-card {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .prod-img-wrap {
      position: relative;
      width: 100%;
      height: ${layout === 'grid3' ? '92px' : '116px'};
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .prod-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 4px;
      background: #ffffff;
    }
    .ph-img {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      background: #f3f4f6;
    }
    .stk-pill {
      position: absolute;
      top: 5px;
      right: 5px;
      padding: 1.5px 6px;
      border-radius: 99px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .stk-inline {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 99px;
      font-size: 8px;
      font-weight: 700;
    }
    .stk-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .stk-no { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }

    .prod-body { padding: ${layout === 'grid3' ? '7px 8px' : '8px 10px'}; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .prod-meta-top { display: flex; justify-content: space-between; align-items: center; gap: 4px; min-height: 12px; }
    .sku-tag { font-family: 'Courier New', monospace; font-size: 8px; color: #6b7280; font-weight: 600; }
    .prod-name {
      font-size: ${layout === 'grid3' ? '10px' : '11px'};
      font-weight: 800;
      color: #111827;
      line-height: 1.28;
    }
    .price-box {
      margin-top: 1px;
      padding: 4px 7px;
      border-radius: 4px;
      background: ${tema.soft};
      border: 1px solid ${tema.border};
    }
    .price-main {
      font-size: ${layout === 'grid3' ? '10.5px' : '11.5px'};
      font-weight: 800;
      color: ${tema.primary};
      font-variant-numeric: tabular-nums;
    }
    .price-sub { font-size: 8.5px; color: #4b5563; font-weight: 600; margin-top: 1px; }

    .var-box { margin-top: 2px; border-top: 1px dashed #d1d5db; padding-top: 3px; }
    .var-hdr { font-size: 8px; font-weight: 700; color: #4b5563; text-transform: uppercase; margin-bottom: 2px; }
    .var-tbl { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .var-tbl td { padding: 1px 0; border-bottom: 1px dotted #e5e7eb; }
    .var-tbl tr:last-child td { border-bottom: 0; }
    .var-nm { color: #374151; font-weight: 600; }
    .var-pr { text-align: right; font-weight: 700; color: #111827; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .var-more { text-align: center; color: #6b7280; font-style: italic; padding-top: 2px; }
    .conv-line { font-size: 8px; color: #4b5563; background: #f9fafb; border-radius: 3px; padding: 2px 5px; margin-top: 1px; }

    /* Layout Tabel Price List Resmi */
    .pl-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
    .pl-table th {
      background: ${tema.soft};
      color: ${tema.ink};
      border: 1px solid ${tema.border};
      padding: 5px 6px;
      text-align: left;
      font-weight: 700;
    }
    .pl-table td {
      border: 1px solid #d1d5db;
      padding: 5px 6px;
      vertical-align: middle;
    }
    .pl-table tr { page-break-inside: avoid; break-inside: avoid; }
    .pl-table tbody tr:nth-child(even) { background: #fafafa; }
    .tbl-thumb { width: 34px; height: 34px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 3px; background: #fff; display: block; margin: 0 auto; }
    .tbl-thumb-ph { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af; border-radius: 3px; margin: 0 auto; font-size: 9px; }
    .tbl-nm { font-weight: 700; color: #111827; font-size: 10px; }
    .tbl-sku { font-family: 'Courier New', monospace; font-size: 8px; color: #6b7280; }
    .tbl-sub { font-size: 8px; color: #4b5563; margin-top: 2px; line-height: 1.3; }
    .c { text-align: center; }
    .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

    /* Footer Katalog */
    .doc-footer {
      margin-top: 14px;
      padding: 8px 12px;
      border: 1px solid ${tema.border};
      border-left: 4px solid ${tema.primary};
      border-radius: 4px;
      background: ${tema.soft};
      font-size: 9px;
      color: #374151;
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .doc-footer-meta { text-align: right; font-size: 8.5px; color: #6b7280; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="doc">
    <header class="hero">
      <div class="hero-left">
        <div class="toko-name">${escapeHtml((toko.nama || 'TOKO BANGUNAN').toUpperCase())}</div>
        ${toko.alamat ? `<div class="toko-meta">${escapeHtml(toko.alamat)}</div>` : ''}
        ${toko.hp ? `<div class="toko-meta"><strong>Telp / WhatsApp:</strong> ${escapeHtml(toko.hp)}</div>` : ''}
      </div>
      <div class="hero-right">
        <div class="cat-title">${escapeHtml(judul)}</div>
        <div class="cat-sub">${escapeHtml(subjudul)} &bull; ${produkList.length} Produk</div>
        <div class="cat-badge">${escapeHtml(labelModeHargaMap[modeHarga] || 'KATALOG')}</div>
      </div>
    </header>

    ${kontenGrupHtml}

    <footer class="doc-footer">
      <div><strong>Catatan:</strong> ${escapeHtml(catatan)}</div>
      <div class="doc-footer-meta">Dicetak: ${escapeHtml(formatTanggal(new Date(), true))}</div>
    </footer>
  </div>
</body>
</html>`;
}

/** Cetak / Simpan PDF A4 katalog via iframe tersembunyi (menunggu foto termuat dulu) */
function cetakHtmlKatalogA4(htmlDoc) {
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(htmlDoc);
  doc.close();

  const eksekusiCetak = () => {
    try {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    } finally {
      setTimeout(() => {
        if (printFrame.parentElement) printFrame.remove();
      }, 2000);
    }
  };

  // Tunggu semua gambar termuat (maksimal 2.5 detik agar tetap responsif)
  setTimeout(() => {
    const imgs = Array.from(doc.querySelectorAll('img'));
    if (!imgs.length) {
      eksekusiCetak();
      return;
    }
    let selesai = false;
    const lanjut = () => {
      if (selesai) return;
      selesai = true;
      eksekusiCetak();
    };
    const timer = setTimeout(lanjut, 2500);
    let sisa = imgs.length;
    const cekSatu = () => {
      sisa--;
      if (sisa <= 0) {
        clearTimeout(timer);
        lanjut();
      }
    };
    imgs.forEach((im) => {
      if (im.complete) cekSatu();
      else {
        im.addEventListener('load', cekSatu, { once: true });
        im.addEventListener('error', cekSatu, { once: true });
      }
    });
  }, 200);
}

/**
 * Buka Modal Generator & Pratinjau Katalog Produk PDF Profesional
 * @param {Object} [params={}]
 * @param {Array<Object>} [params.produkTerpilih=[]] Produk yang sudah dicentang di Mode Pilih
 * @param {Array<Object>} [params.daftarKategori=[]] Daftar kategori untuk filter & label grup
 * @param {string} [params.kategoriAwal=''] Kategori aktif di halaman produk
 */
export async function bukaModalKatalogPdf(params = {}) {
  const awalTerpilih = Array.isArray(params.produkTerpilih) ? params.produkTerpilih : [];
  const daftarKategori = Array.isArray(params.daftarKategori) ? params.daftarKategori : [];
  const petaKategori = new Map();
  daftarKategori.forEach((k) => { if (k && k.id) petaKategori.set(k.id, k.nama); });

  const toko = ambilInfoTokoKatalog();
  const bulanTahun = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const stateKat = {
    tab: awalTerpilih.length > 0 ? 'preview' : 'pilih',
    semuaProduk: [...awalTerpilih],
    terpilihIds: new Set(awalTerpilih.map((p) => p.id)),
    filterQ: '',
    filterKat: params.kategoriAwal || '',
    hanyaReady: false,
    loadedAll: false,
    opsi: {
      judul: 'KATALOG PRODUK & DAFTAR HARGA',
      subjudul: `Edisi ${bulanTahun}`,
      catatan: `Harga dapat berubah sewaktu-waktu mengikuti harga bahan bangunan.${toko.hp ? ` Order via WhatsApp: ${toko.hp}` : ''}`,
      layout: 'grid2',
      modeHarga: 'ritel',
      tema: 'teal',
      groupByCategory: true,
      showPhoto: true,
      showVariants: true,
      showStock: true,
      showSku: true
    }
  };

  const modal = showModal({
    title: 'Generator Katalog Produk PDF (A4)',
    size: 'xl',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <!-- Tab Navigasi -->
        <div class="row-between" style="gap: var(--sp-2); flex-wrap: wrap;">
          <div class="segmented segmented-equal" id="tabs-katalog-pdf" style="max-width: 380px;">
            <button type="button" data-ktab="pilih" aria-pressed="${stateKat.tab === 'pilih'}">
              ${ICONS.check}
              <span>1. Pilih Produk (<span id="cnt-tab-pilih">${stateKat.terpilihIds.size}</span>)</span>
            </button>
            <button type="button" data-ktab="preview" aria-pressed="${stateKat.tab === 'preview'}">
              ${ICONS.eye}
              <span>2. Desain &amp; Pratinjau PDF</span>
            </button>
          </div>

          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <select id="sel-katalog-preset" class="input input-sm" style="min-width: 175px;" title="Muat daftar katalog yang pernah disimpan">
              <option value="">-- Preset Katalog Tersimpan --</option>
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-simpan-preset-kat" title="Simpan pilihan produk ini sebagai preset agar mudah dicetak ulang">
              ${ICONS.clipboard}
              <span>Simpan Preset</span>
            </button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-hapus-preset-kat" style="display: none; color: var(--danger);" title="Hapus preset terpilih">
              ${ICONS.trash}
            </button>
          </div>
        </div>

        <!-- PANEL 1: PILIH & TANDAI PRODUK -->
        <div id="panel-katalog-pilih" class="stack-sm" style="display: ${stateKat.tab === 'pilih' ? 'flex' : 'none'};">
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div class="input-group grow" style="min-width: 180px;">
              <span class="input-icon">${ICONS.search}</span>
              <input type="text" id="inp-kat-cari" class="input input-sm" placeholder="Cari produk / SKU untuk ditandai...">
            </div>
            <select id="sel-kat-filter" class="input input-sm" style="min-width: 160px;">
              <option value="">Semua Kategori</option>
              ${daftarKategori.map((k) => `<option value="${escapeHtml(k.id)}" ${stateKat.filterKat === k.id ? 'selected' : ''}>${escapeHtml(k.nama)}</option>`).join('')}
            </select>
            <label class="row text-xs fw-semibold" style="gap: 6px; cursor: pointer; padding: 0 6px;">
              <input type="checkbox" id="chk-kat-ready" style="width: 15px; height: 15px; accent-color: var(--primary);">
              <span>Ready Stok Saja</span>
            </label>
          </div>

          <div class="row-between" style="gap: var(--sp-2); flex-wrap: wrap;">
            <div class="text-xs text-muted" id="lbl-status-muat-kat">Memuat daftar produk...</div>
            <div class="row" style="gap: var(--sp-1); flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-xs" id="btn-kat-pilih-tampil">Pilih Semua Tampil</button>
              <button type="button" class="btn btn-ghost btn-xs" id="btn-kat-kosongkan">Kosongkan Pilihan</button>
            </div>
          </div>

          <div class="katalog-picker-list" id="list-katalog-picker"></div>
        </div>

        <!-- PANEL 2: DESAIN & PRATINJAU A4 -->
        <div id="panel-katalog-preview" class="stack-sm" style="display: ${stateKat.tab === 'preview' ? 'flex' : 'none'};">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: var(--sp-2); padding: var(--sp-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <div>
              <label class="form-label text-xs fw-semibold" for="inp-kat-judul" style="margin-bottom: 2px;">Judul Katalog</label>
              <input type="text" id="inp-kat-judul" class="input input-sm" value="${escapeHtml(stateKat.opsi.judul)}">
            </div>
            <div>
              <label class="form-label text-xs fw-semibold" for="inp-kat-subjudul" style="margin-bottom: 2px;">Subjudul / Edisi</label>
              <input type="text" id="inp-kat-subjudul" class="input input-sm" value="${escapeHtml(stateKat.opsi.subjudul)}">
            </div>
            <div>
              <label class="form-label text-xs fw-semibold" for="sel-kat-layout" style="margin-bottom: 2px;">Tata Letak A4</label>
              <select id="sel-kat-layout" class="input input-sm">
                <option value="grid2" selected>Brosur Kartu Detail (2 Kolom)</option>
                <option value="grid3">Brosur Kartu Kompak (3 Kolom)</option>
                <option value="table">Daftar Harga Resmi (Tabel + Foto)</option>
              </select>
            </div>
            <div>
              <label class="form-label text-xs fw-semibold" for="sel-kat-harga" style="margin-bottom: 2px;">Tampilan Harga</label>
              <select id="sel-kat-harga" class="input input-sm">
                <option value="ritel" selected>Harga Ritel / Eceran</option>
                <option value="grosir">Harga Grosir / Proyek</option>
                <option value="keduanya">Harga Ritel + Grosir</option>
                <option value="tanpa_harga">Tanpa Harga (Hubungi Kami)</option>
              </select>
            </div>
            <div>
              <label class="form-label text-xs fw-semibold" for="sel-kat-tema" style="margin-bottom: 2px;">Tema Warna Cetak</label>
              <select id="sel-kat-tema" class="input input-sm">
                ${Object.entries(TEMA_KATALOG).map(([k, v]) => `<option value="${k}" ${stateKat.opsi.tema === k ? 'selected' : ''}>${escapeHtml(v.nama)}</option>`).join('')}
              </select>
            </div>
            <div style="grid-column: 1 / -1;">
              <label class="form-label text-xs fw-semibold" for="inp-kat-catatan" style="margin-bottom: 2px;">Catatan Kaki Katalog</label>
              <input type="text" id="inp-kat-catatan" class="input input-sm" value="${escapeHtml(stateKat.opsi.catatan)}">
            </div>
            <div class="row" style="grid-column: 1 / -1; gap: var(--sp-3); flex-wrap: wrap; padding-top: 2px;">
              <label class="row text-xs" style="gap: 5px; cursor: pointer;">
                <input type="checkbox" id="chk-kat-grup" checked style="width: 14px; height: 14px; accent-color: var(--primary);">
                <span>Kelompokkan per Kategori</span>
              </label>
              <label class="row text-xs" style="gap: 5px; cursor: pointer;">
                <input type="checkbox" id="chk-kat-foto" checked style="width: 14px; height: 14px; accent-color: var(--primary);">
                <span>Tampilkan Foto</span>
              </label>
              <label class="row text-xs" style="gap: 5px; cursor: pointer;">
                <input type="checkbox" id="chk-kat-varian" checked style="width: 14px; height: 14px; accent-color: var(--primary);">
                <span>Detail Varian &amp; Kemasan</span>
              </label>
              <label class="row text-xs" style="gap: 5px; cursor: pointer;">
                <input type="checkbox" id="chk-kat-stok" checked style="width: 14px; height: 14px; accent-color: var(--primary);">
                <span>Badge Ready Stok</span>
              </label>
              <label class="row text-xs" style="gap: 5px; cursor: pointer;">
                <input type="checkbox" id="chk-kat-sku" checked style="width: 14px; height: 14px; accent-color: var(--primary);">
                <span>Kode SKU</span>
              </label>
            </div>
          </div>

          <div class="katalog-a4-stage" id="stage-katalog-a4">
            <iframe id="iframe-katalog-a4" title="Pratinjau Katalog Produk PDF A4"></iframe>
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; gap: var(--sp-2); flex-wrap: wrap;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-tutup-katalog-pdf">Tutup</button>
        <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-wa-katalog-pdf" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.messageCircle}
            <span>Bagikan Teks WA</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-cetak-katalog-pdf" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.download}
            <span>Simpan PDF / Cetak A4 (<span id="cnt-btn-cetak-kat">${stateKat.terpilihIds.size}</span>)</span>
          </button>
        </div>
      </div>
    `
  });

  const elCntTab = modal.el.querySelector('#cnt-tab-pilih');
  const elCntBtn = modal.el.querySelector('#cnt-btn-cetak-kat');
  const panelPilih = modal.el.querySelector('#panel-katalog-pilih');
  const panelPreview = modal.el.querySelector('#panel-katalog-preview');
  const listPicker = modal.el.querySelector('#list-katalog-picker');
  const lblStatus = modal.el.querySelector('#lbl-status-muat-kat');
  const selPreset = modal.el.querySelector('#sel-katalog-preset');
  const btnHapusPreset = modal.el.querySelector('#btn-hapus-preset-kat');
  const iframeA4 = modal.el.querySelector('#iframe-katalog-a4');

  const ambilDaftarTerpilih = () => stateKat.semuaProduk.filter((p) => stateKat.terpilihIds.has(p.id));

  const perbaruiCounter = () => {
    const n = stateKat.terpilihIds.size;
    if (elCntTab) elCntTab.textContent = String(n);
    if (elCntBtn) elCntBtn.textContent = String(n);
    const btnCetak = modal.el.querySelector('#btn-cetak-katalog-pdf');
    if (btnCetak) btnCetak.disabled = n === 0;
  };

  const renderPresetDropdown = (selectedId = '') => {
    if (!selPreset) return;
    const presets = ambilPresetKatalog();
    selPreset.innerHTML = `<option value="">-- Preset Katalog (${presets.length}) --</option>` +
      presets.map((pr) => `<option value="${escapeHtml(pr.id)}" ${pr.id === selectedId ? 'selected' : ''}>${escapeHtml(pr.nama)} (${pr.productIds.length} produk)</option>`).join('');
    if (btnHapusPreset) btnHapusPreset.style.display = selectedId ? 'inline-flex' : 'none';
  };

  const ambilProdukTersaring = () => {
    const q = stateKat.filterQ.trim().toLowerCase();
    return stateKat.semuaProduk.filter((p) => {
      if (stateKat.filterKat && p.kategori_id !== stateKat.filterKat) return false;
      if (stateKat.hanyaReady) {
        const ready = Number(p.stok || 0) > 0 || (p.punya_varian && Array.isArray(p.varian) && p.varian.some((v) => !v.deleted && Number(v.stok || 0) > 0));
        if (!ready) return false;
      }
      if (q) {
        const teks = `${p.nama || ''} ${p.sku || ''} ${p.barcode || ''} ${petaKategori.get(p.kategori_id) || ''}`.toLowerCase();
        if (!teks.includes(q)) return false;
      }
      return true;
    });
  };

  const renderPickerList = () => {
    if (!listPicker) return;
    const list = ambilProdukTersaring();
    if (lblStatus) {
      lblStatus.textContent = `Menampilkan ${list.length} dari ${stateKat.semuaProduk.length} produk aktif • ${stateKat.terpilihIds.size} ditandai untuk katalog.`;
    }
    if (!list.length) {
      listPicker.innerHTML = `<div class="text-sm text-muted" style="padding: var(--sp-4); text-align: center;">Tidak ada produk yang cocok dengan filter.</div>`;
      return;
    }
    listPicker.innerHTML = list.map((p) => {
      const checked = stateKat.terpilihIds.has(p.id);
      const namaKat = petaKategori.get(p.kategori_id) || p.kategori_nama || 'Umum';
      const foto = normalisasiUrlFotoKatalog(p.foto_url);
      const jmlVar = p.punya_varian && Array.isArray(p.varian) ? p.varian.filter((v) => !v.deleted).length : 0;
      return `
        <label class="katalog-picker-item ${checked ? 'is-selected' : ''}" data-kp-id="${escapeHtml(p.id)}">
          <input type="checkbox" class="chk-kp-item" value="${escapeHtml(p.id)}" ${checked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--primary); flex-shrink: 0;">
          <div class="katalog-picker-thumb">
            ${foto ? `<img src="${escapeHtml(foto)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ICONS.box}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="text-sm fw-semibold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.nama || 'Produk')}</div>
            <div class="text-xs text-muted">${escapeHtml(namaKat)}${p.sku ? ` • ${escapeHtml(p.sku)}` : ''}${jmlVar > 0 ? ` • ${jmlVar} varian` : ''}</div>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div class="text-sm fw-bold text-primary mono">${formatRupiah(p.harga_ritel || 0)}</div>
            <div class="text-xs text-muted">/${escapeHtml(p.satuan_dasar || 'PCS')}</div>
          </div>
        </label>
      `;
    }).join('');

    listPicker.querySelectorAll('.chk-kp-item').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.value;
        const row = cb.closest('.katalog-picker-item');
        if (cb.checked) {
          stateKat.terpilihIds.add(id);
          row?.classList.add('is-selected');
        } else {
          stateKat.terpilihIds.delete(id);
          row?.classList.remove('is-selected');
        }
        perbaruiCounter();
        if (lblStatus) {
          lblStatus.textContent = `Menampilkan ${list.length} dari ${stateKat.semuaProduk.length} produk aktif • ${stateKat.terpilihIds.size} ditandai untuk katalog.`;
        }
      });
    });
  };

  const bacaOpsiForm = () => {
    stateKat.opsi.judul = modal.el.querySelector('#inp-kat-judul')?.value || 'KATALOG PRODUK & DAFTAR HARGA';
    stateKat.opsi.subjudul = modal.el.querySelector('#inp-kat-subjudul')?.value || '';
    stateKat.opsi.catatan = modal.el.querySelector('#inp-kat-catatan')?.value || '';
    stateKat.opsi.layout = modal.el.querySelector('#sel-kat-layout')?.value || 'grid2';
    stateKat.opsi.modeHarga = modal.el.querySelector('#sel-kat-harga')?.value || 'ritel';
    stateKat.opsi.tema = modal.el.querySelector('#sel-kat-tema')?.value || 'teal';
    stateKat.opsi.groupByCategory = Boolean(modal.el.querySelector('#chk-kat-grup')?.checked);
    stateKat.opsi.showPhoto = Boolean(modal.el.querySelector('#chk-kat-foto')?.checked);
    stateKat.opsi.showVariants = Boolean(modal.el.querySelector('#chk-kat-varian')?.checked);
    stateKat.opsi.showStock = Boolean(modal.el.querySelector('#chk-kat-stok')?.checked);
    stateKat.opsi.showSku = Boolean(modal.el.querySelector('#chk-kat-sku')?.checked);
  };

  const renderPreviewA4 = () => {
    if (!iframeA4) return;
    bacaOpsiForm();
    const terpilih = ambilDaftarTerpilih();
    const doc = iframeA4.contentWindow.document;
    doc.open();
    if (!terpilih.length) {
      doc.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#6b7280;">Belum ada produk yang ditandai. Silakan pilih minimal 1 produk di tab <strong>1. Pilih Produk</strong>.</body></html>`);
    } else {
      doc.write(buatHtmlKatalogPdf(terpilih, stateKat.opsi, petaKategori));
    }
    doc.close();
  };

  const pindahTab = (tabNama) => {
    stateKat.tab = tabNama;
    modal.el.querySelectorAll('#tabs-katalog-pdf button').forEach((b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-ktab') === tabNama ? 'true' : 'false');
    });
    if (panelPilih) panelPilih.style.display = tabNama === 'pilih' ? 'flex' : 'none';
    if (panelPreview) panelPreview.style.display = tabNama === 'preview' ? 'flex' : 'none';
    if (tabNama === 'preview') renderPreviewA4();
    else renderPickerList();
  };

  // Event tab
  modal.el.querySelectorAll('#tabs-katalog-pdf button').forEach((b) => {
    b.addEventListener('click', () => pindahTab(b.getAttribute('data-ktab')));
  });

  // Event filter picker
  modal.el.querySelector('#inp-kat-cari')?.addEventListener('input', (e) => {
    stateKat.filterQ = e.target.value;
    renderPickerList();
  });
  modal.el.querySelector('#sel-kat-filter')?.addEventListener('change', (e) => {
    stateKat.filterKat = e.target.value;
    renderPickerList();
  });
  modal.el.querySelector('#chk-kat-ready')?.addEventListener('change', (e) => {
    stateKat.hanyaReady = Boolean(e.target.checked);
    renderPickerList();
  });
  modal.el.querySelector('#btn-kat-pilih-tampil')?.addEventListener('click', () => {
    ambilProdukTersaring().forEach((p) => stateKat.terpilihIds.add(p.id));
    perbaruiCounter();
    renderPickerList();
  });
  modal.el.querySelector('#btn-kat-kosongkan')?.addEventListener('click', () => {
    stateKat.terpilihIds.clear();
    perbaruiCounter();
    renderPickerList();
  });

  // Live update preview saat konfigurasi diubah
  ['#inp-kat-judul', '#inp-kat-subjudul', '#inp-kat-catatan', '#sel-kat-layout', '#sel-kat-harga', '#sel-kat-tema', '#chk-kat-grup', '#chk-kat-foto', '#chk-kat-varian', '#chk-kat-stok', '#chk-kat-sku'].forEach((sel) => {
    const el = modal.el.querySelector(sel);
    if (!el) return;
    el.addEventListener(el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change', () => {
      if (stateKat.tab === 'preview') renderPreviewA4();
    });
  });

  // Event Preset Katalog
  renderPresetDropdown();
  selPreset?.addEventListener('change', () => {
    const pid = selPreset.value;
    if (btnHapusPreset) btnHapusPreset.style.display = pid ? 'inline-flex' : 'none';
    if (!pid) return;
    const found = ambilPresetKatalog().find((x) => x.id === pid);
    if (!found) return;
    const validIds = new Set(stateKat.semuaProduk.map((p) => p.id));
    stateKat.terpilihIds = new Set((found.productIds || []).filter((id) => validIds.has(id)));
    if (found.config) {
      if (found.config.judul && modal.el.querySelector('#inp-kat-judul')) modal.el.querySelector('#inp-kat-judul').value = found.config.judul;
      if (found.config.layout && modal.el.querySelector('#sel-kat-layout')) modal.el.querySelector('#sel-kat-layout').value = found.config.layout;
      if (found.config.modeHarga && modal.el.querySelector('#sel-kat-harga')) modal.el.querySelector('#sel-kat-harga').value = found.config.modeHarga;
      if (found.config.tema && modal.el.querySelector('#sel-kat-tema')) modal.el.querySelector('#sel-kat-tema').value = found.config.tema;
    }
    perbaruiCounter();
    if (stateKat.tab === 'preview') renderPreviewA4();
    else renderPickerList();
    showToast(`Preset "${found.nama}" dimuat (${stateKat.terpilihIds.size} produk dengan harga terbaru).`, 'success');
  });

  modal.el.querySelector('#btn-simpan-preset-kat')?.addEventListener('click', () => {
    if (!stateKat.terpilihIds.size) {
      showToast('Pilih minimal 1 produk terlebih dahulu sebelum menyimpan preset.', 'warning');
      return;
    }
    bacaOpsiForm();
    const mSave = showModal({
      title: 'Simpan Preset Katalog',
      size: 'sm',
      body: `
        <div class="stack-sm">
          <div class="text-xs text-muted">Simpan <strong>${stateKat.terpilihIds.size} produk</strong> terpilih agar minggu depan tinggal 1 klik cetak ulang dengan harga otomatis terbaru:</div>
          <div class="field">
            <label class="field-label" for="inp-nama-preset-kat">Nama Preset Katalog</label>
            <input type="text" id="inp-nama-preset-kat" class="input" placeholder="Cth: Katalog Besi & Hollow" value="${escapeHtml(stateKat.opsi.judul === 'KATALOG PRODUK & DAFTAR HARGA' ? '' : stateKat.opsi.judul)}">
          </div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-outline btn-sm btn-cancel">Batal</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-ok-simpan-preset">Simpan Preset</button>
      `
    });
    mSave.el.querySelector('#btn-ok-simpan-preset')?.addEventListener('click', () => {
      const nama = (mSave.el.querySelector('#inp-nama-preset-kat')?.value || '').trim();
      if (!nama) {
        showToast('Masukkan nama preset terlebih dahulu.', 'warning');
        return;
      }
      const saved = simpanPresetKatalog({
        nama,
        productIds: Array.from(stateKat.terpilihIds),
        config: {
          judul: stateKat.opsi.judul,
          layout: stateKat.opsi.layout,
          modeHarga: stateKat.opsi.modeHarga,
          tema: stateKat.opsi.tema
        }
      });
      renderPresetDropdown(saved.id);
      mSave.close();
      showToast(`Preset "${saved.nama}" tersimpan!`, 'success');
    });
  });

  btnHapusPreset?.addEventListener('click', async () => {
    const pid = selPreset?.value;
    if (!pid) return;
    const found = ambilPresetKatalog().find((x) => x.id === pid);
    const ok = await showConfirm({
      title: 'Hapus Preset Katalog?',
      message: `Preset "${found?.nama || ''}" akan dihapus dari perangkat ini.`,
      confirmText: 'Ya, Hapus',
      danger: true
    });
    if (!ok) return;
    hapusPresetKatalog(pid);
    renderPresetDropdown('');
    showToast('Preset katalog dihapus.', 'info');
  });

  // Tombol cetak / simpan PDF & bagikan WA
  modal.el.querySelector('#btn-cetak-katalog-pdf')?.addEventListener('click', () => {
    const terpilih = ambilDaftarTerpilih();
    if (!terpilih.length) {
      showToast('Pilih minimal 1 produk untuk dicetak ke PDF.', 'warning');
      return;
    }
    bacaOpsiForm();
    const htmlDoc = buatHtmlKatalogPdf(terpilih, stateKat.opsi, petaKategori);
    showToast('Menyiapkan dokumen Katalog PDF A4... Pilih "Save as PDF" di dialog cetak.', 'info', 3500);
    cetakHtmlKatalogA4(htmlDoc);
  });

  modal.el.querySelector('#btn-wa-katalog-pdf')?.addEventListener('click', () => {
    const terpilih = ambilDaftarTerpilih();
    if (!terpilih.length) {
      showToast('Pilih minimal 1 produk terlebih dahulu.', 'warning');
      return;
    }
    bacaOpsiForm();
    const lines = [
      `*${stateKat.opsi.judul.toUpperCase()}*`,
      `*${(toko.nama || 'TOKO').toUpperCase()}*${stateKat.opsi.subjudul ? ` (${stateKat.opsi.subjudul})` : ''}`,
      '--------------------------------',
      ...terpilih.map((p, i) => {
        const h = formatBlokHargaKatalog(p, stateKat.opsi.modeHarga);
        return `${i + 1}. ${p.nama} — *${h.utama}*${h.sekunder ? ` (${h.sekunder})` : ''}`;
      }),
      '--------------------------------',
      stateKat.opsi.catatan
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
  });

  modal.el.querySelector('#btn-tutup-katalog-pdf')?.addEventListener('click', () => modal.close());

  perbaruiCounter();
  if (stateKat.tab === 'preview') renderPreviewA4();
  else renderPickerList();

  // Muat seluruh produk aktif di latar belakang agar kasir bisa menambah/mengubah pilihan lintas halaman
  try {
    const res = await apiCall('produk.list', { status: 'aktif', page: 1, per_page: 500 });
    const semua = res.items || [];
    const petaId = new Map();
    semua.forEach((p) => petaId.set(p.id, p));
    // Pastikan produk terpilih awal (jika nonaktif sekalipun) tetap terjaga
    awalTerpilih.forEach((p) => {
      if (!petaId.has(p.id)) petaId.set(p.id, p);
    });
    stateKat.semuaProduk = Array.from(petaId.values());
    stateKat.loadedAll = true;
    perbaruiCounter();
    if (stateKat.tab === 'pilih') renderPickerList();
    else renderPreviewA4();
  } catch (err) {
    if (lblStatus) lblStatus.textContent = `Menampilkan ${stateKat.semuaProduk.length} produk lokal.`;
  }
}

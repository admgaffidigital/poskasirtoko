/**
 * evaluasi-pdf.js — Generator Laporan Evaluasi & Tutup Buku Bulanan (PDF A4 & Excel Multi-Sheet)
 * Khusus Owner & Admin untuk arsip evaluasi kinerja bulanan Toko Bangunan.
 */

import { formatRupiah, formatQty, formatTanggal, escapeHtml } from './format.js';
import { cetakHtmlPintar, unduhFilePintar } from './native.js';

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatLabelBulan(ymStr) {
  const parts = String(ymStr || '').split('-');
  const y = parts[0] || '';
  const m = parseInt(parts[1], 10);
  if (m >= 1 && m <= 12) return `${NAMA_BULAN_ID[m - 1]} ${y}`;
  return ymStr || '-';
}

function formatDeltaPersen(val) {
  const n = Number(val || 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

/** Susun dokumen HTML A4 siap cetak / Save as PDF untuk Laporan Evaluasi Bulanan */
export function buatHtmlEvaluasiBulananA4(data) {
  const toko = data?.toko || { nama: 'TOKO BANGUNAN', alamat: '', hp: '' };
  const r = data?.ringkasan || {};
  const mom = data?.perbandingan_mom || {};
  const lalu = mom.ringkasan_lalu || {};
  const labelBulan = formatLabelBulan(data?.periode);
  const labelLalu = formatLabelBulan(mom.periode_lalu);
  const statusLabel = data?.status_buku === 'terkunci'
    ? 'ARSIP RESMI — PERIODE TERKUNCI'
    : 'PRATINJAU EVALUASI BULANAN (PERIODE TERBUKA)';

  const topProduk = Array.isArray(data?.top_produk_terlaris) ? data.top_produk_terlaris : [];
  const slowMoving = Array.isArray(data?.slow_moving) ? data.slow_moving.slice(0, 15) : [];
  const kategoriList = Array.isArray(data?.analisis_kategori) ? data.analisis_kategori.slice(0, 10) : [];
  const biayaList = Array.isArray(data?.analisis_biaya) ? data.analisis_biaya : [];

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan Evaluasi Bulanan ${escapeHtml(labelBulan)} - ${escapeHtml(toko.nama)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.45; margin: 0; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 12px; }
  .hdr h1 { margin: 0; font-size: 16px; color: #0f766e; text-transform: uppercase; letter-spacing: 0.4px; }
  .hdr .sub { font-size: 10px; color: #4b5563; margin-top: 2px; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 9.5px; font-weight: 700; border: 1px solid #0f766e; color: #0f766e; background: #f0fdfa; }
  .sec-title { font-size: 12px; font-weight: 700; color: #0f766e; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; letter-spacing: 0.3px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
  .kpi { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; background: #f9fafb; }
  .kpi-lbl { font-size: 9.5px; color: #6b7280; text-transform: uppercase; }
  .kpi-val { font-size: 13px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .kpi-sub { font-size: 9px; color: #4b5563; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
  th, td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; color: #1e293b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { color: #047857; font-weight: 700; }
  .neg { color: #b91c1c; font-weight: 700; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ttd { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; page-break-inside: avoid; }
  .ttd-box { text-align: center; }
  .ttd-space { height: 52px; }
  .ttd-line { border-top: 1px solid #374151; width: 170px; margin: 0 auto; padding-top: 4px; font-weight: 600; }
  .foot { margin-top: 14px; font-size: 9px; color: #6b7280; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
</style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>${escapeHtml(toko.nama)}</h1>
      ${toko.alamat ? `<div class="sub">${escapeHtml(toko.alamat)}</div>` : ''}
      ${toko.hp ? `<div class="sub">Telp/WA: ${escapeHtml(toko.hp)}</div>` : ''}
    </div>
    <div style="text-align: right;">
      <div style="font-size: 13px; font-weight: 700;">LAPORAN EVALUASI &amp; TUTUP BUKU BULANAN</div>
      <div class="sub">Periode: <strong>${escapeHtml(labelBulan)}</strong> (${escapeHtml(data?.rentang?.dari || '')} s/d ${escapeHtml(data?.rentang?.sampai || '')})</div>
      <div style="margin-top: 4px;"><span class="badge">${escapeHtml(statusLabel)}</span></div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-lbl">Omset Bersih</div>
      <div class="kpi-val">${formatRupiah(r.omset_bersih || 0)}</div>
      <div class="kpi-sub">MoM: <span class="${Number(mom.omset_persen) >= 0 ? 'pos' : 'neg'}">${formatDeltaPersen(mom.omset_persen)}</span> vs ${escapeHtml(labelLalu)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Laba Kotor (Margin)</div>
      <div class="kpi-val">${formatRupiah(r.laba_kotor || 0)}</div>
      <div class="kpi-sub">Margin: <strong>${Number(r.margin_persen || 0).toFixed(1)}%</strong></div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Biaya Operasional</div>
      <div class="kpi-val">${formatRupiah(r.total_biaya || 0)}</div>
      <div class="kpi-sub">MoM: ${formatDeltaPersen(mom.biaya_persen)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Laba Bersih Riil</div>
      <div class="kpi-val ${Number(r.laba_bersih || 0) >= 0 ? 'pos' : 'neg'}">${formatRupiah(r.laba_bersih || 0)}</div>
      <div class="kpi-sub">MoM: <span class="${Number(mom.laba_bersih_persen) >= 0 ? 'pos' : 'neg'}">${formatDeltaPersen(mom.laba_bersih_persen)}</span></div>
    </div>
  </div>

  <div class="sec-title">1. Ringkasan Keuangan &amp; Perbandingan Bulan Lalu (${escapeHtml(labelLalu)})</div>
  <table>
    <thead>
      <tr>
        <th>Indikator Keuangan</th>
        <th class="num">${escapeHtml(labelBulan)}</th>
        <th class="num">${escapeHtml(labelLalu)}</th>
        <th class="num">Perubahan (MoM)</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>Total Transaksi Final</td><td class="num">${r.total_transaksi || 0} Nota</td><td class="num">${lalu.total_transaksi || 0} Nota</td><td class="num">${formatDeltaPersen(mom.transaksi_persen)}</td></tr>
      <tr><td>Omset Penjualan Bersih</td><td class="num">${formatRupiah(r.omset_bersih || 0)}</td><td class="num">${formatRupiah(lalu.omset_bersih || 0)}</td><td class="num">${formatDeltaPersen(mom.omset_persen)}</td></tr>
      <tr><td>Total HPP (Modal Barang)</td><td class="num">${formatRupiah(r.total_hpp || 0)}</td><td class="num">-</td><td class="num">-</td></tr>
      <tr><td>Laba Kotor Bersih</td><td class="num">${formatRupiah(r.laba_kotor || 0)}</td><td class="num">${formatRupiah(lalu.laba_kotor || 0)}</td><td class="num">${formatDeltaPersen(mom.laba_kotor_persen)}</td></tr>
      <tr><td>Total Biaya Operasional</td><td class="num">${formatRupiah(r.total_biaya || 0)}</td><td class="num">${formatRupiah(lalu.total_biaya || 0)}</td><td class="num">${formatDeltaPersen(mom.biaya_persen)}</td></tr>
      <tr><td><strong>Laba Bersih Riil</strong></td><td class="num"><strong>${formatRupiah(r.laba_bersih || 0)}</strong></td><td class="num"><strong>${formatRupiah(lalu.laba_bersih || 0)}</strong></td><td class="num"><strong>${formatDeltaPersen(mom.laba_bersih_persen)}</strong></td></tr>
      <tr><td>Arus Kas Bersih (Masuk - Keluar)</td><td class="num">${formatRupiah(r.arus_kas_bersih || 0)}</td><td class="num">${formatRupiah(lalu.arus_kas_bersih || 0)}</td><td class="num">-</td></tr>
      <tr><td>Total Pembelian Stok Masuk</td><td class="num">${formatRupiah(r.total_pembelian || 0)}</td><td class="num">-</td><td class="num">-</td></tr>
      <tr><td>Posisi Piutang / Hutang Akhir Bulan</td><td class="num">Piutang: ${formatRupiah(r.saldo_piutang || 0)}</td><td class="num">Hutang: ${formatRupiah(r.saldo_hutang || 0)}</td><td class="num">Stok: ${formatRupiah(r.valuasi_stok || 0)}</td></tr>
      <tr><td>Rekap Shift Kasir (${r.total_shift || 0} Shift)</td><td class="num" colspan="2">Akumulasi Selisih Laci Shift</td><td class="num ${Number(r.selisih_shift || 0) < 0 ? 'neg' : 'pos'}">${formatRupiah(r.selisih_shift || 0)}</td></tr>
    </tbody>
  </table>

  <div class="sec-title">2. Top 10 Produk Terlaris Bulan ${escapeHtml(labelBulan)}</div>
  <table>
    <thead>
      <tr>
        <th style="width: 28px;">#</th>
        <th>Nama Produk</th>
        <th class="num">Qty Terjual</th>
        <th class="num">Total Omset</th>
        <th class="num">Estimasi Laba</th>
      </tr>
    </thead>
    <tbody>
      ${topProduk.length ? topProduk.map((p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(p.nama)}</td>
          <td class="num">${formatQty(p.qty)}</td>
          <td class="num">${formatRupiah(p.omset)}</td>
          <td class="num">${formatRupiah(p.laba)}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">Belum ada penjualan pada bulan ini.</td></tr>'}
    </tbody>
  </table>

  <div class="two-col">
    <div>
      <div class="sec-title">3. Performa Kategori</div>
      <table>
        <thead><tr><th>Kategori</th><th class="num">Omset</th><th class="num">Laba</th></tr></thead>
        <tbody>
          ${kategoriList.length ? kategoriList.map((k) => `
            <tr><td>${escapeHtml(k.nama)}</td><td class="num">${formatRupiah(k.omset)}</td><td class="num">${formatRupiah(k.laba)}</td></tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;color:#6b7280;">Belum ada data kategori.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div>
      <div class="sec-title">4. Rincian Biaya Operasional</div>
      <table>
        <thead><tr><th>Kategori Biaya</th><th class="num">Nominal</th><th class="num">Porsi</th></tr></thead>
        <tbody>
          ${biayaList.length ? biayaList.map((b) => `
            <tr><td>${escapeHtml(b.kategori)}</td><td class="num">${formatRupiah(b.nominal)}</td><td class="num">${b.persen}%</td></tr>
          `).join('') : '<tr><td colspan="3" style="text-align:center;color:#6b7280;">Tidak ada biaya operasional.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="sec-title">5. Evaluasi Barang Slow-Moving / Dead Stock (0 Penjualan Bulan Ini — ${data?.total_slow_moving || 0} Item, Modal Tertahan: ${formatRupiah(data?.nilai_slow_moving || 0)})</div>
  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Nama Produk</th>
        <th class="num">Stok</th>
        <th class="num">HPP</th>
        <th class="num">Nilai Modal Tertahan</th>
      </tr>
    </thead>
    <tbody>
      ${slowMoving.length ? slowMoving.map((d) => `
        <tr>
          <td>${escapeHtml(d.sku)}</td>
          <td>${escapeHtml(d.nama)}</td>
          <td class="num">${formatQty(d.stok)} ${escapeHtml(d.satuan)}</td>
          <td class="num">${formatRupiah(d.hpp)}</td>
          <td class="num">${formatRupiah(d.nilai_modal)}</td>
        </tr>
      `).join('') : '<tr><td colspan="5" style="text-align:center;color:#047857;">Seluruh produk berstok aktif bergerak terjual pada bulan ini!</td></tr>'}
    </tbody>
  </table>

  ${data?.arsip?.catatan ? `<div style="margin-top:10px;padding:6px 8px;border:1px dashed #9ca3af;border-radius:4px;"><strong>Catatan Tutup Buku:</strong> ${escapeHtml(data.arsip.catatan)}</div>` : ''}

  <div class="ttd">
    <div class="ttd-box">
      <div>Disiapkan Oleh</div>
      <div class="ttd-space"></div>
      <div class="ttd-line">${escapeHtml(data?.arsip?.ditutup_oleh_nama || 'Admin / Kasir')}</div>
    </div>
    <div class="ttd-box">
      <div>Disetujui Oleh (Owner)</div>
      <div class="ttd-space"></div>
      <div class="ttd-line">Pemilik Toko</div>
    </div>
  </div>

  <div class="foot">Dicetak pada ${escapeHtml(formatTanggal(new Date(), true))} • POS Kasir Toko Bangunan</div>
</body>
</html>`;
}

/** Cetak / Simpan Laporan Evaluasi Bulanan sebagai PDF A4 melalui iframe cetak bersih */
export function cetakLaporanEvaluasiBulananPdf(data) {
  const html = buatHtmlEvaluasiBulananA4(data);
  if (cetakHtmlPintar(html, `Evaluasi Bulanan ${data?.periode || 'POS'}`)) {
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  }, 250);
}

function escapeXmlCell(val) {
  const s = val === null || val === undefined ? '' : String(val);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buatSheetXml(nama, headers, rows) {
  const hdrXml = headers.map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXmlCell(h)}</Data></Cell>`).join('');
  const bodyXml = (rows || []).map((r) => {
    const cells = r.map((v) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${escapeXmlCell(v)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');
  return `<Worksheet ss:Name="${escapeXmlCell(nama.slice(0, 31))}"><Table><Row>${hdrXml}</Row>${bodyXml}</Table></Worksheet>`;
}

/** Ekspor Laporan Evaluasi Bulanan ke Workbook Microsoft Excel Multi-Sheet (.xls) */
export function eksporEvaluasiBulananExcel(data) {
  const r = data?.ringkasan || {};
  const mom = data?.perbandingan_mom || {};
  const lalu = mom.ringkasan_lalu || {};

  const s1 = buatSheetXml('Ringkasan_MoM', ['Indikator', data?.periode || 'Bulan Ini', mom.periode_lalu || 'Bulan Lalu', 'MoM (%)'], [
    ['Total Transaksi', r.total_transaksi || 0, lalu.total_transaksi || 0, mom.transaksi_persen || 0],
    ['Omset Kotor', r.omset_kotor || 0, 0, 0],
    ['Total Diskon', r.total_diskon || 0, 0, 0],
    ['Omset Bersih', r.omset_bersih || 0, lalu.omset_bersih || 0, mom.omset_persen || 0],
    ['Total HPP', r.total_hpp || 0, 0, 0],
    ['Laba Kotor', r.laba_kotor || 0, lalu.laba_kotor || 0, mom.laba_kotor_persen || 0],
    ['Margin Kotor (%)', r.margin_persen || 0, 0, 0],
    ['Biaya Operasional', r.total_biaya || 0, lalu.total_biaya || 0, mom.biaya_persen || 0],
    ['Laba Bersih Riil', r.laba_bersih || 0, lalu.laba_bersih || 0, mom.laba_bersih_persen || 0],
    ['Arus Kas Bersih', r.arus_kas_bersih || 0, lalu.arus_kas_bersih || 0, 0],
    ['Total Pembelian', r.total_pembelian || 0, 0, 0],
    ['Saldo Piutang Akhir', r.saldo_piutang || 0, 0, 0],
    ['Saldo Hutang Akhir', r.saldo_hutang || 0, 0, 0],
    ['Valuasi Stok Akhir', r.valuasi_stok || 0, 0, 0],
    ['Selisih Laci Shift', r.selisih_shift || 0, 0, 0]
  ]);

  const s2 = buatSheetXml('Top_Produk', ['Nama Produk', 'Qty Terjual', 'Omset', 'HPP', 'Laba'],
    (data?.top_produk_terlaris || []).map((p) => [p.nama, Number(p.qty || 0), Number(p.omset || 0), Number(p.hpp || 0), Number(p.laba || 0)]));

  const s3 = buatSheetXml('Slow_Moving', ['SKU', 'Nama Produk', 'Satuan', 'Stok', 'HPP', 'Nilai Modal Tertahan'],
    (data?.slow_moving || []).map((d) => [d.sku, d.nama, d.satuan, Number(d.stok || 0), Number(d.hpp || 0), Number(d.nilai_modal || 0)]));

  const s4 = buatSheetXml('Biaya_Operasional', ['Kategori', 'Nominal', 'Porsi (%)'],
    (data?.analisis_biaya || []).map((b) => [b.kategori, Number(b.nominal || 0), Number(b.persen || 0)]));

  const s5 = buatSheetXml('Tutup_Harian', ['Tanggal', 'Transaksi', 'Omset Bersih', 'Laba Bersih', 'Selisih Shift', 'Setoran Owner', 'Sisa Modal Besok'],
    (data?.riwayat_harian || []).map((h) => [h.periode, Number(h.total_transaksi || 0), Number(h.omset_bersih || 0), Number(h.laba_bersih || 0), Number(h.selisih_shift || 0), Number(h.setoran_owner || 0), Number(h.sisa_modal_besok || 0)]));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="hdr"><Font ss:Bold="1"/></Style></Styles>
 ${s1}${s2}${s3}${s4}${s5}
</Workbook>`;

  unduhFilePintar(`evaluasi-bulanan-${data?.periode || 'pos'}.xls`, '\uFEFF' + xml, 'application/vnd.ms-excel;charset=utf-8');
}

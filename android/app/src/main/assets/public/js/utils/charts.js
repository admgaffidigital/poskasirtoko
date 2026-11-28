/**
 * charts.js — Pustaka Visualisasi Pure SVG Ringan (Zero Dependency, 0ms Offline)
 * ==============================================================================
 * Menyediakan komponen visual Solid Flat yang otomatis mengikuti Tema (Terang/Hangat/Gelap)
 * dan Warna Aksen aplikasi:
 * - renderDonutChart()     : Diagram Lingkar / Donat SVG + angka tengah + legenda %
 * - renderHorizontalBars() : Grafik Batang Horizontal berperingkat (Top Produk/Kasir/Supplier/Kategori)
 * - renderComparisonBars() : Perbandingan 2 Metrik (Kas Masuk vs Kas Keluar + rasio surplus/defisit)
 * - renderWaterfallPnl()   : Grafik Alur Bertingkat Laba Rugi (Omset -> HPP -> Laba Kotor -> Biaya -> Laba Bersih)
 * - renderInsightBox()     : Kartu Analisa Cerdas Otomatis dalam bahasa sederhana untuk Owner
 */

import { escapeHtml, formatRupiah, formatAngka } from './format.js';
import { ICONS } from './ui.js';

export const CHART_PALETTE = [
  'var(--primary)',
  'var(--success)',
  'var(--info)',
  'var(--warning)',
  'var(--danger)',
  'var(--slate-500)'
];

export function singkatNominalChart(n) {
  const abs = Math.abs(Number(n || 0));
  const tanda = Number(n || 0) < 0 ? '-' : '';
  if (abs >= 1000000000) return `${tanda}${(abs / 1000000000).toFixed(1)}M`;
  if (abs >= 1000000) return `${tanda}${(abs / 1000000).toFixed(1)}jt`;
  if (abs >= 1000) return `${tanda}${Math.round(abs / 1000)}rb`;
  return `${tanda}${Math.round(abs)}`;
}

/**
 * Render Diagram Lingkar / Donat Pure SVG + Legenda Responsif
 * @param {Object} opts
 * @param {Array<{label: string, value: number, color?: string, sub?: string}>} opts.items
 * @param {string} [opts.centerLabel='Total']
 * @param {string} [opts.centerValue='']
 * @param {number} [opts.size=152]
 * @param {number} [opts.thickness=24]
 * @param {string} [opts.emptyText='Belum ada data pada periode ini']
 * @param {Function} [opts.valueFormatter=formatRupiah]
 */
export function renderDonutChart({
  items = [],
  centerLabel = 'Total',
  centerValue = '',
  size = 152,
  thickness = 24,
  emptyText = 'Belum ada data pada periode ini',
  valueFormatter = formatRupiah
} = {}) {
  const validItems = (items || [])
    .map((it, idx) => ({
      label: String(it.label || '-'),
      value: Math.max(0, Number(it.value || 0)),
      color: it.color || CHART_PALETTE[idx % CHART_PALETTE.length],
      sub: it.sub ? String(it.sub) : ''
    }))
    .filter((it) => it.value > 0);

  const total = validItems.reduce((acc, it) => acc + it.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - thickness) / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    return `
      <div class="chart-donut-empty">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="chart-donut-svg" aria-hidden="true">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${thickness}" />
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" fill="var(--text-muted)">0%</text>
        </svg>
        <div class="text-xs text-muted">${escapeHtml(emptyText)}</div>
      </div>
    `;
  }

  const gap = validItems.length > 1 ? Math.min(3, circumference * 0.012) : 0;
  let offsetAccum = 0;

  const slicesHtml = validItems.map((it) => {
    const frac = it.value / total;
    const rawLen = frac * circumference;
    const dashLen = Math.max(2, rawLen - gap);
    const dashOffset = -offsetAccum;
    offsetAccum += rawLen;
    const pct = Math.round(frac * 1000) / 10;

    return `
      <circle
        class="chart-donut-slice"
        cx="${cx}"
        cy="${cy}"
        r="${radius}"
        fill="none"
        stroke="${it.color}"
        stroke-width="${thickness}"
        stroke-dasharray="${dashLen.toFixed(2)} ${(circumference - dashLen).toFixed(2)}"
        stroke-dashoffset="${dashOffset.toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})"
      >
        <title>${escapeHtml(it.label)}: ${escapeHtml(valueFormatter(it.value))} (${pct}%)</title>
      </circle>
    `;
  }).join('');

  const displayCenterVal = centerValue || singkatNominalChart(total);

  const legendHtml = validItems.map((it) => {
    const pct = Math.round((it.value / total) * 1000) / 10;
    return `
      <div class="chart-legend-row">
        <div class="chart-legend-left">
          <span class="chart-legend-dot" style="background: ${it.color};"></span>
          <div class="chart-legend-text">
            <span class="chart-legend-name" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</span>
            ${it.sub ? `<span class="chart-legend-sub">${escapeHtml(it.sub)}</span>` : ''}
          </div>
        </div>
        <div class="chart-legend-right">
          <span class="chart-legend-val tabular">${escapeHtml(valueFormatter(it.value))}</span>
          <span class="chart-legend-pct tabular">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="chart-donut-wrap">
      <div class="chart-donut-figure">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="chart-donut-svg" role="img" aria-label="${escapeHtml(centerLabel)}">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--surface-2)" stroke-width="${thickness}" />
          ${slicesHtml}
        </svg>
        <div class="chart-donut-center">
          <span class="chart-donut-center-label">${escapeHtml(centerLabel)}</span>
          <strong class="chart-donut-center-val tabular" title="${escapeHtml(valueFormatter(total))}">${escapeHtml(displayCenterVal)}</strong>
        </div>
      </div>
      <div class="chart-legend-list">
        ${legendHtml}
      </div>
    </div>
  `;
}

/**
 * Render Grafik Batang Horizontal Berperingkat (Top Produk / Kasir / Supplier / Kategori)
 */
export function renderHorizontalBars({
  items = [],
  emptyText = 'Belum ada data untuk ditampilkan',
  valueFormatter = formatRupiah,
  maxItems = 6,
  barColor = 'var(--primary)'
} = {}) {
  const list = (items || [])
    .map((it, idx) => ({
      label: String(it.label || '-'),
      value: Math.max(0, Number(it.value || 0)),
      sub: it.sub ? String(it.sub) : '',
      color: it.color || barColor || CHART_PALETTE[idx % CHART_PALETTE.length]
    }))
    .filter((it) => it.value > 0)
    .slice(0, maxItems);

  if (list.length === 0) {
    return `<div class="text-xs text-muted text-center" style="padding: var(--sp-5);">${escapeHtml(emptyText)}</div>`;
  }

  const maxVal = Math.max(...list.map((it) => it.value), 1);
  const sumVal = list.reduce((a, b) => a + b.value, 0) || 1;

  return `
    <div class="chart-hbar-list">
      ${list.map((it, idx) => {
        const widthPct = Math.max(4, Math.round((it.value / maxVal) * 100));
        const sharePct = Math.round((it.value / sumVal) * 100);
        return `
          <div class="chart-hbar-item">
            <div class="chart-hbar-head">
              <div class="chart-hbar-label-wrap">
                <span class="chart-hbar-rank">${idx + 1}</span>
                <span class="chart-hbar-label" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</span>
                ${it.sub ? `<span class="chart-hbar-sub">${escapeHtml(it.sub)}</span>` : ''}
              </div>
              <div class="chart-hbar-val-wrap tabular">
                <span class="chart-hbar-val">${escapeHtml(valueFormatter(it.value))}</span>
                <span class="chart-hbar-pct">${sharePct}%</span>
              </div>
            </div>
            <div class="chart-hbar-track">
              <div class="chart-hbar-fill" style="width: ${widthPct}%; background: ${it.color};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Render Visual Perbandingan 2 Metrik (mis. Kas Masuk vs Kas Keluar)
 */
export function renderComparisonBars({
  leftLabel = 'Kas Masuk',
  leftValue = 0,
  leftColor = 'var(--success)',
  rightLabel = 'Kas Keluar',
  rightValue = 0,
  rightColor = 'var(--danger)',
  netLabel = 'Selisih Bersih',
  valueFormatter = formatRupiah
} = {}) {
  const lVal = Math.max(0, Number(leftValue || 0));
  const rVal = Math.max(0, Number(rightValue || 0));
  const total = lVal + rVal;
  const net = lVal - rVal;
  const maxVal = Math.max(lVal, rVal, 1);
  const lPct = total > 0 ? Math.round((lVal / total) * 100) : 0;
  const rPct = total > 0 ? 100 - lPct : 0;
  const lBarW = lVal > 0 ? Math.max(6, Math.round((lVal / maxVal) * 100)) : 0;
  const rBarW = rVal > 0 ? Math.max(6, Math.round((rVal / maxVal) * 100)) : 0;

  return `
    <div class="chart-compare-wrap">
      <div class="chart-compare-row">
        <div class="chart-compare-head">
          <span class="chart-compare-label">${escapeHtml(leftLabel)}</span>
          <span class="chart-compare-val tabular" style="color: ${leftColor};">${escapeHtml(valueFormatter(lVal))} <small>(${lPct}%)</small></span>
        </div>
        <div class="chart-compare-track">
          <div class="chart-compare-fill" style="width: ${lBarW}%; background: ${leftColor};"></div>
        </div>
      </div>

      <div class="chart-compare-row">
        <div class="chart-compare-head">
          <span class="chart-compare-label">${escapeHtml(rightLabel)}</span>
          <span class="chart-compare-val tabular" style="color: ${rightColor};">${escapeHtml(valueFormatter(rVal))} <small>(${rPct}%)</small></span>
        </div>
        <div class="chart-compare-track">
          <div class="chart-compare-fill" style="width: ${rBarW}%; background: ${rightColor};"></div>
        </div>
      </div>

      <div class="chart-compare-footer">
        <span class="text-xs text-muted">${escapeHtml(netLabel)}</span>
        <span class="badge ${net >= 0 ? 'badge-success' : 'badge-danger'} tabular">
          ${net >= 0 ? 'Surplus ' : 'Defisit '}${escapeHtml(valueFormatter(Math.abs(net)))}
        </span>
      </div>
    </div>
  `;
}

/**
 * Render Grafik Alur Laba Rugi (Waterfall Sederhana: Omset -> HPP -> Laba Kotor -> Biaya -> Laba Bersih)
 */
export function renderWaterfallPnl({
  omsetBersih = 0,
  hppBersih = 0,
  labaKotor = 0,
  totalBiaya = 0,
  rugiRusak = 0,
  labaBersih = 0,
  valueFormatter = formatRupiah
} = {}) {
  const base = Math.max(Number(omsetBersih || 0), Math.abs(Number(labaBersih || 0)), 1);
  const bebanTotal = Math.max(0, Number(totalBiaya || 0)) + Math.max(0, Number(rugiRusak || 0));

  const steps = [
    { label: 'Omset Bersih', value: Number(omsetBersih || 0), sign: '', color: 'var(--primary)' },
    { label: 'Modal / HPP', value: Number(hppBersih || 0), sign: '− ', color: 'var(--warning)' },
    { label: 'Laba Kotor', value: Number(labaKotor || 0), sign: '= ', color: 'var(--info)' },
    { label: rugiRusak > 0 ? 'Biaya & Rusak' : 'Biaya Operasional', value: bebanTotal, sign: '− ', color: 'var(--danger)' },
    { label: 'Laba Bersih Riil', value: Number(labaBersih || 0), sign: '= ', color: Number(labaBersih || 0) >= 0 ? 'var(--success)' : 'var(--danger)', highlight: true }
  ];

  return `
    <div class="chart-wf-list">
      ${steps.map((st) => {
        const pct = Number(omsetBersih || 0) > 0 ? Math.round((Math.abs(st.value) / Number(omsetBersih)) * 1000) / 10 : 0;
        const barW = st.value !== 0 ? Math.max(4, Math.min(100, Math.round((Math.abs(st.value) / base) * 100))) : 0;
        return `
          <div class="chart-wf-row ${st.highlight ? 'is-highlight' : ''}">
            <div class="chart-wf-head">
              <span class="chart-wf-label">${escapeHtml(st.label)}</span>
              <span class="chart-wf-val tabular" style="color: ${st.color};">
                ${escapeHtml(st.sign)}${escapeHtml(valueFormatter(st.value))}
                <small class="chart-wf-pct">(${pct}%)</small>
              </span>
            </div>
            <div class="chart-wf-track">
              <div class="chart-wf-fill" style="width: ${barW}%; background: ${st.color};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Render Kartu Analisa Cerdas Otomatis (Executive Insight Box)
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.badge='']
 * @param {'success'|'warning'|'danger'|'info'|'primary'} [opts.badgeTone='info']
 * @param {Array<string>} opts.bullets - array teks HTML aman (sudah di-escape di pemanggil)
 */
export function renderInsightBox({
  title = 'Ringkasan Analisa Cerdas',
  badge = '',
  badgeTone = 'primary',
  bullets = []
} = {}) {
  const validBullets = (bullets || []).filter(Boolean);
  if (validBullets.length === 0) return '';

  return `
    <div class="card insight-box insight-tone-${badgeTone}">
      <div class="insight-box-head">
        <div class="insight-box-title-wrap">
          <span class="insight-box-icon">${ICONS.sparkles}</span>
          <span class="insight-box-title">${escapeHtml(title)}</span>
        </div>
        ${badge ? `<span class="badge badge-${badgeTone} badge-sm">${escapeHtml(badge)}</span>` : ''}
      </div>
      <ul class="insight-box-list">
        ${validBullets.map((b) => `<li>${b}</li>`).join('')}
      </ul>
    </div>
  `;
}

export function formatJumlahTransaksi(n, satuan = 'nota') {
  return `${formatAngka(n || 0)} ${satuan}`;
}

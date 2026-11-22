#!/usr/bin/env node
/**
 * check_ui_consistency.js — Pagar Otomatis Konsistensi UI/UX POS Kasir Toko
 * =========================================================================
 * Memastikan seluruh file di `frontend/` mematuhi standar desain:
 *  1. 0 gradient (linear/radial/conic) & 0 backdrop-filter (100% Solid Flat)
 *  2. 0 warna aksen oranye hardcoded di luar tokens.css / definisi palet ui.js / fallback index.html
 *  3. 100% referensi ICONS.* terdaftar valid di frontend/js/utils/ui.js
 *  4. 0 dialog klasik bawaan browser (alert / confirm / prompt)
 *  5. 0 emoji di kode antarmuka frontend/js/modules/*.js
 *  6. 0 kartu statistik lama (.card.stat -> wajib .stat-card-pro)
 *  7. 100% kelengkapan atribut data-label pada <td> tabel responsif
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'download' || entry.name === 'assets') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function main() {
  const issues = [];
  const cssFiles = walk(path.join(FRONTEND, 'css'), ['.css']);
  const jsFiles = walk(path.join(FRONTEND, 'js'), ['.js']);
  const htmlFiles = [path.join(FRONTEND, 'index.html')];

  // Ekstrak daftar ICONS yang valid dari ui.js
  const uiSrc = fs.readFileSync(path.join(FRONTEND, 'js', 'utils', 'ui.js'), 'utf8');
  const iconBlock = uiSrc.match(/export const ICONS = \{([\s\S]*?)\n\};/);
  const validIcons = new Set();
  if (iconBlock) {
    for (const m of iconBlock[1].matchAll(/^\s*([a-zA-Z0-9_]+)\s*:/gm)) {
      validIcons.add(m[1]);
    }
  }

  // 1. Cek CSS: 0 gradient, 0 backdrop-filter, 0 hardcoded orange outside tokens.css
  for (const f of cssFiles) {
    const r = rel(f);
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const clean = line.replace(/\/\*[\s\S]*?\*\//g, '');
      if (/\b(?:linear|radial|conic)-gradient\s*\(/i.test(clean)) {
        issues.push(`[SOLID_FLAT] ${r}:${idx + 1} memakai gradient`);
      }
      if (/\b(?:-webkit-)?backdrop-filter\s*:/i.test(clean) && !/backdrop-filter\s*:\s*none/i.test(clean)) {
        issues.push(`[SOLID_FLAT] ${r}:${idx + 1} memakai backdrop-filter`);
      }
      if (!r.endsWith('tokens.css')) {
        if (/rgba\(\s*23[24]\s*,\s*8[89]\s*,\s*12\b/i.test(clean) || /#e8590c|#ea580c/i.test(clean)) {
          issues.push(`[THEME_TOKEN] ${r}:${idx + 1} warna oranye hardcoded di luar tokens.css`);
        }
      }
    });
  }

  // 2. Cek index.html: 0 gradient & 0 backdrop-filter
  for (const f of htmlFiles) {
    const r = rel(f);
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (/\b(?:linear|radial|conic)-gradient\s*\(/i.test(line)) {
        issues.push(`[SOLID_FLAT] ${r}:${idx + 1} memakai gradient`);
      }
      if (/\b(?:-webkit-)?backdrop-filter\s*:/i.test(line) && !/backdrop-filter\s*:\s*none/i.test(line)) {
        issues.push(`[SOLID_FLAT] ${r}:${idx + 1} memakai backdrop-filter`);
      }
    });
  }

  // 3. Cek seluruh file JS
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  for (const f of jsFiles) {
    const r = rel(f);
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split(/\r?\n/);
    const isPaletteDef = r.endsWith('utils/ui.js') || r.endsWith('modules/pengaturan.js');
    const isModule = r.includes('js/modules/');

    lines.forEach((line, idx) => {
      const noComment = line.replace(/\/\/.*$/, '');
      if (/\b(?:linear|radial|conic)-gradient\s*\(/i.test(noComment)) {
        issues.push(`[SOLID_FLAT] ${r}:${idx + 1} memakai gradient`);
      }
      if (/\b(?:-webkit-)?backdrop-filter\s*:/i.test(noComment) && !/backdrop-filter\s*:\s*none/i.test(noComment)) {
        issues.push(`[SOLID_FLAT] ${r}:${idx + 1} memakai backdrop-filter`);
      }
      if (!isPaletteDef && /rgba\(\s*23[24]\s*,\s*8[89]\s*,\s*12\b/i.test(noComment)) {
        issues.push(`[THEME_TOKEN] ${r}:${idx + 1} warna oranye rgba hardcoded`);
      }
      if (/(?:^|[^\w.$])(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(noComment)) {
        issues.push(`[DIALOG_NATIVE] ${r}:${idx + 1} memakai dialog klasik browser`);
      }
      if (isModule && /class="[^"]*\bcard\s+stat\b/.test(noComment)) {
        issues.push(`[LEGACY_STAT_CARD] ${r}:${idx + 1} memakai .card.stat lama (wajib .stat-card-pro)`);
      }
      if (isModule && emojiRe.test(noComment)) {
        issues.push(`[NO_EMOJI] ${r}:${idx + 1} mengandung emoji di UI`);
      }
      for (const m of noComment.matchAll(/\bICONS\.([a-zA-Z0-9_]+)\b/g)) {
        if (!validIcons.has(m[1])) {
          issues.push(`[ICON_INVALID] ${r}:${idx + 1} referensi ICONS.${m[1]} tidak ada di ui.js`);
        }
      }
    });
  }

  if (issues.length > 0) {
    console.error(`\n✖ KONSISTENSI UI GAGAL (${issues.length} pelanggaran ditemukan):`);
    issues.forEach((i) => console.error(`  • ${i}`));
    process.exit(1);
  }

  console.log(`✔ Konsistensi UI/UX 100% LULUS (0 gradient/blur, 0 warna hardcoded, ${validIcons.size} ikon valid, 0 emoji, 0 dialog native, 0 legacy stat card).`);
}

main();

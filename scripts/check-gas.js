#!/usr/bin/env node
/**
 * check-gas.js — Validasi Syntax Seluruh Modul Backend Google Apps Script (`backend/src/*.gs`)
 * Memeriksa setiap modul secara terpisah dan sebagai satu kesatuan global scope V8
 * tanpa perlu menghasilkan file gabungan `kode.gs`.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_DIR = path.resolve(__dirname, '..', 'backend', 'src');

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`✖ Folder backend/src tidak ditemukan: ${SRC_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.gs'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error('✖ Tidak ada file .gs ditemukan di backend/src/');
    process.exit(1);
  }

  const parts = [];
  let totalLines = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    const lines = content.replace(/\r\n/g, '\n').trimEnd().split('\n').length;
    totalLines += lines;
    // Validasi syntax per modul
    new vm.Script(content, { filename: `backend/src/${file}` });
    parts.push(content);
  }

  // Validasi syntax gabungan global scope (seperti runtime Google Apps Script)
  new vm.Script(parts.join('\n\n'), { filename: 'backend/src/*.gs' });

  console.log(`✔ Semua ${files.length} modul backend/src/*.gs valid tanpa syntax error (${totalLines} baris total).`);
}

main();

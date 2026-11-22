#!/usr/bin/env node
/**
 * build-gas.js — Penggabung Modul Backend Google Apps Script (backend/src/*.gs -> backend/kode.gs)
 * ================================================================================================
 * Memungkinkan pengembangan & perawatan backend secara modular dalam file-file kecil
 * di folder `backend/src/`, lalu menggabungkannya secara otomatis dan deterministik
 * ke `backend/kode.gs` yang siap deploy (copy-paste 1 file atau `clasp push`).
 *
 * Penggunaan:
 *   npm run build:gas           (Gabung backend/src/*.gs -> backend/kode.gs + cek syntax)
 *   npm run check:gas           (Verifikasi backend/kode.gs sinkron 100% dengan backend/src/*.gs)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'backend', 'src');
const OUT_FILE = path.join(ROOT_DIR, 'backend', 'kode.gs');

function buildBundle() {
  if (!fs.existsSync(SRC_DIR)) {
    throw new Error(`Folder sumber tidak ditemukan: ${SRC_DIR}`);
  }

  const files = fs.readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.gs'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`Tidak ada file .gs ditemukan di ${SRC_DIR}`);
  }

  const banner = [
    '/**',
    ' * ==========================================================================',
    ' * PERHATIAN: FILE INI DIGABUNG OTOMATIS DARI `backend/src/*.gs`',
    ' * Jalankan `npm run build:gas` setelah mengubah file di `backend/src/`.',
    ` * Total Modul: ${files.length} file (${files.join(', ')})`,
    ' * ==========================================================================',
    ' */',
    ''
  ].join('\n');

  const parts = [];
  const stats = [];

  for (const file of files) {
    const fullPath = path.join(SRC_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
    const lineCount = content.split('\n').length;
    stats.push({ file, lineCount });
    parts.push(
      `/* >>> [MODUL: backend/src/${file}] (${lineCount} baris) <<< */\n` +
      content
    );
  }

  const output = banner + parts.join('\n\n') + '\n';

  // Verifikasi syntax JavaScript hasil gabungan
  try {
    new vm.Script(output, { filename: 'backend/kode.gs' });
  } catch (err) {
    throw new Error(`Syntax error pada hasil gabungan backend/kode.gs: ${err.message}`);
  }

  return { output, stats };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const { output, stats } = buildBundle();
  const totalLines = output.split('\n').length - 1;

  if (checkOnly) {
    if (!fs.existsSync(OUT_FILE)) {
      console.error('✖ backend/kode.gs belum ada. Jalankan: npm run build:gas');
      process.exit(1);
    }
    const current = fs.readFileSync(OUT_FILE, 'utf8').replace(/\r\n/g, '\n');
    if (current !== output) {
      console.error('✖ backend/kode.gs tidak sinkron dengan backend/src/*.gs! Jalankan: npm run build:gas');
      process.exit(1);
    }
    console.log(`✔ backend/kode.gs sinkron 100% dengan ${stats.length} modul backend/src/*.gs (${totalLines} baris).`);
    return;
  }

  fs.writeFileSync(OUT_FILE, output, 'utf8');
  console.log(`✔ Berhasil membangun backend/kode.gs dari ${stats.length} modul (${totalLines} baris, syntax valid):`);
  for (const s of stats) {
    console.log(`  • backend/src/${s.file} (${s.lineCount} baris)`);
  }
}

main();

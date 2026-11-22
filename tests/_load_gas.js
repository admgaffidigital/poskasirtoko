/**
 * _load_gas.js — Helper pembaca seluruh modul backend GAS (`backend/src/*.gs`) untuk pengujian otomatis.
 */
const fs = require('fs');
const path = require('path');

function loadBackendGas() {
  const srcDir = path.join(__dirname, '..', 'backend', 'src');
  const files = fs.readdirSync(srcDir)
    .filter((f) => f.endsWith('.gs'))
    .sort((a, b) => a.localeCompare(b));
  return files
    .map((f) => fs.readFileSync(path.join(srcDir, f), 'utf8'))
    .join('\n\n');
}

module.exports = loadBackendGas;

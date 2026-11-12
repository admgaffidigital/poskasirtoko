const fs = require('fs');
const path = require('path');

// Common utility exports to check
const utilExports = {
  '../utils/format.js': ['escapeHtml', 'formatRupiah', 'formatTanggal', 'formatWaktuRelatif', 'formatQty', 'formatAngka', 'parseNumber', 'formatPersen', 'potongTeks', 'formatHpIndonesia'],
  '../utils/ui.js': ['ICONS', 'showToast', 'showConfirm', 'showModal', 'closeModal', 'showLoading', 'closeLoading', 'showPrompt'],
  '../utils/dom.js': ['$', '$$', 'on', 'renderSkeleton', 'renderEmpty', 'renderError'],
  '../utils/barcode.js': ['generateBarcodeSvg', 'validateBarcode'],
  '../api.js': ['apiCall', 'checkHealth'],
  '../state.js': ['store']
};

const allUtilNames = Object.values(utilExports).flat();

function checkFile(fullPath) {
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Find all identifiers imported
  const imported = new Set();
  const importRegex = /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from/g;
  let m;
  while ((m = importRegex.exec(content)) !== null) {
    if (m[1]) {
      m[1].split(',').forEach(s => {
        const name = s.trim().split(/\s+as\s+/)[0];
        if (name) imported.add(name);
      });
    }
    if (m[2]) imported.add(m[2]);
    if (m[3]) imported.add(m[3]);
  }

  // Check if any util function is called/used without being imported or declared locally
  allUtilNames.forEach(fn => {
    const usageRegex = new RegExp('\\b' + fn + '\\s*(?:\\(|[),.;}\\s])', 'g');
    if (usageRegex.test(content)) {
      // Is it declared locally?
      const localDecl = new RegExp('(?:function|const|let|var|class)\\s+' + fn + '\\b');
      if (!imported.has(fn) && !localDecl.test(content)) {
        console.error(`❌ Undefined identifier in ${fullPath}: "${fn}" is used but NOT imported or declared!`);
      }
    }
  });
}

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (!p.includes('utils')) walk(p);
    } else if (p.endsWith('.js') && !p.includes('config.example.js')) {
      checkFile(p);
    }
  }
}

walk('frontend/js/modules');
console.log('Done scanning frontend/js/modules!');


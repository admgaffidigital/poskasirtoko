const fs = require('fs');
const path = require('path');

function checkFile(full) {
  const code = fs.readFileSync(full, 'utf8');
  // Check imports
  const importRegex = /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[4];
    const targetPath = path.resolve(path.dirname(full), importPath);
    if (!fs.existsSync(targetPath)) {
      console.error(`❌ Dead import in ${full}: "${importPath}" (resolves to ${targetPath})`);
      process.exit(1);
    }
    // If named imports, check that target exports them
    if (match[1]) {
      const named = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const targetCode = fs.readFileSync(targetPath, 'utf8');
      for (const name of named) {
        const escaped = name.replace(/[$]/g, '\\$');
        const exportRegex = new RegExp(`export\\s+(?:const|function|async\\s+function|let|var|class)\\s+${escaped}(?=[^a-zA-Z0-9_$]|$)|export\\s*\\{[^}]*?(?:^|[^a-zA-Z0-9_$])${escaped}(?:[^a-zA-Z0-9_$]|$)[^}]*?\\}`);
        if (!exportRegex.test(targetCode)) {
          console.error(`❌ Missing export in ${targetPath} imported by ${full}: "${name}"`);
          process.exit(1);
        }
      }
    }
  }
  console.log('✔ Imports valid:', full);
}

function checkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      checkDir(full);
    } else if (full.endsWith('.js')) {
      checkFile(full);
    }
  }
}

checkDir('frontend/js');
console.log('\n🎉 SEMUA IMPORT ES MODULE VALID!');

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function checkSyntax(dir) {
  const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  let count = 0;
  for (const f of files) {
    if (!f.isDirectory() && f.name.endsWith('.js')) {
      const p = path.join(f.parentPath || f.path, f.name);
      try {
        execSync(`node --check "${p}"`, { stdio: 'pipe' });
        console.log('✔ Syntax OK:', p);
        count++;
      } catch (e) {
        console.error('❌ Syntax error in:', p, e.message);
        process.exit(1);
      }
    }
  }
  console.log(`\n🎉 Semua ${count} file JavaScript valid tanpa syntax error!`);
}

checkSyntax('frontend/js');


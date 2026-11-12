const fs = require('fs');
const path = require('path');

const dir = 'frontend/js/modules';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(f => {
  const p = path.join(dir, f);
  const content = fs.readFileSync(p, 'utf8');
  const matches = [...content.matchAll(/<table[^>]*>/g)];
  if (matches.length) {
    console.log(`${f}: ${matches.length} tables found`);
  }
});


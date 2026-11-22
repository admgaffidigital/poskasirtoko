const fs = require('fs');
const path = require('path');

const kodeGs = require('./_load_gas')();

// Collect all keys in RUTE
const backendActions = new Set();
const ruteBlock = kodeGs.substring(kodeGs.indexOf('const RUTE = {'), kodeGs.indexOf('};', kodeGs.indexOf('const RUTE = {')));
const ruteMatches = [...ruteBlock.matchAll(/^\s*['"]([a-zA-Z0-9_.]+)['"]:\s*\{/gm)].map(m => m[1]);
ruteMatches.forEach(a => backendActions.add(a));

console.log('Total backend actions found:', backendActions.size);

// Scan frontend for apiCall('...')
const frontendActions = new Set();
function scan(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) scan(p);
    else if (p.endsWith('.js')) {
      const content = fs.readFileSync(p, 'utf8');
      const matches = [...content.matchAll(/apiCall\s*\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)].map(m => m[1]);
      matches.forEach(a => frontendActions.add(a));
    }
  }
}
scan(path.join(__dirname, '..', 'frontend', 'js'));

console.log('Total frontend apiCalls found:', frontendActions.size);

let missing = 0;
for (const a of frontendActions) {
  if (!backendActions.has(a)) {
    console.log('⚠️ Frontend calls action NOT in backend switch:', a);
    missing++;
  }
}

if (missing === 0) {
  console.log('✔ SEMUA API CALL FRONTEND SESUAI DENGAN BACKEND (100% MATCH)!');
} else {
  console.log('Total unhandled actions:', missing);
  process.exit(1);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');

const hafsPath = path.join(__dirname, 'reciters_complete_mushaf.json');
const riwayaPath = path.join(__dirname, 'reciters_by_riwaya.json');
const hafs = JSON.parse(fs.readFileSync(hafsPath, 'utf8'));
const byRiwaya = JSON.parse(fs.readFileSync(riwayaPath, 'utf8'));

const seen = new Set();
const entries = [];

function pushEntry(e) {
  if (seen.has(e.id)) return;
  seen.add(e.id);
  entries.push(e);
}

hafs.forEach(pushEntry);
if (byRiwaya['حفص']) byRiwaya['حفص'].forEach(pushEntry);
['ورش', 'قالون', 'الدوري', 'شعبة', 'السوسي', 'خلف'].forEach(key => {
  (byRiwaya[key] || []).forEach(pushEntry);
});

function formatEntry(e) {
  const name = e.name.replace(/'/g, "\\'");
  const parts = [`id: '${e.id}'`, `name: '${name}'`, `rewaya: '${e.rewaya}'`];
  if (e.surahCdn) parts.push(`surahCdn: '${e.surahCdn}'`);
  if (e.blockedSurahs?.length) parts.push(`blockedSurahs: [${e.blockedSurahs.join(', ')}]`);
  if (e.redirectTo) parts.push(`redirectTo: '${e.redirectTo}'`);
  return `  { ${parts.join(', ')} }`;
}

const block = `const RECITERS = [\n${entries.map(formatEntry).join(',\n')}\n];`;

const apiPath = path.join(__dirname, '../src/services/quranApi.js');
let src = fs.readFileSync(apiPath, 'utf8');
src = src.replace(/const RECITERS = \[[\s\S]*?\];/, block);
fs.writeFileSync(apiPath, src);

const counts = {};
entries.forEach(e => { counts[e.rewaya] = (counts[e.rewaya] || 0) + 1; });
console.log('Updated RECITERS:', entries.length, 'total');
Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

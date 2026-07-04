const fs = require('fs');
const lines = fs.readFileSync('src/database.js', 'utf8').split('\n');

console.log('===== تعريف function get( و function set( الحرفي =====');
let i = 0;
while (i < lines.length) {
  if (/^function get\(|^function set\(/.test(lines[i])) {
    console.log('\n--- يبدأ عند السطر ' + (i + 1) + ' ---');
    let depth = 0;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      console.log((j + 1) + ': ' + lines[j]);
      if (lines[j].includes('{')) { depth += (lines[j].match(/{/g) || []).length; started = true; }
      if (lines[j].includes('}')) depth -= (lines[j].match(/}/g) || []).length;
      if (started && depth <= 0) break;
    }
  }
  i++;
}

console.log('\n===== module.exports كامل (من السطر 1204 للنهاية) =====');
for (let k = 1203; k < lines.length; k++) {
  console.log((k + 1) + ': ' + lines[k]);
}

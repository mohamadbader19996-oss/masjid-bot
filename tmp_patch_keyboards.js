const fs = require('fs');
const p = require('path').join(__dirname, 'src', 'keyboards.js');
let s = fs.readFileSync(p, 'utf8');
const btn = "  ['\uD83D\uDEE1\uFE0F \u062D\u0635\u0646 \u0627\u0644\u0645\u0633\u0644\u0645'],\n";
const needle = "  ['\uD83D\uDCE8 \u062F\u0639\u0648\u0629'],\n";
if (!s.includes('\u062D\u0635\u0646 \u0627\u0644\u0645\u0633\u0644\u0645') && s.includes(needle)) {
  s = s.replace(needle, btn + needle);
  fs.writeFileSync(p, s);
  console.log('added');
} else {
  console.log('already or missing needle');
}

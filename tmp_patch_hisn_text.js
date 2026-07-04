const fs = require('fs');
const p = require('path').join(__dirname, 'src', 'handlers', 'hisnMuslim.js');
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/حصn المسلm/g, '\u062D\u0635\u0646 \u0627\u0644\u0645\u0633\u0644\u0645');
fs.writeFileSync(p, s);
console.log('fixed Arabic in hisnMuslim.js');

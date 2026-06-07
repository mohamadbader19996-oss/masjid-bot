const fs = require('fs');
let c = fs.readFileSync('./src/handlers/common.js', 'utf8');
const lines = c.split('\n');
lines.forEach((line, i) => {
  if (line.includes('mosque.city') || line.includes('mosque.country')) {
    console.log('سطر ' + (i+1) + ': ' + line);
  }
});
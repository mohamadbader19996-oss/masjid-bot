const fs = require('fs');

function show(file, start, end) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  console.log('\n===== ' + file + ' (lines ' + start + '-' + Math.min(end, lines.length) + ') =====');
  for (let i = start; i <= end && i <= lines.length; i++) {
    console.log(i + ': ' + lines[i - 1]);
  }
}

show('src/database.js', 1, 40);
show('src/database.js', 400, 430);

console.log('\n===== البحث عن module.exports في database.js =====');
const dbLines = fs.readFileSync('src/database.js', 'utf8').split('\n');
dbLines.forEach((line, idx) => {
  if (/module\.exports|function save|function load|exports\./.test(line)) {
    console.log((idx + 1) + ': ' + line);
  }
});

show('src/handlers/mosque_admin.js', 2030, 2070);
show('src/utils/eventReminder.js', 1, 40);

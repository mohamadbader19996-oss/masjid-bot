const fs = require('fs');

console.log('===== src/services/gemini.js (الأسطر 100-407) =====');
const geminiLines = fs.readFileSync('src/services/gemini.js', 'utf8').split('\n');
for (let i = 100; i <= geminiLines.length; i++) {
  console.log(i + ': ' + geminiLines[i - 1]);
}

console.log('\n===== البحث عن نمط إشعار المطور في كل المشروع =====');
function searchDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = dir + '/' + entry.name;
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      searchDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (/DEVELOPER_ID|developerId|notifyDeveloper|DEV_ID|process\.env\.DEVELOPER/.test(line)) {
          console.log(fullPath + ':' + (idx + 1) + ': ' + line.trim());
        }
      });
    }
  }
}
searchDir('src');

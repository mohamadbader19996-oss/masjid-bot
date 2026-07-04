const fs = require('fs');
const lines = fs.readFileSync('src/handlers/ai.js', 'utf8').split('\n');
console.log('===== كل استدعاءات answerKeyboard( و scholarAnswerKeyboard( مع رقم السطر =====');
lines.forEach((line, idx) => {
  if (/answerKeyboard\(|scholarAnswerKeyboard\(/.test(line)) {
    console.log((idx + 1) + ': ' + line);
  }
});
console.log('\n===== تعريف الدالتين كاملاً (الأسطر 222-270) =====');
for (let i = 222; i <= 270; i++) {
  console.log(i + ': ' + lines[i - 1]);
}

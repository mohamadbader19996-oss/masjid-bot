const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
console.log('===== مفاتيح db.json الموجودة حالياً =====');
console.log(Object.keys(db));
console.log('\n===== ai.js: كل أسطر ctx.reply / Markup.button.callback / Markup.inlineKeyboard =====');
const lines = fs.readFileSync('src/handlers/ai.js', 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (/ctx\.reply|Markup\.button\.callback|Markup\.inlineKeyboard/.test(line)) {
    console.log((idx + 1) + ': ' + line);
  }
});

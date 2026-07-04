const fs = require('fs');
const lines = fs.readFileSync('src/handlers/ai.js', 'utf8').split('\n');
console.log('===== كل الأسطر المتعلقة بـ qa_cache أو QA Cache في ai.js =====');
lines.forEach((line, idx) => {
  if (/qa_cache|QA Cache|qaCache/i.test(line)) {
    console.log((idx + 1) + ': ' + line);
  }
});
console.log('\n===== السياق الكامل حول أول ظهور (30 سطراً قبل وبعد) =====');
const firstMatch = lines.findIndex(l => /qa_cache|QA Cache|qaCache/i.test(l));
if (firstMatch >= 0) {
  const start = Math.max(0, firstMatch - 30);
  const end = Math.min(lines.length, firstMatch + 60);
  for (let i = start; i < end; i++) {
    console.log((i + 1) + ': ' + lines[i]);
  }
} else {
  console.log('لم يُعثر على أي إشارة لـ qa_cache في ai.js — قد يكون الكود في ملف آخر.');
}

require('dotenv').config();
const gemini = require('../src/services/gemini');

async function main() {
  console.log('\n=== تشخيص Gemini API ===\n');

  const apiKey = gemini.getApiKey();
  console.log('1. المفتاح في .env:', apiKey ? `موجود (${apiKey.length} حرف)` : 'غير موجود');

  const format = gemini.validateKeyFormat(apiKey);
  if (!format.valid) {
    console.log('2. صيغة المفتاح:', '⚠️', format.reason);
    console.log('   سيتم اختبار الاتصال رغم ذلك...');
  } else {
    console.log('2. صيغة المفتاح:', '✅ صحيحة');
  }

  const variants = gemini.getKeyVariants();
  console.log(`3. صيغ المفتاح للاختبار: ${variants.length}`);
  console.log('4. اختبار النماذج:');
  const result = await gemini.testConnection();

  if (result.keyVariantUsed) {
    console.log(`   ℹ️ النسخة العاملة طولها ${result.keyVariantUsed} حرف`);
  }

  for (const m of result.models) {
    if (m.ok) {
      console.log(`   ✅ ${m.model} — نجح: "${m.sample}"`);
    } else {
      console.log(`   ❌ ${m.model} — ${m.error}`);
    }
  }

  if (result.workingModel) {
    console.log(`\n✅ الاتصال يعمل عبر: ${result.workingModel} (${result.via || 'fetch/sdk'})\n`);
    process.exit(0);
  }

  console.log('\n❌ فشل الاتصال بكل النماذج.\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('خطأ:', err.message);
  process.exit(1);
});

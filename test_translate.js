try { require('dotenv').config(); } catch (e) {}

const { translateUIText, getUserLangCode } = require('./src/services/uiTranslate');

(async () => {
  const fakeCtx = { from: { language_code: 'de' }, telegram: null };
  const lang = getUserLangCode(fakeCtx);
  console.log('اللغة المكتشفة:', lang);

  console.log('\n--- الاستدعاء الأول (يجب أن يستدعي Gemini فعلياً) ---');
  const result1 = await translateUIText(fakeCtx, 'test_button_muslim', 'مسلم 🌙', lang);
  console.log('النتيجة:', result1);

  console.log('\n--- الاستدعاء الثاني بنفس المفتاح (يجب أن يأتي من الذاكرة المحفوظة فوراً بدون استدعاء Gemini) ---');
  const result2 = await translateUIText(fakeCtx, 'test_button_muslim', 'مسلم 🌙', lang);
  console.log('النتيجة:', result2);
})();

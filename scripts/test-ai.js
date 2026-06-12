require('dotenv').config();
const db = require('../src/database');
const ai = require('../src/handlers/ai');
const { ROLES } = require('../src/keyboards');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

console.log('\n=== اختبار المساعد الديني ===\n');

console.log('1. حفظ المذهب في قاعدة البيانات');
const testId = 999999001;
db.saveUser(testId, { madhab: 'hanafi', aiAccepted: true, role: ROLES.WORSHIPPER });
const saved = db.getUser(testId);
assert(saved?.madhab === 'hanafi', 'المذهب يُحفظ في db.json');
assert(saved?.aiAccepted === true, 'aiAccepted يُحفظ');
db.saveUser(testId, { madhab: 'maliki' });
const updated = db.getUser(testId);
assert(updated?.madhab === 'maliki', 'تحديث المذهب يعمل');

console.log('\n2. System Prompt للخطبة');
const writePrompt = ai.buildSystemPrompt('hanafi', ROLES.SHEIKH, { khutbahMode: 'write' });
assert(writePrompt.includes('خطبة جمعة'), 'prompt كتابة الخطبة موجود');
assert(writePrompt.includes(ai.KHUTBAH_WARNING), 'تحذير الخطبة في prompt الكتابة');
assert(writePrompt.includes(ai.NON_RELIGIOUS_REPLY), 'رفض الأسئلة غير الدينية في prompt');

const translatePrompt = ai.buildSystemPrompt('shafii', ROLES.ADMIN, { khutbahMode: 'translate' });
assert(translatePrompt.includes('ترجم'), 'prompt الترجمة موجود');

const improvePrompt = ai.buildSystemPrompt('maliki', ROLES.DEVELOPER, { khutbahMode: 'improve' });
assert(improvePrompt.includes('تحسّن'), 'prompt التحسين موجود');

console.log('\n3. تحذير نهاية الخطبة');
const withWarning = ai.ensureKhutbahWarning('خطبة تجريبية');
assert(withWarning.includes(ai.KHUTBAH_WARNING), 'يُضاف التحذير تلقائياً');
const already = ai.ensureKhutbahWarning(`نص\n${ai.KHUTBAH_WARNING}`);
assert((already.match(new RegExp(ai.KHUTBAH_WARNING, 'g')) || []).length === 1, 'لا يُكرر التحذير');

console.log('\n4. مشايخ المسجد');
db.saveUser(999999002, { id: 999999002, role: ROLES.SHEIKH, mosqueId: 'test_mosque', firstName: 'شيخ تجريبي' });
db.saveUser(999999003, { id: 999999003, role: ROLES.SHEIKH, mosqueId: 'other', firstName: 'شيخ آخر' });
const mosqueSheikhs = ai.getMosqueSheikhs('test_mosque');
assert(mosqueSheikhs.length === 1, 'getMosqueSheikhs يُرجع شيوخ المسجد فقط');
assert(mosqueSheikhs[0].firstName === 'شيخ تجريبي', 'الشيخ الصحيح مُحدَّد');
assert(ai.getMosqueSheikhs(null).length === 0, 'بدون mosqueId = قائمة فارغة');

console.log('\n5. رفض الأسئلة غير الدينية (محلي)');
async function testNonReligious() {
  const { GoogleGenerativeAI } = require('@google/generative-ai');

  const obvious = /كرة|برمجة|طقس/i;
  assert(obvious.test('ما نتيجة مباراة كرة القدم؟'), 'كشف محلي: سؤال رياضي');
  assert(obvious.test('كيف أتعلم برمجة؟'), 'كشف محلي: سؤال برمجة');
  assert(!obvious.test('ما حكم الصلاة في السفر؟'), 'السؤال الديني لا يُرفض محلياً');

  if (!process.env.GEMINI_API_KEY) {
    console.log('  ⚠️ GEMINI_API_KEY غير موجود — تخطي اختبار Gemini');
    return;
  }

  console.log('\n6. اختبار Gemini API');
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: ai.buildSystemPrompt('hanafi', ROLES.WORSHIPPER)
    });
    const result = await model.generateContent('ما حكم الوضوء؟');
    const answer = result.response.text();
    assert(answer.length > 20, 'Gemini يُجيب على سؤال ديني');

    const result2 = await model.generateContent('ما طقس برلين اليوم؟');
    const answer2 = result2.response.text();
    assert(
      answer2.includes(ai.NON_RELIGIOUS_REPLY) || /ديني|شرعي|مخصص/i.test(answer2),
      'Gemini يرفض سؤال غير ديني'
    );

    const khutbahModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: ai.buildSystemPrompt('hanafi', ROLES.SHEIKH, { khutbahMode: 'write' })
    });
    const khutbahResult = await khutbahModel.generateContent('اكتب خطبة قصيرة جداً عن الصبر (فقرة واحدة للاختبار)');
    const khutbah = khutbahResult.response.text();
    assert(khutbah.length > 50, 'Gemini يكتب خطبة');
    assert(
      khutbah.includes(ai.KHUTBAH_WARNING) || ai.ensureKhutbahWarning(khutbah).includes(ai.KHUTBAH_WARNING),
      'الخطبة تحتوي تحذير المراجعة'
    );
  } catch (err) {
    console.log(`  ❌ خطأ Gemini: ${err.message}`);
    failed++;
  }
}

testNonReligious().then(() => {
  console.log(`\n=== النتيجة: ${passed} نجح | ${failed} فشل ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error('خطأ:', err.message);
  process.exit(1);
});

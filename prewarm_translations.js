const db = require('./src/database');
const geminiService = require('./src/services/gemini');
const { STATIC_MENU_LABELS } = require('./src/data/menuTranslations');
const { UI_PICKER_LANG_CODES } = require('./src/i18n/languagePickerOptions');

const LANGUAGES = [...UI_PICKER_LANG_CODES];

const LABELS = Object.keys(STATIC_MENU_LABELS.de || {});

async function translateOne(lang, label) {
  const key = 'menu_' + label;
  const existing = db.get('ui_translations') || {};
  if (existing[lang]?.[key]) return { lang, label, status: 'cached' };
  try {
    const systemInstruction =
      `أنت مترجم واجهة فقط. ترجم نص الزر التالي بدقة من العربية إلى اللغة التي رمزها "${lang}" مع الحفاظ على الرموز التعبيرية (emoji) في نفس موضعها. أعد فقط النص المترجم بدون شرح أو علامات تنصيص.`;
    const { text: raw } = await geminiService.askGemini(label, systemInstruction);
    const translated = (raw || '').trim() || label;
    const updated = db.get('ui_translations') || {};
    if (!updated[lang]) updated[lang] = {};
    updated[lang][key] = translated;
    db.set('ui_translations', updated);
    return { lang, label, status: 'ok', translated };
  } catch (e) {
    return { lang, label, status: 'error', error: e.message };
  }
}

async function runBatch(tasks, concurrency = 8) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

(async () => {
  const tasks = [];
  for (const lang of LANGUAGES) {
    for (const label of LABELS) {
      tasks.push(() => translateOne(lang, label));
    }
  }
  console.log(`بدء الترجمة: ${LANGUAGES.length} لغة × ${LABELS.length} عبارة = ${tasks.length} طلباً...`);
  const results = await runBatch(tasks, 8);
  const ok = results.filter(r => r.status === 'ok').length;
  const cached = results.filter(r => r.status === 'cached').length;
  const errors = results.filter(r => r.status === 'error');
  console.log(`\n✅ تمت الترجمة: ${ok}`);
  console.log(`📦 موجودة مسبقاً: ${cached}`);
  console.log(`❌ أخطاء: ${errors.length}`);
  if (errors.length) {
    console.log('تفاصيل الأخطاء (أول 10):');
    errors.slice(0, 10).forEach(e => console.log(`  ${e.lang} / ${e.label}: ${e.error}`));
  }
})();

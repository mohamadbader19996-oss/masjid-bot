require('dotenv').config();

const db = require('./src/database');
const { MENU_BUTTONS } = require('./src/keyboards');
const { translateMenuLabelViaGemini } = require('./src/services/uiTranslate');
const { EXTRA_PREWARM_LANG_CODES } = require('./src/i18n/languagePickerOptionsExtra');

const LANGUAGES = [...EXTRA_PREWARM_LANG_CODES];
const LABELS = [...MENU_BUTTONS].sort();
const CONCURRENCY = 9;

function isCached(lang, label) {
  const key = 'menu_' + label;
  return Boolean(db.get('ui_translations')?.[lang]?.[key]);
}

async function translateOne(lang, label) {
  if (isCached(lang, label)) {
    return { lang, label, status: 'cached' };
  }
  try {
    const translated = await translateMenuLabelViaGemini(lang, label);
    if (translated) {
      return { lang, label, status: 'ok', translated };
    }
    return { lang, label, status: 'error', error: 'translateMenuLabelViaGemini returned null' };
  } catch (e) {
    return { lang, label, status: 'error', error: e.message || String(e) };
  }
}

async function runBatch(tasks, concurrency) {
  const results = new Array(tasks.length);
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

  console.log(`=== prewarm_new_menu_languages ===`);
  console.log(`لغات جديدة: ${LANGUAGES.length} | أزرار: ${LABELS.length} | إجمالي: ${tasks.length}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const started = Date.now();
  const results = await runBatch(tasks, CONCURRENCY);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const ok = results.filter((r) => r.status === 'ok').length;
  const cached = results.filter((r) => r.status === 'cached').length;
  const errors = results.filter((r) => r.status === 'error');

  console.log(`\n=== التقرير النهائي (${elapsed}s) ===`);
  console.log(`✅ نجاح (جديد): ${ok}`);
  console.log(`📦 موجود مسبقاً: ${cached}`);
  console.log(`❌ فاشل: ${errors.length}`);

  if (errors.length) {
    console.log('\nأول 10 أخطاء:');
    errors.slice(0, 10).forEach((e) => {
      console.log(`  [${e.lang}] ${e.label}: ${e.error}`);
    });
  }

  process.exit(errors.length > 0 ? 1 : 0);
})().catch((err) => {
  console.error('\n❌ فشل السكربت:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

require('dotenv').config();
process.env.ACTION_REGISTRY_SILENT = '1';

const { ALL_LANGUAGES, formatQuranLanguageDisplay } = require('./src/services/quranApi');
const { prepareOutgoing, setUserUiLang } = require('./src/i18n/deviceLocale');
const { buildLanguageKeyboard, getQuranLangPageCount, QURAN_LANGS_PER_PAGE } = require('./src/handlers/quran');
require('./src/core/loadHandlers');
const registry = require('./src/core/actionRegistry');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function handlersFor(callbackData) {
  const matched = [];
  for (const { pattern, description } of registry.actions.values()) {
    if (typeof pattern === 'string' ? pattern === callbackData : pattern.test(callbackData)) {
      matched.push(description);
    }
  }
  return matched;
}

(async () => {
  console.log('=== test_quran_lang_display ===\n');

  const de = ALL_LANGUAGES.find((l) => l.edition === 'de.bubenheim');
  const en = ALL_LANGUAGES.find((l) => l.edition === 'en.sahih');
  assert(formatQuranLanguageDisplay(de).startsWith('🇩🇪 ألمانية'), 'German shows flag + Arabic name');
  assert(formatQuranLanguageDisplay(en).startsWith('🇬🇧 إنجليزية'), 'English shows flag + Arabic name');
  assert(formatQuranLanguageDisplay(de).includes('🇩'), 'German has flag emoji');

  const page1 = buildLanguageKeyboard(1);
  const langButtons = page1.reply_markup.inline_keyboard
    .flat()
    .filter((b) => b.callback_data.startsWith('quran_set_lang_'));
  assert(langButtons.length === QURAN_LANGS_PER_PAGE, 'page 1 has 8 language buttons');
  assert(langButtons.every((b) => /[\u{1F1E6}-\u{1F1FF}]|🌐|🏳️/u.test(b.text)), 'language buttons have flag emoji');
  const editionBtn = langButtons.find((b) => b.callback_data !== 'quran_set_lang_quran-uthmani');
  assert(editionBtn && editionBtn.callback_data.includes('.'), 'translation callbacks identify edition id');

  const pageHandlers = handlersFor('quran_lang_page_2');
  assert(pageHandlers.includes('صفحة لغات القرآن'), 'page callback hits quran pagination handler');
  assert(!pageHandlers.includes('اختيار لغة المصحف'), 'page callback no longer hits sheikh lang handler');

  const totalPages = getQuranLangPageCount();
  assert(totalPages === Math.ceil(ALL_LANGUAGES.length / QURAN_LANGS_PER_PAGE), 'pagination math is consistent');

  const ctx = { from: { id: 881001 }, session: {}, user: {} };
  setUserUiLang(ctx, 'de');
  const text = '🌍 *اختر لغة الترجمة*\n' + ALL_LANGUAGES.length + ' ترجمة — صفحة 1/' + totalPages;
  const out = await prepareOutgoing(ctx, text, {
    parse_mode: 'Markdown',
    skipTextTranslation: true,
    skipMarkupLocalization: true,
    ...buildLanguageKeyboard(1)
  });
  const outTexts = out.extra.reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert(outTexts[0] === formatQuranLanguageDisplay(ALL_LANGUAGES[0]), 'localized UI does not strip quran lang buttons');

  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

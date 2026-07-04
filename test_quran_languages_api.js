process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.ACTION_REGISTRY_SILENT = '1';

const { fetchTranslationEditionsFromApi } = require('./src/services/quranLanguageCatalog');
const { ALL_LANGUAGES } = require('./src/services/quranApi');
const {
  buildLanguageKeyboard,
  getQuranLangPageCount,
  QURAN_LANGS_PER_PAGE,
  QURAN_LANG_PAGINATION_MIN
} = require('./src/handlers/quran');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function countLangButtons(keyboard) {
  return keyboard.reply_markup.inline_keyboard
    .flat()
    .filter((b) => b.callback_data.startsWith('quran_set_lang_')).length;
}

(async () => {
  console.log('=== test_quran_languages_api ===\n');

  const apiEditions = await fetchTranslationEditionsFromApi();
  console.log('API translation editions:', apiEditions.length);
  console.log('ALL_LANGUAGES entries:', ALL_LANGUAGES.length);

  assert(apiEditions.length >= 100, 'API returns 100+ translation editions');
  assert(ALL_LANGUAGES.length === apiEditions.length + 1, 'catalog = Arabic + API editions');
  assert(ALL_LANGUAGES[0].edition === 'quran-uthmani', 'first entry is Arabic Uthmani');

  const expectedPages = Math.ceil(ALL_LANGUAGES.length / QURAN_LANGS_PER_PAGE);
  const pageCount = getQuranLangPageCount();
  assert(ALL_LANGUAGES.length > QURAN_LANG_PAGINATION_MIN, 'pagination threshold exceeded');
  assert(pageCount === expectedPages, `page count ${pageCount} = ceil(${ALL_LANGUAGES.length}/${QURAN_LANGS_PER_PAGE})`);

  const page1 = buildLanguageKeyboard(1);
  assert(page1?.reply_markup?.inline_keyboard?.length > 0, 'page 1 keyboard is non-empty');
  assert(countLangButtons(page1) === QURAN_LANGS_PER_PAGE, 'page 1 has 8 language buttons');

  const lastPage = buildLanguageKeyboard(pageCount);
  const remainder = ALL_LANGUAGES.length % QURAN_LANGS_PER_PAGE || QURAN_LANGS_PER_PAGE;
  assert(countLangButtons(lastPage) === remainder, 'last page button count matches remainder');

  const page2 = buildLanguageKeyboard(2);
  const navRow = page2.reply_markup.inline_keyboard.find((row) =>
    row.some((b) => b.callback_data === 'quran_lang_page_1' || b.callback_data === 'quran_lang_page_3')
  );
  assert(Boolean(navRow), 'page 2 has prev/next navigation');

  const firstBtn = page1.reply_markup.inline_keyboard[0][0];
  assert(firstBtn.callback_data.startsWith('quran_set_lang_'), 'callbacks use edition id');
  assert(/[\u{1F1E6}-\u{1F1FF}]|🌐|🏳️/u.test(firstBtn.text), 'buttons include flag emoji');

  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

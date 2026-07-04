process.env.ACTION_REGISTRY_SILENT = '1';

const { ALL_LANGUAGES } = require('./src/services/quranApi');
const {
  showLanguages,
  buildLanguageKeyboard,
  getQuranLangPageCount,
  normalizeQuranLangPage,
  QURAN_LANGS_PER_PAGE
} = require('./src/handlers/quran');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function countLangButtons(extra) {
  return extra.reply_markup.inline_keyboard
    .flat()
    .filter((b) => b.callback_data && b.callback_data.startsWith('quran_set_lang_')).length;
}

function makeCtx() {
  const captured = { text: '', extra: null, answered: false };
  return {
    captured,
    callbackQuery: { id: 'test' },
    session: {},
    answerCbQuery: async () => { captured.answered = true; },
    editMessageText: async (text, extra) => {
      captured.text = text;
      captured.extra = extra;
    },
    reply: async (text, extra) => {
      captured.text = text;
      captured.extra = extra;
    }
  };
}

(async () => {
  console.log('=== test_showLanguages_page ===\n');
  console.log('ALL_LANGUAGES:', ALL_LANGUAGES.length);
  console.log('total pages:', getQuranLangPageCount());

  assert(normalizeQuranLangPage(undefined, 1) === 1, 'undefined page -> 1');
  assert(normalizeQuranLangPage(() => {}, 1) === 1, 'Telegraf next() as page -> 1');
  assert(!String(normalizeQuranLangPage(() => {}, 1)).includes('NaN'), 'no NaN from next()');

  const ctxDirect = makeCtx();
  await showLanguages(ctxDirect, 1);
  assert(!ctxDirect.captured.text.includes('NaN'), 'showLanguages(ctx,1) text has no NaN');
  assert(/صفحة 1\//.test(ctxDirect.captured.text), 'showLanguages(ctx,1) shows page 1');
  assert(countLangButtons(ctxDirect.captured.extra) === QURAN_LANGS_PER_PAGE, 'page 1 has language buttons');

  const ctxTelegraf = makeCtx();
  await showLanguages(ctxTelegraf, async () => {});
  assert(!ctxTelegraf.captured.text.includes('NaN'), 'Telegraf-style (ctx,next) text has no NaN');
  assert(/صفحة 1\//.test(ctxTelegraf.captured.text), 'Telegraf-style call shows page 1');
  assert(countLangButtons(ctxTelegraf.captured.extra) === QURAN_LANGS_PER_PAGE, 'Telegraf-style call has language buttons');

  const ctxRegistry = makeCtx();
  await showLanguages(ctxRegistry);
  assert(!ctxRegistry.captured.text.includes('NaN'), 'showLanguages(ctx) text has no NaN');
  assert(countLangButtons(ctxRegistry.captured.extra) > 0, 'showLanguages(ctx) keyboard not empty');

  const kb = buildLanguageKeyboard(1);
  const navTexts = kb.reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert(navTexts.includes('➡️ لغات أخرى'), 'nav uses ➡️ لغات أخرى like UI picker');

  console.log('\nSample text:', ctxTelegraf.captured.text.replace('\n', ' | '));
  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

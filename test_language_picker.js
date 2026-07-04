require('dotenv').config();
process.env.ACTION_REGISTRY_SILENT = '1';

const db = require('./src/database');
const { ROLES } = require('./src/keyboards');
const {
  languagePickerKeyboard,
  setUserUiLang,
  localizedMainKeyboard,
  getDeviceLang,
  applyUiLanguage,
  handleUiLangPage
} = require('./src/services/uiTranslate');
const {
  UI_PICKER_LANG_CODES,
  getLanguagePickerPageCount,
  getLanguagePickerPageCodes
} = require('./src/i18n/languagePickerOptions');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function flattenCallbacks(keyboard) {
  const rows = keyboard?.reply_markup?.inline_keyboard || [];
  return rows.flat().map((b) => b.callback_data);
}

function makeCtx(langCode = 'ar') {
  const userId = 880001;
  const ctx = {
    from: { id: userId, language_code: langCode },
    chat: { id: userId },
    session: {},
    user: db.saveUser(userId, {
      id: userId,
      firstName: 'Test',
      role: ROLES.WORSHIPPER
    }),
    answerCbQuery: async () => {},
    editMessageReplyMarkup: async function (markup) {
      this._lastMarkup = markup;
      return true;
    }
  };
  return ctx;
}

async function testKeyboardStructure() {
  const total = getLanguagePickerPageCount();
  assert(UI_PICKER_LANG_CODES.length === 199, `199 picker languages (got ${UI_PICKER_LANG_CODES.length})`);
  assert(!UI_PICKER_LANG_CODES.includes('he'), 'Hebrew (he) not in picker');
  assert(total === 25, `25 pages for 199 langs / 8 (got ${total})`);

  for (let p = 0; p < total; p++) {
    const cbs = flattenCallbacks(languagePickerKeyboard(p));
    assert(cbs.includes('ui_lang_ar'), `page ${p}: Arabic always present`);
    const pageCodes = getLanguagePickerPageCodes(p);
    for (const code of pageCodes) {
      assert(cbs.includes(`ui_lang_${code}`), `page ${p}: has ui_lang_${code}`);
    }
    if (p > 0) assert(cbs.includes(`ui_lang_page_${p - 1}`), `page ${p}: back button`);
    if (p < total - 1) assert(cbs.includes(`ui_lang_page_${p + 1}`), `page ${p}: next button`);
  }
}

async function testPageNavigation() {
  const ctx = makeCtx();
  await handleUiLangPage(ctx, 3);
  const cbs = flattenCallbacks({ reply_markup: ctx._lastMarkup });
  assert(cbs.includes('ui_lang_ar'), 'navigation: Arabic on page 3');
  assert(cbs.includes('ui_lang_page_2'), 'navigation: back to page 2');
  assert(cbs.includes('ui_lang_page_4'), 'navigation: forward to page 4');
}

async function testLangSetsUiLangAndKeyboard() {
  const samples = [
    { code: 'de', page: 0, expectTranslated: true },
    { code: 'tr', page: 0, expectTranslated: true },
    { code: 'fa', page: 0, expectTranslated: true },
    { code: 'ceb', page: 11, expectTranslated: true },
    { code: 'ar', page: 0, expectTranslated: false }
  ];

  for (const { code, page, expectTranslated } of samples) {
    const pageCodes = getLanguagePickerPageCodes(page);
    if (code !== 'ar') {
      assert(pageCodes.includes(code) || ['de', 'en', 'fr'].includes(code),
        `${code} is on expected page ${page} or priority list`);
    }

    const ctx = makeCtx('ar');
    const sent = [];
    ctx.telegram = {
      sendMessage: async (_chatId, _text, extra) => {
        sent.push(extra?.reply_markup?.keyboard || []);
        return { message_id: sent.length };
      }
    };

    await applyUiLanguage(ctx, code);

    assert(ctx.session.uiLang === code, `${code}: session.uiLang set`);
    assert(ctx.user.uiLang === code, `${code}: user.uiLang persisted in db`);

    const saved = db.getUser(ctx.from.id);
    assert(saved.uiLang === code, `${code}: db.uiLang saved`);

    const kbd = await localizedMainKeyboard(ctx, ROLES.WORSHIPPER);
    const flat = (kbd.reply_markup?.keyboard || []).flat();
    const hasArabicBtn = flat.includes('🕌 المساعد الديني');
    if (expectTranslated) {
      assert(getDeviceLang(ctx) === code, `${code}: getDeviceLang matches`);
      assert(!hasArabicBtn, `${code}: main keyboard translated (no raw Arabic menu btn)`);
    } else {
      assert(hasArabicBtn, `${code}: Arabic keyboard keeps Arabic labels`);
    }
  }
}

(async () => {
  console.log('=== test_language_picker ===\n');
  await testKeyboardStructure();
  await testPageNavigation();
  await testLangSetsUiLangAndKeyboard();
  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

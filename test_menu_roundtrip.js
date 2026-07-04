require('dotenv').config();

const { mainKeyboard, ROLES, isMenuButton } = require('./src/keyboards');
const {
  getDeviceLang,
  localizeMarkupSync,
  prepareOutgoing,
  resolveIncomingButtonText
} = require('./src/i18n/deviceLocale');
const { getInlineLabel } = require('./src/i18n/inlineLabels');
const { Markup } = require('telegraf');

const ROLES_TO_TEST = [
  ROLES.WORSHIPPER,
  ROLES.SHEIKH,
  ROLES.ADMIN,
  ROLES.DEVELOPER
];

const LANGS = ['de', 'en', 'ar'];

function makeCtx(lang) {
  return {
    from: { id: 999001, language_code: lang },
    session: {},
    user: { uiLang: lang === 'ar' ? undefined : lang }
  };
}

async function testReplyKeyboardRoundtrip(lang, role) {
  const ctx = makeCtx(lang);
  if (lang !== 'ar') ctx.session.uiLang = lang;

  const originalKbd = mainKeyboard(role);
  const originalLabels = (originalKbd.reply_markup?.keyboard || []).flat().filter((l) => typeof l === 'string');

  const out = await prepareOutgoing(ctx, 'test', originalKbd);
  const translatedKbd = out.extra;
  const translatedLabels = (translatedKbd?.reply_markup?.keyboard || []).flat().filter((l) => typeof l === 'string');

  const results = [];
  for (let i = 0; i < originalLabels.length; i++) {
    const arabic = originalLabels[i];
    const shown = lang === 'ar' ? arabic : (translatedLabels[i] ?? arabic);
    const resolved = resolveIncomingButtonText(ctx, shown);
    const menuOk = isMenuButton(resolved);
    const exactOk = resolved === arabic;
    results.push({
      role,
      lang,
      arabic,
      shown,
      resolved,
      ok: exactOk && menuOk,
      exactOk,
      menuOk
    });
  }
  return results;
}

async function testInlineLabels() {
  const samples = [
    { lang: 'de', cb: 'ai_muslim_start', expect: '🕌 Religiöser Assistent' },
    { lang: 'en', cb: 'ai_muslim_start', expect: '🕌 Religious Assistant' },
    { lang: 'de', cb: 'quran_menu', expect: '📖 Quran-Menü' },
    { lang: 'ar', cb: 'ai_muslim_start', expect: null }
  ];
  const failures = [];
  for (const s of samples) {
    const got = getInlineLabel(s.lang, s.cb);
    if (got !== s.expect) {
      failures.push({ ...s, got });
    }
  }
  return failures;
}

async function testInlineKeyboardRoundtrip(lang) {
  const ctx = makeCtx(lang);
  if (lang !== 'ar') ctx.session.uiLang = lang;

  const inline = Markup.inlineKeyboard([
    [Markup.button.callback('🕌 المساعد الديني', 'ai_muslim_start')],
    [Markup.button.callback('📖 القرآن الكريم', 'quran_menu')]
  ]);

  const out = await localizeMarkupSync(ctx, inline, lang);
  const failures = [];
  for (const row of out.reply_markup?.inline_keyboard || []) {
    for (const btn of row) {
      const byCb = getInlineLabel(lang, btn.callback_data);
      if (lang === 'ar') {
        if (btn.text !== '🕌 المساعد الديني' && btn.callback_data === 'ai_muslim_start') {
          failures.push({ lang, btn, reason: 'ar text changed' });
        }
      } else if (byCb && btn.text !== byCb) {
        failures.push({ lang, btn, expected: byCb, got: btn.text });
      }
    }
  }
  return failures;
}

/** أزرار لوحة مدير المسجد — من mosqueAdminPanel */
const MOSQUE_ADMIN_PANEL_BUTTONS = [
  ['👥 الفريق الإداري', 'ma_team'],
  ['🕌 إدارة المشايخ', 'ma_sheikhs'],
  ['📢 الإعلانات والفعاليات', 'ma_announcements'],
  ['💰 المالية والتبرعات', 'ma_finance'],
  ['🔧 بلاغات الأعطال', 'logistics_menu'],
  ['📩 شكاوى المصلين', 'ma_complaints'],
  ['🕌 المساجد المجاورة', 'ma_nearby'],
  ['📊 الإحصائيات', 'ma_stats'],
  ['📋 تقرير الدولة', 'ma_state_report'],
  ['📬 التواصل مع المنصة', 'ma_platform'],
  ['🤝 المتطوعون الدعويون', 'ma_volunteers'],
  ['🚨 تنبيه طارئ', 'ma_emergency']
];

async function testMosqueAdminPanelInline(lang) {
  const ctx = makeCtx(lang);
  if (lang !== 'ar') ctx.session.uiLang = lang;

  const rows = MOSQUE_ADMIN_PANEL_BUTTONS.map(([text, cb]) => [
    Markup.button.callback(text, cb)
  ]);
  const inline = Markup.inlineKeyboard(rows);
  const out = await prepareOutgoing(ctx, 'test', inline);
  const failures = [];

  for (const row of out.extra?.reply_markup?.inline_keyboard || []) {
    for (const btn of row) {
      const arabic = MOSQUE_ADMIN_PANEL_BUTTONS.find(([, cb]) => cb === btn.callback_data)?.[0];
      if (!arabic) continue;
      if (lang === 'ar') {
        if (btn.text !== arabic) {
          failures.push({ lang, cb: btn.callback_data, expected: arabic, got: btn.text });
        }
      } else if (btn.text === arabic) {
        failures.push({ lang, cb: btn.callback_data, reason: 'not translated', text: btn.text });
      }
    }
  }
  return failures;
}

(async () => {
  let total = 0;
  let passed = 0;
  const allFailures = [];

  console.log('=== Reply keyboard roundtrip ===\n');
  for (const lang of LANGS) {
    for (const role of ROLES_TO_TEST) {
      const results = await testReplyKeyboardRoundtrip(lang, role);
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok);
      total += results.length;
      passed += ok;
      console.log(`[${lang}] role=${role}: ${ok}/${results.length} OK`);
      if (fail.length) {
        allFailures.push(...fail);
        fail.forEach((f) => {
          console.log(`  FAIL arabic=${JSON.stringify(f.arabic)}`);
          console.log(`       shown=${JSON.stringify(f.shown)}`);
          console.log(`       resolved=${JSON.stringify(f.resolved)} menuOk=${f.menuOk}`);
        });
      }
    }
    console.log('');
  }

  console.log('=== Inline label smoke test ===');
  const inlineFails = await testInlineLabels();
  if (inlineFails.length) {
    console.log('INLINE LABEL FAILURES:', inlineFails);
  } else {
    console.log('All inline label samples OK');
  }

  console.log('\n=== Inline keyboard roundtrip (dawah) ===');
  let inlineRoundtripFails = 0;
  for (const lang of ['de', 'en', 'ar']) {
    const fails = await testInlineKeyboardRoundtrip(lang);
    inlineRoundtripFails += fails.length;
    console.log(`[${lang}] inline failures: ${fails.length}`);
    fails.forEach((f) => console.log(' ', f));
  }

  console.log('\n=== Mosque admin panel inline ===');
  let maPanelFails = 0;
  for (const lang of ['de', 'en', 'ar']) {
    const fails = await testMosqueAdminPanelInline(lang);
    maPanelFails += fails.length;
    const total = MOSQUE_ADMIN_PANEL_BUTTONS.length;
    console.log(`[${lang}] ma panel: ${total - fails.length}/${total} OK`);
    fails.forEach((f) => console.log(' ', f));
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total reply buttons tested: ${total}`);
  console.log(`Reply passed: ${passed}`);
  console.log(`Reply failed: ${total - passed}`);
  const allOk = total === passed && inlineFails.length === 0
    && inlineRoundtripFails === 0 && maPanelFails === 0;
  process.exit(allOk ? 0 : 1);
})();

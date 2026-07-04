require('dotenv').config();
process.env.ACTION_REGISTRY_SILENT = '1';

const { ROLES } = require('./src/keyboards');
const {
  localizedMainKeyboard,
  prepareOutgoing,
  normalizeOutgoingArgs,
  getDeviceLang
} = require('./src/services/uiTranslate');

async function simulateMenu(ctx) {
  const kbd = await localizedMainKeyboard(ctx, ctx.user?.role || ROLES.WORSHIPPER);
  const { messageText, options } = normalizeOutgoingArgs('القائمة الرئيسية:', kbd);
  const out = await prepareOutgoing(ctx, messageText, options);
  const rows = out.extra?.reply_markup?.keyboard || [];
  return { text: out.text, rows, lang: getDeviceLang(ctx) };
}

async function testArabic() {
  const ctx = {
    from: { id: 1, language_code: 'ar' },
    session: {},
    user: { role: ROLES.WORSHIPPER, uiLang: 'ar' }
  };
  const out = await simulateMenu(ctx);
  const flat = out.rows.flat();
  if (!flat.includes('🕌 المساعد الديني')) throw new Error('ar: missing Arabic menu button');
  if (out.text !== 'القائمة الرئيسية:') throw new Error('ar: menu text changed');
  console.log('✅ /menu Arabic —', flat.length, 'buttons, text OK');
}

async function testGerman() {
  const ctx = {
    from: { id: 2, language_code: 'de' },
    session: { uiLang: 'de' },
    user: { role: ROLES.WORSHIPPER, uiLang: 'de' }
  };
  const out = await simulateMenu(ctx);
  const flat = out.rows.flat();
  if (flat.includes('🕌 المساعد الديني')) throw new Error('de: keyboard still Arabic');
  if (!flat.some((b) => /Religi|Assistent|Gebet|Muslim/i.test(b))) {
    throw new Error('de: no German labels in keyboard: ' + flat.slice(0, 3).join(' | '));
  }
  console.log('✅ /menu German —', flat.length, 'buttons, translated OK');
  console.log('   sample:', flat.slice(0, 2).join(' | '));
}

(async () => {
  console.log('=== test_menu_command ===\n');
  await testArabic();
  await testGerman();
  console.log('\n=== ALL PASSED ===');
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

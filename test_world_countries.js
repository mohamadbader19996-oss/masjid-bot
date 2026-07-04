process.env.ACTION_REGISTRY_SILENT = '1';

const {
  WORLD_COUNTRIES,
  EXCLUDED_ISO,
  buildMuslimCountryKeyboard,
  parseCountryCallback,
  getCountryByCode,
  getCountryName,
  normalizeCountryCode,
  countryCodesMatch
} = require('./src/data/muslimCountries');

const PREFIX = 'modapp_country';
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

console.log('=== test_world_countries ===\n');

console.log('1) العدد الإجمالي للدول');
console.log(`   إجمالي الدول: ${WORLD_COUNTRIES.length}`);
assert(WORLD_COUNTRIES.length >= 190 && WORLD_COUNTRIES.length <= 260,
  `العدد ${WORLD_COUNTRIES.length} ضمن النطاق المتوقع (~195+)`);
assert(!WORLD_COUNTRIES.some(c => c.iso2 === 'IL'), 'إسرائيل (IL) مستبعدة');
assert(!getCountryByCode('il'), 'lookup il يعيد null');

console.log('\n2) أول صفحة — أزرار صالحة بأعلام');
const kb = buildMuslimCountryKeyboard(PREFIX, 0);
const rows = kb.reply_markup.inline_keyboard;
const countryRows = rows.slice(0, -1);
assert(countryRows.length === 8, `أول صفحة: 8 دول (حصل ${countryRows.length})`);
countryRows.forEach((row, i) => {
  const btn = row[0];
  const parsed = parseCountryCallback(btn.callback_data, PREFIX);
  assert(parsed?.type === 'country' && parsed.country, `زر ${i + 1}: callback صالح`);
  assert(btn.text.startsWith(parsed.country.flag), `زر ${i + 1}: علم ${parsed.country.flag} في النص`);
  assert(btn.text.includes(parsed.country.name), `زر ${i + 1}: اسم ${parsed.country.name}`);
});

console.log('\n3) التنقل بين الصفحات');
const navRow = rows[rows.length - 1];
const nextBtn = navRow.find(b => b.text === '➡️');
assert(nextBtn, 'صفحة 0: زر ➡️ موجود');
const page1Parsed = parseCountryCallback(nextBtn.callback_data, PREFIX);
assert(page1Parsed?.type === 'page' && page1Parsed.page === 1, '➡️ يفتح الصفحة 1');

const kb1 = buildMuslimCountryKeyboard(PREFIX, 1);
const nav1 = kb1.reply_markup.inline_keyboard.at(-1);
assert(nav1.some(b => b.text === '⬅️'), 'صفحة 1: زر ⬅️ موجود');
assert(nav1.some(b => b.text.includes('2/')), 'صفحة 1: عدّاد 📄 2/N');

const backBtn = nav1.find(b => b.text === '⬅️');
const backParsed = parseCountryCallback(backBtn.callback_data, PREFIX);
assert(backParsed?.type === 'page' && backParsed.page === 0, '⬅️ يعود للصفحة 0');

const lastPage = Math.ceil(WORLD_COUNTRIES.length / 8) - 1;
const kbLast = buildMuslimCountryKeyboard(PREFIX, lastPage);
const navLast = kbLast.reply_markup.inline_keyboard.at(-1);
assert(!navLast.some(b => b.text === '➡️'), 'آخر صفحة: لا ➡️');
assert(navLast.some(b => b.text === '⬅️'), 'آخر صفحة: ⬅️ موجود');

console.log('\n4) توافق الرموز القديمة (germany → de)');
assert(normalizeCountryCode('germany') === 'de', 'normalize germany → de');
assert(countryCodesMatch('germany', 'de'), 'مطابقة germany/de');
assert(getCountryName('germany') === getCountryByCode('de').name, 'getCountryName legacy');

console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
process.exit(failed > 0 ? 1 : 0);

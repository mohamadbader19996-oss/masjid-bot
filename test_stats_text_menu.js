process.env.ACTION_REGISTRY_SILENT = '1';

const db = require('./src/database');
const {
  buildMonthlyStatsText,
  buildYearlyStatsText,
  buildMainMenuUsageReport
} = require('./src/handlers/hierarchicalStats');
const { getMonthlyStats, getYearlyStats, getCountriesRankedByMosques } = require('./src/services/hierarchicalStatsService');
const { BASE_BUTTONS, BASE_MENU_BUTTONS } = require('./src/keyboards');
const { dispatchMenuButton } = require('./src/menuHandlers');

const TEST_MOSQUE_DE = 'mosque_rank_de';
const TEST_MOSQUE_FR = 'mosque_rank_fr';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function cleanup() {
  db.deleteMosque(TEST_MOSQUE_DE);
  db.deleteMosque(TEST_MOSQUE_FR);
  db.resetMainMenuUsage();
}

(async () => {
  console.log('=== test_stats_text_menu ===\n');

  console.log('0) القائمة الرئيسية (BASE_BUTTONS) — للتأكيد:');
  BASE_BUTTONS.flat().forEach((btn, i) => console.log(`   ${i + 1}. ${btn}`));
  assert(BASE_MENU_BUTTONS.size === 13, `BASE_MENU_BUTTONS = 13 زر (حصل ${BASE_MENU_BUTTONS.size})`);

  cleanup();
  db.saveMosque(TEST_MOSQUE_DE, { name: 'M1', countryCode: 'de', active: true });
  db.saveMosque('mosque_rank_de2', { name: 'M2', countryCode: 'de', active: true });
  db.saveMosque('mosque_rank_de3', { name: 'M3', countryCode: 'de', active: true });
  db.saveMosque(TEST_MOSQUE_FR, { name: 'M4', countryCode: 'fr', active: true });

  try {
    console.log('\n1) إحصائيات شهرية/سنوية — نص فقط (بلا صور)');
    const monthText = buildMonthlyStatsText(getMonthlyStats('2026-06'));
    assert(!monthText.includes('replyWithPhoto'), 'لا مرجع لصورة');
    assert(monthText.includes('🕌 *مساجد جديدة:*'), 'نص مساجد موجود');
    assert(monthText.includes('🪪 *مشرفون جدد:*'), 'نص مشرفين موجود');
    assert(!monthText.includes('chart_'), 'لا مسارات رسوم');

    const yearText = buildYearlyStatsText(getYearlyStats(2026));
    assert(yearText.includes('تفصيل شهري'), 'عرض سنوي كنص');
    assert(yearText.includes('•'), 'قائمة أشهر');
    const handlerSrc = require('fs').readFileSync('./src/handlers/hierarchicalStats.js', 'utf8');
    assert(!handlerSrc.includes('renderMonthlyStatsCharts'), 'handler لا يستدعي renderMonthlyStatsCharts');
    assert(!handlerSrc.includes('renderYearlyStatsCharts'), 'handler لا يستدعي renderYearlyStatsCharts');

    console.log('\n2) الدول الأكثر مساجد — ترتيب تنازلي');
    const ranked = getCountriesRankedByMosques();
    const de = ranked.find(c => c.code === 'de');
    const fr = ranked.find(c => c.code === 'fr');
    assert(de && de.count >= 3, `ألمانيا >= 3 مساجد (حصل ${de?.count})`);
    assert(fr && fr.count >= 1, `فرنسا >= 1 مسجد`);
    const deIdx = ranked.findIndex(c => c.code === 'de');
    const frIdx = ranked.findIndex(c => c.code === 'fr');
    assert(deIdx < frIdx, 'ألمانيا قبل فرنسا في الترتيب');
    assert(ranked[0].flag && ranked[0].name, 'علم واسم في أول عنصر');
    const line0 = `1. ${ranked[0].flag} ${ranked[0].name} — ${ranked[0].count} مسجد`;
    console.log(`   مثال: ${line0}`);

    console.log('\n3) تتبّع القائمة الرئيسية — main_menu_usage + نسب');
    db.resetMainMenuUsage();
    const presses = [
      ['📖 القرآن الكريم', 5],
      ['🕊️ القسم الدعوي', 3],
      ['📅 مواقيت الصلاة', 2],
      ['🕌 المساعد الديني', 1],
      ['📢 الإعلانات', 1]
    ];
    for (const [btn, n] of presses) {
      assert(BASE_MENU_BUTTONS.has(btn), `${btn} ضمن BASE_MENU_BUTTONS`);
      for (let i = 0; i < n; i++) db.incrementMainMenuUsage(btn);
    }
    const usage = db.getMainMenuUsage();
    assert(usage['📖 القرآن الكريم'] === 5, 'قرآن = 5');
    assert(usage['🕊️ القسم الدعوي'] === 3, 'دعوي = 3');
    const { rows, total } = buildMainMenuUsageReport();
    assert(total === 12, `إجمالي = 12 (حصل ${total})`);
    const pctSum = rows.reduce((s, r) => s + (r.count / total) * 100, 0);
    assert(Math.abs(pctSum - 100) < 0.01, `مجموع النسب = ${pctSum.toFixed(2)}%`);
    assert(rows[0].button === '📖 القرآن الكريم', 'الأكثر استخداماً: القرآن');

    console.log('\n4) dispatchMenuButton — لا يعدّ أزرار غير رئيسية');
    db.resetMainMenuUsage();
    const mockCtx = { reply: async () => {} };
    await dispatchMenuButton(mockCtx, '📊 إحصائيات النظام');
    assert(!db.getMainMenuUsage()['📊 إحصائيات النظام'], 'زر مطوّر لا يُعدّ');
    db.incrementMainMenuUsage('📚 الدروس');
    assert(db.getMainMenuUsage()['📚 الدروس'] === 1, 'عدّ يدوي للزر الرئيسي يعمل');

    console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  } finally {
    db.deleteMosque('mosque_rank_de2');
    db.deleteMosque('mosque_rank_de3');
    cleanup();
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  cleanup();
  console.error('❌', e);
  process.exit(1);
});

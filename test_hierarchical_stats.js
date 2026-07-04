process.env.ACTION_REGISTRY_SILENT = '1';
process.env.DEVELOPER_IDS = '990001';

const fs = require('fs');
const path = require('path');
const db = require('./src/database');
const {
  getMonthlyStats,
  getYearlyStats,
  getCurrentMonthKey,
  shiftMonthKey,
  getRegionsWithData,
  getCountriesInRegion,
  getCountryArchiveDetails
} = require('./src/services/hierarchicalStatsService');
const { renderMonthlyStatsCharts, renderYearlyStatsCharts } = require('./src/services/statsChartRenderer');
const { renderCountryArchiveReport } = require('./src/services/regionalArchiveRenderer');
const { getRegionIdForCountry } = require('./src/data/geoRegions');

const TEST_MOSQUE_1 = 'mosque_hstats_test_1';
const TEST_MOSQUE_2 = 'mosque_hstats_test_2';
const TEST_MOSQUE_3 = 'mosque_hstats_test_3';
const TEST_MOD_1 = '990501';
const TEST_MOD_2 = '990502';
const TEST_W1 = '990601';
const TEST_W2 = '990602';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function cleanup() {
  [TEST_MOSQUE_1, TEST_MOSQUE_2, TEST_MOSQUE_3].forEach(id => db.deleteMosque(id));
  [TEST_MOD_1, TEST_MOD_2, TEST_W1, TEST_W2].forEach(id => {
    const d = require('./src/utils/db');
    const data = d.loadDB();
    delete data.users[id];
    d.saveDB(data);
  });
}

function seedTestData() {
  db.saveMosque(TEST_MOSQUE_1, {
    name: 'مسجد تجريبي 1',
    countryCode: 'de',
    active: true,
    approvedAt: '2026-05-05T10:00:00.000Z'
  });
  db.saveMosque(TEST_MOSQUE_2, {
    name: 'مسجد تجريبي 2',
    countryCode: 'de',
    active: true,
    approvedAt: '2026-05-05T14:00:00.000Z'
  });
  db.saveMosque(TEST_MOSQUE_3, {
    name: 'مسجد تجريبي 3',
    countryCode: 'fr',
    active: true,
    approvedAt: '2026-06-03T09:00:00.000Z'
  });

  db.saveUser(TEST_MOD_1, {
    id: Number(TEST_MOD_1),
    role: 'moderator',
    firstName: 'مشرف',
    lastName: 'ألمانيا',
    moderatorCountry: 'de',
    approvedAt: '2026-05-10T12:00:00.000Z'
  });
  db.saveUser(TEST_MOD_2, {
    id: Number(TEST_MOD_2),
    role: 'moderator',
    firstName: 'مشرف',
    lastName: 'فرنسا',
    moderatorCountry: 'fr',
    approvedAt: '2026-06-01T08:00:00.000Z'
  });

  db.saveUser(TEST_W1, { id: Number(TEST_W1), role: 'worshipper', mosqueId: TEST_MOSQUE_1, firstName: 'مصلي1' });
  db.saveUser(TEST_W2, { id: Number(TEST_W2), role: 'worshipper', mosqueId: TEST_MOSQUE_1, firstName: 'مصلي2' });
}

(async () => {
  console.log('=== test_hierarchical_stats ===\n');

  const mayBefore = getMonthlyStats('2026-05');
  const juneBefore = getMonthlyStats('2026-06');
  const yearBefore = getYearlyStats(2026);
  cleanup();
  seedTestData();

  try {
    console.log('1) التصفّح الشهري — مايو ويونيو 2026');
    const may = getMonthlyStats('2026-05');
    assert(may.totalMosques - mayBefore.totalMosques === 2, `مايو: +2 مساجد (حصل +${may.totalMosques - mayBefore.totalMosques})`);
    assert(may.mosquesDaily[4] - (mayBefore.mosquesDaily[4] || 0) === 2, `مايو: يوم 5 +2 مساجد`);
    assert(may.totalModerators - mayBefore.totalModerators === 1, `مايو: +1 مشرف`);
    assert(may.moderatorsDaily[9] - (mayBefore.moderatorsDaily[9] || 0) === 1, `مايو: يوم 10 +1 مشرف`);

    const june = getMonthlyStats('2026-06');
    assert(june.totalMosques - juneBefore.totalMosques === 1, `يونيو: +1 مسجد (حصل +${june.totalMosques - juneBefore.totalMosques})`);
    assert(june.mosquesDaily[2] - (juneBefore.mosquesDaily[2] || 0) === 1, `يونيو: يوم 3 +1 مسجد`);
    assert(june.totalModerators - juneBefore.totalModerators === 1, `يونيو: +1 مشرف`);
    assert(june.moderatorsDaily[0] - (juneBefore.moderatorsDaily[0] || 0) === 1, `يونيو: يوم 1 +1 مشرف`);

    const cur = getCurrentMonthKey();
    const prev = shiftMonthKey(cur, -1);
    assert(typeof getMonthlyStats(cur).days === 'number', `الشهر الحالي (${cur}): مصفوفة يومية بطول ${getMonthlyStats(cur).days}`);
    assert(getMonthlyStats(prev).days >= 28, `الشهر السابق (${prev}): بطول ${getMonthlyStats(prev).days} يوم`);

    console.log('\n2) رسمان بيانيان منفصلان — puppeteer + Chart.js');
    const charts = await renderMonthlyStatsCharts(june);
    assert(fs.existsSync(charts.mosques.pngPath), 'صورة المساجد وُجدت');
    assert(fs.existsSync(charts.moderators.pngPath), 'صورة المشرفين وُجدت');
    assert(charts.mosques.pngPath !== charts.moderators.pngPath, 'مساران مختلفان');
    assert(charts.mosques.size > 5000, `مساجد: ${charts.mosques.size} bytes`);
    assert(charts.moderators.size > 5000, `مشرفون: ${charts.moderators.size} bytes`);
    console.log(`   📁 ${charts.mosques.pngPath} (${charts.mosques.size} bytes)`);
    console.log(`   📁 ${charts.moderators.pngPath} (${charts.moderators.size} bytes)`);

    console.log('\n3) الأرشيف الإقليمي — منطقة/بلد/تفاصيل');
    const regions = getRegionsWithData();
    assert(regions.length > 0, `مناطق متاحة: ${regions.length}`);
    const westEurope = regions.find(r => r.id === 'west_europe');
    assert(westEurope, 'منطقة أوروبا الغربية موجودة');

    const countries = getCountriesInRegion('west_europe');
    assert(countries.some(c => c.code === 'de'), 'ألمانيا في القائمة');
    assert(countries.some(c => c.code === 'fr'), 'فرنسا في القائمة');

    const deDetails = getCountryArchiveDetails('de');
    const deMosqueNames = deDetails.mosques.map(m => m.name);
    assert(deMosqueNames.includes('مسجد تجريبي 1'), 'مسجد تجريبي 1 في ألمانيا');
    assert(deDetails.mosques.find(m => m.id === TEST_MOSQUE_1)?.worshippers === 2,
      `مسجد 1: 2 مصلّين (حصل ${deDetails.mosques.find(m => m.id === TEST_MOSQUE_1)?.worshippers})`);
    assert(deDetails.mosques.every(m => typeof m.worshippers === 'number'), 'كل مسجد له عدد مصلّين');

    const frDetails = getCountryArchiveDetails('fr');
    assert(frDetails.mosques.some(m => m.id === TEST_MOSQUE_3), 'مسجد تجريبي 3 في فرنسا');
    assert(getRegionIdForCountry('de') === 'west_europe', 'de → west_europe');

    console.log('\n4) تقرير الأرشيف الإقليمي — صورة + PDF');
    const archive = await renderCountryArchiveReport('west_europe', 'de');
    assert(fs.existsSync(archive.pngPath), 'PNG التقرير وُجد');
    assert(fs.existsSync(archive.pdfPath), 'PDF التقرير وُجد');
    assert(archive.pngSize > 5000, `PNG: ${archive.pngSize} bytes`);
    assert(archive.pdfSize > 1000, `PDF: ${archive.pdfSize} bytes`);
    console.log(`   📁 ${archive.pngPath} (${archive.pngSize} bytes)`);
    console.log(`   📁 ${archive.pdfPath} (${archive.pdfSize} bytes)`);

    console.log('\n5) الرسمان السنويان — 2026');
    const year2026 = getYearlyStats(2026);
    assert(year2026.mosquesMonthly[4] - (yearBefore.mosquesMonthly[4] || 0) >= 2, 'مايو سنوي: +2 مساجد على الأقل');
    assert(year2026.mosquesMonthly[5] - (yearBefore.mosquesMonthly[5] || 0) >= 1, 'يونيو سنوي: +1 مسجد على الأقل');
    const yCharts = await renderYearlyStatsCharts(year2026);
    assert(fs.existsSync(yCharts.mosques.pngPath), 'صورة مساجد سنوية');
    assert(fs.existsSync(yCharts.moderators.pngPath), 'صورة مشرفين سنوية');
    assert(yCharts.mosques.size > 5000, `سنوي مساجد: ${yCharts.mosques.size} bytes`);
    assert(yCharts.moderators.size > 5000, `سنوي مشرفون: ${yCharts.moderators.size} bytes`);
    console.log(`   📁 ${yCharts.mosques.pngPath}`);
    console.log(`   📁 ${yCharts.moderators.pngPath}`);

    console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  } finally {
    cleanup();
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  cleanup();
  console.error('❌', e);
  process.exit(1);
});

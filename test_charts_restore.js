process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const db = require('./src/database');
const { getMonthlyStats, getYearlyStats } = require('./src/services/hierarchicalStatsService');
const { renderMonthlyStatsCharts, renderYearlyStatsCharts } = require('./src/services/statsChartRenderer');
const { renderCountryArchiveReport } = require('./src/services/regionalArchiveRenderer');

const TEST_MOSQUE = 'mosque_charts_restore_test';
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function cleanup() {
  db.deleteMosque(TEST_MOSQUE);
}

(async () => {
  console.log('=== test_charts_restore ===\n');

  console.log('فحص الكود قبل التعديل (ملخص):');
  const handlerSrc = fs.readFileSync('./src/handlers/hierarchicalStats.js', 'utf8');
  assert(handlerSrc.includes('renderMonthlyStatsCharts'), 'handler يستدعي renderMonthlyStatsCharts');
  assert(handlerSrc.includes('renderYearlyStatsCharts'), 'handler يستدعي renderYearlyStatsCharts');
  assert(handlerSrc.includes('renderCountryArchiveReport'), 'handler يستدعي renderCountryArchiveReport');
  assert(handlerSrc.includes('buildMonthlyStatsText'), 'النص الشهري محفوظ');
  assert(handlerSrc.includes('buildYearlyStatsText'), 'النص السنوي محفوظ');

  db.saveMosque(TEST_MOSQUE, {
    name: 'مسجد تجريبي',
    countryCode: 'de',
    active: true,
    approvedAt: '2026-06-03T10:00:00.000Z'
  });

  try {
    console.log('\n1) رسم شهري — مساجد + مشرفون (صورتان)');
    const month = getMonthlyStats('2026-06');
    const mCharts = await renderMonthlyStatsCharts(month);
    assert(fs.existsSync(mCharts.mosques.pngPath), 'PNG مساجد شهري');
    assert(fs.existsSync(mCharts.moderators.pngPath), 'PNG مشرفون شهري');
    assert(mCharts.mosques.size > 5000, `حجم مساجد: ${mCharts.mosques.size}`);
    assert(mCharts.moderators.size > 5000, `حجم مشرفون: ${mCharts.moderators.size}`);
    console.log(`   ${mCharts.mosques.pngPath}`);
    console.log(`   ${mCharts.moderators.pngPath}`);

    console.log('\n2) رسم سنوي — مساجد + مشرفون (صورتان)');
    const year = getYearlyStats(2026);
    const yCharts = await renderYearlyStatsCharts(year);
    assert(fs.existsSync(yCharts.mosques.pngPath), 'PNG مساجد سنوي');
    assert(fs.existsSync(yCharts.moderators.pngPath), 'PNG مشرفون سنوي');
    assert(yCharts.mosques.size > 5000, `حجم سنوي مساجد: ${yCharts.mosques.size}`);
    assert(yCharts.moderators.size > 5000, `حجم سنوي مشرفون: ${yCharts.moderators.size}`);
    console.log(`   ${yCharts.mosques.pngPath}`);
    console.log(`   ${yCharts.moderators.pngPath}`);

    console.log('\n3) أرشيف إقليمي — صورة + PDF');
    const archive = await renderCountryArchiveReport('west_europe', 'de');
    assert(fs.existsSync(archive.pngPath), 'PNG أرشيف');
    assert(fs.existsSync(archive.pdfPath), 'PDF أرشيف');
    assert(archive.pngSize > 5000, `PNG أرشيف: ${archive.pngSize}`);
    assert(archive.pdfSize > 1000, `PDF أرشيف: ${archive.pdfSize}`);
    console.log(`   ${archive.pngPath}`);
    console.log(`   ${archive.pdfPath}`);

    console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  } finally {
    cleanup();
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  cleanup();
  console.error('❌', e.message);
  process.exit(1);
});

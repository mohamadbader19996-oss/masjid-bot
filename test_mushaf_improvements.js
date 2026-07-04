require('dotenv').config();
const fs = require('fs');
const {
  renderMushafPageImage,
  savedMushafPagePath,
  isMushafPageCached
} = require('./src/services/mushafRenderer');

async function testCacheSpeed() {
  console.log('=== TEST 1: cached render speed (page 1) ===');
  const pagePath = savedMushafPagePath(1, 'light');

  if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);
  if (isMushafPageCached(1, 'light')) throw new Error('page 1 light should not be cached after delete');

  const t1 = Date.now();
  const first = await renderMushafPageImage(1, 'light');
  const ms1 = Date.now() - t1;
  if (first.cached) throw new Error('first call should not be cached');
  if (!fs.existsSync(pagePath)) throw new Error('page 1 png not saved to permanent path');
  console.log('First call (puppeteer):', ms1, 'ms | cached:', first.cached, '| path:', pagePath);

  const t2 = Date.now();
  const second = await renderMushafPageImage(1, 'light');
  const ms2 = Date.now() - t2;
  if (!second.cached) throw new Error('second call should be cached (no puppeteer)');
  console.log('Second call (cache hit):', ms2, 'ms | cached:', second.cached);

  if (ms2 >= ms1 / 5) {
    throw new Error('Second call not fast enough: ' + ms2 + 'ms vs first ' + ms1 + 'ms');
  }
  if (ms2 > 500) {
    throw new Error('Cached call took too long: ' + ms2 + 'ms');
  }
  console.log('OK — cache hit is', Math.round(ms1 / Math.max(ms2, 1)), 'x faster');
}

async function main() {
  await testCacheSpeed();
  console.log('\nAll mushaf improvement self-tests passed.');
  console.log('Run prerender smoke test separately: MAX_PAGES=5 node prerenderAllMushafPages.js');
}

main().catch((err) => {
  console.error('SELF-TEST FAILED:', err.message);
  process.exit(1);
});

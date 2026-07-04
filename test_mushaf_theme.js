require('dotenv').config();
const fs = require('fs');
const {
  renderMushafPageImage,
  savedMushafPagePath,
  isMushafPageCached
} = require('./src/services/mushafRenderer');

async function main() {
  console.log('=== TEST: mushaf page 1 — light & dark themes ===');

  for (const theme of ['light', 'dark']) {
    const filePath = savedMushafPagePath(1, theme);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  const light = await renderMushafPageImage(1, 'light');
  const dark = await renderMushafPageImage(1, 'dark');

  const lightPath = savedMushafPagePath(1, 'light');
  const darkPath = savedMushafPagePath(1, 'dark');

  if (!fs.existsSync(lightPath)) throw new Error('missing light png');
  if (!fs.existsSync(darkPath)) throw new Error('missing dark png');

  const lightSize = fs.statSync(lightPath).size;
  const darkSize = fs.statSync(darkPath).size;

  console.log('Light:', lightPath);
  console.log('  size bytes:', lightSize, '| cached after render:', light.cached);
  console.log('Dark:', darkPath);
  console.log('  size bytes:', darkSize, '| cached after render:', dark.cached);

  if (lightSize < 1000 || lightSize > 5_000_000) throw new Error('light png size out of range');
  if (darkSize < 1000 || darkSize > 5_000_000) throw new Error('dark png size out of range');
  if (lightPath === darkPath) throw new Error('light and dark paths must differ');

  const lightCached = await renderMushafPageImage(1, 'light');
  if (!lightCached.cached) throw new Error('second light call should hit cache');

  console.log('\nAll mushaf theme self-tests passed.');
}

main().catch((err) => {
  console.error('SELF-TEST FAILED:', err.message);
  process.exit(1);
});

require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const { renderTajweedMushafPageImage, OUTPUT_DIR } = require('./src/services/tajweedRenderer');

const REFERENCE_SIZE = 132089;
const TOLERANCE = 15000;

async function main() {
  const outputPath = path.join(OUTPUT_DIR, 'page_1_tajweed.png');
  const result = await renderTajweedMushafPageImage(1, outputPath, {
    subtitle: 'صفحة 1 — سورة الفاتحة'
  });

  const size = fs.statSync(outputPath).size;
  const diff = Math.abs(size - REFERENCE_SIZE);

  console.log('Renderer:', result.renderer);
  console.log('Output path:', outputPath);
  console.log('PNG size bytes:', size);
  console.log('Reference size bytes:', REFERENCE_SIZE);
  console.log('Difference bytes:', diff);

  if (result.renderer !== 'renderTajweedPageHtml') {
    throw new Error('Expected renderTajweedPageHtml, got ' + result.renderer);
  }
  if (diff > TOLERANCE) {
    throw new Error('Size differs too much from reference (likely wrong renderer)');
  }

  console.log('Page 1 tajweed mushaf test passed.');
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

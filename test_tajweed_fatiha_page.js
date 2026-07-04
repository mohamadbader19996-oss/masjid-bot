require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const {
  parseTajweedText,
  countSegmentStats,
  renderTajweedPageHtml,
  parseTajweedAyahs
} = require('./src/services/tajweedColors');
const { renderTajweedPageImage, OUTPUT_DIR } = require('./src/services/tajweedRenderer');

function assertUsesTajweedRendererOnly() {
  const rendererSrc = fs.readFileSync(path.join(__dirname, 'src/services/tajweedRenderer.js'), 'utf8');
  const testSrc = fs.readFileSync(__filename, 'utf8');
  if (/require\s*\(\s*['"].*mushafRenderer/.test(rendererSrc)) {
    throw new Error('tajweedRenderer must NOT require mushafRenderer');
  }
  if (/renderMushafPageImage\s*\(/.test(testSrc)) {
    throw new Error('test must NOT call renderMushafPageImage');
  }
  if (!testSrc.includes('renderTajweedPageImage')) {
    throw new Error('test must call renderTajweedPageImage');
  }
  if (!rendererSrc.includes('renderTajweedPageHtml')) {
    throw new Error('tajweedRenderer must call renderTajweedPageHtml');
  }
  console.log('Call chain verified: test → renderTajweedPageImage → renderTajweedPageHtml (NOT mushafRenderer)');
}

async function main() {
  assertUsesTajweedRendererOnly();

  console.log('=== STEP 1: Raw tajweed text — Surah Al-Fatiha (7 ayahs) ===');
  const res = await axios.get('https://api.alquran.cloud/v1/surah/1/quran-tajweed');
  const ayahs = res.data.data.ayahs;
  console.log('Ayah count:', ayahs.length);
  console.log('Has embedded tajweed markup:', ayahs.some((a) => /\[[a-z]/.test(a.text)) ? 'YES' : 'NO');
  console.log('');
  for (const a of ayahs) {
    console.log('--- آية', a.numberInSurah, '---');
    console.log(a.text);
    console.log('');
  }

  console.log('=== STEP 2: parseTajweedText() stats per ayah ===');
  console.log('Ayah | ruleClass | null | total');
  console.log('-----|-----------|------|------');
  const parsedAyahs = parseTajweedAyahs(ayahs);
  for (const ayah of parsedAyahs) {
    const stats = countSegmentStats(ayah.segments);
    console.log(
      String(ayah.numberInSurah).padStart(4),
      '|',
      String(stats.withRule).padStart(9),
      '|',
      String(stats.withoutRule).padStart(4),
      '|',
      stats.total
    );
  }

  console.log('\n=== STEP 3: renderTajweedPageHtml + puppeteer (full page image) ===');
  const html = renderTajweedPageHtml(parsedAyahs, {
    title: 'المصحف المجوّد',
    subtitle: 'صفحة 1 — سورة الفاتحة'
  });
  if (!html.includes('المصحف المجوّد')) throw new Error('HTML missing title');
  if (!html.includes('color:#537FFF')) throw new Error('HTML missing tajweed colors');

  const outputPath = path.join(OUTPUT_DIR, 'page1_fatiha_tajweed.png');
  const result = await renderTajweedPageImage(parsedAyahs, outputPath, {
    title: 'المصحف المجوّد',
    subtitle: 'صفحة 1 — سورة الفاتحة'
  });

  const size = fs.statSync(outputPath).size;
  console.log('Renderer used:', result.renderer);
  console.log('Output path:', outputPath);
  console.log('PNG size bytes:', size);
  if (result.renderer !== 'renderTajweedPageHtml') throw new Error('wrong renderer');
  if (size < 1000) throw new Error('PNG too small');

  console.log('\nAll Fatiha tajweed page tests passed.');
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

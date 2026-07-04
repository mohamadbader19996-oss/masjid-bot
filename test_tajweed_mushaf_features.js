require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const {
  renderTajweedPageHtml,
  fetchTajweedPageAyahs
} = require('./src/services/tajweedColors');
const {
  renderTajweedMushafPageImage,
  tajweedMushafPagePath
} = require('./src/services/tajweedRenderer');
const { getPageVerseRange, getAyah, getTafsirFromSource } = require('./src/services/quranApi');
const { getDifficultWords } = require('./src/services/quranGlossary');
const { showPageTafsir } = require('./src/handlers/quran');

async function testThemesPage1() {
  for (const theme of ['light', 'dark']) {
    const outputPath = tajweedMushafPagePath(1, theme);
    const result = await renderTajweedMushafPageImage(1, outputPath, { theme });
    const size = fs.statSync(outputPath).size;
    const verses = await getPageVerseRange(1);
    const parsedAyahs = await fetchTajweedPageAyahs(verses);
    const html = renderTajweedPageHtml(parsedAyahs, { theme, subtitle: 'صفحة 1' });

    if (result.renderer !== 'renderTajweedPageHtml') {
      throw new Error('Wrong renderer for theme ' + theme);
    }
    if (result.theme !== theme) {
      throw new Error('Expected theme ' + theme + ', got ' + result.theme);
    }
    if (!html.includes('color:#537FFF')) {
      throw new Error('Missing tajweed color in ' + theme + ' HTML');
    }
    if (theme === 'light' && !html.includes('background: #ffffff')) {
      throw new Error('Light theme missing white background');
    }
    if (theme === 'dark' && !html.includes('background: #1a1a1a')) {
      throw new Error('Dark theme missing dark background');
    }
    if (size < 100000) {
      throw new Error('PNG too small for theme ' + theme + ': ' + size);
    }

    console.log('Theme', theme, '| path:', outputPath, '| size:', size, 'bytes');
  }
}

async function testPageGlossary() {
  const verses = await getPageVerseRange(1);
  if (!verses?.length) throw new Error('No verses for page 1');
  let checked = 0;
  for (const { surah, ayah } of verses) {
    const ayahData = await getAyah(surah, ayah);
    if (!ayahData?.text) throw new Error('Missing ayah ' + surah + ':' + ayah);
    const words = await getDifficultWords(surah, ayah, ayahData.text);
    if (!Array.isArray(words)) throw new Error('getDifficultWords failed for ' + surah + ':' + ayah);
    checked++;
  }
  console.log('Glossary OK for', checked, 'ayahs on page 1');
}

async function testPageTafsir() {
  const replies = [];
  const ctx = {
    reply: async (text, opts) => {
      replies.push({ text, opts });
      return {};
    }
  };
  await showPageTafsir(ctx, 1);
  if (!replies.length) throw new Error('showPageTafsir produced no replies');
  const combined = replies.map((r) => r.text).join('\n');
  if (!combined.includes('تفسير — صفحة 1')) {
    throw new Error('Tafsir reply missing page header');
  }
  if (!combined.includes('الفاتحة') && !combined.includes('آية')) {
    throw new Error('Tafsir reply missing ayah content');
  }
  console.log('Tafsir OK | reply parts:', replies.length);
}

async function main() {
  console.log('=== Tajweed mushaf features self-test (page 1) ===\n');
  await testThemesPage1();
  console.log('');
  await new Promise((r) => setTimeout(r, 2000));
  await testPageGlossary();
  await new Promise((r) => setTimeout(r, 2000));
  await testPageTafsir();
  console.log('\nAll tajweed mushaf feature tests passed.');
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

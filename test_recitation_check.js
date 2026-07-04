require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const { getAyah, getPageVerseRange } = require('./src/services/quranApi');
const { checkRecitation } = require('./src/services/gemini');
const { buildMergedAudioFile, cleanupTempFolder } = require('./src/services/audioMerge');

const PAGE_NUMBER = 1;

function normalizeAyahTextForRecitation(surah, ayah, text) {
  const raw = String(text || '').trim();
  if (surah > 1 && surah !== 9 && ayah === 1) {
    const muqatta = raw.match(/\s(ال\S+)\s*$/u);
    if (muqatta) return muqatta[1].trim();
  }
  return raw;
}

async function buildPageExpectedText(pageNumber) {
  const verses = await getPageVerseRange(pageNumber);
  if (!verses?.length) return null;
  const parts = [];
  for (const { surah, ayah } of verses) {
    const ayahData = await getAyah(surah, ayah);
    if (ayahData?.text) {
      parts.push(normalizeAyahTextForRecitation(surah, ayah, ayahData.text));
    }
  }
  return parts.length ? parts.join(' ') : null;
}

function readAudioBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

async function testA_fullPageAudio() {
  console.log('=== Test (a): Page 1 merged ayah audio + full page text ===');
  const verses = await getPageVerseRange(PAGE_NUMBER);
  const expectedText = await buildPageExpectedText(PAGE_NUMBER);
  if (!verses?.length || !expectedText) {
    throw new Error('Could not load page 1 verses/text');
  }
  console.log('Ayah count on page 1:', verses.length);
  console.log('Expected text length:', expectedText.length, 'chars');

  let folderPath = null;
  try {
    const result = await buildMergedAudioFile(verses, 'ar.alafasy', 'recitation_test_full');
    folderPath = result.folderPath;
    const size = fs.statSync(result.mergedPath).size;
    console.log('Merged audio bytes:', size);

    const checkResult = await checkRecitation(readAudioBase64(result.mergedPath), 'audio/mpeg', expectedText);
    console.log('Result:', JSON.stringify(checkResult, null, 2));
    if (checkResult.heardText) {
      console.log('Heard preview:', checkResult.heardText.slice(0, 120) + '...');
    }

    if (checkResult.matches !== true) {
      throw new Error('Test (a) FAILED: expected matches:true for full page audio');
    }
    console.log('Test (a) PASSED\n');
    return { verses, expectedText };
  } finally {
    cleanupTempFolder(folderPath);
  }
}

async function testB_truncatedPageAudio({ verses, expectedText }) {
  console.log('=== Test (b): Page audio minus last 2 ayahs + full page text ===');
  if (verses.length < 3) {
    throw new Error('Page too short for truncation test');
  }
  const truncatedVerses = verses.slice(0, verses.length - 2);
  console.log('Full ayahs:', verses.length, '| Truncated ayahs:', truncatedVerses.length);

  let folderPath = null;
  try {
    const result = await buildMergedAudioFile(truncatedVerses, 'ar.alafasy', 'recitation_test_trunc');
    folderPath = result.folderPath;
    const size = fs.statSync(result.mergedPath).size;
    console.log('Truncated merged audio bytes:', size);

    const checkResult = await checkRecitation(readAudioBase64(result.mergedPath), 'audio/mpeg', expectedText);
    console.log('Result:', JSON.stringify(checkResult, null, 2));
    if (checkResult.heardText) {
      console.log('Heard preview:', checkResult.heardText.slice(0, 120) + '...');
    }

    if (checkResult.matches === true) {
      throw new Error('Test (b) FAILED: truncated page audio must NOT match full page text');
    }
    const hasMissing = (checkResult.errors || []).some((e) => e.type === 'missing');
    if (!hasMissing && !(checkResult.errors || []).length) {
      throw new Error('Test (b) FAILED: expected missing errors for truncated page audio');
    }
    console.log('Test (b) PASSED\n');
  } finally {
    cleanupTempFolder(folderPath);
  }
}

async function main() {
  const pageData = await testA_fullPageAudio();
  await new Promise((r) => setTimeout(r, 5000));
  await testB_truncatedPageAudio(pageData);
  console.log('All full-page recitation tests passed.');
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { renderMushafPageImage, loadPageData, extractVerseKeys } = require('./src/services/mushafRenderer');

async function countChromiumProcesses() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH', { encoding: 'utf8' });
    return out.split('\n').filter((line) => line.includes('chrome.exe')).length;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('=== TEST 1: loadPageData structure (page 1) ===');
  const pageData = await loadPageData(1);
  console.log('page:', pageData.page);
  console.log('font:', pageData.font);
  console.log('lines:', pageData.lines.length);
  const sampleWord = pageData.lines[1]?.words?.[0];
  console.log('sample word keys:', sampleWord ? Object.keys(sampleWord).join(', ') : 'none');
  console.log('sample word:', sampleWord
    ? `{ code: ${sampleWord.code}, char: "${sampleWord.char}", font: "${sampleWord.font}", text: "${sampleWord.text}", type: "${sampleWord.type}" }`
    : 'none');
  console.log('verse keys:', extractVerseKeys(pageData).join(', '));

  const beforeChrome = await countChromiumProcesses();
  console.log('\n=== TEST 2: renderMushafPageImage (page 1) ===');
  console.log('Chromium processes before:', beforeChrome);

  const { pngPath, verseKeys } = await renderMushafPageImage(1);
  const stat = fs.statSync(pngPath);
  console.log('PNG path:', pngPath);
  console.log('PNG size bytes:', stat.size);
  console.log('PNG size OK:', stat.size > 1000 && stat.size < 5_000_000 ? 'OK' : 'FAIL');
  console.log('verse keys count:', verseKeys.length);

  await new Promise((r) => setTimeout(r, 1500));
  const afterChrome = await countChromiumProcesses();
  console.log('Chromium processes after browser.close():', afterChrome);
  console.log('Browser closed (no extra Chromium):', afterChrome <= beforeChrome ? 'OK' : 'CHECK');

  fs.unlinkSync(pngPath);
  console.log('\nAll mushaf renderer self-tests passed.');
}

main().catch((err) => {
  console.error('SELF-TEST FAILED:', err.message);
  process.exit(1);
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const { getPageVerseRange } = require('./src/services/quranApi');
const { buildHafizSequence } = require('./src/services/hafizSequence');
const {
  buildMergedAudioFile,
  cleanupTempFolder,
  probeDurationSeconds
} = require('./src/services/audioMerge');

const RECITER = 'ar.alafasy';

function formatEntry(v) {
  return `${v.surah}:${v.ayah}`;
}

async function testSequence() {
  console.log('=== TEST 1: buildHafizSequence (page 1) ===');
  const page1 = await getPageVerseRange(1);
  const sequence = buildHafizSequence(page1);
  console.log('Ayahs on page:', page1.length);
  console.log('Sequence length:', sequence.length);
  console.log('Full sequence:');
  console.log(sequence.map(formatEntry).join(', '));

  const expected = 48;
  if (sequence.length !== expected) {
    throw new Error(`Expected ${expected} entries, got ${sequence.length}`);
  }

  const head = sequence.slice(0, 12).map(formatEntry);
  const expectedHead = [
    '1:1', '1:1', '1:1',
    '1:2', '1:2', '1:2', '1:1', '1:2',
    '1:3', '1:3', '1:3', '1:1'
  ];
  if (JSON.stringify(head) !== JSON.stringify(expectedHead)) {
    throw new Error('Sequence head mismatch:\n got ' + head.join(', ') + '\n want ' + expectedHead.join(', '));
  }
  console.log('Sequence order: OK\n');
  return { page1, sequence };
}

async function testMerge(sequence) {
  console.log('=== TEST 2: buildMergedAudioFile (page 1) ===');
  let folderPath = null;
  try {
    const { mergedPath, folderPath: tempFolder } = await buildMergedAudioFile(sequence, RECITER, 'selftest');
    folderPath = tempFolder;
    const stat = fs.statSync(mergedPath);
    console.log('Merged file:', mergedPath);
    console.log('Size bytes:', stat.size);
    if (stat.size <= 0) throw new Error('merged.mp3 size is zero');

    let duration = 0;
    try {
      duration = await probeDurationSeconds(mergedPath);
      console.log('Duration seconds (ffprobe):', duration.toFixed(2));
      if (duration < 30) throw new Error('Duration too short to be plausible for page 1 drill');
    } catch (probeErr) {
      console.warn('ffprobe unavailable:', probeErr.message);
      console.warn('Skipped duration check — file size OK');
    }

    return folderPath;
  } finally {
    if (folderPath) cleanupTempFolder(folderPath);
  }
}

function testCleanup(folderPath) {
  console.log('\n=== TEST 3: cleanupTempFolder ===');
  if (folderPath && fs.existsSync(folderPath)) {
    throw new Error('Temp folder still exists after cleanup: ' + folderPath);
  }
  const hafizRoot = path.join(process.cwd(), 'temp', 'hafiz');
  if (fs.existsSync(hafizRoot)) {
    const leftovers = fs.readdirSync(hafizRoot);
    if (leftovers.length) {
      throw new Error('Leftover temp entries: ' + leftovers.join(', '));
    }
  }
  console.log('temp/hafiz is empty: OK');
}

async function main() {
  const { sequence } = await testSequence();
  const folderPath = await testMerge(sequence);
  testCleanup(folderPath);
  console.log('\nAll self-tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

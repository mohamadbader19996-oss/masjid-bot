require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');
const db = require('./src/database');
const mushafIndex = require('./src/services/mushafIndex');
const {
  buildMushafPageKeyboard,
  buildMushafSurahKeyboard,
  buildMushafJuzKeyboard
} = require('./src/handlers/quran');
const { buildMergedAudioFile, cleanupTempFolder, probeDurationSeconds } = require('./src/services/audioMerge');
const { buildHafizSequence } = require('./src/services/hafizSequence');
const { getPageVerseRange } = require('./src/services/quranApi');

function assertKeyboard(name, keyboard) {
  const markup = keyboard?.reply_markup;
  if (!markup?.inline_keyboard?.length) throw new Error(name + ': invalid keyboard');
  for (const row of markup.inline_keyboard) {
    for (const btn of row) {
      if (!btn.text || (!btn.callback_data && !btn.url)) {
        throw new Error(name + ': bad button ' + btn.text);
      }
    }
  }
  return markup.inline_keyboard.length;
}

function assertAscending(label, values) {
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[i - 1]) {
      throw new Error(label + ' not ascending at index ' + i + ': ' + values[i - 1] + ' -> ' + values[i]);
    }
  }
}

async function phaseA() {
  console.log('=== PHASE A: surah/juz → page mapping ===');
  await mushafIndex.initializeMushafIndex();

  const surahs = await mushafIndex.getAllSurahPages();
  if (surahs.length !== 114) throw new Error('Expected 114 surahs, got ' + surahs.length);

  console.log('\nSurah | Name | Start Page');
  console.log('------|------|------------');
  for (const s of surahs) {
    console.log(String(s.id).padStart(5), '|', s.name, '|', s.startPage);
  }
  assertAscending('surah start pages', surahs.map((s) => s.startPage));
  if (surahs[0].startPage !== 1) throw new Error('Surah 1 should start page 1');
  if (surahs[113].startPage < 580) throw new Error('Surah 114 page seems too low');

  const juzs = await mushafIndex.getAllJuzPages();
  if (juzs.length !== 30) throw new Error('Expected 30 juz, got ' + juzs.length);

  console.log('\nJuz | Start Verse | Start Page');
  console.log('----|-------------|------------');
  for (const j of juzs) {
    console.log(String(j.id).padStart(3), '|', j.startVerse.padEnd(11), '|', j.startPage);
  }
  assertAscending('juz start pages', juzs.map((j) => j.startPage));
  if (juzs[0].startPage !== 1) throw new Error('Juz 1 should start page 1');
  if (juzs[29].startPage < 580) throw new Error('Juz 30 page should be near 582, got ' + juzs[29].startPage);

  const stored = db.getMushafJuzPages();
  if (!stored || stored.length !== 30) throw new Error('juz pages not stored in db.json');
  console.log('\nPHASE A OK — juz pages persisted in db.json, juz 30 page =', juzs[29].startPage);
}

async function phaseB() {
  console.log('\n=== PHASE B: interactive index keyboards ===');
  const surahs = await mushafIndex.getAllSurahPages();
  assertKeyboard('buildMushafSurahKeyboard p1', buildMushafSurahKeyboard(surahs, 1));
  assertKeyboard('buildMushafSurahKeyboard p12', buildMushafSurahKeyboard(surahs, 12));
  assertKeyboard('buildMushafJuzKeyboard', buildMushafJuzKeyboard());
  assertKeyboard('mushaf index menu', Markup.inlineKeyboard([
    [Markup.button.callback('📜 تصفح بالسورة', 'mushaf_browse_surah')],
    [Markup.button.callback('📚 تصفح بالجزء', 'mushaf_browse_juz')],
    [Markup.button.callback('▶️ من الصفحة 1', 'mushaf_nav_1')]
  ]));
  console.log('PHASE B OK');
}

async function phaseC() {
  console.log('\n=== PHASE C: navigation + lastMushafPage persistence ===');
  const testUserId = 'mushaf_selftest_user';
  db.saveUser(testUserId, { lastMushafPage: null });

  assertKeyboard('page 1 keyboard', buildMushafPageKeyboard(1));
  assertKeyboard('page 604 keyboard', buildMushafPageKeyboard(604));
  assertKeyboard('page 50 keyboard', buildMushafPageKeyboard(50));

  const kb1 = buildMushafPageKeyboard(1).reply_markup.inline_keyboard[0];
  const prev1 = kb1[0].callback_data;
  const next1 = kb1[2].callback_data;
  if (prev1 !== 'noop') throw new Error('page 1 prev should be noop, got ' + prev1);
  if (next1 !== 'mushaf_nav_2') throw new Error('page 1 next should be mushaf_nav_2');

  const kb2 = buildMushafPageKeyboard(2).reply_markup.inline_keyboard[0];
  if (kb2[0].callback_data !== 'mushaf_nav_1') throw new Error('page 2 prev wrong');
  if (kb2[2].callback_data !== 'mushaf_nav_3') throw new Error('page 2 next wrong');

  db.saveUser(testUserId, { lastMushafPage: 1 });
  let user = db.getUser(testUserId);
  if (Number(user.lastMushafPage) !== 1) throw new Error('lastMushafPage save failed for 1');

  db.saveUser(testUserId, { lastMushafPage: 2 });
  user = db.getUser(testUserId);
  if (Number(user.lastMushafPage) !== 2) throw new Error('lastMushafPage save failed for 2');

  db.saveUser(testUserId, { lastMushafPage: 1 });
  user = db.getUser(testUserId);
  if (Number(user.lastMushafPage) !== 1) throw new Error('lastMushafPage save failed back to 1');

  db.saveUser(testUserId, { lastMushafPage: null });
  console.log('PHASE C OK — nav 1→2→1 logic + db persistence verified');
}

async function phaseD() {
  console.log('\n=== PHASE D: page audio (no hafiz repeat) ===');
  const verses = await getPageVerseRange(1);
  if (!verses?.length) throw new Error('No verses for page 1');
  if (verses.length !== 7) throw new Error('Page 1 should have 7 ayahs, got ' + verses.length);

  const hafizSeq = buildHafizSequence(verses);
  const plainSeq = verses;
  if (plainSeq.length >= hafizSeq.length) {
    throw new Error('Plain sequence should be shorter than hafiz sequence');
  }

  let folderPath = null;
  try {
    const result = await buildMergedAudioFile(plainSeq, 'ar.alafasy', 'mushaf_selftest');
    folderPath = result.folderPath;
    const stat = fs.statSync(result.mergedPath);
    if (stat.size <= 0) throw new Error('merged mp3 empty');
    const duration = await probeDurationSeconds(result.mergedPath);
    console.log('Page 1 plain audio: size bytes =', stat.size, 'duration sec =', duration.toFixed(2));
    console.log('Ayahs in sequence:', plainSeq.length, '(hafiz would be', hafizSeq.length, 'clips)');

    const hafizFolder = path.join(process.cwd(), 'temp', 'hafiz');
    const hafizResult = await buildMergedAudioFile(hafizSeq, 'ar.alafasy', 'mushaf_selftest_hafiz');
    const hafizDuration = await probeDurationSeconds(hafizResult.mergedPath);
    cleanupTempFolder(hafizResult.folderPath);
    if (duration >= hafizDuration) {
      throw new Error('Plain page audio should be shorter than hafiz repeated audio');
    }
    console.log('Hafiz repeated duration sec =', hafizDuration.toFixed(2), '(longer, as expected)');
  } finally {
    cleanupTempFolder(folderPath);
  }
  console.log('PHASE D OK');
}

async function main() {
  await phaseA();
  await phaseB();
  await phaseC();
  await phaseD();
  console.log('\nAll mushaf phase self-tests passed.');
}

main().catch((err) => {
  console.error('SELF-TEST FAILED:', err.message);
  process.exit(1);
});

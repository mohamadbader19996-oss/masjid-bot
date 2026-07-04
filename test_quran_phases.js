process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.ACTION_REGISTRY_SILENT = '1';
require('dotenv').config();

const axios = require('axios');
const db = require('./src/database');
const { getTafsirFromSource, getSurah, TAFSIR_SOURCES } = require('./src/services/quranApi');
const { getDifficultWords, glossaryKey } = require('./src/services/quranGlossary');
const { paginateSurahLines, fetchAyahPlayPayload, SIMPLE_AYAHS_PER_PAGE } = require('./src/handlers/quran');

const ALL_LANGUAGES = [{ code: 'ar', name: 'العربية 🇸🇦', edition: 'ar.alafasy' }];
const RECITERS = [{ id: 'ar.alafasy', name: 'مشاري العفاسي 🇰🇼', rewaya: 'حفص' }];
const TEST_USER = '999999001';

function uniqueTexts(texts) {
  return new Set(texts.filter(Boolean)).size;
}

async function inspectSpa5kJson() {
  console.log('\n=== فحص بنية JSON من spa5k CDN ===');
  const url = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafseer-al-saddi/2/255.json';
  const res = await axios.get(url);
  console.log('URL:', url);
  console.log('JSON keys:', Object.keys(res.data));
  console.log('Full JSON sample:', JSON.stringify(res.data, null, 2).slice(0, 500) + '...');
  console.log('حقل النص: "text" | ayah:', res.data.ayah, '| surah:', res.data.surah);
  return res.data;
}

async function testPhase1() {
  console.log('\n=== المرحلة 1: ثلاثة تفاسير + الميسر لآية 2:255 ===');
  const sources = ['saadi', 'ibnkathir', 'tabari', 'muyassar'];
  const results = {};

  for (const id of sources) {
    results[id] = await getTafsirFromSource(2, 255, id);
    if (!results[id] || results[id].unavailable) {
      console.log(id, '❌ غير متاح');
      return false;
    }
    console.log(id, '- tafsir length:', results[id].tafsirText.length);
  }

  const ayahText = results.saadi.ayahText;
  const allTexts = [ayahText, ...sources.map(id => results[id].tafsirText)];
  const uniqueCount = uniqueTexts(allTexts);
  console.log('عدد النصوص الفريدة (آية + 4 تفاسير):', uniqueCount, '/ 5');
  console.log('ayah vs saadi same?', ayahText === results.saadi.tafsirText ? 'نعم ❌' : 'لا ✅');

  const ok = uniqueCount === 5;
  console.log(ok ? '✅ المرحلة 1 ناجحة' : '❌ المرحلة 1 فاشلة');
  return ok;
}

async function testPhase2() {
  console.log('\n=== المرحلة 2: صوت + تفسير لآية 1:1 ===');
  const payload = await fetchAyahPlayPayload(1, 1, 'ar.alafasy', 'saadi');
  const hasAudio = Boolean(payload.audioUrl && /\.mp3|audio|cdn/i.test(payload.audioUrl));
  const hasTafsir = Boolean(payload.tafsir && !payload.tafsir.unavailable && payload.tafsir.tafsirText);
  console.log('audioUrl:', payload.audioUrl ? payload.audioUrl.slice(0, 80) + '...' : 'null');
  console.log('tafsir length:', payload.tafsir?.tafsirText?.length || 0);
  const ok = hasAudio && hasTafsir;
  console.log(ok ? '✅ المرحلة 2 ناجحة' : '❌ المرحلة 2 فاشلة');
  return ok;
}

async function testPhase3() {
  console.log('\n=== المرحلة 3: كلمات صعبة (112:2 — الصمد) ===');
  const surah = 112;
  const ayah = 2;
  const key = glossaryKey(surah, ayah);
  const ayahText = 'ٱللَّهُ ٱلصَّمَدُ';

  const store = db.get('quran_glossary') || {};
  delete store[key];
  db.set('quran_glossary', store);

  const t0 = Date.now();
  const first = await getDifficultWords(surah, ayah, ayahText);
  const t1 = Date.now();
  console.log('الاستدعاء الأول - items:', first.length, '- ms:', t1 - t0);
  console.log('JSON sample:', JSON.stringify(first.slice(0, 3)));

  const hasSamad = first.some(w => /صمد|الصمد/i.test(w.word));
  console.log('يحتوي "الصمد"?', hasSamad ? '✅' : '⚠️ لم تُذكر صراحة');

  const t2 = Date.now();
  const second = await getDifficultWords(surah, ayah, ayahText);
  const t3 = Date.now();
  console.log('الاستدعاء الثاني - ms:', t3 - t2, '(يجب أن يكون أسرع = كاش)');

  const validJson = Array.isArray(first) && first.every(w => w.word && w.meaning);
  const cacheFaster = (t3 - t2) < (t1 - t0);
  const ok = validJson && cacheFaster;
  console.log(ok ? '✅ المرحلة 3 ناجحة' : '❌ المرحلة 3 فاشلة');
  return ok;
}

async function testPhase4() {
  console.log('\n=== المرحلة 4: الوضع المبسط (5 آيات/صفحة) ===');
  db.saveUser(TEST_USER, { quranSimpleMode: true });

  const surah = await getSurah(2);
  const lang = ALL_LANGUAGES[0];
  const reciter = RECITERS[0];
  const lines = surah.ayahs.map(a => a.numberInSurah + '. ' + a.text);

  const normal = paginateSurahLines(lines, surah, lang, reciter, { simpleMode: false });
  const simple = paginateSurahLines(lines, surah, lang, reciter, { simpleMode: true });

  console.log('صفحات عادية:', normal.pages.length);
  console.log('صفحات مبسطة:', simple.pages.length);
  console.log('آيات/صفحة (مبسط):', SIMPLE_AYAHS_PER_PAGE);

  const expectedMin = Math.ceil(286 / SIMPLE_AYAHS_PER_PAGE);
  const ok = simple.pages.length >= 55 && simple.pages.length > normal.pages.length;
  console.log('متوقع ~', expectedMin, 'صفحة | فعلي:', simple.pages.length);
  console.log('فاصل موجود؟', simple.pages[0].includes('➖➖➖➖➖') ? '✅' : '❌');

  db.saveUser(TEST_USER, { quranSimpleMode: false });
  console.log(ok ? '✅ المرحلة 4 ناجحة' : '❌ المرحلة 4 فاشلة');
  return ok;
}

(async () => {
  const results = { json: false, p1: false, p2: false, p3: false, p4: false };
  try {
    await inspectSpa5kJson();
    results.json = true;
    results.p1 = await testPhase1();
    results.p2 = await testPhase2();
    results.p3 = await testPhase3();
    results.p4 = await testPhase4();
  } catch (e) {
    console.error('خطأ:', e.message);
  }

  console.log('\n═══════════════════════════════════');
  console.log('ملخص الاختبارات الذاتية');
  console.log('═══════════════════════════════════');
  console.log('فحص JSON spa5k:', results.json ? '✅' : '❌');
  console.log('المرحلة 1 (تفاسير):', results.p1 ? '✅' : '❌');
  console.log('المرحلة 2 (صوت+تفسير):', results.p2 ? '✅' : '❌');
  console.log('المرحلة 3 (كلمات صعبة):', results.p3 ? '✅' : '❌');
  console.log('المرحلة 4 (وضع مبسط):', results.p4 ? '✅' : '❌');

  const allOk = Object.values(results).every(Boolean);
  process.exit(allOk ? 0 : 1);
})();

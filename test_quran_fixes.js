process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.ACTION_REGISTRY_SILENT = '1';

const { getTafsir, getSurah } = require('./src/services/quranApi');
const { paginateSurahLines, SURAH_PAGE_CHAR_LIMIT } = require('./src/handlers/quran');

const ALL_LANGUAGES = [{ code: 'ar', name: 'العربية 🇸🇦', edition: 'ar.alafasy' }];
const RECITERS = [{ id: 'ar.alafasy', name: 'مشاري العفاسي 🇰🇼', rewaya: 'حفص' }];

async function testTafsir() {
  console.log('\n=== اختبار getTafsir(2, 255) ===');
  const data = await getTafsir(2, 255);
  if (!data) {
    console.log('❌ فشل: getTafsir أرجعت null');
    return false;
  }
  const same = data.ayahText === data.tafsirText;
  console.log('ayahText length:', data.ayahText?.length);
  console.log('tafsirText length:', data.tafsirText?.length);
  console.log('نفس النص؟', same ? 'نعم ❌' : 'لا ✅');
  console.log('ayahText (أول 80):', (data.ayahText || '').slice(0, 80));
  console.log('tafsirText (أول 80):', (data.tafsirText || '').slice(0, 80));
  return Boolean(data.ayahText && data.tafsirText && !same);
}

async function testPagination() {
  console.log('\n=== اختبار تقسيم سورة البقرة (286 آية) ===');
  const surah = await getSurah(2);
  if (!surah) {
    console.log('❌ فشل جلب سورة 2');
    return false;
  }
  const lang = ALL_LANGUAGES[0];
  const reciter = RECITERS[0];
  const lines = surah.ayahs.map(a => a.numberInSurah + '. ' + a.text);
  const pagination = paginateSurahLines(lines, surah, lang, reciter);
  const pages = pagination.pages;
  const lengths = pages.map(p => p.length);
  const overLimit = pages.filter(p => p.length > SURAH_PAGE_CHAR_LIMIT);
  console.log('عدد الصفحات:', pages.length);
  console.log('أطول صفحة:', Math.max(...lengths), 'حرف');
  console.log('أقصر صفحة:', Math.min(...lengths), 'حرف');
  console.log('صفحات تتجاوز', SURAH_PAGE_CHAR_LIMIT, ':', overLimit.length);
  const ok = pages.length > 1 && pages.length < 100 && overLimit.length === 0;
  console.log(ok ? '✅ التقسيم منطقي' : '❌ التقسيم غير منطقي');
  return ok;
}

(async () => {
  const t1 = await testTafsir();
  const t2 = await testPagination();
  console.log('\n=== النتيجة ===');
  console.log('التفسير:', t1 ? '✅' : '❌');
  console.log('التقسيم:', t2 ? '✅' : '❌');
  process.exit(t1 && t2 ? 0 : 1);
})();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const {
  RECITERS, REWAYAT_ORDER, getFullSurahAudioUrl, verifyFullSurahAudioUrl,
  isFullSurahBlocked, getBlockedSurahRedirect
} = require('./src/services/quranApi');

const SAMPLE_SURAHS = [1, 5, 36, 114];

(async () => {
  console.log('=== اختبار الروايات والقرّاء ===\n');
  console.log('إجمالي القرّاء:', RECITERS.length);
  for (const rewaya of REWAYAT_ORDER) {
    const list = RECITERS.filter(r => r.rewaya === rewaya);
    console.log(`  ${rewaya}: ${list.length}`);
  }

  let failed = 0;
  for (const reciter of RECITERS) {
    console.log(`\n--- ${reciter.name} (${reciter.rewaya}) ---`);
    for (const surah of SAMPLE_SURAHS) {
      if (isFullSurahBlocked(reciter.id, surah)) {
        const alt = getBlockedSurahRedirect(reciter.id);
        console.log(`  surah ${surah}: 🚫 محظورة → ${alt?.name || '?'}`);
        continue;
      }
      const url = getFullSurahAudioUrl(surah, reciter.id);
      const ok = await verifyFullSurahAudioUrl(url);
      console.log(`  surah ${surah}: ${ok ? '✅' : '❌'} ${url}`);
      if (!ok) failed++;
    }
  }

  console.log(`\n=== النتيجة: ${failed} فشل ===`);
  process.exit(failed ? 1 : 0);
})();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const { RECITERS, getFullSurahAudioUrl, verifyFullSurahAudioUrl } = require('./src/services/quranApi');

const warsh = RECITERS.filter(r => r.rewaya === 'ورش');

(async () => {
  console.log(`=== فحص ${warsh.length} قارئ ورش ===\n`);
  if (!warsh.length) {
    console.log('❌ لا يوجد قرّاء ورش');
    process.exit(1);
  }
  let allOk = true;
  for (const reciter of warsh) {
    for (const surah of [1, 5, 36, 114]) {
      const url = getFullSurahAudioUrl(surah, reciter.id);
      const ok = await verifyFullSurahAudioUrl(url);
      console.log(`${reciter.name} | surah ${surah} | ${ok ? '✅' : '❌'} ${url}`);
      if (!ok) allOk = false;
    }
    console.log('');
  }
  process.exit(allOk ? 0 : 1);
})();

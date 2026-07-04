process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const { RECITERS, getFullSurahAudioUrl, verifyFullSurahAudioUrl } = require('./src/services/quranApi');

async function checkReciter(reciter, surahNumber = 1) {
  const url = getFullSurahAudioUrl(surahNumber, reciter.id);
  const ok = await verifyFullSurahAudioUrl(url);
  let headStatus = null;
  if (url) {
    const res = await axios.head(url, { validateStatus: () => true });
    headStatus = res.status;
  }
  console.log(`${reciter.name} | ${reciter.id}`);
  console.log('  URL:', url || 'null');
  console.log('  HEAD status:', headStatus);
  console.log('  verify:', ok ? '✅' : '❌');
  return ok;
}

(async () => {
  console.log(`=== فحص ${RECITERS.length} قارئاً في RECITERS (audio-surah/128/1.mp3) ===\n`);
  const results = [];
  for (const reciter of RECITERS) {
    results.push(await checkReciter(reciter));
    console.log('');
  }
  const allOk = results.every(Boolean);
  console.log('=== النتيجة ===');
  console.log(`نجح ${results.filter(Boolean).length}/${RECITERS.length}`);
  process.exit(allOk ? 0 : 1);
})();

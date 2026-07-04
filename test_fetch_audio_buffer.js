process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { getFullSurahAudioUrl, prepareFullSurahAudio } = require('./src/services/quranApi');

(async () => {
  const tests = [
    ['ar.alafasy', 95],
    ['ar.alafasy', 96],
    ['ar.abdurrashidsufi.khalaf', 1],
    ['ar.abdurrashidsufi.khalaf', 2]
  ];
  let ok = true;
  for (const [id, s] of tests) {
    const url = getFullSurahAudioUrl(s, id);
    const d = await prepareFullSurahAudio(url);
    const info = d
      ? `${d.mode} ${d.size ? Math.round(d.size / 1024) + 'KB' : ''}`
      : 'FAIL';
    console.log(id, 'surah', s, info);
    if (!d) ok = false;
  }
  process.exit(ok ? 0 : 1);
})();

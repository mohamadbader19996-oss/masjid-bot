process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { searchQuran, getSurahs } = require('./src/services/quranApi');

function normalizeSearchMatches(matches, surahNameByNumber) {
  return (matches || [])
    .map((m) => ({
      surah: m.surah?.number,
      ayah: m.numberInSurah,
      surahName: surahNameByNumber.get(m.surah?.number) || m.surah?.name || '',
      text: m.text || ''
    }))
    .filter((m) => m.surah && m.ayah);
}

async function main() {
  const surahs = await getSurahs();
  const surahNameByNumber = new Map(surahs.map((s) => [s.number, s.name]));

  console.log('=== Search: الضالين ===');
  const data = await searchQuran('الضالين');
  const hits = normalizeSearchMatches(data?.matches, surahNameByNumber);
  console.log('Total hits:', hits.length);
  console.log('First 3:', hits.slice(0, 3).map((h) => h.surahName + ' ' + h.surah + ':' + h.ayah));

  const fatiha7 = hits.find((h) => h.surah === 1 && h.ayah === 7);
  if (!fatiha7) {
    console.error('FAIL: expected Al-Fatiha 1:7 in results');
    process.exit(1);
  }
  console.log('Al-Fatiha 1:7 found:', truncate(fatiha7.text));
  if (fatiha7.text.includes('النبيين') || fatiha7.text.includes('تفسير')) {
    console.error('FAIL: result looks like tafsir, not ayah text');
    process.exit(1);
  }
  if (!fatiha7.text.includes('الضالين')) {
    console.error('FAIL: ayah text should contain الضالين');
    process.exit(1);
  }

  console.log('\n=== Search: 1:1 (via ref pattern) ===');
  console.log('Would open surah 1 ayah 1 directly');

  console.log('\nAll search checks passed.');
}

function truncate(t, n = 80) {
  return String(t).slice(0, n) + '…';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

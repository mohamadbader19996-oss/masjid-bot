process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const {
  getPageVerseRange,
  extractVersesFromPageJson,
  countHafizPageDrillSends
} = require('./src/services/quranApi');

function simulateDrillSends(verses) {
  let sends = 0;
  for (let i = 0; i < verses.length; i++) {
    sends += 3;
    if (i > 0) sends += i + 1;
  }
  return sends;
}

async function main() {
  console.log('=== PAGE 1 VERSES ===');
  const page1 = await getPageVerseRange(1);
  console.log(JSON.stringify(page1, null, 2));
  console.log('Count:', page1.length);

  console.log('\n=== PAGE 2 VERSES ===');
  const page2 = await getPageVerseRange(2);
  console.log(JSON.stringify(page2, null, 2));
  console.log('Count:', page2.length);

  const expected1 = countHafizPageDrillSends(page1.length);
  const actual1 = simulateDrillSends(page1);
  console.log('\n=== DRILL SEND COUNT PAGE 1 ===');
  console.log('Ayahs:', page1.length);
  console.log('Expected sends:', expected1);
  console.log('Simulated sends:', actual1);
  console.log('Match:', expected1 === actual1 ? 'YES' : 'NO');

  const perAyah = page1.map((v, i) => {
    const triple = 3;
    const cumulative = i > 0 ? i + 1 : 0;
    return { ...v, sends: triple + cumulative };
  });
  console.log('\nPer-ayah breakdown (page 1):');
  perAyah.forEach(row => console.log(' ', row.surah + ':' + row.ayah, '→', row.sends, 'sends'));

  if (page1[0].surah !== 1 || page1[0].ayah !== 1) {
    console.error('FAIL: page 1 should start at 1:1');
    process.exit(1);
  }
  if (page1[page1.length - 1].surah !== 1 || page1[page1.length - 1].ayah !== 7) {
    console.error('FAIL: page 1 should end at 1:7');
    process.exit(1);
  }
  if (page2[0].surah !== 2 || page2[0].ayah !== 1) {
    console.error('FAIL: page 2 should start at 2:1');
    process.exit(1);
  }
  console.log('\nAll structural checks passed.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

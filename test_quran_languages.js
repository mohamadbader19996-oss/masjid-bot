process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const { ALL_LANGUAGES } = require('./src/services/quranApi');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyEdition(edition) {
  const res = await axios.get(`https://api.alquran.cloud/v1/surah/1/${edition}`, {
    timeout: 30000,
    validateStatus: (s) => s < 500
  });
  if (res.status !== 200) return { ok: false, reason: 'HTTP ' + res.status };
  const ayahs = res.data?.data?.ayahs;
  if (!ayahs?.length) return { ok: false, reason: 'empty' };
  return { ok: true, ayahs: ayahs.length };
}

async function main() {
  console.log('Testing', ALL_LANGUAGES.length, 'Quran translation languages...\n');
  const passed = [];
  const failed = [];

  for (const lang of ALL_LANGUAGES) {
    if (lang.code === 'ar') {
      passed.push({ ...lang, note: 'Arabic original (no translation API)' });
      continue;
    }
    await sleep(350);
    try {
      const result = await verifyEdition(lang.edition);
      if (result.ok) {
        passed.push({ ...lang, ayahs: result.ayahs });
        process.stdout.write('.');
      } else {
        failed.push({ ...lang, reason: result.reason });
        process.stdout.write('x');
      }
    } catch (e) {
      failed.push({ ...lang, reason: e.message });
      process.stdout.write('x');
    }
  }

  console.log('\n\n=== RESULT ===');
  console.log('Total:', ALL_LANGUAGES.length);
  console.log('Passed:', passed.length);
  console.log('Failed:', failed.length);

  if (failed.length) {
    console.log('\nFailed editions:');
    failed.forEach(f => console.log(' -', f.code, f.edition, f.reason));
    process.exit(1);
  }

  console.log('\nSample translations (surah 1, ayah 1):');
  for (const code of ['en', 'fr', 'tr', 'ur', 'id']) {
    const lang = ALL_LANGUAGES.find(l => l.code === code);
    const res = await axios.get(`https://api.alquran.cloud/v1/surah/1/${lang.edition}`, { timeout: 20000 });
    const text = res.data?.data?.ayahs?.[0]?.text || '';
    console.log(` ${lang.name}: ${text.slice(0, 80)}...`);
    await sleep(300);
  }
  console.log('\nAll languages OK.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

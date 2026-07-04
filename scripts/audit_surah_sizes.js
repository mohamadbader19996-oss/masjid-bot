/**
 * يفحص أحجام ملفات كل سورة (GET stream) لاكتشاف سور ناقصة/رديئة
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');

const reciterId = process.argv[2] || 'ar.muhammadanwarshahat';
const base = process.argv[3] || `https://cdn.islamic.network/quran/audio-surah/128/${reciterId}`;

async function getSize(surah) {
  const url = `${base}/${surah}.mp3`;
  try {
    const res = await axios.get(url, {
      timeout: 120000,
      validateStatus: () => true,
      responseType: 'stream'
    });
    if (res.status !== 200) return { surah, status: res.status, bytes: 0 };
    let bytes = 0;
    await new Promise((resolve, reject) => {
      res.data.on('data', (c) => { bytes += c.length; });
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });
    return { surah, status: 200, bytes };
  } catch {
    return { surah, status: 0, bytes: 0 };
  }
}

(async () => {
  console.log(`=== أحجام ${reciterId} ===\n`);
  const results = [];
  for (let s = 1; s <= 114; s++) {
    process.stdout.write(`\r${s}/114...`);
    results.push(await getSize(s));
  }
  console.log('\n');
  const failed = results.filter(r => r.status !== 200);
  const tiny = results.filter(r => r.status === 200 && r.bytes < 100000);
  const small = results.filter(r => r.status === 200 && r.bytes >= 100000 && r.bytes < 500000);
  console.log('سورة 5:', results[4].bytes, 'bytes');
  if (failed.length) console.log('فاشلة:', failed.map(r => r.surah).join(','));
  if (tiny.length) console.log('صغيرة جداً (<100KB):', tiny.map(r => `${r.surah}(${r.bytes})`).join(', '));
  if (small.length) console.log('صغيرة (<500KB):', small.map(r => `${r.surah}(${r.bytes})`).join(', '));
})();

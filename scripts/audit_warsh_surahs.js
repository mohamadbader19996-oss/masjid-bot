/**
 * يفحص كل سورة لقارئ ورش: HEAD status + حجم الملف
 * Usage: node scripts/audit_warsh_surahs.js [reciterId]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');

const BITRATE = 128;
const reciterId = process.argv[2] || 'ar.muhammadanwarshahat';

async function checkSurah(surah) {
  const url = `https://cdn.islamic.network/quran/audio-surah/${BITRATE}/${reciterId}/${surah}.mp3`;
  try {
    const res = await axios.head(url, { timeout: 15000, validateStatus: () => true });
    return {
      surah,
      status: res.status,
      bytes: Number(res.headers['content-length'] || 0)
    };
  } catch {
    return { surah, status: 0, bytes: 0 };
  }
}

(async () => {
  console.log(`=== فحص ${reciterId} (114 سورة) ===\n`);
  const results = [];
  for (let s = 1; s <= 114; s++) {
    results.push(await checkSurah(s));
  }

  const failed = results.filter(r => r.status !== 200);
  const tiny = results.filter(r => r.status === 200 && r.bytes > 0 && r.bytes < 500000);
  const zeroSize = results.filter(r => r.status === 200 && r.bytes === 0);

  const surah5 = results.find(r => r.surah === 5);
  const surah2 = results.find(r => r.surah === 2);
  console.log('سورة 2:', surah2.status, 'bytes:', surah2.bytes);
  console.log('سورة 5:', surah5.status, 'bytes:', surah5.bytes);
  console.log('');

  if (failed.length) {
    console.log(`❌ فاشلة (${failed.length}):`, failed.map(r => r.surah).join(', '));
  } else {
    console.log('✅ كل السور 200');
  }
  if (tiny.length) {
    console.log(`⚠️ ملفات صغيرة جداً (<500KB) (${tiny.length}):`);
    tiny.forEach(r => console.log(`  surah ${r.surah}: ${r.bytes} bytes`));
  }
  if (zeroSize.length) {
    console.log(`⚠️ حجم 0 (${zeroSize.length}):`, zeroSize.map(r => r.surah).join(', '));
  }

  const avg = results.filter(r => r.bytes > 0).reduce((a, r) => a + r.bytes, 0)
    / Math.max(1, results.filter(r => r.bytes > 0).length);
  console.log('\nمتوسط حجم السورة (bytes):', Math.round(avg));
})();

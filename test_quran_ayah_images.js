process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const { getAyahImageUrl, verifyAyahImageUrl } = require('./src/services/quranApi');

async function inspectImage(label, surah, ayah) {
  const url = getAyahImageUrl(surah, ayah);
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    validateStatus: () => true
  });
  const type = res.headers['content-type'] || '';
  const ok = res.status === 200 && type.startsWith('image/');
  console.log(`${label} (${surah}:${ayah})`);
  console.log('  URL:', url);
  console.log('  status:', res.status);
  console.log('  content-type:', type);
  console.log('  bytes:', res.data?.length || 0);
  console.log('  verifyAyahImageUrl:', await verifyAyahImageUrl(surah, ayah) ? '✅' : '❌');
  console.log(ok ? '  ✅ صورة صالحة' : '  ❌ غير صالحة');
  return ok;
}

(async () => {
  console.log('=== فحص صور الآيات (islamic.network CDN) ===\n');
  const r1 = await inspectImage('الفاتحة', 1, 1);
  const r2 = await inspectImage('آية الكرسي', 2, 255);
  const r3 = await inspectImage('سورة الناس', 114, 1);
  console.log('\n=== النتيجة ===');
  console.log('1:1', r1 ? '✅' : '❌');
  console.log('2:255', r2 ? '✅' : '❌');
  console.log('114:1', r3 ? '✅' : '❌');
  process.exit(r1 && r2 && r3 ? 0 : 1);
})();

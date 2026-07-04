/**
 * HEAD لكل سورة 1-114 — يبقي فقط من نجح 114/114
 * Usage: node scripts/filter_complete_reciters.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { RECITERS } = require('../src/services/quranApi');

const BITRATE = 128;

async function headStatus(reciterId, surah) {
  const url = `https://cdn.islamic.network/quran/audio-surah/${BITRATE}/${reciterId}/${surah}.mp3`;
  try {
    const res = await axios.head(url, { timeout: 15000, validateStatus: () => true });
    return res.status;
  } catch {
    return 0;
  }
}

async function verifyAllSurahs(reciterId) {
  const missing = [];
  for (let s = 1; s <= 114; s++) {
    const status = await headStatus(reciterId, s);
    if (status !== 200) missing.push(s);
  }
  return missing;
}

(async () => {
  const candidates = RECITERS.filter(r => r.fullSurah !== false);
  console.log(`=== فحص HEAD 114/114 لـ ${candidates.length} قارئ (استثناء آيات-فقط) ===\n`);
  const complete = [];
  for (const r of candidates) {
    process.stdout.write(`${r.name} ... `);
    const missing = await verifyAllSurahs(r.id);
    if (missing.length === 0) {
      console.log('✅ 114/114');
      complete.push({ id: r.id, name: r.name, rewaya: r.rewaya || 'حفص' });
    } else {
      console.log(`❌ ${114 - missing.length}/114`);
    }
  }
  console.log(`\n=== النتيجة: ${complete.length} قارئاً ===`);
  complete.forEach((r, i) => console.log(`${i + 1}. ${r.name} | ${r.id}`));
  fs.writeFileSync(path.join(__dirname, 'reciters_complete_mushaf.json'), JSON.stringify(complete, null, 2));
})();

/**
 * يتحقق أي قرّاء لديهم 114/114 سورة على CDN (مصحف كامل)
 * Usage: node scripts/verify_full_mushaf.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const { RECITERS } = require('../src/services/quranApi');

const BITRATE = 128;
const CDN_INFO_URL = 'https://cdn.islamic.network/quran/info/by-surah/info.json';
const ISLAMIC_APP_URL = 'https://api.islamic.app/v1/audio/reciters';

function extractReciterSurahs(data) {
  const map = new Map();
  function walk(node, in128 = false) {
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, in128));
      return;
    }
    if (node?.type !== 'directory') return;
    if (node.name === '128') {
      (node.contents || []).forEach(c => walk(c, true));
      return;
    }
    if (in128 && node.name?.startsWith('ar.')) {
      const files = new Set();
      for (const child of node.contents || []) {
        if (child.type === 'file' && /^\d+\.mp3$/.test(child.name)) {
          files.add(parseInt(child.name, 10));
        }
      }
      map.set(node.name, files);
      return;
    }
    (node.contents || []).forEach(c => walk(c, in128));
  }
  walk(data);
  return map;
}

function isCompleteMushaf(files) {
  if (!files || files.size < 114) return { complete: false, count: files?.size || 0, missing: [] };
  const missing = [];
  for (let s = 1; s <= 114; s++) {
    if (!files.has(s)) missing.push(s);
  }
  return { complete: missing.length === 0, count: 114 - missing.length, missing };
}

async function headSurah(id, surah) {
  const url = `https://cdn.islamic.network/quran/audio-surah/${BITRATE}/${id}/${surah}.mp3`;
  const res = await axios.head(url, { timeout: 8000, validateStatus: () => true });
  return res.status;
}

(async () => {
  const [cdnRes, appRes] = await Promise.all([
    axios.get(CDN_INFO_URL),
    axios.get(ISLAMIC_APP_URL)
  ]);
  const surahMap = extractReciterSurahs(cdnRes.data);
  const nameMap = Object.fromEntries((appRes.data?.data || []).map(r => [r.identifier, r.name]));

  console.log(`=== فحص CDN: ${surahMap.size} قارئ ===\n`);

  const completeIds = [];
  for (const [id, files] of surahMap) {
    const { complete } = isCompleteMushaf(files);
    if (complete) completeIds.push(id);
  }
  console.log(`مصحف كامل (114/114 في CDN tree): ${completeIds.length}\n`);

  console.log('=== القائمة الحالية RECITERS ===');
  const kept = [];
  for (const r of RECITERS) {
    const files = surahMap.get(r.id);
    const { complete, count, missing } = isCompleteMushaf(files);
    if (complete) {
      console.log(`✅ ${r.name} | ${r.id}`);
      kept.push(r);
    } else if (!files) {
      console.log(`❌ ${r.name} | ${r.id} | غير موجود على CDN surah`);
    } else {
      console.log(`❌ ${r.name} | ${r.id} | ${count}/114 | ناقص: ${missing.slice(0, 10).join(',')}${missing.length > 10 ? '...' : ''}`);
    }
  }

  console.log(`\n=== بقى من الحالي: ${kept.length}/${RECITERS.length} ===`);

  if (completeIds.length > 0 && completeIds.length <= 30) {
    console.log('\n=== كل القراء بمصحف كامل على CDN ===');
    for (const id of completeIds.sort()) {
      const name = nameMap[id] || id;
      console.log(`${name} | ${id}`);
    }
  } else if (completeIds.length > 30) {
    console.log(`\n(${completeIds.length} قارئاً كاملاً — أول 20)`);
    completeIds.sort().slice(0, 20).forEach(id => console.log(`${nameMap[id] || id} | ${id}`));
  }

  // HEAD spot-check: alafasy surahs 1,2,36,114
  console.log('\n=== HEAD spot-check alafasy ===');
  for (const s of [1, 2, 36, 114]) {
    console.log(`surah ${s}:`, await headSurah('ar.alafasy', s));
  }
  const alafasyFiles = surahMap.get('ar.alafasy');
  console.log('alafasy parsed files:', alafasyFiles?.size, alafasyFiles ? [...alafasyFiles].slice(0, 5) : 'none');
})();

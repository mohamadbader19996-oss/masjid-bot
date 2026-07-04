/**
 * يكتشف قرّاء ورش المجانيين ويتحقق من مصحف كامل 114/114
 * - cdn.islamic.network (128kbps)
 * - cdn.islamic.app (بدون bitrate — جودة أعلى)
 * Usage: node scripts/build_warsh_reciters.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ISLAMIC_APP_URL = 'https://api.islamic.app/v1/audio/reciters';
const WARSH_RE = /warsh|ورش/i;

async function headNetwork(id, surah) {
  const url = `https://cdn.islamic.network/quran/audio-surah/128/${id}/${surah}.mp3`;
  try {
    const res = await axios.head(url, { timeout: 15000, validateStatus: () => true });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function headApp(id, surah) {
  const url = `https://cdn.islamic.app/quran/audio-surah/${id}/${surah}.mp3`;
  try {
    const res = await axios.head(url, { timeout: 15000, validateStatus: () => true });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function verify114(checkFn, id) {
  for (let s = 1; s <= 114; s++) {
    if (!(await checkFn(id, s))) return false;
  }
  return true;
}

(async () => {
  const appRes = await axios.get(ISLAMIC_APP_URL);
  const appList = appRes.data?.data || [];
  const warshApp = appList.filter(r => WARSH_RE.test(`${r.identifier} ${r.name}`));

  console.log(`=== islamic.app ورش (${warshApp.length}) ===`);
  const verified = [];

  for (const r of warshApp) {
    process.stdout.write(`${r.name} [app CDN] ... `);
    if (await verify114(headApp, r.identifier)) {
      console.log('✅ 114/114');
      verified.push({ id: r.identifier, name: r.name.replace(' - ورش', ' (ورش)'), rewaya: 'ورش', surahCdn: 'app' });
    } else {
      console.log('❌');
    }
  }

  // CDN network: معرّفات تحتوي warsh
  const cdnRes = await axios.get('https://cdn.islamic.network/quran/info/by-surah/info.json');
  const networkIds = new Set();
  function walk(node, in128 = false) {
    if (Array.isArray(node)) { node.forEach(n => walk(n, in128)); return; }
    if (node?.type !== 'directory') return;
    if (node.name === '128') { (node.contents || []).forEach(c => walk(c, true)); return; }
    if (in128 && node.name?.startsWith('ar.') && WARSH_RE.test(node.name)) networkIds.add(node.name);
    (node.contents || []).forEach(c => walk(c, in128));
  }
  walk(cdnRes.data);

  for (const id of networkIds) {
    if (verified.some(v => v.id === id)) continue;
    process.stdout.write(`${id} [network CDN] ... `);
    if (await verify114(headNetwork, id)) {
      console.log('✅ 114/114');
      verified.push({ id, name: 'محمد أنور الشحات (ورش)', rewaya: 'ورش' });
    } else {
      console.log('❌');
    }
  }

  console.log(`\n=== النتيجة: ${verified.length} قارئ ورش ===`);
  verified.forEach((r, i) => console.log(`${i + 1}. ${r.name} | ${r.id} | ${r.surahCdn || 'network'}`));

  fs.writeFileSync(path.join(__dirname, 'reciters_warsh_verified.json'), JSON.stringify(verified, null, 2));
  process.exit(verified.length > 0 ? 0 : 1);
})();

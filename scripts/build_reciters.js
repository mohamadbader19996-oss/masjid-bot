/**
 * يبني قائمة RECITERS من مصادر مجانية:
 * - أسماء/معرّفات: https://api.islamic.app/v1/audio/reciters
 * - تحقق CDN: HEAD على audio-surah/128/{id}/1.mp3
 * Usage: node scripts/build_reciters.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ISLAMIC_APP_URL = 'https://api.islamic.app/v1/audio/reciters';
const CDN_INFO_URL = 'https://cdn.islamic.network/quran/info/by-surah/info.json';
const TEST_SURAH = 1;
const BITRATE = 128;
const TARGET = 40;

const WARSH_RE = /warsh|ورش/i;
const PRIORITY = [
  'alafasy', 'sudais', 'husary', 'minshawi', 'shuraym', 'shaatree', 'muaiqly',
  'basit', 'basfar', 'ajamy', 'hudhaify', 'ayyoub', 'jibreel', 'thubaity',
  'budair', 'qasim', 'luhaidan', 'ghamdi', 'rifai', 'akhbar', 'samad', 'kalbani'
];

function extract128Ids(data) {
  const out = new Set();
  function walk(node, in128 = false) {
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, in128));
      return;
    }
    if (node?.type === 'directory') {
      if (node.name === '128') in128 = true;
      else if (in128 && node.name?.startsWith('ar.')) out.add(node.name);
      (node.contents || []).forEach(c => walk(c, in128));
    }
  }
  walk(data);
  return [...out];
}

function fameScore(id, name) {
  const s = `${id} ${name}`.toLowerCase();
  for (let i = 0; i < PRIORITY.length; i++) {
    if (s.includes(PRIORITY[i])) return PRIORITY.length - i;
  }
  return 0;
}

async function headOk(identifier) {
  const url = `https://cdn.islamic.network/quran/audio-surah/${BITRATE}/${identifier}/${TEST_SURAH}.mp3`;
  try {
    const res = await axios.head(url, { timeout: 8000, validateStatus: () => true });
    return { url, status: res.status, ok: res.status === 200 };
  } catch {
    return { url, status: 0, ok: false };
  }
}

(async () => {
  const [appRes, cdnRes] = await Promise.all([
    axios.get(ISLAMIC_APP_URL),
    axios.get(CDN_INFO_URL)
  ]);
  const appList = appRes.data?.data || [];
  const nameMap = Object.fromEntries(appList.map(r => [r.identifier, r.name]));

  console.log(`=== islamic.app: ${appList.length} قارئ ===\n`);

  const cdnIds = extract128Ids(cdnRes.data);
  console.log(`=== CDN audio-surah/128: ${cdnIds.length} معرّف ar.* ===\n`);

  const hafsCandidates = appList.filter(r => {
    const blob = `${r.identifier} ${r.name} ${r.englishName || ''}`;
    return (r.language === 'ar' || r.identifier.startsWith('ar.'))
      && !WARSH_RE.test(blob)
      && (r.audioLevels || []).includes('surah');
  });

  console.log(`=== مرشحون حفص (islamic.app + surah) (${hafsCandidates.length}) ===`);
  hafsCandidates.forEach(e => console.log(`${e.identifier} | ${e.name}`));
  console.log('');

  const verified = [];
  for (const e of hafsCandidates) {
    if (!cdnIds.includes(e.identifier)) continue;
    const check = await headOk(e.identifier);
    if (!check.ok) continue;
    verified.push({
      id: e.identifier,
      name: e.name,
      rewaya: 'حفص',
      head: check.status,
      fame: fameScore(e.identifier, e.name)
    });
  }

  verified.sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name, 'ar'));
  const top = verified.slice(0, TARGET);

  console.log(`=== ناجح HEAD 200: ${verified.length} (هدف ${TARGET}) ===`);
  top.forEach((r, i) => console.log(`${i + 1}. ${r.name} | ${r.id} | HEAD ${r.head}`));
  console.log('');

  let warsh = null;
  const warshCandidates = appList.filter(r => WARSH_RE.test(`${r.identifier} ${r.name}`));
  for (const e of warshCandidates) {
    if (!cdnIds.includes(e.identifier)) continue;
    const check = await headOk(e.identifier);
    if (check.ok) {
      warsh = { id: e.identifier, name: e.name, rewaya: 'ورش', head: check.status };
      console.log(`=== ورش: ${warsh.name} | ${warsh.id} | HEAD ${warsh.head} ===`);
      break;
    }
  }
  if (!warsh) console.log('=== ورش: لا يوجد قارئ ورش مجاني يمر HEAD 200 حالياً ===');

  const outPath = path.join(__dirname, 'reciters_verified.json');
  fs.writeFileSync(outPath, JSON.stringify({ hafs: top, warsh }, null, 2));
  console.log(`\nSaved: ${outPath}`);
  process.exit(top.length > 0 ? 0 : 1);
})();

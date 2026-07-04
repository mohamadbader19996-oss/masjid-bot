/**
 * اكتشاف وتحقق قرّاء كل رواية على CDN
 * Usage: node scripts/discover_riwayat.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CANDIDATES = {
  'حفص': [
    { id: 'ar.husary', name: 'محمود خليل الحصري', cdn: 'network' },
    { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد المرتل', cdn: 'network' }
  ],
  'ورش': [
    { id: 'ar.abdulbasetabdulsamad.warsh', name: 'عبد الباسط عبد الصمد (ورش)', cdn: 'app' },
    { id: 'ar.muhammadanwarshahat', name: 'محمد أنور الشحات (ورش)', cdn: 'network', blockedSurahs: [5], redirectTo: 'ar.abdulbasetabdulsamad.warsh' }
  ],
  'قالون': [
    { id: 'ar.aliabdurrahmanalhuthaifyqaloon', name: 'علي الحذيفي (قالون)', cdn: 'network' }
  ],
  'الدوري': [
    { id: 'ar.abdurrasheedsufiaddoorianabiamr', name: 'عبد الرشيد صوفي (الدوري)', cdn: 'network' },
    { id: 'ar.mahmoudkhalilalhusary.doori', name: 'محمود خليل الحصري (الدوري)', cdn: 'app' },
    { id: 'ar.noreensiddiq.addoori', name: 'نورين محمد صديق (الدوري)', cdn: 'app' }
  ],
  'شعبة': [
    { id: 'ar.abdurrasheedsufishubahanasim', name: 'عبد الرشيد صوفي (شعبة)', cdn: 'network' }
  ],
  'السوسي': [
    { id: 'ar.abdurrasheedsufisoosi', name: 'عبد الرشيد صوفي (السوسي)', cdn: 'network' },
    { id: 'ar.abdurrashidsufi.soosi', name: 'عبد الرشيد صوفي (السوسي)', cdn: 'app' }
  ],
  'خلف': [
    { id: 'ar.abdurrashidsufi.khalaf', name: 'عبد الرشيد صوفي (خلف)', cdn: 'app' }
  ]
};

function urlFor(c, surah) {
  if (c.cdn === 'app') {
    return `https://cdn.islamic.app/quran/audio-surah/${c.id}/${surah}.mp3`;
  }
  return `https://cdn.islamic.network/quran/audio-surah/128/${c.id}/${surah}.mp3`;
}

async function headOk(url) {
  try {
    const res = await axios.head(url, { timeout: 12000, validateStatus: () => true });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function verify114(c) {
  const missing = [];
  for (let s = 1; s <= 114; s++) {
    if (!(await headOk(urlFor(c, s)))) missing.push(s);
  }
  return missing;
}

(async () => {
  const verified = {};
  for (const [rewaya, list] of Object.entries(CANDIDATES)) {
    console.log(`\n=== ${rewaya} ===`);
    verified[rewaya] = [];
    for (const c of list) {
      process.stdout.write(`${c.name} [${c.cdn}] ... `);
      const missing = await verify114(c);
      if (missing.length === 0) {
        console.log('✅ 114/114');
        const entry = { id: c.id, name: c.name, rewaya };
        if (c.cdn === 'app') entry.surahCdn = 'app';
        if (c.blockedSurahs) entry.blockedSurahs = c.blockedSurahs;
        if (c.redirectTo) entry.redirectTo = c.redirectTo;
        verified[rewaya].push(entry);
      } else {
        console.log(`❌ ${114 - missing.length}/114 missing: ${missing.slice(0, 8).join(',')}${missing.length > 8 ? '...' : ''}`);
      }
    }
  }

  const out = path.join(__dirname, 'reciters_by_riwaya.json');
  fs.writeFileSync(out, JSON.stringify(verified, null, 2));
  console.log('\nSaved', out);
})();

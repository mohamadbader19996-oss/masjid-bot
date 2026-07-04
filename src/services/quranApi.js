process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const db = require('../database');

const API_ROOT = 'https://api.alquran.cloud/v1';
const TAFSIR_CDN_ROOT = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir';

const TAFSIR_SOURCES = [
  { id: 'saadi', name: 'السعدي', slug: 'ar-tafseer-al-saddi' },
  { id: 'ibnkathir', name: 'ابن كثير', slug: 'ar-tafsir-ibn-kathir' },
  { id: 'tabari', name: 'الطبري', slug: 'ar-tafsir-al-tabari' },
  { id: 'muyassar', name: 'الميسر', slug: null }
];

const REWAYAT_ORDER = ['حفص', 'ورش', 'قالون', 'الدوري', 'شعبة', 'السوسي', 'خلف'];

const REWAYAT_HEADERS = {
  'حفص': '🌟 ▰▰▰ رواية حفص عن عاصم ▰▰▰ 🌟',
  'ورش': '🌟 ▰▰▰ رواية ورش عن نافع ▰▰▰ 🌟',
  'قالون': '🌟 ▰▰▰ رواية قالون عن نافع ▰▰▰ 🌟',
  'الدوري': '🌟 ▰▰▰ رواية الدوري عن أبي عمرو ▰▰▰ 🌟',
  'شعبة': '🌟 ▰▰▰ رواية شعبة عن عاصم ▰▰▰ 🌟',
  'السوسي': '🌟 ▰▰▰ رواية السوسي عن أبي عمرو ▰▰▰ 🌟',
  'خلف': '🌟 ▰▰▰ رواية خلف عن حمزة ▰▰▰ 🌟'
};

const RECITERS = [
  { id: 'ar.alafasy', name: 'مشاري العفاسي', rewaya: 'حفص' },
  { id: 'ar.yasseraldossari', name: 'ياسر الدوسري', rewaya: 'حفص' },
  { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد المرتل', rewaya: 'حفص' },
  { id: 'ar.abdullahbasfar', name: 'عبد الله بصفر', rewaya: 'حفص' },
  { id: 'ar.abdulbariaththubaity', name: 'عبدالباري الثبيتي', rewaya: 'حفص' },
  { id: 'ar.salahalbudair', name: 'صلح البدير', rewaya: 'حفص' },
  { id: 'ar.muhammadalluhaidan', name: 'محمد اللحيدان', rewaya: 'حفص' },
  { id: 'ar.nabilarrifai', name: 'نبيل الرفاعي', rewaya: 'حفص' },
  { id: 'ar.hamadsinan', name: 'حامد سنان', rewaya: 'حفص' },
  { id: 'ar.sahlyasin', name: 'سهل ياسين', rewaya: 'حفص' },
  { id: 'ar.sadaqatali', name: 'صدقات علي', rewaya: 'حفص' },
  { id: 'ar.abdullahkhayat', name: 'عبدالله خياط', rewaya: 'حفص' },
  { id: 'ar.abdullahawadaljuhani', name: 'عبدالله عواد الجهني', rewaya: 'حفص' },
  { id: 'ar.azizalili', name: 'عزيز عليلى', rewaya: 'حفص' },
  { id: 'ar.imadzuhairhafez', name: 'عماد زهير حافظ', rewaya: 'حفص' },
  { id: 'ar.faresabbad', name: 'فارس عباد', rewaya: 'حفص' },
  { id: 'ar.muhammadalmehysni', name: 'محمد المحيسني', rewaya: 'حفص' },
  { id: 'ar.muhammadabdulkareem', name: 'محمد عبدالكريم', rewaya: 'حفص' },
  { id: 'ar.husary', name: 'محمود خليل الحصري', rewaya: 'حفص', surahCdn: 'app' },
  { id: 'ar.abdulbasetabdulsamad.warsh', name: 'عبد الباسط عبد الصمد (ورش)', rewaya: 'ورش', surahCdn: 'app' },
  { id: 'ar.muhammadanwarshahat', name: 'محمد أنور الشحات (ورش)', rewaya: 'ورش', blockedSurahs: [5], redirectTo: 'ar.abdulbasetabdulsamad.warsh' },
  { id: 'ar.aliabdurrahmanalhuthaifyqaloon', name: 'علي الحذيفي (قالون)', rewaya: 'قالون' },
  { id: 'ar.abdurrasheedsufiaddoorianabiamr', name: 'عبد الرشيد صوفي (الدوري)', rewaya: 'الدوري' },
  { id: 'ar.noreensiddiq.addoori', name: 'نورين محمد صديق (الدوري)', rewaya: 'الدوري', surahCdn: 'app' },
  { id: 'ar.abdurrasheedsufishubahanasim', name: 'عبد الرشيد صوفي (شعبة)', rewaya: 'شعبة' },
  { id: 'ar.abdurrasheedsufisoosi', name: 'عبد الرشيد صوفي (السوسي)', rewaya: 'السوسي' },
  { id: 'ar.abdurrashidsufi.khalaf', name: 'عبد الرشيد صوفي (خلف)', rewaya: 'خلف', surahCdn: 'app' }
];

/** قائمة الترجمات من Al-Quran Cloud — تُحدَّث عبر scripts/sync_quran_languages.js */
const ALL_LANGUAGES = require('../data/quranLanguages.json');

/** أسماء عربية للغات الترجمة الموثوقة — نفس أسلوب الخطبة/التطوع (علم + اسم) */
const QURAN_LANG_AR_NAMES = {
  ar: 'العربية',
  de: 'ألمانية',
  en: 'إنجليزية',
  fr: 'فرنسية',
  es: 'إسبانية',
  tr: 'تركية',
  ur: 'أوردو',
  id: 'إندونيسية',
  fa: 'فارسية',
  ru: 'روسية',
  pt: 'برتغالية',
  zh: 'صينية',
  ms: 'ملايو',
  bn: '\u0628\u0646\u063A\u0627\u0644\u064A\u0629',
  hi: 'هندية',
  ps: 'باشتو',
  ku: 'كردية'
};

let _editionCountByCode;
function editionCountForCode(code) {
  if (!_editionCountByCode) {
    _editionCountByCode = {};
    for (const l of ALL_LANGUAGES) {
      _editionCountByCode[l.code] = (_editionCountByCode[l.code] || 0) + 1;
    }
  }
  return _editionCountByCode[code] || 1;
}

function formatQuranLanguageDisplay(lang) {
  if (!lang) return '🇸🇦 العربية';
  const flag = lang.flag || '🌐';
  const arLabel = QURAN_LANG_AR_NAMES[lang.code];
  if (arLabel) {
    if (editionCountForCode(lang.code) > 1 && lang.translator) {
      const tr = String(lang.translator);
      const short = tr.length > 18 ? tr.slice(0, 16) + '…' : tr;
      return `${flag} ${arLabel} — ${short}`;
    }
    return flag + ' ' + arLabel;
  }
  if (lang.name) return lang.name;
  return flag + ' ' + (lang.label || lang.code);
}

async function getSurahs() {
  try {
    const res = await axios.get(`${API_ROOT}/surah`);
    return res.data?.data || [];
  } catch (e) {
    console.error('getSurahs error:', e.message);
    return [];
  }
}

async function getSurah(number) {
  try {
    const res = await axios.get(`${API_ROOT}/surah/${Number(number)}`);
    return res.data?.data || null;
  } catch (e) {
    console.error('getSurah error:', e.message);
    return null;
  }
}

async function getSurahTranslation(number, edition = 'en.sahih') {
  try {
    const res = await axios.get(`${API_ROOT}/surah/${Number(number)}/${edition}`);
    return res.data?.data || null;
  } catch (e) {
    console.error('getSurahTranslation error:', e.message);
    return null;
  }
}

async function getAyah(surah, ayah) {
  try {
    const res = await axios.get(`${API_ROOT}/ayah/${Number(surah)}:${Number(ayah)}`);
    return res.data?.data || null;
  } catch (e) {
    console.error('getAyah error:', e.message);
    return null;
  }
}

async function getAyahAudio(surah, ayah, reciter = 'ar.alafasy') {
  try {
    const res = await axios.get(`${API_ROOT}/ayah/${Number(surah)}:${Number(ayah)}/${reciter}`);
    return res.data?.data || null;
  } catch (e) {
    console.error('getAyahAudio error:', e.message);
    return null;
  }
}

async function getSurahAudio(number, reciter = 'ar.alafasy') {
  try {
    const res = await axios.get(`${API_ROOT}/surah/${Number(number)}/${reciter}`);
    return res.data?.data || null;
  } catch (e) {
    console.error('getSurahAudio error:', e.message);
    return null;
  }
}

function getFullSurahAudioUrl(surahNumber, reciterId) {
  if (!surahNumber || !reciterId) return null;
  const reciter = RECITERS.find(r => r.id === reciterId);
  if (reciter?.surahCdn === 'app') {
    return `https://cdn.islamic.app/quran/audio-surah/${reciterId}/${Number(surahNumber)}.mp3`;
  }
  return `https://cdn.islamic.network/quran/audio-surah/128/${reciterId}/${Number(surahNumber)}.mp3`;
}

function getRecitersByRewaya(rewaya) {
  return RECITERS.filter(r => r.rewaya === rewaya);
}

function isFullSurahBlocked(reciterId, surahNumber) {
  const reciter = RECITERS.find(r => r.id === reciterId);
  return Boolean(reciter?.blockedSurahs?.includes(Number(surahNumber)));
}

function getBlockedSurahRedirect(reciterId) {
  const reciter = RECITERS.find(r => r.id === reciterId);
  if (!reciter?.redirectTo) return null;
  return RECITERS.find(r => r.id === reciter.redirectTo) || null;
}

async function verifyFullSurahAudioUrl(url) {
  if (!url) return false;
  try {
    const res = await axios.head(url, {
      timeout: 8000,
      validateStatus: (status) => status < 500
    });
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

async function fetchFullSurahAudioBuffer(url, maxBytes = 48 * 1024 * 1024) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      validateStatus: (status) => status === 200
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.error('fetchFullSurahAudioBuffer error:', e.message);
    return null;
  }
}

async function getFullSurahAudioHead(url) {
  if (!url) return null;
  try {
    const res = await axios.head(url, {
      timeout: 15000,
      validateStatus: (status) => status < 500
    });
    if (res.status !== 200) return null;
    const size = parseInt(res.headers['content-length'], 10) || 0;
    return { size, url };
  } catch (e) {
    return null;
  }
}

const TELEGRAM_AUDIO_UPLOAD_MAX = 48 * 1024 * 1024;

async function prepareFullSurahAudio(url) {
  const head = await getFullSurahAudioHead(url);
  if (!head) return null;

  if (head.size > TELEGRAM_AUDIO_UPLOAD_MAX) {
    return { mode: 'too_large', url, size: head.size };
  }

  if (head.size > 0 && head.size <= TELEGRAM_AUDIO_UPLOAD_MAX) {
    const buffer = await fetchFullSurahAudioBuffer(url, TELEGRAM_AUDIO_UPLOAD_MAX);
    if (buffer) return { mode: 'buffer', file: buffer, size: buffer.length };
    return null;
  }

  const buffer = await fetchFullSurahAudioBuffer(url, TELEGRAM_AUDIO_UPLOAD_MAX);
  if (buffer) return { mode: 'buffer', file: buffer, size: buffer.length };

  return { mode: 'url', url, size: head.size };
}

async function getTafsir(surah, ayah) {
  try {
    const ref = `${Number(surah)}:${Number(ayah)}`;
    const [ayahRes, tafsirRes] = await Promise.all([
      axios.get(`${API_ROOT}/ayah/${ref}`),
      axios.get(`${API_ROOT}/ayah/${ref}/ar.muyassar`)
    ]);
    const ayahData = ayahRes.data?.data || null;
    const tafsirData = tafsirRes.data?.data || null;
    if (!ayahData) return null;
    return {
      ayahText: ayahData.text,
      tafsirText: tafsirData?.text || null,
      surah: ayahData.surah || tafsirData?.surah || null
    };
  } catch (e) {
    console.error('getTafsir error:', e.message);
    return null;
  }
}

async function getTafsirFromSource(surah, ayah, sourceId = 'saadi') {
  const source = TAFSIR_SOURCES.find(s => s.id === sourceId) || TAFSIR_SOURCES[0];

  if (source.id === 'muyassar' || !source.slug) {
    const data = await getTafsir(surah, ayah);
    if (!data) return null;
    if (!data.tafsirText) return { unavailable: true, sourceId: 'muyassar' };
    return { ...data, sourceId: 'muyassar' };
  }

  try {
    const [ayahData, tafsirRes] = await Promise.all([
      getAyah(surah, ayah),
      axios.get(`${TAFSIR_CDN_ROOT}/${source.slug}/${Number(surah)}/${Number(ayah)}.json`)
    ]);
    const tafsirText = tafsirRes.data?.text;
    if (!ayahData || !tafsirText) {
      return { unavailable: true, sourceId: source.id };
    }
    return {
      ayahText: ayahData.text,
      tafsirText,
      surah: ayahData.surah,
      sourceId: source.id
    };
  } catch (e) {
    console.error('getTafsirFromSource error:', e.message);
    return { unavailable: true, sourceId: source.id };
  }
}

async function searchQuran(keyword, language = 'ar') {
  try {
    const res = await axios.get(`${API_ROOT}/search/${encodeURIComponent(keyword)}/all/${language}`);
    return res.data?.data || null;
  } catch (e) {
    console.error('searchQuran error:', e.message);
    return null;
  }
}

const AYAH_IMAGE_CDN = 'https://cdn.islamic.network/quran/images';
const MUSHAF_PAGE_BASE = 'https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-';

function expandVerseRange(rangeStr) {
  if (!rangeStr) return [];
  const parts = String(rangeStr).split('-');
  const startParts = parts[0].split(':').map(Number);
  const endParts = (parts[1] || parts[0]).split(':').map(Number);
  const out = [];
  if (startParts[0] === endParts[0]) {
    for (let ayah = startParts[1]; ayah <= endParts[1]; ayah++) {
      out.push({ surah: startParts[0], ayah });
    }
    return out;
  }
  let surah = startParts[0];
  let ayah = startParts[1];
  const endSurah = endParts[0];
  const endAyah = endParts[1];
  while (surah < endSurah || (surah === endSurah && ayah <= endAyah)) {
    out.push({ surah, ayah });
    ayah++;
    if (surah < endSurah && ayah > 200) break;
    if (ayah > 300) {
      ayah = 1;
      surah++;
    }
  }
  return out;
}

function extractVersesFromPageJson(pageJson) {
  const seen = new Set();
  const verses = [];
  for (const line of pageJson?.lines || []) {
    if (line.type !== 'text') continue;
    let batch = [];
    if (line.verseRange) {
      batch = expandVerseRange(line.verseRange);
    }
    if (!batch.length && Array.isArray(line.words)) {
      for (const word of line.words) {
        if (!word.location) continue;
        const [surah, ayah] = word.location.split(':').map(Number);
        if (surah && ayah) batch.push({ surah, ayah });
      }
    }
    for (const v of batch) {
      const key = v.surah + ':' + v.ayah;
      if (seen.has(key)) continue;
      seen.add(key);
      verses.push(v);
    }
  }
  return verses;
}

async function getPageVerseRange(pageNumber) {
  const num = Number(pageNumber);
  if (!Number.isFinite(num) || num < 1 || num > 604) return null;
  const cached = db.getQuranPageCache(num);
  if (cached) return cached;
  const padded = String(num).padStart(3, '0');
  const url = MUSHAF_PAGE_BASE + padded + '.json';
  try {
    const res = await axios.get(url, { timeout: 30000, validateStatus: (s) => s === 200 });
    const verses = extractVersesFromPageJson(res.data);
    if (!verses.length) return null;
    db.setQuranPageCache(num, verses);
    return verses;
  } catch (e) {
    console.error('getPageVerseRange error:', e.message);
    return null;
  }
}

function countHafizPageDrillSends(verseCount) {
  let total = 0;
  for (let i = 0; i < verseCount; i++) {
    total += 3;
    if (i > 0) total += i + 1;
  }
  return total;
}

function getAyahImageUrl(surah, ayah) {
  return `${AYAH_IMAGE_CDN}/${Number(surah)}_${Number(ayah)}.png`;
}

async function verifyAyahImageUrl(surah, ayah) {
  try {
    const res = await axios.get(getAyahImageUrl(surah, ayah), {
      responseType: 'arraybuffer',
      timeout: 8000,
      validateStatus: (status) => status < 500
    });
    return res.status === 200 && String(res.headers['content-type'] || '').startsWith('image/');
  } catch (e) {
    return false;
  }
}

module.exports = {
  getSurahs,
  getSurah,
  getSurahTranslation,
  getAyah,
  getAyahAudio,
  getSurahAudio,
  getFullSurahAudioUrl,
  verifyFullSurahAudioUrl,
  fetchFullSurahAudioBuffer,
  prepareFullSurahAudio,
  getRecitersByRewaya,
  isFullSurahBlocked,
  getBlockedSurahRedirect,
  getTafsir,
  getTafsirFromSource,
  searchQuran,
  getAyahImageUrl,
  verifyAyahImageUrl,
  getPageVerseRange,
  extractVersesFromPageJson,
  countHafizPageDrillSends,
  RECITERS,
  REWAYAT_ORDER,
  REWAYAT_HEADERS,
  ALL_LANGUAGES,
  TAFSIR_SOURCES,
  formatQuranLanguageDisplay,
  TAFSIR_CDN_ROOT,
  AYAH_IMAGE_CDN
};

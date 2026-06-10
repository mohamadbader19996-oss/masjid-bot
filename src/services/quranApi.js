process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');

const API_ROOT = 'https://api.alquran.cloud/v1';

const RECITERS = [
  { id: 'ar.alafasy',            name: 'مشاري العفاسي 🇰🇼',      rewaya: 'حفص' },
  { id: 'ar.abdurrahmaansudais', name: 'عبدالرحمن السديس 🇸🇦',   rewaya: 'حفص' },
  { id: 'ar.husary',             name: 'محمود خليل الحصري 🇪🇬',  rewaya: 'حفص' },
  { id: 'ar.shaatree',           name: 'أبو بكر الشاطري 🇩🇿',    rewaya: 'حفص' },
  { id: 'ar.mahermuaiqly',       name: 'ماهر المعيقلي 🇸🇦',      rewaya: 'حفص' },
  { id: 'ar.saoodshuraym',       name: 'سعود الشريم 🇸🇦',        rewaya: 'حفص' },
  { id: 'ar.minshawi',           name: 'المنشاوي 🇪🇬',           rewaya: 'حفص' },
  { id: 'ar.abdulbasitmurattal', name: 'عبدالباسط عبدالصمد 🇪🇬', rewaya: 'حفص' },
  { id: 'ar.yasseraldosari',     name: 'ياسر الدوسري 🇸🇦',       rewaya: 'حفص' },
  { id: 'ar.warsh',              name: 'ورش عن نافع 🌍',         rewaya: 'ورش' },
];

const ALL_LANGUAGES = [
  { code: 'ar', name: 'العربية 🇸🇦',          edition: 'ar.alafasy' },
  { code: 'de', name: 'Deutsch 🇩🇪',          edition: 'de.bubenheim' },
  { code: 'en', name: 'English 🇬🇧',          edition: 'en.sahih' },
  { code: 'tr', name: 'Türkçe 🇹🇷',           edition: 'tr.ates' },
  { code: 'fr', name: 'Français 🇫🇷',         edition: 'fr.hamidullah' },
  { code: 'ru', name: 'Русский 🇷🇺',          edition: 'ru.kuliev' },
  { code: 'id', name: 'Bahasa Indonesia 🇮🇩', edition: 'id.indonesian' },
  { code: 'ur', name: 'اردو 🇵🇰',             edition: 'ur.jalandhry' },
  { code: 'fa', name: 'فارسی 🇮🇷',            edition: 'fa.ayati' },
  { code: 'es', name: 'Español 🇪🇸',          edition: 'es.cortes' },
  { code: 'zh', name: '中文 🇨🇳',              edition: 'zh.majian' },
  { code: 'ha', name: 'Hausa 🇳🇬',            edition: 'ha.gumi' },
  { code: 'sw', name: 'Swahili 🇰🇪',          edition: 'sw.barwani' },
  { code: 'bn', name: 'বাংলা 🇧🇩',            edition: 'bn.bengali' },
  { code: 'nl', name: 'Nederlands 🇳🇱',       edition: 'nl.keyzer' },
  { code: 'it', name: 'Italiano 🇮🇹',         edition: 'it.piccardo' },
  { code: 'ms', name: 'Melayu 🇲🇾',           edition: 'ms.basmeih' },
  { code: 'sq', name: 'Shqip 🇦🇱',            edition: 'sq.nahi' },
  { code: 'bs', name: 'Bosanski 🇧🇦',         edition: 'bs.korkut' },
  { code: 'az', name: 'Azərbaycan 🇦🇿',       edition: 'az.mammadaliyev' },
  { code: 'ku', name: 'Kurdî 🏳️',             edition: 'ku.asan' },
  { code: 'so', name: 'Soomaali 🇸🇴',         edition: 'so.abduh' },
  { code: 'tg', name: 'Тоҷикӣ 🇹🇯',           edition: 'tg.ayati' },
  { code: 'th', name: 'ภาษาไทย 🇹🇭',          edition: 'th.thai' },
  { code: 'ja', name: '日本語 🇯🇵',             edition: 'ja.japanese' },
  { code: 'ko', name: '한국어 🇰🇷',             edition: 'ko.korean' },
];

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

async function getTafsir(surah, ayah) {
  try {
    const res = await axios.get(`${API_ROOT}/ayah/${Number(surah)}:${Number(ayah)}/ar.muyassar`);
    return res.data?.data || null;
  } catch (e) {
    console.error('getTafsir error:', e.message);
    return null;
  }
}

async function searchQuran(keyword) {
  try {
    const res = await axios.get(`${API_ROOT}/search/${encodeURIComponent(keyword)}/all`);
    return res.data?.data || null;
  } catch (e) {
    console.error('searchQuran error:', e.message);
    return null;
  }
}

module.exports = {
  getSurahs,
  getSurah,
  getSurahTranslation,
  getAyah,
  getAyahAudio,
  getSurahAudio,
  getTafsir,
  searchQuran,
  RECITERS,
  ALL_LANGUAGES
};
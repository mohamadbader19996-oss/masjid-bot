process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const axios = require('axios');
const { getLangMeta } = require('../i18n/languagePickerOptions');

const API_ROOT = 'https://api.alquran.cloud/v1';

const ARABIC_QURAN_LANG = {
  code: 'ar',
  flag: '🇸🇦',
  label: 'العربية',
  edition: 'quran-uthmani',
  translator: 'القرآن الكريم',
  name: '🇸🇦 العربية'
};

/** نفس خريطة الأعلام المستخدمة في languagePickerOptions / تسجيل المتطوعين */
function flagForLanguageCode(code) {
  return getLangMeta(code).flag;
}

function labelForLanguageCode(code) {
  return getLangMeta(code).label;
}

function buildLanguageEntryFromEdition(edition) {
  const code = edition.language;
  const flag = flagForLanguageCode(code);
  const langLabel = labelForLanguageCode(code);
  const translator = edition.name || edition.englishName || '';
  const label = translator ? `${langLabel} — ${translator}` : langLabel;
  return {
    code,
    flag,
    label,
    edition: edition.identifier,
    translator,
    name: `${flag} ${label}`
  };
}

async function fetchTranslationEditionsFromApi() {
  const res = await axios.get(`${API_ROOT}/edition`, {
    params: { format: 'text', type: 'translation' },
    timeout: 60000
  });
  const editions = res.data?.data;
  if (!Array.isArray(editions)) {
    throw new Error('Invalid API response for translation editions');
  }
  return editions;
}

function buildTranslationLanguagesFromEditions(editions) {
  return editions
    .slice()
    .sort((a, b) => {
      const langCmp = a.language.localeCompare(b.language);
      if (langCmp !== 0) return langCmp;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    })
    .map(buildLanguageEntryFromEdition);
}

async function buildAllLanguagesFromApi() {
  const editions = await fetchTranslationEditionsFromApi();
  return [ARABIC_QURAN_LANG, ...buildTranslationLanguagesFromEditions(editions)];
}

module.exports = {
  ARABIC_QURAN_LANG,
  flagForLanguageCode,
  labelForLanguageCode,
  buildLanguageEntryFromEdition,
  fetchTranslationEditionsFromApi,
  buildTranslationLanguagesFromEditions,
  buildAllLanguagesFromApi
};

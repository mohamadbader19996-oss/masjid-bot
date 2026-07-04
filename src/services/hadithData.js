const fs = require('fs');
const path = require('path');
const { askGemini } = require('./gemini');
const { getUiLangDisplayName } = require('../i18n/languagePickerOptions');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'hadith_books.json');
const EDITIONS_INDEX_FILE = path.join(__dirname, '..', '..', 'data', 'hadith_editions_index.json');
const EDITIONS_CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'hadith_editions');
const GEMINI_CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'hadith_gemini_cache.json');

const BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];

const BOOK_LABELS = {
  bukhari: 'صحيح البخاري',
  muslim: 'صحيح مسلم',
  abudawud: 'سنن أبي داود',
  tirmidhi: 'جامع الترمذي',
  nasai: 'سنن النسائي',
  ibnmajah: 'سنن ابن ماجه'
};

const UI_LANG_TO_EDITION_PREFIX = {
  en: 'eng',
  ur: 'urd',
  fr: 'fra',
  tr: 'tur',
  ru: 'rus',
  bn: 'ben',
  id: 'ind'
};

let booksCache = null;
let editionsIndexCache = null;
let geminiCache = null;

function loadHadithBooks() {
  if (booksCache) return booksCache;
  try {
    booksCache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    booksCache = {};
  }
  return booksCache;
}

function loadEditionsIndex() {
  if (editionsIndexCache) return editionsIndexCache;
  try {
    editionsIndexCache = JSON.parse(fs.readFileSync(EDITIONS_INDEX_FILE, 'utf8'));
  } catch {
    editionsIndexCache = {};
  }
  return editionsIndexCache;
}

function loadGeminiCache() {
  if (geminiCache) return geminiCache;
  try {
    geminiCache = JSON.parse(fs.readFileSync(GEMINI_CACHE_FILE, 'utf8'));
  } catch {
    geminiCache = {};
  }
  return geminiCache;
}

function saveGeminiCache() {
  fs.mkdirSync(path.dirname(GEMINI_CACHE_FILE), { recursive: true });
  fs.writeFileSync(GEMINI_CACHE_FILE, JSON.stringify(geminiCache, null, 2), 'utf8');
}

function getBookLabel(book) {
  return BOOK_LABELS[book] || book;
}

function getBook(book) {
  const data = loadHadithBooks();
  return data[book] || null;
}

function findHadith(book, hadithnumber) {
  const entry = getBook(book);
  if (!entry?.hadiths) return null;
  const num = Number(hadithnumber);
  return entry.hadiths.find((h) => Number(h.hadithnumber) === num) || null;
}

function isWeakHadith(hadith) {
  if (!hadith?.grades?.length) return false;
  return hadith.grades.some((g) => /daif/i.test(String(g.grade || '')));
}

function getWeakHadiths(book) {
  const entry = getBook(book);
  if (!entry?.hadiths) return [];
  return entry.hadiths.filter(isWeakHadith);
}

function getEditionPrefixForUiLang(uiLang) {
  if (!uiLang || uiLang === 'ar') return null;
  return UI_LANG_TO_EDITION_PREFIX[uiLang] || null;
}

function getOfficialEditionKey(book, uiLang) {
  const prefix = getEditionPrefixForUiLang(uiLang);
  if (!prefix) return null;
  const editionKey = `${prefix}-${book}`;
  const editions = loadEditionsIndex();
  const collection = editions[book]?.collection || [];
  const found = collection.find((item) => item.name === editionKey);
  return found ? editionKey : null;
}

function getEditionCachePath(editionKey) {
  return path.join(EDITIONS_CACHE_DIR, `${editionKey}.json`);
}

async function loadOfficialEdition(editionKey) {
  const cachePath = getEditionCachePath(editionKey);
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  const url = `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${editionKey}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${editionKey}`);
  const data = await res.json();
  fs.mkdirSync(EDITIONS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data), 'utf8');
  console.log(`[hadithData] cached official edition ${editionKey}`);
  return data;
}

async function getOfficialTranslation(book, hadithnumber, uiLang) {
  const editionKey = getOfficialEditionKey(book, uiLang);
  if (!editionKey) return null;
  const edition = await loadOfficialEdition(editionKey);
  const num = Number(hadithnumber);
  const match = (edition.hadiths || []).find((h) => Number(h.hadithnumber) === num);
  return match?.text?.trim() || null;
}

async function ensureGeminiTranslation(book, hadith, uiLang) {
  const cacheKey = `${book}:${hadith.hadithnumber}:${uiLang}`;
  const cache = loadGeminiCache();
  if (cache[cacheKey]) return cache[cacheKey];

  const langName = getUiLangDisplayName(uiLang);
  const prompt =
    `Translate the following hadith text to ${langName}. ` +
    'Return ONLY the translation, no commentary or markdown.\n\n' +
    hadith.text;

  const response = await askGemini(
    prompt,
    'You translate Islamic hadith text accurately. Return plain translation only.'
  );
  const translated = String(typeof response === 'string' ? response : response?.text || '').trim();
  cache[cacheKey] = translated;
  geminiCache = cache;
  saveGeminiCache();
  console.log(`[hadithData] Gemini cached ${cacheKey}`);
  return translated;
}

async function getHadithTranslation(book, hadith, uiLang) {
  if (!uiLang || uiLang === 'ar') return null;
  const official = await getOfficialTranslation(book, hadith.hadithnumber, uiLang);
  if (official) return { text: official, source: 'official' };
  const gemini = await ensureGeminiTranslation(book, hadith, uiLang);
  return { text: gemini, source: 'gemini' };
}

function formatGrades(hadith) {
  if (!hadith?.grades?.length) return '—';
  return hadith.grades
    .map((g) => `${g.name || '—'}: ${g.grade || '—'}`)
    .join('\n');
}

function stripDiacritics(str) {
  return String(str || '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[ـ]/g, '')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchHadithsInAllBooks(query) {
  const q = stripDiacritics(query);
  if (!q) return [];
  const results = [];
  for (const book of BOOKS) {
    const entry = getBook(book);
    if (!entry?.hadiths) continue;
    for (const hadith of entry.hadiths) {
      if (stripDiacritics(hadith.text).includes(q)) {
        results.push({ book, hadith });
      }
    }
  }
  return results;
}

function collectUniqueGrades() {
  const grades = new Set();
  const data = loadHadithBooks();
  for (const book of BOOKS) {
    for (const hadith of data[book]?.hadiths || []) {
      for (const g of hadith.grades || []) {
        if (g.grade) grades.add(g.grade);
      }
    }
  }
  return [...grades].sort();
}

function hasHadithText(hadith) {
  return Boolean(String(hadith?.text || '').trim());
}

function findHadithArrayIndex(book, hadithnumber) {
  const entry = getBook(book);
  if (!entry?.hadiths) return null;
  const num = Number(hadithnumber);
  const idx = entry.hadiths.findIndex((h) => Number(h.hadithnumber) === num);
  return idx === -1 ? null : idx + 1;
}

function findNextNonEmptyIndex(list, startIndex1Based, direction = 1, maxAttempts = 200) {
  let i = startIndex1Based;
  let attempts = 0;
  while (attempts < maxAttempts) {
    if (i < 1 || i > list.length) return null;
    if (hasHadithText(list[i - 1])) return i;
    i += direction;
    attempts += 1;
  }
  return null;
}

function findFirstNonEmptyIndex(list) {
  return findNextNonEmptyIndex(list, 1, 1);
}

function findFirstNonEmptyInSection(book, sectionId) {
  const entry = getBook(book);
  const details = entry?.metadata?.section_details?.[String(sectionId)];
  if (!details || !entry?.hadiths) return null;
  const first = Number(details.hadithnumber_first);
  const last = Number(details.hadithnumber_last);
  for (const hadith of entry.hadiths) {
    const num = Number(hadith.hadithnumber);
    if (num >= first && num <= last && hasHadithText(hadith)) {
      return findHadithArrayIndex(book, hadith.hadithnumber);
    }
  }
  return null;
}

function getSectionIds(book) {
  const sections = getBook(book)?.metadata?.sections;
  if (!sections) return [];
  return Object.keys(sections).sort((a, b) => Number(a) - Number(b));
}

function saveBookFields(book, fields) {
  const data = loadHadithBooks();
  if (!data[book]) data[book] = {};
  Object.assign(data[book], fields);
  booksCache = data;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 0), 'utf8');
}

function parseSectionTranslationJson(raw, expectedLen) {
  const trimmed = String(raw || '').trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed || typeof parsed !== 'object') return null;
  const keys = Object.keys(parsed);
  if (keys.length !== expectedLen) return null;
  const out = {};
  for (const key of keys) {
    out[key] = String(parsed[key] || '').trim();
  }
  return out;
}

async function ensureTranslatedSections(book) {
  const entry = getBook(book);
  const sections = entry?.metadata?.sections;
  if (!sections) return {};
  const sectionIds = Object.keys(sections);
  const existing = entry.translatedSections || {};
  const missing = sectionIds.filter((id) => !existing[id]);
  if (!missing.length) return existing;

  const payload = {};
  for (const id of missing) {
    payload[id] = sections[id];
  }

  const prompt =
    'Translate the following Islamic hadith book section titles from English to Arabic. ' +
    'Return JSON object only with the same keys, each value is the Arabic title only. ' +
    'Use standard Islamic terminology (e.g. "The Book of Faith" → "كتاب الإيمان").\n\n' +
    JSON.stringify(payload, null, 2);

  const response = await askGemini(
    prompt,
    'You translate Islamic book section titles accurately. Return valid JSON object only, no markdown.'
  );
  const raw = typeof response === 'string' ? response : response?.text || '';
  let translated;
  try {
    translated = parseSectionTranslationJson(raw, missing.length);
  } catch (e) {
    console.error('[hadithData] section translation parse error:', e.message);
    translated = null;
  }
  if (!translated) {
    translated = {};
    for (const id of missing) {
      translated[id] = sections[id];
    }
  }

  const merged = { ...existing, ...translated };
  saveBookFields(book, { translatedSections: merged });
  console.log(`[hadithData] cached translatedSections for ${book} (${missing.length} new)`);
  return merged;
}

function getSectionDisplayName(book, sectionId, translatedSections) {
  const entry = getBook(book);
  const id = String(sectionId);
  return translatedSections?.[id]
    || entry?.metadata?.sections?.[id]
    || id;
}

function searchHadithsInBook(book, query) {
  const q = stripDiacritics(query);
  if (!q) return [];
  const entry = getBook(book);
  if (!entry?.hadiths) return [];
  const results = [];
  for (const hadith of entry.hadiths) {
    if (!hasHadithText(hadith)) continue;
    if (stripDiacritics(hadith.text).includes(q)) {
      results.push({ book, hadith });
    }
  }
  return results;
}

module.exports = {
  BOOKS,
  BOOK_LABELS,
  getBookLabel,
  loadHadithBooks,
  getBook,
  findHadith,
  isWeakHadith,
  getWeakHadiths,
  getHadithTranslation,
  formatGrades,
  stripDiacritics,
  searchHadithsInAllBooks,
  searchHadithsInBook,
  collectUniqueGrades,
  hasHadithText,
  findHadithArrayIndex,
  findNextNonEmptyIndex,
  findFirstNonEmptyIndex,
  findFirstNonEmptyInSection,
  getSectionIds,
  ensureTranslatedSections,
  getSectionDisplayName,
  saveBookFields,
  DATA_FILE
};

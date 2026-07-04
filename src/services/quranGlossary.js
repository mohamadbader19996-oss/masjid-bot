const db = require('../database');
const { askGemini } = require('./gemini');

function glossaryKey(surah, ayah) {
  return `${Number(surah)}_${Number(ayah)}`;
}

function parseGlossaryJson(raw) {
  const trimmed = String(raw || '').trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(item => item && typeof item.word === 'string' && typeof item.meaning === 'string')
    .map(item => ({ word: item.word.trim(), meaning: item.meaning.trim() }))
    .filter(item => item.word && item.meaning);
}

async function getDifficultWords(surah, ayah, ayahText) {
  const key = glossaryKey(surah, ayah);
  const store = db.get('quran_glossary') || {};

  if (store[key]) {
    console.log('[quranGlossary] cache hit for', key);
    return store[key];
  }

  console.log('[quranGlossary] cache miss, calling Gemini for', key);
  const prompt =
    'حدد 2 إلى 5 كلمات غريبة أو قديمة في هذه الآية القرآنية فقط: ' +
    ayahText +
    '، واشرح كل كلمة بجملة عربية مبسطة قصيرة لا تتجاوز 12 كلمة. ' +
    'أرجع JSON فقط بدون أي نص إضافي بالشكل: [{"word":"...","meaning":"..."}]';

  const response = await askGemini(
    prompt,
    'أنت مساعد لغوي متخصص في غريب القرآن. أرجع JSON صالحاً فقط بدون markdown أو شرح إضافي.'
  );
  const raw = typeof response === 'string' ? response : response?.text || '';

  let words = [];
  try {
    words = parseGlossaryJson(raw);
  } catch (e) {
    console.error('[quranGlossary] parse error:', e.message);
    words = [];
  }

  store[key] = words;
  db.set('quran_glossary', store);
  console.log('[quranGlossary] saved to cache for', key, '- items:', words.length);
  return words;
}

module.exports = { getDifficultWords, glossaryKey, parseGlossaryJson };

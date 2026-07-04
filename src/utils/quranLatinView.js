const QURAN_TRANSLITERATION = require('../data/quranTransliteration');
const { escapeHtml } = require('./escapeHtml');

const LATIN_SURAH_LABELS = {
  1: 'الفاتحة',
  112: 'الإخلاص',
  113: 'الفلق',
  114: 'الناس'
};

function hasLatinSurah(surahNumber) {
  return Object.prototype.hasOwnProperty.call(QURAN_TRANSLITERATION, String(surahNumber))
    || Object.prototype.hasOwnProperty.call(QURAN_TRANSLITERATION, surahNumber);
}

function getLatinAyahLine(surahNumber, ayahNumber) {
  const lines = QURAN_TRANSLITERATION[surahNumber];
  if (!lines || ayahNumber < 1 || ayahNumber > lines.length) return null;
  return lines[ayahNumber - 1];
}

function getLatinSurahAyahCount(surahNumber) {
  const lines = QURAN_TRANSLITERATION[surahNumber];
  return lines ? lines.length : 0;
}

function buildLatinAyahHtml(surahNumber, ayahNumber, arabicText, translationText) {
  const latin = getLatinAyahLine(surahNumber, ayahNumber);
  let text = `<b>الآية ${ayahNumber}</b>\n\n`;
  text += `📜 ${escapeHtml(arabicText)}\n\n`;
  if (latin) {
    text += `🔤 <i>${escapeHtml(latin)}</i>`;
  }
  if (translationText) {
    text += `\n\n💬 ${escapeHtml(translationText)}`;
  }
  return text;
}

function buildLatinFullSurahHtml(surahNumber, ayahTexts) {
  const name = LATIN_SURAH_LABELS[surahNumber] || String(surahNumber);
  let text = `<b>سورة ${escapeHtml(name)}</b>\n\n`;
  const count = getLatinSurahAyahCount(surahNumber);
  for (let a = 1; a <= count; a++) {
    const arabic = ayahTexts[a] || '—';
    const latin = getLatinAyahLine(surahNumber, a) || '';
    text += `<b>${a}.</b> ${escapeHtml(arabic)}\n<i>${escapeHtml(latin)}</i>\n\n`;
  }
  return text.trim();
}

module.exports = {
  QURAN_TRANSLITERATION,
  LATIN_SURAH_LABELS,
  hasLatinSurah,
  getLatinAyahLine,
  getLatinSurahAyahCount,
  buildLatinAyahHtml,
  buildLatinFullSurahHtml
};

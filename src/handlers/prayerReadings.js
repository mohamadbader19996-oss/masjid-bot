const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const { askGemini } = require('../services/gemini');
const { getUiLangDisplayName } = require('../i18n/languagePickerOptions');
const sendOrEdit = require('../utils/sendOrEdit');
const { escapeHtml } = require('../utils/escapeHtml');
const { getCurrentReciter } = require('../utils/quranReciter');
const { playSurahAudio } = require('../utils/quranSurahAudio');
const { getAyahAudio } = require('../services/quranApi');
const PRAYER_READINGS = require('../data/prayerReadings');
const PRAYER_READINGS_MEANINGS = require('../data/prayerReadingsMeanings');

const READING_IDS = PRAYER_READINGS.map((r) => r.id);

function getUserUiLang(ctx) {
  const user = db.getUser(ctx.from.id);
  const lang = user?.uiLang || ctx.session?.uiLang || 'ar';
  return lang === 'ar' || !lang ? 'ar' : lang;
}

function getReadingById(id) {
  return PRAYER_READINGS.find((r) => r.id === id);
}

function readingIndex(id) {
  return READING_IDS.indexOf(id);
}

async function ensureReadingTranslation(id, lang) {
  if (lang === 'ar') {
    return PRAYER_READINGS_MEANINGS[id] || '';
  }

  const cached = db.getPrayerReadingTranslation(id, lang);
  if (cached) return cached;

  const arabicMeaning = PRAYER_READINGS_MEANINGS[id] || '';
  const item = getReadingById(id);
  const langName = getUiLangDisplayName(lang);
  const prompt =
    `Translate the following Arabic meaning of a prayer dhikr (${item?.title || id}) to ${langName}. ` +
    'Return only the translation text, no markdown, no quotes.\n\n' +
    arabicMeaning;

  const response = await askGemini(
    prompt,
    'You translate Islamic prayer meanings accurately and simply for new Muslims. Return plain text only.'
  );
  const text = String(typeof response === 'string' ? response : response?.text || '').trim();
  const translation = text || arabicMeaning;
  db.setPrayerReadingTranslation(id, lang, translation);
  console.log(`[prayerReadings] cached translation for ${id} lang=${lang}`);
  return translation;
}

function buildReadingKeyboard(id) {
  const item = getReadingById(id);
  const idx = readingIndex(id);
  const rows = [];
  const nav = [];
  if (idx > 0) {
    nav.push(Markup.button.callback('◀️ السابق', `reading_${READING_IDS[idx - 1]}`));
  }
  if (idx < READING_IDS.length - 1) {
    nav.push(Markup.button.callback('▶️ التالي', `reading_${READING_IDS[idx + 1]}`));
  }
  if (nav.length) rows.push(nav);
  if (item?.audioRef) {
    rows.push([Markup.button.callback('🎧 استمع', `latin_audio_${id}`)]);
  }
  rows.push([Markup.button.callback('🔙 رجوع للقائمة', 'prayer_readings_menu')]);
  return Markup.inlineKeyboard(rows);
}

async function formatReadingMessage(item, meaning, lang) {
  let text = `<b>${escapeHtml(item.title)}</b>\n\n`;
  text += `📜 <b>النص العربي:</b>\n${escapeHtml(item.arabic)}\n\n`;
  text += `🔤 <b>النطق:</b>\n<i>${escapeHtml(item.transliteration)}</i>\n\n`;
  text += `💬 <b>المعنى:</b>\n${escapeHtml(meaning)}`;
  if (item.repeat) text += `\n\n🔁 ${item.repeat} مرات`;
  if (item.note) text += `\n\n💡 <i>${escapeHtml(item.note)}</i>`;
  return text;
}

async function handlePrayerReadingsMenu(ctx) {
  const rows = PRAYER_READINGS.map((item) => [
    Markup.button.callback(item.title, `reading_${item.id}`)
  ]);
  const text = '<b>📖 قراءة الصلاة — النص العربي والنطق والمعنى</b>\n\nاختر الذكر أو القراءة:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows), 'HTML');
}

async function handlePrayerReading(ctx, id) {
  const item = getReadingById(id);
  if (!item) {
    return ctx.answerCbQuery('❌ غير موجود', { show_alert: true }).catch(() => {});
  }

  const lang = getUserUiLang(ctx);
  let meaning;
  try {
    meaning = await ensureReadingTranslation(id, lang);
  } catch (e) {
    console.error('[prayerReadings] translation failed:', e.message);
    meaning = PRAYER_READINGS_MEANINGS[id] || '—';
  }

  const text = await formatReadingMessage(item, meaning, lang);
  return sendOrEdit(ctx, text, buildReadingKeyboard(id), 'HTML');
}

async function handleLatinAudio(ctx, id) {
  await ctx.answerCbQuery('⏳ جاري التحميل...').catch(() => {});
  const item = getReadingById(id);
  if (!item?.audioRef) {
    return ctx.answerCbQuery('❌ لا يتوفر صوت لهذا الذكر', { show_alert: true }).catch(() => {});
  }
  const reciter = getCurrentReciter(ctx);
  const { surah, ayahStart, ayahEnd } = item.audioRef;

  if (ayahStart !== ayahEnd) {
    return playSurahAudio(ctx, surah);
  }

  const audio = await getAyahAudio(surah, ayahStart, reciter.id);
  if (!audio?.audio) {
    return ctx.reply('❌ الصوت غير متاح لهذه الآية بهذا القارئ.');
  }
  return ctx.replyWithAudio(audio.audio, { caption: '🎙️ ' + reciter.name });
}

registry.registerAction('prayer_readings_menu', handlePrayerReadingsMenu, 'قائمة قراءة الصلاة');
registry.registerAction(/^reading_(.+)$/, (ctx) => handlePrayerReading(ctx, ctx.match[1]), 'عرض ذكر صلاة');
registry.registerAction(/^latin_audio_(.+)$/, (ctx) => handleLatinAudio(ctx, ctx.match[1]), 'استماع ذكر صلاة');

module.exports = {
  handlePrayerReadingsMenu,
  handlePrayerReading,
  formatReadingMessage
};

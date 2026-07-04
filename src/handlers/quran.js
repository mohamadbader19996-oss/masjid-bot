process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const { Markup } = require('telegraf');
const db = require('../database');
const {
  getSurahs, getSurah, getSurahTranslation,
  getAyah, getAyahAudio, getSurahAudio,
  getTafsirFromSource, searchQuran, RECITERS, REWAYAT_ORDER, REWAYAT_HEADERS, ALL_LANGUAGES, TAFSIR_SOURCES,
  formatQuranLanguageDisplay,
  getAyahImageUrl, verifyAyahImageUrl, getFullSurahAudioUrl, verifyFullSurahAudioUrl,
  prepareFullSurahAudio,
  isFullSurahBlocked, getBlockedSurahRedirect,
  getPageVerseRange
} = require('../services/quranApi');
const { buildHafizSequence } = require('../services/hafizSequence');
const { buildMergedAudioFile, cleanupTempFolder, probeDurationSeconds } = require('../services/audioMerge');
const { renderMushafPageImage, loadPageData, extractVerseKeys } = require('../services/mushafRenderer');
const { renderTajweedMushafPageImage, tajweedMushafPagePath } = require('../services/tajweedRenderer');
const { checkRecitation } = require('../services/gemini');
const { downloadTelegramAudio } = require('./voiceHandler');
const mushafIndex = require('../services/mushafIndex');
const { getDifficultWords } = require('../services/quranGlossary');
const sendOrEdit = require('../utils/sendOrEdit');
const { playSurahAudio } = require('../utils/quranSurahAudio');
const {
  hasLatinSurah,
  getLatinSurahAyahCount,
  buildLatinAyahHtml,
  buildLatinFullSurahHtml,
  LATIN_SURAH_LABELS
} = require('../utils/quranLatinView');

const QURAN_LANGS_PER_PAGE = 8;
const QURAN_LANG_PAGINATION_MIN = 20;

function isTelegrafNext(value) {
  return typeof value === 'function';
}

function normalizeQuranLangPage(page, fallback = 1) {
  if (isTelegrafNext(page)) return fallback;
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), getQuranLangPageCount());
}

function findLanguageByEdition(edition) {
  return ALL_LANGUAGES.find((l) => l.edition === edition);
}

function getCurrentLanguage(ctx) {
  const edition = ctx.session?.quranLanguageEdition;
  if (edition) {
    const byEdition = findLanguageByEdition(edition);
    if (byEdition) return byEdition;
  }
  const code = ctx.session?.quranLanguageCode || 'ar';
  return ALL_LANGUAGES.find((l) => l.code === code && l.edition === 'quran-uthmani')
    || ALL_LANGUAGES.find((l) => l.code === code)
    || ALL_LANGUAGES[0];
}

function getQuranLangPageCount() {
  const total = ALL_LANGUAGES.length;
  if (total <= QURAN_LANG_PAGINATION_MIN) return 1;
  return Math.ceil(total / QURAN_LANGS_PER_PAGE) || 1;
}

function getQuranLangPageSlice(pageIndex) {
  const paginated = usesQuranLangPagination();
  const perPage = paginated ? QURAN_LANGS_PER_PAGE : ALL_LANGUAGES.length;
  const start = paginated ? (pageIndex - 1) * perPage : 0;
  return ALL_LANGUAGES.slice(start, start + perPage);
}

function usesQuranLangPagination() {
  return ALL_LANGUAGES.length > QURAN_LANG_PAGINATION_MIN;
}

function getCurrentReciter(ctx) {
  const id = ctx.session?.quranReciter || 'ar.alafasy';
  return RECITERS.find(r => r.id === id) || RECITERS[0];
}

function isQuranSimpleMode(ctx) {
  if (!ctx?.from?.id) return false;
  return Boolean(db.getUser(ctx.from.id)?.quranSimpleMode);
}

function extractAyahNumberFromLine(line) {
  const match = String(line).match(/^(\d+)\.\s/);
  return match ? parseInt(match[1], 10) : null;
}

const SURAH_PAGE_CHAR_LIMIT = 3500;
const SURAH_PAGE_CONTENT_LIMIT = 3200;
const SIMPLE_AYAHS_PER_PAGE = 5;
const SIMPLE_AYAH_SEPARATOR = '\n\n➖➖➖➖➖\n\n';
const SEARCH_RESULTS_PER_PAGE = 10;

function escapeMarkdown(text) {
  return String(text || '').replace(/([_*`\[])/g, '\\$1');
}

function shortSurahName(name) {
  return String(name || '')
    .replace(/^سُورَةُ\s+/u, '')
    .replace(/^سورة\s+/u, '')
    .trim();
}

function getArabicLanguage() {
  return ALL_LANGUAGES.find((l) => l.code === 'ar') || ALL_LANGUAGES[0];
}

async function enrichHitsWithAyahText(hits) {
  const uniqueKeys = [...new Set(hits.map((h) => h.surah + ':' + h.ayah))];
  const cache = new Map();
  await Promise.all(uniqueKeys.map(async (key) => {
    const [surah, ayah] = key.split(':').map(Number);
    const data = await getAyah(surah, ayah);
    cache.set(key, data?.text || '');
  }));
  return hits.map((hit) => ({
    ...hit,
    text: cache.get(hit.surah + ':' + hit.ayah) || hit.text || ''
  }));
}

function findSurahPageForAyah(view, ayahNumber) {
  for (let i = 0; i < view.pageAyahNumbers.length; i++) {
    if (view.pageAyahNumbers[i].includes(ayahNumber)) return i + 1;
  }
  return 1;
}

function highlightAyahInPage(pageText, ayahNumber) {
  return String(pageText || '').split('\n').map((line) => {
    const num = extractAyahNumberFromLine(line);
    return num === ayahNumber ? '📍 ' + line : line;
  }).join('\n');
}

function normalizeSearchMatches(matches, surahNameByNumber) {
  return (matches || [])
    .map((m) => ({
      surah: m.surah?.number,
      ayah: m.numberInSurah,
      surahName: surahNameByNumber.get(m.surah?.number) || m.surah?.name || '',
      text: m.text || ''
    }))
    .filter((m) => m.surah && m.ayah);
}

function buildSearchResultsKeyboard(hits, pageIndex, totalPages) {
  const start = (pageIndex - 1) * SEARCH_RESULTS_PER_PAGE;
  const slice = hits.slice(start, start + SEARCH_RESULTS_PER_PAGE);
  const rows = slice.map((m) => [
    Markup.button.callback(
      '📖 ' + shortSurahName(m.surahName) + ' ' + m.surah + ':' + m.ayah,
      'quran_search_go_' + m.surah + '_' + m.ayah
    )
  ]);
  const nav = [];
  if (pageIndex > 1) nav.push(Markup.button.callback('⬅️ السابق', 'quran_search_page_' + (pageIndex - 1)));
  if (pageIndex < totalPages) nav.push(Markup.button.callback('التالي ➡️', 'quran_search_page_' + (pageIndex + 1)));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 القائمة', 'quran_menu')]);
  return Markup.inlineKeyboard(rows);
}

function buildSearchResultsMessage(query, hits, pageIndex) {
  const totalPages = Math.max(1, Math.ceil(hits.length / SEARCH_RESULTS_PER_PAGE));
  const start = (pageIndex - 1) * SEARCH_RESULTS_PER_PAGE;
  const slice = hits.slice(start, start + SEARCH_RESULTS_PER_PAGE);
  let msg = '🔎 نتائج البحث: «' + query + '»\n' +
    hits.length + ' آية — صفحة ' + pageIndex + '/' + totalPages + '\n\n';
  msg += slice.map((m, i) =>
    (start + i + 1) + '. ' + shortSurahName(m.surahName) + ' — آية ' + m.ayah + '\n' + m.text
  ).join('\n\n');
  return msg;
}

function buildSurahFullHeader(arabicSurah, lang, reciter) {
  return '📖 *سورة ' + arabicSurah.name + '* (' + arabicSurah.englishName + ')\n' +
    'عدد الآيات: ' + arabicSurah.numberOfAyahs + ' | اللغة: ' + formatQuranLanguageDisplay(lang) + '\n' +
    'القارئ: ' + reciter.name + '\n\n';
}

function buildSurahContinuationHeader(arabicSurah, pageIndex, totalPages) {
  return '📖 *سورة ' + arabicSurah.name + '* — صفحة ' + pageIndex + '/' + totalPages + '\n\n';
}

function paginateSurahLines(lines, arabicSurah, lang, reciter, options = {}) {
  const simpleMode = Boolean(options.simpleMode);
  const contentPages = [];
  const pageAyahNumbers = [];

  if (simpleMode) {
    let current = [];
    let currentAyahs = [];

    for (const line of lines) {
      const ayahNum = extractAyahNumberFromLine(line);
      if (current.length >= SIMPLE_AYAHS_PER_PAGE) {
        contentPages.push(current.join(SIMPLE_AYAH_SEPARATOR));
        pageAyahNumbers.push(currentAyahs);
        current = [line];
        currentAyahs = ayahNum ? [ayahNum] : [];
      } else {
        current.push(line);
        if (ayahNum) currentAyahs.push(ayahNum);
      }
    }
    if (current.length) {
      contentPages.push(current.join(SIMPLE_AYAH_SEPARATOR));
      pageAyahNumbers.push(currentAyahs);
    }
  } else {
    let current = [];
    let currentAyahs = [];
    let currentLen = 0;

    for (const line of lines) {
      const ayahNum = extractAyahNumberFromLine(line);
      const addition = current.length ? line.length + 2 : line.length;
      if (current.length && currentLen + addition > SURAH_PAGE_CONTENT_LIMIT) {
        contentPages.push(current.join('\n\n'));
        pageAyahNumbers.push(currentAyahs);
        current = [line];
        currentAyahs = ayahNum ? [ayahNum] : [];
        currentLen = line.length;
      } else {
        current.push(line);
        if (ayahNum) currentAyahs.push(ayahNum);
        currentLen += addition;
      }
    }
    if (current.length) {
      contentPages.push(current.join('\n\n'));
      pageAyahNumbers.push(currentAyahs);
    }
  }

  const totalPages = contentPages.length || 1;
  const safeContentPages = contentPages.length ? contentPages : [''];
  const safeAyahNumbers = pageAyahNumbers.length ? pageAyahNumbers : [[]];
  const pages = safeContentPages.map((content, idx) => {
    const header = idx === 0
      ? buildSurahFullHeader(arabicSurah, lang, reciter)
      : buildSurahContinuationHeader(arabicSurah, idx + 1, totalPages);
    return header + content;
  });

  return { pages, pageAyahNumbers: safeAyahNumbers };
}

function buildAyahPlayRows(surahNumber, ayahNumbers, perRow = 8) {
  const rows = [];
  for (let i = 0; i < ayahNumbers.length; i += perRow) {
    const chunk = ayahNumbers.slice(i, i + perRow);
    rows.push(chunk.map(n => Markup.button.callback(String(n), `quran_ayah_play_${surahNumber}_${n}`)));
  }
  return rows;
}

function buildLatinAyahRows(surahNumber, ayahNumbers, perRow = 4) {
  if (!hasLatinSurah(surahNumber)) return [];
  const rows = [];
  for (let i = 0; i < ayahNumbers.length; i += perRow) {
    const chunk = ayahNumbers.slice(i, i + perRow);
    rows.push(chunk.map((n) => Markup.button.callback(`🔤${n}`, `quran_latin_${surahNumber}_${n}`)));
  }
  return rows;
}

function buildListenLoadingKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏳ جاري التحميل...', 'noop')]
  ]);
}

function buildListenNextKeyboard(surahNumber) {
  const num = Number(surahNumber);
  if (!num || num >= 114) return null;
  const nextNum = num + 1;
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏭️ السورة التالية (' + nextNum + ')', 'quran_listen_next_' + num)]
  ]);
}

function buildListenControlText(surahNumber, surahName) {
  const num = Number(surahNumber);
  if (num >= 114) {
    return '📻 *سورة ' + surahName + '* (' + num + '/114) — آخر سورة\n▶️ شغّل التسجيل *أعلاه*';
  }
  return '📻 *سورة ' + surahName + '* (' + num + '/114)\n' +
    '▶️ شغّل التسجيل *أعلاه* (السورة التالية) — ⏭️ للتقدّم';
}

function buildListenDoneControlText(surahNumber, surahName) {
  return '📻 سورة ' + (surahName || surahNumber) + ' (' + surahNumber + '/114) — ✅ تابع الاستماع *أعلاه*';
}

function getListenPairs(ctx) {
  return Array.isArray(ctx.session.quranListenPairs) ? ctx.session.quranListenPairs : [];
}

async function deleteListenPair(ctx, pair) {
  const chatId = ctx.chat?.id;
  if (!chatId || !pair) return;
  for (const id of [pair.audioId, pair.controlId]) {
    if (id) {
      try { await ctx.telegram.deleteMessage(chatId, id); } catch (_) {}
    }
  }
}

async function resetListenSession(ctx) {
  for (const pair of getListenPairs(ctx)) {
    await deleteListenPair(ctx, pair);
  }
  ctx.session.quranListenPairs = [];
  ctx.session.quranListenAudioMsgId = null;
  ctx.session.quranListenControlMsgId = null;
  ctx.session.quranListenActiveSurah = null;
}

async function cleanupListenPairsBeforeSurah(ctx, minSurah) {
  const kept = [];
  for (const pair of getListenPairs(ctx)) {
    if (pair.surah < minSurah) {
      await deleteListenPair(ctx, pair);
    } else {
      kept.push(pair);
    }
  }
  ctx.session.quranListenPairs = kept;
}

function addListenPair(ctx, surah, audioId, controlId, surahName) {
  const pairs = getListenPairs(ctx);
  pairs.push({ surah, audioId, controlId, surahName });
  ctx.session.quranListenPairs = pairs;
  ctx.session.quranListenAudioMsgId = audioId;
  ctx.session.quranListenControlMsgId = controlId;
  ctx.session.quranListenActiveSurah = surah;
}

function buildSurahTextPageKeyboard(surahNumber, pageIndex, totalPages, ayahNumbers = []) {
  const rows = [];
  const nav = [];
  if (pageIndex > 1) {
    nav.push(Markup.button.callback('⬅️ السابق', `quran_surah_page_${surahNumber}_${pageIndex - 1}`));
  }
  if (pageIndex < totalPages) {
    nav.push(Markup.button.callback('التالي ➡️', `quran_surah_page_${surahNumber}_${pageIndex + 1}`));
  }
  if (nav.length) rows.push(nav);
  if (ayahNumbers.length) {
    rows.push(...buildAyahPlayRows(surahNumber, ayahNumbers));
    rows.push(...buildLatinAyahRows(surahNumber, ayahNumbers));
  }
  if (pageIndex === 1) {
    rows.push([Markup.button.callback('📖 تفسير الآية الأولى', 'quran_tafsir_' + surahNumber + '_1')]);
  }
  rows.push([Markup.button.callback('🎧 استماع السورة كاملة', 'quran_listen_full_' + surahNumber)]);
  rows.push([Markup.button.callback('🔙 قائمة السور', 'quran_show_surahs')]);
  return Markup.inlineKeyboard(rows);
}

function buildTafsirSourceKeyboard(surah, ayah, activeSourceId) {
  const label = (src) => (src.id === activeSourceId ? '✅ ' : '') + src.name;
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(label(TAFSIR_SOURCES[0]), `quran_tafsir_src_${surah}_${ayah}_saadi`),
      Markup.button.callback(label(TAFSIR_SOURCES[1]), `quran_tafsir_src_${surah}_${ayah}_ibnkathir`)
    ],
    [
      Markup.button.callback(label(TAFSIR_SOURCES[2]), `quran_tafsir_src_${surah}_${ayah}_tabari`),
      Markup.button.callback(label(TAFSIR_SOURCES[3]), `quran_tafsir_src_${surah}_${ayah}_muyassar`)
    ],
    [Markup.button.callback('📝 كلمات صعبة', `quran_glossary_${surah}_${ayah}`)]
  ]);
}

function buildAyahActionKeyboard(surah, ayah) {
  const rows = [
    [
      Markup.button.callback('📚 تفسير', 'quran_tafsir_' + surah + '_' + ayah),
      Markup.button.callback('📝 كلمات صعبة', 'quran_glossary_' + surah + '_' + ayah)
    ]
  ];
  if (hasLatinSurah(surah)) {
    rows.push([Markup.button.callback('🔤 عرض بالأحرف اللاتينية', `quran_latin_${surah}_${ayah}`)]);
  }
  rows.push(
    [Markup.button.callback('🎓 وضع الحافظ', 'quran_hafiz_prompt')],
    [Markup.button.callback('🔙 رجوع', 'quran_menu')]
  );
  return Markup.inlineKeyboard(rows);
}

function buildHafizActionKeyboard(surah, ayah) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 كرر نفس الآية', 'quran_hafiz_repeat_' + surah + '_' + ayah)],
    [Markup.button.callback('⏭️ الآية التالية', 'quran_hafiz_next_' + surah + '_' + ayah)],
    [
      Markup.button.callback('📚 تفسير', 'quran_tafsir_' + surah + '_' + ayah),
      Markup.button.callback('📝 كلمات صعبة', 'quran_glossary_' + surah + '_' + ayah)
    ],
    [Markup.button.callback('🔙 رجوع', 'quran_menu')]
  ]);
}

async function trySendAyahPhoto(ctx, surah, ayah, surahName) {
  try {
    const available = await verifyAyahImageUrl(surah, ayah);
    if (!available) return;
    const caption = surahName
      ? '📖 ' + surahName + ' — آية ' + ayah
      : '📖 آية ' + surah + ':' + ayah;
    await ctx.replyWithPhoto(getAyahImageUrl(surah, ayah), { caption });
  } catch (_) {
    // تجاهل فشل الصورة بصمت — النص العادي يكفي
  }
}

async function loadSurahView(ctx, surahNumber) {
  const lang = getCurrentLanguage(ctx);
  const reciter = getCurrentReciter(ctx);
  const [arabicSurah, translatedSurah, audioSurah] = await Promise.all([
    getSurah(surahNumber),
    lang.code === 'ar' ? null : getSurahTranslation(surahNumber, lang.edition),
    getSurahAudio(surahNumber, reciter.id)
  ]);
  if (!arabicSurah) return null;
  const lines = (lang.code === 'ar' || !translatedSurah)
    ? arabicSurah.ayahs.map(a => a.numberInSurah + '. ' + a.text)
    : translatedSurah.ayahs.map(a => a.numberInSurah + '. ' + a.text);
  const pagination = paginateSurahLines(lines, arabicSurah, lang, reciter, {
    simpleMode: isQuranSimpleMode(ctx)
  });
  return {
    surahNumber,
    pages: pagination.pages,
    pageAyahNumbers: pagination.pageAyahNumbers,
    totalPages: pagination.pages.length,
    audioUrl: (audioSurah && audioSurah.ayahs && audioSurah.ayahs[0] && audioSurah.ayahs[0].audio) || null,
    audioCaption: '🎙️ ' + reciter.name + ' - سورة ' + arabicSurah.name + ' (أول آية)'
  };
}

async function loadArabicSurahView(ctx, surahNumber) {
  const lang = getArabicLanguage();
  const reciter = getCurrentReciter(ctx);
  const [arabicSurah, audioSurah] = await Promise.all([
    getSurah(surahNumber),
    getSurahAudio(surahNumber, reciter.id)
  ]);
  if (!arabicSurah) return null;
  const lines = arabicSurah.ayahs.map((a) => a.numberInSurah + '. ' + a.text);
  const pagination = paginateSurahLines(lines, arabicSurah, lang, reciter, {
    simpleMode: isQuranSimpleMode(ctx)
  });
  return {
    surahNumber,
    surahName: arabicSurah.name,
    pages: pagination.pages,
    pageAyahNumbers: pagination.pageAyahNumbers,
    totalPages: pagination.pages.length,
    audioUrl: (audioSurah?.ayahs?.[0]?.audio) || null,
    audioCaption: '🎙️ ' + reciter.name + ' - سورة ' + arabicSurah.name + ' (أول آية)'
  };
}

function buildSurahKeyboard(surahs, page = 1) {
  const perPage = 10;
  const pageIndex = Math.max(1, Number(page));
  const start = (pageIndex - 1) * perPage;
  const pageSurahs = surahs.slice(start, start + perPage);
  const rows = pageSurahs.map(s => [
    Markup.button.callback(`${s.number}. ${s.name}`, `quran_read_${s.number}`),
    Markup.button.callback('🎧', `quran_listen_full_${s.number}`)
  ]);
  const nav = [];
  if (pageIndex > 1) nav.push(Markup.button.callback('⬅️ السابق', `quran_page_${pageIndex - 1}`));
  if (start + perPage < surahs.length) nav.push(Markup.button.callback('التالي ➡️', `quran_page_${pageIndex + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('⚡ بحث سريع', 'quran_surah_search_prompt')]);
  rows.push([Markup.button.callback('🔙 القائمة الرئيسية', 'quran_menu')]);
  return Markup.inlineKeyboard(rows);
}

function normalizeSurahQuery(query) {
  return String(query || '')
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

function filterSurahsByQuery(surahs, query) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const q = normalizeSurahQuery(raw);
  const num = parseInt(raw.replace(/\s/g, ''), 10);
  if (num >= 1 && num <= 114 && String(num) === raw.replace(/\s/g, '')) {
    return surahs.filter(s => s.number === num);
  }
  return surahs.filter(s => {
    const name = normalizeSurahQuery(s.name);
    const eng = normalizeSurahQuery(s.englishName);
    return name.includes(q) || eng.includes(q);
  });
}

function buildSurahSearchKeyboard(matches) {
  const rows = matches.slice(0, 12).map(s => [
    Markup.button.callback(`${s.number}. ${s.name}`, `quran_read_${s.number}`),
    Markup.button.callback('🎧', `quran_listen_full_${s.number}`)
  ]);
  rows.push([Markup.button.callback('📜 كل السور', 'quran_show_surahs')]);
  rows.push([Markup.button.callback('🔙 القائمة الرئيسية', 'quran_menu')]);
  return Markup.inlineKeyboard(rows);
}

async function quranMenu(ctx) {
  const lang = getCurrentLanguage(ctx);
  const reciter = getCurrentReciter(ctx);
  const simpleOn = isQuranSimpleMode(ctx);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📜 قائمة السور', 'quran_show_surahs')],
    [Markup.button.callback('🎙️ القارئ: ' + reciter.name, 'quran_show_reciters')],
    [Markup.button.callback('🌍 اللغة: ' + formatQuranLanguageDisplay(lang), 'quran_show_languages')],
    [Markup.button.callback('🔎 بحث في القرآن', 'quran_search_prompt')],
    [Markup.button.callback('📖 المصحف', 'mushaf_open')],
    [Markup.button.callback('🎓 وضع الحافظ', 'quran_hafiz_prompt')],
    [Markup.button.callback('👴 الوضع المبسط: ' + (simpleOn ? 'مفعّل ✅' : 'مفعّل ❌'), 'quran_toggle_simple')],
  ]);
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    return ctx.editMessageText('📖 *القرآن الكريم*\n\nاختر ما تريد:', { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply('📖 *القرآن الكريم*\n\nاختر ما تريد:', { parse_mode: 'Markdown', ...keyboard });
}

async function toggleQuranSimpleMode(ctx) {
  const userId = ctx.from.id;
  const wasOn = isQuranSimpleMode(ctx);
  db.saveUser(userId, { quranSimpleMode: !wasOn });
  await ctx.answerCbQuery(!wasOn ? '✅ تم تفعيل الوضع المبسط' : '❌ تم إيقاف الوضع المبسط');
  if (!wasOn) {
    await ctx.reply(
      '✅ تم تفعيل الوضع المبسط (آيات أقل بكل صفحة، تنسيق أوضح). ' +
      'لتكبير حجم الخط الفعلي، يمكنك تعديل ذلك من إعدادات تطبيق تيليغرام نفسه (الإعدادات ← المظهر ← حجم النص).'
    );
  }
  return quranMenu(ctx);
}

async function showSurahs(ctx, page = 1) {
  try {
    const surahs = await getSurahs();
    if (!surahs.length) return ctx.reply('❌ فشل جلب السور.');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      return ctx.editMessageText('📚 *قائمة السور*\nاختر سورة أو ⚡ بحث سريع:', {
        parse_mode: 'Markdown',
        ...buildSurahKeyboard(surahs, page)
      });
    }
    return ctx.reply('📚 *قائمة السور*\nاختر سورة أو ⚡ بحث سريع:', {
      parse_mode: 'Markdown',
      ...buildSurahKeyboard(surahs, page)
    });
  } catch (e) {
    return ctx.reply('❌ حدث خطأ.');
  }
}

async function searchSurahByName(ctx, query) {
  const surahs = await getSurahs();
  if (!surahs.length) return ctx.reply('❌ فشل جلب السور.');
  const matches = filterSurahsByQuery(surahs, query);
  const term = String(query || '').trim();
  if (!matches.length) {
    return ctx.reply(
      '❌ لم أجد سورة باسم *«' + term + '»*\n\nجرّب رقم السورة (1–114) أو جزءاً من الاسم.',
      { parse_mode: 'Markdown', ...buildSurahKeyboard(surahs, 1) }
    );
  }
  if (matches.length === 1) {
    const s = matches[0];
    return ctx.reply(
      '✅ *' + s.number + '. ' + s.name + '* (' + s.englishName + ')',
      { parse_mode: 'Markdown', ...buildSurahSearchKeyboard(matches) }
    );
  }
  return ctx.reply(
    '🔍 *نتائج:* «' + term + '» — ' + matches.length + ' سورة',
    { parse_mode: 'Markdown', ...buildSurahSearchKeyboard(matches) }
  );
}

async function showReciters(ctx) {
  const rows = [];
  for (const rewaya of REWAYAT_ORDER) {
    const list = RECITERS.filter(r => r.rewaya === rewaya);
    if (!list.length) continue;
    const header = REWAYAT_HEADERS[rewaya] || ('🌟 ▰▰▰ رواية ' + rewaya + ' ▰▰▰ 🌟');
    rows.push([Markup.button.callback(header, 'noop')]);
    list.forEach(r => rows.push([Markup.button.callback(r.name, 'quran_set_reciter_' + r.id)]));
  }
  rows.push([Markup.button.callback('🔙 رجوع', 'quran_menu')]);
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  return ctx.callbackQuery
    ? ctx.editMessageText('🎙️ *اختر القارئ:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) })
    : ctx.reply('🎙️ *اختر القارئ:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
}

async function setReciter(ctx, reciterId) {
  const reciter = RECITERS.find(r => r.id === reciterId);
  if (!reciter) return ctx.answerCbQuery('⚠️ قارئ غير موجود', true);
  ctx.session.quranReciter = reciter.id;
  await ctx.answerCbQuery('✅ تم اختيار ' + reciter.name);
  return quranMenu(ctx);
}

function buildLanguageKeyboard(page = 1) {
  const pageIndex = normalizeQuranLangPage(page, 1);
  const totalPages = getQuranLangPageCount();
  const slice = getQuranLangPageSlice(pageIndex);
  const rows = [];

  for (let i = 0; i < slice.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, slice.length); j++) {
      const lang = slice[j];
      row.push(Markup.button.callback(
        formatQuranLanguageDisplay(lang),
        'quran_set_lang_' + lang.edition
      ));
    }
    rows.push(row);
  }

  if (totalPages > 1) {
    const nav = [];
    if (pageIndex > 1) {
      nav.push(Markup.button.callback('⬅️ رجوع', `quran_lang_page_${pageIndex - 1}`));
    }
    if (pageIndex < totalPages) {
      nav.push(Markup.button.callback('➡️ لغات أخرى', `quran_lang_page_${pageIndex + 1}`));
    }
    if (nav.length) rows.push(nav);
  }

  rows.push([Markup.button.callback('🔙 رجوع', 'quran_menu')]);
  return Markup.inlineKeyboard(rows);
}

function quranLangUiExtra(keyboard) {
  return { parse_mode: 'Markdown', skipTextTranslation: true, skipMarkupLocalization: true, ...keyboard };
}

async function showLanguages(ctx, page, opts = {}) {
  if (isTelegrafNext(opts)) opts = {};
  const pageIndex = normalizeQuranLangPage(page, 1);
  const totalPages = getQuranLangPageCount();
  let text = '🌍 *اختر لغة الترجمة*';
  if (totalPages > 1) {
    text += '\n' + ALL_LANGUAGES.length + ' ترجمة — صفحة ' + pageIndex + '/' + totalPages;
  } else {
    text += '\n' + ALL_LANGUAGES.length + ' ترجمة';
  }
  const keyboard = buildLanguageKeyboard(pageIndex);
  const extra = quranLangUiExtra(keyboard);
  if (ctx.callbackQuery && !opts.answered) await ctx.answerCbQuery();
  return ctx.callbackQuery
    ? ctx.editMessageText(text, extra)
    : ctx.reply(text, extra);
}

async function setLanguage(ctx, editionOrCode) {
  let lang = findLanguageByEdition(editionOrCode);
  if (!lang) lang = ALL_LANGUAGES.find((l) => l.code === editionOrCode);
  if (!lang) return ctx.answerCbQuery('⚠️ لغة غير مدعومة', true);
  ctx.session.quranLanguageEdition = lang.edition;
  ctx.session.quranLanguageCode = lang.code;
  await ctx.answerCbQuery('✅ تم اختيار ' + formatQuranLanguageDisplay(lang));
  return quranMenu(ctx);
}

async function listenFullSurah(ctx, surahNumber, options = {}) {
  const fromNext = Boolean(options.fromNext);
  try {
    if (ctx.session.quranListenLoading) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⏳ انتظر اكتمال تحميل السورة الحالية...', true);
      }
      return;
    }

    if (ctx.callbackQuery && !fromNext) {
      await ctx.answerCbQuery('⏳ جاري تحميل السورة...').catch(() => {});
    }

    const reciter = getCurrentReciter(ctx);
    const num = Number(surahNumber);
    console.log(`[quran] listenFullSurah surah=${num} reciter=${reciter.id} user=${ctx.from?.id} fromNext=${fromNext}`);

    if (isFullSurahBlocked(reciter.id, num)) {
      const alt = getBlockedSurahRedirect(reciter.id);
      const surahs = await getSurahs();
      const surahName = surahs.find(s => s.number === num)?.name || String(num);
      if (alt) {
        return ctx.reply(
          '⚠️ *سورة ' + surahName + '* غير متاحة للقارئ *' + reciter.name + '*.\n\n' +
          '✅ متاحة برواية *' + alt.rewaya + '* للقارئ: *' + alt.name + '*\n\n' +
          'اختره من 🎙️ قائمة القرّاء.',
          { parse_mode: 'Markdown' }
        );
      }
      return ctx.reply('❌ هذه السورة غير متاحة بهذا القارئ، جرّب قارئاً آخر من القائمة.');
    }

    const audioSurah = await getSurahAudio(num, reciter.id);
    const audioUrl = getFullSurahAudioUrl(num, reciter.id);
    if (!audioUrl) {
      return ctx.reply('❌ الصوت الكامل لهذه السورة غير متاح حالياً بهذا القارئ، جرّب قارئاً آخر.');
    }
    const available = await verifyFullSurahAudioUrl(audioUrl);
    if (!available) {
      return ctx.reply('❌ هذه السورة غير متاحة بهذا القارئ على CDN. جرّب قارئاً آخر من القائمة.');
    }

    ctx.session.quranListenLoading = true;
    await ctx.sendChatAction('upload_audio').catch(() => {});

    const surahName = audioSurah?.name || audioSurah?.englishName || String(num);
    const nextKeyboard = buildListenNextKeyboard(num);
    const controlText = buildListenControlText(num, surahName);
    const audioCaption = '🎧 سورة ' + surahName + ' (' + num + '/114) - ' + reciter.name;
    const prevActiveSurah = fromNext ? Number(ctx.session.quranListenActiveSurah) : null;
    const oldControlMsgId = fromNext ? ctx.callbackQuery?.message?.message_id : null;
    const prevPair = fromNext && prevActiveSurah
      ? getListenPairs(ctx).find(p => p.surah === prevActiveSurah)
      : null;

    if (fromNext) {
      if (oldControlMsgId) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          oldControlMsgId,
          undefined,
          '⏳ جاري تحميل *سورة ' + surahName + '* بالأسفل...',
          { parse_mode: 'Markdown', ...buildListenLoadingKeyboard() }
        ).catch(() => {});
      }
    } else {
      await resetListenSession(ctx);
    }

    const delivery = await prepareFullSurahAudio(audioUrl);
    if (!delivery) {
      ctx.session.quranListenLoading = false;
      return ctx.reply('❌ تعذّر تحميل ملف السورة، جرّب لاحقاً أو قارئاً آخر.');
    }
    if (delivery.mode === 'too_large') {
      ctx.session.quranListenLoading = false;
      const sizeMb = delivery.size ? Math.round(delivery.size / 1024 / 1024) : '?';
      return ctx.reply(
        '⚠️ *سورة ' + surahName + '* كبيرة جداً لتيليغرام (~' + sizeMb + 'MB).\n\n' +
        'جرّب قارئاً من *حفص* (128kbps) أو انتقل للسورة التالية.',
        { parse_mode: 'Markdown', ...(nextKeyboard || {}) }
      );
    }

    const audioOpts = { caption: audioCaption, title: surahName, performer: reciter.name };
    const sendExtra = {};
    if (fromNext && prevPair?.audioId) {
      sendExtra.reply_parameters = { message_id: prevPair.audioId };
    }
    const audioMsg = delivery.mode === 'buffer'
      ? await ctx.replyWithAudio(
        { source: delivery.file, filename: 'surah-' + num + '.mp3' },
        audioOpts,
        sendExtra
      )
      : await ctx.replyWithAudio(delivery.url, audioOpts, sendExtra);

    const ctrlMsg = await ctx.reply(controlText, {
      parse_mode: 'Markdown',
      ...(nextKeyboard || {})
    });

    ctx.session.quranListenActiveSurah = num;
    ctx.session.quranLastListenSurah = num;
    addListenPair(ctx, num, audioMsg.message_id, ctrlMsg.message_id, surahName);

    if (fromNext && prevActiveSurah && oldControlMsgId) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        oldControlMsgId,
        undefined,
        buildListenDoneControlText(prevActiveSurah, prevPair?.surahName),
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  } catch (e) {
    console.error('listenFullSurah error:', e.message);
    return ctx.reply('❌ الصوت الكامل لهذه السورة غير متاح حالياً بهذا القارئ، جرّب قارئاً آخر (مثل العفاسي أو ياسر الدوسري).');
  } finally {
    ctx.session.quranListenLoading = false;
  }
}

async function readSurah(ctx, surahNumber) {
  try {
    if (!ctx.callbackQuery) await ctx.reply('⏳ جاري تحميل السورة...');
    const view = await loadSurahView(ctx, surahNumber);
    if (!view) return ctx.reply('❌ لم أتمكن من تحميل السورة.');
    ctx.session.quranSurahView = view;
    const ayahNumbers = view.pageAyahNumbers[0] || [];
    const keyboard = buildSurahTextPageKeyboard(surahNumber, 1, view.totalPages, ayahNumbers);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(view.pages[0], { parse_mode: 'Markdown', ...keyboard });
    } else {
      await ctx.reply(view.pages[0], { parse_mode: 'Markdown', ...keyboard });
      if (view.audioUrl) {
        await ctx.replyWithAudio(view.audioUrl, { caption: view.audioCaption });
      }
    }
  } catch (e) {
    console.error('readSurah error:', e.message);
    return ctx.reply('❌ حدث خطأ.');
  }
}

async function showSurahTextPage(ctx, surahNumber, pageIndex) {
  let view = ctx.session?.quranSurahView;
  if (!view || view.surahNumber !== surahNumber) {
    view = await loadSurahView(ctx, surahNumber);
    if (!view) return ctx.reply('❌ لم أتمكن من تحميل السورة.');
    ctx.session.quranSurahView = view;
  }
  const idx = pageIndex - 1;
  if (idx < 0 || idx >= view.totalPages) {
    return ctx.answerCbQuery('⚠️ صفحة غير موجودة', true);
  }
  const ayahNumbers = view.pageAyahNumbers[idx] || [];
  const keyboard = buildSurahTextPageKeyboard(surahNumber, pageIndex, view.totalPages, ayahNumbers);
  return ctx.editMessageText(view.pages[idx], { parse_mode: 'Markdown', ...keyboard });
}

function getTafsirSourceName(sourceId) {
  return TAFSIR_SOURCES.find(s => s.id === sourceId)?.name || 'التفسير';
}

function buildTafsirMessage(data, ayah, sourceId) {
  const sourceName = getTafsirSourceName(sourceId);
  return '📚 *تفسير سورة ' + (data.surah ? data.surah.name : '') + ' - آية ' + ayah + '* (' + sourceName + ')\n\n' +
    '*الآية:* ' + data.ayahText + '\n\n' +
    '*التفسير:*\n' + data.tafsirText;
}

async function showTafsir(ctx, surah, ayah, sourceId = 'saadi') {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const data = await getTafsirFromSource(surah, ayah, sourceId);
    if (!data) return ctx.reply('❌ لم أتمكن من جلب التفسير.');
    if (data.unavailable) {
      return ctx.reply('❌ هذا المصدر غير متاح لهذه الآية، جرّب مصدراً آخر');
    }
    if (!data.tafsirText) {
      return ctx.reply('❌ التفسير الميسر غير متاح لهذه الآية حالياً');
    }
    const isSourceSwitch = Boolean(ctx.callbackQuery?.data?.startsWith('quran_tafsir_src_'));
    if (!isSourceSwitch) {
      await trySendAyahPhoto(ctx, surah, ayah, data.surah?.name);
    }
    const msg = buildTafsirMessage(data, ayah, data.sourceId);
    const keyboard = buildTafsirSourceKeyboard(surah, ayah, data.sourceId);
    if (ctx.callbackQuery?.message) {
      return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
    }
    return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
  } catch (e) {
    return ctx.reply('❌ حدث خطأ في التفسير.');
  }
}

async function resolveAyahTranslationText(ctx, surah, ayah) {
  const lang = getCurrentLanguage(ctx);
  if (lang.code === 'ar') return null;
  const translated = await getSurahTranslation(surah, lang.edition);
  const ayahEntry = translated?.ayahs?.find((a) => a.numberInSurah === ayah);
  return ayahEntry?.text || null;
}

function buildLatinRepeatKeyboard(surah, ayah) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('3️⃣ 3 مرات', `latin_repeat_${surah}_${ayah}_3`),
      Markup.button.callback('5️⃣ 5 مرات', `latin_repeat_${surah}_${ayah}_5`)
    ],
    [
      Markup.button.callback('7️⃣ 7 مرات', `latin_repeat_${surah}_${ayah}_7`),
      Markup.button.callback('🔟 10 مرات', `latin_repeat_${surah}_${ayah}_10`)
    ],
    [Markup.button.callback('🔙 رجوع', `quran_latin_${surah}_${ayah}`)]
  ]);
}

function buildQuranLatinAyahKeyboard(surah, ayah, backCallback = `quran_read_${surah}`) {
  const rows = [];
  const nav = [];
  if (ayah > 1) {
    nav.push(Markup.button.callback('◀️ السابقة', `quran_latin_${surah}_${ayah - 1}`));
  }
  if (ayah < getLatinSurahAyahCount(surah)) {
    nav.push(Markup.button.callback('▶️ التالية', `quran_latin_${surah}_${ayah + 1}`));
  }
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🎧 استمع للآية', `latin_listen_${surah}_${ayah}`)]);
  rows.push([Markup.button.callback('📖 استمع للسورة كاملة', `latin_full_${surah}`)]);
  rows.push([Markup.button.callback('🎧 استمع للسورة', `latin_surah_audio_${surah}`)]);
  rows.push([Markup.button.callback('🔙 رجوع', backCallback)]);
  return Markup.inlineKeyboard(rows);
}

async function showQuranLatinAyah(ctx, surah, ayah, backCallback) {
  if (!hasLatinSurah(surah)) {
    return ctx.answerCbQuery('❌ لا يوجد نطق لاتيني لهذه السورة', { show_alert: true }).catch(() => {});
  }
  const [ayahData, translationText] = await Promise.all([
    getAyah(surah, ayah),
    resolveAyahTranslationText(ctx, surah, ayah)
  ]);
  if (!ayahData?.text) {
    return ctx.reply('❌ لم أتمكن من جلب الآية.');
  }
  const text = buildLatinAyahHtml(surah, ayah, ayahData.text, translationText);
  const keyboard = buildQuranLatinAyahKeyboard(surah, ayah, backCallback);
  return sendOrEdit(ctx, text, keyboard, 'HTML');
}

async function handleQuranLatinAyahAction(ctx) {
  const surah = parseInt(ctx.match[1], 10);
  const ayah = parseInt(ctx.match[2], 10);
  const back = ctx.session?.quranLatinBack || `quran_read_${surah}`;
  return showQuranLatinAyah(ctx, surah, ayah, back);
}

async function handleLatinSurahAudioAction(ctx) {
  await ctx.answerCbQuery('⏳ جاري التحميل...').catch(() => {});
  const surah = parseInt(ctx.match[1], 10);
  if (!hasLatinSurah(surah)) {
    return ctx.answerCbQuery('❌ غير متوفرة', { show_alert: true }).catch(() => {});
  }
  return playSurahAudio(ctx, surah);
}

async function handleLatinListenAction(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const surah = parseInt(ctx.match[1], 10);
  const ayah = parseInt(ctx.match[2], 10);
  if (!hasLatinSurah(surah)) {
    return ctx.answerCbQuery('❌ غير متوفرة', { show_alert: true }).catch(() => {});
  }
  const text = `🎧 <b>كم مرة تريد تكرار الآية ${ayah}؟</b>`;
  return sendOrEdit(ctx, text, buildLatinRepeatKeyboard(surah, ayah), 'HTML');
}

async function handleLatinRepeatAction(ctx) {
  let folderPath = null;
  try {
    await ctx.answerCbQuery('⏳ جاري التجهيز...').catch(() => {});
    const surah = parseInt(ctx.match[1], 10);
    const ayah = parseInt(ctx.match[2], 10);
    const times = parseInt(ctx.match[3], 10);
    if (!hasLatinSurah(surah) || !times || times < 1) {
      return ctx.reply('❌ طلب غير صالح.');
    }
    const reciter = getCurrentReciter(ctx);
    const sequence = Array.from({ length: times }, () => ({ surah, ayah }));
    await ctx.sendChatAction('upload_audio').catch(() => {});
    const result = await buildMergedAudioFile(sequence, reciter.id, ctx.from.id);
    folderPath = result.folderPath;
    await ctx.replyWithAudio(
      { source: result.mergedPath },
      { caption: `🎧 ${reciter.name} — آية ${ayah} × ${times} مرة` }
    );
  } catch (e) {
    console.error('handleLatinRepeatAction error:', e.message);
    return ctx.reply('❌ فشل تجهيز الصوت.');
  } finally {
    cleanupTempFolder(folderPath);
  }
}

async function handleLatinFullSurahAction(ctx) {
  let folderPath = null;
  try {
    await ctx.answerCbQuery('⏳ جاري التجهيز...').catch(() => {});
    const surah = parseInt(ctx.match[1], 10);
    if (!hasLatinSurah(surah)) {
      return ctx.answerCbQuery('❌ غير متوفرة', { show_alert: true }).catch(() => {});
    }
    const count = getLatinSurahAyahCount(surah);
    const reciter = getCurrentReciter(ctx);
    const ayahTexts = {};
    await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const ayahNum = i + 1;
        return getAyah(surah, ayahNum).then((data) => {
          ayahTexts[ayahNum] = data?.text || '—';
        });
      })
    );
    const html = buildLatinFullSurahHtml(surah, ayahTexts);
    const sequence = Array.from({ length: count }, (_, i) => ({ surah, ayah: i + 1 }));
    await ctx.sendChatAction('upload_audio').catch(() => {});
    const result = await buildMergedAudioFile(sequence, reciter.id, ctx.from.id);
    folderPath = result.folderPath;
    const surahName = LATIN_SURAH_LABELS[surah] || String(surah);
    await ctx.reply(html, { parse_mode: 'HTML' });
    await ctx.replyWithAudio(
      { source: result.mergedPath },
      { caption: `🎧 ${reciter.name} — سورة ${surahName} كاملة` }
    );
  } catch (e) {
    console.error('handleLatinFullSurahAction error:', e.message);
    return ctx.reply('❌ فشل تجهيز السورة كاملة.');
  } finally {
    cleanupTempFolder(folderPath);
  }
}

async function fetchAyahPlayPayload(surah, ayah, reciterId = 'ar.alafasy', sourceId = 'saadi') {
  const [audio, tafsir] = await Promise.all([
    getAyahAudio(surah, ayah, reciterId),
    getTafsirFromSource(surah, ayah, sourceId)
  ]);
  return {
    audioUrl: audio?.audio || null,
    tafsir,
    reciterId
  };
}

async function handleAyahPlayAction(ctx) {
  try {
    await ctx.answerCbQuery('⏳ جاري التحميل...');
    const surah = parseInt(ctx.match[1], 10);
    const ayah = parseInt(ctx.match[2], 10);
    const reciter = getCurrentReciter(ctx);
    const payload = await fetchAyahPlayPayload(surah, ayah, reciter.id, 'saadi');

    if (payload.audioUrl) {
      await ctx.replyWithAudio(payload.audioUrl, {
        caption: '🎙️ ' + reciter.name + ' - آية ' + ayah
      });
    }

    await trySendAyahPhoto(ctx, surah, ayah, payload.tafsir?.surah?.name);

    if (!payload.tafsir || payload.tafsir.unavailable || !payload.tafsir.tafsirText) {
      return ctx.reply('❌ هذا المصدر غير متاح لهذه الآية، جرّب مصدراً آخر');
    }

    const msg = buildTafsirMessage(payload.tafsir, ayah, payload.tafsir.sourceId);
    const keyboard = buildTafsirSourceKeyboard(surah, ayah, payload.tafsir.sourceId);
    return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
  } catch (e) {
    console.error('handleAyahPlayAction error:', e.message);
    return ctx.reply('❌ حدث خطأ.');
  }
}

async function showGlossary(ctx, surah, ayah) {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ جاري التحليل...');
    const ayahData = await getAyah(surah, ayah);
    if (!ayahData?.text) return ctx.reply('❌ لم أتمكن من جلب الآية.');
    const words = await getDifficultWords(surah, ayah, ayahData.text);
    if (!words.length) {
      return ctx.reply('✅ لا توجد كلمات غريبة بارزة في هذه الآية');
    }
    const lines = words.map(w => '• *' + w.word + '* — ' + w.meaning);
    return ctx.reply(
      '📝 *كلمات صعبة*\n' +
      'سورة ' + (ayahData.surah ? ayahData.surah.name : surah) + ' — آية ' + ayah + '\n\n' +
      lines.join('\n'),
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.error('showGlossary error:', e.message);
    return ctx.reply('❌ حدث خطأ في جلب الكلمات الصعبة.');
  }
}

async function promptHafiz(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔢 آية محددة', 'quran_hafiz_ayah_choice')],
    [Markup.button.callback('📄 قراءة صفحة', 'quran_hafiz_page_prompt')],
    [Markup.button.callback('📖 المصحف المجوّد', 'quran_mushaf_page_prompt')],
    [Markup.button.callback('🎤 اختبار التسميع', 'quran_recitation_check_prompt')],
    [Markup.button.callback('🎙️ تسميع مع شيخ', 'quran_recitation_sheikh_prompt')],
    [Markup.button.callback('🔙 رجوع', 'quran_menu')]
  ]);
  return ctx.reply(
    '🎓 *وضع الحافظ*\n\nاختر نوع التسميع:',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function promptHafizAyahChoice(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.quranHafizMode = true;
  return ctx.reply(
    '🔢 *آية محددة*\n\nأرسل رقم السورة والآية:\nمثال: 2:255',
    { parse_mode: 'Markdown' }
  );
}

async function promptHafizPage(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.hafizPagePrompt = true;
  return ctx.reply(
    '📄 *قراءة صفحة (تسميع الحافظ)*\n\nأرسل رقم الصفحة (1 إلى 604):',
    { parse_mode: 'Markdown' }
  );
}

const RECITATION_CHECK_DISCLAIMER =
  'ℹ️ هذا فحص لكلمات الحفظ فقط، وليس تصحيحاً معتمداً لأحكام التجويد — للدقة الكاملة راجع شيخاً أو معلماً.';


function normalizeAyahTextForRecitation(surah, ayah, text) {
  const raw = String(text || '').trim();
  if (surah > 1 && surah !== 9 && ayah === 1) {
    const muqatta = raw.match(/\s(ال\S+)\s*$/u);
    if (muqatta) return muqatta[1].trim();
  }
  return raw;
}

async function buildPageExpectedText(pageNumber) {
  const verses = await getPageVerseRange(pageNumber);
  if (!verses?.length) return null;
  const parts = [];
  for (const { surah, ayah } of verses) {
    const ayahData = await getAyah(surah, ayah);
    if (ayahData?.text) {
      parts.push(normalizeAyahTextForRecitation(surah, ayah, ayahData.text));
    }
  }
  return parts.length ? parts.join(' ') : null;
}

function formatRecitationCheckResult(result, pageNumber) {
  if (result.matches) {
    return '✅ ما شاء الله، التسميع مطابق تماماً (حسب فحص الكلمات، لا التجويد الدقيق).';
  }
  const lines = ['❌ *نتيجة اختبار التسميع — صفحة ' + pageNumber + '*\n'];
  for (const err of result.errors || []) {
    const expected = err.expected || '؟';
    const heard = err.heard;
    if (err.type === 'missing') {
      lines.push('❌ كلمة محذوفة: الصحيح *' + expected + '*');
    } else if (err.type === 'extra') {
      lines.push('❌ كلمة زائدة: سُمع *' + (heard || '؟') + '*');
    } else {
      lines.push('❌ في موضع *' + expected + '*: قرأت *' + (heard || '؟') + '* والصحيح *' + expected + '*');
    }
  }
  if (!result.errors?.length) {
    lines.push('❌ التسميع غير مطابق لكن لم تُحدَّد أخطاء تفصيلية.');
  }
  return lines.join('\n');
}

async function promptRecitationCheckPage(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.recitationCheckPage = true;
  return ctx.reply(
    '🎤 *اختبار التسميع*\n\nأرسل رقم الصفحة (1 إلى 604):',
    { parse_mode: 'Markdown' }
  );
}

async function startRecitationCheckPage(ctx, text) {
  const num = parseInt(String(text).trim(), 10);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    return ctx.reply('⚠️ رقم الصفحة يجب أن يكون بين 1 و 604.');
  }
  const expectedText = await buildPageExpectedText(num);
  if (!expectedText) {
    return ctx.reply('❌ لم أتمكن من جلب آيات الصفحة ' + num + '.');
  }
  ctx.session.recitationExpectedText = expectedText;
  ctx.session.awaitingRecitationVoice = num;
  return ctx.reply(
    '📝 *صفحة ' + num + '*\n\nاقرأ هذه الصفحة *كاملة من حفظك* وأرسلها كرسالة صوتية واحدة.',
    { parse_mode: 'Markdown' }
  );
}

async function handleRecitationCheckPromptAction(ctx) {
  return promptRecitationCheckPage(ctx);
}

async function handleRecitationVoice(ctx) {
  const pageNumber = ctx.session.awaitingRecitationVoice;
  const expectedText = ctx.session.recitationExpectedText;
  delete ctx.session.awaitingRecitationVoice;
  delete ctx.session.recitationExpectedText;
  delete ctx.session.recitationCheckPage;
  delete ctx.session.recitationCheck;

  if (!pageNumber || !expectedText) {
    return ctx.reply('❌ انتهت جلسة اختبار التسميع. ابدأ من جديد من وضع الحافظ.');
  }

  const waitMsg = await ctx.reply('🎤 جاري فحص تسميعك...');
  try {
    const fileId = ctx.message.voice?.file_id || ctx.message.audio?.file_id;
    if (!fileId) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      return ctx.reply('❌ أرسل رسالة صوتية واحدة للصفحة كاملة.');
    }
    const buffer = await downloadTelegramAudio(ctx, fileId);
    const base64 = buffer.toString('base64');
    const mimeType = ctx.message.voice ? 'audio/ogg' : (ctx.message.audio?.mime_type || 'audio/mpeg');
    const result = await checkRecitation(base64, mimeType, expectedText);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    const body = formatRecitationCheckResult(result, pageNumber);
    return ctx.reply(body + '\n\n' + RECITATION_CHECK_DISCLAIMER, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('handleRecitationVoice error:', e.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    return ctx.reply('❌ فشل فحص التسميع:\n' + (e.message || 'خطأ غير معروف') + '\n\n' + RECITATION_CHECK_DISCLAIMER);
  }
}

async function runHafizPageDrill(ctx, pageNumber) {
  let folderPath = null;
  try {
    await ctx.reply('⏳ جاري تجهيز صفحة ' + pageNumber + '، قد يستغرق هذا دقيقة...');
    const verses = await getPageVerseRange(pageNumber);
    if (!verses?.length) {
      return ctx.reply('❌ لم أتمكن من جلب آيات الصفحة ' + pageNumber + '.');
    }

    const reciter = getCurrentReciter(ctx);
    const sequence = buildHafizSequence(verses);
    const result = await buildMergedAudioFile(sequence, reciter.id, ctx.from.id);
    folderPath = result.folderPath;

    await ctx.replyWithAudio(
      { source: result.mergedPath },
      { caption: 'صفحة ' + pageNumber + ' - وضع الحافظ' }
    );
    return ctx.reply('✅ انتهت صفحة ' + pageNumber + '.');
  } catch (e) {
    console.error('runHafizPageDrill error:', e.message);
    return ctx.reply('❌ فشل تجهيز صفحة ' + pageNumber + ':\n' + (e.message || 'خطأ غير معروف'));
  } finally {
    cleanupTempFolder(folderPath);
  }
}

async function startHafizPageDrill(ctx, text) {
  const num = parseInt(String(text).trim(), 10);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    return ctx.reply('⚠️ رقم الصفحة يجب أن يكون بين 1 و 604.');
  }
  return runHafizPageDrill(ctx, num);
}

async function handleHafizStopAction(ctx) {
  ctx.session.hafizStopRequested = true;
  return ctx.answerCbQuery('⏹️ جاري الإيقاف...');
}

async function handleHafizPagePromptAction(ctx) {
  return promptHafizPage(ctx);
}

async function promptMushafPage(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.mushafPagePrompt = true;
  return ctx.reply(
    '📖 *المصحف المجوّد*\n\nأرسل رقم الصفحة (1 إلى 604):',
    { parse_mode: 'Markdown' }
  );
}

async function showPageDifficultWords(ctx, verseKeys, pageNumber) {
  const sections = [];
  for (const key of verseKeys) {
    const [surahStr, ayahStr] = key.split(':');
    const surah = Number(surahStr);
    const ayah = Number(ayahStr);
    if (!surah || !ayah) continue;
    const ayahData = await getAyah(surah, ayah);
    if (!ayahData?.text) continue;
    const words = await getDifficultWords(surah, ayah, ayahData.text);
    if (!words.length) continue;
    const surahName = ayahData.surah ? ayahData.surah.name : String(surah);
    const lines = words.map((w) => '• *' + w.word + '* — ' + w.meaning);
    sections.push('*' + surahName + ' — آية ' + ayah + '*\n' + lines.join('\n'));
  }
  if (!sections.length) {
    return ctx.reply('✅ لا توجد كلمات غريبة بارزة في هذه الصفحة');
  }
  const header = '📝 *كلمات صعبة — صفحة ' + pageNumber + '*\n\n';
  const fullText = header + sections.join('\n\n');
  if (fullText.length <= 3800) {
    return ctx.reply(fullText, { parse_mode: 'Markdown' });
  }
  await ctx.reply(header, { parse_mode: 'Markdown' });
  let chunk = '';
  for (const section of sections) {
    if ((chunk + section).length > 3500) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
      chunk = '';
    }
    chunk += section + '\n\n';
  }
  if (chunk) await ctx.reply(chunk, { parse_mode: 'Markdown' });
}

function getMushafTheme(ctx) {
  const user = db.getUser(ctx.from.id);
  return user?.mushafTheme === 'dark' ? 'dark' : 'light';
}

function isTajweedMushafViewer(ctx) {
  return ctx.session?.mushafViewer === 'tajweed';
}

function buildMushafPageKeyboard(pageNumber, theme = 'light', variant = 'qcf4') {
  const navRow = [];
  if (pageNumber > 1) {
    navRow.push(Markup.button.callback('◀️ السابقة', 'mushaf_nav_' + (pageNumber - 1)));
  } else {
    navRow.push(Markup.button.callback('◀️ السابقة', 'noop'));
  }
  navRow.push(Markup.button.callback('📑 الفهرس', 'mushaf_index'));
  if (pageNumber < 604) {
    navRow.push(Markup.button.callback('التالية ▶️', 'mushaf_nav_' + (pageNumber + 1)));
  } else {
    navRow.push(Markup.button.callback('التالية ▶️', 'noop'));
  }
  const themeBtn = theme === 'dark'
    ? Markup.button.callback('☀️ الوضع النهاري', 'mushaf_theme_toggle_' + pageNumber)
    : Markup.button.callback('🌙 الوضع الليلي', 'mushaf_theme_toggle_' + pageNumber);
  const actionRow = variant === 'tajweed'
    ? [
      Markup.button.callback('📝 كلمات صعبة', 'mushaf_glossary_' + pageNumber),
      Markup.button.callback('📚 تفسير', 'mushaf_tafsir_' + pageNumber),
      themeBtn
    ]
    : [
      Markup.button.callback('🎧 استماع الصفحة', 'mushaf_listen_' + pageNumber),
      Markup.button.callback('📝 كلمات صعبة', 'mushaf_glossary_' + pageNumber),
      themeBtn
    ];
  return Markup.inlineKeyboard([
    navRow,
    actionRow
  ]);
}

function buildMushafSurahKeyboard(chapters, page = 1) {
  const perPage = 10;
  const pageIndex = Math.max(1, Number(page));
  const start = (pageIndex - 1) * perPage;
  const pageChapters = chapters.slice(start, start + perPage);
  const rows = pageChapters.map((c) => [
    Markup.button.callback(c.id + '. ' + c.name, 'mushaf_surah_pick_' + c.id)
  ]);
  const nav = [];
  if (pageIndex > 1) nav.push(Markup.button.callback('⬅️ السابق', 'mushaf_surah_page_' + (pageIndex - 1)));
  if (start + perPage < chapters.length) nav.push(Markup.button.callback('التالي ➡️', 'mushaf_surah_page_' + (pageIndex + 1)));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 الفهرس', 'mushaf_index')]);
  return Markup.inlineKeyboard(rows);
}

function buildMushafJuzKeyboard() {
  const rows = [];
  for (let i = 0; i < 30; i += 3) {
    rows.push([
      Markup.button.callback('📚 جزء ' + (i + 1), 'mushaf_juz_' + (i + 1)),
      Markup.button.callback('📚 جزء ' + (i + 2), 'mushaf_juz_' + (i + 2)),
      Markup.button.callback('📚 جزء ' + (i + 3), 'mushaf_juz_' + (i + 3))
    ]);
  }
  rows.push([Markup.button.callback('🔙 الفهرس', 'mushaf_index')]);
  return Markup.inlineKeyboard(rows);
}

async function showMushafIndexMenu(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📜 تصفح بالسورة', 'mushaf_browse_surah')],
    [Markup.button.callback('📚 تصفح بالجزء', 'mushaf_browse_juz')],
    [Markup.button.callback('▶️ من الصفحة 1', 'mushaf_nav_1')]
  ]);
  const text = '📖 *المصحف*\n\nاختر طريقة التصفح:';
  if (ctx.callbackQuery?.message?.photo) {
    return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function openMushaf(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  await mushafIndex.initializeMushafIndex();
  const user = db.getUser(ctx.from.id);
  const last = Number(user?.lastMushafPage);
  if (Number.isFinite(last) && last >= 1 && last <= 604) {
    return showMushafPage(ctx, last);
  }
  return showMushafIndexMenu(ctx);
}

async function browseMushafBySurah(ctx, page = 1) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const chapters = await mushafIndex.getAllSurahPages();
  const text = '📜 *تصفح بالسورة*\n\nاختر سورة لفتح أول صفحة لها:';
  const keyboard = buildMushafSurahKeyboard(chapters, page);
  if (ctx.callbackQuery?.message && !ctx.callbackQuery.message.photo) {
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function browseMushafByJuz(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  return ctx.reply(
    '📚 *تصفح بالجزء*\n\nاختر جزءاً لفتح أول صفحة له:',
    { parse_mode: 'Markdown', ...buildMushafJuzKeyboard() }
  );
}

async function openMushafAtSurah(ctx, surahId) {
  if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ جاري فتح السورة...');
  const pageNumber = await mushafIndex.getChapterStartPage(surahId);
  return showMushafPage(ctx, pageNumber);
}

async function openMushafAtJuz(ctx, juzId) {
  if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ جاري فتح الجزء...');
  const pageNumber = await mushafIndex.getJuzStartPage(juzId);
  return showMushafPage(ctx, pageNumber);
}

async function handleMushafNavAction(ctx) {
  const pageNumber = parseInt(ctx.match[1], 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    return ctx.answerCbQuery('⚠️ رقم صفحة غير صالح', true);
  }
  await ctx.answerCbQuery('⏳ صفحة ' + pageNumber + '...');
  if (isTajweedMushafViewer(ctx)) {
    return showTajweedMushafPage(ctx, pageNumber, { editMode: true });
  }
  return showMushafPage(ctx, pageNumber, { editMode: true });
}

async function handleMushafThemeToggleAction(ctx) {
  const pageNumber = parseInt(ctx.match[1], 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    return ctx.answerCbQuery('⚠️ رقم صفحة غير صالح', true);
  }
  const current = getMushafTheme(ctx);
  const next = current === 'dark' ? 'light' : 'dark';
  db.saveUser(ctx.from.id, { mushafTheme: next });
  await ctx.answerCbQuery(next === 'dark' ? '🌙 تم تفعيل الوضع الليلي' : '☀️ تم تفعيل الوضع النهاري');
  if (isTajweedMushafViewer(ctx)) {
    return showTajweedMushafPage(ctx, pageNumber, { editMode: true, theme: next });
  }
  return showMushafPage(ctx, pageNumber, { editMode: true, theme: next });
}

function buildMushafPhotoCaption(pageNumber, theme = 'light') {
  const themeLabel = theme === 'dark' ? ' — 🌙 ليلي' : '';
  return '📄 صفحة ' + pageNumber + ' — مصحف المدينة (QCF4)' + themeLabel;
}

function buildTajweedMushafPhotoCaption(pageNumber, theme = 'light') {
  const themeLabel = theme === 'dark' ? ' — 🌙 ليلي' : '';
  return '📖 صفحة ' + pageNumber + ' — المصحف المجوّد' + themeLabel;
}

async function showMushafPage(ctx, pageNumber, options = {}) {
  try {
    const num = Number(pageNumber);
    if (!Number.isFinite(num) || num < 1 || num > 604) {
      return ctx.reply('⚠️ رقم الصفحة يجب أن يكون بين 1 و 604.');
    }

    ctx.session.mushafViewer = 'qcf4';
    const editMode = options.editMode === true;
    const theme = options.theme || getMushafTheme(ctx);
    const result = await renderMushafPageImage(num, { theme });
    const pngPath = result.pngPath;
    ctx.session.lastMushafPage = num;
    db.saveUser(ctx.from.id, { lastMushafPage: num });

    const caption = buildMushafPhotoCaption(num, theme);
    const keyboard = buildMushafPageKeyboard(num, theme);

    if (editMode && ctx.callbackQuery?.message?.photo) {
      try {
        await ctx.editMessageMedia(
          { type: 'photo', media: { source: pngPath }, caption },
          keyboard
        );
        return;
      } catch (_) {}
    }

    if (!result.cached) {
      await ctx.reply('⏳ جاري رسم صفحة ' + num + ' من المصحف...');
    }
    await ctx.replyWithPhoto(
      { source: pngPath },
      { caption, ...keyboard }
    );
  } catch (e) {
    console.error('showMushafPage error:', e.message);
    return ctx.reply('❌ فشل رسم صفحة ' + pageNumber + ':\n' + (e.message || 'خطأ غير معروف'));
  }
}

async function playMushafPageAudio(ctx, pageNumber) {
  let folderPath = null;
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ جاري تجهيز الصوت...');
    const verses = await getPageVerseRange(pageNumber);
    if (!verses?.length) {
      return ctx.reply('❌ لم أتمكن من جلب آيات الصفحة ' + pageNumber + '.');
    }
    const reciter = getCurrentReciter(ctx);
    const result = await buildMergedAudioFile(verses, reciter.id, ctx.from.id);
    folderPath = result.folderPath;
    await ctx.replyWithAudio(
      { source: result.mergedPath },
      { caption: '🎧 صفحة ' + pageNumber + ' — ' + reciter.name }
    );
  } catch (e) {
    console.error('playMushafPageAudio error:', e.message);
    return ctx.reply('❌ فشل تجهيز صوت الصفحة ' + pageNumber + '.');
  } finally {
    cleanupTempFolder(folderPath);
  }
}

async function handleMushafGlossaryAction(ctx) {
  const pageNumber = parseInt(ctx.match[1], 10);
  if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ جاري التحليل...');
  try {
    if (isTajweedMushafViewer(ctx)) {
      const verses = await getPageVerseRange(pageNumber);
      if (!verses?.length) {
        return ctx.reply('❌ لم أتمكن من جلب آيات الصفحة ' + pageNumber + '.');
      }
      const verseKeys = verses.map((v) => v.surah + ':' + v.ayah);
      return showPageDifficultWords(ctx, verseKeys, pageNumber);
    }
    const pageData = await loadPageData(pageNumber);
    const verseKeys = extractVerseKeys(pageData);
    return showPageDifficultWords(ctx, verseKeys, pageNumber);
  } catch (e) {
    console.error('handleMushafGlossaryAction error:', e.message);
    return ctx.reply('❌ فشل جلب الكلمات الصعبة للصفحة ' + pageNumber + '.');
  }
}

async function showPageTafsir(ctx, pageNumber, sourceId = 'saadi') {
  const verses = await getPageVerseRange(pageNumber);
  if (!verses?.length) {
    return ctx.reply('❌ لم أتمكن من جلب آيات الصفحة ' + pageNumber + '.');
  }
  const sections = [];
  for (const { surah, ayah } of verses) {
    const data = await getTafsirFromSource(surah, ayah, sourceId);
    if (!data || data.unavailable || !data.tafsirText) continue;
    const sourceName = getTafsirSourceName(data.sourceId || sourceId);
    const surahName = data.surah ? data.surah.name : String(surah);
    sections.push(
      '*' + surahName + ' — آية ' + ayah + '* (' + sourceName + ')\n' + data.tafsirText
    );
  }
  if (!sections.length) {
    return ctx.reply('❌ التفسير غير متاح لآيات هذه الصفحة حالياً');
  }
  const header = '📚 *تفسير — صفحة ' + pageNumber + '*\n\n';
  const fullText = header + sections.join('\n\n');
  if (fullText.length <= 3800) {
    return ctx.reply(fullText, { parse_mode: 'Markdown' });
  }
  await ctx.reply(header, { parse_mode: 'Markdown' });
  let chunk = '';
  for (const section of sections) {
    if ((chunk + section).length > 3500) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
      chunk = '';
    }
    chunk += section + '\n\n';
  }
  if (chunk) await ctx.reply(chunk, { parse_mode: 'Markdown' });
}

async function handleMushafTafsirAction(ctx) {
  const pageNumber = parseInt(ctx.match[1], 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    return ctx.answerCbQuery('⚠️ رقم صفحة غير صالح', true);
  }
  if (ctx.callbackQuery) await ctx.answerCbQuery('⏳ جاري جلب التفسير...');
  try {
    return showPageTafsir(ctx, pageNumber);
  } catch (e) {
    console.error('handleMushafTafsirAction error:', e.message);
    return ctx.reply('❌ فشل جلب التفسير للصفحة ' + pageNumber + '.');
  }
}

async function showTajweedMushafPage(ctx, pageNumber, options = {}) {
  try {
    const num = Number(pageNumber);
    if (!Number.isFinite(num) || num < 1 || num > 604) {
      return ctx.reply('⚠️ رقم الصفحة يجب أن يكون بين 1 و 604.');
    }

    ctx.session.mushafViewer = 'tajweed';
    const editMode = options.editMode === true;
    const theme = options.theme || getMushafTheme(ctx);
    const outputPath = tajweedMushafPagePath(num, theme);
    const result = await renderTajweedMushafPageImage(num, outputPath, {
      theme,
      subtitle: 'صفحة ' + num
    });

    const caption = buildTajweedMushafPhotoCaption(num, theme);
    const keyboard = buildMushafPageKeyboard(num, theme, 'tajweed');

    if (editMode && ctx.callbackQuery?.message?.photo) {
      try {
        await ctx.editMessageMedia(
          { type: 'photo', media: { source: result.pngPath }, caption },
          keyboard
        );
        return;
      } catch (_) {}
    }

    if (!editMode) {
      await ctx.reply('⏳ جاري رسم صفحة ' + num + ' من المصحف المجوّد...');
    }
    await ctx.replyWithPhoto(
      { source: result.pngPath },
      { caption, ...keyboard }
    );
  } catch (e) {
    console.error('showTajweedMushafPage error:', e.message);
    return ctx.reply('❌ فشل رسم صفحة ' + pageNumber + ':\n' + (e.message || 'خطأ غير معروف'));
  }
}

async function startMushafPage(ctx, text) {
  const num = parseInt(String(text).trim(), 10);
  if (!Number.isFinite(num) || num < 1 || num > 604) {
    return ctx.reply('⚠️ رقم الصفحة يجب أن يكون بين 1 و 604.');
  }
  return showTajweedMushafPage(ctx, num);
}

async function handleMushafPagePromptAction(ctx) {
  return promptMushafPage(ctx);
}

async function hafizMode(ctx, text) {
  const match = text.trim().match(/^(\d+)\s*[:.]\s*(\d+)$/);
  if (!match) return ctx.reply('⚠️ الصيغة غير صحيحة. مثال: 2:255');
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  const reciter = getCurrentReciter(ctx);
  await ctx.reply('⏳ جاري تحميل الآية...');
  const [data, audio] = await Promise.all([
    getAyah(surah, ayah),
    getAyahAudio(surah, ayah, reciter.id)
  ]);
  if (!data) return ctx.reply('❌ لم أتمكن من جلب الآية.');
  await trySendAyahPhoto(ctx, surah, ayah, data.surah?.name);
  await ctx.reply(
    '🎓 *وضع الحافظ*\n\n' +
    '📖 *' + (data.surah ? data.surah.name : '') + '* - آية ' + ayah + '\n\n' + data.text,
    { parse_mode: 'Markdown' }
  );
  if (audio && audio.audio) {
    await ctx.replyWithAudio(audio.audio, { caption: '🎙️ ' + reciter.name + ' - استمع وكرر' });
  }
  await ctx.reply('اختر:', buildHafizActionKeyboard(surah, ayah));
}

async function openSurahAtAyah(ctx, surahNumber, ayahNumber) {
  const [view, ayahData] = await Promise.all([
    loadArabicSurahView(ctx, surahNumber),
    getAyah(surahNumber, ayahNumber)
  ]);
  if (!view || !ayahData) return ctx.reply('❌ لم أتمكن من تحميل السورة.');

  const shortName = shortSurahName(view.surahName || ayahData.surah?.name);
  await ctx.reply('📍 سورة ' + shortName + ' — الآية ' + ayahNumber);
  await ctx.reply(ayahData.text);

  ctx.session.quranSurahView = view;
  const pageIndex = findSurahPageForAyah(view, ayahNumber);

  if (view.totalPages === 1) {
    const pageText = highlightAyahInPage(view.pages[0], ayahNumber);
    const keyboard = buildSurahTextPageKeyboard(surahNumber, 1, 1, view.pageAyahNumbers[0] || []);
    await ctx.reply('📖 *سورة ' + escapeMarkdown(shortName) + ' كاملة* (عربي)', { parse_mode: 'Markdown' });
    await ctx.reply(pageText, { ...keyboard });
  } else if (view.totalPages <= 3) {
    await ctx.reply(
      '📖 *سورة ' + escapeMarkdown(shortName) + ' كاملة* (عربي) — ' + view.totalPages + ' صفحات',
      { parse_mode: 'Markdown' }
    );
    for (let p = 1; p <= view.totalPages; p++) {
      let pageText = view.pages[p - 1];
      if (p === pageIndex) pageText = highlightAyahInPage(pageText, ayahNumber);
      const ayahNumbers = view.pageAyahNumbers[p - 1] || [];
      const keyboard = buildSurahTextPageKeyboard(surahNumber, p, view.totalPages, ayahNumbers);
      await ctx.reply('📄 صفحة ' + p + '/' + view.totalPages, { ...keyboard });
      await ctx.reply(pageText);
    }
  } else {
    const pageText = highlightAyahInPage(view.pages[pageIndex - 1], ayahNumber);
    const ayahNumbers = view.pageAyahNumbers[pageIndex - 1] || [];
    const keyboard = buildSurahTextPageKeyboard(surahNumber, pageIndex, view.totalPages, ayahNumbers);
    await ctx.reply(
      '📖 *سورة ' + escapeMarkdown(shortName) + '* (عربي) — صفحة ' + pageIndex + '/' + view.totalPages + '\n' +
      '_استخدم ⬅️ ➡️ لتصفح السورة كاملة_',
      { parse_mode: 'Markdown', ...keyboard }
    );
    await ctx.reply(pageText);
  }

  if (view.audioUrl) {
    await ctx.replyWithAudio(view.audioUrl, { caption: view.audioCaption });
  }
}

async function showSearchResultsPage(ctx, pageIndex = 1) {
  const hits = ctx.session?.quranSearchHits;
  const query = ctx.session?.quranSearchQuery;
  if (!hits?.length || !query) {
    return ctx.reply('⚠️ لا توجد نتائج بحث حالية. استخدم 🔎 بحث في القرآن من جديد.');
  }
  const totalPages = Math.max(1, Math.ceil(hits.length / SEARCH_RESULTS_PER_PAGE));
  const page = Math.min(Math.max(1, pageIndex), totalPages);
  const msg = buildSearchResultsMessage(query, hits, page);
  const keyboard = buildSearchResultsKeyboard(hits, page, totalPages);
  const opts = { ...keyboard };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    return ctx.editMessageText(msg, opts);
  }
  return ctx.reply(msg, opts);
}

async function searchInQuran(ctx, keyword) {
  try {
    if (!keyword || !keyword.trim()) return ctx.reply('⚠️ أدخل كلمة أو أكثر للبحث.');
    const data = await searchQuran(keyword.trim());
    if (!data || !data.matches || !data.matches.length) {
      return ctx.reply('🔎 لا توجد آيات تحتوي على "' + keyword.trim() + '".');
    }
    const matches = data.matches.map(m =>
      '📍 *' + (m.surah ? m.surah.name : '') + '* - آية ' + m.numberInSurah + '\n' + m.text
    );
    const header = '🔎 *نتائج البحث عن:* _' + keyword.trim() + '_ (' + data.matches.length + ' نتيجة)\n\n';
    const fullText = header + matches.join('\n\n');
    if (fullText.length <= 3800) {
      await ctx.reply(fullText, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(header, { parse_mode: 'Markdown' });
      let chunk = '';
      for (const m of matches) {
        if ((chunk + m).length > 3500) {
          await ctx.reply(chunk, { parse_mode: 'Markdown' });
          chunk = '';
        }
        chunk += m + '\n\n';
      }
      if (chunk) await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    console.error('searchInQuran error:', e.message);
    return ctx.reply('❌ حدث خطأ في البحث، حاول مرة أخرى.');
  }
}

async function promptAyah(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.quranAyahPrompt = true;
  return ctx.reply('🔢 أرسل رقم السورة والآية:\nمثال: 2:255');
}

async function readAyah(ctx, text) {
  const match = text.trim().match(/^(\d+)\s*[:.]\s*(\d+)$/);
  if (!match) return ctx.reply('⚠️ الصيغة غير صحيحة. مثال: 2:255');
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  const reciter = getCurrentReciter(ctx);
  const [data, audio] = await Promise.all([
    getAyah(surah, ayah),
    getAyahAudio(surah, ayah, reciter.id)
  ]);
  if (!data) return ctx.reply('❌ لم أتمكن من جلب الآية.');
  await trySendAyahPhoto(ctx, surah, ayah, data.surah?.name);
  await ctx.reply(
    '📖 *' + (data.surah ? data.surah.name : '') + '* - آية ' + ayah + '\n\n' + data.text,
    { parse_mode: 'Markdown' }
  );
  if (audio && audio.audio) {
    await ctx.replyWithAudio(audio.audio, { caption: '🎙️ ' + reciter.name });
  }
  await ctx.reply('اختر:', buildAyahActionKeyboard(surah, ayah));
}

async function handleReadSurahAction(ctx) {
  await ctx.answerCbQuery();
  return readSurah(ctx, parseInt(ctx.match[1], 10));
}

async function handleSurahPageAction(ctx) {
  await ctx.answerCbQuery();
  return showSurahs(ctx, parseInt(ctx.match[1], 10));
}

async function handleLangPageAction(ctx) {
  const parsed = parseInt(ctx.match[1], 10);
  return showLanguages(ctx, Number.isFinite(parsed) ? parsed : 1, { answered: true });
}

async function handleSurahTextPageAction(ctx) {
  await ctx.answerCbQuery();
  return showSurahTextPage(
    ctx,
    parseInt(ctx.match[1], 10),
    parseInt(ctx.match[2], 10)
  );
}

async function handleHafizRepeatAction(ctx) {
  await ctx.answerCbQuery();
  ctx.session.quranHafizMode = true;
  return hafizMode(ctx, ctx.match[1] + ':' + ctx.match[2]);
}

async function handleHafizNextAction(ctx) {
  await ctx.answerCbQuery();
  ctx.session.quranHafizMode = true;
  return hafizMode(ctx, ctx.match[1] + ':' + (parseInt(ctx.match[2], 10) + 1));
}

async function handleSearchGoAction(ctx) {
  await ctx.answerCbQuery();
  const surah = parseInt(ctx.match[1], 10);
  const ayah = parseInt(ctx.match[2], 10);
  return openSurahAtAyah(ctx, surah, ayah);
}

async function handleSearchPageAction(ctx) {
  return showSearchResultsPage(ctx, parseInt(ctx.match[1], 10));
}

async function handleSearchPromptAction(ctx) {
  ctx.session.searchingQuran = true;
  await ctx.answerCbQuery();
  await ctx.reply(
    '🔎 *بحث في القرآن*\n\n' +
    'أرسل *كلمة* من آيات القرآن أو *رقم آية*:\n' +
    'مثال: _الضالين_ أو _2:255_',
    { parse_mode: 'Markdown' }
  );
}

async function handleSurahSearchPromptAction(ctx) {
  ctx.session.searchingSurahName = true;
  await ctx.answerCbQuery();
  await ctx.reply(
    '⚡ *بحث سريع في السور*\n\nاكتب *اسم السورة* أو *رقمها*:\n' +
    'مثال: _الفاتحة_ أو _يس_ أو _36_',
    { parse_mode: 'Markdown' }
  );
}

async function handleSearchAction(ctx) {
  ctx.session.searchingQuran = true;
  await ctx.answerCbQuery();
  await ctx.reply('🔍 أرسل كلمة البحث في القرآن الكريم الآن:');
}

async function handleNoopAction(ctx) {
  return ctx.answerCbQuery();
}

async function handleListenNextSurahAction(ctx) {
  const current = parseInt(ctx.match[1], 10);
  const controlMsgId = ctx.callbackQuery?.message?.message_id;
  const active = ctx.session.quranListenActiveSurah;

  if (controlMsgId !== ctx.session.quranListenControlMsgId) {
    return ctx.answerCbQuery('⚠️ زر قديم — استخدم الزر أسفل آخر سورة', true);
  }
  if (active && current !== active) {
    return ctx.answerCbQuery('⚠️ زر قديم — استخدم الزر أسفل آخر سورة', true);
  }
  if (ctx.session.quranListenLoading) {
    return ctx.answerCbQuery('⏳ انتظر اكتمال التحميل...', true);
  }

  const next = current + 1;
  if (next > 114) {
    return ctx.answerCbQuery('✅ هذه آخر سورة في المصحف', true);
  }
  await ctx.answerCbQuery('⏳ تحميل سورة ' + next + ' بالأسفل...').catch(() => {});
  return listenFullSurah(ctx, next, { fromNext: true });
}

async function handleShowSurahsAction(ctx) {
  return showSurahs(ctx, 1);
}

module.exports = {
  quranMenu,
  showSurahs,
  showReciters,
  setReciter,
  showLanguages,
  setLanguage,
  readSurah,
  listenFullSurah,
  showSurahTextPage,
  showTafsir,
  showGlossary,
  promptHafiz,
  promptHafizPage,
  startRecitationCheckPage,
  handleRecitationVoice,
  buildPageExpectedText,
  formatRecitationCheckResult,
  startHafizPageDrill,
  runHafizPageDrill,
  promptMushafPage,
  startMushafPage,
  showMushafPage,
  showTajweedMushafPage,
  showPageTafsir,
  openMushaf,
  showMushafIndexMenu,
  browseMushafBySurah,
  browseMushafByJuz,
  buildMushafPageKeyboard,
  buildMushafSurahKeyboard,
  buildMushafJuzKeyboard,
  playMushafPageAudio,
  hafizMode,
  searchInQuran,
  searchSurahByName,
  promptAyah,
  readAyah,
  paginateSurahLines,
  buildSurahKeyboard,
  showLanguages,
  buildLanguageKeyboard,
  getQuranLangPageCount,
  getQuranLangPageSlice,
  usesQuranLangPagination,
  findLanguageByEdition,
  normalizeQuranLangPage,
  QURAN_LANGS_PER_PAGE,
  QURAN_LANG_PAGINATION_MIN,
  fetchAyahPlayPayload,
  showQuranLatinAyah,
  handleQuranLatinAyahAction,
  buildAyahActionKeyboard,
  trySendAyahPhoto,
  isQuranSimpleMode,
  SURAH_PAGE_CHAR_LIMIT,
  SIMPLE_AYAHS_PER_PAGE
};

const registry = require('../core/actionRegistry');

registry.registerMenu('📖 القرآن الكريم', quranMenu, 'القرآن الكريم');

registry.registerAction('quran_menu', quranMenu, 'قائمة القرآن');
registry.registerAction('quran_show_surahs', handleShowSurahsAction, 'قائمة السور');
registry.registerAction('quran_show_languages', (ctx) => showLanguages(ctx, 1), 'لغات القرآن');
registry.registerAction('quran_show_reciters', showReciters, 'قراء القرآن');
registry.registerAction('quran_ayah_prompt', promptAyah, 'آية محددة');
registry.registerAction('quran_hafiz_prompt', promptHafiz, 'وضع الحافظ');
registry.registerAction('quran_hafiz_ayah_choice', promptHafizAyahChoice, 'آية محددة للحافظ');
registry.registerAction('quran_hafiz_page_prompt', handleHafizPagePromptAction, 'قراءة صفحة المصحف');
registry.registerAction('quran_mushaf_page_prompt', handleMushafPagePromptAction, 'صفحة المصحف الأصلية');
registry.registerAction('quran_recitation_check_prompt', handleRecitationCheckPromptAction, 'اختبار التسميع');
registry.registerAction('mushaf_open', openMushaf, 'فتح المصحف');
registry.registerAction('mushaf_index', showMushafIndexMenu, 'فهرس المصحف');
registry.registerAction('mushaf_browse_surah', (ctx) => browseMushafBySurah(ctx, 1), 'تصفح المصحف بالسورة');
registry.registerAction('mushaf_browse_juz', browseMushafByJuz, 'تصفح المصحف بالجزء');
registry.registerAction(/^mushaf_nav_(\d+)$/, handleMushafNavAction, 'تنقل صفحة المصحف');
registry.registerAction(/^mushaf_surah_pick_(\d+)$/, (ctx) => openMushafAtSurah(ctx, parseInt(ctx.match[1], 10)), 'فتح سورة في المصحف');
registry.registerAction(/^mushaf_surah_page_(\d+)$/, (ctx) => browseMushafBySurah(ctx, parseInt(ctx.match[1], 10)), 'صفحة قائمة سور المصحف');
registry.registerAction(/^mushaf_juz_(\d+)$/, (ctx) => openMushafAtJuz(ctx, parseInt(ctx.match[1], 10)), 'فتح جزء في المصحف');
registry.registerAction(/^mushaf_listen_(\d+)$/, (ctx) => playMushafPageAudio(ctx, parseInt(ctx.match[1], 10)), 'استماع صفحة المصحف');
registry.registerAction(/^mushaf_glossary_(\d+)$/, handleMushafGlossaryAction, 'كلمات صعبة لصفحة المصحف');
registry.registerAction(/^mushaf_tafsir_(\d+)$/, handleMushafTafsirAction, 'تفسير صفحة المصحف');
registry.registerAction(/^mushaf_theme_toggle_(\d+)$/, handleMushafThemeToggleAction, 'تبديل وضع المصحف ليلي/نهاري');
registry.registerAction('quran_hafiz_stop', handleHafizStopAction, 'إيقاف تسميع الصفحة');
registry.registerAction('quran_toggle_simple', toggleQuranSimpleMode, 'تبديل الوضع المبسط');
registry.registerAction('noop', handleNoopAction, 'زر معطل');
registry.registerAction(/^quran_read_(\d+)$/, handleReadSurahAction, 'قراءة سورة');
registry.registerAction(/^quran_page_(\d+)$/, handleSurahPageAction, 'صفحة السور');
registry.registerAction(/^quran_lang_page_(\d+)$/, handleLangPageAction, 'صفحة لغات القرآن');
registry.registerAction(/^quran_surah_page_(\d+)_(\d+)$/, handleSurahTextPageAction, 'صفحة نص السورة');
registry.registerAction(/^quran_listen_full_(\d+)$/, async (ctx) => {
  return listenFullSurah(ctx, parseInt(ctx.match[1], 10));
}, 'استماع سورة كاملة');
registry.registerAction(/^quran_listen_next_(\d+)$/, handleListenNextSurahAction, 'السورة التالية للاستماع');
registry.registerAction(/^quran_set_lang_(.+)$/, (ctx) => setLanguage(ctx, ctx.match[1]), 'تعيين لغة القرآن');
registry.registerAction(/^quran_set_reciter_(.+)$/, (ctx) => setReciter(ctx, ctx.match[1]), 'تعيين قارئ');
registry.registerAction(/^quran_tafsir_(\d+)_(\d+)$/, (ctx) => showTafsir(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)), 'تفسير آية');
registry.registerAction(/^quran_tafsir_src_(\d+)_(\d+)_(\w+)$/, (ctx) => showTafsir(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), ctx.match[3]), 'تبديل مصدر التفسير');
registry.registerAction(/^quran_ayah_play_(\d+)_(\d+)$/, handleAyahPlayAction, 'تشغيل آية بالصوت والتفسير');
registry.registerAction(/^quran_latin_(\d+)_(\d+)$/, handleQuranLatinAyahAction, 'عرض آية بالأحرف اللاتينية');
registry.registerAction(/^latin_surah_audio_(\d+)$/, handleLatinSurahAudioAction, 'استماع سورة لاتينية');
registry.registerAction(/^latin_listen_(\d+)_(\d+)$/, handleLatinListenAction, 'اختيار تكرار آية لاتينية');
registry.registerAction(/^latin_repeat_(\d+)_(\d+)_(\d+)$/, handleLatinRepeatAction, 'استماع آية لاتينية متكررة');
registry.registerAction(/^latin_full_(\d+)$/, handleLatinFullSurahAction, 'استماع سورة لاتينية كاملة');
registry.registerAction(/^quran_glossary_(\d+)_(\d+)$/, (ctx) => showGlossary(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)), 'كلمات صعبة');
registry.registerAction(/^quran_hafiz_repeat_(\d+)_(\d+)$/, handleHafizRepeatAction, 'تكرار آية الحافظ');
registry.registerAction(/^quran_hafiz_next_(\d+)_(\d+)$/, handleHafizNextAction, 'الآية التالية للحافظ');
registry.registerAction('quran_surah_search_prompt', handleSurahSearchPromptAction, 'بحث سريع في السور');
registry.registerAction('quran_search_prompt', handleSearchPromptAction, 'بحث القرآن');
registry.registerAction('quran_search', handleSearchAction, 'بحث القرآن (لوحة الشيخ)');
registry.registerAction(/^quran_search_go_(\d+)_(\d+)$/, handleSearchGoAction, 'فتح نتيجة بحث القرآن');
registry.registerAction(/^quran_search_page_(\d+)$/, handleSearchPageAction, 'صفحة نتائج بحث القرآن');

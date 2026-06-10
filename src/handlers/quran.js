process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Markup } = require('telegraf');
const { 
  getSurahs, getSurah, getSurahTranslation, 
  getAyah, getAyahAudio, getSurahAudio,
  getTafsir, searchQuran, RECITERS, ALL_LANGUAGES 
} = require('../services/quranApi');

function getCurrentLanguage(ctx) {
  const code = ctx.session?.quranLanguageCode || 'ar';
  return ALL_LANGUAGES.find(l => l.code === code) || ALL_LANGUAGES[0];
}

function getCurrentReciter(ctx) {
  const id = ctx.session?.quranReciter || 'ar.alafasy';
  return RECITERS.find(r => r.id === id) || RECITERS[0];
}

function buildSurahKeyboard(surahs, page = 1) {
  const perPage = 10;
  const pageIndex = Math.max(1, Number(page));
  const start = (pageIndex - 1) * perPage;
  const pageSurahs = surahs.slice(start, start + perPage);
  const rows = pageSurahs.map(s => [
    Markup.button.callback(`${s.number}. ${s.name}`, `quran_read_${s.number}`)
  ]);
  const nav = [];
  if (pageIndex > 1) nav.push(Markup.button.callback('⬅️ السابق', `quran_page_${pageIndex - 1}`));
  if (start + perPage < surahs.length) nav.push(Markup.button.callback('التالي ➡️', `quran_page_${pageIndex + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 القائمة الرئيسية', 'quran_menu')]);
  return Markup.inlineKeyboard(rows);
}

async function quranMenu(ctx) {
  const lang = getCurrentLanguage(ctx);
  const reciter = getCurrentReciter(ctx);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📜 قائمة السور', 'quran_show_surahs')],
    [Markup.button.callback('🎙️ القارئ: ' + reciter.name, 'quran_show_reciters')],
    [Markup.button.callback('🌍 اللغة: ' + lang.name, 'quran_show_languages')],
    [Markup.button.callback('🔎 بحث في القرآن', 'quran_search_prompt')],
    [Markup.button.callback('🔢 آية محددة', 'quran_ayah_prompt')],
    [Markup.button.callback('🎓 وضع الحافظ', 'quran_hafiz_prompt')],
  ]);
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    return ctx.editMessageText('📖 *القرآن الكريم*\n\nاختر ما تريد:', { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply('📖 *القرآن الكريم*\n\nاختر ما تريد:', { parse_mode: 'Markdown', ...keyboard });
}

async function showSurahs(ctx, page = 1) {
  try {
    const surahs = await getSurahs();
    if (!surahs.length) return ctx.reply('❌ فشل جلب السور.');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      return ctx.editMessageText('📚 *قائمة السور*\nاختر سورة:', {
        parse_mode: 'Markdown',
        ...buildSurahKeyboard(surahs, page)
      });
    }
    return ctx.reply('📚 *قائمة السور*\nاختر سورة:', {
      parse_mode: 'Markdown',
      ...buildSurahKeyboard(surahs, page)
    });
  } catch (e) {
    return ctx.reply('❌ حدث خطأ.');
  }
}

async function showReciters(ctx) {
  const rows = [];
  const hafiz = RECITERS.filter(r => r.rewaya === 'حفص');
  const warsh = RECITERS.filter(r => r.rewaya === 'ورش');
  rows.push([Markup.button.callback('── رواية حفص ──', 'noop')]);
  hafiz.forEach(r => rows.push([Markup.button.callback(r.name, 'quran_set_reciter_' + r.id)]));
  rows.push([Markup.button.callback('── رواية ورش ──', 'noop')]);
  warsh.forEach(r => rows.push([Markup.button.callback(r.name, 'quran_set_reciter_' + r.id)]));
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

async function showLanguages(ctx) {
  const rows = [];
  for (let i = 0; i < ALL_LANGUAGES.length; i += 2) {
    const row = [Markup.button.callback(ALL_LANGUAGES[i].name, 'quran_set_lang_' + ALL_LANGUAGES[i].code)];
    if (ALL_LANGUAGES[i + 1]) {
      row.push(Markup.button.callback(ALL_LANGUAGES[i + 1].name, 'quran_set_lang_' + ALL_LANGUAGES[i + 1].code));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔙 رجوع', 'quran_menu')]);
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  return ctx.callbackQuery
    ? ctx.editMessageText('🌍 *اختر اللغة:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) })
    : ctx.reply('🌍 *اختر اللغة:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
}

async function setLanguage(ctx, code) {
  const lang = ALL_LANGUAGES.find(l => l.code === code);
  if (!lang) return ctx.answerCbQuery('⚠️ لغة غير مدعومة', true);
  ctx.session.quranLanguageCode = lang.code;
  await ctx.answerCbQuery('✅ تم اختيار ' + lang.name);
  return quranMenu(ctx);
}

async function readSurah(ctx, surahNumber) {
  try {
    const lang = getCurrentLanguage(ctx);
    const reciter = getCurrentReciter(ctx);
    await ctx.reply('⏳ جاري تحميل السورة...');
    const [arabicSurah, translatedSurah, audioSurah] = await Promise.all([
      getSurah(surahNumber),
      lang.code === 'ar' ? null : getSurahTranslation(surahNumber, lang.edition),
      getSurahAudio(surahNumber, reciter.id)
    ]);
    if (!arabicSurah) return ctx.reply('❌ لم أتمكن من تحميل السورة.');
    const lines = (lang.code === 'ar' || !translatedSurah)
      ? arabicSurah.ayahs.map(a => a.numberInSurah + '. ' + a.text)
      : translatedSurah.ayahs.map(a => a.numberInSurah + '. ' + a.text);
    const header = '📖 *سورة ' + arabicSurah.name + '* (' + arabicSurah.englishName + ')\n' +
      'عدد الآيات: ' + arabicSurah.numberOfAyahs + ' | اللغة: ' + lang.name + '\n' +
      'القارئ: ' + reciter.name + '\n\n';
    const content = lines.slice(0, 12).join('\n\n');
    const footer = arabicSurah.numberOfAyahs > 12 ? '\n\n_عرضنا أول 12 آية من ' + arabicSurah.numberOfAyahs + '_' : '';
    await ctx.reply(header + content + footer, { parse_mode: 'Markdown' });
    if (audioSurah && audioSurah.ayahs && audioSurah.ayahs[0] && audioSurah.ayahs[0].audio) {
      await ctx.replyWithAudio(audioSurah.ayahs[0].audio, {
        caption: '🎙️ ' + reciter.name + ' - سورة ' + arabicSurah.name + ' (أول آية)'
      });
    }
    await ctx.reply('اختر:', Markup.inlineKeyboard([
      [Markup.button.callback('📖 تفسير الآية الأولى', 'quran_tafsir_' + surahNumber + '_1')],
      [Markup.button.callback('🔙 قائمة السور', 'quran_show_surahs')]
    ]));
  } catch (e) {
    console.error('readSurah error:', e.message);
    return ctx.reply('❌ حدث خطأ.');
  }
}

async function showTafsir(ctx, surah, ayah) {
  try {
    if (ctx.callbackQuery) await ctx.answerCbQuery();
    const data = await getTafsir(surah, ayah);
    if (!data) return ctx.reply('❌ لم أتمكن من جلب التفسير.');
    await ctx.reply(
      '📚 *تفسير سورة ' + (data.surah ? data.surah.name : '') + ' - آية ' + ayah + '*\n\n' +
      '*الآية:* ' + data.text + '\n\n' +
      '*التفسير الميسر:*\n' + data.text,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    return ctx.reply('❌ حدث خطأ في التفسير.');
  }
}

async function promptHafiz(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.quranHafizMode = true;
  return ctx.reply(
    '🎓 *وضع الحافظ*\n\nأرسل رقم السورة والآية:\nمثال: 2:255',
    { parse_mode: 'Markdown' }
  );
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
  await ctx.reply(
    '🎓 *وضع الحافظ*\n\n' +
    '📖 *' + (data.surah ? data.surah.name : '') + '* - آية ' + ayah + '\n\n' + data.text,
    { parse_mode: 'Markdown' }
  );
  if (audio && audio.audio) {
    await ctx.replyWithAudio(audio.audio, { caption: '🎙️ ' + reciter.name + ' - استمع وكرر' });
  }
  await ctx.reply('اختر:', Markup.inlineKeyboard([
    [Markup.button.callback('🔄 كرر نفس الآية', 'quran_hafiz_repeat_' + surah + '_' + ayah)],
    [Markup.button.callback('⏭️ الآية التالية', 'quran_hafiz_next_' + surah + '_' + ayah)],
    [Markup.button.callback('📚 تفسير', 'quran_tafsir_' + surah + '_' + ayah)],
    [Markup.button.callback('🔙 رجوع', 'quran_menu')]
  ]));
}

async function searchInQuran(ctx, keyword) {
  try {
    if (!keyword || !keyword.trim()) return ctx.reply('⚠️ أدخل كلمة للبحث.');
    const data = await searchQuran(keyword.trim());
    if (!data || !data.matches || !data.matches.length) return ctx.reply('🔎 لا توجد نتائج.');
    const matches = data.matches.slice(0, 6).map(m =>
      '*' + (m.surah ? m.surah.name : '') + '* - آية ' + m.numberInSurah + '\n' + m.text
    );
    await ctx.reply('🔎 *نتائج البحث:* _' + keyword + '_\n\n' + matches.join('\n\n'), {
      parse_mode: 'Markdown'
    });
  } catch (e) {
    return ctx.reply('❌ حدث خطأ في البحث.');
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
  await ctx.reply(
    '📖 *' + (data.surah ? data.surah.name : '') + '* - آية ' + ayah + '\n\n' + data.text,
    { parse_mode: 'Markdown' }
  );
  if (audio && audio.audio) {
    await ctx.replyWithAudio(audio.audio, { caption: '🎙️ ' + reciter.name });
  }
  await ctx.reply('اختر:', Markup.inlineKeyboard([
    [Markup.button.callback('📚 تفسير', 'quran_tafsir_' + surah + '_' + ayah)],
    [Markup.button.callback('🎓 وضع الحافظ', 'quran_hafiz_prompt')],
    [Markup.button.callback('🔙 رجوع', 'quran_menu')]
  ]));
}

module.exports = {
  quranMenu,
  showSurahs,
  showReciters,
  setReciter,
  showLanguages,
  setLanguage,
  readSurah,
  showTafsir,
  promptHafiz,
  hafizMode,
  searchInQuran,
  promptAyah,
  readAyah
};
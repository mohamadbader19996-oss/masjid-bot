process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Markup } = require('telegraf');
const { getSurahs, getSurah, getSurahTranslation, getAyah, searchQuran } = require('../services/quranApi');

const LANGUAGES = [
  { code: 'ar', name: 'العربية 🇸🇦', edition: 'ar.alafasy' },
  { code: 'de', name: 'Deutsch 🇩🇪', edition: 'de.bubenheim' },
  { code: 'en', name: 'English 🇬🇧', edition: 'en.sahih' },
  { code: 'tr', name: 'Türkçe 🇹🇷', edition: 'tr.ates' },
  { code: 'fr', name: 'Français 🇫🇷', edition: 'fr.hamidullah' },
  { code: 'ru', name: 'Русский 🇷🇺', edition: 'ru.kuliev' },
  { code: 'id', name: 'Bahasa Indonesia 🇮🇩', edition: 'id.indonesian' }
];

function getCurrentLanguage(ctx) {
  const code = ctx.session?.quranLanguageCode || 'ar';
  return LANGUAGES.find((lang) => lang.code === code) || LANGUAGES[0];
}

function buildSurahKeyboard(surahs, page = 1) {
  const perPage = 10;
  const pageIndex = Math.max(1, Number(page));
  const start = (pageIndex - 1) * perPage;
  const pageSurahs = surahs.slice(start, start + perPage);

  const rows = pageSurahs.map((surah) => [
    Markup.button.callback(`${surah.number}. ${surah.name}`, `quran_read_${surah.number}`)
  ]);

  const pages = [];
  if (pageIndex > 1) pages.push(Markup.button.callback('⬅️ السابق', `quran_page_${pageIndex - 1}`));
  if (start + perPage < surahs.length) pages.push(Markup.button.callback('التالي ➡️', `quran_page_${pageIndex + 1}`));
  if (pages.length) rows.push(pages);
  rows.push([Markup.button.callback('🔙 القائمة الرئيسية', 'quran_menu')]);

  return Markup.inlineKeyboard(rows);
}

// القائمة الرئيسية للقرآن
async function quranMenu(ctx) {
  const current = getCurrentLanguage(ctx);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📜 قائمة السور', 'quran_show_surahs')],
    [Markup.button.callback(`🌍 اللغة الحالية: ${current.name}`, 'quran_show_languages')],
    [Markup.button.callback('🔎 بحث في القرآن', 'quran_search_prompt')],
    [Markup.button.callback('🔢 آية محددة', 'quran_ayah_prompt')]
  ]);

  return ctx.reply(
    `📖 *القرآن الكريم*\n\nاختر أحد الخيارات التالية:\n- استخدم قائمة السور للتنقل بسرعة\n- اختر لغة الترجمة المفضلة\n- ابحث عن كلمة أو آية مباشرة`,
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function showSurahs(ctx, page = 1) {
  try {
    const surahs = await getSurahs();
    if (!surahs.length) {
      return ctx.reply('❌ فشل جلب قائمة السور. حاول مرة أخرى لاحقاً.');
    }

    const message = `📚 *قائمة السور*\n\n` +
      `اختر رقم السورة لقراءة النص الكامل أو استخدم الأزرار التالية.\n`;

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...buildSurahKeyboard(surahs, page)
      });
    }

    return ctx.reply(message, {
      parse_mode: 'Markdown',
      ...buildSurahKeyboard(surahs, page)
    });
  } catch (error) {
    console.error('quran.showSurahs error:', error.message || error);
    return ctx.reply('❌ حدث خطأ عند تحميل السور.');
  }
}

async function setLanguage(ctx, code) {
  const selected = LANGUAGES.find((lang) => lang.code === code);
  if (!selected) {
    return ctx.answerCbQuery('⚠️ هذه اللغة غير مدعومة.', true);
  }

  ctx.session.quranLanguageCode = selected.code;
  await ctx.answerCbQuery(`✅ تم تبديل اللغة إلى ${selected.name}`);
  return quranMenu(ctx);
}

async function showLanguages(ctx) {
  const rows = LANGUAGES.map((lang) => [
    Markup.button.callback(lang.name, `quran_set_lang_${lang.code}`)
  ]);
  rows.push([Markup.button.callback('🔙 القائمة الرئيسية', 'quran_menu')]);

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    return ctx.editMessageText('🌍 *اختر لغة المصحف أو الترجمة:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    });
  }

  return ctx.reply('🌍 *اختر لغة المصحف أو الترجمة:*', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(rows)
  });
}

async function readSurah(ctx, surahNumber) {
  try {
    const selected = getCurrentLanguage(ctx);
    await ctx.reply('⏳ جاري تحميل السورة...');

    const [arabicSurah, translatedSurah] = await Promise.all([
      getSurah(surahNumber),
      selected.code === 'ar' ? null : getSurahTranslation(surahNumber, selected.edition)
    ]);

    if (!arabicSurah) {
      return ctx.reply('❌ لم أتمكن من تحميل السورة. حاول مرة أخرى.');
    }

    const lines = (selected.code === 'ar' || !translatedSurah)
      ? arabicSurah.ayahs.map((ayah) => `${ayah.numberInSurah}. ${ayah.text}`)
      : translatedSurah.ayahs.map((ayah) => `${ayah.numberInSurah}. ${ayah.text}`);

    const header = `📖 *سورة ${arabicSurah.name}* (${arabicSurah.englishName})\nعدد الآيات: ${arabicSurah.numberOfAyahs}\nاللغة: ${selected.name}\n\n`;
    const content = lines.slice(0, 12).join('\n\n');
    const footer = arabicSurah.numberOfAyahs > 12 ? `\n\n_عرضنا أول 12 آية من أصل ${arabicSurah.numberOfAyahs} آية_` : '';

    await ctx.reply(`${header}${content}${footer}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('quran.readSurah error:', error.message || error);
    return ctx.reply('❌ حدث خطأ عند تحميل السورة.');
  }
}

async function searchInQuran(ctx, keyword) {
  try {
    if (!keyword || !keyword.trim()) {
      return ctx.reply('⚠️ أدخل كلمة أو جملة للبحث عنها.');
    }

    const data = await searchQuran(keyword.trim());
    if (!data || !data.matches?.length) {
      return ctx.reply('🔎 لا توجد نتائج مطابقة. حاول كلمة أخرى.');
    }

    const matches = data.matches.slice(0, 6).map((match) => {
      const surahName = match.surah?.name || match.surah?.englishName || 'سورة غير معروفة';
      return `*${surahName}* - آية ${match.numberInSurah}\n${match.text}`;
    });

    await ctx.reply(`🔎 *نتائج البحث عن:* _${keyword}_\n\n${matches.join('\n\n')}`, {
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('quran.searchInQuran error:', error.message || error);
    return ctx.reply('❌ حدث خطأ أثناء البحث.');
  }
}

async function promptAyah(ctx) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  ctx.session.quranAyahPrompt = true;
  return ctx.reply('🔢 أرسل رقم السورة ورقم الآية بصيغة: سورة:آية\nمثال: 2:255');
}

async function readAyah(ctx, text) {
  const match = text.trim().match(/^(\d+)\s*[:.]\s*(\d+)$/);
  if (!match) {
    return ctx.reply('⚠️ الصيغة غير صحيحة. أرسل مثل: 2:255');
  }

  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  const result = await getAyah(surah, ayah);
  if (!result) {
    return ctx.reply('❌ لم أتمكن من جلب الآية. تأكد من الأرقام.');
  }

  await ctx.reply(`📖 *سورة ${result.surah?.name || ''}* - آية ${result.numberInSurah}\n\n${result.text}`, {
    parse_mode: 'Markdown'
  });
}

module.exports = {
  quranMenu,
  showSurahs,
  setLanguage,
  readSurah,
  searchInQuran,
  showLanguages,
  promptAyah,
  readAyah
};
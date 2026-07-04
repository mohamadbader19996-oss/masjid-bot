const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const registry = require('../core/actionRegistry');
const { askGemini } = require('../services/gemini');
const { getUiLangDisplayName } = require('../i18n/languagePickerOptions');
const {
  getAllChapters,
  getChapterById,
  updateChapter
} = require('../services/hisnMuslimData');
const { SURAH_PAGE_CONTENT_LIMIT } = require('./quran');
const { cancelKeyboard, mainKeyboard } = require('../keyboards');

const LIST_PER_PAGE = 8;
const CONTENT_LIMIT = SURAH_PAGE_CONTENT_LIMIT;

function getUserUiLang(ctx) {
  const user = db.getUser(ctx.from.id);
  const lang = user?.uiLang || ctx.session?.uiLang || 'ar';
  return lang === 'ar' || !lang ? 'ar' : lang;
}

function paginateHisnBlocks(blocks, title) {
  const contentPages = [];
  let current = [];
  let currentLen = 0;

  for (const block of blocks) {
    const addition = current.length ? block.length + 2 : block.length;
    if (current.length && currentLen + addition > CONTENT_LIMIT) {
      contentPages.push(current.join('\n\n'));
      current = [block];
      currentLen = block.length;
    } else {
      current.push(block);
      currentLen += addition;
    }
  }
  if (current.length) contentPages.push(current.join('\n\n'));

  const safePages = contentPages.length ? contentPages : [''];
  const totalPages = safePages.length;
  return safePages.map((content, idx) => {
    const header = idx === 0
      ? `🛡️ *${title}*\n\n`
      : `🛡️ *${title}* — صفحة ${idx + 1}/${totalPages}\n\n`;
    return header + content;
  });
}

function formatDhikrBlock(item, translationEntry) {
  const bless = translationEntry?.bless ?? item.bless ?? '';
  const source = translationEntry?.source ?? item.source ?? '';
  let block = item.zekr;
  if (Number(item.repeat) > 1) {
    block += `\n🔁 التكرار: ${item.repeat} مرات`;
  }
  if (bless) block += `\n✨ ${bless}`;
  if (source) block += `\n📚 المصدر: ${source}`;
  return block;
}

function parseTranslationJson(raw, expectedLen) {
  const trimmed = String(raw || '').trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length !== expectedLen) return null;
  return parsed.map((entry) => ({
    bless: String(entry?.bless || '').trim(),
    source: String(entry?.source || '').trim()
  }));
}

async function ensureChapterTranslation(chapter, lang) {
  if (lang === 'ar') return null;
  if (chapter.translations?.[lang]) return chapter.translations[lang];

  const payload = chapter.content.map((item, index) => ({
    index,
    bless: item.bless || '',
    source: item.source || ''
  }));

  const hasMeta = payload.some((p) => p.bless || p.source);
  let translated;
  if (!hasMeta) {
    translated = payload.map(() => ({ bless: '', source: '' }));
  } else {
    const langName = getUiLangDisplayName(lang);
    const prompt =
      `Translate ONLY the "bless" (virtue/fadl) and "source" (hadith reference) fields to ${langName}. ` +
      'Do NOT translate Arabic dhikr text. Return JSON array only with the same length and order, ' +
      'each item: {"bless":"...","source":"..."}.\n\n' +
      JSON.stringify(payload, null, 2);

    const response = await askGemini(
      prompt,
      'You translate Islamic metadata accurately. Return valid JSON array only, no markdown.'
    );
    const raw = typeof response === 'string' ? response : response?.text || '';
    try {
      translated = parseTranslationJson(raw, chapter.content.length);
    } catch (e) {
      console.error('[hisnMuslim] translation parse error:', e.message);
      translated = null;
    }
    if (!translated) {
      translated = payload.map(() => ({ bless: '', source: '' }));
    }
  }

  if (!chapter.translations) chapter.translations = {};
  chapter.translations[lang] = translated;
  updateChapter(chapter);
  console.log(`[hisnMuslim] cached translation for chapter ${chapter.id} lang=${lang}`);
  return translated;
}

async function handleHisnMuslimMenu(ctx) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔍 بحث في الأبواب', 'hisn_search_start')],
    [Markup.button.callback('📖 تصفّح الأبواب', 'hisn_list_page_1')]
  ]);
  const text = '🛡️ *حصن المسلم*\n\nأدعية وأذكار من السنة النبوية';
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function handleHisnListPage(ctx, page) {
  const chapters = getAllChapters();
  if (!chapters.length) {
    await ctx.answerCbQuery?.().catch(() => {});
    return ctx.reply('⚠️ لم يتم تحميل بيانات حصن المسلم بعد.');
  }

  const totalPages = Math.max(1, Math.ceil(chapters.length / LIST_PER_PAGE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * LIST_PER_PAGE;
  const slice = chapters.slice(start, start + LIST_PER_PAGE);

  const rows = slice.map((ch) => [
    Markup.button.callback(ch.title, `hisn_view_${ch.id}_1`)
  ]);
  const nav = [];
  if (safePage > 1) nav.push(Markup.button.callback('⬅️', `hisn_list_page_${safePage - 1}`));
  if (safePage < totalPages) nav.push(Markup.button.callback('➡️', `hisn_list_page_${safePage + 1}`));
  if (nav.length) rows.push(nav);

  const text = `📖 *أبواب حصن المسلم* (${safePage}/${totalPages})`;
  const keyboard = Markup.inlineKeyboard(rows);
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function handleHisnView(ctx, id, page) {
  const chapter = getChapterById(id);
  if (!chapter) {
    await ctx.answerCbQuery('❌ الباب غير موجود', { show_alert: true }).catch(() => {});
    return;
  }

  const lang = getUserUiLang(ctx);
  let translationEntries = null;
  if (lang !== 'ar') {
    try {
      translationEntries = await ensureChapterTranslation(chapter, lang);
    } catch (e) {
      console.error('[hisnMuslim] Gemini translation failed:', e.message);
      await ctx.answerCbQuery('⚠️ تعذّر الترجمة مؤقتاً', { show_alert: true }).catch(() => {});
      translationEntries = chapter.content.map((item) => ({
        bless: item.bless || '',
        source: item.source || ''
      }));
    }
  }

  const blocks = chapter.content.map((item, idx) =>
    formatDhikrBlock(item, lang === 'ar' ? null : translationEntries?.[idx])
  );
  const pages = paginateHisnBlocks(blocks, chapter.title);
  const totalPages = pages.length;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const text = pages[safePage - 1];

  const nav = [];
  if (safePage > 1) nav.push(Markup.button.callback('⬅️', `hisn_view_${id}_${safePage - 1}`));
  if (safePage < totalPages) nav.push(Markup.button.callback('➡️', `hisn_view_${id}_${safePage + 1}`));
  const rows = nav.length ? [nav] : [];
  rows.push([Markup.button.callback('🔙 رجوع للأبواب', 'hisn_list_page_1')]);

  await ctx.answerCbQuery().catch(() => {});
  const keyboard = Markup.inlineKeyboard(rows);
  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function handleHisnSearchStart(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  return ctx.scene.enter('hisn-search');
}

const hisnSearchScene = new Scenes.WizardScene(
  'hisn-search',

  async (ctx) => {
    await ctx.reply(
      '🔍 *بحث في أبواب حصن المسلم*\n\nاكتب كلمة من عنوان الباب (بالعربية):',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (text === '/cancel' || text === '❌ إلغاء') {
      await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole || 'worshipper'));
      return ctx.scene.leave();
    }
    if (!text) return ctx.reply('⚠️ يرجى إدخال كلمة للبحث.');

    const query = text.toLowerCase();
    const matches = getAllChapters().filter((ch) =>
      String(ch.title || '').toLowerCase().includes(query)
    );

    if (!matches.length) {
      await ctx.reply(
        'لم يتم العثور على نتائج.',
        mainKeyboard(ctx.session?.userRole || 'worshipper')
      );
      return ctx.scene.leave();
    }

    const rows = matches.slice(0, 20).map((ch) => [
      Markup.button.callback(ch.title, `hisn_view_${ch.id}_1`)
    ]);
    rows.push([Markup.button.callback('🔙 رجوع للأبواب', 'hisn_list_page_1')]);

    await ctx.reply(
      `🔍 *نتائج البحث* (${matches.length})\n\nاختر باباً:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
    );
    return ctx.scene.leave();
  }
);

registry.registerAction('hisn_search_start', handleHisnSearchStart, 'بدء بحث حصن المسلم');
registry.registerAction(/^hisn_list_page_(\d+)$/, async (ctx) => {
  await handleHisnListPage(ctx, parseInt(ctx.match[1], 10));
}, 'صفحة قائمة أبواب حصن المسلم');
registry.registerAction(/^hisn_view_(\d+)_(\d+)$/, async (ctx) => {
  await handleHisnView(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
}, 'عرض باب حصن المسلم');

module.exports = {
  handleHisnMuslimMenu,
  handleHisnListPage,
  handleHisnView,
  handleHisnSearchStart,
  hisnSearchScene
};

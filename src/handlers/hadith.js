const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const registry = require('../core/actionRegistry');
const { loadQudsiMatched } = require('../services/hadithQudsiMatch');
const {
  BOOKS,
  getBookLabel,
  getBook,
  findHadith,
  getWeakHadiths,
  getHadithTranslation,
  formatGrades,
  searchHadithsInAllBooks,
  searchHadithsInBook,
  hasHadithText,
  findNextNonEmptyIndex,
  findFirstNonEmptyIndex,
  findFirstNonEmptyInSection,
  getSectionIds,
  ensureTranslatedSections,
  getSectionDisplayName
} = require('../services/hadithData');
const { cancelKeyboard, mainKeyboard } = require('../keyboards');

const TELEGRAM_LIMIT = 4000;
const SECTIONS_PER_PAGE = 8;

function getUserUiLang(ctx) {
  const user = db.getUser(ctx.from.id);
  const lang = user?.uiLang || ctx.session?.uiLang || 'ar';
  return lang === 'ar' || !lang ? 'ar' : lang;
}

function truncateText(text, max = TELEGRAM_LIMIT) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 20)}\n\n…`;
}

async function renderHadith(hadith, book, uiLang) {
  if (!hadith) return '⚠️ الحديث غير موجود في البيانات المحلية.';

  const bookLabel = getBookLabel(book);
  const ref = `📚 *المرجع:* ${bookLabel} — حديث رقم ${hadith.hadithnumber}`;
  const grades = `📊 *الحكم:*\n${formatGrades(hadith)}`;
  let body = `📜 *النص العربي:*\n${hadith.text}`;

  if (uiLang && uiLang !== 'ar') {
    try {
      const translation = await getHadithTranslation(book, hadith, uiLang);
      if (translation?.text) {
        const tag = translation.source === 'official' ? '🌐' : '🤖';
        body += `\n\n${tag} *الترجمة:*\n${translation.text}`;
      }
    } catch (e) {
      console.error('[hadith] translation failed:', e.message);
      body += '\n\n⚠️ تعذّر جلب الترجمة مؤقتاً.';
    }
  }

  return truncateText(`${body}\n\n${grades}\n${ref}`);
}

function hadithNavKeyboard(prevCb, nextCb, backCb, extraRows = []) {
  const nav = [];
  if (prevCb) nav.push(Markup.button.callback('⬅️', prevCb));
  if (nextCb) nav.push(Markup.button.callback('➡️', nextCb));
  const rows = nav.length ? [nav] : [];
  if (extraRows.length) rows.push(...extraRows);
  if (backCb) rows.push([Markup.button.callback('🔙 رجوع', backCb)]);
  return Markup.inlineKeyboard(rows);
}

function hadithBookExtraRows(book, mode) {
  if (mode === 'daif') return [];
  return [[
    Markup.button.callback('📑 فهرس الأبواب', `hadith_sections_${book}_1`),
    Markup.button.callback('🔍 بحث في هذا الكتاب', `hadith_search_in_book_${book}`)
  ]];
}

async function sendOrEdit(ctx, text, keyboard) {
  const opts = { parse_mode: 'Markdown', ...keyboard };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, opts);
  }
  return ctx.reply(text, opts);
}

async function handleHadithMenu(ctx) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🕊️ الأحاديث القدسية كاملة', 'hadith_qudsi_1')],
    [Markup.button.callback('📚 كتب الأحاديث', 'hadith_books_list')],
    [Markup.button.callback('⚠️ الأحاديث الضعيفة', 'hadith_daif_books')],
    [Markup.button.callback('🔍 بحث في نص الحديث', 'hadith_search_grade')],
    [Markup.button.callback('🔍 بحث بالسند', 'hadith_search_sanad')]
  ]);
  const text = '📜 *قسم الحديث*\n\nتصفّح كتب الحديث الستة، الأحاديث القدسية، والبحث بالنص أو السند.';
  return sendOrEdit(ctx, text, keyboard);
}

async function handleHadithQudsi(ctx, page) {
  const qudsiList = loadQudsiMatched();
  const total = qudsiList.length;
  if (!total) {
    await ctx.answerCbQuery?.('⚠️ لم تُطابَق الأحاديث القدسية بعد — شغّل: node matchHadithQudsi.js', { show_alert: true }).catch(() => {});
    return;
  }
  const safePage = Math.max(1, Math.min(page, total));
  const entry = qudsiList[safePage - 1];
  const hadith = findHadith(entry.book, entry.hadithnumber);
  const uiLang = getUserUiLang(ctx);

  if (!hadith) {
    const text = `⚠️ لم يُعثر على الحديث القدسي #${entry.number} (${entry.title}):\n${getBookLabel(entry.book)} #${entry.hadithnumber}`;
    return sendOrEdit(ctx, text, hadithNavKeyboard(
      safePage > 1 ? `hadith_qudsi_${safePage - 1}` : null,
      safePage < total ? `hadith_qudsi_${safePage + 1}` : null,
      'hadith_menu_back'
    ));
  }

  const header = `🕊️ *حديث قدسي* #${entry.number} — ${entry.title} (${safePage}/${total})\n\n`;
  const text = header + await renderHadith(hadith, entry.book, uiLang);
  const keyboard = hadithNavKeyboard(
    safePage > 1 ? `hadith_qudsi_${safePage - 1}` : null,
    safePage < total ? `hadith_qudsi_${safePage + 1}` : null,
    'hadith_menu_back'
  );
  return sendOrEdit(ctx, text, keyboard);
}

function buildBooksListKeyboard(prefix) {
  const rows = BOOKS.map((book) => [
    Markup.button.callback(getBookLabel(book), prefix + book + '_1')
  ]);
  rows.push([Markup.button.callback('🔙 رجوع', 'hadith_menu_back')]);
  return Markup.inlineKeyboard(rows);
}

async function handleHadithBooksList(ctx) {
  const text = '📚 *كتب الأحاديث*\n\nاختر كتاباً للتصفّح:';
  return sendOrEdit(ctx, text, buildBooksListKeyboard('hadith_book_'));
}

async function handleHadithDaifBooks(ctx) {
  const text = '⚠️ *الأحاديث الضعيفة*\n\nاختر كتاباً (يُعرض فقط ما حُكم عليه بـ Daif في المصدر):';
  return sendOrEdit(ctx, text, buildBooksListKeyboard('hadith_daif_'));
}

async function handleHadithBookPage(ctx, book, index, mode) {
  const entry = getBook(book);
  if (!entry?.hadiths?.length) {
    await ctx.answerCbQuery?.('⚠️ لم يتم تحميل بيانات الحديث بعد', { show_alert: true }).catch(() => {});
    return ctx.reply('⚠️ لم يتم تحميل بيانات الحديث بعد.\nشغّل: node prerenderHadith.js');
  }

  const list = mode === 'daif' ? getWeakHadiths(book) : entry.hadiths;
  if (!list.length) {
    const text = mode === 'daif'
      ? `⚠️ لا توجد أحاديث ضعيفة مسجّلة في *${getBookLabel(book)}*.`
      : `⚠️ لا توجد أحاديث في *${getBookLabel(book)}*.`;
    return sendOrEdit(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 رجوع', mode === 'daif' ? 'hadith_daif_books' : 'hadith_books_list')]
    ]));
  }

  const total = list.length;
  const safeIndex = Math.max(1, Math.min(index, total));
  const skipEmpty = mode !== 'daif';

  if (skipEmpty) {
    const firstNonEmpty = findFirstNonEmptyIndex(list);
    if (!firstNonEmpty) {
      return sendOrEdit(ctx, `⚠️ لا يوجد حديث بنص في *${getBookLabel(book)}*.`, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'hadith_books_list')]
      ]));
    }

    let displayIndex = safeIndex;
    if (index === 1) {
      displayIndex = firstNonEmpty;
    } else if (!hasHadithText(list[safeIndex - 1])) {
      const forward = findNextNonEmptyIndex(list, safeIndex, 1);
      if (forward) {
        displayIndex = forward;
      } else {
        await ctx.answerCbQuery?.('لا يوجد حديث إضافي', { show_alert: true }).catch(() => {});
        displayIndex = findNextNonEmptyIndex(list, safeIndex - 1, -1) || firstNonEmpty;
      }
    }

    const hadith = list[displayIndex - 1];
    const uiLang = getUserUiLang(ctx);
    const modeLabel = '📖 حديث';
    const header = `${modeLabel} — *${getBookLabel(book)}* (#${hadith.hadithnumber} — ${displayIndex}/${total})\n\n`;
    const text = header + await renderHadith(hadith, book, uiLang);

    const prefix = `hadith_book_${book}_`;
    const prevIndex = findNextNonEmptyIndex(list, displayIndex - 1, -1);
    const nextIndex = findNextNonEmptyIndex(list, displayIndex + 1, 1);
    const keyboard = hadithNavKeyboard(
      prevIndex ? `${prefix}${prevIndex}` : null,
      nextIndex ? `${prefix}${nextIndex}` : null,
      'hadith_books_list',
      hadithBookExtraRows(book, mode)
    );
    return sendOrEdit(ctx, text, keyboard);
  }

  const safeIndexLegacy = Math.max(1, Math.min(index, total));
  const hadith = list[safeIndexLegacy - 1];
  const uiLang = getUserUiLang(ctx);
  const modeLabel = mode === 'daif' ? '⚠️ حديث ضعيف' : '📖 حديث';
  const header = `${modeLabel} — *${getBookLabel(book)}* (${safeIndexLegacy}/${total})\n\n`;
  const text = header + await renderHadith(hadith, book, uiLang);

  const prefix = mode === 'daif' ? `hadith_daif_${book}_` : `hadith_book_${book}_`;
  const backCb = mode === 'daif' ? 'hadith_daif_books' : 'hadith_books_list';
  const keyboard = hadithNavKeyboard(
    safeIndexLegacy > 1 ? `${prefix}${safeIndexLegacy - 1}` : null,
    safeIndexLegacy < total ? `${prefix}${safeIndexLegacy + 1}` : null,
    backCb,
    hadithBookExtraRows(book, mode)
  );
  return sendOrEdit(ctx, text, keyboard);
}

async function handleHadithSectionsList(ctx, book, page) {
  const entry = getBook(book);
  if (!entry?.metadata?.sections) {
    await ctx.answerCbQuery?.('⚠️ لا يوجد فهرس أبواب لهذا الكتاب', { show_alert: true }).catch(() => {});
    return;
  }

  const sectionIds = getSectionIds(book);
  const totalPages = Math.max(1, Math.ceil(sectionIds.length / SECTIONS_PER_PAGE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const slice = sectionIds.slice((safePage - 1) * SECTIONS_PER_PAGE, safePage * SECTIONS_PER_PAGE);

  let translatedSections = entry.translatedSections || {};
  try {
    translatedSections = await ensureTranslatedSections(book);
  } catch (e) {
    console.error('[hadith] section translation failed:', e.message);
  }

  const rows = slice.map((sectionId) => {
    const details = entry.metadata.section_details?.[sectionId] || {};
    const first = details.hadithnumber_first ?? '?';
    const last = details.hadithnumber_last ?? '?';
    const name = getSectionDisplayName(book, sectionId, translatedSections);
    const label = `${first}-${last} — ${name}`.slice(0, 60);
    return [Markup.button.callback(label, `hadith_section_open_${book}_${sectionId}`)];
  });

  const nav = [];
  if (safePage > 1) nav.push(Markup.button.callback('⬅️', `hadith_sections_${book}_${safePage - 1}`));
  if (safePage < totalPages) nav.push(Markup.button.callback('➡️', `hadith_sections_${book}_${safePage + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 رجوع للكتاب', `hadith_book_${book}_1`)]);

  const text = `📑 *فهرس أبواب — ${getBookLabel(book)}*\n\nاختر باباً (${safePage}/${totalPages}):`;
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleHadithSectionOpen(ctx, book, sectionId) {
  const arrayIndex = findFirstNonEmptyInSection(book, sectionId);
  if (!arrayIndex) {
    await ctx.answerCbQuery?.('⚠️ لا يوجد حديث بنص في هذا الباب', { show_alert: true }).catch(() => {});
    return;
  }
  return handleHadithBookPage(ctx, book, arrayIndex, 'all');
}

async function handleHadithShow(ctx, book, hadithnumber) {
  const hadith = findHadith(book, hadithnumber);
  const uiLang = getUserUiLang(ctx);
  const text = await renderHadith(hadith, book, uiLang);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 رجوع لقسم الحديث', 'hadith_menu_back')]
  ]);
  return sendOrEdit(ctx, text, keyboard);
}

async function showSearchResults(ctx, matches, title) {
  if (!matches.length) {
    await ctx.reply('لم يتم العثور على نتائج.', mainKeyboard(ctx.session?.userRole || 'worshipper'));
    return ctx.scene.leave();
  }

  const slice = matches.slice(0, 20);
  const rows = slice.map(({ book, hadith }) => {
    const preview = String(hadith.text || '').slice(0, 40).replace(/\n/g, ' ');
    const label = `${getBookLabel(book)} #${hadith.hadithnumber}: ${preview}…`;
    return [Markup.button.callback(label.slice(0, 60), `hadith_show_${book}_${hadith.hadithnumber}`)];
  });
  rows.push([Markup.button.callback('🔙 قسم الحديث', 'hadith_menu_back')]);

  await ctx.reply(
    `${title}\n\nعرض ${slice.length} من ${matches.length} نتيجة:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
  return ctx.scene.leave();
}

function makeHadithSearchScene(sceneId, promptText, title) {
  return new Scenes.WizardScene(
    sceneId,

    async (ctx) => {
      await ctx.reply(promptText, { parse_mode: 'Markdown', ...cancelKeyboard() });
      return ctx.wizard.next();
    },

    async (ctx) => {
      const text = ctx.message?.text?.trim();
      if (text === '/cancel' || text === '❌ إلغاء') {
        await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole || 'worshipper'));
        return ctx.scene.leave();
      }
      if (!text) return ctx.reply('⚠️ يرجى إدخال نص للبحث.');

      const matches = searchHadithsInAllBooks(text);
      await showSearchResults(ctx, matches, title.replace('{query}', text));
    }
  );
}

const hadithSearchGradeScene = makeHadithSearchScene(
  'hadith-search-grade',
  '🔍 *بحث في نص الحديث*\n\nاكتب جزءاً من نص الحديث بالعربية:',
  '🔍 *نتائج البحث عن:* `{query}`'
);

const hadithSearchSanadScene = makeHadithSearchScene(
  'hadith-search-sanad',
  '🔍 *بحث بالسند / الراوي*\n\nاكتب اسم الراوي أو جزءاً من السند (بالعربية):',
  '🔍 *نتائج البحث عن الراوي:* `{query}`'
);

const hadithSearchBookScene = new Scenes.WizardScene(
  'hadith-search-book',

  async (ctx) => {
    const book = ctx.session?.hadithSearchBook;
    if (!book) {
      await ctx.reply('⚠️ لم يُحدَّد الكتاب.', mainKeyboard(ctx.session?.userRole || 'worshipper'));
      return ctx.scene.leave();
    }
    await ctx.reply(
      `🔍 *بحث في ${getBookLabel(book)}*\n\nاكتب جزءاً من نص الحديث بالعربية:`,
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    const book = ctx.session?.hadithSearchBook;
    const text = ctx.message?.text?.trim();
    if (text === '/cancel' || text === '❌ إلغاء') {
      await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole || 'worshipper'));
      return ctx.scene.leave();
    }
    if (!text) return ctx.reply('⚠️ يرجى إدخال نص للبحث.');
    if (!book) {
      await ctx.reply('⚠️ لم يُحدَّد الكتاب.', mainKeyboard(ctx.session?.userRole || 'worshipper'));
      return ctx.scene.leave();
    }

    const matches = searchHadithsInBook(book, text);
    if (!matches.length) {
      await ctx.reply(
        'لم يتم العثور على نتائج.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔙 رجوع للكتاب', `hadith_book_${book}_1`)]
        ])
      );
      return ctx.scene.leave();
    }

    const slice = matches.slice(0, 20);
    const rows = slice.map(({ hadith }) => {
      const preview = String(hadith.text || '').slice(0, 40).replace(/\n/g, ' ');
      const label = `#${hadith.hadithnumber}: ${preview}…`;
      return [Markup.button.callback(label.slice(0, 60), `hadith_show_${book}_${hadith.hadithnumber}`)];
    });
    rows.push([Markup.button.callback('🔙 رجوع للكتاب', `hadith_book_${book}_1`)]);

    await ctx.reply(
      `🔍 *نتائج البحث في ${getBookLabel(book)} عن:* \`${text}\`\n\nعرض ${slice.length} من ${matches.length} نتيجة:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
    );
    return ctx.scene.leave();
  }
);

async function handleHadithSearchGrade(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  return ctx.scene.enter('hadith-search-grade');
}

async function handleHadithSearchSanad(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  return ctx.scene.enter('hadith-search-sanad');
}

async function handleHadithSearchInBook(ctx, book) {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.hadithSearchBook = book;
  return ctx.scene.enter('hadith-search-book');
}

registry.registerAction('hadith_menu_back', handleHadithMenu, 'رجوع لقسم الحديث');
registry.registerAction('hadith_books_list', handleHadithBooksList, 'قائمة كتب الحديث');
registry.registerAction('hadith_daif_books', handleHadithDaifBooks, 'كتب الأحاديث الضعيفة');
registry.registerAction('hadith_search_grade', handleHadithSearchGrade, 'بحث حكم حديث');
registry.registerAction('hadith_search_sanad', handleHadithSearchSanad, 'بحث بالسند');
registry.registerAction(/^hadith_qudsi_(\d+)$/, async (ctx) => {
  await handleHadithQudsi(ctx, parseInt(ctx.match[1], 10));
}, 'صفحة الأحاديث القدسية');
registry.registerAction(/^hadith_book_([a-z]+)_(\d+)$/, async (ctx) => {
  await handleHadithBookPage(ctx, ctx.match[1], parseInt(ctx.match[2], 10), 'all');
}, 'تصفّح حديث في كتاب');
registry.registerAction(/^hadith_daif_([a-z]+)_(\d+)$/, async (ctx) => {
  await handleHadithBookPage(ctx, ctx.match[1], parseInt(ctx.match[2], 10), 'daif');
}, 'تصفّح حديث ضعيف في كتاب');
registry.registerAction(/^hadith_sections_([a-z]+)_(\d+)$/, async (ctx) => {
  await handleHadithSectionsList(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
}, 'فهرس أبواب كتاب حديث');
registry.registerAction(/^hadith_section_open_([a-z]+)_(\d+)$/, async (ctx) => {
  await handleHadithSectionOpen(ctx, ctx.match[1], ctx.match[2]);
}, 'فتح باب من فهرس الحديث');
registry.registerAction(/^hadith_search_in_book_([a-z]+)$/, async (ctx) => {
  await handleHadithSearchInBook(ctx, ctx.match[1]);
}, 'بحث داخل كتاب حديث واحد');
registry.registerAction(/^hadith_show_([a-z]+)_(\d+)$/, async (ctx) => {
  await handleHadithShow(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
}, 'عرض حديث من نتائج البحث');

module.exports = {
  handleHadithMenu,
  handleHadithQudsi,
  handleHadithBooksList,
  handleHadithDaifBooks,
  handleHadithSearchGrade,
  handleHadithSearchSanad,
  handleHadithSectionsList,
  handleHadithSectionOpen,
  handleHadithSearchInBook,
  renderHadith,
  hadithSearchGradeScene,
  hadithSearchSanadScene,
  hadithSearchBookScene
};

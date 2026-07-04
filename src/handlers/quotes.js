const fs = require('fs');
const path = require('path');
const { Scenes, Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const { stripDiacritics } = require('../services/hadithData');
const { cancelKeyboard, mainKeyboard } = require('../keyboards');

const QUOTES_PATH = path.join(__dirname, '../../data/quotes_draft.json');

const CATEGORY_TAGS = {
  wisdom: 'حكمة',
  scholars: 'قول عالم',
  poetry: 'شعر'
};

const CATEGORIES = {
  wisdom: {
    label: '🌟 أقوال الصحابة والتابعين',
    title: 'أقوال الصحابة والتابعين',
    emoji: '🌟',
    attributionKey: 'person',
    attributionLabel: 'القائل',
    startCb: 'quotes_wisdom_1',
    prefix: 'quotes_wisdom_'
  },
  scholars: {
    label: '📖 أقوال العلماء',
    title: 'أقوال العلماء',
    emoji: '📖',
    attributionKey: 'scholar',
    attributionLabel: 'العالم',
    startCb: 'quotes_scholars_1',
    prefix: 'quotes_scholars_'
  },
  poetry: {
    label: '🌙 من ديوان الشافعي',
    title: 'من ديوان الشافعي',
    emoji: '🌙',
    attributionKey: 'poet',
    attributionLabel: 'الشاعر',
    startCb: 'quotes_poetry_1',
    prefix: 'quotes_poetry_'
  }
};

let quotesCache = null;

function loadQuotes() {
  if (!quotesCache) {
    quotesCache = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8'));
  }
  return quotesCache;
}

function getCategoryItems(category) {
  const data = loadQuotes();
  return Array.isArray(data[category]) ? data[category] : [];
}

function getUserId(ctx) {
  return String(ctx.from?.id || '');
}

function getFavoriteQuotes(userId) {
  return db.getUser(userId)?.favoriteQuotes || [];
}

function isQuoteFavorite(userId, category, page1Based) {
  const idx = page1Based - 1;
  return getFavoriteQuotes(userId).some((f) => f.category === category && f.index === idx);
}

function addQuoteFavorite(userId, category, page1Based) {
  const idx = page1Based - 1;
  const favs = getFavoriteQuotes(userId);
  if (favs.some((f) => f.category === category && f.index === idx)) return false;
  db.saveUser(userId, { favoriteQuotes: [...favs, { category, index: idx }] });
  return true;
}

function removeQuoteFavorite(userId, category, page1Based) {
  const idx = page1Based - 1;
  const favs = getFavoriteQuotes(userId).filter((f) => !(f.category === category && f.index === idx));
  db.saveUser(userId, { favoriteQuotes: favs });
}

function resolveFavoriteEntries(userId) {
  return getFavoriteQuotes(userId)
    .map((entry) => {
      const items = getCategoryItems(entry.category);
      const item = items[entry.index];
      if (!item) return null;
      return { category: entry.category, item, page: entry.index + 1 };
    })
    .filter(Boolean);
}

function searchAllQuotes(query) {
  const q = stripDiacritics(query.trim());
  if (!q) return [];
  const results = [];
  for (const category of Object.keys(CATEGORIES)) {
    const meta = CATEGORIES[category];
    const items = getCategoryItems(category);
    items.forEach((item, i) => {
      const blob = stripDiacritics(
        `${item.text} ${item[meta.attributionKey] || ''} ${item.source || ''}`
      );
      if (blob.includes(q)) {
        results.push({ category, page: i + 1, item });
      }
    });
  }
  return results;
}

function getLastQuotePosition(userId, category) {
  const user = db.getUser(userId);
  const saved = user?.lastQuotePosition?.[category];
  return Number.isInteger(saved) && saved > 0 ? saved : null;
}

function saveLastQuotePosition(userId, category, page) {
  const user = db.getUser(userId) || {};
  const lastQuotePosition = { ...(user.lastQuotePosition || {}), [category]: page };
  db.saveUser(userId, { lastQuotePosition });
}

function markQuotesResume(ctx) {
  if (!ctx.session) ctx.session = {};
  ctx.session.quotesResume = { wisdom: true, scholars: true, poetry: true };
}

function shouldResumeCategory(ctx, category) {
  if (!ctx.session?.quotesResume?.[category]) return false;
  delete ctx.session.quotesResume[category];
  return true;
}

function resolveEntryPage(ctx, category, requestedPage) {
  if (requestedPage !== 1 || !shouldResumeCategory(ctx, category)) {
    return requestedPage;
  }
  const saved = getLastQuotePosition(getUserId(ctx), category);
  return saved || 1;
}

function setQuotesView(ctx, view) {
  if (!ctx.session) ctx.session = {};
  ctx.session.quotesView = view;
}

async function sendOrEdit(ctx, text, keyboard) {
  const opts = { parse_mode: 'Markdown', ...keyboard };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, opts);
  }
  return ctx.reply(text, opts);
}

function renderQuote(item, category, page, total, { showCategory = false, headerTitle } = {}) {
  const meta = CATEGORIES[category];
  const attr = item[meta.attributionKey] || '';
  const source = item.source || '';
  const title = headerTitle || meta.title;
  let text = `${meta.emoji} *${title}* (${page}/${total})\n\n`;
  if (showCategory) {
    text += `🏷️ *التصنيف:* ${meta.emoji} ${CATEGORY_TAGS[category]}\n\n`;
  }
  text += `${item.text}\n\n`;
  if (attr) text += `👤 *${meta.attributionLabel}:* ${attr}\n`;
  if (source) text += `📚 *المصدر:* ${source}`;
  return text;
}

function formatQuoteItem(item, meta, page, total) {
  const category = Object.keys(CATEGORIES).find((k) => CATEGORIES[k] === meta);
  if (category) return renderQuote(item, category, page, total);
  let text = `${meta.emoji} *${meta.title}* (${page}/${total})\n\n`;
  text += `${item.text}\n\n`;
  const attr = item[meta.attributionKey] || '';
  const source = item.source || '';
  if (attr) text += `👤 *${meta.attributionLabel}:* ${attr}\n`;
  if (source) text += `📚 *المصدر:* ${source}`;
  return text;
}

function buildQuoteKeyboard(ctx, { category, page, total, prevCb, nextCb, backCb = 'quotes_menu_back', showFav = true }) {
  const rows = [];
  const nav = [];
  if (prevCb) nav.push(Markup.button.callback('⬅️', prevCb));
  if (nextCb) nav.push(Markup.button.callback('➡️', nextCb));
  if (nav.length) rows.push(nav);

  if (showFav && category) {
    const userId = getUserId(ctx);
    const favBtn = isQuoteFavorite(userId, category, page)
      ? Markup.button.callback('🗑️ إزالة من المفضّلة', `quote_fav_remove_${category}_${page}`)
      : Markup.button.callback('⭐ أضف للمفضّلة', `quote_fav_add_${category}_${page}`);
    rows.push([favBtn]);
  }

  rows.push([Markup.button.callback('🔙 رجوع', backCb)]);
  return Markup.inlineKeyboard(rows);
}

function quotesNavKeyboard(ctx, category, page, total, prevCb, nextCb, backCb) {
  return buildQuoteKeyboard(ctx, { category, page, total, prevCb, nextCb, backCb });
}

async function refreshCurrentQuoteView(ctx, category, page) {
  const view = ctx.session?.quotesView;
  if (view?.mode === 'search') {
    return handleQuotesSearchPage(ctx, view.page || 1);
  }
  if (view?.mode === 'favorites') {
    return handleQuotesFavorites(ctx, view.page || 1);
  }
  return handleQuotesCategory(ctx, category, page);
}

async function handleQuotesCategory(ctx, category, page) {
  const meta = CATEGORIES[category];
  if (!meta) return;

  const items = getCategoryItems(category);
  const total = items.length;
  if (!total) {
    return sendOrEdit(
      ctx,
      '⚠️ لا توجد أقوال في هذا القسم حالياً.',
      buildQuoteKeyboard(ctx, { category: null, page: 1, total: 1, prevCb: null, nextCb: null, showFav: false })
    );
  }

  const userId = getUserId(ctx);
  let targetPage = resolveEntryPage(ctx, category, page);

  if (targetPage > total) {
    targetPage = 1;
    saveLastQuotePosition(userId, category, 1);
  }

  const safePage = Math.max(1, Math.min(targetPage, total));
  saveLastQuotePosition(userId, category, safePage);
  setQuotesView(ctx, { mode: 'category', category, page: safePage });

  const item = items[safePage - 1];
  const text = renderQuote(item, category, safePage, total);
  const prefix = meta.prefix;
  const keyboard = quotesNavKeyboard(
    ctx,
    category,
    safePage,
    total,
    safePage > 1 ? `${prefix}${safePage - 1}` : null,
    safePage < total ? `${prefix}${safePage + 1}` : `${prefix}${total + 1}`,
    'quotes_menu_back'
  );
  return sendOrEdit(ctx, text, keyboard);
}

async function handleQuotesSearchPage(ctx, page) {
  const results = ctx.session?.quotesSearchResults || [];
  const total = results.length;
  if (!total) {
    return sendOrEdit(
      ctx,
      'لم يتم العثور على نتائج.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'quotes_menu_back')]])
    );
  }

  const safePage = Math.max(1, Math.min(page, total));
  setQuotesView(ctx, { mode: 'search', page: safePage });
  const hit = results[safePage - 1];
  const text = renderQuote(hit.item, hit.category, safePage, total, {
    showCategory: true,
    headerTitle: 'نتيجة بحث'
  });
  const keyboard = buildQuoteKeyboard(ctx, {
    category: hit.category,
    page: hit.page,
    total,
    prevCb: safePage > 1 ? `quotes_search_page_${safePage - 1}` : null,
    nextCb: safePage < total ? `quotes_search_page_${safePage + 1}` : null,
    backCb: 'quotes_menu_back'
  });
  return sendOrEdit(ctx, text, keyboard);
}

async function handleQuotesFavorites(ctx, page) {
  const userId = getUserId(ctx);
  const entries = resolveFavoriteEntries(userId);
  const total = entries.length;

  if (!total) {
    const text = '⭐ *مفضّلتي*\n\nلا توجد عناصر في مفضّلتك بعد.';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'quotes_menu_back')]]);
    return sendOrEdit(ctx, text, keyboard);
  }

  const safePage = Math.max(1, Math.min(page, total));
  setQuotesView(ctx, { mode: 'favorites', page: safePage });
  const entry = entries[safePage - 1];
  const text = renderQuote(entry.item, entry.category, safePage, total, {
    showCategory: true,
    headerTitle: 'مفضّلتي'
  });
  const keyboard = buildQuoteKeyboard(ctx, {
    category: entry.category,
    page: entry.page,
    total,
    prevCb: safePage > 1 ? `quotes_favorites_${safePage - 1}` : null,
    nextCb: safePage < total ? `quotes_favorites_${safePage + 1}` : null,
    backCb: 'quotes_menu_back'
  });
  return sendOrEdit(ctx, text, keyboard);
}

async function handleQuotesMenu(ctx) {
  markQuotesResume(ctx);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(CATEGORIES.wisdom.label, CATEGORIES.wisdom.startCb)],
    [Markup.button.callback(CATEGORIES.scholars.label, CATEGORIES.scholars.startCb)],
    [Markup.button.callback(CATEGORIES.poetry.label, CATEGORIES.poetry.startCb)],
    [
      Markup.button.callback('🔍 بحث في الأقوال', 'quotes_search_start'),
      Markup.button.callback('⭐ مفضّلتي', 'quotes_favorites_1')
    ]
  ]);
  const text = '💬 *أقوال وحكم*\n\nاختر تصنيفاً للتصفّح:';
  return sendOrEdit(ctx, text, keyboard);
}

async function handleQuotesSearchStart(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  return ctx.scene.enter('quotes-search');
}

const quotesSearchScene = new Scenes.WizardScene(
  'quotes-search',

  async (ctx) => {
    await ctx.reply(
      '🔍 *بحث في الأقوال*\n\nاكتب كلمة أو عبارة للبحث في الحكم والأقوال والشعر (بدون تشكيل):',
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
    if (!text) return ctx.reply('⚠️ يرجى إدخال نص للبحث.');

    const results = searchAllQuotes(text);
    if (!ctx.session) ctx.session = {};
    ctx.session.quotesSearchResults = results;

    await ctx.scene.leave();

    if (!results.length) {
      await ctx.reply(
        'لم يتم العثور على نتائج.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'quotes_menu_back')]])
      );
      return;
    }

    return handleQuotesSearchPage(ctx, 1);
  }
);

registry.registerAction('quotes_menu_back', async (ctx) => {
  await handleQuotesMenu(ctx);
}, 'رجوع لقائمة الأقوال');

registry.registerAction('quotes_search_start', handleQuotesSearchStart, 'بدء بحث الأقوال');

registry.registerAction(/^quotes_search_page_(\d+)$/, async (ctx) => {
  await handleQuotesSearchPage(ctx, parseInt(ctx.match[1], 10));
}, 'صفحة نتائج بحث الأقوال');

registry.registerAction(/^quotes_favorites_(\d+)$/, async (ctx) => {
  await handleQuotesFavorites(ctx, parseInt(ctx.match[1], 10));
}, 'تصفح مفضّلة الأقوال');

registry.registerAction(/^quote_fav_add_(wisdom|scholars|poetry)_(\d+)$/, async (ctx) => {
  const category = ctx.match[1];
  const page = parseInt(ctx.match[2], 10);
  addQuoteFavorite(getUserId(ctx), category, page);
  await ctx.answerCbQuery('⭐ أُضيف إلى المفضّلة').catch(() => {});
  return refreshCurrentQuoteView(ctx, category, page);
}, 'إضافة قول للمفضّلة');

registry.registerAction(/^quote_fav_remove_(wisdom|scholars|poetry)_(\d+)$/, async (ctx) => {
  const category = ctx.match[1];
  const page = parseInt(ctx.match[2], 10);
  removeQuoteFavorite(getUserId(ctx), category, page);
  await ctx.answerCbQuery('🗑️ أُزيل من المفضّلة').catch(() => {});
  return refreshCurrentQuoteView(ctx, category, page);
}, 'إزالة قول من المفضّلة');

registry.registerAction(/^quotes_wisdom_(\d+)$/, async (ctx) => {
  await handleQuotesCategory(ctx, 'wisdom', parseInt(ctx.match[1], 10));
}, 'تصفح أقوال الصحابة والتابعين');

registry.registerAction(/^quotes_scholars_(\d+)$/, async (ctx) => {
  await handleQuotesCategory(ctx, 'scholars', parseInt(ctx.match[1], 10));
}, 'تصفح أقوال العلماء');

registry.registerAction(/^quotes_poetry_(\d+)$/, async (ctx) => {
  await handleQuotesCategory(ctx, 'poetry', parseInt(ctx.match[1], 10));
}, 'تصفح شعر الشافعي');

module.exports = { handleQuotesMenu, quotesSearchScene };

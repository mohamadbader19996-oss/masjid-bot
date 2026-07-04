const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const { startTasbihWithCustomItem } = require('./tasbih');

const NAMES_PATH = path.join(__dirname, '../../data/names_of_allah.json');
const PER_PAGE = 8;

const MENU_TEXT =
  '🕊️ *أسماء الله الحسنى*\n\n' +
  '"لله تسعة وتسعون اسماً، مئة إلا واحداً، من أحصاها دخل الجنة"\n\n' +
  '📚 متفق عليه (صحيح البخاري وصحيح مسلم)';

let namesCache = null;

function loadNames() {
  if (!namesCache) {
    namesCache = JSON.parse(fs.readFileSync(NAMES_PATH, 'utf8'));
  }
  return namesCache;
}

function findNameById(id) {
  const numericId = Number(id);
  return loadNames().find((entry) => entry.id === numericId) || null;
}

function buildNamesMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📜 تصفّح الأسماء', 'names_list_1')],
    [Markup.button.callback('🎲 اسم عشوائي', 'names_random')]
  ]);
}

function buildNameDetailKeyboard(id) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📿 ابدأ السبحة بهذا الاسم', `names_to_tasbih_${id}`)],
    [Markup.button.callback('🔙 رجوع للقائمة', 'names_list_1')]
  ]);
}

async function handleNamesMenu(ctx) {
  const opts = { parse_mode: 'Markdown', ...buildNamesMenuKeyboard() };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(MENU_TEXT, opts);
  }
  return ctx.reply(MENU_TEXT, opts);
}

async function handleNamesList(ctx, page) {
  const names = loadNames();
  const totalPages = Math.max(1, Math.ceil(names.length / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const slice = names.slice(start, start + PER_PAGE);

  const rows = slice.map((entry) => [
    Markup.button.callback(entry.name, `names_view_${entry.id}`)
  ]);

  const nav = [];
  if (safePage > 1) {
    nav.push(Markup.button.callback('◀️ السابق', `names_list_${safePage - 1}`));
  }
  if (safePage < totalPages) {
    nav.push(Markup.button.callback('التالي ▶️', `names_list_${safePage + 1}`));
  }
  if (nav.length) {
    rows.push(nav);
  }
  rows.push([Markup.button.callback('🔙 القائمة الرئيسية للأسماء', 'names_menu_back')]);

  const text =
    `📜 *أسماء الله الحسنى* — صفحة ${safePage}/${totalPages}\n\n` +
    'اختر اسماً لعرض معناه:';

  const opts = { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, opts);
  }
  return ctx.reply(text, opts);
}

async function handleNameDetail(ctx, id) {
  const entry = findNameById(id);
  if (!entry) {
    await ctx.answerCbQuery('❌ الاسم غير موجود', { show_alert: true }).catch(() => {});
    return;
  }

  const text = `🕊️ *${entry.name}*\n\n${entry.text}`;
  const opts = { parse_mode: 'Markdown', ...buildNameDetailKeyboard(entry.id) };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, opts);
  }
  return ctx.reply(text, opts);
}

async function handleNamesRandom(ctx) {
  const names = loadNames();
  const entry = names[Math.floor(Math.random() * names.length)];
  return handleNameDetail(ctx, entry.id);
}

async function handleNamesToTasbih(ctx, id) {
  const entry = findNameById(id);
  if (!entry) {
    await ctx.answerCbQuery('❌ الاسم غير موجود', { show_alert: true }).catch(() => {});
    return;
  }

  const item = {
    id: `name_${entry.id}`,
    text: entry.name,
    target: null,
    source: 'من أسماء الله الحسنى'
  };

  await ctx.answerCbQuery().catch(() => {});
  return startTasbihWithCustomItem(ctx, item);
}

registry.registerAction('names_random', handleNamesRandom, 'اسم عشوائي من أسماء الله');
registry.registerAction('names_menu_back', handleNamesMenu, 'القائمة الرئيسية لأسماء الله');

registry.registerAction(/^names_list_(\d+)$/, async (ctx) => {
  await handleNamesList(ctx, parseInt(ctx.match[1], 10));
}, 'صفحة أسماء الله الحسنى');

registry.registerAction(/^names_view_(\d+)$/, async (ctx) => {
  await handleNameDetail(ctx, parseInt(ctx.match[1], 10));
}, 'تفاصيل اسم من أسماء الله');

registry.registerAction(/^names_to_tasbih_(\d+)$/, async (ctx) => {
  await handleNamesToTasbih(ctx, parseInt(ctx.match[1], 10));
}, 'سبحة باسم من أسماء الله');

module.exports = { handleNamesMenu };

const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const { mainKeyboard } = require('../keyboards');
const {
  tasbihSeries,
  tasbihExtended,
  findExtendedById,
  findDefaultByIndex
} = require('../data/tasbihSeries');

function getUserId(ctx) {
  return String(ctx.from?.id || '');
}

function getTasbihState(userId) {
  return db.getUser(userId)?.tasbihState || null;
}

function saveTasbihState(userId, state) {
  db.saveUser(userId, { tasbihState: state });
}

function clearTasbihState(userId) {
  db.saveUser(userId, { tasbihState: null });
}

function resolveItemFromState(state) {
  if (!state) return null;
  if (state.customItem && state.itemId === state.customItem.id) {
    return state.customItem;
  }
  if (state.sequenceType === 'default') {
    return findDefaultByIndex(state.index);
  }
  return findExtendedById(state.itemId);
}

function defaultState() {
  return {
    sequenceType: 'default',
    index: 0,
    count: 0,
    itemId: tasbihSeries[0].id
  };
}

function buildCounterText(item, count) {
  const targetLabel = item.target == null ? '∞' : String(item.target);
  let text = `🙏 *${item.text}*\n\n*${count}* / *${targetLabel}*`;
  if (item.source) {
    text += `\n\n✨ ${item.source}`;
  }
  return text;
}

function buildCounterKeyboard(count) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`➕ ${count}`, 'tasbih_tap')],
    [
      Markup.button.callback('🔄 إعادة الذكر الحالي', 'tasbih_reset_current'),
      Markup.button.callback('⏭️ تغيير الذكر', 'tasbih_menu')
    ]
  ]);
}

async function renderTasbihCounter(ctx, item, count, isNewMessage) {
  const text = buildCounterText(item, count);
  const keyboard = buildCounterKeyboard(count);
  const opts = { parse_mode: 'Markdown', ...keyboard };

  if (isNewMessage || !ctx.callbackQuery) {
    return ctx.reply(text, opts);
  }

  await ctx.answerCbQuery().catch(() => {});
  return ctx.editMessageText(text, opts);
}

async function showExtendedMenu(ctx) {
  const rows = tasbihExtended.map((item) => [
    Markup.button.callback(item.text, `tasbih_select_${item.id}`)
  ]);
  rows.push([Markup.button.callback('🏁 إنهاء السبحة', 'tasbih_end')]);

  const text = '🙏 *أكملت أذكار الصلاة*\n\nاختر ذكراً إضافياً أو عدّاداً حراً:';
  const keyboard = Markup.inlineKeyboard(rows);
  const opts = { parse_mode: 'Markdown', ...keyboard };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, opts);
  }
  return ctx.reply(text, opts);
}

async function handleTasbihStart(ctx) {
  const userId = getUserId(ctx);
  const saved = getTasbihState(userId);

  if (saved) {
    const item = resolveItemFromState(saved);
    if (item) {
      return renderTasbihCounter(ctx, item, saved.count, true);
    }
    clearTasbihState(userId);
  }

  const state = defaultState();
  saveTasbihState(userId, state);
  return renderTasbihCounter(ctx, tasbihSeries[0], 0, true);
}

async function handleTasbihTap(ctx) {
  const userId = getUserId(ctx);
  let state = getTasbihState(userId);
  if (!state) {
    state = defaultState();
  }

  const item = resolveItemFromState(state);
  if (!item) {
    clearTasbihState(userId);
    return handleTasbihStart(ctx);
  }

  const count = (state.count || 0) + 1;
  state = { ...state, count };
  saveTasbihState(userId, state);

  const reachedTarget = item.target != null && count === item.target;

  if (!reachedTarget) {
    return renderTasbihCounter(ctx, item, count, false);
  }

  if (item.completion) {
    await ctx.reply(`✅ *تم*\n\n${item.completion}`, { parse_mode: 'Markdown' });
  }

  if (state.sequenceType === 'default') {
    const nextIndex = state.index + 1;
    if (nextIndex >= tasbihSeries.length) {
      clearTasbihState(userId);
      return showExtendedMenu(ctx);
    }

    const nextItem = tasbihSeries[nextIndex];
    const nextState = {
      sequenceType: 'default',
      index: nextIndex,
      count: 0,
      itemId: nextItem.id
    };
    saveTasbihState(userId, nextState);
    return renderTasbihCounter(ctx, nextItem, 0, true);
  }

  const nextState = { ...state, count: 0 };
  saveTasbihState(userId, nextState);
  return renderTasbihCounter(ctx, item, 0, true);
}

async function handleTasbihResetCurrent(ctx) {
  const userId = getUserId(ctx);
  const state = getTasbihState(userId);
  if (!state) {
    return handleTasbihStart(ctx);
  }

  const item = resolveItemFromState(state);
  if (!item) {
    clearTasbihState(userId);
    return handleTasbihStart(ctx);
  }

  const nextState = { ...state, count: 0 };
  saveTasbihState(userId, nextState);
  return renderTasbihCounter(ctx, item, 0, false);
}

async function handleTasbihMenu(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  return showExtendedMenu(ctx);
}

async function handleTasbihSelect(ctx, itemId) {
  const item = findExtendedById(itemId);
  if (!item) {
    await ctx.answerCbQuery('❌ الذكر غير موجود', { show_alert: true }).catch(() => {});
    return;
  }

  const userId = getUserId(ctx);
  const state = {
    sequenceType: itemId === 'free' ? 'free' : 'extended',
    index: tasbihExtended.findIndex((entry) => entry.id === itemId),
    count: 0,
    itemId: item.id
  };
  saveTasbihState(userId, state);
  await ctx.answerCbQuery().catch(() => {});
  return renderTasbihCounter(ctx, item, 0, true);
}

async function handleTasbihEnd(ctx) {
  const userId = getUserId(ctx);
  clearTasbihState(userId);
  await ctx.answerCbQuery('🏁 انتهت السبحة').catch(() => {});

  const role = ctx.user?.role || ctx.session?.userRole || 'worshipper';
  if (ctx.callbackQuery) {
    await ctx.editMessageText('🏁 *انتهت السبحة*\n\nبارك الله فيك.', {
      parse_mode: 'Markdown'
    }).catch(() => {});
  }
  return ctx.reply('القائمة الرئيسية 👇', mainKeyboard(role));
}

async function startTasbihWithCustomItem(ctx, item) {
  const userId = getUserId(ctx);
  const state = {
    sequenceType: 'custom',
    index: 0,
    count: 0,
    itemId: item.id,
    customItem: item
  };
  saveTasbihState(userId, state);
  return renderTasbihCounter(ctx, item, 0, true);
}

registry.registerAction('tasbih_tap', handleTasbihTap, 'عدّ سبحة');
registry.registerAction('tasbih_reset_current', handleTasbihResetCurrent, 'إعادة الذكر الحالي');
registry.registerAction('tasbih_menu', handleTasbihMenu, 'قائمة أذكار إضافية');
registry.registerAction('tasbih_end', handleTasbihEnd, 'إنهاء السبحة');

registry.registerAction(/^tasbih_select_(.+)$/, async (ctx) => {
  await handleTasbihSelect(ctx, ctx.match[1]);
}, 'اختيار ذكر إضافي');

module.exports = {
  handleTasbihStart,
  renderTasbihCounter,
  startTasbihWithCustomItem
};

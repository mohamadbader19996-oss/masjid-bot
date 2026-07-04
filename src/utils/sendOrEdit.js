module.exports = async function sendOrEdit(ctx, text, keyboard, parseMode = 'Markdown') {
  const opts = { parse_mode: parseMode, ...keyboard };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText(text, opts).catch(() => {});
  }
  return ctx.reply(text, opts);
};

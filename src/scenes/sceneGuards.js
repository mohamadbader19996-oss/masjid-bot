const { CANCEL_BUTTON, ROLES, mainKeyboard, isMenuButton, resetUserState } = require('../keyboards');
const { dispatchMenuButton } = require('../menuHandlers');
const { resolveIncomingButtonText } = require('../services/uiTranslate');

async function guardWizardInput(ctx) {
  const text = resolveIncomingButtonText(ctx, ctx.message?.text);
  if (!text) return false;

  if (text === '/cancel' || text === CANCEL_BUTTON) {
    await resetUserState(ctx);
    await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole || ROLES.WORSHIPPER));
    return true;
  }

  if (isMenuButton(text)) {
    await resetUserState(ctx);
    await dispatchMenuButton(ctx, text);
    return true;
  }

  return false;
}

module.exports = { guardWizardInput };

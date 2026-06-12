const registry = require('./core/actionRegistry');
const sheikhPanel = require('./handlers/sheikh_new');
const ai = require('./handlers/ai');
const { ROLES, AI_SHEIKH_BUTTON, MESSAGES_BUTTON } = require('./keyboards');

function withRole(roles, handler) {
  return async (ctx) => {
    if (!roles.includes(ctx.user?.role)) {
      return ctx.reply('⛔ ليس لديك صلاحية.');
    }
    return handler(ctx);
  };
}

registry.registerMenu('❓ إرسال سؤال', (ctx) => ctx.scene.enter('ask-question'), 'إرسال سؤال');
registry.registerMenu('🆘 طلب مساعدة', (ctx) => ctx.scene.enter('add-help-request'), 'طلب مساعدة');
registry.registerMenu(
  AI_SHEIKH_BUTTON,
  withRole([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER], ai.aiScholarMenu),
  'المساعد الديني للمشايخ'
);
registry.registerMenu(
  MESSAGES_BUTTON,
  withRole([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER], sheikhPanel.showSheikhMessages),
  'الرسائل'
);
registry.registerMenu(
  '📝 إضافة درس',
  withRole([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER], (ctx) => ctx.scene.enter('add-lesson')),
  'إضافة درس'
);
registry.registerMenu(
  '⏰ تحديث مواقيت الصلاة',
  withRole([ROLES.ADMIN, ROLES.DEVELOPER], (ctx) => ctx.scene.enter('set-prayer-times')),
  'تحديث مواقيت الصلاة'
);
registry.registerMenu(
  '📢 إضافة إعلان',
  withRole([ROLES.ADMIN, ROLES.DEVELOPER], (ctx) => ctx.scene.enter('add-announcement')),
  'إضافة إعلان'
);
registry.registerMenu(
  '👑 إدارة الأدوار',
  withRole([ROLES.DEVELOPER], (ctx) => ctx.scene.enter('manage-role')),
  'إدارة الأدوار'
);
registry.registerMenu(
  '🕌 إضافة مسجد',
  withRole([ROLES.DEVELOPER], (ctx) => ctx.scene.enter('add-mosque')),
  'إضافة مسجد'
);

function getMenuHandlers() {
  return registry.getMenuHandlers();
}

async function dispatchMenuButton(ctx, text) {
  const handler = getMenuHandlers()[text];
  if (!handler) return false;
  await handler(ctx);
  return true;
}

module.exports = { getMenuHandlers, dispatchMenuButton };

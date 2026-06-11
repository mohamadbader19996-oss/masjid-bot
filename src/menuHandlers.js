const common = require('./handlers/common');
const sheikh = require('./handlers/sheikh');
const admin = require('./handlers/admin');
const developer = require('./handlers/developer');
const sheikhPanel = require('./handlers/sheikh_new');
const quran = require('./handlers/quran');
const { ROLES } = require('./keyboards');

function withRole(roles, handler) {
  return async (ctx) => {
    if (!roles.includes(ctx.user?.role)) {
      return ctx.reply('⛔ ليس لديك صلاحية.');
    }
    return handler(ctx);
  };
}

const MENU_HANDLERS = {
  '📅 مواقيت الصلاة': common.showPrayerTimes,
  '📢 الإعلانات': common.showAnnouncements,
  '📚 الدروس': common.showLessons,
  '🕌 معلومات المسجد': common.showMosqueInfo,
  '❓ إرسال سؤال': (ctx) => ctx.scene.enter('ask-question'),
  '🆘 طلب مساعدة': (ctx) => ctx.scene.enter('add-help-request'),
  '📖 القرآن الكريم': quran.quranMenu,
  '📝 إضافة درس': withRole(
    [ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER],
    (ctx) => ctx.scene.enter('add-lesson')
  ),
  '💬 الأسئلة الواردة': sheikh.showPendingQuestions,
  '📖 لوحة الشيخ': sheikhPanel.sheikhPanel,
  '⏰ تحديث مواقيت الصلاة': withRole(
    [ROLES.ADMIN, ROLES.DEVELOPER],
    (ctx) => ctx.scene.enter('set-prayer-times')
  ),
  '📢 إضافة إعلان': withRole(
    [ROLES.ADMIN, ROLES.DEVELOPER],
    (ctx) => ctx.scene.enter('add-announcement')
  ),
  '🔐 لوحة التحكم': admin.adminPanel,
  '👥 قائمة المستخدمين': admin.listUsers,
  '👑 إدارة الأدوار': withRole(
    [ROLES.DEVELOPER],
    (ctx) => ctx.scene.enter('manage-role')
  ),
  '📊 إحصائيات': developer.showStats,
  '📡 رسالة جماعية': developer.broadcastAnnouncement,
  '📣 إعلان عام': developer.broadcastAnnouncement,
  '🕌 قائمة المساجد': developer.listMosques,
  '❄️ تفعيل/تجميد مسجد': developer.enterToggleMosque,
  '🗑️ حذف مسجد': developer.enterDeleteMosque,
  '🕌 إضافة مسجد': withRole(
    [ROLES.DEVELOPER],
    (ctx) => ctx.scene.enter('add-mosque')
  )
};

async function dispatchMenuButton(ctx, text) {
  const handler = MENU_HANDLERS[text];
  if (!handler) return false;
  await handler(ctx);
  return true;
}

module.exports = { MENU_HANDLERS, dispatchMenuButton };

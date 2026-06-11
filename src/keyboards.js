const { Markup } = require('telegraf');

const ROLES = {
  DEVELOPER: 'developer',
  ADMIN: 'admin',
  SHEIKH: 'sheikh',
  WORSHIPPER: 'worshipper'
};

const ROLE_LABELS = {
  developer: '👑 مطور النظام',
  admin: '🏛️ مسؤول مسجد',
  sheikh: '📖 شيخ / إمام',
  worshipper: '🕌 مصلي'
};

// أزرار القائمة حسب الدور
const BASE_BUTTONS = [
  ['📅 مواقيت الصلاة', '📢 الإعلانات'],
  ['📚 الدروس', '🕌 معلومات المسجد'],
  ['❓ إرسال سؤال', '🆘 طلب مساعدة'],
  ['📖 القرآن الكريم']
];

const SHEIKH_BUTTONS = [
  ['📝 إضافة درس', '💬 الأسئلة الواردة'],
  ['📖 لوحة الشيخ']
];

const ADMIN_BUTTONS = [
  ['⏰ تحديث مواقيت الصلاة', '📢 إضافة إعلان'],
  ['🔐 لوحة التحكم', '👥 قائمة المستخدمين']
];

const DEVELOPER_BUTTONS = [
  ['👑 إدارة الأدوار', '📊 إحصائيات'],
  ['📡 رسالة جماعية', '📣 إعلان عام'],
  ['🕌 إضافة مسجد', '🕌 قائمة المساجد'],
  ['❄️ تفعيل/تجميد مسجد', '🗑️ حذف مسجد']
];

function mainKeyboard(role) {
  let rows = [...BASE_BUTTONS];

  if ([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(role)) {
    rows = [...rows, ...SHEIKH_BUTTONS];
  }
  if ([ROLES.ADMIN, ROLES.DEVELOPER].includes(role)) {
    rows = [...rows, ...ADMIN_BUTTONS];
  }
  if (role === ROLES.DEVELOPER) {
    rows = [...rows, ...DEVELOPER_BUTTONS];
  }

  return Markup.keyboard(rows).resize();
}

function cancelKeyboard() {
  return Markup.keyboard([['❌ إلغاء']]).resize();
}

const MENU_BUTTONS = new Set([
  ...BASE_BUTTONS.flat(),
  ...SHEIKH_BUTTONS.flat(),
  ...ADMIN_BUTTONS.flat(),
  ...DEVELOPER_BUTTONS.flat()
]);

const CANCEL_BUTTON = '❌ إلغاء';

const NAV_COMMANDS = new Set(['/start', '/menu', '/cancel', '/help']);

const FLOW_SESSION_KEYS = [
  'searchingQuran', 'quranAyahPrompt', 'quranHafizMode',
  'addingSheikh', 'addingSheikhSpecialty', 'addingSheikhPhone', 'sheikhData',
  'settingIBAN', 'settingPayPal', 'answeringSecretQuestion',
  'addingCircle', 'addingCircleSchedule', 'addingCircleTopic', 'circleData',
  'uploadingSermon', 'uploadingSermonContent', 'sermonData'
];

function isMenuButton(text) {
  return typeof text === 'string' && MENU_BUTTONS.has(text);
}

function isNavMessage(text) {
  if (typeof text !== 'string') return false;
  const command = text.split('@')[0];
  return isMenuButton(text) || text === CANCEL_BUTTON || NAV_COMMANDS.has(command);
}

function isInScene(ctx) {
  return Boolean(ctx.session?.__scenes?.current);
}

function hasActiveFlow(ctx) {
  if (!ctx.session) return false;
  return FLOW_SESSION_KEYS.some((key) => ctx.session[key] !== undefined && ctx.session[key] !== false);
}

function clearFlowSession(ctx) {
  const userRole = ctx.session?.userRole;
  ctx.session = userRole ? { userRole } : {};
}

async function resetUserState(ctx) {
  if (ctx.scene) {
    try { await ctx.scene.leave(); } catch (e) {}
  }
  if (ctx.session?.__scenes) {
    delete ctx.session.__scenes;
  }
  clearFlowSession(ctx);
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  CANCEL_BUTTON,
  NAV_COMMANDS,
  mainKeyboard,
  cancelKeyboard,
  isMenuButton,
  isNavMessage,
  isInScene,
  hasActiveFlow,
  clearFlowSession,
  resetUserState
};

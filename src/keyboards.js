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

const AI_BUTTON = '🤖 المساعد الديني';
const AI_SHEIKH_BUTTON = '🤖 المساعد الديني للمشايخ';
const MESSAGES_BUTTON = '📬 الرسائل';

// أزرار القائمة حسب الدور — المساعد الديني في صف مستقل ليظهر على جميع الشاشات
const BASE_BUTTONS = [
  ['🤖 المساعد الديني'],
  ['📅 مواقيت الصلاة', '📢 الإعلانات'],
  ['📚 الدروس', '🕌 معلومات المسجد'],
  ['❓ إرسال سؤال', '🆘 طلب مساعدة'],
  ['📖 القرآن الكريم']
];

const SHEIKH_BUTTONS = [
  ['📝 إضافة درس', '💬 الأسئلة الواردة'],
  ['📖 لوحة الشيخ', MESSAGES_BUTTON],
  [AI_SHEIKH_BUTTON]
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

const WORSHIPPER_BUTTONS = [
  ['🎓 أنا عالم']
];

const SCHOLAR_BUTTONS = [
  ['⚔️ أدوات المناظرة', '✏️ مراجعة الإجابات'],
  ['🕌 إدارة المشايخ', '📊 سجل النزاعات'],
  ['📬 صندوق العالم']
];

const MODERATOR_BUTTONS = [
  ['📋 طلبات العلماء', '🕌 طلبات المساجد'],
  ['📊 إحصائيات المشرف']
];

function mainKeyboard(role) {
  let rows = [...BASE_BUTTONS];

  if (role === ROLES.WORSHIPPER) {
    rows = [...rows, ...WORSHIPPER_BUTTONS];
  }
  if (role === 'SCHOLAR') {
    rows = [...rows, ...SCHOLAR_BUTTONS];
  }
  if ([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(role)) {
    rows = [...rows, ...SHEIKH_BUTTONS];
  }
  if ([ROLES.ADMIN, ROLES.DEVELOPER].includes(role)) {
    rows = [...rows, ...ADMIN_BUTTONS];
  }
  if (role === ROLES.DEVELOPER) {
    rows = [...rows, ...DEVELOPER_BUTTONS];
  }
  if (role === ROLES.DEVELOPER) {
    rows = [...rows, ...WORSHIPPER_BUTTONS, ...SCHOLAR_BUTTONS];
  }
  if (role === 'MODERATOR') {
    rows = [...rows, ...MODERATOR_BUTTONS];
  }
  if (role === 'developer' || role === 'DEVELOPER') {
    rows = [...rows, ...MODERATOR_BUTTONS];
  }

  return Markup.keyboard(rows).resize();
}

function cancelKeyboard() {
  return Markup.keyboard([['❌ إلغاء']]).resize();
}

const MENU_BUTTONS = new Set([
  ...BASE_BUTTONS.flat(),
  ...WORSHIPPER_BUTTONS.flat(),
  ...SHEIKH_BUTTONS.flat(),
  ...ADMIN_BUTTONS.flat(),
  ...DEVELOPER_BUTTONS.flat(),
  ...SCHOLAR_BUTTONS.flat(),
  ...MODERATOR_BUTTONS.flat()
]);

const CANCEL_BUTTON = '❌ إلغاء';

const NAV_COMMANDS = new Set(['/start', '/menu', '/cancel', '/help']);

const FLOW_SESSION_KEYS = [
  'aiMode', 'aiSetupStep', 'aiMadhabSelection', 'aiSectSelection', 'aiWaitingCity',
  'aiScholarContext', 'aiScholarAdvancedMode',
  'aiKhutbahMode', 'aiKhutbahStep', 'aiTargetLanguage',
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
  AI_BUTTON,
  AI_SHEIKH_BUTTON,
  MESSAGES_BUTTON,
  CANCEL_BUTTON,
  NAV_COMMANDS,
  MENU_BUTTONS,
  mainKeyboard,
  cancelKeyboard,
  isMenuButton,
  isNavMessage,
  isInScene,
  hasActiveFlow,
  clearFlowSession,
  resetUserState
};

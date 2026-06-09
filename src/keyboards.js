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

module.exports = { ROLES, ROLE_LABELS, mainKeyboard, cancelKeyboard };

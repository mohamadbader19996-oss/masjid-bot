const db = require('../database');
const { ROLES, ROLE_LABELS } = require('../keyboards');

const PRAYER_ICONS = ['🌙', '☀️', '🌤️', '🌇', '🌑'];
const PRAYER_NAMES = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

async function manageMosque(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const mosque = db.firstMosque();
  if (!mosque) {
    return ctx.reply(
      '🕌 لم يتم إضافة مسجد بعد.\n\n💡 استخدم زر *🕌 إضافة مسجد* لإنشاء مسجد جديد.',
      { parse_mode: 'Markdown' }
    );
  }

  const t = mosque.prayerTimes || {};
  const prayerLines = PRAYER_KEYS.map((key, i) =>
    `${PRAYER_ICONS[i]} ${PRAYER_NAMES[i]}: ${t[key] || '—'}`
  ).join('\n');

  await ctx.reply(
    `🕌 *معلومات المسجد*\n\n📛 *الاسم:* ${mosque.name}\n📍 *الموقع:* ${mosque.location || 'غير محدد'}\n\n📅 *مواقيت الصلاة:*\n${prayerLines}`,
    { parse_mode: 'Markdown' }
  );
}

async function listUsers(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const users = db.allUsers();
  if (!users.length) {
    return ctx.reply('👥 لا يوجد مستخدمون مسجلون بعد.');
  }

  // تجميع المستخدمين حسب الدور
  const grouped = {};
  for (const u of users) {
    if (!grouped[u.role]) grouped[u.role] = [];
    grouped[u.role].push(u);
  }

  const roleOrder = [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SHEIKH, ROLES.WORSHIPPER];

  let msg = `👥 *قائمة المستخدمين*\n📊 الإجمالي: ${users.length} مستخدم\n`;

  for (const role of roleOrder) {
    const roleUsers = grouped[role];
    if (!roleUsers?.length) continue;

    msg += `\n${ROLE_LABELS[role]}: ${roleUsers.length}\n`;
    for (const u of roleUsers.slice(0, 5)) {
      const name = `${u.firstName}${u.lastName ? ' ' + u.lastName : ''}`;
      const handle = u.username ? ` (@${u.username})` : '';
      msg += `  • ${name}${handle} [${u.id}]\n`;
    }
    if (roleUsers.length > 5) {
      msg += `  _...و ${roleUsers.length - 5} آخرين_\n`;
    }
  }

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

module.exports = { manageMosque, listUsers };

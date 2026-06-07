const db = require('../database');
const { ROLES, ROLE_LABELS } = require('../keyboards');

async function showStats(ctx) {
  if (ctx.user?.role !== ROLES.DEVELOPER) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const users = db.allUsers();
  const mosques = db.allMosques();
  const announcements = db.getAnnouncements(1000);
  const lessons = db.getLessons(1000);
  const pending = db.pendingQuestions();

  const byRole = {};
  for (const u of users) {
    byRole[u.role] = (byRole[u.role] || 0) + 1;
  }

  const roleOrder = [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SHEIKH, ROLES.WORSHIPPER];

  let roleLines = '';
  for (const role of roleOrder) {
    if (byRole[role]) {
      roleLines += `  ${ROLE_LABELS[role]}: ${byRole[role]}\n`;
    }
  }

  const msg =
    `📊 *إحصائيات بوت المسجد*\n\n` +
    `👥 *المستخدمون:* ${users.length}\n${roleLines}\n` +
    `🕌 *المساجد:* ${mosques.length}\n` +
    `📢 *الإعلانات:* ${announcements.length}\n` +
    `📚 *الدروس:* ${lessons.length}\n` +
    `❓ *أسئلة بانتظار إجابة:* ${pending.length}`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

module.exports = { showStats };

const db = require('../database');
const { mainKeyboard, ROLES, ROLE_LABELS, resetUserState } = require('../keyboards');

async function handleStart(ctx) {
  await resetUserState(ctx);

  const userId = ctx.from.id;
  const isDev = db.isDeveloper(userId);

  let user = db.getUser(userId);

  if (!user) {
    user = db.saveUser(userId, {
      id: userId,
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      role: isDev ? ROLES.DEVELOPER : ROLES.WORSHIPPER,
      joinedAt: new Date().toISOString()
    });
  } else if (isDev && user.role !== ROLES.DEVELOPER) {
    user = db.saveUser(userId, { role: ROLES.DEVELOPER });
  }

  ctx.session.userRole = user.role;
  ctx.user = user;

  const roleLabel = ROLE_LABELS[user.role];

  await ctx.reply(
    `السلام عليكم ورحمة الله وبركاته 🕌\n\nأهلاً بك *${user.firstName}*!\nمرحباً في بوت إدارة المسجد.\n\n🏷️ صلاحيتك: ${roleLabel}\n\nاختر من القائمة أدناه:`,
    { parse_mode: 'Markdown', ...mainKeyboard(user.role) }
  );
}

module.exports = { handleStart };

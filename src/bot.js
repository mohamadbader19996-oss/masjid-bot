const { Telegraf, Scenes, session } = require('telegraf');
const db = require('./database');
const { mainKeyboard, ROLES } = require('./keyboards');
const { scenes } = require('./scenes');
const { handleStart } = require('./handlers/start');
const common = require('./handlers/common');
const sheikh = require('./handlers/sheikh');
const admin = require('./handlers/admin');
const developer = require('./handlers/developer');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ── Middleware ────────────────────────────────────

bot.use(session());

// مصادقة: تسجيل المستخدم وتحديد دوره في كل طلب
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();

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

  ctx.user = user;
  ctx.session ??= {};
  ctx.session.userRole = user.role;

  return next();
});

// المشاهد (Scenes/Wizards)
const stage = new Scenes.Stage(scenes);
bot.use(stage.middleware());

// ── أوامر عامة ──────────────────────────────────

bot.command('cancel', async (ctx) => {
  try { await ctx.scene.leave(); } catch { /* لا توجد مشهد نشط */ }
  await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

bot.start(handleStart);

bot.command('help', async (ctx) => {
  const role = ctx.user?.role || ROLES.WORSHIPPER;
  await ctx.reply(
    `🕌 *مساعدة بوت المسجد*\n\nاستخدم الأزرار في لوحة المفاتيح للتنقل.\n\n*الأوامر المتاحة:*\n/start - بدء البوت وعرض القائمة\n/help - عرض هذه المساعدة\n/cancel - إلغاء العملية الحالية`,
    { parse_mode: 'Markdown', ...mainKeyboard(role) }
  );
});

bot.command('menu', async (ctx) => {
  await ctx.reply('القائمة الرئيسية:', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

// ── مستوى المصلي ─────────────────────────────────

bot.hears('📅 مواقيت الصلاة', common.showPrayerTimes);
bot.hears('📢 الإعلانات', common.showAnnouncements);
bot.hears('📚 الدروس', common.showLessons);
bot.hears('🕌 معلومات المسجد', common.showMosqueInfo);
bot.hears('❓ إرسال سؤال', (ctx) => ctx.scene.enter('ask-question'));

// ── مستوى الشيخ ──────────────────────────────────

bot.hears('📝 إضافة درس', (ctx) => {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية لهذا الإجراء.');
  }
  return ctx.scene.enter('add-lesson');
});

bot.hears('💬 الأسئلة الواردة', sheikh.showPendingQuestions);

// callback للإجابة على سؤال محدد
bot.action(/^answer_(.+)$/, async (ctx) => {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();
  return ctx.scene.enter('answer-question', { questionId: ctx.match[1] });
});

// ── مستوى مسؤول المسجد ───────────────────────────

bot.hears('⏰ تحديث مواقيت الصلاة', (ctx) => {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية لهذا الإجراء.');
  }
  return ctx.scene.enter('set-prayer-times');
});

bot.hears('📢 إضافة إعلان', (ctx) => {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية لهذا الإجراء.');
  }
  return ctx.scene.enter('add-announcement');
});

bot.hears('🏛️ إدارة المسجد', admin.manageMosque);
bot.hears('👥 قائمة المستخدمين', admin.listUsers);

// ── مستوى المطور ─────────────────────────────────

bot.hears('👑 إدارة الأدوار', (ctx) => {
  if (ctx.user?.role !== ROLES.DEVELOPER) return ctx.reply('⛔ ليس لديك صلاحية.');
  return ctx.scene.enter('manage-role');
});

bot.hears('📊 إحصائيات', developer.showStats);

bot.hears('📡 رسالة جماعية', (ctx) => {
  if (ctx.user?.role !== ROLES.DEVELOPER) return ctx.reply('⛔ ليس لديك صلاحية.');
  return ctx.scene.enter('broadcast');
});

bot.hears('🕌 إضافة مسجد', (ctx) => {
  if (ctx.user?.role !== ROLES.DEVELOPER) return ctx.reply('⛔ ليس لديك صلاحية.');
  return ctx.scene.enter('add-mosque');
});

// ── رسائل غير معروفة ──────────────────────────────

bot.on('text', (ctx) => {
  ctx.reply(
    '❓ لم أفهم هذا الأمر.\n\nاستخدم الأزرار في القائمة أو اكتب /menu لإظهار القائمة.',
    mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER)
  );
});

module.exports = { bot };

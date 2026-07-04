const registry = require('./core/actionRegistry');
const sheikhPanel = require('./handlers/sheikh_new');
const ai = require('./handlers/ai');
const { dawahMenu } = require('./handlers/dawah');
const {
  handleVolunteerApprove,
  handleVolunteerReject
} = require('./handlers/volunteers');
const db = require('./database');
const { Markup } = require('telegraf');
const { ROLES, AI_SHEIKH_BUTTON, MESSAGES_BUTTON, normalizeMenuButton } = require('./keyboards');
const { localizedMainKeyboard } = require('./services/uiTranslate');
const { buildNextPrayerLineForCtx } = require('./services/prayerTimes');
const { handleHisnMuslimMenu } = require('./handlers/hisnMuslim');
const { handleHadithMenu } = require('./handlers/hadith');
const { handleQuotesMenu } = require('./handlers/quotes');
const { handleTasbihStart } = require('./handlers/tasbih');
const { handleHijriCalendar } = require('./handlers/hijriCalendar');
const { handleNamesMenu } = require('./handlers/namesOfAllah');
const { handlePrayerFiqhMenu } = require('./handlers/prayerFiqh');

function withRole(roles, handler) {
  return async (ctx) => {
    if (!roles.includes(ctx.user?.role)) {
      return ctx.reply('⛔ ليس لديك صلاحية.');
    }
    return handler(ctx);
  };
}

registry.registerMenu('❓ إرسال سؤال', (ctx) => ctx.scene.enter('ask-question'), 'إرسال سؤال');
registry.registerMenu('🛡️ حصن المسلم', handleHisnMuslimMenu, 'حصن المسلم - الأدعية والأذكار');
registry.registerMenu('📜 قسم الحديث', handleHadithMenu, 'قسم الحديث');
registry.registerMenu('💬 أقوال وحكم', handleQuotesMenu, 'أقوال وحكم وشعر');
registry.registerMenu('🙏 سبحة', handleTasbihStart, 'سبحة تفاعلية');
registry.registerMenu('📿 سبحة', handleTasbihStart, 'سبحة تفاعلية (الاسم السابق)');
registry.registerMenu('📅 التقويم الهجري', handleHijriCalendar, 'التقويم الهجري والمناسبات');
registry.registerMenu('🕊️ أسماء الله الحسنى', handleNamesMenu, 'أسماء الله الحسنى');

registry.registerMenu('🔔 إشعار الأذان', async (ctx) => {
  const userId = String(ctx.from.id);
  const user = db.getUser(userId) || {};
  const enabled = user.adhanNotifications === true;
  db.saveUser(userId, { adhanNotifications: !enabled });
  if (enabled) {
    return ctx.reply('🔕 تم إيقاف إشعار الأذان');
  }
  return ctx.reply('✅ تم تفعيل إشعار الأذان، ستصلك رسالة وصوت أذان عند كل وقت صلاة');
}, 'تفعيل/إيقاف إشعار الأذان');

registry.registerMenu('🆘 طلب مساعدة', (ctx) => ctx.scene.enter('add-help-request'), 'طلب مساعدة');
registry.registerMenu(
  '🆘 طلبات المساعدة',
  withRole([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER], (ctx) => {
    const { handleHelpRequestsList } = require('./handlers/helpRequests');
    return handleHelpRequestsList(ctx, 1);
  }),
  'عرض طلبات المساعدة المعلقة'
);
registry.registerMenu(
  AI_SHEIKH_BUTTON,
  withRole([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER], ai.aiScholarMenu),
  'المساعد الديني للمشايخ'
);
registry.registerMenu('🕊️ القسم الدعوي', dawahMenu, 'القسم الدعوي');
registry.registerMenu('🤝 تطوع دعوي', async (ctx) => {
  const { showVolunteerRegistration } = require('./handlers/volunteers');
  await ctx.reply(
    '🤝 *التطوع الدعوي في منارة المسلم*\n\n' +
    'بتطوعك ستساهم في:\n\n' +
    '🕌 *الشهادة على إسلام الجدد* — تكون حاضراً في أعظم لحظة\n' +
    '🤝 *مرافقة المسلمين الجدد* — 40 يوماً من التوجيه\n' +
    '💬 *الحوار الدعوي* — تتحدث مع المهتمين بلغتك\n' +
    '📚 *تعليم الأساسيات* — الصلاة والوضوء والأركان\n\n' +
    '﴿ادْعُ إِلَىٰ سَبِيلِ رَبِّكَ بِالْحِكْمَةِ وَالْمَوْعِظَةِ الْحَسَنَةِ﴾\n\n' +
    '_كل متطوع يُراجع من مدير مسجده قبل التفعيل_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ أريد التسجيل كمتطوع', callback_data: 'vol_start_reg' }],
          [{ text: '📊 إحصائيات التطوع', callback_data: 'vol_stats' }]
        ]
      }
    }
  );
});

registry.registerMenu('🎙️ تطوع للتسميع والتصحيح', async (ctx) => {
  const { showRecitationVolunteerRegistration } = require('./handlers/recitationVolunteers');
  return showRecitationVolunteerRegistration(ctx);
}, 'تطوع للتسميع والتصحيح');

// أقسام الدعوة — سيتم بناؤها لاحقاً
registry.registerAction('dawah_counter', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('🌙 من دخلوا الإسلام — قريباً!');
}, 'من دخلوا الإسلام');

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
registry.registerMenu('📩 تقديم شكوى أو اقتراح', async (ctx) => {
  const userId = String(ctx.from.id);
  const user = db.getUser(userId);
  if (!user?.mosqueId) {
    return ctx.reply('⚠️ أنت غير مرتبط بمسجد بعد.');
  }
  await ctx.reply(
    `📩 *تقديم شكوى أو اقتراح*\n━━━━━━━━━━━━━━━━━━\nاختر نوع الشكوى:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔧 صيانة وأعطال', 'logistics_menu')],
        [Markup.button.callback('🤝 شكوى سلوكية', 'complaint_behavior')],
        [Markup.button.callback('📢 شكوى إدارية', 'complaint_admin')],
        [Markup.button.callback('💡 اقتراح', 'complaint_suggestion')],
      ])
    }
  );
}, 'تقديم شكوى أو اقتراح');

// موافقة/رفض المتطوعين — ديناميكي
registry.registerAction(/^vol_approve_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await handleVolunteerApprove(ctx, ctx.match[1]);
}, 'قبول متطوع دعوي');

registry.registerAction(/^vol_reject_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await handleVolunteerReject(ctx, ctx.match[1]);
}, 'رفض متطوع دعوي');

// موافقة DEVELOPER على المتطوعين
registry.registerAction(/^dev_vol_approve_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const volunteerId = ctx.match[1];
  const db_data = db.get('volunteers') || {};
  const vol = db_data[volunteerId];
  if (!vol) {
    await ctx.answerCbQuery('❌ المتطوع غير موجود', { show_alert: true });
    return;
  }
  vol.active = true;
  vol.devApproved = true;
  vol.devApprovedAt = new Date().toISOString();
  db.set('volunteers', db_data);
  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '🎉 *تم قبول طلب تطوعك الدعوي!*\n\n' +
      'أنت الآن متطوع نشط في منارة المسلم. 🌟',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.editMessageText('✅ تم قبول المتطوع وتفعيله.');
}, 'موافقة DEVELOPER على متطوع');

registry.registerAction(/^dev_vol_reject_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const volunteerId = ctx.match[1];
  const db_data = db.get('volunteers') || {};
  if (db_data[volunteerId]) {
    delete db_data[volunteerId];
    db.set('volunteers', db_data);
  }
  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '❌ *نأسف، لم يتم قبول طلب تطوعك.*',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.editMessageText('تم رفض الطلب.');
}, 'رفض DEVELOPER لمتطوع');

registry.registerMenu(
  '🏠 الرئيسية',
  async (ctx) => {
    const role = ctx.user?.role || ROLES.WORSHIPPER;
    const msg = 'القائمة الرئيسية 👇' + buildNextPrayerLineForCtx(ctx);
    const kbd = await localizedMainKeyboard(ctx, role);
    return ctx.reply(msg, kbd);
  },
  'إعادة عرض القائمة الرئيسية'
);
registry.registerMenu(
  '🔄 القائمة الرئيسية',
  async (ctx) => {
    const role = ctx.user?.role || ROLES.WORSHIPPER;
    const msg = 'القائمة الرئيسية 👇' + buildNextPrayerLineForCtx(ctx);
    const kbd = await localizedMainKeyboard(ctx, role);
    return ctx.reply(msg, kbd);
  },
  'إعادة عرض القائمة الرئيسية (الاسم السابق)'
);

function getMenuHandlers() {
  return registry.getMenuHandlers();
}

async function dispatchMenuButton(ctx, text) {
  text = normalizeMenuButton(text);
  const handler = getMenuHandlers()[text];
  if (!handler) return false;
  await handler(ctx);
  const { BASE_MENU_BUTTONS } = require('./keyboards');
  if (BASE_MENU_BUTTONS.has(text)) {
    db.incrementMainMenuUsage(text);
  }
  return true;
}

module.exports = { getMenuHandlers, dispatchMenuButton };

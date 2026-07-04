const db = require('../database');
const { Markup } = require('telegraf');

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function sendIdentityChecks(bot) {
  const mosques = db.getAllMosques();
  const now = Date.now();

  for (const mosque of Object.values(mosques)) {
    const roles = db.getMosqueRoles(mosque.id) || {};

    for (const [userId, roleData] of Object.entries(roles)) {
      const lastCheck = roleData.lastIdentityCheck
        ? new Date(roleData.lastIdentityCheck).getTime()
        : new Date(roleData.assignedAt || 0).getTime();
      const sinceLastCheck = now - lastCheck;

      // إرسال تحقق جديد كل 6 أشهر
      if (sinceLastCheck >= SIX_MONTHS_MS && !roleData.pendingIdentityCheck) {
        await bot.telegram.sendMessage(userId,
          `🔐 *تحقق دوري — منارة المسلم*\n\n` +
          `مرحباً، هل لا تزال تشغل دورك في *${mosque.name}*؟\n\n` +
          `يُرجى التأكيد خلال 7 أيام وإلا سيُعلَّق حسابك مؤقتاً.`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ نعم، لا زلت', `ic_confirm_${mosque.id}_${userId}`)],
              [Markup.button.callback('🔄 تغير دوري', `ic_change_${mosque.id}_${userId}`)],
              [Markup.button.callback('❌ غادرت المسجد', `ic_leave_${mosque.id}_${userId}`)]
            ])
          }
        ).catch(() => {});

        // تسجيل أن التحقق أُرسل
        const rolesData = db.getMosqueRoles(mosque.id) || {};
        rolesData[userId] = {
          ...rolesData[userId],
          pendingIdentityCheck: new Date().toISOString()
        };
        db.setMosqueRoles(mosque.id, rolesData);
      }

      // تعليق من لم يرد خلال 7 أيام
      if (roleData.pendingIdentityCheck) {
        const pendingSince = new Date(roleData.pendingIdentityCheck).getTime();
        if (now - pendingSince >= SEVEN_DAYS_MS) {
          const rolesData = db.getMosqueRoles(mosque.id) || {};
          rolesData[userId] = {
            ...rolesData[userId],
            suspended: true,
            suspendedAt: new Date().toISOString(),
            pendingIdentityCheck: null
          };
          db.setMosqueRoles(mosque.id, rolesData);

          // إشعار المدير
          if (mosque.adminId && String(mosque.adminId) !== String(userId)) {
            await bot.telegram.sendMessage(String(mosque.adminId),
              `⚠️ *تعليق تلقائي*\n\n` +
              `المستخدم ${userId} لم يرد على تحقق الهوية خلال 7 أيام.\n` +
              `تم تعليق حسابه في *${mosque.name}* مؤقتاً.`,
              { parse_mode: 'Markdown' }
            ).catch(() => {});
          }
        }
      }
    }
  }
}

async function handleIdentityConfirm(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data.replace('ic_confirm_', '');
  const [mosqueId, userId] = data.split('_');
  const roles = db.getMosqueRoles(mosqueId) || {};
  if (roles[userId]) {
    roles[userId] = {
      ...roles[userId],
      pendingIdentityCheck: null,
      suspended: false,
      lastIdentityCheck: new Date().toISOString()
    };
    db.setMosqueRoles(mosqueId, roles);
  }
  await ctx.editMessageText('✅ شكراً! تم تأكيد هويتك وتجديد عضويتك لـ 6 أشهر قادمة.');
}

async function handleIdentityChange(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data.replace('ic_change_', '');
  const [mosqueId] = data.split('_');
  const mosque = db.getMosque(mosqueId);
  await ctx.editMessageText(
    `🔄 *تغيير الدور*\n\nسيتم إشعار مدير ${mosque?.name || 'المسجد'} لتعديل دورك.`,
    { parse_mode: 'Markdown' }
  );
  if (mosque?.adminId) {
    await ctx.telegram.sendMessage(String(mosque.adminId),
      `🔄 *طلب تغيير دور*\n\n` +
      `المستخدم ${ctx.from.first_name || ctx.from.id} يريد تغيير دوره في *${mosque.name}*.\n` +
      `راجع الفريق الإداري وعدّل الأدوار.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

async function handleIdentityLeave(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data.replace('ic_leave_', '');
  const [mosqueId, userId] = data.split('_');
  const mosque = db.getMosque(mosqueId);
  const roles = db.getMosqueRoles(mosqueId) || {};
  delete roles[userId];
  db.setMosqueRoles(mosqueId, roles);
  await ctx.editMessageText('✅ تم تسجيل مغادرتك. جزاك الله خيراً على خدمتك.');
  if (mosque?.adminId && String(mosque.adminId) !== String(userId)) {
    await ctx.telegram.sendMessage(String(mosque.adminId),
      `👋 *مغادرة فريق*\n\n` +
      `${ctx.from.first_name || 'أحد الأعضاء'} غادر فريق *${mosque.name}* عبر التحقق الدوري.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
}

module.exports = {
  sendIdentityChecks,
  handleIdentityConfirm,
  handleIdentityChange,
  handleIdentityLeave
};

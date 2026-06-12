const { Markup } = require('telegraf');
const db = require('../database');

function cleanFormat(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '*$1*');
}

function canAccess(user) {
  return user && (
    user.role === 'MODERATOR' ||
    user.role === 'developer' ||
    user.role === 'DEVELOPER'
  );
}

async function moderatorPanel(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!canAccess(user)) return ctx.reply('⛔ غير مصرح.');

  const pendingScholars = db.getPendingScholarApplications();
  const pendingMosques = db.getPendingMosques ? db.getPendingMosques() : [];

  await ctx.reply(
    `🛡️ *لوحة المشرف*\n\n` +
    `📋 طلبات علماء معلقة: ${pendingScholars.length}\n` +
    `🕌 طلبات مساجد معلقة: ${pendingMosques.length}\n\n` +
    `اختر ما تريد إدارته:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`📋 طلبات العلماء (${pendingScholars.length})`, 'mod_scholar_requests')],
        [Markup.button.callback(`🕌 طلبات المساجد (${pendingMosques.length})`, 'mod_mosque_requests')],
        [Markup.button.callback('📊 الإحصائيات', 'mod_stats')],
        ...(user.role === 'developer' || user.role === 'DEVELOPER'
          ? [[Markup.button.callback('👥 قائمة المشرفين', 'mod_list')]]
          : []),
        [Markup.button.callback('🔙 رجوع', 'noop')]
      ])
    }
  );
}

async function scholarRequests(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const user = db.getUser(ctx.from.id);
  if (!canAccess(user)) return;

  const pending = db.getPendingScholarApplications();
  if (pending.length === 0) {
    return ctx.reply('✅ لا توجد طلبات علماء معلقة.');
  }

  ctx.session.modScholarList = pending;
  ctx.session.modScholarIndex = 0;
  await showScholarRequest(ctx, pending, 0);
}

async function showScholarRequest(ctx, requests, index) {
  const req = requests[index];
  if (!req) return;

  const total = requests.length;
  const current = index + 1;

  await ctx.reply(
    `📋 *طلب عالم ${current} من ${total}*\n\n` +
    `👤 الاسم: ${req.fullName}\n` +
    `📚 التخصص: ${req.specialization}\n` +
    `🎓 المؤهل: ${req.qualification}\n` +
    `🕌 المؤسسة: ${req.institution}\n` +
    `🔗 التوثيق: ${req.recommendation}\n` +
    `📞 الهاتف: ${req.phone || 'لم يذكر'}\n` +
    `📅 تاريخ التقديم: ${new Date(req.submittedAt).toLocaleDateString('ar')}\n` +
    `🆔 معرف المستخدم: ${req.userId}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ قبول', `mod_approve_scholar_${req.id}`),
          Markup.button.callback('❌ رفض', `mod_reject_scholar_${req.id}`)
        ],
        [
          index > 0 ? Markup.button.callback('⬅️ السابق', `mod_scholar_prev_${index - 1}`) : Markup.button.callback('·', 'noop'),
          index < total - 1 ? Markup.button.callback('التالي ➡️', `mod_scholar_next_${index + 1}`) : Markup.button.callback('·', 'noop')
        ],
        [Markup.button.callback('🔙 رجوع', 'mod_panel')]
      ])
    }
  );
}

async function approveScholar(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const user = db.getUser(ctx.from.id);
  if (!canAccess(user)) return;

  const appId = ctx.callbackQuery.data.replace('mod_approve_scholar_', '');
  const app = db.approveScholarApplication(appId, String(ctx.from.id));
  if (!app) return ctx.reply('❌ الطلب غير موجود.');

  try {
    await ctx.telegram.sendMessage(
      app.userId,
      `🎉 *تهانينا! تم قبول طلبك*\n\n` +
      `أنت الآن عالم معتمد في منصة منارة المسلم.\n` +
      `اكتب /start لرؤية لوحتك الجديدة. 🤲`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.error('Error notifying scholar:', e.message);
  }

  await ctx.reply(
    `✅ *تم قبول ${app.fullName} كعالم معتمد!*\n\nتم إشعاره تلقائياً.`,
    { parse_mode: 'Markdown' }
  );
}

async function rejectScholarPrompt(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const appId = ctx.callbackQuery.data.replace('mod_reject_scholar_', '');
  ctx.session.rejectingScholarId = appId;
  await ctx.reply(
    '❌ *سبب الرفض:*\n\nأرسل سبب الرفض وسيصل للمتقدم:',
    { parse_mode: 'Markdown' }
  );
}

async function handleRejectText(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!canAccess(user)) return false;
  if (!ctx.session.rejectingScholarId) return false;

  const reason = ctx.message.text;
  const appId = ctx.session.rejectingScholarId;
  const app = db.rejectScholarApplication(appId, String(ctx.from.id), reason);

  if (app) {
    try {
      await ctx.telegram.sendMessage(
        app.userId,
        `❌ *نأسف، لم يتم قبول طلبك*\n\n` +
        `*السبب:* ${reason}\n\n` +
        `يمكنك التقديم مجدداً بعد استيفاء المتطلبات. 🤲`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Error notifying rejected scholar:', e.message);
    }
    await ctx.reply('✅ تم رفض الطلب وإشعار المتقدم.');
  }

  ctx.session.rejectingScholarId = null;
  return true;
}

async function modStats(ctx) {
  await ctx.answerCbQuery().catch(() => {});

  const pending = db.getPendingScholarApplications();
  const moderators = db.getModerators();
  const scholars = db.getAllScholars ? db.getAllScholars() : [];

  await ctx.reply(
    `📊 *إحصائيات المنصة*\n\n` +
    `👥 المشرفون: ${moderators.length}\n` +
    `🎓 العلماء المعتمدون: ${scholars.length}\n` +
    `📋 طلبات معلقة: ${pending.length}\n`,
    { parse_mode: 'Markdown' }
  );
}

async function modList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const user = db.getUser(ctx.from.id);
  if (!canAccess(user)) return;

  const moderators = db.getModerators();
  if (moderators.length === 0) {
    return ctx.reply('لا يوجد مشرفون حالياً.');
  }

  let text = `👥 *قائمة المشرفين:*\n\n`;
  moderators.forEach((mod, i) => {
    const modUser = db.getUser(mod.userId);
    text += `${i + 1}. ${modUser?.firstName || 'مجهول'} (${mod.userId})\n`;
  });

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

function register(registry) {
  registry.registerMenu('📋 طلبات العلماء', moderatorPanel, 'طلبات العلماء — قائمة');
  registry.registerMenu('🕌 طلبات المساجد', moderatorPanel, 'طلبات المساجد — قائمة');
  registry.registerMenu('📊 إحصائيات المشرف', moderatorPanel, 'إحصائيات المشرف — قائمة');

  registry.registerAction('mod_panel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await moderatorPanel(ctx);
  }, 'لوحة المشرف');

  registry.registerAction('mod_scholar_requests', scholarRequests, 'طلبات العلماء');

  registry.registerAction('mod_mosque_requests', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('🕌 طلبات المساجد — قريباً.');
  }, 'طلبات المساجد');

  registry.registerAction('mod_stats', modStats, 'إحصائيات المشرف');
  registry.registerAction('mod_list', modList, 'قائمة المشرفين');
  registry.registerAction(/^mod_approve_scholar_/, approveScholar, 'قبول عالم');
  registry.registerAction(/^mod_reject_scholar_/, rejectScholarPrompt, 'رفض عالم');

  registry.registerAction(/^mod_scholar_next_/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const index = parseInt(ctx.callbackQuery.data.replace('mod_scholar_next_', ''), 10);
    await showScholarRequest(ctx, ctx.session.modScholarList, index);
  }, 'التالي');

  registry.registerAction(/^mod_scholar_prev_/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const index = parseInt(ctx.callbackQuery.data.replace('mod_scholar_prev_', ''), 10);
    await showScholarRequest(ctx, ctx.session.modScholarList, index);
  }, 'السابق');
}

module.exports = {
  register,
  moderatorPanel,
  handleRejectText,
  canAccess
};

const { Markup } = require('telegraf');
const db = require('../database');
const registry = require('../core/actionRegistry');
const { getCountryName } = require('../data/muslimCountries');
const { loadDB } = require('../utils/db');
const { sendMissingVideosModeratorWelcomeNotice } = require('./journeyVideos');
const { sendModeratorWelcomeContentNotice } = require('./moderatorContent');
const {
  sendModeratorDevInviteQr,
  sendModeratorNominationQr,
  isRegionalModerator,
  canActAsRegionalModerator
} = require('../services/moderatorService');

async function ensureDeveloper(ctx) {
  if (!db.isDeveloper(ctx.from.id)) {
    await ctx.reply('⛔ للمطوّر فقط.');
    return false;
  }
  return true;
}

async function devModeratorInvite(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  await sendModeratorDevInviteQr(ctx);
}

async function moderatorNominationInvite(ctx) {
  if (!canActAsRegionalModerator(ctx.from.id)) {
    return ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
  }
  await sendModeratorNominationQr(ctx);
}

async function showModeratorAppDetails(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const appId = ctx.match?.[1] || ctx.callbackQuery?.data?.replace('mod_app_details_', '');
  const app = db.getModeratorApplication(appId);
  if (!app) return ctx.reply('❌ الطلب غير موجود.');

  let badge = '';
  if (app.nominatedBy) {
    const n = db.getUser(app.nominatedBy);
    const name = n ? `${n.firstName || ''} ${n.lastName || ''}`.trim() : app.nominatedBy;
    badge = `🪪 رشّحه المشرف: *${name}*\n\n`;
  }

  const text =
    badge +
    `🪪 *تفاصيل طلب مشرف*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 ${app.fullName}\n` +
    `📱 ${app.phone}\n` +
    `🌍 ${app.country || getCountryName(app.countryCode)}\n` +
    `🆔 ${app.userId}\n` +
    `📅 ${new Date(app.createdAt).toLocaleDateString('ar')}`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[
      Markup.button.callback('✅ قبول', 'mod_app_approve_' + appId),
      Markup.button.callback('❌ رفض', 'mod_app_reject_' + appId)
    ]])
  });
  if (app.idFileId) {
    await ctx.replyWithPhoto(app.idFileId, { caption: '🪪 صورة الهوية' });
  }
}

async function approveModeratorApp(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const appId = ctx.match?.[1] || ctx.callbackQuery?.data?.replace('mod_app_approve_', '');
  const app = db.getModeratorApplication(appId);
  if (!app) return ctx.reply('❌ الطلب غير موجود.');
  if (app.status !== 'pending') return ctx.reply('⚠️ تم معالجة هذا الطلب مسبقاً.');

  const approverId = String(ctx.from.id);
  const existing = db.getUser(app.userId);
  const roleBefore = existing && !['moderator', 'MODERATOR'].includes(existing.role)
    ? existing.role
    : (existing?.roleBeforeModerator || 'worshipper');

  db.saveUser(app.userId, {
    role: 'moderator',
    roleBeforeModerator: roleBefore,
    moderatorCountry: app.countryCode,
    moderatorIdFileId: app.idFileId,
    approvedBy: approverId,
    approvedAt: new Date().toISOString(),
    nominatedBy: app.nominatedBy || null
  });
  db.addModerator(app.userId, approverId);
  db.updateModeratorApplication(appId, {
    status: 'approved',
    approvedBy: approverId,
    approvedAt: new Date().toISOString()
  });

  await ctx.editMessageCaption('✅ تم قبول المشرف').catch(
    () => ctx.editMessageText('✅ تم قبول المشرف').catch(() => {})
  );

  try {
    await ctx.telegram.sendMessage(
      app.userId,
      `🎉 *تم قبولك كمشرف إقليمي!*\n\n` +
      `🌍 البلد: ${app.country || getCountryName(app.countryCode)}\n` +
      `اكتب /start لرؤية لوحتك.`,
      { parse_mode: 'Markdown' }
    );
    await sendMissingVideosModeratorWelcomeNotice(
      ctx.telegram,
      app.userId,
      app.countryCode,
      loadDB()
    );
    await sendModeratorWelcomeContentNotice(
      ctx.telegram,
      app.userId,
      app.countryCode,
      loadDB()
    );
  } catch (_) {}
}

async function rejectModeratorApp(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const appId = ctx.match?.[1] || ctx.callbackQuery?.data?.replace('mod_app_reject_', '');
  const app = db.getModeratorApplication(appId);
  if (!app) return ctx.reply('❌ الطلب غير موجود.');

  db.updateModeratorApplication(appId, { status: 'rejected', rejectedAt: new Date().toISOString() });

  await ctx.editMessageCaption('❌ تم الرفض').catch(
    () => ctx.editMessageText('❌ تم الرفض').catch(() => {})
  );

  try {
    await ctx.telegram.sendMessage(app.userId, '❌ تم رفض طلب المشرف الإقليمي.');
  } catch (_) {}
}

async function showTrackingPanel(ctx) {
  if (!await ensureDeveloper(ctx)) return;

  const moderators = db.getApprovedRegionalModerators();
  const buttons = [];
  let modList = '';
  for (const m of moderators) {
    const uid = String(m.id);
    const name = `${m.firstName || ''} ${m.lastName || ''}`.trim() || uid;
    const country = getCountryName(m.moderatorCountry);
    const nominator = m.nominatedBy ? db.getUser(m.nominatedBy) : null;
    const nomName = nominator
      ? `${nominator.firstName || ''} ${nominator.lastName || ''}`.trim()
      : '—';
    const approved = m.approvedAt
      ? new Date(m.approvedAt).toLocaleDateString('ar')
      : '—';
    modList += `• *${name}* — ${country}\n  رشّحه: ${nomName} | ${approved}\n`;
    buttons.push([
      Markup.button.callback(`🚫 عزل — ${name.slice(0, 18)}`, 'kick_moderator_' + uid)
    ]);
  }
  if (!modList) modList = '_لا يوجد مشرفون بعد_';

  const viaMod = db.getMosquesApprovedByModerators();
  let mosqueModList = '';
  for (const m of viaMod) {
    const mod = db.getUser(m.approvedByModeratorId);
    const modName = mod ? `${mod.firstName || ''}`.trim() : m.approvedByModeratorId;
    const date = m.approvedAt ? new Date(m.approvedAt).toLocaleDateString('ar') : '—';
    mosqueModList += `• *${m.name}* — ${getCountryName(m.countryCode || m.country)}\n  قبِله: ${modName} | ${date}\n`;
  }
  if (!mosqueModList) mosqueModList = '_لا يوجد مساجد عبر مشرفين بعد_';

  const viaDev = db.getMosquesApprovedByDeveloper();
  let mosqueDevList = '';
  for (const m of viaDev) {
    const date = m.approvedAt ? new Date(m.approvedAt).toLocaleDateString('ar') : '—';
    mosqueDevList += `• *${m.name}* — ${getCountryName(m.countryCode || m.country)} | ${date}\n`;
  }
  if (!mosqueDevList) mosqueDevList = '_لا يوجد_';

  const keyboard = buttons.length ? Markup.inlineKeyboard(buttons) : undefined;
  await ctx.reply(
    `📊 *المشرفون والمساجد*\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `🪪 *المشرفون الإقليميون (${moderators.length}):*\n${modList}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 *مساجد عبر مشرف إقليمي (${viaMod.length}):*\n${mosqueModList}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👑 *مساجد عبر المطوّر مباشرة (${viaDev.length}):*\n${mosqueDevList}`,
    { parse_mode: 'Markdown', ...(keyboard ? keyboard : {}) }
  );
}

async function kickModeratorPrompt(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const userId = ctx.match?.[1];
  const user = db.getUser(userId);
  if (!user || !isRegionalModerator(user)) {
    return ctx.reply('⚠️ هذا المستخدم ليس مشرفاً إقليمياً نشطاً.');
  }
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || userId;
  await ctx.reply(
    `⚠️ *تأكيد عزل المشرف*\n\n` +
    `👤 ${name}\n` +
    `🌍 ${getCountryName(user.moderatorCountry)}\n\n` +
    `هل أنت متأكد من إزالة صلاحيته؟\n` +
    `_(المساجد التي وافق عليها سابقاً تبقى مفعّلة)_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ نعم، اعزله', 'kick_moderator_confirm_' + userId)],
        [Markup.button.callback('❌ تراجع', 'kick_moderator_cancel')]
      ])
    }
  );
}

async function kickModeratorConfirm(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const userId = ctx.match?.[1];
  const result = db.revokeRegionalModerator(userId, ctx.from.id);
  if (!result.ok) {
    return ctx.reply('⚠️ تعذّر العزل — المستخدم ليس مشرفاً نشطاً.');
  }

  try {
    await ctx.telegram.sendMessage(
      userId,
      `🪪 *إشعار من إدارة المنصة*\n\n` +
      `تم إلغاء صلاحيتك كمشرف إقليمي في البوت.\n` +
      `إن كان ذلك بالخطأ، تواصل مع إدارة المنصة بأدب.`,
      { parse_mode: 'Markdown' }
    );
  } catch (_) {}

  await ctx.reply(`✅ تم عزل المشرف. عاد دوره إلى: *${result.restoredRole}*`, { parse_mode: 'Markdown' });
}

async function kickModeratorCancel(ctx) {
  await ctx.answerCbQuery('تم الإلغاء').catch(() => {});
  await ctx.reply('❌ تم التراجع — لم يُعزل المشرف.');
}

registry.registerMenu('🪪 دعوة مشرف إقليمي', async (ctx) => {
  if (!await ensureDeveloper(ctx)) return;
  await devModeratorInvite(ctx);
}, 'دعوة مشرف إقليمي');

registry.registerMenu('📊 المشرفون والمساجد', showTrackingPanel, 'تتبع المشرفين والمساجد');

registry.registerMenu('🪪 ترشيح مشرف جديد', async (ctx) => {
  if (!canActAsRegionalModerator(ctx.from.id)) {
    return ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
  }
  await moderatorNominationInvite(ctx);
}, 'ترشيح مشرف جديد');

registry.registerAction(/^mod_app_approve_(.+)$/, approveModeratorApp, 'قبول مشرف');
registry.registerAction(/^mod_app_reject_(.+)$/, rejectModeratorApp, 'رفض مشرف');
registry.registerAction(/^mod_app_details_(.+)$/, showModeratorAppDetails, 'تفاصيل طلب مشرف');
registry.registerAction(/^kick_moderator_(.+)$/, kickModeratorPrompt, 'طلب عزل مشرف');
registry.registerAction(/^kick_moderator_confirm_(.+)$/, kickModeratorConfirm, 'تأكيد عزل مشرف');
registry.registerAction('kick_moderator_cancel', kickModeratorCancel, 'إلغاء عزل مشرف');

module.exports = {
  devModeratorInvite,
  moderatorNominationInvite,
  showTrackingPanel,
  approveModeratorApp,
  rejectModeratorApp,
  showModeratorAppDetails,
  kickModeratorPrompt,
  kickModeratorConfirm,
  revokeRegionalModerator: (userId, by) => db.revokeRegionalModerator(userId, by)
};

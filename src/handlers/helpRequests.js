const db = require('../database');
const { ROLES } = require('../keyboards');
const { Markup } = require('telegraf');
const { loadDB } = require('../utils/db');
const { getNearbyMosquesByGPS, PROXIMITY_LEVELS } = require('../utils/geo');
const { resolveMosqueId } = require('./recitationVolunteers');
const registry = require('../core/actionRegistry');

const PAGE_SIZE = 5;
const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SHEIKH, ROLES.DEVELOPER];

function canManageHelpRequests(ctx) {
  return ADMIN_ROLES.includes(ctx.user?.role);
}

function getAdminMosqueId(ctx) {
  const raw = loadDB();
  return resolveMosqueId(String(ctx.from.id), raw) || ctx.user?.mosqueId || null;
}

function buildRequesterContactLink(request, dbRaw) {
  const requesterUser = dbRaw.users?.[String(request.requesterId)];
  const username = requesterUser?.username;
  if (username) {
    return `👤 تواصل معه على تيليغرام:\n[@${username}](https://t.me/${username})`;
  }
  return `💬 سيتواصل معك هنا في البوت — انتظر رسالته`;
}

function getPendingForMosque(mosqueId) {
  if (!mosqueId) return [];
  return db.allHelpRequests().filter(
    r => r.status === 'pending' && r.mosqueId === mosqueId
  );
}

async function handleHelpRequestsList(ctx, page = 1) {
  if (!canManageHelpRequests(ctx)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }
  const mosqueId = getAdminMosqueId(ctx);
  if (!mosqueId) {
    return ctx.reply('⚠️ لم يُعثر على مسجد مرتبط بحسابك.');
  }
  const requests = getPendingForMosque(mosqueId);
  const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = requests.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!requests.length) {
    return ctx.reply('🆘 *طلبات المساعدة*\n\nلا توجد طلبات معلقة لمسجدك حالياً. ✅', {
      parse_mode: 'Markdown'
    });
  }

  if (safePage > 1 || totalPages > 1) {
    await ctx.reply(
      `🆘 *طلبات المساعدة المعلقة* (${requests.length}) — صفحة ${safePage}/${totalPages}`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(`🆘 *طلبات المساعدة المعلقة* (${requests.length})`, { parse_mode: 'Markdown' });
  }

  for (const req of slice) {
    const text =
      `👤 *${req.name}*\n` +
      `📞 ${req.phone || 'غير محدد'}\n` +
      `💬 ${req.description}\n` +
      `⏰ ${new Date(req.at).toLocaleDateString('ar-EG')}`;
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ حللناها', callback_data: `help_resolve_${req.id}` },
            { text: '📢 نشر للمصلين', callback_data: `help_broadcast_start_${req.id}` }
          ]
        ]
      }
    });
  }

  if (totalPages > 1) {
    const nav = [];
    if (safePage > 1) nav.push({ text: '⬅️ السابق', callback_data: `help_req_page_${safePage - 1}` });
    if (safePage < totalPages) nav.push({ text: '➡️ التالي', callback_data: `help_req_page_${safePage + 1}` });
    if (nav.length) {
      await ctx.reply('تصفح الطلبات:', { reply_markup: { inline_keyboard: [nav] } });
    }
  }
}

async function handleHelpResolve(ctx, requestId) {
  if (!canManageHelpRequests(ctx)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', { show_alert: true });
  }
  await ctx.answerCbQuery();
  const req = db.updateHelpRequest(requestId, {
    status: 'resolved',
    resolvedInternally: true
  });
  if (!req) {
    return ctx.reply('❌ لم يُعثر على الطلب.');
  }
  if (req.userId) {
    try {
      await ctx.telegram.sendMessage(
        String(req.userId),
        '✅ تم حل طلبك بإذن الله',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
  await ctx.reply('✅ تم تسجيل حل الطلب داخلياً.');
}

async function handleHelpBroadcastStart(ctx, requestId) {
  if (!canManageHelpRequests(ctx)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', { show_alert: true });
  }
  await ctx.answerCbQuery();
  const req = db.allHelpRequests().find(r => r.id === requestId);
  if (!req || req.status !== 'pending') {
    return ctx.reply('❌ الطلب غير متاح للنشر.');
  }
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🕌 كل مصلي المسجد', `help_scope_mosque_${requestId}`)],
    [Markup.button.callback('🟢 قريب جداً (10كم)', `help_scope_very_close_${requestId}`)],
    [Markup.button.callback('🔵 قريب (30كم)', `help_scope_close_${requestId}`)],
    [Markup.button.callback('🟡 متوسط (60كم)', `help_scope_medium_${requestId}`)]
  ]);
  await ctx.reply('📢 *اختر نطاق النشر:*', { parse_mode: 'Markdown', ...keyboard });
}

async function handleHelpScope(ctx, scope, requestId) {
  if (!canManageHelpRequests(ctx)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', { show_alert: true });
  }
  await ctx.answerCbQuery();
  const req = db.updateHelpRequest(requestId, { broadcastScope: scope });
  if (!req) return ctx.reply('❌ لم يُعثر على الطلب.');

  const previewText = req.description || '';
  const scopeLabel = scope === 'mosque'
    ? '🕌 كل مصلي المسجد'
    : (PROXIMITY_LEVELS[scope]?.label || scope);

  await ctx.reply(
    `📋 *معاينة النشر*\n\n` +
    `النطاق: ${scopeLabel}\n\n` +
    `${previewText}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ تعديل النص', callback_data: `help_broadcast_edit_${requestId}` }],
          [{ text: '📤 نشر كما هو', callback_data: `help_broadcast_confirm_${requestId}` }]
        ]
      }
    }
  );
}

async function handleHelpBroadcastConfirm(ctx, requestId) {
  if (!canManageHelpRequests(ctx)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', { show_alert: true });
  }
  await ctx.answerCbQuery();
  const req = db.allHelpRequests().find(r => r.id === requestId);
  if (!req) return ctx.reply('❌ لم يُعثر على الطلب.');
  db.updateHelpRequest(requestId, {
    broadcastText: req.broadcastText || req.description
  });
  await broadcastHelpRequest(ctx, requestId);
}

function collectRecipientIds(scope, sourceMosqueId, dbRaw) {
  const allMosques = dbRaw.mosques || {};
  const sourceMosque = allMosques[sourceMosqueId];
  if (!sourceMosque) return [];

  let mosqueIds = new Set([sourceMosqueId]);

  if (scope !== 'mosque') {
    const maxKm = PROXIMITY_LEVELS[scope]?.km;
    if (maxKm && sourceMosque.lat && sourceMosque.lng) {
      const nearby = getNearbyMosquesByGPS(sourceMosque, allMosques);
      for (const entry of nearby) {
        if (entry.km <= maxKm) mosqueIds.add(entry.mosque.id);
      }
    } else if (maxKm && sourceMosque.city) {
      for (const m of Object.values(allMosques)) {
        if (m.id !== sourceMosqueId && m.city === sourceMosque.city) {
          mosqueIds.add(m.id);
        }
      }
    }
  }

  const recipients = new Set();
  for (const user of Object.values(dbRaw.users || {})) {
    if (user.role !== ROLES.WORSHIPPER) continue;
    if (user.mosqueId && mosqueIds.has(user.mosqueId)) {
      recipients.add(String(user.id));
    }
  }
  return [...recipients];
}

async function broadcastHelpRequest(ctx, requestId) {
  const telegram = ctx.telegram;
  const publisherId = String(ctx.from?.id || ctx.publisherId || '');
  const dbRaw = loadDB();
  const req = dbRaw.helpRequests?.find(r => r.id === requestId);
  if (!req) return;

  const mosqueId = req.mosqueId || getAdminMosqueId(ctx);
  const scope = req.broadcastScope || 'mosque';
  const text = req.broadcastText || req.description || '';
  const recipients = collectRecipientIds(scope, mosqueId, dbRaw);

  const broadcastMessageIds = [];
  for (const chatId of recipients) {
    try {
      const sent = await telegram.sendMessage(
        chatId,
        `🆘 *طلب مساعدة من المجتمع*\n\n${text}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🙋 سأتولى هذا', callback_data: `help_claim_${requestId}` }
            ]]
          }
        }
      );
      broadcastMessageIds.push({ chatId, messageId: sent.message_id });
    } catch (e) {}
  }

  db.updateHelpRequest(requestId, {
    status: 'broadcasting',
    broadcastText: text,
    broadcastMessageIds,
    publishedBy: publisherId
  });

  const count = broadcastMessageIds.length;
  if (ctx.reply) {
    await ctx.reply(`✅ تم النشر لـ ${count} مصلٍ.`);
  }
}

async function handleHelpClaim(ctx, requestId) {
  const claimerId = String(ctx.from.id);
  const firstName = ctx.from.first_name || 'أحد المصلين';

  const claimed = db.claimHelpRequest(requestId, claimerId);
  if (!claimed) {
    return ctx.answerCbQuery('سبقك أحدهم لهذا الطلب 🙏', { show_alert: true });
  }
  await ctx.answerCbQuery('✅ تم تسجيل تكفّلك بالطلب');

  const req = db.allHelpRequests().find(r => r.id === requestId);
  const dbRaw = loadDB();

  for (const entry of req.broadcastMessageIds || []) {
    try {
      await ctx.telegram.editMessageText(
        entry.chatId,
        entry.messageId,
        undefined,
        `✅ تم التكفل بهذا الطلب من قبل ${firstName}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }

  const contactBlock = buildRequesterContactLink(
    { requesterId: req.userId },
    dbRaw
  );
  let contactMsg =
    `🤝 *تكفّلت بهذا الطلب*\n\n` +
    `👤 الطالب: ${req.name}\n`;
  if (req.phone) contactMsg += `📞 ${req.phone}\n`;
  contactMsg += `\n${contactBlock}\n\n💬 ${req.description || ''}`;

  try {
    await ctx.telegram.sendMessage(claimerId, contactMsg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ تم المساعدة فعلاً', callback_data: `help_complete_${requestId}` }
        ]]
      }
    });
  } catch (e) {}

  if (req.publishedBy) {
    try {
      await ctx.telegram.sendMessage(
        req.publishedBy,
        `📢 *تحديث طلب مساعدة*\n\nتكفّل ${firstName} بطلب المساعدة المنشور.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
}

async function handleHelpComplete(ctx, requestId) {
  const req = db.allHelpRequests().find(r => r.id === requestId);
  if (!req || String(req.claimedBy) !== String(ctx.from.id)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', { show_alert: true });
  }
  await ctx.answerCbQuery();
  const firstName = ctx.from.first_name || 'المتطوع';
  db.completeHelpRequest(requestId);

  if (req.userId) {
    try {
      await ctx.telegram.sendMessage(
        String(req.userId),
        `تمّت مساعدتك بإذن الله 🤍، جزى الله ${firstName} كل خير`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
  await ctx.reply('✅ شكراً لك على المساعدة، جزاك الله خيراً.');
}

async function handleHelpBroadcastEdit(ctx, requestId) {
  if (!canManageHelpRequests(ctx)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', { show_alert: true });
  }
  await ctx.answerCbQuery();
  return ctx.scene.enter('help-broadcast-edit', { helpRequestId: requestId });
}

registry.registerAction(/^help_req_page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await handleHelpRequestsList(ctx, parseInt(ctx.match[1], 10));
}, 'صفحة طلبات المساعدة');

registry.registerAction(/^help_resolve_(.+)$/, async (ctx) => {
  await handleHelpResolve(ctx, ctx.match[1]);
}, 'حل طلب مساعدة داخلياً');

registry.registerAction(/^help_broadcast_start_(.+)$/, async (ctx) => {
  await handleHelpBroadcastStart(ctx, ctx.match[1]);
}, 'بدء نشر طلب مساعدة');

registry.registerAction(/^help_scope_(mosque|very_close|close|medium)_(.+)$/, async (ctx) => {
  await handleHelpScope(ctx, ctx.match[1], ctx.match[2]);
}, 'نطاق نشر طلب مساعدة');

registry.registerAction(/^help_broadcast_confirm_(.+)$/, async (ctx) => {
  await handleHelpBroadcastConfirm(ctx, ctx.match[1]);
}, 'تأكيد نشر طلب مساعدة');

registry.registerAction(/^help_broadcast_edit_(.+)$/, async (ctx) => {
  await handleHelpBroadcastEdit(ctx, ctx.match[1]);
}, 'تعديل نص نشر طلب مساعدة');

registry.registerAction(/^help_claim_(.+)$/, async (ctx) => {
  await handleHelpClaim(ctx, ctx.match[1]);
}, 'التكفل بطلب مساعدة');

registry.registerAction(/^help_complete_(.+)$/, async (ctx) => {
  await handleHelpComplete(ctx, ctx.match[1]);
}, 'إتمام مساعدة طلب');

module.exports = {
  handleHelpRequestsList,
  broadcastHelpRequest,
  handleHelpResolve,
  handleHelpClaim,
  handleHelpComplete
};

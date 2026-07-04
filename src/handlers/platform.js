const db = require('../database');
const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');

const MESSAGE_TYPES = {
  suggestion: '💡 اقتراح ميزة',
  bug: '🐛 بلاغ خطأ',
  complaint: '📢 شكوى',
  question: '❓ سؤال'
};

function getUserMosque(userId) {
  const all = db.getAllMosques();
  return Object.values(all).find(m =>
    String(m.adminId) === String(userId) ||
    String(m.createdBy) === String(userId)
  ) || null;
}

function getDevelopers() {
  const settings = db.get('settings') || {};
  const envIds = (process.env.DEVELOPER_IDS || '')
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(Boolean);
  const dbIds = settings.developerIds || [];
  const allIds = [...new Set([...envIds, ...dbIds])];
  return allIds.map(id => ({ id: String(id) }));
}

async function showPlatformMenu(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ غير مصرح. هذه الخاصية لمدراء المساجد فقط.');
  const messages = db.get('platform_messages') || {};
  const myMessages = Object.values(messages).filter(m => m.mosqueId === mosque.id);
  const pending = myMessages.filter(m => m.status === 'pending').length;
  const replied = myMessages.filter(m => m.status === 'replied').length;
  const text =
    `📡 *التواصل مع المنصة*\n\n` +
    `🕌 ${mosque.name}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📤 رسائلك: ${myMessages.length} | ⏳ بانتظار رد: ${pending} | ✅ تم الرد: ${replied}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `اختر نوع رسالتك:`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💡 اقتراح ميزة', 'pm_type_suggestion'), Markup.button.callback('🐛 بلاغ خطأ', 'pm_type_bug')],
    [Markup.button.callback('📢 شكوى', 'pm_type_complaint'), Markup.button.callback('❓ سؤال', 'pm_type_question')],
    [Markup.button.callback('📋 رسائلي السابقة', 'pm_my_messages')],
    [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')]
  ]);
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

async function handlePlatformType(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const type = ctx.callbackQuery.data.replace('pm_type_', '');
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ غير مصرح.');
  ctx.session.pm_type = type;
  ctx.session.pm_mosqueId = mosque.id;
  ctx.session.waitingPlatformMsg = true;
  await ctx.reply(
    `${MESSAGE_TYPES[type]}\n\n✏️ اكتب رسالتك بالتفصيل:\n_(سيتم إرسالها لفريق المنصة مباشرة)_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'ma_platform')]])
    }
  );
}

async function handlePlatformMsgInput(ctx) {
  if (!ctx.session?.waitingPlatformMsg) return false;
  const userId = String(ctx.from.id);
  const text = ctx.message.text.trim();
  if (text.length < 10) {
    await ctx.reply('⚠️ الرسالة قصيرة جداً. اكتب تفاصيل أكثر:');
    return true;
  }
  const mosque = getUserMosque(userId);
  const type = ctx.session.pm_type;
  const msgId = `pm_${Date.now()}`;
  const messages = db.get('platform_messages') || {};
  messages[msgId] = {
    id: msgId,
    mosqueId: mosque?.id || 'unknown',
    mosqueName: mosque?.name || 'غير معروف',
    type,
    text,
    sentBy: userId,
    senderName: ctx.from.first_name || 'مجهول',
    status: 'pending',
    createdAt: new Date().toISOString(),
    reply: ''
  };
  db.set('platform_messages', messages);
  ctx.session.waitingPlatformMsg = false;
  ctx.session.pm_type = null;
  ctx.session.pm_mosqueId = null;
  await ctx.reply(
    `✅ *تم إرسال رسالتك للمنصة*\n\n` +
    `${MESSAGE_TYPES[type]}\n` +
    `📝 ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}\n\n` +
    `سنرد عليك قريباً إن شاء الله.`,
    { parse_mode: 'Markdown' }
  );
  const devs = getDevelopers();
  const msg = messages[msgId];
  for (const dev of devs) {
    await ctx.telegram.sendMessage(dev.id,
      `📡 رسالة جديدة من مسجد\n\n` +
      `🕌 ${msg.mosqueName}\n` +
      `${MESSAGE_TYPES[type]}\n` +
      `📝 ${text}\n` +
      `👤 ${ctx.from.first_name || 'مجهول'}\n` +
      `🆔 ${msgId}`,
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💬 رد على الرسالة', `pm_reply_${msgId}`)]
        ])
      }
    ).catch(err => console.log('❌ فشل الإرسال:', err.message));
  }
  return true;
}

async function showMyMessages(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ غير مصرح.');
  const messages = db.get('platform_messages') || {};
  const mine = Object.values(messages)
    .filter(m => m.mosqueId === mosque.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
  if (mine.length === 0) {
    return ctx.editMessageText('📋 لا توجد رسائل سابقة.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_platform')]])
    });
  }
  let text = `📋 رسائلي السابقة\n\n`;
  mine.forEach((m, i) => {
    const status = m.status === 'replied' ? '✅ تم الرد' : '⏳ بانتظار رد';
    text += `${i + 1}. ${MESSAGE_TYPES[m.type]} — ${status}\n`;
    text += `📝 ${m.text.slice(0, 60)}${m.text.length > 60 ? '...' : ''}\n`;
    if (m.reply) text += `💬 الرد: ${m.reply.slice(0, 80)}\n`;
    text += `📅 ${new Date(m.createdAt).toLocaleDateString('ar')}\n\n`;
  });
  await ctx.editMessageText(text, {
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_platform')]])
  });}

async function handleDevReply(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const msgId = ctx.callbackQuery.data.replace('pm_reply_', '');
  ctx.session.waitingDevReply = msgId;
  await ctx.reply(
    `💬 اكتب ردك على الرسالة ${msgId}:`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'cancel_dev_reply')]])
  );
}

async function handleDevReplyInput(ctx) {
  if (!ctx.session?.waitingDevReply) return false;
  const msgId = ctx.session.waitingDevReply;
  const replyText = ctx.message.text.trim();
  const messages = db.get('platform_messages') || {};
  if (!messages[msgId]) {
    ctx.session.waitingDevReply = null;
    return true;
  }
  messages[msgId].reply = replyText;
  messages[msgId].status = 'replied';
  messages[msgId].repliedAt = new Date().toISOString();
  db.set('platform_messages', messages);
  ctx.session.waitingDevReply = null;
  await ctx.reply('✅ تم إرسال الرد.');
  const msg = messages[msgId];
  await ctx.telegram.sendMessage(msg.sentBy,
    `📡 *رد من المنصة*\n\n` +
    `${MESSAGE_TYPES[msg.type]}\n` +
    `📝 رسالتك: ${msg.text.slice(0, 80)}\n\n` +
    `💬 الرد: ${replyText}`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
  return true;
}

registry.register('ma_platform', showPlatformMenu);
registry.register('pm_my_messages', showMyMessages);
registry.registerPrefix('pm_type_', handlePlatformType);
registry.registerPrefix('pm_reply_', handleDevReply);
registry.register('cancel_dev_reply', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.waitingDevReply = null;
  await ctx.reply('❌ تم الإلغاء.');
});

module.exports = {
  showPlatformMenu,
  handlePlatformMsgInput,
  handleDevReplyInput
};

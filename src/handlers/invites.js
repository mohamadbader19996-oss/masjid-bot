const { Markup } = require('telegraf');
const db = require('../database');
const registry = require('../core/actionRegistry');
const {
  sendWorshipperMosqueQr,
  sendDawahFriendInvite,
  sendFriendToMosqueInvite,
  sendMosqueRegisterInvite,
  sendGeneralBotInvite,
  resolveManagedMosque
} = require('../services/inviteService');

const WORSHIPPER_PAGE_SIZE = 5;

// ── قائمة دعوة المصلي (القائمة الرئيسية — 4 أزرار) ──

async function worshipperInviteMenu(ctx) {
  await ctx.reply(
    '📨 *قائمة الدعوة*\n━━━━━━━━━━━━━━━━━━\nاختر نوع الدعوة:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🕊️ دعوة صديق غير مسلم', 'invite_dawah_friend')],
        [Markup.button.callback('🤝 دعوة أخ إلى مسجدك', 'invite_friend_mosque')],
        [Markup.button.callback('🕌 دعوة مسجد', 'invite_register_mosque')],
        [Markup.button.callback('📲 دعوة عامة للبوت', 'invite_general_bot')]
      ])
    }
  );
}

// ── قائمة دعوة المدير/الشيخ (زرّان) ──

async function staffInviteMenu(ctx, backCb = 'mosque_admin_panel') {
  const mosque = resolveManagedMosque(ctx.from.id);
  if (!mosque) {
    return ctx.reply('⚠️ ليس لديك صلاحية دعوة من مسجد.');
  }
  await ctx.reply(
    `📨 *دعوة — ${mosque.name}*\n━━━━━━━━━━━━━━━━━━\nاختر نوع الدعوة:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📷 باركود المسجد (للمصلين)', 'staff_invite_worshipper_qr')],
        [Markup.button.callback('🕌 دعوة مسجد آخر', 'staff_invite_register_mosque')],
        [Markup.button.callback('🔙 رجوع', backCb)]
      ])
    }
  );
}

// ── قائمة المصلّين + طرد ──

async function showMosqueWorshippers(ctx, page = 0, backCb = 'mosque_admin_panel') {
  const mosque = resolveManagedMosque(ctx.from.id);
  if (!mosque) return ctx.reply('⚠️ ليس لديك صلاحية عرض المصلّين.');

  const ids = db.getMosqueWorshippers(mosque.id);
  const total = ids.length;
  const start = page * WORSHIPPER_PAGE_SIZE;
  const slice = ids.slice(start, start + WORSHIPPER_PAGE_SIZE);

  let list = '';
  const buttons = [];
  for (const uid of slice) {
    const user = db.getUser(uid);
    const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || `ID: ${uid}`;
    const ageStr = user?.age ? ` — 🎂 ${user.age}` : '';
    list += `• ${name}${ageStr}\n`;
    buttons.push([
      Markup.button.callback(`🚫 طرد — ${name.slice(0, 20)}`, 'kick_worshipper_' + uid)
    ]);
  }
  if (!list) list = '_لا يوجد مصلّون مسجلون بعد_';

  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅️ السابق', 'ma_worshippers_' + (page - 1)));
  if (start + WORSHIPPER_PAGE_SIZE < total) {
    nav.push(Markup.button.callback('➡️ التالي', 'ma_worshippers_' + (page + 1)));
  }
  if (nav.length) buttons.push(nav);
  buttons.push([Markup.button.callback('🔙 رجوع', backCb)]);

  await ctx.reply(
    `👥 *مصلّو ${mosque.name}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${list}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `العدد: ${total}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function kickWorshipper(ctx) {
  const userId = ctx.match?.[1];
  if (!userId) return;
  const mosque = resolveManagedMosque(ctx.from.id);
  if (!mosque) return ctx.answerCbQuery('⛔ لا صلاحية', { show_alert: true });

  const worshippers = db.getMosqueWorshippers(mosque.id);
  if (!worshippers.includes(String(userId))) {
    return ctx.answerCbQuery('⚠️ هذا المستخدم ليس مصلّياً في مسجدك', { show_alert: true });
  }

  db.kickWorshipperFromMosque(mosque.id, userId);
  await ctx.answerCbQuery('✅ تم الطرد');

  try {
    await ctx.telegram.sendMessage(
      userId,
      `🕌 *إشعار من ${mosque.name}*\n\n` +
      `تم إلغاء ارتباطك بهذا المسجد في البوت.\n` +
      `إن كان ذلك بالخطأ، تواصل مع إدارة المسجد بأدب.`,
      { parse_mode: 'Markdown' }
    );
  } catch (_) {}

  return showMosqueWorshippers(ctx, 0);
}

// ── تسجيل الأزرار ──

registry.registerMenu('📨 دعوة', worshipperInviteMenu, 'قائمة دعوة المصلي');

registry.registerAction('invite_dawah_friend', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await sendDawahFriendInvite(ctx);
}, 'دعوة صديق غير مسلم');

registry.registerAction('invite_friend_mosque', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await sendFriendToMosqueInvite(ctx);
}, 'دعوة أخ إلى مسجدك');

registry.registerAction('invite_register_mosque', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await sendMosqueRegisterInvite(ctx);
}, 'دعوة تسجيل مسجد');

registry.registerAction('invite_general_bot', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await sendGeneralBotInvite(ctx);
}, 'دعوة عامة للبوت');

registry.registerAction('ma_staff_invite', (ctx) => staffInviteMenu(ctx, 'mosque_admin_panel'), 'دعوة المدير/الشيخ');
registry.registerAction('sheikh_staff_invite', (ctx) => staffInviteMenu(ctx, 'sheikh_back'), 'دعوة الشيخ');
registry.registerAction('sheikh_worshippers', (ctx) => showMosqueWorshippers(ctx, 0, 'sheikh_back'), 'مصلّو المسجد للشيخ');
registry.registerAction('staff_invite_worshipper_qr', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const mosque = resolveManagedMosque(ctx.from.id);
  if (!mosque) return ctx.reply('⚠️ ليس لديك صلاحية.');
  await sendWorshipperMosqueQr(ctx, mosque);
}, 'باركود المسجد للمدير');

registry.registerAction('staff_invite_register_mosque', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await sendMosqueRegisterInvite(ctx);
}, 'دعوة مسجد آخر للمدير');

registry.registerAction('ma_worshippers', (ctx) => showMosqueWorshippers(ctx, 0), 'قائمة المصلّين');
registry.registerAction(/^ma_worshippers_(\d+)$/, (ctx) => {
  const page = parseInt(ctx.match[1], 10) || 0;
  return showMosqueWorshippers(ctx, page);
}, 'صفحات المصلّين');

registry.registerAction(/^kick_worshipper_(.+)$/, kickWorshipper, 'طرد مصلّي');

module.exports = {
  worshipperInviteMenu,
  staffInviteMenu,
  showMosqueWorshippers,
  sendWorshipperMosqueQr
};

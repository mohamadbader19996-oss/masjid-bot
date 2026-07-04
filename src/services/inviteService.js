const db = require('../database');

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=';
const MOSQUE_REGISTER_PARAM = 'register_mosque';

function buildTelegramLink(botUsername, startParam) {
  if (!startParam) return `https://t.me/${botUsername}`;
  return `https://t.me/${botUsername}?start=${startParam}`;
}

function buildQrUrl(link) {
  return QR_API + encodeURIComponent(link);
}

function getBotUsername(ctx) {
  return ctx.botInfo?.username || process.env.BOT_USERNAME || 'bot';
}

async function sendQrInvite(ctx, { title, extraLines = '', link, footer = '' }) {
  const qrLink = buildQrUrl(link);
  const extra = extraLines ? `${extraLines}\n` : '';
  const foot = footer ? `\n\n${footer}` : '';
  await ctx.replyWithPhoto(
    { url: qrLink },
    {
      caption:
        `✅ *${title}*\n` +
        extra +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📲 \`${link}\`${foot}`,
      parse_mode: 'Markdown'
    }
  );
}

function createDawahInviteCode() {
  return `invite_dawah_${Date.now()}`;
}

async function sendWorshipperMosqueQr(ctx, mosque) {
  const code = db.getOrCreateWorshipperInviteCode(mosque.id);
  const link = buildTelegramLink(getBotUsername(ctx), code);
  await sendQrInvite(ctx, {
    title: 'باركود المسجد (للمصلين)',
    extraLines: `🕌 ${mosque.name}`,
    link,
    footer: '♾️ صالح لعدد غير محدود من الانضمامات'
  });
  return { code, link };
}

async function sendDawahFriendInvite(ctx) {
  const code = createDawahInviteCode();
  db.saveInviteCode(code, {
    type: 'dawah',
    createdBy: String(ctx.from.id),
    createdAt: new Date().toISOString(),
    permanent: true
  });
  const link = buildTelegramLink(getBotUsername(ctx), code);
  await sendQrInvite(ctx, {
    title: 'دعوة صديق غير مسلم',
    extraLines: '🕊️ يفتح القسم الدعوي مباشرة',
    link
  });
  return { code, link };
}

async function sendFriendToMosqueInvite(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!user?.mosqueId) {
    await ctx.reply(
      '⚠️ *أنت غير منتمٍ لمسجد حالياً*\n\n' +
      'انضم لمسجدك أولاً عبر باركود المسجد، ثم يمكنك دعوة إخوانك إليه.',
      { parse_mode: 'Markdown' }
    );
    return null;
  }
  const mosque = db.getMosque(user.mosqueId);
  if (!mosque) {
    await ctx.reply('⚠️ لم يُعثر على بيانات مسجدك.');
    return null;
  }
  return sendWorshipperMosqueQr(ctx, mosque);
}

async function sendMosqueRegisterInvite(ctx) {
  const link = buildTelegramLink(getBotUsername(ctx), MOSQUE_REGISTER_PARAM);
  await sendQrInvite(ctx, {
    title: 'دعوة تسجيل مسجد جديد',
    extraLines: '🕌 يفتح مسار تسجيل المسجد مباشرة',
    link
  });
  return { code: MOSQUE_REGISTER_PARAM, link };
}

async function sendGeneralBotInvite(ctx) {
  const link = buildTelegramLink(getBotUsername(ctx));
  await sendQrInvite(ctx, {
    title: 'دعوة عامة للبوت',
    extraLines: '📲 رابط البوت الرئيسي',
    link
  });
  return { link };
}

function resolveManagedMosque(userId) {
  const uid = String(userId);
  const all = db.getAllMosques();
  const asAdmin = Object.values(all).find(m =>
    String(m.adminId) === uid || String(m.createdBy) === uid
  );
  if (asAdmin) return asAdmin;

  const user = db.getUser(uid);
  if (!user?.mosqueId) return null;
  const mosque = db.getMosque(user.mosqueId);
  if (!mosque) return null;

  const staffRoles = new Set([
    'religious', 'finance', 'logistics', 'state',
    'khatib', 'muadhin', 'quran_teacher', 'hifz_teacher', 'general'
  ]);
  const mosqueRole = db.getUserMosqueRole(user.mosqueId, uid);
  if (mosqueRole && staffRoles.has(mosqueRole.role)) return mosque;
  if (['admin', 'sheikh'].includes(user.role)) return mosque;
  return null;
}

function completeWorshipperJoin(userId, pending) {
  const invite = db.getInviteCode(pending.inviteCode);
  if (!invite || invite.role !== 'worshipper') return { ok: false, error: 'invalid_invite' };
  if (invite.used && !invite.permanent) return { ok: false, error: 'used_invite' };

  const mosque = db.getMosque(pending.mosqueId);
  if (!mosque) return { ok: false, error: 'mosque_not_found' };

  const uid = String(userId);
  const userPatch = {
    role: 'worshipper',
    mosqueId: pending.mosqueId,
    firstName: pending.firstName || '',
    lastName: pending.lastName || ''
  };
  if (pending.age != null && pending.age !== '') userPatch.age = pending.age;
  if (pending.contactInfo != null && pending.contactInfo !== '') {
    userPatch.contactInfo = pending.contactInfo;
  }

  db.setMosqueRole(pending.mosqueId, uid, 'worshipper');
  db.saveUser(uid, userPatch);
  if (!invite.permanent) db.markInviteUsed(pending.inviteCode);

  return { ok: true, mosque };
}

module.exports = {
  MOSQUE_REGISTER_PARAM,
  buildTelegramLink,
  buildQrUrl,
  sendQrInvite,
  sendWorshipperMosqueQr,
  sendDawahFriendInvite,
  sendFriendToMosqueInvite,
  sendMosqueRegisterInvite,
  sendGeneralBotInvite,
  resolveManagedMosque,
  completeWorshipperJoin,
  createDawahInviteCode
};

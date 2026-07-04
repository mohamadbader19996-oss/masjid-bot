const db = require('../database');
const { getCountryName, countryCodesMatch } = require('../data/muslimCountries');
const { buildTelegramLink, buildQrUrl, sendQrInvite } = require('./inviteService');

const MODERATOR_DEV_INVITE_CODE = 'invite_moderator_dev';

function getOrCreateModeratorDevInviteCode() {
  return db.getOrCreateModeratorDevInviteCode();
}

function buildModeratorNominationCode(nominatorId) {
  return `invite_mod_nominate_${nominatorId}`;
}

function getDeveloperNotifyIds() {
  const ids = new Set();
  (process.env.DEVELOPER_IDS || '').split(',').forEach(s => {
    const t = s.trim();
    if (t) ids.add(t);
  });
  db.allUsers().forEach(u => {
    if (u.role === 'developer' || u.role === 'DEVELOPER') ids.add(String(u.id));
  });
  return [...ids];
}

function isRegionalModerator(user) {
  return user && (user.role === 'moderator' || user.role === 'MODERATOR');
}

/** صلاحية استخدام أدوات المشرف الإقليمي (ترشيح، إلخ) — مشرف أو مطوّر فقط */
function canActAsRegionalModerator(userOrId) {
  if (userOrId == null) return false;
  const userId = typeof userOrId === 'object'
    ? String(userOrId.id ?? userOrId)
    : String(userOrId);
  if (db.isDeveloper(userId)) return true;
  const user = typeof userOrId === 'object' && userOrId.role !== undefined
    ? userOrId
    : db.getUser(userId);
  return isRegionalModerator(user);
}

function getRegionalModeratorsByCountry(countryCode) {
  if (!countryCode) return [];
  return db.allUsers().filter(u =>
    isRegionalModerator(u) && countryCodesMatch(u.moderatorCountry, countryCode)
  );
}

function buildMosqueRequestNotifText(request) {
  const countryLabel = request.country || getCountryName(request.countryCode);
  return (
    `🕌 *طلب تسجيل مسجد جديد*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📛 الاسم: ${request.name}\n` +
    `📍 العنوان: ${request.location}\n` +
    `🏙️ المدينة: ${request.city}\n` +
    `🌍 الدولة: ${countryLabel}\n` +
    `👤 المدير: ${request.requestedByName || request.requestedBy}\n` +
    `🆔 ID: ${request.requestedBy}`
  );
}

function getMosqueApproveButtons(requestId) {
  return {
    inline_keyboard: [[
      { text: '✅ قبول وتفعيل', callback_data: `approve_mosque_${requestId}` },
      { text: '❌ رفض', callback_data: `reject_mosque_${requestId}` }
    ]]
  };
}

function getRegionalModeratorIds(countryCode) {
  if (!countryCode) return [];
  const { loadDB } = require('../utils/db');
  const raw = loadDB();
  return Object.entries(raw.users || {})
    .filter(([, u]) => isRegionalModerator(u) && countryCodesMatch(u.moderatorCountry, countryCode))
    .map(([uid]) => String(uid));
}

async function notifyMosqueRequestApprovers(telegram, request) {
  const countryCode = request.countryCode;
  const regionalIds = getRegionalModeratorIds(countryCode);
  const notifyIds = regionalIds.length > 0
    ? regionalIds
    : getDeveloperNotifyIds();

  const notifText = buildMosqueRequestNotifText(request);
  const approveButtons = getMosqueApproveButtons(request.id);

  for (const adminId of notifyIds) {
    try {
      if (request.licenseFileId) {
        await telegram.sendPhoto(adminId, request.licenseFileId, {
          caption: `📄 ترخيص جمعية: ${request.name}`
        });
      }
      if (request.idFileId) {
        await telegram.sendPhoto(adminId, request.idFileId, {
          caption: notifText,
          parse_mode: 'Markdown',
          reply_markup: approveButtons
        });
      } else {
        await telegram.sendMessage(adminId, notifText, {
          parse_mode: 'Markdown',
          reply_markup: approveButtons
        });
      }
    } catch (_) {}
  }

  return {
    notifyIds,
    routedToRegional: regionalIds.length > 0,
    regionalCount: regionalIds.length
  };
}

function buildModeratorAppNotifText(app, { nominatedBadge = '' } = {}) {
  const countryLabel = app.country || getCountryName(app.countryCode);
  return (
    `${nominatedBadge}` +
    `🪪 *طلب مشرف إقليمي جديد*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 الاسم: ${app.fullName}\n` +
    `📱 الهاتف: ${app.phone}\n` +
    `🌍 البلد: ${countryLabel}\n` +
    `🆔 المستخدم: ${app.userId}\n` +
    `📅 ${new Date(app.createdAt).toLocaleDateString('ar')}`
  );
}

function getModeratorAppButtons(appId, quick = false) {
  if (quick) {
    return {
      inline_keyboard: [
        [{ text: '✅ قبول سريع', callback_data: `mod_app_approve_${appId}` }],
        [{ text: '📋 التفاصيل الكاملة', callback_data: `mod_app_details_${appId}` }]
      ]
    };
  }
  return {
    inline_keyboard: [[
      { text: '✅ قبول', callback_data: `mod_app_approve_${appId}` },
      { text: '❌ رفض', callback_data: `mod_app_reject_${appId}` }
    ]]
  };
}

async function notifyDeveloperModeratorApplication(telegram, app) {
  const nominator = app.nominatedBy ? db.getUser(app.nominatedBy) : null;
  const nominatorName = nominator
    ? `${nominator.firstName || ''} ${nominator.lastName || ''}`.trim() || app.nominatedBy
    : null;
  const nominatedBadge = nominatorName ? `🪪 رشّحه المشرف: *${nominatorName}*\n\n` : '';
  const text = buildModeratorAppNotifText(app, { nominatedBadge });
  const quick = Boolean(app.nominatedBy);
  const buttons = getModeratorAppButtons(app.id, quick);
  const devIds = getDeveloperNotifyIds();

  for (const devId of devIds) {
    try {
      await telegram.sendPhoto(devId, app.idFileId, {
        caption: text,
        parse_mode: 'Markdown',
        reply_markup: buttons
      });
    } catch (_) {
      try {
        await telegram.sendMessage(devId, text, {
          parse_mode: 'Markdown',
          reply_markup: buttons
        });
      } catch (_e) {}
    }
  }
  return devIds;
}

async function sendModeratorDevInviteQr(ctx) {
  const code = db.getOrCreateModeratorDevInviteCode();
  const link = buildTelegramLink(ctx.botInfo?.username || 'bot', code);
  await sendQrInvite(ctx, {
    title: 'دعوة مشرف إقليمي',
    extraLines: '🪪 للمطوّر فقط — رابط دائم',
    link,
    footer: '♾️ صالح لعدد غير محدود من التقديمات'
  });
  return { code, link };
}

async function sendModeratorNominationQr(ctx) {
  const code = buildModeratorNominationCode(ctx.from.id);
  const link = buildTelegramLink(ctx.botInfo?.username || 'bot', code);
  await sendQrInvite(ctx, {
    title: 'ترشيح مشرف إقليمي جديد',
    extraLines: '🪪 يصل الطلب للمطوّر للموافقة النهائية',
    link
  });
  return { code, link };
}

function parseModeratorInviteStart(startParam) {
  if (startParam === MODERATOR_DEV_INVITE_CODE) {
    return { type: 'dev' };
  }
  if (startParam && startParam.startsWith('invite_mod_nominate_')) {
    return { type: 'nomination', nominatedBy: startParam.replace('invite_mod_nominate_', '') };
  }
  return null;
}

module.exports = {
  MODERATOR_DEV_INVITE_CODE,
  getOrCreateModeratorDevInviteCode,
  buildModeratorNominationCode,
  getDeveloperNotifyIds,
  getRegionalModeratorsByCountry,
  isRegionalModerator,
  canActAsRegionalModerator,
  notifyMosqueRequestApprovers,
  notifyDeveloperModeratorApplication,
  sendModeratorDevInviteQr,
  sendModeratorNominationQr,
  parseModeratorInviteStart,
  buildMosqueRequestNotifText,
  buildModeratorAppNotifText,
  getModeratorAppButtons
};

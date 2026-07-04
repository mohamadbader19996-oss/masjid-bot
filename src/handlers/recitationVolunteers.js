// تطوع التسميع والتصحيح — نفس آلية الموافقة المزدوجة للتطوع الدعوي
const { loadDB, saveDB } = require('../utils/db');
const dbMain = require('../database');

const QURAN_TEACHER_ROLES = ['quran_teacher', 'hifz_teacher'];

function getVolunteerName(user, ctx) {
  return user?.firstName || user?.name || ctx?.from?.first_name || 'متطوع';
}

function resolveMosqueId(userId, db) {
  const uid = String(userId);
  if (db.mosque_roles) {
    for (const [mId, roles] of Object.entries(db.mosque_roles)) {
      if (roles[uid]) return mId;
    }
  }
  const user = db.users?.[uid] || dbMain.getUser(uid);
  if (user?.mosqueId && db.mosques?.[user.mosqueId]) return user.mosqueId;
  return null;
}

function getMosqueAdminIds(mosqueId, db) {
  const ids = new Set();
  const mosque = db.mosques?.[mosqueId];
  if (mosque?.adminId) ids.add(String(mosque.adminId));
  if (mosque?.createdBy) ids.add(String(mosque.createdBy));

  const roles = db.mosque_roles?.[mosqueId] || {};
  for (const [memberId, roleEntry] of Object.entries(roles)) {
    const role = typeof roleEntry === 'string' ? roleEntry : roleEntry?.role;
    if (role === 'admin' || role === 'ADMIN') ids.add(String(memberId));
  }

  for (const [memberId, user] of Object.entries(db.users || {})) {
    if (String(user?.mosqueId) === String(mosqueId) &&
        (user.role === 'admin' || user.role === 'ADMIN')) {
      ids.add(String(memberId));
    }
  }
  return [...ids];
}

function getDeveloperNotifyIds(db) {
  const ids = new Set();
  (process.env.DEVELOPER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((id) => ids.add(String(id)));
  (db.settings?.developerIds || []).forEach((id) => ids.add(String(id)));

  for (const [memberId, user] of Object.entries(db.users || {})) {
    if (!user) continue;
    const role = user.role;
    if (role === 'developer' || role === 'DEVELOPER' ||
        role === 'moderator' || role === 'MODERATOR' ||
        dbMain.isDeveloper(memberId)) {
      ids.add(String(memberId));
    }
  }

  const moderators = dbMain.getModerators?.() || [];
  moderators.forEach((m) => {
    if (m?.userId) ids.add(String(m.userId));
  });

  return [...ids];
}

function buildRecVolNotifyText(vol, mosqueName, note) {
  return (
    `🎙️ *طلب تطوع للتسميع والتصحيح${note ? ` — ${note}` : ''}*\n\n` +
    `👤 الاسم: *${vol.name}*\n` +
    `🆔 المعرف: \`${vol.userId}\`\n` +
    (vol.mosqueId ? `🕌 المسجد: ${mosqueName || vol.mosqueId}\n` : '🕌 _متطوع مستقل_\n') +
    `📞 التواصل: ${vol.contact?.type === 'whatsapp' ? `واتساب (${vol.contact.value})` : 'عبر البوت'}`
  );
}

function buildRecVolApproveButtons(volunteerId) {
  return {
    inline_keyboard: [[
      { text: '✅ قبول', callback_data: `rec_ma_vol_approve_${volunteerId}` },
      { text: '❌ رفض', callback_data: `rec_ma_vol_reject_${volunteerId}` }
    ]]
  };
}

function buildRecVolDevApproveButtons(volunteerId) {
  return {
    inline_keyboard: [[
      { text: '✅ قبول', callback_data: `rec_dev_vol_approve_${volunteerId}` },
      { text: '❌ رفض', callback_data: `rec_dev_vol_reject_${volunteerId}` }
    ]]
  };
}

function activateRecitationUser(userId, contact, vol) {
  const fields = {
    availableForRecitation: true,
    recitationServiceEnabled: true,
    recitationContactMethod: contact?.type === 'whatsapp' ? 'whatsapp' : 'bot',
    recitationWhatsapp: contact?.type === 'whatsapp' ? (contact.value || null) : null
  };
  if (vol?.isRecitationSheikh) {
    fields.isRecitationSheikh = true;
  }
  dbMain.saveUser(userId, fields);
  return fields;
}

async function notifyMosqueAdmins(ctx, mosqueId, volunteerId, vol, logFn) {
  const db = loadDB();
  const mosque = db.mosques?.[mosqueId];
  const adminIds = getMosqueAdminIds(mosqueId, db);
  const text = buildRecVolNotifyText(vol, mosque?.name, null);
  const replyMarkup = buildRecVolApproveButtons(volunteerId);

  if (!adminIds.length) {
    const msg = `[rec_vol_notify] no mosque admin found for ${mosqueId}, fallback to developers`;
    if (logFn) logFn(msg);
    console.warn(msg);
    return notifyDevelopersRecVolunteer(ctx, volunteerId, vol, 'لا يوجد مدير مسجد — يحتاج موافقتك', logFn);
  }

  for (const adminId of adminIds) {
    try {
      await ctx.telegram.sendMessage(adminId, text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
      const sent = `[rec_vol_notify] mosque admin ${adminId} ← request ${volunteerId} [✅ قبول][❌ رفض]`;
      if (logFn) logFn(sent);
      console.log(sent);
    } catch (e) {
      console.error(`[rec_vol_notify] failed admin ${adminId}:`, e.message);
    }
  }
}

async function notifyDevelopersRecVolunteer(ctx, volunteerId, vol, note, logFn) {
  const db = loadDB();
  const notifyIds = getDeveloperNotifyIds(db);
  const text = buildRecVolNotifyText(vol, null, note || 'متطوع مستقل');
  const replyMarkup = buildRecVolDevApproveButtons(volunteerId);

  if (!notifyIds.length) {
    console.warn('[rec_vol_notify] no developer/moderator ids found');
    return;
  }

  for (const adminId of notifyIds) {
    try {
      await ctx.telegram.sendMessage(adminId, text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
      const sent = `[rec_vol_notify] developer ${adminId} ← request ${volunteerId} [✅ قبول][❌ رفض]`;
      if (logFn) logFn(sent);
      console.log(sent);
    } catch (e) {
      console.error(`[rec_vol_notify] failed developer ${adminId}:`, e.message);
    }
  }
}

async function showRecitationVolunteerRegistration(ctx) {
  const userId = ctx.from.id;
  const db = loadDB();
  const user = db.users?.[userId] || dbMain.getUser(userId);

  if (user?.recitationServiceEnabled) {
    const avail = user.availableForRecitation ? '✅ متاح الآن' : '❌ غير متاح';
    const method = user.recitationContactMethod === 'whatsapp'
      ? `واتساب (${user.recitationWhatsapp || '—'})`
      : 'عبر البوت';
    const msg =
      `🎙️ *أنت مسجل كمُسمِّع/مُصحِّح*\n\n` +
      `الحالة: ${avail}\n` +
      `التواصل: ${method}`;
    const extra = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: user.availableForRecitation ? '❌ غير متاح الآن' : '✅ متاح الآن', callback_data: 'rec_vol_toggle' }],
          [{ text: '🔙 رجوع', callback_data: 'noop' }]
        ]
      }
    };
    if (ctx.callbackQuery?.message) {
      return ctx.editMessageText(msg, extra).catch(() => ctx.reply(msg, extra));
    }
    return ctx.reply(msg, extra);
  }

  if (db.recitation_volunteers?.[userId] && db.recitation_volunteers[userId].status === 'pending') {
    return ctx.reply('⏳ طلبك قيد المراجعة.');
  }

  const intro =
    '🎙️ *التطوع للتسميع والتصحيح*\n\n' +
    'ساعد الحفّاظ بتصحيح تسميعهم عبر البوت أو واتساب.\n\n' +
    '_يُراجع طلبك: مدير مسجدك (إن كنت تابعاً لمسجد) أو إدارة المنصة (إن كنت مستقلاً)_';

  const extra = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ أريد التسجيل', callback_data: 'rec_vol_start_reg' }],
        [{ text: '🔙 رجوع', callback_data: 'noop' }]
      ]
    }
  };
  if (ctx.callbackQuery?.message) {
    return ctx.editMessageText(intro, extra).catch(() => ctx.reply(intro, extra));
  }
  return ctx.reply(intro, extra);
}

async function startRecitationVolunteerRegistration(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  if (!db.recitation_volunteer_reg) db.recitation_volunteer_reg = {};
  db.recitation_volunteer_reg[ctx.from.id] = { step: 'contact' };
  saveDB(db);
  return showRecitationVolunteerContactStep(ctx);
}

async function showRecitationVolunteerContactStep(ctx) {
  const text =
    '📱 *طريقة التواصل المفضّلة*\n\n' +
    '🔒 *عبر البوت* — تستقبل طلبات التسميع هنا\n' +
    '📱 *واتساب* — يتواصل معك الطالب مباشرة';
  const extra = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔒 عبر البوت', callback_data: 'rec_vol_contact_bot' }],
        [{ text: '📱 واتساب', callback_data: 'rec_vol_contact_whatsapp' }],
        [{ text: '🔙 رجوع', callback_data: 'rec_vol_menu' }]
      ]
    }
  };
  if (ctx.callbackQuery?.message) {
    return ctx.editMessageText(text, extra);
  }
  return ctx.reply(text, extra);
}

async function handleRecitationVolunteerContactChoice(ctx, type) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.recitation_volunteer_reg) db.recitation_volunteer_reg = {};
  if (!db.recitation_volunteer_reg[userId]) db.recitation_volunteer_reg[userId] = {};
  db.recitation_volunteer_reg[userId].contactType = type;
  saveDB(db);

  if (type === 'bot_only') {
    db.recitation_volunteer_reg[userId].contactValue = null;
    saveDB(db);
    return handleRecitationVolunteerSubmit(ctx);
  }

  if (type === 'whatsapp') {
    db.recitation_volunteer_reg[userId].waitingForContact = true;
    saveDB(db);
    return ctx.editMessageText(
      '📱 *أرسل رقم واتسابك*\n\nمع رمز الدولة، مثال: `+491234567890`',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'rec_vol_menu' }]] }
      }
    );
  }
  return null;
}

async function handleRecitationVolunteerContactInput(ctx) {
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.recitation_volunteer_reg?.[userId];
  if (!reg?.waitingForContact) return false;

  const input = ctx.message?.text?.trim();
  if (!input) return false;

  if (reg.contactType === 'whatsapp') {
    const clean = input.replace(/[^0-9+]/g, '');
    const digits = clean.replace(/[^0-9]/g, '');
    if (digits.length < 8) {
      await ctx.reply('❌ الرقم قصير — أرسل الرقم مع رمز الدولة.');
      return true;
    }
    reg.contactValue = digits;
    reg.waitingForContact = false;
    saveDB(db);
    await ctx.reply(`✅ تم حفظ: +${digits}`);
    await handleRecitationVolunteerSubmit(ctx);
    return true;
  }
  return false;
}

async function handleRecitationVolunteerSubmit(ctx) {
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.recitation_volunteer_reg?.[userId];
  if (!reg?.contactType) return;

  const user = db.users?.[userId] || dbMain.getUser(userId);
  const mosqueId = resolveMosqueId(String(userId), db);
  const contact = {
    type: reg.contactType === 'whatsapp' ? 'whatsapp' : 'bot_only',
    value: reg.contactValue || null
  };

  if (!db.recitation_volunteers) db.recitation_volunteers = {};
  db.recitation_volunteers[userId] = {
    userId: String(userId),
    mosqueId,
    name: getVolunteerName(user, ctx),
    contact,
    status: 'pending',
    active: false,
    registeredAt: new Date().toISOString()
  };
  delete db.recitation_volunteer_reg[userId];
  saveDB(db);

  const vol = db.recitation_volunteers[userId];
  if (mosqueId) {
    await notifyMosqueAdmins(ctx, mosqueId, String(userId), vol);
  } else {
    await notifyDevelopersRecVolunteer(ctx, String(userId), vol, 'متطوع مستقل');
  }

  const success =
    mosqueId
      ? '✅ *تم إرسال طلبك*\n\nسيراجعه مدير مسجدك.'
      : '✅ *تم إرسال طلبك*\n\nسيراجعه المطوّr ويُخطرك بالقرار.';
  const extra = { parse_mode: 'Markdown' };
  try {
    await ctx.editMessageText(success, extra);
  } catch (e) {
    await ctx.reply(success, extra);
  }
}

async function handleRecVolMaApprove(ctx, volunteerId) {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const vol = db.recitation_volunteers?.[volunteerId];
  if (!vol || vol.status !== 'pending') {
    return ctx.reply('⚠️ الطلب غير موجود أو مُعالج مسبقاً.');
  }

  vol.status = 'approved';
  vol.active = true;
  vol.adminApproved = true;
  vol.adminApprovedAt = new Date().toISOString();
  vol.adminApprovedBy = String(ctx.from.id);
  saveDB(db);
  activateRecitationUser(volunteerId, vol.contact, vol);

  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '🎉 *تم قبول طلب تطوعك للتسميع والتصحيح!*\n\n' +
      'أنت الآن متاح للطلاب. يمكنك التحكم بتوفرك من «🎙️ تطوع للتسميع والتصحيح».',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  await ctx.editMessageText('✅ تم قبول المتطوع وتفعيل التسميع.').catch(() => {});
}

async function handleRecVolMaReject(ctx, volunteerId) {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const vol = db.recitation_volunteers?.[volunteerId];
  if (!vol || vol.status !== 'pending') {
    return ctx.reply('⚠️ الطلب غير موجود أو مُعالج مسبقاً.');
  }
  vol.status = 'rejected';
  vol.rejectedByAdmin = true;
  vol.rejectedAt = new Date().toISOString();
  saveDB(db);

  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '❌ *لم يتم قبول طلب التطوع للتسميع* من مدير المسجد.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.editMessageText('تم رفض الطلب وإخطار المتطوع.').catch(() => {});
}

async function handleRecVolDevApprove(ctx, volunteerId) {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const vol = db.recitation_volunteers?.[volunteerId];
  if (!vol || vol.status !== 'pending') {
    return ctx.reply('⚠️ الطلب غير موجود أو مُعالج مسبقاً.');
  }

  vol.status = 'approved';
  vol.active = true;
  vol.devApproved = true;
  vol.devApprovedAt = new Date().toISOString();
  saveDB(db);
  activateRecitationUser(volunteerId, vol.contact, vol);

  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '🎉 *تم قبول طلب تطوعك للتسميع والتصحيح!*\n\n' +
      'أنت الآن متاح للطلاب. يمكنك التحكم بتوفرك من قائمة التطوع.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  await ctx.editMessageText('✅ تم قبول المتطوع وتفعيل التسميع.').catch(() => {});
}

async function handleRecVolDevReject(ctx, volunteerId) {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const vol = db.recitation_volunteers?.[volunteerId];
  if (!vol || vol.status !== 'pending') {
    return ctx.reply('⚠️ الطلب غير موجود أو مُعالج مسبقاً.');
  }
  vol.status = 'rejected';
  vol.rejectedAt = new Date().toISOString();
  saveDB(db);

  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '❌ *لم تتم الموافقة على طلب التطوع للتسميع حالياً.*',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.editMessageText('تم رفض الطلب وإخطار المتطوع.').catch(() => {});
}

async function handleRecVolToggle(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const user = dbMain.getUser(ctx.from.id);
  if (!user?.recitationServiceEnabled) {
    return ctx.answerCbQuery('⚠️ لم يُفعَّل حسابك بعد.', { show_alert: true });
  }
  const next = !user.availableForRecitation;
  dbMain.saveUser(ctx.from.id, { availableForRecitation: next });
  await ctx.answerCbQuery(next ? '✅ متاح الآن' : '❌ غير متاح', { show_alert: true });
  return showRecitationVolunteerRegistration(ctx);
}

function findQuranTeacherMosque(userId, db) {
  for (const [mosqueId, roles] of Object.entries(db.mosque_roles || {})) {
    const entry = roles[userId];
    const role = typeof entry === 'string' ? entry : entry?.role;
    if (QURAN_TEACHER_ROLES.includes(role)) return mosqueId;
  }
  return null;
}

async function promptPromoteRecitationMember(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const db = loadDB();
  const mosqueId = findQuranTeacherMosque(String(ctx.from.id), db);
  if (!mosqueId) {
    return ctx.reply('⛔ هذه الميزة لشيخ القرآن/تحفيظ التابع لمسجد.');
  }

  const roles = db.mosque_roles[mosqueId] || {};
  const buttons = [];
  for (const [memberId, roleEntry] of Object.entries(roles)) {
    if (String(memberId) === String(ctx.from.id)) continue;
    const role = typeof roleEntry === 'string' ? roleEntry : roleEntry?.role;
    const member = db.users?.[memberId];
    const name = member?.firstName || roleEntry?.name || memberId;
    buttons.push([{
      text: `${name} (${role})`,
      callback_data: `rec_vol_promote_${memberId}`
    }]);
  }

  if (!buttons.length) {
    return ctx.reply('⚠️ لا يوجد أعضاء في فريق المسجد للترقية.');
  }

  buttons.push([{ text: '✍️ إدخال آيدي/اسم', callback_data: 'rec_vol_promote_manual' }]);
  buttons.push([{ text: '🔙 رجوع', callback_data: 'rec_sheikh_menu' }]);

  return ctx.editMessageText(
    '⬆️ *ترقية شخص لمُسمِّع*\n\nاختر من فريق المسجد أو أدخل المعرف يدوياً:',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
  );
}

async function promoteRecitationMember(ctx, targetUserId, promotedBy) {
  const db = loadDB();
  const mosqueId = findQuranTeacherMosque(String(promotedBy), db);
  if (!mosqueId) return ctx.reply('⛔ غير مصرح.');

  const target = db.users?.[targetUserId] || dbMain.getUser(targetUserId);
  if (!target) return ctx.reply('❌ العضو غير موجود.');

  if (!db.recitation_volunteers) db.recitation_volunteers = {};
  db.recitation_volunteers[targetUserId] = {
    userId: String(targetUserId),
    mosqueId,
    name: target.firstName || 'عضو',
    contact: { type: 'bot_only', value: null },
    status: 'approved',
    active: true,
    adminApproved: true,
    devApproved: true,
    promotedBy: String(promotedBy),
    promotedAt: new Date().toISOString(),
    registeredAt: new Date().toISOString()
  };
  saveDB(db);
  activateRecitationUser(targetUserId, { type: 'bot_only', value: null });

  try {
    await ctx.telegram.sendMessage(
      targetUserId,
      '🎉 *رشّحك شيخ القرآن كمُسمِّع/مُصحِّح*\n\n' +
      'أصبحت متاحاً للطلاب مباشرة. يمكنك التحكم بتوفرك من «🎙️ تطوع للتسميع والتصحيح».',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  return ctx.reply(`✅ تمت ترقية *${target.firstName || targetUserId}* كمُسمِّع متاح مباشرة.`, { parse_mode: 'Markdown' });
}

async function handleRecVolPromotePick(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  return promoteRecitationMember(ctx, ctx.match[1], ctx.from.id);
}

async function handleRecVolPromoteManual(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.awaitingRecVolPromoteTarget = true;
  return ctx.reply('✍️ أرسل *آيدي تيليغرام* أو @username للعضو:', { parse_mode: 'Markdown' });
}

async function handleRecVolPromoteManualInput(ctx, text) {
  if (!ctx.session.awaitingRecVolPromoteTarget) return false;
  delete ctx.session.awaitingRecVolPromoteTarget;

  const raw = text.trim().replace('@', '');
  let targetId = /^\d+$/.test(raw) ? raw : null;
  if (!targetId) {
    const db = loadDB();
    const found = Object.entries(db.users || {}).find(([, u]) => u.username === raw);
    if (found) targetId = found[0];
  }
  if (!targetId) {
    await ctx.reply('❌ لم أجد هذا العضو.');
    return true;
  }
  await promoteRecitationMember(ctx, targetId, ctx.from.id);
  return true;
}

module.exports = {
  showRecitationVolunteerRegistration,
  startRecitationVolunteerRegistration,
  showRecitationVolunteerContactStep,
  handleRecitationVolunteerContactChoice,
  handleRecitationVolunteerContactInput,
  handleRecitationVolunteerSubmit,
  handleRecVolMaApprove,
  handleRecVolMaReject,
  handleRecVolDevApprove,
  handleRecVolDevReject,
  handleRecVolToggle,
  promptPromoteRecitationMember,
  promoteRecitationMember,
  handleRecVolPromotePick,
  handleRecVolPromoteManual,
  handleRecVolPromoteManualInput,
  activateRecitationUser,
  resolveMosqueId,
  findQuranTeacherMosque,
  getMosqueAdminIds,
  getDeveloperNotifyIds,
  notifyMosqueAdmins,
  notifyDevelopersRecVolunteer
};

const registry = require('../core/actionRegistry');

registry.registerAction('rec_vol_menu', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showRecitationVolunteerRegistration(ctx);
}, 'قائمة تطوع التسميع');
registry.registerAction('rec_vol_start_reg', startRecitationVolunteerRegistration, 'بدء تسجيل تطوع تسميع');
registry.registerAction('rec_vol_contact_bot', (ctx) => handleRecitationVolunteerContactChoice(ctx, 'bot_only'), 'تواصل تسميع عبر البوت');
registry.registerAction('rec_vol_contact_whatsapp', (ctx) => handleRecitationVolunteerContactChoice(ctx, 'whatsapp'), 'تواصل تسميع واتساب');
registry.registerAction('rec_vol_toggle', handleRecVolToggle, 'تبديل توفر مُسمِّع');
registry.registerAction(/^rec_ma_vol_approve_(\d+)$/, (ctx) => handleRecVolMaApprove(ctx, ctx.match[1]), 'قبول تطوع تسميع — مسجد');
registry.registerAction(/^rec_ma_vol_reject_(\d+)$/, (ctx) => handleRecVolMaReject(ctx, ctx.match[1]), 'رفض تطوع تسميع — مسجد');
registry.registerAction(/^rec_dev_vol_approve_(\d+)$/, (ctx) => handleRecVolDevApprove(ctx, ctx.match[1]), 'قبول تطوع تسميع — مطوّr');
registry.registerAction(/^rec_dev_vol_reject_(\d+)$/, (ctx) => handleRecVolDevReject(ctx, ctx.match[1]), 'رفض تطوع تسميع — مطوّr');
registry.registerAction('rec_vol_promote_manual', handleRecVolPromoteManual, 'ترقية يدوية لمُسمِّع');
registry.registerAction(/^rec_vol_promote_(\d+)$/, handleRecVolPromotePick, 'ترقية عضو لمُسمِّع');

const { Markup } = require('telegraf');
const db = require('../database');
const { ROLES, CANCEL_BUTTON } = require('../keyboards');
const { formatWhatsappContactMessage } = require('../utils/contactLinks');
const service = require('../services/recitationSheikhService');
const {
  resolveMosqueId,
  notifyMosqueAdmins,
  notifyDevelopersRecVolunteer
} = require('./recitationVolunteers');
const { loadDB, saveDB } = require('../utils/db');

function isSheikhRole(ctx) {
  return [ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role);
}

function recitationToggleKeyboard(profile, userId) {
  const rows = [[Markup.button.callback('🎙️ تفعيل التسميع', 'rec_sheikh_enable')]];
  if (profile?.recitationServiceEnabled) {
    const label = profile.availableForRecitation ? '❌ غير متاح' : '✅ متاح';
    rows.push([Markup.button.callback(label, 'rec_sheikh_toggle_avail')]);
  }
  rows.push([Markup.button.callback('📞 طريقة التواصل', 'rec_sheikh_contact_method')]);
  if (userId) {
    const { findQuranTeacherMosque } = require('./recitationVolunteers');
    const { loadDB } = require('../utils/db');
    if (findQuranTeacherMosque(String(userId), loadDB())) {
      rows.push([Markup.button.callback('⬆️ ترقية شخص لمُسمِّع', 'rec_vol_promote_prompt')]);
    }
  }
  rows.push([Markup.button.callback('🔙 العودة', 'sheikh_back')]);
  return Markup.inlineKeyboard(rows);
}

async function showRecitationSheikhMenu(ctx, edit = false) {
  const profile = service.getSheikhRecitationProfile(ctx.from.id);
  if (!profile) {
    return ctx.reply('⛔ هذه الخدمة للمشايخ فقط.');
  }

  const methodLabel = profile.recitationContactMethod === 'whatsapp'
    ? `واتساب (${profile.recitationWhatsapp || '—'})`
    : 'عبر البوت';
  const availLabel = profile.availableForRecitation ? '✅ متاح' : '❌ غير متاح';
  const dbRaw = loadDB();
  const mosqueId = resolveMosqueId(String(ctx.from.id), dbRaw);
  const pendingVol = dbRaw.recitation_volunteers?.[String(ctx.from.id)];

  const text =
    `🎙️ *تسميع مع شيخ*\n\n` +
    `الحالة: ${availLabel}\n` +
    `طريقة التواصل: ${methodLabel}\n\n` +
    (pendingVol?.status === 'pending'
      ? '_طلبك قيد المراجعة._'
      : mosqueId
        ? '_يُراجع طلب التفعيل مدير مسجدك._'
        : '_يُراجع طلب التفعيل إدارة المنصة._');

  const keyboard = recitationToggleKeyboard(profile, ctx.from.id);
  if (edit && ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function handleRecitationSheikhMenu(ctx) {
  await ctx.answerCbQuery();
  return showRecitationSheikhMenu(ctx, Boolean(ctx.callbackQuery?.message));
}

async function handleRecitationEnable(ctx) {
  await ctx.answerCbQuery();
  const user = db.getUser(ctx.from.id);
  if (!isSheikhRole(ctx)) return ctx.reply('⛔ ليس لديك صلاحية.');

  if (user.recitationServiceEnabled) {
    return ctx.reply(
      '✅ *خدمة التسميع مُفعّلة*\n\nيمكنك التحكم بتوفرك عبر زر ✅ متاح / ❌ غير متاح.',
      { parse_mode: 'Markdown', ...recitationToggleKeyboard(user, ctx.from.id) }
    );
  }

  const userId = String(ctx.from.id);
  const dbRaw = loadDB();
  const existingVol = dbRaw.recitation_volunteers?.[userId];
  if (existingVol?.status === 'pending') {
    return ctx.reply('⏳ طلبك قيد المراجعة.');
  }

  const mosqueId = resolveMosqueId(userId, dbRaw);
  const contact = {
    type: user.recitationContactMethod === 'whatsapp' ? 'whatsapp' : 'bot_only',
    value: user.recitationWhatsapp || null
  };

  if (!dbRaw.recitation_volunteers) dbRaw.recitation_volunteers = {};
  dbRaw.recitation_volunteers[userId] = {
    userId,
    mosqueId,
    name: user.firstName || 'شيخ',
    contact,
    status: 'pending',
    active: false,
    isRecitationSheikh: true,
    registeredAt: new Date().toISOString()
  };
  saveDB(dbRaw);
  db.saveUser(ctx.from.id, { isRecitationSheikh: true });

  const vol = dbRaw.recitation_volunteers[userId];
  if (mosqueId) {
    await notifyMosqueAdmins(ctx, mosqueId, userId, vol);
  } else {
    await notifyDevelopersRecVolunteer(ctx, userId, vol, 'شيخ مستقل — تفعيل تسميع');
  }

  const success = mosqueId
    ? '📨 *تم إرسال طلب التفعيل*\n\nسيراجعه مدير مسجدك.'
    : '📨 *تم إرسال طلب التفعيل*\n\nسيراجعه المطوّr ويُخطرك بالقرار.';
  return ctx.reply(success, { parse_mode: 'Markdown' });
}

async function handleRecitationToggleAvail(ctx) {
  await ctx.answerCbQuery();
  const user = db.getUser(ctx.from.id);
  if (!user.recitationServiceEnabled) {
    return ctx.reply('⚠️ يجب تفعيل الخدمة أولاً عبر زر «🎙️ تفعيل التسميع».');
  }
  const next = !user.availableForRecitation;
  service.setSheikhRecitationFields(ctx.from.id, { availableForRecitation: next });
  return showRecitationSheikhMenu(ctx, true);
}

async function handleRecitationContactMethod(ctx) {
  await ctx.answerCbQuery();
  return ctx.editMessageText(
    '📞 *طريقة التواصل لتسميع مع شيخ*\n\nاختر كيف يتواصل معك الطالب:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('💬 عبر البوت', 'rec_sheikh_method_bot')],
        [Markup.button.callback('📱 واتساب', 'rec_sheikh_method_whatsapp')],
        [Markup.button.callback('🔙 رجوع', 'rec_sheikh_menu')]
      ])
    }
  );
}

async function handleRecitationMethodBot(ctx) {
  await ctx.answerCbQuery();
  service.setSheikhRecitationFields(ctx.from.id, {
    recitationContactMethod: 'bot',
    recitationWhatsapp: null
  });
  return showRecitationSheikhMenu(ctx, true);
}

async function handleRecitationMethodWhatsapp(ctx) {
  await ctx.answerCbQuery();
  ctx.session.awaitingRecitationWhatsapp = true;
  return ctx.reply(
    '📱 *أرسل رقم واتسابك*\n\nمع رمز الدولة، مثال: `+491234567890`',
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([[CANCEL_BUTTON]]).resize()
    }
  );
}

async function handleRecitationWhatsappInput(ctx, text) {
  if (!ctx.session.awaitingRecitationWhatsapp) return false;
  if (text === CANCEL_BUTTON) {
    delete ctx.session.awaitingRecitationWhatsapp;
    return ctx.reply('❌ تم الإلغاء.');
  }
  const digits = String(text).replace(/[^0-9+]/g, '');
  const clean = digits.replace(/[^0-9]/g, '');
  if (clean.length < 8) {
    await ctx.reply('⚠️ الرقم قصير — أرسل الرقم مع رمز الدولة.');
    return true;
  }
  delete ctx.session.awaitingRecitationWhatsapp;
  service.setSheikhRecitationFields(ctx.from.id, {
    recitationContactMethod: 'whatsapp',
    recitationWhatsapp: clean
  });
  await ctx.reply(`✅ تم حفظ رقم الواتساب: +${clean}`);
  return true;
}

async function handleRecitationSheikhApprove(ctx) {
  await ctx.answerCbQuery();
  const requestId = ctx.match[1];
  const result = await service.approveRecitationRequest(requestId, ctx.telegram);
  if (!result) return ctx.reply('⚠️ الطلب غير موجود أو مُعالج مسبقاً.');
  await ctx.editMessageText('✅ تم قبول طلب تفعيل التسميع').catch(() => {});
}

async function handleRecitationSheikhReject(ctx) {
  await ctx.answerCbQuery();
  const requestId = ctx.match[1];
  const result = await service.rejectRecitationRequest(requestId, ctx.telegram);
  if (!result) return ctx.reply('⚠️ الطلب غير موجود أو مُعالج مسبقاً.');
  await ctx.editMessageText('❌ تم رفض طلب تفعيل التسميع').catch(() => {});
}

async function promptRecitationWithSheikh(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  ctx.session.recitationSheikhPagePrompt = true;
  return ctx.reply(
    '🎙️ *تسميع مع شيخ*\n\nأرسل رقم الصفحة (1–604) التي تريد تسميعها:',
    { parse_mode: 'Markdown' }
  );
}

async function startRecitationWithSheikhPage(ctx, pageText) {
  const pageNumber = parseInt(String(pageText).trim(), 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    return ctx.reply('⚠️ رقم الصفحة يجب أن يكون بين 1 و 604.');
  }

  const available = service.getAvailableRecitationSheikhs();
  if (!available.length) {
    delete ctx.session.recitationSheikhPagePrompt;
    return ctx.reply('❌ لا يوجد شيخ متاح للتسميع حالياً، حاول لاحقاً.');
  }

  let sheikhUser = service.pickRecitationSheikh(available);
  if (available.length > 3) {
    const buttons = available.slice(0, 8).map((s) =>
      [Markup.button.callback(service.formatProviderPickLabel(s), `rec_pick_sheikh_${s.id}_${pageNumber}`)]
    );
    delete ctx.session.recitationSheikhPagePrompt;
    return ctx.reply(
      '🎙️ *اختر المُسمِّع:*',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  }

  delete ctx.session.recitationSheikhPagePrompt;
  return connectStudentToSheikh(ctx, sheikhUser, pageNumber);
}

async function handlePickRecitationSheikh(ctx) {
  await ctx.answerCbQuery();
  const sheikhId = ctx.match[1];
  const pageNumber = parseInt(ctx.match[2], 10);
  const sheikhUser = db.getUser(sheikhId);
  if (!sheikhUser?.availableForRecitation) {
    return ctx.reply('❌ هذا الشيخ لم يعد متاحاً.');
  }
  return connectStudentToSheikh(ctx, sheikhUser, pageNumber);
}

async function connectStudentToSheikh(ctx, providerUser, pageNumber) {
  const profile = service.getRecitationProviderProfile(providerUser.id);
  const student = db.getUser(ctx.from.id) || ctx.user;

  if (profile.recitationContactMethod === 'whatsapp' && profile.recitationWhatsapp) {
    const url = service.buildStudentWhatsappHandoff(profile, pageNumber, student.firstName);
    return ctx.reply(
      `🎙️ *تسميع مع ${profile.firstName}*\n\n` +
      formatWhatsappContactMessage(profile.recitationWhatsapp,
        `السلام عليكم، أريد تسميع صفحة ${pageNumber} من حفظي.\nاسمي: ${student.firstName || 'طالب'}`),
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }

  const session = db.createRecitationSession({
    studentId: ctx.from.id,
    sheikhId: providerUser.id,
    pageNumber
  });
  ctx.session.recitationSheikhSessionId = session.id;

  return ctx.reply(
    `🎙️ *تسميع مع ${profile.firstName}* | صفحة ${pageNumber}\n\n` +
    'اقرأ هذه الصفحة *كاملة من حفظك* وأرسلها كرسالة صوتية واحدة الآن (بلا رؤية النص).',
    { parse_mode: 'Markdown' }
  );
}

async function handleRecitationSessionVoice(ctx) {
  const session = service.findStudentWaitingVoiceSession(ctx.from.id);
  if (!session) return false;

  const voice = ctx.message.voice || ctx.message.audio;
  if (!voice?.file_id) return false;

  const studentUser = db.getUser(ctx.from.id) || ctx.user;
  await service.relayStudentVoiceToSheikh(session, studentUser, voice.file_id, ctx.telegram);
  delete ctx.session.recitationSheikhSessionId;

  await ctx.reply('✅ تم إرسال تسميعك للشيخ. انتظر رده.');
  return true;
}

async function handleRecitationSheikhReply(ctx) {
  const session = service.findSheikhActiveSession(ctx.from.id);
  if (!session) return false;

  if (ctx.message.voice?.file_id) {
    await service.relaySheikhReplyToStudent(session, 'voice', ctx.message.voice.file_id, ctx.telegram);
    return true;
  }
  if (ctx.message.text && !isNavMessage(ctx)) {
    await service.relaySheikhReplyToStudent(session, 'text', ctx.message.text, ctx.telegram);
    return true;
  }
  return false;
}

function isNavMessage(ctx) {
  const { NAV_COMMANDS, isMenuButton } = require('../keyboards');
  const text = ctx.message?.text;
  if (!text) return false;
  return NAV_COMMANDS.includes(text) || isMenuButton(text);
}

async function handleRecitationSessionDone(ctx) {
  await ctx.answerCbQuery();
  const sessionId = ctx.match[1];
  const session = db.getRecitationSession(sessionId);
  if (!session || session.sheikhId !== String(ctx.from.id)) {
    return ctx.answerCbQuery('❌ الجلسة غير موجودة.', { show_alert: true });
  }
  await service.completeRecitationSession(sessionId, ctx.telegram);
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  return ctx.reply('✅ تم إغلاق جلسة التسميع.');
}

module.exports = {
  showRecitationSheikhMenu,
  handleRecitationSheikhMenu,
  handleRecitationEnable,
  handleRecitationToggleAvail,
  handleRecitationContactMethod,
  handleRecitationMethodBot,
  handleRecitationMethodWhatsapp,
  handleRecitationWhatsappInput,
  handleRecitationSheikhApprove,
  handleRecitationSheikhReject,
  promptRecitationWithSheikh,
  startRecitationWithSheikhPage,
  handlePickRecitationSheikh,
  handleRecitationSessionVoice,
  handleRecitationSheikhReply,
  handleRecitationSessionDone
};

const registry = require('../core/actionRegistry');

registry.registerAction('rec_sheikh_menu', handleRecitationSheikhMenu, 'قائمة تسميع الشيخ');
registry.registerAction('rec_sheikh_enable', handleRecitationEnable, 'تفعيل التسميع');
registry.registerAction('rec_sheikh_toggle_avail', handleRecitationToggleAvail, 'تبديل توفر التسميع');
registry.registerAction('rec_sheikh_contact_method', handleRecitationContactMethod, 'طريقة تواصل التسميع');
registry.registerAction('rec_sheikh_method_bot', handleRecitationMethodBot, 'تواصل تسميع عبر البوت');
registry.registerAction('rec_sheikh_method_whatsapp', handleRecitationMethodWhatsapp, 'تواصل تسميع واتساب');
registry.registerAction(/^rec_sheikh_approve_(.+)$/, handleRecitationSheikhApprove, 'قبول تفعيل تسميع شيخ');
registry.registerAction(/^rec_sheikh_reject_(.+)$/, handleRecitationSheikhReject, 'رفض تفعيل تسميع شيخ');
registry.registerAction('quran_recitation_sheikh_prompt', promptRecitationWithSheikh, 'تسميع مع شيخ');
registry.registerAction(/^rec_pick_sheikh_(\d+)_(\d+)$/, handlePickRecitationSheikh, 'اختيار شيخ للتسميع');
registry.registerAction('rec_vol_promote_prompt', async (ctx) => {
  const { promptPromoteRecitationMember } = require('./recitationVolunteers');
  return promptPromoteRecitationMember(ctx);
}, 'ترقية لمُسمِّع — قائمة');
registry.registerAction(/^rec_session_done_(.+)$/, handleRecitationSessionDone, 'إنهاء جلسة تسميع');

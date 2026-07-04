const db = require('../database');
const { ROLES } = require('../keyboards');
const { buildWhatsappLink } = require('../utils/contactLinks');

function logEvent(events, type, detail) {
  const entry = { at: new Date().toISOString(), type, ...detail };
  if (events) events.push(entry);
  return entry;
}

function hasApprovedMosque(user) {
  if (!user?.mosqueId) return false;
  const mosque = db.getMosque(user.mosqueId);
  return Boolean(mosque && mosque.active !== false);
}

function buildRecitationProfile(user, userId) {
  return {
    sheikhId: String(userId),
    firstName: user.firstName || 'مُسمِّع',
    mosqueId: user.mosqueId || null,
    hasApprovedMosque: hasApprovedMosque(user),
    availableForRecitation: Boolean(user.availableForRecitation),
    recitationServiceEnabled: Boolean(user.recitationServiceEnabled),
    recitationContactMethod: user.recitationContactMethod || 'bot',
    recitationWhatsapp: user.recitationWhatsapp || null
  };
}

function getRecitationProviderProfile(userId) {
  const user = db.getUser(userId);
  if (!user?.recitationServiceEnabled) return null;
  return buildRecitationProfile(user, userId);
}

function getSheikhRecitationProfile(sheikhId) {
  const user = db.getUser(sheikhId);
  if (!user || user.role !== ROLES.SHEIKH) return null;
  return buildRecitationProfile(user, sheikhId);
}

function setSheikhRecitationFields(sheikhId, fields) {
  return db.saveUser(sheikhId, fields);
}

function getAvailableRecitationSheikhs() {
  return db.allUsers().filter((u) => u.availableForRecitation === true);
}

function pickRecitationSheikh(sheikhs) {
  if (!sheikhs?.length) return null;
  return sheikhs[0];
}

function isRecitationSheikhProvider(user) {
  if (!user) return false;
  return user.isRecitationSheikh === true || user.role === ROLES.SHEIKH;
}

function formatProviderPickLabel(user) {
  const name = user?.firstName || 'مُسمِّع';
  if (isRecitationSheikhProvider(user)) {
    return `👨‍🏫 الشيخ ${name}`;
  }
  return `🙋 ${name}`;
}

function getDeveloperNotifyIds() {
  const developers = db.allUsers().filter((u) => u.role === ROLES.DEVELOPER || db.isDeveloper(u.id));
  const moderators = db.getModerators ? db.getModerators() : [];
  return [...new Set([
    ...developers.map((u) => String(u.id)),
    ...moderators.map((m) => String(m.userId)).filter(Boolean)
  ])];
}

async function notifyDevelopersRecitationRequest(telegram, sheikhUser, requestId, events) {
  const notifyIds = getDeveloperNotifyIds();
  const text =
    `🎙️ *طلب تفعيل تسميع مع شيخ*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👨‍🏫 ${sheikhUser.firstName || 'شيخ'}\n` +
    `🆔 ${sheikhUser.id}\n` +
    `📱 @${sheikhUser.username || '—'}\n` +
    `🕌 حالة المسجد: ${hasApprovedMosque(sheikhUser) ? 'مرتبط' : 'شيخ مستقل'}`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ قبول', callback_data: `rec_sheikh_approve_${requestId}` },
      { text: '❌ رفض', callback_data: `rec_sheikh_reject_${requestId}` }
    ]]
  };

  for (const adminId of notifyIds) {
    try {
      if (telegram?.sendMessage) {
        await telegram.sendMessage(adminId, text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
      }
      logEvent(events, 'notify_developer', { adminId, requestId });
    } catch (e) {
      logEvent(events, 'notify_developer_failed', { adminId, requestId, error: e.message });
    }
  }
}

async function activateRecitationForSheikh(sheikhId, events) {
  const user = db.getUser(sheikhId);
  const fields = {
    availableForRecitation: true,
    recitationServiceEnabled: true
  };
  if (user?.role === ROLES.SHEIKH || user?.isRecitationSheikh) {
    fields.isRecitationSheikh = true;
  }
  setSheikhRecitationFields(sheikhId, fields);
  logEvent(events, 'recitation_enabled', { sheikhId: String(sheikhId) });
  return getSheikhRecitationProfile(sheikhId);
}

async function requestRecitationActivation(sheikhId, sheikhUser, telegram, events) {
  const request = db.createRecitationSheikhRequest(sheikhId);
  logEvent(events, 'recitation_request_created', { sheikhId: String(sheikhId), requestId: request.id });
  await notifyDevelopersRecitationRequest(telegram, sheikhUser, request.id, events);
  return request;
}

async function approveRecitationRequest(requestId, telegram, events) {
  const request = db.getRecitationSheikhRequest(requestId);
  if (!request || request.status !== 'pending') return null;
  db.updateRecitationSheikhRequest(requestId, { status: 'approved', approvedAt: new Date().toISOString() });
  await activateRecitationForSheikh(request.sheikhId, events);
  if (telegram?.sendMessage) {
    await telegram.sendMessage(
      request.sheikhId,
      '✅ *تمت الموافقة على خدمة التسميع*\n\nيمكنك الآن التحكم بتوفرك من لوحة الشيخ.',
      { parse_mode: 'Markdown' }
    );
  }
  logEvent(events, 'recitation_request_approved', { requestId, sheikhId: request.sheikhId });
  return request;
}

async function rejectRecitationRequest(requestId, telegram, events) {
  const request = db.getRecitationSheikhRequest(requestId);
  if (!request || request.status !== 'pending') return null;
  db.updateRecitationSheikhRequest(requestId, { status: 'rejected', rejectedAt: new Date().toISOString() });
  if (telegram?.sendMessage) {
    await telegram.sendMessage(
      request.sheikhId,
      '❌ لم تتم الموافقة على هذه الخدمة حالياً.',
      { parse_mode: 'Markdown' }
    );
  }
  logEvent(events, 'recitation_request_rejected', { requestId, sheikhId: request.sheikhId });
  return request;
}

async function relayStudentVoiceToSheikh(session, studentUser, voiceFileId, telegram, events) {
  const sheikhId = session.sheikhId;
  const caption =
    `🎙️ *تسميع جديد*\n\n` +
    `👤 من: ${studentUser?.firstName || 'طالب'}\n` +
    `📄 صفحة: ${session.pageNumber}`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ انتهيت من هذا التسميع', callback_data: `rec_session_done_${session.id}` }
    ]]
  };

  if (telegram?.sendVoice) {
    await telegram.sendVoice(sheikhId, voiceFileId, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
  }

  db.updateRecitationSession(session.id, { status: 'with_sheikh', voiceRelayedAt: new Date().toISOString() });
  logEvent(events, 'voice_relayed_to_sheikh', {
    sessionId: session.id,
    studentId: session.studentId,
    sheikhId,
    pageNumber: session.pageNumber
  });
  return db.getRecitationSession(session.id);
}

async function relaySheikhReplyToStudent(session, messageType, content, telegram, events) {
  const studentId = session.studentId;
  if (telegram?.sendMessage && messageType === 'text') {
    await telegram.sendMessage(studentId, `🎙️ *رد الشيخ:*\n${content}`, { parse_mode: 'Markdown' });
  }
  if (telegram?.sendVoice && messageType === 'voice') {
    await telegram.sendVoice(studentId, content, { caption: '🎙️ رد الشيخ على تسميعك' });
  }
  logEvent(events, 'sheikh_reply_relayed', { sessionId: session.id, studentId, messageType });
}

async function completeRecitationSession(sessionId, telegram, events) {
  const session = db.getRecitationSession(sessionId);
  if (!session) return null;
  db.updateRecitationSession(sessionId, { status: 'completed', completedAt: new Date().toISOString() });
  if (telegram?.sendMessage) {
    await telegram.sendMessage(
      session.studentId,
      '✅ انتهى الشيخ من مراجعة تسميعك، بارك الله فيك.',
      { parse_mode: 'Markdown' }
    );
  }
  logEvent(events, 'session_completed', { sessionId, studentId: session.studentId });
  return db.getRecitationSession(sessionId);
}

function buildStudentWhatsappHandoff(sheikhProfile, pageNumber, studentName) {
  const prefill =
    `السلام عليكم، أريد تسميع صفحة ${pageNumber} من حفظي.\n` +
    `اسمي: ${studentName || 'طالب'}`;
  return buildWhatsappLink(sheikhProfile.recitationWhatsapp, prefill);
}

function findStudentWaitingVoiceSession(studentId) {
  return db.findRecitationSessionBy(
    (s) => s.studentId === String(studentId) && s.status === 'waiting_voice'
  );
}

function findSheikhActiveSession(sheikhId) {
  return db.findRecitationSessionBy(
    (s) => s.sheikhId === String(sheikhId) && s.status === 'with_sheikh'
  );
}

module.exports = {
  logEvent,
  hasApprovedMosque,
  getRecitationProviderProfile,
  getSheikhRecitationProfile,
  setSheikhRecitationFields,
  getAvailableRecitationSheikhs,
  pickRecitationSheikh,
  isRecitationSheikhProvider,
  formatProviderPickLabel,
  activateRecitationForSheikh,
  requestRecitationActivation,
  approveRecitationRequest,
  rejectRecitationRequest,
  relayStudentVoiceToSheikh,
  relaySheikhReplyToStudent,
  completeRecitationSession,
  buildStudentWhatsappHandoff,
  findStudentWaitingVoiceSession,
  findSheikhActiveSession,
  notifyDevelopersRecitationRequest,
  getDeveloperNotifyIds
};

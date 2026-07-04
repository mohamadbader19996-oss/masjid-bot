const db = require('../database');
const { loadDB, saveDB } = require('../utils/db');

async function approveMosqueRequest(ctx, requestId) {
  console.log(`[approveMosqueRequest] start requestId=${requestId}`);
  await ctx.answerCbQuery().catch(() => {});
  const request = db.getMosqueRequest(requestId);
  if (!request) return ctx.reply('❌ الطلب غير موجود.');
  if (request.status !== 'pending') return ctx.reply('⚠️ تم معالجة هذا الطلب مسبقاً.');

  const mosqueId = `mosque_${Date.now()}`;
  const approverId = String(ctx.from.id);
  const approver = db.getUser(approverId);
  const isDev = db.isDeveloper(approverId);
  const isMod = approver && (approver.role === 'moderator' || approver.role === 'MODERATOR');

  const dbData = loadDB();
  if (!dbData.mosques) dbData.mosques = {};
  dbData.mosques[mosqueId] = {
    id: mosqueId,
    name: request.name,
    location: request.location,
    city: request.city,
    country: request.country,
    countryCode: request.countryCode || null,
    lat: request.lat || null,
    lng: request.lng || null,
    adminId: request.requestedBy,
    createdBy: request.requestedBy,
    active: true,
    verified: true,
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedByModeratorId: isMod && !isDev ? approverId : null,
    approvedByDeveloper: isDev ? approverId : null,
    prayerTimes: {}
  };
  if (!dbData.mosqueRequests) dbData.mosqueRequests = {};
  dbData.mosqueRequests[requestId].status = 'approved';
  saveDB(dbData);
  db.saveUser(request.requestedBy, { role: 'admin', mosqueId });
  console.log(`[approveMosqueRequest] done mosqueId=${mosqueId} name=${request.name}`);

  await ctx.editMessageCaption('✅ تم القبول وتفعيل المسجد').catch(
    () => ctx.editMessageText('✅ تم القبول وتفعيل المسجد').catch(() => {})
  );
  await ctx.telegram.sendMessage(
    request.requestedBy,
    `🎉 *تم قبول مسجدك!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 ${request.name}\n` +
    `✅ أصبحت الآن مدير المسجد\n` +
    `ابدأ ببناء فريقك من لوحة التحكم 🚀`,
    { parse_mode: 'Markdown' }
  );

  return { mosqueId, requestId };
}

async function rejectMosqueRequest(ctx, requestId) {
  await ctx.answerCbQuery().catch(() => {});
  const request = db.getMosqueRequest(requestId);
  if (!request) return ctx.reply('❌ الطلب غير موجود.');

  const dbData = loadDB();
  if (!dbData.mosqueRequests?.[requestId]) return ctx.reply('❌ الطلب غير موجود.');
  dbData.mosqueRequests[requestId].status = 'rejected';
  saveDB(dbData);

  await ctx.editMessageCaption('❌ تم رفض الطلب').catch(
    () => ctx.editMessageText('❌ تم رفض الطلب').catch(() => {})
  );
  await ctx.telegram.sendMessage(
    request.requestedBy,
    `❌ *تم رفض طلب تسجيل مسجدك*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 ${request.name}\n` +
    `تواصل مع الإدارة لمزيد من المعلومات.`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = {
  approveMosqueRequest,
  rejectMosqueRequest
};

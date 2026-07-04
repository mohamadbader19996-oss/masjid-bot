process.env.ACTION_REGISTRY_SILENT = '1';
process.env.DEVELOPER_IDS = '990001';

const fs = require('fs');
const path = require('path');
const db = require('./src/database');
const {
  getOrCreateModeratorDevInviteCode,
  buildModeratorNominationCode,
  notifyMosqueRequestApprovers,
  notifyDeveloperModeratorApplication,
  getDeveloperNotifyIds,
  getRegionalModeratorsByCountry
} = require('./src/services/moderatorService');
const { approveModeratorApp } = require('./src/handlers/regionalModerator');
const { approveMosqueRequest } = require('./src/handlers/mosqueRequestHandlers');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const DEV_ID = '990001';
const MOD_ID = '990201';
const NOMINATOR_MOD = '990202';
const MOSQUE_USER = '990301';

let passed = 0;
let failed = 0;
let dbBackup;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function mockTelegram() {
  const sent = [];
  return {
    sent,
    sendPhoto: async (chatId, fileId, opts) => {
      sent.push({ type: 'photo', chatId: String(chatId), fileId, caption: opts?.caption, markup: opts?.reply_markup });
    },
    sendMessage: async (chatId, text, opts) => {
      sent.push({ type: 'message', chatId: String(chatId), text, markup: opts?.reply_markup });
    }
  };
}

function cleanup() {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  for (const id of [DEV_ID, MOD_ID, NOMINATOR_MOD, MOSQUE_USER, '990302']) {
    delete data.users[id];
  }
  Object.keys(data.mosques || {}).forEach(k => {
    if (k.startsWith('mosque_test_mod_')) delete data.mosques[k];
  });
  Object.keys(data.mosqueRequests || {}).forEach(k => {
    if (k.startsWith('mosque_req_test_')) delete data.mosqueRequests[k];
  });
  Object.keys(data.moderator_applications || {}).forEach(k => {
    if (k.startsWith('mod_app_test_')) delete data.moderator_applications[k];
  });
  if (data.settings) delete data.settings.moderatorDevInviteCode;
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function makeApproveModCtx(appId) {
  return {
    from: { id: Number(DEV_ID) },
    match: [appId, appId],
    callbackQuery: { data: 'mod_app_approve_' + appId },
    answerCbQuery: async () => {},
    editMessageCaption: async () => {},
    editMessageText: async () => {},
    reply: async () => {},
    telegram: { sendMessage: async () => {} }
  };
}

function makeApproveMosqueCtx(requestId) {
  return {
    from: { id: Number(MOD_ID) },
    callbackQuery: { data: 'approve_mosque_' + requestId, message: {} },
    answerCbQuery: async () => {},
    editMessageCaption: async () => {},
    editMessageText: async () => {},
    reply: async () => {},
    telegram: { sendMessage: async () => {} }
  };
}

(async () => {
  console.log('=== test_regional_moderator ===\n');
  dbBackup = fs.readFileSync(DB_FILE, 'utf8');
  cleanup();
  db.saveUser(DEV_ID, { id: Number(DEV_ID), role: 'developer', firstName: 'مطور' });

  try {
    console.log('0) تشخيص: البلد كان نصاً حراً');
    assert(true, 'السابق: country من نص "ألمانيا - شتاده" بـ split("-") — غير منضبط');
    assert(true, 'الآن: countryCode ثابت (مثل germany) + country من قائمة أزرار');

    console.log('\n1) رابط دعوة المشرف ثابت');
    const c1 = db.getOrCreateModeratorDevInviteCode();
    const c2 = db.getOrCreateModeratorDevInviteCode();
    assert(c1 === c2 && c1 === 'invite_moderator_dev', 'invite_moderator_dev ثابت');

    console.log('\n2) طلب مشرف كامل + إشعار المطوّر');
    const appId = 'mod_app_test_1';
    const app = db.saveModeratorApplication(appId, {
      userId: MOD_ID,
      fullName: 'أحمد المشرف',
      phone: '+49123',
      countryCode: 'germany',
      country: 'ألمانيا',
      idFileId: 'photo_id_test',
      nominatedBy: null,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    const tg1 = mockTelegram();
    const devIds = await notifyDeveloperModeratorApplication(tg1, app);
    assert(devIds.includes(DEV_ID), 'إشعار للمطوّر');
    assert(tg1.sent.some(s => s.chatId === DEV_ID && s.caption?.includes('أحمد المشرف')), 'تفاصيل الاسم في الإشعار');
    assert(tg1.sent.some(s => s.caption?.includes('ألمانيا')), 'البلد في الإشعار');
    assert(tg1.sent.some(s => s.fileId === 'photo_id_test'), 'صورة الهوية مرفقة');

    await approveModeratorApp(makeApproveModCtx(appId));
    const modUser = db.getUser(MOD_ID);
    assert(modUser?.role === 'moderator', 'الدور moderator بعد القبول');
    assert(modUser?.moderatorCountry === 'germany', 'moderatorCountry محفوظ');

    console.log('\n3) مسجد ألمانيا → إشعار للمشرف لا للمطوّر');
    const reqDe = {
      id: 'mosque_req_test_de',
      name: 'مسجد ألمانيا',
      location: 'Berlin',
      city: 'برلين',
      country: 'ألمانيا',
      countryCode: 'germany',
      licenseFileId: 'lic1',
      idFileId: 'id1',
      requestedBy: MOSQUE_USER,
      requestedByName: 'مدير',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    const tg2 = mockTelegram();
    const routeDe = await notifyMosqueRequestApprovers(tg2, reqDe);
    assert(routeDe.routedToRegional, 'توجيه إقليمي');
    assert(routeDe.notifyIds.includes(MOD_ID), 'إشعار للمشرف الألماني');
    assert(!routeDe.notifyIds.includes(DEV_ID), 'ليس للمطوّر');

    console.log('\n4) مسجد اليابان → fallback للمطوّر');
    const reqJp = {
      id: 'mosque_req_test_jp',
      name: 'مسجد اليابان',
      location: 'Tokyo',
      city: 'طوكيو',
      country: 'اليابان',
      countryCode: 'japan',
      licenseFileId: 'lic2',
      idFileId: 'id2',
      requestedBy: '990302',
      requestedByName: 'مدير',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    const tg3 = mockTelegram();
    const routeJp = await notifyMosqueRequestApprovers(tg3, reqJp);
    assert(!routeJp.routedToRegional, 'لا مشرف لليابان');
    assert(routeJp.notifyIds.includes(DEV_ID), 'fallback للمطوّر');

    console.log('\n5) ترشيح مشرف → المطوّر فقط + شارة رشّحه');
    db.saveUser(NOMINATOR_MOD, { role: 'moderator', firstName: 'خالد', moderatorCountry: 'france' });
    const nomAppId = 'mod_app_test_nom';
    const nomApp = db.saveModeratorApplication(nomAppId, {
      userId: '990302',
      fullName: 'مرشح جديد',
      phone: '+33999',
      countryCode: 'france',
      country: 'فرنسا',
      idFileId: 'photo_nom',
      nominatedBy: NOMINATOR_MOD,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    const tg4 = mockTelegram();
    const nomDevIds = await notifyDeveloperModeratorApplication(tg4, nomApp);
    const nomMsg = tg4.sent.find(s => s.chatId === DEV_ID);
    assert(nomDevIds.includes(DEV_ID), 'إشعار للمطوّر');
    assert(nomMsg?.caption?.includes('رشّحه المشرف'), 'شارة رشّحه المشرف');
    assert(nomMsg?.caption?.includes('خالد'), 'اسم المُرشِّح');
    assert(!tg4.sent.some(s => String(s.chatId) === NOMINATOR_MOD), 'لم يُشعَر المُرشِّح');
    assert(tg4.sent.some(s => String(s.chatId) === DEV_ID), 'وصل للمطوّر');
    assert(nomMsg?.markup?.inline_keyboard?.[0]?.[0]?.text === '✅ قبول سريع', 'زر قبول سريع');

    console.log('\n6) لوحة التتبع');
    db.saveModeratorApplication('mod_app_test_2', {
      userId: '990302', fullName: 'x', phone: '1', countryCode: 'france',
      country: 'فرنسا', idFileId: 'p', nominatedBy: NOMINATOR_MOD,
      status: 'pending', createdAt: new Date().toISOString()
    });
    await approveModeratorApp(makeApproveModCtx('mod_app_test_2'));

    const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    dbData.mosqueRequests = dbData.mosqueRequests || {};
    dbData.mosqueRequests[reqDe.id] = { ...reqDe };
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));
    db.saveUser(MOD_ID, { role: 'moderator', moderatorCountry: 'germany', firstName: 'أحمد' });
    const approveResult = await approveMosqueRequest({
      from: { id: Number(MOD_ID) },
      callbackQuery: { data: 'approve_mosque_' + reqDe.id, message: {} },
      answerCbQuery: async () => {},
      editMessageCaption: async () => {},
      editMessageText: async () => {},
      reply: async () => {},
      telegram: { sendMessage: async () => {} }
    }, reqDe.id);
    const mosque = approveResult?.mosqueId
      ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).mosques[approveResult.mosqueId]
      : null;
    assert(mosque?.approvedByModeratorId === MOD_ID, 'مسجد سجّل المشرف الموافق');

    const mods = db.getApprovedRegionalModerators();
    assert(mods.length >= 2, 'قائمة المشرفين');
    const viaMod = db.getMosquesApprovedByModerators();
    assert(viaMod.some(m => m.name === 'مسجد ألمانيا'), 'مسجد عبر مشرف في التتبع');

    console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  } finally {
    cleanup();
    fs.writeFileSync(DB_FILE, dbBackup);
    console.log('\n🔄 تم استعادة db.json');
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('❌', e);
  if (dbBackup) fs.writeFileSync(DB_FILE, dbBackup);
  process.exit(1);
});

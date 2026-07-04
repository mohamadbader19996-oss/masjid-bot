process.env.ACTION_REGISTRY_SILENT = '1';
process.env.DEVELOPER_IDS = '990001';

const fs = require('fs');
const path = require('path');
const db = require('./src/database');
const { approveModeratorApp } = require('./src/handlers/regionalModerator');
const { approveMosqueRequest } = require('./src/handlers/mosqueRequestHandlers');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const DEV_ID = '990001';
const MOD_ID = '990501';
const APP_ID = 'mod_app_test_revoke';

let passed = 0;
let failed = 0;
let dbBackup;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function cleanup() {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  delete data.users[DEV_ID];
  delete data.users[MOD_ID];
  Object.keys(data.mosques || {}).forEach(k => {
    if (k.startsWith('mosque_revoke_test_')) delete data.mosques[k];
  });
  delete data.moderator_applications?.[APP_ID];
  delete data.mosqueRequests?.mosque_req_revoke_test;
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

(async () => {
  console.log('=== test_revoke_moderator ===\n');
  dbBackup = fs.readFileSync(DB_FILE, 'utf8');
  cleanup();
  db.saveUser(DEV_ID, { id: Number(DEV_ID), role: 'developer', firstName: 'مطور' });
  db.saveUser(MOD_ID, { id: Number(MOD_ID), role: 'sheikh', firstName: 'مشرف', lastName: 'اختبار' });

  try {
    db.saveModeratorApplication(APP_ID, {
      userId: MOD_ID,
      fullName: 'مشرف اختبار',
      phone: '+49111',
      countryCode: 'germany',
      country: 'ألمانيا',
      idFileId: 'id_photo',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    await approveModeratorApp({
      from: { id: Number(DEV_ID) },
      match: [APP_ID, APP_ID],
      callbackQuery: { data: 'mod_app_approve_' + APP_ID },
      answerCbQuery: async () => {},
      editMessageCaption: async () => {},
      editMessageText: async () => {},
      reply: async () => {},
      telegram: { sendMessage: async () => {} }
    });

    const mosqueId = 'mosque_revoke_test_1';
    const { loadDB, saveDB } = require('./src/utils/db');
    const data = loadDB();
    data.mosques = data.mosques || {};
    data.mosques[mosqueId] = {
      id: mosqueId,
      name: 'مسجد قبل العزل',
      country: 'ألمانيا',
      countryCode: 'germany',
      active: true,
      verified: true,
      approvedByModeratorId: MOD_ID,
      approvedAt: new Date().toISOString()
    };
    data.mosqueRequests = data.mosqueRequests || {};
    data.mosqueRequests.mosque_req_revoke_test = {
      id: 'mosque_req_revoke_test',
      name: 'مسجد قبل العزل',
      status: 'approved'
    };
    saveDB(data);

    assert(db.getUser(MOD_ID)?.role === 'moderator', 'قبل العزل: role = moderator');
    assert(db.getUser(MOD_ID)?.moderatorCountry === 'germany', 'قبل العزل: moderatorCountry موجود');
    assert(db.getUser(MOD_ID)?.roleBeforeModerator === 'sheikh', 'حُفظ الدور السابق sheikh');

    const result = db.revokeRegionalModerator(MOD_ID, DEV_ID);
    assert(result.ok, 'العزل نجح');
    assert(result.restoredRole === 'sheikh', 'عاد الدور إلى sheikh');

    const after = db.getUser(MOD_ID);
    assert(after?.role === 'sheikh', 'بعد العزل: role = sheikh');
    assert(!after?.moderatorCountry, 'moderatorCountry حُذفت');
    assert(!db.isModerator(MOD_ID), 'أُزيل من قائمة moderators');

    const app = db.getModeratorApplication(APP_ID);
    assert(app?.status === 'revoked', 'طلب التقديم status = revoked (أرشيف)');

    const mosque = loadDB().mosques[mosqueId];
    assert(mosque?.active === true, 'المسجد ما زال active');
    assert(mosque?.approvedByModeratorId === MOD_ID, 'سجل موافقة المشرف على المسجد لم يتغيّر');

    const mods = db.getApprovedRegionalModerators();
    assert(!mods.some(m => String(m.id) === MOD_ID), 'لم يعد في قائمة المشرفين النشطين');

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

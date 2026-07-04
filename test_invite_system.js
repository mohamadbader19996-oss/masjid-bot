process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const db = require('./src/database');
const {
  buildTelegramLink,
  buildQrUrl,
  completeWorshipperJoin,
  sendWorshipperMosqueQr,
  sendDawahFriendInvite,
  sendMosqueRegisterInvite,
  sendGeneralBotInvite,
  sendFriendToMosqueInvite,
  MOSQUE_REGISTER_PARAM
} = require('./src/services/inviteService');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const TEST_MOSQUE = 'mosque_invite_test_999';
const ADMIN_ID = '990001';
const USER_A = '990101';
const USER_B = '990102';
const USER_C = '990103';

let passed = 0;
let failed = 0;
let dbBackup;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function makeCtx(userId = ADMIN_ID) {
  const replies = [];
  return {
    from: { id: Number(userId) },
    botInfo: { username: 'TestMasjidBot' },
    reply: async (text) => { replies.push({ type: 'text', text }); },
    replyWithPhoto: async (photo, opts) => {
      replies.push({ type: 'photo', url: photo.url, caption: opts?.caption });
    },
    answerCbQuery: async () => {},
    replies
  };
}

function setupTestMosque() {
  db.saveMosque(TEST_MOSQUE, {
    name: 'مسجد اختبار الدعوة',
    adminId: ADMIN_ID,
    createdBy: ADMIN_ID,
    active: true
  });
  db.saveUser(ADMIN_ID, { role: 'admin', firstName: 'مدير', mosqueId: TEST_MOSQUE });
}

function cleanupTestData() {
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  delete data.mosques[TEST_MOSQUE];
  if (data.mosque_roles?.[TEST_MOSQUE]) delete data.mosque_roles[TEST_MOSQUE];
  for (const uid of [ADMIN_ID, USER_A, USER_B, USER_C, '990999']) {
    delete data.users[uid];
  }
  if (data.joinRequests) {
    for (const [id, req] of Object.entries(data.joinRequests)) {
      if (req.mosqueId === TEST_MOSQUE) delete data.joinRequests[id];
    }
  }
  const code = `join_${TEST_MOSQUE}_worshipper`;
  if (data.inviteCodes?.[code]) delete data.inviteCodes[code];
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function simulateJoin(userId, inviteCode, { age, contactInfo, firstName = 'أحمد' }) {
  const invite = db.getInviteCode(inviteCode);
  return completeWorshipperJoin(userId, {
    inviteCode,
    mosqueId: invite.mosqueId,
    firstName,
    lastName: 'اختبار',
    age,
    contactInfo
  });
}

function worshipperListShowsAge(userId, expectedAge) {
  const user = db.getUser(userId);
  return Boolean(user?.age) && String(user.age) === String(expectedAge);
}

(async () => {
  console.log('=== test_invite_system ===\n');
  dbBackup = fs.readFileSync(DB_FILE, 'utf8');
  cleanupTestData();
  setupTestMosque();

  try {
    console.log('1) worshipperInviteCode ثابت');
    const code1 = db.getOrCreateWorshipperInviteCode(TEST_MOSQUE);
    const code2 = db.getOrCreateWorshipperInviteCode(TEST_MOSQUE);
    const mosque = db.getMosque(TEST_MOSQUE);
    assert(code1 === code2, 'نفس الكود عبر استدعاءين متتاليين');
    assert(mosque.worshipperInviteCode === code1, 'الحقل محفوظ على المسجد');
    assert(code1 === `join_${TEST_MOSQUE}_worshipper`, 'صيغة الكود الثابت صحيحة');
    assert(db.getInviteCode(code1)?.permanent === true, 'الدعوة دائمة (permanent)');

    console.log('\n2أ) انضمام بإدخال العمر والتواصل');
    const joinA = simulateJoin(USER_A, code1, { age: '28', contactInfo: 'test@mail.com' });
    assert(joinA.ok, 'انضمام المستخدم A نجح');
    const userA = db.getUser(USER_A);
    assert(userA?.role === 'worshipper', 'دور A = worshipper');
    assert(String(userA?.mosqueId) === TEST_MOSQUE, 'A مربوط بالمسجد');
    assert(userA?.age === '28', 'العمر محفوظ في user.age');
    assert(userA?.contactInfo === 'test@mail.com', 'التواصل محفوظ في user.contactInfo');
    const pendingA = Object.values(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).joinRequests || {})
      .find(r => r.userId === USER_A);
    assert(!pendingA, 'لا يوجد joinRequests pending');

    console.log('\n2ب) انضمام بتخطّي العمر والتواصل');
    const joinC = simulateJoin(USER_C, code1, { age: null, contactInfo: null, firstName: 'خالد' });
    assert(joinC.ok, 'انضمام المستخدم C بتخطّي الحقول نجح');
    const userC = db.getUser(USER_C);
    assert(userC?.role === 'worshipper', 'دور C = worshipper');
    assert(userC?.age == null || userC?.age === '', 'العمر فارغ بعد التخطّي');
    assert(!userC?.contactInfo, 'التواصل فارغ بعد التخطّي');

    console.log('\n3) نفس الكود لمصلّيين مختلفين');
    const joinB = simulateJoin(USER_B, code1, { age: '35', contactInfo: '+49111' });
    assert(joinB.ok, 'انضمام B بنفس الكود نجح');
    const worshippers = db.getMosqueWorshippers(TEST_MOSQUE);
    assert(worshippers.includes(USER_A) && worshippers.includes(USER_B), 'A و B في القائمة');
    assert(db.getInviteCode(code1)?.used !== true, 'الكود الدائم لم يُعلَّم used');

    console.log('\n4) عرض العمر + طرد');
    assert(worshipperListShowsAge(USER_A, '28'), 'العمر 28 محفوظ ويُعرض من user.age');
    db.kickWorshipperFromMosque(TEST_MOSQUE, USER_A);
    const afterKick = db.getMosqueWorshippers(TEST_MOSQUE);
    assert(!afterKick.includes(USER_A), 'A أُزيل بعد الطرد');
    assert(afterKick.includes(USER_B), 'B ما زال موجوداً');

    console.log('\n5) قائمة دعوة المصلي — 4 أزرار');
    db.saveUser(USER_B, { mosqueId: TEST_MOSQUE, role: 'worshipper' });
    const ctxDawah = makeCtx(USER_B);
    await sendDawahFriendInvite(ctxDawah);
    assert(ctxDawah.replies.some(r => r.type === 'photo'), 'دعوة صديق: QR');
    assert((ctxDawah.replies.find(r => r.type === 'photo')?.caption || '').includes('invite_dawah_'), 'رابط دعوي');
    assert(buildQrUrl('https://t.me/x').includes('qrserver.com'), 'QR صالح');

    const ctxMosque = makeCtx(USER_B);
    await sendWorshipperMosqueQr(ctxMosque, db.getMosque(TEST_MOSQUE));
    assert(ctxMosque.replies.some(r => r.type === 'photo'), 'دعوة أخ: QR');
    assert((ctxMosque.replies.find(r => r.type === 'photo')?.caption || '').includes(code1), 'كود ثابت في QR');

    const ctxNoMosque = makeCtx('990999');
    db.saveUser('990999', { role: 'worshipper' });
    await sendFriendToMosqueInvite(ctxNoMosque);
    assert(ctxNoMosque.replies.some(r => r.type === 'text'), 'بدون مسجد: رسالة توضيحية');

    const ctxReg = makeCtx(USER_B);
    await sendMosqueRegisterInvite(ctxReg);
    assert((ctxReg.replies.find(r => r.type === 'photo')?.caption || '').includes(MOSQUE_REGISTER_PARAM), 'دعوة مسجد');

    const ctxGen = makeCtx(USER_B);
    await sendGeneralBotInvite(ctxGen);
    const genCap = ctxGen.replies.find(r => r.type === 'photo')?.caption || '';
    assert(genCap.includes('t.me/TestMasjidBot'), 'دعوة عامة');
    assert(!genCap.includes('?start='), 'دعوة عامة بلا start');

    console.log('\n6) دعوة المدير/الشيخ — دوال مشتركة');
    const ctxAdmin = makeCtx(ADMIN_ID);
    const r1 = await sendWorshipperMosqueQr(ctxAdmin, db.getMosque(TEST_MOSQUE));
    assert(r1.code === code1, 'مدير: نفس الكود الثابت');
    const ctxAdmin2 = makeCtx(ADMIN_ID);
    await sendMosqueRegisterInvite(ctxAdmin2);
    assert(ctxAdmin2.replies.some(r => r.type === 'photo'), 'مدير: دعوة مسجد QR');

    assert(buildTelegramLink('TestMasjidBot', code1) === `https://t.me/TestMasjidBot?start=${code1}`, 'buildTelegramLink');

    console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  } finally {
    cleanupTestData();
    fs.writeFileSync(DB_FILE, dbBackup);
    console.log('\n🔄 تم استعادة db.json');
  }

  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e);
  if (dbBackup) fs.writeFileSync(DB_FILE, dbBackup);
  process.exit(1);
});

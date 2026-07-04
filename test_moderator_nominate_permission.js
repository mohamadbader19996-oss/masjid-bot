process.env.ACTION_REGISTRY_SILENT = '1';
process.env.DEVELOPER_IDS = '990001';

const db = require('./src/database');
const { canActAsRegionalModerator } = require('./src/services/moderatorService');
const { moderatorNominationInvite } = require('./src/handlers/regionalModerator');

const DEV_ID = '990001';
const MOD_ID = '990201';
const WORSHIPPER_ID = '990301';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function makeCtx(userId) {
  const replies = [];
  return {
    from: { id: Number(userId) },
    botInfo: { username: 'TestBot' },
    reply: async (text) => { replies.push({ type: 'deny', text }); },
    replyWithPhoto: async () => { replies.push({ type: 'qr' }); },
    replies
  };
}

(async () => {
  console.log('=== test_moderator_nominate_permission ===\n');

  db.saveUser(DEV_ID, { id: Number(DEV_ID), role: 'developer', firstName: 'مطور' });
  db.saveUser(MOD_ID, { id: Number(MOD_ID), role: 'moderator', moderatorCountry: 'germany', firstName: 'مشرف' });
  db.saveUser(WORSHIPPER_ID, { id: Number(WORSHIPPER_ID), role: 'worshipper', firstName: 'مصلي' });

  console.log('1) developer — ترشيح مشرف جديد');
  assert(canActAsRegionalModerator(DEV_ID), 'canActAsRegionalModerator: developer');
  assert(canActAsRegionalModerator(db.getUser(DEV_ID)), 'canActAsRegionalModerator: developer user object');
  const ctxDev = makeCtx(DEV_ID);
  await moderatorNominationInvite(ctxDev);
  assert(ctxDev.replies.some(r => r.type === 'qr'), 'developer: يولّد QR (لا رفض)');

  console.log('\n2) worshipper — يجب أن يُرفض');
  assert(!canActAsRegionalModerator(WORSHIPPER_ID), 'canActAsRegionalModerator: worshipper مرفوض');
  const ctxW = makeCtx(WORSHIPPER_ID);
  await moderatorNominationInvite(ctxW);
  assert(ctxW.replies.some(r => r.type === 'deny' && r.text.includes('⛔')), 'worshipper: رسالة رفض');
  assert(!ctxW.replies.some(r => r.type === 'qr'), 'worshipper: لا QR');

  console.log('\n3) moderator فعلي — يبقى يعمل');
  assert(canActAsRegionalModerator(MOD_ID), 'canActAsRegionalModerator: moderator');
  const ctxMod = makeCtx(MOD_ID);
  await moderatorNominationInvite(ctxMod);
  assert(ctxMod.replies.some(r => r.type === 'qr'), 'moderator: يولّد QR');

  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('❌', e);
  process.exit(1);
});

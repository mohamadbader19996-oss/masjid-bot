process.env.ACTION_REGISTRY_SILENT = '1';

const db = require('./src/database');
const { loadDB } = require('./src/utils/db');
const { approveMosqueRequest } = require('./src/handlers/mosqueRequestHandlers');

const REQUEST_ID = 'mosque_req_1782016172914';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function makeCtx() {
  return {
    callbackQuery: { data: `approve_mosque_${REQUEST_ID}`, message: { text: 'test' } },
    answerCbQuery: async () => {},
    editMessageCaption: async () => { throw new Error('no caption'); },
    editMessageText: async () => {},
    reply: async () => {},
    telegram: { sendMessage: async () => {} }
  };
}

(async () => {
  console.log('=== test_mosque_approve ===\n');

  const before = db.getMosqueRequest(REQUEST_ID);
  console.log('request before:', before ? `${before.name} status=${before.status}` : 'missing');

  if (!before || before.status !== 'pending') {
    console.log('⚠️ Request not pending — skipping live approve (already processed or missing)');
    process.exit(before ? 0 : 1);
  }

  const mosquesBefore = Object.keys(loadDB().mosques || {}).length;

  let result;
  try {
    result = await approveMosqueRequest(makeCtx(), REQUEST_ID);
    assert(true, 'approveMosqueRequest completed without exception');
  } catch (e) {
    assert(false, `no exception (got: ${e.message})`);
    console.error(e);
    process.exit(1);
  }

  const afterData = loadDB();
  const afterReq = afterData.mosqueRequests?.[REQUEST_ID];
  const newMosque = result?.mosqueId ? afterData.mosques?.[result.mosqueId] : null;

  assert(afterReq?.status === 'approved', `request status = approved (got ${afterReq?.status})`);
  assert(Boolean(newMosque), 'new mosque entry exists in db.mosques');
  assert(newMosque?.active === true, 'new mosque active === true');
  assert(newMosque?.verified === true, 'new mosque verified === true');
  assert(newMosque?.name === before.name, 'mosque name matches request');
  assert(Object.keys(afterData.mosques || {}).length === mosquesBefore + 1, 'mosques count increased by 1');

  console.log('\nnew mosque:', result.mosqueId, '|', newMosque?.name, '| active:', newMosque?.active);
  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

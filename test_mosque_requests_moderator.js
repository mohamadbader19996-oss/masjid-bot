process.env.ACTION_REGISTRY_SILENT = '1';

const db = require('./src/database');
const { mosqueRequests, showMosqueRequest } = require('./src/handlers/moderator');

const TARGET_ID = 'mosque_req_1782016172914';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function makeCtx() {
  const captured = { replies: [], photos: [] };
  return {
    captured,
    from: { id: 6070771722 },
    answerCbQuery: async () => {},
    reply: async (text, extra) => {
      captured.replies.push({ text, extra });
    },
    replyWithPhoto: async (fileId, extra) => {
      captured.photos.push({ fileId, extra });
    }
  };
}

(async () => {
  console.log('=== test_mosque_requests_moderator ===\n');

  const pending = db.getPendingMosques();
  console.log('getPendingMosques count:', pending.length);
  const ids = pending.map((r) => r.id);
  console.log('ids:', ids.join(', '));

  assert(Array.isArray(pending), 'getPendingMosques returns array');
  assert(pending.length >= 1, 'at least one pending mosque request');
  assert(ids.includes(TARGET_ID), `includes ${TARGET_ID}`);

  const panelCount = db.getPendingMosques().length;
  assert(panelCount === 1, `moderatorPanel counter source = ${panelCount} (expected 1)`);

  const ctxList = makeCtx();
  await mosqueRequests(ctxList);
  assert(ctxList.captured.replies.length === 1, 'mosqueRequests sends one list message');
  const listExtra = ctxList.captured.replies[0].extra;
  const listButtons = listExtra.reply_markup.inline_keyboard.flat();
  const viewButtons = listButtons.filter((b) => b.callback_data.startsWith('mod_mosque_view_'));
  assert(viewButtons.length === 1, 'mosqueRequests list has 1 request button');
  assert(
    viewButtons[0].callback_data === `mod_mosque_view_${TARGET_ID}`,
    'list button opens the real pending request'
  );
  assert(
    ctxList.captured.replies[0].text.includes('(1)'),
    'list header shows count (1)'
  );

  const ctxDetail = makeCtx();
  await showMosqueRequest(ctxDetail, TARGET_ID);
  assert(ctxDetail.captured.replies.length === 1, 'showMosqueRequest sends detail message');
  assert(ctxDetail.captured.photos.length === 2, 'showMosqueRequest sends license + id photos');
  const detailButtons = ctxDetail.captured.replies[0].extra.reply_markup.inline_keyboard.flat();
  assert(
    detailButtons.some((b) => b.callback_data === `approve_mosque_${TARGET_ID}`),
    'approve uses shared approve_mosque_ callback'
  );
  assert(
    detailButtons.some((b) => b.callback_data === `reject_mosque_${TARGET_ID}`),
    'reject uses shared reject_mosque_ callback'
  );
  assert(
    ctxDetail.captured.replies[0].text.includes('محمد'),
    'detail text includes mosque name'
  );

  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

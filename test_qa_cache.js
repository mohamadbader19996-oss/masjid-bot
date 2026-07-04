require('dotenv').config();
process.env.ACTION_REGISTRY_SILENT = '1';

const db = require('./src/database');
const geminiService = require('./src/services/gemini');
const {
  buildQaCacheKey,
  normalizeQuestion,
  getCachedQaAnswer,
  saveQaCacheAnswer
} = require('./src/services/qaCache');
const { askGemini, RELIGIONS } = require('./src/handlers/ai');

let passed = 0;
let failed = 0;
let geminiCallCount = 0;
let originalAskGemini;

function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

function makeUser(overrides = {}) {
  return {
    id: 990001,
    religion: RELIGIONS.MUSLIM,
    madhab: 'hanafi',
    ...overrides
  };
}

function installGeminiMock() {
  geminiCallCount = 0;
  originalAskGemini = geminiService.askGemini;
  geminiService.askGemini = async () => {
    geminiCallCount++;
    return { text: `MOCK_ANSWER_${geminiCallCount}`, model: 'mock-model' };
  };
}

function restoreGeminiMock() {
  if (originalAskGemini) geminiService.askGemini = originalAskGemini;
}

async function testCacheKeyIsolation() {
  const question = 'ما   حكم   الصلاة؟';
  const normalized = normalizeQuestion(question);
  assert(normalized === 'ما حكم الصلاة؟', 'normalizeQuestion collapses spaces');

  const hanafiKey = buildQaCacheKey(question, makeUser({ madhab: 'hanafi' }), 'general');
  const malikiKey = buildQaCacheKey(question, makeUser({ madhab: 'maliki' }), 'general');
  assert(hanafiKey !== malikiKey, 'different madhab → different cache key');

  const spacedKey = buildQaCacheKey('  ما حكم الصلاة؟  ', makeUser({ madhab: 'hanafi' }), 'general');
  assert(spacedKey === hanafiKey, 'trimmed/spaced question shares same key');

  const advancedKey = buildQaCacheKey(question, makeUser(), 'scholar_advanced');
  assert(advancedKey !== hanafiKey, 'scholar_advanced mode → different cache key');
}

async function testRepeatQuestionUsesCache() {
  installGeminiMock();
  db.clearQaCache();

  const user = makeUser();
  const question = 'ما وقت صلاة العصر؟';
  const role = 'worshipper';

  const first = await askGemini(question, user, role, {});
  const callsAfterFirst = geminiCallCount;
  const second = await askGemini(question, user, role, {});

  assert(callsAfterFirst === 1, 'first askGemini calls Gemini once');
  assert(geminiCallCount === 1, 'second askGemini does not call Gemini');
  assert(first === second, 'cached answer matches first answer');
  assert(first === 'MOCK_ANSWER_1', 'first answer from Gemini mock');

  restoreGeminiMock();
}

async function testDifferentMadhabMissesCache() {
  installGeminiMock();
  db.clearQaCache();

  const question = 'ما وقت صلاة العصر؟';
  const role = 'worshipper';

  const hanafiAnswer = await askGemini(question, makeUser({ madhab: 'hanafi' }), role, {});
  const malikiAnswer = await askGemini(question, makeUser({ madhab: 'maliki' }), role, {});

  assert(geminiCallCount === 2, 'different madhab triggers second Gemini call');
  assert(hanafiAnswer !== malikiAnswer, 'different madhab does not share cached answer');

  restoreGeminiMock();
}

async function testSensitiveQuestionSkipsCache() {
  installGeminiMock();
  db.clearQaCache();

  const user = makeUser();
  const question = 'ما حكم الطلاق؟';
  const role = 'worshipper';

  await askGemini(question, user, role, {});
  await askGemini(question, user, role, {});

  assert(geminiCallCount === 2, 'sensitive question bypasses cache (2 Gemini calls)');

  const key = buildQaCacheKey(question, user, 'general');
  assert(!db.getQaCacheEntry(key), 'sensitive question not stored in qa_cache');

  restoreGeminiMock();
}

async function testManualCacheRoundtrip() {
  db.clearQaCache();
  const user = makeUser({ madhab: 'shafii' });
  const question = 'test manual cache';
  saveQaCacheAnswer(question, user, {}, 'STORED_ANSWER');
  const cached = getCachedQaAnswer(question, user, {});
  assert(cached === 'STORED_ANSWER', 'manual save/read roundtrip works');
}

(async () => {
  console.log('=== test_qa_cache ===\n');
  await testCacheKeyIsolation();
  await testManualCacheRoundtrip();
  await testRepeatQuestionUsesCache();
  await testDifferentMadhabMissesCache();
  await testSensitiveQuestionSkipsCache();
  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  restoreGeminiMock();
  console.error('❌', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

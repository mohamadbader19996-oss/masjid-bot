require('dotenv').config();
process.env.ACTION_REGISTRY_SILENT = '1';

const geminiService = require('./src/services/gemini');
const ttsService = require('./src/services/tts');
const db = require('./src/database');
const { normalizeOutgoingArgs, prepareOutgoing } = require('./src/i18n/deviceLocale');
const {
  replyAiAnswer,
  splitReply,
  sendAnswerWithFollowUp,
  handleAiQuestion,
  handleListenAnswer,
  answerKeyboard,
  RELIGIONS
} = require('./src/handlers/ai');
const { handleVoiceQuestion } = require('./src/handlers/voiceHandler');
const { handleImageQuestion } = require('./src/handlers/imageHandler');
const { handleScholarText } = require('./src/handlers/scholar_panel');

const ARABIC_ANSWER = 'الصلاة واجبة على كل مسلم بالغ عاقل. هذا نص جواب من Gemini.';
const GERMAN_ANSWER = 'Das Gebet ist für jeden Muslim verpflichtend.';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function makeCtx(lang = 'de', role = 'worshipper') {
  return {
    from: { id: 999001, language_code: lang },
    chat: { id: 999001 },
    session: lang === 'ar' ? { aiMode: true } : { uiLang: lang, aiMode: true },
    user: { id: 999001, religion: RELIGIONS.MUSLIM, role, madhab: 'hanafi', aiAccepted: true }
  };
}

function wrapReply(ctx) {
  const sent = [];
  const originalSendMessage = async (chatId, text, extra) => {
    const out = await prepareOutgoing(ctx, text, extra);
    sent.push({
      text: out.text,
      skipRequested: extra?.skipTextTranslation === true,
      hasSkipInOut: !('skipTextTranslation' in (out.extra || {}))
    });
    return { message_id: sent.length };
  };
  ctx.reply = async (text, extra) => {
    const { messageText, options } = normalizeOutgoingArgs(text, extra);
    const out = await prepareOutgoing(ctx, messageText, options);
    return originalSendMessage(ctx.chat.id, out.text, out.extra);
  };
  ctx.telegram = {
    sendMessage: originalSendMessage,
    deleteMessage: async () => true,
    getFileLink: async () => ({ href: 'https://example.com/voice.ogg' }),
    getFile: async () => ({ file_path: 'voice/file.ogg' })
  };
  ctx.sent = sent;
  return ctx;
}

function assertArabicPreserved(messages, label) {
  const answerMsgs = messages.filter((m) => m.text.includes('الصلاة') || m.text.includes('واجبة'));
  assert(answerMsgs.length > 0, `${label}: answer message sent`);
  if (answerMsgs.length === 0) return;
  const main = answerMsgs[answerMsgs.length - 1];
  assert(main.text.includes('الصلاة'), `${label}: Arabic preserved`);
  assert(!/Pflicht|Gebet|Muslimen/i.test(main.text), `${label}: no German translation`);
}

async function withMock(fn, mocks) {
  const saved = {};
  for (const [key, fnMock] of Object.entries(mocks)) {
    saved[key] = geminiService[key];
    geminiService[key] = fnMock;
  }
  try {
    await fn();
  } finally {
    for (const [key, orig] of Object.entries(saved)) {
      geminiService[key] = orig;
    }
  }
}

async function testPrepareOutgoingDirect() {
  const ctx = makeCtx('de');
  const withSkip = await prepareOutgoing(ctx, ARABIC_ANSWER, { skipTextTranslation: true });
  const withoutSkip = await prepareOutgoing(ctx, ARABIC_ANSWER, {});
  assert(withSkip.text === ARABIC_ANSWER, 'prepareOutgoing: skip preserves Arabic');
  assert(!('skipTextTranslation' in (withSkip.extra || {})), 'prepareOutgoing: flag stripped from extra');
  assert(withSkip.extra?._uiLocalePrepared === true, 'prepareOutgoing: marks prepared');
  const secondPass = await prepareOutgoing(ctx, withSkip.text, withSkip.extra);
  assert(secondPass.text === ARABIC_ANSWER, 'prepareOutgoing: double-call does not re-translate');
  assert(withoutSkip.text !== ARABIC_ANSWER, 'prepareOutgoing: without skip translates on de device');
}

async function testDoubleWrapLikeBot() {
  const ctx = makeCtx('de');
  const sent = [];
  const sendMessage = async (_chatId, text, extra) => {
    const out = await prepareOutgoing(ctx, text, extra);
    sent.push(out.text);
    return { message_id: sent.length };
  };
  const reply = async (text, extra) => {
    const { messageText, options } = normalizeOutgoingArgs(text, extra);
    const out = await prepareOutgoing(ctx, messageText, options);
    return sendMessage(ctx.chat.id, out.text, out.extra);
  };
  await reply(ARABIC_ANSWER, { skipTextTranslation: true });
  assert(sent.length === 1, 'double wrap: one telegram message');
  assert(sent[0].includes('الصلاة'), 'double wrap: Arabic preserved through ctx.reply + sendMessage');
  assert(!/Pflicht|Gebet/i.test(sent[0]), 'double wrap: not translated to German');
}

async function testSplitReplyShort() {
  const ctx = wrapReply(makeCtx('de'));
  await splitReply(ctx, ARABIC_ANSWER, answerKeyboard(RELIGIONS.MUSLIM));
  assert(ctx.sent.length === 1, 'splitReply short: single message');
  assertArabicPreserved(ctx.sent, 'splitReply short');
}

async function testSplitReplyLong() {
  const ctx = wrapReply(makeCtx('de'));
  const longAnswer = (ARABIC_ANSWER + ' ').repeat(700);
  await splitReply(ctx, longAnswer, answerKeyboard(RELIGIONS.MUSLIM));
  assert(ctx.sent.length > 1, 'splitReply long: multiple parts');
  for (const msg of ctx.sent) {
    assert(!/Pflicht|Gebet/i.test(msg.text), 'splitReply long: no German in parts');
  }
}

async function testSendAnswerWithFollowUpMuslim() {
  const ctx = wrapReply(makeCtx('de'));
  await sendAnswerWithFollowUp(ctx, ARABIC_ANSWER, ctx.user);
  assertArabicPreserved(ctx.sent, 'sendAnswerWithFollowUp muslim');
}

async function testSendAnswerWithFollowUpChristian() {
  const ctx = wrapReply(makeCtx('de'));
  ctx.user.religion = RELIGIONS.CHRISTIAN;
  await sendAnswerWithFollowUp(ctx, ARABIC_ANSWER, ctx.user);
  assertArabicPreserved(ctx.sent, 'sendAnswerWithFollowUp christian');
}

async function testReplyAiAnswer() {
  const ctx = wrapReply(makeCtx('de'));
  await replyAiAnswer(ctx, ARABIC_ANSWER, ctx.user);
  assertArabicPreserved(ctx.sent, 'replyAiAnswer');
}

async function testGermanAnswerPreserved() {
  const ctx = wrapReply(makeCtx('de'));
  await replyAiAnswer(ctx, GERMAN_ANSWER, ctx.user);
  const main = ctx.sent.find((m) => m.text.includes('Gebet') || m.text.includes('Muslim'));
  assert(Boolean(main), 'German answer preserved');
  assert(!/الصلاة|واجبة/i.test(main?.text || ''), 'German answer: not re-translated to Arabic');
}

async function testHandleAiQuestionText() {
  await withMock(async () => {
    const ctx = wrapReply(makeCtx('de'));
    await handleAiQuestion(ctx, 'ما حكم الصلاة؟');
    assertArabicPreserved(ctx.sent, 'handleAiQuestion text');
  }, {
    askGemini: async () => ({ text: ARABIC_ANSWER })
  });
}

async function testHandleAiQuestionScholarAdvanced() {
  await withMock(async () => {
    const ctx = wrapReply(makeCtx('de', 'sheikh'));
    ctx.session.aiScholarAdvancedMode = true;
    await handleAiQuestion(ctx, 'ما حكم الصلاة؟');
    assertArabicPreserved(ctx.sent, 'handleAiQuestion scholar advanced');
  }, {
    askGemini: async () => ({ text: ARABIC_ANSWER })
  });
}

async function testHandleVoiceQuestion() {
  await withMock(async () => {
    const axios = require('axios');
    const origGet = axios.get;
    axios.get = async () => ({ data: Buffer.from('fake-audio') });

    const ctx = wrapReply(makeCtx('de'));
    ctx.message = { voice: { file_id: 'voice123' } };

    try {
      await handleVoiceQuestion(ctx, ctx.user);
      assertArabicPreserved(ctx.sent, 'handleVoiceQuestion');
    } finally {
      axios.get = origGet;
    }
  }, {
    askGeminiAudio: async () => ({
      text: `فهمت_سؤالك: ما حكم الصلاة؟\nالإجابة: ${ARABIC_ANSWER}`
    })
  });
}

async function testHandleImageQuestion() {
  await withMock(async () => {
    const ctx = wrapReply(makeCtx('de'));
    ctx.message = {
      photo: [{ file_id: 'small' }, { file_id: 'large' }],
      caption: 'ما في الصورة؟'
    };

    const https = require('https');
    const origGet = https.get;
    https.get = (_url, _opts, cb) => {
      const res = {
        statusCode: 200,
        on(event, handler) {
          if (event === 'data') handler(Buffer.from('fake-image'));
          if (event === 'end') handler();
        }
      };
      cb(res);
      return { on: () => {} };
    };

    try {
      await handleImageQuestion(ctx, ctx.user);
      assertArabicPreserved(ctx.sent, 'handleImageQuestion');
    } finally {
      https.get = origGet;
    }
  }, {
    askGeminiWithImage: async () => ({ text: ARABIC_ANSWER })
  });
}

async function testHandleScholarText() {
  await withMock(async () => {
    const ctx = wrapReply(makeCtx('de', 'SCHOLAR'));
    db.saveUser(ctx.from.id, {
      id: ctx.from.id,
      role: 'SCHOLAR',
      firstName: 'Test',
      religion: RELIGIONS.MUSLIM
    });
    ctx.session.scholarMode = true;
    ctx.session.scholarDebateMode = 'research';
    ctx.message = { text: 'ما حكم الصلاة؟' };

    const handled = await handleScholarText(ctx);
    assert(handled === true, 'handleScholarText: handled');
    assertArabicPreserved(ctx.sent, 'handleScholarText');
  }, {
    askGemini: async () => ({ text: ARABIC_ANSWER })
  });
}

async function testHandleListenAnswerTtsFallback() {
  const ctx = wrapReply(makeCtx('de'));
  ctx.session.lastAiResponse = ARABIC_ANSWER;
  ctx.answerCbQuery = async () => {};

  const origSpeak = ttsService.speakArabicText;
  ttsService.speakArabicText = async () => {
    throw new Error('TTS unavailable');
  };

  try {
    await handleListenAnswer(ctx);
    const answerMsg = ctx.sent.find((m) => m.text.includes('الصلاة'));
    assert(Boolean(answerMsg), 'handleListenAnswer fallback: answer message sent');
    assert(!/Pflicht|Gebet/i.test(answerMsg?.text || ''), 'handleListenAnswer fallback: Arabic preserved');
  } finally {
    ttsService.speakArabicText = origSpeak;
  }
}

(async () => {
  console.log('=== test_ai_skip_translation (all paths) ===\n');

  await testPrepareOutgoingDirect();
  await testDoubleWrapLikeBot();
  await testSplitReplyShort();
  await testSplitReplyLong();
  await testSendAnswerWithFollowUpMuslim();
  await testSendAnswerWithFollowUpChristian();
  await testReplyAiAnswer();
  await testGermanAnswerPreserved();
  await testHandleAiQuestionText();
  await testHandleAiQuestionScholarAdvanced();
  await testHandleVoiceQuestion();
  await testHandleImageQuestion();
  await testHandleScholarText();
  await testHandleListenAnswerTtsFallback();

  console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${passed} passed, ${failed} failed)`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('\n❌', err.message);
  console.error(err.stack);
  process.exit(1);
});

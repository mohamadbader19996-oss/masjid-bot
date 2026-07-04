const axios = require('axios');
const { Markup } = require('telegraf');
const db = require('../database');
const geminiService = require('../services/gemini');
const { ROLES } = require('../keyboards');
const {
  buildSystemPrompt,
  saveLastAiResponse,
  replyAiAnswer,
  listenAnswerKeyboard,
  answerKeyboard,
  geminiErrorMessage,
  isNonReligiousAnswer,
  NON_RELIGIOUS_REPLY,
  splitReply
} = require('./ai');

async function downloadTelegramAudio(ctx, fileId) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await axios.get(fileLink.href, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  return Buffer.from(response.data);
}

function parseVoiceResponse(text) {
  const match = text.match(/فهمت[_\s]*سؤالك:\s*([\s\S]*?)\n\s*الإجابة:\s*([\s\S]*)/i);
  if (match) {
    return { transcript: match[1].trim(), answer: match[2].trim() };
  }
  return { transcript: null, answer: text };
}

function resolveVoiceContext(ctx, user) {
  let systemInstruction = buildSystemPrompt(user, user.role || ROLES.WORSHIPPER, {});
  let voicePrompt =
    'هذا ملف صوتي - حوّله لنص أولاً ثم أجب على السؤال الديني فيه.\n' +
    'ابدأ ردك بهذا الشكل بالضبط:\n' +
    'فهمت_سؤالك: [النص المحوّل]\n' +
    'الإجابة: [الإجابة الكاملة مع الأدلة]';
  let mode = `voice_${user.role || 'worshipper'}`;

  if (ctx.session?.aiMode) {
    const options = ctx.session.aiScholarAdvancedMode ? { scholarAdvanced: true } : {};
    systemInstruction = buildSystemPrompt(user, user.role, options);
    mode = ctx.session.aiScholarAdvancedMode ? 'voice_scholar_advanced' : 'voice_ai';
    return { systemInstruction, voicePrompt, mode };
  }

  if (ctx.session?.scholarMode || user.role === 'SCHOLAR' || user.role === ROLES.DEVELOPER) {
    systemInstruction = buildSystemPrompt(user, user.role, { scholarAdvanced: true });
    const debate = ctx.session?.scholarDebateMode || 'research';
    mode = `voice_scholar_${debate}`;
    const hints = {
      refute: 'رد على الشبهة في الرسالة الصوتية بالأدلة الشرعية والمنطقية.',
      compare: 'قارن علمياً ما في الرسالة الصوتية مع ذكر المصادر.',
      research: 'أعد بحثاً أكاديمياً موثقاً عن موضوع الرسالة الصوتية.'
    };
    voicePrompt =
      `${hints[debate] || hints.research}\n` +
      'حوّل الصوت لنص أولاً ثم أجب.\n' +
      'ابدأ ردك بهذا الشكل بالضبط:\n' +
      'فهمت_سؤالك: [النص المحوّل]\n' +
      'الإجابة: [الإجابة الكاملة مع الأدلة]';
    return { systemInstruction, voicePrompt, mode };
  }

  if ([ROLES.SHEIKH, ROLES.ADMIN].includes(user.role)) {
    systemInstruction = buildSystemPrompt(user, user.role, { scholarAdvanced: true });
    mode = 'voice_sheikh';
  }

  return { systemInstruction, voicePrompt, mode };
}

async function sendScholarVoiceAnswer(ctx, answer) {
  saveLastAiResponse(ctx, answer);
  const extra = { parse_mode: 'Markdown', ...listenAnswerKeyboard() };
  try {
    await splitReply(ctx, answer, extra);
  } catch {
    await splitReply(ctx, answer, listenAnswerKeyboard());
  }
  if (ctx.session?.scholarMode) {
    delete ctx.session.scholarMode;
    delete ctx.session.scholarDebateMode;
  }
}

async function handleVoiceQuestion(ctx, user) {
  const waitMsg = await ctx.reply('🎤 جاري تحليل رسالتك الصوتية...');
  try {
    const fileId = ctx.message.voice?.file_id || ctx.message.audio?.file_id;
    if (!fileId) {
      await ctx.reply('❌ لم يتم العثور على الملف الصوتي.');
      return;
    }

    const buffer = await downloadTelegramAudio(ctx, fileId);
    const base64 = buffer.toString('base64');
    const mimeType = ctx.message.voice ? 'audio/ogg' : (ctx.message.audio?.mime_type || 'audio/mpeg');

    const { systemInstruction, voicePrompt, mode } = resolveVoiceContext(ctx, user);
    const { text } = await geminiService.askGeminiAudio(base64, mimeType, voicePrompt, systemInstruction);
    const { transcript, answer } = parseVoiceResponse(text);

    ctx.session.aiLastQuestion = transcript || '[رسالة صوتية]';
    if (waitMsg?.message_id) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    }

    if (transcript) {
      await ctx.reply(
        `🎤 *فهمت سؤالك:*\n${transcript}\n\n📖 *الإجابة:*`,
        { parse_mode: 'Markdown' }
      );
    }

    if (isNonReligiousAnswer(answer)) {
      if (ctx.session?.scholarMode) {
        await sendScholarVoiceAnswer(ctx, NON_RELIGIOUS_REPLY);
        return;
      }
      await replyAiAnswer(ctx, NON_RELIGIOUS_REPLY, user);
      return;
    }

    if (ctx.session?.scholarMode) {
      await sendScholarVoiceAnswer(ctx, answer);
      return;
    }

    saveLastAiResponse(ctx, answer);
    await replyAiAnswer(ctx, answer, user);
  } catch (err) {
    console.error('Voice analysis error:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    if (waitMsg?.message_id) {
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    }
    await ctx.reply(geminiErrorMessage(err), answerKeyboard(user?.religion));
  }
}

async function analyzeVoiceNow(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.analyzeVoice = true;
  await ctx.reply('🎤 أعد إرسال رسالتك الصوتية الآن (يمكنك إضافة سؤالك في التعليق)');
}

function register(registry) {
  registry.registerAction('analyze_voice_now', analyzeVoiceNow, 'تحليل رسالة صوتية');
}

module.exports = { register, handleVoiceQuestion, analyzeVoiceNow, downloadTelegramAudio };

const { Markup } = require('telegraf');
const db = require('../database');
const https = require('https');
const geminiService = require('../services/gemini');
const { buildSystemPrompt, saveLastAiResponse, listenAnswerKeyboard } = require('./ai');
const { ROLES } = require('../keyboards');

function cleanFormat(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '*$1*');
}

async function splitReply(ctx, text, extra) {
  const maxLen = 4000;
  const header = '🖼️ *تحليل الصورة:*\n\n';
  const full = header + text;
  if (full.length <= maxLen) {
    return ctx.reply(full, extra);
  }
  await ctx.reply(header, { parse_mode: 'Markdown' });
  let remaining = text;
  const parts = [];
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  for (let i = 0; i < parts.length; i++) {
    await ctx.reply(parts[i], i === parts.length - 1 ? extra : undefined);
  }
}

async function downloadImageAsBase64(ctx, fileId) {
  const file = await ctx.telegram.getFile(fileId);
  const filePath = file.file_path;
  const botToken = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const ext = filePath.split('.').pop().toLowerCase();
        const mimeType = ext === 'png' ? 'image/png'
          : ext === 'webp' ? 'image/webp'
            : 'image/jpeg';
        resolve({ base64, mimeType });
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function safeDeleteWaitMessage(ctx, waitMsg) {
  if (waitMsg?.message_id) {
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
  }
}

function imageErrorMessage(err) {
  const parsed = geminiService.parseGeminiError(err);
  if (parsed.type === 'quota') {
    return '❌ تم تجاوز حد استخدام Gemini. انتظر قليلاً ثم حاول مرة أخرى.';
  }
  if (parsed.type === 'key') {
    return '❌ مفتاح Gemini API غير صالح.';
  }
  if (/HTTP \d{3}/.test(err?.message || '')) {
    return '❌ فشل تحميل الصورة من تيليغرام. أعد إرسالها.';
  }
  if (/UNABLE_TO_VERIFY|certificate|CERT_/i.test(err?.message || '')) {
    return '❌ مشكلة SSL في تحميل الصورة. أعد المحاولة.';
  }
  return '❌ حدث خطأ في تحليل الصورة. حاول مرة أخرى.';
}

function resolveImageContext(ctx, user) {
  let systemInstruction = '';
  let question = ctx.message.caption || 'حلل هذه الصورة وأجب من منظور إسلامي';
  let mode = `image_${user.role || 'worshipper'}`;

  if (ctx.session?.aiMode) {
    const options = ctx.session.aiScholarAdvancedMode ? { scholarAdvanced: true } : {};
    systemInstruction = buildSystemPrompt(user, user.role, options);
    mode = ctx.session.aiScholarAdvancedMode ? 'image_scholar_advanced' : 'image_ai';
    if (ctx.message.caption) {
      question = ctx.message.caption;
    } else {
      question = 'اقرأ هذه الصورة وأجب على ما فيها من منظور إسلامي';
    }
    return { systemInstruction, question, mode };
  }

  if (ctx.session?.scholarMode || user.role === 'SCHOLAR' || user.role === ROLES.DEVELOPER) {
    systemInstruction = buildSystemPrompt(user, user.role, { scholarAdvanced: true });
    mode = `image_scholar_${ctx.session?.scholarDebateMode || 'general'}`;
    if (ctx.session?.scholarDebateMode === 'refute') {
      question = 'رد على ما في هذه الصورة من شبهات بالأدلة الشرعية: ' + (ctx.message.caption || '');
    } else if (ctx.session?.scholarDebateMode === 'compare') {
      question = 'قارن ما في هذه الصورة علمياً من منظور مقارنة الأديان: ' + (ctx.message.caption || '');
    } else if (ctx.session?.scholarDebateMode === 'research') {
      question = 'أعد بحثاً أكاديمياً موثقاً عن ما في هذه الصورة: ' + (ctx.message.caption || '');
    }
    return { systemInstruction, question, mode };
  }

  if ([ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(user.role)) {
    systemInstruction = buildSystemPrompt(user, user.role, { scholarAdvanced: true });
    mode = 'image_sheikh';
    return { systemInstruction, question, mode };
  }

  systemInstruction = buildSystemPrompt(user, user.role || ROLES.WORSHIPPER, {});
  mode = 'image_worshipper';
  return { systemInstruction, question, mode };
}

async function handleImageQuestion(ctx, user) {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];

  const waitMsg = await ctx.reply('🔍 *جارٍ تحليل الصورة...*', {
    parse_mode: 'Markdown'
  });

  try {
    const { base64, mimeType } = await downloadImageAsBase64(ctx, photo.file_id);
    const { systemInstruction, question, mode } = resolveImageContext(ctx, user);

    const result = await geminiService.askGeminiWithImage(
      base64,
      mimeType,
      question,
      systemInstruction,
      {
        userId: ctx.from.id,
        mode
      }
    );

    await safeDeleteWaitMessage(ctx, waitMsg);

    const formatted = cleanFormat(result.text);
    saveLastAiResponse(ctx, formatted);
    const extra = {
      parse_mode: 'Markdown',
      ...listenAnswerKeyboard([
        [Markup.button.callback('📸 أرسل صورة أخرى', 'noop')]
      ])
    };

    try {
      await splitReply(ctx, formatted, extra);
    } catch {
      await splitReply(ctx, formatted, listenAnswerKeyboard([
        [Markup.button.callback('📸 أرسل صورة أخرى', 'noop')]
      ]));
    }

    if (ctx.session?.scholarMode) {
      delete ctx.session.scholarMode;
      delete ctx.session.scholarDebateMode;
    }
  } catch (err) {
    console.error('Image analysis error:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    await safeDeleteWaitMessage(ctx, waitMsg);
    await ctx.reply(imageErrorMessage(err));
  }
}

async function analyzeImageNow(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.analyzeImage = true;
  await ctx.reply('📸 أعد إرسال الصورة مع وصف سؤالك في التعليق (caption)');
}

function register(registry) {
  registry.registerAction('analyze_image_now', analyzeImageNow, 'تحليل صورة');
}

module.exports = { register, handleImageQuestion, analyzeImageNow, downloadImageAsBase64 };

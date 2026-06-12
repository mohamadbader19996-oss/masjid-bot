const { Markup } = require('telegraf');

const db = require('../database');

const geminiService = require('../services/gemini');

const { buildSystemPrompt, saveLastAiResponse, listenAnswerKeyboard } = require('./ai');



async function ackCallback(ctx) {

  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});

}



function canAccess(user) {

  return user && (user.role === 'SCHOLAR' || user.role === 'developer');

}



async function splitReply(ctx, text, extra) {

  const maxLen = 4000;

  if (text.length <= maxLen) {

    return ctx.reply(text, extra);

  }

  const parts = [];

  let remaining = text;

  while (remaining.length > 0) {

    parts.push(remaining.slice(0, maxLen));

    remaining = remaining.slice(maxLen);

  }

  for (let i = 0; i < parts.length; i++) {

    await ctx.reply(parts[i], i === parts.length - 1 ? extra : undefined);

  }

}



function geminiErrorMessage(err) {

  const msg = err?.message || '';

  const parsed = geminiService.parseGeminiError(err);

  if (/GEMINI_API_KEY غير موجود/i.test(msg)) {

    return '❌ GEMINI_API_KEY غير موجود في ملف .env';

  }

  if (parsed.type === 'quota') {

    return '❌ تم تجاوز حد استخدام Gemini API. حاول لاحقاً.';

  }

  if (parsed.type === 'key') {

    return '❌ مفتاح Gemini API غير صالح.';

  }

  if (parsed.type === 'permission') {

    return '❌ صلاحية المفتاح مرفوضة.';

  }

  if (parsed.type === 'network') {

    return '❌ مشكلة اتصال بخوادم Google.';

  }

  if (parsed.type === 'model') {

    return '❌ نماذج Gemini غير متاحة حالياً.';

  }

  console.error('[Scholar] خطأ غير مصنّف:', msg);

  return '❌ حدث خطأ أثناء البحث. حاول لاحقاً.';

}



async function sendScholarAnswer(ctx, answer) {
  saveLastAiResponse(ctx, answer);
  const extra = { parse_mode: 'Markdown', ...listenAnswerKeyboard() };
  try {
    await splitReply(ctx, answer, extra);
  } catch (replyErr) {
    console.error('[Scholar] Markdown reply failed:', replyErr?.message || replyErr);
    await splitReply(ctx, answer, listenAnswerKeyboard());
  }
}



async function scholarCompare(ctx) {

  await ackCallback(ctx);

  const user = db.getUser(ctx.from.id);

  if (!canAccess(user)) return ctx.reply('⛔ غير مصرح لك بالوصول.');

  ctx.session.scholarMode = true;

  ctx.session.scholarDebateMode = 'compare';

  await ctx.reply(

    '📖 *مقارنة الأديان*\n\nاكتب الديانتين أو الموضوع — أو أرسل رسالة صوتية 🎤:',

    {

      parse_mode: 'Markdown',

      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'scholar_debate')]])

    }

  );

}



async function scholarRefute(ctx) {

  await ackCallback(ctx);

  const user = db.getUser(ctx.from.id);

  if (!canAccess(user)) return ctx.reply('⛔ غير مصرح لك بالوصول.');

  ctx.session.scholarMode = true;

  ctx.session.scholarDebateMode = 'refute';

  await ctx.reply(

    '🛡️ *الرد على الشبهات*\n\nأرسل الشبهة نصاً أو صوتاً 🎤:',

    {

      parse_mode: 'Markdown',

      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'scholar_debate')]])

    }

  );

}



async function scholarFreeResearch(ctx) {

  await ackCallback(ctx);

  const user = db.getUser(ctx.from.id);

  if (!canAccess(user)) return ctx.reply('⛔ غير مصرح لك بالوصول.');

  ctx.session.scholarMode = true;

  ctx.session.scholarDebateMode = 'research';

  await ctx.reply(

    '📚 *بحث أكاديمي موثق*\n\nأرسل موضوع البحث نصاً أو صوتاً 🎤:',

    {

      parse_mode: 'Markdown',

      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'scholar_debate')]])

    }

  );

}



async function handleScholarText(ctx) {

  if (!ctx.session.scholarMode) return false;



  const text = ctx.message?.text?.trim();

  if (!text) return false;



  const user = db.getUser(ctx.from.id);

  if (!canAccess(user)) {

    delete ctx.session.scholarMode;

    delete ctx.session.scholarDebateMode;

    return false;

  }



  const mode = ctx.session.scholarDebateMode || 'research';

  const prefixes = {

    compare: 'قارن علمياً وموضوعياً مع ذكر المصادر والمراجع: ',

    refute: 'رد على هذه الشبهة بالأدلة الشرعية والمنطقية: ',

    research: 'أعد بحثاً أكاديمياً موثقاً عن: '

  };

  const question = (prefixes[mode] || '') + text;



  const waitMsg = await ctx.reply('⏳ جاري البحث...');

  try {

    const systemInstruction = buildSystemPrompt(user, user.role, { scholarAdvanced: true });

    const { text: answer } = await geminiService.askGemini(question, systemInstruction, {

      userId: user.id,

      mode: `scholar_${mode}`

    });



    try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

    await sendScholarAnswer(ctx, answer);

  } catch (err) {

    console.error('[Scholar] handleScholarText:', err?.message || err);

    try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

    await ctx.reply(geminiErrorMessage(err));

  }



  delete ctx.session.scholarMode;

  delete ctx.session.scholarDebateMode;

  return true;

}



module.exports = { scholarCompare, scholarRefute, scholarFreeResearch, handleScholarText };



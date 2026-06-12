const { Markup } = require('telegraf');
const db = require('../database');

function cleanFormat(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '*$1*');
}

// ═══ لوحة مراجعة الإجابات ═══
async function reviewAnswersPanel(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!user || user.role !== 'SCHOLAR') return;
  const pending = db.getPendingAIResponses();
  const sensitive = db.getSensitiveAIResponses();
  await ctx.reply(
    `✏️ *مراجعة إجابات الذكاء الاصطناعي*\n\n` +
    `📊 إجابات تنتظر المراجعة: ${pending.length}\n` +
    `⚠️ إجابات حساسة: ${sensitive.length}\n\n` +
    `اختر ما تريد مراجعته:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`⚠️ الحساسة (${sensitive.length})`, 'review_sensitive')],
        [Markup.button.callback(`📋 كل الإجابات (${pending.length})`, 'review_all')],
        [Markup.button.callback('🔙 رجوع', 'scholar_back')]
      ])
    }
  );
}

// ═══ عرض إجابة للمراجعة ═══
async function showResponseForReview(ctx, responses, index) {
  if (!responses || responses.length === 0) {
    return ctx.reply('✅ لا توجد إجابات تحتاج مراجعة الآن.');
  }
  const response = responses[index];
  if (!response) return;
  const total = responses.length;
  const current = index + 1;
  await ctx.reply(
    `📋 *إجابة ${current} من ${total}*\n\n` +
    `❓ *السؤال:*\n${response.question}\n\n` +
    `🤖 *إجابة الذكاء الاصطناعي:*\n${cleanFormat(response.answer)}\n\n` +
    `${response.isSensitive ? '⚠️ موضوع حساس' : ''}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ صحيحة', `review_approve_${response.id}`),
          Markup.button.callback('✏️ تصحيح', `review_correct_${response.id}`)
        ],
        [
          index > 0 ? Markup.button.callback('⬅️ السابقة', `review_prev_${index - 1}`) : Markup.button.callback('·', 'noop'),
          index < total - 1 ? Markup.button.callback('التالية ➡️', `review_next_${index + 1}`) : Markup.button.callback('·', 'noop')
        ],
        [Markup.button.callback('🔙 رجوع', 'scholar_review')]
      ])
    }
  );
}

// ═══ عرض كل الإجابات ═══
async function reviewAll(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const responses = db.getPendingAIResponses();
  ctx.session.reviewResponses = responses;
  ctx.session.reviewIndex = 0;
  await showResponseForReview(ctx, responses, 0);
}

// ═══ عرض الحساسة ═══
async function reviewSensitive(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const responses = db.getSensitiveAIResponses();
  ctx.session.reviewResponses = responses;
  ctx.session.reviewIndex = 0;
  await showResponseForReview(ctx, responses, 0);
}

// ═══ تأكيد صحة إجابة ═══
async function approveResponse(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const responseId = ctx.callbackQuery.data.replace('review_approve_', '');
  db.approveAIResponse(responseId, String(ctx.from.id));
  await ctx.reply('✅ تم تأكيد صحة الإجابة.');
}

// ═══ طلب تصحيح ═══
async function requestCorrection(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const responseId = ctx.callbackQuery.data.replace('review_correct_', '');
  ctx.session.correctingResponseId = responseId;
  await ctx.reply(
    `✏️ *أرسل التصحيح الصحيح:*\n\nسيصل تصحيحك للمصلي مع اسمك.`,
    { parse_mode: 'Markdown' }
  );
}

// ═══ معالج نص التصحيح ═══
async function handleCorrectionText(ctx) {
  const user = db.getUser(ctx.from.id);
  if (!user || user.role !== 'SCHOLAR') return false;
  if (!ctx.session.correctingResponseId) return false;
  const correction = ctx.message.text;
  const responseId = ctx.session.correctingResponseId;
  const response = db.correctAIResponse(
    responseId,
    String(ctx.from.id),
    correction
  );
  if (response) {
    try {
      await ctx.telegram.sendMessage(
        response.userId,
        `✏️ *تصحيح من العالم ${user.fullName || ctx.from.first_name}:*\n\n` +
        `❓ سؤالك: ${response.question}\n\n` +
        `✅ *الإجابة الصحيحة:*\n${correction}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('Error sending correction:', e.message);
    }
    await ctx.reply('✅ تم إرسال التصحيح للمصلي بنجاح!');
  }
  ctx.session.correctingResponseId = null;
  return true;
}

// ═══ تسجيل الأزرار ═══
function register(registry) {
  registry.registerMenu('✏️ مراجعة الإجابات', reviewAnswersPanel, 'مراجعة الإجابات — قائمة');
  registry.registerAction('scholar_review', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await reviewAnswersPanel(ctx);
  }, 'مراجعة الإجابات');
  registry.registerAction('review_all', reviewAll, 'كل الإجابات');
  registry.registerAction('review_sensitive', reviewSensitive, 'الإجابات الحساسة');
  registry.registerAction(/^review_approve_/, approveResponse, 'تأكيد إجابة');
  registry.registerAction(/^review_correct_/, requestCorrection, 'تصحيح إجابة');
  registry.registerAction(/^review_next_/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const index = parseInt(ctx.callbackQuery.data.replace('review_next_', ''));
    await showResponseForReview(ctx, ctx.session.reviewResponses, index);
  }, 'التالية');
  registry.registerAction(/^review_prev_/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const index = parseInt(ctx.callbackQuery.data.replace('review_prev_', ''));
    await showResponseForReview(ctx, ctx.session.reviewResponses, index);
  }, 'السابقة');
}

module.exports = {
  register,
  reviewAnswersPanel,
  handleCorrectionText
};

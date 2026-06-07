const { Markup } = require('telegraf');
const db = require('../database');
const { ROLES } = require('../keyboards');

async function showPendingQuestions(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const questions = db.pendingQuestions();

  if (!questions.length) {
    return ctx.reply('✅ لا توجد أسئلة معلقة حالياً. جزاك الله خيراً!');
  }

  await ctx.reply(
    `💬 *الأسئلة الواردة*\nيوجد ${questions.length} سؤال بانتظار الإجابة:`,
    { parse_mode: 'Markdown' }
  );

  // إظهار أول 10 أسئلة فقط
  for (const q of questions.slice(0, 10)) {
    const date = new Date(q.at).toLocaleDateString('ar-EG');
    await ctx.reply(
      `❓ *${q.askedByName}*\n📅 _${date}_\n\n${q.text}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('💬 إجابة', `answer_${q.id}`)
        ]])
      }
    );
  }

  if (questions.length > 10) {
    await ctx.reply(`_... و ${questions.length - 10} سؤال آخر_`, { parse_mode: 'Markdown' });
  }
}

module.exports = { showPendingQuestions };

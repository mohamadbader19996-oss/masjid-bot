const { Markup } = require('telegraf');
const db = require('../database');

// ═══ بداية التقديم ═══
async function startScholarApply(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  const user = db.getUser(ctx.from.id);

  if (user && (user.role === 'SCHOLAR' || user.role === 'COUNCIL')) {
    return ctx.reply('✅ أنت مسجل بالفعل كعالم معتمد.');
  }

  const pending = db.getPendingScholarApplications();
  const alreadyApplied = pending.find(a => a.userId === String(ctx.from.id));
  if (alreadyApplied) {
    return ctx.reply(
      '⏳ *طلبك قيد المراجعة*\n\nسيتم إشعارك فور البت في طلبك.',
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply(
    `🎓 *التقديم لدرجة عالم معتمد*\n\n` +
    `مرحباً بك في مسار التقديم.\n\n` +
    `*متطلبات القبول:*\n` +
    `📄 هوية رسمية\n` +
    `🎓 شهادة علمية معتمدة\n` +
    `📝 سيرة ذاتية علمية\n` +
    `🕌 اسم المؤسسة المنتسب إليها\n` +
    `🔗 توثيق نشاطك (قناة/موقع/إجازة)\n` +
    `✅ تزكية من عالم معروف\n\n` +
    `هل أنت مستعد للبدء؟`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ نعم، ابدأ التقديم', 'scholar_apply_start')],
        [Markup.button.callback('❌ إلغاء', 'scholar_apply_cancel')]
      ])
    }
  );
}

// ═══ تسجيل الأزرار ═══
function register(registry) {
  registry.registerMenu('🎓 أنا عالم', startScholarApply, 'التقديم كعالم — قائمة');
  registry.registerAction('scholar_apply', startScholarApply, 'التقديم كعالم');
  registry.registerAction('scholar_apply_start', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.scene.enter('scholar_apply_wizard');
  }, 'بدء مشهد التقديم');
  registry.registerAction('scholar_apply_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply('تم الإلغاء. يمكنك التقديم لاحقاً.');
  }, 'إلغاء التقديم');
}

module.exports = { register, startScholarApply };

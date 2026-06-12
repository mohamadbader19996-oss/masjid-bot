const { Markup } = require('telegraf');
const db = require('../database');
const scholarPanelHandlers = require('./scholar_panel');

function cleanFormat(text) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g, '*$1*');
}

async function ackCallback(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
}

// ═══ لوحة العالم الرئيسية ═══
async function scholarPanel(ctx) {
  await ackCallback(ctx);
  const user = db.getUser(ctx.from.id);
  if (!user || (user.role !== 'SCHOLAR' && user.role !== 'developer')) {
    return ctx.reply('⛔ غير مصرح لك بالوصول لهذه اللوحة.');
  }
  await ctx.reply(
    `🎓 *لوحة العالم والمناظر*\n\n` +
    `أهلاً ${cleanFormat(user.fullName || ctx.from.first_name)}\n` +
    `اختر ما تريد:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚔️ أدوات المناظرة', 'scholar_debate')],
        [Markup.button.callback('🕌 إدارة المشايخ', 'scholar_sheikhs')],
        [Markup.button.callback('📬 صندوق الرسائل', 'scholar_inbox')],
        [Markup.button.callback('📊 سجل النزاعات', 'scholar_disputes')],
        [Markup.button.callback('🔙 رجوع', 'scholar_back')]
      ])
    }
  );
}

// ═══ أدوات المناظرة ═══
async function scholarDebate(ctx) {
  await ackCallback(ctx);
  await ctx.reply(
    `⚔️ *أدوات المناظرة المتقدمة*\n\n` +
    `اختر نوع البحث:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📖 مقارنة الأديان', 'scholar_compare_religions')],
        [Markup.button.callback('🛡️ الرد على الشبهات', 'scholar_refute')],
        [Markup.button.callback('📚 بحث أكاديمي موثق', 'scholar_research')],
        [Markup.button.callback('🔙 رجوع', 'scholar_panel')]
      ])
    }
  );
}

// ═══ إدارة المشايخ ═══
async function scholarSheikhs(ctx) {
  await ackCallback(ctx);
  await ctx.reply(
    `🕌 *إدارة المشايخ*\n\n` +
    `اختر الإجراء:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📩 إرسال نصيحة لشيخ', 'scholar_send_advice')],
        [Markup.button.callback('⚠️ إرسال إنذار رسمي', 'scholar_send_warning')],
        [Markup.button.callback('🚨 إحالة للمجلس', 'scholar_escalate')],
        [Markup.button.callback('🔙 رجوع', 'scholar_panel')]
      ])
    }
  );
}

async function comingSoon(ctx) {
  await ackCallback(ctx);
  await ctx.reply('🚧 هذا القسم قيد التطوير — قريباً.');
}

// ═══ تسجيل الأزرار ═══
function register(registry) {
  registry.registerMenu('⚔️ أدوات المناظرة', scholarDebate, 'أدوات المناظرة — قائمة');
  registry.registerMenu('🕌 إدارة المشايخ', scholarSheikhs, 'إدارة المشايخ — قائمة');
  registry.registerMenu('📊 سجل النزاعات', comingSoon, 'سجل النزاعات — قائمة');
  registry.registerMenu('📬 صندوق العالم', comingSoon, 'صندوق العالم — قائمة');
  registry.registerAction('scholar_panel', scholarPanel, 'لوحة العالم');
  registry.registerAction('scholar_debate', scholarDebate, 'أدوات المناظرة');
  registry.registerAction('scholar_sheikhs', scholarSheikhs, 'إدارة المشايخ');
  registry.registerAction('scholar_inbox', comingSoon, 'صندوق رسائل العالم');
  registry.registerAction('scholar_disputes', comingSoon, 'سجل نزاعات العالم');
  registry.registerAction('scholar_back', comingSoon, 'رجوع من لوحة العالم');
  registry.registerAction('scholar_compare_religions', scholarPanelHandlers.scholarCompare, 'مقارنة الأديان');
  registry.registerAction('scholar_refute', scholarPanelHandlers.scholarRefute, 'الرد على الشبهات');
  registry.registerAction('scholar_research', scholarPanelHandlers.scholarFreeResearch, 'بحث أكاديمي');
  registry.registerAction('scholar_send_advice', comingSoon, 'إرسال نصيحة لشيخ');
  registry.registerAction('scholar_send_warning', comingSoon, 'إرسال إنذار لشيخ');
  registry.registerAction('scholar_escalate', comingSoon, 'إحالة للمجلس');
}

module.exports = { register, scholarPanel, scholarDebate, scholarSheikhs };

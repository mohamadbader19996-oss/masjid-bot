const db = require('../database');
const { Markup } = require('telegraf');
const { ROLES } = require('../keyboards');

async function ensureDeveloper(ctx) {
  if (!ctx.from || !db.isDeveloper(ctx.from.id)) {
    await ctx.reply('⛔ ليس لديك صلاحية الوصول إلى هذا القسم.');
    return false;
  }
  return true;
}

async function showStats(ctx) {
  if (!await ensureDeveloper(ctx)) return;

  const users = db.allUsers();
  const mosques = db.allMosques();
  const questions = db.allQuestions();
  const pending = db.pendingQuestions();

  const activeMosques = mosques.filter(m => m.active !== false).length;
  const frozenMosques = mosques.filter(m => m.active === false).length;

  const msg =
    `📊 *إحصائيات المنصة*\n\n` +
    `👥 *المستخدمون:* ${users.length}\n` +
    `🕌 *المساجد:* ${mosques.length} (نشط: ${activeMosques}, موقوف: ${frozenMosques})\n` +
    `❓ *الأسئلة:* ${questions.length} (قيد الانتظار: ${pending.length})\n` +
    `📢 *الإعلانات:* ${db.getAnnouncements(1000).length}`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function listMosques(ctx) {
  if (!await ensureDeveloper(ctx)) return;

  const mosques = db.allMosques();
  if (!mosques.length) {
    return ctx.reply('🕌 لا يوجد مساجد مسجلة حتى الآن.');
  }

  const lines = mosques.map((mosque) => {
    const status = mosque.active === false ? 'موقوف' : 'نشط';
    return `• *${mosque.name || 'مسجد'}* [${mosque.id}]\n  📍 ${mosque.location || 'غير محدد'}\n  الحالة: ${status}`;
  });

  const buttons = mosques.map((mosque) => [
    Markup.button.callback(`🕌 ${mosque.name || mosque.id}`, `manage_mosque_${mosque.id}`)
  ]);

  await ctx.reply(
    `🕌 *قائمة المساجد المسجلة*\n\n${lines.join('\n\n')}\n\nاضغط على مسجد لإدارته:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function enterToggleMosque(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  return ctx.scene.enter('toggle-mosque');
}

async function enterDeleteMosque(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  return ctx.scene.enter('delete-mosque');
}

async function broadcastAnnouncement(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  return ctx.scene.enter('broadcast');
}

module.exports = {
  showStats,
  listMosques,
  enterToggleMosque,
  enterDeleteMosque,
  broadcastAnnouncement
};

const registry = require('../core/actionRegistry');

registry.registerMenu('📊 إحصائيات', showStats, 'إحصائيات المطور');
registry.registerMenu('📡 رسالة جماعية', broadcastAnnouncement, 'رسالة جماعية');
registry.registerMenu('📣 إعلان عام', broadcastAnnouncement, 'إعلان عام');
registry.registerMenu('🕌 قائمة المساجد', listMosques, 'قائمة المساجد');
registry.registerMenu('❄️ تفعيل/تجميد مسجد', enterToggleMosque, 'تفعيل/تجميد مسجد');
registry.registerMenu('🗑️ حذف مسجد', enterDeleteMosque, 'حذف مسجد');

registry.register('dev_panel', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  await ctx.editMessageText(
    '🛡️ *لوحة المطور*\n\nاستخدم أزرار القائمة الرئيسية.',
    { parse_mode: 'Markdown' }
  ).catch(() => showStats(ctx));
}, 'لوحة المطور');

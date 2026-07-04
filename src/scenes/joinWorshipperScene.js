const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const { completeWorshipperJoin } = require('../services/inviteService');

const JOIN_WORSHIPPER_SCENE = 'join_worshipper_scene';

const skipAgeKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('⏭️ تخطّي', 'join_w_skip_age')]]);

const skipContactKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('⏭️ تخطّي', 'join_w_skip_contact')]]);

const joinWorshipperScene = new Scenes.WizardScene(
  JOIN_WORSHIPPER_SCENE,

  // الخطوة 1 — ترحيب + العمر (اختياري)
  async (ctx) => {
    const invite = db.getInviteCode(ctx.session.pendingInviteCode);
    if (!invite || invite.role !== 'worshipper') {
      await ctx.reply('❌ رابط الدعوة غير صالح.');
      return ctx.scene.leave();
    }
    const mosque = db.getAllMosques()[invite.mosqueId];
    if (!mosque) {
      await ctx.reply('❌ المسجد غير موجود.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.invite = invite;
    ctx.wizard.state.mosque = mosque;
    ctx.wizard.state.firstName = ctx.from.first_name || 'مستخدم';
    ctx.wizard.state.lastName = ctx.from.last_name || '';

    await ctx.reply(
      `👋 *أهلاً ${ctx.wizard.state.firstName}*\n` +
      `🕌 *${mosque.name}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📝 *1 من 2*\n\n` +
      `🎂 كم عمرك؟\n` +
      `_(يمكنك الكتابة أدناه أو الضغط على تخطّي)_`,
      { parse_mode: 'Markdown', ...skipAgeKeyboard() }
    );
    return ctx.wizard.next();
  },

  // الخطوة 2 — العمر ثم سؤال التواصل
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'join_w_skip_age') {
      await ctx.answerCbQuery().catch(() => {});
      ctx.wizard.state.age = null;
    } else {
      if (await guardWizardInput(ctx)) return;
      if (!ctx.message?.text) {
        return ctx.reply('⚠️ أرسل عمرك نصاً أو اضغط ⏭️ تخطّي.', skipAgeKeyboard());
      }
      ctx.wizard.state.age = ctx.message.text.trim();
    }

    await ctx.reply(
      `📝 *2 من 2*\n\n` +
      `📱 رقم هاتفك أو بريدك الإلكتروني:\n` +
      `_(أي صيغة — أو اضغط تخطّي)_`,
      { parse_mode: 'Markdown', ...skipContactKeyboard() }
    );
    return ctx.wizard.next();
  },

  // الخطوة 3 — التواصل ثم الانضمام الفوري
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'join_w_skip_contact') {
      await ctx.answerCbQuery().catch(() => {});
      ctx.wizard.state.contactInfo = null;
    } else {
      if (await guardWizardInput(ctx)) return;
      if (!ctx.message?.text) {
        return ctx.reply('⚠️ أرسل رقم هاتف أو بريداً أو اضغط ⏭️ تخطّي.', skipContactKeyboard());
      }
      ctx.wizard.state.contactInfo = ctx.message.text.trim();
    }

    const state = ctx.wizard.state;
    const pending = {
      inviteCode: ctx.session.pendingInviteCode,
      mosqueId: state.invite.mosqueId,
      firstName: state.firstName,
      lastName: state.lastName,
      age: state.age,
      contactInfo: state.contactInfo
    };

    const result = completeWorshipperJoin(ctx.from.id, pending);
    delete ctx.session.pendingInviteCode;

    if (!result.ok) {
      const msgs = {
        invalid_invite: '❌ رابط الدعوة غير صالح.',
        used_invite: '❌ تم استخدام هذا الرابط مسبقاً.',
        mosque_not_found: '❌ المسجد غير موجود.'
      };
      await ctx.reply(msgs[result.error] || '❌ تعذّر إتمام الانضمام.');
      return ctx.scene.leave();
    }

    await ctx.reply(
      `🎉 *مرحباً بك في ${result.mosque.name}!*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ تم انضمامك كمصلٍّ مباشرةً\n` +
      `بارك الله فيك 🤝`,
      { parse_mode: 'Markdown' }
    );
    return ctx.scene.leave();
  }
);

module.exports = { joinWorshipperScene, JOIN_WORSHIPPER_SCENE };

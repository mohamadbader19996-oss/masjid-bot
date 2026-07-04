const { Scenes } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const { buildMuslimCountryKeyboard, parseCountryCallback } = require('../data/muslimCountries');
const { notifyDeveloperModeratorApplication } = require('../services/moderatorService');

const MODERATOR_APPLY_SCENE = 'moderator_apply_scene';
const COUNTRY_PREFIX = 'modapp_country';

const joinModeratorApplyScene = new Scenes.WizardScene(
  MODERATOR_APPLY_SCENE,

  async (ctx) => {
    const firstName = ctx.from.first_name || 'مستخدم';
    ctx.wizard.state.firstName = firstName;
    ctx.wizard.state.lastName = ctx.from.last_name || '';
    ctx.wizard.state.nominatedBy = ctx.session.nominatedBy || null;

    await ctx.reply(
      `🪪 *طلب مشرف إقليمي*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👋 أهلاً *${firstName}*\n\n` +
      `📱 أدخل رقم هاتفك:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل رقم هاتفك نصاً.');
    ctx.wizard.state.phone = ctx.message.text.trim();

    await ctx.reply(
      `🌍 *اختر بلدك:*\n_(من القائمة — لا كتابة حرة)_`,
      { parse_mode: 'Markdown', ...buildMuslimCountryKeyboard(COUNTRY_PREFIX, 0) }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.callbackQuery) {
      const parsed = parseCountryCallback(ctx.callbackQuery.data, COUNTRY_PREFIX);
      await ctx.answerCbQuery().catch(() => {});
      if (parsed?.type === 'page') {
        await ctx.editMessageReplyMarkup(
          buildMuslimCountryKeyboard(COUNTRY_PREFIX, parsed.page).reply_markup
        ).catch(() => {});
        return;
      }
      if (parsed?.type === 'noop') {
        return;
      }
      if (parsed?.type === 'country' && parsed.country) {
        ctx.wizard.state.countryCode = parsed.country.code;
        ctx.wizard.state.countryName = parsed.country.name;
        await ctx.reply(
          `✅ البلد: ${parsed.country.flag} ${parsed.country.name}\n\n` +
          `🪪 *أرسل صورة هويتك*\n` +
          `_(إلزامية — لا يمكن التخطّي)_`,
          { parse_mode: 'Markdown' }
        );
        return ctx.wizard.next();
      }
    }
    if (await guardWizardInput(ctx)) return;
    await ctx.reply(
      '⚠️ اختر بلدك من الأزرار أعلاه.',
      buildMuslimCountryKeyboard(COUNTRY_PREFIX, 0)
    );
  },

  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    let idFileId = null;
    if (ctx.message?.photo) {
      idFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else {
      return ctx.reply('⚠️ أرسل *صورة الهوية* (إلزامية).', { parse_mode: 'Markdown' });
    }

    const state = ctx.wizard.state;
    const userId = String(ctx.from.id);
    const appId = `mod_app_${Date.now()}`;

    const application = db.saveModeratorApplication(appId, {
      userId,
      fullName: `${state.firstName} ${state.lastName}`.trim(),
      phone: state.phone,
      countryCode: state.countryCode,
      country: state.countryName,
      idFileId,
      nominatedBy: state.nominatedBy,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    await notifyDeveloperModeratorApplication(ctx.telegram, application);

    delete ctx.session.nominatedBy;

    await ctx.reply(
      `✅ *تم إرسال طلبك*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⏳ في انتظار موافقة المطوّر\n` +
      `سيصلك إشعار فور القبول أو الرفض 🔔`,
      { parse_mode: 'Markdown' }
    );
    return ctx.scene.leave();
  }
);

module.exports = { joinModeratorApplyScene, MODERATOR_APPLY_SCENE };

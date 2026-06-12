const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const { mainKeyboard, cancelKeyboard, ROLES } = require('../keyboards');

function isCancelled(ctx) {
  const txt = ctx.message?.text;
  return txt === '/cancel' || txt === '❌ إلغاء';
}

async function leaveCancelled(ctx) {
  await ctx.reply('❌ تم إلغاء التقديم.', mainKeyboard(ctx.session.userRole || ROLES.WORSHIPPER));
  return ctx.scene.leave();
}

const scholarApplyScene = new Scenes.WizardScene(
  'scholar_apply_wizard',

  async (ctx) => {
    await ctx.reply(
      '🎓 *التقديم كعالم معتمد*\n\n📝 الخطوة 1/8: أدخل اسمك الكامل:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (isCancelled(ctx)) return leaveCancelled(ctx);
    const fullName = ctx.message?.text?.trim();
    if (!fullName) return ctx.reply('⚠️ يرجى إدخال اسمك الكامل.');
    ctx.wizard.state.fullName = fullName;
    await ctx.reply(`✅ الاسم: *${fullName}*\n\n📖 الخطوة 2/8: أدخل تخصصك العلمي:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (isCancelled(ctx)) return leaveCancelled(ctx);
    const specialization = ctx.message?.text?.trim();
    if (!specialization) return ctx.reply('⚠️ يرجى إدخال التخصص.');
    ctx.wizard.state.specialization = specialization;
    await ctx.reply(`✅ التخصص: *${specialization}*\n\n🎓 الخطوة 3/8: أدخل مؤهلك العلمي:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (isCancelled(ctx)) return leaveCancelled(ctx);
    const qualification = ctx.message?.text?.trim();
    if (!qualification) return ctx.reply('⚠️ يرجى إدخال المؤهل.');
    ctx.wizard.state.qualification = qualification;
    await ctx.reply(`✅ المؤهل: *${qualification}*\n\n🕌 الخطوة 4/8: أدخل المؤسسة المنتسب إليها:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (isCancelled(ctx)) return leaveCancelled(ctx);
    const institution = ctx.message?.text?.trim();
    if (!institution) return ctx.reply('⚠️ يرجى إدخال اسم المؤسسة.');
    ctx.wizard.state.institution = institution;
    await ctx.reply(`✅ المؤسسة: *${institution}*\n\n🌍 الخطوة 5/8: أدخل بلدك:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (isCancelled(ctx)) return leaveCancelled(ctx);
    const country = ctx.message?.text?.trim();
    if (!country) return ctx.reply('⚠️ يرجى إدخال البلد.');
    ctx.wizard.state.country = country;
    await ctx.reply(`✅ البلد: *${country}*\n\n🔗 الخطوة 6/8: أدخل رابط توثيق نشاطك (قناة/موقع/إجازة):`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (isCancelled(ctx)) return leaveCancelled(ctx);
    const documentation = ctx.message?.text?.trim();
    if (!documentation) return ctx.reply('⚠️ يرجى إدخال رابط التوثيق.');
    ctx.wizard.state.documentation = documentation;
    await ctx.reply(`✅ التوثيق: ${documentation}\n\n✅ الخطوة 7/8: أدخل تزكية من عالم معروف (اسمه ووسيلة التواصل):`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  // ═══ الخطوة 7: رقم الهاتف ═══
  async (ctx) => {
    if (ctx.message?.text === '❌ إلغاء التقديم') {
      await ctx.reply('تم الإلغاء.', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (!ctx.wizard.state.data) ctx.wizard.state.data = {};
    ctx.wizard.state.data.recommendation = ctx.message?.text || '';
    await ctx.reply(
      '📞 *الخطوة 7 من 8 — رقم الهاتف*\n\nأرسل رقم هاتفك مع رمز الدولة:\nمثال: +4917612345678',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (ctx.message?.text === '❌ إلغاء التقديم') {
      await ctx.reply('تم الإلغاء.', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isCancelled(ctx)) return leaveCancelled(ctx);

    if (!ctx.wizard.state.data) ctx.wizard.state.data = {};
    ctx.wizard.state.data.phone = ctx.message?.text || '';

    const d = {
      fullName: ctx.wizard.state.fullName,
      specialization: ctx.wizard.state.specialization,
      qualification: ctx.wizard.state.qualification,
      institution: ctx.wizard.state.institution,
      country: ctx.wizard.state.country,
      documentation: ctx.wizard.state.documentation,
      recommendation: ctx.wizard.state.data.recommendation,
      phone: ctx.wizard.state.data.phone
    };

    const reviewMsg =
      `📋 *مراجعة طلبك*\n\n` +
      `👤 الاسم: ${d.fullName}\n` +
      `📖 التخصص: ${d.specialization}\n` +
      `🎓 المؤهل: ${d.qualification}\n` +
      `🕌 المؤسسة: ${d.institution}\n` +
      `🌍 البلد: ${d.country}\n` +
      `🔗 التوثيق: ${d.documentation}\n` +
      `✅ التزكية: ${d.recommendation}\n` +
      `📞 الهاتف: ${d.phone}\n`;

    db.addScholarApplication({
      userId: String(ctx.from.id),
      username: ctx.from.username || '',
      fullName: d.fullName,
      specialization: d.specialization,
      qualification: d.qualification,
      institution: d.institution,
      country: d.country,
      documentation: d.documentation,
      recommendation: d.recommendation,
      phone: d.phone
    });

    const devMsg =
      `🎓 *طلب تقديم عالم جديد*\n\n` +
      `👤 ${d.fullName} (@${ctx.from.username || '—'})\n` +
      `🆔 ${ctx.from.id}\n` +
      `📖 التخصص: ${d.specialization}\n` +
      `🎓 المؤهل: ${d.qualification}\n` +
      `🕌 المؤسسة: ${d.institution}\n` +
      `🌍 البلد: ${d.country}\n` +
      `🔗 التوثيق: ${d.documentation}\n` +
      `✅ التزكية: ${d.recommendation}\n` +
      `📞 الهاتف: ${d.phone}\n`;

    for (const user of db.allUsers()) {
      if (db.isDeveloper(user.id)) {
        try {
          await ctx.telegram.sendMessage(user.id, devMsg, { parse_mode: 'Markdown' });
        } catch (_) {}
      }
    }

    await ctx.reply(reviewMsg, { parse_mode: 'Markdown' });
    await ctx.reply(
      '✅ *تم إرسال طلبك بنجاح!*\n\n⏳ سيتم مراجعة طلبك وإشعارك فور البت فيه.',
      { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole || ROLES.WORSHIPPER) }
    );
    return ctx.scene.leave();
  }
);

module.exports = scholarApplyScene;

const { Scenes, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');

const CAMPAIGN_SCENE = 'campaign_scene';

function buildProgressBar(collected, target) {
  if (!target || target <= 0) return '⬜⬜⬜⬜⬜ 0%';
  const pct = Math.min(100, Math.round((collected / target) * 100));
  const filled = Math.floor(pct / 20);
  const empty = 5 - filled;
  return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` ${pct}%`;
}

function getMosque(userId) {
  const all = db.getAllMosques();
  return Object.values(all).find(m =>
    m.adminId === String(userId) ||
    m.createdBy === parseInt(userId) ||
    m.createdBy === String(userId)
  ) || null;
}

async function broadcastCampaign(ctx, campaignId, state) {
  const campaign = db.getCampaign(campaignId);
  if (!campaign) return;
  const collected = campaign.collectedAmount || 0;
  const bar = buildProgressBar(collected, state.targetAmount);
  const msgText =
    `📢 *حملة تبرع جديدة*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 ${state.mosqueName}\n` +
    `📌 *${state.title}*\n` +
    `📄 ${state.description}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💶 الهدف: ${state.targetAmount}€\n` +
    `💰 تم جمع: ${collected}€\n` +
    `${bar}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💳 للتبرع:\n${campaign.paymentInfo}`;
  const allUsers = db.allUsers ? db.allUsers() : [];
  const allMosques = db.getAllMosques();
  const mosque = allMosques[state.mosqueId];
  let targets = [];
  switch (campaign.scope) {
    case 'mosque':
      // مصلي المسجد فقط
      targets = allUsers.filter(u => u.mosqueId === state.mosqueId);
      break;
    case 'nearby':
      // مصلي المساجد في نفس المدينة
      const nearbyMosques = Object.values(allMosques).filter(m =>
        m.city === mosque?.city && m.id !== state.mosqueId
      );
      const nearbyIds = [state.mosqueId, ...nearbyMosques.map(m => m.id)];
      targets = allUsers.filter(u => nearbyIds.includes(u.mosqueId));
      // إشعار مديري المساجد المجاورة للموافقة
      for (const nm of nearbyMosques) {
        const adminId = nm.adminId || nm.createdBy;
        if (!adminId) continue;
        try {
          await ctx.telegram.sendMessage(
            adminId,
            `🔔 *طلب نشر حملة تبرع*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `🕌 ${state.mosqueName}\n` +
            `📌 ${state.title}\n` +
            `💶 ${state.targetAmount}€\n\n` +
            `هل توافق على نشرها لمصلي مسجدك؟`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ موافق', callback_data: `approve_campaign_nearby_${campaignId}_${nm.id}` },
                  { text: '❌ رفض', callback_data: `reject_campaign_nearby_${campaignId}_${nm.id}` }
                ]]
              }
            }
          );
        } catch (e) {}
      }
      // نشر لمصلي نفس المسجد فوراً فقط
      targets = allUsers.filter(u => u.mosqueId === state.mosqueId);
      break;
    case 'country':
      // كل مساجد الدولة — تحتاج موافقة مشرف (تم التعامل معها مسبقاً)
      const countryMosques = Object.values(allMosques).filter(m =>
        m.country === mosque?.country
      );
      const countryIds = countryMosques.map(m => m.id);
      targets = allUsers.filter(u => countryIds.includes(u.mosqueId));
      break;
    case 'global':
      // كل المستخدمين
      targets = allUsers;
      break;
    default:
      targets = allUsers.filter(u => u.mosqueId === state.mosqueId);
  }
  // إرسال للمستهدفين
  let sent = 0;
  for (const user of targets) {
    try {
      await ctx.telegram.sendMessage(user.id, msgText, { parse_mode: 'Markdown' });
      sent++;
    } catch (e) {}
  }
  return sent;
}

const campaignScene = new Scenes.WizardScene(
  CAMPAIGN_SCENE,

  // الخطوة 1 — عنوان الحملة
  async (ctx) => {
    const userId = String(ctx.from.id);
    const mosque = getMosque(userId);
    if (!mosque) return ctx.reply('⚠️ لم يتم ربطك بمسجد. تواصل مع المشرف.');
    ctx.wizard.state.mosqueId = mosque.id;
    ctx.wizard.state.mosqueName = mosque.name;
    ctx.wizard.state.mosqueCountry = mosque.country || 'ألمانيا';
    ctx.wizard.state.mosqueCity = mosque.city || '';
    // تحقق من معلومات الدفع
    const hasIban = !!mosque.iban;
    const hasPaypal = !!mosque.paypal;
    if (!hasIban && !hasPaypal) {
      ctx.wizard.state.settingUpPayment = true;
      await ctx.reply(
        `💳 *إعداد معلومات الدفع*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ لم يتم إعداد معلومات الدفع بعد\n` +
        `يجب إعدادها مرة واحدة فقط وستُستخدم في كل حملاتك\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `أدخل رقم IBAN المسجد:\n_(أو أرسل "تخطي" إذا لم يكن لديك)_`,
        { parse_mode: 'Markdown' }
      );
      return ctx.wizard.next();
    }
    // لديه معلومات دفع — ابدأ الحملة مباشرة
    await ctx.reply(
      `🚀 *إطلاق حملة تبرع جديدة*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🕌 ${mosque.name}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📝 خطوة 1 من 5\n\n` +
      `✍️ أدخل عنوان الحملة:\n_(مثال: ترميم سقف المسجد)_`,
      { parse_mode: 'Markdown' }
    );
    ctx.wizard.state.skipPaymentSetup = true;
    return ctx.wizard.next();
  },

  // الخطوة 2 — إعداد الدفع أو عنوان الحملة
  async (ctx) => {
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً.');
    // إذا كان يعبئ معلومات الدفع
    if (ctx.wizard.state.settingUpPayment && !ctx.wizard.state.ibanDone) {
      const iban = ctx.message.text.trim();
      if (iban.toLowerCase() !== 'تخطي') {
        ctx.wizard.state.newIban = iban;
      }
      ctx.wizard.state.ibanDone = true;
      await ctx.reply(
        `✅ تم حفظ IBAN\n\n` +
        `💙 الآن أدخل رابط PayPal:\n_(أو أرسل "تخطي")_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    if (ctx.wizard.state.settingUpPayment && ctx.wizard.state.ibanDone && !ctx.wizard.state.paypalDone) {
      const paypal = ctx.message.text.trim();
      if (paypal.toLowerCase() !== 'تخطي') {
        ctx.wizard.state.newPaypal = paypal;
      }
      ctx.wizard.state.paypalDone = true;
      // حفظ في db
      const dbPath = require('path').join(__dirname, '../../data/db.json');
      const dbData = JSON.parse(require('fs').readFileSync(dbPath));
      if (dbData.mosques[ctx.wizard.state.mosqueId]) {
        if (ctx.wizard.state.newIban) dbData.mosques[ctx.wizard.state.mosqueId].iban = ctx.wizard.state.newIban;
        if (ctx.wizard.state.newPaypal) dbData.mosques[ctx.wizard.state.mosqueId].paypal = ctx.wizard.state.newPaypal;
        require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
      }
      ctx.wizard.state.settingUpPayment = false;
      await ctx.reply(
        `✅ *تم حفظ معلومات الدفع!*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🏦 IBAN: ${ctx.wizard.state.newIban || 'غير محدد'}\n` +
        `💙 PayPal: ${ctx.wizard.state.newPaypal || 'غير محدد'}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `الآن نبدأ إنشاء الحملة!\n\n` +
        `📝 خطوة 1 من 5\n\n` +
        `✍️ أدخل عنوان الحملة:`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    // عنوان الحملة
    ctx.wizard.state.title = ctx.message.text.trim();
    await ctx.reply(
      `📝 خطوة 2 من 5\n\n` +
      `📄 اكتب وصفاً للحملة:\n_(لماذا تحتاج هذا التبرع؟)_`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 3 — المبلغ المستهدف
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً فقط.');
    ctx.wizard.state.description = ctx.message.text.trim();
    await ctx.reply(
      `📝 *خطوة 3 من 5*\n\n` +
      `💶 أدخل المبلغ المستهدف باليورو:\n_(مثال: 5000)_`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 4 — نطاق النشر
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    const raw = ctx.message?.text?.trim().replace(',', '.');
    const targetAmount = parseFloat(raw);
    if (!targetAmount || Number.isNaN(targetAmount) || targetAmount <= 0) {
      return ctx.reply('⚠️ أدخل مبلغاً صحيحاً.');
    }
    ctx.wizard.state.targetAmount = targetAmount;
    await ctx.reply(
      `📝 *خطوة 4 من 5*\n\n` +
      `📡 اختر نطاق نشر الحملة:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🕌 مسجدي فقط', 'scope_mosque')],
          [Markup.button.callback('🏘️ المساجد المجاورة', 'scope_nearby')],
          [Markup.button.callback('🇩🇪 كل الدولة', 'scope_country')],
          [Markup.button.callback('🌍 كل المنصة', 'scope_global')]
        ])
      }
    );
    return ctx.wizard.next();
  },

  // الخطوة 5 — معلومات الدفع
  async (ctx) => {
    if (!ctx.callbackQuery) return ctx.reply('⚠️ اختر نطاق النشر من الأزرار.');
    await ctx.answerCbQuery().catch(() => {});
    ctx.wizard.state.scope = ctx.callbackQuery.data.replace('scope_', '');
    const needsApproval = ['country', 'global'].includes(ctx.wizard.state.scope);
    const scopeLabels = {
      mosque: '🕌 مصلي المسجد',
      nearby: '📍 المساجد المجاورة',
      country: `🌍 كل مساجد ${ctx.wizard.state.mosqueCountry}`,
      global: '🌐 كل التطبيق'
    };
    const allMosques = db.getAllMosques();
    const mosque = allMosques[ctx.wizard.state.mosqueId];
    const iban = mosque?.iban || null;
    const paypal = mosque?.paypal || null;
    if (iban || paypal) {
      ctx.wizard.state.paymentInfo = iban
        ? `IBAN: ${iban}` + (paypal ? `\nPayPal: ${paypal}` : '')
        : `PayPal: ${paypal}`;
      const buttons = [];
      if (iban && paypal) {
        buttons.push([Markup.button.callback(`🏦💙 IBAN + PayPal معاً`, 'pay_both')]);
      }
      if (iban) buttons.push([Markup.button.callback(`🏦 IBAN فقط: ${iban.slice(0,10)}...`, 'pay_iban')]);
      if (paypal) buttons.push([Markup.button.callback(`💙 PayPal فقط`, 'pay_paypal')]);
      buttons.push([Markup.button.callback('✍️ أدخل معلومات أخرى', 'pay_manual')]);
      await ctx.reply(
        `📝 خطوة 5 من 5\n\n` +
        `📡 النطاق: ${scopeLabels[ctx.wizard.state.scope]}\n\n` +
        `💳 اختر طريقة الدفع للحملة:\n` +
        `${needsApproval ? '⚠️ يحتاج موافقة المشرف' : '✅ سيُنشر فوراً'}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        }
      );
    } else {
      await ctx.reply(
        `📝 خطوة 5 من 5\n\n` +
        `📡 النطاق: ${scopeLabels[ctx.wizard.state.scope]}\n\n` +
        `💳 أدخل معلومات الدفع:\n_(IBAN أو رابط PayPal)_\n\n` +
        `💡 _لحفظ IBAN دائماً اذهب لإعدادات المسجد_\n\n` +
        `${needsApproval ? '⚠️ يحتاج موافقة المشرف' : '✅ سيُنشر فوراً'}`,
        { parse_mode: 'Markdown' }
      );
    }
    return ctx.wizard.next();
  },

  // الخطوة النهائية — إرسال الطلب
  async (ctx) => {
    let paymentInfo = ctx.wizard.state.paymentInfo || null;
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery().catch(() => {});
      const data = ctx.callbackQuery.data;
      const allMosques = db.getAllMosques();
      const mosque = allMosques[ctx.wizard.state.mosqueId];
      if (data === 'pay_iban') {
        paymentInfo = `🏦 IBAN: ${mosque?.iban}`;
      } else if (data === 'pay_paypal') {
        paymentInfo = `💙 PayPal: ${mosque?.paypal}`;
      } else if (data === 'pay_both') {
        paymentInfo = `🏦 IBAN: ${mosque?.iban}\n💙 PayPal: ${mosque?.paypal}`;
      } else if (data === 'pay_manual') {
        await ctx.reply('✍️ أدخل معلومات الدفع يدوياً:');
        ctx.wizard.state.waitingPayment = true;
        return;
      }
    } else if (ctx.message?.text) {
      paymentInfo = ctx.message.text.trim();
    }
    if (!paymentInfo) return ctx.reply('⚠️ أرسل معلومات الدفع.');
    ctx.wizard.state.paymentInfo = paymentInfo;

    const state = ctx.wizard.state;
    const campaignId = db.createCampaign(state.mosqueId, {
      title: state.title,
      description: state.description,
      targetAmount: state.targetAmount,
      scope: state.scope
    });

    const dbPath = path.join(__dirname, '../../data/db.json');
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (dbData.campaigns?.[campaignId]) {
      dbData.campaigns[campaignId].status = 'pending';
      dbData.campaigns[campaignId].paymentInfo = state.paymentInfo;
      dbData.campaigns[campaignId].collectedAmount = 0;
      dbData.campaigns[campaignId].manualEntries = [];
      fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    }

    const scopeLabels = {
      mosque: 'مسجدي فقط',
      nearby: 'المساجد المجاورة',
      country: 'كل الدولة',
      global: 'كل المنصة'
    };

    const notifText =
      `💰 *طلب حملة تبرع جديدة*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🕌 ${state.mosqueName}\n` +
      `📌 ${state.title}\n` +
      `📝 ${state.description}\n` +
      `💶 ${state.targetAmount}€\n` +
      `📡 النطاق: ${scopeLabels[state.scope] || state.scope}\n` +
      `💳 ${state.paymentInfo}`;

    const approveButtons = {
      inline_keyboard: [[
        { text: '✅ موافقة ونشر', callback_data: `approve_campaign_${campaignId}` },
        { text: '❌ رفض', callback_data: `reject_campaign_${campaignId}` }
      ]]
    };

    const developers = db.allUsers().filter(u => u.role === 'developer');
    const moderators = db.getModerators ? db.getModerators() : [];
    const notifyIds = [
      ...developers.map(u => String(u.id)),
      ...moderators.map(m => String(m.userId))
    ];

    for (const adminId of [...new Set(notifyIds)]) {
      try {
        await ctx.telegram.sendMessage(adminId, notifText, {
          parse_mode: 'Markdown',
          reply_markup: approveButtons
        });
      } catch (e) {}
    }

    await ctx.reply(
      `✅ *تم إرسال طلب الحملة!*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📌 ${state.title}\n` +
      `⏳ في انتظار موافقة الإدارة\n` +
      `سيصلك إشعار فور الموافقة 🔔`,
      { parse_mode: 'Markdown' }
    );
    return ctx.scene.leave();
  }
);

module.exports = { campaignScene, CAMPAIGN_SCENE, broadcastCampaign, buildProgressBar };

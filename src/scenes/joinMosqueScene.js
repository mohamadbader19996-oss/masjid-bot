const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const fs = require('fs');
const path = require('path');

const JOIN_SCENE = 'join_mosque_scene';

const roleLabels = {
  religious: '👨‍🏫 مدير ديني',
  finance: '💰 مدير مالية',
  logistics: '🔧 مدير لوجستك',
  state: '🤝 مسؤول الدولة',
  khatib: '🎤 خطيب جمعة',
  muadhin: '🔊 مؤذن',
  quran_teacher: '📖 مدرس قرآن',
  hifz_teacher: '📚 معلم تحفيظ',
  general: '🧑‍🏫 معلم عام',
  worshipper: '🙏 مصلي'
};

const sheikhRoles = ['khatib', 'muadhin', 'quran_teacher', 'hifz_teacher', 'general'];

function saveJoinRequest(data) {
  const dbPath = path.join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(fs.readFileSync(dbPath));
  if (!dbData.joinRequests) dbData.joinRequests = {};
  dbData.joinRequests[data.id] = data;
  fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
}

function getJoinRequest(id) {
  const dbPath = path.join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(fs.readFileSync(dbPath));
  return dbData.joinRequests?.[id] || null;
}

function updateJoinRequest(id, updates) {
  const dbPath = path.join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(fs.readFileSync(dbPath));
  if (dbData.joinRequests?.[id]) {
    dbData.joinRequests[id] = { ...dbData.joinRequests[id], ...updates };
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  }
}

const joinMosqueScene = new Scenes.WizardScene(
  JOIN_SCENE,

  // الخطوة 1 — الاسم الكامل
  async (ctx) => {
    const invite = db.getInviteCode(ctx.session.pendingInviteCode);
    if (!invite) {
      await ctx.reply('❌ رابط الدعوة غير صالح.');
      return ctx.scene.leave();
    }
    const mosque = db.getAllMosques()[invite.mosqueId];
    ctx.wizard.state.invite = invite;
    ctx.wizard.state.mosque = mosque;
    await ctx.reply(
      `👋 *أهلاً بك في ${mosque.name}*\n` +
      `🎭 الدور: ${roleLabels[invite.role]}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📝 *خطوة 1 من 7*\n\n` +
      `✍️ أدخل اسمك الكامل:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 2 — العمر
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً فقط.');
    ctx.wizard.state.fullName = ctx.message.text.trim();
    await ctx.reply(
      `📝 *خطوة 2 من 7*\n\n` +
      `🎂 كم عمرك؟`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 3 — مدينة السكن
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً فقط.');
    ctx.wizard.state.age = ctx.message.text.trim();
    await ctx.reply(
      `📝 *خطوة 3 من 7*\n\n` +
      `📍 في أي مدينة تسكن؟`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 4 — رقم الهاتف
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً فقط.');
    ctx.wizard.state.city = ctx.message.text.trim();
    await ctx.reply(
      `📝 *خطوة 4 من 7*\n\n` +
      `📱 رقم هاتفك:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 5 — اللغات
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً فقط.');
    ctx.wizard.state.phone = ctx.message.text.trim();
    ctx.wizard.state.languages = [];
    await ctx.reply(
      `📝 *خطوة 5 من 7*\n\n` +
      `🌍 اختر اللغات التي تتحدثها:\n` +
      `_(يمكنك اختيار أكثر من واحدة ثم اضغط "تم")_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🇸🇦 العربية', 'lang_ar'), Markup.button.callback('🇩🇪 الألمانية', 'lang_de')],
          [Markup.button.callback('🇹🇷 التركية', 'lang_tr'), Markup.button.callback('🇵🇰 الأردية', 'lang_ur')],
          [Markup.button.callback('🇬🇧 الإنجليزية', 'lang_en'), Markup.button.callback('🇫🇷 الفرنسية', 'lang_fr')],
          [Markup.button.callback('🇳🇱 الهولندية', 'lang_nl'), Markup.button.callback('🇧🇩 البنغالية', 'lang_bn')],
          [Markup.button.callback('➕ أضف لغة أخرى', 'lang_custom')],
          [Markup.button.callback('✅ تم الاختيار', 'lang_done')]
        ])
      }
    );
    return ctx.wizard.next();
  },

  // الخطوة 6 — نبذة قصيرة
  async (ctx) => {
    if (ctx.message?.text && ctx.wizard.state.waitingCustomLang) {
      if (await guardWizardInput(ctx)) return;
      const customLang = ctx.message.text.trim();
      ctx.wizard.state.languages.push(customLang);
      ctx.wizard.state.waitingCustomLang = false;
      const selected = ctx.wizard.state.languages.join(', ');
      await ctx.reply(
        `✅ أضفت: ${customLang}\nاللغات المختارة: ${selected}\nاختر المزيد أو اضغط "تم"`,
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ أضف لغة أخرى', 'lang_custom')],
            [Markup.button.callback('✅ تم الاختيار', 'lang_done')]
          ])
        }
      );
      return;
    }
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      await ctx.answerCbQuery().catch(() => {});
      if (data === 'lang_custom') {
        ctx.wizard.state.waitingCustomLang = true;
        await ctx.reply('✍️ اكتب اسم اللغة التي تتحدثها:');
        return;
      }
      if (data === 'lang_done') {
        await ctx.reply(
          `📝 *خطوة 6 من 7*\n\n` +
          `✏️ اكتب نبذة قصيرة عن نفسك\n` +
          `_(جملة أو جملتان يراها المصلون)_`,
          { parse_mode: 'Markdown' }
        );
        return ctx.wizard.next();
      }
      if (data.startsWith('lang_') && data !== 'lang_done') {
        const lang = data.replace('lang_', '');
        if (!ctx.wizard.state.languages.includes(lang)) {
          ctx.wizard.state.languages.push(lang);
        }
        const langNames = { ar: '🇸🇦 العربية', de: '🇩🇪 الألمانية', tr: '🇹🇷 التركية', ur: '🇵🇰 الأردية', en: '🇬🇧 الإنجليزية', fr: '🇫🇷 الفرنسية', nl: '🇳🇱 الهولندية', bn: '🇧🇩 البنغالية' };
        const selected = ctx.wizard.state.languages.map(l => langNames[l] || l).join(', ');
        await ctx.reply(`✅ تم اختيار: ${selected}\nاختر المزيد أو اضغط "تم"`);
        return;
      }
    }
    if (await guardWizardInput(ctx)) return;
    await ctx.reply(
      `📝 *خطوة 6 من 7*\n\n` +
      `✏️ اكتب نبذة قصيرة عن نفسك\n` +
      `_(جملة أو جملتان يراها المصلون)_`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // الخطوة 7 — التخصص للمشايخ / صورة شخصية للكل
  async (ctx) => {
    if (await guardWizardInput(ctx)) return;
    if (!ctx.message?.text) return ctx.reply('⚠️ أرسل نصاً فقط.');
    ctx.wizard.state.bio = ctx.message.text.trim();
    const isSheikhRole = sheikhRoles.includes(ctx.wizard.state.invite?.role);
    if (isSheikhRole) {
      await ctx.reply(
        `📝 *خطوة 7 من 7*\n\n` +
        `📚 ما تخصصك العلمي؟`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📖 فقه', 'spec_fiqh'), Markup.button.callback('📜 تفسير', 'spec_tafsir')],
            [Markup.button.callback('📿 عقيدة', 'spec_aqida'), Markup.button.callback('🎙️ خطابة', 'spec_khitaba')],
            [Markup.button.callback('📚 تحفيظ', 'spec_hifz'), Markup.button.callback('🔤 تجويد', 'spec_tajweed')],
            [Markup.button.callback('🌐 عام', 'spec_general')]
          ])
        }
      );
    } else {
      await ctx.reply(
        `📝 *خطوة 7 من 7*\n\n` +
        `📸 أرسل صورة شخصية _(اختياري)_\n` +
        `أو اضغط تخطي`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⏭️ تخطي', 'skip_photo')]
          ])
        }
      );
    }
    return ctx.wizard.next();
  },

  // الخطوة النهائية — إرسال الطلب
  async (ctx) => {
    const specLabels = { fiqh: 'فقه', tafsir: 'تفسير', aqida: 'عقيدة', khitaba: 'خطابة', hifz: 'تحفيظ', tajweed: 'تجويد', general: 'عام' };

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery().catch(() => {});
      const data = ctx.callbackQuery.data;
      if (data.startsWith('spec_')) {
        ctx.wizard.state.specialization = specLabels[data.replace('spec_', '')] || 'عام';
      } else if (data === 'skip_photo') {
        ctx.wizard.state.photoId = null;
      }
    } else if (ctx.message?.photo) {
      ctx.wizard.state.photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message?.text) {
      ctx.wizard.state.photoId = null;
    }

    const state = ctx.wizard.state;
    const invite = state.invite;
    const mosque = state.mosque;
    const userId = String(ctx.from.id);

    const requestId = `req_${Date.now()}`;

    const langNames = { ar: '🇸🇦 العربية', de: '🇩🇪 الألمانية', tr: '🇹🇷 التركية', ur: '🇵🇰 الأردية', en: '🇬🇧 الإنجليزية', fr: '🇫🇷 الفرنسية' };
    const langsText = (state.languages || []).map(l => langNames[l]).join(', ') || 'غير محدد';

    saveJoinRequest({
      id: requestId,
      userId,
      mosqueId: invite.mosqueId,
      role: invite.role,
      fullName: state.fullName,
      age: state.age,
      city: state.city,
      phone: state.phone,
      languages: state.languages || [],
      bio: state.bio,
      specialization: state.specialization || null,
      photoId: state.photoId || null,
      inviteCode: ctx.session.pendingInviteCode,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    const notifText =
      `🔔 *طلب انضمام جديد*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 الاسم: ${state.fullName}\n` +
      `🎂 العمر: ${state.age}\n` +
      `📍 المدينة: ${state.city}\n` +
      `📱 الهاتف: ${state.phone}\n` +
      `🌍 اللغات: ${langsText}\n` +
      `💬 نبذة: ${state.bio}\n` +
      `🎭 الدور: ${roleLabels[invite.role]}\n` +
      (state.specialization ? `📚 التخصص: ${state.specialization}\n` : '') +
      `🕌 المسجد: ${mosque.name}`;

    const approveButtons = {
      inline_keyboard: [[
        { text: '✅ قبول', callback_data: `approve_join_${requestId}` },
        { text: '❌ رفض', callback_data: `reject_join_${requestId}` }
      ]]
    };

    try {
      const adminId = mosque.adminId || mosque.createdBy;
      if (state.photoId) {
        await ctx.telegram.sendPhoto(adminId, state.photoId, {
          caption: notifText,
          parse_mode: 'Markdown',
          reply_markup: approveButtons
        });
      } else {
        await ctx.telegram.sendMessage(adminId, notifText, {
          parse_mode: 'Markdown',
          reply_markup: approveButtons
        });
      }
    } catch (e) {}

    db.markInviteUsed(ctx.session.pendingInviteCode);

    await ctx.reply(
      `✅ *تم إرسال طلبك بنجاح!*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⏳ في انتظار موافقة مدير المسجد\n` +
      `سيصلك إشعار فور القبول أو الرفض 🔔`,
      { parse_mode: 'Markdown' }
    );

    return ctx.scene.leave();
  }
);

module.exports = { joinMosqueScene, JOIN_SCENE, getJoinRequest, updateJoinRequest };

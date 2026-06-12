require('dotenv').config();
const { Telegraf, Scenes, session, Composer } = require('telegraf');
const { Markup } = require('telegraf');
const { SceneContextScene } = require('telegraf/scenes');
const db = require('./database');
const {
  mainKeyboard,
  ROLES,
  CANCEL_BUTTON,
  isMenuButton,
  resetUserState
} = require('./keyboards');
require('./core/loadHandlers');
const registry = require('./core/actionRegistry');
const { dispatchMenuButton } = require('./menuHandlers');
const { scenes } = require('./scenes');
const { handleStart } = require('./handlers/start');
const quran = require('./handlers/quran');
const ai = require('./handlers/ai');
const { handleCorrectionText, reviewAnswersPanel } = require('./handlers/scholar_review');
const { handleImageQuestion } = require('./handlers/imageHandler');
const { handleVoiceQuestion } = require('./handlers/voiceHandler');

const bot = new Telegraf(process.env.BOT_TOKEN);
const SCENE_TTL_SECONDS = 30 * 60;
const stage = new Scenes.Stage(scenes, { ttl: SCENE_TTL_SECONDS });

bot.use(session({ defaultSession: () => ({}) }));

bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    console.log(`🔘 Button pressed: ${ctx.callbackQuery.data} by ${ctx.from?.id}`);
  }
  return next();
});

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const userId = ctx.from.id;
  const isDev = db.isDeveloper(userId);
  let user = db.getUser(userId);
  if (!user) {
    user = db.saveUser(userId, {
      id: userId,
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      role: isDev ? ROLES.DEVELOPER : ROLES.WORSHIPPER,
      joinedAt: new Date().toISOString()
    });
  } else if (isDev && user.role !== ROLES.DEVELOPER) {
    user = db.saveUser(userId, { role: ROLES.DEVELOPER });
  }
  ctx.user = user;
  ctx.session = ctx.session || {};
  ctx.session.userRole = user.role;
  return next();
});

bot.use((ctx, next) => {
  if (ctx.session) {
    ctx.scene = new SceneContextScene(ctx, stage.scenes, stage.options);
  }
  return next();
});

function hasFlowFlags(ctx) {
  return Boolean(
    ctx.session?.aiMode ||
    ctx.session?.aiSetupStep ||
    ctx.session?.aiMadhabSelection ||
    ctx.session?.aiSectSelection ||
    ctx.session?.aiWaitingCity ||
    ctx.session?.aiScholarContext ||
    ctx.session?.aiScholarAdvancedMode ||
    ctx.session?.aiKhutbahMode ||
    ctx.session?.aiKhutbahStep ||
    ctx.session?.aiTargetLanguage ||
    ctx.session?.searchingQuran ||
    ctx.session?.quranAyahPrompt ||
    ctx.session?.quranHafizMode ||
    ctx.session?.addingSheikh ||
    ctx.session?.addingSheikhSpecialty ||
    ctx.session?.addingSheikhPhone ||
    ctx.session?.settingIBAN ||
    ctx.session?.settingPayPal ||
    ctx.session?.answeringSecretQuestion ||
    ctx.session?.addingCircle ||
    ctx.session?.addingCircleSchedule ||
    ctx.session?.addingCircleTopic ||
    ctx.session?.uploadingSermon ||
    ctx.session?.uploadingSermonContent
  );
}

// أزرار القائمة قبل الـ scenes — يمنع التقاط الـ wizard لنص الأزرار
bot.use(async (ctx, next) => {
  const text = ctx.message?.text;
  if (!text || !isMenuButton(text)) return next();
  await resetUserState(ctx);
  const handler = registry.getMenuHandlers()[text];
  if (handler) return handler(ctx);
  return next();
});

const menuComposer = new Composer();
menuComposer.hears(CANCEL_BUTTON, async (ctx, next) => {
  if (ctx.session?.__scenes?.current || hasFlowFlags(ctx)) return next();
  await resetUserState(ctx);
  await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER));
});
menuComposer.command('cancel', async (ctx) => {
  await resetUserState(ctx);
  await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER));
});
menuComposer.start(handleStart);
menuComposer.command('help', async (ctx) => {
  const role = ctx.user ? ctx.user.role : ROLES.WORSHIPPER;
  await ctx.reply(
    '🕌 *مساعدة بوت المسجد*\n\n/start - بدء البوت\n/help - المساعدة\n/cancel - إلغاء',
    { parse_mode: 'Markdown', ...mainKeyboard(role) }
  );
});
menuComposer.command('menu', async (ctx) => {
  await resetUserState(ctx);
  await ctx.reply('القائمة الرئيسية:', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER));
});

bot.use(menuComposer);

// تسجيل جميع الأزرار من actionRegistry — قبل stage
registry.registerAll(bot);

bot.use(stage.middleware());

bot.on('text', async function(ctx, next) {
  const text = ctx.message.text;
  if (text.startsWith('/')) return next();

  const handledByCorrection = await handleCorrectionText(ctx);
  if (handledByCorrection) return;

  const { handleRejectText, moderatorPanel, canAccess } = require('./handlers/moderator');
  const handledByMod = await handleRejectText(ctx);
  if (handledByMod) return;

  if (text === '📋 طلبات العلماء') {
    const user = db.getUser(ctx.from.id);
    if (canAccess(user)) {
      return moderatorPanel(ctx);
    }
  }
  if (text === '🕌 طلبات المساجد') {
    const user = db.getUser(ctx.from.id);
    if (canAccess(user)) {
      return moderatorPanel(ctx);
    }
  }
  if (text === '📊 إحصائيات المشرف') {
    const user = db.getUser(ctx.from.id);
    if (canAccess(user)) {
      return moderatorPanel(ctx);
    }
  }

  if (text === '✏️ مراجعة الإجابات') {
    const user = db.getUser(ctx.from.id);
    if (user?.role === 'SCHOLAR') {
      return reviewAnswersPanel(ctx);
    }
  }

  if (text === '🎓 أنا عالم') {
    return require('./handlers/scholar_apply').startScholarApply(ctx);
  }

  if (isMenuButton(text)) {
    await resetUserState(ctx);
    return dispatchMenuButton(ctx, text);
  }

  if (ctx.session.aiSetupStep || ctx.session.aiMadhabSelection || ctx.session.aiSectSelection) {
    const handled = await ai.handleAiSetupText(ctx);
    if (handled !== false) return;
  }

  // معالج نصوص العالم والمناظر
  if (ctx.session.scholarMode) {
    const { handleScholarText } = require('./handlers/scholar_panel');
    const handled = await handleScholarText(ctx);
    if (handled) return;
  }

  if (ctx.session.aiMode) {
    return ai.handleAiQuestion(ctx, text);
  }

  if (ctx.session.aiMadhabSelection) {
    return ctx.reply('⚠️ يرجى اختيار مذهبك من الأزرار أعلاه.');
  }

  if (ctx.session.aiSectSelection) {
    return ctx.reply('⚠️ يرجى اختيار طائفتك/تيارك من الأزرار أعلاه.');
  }

  if (ctx.session.searchingQuran) { delete ctx.session.searchingQuran; return quran.searchInQuran(ctx, text); }
  if (ctx.session.quranAyahPrompt) { delete ctx.session.quranAyahPrompt; return quran.readAyah(ctx, text); }
  if (ctx.session.quranHafizMode) { delete ctx.session.quranHafizMode; return quran.hafizMode(ctx, text); }
  if (ctx.session.addingSheikh) {
    if (text === CANCEL_BUTTON) { delete ctx.session.addingSheikh; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const name = text.trim();
    ctx.session.sheikhData = { name }; ctx.session.addingSheikh = false; ctx.session.addingSheikhSpecialty = true;
    return ctx.reply('✅ الاسم: *' + name + '*\n\nأدخل التخصص:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingSheikhSpecialty) {
    if (text === CANCEL_BUTTON) { delete ctx.session.sheikhData; delete ctx.session.addingSheikhSpecialty; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sheikhData.specialty = text.trim(); ctx.session.addingSheikhSpecialty = false; ctx.session.addingSheikhPhone = true;
    return ctx.reply('✅ التخصص: *' + ctx.session.sheikhData.specialty + '*\n\nأدخل رقم الهاتف:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingSheikhPhone) {
    if (text === CANCEL_BUTTON) { delete ctx.session.sheikhData; delete ctx.session.addingSheikhPhone; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sheikhData.phone = text.trim();
    const s = db.addSheikh(ctx.session.sheikhData); delete ctx.session.sheikhData; delete ctx.session.addingSheikhPhone;
    return ctx.reply('✅ *تم إضافة الشيخ!*\n\n👨‍🏫 *' + s.name + '*\n📖 ' + s.specialty, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.settingIBAN) {
    if (text === CANCEL_BUTTON) { delete ctx.session.settingIBAN; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const iban = text.trim().toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return ctx.reply('⚠️ صيغة IBAN غير صحيحة.');
    const mosque = db.firstMosque();
    if (!mosque) { delete ctx.session.settingIBAN; return ctx.reply('❌ لم يتم العثور على مسجد.'); }
    db.setDonationIBAN(mosque.id, iban); delete ctx.session.settingIBAN;
    return ctx.reply('✅ *تم ربط IBAN!*\n\n💳 `' + iban + '`', { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.settingPayPal) {
    if (text === CANCEL_BUTTON) { delete ctx.session.settingPayPal; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const email = text.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.reply('⚠️ البريد الإلكتروني غير صحيح.');
    const mosque = db.firstMosque();
    if (!mosque) { delete ctx.session.settingPayPal; return ctx.reply('❌ لم يتم العثور على مسجد.'); }
    db.setDonationPayPal(mosque.id, email); delete ctx.session.settingPayPal;
    return ctx.reply('✅ *تم ربط PayPal!*\n\n🅿️ `' + email + '`', { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.answeringSecretQuestion) {
    if (text === CANCEL_BUTTON) { delete ctx.session.answeringSecretQuestion; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const result = db.answerSecretQuestion(ctx.session.answeringSecretQuestion, text.trim(), ctx.user.firstName);
    delete ctx.session.answeringSecretQuestion;
    return ctx.reply(result ? '✅ تم إرسال الإجابة!' : '❌ فشل حفظ الإجابة.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER));
  }
  if (ctx.session.addingCircle) {
    if (text === CANCEL_BUTTON) { delete ctx.session.addingCircle; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.circleData = { name: text.trim() }; ctx.session.addingCircle = false; ctx.session.addingCircleSchedule = true;
    return ctx.reply('✅ الاسم: *' + ctx.session.circleData.name + '*\n\nأدخل الجدول:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingCircleSchedule) {
    if (text === CANCEL_BUTTON) { delete ctx.session.circleData; delete ctx.session.addingCircleSchedule; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.circleData.schedule = text.trim(); ctx.session.addingCircleSchedule = false; ctx.session.addingCircleTopic = true;
    return ctx.reply('✅ الجدول: *' + ctx.session.circleData.schedule + '*\n\nأدخل الموضوع:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingCircleTopic) {
    if (text === CANCEL_BUTTON) { delete ctx.session.circleData; delete ctx.session.addingCircleTopic; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.circleData.topic = text.trim(); ctx.session.circleData.createdBy = ctx.from.id;
    const circle = db.addQuranyCircle(ctx.session.circleData); delete ctx.session.circleData; delete ctx.session.addingCircleTopic;
    return ctx.reply('✅ *تم إضافة الحلقة!*\n\n📖 *' + circle.name + '*\n⏰ ' + circle.schedule, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.uploadingSermon) {
    if (text === CANCEL_BUTTON) { delete ctx.session.uploadingSermon; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sermonData = { title: text.trim() }; ctx.session.uploadingSermon = false; ctx.session.uploadingSermonContent = true;
    return ctx.reply('✅ العنوان: *' + ctx.session.sermonData.title + '*\n\nأدخل المحتوى:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.uploadingSermonContent) {
    if (text === CANCEL_BUTTON) { delete ctx.session.sermonData; delete ctx.session.uploadingSermonContent; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sermonData.content = text.trim(); ctx.session.sermonData.uploadedBy = ctx.from.id; ctx.session.sermonData.uploadedByName = ctx.user.firstName;
    const sermon = db.addSermon(ctx.session.sermonData); delete ctx.session.sermonData; delete ctx.session.uploadingSermonContent;
    return ctx.reply('✅ *تم رفع الخطبة!*\n\n📚 *' + sermon.title + '*', { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  ctx.reply('❓ لم أفهم هذا الأمر.\n\nاستخدم /menu لإظهار القائمة.');
});

bot.on('photo', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user) return;

  const isAiMode = ctx.session.aiMode ||
    ctx.session.scholarMode ||
    ctx.session.scholarDebateMode ||
    ctx.session.analyzeImage;

  if (!isAiMode) {
    return ctx.reply(
      '📸 أرسلت صورة!\n\nهل تريد أن أحللها؟',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 حلل هذه الصورة', 'analyze_image_now')],
          [Markup.button.callback('❌ إلغاء', 'noop')]
        ])
      }
    );
  }

  if (ctx.session.analyzeImage) delete ctx.session.analyzeImage;
  await handleImageQuestion(ctx, user);
});

bot.on('voice', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user) return;

  const isAiMode = ctx.session.aiMode ||
    ctx.session.scholarMode ||
    ctx.session.scholarDebateMode ||
    ctx.session.analyzeVoice;

  if (!isAiMode) {
    return ctx.reply(
      '🎤 أرسلت رسالة صوتية!\n\nهل تريد أن أفهمها وأجيب؟',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🎤 حلل الرسالة الصوتية', 'analyze_voice_now')],
          [Markup.button.callback('❌ إلغاء', 'noop')]
        ])
      }
    );
  }

  if (ctx.session.analyzeVoice) delete ctx.session.analyzeVoice;
  await handleVoiceQuestion(ctx, user);
});

bot.on('audio', async (ctx) => {
  if (ctx.message.voice) return;
  const user = db.getUser(ctx.from.id);
  if (!user) return;

  const isAiMode = ctx.session.aiMode ||
    ctx.session.scholarMode ||
    ctx.session.scholarDebateMode ||
    ctx.session.analyzeVoice;

  if (!isAiMode) {
    return ctx.reply(
      '🎤 أرسلت ملفاً صوتياً!\n\nهل تريد أن أفهمها وأجيب؟',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🎤 حلل الرسالة الصوتية', 'analyze_voice_now')],
          [Markup.button.callback('❌ إلغاء', 'noop')]
        ])
      }
    );
  }

  if (ctx.session.analyzeVoice) delete ctx.session.analyzeVoice;
  await handleVoiceQuestion(ctx, user);
});

bot.on('callback_query', async (ctx) => {
  console.log(`⚠️ Unhandled button: ${ctx.callbackQuery.data}`);
  await ctx.answerCbQuery('جاري التحديث... حاول مجدداً');
});

// ═══ أوامر المشرف (للمطور) ═══
bot.command('addmod', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user || (user.role !== 'developer' && user.role !== 'DEVELOPER')) {
    return ctx.reply('⛔ هذا الأمر للمطور فقط.');
  }
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply(
      '📝 *طريقة الاستخدام:*\n\n`/addmod USER_ID`\n\nمثال: `/addmod 123456789`',
      { parse_mode: 'Markdown' }
    );
  }
  const targetId = args[1];
  const result = db.addModerator(targetId, String(ctx.from.id));
  if (!result) {
    return ctx.reply('⚠️ هذا المستخدم مشرف بالفعل.');
  }
  try {
    await ctx.telegram.sendMessage(
      targetId,
      `🛡️ *تم تعيينك مشرفاً!*\n\nأنت الآن مشرف في منصة منارة المسلم.\nاكتب /start لرؤية لوحتك. 🤲`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.reply(`✅ تم تعيين ${targetId} مشرفاً بنجاح!`);
});

bot.command('removemod', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user || (user.role !== 'developer' && user.role !== 'DEVELOPER')) {
    return ctx.reply('⛔ هذا الأمر للمطور فقط.');
  }
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('📝 الاستخدام: `/removemod USER_ID`', { parse_mode: 'Markdown' });
  }
  const targetId = args[1];
  const result = db.removeModerator(targetId);
  if (!result) return ctx.reply('⚠️ هذا المستخدم ليس مشرفاً.');
  await ctx.reply(`✅ تم إزالة ${targetId} من المشرفين.`);
});

module.exports = { bot };

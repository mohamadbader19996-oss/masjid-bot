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
const { MENU_HANDLERS, dispatchMenuButton } = require('./menuHandlers');
const { scenes } = require('./scenes');
const { handleStart } = require('./handlers/start');
const admin = require('./handlers/admin');
const sheikhPanel = require('./handlers/sheikh_new');
const quran = require('./handlers/quran');

const bot = new Telegraf(process.env.BOT_TOKEN);
const SCENE_TTL_SECONDS = 30 * 60;
const stage = new Scenes.Stage(scenes, { ttl: SCENE_TTL_SECONDS });

bot.use(session({ defaultSession: () => ({}) }));

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

const menuComposer = new Composer();
for (const [label, handler] of Object.entries(MENU_HANDLERS)) {
  menuComposer.hears(label, async (ctx) => {
    await resetUserState(ctx);
    return handler(ctx);
  });
}
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
bot.use(stage.middleware());

bot.action('quran_menu', quran.quranMenu);
bot.action('quran_show_surahs', function(ctx) { return quran.showSurahs(ctx, 1); });
bot.action('quran_show_languages', quran.showLanguages);
bot.action('quran_show_reciters', quran.showReciters);
bot.action('quran_ayah_prompt', quran.promptAyah);
bot.action('quran_hafiz_prompt', quran.promptHafiz);
bot.action('noop', function(ctx) { return ctx.answerCbQuery(); });

bot.action(/^quran_read_(\d+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  return quran.readSurah(ctx, parseInt(ctx.match[1]));
});
bot.action(/^quran_page_(\d+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  return quran.showSurahs(ctx, parseInt(ctx.match[1]));
});
bot.action(/^quran_set_lang_(.+)$/, function(ctx) { return quran.setLanguage(ctx, ctx.match[1]); });
bot.action(/^quran_set_reciter_(.+)$/, function(ctx) { return quran.setReciter(ctx, ctx.match[1]); });
bot.action(/^quran_tafsir_(\d+)_(\d+)$/, function(ctx) { return quran.showTafsir(ctx, parseInt(ctx.match[1]), parseInt(ctx.match[2])); });
bot.action(/^quran_hafiz_repeat_(\d+)_(\d+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  ctx.session.quranHafizMode = true;
  return quran.hafizMode(ctx, ctx.match[1] + ':' + ctx.match[2]);
});
bot.action(/^quran_hafiz_next_(\d+)_(\d+)$/, async function(ctx) {
  await ctx.answerCbQuery();
  ctx.session.quranHafizMode = true;
  return quran.hafizMode(ctx, ctx.match[1] + ':' + (parseInt(ctx.match[2]) + 1));
});
bot.action('quran_search_prompt', async function(ctx) {
  ctx.session.searchingQuran = true;
  await ctx.answerCbQuery();
  await ctx.reply('🔍 أرسل كلمة البحث في القرآن الكريم الآن:');
});

bot.action('sheikh_back', sheikhPanel.sheikhPanel);
bot.action('sheikh_secret_questions', sheikhPanel.manageSecretQuestions);
bot.action('sheikh_circles', sheikhPanel.manageQuranyCircles);
bot.action('sheikh_upload_sermon', sheikhPanel.uploadSermon);
bot.action('sheikh_quran', sheikhPanel.showQuranMenu);
bot.action('sheikh_questions', sheikhPanel.showPendingQuestions);
bot.action('sheikh_stats', sheikhPanel.sheikhStats);
bot.action(/^secret_answer_(.+)$/, async function(ctx) { return sheikhPanel.answerSecretQuestion(ctx, ctx.match[1]); });
bot.action('circle_add', sheikhPanel.addCircle);
bot.action(/^circle_manage_(.+)$/, async function(ctx) { return sheikhPanel.manageCircle(ctx, ctx.match[1]); });
bot.action(/^circle_delete_(.+)$/, async function(ctx) {
  const circleId = ctx.match[1];
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user ? ctx.user.role : '')) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  if (db.deleteQuranyCircle(circleId)) { await ctx.answerCbQuery('✅ تم حذف الحلقة.'); return sheikhPanel.manageQuranyCircles(ctx); }
  else return ctx.answerCbQuery('❌ فشل الحذف.', true);
});
bot.action('quran_languages', sheikhPanel.showLanguages);
bot.action('quran_surahs', sheikhPanel.showSurahs);
bot.action(/^quran_lang_(.+)$/, async function(ctx) { await ctx.answerCbQuery(); ctx.session.selectedQuranLang = ctx.match[1]; return sheikhPanel.showSurahs(ctx); });
bot.action(/^quran_surah_(.+)$/, async function(ctx) { await ctx.answerCbQuery('⏳ جاري تحميل السورة...'); return quran.readSurah(ctx, parseInt(ctx.match[1])); });

bot.action('admin_sheikhs', admin.manageSheikhs);
bot.action('sheikh_add', admin.sheikhs_add_name);
bot.action(/^sheikh_delete_(.+)$/, function(ctx) { return admin.sheikhs_delete(ctx, ctx.match[1]); });
bot.action('admin_donations', admin.manageDonations);
bot.action('donation_set_iban', admin.donation_set_iban);
bot.action('donation_set_paypal', admin.donation_set_paypal);
bot.action('admin_help_requests', admin.manageHelpRequests);
bot.action(/^help_resolve_(.+)$/, function(ctx) { return admin.help_resolve(ctx, ctx.match[1]); });
bot.action('admin_stats', admin.showMosqueStats);
bot.action('admin_mosque_info', admin.manageMosque);
bot.action('admin_back', admin.adminPanel);
bot.action('admin_users', admin.listUsers);
bot.action(/^answer_(.+)$/, async function(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user ? ctx.user.role : '')) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  await ctx.answerCbQuery();
  return ctx.scene.enter('answer-question', { questionId: ctx.match[1] });
});

bot.on('text', async function(ctx) {
  const text = ctx.message.text;

  if (isMenuButton(text)) {
    return dispatchMenuButton(ctx, text);
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

module.exports = { bot };

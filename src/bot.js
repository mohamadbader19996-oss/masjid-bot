const { Telegraf, Scenes, session } = require('telegraf');
const { Markup } = require('telegraf');
const db = require('./database');
const { mainKeyboard, ROLES } = require('./keyboards');
const { scenes } = require('./scenes');
const { handleStart } = require('./handlers/start');
const common = require('./handlers/common');
const sheikh = require('./handlers/sheikh');
const admin = require('./handlers/admin');
const developer = require('./handlers/developer');
const sheikhPanel = require('./handlers/sheikh_new');
const quran = require('./handlers/quran');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

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
  ctx.session ??= {};
  ctx.session.userRole = user.role;
  return next();
});

const stage = new Scenes.Stage(scenes);
bot.use(stage.middleware());

bot.command('cancel', async (ctx) => {
  try { await ctx.scene.leave(); } catch {}
  await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

bot.start(handleStart);

bot.command('help', async (ctx) => {
  const role = ctx.user?.role || ROLES.WORSHIPPER;
  await ctx.reply(
    `🕌 *مساعدة بوت المسجد*\n\n/start - بدء البوت\n/help - المساعدة\n/cancel - إلغاء`,
    { parse_mode: 'Markdown', ...mainKeyboard(role) }
  );
});

bot.command('menu', async (ctx) => {
  await ctx.reply('القائمة الرئيسية:', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

// ── المصلي ──
bot.hears('📅 مواقيت الصلاة', common.showPrayerTimes);
bot.hears('📢 الإعلانات', common.showAnnouncements);
bot.hears('📚 الدروس', common.showLessons);
bot.hears('🕌 معلومات المسجد', common.showMosqueInfo);
bot.hears('❓ إرسال سؤال', (ctx) => ctx.scene.enter('ask-question'));
bot.hears('🆘 طلب مساعدة', (ctx) => ctx.scene.enter('add-help-request'));

// ── القرآن الكريم ──
bot.hears('📖 القرآن الكريم', quran.quranMenu);
bot.action('quran_show_surahs', (ctx) => quran.showSurahs(ctx, 1));
bot.action('quran_show_languages', quran.showLanguages);
bot.action('quran_menu', quran.quranMenu);
bot.action('quran_ayah_prompt', quran.promptAyah);
bot.action(/^quran_read_(.+)$/, async (ctx) => {
  const surahNum = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  return quran.readSurah(ctx, surahNum);
});
bot.action(/^quran_page_(.+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  return quran.showSurahs(ctx, page);
});
bot.action(/^quran_set_lang_(.+)$/, async (ctx) => {
  return quran.setLanguage(ctx, ctx.match[1]);
});
bot.action('quran_search_prompt', async (ctx) => {
  ctx.session.searchingQuran = true;
  await ctx.answerCbQuery();
  await ctx.reply('🔍 أرسل كلمة البحث في القرآن الكريم الآن:');
});

// ── الشيخ ──
bot.hears('📝 إضافة درس', (ctx) => {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }
  return ctx.scene.enter('add-lesson');
});
bot.hears('💬 الأسئلة الواردة', sheikh.showPendingQuestions);
bot.hears('📖 لوحة الشيخ', sheikhPanel.sheikhPanel);

bot.action('sheikh_back', sheikhPanel.sheikhPanel);
bot.action('sheikh_secret_questions', sheikhPanel.manageSecretQuestions);
bot.action('sheikh_circles', sheikhPanel.manageQuranyCircles);
bot.action('sheikh_upload_sermon', sheikhPanel.uploadSermon);
bot.action('sheikh_quran', sheikhPanel.showQuranMenu);
bot.action('sheikh_questions', sheikhPanel.showPendingQuestions);
bot.action('sheikh_stats', sheikhPanel.sheikhStats);
bot.action(/^secret_answer_(.+)$/, async (ctx) => {
  return sheikhPanel.answerSecretQuestion(ctx, ctx.match[1]);
});
bot.action('circle_add', sheikhPanel.addCircle);
bot.action(/^circle_manage_(.+)$/, async (ctx) => {
  return sheikhPanel.manageCircle(ctx, ctx.match[1]);
});
bot.action(/^circle_delete_(.+)$/, async (ctx) => {
  const circleId = ctx.match[1];
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }
  if (db.deleteQuranyCircle(circleId)) {
    await ctx.answerCbQuery('✅ تم حذف الحلقة.');
    return sheikhPanel.manageQuranyCircles(ctx);
  } else {
    return ctx.answerCbQuery('❌ فشل الحذف.', true);
  }
});
bot.action('quran_languages', sheikhPanel.showLanguages);
bot.action('quran_surahs', sheikhPanel.showSurahs);
bot.action(/^quran_lang_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.selectedQuranLang = ctx.match[1];
  return sheikhPanel.showSurahs(ctx);
});
bot.action(/^quran_surah_(.+)$/, async (ctx) => {
  const surahNum = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('⏳ جاري تحميل السورة...');
  return quran.readSurah(ctx, surahNum);
});

// ── الأدمن ──
bot.hears('⏰ تحديث مواقيت الصلاة', (ctx) => {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }
  return ctx.scene.enter('set-prayer-times');
});
bot.hears('📢 إضافة إعلان', (ctx) => {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }
  return ctx.scene.enter('add-announcement');
});
bot.hears('🔐 لوحة التحكم', admin.adminPanel);
bot.hears('👥 قائمة المستخدمين', admin.listUsers);

bot.action('admin_sheikhs', admin.manageSheikhs);
bot.action('sheikh_add', admin.sheikhs_add_name);
bot.action(/^sheikh_delete_(.+)$/, (ctx) => admin.sheikhs_delete(ctx, ctx.match[1]));
bot.action('admin_donations', admin.manageDonations);
bot.action('donation_set_iban', admin.donation_set_iban);
bot.action('donation_set_paypal', admin.donation_set_paypal);
bot.action('admin_help_requests', admin.manageHelpRequests);
bot.action(/^help_resolve_(.+)$/, (ctx) => admin.help_resolve(ctx, ctx.match[1]));
bot.action('admin_stats', admin.showMosqueStats);
bot.action('admin_mosque_info', admin.manageMosque);
bot.action('admin_back', admin.adminPanel);
bot.action('admin_users', admin.listUsers);
bot.action(/^answer_(.+)$/, async (ctx) => {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();
  return ctx.scene.enter('answer-question', { questionId: ctx.match[1] });
});

// ── المطور ──
bot.hears('👑 إدارة الأدوار', (ctx) => {
  if (ctx.user?.role !== ROLES.DEVELOPER) return ctx.reply('⛔ ليس لديك صلاحية.');
  return ctx.scene.enter('manage-role');
});
bot.hears('📊 إحصائيات', developer.showStats);
bot.hears('📡 رسالة جماعية', developer.broadcastAnnouncement);
bot.hears('📣 إعلان عام', developer.broadcastAnnouncement);
bot.hears('🕌 قائمة المساجد', developer.listMosques);
bot.hears('❄️ تفعيل/تجميد مسجد', developer.enterToggleMosque);
bot.hears('🗑️ حذف مسجد', developer.enterDeleteMosque);
bot.hears('🕌 إضافة مسجد', (ctx) => {
  if (ctx.user?.role !== ROLES.DEVELOPER) return ctx.reply('⛔ ليس لديك صلاحية.');
  return ctx.scene.enter('add-mosque');
});

// ── معالجات النصوص ──
bot.on('text', async (ctx) => {
  if (ctx.session.searchingQuran) {
    delete ctx.session.searchingQuran;
    return quran.searchInQuran(ctx, ctx.message.text);
  }
  if (ctx.session.quranAyahPrompt) {
    delete ctx.session.quranAyahPrompt;
    return quran.readAyah(ctx, ctx.message.text);
  }
  if (ctx.session.addingSheikh) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.addingSheikh;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    const name = ctx.message.text.trim();
    ctx.session.sheikhData = { name };
    ctx.session.addingSheikh = false;
    ctx.session.addingSheikhSpecialty = true;
    return ctx.reply(`✅ الاسم: *${name}*\n\nأدخل التخصص:`, { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
  }
  if (ctx.session.addingSheikhSpecialty) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.sheikhData;
      delete ctx.session.addingSheikhSpecialty;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.sheikhData.specialty = ctx.message.text.trim();
    ctx.session.addingSheikhSpecialty = false;
    ctx.session.addingSheikhPhone = true;
    return ctx.reply(`✅ التخصص: *${ctx.session.sheikhData.specialty}*\n\nأدخل رقم الهاتف:`, { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
  }
  if (ctx.session.addingSheikhPhone) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.sheikhData;
      delete ctx.session.addingSheikhPhone;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.sheikhData.phone = ctx.message.text.trim();
    const s = db.addSheikh(ctx.session.sheikhData);
    delete ctx.session.sheikhData;
    delete ctx.session.addingSheikhPhone;
    return ctx.reply(`✅ *تم إضافة الشيخ!*\n\n👨‍🏫 *${s.name}*\n📖 ${s.specialty}`, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) });
  }
  if (ctx.session.settingIBAN) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.settingIBAN;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    const iban = ctx.message.text.trim().toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
      return ctx.reply('⚠️ صيغة IBAN غير صحيحة.');
    }
    const mosque = db.firstMosque();
    if (!mosque) { delete ctx.session.settingIBAN; return ctx.reply('❌ لم يتم العثور على مسجد.'); }
    db.setDonationIBAN(mosque.id, iban);
    delete ctx.session.settingIBAN;
    return ctx.reply(`✅ *تم ربط IBAN!*\n\n💳 \`${iban}\``, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) });
  }
  if (ctx.session.settingPayPal) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.settingPayPal;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    const email = ctx.message.text.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return ctx.reply('⚠️ البريد الإلكتروني غير صحيح.');
    }
    const mosque = db.firstMosque();
    if (!mosque) { delete ctx.session.settingPayPal; return ctx.reply('❌ لم يتم العثور على مسجد.'); }
    db.setDonationPayPal(mosque.id, email);
    delete ctx.session.settingPayPal;
    return ctx.reply(`✅ *تم ربط PayPal!*\n\n🅿️ \`${email}\``, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) });
  }
  if (ctx.session.answeringSecretQuestion) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.answeringSecretQuestion;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    const result = db.answerSecretQuestion(ctx.session.answeringSecretQuestion, ctx.message.text.trim(), ctx.user.firstName);
    delete ctx.session.answeringSecretQuestion;
    return ctx.reply(result ? '✅ تم إرسال الإجابة!' : '❌ فشل حفظ الإجابة.', mainKeyboard(ctx.user?.role));
  }
  if (ctx.session.addingCircle) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.addingCircle;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.circleData = { name: ctx.message.text.trim() };
    ctx.session.addingCircle = false;
    ctx.session.addingCircleSchedule = true;
    return ctx.reply(`✅ الاسم: *${ctx.session.circleData.name}*\n\nأدخل الجدول:`, { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
  }
  if (ctx.session.addingCircleSchedule) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.circleData;
      delete ctx.session.addingCircleSchedule;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.circleData.schedule = ctx.message.text.trim();
    ctx.session.addingCircleSchedule = false;
    ctx.session.addingCircleTopic = true;
    return ctx.reply(`✅ الجدول: *${ctx.session.circleData.schedule}*\n\nأدخل الموضوع:`, { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
  }
  if (ctx.session.addingCircleTopic) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.circleData;
      delete ctx.session.addingCircleTopic;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.circleData.topic = ctx.message.text.trim();
    ctx.session.circleData.createdBy = ctx.from.id;
    const circle = db.addQuranyCircle(ctx.session.circleData);
    delete ctx.session.circleData;
    delete ctx.session.addingCircleTopic;
    return ctx.reply(`✅ *تم إضافة الحلقة!*\n\n📖 *${circle.name}*\n⏰ ${circle.schedule}`, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) });
  }
  if (ctx.session.uploadingSermon) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.uploadingSermon;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.sermonData = { title: ctx.message.text.trim() };
    ctx.session.uploadingSermon = false;
    ctx.session.uploadingSermonContent = true;
    return ctx.reply(`✅ العنوان: *${ctx.session.sermonData.title}*\n\nأدخل المحتوى:`, { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
  }
  if (ctx.session.uploadingSermonContent) {
    if (ctx.message.text === '❌ إلغاء') {
      delete ctx.session.sermonData;
      delete ctx.session.uploadingSermonContent;
      return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
    }
    ctx.session.sermonData.content = ctx.message.text.trim();
    ctx.session.sermonData.uploadedBy = ctx.from.id;
    ctx.session.sermonData.uploadedByName = ctx.user.firstName;
    const sermon = db.addSermon(ctx.session.sermonData);
    delete ctx.session.sermonData;
    delete ctx.session.uploadingSermonContent;
    return ctx.reply(`✅ *تم رفع الخطبة!*\n\n📚 *${sermon.title}*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) });
  }
  ctx.reply('❓ لم أفهم هذا الأمر.\n\nاستخدم /menu لإظهار القائمة.', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

module.exports = { bot };
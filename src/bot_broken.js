const sheikhPanel = require('./handlers/sheikh_new');

// ── لوحة الشيخ الكاملة ────────────────────────────
bot.hears('🆘 لوحة الشيخ', sheikhPanel.sheikhPanel);

// Callbacks لوحة الشيخ الرئيسية
bot.action('sheikh_back', sheikhPanel.sheikhPanel);
bot.action('sheikh_secret_questions', sheikhPanel.manageSecretQuestions);
bot.action('sheikh_circles', sheikhPanel.manageQuranyCircles);
bot.action('sheikh_upload_sermon', sheikhPanel.uploadSermon);
bot.action('sheikh_quran', sheikhPanel.showQuranMenu);
bot.action('sheikh_questions', sheikhPanel.showPendingQuestions);
bot.action('sheikh_stats', sheikhPanel.sheikhStats);

// Callbacks الأسئلة الفقهية السرية
bot.action(/^secret_answer_(.+)$/, async (ctx) => {
  return sheikhPanel.answerSecretQuestion(ctx, ctx.match[1]);
});

// Callbacks حلقات القرآن
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
    await ctx.answerCbQuery('✅ تم حذف الحلقة.', false);
    return sheikhPanel.manageQuranyCircles(ctx);
  } else {
    return ctx.answerCbQuery('❌ فشل الحذف.', true);
  }
});

// Callbacks المصحف الشريف
bot.action('quran_languages', sheikhPanel.showLanguages);
bot.action('quran_surahs', sheikhPanel.showSurahs);
bot.action(/^quran_lang_(.+)$/, async (ctx) => {
  const lang = ctx.match[1];
  await ctx.answerCbQuery();
  ctx.session.selectedQuranLang = lang;
  return sheikhPanel.showSurahs(ctx);
});
bot.action(/^quran_surah_(.+)$/, async (ctx) => {
  const surahNum = ctx.match[1];
  const lang = ctx.session.selectedQuranLang || 'ar';
  await ctx.answerCbQuery('⏳ جاري تحميل السورة...');
  // سيتم تنفيذ جلب البيانات من API لاحقاً
  await ctx.reply(`📖 السورة ${surahNum} باللغة ${lang}`);
});
const { Telegraf, Scenes, session } = require('telegraf');
const db = require('./database');
const { mainKeyboard, ROLES } = require('./keyboards');
const { scenes } = require('./scenes');
const { handleStart } = require('./handlers/start');
const common = require('./handlers/common');
const sheikh = require('./handlers/sheikh');
const admin = require('./handlers/admin');
const developer = require('./handlers/developer');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ── Middleware ────────────────────────────────────

bot.use(session());

// مصادقة: تسجيل المستخدم وتحديد دوره في كل طلب
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

// المشاهد (Scenes/Wizards)
const stage = new Scenes.Stage(scenes);
bot.use(stage.middleware());

// ── أوامر عامة ──────────────────────────────────

bot.command('cancel', async (ctx) => {
  try { await ctx.scene.leave(); } catch { /* لا توجد مشهد نشط */ }
  await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

bot.start(handleStart);

bot.command('help', async (ctx) => {
  const role = ctx.user?.role || ROLES.WORSHIPPER;
  await ctx.reply(
    `🕌 *مساعدة بوت المسجد*\n\nاستخدم الأزرار في لوحة المفاتيح للتنقل.\n\n*الأوامر المتاحة:*\n/start - بدء البوت وعرض القائمة\n/help - عرض هذه المساعدة\n/cancel - إلغاء العملية الحالية`,
    { parse_mode: 'Markdown', ...mainKeyboard(role) }
  );
});

bot.command('menu', async (ctx) => {
  await ctx.reply('القائمة الرئيسية:', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
});

// ── مستوى المصلي ─────────────────────────────────

bot.hears('📅 مواقيت الصلاة', common.showPrayerTimes);
bot.hears('📢 الإعلانات', common.showAnnouncements);
bot.hears('📚 الدروس', common.showLessons);
bot.hears('🕌 معلومات المسجد', common.showMosqueInfo);
bot.hears('❓ إرسال سؤال', (ctx) => ctx.scene.enter('ask-question'));
bot.hears('🆘 طلب مساعدة', (ctx) => ctx.scene.enter('add-help-request'));

// ── مستوى الشيخ ──────────────────────────────────

  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية لهذا الإجراء.');
bot.on('text', async (ctx) => {
  if (!ctx.session.answeringSecretQuestion) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.answeringSecretQuestion;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const answerText = ctx.message.text.trim();
  const questionId = ctx.session.answeringSecretQuestion;
  
  const result = db.answerSecretQuestion(questionId, answerText, ctx.user.firstName);
  delete ctx.session.answeringSecretQuestion;

  if (result) {
    await ctx.reply(
      '✅ *تم إرسال الإجابة السرية!*\n\nسيتلقى السائل إجابتك بسرية.',
      { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) }
    );
  } else {
    await ctx.reply('❌ فشل حفظ الإجابة.', mainKeyboard(ctx.user?.role));
  }
});

// ── إضافة حلقة قرآنية ────────────────────────────
bot.on('text', async (ctx) => {
  if (!ctx.session.addingCircle) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.addingCircle;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const circleName = ctx.message.text.trim();
  ctx.session.circleData = { name: circleName };
  ctx.session.addingCircle = false;
  ctx.session.addingCircleSchedule = true;

  await ctx.reply(
    `✅ الاسم: *${circleName}*\n\nأدخل جدول الحلقة (مثال: كل يوم الجمعة من 7 إلى 8 مساءً):`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
});

// الخطوة الثانية: جدول الحلقة
bot.on('text', async (ctx) => {
  if (!ctx.session.addingCircleSchedule) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.circleData;
    delete ctx.session.addingCircleSchedule;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const schedule = ctx.message.text.trim();
  ctx.session.circleData.schedule = schedule;
  ctx.session.addingCircleSchedule = false;
  ctx.session.addingCircleTopic = true;

  await ctx.reply(
    `✅ الجدول: *${schedule}*\n\nأدخل موضوع الحلقة:`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
});

// الخطوة الثالثة: موضوع الحلقة
bot.on('text', async (ctx) => {
  if (!ctx.session.addingCircleTopic) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.circleData;
    delete ctx.session.addingCircleTopic;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const topic = ctx.message.text.trim();
  ctx.session.circleData.topic = topic;
  ctx.session.circleData.createdBy = ctx.from.id;

  const circle = db.addQuranyCircle(ctx.session.circleData);

  delete ctx.session.circleData;
  delete ctx.session.addingCircleTopic;

  await ctx.reply(
    `✅ *تم إضافة الحلقة بنجاح!*\n\n📖 *${circle.name}*\n⏰ الجدول: ${circle.schedule}\n📍 الموضوع: ${circle.topic}`,
    { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) }
  );
});

// ── رفع خطبة أو درس ──────────────────────────────
bot.on('text', async (ctx) => {
  if (!ctx.session.uploadingSermon) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.uploadingSermon;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const title = ctx.message.text.trim();
  ctx.session.sermonData = { title };
  ctx.session.uploadingSermon = false;
  ctx.session.uploadingSermonContent = true;

  await ctx.reply(
    `✅ العنوان: *${title}*\n\nأدخل المحتوى أو الوصف:`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
});

// الخطوة الثانية: محتوى الخطبة
bot.on('text', async (ctx) => {
  if (!ctx.session.uploadingSermonContent) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.sermonData;
    delete ctx.session.uploadingSermonContent;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const content = ctx.message.text.trim();
  ctx.session.sermonData.content = content;
  ctx.session.uploadingSermonContent = false;
  ctx.session.sermonData.uploadedBy = ctx.from.id;
  ctx.session.sermonData.uploadedByName = ctx.user.firstName;

  const sermon = db.addSermon(ctx.session.sermonData);

  delete ctx.session.sermonData;

  await ctx.reply(
    `✅ *تم رفع الخطبة بنجاح!*\n\n📚 *${sermon.title}*\n👨‍🏫 بواسطة: ${sermon.uploadedByName}`,
    { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) }
  );
});

// ── رسائل غير معروفة ──────────────────────────────
  }
  return ctx.scene.enter('add-lesson');
});

bot.hears('💬 الأسئلة الواردة', sheikh.showPendingQuestions);

// callback للإجابة على سؤال محدد
bot.action(/^answer_(.+)$/, async (ctx) => {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();
  return ctx.scene.enter('answer-question', { questionId: ctx.match[1] });
});

// ── مستوى مسؤول المسجد ───────────────────────────

bot.hears('⏰ تحديث مواقيت الصلاة', (ctx) => {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية لهذا الإجراء.');
  }
  return ctx.scene.enter('set-prayer-times');
});

bot.hears('📢 إضافة إعلان', (ctx) => {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية لهذا الإجراء.');
  }
  return ctx.scene.enter('add-announcement');
});

bot.hears('🔐 لوحة التحكم', admin.adminPanel);
bot.hears('👥 قائمة المستخدمين', admin.listUsers);

// ── Callbacks للوحة التحكم ──────────────────────────

// إدارة المشايخ
bot.action('admin_sheikhs', admin.manageSheikhs);
bot.action('sheikh_add', admin.sheikhs_add_name);
bot.action(/^sheikh_delete_(.+)$/, (ctx) => admin.sheikhs_delete(ctx, ctx.match[1]));

// إدارة التبرعات
bot.action('admin_donations', admin.manageDonations);
bot.action('donation_set_iban', admin.donation_set_iban);
bot.action('donation_set_paypal', admin.donation_set_paypal);

// إدارة طلبات المساعدة
bot.action('admin_help_requests', admin.manageHelpRequests);
bot.action(/^help_resolve_(.+)$/, (ctx) => admin.help_resolve(ctx, ctx.match[1]));

// الإحصائيات
bot.action('admin_stats', admin.showMosqueStats);

// معلومات المسجد
bot.action('admin_mosque_info', admin.manageMosque);

// الرجوع
bot.action('admin_back', admin.adminPanel);
bot.action('admin_users', admin.listUsers);

// ── مستوى المطور ─────────────────────────────────

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

// ── معالجات إدخال البيانات للوحة التحكم ──────────

// إضافة مشيخ - الخطوة الأولى (الاسم)
bot.on('text', async (ctx) => {
  if (!ctx.session.addingSheikh) return;
  
  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.addingSheikh;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const name = ctx.message.text.trim();
  ctx.session.sheikhData = { name };
  ctx.session.addingSheikh = false;
  ctx.session.addingSheikhSpecialty = true;

  await ctx.reply(
    `✅ الاسم: *${name}*\n\nالآن أدخل التخصص (مثل: القرآن، الفقه، السيرة):`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
});

// إضافة مشيخ - الخطوة الثانية (التخصص)
bot.on('text', async (ctx) => {
  if (!ctx.session.addingSheikhSpecialty) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.sheikhData;
    delete ctx.session.addingSheikhSpecialty;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const specialty = ctx.message.text.trim();
  ctx.session.sheikhData.specialty = specialty;
  ctx.session.addingSheikhSpecialty = false;
  ctx.session.addingSheikhPhone = true;

  await ctx.reply(
    `✅ التخصص: *${specialty}*\n\nأدخل رقم الهاتف (اختياري):`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
});

// إضافة مشيخ - الخطوة الثالثة (الهاتف)
bot.on('text', async (ctx) => {
  if (!ctx.session.addingSheikhPhone) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.sheikhData;
    delete ctx.session.addingSheikhPhone;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const phone = ctx.message.text.trim();
  ctx.session.sheikhData.phone = phone;
  
  const sheikh = db.addSheikh(ctx.session.sheikhData);
  
  delete ctx.session.sheikhData;
  delete ctx.session.addingSheikhPhone;

  await ctx.reply(
    `✅ *تم إضافة الشيخ بنجاح!*\n\n👨‍🏫 *${sheikh.name}*\n📖 التخصص: ${sheikh.specialty}\n📞 الهاتف: ${sheikh.phone || 'غير محدد'}`,
    { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) }
  );
});

// إدخال IBAN
bot.on('text', async (ctx) => {
  if (!ctx.session.settingIBAN) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.settingIBAN;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const iban = ctx.message.text.trim().toUpperCase();
  
  // التحقق من صيغة IBAN
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return ctx.reply('⚠️ صيغة IBAN غير صحيحة.\n\nتأكد من الصيغة الصحيحة (مثل: SA4420000001234567890123456789)');
  }

  const mosque = db.firstMosque();
  if (!mosque) {
    delete ctx.session.settingIBAN;
    return ctx.reply('❌ لم يتم العثور على مسجد.');
  }

  db.setDonationIBAN(mosque.id, iban);
  delete ctx.session.settingIBAN;

  await ctx.reply(
    `✅ *تم ربط IBAN بنجاح!*\n\n💳 IBAN: \`${iban}\``,
    { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) }
  );
});

// إدخال PayPal
bot.on('text', async (ctx) => {
  if (!ctx.session.settingPayPal) return;

  if (ctx.message.text === '❌ إلغاء') {
    delete ctx.session.settingPayPal;
    return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user?.role));
  }

  const paypalEmail = ctx.message.text.trim().toLowerCase();
  
  // التحقق من صيغة البريد الإلكتروني
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(paypalEmail)) {
    return ctx.reply('⚠️ صيغة البريد الإلكتروني غير صحيحة.\n\nأدخل بريد صحيح (مثال: masjid@example.com)');
  }

  const mosque = db.firstMosque();
  if (!mosque) {
    delete ctx.session.settingPayPal;
    return ctx.reply('❌ لم يتم العثور على مسجد.');
  }

  db.setDonationPayPal(mosque.id, paypalEmail);
  delete ctx.session.settingPayPal;

  await ctx.reply(
    `✅ *تم ربط PayPal بنجاح!*\n\n🅿️ PayPal: \`${paypalEmail}\``,
    { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) }
  );
});

// ── رسائل غير معروفة ──────────────────────────────

bot.on('text', (ctx) => {
  ctx.reply(
    '❓ لم أفهم هذا الأمر.\n\nاستخدم الأزرار في القائمة أو اكتب /menu لإظهار القائمة.',
    mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER)
  );
});

module.exports = { bot };

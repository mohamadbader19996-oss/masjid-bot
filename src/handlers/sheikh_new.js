const { Markup } = require('telegraf');
const db = require('../database');
const { ROLES } = require('../keyboards');

// ── لوحة الشيخ الرئيسية ──────────────────────────

async function sheikhPanel(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📬 الرسائل', 'sheikh_messages'),
      Markup.button.callback('❓ الأسئلة الفقهية', 'sheikh_secret_questions')
    ],
    [
      Markup.button.callback('📖 حلقات القرآن', 'sheikh_circles'),
      Markup.button.callback('💬 الأسئلة الواردة', 'sheikh_questions')
    ],
    [
      Markup.button.callback('📚 رفع خطبة/درس', 'sheikh_upload_sermon'),
      Markup.button.callback('🕌 المصحف الشريف', 'sheikh_quran')
    ],
    [Markup.button.callback('📊 إحصائياتي', 'sheikh_stats')]
  ]);

  await ctx.reply(
    '📖 *لوحة الشيخ الكاملة*\n\n✨ مرحباً بك! اختر الخيار المطلوب:',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

// ── الأسئلة الفقهية السرية ──────────────────────

async function manageSecretQuestions(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }

  const questions = db.getPendingSecretQuestions();

  if (!questions.length) {
    await ctx.answerCbQuery('✅ لا توجد أسئلة معلقة', true);
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 العودة', 'sheikh_back')]
    ]);
    return ctx.editMessageText(
      '❓ *الأسئلة الفقهية السرية*\n\n✅ لا توجد أسئلة معلقة حالياً.',
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  await ctx.answerCbQuery();

  let msg = `❓ *الأسئلة الفقهية السرية المعلقة* (${questions.length})\n\n`;
  const buttons = [];

  for (const q of questions.slice(0, 5)) {
    msg += `🔒 *سؤال سري*\n`;
    msg += `👤 من: ${q.askedByName || 'مستخدم'}\n`;
    msg += `📝 ${q.text.substring(0, 100)}${q.text.length > 100 ? '...' : ''}\n`;
    msg += `📅 ${new Date(q.at).toLocaleDateString('ar-EG')}\n\n`;
    buttons.push([
      Markup.button.callback('✍️ إجابة سرية', `secret_answer_${q.id}`)
    ]);
  }

  if (questions.length > 5) {
    msg += `_... و ${questions.length - 5} سؤال آخر_\n`;
  }

  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_back')]);

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

async function answerSecretQuestion(ctx, questionId) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }

  const question = db.getSecretQuestion(questionId);
  if (!question) {
    return ctx.answerCbQuery('❌ السؤال غير موجود.', true);
  }

  await ctx.answerCbQuery();
  ctx.session.answeringSecretQuestion = questionId;
  
  await ctx.reply(
    `❓ *السؤال الفقهي:*\n_${question.text}_\n\n✍️ أدخل إجابتك (الإجابات السرية لا يطلع عليها سوى السائل):`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
}

// ── إدارة حلقات القرآن ──────────────────────────

async function manageQuranyCircles(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }

  const circles = db.allQuranyCircles();

  await ctx.answerCbQuery();

  let msg = `📖 *حلقات القرآن الكريم*\n\n`;
  if (!circles.length) {
    msg += `لا توجد حلقات مسجلة بعد.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ إضافة حلقة', 'circle_add')],
      [Markup.button.callback('🔙 العودة', 'sheikh_back')]
    ]);
    return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  }

  const buttons = [];
  for (const circle of circles) {
    msg += `📚 *${circle.name}*\n`;
    msg += `⏰ ${circle.schedule || 'غير محدد'}\n`;
    msg += `👥 المشاركون: ${circle.participants?.length || 0}/${circle.maxParticipants || 20}\n`;
    msg += `📋 الانتظار: ${circle.waitlist?.length || 0}\n\n`;
    
    buttons.push([
      Markup.button.callback(`📝 ${circle.name}`, `circle_manage_${circle.id}`),
      Markup.button.callback(`🗑️`, `circle_delete_${circle.id}`)
    ]);
  }

  buttons.push([Markup.button.callback('➕ إضافة حلقة', 'circle_add')]);
  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_back')]);

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

async function addCircle(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }

  await ctx.answerCbQuery();
  ctx.session.addingCircle = true;

  await ctx.reply(
    '📖 *إضافة حلقة قرآن*\n\nأدخل اسم الحلقة:',
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
}

async function manageCircle(ctx, circleId) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }

  const circle = db.getQuranyCircle(circleId);
  if (!circle) {
    return ctx.answerCbQuery('❌ الحلقة غير موجودة.', true);
  }

  await ctx.answerCbQuery();

  let msg = `📖 *${circle.name}*\n\n`;
  msg += `⏰ الجدول: ${circle.schedule || 'غير محدد'}\n`;
  msg += `👥 المشاركون: ${circle.participants?.length || 0}/${circle.maxParticipants || 20}\n`;
  msg += `📋 الانتظار: ${circle.waitlist?.length || 0}\n`;
  msg += `📍 الموضوع: ${circle.topic || 'لم يحدد'}\n`;
  msg += `✍️ ملاحظات: ${circle.notes || 'بدون'}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('👥 المشاركون', `circle_members_${circleId}`)],
    [Markup.button.callback('📋 قائمة الانتظار', `circle_waitlist_${circleId}`)],
    [Markup.button.callback('✏️ تحديث', `circle_edit_${circleId}`)],
    [Markup.button.callback('🔙 العودة', 'sheikh_circles')]
  ]);

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
}

// ── رفع الخطب والدروس ──────────────────────────

async function uploadSermon(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }

  await ctx.answerCbQuery();
  ctx.session.uploadingSermon = true;

  await ctx.reply(
    '📚 *رفع خطبة أو درس*\n\nأدخل العنوان:',
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
}

// ── المصحف الشريف ───────────────────────────────

async function showQuranMenu(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🌍 اختر اللغة', 'quran_languages')],
    [Markup.button.callback('📖 اختر السورة', 'quran_surahs')],
    [Markup.button.callback('🔍 البحث', 'quran_search')],
    [Markup.button.callback('🔙 العودة', 'sheikh_back')]
  ]);

  const msg = '🕌 *المصحف الشريف الكامل*\n\n📚 مصحف بجميع لغات العالم مع التفسير\n🔗 مدعوم من Al-Quran Cloud API\n\nاختر خياراً:';

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
  }
}

async function showLanguages(ctx) {
  const languages = [
    { name: 'العربية 🇸🇦', code: 'ar' },
    { name: 'English 🇬🇧', code: 'en' },
    { name: 'Français 🇫🇷', code: 'fr' },
    { name: 'Español 🇪🇸', code: 'es' },
    { name: 'Deutsch 🇩🇪', code: 'de' },
    { name: 'Português 🇵🇹', code: 'pt' },
    { name: 'Русский 🇷🇺', code: 'ru' },
    { name: 'اردو 🇵🇰', code: 'ur' },
    { name: 'فارسی 🇮🇷', code: 'fa' },
    { name: '中文 🇨🇳', code: 'zh' },
    { name: 'Türkçe 🇹🇷', code: 'tr' },
    { name: 'Malay 🇲🇾', code: 'ms' }
  ];

  const buttons = languages.map(lang => [
    Markup.button.callback(`${lang.name}`, `quran_lang_${lang.code}`)
  ]);

  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_quran')]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🌍 *اختر اللغة:*',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function showSurahs(ctx) {
  const surahs = [
    { num: 1, name: 'الفاتحة' },
    { num: 2, name: 'البقرة' },
    { num: 3, name: 'آل عمران' },
    { num: 4, name: 'النساء' },
    { num: 5, name: 'المائدة' },
    { num: 6, name: 'الأنعام' },
    { num: 7, name: 'الأعراف' },
    { num: 8, name: 'الأنفال' },
    { num: 9, name: 'التوبة' },
    { num: 10, name: 'يونس' },
    { num: 11, name: 'هود' },
    { num: 12, name: 'يوسف' },
    { num: 13, name: 'الرعد' },
    { num: 14, name: 'إبراهيم' },
    { num: 15, name: 'الحجر' },
    { num: 16, name: 'النحل' },
    { num: 17, name: 'الإسراء' },
    { num: 18, name: 'الكهف' },
    { num: 19, name: 'مريم' },
    { num: 20, name: 'طه' }
  ];

  const buttons = surahs.map(surah => [
    Markup.button.callback(`${surah.num}. ${surah.name}`, `quran_surah_${surah.num}`)
  ]);

  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_quran')]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📖 *اختر السورة:*',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

// ── الأسئلة الواردة (الأصلية) ────────────────────

async function showPendingQuestions(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const questions = db.pendingQuestions();

  if (!questions.length) {
    return ctx.reply('✅ لا توجد أسئلة معلقة حالياً. جزاك الله خيراً!');
  }

  await ctx.reply(
    `💬 *الأسئلة الواردة من المصلين*\nيوجد ${questions.length} سؤال بانتظار الإجابة:`,
    { parse_mode: 'Markdown' }
  );

  for (const q of questions.slice(0, 10)) {
    const date = new Date(q.at).toLocaleDateString('ar-EG');
    await ctx.reply(
      `❓ *${q.askedByName}*\n📅 _${date}_\n\n${q.text}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('💬 إجابة', `answer_${q.id}`)
        ]])
      }
    );
  }

  if (questions.length > 10) {
    await ctx.reply(`_... و ${questions.length - 10} سؤال آخر_`, { parse_mode: 'Markdown' });
  }
}

// ── إحصائيات الشيخ ──────────────────────────────

async function sheikhStats(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  const myLessons = db.getLessonsByAuthor(ctx.from.id);
  const myAnsweredQuestions = db.getQuestionsByAuthor(ctx.from.id).filter(q => q.answered);
  const myCircles = db.getCirclesByAuthor(ctx.from.id);
  const mySermons = db.getSermonsByAuthor(ctx.from.id);
  const mySecretAnswers = db.allSecretQuestions().filter(q => q.answeredBy === ctx.from.first_name);

  await ctx.answerCbQuery();

  let msg = `📊 *إحصائياتي الشخصية*\n\n`;
  msg += `📚 *الدروس المضافة:* ${myLessons.length}\n`;
  msg += `❓ *الأسئلة المجابة:* ${myAnsweredQuestions.length}\n`;
  msg += `📖 *حلقات القرآن:* ${myCircles.length}\n`;
  msg += `🎙️ *الخطب والدروس المرفوعة:* ${mySermons.length}\n`;
  msg += `🔒 *الإجابات السرية:* ${mySecretAnswers.length}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 العودة', 'sheikh_back')]
  ]);

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function showSheikhMessages(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  const items = [];
  const sheikhId = ctx.from.id;

  for (const m of db.getSheikhInbox(sheikhId, 8)) {
    items.push({
      icon: m.type === 'interfaith_contact' ? '🌍' : '📩',
      label: m.typeLabel || 'رسالة مستخدم',
      preview: (m.question || '').substring(0, 50),
      date: new Date(m.at).toLocaleDateString('ar-EG')
    });
  }

  for (const q of db.pendingQuestions()) {
    if (items.length >= 8) break;
    items.push({
      icon: '❓',
      label: 'سؤال يحتاج إجابة',
      preview: (q.text || '').substring(0, 50),
      date: new Date(q.at).toLocaleDateString('ar-EG')
    });
  }

  for (const q of db.getPendingSecretQuestions()) {
    if (items.length >= 8) break;
    items.push({
      icon: '🔒',
      label: 'سؤال فقهي سري',
      preview: (q.text || '').substring(0, 50),
      date: new Date(q.at).toLocaleDateString('ar-EG')
    });
  }

  for (const h of db.getPendingHelpRequests()) {
    if (items.length >= 8) break;
    items.push({
      icon: '🆘',
      label: 'إشعار نظام — طلب مساعدة',
      preview: (h.description || h.text || '').substring(0, 50),
      date: new Date(h.at).toLocaleDateString('ar-EG')
    });
  }

  const display = items.slice(0, 8);

  let msg = `📬 *الرسائل* (${display.length})\n\n`;
  if (!display.length) {
    msg += '✅ لا توجد رسائل جديدة حالياً.';
  } else {
    display.forEach((item, i) => {
      msg += `${i + 1}. ${item.icon} *${item.label}*\n`;
      msg += `   ${item.preview}${item.preview.length >= 50 ? '...' : ''}\n`;
      msg += `   📅 ${item.date}\n\n`;
    });
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 العودة', 'sheikh_back')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  }
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function handleCircleDelete(ctx) {
  const circleId = ctx.match[1];
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  }
  if (db.deleteQuranyCircle(circleId)) {
    await ctx.answerCbQuery('✅ تم حذف الحلقة.');
    return manageQuranyCircles(ctx);
  }
  return ctx.answerCbQuery('❌ فشل الحذف.', true);
}

async function handleQuranLangSelect(ctx) {
  await ctx.answerCbQuery();
  ctx.session.selectedQuranLang = ctx.match[1];
  return showSurahs(ctx);
}

async function handleQuranSurahSelect(ctx) {
  const quran = require('./quran');
  await ctx.answerCbQuery('⏳ جاري تحميل السورة...');
  return quran.readSurah(ctx, parseInt(ctx.match[1], 10));
}

async function handleAnswerQuestion(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();
  return ctx.scene.enter('answer-question', { questionId: ctx.match[1] });
}

async function handleCircleFeatureStub(ctx, feature) {
  await ctx.answerCbQuery();
  await ctx.reply(`⏳ ميزة "${feature}" قيد التطوير قريباً.`);
}

module.exports = {
  sheikhPanel,
  showSheikhMessages,
  manageSecretQuestions,
  answerSecretQuestion,
  manageQuranyCircles,
  addCircle,
  manageCircle,
  uploadSermon,
  showQuranMenu,
  showLanguages,
  showSurahs,
  showPendingQuestions,
  sheikhStats
};

const registry = require('../core/actionRegistry');

registry.registerMenu('📖 لوحة الشيخ', sheikhPanel, 'لوحة الشيخ');

registry.registerAction('sheikh_back', sheikhPanel, 'العودة للوحة الشيخ');
registry.registerAction('sheikh_messages', showSheikhMessages, 'رسائل الشيخ');
registry.registerAction('sheikh_secret_questions', manageSecretQuestions, 'الأسئلة الفقهية');
registry.registerAction('sheikh_circles', manageQuranyCircles, 'حلقات القرآن');
registry.registerAction('sheikh_upload_sermon', uploadSermon, 'رفع خطبة');
registry.registerAction('sheikh_quran', showQuranMenu, 'المصحف الشريف');
registry.registerAction('sheikh_questions', showPendingQuestions, 'الأسئلة الواردة');
registry.registerAction('sheikh_stats', sheikhStats, 'إحصائيات الشيخ');
registry.registerAction(/^secret_answer_(.+)$/, (ctx) => answerSecretQuestion(ctx, ctx.match[1]), 'إجابة سرية');
registry.registerAction('circle_add', addCircle, 'إضافة حلقة');
registry.registerAction(/^circle_manage_(.+)$/, (ctx) => manageCircle(ctx, ctx.match[1]), 'إدارة حلقة');
registry.registerAction(/^circle_delete_(.+)$/, handleCircleDelete, 'حذف حلقة');
registry.registerAction(/^circle_members_(.+)$/, (ctx) => handleCircleFeatureStub(ctx, 'المشاركون'), 'مشاركو الحلقة');
registry.registerAction(/^circle_waitlist_(.+)$/, (ctx) => handleCircleFeatureStub(ctx, 'قائمة الانتظار'), 'انتظار الحلقة');
registry.registerAction(/^circle_edit_(.+)$/, (ctx) => handleCircleFeatureStub(ctx, 'تحديث الحلقة'), 'تحديث حلقة');
registry.registerAction('quran_languages', showLanguages, 'لغات المصحف');
registry.registerAction('quran_surahs', showSurahs, 'سور المصحف');
registry.registerAction(/^quran_lang_(.+)$/, handleQuranLangSelect, 'اختيار لغة المصحف');
registry.registerAction(/^quran_surah_(.+)$/, handleQuranSurahSelect, 'قراءة سورة من لوحة الشيخ');
registry.registerAction(/^answer_(.+)$/, handleAnswerQuestion, 'الإجابة على سؤال');

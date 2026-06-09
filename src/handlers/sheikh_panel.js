const db = require('../database');
const { ROLES } = require('../keyboards');
const { Markup } = require('telegraf');

// ── لوحة الشيخ الرئيسية ──────────────────────────

async function sheikhPanel(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('❓ الأسئلة الفقهية', 'sheikh_questions'),
      Markup.button.callback('📖 حلقات القرآن', 'sheikh_circles')
    ],
    [
      Markup.button.callback('📚 رفع خطبة/درس', 'sheikh_upload'),
      Markup.button.callback('🕌 المصحف الشريف', 'sheikh_quran')
    ],
    [
      Markup.button.callback('📊 إحصائياتي', 'sheikh_stats'),
      Markup.button.callback('🔙 العودة', 'menu_back')
    ]
  ]);

  await ctx.reply(
    '📖 *لوحة الشيخ*\n\nاختر الخيار المطلوب:',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

// ── الأسئلة الفقهية السرية ──────────────────────

async function manageSecretQuestions(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  const questions = db.getPendingSecretQuestions();

  if (!questions.length) {
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 العودة', 'sheikh_panel')]
    ]);
    return ctx.reply(
      '❓ *الأسئلة الفقهية*\n\n✅ لا توجد أسئلة معلقة حالياً.',
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  let msg = `❓ *الأسئلة الفقهية المعلقة* (${questions.length})\n\n`;
  const buttons = [];

  for (const q of questions.slice(0, 5)) {
    msg += `🔒 *سؤال سري*\n`;
    msg += `👤 من: ${q.askedByName || 'مستخدم'}\n`;
    msg += `📝 ${q.text}\n`;
    msg += `📅 ${new Date(q.at).toLocaleDateString('ar-EG')}\n\n`;
    buttons.push([
      Markup.button.callback('✍️ إجابة سرية', `secret_answer_${q.id}`)
    ]);
  }

  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_panel')]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
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
    `❓ *السؤال الفقهي:*\n_${question.text}_\n\n✍️ أدخل إجابتك:`,
    { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() }
  );
}

// ── إدارة حلقات القرآن ──────────────────────────

async function manageQuranyCircles(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  const circles = db.allQuranyCircles();

  let msg = `📖 *حلقات القرآن الكريم*\n\n`;
  if (!circles.length) {
    msg += `لا توجد حلقات مسجلة بعد.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('➕ إضافة حلقة', 'circle_add')],
      [Markup.button.callback('🔙 العودة', 'sheikh_panel')]
    ]);
    return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
  }

  const buttons = [];
  for (const circle of circles) {
    msg += `📚 *${circle.name}*\n`;
    msg += `⏰ ${circle.schedule}\n`;
    msg += `👥 المشاركون: ${circle.participants?.length || 0}\n`;
    msg += `📋 الانتظار: ${circle.waitlist?.length || 0}\n\n`;
    
    buttons.push([
      Markup.button.callback(`📝 إدارة`, `circle_manage_${circle.id}`),
      Markup.button.callback(`🗑️ حذف`, `circle_delete_${circle.id}`)
    ]);
  }

  buttons.push([Markup.button.callback('➕ إضافة حلقة', 'circle_add')]);
  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_panel')]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
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
  msg += `⏰ الجدول: ${circle.schedule}\n`;
  msg += `👥 المشاركون: ${circle.participants?.length || 0}\n`;
  msg += `📋 الانتظار: ${circle.waitlist?.length || 0}\n`;
  msg += `📍 الموضوع: ${circle.topic || 'لم يحدد'}\n`;
  msg += `✍️ ملاحظات: ${circle.notes || 'بدون'}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('👥 قائمة المشاركين', `circle_members_${circleId}`)],
    [Markup.button.callback('📋 قائمة الانتظار', `circle_waitlist_${circleId}`)],
    [Markup.button.callback('✏️ تحديث', `circle_edit_${circleId}`)],
    [Markup.button.callback('🔙 العودة', 'sheikh_circles')]
  ]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
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

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🌍 اختر اللغة', 'quran_languages')],
    [Markup.button.callback('📖 اختر السورة', 'quran_surahs')],
    [Markup.button.callback('🔍 البحث', 'quran_search')],
    [Markup.button.callback('🔙 العودة', 'sheikh_panel')]
  ]);

  await ctx.reply(
    '🕌 *المصحف الشريف*\n\nاختر خياراً:',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function showLanguages(ctx) {
  const languages = [
    { name: 'العربية', code: 'ar' },
    { name: 'English', code: 'en' },
    { name: 'Français', code: 'fr' },
    { name: 'Español', code: 'es' },
    { name: 'Deutsch', code: 'de' },
    { name: 'Português', code: 'pt' },
    { name: 'Русский', code: 'ru' },
    { name: 'اردو', code: 'ur' },
    { name: 'فارسی', code: 'fa' },
    { name: '中文', code: 'zh' }
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
    // ... (سيتم إضافة باقي السور)
  ];

  let msg = '📖 *اختر السورة:*\n\n';
  
  const buttons = surahs.map(surah => [
    Markup.button.callback(`${surah.num}. ${surah.name}`, `quran_surah_${surah.num}`)
  ]);

  buttons.push([Markup.button.callback('🔙 العودة', 'sheikh_quran')]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    msg,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

// ── إحصائيات الشيخ ──────────────────────────────

async function sheikhStats(ctx) {
  if (![ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  const myLessons = db.getLessonsByAuthor(ctx.from.id);
  const myQuestions = db.getQuestionsByAuthor(ctx.from.id);
  const myCircles = db.getCirclesByAuthor(ctx.from.id);
  const mySermons = db.getSermonsByAuthor(ctx.from.id);

  let msg = `📊 *إحصائياتي*\n\n`;
  msg += `📚 الدروس: ${myLessons.length}\n`;
  msg += `❓ الأسئلة المجابة: ${myQuestions.filter(q => q.answered).length}\n`;
  msg += `📖 حلقات القرآن: ${myCircles.length}\n`;
  msg += `🎙️ الخطب والدروس: ${mySermons.length}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 العودة', 'sheikh_panel')]
  ]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

module.exports = {
  sheikhPanel,
  manageSecretQuestions,
  answerSecretQuestion,
  manageQuranyCircles,
  addCircle,
  manageCircle,
  uploadSermon,
  showQuranMenu,
  showLanguages,
  showSurahs,
  sheikhStats
};

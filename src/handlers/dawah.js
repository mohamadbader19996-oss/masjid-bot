// src/handlers/dawah.js
const { Markup } = require('telegraf');
const db = require('../database');
const { loadDB, saveDB } = require('../utils/db');
const { handleJourneyDayDone, handleJourneyDaySkip } = require('../utils/journeyReminder');
const registry = require('../core/actionRegistry');
const { ROLES } = require('../keyboards');
const { getBooksByCategory, getLangByCountry, BOOK_CATEGORIES } = require('../data/islamhouse');
const { getVideosByCategory, VIDEO_CATEGORIES, LANG_FLAGS } = require('../data/dawahVideos');
const {
  showVolunteerRegistration,
  startVolunteerRegistration,
  handleVolunteerTypeToggle,
  handleVolunteerTypesDone,
  handleVolunteerLangToggle,
  handleVolunteerLangsDone,
  handleVolunteerAvailToggle,
  handleVolunteerSubmit,
  handleVolunteerApprove,
  handleVolunteerReject,
  handleVolunteerToggle,
  VOLUNTEER_TYPES,
  VOLUNTEER_LANGUAGES
} = require('./volunteers');
const sendOrEdit = require('../utils/sendOrEdit');
const { playSurahAudio } = require('../utils/quranSurahAudio');
const {
  LATIN_SURAH_LABELS,
  getLatinSurahAyahCount,
  hasLatinSurah
} = require('../utils/quranLatinView');

const DAWAH_MENU_TEXT =
  '🕊️ *القسم الدعوي*\n\n﴿ادْعُ إِلَىٰ سَبِيلِ رَبِّكَ بِالْحِكْمَةِ﴾\n\nاختر ما تريد:';

function dawahMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🤖 الدعوة بالحكمة', 'ai_dawah_start')],
    [Markup.button.callback('📺 مناظرات دعوية', 'debates_menu')],
    [Markup.button.callback('💚 قصص اعتناق الإسلام', 'stories_menu')],
    [Markup.button.callback('📿 فقه الصلاة المبسّط', 'fiqh_menu_start')],
    [Markup.button.callback('📚 المكتبة الدعوية', 'dawah_library')],
    [Markup.button.callback('🎥 الفيديوهات الدعوية', 'dawah_videos')],
    [Markup.button.callback('🕊️ قراءة الفاتحة والسور القصيرة', 'dawah_latin_quran')],
    [Markup.button.callback('🌙 من دخلوا الإسلام', 'dawah_counter')],
    [Markup.button.callback('🤝 تواصل مع متطوع داعية', 'dawah_volunteer')]
  ]);
}

async function dawahMenu(ctx) {
  await ctx.reply(DAWAH_MENU_TEXT, {
    parse_mode: 'Markdown',
    ...dawahMenuKeyboard()
  });
}

async function showDawahMenuInline(ctx) {
  await safeEditMessageText(ctx, DAWAH_MENU_TEXT, {
    parse_mode: 'Markdown',
    ...dawahMenuKeyboard()
  });
}

function getUserMosque(userId) {
  const user = db.getUser(userId);
  if (user?.mosqueId) {
    return db.getMosque(user.mosqueId);
  }
  const all = db.getAllMosques();
  return Object.values(all).find(m =>
    String(m.adminId) === String(userId) ||
    String(m.createdBy) === String(userId)
  ) || null;
}

function escapeMd(text) {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

async function safeEditMessageText(ctx, text, extra = {}) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    const msg = err?.description || err?.message || '';
    if (/message is not modified/i.test(msg)) return;
    await ctx.reply(text, extra);
  }
}

async function handleDawahLatinQuran(ctx) {
  delete ctx.session.quranLatinBack;
  const rows = Object.entries(LATIN_SURAH_LABELS).map(([num, name]) => [
    Markup.button.callback(`📖 سورة ${name}`, `dawah_latin_surah_${num}`),
    Markup.button.callback('🎧', `latin_surah_audio_${num}`)
  ]);
  rows.push([Markup.button.callback('🔙 رجوع', 'dawah_menu')]);
  const text = '🕊️ <b>قراءة الفاتحة والسور القصيرة</b>\n\nاختر السورة أو استمع مباشرة (🎧):';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows), 'HTML');
}

async function handleDawahLatinSurah(ctx) {
  const surah = parseInt(ctx.match[1], 10);
  if (!hasLatinSurah(surah)) {
    return ctx.answerCbQuery('❌ غير متوفرة', { show_alert: true }).catch(() => {});
  }
  ctx.session.quranLatinBack = `dawah_latin_surah_${surah}`;
  const name = LATIN_SURAH_LABELS[surah] || String(surah);
  const count = getLatinSurahAyahCount(surah);
  const rows = [];
  rows.push([Markup.button.callback('🎧 استمع للسورة', `latin_surah_audio_${surah}`)]);
  for (let a = 1; a <= count; a++) {
    rows.push([Markup.button.callback(`الآية ${a}`, `quran_latin_${surah}_${a}`)]);
  }
  rows.push([Markup.button.callback('🔙 رجوع', 'dawah_latin_quran')]);
  const text = `🕊️ <b>سورة ${name}</b>\n\nاختر الآية لعرض النطق اللاتيني:`;
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows), 'HTML');
}

// ========== المكتبة الدعوية ==========
async function showLibraryCategories(ctx) {
  const buttons = BOOK_CATEGORIES.map(cat => {
    const icons = {
      'الكل': '📚',
      'تعريفي': '🌍',
      'عقيدة': '🕌',
      'سيرة نبوية': '📜',
      'ردود شبهات': '🔍'
    };
    return [{ text: `${icons[cat] || '📖'} ${cat}`, callback_data: `lib_cat_${cat}` }];
  });
  buttons.push([{ text: '➕ اقترح كتاباً', callback_data: 'lib_suggest' }]);
  buttons.push([{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]);

  await safeEditMessageText(ctx,
    '📚 *المكتبة الدعوية*\n\nاختر التصنيف لعرض الكتب المتاحة بلغتك:',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
  );
}

async function showBooksByCategory(ctx, category) {
  const userId = ctx.from.id;

  let langCode = 'en';
  try {
    const mosque = getUserMosque(userId);
    if (mosque && mosque.country) {
      langCode = getLangByCountry(mosque.country);
    }
  } catch (e) {
    // لا يوجد مسجد — نستخدم الإنجليزية
  }

  const dawahBooks = db.get('dawah_books') || {};
  const dbBooks = Object.values(dawahBooks).filter(b =>
    b.approved &&
    (category === 'الكل' || b.category === category)
  );

  const coreBooks = getBooksByCategory(langCode, category);

  const allBooks = [
    ...coreBooks,
    ...dbBooks.map(b => ({
      id: b.id,
      islamhouseId: b.islamhouseId || null,
      title: b.title || b.titleAr,
      url: b.url || (b.islamhouseId ? `https://islamhouse.com/${langCode}/books/${b.islamhouseId}` : null),
      category: b.category,
      addedBy: b.addedBy
    }))
  ].filter(b => b.url);

  if (allBooks.length === 0) {
    await safeEditMessageText(ctx,
      '📚 لا توجد كتب في هذا التصنيف حالياً.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 رجوع للتصنيفات', callback_data: 'dawah_library' }]]
        }
      }
    );
    return;
  }

  const catIcons = {
    'الكل': '📚', 'تعريفي': '🌍', 'عقيدة': '🕌',
    'سيرة نبوية': '📜', 'ردود شبهات': '🔍'
  };

  let text = `${catIcons[category] || '📚'} *${category}*\n\n`;
  text += `_الكتب تُعرض بلغة دولتك تلقائياً_\n\n`;

  allBooks.forEach((book, i) => {
    text += `${i + 1}. 📖 *${escapeMd(book.title)}*\n`;
    text += `[اقرأ الكتاب ←](${book.url})\n\n`;
  });

  const buttons = [
    [{ text: '➕ اقترح كتاباً', callback_data: 'lib_suggest' }],
    [{ text: '🔙 رجوع للتصنيفات', callback_data: 'dawah_library' }]
  ];

  await safeEditMessageText(ctx, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons }
  });
}

async function handleLibrarySuggest(ctx) {
  const userId = ctx.from.id;
  const user = db.getUser(userId);
  const role = user ? user.role : null;

  if (!role || role === ROLES.WORSHIPPER) {
    await ctx.answerCbQuery('❌ هذه الميزة للشيوخ والمديرين فقط', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery();
  await safeEditMessageText(ctx,
    '➕ *اقتراح كتاب دعوي*\n\n' +
    'أرسل معلومات الكتاب بهذا الشكل:\n\n' +
    '`/add_book [رقم الكتاب في islamhouse] [التصنيف]`\n\n' +
    'مثال:\n`/add_book 2851 تعريفي`\n\n' +
    '_التصنيفات المتاحة: تعريفي / عقيدة / سيرة نبوية / ردود شبهات_\n\n' +
    '⏳ سيُراجع الكتاب من المشرف قبل النشر.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'dawah_library' }]]
      }
    }
  );
}

registry.registerAction('dawah_library', async (ctx) => {
  await ctx.answerCbQuery();
  await showLibraryCategories(ctx);
}, 'المكتبة الدعوية');

registry.registerAction('dawah_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await showDawahMenuInline(ctx);
}, 'قائمة القسم الدعوي');

BOOK_CATEGORIES.forEach(cat => {
  registry.registerAction(`lib_cat_${cat}`, async (ctx) => {
    await ctx.answerCbQuery();
    await showBooksByCategory(ctx, cat);
  }, `مكتبة: ${cat}`);
});

registry.registerAction('lib_suggest', async (ctx) => {
  await handleLibrarySuggest(ctx);
}, 'اقتراح كتاب دعوي');

// ========== الفيديوهات الدعوية ==========
async function showVideoCategories(ctx) {
  const buttons = VIDEO_CATEGORIES.map(cat => {
    const icons = {
      'الكل': '🎥', 'تعريفي': '🌍',
      'قصص إسلام': '🌙', 'ردود شبهات': '🔍', 'حوارات': '💬'
    };
    return [{ text: `${icons[cat] || '🎥'} ${cat}`, callback_data: `vid_cat_${cat}` }];
  });
  buttons.push([{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]);

  await safeEditMessageText(ctx,
    '🎥 *الفيديوهات الدعوية*\n\nاختر التصنيف لعرض الفيديوهات:',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
  );
}

async function showVideosByCategory(ctx, category) {
  const userId = ctx.from.id;

  let langCode = 'en';
  try {
    const mosque = getUserMosque(userId);
    if (mosque && mosque.country) {
      langCode = getLangByCountry(mosque.country);
    }
  } catch (e) {}

  const coreVideos = getVideosByCategory(category, langCode);

  const dawahVideos = db.get('dawah_videos') || {};
  const dbVideos = Object.values(dawahVideos).filter(v =>
    v.approved && !v.frozen &&
    (category === 'الكل' || v.category === category)
  );

  const allVideos = [...coreVideos, ...dbVideos];

  if (allVideos.length === 0) {
    await safeEditMessageText(ctx,
      '🎥 لا توجد فيديوهات في هذا التصنيف حالياً.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'dawah_videos' }]]
        }
      }
    );
    return;
  }

  const catIcons = {
    'الكل': '🎥', 'تعريفي': '🌍',
    'قصص إسلام': '🌙', 'ردود شبهات': '🔍', 'حوارات': '💬'
  };

  let text = `${catIcons[category] || '🎥'} *${category}*\n\n`;
  text += `_الفيديوهات بلغتك أولاً تلقائياً_\n\n`;

  const buttons = [];
  allVideos.slice(0, 8).forEach((video, i) => {
    const flag = LANG_FLAGS[video.language] || '🌐';
    const title = video.title || video.titleAr;
    text += `${i + 1}. ${flag} *${escapeMd(title)}*\n`;
    text += `📺 ${escapeMd(video.channel || '')}\n\n`;
    const shortTitle = title.length > 30 ? `${title.substring(0, 30)}...` : title;
    buttons.push([
      { text: `▶️ شاهد: ${shortTitle}`, url: video.url },
      { text: '🚩 إبلاغ', callback_data: `vid_report_${video.id}` }
    ]);
  });

  buttons.push([{ text: '➕ اقترح فيديو', callback_data: 'vid_suggest' }]);
  buttons.push([{ text: '🔙 رجوع للتصنيفات', callback_data: 'dawah_videos' }]);

  await safeEditMessageText(ctx, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons }
  });
}

async function handleVideoReport(ctx, videoId) {
  await ctx.answerCbQuery('تم تسجيل بلاغك ✅', { show_alert: true });

  const dawahVideos = db.get('dawah_videos') || {};
  if (dawahVideos[videoId]) {
    dawahVideos[videoId].reports = (dawahVideos[videoId].reports || 0) + 1;
    if (dawahVideos[videoId].reports >= 3) {
      dawahVideos[videoId].frozen = true;
      const moderators = db.allUsers().filter(u =>
        ['MODERATOR', 'moderator', ROLES.DEVELOPER].includes(u.role)
      );
      for (const mod of moderators) {
        try {
          await ctx.telegram.sendMessage(mod.id,
            `⚠️ *تجميد فيديو دعوي*\n\nالفيديو: ${dawahVideos[videoId].title}\nالسبب: وصل لـ 3 بلاغات\n\nيرجى المراجعة.`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }
    }
    db.set('dawah_videos', dawahVideos);
  }
}

async function handleVideoSuggest(ctx) {
  const userId = ctx.from.id;
  const user = db.getUser(userId);
  const role = user ? user.role : null;

  if (!role || role === ROLES.WORSHIPPER) {
    await ctx.answerCbQuery('❌ هذه الميزة للشيوخ والمديرين فقط', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery();
  await safeEditMessageText(ctx,
    '➕ *اقتراح فيديو دعوي*\n\n' +
    'أرسل رابط الفيديو بهذا الشكل:\n\n' +
    '`/add_video [رابط YouTube] [التصنيف] [اللغة]`\n\n' +
    'مثال:\n`/add_video https://youtube.com/watch?v=xxx تعريفي de`\n\n' +
    '_التصنيفات: تعريفي / قصص إسلام / ردود شبهات / حوارات_\n' +
    '_اللغات: ar / de / en / fr / tr / ru_\n\n' +
    '⏳ سيُراجع الفيديو من المشرف قبل النشر.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'dawah_videos' }]]
      }
    }
  );
}

registry.registerAction('dawah_videos', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🎥 *الفيديوهات الدعوية*\n\n⏳ قريباً إن شاء الله!\n\nنعمل على تجميع أفضل المحتوى الدعوي بلغات متعددة.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]]
      }
    }
  );
}, 'الفيديوهات الدعوية');

VIDEO_CATEGORIES.forEach(cat => {
  registry.registerAction(`vid_cat_${cat}`, async (ctx) => {
    await ctx.answerCbQuery();
    await showVideosByCategory(ctx, cat);
  }, `فيديو: ${cat}`);
});

registry.registerAction('vid_suggest', async (ctx) => {
  await handleVideoSuggest(ctx);
}, 'اقتراح فيديو دعوي');

registry.registerAction(/^vid_report_(.+)$/, async (ctx) => {
  await handleVideoReport(ctx, ctx.match[1]);
}, 'إبلاغ عن فيديو دعوي');

registry.registerAction('dawah_volunteer', async (ctx) => {
  await ctx.answerCbQuery();
  await showContactVolunteer(ctx);
}, 'تواصل مع متطوع داعية');

// ========== callbacks المتطوعين ==========
registry.registerAction('vol_start_reg', async (ctx) => {
  await startVolunteerRegistration(ctx);
}, 'بدء تسجيل متطوع');

registry.registerAction('vol_stats', async (ctx) => {
  await ctx.answerCbQuery();
  const volunteers = db.get('volunteers') || {};
  const active = Object.values(volunteers).filter(v => v.active).length;
  const pending = Object.values(volunteers).filter(v => !v.active && !v.rejectedByAdmin).length;
  const totalServed = Object.values(volunteers).reduce((sum, v) => sum + (v.totalServed || 0), 0);
  await ctx.editMessageText(
    '📊 *إحصائيات التطوع الدعوي*\n\n' +
    `✅ متطوعون نشطون: ${active}\n` +
    `⏳ طلبات قيد المراجعة: ${pending}\n` +
    `🌟 إجمالي من تم خدمتهم: ${totalServed}\n\n` +
    '_كن أحد هؤلاء المتطوعين! 🤝_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ سجّل كمتطوع', callback_data: 'vol_start_reg' }],
          [{ text: '🔙 رجوع', callback_data: 'vol_stats' }]
        ]
      }
    }
  );
}, 'إحصائيات التطوع الدعوي');

registry.registerAction('vol_toggle', async (ctx) => {
  await handleVolunteerToggle(ctx);
}, 'تفعيل/إيقاف تطوع');

registry.registerAction('vol_edit', async (ctx) => {
  await ctx.answerCbQuery();
  await startVolunteerRegistration(ctx);
}, 'تعديل بيانات متطوع');

registry.registerAction('vol_types_done', async (ctx) => {
  await handleVolunteerTypesDone(ctx);
}, 'تأكيد أنواع التطوع');

registry.registerAction('vol_gender_male', async (ctx) => {
  const { handleVolunteerGenderSelect } = require('./volunteers');
  await handleVolunteerGenderSelect(ctx, 'male');
}, 'جنس متطوع: ذكر');

registry.registerAction('vol_gender_female', async (ctx) => {
  const { handleVolunteerGenderSelect } = require('./volunteers');
  await handleVolunteerGenderSelect(ctx, 'female');
}, 'جنس متطوع: أنثى');

registry.registerAction('vol_types_back', async (ctx) => {
  await ctx.answerCbQuery();
  const { showVolunteerTypeSelection } = require('./volunteers');
  await showVolunteerTypeSelection(ctx);
}, 'رجوع لاختيار أنواع التطوع');

registry.registerAction('vol_langs_done', async (ctx) => {
  await handleVolunteerLangsDone(ctx);
}, 'تأكيد لغات المتطوع');

registry.registerAction('vol_submit', async (ctx) => {
  await handleVolunteerSubmit(ctx);
}, 'إرسال طلب التطوع');

Object.keys(VOLUNTEER_TYPES).forEach(typeKey => {
  registry.registerAction(`vol_type_${typeKey}`, async (ctx) => {
    await handleVolunteerTypeToggle(ctx, typeKey);
  }, `نوع تطوع: ${typeKey}`);
});

Object.keys(VOLUNTEER_LANGUAGES).forEach(langKey => {
  registry.registerAction(`vol_lang_${langKey}`, async (ctx) => {
    await handleVolunteerLangToggle(ctx, langKey);
  }, `لغة متطوع: ${langKey}`);
});

const AVAIL_KEYS = ['morning', 'afternoon', 'evening', 'anytime'];
AVAIL_KEYS.forEach(availKey => {
  registry.registerAction(`vol_avail_${availKey}`, async (ctx) => {
    await handleVolunteerAvailToggle(ctx, availKey);
  }, `توفر متطوع: ${availKey}`);
});

// ========== التحدث مع متطوع ==========
async function showContactVolunteer(ctx, page = 0) {
  const { getContactLanguageButtons } = require('./volunteers');
  const buttons = getContactLanguageButtons(page);
  buttons.push([{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]);

  await safeEditMessageText(ctx,
    '💬 *تواصل مع متطوع داعية*\n\n' +
    'نربطك بمسلم متطوع يتكلم لغتك.\n\n' +
    '🌍 اختر لغتك:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }
  );
}

async function findVolunteerByLanguage(ctx, langCode) {
  await ctx.answerCbQuery();
  const dbData = loadDB();
  const userId = ctx.from.id;
  const volunteers = dbData.volunteers || {};
  const available = Object.values(volunteers).filter(v =>
    v.active &&
    v.languages.includes(langCode) &&
    v.types.includes('dawah_chat') &&
    (v.currentAssignments || 0) < (v.maxAssignments || 2)
  );

  if (available.length === 0) {
    await safeEditMessageText(ctx,
      '😔 *لا يوجد متطوع متاح بهذه اللغة الآن*\n\n' +
      'نعتذر منك — سنعمل على توفير المزيد من المتطوعين.\n\n' +
      'يمكنك في هذه الأثناء:\n' +
      '🤖 التحدث مع مساعدنا الذكي\n' +
      '📚 تصفح المكتبة الدعوية',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🤖 الدعوة بالحكمة', callback_data: 'ai_dawah_start' }],
            [{ text: '📚 المكتبة الدعوية', callback_data: 'dawah_library' }],
            [{ text: '🔙 رجوع', callback_data: 'dawah_volunteer' }]
          ]
        }
      }
    );
    return;
  }

  const volunteer = available.sort((a, b) =>
    (a.currentAssignments || 0) - (b.currentAssignments || 0)
  )[0];

  const requestId = `req_${Date.now()}`;
  if (!dbData.dawah_requests) dbData.dawah_requests = {};
  dbData.dawah_requests[requestId] = {
    id: requestId,
    type: 'dawah_chat',
    requesterId: userId,
    requesterName: ctx.from.first_name,
    volunteerId: volunteer.userId,
    language: langCode,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  dbData.volunteers[volunteer.userId].currentAssignments =
    (dbData.volunteers[volunteer.userId].currentAssignments || 0) + 1;
  saveDB(dbData);

  try {
    await ctx.telegram.sendMessage(
      volunteer.userId,
      `💬 *طلب تواصل دعوي جديد*\n\n` +
      `شخص مهتم بالإسلام يريد التحدث معك\n` +
      `اللغة: ${VOLUNTEER_LANGUAGES[langCode]}\n` +
      `الاسم: ${ctx.from.first_name}\n\n` +
      `هل أنت متاح الآن؟`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ نعم متاح', callback_data: `vol_accept_${requestId}` },
              { text: '❌ غير متاح الآن', callback_data: `vol_decline_${requestId}` }
            ]
          ]
        }
      }
    );
  } catch (e) {}

  await safeEditMessageText(ctx,
    '⏳ *جاري البحث عن متطوع مناسب...*\n\n' +
    'أرسلنا طلبك لمتطوع يتكلم لغتك.\n' +
    'سنخطرك فور قبوله. 🌟\n\n' +
    '_عادةً ما يستجيب المتطوع خلال دقائق_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 رجوع للقسم الدعوي', callback_data: 'dawah_menu' }]
        ]
      }
    }
  );
}

async function handleVolunteerAccept(ctx, requestId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const request = db.dawah_requests?.[requestId];
  if (!request) {
    await ctx.answerCbQuery('❌ الطلب غير موجود', { show_alert: true });
    return;
  }

  request.status = 'accepted';
  request.acceptedAt = new Date().toISOString();
  saveDB(db);

  const contactMsg = buildContactLink(
    db.volunteers[request.volunteerId],
    db
  );

  try {
    await ctx.telegram.sendMessage(
      request.requesterId,
      `✅ *وجدنا لك متطوعاً!*\n\n` +
      `${contactMsg}\n\n` +
      `_نسأل الله أن يكون هذا اللقاء بداية خير_ 🌟`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
  } catch (e) {}

  const volunteer = db.volunteers[request.volunteerId];
  const volunteerExtra = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🕊️ تثبيت موعد الشهادة', callback_data: `shahada_schedule_${requestId}` }]
      ]
    }
  };

  try {
    await ctx.telegram.sendMessage(
      request.volunteerId,
      `✅ *شكراً على قبولك!*\n\n` +
      `${buildRequesterContactLink(request, db)}\n\n` +
      `_نسأل الله أن يجعل هذا اللقاء في ميزان حسناتك_ 🌙`,
      { parse_mode: 'Markdown', ...volunteerExtra }
    );
  } catch (e) {}

  await safeEditMessageText(ctx,
    '✅ *تم قبول الطلب بنجاح!*\n\n' +
    'تم إرسال بيانات التواصل لكلا الطرفين.\n' +
    'جزاك الله خيراً! 🌟',
    { parse_mode: 'Markdown' }
  );
}

async function saveShahadaAppointment(ctx, db, session, note) {
  const userId = ctx.from.id;
  const requestId = session.requestId;
  const request = db.dawah_requests?.[requestId];
  if (!request) return;

  if (!db.shahada_appointments) db.shahada_appointments = {};
  db.shahada_appointments[requestId] = {
    id: requestId,
    requestId,
    volunteerId: request.volunteerId,
    requesterId: request.requesterId,
    date: session.proposedDate,
    note: note || null,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };

  delete db.sessions[userId];
  saveDB(db);

  await ctx.reply(
    '🕊️ *تم تثبيت موعد الشهادة!*\n\n' +
    `📅 ${session.proposedDate}\n` +
    (note ? `📝 ${note}\n\n` : '\n') +
    'سيتم إبلاغ الطالب بالموعد. جزاك الله خيراً 🌟\n\n' +
    '_بعد إتمام الشهادة فعلاً في المسجد، اضغط الزر أدناه:_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ تمت الشهادة فعلاً', callback_data: `shahada_confirm_${requestId}` }]
        ]
      }
    }
  );

  try {
    await ctx.telegram.sendMessage(
      request.requesterId,
      '🕊️ *موعد الشهادة*\n\n' +
      'اقترح المتطوع الموعد التالي:\n' +
      `📅 *${session.proposedDate}*\n` +
      (note ? `📝 ${note}\n\n` : '\n') +
      '_تواصل مع المتطوع لتأكيد الموعد_',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
}

function getNewMuslimFirstName(name) {
  return String(name || 'مسلم جديد').trim().split(/\s+/)[0];
}

async function notifyCompanionFiqhJourneyStart(telegram, newMuslim) {
  if (!newMuslim?.companionId) return;
  const firstName = getNewMuslimFirstName(newMuslim.name);
  try {
    await telegram.sendMessage(
      newMuslim.companionId,
      `🤲 مسلمنا الجديد ${firstName} بدأ رحلته مع الإسلام اليوم!\n\n` +
      'ساعده على تعلم الصلاة عملياً — لقد أرسلنا له شرحاً مبسّطاً للبدء، دورك الآن الجلسة التطبيقية معه 🕌'
    );
  } catch (e) {}
}

async function sendNewMuslimWelcomeAfterShahada(telegram, newMuslimId, newMuslim) {
  const isFemale = newMuslim?.gender === 'female';
  const welcomeText = isFemale
    ? '🌙 *السلام عليكِ، وأهلاً بكِ في رحاب الإسلام!*\n\n' +
      'أختنا الكريمة، أهلاً بكِ في دين الإسلام! بارك الله لكِ في إسلامكِ، ونسأل الله أن يثبّتكِ على هذا الدين العظيم.\n\n' +
      '🌱 ستبدأ معكِ رحلة تعليمية بسيطة على مدى الأيام القادمة، وسيُعيَّن لكِ مرافقة من المسجد لمساعدتكِ في كل خطوة.\n\n' +
      '_نسأل الله أن يجعل هذه بداية خير لكِ_'
    : '🌙 *السلام عليكم، وأهلاً بك في رحاب الإسلام!*\n\n' +
      'أخونا الكريم، أهلاً بك في دين الإسلام! بارك الله لك في إسلامك، ونسأل الله أن يثبّتك على هذا الدين العظيم.\n\n' +
      '🌱 ستبدأ معك رحلة تعليمية بسيطة على مدى الأيام القادمة، وسيُعيَّن لك مرافق من المسجد لمساعدتك في كل خطوة.\n\n' +
      '_نسأل الله أن يجعل هذه بداية خير لك_';
  await telegram.sendMessage(
    newMuslimId,
    welcomeText,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📿 ابدأ فقه الصلاة المبسّط', callback_data: 'fiqh_section_wudu' }]
        ]
      }
    }
  );
  await notifyCompanionFiqhJourneyStart(telegram, newMuslim);
}

async function finalizeNewMuslimRegistration(ctx, requestId, gender) {
  const db = loadDB();
  const appointment = db.shahada_appointments?.[requestId];
  if (!appointment || appointment.status !== 'awaiting_gender') {
    await ctx.answerCbQuery('❌ لا يوجد تسجيل معلّق', { show_alert: true }).catch(() => {});
    return;
  }
  const pending = appointment.pendingNewMuslim;
  if (!pending?.newMuslimId) {
    await ctx.answerCbQuery('❌ بيانات التسجيل ناقصة', { show_alert: true }).catch(() => {});
    return;
  }

  const newMuslimId = pending.newMuslimId;
  const isNewMuslim = String(ctx.from.id) === String(newMuslimId);
  const isVolunteer = String(appointment.volunteerId) === String(ctx.from.id);
  const callerRole = db.users?.[ctx.from.id]?.role;
  const isStaff = ['sheikh', 'admin', 'developer'].includes(callerRole);
  const isConfirmer = String(appointment.confirmedBy) === String(ctx.from.id);
  if (!isNewMuslim && !isVolunteer && !isStaff && !isConfirmer) {
    await ctx.answerCbQuery('❌ غير مخوّل لإكمال التسجيل', { show_alert: true }).catch(() => {});
    return;
  }

  appointment.status = 'completed';
  if (!db.new_muslims) db.new_muslims = {};
  db.new_muslims[newMuslimId] = {
    userId: newMuslimId,
    name: pending.name,
    gender,
    mosqueId: pending.mosqueId,
    shahadaDate: pending.shahadaDate,
    shahadaConfirmedAt: pending.shahadaConfirmedAt,
    witnessedBy: pending.witnessedBy,
    companionId: null,
    companionHistory: [],
    currentDay: 0,
    daysCompleted: [],
    journeyStatus: 'awaiting_companion',
    createdAt: new Date().toISOString()
  };
  delete appointment.pendingNewMuslim;
  saveDB(db);

  await ctx.answerCbQuery('✅ تم').catch(() => {});
  if (ctx.callbackQuery?.message) {
    const ackText = isNewMuslim
      ? '✅ *شكراً!*\n\nسيبدأ مرافقك رحلتك التعليمية قريباً 🌱'
      : `✅ *تم تسجيل ${pending.name}*\n\nالجنس: ${gender === 'female' ? 'أنثى 🧕' : 'ذكر 🧔'}`;
    await ctx.editMessageText(ackText, { parse_mode: 'Markdown' }).catch(() => {});
  }

  if (!isNewMuslim) {
    await ctx.reply(
      '✅ *تم تسجيل الشهادة بنجاح!*\n\n' +
      `🌱 ${pending.name} أصبح مسلماً جديداً، بإذن الله\n\n` +
      'جزاك الله خيراً على هذا العمل المبارك 🌟',
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }

  try {
    await sendNewMuslimWelcomeAfterShahada(ctx.telegram, newMuslimId, db.new_muslims[newMuslimId]);
  } catch (e) {}

  const mosqueId = pending.mosqueId;
  if (mosqueId) {
    const mosque = db.mosques?.[mosqueId];
    const adminId = mosque?.adminId;
    if (adminId) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          '🌱 *مسلم جديد في مسجدكم!*\n\n' +
          `الاسم: ${pending.name}\n` +
          `تاريخ الشهادة: ${pending.shahadaDate}\n\n` +
          '_يحتاج لتعيين مرافق لمتابعة رحلته التعليمية_',
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      } catch (e) {}
    }
  }
  await suggestCompanionForNewMuslim(ctx, newMuslimId);
}

function buildShahadaGenderKeyboard(requestId) {
  return {
    inline_keyboard: [
      [
        { text: '🧔 أخ (ذكر)', callback_data: `shahada_gender_male_${requestId}` },
        { text: '🧕 أخت (أنثى)', callback_data: `shahada_gender_female_${requestId}` }
      ]
    ]
  };
}

async function handleShahadaGenderSelect(ctx, requestId, gender) {
  await finalizeNewMuslimRegistration(ctx, requestId, gender);
}

async function handleShahadaConfirm(ctx, requestId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const appointment = db.shahada_appointments?.[requestId];
  if (!appointment) {
    await ctx.answerCbQuery('❌ لم يُعثر على موعد الشهادة', { show_alert: true });
    return;
  }
  const isVolunteer = String(appointment.volunteerId) === String(ctx.from.id);
  const callerRole = db.users?.[ctx.from.id]?.role;
  const isSheikhOrAdmin = ['sheikh', 'admin', 'developer'].includes(callerRole);
  if (!isVolunteer && !isSheikhOrAdmin) {
    await ctx.answerCbQuery('❌ غير مخوّل لتأكيد هذه الشهادة', { show_alert: true });
    return;
  }
  if (appointment.status === 'completed') {
    await ctx.answerCbQuery('✅ تم تسجيل هذه الشهادة مسبقاً', { show_alert: true });
    return;
  }
  if (appointment.status === 'awaiting_gender') {
    await ctx.answerCbQuery('⏳ في انتظار اختيار الجنس لإكمال التسجيل', { show_alert: true });
    return;
  }
  const request = db.dawah_requests?.[requestId];
  const newMuslimId = request?.requesterId;
  if (!newMuslimId) {
    await ctx.answerCbQuery('❌ لم يُعثر على بيانات الطالب', { show_alert: true });
    return;
  }
  appointment.status = 'awaiting_gender';
  appointment.completedAt = new Date().toISOString();
  appointment.confirmedBy = ctx.from.id;
  let mosqueId = db.users?.[appointment.volunteerId]?.mosqueId || null;
  if (!mosqueId && db.mosque_roles) {
    for (const [mId, roles] of Object.entries(db.mosque_roles)) {
      if (roles[appointment.volunteerId]) {
        mosqueId = mId;
        break;
      }
    }
  }
  appointment.pendingNewMuslim = {
    newMuslimId,
    name: request.requesterName || 'مسلم جديد',
    mosqueId,
    shahadaDate: appointment.date,
    shahadaConfirmedAt: appointment.completedAt,
    witnessedBy: ctx.from.id
  };
  saveDB(db);

  const genderPrompt =
    'لنخصّص رحلتك التعليمية بشكل أفضل — أنت:';
  const genderKeyboard = buildShahadaGenderKeyboard(requestId);

  await ctx.reply(
    '✅ *تم تأكيد الشهادة*\n\n' +
    `🌱 ${request.requesterName || 'مسلم جديد'}\n\n` +
    '_أُرسل للمسلم الجديد سؤال الجنس لإكمال التسجيل — إلزامي قبل بدء الرحلة_',
    { parse_mode: 'Markdown' }
  );

  try {
    await ctx.telegram.sendMessage(newMuslimId, genderPrompt, {
      reply_markup: genderKeyboard
    });
  } catch (e) {
    await ctx.reply(
      '⚠️ *تعذّر إرسال السؤال للمسلم الجديد*\n\n' +
      'حدّد جنسه لإكمال التسجيل:',
      { parse_mode: 'Markdown', reply_markup: genderKeyboard }
    );
  }
}

function pickCompanionCandidate(candidates, newMuslimGender) {
  const preferredGender = newMuslimGender === 'female' ? 'female' : 'male';
  const matched = candidates.filter((v) => (v.gender || 'male') === preferredGender);
  if (matched.length > 0) {
    return { candidate: matched[0], genderMismatch: false };
  }
  return { candidate: candidates[0], genderMismatch: candidates.length > 0 };
}

async function suggestCompanionForNewMuslim(ctx, newMuslimId) {
  const db = loadDB();
  const newMuslim = db.new_muslims?.[newMuslimId];
  if (!newMuslim) return;
  const mosqueId = newMuslim.mosqueId;
  const mosque = db.mosques?.[mosqueId];
  const adminId = mosque?.adminId;
  const volunteers = db.volunteers || {};
  const candidates = Object.values(volunteers).filter(v =>
    v.active &&
    v.types?.includes('new_muslim_companion') &&
    (db.users?.[v.userId]?.mosqueId === mosqueId) &&
    (v.currentAssignments || 0) < (v.maxAssignments || 2)
  ).sort((a, b) => (a.currentAssignments || 0) - (b.currentAssignments || 0));
  if (!adminId) return;
  if (candidates.length === 0) {
    try {
      await ctx.telegram.sendMessage(
        adminId,
        `🤝 *لا يوجد مرافق متاح حالياً*\n\n` +
        `🌱 ${newMuslim.name} يحتاج لمرافق لمتابعة رحلته التعليمية\n\n` +
        `_يرجى تعيين مرافق يدوياً عند توفر أحد_`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
    return;
  }
  const { candidate, genderMismatch } = pickCompanionCandidate(candidates, newMuslim.gender);
  const genderNote = genderMismatch
    ? (newMuslim.gender === 'female'
      ? '\n\n⚠️ _لم يُعثر على مرافقة أنثى — اقترحنا مرافقاً متاحاً_'
      : '\n\n⚠️ _لم يُعثر على مرافق ذكر — اقترحنا مرافقة متاحة_')
    : '';
  newMuslim.suggestedCompanionId = candidate.userId;
  newMuslim.journeyStatus = 'companion_suggested';
  saveDB(db);
  try {
    await ctx.telegram.sendMessage(
      adminId,
      `🤝 *مرافق مقترح لمسلم جديد*\n\n` +
      `🌱 المسلم الجديد: ${newMuslim.name}\n` +
      `👤 المرافق المقترح: ${candidate.name || 'بدون اسم'}\n` +
      `🌐 اللغات: ${(candidate.languages || []).join(', ')}\n` +
      `📊 الحالات الحالية: ${candidate.currentAssignments || 0}${genderNote}\n\n` +
      `_اضغط لتأكيد التعيين أو رفضه_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ تأكيد التعيين', callback_data: `companion_confirm_${newMuslimId}` },
              { text: '❌ رفض', callback_data: `companion_reject_${newMuslimId}` }
            ]
          ]
        }
      }
    );
  } catch (e) {}
}

async function handleCompanionConfirm(ctx, newMuslimId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const newMuslim = db.new_muslims?.[newMuslimId];
  if (!newMuslim || !newMuslim.suggestedCompanionId) {
    await ctx.answerCbQuery('❌ لا يوجد ترشيح حالياً', { show_alert: true });
    return;
  }
  const companionId = newMuslim.suggestedCompanionId;
  newMuslim.companionId = companionId;
  newMuslim.companionHistory = newMuslim.companionHistory || [];
  newMuslim.companionHistory.push({ companionId, assignedAt: new Date().toISOString() });
  newMuslim.journeyStatus = 'active';
  delete newMuslim.suggestedCompanionId;
  if (db.volunteers?.[companionId]) {
    db.volunteers[companionId].currentAssignments = (db.volunteers[companionId].currentAssignments || 0) + 1;
  }
  saveDB(db);
  await ctx.reply('✅ *تم تعيين المرافق بنجاح*', { parse_mode: 'Markdown' });
  try {
    await ctx.telegram.sendMessage(
      companionId,
      `🤝 *تم تعيينك مرافقاً!*\n\n` +
      `🌱 المسلم الجديد: ${newMuslim.name}\n\n` +
      `_ستبدأ رحلة الأربعين يوماً معه قريباً_\n` +
      `_تذكير: دورك تربوي وتنظيمي فقط — أي سؤال فقهي دقيق حوّله للمساعد الديني أو الشيخ_`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  } catch (e) {}
  try {
    await ctx.telegram.sendMessage(
      newMuslimId,
      newMuslim.gender === 'female'
        ? `🤝 *تم تعيين مرافقة لكِ!*\n\n` +
          `سيتواصل معكِ قريباً لبدء رحلتكِ التعليمية، بإذن الله`
        : `🤝 *تم تعيين مرافق لك!*\n\n` +
          `سيتواصل معك قريباً لبدء رحلتك التعليمية، بإذن الله`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  } catch (e) {}
}

async function handleCompanionReject(ctx, newMuslimId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const newMuslim = db.new_muslims?.[newMuslimId];
  if (!newMuslim) {
    await ctx.answerCbQuery('❌ لم يُعثر على السجل', { show_alert: true });
    return;
  }
  delete newMuslim.suggestedCompanionId;
  newMuslim.journeyStatus = 'awaiting_companion';
  saveDB(db);
  await ctx.reply('↩️ تم الرفض — يمكنك تعيين مرافق يدوياً لاحقاً', { parse_mode: 'Markdown' });
}

async function handleShahadaSchedule(ctx, requestId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const request = db.dawah_requests?.[requestId];
  if (!request || request.status !== 'accepted') {
    await ctx.answerCbQuery('❌ الطلب غير متاح', { show_alert: true });
    return;
  }
  if (String(request.volunteerId) !== String(ctx.from.id)) {
    await ctx.answerCbQuery('❌ هذا الطلب ليس لك', { show_alert: true });
    return;
  }

  if (!db.sessions) db.sessions = {};
  db.sessions[ctx.from.id] = {
    step: 'shahada_date',
    requestId,
    startedAt: Date.now()
  };
  saveDB(db);

  await ctx.reply(
    '🕊️ *تثبيت موعد الشهادة*\n\n' +
    'أرسل *التاريخ والوقت* المقترح للشهادة\n' +
    'مثال: `السبت 15 يونيو — 3 مساءً`\n\n' +
    '_يمكنك كتابة الموعد بأي صيغة واضحة_',
    { parse_mode: 'Markdown' }
  );
}

async function handleShahadaNoteSkip(ctx, requestId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const session = db.sessions?.[ctx.from.id];
  if (!session || session.step !== 'shahada_note' || session.requestId !== requestId) {
    await ctx.answerCbQuery('⚠️ ابدأ من زر تثبيت الموعد', { show_alert: true });
    return;
  }
  await saveShahadaAppointment(ctx, db, session, null);
}

async function handleShahadaScheduleInput(ctx) {
  const userId = ctx.from.id;
  const db = loadDB();
  const session = db.sessions?.[userId];
  if (!session?.step?.startsWith('shahada_')) return false;

  const requestId = session.requestId;
  const request = db.dawah_requests?.[requestId];
  if (!request || String(request.volunteerId) !== String(userId)) {
    delete db.sessions[userId];
    saveDB(db);
    return false;
  }

  if (session.startedAt && Date.now() - session.startedAt > 30 * 60 * 1000) {
    delete db.sessions[userId];
    saveDB(db);
    await ctx.reply('⏱️ انتهت مهلة الجلسة — اضغط الزر مرة أخرى لبدء من جديد.');
    return true;
  }

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  if (session.step === 'shahada_date') {
    session.proposedDate = text;
    session.step = 'shahada_note';
    saveDB(db);
    await ctx.reply(
      '✅ تم حفظ الموعد المقترح\n\n' +
      '📝 أرسل *ملاحظة اختيارية* (مكان، تفاصيل، إلخ)\n' +
      'أو اضغط «تخطي» إذا لا توجد ملاحظة',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭️ تخطي — بدون ملاحظة', callback_data: `shahada_note_skip_${requestId}` }]
          ]
        }
      }
    );
    return true;
  }

  if (session.step === 'shahada_note') {
    await saveShahadaAppointment(ctx, db, session, text);
    return true;
  }

  return false;
}

async function handleVolunteerDecline(ctx, requestId) {
  await ctx.answerCbQuery('سيتم البحث عن متطوع آخر', { show_alert: true });
  const dbData = loadDB();
  const request = dbData.dawah_requests?.[requestId];
  if (!request) return;

  if (dbData.volunteers?.[request.volunteerId]) {
    dbData.volunteers[request.volunteerId].currentAssignments =
      Math.max(0, (dbData.volunteers[request.volunteerId].currentAssignments || 1) - 1);
  }

  const available = Object.values(dbData.volunteers || {}).filter(v =>
    v.active &&
    v.languages.includes(request.language) &&
    v.types.includes('dawah_chat') &&
    v.userId !== request.volunteerId &&
    (v.currentAssignments || 0) < (v.maxAssignments || 2)
  );

  if (available.length === 0) {
    try {
      await ctx.telegram.sendMessage(
        request.requesterId,
        '😔 *نأسف — لا يوجد متطوع متاح الآن*\n\n' +
        'يمكنك المحاولة لاحقاً أو التحدث مع مساعدنا الذكي.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🤖 الدعوة بالحكمة', callback_data: 'ai_dawah_start' }]
            ]
          }
        }
      );
    } catch (e) {}
    request.status = 'no_volunteer';
    saveDB(dbData);
    await safeEditMessageText(ctx, 'تم — سيُخطر الشخص بعدم توفر متطوع.');
    return;
  }

  const newVolunteer = available[0];
  request.volunteerId = newVolunteer.userId;
  request.status = 'pending';
  dbData.volunteers[newVolunteer.userId].currentAssignments =
    (dbData.volunteers[newVolunteer.userId].currentAssignments || 0) + 1;
  saveDB(dbData);

  try {
    await ctx.telegram.sendMessage(
      newVolunteer.userId,
      `💬 *طلب تواصل دعوي*\n\n` +
      `شخص مهتم بالإسلام يريد التحدث معك\n` +
      `اللغة: ${VOLUNTEER_LANGUAGES[request.language]}\n` +
      `الاسم: ${request.requesterName}\n\n` +
      `هل أنت متاح الآن؟`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ نعم متاح', callback_data: `vol_accept_${requestId}` },
              { text: '❌ غير متاح', callback_data: `vol_decline_${requestId}` }
            ]
          ]
        }
      }
    );
  } catch (e) {}

  await safeEditMessageText(ctx, 'تم — جاري البحث عن متطوع آخر.');
}

function buildContactLink(volunteer, db) {
  const contact = volunteer.contact || { type: 'bot_only' };
  if (contact.type === 'username' && contact.value) {
    const clean = contact.value.replace('@', '');
    return `👤 تواصل معه على تيليغرام:\n[${contact.value}](https://t.me/${clean})`;
  }
  if (contact.type === 'whatsapp' && contact.value) {
    const clean = contact.value.replace(/[^0-9]/g, '');
    return `📱 تواصل عبر واتساب:\n[اضغط هنا للتواصل](https://wa.me/${clean})`;
  }
  return `💬 سيتواصل معك المتطوع هنا في البوت قريباً`;
}

function buildRequesterContactLink(request, db) {
  const requesterUser = db.users?.[request.requesterId];
  const username = requesterUser?.username;
  if (username) {
    return `👤 تواصل معه على تيليغرام:\n[@${username}](https://t.me/${username})`;
  }
  return `💬 سيتواصل معك هنا في البوت — انتظر رسالته`;
}

Object.keys(VOLUNTEER_LANGUAGES).forEach(langCode => {
  registry.registerAction(`find_volunteer_${langCode}`, async (ctx) => {
    await findVolunteerByLanguage(ctx, langCode);
  }, `البحث عن متطوع: ${langCode}`);
});

registry.registerAction(/^vol_accept_(.+)$/, async (ctx) => {
  await handleVolunteerAccept(ctx, ctx.match[1]);
}, 'قبول طلب تواصل دعوي');

registry.registerAction(/^vol_decline_(.+)$/, async (ctx) => {
  await handleVolunteerDecline(ctx, ctx.match[1]);
}, 'رفض طلب تواصل دعوي');

registry.registerAction(/^shahada_schedule_(.+)$/, async (ctx) => {
  await handleShahadaSchedule(ctx, ctx.match[1]);
}, 'تثبيت موعد الشهادة');

registry.registerAction(/^shahada_note_skip_(.+)$/, async (ctx) => {
  await handleShahadaNoteSkip(ctx, ctx.match[1]);
}, 'تخطي ملاحظة موعد الشهادة');

registry.registerAction(/^companion_confirm_(.+)$/, async (ctx) => {
  await handleCompanionConfirm(ctx, ctx.match[1]);
}, 'تأكيد تعيين مرافق لمسلم جديد');

registry.registerAction(/^companion_reject_(.+)$/, async (ctx) => {
  await handleCompanionReject(ctx, ctx.match[1]);
}, 'رفض تعيين مرافق لمسلم جديد');

registry.registerAction(/^journey_done_(.+)$/, async (ctx) => {
  await handleJourneyDayDone(ctx, ctx.match[1]);
}, 'تسجيل إكمال يوم رحلة المسلم الجديد');

registry.registerAction(/^journey_skip_(.+)$/, async (ctx) => {
  await handleJourneyDaySkip(ctx, ctx.match[1]);
}, 'تأجيل يوم رحلة المسلم الجديد');

registry.registerAction(/^journey_ask_(.+)$/, async (ctx) => {
  const { handleJourneyAskFiqh } = require('../utils/journeyReminder');
  await handleJourneyAskFiqh(ctx, ctx.match[1]);
}, 'سؤال فقهي من رحلة المسلم الجديد');

registry.registerAction(/^journey_transfer_pick_(.+)_(.+)$/, async (ctx) => {
  const { handleJourneyTransferPick } = require('../utils/journeyReminder');
  await handleJourneyTransferPick(ctx, ctx.match[1], ctx.match[2]);
}, 'اختيار مرافق جديد للنقل');

registry.registerAction(/^journey_transfer_(.+)$/, async (ctx) => {
  const { handleJourneyTransferStart } = require('../utils/journeyReminder');
  await handleJourneyTransferStart(ctx, ctx.match[1]);
}, 'بدء نقل مسؤولية المرافقة');

registry.registerAction(/^shahada_confirm_(.+)$/, async (ctx) => {
  await handleShahadaConfirm(ctx, ctx.match[1]);
}, 'تأكيد إتمام الشهادة');

registry.registerAction(/^shahada_gender_male_(.+)$/, async (ctx) => {
  await handleShahadaGenderSelect(ctx, ctx.match[1], 'male');
}, 'اختيار جنس ذكر عند الشهادة');

registry.registerAction(/^shahada_gender_female_(.+)$/, async (ctx) => {
  await handleShahadaGenderSelect(ctx, ctx.match[1], 'female');
}, 'اختيار جنس أنثى عند الشهادة');

registry.registerAction(/^contact_lang_page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const page = parseInt(ctx.match[1], 10);
  await showContactVolunteer(ctx, page);
}, 'تنقل صفحات لغات التواصل');

registry.registerAction(/^vol_lang_page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const page = parseInt(ctx.match[1], 10);
  const { showVolunteerLanguageSelection } = require('./volunteers');
  await showVolunteerLanguageSelection(ctx, page);
}, 'تنقل صفحات لغات التطوع');

registry.registerAction('vol_contact_step', async (ctx) => {
  await ctx.answerCbQuery();
  const dbData = loadDB();
  const reg = dbData.volunteer_reg?.[ctx.from.id];
  if (!reg?.availability?.length) {
    await ctx.answerCbQuery('⚠️ اختر وقت توفر واحد على الأقل', { show_alert: true });
    return;
  }
  const { showVolunteerContactStep } = require('./volunteers');
  await showVolunteerContactStep(ctx);
}, 'خطوة طريقة التواصل');

registry.registerAction('vol_avail_back', async (ctx) => {
  await ctx.answerCbQuery();
  const { showVolunteerAvailability } = require('./volunteers');
  await showVolunteerAvailability(ctx);
}, 'رجوع لاختيار التوفر');

registry.registerAction('vol_contact_username', async (ctx) => {
  const { handleVolunteerContactChoice } = require('./volunteers');
  await handleVolunteerContactChoice(ctx, 'username');
}, 'تواصل عبر username');

registry.registerAction('vol_contact_whatsapp', async (ctx) => {
  const { handleVolunteerContactChoice } = require('./volunteers');
  await handleVolunteerContactChoice(ctx, 'whatsapp');
}, 'تواصل عبر واتساب');

registry.registerAction('vol_contact_bot_only', async (ctx) => {
  const { handleVolunteerContactChoice } = require('./volunteers');
  await handleVolunteerContactChoice(ctx, 'bot_only');
}, 'تواصل عبر البوت فقط');

registry.registerAction('dawah_latin_quran', handleDawahLatinQuran, 'قراءة الفاتحة والسور القصيرة');
registry.registerAction(/^dawah_latin_surah_(\d+)$/, handleDawahLatinSurah, 'اختيار سورة للنطق اللاتيني');

registry.registerAction(/^country_select_(\d+)$/, async (ctx) => {
  const index = ctx.match[1];
  const { handleCountrySelect } = require('./volunteers');
  await handleCountrySelect(ctx, index);
}, 'اختيار رمز الدولة للواتساب');

registry.registerAction(/^country_page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1], 10);
  const { handleCountryPage } = require('./volunteers');
  await handleCountryPage(ctx, page);
}, 'تنقل صفحات اختيار الدولة');

registry.registerAction('country_page_noop', async (ctx) => {
  await ctx.answerCbQuery();
}, 'زر عرض رقم الصفحة (بدون إجراء)');

module.exports = {
  dawahMenu,
  showLibraryCategories,
  handleShahadaScheduleInput,
  handleCompanionConfirm,
  handleCompanionReject,
  sendNewMuslimWelcomeAfterShahada,
  notifyCompanionFiqhJourneyStart
};

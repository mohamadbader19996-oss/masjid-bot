const { Markup } = require('telegraf');
const axios = require('axios');
const db = require('../database');
const { mainKeyboard, ROLES, CANCEL_BUTTON } = require('../keyboards');
const geminiService = require('../services/gemini');

const PHOTO_VISION_SYSTEM =
  'أنت مساعد ديني إسلامي متخصص.\n' +
  'المستخدم أرسل صورة - اقرأها وافهمها:\n' +
  '- إذا كانت صورة نص ديني أو آية أو حديث: اشرحه وأضف أدلة\n' +
  '- إذا كانت صورة سؤال مكتوب: أجب عليه\n' +
  '- إذا كانت صورة كتاب أو صفحة دينية: اقرأها وحللها\n' +
  '- إذا لم تكن دينية: قل (أنا مخصص للأسئلة الدينية فقط)\n' +
  'رد بنفس لغة المستخدم تلقائياً';

const RELIGIONS = {
  MUSLIM: 'muslim',
  CHRISTIAN: 'christian',
  JEWISH: 'jewish',
  SECULAR: 'secular'
};

const RELIGION_LABELS = {
  muslim: 'مسلم 🌙',
  christian: 'مسيحي ✝️',
  jewish: 'يهودي ✡️',
  secular: 'غير متدين 🤔'
};

const MADHAB_LABELS = {
  hanafi: 'الحنفي',
  maliki: 'المالكي',
  shafii: 'الشافعي',
  hanbali: 'الحنبلي',
  unknown: 'غير محدد (مقارنة المذاهب)'
};

const SECT_LABELS = {
  catholic: 'كاثوليكي ⛪',
  christian_orthodox: 'أرثوذكسي 🕍',
  protestant: 'بروتستانتي 📖',
  christian_unknown: 'غير محدد',
  jewish_orthodox: 'أرثوذكسي',
  conservative: 'محافظ',
  reform: 'إصلاحي',
  jewish_unknown: 'غير محدد'
};

const NON_RELIGIOUS_REPLY = 'أنا مخصص للأسئلة الدينية فقط';
const MUSLIM_WARNING = geminiService.MUSLIM_ANSWER_FOOTER;
const KHUTBAH_WARNING = '⚠️ راجع هذه الخطبة قبل إلقائها';
const PROHIBITED_TOPIC_REPLY = 'هذه المسألة تحتاج شيخاً متخصصاً - لا أستطيع الإجابة عليها';
const NO_EVIDENCE_REPLY = 'لا أعلم - تواصل مع شيخ';

const MUSLIM_GUIDELINES_TEXT =
  '🌙 أخي المسلم / أختي المسلمة\n\n' +
  '⚠️ *ضوابط شرعية مهمة قبل البدء:*\n\n' +
  '1. الشرع الإسلامي يُحرّم الفتوى بغير علم\n' +
  '2. هذا المساعد يبحث لك فقط - ليس مفتياً\n' +
  '3. لا يُجيب إلا بدليل واضح من القرآن أو السنة الصحيحة\n' +
  '4. إن لم يجد دليلاً سيقول: لا أعلم\n\n' +
  '❌ *مسائل لا يغطيها - يجب الرجوع لشيخ:*\n' +
  '- الطلاق وما يتعلق به\n' +
  '- الميراث والوصايا\n' +
  '- العقود والمعاملات المعقدة\n' +
  '- الفتاوى الشخصية الحساسة\n\n' +
  'هل تريد المتابعة؟';

const PROHIBITED_TOPIC_PATTERNS = [
  /طلاق|مطلقة|مطلق|خلع|عدة|إيلاء|ظهار/i,
  /ميراث|ورث|تركة|وصية|مواريث/i,
  /عقد|معاملة|رهن|كفالة|ضمان|بيع.*معقد|شراكة/i,
  /فتوى شخصية|حالة خاصة|وضعي الشخصي/i
];

const BASE_SYSTEM_PROMPT =
  'أنت مساعد ديني متخصص للحوار بين الأديان.\n' +
  'قواعد:\n' +
  '1. أجب على كل سؤال ديني أو وجودي بإجابة مفيدة مع الأدلة\n' +
  `2. فقط إذا كان السؤال غير ديني تماماً (مثل الطبخ أو الرياضة أو الطقس) قل بالضبط: '${NON_RELIGIOUS_REPLY}'\n` +
  '3. لا تجادل ولا تهاجم أي دين\n' +
  '4. استخدم أدلة من القرآن والكتاب المقدس والتوراة والعقل حسب السياق\n' +
  '5. رد بنفس لغة المستخدم تلقائياً\n' +
  '6. أسلوبك: محبة، احترام، حكمة\n';

function isScholarRole(role) {
  return [ROLES.SHEIKH, ROLES.ADMIN, ROLES.DEVELOPER].includes(role);
}

function hasMuslimGuidelinesAccepted(user) {
  return Boolean(user?.muslimGuidelinesAccepted);
}

function isMuslimSetupComplete(user) {
  return hasMuslimGuidelinesAccepted(user) && Boolean(user?.madhab);
}

function enterAiSetup(ctx, step) {
  ctx.session.aiSetupStep = step;
}

function clearAiSetup(ctx) {
  delete ctx.session.aiSetupStep;
}

function buildSystemPrompt(user, role, options = {}) {
  const { khutbahMode, scholarAdvanced } = options;
  const religion = user?.religion || RELIGIONS.MUSLIM;
  const madhabLabel = MADHAB_LABELS[user?.madhab] || MADHAB_LABELS.unknown;
  const sectLabel = SECT_LABELS[user?.sect] || 'غير محدد';

  if (scholarAdvanced) {
    return (
      BASE_SYSTEM_PROMPT +
      '7. أنت في الوضع العلمي المتقدم للمشايخ والمسؤولين:\n' +
      '   - إجابة بالإجماع والخلاف الفقهي\n' +
      '   - آراء المذاهب الأربعة مقارنة\n' +
      '   - الأحاديث الصحيحة والضعيفة مع التصنيف (صحيح، حسن، ضعيف)\n' +
      '   - أقوال العلماء والأسانيد\n' +
      `8. المذهب المرجعي: ${madhabLabel}\n` +
      '9. لا تضف رسالة التحذير في نهاية الإجابة'
    );
  }

  let prompt = BASE_SYSTEM_PROMPT;

  if (religion === RELIGIONS.MUSLIM) {
    prompt =
      'أنت مساعد إسلامي للبحث الشرعي.\n' +
      'قواعد:\n' +
      '1. أجب على كل سؤال ديني بإجابة مفيدة مع الأدلة من القرآن والسنة الصحيحة\n' +
      `2. فقط إذا كان السؤال غير ديني تماماً (مثل الطبخ أو الرياضة) قل بالضبط: '${NON_RELIGIOUS_REPLY}'\n` +
      `3. إذا كان السؤال عن طلاق أو ميراث أو عقود معقدة قل بالضبط: '${PROHIBITED_TOPIC_REPLY}'\n` +
      `4. إذا لم تجد دليلاً واضحاً اذكر ذلك وقل: '${NO_EVIDENCE_REPLY}'\n` +
      '5. رد بنفس لغة المستخدم تلقائياً\n' +
      `6. المذهب المختار: ${madhabLabel}\n` +
      `${geminiService.MUSLIM_FORMAT_PROMPT_RULE}\n`;
  } else if (religion === RELIGIONS.CHRISTIAN) {
    prompt +=
      `7. المستخدم مسيحي — طائفته: ${sectLabel}\n` +
      '8. استخدم أدلة من القرآن الكريم والإنجيل معاً\n' +
      '9. أسلوب حوار محترم لا جدال — لا تضف أزرار تواصل في النص\n';
  } else if (religion === RELIGIONS.JEWISH) {
    prompt +=
      `7. المستخدم يهودي — تياره: ${sectLabel}\n` +
      '8. استخدم أدلة من القرآن الكريم والتوراة معاً\n' +
      '9. احترام تام للدين — لا تضف أزرار تواصل في النص\n';
  } else if (religion === RELIGIONS.SECULAR) {
    prompt +=
      '7. المستخدم غير متدين أو يبحث فلسفياً\n' +
      '8. لا تبدأ بالدين مباشرة — أسلوب فلسفي وعلمي\n' +
      '9. قدم أدلة عقلية على وجود الله (الكون، الخلق، الفلسفة)\n' +
      '10. لا تضف أزرار تواصل في النص\n';
  }

  if (khutbahMode === 'write') {
    prompt +=
      '11. اكتب خطبة جمعة كاملة (مقدمة + عرض + خاتمة + دعاء) بآيات وأحاديث صحيحة موثقة\n' +
      `12. في النهاية أضف: '${KHUTBAH_WARNING}'`;
  } else if (khutbahMode === 'translate') {
    prompt += `11. ترجم الخطبة بدقة مع الحفاظ على المعنى الشرعي\n12. في النهاية أضف: '${KHUTBAH_WARNING}'`;
  } else if (khutbahMode === 'improve') {
    prompt += `11. حسّن الخطبة مع آيات وأحاديث صحيحة\n12. في النهاية أضف: '${KHUTBAH_WARNING}'`;
  }

  return prompt;
}

function religionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('مسلم 🌙', 'ai_religion_muslim')],
    [Markup.button.callback('مسيحي ✝️', 'ai_religion_christian')],
    [Markup.button.callback('يهودي ✡️', 'ai_religion_jewish')],
    [Markup.button.callback('غير متدين 🤔', 'ai_religion_secular')]
  ]);
}

function madhabKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('حنفي 🔵', 'ai_madhab_hanafi'),
      Markup.button.callback('مالكي 🟢', 'ai_madhab_maliki')
    ],
    [
      Markup.button.callback('شافعي 🟡', 'ai_madhab_shafii'),
      Markup.button.callback('حنبلي 🔴', 'ai_madhab_hanbali')
    ],
    [Markup.button.callback('لا أعرف ⚪', 'ai_madhab_unknown')]
  ]);
}

function christianSectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('كاثوليكي ⛪', 'ai_sect_catholic')],
    [Markup.button.callback('أرثوذكسي 🕍', 'ai_sect_christian_orthodox')],
    [Markup.button.callback('بروتستانتي 📖', 'ai_sect_protestant')],
    [Markup.button.callback('لا أعرف ⚪', 'ai_sect_christian_unknown')]
  ]);
}

function jewishSectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('أرثوذكسي', 'ai_sect_jewish_orthodox'),
      Markup.button.callback('محافظ', 'ai_sect_conservative')
    ],
    [
      Markup.button.callback('إصلاحي', 'ai_sect_reform'),
      Markup.button.callback('لا أعرف ⚪', 'ai_sect_jewish_unknown')
    ]
  ]);
}

function muslimGuidelinesKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ أفهم وأوافق', 'ai_muslim_accept')],
    [Markup.button.callback('📩 تواصل مع شيخ مباشرة', 'ai_muslim_contact_direct')]
  ]);
}

function listenAnswerKeyboard(extraRows = []) {
  return Markup.inlineKeyboard([
    ...extraRows,
    [Markup.button.callback('🔊 استمع للإجابة', 'ai_listen_answer')]
  ]);
}

function answerKeyboard(religion) {
  const row1 = religion === RELIGIONS.MUSLIM
    ? [
        Markup.button.callback('📩 تواصل مع شيخ', 'ai_contact_sheikh'),
        Markup.button.callback('❓ سؤال آخر', 'ai_ask_another')
      ]
    : [Markup.button.callback('❓ سؤال آخر', 'ai_ask_another')];

  return listenAnswerKeyboard([row1]);
}

function contactPromptKeyboard(religion) {
  const isSecular = religion === RELIGIONS.SECULAR;
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      isSecular ? 'نعم، أريد ذلك 📍' : 'نعم، أقرب عالم 📍',
      'ai_find_scholar'
    )],
    [Markup.button.callback('لا شكراً', 'ai_contact_no')]
  ]);
}

function khutbahAnswerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 خطبة أخرى', 'ai_scholar_menu')],
    [Markup.button.callback('❓ سؤال متقدم', 'ai_scholar_advanced')],
    [Markup.button.callback('🔙 قائمة المشايخ', 'ai_scholar_menu')]
  ]);
}

function scholarMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❓ سؤال ديني متقدم', 'ai_scholar_advanced')],
    [Markup.button.callback('📝 كتابة خطبة جمعة', 'ai_khutbah_write')],
    [Markup.button.callback('🌍 ترجمة خطبة', 'ai_khutbah_translate')],
    [Markup.button.callback('✏️ تحسين خطبة', 'ai_khutbah_improve')]
  ]);
}

const KHUTBAH_LANG_LABELS = {
  de: 'ألمانية',
  fr: 'فرنسية',
  en: 'إنجليزية',
  tr: 'تركية',
  ur: 'أوردو',
  id: 'إندونيسية',
  dari: 'دارية',
  pashto: 'باشتو'
};

function khutbahLanguageKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇩🇪 ألمانية', 'ai_khutbah_lang_de'),
      Markup.button.callback('🇫🇷 فرنسية', 'ai_khutbah_lang_fr'),
      Markup.button.callback('🇬🇧 إنجليزية', 'ai_khutbah_lang_en')
    ],
    [
      Markup.button.callback('🇹🇷 تركية', 'ai_khutbah_lang_tr'),
      Markup.button.callback('🇵🇰 أوردو', 'ai_khutbah_lang_ur'),
      Markup.button.callback('🇮🇩 إندونيسية', 'ai_khutbah_lang_id')
    ],
    [
      Markup.button.callback('🇦🇫 دارية', 'ai_khutbah_lang_dari'),
      Markup.button.callback('🇦🇫 باشتو', 'ai_khutbah_lang_pashto'),
      Markup.button.callback('🌍 لغة أخرى', 'ai_khutbah_lang_other')
    ]
  ]);
}

function scholarAnswerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❓ سؤال آخر', 'ai_scholar_advanced')],
    [Markup.button.callback('🔙 قائمة المشايخ', 'ai_scholar_menu')],
    [Markup.button.callback('🔊 استمع للإجابة', 'ai_listen_answer')]
  ]);
}

function clearAiSession(ctx) {
  delete ctx.session.aiMode;
  delete ctx.session.aiKhutbahMode;
  delete ctx.session.aiKhutbahStep;
  delete ctx.session.aiTargetLanguage;
  delete ctx.session.aiMadhabSelection;
  delete ctx.session.aiSectSelection;
  delete ctx.session.aiWaitingCity;
  delete ctx.session.aiLastQuestion;
  delete ctx.session.aiLastAnswer;
  delete ctx.session.lastAiResponse;
  delete ctx.session.aiScholarContext;
  delete ctx.session.aiScholarAdvancedMode;
  clearAiSetup(ctx);
}

function clearRegularAiSession(ctx) {
  delete ctx.session.aiMode;
  delete ctx.session.aiKhutbahMode;
  delete ctx.session.aiKhutbahStep;
  delete ctx.session.aiTargetLanguage;
  delete ctx.session.aiWaitingCity;
  delete ctx.session.aiScholarContext;
  delete ctx.session.aiScholarAdvancedMode;
  clearAiSetup(ctx);
}

function enterAiMode(ctx) {
  ctx.session.aiMode = true;
}

async function splitReply(ctx, text, extra) {
  const maxLen = 4000;
  if (text.length <= maxLen) {
    return ctx.reply(text, extra);
  }
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  for (let i = 0; i < parts.length; i++) {
    await ctx.reply(parts[i], i === parts.length - 1 ? extra : undefined);
  }
}

function ensureKhutbahWarning(text) {
  if (text.includes(KHUTBAH_WARNING)) return text;
  return `${text}\n\n${KHUTBAH_WARNING}`;
}

function stripMuslimWarning(text) {
  return text
    .replace(/━+\s*\n🌙 تنبيه شرعي:[\s\S]*?━+/g, '')
    .replace(/─+\s*\n🌙 أخي المسلم[\s\S]*?─+/g, '')
    .replace(/─+\s*\n⚠️ حكم شرعي مهم:[\s\S]*?─+/g, '')
    .replace(/⚠️ تنبيه شرعي مهم:[\s\S]*?شيخ متخصص\.?/g, '')
    .replace(/⚠️ هذا بحث علمي[\s\S]*?شيخاً/g, '')
    .trim();
}

function formatForTelegram(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/#{1,6}\s/g, '')
    .replace(/---/g, '─────────────')
    .trim();
}

function formatMuslimAnswerText(text) {
  let t = stripMuslimWarning(text).trim();
  if (!t) return t;

  t = t.replace(/\\n\\n/g, '\n\n').replace(/\\n/g, '\n');
  t = t.replace(/(?<!\n\n)(📌[^\n]*)/g, '\n\n$1');
  t = t.replace(/(?<!\n\n)(┌─)/g, '\n\n$1');
  t = t.replace(/(?<!\n)(-\s)/g, '\n$1');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function ensureMuslimWarning(text) {
  if (text.includes('🌙 تنبيه شرعي:') && text.includes('━━━━━━━━━━━━━━━')) {
    return text;
  }
  const cleaned = stripMuslimWarning(text);
  return `${cleaned}\n\n\n${MUSLIM_WARNING}`;
}

function prepareMuslimAnswer(answer) {
  return formatForTelegram(ensureMuslimWarning(formatMuslimAnswerText(answer)));
}

function isObviouslyNonReligious(text) {
  const patterns = [
    /طقس|الجو|weather/i,
    /كرة|مباراة|football|رياضة|sport/i,
    /برمجة|programming|python/i,
    /فيلم|netflix|سينما/i,
    /وصفة|طبخ|recipe|cooking/i,
    /سعر|bitcoin|عملة رقمية/i
  ];
  return patterns.some((re) => re.test(text));
}

function isNonReligiousAnswer(answer) {
  const trimmed = answer.trim();
  return trimmed === NON_RELIGIOUS_REPLY || trimmed.startsWith(`${NON_RELIGIOUS_REPLY}\n`);
}

const ttsService = require('../services/tts');

function saveLastAiResponse(ctx, answer) {
  ctx.session.lastAiResponse = answer;
  ctx.session.aiLastAnswer = answer;
}

async function replyAiAnswer(ctx, answer, user) {
  saveLastAiResponse(ctx, answer);
  await sendAnswerWithFollowUp(ctx, answer, user);
}

async function replyMuslimAnswer(ctx, answer) {
  saveLastAiResponse(ctx, answer);
  const text = prepareMuslimAnswer(answer);
  const extra = answerKeyboard(RELIGIONS.MUSLIM);
  try {
    await splitReply(ctx, text, { parse_mode: 'Markdown', ...extra });
  } catch {
    await splitReply(ctx, text, extra);
  }
}

function geminiErrorMessage(err) {
  const msg = err?.message || '';
  const parsed = geminiService.parseGeminiError(err);
  if (/GEMINI_API_KEY غير موجود/i.test(msg)) {
    return '❌ GEMINI_API_KEY غير موجود في ملف .env\nأضف مفتاحاً من: https://aistudio.google.com/apikey';
  }
  if (parsed.type === 'quota') {
    return (
      '❌ تم تجاوز حد استخدام Gemini API.\n' +
      '• انتظر حتى يُعاد تعيين الحصة اليومية\n' +
      '• أو أنشئ مفتاحاً جديداً من Google AI Studio\n' +
      '• أو فعّل الفوترة في مشروع Google Cloud'
    );
  }
  if (parsed.type === 'key') {
    return '❌ مفتاح Gemini API غير صالح.\nتحقق من GEMINI_API_KEY في ملف .env';
  }
  if (parsed.type === 'permission') {
    return '❌ صلاحية المفتاح مرفوضة.\nتحقق من تفعيل Generative Language API في Google Cloud.';
  }
  if (parsed.type === 'network') {
    return '❌ مشكلة اتصال بخوادم Google.\nجرّب إعادة تشغيل البوت أو ضبط GEMINI_TLS_INSECURE=1 في .env';
  }
  if (parsed.type === 'model') {
    return '❌ نماذج Gemini غير متاحة حالياً. حاول بعد قليل.';
  }
  console.error('[Gemini] خطأ غير مصنّف:', msg);
  return '❌ حدث خطأ أثناء الاتصال بالمساعد. حاول لاحقاً.';
}

async function askGemini(question, user, role, options = {}) {
  const mode = options.khutbahMode
    ? `khutbah_${options.khutbahMode}`
    : (options.scholarAdvanced ? 'scholar_advanced' : 'general');
  const { text } = await geminiService.askGemini(
    question,
    buildSystemPrompt(user, role, options),
    { userId: user?.id, mode }
  );
  return text;
}

function isAllowedQuestion(text) {
  return !isObviouslyNonReligious(text);
}

async function showReligionSelection(ctx) {
  clearRegularAiSession(ctx);
  enterAiSetup(ctx, 'religion');
  await ctx.reply(
    '🌟 أهلاً بك - من أنت؟',
    religionKeyboard()
  );
}

async function showMuslimGuidelines(ctx) {
  clearRegularAiSession(ctx);
  enterAiSetup(ctx, 'guidelines');
  await ctx.reply(MUSLIM_GUIDELINES_TEXT, { parse_mode: 'Markdown', ...muslimGuidelinesKeyboard() });
}

async function showMadhabSelection(ctx) {
  clearRegularAiSession(ctx);
  ctx.session.aiMadhabSelection = true;
  enterAiSetup(ctx, 'madhab');
  await ctx.reply('ما مذهبك؟', madhabKeyboard());
}

async function showChristianSectSelection(ctx) {
  clearRegularAiSession(ctx);
  ctx.session.aiSectSelection = true;
  enterAiSetup(ctx, 'sect');
  await ctx.reply('✝️ *ما طائفتك؟*', { parse_mode: 'Markdown', ...christianSectKeyboard() });
}

async function showJewishSectSelection(ctx) {
  clearRegularAiSession(ctx);
  ctx.session.aiSectSelection = true;
  enterAiSetup(ctx, 'sect');
  await ctx.reply('✡️ *ما تيارك؟*', { parse_mode: 'Markdown', ...jewishSectKeyboard() });
}

async function continueAfterSetup(ctx) {
  return promptQuestion(ctx);
}

async function promptQuestion(ctx) {
  delete ctx.session.aiScholarContext;
  delete ctx.session.aiScholarAdvancedMode;
  delete ctx.session.aiKhutbahMode;
  delete ctx.session.aiKhutbahStep;
  delete ctx.session.aiTargetLanguage;
  delete ctx.session.aiWaitingCity;
  delete ctx.session.aiMadhabSelection;
  delete ctx.session.aiSectSelection;
  clearAiSetup(ctx);
  enterAiMode(ctx);

  const user = db.getUser(ctx.from.id) || ctx.user;
  let hint = 'اكتب سؤالك الديني أو أرسل رسالة صوتية 🎤';
  if (user?.religion === RELIGIONS.SECULAR) hint = 'اكتب سؤالك الوجودي أو أرسل رسالة صوتية 🎤';
  else if (user?.religion === RELIGIONS.MUSLIM) hint = 'اكتب سؤالك الديني أو أرسل رسالة صوتية 🎤';

  await ctx.reply(
    `${hint}:\n\n(أرسل ${CANCEL_BUTTON} للخروج)`
  );
}

async function showScholarMenu(ctx) {
  if (!isScholarRole(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول لهذا القسم.');
  }
  ctx.session.aiScholarContext = true;
  enterAiMode(ctx);
  delete ctx.session.aiKhutbahMode;
  delete ctx.session.aiKhutbahStep;
  delete ctx.session.aiTargetLanguage;
  delete ctx.session.aiScholarAdvancedMode;

  await ctx.reply(
    '🕌 *المساعد الديني للمشايخ*\n\nاختر الخدمة:',
    { parse_mode: 'Markdown', ...scholarMenuKeyboard() }
  );
}

async function aiScholarMenu(ctx) {
  if (!isScholarRole(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية. هذا القسم للمشايخ والمسؤولين فقط.');
  }
  return showScholarMenu(ctx);
}

async function promptScholarAdvanced(ctx) {
  ctx.session.aiScholarContext = true;
  ctx.session.aiScholarAdvancedMode = true;
  enterAiMode(ctx);
  await ctx.reply(
    '❓ *سؤال ديني متقدم*\n\nاكتب سؤالك (إجماع، خلاف، مذاهب، أسانيد):\n\n(أرسل ' + CANCEL_BUTTON + ' للخروج)',
    { parse_mode: 'Markdown' }
  );
}

async function sendAnswerWithFollowUp(ctx, answer, user) {
  const religion = user?.religion || RELIGIONS.MUSLIM;
  saveLastAiResponse(ctx, answer);

  if (religion === RELIGIONS.MUSLIM) {
    const text = prepareMuslimAnswer(answer);
    const extra = answerKeyboard(RELIGIONS.MUSLIM);
    try {
      await splitReply(ctx, text, { parse_mode: 'Markdown', ...extra });
    } catch {
      await splitReply(ctx, text, extra);
    }
    return;
  }

  const formatted = formatForTelegram(answer);
  await splitReply(ctx, formatted, answerKeyboard(religion));

  if ([RELIGIONS.CHRISTIAN, RELIGIONS.JEWISH].includes(religion)) {
    await ctx.reply(
      '💡 هل تريد التحدث مع عالم حقيقي يجيب على أسئلتك بدون أي ضغط؟',
      contactPromptKeyboard(religion)
    );
  } else if (religion === RELIGIONS.SECULAR) {
    await ctx.reply(
      '💡 هل تريد التحدث مع شخص يجيب على أسئلتك الوجودية؟',
      contactPromptKeyboard(religion)
    );
  }
}

async function continueMuslimSetup(ctx) {
  const user = db.getUser(ctx.from.id) || ctx.user;
  if (!hasMuslimGuidelinesAccepted(user)) return showMuslimGuidelines(ctx);
  if (!user?.madhab) return showMadhabSelection(ctx);
  return promptQuestion(ctx);
}

async function aiMenu(ctx) {
  clearRegularAiSession(ctx);
  const user = db.getUser(ctx.from.id) || ctx.user;
  ctx.user = user;

  if (!user?.religion) {
    return showReligionSelection(ctx);
  }

  if (user.religion === RELIGIONS.MUSLIM) {
    if (!hasMuslimGuidelinesAccepted(user)) return showMuslimGuidelines(ctx);
    if (!user.madhab) return showMadhabSelection(ctx);
    return promptQuestion(ctx);
  }
  if (user.religion === RELIGIONS.CHRISTIAN && !user.sect) return showChristianSectSelection(ctx);
  if (user.religion === RELIGIONS.JEWISH && !user.sect) return showJewishSectSelection(ctx);

  return promptQuestion(ctx);
}

async function handleReligionSelect(ctx) {
  await ctx.answerCbQuery();
  const religion = ctx.match[1];
  const prev = ctx.user?.religion;
  const updates = { religion };

  if (religion === RELIGIONS.MUSLIM) {
    if (prev !== RELIGIONS.MUSLIM) {
      updates.muslimGuidelinesAccepted = false;
      updates.sect = undefined;
    }
  } else {
    updates.madhab = undefined;
    updates.muslimGuidelinesAccepted = false;
    if (religion === RELIGIONS.CHRISTIAN || religion === RELIGIONS.JEWISH) {
      if (prev !== religion) updates.sect = undefined;
    } else {
      updates.sect = undefined;
    }
  }

  db.saveUser(ctx.from.id, updates);
  ctx.user = db.getUser(ctx.from.id);
  clearAiSetup(ctx);

  await ctx.reply(`✅ تم الحفظ: *${RELIGION_LABELS[religion]}*`, { parse_mode: 'Markdown' });

  if (religion === RELIGIONS.MUSLIM) {
    return continueMuslimSetup(ctx);
  }
  if (religion === RELIGIONS.CHRISTIAN) {
    if (ctx.user?.sect) return continueAfterSetup(ctx);
    return showChristianSectSelection(ctx);
  }
  if (religion === RELIGIONS.JEWISH) {
    if (ctx.user?.sect) return continueAfterSetup(ctx);
    return showJewishSectSelection(ctx);
  }
  return continueAfterSetup(ctx);
}

async function handleSectSelect(ctx) {
  await ctx.answerCbQuery();
  const sect = ctx.match[1];
  db.saveUser(ctx.from.id, { sect });
  ctx.user = db.getUser(ctx.from.id);
  delete ctx.session.aiSectSelection;
  clearAiSetup(ctx);

  await ctx.reply(`✅ تم الحفظ: *${SECT_LABELS[sect] || sect}*`, { parse_mode: 'Markdown' });
  return continueAfterSetup(ctx);
}

async function handleMadhabSelect(ctx) {
  await ctx.answerCbQuery();
  const madhab = ctx.match[1];
  db.saveUser(ctx.from.id, { madhab, religion: RELIGIONS.MUSLIM });
  ctx.user = db.getUser(ctx.from.id);
  delete ctx.session.aiMadhabSelection;
  clearAiSetup(ctx);

  await ctx.reply(`✅ تم حفظ مذهبك: *${MADHAB_LABELS[madhab]}*`, { parse_mode: 'Markdown' });
  return continueAfterSetup(ctx);
}

async function handleMuslimAccept(ctx) {
  await ctx.answerCbQuery();
  db.saveUser(ctx.from.id, { muslimGuidelinesAccepted: true, religion: RELIGIONS.MUSLIM });
  ctx.user = db.getUser(ctx.from.id);
  clearAiSetup(ctx);
  return continueMuslimSetup(ctx);
}

async function handleMuslimContactDirect(ctx) {
  await ctx.answerCbQuery();
  ctx.session.aiLastQuestion = 'طلب تواصل مباشر من الضوابط الشرعية';
  saveLastAiResponse(ctx, '—');
  return routeContactToSheikh(ctx);
}

async function handleAccept(ctx) {
  await ctx.answerCbQuery();
  return showReligionSelection(ctx);
}

async function handleDecline(ctx) {
  await ctx.answerCbQuery();
  clearAiSession(ctx);
  await ctx.reply('تم الإلغاء.', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
}

async function handleScholarMenu(ctx) {
  await ctx.answerCbQuery();
  return showScholarMenu(ctx);
}

async function handleScholarAdvanced(ctx) {
  await ctx.answerCbQuery();
  return promptScholarAdvanced(ctx);
}

async function handleGeneralQuestion(ctx) {
  await ctx.answerCbQuery();
  if (ctx.session.aiScholarContext) return promptScholarAdvanced(ctx);
  return promptQuestion(ctx);
}

async function handleKhutbahWrite(ctx) {
  await ctx.answerCbQuery();
  ctx.session.aiScholarContext = true;
  enterAiMode(ctx);
  ctx.session.aiKhutbahMode = 'write';
  ctx.session.aiKhutbahStep = 'topic';
  await ctx.reply(
    '📝 *كتابة خطبة جمعة*\n\nأرسل موضوع الخطبة:\n\n(أرسل ' + CANCEL_BUTTON + ' للخروج)',
    { parse_mode: 'Markdown' }
  );
}

async function handleKhutbahTranslate(ctx) {
  await ctx.answerCbQuery();
  ctx.session.aiScholarContext = true;
  enterAiMode(ctx);
  ctx.session.aiKhutbahMode = 'translate';
  ctx.session.aiKhutbahStep = 'language';
  await ctx.reply(
    '🌍 *ترجمة خطبة*\n\nاختر اللغة المطلوبة:\n\n(أرسل ' + CANCEL_BUTTON + ' للخروج)',
    { parse_mode: 'Markdown', ...khutbahLanguageKeyboard() }
  );
}

async function handleKhutbahLangSelect(ctx) {
  await ctx.answerCbQuery();
  const code = ctx.match[1];
  if (code === 'other') {
    await ctx.reply('🌍 أرسل اسم اللغة المطلوبة:');
    return;
  }
  const lang = KHUTBAH_LANG_LABELS[code] || code;
  ctx.session.aiTargetLanguage = lang;
  ctx.session.aiKhutbahStep = 'content';
  await ctx.reply(`✅ اللغة: ${lang}\n\nأرسل نص الخطبة:`);
}

async function handleKhutbahImprove(ctx) {
  await ctx.answerCbQuery();
  ctx.session.aiScholarContext = true;
  enterAiMode(ctx);
  ctx.session.aiKhutbahMode = 'improve';
  ctx.session.aiKhutbahStep = 'content';
  await ctx.reply(
    '✏️ *تحسين خطبة*\n\nأرسل نص الخطبة:\n\n(أرسل ' + CANCEL_BUTTON + ' للخروج)',
    { parse_mode: 'Markdown' }
  );
}

async function processKhutbahInput(ctx, text) {
  const user = db.getUser(ctx.from.id) || ctx.user;
  const role = user?.role || ROLES.WORSHIPPER;
  const mode = ctx.session.aiKhutbahMode;
  const step = ctx.session.aiKhutbahStep;

  if (mode === 'write' && step === 'topic') {
    const waitMsg = await ctx.reply('⏳ جاري كتابة الخطبة...');
    try {
      let answer = await askGemini(`اكتب خطبة جمعة كاملة عن: ${text}`, user, role, { khutbahMode: 'write' });
      answer = ensureKhutbahWarning(answer);
      ctx.session.aiLastQuestion = `خطبة جمعة: ${text}`;
      saveLastAiResponse(ctx, answer);
      delete ctx.session.aiKhutbahMode;
      delete ctx.session.aiKhutbahStep;
      try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
      await splitReply(ctx, answer, khutbahAnswerKeyboard());
    } catch (err) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
      await ctx.reply(geminiErrorMessage(err));
    }
    return;
  }

  if (mode === 'translate' && step === 'language') {
    ctx.session.aiTargetLanguage = text.trim();
    ctx.session.aiKhutbahStep = 'content';
    await ctx.reply(`✅ تم استلام اللغة.\n\nأرسل نص الخطبة:`);
    return;
  }

  if (mode === 'translate' && step === 'content') {
    const lang = ctx.session.aiTargetLanguage || 'الإنجليزية';
    const waitMsg = await ctx.reply('⏳ جاري الترجمة...');
    try {
      let answer = await askGemini(`ترجم هذه الخطبة إلى ${lang}:\n\n${text}`, user, role, { khutbahMode: 'translate' });
      answer = ensureKhutbahWarning(answer);
      ctx.session.aiLastQuestion = `ترجمة خطبة إلى ${lang}`;
      saveLastAiResponse(ctx, answer);
      delete ctx.session.aiKhutbahMode;
      delete ctx.session.aiKhutbahStep;
      delete ctx.session.aiTargetLanguage;
      try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
      await splitReply(ctx, answer, khutbahAnswerKeyboard());
    } catch (err) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
      await ctx.reply(geminiErrorMessage(err));
    }
    return;
  }

  if (mode === 'improve' && step === 'content') {
    const waitMsg = await ctx.reply('⏳ جاري تحسين الخطبة...');
    try {
      let answer = await askGemini(`حسّن هذه الخطبة:\n\n${text}`, user, role, { khutbahMode: 'improve' });
      answer = ensureKhutbahWarning(answer);
      ctx.session.aiLastQuestion = 'تحسين خطبة';
      saveLastAiResponse(ctx, answer);
      delete ctx.session.aiKhutbahMode;
      delete ctx.session.aiKhutbahStep;
      try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
      await splitReply(ctx, answer, khutbahAnswerKeyboard());
    } catch (err) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
      await ctx.reply(geminiErrorMessage(err));
    }
  }
}

function findNearestSheikh(city) {
  const cityLower = city.trim().toLowerCase();
  const mosques = db.allMosques().filter((m) => {
    const c = (m.city || '').toLowerCase();
    const loc = (m.location || '').toLowerCase();
    return c.includes(cityLower) || loc.includes(cityLower) || cityLower.includes(c);
  });
  const telegramSheikhs = db.usersByRole(ROLES.SHEIKH);

  for (const mosque of mosques) {
    const sheikhs = telegramSheikhs.filter((s) => s.mosqueId === mosque.id);
    if (sheikhs.length) return { sheikh: sheikhs[0], mosque };
  }

  if (telegramSheikhs.length) {
    return { sheikh: telegramSheikhs[0], mosque: mosques[0] || null };
  }

  return null;
}

function buildContactSummary(ctx, city) {
  const user = db.getUser(ctx.from.id) || ctx.user;
  const name = user?.firstName || ctx.from.first_name || 'مستخدم';
  const religion = RELIGION_LABELS[user?.religion] || '—';
  const question = ctx.session.aiLastQuestion || '—';
  const answer = ctx.session.aiLastAnswer || '—';
  const cityLine = city ? `\n🏙️ *المدينة:* ${city}\n` : '';

  return (
    `📩 *طلب تواصل من المساعد الديني*\n\n` +
    `👤 *الاسم:* ${name}\n` +
    `🆔 *المعرف:* ${ctx.from.id}\n` +
    `🕊️ *الدين:* ${religion}` +
    cityLine +
    `\n\n❓ *السؤال:*\n${question}\n\n` +
    `🤖 *إجابة المساعد:*\n${answer}`
  );
}

async function sendToSheikh(ctx, sheikhUserId, sheikhName, city) {
  const user = db.getUser(ctx.from.id) || ctx.user;
  const summary = buildContactSummary(ctx, city);
  const inboxType = user?.religion === RELIGIONS.MUSLIM ? 'muslim_contact' : 'interfaith_contact';

  db.addSheikhInboxMessage({
    type: inboxType,
    typeLabel: user?.religion === RELIGIONS.MUSLIM ? 'رسالة مستخدم' : 'طلب تواصل غير مسلم',
    sheikhId: sheikhUserId,
    fromUserId: ctx.from.id,
    fromName: user?.firstName || ctx.from.first_name,
    religion: user?.religion,
    question: ctx.session.aiLastQuestion,
    answer: ctx.session.aiLastAnswer,
    city: city || user?.city
  });

  try {
    await ctx.telegram.sendMessage(sheikhUserId, summary, { parse_mode: 'Markdown' });
    return true;
  } catch {
    return false;
  }
}

async function handleFindScholarRequest(ctx) {
  await ctx.answerCbQuery();
  ctx.session.aiWaitingCity = true;
  enterAiMode(ctx);
  await ctx.reply('📍 في أي مدينة تسكن؟\n\n(أرسل اسم مدينتك)');
}

async function handleContactNo(ctx) {
  await ctx.answerCbQuery();
  await ctx.reply('حسناً، يمكنك السؤال في أي وقت 🤝', answerKeyboard(ctx.user?.religion));
}

async function handleCityInput(ctx, city) {
  delete ctx.session.aiWaitingCity;
  db.saveUser(ctx.from.id, { city: city.trim() });

  const result = findNearestSheikh(city);
  if (result) {
    const sent = await sendToSheikh(ctx, result.sheikh.id, result.sheikh.firstName, city);
    if (sent) {
      const mosqueName = result.mosque?.name ? ` في *${result.mosque.name}*` : '';
      await ctx.reply(
        `✅ تم إرسال طلبك إلى أقرب عالم${mosqueName}`,
        { parse_mode: 'Markdown', ...answerKeyboard(ctx.user?.religion) }
      );
      return;
    }
  }

  await ctx.reply('سنتواصل معك قريباً 🤝', answerKeyboard(ctx.user?.religion));
}

function isProhibitedMuslimTopic(text) {
  return PROHIBITED_TOPIC_PATTERNS.some((re) => re.test(text));
}

async function handleAiQuestion(ctx, text) {
  if (text === CANCEL_BUTTON) {
    clearAiSession(ctx);
    return ctx.reply('✅ تم الخروج من المساعد الديني.', mainKeyboard(ctx.user?.role || ROLES.WORSHIPPER));
  }

  if (ctx.session.aiWaitingCity) return handleCityInput(ctx, text);

  if (ctx.session.aiKhutbahMode) {
    if (!ctx.session.aiScholarContext) {
      return ctx.reply('⛔ أدوات الخطبة متاحة فقط من المساعد الديني للمشايخ.');
    }
    return processKhutbahInput(ctx, text);
  }

  const user = db.getUser(ctx.from.id) || ctx.user;
  const role = user?.role || ROLES.WORSHIPPER;

  if (user?.religion === RELIGIONS.MUSLIM && isProhibitedMuslimTopic(text)) {
    ctx.session.aiLastQuestion = text;
    saveLastAiResponse(ctx, PROHIBITED_TOPIC_REPLY);
    await replyMuslimAnswer(ctx, PROHIBITED_TOPIC_REPLY);
    return;
  }

  if (!isAllowedQuestion(text)) {
    if (ctx.session.aiScholarContext) {
      await ctx.reply(NON_RELIGIOUS_REPLY, scholarAnswerKeyboard());
      return;
    }
    if (user?.religion === RELIGIONS.MUSLIM) {
      await replyMuslimAnswer(ctx, NON_RELIGIOUS_REPLY);
      return;
    }
    await ctx.reply(NON_RELIGIOUS_REPLY, answerKeyboard(user?.religion));
    return;
  }

  const waitMsg = await ctx.reply('⏳ جاري البحث عن الدليل...');

  try {
    const options = ctx.session.aiScholarAdvancedMode ? { scholarAdvanced: true } : {};
    const answer = await askGemini(text, user, role, options);
    ctx.session.aiLastQuestion = text;
    saveLastAiResponse(ctx, answer);

    try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

    if (isNonReligiousAnswer(answer)) {
      if (ctx.session.aiScholarAdvancedMode) {
        await ctx.reply(NON_RELIGIOUS_REPLY, scholarAnswerKeyboard());
        return;
      }
      if (user?.religion === RELIGIONS.MUSLIM) {
        await replyMuslimAnswer(ctx, NON_RELIGIOUS_REPLY);
        return;
      }
      await ctx.reply(NON_RELIGIOUS_REPLY, answerKeyboard(user?.religion));
      return;
    }

    if (ctx.session.aiScholarAdvancedMode) {
      delete ctx.session.aiScholarAdvancedMode;
      await splitReply(ctx, answer, scholarAnswerKeyboard());
      return;
    }

    await sendAnswerWithFollowUp(ctx, answer, user);
  } catch (err) {
    console.error('[AI] handleAiQuestion:', err?.message || err);
    try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
    await ctx.reply(geminiErrorMessage(err));
  }
}

function getTelegramSheikhs() {
  return db.usersByRole(ROLES.SHEIKH);
}

function getMosqueSheikhs(mosqueId) {
  if (!mosqueId) return [];
  return db.allUsers().filter((u) => u.role === ROLES.SHEIKH && u.mosqueId === mosqueId);
}

async function showSheikhPicker(ctx, sheikhsFilter = null) {
  const telegramSheikhs = sheikhsFilter?.length ? sheikhsFilter : getTelegramSheikhs();
  const dbSheikhs = db.allSheikhs() || [];

  if (!telegramSheikhs.length && !dbSheikhs.length) {
    return ctx.reply('⚠️ لا يوجد مشايخ مسجلون حالياً.', answerKeyboard(RELIGIONS.MUSLIM));
  }

  let msg = '📋 *اختر شيخاً للتواصل:*\n\n';
  const buttons = [];

  for (const s of telegramSheikhs) {
    buttons.push([Markup.button.callback(`👨‍🏫 ${s.firstName || 'شيخ'}`, `ai_pick_sheikh_${s.id}`)]);
    msg += `• ${s.firstName}${s.lastName ? ' ' + s.lastName : ''}\n`;
  }
  for (const s of dbSheikhs) {
    msg += `• ${s.name} — ${s.specialty || 'عام'}${s.phone ? ` (${s.phone})` : ''}\n`;
  }

  if (buttons.length) {
    return ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
  }
  return ctx.reply(msg, { parse_mode: 'Markdown', ...answerKeyboard(RELIGIONS.MUSLIM) });
}

async function routeContactToSheikh(ctx) {
  const user = db.getUser(ctx.from.id) || ctx.user;

  if (user?.mosqueId) {
    const mosqueSheikhs = getMosqueSheikhs(user.mosqueId);
    if (mosqueSheikhs.length === 1) {
      const sent = await sendToSheikh(ctx, mosqueSheikhs[0].id, mosqueSheikhs[0].firstName, user.city);
      if (sent) {
        return ctx.reply(
          `✅ تم إرسال طلبك إلى الشيخ *${mosqueSheikhs[0].firstName}*`,
          { parse_mode: 'Markdown', ...answerKeyboard(RELIGIONS.MUSLIM) }
        );
      }
    }
    if (mosqueSheikhs.length > 1) return showSheikhPicker(ctx, mosqueSheikhs);
  }

  return showSheikhPicker(ctx);
}

async function handleContactSheikh(ctx) {
  await ctx.answerCbQuery();
  return routeContactToSheikh(ctx);
}

async function handlePickSheikh(ctx) {
  await ctx.answerCbQuery();
  const sheikhId = parseInt(ctx.match[1]);
  const sheikh = db.getUser(sheikhId);
  if (!sheikh || sheikh.role !== ROLES.SHEIKH) {
    return ctx.reply('❌ الشيخ غير موجود.', answerKeyboard(RELIGIONS.MUSLIM));
  }
  const user = db.getUser(ctx.from.id) || ctx.user;
  const sent = await sendToSheikh(ctx, sheikh.id, sheikh.firstName, user?.city);
  if (!sent) return ctx.reply('❌ تعذر إرسال الرسالة للشيخ.', answerKeyboard(RELIGIONS.MUSLIM));
  await ctx.reply(`✅ تم إرسال سؤالك إلى الشيخ *${sheikh.firstName}*`, { parse_mode: 'Markdown', ...answerKeyboard(RELIGIONS.MUSLIM) });
}

async function downloadTelegramFile(ctx, fileId) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

function parseVoiceResponse(text) {
  const match = text.match(/فهمت[_\s]*سؤالك:\s*([\s\S]*?)\n\s*الإجابة:\s*([\s\S]*)/i);
  if (match) {
    return { transcript: match[1].trim(), answer: match[2].trim() };
  }
  return { transcript: null, answer: text };
}

async function handleAiPhoto(ctx) {
  if (!ctx.session?.aiMode) return;

  const waitMsg = await ctx.reply('📸 جاري تحليل الصورة...');
  try {
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    const buffer = await downloadTelegramFile(ctx, fileId);
    const base64 = buffer.toString('base64');
    const mimeType = 'image/jpeg';

    const user = db.getUser(ctx.from.id) || ctx.user;
    const role = user?.role || ROLES.WORSHIPPER;
    const options = ctx.session.aiScholarAdvancedMode ? { scholarAdvanced: true } : {};
    const systemPrompt = ctx.session.aiScholarAdvancedMode
      ? buildSystemPrompt(user, role, options)
      : `${PHOTO_VISION_SYSTEM}\n\n${geminiService.MUSLIM_FORMAT_PROMPT_RULE}`;

    const { text } = await geminiService.askGeminiVision(
      base64,
      mimeType,
      'اقرأ هذه الصورة وأجب على ما فيها',
      systemPrompt
    );

    ctx.session.aiLastQuestion = '[صورة من المستخدم]';
    try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}

    if (isNonReligiousAnswer(text)) {
      await replyAiAnswer(ctx, NON_RELIGIOUS_REPLY, user);
      return;
    }
    await replyAiAnswer(ctx, text, user);
  } catch (err) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch (e) {}
    await ctx.reply(geminiErrorMessage(err), answerKeyboard(ctx.user?.religion || RELIGIONS.MUSLIM));
  }
}

async function handleAiVoice(ctx) {
  const { handleVoiceQuestion } = require('./voiceHandler');
  const user = db.getUser(ctx.from.id) || ctx.user;
  return handleVoiceQuestion(ctx, user);
}

async function handleListenAnswer(ctx) {
  await ctx.answerCbQuery();

  const text = ctx.session?.lastAiResponse;
  if (!text || text === '—') {
    return ctx.reply('⚠️ لا توجد إجابة محفوظة.', answerKeyboard(ctx.user?.religion || RELIGIONS.MUSLIM));
  }

  const cleanText = ttsService.cleanTextForTts(text);
  if (!cleanText) {
    return ctx.reply('⚠️ لا يوجد نص صالح للتحويل لصوت.', answerKeyboard(ctx.user?.religion || RELIGIONS.MUSLIM));
  }

  try {
    await ctx.reply('🔊 جاري تحويل الإجابة لصوت عربي...');
    await ttsService.speakArabicText(ctx, cleanText);
  } catch (error) {
    console.error('TTS Error:', error?.message || error);
    await ctx.reply(
      '🔊 *نص الإجابة للقراءة:*\n\n' + cleanText.substring(0, 300),
      { parse_mode: 'Markdown', ...answerKeyboard(ctx.user?.religion || RELIGIONS.MUSLIM) }
    );
  }
}

async function handleAskAnother(ctx) {
  await ctx.answerCbQuery();
  if (ctx.session.aiScholarContext) return showScholarMenu(ctx);

  const user = db.getUser(ctx.from.id) || ctx.user;
  if (user?.religion === RELIGIONS.MUSLIM && !isMuslimSetupComplete(user)) {
    return continueMuslimSetup(ctx);
  }
  return promptQuestion(ctx);
}

async function handleAiSetupText(ctx) {
  const step = ctx.session.aiSetupStep;
  if (step === 'religion') {
    await ctx.reply('⚠️ يرجى اختيار دينك من الأزرار أعلاه.');
    return true;
  }
  if (step === 'guidelines') {
    await ctx.reply('⚠️ يرجى الموافقة على الضوابط أو التواصل مع شيخ من الأزرار أعلاه.');
    return true;
  }
  if (step === 'madhab' || ctx.session.aiMadhabSelection) {
    await ctx.reply('⚠️ يرجى اختيار مذهبك من الأزرار أعلاه.');
    return true;
  }
  if (ctx.session.aiSectSelection) {
    await ctx.reply('⚠️ يرجى اختيار طائفتك/تيارك من الأزرار أعلاه.');
    return true;
  }
  return false;
}

module.exports = {
  aiMenu,
  aiScholarMenu,
  handleMuslimAccept,
  handleMuslimContactDirect,
  handleAccept,
  handleDecline,
  handleReligionSelect,
  handleSectSelect,
  handleMadhabSelect,
  handleAiQuestion,
  handleContactSheikh,
  handlePickSheikh,
  handleAskAnother,
  handleAiPhoto,
  handleAiVoice,
  handleListenAnswer,
  handleAiSetupText,
  handleScholarMenu,
  handleScholarAdvanced,
  handleGeneralQuestion,
  handleKhutbahWrite,
  handleKhutbahTranslate,
  handleKhutbahLangSelect,
  handleKhutbahImprove,
  handleFindScholarRequest,
  handleContactNo,
  buildSystemPrompt,
  getMosqueSheikhs,
  saveLastAiResponse,
  replyAiAnswer,
  listenAnswerKeyboard,
  answerKeyboard,
  geminiErrorMessage,
  isNonReligiousAnswer,
  RELIGIONS,
  NON_RELIGIOUS_REPLY
};

const registry = require('../core/actionRegistry');
const { AI_BUTTON } = require('../keyboards');

registry.registerMenu(AI_BUTTON, aiMenu, 'المساعد الديني');

registry.registerAction('ai_accept', handleAccept, 'قبول شروط المساعد');
registry.registerAction('ai_decline', handleDecline, 'رفض شروط المساعد');
registry.registerAction('ai_muslim_accept', handleMuslimAccept, 'قبول الضوابط الشرعية');
registry.registerAction('ai_muslim_contact_direct', handleMuslimContactDirect, 'تواصل مباشر مع شيخ');
registry.registerAction(/^ai_religion_(.+)$/, handleReligionSelect, 'اختيار الدين');
registry.registerAction(/^ai_sect_(.+)$/, handleSectSelect, 'اختيار الطائفة');
registry.registerAction(/^ai_madhab_(.+)$/, handleMadhabSelect, 'اختيار المذهب');
registry.registerAction('ai_contact_sheikh', handleContactSheikh, 'تواصل مع شيخ');
registry.registerAction(/^ai_pick_sheikh_(\d+)$/, handlePickSheikh, 'اختيار شيخ');
registry.registerAction('ai_ask_another', handleAskAnother, 'سؤال آخر');
registry.registerAction('ai_find_scholar', handleFindScholarRequest, 'البحث عن عالم');
registry.registerAction('ai_contact_no', handleContactNo, 'رفض التواصل');
registry.registerAction('ai_scholar_menu', handleScholarMenu, 'قائمة المشايخ');
registry.registerAction('ai_scholar_advanced', handleScholarAdvanced, 'سؤال متقدم');
registry.registerAction('ai_general_question', handleGeneralQuestion, 'سؤال عام');
registry.registerAction('ai_khutbah_write', handleKhutbahWrite, 'كتابة خطبة');
registry.registerAction('ai_khutbah_translate', handleKhutbahTranslate, 'ترجمة خطبة');
registry.registerAction('ai_khutbah_improve', handleKhutbahImprove, 'تحسين خطبة');
registry.registerAction(/^ai_khutbah_lang_(.+)$/, handleKhutbahLangSelect, 'لغة ترجمة الخطبة');
registry.registerAction('ai_listen_answer', handleListenAnswer, 'استماع للإجابة');

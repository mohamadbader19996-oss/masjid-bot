// src/handlers/volunteers.js
// نظام المتطوعين الدعويين — منارة المسلم
const { loadDB, saveDB } = require('../utils/db');
const { getRoleInMosque } = require('../utils/helpers');
const { buildCountryKeyboard, getCountryByIndex, formatPhoneNumber } = require('../data/countryPhoneCodes');

// أنواع التطوع
const VOLUNTEER_TYPES = {
  shahada_witness: '🕌 شاهد على الشهادة',
  new_muslim_companion: '🤝 مرافق مسلم جديد',
  dawah_chat: '💬 محادثة دعوية',
  islam_teacher: '📚 تعليم أساسيات الإسلام'
};

// اللغات المتاحة
const VOLUNTEER_LANGUAGES = {
  // أوروبا الغربية
  de: '🇩🇪 Deutsch',
  fr: '🇫🇷 Français',
  en: '🇬🇧 English',
  es: '🇪🇸 Español',
  it: '🇮🇹 Italiano',
  nl: '🇳🇱 Nederlands',
  pt: '🇵🇹 Português',
  sv: '🇸🇪 Svenska',
  da: '🇩🇰 Dansk',
  no: '🇳🇴 Norsk',
  fi: '🇫🇮 Suomi',
  is: '🇮🇸 Íslenska',
  lb: '🇱🇺 Lëtzebuergesch',
  mt: '🇲🇹 Malti',
  cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿 Cymraeg',
  ga: '🇮🇪 Gaeilge',
  eu: '🏳️ Euskara',
  ca: '🏳️ Català',
  gl: '🏳️ Galego',
  // أوروبا الشرقية
  ru: '🇷🇺 Русский',
  pl: '🇵🇱 Polski',
  cs: '🇨🇿 Čeština',
  sk: '🇸🇰 Slovenčina',
  ro: '🇷🇴 Română',
  hu: '🇭🇺 Magyar',
  bg: '🇧🇬 Български',
  hr: '🇭🇷 Hrvatski',
  sr: '🇷🇸 Srpski',
  bs: '🇧🇦 Bosanski',
  sl: '🇸🇮 Slovenščina',
  sq: '🇦🇱 Shqip',
  mk: '🇲🇰 Македонски',
  uk: '🇺🇦 Українська',
  be: '🇧🇾 Беларуская',
  lt: '🇱🇹 Lietuvių',
  lv: '🇱🇻 Latviešu',
  et: '🇪🇪 Eesti',
  el: '🇬🇷 Ελληνικά',
  // آسيا الوسطى والقوقاز
  tr: '🇹🇷 Türkçe',
  az: '🇦🇿 Azərbaycan',
  kk: '🇰🇿 Қазақша',
  uz: '🇺🇿 Oʻzbek',
  ky: '🇰🇬 Кыргызча',
  tg: '🇹🇯 Тоҷикӣ',
  tk: '🇹🇲 Türkmen',
  hy: '🇦🇲 Հայերեն',
  ka: '🇬🇪 ქართული',
  mn: '🇲🇳 Монгол',
  // الشرق الأوسط
  ar: '🇸🇦 العربية',
  fa: '🇮🇷 فارسی',
  ur: '🇵🇰 اردو',
  ps: '🇦🇫 پښتو',
  ku: '🏳️ Kurdî',
  ckb: '🏳️ سۆرانی',
  // جنوب آسيا
  hi: '🇮🇳 हिन्दी',
  bn: '🇧🇩 বাংলা',
  pa: '🏳️ ਪੰਜਾਬੀ',
  gu: '🏳️ ગુજરાતી',
  mr: '🏳️ मराठी',
  ta: '🏳️ தமிழ்',
  te: '🏳️ తెలుగు',
  ml: '🏳️ മലയാളം',
  si: '🇱🇰 සිංහල',
  ne: '🇳🇵 नेपाली',
  sd: '🏳️ سنڌي',
  // جنوب شرق آسيا
  id: '🇮🇩 Indonesia',
  ms: '🇲🇾 Melayu',
  tl: '🇵🇭 Filipino',
  th: '🇹🇭 ภาษาไทย',
  vi: '🇻🇳 Tiếng Việt',
  my: '🇲🇲 မြန်မာဘာသာ',
  km: '🇰🇭 ភាសាខ្មែរ',
  lo: '🇱🇦 ພາສາລາວ',
  jv: '🏳️ Basa Jawa',
  su: '🏳️ Basa Sunda',
  // شرق آسيا
  zh: '🇨🇳 中文',
  ja: '🇯🇵 日本語',
  ko: '🇰🇷 한국어',
  // أفريقيا
  sw: '🇹🇿 Kiswahili',
  ha: '🇳🇬 Hausa',
  so: '🇸🇴 Soomaali',
  am: '🇪🇹 አማርኛ',
  yo: '🇳🇬 Yorùbá',
  ig: '🇳🇬 Igbo',
  zu: '🇿🇦 IsiZulu',
  af: '🇿🇦 Afrikaans',
  rw: '🇷🇼 Kinyarwanda',
  mg: '🇲🇬 Malagasy',
  sn: '🇿🇼 ChiShona',
  ny: '🇲🇼 Chichewa',
  st: '🇱🇸 Sesotho',
  tn: '🇧🇼 Setswana',
  xh: '🇿🇦 IsiXhosa',
  om: '🇪🇹 Afaan Oromoo',
  ti: '🇪🇷 ትግርኛ',
  ff: '🏳️ Fulfulde',
  wo: '🇸🇳 Wolof',
  bm: '🇲🇱 Bamanankan',
  ln: '🇨🇩 Lingála',
  lg: '🇺🇬 Luganda',
  ak: '🇬🇭 Akan',
  tw: '🇬🇭 Twi',
  ee: '🇬🇭 Eʋegbe',
  // أمريكا اللاتينية
  pt_BR: '🇧🇷 Português (Brasil)',
  qu: '🏳️ Quechua',
  gn: '🏳️ Guaraní',
  ay: '🏳️ Aymara',
  ht: '🇭🇹 Kreyòl ayisyen',
  // أوقيانوسيا
  mi: '🇳🇿 Te Reo Māori',
  sm: '🇼🇸 Gagana Samoa',
  to: '🇹🇴 Lea faka-Tonga',
  fj: '🇫🇯 Na Vosa Vakaviti',
  // لغات دولية
  ber: '🏳️ Tamazight',
  dz: '🇧🇹 རྫོང་ཁ',
  bo: '🏳️ བོད་སྐད།',
  ug: '🏳️ ئۇيغۇرچە',
};

// أوقات التوفر
const AVAILABILITY_TIMES = {
  morning: '🌅 الصباح (6-12)',
  afternoon: '☀️ الظهيرة (12-17)',
  evening: '🌙 المساء (17-22)',
  anytime: '✅ في أي وقت'
};

// ========== واجهة التسجيل ==========
async function showVolunteerRegistration(ctx) {
  const userId = ctx.from.id;
  const db = loadDB();

  if (db.volunteers && db.volunteers[userId]) {
    const vol = db.volunteers[userId];
    const status = vol.active ? '✅ نشط' : '⏳ قيد المراجعة';
    await ctx.editMessageText(
      `🤝 *أنت مسجل كمتطوع دعوي*\n\n` +
      `الحالة: ${status}\n` +
      `أنواع التطوع: ${vol.types.map(t => VOLUNTEER_TYPES[t]).join('\n')}\n` +
      `اللغات: ${vol.languages.map(l => VOLUNTEER_LANGUAGES[l]).join(' ')}\n\n` +
      `إجمالي من خدمت: ${vol.totalServed || 0} شخص`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ تعديل بياناتي', callback_data: 'vol_edit' }],
            [{ text: vol.active ? '⏸️ إيقاف تطوعي مؤقتاً' : '▶️ تفعيل تطوعي', callback_data: 'vol_toggle' }],
            [{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]
          ]
        }
      }
    );
    return;
  }

  await ctx.editMessageText(
    '🤝 *التسجيل كمتطوع دعوي*\n\n' +
    'بتسجيلك كمتطوع ستساهم في:\n' +
    '• 🕌 الشهادة على إسلام الجدد\n' +
    '• 🤝 مرافقة المسلمين الجدد\n' +
    '• 💬 الحوار الدعوي بلغتك\n' +
    '• 📚 تعليم أساسيات الإسلام\n\n' +
    '_سيراجع المدير طلبك قبل التفعيل_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ أريد التسجيل', callback_data: 'vol_start_reg' }],
          [{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]
        ]
      }
    }
  );
}

async function startVolunteerRegistration(ctx) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const userId = ctx.from.id;
  if (!db.volunteer_reg) db.volunteer_reg = {};
  db.volunteer_reg[userId] = { step: 'types', types: [], languages: [], availability: [] };
  saveDB(db);
  await showVolunteerTypeSelection(ctx);
}

async function showVolunteerTypeSelection(ctx) {
  const buttons = Object.entries(VOLUNTEER_TYPES).map(([key, label]) => [
    { text: label, callback_data: `vol_type_${key}` }
  ]);
  buttons.push([{ text: '✅ تأكيد الاختيار', callback_data: 'vol_types_done' }]);
  buttons.push([{ text: '🔙 رجوع', callback_data: 'dawah_volunteer' }]);

  await ctx.editMessageText(
    '🕌 *اختر أنواع تطوعك*\n\n' +
    '_يمكنك اختيار أكثر من نوع_\n\n' +
    '_(اضغط على كل نوع تريده ثم اضغط تأكيد)_',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }
  );
}

async function handleVolunteerTypeToggle(ctx, typeKey) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.volunteer_reg || !db.volunteer_reg[userId]) {
    await startVolunteerRegistration(ctx);
    return;
  }
  const reg = db.volunteer_reg[userId];
  const index = reg.types.indexOf(typeKey);
  if (index === -1) {
    reg.types.push(typeKey);
  } else {
    reg.types.splice(index, 1);
  }
  saveDB(db);

  const buttons = Object.entries(VOLUNTEER_TYPES).map(([key, label]) => {
    const selected = reg.types.includes(key) ? '✅ ' : '';
    return [{ text: `${selected}${label}`, callback_data: `vol_type_${key}` }];
  });
  buttons.push([{ text: '➡️ تأكيد الاختيار', callback_data: 'vol_types_done' }]);
  buttons.push([{ text: '🔙 رجوع', callback_data: 'dawah_volunteer' }]);

  await ctx.editMessageText(
    '🕌 *اختر أنواع تطوعك*\n\n' +
    '_يمكنك اختيار أكثر من نوع_\n\n' +
    `المختار: ${reg.types.length > 0 ? reg.types.map(t => VOLUNTEER_TYPES[t]).join('، ') : 'لا شيء بعد'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }
  );
}

async function handleVolunteerTypesDone(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId];
  if (!reg || reg.types.length === 0) {
    await ctx.answerCbQuery('⚠️ اختر نوع تطوع واحد على الأقل', { show_alert: true });
    return;
  }
  reg.step = 'gender';
  saveDB(db);
  await showVolunteerGenderSelection(ctx);
}

async function showVolunteerGenderSelection(ctx) {
  await ctx.editMessageText(
    '👤 *من أنت؟*\n\n' +
    '_لتنسيق المرافقة والتواصل بشكل مناسب_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🧔 أخ (ذكر)', callback_data: 'vol_gender_male' },
            { text: '🧕 أخت (أنثى)', callback_data: 'vol_gender_female' }
          ],
          [{ text: '🔙 رجوع', callback_data: 'vol_types_back' }]
        ]
      }
    }
  );
}

async function handleVolunteerGenderSelect(ctx, gender) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.volunteer_reg?.[userId]) {
    await startVolunteerRegistration(ctx);
    return;
  }
  const reg = db.volunteer_reg[userId];
  reg.gender = gender;
  reg.step = 'languages';
  saveDB(db);
  await showVolunteerLanguageSelection(ctx);
}

async function showVolunteerLanguageSelection(ctx, page = 0) {
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId] || {};
  const selected = reg.languages || [];

  if (db.volunteer_reg?.[userId]) {
    db.volunteer_reg[userId].currentLangPage = page;
    saveDB(db);
  }

  const langs = Object.entries(VOLUNTEER_LANGUAGES);
  const pageSize = 8;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageLangs = langs.slice(start, end);
  const totalPages = Math.ceil(langs.length / pageSize);
  const buttons = [];

  for (let i = 0; i < pageLangs.length; i += 2) {
    const row = [];
    const [code1, label1] = pageLangs[i];
    const sel1 = selected.includes(code1) ? '✅ ' : '';
    row.push({ text: `${sel1}${label1}`, callback_data: `vol_lang_${code1}` });
    if (pageLangs[i + 1]) {
      const [code2, label2] = pageLangs[i + 1];
      const sel2 = selected.includes(code2) ? '✅ ' : '';
      row.push({ text: `${sel2}${label2}`, callback_data: `vol_lang_${code2}` });
    }
    buttons.push(row);
  }

  const navRow = [];
  if (page > 0) {
    navRow.push({ text: '⬅️ السابق', callback_data: `vol_lang_page_${page - 1}` });
  }
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (end < langs.length) {
    navRow.push({ text: 'التالي ➡️', callback_data: `vol_lang_page_${page + 1}` });
  }
  if (navRow.length > 0) buttons.push(navRow);

  buttons.push([{
    text: `➡️ تأكيد ${selected.length > 0 ? `(${selected.length} لغة)` : ''}`,
    callback_data: 'vol_langs_done'
  }]);

  const selectedDisplay = selected.length > 0
    ? selected.map(l => VOLUNTEER_LANGUAGES[l] || l).join(' ')
    : '_لا شيء بعد_';

  await ctx.editMessageText(
    `🌍 *اختر لغاتك*\n\n` +
    `_يمكنك اختيار أكثر من لغة من أي صفحة_\n\n` +
    `المختارة: ${selectedDisplay}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }
  );
}

async function handleVolunteerLangToggle(ctx, langKey) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.volunteer_reg?.[userId]) {
    await startVolunteerRegistration(ctx);
    return;
  }
  const reg = db.volunteer_reg[userId];
  if (!reg.languages) reg.languages = [];
  const index = reg.languages.indexOf(langKey);
  if (index === -1) {
    reg.languages.push(langKey);
  } else {
    reg.languages.splice(index, 1);
  }
  saveDB(db);
  const currentPage = reg.currentLangPage || 0;
  await showVolunteerLanguageSelection(ctx, currentPage);
}

async function handleVolunteerLangsDone(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId];
  if (!reg || reg.languages.length === 0) {
    await ctx.answerCbQuery('⚠️ اختر لغة واحدة على الأقل', { show_alert: true });
    return;
  }
  reg.step = 'availability';
  saveDB(db);
  await showVolunteerAvailability(ctx);
}

async function showVolunteerAvailability(ctx, page = 0) {
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId] || {};

  const buttons = Object.entries(AVAILABILITY_TIMES).map(([key, label]) => {
    const selected = (reg.availability || []).includes(key) ? '✅ ' : '';
    return [{ text: `${selected}${label}`, callback_data: `vol_avail_${key}` }];
  });
  buttons.push([{ text: '➡️ التالي — طريقة التواصل', callback_data: 'vol_contact_step' }]);
  buttons.push([{ text: '🔙 رجوع', callback_data: 'vol_langs_done' }]);

  await ctx.editMessageText(
    '⏰ *متى تكون متاحاً؟*\n\n' +
    `المختار: ${(reg.availability || []).length > 0 ? reg.availability.map(a => AVAILABILITY_TIMES[a]).join('، ') : 'لا شيء بعد'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }
  );
}

async function showVolunteerContactStep(ctx) {
  await ctx.editMessageText(
    '📱 *كيف تريد أن يتواصل معك الناس؟*\n\n' +
    '👤 *Username تيليغرام* — يفتح محادثة مباشرة\n' +
    '📱 *واتساب* — يفتح واتساب مباشرة\n' +
    '🔒 *عبر البوت فقط* — تستقبل الطلبات هنا\n\n' +
    '_يظهر للطرف الآخر فقط عند قبولك للطلب_',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 Username تيليغرام', callback_data: 'vol_contact_username' }],
          [{ text: '📱 رقم واتساب', callback_data: 'vol_contact_whatsapp' }],
          [{ text: '🔒 عبر البوت فقط', callback_data: 'vol_contact_bot_only' }],
          [{ text: '🔙 رجوع', callback_data: 'vol_avail_back' }]
        ]
      }
    }
  );
}

async function handleVolunteerContactChoice(ctx, type) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.volunteer_reg) db.volunteer_reg = {};
  if (!db.volunteer_reg[userId]) db.volunteer_reg[userId] = {};
  db.volunteer_reg[userId].contactType = type;
  saveDB(db);

  if (type === 'bot_only') {
    db.volunteer_reg[userId].contactValue = null;
    saveDB(db);
    await handleVolunteerSubmit(ctx);
    return;
  }

  if (type === 'whatsapp') {
    await showCountrySelection(ctx, 0);
    return;
  }

  const prompts = {
    username: '👤 *أرسل username تيليغرام الخاص بك*\n\nمثال: `@محمد_الدعوة`\n\n_بدون مسافات_'
  };

  await ctx.editMessageText(
    prompts[type],
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 رجوع', callback_data: 'vol_contact_step' }]
        ]
      }
    }
  );

  db.volunteer_reg[userId].waitingForContact = true;
  saveDB(db);
}

async function showCountrySelection(ctx, page) {
  const keyboard = buildCountryKeyboard(page);
  await ctx.editMessageText(
    '🌍 *اختر رمز دولتك*\n\n' +
    '_اختر الدولة لإضافة رمز الهاتف الدولي تلقائياً_',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
}

async function handleCountryPage(ctx, page) {
  await ctx.answerCbQuery();
  await showCountrySelection(ctx, page);
}

async function handleCountrySelect(ctx, index) {
  await ctx.answerCbQuery();
  const country = getCountryByIndex(index);
  if (!country) {
    await ctx.answerCbQuery('⚠️ خطأ في اختيار الدولة', { show_alert: true });
    return;
  }

  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.volunteer_reg) db.volunteer_reg = {};
  if (!db.volunteer_reg[userId]) db.volunteer_reg[userId] = {};
  db.volunteer_reg[userId].selectedCountryCode = country.code;
  db.volunteer_reg[userId].selectedCountryName = country.name;
  db.volunteer_reg[userId].waitingForContact = true;
  saveDB(db);

  await ctx.editMessageText(
    `📱 *أرسل رقم واتساب الخاص بك*\n\n` +
    `الدولة المختارة: ${country.flag} ${country.name} (${country.code})\n\n` +
    `أرسل الرقم المحلي فقط بدون رمز الدولة\nمثال: \`1701234567\` أو \`01701234567\`\n\n` +
    `_سيتم إضافة رمز الدولة تلقائياً_`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 تغيير الدولة', callback_data: 'vol_contact_whatsapp' }]
        ]
      }
    }
  );
}

async function handleVolunteerContactInput(ctx) {
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId];
  if (!reg?.waitingForContact) return false;

  const input = ctx.message?.text?.trim();
  if (!input) return false;

  const type = reg.contactType;

  if (type === 'username') {
    const clean = input.startsWith('@') ? input : `@${input}`;
    reg.contactValue = clean;
    reg.waitingForContact = false;
    saveDB(db);
    await ctx.reply(
      `✅ تم حفظ: ${clean}\nجاري إرسال طلب التطوع...`,
      { parse_mode: 'Markdown' }
    );
    await handleVolunteerSubmit(ctx);
    return true;
  }

  if (type === 'whatsapp') {
    const callingCode = reg.selectedCountryCode;
    if (!callingCode) {
      await ctx.reply(
        '⚠️ لم يتم اختيار الدولة — يرجى البدء من جديد',
        { parse_mode: 'Markdown' }
      );
      reg.waitingForContact = false;
      saveDB(db);
      return true;
    }

    const digitsOnly = input.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 5) {
      await ctx.reply(
        '❌ الرقم قصير جداً — أرسل رقمك المحلي كاملاً',
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    const finalNumber = formatPhoneNumber(callingCode, digitsOnly);
    reg.contactValue = finalNumber;
    reg.contactDisplay = finalNumber;
    reg.waitingForContact = false;
    saveDB(db);
    await ctx.reply(
      `✅ *تم حفظ رقم الواتساب*\n📱 ${finalNumber}`,
      { parse_mode: 'Markdown' }
    );
    await handleVolunteerSubmit(ctx);
    return true;
  }

  return false;
}

async function handleVolunteerAvailToggle(ctx, availKey) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId];
  if (!reg) return;
  const index = reg.availability.indexOf(availKey);
  if (index === -1) {
    reg.availability.push(availKey);
  } else {
    reg.availability.splice(index, 1);
  }
  saveDB(db);
  await showVolunteerAvailability(ctx);
}

async function handleVolunteerSubmit(ctx) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
  }
  const userId = ctx.from.id;
  const db = loadDB();
  const reg = db.volunteer_reg?.[userId];
  if (!reg || reg.availability.length === 0) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ اختر وقت توفر واحد على الأقل', { show_alert: true });
    } else {
      await ctx.reply('⚠️ اختر وقت توفر واحد على الأقل');
    }
    return;
  }

  const user = db.users?.[userId];
  let mosqueId = null;
  if (db.mosque_roles) {
    for (const [mId, roles] of Object.entries(db.mosque_roles)) {
      if (roles[userId]) {
        mosqueId = mId;
        break;
      }
    }
  }

  if (!db.volunteers) db.volunteers = {};
  db.volunteers[userId] = {
    userId,
    mosqueId,
    name: user?.firstName || user?.name || ctx.from.first_name,
    gender: reg.gender || 'male',
    types: reg.types,
    languages: reg.languages,
    availability: reg.availability,
    active: false,
    currentAssignments: 0,
    maxAssignments: 2,
    rating: null,
    totalServed: 0,
    registeredAt: new Date().toISOString(),
    contact: {
      type: reg.contactType || 'bot_only',
      value: reg.contactValue || null
    }
  };

  delete db.volunteer_reg[userId];
  saveDB(db);

  if (mosqueId && db.mosque_roles?.[mosqueId]) {
    for (const [mUserId, roleEntry] of Object.entries(db.mosque_roles[mosqueId])) {
      const role = typeof roleEntry === 'string' ? roleEntry : roleEntry?.role;
      if (role === 'admin' || role === 'ADMIN') {
        try {
          await ctx.telegram.sendMessage(
            mUserId,
            `🤝 *طلب تطوع دعوي جديد*\n\n` +
            `الاسم: ${db.volunteers[userId].name}\n` +
            `أنواع التطوع:\n${reg.types.map(t => VOLUNTEER_TYPES[t]).join('\n')}\n` +
            `اللغات: ${reg.languages.map(l => VOLUNTEER_LANGUAGES[l]).join(' ')}\n` +
            `التوفر: ${reg.availability.map(a => AVAILABILITY_TIMES[a]).join('، ')}`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ قبول', callback_data: `vol_approve_${userId}` },
                    { text: '❌ رفض', callback_data: `vol_reject_${userId}` }
                  ]
                ]
              }
            }
          );
        } catch (e) {}
      }
    }
  }

  const successText =
    '✅ *تم إرسال طلب التطوع*\n\n' +
    'سيراجع مدير المسجد طلبك وسيُخطرك بالقرار.\n\n' +
    'جزاك الله خيراً على هذه المبادرة! 🌟';
  const successExtra = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]]
    }
  };
  try {
    await ctx.editMessageText(successText, successExtra);
  } catch (e) {
    await ctx.reply(successText, successExtra);
  }
}

async function handleVolunteerApprove(ctx, volunteerId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  if (!db.volunteers?.[volunteerId]) {
    await ctx.answerCbQuery('❌ المتطوع غير موجود', { show_alert: true });
    return;
  }
  db.volunteers[volunteerId].active = true;
  db.volunteers[volunteerId].approvedBy = ctx.from.id;
  db.volunteers[volunteerId].approvedAt = new Date().toISOString();
  saveDB(db);

  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '🎉 *تم قبول طلب تطوعك الدعوي!*\n\n' +
      'أنت الآن متطوع نشط في منارة المسلم.\n' +
      'سنتواصل معك عند وجود طلب يناسبك إن شاء الله. 🌟',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  await ctx.editMessageText(
    '✅ تم قبول المتطوع وتفعيل حسابه.',
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'dawah_menu' }]]
      }
    }
  );
}

async function handleVolunteerReject(ctx, volunteerId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  if (db.volunteers?.[volunteerId]) {
    delete db.volunteers[volunteerId];
    saveDB(db);
  }

  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '❌ *نأسف، لم يتم قبول طلب تطوعك في الوقت الحالي.*\n\n' +
      'يمكنك التواصل مع مدير المسجد لمعرفة السبب.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  await ctx.editMessageText('تم رفض الطلب وإخطار المتطوع.');
}

async function handleVolunteerToggle(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const db = loadDB();
  if (!db.volunteers?.[userId]) return;
  db.volunteers[userId].active = !db.volunteers[userId].active;
  saveDB(db);
  const status = db.volunteers[userId].active ? 'مفعّل ✅' : 'موقوف مؤقتاً ⏸️';
  await ctx.answerCbQuery(`تطوعك الآن: ${status}`, { show_alert: true });
  await showVolunteerRegistration(ctx);
}

// عرض اللغات بشكل صفحات — 10 لغات في كل صفحة
function getLanguageButtons(page = 0) {
  const langs = Object.entries(VOLUNTEER_LANGUAGES);
  const pageSize = 10;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageLangs = langs.slice(start, end);
  const totalPages = Math.ceil(langs.length / pageSize);
  const buttons = [];

  for (let i = 0; i < pageLangs.length; i += 2) {
    const row = [{ text: pageLangs[i][1], callback_data: `vol_lang_${pageLangs[i][0]}` }];
    if (pageLangs[i + 1]) {
      row.push({ text: pageLangs[i + 1][1], callback_data: `vol_lang_${pageLangs[i + 1][0]}` });
    }
    buttons.push(row);
  }

  const navRow = [];
  if (page > 0) navRow.push({ text: '⬅️ السابق', callback_data: `vol_lang_page_${page - 1}` });
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (end < langs.length) navRow.push({ text: 'التالي ➡️', callback_data: `vol_lang_page_${page + 1}` });
  if (navRow.length > 0) buttons.push(navRow);

  return buttons;
}

function getContactLanguageButtons(page = 0) {
  const langs = Object.entries(VOLUNTEER_LANGUAGES);
  const pageSize = 10;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageLangs = langs.slice(start, end);
  const totalPages = Math.ceil(langs.length / pageSize);
  const buttons = [];

  for (let i = 0; i < pageLangs.length; i += 2) {
    const row = [{ text: pageLangs[i][1], callback_data: `find_volunteer_${pageLangs[i][0]}` }];
    if (pageLangs[i + 1]) {
      row.push({ text: pageLangs[i + 1][1], callback_data: `find_volunteer_${pageLangs[i + 1][0]}` });
    }
    buttons.push(row);
  }

  const navRow = [];
  if (page > 0) navRow.push({ text: '⬅️ السابق', callback_data: `contact_lang_page_${page - 1}` });
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (end < langs.length) navRow.push({ text: 'التالي ➡️', callback_data: `contact_lang_page_${page + 1}` });
  if (navRow.length > 0) buttons.push(navRow);

  return buttons;
}

module.exports = {
  showVolunteerRegistration,
  startVolunteerRegistration,
  showVolunteerTypeSelection,
  showVolunteerLanguageSelection,
  showVolunteerContactStep,
  handleVolunteerContactChoice,
  handleVolunteerContactInput,
  handleVolunteerTypeToggle,
  handleVolunteerTypesDone,
  showVolunteerGenderSelection,
  handleVolunteerGenderSelect,
  handleVolunteerLangToggle,
  handleVolunteerLangsDone,
  handleVolunteerAvailToggle,
  handleVolunteerSubmit,
  handleVolunteerApprove,
  handleVolunteerReject,
  handleVolunteerToggle,
  getLanguageButtons,
  getContactLanguageButtons,
  showCountrySelection,
  handleCountryPage,
  handleCountrySelect,
  VOLUNTEER_TYPES,
  VOLUNTEER_LANGUAGES
};

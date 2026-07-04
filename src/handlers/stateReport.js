const db = require('../database');
const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');

const COUNTRY_LANGUAGES = {
  // ═══ أوروبا الغربية ═══
  'ألمانيا': [{ code: 'de', label: '🇩🇪 Deutsch' }],
  'النمسا': [{ code: 'de', label: '🇦🇹 Deutsch' }],
  'سويسرا': [{ code: 'de', label: '🇨🇭 Deutsch' }, { code: 'fr', label: '🇨🇭 Français' }, { code: 'it', label: '🇨🇭 Italiano' }],
  'فرنسا': [{ code: 'fr', label: '🇫🇷 Français' }],
  'بلجيكا': [{ code: 'nl', label: '🇧🇪 Nederlands' }, { code: 'fr', label: '🇧🇪 Français' }],
  'هولندا': [{ code: 'nl', label: '🇳🇱 Nederlands' }],
  'لوكسمبورغ': [{ code: 'fr', label: '🇱🇺 Français' }, { code: 'de', label: '🇱🇺 Deutsch' }],
  'المملكة المتحدة': [{ code: 'en', label: '🇬🇧 English' }],
  'إيرلندا': [{ code: 'en', label: '🇮🇪 English' }],
  'إيطاليا': [{ code: 'it', label: '🇮🇹 Italiano' }],
  'إسبانيا': [{ code: 'es', label: '🇪🇸 Español' }],
  'البرتغال': [{ code: 'pt', label: '🇵🇹 Português' }],
  'اليونان': [{ code: 'el', label: '🇬🇷 Ελληνικά' }],
  'مالطا': [{ code: 'en', label: '🇲🇹 English' }],
  'قبرص': [{ code: 'el', label: '🇨🇾 Ελληνικά' }],
  // ═══ أوروبا الشمالية ═══
  'السويد': [{ code: 'sv', label: '🇸🇪 Svenska' }],
  'النرويج': [{ code: 'no', label: '🇳🇴 Norsk' }],
  'الدنمارك': [{ code: 'da', label: '🇩🇰 Dansk' }],
  'فنلندا': [{ code: 'fi', label: '🇫🇮 Suomi' }],
  'أيسلندا': [{ code: 'is', label: '🇮🇸 Íslenska' }],
  'لاتفيا': [{ code: 'lv', label: '🇱🇻 Latviešu' }],
  'ليتوانيا': [{ code: 'lt', label: '🇱🇹 Lietuvių' }],
  'إستونيا': [{ code: 'et', label: '🇪🇪 Eesti' }],
  // ═══ أوروبا الشرقية ═══
  'بولندا': [{ code: 'pl', label: '🇵🇱 Polski' }],
  'التشيك': [{ code: 'cs', label: '🇨🇿 Čeština' }],
  'سلوفاكيا': [{ code: 'sk', label: '🇸🇰 Slovenčina' }],
  'المجر': [{ code: 'hu', label: '🇭🇺 Magyar' }],
  'رومانيا': [{ code: 'ro', label: '🇷🇴 Română' }],
  'بلغاريا': [{ code: 'bg', label: '🇧🇬 Български' }],
  'أوكرانيا': [{ code: 'uk', label: '🇺🇦 Українська' }],
  'روسيا': [{ code: 'ru', label: '🇷🇺 Русский' }],
  'بيلاروسيا': [{ code: 'be', label: '🇧🇾 Беларуская' }],
  'مولدوفا': [{ code: 'ro', label: '🇲🇩 Română' }],
  // ═══ أوروبا الجنوبية (البلقان) ═══
  'كرواتيا': [{ code: 'hr', label: '🇭🇷 Hrvatski' }],
  'صربيا': [{ code: 'sr', label: '🇷🇸 Srpski' }],
  'البوسنة': [{ code: 'bs', label: '🇧🇦 Bosanski' }],
  'الجبل الأسود': [{ code: 'sr', label: '🇲🇪 Srpski' }],
  'ألبانيا': [{ code: 'sq', label: '🇦🇱 Shqip' }],
  'كوسوفو': [{ code: 'sq', label: '🇽🇰 Shqip' }],
  'مقدونيا الشمالية': [{ code: 'mk', label: '🇲🇰 Македонски' }],
  'سلوفينيا': [{ code: 'sl', label: '🇸🇮 Slovenščina' }],
  // ═══ القوقاز ═══
  'أذربيجان': [{ code: 'az', label: '🇦🇿 Azərbaycan' }],
  'جورجيا': [{ code: 'ka', label: '🇬🇪 ქართული' }],
  'أرمينيا': [{ code: 'hy', label: '🇦🇲 Հայերեն' }],
  // ═══ الشرق الأوسط ═══
  'تركيا': [{ code: 'tr', label: '🇹🇷 Türkçe' }],
  'إيران': [{ code: 'fa', label: '🇮🇷 فارسی' }],
  'السعودية': [{ code: 'ar', label: '🇸🇦 العربية' }],
  'الإمارات': [{ code: 'ar', label: '🇦🇪 العربية' }],
  'الكويت': [{ code: 'ar', label: '🇰🇼 العربية' }],
  'قطر': [{ code: 'ar', label: '🇶🇦 العربية' }],
  'البحرين': [{ code: 'ar', label: '🇧🇭 العربية' }],
  'عمان': [{ code: 'ar', label: '🇴🇲 العربية' }],
  'اليمن': [{ code: 'ar', label: '🇾🇪 العربية' }],
  'العراق': [{ code: 'ar', label: '🇮🇶 العربية' }],
  'سوريا': [{ code: 'ar', label: '🇸🇾 العربية' }],
  'لبنان': [{ code: 'ar', label: '🇱🇧 العربية' }],
  'الأردن': [{ code: 'ar', label: '🇯🇴 العربية' }],
  'فلسطين': [{ code: 'ar', label: '🇵🇸 العربية' }],
  // ═══ آسيا الوسطى ═══
  'أفغانستان': [{ code: 'ps', label: '🇦🇫 پښتو' }],
  'باكستان': [{ code: 'ur', label: '🇵🇰 اردو' }],
  'كازاخستان': [{ code: 'kk', label: '🇰🇿 Қазақша' }],
  'أوزبكستان': [{ code: 'uz', label: '🇺🇿 Oʻzbek' }],
  'طاجيكستان': [{ code: 'tg', label: '🇹🇯 Тоҷикӣ' }],
  'تركمانستان': [{ code: 'tk', label: '🇹🇲 Türkmen' }],
  'قيرغيزستان': [{ code: 'ky', label: '🇰🇬 Кыргызча' }],
  // ═══ جنوب آسيا ═══
  'الهند': [{ code: 'hi', label: '🇮🇳 हिन्दी' }, { code: 'en', label: '🇮🇳 English' }],
  'بنغلاديش': [{ code: 'bn', label: '🇧🇩 বাংলা' }],
  'سريلانكا': [{ code: 'si', label: '🇱🇰 සිංහල' }],
  'نيبال': [{ code: 'ne', label: '🇳🇵 नेपाली' }],
  'المالديف': [{ code: 'dv', label: '🇲🇻 ދިވެހި' }],
  // ═══ جنوب شرق آسيا ═══
  'إندونيسيا': [{ code: 'id', label: '🇮🇩 Bahasa Indonesia' }],
  'ماليزيا': [{ code: 'ms', label: '🇲🇾 Bahasa Melayu' }],
  'سنغافورة': [{ code: 'en', label: '🇸🇬 English' }],
  'بروناي': [{ code: 'ms', label: '🇧🇳 Melayu' }],
  'الفلبين': [{ code: 'tl', label: '🇵🇭 Filipino' }],
  'تايلاند': [{ code: 'th', label: '🇹🇭 ภาษาไทย' }],
  'فيتنام': [{ code: 'vi', label: '🇻🇳 Tiếng Việt' }],
  'ميانمار': [{ code: 'my', label: '🇲🇲 မြန်မာ' }],
  'كمبوديا': [{ code: 'km', label: '🇰🇭 ភាសាខ្មែរ' }],
  'لاوس': [{ code: 'lo', label: '🇱🇦 ລາວ' }],
  'تيمور الشرقية': [{ code: 'pt', label: '🇹🇱 Português' }],
  // ═══ شرق آسيا ═══
  'الصين': [{ code: 'zh', label: '🇨🇳 中文' }],
  'اليابان': [{ code: 'ja', label: '🇯🇵 日本語' }],
  'كوريا الجنوبية': [{ code: 'ko', label: '🇰🇷 한국어' }],
  'تايوان': [{ code: 'zh', label: '🇹🇼 中文' }],
  'منغوليا': [{ code: 'mn', label: '🇲🇳 Монгол' }],
  // ═══ أفريقيا الشمالية ═══
  'المغرب': [{ code: 'ar', label: '🇲🇦 العربية' }, { code: 'fr', label: '🇲🇦 Français' }],
  'الجزائر': [{ code: 'ar', label: '🇩🇿 العربية' }, { code: 'fr', label: '🇩🇿 Français' }],
  'تونس': [{ code: 'ar', label: '🇹🇳 العربية' }, { code: 'fr', label: '🇹🇳 Français' }],
  'ليبيا': [{ code: 'ar', label: '🇱🇾 العربية' }],
  'مصر': [{ code: 'ar', label: '🇪🇬 العربية' }],
  'السودان': [{ code: 'ar', label: '🇸🇩 العربية' }],
  'موريتانيا': [{ code: 'ar', label: '🇲🇷 العربية' }, { code: 'fr', label: '🇲🇷 Français' }],
  // ═══ أفريقيا جنوب الصحراء ═══
  'الصومال': [{ code: 'so', label: '🇸🇴 Soomaali' }],
  'إثيوبيا': [{ code: 'am', label: '🇪🇹 አማርኛ' }],
  'إريتريا': [{ code: 'ti', label: '🇪🇷 ትግርኛ' }],
  'جيبوتي': [{ code: 'ar', label: '🇩🇯 العربية' }, { code: 'fr', label: '🇩🇯 Français' }],
  'كينيا': [{ code: 'sw', label: '🇰🇪 Kiswahili' }, { code: 'en', label: '🇰🇪 English' }],
  'تنزانيا': [{ code: 'sw', label: '🇹🇿 Kiswahili' }],
  'أوغندا': [{ code: 'en', label: '🇺🇬 English' }],
  'رواندا': [{ code: 'rw', label: '🇷🇼 Kinyarwanda' }, { code: 'fr', label: '🇷🇼 Français' }],
  'نيجيريا': [{ code: 'en', label: '🇳🇬 English' }],
  'غانا': [{ code: 'en', label: '🇬🇭 English' }],
  'السنغال': [{ code: 'fr', label: '🇸🇳 Français' }],
  'مالي': [{ code: 'fr', label: '🇲🇱 Français' }],
  'النيجر': [{ code: 'fr', label: '🇳🇪 Français' }],
  'بوركينا فاسo': [{ code: 'fr', label: '🇧🇫 Français' }],
  'غينيا': [{ code: 'fr', label: '🇬🇳 Français' }],
  'ساحل العاج': [{ code: 'fr', label: '🇨🇮 Français' }],
  'الكاميرون': [{ code: 'fr', label: '🇨🇲 Français' }, { code: 'en', label: '🇨🇲 English' }],
  'تشاد': [{ code: 'ar', label: '🇹🇩 العربية' }, { code: 'fr', label: '🇹🇩 Français' }],
  'جنوب السودان': [{ code: 'en', label: '🇸🇸 English' }],
  'جمهورية الكونغو': [{ code: 'fr', label: '🇨🇬 Français' }],
  'الكونغو الديمقراطية': [{ code: 'fr', label: '🇨🇩 Français' }],
  'أنغولا': [{ code: 'pt', label: '🇦🇴 Português' }],
  'موزمبيق': [{ code: 'pt', label: '🇲🇿 Português' }],
  'زيمبابوي': [{ code: 'en', label: '🇿🇼 English' }],
  'زامبيا': [{ code: 'en', label: '🇿🇲 English' }],
  'مالاوي': [{ code: 'en', label: '🇲🇼 English' }],
  'جنوب أفريقيا': [{ code: 'en', label: '🇿🇦 English' }, { code: 'af', label: '🇿🇦 Afrikaans' }],
  'ناميبيا': [{ code: 'en', label: '🇳🇦 English' }],
  'بوتسوانا': [{ code: 'en', label: '🇧🇼 English' }],
  'ليسوتو': [{ code: 'en', label: '🇱🇸 English' }],
  'سواتيني': [{ code: 'en', label: '🇸🇿 English' }],
  'مدغشقر': [{ code: 'fr', label: '🇲🇬 Français' }],
  // ═══ أمريكا الشمالية ═══
  'الولايات المتحدة': [{ code: 'en', label: '🇺🇸 English' }],
  'كندا': [{ code: 'en', label: '🇨🇦 English' }, { code: 'fr', label: '🇨🇦 Français' }],
  'المكسيك': [{ code: 'es', label: '🇲🇽 Español' }],
  'غواتيمالا': [{ code: 'es', label: '🇬🇹 Español' }],
  'هندوراس': [{ code: 'es', label: '🇭🇳 Español' }],
  'السلفادور': [{ code: 'es', label: '🇸🇻 Español' }],
  'نيكاراغوا': [{ code: 'es', label: '🇳🇮 Español' }],
  'كوستاريكا': [{ code: 'es', label: '🇨🇷 Español' }],
  'بنما': [{ code: 'es', label: '🇵🇦 Español' }],
  'كوبا': [{ code: 'es', label: '🇨🇺 Español' }],
  'جمهورية الدومينيكان': [{ code: 'es', label: '🇩🇴 Español' }],
  'هايتي': [{ code: 'fr', label: '🇭🇹 Français' }],
  'ترينيداد وتوباغو': [{ code: 'en', label: '🇹🇹 English' }],
  'جامايكا': [{ code: 'en', label: '🇯🇲 English' }],
  // ═══ أمريكا الجنوبية ═══
  'البرازيل': [{ code: 'pt', label: '🇧🇷 Português' }],
  'الأرجنتين': [{ code: 'es', label: '🇦🇷 Español' }],
  'كولومبيا': [{ code: 'es', label: '🇨🇴 Español' }],
  'تشيلي': [{ code: 'es', label: '🇨🇱 Español' }],
  'بيرu': [{ code: 'es', label: '🇵🇪 Español' }],
  'فنزويلا': [{ code: 'es', label: '🇻🇪 Español' }],
  'الإكوادور': [{ code: 'es', label: '🇪🇨 Español' }],
  'بوليفيا': [{ code: 'es', label: '🇧🇴 Español' }],
  'باراغواي': [{ code: 'es', label: '🇵🇾 Español' }],
  'أوروغواي': [{ code: 'es', label: '🇺🇾 Español' }],
  'غيانا': [{ code: 'en', label: '🇬🇾 English' }],
  'سورينام': [{ code: 'nl', label: '🇸🇷 Nederlands' }],
  // ═══ أوقيانوسيا ═══
  'أستراليا': [{ code: 'en', label: '🇦🇺 English' }],
  'نيوزيلندا': [{ code: 'en', label: '🇳🇿 English' }],
  'بابوا غينيا الجديدة': [{ code: 'en', label: '🇵🇬 English' }],
  'فيجي': [{ code: 'en', label: '🇫🇯 English' }],
};

function getMosqueLanguages(country) {
  return COUNTRY_LANGUAGES[country] || [{ code: 'en', label: '🌍 English' }];
}

function getMosque(userId) {
  const all = db.getAllMosques();
  return Object.values(all).find(m =>
    String(m.adminId) === String(userId) ||
    String(m.createdBy) === String(userId)
  ) || null;
}

function generateReport(mosque) {
  const campaigns = db.getMosqueCampaigns(mosque.id);
  const events = db.getMosqueEvents(mosque.id);
  const complaints = db.getMosqueComplaints(mosque.id);
  const roles = db.getMosqueRoles(mosque.id) || {};
  const allUsers = db.get('users') || {};
  const worshippers = Object.values(allUsers).filter(u => u.mosqueId === mosque.id);
  const logistics = db.getMosqueLogistics(mosque.id);
  const totalCollected = campaigns.reduce((s, c) => s + (c.collectedAmount || 0), 0);
  const totalGoal = campaigns.reduce((s, c) => s + (c.goal || 0), 0);
  const closedComplaints = complaints.filter(c => c.status === 'closed').length;
  const closedLogistics = logistics.filter(r => r.status === 'closed').length;
  const year = new Date().getFullYear();
  return {
    mosqueName: mosque.name,
    city: mosque.city,
    country: mosque.country,
    year,
    teamCount: Object.keys(roles).length,
    worshippersCount: worshippers.length,
    totalCollected,
    totalGoal,
    campaignsCount: campaigns.length,
    eventsCount: events.length,
    complaintsTotal: complaints.length,
    complaintsClosed: closedComplaints,
    logisticsTotal: logistics.length,
    logisticsClosed: closedLogistics,
    date: new Date().toLocaleDateString('ar')
  };
}

function buildArabicReportText(d) {
  return (
    `تقرير سنوي للمسجد:\n` +
    `اسم المسجد: ${d.mosqueName}\n` +
    `المدينة: ${d.city}, ${d.country}\n` +
    `السنة: ${d.year}\n` +
    `الفريق الإداري: ${d.teamCount} أشخاص\n` +
    `المصلون المسجلون: ${d.worshippersCount} شخص\n` +
    `إجمالي التبرعات: ${d.totalCollected} يورو\n` +
    `إجمالي أهداف الحملات: ${d.totalGoal} يورو\n` +
    `عدد الحملات: ${d.campaignsCount}\n` +
    `الفعاليات المنظمة: ${d.eventsCount}\n` +
    `الشكاوى الواردة: ${d.complaintsTotal} والمحلولة: ${d.complaintsClosed}\n` +
    `بلاغات الأعطال: ${d.logisticsTotal} والمحلولة: ${d.logisticsClosed}`
  );
}

async function generateStateReport(mosqueId) {
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque) throw new Error('المسجد غير موجود');
  const d = generateReport(mosque);
  return buildArabicReportText(d);
}

function buildStateReportKeyboard(mosqueId, country) {
  const languages = getMosqueLanguages(country);
  const langButtons = languages.map(lang => [
    { text: `📄 ${lang.label}`, callback_data: `sr_lang_${lang.code}_${mosqueId}` }
  ]);
  return [
    [{ text: '📄 عربي', callback_data: `sr_arabic_${mosqueId}` }],
    ...langButtons,
    [{ text: '📄 كلا اللغتين', callback_data: `sr_both_${mosqueId}` }],
    [{ text: '🔙 رجوع', callback_data: `mosque_admin_panel_${mosqueId}` }]
  ];
}

async function showStateReportMenu(ctx, mosqueId) {
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque) return ctx.reply('⚠️ غير مصرح.');
  const country = mosque?.country || '';
  const keyboard = buildStateReportKeyboard(mosqueId, country);
  await ctx.editMessageText(
    `📋 *تقرير الدولة*\n\n` +
    `🕌 ${mosque.name}\n` +
    `اختر لغة التقرير:`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    }
  );
}

async function showStateReport(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return ctx.reply('⚠️ غير مصرح.');
  const mosqueId = mosque.id;
  const mosques = db.get('mosques') || {};
  const mosqueData = mosques[mosqueId];
  const country = mosqueData?.country || mosque.country || '';
  const languages = getMosqueLanguages(country);
  // بناء أزرار اللغات ديناميكياً
  const langButtons = languages.map(lang => [
    { text: `📄 ${lang.label}`, callback_data: `sr_lang_${lang.code}_${mosqueId}` }
  ]);
  const keyboard = [
    [{ text: '📄 عربي', callback_data: `sr_arabic_${mosqueId}` }],
    ...langButtons,
    [{ text: '📄 كلا اللغتين', callback_data: `sr_both_${mosqueId}` }],
    [{ text: '🔙 رجوع', callback_data: `mosque_admin_panel_${mosqueId}` }]
  ];
  await ctx.editMessageText(
    `📋 *تقرير الدولة*\n\n` +
    `🕌 ${mosque.name}\n` +
    `اختر لغة التقرير:`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    }
  );
}

async function showReportArabic(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const d = generateReport(mosque);
  const report =
    `📄 *التقرير السنوي — ${d.year}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 المسجد: ${d.mosqueName}\n` +
    `📍 المدينة: ${d.city}، ${d.country}\n` +
    `📅 فترة التقرير: ${d.year}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 *الأعضاء*\n` +
    `• الفريق الإداري: ${d.teamCount} أشخاص\n` +
    `• المصلون المسجلون: ${d.worshippersCount} شخص\n\n` +
    `💶 *التقرير المالي*\n` +
    `• إجمالي التبرعات: ${d.totalCollected}€\n` +
    `• إجمالي أهداف الحملات: ${d.totalGoal}€\n` +
    `• عدد الحملات: ${d.campaignsCount}\n\n` +
    `📅 *الأنشطة*\n` +
    `• الفعاليات المنظمة: ${d.eventsCount}\n` +
    `• الشكاوى الواردة: ${d.complaintsTotal} | المحلولة: ${d.complaintsClosed}\n` +
    `• بلاغات الأعطال: ${d.logisticsTotal} | المحلولة: ${d.logisticsClosed}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✍️ أُنشئ بواسطة: بوت منارة المسلم\n` +
    `📆 التاريخ: ${d.date}`;
  await ctx.reply(report, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_state_report')]])
  });
}

async function translateWithGemini(arabicReport, langCode = 'de') {
  const { askGemini } = require('../services/gemini');
  const prompt =
    `ترجم هذا التقرير الرسمي للمسجد إلى اللغة ذات رمز ISO "${langCode}" بشكل احترافي ومنظم، ` +
    `مع الحفاظ على نفس التنسيق والأرقام. لا تترجم اسم المسجد أو المدينة:\n\n${arabicReport}`;
  const result = await askGemini(prompt);
  return result.text;
}

async function handleReportLang(ctx) {
  const langCode = ctx.match[1];
  const mosqueId = ctx.match[2];
  await ctx.answerCbQuery();
  try {
    const arabicReport = await generateStateReport(mosqueId);
    const translated = await translateWithGemini(arabicReport, langCode);
    await ctx.editMessageText(translated, { parse_mode: 'Markdown' });
  } catch (err) {
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
      await ctx.reply(
        `❌ حصة Gemini منتهية مؤقتاً\n\nحاول مرة أخرى لاحقاً`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔙 رجوع', callback_data: `sr_lang_menu_${mosqueId}` }
            ]]
          }
        }
      );
    } else {
      await ctx.reply(`❌ خطأ في الترجمة: ${err.message}`);
    }
  }
}

async function showReportArabicById(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const mosqueId = ctx.match[1];
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque) return;
  const d = generateReport(mosque);
  const report =
    `📄 *التقرير السنوي — ${d.year}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 المسجد: ${d.mosqueName}\n` +
    `📍 المدينة: ${d.city}، ${d.country}\n` +
    `📅 فترة التقرير: ${d.year}\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 *الأعضاء*\n` +
    `• الفريق الإداري: ${d.teamCount} أشخاص\n` +
    `• المصلون المسجلون: ${d.worshippersCount} شخص\n\n` +
    `💶 *التقرير المالي*\n` +
    `• إجمالي التبرعات: ${d.totalCollected}€\n` +
    `• إجمالي أهداف الحملات: ${d.totalGoal}€\n` +
    `• عدد الحملات: ${d.campaignsCount}\n\n` +
    `📅 *الأنشطة*\n` +
    `• الفعاليات المنظمة: ${d.eventsCount}\n` +
    `• الشكاوى الواردة: ${d.complaintsTotal} | المحلولة: ${d.complaintsClosed}\n` +
    `• بلاغات الأعطال: ${d.logisticsTotal} | المحلولة: ${d.logisticsClosed}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✍️ أُنشئ بواسطة: بوت منارة المسلم\n` +
    `📆 التاريخ: ${d.date}`;
  await ctx.reply(report, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_state_report')]])
  });
}

async function showReportBothById(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  await showReportArabicById(ctx);
  await showReportGerman(ctx);
}

async function showReportGerman(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const mosqueId = mosque.id;
  const d = generateReport(mosque);
  const arabicReport =
    `تقرير سنوي للمسجد:\n` +
    `اسم المسجد: ${d.mosqueName}\n` +
    `المدينة: ${d.city}, ${d.country}\n` +
    `السنة: ${d.year}\n` +
    `الفريق الإداري: ${d.teamCount} أشخاص\n` +
    `المصلون المسجلون: ${d.worshippersCount} شخص\n` +
    `إجمالي التبرعات: ${d.totalCollected} يورو\n` +
    `إجمالي أهداف الحملات: ${d.totalGoal} يورو\n` +
    `عدد الحملات: ${d.campaignsCount}\n` +
    `الفعاليات المنظمة: ${d.eventsCount}\n` +
    `الشكاوى الواردة: ${d.complaintsTotal} والمحلولة: ${d.complaintsClosed}\n` +
    `بلاغات الأعطال: ${d.logisticsTotal} والمحلولة: ${d.logisticsClosed}`;
  const waitMsg = await ctx.reply('🤖 جاري الترجمة للألمانية...');
  // جرب Gemini مباشرة — إن فشل أعرض خطأ واضح
  try {
    const translated = await translateWithGemini(arabicReport);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply(
      `📄 *Jahresbericht — ${d.year}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${translated}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✍️ Erstellt von: Manar Al-Muslim Bot\n` +
      `📆 ${new Date().toLocaleDateString('de')}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_state_report')]])
      }
    );
  } catch (err) {
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    if (err?.status === 429 || err?.message?.includes('429')) {
      await ctx.reply(
        `❌ حصة Gemini منتهية مؤقتاً\n\nحاول مرة أخرى لاحقاً`,
        { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: `state_report_${mosqueId}` }]] } }
      );
    } else {
      await ctx.reply(`❌ خطأ في الترجمة: ${err.message}`);
    }
  }
}

async function showReportBoth(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  await showReportArabic(ctx);
  await showReportGerman(ctx);
}

registry.register('ma_state_report', showStateReport);
registry.register(/^state_report_(.+)$/, showStateReport);
registry.register('sr_arabic', showReportArabic);
registry.register('sr_german', showReportGerman);
registry.register('sr_both', showReportBoth);
registry.register(/^sr_arabic_(.+)$/, showReportArabicById);
registry.register(/^sr_both_(.+)$/, showReportBothById);
registry.register(/^sr_lang_menu_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await showStateReportMenu(ctx, ctx.match[1]);
});
registry.register(/^mosque_admin_panel_(.+)$/, async (ctx) => {
  const { mosqueAdminPanel } = require('./mosque_admin');
  await mosqueAdminPanel(ctx);
});

module.exports = { showStateReport, handleReportLang, generateStateReport, translateWithGemini };

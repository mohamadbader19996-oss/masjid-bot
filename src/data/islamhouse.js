// src/data/islamhouse.js
// المكتبة الدعوية — روابط ديناميكية من islamhouse.com
// الكتب الأساسية — ID فقط، الرابط يُبنى تلقائياً
const CORE_BOOKS = [
  {
    id: 'book_001',
    islamhouseId: '2851',
    category: 'تعريفي',
    availableLanguages: ['ar','de','en','fr','tr','ru','nl','es','it','pt','id','ms','bn','ur','fa','zh'],
    titleAr: 'تعرف على الإسلام',
    titleEn: 'Learn About Islam',
    // رابط مباشر للتحميل
    directUrl: {
      en: 'https://islamhouse.com/en/books/2851/',
      ar: 'https://islamhouse.com/ar/books/2851/',
      de: 'https://islamhouse.com/de/books/2851/'
    },
    addedBy: 'developer',
    approved: true
  },
  {
    id: 'book_002',
    islamhouseId: '1751',
    category: 'تعريفي',
    availableLanguages: ['ar','de','en','fr','tr','ru','nl','es'],
    titleAr: 'محمد رسول الله ﷺ',
    titleEn: 'Muhammad the Messenger of Allah',
    directUrl: {
      en: 'https://islamhouse.com/en/books/1751/',
      ar: 'https://islamhouse.com/ar/books/1751/',
      de: 'https://islamhouse.com/de/books/1751/'
    },
    addedBy: 'developer',
    approved: true
  },
  {
    id: 'book_003',
    islamhouseId: '391283',
    category: 'عقيدة',
    availableLanguages: ['ar','de','en','fr','tr','ru'],
    titleAr: 'ما يجب أن يعرفه كل مسلم',
    titleEn: 'What Every Muslim Must Know',
    directUrl: {
      en: 'https://islamhouse.com/en/books/391283/',
      ar: 'https://islamhouse.com/ar/books/391283/',
      de: 'https://islamhouse.com/de/books/391283/'
    },
    addedBy: 'developer',
    approved: true
  },
  {
    id: 'book_004',
    islamhouseId: '402154',
    category: 'ردود شبهات',
    availableLanguages: ['ar','de','en','fr'],
    titleAr: 'مفتاح الفهم الصحيح للإسلام',
    titleEn: 'The Key to a Better Understanding of Islam',
    directUrl: {
      en: 'https://islamhouse.com/en/books/402154/',
      ar: 'https://islamhouse.com/ar/books/402154/',
      de: 'https://islamhouse.com/de/books/402154/'
    },
    addedBy: 'developer',
    approved: true
  },
  {
    id: 'book_005',
    islamhouseId: '402156',
    category: 'ردود شبهات',
    availableLanguages: ['ar','de','en','fr'],
    titleAr: 'مفاهيم مغلوطة حول حقوق الإنسان في الإسلام',
    titleEn: 'Misconceptions About Human Rights in Islam',
    directUrl: {
      en: 'https://islamhouse.com/en/books/402156/',
      ar: 'https://islamhouse.com/ar/books/402156/',
      de: 'https://islamhouse.com/de/books/402156/'
    },
    addedBy: 'developer',
    approved: true
  },
  {
    id: 'book_006',
    islamhouseId: '227',
    category: 'سيرة نبوية',
    availableLanguages: ['ar','de','en','fr','tr','ru'],
    titleAr: 'السيرة النبوية المختصرة',
    titleEn: 'A Brief Biography of the Prophet',
    directUrl: {
      en: 'https://islamhouse.com/en/books/227/',
      ar: 'https://islamhouse.com/ar/books/227/',
      de: 'https://islamhouse.com/de/books/227/'
    },
    addedBy: 'developer',
    approved: true
  }
];

// خريطة الدول إلى رموز اللغات
const COUNTRY_LANGUAGE_MAP = {
  // أوروبا الغربية
  'ألمانيا': 'de', 'Germany': 'de',
  'فرنسا': 'fr', 'France': 'fr',
  'إسبانيا': 'es', 'Spain': 'es',
  'إيطاليا': 'it', 'Italy': 'it',
  'هولندا': 'nl', 'Netherlands': 'nl',
  'بلجيكا': 'nl', 'Belgium': 'nl',
  'البرتغال': 'pt', 'Portugal': 'pt',
  'السويد': 'sv', 'Sweden': 'sv',
  'النرويج': 'no', 'Norway': 'no',
  'الدنمارك': 'da', 'Denmark': 'da',
  'فنلندا': 'fi', 'Finland': 'fi',
  'النمسا': 'de', 'Austria': 'de',
  'سويسرا': 'de', 'Switzerland': 'de',
  'المملكة المتحدة': 'en', 'United Kingdom': 'en',
  'إيرلندا': 'en', 'Ireland': 'en',
  // أوروبا الشرقية
  'روسيا': 'ru', 'Russia': 'ru',
  'أوكرانيا': 'uk', 'Ukraine': 'uk',
  'بولندا': 'pl', 'Poland': 'pl',
  'رومانيا': 'ro', 'Romania': 'ro',
  'بلغاريا': 'bg', 'Bulgaria': 'bg',
  'المجر': 'hu', 'Hungary': 'hu',
  'التشيك': 'cs', 'Czech Republic': 'cs',
  'سلوفاكيا': 'sk', 'Slovakia': 'sk',
  'صربيا': 'sr', 'Serbia': 'sr',
  'كرواتيا': 'hr', 'Croatia': 'hr',
  'البوسنة': 'bs', 'Bosnia': 'bs',
  'ألبانيا': 'sq', 'Albania': 'sq',
  'مقدونيا': 'mk', 'Macedonia': 'mk',
  'بيلاروسيا': 'be', 'Belarus': 'be',
  'لاتفيا': 'lv', 'Latvia': 'lv',
  'ليتوانيا': 'lt', 'Lithuania': 'lt',
  'إستونيا': 'et', 'Estonia': 'et',
  // البلقان وجنوب أوروبا
  'اليونان': 'el', 'Greece': 'el',
  'تركيا': 'tr', 'Turkey': 'tr',
  'قبرص': 'el', 'Cyprus': 'el',
  // آسيا الوسطى
  'كازاخستان': 'kk', 'Kazakhstan': 'kk',
  'أوزبكستان': 'uz', 'Uzbekistan': 'uz',
  'قيرغيزستان': 'ky', 'Kyrgyzstan': 'ky',
  'طاجيكستان': 'tg', 'Tajikistan': 'tg',
  'تركمانستان': 'tk', 'Turkmenistan': 'tk',
  'أذربيجان': 'az', 'Azerbaijan': 'az',
  // الشرق الأوسط
  'السعودية': 'ar', 'Saudi Arabia': 'ar',
  'الإمارات': 'ar', 'UAE': 'ar',
  'مصر': 'ar', 'Egypt': 'ar',
  'الأردن': 'ar', 'Jordan': 'ar',
  'لبنان': 'ar', 'Lebanon': 'ar',
  'سوريا': 'ar', 'Syria': 'ar',
  'العراق': 'ar', 'Iraq': 'ar',
  'المغرب': 'ar', 'Morocco': 'ar',
  'تونس': 'ar', 'Tunisia': 'ar',
  'الجزائر': 'ar', 'Algeria': 'ar',
  'ليبيا': 'ar', 'Libya': 'ar',
  'اليمن': 'ar', 'Yemen': 'ar',
  'عُمان': 'ar', 'Oman': 'ar',
  'الكويت': 'ar', 'Kuwait': 'ar',
  'قطر': 'ar', 'Qatar': 'ar',
  'البحرين': 'ar', 'Bahrain': 'ar',
  'إيران': 'fa', 'Iran': 'fa',
  'أفغانستان': 'ps', 'Afghanistan': 'ps',
  'باكستان': 'ur', 'Pakistan': 'ur',
  'كردستان': 'ku',
  // جنوب آسيا
  'الهند': 'ur', 'India': 'ur',
  'بنغلاديش': 'bn', 'Bangladesh': 'bn',
  'سريلانكا': 'en', 'Sri Lanka': 'en',
  'نيبال': 'en', 'Nepal': 'en',
  // جنوب شرق آسيا
  'إندونيسيا': 'id', 'Indonesia': 'id',
  'ماليزيا': 'ms', 'Malaysia': 'ms',
  'الفلبين': 'en', 'Philippines': 'en',
  'تايلاند': 'en', 'Thailand': 'en',
  'فيتنام': 'en', 'Vietnam': 'en',
  // شرق آسيا
  'الصين': 'zh', 'China': 'zh',
  'اليابان': 'ja', 'Japan': 'ja',
  'كوريا الجنوبية': 'ko', 'South Korea': 'ko',
  // أفريقيا
  'نيجيريا': 'ha', 'Nigeria': 'ha',
  'السنغال': 'fr', 'Senegal': 'fr',
  'مالي': 'fr', 'Mali': 'fr',
  'غينيا': 'fr', 'Guinea': 'fr',
  'الكاميرون': 'fr', 'Cameroon': 'fr',
  'ساحل العاج': 'fr', "Côte d'Ivoire": 'fr',
  'الصومال': 'so', 'Somalia': 'so',
  'إثيوبيا': 'am', 'Ethiopia': 'am',
  'كينيا': 'sw', 'Kenya': 'sw',
  'تنزانيا': 'sw', 'Tanzania': 'sw',
  'أوغندا': 'sw', 'Uganda': 'sw',
  'جنوب أفريقيا': 'en', 'South Africa': 'en',
  'غانا': 'en', 'Ghana': 'en',
  'زيمبابوي': 'en', 'Zimbabwe': 'en',
  // أمريكا
  'الولايات المتحدة': 'en', 'United States': 'en',
  'كندا': 'en', 'Canada': 'en',
  'البرازيل': 'pt', 'Brazil': 'pt',
  'الأرجنتين': 'es', 'Argentina': 'es',
  'المكسيك': 'es', 'Mexico': 'es',
  'كولومبيا': 'es', 'Colombia': 'es',
  // أوقيانوسيا
  'أستراليا': 'en', 'Australia': 'en',
  'نيوزيلندا': 'en', 'New Zealand': 'en',
  // القوقاز
  'أرمينيا': 'hy', 'Armenia': 'hy',
  'جورجيا': 'ka', 'Georgia': 'ka',
  'منغوليا': 'mn', 'Mongolia': 'mn'
};

// بناء رابط الكتاب ديناميكياً
function buildBookUrl(islamhouseId, langCode, titleEn, titleAr) {
  // Google search مباشر — أول نتيجة دائماً PDF من islamhouse
  const query = encodeURIComponent(`${titleEn} islamhouse PDF`);
  return `https://www.google.com/search?q=${query}`;
}

// جلب اللغة حسب الدولة
function getLangByCountry(country) {
  return COUNTRY_LANGUAGE_MAP[country] || 'en';
}

// جلب الكتب حسب اللغة مع fallback للإنجليزية
function getBooksByLanguage(langCode) {
  const lang = langCode || 'en';
  return CORE_BOOKS
    .filter(book => book.approved)
    .map(book => {
      const availLang = book.availableLanguages.includes(lang) ? lang : 'en';
      return {
        id: book.id,
        islamhouseId: book.islamhouseId,
        title: lang === 'ar' ? book.titleAr : book.titleEn,
        titleAr: book.titleAr,
        url: buildBookUrl(book.islamhouseId, availLang, book.titleEn, book.titleAr),
        category: book.category,
        addedBy: book.addedBy
      };
    });
}

// جلب الكتب حسب التصنيف
function getBooksByCategory(langCode, category) {
  const all = getBooksByLanguage(langCode);
  if (category === 'الكل') return all;
  return all.filter(b => b.category === category);
}

// تصنيفات الكتب
const BOOK_CATEGORIES = ['الكل', 'تعريفي', 'عقيدة', 'سيرة نبوية', 'ردود شبهات'];

module.exports = {
  CORE_BOOKS,
  COUNTRY_LANGUAGE_MAP,
  BOOK_CATEGORIES,
  getBooksByLanguage,
  getBooksByCategory,
  getLangByCountry,
  buildBookUrl
};

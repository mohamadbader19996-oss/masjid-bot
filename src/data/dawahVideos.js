// src/data/dawahVideos.js
// الفيديوهات الدعوية الأساسية — روابط YouTube مباشرة
const CORE_VIDEOS = [
  // =================== تعريفي ===================
  {
    id: 'vid_001',
    title: 'What is Islam? Introduction for Non-Muslims',
    titleAr: 'ما هو الإسلام؟ مقدمة لغير المسلمين',
    url: 'https://www.youtube.com/watch?v=RuCDKaOFMYY',
    language: 'en',
    category: 'تعريفي',
    channel: 'The Deen Show',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  {
    id: 'vid_002',
    title: 'Why do people accept Islam?',
    titleAr: 'لماذا يدخل الناس الإسلام؟',
    url: 'https://www.youtube.com/watch?v=FbRHLKqMTaE',
    language: 'en',
    category: 'تعريفي',
    channel: 'Merciful Servant',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  {
    id: 'vid_003',
    title: 'Was ist der Islam? Einführung auf Deutsch',
    titleAr: 'ما هو الإسلام؟ مقدمة بالألمانية',
    url: 'https://www.youtube.com/watch?v=_nKMNR6sMtU',
    language: 'de',
    category: 'تعريفي',
    channel: 'Islam Heute',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  {
    id: 'vid_004',
    title: 'تعرف على الإسلام — مقدمة شاملة',
    titleAr: 'تعرف على الإسلام — مقدمة شاملة',
    url: 'https://www.youtube.com/watch?v=1Bm4GbDdTg0',
    language: 'ar',
    category: 'تعريفي',
    channel: 'إياد قنيبي',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  // =================== قصص إسلام ===================
  {
    id: 'vid_005',
    title: 'My Journey to Islam — Powerful Story',
    titleAr: 'رحلتي إلى الإسلام — قصة مؤثرة',
    url: 'https://www.youtube.com/watch?v=3hHHSdoEHs4',
    language: 'en',
    category: 'قصص إسلام',
    channel: 'OnePath Network',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  {
    id: 'vid_006',
    title: 'Wie ich Muslim wurde — Geschichte aus Deutschland',
    titleAr: 'كيف أسلمت — قصة من ألمانيا',
    url: 'https://www.youtube.com/watch?v=5sNIAzmNn0Y',
    language: 'de',
    category: 'قصص إسلام',
    channel: 'Islam Heute',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  {
    id: 'vid_007',
    title: 'قصص إسلام مؤثرة — بالقرآن اهتديت',
    titleAr: 'قصص إسلام مؤثرة',
    url: 'https://www.youtube.com/watch?v=kZ_HcBNkqSo',
    language: 'ar',
    category: 'قصص إسلام',
    channel: 'قناة دينية',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  // =================== ردود شبهات ===================
  {
    id: 'vid_008',
    title: 'Common Questions about Islam Answered',
    titleAr: 'إجابات على أسئلة شائعة عن الإسلام',
    url: 'https://www.youtube.com/watch?v=DKBqdGMGKS4',
    language: 'en',
    category: 'ردود شبهات',
    channel: 'Mohammed Hijab',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  {
    id: 'vid_009',
    title: 'ردود على شبهات الإسلام — د. إياد قنيبي',
    titleAr: 'ردود على شبهات الإسلام',
    url: 'https://www.youtube.com/watch?v=OKb_B9RsAiU',
    language: 'ar',
    category: 'ردود شبهات',
    channel: 'إياد قنيبي',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  },
  // =================== حوارات ===================
  {
    id: 'vid_010',
    title: 'Dialogue between Muslim and Christian',
    titleAr: 'حوار بين مسلم ومسيحي',
    url: 'https://www.youtube.com/watch?v=2T4jHeKMOwE',
    language: 'en',
    category: 'حوارات',
    channel: 'The Deen Show',
    addedBy: 'developer',
    approved: true,
    reports: 0,
    frozen: false
  }
];

// تصنيفات الفيديوهات
const VIDEO_CATEGORIES = ['الكل', 'تعريفي', 'قصص إسلام', 'ردود شبهات', 'حوارات'];

// رموز اللغات
const LANG_FLAGS = {
  ar: '🇸🇦', de: '🇩🇪', en: '🇬🇧', fr: '🇫🇷',
  tr: '🇹🇷', ru: '🇷🇺', id: '🇮🇩', ur: '🇵🇰'
};

// جلب الفيديوهات حسب التصنيف واللغة
function getVideosByCategory(category, langCode) {
  let videos = CORE_VIDEOS.filter(v => v.approved && !v.frozen);
  if (category !== 'الكل') {
    videos = videos.filter(v => v.category === category);
  }
  // ترتيب: لغة المستخدم أولاً ثم الإنجليزية ثم الباقي
  videos.sort((a, b) => {
    if (a.language === langCode) return -1;
    if (b.language === langCode) return 1;
    if (a.language === 'en') return -1;
    if (b.language === 'en') return 1;
    return 0;
  });
  return videos;
}

module.exports = {
  CORE_VIDEOS,
  VIDEO_CATEGORIES,
  LANG_FLAGS,
  getVideosByCategory
};

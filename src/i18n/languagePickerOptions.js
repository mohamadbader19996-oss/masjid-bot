/** لغات واجهة المستخدم — 199 لغة (99 أساسية + 100 إضافية) */
const { EXTRA_PREWARM_LANG_CODES, EXTRA_LANG_META } = require('./languagePickerOptionsExtra');

const PREWARM_LANG_CODES = [
  'tr', 'fa', 'ps', 'sq', 'bs', 'sr', 'hr', 'mk', 'sl', 'so', 'ku', 'ur', 'ru', 'uk', 'pl', 'nl',
  'es', 'it', 'pt', 'ro', 'bg', 'el', 'hu', 'cs', 'sk', 'sv', 'no', 'da', 'fi', 'et', 'lv', 'lt',
  'am', 'ti', 'sw', 'ha', 'yo', 'az', 'ka', 'hy', 'uz', 'kk', 'tg', 'mn',
  'id', 'ms', 'bn', 'hi', 'zh', 'ja', 'ko', 'vi', 'th', 'ta', 'te', 'pa', 'gu', 'ne', 'si', 'my', 'km', 'lo', 'tl',
  'ig', 'zu', 'af', 'eu', 'gl', 'is', 'ga', 'cy', 'mt', 'lb',
  'mr', 'kn', 'ml', 'ca', 'ky', 'tk', 'tt', 'or', 'as', 'sd',
  'jv', 'su', 'ceb', 'ny', 'sn', 'st', 'xh', 'rw', 'mg', 'fy', 'hmn', 'ba', 'co',
  ...EXTRA_PREWARM_LANG_CODES
];

const PRIORITY_LANG_CODES = ['de', 'en', 'fr'];

const LANG_META = {
  de: { label: 'Deutsch', flag: '🇩🇪' },
  en: { label: 'English', flag: '🇬🇧' },
  fr: { label: 'Français', flag: '🇫🇷' },
  tr: { label: 'Türkçe', flag: '🇹🇷' },
  fa: { label: 'فارسی', flag: '🇮🇷' },
  ps: { label: 'پښتو', flag: '🇦🇫' },
  sq: { label: 'Shqip', flag: '🇦🇱' },
  bs: { label: 'Bosanski', flag: '🇧🇦' },
  sr: { label: 'Српски', flag: '🇷🇸' },
  hr: { label: 'Hrvatski', flag: '🇭🇷' },
  mk: { label: 'Македонски', flag: '🇲🇰' },
  sl: { label: 'Slovenščina', flag: '🇸🇮' },
  so: { label: 'Soomaali', flag: '🇸🇴' },
  ku: { label: 'Kurdî', flag: '🏳️' },
  ur: { label: 'اردو', flag: '🇵🇰' },
  ru: { label: 'Русский', flag: '🇷🇺' },
  uk: { label: 'Українська', flag: '🇺🇦' },
  pl: { label: 'Polski', flag: '🇵🇱' },
  nl: { label: 'Nederlands', flag: '🇳🇱' },
  es: { label: 'Español', flag: '🇪🇸' },
  it: { label: 'Italiano', flag: '🇮🇹' },
  pt: { label: 'Português', flag: '🇵🇹' },
  ro: { label: 'Română', flag: '🇷🇴' },
  bg: { label: 'Български', flag: '🇧🇬' },
  el: { label: 'Ελληνικά', flag: '🇬🇷' },
  hu: { label: 'Magyar', flag: '🇭🇺' },
  cs: { label: 'Čeština', flag: '🇨🇿' },
  sk: { label: 'Slovenčina', flag: '🇸🇰' },
  sv: { label: 'Svenska', flag: '🇸🇪' },
  no: { label: 'Norsk', flag: '🇳🇴' },
  da: { label: 'Dansk', flag: '🇩🇰' },
  fi: { label: 'Suomi', flag: '🇫🇮' },
  et: { label: 'Eesti', flag: '🇪🇪' },
  lv: { label: 'Latviešu', flag: '🇱🇻' },
  lt: { label: 'Lietuvių', flag: '🇱🇹' },
  am: { label: 'አማርኛ', flag: '🇪🇹' },
  ti: { label: 'ትግርኛ', flag: '🇪🇷' },
  sw: { label: 'Kiswahili', flag: '🇰🇪' },
  ha: { label: 'Hausa', flag: '🇳🇬' },
  yo: { label: 'Yorùbá', flag: '🇳🇬' },
  az: { label: 'Azərbaycan', flag: '🇦🇿' },
  ka: { label: 'ქართული', flag: '🇬🇪' },
  hy: { label: 'Հայերեն', flag: '🇦🇲' },
  uz: { label: 'Oʻzbek', flag: '🇺🇿' },
  kk: { label: 'Қазақ', flag: '🇰🇿' },
  tg: { label: 'Тоҷикӣ', flag: '🇹🇯' },
  mn: { label: 'Монгол', flag: '🇲🇳' },
  id: { label: 'Indonesia', flag: '🇮🇩' },
  ms: { label: 'Melayu', flag: '🇲🇾' },
  bn: { label: 'বাংলা', flag: '🇧🇩' },
  hi: { label: 'हिन्दी', flag: '🇮🇳' },
  zh: { label: '中文', flag: '🇨🇳' },
  ja: { label: '日本語', flag: '🇯🇵' },
  ko: { label: '한국어', flag: '🇰🇷' },
  vi: { label: 'Tiếng Việt', flag: '🇻🇳' },
  th: { label: 'ไทย', flag: '🇹🇭' },
  ta: { label: 'தமிழ்', flag: '🇮🇳' },
  te: { label: 'తెలుగు', flag: '🇮🇳' },
  pa: { label: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  gu: { label: 'ગુજરાતી', flag: '🇮🇳' },
  ne: { label: 'नेपाली', flag: '🇳🇵' },
  si: { label: 'සිංහල', flag: '🇱🇰' },
  my: { label: 'မြန်မာ', flag: '🇲🇲' },
  km: { label: 'ខ្មែរ', flag: '🇰🇭' },
  lo: { label: 'ລາວ', flag: '🇱🇦' },
  tl: { label: 'Filipino', flag: '🇵🇭' },
  ig: { label: 'Igbo', flag: '🇳🇬' },
  zu: { label: 'isiZulu', flag: '🇿🇦' },
  af: { label: 'Afrikaans', flag: '🇿🇦' },
  eu: { label: 'Euskara', flag: '🏴' },
  gl: { label: 'Galego', flag: '🇪🇸' },
  is: { label: 'Íslenska', flag: '🇮🇸' },
  ga: { label: 'Gaeilge', flag: '🇮🇪' },
  cy: { label: 'Cymraeg', flag: '🏴' },
  mt: { label: 'Malti', flag: '🇲🇹' },
  lb: { label: 'Lëtzebuergesch', flag: '🇱🇺' },
  mr: { label: 'मराठी', flag: '🇮🇳' },
  kn: { label: 'ಕನ್ನಡ', flag: '🇮🇳' },
  ml: { label: 'മലയാളം', flag: '🇮🇳' },
  ca: { label: 'Català', flag: '🇪🇸' },
  ky: { label: 'Кыргызча', flag: '🇰🇬' },
  tk: { label: 'Türkmen', flag: '🇹🇲' },
  tt: { label: 'Татар', flag: '🇷🇺' },
  or: { label: 'ଓଡ଼ିଆ', flag: '🇮🇳' },
  as: { label: 'অসমীয়া', flag: '🇮🇳' },
  sd: { label: 'سنڌي', flag: '🇵🇰' },
  jv: { label: 'Basa Jawa', flag: '🇮🇩' },
  su: { label: 'Basa Sunda', flag: '🇮🇩' },
  ceb: { label: 'Cebuano', flag: '🇵🇭' },
  ny: { label: 'Chichewa', flag: '🇲🇼' },
  sn: { label: 'Shona', flag: '🇿🇼' },
  st: { label: 'Sesotho', flag: '🇱🇸' },
  xh: { label: 'isiXhosa', flag: '🇿🇦' },
  rw: { label: 'Kinyarwanda', flag: '🇷🇼' },
  mg: { label: 'Malagasy', flag: '🇲🇬' },
  fy: { label: 'Frysk', flag: '🇳🇱' },
  hmn: { label: 'Hmong', flag: '🌐' },
  ba: { label: 'Башҡорт', flag: '🇷🇺' },
  co: { label: 'Corsu', flag: '🇫🇷' },
  ar: { label: 'العربية', flag: '🇸🇦' },
  ...EXTRA_LANG_META
};

const UI_PICKER_LANG_CODES = [
  ...PRIORITY_LANG_CODES,
  ...PREWARM_LANG_CODES.filter((c) => !PRIORITY_LANG_CODES.includes(c))
];

const LANGS_PER_PAGE = 8;

function getLangMeta(code) {
  const meta = LANG_META[code];
  if (meta) return { code, ...meta };
  return { code, label: code.toUpperCase(), flag: '🌐' };
}

function getUiLangDisplayName(code) {
  return getLangMeta(code).label;
}

function getMenuHint(lang) {
  const hints = {
    ar: 'القائمة ⬇️',
    de: 'Menü ⬇️',
    en: 'Menu ⬇️',
    fr: 'Menu ⬇️',
    tr: 'Menü ⬇️',
    es: 'Menú ⬇️',
    it: 'Menu ⬇️',
    pt: 'Menu ⬇️',
    nl: 'Menu ⬇️',
    ru: 'Меню ⬇️',
    uk: 'Меню ⬇️',
    pl: 'Menu ⬇️',
    fa: 'منو ⬇️',
    ur: 'مینو ⬇️',
    id: 'Menu ⬇️',
    ms: 'Menu ⬇️',
    zh: '菜单 ⬇️',
    ja: 'メニュー ⬇️',
    ko: '메뉴 ⬇️'
  };
  return hints[lang] || 'Menu ⬇️';
}

function getLanguagePickerPageCount() {
  return Math.ceil(UI_PICKER_LANG_CODES.length / LANGS_PER_PAGE);
}

function getLanguagePickerPageCodes(page) {
  const start = page * LANGS_PER_PAGE;
  return UI_PICKER_LANG_CODES.slice(start, start + LANGS_PER_PAGE);
}

module.exports = {
  UI_PICKER_LANG_CODES,
  LANGS_PER_PAGE,
  getLangMeta,
  getUiLangDisplayName,
  getMenuHint,
  getLanguagePickerPageCount,
  getLanguagePickerPageCodes
};

const { Markup } = require('telegraf');
const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/ar.json'));

const EXCLUDED_ISO = new Set(['IL']);

/** رموز قديمة (slug) → ISO alpha-2 — للبيانات المخزّنة سابقاً */
const LEGACY_CODE_ALIASES = {
  germany: 'de',
  france: 'fr',
  netherlands: 'nl',
  belgium: 'be',
  austria: 'at',
  switzerland: 'ch',
  sweden: 'se',
  denmark: 'dk',
  norway: 'no',
  finland: 'fi',
  italy: 'it',
  spain: 'es',
  uk: 'gb',
  ireland: 'ie',
  poland: 'pl',
  czech: 'cz',
  hungary: 'hu',
  romania: 'ro',
  greece: 'gr',
  portugal: 'pt',
  luxembourg: 'lu',
  turkey: 'tr',
  japan: 'jp'
};

const PAGE_SIZE = 8;

function flagFromIso(iso2) {
  return [...iso2.toUpperCase()].map(c =>
    String.fromCodePoint(127397 + c.charCodeAt(0))
  ).join('');
}

function normalizeCountryCode(code) {
  if (code == null || code === '') return '';
  const key = String(code).toLowerCase();
  return LEGACY_CODE_ALIASES[key] || key;
}

function buildWorldCountriesList() {
  return Object.keys(countries.getAlpha2Codes())
    .filter(iso => !EXCLUDED_ISO.has(iso))
    .map(iso => {
      const code = iso.toLowerCase();
      return {
        code,
        iso2: iso,
        name: countries.getName(iso, 'ar') || countries.getName(iso, 'en') || iso,
        flag: flagFromIso(iso)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

const WORLD_COUNTRIES = buildWorldCountriesList();
/** @deprecated alias — نفس قائمة WORLD_COUNTRIES */
const MUSLIM_COUNTRIES = WORLD_COUNTRIES;

function getCountryByCode(code) {
  const resolved = normalizeCountryCode(code);
  return WORLD_COUNTRIES.find(c => c.code === resolved) || null;
}

function getCountryName(code) {
  return getCountryByCode(code)?.name || code;
}

function countryCodesMatch(a, b) {
  if (!a || !b) return false;
  return normalizeCountryCode(a) === normalizeCountryCode(b);
}

function buildMuslimCountryKeyboard(prefix, page = 0) {
  const totalPages = Math.ceil(WORLD_COUNTRIES.length / PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * PAGE_SIZE;
  const slice = WORLD_COUNTRIES.slice(start, start + PAGE_SIZE);

  const rows = slice.map(c => [
    Markup.button.callback(`${c.flag} ${c.name}`, prefix + '_' + c.code)
  ]);

  const nav = [];
  if (safePage > 0) nav.push(Markup.button.callback('⬅️', prefix + '_page_' + (safePage - 1)));
  nav.push(Markup.button.callback(`📄 ${safePage + 1}/${totalPages}`, prefix + '_page_noop'));
  if (safePage < totalPages - 1) nav.push(Markup.button.callback('➡️', prefix + '_page_' + (safePage + 1)));
  rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

function parseCountryCallback(data, prefix) {
  if (!data.startsWith(prefix + '_')) return null;
  const rest = data.slice(prefix.length + 1);
  if (rest.startsWith('page_')) {
    const pagePart = rest.slice('page_'.length);
    if (pagePart === 'noop') return { type: 'noop' };
    return { type: 'page', page: parseInt(pagePart, 10) || 0 };
  }
  return { type: 'country', country: getCountryByCode(rest) };
}

module.exports = {
  WORLD_COUNTRIES,
  MUSLIM_COUNTRIES,
  LEGACY_CODE_ALIASES,
  EXCLUDED_ISO,
  normalizeCountryCode,
  countryCodesMatch,
  getCountryByCode,
  getCountryName,
  buildMuslimCountryKeyboard,
  parseCountryCallback
};

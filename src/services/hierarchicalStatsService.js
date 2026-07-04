const db = require('../database');
const { normalizeCountryCode, getCountryName } = require('../data/muslimCountries');
const { REGIONS, getRegionIdForCountry } = require('../data/geoRegions');

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function getCurrentMonthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseMonthKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return { year: y, month: m };
}

function shiftMonthKey(key, delta) {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + delta, 1);
  return getCurrentMonthKey(d);
}

function compareMonthKeys(a, b) {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.month - pb.month;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function formatMonthLabel(key) {
  const { year, month } = parseMonthKey(key);
  return `${AR_MONTHS[month - 1]} ${year}`;
}

function dateInMonth(isoDate, year, month) {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function dayOfMonth(isoDate) {
  const d = new Date(isoDate);
  return d.getDate();
}

function getMosqueActivationDate(mosque) {
  if (mosque.active === false) return null;
  return mosque.approvedAt || mosque.createdAt || null;
}

function getApprovedModerators() {
  return db.allUsers().filter(u =>
    (u.role === 'moderator' || u.role === 'MODERATOR') && u.approvedAt
  );
}

function dateInYear(isoDate, year) {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year;
}

function monthIndex(isoDate) {
  return new Date(isoDate).getMonth();
}

function getCurrentYear(date = new Date()) {
  return date.getFullYear();
}

function compareYears(a, b) {
  return Number(a) - Number(b);
}

function getYearlyStats(year) {
  const y = Number(year);
  const mosquesMonthly = Array(12).fill(0);
  const moderatorsMonthly = Array(12).fill(0);

  for (const mosque of db.allMosques()) {
    const actDate = getMosqueActivationDate(mosque);
    if (!dateInYear(actDate, y)) continue;
    mosquesMonthly[monthIndex(actDate)]++;
  }

  for (const mod of getApprovedModerators()) {
    if (!dateInYear(mod.approvedAt, y)) continue;
    moderatorsMonthly[monthIndex(mod.approvedAt)]++;
  }

  return {
    year: y,
    label: String(y),
    monthLabels: [...AR_MONTHS],
    mosquesMonthly,
    moderatorsMonthly,
    totalMosques: mosquesMonthly.reduce((a, b) => a + b, 0),
    totalModerators: moderatorsMonthly.reduce((a, b) => a + b, 0)
  };
}

function getMonthlyStats(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const days = daysInMonth(year, month);
  const mosquesDaily = Array(days).fill(0);
  const moderatorsDaily = Array(days).fill(0);

  for (const mosque of db.allMosques()) {
    const actDate = getMosqueActivationDate(mosque);
    if (!dateInMonth(actDate, year, month)) continue;
    const day = dayOfMonth(actDate);
    if (day >= 1 && day <= days) mosquesDaily[day - 1]++;
  }

  for (const mod of getApprovedModerators()) {
    if (!dateInMonth(mod.approvedAt, year, month)) continue;
    const day = dayOfMonth(mod.approvedAt);
    if (day >= 1 && day <= days) moderatorsDaily[day - 1]++;
  }

  return {
    monthKey,
    year,
    month,
    days,
    label: formatMonthLabel(monthKey),
    mosquesDaily,
    moderatorsDaily,
    totalMosques: mosquesDaily.reduce((a, b) => a + b, 0),
    totalModerators: moderatorsDaily.reduce((a, b) => a + b, 0)
  };
}

function resolveMosqueCountryCode(mosque) {
  if (mosque.countryCode) return normalizeCountryCode(mosque.countryCode);
  if (mosque.country) {
    const guess = normalizeCountryCode(String(mosque.country).toLowerCase().replace(/\s+/g, '_'));
    if (getCountryName(guess) !== guess) return guess;
  }
  return null;
}

function countWorshippersForMosque(mosqueId) {
  return db.allUsers().filter(u =>
    String(u.mosqueId) === String(mosqueId) &&
    (u.role === 'worshipper' || u.role === 'WORSHIPPER')
  ).length;
}

function getModeratorForCountry(countryCode) {
  const code = normalizeCountryCode(countryCode);
  return db.allUsers().find(u =>
    (u.role === 'moderator' || u.role === 'MODERATOR') &&
    normalizeCountryCode(u.moderatorCountry) === code
  ) || null;
}

function collectCountryCodesInDb() {
  const codes = new Set();
  for (const mosque of db.allMosques()) {
    const c = resolveMosqueCountryCode(mosque);
    if (c) codes.add(c);
  }
  for (const u of db.allUsers()) {
    if ((u.role === 'moderator' || u.role === 'MODERATOR') && u.moderatorCountry) {
      codes.add(normalizeCountryCode(u.moderatorCountry));
    }
  }
  return [...codes];
}

function getRegionsWithData() {
  const regionMap = new Map();
  for (const code of collectCountryCodesInDb()) {
    const regionId = getRegionIdForCountry(code);
    if (!regionMap.has(regionId)) {
      regionMap.set(regionId, new Set());
    }
    regionMap.get(regionId).add(code);
  }
  return REGIONS
    .filter(r => regionMap.has(r.id))
    .map(r => ({
      ...r,
      countryCount: regionMap.get(r.id).size
    }));
}

function getCountriesInRegion(regionId) {
  const codes = collectCountryCodesInDb()
    .filter(code => getRegionIdForCountry(code) === regionId)
    .sort((a, b) => getCountryName(a).localeCompare(getCountryName(b), 'ar'));
  return codes.map(code => ({
    code,
    name: getCountryName(code),
    hasModerator: Boolean(getModeratorForCountry(code)),
    mosqueCount: db.allMosques().filter(m => resolveMosqueCountryCode(m) === code).length
  }));
}

function getCountriesRankedByMosques() {
  const { getCountryByCode } = require('../data/muslimCountries');
  const counts = new Map();
  for (const mosque of db.allMosques()) {
    const code = resolveMosqueCountryCode(mosque);
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 1)
    .map(([code, count]) => ({
      code,
      name: getCountryName(code),
      flag: getCountryByCode(code)?.flag || '🏳️',
      count
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
}

function getCountryArchiveDetails(countryCode) {
  const code = normalizeCountryCode(countryCode);
  const moderator = getModeratorForCountry(code);
  const mosques = db.allMosques()
    .filter(m => resolveMosqueCountryCode(m) === code)
    .map(m => ({
      id: m.id,
      name: m.name || m.id,
      worshippers: countWorshippersForMosque(m.id),
      active: m.active !== false
    }));

  const modName = moderator
    ? `${moderator.firstName || ''} ${moderator.lastName || ''}`.trim() || String(moderator.id)
    : null;

  return {
    code,
    name: getCountryName(code),
    moderatorName: modName,
    moderatorId: moderator ? String(moderator.id) : null,
    mosques,
    totalMosques: mosques.length,
    totalWorshippers: mosques.reduce((s, m) => s + m.worshippers, 0)
  };
}

module.exports = {
  getCurrentMonthKey,
  getCurrentYear,
  compareYears,
  parseMonthKey,
  shiftMonthKey,
  compareMonthKeys,
  formatMonthLabel,
  getMonthlyStats,
  getYearlyStats,
  getRegionsWithData,
  getCountriesInRegion,
  getCountriesRankedByMosques,
  getCountryArchiveDetails,
  countWorshippersForMosque,
  resolveMosqueCountryCode
};

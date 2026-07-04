const db = require('../database');
const { loadDB } = require('../utils/db');
const { resolveMosqueId } = require('../handlers/recitationVolunteers');

const PRAYER_ICONS = ['🌙', '🌅', '☀️', '🌤️', '🌇', '🌃'];
const PRAYER_NAMES = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const SALAH_PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function timeToMinutes(hhmm) {
  const parts = (hhmm || '').trim().split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function getLocalTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getNextPrayer(mosque) {
  const t = mosque?.prayerTimes;
  if (!t?.fajr) return null;

  const schedule = PRAYER_KEYS.map((key, i) => ({
    name: PRAYER_NAMES[i],
    icon: PRAYER_ICONS[i],
    minutes: timeToMinutes(t[key]),
    key
  })).filter((p) => p.minutes !== null && p.key !== 'sunrise');

  if (!schedule.length) return null;

  const nowMin = getLocalTimeMinutes();

  for (const prayer of schedule) {
    if (prayer.minutes > nowMin) {
      return {
        name: prayer.name,
        icon: prayer.icon,
        minutesLeft: prayer.minutes - nowMin
      };
    }
  }

  const fajr = schedule[0];
  return {
    name: fajr.name,
    icon: fajr.icon,
    minutesLeft: (24 * 60 - nowMin) + fajr.minutes
  };
}

function resolveUserMosqueId(ctx) {
  const raw = loadDB();
  return resolveMosqueId(String(ctx.from.id), raw) || ctx.user?.mosqueId || null;
}

function getMosqueForCtx(ctx) {
  const mosqueId = resolveUserMosqueId(ctx);
  if (!mosqueId) return null;
  return db.getMosque(mosqueId) || null;
}

function buildNextPrayerLineForCtx(ctx) {
  const mosque = getMosqueForCtx(ctx);
  if (!mosque) return '';
  const next = getNextPrayer(mosque);
  if (!next) return '';
  return `\n🕐 الصلاة القادمة: ${next.icon} ${next.name} بعد ${next.minutesLeft} دقيقة`;
}

module.exports = {
  PRAYER_ICONS,
  PRAYER_NAMES,
  PRAYER_KEYS,
  SALAH_PRAYER_KEYS,
  timeToMinutes,
  getLocalTimeMinutes,
  getNextPrayer,
  resolveUserMosqueId,
  getMosqueForCtx,
  buildNextPrayerLineForCtx
};

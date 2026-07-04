const { loadDB, saveDB } = require('./db');

const OCCASIONS = [
  { month: 9, day: 1, title: '🌙 رمضان مبارك', text: 'بشّرك الله بدخول شهر رمضان المبارك، شهر القرآن والصيام والقيام' },
  { month: 9, day: 21, title: '🌟 العشر الأواخر من رمضان', text: 'دخلت العشر الأواخر، تحرّ ليلة القدر في الأوتار منها' },
  { month: 12, day: 9, title: '🕋 يوم عرفة', text: 'اليوم يوم عرفة، أفضل أيام السنة، أكثر من الدعاء والذكر' },
  { month: 12, day: 10, title: '🎉 عيد الأضحى المبارك', text: 'كل عام وأنتم بخير، عيد أضحى مبارك' },
  { month: 10, day: 1, title: '🎉 عيد الفطر المبارك', text: 'كل عام وأنتم بخير، عيد فطر مبارك' },
  { month: 1, day: 10, title: '🌙 يوم عاشوراء', text: 'اليوم يوم عاشوراء، يُستحب صيامه' }
];

const FRIDAY_REMINDER = {
  title: '🕌 يوم الجمعة مبارك',
  text: 'أكثر من الصلاة على النبي ﷺ، واقرأ سورة الكهف إن تيسّر لك.'
};

const WHITE_DAYS_REMINDER = {
  title: '🌕 الأيام البيض',
  text: 'غداً وبعد غد من الأيام البيض (13-14-15)، يُستحب صيامها كل شهر هجري'
};

function getGregorianDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatGregorianForApi(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function isFridayWeekday(weekdayEn) {
  const normalized = String(weekdayEn || '').toLowerCase().replace(/[''`]/g, "'");
  return normalized.includes('juma');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hijriFromCachedData(cached, gregorianApiDate) {
  const d = cached.data;
  return {
    hijri: {
      day: String(d.day),
      month: { number: d.month, ar: d.monthName || '', en: '' },
      year: String(d.year),
      weekday: { ar: d.weekday || '', en: d.weekdayEn || '' }
    },
    gregorianApiDate
  };
}

async function fetchHijriFromApi(gregorianDate = new Date()) {
  const apiDate = formatGregorianForApi(gregorianDate);
  const url = `https://api.aladhan.com/v1/gToH?date=${apiDate}`;
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Aladhan API HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.code !== 200 || !json.data?.hijri) {
        throw new Error(json.status || 'Aladhan API returned no hijri data');
      }
      return { hijri: json.data.hijri, gregorianApiDate: apiDate };
    } catch (err) {
      lastError = err;
      if (attempt === 0) await sleep(5000);
    }
  }

  const db = loadDB();
  if (db.cachedHijriInfo?.data) {
    return hijriFromCachedData(db.cachedHijriInfo, apiDate);
  }

  throw lastError;
}

async function fetchGregorianFromHijri(day, month, year) {
  const apiDate = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  const url = `https://api.aladhan.com/v1/hToG?date=${apiDate}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Aladhan API HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 200 || !json.data?.gregorian) {
    throw new Error(json.status || 'Aladhan API returned no gregorian data');
  }
  const [dd, mm, yyyy] = json.data.gregorian.date.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function parseHijriFromApi(hijri, gregorianApiDate) {
  return {
    day: parseInt(hijri.day, 10),
    month: parseInt(hijri.month?.number, 10),
    monthName: hijri.month?.ar || hijri.month?.en || '',
    year: parseInt(hijri.year, 10),
    weekday: hijri.weekday?.ar || hijri.weekday?.en || '',
    weekdayEn: hijri.weekday?.en || '',
    hijriFormatted: `${hijri.day} ${hijri.month?.en} ${hijri.year}`,
    gregorianApiDate
  };
}

async function fetchHijriDate(gregorianDate = new Date()) {
  const { hijri, gregorianApiDate } = await fetchHijriFromApi(gregorianDate);
  return parseHijriFromApi(hijri, gregorianApiDate);
}

async function getCurrentHijriInfo(gregorianDate = new Date()) {
  const gregorianDateKey = getGregorianDateString(gregorianDate);
  const db = loadDB();

  if (
    db.cachedHijriInfo?.gregorianDateKey === gregorianDateKey &&
    db.cachedHijriInfo?.data
  ) {
    return db.cachedHijriInfo.data;
  }

  const { hijri } = await fetchHijriFromApi(gregorianDate);
  const parsed = parseHijriFromApi(hijri, formatGregorianForApi(gregorianDate));
  const data = {
    day: parsed.day,
    month: parsed.month,
    monthName: parsed.monthName,
    year: parsed.year,
    weekday: parsed.weekday,
    weekdayEn: parsed.weekdayEn
  };

  db.cachedHijriInfo = { gregorianDateKey, data };
  saveDB(db);

  return data;
}

function getWorshipperIds(db) {
  return Object.values(db.users || {})
    .filter((user) => user.role === 'worshipper')
    .map((user) => String(user.id));
}

async function sendToWorshippers(bot, message) {
  const db = loadDB();
  const userIds = getWorshipperIds(db);
  let sent = 0;
  for (const userId of userIds) {
    try {
      await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      sent += 1;
    } catch (e) {
      // المستخدم ربما أوقف البوت
    }
  }
  return sent;
}

async function checkIslamicDates(bot, options = {}) {
  const today = getGregorianDateString(options.gregorianDate || new Date());
  const db = loadDB();

  const hijri = options.mockHijri || await fetchHijriDate(options.gregorianDate || new Date());
  let occasionsSent = 0;
  let fridaySent = 0;
  let whiteDaysSent = 0;

  if (db.lastIslamicDateNotified !== today) {
    const matches = OCCASIONS.filter(
      (occasion) => occasion.month === hijri.month && occasion.day === hijri.day
    );

    for (const occasion of matches) {
      const message = `${occasion.title}\n\n${occasion.text}`;
      const count = await sendToWorshippers(bot, message);
      occasionsSent += count;
      console.log(`[islamicDates] ${occasion.title} — أُرسل لـ ${count} مصلٍ`);
    }

    db.lastIslamicDateNotified = today;
  }

  const hijriMonthKey = `${hijri.year}-${hijri.month}`;
  if (hijri.day === 13 && db.lastWhiteDaysNotified !== hijriMonthKey) {
    const message = `${WHITE_DAYS_REMINDER.title}\n\n${WHITE_DAYS_REMINDER.text}`;
    whiteDaysSent = await sendToWorshippers(bot, message);
    db.lastWhiteDaysNotified = hijriMonthKey;
    console.log(
      `[islamicDates] ${WHITE_DAYS_REMINDER.title} — أُرسل لـ ${whiteDaysSent} مصلٍ (${hijriMonthKey})`
    );
  }

  if (isFridayWeekday(hijri.weekdayEn) && db.lastFridayNotified !== today) {
    const message = `${FRIDAY_REMINDER.title}\n\n${FRIDAY_REMINDER.text}`;
    fridaySent = await sendToWorshippers(bot, message);
    db.lastFridayNotified = today;
    console.log(`[islamicDates] ${FRIDAY_REMINDER.title} — أُرسل لـ ${fridaySent} مصلٍ`);
  }

  saveDB(db);

  return { today, hijri, occasionsSent, fridaySent, whiteDaysSent };
}

function startIslamicDatesSchedule(bot) {
  console.log('🌙 نظام تذكير الأيام الفاضلة يعمل (فحص كل 6 ساعات)...');

  checkIslamicDates(bot)
    .then((result) => {
      console.log(
        `[islamicDates] فحص أولي — هجري: ${result.hijri.hijriFormatted} | ` +
        `يوم ميلادي: ${result.today}`
      );
    })
    .catch((err) => {
      console.error('[islamicDates] فشل الفحص الأولي:', err.message);
    });

  setInterval(() => {
    checkIslamicDates(bot).catch((err) => {
      console.error('[islamicDates] خطأ:', err.message);
    });
  }, 6 * 60 * 60 * 1000);
}

module.exports = {
  startIslamicDatesSchedule,
  checkIslamicDates,
  fetchHijriDate,
  getCurrentHijriInfo,
  fetchGregorianFromHijri,
  OCCASIONS
};

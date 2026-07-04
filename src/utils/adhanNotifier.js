const fs = require('fs');
const path = require('path');
const db = require('../database');
const {
  PRAYER_KEYS,
  timeToMinutes,
  getLocalTimeMinutes
} = require('../services/prayerTimes');

const PRAYER_NAMES = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء'
};

const ADHAN_FILE = path.join(__dirname, '..', '..', 'assets', 'adhan', 'adhan.mp3');

function getLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isPrayerTimeMatch(prayerTimeStr, nowMin) {
  const prayerMin = timeToMinutes(prayerTimeStr);
  if (prayerMin === null) return false;
  return Math.abs(nowMin - prayerMin) <= 1;
}

async function checkAdhanTimes(bot) {
  if (!fs.existsSync(ADHAN_FILE)) {
    console.warn('[adhanNotifier] ملف الأذان غير موجود:', ADHAN_FILE);
    return;
  }

  const today = getLocalDateString();
  const nowMin = getLocalTimeMinutes();
  const mosques = db.getAllMosques();

  for (const mosque of Object.values(mosques)) {
    if (!mosque?.prayerTimes) continue;
    if (mosque.active === false) continue;

    for (const key of PRAYER_KEYS) {
      if (key === 'sunrise') continue;
      const prayerTimeStr = mosque.prayerTimes[key];
      if (!prayerTimeStr) continue;
      if (mosque.lastAdhanSent?.[key] === today) continue;
      if (!isPrayerTimeMatch(prayerTimeStr, nowMin)) continue;

      const worshippers = db.allUsers().filter((u) =>
        String(u.mosqueId) === String(mosque.id) && u.adhanNotifications === true
      );

      let sent = 0;
      for (const w of worshippers) {
        try {
          await bot.telegram.sendVoice(
            String(w.id),
            { source: fs.createReadStream(ADHAN_FILE) },
            {
              caption: `🕐 حان الآن وقت صلاة ${PRAYER_NAMES[key]} 🕌\n${mosque.name}`
            }
          );
          sent += 1;
        } catch (e) {
          // المستخدم ربما أوقف البوت
        }
      }

      const lastAdhanSent = { ...(mosque.lastAdhanSent || {}), [key]: today };
      db.saveMosque(mosque.id, { lastAdhanSent });
      console.log(`[adhanNotifier] ${PRAYER_NAMES[key]} — ${mosque.name}: أُرسل لـ ${sent} مصلٍ`);
    }
  }
}

function startAdhanNotifierSchedule(bot) {
  console.log('🔔 نظام إشعار الأذان يعمل (فحص كل دقيقة)...');
  setInterval(() => {
    checkAdhanTimes(bot).catch((err) => {
      console.error('[adhanNotifier] خطأ:', err.message);
    });
  }, 60 * 1000);
}

module.exports = { startAdhanNotifierSchedule, checkAdhanTimes };

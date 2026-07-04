const db = require('../database');
const { sendIdentityChecks } = require('./identityCheck');
const { updateAllMosquesBadges, checkBadgeSuggestions } = require('./mosqueBadges');

function getDeveloperChatId() {
  const ids = (process.env.DEVELOPER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids[0] || null;
}

async function sendEventReminders(bot) {
  const now = new Date();
  const events = db.get('events') || {};

  for (const event of Object.values(events)) {
    if (!event.date || !event.time) continue;
    if (event.status === 'cancelled') continue;

    const eventDate = new Date(`${event.date}T${event.time}`);
    const diffMs = eventDate - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    // تذكير 24 ساعة (بين 23.5 و 24.5 ساعة)
    const is24h = diffHours >= 23.5 && diffHours < 24.5;
    // تذكير 1 ساعة (بين 0.5 و 1.5 ساعة)
    const is1h = diffHours >= 0.5 && diffHours < 1.5;

    if (!is24h && !is1h) continue;

    const reminderKey = is24h ? '24h' : '1h';
    const sentReminders = event.sentReminders || {};
    if (sentReminders[reminderKey]) continue; // أُرسل مسبقاً

    const attendees = event.attendees || [];
    if (attendees.length === 0) continue;

    const mosque = db.getMosque(event.mosqueId);
    const timeLabel = is24h ? '⏰ غداً' : '🔔 بعد ساعة';
    const msg =
      `${timeLabel} — تذكير بفعالية قريبة!\n\n` +
      `📌 ${event.title}\n` +
      `🕌 ${mosque?.name || 'المسجد'}\n` +
      `📅 ${event.date} — 🕐 ${event.time}\n` +
      (event.description ? `📝 ${event.description.slice(0, 100)}\n` : '');

    let sent = 0;
    for (const userId of attendees) {
      try {
        await bot.telegram.sendMessage(String(userId), msg);
        sent++;
      } catch (e) {
        // المستخدم ربما حجب البوت
      }
    }

    // تسجيل أن التذكير أُرسل
    const events2 = db.get('events') || {};
    if (events2[event.id]) {
      events2[event.id].sentReminders = {
        ...sentReminders,
        [reminderKey]: new Date().toISOString()
      };
      db.set('events', events2);
    }

    console.log(`✅ تذكير ${reminderKey} أُرسل لـ ${sent} مصلٍ — ${event.title}`);
  }
}

async function calculateMosqueHealth(bot) {
  const mosques = db.getAllMosques() || {};

  for (const mosque of Object.values(mosques)) {
    const id = mosque.id;
    let score = 0;

    // 1. فريق إداري (20 نقطة)
    const roles = db.getMosqueRoles(id) || {};
    if (Object.keys(roles || {}).length >= 2) score += 20;
    else if (Object.keys(roles || {}).length >= 1) score += 10;

    // 2. شيخ نشط (20 نقطة)
    const sheikhs = db.get('sheikhs') || {};
    const hasSheikh = Object.values(sheikhs || {}).some(s => s.mosqueId === id);
    if (hasSheikh) score += 20;

    // 3. معالجة الشكاوى (20 نقطة)
    const complaints = db.getMosqueComplaints(id);
    const closedComplaints = complaints.filter(c => c.status === 'closed').length;
    if (complaints.length === 0 || closedComplaints / complaints.length >= 0.7) score += 20;
    else if (closedComplaints / complaints.length >= 0.4) score += 10;

    // 4. فعاليات منتظمة (20 نقطة)
    const events = db.getMosqueEvents(id);
    const recentEvents = events.filter(e => {
      const diff = Date.now() - new Date(e.date).getTime();
      return diff < 30 * 24 * 60 * 60 * 1000; // آخر 30 يوم
    });
    if (recentEvents.length >= 2) score += 20;
    else if (recentEvents.length >= 1) score += 10;

    // 5. بلاغات تُحل (20 نقطة)
    const logistics = db.getMosqueLogistics(id);
    const closedLogistics = logistics.filter(r => r.status === 'closed').length;
    if (logistics.length === 0 || closedLogistics / logistics.length >= 0.7) score += 20;
    else if (closedLogistics / logistics.length >= 0.4) score += 10;

    // حفظ الدرجة
    db.updateMosqueHealth(id, 'score', score);
    db.updateMosqueHealth(id, 'lastCalculated', new Date().toISOString());
  }

  await updateAllMosquesBadges();
  console.log('✅ تم تحديث شارات المساجد تلقائياً');

  const developerChatId = getDeveloperChatId();
  if (developerChatId) {
    await checkBadgeSuggestions(bot, developerChatId);
  }
}

function startReminderScheduler(bot) {
  console.log('⏰ نظام التذكير التلقائي يعمل...');

  setInterval(() => {
    sendEventReminders(bot).catch(err =>
      console.error('❌ خطأ في نظام التذكير:', err.message)
    );
  }, 30 * 60 * 1000);

  setInterval(() => {
    calculateMosqueHealth(bot).catch(err =>
      console.error('❌ خطأ في حساب الصحة:', err.message)
    );
  }, 6 * 60 * 60 * 1000);

  // فحص الهوية كل 24 ساعة
  setInterval(() => {
    sendIdentityChecks(bot).catch(err =>
      console.error('❌ خطأ في فحص الهوية:', err.message)
    );
  }, 24 * 60 * 60 * 1000);

  sendEventReminders(bot).catch(() => {});
  calculateMosqueHealth(bot).catch(() => {});
  sendIdentityChecks(bot).catch(() => {});
}

module.exports = { startReminderScheduler };

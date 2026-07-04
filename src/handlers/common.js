const db = require('../database');
const fs = require('fs');
const {
  PRAYER_ICONS,
  PRAYER_NAMES,
  PRAYER_KEYS,
  getMosqueForCtx
} = require('../services/prayerTimes');
const { renderPrayerTimesCard } = require('../services/prayerCardRenderer');

async function showPrayerTimes(ctx) {
  const mosque = getMosqueForCtx(ctx);

  if (!mosque) {
    return ctx.reply('⚠️ لم يتم ربطك بمسجد بعد.');
  }

  const t = mosque.prayerTimes;
  if (!t || !t.fajr) {
    return ctx.reply('⚠️ لم يتم تحديد مواقيت الصلاة بعد.\nيرجى التواصل مع المسؤول.');
  }

  const waitMsg = await ctx.reply('⏳ جارٍ تجهيز بطاقة المواقيت...');

  try {
    const cardPath = await renderPrayerTimesCard(mosque);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.replyWithPhoto(
      { source: cardPath },
      { caption: `📅 مواقيت الصلاة — ${mosque.name}` }
    );
    fs.unlink(cardPath, () => {});
  } catch (err) {
    console.error('[prayerCard]', err.message);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.reply('⚠️ تعذّر تجهيز بطاقة المواقيت، حاول لاحقاً.');
  }
}

async function showAnnouncements(ctx) {
  const list = db.getAnnouncements(5);

  if (!list.length) {
    return ctx.reply('📢 لا توجد إعلانات حالياً.');
  }

  let msg = `📢 *آخر الإعلانات (${list.length}):*\n\n`;
  list.forEach((a, i) => {
    const date = new Date(a.at).toLocaleDateString('ar-EG');
    msg += `${i + 1}. ${a.text}\n📅 _${date}_\n\n`;
  });

  await ctx.reply(msg.trim(), { parse_mode: 'Markdown' });
}

async function showLessons(ctx) {
  const list = db.getLessons(5);

  if (!list.length) {
    return ctx.reply('📚 لا توجد دروس حالياً.');
  }

  let msg = `📚 *آخر الدروس (${list.length}):*\n\n`;
  list.forEach((l, i) => {
    const date = new Date(l.at).toLocaleDateString('ar-EG');
    msg += `${i + 1}. *${l.title}*\n${l.content}\n👤 _${l.addedByName}_ • 📅 _${date}_\n\n`;
  });

  await ctx.reply(msg.trim(), { parse_mode: 'Markdown' });
}

async function showMosqueInfo(ctx) {
  const mosque = getMosqueForCtx(ctx);

  if (!mosque) {
    return ctx.reply('⚠️ لم يتم ربطك بمسجد بعد.');
  }

  let msg = `🕌 *معلومات المسجد*\n\n📛 *الاسم:* ${mosque.name}\n📍 *الموقع:* ${mosque.location || "غير محدد"}`;

  const t = mosque.prayerTimes;
  if (t?.fajr) {
    const lines = PRAYER_KEYS.map((key, i) =>
      `${PRAYER_ICONS[i]} ${PRAYER_NAMES[i]}: ${t[key] || '—'}`
    ).join('\n');
    msg += `\n\n📅 *مواقيت الصلاة:*\n${lines}`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

module.exports = {
  showPrayerTimes,
  showAnnouncements,
  showLessons,
  showMosqueInfo
};

const registry = require('../core/actionRegistry');

registry.registerMenu('📅 مواقيت الصلاة', showPrayerTimes, 'مواقيت الصلاة');
registry.registerMenu('📢 الإعلانات', showAnnouncements, 'الإعلانات');
registry.registerMenu('📚 الدروس', showLessons, 'الدروس');
registry.registerMenu('🕌 معلومات المسجد', showMosqueInfo, 'معلومات المسجد');

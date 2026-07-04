const { Markup } = require('telegraf');
const { loadDB, saveDB } = require('./db');
const { JOURNEY_DAYS, getDayContent, resolveContentAr } = require('../data/journeyDays');
const db = require('../database');
const { buildPrayerVideoRows, buildWuduVideoRows } = require('../handlers/prayerFiqh');

const JOURNEY_PRAYER_VIDEO_DAYS = new Set([14, 15]);
const JOURNEY_WUDU_VIDEO_DAYS = new Set([9]);

const FEMALE_PRAYER_VIDEO_LABELS = {
  ar: '▶️ شرح صلاة المرأة',
  en: '▶️ Watch How Women Pray',
  de: '▶️ Wie Frauen beten — Video',
  fr: '▶️ Comment prient les femmes',
  tr: '▶️ Kadınların namazı',
  ru: '▶️ Как молятся женщины'
};

function getMaleJourneyExtraNote(completedDay) {
  if (completedDay === 9) {
    return '💡 ملاحظة: أحكام الوضوء للمرأة تختلف قليلاً (الحجاب والمسح). إن كان معك أخت مسلمة جديدة فأعلمها بذلك.';
  }
  if (completedDay === 14 || completedDay === 15) {
    return '💡 ملاحظة: هيئة المرأة في الصلاة تختلف (الضم في الركوع والسجود). إن كان معك أخت فأعلمها بذلك.';
  }
  if (completedDay === 18) {
    return '💡 ملاحظة: المرأة في فترة الحيض أو النفاس لا تصلي، وهذا رحمة من الله.';
  }
  if (completedDay === 21) {
    return '💡 ملاحظة: المرأة في فترة الحيض أو النفاس لا تصوم وتقضي لاحقاً.';
  }
  if (completedDay === 24) {
    return '💡 ملاحظة: أحكام اللباس للمرأة في الإسلام تختلف عن الرجل.';
  }
  return null;
}

async function sendMaleJourneyExtraNote(telegram, chatId, gender, completedDay) {
  if (gender !== 'male') return;
  const note = getMaleJourneyExtraNote(completedDay);
  if (!note) return;
  try {
    await telegram.sendMessage(chatId, note);
  } catch (e) {}
}

function buildJourneyPrayerVideoKeyboard(userLang) {
  const rows = buildPrayerVideoRows(userLang);
  if (!rows.length) return null;
  return Markup.inlineKeyboard(rows);
}

function getJourneyPrayerVideoMessage(userLang) {
  const videoData = db.getPrayerVideosForLang(userLang);
  if (videoData.type === 'single') {
    return '🎥 *شرح مرئي لخطوات الصلاة*\n\nاضغط الزر لمشاهدة الشرح بلغتك:';
  }
  return '🎥 *شروحات مرئية لخطوات الصلاة*\n\nاختر المستوى المناسب لك:';
}

async function sendJourneyPrayerVideos(telegram, chatId, completedDay, gender) {
  if (!JOURNEY_PRAYER_VIDEO_DAYS.has(completedDay)) return;
  const userLang = db.getUser(chatId)?.uiLang || 'ar';

  if (gender === 'female') {
    const videoData = db.getPrayerFemaleVideoForLang(userLang);
    if (!videoData.url) return;
    const label = FEMALE_PRAYER_VIDEO_LABELS[userLang] || FEMALE_PRAYER_VIDEO_LABELS.en;
    const text = '🎥 *شرح مرئي لخطوات الصلاة*\n\nاضغطي الزر لمشاهدة الشرح:';
    try {
      await telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: label, url: videoData.url }]]
        }
      });
    } catch (e) {}
    return;
  }

  const keyboard = buildJourneyPrayerVideoKeyboard(userLang);
  if (!keyboard) return;
  const text = getJourneyPrayerVideoMessage(userLang);
  try {
    await telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
  } catch (e) {}
}

function buildJourneyWuduVideoKeyboard(userLang) {
  const rows = buildWuduVideoRows(userLang);
  if (!rows.length) return null;
  return Markup.inlineKeyboard(rows);
}

function getJourneyWuduVideoMessage(userLang) {
  const videoData = db.getWuduVideosForLang(userLang);
  if (videoData.type === 'single') {
    return '🎥 *شرح مرئي للوضوء*\n\nاضغط الزر لمشاهدة الشرح بلغتك:';
  }
  return '🎥 *شروحات مرئية للوضوء*\n\nاختر المستوى المناسب لك:';
}

async function sendJourneyWuduVideos(telegram, chatId, completedDay, gender) {
  if (!JOURNEY_WUDU_VIDEO_DAYS.has(completedDay)) return;
  const isFemale = gender === 'female';
  const text = isFemale
    ? '📿 يمكنكِ مراجعة خطوات الوضوء بالتفصيل:'
    : '📿 يمكنك مراجعة خطوات الوضوء بالتفصيل:';
  try {
    await telegram.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [[
          { text: '📿 افتح فقه الصلاة', callback_data: 'fiqh_menu_start' }
        ]]
      }
    });
  } catch (e) {}
}

function estimateUtcOffsetFromLongitude(lng) {
  if (typeof lng !== 'number') return 0;
  return Math.round(lng / 15);
}

function getLocalHour(utcOffsetHours) {
  const now = new Date();
  const utcHour = now.getUTCHours();
  let localHour = (utcHour + utcOffsetHours) % 24;
  if (localHour < 0) localHour += 24;
  return localHour;
}

async function sendDailyJourneyReminders(bot) {
  const db = loadDB();
  const newMuslims = db.new_muslims || {};
  const TARGET_LOCAL_HOUR = 16;

  for (const [newMuslimId, record] of Object.entries(newMuslims)) {
    if (record.journeyStatus !== 'active') continue;
    if (!record.companionId) continue;
    if (record.currentDay >= 40) continue;

    const mosque = db.mosques?.[record.mosqueId];
    const lng = mosque?.coordinates?.lng;
    const utcOffset = estimateUtcOffsetFromLongitude(lng);
    const localHour = getLocalHour(utcOffset);
    if (localHour !== TARGET_LOCAL_HOUR) continue;

    const today = new Date().toISOString().slice(0, 10);
    if (record.lastReminderDate === today) continue;

    const nextDayNumber = record.currentDay + 1;
    const dayData = getDayContent(nextDayNumber);
    if (!dayData) continue;

    record.lastReminderDate = today;
    record.pendingDay = nextDayNumber;
    saveDB(db);

    const guidanceText = dayData.guidance?.ar || '';
    try {
      await bot.telegram.sendMessage(
        record.companionId,
        `🌙 *اليوم ${nextDayNumber} من رحلة ${record.name}*\n\n` +
        `📖 *${dayData.title}*\n\n` +
        `${guidanceText}\n\n` +
        `🔔 _تذكير: دورك تربوي وتنظيمي فقط — أي سؤال فقهي دقيق حوّله للمساعد الديني أو الشيخ، لا تُفتِ بنفسك_`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ تم اليوم', callback_data: `journey_done_${newMuslimId}` },
                { text: '⏭️ تخطي', callback_data: `journey_skip_${newMuslimId}` }
              ],
              [
                { text: '🔄 نقل المسؤولية', callback_data: `journey_transfer_${newMuslimId}` },
                { text: '🕊️ سؤال فقهي', callback_data: `journey_ask_${newMuslimId}` }
              ]
            ]
          }
        }
      );
    } catch (e) {}
  }
}

async function handleJourneyDayDone(ctx, newMuslimId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const record = db.new_muslims?.[newMuslimId];
  if (!record) {
    await ctx.answerCbQuery('❌ لم يُعثر على السجل', { show_alert: true });
    return;
  }
  const completedDay = record.pendingDay || (record.currentDay + 1);
  record.currentDay = completedDay;
  record.daysCompleted = record.daysCompleted || [];
  record.daysCompleted.push({ day: completedDay, completedAt: new Date().toISOString() });
  delete record.pendingDay;
  if (completedDay >= 40) {
    record.journeyStatus = 'completed';
  }
  saveDB(db);
  await ctx.reply(
    `✅ *تم تسجيل إكمال اليوم ${completedDay}*\n\n` +
    (completedDay >= 40
      ? `🎉 ما شاء الله، اكتملت رحلة ${record.name} الأربعين يوماً بالكامل!`
      : `جزاك الله خيراً على متابعتك المستمرة 🌟`),
    { parse_mode: 'Markdown' }
  );
  const dayData = getDayContent(completedDay);
  const newMuslimContent = resolveContentAr(dayData?.content?.ar, record.gender, newMuslimId);
  if (newMuslimContent) {
    try {
      await ctx.telegram.sendMessage(
        newMuslimId,
        `🌱 *${dayData.title}*\n\n${newMuslimContent}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
    await sendMaleJourneyExtraNote(ctx.telegram, newMuslimId, record.gender, completedDay);
    await sendJourneyPrayerVideos(ctx.telegram, newMuslimId, completedDay, record.gender);
    await sendJourneyWuduVideos(ctx.telegram, newMuslimId, completedDay, record.gender);
  }
  if (completedDay === 16) {
    try {
      await ctx.telegram.sendMessage(
        newMuslimId,
        '🎓 *حان وقت حفظ سورة الفاتحة*\n\n' +
        'الفاتحة هي أهم سورة في صلاتك، ولوحة الحفظ ستساعدك بتكرار كل آية حتى تثبت في ذهنك.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🎓 ابدأ حفظ الفاتحة', callback_data: 'quran_hafiz_repeat_1_1' }
            ]]
          }
        }
      );
    } catch (e) {}
  }
}

async function handleJourneyDaySkip(ctx, newMuslimId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const record = db.new_muslims?.[newMuslimId];
  if (!record) {
    await ctx.answerCbQuery('❌ لم يُعثر على السجل', { show_alert: true });
    return;
  }
  delete record.pendingDay;
  record.lastReminderDate = null;
  saveDB(db);
  await ctx.reply(
    '⏭️ *تم تأجيل اليوم*\n\nسيُعاد تذكيرك به في الموعد التالي، لا بأس بالمرونة 🌿',
    { parse_mode: 'Markdown' }
  );
}

async function handleJourneyAskFiqh(ctx, newMuslimId) {
  await ctx.answerCbQuery();
  const { handleMuslimStart } = require('../handlers/ai');
  await handleMuslimStart(ctx);
}

async function handleJourneyTransferStart(ctx, newMuslimId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const record = db.new_muslims?.[newMuslimId];
  if (!record) {
    await ctx.answerCbQuery('❌ لم يُعثر على السجل', { show_alert: true });
    return;
  }
  const currentCompanionId = record.companionId;
  const volunteers = db.volunteers || {};
  const candidates = Object.values(volunteers).filter(v =>
    v.active &&
    v.types?.includes('new_muslim_companion') &&
    String(v.userId) !== String(currentCompanionId) &&
    (db.users?.[v.userId]?.mosqueId === record.mosqueId) &&
    (v.currentAssignments || 0) < (v.maxAssignments || 2)
  ).sort((a, b) => (a.currentAssignments || 0) - (b.currentAssignments || 0));
  if (candidates.length === 0) {
    await ctx.reply(
      '😔 *لا يوجد مرافق آخر متاح حالياً*\n\n' +
      'تواصل مع إدارة المسجد مباشرة لإيجاد حل بديل.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  const buttons = candidates.slice(0, 8).map(c => [
    { text: `${c.name || 'بدون اسم'} (${c.currentAssignments || 0} حالات)`, callback_data: `journey_transfer_pick_${newMuslimId}_${c.userId}` }
  ]);
  await ctx.reply(
    '🔄 *اختر مرافقاً جديداً*\n\n' +
    'سيُنقل السياق الكامل (اليوم الحالي وتاريخ التقدّم) للمرافق الجديد:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    }
  );
}

async function handleJourneyTransferPick(ctx, newMuslimId, newCompanionId) {
  await ctx.answerCbQuery();
  const db = loadDB();
  const record = db.new_muslims?.[newMuslimId];
  if (!record) {
    await ctx.answerCbQuery('❌ لم يُعثر على السجل', { show_alert: true });
    return;
  }
  const oldCompanionId = record.companionId;
  if (db.volunteers?.[oldCompanionId]) {
    db.volunteers[oldCompanionId].currentAssignments = Math.max(0, (db.volunteers[oldCompanionId].currentAssignments || 1) - 1);
  }
  if (db.volunteers?.[newCompanionId]) {
    db.volunteers[newCompanionId].currentAssignments = (db.volunteers[newCompanionId].currentAssignments || 0) + 1;
  }
  record.companionId = newCompanionId;
  record.companionHistory = record.companionHistory || [];
  record.companionHistory.push({
    companionId: newCompanionId,
    assignedAt: new Date().toISOString(),
    transferredFrom: oldCompanionId
  });
  delete record.pendingDay;
  record.lastReminderDate = null;
  saveDB(db);
  await ctx.reply(
    '✅ *تم نقل المسؤولية بنجاح*\n\n' +
    `جزاك الله خيراً على متابعتك، وسيستكمل المرافق الجديد رحلة ${record.name} من اليوم ${record.currentDay}.`,
    { parse_mode: 'Markdown' }
  );
  try {
    await ctx.telegram.sendMessage(
      newCompanionId,
      `🤝 *تم تعيينك مرافقاً جديداً!*\n\n` +
      `🌱 المسلم الجديد: ${record.name}\n` +
      `📅 اليوم الحالي: ${record.currentDay} من 40\n\n` +
      `_ستستمر معه من حيث توقف المرافق السابق_\n` +
      `_تذكير: دورك تربوي وتنظيمي فقط — أي سؤال فقهي دقيق حوّله للمساعد الديني أو الشيخ_`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  } catch (e) {}
}

function startJourneyReminderSchedule(bot) {
  setInterval(() => {
    sendDailyJourneyReminders(bot).catch(() => {});
  }, 60 * 60 * 1000);
}

module.exports = { startJourneyReminderSchedule, sendDailyJourneyReminders, estimateUtcOffsetFromLongitude, handleJourneyDayDone, handleJourneyDaySkip, handleJourneyAskFiqh, handleJourneyTransferStart, handleJourneyTransferPick, sendJourneyPrayerVideos, sendJourneyWuduVideos, sendMaleJourneyExtraNote, getMaleJourneyExtraNote };

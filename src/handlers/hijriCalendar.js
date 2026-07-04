const { getCurrentHijriInfo, OCCASIONS } = require('../utils/islamicDatesNotifier');

const HIJRI_MONTH_AVG = 29.53;
const HIJRI_YEAR_DAYS = 354;

function getWhiteDaysStatus(day) {
  if (day < 13) {
    return `قادمة بعد ${13 - day} يوم`;
  }
  if (day <= 15) {
    return 'جارية الآن 🌕';
  }
  return 'انتهت هذا الشهر، تعود الشهر القادم';
}

function findNextOccasion(info) {
  for (const occasion of OCCASIONS) {
    if (occasion.month === info.month && occasion.day === info.day) {
      return { isToday: true, title: occasion.title, text: occasion.text };
    }
  }

  let best = null;
  let bestDays = Infinity;

  for (const occasion of OCCASIONS) {
    let diff = (occasion.month - info.month) * HIJRI_MONTH_AVG + (occasion.day - info.day);
    if (diff < 0) {
      diff += HIJRI_YEAR_DAYS;
    }
    const days = Math.round(diff);
    if (days > 0 && days < bestDays) {
      bestDays = days;
      best = { isToday: false, title: occasion.title, days };
    }
  }

  return best;
}

async function handleHijriCalendar(ctx) {
  let info;
  try {
    info = await getCurrentHijriInfo();
  } catch (err) {
    console.error('[hijriCalendar]', err.message);
    await ctx.reply('⚠️ تعذّر جلب التقويم الهجري حالياً، حاول لاحقاً.');
    return;
  }

  const whiteDaysStatus = getWhiteDaysStatus(info.day);
  let message =
    `📅 *التقويم الهجري*\n\n` +
    `اليوم: ${info.day} ${info.monthName} ${info.year}هـ (${info.weekday})\n\n` +
    `🌕 الأيام البيض هذا الشهر: ${whiteDaysStatus}`;

  try {
    const nextOccasion = findNextOccasion(info);
    if (nextOccasion?.isToday) {
      message += `\n\n🎉 اليوم ${nextOccasion.title}! ${nextOccasion.text}`;
    } else if (nextOccasion) {
      message += `\n\n⏳ أقرب مناسبة: ${nextOccasion.title} (بعد ${nextOccasion.days} يوم تقريباً)`;
    }
  } catch (err) {
    console.error('[hijriCalendar] findNextOccasion:', err.message);
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

module.exports = { handleHijriCalendar };

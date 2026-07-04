const { Markup } = require('telegraf');
const db = require('../database');
const registry = require('../core/actionRegistry');
const { BASE_BUTTONS } = require('../keyboards');
const {
  getCurrentMonthKey,
  getCurrentYear,
  shiftMonthKey,
  compareMonthKeys,
  compareYears,
  getMonthlyStats,
  getYearlyStats,
  parseMonthKey,
  getRegionsWithData,
  getCountriesInRegion,
  getCountriesRankedByMosques,
  getCountryArchiveDetails
} = require('../services/hierarchicalStatsService');
const { renderMonthlyStatsCharts, renderYearlyStatsCharts } = require('../services/statsChartRenderer');
const { renderCountryArchiveReport } = require('../services/regionalArchiveRenderer');
const { getRegionName, getRegionIdForCountry } = require('../data/geoRegions');

async function ensureDeveloper(ctx) {
  if (!ctx.from || !db.isDeveloper(ctx.from.id)) {
    await ctx.reply('⛔ للمطوّر فقط.');
    return false;
  }
  return true;
}

function buildMonthlyStatsText(stats) {
  return (
    `📊 *إحصائيات النظام*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📅 *${stats.label}*\n\n` +
    `🕌 *مساجد جديدة:* ${stats.totalMosques}\n` +
    `🪪 *مشرفون جدد:* ${stats.totalModerators}`
  );
}

function buildYearlyStatsText(stats) {
  const monthLines = stats.monthLabels.map((name, i) =>
    `• ${name}: 🕌 ${stats.mosquesMonthly[i]} | 🪪 ${stats.moderatorsMonthly[i]}`
  ).join('\n');

  return (
    `📊 *إحصائيات النظام — عرض سنوي*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📅 *${stats.label}*\n\n` +
    `🕌 *مساجد جديدة:* ${stats.totalMosques}\n` +
    `🪪 *مشرفون جدد:* ${stats.totalModerators}\n\n` +
    `*تفصيل شهري:*\n${monthLines}`
  );
}

function buildMainMenuUsageReport() {
  const usage = db.getMainMenuUsage();
  const total = Object.values(usage).reduce((s, n) => s + n, 0);
  const rows = BASE_BUTTONS.flat()
    .map(button => ({ button, count: usage[button] || 0 }))
    .sort((a, b) => b.count - a.count);
  return { rows, total };
}

function buildMonthNavKeyboard(monthKey) {
  const { year } = parseMonthKey(monthKey);
  const current = getCurrentMonthKey();
  const nav = [Markup.button.callback('⬅️ الشهر السابق', `hstats_p_${monthKey}`)];
  if (compareMonthKeys(monthKey, current) < 0) {
    nav.push(Markup.button.callback('التالي ➡️', `hstats_n_${monthKey}`));
  }
  nav.push(Markup.button.callback('📅 عرض سنوي', `hstats_ty_${year}`));
  return Markup.inlineKeyboard([nav]);
}

function buildYearNavKeyboard(year) {
  const current = getCurrentYear();
  const nav = [Markup.button.callback('⬅️ السنة السابقة', `hstats_yp_${year}`)];
  if (compareYears(year, current) < 0) {
    nav.push(Markup.button.callback('التالية ➡️', `hstats_yn_${year}`));
  }
  const monthKey = year === current ? getCurrentMonthKey() : `${year}-12`;
  nav.push(Markup.button.callback('📆 عرض شهري', `hstats_tm_${monthKey}`));
  return Markup.inlineKeyboard([nav]);
}

function buildMosqueChartCaption(stats, yearly = false) {
  if (yearly) {
    return (
      `📈 *المساجد الجديدة هذه السنة*\n` +
      `📅 ${stats.label}\n\n` +
      `🕌 *الإجمالي السنوي:* ${stats.totalMosques} مسجد`
    );
  }
  return (
    `📈 *المساجد الجديدة هذا الشهر*\n` +
    `📅 ${stats.label}\n\n` +
    `🕌 *الإجمالي الشهري:* ${stats.totalMosques} مسجد`
  );
}

function buildModeratorChartCaption(stats, yearly = false) {
  if (yearly) {
    return (
      `📈 *المشرفون الجدد هذه السنة*\n` +
      `📅 ${stats.label}\n\n` +
      `🪪 *الإجمالي السنوي:* ${stats.totalModerators} مشرف`
    );
  }
  return (
    `📈 *المشرفون الجدد هذا الشهر*\n` +
    `📅 ${stats.label}\n\n` +
    `🪪 *الإجمالي الشهري:* ${stats.totalModerators} مشرف`
  );
}

async function sendMonthlyStats(ctx, monthKey) {
  const stats = getMonthlyStats(monthKey);
  const keyboard = buildMonthNavKeyboard(monthKey);

  await ctx.reply(buildMonthlyStatsText(stats), { parse_mode: 'Markdown', ...keyboard });

  let charts;
  try {
    charts = await renderMonthlyStatsCharts(stats);
  } catch (err) {
    console.error('[hierarchicalStats] chart error:', err.message);
    return ctx.reply(`⚠️ تعذّر إنشاء الرسوم البيانية: ${err.message}`);
  }

  await ctx.replyWithPhoto(
    { source: charts.mosques.pngPath },
    { caption: buildMosqueChartCaption(stats), parse_mode: 'Markdown' }
  );
  await ctx.replyWithPhoto(
    { source: charts.moderators.pngPath },
    { caption: buildModeratorChartCaption(stats), parse_mode: 'Markdown' }
  );
}

async function sendYearlyStats(ctx, year) {
  const stats = getYearlyStats(year);
  const keyboard = buildYearNavKeyboard(year);

  await ctx.reply(buildYearlyStatsText(stats), { parse_mode: 'Markdown', ...keyboard });

  let charts;
  try {
    charts = await renderYearlyStatsCharts(stats);
  } catch (err) {
    console.error('[hierarchicalStats] yearly chart error:', err.message);
    return ctx.reply(`⚠️ تعذّر إنشاء الرسوم السنوية: ${err.message}`);
  }

  await ctx.replyWithPhoto(
    { source: charts.mosques.pngPath },
    { caption: buildMosqueChartCaption(stats, true), parse_mode: 'Markdown' }
  );
  await ctx.replyWithPhoto(
    { source: charts.moderators.pngPath },
    { caption: buildModeratorChartCaption(stats, true), parse_mode: 'Markdown' }
  );
}

async function showSystemStats(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  await sendMonthlyStats(ctx, getCurrentMonthKey());
}

async function showTopCountries(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  const ranked = getCountriesRankedByMosques();
  if (!ranked.length) {
    return ctx.reply('🌍 لا توجد دول بمساجد مسجّلة بعد.');
  }
  const lines = ranked.map((c, i) =>
    `${i + 1}. ${c.flag} ${c.name} — ${c.count} مسجد`
  ).join('\n');
  await ctx.reply(
    `🌍 *الدول الأكثر مساجد*\n━━━━━━━━━━━━━━━━━━\n${lines}`,
    { parse_mode: 'Markdown' }
  );
}

async function showMainMenuUsageStats(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  const { rows, total } = buildMainMenuUsageReport();
  if (!total) {
    return ctx.reply('📊 لا توجد ضغطات مسجّلة على القائمة الرئيسية بعد.');
  }
  const lines = rows.map((r, i) => {
    const pct = ((r.count / total) * 100).toFixed(1);
    return `${i + 1}. ${r.button} — ${r.count} (${pct}%)`;
  }).join('\n');
  await ctx.reply(
    `📊 *إحصائيات الأزرار الرئيسية*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `إجمالي الضغطات: *${total}*\n\n` +
    lines,
    { parse_mode: 'Markdown' }
  );
}

async function handleStatsPrev(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  await sendMonthlyStats(ctx, shiftMonthKey(ctx.match[1], -1));
}

async function handleStatsNext(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const nextKey = shiftMonthKey(ctx.match[1], 1);
  if (compareMonthKeys(nextKey, getCurrentMonthKey()) > 0) {
    return ctx.answerCbQuery('⛔ لا يمكن التنقل لشهر مستقبلي', { show_alert: true });
  }
  await sendMonthlyStats(ctx, nextKey);
}

async function handleToYearly(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  await sendYearlyStats(ctx, Number(ctx.match[1]));
}

async function handleToMonthly(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  await sendMonthlyStats(ctx, ctx.match[1]);
}

async function handleYearPrev(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  await sendYearlyStats(ctx, Number(ctx.match[1]) - 1);
}

async function handleYearNext(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const nextYear = Number(ctx.match[1]) + 1;
  if (compareYears(nextYear, getCurrentYear()) > 0) {
    return ctx.answerCbQuery('⛔ لا يمكن التنقل لسنة مستقبلية', { show_alert: true });
  }
  await sendYearlyStats(ctx, nextYear);
}

async function showRegionalArchive(ctx) {
  if (!await ensureDeveloper(ctx)) return;
  const regions = getRegionsWithData();
  if (!regions.length) {
    return ctx.reply('🗂️ لا توجد بيانات إقليمية بعد (لا مساجد ولا مشرفون مسجّلون).');
  }

  const rows = regions.map(r => [
    Markup.button.callback(`${r.name} (${r.countryCount})`, `harch_r_${r.id}`)
  ]);

  await ctx.reply(
    `🗂️ *الأرشيف الإقليمي*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `اختر منطقة جغرافية:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
}

async function showRegionCountries(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const regionId = ctx.match[1];
  const countries = getCountriesInRegion(regionId);
  if (!countries.length) {
    return ctx.reply('⚠️ لا توجد دول في هذه المنطقة.');
  }

  const rows = countries.map(c => [
    Markup.button.callback(
      `${c.name} (${c.mosqueCount}🕌)`,
      `harch_c_${c.code}`
    )
  ]);
  rows.push([Markup.button.callback('🔙 المناطق', 'harch_back')]);

  await ctx.reply(
    `🗂️ *${getRegionName(regionId)}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `الدول التي فيها مشرف أو مسجد:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
}

async function showCountryDetails(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  const countryCode = ctx.match[1];
  const regionId = getRegionIdForCountry(countryCode);
  const details = getCountryArchiveDetails(countryCode);

  try {
    const report = await renderCountryArchiveReport(regionId, countryCode);
    await ctx.replyWithPhoto(
      { source: report.pngPath },
      {
        caption:
          `🗂️ *${details.name}* — ${report.regionName}\n` +
          `🕌 ${details.totalMosques} مساجد | 👥 ${details.totalWorshippers} مصلّ`,
        parse_mode: 'Markdown'
      }
    );
    await ctx.replyWithDocument(
      { source: report.pdfPath, filename: `archive_${details.code}.pdf` },
      { caption: '📄 تقرير الأرشيف الإقليمي (PDF)' }
    );
  } catch (err) {
    console.error('[hierarchicalStats] archive report error:', err.message);
    return ctx.reply(`⚠️ تعذّر إنشاء التقرير: ${err.message}`);
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔙 الدول', `harch_r_${regionId}`)],
    [Markup.button.callback('🔙 المناطق', 'harch_back')]
  ]);
  await ctx.reply('↩️ للعودة:', keyboard);
}

async function handleArchiveBack(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!await ensureDeveloper(ctx)) return;
  await showRegionalArchive(ctx);
}

registry.registerMenu('📊 إحصائيات النظام', showSystemStats, 'إحصائيات النظام الهرمي');
registry.registerMenu('🗂️ الأرشيف الإقليمي', showRegionalArchive, 'الأرشيف الإقليمي');
registry.registerMenu('🌍 الدول الأكثر مساجد', showTopCountries, 'الدول الأكثر مساجد');
registry.registerMenu('📊 إحصائيات الأزرار الرئيسية', showMainMenuUsageStats, 'إحصائيات الأزرار الرئيسية');

registry.registerAction(/^hstats_p_(.+)$/, handleStatsPrev, 'شهر سابق — إحصائيات');
registry.registerAction(/^hstats_n_(.+)$/, handleStatsNext, 'شهر تالي — إحصائيات');
registry.registerAction(/^hstats_ty_(\d+)$/, handleToYearly, 'عرض سنوي');
registry.registerAction(/^hstats_tm_(.+)$/, handleToMonthly, 'عرض شهري');
registry.registerAction(/^hstats_yp_(\d+)$/, handleYearPrev, 'سنة سابقة');
registry.registerAction(/^hstats_yn_(\d+)$/, handleYearNext, 'سنة تالية');
registry.registerAction(/^harch_r_(.+)$/, showRegionCountries, 'دول المنطقة');
registry.registerAction(/^harch_c_(.+)$/, showCountryDetails, 'تفاصيل بلد');
registry.registerAction('harch_back', handleArchiveBack, 'رجوع للمناطق');

module.exports = {
  showSystemStats,
  showRegionalArchive,
  showTopCountries,
  showMainMenuUsageStats,
  sendMonthlyStats,
  sendYearlyStats,
  buildMonthlyStatsText,
  buildYearlyStatsText,
  buildMainMenuUsageReport,
  getMonthlyStats,
  getYearlyStats
};

const { Markup } = require('telegraf');
const db = require('../database');
const registry = require('../core/actionRegistry');
const { ROLES } = require('../keyboards');
const { normalizeCountryCode } = require('../data/muslimCountries');
const {
  JOURNEY_VIDEO_TOPICS,
  JOURNEY_VIDEO_LANGS,
  PRAYER_VIDEO_LEVELS,
  WUDU_VIDEO_LEVELS
} = require('../data/journeyVideoTopics');
const { VOLUNTEER_LANGUAGES } = require('./volunteers');

const ADMIN_VIDEO_TOPICS = ['wudu', 'prayer'];
const VIDEO_LANG_PAGE_SIZE = 8;

function getVideoEntryFromData(dbData, topic, lang) {
  const raw = dbData?.journeyVideos?.[topic]?.[lang];
  if (!raw) return null;
  if (typeof raw === 'string') return { url: raw, approved: true };
  if (typeof raw === 'object' && raw.url) return raw;
  return null;
}

function isApprovedAdminVideo(entry) {
  return !!(entry?.url && entry.approved);
}

function isSupportedJourneyVideoLang(lang) {
  return Object.prototype.hasOwnProperty.call(VOLUNTEER_LANGUAGES, lang);
}

function getMissingVideosForAdmin(langCode, dbData) {
  const lang = normalizeCountryCode(langCode || '');
  if (!lang || !isSupportedJourneyVideoLang(lang)) return [];

  const missing = [];
  for (const topic of ADMIN_VIDEO_TOPICS) {
    const entry = getVideoEntryFromData(dbData, topic, lang);
    if (!isApprovedAdminVideo(entry)) missing.push(topic);
  }
  return missing;
}

function formatMissingVideoTopicLabels(missingTopics) {
  return missingTopics
    .map((topicId) => JOURNEY_VIDEO_TOPICS[topicId]?.label || topicId)
    .join('، ');
}

function buildMissingVideosPanelNotice(missingTopics) {
  if (!missingTopics?.length) return '';
  const list = formatMissingVideoTopicLabels(missingTopics);
  return (
    `⚠️ *فيديوهات التعليم ناقصة لبلدك*\n` +
    `الموضوعات الناقصة: ${list}\n` +
    `هذه الفيديوهات تُرسَل للمسلمين الجدد في رحلتهم بلغة بلدك.\n` +
    `اضغط 🎬 إدارة فيديوهات التعليم لإضافتها\n\n`
  );
}

async function sendMissingVideosModeratorWelcomeNotice(telegram, userId, langCode, dbData) {
  const missing = getMissingVideosForAdmin(langCode, dbData);
  if (!missing.length) return;
  const list = formatMissingVideoTopicLabels(missing);
  try {
    await telegram.sendMessage(
      userId,
      `⚠️ *فيديوهات التعليم ناقصة لبلدك*\n\n` +
      `الموضوعات الناقصة: ${list}\n\n` +
      `هذه الفيديوهات تُرسَل للمسلمين الجدد في رحلتهم بلغة بلدك.\n` +
      `اضغط 🎬 إدارة فيديوهات التعليم لإضافتها`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🎬 أضف فيديوهات بلدك الآن', callback_data: 'moderator_videos_manage' }
          ]]
        }
      }
    );
  } catch (e) {}
}

function isLeveledVideoTopic(topicId) {
  return topicId === 'prayer' || topicId === 'wudu';
}

function getTopicKeys(topicId) {
  if (topicId === 'prayer') return PRAYER_VIDEO_LEVELS;
  if (topicId === 'wudu') return WUDU_VIDEO_LEVELS;
  return JOURNEY_VIDEO_LANGS;
}

function isValidVideoKey(topicId, key) {
  if (topicId === 'prayer') {
    return !!PRAYER_VIDEO_LEVELS[key] || !!JOURNEY_VIDEO_LANGS[key];
  }
  if (topicId === 'wudu') {
    return !!WUDU_VIDEO_LEVELS[key] || !!JOURNEY_VIDEO_LANGS[key];
  }
  return !!JOURNEY_VIDEO_LANGS[key];
}

function resolveModeratorLangCode(ctx) {
  const user = db.getUser(ctx.from?.id);
  const code = normalizeCountryCode(user?.moderatorCountry || user?.countryCode || '');
  if (code && JOURNEY_VIDEO_LANGS[code]) return code;
  return null;
}

function canManageVideos(ctx) {
  if (db.isDeveloper(ctx.from?.id)) return true;
  const role = ctx.user?.role || db.getUser(ctx.from?.id)?.role;
  return role === 'moderator' || role === 'MODERATOR';
}

async function ensureVideoManager(ctx) {
  if (!canManageVideos(ctx)) {
    await ctx.reply('⛔ هذه الميزة للمشرفين الإقليميين فقط');
    return false;
  }
  return true;
}

function topicStatusLine(topicId) {
  if (topicId === 'prayer') {
    const levelPart = Object.keys(PRAYER_VIDEO_LEVELS)
      .map((code) => {
        const entry = db.getJourneyVideoEntry(topicId, code);
        const icon = entry?.url ? (entry.approved ? '✅' : '⏳') : '❌';
        return `${code}: ${icon}`;
      })
      .join(' | ');
    const langPart = Object.keys(JOURNEY_VIDEO_LANGS)
      .map((code) => {
        const entry = db.getJourneyVideoEntry(topicId, code);
        if (!entry?.url) return null;
        const icon = entry.approved ? '✅' : '⏳';
        return `${code}: ${icon}`;
      })
      .filter(Boolean)
      .join(' | ');
    return [levelPart, langPart].filter(Boolean).join('\n   ');
  }
  const keys = getTopicKeys(topicId);
  return Object.keys(keys || {})
    .map((code) => {
      const entry = db.getJourneyVideoEntry(topicId, code);
      const icon = entry?.url ? (entry.approved ? '✅' : '⏳') : '❌';
      return `${code}: ${icon}`;
    })
    .join(' | ');
}

function buildTopicsStatusText(db) {
  let text = '🎥 إدارة فيديوهات التعليم\n\n';
  for (const [topicId, meta] of Object.entries(JOURNEY_VIDEO_TOPICS)) {
    const keys = Object.keys(
      isLeveledVideoTopic(topicId)
        ? { ...getTopicKeys(topicId), ...JOURNEY_VIDEO_LANGS }
        : JOURNEY_VIDEO_LANGS
    );
    const total = keys.length;
    const filled = keys.filter(code => db.getJourneyVideoEntry(topicId, code)?.url).length;
    const approved = keys.filter(code => {
      const e = db.getJourneyVideoEntry(topicId, code);
      return e?.url && e?.approved;
    }).length;
    const pending = filled - approved;
    text += `${meta.emoji} ${meta.label}\n`;
    text += `✅ معتمد: ${approved} | ⏳ بانتظار مراجعة: ${pending} | ❌ ناقص: ${total - filled}\n\n`;
  }
  return text.trim();
}

async function showAdminVideosMenu(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  if (!await ensureVideoManager(ctx)) return;

  const rows = Object.entries(JOURNEY_VIDEO_TOPICS).map(([topicId, meta]) => [
    Markup.button.callback(
      `➕ إضافة/تعديل — ${meta.emoji} ${meta.label}`,
      `journey_video_edit_${topicId}`
    )
  ]);
  rows.push([Markup.button.callback('🔙 رجوع', 'admin_videos_back')]);

  const opts = { ...Markup.inlineKeyboard(rows) };
  const text = buildTopicsStatusText(db);
  if (ctx.callbackQuery?.message) {
    return ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts));
  }
  return ctx.reply(text, opts);
}

function buildPaginatedVideoLangRows({
  entries,
  page,
  pageCallbackPrefix,
  pickCallbackPrefix,
  getEntry,
  suggestedCode = null
}) {
  const langs = Object.entries(entries || {});
  const start = page * VIDEO_LANG_PAGE_SIZE;
  const end = start + VIDEO_LANG_PAGE_SIZE;
  const pageLangs = langs.slice(start, end);
  const totalPages = Math.ceil(langs.length / VIDEO_LANG_PAGE_SIZE) || 1;
  const rows = [];

  for (let i = 0; i < pageLangs.length; i += 2) {
    const row = [];
    for (const idx of [i, i + 1]) {
      if (!pageLangs[idx]) continue;
      const [code, label] = pageLangs[idx];
      const entry = getEntry(code);
      const status = entry?.url ? (entry.approved ? '✅' : '⏳') : '❌';
      const suggestedMark = suggestedCode && code === suggestedCode ? ' 📍' : '';
      row.push(Markup.button.callback(
        `${status} ${label}${suggestedMark}`,
        pickCallbackPrefix + '_' + code
      ));
    }
    rows.push(row);
  }

  const navRow = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('⬅️ السابق', pageCallbackPrefix + '_' + (page - 1)));
  }
  navRow.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'noop'));
  if (end < langs.length) {
    navRow.push(Markup.button.callback('التالي ➡️', pageCallbackPrefix + '_' + (page + 1)));
  }
  if (navRow.length) rows.push(navRow);

  return { rows, totalPages, page };
}

async function showTopicLangPicker(ctx, topicId, page = 0) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  if (!await ensureVideoManager(ctx)) return;

  const meta = JOURNEY_VIDEO_TOPICS[topicId];
  if (!meta) {
    return ctx.reply('❌ الموضوع غير معروف.');
  }

  const isLeveledTopic = isLeveledVideoTopic(topicId);
  let rows;

  if (isLeveledTopic) {
    const keys = getTopicKeys(topicId);
    rows = Object.entries(keys || {}).map(([code, label]) => {
      const entry = db.getJourneyVideoEntry(topicId, code);
      const status = entry?.url ? (entry.approved ? '✅' : '⏳') : '❌';
      return [
        Markup.button.callback(
          `${status} ${label}`,
          `journey_video_picklang_${topicId}_${code}`
        )
      ];
    });
    rows.unshift([
      Markup.button.callback('🌍 إضافة فيديو بلغة بلدي', `journey_video_${topicId}_local`)
    ]);
  } else {
    const { rows: langRows, totalPages } = buildPaginatedVideoLangRows({
      entries: JOURNEY_VIDEO_LANGS,
      page,
      pageCallbackPrefix: `journey_video_topic_lang_page_${topicId}`,
      pickCallbackPrefix: `journey_video_picklang_${topicId}`,
      getEntry: (code) => db.getJourneyVideoEntry(topicId, code)
    });
    rows = langRows;
    page = Math.min(page, totalPages - 1);
  }

  rows.push([Markup.button.callback('🔙 رجوع', 'admin_videos_menu')]);

  const text =
    `🎥 *${meta.emoji} ${meta.label}*\n\n` +
    (isLeveledTopic
      ? `*المستويات الإنجليزية (افتراضي للجميع):*\nاختر مستوى لإضافة أو تعديل الرابط:\n✅ متوفر | ⏳ بانتظار الاعتماد | ❌ غير متوفر\n\n` +
        `*فيديو بلغة بلدك:*\nاضغط «إضافة فيديو بلغة بلدي» لإضافة رابط واحد بلغتك.`
      : `اختر اللغة لإضافة أو تعديل رابط الفيديو:\n✅ متوفر | ⏳ بانتظار الاعتماد | ❌ غير متوفر\n\n` +
        `صفحة ${page + 1}/${Math.ceil(Object.keys(JOURNEY_VIDEO_LANGS).length / VIDEO_LANG_PAGE_SIZE) || 1}`);

  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(rows)
  }).catch(() => ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }));
}

async function showTopicLocalLangPicker(ctx, topicId, page = 0) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  if (!await ensureVideoManager(ctx)) return;

  const meta = JOURNEY_VIDEO_TOPICS[topicId];
  const suggested = resolveModeratorLangCode(ctx);
  const { rows, totalPages } = buildPaginatedVideoLangRows({
    entries: JOURNEY_VIDEO_LANGS,
    page,
    pageCallbackPrefix: `journey_video_${topicId}_lang_page`,
    pickCallbackPrefix: `journey_video_picklang_${topicId}`,
    getEntry: (code) => db.getJourneyVideoEntry(topicId, code),
    suggestedCode: suggested
  });
  page = Math.min(page, totalPages - 1);
  rows.push([Markup.button.callback('🔙 رجوع', `journey_video_edit_${topicId}`)]);

  const suggestedHint = suggested
    ? `\n\n📍 لغة مسجدك المقترحة: *${JOURNEY_VIDEO_LANGS[suggested]}*`
    : '';

  const text =
    `🌍 *إضافة فيديو ${meta?.label || topicId} بلغة بلدك*\n\n` +
    'اختر اللغة — رابط واحد فقط (بدون مستويات):' +
    suggestedHint +
    `\n\nصفحة ${page + 1}/${totalPages}`;

  return ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(rows)
  }).catch(() => ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }));
}

async function showPrayerLocalLangPicker(ctx, page = 0) {
  return showTopicLocalLangPicker(ctx, 'prayer', page);
}

async function pickLangAndEnterWizard(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  if (!await ensureVideoManager(ctx)) return;

  const [, topicId, langCode] = ctx.match;
  if (!JOURNEY_VIDEO_TOPICS[topicId] || !isValidVideoKey(topicId, langCode)) {
    return ctx.answerCbQuery('❌ خيار غير صالح', { show_alert: true }).catch(() => {});
  }

  ctx.session.journeyVideoTopic = topicId;
  ctx.session.journeyVideoLang = langCode;
  return ctx.scene.enter('journey-video-wizard');
}

async function showDevVideoReview(ctx) {
  if (!ctx.from || !db.isDeveloper(ctx.from.id)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }

  const raw = db.getJourneyVideosRaw();
  const rows = [];
  let text = '🎥 *مراجعة فيديوهات التعليم*\n\n';
  let hasAny = false;

  for (const [topicId, meta] of Object.entries(JOURNEY_VIDEO_TOPICS || {})) {
    if (isLeveledVideoTopic(topicId)) {
      const levelKeys = getTopicKeys(topicId);
      for (const [keyCode, label] of Object.entries(levelKeys || {})) {
        const entry = db.getJourneyVideoEntry(topicId, keyCode);
        if (!entry?.url) continue;
        hasAny = true;
        const statusLabel = entry.approved ? '✅ معتمد' : '⏳ بانتظار الاعتماد';
        text += `${meta.emoji} *${meta.label}* — ${label} (افتراضي) (${statusLabel})\n${entry.url}\n\n`;
        const row = [];
        if (!entry.approved) {
          row.push(Markup.button.callback(
            `✅ اعتمد ${meta.label} (${keyCode})`,
            `journey_video_approve_${topicId}_${keyCode}`
          ));
        }
        row.push(Markup.button.callback(
          `🗑️ احذف ${meta.label} (${keyCode})`,
          `journey_video_delete_${topicId}_${keyCode}`
        ));
        rows.push(row);
      }
      for (const [keyCode, label] of Object.entries(JOURNEY_VIDEO_LANGS || {})) {
        const entry = db.getJourneyVideoEntry(topicId, keyCode);
        if (!entry?.url) continue;
        hasAny = true;
        const statusLabel = entry.approved ? '✅ معتمد' : '⏳ بانتظار الاعتماد';
        text += `${meta.emoji} *${meta.label}* — ${label} (${statusLabel})\n${entry.url}\n\n`;
        const row = [];
        if (!entry.approved) {
          row.push(Markup.button.callback(
            `✅ اعتمد ${meta.label} (${keyCode})`,
            `journey_video_approve_${topicId}_${keyCode}`
          ));
        }
        row.push(Markup.button.callback(
          `🗑️ احذف ${meta.label} (${keyCode})`,
          `journey_video_delete_${topicId}_${keyCode}`
        ));
        rows.push(row);
      }
      continue;
    }
    const keys = getTopicKeys(topicId);
    for (const [keyCode, label] of Object.entries(keys || {})) {
      const entry = db.getJourneyVideoEntry(topicId, keyCode);
      if (!entry?.url) continue;
      hasAny = true;
      const statusLabel = entry.approved ? '✅ معتمد' : '⏳ بانتظار الاعتماد';
      text += `${meta.emoji} *${meta.label}* — ${label} (${statusLabel})\n${entry.url}\n\n`;
      const row = [];
      if (!entry.approved) {
        row.push(Markup.button.callback(
          `✅ اعتمد ${meta.label} (${keyCode})`,
          `journey_video_approve_${topicId}_${keyCode}`
        ));
      }
      row.push(Markup.button.callback(
        `🗑️ احذف ${meta.label} (${keyCode})`,
        `journey_video_delete_${topicId}_${keyCode}`
      ));
      rows.push(row);
    }
  }

  if (!hasAny) {
    return ctx.reply('📭 لا توجد فيديوهات مسجّلة حالياً.');
  }

  rows.push([Markup.button.callback('🔙 رجوع', 'dev_panel')]);
  return ctx.reply(text.trim(), {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(rows)
  });
}

async function approveVideo(ctx) {
  if (!db.isDeveloper(ctx.from?.id)) {
    return ctx.answerCbQuery('⛔', { show_alert: true }).catch(() => {});
  }
  const [, topicId, langCode] = ctx.match;
  const ok = db.approveJourneyVideo(topicId, langCode);
  if (!ok) {
    return ctx.answerCbQuery('❌ لا يوجد فيديو لهذه اللغة', { show_alert: true }).catch(() => {});
  }
  await ctx.answerCbQuery('✅ تم الاعتماد — الفيديو أصبح مرئياً للمستخدمين').catch(() => {});
  return showDevVideoReview(ctx);
}

async function deleteVideo(ctx) {
  if (!db.isDeveloper(ctx.from?.id)) {
    return ctx.answerCbQuery('⛔', { show_alert: true }).catch(() => {});
  }
  const [, topicId, langCode] = ctx.match;
  db.setJourneyVideo(topicId, langCode, null);
  await ctx.answerCbQuery('🗑️ تم حذف الرابط').catch(() => {});
  return showDevVideoReview(ctx);
}

async function showModeratorVideosMenu(ctx) {
  ctx.session.videosBackTo = 'moderator_panel';
  return showAdminVideosMenu(ctx);
}

async function showAdminVideosMenuFromMosqueAdmin(ctx) {
  ctx.session.videosBackTo = 'mosque_admin_panel';
  return showAdminVideosMenu(ctx);
}

async function adminVideosBack(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session?.videosBackTo === 'moderator_panel') {
    delete ctx.session.videosBackTo;
    const { moderatorPanel } = require('./moderator');
    return moderatorPanel(ctx);
  }
  if (ctx.session?.videosBackTo === 'mosque_admin_panel') {
    delete ctx.session.videosBackTo;
    const mosqueAdmin = require('./mosque_admin');
    return mosqueAdmin.mosqueAdminPanel(ctx);
  }
  const role = ctx.user?.role;
  if (role === ROLES.SHEIKH) {
    const { sheikhPanel } = require('./sheikh_new');
    return sheikhPanel(ctx);
  }
  if ([ROLES.ADMIN, ROLES.DEVELOPER].includes(role)) {
    const { adminPanel } = require('./admin');
    return adminPanel(ctx);
  }
  return ctx.reply('🔙');
}

registry.registerAction('admin_videos_menu', showAdminVideosMenu, 'إدارة فيديوهات التعليم');
registry.registerAction('admin_videos_manage', showAdminVideosMenu, 'إدارة فيديوهات التعليم — تنبيه الأدمن');
registry.registerAction('moderator_videos_manage', showModeratorVideosMenu, 'إدارة فيديوهات التعليم — مشرف إقليمي');
registry.registerAction('admin_videos_menu_ma', showAdminVideosMenuFromMosqueAdmin, 'إدارة فيديوهات التعليم — مدير مسجد');
registry.registerAction('admin_videos_back', adminVideosBack, 'رجوع من إدارة الفيديوهات');
registry.registerAction('journey_video_prayer_local', (ctx) => showTopicLocalLangPicker(ctx, 'prayer'), 'اختيار لغة فيديو صلاة محلي');
registry.registerAction('journey_video_wudu_local', (ctx) => showTopicLocalLangPicker(ctx, 'wudu'), 'اختيار لغة فيديو وضوء محلي');
registry.registerAction(/^journey_video_topic_lang_page_(.+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showTopicLangPicker(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
}, 'صفحة لغات فيديو موضوع');
registry.registerAction(/^journey_video_(wudu|prayer)_lang_page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showTopicLocalLangPicker(ctx, ctx.match[1], parseInt(ctx.match[2], 10));
}, 'صفحة لغات فيديو موضوع محلي');
registry.registerAction(/^journey_video_edit_(.+)$/, (ctx) => showTopicLangPicker(ctx, ctx.match[1]), 'اختيار لغة فيديو');
registry.registerAction(/^journey_video_picklang_(.+)_(.+)$/, pickLangAndEnterWizard, 'بدء إدخال رابط فيديو');
registry.registerAction(/^journey_video_approve_(.+)_(.+)$/, approveVideo, 'اعتماد فيديو تعليمي');
registry.registerAction(/^journey_video_delete_(.+)_(.+)$/, deleteVideo, 'حذف فيديو تعليمي');

registry.registerMenu('🎥 مراجعة فيديوهات التعليم', showDevVideoReview, 'مراجعة فيديوهات التعليم — مطوّر');

module.exports = {
  showAdminVideosMenu,
  showDevVideoReview,
  getMissingVideosForAdmin,
  buildMissingVideosPanelNotice,
  sendMissingVideosModeratorWelcomeNotice,
  getVideoEntryFromData,
  isApprovedAdminVideo
};

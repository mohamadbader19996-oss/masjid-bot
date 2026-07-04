const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const { loadDB } = require('../utils/db');
const { normalizeCountryCode } = require('../data/muslimCountries');
const { VOLUNTEER_LANGUAGES } = require('./volunteers');
const { canActAsRegionalModerator } = require('../services/moderatorService');
const { getVideoEntryFromData, isApprovedAdminVideo } = require('./journeyVideos');
const {
  handleModContentConfirm,
  handleModContentCancel
} = require('../scenes/moderatorAddContentScene');

const CONTENT_DEFS = [
  { key: 'wudu_video', label: 'فيديو الوضوء', emoji: '🎬', topic: 'wudu', addOnlyIfMissing: true },
  { key: 'prayer_video', label: 'فيديو الصلاة', emoji: '🎬', topic: 'prayer', addOnlyIfMissing: true },
  { key: 'debate', label: 'مناظرات دعوية', emoji: '📺', addOnlyIfMissing: false },
  { key: 'story', label: 'قصص اعتناق الإسلام', emoji: '💚', addOnlyIfMissing: false }
];

const ADD_CALLBACKS = {
  wudu_video: 'mod_add_wudu_video',
  prayer_video: 'mod_add_prayer_video',
  debate: 'mod_add_debate',
  story: 'mod_add_story'
};

function resolveModeratorLang(moderatorId, dbData, langOverride) {
  if (langOverride) return normalizeCountryCode(langOverride);
  const user = dbData?.users?.[String(moderatorId)] || db.getUser(moderatorId);
  return normalizeCountryCode(user?.moderatorCountry || user?.countryCode || '');
}

function isJourneyVideoComplete(dbData, topic, lang) {
  const entry = getVideoEntryFromData(dbData, topic, lang);
  return isApprovedAdminVideo(entry);
}

function hasApprovedRegionalDebates(dbData, lang) {
  const list = dbData.debates?.regional?.[lang] || [];
  return list.some((e) => e.approved);
}

function hasApprovedRegionalStories(dbData, lang) {
  const list = dbData.conversionStoriesRegional?.[lang] || [];
  return list.some((e) => e.approved);
}

function isContentItemComplete(def, dbData, lang) {
  if (def.key === 'wudu_video') return isJourneyVideoComplete(dbData, 'wudu', lang);
  if (def.key === 'prayer_video') return isJourneyVideoComplete(dbData, 'prayer', lang);
  if (def.key === 'debate') return hasApprovedRegionalDebates(dbData, lang);
  if (def.key === 'story') return hasApprovedRegionalStories(dbData, lang);
  return false;
}

function getMissingContentForModerator(moderatorId, dbData, options = {}) {
  const lang = resolveModeratorLang(moderatorId, dbData, options.langOverride);
  if (!lang) {
    return { lang: null, items: [], missing: [], allComplete: true };
  }

  const items = CONTENT_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    emoji: def.emoji,
    complete: isContentItemComplete(def, dbData, lang)
  }));

  const missing = items.filter((item) => !item.complete);
  return {
    lang,
    langLabel: VOLUNTEER_LANGUAGES[lang] || lang,
    items,
    missing,
    allComplete: missing.length === 0
  };
}

function buildContentStatusNotice(status) {
  if (!status?.lang || !status.items?.length) return '';
  const lines = status.items.map(
    (item) => `${item.complete ? '✅' : '❌'} ${item.label}`
  );
  return (
    `📋 *محتوى بلدك (${status.langLabel || status.lang}):*\n` +
    `${lines.join('\n')}\n\n`
  );
}

function buildMissingOnlyList(status) {
  if (!status?.missing?.length) {
    return '✅ كل المحتوى مكتمل حالياً!';
  }
  return status.missing.map((item) => `❌ ${item.label}`).join('\n');
}

async function sendModeratorWelcomeContentNotice(telegram, userId, langCode, dbData) {
  const status = getMissingContentForModerator(userId, dbData, { langOverride: langCode });
  const missingList = buildMissingOnlyList(status);
  const text =
    `🌍 *مرحباً بك مشرفاً إقليمياً!*\n\n` +
    `*مهامك الأساسية:*\n` +
    `✅ مراجعة واعتماد طلبات المساجد في بلدك\n` +
    `✅ إضافة محتوى تعليمي ودعوي بلغة بلدك\n\n` +
    `*محتوى بلدك الناقص حالياً:*\n` +
    `${missingList}`;

  try {
    await telegram.sendMessage(userId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '📋 ابدأ إضافة المحتوى الآن', callback_data: 'moderator_add_content' }
        ]]
      }
    });
  } catch (e) {}
}

async function handleModeratorAddContent(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!canActAsRegionalModerator(ctx.from.id)) {
    return ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
  }

  const status = getMissingContentForModerator(ctx.from.id, loadDB());
  const rows = [];

  for (const def of CONTENT_DEFS) {
    const item = status.items.find((i) => i.key === def.key);
    const isMissing = item && !item.complete;
    if (def.addOnlyIfMissing && !isMissing) continue;
    rows.push([
      Markup.button.callback(
        `${def.emoji} ${def.label}`,
        ADD_CALLBACKS[def.key]
      )
    ]);
  }

  rows.push([Markup.button.callback('🔙 رجوع للوحة المشرف', 'moderator_panel')]);

  const text = '📋 *إضافة محتوى لبلدك — اختر النوع:*';
  if (ctx.callbackQuery?.message) {
    return ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(rows)
    }).catch(() => ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }));
  }
  return ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
}

async function startAddContentWizard(ctx, contentType) {
  await ctx.answerCbQuery().catch(() => {});
  if (!canActAsRegionalModerator(ctx.from.id)) {
    return ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
  }

  const status = getMissingContentForModerator(ctx.from.id, loadDB());
  const def = CONTENT_DEFS.find((d) => d.key === contentType);
  if (def?.addOnlyIfMissing) {
    const item = status.items.find((i) => i.key === contentType);
    if (item?.complete) {
      return ctx.answerCbQuery('✅ هذا المحتوى مكتمل بالفعل', { show_alert: true }).catch(() => {});
    }
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.modAddContentType = contentType;
  return ctx.scene.enter('moderator-add-content');
}

registry.registerAction('moderator_add_content', handleModeratorAddContent, 'قائمة إضافة محتوى المشرف');
registry.registerAction('mod_add_wudu_video', (ctx) => startAddContentWizard(ctx, 'wudu_video'), 'إضافة فيديو وضوء');
registry.registerAction('mod_add_prayer_video', (ctx) => startAddContentWizard(ctx, 'prayer_video'), 'إضافة فيديو صلاة');
registry.registerAction('mod_add_debate', (ctx) => startAddContentWizard(ctx, 'debate'), 'إضافة مناظرة دعوية');
registry.registerAction('mod_add_story', (ctx) => startAddContentWizard(ctx, 'story'), 'إضافة قصة اعتناق');
registry.registerAction('mod_content_confirm', handleModContentConfirm, 'تأكيد إضافة محتوى المشرف');
registry.registerAction('mod_content_cancel', handleModContentCancel, 'إلغاء إضافة محتوى المشرف');

module.exports = {
  CONTENT_DEFS,
  getMissingContentForModerator,
  buildContentStatusNotice,
  buildMissingOnlyList,
  sendModeratorWelcomeContentNotice,
  handleModeratorAddContent,
  startAddContentWizard
};

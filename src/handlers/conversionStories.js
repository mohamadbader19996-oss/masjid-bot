const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const sendOrEdit = require('../utils/sendOrEdit');
const { askGemini } = require('../services/gemini');
const { getUiLangDisplayName } = require('../i18n/languagePickerOptions');
const { loadDB, saveDB } = require('../utils/db');
const {
  getWrittenStories,
  getStoryById,
  getStoryIndex,
  getVideosForLang,
  LANG_LABELS
} = require('../data/conversionStories');
const { VOLUNTEER_LANGUAGES } = require('./volunteers');
const { canActAsRegionalModerator } = require('../services/moderatorService');
const {
  handleStoriesAddVideoConfirm,
  handleStoriesAddVideoCancel
} = require('../scenes/storiesAddVideoScene');

const WRITTEN_PAGE_SIZE = 4;
const VIDEO_PAGE_SIZE = 5;

function truncateLabel(text, max = 58) {
  const s = String(text || '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function getUserUiLang(ctx) {
  const user = db.getUser(ctx.from.id);
  const lang = user?.uiLang || ctx.session?.uiLang || 'ar';
  return lang === 'ar' || !lang ? 'ar' : lang;
}

function storiesMenuBackRow() {
  return [Markup.button.callback('🔙 رجوع للقسم الدعوي', 'dawah_menu')];
}

async function ensureStoryTranslation(story, lang) {
  if (lang === 'ar') return story.story;
  const dbData = loadDB();
  if (!dbData.conversionStoriesTranslations) dbData.conversionStoriesTranslations = {};
  if (!dbData.conversionStoriesTranslations[story.id]) {
    dbData.conversionStoriesTranslations[story.id] = {};
  }
  if (dbData.conversionStoriesTranslations[story.id][lang]) {
    return dbData.conversionStoriesTranslations[story.id][lang];
  }

  const langName = getUiLangDisplayName(lang);
  const prompt =
    `Translate this Arabic Islamic conversion story to ${langName}. ` +
    'Keep the warm narrative style. Return only the translated text, no commentary.\n\n' +
    story.story;
  const { text } = await askGemini(
    prompt,
    'You translate Islamic narratives accurately. Return only translated text, no markdown.'
  );
  const translated = String(text || '').trim();
  dbData.conversionStoriesTranslations[story.id][lang] = translated;
  saveDB(dbData);
  console.log(`[conversionStories] cached translation for ${story.id} lang=${lang}`);
  return translated;
}

function getApprovedRegionalVideos(langCode) {
  const regional = loadDB().conversionStoriesRegional || {};
  return (regional[langCode] || []).filter((v) => v.approved);
}

function getAllVideosForLang(langCode) {
  const builtIn = getVideosForLang(langCode);
  const regional = getApprovedRegionalVideos(langCode);
  return [...builtIn, ...regional.map((v) => ({ id: v.id, title: v.title, url: v.url }))];
}

function getAvailableVideoLangs() {
  const langs = new Set(['en', 'de']);
  const regional = loadDB().conversionStoriesRegional || {};
  for (const [langCode, items] of Object.entries(regional)) {
    if ((items || []).some((v) => v.approved)) langs.add(langCode);
  }
  return Array.from(langs);
}

function getPendingRegionalStoryVideos() {
  const regional = loadDB().conversionStoriesRegional || {};
  const pending = [];
  for (const [langCode, items] of Object.entries(regional)) {
    for (const entry of items || []) {
      if (!entry.approved) pending.push({ langCode, entry });
    }
  }
  return pending;
}

async function handleConversionStoriesMenu(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const text = '💚 *قصص اعتناق الإسلام*\n\nاختر ما تريد:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard([
    [Markup.button.callback('📝 قصص مكتوبة', 'stories_written_1')],
    [Markup.button.callback('🎬 فيديوهات', 'stories_videos_list')],
    storiesMenuBackRow()
  ]));
}

async function handleStoriesWritten(ctx, page) {
  await ctx.answerCbQuery().catch(() => {});
  const stories = getWrittenStories();
  const totalPages = Math.max(1, Math.ceil(stories.length / WRITTEN_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const slice = stories.slice((safePage - 1) * WRITTEN_PAGE_SIZE, safePage * WRITTEN_PAGE_SIZE);

  const rows = slice.map((s) => [
    Markup.button.callback(s.name, `story_detail_${s.id}`)
  ]);
  const nav = [];
  if (safePage > 1) {
    nav.push(Markup.button.callback('⬅️ السابق', `stories_written_${safePage - 1}`));
  }
  if (safePage < totalPages) {
    nav.push(Markup.button.callback('التالي ➡️', `stories_written_${safePage + 1}`));
  }
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 رجوع', 'stories_menu')]);

  const text =
    `📝 *قصص مكتوبة*\n` +
    `صفحة ${safePage} من ${totalPages}\n\n` +
    'اختر قصة لقراءتها:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleStoryDetail(ctx, storyId) {
  await ctx.answerCbQuery().catch(() => {});
  const story = getStoryById(storyId);
  if (!story) {
    return ctx.answerCbQuery('❌ غير موجود', { show_alert: true }).catch(() => {});
  }

  const lang = getUserUiLang(ctx);
  let body = story.story;
  if (lang !== 'ar') {
    try {
      body = await ensureStoryTranslation(story, lang);
    } catch (e) {
      console.error('[conversionStories] translation failed:', e.message);
    }
  }

  const stories = getWrittenStories();
  const idx = getStoryIndex(storyId);
  const rows = [];
  const nav = [];
  if (idx > 0) {
    nav.push(Markup.button.callback('◀️ السابق', `story_detail_${stories[idx - 1].id}`));
  }
  if (idx >= 0 && idx < stories.length - 1) {
    nav.push(Markup.button.callback('▶️ التالي', `story_detail_${stories[idx + 1].id}`));
  }
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 رجوع', 'stories_written_1')]);

  const text = `💚 *${story.name}*\n\n${body}`;
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleStoriesVideosList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const langs = getAvailableVideoLangs();
  const rows = langs.map((code) => [
    Markup.button.callback(
      LANG_LABELS[code] || `🌍 ${VOLUNTEER_LANGUAGES[code] || code}`,
      `stories_videos_${code}_1`
    )
  ]);
  rows.push([Markup.button.callback('🔙 رجوع', 'stories_menu')]);
  const text = '🎬 *فيديوهات قصص الاعتناق*\n\nاختر اللغة:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleStoriesVideosLang(ctx, lang, page) {
  await ctx.answerCbQuery().catch(() => {});
  const videos = getAllVideosForLang(lang);
  if (!videos.length) {
    const text = `🎬 لا توجد فيديوهات بهذه اللغة حالياً.`;
    return sendOrEdit(ctx, text, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 رجوع', 'stories_videos_list')]
    ]));
  }

  const totalPages = Math.max(1, Math.ceil(videos.length / VIDEO_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const slice = videos.slice((safePage - 1) * VIDEO_PAGE_SIZE, safePage * VIDEO_PAGE_SIZE);

  const rows = slice.map((v) => [
    Markup.button.url(truncateLabel(v.title), v.url)
  ]);
  if (canActAsRegionalModerator(ctx.from.id)) {
    rows.push([Markup.button.callback('➕ أضف فيديو بلغتك', 'stories_add_video_start')]);
  }
  const nav = [];
  if (safePage > 1) {
    nav.push(Markup.button.callback('⬅️ السابق', `stories_videos_${lang}_${safePage - 1}`));
  }
  if (safePage < totalPages) {
    nav.push(Markup.button.callback('التالي ➡️', `stories_videos_${lang}_${safePage + 1}`));
  }
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 رجوع', 'stories_videos_list')]);

  const langLabel = LANG_LABELS[lang] || VOLUNTEER_LANGUAGES[lang] || lang;
  const text =
    `🎬 *فيديوهات ${langLabel}*\n` +
    `صفحة ${safePage} من ${totalPages}\n\n` +
    'اضغط لفتح الفيديو على YouTube:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleStoriesAddVideoStart(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!canActAsRegionalModerator(ctx.from.id)) {
    return ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
  }
  return ctx.scene.enter('stories-add-video');
}

async function showDevStoriesReview(ctx) {
  if (!db.isDeveloper(ctx.from.id)) {
    return ctx.reply('⛔ للمطوّر فقط.');
  }
  const pending = getPendingRegionalStoryVideos();
  if (!pending.length) {
    return ctx.reply('✅ لا توجد فيديوهات قصص اعتناق بانتظار المراجعة.');
  }

  for (const { langCode, entry } of pending) {
    const langLabel = VOLUNTEER_LANGUAGES[langCode] || langCode;
    const text =
      `💚 *فيديو قصة اعتناق للمراجعة*\n\n` +
      `🌍 اللغة: ${langLabel}\n` +
      `📌 العنوان: ${entry.title}\n` +
      `🔗 ${entry.url}\n` +
      `👤 أضافه: ${entry.addedBy}`;
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ اعتمد', `stories_regional_approve_${langCode}_${entry.id}`),
          Markup.button.callback('❌ ارفض', `stories_regional_reject_${langCode}_${entry.id}`)
        ]
      ])
    });
  }
}

async function handleStoriesRegionalApprove(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!db.isDeveloper(ctx.from.id)) return;
  const langCode = ctx.match[1];
  const entryId = ctx.match[2];
  const dbData = loadDB();
  const list = dbData.conversionStoriesRegional?.[langCode] || [];
  const entry = list.find((e) => e.id === entryId);
  if (!entry) return ctx.reply('❌ غير موجود.');
  entry.approved = true;
  saveDB(dbData);
  await ctx.editMessageText(`✅ تم اعتماد: ${entry.title}`).catch(() => {});
  try {
    await ctx.telegram.sendMessage(
      entry.addedBy,
      `✅ تم اعتماد فيديو قصة اعتناقك ونشره:\n*${entry.title}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
}

async function handleStoriesRegionalReject(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!db.isDeveloper(ctx.from.id)) return;
  const langCode = ctx.match[1];
  const entryId = ctx.match[2];
  if (!ctx.session) ctx.session = {};
  ctx.session.awaitingStoriesRejectReason = { langCode, entryId };
  await ctx.reply('✏️ اكتب سبب الرفض ليُرسَل للمشرف:');
}

async function handleStoriesRejectReasonText(ctx, text) {
  const target = ctx.session?.awaitingStoriesRejectReason;
  if (!target) return false;
  delete ctx.session.awaitingStoriesRejectReason;

  const dbData = loadDB();
  const list = dbData.conversionStoriesRegional?.[target.langCode] || [];
  const idx = list.findIndex((e) => e.id === target.entryId);
  if (idx < 0) {
    await ctx.reply('❌ لم يُعثر على الفيديو.');
    return true;
  }
  const [removed] = list.splice(idx, 1);
  if (!list.length) delete dbData.conversionStoriesRegional[target.langCode];
  saveDB(dbData);

  await ctx.reply('❌ تم رفض الفيديو وإبلاغ المشرف.');
  try {
    await ctx.telegram.sendMessage(
      removed.addedBy,
      `❌ تم رفض فيديو قصة اعتناقك *${removed.title}*\n\nالسبب: ${text.trim()}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  return true;
}

registry.registerAction('stories_menu', handleConversionStoriesMenu, 'قائمة قصص الاعتناق');
registry.registerAction(/^stories_written_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1], 10) || 1;
  return handleStoriesWritten(ctx, page);
}, 'قائمة القصص المكتوبة');
registry.registerAction(/^story_detail_(.+)$/, async (ctx) => {
  const storyId = ctx.match[1];
  return handleStoryDetail(ctx, storyId);
}, 'تفاصيل قصة اعتناق');
registry.registerAction('stories_videos_list', handleStoriesVideosList, 'لغات فيديوهات الاعتناق');
registry.registerAction(/^stories_videos_([a-z]{2}(?:_[A-Z]{2})?)_(\d+)$/, async (ctx) => {
  const lang = ctx.match[1];
  const page = parseInt(ctx.match[2], 10) || 1;
  return handleStoriesVideosLang(ctx, lang, page);
}, 'فيديوهات قصص الاعتناق حسب اللغة');
registry.registerAction('stories_add_video_start', handleStoriesAddVideoStart, 'إضافة فيديو قصة إقليمي');
registry.registerAction('stories_add_video_confirm', handleStoriesAddVideoConfirm, 'تأكيد إضافة فيديو قصة');
registry.registerAction('stories_add_video_cancel', handleStoriesAddVideoCancel, 'إلغاء إضافة فيديو قصة');
registry.registerAction(/^stories_regional_approve_(.+)_([^_]+(?:_[^_]+)*)$/, handleStoriesRegionalApprove, 'اعتماد فيديو قصة إقليمي');
registry.registerAction(/^stories_regional_reject_(.+)_([^_]+(?:_[^_]+)*)$/, handleStoriesRegionalReject, 'رفض فيديو قصة إقليمي');
registry.registerMenu('💚 مراجعة قصص الاعتناق', showDevStoriesReview, 'مراجعة فيديوهات قصص الاعتناق — مطوّر');

module.exports = {
  handleConversionStoriesMenu,
  handleStoriesWritten,
  handleStoryDetail,
  handleStoriesVideosList,
  handleStoriesVideosLang,
  handleStoriesRejectReasonText,
  showDevStoriesReview,
  WRITTEN_PAGE_SIZE,
  VIDEO_PAGE_SIZE
};

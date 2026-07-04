const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const { mainKeyboard } = require('../keyboards');
const { loadDB, saveDB } = require('../utils/db');
const { DEVELOPER_NOTIFY_ID } = require('../data/journeyVideoTopics');
const { VOLUNTEER_LANGUAGES } = require('../handlers/volunteers');
const { canActAsRegionalModerator } = require('../services/moderatorService');
const { notifyDeveloperNewVideo } = require('../handlers/journeyVideosHelpers');
const { normalizeCountryCode } = require('../data/muslimCountries');

const TYPE_LABELS = {
  wudu_video: '🎬 فيديو الوضوء',
  prayer_video: '🎬 فيديو الصلاة',
  debate: '📺 مناظرة دعوية',
  story: '💚 قصة اعتناق إسلام'
};

function getModeratorLangCode(userId) {
  const user = db.getUser(userId);
  return normalizeCountryCode(user?.moderatorCountry || user?.countryCode || '');
}

function getModeratorMosqueId(userId) {
  const user = db.getUser(userId);
  return user?.mosqueId || null;
}

async function notifyDeveloperNewDebate(ctx, entry, langCode) {
  const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || String(ctx.from.id);
  const langLabel = VOLUNTEER_LANGUAGES[langCode] || langCode;
  const text = `🎬 أضاف ${name} مناظرة بالـ${langLabel}: ${entry.title} — ${entry.url}`;
  try {
    await ctx.telegram.sendMessage(DEVELOPER_NOTIFY_ID, text);
  } catch (e) {}
}

async function notifyDeveloperNewStory(ctx, entry, langCode) {
  const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || String(ctx.from.id);
  const langLabel = VOLUNTEER_LANGUAGES[langCode] || langCode;
  const text = `💚 أضاف ${name} فيديو قصة اعتناق بالـ${langLabel}: ${entry.title} — ${entry.url}`;
  try {
    await ctx.telegram.sendMessage(DEVELOPER_NOTIFY_ID, text);
  } catch (e) {}
}

function saveRegionalDebate(langCode, entry) {
  const dbData = loadDB();
  if (!dbData.debates) dbData.debates = { regional: {} };
  if (!dbData.debates.regional) dbData.debates.regional = {};
  if (!Array.isArray(dbData.debates.regional[langCode])) {
    dbData.debates.regional[langCode] = [];
  }
  dbData.debates.regional[langCode].push(entry);
  saveDB(dbData);
}

function saveRegionalStoryVideo(langCode, entry) {
  const dbData = loadDB();
  if (!dbData.conversionStoriesRegional) dbData.conversionStoriesRegional = {};
  if (!Array.isArray(dbData.conversionStoriesRegional[langCode])) {
    dbData.conversionStoriesRegional[langCode] = [];
  }
  dbData.conversionStoriesRegional[langCode].push(entry);
  saveDB(dbData);
}

const moderatorAddContentScene = new Scenes.WizardScene(
  'moderator-add-content',
  async (ctx) => {
    if (!canActAsRegionalModerator(ctx.from.id)) {
      await ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
      return ctx.scene.leave();
    }
    const contentType = ctx.session?.modAddContentType;
    const typeLabel = TYPE_LABELS[contentType] || 'محتوى';
    await ctx.reply(`📝 أدخل عنوان *${typeLabel}*:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (await guardWizardInput(ctx)) return ctx.scene.leave();
    const title = ctx.message?.text?.trim();
    if (!title) {
      await ctx.reply('⚠️ أرسل عنواناً نصياً.');
      return;
    }
    ctx.wizard.state.title = title;
    await ctx.reply('🔗 أرسل رابط YouTube:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (await guardWizardInput(ctx)) return ctx.scene.leave();
    const url = ctx.message?.text?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      await ctx.reply('⚠️ أرسل رابطاً صالحاً يبدأ بـ http أو https');
      return;
    }
    ctx.wizard.state.url = url;
    const contentType = ctx.session?.modAddContentType;
    const typeLabel = TYPE_LABELS[contentType] || 'محتوى';
    await ctx.reply(
      `📋 *تأكيد الإرسال*\n\n` +
      `النوع: ${typeLabel}\n` +
      `العنوان: ${ctx.wizard.state.title}\n` +
      `الرابط: ${url}\n\n` +
      `هل تؤكد الإرسال للمراجعة؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ تأكيد وإرسال', 'mod_content_confirm')],
          [Markup.button.callback('❌ إلغاء', 'mod_content_cancel')]
        ])
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    return;
  }
);

async function handleModContentConfirm(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current !== 'moderator-add-content') return;
  const state = ctx.wizard.state;
  const contentType = ctx.session?.modAddContentType;
  if (!state?.title || !state?.url || !contentType) {
    await ctx.reply('❌ بيانات ناقصة. ابدأ من جديد.');
    return ctx.scene.leave();
  }

  const langCode = getModeratorLangCode(ctx.from.id);
  const userId = String(ctx.from.id);

  if (contentType === 'wudu_video') {
    db.setJourneyVideo('wudu', langCode, state.url, { approved: false });
    await notifyDeveloperNewVideo(ctx, 'wudu', langCode, state.url);
  } else if (contentType === 'prayer_video') {
    db.setJourneyVideo('prayer', langCode, state.url, { approved: false });
    await notifyDeveloperNewVideo(ctx, 'prayer', langCode, state.url);
  } else if (contentType === 'debate') {
    const entry = {
      id: `deb_${Date.now()}`,
      title: state.title,
      url: state.url,
      type: 'human',
      approved: false,
      addedBy: userId,
      mosqueId: getModeratorMosqueId(ctx.from.id),
      addedAt: new Date().toISOString()
    };
    saveRegionalDebate(langCode, entry);
    await notifyDeveloperNewDebate(ctx, entry, langCode);
  } else if (contentType === 'story') {
    const entry = {
      id: `csv_reg_${Date.now()}`,
      title: state.title,
      url: state.url,
      approved: false,
      addedBy: userId,
      mosqueId: getModeratorMosqueId(ctx.from.id),
      addedAt: new Date().toISOString()
    };
    saveRegionalStoryVideo(langCode, entry);
    await notifyDeveloperNewStory(ctx, entry, langCode);
  }

  delete ctx.session.modAddContentType;
  await ctx.reply(
    '✅ تم إرسال المحتوى للمراجعة. سيُخطرك المطوّر عند الاعتماد أو الرفض.',
    mainKeyboard(ctx.session?.userRole)
  );
  return ctx.scene.leave();
}

async function handleModContentCancel(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current === 'moderator-add-content') {
    delete ctx.session.modAddContentType;
    await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole));
    return ctx.scene.leave();
  }
}

module.exports = {
  moderatorAddContentScene,
  handleModContentConfirm,
  handleModContentCancel
};

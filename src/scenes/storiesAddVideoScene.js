const { Scenes } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const { mainKeyboard } = require('../keyboards');
const { loadDB, saveDB } = require('../utils/db');
const { DEVELOPER_NOTIFY_ID } = require('../data/journeyVideoTopics');
const { VOLUNTEER_LANGUAGES } = require('../handlers/volunteers');
const { canActAsRegionalModerator } = require('../services/moderatorService');

function getModeratorLangCode(userId) {
  const user = db.getUser(userId);
  return (user?.moderatorCountry || user?.uiLang || 'ar').toLowerCase();
}

function getModeratorMosqueId(userId) {
  const user = db.getUser(userId);
  return user?.mosqueId || null;
}

async function notifyDeveloperNewStoryVideo(ctx, entry, langCode) {
  const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || String(ctx.from.id);
  const langLabel = VOLUNTEER_LANGUAGES[langCode] || langCode;
  const text = `💚 أضاف ${name} فيديو قصة اعتناق بالـ${langLabel}: ${entry.title} — ${entry.url}`;
  try {
    await ctx.telegram.sendMessage(DEVELOPER_NOTIFY_ID, text);
  } catch (e) {}
}

function saveRegionalStoryVideo(userId, langCode, entry) {
  const dbData = loadDB();
  if (!dbData.conversionStoriesRegional) dbData.conversionStoriesRegional = {};
  if (!Array.isArray(dbData.conversionStoriesRegional[langCode])) {
    dbData.conversionStoriesRegional[langCode] = [];
  }
  dbData.conversionStoriesRegional[langCode].push(entry);
  saveDB(dbData);
}

const storiesAddVideoScene = new Scenes.WizardScene(
  'stories-add-video',
  async (ctx) => {
    if (!canActAsRegionalModerator(ctx.from.id)) {
      await ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
      return ctx.scene.leave();
    }
    await ctx.reply('📝 أدخل عنوان الفيديو:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (await guardWizardInput(ctx)) return ctx.scene.leave();
    const title = ctx.message?.text?.trim();
    if (!title) {
      await ctx.reply('⚠️ أرسل عنوان الفيديو نصاً.');
      return;
    }
    ctx.wizard.state.title = title;
    await ctx.reply('🔗 أرسل رابط YouTube للفيديو:');
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
    const { Markup } = require('telegraf');
    await ctx.reply(
      `📋 *تأكيد الإرسال*\n\n` +
      `العنوان: ${ctx.wizard.state.title}\n` +
      `الرابط: ${url}\n\n` +
      `هل تؤكد الإرسال للمراجعة؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ تأكيد وإرسال', 'stories_add_video_confirm')],
          [Markup.button.callback('❌ إلغاء', 'stories_add_video_cancel')]
        ])
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    return;
  }
);

async function handleStoriesAddVideoConfirm(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current !== 'stories-add-video') return;
  const state = ctx.wizard.state;
  if (!state?.title || !state?.url) {
    await ctx.reply('❌ بيانات ناقصة. ابدأ من جديد.');
    return ctx.scene.leave();
  }
  const langCode = getModeratorLangCode(ctx.from.id);
  const entry = {
    id: `csv_reg_${Date.now()}`,
    title: state.title,
    url: state.url,
    approved: false,
    addedBy: String(ctx.from.id),
    mosqueId: getModeratorMosqueId(ctx.from.id),
    addedAt: new Date().toISOString()
  };
  saveRegionalStoryVideo(ctx.from.id, langCode, entry);
  await notifyDeveloperNewStoryVideo(ctx, entry, langCode);
  await ctx.reply(
    '✅ تم إرسال الفيديو للمراجعة. سيُخطرك المطوّر عند الاعتماد أو الرفض.',
    mainKeyboard(ctx.session?.userRole)
  );
  return ctx.scene.leave();
}

async function handleStoriesAddVideoCancel(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current === 'stories-add-video') {
    await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole));
    return ctx.scene.leave();
  }
}

module.exports = {
  storiesAddVideoScene,
  handleStoriesAddVideoConfirm,
  handleStoriesAddVideoCancel
};

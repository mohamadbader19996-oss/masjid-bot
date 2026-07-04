const { Scenes } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const { mainKeyboard } = require('../keyboards');
const {
  JOURNEY_VIDEO_TOPICS,
  JOURNEY_VIDEO_LANGS,
  PRAYER_VIDEO_LEVELS,
  WUDU_VIDEO_LEVELS
} = require('../data/journeyVideoTopics');
const { notifyDeveloperNewVideo } = require('../handlers/journeyVideosHelpers');
const { getCountryByCode } = require('../data/muslimCountries');

function buildWizardLangLabel(topic, lang) {
  if (topic === 'prayer' && PRAYER_VIDEO_LEVELS[lang]) {
    return PRAYER_VIDEO_LEVELS[lang];
  }
  if (topic === 'wudu' && WUDU_VIDEO_LEVELS[lang]) {
    return WUDU_VIDEO_LEVELS[lang];
  }
  const country = getCountryByCode(lang);
  const flag = country?.flag || '🌐';
  const langName = JOURNEY_VIDEO_LANGS[lang] || lang;
  return `${flag} ${langName}`;
}

const journeyVideoWizardScene = new Scenes.WizardScene(
  'journey-video-wizard',
  async (ctx) => {
    const topic = ctx.session.journeyVideoTopic;
    const lang = ctx.session.journeyVideoLang;
    if (!topic || !lang) {
      await ctx.reply('❌ انتهت الجلسة. ابدأ من جديد.');
      return ctx.scene.leave();
    }
    const topicMeta = JOURNEY_VIDEO_TOPICS[topic];
    const langLabel = buildWizardLangLabel(topic, lang);
    await ctx.reply(
      `🎬 *إضافة فيديو تعليمي*\n\n` +
        `الموضوع: ${topicMeta?.emoji || '📹'} *${topicMeta?.label || topic}*\n` +
        `اللغة المقترحة: *${langLabel}*\n\n` +
        `📌 *ما نحتاجه:*\n` +
        `- فيديو يشرح الموضوع بشكل صحيح وواضح\n` +
        `- المدة المثالية: 3-10 دقائق\n` +
        `- المصدر: رابط YouTube فقط\n` +
        `- يجب أن يكون المحتوى من مصدر إسلامي موثوق\n\n` +
        `⚠️ سيراجع المطوّر الرابط قبل ظهوره للمستخدمين\n\n` +
        `أرسل لي رابط الفيديو:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (await guardWizardInput(ctx)) return ctx.scene.leave();

    const url = ctx.message?.text?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      await ctx.reply('⚠️ أرسل رابطاً صالحاً يبدأ بـ http أو https');
      return;
    }

    const topic = ctx.session.journeyVideoTopic;
    const lang = ctx.session.journeyVideoLang;
    const approved = db.isDeveloper(ctx.from.id);
    db.setJourneyVideo(topic, lang, url, { approved });
    if (!approved) {
      await notifyDeveloperNewVideo(ctx, topic, lang, url);
    }

    delete ctx.session.journeyVideoTopic;
    delete ctx.session.journeyVideoLang;

    await ctx.reply('✅ تم حفظ رابط الفيديو.', mainKeyboard(ctx.session?.userRole));
    return ctx.scene.leave();
  }
);

module.exports = { journeyVideoWizardScene };

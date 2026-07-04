const { Scenes, Markup } = require('telegraf');
const db = require('../database');
const { guardWizardInput } = require('./sceneGuards');
const { mainKeyboard } = require('../keyboards');
const { loadDB, saveDB } = require('../utils/db');
const { DEVELOPER_NOTIFY_ID } = require('../data/journeyVideoTopics');
const { VOLUNTEER_LANGUAGES } = require('../handlers/volunteers');
const { canActAsRegionalModerator } = require('../services/moderatorService');

const DEBATE_ADD_WARNING =
  '⚠️ تنبيه: يُرفض أي محتوى يحتوي معلومات دينية خاطئة أو يحرّض على كراهية أي دين أو أشخاص. كل رابط يراجعه المطوّر قبل النشر.';

const DEBATE_TYPE_LABELS = {
  ai: '🤖 مناظرة ذكاء اصطناعي',
  human: '👥 مناظرة بشرية',
  lecture: '📢 محاضرة'
};

function getModeratorLangCode(userId) {
  const user = db.getUser(userId);
  return (user?.moderatorCountry || user?.uiLang || 'ar').toLowerCase();
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

function saveRegionalDebate(userId, langCode, entry) {
  const dbData = loadDB();
  if (!dbData.debates) dbData.debates = { regional: {} };
  if (!dbData.debates.regional) dbData.debates.regional = {};
  if (!Array.isArray(dbData.debates.regional[langCode])) {
    dbData.debates.regional[langCode] = [];
  }
  dbData.debates.regional[langCode].push(entry);
  saveDB(dbData);
}

const debateAddRegionalScene = new Scenes.WizardScene(
  'debate-add-regional',
  async (ctx) => {
    if (!canActAsRegionalModerator(ctx.from.id)) {
      await ctx.reply('⛔ للمشرفين الإقليميين والمطوّر فقط.');
      return ctx.scene.leave();
    }
    await ctx.reply(
      `🎬 *إضافة مناظرة بلغتي*\n\n${DEBATE_ADD_WARNING}\n\nاختر نوع المحتوى:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🤖 مناظرة AI', 'debate_add_type_ai')],
          [Markup.button.callback('👥 مناظرة بشرية', 'debate_add_type_human')],
          [Markup.button.callback('📢 محاضرة', 'debate_add_type_lecture')],
          [Markup.button.callback('❌ إلغاء', 'debate_add_cancel')]
        ])
      }
    );
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
    const typeLabel = DEBATE_TYPE_LABELS[ctx.wizard.state.type] || ctx.wizard.state.type;
    await ctx.reply(
      `📋 *تأكيد الإرسال*\n\n` +
      `النوع: ${typeLabel}\n` +
      `العنوان: ${ctx.wizard.state.title}\n` +
      `الرابط: ${url}\n\n` +
      `هل تؤكد الإرسال للمراجعة؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ تأكيد وإرسال', 'debate_add_confirm')],
          [Markup.button.callback('❌ إلغاء', 'debate_add_cancel')]
        ])
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    return;
  }
);

async function handleDebateAddType(ctx, type) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current !== 'debate-add-regional') return;
  ctx.wizard.state.type = type;
  await ctx.reply('📝 أدخل عنوان الفيديو:');
  return ctx.wizard.selectStep(1);
}

async function handleDebateAddConfirm(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current !== 'debate-add-regional') return;
  const state = ctx.wizard.state;
  if (!state?.type || !state?.title || !state?.url) {
    await ctx.reply('❌ بيانات ناقصة. ابدأ من جديد.');
    return ctx.scene.leave();
  }
  const langCode = getModeratorLangCode(ctx.from.id);
  const entry = {
    id: `deb_${Date.now()}`,
    title: state.title,
    url: state.url,
    type: state.type,
    approved: false,
    addedBy: String(ctx.from.id),
    mosqueId: getModeratorMosqueId(ctx.from.id),
    addedAt: new Date().toISOString()
  };
  saveRegionalDebate(ctx.from.id, langCode, entry);
  await notifyDeveloperNewDebate(ctx, entry, langCode);
  await ctx.reply(
    '✅ تم إرسال المناظرة للمراجعة. سيُخطرك المطوّر عند الاعتماد أو الرفض.',
    mainKeyboard(ctx.session?.userRole)
  );
  return ctx.scene.leave();
}

async function handleDebateAddCancel(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.scene?.current === 'debate-add-regional') {
    await ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.session?.userRole));
    return ctx.scene.leave();
  }
}

module.exports = {
  debateAddRegionalScene,
  handleDebateAddType,
  handleDebateAddConfirm,
  handleDebateAddCancel,
  DEBATE_ADD_WARNING
};

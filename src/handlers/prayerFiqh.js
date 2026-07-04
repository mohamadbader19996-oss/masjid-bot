const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const { PRAYER_FIQH_SECTIONS } = require('../data/prayerFiqh');
const { SECTION_TO_VIDEO_TOPIC } = require('../data/journeyVideoTopics');
const sendOrEdit = require('../utils/sendOrEdit');
const { loadDB } = require('../utils/db');

function getUserGender(userId) {
  const dbData = loadDB();
  return dbData.new_muslims?.[userId]?.gender || dbData.users?.[userId]?.gender || null;
}

function resolveFiqhGender(ctx) {
  return ctx.session?.fiqhGender || getUserGender(ctx.from?.id) || 'male';
}

function getSectionContent(section, gender) {
  if (gender === 'female' && section.content_female) {
    return section.content_female;
  }
  return section.content;
}

function getSection(id) {
  return PRAYER_FIQH_SECTIONS.find((s) => s.id === id);
}

const VIDEO_BUTTON_LABELS = {
  ar: '▶️ شاهد شرح مرئي',
  en: '▶️ Watch Visual Explanation',
  de: '▶️ Visuelle Erklärung ansehen',
  fr: "▶️ Voir l'explication visuelle",
  tr: '▶️ Görsel açıklamayı izle',
  ru: '▶️ Смотреть визуальное объяснение'
};

const PRAYER_LEVEL_LABELS = {
  ar: { simple: '🟢 شرح مبسط', medium: '🟡 شرح وسط', advanced: '🔴 شرح مكثف' },
  en: { simple: '🟢 Simple guide', medium: '🟡 Intermediate guide', advanced: '🔴 Detailed guide' },
  de: { simple: '🟢 Einfache Erklärung', medium: '🟡 Mittlere Erklärung', advanced: '🔴 Ausführliche Erklärung' },
  fr: { simple: '🟢 Explication simple', medium: '🟡 Explication intermédiaire', advanced: '🔴 Explication détaillée' },
  tr: { simple: '🟢 Basit anlatım', medium: '🟡 Orta anlatım', advanced: '🔴 Detaylı anlatım' },
  ru: { simple: '🟢 Простое объяснение', medium: '🟡 Среднее объяснение', advanced: '🔴 Подробное объяснение' }
};

const SINGLE_PRAYER_VIDEO_LABELS = {
  ar: '▶️ شرح الصلاة بلغتك',
  en: '▶️ Prayer guide in your language',
  de: '▶️ Gebetsanleitung in deiner Sprache',
  fr: '▶️ Guide de la prière dans votre langue',
  tr: '▶️ Dilinizde namaz rehberi',
  ru: '▶️ Руководство по намازу на вашем языке'
};

const SINGLE_WUDU_VIDEO_LABELS = {
  ar: '▶️ شرح الوضوء بلغتك',
  en: '▶️ Wudu guide in your language',
  de: '▶️ Wudu-Anleitung in deiner Sprache',
  fr: '▶️ Guide des ablutions dans votre langue',
  tr: '▶️ Dilinizde abdest rehberi',
  ru: '▶️ Руководство по омовению на вашем языке'
};

const FEMALE_PRAYER_VIDEO_LABELS = {
  ar: '▶️ شرح صلاة المرأة',
  en: '▶️ Watch How Women Pray',
  de: '▶️ Wie Frauen beten — Video',
  fr: '▶️ Comment prient les femmes',
  tr: '▶️ Kadınların namazı',
  ru: '▶️ Как молятся женщины'
};

const WUDU_LEVEL_LABELS = {
  ar: { simple: '🟢 شرح مبسط', advanced: '🔴 شرح مكثف' },
  en: { simple: '🟢 Simple guide', advanced: '🔴 Detailed guide' },
  de: { simple: '🟢 Einfache Erklärung', advanced: '🔴 Ausführliche Erklärung' },
  fr: { simple: '🟢 Explication simple', advanced: '🔴 Explication détaillée' },
  tr: { simple: '🟢 Basit anlatım', advanced: '🔴 Detaylı anlatım' },
  ru: { simple: '🟢 Простое объяснение', advanced: '🔴 Подробное объяснение' }
};

function getVideoButtonLabel(uiLang) {
  return VIDEO_BUTTON_LABELS[uiLang] || VIDEO_BUTTON_LABELS.en;
}

function getPrayerLevelLabels(uiLang) {
  return PRAYER_LEVEL_LABELS[uiLang] || PRAYER_LEVEL_LABELS.en;
}

function buildWuduVideoRows(uiLang) {
  const videoData = db.getWuduVideosForLang(uiLang);
  const rows = [];
  if (videoData.type === 'single') {
    const label = SINGLE_WUDU_VIDEO_LABELS[uiLang] || SINGLE_WUDU_VIDEO_LABELS.ar;
    rows.push([Markup.button.url(label, videoData.url)]);
    return rows;
  }
  const labels = WUDU_LEVEL_LABELS[uiLang] || WUDU_LEVEL_LABELS.ar;
  for (const level of ['simple', 'advanced']) {
    const url = videoData[level];
    if (url) rows.push([Markup.button.url(labels[level], url)]);
  }
  return rows;
}

function buildPrayerVideoRows(uiLang, gender) {
  if (gender === 'female') {
    const videoData = db.getPrayerFemaleVideoForLang(uiLang);
    const rows = [];
    if (videoData.url) {
      const label = FEMALE_PRAYER_VIDEO_LABELS[uiLang] || FEMALE_PRAYER_VIDEO_LABELS.ar;
      rows.push([Markup.button.url(label, videoData.url)]);
    }
    return rows;
  }
  const videoData = db.getPrayerVideosForLang(uiLang);
  const rows = [];
  if (videoData.type === 'single') {
    const label = SINGLE_PRAYER_VIDEO_LABELS[uiLang] || SINGLE_PRAYER_VIDEO_LABELS.en;
    rows.push([Markup.button.url(label, videoData.url)]);
    return rows;
  }
  const labels = getPrayerLevelLabels(uiLang);
  for (const level of ['simple', 'medium', 'advanced']) {
    const url = videoData[level];
    if (url) rows.push([Markup.button.url(labels[level], url)]);
  }
  return rows;
}

function sectionKeyboard(currentId, videoRows, extraRows) {
  const rows = [];
  if (extraRows?.length) rows.push(...extraRows);
  if (videoRows?.length) rows.push(...videoRows);
  const navRows = PRAYER_FIQH_SECTIONS
    .filter((s) => s.id !== currentId)
    .map((s) => [Markup.button.callback(s.title, `fiqh_section_${s.id}`)]);
  rows.push(...navRows);
  rows.push([Markup.button.callback('📿 كل الأقسام', 'fiqh_section_menu')]);
  return Markup.inlineKeyboard(rows);
}

async function sendSection(ctx, sectionId) {
  const section = getSection(sectionId);
  if (!section) {
    await ctx.answerCbQuery('❌ القسم غير موجود', { show_alert: true }).catch(() => {});
    return;
  }
  const gender = resolveFiqhGender(ctx);
  const text = `*${section.title}*\n\n${getSectionContent(section, gender)}`;
  const userLang = db.getUser(ctx.from.id)?.uiLang || ctx.session?.uiLang || 'ar';
  const extraRows = [];
  let videoRows = [];

  if (sectionId === 'prayer_steps') {
    videoRows = buildPrayerVideoRows(userLang, gender);
  } else if (sectionId === 'wudu') {
    videoRows = buildWuduVideoRows(userLang);
  } else {
    const videoTopic = SECTION_TO_VIDEO_TOPIC[sectionId];
    if (videoTopic) {
      const videoUrl = db.getJourneyVideo(videoTopic, userLang);
      if (videoUrl) {
        videoRows.push([Markup.button.url(getVideoButtonLabel(userLang), videoUrl)]);
      }
    }
  }

  return sendOrEdit(ctx, text, sectionKeyboard(sectionId, videoRows, extraRows));
}

async function showFiqhGenderSelection(ctx) {
  const text = '📿 *فقه الصلاة المبسّط*\n\nاختر ما يناسبك:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard([
    [
      Markup.button.callback('🧔 للأخ', 'fiqh_gender_male'),
      Markup.button.callback('🧕 للأخت', 'fiqh_gender_female')
    ]
  ]));
}

async function showFiqhMenu(ctx) {
  const buttons = [];
  PRAYER_FIQH_SECTIONS.forEach((s) => {
    buttons.push([Markup.button.callback(s.title, `fiqh_section_${s.id}`)]);
  });
  buttons.push([Markup.button.callback('📖 قراءة الصلاة', 'prayer_readings_menu')]);
  const text = '📿 *فقه الصلاة المبسّط*\n\nاختر قسماً للبدء:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(buttons));
}

async function handlePrayerFiqhMenu(ctx) {
  return showFiqhGenderSelection(ctx);
}

async function handleFiqhGenderSelect(ctx, gender) {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.fiqhGender = gender;
  return showFiqhMenu(ctx);
}

registry.registerAction('fiqh_menu_start', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showFiqhGenderSelection(ctx);
}, 'فقه الصلاة — من القسم الدعوي');

registry.registerAction('fiqh_gender_male', async (ctx) => {
  await handleFiqhGenderSelect(ctx, 'male');
}, 'فقه الصلاة — اختيار ذكر');

registry.registerAction('fiqh_gender_female', async (ctx) => {
  await handleFiqhGenderSelect(ctx, 'female');
}, 'فقه الصلاة — اختيار أنثى');

registry.registerAction(/^fiqh_section_(.+)$/, async (ctx) => {
  const sectionId = ctx.match[1];
  if (sectionId === 'menu') {
    return showFiqhMenu(ctx);
  }
  await ctx.answerCbQuery().catch(() => {});
  return sendSection(ctx, sectionId);
}, 'قسم فقه الصلاة المبسّط');

module.exports = { handlePrayerFiqhMenu, showFiqhMenu, showFiqhGenderSelection, buildPrayerVideoRows, buildWuduVideoRows };

const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const db = require('../database');
const sendOrEdit = require('../utils/sendOrEdit');
const { loadDB, saveDB } = require('../utils/db');
const DEBATES_DATA = require('../data/debates');
const { VOLUNTEER_LANGUAGES } = require('./volunteers');
const { canActAsRegionalModerator } = require('../services/moderatorService');
const {
  handleDebateAddType,
  handleDebateAddConfirm,
  handleDebateAddCancel
} = require('../scenes/debateAddRegionalScene');

const PAGE_SIZE = 5;
const AI_MORE_URL = 'https://www.youtube.com/results?search_query=islamic+AI+debate+dawah';

const SCHOLAR_BUTTONS = [
  { key: 'zakir_naik', label: '🎤 د. ذاكر نايك' },
  { key: 'hamza', label: '🎤 حمزة تزورتزيس' },
  { key: 'deedat', label: '🎤 أحمد ديدات' }
];

function truncateLabel(text, max = 58) {
  const s = String(text || '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function debatesBackRow() {
  return [Markup.button.callback('🔙 رجوع', 'debates_menu')];
}

async function handleDebatesMenu(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const text =
    '📺 *مناظرات دعوية*\n\n' +
    'اختر نوع المناظرة:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard([
    [Markup.button.callback('🤖 مناظرات الذكاء الاصطناعي', 'debate_ai_list')],
    [Markup.button.callback('👥 مناظرات بشرية', 'debate_human_list')],
    [Markup.button.callback('🌍 مناظرات بلغات أخرى', 'debate_regional_list')],
    [Markup.button.callback('🔙 رجوع للقسم الدعوي', 'dawah_menu')]
  ]));
}

async function handleDebateAiList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const rows = DEBATES_DATA.ai.map((v) => [
    Markup.button.url(truncateLabel(`${v.topic} | ${v.title}`), v.url)
  ]);
  rows.push([Markup.button.url('🌐 شاهد المزيد', AI_MORE_URL)]);
  rows.push(debatesBackRow());
  const text = '🤖 *مناظرات الذكاء الاصطناعي*\n\nاضغط لفتح الفيديو على YouTube:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleDebateHumanList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const rows = SCHOLAR_BUTTONS.map((s) => [
    Markup.button.callback(s.label, `debate_scholar_${s.key}_1`)
  ]);
  rows.push(debatesBackRow());
  const text = '👥 *مناظرات بشرية*\n\nاختر العالم:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function handleDebateScholar(ctx, scholarId, page) {
  await ctx.answerCbQuery().catch(() => {});
  const scholar = DEBATES_DATA.human[scholarId];
  if (!scholar) {
    return ctx.answerCbQuery('❌ غير موجود', { show_alert: true }).catch(() => {});
  }
  const videos = scholar.videos || [];
  const totalPages = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const slice = videos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const rows = slice.map((v) => [
    Markup.button.url(truncateLabel(v.title), v.url)
  ]);
  if (scholar.channel) {
    rows.push([Markup.button.url('📺 القناة الكاملة', scholar.channel)]);
  }
  const nav = [];
  if (safePage > 1) {
    nav.push(Markup.button.callback('⬅️ السابق', `debate_scholar_${scholarId}_${safePage - 1}`));
  }
  if (safePage < totalPages) {
    nav.push(Markup.button.callback('التالي ➡️', `debate_scholar_${scholarId}_${safePage + 1}`));
  }
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('🔙 رجوع', 'debate_human_list')]);

  const text =
    `🎤 *${scholar.name}*\n` +
    `صفحة ${safePage} من ${totalPages}\n\n` +
    'اضغط لفتح الفيديو:';
  return sendOrEdit(ctx, text, Markup.inlineKeyboard(rows));
}

function getRegionalDebates(approvedOnly = true) {
  const regional = loadDB().debates?.regional || {};
  const grouped = {};
  for (const [langCode, items] of Object.entries(regional)) {
    const list = (items || []).filter((e) => !approvedOnly || e.approved);
    if (list.length) grouped[langCode] = list;
  }
  return grouped;
}

function getPendingRegionalDebates() {
  const regional = loadDB().debates?.regional || {};
  const pending = [];
  for (const [langCode, items] of Object.entries(regional)) {
    for (const entry of items || []) {
      if (!entry.approved) {
        pending.push({ langCode, entry });
      }
    }
  }
  return pending;
}

async function handleDebateRegionalList(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const grouped = getRegionalDebates(true);
  const langCodes = Object.keys(grouped);
  if (!langCodes.length) {
    const text =
      '🌍 *مناظرات بلغات أخرى*\n\n' +
      'لا توجد مناظرات بلغات أخرى بعد — المشرفون الإقليميون يمكنهم إضافة محتوى بلغة بلدهم.';
    return sendOrEdit(ctx, text, Markup.inlineKeyboard([debatesBackRow()]));
  }

  let text = '🌍 *مناظرات بلغات أخرى*\n\n';
  const rows = [];
  for (const langCode of langCodes.sort()) {
    const langLabel = VOLUNTEER_LANGUAGES[langCode] || langCode;
    text += `\n*${langLabel}:*\n`;
    for (const entry of grouped[langCode]) {
      text += `• ${entry.title}\n`;
      rows.push([Markup.button.url(truncateLabel(entry.title), entry.url)]);
    }
  }
  rows.push(debatesBackRow());
  return sendOrEdit(ctx, text.trim(), Markup.inlineKeyboard(rows));
}

async function handleDebateAddStart(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!canActAsRegionalModerator(ctx.from.id)) {
    return ctx.reply('⛔ للمشرفين الإقليميون والمطوّر فقط.');
  }
  return ctx.scene.enter('debate-add-regional');
}

async function showDevDebateReview(ctx) {
  if (!db.isDeveloper(ctx.from.id)) {
    return ctx.reply('⛔ للمطوّر فقط.');
  }
  const pending = getPendingRegionalDebates();
  if (!pending.length) {
    return ctx.reply('✅ لا توجد مناظرات إقليمية بانتظار المراجعة.');
  }

  for (const { langCode, entry } of pending) {
    const langLabel = VOLUNTEER_LANGUAGES[langCode] || langCode;
    const typeLabel = { ai: 'AI', human: 'بشرية', lecture: 'محاضرة' }[entry.type] || entry.type;
    const text =
      `🎬 *مناظرة إقليمية للمراجعة*\n\n` +
      `🌍 اللغة: ${langLabel}\n` +
      `📂 النوع: ${typeLabel}\n` +
      `📌 العنوان: ${entry.title}\n` +
      `🔗 ${entry.url}\n` +
      `👤 أضافها: ${entry.addedBy}`;
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ اعتمد', `debate_regional_approve_${langCode}_${entry.id}`),
          Markup.button.callback('❌ ارفض', `debate_regional_reject_${langCode}_${entry.id}`)
        ]
      ])
    });
  }
}

async function handleDebateRegionalApprove(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!db.isDeveloper(ctx.from.id)) return;
  const langCode = ctx.match[1];
  const entryId = ctx.match[2];
  const dbData = loadDB();
  const list = dbData.debates?.regional?.[langCode] || [];
  const entry = list.find((e) => e.id === entryId);
  if (!entry) return ctx.reply('❌ غير موجود.');
  entry.approved = true;
  saveDB(dbData);
  await ctx.editMessageText(`✅ تم اعتماد: ${entry.title}`).catch(() => {});
  try {
    await ctx.telegram.sendMessage(
      entry.addedBy,
      `✅ تم اعتماد مناظرتك ونشرها:\n*${entry.title}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
}

async function handleDebateRegionalReject(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  if (!db.isDeveloper(ctx.from.id)) return;
  const langCode = ctx.match[1];
  const entryId = ctx.match[2];
  if (!ctx.session) ctx.session = {};
  ctx.session.awaitingDebateRejectReason = { langCode, entryId };
  await ctx.reply('✏️ اكتب سبب الرفض ليُرسَل للمشرف:');
}

async function handleDebateRejectReasonText(ctx, text) {
  const target = ctx.session?.awaitingDebateRejectReason;
  if (!target) return false;
  delete ctx.session.awaitingDebateRejectReason;

  const dbData = loadDB();
  const list = dbData.debates?.regional?.[target.langCode] || [];
  const idx = list.findIndex((e) => e.id === target.entryId);
  if (idx < 0) {
    await ctx.reply('❌ لم يُعثر على المناظرة.');
    return true;
  }
  const [removed] = list.splice(idx, 1);
  if (!list.length) delete dbData.debates.regional[target.langCode];
  saveDB(dbData);

  await ctx.reply('❌ تم رفض المناظرة وإبلاغ المشرف.');
  try {
    await ctx.telegram.sendMessage(
      removed.addedBy,
      `❌ تم رفض مناظرتك *${removed.title}*\n\nالسبب: ${text.trim()}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  return true;
}

registry.registerAction('debates_menu', handleDebatesMenu, 'قائمة المناظرات الدعوية');
registry.registerAction('debate_ai_list', handleDebateAiList, 'مناظرات AI');
registry.registerAction('debate_human_list', handleDebateHumanList, 'مناظرات بشرية');
registry.registerAction('debate_regional_list', handleDebateRegionalList, 'مناظرات بلغات أخرى');
registry.registerAction(/^debate_scholar_(.+)_(\d+)$/, async (ctx) => {
  const scholarId = ctx.match[1];
  const page = parseInt(ctx.match[2], 10) || 1;
  return handleDebateScholar(ctx, scholarId, page);
}, 'فيديوهات عالم مناظرات');
registry.registerAction('debate_add_start', handleDebateAddStart, 'إضافة مناظرة إقليمية');
registry.registerAction('debate_add_type_ai', (ctx) => handleDebateAddType(ctx, 'ai'), 'نوع مناظرة AI');
registry.registerAction('debate_add_type_human', (ctx) => handleDebateAddType(ctx, 'human'), 'نوع مناظرة بشرية');
registry.registerAction('debate_add_type_lecture', (ctx) => handleDebateAddType(ctx, 'lecture'), 'نوع محاضرة');
registry.registerAction('debate_add_confirm', handleDebateAddConfirm, 'تأكيد إضافة مناظرة');
registry.registerAction('debate_add_cancel', handleDebateAddCancel, 'إلغاء إضافة مناظرة');
registry.registerAction(/^debate_regional_approve_(.+)_([^_]+(?:_[^_]+)*)$/, handleDebateRegionalApprove, 'اعتماد مناظرة إقليمية');
registry.registerAction(/^debate_regional_reject_(.+)_([^_]+(?:_[^_]+)*)$/, handleDebateRegionalReject, 'رفض مناظرة إقليمية');

registry.registerMenu('🎬 مراجعة مناظرات إقليمية', showDevDebateReview, 'مراجعة مناظرات إقليمية — مطوّر');

module.exports = {
  handleDebatesMenu,
  handleDebateAiList,
  handleDebateHumanList,
  handleDebateScholar,
  handleDebateRegionalList,
  handleDebateRejectReasonText,
  showDevDebateReview,
  PAGE_SIZE
};

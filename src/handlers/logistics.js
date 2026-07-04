const db = require('../database');
const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');

const LOGISTICS_TYPES = {
  electric: '⚡ كهرباء',
  plumbing: '🔧 سباكة',
  cleaning: '🧹 نظافة',
  security: '🔒 أمان',
  safety: '🛡️ أمن وسلامة',
  audio: '🔊 تجهيزات صوتية'
};

const STATUS_LABELS = {
  open: '🔴 مفتوح',
  inprogress: '🟡 قيد المعالجة',
  closed: '🟢 مغلق'
};

function getUserMosque(userId) {
  const all = db.getAllMosques();
  return Object.values(all).find(m => {
    if (m.adminId === userId || m.createdBy === parseInt(userId) || m.createdBy === userId) return true;
    const roles = db.getMosqueRoles(m.id) || {};
    return Object.entries(roles).some(([uid]) => String(uid) === String(userId));
  }) || null;
}

function isLogisticsManager(userId, mosqueId) {
  const roles = db.getMosqueRoles(mosqueId) || {};
  const role = roles[String(userId)]?.role;
  return role === 'logistics' || role === 'admin';
}

function isAdmin(userId, mosqueId) {
  const mosque = db.getMosque(mosqueId);
  if (!mosque) return false;
  if (String(mosque.adminId) === String(userId) || String(mosque.createdBy) === String(userId)) return true;
  const roles = db.getMosqueRoles(mosqueId) || {};
  return roles[String(userId)]?.role === 'admin';
}

// ===== رفع بلاغ =====
async function showLogisticsMenu(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ أنت غير مرتبط بأي مسجد.');
  await ctx.reply(
    '🔧 *نظام بلاغات الأعطال*\n\nاختر نوع البلاغ:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚡ كهرباء', `lg_type_electric`), Markup.button.callback('🔧 سباكة', `lg_type_plumbing`)],
        [Markup.button.callback('🧹 نظافة', `lg_type_cleaning`), Markup.button.callback('🔒 أمان', `lg_type_security`)],
        [Markup.button.callback('🛡️ أمن وسلامة', `lg_type_safety`), Markup.button.callback('🔊 صوتيات', `lg_type_audio`)],
        [Markup.button.callback('📋 بلاغاتي', `lg_my_reports`), Markup.button.callback('🔙 رجوع', `mosque_admin_panel`)]
      ])
    }
  );
}

async function handleLogisticsType(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const type = ctx.callbackQuery.data.replace('lg_type_', '');
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ أنت غير مرتبط بأي مسجد.');
  ctx.session.lg_type = type;
  ctx.session.lg_mosqueId = mosque.id;
  ctx.session.waitingLogisticsDesc = true;
  await ctx.reply(
    `${LOGISTICS_TYPES[type]}\n\n✏️ اكتب وصف العطل بالتفصيل:`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'logistics_menu')]])
  );
}

async function handleLogisticsDescInput(ctx) {
  if (!ctx.session?.waitingLogisticsDesc) return false;
  const userId = String(ctx.from.id);
  const desc = ctx.message.text.trim();
  if (desc.length < 5) {
    await ctx.reply('⚠️ الوصف قصير جداً. اكتب تفاصيل أكثر:');
    return true;
  }
  const mosqueId = ctx.session.lg_mosqueId;
  const type = ctx.session.lg_type;
  const reportId = `lg_${Date.now()}`;
  const reports = db.get('logistics_reports') || {};
  reports[reportId] = {
    id: reportId,
    mosqueId,
    type,
    description: desc,
    reportedBy: userId,
    reporterName: ctx.from.first_name || 'مجهول',
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: ''
  };
  db.set('logistics_reports', reports);
  ctx.session.waitingLogisticsDesc = false;
  ctx.session.lg_type = null;
  ctx.session.lg_mosqueId = null;
  await ctx.reply(
    `✅ *تم رفع البلاغ بنجاح*\n\n` +
    `📋 النوع: ${LOGISTICS_TYPES[type]}\n` +
    `📝 الوصف: ${desc}\n` +
    `🔴 الحالة: مفتوح\n\n` +
    `سيتم إشعار مدير اللوجستك فوراً.`,
    { parse_mode: 'Markdown' }
  );
  const mosque = db.getMosque(mosqueId);
  const roles = db.getMosqueRoles(mosqueId) || {};
  const toNotify = new Set();
  if (mosque?.adminId) toNotify.add(String(mosque.adminId));
  if (mosque?.createdBy) toNotify.add(String(mosque.createdBy));
  Object.entries(roles).forEach(([uid, r]) => {
    if (r?.role === 'logistics' || r?.role === 'admin') toNotify.add(uid);
  });
  for (const uid of toNotify) {
    if (uid === userId) continue;
    await ctx.telegram.sendMessage(uid,
      `🚨 *بلاغ عطل جديد*\n\n` +
      `🕌 المسجد: ${mosque?.name || mosqueId}\n` +
      `${LOGISTICS_TYPES[type]}\n` +
      `📝 ${desc}\n` +
      `👤 رفعه: ${ctx.from.first_name || 'مجهول'}\n\n` +
      `اضغط لمعالجة البلاغ:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 عرض البلاغات', 'lg_manage_reports')]
        ])
      }
    ).catch(() => {});
  }
  return true;
}

// ===== بلاغاتي =====
async function showMyReports(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ أنت غير مرتبط بأي مسجد.');
  const reports = db.get('logistics_reports') || {};
  const mine = Object.values(reports).filter(r => r.mosqueId === mosque.id && r.reportedBy === userId);
  if (mine.length === 0) {
    return ctx.editMessageText('📋 لا توجد بلاغات مرفوعة منك.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'logistics_menu')]])
    });
  }
  let text = `📋 *بلاغاتي (${mine.length})*\n\n`;
  mine.slice(-5).forEach((r, i) => {
    text += `${i + 1}. ${LOGISTICS_TYPES[r.type]} — ${STATUS_LABELS[r.status]}\n`;
    text += `   📝 ${r.description.slice(0, 50)}${r.description.length > 50 ? '...' : ''}\n`;
    if (r.notes) text += `   💬 ملاحظة المعالج: ${r.notes}\n`;
    text += `   📅 ${new Date(r.createdAt).toLocaleDateString('ar')}\n\n`;
  });
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'logistics_menu')]])
  });
}

// ===== لوحة الإدارة =====
async function showManageReports(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getUserMosque(userId);
  if (!mosque) return ctx.reply('⚠️ غير مصرح.');
  if (!isLogisticsManager(userId, mosque.id) && !isAdmin(userId, mosque.id)) {
    return ctx.reply('⛔ هذه اللوحة للوجستك والمدير فقط.');
  }
  const reports = db.get('logistics_reports') || {};
  const mosqueReports = Object.values(reports).filter(r => r.mosqueId === mosque.id);
  const open = mosqueReports.filter(r => r.status === 'open');
  const inprogress = mosqueReports.filter(r => r.status === 'inprogress');
  const closed = mosqueReports.filter(r => r.status === 'closed');
  let text = `🔧 *إدارة البلاغات — ${mosque.name}*\n\n`;
  text += `🔴 مفتوح: ${open.length} | 🟡 قيد المعالجة: ${inprogress.length} | 🟢 مغلق: ${closed.length}\n\n`;
  const pending = [...open, ...inprogress].slice(-8);
  if (pending.length === 0) {
    text += '✅ لا توجد بلاغات مفتوحة.';
  } else {
    pending.forEach(r => {
      text += `${STATUS_LABELS[r.status]} — ${LOGISTICS_TYPES[r.type]}\n`;
      text += `📝 ${r.description.slice(0, 60)}${r.description.length > 60 ? '...' : ''}\n`;
      text += `👤 ${r.reporterName} — 📅 ${new Date(r.createdAt).toLocaleDateString('ar')}\n`;
    });
  }
  const buttons = pending.map(r => [
    Markup.button.callback(`${LOGISTICS_TYPES[r.type].split(' ')[0]} معالجة`, `lg_action_${r.id}`)
  ]);
  buttons.push([Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')]);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
}

async function showReportActions(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const reportId = ctx.callbackQuery.data.replace('lg_action_', '');
  const reports = db.get('logistics_reports') || {};
  const report = reports[reportId];
  if (!report) return ctx.reply('⚠️ البلاغ غير موجود.');
  const text =
    `🔧 *تفاصيل البلاغ*\n\n` +
    `النوع: ${LOGISTICS_TYPES[report.type]}\n` +
    `الحالة: ${STATUS_LABELS[report.status]}\n` +
    `📝 ${report.description}\n` +
    `👤 رفعه: ${report.reporterName}\n` +
    `📅 ${new Date(report.createdAt).toLocaleDateString('ar')}` +
    (report.notes ? `\n\n💬 الملاحظات: ${report.notes}` : '');
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🟡 قيد المعالجة', `lg_status_inprogress_${reportId}`), Markup.button.callback('🟢 مغلق', `lg_status_closed_${reportId}`)],
      [Markup.button.callback('💬 إضافة ملاحظة', `lg_note_${reportId}`)],
      [Markup.button.callback('🔙 رجوع', 'lg_manage_reports')]
    ])
  });
}

async function handleStatusChange(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data.replace('lg_status_', '');
  const [status, ...idParts] = data.split('_');
  const reportId = idParts.join('_');
  const reports = db.get('logistics_reports') || {};
  if (!reports[reportId]) return ctx.reply('⚠️ البلاغ غير موجود.');
  reports[reportId].status = status;
  reports[reportId].updatedAt = new Date().toISOString();
  db.set('logistics_reports', reports);
  await ctx.answerCbQuery(`✅ تم تغيير الحالة إلى ${STATUS_LABELS[status]}`);
  await showManageReports(ctx);
}

async function handleAddNote(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const reportId = ctx.callbackQuery.data.replace('lg_note_', '');
  ctx.session.waitingLogisticsNote = reportId;
  await ctx.reply('💬 اكتب ملاحظتك على البلاغ:',
    Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', `lg_action_${reportId}`)]])
  );
}

async function handleNoteInput(ctx) {
  if (!ctx.session?.waitingLogisticsNote) return false;
  const reportId = ctx.session.waitingLogisticsNote;
  const note = ctx.message.text.trim();
  const reports = db.get('logistics_reports') || {};
  if (!reports[reportId]) {
    ctx.session.waitingLogisticsNote = null;
    return true;
  }
  reports[reportId].notes = note;
  reports[reportId].updatedAt = new Date().toISOString();
  db.set('logistics_reports', reports);
  ctx.session.waitingLogisticsNote = null;
  await ctx.reply('✅ تم حفظ الملاحظة.');
  return true;
}

// ===== تسجيل الأزرار =====
registry.register('logistics_menu', showLogisticsMenu);
registry.register('lg_my_reports', showMyReports);
registry.register('lg_manage_reports', showManageReports);
registry.registerPrefix('lg_type_', handleLogisticsType);
registry.registerPrefix('lg_action_', showReportActions);
registry.registerPrefix('lg_status_', handleStatusChange);
registry.registerPrefix('lg_note_', handleAddNote);

module.exports = {
  showLogisticsMenu,
  handleLogisticsDescInput,
  handleNoteInput
};

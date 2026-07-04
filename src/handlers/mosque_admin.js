const db = require('../database');
const { Markup } = require('telegraf');
const registry = require('../core/actionRegistry');
const { buildProgressBar } = require('../scenes/campaignScene');
const { getNearbyMosquesByGPS, PROXIMITY_LEVELS } = require('../utils/geo');
const { showLogisticsMenu } = require('./logistics');
const { showStateReport } = require('./stateReport');
const { getBadgesDisplay, formatRejectionBadge } = require('../utils/mosqueBadges');
const { loadDB, saveDB } = require('../utils/db');

function getMosque(userId) {
  const all = db.getAllMosques();
  return Object.values(all).find(m =>
    m.adminId === userId ||
    m.createdBy === parseInt(userId) ||
    m.createdBy === userId
  ) || null;
}

// ===== اللوحة الرئيسية =====
async function mosqueAdminPanel(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return ctx.reply('⚠️ لم يتم ربطك بمسجد. تواصل مع المشرف.');

  const health = db.getMosqueHealth(mosque.id);
  const score = health?.score || 0;
  const stars = '🟢'.repeat(Math.floor(score / 20)) + '⚪'.repeat(5 - Math.floor(score / 20));
  const badges = getBadgesDisplay(mosque.id);
  const rejectionNote = formatRejectionBadge(mosque.id, false);
  const badgesLine = badges ? `\n${badges}` : '';
  const rejectionLine = rejectionNote ? `\n${rejectionNote}` : '';

  await ctx.reply(
    `🕌 *${mosque.name}*${badgesLine}${rejectionLine}\n` +
    `📍 ${mosque.city} — ${mosque.country}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💚 صحة المسجد: ${stars}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `اختر القسم:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👥 الفريق الإداري', 'ma_team')],
        [Markup.button.callback('👥 المصلّون', 'ma_worshippers'), Markup.button.callback('📨 دعوة', 'ma_staff_invite')],
        [Markup.button.callback('🕌 إدارة المشايخ', 'ma_sheikhs')],
        [Markup.button.callback('📢 الإعلانات والفعاليات', 'ma_announcements')],
        [Markup.button.callback('💰 المالية والتبرعات', 'ma_finance')],
        [Markup.button.callback('🔧 بلاغات الأعطال', 'logistics_menu')],
        [Markup.button.callback('📩 شكاوى المصلين', 'ma_complaints')],
        [Markup.button.callback('🕌 المساجد المجاورة', 'ma_nearby')],
        [Markup.button.callback('📊 الإحصائيات', 'ma_stats')],
        [Markup.button.callback('📋 تقرير الدولة', 'ma_state_report')],
        [Markup.button.callback('🏅 تسجيل في اتحاد رسمي', `register_union_${mosque.id}`)],
        [Markup.button.callback('📬 التواصل مع المنصة', 'ma_platform')],
        [Markup.button.callback('🤝 المتطوعون الدعويون', 'ma_volunteers')],
        [Markup.button.callback('🎙️ متطوعو التسميع', 'ma_rec_volunteers')],
        [Markup.button.callback('🚨 تنبيه طارئ', 'ma_emergency')],
      ])
    }
  );
}

// ===== الفريق الإداري =====
async function maTeam(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const roles = db.getMosqueRoles(mosque.id);
  const roleNames = {
    religious: '👨‍🏫 المدير الديني',
    finance: '💰 مدير المالية',
    logistics: '🔧 مدير اللوجستك',
    state: '🤝 مسؤول الدولة'
  };

  let teamList = '';
  for (const [uid, data] of Object.entries(roles)) {
    teamList += `${roleNames[data.role] || data.role}: \`${uid}\`\n`;
  }
  if (!teamList) teamList = '_لا يوجد فريق بعد_';

  await ctx.reply(
    `👥 *الفريق الإداري*\n` +
    `🕌 ${mosque.name}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${teamList}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('👨‍🏫 تعيين مدير ديني', 'ma_assign_religious')],
        [Markup.button.callback('💰 تعيين مدير مالية', 'ma_assign_finance')],
        [Markup.button.callback('🔧 تعيين مدير لوجستك', 'ma_assign_logistics')],
        [Markup.button.callback('🤝 تعيين مسؤول الدولة', 'ma_assign_state')],
        [Markup.button.callback('❌ إزالة عضو من الفريق', 'ma_remove_member')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== إدارة المشايخ =====
async function maSheikhs(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const roleLabels = {
    religious: '👨‍🏫 مدير ديني',
    finance: '💰 مدير مالية',
    logistics: '🔧 مدير لوجستك',
    state: '🤝 مسؤول الدولة',
    khatib: '🎤 خطيب جمعة',
    muadhin: '🔊 مؤذن',
    quran_teacher: '📖 مدرس قرآن',
    hifz_teacher: '📚 معلم تحفيظ',
    general: '🧑‍🏫 معلم عام',
    worshipper: '🙏 مصلي'
  };
  const allRoles = db.getMosqueRoles(mosque.id);
  const members = Object.entries(allRoles).map(([uid, data]) => {
    const user = db.getUser(uid);
    const name = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || `ID: ${uid}`
      : `ID: ${uid}`;
    return { id: uid, name, role: data.role };
  });
  const sheikhRoles = ['khatib', 'muadhin', 'quran_teacher', 'hifz_teacher', 'general'];
  const adminRoles = ['religious', 'finance', 'logistics', 'state'];
  const sheikhs = members.filter(m => sheikhRoles.includes(m.role));
  const team = members.filter(m => adminRoles.includes(m.role));
  let list = '';
  if (team.length > 0) {
    list += `*الفريق الإداري:*\n`;
    list += team.map(m => `• ${roleLabels[m.role]} — ${m.name}`).join('\n');
    list += '\n\n';
  }
  if (sheikhs.length > 0) {
    list += `*المشايخ:*\n`;
    list += sheikhs.map(m => `• ${roleLabels[m.role]} — ${m.name}`).join('\n');
  }
  if (!list) list = '_لا يوجد أعضاء مسجلون بعد_';
  await ctx.reply(
    `🕌 *فريق ${mosque.name}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${list}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👥 إجمالي الأعضاء: ${members.length}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ تعيين شيخ جديد', 'ma_sheikh_assign')],
        [Markup.button.callback('❌ إزالة عضو', 'ma_sheikh_remove')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== تعيين شيخ — اختيار الدور =====
async function maSheikhAssign(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply(
    `🕌 *تعيين شيخ جديد*\n━━━━━━━━━━━━━━━━━━\nاختر دور الشيخ:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🎤 خطيب جمعة', 'ma_role_khatib')],
        [Markup.button.callback('🔊 مؤذن', 'ma_role_muadhin')],
        [Markup.button.callback('📖 مدرس قرآن', 'ma_role_quran')],
        [Markup.button.callback('📚 معلم تحفيظ', 'ma_role_hifz')],
        [Markup.button.callback('🧑‍🏫 معلم عام', 'ma_role_general')],
        [Markup.button.callback('🔙 رجوع', 'ma_sheikhs')],
      ])
    }
  );
}

// ===== الإعلانات والفعاليات =====
async function maAnnouncements(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const events = db.getMosqueEvents(mosque.id);
  const pending = events.filter(e => e.status === 'pending').length;
  const approved = events.filter(e => e.status === 'approved').length;

  await ctx.reply(
    `📢 *الإعلانات والفعاليات*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⏳ طلبات معلقة: ${pending}\n` +
    `✅ فعاليات قادمة: ${approved}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📝 نشر إعلان جديد', 'ma_new_announcement')],
        [Markup.button.callback('🗓️ إضافة فعالية', 'ma_new_event')],
        [Markup.button.callback('⏳ طلبات المصلين', 'ma_pending_events')],
        [Markup.button.callback('📋 كل الفعاليات', 'ma_all_events')],
        [Markup.button.callback('🚨 تنبيه طارئ', 'ma_emergency')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== المالية =====
async function maFinance(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const campaigns = db.getMosqueCampaigns(mosque.id);
  const active = campaigns.filter(c => c.status === 'active');
  const totalCollected = active.reduce((s, c) => s + (c.collectedAmount || 0), 0);
  const totalTarget = active.reduce((s, c) => s + (c.targetAmount || 0), 0);

  let campSummary = active.length > 0
    ? active.map(c => {
        const bar = buildProgressBar(c.collectedAmount || 0, c.targetAmount);
        return `📌 *${c.title}*\n${bar}\n💶 ${c.collectedAmount || 0}€ من ${c.targetAmount}€`;
      }).join('\n\n')
    : '_لا توجد حملات نشطة_';

  await ctx.reply(
    `💰 *المالية والتبرعات*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${campSummary}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🚀 إطلاق حملة تبرع', 'ma_new_campaign')],
        [Markup.button.callback('➕ إضافة مبلغ يدوي', 'ma_manual_amount')],
        [Markup.button.callback('📊 كل الحملات', 'ma_active_campaigns')],
        [Markup.button.callback('📁 الأرشيف المالي', 'ma_finance_archive')],
        [Markup.button.callback('⚙️ إعدادات الدفع (IBAN/PayPal)', 'ma_payment_settings')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== اللوجستك =====
async function maLogistics(ctx) {
  return showLogisticsMenu(ctx);
}

// ===== الشكاوى =====
async function maComplaints(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const complaints = db.getMosqueComplaints(mosque.id);
  const open = complaints.filter(c => c.status === 'open');
  const resolved = complaints.filter(c => c.status === 'resolved');

  await ctx.reply(
    `📩 *شكاوى المصلين*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔴 مفتوحة: ${open.length}\n` +
    `✅ محلولة: ${resolved.length}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`🔴 المفتوحة (${open.length})`, 'ma_open_complaints')],
        [Markup.button.callback(`✅ المحلولة (${resolved.length})`, 'ma_resolved_complaints')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== المساجد المجاورة =====
async function maNearby(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const allMosques = db.getAllMosques();
  let list = '';

  if (mosque.lat && mosque.lng) {
    // استخدام GPS
    const nearby = getNearbyMosquesByGPS(mosque, allMosques);
    if (nearby.length === 0) {
      list = '_لا توجد مساجد مجاورة مسجلة في نطاق 200 كم_';
    } else {
      list = nearby.map(n =>
        `${n.label} — *${n.mosque.name}*\n📍 ${n.mosque.city} — ${n.km} كم (≈ ${n.time})`
      ).join('\n\n');
    }
  } else {
    // fallback للمدينة إذا لا يوجد GPS
    const nearby = Object.values(allMosques).filter(m =>
      m.id !== mosque.id && m.city === mosque.city
    );
    if (nearby.length === 0) {
      list = '_لا توجد مساجد مجاورة مسجلة_\n\n⚠️ أضف موقع GPS لمسجدك لتفعيل البحث الجغرافي';
    } else {
      list = nearby.map(m => `🕌 ${m.name} — ${m.city}`).join('\n');
      list += '\n\n⚠️ _أضف GPS لتحديد المسافات بدقة_';
    }
  }

  await ctx.reply(
    `🕌 *المساجد المجاورة*\n` +
    `📍 ${mosque.name}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${list}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📨 إرسال رسالة لمسجد', 'ma_msg_mosque')],
        [Markup.button.callback('📢 إعلان للمساجد المجاورة', 'ma_announce_nearby')],
        [Markup.button.callback('🗺️ تحديث موقع GPS', 'ma_update_gps')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== الإحصائيات =====
async function maStats(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const campaigns = db.getMosqueCampaigns(mosque.id);
  const events = db.getMosqueEvents(mosque.id);
  const complaints = db.getMosqueComplaints(mosque.id);
  const logistics = db.getMosqueLogistics(mosque.id);
  const roles = db.getMosqueRoles(mosque.id);

  // التبرعات
  const totalCollected = campaigns.reduce((s, c) => s + (c.collectedAmount || 0), 0);
  const totalGoal = campaigns.reduce((s, c) => s + (c.goal || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const completedCampaigns = campaigns.filter(c => c.status === 'closed');

  // الفعاليات
  const now = new Date();
  const upcomingEvents = events.filter(e => new Date(e.date) > now);
  const pastEvents = events.filter(e => new Date(e.date) <= now);

  // الشكاوى
  const openComplaints = complaints.filter(c => c.status === 'open');
  const closedComplaints = complaints.filter(c => c.status === 'closed');

  // البلاغات
  const openLogistics = logistics.filter(r => r.status === 'open');
  const inprogressLogistics = logistics.filter(r => r.status === 'inprogress');
  const closedLogistics = logistics.filter(r => r.status === 'closed');

  // المصلون
  const allUsers = db.get('users') || {};
  const worshippers = Object.values(allUsers).filter(u => u.mosqueId === mosque.id);
  const progressPct = totalGoal > 0 ? Math.round((totalCollected / totalGoal) * 100) : 0;

  await ctx.editMessageText(
    `📊 *إحصائيات ${mosque.name}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👥 *الفريق الإداري:* ${Object.keys(roles).length} عضو\n` +
    `🕌 *المصلون المسجلون:* ${worshippers.length}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💶 *التبرعات:*\n` +
    `   إجمالي جُمع: ${totalCollected}€\n` +
    `   إجمالي الأهداف: ${totalGoal}€\n` +
    `   نسبة الإنجاز: ${progressPct}%\n` +
    `   🚀 نشطة: ${activeCampaigns.length} | ✅ مكتملة: ${completedCampaigns.length}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🗓️ *الفعاليات:*\n` +
    `   قادمة: ${upcomingEvents.length} | منتهية: ${pastEvents.length}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📩 *الشكاوى:*\n` +
    `   🔴 مفتوحة: ${openComplaints.length} | ✅ مغلقة: ${closedComplaints.length}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔧 *بلاغات الأعطال:*\n` +
    `   🔴 مفتوحة: ${openLogistics.length} | 🟡 قيد المعالجة: ${inprogressLogistics.length} | ✅ مغلقة: ${closedLogistics.length}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')]
      ])
    }
  );
}

// ===== التواصل مع المنصة =====
async function maPlatform(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply(
    `📬 *التواصل مع المنصة*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `يمكنك إرسال ملاحظة أو بلاغ للمشرفين`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📝 إرسال ملاحظة', 'ma_send_note')],
        [Markup.button.callback('🚨 إرسال بلاغ', 'ma_send_report')],
        [Markup.button.callback('🔙 رجوع', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== تنبيه طارئ =====
async function maEmergency(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply(
    `🚨 *تنبيه طارئ*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ سيصل لجميع مصلي المسجد فوراً\n` +
    `هل أنت متأكد؟`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ نعم أرسل التنبيه', 'ma_confirm_emergency')],
        [Markup.button.callback('❌ إلغاء', 'mosque_admin_panel')],
      ])
    }
  );
}

// ===== تسجيل كل الأزرار =====
registry.register('mosque_admin_panel', mosqueAdminPanel);
registry.register('ma_team', maTeam);
registry.register('ma_sheikhs', maSheikhs);
registry.register('ma_sheikh_assign', maSheikhAssign);
registry.register('ma_announcements', maAnnouncements);
registry.register('ma_finance', maFinance);
registry.register('ma_logistics', maLogistics);
registry.register('ma_complaints', maComplaints);
registry.register('ma_nearby', maNearby);
registry.register('ma_stats', maStats);
registry.register('ma_state_report', showStateReport);
registry.register('ma_platform', maPlatform);
registry.register('ma_emergency', maEmergency);

async function generateInviteLink(ctx, role, roleLabel) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return ctx.reply('⚠️ لم يتم ربطك بمسجد. تواصل مع المشرف.');

  if (role === 'worshipper') {
    const { sendWorshipperMosqueQr } = require('../services/inviteService');
    return sendWorshipperMosqueQr(ctx, mosque);
  }

  const botUsername = ctx.botInfo?.username;
  if (!botUsername) return ctx.reply('⚠️ خطأ في إعداد البوت.');

  const inviteCode = `join_${mosque.id}_${role}_${Date.now()}`;
  const link = `https://t.me/${botUsername}?start=${inviteCode}`;
  const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;

  db.saveInviteCode(inviteCode, {
    mosqueId: mosque.id,
    role: role,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    used: false
  });

  await ctx.replyWithPhoto(
    { url: qrLink },
    {
      caption:
        `✅ *رابط دعوة — ${roleLabel}*\n` +
        `🕌 ${mosque.name}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📲 أرسل هذا الرابط:\n\`${link}\`\n\n` +
        `⚠️ صالح للاستخدام مرة واحدة فقط`,
      parse_mode: 'Markdown'
    }
  );
}

registry.register('ma_assign_religious', (ctx) => generateInviteLink(ctx, 'religious', '👨‍🏫 مدير ديني'));
registry.register('ma_assign_finance', (ctx) => generateInviteLink(ctx, 'finance', '💰 مدير مالية'));
registry.register('ma_assign_logistics', (ctx) => generateInviteLink(ctx, 'logistics', '🔧 مدير لوجستك'));
registry.register('ma_assign_state', (ctx) => generateInviteLink(ctx, 'state', '🤝 مسؤول الدولة'));
registry.register('ma_role_khatib', (ctx) => generateInviteLink(ctx, 'khatib', '🎤 خطيب الجمعة'));
registry.register('ma_role_muadhin', (ctx) => generateInviteLink(ctx, 'muadhin', '🔊 مؤذن'));
registry.register('ma_role_quran', (ctx) => generateInviteLink(ctx, 'quran_teacher', '📖 مدرس القرآن'));
registry.register('ma_role_hifz', (ctx) => generateInviteLink(ctx, 'hifz_teacher', '📚 معلم التحفيظ'));
registry.register('ma_role_general', (ctx) => generateInviteLink(ctx, 'general', '🧑‍🏫 معلم عام'));
registry.register('ma_invite_worshipper', (ctx) => generateInviteLink(ctx, 'worshipper', '🙏 مصلي'));

registry.register('ma_remove_member', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const roles = db.getMosqueRoles(mosque.id);
  if (Object.keys(roles).length === 0) return ctx.reply('⚠️ لا يوجد أعضاء في الفريق.');
  const roleLabels = {
    religious: '👨‍🏫 مدير ديني', finance: '💰 مدير مالية',
    logistics: '🔧 مدير لوجستك', state: '🤝 مسؤول الدولة',
    khatib: '🎤 خطيب', muadhin: '🔊 مؤذن',
    quran_teacher: '📖 مدرس قرآن', hifz_teacher: '📚 معلم تحفيظ', general: '🧑‍🏫 معلم عام'
  };
  const buttons = Object.entries(roles).map(([uid, data]) => {
    const user = db.getUser(uid);
    const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || uid : uid;
    return [Markup.button.callback(`❌ ${name} — ${roleLabels[data.role] || data.role}`, `ma_confirm_remove_${uid}`)];
  });
  buttons.push([Markup.button.callback('🔙 رجوع', 'ma_team')]);
  await ctx.reply(
    `❌ *إزالة عضو من الفريق*\n🕌 ${mosque.name}\n━━━━━━━━━━━━━━━━━━\nاختر العضو:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
});
registry.register('ma_sheikh_list', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('🔜 قريباً — قائمة المشايخ التفصيلية'); });
registry.register('ma_sheikh_remove', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('🔜 قريباً — إزالة شيخ'); });
registry.register('ma_new_announcement', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  announcementState[userId] = { mosqueId: mosque.id, step: 'waiting_text' };
  await ctx.reply(
    `📝 *نشر إعلان جديد*\n━━━━━━━━━━━━━━━━━━\n🕌 ${mosque.name}\n\nأدخل نص الإعلان:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'ma_announcements')]]) }
  );
});
registry.register('ma_new_event', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  eventState[userId] = { mosqueId: mosque.id, step: 'waiting_title' };
  await ctx.reply(
    `🗓️ *إضافة فعالية جديدة*\n━━━━━━━━━━━━━━━━━━\n🕌 ${mosque.name}\n\n📌 أدخل عنوان الفعالية:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'ma_announcements')]]) }
  );
});
registry.register('ma_pending_events', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const events = db.getMosqueEvents(mosque.id).filter(e => e.status === 'pending');
  if (events.length === 0) {
    return ctx.reply('✅ لا توجد طلبات معلقة.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]])
    });
  }
  for (const ev of events) {
    const user = db.getUser(ev.suggestedBy);
    const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'مجهول';
    await ctx.reply(
      `⏳ *طلب فعالية*\n━━━━━━━━━━━━━━━━━━\n📌 ${ev.title}\n📄 ${ev.description || 'بدون وصف'}\n📅 ${ev.date || '—'} ⏰ ${ev.time || '—'}\n👤 مقترح من: ${name}`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[
        Markup.button.callback('✅ قبول', `ma_approve_event_${ev.id}`),
        Markup.button.callback('❌ رفض', `ma_reject_event_${ev.id}`)
      ]]) }
    );
  }
  await ctx.reply('━━━━━━━━━━━━━━━━━━', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]]));
});
registry.register('ma_all_events', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const events = db.getMosqueEvents(mosque.id);
  if (events.length === 0) {
    return ctx.reply('📋 لا توجد فعاليات بعد.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]])
    });
  }
  const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌' };
  const list = events.map(ev =>
    `${statusEmoji[ev.status] || '•'} *${ev.title}*\n📅 ${ev.date || '—'} ⏰ ${ev.time || '—'}`
  ).join('\n\n');
  await ctx.reply(
    `📋 *كل الفعاليات*\n━━━━━━━━━━━━━━━━━━\n${list}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]]) }
  );
});
registry.register('ma_new_campaign', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return ctx.scene.enter('campaign_scene');
});
registry.register('ma_active_campaigns', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('📊 🔜 قريباً — كل الحملات'); });
registry.register('ma_manual_amount', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const campaigns = db.getMosqueCampaigns(mosque.id).filter(c => c.status === 'active');
  if (campaigns.length === 0) {
    return ctx.reply('⚠️ لا توجد حملات نشطة.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_finance')]])
    });
  }
  const buttons = campaigns.map(c => {
    const bar = buildProgressBar(c.collectedAmount || 0, c.targetAmount);
    return [Markup.button.callback(`📌 ${c.title} | ${bar}`, `ma_pick_campaign_${c.id}`)];
  });
  buttons.push([Markup.button.callback('🔙 رجوع', 'ma_finance')]);
  await ctx.reply(
    `➕ *إضافة مبلغ يدوي*\n━━━━━━━━━━━━━━━━━━\nاختر الحملة:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
});
registry.register('ma_finance_archive', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('📁 🔜 قريباً — الأرشيف المالي'); });
registry.register('ma_open_reports', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('🔴 🔜 قريباً — البلاغات المفتوحة'); });
registry.register('ma_resolved_reports', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('✅ 🔜 قريباً — البلاغات المحلولة'); });
registry.register('ma_open_complaints', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const complaints = db.getMosqueComplaints(mosque.id).filter(c => c.status === 'open' || c.status === 'in_progress');
  if (complaints.length === 0) {
    return ctx.reply('✅ لا توجد شكاوى مفتوحة.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_complaints')]])
    });
  }
  const typeEmoji = { maintenance: '🔧', behavior: '🤝', admin: '📢', suggestion: '💡' };
  const priorityEmoji = { normal: '🟡', high: '🔴', urgent: '🚨' };
  for (const c of complaints.sort((a, b) => (b.repeatCount || 1) - (a.repeatCount || 1))) {
    const isAnon = c.anonymous;
    const user = isAnon ? null : db.getUser(c.userId);
    const name = isAnon ? '🎭 مجهول' : (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : c.userId);
    const repeat = c.repeatCount > 1 ? `\n🔁 تكررت ${c.repeatCount} مرات` : '';
    const priority = c.repeatCount >= 3 ? 'urgent' : c.repeatCount >= 2 ? 'high' : 'normal';
    await ctx.reply(
      `${priorityEmoji[priority]} *شكوى ${typeEmoji[c.type] || '📩'}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 ${name}\n` +
      `📝 ${c.text}\n` +
      `📅 ${new Date(c.createdAt).toLocaleDateString('ar')}\n` +
      `حالة: ${c.status === 'in_progress' ? '⚙️ قيد المعالجة' : '🔴 جديدة'}${repeat}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('💬 رد', `mc_reply_${c.id}`),
            Markup.button.callback('✅ حل', `mc_resolve_${c.id}`),
            Markup.button.callback('⚙️ قيد المعالجة', `mc_progress_${c.id}`)
          ]
        ])
      }
    );
  }
  await ctx.reply('━━━━━━━━━━━━━━━━━━', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_complaints')]]));
});
registry.register('ma_resolved_complaints', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const complaints = db.getMosqueComplaints(mosque.id).filter(c => c.status === 'resolved');
  if (complaints.length === 0) {
    return ctx.reply('لا توجد شكاوى محلولة بعد.', {
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_complaints')]])
    });
  }
  const typeEmoji = { maintenance: '🔧', behavior: '🤝', admin: '📢', suggestion: '💡' };
  const satisfied = complaints.filter(c => c.rating === 'satisfied').length;
  const unsatisfied = complaints.filter(c => c.rating === 'unsatisfied').length;
  await ctx.reply(
    `✅ *الشكاوى المحلولة*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📊 إجمالي: ${complaints.length}\n` +
    `⭐ راضٍ: ${satisfied} | ❌ غير راضٍ: ${unsatisfied}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    { parse_mode: 'Markdown' }
  );
  for (const c of complaints.slice(-10)) {
    const isAnon = c.anonymous;
    const user = isAnon ? null : db.getUser(c.userId);
    const name = isAnon ? '🎭 مجهول' : (user ? `${user.firstName || ''}`.trim() : c.userId);
    const rating = c.rating === 'satisfied' ? '⭐ راضٍ' : c.rating === 'unsatisfied' ? '❌ غير راضٍ' : '—';
    await ctx.reply(
      `✅ ${typeEmoji[c.type] || '📩'} *${name}*\n` +
      `📝 ${c.text}\n` +
      `💬 الرد: ${c.reply || '—'}\n` +
      `تقييم: ${rating}`,
      { parse_mode: 'Markdown' }
    );
  }
  await ctx.reply('━━━━━━━━━━━━━━━━━━', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_complaints')]]));
});
registry.register('ma_update_gps', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  ctx.session.updatingGPS = mosque.id;
  await ctx.reply(
    `🗺️ *تحديث موقع GPS*\n━━━━━━━━━━━━━━━━━━\n📍 أرسل موقع المسجد من تيليغرام:\n_(المرفقات ← الموقع)_\n\nأو أدخل الإحداثيات:\n_(مثال: 53.5935, 9.4797)_`,
    { parse_mode: 'Markdown' }
  );
});
registry.register('ma_msg_mosque', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const allMosques = db.getAllMosques();
  let nearby = [];
  if (mosque.lat && mosque.lng) {
    nearby = getNearbyMosquesByGPS(mosque, allMosques).map(n => n.mosque);
  } else {
    nearby = Object.values(allMosques).filter(m => m.id !== mosque.id && m.city === mosque.city);
  }
  if (nearby.length === 0) {
    return ctx.reply('⚠️ لا توجد مساجد مجاورة مسجلة.');
  }
  const buttons = nearby.slice(0, 8).map(m => [
    Markup.button.callback(`🕌 ${m.name}`, `msg_mosque_${m.id}`)
  ]);
  buttons.push([Markup.button.callback('🔙 رجوع', 'ma_nearby')]);
  await ctx.reply(
    '📨 *إرسال رسالة لمسجد*\n\nاختر المسجد:',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
});
registry.register('ma_announce_nearby', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  ctx.session.waitingNearbyAnnounce = true;
  await ctx.reply(
    '📢 *إعلان للمساجد المجاورة*\n\n✏️ اكتب الإعلان الذي تريد إرساله لجميع المساجد المجاورة:',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'ma_nearby')]]) }
  );
});
registry.registerPrefix('msg_mosque_', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const targetId = ctx.callbackQuery.data.replace('msg_mosque_', '');
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  ctx.session.waitingMsgMosque = targetId;
  const targetMosque = db.getMosque(targetId);
  await ctx.reply(
    `📨 رسالة إلى *${targetMosque?.name || 'المسجد'}*\n\n✏️ اكتب رسالتك:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'ma_nearby')]]) }
  );
});
registry.register('ma_send_note', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('📝 🔜 قريباً — إرسال ملاحظة'); });
registry.register('ma_send_report', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); ctx.reply('🚨 🔜 قريباً — إرسال بلاغ'); });
// ===== نظام التنبيه الطارئ =====
const emergencyState = {};

registry.register('ma_confirm_emergency', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  emergencyState[userId] = { mosqueId: mosque.id, step: 'waiting_content' };

  await ctx.reply(
    `🚨 *التنبيه الطارئ*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `أرسل نص التنبيه أو صورة مع وصف\n` +
    `_(سيصل لجميع مصلي ${mosque.name} فوراً)_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ إلغاء', 'mosque_admin_panel')]
      ])
    }
  );
});

// معالج استقبال محتوى التنبيه الطارئ — أضفه في نهاية الملف قبل module.exports
async function handleEmergencyContent(ctx, next) {
  const userId = String(ctx.from.id);
  const state = emergencyState[userId];
  if (!state || state.step !== 'waiting_content') return next();

  const mosque = getMosque(userId);
  if (!mosque) return next();

  delete emergencyState[userId];

  // جلب كل مصلي المسجد
  const allUsers = db.allUsers ? db.allUsers() : [];
  const worshippers = allUsers.filter(u =>
    u.mosqueId === mosque.id || u.role === 'worshipper'
  );

  const emergencyText =
    `🚨 *تنبيه طارئ*\n` +
    `🕌 ${mosque.name}\n` +
    `━━━━━━━━━━━━━━━━━━\n`;

  let sentCount = 0;
  for (const user of worshippers) {
    try {
      if (ctx.message?.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const caption = emergencyText + (ctx.message.caption || '');
        await ctx.telegram.sendPhoto(user.id, photo, { caption, parse_mode: 'Markdown' });
      } else if (ctx.message?.text) {
        await ctx.telegram.sendMessage(user.id, emergencyText + ctx.message.text, { parse_mode: 'Markdown' });
      }
      sentCount++;
    } catch (e) {}
  }

  await ctx.reply(
    `✅ *تم الإرسال*\n` +
    `📨 وصل لـ ${sentCount} مصلي`,
    { parse_mode: 'Markdown' }
  );
}

registry.register('ma_payment_settings', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const iban = mosque.iban || '_غير محفوظ_';
  const paypal = mosque.paypal || '_غير محفوظ_';
  await ctx.reply(
    `⚙️ *إعدادات الدفع*\n` +
    `🕌 ${mosque.name}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🏦 IBAN: ${mosque.iban ? '✅ محفوظ' : '❌ غير محفوظ'}\n` +
    `💙 PayPal: ${mosque.paypal ? '✅ محفوظ' : '❌ غير محفوظ'}\n` +
    `━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏦 تحديث IBAN', 'ma_set_iban')],
        [Markup.button.callback('💙 تحديث PayPal', 'ma_set_paypal')],
        [Markup.button.callback('🗑️ حذف IBAN', 'ma_delete_iban')],
        [Markup.button.callback('🗑️ حذف PayPal', 'ma_delete_paypal')],
        [Markup.button.callback('🔙 رجوع', 'ma_finance')],
      ])
    }
  );
});
registry.register('ma_set_iban', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  ctx.session.settingIban = mosque.id;
  await ctx.reply(
    `🏦 *تحديث IBAN*\n━━━━━━━━━━━━━━━━━━\nأدخل رقم IBAN الجديد:`,
    { parse_mode: 'Markdown' }
  );
});
registry.register('ma_set_paypal', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  ctx.session.settingPaypal = mosque.id;
  await ctx.reply(
    `💙 *تحديث PayPal*\n━━━━━━━━━━━━━━━━━━\nأدخل رابط PayPal الجديد:`,
    { parse_mode: 'Markdown' }
  );
});
registry.register('ma_delete_iban', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath));
  if (dbData.mosques[mosque.id]) {
    delete dbData.mosques[mosque.id].iban;
    require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  }
  await ctx.reply('✅ تم حذف IBAN بنجاح.');
});
registry.register('ma_delete_paypal', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath));
  if (dbData.mosques[mosque.id]) {
    delete dbData.mosques[mosque.id].paypal;
    require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  }
  await ctx.reply('✅ تم حذف PayPal بنجاح.');
});

const announcementState = {};
const eventState = {};
async function handleAnnouncementAndEventInput(ctx, next) {
  const userId = String(ctx.from.id);
  const text = ctx.message?.text;
  if (!text) return next();
  const aState = announcementState[userId];
  if (aState && aState.step === 'waiting_text') {
    const mosque = getMosque(userId);
    if (!mosque) return next();
    delete announcementState[userId];
    const allUsers = db.allUsers ? db.allUsers() : [];
    const targets = allUsers.filter(u => u.mosqueId === mosque.id);
    const msgText =
      `📢 *إعلان من ${mosque.name}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${text}`;
    let sent = 0;
    for (const u of targets) {
      try { await ctx.telegram.sendMessage(u.id, msgText, { parse_mode: 'Markdown' }); sent++; } catch (e) {}
    }
    return ctx.reply(
      `✅ *تم نشر الإعلان!*\n📨 وصل لـ ${sent} مصلي`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]]) }
    );
  }
  const eState = eventState[userId];
  if (!eState) return next();
  if (eState.step === 'waiting_title') {
    eState.title = text.trim();
    eState.step = 'waiting_description';
    return ctx.reply(`📄 أدخل وصف الفعالية:\n_(أو أرسل "تخطي")_`, { parse_mode: 'Markdown' });
  }
  if (eState.step === 'waiting_description') {
    eState.description = text.trim() === 'تخطي' ? '' : text.trim();
    eState.step = 'waiting_capacity';
    return ctx.reply(
      `🔢 *الطاقة الاستيعابية*\n━━━━━━━━━━━━━━━━━━\nأدخل الحد الأقصى للحضور:\n_(أو أرسل "0" لعدم التحديد)_`,
      { parse_mode: 'Markdown' }
    );
  }
  if (eState.step === 'waiting_capacity') {
    const cap = parseInt(text.trim());
    eState.capacity = (!cap || isNaN(cap)) ? 0 : cap;
    eState.step = 'waiting_audience';
    return ctx.reply(
      `👥 *من يمكنه الحضور؟*\n━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔓 الجميع', 'ev_aud_all')],
          [Markup.button.callback('🔐 الفريق الإداري فقط', 'ev_aud_admin')],
          [Markup.button.callback('👨‍🏫 المشايخ فقط', 'ev_aud_sheikh')],
          [Markup.button.callback('🎯 الإداريون والمشايخ', 'ev_aud_staff')],
        ])
      }
    );
  }
  if (eState.step === 'waiting_date') {
    eState.date = text.trim();
    eState.step = 'waiting_time';
    return ctx.reply(`⏰ أدخل وقت الفعالية:\n_(مثال: 19:00)_`, { parse_mode: 'Markdown' });
  }
  if (eState.step === 'waiting_time') {
    eState.time = text.trim();
    eState.step = 'waiting_scope';
    // تم تحديد الوقت — الخطوة التالية عبر callback ev_aud_
    const mosque = getMosque(userId);
    const hasGPS = mosque?.lat && mosque?.lng;
    return ctx.reply(
      `📡 *اختر نطاق الفعالية:*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${hasGPS ? '📍 GPS مفعّل — تحديد دقيق للمسافات' : '⚠️ GPS غير مفعّل — سيُستخدم اسم المدينة'}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🕌 مسجدي فقط', 'ev_scope_mosque')],
          [Markup.button.callback('🟢 قريب جداً (15 دق — 10 كم)', 'ev_scope_very_close')],
          [Markup.button.callback('🔵 قريب (30 دق — 30 كم)', 'ev_scope_close')],
          [Markup.button.callback('🟡 متوسط (ساعة — 60 كم)', 'ev_scope_medium')],
          [Markup.button.callback('🔴 بعيد (3 ساعات — 200 كم)', 'ev_scope_far')],
          [Markup.button.callback('🇩🇪 كل الدولة', 'ev_scope_country')],
          [Markup.button.callback('🌍 كل المنصة', 'ev_scope_global')],
        ])
      }
    );
  }
  return next();
}
async function handleEventScopeCallback(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const eState = eventState[userId];
  if (!eState || eState.step !== 'waiting_scope') return;
  const scope = ctx.callbackQuery.data.replace('ev_scope_', '');
  // تحديد المساجد حسب مستوى الجوار GPS
  const proximityScopes = ['very_close', 'close', 'medium', 'far'];
  const isProximityScope = proximityScopes.includes(scope);
  eState.scope = scope;
  delete eventState[userId];
  const mosque = getMosque(userId);
  if (!mosque) return;

  const allMosques = db.getAllMosques();
  const proximityKmMap = {
    very_close: 10,
    close: 30,
    medium: 60,
    far: 200
  };
  let targetMosques = [];
  if (isProximityScope) {
    const maxKm = proximityKmMap[scope];
    if (mosque.lat && mosque.lng) {
      const nearby = getNearbyMosquesByGPS(mosque, allMosques);
      targetMosques = nearby
        .filter(n => n.km <= maxKm)
        .map(n => n.mosque);
    } else {
      // fallback للمدينة إذا لا يوجد GPS
      targetMosques = Object.values(allMosques).filter(m =>
        m.id !== mosque.id && m.city === mosque.city
      );
    }
  } else if (scope === 'nearby') {
    if (mosque.lat && mosque.lng) {
      const nearby = getNearbyMosquesByGPS(mosque, allMosques);
      targetMosques = nearby.map(n => n.mosque);
    } else {
      targetMosques = Object.values(allMosques).filter(m =>
        m.id !== mosque.id && m.city === mosque.city
      );
    }
  } else if (scope === 'country') {
    targetMosques = Object.values(allMosques).filter(m =>
      m.id !== mosque.id && m.country === mosque.country
    );
  } else if (scope === 'global') {
    targetMosques = Object.values(allMosques).filter(m => m.id !== mosque.id);
  }

  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  if (!dbData.events) dbData.events = {};
  const eventId = `event_${Date.now()}`;

  const mosqueApprovals = {};
  for (const tm of targetMosques) {
    mosqueApprovals[tm.id] = { name: tm.name, status: 'pending' };
  }

  dbData.events[eventId] = {
    id: eventId,
    mosqueId: mosque.id,
    mosqueName: mosque.name,
    title: eState.title,
    description: eState.description || '',
    date: eState.date,
    time: eState.time,
    scope,
    audience: eState.audience || [],
    audienceLabel: eState.audienceLabel || '🔓 الجميع',
    capacity: eState.capacity || 0,
    suggestedBy: userId,
    status: (scope === 'mosque') ? 'approved' : 'pending',
    proximityKm: proximityKmMap[scope] || null,
    mosqueApprovals,
    attendees: [],
    createdAt: new Date().toISOString()
  };
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));

  const scopeLabels = {
    mosque: 'مسجدي فقط',
    nearby: 'المجاورة',
    very_close: 'قريب جداً (10 كم)',
    close: 'قريب (30 كم)',
    medium: 'متوسط (60 كم)',
    far: 'بعيد (200 كم)',
    country: 'كل الدولة',
    global: 'كل المنصة'
  };

  const eventMsgBase =
    `🗓️ *فعالية جديدة*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 ${mosque.name}\n` +
    `📌 *${eState.title}*\n` +
    `📄 ${eState.description || ''}\n` +
    `📅 ${eState.date} ⏰ ${eState.time}\n` +
    `📡 ${scopeLabels[scope] || scope}`;

  if (scope === 'mosque' || (isProximityScope && targetMosques.length === 0)) {
    if (isProximityScope && targetMosques.length === 0) {
      await ctx.reply(
        `⚠️ لا توجد مساجد في هذا النطاق.\nتم نشر الفعالية لمصلي مسجدك فقط.`,
        { parse_mode: 'Markdown' }
      );
    }
    const allUsers = db.allUsers ? db.allUsers() : [];
    // إرسال لكل مصلي المسجد بما فيهم المدير نفسه
    const targets = allUsers.filter(u => {
      if (u.mosqueId !== mosque.id) return false;
      // فلترة حسب الجمهور
      if (eState.audience && eState.audience.length > 0) {
        return eState.audience.includes(u.role);
      }
      return true;
    });
    // إضافة المدير نفسه إذا لم يكن في القائمة
    const adminInList = targets.find(u => String(u.id) === userId);
    if (!adminInList) targets.push({ id: parseInt(userId), mosqueId: mosque.id, role: 'admin' });
    const msgText = eventMsgBase + `\n━━━━━━━━━━━━━━━━━━\n✋ للتسجيل في الفعالية اضغط الزر أدناه`;
    let sent = 0;
    for (const u of targets) {
      try {
        await ctx.telegram.sendMessage(u.id, msgText, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('✋ سأحضر', `ev_attend_${eventId}`)]])
        });
        sent++;
      } catch (e) {}
    }
    await ctx.reply(
      `✅ *تم إضافة الفعالية!*\n━━━━━━━━━━━━━━━━━━\n📌 ${eState.title}\n📅 ${eState.date} ⏰ ${eState.time}\n📨 أُشعر ${sent} مصلي`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]]) }
    );
  } else {
    for (const tm of targetMosques) {
      const adminId = tm.adminId || tm.createdBy;
      if (!adminId) continue;
      try {
        await ctx.telegram.sendMessage(
          adminId,
          eventMsgBase + `\n━━━━━━━━━━━━━━━━━━\nهل توافق على نشر هذه الفعالية لمصلي مسجدك؟`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[
              Markup.button.callback('✅ موافق', `ev_approve_mosque_${eventId}_${tm.id}`),
              Markup.button.callback('❌ رفض', `ev_reject_mosque_${eventId}_${tm.id}`)
            ]])
          }
        );
      } catch (e) {}
    }
    await ctx.reply(
      `✅ *تم إرسال طلب الفعالية!*\n━━━━━━━━━━━━━━━━━━\n📌 ${eState.title}\n📅 ${eState.date} ⏰ ${eState.time}\n📨 أُرسل لـ ${targetMosques.length} مسجد للموافقة\n⏳ في انتظار ردود المدراء`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('📊 حالة الموافقات', `ev_approvals_${eventId}`)]])
      }
    );
  }
}
async function handleApproveEvent(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const eventId = ctx.match[1];
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const ev = dbData.events?.[eventId];
  if (!ev) return ctx.reply('⚠️ الفعالية غير موجودة.');
  dbData.events[eventId].status = 'approved';
  dbData.events[eventId].updatedAt = new Date().toISOString();
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  if (ev.suggestedBy) {
    try { await ctx.telegram.sendMessage(ev.suggestedBy, `✅ تم قبول فعاليتك: *${ev.title}*`, { parse_mode: 'Markdown' }); } catch (e) {}
  }
  await ctx.editMessageText(`✅ تم قبول الفعالية: ${ev.title}`).catch(() => {});
}
async function handleRejectEvent(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const eventId = ctx.match[1];
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const ev = dbData.events?.[eventId];
  if (!ev) return ctx.reply('⚠️ الفعالية غير موجودة.');
  dbData.events[eventId].status = 'rejected';
  dbData.events[eventId].updatedAt = new Date().toISOString();
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  if (ev.suggestedBy) {
    try { await ctx.telegram.sendMessage(ev.suggestedBy, `❌ تم رفض فعاليتك: *${ev.title}*`, { parse_mode: 'Markdown' }); } catch (e) {}
  }
  await ctx.editMessageText(`❌ تم رفض الفعالية: ${ev.title}`).catch(() => {});
}

const complaintReplyState = {};
const complaintSubmitState = {};

async function handleComplaintTypeCallback(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const typeMap = {
    'complaint_maintenance': { label: '🔧 صيانة وأعطال', type: 'maintenance' },
    'complaint_behavior': { label: '🤝 شكوى سلوكية', type: 'behavior' },
    'complaint_admin': { label: '📢 شكوى إدارية', type: 'admin' },
    'complaint_suggestion': { label: '💡 اقتراح', type: 'suggestion' },
  };
  const selected = typeMap[ctx.callbackQuery.data];
  if (!selected) return;
  complaintSubmitState[userId] = { type: selected.type, typeLabel: selected.label, step: 'waiting_anonymous' };
  await ctx.reply(
    `${selected.label}\n━━━━━━━━━━━━━━━━━━\nهل تريد إرسالها بشكل مجهول؟`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🎭 مجهول الهوية', 'complaint_anon_yes')],
        [Markup.button.callback('👤 باسمي', 'complaint_anon_no')],
      ])
    }
  );
}

async function handleComplaintAnonCallback(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const state = complaintSubmitState[userId];
  if (!state) return;
  state.anonymous = ctx.callbackQuery.data === 'complaint_anon_yes';
  state.step = 'waiting_text';
  await ctx.reply(
    `✍️ أدخل نص ${state.typeLabel}:\n_(كن محدداً وواضحاً لنتمكن من المساعدة)_`,
    { parse_mode: 'Markdown' }
  );
}

async function handleComplaintSubmitInput(ctx, next) {
  const userId = String(ctx.from.id);
  const state = complaintSubmitState[userId];
  if (!state || state.step !== 'waiting_text' || !ctx.message?.text) return next();
  delete complaintSubmitState[userId];
  const text = ctx.message.text.trim();
  const user = db.getUser(userId);
  if (!user?.mosqueId) return ctx.reply('⚠️ أنت غير مرتبط بمسجد.');
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  if (!dbData.complaints) dbData.complaints = {};
  const existing = Object.values(dbData.complaints).find(c =>
    c.mosqueId === user.mosqueId &&
    c.type === state.type &&
    c.text.trim().toLowerCase() === text.toLowerCase() &&
    c.status !== 'resolved'
  );
  let complaintId;
  if (existing) {
    existing.repeatCount = (existing.repeatCount || 1) + 1;
    existing.lastReportedAt = new Date().toISOString();
    complaintId = existing.id;
    dbData.complaints[complaintId] = existing;
  } else {
    complaintId = `complaint_${Date.now()}`;
    dbData.complaints[complaintId] = {
      id: complaintId,
      mosqueId: user.mosqueId,
      userId,
      type: state.type,
      typeLabel: state.typeLabel,
      text,
      anonymous: state.anonymous,
      status: 'open',
      repeatCount: 1,
      createdAt: new Date().toISOString()
    };
  }
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  const mosque = db.getAllMosques()[user.mosqueId];
  const adminId = mosque?.adminId || mosque?.createdBy;
  if (adminId) {
    const isRepeat = existing && existing.repeatCount >= 3;
    const name = state.anonymous ? '🎭 مجهول' : `${user.firstName || ''} ${user.lastName || ''}`.trim();
    try {
      await ctx.telegram.sendMessage(
        adminId,
        `${isRepeat ? '🚨 *شكوى متكررة — أولوية قصوى!*' : '📩 *شكوى جديدة*'}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `${state.typeLabel}\n` +
        `👤 ${name}\n` +
        `📝 ${text}\n` +
        `${existing ? `🔁 تكررت ${existing.repeatCount} مرات` : ''}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[
            Markup.button.callback('💬 رد', `mc_reply_${complaintId}`),
            Markup.button.callback('✅ حل', `mc_resolve_${complaintId}`),
            Markup.button.callback('⚙️ قيد المعالجة', `mc_progress_${complaintId}`)
          ]])
        }
      );
    } catch (e) {}
  }
  await ctx.reply(
    `✅ *تم إرسال ${state.typeLabel}!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${state.anonymous ? '🎭 تم الإرسال بشكل مجهول' : '👤 تم الإرسال باسمك'}\n\n` +
    `سيصلك رد من إدارة المسجد قريباً 🔔`,
    { parse_mode: 'Markdown' }
  );
}

async function handleComplaintAction(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  if (data.startsWith('mc_reply_')) {
    const complaintId = data.replace('mc_reply_', '');
    complaintReplyState[userId] = { complaintId, action: 'reply' };
    return ctx.reply(
      `💬 *الرد على الشكوى*\n━━━━━━━━━━━━━━━━━━\nأدخل نص ردك:`,
      { parse_mode: 'Markdown' }
    );
  }
  if (data.startsWith('mc_resolve_')) {
    const complaintId = data.replace('mc_resolve_', '');
    complaintReplyState[userId] = { complaintId, action: 'resolve' };
    return ctx.reply(
      `✅ *إغلاق الشكوى*\n━━━━━━━━━━━━━━━━━━\nأدخل سبب الحل أو الإجراء المتخذ:`,
      { parse_mode: 'Markdown' }
    );
  }
  if (data.startsWith('mc_progress_')) {
    const complaintId = data.replace('mc_progress_', '');
    if (!dbData.complaints) dbData.complaints = {};
    if (dbData.complaints[complaintId]) {
      dbData.complaints[complaintId].status = 'in_progress';
      dbData.complaints[complaintId].updatedAt = new Date().toISOString();
      require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
      const c = dbData.complaints[complaintId];
      if (!c.anonymous && c.userId) {
        try {
          await ctx.telegram.sendMessage(
            c.userId,
            `⚙️ *تحديث على شكواك*\n━━━━━━━━━━━━━━━━━━\n📝 ${c.text}\n\nتم تحويل شكواك إلى *قيد المعالجة*.\nسيتواصل معك فريق المسجد قريباً.`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) {}
      }
      return ctx.reply(
        `⚙️ *تم تحديث الحالة*\n━━━━━━━━━━━━━━━━━━\nالشكوى الآن *قيد المعالجة*.`,
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 الشكاوى', 'ma_open_complaints')]]) }
      );
    }
    return ctx.reply('⚠️ الشكوى غير موجودة.');
  }
}

async function handleComplaintReplyInput(ctx, next) {
  const userId = String(ctx.from.id);
  const state = complaintReplyState[userId];
  if (!state) return next();
  const text = ctx.message?.text?.trim();
  if (!text) return ctx.reply('⚠️ أدخل نصاً صحيحاً.');
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  if (!dbData.complaints?.[state.complaintId]) {
    delete complaintReplyState[userId];
    return ctx.reply('⚠️ الشكوى غير موجودة.');
  }
  if (state.action === 'resolve') {
    dbData.complaints[state.complaintId].status = 'resolved';
    dbData.complaints[state.complaintId].reply = text;
    dbData.complaints[state.complaintId].resolvedAt = new Date().toISOString();
    dbData.complaints[state.complaintId].updatedAt = new Date().toISOString();
  } else {
    dbData.complaints[state.complaintId].reply = text;
    dbData.complaints[state.complaintId].status = 'in_progress';
    dbData.complaints[state.complaintId].repliedAt = new Date().toISOString();
    dbData.complaints[state.complaintId].updatedAt = new Date().toISOString();
  }
  const c = dbData.complaints[state.complaintId];
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  delete complaintReplyState[userId];
  if (state.action === 'reply') {
    if (!c.anonymous && c.userId) {
      try {
        await ctx.telegram.sendMessage(
          c.userId,
          `💬 *رد على شكواك*\n━━━━━━━━━━━━━━━━━━\n📝 شكواك:\n${c.text}\n\n💬 الرد:\n${text}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }
    return ctx.reply(
      `✅ *تم إرسال الرد*\n━━━━━━━━━━━━━━━━━━\n💬 ${text}`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 الشكاوى', 'ma_open_complaints')]]) }
    );
  }
  if (state.action === 'resolve') {
    if (!c.anonymous && c.userId) {
      try {
        await ctx.telegram.sendMessage(
          c.userId,
          `✅ *تم حل شكواك*\n━━━━━━━━━━━━━━━━━━\n📝 ${c.text}\n\n💬 ${text}`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }
    return ctx.reply(
      `✅ *تم إغلاق الشكوى*\n━━━━━━━━━━━━━━━━━━\n💬 ${text}`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 الشكاوى', 'ma_complaints')]]) }
    );
  }
  delete complaintReplyState[userId];
  return next();
}

const manualAmountState = {};

async function handleConfirmRemove(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const targetId = ctx.match[1];
  const roles = db.getMosqueRoles(mosque.id);
  const memberData = roles[targetId];
  if (!memberData) return ctx.reply('⚠️ العضو غير موجود.');
  const user = db.getUser(targetId);
  const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || targetId : targetId;
  await ctx.reply(
    `⚠️ *تأكيد الإزالة*\n━━━━━━━━━━━━━━━━━━\n👤 ${name}\n🏷️ ${memberData.role}\n\nهل أنت متأكد؟`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[
      Markup.button.callback('✅ نعم، أزل العضو', `ma_do_remove_${targetId}`),
      Markup.button.callback('❌ إلغاء', 'ma_team')
    ]]) }
  );
}

async function handleDoRemove(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const targetId = ctx.match[1];
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  if (dbData.mosque_roles?.[mosque.id]?.[targetId]) {
    delete dbData.mosque_roles[mosque.id][targetId];
    require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  }
  try {
    await ctx.telegram.sendMessage(targetId, `ℹ️ تم إزالتك من فريق *${mosque.name}*.`, { parse_mode: 'Markdown' });
  } catch (e) {}
  await ctx.reply(
    `✅ *تمت الإزالة بنجاح*\n👤 ID: ${targetId}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('👥 عودة للفريق', 'ma_team')]]) }
  );
}

async function handlePickCampaign(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const campaignId = ctx.match[1];
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const campaign = dbData.campaigns?.[campaignId];
  if (!campaign) return ctx.reply('⚠️ الحملة غير موجودة.');
  manualAmountState[userId] = { campaignId };
  const bar = buildProgressBar(campaign.collectedAmount || 0, campaign.targetAmount);
  await ctx.reply(
    `➕ *إضافة مبلغ يدوي*\n━━━━━━━━━━━━━━━━━━\n📌 ${campaign.title}\n${bar}\n💶 ${campaign.collectedAmount || 0}€ من ${campaign.targetAmount}€\n━━━━━━━━━━━━━━━━━━\nأدخل المبلغ باليورو:`,
    { parse_mode: 'Markdown' }
  );
}

async function handleManualAmountInput(ctx, next) {
  const userId = String(ctx.from.id);
  const state = manualAmountState[userId];
  if (!state) return next();
  const amount = parseFloat(ctx.message?.text?.trim().replace(',', '.'));
  if (!amount || isNaN(amount) || amount <= 0) return ctx.reply('⚠️ أدخل مبلغاً صحيحاً.');
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const campaign = dbData.campaigns?.[state.campaignId];
  if (!campaign) { delete manualAmountState[userId]; return ctx.reply('⚠️ الحملة غير موجودة.'); }
  campaign.collectedAmount = (campaign.collectedAmount || 0) + amount;
  if (!campaign.manualEntries) campaign.manualEntries = [];
  campaign.manualEntries.push({ amount, addedBy: userId, addedAt: new Date().toISOString() });
  if (campaign.collectedAmount >= campaign.targetAmount) campaign.status = 'completed';
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  delete manualAmountState[userId];
  const bar = buildProgressBar(campaign.collectedAmount, campaign.targetAmount);
  await ctx.reply(
    `✅ *تم إضافة المبلغ!*\n━━━━━━━━━━━━━━━━━━\n📌 ${campaign.title}\n➕ ${amount}€\n${bar}\n💶 ${campaign.collectedAmount}€ من ${campaign.targetAmount}€\n${campaign.status === 'completed' ? '\n🎉 *تم اكتمال الحملة!*' : ''}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[
      Markup.button.callback('➕ إضافة مبلغ آخر', 'ma_manual_amount'),
      Markup.button.callback('💰 المالية', 'ma_finance')
    ]]) }
  );
}

async function handleEventMosqueApproval(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data;
  const isApprove = data.startsWith('ev_approve_mosque_');
  const action = isApprove ? 'approve' : 'reject';
  const rest = data.replace('ev_approve_mosque_', '').replace('ev_reject_mosque_', '');
  const lastUnderscore = rest.lastIndexOf('_');
  const eventId = rest.substring(0, lastUnderscore);
  const mosqueidResponding = rest.substring(lastUnderscore + 1);
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const ev = dbData.events?.[eventId];
  if (!ev) return ctx.reply('⚠️ الفعالية غير موجودة.');
  const status = action === 'approve' ? 'approved' : 'rejected';
  if (dbData.events[eventId].mosqueApprovals?.[mosqueidResponding]) {
    dbData.events[eventId].mosqueApprovals[mosqueidResponding].status = status;
    dbData.events[eventId].mosqueApprovals[mosqueidResponding].respondedAt = new Date().toISOString();
  }
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  const respondingMosque = db.getAllMosques()[mosqueidResponding];
  // إشعار مطلق الفعالية
  try {
    await ctx.telegram.sendMessage(
      ev.suggestedBy,
      `🔔 *تحديث موافقات الفعالية*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📌 ${ev.title}\n` +
      `🕌 ${respondingMosque?.name || mosqueidResponding}: ${action === 'approve' ? '✅ وافق' : '❌ رفض'}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('📊 حالة الموافقات', `ev_approvals_${eventId}`)
        ]])
      }
    );
  } catch (e) {}
  if (action === 'approve') {
    const allUsers = db.allUsers ? db.allUsers() : [];
    const targets = allUsers.filter(u => u.mosqueId === mosqueidResponding);
    const eventMsg =
      `🗓️ *فعالية قادمة*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🕌 ${ev.mosqueName}\n` +
      `📌 *${ev.title}*\n` +
      `📄 ${ev.description || ''}\n` +
      `📅 ${ev.date} ⏰ ${ev.time}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✋ للتسجيل في الفعالية اضغط الزر أدناه`;
    for (const u of targets) {
      try {
        await ctx.telegram.sendMessage(u.id, eventMsg, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('✋ سأحضر', `ev_attend_${eventId}`)]])
        });
      } catch (e) {}
    }
    await ctx.editMessageText(`✅ وافقت على الفعالية: ${ev.title}\nتم إشعار مصلي مسجدك`).catch(() => {});
  } else {
    await ctx.editMessageText(`❌ رفضت الفعالية: ${ev.title}`).catch(() => {});
  }
}
async function handleEventApprovalsStatus(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const eventId = ctx.callbackQuery.data.replace('ev_approvals_', '');
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const ev = dbData.events?.[eventId];
  if (!ev) return ctx.reply('⚠️ الفعالية غير موجودة.');
  const approvals = ev.mosqueApprovals || {};
  const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌' };
  const approved = Object.values(approvals).filter(a => a.status === 'approved').length;
  const rejected = Object.values(approvals).filter(a => a.status === 'rejected').length;
  const pending = Object.values(approvals).filter(a => a.status === 'pending').length;
  const list = Object.keys(approvals).length === 0
    ? '_لا توجد مساجد مستهدفة_'
    : Object.entries(approvals).map(([mid, data]) =>
        `${statusEmoji[data.status] || '⏳'} ${data.name}`
      ).join('\n');
  await ctx.reply(
    `📊 *حالة موافقات الفعالية*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 ${ev.title}\n` +
    `📅 ${ev.date} ⏰ ${ev.time}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✅ وافق: ${approved}\n` +
    `❌ رفض: ${rejected}\n` +
    `⏳ لم يرد: ${pending}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${list}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✋ المسجلون: ${(ev.attendees || []).length}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'ma_announcements')]]) }
  );
}
async function handleEventAudienceCallback(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const eState = eventState[userId];
  if (!eState || eState.step !== 'waiting_audience') return;
  const audMap = {
    'ev_aud_all': { label: '🔓 الجميع', roles: [] },
    'ev_aud_admin': { label: '🔐 الفريق الإداري', roles: ['admin', 'religious', 'finance', 'logistics', 'state'] },
    'ev_aud_sheikh': { label: '👨‍🏫 المشايخ', roles: ['sheikh', 'khatib', 'muadhin', 'quran_teacher', 'hifz_teacher', 'general'] },
    'ev_aud_staff': { label: '🎯 الإداريون والمشايخ', roles: ['admin', 'religious', 'finance', 'logistics', 'state', 'sheikh', 'khatib', 'muadhin', 'quran_teacher', 'hifz_teacher', 'general'] },
  };
  const aud = audMap[ctx.callbackQuery.data] || audMap['ev_aud_all'];
  eState.audience = aud.roles;
  eState.audienceLabel = aud.label;
  eState.step = 'waiting_date';
  await ctx.reply(
    `✅ الجمهور: ${aud.label}\n\n📅 أدخل تاريخ الفعالية:\n_(مثال: 2026-07-15)_`,
    { parse_mode: 'Markdown' }
  );
}
async function handleEventAttend(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const eventId = ctx.callbackQuery.data.replace('ev_attend_', '');
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const ev = dbData.events?.[eventId];
  if (!ev) return ctx.reply('⚠️ الفعالية غير موجودة.');
  // التحقق من الجمهور المسموح له
  const user = db.getUser(userId);
  if (ev.audience && ev.audience.length > 0) {
    const userRole = user?.role || 'worshipper';
    if (!ev.audience.includes(userRole)) {
      return ctx.reply(
        `⛔ *هذه الفعالية مخصصة لـ ${ev.audienceLabel}*\n` +
        `لا يمكنك التسجيل فيها.`,
        { parse_mode: 'Markdown' }
      );
    }
  }
  // التحقق من الطاقة الاستيعابية
  if (ev.capacity > 0 && (ev.attendees || []).length >= ev.capacity) {
    return ctx.reply(
      `⚠️ *اكتملت أماكن هذه الفعالية!*\n` +
      `الطاقة الاستيعابية: ${ev.capacity} شخص`,
      { parse_mode: 'Markdown' }
    );
  }
  if (!dbData.events[eventId].attendees) dbData.events[eventId].attendees = [];
  if (dbData.events[eventId].attendees.includes(userId)) {
    dbData.events[eventId].attendees = dbData.events[eventId].attendees.filter(id => id !== userId);
    require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    return ctx.reply(`❌ تم إلغاء تسجيلك في: *${ev.title}*`, { parse_mode: 'Markdown' });
  }
  dbData.events[eventId].attendees.push(userId);
  require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
  const name = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : userId;
  try {
    await ctx.telegram.sendMessage(
      ev.suggestedBy,
      `✋ *تسجيل جديد في فعاليتك*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📌 ${ev.title}\n` +
      `👤 ${name}\n` +
      `👥 إجمالي المسجلين: ${dbData.events[eventId].attendees.length}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  const remaining = ev.capacity > 0
    ? `\n🪑 الأماكن المتبقية: ${ev.capacity - dbData.events[eventId].attendees.length}`
    : '';
  await ctx.reply(
    `✅ *تم تسجيلك في الفعالية!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 ${ev.title}\n` +
    `📅 ${ev.date} ⏰ ${ev.time}\n` +
    `🕌 ${ev.mosqueName}\n` +
    `👥 ${ev.audienceLabel || '🔓 الجميع'}${remaining}\n\n` +
    `هل تريد مشاركة الفعالية مع أصدقائك في المسجد؟`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📢 شارك الفعالية', `ev_share_${eventId}`)],
        [Markup.button.callback('لا شكراً', 'ev_share_skip')]
      ])
    }
  );
}

async function handleEventShare(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const data = ctx.callbackQuery.data;
  if (data === 'ev_share_skip') {
    return ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  }
  const eventId = data.replace('ev_share_', '');
  const dbPath = require('path').join(__dirname, '../../data/db.json');
  const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
  const ev = dbData.events?.[eventId];
  if (!ev) return;
  // جلب مصلي نفس المسجد الذين لم يسجلوا بعد
  const allUsers = db.allUsers ? db.allUsers() : [];
  const userId = String(ctx.from.id);
  const user = db.getUser(userId);
  const targets = allUsers.filter(u =>
    u.mosqueId === ev.mosqueId &&
    u.id !== parseInt(userId) &&
    !(ev.attendees || []).includes(String(u.id))
  );
  const shareMsg =
    `🌟 *دعوة لحضور فعالية*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 *${ev.title}*\n` +
    `📄 ${ev.description || ''}\n` +
    `📅 ${ev.date} ⏰ ${ev.time}\n` +
    `🕌 ${ev.mosqueName}\n` +
    `👥 ${ev.audienceLabel || '🔓 الجميع'}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✋ ${user?.firstName || 'أحد المصلين'} يدعوك للحضور!`;
  let sent = 0;
  for (const u of targets) {
    try {
      await ctx.telegram.sendMessage(u.id, shareMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✋ سأحضر', `ev_attend_${eventId}`)
        ]])
      });
      sent++;
    } catch (e) {}
  }
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  await ctx.reply(
    `✅ تم مشاركة الفعالية مع ${sent} مصلي 🎉`,
    { parse_mode: 'Markdown' }
  );
}

registry.register(/^mc_reply_/, handleComplaintAction);
registry.register(/^mc_resolve_/, handleComplaintAction);
registry.register(/^mc_progress_/, handleComplaintAction);

// ═══════════════════════════════════════
// إدارة الشارات اليدوية — MODERATOR/DEVELOPER
// ═══════════════════════════════════════
async function showManageMosquePanel(ctx, mosqueId) {
  await ctx.answerCbQuery().catch(() => {});
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque) return ctx.answerCbQuery('❌ المسجد غير موجود');
  const { getBadgesDisplay } = require('../utils/mosqueBadges');
  const badges = getBadgesDisplay(mosqueId);
  const status = mosque.active === false ? 'موقوف' : 'نشط';
  const text =
    `🕌 *${mosque.name}*\n` +
    `📍 ${mosque.city || mosque.location || '—'} — ${mosque.country || ''}\n` +
    `📌 الحالة: ${status}\n` +
    (badges ? `🏷️ الشارات: ${badges}\n` : '') +
    `\nاختر إجراء:`;
  const keyboard = [
    [{ text: '🏷️ إدارة الشارات', callback_data: `badge_panel_${mosqueId}` }],
    [{ text: '🔙 رجوع', callback_data: 'dev_panel' }]
  ];
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } };
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, opts).catch(() => ctx.reply(text, opts));
  } else {
    await ctx.reply(text, opts);
  }
}

async function showMosqueBadgePanel(ctx, mosqueId) {
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque) return ctx.answerCbQuery('❌ المسجد غير موجود');
  const { getBadgesDisplay, formatRejectionBadge } = require('../utils/mosqueBadges');
  const badges = getBadgesDisplay(mosqueId);
  const rejection = formatRejectionBadge(mosqueId, true); // للمطور النص الكامل
  const manualBadges = mosque.badges?.manual || [];
  const text = `
🏷️ *إدارة شارات المسجد*
🕌 ${mosque.name}
${badges ? `الشارات الحالية: ${badges}` : 'لا توجد شارات حالياً'}
${rejection ? `\n${rejection}` : ''}
*الشارات اليدوية:*
⭐ متميز — ${manualBadges.includes('⭐') ? '✅ ممنوحة' : '❌ غير ممنوحة'}
🏅 معتمد — ${manualBadges.includes('🏅') ? '✅ ممنوحة' : '❌ غير ممنوحة'}
🌍 مجتمعي — ${manualBadges.includes('🌍') ? '✅ ممنوحة' : '❌ غير ممنوحة'}
`;
  const keyboard = [
    [
      { text: manualBadges.includes('⭐') ? '❌ سحب ⭐ متميز' : '✅ منح ⭐ متميز', callback_data: `badge_toggle_⭐_${mosqueId}` },
    ],
    [
      { text: manualBadges.includes('🏅') ? '❌ سحب 🏅 معتمد' : '✅ منح 🏅 معتمد', callback_data: `badge_toggle_🏅_${mosqueId}` },
    ],
    [
      { text: manualBadges.includes('🌍') ? '❌ سحب 🌍 مجتمعي' : '✅ منح 🌍 مجتمعي', callback_data: `badge_toggle_🌍_${mosqueId}` },
    ],
    [{ text: '🔙 رجوع', callback_data: `manage_mosque_${mosqueId}` }]
  ];
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
  await ctx.answerCbQuery();
}

async function handleBadgeToggle(ctx, badge, mosqueId) {
  const { grantManualBadge, revokeManualBadge, getBadgesDisplay } = require('../utils/mosqueBadges');
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque) return ctx.answerCbQuery('❌ المسجد غير موجود');
  const manualBadges = mosque.badges?.manual || [];
  const hasBadge = manualBadges.includes(badge);
  if (hasBadge) {
    revokeManualBadge(mosqueId, badge);
    await ctx.answerCbQuery(`✅ تم سحب ${badge}`);
  } else {
    grantManualBadge(mosqueId, badge);
    await ctx.answerCbQuery(`✅ تم منح ${badge}`);
  }
  // أعد تحميل اللوحة
  await showMosqueBadgePanel(ctx, mosqueId);
}

registry.register(/^manage_mosque_(.+)$/, async (ctx) => {
  const user = db.getUser(String(ctx.from.id));
  if (!['DEVELOPER', 'MODERATOR', 'developer', 'moderator'].includes(user?.role) && !db.isDeveloper(ctx.from.id)) {
    return ctx.answerCbQuery('❌ غير مصرح');
  }
  await showManageMosquePanel(ctx, ctx.match[1]);
});

// ===== المتطوعون الدعويون =====
async function maVolunteers(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const allVolunteers = db.get('volunteers') || {};
  const mosqueVolunteers = Object.values(allVolunteers).filter(v => v.mosqueId === mosque.id);
  const pending = mosqueVolunteers.filter(v => !v.active && !v.rejectedByAdmin && !v.adminApproved);
  const active = mosqueVolunteers.filter(v => v.active);
  const total = mosqueVolunteers.length;
  const VOLUNTEER_TYPES = {
    shahada_witness: '🕌 شاهد على الشهادة',
    new_muslim_companion: '🤝 مرافق مسلم جديد',
    dawah_chat: '💬 محادثة دعوية',
    islam_teacher: '📚 تعليم أساسيات الإسلام'
  };
  const VOLUNTEER_LANGUAGES = {
    ar: '🇸🇦', de: '🇩🇪', en: '🇬🇧', fr: '🇫🇷',
    tr: '🇹🇷', ru: '🇷🇺', ur: '🇵🇰', id: '🇮🇩'
  };
  let text = `🤝 *المتطوعون الدعويون*\n`;
  text += `🕌 ${mosque.name}\n`;
  text += `━━━━━━━━━━━━━━━━━━\n`;
  text += `⏳ طلبات جديدة: ${pending.length}\n`;
  text += `✅ متطوعون نشطون: ${active.length}\n`;
  text += `📊 الإجمالي: ${total}\n`;
  text += `━━━━━━━━━━━━━━━━━━\n`;
  const buttons = [];
  if (pending.length > 0) {
    text += `\n*⏳ طلبات تنتظر موافقتك:*\n\n`;
    pending.forEach((vol, i) => {
      const langs = vol.languages.map(l => VOLUNTEER_LANGUAGES[l] || l).join('');
      const types = vol.types.map(t => VOLUNTEER_TYPES[t] || t).join('، ');
      text += `${i + 1}. *${vol.name}*\n`;
      text += `   ${langs}\n`;
      text += `   ${types}\n\n`;
      buttons.push([
        { text: `✅ قبول ${vol.name}`, callback_data: `ma_vol_approve_${vol.userId}` },
        { text: `❌ رفض`, callback_data: `ma_vol_reject_${vol.userId}` }
      ]);
    });
  }
  if (active.length > 0) {
    text += `\n*✅ المتطوعون النشطون:*\n\n`;
    active.forEach((vol, i) => {
      const langs = vol.languages.map(l => VOLUNTEER_LANGUAGES[l] || l).join('');
      const served = vol.totalServed || 0;
      text += `${i + 1}. *${vol.name}* ${langs} — خدم: ${served}\n`;
      buttons.push([
        { text: `⏸️ إيقاف ${vol.name}`, callback_data: `ma_vol_pause_${vol.userId}` }
      ]);
    });
  }
  if (total === 0) {
    text += `\n_لا يوجد متطوعون بعد في مسجدك_`;
  }
  buttons.push([{ text: '🔙 رجوع للوحة الرئيسية', callback_data: 'mosque_admin_panel' }]);
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  }).catch(async () => {
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });
}

async function maVolunteerApprove(ctx, volunteerId) {
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const db_data = db.get('volunteers') || {};
  const vol = db_data[volunteerId];
  if (!vol || vol.mosqueId !== mosque.id) {
    await ctx.answerCbQuery('❌ غير مسموح', { show_alert: true });
    return;
  }
  vol.adminApproved = true;
  vol.adminApprovedBy = userId;
  vol.adminApprovedAt = new Date().toISOString();
  db.set('volunteers', db_data);
  const users = db.get('users') || {};
  const devAndMods = Object.entries(users).filter(([, u]) =>
    u.role === 'DEVELOPER' || u.role === 'MODERATOR' ||
    u.role === 'developer' || u.role === 'moderator'
  );
  const VOLUNTEER_TYPES = {
    shahada_witness: '🕌 شاهد على الشهادة',
    new_muslim_companion: '🤝 مرافق مسلم جديد',
    dawah_chat: '💬 محادثة دعوية',
    islam_teacher: '📚 تعليم أساسيات الإسلام'
  };
  const VOLUNTEER_LANGUAGES = {
    ar: '🇸🇦', de: '🇩🇪', en: '🇬🇧', fr: '🇫🇷',
    tr: '🇹🇷', ru: '🇷🇺', ur: '🇵🇰', id: '🇮🇩'
  };
  for (const [devId, dev] of devAndMods) {
    try {
      await ctx.telegram.sendMessage(
        dev.id || devId,
        `🤝 *متطوع دعوي — يحتاج موافقتك النهائية*\n\n` +
        `الاسم: *${vol.name}*\n` +
        `المسجد: *${mosque.name}* — ${mosque.city}\n` +
        `أنواع التطوع:\n${vol.types.map(t => VOLUNTEER_TYPES[t] || t).join('\n')}\n` +
        `اللغات: ${vol.languages.map(l => VOLUNTEER_LANGUAGES[l] || l).join(' ')}\n\n` +
        `✅ وافق عليه مدير المسجد`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ موافقة نهائية', callback_data: `dev_vol_approve_${volunteerId}` },
                { text: '❌ رفض', callback_data: `dev_vol_reject_${volunteerId}` }
              ]
            ]
          }
        }
      );
    } catch (e) {}
  }
  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '⏳ *تمت موافقة مدير مسجدك على طلبك!*\n\n' +
      'الطلب الآن قيد المراجعة النهائية من إدارة المنصة.\n' +
      'سنخطرك فور الموافقة إن شاء الله. 🌟',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.answerCbQuery('✅ تمت الموافقة — أُرسل للمراجعة النهائية', { show_alert: true });
  await maVolunteers(ctx);
}

async function maVolunteerReject(ctx, volunteerId) {
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const db_data = db.get('volunteers') || {};
  const vol = db_data[volunteerId];
  if (!vol) return;
  vol.rejectedByAdmin = true;
  vol.active = false;
  db.set('volunteers', db_data);
  try {
    await ctx.telegram.sendMessage(
      volunteerId,
      '❌ *نأسف، لم يتم قبول طلب تطوعك من مدير المسجد.*\n\n' +
      'يمكنك التواصل معه لمعرفة السبب.',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.answerCbQuery('تم رفض الطلب', { show_alert: true });
  await maVolunteers(ctx);
}

async function maVolunteerPause(ctx, volunteerId) {
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;
  const db_data = db.get('volunteers') || {};
  const vol = db_data[volunteerId];
  if (!vol || vol.mosqueId !== mosque.id) {
    await ctx.answerCbQuery('❌ غير مسموح', { show_alert: true });
    return;
  }
  vol.active = !vol.active;
  db.set('volunteers', db_data);
  const status = vol.active ? 'مفعّل ✅' : 'موقوف مؤقتاً ⏸️';
  await ctx.answerCbQuery(`المتطوع الآن: ${status}`, { show_alert: true });
  await maVolunteers(ctx);
}

registry.register('ma_volunteers', async (ctx) => {
  await maVolunteers(ctx);
});
registry.register(/^ma_vol_approve_(\d+)$/, async (ctx) => {
  await maVolunteerApprove(ctx, ctx.match[1]);
});
registry.register(/^ma_vol_reject_(\d+)$/, async (ctx) => {
  await maVolunteerReject(ctx, ctx.match[1]);
});
registry.register(/^ma_vol_pause_(\d+)$/, async (ctx) => {
  await maVolunteerPause(ctx, ctx.match[1]);
});

// ===== متطوعو التسميع والتصحيح =====
const {
  handleRecVolMaApprove,
  handleRecVolMaReject
} = require('./recitationVolunteers');

function formatRecVolContact(vol) {
  return vol.contact?.type === 'whatsapp'
    ? `واتساب (${vol.contact.value || '—'})`
    : 'عبر البوت';
}

async function maRecVolunteers(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const allVolunteers = Object.values(loadDB().recitation_volunteers || {});
  const mosqueVolunteers = allVolunteers.filter((v) => String(v.mosqueId) === String(mosque.id));
  const pending = mosqueVolunteers.filter((v) => v.status === 'pending');
  const active = mosqueVolunteers.filter((v) => v.status === 'approved' && v.active !== false);
  const rejected = mosqueVolunteers.filter((v) => v.status === 'rejected');
  const total = mosqueVolunteers.length;

  let text = `🎙️ *متطوعو التسميع والتصحيح*\n`;
  text += `🕌 ${mosque.name}\n`;
  text += `━━━━━━━━━━━━━━━━━━\n`;
  text += `⏳ معلّق: ${pending.length}\n`;
  text += `✅ نشط: ${active.length}\n`;
  text += `❌ مرفوض: ${rejected.length}\n`;
  text += `📊 الإجمالي: ${total}\n`;
  text += `━━━━━━━━━━━━━━━━━━\n`;

  const buttons = [];

  if (pending.length > 0) {
    text += `\n*⏳ طلبات تنتظر موافقتك:*\n\n`;
    pending.forEach((vol, i) => {
      text += `${i + 1}. *${vol.name}*\n`;
      text += `   📞 ${formatRecVolContact(vol)}\n\n`;
      buttons.push([
        { text: `✅ قبول ${vol.name}`, callback_data: `ma_rec_vol_approve_${vol.userId}` },
        { text: `❌ رفض`, callback_data: `ma_rec_vol_reject_${vol.userId}` }
      ]);
    });
  }

  if (active.length > 0) {
    text += `\n*✅ المتطوعون النشطون:*\n\n`;
    active.forEach((vol, i) => {
      text += `${i + 1}. *${vol.name}* — ${formatRecVolContact(vol)}\n`;
      buttons.push([
        { text: `⏸️ إيقاف ${vol.name}`, callback_data: `ma_rec_vol_pause_${vol.userId}` }
      ]);
    });
  }

  if (rejected.length > 0) {
    text += `\n*❌ المرفوضون:*\n\n`;
    rejected.forEach((vol, i) => {
      text += `${i + 1}. *${vol.name}* — ${formatRecVolContact(vol)}\n`;
    });
  }

  if (total === 0) {
    text += `\n_لا يوجد متطوعو تسميع بعد في مسجدك_`;
  }

  buttons.push([{ text: '🔙 رجوع للوحة الرئيسية', callback_data: 'mosque_admin_panel' }]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  }).catch(async () => {
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });
}

async function maRecVolunteerApprove(ctx, volunteerId) {
  await handleRecVolMaApprove(ctx, volunteerId);
  await maRecVolunteers(ctx);
}

async function maRecVolunteerReject(ctx, volunteerId) {
  await handleRecVolMaReject(ctx, volunteerId);
  await maRecVolunteers(ctx);
}

async function maRecVolunteerPause(ctx, volunteerId) {
  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) return;

  const dbRaw = loadDB();
  const vol = dbRaw.recitation_volunteers?.[volunteerId];
  if (!vol || String(vol.mosqueId) !== String(mosque.id)) {
    await ctx.answerCbQuery('❌ غير مسموح', { show_alert: true });
    return;
  }

  vol.active = !vol.active;
  saveDB(dbRaw);

  const user = db.getUser(volunteerId);
  if (user) {
    db.saveUser(volunteerId, { availableForRecitation: vol.active });
  }

  const status = vol.active ? 'مفعّل ✅' : 'موقوف مؤقتاً ⏸️';
  await ctx.answerCbQuery(`المتطوع الآن: ${status}`, { show_alert: true });
  await maRecVolunteers(ctx);
}

registry.register('ma_rec_volunteers', async (ctx) => {
  await maRecVolunteers(ctx);
});
registry.register(/^ma_rec_vol_approve_(\d+)$/, async (ctx) => {
  await maRecVolunteerApprove(ctx, ctx.match[1]);
});
registry.register(/^ma_rec_vol_reject_(\d+)$/, async (ctx) => {
  await maRecVolunteerReject(ctx, ctx.match[1]);
});
registry.register(/^ma_rec_vol_pause_(\d+)$/, async (ctx) => {
  await maRecVolunteerPause(ctx, ctx.match[1]);
});

async function handleUnionRegistrationInput(ctx, bot) {
  // ── معالجة رقم الاتحاد ───────────────────────
  const sessions = db.get('sessions') || {};
  const session = sessions[ctx.from.id];
  if (session?.step !== 'awaiting_union_number') return false;

  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  if (session.startedAt && (Date.now() - session.startedAt) > SESSION_TIMEOUT_MS) {
    delete sessions[ctx.from.id];
    db.set('sessions', sessions);
    return false;
  }

  const mosqueId = session.mosqueId;
  const input = ctx.message.text.trim();
  const validPattern = /^[A-Za-z]{2,10}-\d{2,6}(-\d+)?$/;
  if (!validPattern.test(input)) {
    await ctx.reply(
      `❌ صيغة الرقم غير صحيحة\n\n` +
      `الصيغة الصحيحة: \`DITIB-1234\` أو \`ZMD-2024-5678\`\n\n` +
      `حاول مرة أخرى:`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }
  const mosques = db.get('mosques') || {};
  if (mosques[mosqueId]) {
    mosques[mosqueId].unionRegistrationNumber = input;
    mosques[mosqueId].unionRegistrationStatus = 'pending';
    db.set('mosques', mosques);
  }
  delete sessions[ctx.from.id];
  db.set('sessions', sessions);
  await ctx.reply(
    `✅ *تم إرسال طلب التحقق*\n\n` +
    `رقم التسجيل: \`${input}\`\n` +
    `الحالة: ⏳ قيد المراجعة\n\n` +
    `سيتم إشعارك عند الموافقة`,
    { parse_mode: 'Markdown' }
  );
  const devId = process.env.DEVELOPER_CHAT_ID ||
    (process.env.DEVELOPER_IDS || '').split(',')[0]?.trim();
  const mosque = mosques[mosqueId];
  const telegram = bot?.telegram || ctx.telegram;
  if (devId) {
    await telegram.sendMessage(devId,
      `🏅 *طلب تحقق اتحاد رسمي*\n\n` +
      `🕌 ${mosque?.name}\n` +
      `📍 ${mosque?.city || ''}\n` +
      `🔢 رقم التسجيل: \`${input}\`\n\n` +
      `هل تؤكد منح شارة 🏅 معتمد؟`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ منح 🏅', callback_data: `badge_grant_🏅_${mosqueId}` },
            { text: '❌ رفض', callback_data: `badge_ignore_🏅_${mosqueId}` }
          ]]
        }
      }
    ).catch(() => {});
  }
  return true;
}

module.exports = {
  mosqueAdminPanel, maTeam, maSheikhs, maSheikhAssign,
  maAnnouncements, maFinance, maLogistics, maComplaints,
  maNearby, maStats, maPlatform, maEmergency,
  maVolunteers, maVolunteerApprove, maVolunteerReject, maVolunteerPause,
  handleEmergencyContent, emergencyState,
  handleConfirmRemove, handleDoRemove,
  handlePickCampaign, handleManualAmountInput,
  handleAnnouncementAndEventInput, handleEventScopeCallback,
  handleApproveEvent, handleRejectEvent,
  handleEventMosqueApproval, handleEventApprovalsStatus,
  handleEventAttend, handleEventAudienceCallback, handleEventShare,
  handleComplaintAction, handleComplaintReplyInput,
  handleComplaintTypeCallback, handleComplaintAnonCallback, handleComplaintSubmitInput,
  complaintSubmitState,
  manualAmountState, complaintReplyState, announcementState, eventState,
  showMosqueBadgePanel,
  handleBadgeToggle,
  showManageMosquePanel,
  handleUnionRegistrationInput
};

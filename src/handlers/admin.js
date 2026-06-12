const db = require('../database');
const { ROLES, ROLE_LABELS } = require('../keyboards');
const { Markup } = require('telegraf');

const PRAYER_ICONS = ['🌙', '☀️', '🌤️', '🌇', '🌑'];
const PRAYER_NAMES = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

async function adminPanel(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية.');
  }
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('👨‍🏫 إدارة المشايخ', 'admin_sheikhs'), Markup.button.callback('💰 إدارة التبرعات', 'admin_donations')],
    [Markup.button.callback('🆘 طلبات المساعدة', 'admin_help_requests'), Markup.button.callback('📊 الإحصائيات', 'admin_stats')],
    [Markup.button.callback('🏛️ معلومات المسجد', 'admin_mosque_info'), Markup.button.callback('👥 إدارة المستخدمين', 'admin_users')]
  ]);
  const text = '🔐 *لوحة تحكم المسجد*\n\nاختر الخيار المطلوب:';
  if (ctx.callbackQuery) return ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
}

async function manageSheikhs(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.reply('⛔ ليس لديك صلاحية.');
  const sheikhs = db.allSheikhs();
  const buttons = [];
  let msg = `👨‍🏫 *قائمة المشايخ* (${sheikhs.length})\n\n`;
  if (!sheikhs.length) {
    msg = '👨‍🏫 *قائمة المشايخ*\n\nلا يوجد مشايخ مضافون حالياً.';
  } else {
    for (const sheikh of sheikhs) {
      msg += `📖 *${sheikh.name}*\n   التخصص: ${sheikh.specialty || 'متعدد'}\n   الهاتف: ${sheikh.phone || 'غير محدد'}\n\n`;
      buttons.push([Markup.button.callback(`🗑️ حذف ${sheikh.name}`, `sheikh_delete_${sheikh.id}`)]);
    }
  }
  buttons.push([Markup.button.callback('➕ إضافة شيخ', 'sheikh_add')]);
  buttons.push([Markup.button.callback('🔙 العودة', 'admin_back')]);
  const keyboard = Markup.inlineKeyboard(buttons);
  if (ctx.callbackQuery) return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function sheikhs_add_name(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  await ctx.answerCbQuery();
  ctx.session.addingSheikh = true;
  return ctx.reply('👨‍🏫 *إضافة شيخ جديد*\n\nأدخل اسم الشيخ:', { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
}

async function sheikhs_delete(ctx, sheikhId) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  const success = db.deleteSheikh(sheikhId);
  await ctx.answerCbQuery(success ? '✅ تم حذف الشيخ.' : '❌ خطأ في الحذف.', !success);
  if (success) return manageSheikhs(ctx);
}

async function manageDonations(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.reply('⛔ ليس لديك صلاحية.');
  const mosque = db.firstMosque();
  if (!mosque) return ctx.reply('🕌 لم يتم إضافة مسجد بعد.');
  const iban = db.getDonationIBAN(mosque.id);
  const paypal = db.getDonationPayPal(mosque.id);
  let msg = `💰 *إدارة التبرعات*\n\n🏛️ المسجد: ${mosque.name}\n\n`;
  msg += iban ? `💳 IBAN:\n\`${iban}\`\n\n` : `⚠️ لم يتم ربط IBAN بعد.\n\n`;
  msg += paypal ? `🅿️ PayPal:\n\`${paypal}\`` : `⚠️ لم يتم ربط PayPal بعد.`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(iban ? '✏️ تحديث IBAN' : '➕ إضافة IBAN', 'donation_set_iban')],
    [Markup.button.callback(paypal ? '✏️ تحديث PayPal' : '➕ إضافة PayPal', 'donation_set_paypal')],
    [Markup.button.callback('🔙 العودة', 'admin_back')]
  ]);
  if (ctx.callbackQuery) return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function donation_set_iban(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  await ctx.answerCbQuery();
  ctx.session.settingIBAN = true;
  return ctx.reply('💳 *ربط IBAN*\n\nأدخل رقم IBAN:\n\n_مثال: SA4420000001234567890123456789_', { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
}

async function donation_set_paypal(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  await ctx.answerCbQuery();
  ctx.session.settingPayPal = true;
  return ctx.reply('🅿️ *ربط PayPal*\n\nأدخل البريد الإلكتروني:\n\n_مثال: masjid@example.com_', { parse_mode: 'Markdown', ...Markup.keyboard([['❌ إلغاء']]).resize() });
}

async function manageHelpRequests(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.reply('⛔ ليس لديك صلاحية.');
  const requests = db.getPendingHelpRequests();
  const buttons = [];
  let msg;
  if (!requests.length) {
    msg = '🆘 *طلبات المساعدة*\n\nلا توجد طلبات معلقة حالياً. ✅';
  } else {
    msg = `🆘 *طلبات المساعدة المعلقة* (${requests.length})\n\n`;
    for (const req of requests) {
      msg += `👤 ${req.name}\n📞 ${req.phone || 'غير محدد'}\n💬 ${req.description}\n⏰ ${new Date(req.at).toLocaleDateString('ar-EG')}\n\n`;
      buttons.push([Markup.button.callback('✅ وضع علامة معالجة', `help_resolve_${req.id}`)]);
    }
  }
  buttons.push([Markup.button.callback('🔙 العودة', 'admin_back')]);
  const keyboard = Markup.inlineKeyboard(buttons);
  if (ctx.callbackQuery) return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function help_resolve(ctx, requestId) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.answerCbQuery('⛔ ليس لديك صلاحية.', true);
  db.updateHelpRequest(requestId, { status: 'resolved' });
  await ctx.answerCbQuery('✅ تم وضع علامة المعالجة.');
  return manageHelpRequests(ctx);
}

async function showMosqueStats(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.reply('⛔ ليس لديك صلاحية.');
  const mosque = db.firstMosque();
  const users = db.allUsers();
  const sheikhs = db.allSheikhs();
  const helpRequests = db.allHelpRequests();
  const questions = db.allQuestions();
  const lessons = db.getLessons(100);
  const announcements = db.getAnnouncements(100);
  const usersByRole = {};
  for (const u of users) usersByRole[u.role] = (usersByRole[u.role] || 0) + 1;
  const pendingHelp = helpRequests.filter(r => r.status === 'pending').length;
  const resolvedHelp = helpRequests.filter(r => r.status === 'resolved').length;
  const answeredQuestions = questions.filter(q => q.answered).length;
  let msg = `📊 *إحصائيات المسجد*\n\n`;
  if (mosque) msg += `🏛️ *المسجد:* ${mosque.name}\n📍 *الموقع:* ${mosque.location || 'غير محدد'}\n\n`;
  msg += `👥 *الأعضاء:*\n  • المجموع: ${users.length}\n  • مشايخ: ${usersByRole[ROLES.SHEIKH] || 0}\n  • مسؤولون: ${usersByRole[ROLES.ADMIN] || 0}\n  • مصلون: ${usersByRole[ROLES.WORSHIPPER] || 0}\n\n`;
  msg += `📖 *المشايخ:* ${sheikhs.length}\n📚 *الدروس:* ${lessons.length}\n📢 *الإعلانات:* ${announcements.length}\n\n`;
  msg += `❓ *الأسئلة:*\n  • الإجمالي: ${questions.length}\n  • المجابة: ${answeredQuestions}\n  • المعلقة: ${questions.length - answeredQuestions}\n\n`;
  msg += `🆘 *طلبات المساعدة:*\n  • المعلقة: ${pendingHelp}\n  • المعالجة: ${resolvedHelp}`;
  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'admin_back')]]);
  if (ctx.callbackQuery) return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function manageMosque(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.reply('⛔ ليس لديك صلاحية.');
  const mosque = db.firstMosque();
  if (!mosque) return ctx.reply('🕌 لم يتم إضافة مسجد بعد.');
  const t = mosque.prayerTimes || {};
  const prayerLines = PRAYER_KEYS.map((key, i) => `${PRAYER_ICONS[i]} ${PRAYER_NAMES[i]}: ${t[key] || '—'}`).join('\n');
  const msg = `🏛️ *معلومات المسجد*\n\n📛 *الاسم:* ${mosque.name}\n📍 *الموقع:* ${mosque.location || 'غير محدد'}\n\n📅 *مواقيت الصلاة:*\n${prayerLines}`;
  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'admin_back')]]);
  if (ctx.callbackQuery) return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function listUsers(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) return ctx.reply('⛔ ليس لديك صلاحية.');
  const users = db.allUsers();
  if (!users.length) return ctx.reply('👥 لا يوجد مستخدمون مسجلون بعد.');
  const grouped = {};
  for (const u of users) { if (!grouped[u.role]) grouped[u.role] = []; grouped[u.role].push(u); }
  const roleOrder = [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SHEIKH, ROLES.WORSHIPPER];
  let msg = `👥 *قائمة المستخدمين*\n📊 الإجمالي: ${users.length} مستخدم\n`;
  for (const role of roleOrder) {
    const roleUsers = grouped[role];
    if (!roleUsers?.length) continue;
    msg += `\n${ROLE_LABELS[role]}: ${roleUsers.length}\n`;
    for (const u of roleUsers.slice(0, 5)) {
      msg += `  • ${u.firstName}${u.lastName ? ' ' + u.lastName : ''}${u.username ? ` (@${u.username})` : ''} [${u.id}]\n`;
    }
    if (roleUsers.length > 5) msg += `  _...و ${roleUsers.length - 5} آخرين_\n`;
  }
  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة', 'admin_back')]]);
  if (ctx.callbackQuery) return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
  return ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

module.exports = {
  adminPanel, manageSheikhs, sheikhs_add_name, sheikhs_delete,
  manageDonations, donation_set_iban, donation_set_paypal,
  manageHelpRequests, help_resolve, showMosqueStats, manageMosque, listUsers
};

const registry = require('../core/actionRegistry');

registry.registerMenu('🔐 لوحة التحكم', adminPanel, 'لوحة التحكم');
registry.registerMenu('👥 قائمة المستخدمين', listUsers, 'قائمة المستخدمين');

registry.registerAction('admin_sheikhs', manageSheikhs, 'إدارة المشايخ');
registry.registerAction('sheikh_add', sheikhs_add_name, 'إضافة شيخ');
registry.registerAction(/^sheikh_delete_(.+)$/, (ctx) => sheikhs_delete(ctx, ctx.match[1]), 'حذف شيخ');
registry.registerAction('admin_donations', manageDonations, 'إدارة التبرعات');
registry.registerAction('donation_set_iban', donation_set_iban, 'تعيين IBAN');
registry.registerAction('donation_set_paypal', donation_set_paypal, 'تعيين PayPal');
registry.registerAction('admin_help_requests', manageHelpRequests, 'طلبات المساعدة');
registry.registerAction(/^help_resolve_(.+)$/, (ctx) => help_resolve(ctx, ctx.match[1]), 'معالجة طلب مساعدة');
registry.registerAction('admin_stats', showMosqueStats, 'إحصائيات المسجد');
registry.registerAction('admin_mosque_info', manageMosque, 'معلومات المسجد');
registry.registerAction('admin_back', adminPanel, 'العودة للوحة التحكم');
registry.registerAction('admin_users', listUsers, 'إدارة المستخدمين');
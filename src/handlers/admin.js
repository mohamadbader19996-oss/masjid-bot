const db = require('../database');
const { Markup } = require('telegraf');
const { ROLES, ROLE_LABELS, mainKeyboard } = require('../keyboards');

const PRAYER_ICONS = ['🌙', '☀️', '🌤️', '🌇', '🌑'];
const PRAYER_NAMES = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

async function manageMosque(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const mosque = db.firstMosque();
  if (!mosque) {
    return ctx.reply(
      '🕌 لم يتم إضافة مسجد بعد.\n\n💡 استخدم زر *🕌 إضافة مسجد* لإنشاء مسجد جديد.',
      { parse_mode: 'Markdown' }
    );
  }

  const t = mosque.prayerTimes || {};
  const prayerLines = PRAYER_KEYS.map((key, i) =>
    `${PRAYER_ICONS[i]} ${PRAYER_NAMES[i]}: ${t[key] || '—'}`
  ).join('\n');

  await ctx.reply(
    `🕌 *معلومات المسجد*\n\n📛 *الاسم:* ${mosque.name}\n📍 *الموقع:* ${mosque.location || 'غير محدد'}\n\n📅 *مواقيت الصلاة:*\n${prayerLines}`,
    { parse_mode: 'Markdown' }
  );
}

async function listUsers(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const users = db.allUsers();
  if (!users.length) {
    return ctx.reply('👥 لا يوجد مستخدمون مسجلون بعد.');
  }

  // تجميع المستخدمين حسب الدور
  const grouped = {};
  for (const u of users) {
    if (!grouped[u.role]) grouped[u.role] = [];
    grouped[u.role].push(u);
  }

  const roleOrder = [ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SHEIKH, ROLES.WORSHIPPER];

  let msg = `👥 *قائمة المستخدمين*\n📊 الإجمالي: ${users.length} مستخدم\n`;

  for (const role of roleOrder) {
    const roleUsers = grouped[role];
    if (!roleUsers?.length) continue;

    msg += `\n${ROLE_LABELS[role]}: ${roleUsers.length}\n`;
    for (const u of roleUsers.slice(0, 5)) {
      const name = `${u.firstName}${u.lastName ? ' ' + u.lastName : ''}`;
      const handle = u.username ? ` (@${u.username})` : '';
      msg += `  • ${name}${handle} [${u.id}]\n`;
    }
    if (roleUsers.length > 5) {
      msg += `  _...و ${roleUsers.length - 5} آخرين_\n`;
    }
  }

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function adminPanel(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.reply('⛔ ليس لديك صلاحية للوصول إلى هذا القسم.');
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('👨‍🏫 إدارة المشايخ', 'admin_sheikhs'), Markup.button.callback('💰 إدارة التبرعات', 'admin_donations')],
    [Markup.button.callback('🆘 طلبات المساعدة', 'admin_help_requests'), Markup.button.callback('📊 الإحصائيات', 'admin_stats')],
    [Markup.button.callback('🕌 معلومات المسجد', 'admin_mosque_info'), Markup.button.callback('👥 المستخدمون', 'admin_users')]
  ]);

  await ctx.reply('🔐 *لوحة التحكم*\n\nاختر القسم:', { parse_mode: 'Markdown', ...keyboard });
}

async function manageSheikhs(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  const sheikhs = db.allSheikhs();
  let msg = '👨‍🏫 *إدارة المشايخ*\n\n';

  const buttons = [];

  if (sheikhs.length === 0) {
    msg += 'لا يوجد مشايخ مسجلون بعد.';
  } else {
    for (const s of sheikhs) {
      msg += `• *${s.name}* — ${s.specialty || 'غير محدد'}\n`;
      buttons.push([Markup.button.callback(`🗑️ حذف ${s.name}`, `sheikh_delete_${s.id}`)]);
    }
  }

  buttons.push([Markup.button.callback('➕ إضافة شيخ', 'sheikh_add'), Markup.button.callback('🔙 رجوع', 'admin_back')]);

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

async function sheikhs_add_name(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  ctx.session.addingSheikh = true;
  await ctx.reply('👨‍🏫 أدخل اسم الشيخ:', Markup.keyboard([['❌ إلغاء']]).resize());
}

async function sheikhs_delete(ctx, id) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  const deleted = db.deleteSheikh(id);
  if (deleted) {
    await ctx.reply(`✅ تم حذف الشيخ *${deleted.name}* بنجاح.`, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user?.role) });
  } else {
    await ctx.reply('❌ لم يتم العثور على الشيخ.');
  }
}

async function manageDonations(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  const mosque = db.firstMosque();
  let msg = '💰 *إدارة التبرعات*\n\n';

  if (!mosque) {
    msg += '⚠️ لم يتم إضافة مسجد بعد.';
    return ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]) });
  }

  const iban = db.getDonationIBAN(mosque.id);
  const paypal = db.getDonationPayPal(mosque.id);

  msg += `💳 *IBAN:* ${iban ? `\`${iban}\`` : 'غير محدد'}\n`;
  msg += `🅿️ *PayPal:* ${paypal ? `\`${paypal}\`` : 'غير محدد'}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 ربط IBAN', 'donation_set_iban'), Markup.button.callback('🅿️ ربط PayPal', 'donation_set_paypal')],
    [Markup.button.callback('🔙 رجوع', 'admin_back')]
  ]);

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function donation_set_iban(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  ctx.session.settingIBAN = true;
  await ctx.reply('💳 أدخل رقم IBAN (مثال: SA4420000001234567890123456789):', Markup.keyboard([['❌ إلغاء']]).resize());
}

async function donation_set_paypal(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  ctx.session.settingPayPal = true;
  await ctx.reply('🅿️ أدخل بريد PayPal الإلكتروني:', Markup.keyboard([['❌ إلغاء']]).resize());
}

async function manageHelpRequests(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  const requests = db.getPendingHelpRequests();
  let msg = '🆘 *طلبات المساعدة المعلقة*\n\n';
  const buttons = [];

  if (requests.length === 0) {
    msg += '✅ لا توجد طلبات معلقة.';
  } else {
    for (const r of requests.slice(0, 10)) {
      const date = new Date(r.at).toLocaleDateString('ar-SA');
      msg += `• *${r.name || 'مجهول'}*: ${r.message?.substring(0, 50) || ''}...\n📅 ${date}\n\n`;
      buttons.push([Markup.button.callback(`✅ حل طلب ${r.name || r.id}`, `help_resolve_${r.id}`)]);
    }
  }

  buttons.push([Markup.button.callback('🔙 رجوع', 'admin_back')]);
  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
}

async function help_resolve(ctx, id) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  const updated = db.updateHelpRequest(id, { status: 'resolved', resolvedAt: new Date().toISOString(), resolvedBy: ctx.user.id });
  if (updated) {
    await ctx.reply(`✅ تم حل طلب المساعدة بنجاح.`, mainKeyboard(ctx.user?.role));
  } else {
    await ctx.reply('❌ لم يتم العثور على الطلب.');
  }
}

async function showMosqueStats(ctx) {
  if (![ROLES.ADMIN, ROLES.DEVELOPER].includes(ctx.user?.role)) {
    return ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
  }
  await ctx.answerCbQuery();

  const users = db.allUsers();
  const sheikhs = db.allSheikhs();
  const helpRequests = db.getPendingHelpRequests();

  const admins = users.filter(u => u.role === ROLES.ADMIN).length;
  const worshippers = users.filter(u => u.role === ROLES.WORSHIPPER).length;

  const msg = `📊 *إحصائيات المسجد*\n\n` +
    `👥 إجمالي المستخدمين: ${users.length}\n` +
    `🏛️ المسؤولون: ${admins}\n` +
    `👨‍🏫 المشايخ: ${sheikhs.length}\n` +
    `🕌 المصلون: ${worshippers}\n` +
    `🆘 طلبات معلقة: ${helpRequests.length}`;

  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]]) });
}

module.exports = {
  manageMosque,
  listUsers,
  adminPanel,
  manageSheikhs,
  sheikhs_add_name,
  sheikhs_delete,
  manageDonations,
  donation_set_iban,
  donation_set_paypal,
  manageHelpRequests,
  help_resolve,
  showMosqueStats
};

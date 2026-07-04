const db = require('../database');
const path = require('path');
const { Input } = require('telegraf');
const { ROLES, ROLE_LABELS, mainKeyboard, resetUserState } = require('../keyboards');
const {
  welcomeMessage,
  getDeviceLang,
  sendReplyKeyboard,
  languagePickerKeyboard,
  setUserUiLang
} = require('../services/uiTranslate');
const { getRoleLabel } = require('../i18n/phrases');
const { buildNextPrayerLineForCtx } = require('../services/prayerTimes');

const WELCOME_IMAGE_PATH = path.join(__dirname, '..', '..', 'assets', 'welcome.jpg');
const WELCOME_CAPTION = `🌙 أهلاً بك في تلاقي الرحماء — منارة المسلم
✨ "تلاقي القلوب... إلهام التغيير"
بيتك الإسلامي الشامل، فيه كل ما يلزمك:
📖 القرآن الكريم — مصحف بالخط الرسمي، تجويد ملوّن، تفاسير، 28 قارئ، ووضع الحافظ للحفظ والتسميع
🎙️ دروس مباشرة (لايف) ومحاضرات
🌍 الواجهة بكل لغات العالم — يفهمك أينما كنت
🤲 أدعية وأذكار ترافقك يومك
📅 أنشطة دورية دينية ورياضية تجمع القلوب
🤝 تطوّع — للتسميع، للدعوة، ولمساعدة من يحتاج
🕊️ قسم دعوي لكل من يبحث عن الحق
🕌 نظام إداري متكامل للمساجد والمشايخ
💌 رأيك واقتراحك دائماً محل اهتمامنا
"وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَى"
ابدأ رحلتك معنا 👇`;

async function handleStart(ctx) {
  await resetUserState(ctx);
  const userId = ctx.from.id;
  const isDev = db.isDeveloper(userId);

  let userForWelcome = db.getUser(userId);
  if (userForWelcome && !userForWelcome.hasSeenWelcome) {
    try {
      await ctx.replyWithPhoto(Input.fromLocalFile(WELCOME_IMAGE_PATH), {
        caption: WELCOME_CAPTION
      });
    } catch (e) {
      console.error('❌ welcome photo:', e.message);
    }
    db.saveUser(userId, { hasSeenWelcome: true });
  }

  const startParam = ctx.message?.text?.split(' ')[1];

  if (startParam === 'register_mosque') {
    return ctx.scene.enter('add-mosque');
  }

  const { parseModeratorInviteStart } = require('../services/moderatorService');
  const modInvite = startParam && parseModeratorInviteStart(startParam);
  if (modInvite) {
    if (modInvite.type === 'nomination') {
      ctx.session.nominatedBy = modInvite.nominatedBy;
    }
    return ctx.scene.enter('moderator_apply_scene');
  }

  if (startParam && startParam.startsWith('invite_dawah_')) {
    let user = db.getUser(userId);
    if (!user) {
      user = db.saveUser(userId, {
        id: userId,
        username: ctx.from.username || '',
        firstName: ctx.from.first_name || '',
        lastName: ctx.from.last_name || '',
        role: isDev ? ROLES.DEVELOPER : ROLES.WORSHIPPER,
        joinedAt: new Date().toISOString()
      });
    }
    ctx.session.userRole = user.role;
    ctx.user = user;
    const { dawahMenu } = require('./dawah');
    return dawahMenu(ctx);
  }

  if (startParam && startParam.startsWith('join_')) {
    const invite = db.getInviteCode(startParam);
    if (!invite) return ctx.reply('❌ رابط الدعوة غير صالح أو منتهي.');
    if (invite.used && !invite.permanent) {
      return ctx.reply('❌ تم استخدام هذا الرابط مسبقاً.');
    }
    ctx.session.pendingInviteCode = startParam;
    if (invite.role === 'worshipper') {
      return ctx.scene.enter('join_worshipper_scene');
    }
    return ctx.scene.enter('join_mosque_scene');
  }

  let user = db.getUser(userId);
  if (!user) {
    user = db.saveUser(userId, {
      id: userId,
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      role: isDev ? ROLES.DEVELOPER : ROLES.WORSHIPPER,
      joinedAt: new Date().toISOString()
    });
  } else if (isDev && user.role !== ROLES.DEVELOPER) {
    user = db.saveUser(userId, { role: ROLES.DEVELOPER });
  }

  ctx.session.userRole = user.role;
  ctx.user = user;

  const tgCode = ctx.from.language_code?.split('-')[0]?.toLowerCase() || 'ar';
  if (!user.uiLang && tgCode !== 'ar') {
    setUserUiLang(ctx, tgCode);
    user = ctx.user;
  } else if (user.uiLang) {
    ctx.session.uiLang = user.uiLang;
  }

  const lang = getDeviceLang(ctx);
  console.log(`📱 /start user=${userId} telegram=${ctx.from.language_code} → ui=${lang}`);

  const roleLabel = getRoleLabel(lang, user.role) || ROLE_LABELS[user.role];
  const text = welcomeMessage(lang, user.firstName, roleLabel) + buildNextPrayerLineForCtx(ctx);

  await sendReplyKeyboard(ctx, text, mainKeyboard(user.role), { parse_mode: 'Markdown' });

  await ctx.reply('🌍 Sprache / Language:', languagePickerKeyboard());
}

async function handleUiLang(ctx) {
  const lang = ctx.match?.[1];
  if (!lang) return;
  const { applyUiLanguage } = require('../services/uiTranslate');
  await applyUiLanguage(ctx, lang);
}

async function acceptInvite(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  const code = ctx.match?.[1];
  if (!code) return ctx.reply('❌ رابط دعوة غير صالح.');
  const invite = db.getInviteCode(code);
  if (!invite || invite.used) return ctx.reply('❌ رابط الدعوة غير صالح أو مستخدم مسبقاً.');
  db.markInviteUsed(code);
  await ctx.reply('✅ تم قبول الدعوة بنجاح!');
}

async function rejectInvite(ctx) {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply('❌ تم رفض الدعوة.');
}

module.exports = { handleStart, handleUiLang, acceptInvite, rejectInvite };

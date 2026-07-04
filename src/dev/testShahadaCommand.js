/**
 * اختبار مؤقت — يُحمَّل فقط عند ENABLE_TEST_SHAHADA=1
 * احذف هذا الملف أو أوقف المتغير قبل الإنتاج.
 */
const db = require('../database');
const { loadDB } = require('../utils/db');
const { sendNewMuslimWelcomeAfterShahada } = require('../handlers/dawah');
const { getDayContent, resolveContentAr } = require('../data/journeyDays');
const { sendJourneyPrayerVideos, sendJourneyWuduVideos, sendMaleJourneyExtraNote } = require('../utils/journeyReminder');

function buildMockNewMuslim(targetId, existing, ctxFrom, mockCompanionId) {
  const name = existing?.name
    || [ctxFrom?.first_name, ctxFrom?.last_name].filter(Boolean).join(' ')
    || 'مسلم جديد';
  return {
    userId: targetId,
    name,
    companionId: mockCompanionId ?? existing?.companionId ?? null
  };
}

async function handleTestShahadaCommand(ctx) {
  if (!ctx.from || !db.isDeveloper(ctx.from.id)) {
    return ctx.reply('⛔ هذا الأمر للمطوّر فقط (اختبار مؤقت).');
  }

  const args = (ctx.message.text || '').trim().split(/\s+/).slice(1);
  const targetId = args[0] || String(ctx.from.id);
  const mockCompanionId = args[1] || null;

  const existing = loadDB().new_muslims?.[targetId];
  const newMuslim = buildMockNewMuslim(targetId, existing, ctx.from, mockCompanionId);

  try {
    await sendNewMuslimWelcomeAfterShahada(ctx.telegram, targetId, newMuslim);
    const companionNote = newMuslim.companionId
      ? `\n📨 إشعار المرافق → \`${newMuslim.companionId}\``
      : '\n📨 إشعار المرافق: تُخطّى (companionId فارغ — أضف معرّفاً ثانياً للاختبار)';
    await ctx.reply(
      `✅ *اختبار مؤقت*\n\n` +
      `أُرسلت رسالة الترحيب + زر فقه الصلاة إلى \`${targetId}\`${companionNote}\n\n` +
      `_لم يُغيَّر db.json_`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await ctx.reply(`❌ فشل الاختبار: ${e.message}`);
  }
}

async function handleTestJourneyDayCommand(ctx) {
  if (!ctx.from || !db.isDeveloper(ctx.from.id)) {
    return ctx.reply('⛔ هذا الأمر للمطوّر فقط (اختبار مؤقت).');
  }

  const args = (ctx.message.text || '').trim().split(/\s+/).slice(1);
  const dayNum = parseInt(args[0], 10);
  const genderArg = (args[1] || 'male').toLowerCase();
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 40) {
    return ctx.reply(
      '📝 *طريقة الاستخدام:*\n\n' +
      '`/test_journey_day 1`\n' +
      '`/test_journey_day 9 male`\n' +
      '`/test_journey_day 9 female`\n\n' +
      'رقم اليوم من 1 إلى 40 — والجنس اختياري (male / female)',
      { parse_mode: 'Markdown' }
    );
  }
  if (args[1] && genderArg !== 'male' && genderArg !== 'female') {
    return ctx.reply(
      '⚠️ الجنس يجب أن يكون `male` أو `female`\n\nمثال: `/test_journey_day 9 female`',
      { parse_mode: 'Markdown' }
    );
  }
  const gender = genderArg === 'female' ? 'female' : 'male';

  const dayData = getDayContent(dayNum);
  if (!dayData) {
    return ctx.reply(`❌ لم يُعثر على اليوم ${dayNum}`);
  }

  const newMuslimContent = resolveContentAr(dayData.content?.ar, gender, ctx.from.id).trim();
  if (!newMuslimContent) {
    return ctx.reply(
      `⚠️ *اليوم ${dayNum} — ${dayData.title}* (${gender})\n\n` +
      '`content.ar` فارغ — لا تُرسَل رسالة للمسلم الجديد فعلياً عند إكمال هذا اليوم.',
      { parse_mode: 'Markdown' }
    );
  }

  const contentAr = dayData.content?.ar;
  const usedFallback = gender === 'female'
    && typeof contentAr === 'object'
    && !(contentAr.female || '').trim()
    && !!(contentAr.male || '').trim();

  try {
    await ctx.telegram.sendMessage(
      ctx.from.id,
      `🌱 *${dayData.title}*\n\n${newMuslimContent}`,
      { parse_mode: 'Markdown' }
    );

    await sendJourneyPrayerVideos(ctx.telegram, ctx.from.id, dayNum, gender);
    await sendJourneyWuduVideos(ctx.telegram, ctx.from.id, dayNum, gender);
    await sendMaleJourneyExtraNote(ctx.telegram, ctx.from.id, gender, dayNum);

    if (dayNum === 16) {
      await ctx.telegram.sendMessage(
        ctx.from.id,
        '🎓 *حان وقت حفظ سورة الفاتحة*\n\n' +
        'الفاتحة هي أهم سورة في صلاتك، ولوحة الحفظ ستساعدك بتكرار كل آية حتى تثبت في ذهنك.',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🎓 ابدأ حفظ الفاتحة', callback_data: 'quran_hafiz_repeat_1_1' }
            ]]
          }
        }
      );
    }

    let extraNote = '';
    if (dayNum === 9) extraNote = '\n📎 + رسالة فيديوهات الوضوء (كما في اليوم 9 فعلياً)';
    else if (dayNum === 14 || dayNum === 15) extraNote = '\n📎 + رسالة فيديوهات الصلاة (كما في اليوم 14/15 فعلياً)';
    else if (dayNum === 16) extraNote = '\n📎 + رسالة حفظ الفاتحة (كما في اليوم 16 فعلياً)';
    await ctx.reply(
      `✅ *معاينة اليوم ${dayNum}* (${gender === 'female' ? 'أنثى 🧕' : 'ذكر 🧔'})\n\n` +
      `أُرسلت لك الرسالة بنفس صيغة المسلم الجديد.${extraNote}` +
      (usedFallback ? '\n\n↩️ _female فارغة — استُخدم male كـ fallback_' : '') +
      '\n\n_لم يُغيَّر db.json_',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await ctx.reply(`❌ فشل الإرسال: ${e.message}`);
  }
}

async function handleTestModeratorPanelCommand(ctx) {
  if (!ctx.from || !db.isDeveloper(ctx.from.id)) {
    return ctx.reply('⛔ هذا الأمر للمطوّر فقط (اختبار مؤقت).');
  }

  const langCode = 'de';

  try {
    const { moderatorPanel } = require('../handlers/moderator');
    await moderatorPanel(ctx, { previewAsModerator: langCode, langCode });
    await ctx.reply(
      `✅ *معاينة لوحة المشرف الإقليمي*\n\n` +
      `أُرسلت لك اللوحة كما ستظهر لمشرف ألمانيا (\`${langCode}\`).\n\n` +
      '_لم يُغيَّر db.json_',
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await ctx.reply(`❌ فشل المعاينة: ${e.message}`);
  }
}

function registerDevTestCallbacks(bot) {
  // fiqh_section_* يُعالَج في handlers/prayerFiqh.js
}

function logDevTestEnabled() {
  console.log('🧪 أوامر الاختبار المؤقتة: /test_shahada + /test_journey_day + /test_moderator_panel (ENABLE_TEST_SHAHADA=1)');
}

module.exports = {
  handleTestShahadaCommand,
  handleTestJourneyDayCommand,
  handleTestModeratorPanelCommand,
  registerDevTestCallbacks,
  logDevTestEnabled
};

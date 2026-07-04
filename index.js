require('dotenv').config();

if (process.env.BOT_TOKEN) {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN.trim();
}

process.on('uncaughtException', (err) => {
  if (err.message.includes('409')) {
    console.error('❌ نسخة أخرى تعمل — أوقفها أولاً');
    process.exit(1);
  }
  console.error('❌ Uncaught exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  const msg = err?.message || String(err);
  if (msg.includes('409')) {
    console.error('❌ نسخة أخرى تعمل — أوقفها أولاً');
    process.exit(1);
  }
  if (msg.includes('401') || msg.includes('Unauthorized')) {
    console.error('❌ BOT_TOKEN غير صالح — الأزرار لن تعمل حتى تحدّث التوكن في .env');
    console.error('   @BotFather → /mybots → API Token → Generate new token');
    process.exit(1);
  }
  console.error('❌ Unhandled rejection:', msg);
});

async function validateBotToken(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  return res.json();
}

async function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('❌ BOT_TOKEN غير موجود في ملف .env');
    process.exit(1);
  }

  let me;
  try {
    me = await validateBotToken(token);
  } catch (err) {
    console.error('❌ تعذر الاتصال بتيليغرام للتحقق من التوكن:', err.message);
    process.exit(1);
  }

  if (!me.ok) {
    console.error('❌ BOT_TOKEN مرفوض من تيليغرام — لذلك البوت والأزرار لا يعملان.');
    console.error(`   (${me.error_code || '?'}: ${me.description || 'Unauthorized'})`);
    console.error('');
    console.error('   الحل:');
    console.error('   1) افتح @BotFather في تيليغرام');
    console.error('   2) /mybots → اختر البوت → API Token');
    console.error('   3) اضغط Revoke ثم انسخ التوكن الجديد');
    console.error('   4) ضعه في ملف .env ثم: npm start');
    process.exit(1);
  }

  console.log(`✅ التوكن صالح — @${me.result.username}`);

  const { bot } = require('./src/bot');
  const { startReminderScheduler } = require('./src/utils/eventReminder');
  const { startJourneyReminderSchedule } = require('./src/utils/journeyReminder');
  const { startHelpRequestReminderSchedule } = require('./src/utils/helpRequestReminder');
  const { startAdhanNotifierSchedule } = require('./src/utils/adhanNotifier');
  const { startIslamicDatesSchedule } = require('./src/utils/islamicDatesNotifier');

  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY غير موجود — المساعد الديني لن يعمل');
  } else {
    const geminiService = require('./src/services/gemini');
    geminiService.testConnection().then((result) => {
      if (result?.workingModel) {
        console.log(`✅ Gemini API يعمل (${result.workingModel})`);
      } else {
        console.log('✅ Gemini API يعمل');
      }
    }).catch((err) => {
      console.log('❌ Gemini API خطأ:', err.message);
    });
  }

  bot.launch({ dropPendingUpdates: true }, () => {
    console.log('✅ بوت المسجد يعمل...');
    startReminderScheduler(bot);
    startJourneyReminderSchedule(bot);
    startHelpRequestReminderSchedule(bot);
    startAdhanNotifierSchedule(bot);
    startIslamicDatesSchedule(bot);
    console.log('🛑 اضغط Ctrl+C للإيقاف');
  }).catch((err) => {
    if (err.response?.error_code === 409) {
      console.error('❌ نسخة أخرى من البوت تعمل على نفس التوكن (409 Conflict).');
      console.error('   أوقف كل الطرفيات الأخرى ثم أعد التشغيل: npm start');
    } else if (err.response?.error_code === 401 || String(err.message).includes('401')) {
      console.error('❌ BOT_TOKEN غير صالح (401) — حدّث التوكن في .env من @BotFather');
    } else {
      console.error('❌ فشل تشغيل البوت:', err.message);
    }
    process.exit(1);
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

startBot();

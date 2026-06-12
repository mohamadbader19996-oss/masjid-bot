require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { bot } = require('./src/bot');

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN غير موجود في ملف .env');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY غير موجود — المساعد الديني لن يعمل');
} else {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  model.generateContent('test').then(() => {
    console.log('✅ Gemini API يعمل');
  }).catch((err) => {
    console.log('❌ Gemini API خطأ:', err.message);
  });
}

bot.launch({ dropPendingUpdates: true }, () => {
  console.log('✅ بوت المسجد يعمل...');
  console.log('🛑 اضغط Ctrl+C للإيقاف');
}).catch((err) => {
  if (err.response?.error_code === 409) {
    console.error('❌ نسخة أخرى من البوت تعمل على نفس التوكن (409 Conflict).');
    console.error('   أوقف كل الطرفيات الأخرى ثم أعد التشغيل: npm start');
  } else {
    console.error('❌ فشل تشغيل البوت:', err.message);
  }
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

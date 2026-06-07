require('dotenv').config();
const { bot } = require('./src/bot');

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN غير موجود في ملف .env');
  process.exit(1);
}

bot.launch().then(() => {
  console.log('✅ بوت المسجد يعمل...');
  console.log('🛑 اضغط Ctrl+C للإيقاف');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

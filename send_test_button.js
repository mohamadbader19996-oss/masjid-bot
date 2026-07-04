require('dotenv').config();
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);
const requestId = process.argv[2];
const volunteerId = 6070771722;
if (!requestId) {
  console.log('استخدم: node send_test_button.js <requestId>');
  process.exit(1);
}
bot.telegram.sendMessage(
  volunteerId,
  '🧪 *رسالة اختبار — طلب تجريبي*\n\nاضغط الزر أدناه لتثبيت موعد الشهادة:',
  {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🕊️ تثبيت موعد الشهادة', callback_data: `shahada_schedule_${requestId}` }]
      ]
    }
  }
).then(() => {
  console.log('✅ تم إرسال رسالة الاختبار بنجاح');
  process.exit(0);
}).catch((err) => {
  console.error('❌ خطأ:', err.message);
  process.exit(1);
});

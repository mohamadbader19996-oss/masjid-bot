/**
 * تشغيل من الكونسول (بدون تعديل db.json):
 *   node scripts/test-shahada-welcome.js
 *   node scripts/test-shahada-welcome.js 6070771722
 *   node scripts/test-shahada-welcome.js 6070771722 6070771722
 */
require('dotenv').config();
const { Telegraf } = require('telegraf');
const { loadDB } = require('../src/utils/db');
const { sendNewMuslimWelcomeAfterShahada } = require('../src/handlers/dawah');

async function main() {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) {
    console.error('❌ BOT_TOKEN غير موجود في .env');
    process.exit(1);
  }

  const targetId = process.argv[2] || '6070771722';
  const mockCompanionId = process.argv[3] || null;
  const existing = loadDB().new_muslims?.[targetId];
  const newMuslim = {
    name: existing?.name || 'مسلم جديد',
    companionId: mockCompanionId || existing?.companionId || null
  };

  const bot = new Telegraf(token);
  await sendNewMuslimWelcomeAfterShahada(bot.telegram, targetId, newMuslim);

  console.log(`✅ أُرسلت رسالة الترحيب إلى ${targetId}`);
  if (newMuslim.companionId) {
    console.log(`✅ أُرسل إشعار المرافق إلى ${newMuslim.companionId}`);
  } else {
    console.log('ℹ️  إشعار المرافق تُخطّى (companionId فارغ)');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});

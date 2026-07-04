process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Markup } = require('telegraf');
const {
  RECITERS, getFullSurahAudioUrl, verifyFullSurahAudioUrl
} = require('./src/services/quranApi');

function buildListenNextKeyboard(surahNumber) {
  const num = Number(surahNumber);
  if (!num || num >= 114) return null;
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏭️ السورة التالية', 'quran_listen_next_' + num)]
  ]);
}

(async () => {
  console.log('=== اختبار السورة التالية ===\n');
  let ok = true;

  const kb1 = buildListenNextKeyboard(1);
  const cb1 = kb1?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
  console.log('سورة 1 → callback:', cb1, cb1 === 'quran_listen_next_1' ? '✅' : '❌');
  if (cb1 !== 'quran_listen_next_1') ok = false;

  const nextFrom1 = 1 + 1;
  const reciter = RECITERS.find(r => r.id === 'ar.alafasy');
  const url2 = getFullSurahAudioUrl(nextFrom1, reciter.id);
  const avail2 = await verifyFullSurahAudioUrl(url2);
  console.log(`بعد سورة 1 → سورة ${nextFrom1}:`, avail2 ? '✅' : '❌', url2);
  if (!avail2) ok = false;

  const kb114 = buildListenNextKeyboard(114);
  console.log('سورة 114 → لا زر:', kb114 === null ? '✅' : '❌');
  if (kb114 !== null) ok = false;

  const kb5 = buildListenNextKeyboard(5);
  const nextFrom5 = 5 + 1;
  const url6 = getFullSurahAudioUrl(nextFrom5, 'ar.muhammadanwarshahat');
  const avail6 = await verifyFullSurahAudioUrl(url6);
  console.log(`بعد سورة 5 (شحات) → سورة ${nextFrom5}:`, avail6 ? '✅' : '❌');
  if (!avail6) ok = false;

  console.log('\n===', ok ? '✅ نجح الاختبار' : '❌ فشل', '===');
  process.exit(ok ? 0 : 1);
})();

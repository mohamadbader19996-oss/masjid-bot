const {
  getSurahAudio,
  getFullSurahAudioUrl,
  verifyFullSurahAudioUrl
} = require('../services/quranApi');
const { getCurrentReciter } = require('./quranReciter');

async function playSurahAudio(ctx, surahNumber) {
  const reciter = getCurrentReciter(ctx);
  const audioSurah = await getSurahAudio(surahNumber, reciter.id);
  const audioUrl = getFullSurahAudioUrl(surahNumber, reciter.id);
  if (!audioSurah || !audioUrl) {
    return ctx.reply('❌ الصوت غير متاح لهذه السورة بهذا القارئ.');
  }
  const available = await verifyFullSurahAudioUrl(audioUrl);
  if (!available) {
    return ctx.reply('❌ الصوت غير متاح حالياً، جرّب قارئاً آخر من قسم القرآن.');
  }
  const surahName = audioSurah.name || audioSurah.englishName || String(surahNumber);
  return ctx.replyWithAudio(audioUrl, {
    caption: '🎙️ ' + reciter.name + ' - سورة ' + surahName
  });
}

module.exports = { playSurahAudio };

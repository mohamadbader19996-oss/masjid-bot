process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  speakArabicTextGemini,
  pcmBufferToMp3File,
  probeDurationSeconds,
  cleanTextForTts,
  splitTextForTTS,
  synthesizeGeminiTtsChunk,
  GEMINI_TTS_MAX_CHARS
} = require('./src/services/tts');

const OUT_DIR = path.join(process.cwd(), 'temp', 'gemini_tts_selftest');
const ANSWER = (
  'الصلاة ركن من أركان الإسلام الخمسة، وهي أول ما يُحاسب عليه العبد يوم القيامة. ' +
  'قال رسول الله صلى الله عليه وسلم: «أول ما يُحاسب عليه العبد يوم القيامة الصلاة، فإن صلحت صلح سائر عمله، وإن فسدت فسد سائر عمله». ' +
  'يجب على المسلم المحافظة على الصلوات الخمس في أوقاتها، مع الطهارة والخشوع. ' +
  'من ترك الصلاة جحوداً فقد كفر، ومن تركها تهاوناً فقد أثم وعرض نفسه للعقوبة. ' +
  'إذا كنت مبتدئاً، ابدأ بتعلم الوضوء ثم تعلم الفاتحة، ثم صلّ مع جماعة المسجد إن استطعت. ' +
  'لا تيأس من التقصير في البداية، فالله يحب من يثابر على الطاعة ويسأل عندما لا يعلم.'
).slice(0, 850);

async function buildMergedMp3Only(text) {
  const cleanText = cleanTextForTts(text);
  const chunks = splitTextForTTS(cleanText, GEMINI_TTS_MAX_CHARS);
  console.log('Text length:', cleanText.length);
  console.log('Chunks:', chunks.length, '(max', GEMINI_TTS_MAX_CHARS, 'chars each)');

  const pcmBuffers = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Synthesizing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    pcmBuffers.push(await synthesizeGeminiTtsChunk(chunks[i]));
  }

  const merged = Buffer.concat(pcmBuffers);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mp3Path = path.join(OUT_DIR, 'selftest_merged_answer.mp3');
  await pcmBufferToMp3File(merged, mp3Path);
  return mp3Path;
}

async function main() {
  console.log('=== SELF-TEST: speakArabicTextGemini (merged single mp3) ===\n');

  const sendCount = { n: 0 };
  const ctx = {
    async replyWithVoice(opts) {
      sendCount.n++;
      console.log('[replyWithVoice] calls:', sendCount.n, 'file:', opts.source);
    },
    async replyWithAudio() {
      sendCount.n++;
      console.log('[replyWithAudio] calls:', sendCount.n);
    }
  };

  const mp3Path = path.join(OUT_DIR, 'selftest_merged_answer.mp3');
  const cleanText = cleanTextForTts(ANSWER);
  const chunks = splitTextForTTS(cleanText, GEMINI_TTS_MAX_CHARS);
  const pcmBuffers = [];
  for (const chunk of chunks) {
    pcmBuffers.push(await synthesizeGeminiTtsChunk(chunk));
  }
  await pcmBufferToMp3File(Buffer.concat(pcmBuffers), mp3Path);

  await speakArabicTextGemini(ctx, ANSWER);

  const stat = fs.statSync(mp3Path);
  const duration = await probeDurationSeconds(mp3Path);

  console.log('\n=== RESULTS ===');
  console.log('Telegram send calls:', sendCount.n, sendCount.n === 1 ? 'OK' : 'FAIL');
  console.log('MP3 path:', path.resolve(mp3Path));
  console.log('MP3 size bytes:', stat.size);
  console.log('Duration seconds:', duration.toFixed(2));
  console.log('Temp mp3 still exists after speakArabicTextGemini:', fs.existsSync(mp3Path) ? 'yes (saved copy)' : 'no');

  if (sendCount.n !== 1) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

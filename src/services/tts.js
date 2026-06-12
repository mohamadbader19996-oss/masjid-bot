const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

let googleTtsClient = null;
let googleTtsChecked = false;

function getGoogleTtsClient() {
  if (googleTtsChecked) return googleTtsClient;
  googleTtsChecked = true;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  try {
    const textToSpeech = require('@google-cloud/text-to-speech');
    googleTtsClient = new textToSpeech.TextToSpeechClient();
  } catch (e) {
    console.warn('⚠️ Google Cloud TTS غير متاح:', e.message);
    googleTtsClient = null;
  }
  return googleTtsClient;
}

function cleanTextForTts(text) {
  return (text || '')
    .replace(/[*_`┌└│─﴿﴾]/g, ' ')
    .replace(/[📌📜✅🌙⚠️•🔊#🖼️🎤]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadGoogleTtsFree(cleanText, tmpFile) {
  const chunk = cleanText.substring(0, 200);
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(chunk)}`;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpFile);
    https.get(ttsUrl, {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://translate.google.com/'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(tmpFile, () => {});
        reject(new Error(`TTS HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function sendVoiceFromFile(ctx, tmpFile) {
  try {
    await ctx.replyWithVoice({ source: tmpFile });
  } catch {
    await ctx.replyWithAudio(
      { source: tmpFile, filename: 'answer.mp3' },
      { title: 'إجابة المساعد الديني' }
    );
  }
}

async function speakArabicText(ctx, text) {
  const cleanText = cleanTextForTts(text).substring(0, 500);
  if (!cleanText) {
    throw new Error('لا يوجد نص صالح للتحويل لصوت');
  }

  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);

  try {
    const cloudClient = getGoogleTtsClient();
    if (cloudClient) {
      try {
        const [response] = await cloudClient.synthesizeSpeech({
          input: { text: cleanText.substring(0, 200) },
          voice: { languageCode: 'ar-XA', ssmlGender: 'NEUTRAL' },
          audioConfig: { audioEncoding: 'MP3' }
        });
        fs.writeFileSync(tmpFile, response.audioContent);
        await sendVoiceFromFile(ctx, tmpFile);
        return true;
      } catch (err) {
        console.error('Google Cloud TTS:', err.message);
      }
    }

    await downloadGoogleTtsFree(cleanText, tmpFile);
    if (fs.statSync(tmpFile).size >= 100) {
      await sendVoiceFromFile(ctx, tmpFile);
      return true;
    }
    throw new Error('ملف الصوت فارغ');
  } finally {
    if (fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch (e) {}
    }
  }
}

module.exports = {
  cleanTextForTts,
  speakArabicText
};

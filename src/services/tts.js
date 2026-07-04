const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = 'Charon';
const GEMINI_PCM_SAMPLE_RATE = 24000;
/** حد آمن مكتشف تجريبياً — طلبات 800+ أحياناً ترجع 200 بدون صوت (finishReason: OTHER) */
const GEMINI_TTS_MAX_CHARS = 700;

const FREE_TTS_MAX_CHARS = 200;

function getGeminiApiKey() {
  const raw = process.env.GEMINI_API_KEY || '';
  return raw.split(',')[0].trim();
}

function cleanTextForTts(text) {
  return (text || '')
    .replace(/[*_`┌└│─﴿﴾]/g, ' ')
    .replace(/[📌📜✅🌙⚠️•🔊#🖼️🎤]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTextForTTS(text, maxLength = GEMINI_TTS_MAX_CHARS) {
  if (text.length <= maxLength) return [text];

  const sentences = text.split(/[.!?،؛\n]/);
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    const separator = currentChunk ? '، ' : '';
    if ((currentChunk + separator + trimmed).length <= maxLength) {
      currentChunk += separator + trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      if (trimmed.length <= maxLength) {
        currentChunk = trimmed;
      } else {
        for (let i = 0; i < trimmed.length; i += maxLength) {
          chunks.push(trimmed.slice(i, i + maxLength).trim());
        }
        currentChunk = '';
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter(Boolean);
}

async function synthesizeGeminiTtsChunk(text) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY غير موجود في .env');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE }
        }
      }
    }
  }, {
    timeout: 180000,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true
  });

  if (res.status !== 200) {
    const msg = res.data?.error?.message || `Gemini TTS HTTP ${res.status}`;
    throw new Error(msg);
  }

  const inlineData = res.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    const reason = res.data?.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`Gemini TTS returned no audio (finishReason: ${reason})`);
  }

  return Buffer.from(inlineData.data, 'base64');
}

function pcmBufferToMp3File(pcmBuffer, mp3Path) {
  fs.mkdirSync(path.dirname(mp3Path), { recursive: true });
  const pcmPath = mp3Path.replace(/\.mp3$/i, '.pcm');
  fs.writeFileSync(pcmPath, pcmBuffer);
  return new Promise((resolve, reject) => {
    ffmpeg(pcmPath)
      .inputOptions(['-f', 's16le', '-ar', String(GEMINI_PCM_SAMPLE_RATE), '-ac', '1'])
      .audioCodec('libmp3lame')
      .format('mp3')
      .save(mp3Path)
      .on('end', () => {
        try { fs.unlinkSync(pcmPath); } catch (_) {}
        resolve(mp3Path);
      })
      .on('error', (err) => {
        try { fs.unlinkSync(pcmPath); } catch (_) {}
        reject(err);
      });
  });
}

function cleanupFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
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

function downloadGoogleTtsFree(cleanText, tmpFile) {
  const chunk = cleanText.substring(0, FREE_TTS_MAX_CHARS);
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

async function speakArabicTextLegacy(ctx, cleanText) {
  console.warn('⚠️ [TTS FALLBACK] استخدام Google Translate TTS المجاني — Gemini TTS غير متاح');
  const freeChunks = splitTextForTTS(cleanText, FREE_TTS_MAX_CHARS);
  for (const freeChunk of freeChunks) {
    const partFile = path.join(os.tmpdir(), `tts_free_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    try {
      await downloadGoogleTtsFree(freeChunk, partFile);
      if (fs.statSync(partFile).size >= 100) {
        await sendVoiceFromFile(ctx, partFile);
      }
    } finally {
      cleanupFile(partFile);
    }
  }
  return true;
}

async function speakArabicTextGemini(ctx, text) {
  const cleanText = cleanTextForTts(text);
  if (!cleanText) {
    throw new Error('لا يوجد نص صالح للتحويل لصوت');
  }

  const chunks = splitTextForTTS(cleanText, GEMINI_TTS_MAX_CHARS);
  const pcmBuffers = [];

  for (const chunk of chunks) {
    pcmBuffers.push(await synthesizeGeminiTtsChunk(chunk));
  }

  const mergedPcm = Buffer.concat(pcmBuffers);
  const tmpFile = path.join(os.tmpdir(), `gemini_tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);

  try {
    await pcmBufferToMp3File(mergedPcm, tmpFile);
    await sendVoiceFromFile(ctx, tmpFile);
    return true;
  } finally {
    cleanupFile(tmpFile);
  }
}

async function speakArabicText(ctx, text) {
  try {
    return await speakArabicTextGemini(ctx, text);
  } catch (err) {
    console.warn('⚠️ [TTS FALLBACK] فشل Gemini TTS:', err.message);
    const cleanText = cleanTextForTts(text);
    if (!cleanText) throw err;
    return speakArabicTextLegacy(ctx, cleanText);
  }
}

function probeDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data?.format?.duration || 0);
    });
  });
}

module.exports = {
  cleanTextForTts,
  splitTextForTTS,
  synthesizeGeminiTtsChunk,
  speakArabicTextGemini,
  speakArabicText,
  pcmBufferToMp3File,
  probeDurationSeconds,
  GEMINI_TTS_MAX_CHARS,
  GEMINI_TTS_VOICE,
  GEMINI_TTS_MODEL
};

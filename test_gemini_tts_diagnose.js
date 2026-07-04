process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const API_KEY = process.env.GEMINI_API_KEY;
const TEST_TEXT = 'السلام عليكم ورحمة الله';
const VOICES = ['Charon', 'Fenrir', 'Puck'];
const OUT_DIR = path.join(process.cwd(), 'temp', 'gemini_tts_test');

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
  const res = await axios.get(url, { timeout: 60000 });
  const models = res.data?.models || [];
  const ttsModels = models.filter((m) => /tts/i.test(m.name || '') || /tts/i.test(m.displayName || ''));
  return { allCount: models.length, ttsModels, models };
}

async function generateTts(modelName, voiceName) {
  const modelId = modelName.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: TEST_TEXT }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  };
  const res = await axios.post(url, body, {
    timeout: 120000,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true
  });
  return { status: res.status, data: res.data, modelId };
}

function extractInlineAudio(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
        rawPartKeys: Object.keys(part),
        inlineDataKeys: Object.keys(part.inlineData)
      };
    }
  }
  return null;
}

function pcmToMp3(inputPath, outputPath, sampleRate = 24000) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(['-f', 's16le', '-ar', String(sampleRate), '-ac', '1'])
      .audioCodec('libmp3lame')
      .format('mp3')
      .save(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
}

function writeRawFromResponse(data, baseName) {
  const audio = extractInlineAudio(data);
  if (!audio) return null;

  const rawBin = path.join(OUT_DIR, `${baseName}.bin`);
  const rawB64 = path.join(OUT_DIR, `${baseName}.b64.txt`);
  const meta = path.join(OUT_DIR, `${baseName}.meta.json`);
  const buf = Buffer.from(audio.data, 'base64');
  fs.writeFileSync(rawBin, buf);
  fs.writeFileSync(rawB64, audio.data.slice(0, 200) + '...(truncated)');
  fs.writeFileSync(meta, JSON.stringify({
    mimeType: audio.mimeType,
    byteLength: buf.length,
    inlineDataKeys: audio.inlineDataKeys,
    rawPartKeys: audio.rawPartKeys
  }, null, 2));

  return { audio, buf, rawBin, meta };
}

async function tryConvertToMp3(rawBin, mp3Out, mimeType) {
  const attempts = [
    { sampleRate: 24000, label: 'pcm_s16le_24000' },
    { sampleRate: 16000, label: 'pcm_s16le_16000' },
    { sampleRate: 48000, label: 'pcm_s16le_48000' }
  ];

  if (/wav/i.test(mimeType || '')) {
    await new Promise((resolve, reject) => {
      ffmpeg(rawBin).audioCodec('libmp3lame').format('mp3').save(mp3Out)
        .on('end', resolve).on('error', reject);
    });
    return { method: 'direct_wav', sampleRate: null };
  }

  for (const a of attempts) {
    try {
      await pcmToMp3(rawBin, mp3Out, a.sampleRate);
      const stat = fs.statSync(mp3Out);
      if (stat.size > 500) return { method: a.label, sampleRate: a.sampleRate };
    } catch (_) {}
  }
  throw new Error('Could not convert raw audio to mp3 with tried sample rates');
}

async function main() {
  if (!API_KEY) {
    console.error('GEMINI_API_KEY missing');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('=== STEP 1a: List models (tts filter) ===');
  const { allCount, ttsModels } = await listModels();
  console.log('Total models:', allCount);
  console.log('TTS-related models:');
  if (!ttsModels.length) {
    console.log('  (none matched "tts" in name/displayName)');
  } else {
    ttsModels.forEach((m) => console.log(' ', m.name, '|', m.displayName || '', '|', (m.supportedGenerationMethods || []).join(',')));
  }

  const preferred = ttsModels.find((m) => /flash.*tts|tts.*flash/i.test(m.name))
    || ttsModels.find((m) => /tts/i.test(m.name))
    || ttsModels[0];

  let modelToUse = preferred?.name?.replace(/^models\//, '');
  if (!modelToUse) {
    const fallbacks = [
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
      'gemini-2.0-flash-preview-tts'
    ];
    console.log('\nNo tts in list — will try fallbacks:', fallbacks.join(', '));
    for (const fb of fallbacks) {
      const probe = await generateTts(fb, 'Charon');
      if (probe.status === 200 && probe.data?.candidates) {
        modelToUse = fb;
        console.log('Fallback worked:', fb);
        fs.writeFileSync(path.join(OUT_DIR, 'step1_probe_response.json'), JSON.stringify(probe.data, null, 2));
        break;
      }
      console.log('Fallback failed:', fb, 'status', probe.status, probe.data?.error?.message || '');
    }
  }

  if (!modelToUse) {
    console.error('No usable TTS model found');
    process.exit(1);
  }

  console.log('\n=== STEP 1b: Test generateContent (Charon) ===');
  console.log('Model:', modelToUse);
  const test = await generateTts(modelToUse, 'Charon');
  console.log('HTTP status:', test.status);
  const rawPath = path.join(OUT_DIR, 'step1_raw_response.json');
  fs.writeFileSync(rawPath, JSON.stringify(test.data, null, 2));
  console.log('Full raw JSON saved to:', rawPath);

  if (test.status !== 200) {
    console.log('\n--- RAW ERROR JSON (console) ---');
    console.log(JSON.stringify(test.data, null, 2));
    process.exit(1);
  }

  console.log('\n--- RAW RESPONSE STRUCTURE (summary) ---');
  console.log(JSON.stringify({
    keys: Object.keys(test.data || {}),
    candidateCount: test.data?.candidates?.length,
    firstCandidate: test.data?.candidates?.[0]
      ? {
          finishReason: test.data.candidates[0].finishReason,
          contentKeys: Object.keys(test.data.candidates[0].content || {}),
          partCount: test.data.candidates[0].content?.parts?.length,
          firstPartKeys: Object.keys(test.data.candidates[0].content?.parts?.[0] || {}),
          inlineData: test.data.candidates[0].content?.parts?.[0]?.inlineData
            ? {
                mimeType: test.data.candidates[0].content.parts[0].inlineData.mimeType,
                dataPrefix: String(test.data.candidates[0].content.parts[0].inlineData.data || '').slice(0, 80)
              }
            : null
        }
      : null
  }, null, 2));

  console.log('\n=== STEP 2: Three voices -> mp3 ===');
  const voiceFiles = {};
  for (const voice of VOICES) {
    console.log('\nVoice:', voice);
    const gen = await generateTts(modelToUse, voice);
    if (gen.status !== 200) {
      console.log('  FAIL status', gen.status, gen.data?.error?.message || '');
      fs.writeFileSync(path.join(OUT_DIR, `error_${voice.toLowerCase()}.json`), JSON.stringify(gen.data, null, 2));
      continue;
    }
    const base = voice.toLowerCase();
    const saved = writeRawFromResponse(gen.data, base);
    if (!saved) {
      console.log('  FAIL: no inlineData in response');
      continue;
    }
    console.log('  mimeType:', saved.audio.mimeType, 'bytes:', saved.buf.length);
    const mp3Path = path.join(OUT_DIR, `test_${base}.mp3`);
    try {
      const conv = await tryConvertToMp3(saved.rawBin, mp3Path, saved.audio.mimeType);
      console.log('  mp3:', mp3Path, 'method:', conv.method, 'sampleRate:', conv.sampleRate);
      voiceFiles[voice] = mp3Path;
    } catch (e) {
      console.log('  mp3 conversion failed:', e.message);
    }
  }

  console.log('\n=== DONE ===');
  console.log('Model used:', modelToUse);
  console.log('Raw step1 JSON:', rawPath);
  console.log('Output dir:', OUT_DIR);
  Object.entries(voiceFiles).forEach(([v, p]) => console.log(v + ':', p));
}

main().catch((e) => {
  console.error(e.response?.data || e.message || e);
  process.exit(1);
});

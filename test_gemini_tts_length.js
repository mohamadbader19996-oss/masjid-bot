process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-preview-tts';
const VOICE = 'Charon';

const BASE = 'الصلاة ركن من أركان الإسلام، وهي أول ما يُحاسب عليه العبد يوم القيامة. ';
const LONG = (BASE.repeat(20) + 'فمن تركها جحوداً فقد كفر، ومن تركها تهاوناً فقد أثم.').slice(0, 950);

async function tryLen(len) {
  const text = LONG.slice(0, len);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
    }
  }, { timeout: 180000, validateStatus: () => true });
  const audio = res.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  return {
    len,
    status: res.status,
    ok: res.status === 200 && Boolean(audio?.data),
    bytes: audio?.data ? Buffer.from(audio.data, 'base64').length : 0,
    error: res.data?.error?.message || null
  };
}

async function main() {
  for (const len of [200, 500, 800, 950, 1200, 1500]) {
    const r = await tryLen(len);
    console.log(JSON.stringify(r));
    if (!r.ok && r.status !== 200) break;
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });

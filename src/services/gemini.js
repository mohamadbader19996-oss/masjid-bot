const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const https = require('https');

if (process.env.GEMINI_TLS_INSECURE === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const SECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: true, keepAlive: true });

function buildAxiosOpts(insecure = process.env.GEMINI_TLS_INSECURE === '1') {
  return {
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
    httpsAgent: insecure ? INSECURE_HTTPS_AGENT : SECURE_HTTPS_AGENT,
    timeout: 60000
  };
}

async function postGemini(url, body) {
  try {
    return await axios.post(url, body, buildAxiosOpts(false));
  } catch (err) {
    if (!/UNABLE_TO_VERIFY|certificate|CERT_/i.test((err?.message || '') + (err?.code || ''))) {
      throw err;
    }
    return axios.post(url, body, buildAxiosOpts(true));
  }
}

const FATAL_ERROR_TYPES = new Set(['quota', 'key', 'permission']);

const MUSLIM_ANSWER_FOOTER =
  '━━━━━━━━━━━━━━━\n' +
  '🌙 تنبيه شرعي:\n' +
  'إن لم يكن أمامك دليل قاطع من القرآن والسنة\n' +
  'فالواجب الرجوع إلى شيخ متخصص\n' +
  '⚠️ الشرع يُحرّم الفتوى بغير علم\n' +
  '━━━━━━━━━━━━━━━';

const MUSLIM_FORMAT_PROMPT_RULE =
  'قواعد التنسيق الإلزامية:\n' +
  'للعناوين:\n' +
  '📌 *العنوان*\n' +
  'للآيات القرآنية:\n' +
  '┌─────────────────\n' +
  '│ ﴿ نص الآية ﴾\n' +
  '│ [سورة الاسم: رقم الآية]\n' +
  '└─────────────────\n' +
  'للأحاديث:\n' +
  '┌─────────────────\n' +
  '│ 📜 قال النبي ﷺ: (نص الحديث)\n' +
  '│ رواه: ... | الدرجة: صحيح/حسن/ضعيف\n' +
  '└─────────────────\n' +
  'للنقاط:\n' +
  '- النقطة الأولى\n' +
  '- النقطة الثانية\n' +
  'للخلاصة:\n' +
  '✅ *الخلاصة:* جملة واحدة واضحة\n' +
  'سطران فارغان بين كل قسم\n' +
  'لا تستخدم ** أو ## أبداً\n' +
  'التنبيه الشرعي الإلزامي في نهاية كل إجابة:\n' +
  MUSLIM_ANSWER_FOOTER;

const MUSLIM_FOOTER_PROMPT_RULE =
  'في نهاية كل إجابة بدون استثناء أضف التنبيه الشرعي حرفياً كما في قواعد التنسيق أعلاه';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_FALLBACKS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash'
];

const VISION_MODEL_FALLBACKS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash'
];

function getRawApiKey() {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) return null;
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

function getKeyVariants() {
  const raw = getRawApiKey();
  if (!raw) return [];
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

function getApiKey() {
  return getRawApiKey();
}

function validateKeyFormat(apiKey) {
  if (!apiKey) {
    return { valid: false, reason: 'GEMINI_API_KEY غير موجود في .env' };
  }
  return { valid: true };
}

function parseGeminiError(err) {
  const msg = err?.message || String(err);
  const code = err?.code || '';
  if (/API_KEY_INVALID|API key not valid|INVALID_ARGUMENT.*key/i.test(msg)) {
    return { type: 'key', message: 'مفتاح Gemini API غير صالح' };
  }
  if (/PERMISSION_DENIED|403 Forbidden/i.test(msg)) {
    return { type: 'permission', message: 'صلاحية المفتاح مرفوضة' };
  }
  if (/429|RESOURCE_EXHAUSTED|quota|rate limit|exceeded your current quota/i.test(msg)) {
    return { type: 'quota', message: 'تم تجاوز حد استخدام Gemini API' };
  }
  if (/404|not found|is not supported/i.test(msg)) {
    return { type: 'model', message: 'النموذج غير متاح حالياً' };
  }
  if (/UNABLE_TO_VERIFY|certificate|CERT_/i.test(msg + code)) {
    return { type: 'network', message: 'فشل الاتصال الآمن بـ Google (شهادة SSL)' };
  }
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|timeout/i.test(msg + code)) {
    return { type: 'network', message: 'انقطع الاتصال بخوادم Google' };
  }
  return { type: 'unknown', message: msg };
}

function shouldStopOnError(parsed) {
  return FATAL_ERROR_TYPES.has(parsed.type);
}

function extractTextFromResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    const block = data?.promptFeedback?.blockReason;
    if (block) throw new Error(`تم حظر الطلب: ${block}`);
    throw new Error('لم يُرجع Gemini نصاً في الرد');
  }
  return parts.map((p) => p.text || '').join('').trim();
}

async function generateWithFetch(apiKey, model, question, systemInstruction) {
  const url = `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: question }] }]
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await postGemini(url, body);
  const data = response.data;
  if (response.status < 200 || response.status >= 300) {
    const errMsg = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return { text: extractTextFromResponse(data), model, apiKey, via: 'fetch' };
}

async function generateWithSdk(apiKey, model, question, systemInstruction) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const options = { model };
  if (systemInstruction) options.systemInstruction = systemInstruction;
  const geminiModel = genAI.getGenerativeModel(options);
  const result = await geminiModel.generateContent(question);
  const text = result.response.text();
  return { text, model, apiKey, via: 'sdk' };
}

async function generateWithModel(apiKey, model, question, systemInstruction) {
  try {
    return await generateWithFetch(apiKey, model, question, systemInstruction);
  } catch (fetchErr) {
    try {
      return await generateWithSdk(apiKey, model, question, systemInstruction);
    } catch (sdkErr) {
      const fetchParsed = parseGeminiError(fetchErr);
      const sdkParsed = parseGeminiError(sdkErr);
      if (fetchParsed.type === 'model' && sdkParsed.type !== 'model') throw sdkErr;
      throw fetchErr;
    }
  }
}

async function generateWithFetchParts(apiKey, model, parts, systemInstruction) {
  const url = `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts }]
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await postGemini(url, body);
  const data = response.data;
  if (response.status < 200 || response.status >= 300) {
    const errMsg = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return { text: extractTextFromResponse(data), model, via: 'fetch' };
}

async function tryModelsWithKeys(generateFn, modelList) {
  const keyVariants = getKeyVariants();
  if (!keyVariants.length) {
    throw new Error('GEMINI_API_KEY غير موجود في ملف .env');
  }

  let lastError = null;
  let lastFatal = null;

  for (const apiKey of keyVariants) {
    for (const model of modelList) {
      try {
        return await generateFn(apiKey, model);
      } catch (err) {
        lastError = err;
        const parsed = parseGeminiError(err);
        if (parsed.type === 'model') continue;
        if (shouldStopOnError(parsed)) {
          lastFatal = err;
          break;
        }
      }
    }
  }

  throw lastFatal || lastError || new Error('فشل الاتصال بـ Gemini');
}

async function askGeminiWithParts(parts, systemInstruction, modelList = VISION_MODEL_FALLBACKS) {
  return tryModelsWithKeys(
    (apiKey, model) => generateWithFetchParts(apiKey, model, parts, systemInstruction),
    modelList
  );
}

async function askGeminiVision(imageBase64, mimeType, prompt, systemInstruction) {
  const parts = [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: imageBase64 } }
  ];
  return askGeminiWithParts(parts, systemInstruction, VISION_MODEL_FALLBACKS);
}

async function askGeminiAudio(audioBase64, mimeType, prompt, systemInstruction) {
  const parts = [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: audioBase64 } }
  ];
  return askGeminiWithParts(parts, systemInstruction, VISION_MODEL_FALLBACKS);
}

async function askGemini(question, systemInstruction, meta = {}) {
  const result = await tryModelsWithKeys(
    (apiKey, model) => generateWithModel(apiKey, model, question, systemInstruction),
    MODEL_FALLBACKS
  );
  const answer = result.text;

  const sensitiveKeywords = [
    'حلال', 'حرام', 'فتوى', 'طلاق', 'ربا', 'زكاة',
    'جهاد', 'كفر', 'شرك', 'بدعة', 'حد', 'قصاص',
    'ميراث', 'نكاح', 'خلع', 'ردة'
  ];
  const isSensitive = sensitiveKeywords.some(keyword =>
    question.toLowerCase().includes(keyword)
  );

  const userId = meta.userId;
  if (userId) {
    try {
      const dbModule = require('../database');
      if (dbModule.saveAIResponse) {
        dbModule.saveAIResponse({
          userId: String(userId),
          question,
          answer,
          mode: meta.mode || 'general',
          isSensitive,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error('Error saving AI response:', e.message);
    }
  }

  return { text: answer, model: result.model };
}

async function askGeminiWithImage(imageBase64, mimeType, question, systemInstruction, meta = {}) {
  const parts = [
    { text: question || 'حلل هذه الصورة وأجب من منظور إسلامي' },
    { inline_data: { mime_type: mimeType, data: imageBase64 } }
  ];

  const result = await tryModelsWithKeys(
    (apiKey, model) => generateWithFetchParts(apiKey, model, parts, systemInstruction),
    VISION_MODEL_FALLBACKS
  );
  const text = result.text;

  if (meta.userId) {
    try {
      const dbModule = require('../database');
      if (dbModule.saveAIResponse) {
        dbModule.saveAIResponse({
          userId: String(meta.userId),
          question: '[صورة] ' + (question || ''),
          answer: text,
          mode: meta.mode || 'image',
          isSensitive: false,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error('Error saving image AI response:', e.message);
    }
  }

  return { text, model: result.model };
}

async function testConnection() {
  const keyVariants = getKeyVariants();
  const apiKey = keyVariants[0] || null;
  const formatCheck = validateKeyFormat(apiKey);
  const results = {
    apiKeyPresent: Boolean(apiKey),
    formatCheck,
    models: [],
    keyVariantUsed: null,
    failureType: null,
    failureMessage: null
  };

  if (!keyVariants.length) return results;

  for (const variant of keyVariants) {
    for (const model of MODEL_FALLBACKS) {
      try {
        const { text, via } = await generateWithModel(variant, model, 'قل: تم');
        results.models.push({ model, ok: true, sample: text.slice(0, 40), via });
        results.workingModel = model;
        results.keyVariantUsed = variant.length;
        results.via = via;
        return results;
      } catch (err) {
        const parsed = parseGeminiError(err);
        results.models.push({ model, ok: false, error: parsed.message, type: parsed.type });
        if (!results.failureType || shouldStopOnError(parsed)) {
          results.failureType = parsed.type;
          results.failureMessage = parsed.message;
        }
        if (shouldStopOnError(parsed)) return results;
      }
    }
  }

  return results;
}

module.exports = {
  MODEL_FALLBACKS,
  VISION_MODEL_FALLBACKS,
  MUSLIM_ANSWER_FOOTER,
  MUSLIM_FOOTER_PROMPT_RULE,
  MUSLIM_FORMAT_PROMPT_RULE,
  getApiKey,
  getKeyVariants,
  validateKeyFormat,
  parseGeminiError,
  askGemini,
  askGeminiVision,
  askGeminiAudio,
  askGeminiWithImage,
  testConnection
};

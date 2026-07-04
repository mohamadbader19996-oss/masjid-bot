require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');

const OUTPUT = path.join(__dirname, 'data', 'quotes_draft.json');
const DELAY_MS = 2500;

const SYSTEM =
  'You are a conservative Islamic knowledge assistant for draft curation only. ' +
  'Return ONLY valid JSON arrays with no markdown and no commentary. ' +
  'Use accurate classical Arabic. Include ONLY well-attested items with clear named attribution and book source. ' +
  'If uncertain, OMIT the item entirely. Never use placeholders like "غير منسوب" or vague sources. ' +
  'Never include weak/fabricated hadith. Never attribute prophetic hadith to companions as their own words. ' +
  'For companions/followers: include ONLY their independent sayings (أقوال), NOT narrations of prophetic hadith. ' +
  'Do NOT cite Sahih al-Bukhari, Sahih Muslim, Sunan collections, or Musnad as sources for companion quotes — those are hadith books. ' +
  'Do NOT repeat or paraphrase any item from the exclusion list provided.';

const HADITH_SOURCES =
  /بخاري|مسلم|ترمذي|نسائي|أبو داود|ابن ماجه|مسند|سنن|معجم|صحيح|موطأ/i;

const KNOWN_HADITH_PHRASES = [
  /خير الجهاد كلمة عدل/i,
  /ما تركت شيئاً أحب إلي.*من الموت/i,
  /رأس الحكمة مخافة الله/i,
  /إنما الأعمال بالنيات/i,
  /من كان يؤمن بالله/i,
  /لا يؤمن أحدكم/i,
  /المسلم من سلم/i,
  /الدين النصيحة/i,
  /طلب العلم فريضة/i,
  /من سلك طريقاً يلتمس/i,
  /العلم بالتعلم والحلم بالتحلم/i,
  /لو أنفق أحدكم ملء الأرض ذهباً/i,
  /إذا أحب الله عبداً.*لم يضر/i
];

const ALLOWED_SCHOLAR_NAMES =
  /تيمية|الغزالي|ابن القيم|الزرعي|الشافعي|النووي|ابن تيمية|ابن عبد الحليم|ابن حجر|الطبري|الذهبي|العسقلاني|محمد بن جرير/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return String(text || '')
    .replace(/[.…\s]+/g, ' ')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, '')
    .trim()
    .toLowerCase();
}

function loadExisting() {
  return JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
}

function buildExclusionSummary(existing, key) {
  return existing[key].map((item, i) => {
    if (key === 'wisdom') {
      return `${i + 1}. [${item.person}] ${item.text.slice(0, 120)}… (${item.source})`;
    }
    if (key === 'scholars') {
      return `${i + 1}. [${item.scholar}] ${item.text.slice(0, 120)}… (${item.source})`;
    }
    return `${i + 1}. ${item.text} (${item.source})`;
  }).join('\n');
}

function buildRequests(existing) {
  const wisdomExclude = buildExclusionSummary(existing, 'wisdom');
  const scholarsExclude = buildExclusionSummary(existing, 'scholars');
  const poetryExclude = buildExclusionSummary(existing, 'poetry');

  return [
    {
      key: 'wisdom',
      prompt:
        'اعطني 20 قولاً إضافياً موثقاً لصحابة وتابعين آخرين غير المذكورين في هذه القائمة، ' +
        'كل قول منسوب لاسم محدد بالكامل مع مصدره الكتابي.\n\n' +
        'قواعد صارمة:\n' +
        '- لا النبي ﷺ، ولا أحاديث نبوية منسوبة للصحابة.\n' +
        '- لا تذكر النبي ﷺ في نص القول.\n' +
        '- لا تستخدم كمصدر: صحيح البخاري، صحيح مسلم، السنن، المساند، المعاجم الحديثية.\n' +
        '- لا تكرر أي قول من القائمة الحالية أدناه (لا نفس النص ولا نفس المعنى بصياغة قريبة).\n' +
        '- احذف أي قول بلا مصدر دقيق، حتى لو قلّ العدد عن 20.\n\n' +
        'القائمة الحالية (ممنوع التكرار):\n' +
        `${wisdomExclude}\n\n` +
        'أرجع JSON array فقط:\n' +
        '[{"text":"...","person":"الاسم الكامل","source":"اسم الكتاب"}]'
    },
    {
      key: 'scholars',
      prompt:
        'اعطني 15 قولاً إضافياً موثقاً لعلماء إسلام (يمكن تكرار نفس العلماء بأقوال مختلفة، ' +
        'أو علماء جدد كابن حجر العسقلاني، الطبري، الذهبي) غير المذكورة في هذه القائمة، ' +
        'كل قول مع مصدره الكتابي بدقة.\n\n' +
        'قواعد صارمة:\n' +
        '- النص من مؤلفات العلماء أنفسهم، لا أحاديث ينقلونها.\n' +
        '- لا تنسب لهم أحاديث نبوية مشهورة.\n' +
        '- لا تكرر أي قول من القائمة الحالية أدناه.\n' +
        '- احذف أي قول غير مؤكد المصدر.\n\n' +
        'القائمة الحالية (ممنوع التكرار):\n' +
        `${scholarsExclude}\n\n` +
        'أرجع JSON array فقط:\n' +
        '[{"text":"...","scholar":"الاسم الكامل","source":"اسم الكتاب"}]'
    },
    {
      key: 'poetry',
      prompt:
        'اعطني 15 بيتاً إضافياً من ديوان الإمام الشافعي فقط، غير الأبيات المذكورة في هذه القائمة.\n\n' +
        'قواعد صارمة:\n' +
        '- الشاعر: الإمام الشافعي فقط.\n' +
        '- لا شعراء جاهليون ولا معري ولا متنبي.\n' +
        '- لا تكرر أي بيت من القائمة الحالية أدناه.\n\n' +
        'القائمة الحالية (ممنوع التكرار):\n' +
        `${poetryExclude}\n\n` +
        'أرجع JSON array فقط:\n' +
        '[{"text":"...","poet":"الإمام الشافعي","source":"ديوان الإمام الشافعي"}]'
    }
  ];
}

function parseJsonArrayFromText(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) {
    throw new Error('لم يُعثر على JSON array في رد Gemini');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function validateItem(item, key) {
  if (!item || typeof item.text !== 'string' || !item.text.trim()) return false;
  if (key === 'wisdom') return Boolean(item.person?.trim() && item.source?.trim());
  if (key === 'scholars') return Boolean(item.scholar?.trim() && item.source?.trim());
  if (key === 'poetry') return Boolean(item.poet?.trim() && item.source?.trim());
  return false;
}

function sanitizeItems(items, key, existingTexts) {
  const blocked = /غير منسوب|ضعيف|موضوع|مشكوك|⚠️/i;
  const seen = new Set(existingTexts);

  return items.filter((item) => {
    if (!validateItem(item, key)) return false;

    const blob = `${item.text} ${item.person || ''} ${item.scholar || ''} ${item.source || ''}`;
    if (blocked.test(blob)) return false;

    const norm = normalizeText(item.text);
    if (!norm || seen.has(norm)) return false;

    if (key === 'wisdom') {
      if (/محمد|النبي|رسول الله|ﷺ|صلى الله عليه وسلم/i.test(item.text)) return false;
      if (/محمد|النبي|رسول الله|ﷺ/i.test(item.person || '')) return false;
      if (HADITH_SOURCES.test(item.source || '')) return false;
      if (KNOWN_HADITH_PHRASES.some((re) => re.test(item.text))) return false;
    }

    if (key === 'scholars') {
      if (!ALLOWED_SCHOLAR_NAMES.test(item.scholar || '')) return false;
      if (KNOWN_HADITH_PHRASES.some((re) => re.test(item.text))) return false;
      if (/قال رسول|قال النبي|عن النبي|رواه|حدثنا/i.test(item.text)) return false;
    }

    if (key === 'poetry') {
      if (!/شافعي/i.test(item.poet || '')) return false;
      if (/امرؤ|امرئ|المتنبي|المعري|البحتري|الجاهل/i.test(blob)) return false;
      if (!/ديوان.*شافعي|شافعي/i.test(item.source || '')) return false;
    }

    seen.add(norm);
    return true;
  });
}

function collectExistingTexts(existing) {
  const all = [];
  for (const key of ['wisdom', 'scholars', 'poetry']) {
    for (const item of existing[key]) {
      all.push(normalizeText(item.text));
    }
  }
  return all;
}

async function fetchCategory(req, existingTexts) {
  console.log(`\n📥 جلب إضافي: ${req.key}...`);
  const { text, model } = await askGemini(req.prompt, SYSTEM);
  console.log(`   ✅ تم عبر ${model}`);
  const parsed = parseJsonArrayFromText(text);
  const before = parsed.length;
  const items = sanitizeItems(parsed, req.key, existingTexts);
  if (before > items.length) {
    console.log(`   🧹 حُذف ${before - items.length} عنصراً (تصفية/تكرار)`);
  }
  for (const item of items) {
    existingTexts.push(normalizeText(item.text));
  }
  return items;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const existing = loadExisting();
  const beforeCounts = {
    wisdom: existing.wisdom.length,
    scholars: existing.scholars.length,
    poetry: existing.poetry.length
  };
  const existingTexts = collectExistingTexts(existing);
  const requests = buildRequests(existing);
  const added = { wisdom: [], scholars: [], poetry: [] };

  for (let i = 0; i < requests.length; i += 1) {
    const req = requests[i];
    const items = await fetchCategory(req, existingTexts);
    added[req.key] = items;
    existing[req.key].push(...items);
    console.log(`   → أُضيف ${items.length} عنصراً جديداً`);
    if (i < requests.length - 1) await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2), 'utf8');

  const newOnlyPath = path.join(__dirname, 'data', 'quotes_draft_new.json');
  fs.writeFileSync(newOnlyPath, JSON.stringify(added, null, 2), 'utf8');

  console.log('\n✅ تم الإلحاق →', OUTPUT);
  console.log('   قبل:', beforeCounts);
  console.log('   أُضيف:', {
    wisdom: added.wisdom.length,
    scholars: added.scholars.length,
    poetry: added.poetry.length
  });
  console.log('   بعد:', {
    wisdom: existing.wisdom.length,
    scholars: existing.scholars.length,
    poetry: existing.poetry.length
  });
  console.log('   المحتوى الجديد فقط →', newOnlyPath);
}

main().catch((err) => {
  console.error('❌ فشل التوليد الإضافي:', err.message);
  process.exit(1);
});

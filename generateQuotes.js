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
  'Do NOT cite Sahih al-Bukhari, Sahih Muslim, Sunan collections, or Musnad as sources for companion quotes — those are hadith books.';

const REQUESTS = [
  {
    key: 'wisdom',
    prompt:
      'اعطني 20 قولاً موثقاً فقط لصحابة وتابعين محددين بالاسم (لا النبي ﷺ، تلك أحاديث ولها قسم آخر) — ' +
      'كل قول يجب أن يكون منسوباً لشخص محدد بالاسم الكامل مع مصدره الكتابي ' +
      '(لا "غير منسوب" نهائياً، احذف أي قول لا تجد له ناسباً ومصدراً واضحين، حتى لو قلّ العدد عن 20).\n\n' +
      'قواعد صارمة:\n' +
      '- أقوال مستقلة للصحابي/التابعي فقط، وليست أحاديث نبوية يرويها عن النبي ﷺ.\n' +
      '- لا تذكر النبي ﷺ في نص القول.\n' +
      '- لا تستخدم كمصدر: صحيح البخاري، صحيح مسلم، السنن الأربعة، المساند، المعاجم الحديثية.\n' +
      '- المصادر المقبولة: كتب التراجم، الزهد، الآداب، التاريخ، نهج البلاغة (لعلي)، حلية الأولياء، سير أعلام النبلاء، تاريخ بغداد، تهذيب الكمال، الأدب المفرد.\n' +
      '- أمثلة مقبولة: مواعظ عمر، حكم علي في نهج البلاغة، أقوال التابعين في كتب الزهد والتراجم.\n\n' +
      'أرجع JSON array فقط بهذا الشكل بالضبط:\n' +
      '[{"text":"...","person":"الاسم الكامل","source":"اسم الكتاب أو المصدر"}]'
  },
  {
    key: 'scholars',
    prompt:
      'اعطني 15 قولاً موثقاً فقط لعلماء إسلام محددين بالاسم الكامل ' +
      '(ابن تيمية، الغزالي، ابن القيم، الشافعي، النووي) مع اسم الكتاب الذي ورد فيه القول بدقة — ' +
      'احذف أي قول غير مؤكد المصدر.\n\n' +
      'قواعد صارمة:\n' +
      '- النص يجب أن يكون من مؤلفات العلماء نفسهم، لا أحاديث ينقلونها.\n' +
      '- لا تنسب لهم أحاديث نبوية مشهورة (مثل: رأس الحكمة مخافة الله).\n' +
      '- ابن تيمية: من مجموع الفتاوى، الإيمان، اقتضاء الصراط.\n' +
      '- الغزالي: من إحياء علوم الدين، المنجد، كيمياء السعادة.\n' +
      '- ابن القيم: من مدارج السالكين، زاد المعاد، إغاثة اللهفان.\n' +
      '- الشافعي: من الرسالة، الأم، المسند (للشافعي).\n' +
      '- النووي: من رياض الصالحين، الأذكار، شرح مسلم، التبيان.\n\n' +
      'أرجع JSON array فقط بهذا الشكل:\n' +
      '[{"text":"...","scholar":"الاسم الكامل","source":"اسم الكتاب"}]'
  },
  {
    key: 'poetry',
    prompt:
      'اعطني فقط أبياتاً من ديوان الإمام الشافعي (لا شعراء آخرين، لا شعراء جاهليين، لا شعراء مثيرين للجدل العقدي) — ' +
      '10 أبيات أو مقاطع موثقة من ديوانه المعروف.\n\n' +
      'قواعد صارمة:\n' +
      '- الشاعر: الإمام الشافعي فقط.\n' +
      '- لا شعر لامية العرب، لا امرؤ القيس، لا المتنبي، لا أبو العلاء المعري.\n' +
      '- أبيات من ديوانه المعروف في الزهد والحكمة والدين.\n\n' +
      'أرجع JSON array فقط بهذا الشكل:\n' +
      '[{"text":"...","poet":"الإمام الشافعي","source":"ديوان الإمام الشافعي"}]'
  }
];

// مصادر حديثية — لا تُستخدم لقسم الحكم
const HADITH_SOURCES =
  /بخاري|مسلم|ترمذي|نسائي|أبو داود|ابن ماجه|مسند|سنن|معجم|صحيح|موطأ/i;

// عبارات حديثية معروفة — تُستبعد من wisdom
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
  /العلم بالتعلم والحلم بالتحلم/i
];

const ALLOWED_SCHOLAR_NAMES =
  /تيمية|الغزالي|ابن القيم|الزرعي|الشافعي|النووي|ابن تيمية|ابن عبد الحليم/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (key === 'wisdom') {
    return Boolean(item.person?.trim() && item.source?.trim());
  }
  if (key === 'scholars') {
    return Boolean(item.scholar?.trim() && item.source?.trim());
  }
  if (key === 'poetry') {
    return Boolean(item.poet?.trim() && item.source?.trim());
  }
  return false;
}

function sanitizeItems(items, key) {
  const blocked = /غير منسوب|ضعيف|موضوع|مشكوك|⚠️/i;
  return items.filter((item) => {
    if (!validateItem(item, key)) return false;

    const blob = `${item.text} ${item.person || ''} ${item.scholar || ''} ${item.source || ''}`;
    if (blocked.test(blob)) return false;

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

    return true;
  });
}

async function fetchCategory({ key, prompt }) {
  console.log(`\n📥 جلب تصنيف: ${key}...`);
  const { text, model } = await askGemini(prompt, SYSTEM);
  console.log(`   ✅ تم عبر ${model}`);
  const parsed = parseJsonArrayFromText(text);
  const before = parsed.length;
  const items = sanitizeItems(parsed, key);
  if (before > items.length) {
    console.log(`   🧹 حُذف ${before - items.length} عنصراً غير مطابق للمعايير`);
  }
  return items;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const out = { wisdom: [], scholars: [], poetry: [] };

  for (let i = 0; i < REQUESTS.length; i += 1) {
    const req = REQUESTS[i];
    out[req.key] = await fetchCategory(req);
    console.log(`   → ${out[req.key].length} عنصراً بعد التصفية`);
    if (i < REQUESTS.length - 1) await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
  const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
  console.log(`\n✅ حُفظ → ${OUTPUT} (${sizeKb} KB)`);
  console.log(`   wisdom: ${out.wisdom.length} | scholars: ${out.scholars.length} | poetry: ${out.poetry.length}`);
}

main().catch((err) => {
  console.error('❌ فشل التوليد:', err.message);
  process.exit(1);
});

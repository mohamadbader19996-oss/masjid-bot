require('dotenv').config();
const { askGemini } = require('./src/services/gemini');

const SYSTEM =
  'أنت كاتب قصص اعتناق إسلام بالعربية الفصحى الدافئة. ' +
  'أرجع JSON object واحد فقط: {"story":"..."} بدون markdown. ' +
  'لا تبدأ ببسم الله. لا تواريخ محددة. ' +
  'عدد الكلمات إلزامي — إن طُلب 180 كلمة فاكتب 175-185 كلمة بالضبط. ' +
  'القصة في فقرة واحدة متدفقة بدون أسطر فارغة.';

const REQUESTS = [
  {
    name: 'مالكوم إكس',
    targetWords: 180,
    prompt:
      'اكتب قصة اعتناق إسلام عن مالكوم إكس — يجب أن تكون 180 كلمة بالضبط (175-185).\n\n' +
      'المطلوب:\n' +
      '- فقرة واحدة متدفقة\n' +
      '- أسلوب سردي دافئ، ابدأ بلحظة مؤثرة أو سؤال\n' +
      '- نشأ في الفقر والغضب والكراهية العنصرية\n' +
      '- السجن واكتشاف الإسلام\n' +
      '- وصف أعمق للحج: رأى البياض والأسود والأحمر يصلون معاً كأخوة، سواسية أمام الله\n' +
      '- أدرك أن العنصرية خطيئة لا دين\n' +
      '- اختم بجملة عن رحلته من الكراهية للمحبة\n' +
      'أرجع: {"story":"..."}'
  },
  {
    name: 'محمد علي كلاي',
    targetWords: 180,
    prompt:
      'اكتب قصة اعتناق إسلام عن محمد علي (كاسيوس كلاي) — يجب أن تكون 180 كلمة بالضبط (175-185).\n\n' +
      'المطلوب:\n' +
      '- فقرة واحدة متدفقة\n' +
      '- أسلوب سردي دافئ، ابدأ بلحظة مؤثرة\n' +
      '- لحظة إنسانية محددة: رفض الذهاب للحرب وقوله "لا عداء لي مع الفيتناميين" وخسارة لقبه\n' +
      '- كيف وجد في الإسلام معنى الكرامة الإنسانية الحقيقية بعيداً عن الحلبة\n' +
      '- تغيير الاسم إلى محمد علي\n' +
      '- اختم بجملة ملهمة عن ما وجده في الإسلام\n' +
      'أرجع: {"story":"..."}'
  },
  {
    name: 'لورين بوث',
    targetWords: 150,
    prompt:
      'اكتب قصة اعتناق إسلام عن لورين بوث من الصفر — يجب أن تكون 150 كلمة بالضبط (145-155).\n\n' +
      'المطلوب:\n' +
      '- فقرة واحدة متدفقة فقط\n' +
      '- لا مقدمة رسمية\n' +
      '- ابدأ بلحظة محددة شعرت فيها بالسكينة في المسجد (إيران/طهران)\n' +
      '- شقيقة زوجة رئيس وزراء بريطانيا، صحفية\n' +
      '- اختم بجملة ملهمة واحدة قوية\n' +
      'أرجع: {"story":"..."}'
  }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJson(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (m) {
      const story = m[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      return { story };
    }
    throw new Error('تعذّر تحليل JSON');
  }
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

async function generateWithRetry(req, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const extra =
      attempt > 1
        ? `\n\nتحذير: المحاولة السابقة كانت قصيرة جداً. اكتب ${req.targetWords} كلمة بالضبط. وسّع الوصف.`
        : '';
    const { text, model } = await askGemini(req.prompt + extra, SYSTEM);
    const { story } = parseJson(text);
    const words = countWords(story);
    console.log(`   محاولة ${attempt}: ${model} | ${words} كلمة`);
    if (words >= req.targetWords - 10 && words <= req.targetWords + 10) {
      return { name: req.name, story: story.replace(/\n+/g, ' ').trim(), wordCount: words };
    }
  }
  const { text, model } = await askGemini(
    req.prompt +
      `\n\nهذه المحاولة الأخيرة: اكتب بالضبط ${req.targetWords} كلمة. عدّ الكلمات قبل الإرسال.`,
    SYSTEM
  );
  const { story } = parseJson(text);
  const words = countWords(story);
  console.log(`   محاولة أخيرة: ${model} | ${words} كلمة`);
  return { name: req.name, story: story.replace(/\n+/g, ' ').trim(), wordCount: words };
}

async function main() {
  const results = [];
  for (let i = 0; i < REQUESTS.length; i += 1) {
    const req = REQUESTS[i];
    console.log(`\n📖 ${req.name} (هدف: ${req.targetWords} كلمة)...`);
    results.push(await generateWithRetry(req));
    if (i < REQUESTS.length - 1) await sleep(3000);
  }
  console.log('\n---RESULTS_JSON---');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');

const OUTPUT = path.join(__dirname, 'data', 'conversion_stories_draft.json');
const DELAY_MS = 3000;

const SYSTEM =
  'أنت كاتب قصص اعتناق إسلام موجّه للمسلمين الجدد والدعاة. ' +
  'اكتب بالعربية الفصحى الدافئة، بأسلوب سردي قصصي مؤثر. ' +
  'أرجع JSON object واحد فقط بدون markdown وبدون تعليق إضافي. ' +
  'لا تخترع حقائق تاريخية دقيقة؛ التزم بالمعروف عن الشخصية. ' +
  'لا تبدأ ببسم الله أو مقدمة رسمية.';

const GENERAL_RULES =
  'قواعد إلزامية:\n' +
  '- 150-200 كلمة فقط (قصيرة ومؤثرة)\n' +
  '- أسلوب سردي دافئ يلامس القلب\n' +
  '- لا تبدأ بـ"بسم الله" أو مقدمة رسمية\n' +
  '- ابدأ مباشرة بلحظة مؤثرة أو سؤال يشد القارئ\n' +
  '- لا تذكر تواريخ محددة (تقريبية فقط)\n' +
  '- اختم بجملة ملهمة عن ما وجده هذا الشخص في الإسلام\n\n' +
  'أرجع JSON بهذا الشكل بالضبط:\n' +
  '{"story":"نص القصة هنا","tags":["وسم1","وسم2"]}';

const CHARACTERS = [
  {
    id: 'yusuf_islam',
    name: 'يوسف إسلام',
    subtitle: 'كات ستيفنز — مغني بريطاني شهير كان في قمة مجده ثم ترك كل شيء',
    angle:
      'كيف أنقذه القرآن من الغرق حرفياً وروحياً — لحظة الغرق في البحر وقراءة القرآن ثم اعتناق الإسلام وترك الموسيقى',
    suggestedTags: ['فنان', 'مشهور']
  },
  {
    id: 'malcolm_x',
    name: 'مالكوم إكس',
    subtitle: 'رجل نشأ في الفقر والغضب والكراهية',
    angle:
      'كيف حوّله الإسلام من رمز للكره إلى رسول للمحبة والعدالة — السجن، اكتشاف الإسلام، الحج وتغيّر نظرته للعالم',
    suggestedTags: ['سياسي', 'ناشط']
  },
  {
    id: 'muhammad_ali',
    name: 'محمد علي كلاي',
    subtitle: 'بطل الملاكمة الذي رفض الحرب وخسر لقبه',
    angle:
      'كيف منحه الإسلام انتصاراً أعظم من كل بطولاته — كاسيوس كلاي، رفض التجنيد، تغيير الاسم، الوقوف أمام المبادئ',
    suggestedTags: ['رياضي', 'مشهور']
  },
  {
    id: 'yusuf_estes',
    name: 'يوسف إستس',
    subtitle: 'رجل دين مسيحي أمريكي جاء ليحوّل مسلماً للمسيحية',
    angle:
      'فانتهى بأن اعتنق الإسلام هو نفسه — قسّ بروتستانتي، جاء لدعوة مسلمين، فاكتشف الحق في الإسلام',
    suggestedTags: ['رجل دين', 'قس سابق']
  },
  {
    id: 'lauren_booth',
    name: 'لورين بوث',
    subtitle: 'شقيقة زوجة رئيس وزراء بريطانيا',
    angle:
      'كيف وجدت في زيارة إيران ما لم تجده في قصور لندن — صحفية بريطانية، زيارة إيران، السكينة في الصلاة والإسلام',
    suggestedTags: ['سياسي', 'صحفية']
  },
  {
    id: 'jeffrey_lang',
    name: 'جيفري لانج',
    subtitle: 'أستاذ رياضيات ملحد جادل الإسلام بالعقل',
    angle:
      'فانتصر الإسلام بنفس السلاح — أستاذ جامعي، شكوك في المسيحية، قراءة القرآن بعقل ناقد، اعتناق الإسلام',
    suggestedTags: ['ملحد سابق', 'أكاديمي']
  },
  {
    id: 'joram_van_klaveren',
    name: 'يورام فان كلافيرين',
    subtitle: 'برلماني هولندي كان يكتب كتاباً ضد الإسلام',
    angle:
      'فانتهى بأن اعتنق الإسلام قبل أن ينهي الكتاب — سياسي معادٍ للإسلام، بحث للكتاب، اكتشف الحق واعتنق الإسلام',
    suggestedTags: ['سياسي', 'معادٍ سابق']
  }
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJsonFromText(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  return JSON.parse(raw);
}

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

async function generateStory(character) {
  const prompt =
    `اكتب قصة اعتناق إسلام قصيرة عن: ${character.name}\n` +
    `العنوان الفرعي: ${character.subtitle}\n` +
    `الزاوية السردية: ${character.angle}\n\n` +
    `${GENERAL_RULES}\n` +
    `الوسوم المقترحة (اختر 1-3 منها أو أضف مناسباً): ${character.suggestedTags.join('، ')}`;

  console.log(`\n📖 توليد قصة: ${character.name}...`);
  const { text, model } = await askGemini(prompt, SYSTEM);
  console.log(`   ✅ تم عبر ${model}`);

  const parsed = parseJsonFromText(text);
  const story = String(parsed.story || '').trim();
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : character.suggestedTags;
  const words = countWords(story);
  console.log(`   → ${words} كلمة | الوسوم: ${tags.join('، ')}`);

  return {
    id: character.id,
    name: character.name,
    subtitle: character.subtitle,
    story,
    tags,
    wordCount: words
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < CHARACTERS.length; i += 1) {
    const entry = await generateStory(CHARACTERS[i]);
    const { wordCount, ...saveEntry } = entry;
    results.push(saveEntry);
    if (i < CHARACTERS.length - 1) await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf8');
  const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
  console.log(`\n✅ حُفظ → ${OUTPUT} (${sizeKb} KB)`);
  console.log(`   ${results.length} قصص جاهزة للمراجعة`);
}

main().catch((err) => {
  console.error('❌ فشل التوليد:', err.message);
  process.exit(1);
});

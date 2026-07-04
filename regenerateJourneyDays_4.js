require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const DRAFT = path.join(__dirname, 'data', 'journey_content_draft_phase2.json');

const SYSTEM =
  'أنت مساعد إسلامي لتعليم المسلمين الجدد. أرجع نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله.';

const DAY_SPECS = {
  10: {
    title: 'مبطلات الوضوء',
    extra:
      'المحتوى الحالي للمرجع:\n' +
      '"تذكر يا صديقي أن هناك بعض الأشياء التي تجعل الوضوء الذي قمت به غير صحيح..."\n' +
      'أعد كتابة نفس المعنى لكن احذف "يا صديقي" من البداية واستبدلها بمطلع طبيعي مختلف.'
  },
  14: {
    title: 'كيفية الصلاة (التكبير والقيام والقراءة)',
    extra:
      'المحتوى الحالي للمرجع:\n' +
      '"يا صديقي، خطوتك اليوم في تعلم الصلاة رائعة..."\n' +
      'أعد كتابة نفس المعنى لكن احذف "يا صديقي" من البداية. ' +
      'أنهِ النص حرفياً بهذه الجملة (انسخها كما هي في السطر الأخير):\n' +
      '💡 راجع خطوات الصلاة كاملة من زر 📿 فقه الصلاة في القائمة الرئيسية'
  },
  15: {
    title: 'كيفية الصلاة (الركوع والسجود والتسليم)',
    extra:
      'المحتوى الحالي للمرجع:\n' +
      '"اليوم سنتعلم شيئاً مهماً جداً في صلاتنا: الركوع والسجود..."\n' +
      'أعد كتابة نفس المعنى لكن احذف "يا صديقي" إن وُجد، واحذف أي إشارة لمشاهدة فيديوهات أو مساعدة شخص ليُظهر الحركات. ' +
      'أنهِ النص حرفياً بهذه الجملة:\n' +
      '💡 راجع خطوات الصلاة كاملة من زر 📿 فقه الصلاة في القائمة الرئيسية'
  },
  17: {
    title: 'حفظ سورة قصيرة ثانية',
    extra:
      'المحتوى الحالي للمرجع:\n' +
      '"اليوم سنبدأ في حفظ سورة جديدة، يا صديقي. سورة الإخلاص، مثلاً..."\n' +
      'أعد كتابة نفس المعنى لكن احذف "يا صديقي" واستبدل "سورة الإخلاص، مثلاً" بـ"سورة الإخلاص" فقط (بدون مثلاً). ' +
      'أنهِ النص حرفياً بهذه الجملة:\n' +
      '💡 يمكنك الاستماع لسورة الإخلاص من زر 📖 القرآن الكريم في القائمة الرئيسية'
  }
};

function buildPrompt(dayEntry, spec) {
  const { day, phase, title, guidance } = dayEntry;
  const guidanceText = guidance?.ar || '';
  return (
    `أنت مساعد إسلامي متخصص بتعليم المسلمين الجدد. اكتب رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلم الجديد عن موضوع: [${title}]. ` +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة، كأنك تخاطب شخصاً لا يعرف شيئاً عن الإسلام. ' +
    "لا تبدأ بـ'بسم الله' ولا بأي مقدمة دينية رسمية — ابدأ مباشرة بالموضوع. " +
    'لا تضع عناوين أو نقاط، فقط نص متدفق طبيعي. ' +
    `السياق: هذا اليوم ${day} من رحلة 40 يوماً، المرحلة: ${phase}، وتوجيه المرافق (لمعلوماتك فقط لا تذكره): ${guidanceText}.\n\n` +
    `تعليمات خاصة لهذا اليوم:\n${spec.extra}`
  );
}

function cleanContent(text) {
  return String(text || '')
    .trim()
    .replace(/^```[\s\S]*?\n/, '')
    .replace(/\n```$/, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
}

async function main() {
  const draft = JSON.parse(fs.readFileSync(DRAFT, 'utf8'));
  const results = {};

  for (const dayNum of [10, 14, 15, 17]) {
    const dayEntry = JOURNEY_DAYS.find((d) => d.day === dayNum);
    const spec = DAY_SPECS[dayNum];
    console.log(`\n📥 توليد اليوم ${dayNum}...`);
    const { text, model } = await askGemini(buildPrompt(dayEntry, spec), SYSTEM);
    results[dayNum] = cleanContent(text);
    console.log(`   ✅ ${model}`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  for (const entry of draft) {
    if (results[entry.day]) {
      entry.content_ar = results[entry.day];
    }
  }
  fs.writeFileSync(DRAFT, JSON.stringify(draft, null, 2), 'utf8');
  console.log('\n--- الأيام الأربعة الجديدة ---\n');
  for (const dayNum of [10, 14, 15, 17]) {
    const e = draft.find((d) => d.day === dayNum);
    console.log(`### اليوم ${dayNum}: ${e.title}\n${e.content_ar}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * إعادة توليد أيام محددة من المرحلة 1 فقط — للمراجعة قبل نقلها لـ journeyDays.js
 * الاستخدام: node regenerateJourneyContent_phase1_days.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const OUTPUT = path.join(__dirname, 'data', 'journey_content_draft_phase1.json');
const REGENERATE_DAYS = [2, 5, 6];
const DELAY_MS = 2500;

const SYSTEM =
  'أنت مساعد إسلامي لتعليم المسلمين الجدد. أرجع نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله.';

function baseContext(dayEntry) {
  const { day, phase, title, guidance } = dayEntry;
  return (
    `أنت مساعد إسلامي متخصص بتعليم المسلمين الجدد. اكتب رسالة يومية للمسلم الجديد عن موضوع: [${title}]. ` +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة، كأنك تخاطب شخصاً لا يعرف شيئاً عن الإسلام. ' +
    "لا تبدأ بـ'بسم الله' ولا بأي مقدمة دينية رسمية — ابدأ مباشرة بالموضوع. " +
    'لا تضع عناوين أو نقاط، فقط نص متدفق طبيعي. ' +
    `السياق: هذا اليوم ${day} من رحلة 40 يوماً، المرحلة: ${phase}، وتوجيه المرافق للمرافق (لمعلوماتك فقط لا تذكره): ${guidance?.ar || ''}`
  );
}

function buildPromptForDay(dayEntry) {
  const base = baseContext(dayEntry);
  if (dayEntry.day === 2) {
    return (
      `${base} ` +
      'شرط صارم: 4 أسطر فقط لا أكثر. اذكر الأركان الخمسة بأسمائها بسرعة بلا شرح تفصيلي لكل ركن — الشرح سيأتي في أيام قادمة. يمكنك جملة ختامية قصيرة جداً أننا سنتعمق لاحقاً.'
    );
  }
  if (dayEntry.day === 5) {
    return (
      `${base} ` +
      "لا تبدأ أبداً بـ'يا صديقي'. استخدم مطلعاً طبيعياً مختلفاً. اكتب 4-6 أسطر فقط."
    );
  }
  if (dayEntry.day === 6) {
    return (
      `${base} ` +
      'أعد كتابة الموضوع بالكامل: فقرة واحدة متدفقة فقط (4-5 أسطر)، ابدأ مباشرة بالحديث عن القرآن الكريم وآداب التعامل معه. لا تذكر رقم اليوم ولا مقدمة مثل "اليوم السادس".'
    );
  }
  return base;
}

function cleanContent(text) {
  return String(text || '')
    .trim()
    .replace(/^```[\s\S]*?\n/, '')
    .replace(/\n```$/, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  const byDay = new Map(existing.map((e) => [e.day, e]));

  for (let i = 0; i < REGENERATE_DAYS.length; i += 1) {
    const dayNum = REGENERATE_DAYS[i];
    const dayEntry = JOURNEY_DAYS.find((d) => d.day === dayNum);
    if (!dayEntry) {
      console.error(`❌ لم يُعثر على اليوم ${dayNum}`);
      process.exit(1);
    }
    const prompt = buildPromptForDay(dayEntry);
    console.log(`\n📥 إعادة توليد اليوم ${dayNum}: ${dayEntry.title}...`);
    const { text, model } = await askGemini(prompt, SYSTEM);
    console.log(`   ✅ تم عبر ${model}`);
    byDay.set(dayNum, {
      day: dayNum,
      title: dayEntry.title,
      content_ar: cleanContent(text)
    });
    if (i < REGENERATE_DAYS.length - 1) await sleep(DELAY_MS);
  }

  const merged = [...byDay.values()].sort((a, b) => a.day - b.day);
  fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`\n✅ حُدّثت الأيام ${REGENERATE_DAYS.join(', ')} في ${OUTPUT}`);
  console.log('\n--- الأيام المُعاد توليدها ---\n');
  for (const dayNum of REGENERATE_DAYS) {
    const row = byDay.get(dayNum);
    console.log(`### اليوم ${row.day} — ${row.title}\n\n${row.content_ar}\n`);
  }
}

main().catch((err) => {
  console.error('❌ فشل التوليد:', err.message);
  process.exit(1);
});

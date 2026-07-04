require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const OUTPUT = path.join(__dirname, 'data', 'journey_content_draft_phase1.json');
const DELAY_MS = 2500;

const SYSTEM =
  'أنت مساعد إسلامي لتعليم المسلمين الجدد. أرجع نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله.';

function buildPrompt(dayEntry) {
  const { day, phase, title, guidance } = dayEntry;
  const guidanceText = guidance?.ar || '';
  return (
    `أنت مساعد إسلامي متخصص بتعليم المسلمين الجدد. اكتب رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلم الجديد عن موضوع: [${title}]. ` +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة، كأنك تخاطب شخصاً لا يعرف شيئاً عن الإسلام. ' +
    "لا تبدأ بـ'بسم الله' ولا بأي مقدمة دينية رسمية — ابدأ مباشرة بالموضوع. " +
    'لا تضع عناوين أو نقاط، فقط نص متدفق طبيعي. ' +
    `السياق: هذا اليوم ${day} من رحلة 40 يوماً، المرحلة: ${phase}، وتوجيه المرافق للمرافق (لمعلوماتك فقط لا تذكره): ${guidanceText}`
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateDayContent(dayEntry) {
  const prompt = buildPrompt(dayEntry);
  console.log(`\n📥 اليوم ${dayEntry.day}: ${dayEntry.title}...`);
  const { text, model } = await askGemini(prompt, SYSTEM);
  console.log(`   ✅ تم عبر ${model}`);
  return {
    day: dayEntry.day,
    title: dayEntry.title,
    content_ar: cleanContent(text)
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const phase1Days = JOURNEY_DAYS.filter((d) => d.day >= 1 && d.day <= 7);
  if (phase1Days.length !== 7) {
    console.error(`❌ توقّع 7 أيام، وُجد ${phase1Days.length}`);
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < phase1Days.length; i += 1) {
    const entry = await generateDayContent(phase1Days[i]);
    results.push(entry);
    if (i < phase1Days.length - 1) await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf8');
  const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
  console.log(`\n✅ حُفظ → ${OUTPUT} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error('❌ فشل التوليد:', err.message);
  process.exit(1);
});

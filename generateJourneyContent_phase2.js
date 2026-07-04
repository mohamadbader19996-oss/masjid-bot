require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const OUTPUT = path.join(__dirname, 'data', 'journey_content_draft_phase2.json');
const DELAY_MS = 2500;

const SYSTEM =
  'أنت مساعد إسلامي لتعليم المسلمين الجدد. أرجع نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله.';

const DAY_HINTS = {
  9: 'يمكنك الإشارة بلطف إلى أن زر "📿 فقه الصلاة" في البوت يشرح خطوات الوضوء بالتفصيل.',
  12: 'اذكر بلطف أن زر "📅 مواقيت الصلاة" في القائمة الرئيسية يُظهر أوقات صلوات مسجده.',
  14: 'يمكن الإشارة إلى قسم فقه الصلاة لخطوات الصلاة الأولى.',
  15: 'يمكن الإشارة إلى قسم فقه الصلاة لباقي خطوات الصلاة.',
  16: 'شجّعه على حفظ الفاتحة — البوت فيه وضع حافظ للمساعدة عند إكمال اليوم.',
  17: 'شجّعه على حفظ سورة قصيرة مثل الإخلاص — يمكنه استخدام قسم القرآن في البوت.',
  18: 'يوم مراجعة وتجربة عملية — اختم بسؤال مفتوح طبيعي عن ما تعلّمه في هذين الأسبوعين.'
};

function buildPrompt(dayEntry) {
  const { day, phase, title, guidance } = dayEntry;
  const guidanceText = guidance?.ar || '';
  const hint = DAY_HINTS[day] ? ` ملاحظة إضافية: ${DAY_HINTS[day]}` : '';
  return (
    `أنت مساعد إسلامي متخصص بتعليم المسلمين الجدد. اكتب رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلم الجديد عن موضوع: [${title}]. ` +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة، كأنك تخاطب شخصاً لا يعرف شيئاً عن الإسلام. ' +
    "لا تبدأ بـ'بسم الله' ولا بأي مقدمة دينية رسمية — ابدأ مباشرة بالموضوع. " +
    'لا تضع عناوين أو نقاط، فقط نص متدفق طبيعي. ' +
    `السياق: هذا اليوم ${day} من رحلة 40 يوماً، المرحلة: ${phase}، وتوجيه المرافق (لمعلوماتك فقط لا تذكره): ${guidanceText}.${hint}`
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

  const phase2Days = JOURNEY_DAYS.filter((d) => d.day >= 8 && d.day <= 18);
  if (phase2Days.length !== 11) {
    console.error(`❌ توقّع 11 يوماً، وُجد ${phase2Days.length}`);
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < phase2Days.length; i += 1) {
    const entry = await generateDayContent(phase2Days[i]);
    results.push(entry);
    if (i < phase2Days.length - 1) await sleep(DELAY_MS);
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

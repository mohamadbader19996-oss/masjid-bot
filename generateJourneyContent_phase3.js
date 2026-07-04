require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const OUTPUT = path.join(__dirname, 'data', 'journey_content_draft_phase3.json');
const DELAY_MS = 2500;

const SYSTEM =
  'أنت مساعد إسلامي لتعليم المسلمين الجدد. أرجع نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله.';

const DAY_HINTS = {
  19: 'اشرح فضل صلاة الجماعة ببساطة وآداب دخول المسجد: الدخول باليمين، الهدوء، والنظافة.',
  20: 'اشرح الزكاة ببساطة — أنها مشاركة جزء صغير من المال مع المحتاجين، وفيها تزكية للنفس والمال. لا أرقام ولا نسب مئوية.',
  21: 'اشرح معنى الصوم وفضله ببساطة — تدريب للنفس على الصبر والشكر. اختم النص حتماً بهذا السطر بالضبط:\n💡 يمكنك معرفة الأيام الفاضلة للصيام من زر 📅 التقويم الهجري في القائمة الرئيسية',
  22: 'اشرح الحج ببساطة — زيارة بيت الله الحرام، ركن من أركان الإسلام لمن استطاع، تجربة روحانية عظيمة.',
  23: 'اشرح الفكرة الأساسية للحلال والحرام في الطعام ببساطة — الإسلام يوجّه لأكل الطيبات وتجنب المضار. اذكر أمثلة بسيطة (لحم الخنزير، الكحول) بأسلوب لطيف لا نقدي.',
  24: 'اكتب 4 أسطر فقط لا أكثر. اشرح مبدأ الاحتشام والنظافة في المظهر فقط — الإسلام يدعو للاحترام والنظافة، والأمر تدريجي ومريح للمسلم الجديد. ممنوع تماماً ذكر أي تفاصيل فقهية: لا الوجه، لا الكفين، لا السرة والركبة، لا الحجاب، لا تغطية الجسم.',
  25: 'اشرح الدعاء ببساطة — محادثة مباشرة مع الله بأي لغة وفي أي وقت. اختم النص حتماً بهذا السطر بالضبط:\n💡 يمكنك تعلم أدعية جميلة من زر 🛡️ حصن المسلم في القائمة الرئيسية',
  26: 'اكتب بالضبط 6 جمل قصيرة متتالية (ليست 5 ولا 7). الجملة 1: مقدمة دافئة للمراجعة. الجمل 2-6: جملة واحدة قصيرة عن كل من: صلاة الجماعة، الزكاة، الصيام، الحج، الحلال في الطعام وآداب اللباس معاً، الدعاء. الجملة الأخيرة (السادسة) سؤال مفتوح. لا تذكر رمضان. لا عناوين ولا نقاط.'
};

function buildPrompt(dayEntry) {
  const { day, phase, title, guidance } = dayEntry;
  const guidanceText = guidance?.ar || '';
  const hint = DAY_HINTS[day] ? ` ملاحظة إضافية: ${DAY_HINTS[day]}` : '';
  return (
    `أنت مساعد إسلامي متخصص بتعليم المسلمين الجدد. اكتب رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلم الجديد عن موضوع: [${title}]. ` +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة، كأنك تخاطب شخصاً لا يعرف شيئاً عن الإسلام. ' +
    "لا تبدأ بـ'بسم الله' ولا بأي مقدمة دينية رسمية ولا بـ'يا صديقي' — ابدأ مباشرة بالموضوع. " +
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

function ensureFooter(content, footer) {
  const trimmed = cleanContent(content);
  if (trimmed.includes(footer.replace('\n', ''))) return trimmed;
  return `${trimmed}\n${footer}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateDayContent(dayEntry) {
  const prompt = buildPrompt(dayEntry);
  console.log(`\n📥 اليوم ${dayEntry.day}: ${dayEntry.title}...`);
  const { text, model } = await askGemini(prompt, SYSTEM);
  console.log(`   ✅ تم عبر ${model}`);
  let content_ar = cleanContent(text);
  if (dayEntry.day === 21) {
    content_ar = ensureFooter(
      content_ar,
      '💡 يمكنك معرفة الأيام الفاضلة للصيام من زر 📅 التقويم الهجري في القائمة الرئيسية'
    );
  }
  if (dayEntry.day === 25) {
    content_ar = ensureFooter(
      content_ar,
      '💡 يمكنك تعلم أدعية جميلة من زر 🛡️ حصن المسلم في القائمة الرئيسية'
    );
  }
  return {
    day: dayEntry.day,
    title: dayEntry.title,
    content_ar
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const onlyDays = process.argv.slice(2).map(Number).filter((n) => n >= 19 && n <= 26);
  let phase3Days = JOURNEY_DAYS.filter((d) => d.day >= 19 && d.day <= 26);
  if (onlyDays.length) {
    phase3Days = phase3Days.filter((d) => onlyDays.includes(d.day));
    if (!phase3Days.length) {
      console.error('❌ لم يُحدَّد يوم صالح (19-26)');
      process.exit(1);
    }
  } else if (phase3Days.length !== 8) {
    console.error(`❌ توقّع 8 أيام، وُجد ${phase3Days.length}`);
    process.exit(1);
  }

  let results = [];
  if (onlyDays.length && fs.existsSync(OUTPUT)) {
    results = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  }

  for (let i = 0; i < phase3Days.length; i += 1) {
    const entry = await generateDayContent(phase3Days[i]);
    const idx = results.findIndex((r) => r.day === entry.day);
    if (idx >= 0) results[idx] = entry;
    else results.push(entry);
    results.sort((a, b) => a.day - b.day);
    if (i < phase3Days.length - 1) await sleep(DELAY_MS);
  }

  const day25 = results.find((r) => r.day === 25);
  if (day25) {
    day25.content_ar = day25.content_ar.replace(/\u0632r/g, '\u0632\u0631');
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

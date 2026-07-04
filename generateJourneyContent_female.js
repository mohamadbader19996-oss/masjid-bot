require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const OUTPUT = path.join(__dirname, 'data', 'journey_content_draft_female.json');
const PHASE3_DRAFT = path.join(__dirname, 'data', 'journey_content_draft_phase3.json');
const DELAY_MS = 2500;
const PRIORITY_DAYS = [9, 14, 15, 18, 21, 24];

const SYSTEM =
  'أنت مساعدة إسلامية لتعليم المسلمات الجدد. أرجعي نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله أو يا صديقتي أو يا غالية.';

function polishFemaleContent(content) {
  return String(content || '')
    .replace(/\u0632r/g, '\u0632\u0631')
    .replace(/يا\s+صديقت[يى][،,]?\s*/g, '')
    .replace(/يا\s+غالية[،,]?\s*/g, '')
    .replace(/,\s*وأعلمي\s+/g, '. ')
    .replace(/💡 يمكنك معرفة/g, '💡 يمكنكِ معرفة')
    .replace(/💡 يمكنك تعلم/g, '💡 يمكنكِ تعلم')
    .trim();
}

const DAY_HINTS = {
  9: 'نفس خطوات الوضوء (لا فرق بين الذكر والأنثى في الخطوات) لكن أضيفي: المرأة لا تحتاج نزع الحجاب عند الوضوء — تمسح على شعرها فقط. حافظي على أي إشارة لزر موجود في النسخة الذكورية.',
  14: 'نفس المحتوى لكن بصيغة مؤنثة، وأضيفي: هيئة المرأة في الصلاة تختلف قليلاً — تضم جسدها أكثر عند الركوع والسجود لأسباب الستر. حافظي على سطر 💡 فقه الصلاة إن وُجد في النسخة الذكورية.',
  15: 'نفس المحتوى بصيغة مؤنثة مع تأكيد: المرأة تضم ذراعيها إلى جسدها في الركوع والسجود (بخلاف الرجل الذي يفرج بين ذراعيه وجسده). حافظي على سطر 💡 فقه الصلاة إن وُجد.',
  18: 'بصيغة مؤنثة، وأضيفي: المرأة إن كانت في فترة الحيض أو النفاس لا تصلي ولا تصوم في هذه الفترة، وهذا رحمة من الله لها، وتقضي أيام الصيام لاحقاً.',
  21: 'بصيغة مؤنثة، وأضيفي بوضوح: المرأة في فترة الحيض أو النفاس لا تصوم وهذا واجب (ليس اختياراً)، وتقضي الأيام التي أفطرت فيها بعد انتهاء الفترة. اختمي حتماً بهذا السطر:\n💡 يمكنك معرفة الأيام الفاضلة للصيام من زر 📅 التقويم الهجري في القائمة الرئيسية',
  24: 'اكتبي من الصفر خصيصاً للمرأة (4-5 أسطر): اشرحي الحجاب ببساطة ودون ضغط — أنه تعبير عن الهوية والكرامة، والأمر تدريجي لا إجباري للمسلمة الجديدة. لا تنسخي النسخة الذكورية.',
  25: 'بصيغة مؤنثة. اختمي حتماً بهذا السطر:\n💡 يمكنكِ تعلم أدعية جميلة من زر 🛡️ حصن المسلم في القائمة الرئيسية'
};

function loadPhase3MaleMap() {
  if (!fs.existsSync(PHASE3_DRAFT)) return {};
  try {
    const rows = JSON.parse(fs.readFileSync(PHASE3_DRAFT, 'utf8'));
    return Object.fromEntries(rows.map((r) => [r.day, r.content_ar || '']));
  } catch (e) {
    return {};
  }
}

function getMaleReference(dayEntry, phase3Map) {
  const fromJourney = dayEntry.content?.ar?.male || '';
  if (fromJourney.trim()) return fromJourney.trim();
  return (phase3Map[dayEntry.day] || '').trim();
}

function buildPrompt(dayEntry, maleText) {
  const { day, phase, title, guidance } = dayEntry;
  const guidanceText = guidance?.ar || '';
  const special = DAY_HINTS[day]
    ? ` تعليمات خاصة لهذا اليوم: ${DAY_HINTS[day]}`
    : ' حوّلي نفس المعنى والمحتوى إلى صيغة مؤنثة (أنتِ، تعلمتِ، ستجدين...) مع الحفاظ على أي إشارة لأزرار البوت من النسخة الذكورية.';
  const maleBlock = maleText
    ? `\n\nالنسخة الذكورية الحالية (مرجع — لا تنسخيها حرفياً):\n${maleText}`
    : '\n\nلا توجد نسخة ذكورية جاهزة — اكتبي من العنوان والتوجيه.';

  return (
    `أنتِ مساعدة إسلامية متخصصة بتعليم المسلمات الجدد. اكتبي رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلمة الجديدة عن موضوع: [${title}]. ` +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة. خاطبيها بصيغة المؤنث دائماً. ' +
    "لا تبدئي بـ'بسم الله' ولا 'يا صديقتي' ولا أي مقدمة رسمية — ابدئي مباشرة بالموضوع. " +
    'لا تضعي عناوين أو نقاط، فقط نص متدفق طبيعي. ' +
    `السياق: هذا اليوم ${day} من رحلة 40 يوماً، المرحلة: ${phase}، وتوجيه المرافقة (لمعلوماتك فقط): ${guidanceText}.${special}` +
    maleBlock
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

async function generateDayContent(dayEntry, phase3Map) {
  const maleText = getMaleReference(dayEntry, phase3Map);
  const prompt = buildPrompt(dayEntry, maleText);
  console.log(`\n📥 اليوم ${dayEntry.day}: ${dayEntry.title}...`);
  const { text, model } = await askGemini(prompt, SYSTEM);
  console.log(`   ✅ تم عبر ${model}`);
  let content_female = cleanContent(text);
  if (dayEntry.day === 21) {
    content_female = ensureFooter(
      content_female,
      '💡 يمكنك معرفة الأيام الفاضلة للصيام من زر 📅 التقويم الهجري في القائمة الرئيسية'
    );
  }
  if (dayEntry.day === 25) {
    content_female = ensureFooter(
      content_female,
      '💡 يمكنكِ تعلم أدعية جميلة من زر 🛡️ حصن المسلم في القائمة الرئيسية'
    );
  }
  content_female = polishFemaleContent(content_female);
  if (dayEntry.day === 9 && maleText.includes('فقه الصلاة') && !content_female.includes('فقه الصلاة')) {
    content_female += '\nستجدين شرحاً مفصلاً خطوة بخطوة في زر "📿 فقه الصلاة".';
    content_female = content_female.replace(/\u0632r/g, '\u0632\u0631');
  }
  if (dayEntry.day === 14 && maleText.includes('💡') && !content_female.includes('💡')) {
    content_female = ensureFooter(
      content_female,
      '💡 راجعي خطوات الصلاة كاملة من زر 📿 فقه الصلاة في القائمة الرئيسية'
    );
    content_female = content_female.replace(/\u0632r/g, '\u0632\u0631');
  }
  if (dayEntry.day === 15 && maleText.includes('💡') && !content_female.includes('فقه الصلاة')) {
    content_female = ensureFooter(
      content_female,
      '💡 راجعي خطوات الصلاة كاملة من زر 📿 فقه الصلاة في القائمة الرئيسية'
    );
    content_female = content_female.replace(/\u0632r/g, '\u0632\u0631');
  }
  return {
    day: dayEntry.day,
    title: dayEntry.title,
    content_female
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const allFlag = args.includes('--all');
  const onlyDays = args.filter((a) => /^\d+$/.test(a)).map(Number).filter((n) => n >= 1 && n <= 26);

  let targetDays = JOURNEY_DAYS.filter((d) => d.day >= 1 && d.day <= 26);
  if (allFlag) {
    // all 26
  } else if (onlyDays.length) {
    targetDays = targetDays.filter((d) => onlyDays.includes(d.day));
  } else {
    targetDays = targetDays.filter((d) => PRIORITY_DAYS.includes(d.day));
    console.log(`ℹ️  توليد الأيام ذات الأحكام المختلفة أولاً: ${PRIORITY_DAYS.join(', ')}`);
    console.log('   (لتوليد الكل: node generateJourneyContent_female.js --all)');
  }

  if (!targetDays.length) {
    console.error('❌ لم يُحدَّد يوم صالح (1-26)');
    process.exit(1);
  }

  const phase3Map = loadPhase3MaleMap();
  let results = [];
  if (fs.existsSync(OUTPUT)) {
    try {
      results = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    } catch (e) {
      results = [];
    }
  }

  for (let i = 0; i < targetDays.length; i += 1) {
    const entry = await generateDayContent(targetDays[i], phase3Map);
    const idx = results.findIndex((r) => r.day === entry.day);
    if (idx >= 0) results[idx] = entry;
    else results.push(entry);
    results.sort((a, b) => a.day - b.day);
    if (i < targetDays.length - 1) await sleep(DELAY_MS);
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

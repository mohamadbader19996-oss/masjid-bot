require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { askGemini } = require('./src/services/gemini');
const { JOURNEY_DAYS } = require('./src/data/journeyDays');

const OUTPUT = path.join(__dirname, 'data', 'journey_content_draft_phase45.json');
const DELAY_MS = 2500;

const SYSTEM_MALE =
  'أنت مساعد إسلامي لتعليم المسلمين الجدد. أرجع نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله أو يا صديقي.';

const SYSTEM_FEMALE =
  'أنت مساعدة إسلامية لتعليم المسلمات الجدد. أرجعي نص الرسالة فقط — بدون JSON، بدون عناوين، بدون نقاط، بدون markdown، بدون مقدمات مثل بسم الله أو يا صديقتي أو يا حبيبتي.';

const DAY_HINTS = {
  27: {
    male: 'اشرح فضل الصدق والأمانة في الإسلام ببساطة — أنهما أساس الشخصية المسلمة وسبب ثقة الناس.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة.'
  },
  28: {
    male: 'اشرح أهمية بر الوالدين — حتى لو كانوا غير مسلمين، الإسلام يأمر بالإحسان إليهم والتعامل معهم باحترام ولطف.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة.'
  },
  29: {
    male: 'اشرح أهمية صلة الرحم والإحسان للجيران — الإسلام يجعل العلاقات الإنسانية جزءاً من العبادة.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة.'
  },
  30: {
    male: 'يوم حساس جداً — اشرح ببساطة ودفء أن الإسلام لا يأمر بقطع العلاقات مع الأهل والأصدقاء غير المسلمين، بل بالتعامل معهم بلطف وحسن خلق. النموذج الأفضل للدعوة هو الأخلاق الحسنة.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة، بلطف خاص للمسلمة الجديدة التي قد تخاف من قطيعة عائلتها.'
  },
  31: {
    male: 'اشرح أن الابتلاء طبيعي في حياة المسلم — وأن الصبر عليه يرفع الدرجات ويقرب من الله. رسالة تشجيعية دافئة خاصة للمسلم الجديد الذي قد يواجه تحديات من محيطه.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة، مع تشجيع خاص للمسلمة الجديدة.'
  },
  32: {
    male: 'اشرح أن حسن الخلق مع الجميع (مسلم وغير مسلم) هو من أفضل أشكال الدعوة — ابتسامتك وأمانتك ولطفك يمثلون الإسلام.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة.'
  },
  33: {
    male: 'رسالة دافئة تحتفل بإتمام مرحلة الأخلاق — تذكّر ما تعلمته وسؤال مفتوح في النهاية.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة مع سؤال مفتوح.'
  },
  34: {
    male: 'شجّعه على التعرف على المصلين والأسرة في المسجد — الانتماء للمجتمع الإسلامي سند ودعم.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة.'
  },
  35: {
    male: 'اشرح كيف يطرح أسئلته الدينية مستقبلاً — العلماء والمشايخ والمصادر الموثوقة. اختم النص حتماً بهذا السطر بالضبط:\n💡 يمكنك إرسال أسئلتك من زر ❓ إرسال سؤال في القائمة الرئيسية',
    female: 'نفس المعنى بصيغة مؤنثة. اختمي حتماً بهذا السطر:\n💡 يمكنكِ إرسال أسئلتك من زر ❓ إرسال سؤال في القائمة الرئيسية'
  },
  36: {
    male: 'اشرح أن طلب العلم الشرعي فريضة مستمرة — كل يوم تتعلم فيه شيئاً هو تقدم. اختم النص حتماً بهذا السطر بالضبط:\n💡 يمكنك متابعة الدروس من زر 📚 الدروس في القائمة الرئيسية',
    female: 'نفس المعنى بصيغة مؤنثة. اختمي حتماً بهذا السطر:\n💡 يمكنكِ متابعة الدروس من زر 📚 الدروس في القائمة الرئيسية'
  },
  37: {
    male: 'اشرح أهم المناسبات الإسلامية (رمضان، العيدين، عاشوراء، الأيام البيض) ببساطة. اختم النص حتماً بهذا السطر بالضبط:\n💡 تذكّر المناسبات من زر 📅 التقويم الهجري في القائمة الرئيسية',
    female: 'نفس المعنى بصيغة مؤنثة. اختمي حتماً بهذا السطر:\n💡 تذكّري المناسبات من زر 📅 التقويم الهجري في القائمة الرئيسية'
  },
  38: {
    male: 'رسالة ملهمة — أخلاقه وتعامله مع الناس هو أقوى دعوة. اختم النص حتماً بهذا السطر بالضبط:\n💡 يمكنك التطوع للدعوة من زر 🤝 تطوع دعوي في القائمة الرئيسية',
    female: 'نفس المعنى بصيغة مؤنثة. اختمي حتماً بهذا السطر:\n💡 يمكنكِ التطوع للدعوة من زر 🤝 تطوع دعوي في القائمة الرئيسية'
  },
  39: {
    male: 'شجّعه على كتابة كل الأسئلة التي تراكمت عنده — هذا وقت مناسب لطرحها على المرافق أو الشيخ قبل الختام.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة.'
  },
  40: {
    male: 'رسالة ختامية احتفالية دافئة جداً — أربعون يوماً من التعلم والنمو! تهنئة بإتمام الرحلة وتذكير بأن هذا بداية رحلة أطول مع الإسلام.',
    female: 'نفس المعنى بصيغة مؤنثة مفردة كاملة، مع تشجيع لطيف غير إلزامي على استمرار ارتداء الحجاب إن بدأت به — بأسلوب دافئ لا ضغط.'
  }
};

const REQUIRED_FOOTERS = {
  male: {
    35: '💡 يمكنك إرسال أسئلتك من زر ❓ إرسال سؤال في القائمة الرئيسية',
    36: '💡 يمكنك متابعة الدروس من زر 📚 الدروس في القائمة الرئيسية',
    37: '💡 تذكّر المناسبات من زر 📅 التقويم الهجري في القائمة الرئيسية',
    38: '💡 يمكنك التطوع للدعوة من زر 🤝 تطوع دعوي في القائمة الرئيسية'
  },
  female: {
    35: '💡 يمكنكِ إرسال أسئلتك من زر ❓ إرسال سؤال في القائمة الرئيسية',
    36: '💡 يمكنكِ متابعة الدروس من زر 📚 الدروس في القائمة الرئيسية',
    37: '💡 تذكّري المناسبات من زر 📅 التقويم الهجري في القائمة الرئيسية',
    38: '💡 يمكنكِ التطوع للدعوة من زر 🤝 تطوع دعوي في القائمة الرئيسية'
  }
};

function buildPrompt(dayEntry, gender) {
  const { day, phase, title, guidance } = dayEntry;
  const guidanceText = guidance?.ar || '';
  const hint = DAY_HINTS[day]?.[gender] || '';
  const isFemale = gender === 'female';

  const genderRules = isFemale
    ? 'خاطبيها بصيغة المؤنث المفرد دائماً (أنتِ، تعلمتِ، ستجدين...). '
    : 'خاطبه بصيغة المذكر المفرد دائماً (أنت، تعلمت، ستجد...). ';

  const intro = isFemale
    ? `أنتِ مساعدة إسلامية متخصصة بتعليم المسلمات الجدد. اكتبي رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلمة الجديدة عن موضوع: [${title}]. `
    : `أنت مساعد إسلامي متخصص بتعليم المسلمين الجدد. اكتب رسالة يومية قصيرة (4-6 أسطر فقط، لا أكثر) للمسلم الجديد عن موضوع: [${title}]. `;

  const noIntro = isFemale
    ? "لا تبدئي بـ'بسم الله' ولا 'يا صديقتي' ولا 'يا حبيبتي' ولا أي مقدمة رسمية — ابدئي مباشرة بالموضوع. "
    : "لا تبدأ بـ'بسم الله' ولا 'يا صديقي' ولا أي مقدمة رسمية — ابدأ مباشرة بالموضوع. ";

  const format = isFemale
    ? 'لا تضعي عناوين أو نقاط، فقط نص متدفق طبيعي. '
    : 'لا تضع عناوين أو نقاط، فقط نص متدفق طبيعي. ';

  const hintBlock = hint ? ` تعليمات خاصة: ${hint}` : '';

  return (
    intro +
    'الأسلوب: دافئ، بسيط جداً، بلا مصطلحات معقدة. ' +
    genderRules +
    noIntro +
    format +
    `السياق: هذا اليوم ${day} من رحلة 40 يوماً، المرحلة: ${phase}، وتوجيه المرافق (لمعلوماتك فقط لا تذكره): ${guidanceText}.${hintBlock}`
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

function polishFemaleContent(content) {
  return String(content || '')
    .replace(/\u0632r/g, '\u0632\u0631')
    .replace(/يا\s+صديقت[يى][،,]?\s*/g, '')
    .replace(/يا\s+غالية[،,]?\s*/g, '')
    .replace(/يا\s+حبيبتي[،,]?\s*/g, '')
    .replace(/💡 يمكنك إرسال/g, '💡 يمكنكِ إرسال')
    .replace(/💡 يمكنك متابعة/g, '💡 يمكنكِ متابعة')
    .replace(/💡 تذكّر المناسبات/g, '💡 تذكّري المناسبات')
    .replace(/💡 يمكنك التطوع/g, '💡 يمكنكِ التطوع')
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

async function generateGenderContent(dayEntry, gender) {
  const prompt = buildPrompt(dayEntry, gender);
  const system = gender === 'female' ? SYSTEM_FEMALE : SYSTEM_MALE;
  const label = gender === 'female' ? 'أنثى' : 'ذكر';
  console.log(`   📥 ${label}...`);
  const { text, model } = await askGemini(prompt, system);
  console.log(`      ✅ ${label} عبر ${model}`);
  let content = cleanContent(text);
  const footer = REQUIRED_FOOTERS[gender]?.[dayEntry.day];
  if (footer) content = ensureFooter(content, footer);
  if (gender === 'female') content = polishFemaleContent(content);
  return content;
}

async function generateDayContent(dayEntry) {
  console.log(`\n📅 اليوم ${dayEntry.day}: ${dayEntry.title}`);
  const content_male = await generateGenderContent(dayEntry, 'male');
  await sleep(DELAY_MS);
  const content_female = await generateGenderContent(dayEntry, 'female');
  return {
    day: dayEntry.day,
    title: dayEntry.title,
    content_male,
    content_female
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY غير موجود في .env');
    process.exit(1);
  }

  const onlyDays = process.argv.slice(2).map(Number).filter((n) => n >= 27 && n <= 40);
  let phaseDays = JOURNEY_DAYS.filter((d) => d.day >= 27 && d.day <= 40);
  if (onlyDays.length) {
    phaseDays = phaseDays.filter((d) => onlyDays.includes(d.day));
    if (!phaseDays.length) {
      console.error('❌ لم يُحدَّد يوم صالح (27-40)');
      process.exit(1);
    }
  } else if (phaseDays.length !== 14) {
    console.error(`❌ توقّع 14 يوماً، وُجد ${phaseDays.length}`);
    process.exit(1);
  }

  let results = [];
  if (fs.existsSync(OUTPUT)) {
    try {
      results = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    } catch (e) {
      results = [];
    }
  }

  for (let i = 0; i < phaseDays.length; i += 1) {
    const entry = await generateDayContent(phaseDays[i]);
    const idx = results.findIndex((r) => r.day === entry.day);
    if (idx >= 0) results[idx] = entry;
    else results.push(entry);
    results.sort((a, b) => a.day - b.day);
    fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2), 'utf8');
    if (i < phaseDays.length - 1) await sleep(DELAY_MS);
  }

  const sizeKb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
  console.log(`\n✅ حُفظ → ${OUTPUT} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error('❌ فشل التوليد:', err.message);
  process.exit(1);
});

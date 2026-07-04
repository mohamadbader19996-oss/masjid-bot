require('dotenv').config();
const { askGemini } = require('./src/services/gemini');

const DRAFT =
  'وقف كاسيوس كلاي في قمة مجده أمام خيار لم يتوقعه أحد: الحرب تطلبه، والعالم يهتف باسمه، لكن قلبه قال لا. قالها بصوتٍ لم يخشَ الجماهير: «لا عداء لي مع الفيتناميين، لن أقتل إنساناً لم يؤذني». خسر لقبه، خسر المال، خسر جزءاً من مجده، لكنه لم يخسر ضميره. في تلك اللحظة، لم تكن الحلبة هي ساحة البطولة الحقيقية؛ البطولة كانت في الوقوف مع الحق ولو وحيداً. وجد في الإسلام ما لم تمنحه له الجوائز: إخاءً يتجاوز الحدود، وكرامةً لا تُشترى بالذهب، ومعنىً للحرية أعمق من كل حزام. حين اعتنق الإسلام وسمّى نفسه محمداً علياً، لم يكن ذلك تغيير اسم فحسب، بل ولادة روح جديدة رفضت أن تُقيَّم بانتصارات جسدية. صار بطلاً في ساحة الضمير، يدافع عن الإنسان قبل أن يدافع عن لقب.';

const SYSTEM = 'أنت محرر عربي. أرجع JSON فقط: {"story":"..."}';

const prompt =
  `هذه مسودة قصة عن محمد علي (${countWords(DRAFT)} كلمة). وسّعها لتصبح 180 كلمة بالضبط (175-185).\n` +
  'احتفظ بكل العناصر: رفض الحرب، "لا عداء لي مع الفيتناميين"، خسارة اللقب، الكرامة في الإسلام بعيداً عن الحلبة، تغيير الاسم.\n' +
  'فقرة واحدة متدفقة. اختم بجملة ملهمة.\n\n' +
  `المسودة:\n${DRAFT}`;

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
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
    if (m) return { story: m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') };
    throw new Error('parse fail');
  }
}

async function main() {
  const { text, model } = await askGemini(prompt, SYSTEM);
  const { story } = parseJson(text);
  const clean = story.replace(/\n+/g, ' ').trim();
  console.log(`model: ${model} | ${countWords(clean)} كلمة\n`);
  console.log(clean);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

require('dotenv').config();
const { askGemini } = require('./src/services/gemini');

const SYSTEM =
  'اكتب بالعربية الفصحى الدافئة. أرجع JSON فقط: {"story":"..."} بدون markdown. ' +
  'فقرة واحدة متدفقة. 175-185 كلمة بالضبط. لا بسم الله. لا تواريخ.';

const prompt =
  'قصة اعتناق إسلام عن محمد علي (كاسيوس كلاي) — 180 كلمة.\n' +
  '- ابدأ بلحظة مؤثرة\n' +
  '- لحظة محددة: رفض الذهاب للحرب وقوله "لا عداء لي مع الفيتناميين" وخسارة لقبه\n' +
  '- كيف وجد في الإسلام الكرامة الإنسانية الحقيقية بعيداً عن الحلبة\n' +
  '- تغيير الاسم إلى محمد علي\n' +
  '- اختم بجملة ملهمة عن ما وجده في الإسلام';

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
        .replace(/\\n/g, ' ')
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

async function main() {
  for (let i = 1; i <= 5; i += 1) {
    const extra = i > 1 ? '\n\nالمحاولة السابقة قصيرة أو ناقصة. اكتب 180 كلمة كاملة في فقرة واحدة.' : '';
    try {
      const { text, model } = await askGemini(prompt + extra, SYSTEM);
      const { story } = parseJson(text);
      const clean = story.replace(/\n+/g, ' ').trim();
      const words = countWords(clean);
      console.log(`try ${i}: ${model} | ${words} كلمة`);
      if (words >= 170) {
        console.log('\n---STORY---\n' + clean);
        return;
      }
    } catch (err) {
      console.log(`try ${i}: فشل التحليل — ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  console.error('❌ لم تُحقَّق الكلمات المطلوبة');
  process.exit(1);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});

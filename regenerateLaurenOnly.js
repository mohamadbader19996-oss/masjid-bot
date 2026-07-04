require('dotenv').config();
const { askGemini } = require('./src/services/gemini');

const SYSTEM =
  'أنت كاتب قصص اعتناق إسلام. أرجع JSON فقط: {"story":"..."}. ' +
  'فقرة واحدة متدفقة. 145-155 كلمة. لا بسم الله.';

const prompt =
  'اكتب قصة لورين بوث من الصفر — 150 كلمة.\n' +
  '- ابدأ مباشرة بلحظة محددة: سكينة في مسجد بطهران، خشوع المصلين\n' +
  '- صحفية بريطانية، شقيقة زوجة رئيس وزراء سابق\n' +
  '- لا مقدمة رسمية\n' +
  '- اختم بجملة ملهمة واحدة قوية ومختصرة (ليست جملتين)';

function parseJson(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    const m = raw.match(/"story"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    return { story: m[1].replace(/\\n/g, ' ') };
  }
}

async function main() {
  for (let i = 1; i <= 3; i += 1) {
    const { text, model } = await askGemini(prompt + (i > 1 ? '\n\nالجملة الأخيرة يجب أن تكون قوية ومختصرة.' : ''), SYSTEM);
    const { story } = parseJson(text);
    const clean = story.replace(/\n+/g, ' ').trim();
    const w = clean.split(/\s+/).filter(Boolean).length;
    console.log(`try ${i}: ${model} | ${w}`);
    if (w >= 140 && w <= 160) {
      console.log('\n---STORY---\n' + clean);
      return;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });

const fs = require('fs');
const path = require('path');
const { JOURNEY_DAYS } = require('../src/data/journeyDays');

const FEMALE_DRAFT = path.join(__dirname, '..', 'data', 'journey_content_draft_female.json');
const PHASE3_DRAFT = path.join(__dirname, '..', 'data', 'journey_content_draft_phase3.json');
const OUTPUT = path.join(__dirname, '..', 'src', 'data', 'journeyDays.js');

function esc(s) {
  return JSON.stringify(s || '');
}

const femaleMap = Object.fromEntries(
  JSON.parse(fs.readFileSync(FEMALE_DRAFT, 'utf8')).map((r) => [r.day, r.content_female || ''])
);
const phase3Map = Object.fromEntries(
  JSON.parse(fs.readFileSync(PHASE3_DRAFT, 'utf8')).map((r) => [r.day, r.content_ar || ''])
);

const merged = JOURNEY_DAYS.map((d) => {
  if (d.day < 1 || d.day > 26) return d;
  const ar = d.content?.ar;
  const male = typeof ar === 'string' ? ar : (ar?.male || '');
  const female = typeof ar === 'string' ? '' : (ar?.female || '');
  return {
    ...d,
    content: {
      ar: {
        male: (male.trim() || phase3Map[d.day] || '').trim(),
        female: (femaleMap[d.day] || female || '').trim()
      }
    }
  };
});

const entryLines = merged.map((d) => {
  const g = esc(d.guidance?.ar || '');
  let contentStr;
  if (d.day >= 1 && d.day <= 26) {
    contentStr = `content: { ar: { male: ${esc(d.content.ar.male)}, female: ${esc(d.content.ar.female)} } }`;
  } else {
    contentStr = `content: { ar: ${esc(typeof d.content?.ar === 'string' ? d.content.ar : '')} }`;
  }
  const flex = d.flexDay ? ', flexDay: true' : '';
  return `  { day: ${d.day}, phase: ${esc(d.phase)}, title: ${esc(d.title)}, guidance: { ar: ${g} }, ${contentStr}${flex} },`;
});

const out = `const JOURNEY_DAYS = [
${entryLines.join('\n')}
];

function resolveContentAr(contentAr, gender) {
  if (!contentAr) return '';
  if (typeof contentAr === 'string') return contentAr.trim();
  const female = (contentAr.female || '').trim();
  const male = (contentAr.male || '').trim();
  if (gender === 'female') return female || male;
  return male;
}

function getDayContent(dayNumber) {
  return JOURNEY_DAYS.find((d) => d.day === dayNumber) || null;
}

function getDayContentText(dayNumber, gender) {
  const day = getDayContent(dayNumber);
  if (!day) return '';
  return resolveContentAr(day.content?.ar, gender);
}

module.exports = { JOURNEY_DAYS, getDayContent, getDayContentText, resolveContentAr };
`;

fs.writeFileSync(OUTPUT, out, 'utf8');
const filledFemale = merged.filter((d) => d.day <= 26 && d.content.ar.female).length;
const filledMale = merged.filter((d) => d.day <= 26 && d.content.ar.male).length;
console.log(`✅ merged → ${OUTPUT}`);
console.log(`   female filled: ${filledFemale}/26, male filled: ${filledMale}/26`);

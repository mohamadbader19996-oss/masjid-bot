const fs = require('fs');
const path = require('path');
const { JOURNEY_DAYS } = require('../src/data/journeyDays');

function esc(s) {
  return JSON.stringify(s || '');
}

const entryLines = JOURNEY_DAYS.map((d) => {
  const g = esc(d.guidance?.ar || '');
  let contentStr;
  if (d.day >= 1 && d.day <= 26) {
    const ar = d.content?.ar;
    const male = typeof ar === 'string' ? ar : (ar?.male ?? '');
    const female = typeof ar === 'string' ? '' : (ar?.female ?? '');
    contentStr = `content: { ar: { male: ${esc(male)}, female: ${esc(female)} } }`;
  } else {
    const ar = typeof d.content?.ar === 'string' ? d.content.ar : '';
    contentStr = `content: { ar: ${esc(ar)} }`;
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

fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'journeyDays.js'), out, 'utf8');
console.log('✅ migrated journeyDays.js');

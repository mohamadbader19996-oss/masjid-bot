process.env.ACTION_REGISTRY_SILENT = '1';
const { ALL_LANGUAGES, formatQuranLanguageDisplay } = require('../src/services/quranApi');

console.log('=== QURAN LANGUAGE BUTTONS (from current code) ===');
console.log('Total:', ALL_LANGUAGES.length);
console.log('');

ALL_LANGUAGES.forEach((lang, i) => {
  const btn = formatQuranLanguageDisplay(lang);
  console.log(
    String(i + 1).padStart(2, '0') +
    '. code=' + lang.code +
    ' | button="' + btn + '"' +
    ' | edition=' + lang.edition
  );
});

const deEntries = ALL_LANGUAGES.filter((l) => l.code === 'de');
console.log('');
console.log('de entries:', deEntries.length);
if (deEntries.length) {
  deEntries.forEach((l) => {
    console.log('  de -> button="' + formatQuranLanguageDisplay(l) + '" edition=' + l.edition);
  });
}

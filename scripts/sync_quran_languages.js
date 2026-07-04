#!/usr/bin/env node
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const { buildAllLanguagesFromApi } = require('../src/services/quranLanguageCatalog');

async function main() {
  const languages = await buildAllLanguagesFromApi();
  const outPath = path.join(__dirname, '../src/data/quranLanguages.json');
  fs.writeFileSync(outPath, JSON.stringify(languages, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${languages.length} languages to ${outPath}`);
  console.log(`  Arabic + ${languages.length - 1} translation editions from API`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

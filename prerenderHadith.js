const fs = require('fs');
const path = require('path');

const EDITIONS_URL = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions.json';
const EDITION_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const OUTPUT = path.join(__dirname, 'data', 'hadith_books.json');
const BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHadith(raw) {
  return {
    hadithnumber: raw.hadithnumber,
    arabicnumber: raw.arabicnumber,
    text: raw.text || '',
    grades: Array.isArray(raw.grades) ? raw.grades : [],
    reference: raw.reference || null
  };
}

async function main() {
  console.log('Hadith prerender — fetching editions.json');
  const editions = await fetch(EDITIONS_URL).then((r) => r.json());
  const editionsPath = path.join(__dirname, 'data', 'hadith_editions_index.json');
  fs.writeFileSync(editionsPath, JSON.stringify(editions, null, 2), 'utf8');
  const out = {};

  for (const book of BOOKS) {
    const url = `${EDITION_BASE}/ara-${book}.json`;
    console.log(`Fetching ara-${book}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    out[book] = {
      metadata: data.metadata || {},
      hadiths: (data.hadiths || []).map(normalizeHadith)
    };
    console.log(`  ✅ ${book}: ${out[book].hadiths.length} hadiths`);
    await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 0), 'utf8');
  const sizeMb = (fs.statSync(OUTPUT).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ Saved → ${OUTPUT} (${sizeMb} MB)`);

  const { runMatch } = require('./matchHadithQudsi');
  runMatch();
}

main().catch((err) => {
  console.error('Prerender failed:', err.message);
  process.exit(1);
});

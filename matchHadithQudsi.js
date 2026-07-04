const fs = require('fs');
const path = require('path');
const hadithQudsiPhrases = require('./src/data/hadithQudsiPhrases');

const BOOKS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah'];
const DATA_FILE = path.join(__dirname, 'data', 'hadith_books.json');
const OUTPUT = path.join(__dirname, 'data', 'hadith_qudsi_matched.json');

function normalizeArabic(text) {
  return String(text || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPhraseInBook(hadiths, phrase) {
  const normPhrase = normalizeArabic(phrase);
  if (!normPhrase) return [];
  return hadiths.filter((h) => normalizeArabic(h.text).includes(normPhrase));
}

function searchBooks(data, phrase, bookList) {
  const hits = [];
  for (const book of bookList) {
    const hadiths = data[book]?.hadiths || [];
    const matches = findPhraseInBook(hadiths, phrase);
    for (const hadith of matches) {
      hits.push({ book, hadithnumber: hadith.hadithnumber });
    }
  }
  return hits;
}

function matchAllQudsi(data) {
  const matched = [];
  const unmatched = [];
  const multiBook = [];

  for (const entry of hadithQudsiPhrases) {
    let hits = searchBooks(data, entry.phrase, entry.expectedBooks);

    if (!hits.length) {
      const fallbackBooks = BOOKS.filter((b) => !entry.expectedBooks.includes(b));
      hits = searchBooks(data, entry.phrase, fallbackBooks);
    }

    if (!hits.length) {
      unmatched.push({
        number: entry.number,
        title: entry.title,
        phrase: entry.phrase,
        expectedBooks: entry.expectedBooks
      });
      continue;
    }

    const booksFound = [...new Set(hits.map((h) => h.book))];
    const primary = hits[0];

    const record = {
      number: entry.number,
      title: entry.title,
      book: primary.book,
      hadithnumber: primary.hadithnumber,
      allMatches: hits
    };
    matched.push(record);

    if (booksFound.length > 1) {
      multiBook.push({
        number: entry.number,
        title: entry.title,
        booksFound,
        allMatches: hits
      });
    }
  }

  matched.sort((a, b) => a.number - b.number);

  return { matched, unmatched, multiBook, generatedAt: new Date().toISOString() };
}

function printReport(result) {
  const total = hadithQudsiPhrases.length;
  const ok = result.matched.length;
  const fail = result.unmatched.length;

  console.log('\n══════════════════════════════════════════');
  console.log('  تقرير مطابقة الأحاديث القدسية (40)');
  console.log('══════════════════════════════════════════');
  console.log(`✅ مطابَق: ${ok}/${total}`);
  console.log(`❌ غير مطابَق: ${fail}/${total}`);
  console.log(`⚠️  وُجد في أكثر من كتاب: ${result.multiBook.length}`);

  console.log('\n── تفصيل كل حديث ──');
  for (const entry of hadithQudsiPhrases) {
    const m = result.matched.find((x) => x.number === entry.number);
    if (m) {
      const books = [...new Set(m.allMatches.map((x) => x.book))].join(', ');
      const nums = m.allMatches.map((x) => `${x.book}#${x.hadithnumber}`).join(' | ');
      console.log(`  #${String(entry.number).padStart(2)} ✅ ${entry.title}`);
      console.log(`       → مستخدم: ${m.book} #${m.hadithnumber}`);
      if (m.allMatches.length > 1) {
        console.log(`       → كل المطابقات: ${nums}`);
      }
    } else {
      console.log(`  #${String(entry.number).padStart(2)} ❌ ${entry.title} — لم يُعثر على العبارة`);
    }
  }

  if (result.unmatched.length) {
    console.log('\n── غير مطابَقة (تحتاج مراجعة يدوية) ──');
    for (const u of result.unmatched) {
      console.log(`  #${u.number} ${u.title}`);
      console.log(`       phrase: ${u.phrase.slice(0, 60)}…`);
      console.log(`       expected: ${u.expectedBooks.join(', ')}`);
    }
  }

  if (result.multiBook.length) {
    console.log('\n── مطابقة في أكثر من كتاب ──');
    for (const mb of result.multiBook) {
      const detail = mb.allMatches.map((x) => `${x.book}#${x.hadithnumber}`).join(', ');
      console.log(`  #${mb.number} ${mb.title}: [${mb.booksFound.join(', ')}]`);
      console.log(`       → ${detail}`);
    }
  }

  console.log('\n══════════════════════════════════════════\n');
}

function runMatch() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Missing ${DATA_FILE} — run node prerenderHadith.js first`);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const result = matchAllQudsi(data);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Saved → ${OUTPUT}`);
  printReport(result);
  return result;
}

if (require.main === module) {
  try {
    runMatch();
  } catch (err) {
    console.error('Match failed:', err.message);
    process.exit(1);
  }
}

module.exports = { runMatch, matchAllQudsi, normalizeArabic, OUTPUT };

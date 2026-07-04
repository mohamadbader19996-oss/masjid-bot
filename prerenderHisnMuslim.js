const fs = require('fs');
const path = require('path');

const API_BASE = 'https://www.hisnmuslim.com/api/ar';
const OUTPUT = path.join(__dirname, 'data', 'hisn_muslim.json');
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapApiItem(item) {
  return {
    zekr: String(item.ARABIC_TEXT || '').trim(),
    repeat: Number(item.REPEAT) > 0 ? Number(item.REPEAT) : 1,
    bless: String(item.LANGUAGE_ARABIC_TRANSLATED_TEXT || '').trim(),
    source: ''
  };
}

async function fetchCategory(categoryId) {
  const url = `${API_BASE}/${categoryId}.json`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  const chapters = [];
  let categoryId = 1;

  console.log('Hisn Muslim prerender — fetching Arabic categories from', API_BASE);

  while (true) {
    let data;
    try {
      data = await fetchCategory(categoryId);
    } catch (err) {
      console.error(`❌ Failed category ${categoryId}:`, err.message);
      break;
    }

    if (!data) {
      console.log(`Stopped at category ${categoryId} (404)`);
      break;
    }

    const title = Object.keys(data)[0];
    const items = Array.isArray(data[title]) ? data[title] : [];
    chapters.push({
      id: categoryId,
      title: title || `باب ${categoryId}`,
      content: items.map(mapApiItem),
      translations: {}
    });

    console.log(`  [${categoryId}] ${title} — ${items.length} أذكار`);
    categoryId += 1;
    await sleep(DELAY_MS);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(chapters, null, 2), 'utf8');
  console.log(`\n✅ Saved ${chapters.length} chapters → ${OUTPUT}`);
}

main().catch((err) => {
  console.error('Prerender failed:', err.message);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

const SOURCE_URL =
  'https://raw.githubusercontent.com/rn0x/Names_Of_Allah_Json/main/Names_Of_Allah.json';
const OUTPUT = path.join(__dirname, 'data', 'names_of_allah.json');

async function main() {
  console.log('Fetching Names of Allah from', SOURCE_URL);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${SOURCE_URL}`);
  }

  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('Expected JSON array from source');
  }

  const names = raw.map((entry) => ({
    id: Number(entry.id),
    name: String(entry.name || '').trim(),
    text: String(entry.text || '').trim()
  }));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(names, null, 2), 'utf8');
  console.log(`✅ Saved ${names.length} names to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});

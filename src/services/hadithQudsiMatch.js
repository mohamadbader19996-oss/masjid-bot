const fs = require('fs');
const path = require('path');

const MATCHED_FILE = path.join(__dirname, '..', '..', 'data', 'hadith_qudsi_matched.json');

let cache = null;

function loadQudsiMatched() {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(MATCHED_FILE, 'utf8'));
    cache = (data.matched || []).sort((a, b) => a.number - b.number);
  } catch {
    cache = [];
  }
  return cache;
}

function loadQudsiMatchReport() {
  try {
    return JSON.parse(fs.readFileSync(MATCHED_FILE, 'utf8'));
  } catch {
    return { matched: [], unmatched: [], multiBook: [] };
  }
}

module.exports = {
  loadQudsiMatched,
  loadQudsiMatchReport,
  MATCHED_FILE
};

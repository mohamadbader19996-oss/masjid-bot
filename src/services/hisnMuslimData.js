const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'hisn_muslim.json');

let cache = null;

function loadHisnMuslimData() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    cache = [];
  }
  return cache;
}

function saveHisnMuslimData(data) {
  cache = data;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getChapterById(id) {
  const chapters = loadHisnMuslimData();
  return chapters.find((c) => Number(c.id) === Number(id)) || null;
}

function updateChapter(chapter) {
  const chapters = loadHisnMuslimData();
  const idx = chapters.findIndex((c) => Number(c.id) === Number(chapter.id));
  if (idx === -1) return false;
  chapters[idx] = chapter;
  saveHisnMuslimData(chapters);
  return true;
}

function getAllChapters() {
  return loadHisnMuslimData();
}

module.exports = {
  loadHisnMuslimData,
  saveHisnMuslimData,
  getChapterById,
  updateChapter,
  getAllChapters,
  DATA_FILE
};

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('../database');

const QCF4_BASE = 'https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/main';
const DATA_DIR = path.join(process.cwd(), 'data', 'qcf4');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const CHAPTERS_PATH = path.join(DATA_DIR, 'chapters.json');
const VERSES_PATH = path.join(DATA_DIR, 'verses.json');

const JUZ_START_VERSES = [
  '1:1', '2:142', '2:253', '3:93', '4:24', '4:148', '5:82', '6:111', '7:88', '8:41',
  '9:93', '11:6', '12:53', '15:1', '17:1', '18:75', '21:1', '23:1', '25:21', '27:56',
  '29:46', '33:31', '36:28', '39:32', '41:47', '46:1', '51:31', '58:1', '67:1', '78:1'
];

let chaptersCache = null;
let versesCache = null;

async function downloadFile(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    validateStatus: (s) => s === 200
  });
  fs.writeFileSync(destPath, Buffer.from(res.data));
}

async function ensureIndexFile() {
  if (fs.existsSync(INDEX_PATH)) return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  await downloadFile(`${QCF4_BASE}/index.json`, INDEX_PATH);
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

async function ensureVersesFile() {
  if (fs.existsSync(VERSES_PATH)) return JSON.parse(fs.readFileSync(VERSES_PATH, 'utf8'));
  await downloadFile(`${QCF4_BASE}/verses.json`, VERSES_PATH);
  return JSON.parse(fs.readFileSync(VERSES_PATH, 'utf8'));
}

async function ensureChaptersFile() {
  if (fs.existsSync(CHAPTERS_PATH)) {
    return JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf8'));
  }
  const index = await ensureIndexFile();
  const chapters = (index.chapters || []).map((c) => ({
    id: c.id,
    name: c.name,
    name_arabic: c.name_arabic,
    startPage: c.pages[0],
    endPage: c.pages[1]
  }));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHAPTERS_PATH, JSON.stringify(chapters, null, 2));
  return chapters;
}

async function loadVersesMap() {
  if (versesCache) return versesCache;
  versesCache = await ensureVersesFile();
  return versesCache;
}

async function loadChapters() {
  if (chaptersCache) return chaptersCache;
  chaptersCache = await ensureChaptersFile();
  return chaptersCache;
}

function getVersePage(versesMap, verseKey) {
  const entry = versesMap[verseKey];
  if (!entry || !entry.page) {
    throw new Error('لا توجد صفحة للآية ' + verseKey);
  }
  return entry.page;
}

async function computeJuzPagesFromVerses() {
  const versesMap = await loadVersesMap();
  return JUZ_START_VERSES.map((startVerse, index) => ({
    id: index + 1,
    startVerse,
    startPage: getVersePage(versesMap, startVerse)
  }));
}

async function ensureJuzPagesInDb() {
  const existing = db.getMushafJuzPages();
  if (existing && existing.length === 30) return existing;
  const computed = await computeJuzPagesFromVerses();
  db.setMushafJuzPages(computed);
  return computed;
}

async function getChapterStartPage(surahId) {
  const chapters = await loadChapters();
  const chapter = chapters.find((c) => c.id === Number(surahId));
  if (!chapter) throw new Error('سورة غير موجودة: ' + surahId);
  return chapter.startPage;
}

async function getJuzStartPage(juzId) {
  const juzPages = await ensureJuzPagesInDb();
  const juz = juzPages.find((j) => j.id === Number(juzId));
  if (!juz) throw new Error('جزء غير موجود: ' + juzId);
  return juz.startPage;
}

async function getAllSurahPages() {
  const chapters = await loadChapters();
  return chapters.map((c) => ({
    id: c.id,
    name: c.name_arabic || c.name,
    startPage: c.startPage,
    endPage: c.endPage
  }));
}

async function getAllJuzPages() {
  return ensureJuzPagesInDb();
}

async function initializeMushafIndex() {
  await ensureChaptersFile();
  await ensureJuzPagesInDb();
}

module.exports = {
  initializeMushafIndex,
  ensureChaptersFile,
  ensureJuzPagesInDb,
  getChapterStartPage,
  getJuzStartPage,
  getAllSurahPages,
  getAllJuzPages,
  computeJuzPagesFromVerses,
  loadChapters,
  JUZ_START_VERSES,
  QCF4_BASE
};

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_DB = {
  users: {},
  mosques: {},
  announcements: [],
  lessons: [],
  questions: [],
  settings: { developerIds: [] }
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    save(DEFAULT_DB);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function save(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

// ── المستخدمون ──────────────────────────────────
function getUser(id) {
  return load().users[String(id)] || null;
}

function saveUser(id, data) {
  const db = load();
  db.users[String(id)] = { ...(db.users[String(id)] || {}), ...data };
  save(db);
  return db.users[String(id)];
}

function allUsers() {
  return Object.values(load().users);
}

function usersByRole(role) {
  return allUsers().filter(u => u.role === role);
}

// ── المساجد ──────────────────────────────────────
function getMosque(id) {
  return load().mosques[String(id)] || null;
}

function saveMosque(id, data) {
  const db = load();
  db.mosques[String(id)] = { ...(db.mosques[String(id)] || {}), id: String(id), ...data };
  save(db);
  return db.mosques[String(id)];
}

function allMosques() {
  return Object.values(load().mosques);
}

function firstMosque() {
  return Object.values(load().mosques)[0] || null;
}

// ── الإعلانات ─────────────────────────────────────
function addAnnouncement(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, at: new Date().toISOString() };
  db.announcements.unshift(item);
  db.announcements = db.announcements.slice(0, 50);
  save(db);
  return item;
}

function getAnnouncements(n = 5) {
  return load().announcements.slice(0, n);
}

// ── الدروس ───────────────────────────────────────
function addLesson(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, at: new Date().toISOString() };
  db.lessons.unshift(item);
  db.lessons = db.lessons.slice(0, 100);
  save(db);
  return item;
}

function getLessons(n = 5) {
  return load().lessons.slice(0, n);
}

// ── الأسئلة ──────────────────────────────────────
function addQuestion(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, answered: false, at: new Date().toISOString() };
  db.questions.push(item);
  save(db);
  return item;
}

function pendingQuestions() {
  return load().questions.filter(q => !q.answered);
}

function answerQuestion(id, answer, by) {
  const db = load();
  const q = db.questions.find(q => q.id === id);
  if (q) {
    Object.assign(q, {
      answered: true,
      answer,
      answeredBy: by,
      answeredAt: new Date().toISOString()
    });
    save(db);
  }
  return q || null;
}

// ── صلاحية المطور ─────────────────────────────────
function isDeveloper(id) {
  const envIds = (process.env.DEVELOPER_IDS || '')
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(Boolean);
  const dbIds = load().settings.developerIds;
  return envIds.includes(Number(id)) || dbIds.includes(Number(id));
}

module.exports = {
  getUser, saveUser, allUsers, usersByRole,
  getMosque, saveMosque, allMosques, firstMosque,
  addAnnouncement, getAnnouncements,
  addLesson, getLessons,
  addQuestion, pendingQuestions, answerQuestion,
  isDeveloper
};

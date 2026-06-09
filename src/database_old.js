const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_DB = {
  users: {},
  mosques: {},
  announcements: [],
  lessons: [],
  questions: [],
  sheikhs: [],
  helpRequests: [],
  donations: {},
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
  const existing = db.mosques[String(id)] || {};
  db.mosques[String(id)] = {
    ...existing,
    id: String(id),
    active: existing.active !== undefined ? existing.active : true,
    ...data
  };
  save(db);
  return db.mosques[String(id)];
}

function deleteMosque(id) {
  const db = load();
  if (!db.mosques[String(id)]) return false;
  delete db.mosques[String(id)];
  save(db);
  return true;
}

function setMosqueActive(id, active) {
  const db = load();
  const mosque = db.mosques[String(id)];
  if (!mosque) return null;
  mosque.active = Boolean(active);
  save(db);
  return mosque;
}

function allMosques() {
  return Object.values(load().mosques);
}

function firstMosque() {
  return Object.values(load().mosques)[0] || null;
}

// ── الإحصائيات والأسئلة ─────────────────────────────────────
function allQuestions() {
  return load().questions;
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

// ── المشايخ ──────────────────────────────────────
function addSheikh(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, addedAt: new Date().toISOString() };
  db.sheikhs.push(item);
  save(db);
  return item;
}

function allSheikhs() {
  return load().sheikhs;
}

function deleteSheikh(id) {
  const db = load();
  const index = db.sheikhs.findIndex(s => s.id === id);
  if (index === -1) return false;
  db.sheikhs.splice(index, 1);
  save(db);
  return true;
}

function getSheikh(id) {
  return load().sheikhs.find(s => s.id === id);
}

// ── طلبات المساعدة ──────────────────────────────
function addHelpRequest(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, status: 'pending', at: new Date().toISOString() };
  db.helpRequests.push(item);
  save(db);
  return item;
}

function allHelpRequests() {
  return load().helpRequests;
}

function getPendingHelpRequests() {
  return load().helpRequests.filter(r => r.status === 'pending');
}

function updateHelpRequest(id, update) {
  const db = load();
  const req = db.helpRequests.find(r => r.id === id);
  if (req) {
    Object.assign(req, update);
    save(db);
  }
  return req || null;
}

// ── التبرعات ────────────────────────────────────
function setDonationIBAN(mosqueId, iban) {
  const db = load();
  if (!db.donations) db.donations = {};
  db.donations[mosqueId] = {
    ...(db.donations[mosqueId] || {}),
    iban,
    updatedAt: new Date().toISOString()
  };
  save(db);
  return db.donations[mosqueId];
}

function getDonationIBAN(mosqueId) {
  return load().donations?.[mosqueId]?.iban || null;
}

function setDonationPayPal(mosqueId, paypalEmail) {
  const db = load();
  if (!db.donations) db.donations = {};
  db.donations[mosqueId] = {
    ...(db.donations[mosqueId] || {}),
    paypalEmail,
    updatedAt: new Date().toISOString()
  };
  save(db);
  return db.donations[mosqueId];
}

function getDonationPayPal(mosqueId) {
  return load().donations?.[mosqueId]?.paypalEmail || null;
}

function getAllDonations() {
  return load().donations || {};
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
  getMosque, saveMosque, allMosques, firstMosque, deleteMosque, setMosqueActive,
  addAnnouncement, getAnnouncements,
  addLesson, getLessons,
  addQuestion, allQuestions, pendingQuestions, answerQuestion,
  addSheikh, allSheikhs, deleteSheikh, getSheikh,
  addHelpRequest, allHelpRequests, getPendingHelpRequests, updateHelpRequest,
  setDonationIBAN, getDonationIBAN, setDonationPayPal, getDonationPayPal, getAllDonations,
  isDeveloper
};

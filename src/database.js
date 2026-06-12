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
  secretQuestions: [],
  quranyCircles: [],
  sermons: [],
  sheikhInbox: [],
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

function getLessonsByAuthor(authorId) {
  return load().lessons.filter(l => l.addedBy === authorId);
}

// ── الأسئلة ──────────────────────────────────────
function addQuestion(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, answered: false, at: new Date().toISOString() };
  db.questions.push(item);
  save(db);
  return item;
}

function allQuestions() {
  return load().questions;
}

function pendingQuestions() {
  return load().questions.filter(q => !q.answered);
}

function getQuestionsByAuthor(authorId) {
  return load().questions.filter(q => q.askedBy === authorId);
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
  return load().sheikhs || [];
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

// ── الأسئلة الفقهية السرية ──────────────────────

function addSecretQuestion(data) {
  const db = load();
  const item = { id: Date.now().toString(), ...data, answered: false, at: new Date().toISOString() };
  db.secretQuestions.push(item);
  save(db);
  return item;
}

function allSecretQuestions() {
  return load().secretQuestions;
}

function getPendingSecretQuestions() {
  return load().secretQuestions.filter(q => !q.answered);
}

function getSecretQuestion(id) {
  return load().secretQuestions.find(q => q.id === id);
}

function answerSecretQuestion(id, answer, by) {
  const db = load();
  const q = db.secretQuestions.find(q => q.id === id);
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

// ── حلقات القرآن الكريم ──────────────────────────

function addQuranyCircle(data) {
  const db = load();
  const item = {
    id: Date.now().toString(),
    ...data,
    participants: [],
    waitlist: [],
    createdAt: new Date().toISOString()
  };
  db.quranyCircles.push(item);
  save(db);
  return item;
}

function allQuranyCircles() {
  return load().quranyCircles;
}

function getQuranyCircle(id) {
  return load().quranyCircles.find(c => c.id === id);
}

function deleteQuranyCircle(id) {
  const db = load();
  const index = db.quranyCircles.findIndex(c => c.id === id);
  if (index === -1) return false;
  db.quranyCircles.splice(index, 1);
  save(db);
  return true;
}

function getCirclesByAuthor(authorId) {
  return load().quranyCircles.filter(c => c.createdBy === authorId);
}

function addParticipantToCircle(circleId, userId, userName) {
  const db = load();
  const circle = db.quranyCircles.find(c => c.id === circleId);
  if (!circle) return null;
  
  if (circle.participants.length < (circle.maxParticipants || 20)) {
    circle.participants.push({
      userId,
      userName,
      joinedAt: new Date().toISOString()
    });
  } else {
    circle.waitlist.push({
      userId,
      userName,
      joinedAt: new Date().toISOString()
    });
  }
  save(db);
  return circle;
}

// ── الخطب والدروس ───────────────────────────────

function addSermon(data) {
  const db = load();
  const item = {
    id: Date.now().toString(),
    ...data,
    uploadedAt: new Date().toISOString()
  };
  db.sermons.push(item);
  save(db);
  return item;
}

function allSermons() {
  return load().sermons;
}

function getSermonsByAuthor(authorId) {
  return load().sermons.filter(s => s.uploadedBy === authorId);
}

function deleteSermon(id) {
  const db = load();
  const index = db.sermons.findIndex(s => s.id === id);
  if (index === -1) return false;
  db.sermons.splice(index, 1);
  save(db);
  return true;
}

// ── رسائل الشيخ ──────────────────────────────────

function addSheikhInboxMessage(data) {
  const db = load();
  if (!db.sheikhInbox) db.sheikhInbox = [];
  const item = {
    id: Date.now().toString(),
    read: false,
    at: new Date().toISOString(),
    ...data
  };
  db.sheikhInbox.unshift(item);
  db.sheikhInbox = db.sheikhInbox.slice(0, 100);
  save(db);
  return item;
}

function getSheikhInbox(sheikhId, limit = 8) {
  const inbox = load().sheikhInbox || [];
  return inbox
    .filter((m) => !m.sheikhId || String(m.sheikhId) === String(sheikhId))
    .slice(0, limit);
}

function allSheikhInbox() {
  return load().sheikhInbox || [];
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

function initDB(db) {
  const defaults = {
    scholars: [],
    scholar_applications: [],
    council_members: [],
    warnings: [],
    disputes: [],
    reputation: {},
    councils: [],
    aiResponses: [],
    moderators: []
  };
  let changed = false;
  for (const [key, value] of Object.entries(defaults)) {
    if (db[key] === undefined) {
      db[key] = Array.isArray(value) ? [] : { ...value };
      changed = true;
    }
  }
  if (changed) save(db);
  return db;
}

function readDB() {
  return initDB(load());
}

function saveDB(db) {
  save(db);
}

// ===== SCHOLAR SYSTEM =====

function addScholarApplication(data) {
  const db = readDB();
  const application = {
    id: Date.now().toString(),
    userId: data.userId,
    username: data.username,
    fullName: data.fullName,
    specialization: data.specialization,
    qualification: data.qualification,
    institution: data.institution,
    country: data.country,
    documentation: data.documentation,
    recommendation: data.recommendation,
    phone: data.phone || '',
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null
  };
  db.scholar_applications.push(application);
  saveDB(db);
  return application;
}

function getPendingScholarApplications() {
  const db = readDB();
  return (db.scholar_applications || []).filter(a => a.status === 'pending');
}

function approveScholarApplication(applicationId, reviewerId) {
  const db = readDB();
  const app = db.scholar_applications.find(a => a.id === applicationId);
  if (!app) return null;
  app.status = 'approved';
  app.reviewedAt = new Date().toISOString();
  app.reviewedBy = reviewerId;
  if (db.users[app.userId]) {
    db.users[app.userId].role = 'SCHOLAR';
    db.users[app.userId].scholarSince = new Date().toISOString();
    db.users[app.userId].country = app.country;
  }
  if (!db.scholars) db.scholars = [];
  db.scholars.push({
    userId: app.userId,
    fullName: app.fullName,
    specialization: app.specialization,
    country: app.country,
    reputation: 100,
    approvedAt: new Date().toISOString()
  });
  saveDB(db);
  return app;
}

function rejectScholarApplication(applicationId, reviewerId, reason) {
  const db = readDB();
  const app = db.scholar_applications.find(a => a.id === applicationId);
  if (!app) return null;
  app.status = 'rejected';
  app.reviewedAt = new Date().toISOString();
  app.reviewedBy = reviewerId;
  app.rejectionReason = reason;
  saveDB(db);
  return app;
}

function addWarning(data) {
  const db = readDB();
  if (!db.warnings) db.warnings = [];
  const warning = {
    id: Date.now().toString(),
    fromScholarId: data.fromScholarId,
    toSheikhId: data.toSheikhId,
    type: data.type,
    message: data.message,
    evidence: data.evidence,
    status: 'pending',
    sheikhResponse: null,
    sheikhEvidence: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null
  };
  db.warnings.push(warning);
  saveDB(db);
  return warning;
}

function respondToWarning(warningId, response, evidence) {
  const db = readDB();
  const warning = db.warnings.find(w => w.id === warningId);
  if (!warning) return null;
  warning.sheikhResponse = response;
  warning.sheikhEvidence = evidence;
  warning.status = 'disputed';
  saveDB(db);
  return warning;
}

// حفظ إجابة الذكاء الاصطناعي
function saveAIResponse(data) {
  const db = readDB();
  if (!db.aiResponses) db.aiResponses = [];
  const response = {
    id: Date.now().toString(),
    userId: data.userId,
    question: data.question,
    answer: data.answer,
    mode: data.mode || 'general',
    isSensitive: data.isSensitive || false,
    status: 'pending',
    scholarCorrection: null,
    scholarId: null,
    correctedAt: null,
    timestamp: data.timestamp || new Date().toISOString()
  };
  db.aiResponses.push(response);
  if (db.aiResponses.length > 200) {
    db.aiResponses = db.aiResponses.slice(-200);
  }
  saveDB(db);
  return response;
}

function getPendingAIResponses() {
  const db = readDB();
  if (!db.aiResponses) return [];
  return db.aiResponses.filter(r => r.status === 'pending').slice(-20);
}

function getSensitiveAIResponses() {
  const db = readDB();
  if (!db.aiResponses) return [];
  return db.aiResponses.filter(r => r.isSensitive && r.status === 'pending');
}

function correctAIResponse(responseId, scholarId, correction) {
  const db = readDB();
  if (!db.aiResponses) return null;
  const response = db.aiResponses.find(r => r.id === responseId);
  if (!response) return null;
  response.status = 'corrected';
  response.scholarCorrection = correction;
  response.scholarId = scholarId;
  response.correctedAt = new Date().toISOString();
  saveDB(db);
  return response;
}

function approveAIResponse(responseId, scholarId) {
  const db = readDB();
  if (!db.aiResponses) return null;
  const response = db.aiResponses.find(r => r.id === responseId);
  if (!response) return null;
  response.status = 'approved';
  response.scholarId = scholarId;
  response.correctedAt = new Date().toISOString();
  saveDB(db);
  return response;
}

// ═══ نظام MODERATOR ═══

function addModerator(userId, addedBy) {
  const db = readDB();
  if (!db.moderators) db.moderators = [];
  const exists = db.moderators.find(m => m.userId === String(userId));
  if (exists) return null;
  const moderator = {
    userId: String(userId),
    addedBy: String(addedBy),
    addedAt: new Date().toISOString(),
    active: true
  };
  db.moderators.push(moderator);
  if (db.users[userId]) {
    db.users[userId].role = 'MODERATOR';
  }
  saveDB(db);
  return moderator;
}

function removeModerator(userId) {
  const db = readDB();
  if (!db.moderators) return false;
  const index = db.moderators.findIndex(m => m.userId === String(userId));
  if (index === -1) return false;
  db.moderators.splice(index, 1);
  if (db.users[userId]) {
    db.users[userId].role = 'WORSHIPPER';
  }
  saveDB(db);
  return true;
}

function getModerators() {
  const db = readDB();
  return db.moderators || [];
}

function isModerator(userId) {
  const db = readDB();
  if (!db.moderators) return false;
  return db.moderators.some(m => m.userId === String(userId) && m.active);
}

function getAllScholars() {
  const db = readDB();
  return db.scholars || [];
}

module.exports = {
  getUser, saveUser, allUsers, usersByRole,
  getMosque, saveMosque, allMosques, firstMosque, deleteMosque, setMosqueActive,
  addAnnouncement, getAnnouncements,
  addLesson, getLessons, getLessonsByAuthor,
  addQuestion, allQuestions, pendingQuestions, answerQuestion, getQuestionsByAuthor,
  addSheikh, allSheikhs, deleteSheikh, getSheikh,
  addHelpRequest, allHelpRequests, getPendingHelpRequests, updateHelpRequest,
  setDonationIBAN, getDonationIBAN, setDonationPayPal, getDonationPayPal, getAllDonations,
  addSecretQuestion, allSecretQuestions, getPendingSecretQuestions, getSecretQuestion, answerSecretQuestion,
  addQuranyCircle, allQuranyCircles, getQuranyCircle, deleteQuranyCircle, getCirclesByAuthor, addParticipantToCircle,
  addSermon, allSermons, getSermonsByAuthor, deleteSermon,
  addSheikhInboxMessage, getSheikhInbox, allSheikhInbox,
  isDeveloper,
  addScholarApplication,
  getPendingScholarApplications,
  approveScholarApplication,
  rejectScholarApplication,
  addWarning,
  respondToWarning,
  saveAIResponse,
  getPendingAIResponses,
  getSensitiveAIResponses,
  correctAIResponse,
  approveAIResponse,
  addModerator,
  removeModerator,
  getModerators,
  isModerator,
  getAllScholars
};

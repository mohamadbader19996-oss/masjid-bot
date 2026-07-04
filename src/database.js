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
  settings: { developerIds: [] },
  quran_page_cache: {},
  recitation_sheikh_requests: {},
  recitation_sessions: {},
  journeyVideos: {
    wudu: {
      default: {
        simple: { url: 'https://www.youtube.com/watch?v=VOI6TZxEuIw', approved: true },
        advanced: { url: 'https://www.youtube.com/watch?v=dWBQg4BKT9k', approved: true }
      }
    },
    prayer: {
      default: {
        simple: { url: 'https://www.youtube.com/watch?v=S-eDUrA9pz0', approved: true },
        medium: { url: 'https://www.youtube.com/watch?v=rfn2UKQElnc', approved: true },
        advanced: { url: 'https://www.youtube.com/watch?v=OLEDPncAgDs&t=527s', approved: true }
      }
    },
    prayer_female: {
      default: {
        single: { url: 'https://www.youtube.com/watch?v=y9jNU1DrlcA', approved: true }
      }
    }
  },
  debates: {
    regional: {}
  }
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
  const sid = String(id);
  db.users[sid] = { ...(db.users[sid] || {}), ...data, id: db.users[sid]?.id ?? (Number(sid) || sid) };
  save(db);
  return db.users[sid];
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
  if (!Array.isArray(db.sheikhs)) db.sheikhs = [];
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
  if (!Array.isArray(db.sheikhs)) return false;
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
  const item = {
    id: Date.now().toString(),
    userId: null,
    mosqueId: null,
    resolvedInternally: false,
    broadcastScope: null,
    broadcastText: null,
    broadcastMessageIds: [],
    claimedBy: null,
    claimedAt: null,
    completedAt: null,
    ...data,
    status: 'pending',
    at: new Date().toISOString()
  };
  db.helpRequests.push(item);
  save(db);
  return item;
}

function claimHelpRequest(id, userId) {
  const db = load();
  const req = db.helpRequests.find(r => r.id === id);
  if (!req || req.status !== 'broadcasting') return null;
  if (req.claimedBy) return null;
  req.claimedBy = String(userId);
  req.claimedAt = new Date().toISOString();
  req.status = 'claimed';
  req.staleNotifiedAt = null;
  save(db);
  return req;
}

function completeHelpRequest(id) {
  const db = load();
  const req = db.helpRequests.find(r => r.id === id);
  if (!req) return null;
  req.status = 'resolved';
  req.completedAt = new Date().toISOString();
  save(db);
  return req;
}

function getBroadcastingHelpRequests() {
  return load().helpRequests.filter(r => r.status === 'broadcasting');
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
  return load().secretQuestions || [];
}

function getPendingSecretQuestions() {
  return allSecretQuestions().filter(q => !q.answered);
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
    qa_cache: {},
    quran_glossary: {},
    moderators: [],
    mosque_health: {},
    moderator_applications: {},
    main_menu_usage: {}
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

function getPendingMosques() {
  const db = readDB();
  return Object.values(db.mosqueRequests || {}).filter(r => r.status === 'pending');
}

function getMosqueRequest(requestId) {
  const db = readDB();
  return db.mosqueRequests?.[requestId] || null;
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

const QA_CACHE_MAX_ENTRIES = 5000;

function getQaCacheEntry(cacheKey) {
  const db = readDB();
  if (!db.qa_cache) db.qa_cache = {};
  return db.qa_cache[cacheKey] || null;
}

function setQaCacheEntry(cacheKey, data) {
  const db = readDB();
  if (!db.qa_cache) db.qa_cache = {};
  db.qa_cache[cacheKey] = {
    answer: data.answer,
    question: data.question,
    religion: data.religion,
    madhab: data.madhab,
    sect: data.sect,
    mode: data.mode,
    createdAt: new Date().toISOString(),
    hits: 0
  };
  const keys = Object.keys(db.qa_cache);
  if (keys.length > QA_CACHE_MAX_ENTRIES) {
    const sorted = keys.sort(
      (a, b) => new Date(db.qa_cache[a].createdAt) - new Date(db.qa_cache[b].createdAt)
    );
    sorted.slice(0, keys.length - QA_CACHE_MAX_ENTRIES).forEach((k) => delete db.qa_cache[k]);
  }
  saveDB(db);
  return db.qa_cache[cacheKey];
}

function touchQaCacheEntry(cacheKey) {
  const db = readDB();
  const entry = db.qa_cache?.[cacheKey];
  if (!entry) return null;
  entry.hits = (entry.hits || 0) + 1;
  entry.lastHitAt = new Date().toISOString();
  saveDB(db);
  return entry;
}

function clearQaCache() {
  const db = readDB();
  db.qa_cache = {};
  saveDB(db);
}

function getQuranPageCache(pageNumber) {
  const db = readDB();
  if (!db.quran_page_cache) db.quran_page_cache = {};
  return db.quran_page_cache[String(pageNumber)] || null;
}

function setQuranPageCache(pageNumber, verses) {
  const db = readDB();
  if (!db.quran_page_cache) db.quran_page_cache = {};
  db.quran_page_cache[String(pageNumber)] = verses;
  saveDB(db);
  return verses;
}

function getMushafJuzPages() {
  const db = readDB();
  return db.mushaf_juz_pages || null;
}

function setMushafJuzPages(pages) {
  const db = readDB();
  db.mushaf_juz_pages = pages;
  saveDB(db);
  return pages;
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
    db.users[userId].role = 'moderator';
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

function loadDB() {
  return readDB();
}

function get(key) {
  const db = loadDB();
  return db[key];
}

function set(key, value) {
  const db = loadDB();
  db[key] = value;
  saveDB(db);
}

// ===== MOSQUE ROLES =====
function getMosqueRoles(mosqueId) {
  const db = loadDB();
  return db.mosque_roles?.[mosqueId] || {};
}
function setMosqueRole(mosqueId, userId, role) {
  const db = loadDB();
  if (!db.mosque_roles[mosqueId]) db.mosque_roles[mosqueId] = {};
  db.mosque_roles[mosqueId][userId] = {
    role, assignedAt: new Date().toISOString(), active: true
  };
  saveDB(db);
}
function setMosqueRoles(mosqueId, roles) {
  const db = loadDB();
  if (!db.mosque_roles) db.mosque_roles = {};
  db.mosque_roles[mosqueId] = roles;
  saveDB(db);
}
function removeMosqueRole(mosqueId, userId) {
  const db = loadDB();
  if (db.mosque_roles[mosqueId] && db.mosque_roles[mosqueId][userId]) {
    delete db.mosque_roles[mosqueId][userId];
    saveDB(db);
  }
}
function getUserMosqueRole(mosqueId, userId) {
  const db = loadDB();
  return db.mosque_roles[mosqueId]?.[userId] || null;
}
// ===== CAMPAIGNS =====
function createCampaign(mosqueId, data) {
  const db = loadDB();
  const id = 'camp_' + Date.now();
  db.campaigns[id] = {
    id, mosqueId,
    title: data.title,
    description: data.description,
    targetAmount: data.targetAmount,
    collectedAmount: 0,
    manualAmount: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    endAt: data.endAt || null,
    approvals: {}
  };
  saveDB(db);
  return id;
}
function getCampaign(id) {
  const db = loadDB();
  return db.campaigns[id] || null;
}
function getMosqueCampaigns(mosqueId) {
  const db = loadDB();
  return Object.values(db.campaigns).filter(c => c.mosqueId === mosqueId);
}
function getActiveCampaigns() {
  const db = loadDB();
  return Object.values(db.campaigns).filter(c => c.status === 'active');
}
function addManualAmount(campaignId, amount, addedBy) {
  const db = loadDB();
  if (!db.campaigns[campaignId]) return false;
  db.campaigns[campaignId].manualAmount += amount;
  db.campaigns[campaignId].collectedAmount += amount;
  if (!db.campaigns[campaignId].manualEntries) db.campaigns[campaignId].manualEntries = [];
  db.campaigns[campaignId].manualEntries.push({
    amount, addedBy, addedAt: new Date().toISOString()
  });
  saveDB(db);
  return true;
}
function approveCampaign(campaignId, mosqueId, approved, reason) {
  const db = loadDB();
  if (!db.campaigns[campaignId]) return false;
  db.campaigns[campaignId].approvals[mosqueId] = {
    approved, reason: reason || null, at: new Date().toISOString()
  };
  saveDB(db);
  return true;
}
function closeCampaign(campaignId) {
  const db = loadDB();
  if (!db.campaigns[campaignId]) return false;
  db.campaigns[campaignId].status = 'closed';
  db.campaigns[campaignId].closedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== EVENTS =====
function createEvent(mosqueId, data) {
  const db = loadDB();
  const id = 'event_' + Date.now();
  db.events[id] = {
    id, mosqueId,
    title: data.title,
    description: data.description,
    date: data.date,
    time: data.time,
    suggestedBy: data.suggestedBy,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  saveDB(db);
  return id;
}
function getEvent(id) {
  const db = loadDB();
  return db.events[id] || null;
}
function getMosqueEvents(mosqueId) {
  const db = loadDB();
  return Object.values(db.events || {}).filter(e => e.mosqueId === mosqueId);
}
function updateEventStatus(id, status, reason) {
  const db = loadDB();
  if (!db.events[id]) return false;
  db.events[id].status = status;
  if (reason) db.events[id].rejectionReason = reason;
  db.events[id].updatedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== COMPLAINTS =====
function createComplaint(mosqueId, userId, text) {
  const db = loadDB();
  const id = 'comp_' + Date.now();
  db.complaints[id] = {
    id, mosqueId, userId, text,
    status: 'open',
    createdAt: new Date().toISOString(),
    reply: null, repliedAt: null
  };
  saveDB(db);
  return id;
}
function getMosqueComplaints(mosqueId) {
  const db = loadDB();
  return Object.values(db.complaints || {}).filter(c => c.mosqueId === mosqueId);
}
function replyComplaint(id, reply) {
  const db = loadDB();
  if (!db.complaints[id]) return false;
  db.complaints[id].reply = reply;
  db.complaints[id].status = 'resolved';
  db.complaints[id].repliedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== LOGISTICS =====
function createLogisticsReport(mosqueId, userId, data) {
  const db = loadDB();
  const id = 'log_' + Date.now();
  db.logistics_reports[id] = {
    id, mosqueId, userId,
    category: data.category,
    description: data.description,
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null, resolvedImage: null
  };
  saveDB(db);
  return id;
}
function getMosqueLogistics(mosqueId) {
  const db = loadDB();
  return Object.values(db.logistics_reports || {}).filter(r => r.mosqueId === mosqueId);
}
function resolveLogistics(id, image) {
  const db = loadDB();
  if (!db.logistics_reports[id]) return false;
  db.logistics_reports[id].status = 'resolved';
  db.logistics_reports[id].resolvedAt = new Date().toISOString();
  if (image) db.logistics_reports[id].resolvedImage = image;
  saveDB(db);
  return true;
}
// ===== PLATFORM MESSAGES =====
function sendPlatformMessage(mosqueId, userId, text, type) {
  const db = loadDB();
  const id = 'pmsg_' + Date.now();
  db.platform_messages[id] = {
    id, mosqueId, userId, text,
    type: type || 'note',
    status: 'pending',
    createdAt: new Date().toISOString(),
    reply: null
  };
  saveDB(db);
  return id;
}
function getPlatformMessages() {
  const db = loadDB();
  return Object.values(db.platform_messages);
}
function replyPlatformMessage(id, reply) {
  const db = loadDB();
  if (!db.platform_messages[id]) return false;
  db.platform_messages[id].reply = reply;
  db.platform_messages[id].status = 'replied';
  db.platform_messages[id].repliedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== MOSQUE HEALTH =====
function updateMosqueHealth(mosqueId, field, value) {
  const db = loadDB();
  if (!db.mosque_health) db.mosque_health = {};
  if (!db.mosque_health[mosqueId]) {
    db.mosque_health[mosqueId] = {
      lastActive: null,
      hasActiveSheikh: false,
      hasTransparentFinance: false,
      respondedToComplaints: false,
      campaignWithoutActivity: false,
      score: 0
    };
  }
  db.mosque_health[mosqueId][field] = value;
  db.mosque_health[mosqueId].updatedAt = new Date().toISOString();
  saveDB(db);
}
function getMosqueHealth(mosqueId) {
  const db = loadDB();
  return db.mosque_health?.[mosqueId] || null;
}
function checkInactiveMosques() {
  const db = loadDB();
  const campaigns = Object.values(db.campaigns).filter(c => c.status === 'active');
  const inactive = [];
  campaigns.forEach(camp => {
    const health = db.mosque_health[camp.mosqueId];
    if (!health || !health.lastActive) {
      inactive.push(camp.mosqueId);
    } else {
      const daysSinceActive = (Date.now() - new Date(health.lastActive)) / (1000 * 60 * 60 * 24);
      if (daysSinceActive > 30) inactive.push(camp.mosqueId);
    }
  });
  return [...new Set(inactive)];
}

// ===== MOSQUE ROLES =====
function getMosqueRoles(mosqueId) {
  const db = loadDB();
  return db.mosque_roles?.[mosqueId] || {};
}
function setMosqueRole(mosqueId, userId, role) {
  const db = loadDB();
  if (!db.mosque_roles[mosqueId]) db.mosque_roles[mosqueId] = {};
  db.mosque_roles[mosqueId][userId] = {
    role, assignedAt: new Date().toISOString(), active: true
  };
  saveDB(db);
}
function setMosqueRoles(mosqueId, roles) {
  const db = loadDB();
  if (!db.mosque_roles) db.mosque_roles = {};
  db.mosque_roles[mosqueId] = roles;
  saveDB(db);
}
function removeMosqueRole(mosqueId, userId) {
  const db = loadDB();
  if (db.mosque_roles[mosqueId]?.[userId]) {
    delete db.mosque_roles[mosqueId][userId];
    saveDB(db);
  }
}
function getUserMosqueRole(mosqueId, userId) {
  const db = loadDB();
  return db.mosque_roles[mosqueId]?.[userId] || null;
}
function getMosquesByCity(city) {
  const db = loadDB();
  return Object.values(db.mosques).filter(m => m.city === city);
}
function getMosquesByCountry(country) {
  const db = loadDB();
  return Object.values(db.mosques).filter(m => m.country === country);
}
function getNearbyMosques(mosqueId) {
  const db = loadDB();
  const mosque = db.mosques[mosqueId];
  if (!mosque) return [];
  return Object.values(db.mosques).filter(m => m.id !== mosqueId && m.city === mosque.city);
}
// ===== CAMPAIGNS =====
function createCampaign(mosqueId, data) {
  const db = loadDB();
  const id = 'camp_' + Date.now();
  db.campaigns[id] = {
    id, mosqueId,
    title: data.title,
    description: data.description,
    targetAmount: data.targetAmount,
    collectedAmount: 0,
    manualAmount: 0,
    scope: data.scope || 'mosque',
    status: 'active',
    createdAt: new Date().toISOString(),
    endAt: data.endAt || null,
    approvals: {},
    manualEntries: []
  };
  saveDB(db);
  return id;
}
function getCampaign(id) {
  const db = loadDB();
  return db.campaigns[id] || null;
}
function getMosqueCampaigns(mosqueId) {
  const db = loadDB();
  return Object.values(db.campaigns).filter(c => c.mosqueId === mosqueId);
}
function getActiveCampaigns() {
  const db = loadDB();
  return Object.values(db.campaigns).filter(c => c.status === 'active');
}
function addManualAmount(campaignId, amount, addedBy) {
  const db = loadDB();
  if (!db.campaigns[campaignId]) return false;
  db.campaigns[campaignId].manualAmount += amount;
  db.campaigns[campaignId].collectedAmount += amount;
  db.campaigns[campaignId].manualEntries.push({
    amount, addedBy, addedAt: new Date().toISOString()
  });
  saveDB(db);
  return true;
}
function approveCampaign(campaignId, mosqueId, approved, reason) {
  const db = loadDB();
  if (!db.campaigns[campaignId]) return false;
  db.campaigns[campaignId].approvals[mosqueId] = {
    approved, reason: reason || null, at: new Date().toISOString()
  };
  saveDB(db);
  return true;
}
function closeCampaign(campaignId) {
  const db = loadDB();
  if (!db.campaigns[campaignId]) return false;
  db.campaigns[campaignId].status = 'closed';
  db.campaigns[campaignId].closedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== EVENTS =====
function createEvent(mosqueId, data) {
  const db = loadDB();
  const id = 'event_' + Date.now();
  db.events[id] = {
    id, mosqueId,
    title: data.title,
    description: data.description,
    date: data.date,
    time: data.time,
    scope: data.scope || 'mosque',
    suggestedBy: data.suggestedBy,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  saveDB(db);
  return id;
}
function getMosqueEvents(mosqueId) {
  const db = loadDB();
  return Object.values(db.events || {}).filter(e => e.mosqueId === mosqueId);
}
function updateEventStatus(id, status, reason) {
  const db = loadDB();
  if (!db.events[id]) return false;
  db.events[id].status = status;
  if (reason) db.events[id].rejectionReason = reason;
  db.events[id].updatedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== COMPLAINTS =====
function createComplaint(mosqueId, userId, text) {
  const db = loadDB();
  const id = 'comp_' + Date.now();
  db.complaints[id] = {
    id, mosqueId, userId, text,
    status: 'open',
    createdAt: new Date().toISOString(),
    reply: null, repliedAt: null
  };
  saveDB(db);
  return id;
}
function getMosqueComplaints(mosqueId) {
  const db = loadDB();
  return Object.values(db.complaints || {}).filter(c => c.mosqueId === mosqueId);
}
function replyComplaint(id, reply) {
  const db = loadDB();
  if (!db.complaints[id]) return false;
  db.complaints[id].reply = reply;
  db.complaints[id].status = 'resolved';
  db.complaints[id].repliedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== LOGISTICS =====
function createLogisticsReport(mosqueId, userId, data) {
  const db = loadDB();
  const id = 'log_' + Date.now();
  db.logistics_reports[id] = {
    id, mosqueId, userId,
    category: data.category,
    description: data.description,
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedImage: null
  };
  saveDB(db);
  return id;
}
function getMosqueLogistics(mosqueId) {
  const db = loadDB();
  return Object.values(db.logistics_reports || {}).filter(r => r.mosqueId === mosqueId);
}
function resolveLogistics(id, image) {
  const db = loadDB();
  if (!db.logistics_reports[id]) return false;
  db.logistics_reports[id].status = 'resolved';
  db.logistics_reports[id].resolvedAt = new Date().toISOString();
  if (image) db.logistics_reports[id].resolvedImage = image;
  saveDB(db);
  return true;
}
// ===== PLATFORM MESSAGES =====
function sendPlatformMessage(mosqueId, userId, text, type) {
  const db = loadDB();
  const id = 'pmsg_' + Date.now();
  db.platform_messages[id] = {
    id, mosqueId, userId, text,
    type: type || 'note',
    status: 'pending',
    createdAt: new Date().toISOString(),
    reply: null
  };
  saveDB(db);
  return id;
}
function getPlatformMessages() {
  const db = loadDB();
  return Object.values(db.platform_messages);
}
function replyPlatformMessage(id, reply) {
  const db = loadDB();
  if (!db.platform_messages[id]) return false;
  db.platform_messages[id].reply = reply;
  db.platform_messages[id].status = 'replied';
  db.platform_messages[id].repliedAt = new Date().toISOString();
  saveDB(db);
  return true;
}
// ===== MOSQUE HEALTH =====
function updateMosqueHealth(mosqueId, field, value) {
  const db = loadDB();
  if (!db.mosque_health) db.mosque_health = {};
  if (!db.mosque_health[mosqueId]) {
    db.mosque_health[mosqueId] = {
      lastActive: null,
      hasActiveSheikh: false,
      hasTransparentFinance: false,
      respondedToComplaints: false,
      campaignWithoutActivity: false,
      score: 0
    };
  }
  db.mosque_health[mosqueId][field] = value;
  db.mosque_health[mosqueId].updatedAt = new Date().toISOString();
  saveDB(db);
}
function getMosqueHealth(mosqueId) {
  const db = loadDB();
  return db.mosque_health?.[mosqueId] || null;
}
function checkInactiveMosques() {
  const db = loadDB();
  const campaigns = Object.values(db.campaigns).filter(c => c.status === 'active');
  const inactive = [];
  campaigns.forEach(camp => {
    const health = db.mosque_health[camp.mosqueId];
    if (!health || !health.lastActive) {
      inactive.push(camp.mosqueId);
    } else {
      const days = (Date.now() - new Date(health.lastActive)) / 86400000;
      if (days > 30) inactive.push(camp.mosqueId);
    }
  });
  return [...new Set(inactive)];
}

function getAllMosques() {
  const db = loadDB();
  return db.mosques || {};
}

function saveInviteCode(code, data) {
  const db = loadDB();
  if (!db.inviteCodes) db.inviteCodes = {};
  db.inviteCodes[code] = data;
  saveDB(db);
}
function getInviteCode(code) {
  const db = loadDB();
  if (db.inviteCodes?.[code]) return db.inviteCodes[code];
  for (const mosque of Object.values(db.mosques || {})) {
    if (mosque.worshipperInviteCode === code) {
      return {
        mosqueId: String(mosque.id),
        role: 'worshipper',
        permanent: true,
        used: false
      };
    }
  }
  return null;
}
function markInviteUsed(code) {
  const invite = getInviteCode(code);
  if (invite?.permanent) return;
  const db = loadDB();
  if (db.inviteCodes?.[code]) {
    db.inviteCodes[code].used = true;
    db.inviteCodes[code].usedAt = new Date().toISOString();
    saveDB(db);
  }
}

function getOrCreateWorshipperInviteCode(mosqueId) {
  const id = String(mosqueId);
  const db = load();
  const mosque = db.mosques[id];
  if (!mosque) return null;
  if (mosque.worshipperInviteCode) return mosque.worshipperInviteCode;
  const code = `join_${id}_worshipper`;
  db.mosques[id].worshipperInviteCode = code;
  if (!db.inviteCodes) db.inviteCodes = {};
  db.inviteCodes[code] = {
    mosqueId: id,
    role: 'worshipper',
    permanent: true,
    createdAt: new Date().toISOString(),
    used: false
  };
  save(db);
  return code;
}

function getMosqueWorshippers(mosqueId) {
  const db = load();
  const mid = String(mosqueId);
  const ids = new Set();
  const roles = db.mosque_roles?.[mid] || {};
  for (const [uid, data] of Object.entries(roles)) {
    if (data.role === 'worshipper') ids.add(String(uid));
  }
  for (const [uid, user] of Object.entries(db.users || {})) {
    if (String(user.mosqueId) === mid && user.role === 'worshipper') ids.add(String(uid));
  }
  return [...ids];
}

function kickWorshipperFromMosque(mosqueId, userId) {
  const mid = String(mosqueId);
  const uid = String(userId);
  removeMosqueRole(mid, uid);
  const user = getUser(uid);
  if (user && String(user.mosqueId) === mid) {
    saveUser(uid, { mosqueId: null });
  }
}

function getOrCreateModeratorDevInviteCode() {
  const db = load();
  if (!db.settings) db.settings = { developerIds: [] };
  if (!db.settings.moderatorDevInviteCode) {
    db.settings.moderatorDevInviteCode = 'invite_moderator_dev';
    save(db);
  }
  return db.settings.moderatorDevInviteCode;
}

function saveModeratorApplication(id, data) {
  const db = loadDB();
  if (!db.moderator_applications) db.moderator_applications = {};
  db.moderator_applications[id] = { id, ...data };
  saveDB(db);
  return db.moderator_applications[id];
}

function getModeratorApplication(id) {
  const db = loadDB();
  return db.moderator_applications?.[id] || null;
}

function updateModeratorApplication(id, updates) {
  const db = loadDB();
  if (!db.moderator_applications?.[id]) return null;
  db.moderator_applications[id] = { ...db.moderator_applications[id], ...updates };
  saveDB(db);
  return db.moderator_applications[id];
}

function getPendingModeratorApplications() {
  const db = loadDB();
  return Object.values(db.moderator_applications || {}).filter(a => a.status === 'pending');
}

function getRegionalModeratorsByCountry(countryCode) {
  if (!countryCode) return [];
  const { countryCodesMatch } = require('./data/muslimCountries');
  return allUsers().filter(u =>
    (u.role === 'moderator' || u.role === 'MODERATOR') &&
    countryCodesMatch(u.moderatorCountry, countryCode)
  );
}

function getApprovedRegionalModerators() {
  const db = load();
  return Object.entries(db.users || {})
    .filter(([, u]) => u.role === 'moderator' || u.role === 'MODERATOR')
    .map(([uid, u]) => ({ ...u, id: uid }));
}

function revokeRegionalModerator(userId, revokedBy) {
  const uid = String(userId);
  const user = getUser(uid);
  if (!user || (user.role !== 'moderator' && user.role !== 'MODERATOR')) {
    return { ok: false, error: 'not_moderator' };
  }

  const restoreRole = user.roleBeforeModerator || 'worshipper';
  removeModerator(uid);
  saveUser(uid, {
    role: restoreRole,
    roleBeforeModerator: null,
    moderatorCountry: null,
    moderatorIdFileId: null,
    approvedBy: null,
    approvedAt: null,
    moderatorRevokedAt: new Date().toISOString(),
    moderatorRevokedBy: String(revokedBy)
  });

  const db = loadDB();
  for (const app of Object.values(db.moderator_applications || {})) {
    if (String(app.userId) === uid && app.status === 'approved') {
      updateModeratorApplication(app.id, {
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        revokedBy: String(revokedBy)
      });
    }
  }

  return { ok: true, restoredRole: restoreRole };
}

function getMosquesApprovedByModerators() {
  return allMosques().filter(m => m.approvedByModeratorId);
}

function getMosquesApprovedByDeveloper() {
  return allMosques().filter(m => m.approvedByDeveloper && !m.approvedByModeratorId);
}

function createRecitationSheikhRequest(sheikhId) {
  const db = load();
  if (!db.recitation_sheikh_requests) db.recitation_sheikh_requests = {};
  const requestId = `rec_sheikh_${Date.now()}_${sheikhId}`;
  const request = {
    id: requestId,
    sheikhId: String(sheikhId),
    status: 'pending',
    requestedAt: new Date().toISOString()
  };
  db.recitation_sheikh_requests[requestId] = request;
  save(db);
  return request;
}

function getRecitationSheikhRequest(requestId) {
  return load().recitation_sheikh_requests?.[requestId] || null;
}

function updateRecitationSheikhRequest(requestId, patch) {
  const db = load();
  if (!db.recitation_sheikh_requests?.[requestId]) return null;
  db.recitation_sheikh_requests[requestId] = {
    ...db.recitation_sheikh_requests[requestId],
    ...patch
  };
  save(db);
  return db.recitation_sheikh_requests[requestId];
}

function createRecitationSession(data) {
  const db = load();
  if (!db.recitation_sessions) db.recitation_sessions = {};
  const sessionId = `rec_sess_${Date.now()}_${data.studentId}`;
  const session = {
    id: sessionId,
    studentId: String(data.studentId),
    sheikhId: String(data.sheikhId),
    pageNumber: data.pageNumber,
    status: 'waiting_voice',
    createdAt: new Date().toISOString()
  };
  db.recitation_sessions[sessionId] = session;
  save(db);
  return session;
}

function getRecitationSession(sessionId) {
  return load().recitation_sessions?.[sessionId] || null;
}

function updateRecitationSession(sessionId, patch) {
  const db = load();
  if (!db.recitation_sessions?.[sessionId]) return null;
  db.recitation_sessions[sessionId] = {
    ...db.recitation_sessions[sessionId],
    ...patch
  };
  save(db);
  return db.recitation_sessions[sessionId];
}

function findRecitationSessionBy(filterFn) {
  const sessions = Object.values(load().recitation_sessions || {});
  return sessions.find(filterFn) || null;
}

function getPendingRecitationSheikhRequest(sheikhId) {
  const requests = Object.values(load().recitation_sheikh_requests || {});
  return requests.find((r) => r.sheikhId === String(sheikhId) && r.status === 'pending') || null;
}

function incrementMainMenuUsage(buttonName) {
  const db = load();
  if (!db.main_menu_usage) db.main_menu_usage = {};
  db.main_menu_usage[buttonName] = (db.main_menu_usage[buttonName] || 0) + 1;
  save(db);
  return db.main_menu_usage[buttonName];
}

function getMainMenuUsage() {
  return load().main_menu_usage || {};
}

function resetMainMenuUsage() {
  const db = load();
  db.main_menu_usage = {};
  save(db);
}

const { VOLUNTEER_LANGUAGES } = require('./handlers/volunteers');
const JOURNEY_VIDEO_LANG_CODES = Object.keys(VOLUNTEER_LANGUAGES);

function ensureJourneyVideosTopic(db, topic) {
  if (!db.journeyVideos) {
    db.journeyVideos = {};
  }
  if (!db.journeyVideos[topic]) {
    db.journeyVideos[topic] = Object.fromEntries(JOURNEY_VIDEO_LANG_CODES.map((c) => [c, null]));
  }
  return db.journeyVideos[topic];
}

function getJourneyVideosRaw() {
  return load().journeyVideos || {};
}

function normalizeJourneyVideoEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { url: entry, approved: true };
  if (typeof entry === 'object' && entry.url) return entry;
  return null;
}

function getApprovedJourneyVideoUrl(topicData, langCode) {
  if (!topicData || !langCode) return null;
  const entry = normalizeJourneyVideoEntry(topicData[langCode]);
  if (entry?.approved && entry.url) return entry.url;
  return null;
}

function getJourneyVideo(topic, langCode) {
  if (topic === 'wudu') {
    const data = getWuduVideosForLang(langCode);
    if (data.type === 'single') return data.url;
    return data.advanced || data.simple || null;
  }
  const topicData = getJourneyVideosRaw()[topic];
  if (!topicData) return null;
  if (langCode) {
    const url = getApprovedJourneyVideoUrl(topicData, langCode);
    if (url) return url;
  }
  return getApprovedJourneyVideoUrl(topicData, 'en');
}

function setJourneyVideo(topic, langCode, url, { approved = false } = {}) {
  const db = load();
  if (topic === 'prayer' && isPrayerLevelKey(langCode)) {
    const prayer = ensurePrayerTopic(db);
    if (!url) {
      delete prayer.default[langCode];
    } else {
      prayer.default[langCode] = { url, approved: !!approved };
    }
  } else if (topic === 'prayer') {
    const prayer = ensurePrayerTopic(db);
    if (!url) {
      delete prayer[langCode];
    } else {
      prayer[langCode] = { url, approved: !!approved };
    }
  } else if (topic === 'wudu' && isWuduLevelKey(langCode)) {
    const wudu = ensureWuduTopic(db);
    if (!url) {
      delete wudu.default[langCode];
    } else {
      wudu.default[langCode] = { url, approved: !!approved };
    }
  } else if (topic === 'wudu') {
    const wudu = ensureWuduTopic(db);
    if (!url) {
      delete wudu[langCode];
    } else {
      wudu[langCode] = { url, approved: !!approved };
    }
  } else {
    ensureJourneyVideosTopic(db, topic);
    if (!url) {
      db.journeyVideos[topic][langCode] = null;
    } else {
      db.journeyVideos[topic][langCode] = { url, approved: !!approved };
    }
  }
  saveDB(db);
  return db.journeyVideos[topic];
}

function approveJourneyVideo(topic, langCode) {
  const db = load();
  if (topic === 'prayer' && isPrayerLevelKey(langCode)) {
    const prayer = ensurePrayerTopic(db);
    const entry = normalizeJourneyVideoEntry(prayer.default[langCode]);
    if (!entry?.url) return false;
    prayer.default[langCode] = { url: entry.url, approved: true };
  } else if (topic === 'prayer') {
    const prayer = ensurePrayerTopic(db);
    const entry = normalizeJourneyVideoEntry(prayer[langCode]);
    if (!entry?.url) return false;
    prayer[langCode] = { url: entry.url, approved: true };
  } else if (topic === 'wudu' && isWuduLevelKey(langCode)) {
    const wudu = ensureWuduTopic(db);
    const entry = normalizeJourneyVideoEntry(wudu.default[langCode]);
    if (!entry?.url) return false;
    wudu.default[langCode] = { url: entry.url, approved: true };
  } else if (topic === 'wudu') {
    const wudu = ensureWuduTopic(db);
    const entry = normalizeJourneyVideoEntry(wudu[langCode]);
    if (!entry?.url) return false;
    wudu[langCode] = { url: entry.url, approved: true };
  } else {
    ensureJourneyVideosTopic(db, topic);
    const entry = normalizeJourneyVideoEntry(db.journeyVideos[topic][langCode]);
    if (!entry?.url) return false;
    db.journeyVideos[topic][langCode] = { url: entry.url, approved: true };
  }
  saveDB(db);
  return true;
}

function getJourneyVideoEntry(topic, langCode) {
  const topicData = getJourneyVideosRaw()[topic];
  if (topic === 'prayer' && isPrayerLevelKey(langCode)) {
    return normalizeJourneyVideoEntry(getPrayerDefaultData(topicData)[langCode]);
  }
  if (topic === 'wudu' && isWuduLevelKey(langCode)) {
    return normalizeJourneyVideoEntry(getWuduDefaultData(topicData)[langCode]);
  }
  if (topic === 'prayer') {
    return normalizeJourneyVideoEntry(topicData?.[langCode]);
  }
  if (topic === 'wudu') {
    return normalizeJourneyVideoEntry(topicData?.[langCode]);
  }
  return normalizeJourneyVideoEntry(topicData?.[langCode]);
}

const PRAYER_VIDEO_LEVELS = ['simple', 'medium', 'advanced'];
const WUDU_VIDEO_LEVELS = ['simple', 'advanced'];

function ensurePrayerTopic(db) {
  if (!db.journeyVideos) db.journeyVideos = {};
  const prayer = db.journeyVideos.prayer;
  if (!prayer) {
    db.journeyVideos.prayer = { default: {} };
    return db.journeyVideos.prayer;
  }
  if (!prayer.default) {
    prayer.default = {};
    for (const level of PRAYER_VIDEO_LEVELS) {
      if (prayer[level]) {
        prayer.default[level] = prayer[level];
      }
    }
  }
  return prayer;
}

function isPrayerLevelKey(key) {
  return PRAYER_VIDEO_LEVELS.includes(key);
}

function isWuduLevelKey(key) {
  return WUDU_VIDEO_LEVELS.includes(key);
}

function getPrayerDefaultData(rawPrayer) {
  if (!rawPrayer) return {};
  if (rawPrayer.default) return rawPrayer.default;
  return rawPrayer;
}

function getWuduDefaultData(rawWudu) {
  if (!rawWudu) return {};
  if (rawWudu.default) return rawWudu.default;
  return rawWudu;
}

function ensureWuduTopic(db) {
  if (!db.journeyVideos) db.journeyVideos = {};
  const wudu = db.journeyVideos.wudu;
  if (!wudu) {
    db.journeyVideos.wudu = {
      default: {
        simple: { url: 'https://www.youtube.com/watch?v=VOI6TZxEuIw', approved: true },
        advanced: { url: 'https://www.youtube.com/watch?v=dWBQg4BKT9k', approved: true }
      }
    };
    return db.journeyVideos.wudu;
  }
  if (!wudu.default) {
    wudu.default = {};
    if (wudu.en?.url) {
      wudu.default.advanced = typeof wudu.en === 'string'
        ? { url: wudu.en, approved: true }
        : wudu.en;
    }
    for (const level of WUDU_VIDEO_LEVELS) {
      if (wudu[level]) {
        wudu.default[level] = wudu[level];
      }
    }
  }
  return wudu;
}

function getPrayerVideosForLang(langCode) {
  const raw = getJourneyVideosRaw().prayer;
  const lang = (langCode || '').toLowerCase();
  if (lang) {
    const langEntry = normalizeJourneyVideoEntry(raw?.[lang]);
    if (langEntry?.approved && langEntry.url) {
      return { type: 'single', url: langEntry.url };
    }
  }
  const defaultData = getPrayerDefaultData(raw);
  const levels = { type: 'levels' };
  for (const level of PRAYER_VIDEO_LEVELS) {
    const entry = normalizeJourneyVideoEntry(defaultData[level]);
    levels[level] = (entry?.approved && entry.url) ? entry.url : null;
  }
  return levels;
}

function getPrayerFemaleVideoForLang(langCode) {
  const raw = getJourneyVideosRaw().prayer_female;
  const lang = (langCode || '').toLowerCase();
  if (lang) {
    const langEntry = normalizeJourneyVideoEntry(raw?.[lang]);
    if (langEntry?.approved && langEntry.url) {
      return { type: 'single', url: langEntry.url };
    }
  }
  const singleEntry = normalizeJourneyVideoEntry(raw?.default?.single);
  if (singleEntry?.approved && singleEntry.url) {
    return { type: 'single', url: singleEntry.url };
  }
  return { type: 'single', url: null };
}

function getWuduVideosForLang(langCode) {
  const raw = getJourneyVideosRaw().wudu;
  const lang = (langCode || '').toLowerCase();
  if (lang) {
    const langEntry = normalizeJourneyVideoEntry(raw?.[lang]);
    if (langEntry?.approved && langEntry.url) {
      return { type: 'single', url: langEntry.url };
    }
  }
  const defaultData = getWuduDefaultData(raw);
  const levels = { type: 'levels' };
  for (const level of WUDU_VIDEO_LEVELS) {
    const entry = normalizeJourneyVideoEntry(defaultData[level]);
    levels[level] = (entry?.approved && entry.url) ? entry.url : null;
  }
  return levels;
}

function getPrayerLevelVideo(level) {
  const videos = getPrayerVideosForLang(null);
  if (videos.type !== 'levels') return null;
  return videos[level] || null;
}

function getPrayerReadingTranslation(id, langCode) {
  const db = load();
  return db.prayerReadingsTranslations?.[id]?.[langCode] || null;
}

function setPrayerReadingTranslation(id, langCode, text) {
  const db = load();
  if (!db.prayerReadingsTranslations) db.prayerReadingsTranslations = {};
  if (!db.prayerReadingsTranslations[id]) db.prayerReadingsTranslations[id] = {};
  db.prayerReadingsTranslations[id][langCode] = text;
  saveDB(db);
  return db.prayerReadingsTranslations[id][langCode];
}

module.exports = {
  getUser, saveUser, allUsers, usersByRole,
  getMosque, saveMosque, allMosques, getAllMosques, firstMosque, deleteMosque, setMosqueActive,
  addAnnouncement, getAnnouncements,
  addLesson, getLessons, getLessonsByAuthor,
  addQuestion, allQuestions, pendingQuestions, answerQuestion, getQuestionsByAuthor,
  addSheikh, allSheikhs, deleteSheikh, getSheikh,
  addHelpRequest, allHelpRequests, getPendingHelpRequests, updateHelpRequest,
  claimHelpRequest, completeHelpRequest, getBroadcastingHelpRequests,
  setDonationIBAN, getDonationIBAN, setDonationPayPal, getDonationPayPal, getAllDonations,
  addSecretQuestion, allSecretQuestions, getPendingSecretQuestions, getSecretQuestion, answerSecretQuestion,
  addQuranyCircle, allQuranyCircles, getQuranyCircle, deleteQuranyCircle, getCirclesByAuthor, addParticipantToCircle,
  addSermon, allSermons, getSermonsByAuthor, deleteSermon,
  addSheikhInboxMessage, getSheikhInbox, allSheikhInbox,
  isDeveloper,
  addScholarApplication,
  getPendingScholarApplications,
  getPendingMosques,
  getMosqueRequest,
  approveScholarApplication,
  rejectScholarApplication,
  addWarning,
  respondToWarning,
  saveAIResponse,
  getPendingAIResponses,
  getSensitiveAIResponses,
  correctAIResponse,
  approveAIResponse,
  getQaCacheEntry,
  setQaCacheEntry,
  touchQaCacheEntry,
  clearQaCache,
  getQuranPageCache,
  setQuranPageCache,
  getMushafJuzPages,
  setMushafJuzPages,
  addModerator,
  removeModerator,
  getModerators,
  isModerator,
  getAllScholars,
  getMosqueRoles, setMosqueRole, setMosqueRoles, removeMosqueRole, getUserMosqueRole,
  getMosquesByCity, getMosquesByCountry, getNearbyMosques,
  createCampaign, getCampaign, getMosqueCampaigns, getActiveCampaigns,
  addManualAmount, approveCampaign, closeCampaign,
  createEvent, getMosqueEvents, updateEventStatus,
  createComplaint, getMosqueComplaints, replyComplaint,
  createLogisticsReport, getMosqueLogistics, resolveLogistics,
  sendPlatformMessage, getPlatformMessages, replyPlatformMessage,
  updateMosqueHealth, getMosqueHealth, checkInactiveMosques,
  saveInviteCode, getInviteCode, markInviteUsed,
  getOrCreateWorshipperInviteCode, getMosqueWorshippers, kickWorshipperFromMosque,
  getOrCreateModeratorDevInviteCode,
  saveModeratorApplication, getModeratorApplication, updateModeratorApplication,
  getPendingModeratorApplications, getRegionalModeratorsByCountry,
  getApprovedRegionalModerators, getMosquesApprovedByModerators, getMosquesApprovedByDeveloper,
  revokeRegionalModerator,
  createRecitationSheikhRequest, getRecitationSheikhRequest, updateRecitationSheikhRequest,
  createRecitationSession, getRecitationSession, updateRecitationSession, findRecitationSessionBy,
  getPendingRecitationSheikhRequest,
  incrementMainMenuUsage,
  getMainMenuUsage,
  resetMainMenuUsage,
  getJourneyVideosRaw,
  getJourneyVideo,
  getJourneyVideoEntry,
  getPrayerLevelVideo,
  getPrayerVideosForLang,
  getPrayerFemaleVideoForLang,
  getWuduVideosForLang,
  getPrayerReadingTranslation,
  setPrayerReadingTranslation,
  setJourneyVideo,
  approveJourneyVideo,
  get, set
};

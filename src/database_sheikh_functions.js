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

function addParticipantToCircle(circleId, userId, userName) {
  const db = load();
  const circle = db.quranyCircles.find(c => c.id === circleId);
  if (!circle) return null;
  
  circle.participants.push({
    userId,
    userName,
    joinedAt: new Date().toISOString()
  });
  save(db);
  return circle;
}

function getCirclesByAuthor(authorId) {
  return load().quranyCircles.filter(c => c.createdBy === authorId);
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

// ── دوال إضافية للشيخ ───────────────────────────

function getLessonsByAuthor(authorId) {
  return load().lessons.filter(l => l.addedBy === authorId);
}

function getQuestionsByAuthor(authorId) {
  return load().questions.filter(q => q.askedBy === authorId);
}

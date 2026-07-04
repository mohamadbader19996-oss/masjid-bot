process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const db = require('./src/database');
const { ROLES } = require('./src/keyboards');
const service = require('./src/services/recitationSheikhService');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const IDS = {
  mosqueSheikh: 910001,
  independentSheikh: 910002,
  student: 910003,
  developer: 910004,
  mosqueId: 'mosque_rec_test_9100'
};

function createMockTelegram() {
  const sent = [];
  return {
    sent,
    async sendMessage(chatId, text, extra) {
      sent.push({ type: 'message', chatId: String(chatId), text, extra });
    },
    async sendVoice(chatId, fileId, extra) {
      sent.push({ type: 'voice', chatId: String(chatId), fileId, extra });
    }
  };
}

function setupTestUsers() {
  db.saveMosque(IDS.mosqueId, {
    name: 'مسجد اختبار التسميع',
    city: 'Test',
    active: true,
    verified: true
  });

  db.saveUser(IDS.mosqueSheikh, {
    id: IDS.mosqueSheikh,
    firstName: 'شيخ المسجد',
    role: ROLES.SHEIKH,
    mosqueId: IDS.mosqueId
  });

  db.saveUser(IDS.independentSheikh, {
    id: IDS.independentSheikh,
    firstName: 'شيخ مستقل',
    role: ROLES.SHEIKH
  });

  db.saveUser(IDS.student, {
    id: IDS.student,
    firstName: 'طالب',
    role: ROLES.WORSHIPPER
  });

  db.saveUser(IDS.developer, {
    id: IDS.developer,
    firstName: 'مطور',
    role: ROLES.DEVELOPER
  });
}

function cleanupTestData() {
  const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  [IDS.mosqueSheikh, IDS.independentSheikh, IDS.student, IDS.developer].forEach((id) => {
    delete raw.users[String(id)];
  });
  delete raw.mosques[IDS.mosqueId];
  if (raw.recitation_sheikh_requests) {
    Object.keys(raw.recitation_sheikh_requests).forEach((k) => {
      if (raw.recitation_sheikh_requests[k].sheikhId === String(IDS.independentSheikh)) {
        delete raw.recitation_sheikh_requests[k];
      }
    });
  }
  if (raw.recitation_sessions) {
    Object.keys(raw.recitation_sessions).forEach((k) => {
      const s = raw.recitation_sessions[k];
      if ([String(IDS.student), String(IDS.mosqueSheikh)].includes(s.studentId) ||
          [String(IDS.student), String(IDS.mosqueSheikh)].includes(s.sheikhId)) {
        delete raw.recitation_sessions[k];
      }
    });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(raw, null, 2));
}

function printEvents(title, events) {
  console.log(`\n=== ${title} ===`);
  events.forEach((e, i) => {
    console.log(`${i + 1}. [${e.type}]`, JSON.stringify({ ...e, type: undefined, at: undefined }));
  });
}

async function scenarioA() {
  const events = [];
  const telegram = createMockTelegram();
  setupTestUsers();

  const sheikhBefore = service.getSheikhRecitationProfile(IDS.mosqueSheikh);
  service.logEvent(events, 'check_before', {
    available: sheikhBefore.availableForRecitation,
    hasMosque: sheikhBefore.hasApprovedMosque
  });

  await service.activateRecitationForSheikh(IDS.mosqueSheikh, events);
  const sheikhAfter = service.getSheikhRecitationProfile(IDS.mosqueSheikh);

  if (!sheikhAfter.availableForRecitation) throw new Error('Scenario A: should be available immediately');
  if (!sheikhAfter.hasApprovedMosque) throw new Error('Scenario A: mosque link missing');

  printEvents('سيناريو (أ): شيخ تابع لمسجد — تفعيل مباشر', events);
  return events;
}

async function scenarioB() {
  const events = [];
  const telegram = createMockTelegram();
  setupTestUsers();

  const before = service.getSheikhRecitationProfile(IDS.independentSheikh);
  service.logEvent(events, 'check_before', { available: before.availableForRecitation });

  const request = await service.requestRecitationActivation(
    IDS.independentSheikh,
    db.getUser(IDS.independentSheikh),
    telegram,
    events
  );

  const mid = service.getSheikhRecitationProfile(IDS.independentSheikh);
  if (mid.availableForRecitation) throw new Error('Scenario B: should stay false before approval');

  await service.approveRecitationRequest(request.id, telegram, events);
  const after = service.getSheikhRecitationProfile(IDS.independentSheikh);
  if (!after.availableForRecitation) throw new Error('Scenario B: should be true after approval');

  printEvents('سيناريو (ب): شيخ مستقل — طلب → قبول مطوّر', events);
  console.log('Telegram mock messages:', telegram.sent.length);
  return events;
}

async function scenarioC() {
  const events = [];
  const telegram = createMockTelegram();
  setupTestUsers();
  await service.activateRecitationForSheikh(IDS.mosqueSheikh, events);

  const available = service.getAvailableRecitationSheikhs();
  const matched = service.pickRecitationSheikh(available);
  service.logEvent(events, 'student_request', {
    studentId: IDS.student,
    matchedSheikhId: matched.id,
    pageNumber: 1
  });

  const session = db.createRecitationSession({
    studentId: IDS.student,
    sheikhId: matched.id,
    pageNumber: 1
  });
  service.logEvent(events, 'session_created', {
    sessionId: session.id,
    status: session.status
  });

  await service.relayStudentVoiceToSheikh(
    session,
    db.getUser(IDS.student),
    'mock_voice_file_id_page1',
    telegram,
    events
  );

  const active = db.getRecitationSession(session.id);
  if (active.status !== 'with_sheikh') throw new Error('Scenario C: status should be with_sheikh');

  await service.relaySheikhReplyToStudent(
    active,
    'text',
    'ممتاز، راجع إخراج الحروف في «الرحمن».',
    telegram,
    events
  );

  await service.completeRecitationSession(session.id, telegram, events);
  const done = db.getRecitationSession(session.id);
  if (done.status !== 'completed') throw new Error('Scenario C: session should be completed');

  printEvents('سيناريو (ج): طالب → شيخ → ترحيل صوت → رد → إغلاق', events);
  console.log('Telegram mock log:');
  telegram.sent.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.type} → ${s.chatId}`, s.text || s.fileId || s.extra?.caption || '');
  });
  return events;
}

async function main() {
  const backup = fs.readFileSync(DB_FILE, 'utf8');
  try {
    await scenarioA();
    await scenarioB();
    await scenarioC();
    console.log('\nAll recitation-with-sheikh flow tests passed.');
  } finally {
    cleanupTestData();
    fs.writeFileSync(DB_FILE, backup);
  }
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

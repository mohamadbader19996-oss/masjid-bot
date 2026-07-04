process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const dbMain = require('./src/database');
const db = require('./src/database');
const { ROLES } = require('./src/keyboards');
const { loadDB, saveDB } = require('./src/utils/db');
const service = require('./src/services/recitationSheikhService');
const {
  handleRecitationVolunteerSubmit,
  handleRecVolDevApprove,
  promoteRecitationMember
} = require('./src/handlers/recitationVolunteers');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

const IDS = {
  independentVolunteer: 940003,
  developer: 940004,
  quranTeacher: 940005,
  promoteTarget: 940006,
  provider: 940101,
  student: 940102,
  mosqueId: 'mosque_audit_9400'
};

function step(results, scenario, name, ok, detail = '') {
  results.push({ scenario, step: name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} [${scenario}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function createMockTelegram(log) {
  return {
    log,
    async sendMessage(chatId, text, extra) {
      log.push({ type: 'message', chatId: String(chatId), text, buttons: extra?.reply_markup });
    },
    async sendVoice(chatId, fileId, extra) {
      log.push({ type: 'voice', chatId: String(chatId), fileId, extra });
    }
  };
}

function createMockCtx(fromId, telegram) {
  return {
    from: { id: fromId, first_name: 'User' },
    telegram,
    session: {},
    async reply() {},
    async editMessageText() {},
    async answerCbQuery() {}
  };
}

function setupAuditDb() {
  const raw = loadDB();
  raw.mosques = raw.mosques || {};
  raw.mosques[IDS.mosqueId] = {
    id: IDS.mosqueId,
    name: 'مسجد التدقيق',
    adminId: String(IDS.developer),
    active: true
  };
  raw.mosque_roles = raw.mosque_roles || {};
  raw.mosque_roles[IDS.mosqueId] = {
    [IDS.quranTeacher]: { role: 'quran_teacher', name: 'شيخ قرآن' },
    [IDS.promoteTarget]: { role: 'worshipper', name: 'عضو' }
  };
  raw.users = raw.users || {};
  raw.users[IDS.independentVolunteer] = { id: IDS.independentVolunteer, firstName: 'مستقل', role: ROLES.WORSHIPPER };
  raw.users[IDS.developer] = { id: IDS.developer, firstName: 'مطور', role: ROLES.DEVELOPER };
  raw.users[IDS.quranTeacher] = { id: IDS.quranTeacher, firstName: 'شيخ قرآن', role: ROLES.SHEIKH };
  raw.users[IDS.promoteTarget] = { id: IDS.promoteTarget, firstName: 'عضو', role: ROLES.WORSHIPPER };
  raw.users[IDS.provider] = { id: IDS.provider, firstName: 'مُسمّع', role: ROLES.WORSHIPPER, availableForRecitation: true, recitationServiceEnabled: true, recitationContactMethod: 'bot' };
  raw.users[IDS.student] = { id: IDS.student, firstName: 'طالب', role: ROLES.WORSHIPPER };
  raw.recitation_volunteers = {};
  raw.recitation_volunteer_reg = {};
  raw.recitation_sessions = {};
  saveDB(raw);
  dbMain.saveUser(IDS.developer, raw.users[IDS.developer]);
  dbMain.saveUser(IDS.provider, raw.users[IDS.provider]);
}

async function scenarioA_IndependentDevApprove(results) {
  const SC = 'أ';
  const telegram = createMockTelegram([]);
  const dbRaw = loadDB();
  dbRaw.recitation_volunteer_reg[IDS.independentVolunteer] = { contactType: 'bot_only', contactValue: null };
  saveDB(dbRaw);

  await handleRecitationVolunteerSubmit(createMockCtx(IDS.independentVolunteer, telegram));
  const volPending = loadDB().recitation_volunteers[IDS.independentVolunteer];
  step(results, SC, 'حفظ الطلب في recitation_volunteers', Boolean(volPending), `status=${volPending?.status}`);
  step(results, SC, 'mosqueId = null (مستقل)', volPending?.mosqueId == null);
  step(results, SC, 'إشعار المطوّr بالأزرار', telegram.log.some((l) =>
    l.chatId === String(IDS.developer) &&
    l.buttons?.inline_keyboard?.[0]?.some((b) => b.callback_data?.includes('rec_dev_vol_approve'))
  ));

  const beforeUser = dbMain.getUser(IDS.independentVolunteer);
  step(results, SC, 'availableForRecitation=false قبل القبول', !beforeUser?.availableForRecitation);

  await handleRecVolDevApprove(createMockCtx(IDS.developer, telegram), String(IDS.independentVolunteer));
  const volApproved = loadDB().recitation_volunteers[IDS.independentVolunteer];
  const afterUser = dbMain.getUser(IDS.independentVolunteer);
  step(results, SC, 'status=approved', volApproved?.status === 'approved');
  step(results, SC, 'active=true', volApproved?.active === true);
  step(results, SC, 'availableForRecitation=true بعد القبول', afterUser?.availableForRecitation === true);
  step(results, SC, 'recitationServiceEnabled=true', afterUser?.recitationServiceEnabled === true);
  step(results, SC, 'رسالة تأكيد للمتطوع', telegram.log.some((l) =>
    l.chatId === String(IDS.independentVolunteer) && l.text?.includes('تم قبول')
  ));
}

async function scenarioJ_QuranTeacherPromote(results) {
  const SC = 'ج';
  const telegram = createMockTelegram([]);
  const before = dbMain.getUser(IDS.promoteTarget);
  step(results, SC, 'غير مفعّل قبل الترقية', !before?.recitationServiceEnabled);

  await promoteRecitationMember(
    createMockCtx(IDS.quranTeacher, telegram),
    String(IDS.promoteTarget),
    IDS.quranTeacher
  );

  const vol = loadDB().recitation_volunteers[IDS.promoteTarget];
  const after = dbMain.getUser(IDS.promoteTarget);
  step(results, SC, 'سجل recitation_volunteers.active=true فوراً', vol?.active === true);
  step(results, SC, 'status=approved بدون انتظار', vol?.status === 'approved');
  step(results, SC, 'promotedBy=شيخ القرآن', String(vol?.promotedBy) === String(IDS.quranTeacher));
  step(results, SC, 'availableForRecitation=true مباشرة', after?.availableForRecitation === true);
  step(results, SC, 'recitationServiceEnabled=true', after?.recitationServiceEnabled === true);
  step(results, SC, 'رسالة للعضو المُرقّى', telegram.log.some((l) =>
    l.chatId === String(IDS.promoteTarget) && l.text?.includes('رشّحك')
  ));
}

async function scenarioD_FullSession(results) {
  const SC = 'د';
  const telegram = createMockTelegram([]);
  const events = [];

  const available = service.getAvailableRecitationSheikhs().filter((u) => String(u.id) === String(IDS.provider));
  const matched = service.pickRecitationSheikh(available);
  step(results, SC, 'مطابقة مُسمّع متاح', matched?.id === IDS.provider, `matched=${matched?.id}`);

  const session = db.createRecitationSession({
    studentId: IDS.student,
    sheikhId: IDS.provider,
    pageNumber: 1
  });
  step(results, SC, 'إنشاء جلسة status=waiting_voice', session?.status === 'waiting_voice', session?.id);

  await service.relayStudentVoiceToSheikh(
    session,
    dbMain.getUser(IDS.student),
    'mock_voice_audit',
    telegram,
    events
  );
  const afterVoice = db.getRecitationSession(session.id);
  step(results, SC, 'ترحيل صوت الطالب للشيخ', telegram.log.some((l) =>
    l.type === 'voice' && l.chatId === String(IDS.provider)
  ));
  step(results, SC, 'status=with_sheikh بعد الصوت', afterVoice?.status === 'with_sheikh');
  step(results, SC, 'زر انتهيت للشيخ', telegram.log.some((l) =>
    l.extra?.reply_markup?.inline_keyboard?.[0]?.some((b) => b.callback_data?.includes('rec_session_done'))
  ));

  await service.relaySheikhReplyToStudent(
    afterVoice,
    'text',
    'أحسنت، راجع المدّ.',
    telegram,
    events
  );
  step(results, SC, 'ترحيل رد الشيkh للطالب', telegram.log.some((l) =>
    l.chatId === String(IDS.student) && l.text?.includes('رد الشيخ')
  ));

  await service.completeRecitationSession(session.id, telegram, events);
  const done = db.getRecitationSession(session.id);
  step(results, SC, 'status=completed', done?.status === 'completed');
  step(results, SC, 'رسالة ختامية للطالب', telegram.log.some((l) =>
    l.chatId === String(IDS.student) && l.text?.includes('انتهى الشيخ')
  ));
}

async function main() {
  const backup = fs.readFileSync(DB_FILE, 'utf8');
  const results = [];
  try {
    setupAuditDb();
    console.log('\n========== test_recitation_system_audit.js ==========\n');
    await scenarioD_FullSession(results);
    console.log('');
    await scenarioA_IndependentDevApprove(results);
    console.log('');
    await scenarioJ_QuranTeacherPromote(results);

    const failed = results.filter((r) => !r.ok);
    console.log('\n========== ملخص ==========');
    console.log(`إجمالي الخطوات: ${results.length}`);
    console.log(`✅ ناجحة: ${results.filter((r) => r.ok).length}`);
    console.log(`❌ فاشلة: ${failed.length}`);
    if (failed.length) {
      failed.forEach((f) => console.log(`  - [${f.scenario}] ${f.step}`));
      process.exit(1);
    }
    console.log('\nAll audit scenarios passed.');
  } finally {
    fs.writeFileSync(DB_FILE, backup);
  }
}

main().catch((err) => {
  console.error('AUDIT FAILED:', err.message);
  process.exit(1);
});

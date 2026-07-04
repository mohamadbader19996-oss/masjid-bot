process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const dbMain = require('./src/database');
const { ROLES } = require('./src/keyboards');
const { loadDB, saveDB } = require('./src/utils/db');
const {
  handleRecitationVolunteerSubmit,
  handleRecVolMaApprove,
  handleRecVolDevApprove,
  promoteRecitationMember,
  activateRecitationUser
} = require('./src/handlers/recitationVolunteers');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const IDS = {
  mosqueVolunteer: 920001,
  mosqueAdmin: 920002,
  independentVolunteer: 920003,
  developer: 920004,
  quranTeacher: 920005,
  promoteTarget: 920006,
  mosqueId: 'mosque_rec_vol_9200'
};

function createMockCtx(fromId, telegram) {
  return {
    from: { id: fromId, first_name: 'User' },
    telegram,
    session: {},
    async reply(text) { telegram.log.push({ type: 'reply', to: fromId, text }); },
    async editMessageText(text) { telegram.log.push({ type: 'edit', to: fromId, text }); },
    async answerCbQuery() {}
  };
}

function createMockTelegram() {
  const log = [];
  return {
    log,
    async sendMessage(chatId, text, extra) {
      log.push({ type: 'message', chatId: String(chatId), text, buttons: extra?.reply_markup });
    }
  };
}

function setupBase() {
  const db = loadDB();
  db.mosques = db.mosques || {};
  db.mosques[IDS.mosqueId] = {
    id: IDS.mosqueId,
    name: 'مسجد اختبار التطوع',
    active: true
  };
  db.mosque_roles = db.mosque_roles || {};
  db.mosque_roles[IDS.mosqueId] = {
    [IDS.mosqueAdmin]: { role: 'admin', name: 'مدير' },
    [IDS.mosqueVolunteer]: { role: 'worshipper', name: 'متطوع مسجد' },
    [IDS.quranTeacher]: { role: 'quran_teacher', name: 'شيخ قرآن' },
    [IDS.promoteTarget]: { role: 'worshipper', name: 'عضو للترقية' }
  };
  db.users = db.users || {};
  db.users[IDS.mosqueVolunteer] = { id: IDS.mosqueVolunteer, firstName: 'متطوع مسجد', role: ROLES.WORSHIPPER };
  db.users[IDS.mosqueAdmin] = { id: IDS.mosqueAdmin, firstName: 'مدير', role: ROLES.ADMIN, mosqueId: IDS.mosqueId };
  db.users[IDS.independentVolunteer] = { id: IDS.independentVolunteer, firstName: 'مستقل', role: ROLES.WORSHIPPER };
  db.users[IDS.developer] = { id: IDS.developer, firstName: 'مطور', role: ROLES.DEVELOPER };
  db.users[IDS.quranTeacher] = { id: IDS.quranTeacher, firstName: 'شيخ قرآن', role: ROLES.SHEIKH };
  db.users[IDS.promoteTarget] = { id: IDS.promoteTarget, firstName: 'عضو', role: ROLES.WORSHIPPER };
  db.recitation_volunteers = {};
  db.recitation_volunteer_reg = {};
  saveDB(db);

  dbMain.saveUser(IDS.developer, { id: IDS.developer, firstName: 'مطور', role: ROLES.DEVELOPER });
}

function cleanup(backup) {
  fs.writeFileSync(DB_FILE, backup);
}

async function scenarioMosqueVolunteer(events) {
  const telegram = createMockTelegram();
  const db = loadDB();
  db.recitation_volunteer_reg[IDS.mosqueVolunteer] = {
    contactType: 'bot_only',
    contactValue: null
  };
  saveDB(db);

  const ctx = createMockCtx(IDS.mosqueVolunteer, telegram);
  await handleRecitationVolunteerSubmit(ctx);
  events.push({ step: 'submitted_mosque_volunteer', notifiedAdmin: telegram.log.some((l) => l.chatId === String(IDS.mosqueAdmin)) });

  const volBefore = loadDB().recitation_volunteers[IDS.mosqueVolunteer];
  if (volBefore.active) throw new Error('mosque vol should not be active before approval');
  if (!volBefore.mosqueId) throw new Error('mosque vol should have mosqueId');

  const adminCtx = createMockCtx(IDS.mosqueAdmin, telegram);
  await handleRecVolMaApprove(adminCtx, String(IDS.mosqueVolunteer));
  const afterAdmin = loadDB().recitation_volunteers[IDS.mosqueVolunteer];
  events.push({ step: 'admin_approved', adminApproved: afterAdmin.adminApproved, stillInactive: !afterAdmin.active });

  const devCtx = createMockCtx(IDS.developer, telegram);
  await handleRecVolDevApprove(devCtx, String(IDS.mosqueVolunteer));
  const user = dbMain.getUser(IDS.mosqueVolunteer);
  events.push({
    step: 'dev_approved_mosque_path',
    active: loadDB().recitation_volunteers[IDS.mosqueVolunteer].active,
    availableForRecitation: user.availableForRecitation,
    recitationServiceEnabled: user.recitationServiceEnabled
  });
}

async function scenarioIndependentVolunteer(events) {
  const telegram = createMockTelegram();
  const db = loadDB();
  db.recitation_volunteer_reg[IDS.independentVolunteer] = {
    contactType: 'bot_only',
    contactValue: null
  };
  saveDB(db);

  const ctx = createMockCtx(IDS.independentVolunteer, telegram);
  await handleRecitationVolunteerSubmit(ctx);
  events.push({
    step: 'submitted_independent',
    notifiedDev: telegram.log.some((l) => l.chatId === String(IDS.developer))
  });

  const before = loadDB().recitation_volunteers[IDS.independentVolunteer];
  if (before.mosqueId) throw new Error('independent should have no mosqueId');
  if (before.active) throw new Error('should wait for dev approval');

  const devCtx = createMockCtx(IDS.developer, telegram);
  await handleRecVolDevApprove(devCtx, String(IDS.independentVolunteer));
  const user = dbMain.getUser(IDS.independentVolunteer);
  events.push({
    step: 'dev_approved_independent',
    availableForRecitation: user.availableForRecitation,
    recitationServiceEnabled: user.recitationServiceEnabled
  });
}

async function scenarioQuranTeacherPromote(events) {
  const telegram = createMockTelegram();
  const teacherCtx = createMockCtx(IDS.quranTeacher, telegram);
  await promoteRecitationMember(teacherCtx, String(IDS.promoteTarget), IDS.quranTeacher);
  const user = dbMain.getUser(IDS.promoteTarget);
  const vol = loadDB().recitation_volunteers[IDS.promoteTarget];
  events.push({
    step: 'quran_teacher_promote',
    immediateActive: vol.active,
    devApproved: vol.devApproved,
    availableForRecitation: user.availableForRecitation,
    noWaiting: user.recitationServiceEnabled === true
  });
  if (!user.availableForRecitation) throw new Error('promoted member should be available immediately');
}

function printEvents(title, events) {
  console.log(`\n=== ${title} ===`);
  events.forEach((e, i) => console.log(`${i + 1}.`, JSON.stringify(e)));
}

async function main() {
  const backup = fs.readFileSync(DB_FILE, 'utf8');
  try {
    setupBase();
    const a = [];
    const b = [];
    const c = [];
    await scenarioMosqueVolunteer(a);
    await scenarioIndependentVolunteer(b);
    await scenarioQuranTeacherPromote(c);
    printEvents('(أ) متطوع تابع لمسجد — admin ثم dev', a);
    printEvents('(ب) متطوع مستقل — dev مباشرة', b);
    printEvents('(ج) ترقية شيخ القرآن — فوري', c);
    console.log('\nAll recitation volunteer flow tests passed.');
  } finally {
    cleanup(backup);
  }
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

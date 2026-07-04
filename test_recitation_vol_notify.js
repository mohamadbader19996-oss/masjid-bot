process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const dbMain = require('./src/database');
const { ROLES } = require('./src/keyboards');
const { loadDB, saveDB } = require('./src/utils/db');
const {
  handleRecitationVolunteerSubmit,
  handleRecVolMaApprove,
  notifyMosqueAdmins
} = require('./src/handlers/recitationVolunteers');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const IDS = {
  volunteer: 930001,
  mosqueAdmin: 930002,
  mosqueId: 'mosque_notify_test_9300'
};

function createMockTelegram(log) {
  return {
    log,
    async sendMessage(chatId, text, extra) {
      const entry = {
        type: 'notify',
        chatId: String(chatId),
        text,
        buttons: extra?.reply_markup?.inline_keyboard
      };
      log.push(entry);
      console.log('[NOTIFY]', JSON.stringify(entry, null, 2));
    }
  };
}

function setup() {
  const db = loadDB();
  db.mosques[IDS.mosqueId] = {
    id: IDS.mosqueId,
    name: 'مسجد الإشعار',
    adminId: String(IDS.mosqueAdmin),
    active: true
  };
  db.users[IDS.volunteer] = {
    id: IDS.volunteer,
    firstName: 'متطوع تسميع',
    role: ROLES.WORSHIPPER,
    mosqueId: IDS.mosqueId
  };
  db.users[IDS.mosqueAdmin] = {
    id: IDS.mosqueAdmin,
    firstName: 'مدير',
    role: ROLES.ADMIN,
    mosqueId: IDS.mosqueId
  };
  db.recitation_volunteers = {};
  db.recitation_volunteer_reg = {};
  saveDB(db);
  dbMain.saveUser(IDS.volunteer, db.users[IDS.volunteer]);
  dbMain.saveUser(IDS.mosqueAdmin, db.users[IDS.mosqueAdmin]);
}

async function main() {
  const backup = fs.readFileSync(DB_FILE, 'utf8');
  const notifyLog = [];
  try {
    setup();

    const db = loadDB();
    db.recitation_volunteer_reg[IDS.volunteer] = { contactType: 'bot_only', contactValue: null };
    saveDB(db);

    const telegram = createMockTelegram(notifyLog);
    const ctx = {
      from: { id: IDS.volunteer, first_name: 'متطوع' },
      telegram,
      session: {},
      async reply() {},
      async editMessageText() {}
    };

    console.log('\n=== 1) تسجيل طلب جديد (تابع لمسجد) ===');
    await handleRecitationVolunteerSubmit(ctx);

    const vol = loadDB().recitation_volunteers[IDS.volunteer];
    if (vol.status !== 'pending') throw new Error('status should be pending');
    if (!vol.mosqueId) throw new Error('should have mosqueId');

    const adminNotify = notifyLog.find((n) => n.chatId === String(IDS.mosqueAdmin));
    if (!adminNotify) throw new Error('mosque admin did not receive notification');
    const approveBtn = adminNotify.buttons?.[0]?.find((b) => b.text === '✅ قبول');
    const rejectBtn = adminNotify.buttons?.[0]?.find((b) => b.text === '❌ رفض');
    if (!approveBtn?.callback_data?.includes(String(IDS.volunteer))) {
      throw new Error('approve button missing volunteer id');
    }
    if (!rejectBtn) throw new Error('reject button missing');
    console.log('✅ Notification with buttons reached mosque admin');

    console.log('\n=== 2) محاكاة ضغط [✅ قبول] ===');
    const adminCtx = {
      from: { id: IDS.mosqueAdmin },
      telegram,
      async reply() {},
      async editMessageText() {},
      async answerCbQuery() {}
    };
    await handleRecVolMaApprove(adminCtx, String(IDS.volunteer));

    const user = dbMain.getUser(IDS.volunteer);
    const volAfter = loadDB().recitation_volunteers[IDS.volunteer];
    console.log('status:', volAfter.status);
    console.log('availableForRecitation:', user.availableForRecitation);
    console.log('recitationServiceEnabled:', user.recitationServiceEnabled);

    if (volAfter.status !== 'approved') throw new Error('status should be approved');
    if (!user.availableForRecitation) throw new Error('availableForRecitation should be true');
    if (!user.recitationServiceEnabled) throw new Error('recitationServiceEnabled should be true');

    console.log('\nAll recitation volunteer notify tests passed.');
  } finally {
    fs.writeFileSync(DB_FILE, backup);
  }
}

main().catch((err) => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});

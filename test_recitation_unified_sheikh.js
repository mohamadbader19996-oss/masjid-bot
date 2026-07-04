process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const dbMain = require('./src/database');
const { ROLES } = require('./src/keyboards');
const { loadDB, saveDB } = require('./src/utils/db');
const service = require('./src/services/recitationSheikhService');
const { handleRecitationEnable, startRecitationWithSheikhPage } = require('./src/handlers/recitationSheikh');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

const IDS = {
  mosqueSheikh: 940101,
  independentSheikh: 940102,
  mosqueAdmin: 940103,
  volunteer: 940104,
  student: 940105,
  developer: 940106,
  mosqueId: 'mosque_unified_sheikh_9401'
};

let oldRecitationNotifyCount = 0;
const origOldNotify = service.notifyDevelopersRecitationRequest;
service.notifyDevelopersRecitationRequest = async (...args) => {
  oldRecitationNotifyCount++;
  return origOldNotify(...args);
};

function createMockTelegram(log) {
  return {
    log,
    async sendMessage(chatId, text, extra) {
      log.push({
        chatId: String(chatId),
        text,
        buttons: extra?.reply_markup?.inline_keyboard
      });
    }
  };
}

function setupBase() {
  const db = loadDB();
  db.mosques[IDS.mosqueId] = {
    id: IDS.mosqueId,
    name: 'مسجد توحيد التسميع',
    adminId: String(IDS.mosqueAdmin),
    active: true
  };
  db.users[IDS.mosqueSheikh] = {
    id: IDS.mosqueSheikh,
    firstName: 'شيخ المسجد',
    role: ROLES.SHEIKH,
    mosqueId: IDS.mosqueId
  };
  db.users[IDS.independentSheikh] = {
    id: IDS.independentSheikh,
    firstName: 'شيخ مستقل',
    role: ROLES.SHEIKH
  };
  db.users[IDS.mosqueAdmin] = {
    id: IDS.mosqueAdmin,
    firstName: 'مدير',
    role: ROLES.ADMIN,
    mosqueId: IDS.mosqueId
  };
  db.users[IDS.volunteer] = {
    id: IDS.volunteer,
    firstName: 'متطوع',
    role: ROLES.WORSHIPPER,
    availableForRecitation: true,
    recitationServiceEnabled: true
  };
  db.users[IDS.developer] = {
    id: IDS.developer,
    firstName: 'مطور',
    role: ROLES.DEVELOPER
  };
  db.recitation_volunteers = {};
  db.recitation_volunteer_reg = {};
  db.recitation_sheikh_requests = {};
  saveDB(db);

  dbMain.saveUser(IDS.mosqueSheikh, db.users[IDS.mosqueSheikh]);
  dbMain.saveUser(IDS.independentSheikh, db.users[IDS.independentSheikh]);
  dbMain.saveUser(IDS.mosqueAdmin, db.users[IDS.mosqueAdmin]);
  dbMain.saveUser(IDS.volunteer, db.users[IDS.volunteer]);
  dbMain.saveUser(IDS.developer, db.users[IDS.developer]);
}

async function test1_mosqueSheikhUsesMosqueAdminNotify() {
  oldRecitationNotifyCount = 0;
  const notifyLog = [];
  const ctx = {
    from: { id: IDS.mosqueSheikh },
    user: dbMain.getUser(IDS.mosqueSheikh),
    telegram: createMockTelegram(notifyLog),
    session: {},
    async reply() {},
    async answerCbQuery() {}
  };

  await handleRecitationEnable(ctx);

  const vol = loadDB().recitation_volunteers[String(IDS.mosqueSheikh)];
  const adminMsg = notifyLog.find((n) => n.chatId === String(IDS.mosqueAdmin));
  const devMsg = notifyLog.find((n) => n.chatId === String(IDS.developer));

  return {
    name: '1) شيخ تابع لمسجد → notifyMosqueAdmins (لا المسار القديم)',
    ok: Boolean(vol?.isRecitationSheikh)
      && vol.status === 'pending'
      && Boolean(adminMsg)
      && adminMsg.buttons?.[0]?.some((b) => b.callback_data === `rec_ma_vol_approve_${IDS.mosqueSheikh}`)
      && !devMsg
      && oldRecitationNotifyCount === 0,
    detail: {
      volStatus: vol?.status,
      isRecitationSheikh: vol?.isRecitationSheikh,
      adminNotified: Boolean(adminMsg),
      devNotified: Boolean(devMsg),
      oldNotifyCalls: oldRecitationNotifyCount
    }
  };
}

async function test2_independentSheikhUsesDevVolunteerNotify() {
  oldRecitationNotifyCount = 0;
  const notifyLog = [];
  const ctx = {
    from: { id: IDS.independentSheikh },
    user: dbMain.getUser(IDS.independentSheikh),
    telegram: createMockTelegram(notifyLog),
    session: {},
    async reply() {},
    async answerCbQuery() {}
  };

  await handleRecitationEnable(ctx);

  const vol = loadDB().recitation_volunteers[String(IDS.independentSheikh)];
  const devMsg = notifyLog.find((n) => n.chatId === String(IDS.developer));

  return {
    name: '2) شيخ مستقل → notifyDevelopersRecVolunteer (لا المسار القديم)',
    ok: Boolean(vol?.isRecitationSheikh)
      && vol.status === 'pending'
      && !vol.mosqueId
      && Boolean(devMsg)
      && devMsg.buttons?.[0]?.some((b) => b.callback_data === `rec_dev_vol_approve_${IDS.independentSheikh}`)
      && oldRecitationNotifyCount === 0,
    detail: {
      mosqueId: vol?.mosqueId,
      devNotified: Boolean(devMsg),
      oldNotifyCalls: oldRecitationNotifyCount
    }
  };
}

async function test3_providerPickLabels() {
  dbMain.saveUser(IDS.mosqueSheikh, {
    ...dbMain.getUser(IDS.mosqueSheikh),
    availableForRecitation: true,
    recitationServiceEnabled: true,
    isRecitationSheikh: true
  });
  dbMain.saveUser(IDS.volunteer, dbMain.getUser(IDS.volunteer));

  const sheikhLabel = service.formatProviderPickLabel(dbMain.getUser(IDS.mosqueSheikh));
  const volLabel = service.formatProviderPickLabel(dbMain.getUser(IDS.volunteer));

  const replies = [];
  const ctx = {
    from: { id: IDS.student },
    user: dbMain.getUser(IDS.student) || { id: IDS.student, role: ROLES.WORSHIPPER },
    session: { recitationSheikhPagePrompt: true },
    async reply(text, extra) {
      replies.push({ text, buttons: extra?.reply_markup?.inline_keyboard });
    }
  };

  for (let i = 0; i < 5; i++) {
    dbMain.saveUser(940200 + i, {
      id: 940200 + i,
      firstName: `مُسمّع${i}`,
      role: ROLES.WORSHIPPER,
      availableForRecitation: true,
      recitationServiceEnabled: true
    });
  }

  await startRecitationWithSheikhPage(ctx, '42');

  const buttonTexts = replies[0]?.buttons?.flat().map((b) => b.text) || [];
  const hasSheikhPrefix = buttonTexts.some((t) => t.startsWith('👨‍🏫 الشيخ'));
  const hasVolunteerPrefix = buttonTexts.some((t) => t.startsWith('🙋'));

  return {
    name: '3) قائمة اختيار المُسمّع: 👨‍🏫 للشيخ و 🙋 للمتطوع',
    ok: sheikhLabel === '👨‍🏫 الشيخ شيخ المسجد'
      && volLabel === '🙋 متطوع'
      && hasSheikhPrefix
      && hasVolunteerPrefix,
    detail: { sheikhLabel, volLabel, buttonTexts: buttonTexts.slice(0, 4) }
  };
}

async function main() {
  const backup = fs.readFileSync(DB_FILE, 'utf8');
  const results = [];
  try {
    setupBase();
    results.push(await test1_mosqueSheikhUsesMosqueAdminNotify());
    setupBase();
    results.push(await test2_independentSheikhUsesDevVolunteerNotify());
    setupBase();
    results.push(await test3_providerPickLabels());

    console.log('=== test_recitation_unified_sheikh ===\n');
    for (const r of results) {
      console.log(r.ok ? '✅' : '❌', r.name);
      console.log('   ', JSON.stringify(r.detail));
    }
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n=== ${failed === 0 ? 'ALL PASSED' : 'FAILURES'} === (${results.length - failed}/${results.length})`);
    process.exit(failed > 0 ? 1 : 0);
  } finally {
    fs.writeFileSync(DB_FILE, backup);
  }
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

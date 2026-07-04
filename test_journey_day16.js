const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const BACKUP = path.join(__dirname, 'data', 'db.json.journey16test.bak');
const TEST_ID = 'test_999';

const fakeRecord = {
  name: 'تجريبي',
  currentDay: 15,
  pendingDay: 16,
  journeyStatus: 'active',
  daysCompleted: []
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  if (fs.existsSync(DB_FILE)) {
    fs.copyFileSync(DB_FILE, BACKUP);
  }

  const db = fs.existsSync(DB_FILE)
    ? loadJson(DB_FILE)
    : { users: {}, mosque_roles: {}, volunteers: {}, volunteer_reg: {} };

  db.new_muslims = db.new_muslims || {};
  db.new_muslims[TEST_ID] = { userId: TEST_ID, ...fakeRecord };
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

  const ctx = {
    answerCbQuery: async () => {},
    reply: async (text) => console.log('[REPLY]', text),
    telegram: {
      sendMessage: async (chatId, text, extra) => {
        console.log('[SEND TO]', chatId, '\n[TEXT]', text, '\n[BUTTONS]', JSON.stringify(extra?.reply_markup));
      }
    }
  };

  delete require.cache[require.resolve('./src/utils/journeyReminder')];
  const { handleJourneyDayDone } = require('./src/utils/journeyReminder');

  await handleJourneyDayDone(ctx, TEST_ID);

  const updated = loadJson(DB_FILE);
  if (updated.new_muslims?.[TEST_ID]?.currentDay !== 16) {
    throw new Error('FAIL: currentDay should be 16, got ' + updated.new_muslims?.[TEST_ID]?.currentDay);
  }

  console.log('\n✅ PASS: no exceptions, currentDay=16');
}

main()
  .catch((e) => {
    console.error('\n❌ FAIL:', e.message || e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (fs.existsSync(BACKUP)) {
      fs.copyFileSync(BACKUP, DB_FILE);
      fs.unlinkSync(BACKUP);
      console.log('✅ db.json restored to original state');
    } else if (fs.existsSync(DB_FILE)) {
      const db = loadJson(DB_FILE);
      if (db.new_muslims?.[TEST_ID]) {
        delete db.new_muslims[TEST_ID];
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
        console.log('✅ removed test_999 from db.json');
      }
    }
  });

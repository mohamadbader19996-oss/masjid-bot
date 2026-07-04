process.env.ACTION_REGISTRY_SILENT = '1';

const { loadDB } = require('./src/utils/db');
const {
  resolveMosqueId,
  getMosqueAdminIds,
  getDeveloperNotifyIds,
  notifyMosqueAdmins,
  notifyDevelopersRecVolunteer
} = require('./src/handlers/recitationVolunteers');

const TEST_USER = '999888777';
const MOSQUE_ID = 'mosque_audit_9400';

function mockTelegram(log) {
  return {
    log,
    async sendMessage(chatId, text, extra) {
      log.push({
        chatId: String(chatId),
        text,
        reply_markup: extra?.reply_markup
      });
    }
  };
}

async function main() {
  const db = loadDB();
  const mosque = db.mosques[MOSQUE_ID];
  const vol = db.recitation_volunteers[TEST_USER];
  const user = db.users[TEST_USER];

  console.log('========== إعداد حساب تجريبي — مسار مسجد ==========\n');

  console.log('1) المسجد المختار');
  console.log(`   id: ${mosque?.id}`);
  console.log(`   name: ${mosque?.name}`);
  console.log(`   adminId: ${mosque?.adminId}`);
  console.log(`   active: ${mosque?.active}\n`);

  console.log('2) المستخدم التجريبي');
  console.log(JSON.stringify(user, null, 2));
  console.log(`   mosque_roles entry: ${JSON.stringify(db.mosque_roles?.[MOSQUE_ID]?.[TEST_USER] || null)}\n`);

  const resolved = resolveMosqueId(TEST_USER, db);
  console.log('3) resolveMosqueId(999888777):', resolved);
  console.log(`   → ${resolved ? 'مسار notifyMosqueAdmins' : 'مسار notifyDevelopersRecVolunteer'}\n`);

  const adminIds = getMosqueAdminIds(MOSQUE_ID, db);
  console.log('4) getMosqueAdminIds:', adminIds);
  console.log(`   يطابق adminId المسجد (${mosque.adminId}): ${adminIds.includes(String(mosque.adminId))}\n`);

  console.log('5) سجل recitation_volunteers');
  console.log(JSON.stringify(vol, null, 2));
  console.log(`   recitation_volunteer_reg[${TEST_USER}]: ${JSON.stringify(db.recitation_volunteer_reg?.[TEST_USER] ?? null)}\n`);

  const log = [];
  const ctx = { from: { id: TEST_USER }, telegram: mockTelegram(log), session: {} };
  const consoleCapture = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (...a) => { consoleCapture.push(['log', ...a].join(' ')); origLog(...a); };
  console.warn = (...a) => { consoleCapture.push(['warn', ...a].join(' ')); origWarn(...a); };
  console.error = (...a) => { consoleCapture.push(['err', ...a].join(' ')); origErr(...a); };

  let usedFn = 'notifyMosqueAdmins';
  if (resolved) {
    await notifyMosqueAdmins(ctx, resolved, TEST_USER, vol, (m) => consoleCapture.push(['notifyFn', m].join(' ')));
  } else {
    usedFn = 'notifyDevelopersRecVolunteer';
    await notifyDevelopersRecVolunteer(ctx, TEST_USER, vol, 'متطوع مستقل');
  }

  console.log = origLog;
  console.warn = origWarn;
  console.error = origErr;

  console.log('6) استدعاء الإشعار');
  console.log(`   الدالة المستخدمة: ${usedFn}`);
  console.log(`   fallback للمطوّrين: ${consoleCapture.some((l) => l.includes('fallback to developers'))}`);
  console.log(`   developer notify ids (للمقارنة): ${JSON.stringify(getDeveloperNotifyIds(db))}\n`);

  console.log('7) محاكاة sendMessage (بدون تيليغرام حقيقي)');
  if (!log.length) {
    console.log('   ❌ لم تُبنَ أي رسالة');
  } else {
    log.forEach((entry, i) => {
      console.log(`\n   --- رسالة ${i + 1} ---`);
      console.log(`   chatId (المُبلَّغ): ${entry.chatId}`);
      console.log(`   adminId متوقع: ${mosque.adminId}`);
      console.log(`   chatId صحيح: ${entry.chatId === String(mosque.adminId) ? '✅' : '❌'}`);
      console.log('   نص الرسالة:');
      console.log(entry.text.split('\n').map((l) => `     ${l}`).join('\n'));
      const row = entry.reply_markup?.inline_keyboard?.[0] || [];
      console.log('   الأزرار:');
      row.forEach((b) => {
        const okApprove = b.callback_data === `rec_ma_vol_approve_${TEST_USER}`;
        const okReject = b.callback_data === `rec_ma_vol_reject_${TEST_USER}`;
        console.log(`     [${b.text}] callback_data=${b.callback_data} ${okApprove || okReject ? '✅' : '❌'}`);
      });
    });
  }

  console.log('\n8) سطور console من notifyMosqueAdmins');
  consoleCapture
    .filter((l) => l.includes('rec_vol_notify') || l.includes('fallback'))
    .forEach((l) => console.log(`   ${l}`));

  const ok =
    resolved === MOSQUE_ID &&
    adminIds.includes(String(mosque.adminId)) &&
    usedFn === 'notifyMosqueAdmins' &&
    log.length === 1 &&
    log[0].chatId === String(mosque.adminId) &&
    log[0].reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `rec_ma_vol_approve_${TEST_USER}`;

  console.log(`\n========== النتيجة: ${ok ? '✅ المسار صحيح برمجياً' : '❌ يوجد خلل'} ==========`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

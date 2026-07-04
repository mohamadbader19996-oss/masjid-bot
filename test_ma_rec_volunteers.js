process.env.ACTION_REGISTRY_SILENT = '1';

const fs = require('fs');
const path = require('path');
const { loadDB, saveDB } = require('./src/utils/db');
const { ROLES } = require('./src/keyboards');
const {
  handleRecitationVolunteerSubmit,
  handleRecVolMaApprove
} = require('./src/handlers/recitationVolunteers');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

const IDS = {
  admin: 950001,
  volunteer: 950002,
  mosqueId: 'mosque_ma_rec_test'
};

function step(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

function mockTelegram(log) {
  return {
    log,
    async sendMessage(chatId, text, extra) {
      log.push({ chatId: String(chatId), text, extra });
    }
  };
}

function mockCtx(fromId, telegram) {
  return {
    from: { id: fromId, first_name: 'Test' },
    telegram,
    session: {},
    async reply() {},
    async editMessageText(text, extra) {
      this._lastEdit = { text, extra };
    },
    async answerCbQuery() {}
  };
}

async function runMaRecVolunteersPanel(ctx) {
  const db = require('./src/database');
  const { loadDB: ldb } = require('./src/utils/db');

  function getMosque(userId) {
    const all = db.getAllMosques();
    return Object.values(all).find((m) =>
      m.adminId === userId ||
      m.createdBy === parseInt(userId, 10) ||
      m.createdBy === userId
    ) || null;
  }

  function formatRecVolContact(vol) {
    return vol.contact?.type === 'whatsapp'
      ? `واتساب (${vol.contact.value || '—'})`
      : 'عبر البوت';
  }

  const userId = String(ctx.from.id);
  const mosque = getMosque(userId);
  if (!mosque) throw new Error('no mosque');

  const allVolunteers = Object.values(ldb().recitation_volunteers || {});
  const mosqueVolunteers = allVolunteers.filter((v) => String(v.mosqueId) === String(mosque.id));
  const pending = mosqueVolunteers.filter((v) => v.status === 'pending');
  const active = mosqueVolunteers.filter((v) => v.status === 'approved' && v.active !== false);
  const rejected = mosqueVolunteers.filter((v) => v.status === 'rejected');

  return {
    mosqueName: mosque.name,
    pending: pending.length,
    active: active.length,
    rejected: rejected.length,
    total: mosqueVolunteers.length,
    pendingNames: pending.map((v) => v.name),
    activeNames: active.map((v) => v.name),
    buttons: pending.flatMap((vol) => [
      `ma_rec_vol_approve_${vol.userId}`,
      `ma_rec_vol_reject_${vol.userId}`
    ])
  };
}

async function main() {
  const backup = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const raw = loadDB();
    raw.mosques = raw.mosques || {};
    raw.mosques[IDS.mosqueId] = {
      id: IDS.mosqueId,
      name: 'مسجد اختبار التسميع',
      adminId: String(IDS.admin),
      active: true
    };
    raw.mosque_roles = raw.mosque_roles || {};
    raw.mosque_roles[IDS.mosqueId] = {
      [IDS.volunteer]: { role: 'worshipper', name: 'متطوع تسميع' }
    };
    raw.users = raw.users || {};
    raw.users[IDS.admin] = { id: IDS.admin, firstName: 'مدير', role: ROLES.ADMIN };
    raw.users[IDS.volunteer] = {
      id: IDS.volunteer,
      firstName: 'متطوع تسميع',
      role: ROLES.WORSHIPPER,
      mosqueId: IDS.mosqueId
    };
    raw.recitation_volunteers = {};
    raw.recitation_volunteer_reg = {
      [IDS.volunteer]: { contactType: 'bot_only', contactValue: null }
    };
    saveDB(raw);

    const tg = mockTelegram([]);
    await handleRecitationVolunteerSubmit(mockCtx(IDS.volunteer, tg));

    const before = await runMaRecVolunteersPanel(mockCtx(IDS.admin, tg));
    step('لوحة فارغة → طلب معلّق', before.pending === 1, `pending=${before.pending}`);
    step('زر قبول موجود', before.buttons.some((b) => b.includes('ma_rec_vol_approve')));
    step('زر رفض موجود', before.buttons.some((b) => b.includes('ma_rec_vol_reject')));

    await handleRecVolMaApprove(mockCtx(IDS.admin, tg), String(IDS.volunteer));

    const after = await runMaRecVolunteersPanel(mockCtx(IDS.admin, tg));
    step('بعد القبول → نشط', after.active === 1, `active=${after.active}`);
    step('بعد القبول → لا معلّق', after.pending === 0);
    step('إجمالي = 1', after.total === 1);

    const user = require('./src/database').getUser(IDS.volunteer);
    step('availableForRecitation=true', user?.availableForRecitation === true);

    console.log('\nma_rec_volunteers panel test done.');
  } finally {
    fs.writeFileSync(DB_FILE, backup);
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});

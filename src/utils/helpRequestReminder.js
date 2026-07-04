const { loadDB, saveDB } = require('./db');
const { broadcastHelpRequest } = require('../handlers/helpRequests');

async function checkStaleHelpRequests(bot) {
  const db = loadDB();
  const requests = db.helpRequests || [];

  for (const req of requests) {
    if (req.status !== 'claimed') continue;
    if (!req.claimedAt) continue;

    const diffHours = (Date.now() - new Date(req.claimedAt).getTime()) / 3600000;
    if (diffHours < 48) continue;
    if (req.staleNotifiedAt) continue;

    const oldClaimerId = req.claimedBy;
    req.status = 'broadcasting';
    req.claimedBy = null;
    req.claimedAt = null;
    req.staleNotifiedAt = new Date().toISOString();
    req.broadcastMessageIds = [];
    saveDB(db);

    if (oldClaimerId) {
      try {
        await bot.telegram.sendMessage(
          String(oldClaimerId),
          'تم إرجاع الطلب للنشر لعدم إتمامه، شكراً لمحاولتك',
          { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }

    const fakeCtx = {
      telegram: bot.telegram,
      publisherId: req.publishedBy || '',
      reply: null
    };
    await broadcastHelpRequest(fakeCtx, req.id);
  }
}

function startHelpRequestReminderSchedule(bot) {
  setInterval(() => {
    checkStaleHelpRequests(bot).catch(() => {});
  }, 30 * 60 * 1000);
}

module.exports = { startHelpRequestReminderSchedule, checkStaleHelpRequests };

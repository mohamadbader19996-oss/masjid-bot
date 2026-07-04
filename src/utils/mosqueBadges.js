// src/utils/mosqueBadges.js
const db = require('../database');

async function calculateAutoBadges(mosqueId) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const auto = [];

  // 🔥 نشط
  const events = db.get('events') || {};
  const hasRecentEvent = Object.values(events).some(
    e => e.mosqueId === mosqueId && new Date(e.date).getTime() > thirtyDaysAgo
  );
  if (hasRecentEvent) auto.push('🔥');

  // 💎 شفاف
  const campaigns = db.get('campaigns') || {};
  const hasPublishedCampaign = Object.values(campaigns).some(
    c => c.mosqueId === mosqueId && c.status !== 'draft'
  );
  if (hasPublishedCampaign) auto.push('💎');

  // 🤝 متضامن
  const donations = db.get('campaign_donations') || {};
  const hasDonatedToOther = Object.values(donations).some(
    d => d.donorMosqueId === mosqueId && d.targetMosqueId !== mosqueId
  );
  if (hasDonatedToOther) auto.push('🤝');

  // 🌟 داعم
  const acceptedEvents = Object.values(events).filter(
    e => e.hostMosqueId === mosqueId &&
         e.originMosqueId &&
         e.originMosqueId !== mosqueId &&
         e.approvalStatus === 'accepted'
  );
  if (acceptedEvents.length >= 3) auto.push('🌟');

  return auto;
}

function grantManualBadge(mosqueId, badge) {
  const mosques = db.get('mosques') || {};
  if (!mosques[mosqueId]) return false;
  if (!mosques[mosqueId].badges) {
    mosques[mosqueId].badges = { auto: [], manual: [], lastCalculated: null };
  }
  const manual = mosques[mosqueId].badges.manual || [];
  if (!manual.includes(badge)) {
    manual.push(badge);
    mosques[mosqueId].badges.manual = manual;
    db.set('mosques', mosques);
  }
  return true;
}

function revokeManualBadge(mosqueId, badge) {
  const mosques = db.get('mosques') || {};
  if (!mosques[mosqueId]?.badges?.manual) return false;
  mosques[mosqueId].badges.manual = mosques[mosqueId].badges.manual.filter(
    b => b !== badge
  );
  db.set('mosques', mosques);
  return true;
}

async function updateAllMosquesBadges() {
  const mosques = db.get('mosques') || {};
  for (const mosqueId of Object.keys(mosques)) {
    const auto = await calculateAutoBadges(mosqueId);
    if (!mosques[mosqueId].badges) {
      mosques[mosqueId].badges = { auto: [], manual: [], lastCalculated: null };
    }
    mosques[mosqueId].badges.auto = auto;
    mosques[mosqueId].badges.lastCalculated = new Date().toISOString();
  }
  db.set('mosques', mosques);
  console.log('✅ تم تحديث شارات المساجد');
}

function getBadgesDisplay(mosqueId) {
  const mosques = db.get('mosques') || {};
  const mosque = mosques[mosqueId];
  if (!mosque?.badges) return '';
  const all = [
    ...(mosque.badges.auto || []),
    ...(mosque.badges.manual || [])
  ];
  return all.length > 0 ? all.join(' ') : '';
}

function recordCampaignRejection(mosqueId, campaignId, reason = null) {
  const mosques = db.get('mosques') || {};
  if (!mosques[mosqueId]) return;
  if (!mosques[mosqueId].campaignRejections) {
    mosques[mosqueId].campaignRejections = [];
  }
  mosques[mosqueId].campaignRejections.push({
    campaignId,
    reason,
    hasReason: reason !== null && reason.trim() !== '',
    timestamp: new Date().toISOString()
  });
  db.set('mosques', mosques);
}

function getCampaignRejectionSummary(mosqueId, forDeveloper = false) {
  const mosques = db.get('mosques') || {};
  const rejections = mosques[mosqueId]?.campaignRejections || [];
  if (rejections.length < 3) return null;
  const lastThree = rejections.slice(-3);
  const hasReason = lastThree.some(r => r.hasReason);
  if (forDeveloper) {
    return {
      count: rejections.length,
      hasReason,
      lastReason: lastThree.find(r => r.hasReason)?.reason || null
    };
  } else {
    return {
      count: rejections.length,
      hasReason
    };
  }
}

function formatRejectionBadge(mosqueId, forDeveloper = false) {
  const summary = getCampaignRejectionSummary(mosqueId, forDeveloper);
  if (!summary) return '';
  if (forDeveloper) {
    return `⚠️ رفض ${summary.count} حملات | ${summary.hasReason ? `مبرر: "${summary.lastReason}"` : 'بدون مبرر ❌'}`;
  } else {
    return `⚠️ رفض ${summary.count} حملات | ${summary.hasReason ? 'مبرر ✅' : 'بدون مبرر ❌'}`;
  }
}

// ═══════════════════════════════════════
// نظام اقتراح الشارات التلقائي
// ═══════════════════════════════════════
async function checkBadgeSuggestions(bot, developerChatId) {
  const mosques = db.get('mosques') || {};
  const suggestions = db.get('badge_suggestions') || {};

  for (const mosqueId of Object.keys(mosques)) {
    const mosque = mosques[mosqueId];
    const health = mosque.healthScore || db.getMosqueHealth(mosqueId)?.score || 0;
    const auto = mosque.badges?.auto || [];
    const manual = mosque.badges?.manual || [];
    const team = db.get('mosque_roles')?.[mosqueId] || {};

    // ── ⭐ متميز ──────────────────────────
    if (
      !manual.includes('⭐') &&
      !suggestions[`⭐_${mosqueId}`] &&
      health >= 90 &&
      auto.includes('🔥') &&
      auto.includes('💎')
    ) {
      suggestions[`⭐_${mosqueId}`] = { status: 'pending', timestamp: new Date().toISOString() };
      db.set('badge_suggestions', suggestions);

      await bot.telegram.sendMessage(developerChatId,
        `🏷️ *اقتراح شارة جديد*\n\n` +
        `🕌 ${mosque.name}\n` +
        `📍 ${mosque.city || ''}\n\n` +
        `⭐ *متميز* — مؤهل!\n` +
        `السبب:\n` +
        `• صحة المسجد: ${health}%\n` +
        `• شارات تلقائية: ${auto.join(' ')}\n\n` +
        `هل تمنح الشارة؟`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ منح ⭐', callback_data: `badge_grant_⭐_${mosqueId}` },
              { text: '❌ تجاهل', callback_data: `badge_ignore_⭐_${mosqueId}` }
            ]]
          }
        }
      );
    }

    // ── 🌍 مجتمعي ─────────────────────────
    if (
      !manual.includes('🌍') &&
      !suggestions[`🌍_${mosqueId}`]
    ) {
      const nationalities = new Set(
        Object.entries(team)
          .map(([userId]) => {
            const user = db.get('users')?.[userId];
            return user?.nationality;
          })
          .filter(Boolean)
      );

      if (nationalities.size >= 3) {
        suggestions[`🌍_${mosqueId}`] = { status: 'pending', timestamp: new Date().toISOString() };
        db.set('badge_suggestions', suggestions);

        await bot.telegram.sendMessage(developerChatId,
          `🏷️ *اقتراح شارة جديد*\n\n` +
          `🕌 ${mosque.name}\n` +
          `📍 ${mosque.city || ''}\n\n` +
          `🌍 *مجتمعي* — مؤهل!\n` +
          `السبب: ${nationalities.size} جنسيات مختلفة في الفريق\n\n` +
          `هل تمنح الشارة؟`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ منح 🌍', callback_data: `badge_grant_🌍_${mosqueId}` },
                { text: '❌ تجاهل', callback_data: `badge_ignore_🌍_${mosqueId}` }
              ]]
            }
          }
        );
      }
    }
  }
}

module.exports = {
  calculateAutoBadges,
  updateAllMosquesBadges,
  grantManualBadge,
  revokeManualBadge,
  getBadgesDisplay,
  recordCampaignRejection,
  getCampaignRejectionSummary,
  formatRejectionBadge,
  checkBadgeSuggestions
};

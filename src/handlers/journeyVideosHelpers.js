const db = require('../database');
const {
  JOURNEY_VIDEO_TOPICS,
  JOURNEY_VIDEO_LANGS,
  PRAYER_VIDEO_LEVELS,
  DEVELOPER_NOTIFY_ID
} = require('../data/journeyVideoTopics');

function getMosqueNameForUser(userId) {
  const uid = String(userId);
  const mosques = db.getAllMosques ? db.getAllMosques() : {};
  const mosque = Object.values(mosques).find(
    (m) =>
      String(m.adminId) === uid ||
      String(m.createdBy) === uid ||
      m.createdBy === parseInt(uid, 10)
  );
  if (mosque?.name) return mosque.name;
  const user = db.getUser(userId);
  return user?.firstName || user?.name || 'مسجد';
}

function getVideoKeyLabel(topic, keyCode) {
  if (topic === 'prayer' && PRAYER_VIDEO_LEVELS[keyCode]) return PRAYER_VIDEO_LEVELS[keyCode];
  if (topic === 'prayer') return JOURNEY_VIDEO_LANGS[keyCode] || keyCode;
  return JOURNEY_VIDEO_LANGS[keyCode] || keyCode;
}

async function notifyDeveloperNewVideo(ctx, topic, langCode, url) {
  const topicLabel = JOURNEY_VIDEO_TOPICS[topic]?.label || topic;
  const keyLabel = getVideoKeyLabel(topic, langCode);
  const mosqueName = getMosqueNameForUser(ctx.from.id);
  const text =
    `🎥 أضاف ${mosqueName} فيديو ${topicLabel} (${keyLabel}) للمراجعة: ${url}`;
  try {
    await ctx.telegram.sendMessage(DEVELOPER_NOTIFY_ID, text);
  } catch {
    // تجاهل فشل الإشعار
  }
}

module.exports = { getMosqueNameForUser, notifyDeveloperNewVideo };

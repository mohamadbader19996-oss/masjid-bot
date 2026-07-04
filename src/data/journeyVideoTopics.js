const { VOLUNTEER_LANGUAGES } = require('../handlers/volunteers');

const JOURNEY_VIDEO_TOPICS = {
  wudu: { label: 'الوضوء', emoji: '🚿' },
  prayer: { label: 'الصلاة', emoji: '🤲' }
};

const JOURNEY_VIDEO_LANGS = Object.fromEntries(
  Object.entries(VOLUNTEER_LANGUAGES)
);

const SECTION_TO_VIDEO_TOPIC = {
  wudu: 'wudu',
  prayer_steps: 'prayer'
};

const PRAYER_VIDEO_LEVELS = {
  simple: '🟢 مبسط',
  medium: '🟡 وسط',
  advanced: '🔴 مكثف'
};

const WUDU_VIDEO_LEVELS = {
  simple: '🟢 مبسط',
  advanced: '🔴 مكثف'
};

const DEVELOPER_NOTIFY_ID = 6070771722;

module.exports = {
  JOURNEY_VIDEO_TOPICS,
  JOURNEY_VIDEO_LANGS,
  PRAYER_VIDEO_LEVELS,
  WUDU_VIDEO_LEVELS,
  SECTION_TO_VIDEO_TOPIC,
  DEVELOPER_NOTIFY_ID
};

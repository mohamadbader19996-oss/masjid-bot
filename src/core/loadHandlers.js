/**
 * تحميل جميع ملفات الـ handlers لتسجيل الأزرار في actionRegistry تلقائياً.
 * يُستدعى مرة واحدة من bot.js قبل registerAll().
 */
require('../handlers/common');
require('../handlers/sheikh');
require('../handlers/admin');
require('../handlers/developer');
require('../handlers/quran');
require('../handlers/ai');
require('../handlers/sheikh_new');
require('../menuHandlers');

const registry = require('./actionRegistry');
const scholarHandler = require('../handlers/scholar');
const scholarApplyHandler = require('../handlers/scholar_apply');
const scholarReviewHandler = require('../handlers/scholar_review');
const imageHandler = require('../handlers/imageHandler');
const voiceHandler = require('../handlers/voiceHandler');
const moderatorHandler = require('../handlers/moderator');

scholarHandler.register(registry);
scholarApplyHandler.register(registry);
scholarReviewHandler.register(registry);
imageHandler.register(registry);
voiceHandler.register(registry);
moderatorHandler.register(registry);

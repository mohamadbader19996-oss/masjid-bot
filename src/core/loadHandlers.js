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
require('../handlers/dawah');
require('../handlers/sheikh_new');
require('../handlers/recitationSheikh');
require('../handlers/recitationVolunteers');
require('../handlers/mosque_admin');
require('../handlers/invites');
require('../handlers/regionalModerator');
require('../handlers/hierarchicalStats');
require('../handlers/helpRequests');
require('../handlers/hisnMuslim');
require('../handlers/hadith');
require('../handlers/quotes');
require('../handlers/tasbih');
require('../handlers/hijriCalendar');
require('../handlers/namesOfAllah');
require('../handlers/prayerFiqh');
require('../handlers/prayerReadings');
require('../handlers/journeyVideos');
require('../handlers/debates');
require('../handlers/conversionStories');
require('../handlers/moderatorContent');
require('../handlers/logistics');
require('../handlers/platform');
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

const { acceptInvite, rejectInvite } = require('../handlers/start');
registry.register(/^accept_invite_(.+)$/, acceptInvite);
registry.register(/^reject_invite_(.+)$/, rejectInvite);

const startHandler = require('../handlers/start');
// تسجيل أزرار الدعوة ديناميكياً في bot.js

require('../handlers/stateReport');
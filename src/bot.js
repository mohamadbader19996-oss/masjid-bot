require('dotenv').config();
const { Telegraf, Scenes, session, Composer } = require('telegraf');
const { Markup } = require('telegraf');
const { SceneContextScene } = require('telegraf/scenes');
const db = require('./database');
const { loadDB } = require('./utils/db');
const { resolveMosqueId } = require('./handlers/recitationVolunteers');
const {
  mainKeyboard,
  ROLES,
  CANCEL_BUTTON,
  NAV_COMMANDS,
  isMenuButton,
  isNavMessage,
  resetUserState
} = require('./keyboards');
require('./core/loadHandlers');
const {
  handleEmergencyContent,
  handleConfirmRemove,
  handleDoRemove,
  handlePickCampaign,
  handleManualAmountInput,
  handleAnnouncementAndEventInput,
  handleEventScopeCallback,
  handleApproveEvent,
  handleRejectEvent,
  handleEventMosqueApproval,
  handleEventApprovalsStatus,
  handleEventAttend,
  handleEventAudienceCallback,
  handleEventShare,
  handleComplaintAction,
  handleComplaintReplyInput,
  handleComplaintTypeCallback,
  handleComplaintAnonCallback,
  handleComplaintSubmitInput,
  handleUnionRegistrationInput
} = require('./handlers/mosque_admin');
const { handleLogisticsDescInput, handleNoteInput } = require('./handlers/logistics');
const { handlePlatformMsgInput, handleDevReplyInput } = require('./handlers/platform');
const { handleIdentityConfirm, handleIdentityChange, handleIdentityLeave } = require('./handlers/../utils/identityCheck');
const registry = require('./core/actionRegistry');
const { dispatchMenuButton } = require('./menuHandlers');
const { scenes } = require('./scenes');
const { handleStart, handleUiLang } = require('./handlers/start');
const quran = require('./handlers/quran');
const { approveMosqueRequest, rejectMosqueRequest } = require('./handlers/mosqueRequestHandlers');
const { broadcastCampaign } = require('./scenes/campaignScene');
const ai = require('./handlers/ai');
const { handleCorrectionText, reviewAnswersPanel } = require('./handlers/scholar_review');
const { handleImageQuestion } = require('./handlers/imageHandler');
const { handleVoiceQuestion } = require('./handlers/voiceHandler');
const { getJoinRequest, updateJoinRequest } = require('./scenes/joinMosqueScene');
const {
  getUserLangCode,
  resolveIncomingButtonText,
  prepareOutgoing,
  hydrateUiButtonMap,
  localizedMainKeyboard,
  normalizeOutgoingArgs,
  wrapTelegramApi
} = require('./services/uiTranslate');

const bot = new Telegraf((process.env.BOT_TOKEN || '').trim());
const SCENE_TTL_SECONDS = 30 * 60;
const stage = new Scenes.Stage(scenes, { ttl: SCENE_TTL_SECONDS });

bot.use(session({ defaultSession: () => ({}) }));

bot.use(async (ctx, next) => {
  const pageMatch = ctx.callbackQuery?.data?.match(/^ui_lang_page_(\d+)$/);
  if (pageMatch) {
    const { handleUiLangPage } = require('./services/uiTranslate');
    return handleUiLangPage(ctx, parseInt(pageMatch[1], 10));
  }
  if (ctx.callbackQuery?.data?.match(/^ui_lang_[a-z]{2,3}$/)) {
    ctx.match = ctx.callbackQuery.data.match(/^ui_lang_([a-z]{2,3})$/);
    return handleUiLang(ctx);
  }
  if (ctx.callbackQuery) {
    const lang = ctx.from?.language_code || '?';
    console.log(`🔘 ${ctx.callbackQuery.data} | user=${ctx.from?.id} | lang=${lang}`);
  }
  return next();
});

bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const userId = ctx.from.id;
  const isDev = db.isDeveloper(userId);
  let user = db.getUser(userId);
  if (!user) {
    user = db.saveUser(userId, {
      id: userId,
      username: ctx.from.username || '',
      firstName: ctx.from.first_name || '',
      lastName: ctx.from.last_name || '',
      role: isDev ? ROLES.DEVELOPER : ROLES.WORSHIPPER,
      joinedAt: new Date().toISOString()
    });
  } else if (isDev && user.role !== ROLES.DEVELOPER) {
    user = db.saveUser(userId, { role: ROLES.DEVELOPER });
  }
  if (user.uiLang) ctx.session.uiLang = user.uiLang;
  ctx.user = user;
  ctx.session = ctx.session || {};
  ctx.session.userRole = user.role;
  hydrateUiButtonMap(ctx);
  return next();
});

bot.use(async (ctx, next) => {
  const originalReply = ctx.reply.bind(ctx);
  const originalEditMessageText = ctx.editMessageText.bind(ctx);
  const originalReplyWithPhoto = ctx.replyWithPhoto.bind(ctx);
  const originalEditMessageReplyMarkup = ctx.editMessageReplyMarkup?.bind(ctx);
  const originalEditMessageCaption = ctx.editMessageCaption?.bind(ctx);

  ctx.reply = async (text, extra) => {
    const { messageText, options } = normalizeOutgoingArgs(text, extra);
    const out = await prepareOutgoing(ctx, messageText, options);
    return originalReply(out.text, out.extra);
  };

  ctx.editMessageText = async (text, extra) => {
    const out = await prepareOutgoing(ctx, text, extra);
    return originalEditMessageText(out.text, out.extra);
  };

  ctx.replyWithPhoto = async (photo, extra) => {
    const out = await prepareOutgoing(ctx, extra?.caption ?? '', extra);
    return originalReplyWithPhoto(photo, out.extra);
  };

  if (originalEditMessageReplyMarkup) {
    ctx.editMessageReplyMarkup = async (extra) => {
      const out = await prepareOutgoing(ctx, '', extra);
      return originalEditMessageReplyMarkup(out.extra);
    };
  }

  if (originalEditMessageCaption) {
    ctx.editMessageCaption = async (caption, extra) => {
      const out = await prepareOutgoing(ctx, caption, extra);
      return originalEditMessageCaption(out.text, out.extra);
    };
  }

  wrapTelegramApi(ctx, ctx.telegram);

  return next();
});

bot.use(async (ctx, next) => {
  const rawText = ctx.message?.text;
  if (rawText) {
    const resolved = resolveIncomingButtonText(ctx, rawText);
    if (resolved !== rawText) ctx.message.text = resolved;
  }
  return next();
});

bot.use((ctx, next) => {
  if (ctx.session) {
    ctx.scene = new SceneContextScene(ctx, stage.scenes, stage.options);
  }
  return next();
});

function hasFlowFlags(ctx) {
  return Boolean(
    ctx.session?.aiMode ||
    ctx.session?.aiSetupStep ||
    ctx.session?.aiMadhabSelection ||
    ctx.session?.aiSectSelection ||
    ctx.session?.aiWaitingCity ||
    ctx.session?.aiScholarContext ||
    ctx.session?.aiScholarAdvancedMode ||
    ctx.session?.aiKhutbahMode ||
    ctx.session?.aiKhutbahStep ||
    ctx.session?.aiTargetLanguage ||
    ctx.session?.searchingQuran ||
    ctx.session?.searchingSurahName ||
    ctx.session?.hafizPagePrompt ||
    ctx.session?.recitationCheckPage ||
    ctx.session?.recitationSheikhPagePrompt ||
    ctx.session?.awaitingRecitationWhatsapp ||
    ctx.session?.awaitingRecVolPromoteTarget ||
    ctx.session?.mushafPagePrompt ||
    ctx.session?.quranAyahPrompt ||
    ctx.session?.quranHafizMode ||
    ctx.session?.addingSheikh ||
    ctx.session?.addingSheikhSpecialty ||
    ctx.session?.addingSheikhPhone ||
    ctx.session?.settingIBAN ||
    ctx.session?.settingPayPal ||
    ctx.session?.answeringSecretQuestion ||
    ctx.session?.addingCircle ||
    ctx.session?.addingCircleSchedule ||
    ctx.session?.addingCircleTopic ||
    ctx.session?.uploadingSermon ||
    ctx.session?.uploadingSermonContent
  );
}

// أزرار القائمة قبل الـ scenes — يمنع التقاط الـ wizard لنص الأزرار
bot.use(async (ctx, next) => {
  const rawText = ctx.message?.text;
  if (!rawText) return next();
  hydrateUiButtonMap(ctx);
  const text = resolveIncomingButtonText(ctx, rawText);
  if (text !== rawText) ctx.message.text = text;
  if (!isNavMessage(text)) return next();

  const isCommand = NAV_COMMANDS.has(text.split('@')[0]);
  if (!isCommand) await resetUserState(ctx);

  if (text === CANCEL_BUTTON || text.split('@')[0] === '/cancel') {
    const kbd = await localizedMainKeyboard(ctx, ctx.user ? ctx.user.role : ROLES.WORSHIPPER);
    return ctx.reply('❌ تم الإلغاء.', kbd);
  }

  if (isMenuButton(text)) {
    const dispatched = await dispatchMenuButton(ctx, text);
    if (dispatched) return;
  }

  return next();
});

const menuComposer = new Composer();
menuComposer.hears(CANCEL_BUTTON, async (ctx) => {
  await resetUserState(ctx);
  const kbd = await localizedMainKeyboard(ctx, ctx.user ? ctx.user.role : ROLES.WORSHIPPER);
  await ctx.reply('❌ تم الإلغاء.', kbd);
});
menuComposer.command('cancel', async (ctx) => {
  await resetUserState(ctx);
  const kbd = await localizedMainKeyboard(ctx, ctx.user ? ctx.user.role : ROLES.WORSHIPPER);
  await ctx.reply('❌ تم الإلغاء.', kbd);
});
menuComposer.start(handleStart);
menuComposer.command('help', async (ctx) => {
  const role = ctx.user ? ctx.user.role : ROLES.WORSHIPPER;
  const kbd = await localizedMainKeyboard(ctx, role);
  await ctx.reply(
    '🕌 *مساعدة بوت المسجد*\n\n/start - بدء البوت\n/help - المساعدة\n/cancel - إلغاء',
    { parse_mode: 'Markdown', ...kbd }
  );
});
menuComposer.command('menu', async (ctx) => {
  await resetUserState(ctx);
  const kbd = await localizedMainKeyboard(ctx, ctx.user ? ctx.user.role : ROLES.WORSHIPPER);
  await ctx.reply('القائمة الرئيسية:', kbd);
});

if (process.env.ENABLE_TEST_SHAHADA === '1') {
  const devTest = require('./dev/testShahadaCommand');
  menuComposer.command('test_shahada', devTest.handleTestShahadaCommand);
  menuComposer.command('test_journey_day', devTest.handleTestJourneyDayCommand);
  menuComposer.command('test_moderator_panel', devTest.handleTestModeratorPanelCommand);
}

bot.use(menuComposer);

// تسجيل جميع الأزرار من actionRegistry — قبل stage
registry.registerAll(bot);

bot.action(/^ic_confirm_/, handleIdentityConfirm);
bot.action(/^ic_change_/, handleIdentityChange);
bot.action(/^ic_leave_/, handleIdentityLeave);

bot.action(/^approve_join_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const requestId = ctx.callbackQuery.data.replace('approve_join_', '');
  const request = getJoinRequest(requestId);
  if (!request) return ctx.reply('❌ الطلب غير موجود.');
  if (request.status !== 'pending') return ctx.reply('⚠️ تم معالجة هذا الطلب مسبقاً.');
  db.setMosqueRole(request.mosqueId, request.userId, request.role);
  const mainRoles = {
    religious: 'admin', finance: 'admin', logistics: 'admin', state: 'admin',
    khatib: 'sheikh', muadhin: 'sheikh', quran_teacher: 'sheikh',
    hifz_teacher: 'sheikh', general: 'sheikh', worshipper: 'worshipper'
  };
  const newRole = mainRoles[request.role] || 'worshipper';
  db.saveUser(request.userId, { role: newRole, mosqueId: request.mosqueId });
  updateJoinRequest(requestId, { status: 'approved' });
  if (ctx.callbackQuery.message?.photo) {
    await ctx.editMessageCaption('✅ تم القبول').catch(() => {});
  } else {
    await ctx.editMessageText('✅ تم القبول').catch(() => {});
  }
  const mosque = db.getAllMosques()[request.mosqueId];
  await ctx.telegram.sendMessage(
    request.userId,
    `🎉 *تم قبول طلبك!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🕌 ${mosque?.name}\n` +
    `أهلاً وسهلاً بك في الفريق! 🤝`,
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^reject_join_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const requestId = ctx.callbackQuery.data.replace('reject_join_', '');
  const request = getJoinRequest(requestId);
  if (!request) return ctx.reply('❌ الطلب غير موجود.');
  updateJoinRequest(requestId, { status: 'rejected' });
  if (ctx.callbackQuery.message?.photo) {
    await ctx.editMessageCaption('❌ تم الرفض').catch(() => {});
  } else {
    await ctx.editMessageText('❌ تم الرفض').catch(() => {});
  }
  await ctx.telegram.sendMessage(
    request.userId,
    `❌ *تم رفض طلبك*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `يمكنك التواصل مع مدير المسجد لمزيد من المعلومات.`,
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^approve_mosque_/, (ctx) => {
  const requestId = ctx.callbackQuery.data.replace('approve_mosque_', '');
  console.log(`[approve_mosque] callback=${ctx.callbackQuery.data} requestId=${requestId} user=${ctx.from?.id}`);
  return approveMosqueRequest(ctx, requestId);
});

bot.action(/^reject_mosque_/, (ctx) => {
  const requestId = ctx.callbackQuery.data.replace('reject_mosque_', '');
  return rejectMosqueRequest(ctx, requestId);
});

bot.action(/^approve_campaign_/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const campaignId = ctx.callbackQuery.data.replace('approve_campaign_', '');
  const campaign = db.getCampaign(campaignId);
  if (!campaign) return ctx.reply('❌ الحملة غير موجودة.');
  const mosque = db.getAllMosques()[campaign.mosqueId];
  await broadcastCampaign(ctx, campaignId, {
    mosqueName: mosque?.name,
    mosqueId: campaign.mosqueId,
    title: campaign.title,
    description: campaign.description,
    targetAmount: campaign.targetAmount
  });
  await ctx.editMessageText('✅ تمت الموافقة ونشر الحملة').catch(() => {});
  await ctx.telegram.sendMessage(
    mosque?.adminId || mosque?.createdBy,
    `✅ *تمت الموافقة على حملتك!*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 ${campaign.title}\n` +
    `✅ تم إشعار المصلين 🔔`,
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^reject_campaign_/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const campaignId = ctx.callbackQuery.data.replace('reject_campaign_', '');
  const campaign = db.getCampaign(campaignId);
  if (!campaign) return ctx.reply('❌ الحملة غير موجودة.');
  db.closeCampaign(campaignId);
  await ctx.editMessageText('❌ تم رفض الحملة').catch(() => {});
  const mosque = db.getAllMosques()[campaign.mosqueId];
  await ctx.telegram.sendMessage(
    mosque?.adminId || mosque?.createdBy,
    `❌ *تم رفض حملة التبرع*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📌 ${campaign.title}\n` +
    `تواصل مع الإدارة لمزيد من المعلومات.`,
    { parse_mode: 'Markdown' }
  );
});

bot.use(stage.middleware());

bot.action(/^ma_confirm_remove_(.+)$/, handleConfirmRemove);
bot.action(/^ma_do_remove_(.+)$/, handleDoRemove);
bot.action(/^ma_pick_campaign_(.+)$/, handlePickCampaign);
bot.action(/^ev_scope_(.+)$/, handleEventScopeCallback);
bot.action(/^ma_approve_event_(.+)$/, handleApproveEvent);
bot.action(/^ma_reject_event_(.+)$/, handleRejectEvent);
bot.action(/^ev_approve_mosque_/, handleEventMosqueApproval);
bot.action(/^ev_reject_mosque_/, handleEventMosqueApproval);
bot.action(/^ev_approvals_(.+)$/, handleEventApprovalsStatus);
bot.action(/^ev_attend_(.+)$/, handleEventAttend);
bot.action(/^ev_aud_/, handleEventAudienceCallback);
bot.action(/^ev_share_/, handleEventShare);
bot.action(/^mc_reply_/, handleComplaintAction);
bot.action(/^mc_resolve_/, handleComplaintAction);
bot.action(/^mc_progress_/, handleComplaintAction);
bot.action(/^mc_satisfied_/, handleComplaintAction);
bot.action(/^mc_unsatisfied_/, handleComplaintAction);
bot.action(/^complaint_maintenance$/, handleComplaintTypeCallback);
bot.action(/^complaint_behavior$/, handleComplaintTypeCallback);
bot.action(/^complaint_admin$/, handleComplaintTypeCallback);
bot.action(/^complaint_suggestion$/, handleComplaintTypeCallback);
bot.action(/^complaint_anon_yes$/, handleComplaintAnonCallback);
bot.action(/^complaint_anon_no$/, handleComplaintAnonCallback);
const { registerQiblaHandlers } = require('./handlers/qibla');
registerQiblaHandlers(bot);
bot.on('message', async (ctx, next) => {
  if (ctx.session?.updatingGPS && ctx.message?.location) {
    const mosqueId = ctx.session.updatingGPS;
    const lat = ctx.message.location.latitude;
    const lng = ctx.message.location.longitude;
    const dbPath = require('path').join(__dirname, '../data/db.json');
    const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
    if (dbData.mosques[mosqueId]) {
      dbData.mosques[mosqueId].lat = lat;
      dbData.mosques[mosqueId].lng = lng;
      require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    }
    delete ctx.session.updatingGPS;
    return ctx.reply(
      `✅ *تم تحديث الموقع!*\n📍 ${lat}, ${lng}\n\nالآن يمكن تحديد المساجد المجاورة بدقة 🗺️`,
      { parse_mode: 'Markdown' }
    );
  }
  await handleEmergencyContent(ctx, next);
});
bot.on('message', async (ctx, next) => {
  await handleAnnouncementAndEventInput(ctx, next);
});
bot.on('message', async (ctx, next) => {
  await handleComplaintReplyInput(ctx, next);
});
bot.on('message', async (ctx, next) => {
  await handleComplaintSubmitInput(ctx, next);
});
bot.on('message', async (ctx, next) => {
  await handleManualAmountInput(ctx, next);
});

bot.on('text', async function(ctx, next) {
  const { handleVolunteerContactInput } = require('./handlers/volunteers');
  if (await handleVolunteerContactInput(ctx)) return;

  const { handleShahadaScheduleInput } = require('./handlers/dawah');
  if (await handleShahadaScheduleInput(ctx)) return;

  const recitationSheikh = require('./handlers/recitationSheikh');
  if (await recitationSheikh.handleRecitationWhatsappInput(ctx, ctx.message.text)) return;
  if (await recitationSheikh.handleRecitationSheikhReply(ctx)) return;

  const { handleRecitationVolunteerContactInput, handleRecVolPromoteManualInput } = require('./handlers/recitationVolunteers');
  if (await handleRecitationVolunteerContactInput(ctx)) return;
  if (await handleRecVolPromoteManualInput(ctx, ctx.message.text)) return;

  if (await handleUnionRegistrationInput(ctx, bot)) return;

  // رسالة لمسجد محدد
  if (ctx.session?.waitingMsgMosque) {
    const targetId = ctx.session.waitingMsgMosque;
    const mosque = Object.values(db.getAllMosques()).find(m =>
      String(m.adminId) === String(ctx.from.id) ||
      String(m.createdBy) === String(ctx.from.id)
    );
    const targetMosque = db.getMosque(targetId);
    const text = ctx.message.text.trim();
    ctx.session.waitingMsgMosque = null;
    if (targetMosque?.adminId) {
      await ctx.telegram.sendMessage(String(targetMosque.adminId),
        `📨 رسالة من مسجد ${mosque?.name || 'مجهول'}\n\n${text}`
      ).catch(() => {});
    }
    await ctx.reply('✅ تم إرسال الرسالة.');
    return;
  }
  // إعلان للمساجد المجاورة
  if (ctx.session?.waitingNearbyAnnounce) {
    const mosque = Object.values(db.getAllMosques()).find(m =>
      String(m.adminId) === String(ctx.from.id) ||
      String(m.createdBy) === String(ctx.from.id)
    );
    if (!mosque) { ctx.session.waitingNearbyAnnounce = false; return; }
    const allMosques = db.getAllMosques();
    let nearby = [];
    if (mosque.lat && mosque.lng) {
      const { getNearbyMosquesByGPS } = require('./utils/geo');
      nearby = getNearbyMosquesByGPS(mosque, allMosques).map(n => n.mosque);
    } else {
      nearby = Object.values(allMosques).filter(m => m.id !== mosque.id && m.city === mosque.city);
    }
    const text = ctx.message.text.trim();
    ctx.session.waitingNearbyAnnounce = false;
    let sent = 0;
    for (const m of nearby) {
      if (m.adminId) {
        await ctx.telegram.sendMessage(String(m.adminId),
          `📢 إعلان من مسجد ${mosque.name}\n\n${text}`
        ).catch(() => {});
        sent++;
      }
    }
    await ctx.reply(`✅ تم إرسال الإعلان لـ ${sent} مسجد.`);
    return;
  }
  if (await handlePlatformMsgInput(ctx)) return;
  if (await handleDevReplyInput(ctx)) return;
  if (await handleLogisticsDescInput(ctx)) return;
  if (await handleNoteInput(ctx)) return;
  if (ctx.session?.updatingGPS) {
    const mosqueId = ctx.session.updatingGPS;
    let lat = null, lng = null;
    if (ctx.message?.location) {
      lat = ctx.message.location.latitude;
      lng = ctx.message.location.longitude;
    } else if (ctx.message?.text) {
      const parts = ctx.message.text.split(',');
      if (parts.length === 2) {
        lat = parseFloat(parts[0].trim());
        lng = parseFloat(parts[1].trim());
      }
    }
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return ctx.reply('⚠️ صيغة غير صحيحة. مثال: 53.5935, 9.4797');
    }
    const dbPath = require('path').join(__dirname, '../data/db.json');
    const dbData = JSON.parse(require('fs').readFileSync(dbPath, 'utf8'));
    if (dbData.mosques[mosqueId]) {
      dbData.mosques[mosqueId].lat = lat;
      dbData.mosques[mosqueId].lng = lng;
      require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    }
    delete ctx.session.updatingGPS;
    return ctx.reply(
      `✅ *تم تحديث الموقع!*\n📍 ${lat}, ${lng}\n\nالآن يمكن تحديد المساجد المجاورة بدقة 🗺️`,
      { parse_mode: 'Markdown' }
    );
  }
  if (ctx.session?.settingIban) {
    const mosqueId = ctx.session.settingIban;
    const dbPath = require('path').join(__dirname, '../data/db.json');
    const dbData = JSON.parse(require('fs').readFileSync(dbPath));
    if (dbData.mosques[mosqueId]) {
      dbData.mosques[mosqueId].iban = ctx.message.text.trim();
      require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    }
    delete ctx.session.settingIban;
    return ctx.reply('✅ تم تحديث IBAN بنجاح! 🏦');
  }
  if (ctx.session?.settingPaypal) {
    const mosqueId = ctx.session.settingPaypal;
    const dbPath = require('path').join(__dirname, '../data/db.json');
    const dbData = JSON.parse(require('fs').readFileSync(dbPath));
    if (dbData.mosques[mosqueId]) {
      dbData.mosques[mosqueId].paypal = ctx.message.text.trim();
      require('fs').writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    }
    delete ctx.session.settingPaypal;
    return ctx.reply('✅ تم تحديث PayPal بنجاح! 💙');
  }
  const text = ctx.message.text;
  if (text.startsWith('/')) return next();

  const handledByCorrection = await handleCorrectionText(ctx);
  if (handledByCorrection) return;

  const { handleRejectText, moderatorPanel, canAccess } = require('./handlers/moderator');
  const handledByMod = await handleRejectText(ctx);
  if (handledByMod) return;

  const { handleDebateRejectReasonText } = require('./handlers/debates');
  const handledByDebateReject = await handleDebateRejectReasonText(ctx, text);
  if (handledByDebateReject) return;

  const { handleStoriesRejectReasonText } = require('./handlers/conversionStories');
  const handledByStoriesReject = await handleStoriesRejectReasonText(ctx, text);
  if (handledByStoriesReject) return;

  if (text === '📋 طلبات العلماء') {
    const user = db.getUser(ctx.from.id);
    if (canAccess(user)) {
      return moderatorPanel(ctx);
    }
  }
  if (text === '🕌 طلبات المساجد') {
    const user = db.getUser(ctx.from.id);
    if (canAccess(user)) {
      return moderatorPanel(ctx);
    }
  }
  if (text === '📊 إحصائيات المشرف') {
    const user = db.getUser(ctx.from.id);
    if (canAccess(user)) {
      return moderatorPanel(ctx);
    }
  }

  if (text === '✏️ مراجعة الإجابات') {
    const user = db.getUser(ctx.from.id);
    if (user?.role === 'SCHOLAR') {
      return reviewAnswersPanel(ctx);
    }
  }

  if (text === '🎓 أنا عالم') {
    return require('./handlers/scholar_apply').startScholarApply(ctx);
  }

  if (isMenuButton(text)) {
    await resetUserState(ctx);
    return dispatchMenuButton(ctx, text);
  }

  if (ctx.session.aiSetupStep || ctx.session.aiMadhabSelection || ctx.session.aiSectSelection) {
    const handled = await ai.handleAiSetupText(ctx);
    if (handled !== false) return;
  }

  // معالج نصوص العالم والمناظر
  if (ctx.session.scholarMode) {
    const { handleScholarText } = require('./handlers/scholar_panel');
    const handled = await handleScholarText(ctx);
    if (handled) return;
  }

  if (ctx.session.aiMode) {
    console.log(`[QA Debug] bot.route → handleAiQuestion user=${ctx.from?.id} text=${String(text).slice(0, 80)}`);
    return ai.handleAiQuestion(ctx, text);
  }

  if (ctx.session.aiMadhabSelection) {
    return ctx.reply('⚠️ يرجى اختيار مذهبك من الأزرار أعلاه.');
  }

  if (ctx.session.aiSectSelection) {
    return ctx.reply('⚠️ يرجى اختيار طائفتك/تيارك من الأزرار أعلاه.');
  }

  if (ctx.session.hafizPagePrompt) { delete ctx.session.hafizPagePrompt; return quran.startHafizPageDrill(ctx, text); }
  if (ctx.session.recitationSheikhPagePrompt) {
    delete ctx.session.recitationSheikhPagePrompt;
    return recitationSheikh.startRecitationWithSheikhPage(ctx, text);
  }
  if (ctx.session.recitationCheckPage) { delete ctx.session.recitationCheckPage; return quran.startRecitationCheckPage(ctx, text); }
  if (ctx.session.mushafPagePrompt) { delete ctx.session.mushafPagePrompt; return quran.startMushafPage(ctx, text); }
  if (ctx.session.searchingSurahName) { delete ctx.session.searchingSurahName; return quran.searchSurahByName(ctx, text); }
  if (ctx.session.searchingQuran) { delete ctx.session.searchingQuran; return quran.searchInQuran(ctx, text); }
  if (ctx.session.quranAyahPrompt) { delete ctx.session.quranAyahPrompt; return quran.readAyah(ctx, text); }
  if (ctx.session.quranHafizMode) { delete ctx.session.quranHafizMode; return quran.hafizMode(ctx, text); }
  if (ctx.session.addingSheikh) {
    if (text === CANCEL_BUTTON) { delete ctx.session.addingSheikh; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const name = text.trim();
    ctx.session.sheikhData = { name }; ctx.session.addingSheikh = false; ctx.session.addingSheikhSpecialty = true;
    return ctx.reply('✅ الاسم: *' + name + '*\n\nأدخل التخصص:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingSheikhSpecialty) {
    if (text === CANCEL_BUTTON) { delete ctx.session.sheikhData; delete ctx.session.addingSheikhSpecialty; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sheikhData.specialty = text.trim(); ctx.session.addingSheikhSpecialty = false; ctx.session.addingSheikhPhone = true;
    return ctx.reply('✅ التخصص: *' + ctx.session.sheikhData.specialty + '*\n\nأدخل رقم الهاتف:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingSheikhPhone) {
    if (text === CANCEL_BUTTON) { delete ctx.session.sheikhData; delete ctx.session.addingSheikhPhone; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sheikhData.phone = text.trim();
    const s = db.addSheikh(ctx.session.sheikhData); delete ctx.session.sheikhData; delete ctx.session.addingSheikhPhone;
    return ctx.reply('✅ *تم إضافة الشيخ!*\n\n👨‍🏫 *' + s.name + '*\n📖 ' + s.specialty, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.settingIBAN) {
    if (text === CANCEL_BUTTON) { delete ctx.session.settingIBAN; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const iban = text.trim().toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return ctx.reply('⚠️ صيغة IBAN غير صحيحة.');
    const mosqueId = resolveMosqueId(ctx.from.id, loadDB());
    if (!mosqueId) { await ctx.reply('⚠️ لم يتم ربطك بمسجد، تعذّر حفظ IBAN'); return; }
    db.setDonationIBAN(mosqueId, iban); delete ctx.session.settingIBAN;
    return ctx.reply('✅ *تم ربط IBAN!*\n\n💳 `' + iban + '`', { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.settingPayPal) {
    if (text === CANCEL_BUTTON) { delete ctx.session.settingPayPal; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const email = text.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.reply('⚠️ البريد الإلكتروني غير صحيح.');
    const mosqueId = resolveMosqueId(ctx.from.id, loadDB());
    if (!mosqueId) { await ctx.reply('⚠️ لم يتم ربطك بمسجد، تعذّر حفظ PayPal'); return; }
    db.setDonationPayPal(mosqueId, email); delete ctx.session.settingPayPal;
    return ctx.reply('✅ *تم ربط PayPal!*\n\n🅿️ `' + email + '`', { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.answeringSecretQuestion) {
    if (text === CANCEL_BUTTON) { delete ctx.session.answeringSecretQuestion; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    const result = db.answerSecretQuestion(ctx.session.answeringSecretQuestion, text.trim(), ctx.user.firstName);
    delete ctx.session.answeringSecretQuestion;
    return ctx.reply(result ? '✅ تم إرسال الإجابة!' : '❌ فشل حفظ الإجابة.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER));
  }
  if (ctx.session.addingCircle) {
    if (text === CANCEL_BUTTON) { delete ctx.session.addingCircle; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.circleData = { name: text.trim() }; ctx.session.addingCircle = false; ctx.session.addingCircleSchedule = true;
    return ctx.reply('✅ الاسم: *' + ctx.session.circleData.name + '*\n\nأدخل الجدول:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingCircleSchedule) {
    if (text === CANCEL_BUTTON) { delete ctx.session.circleData; delete ctx.session.addingCircleSchedule; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.circleData.schedule = text.trim(); ctx.session.addingCircleSchedule = false; ctx.session.addingCircleTopic = true;
    return ctx.reply('✅ الجدول: *' + ctx.session.circleData.schedule + '*\n\nأدخل الموضوع:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.addingCircleTopic) {
    if (text === CANCEL_BUTTON) { delete ctx.session.circleData; delete ctx.session.addingCircleTopic; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.circleData.topic = text.trim(); ctx.session.circleData.createdBy = ctx.from.id;
    const circle = db.addQuranyCircle(ctx.session.circleData); delete ctx.session.circleData; delete ctx.session.addingCircleTopic;
    return ctx.reply('✅ *تم إضافة الحلقة!*\n\n📖 *' + circle.name + '*\n⏰ ' + circle.schedule, { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  if (ctx.session.uploadingSermon) {
    if (text === CANCEL_BUTTON) { delete ctx.session.uploadingSermon; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sermonData = { title: text.trim() }; ctx.session.uploadingSermon = false; ctx.session.uploadingSermonContent = true;
    return ctx.reply('✅ العنوان: *' + ctx.session.sermonData.title + '*\n\nأدخل المحتوى:', { parse_mode: 'Markdown', ...Markup.keyboard([[CANCEL_BUTTON]]).resize() });
  }
  if (ctx.session.uploadingSermonContent) {
    if (text === CANCEL_BUTTON) { delete ctx.session.sermonData; delete ctx.session.uploadingSermonContent; return ctx.reply('❌ تم الإلغاء.', mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER)); }
    ctx.session.sermonData.content = text.trim(); ctx.session.sermonData.uploadedBy = ctx.from.id; ctx.session.sermonData.uploadedByName = ctx.user.firstName;
    const sermon = db.addSermon(ctx.session.sermonData); delete ctx.session.sermonData; delete ctx.session.uploadingSermonContent;
    return ctx.reply('✅ *تم رفع الخطبة!*\n\n📚 *' + sermon.title + '*', { parse_mode: 'Markdown', ...mainKeyboard(ctx.user ? ctx.user.role : ROLES.WORSHIPPER) });
  }
  ctx.reply('❓ لم أفهم هذا الأمر.\n\nاستخدم /menu لإظهار القائمة.');
});

bot.on('photo', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user) return;

  const isAiMode = ctx.session.aiMode ||
    ctx.session.scholarMode ||
    ctx.session.scholarDebateMode ||
    ctx.session.analyzeImage;

  if (!isAiMode) {
    return ctx.reply(
      '📸 أرسلت صورة!\n\nهل تريد أن أحللها؟',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 حلل هذه الصورة', 'analyze_image_now')],
          [Markup.button.callback('❌ إلغاء', 'noop')]
        ])
      }
    );
  }

  if (ctx.session.analyzeImage) delete ctx.session.analyzeImage;
  await handleImageQuestion(ctx, user);
});

bot.on('voice', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user) return;

  const recitationSheikh = require('./handlers/recitationSheikh');
  if (await recitationSheikh.handleRecitationSessionVoice(ctx)) return;
  if (await recitationSheikh.handleRecitationSheikhReply(ctx)) return;

  if (ctx.session.awaitingRecitationVoice) {
    return quran.handleRecitationVoice(ctx);
  }

  const isAiMode = ctx.session.aiMode ||
    ctx.session.scholarMode ||
    ctx.session.scholarDebateMode ||
    ctx.session.analyzeVoice;

  if (!isAiMode) {
    return ctx.reply(
      '🎤 أرسلت رسالة صوتية!\n\nهل تريد أن أفهمها وأجيب؟',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🎤 حلل الرسالة الصوتية', 'analyze_voice_now')],
          [Markup.button.callback('❌ إلغاء', 'noop')]
        ])
      }
    );
  }

  if (ctx.session.analyzeVoice) delete ctx.session.analyzeVoice;
  await handleVoiceQuestion(ctx, user);
});

bot.on('audio', async (ctx) => {
  if (ctx.message.voice) return;
  const user = db.getUser(ctx.from.id);
  if (!user) return;

  const recitationSheikh = require('./handlers/recitationSheikh');
  if (await recitationSheikh.handleRecitationSessionVoice(ctx)) return;
  if (await recitationSheikh.handleRecitationSheikhReply(ctx)) return;

  if (ctx.session.awaitingRecitationVoice) {
    return quran.handleRecitationVoice(ctx);
  }

  const isAiMode = ctx.session.aiMode ||
    ctx.session.scholarMode ||
    ctx.session.scholarDebateMode ||
    ctx.session.analyzeVoice;

  if (!isAiMode) {
    return ctx.reply(
      '🎤 أرسلت ملفاً صوتياً!\n\nهل تريد أن أفهمها وأجيب؟',
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🎤 حلل الرسالة الصوتية', 'analyze_voice_now')],
          [Markup.button.callback('❌ إلغاء', 'noop')]
        ])
      }
    );
  }

  if (ctx.session.analyzeVoice) delete ctx.session.analyzeVoice;
  await handleVoiceQuestion(ctx, user);
});

if (process.env.ENABLE_TEST_SHAHADA === '1') {
  const devTest = require('./dev/testShahadaCommand');
  devTest.registerDevTestCallbacks(bot);
  devTest.logDevTestEnabled();
}

bot.on('callback_query', async (ctx) => {
  console.log(`⚠️ Unhandled button: ${ctx.callbackQuery.data}`);
  await ctx.answerCbQuery('جاري التحديث... حاول مجدداً');
});

// ═══ أوامر المشرف (للمطور) ═══
bot.command('addmod', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user || (user.role !== 'developer' && user.role !== 'DEVELOPER')) {
    return ctx.reply('⛔ هذا الأمر للمطور فقط.');
  }
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply(
      '📝 *طريقة الاستخدام:*\n\n`/addmod USER_ID`\n\nمثال: `/addmod 123456789`',
      { parse_mode: 'Markdown' }
    );
  }
  const targetId = args[1];
  const result = db.addModerator(targetId, String(ctx.from.id));
  if (!result) {
    return ctx.reply('⚠️ هذا المستخدم مشرف بالفعل.');
  }
  try {
    await ctx.telegram.sendMessage(
      targetId,
      `🛡️ *تم تعيينك مشرفاً!*\n\nأنت الآن مشرف في منصة منارة المسلم.\nاكتب /start لرؤية لوحتك. 🤲`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
  await ctx.reply(`✅ تم تعيين ${targetId} مشرفاً بنجاح!`);
});

bot.command('removemod', async (ctx) => {
  const user = db.getUser(ctx.from.id);
  if (!user || (user.role !== 'developer' && user.role !== 'DEVELOPER')) {
    return ctx.reply('⛔ هذا الأمر للمطور فقط.');
  }
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('📝 الاستخدام: `/removemod USER_ID`', { parse_mode: 'Markdown' });
  }
  const targetId = args[1];
  const result = db.removeModerator(targetId);
  if (!result) return ctx.reply('⚠️ هذا المستخدم ليس مشرفاً.');
  await ctx.reply(`✅ تم إزالة ${targetId} من المشرفين.`);
});

bot.catch((err) => {
  const msg = err?.description || err?.message || String(err);
  console.error('❌ Bot error:', msg);
});

module.exports = { bot };

const { Scenes, Markup } = require('telegraf');
const db = require('./database');
const { mainKeyboard, cancelKeyboard, ROLES, ROLE_LABELS, isMenuButton, resetUserState } = require('./keyboards');
const { dispatchMenuButton } = require('./menuHandlers');

// ── مساعدات ──────────────────────────────────────

const PROMPT_UNKNOWN_INPUT = '⚠️ يرجى الضغط على أحد الأزرار أعلاه، أو ❌ إلغاء للخروج.';

function isCancelled(ctx) {
  const txt = ctx.message?.text;
  return txt === '/cancel' || txt === '❌ إلغاء';
}

async function leaveWithCancel(ctx) {
  await ctx.reply('❌ تم إلغاء العملية.', mainKeyboard(ctx.session.userRole || ROLES.WORSHIPPER));
  return ctx.scene.leave();
}

async function handleMenuInterrupt(ctx) {
  const text = ctx.message?.text;
  if (!text || !isMenuButton(text)) return false;
  await resetUserState(ctx);
  try { await ctx.scene.leave(); } catch (e) {}
  return dispatchMenuButton(ctx, text);
}

async function guardTextStep(ctx) {
  if (isCancelled(ctx)) {
    await leaveWithCancel(ctx);
    return true;
  }
  if (await handleMenuInterrupt(ctx)) return true;
  return false;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── مشهد: إضافة درس ──────────────────────────────

const addLessonScene = new Scenes.WizardScene(
  'add-lesson',

  async (ctx) => {
    await ctx.reply(
      '📝 *إضافة درس جديد*\n\nأدخل عنوان الدرس:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const title = ctx.message?.text?.trim();
    if (!title) return ctx.reply('⚠️ يرجى إدخال عنوان صحيح.');
    ctx.wizard.state.title = title;
    await ctx.reply(`✅ العنوان: *${title}*\n\nالآن أدخل محتوى الدرس أو ملخصه:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const content = ctx.message?.text?.trim();
    if (!content) return ctx.reply('⚠️ يرجى إدخال محتوى صحيح.');

    const lesson = db.addLesson({
      title: ctx.wizard.state.title,
      content,
      addedBy: ctx.from.id,
      addedByName: ctx.from.first_name
    });

    await ctx.reply(
      `✅ *تم إضافة الدرس بنجاح!*\n\n📚 *${lesson.title}*\n\n${lesson.content}`,
      { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole) }
    );
    return ctx.scene.leave();
  }
);

// ── مشهد: إضافة إعلان ────────────────────────────

const addAnnouncementScene = new Scenes.WizardScene(
  'add-announcement',

  async (ctx) => {
    await ctx.reply(
      '📢 *إضافة إعلان جديد*\n\nأدخل نص الإعلان:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const text = ctx.message?.text?.trim();
    if (!text) return ctx.reply('⚠️ يرجى إدخال نص صحيح.');
    ctx.wizard.state.text = text;

    await ctx.reply(
      `📢 *معاينة الإعلان:*\n\n${text}\n\nهل تريد نشر هذا الإعلان؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ نعم، انشر', 'ann_confirm'),
          Markup.button.callback('❌ إلغاء', 'ann_cancel')
        ]])
      }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      if (await guardTextStep(ctx)) return;
      return ctx.reply(PROMPT_UNKNOWN_INPUT);
    }

    await ctx.answerCbQuery();

    if (ctx.callbackQuery.data === 'ann_cancel') {
      await ctx.editMessageText('❌ تم إلغاء الإعلان.');
      await ctx.reply('تم الإلغاء.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery.data === 'ann_confirm') {
      db.addAnnouncement({
        text: ctx.wizard.state.text,
        addedBy: ctx.from.id,
        addedByName: ctx.from.first_name
      });
      await ctx.editMessageText('✅ تم نشر الإعلان بنجاح!');
      await ctx.reply('تم حفظ الإعلان.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }
  }
);

// ── مشهد: تحديث مواقيت الصلاة ────────────────────

const PRAYERS = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const PRAYER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_ICONS = ['🌙', '☀️', '🌤️', '🌇', '🌑'];

function validTime(t) {
  return /^\d{1,2}:\d{2}$/.test(t || '');
}

const setPrayerTimesScene = new Scenes.WizardScene(
  'set-prayer-times',

  async (ctx) => {
    ctx.wizard.state.times = {};
    ctx.wizard.state.idx = 0;

    const mosque = db.firstMosque();
    let current = '';
    if (mosque?.prayerTimes?.fajr) {
      const t = mosque.prayerTimes;
      current = `\n\n*المواقيت الحالية:*\n${PRAYER_ICONS.map((ic, i) => `${ic} ${PRAYERS[i]}: ${t[PRAYER_KEYS[i]] || '-'}`).join('\n')}`;
    }

    await ctx.reply(
      `⏰ *تحديث مواقيت الصلاة*${current}\n\nأدخل وقت *${PRAYERS[0]}* (مثال: 05:30):`,
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;

    const time = ctx.message?.text?.trim();
    const idx = ctx.wizard.state.idx;

    if (!validTime(time)) {
      return ctx.reply(`⚠️ صيغة غير صحيحة. أدخل وقت *${PRAYERS[idx]}* بالصيغة HH:MM (مثال: 05:30):`, { parse_mode: 'Markdown' });
    }

    ctx.wizard.state.times[PRAYER_KEYS[idx]] = time;
    ctx.wizard.state.idx++;

    if (ctx.wizard.state.idx < PRAYERS.length) {
      const next = ctx.wizard.state.idx;
      await ctx.reply(
        `✅ ${PRAYER_ICONS[idx]} ${PRAYERS[idx]}: ${time}\n\nأدخل وقت *${PRAYERS[next]}*:`,
        { parse_mode: 'Markdown' }
      );
      // البقاء في نفس الخطوة لاستقبال الصلاة التالية
    } else {
      const mosque = db.firstMosque();
      const mosqueId = mosque?.id || 'default';
      db.saveMosque(mosqueId, { prayerTimes: ctx.wizard.state.times });

      const t = ctx.wizard.state.times;
      await ctx.reply(
        `✅ *تم تحديث مواقيت الصلاة بنجاح!*\n\n${PRAYER_ICONS.map((ic, i) => `${ic} ${PRAYERS[i]}: ${t[PRAYER_KEYS[i]]}`).join('\n')}`,
        { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole) }
      );
      return ctx.scene.leave();
    }
  }
);

// ── مشهد: إضافة مسجد ─────────────────────────────

const addMosqueScene = new Scenes.WizardScene(
  'add-mosque',

  async (ctx) => {
    await ctx.reply(
      '🕌 *إضافة مسجد جديد*\n\nأدخل اسم المسجد:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const name = ctx.message?.text?.trim();
    if (!name) return ctx.reply('⚠️ يرجى إدخال اسم صحيح.');
    ctx.wizard.state.name = name;
    await ctx.reply(`✅ الاسم: *${name}*\n\nأدخل عنوان/موقع المسجد:`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const location = ctx.message?.text?.trim();
    if (!location) return ctx.reply('⚠️ يرجى إدخال موقع صحيح.');

    const id = Date.now().toString();
    const mosque = db.saveMosque(id, {
      name: ctx.wizard.state.name,
      location,
      createdBy: ctx.from.id,
      prayerTimes: {}
    });

    await ctx.reply(
      `✅ *تم إضافة المسجد بنجاح!*\n\n🕌 *${mosque.name}*\n📍 ${mosque.location}`,
      { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole) }
    );
    return ctx.scene.leave();
  }
);

// ── مشهد: إدارة أدوار المستخدمين ────────────────

const manageRoleScene = new Scenes.WizardScene(
  'manage-role',

  async (ctx) => {
    await ctx.reply(
      '👑 *إدارة أدوار المستخدمين*\n\nأدخل معرف المستخدم (Telegram ID):\n\n💡 يمكن للمستخدم معرفة ID الخاص به عبر @userinfobot',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;

    const userId = parseInt(ctx.message?.text?.trim());
    if (!userId || isNaN(userId)) return ctx.reply('⚠️ يرجى إدخال معرف رقمي صحيح.');

    const user = db.getUser(userId);
    if (!user) {
      return ctx.reply(`❌ لم يتم العثور على مستخدم بالمعرف ${userId}.\n\nيجب أن يكون المستخدم قد تحدث مع البوت من قبل.`);
    }

    ctx.wizard.state.targetId = userId;

    await ctx.reply(
      `👤 *المستخدم:* ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}${user.username ? ` (@${user.username})` : ''}\n📋 *الدور الحالي:* ${ROLE_LABELS[user.role]}\n\nاختر الدور الجديد:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🏛️ مسؤول مسجد', 'role_admin'),
            Markup.button.callback('📖 شيخ', 'role_sheikh')
          ],
          [
            Markup.button.callback('🕌 مصلي', 'role_worshipper'),
            Markup.button.callback('❌ إلغاء', 'role_cancel')
          ]
        ])
      }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      if (await guardTextStep(ctx)) return;
      return ctx.reply(PROMPT_UNKNOWN_INPUT);
    }

    await ctx.answerCbQuery();
    const data = ctx.callbackQuery.data;

    if (data === 'role_cancel') {
      await ctx.editMessageText('❌ تم الإلغاء.');
      await ctx.reply('تم الإلغاء.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }

    const roleMap = {
      role_admin: ROLES.ADMIN,
      role_sheikh: ROLES.SHEIKH,
      role_worshipper: ROLES.WORSHIPPER
    };

    const newRole = roleMap[data];
    if (newRole) {
      db.saveUser(ctx.wizard.state.targetId, { role: newRole });
      await ctx.editMessageText(`✅ تم تغيير الدور إلى: ${ROLE_LABELS[newRole]}`);
      await ctx.reply('✅ تم تحديث دور المستخدم بنجاح.', mainKeyboard(ctx.session.userRole));
    }
    return ctx.scene.leave();
  }
);

// ── مشهد: إرسال سؤال ─────────────────────────────

const askQuestionScene = new Scenes.WizardScene(
  'ask-question',

  async (ctx) => {
    await ctx.reply(
      '❓ *إرسال سؤال للشيخ*\n\nاكتب سؤالك وسيتم إرساله:\n\n(سيتم الرد عليك هنا عند الإجابة)',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const text = ctx.message?.text?.trim();
    if (!text) return ctx.reply('⚠️ يرجى إدخال سؤالك.');

    db.addQuestion({
      text,
      askedBy: ctx.from.id,
      askedByName: `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`
    });

    await ctx.reply(
      '✅ *تم إرسال سؤالك بنجاح!*\n\nسيتم الرد عليك قريباً إن شاء الله 🤲',
      { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole) }
    );
    return ctx.scene.leave();
  }
);

// ── مشهد: الإجابة على سؤال ───────────────────────

const answerQuestionScene = new Scenes.WizardScene(
  'answer-question',

  async (ctx) => {
    const questionId = ctx.scene.state.questionId;
    const questions = db.pendingQuestions();
    const q = questions.find(q => q.id === questionId);

    if (!q) {
      await ctx.reply('❌ لم يتم العثور على السؤال أو تمت الإجابة عليه مسبقاً.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.questionId = questionId;
    ctx.wizard.state.askedBy = q.askedBy;
    ctx.wizard.state.questionText = q.text;

    await ctx.reply(
      `❓ *السؤال:*\n${q.text}\n\n👤 *السائل:* ${q.askedByName}\n📅 ${formatDate(q.at)}\n\n✍️ أدخل إجابتك:`,
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const answer = ctx.message?.text?.trim();
    if (!answer) return ctx.reply('⚠️ يرجى إدخال إجابة صحيحة.');

    const answererName = `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`;
    const question = db.answerQuestion(ctx.wizard.state.questionId, answer, answererName);

    if (!question) {
      await ctx.reply('❌ حدث خطأ أثناء الحفظ.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }

    // إشعار السائل بالإجابة
    if (ctx.wizard.state.askedBy !== ctx.from.id) {
      try {
        await ctx.telegram.sendMessage(
          ctx.wizard.state.askedBy,
          `✅ *تم الرد على سؤالك*\n\n❓ *سؤالك:*\n${ctx.wizard.state.questionText}\n\n💬 *الإجابة:*\n${answer}\n\n👤 *أجاب:* ${answererName}`,
          { parse_mode: 'Markdown' }
        );
      } catch {
        // المستخدم ربما حجب البوت
      }
    }

    await ctx.reply('✅ تم إرسال الإجابة للمستخدم بنجاح.', mainKeyboard(ctx.session.userRole));
    return ctx.scene.leave();
  }
);

// ── مشهد: رسالة جماعية ────────────────────────────

const broadcastScene = new Scenes.WizardScene(
  'broadcast',

  async (ctx) => {
    const total = db.allUsers().length;
    await ctx.reply(
      `📣 *إرسال إعلان عام للمساجد*\n\nإجمالي المستخدمين: ${total}\n\nأدخل نص الإعلان:`,
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const text = ctx.message?.text?.trim();
    if (!text) return ctx.reply('⚠️ يرجى إدخال نص صحيح.');
    ctx.wizard.state.text = text;

    await ctx.reply(
      `📣 *معاينة الإعلان العام:*\n\n${text}\n\nهل تريد إرساله لجميع المستخدمين؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ إرسال الآن', 'bc_confirm'),
          Markup.button.callback('❌ إلغاء', 'bc_cancel')
        ]])
      }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      if (await guardTextStep(ctx)) return;
      return ctx.reply(PROMPT_UNKNOWN_INPUT);
    }

    await ctx.answerCbQuery();

    if (ctx.callbackQuery.data === 'bc_cancel') {
      await ctx.editMessageText('❌ تم إلغاء الإرسال.');
      await ctx.reply('تم الإلغاء.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery.data === 'bc_confirm') {
      await ctx.editMessageText('⏳ جاري الإرسال...');

      const users = db.allUsers();
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        if (user.id === ctx.from.id) continue;
        try {
          await ctx.telegram.sendMessage(
            user.id,
            `📣 *إعلان عام من إدارة المسجد*\n\n${ctx.wizard.state.text}`,
            { parse_mode: 'Markdown' }
          );
          sent++;
        } catch {
          failed++;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      await ctx.reply(
        `✅ *اكتمل الإرسال!*\n\n✅ نجح: ${sent}\n❌ فشل: ${failed}`,
        { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole) }
      );
      return ctx.scene.leave();
    }
  }
);

const toggleMosqueScene = new Scenes.WizardScene(
  'toggle-mosque',

  async (ctx) => {
    await ctx.reply(
      '❄️ *تفعيل أو تجميد مسجد*\n\nأدخل معرف المسجد:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const mosqueId = ctx.message?.text?.trim();
    if (!mosqueId) return ctx.reply('⚠️ يرجى إدخال معرف مسجد صحيح.');

    const mosque = db.getMosque(mosqueId);
    if (!mosque) {
      return ctx.reply(`❌ لم يتم العثور على مسجد بالمعرف ${mosqueId}.`);
    }

    ctx.wizard.state.mosqueId = mosqueId;
    const status = mosque.active === false ? 'موقوف' : 'نشط';
    await ctx.reply(
      `🕌 *${mosque.name || 'مسجد'}*\n📍 ${mosque.location || 'غير محدد'}\n📌 الحالة الحالية: ${status}\n\nهل تريد تغيير الحالة؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ نعم', 'toggle_confirm'),
          Markup.button.callback('❌ لا', 'toggle_cancel')
        ]])
      }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      if (await guardTextStep(ctx)) return;
      return ctx.reply(PROMPT_UNKNOWN_INPUT);
    }

    await ctx.answerCbQuery();
    if (ctx.callbackQuery.data === 'toggle_cancel') {
      await ctx.editMessageText('❌ تم إلغاء العملية.');
      await ctx.reply('تم الإلغاء.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }

    const mosqueId = ctx.wizard.state.mosqueId;
    const mosque = db.getMosque(mosqueId);
    if (!mosque) {
      await ctx.reply('❌ المسجد غير موجود.');
      return ctx.scene.leave();
    }

    const updated = db.setMosqueActive(mosqueId, mosque.active === false);
    if (!updated) {
      await ctx.reply('❌ حدث خطأ أثناء تحديث الحالة.');
      return ctx.scene.leave();
    }

    await ctx.editMessageText(`✅ تم تحديث حالة المسجد إلى: ${updated.active ? 'نشط' : 'موقوف'}`);
    await ctx.reply('✅ تم حفظ التحديث بنجاح.', mainKeyboard(ctx.session.userRole));
    return ctx.scene.leave();
  }
);

const deleteMosqueScene = new Scenes.WizardScene(
  'delete-mosque',

  async (ctx) => {
    await ctx.reply(
      '🗑️ *حذف مسجد نهائياً*\n\nأدخل معرف المسجد الذي تريد حذفه:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const mosqueId = ctx.message?.text?.trim();
    if (!mosqueId) return ctx.reply('⚠️ يرجى إدخال معرف مسجد صحيح.');

    const mosque = db.getMosque(mosqueId);
    if (!mosque) {
      return ctx.reply(`❌ لم يتم العثور على مسجد بالمعرف ${mosqueId}.`);
    }

    ctx.wizard.state.mosqueId = mosqueId;
    await ctx.reply(
      `🕌 *${mosque.name || 'مسجد'}*\n📍 ${mosque.location || 'غير محدد'}\n\nهل أنت متأكد أنك تريد حذفه نهائياً؟`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ حذف نهائي', 'delete_confirm'),
          Markup.button.callback('❌ إلغاء', 'delete_cancel')
        ]])
      }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (!ctx.callbackQuery) {
      if (await guardTextStep(ctx)) return;
      return ctx.reply(PROMPT_UNKNOWN_INPUT);
    }

    await ctx.answerCbQuery();
    if (ctx.callbackQuery.data === 'delete_cancel') {
      await ctx.editMessageText('❌ تم إلغاء الحذف.');
      await ctx.reply('تم الإلغاء.', mainKeyboard(ctx.session.userRole));
      return ctx.scene.leave();
    }

    const mosqueId = ctx.wizard.state.mosqueId;
    const deleted = db.deleteMosque(mosqueId);
    if (!deleted) {
      await ctx.reply('❌ حدث خطأ أثناء الحذف.');
      return ctx.scene.leave();
    }

    await ctx.editMessageText('✅ تم حذف المسجد نهائياً.');
    await ctx.reply('✅ تم حذف المسجد بنجاح.', mainKeyboard(ctx.session.userRole));
    return ctx.scene.leave();
  }
);

const addHelpRequestScene = new Scenes.WizardScene(
  'add-help-request',

  async (ctx) => {
    await ctx.reply(
      '🆘 *طلب مساعدة محلية*\n\nأدخل اسمك:',
      { parse_mode: 'Markdown', ...cancelKeyboard() }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const name = ctx.message?.text?.trim();
    if (!name) return ctx.reply('⚠️ يرجى إدخال اسمك.');
    ctx.wizard.state.name = name;
    await ctx.reply(`✅ الاسم: *${name}*\n\nأدخل رقم هاتفك (اختياري):`, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const phone = ctx.message?.text?.trim() === 'اختياري' ? '' : ctx.message?.text?.trim();
    ctx.wizard.state.phone = phone;
    await ctx.reply(
      `✅ ${ctx.wizard.state.phone ? `الهاتف: ${ctx.wizard.state.phone}` : 'بدون رقم هاتف'}\n\nصف المساعدة التي تحتاجها:`,
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  async (ctx) => {
    if (await guardTextStep(ctx)) return;
    const description = ctx.message?.text?.trim();
    if (!description) return ctx.reply('⚠️ يرجى وصف احتياجك.');

    db.addHelpRequest({
      name: ctx.wizard.state.name,
      phone: ctx.wizard.state.phone || '',
      description
    });

    await ctx.reply(
      `✅ *تم استقبال طلبك بنجاح!*\n\nشكراً على تواصلك معنا.\n\nسيتم التواصل معك قريباً إن شاء الله 🤲`,
      { parse_mode: 'Markdown', ...mainKeyboard(ctx.session.userRole) }
    );
    return ctx.scene.leave();
  }
);

const scholarApplyScene = require('./scenes/scholarApplyScene');

module.exports = {
  scenes: [
    scholarApplyScene,
    addLessonScene,
    addAnnouncementScene,
    setPrayerTimesScene,
    addMosqueScene,
    manageRoleScene,
    askQuestionScene,
    answerQuestionScene,
    broadcastScene,
    toggleMosqueScene,
    deleteMosqueScene,
    addHelpRequestScene
  ]
};

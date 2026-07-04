/**
 * ترجمة الواجهة حسب لغة جهاز تيليغرام (language_code)
 */
const crypto = require('crypto');
const db = require('../database');
const geminiService = require('../services/gemini');
const { CANCEL_BUTTON, MENU_BUTTONS } = require('../keyboards');
const { STATIC_MENU_LABELS, translateStaticLabel } = require('../data/menuTranslations');
const { getInlineLabel } = require('./inlineLabels');
const { getPhrase, welcomeMessage } = require('./phrases');
const {
  getLangMeta,
  getUiLangDisplayName,
  getMenuHint,
  getLanguagePickerPageCount,
  getLanguagePickerPageCodes
} = require('./languagePickerOptions');

const SUPPORTED = new Set(['de', 'en', 'tr', 'fr', 'es', 'it', 'nl', 'ru', 'pl', 'ur', 'fa', 'id', 'ms']);

function getDeviceLang(ctx) {
  const sessionLang = ctx?.session?.uiLang;
  if (sessionLang && sessionLang !== 'ar') return sessionLang;

  const userLang = ctx?.user?.uiLang;
  if (userLang && userLang !== 'ar') return userLang;

  const code = ctx?.from?.language_code;
  if (!code) return 'ar';
  const lang = code.split('-')[0].toLowerCase();
  return lang === 'ar' ? 'ar' : lang;
}

function setUserUiLang(ctx, langCode) {
  const lang = (langCode || 'ar').split('-')[0].toLowerCase();
  if (ctx.session) ctx.session.uiLang = lang;
  if (ctx.from?.id) {
    const db = require('../database');
    ctx.user = db.saveUser(ctx.from.id, { uiLang: lang });
  }
  syncReverseMaps(ctx, lang);
  return lang;
}

function getUserLangCode(ctx) {
  return getDeviceLang(ctx);
}

function hashText(text) {
  return crypto.createHash('md5').update(text).digest('hex').slice(0, 16);
}

function isArabicMenuLabel(label) {
  return typeof label === 'string' && /[\u0600-\u06FF]/.test(label);
}

function syncReverseMaps(ctx, lang) {
  if (!ctx.session || lang === 'ar') return;
  const map = { ...(ctx.session.uiButtonMap || {}) };

  const menuLabels = STATIC_MENU_LABELS[lang] || {};
  for (const [arabic, translated] of Object.entries(menuLabels)) {
    if (map[translated] === undefined) map[translated] = arabic;
  }

  const dbMap = db.get('ui_translations')?.[lang] || {};
  for (const [key, translated] of Object.entries(dbMap)) {
    if (!key.startsWith('menu_')) continue;
    const arabic = key.slice(5);
    if (!MENU_BUTTONS.has(arabic)) continue;
    if (map[translated] === undefined) map[translated] = arabic;
  }

  ctx.session.uiButtonMap = map;
}

function hydrateUiButtonMap(ctx) {
  syncReverseMaps(ctx, getDeviceLang(ctx));
}

async function translateUILabelViaGemini(lang, label, { requireMenuButton = false } = {}) {
  if (!label || !isArabicMenuLabel(label)) return null;
  if (requireMenuButton && !MENU_BUTTONS.has(label)) return null;
  const key = 'menu_' + label;
  const cached = db.get('ui_translations')?.[lang]?.[key];
  if (cached) return cached;
  try {
    const langName = getUiLangDisplayName(lang);
    const systemInstruction =
      `أنت مترجم واجهة فقط. ترجم نص الزر التالي بدقة من العربية إلى ${langName} (رمز ISO: ${lang}) مع الحفاظ على الرموز التعبيرية (emoji) في نفس موضعها. أعد فقط النص المترجم بدون شرح أو علامات تنصيص.`;
    const { text: raw } = await geminiService.askGemini(label, systemInstruction);
    const translated = (raw || '').trim() || label;
    const updated = db.get('ui_translations') || {};
    if (!updated[lang]) updated[lang] = {};
    updated[lang][key] = translated;
    db.set('ui_translations', updated);
    return translated;
  } catch (e) {
    console.error('translateUILabelViaGemini error:', e.message);
    return null;
  }
}

async function translateMenuLabelViaGemini(lang, label) {
  return translateUILabelViaGemini(lang, label, { requireMenuButton: true });
}

async function localizeMarkupSync(ctx, extra, lang) {
  if (!extra?.reply_markup || lang === 'ar') return extra;

  const markup = { ...extra.reply_markup };
  const labelMap = { ...(ctx.session?.uiButtonMap || {}) };

  if (markup.keyboard) {
    markup.keyboard = await Promise.all(markup.keyboard.map((row) =>
      Promise.all(row.map(async (label) => {
        if (typeof label !== 'string') return label;
        let next = translateStaticLabel(lang, label);
        if (!next && isArabicMenuLabel(label)) {
          const key = 'menu_' + label;
          next = db.get('ui_translations')?.[lang]?.[key] || null;
        }
        if (!next && isArabicMenuLabel(label)) next = await translateMenuLabelViaGemini(lang, label);
        next = next || label;
        if (next !== label) labelMap[next] = label;
        return next;
      }))
    ));
  }

  if (markup.inline_keyboard) {
    markup.inline_keyboard = await Promise.all(markup.inline_keyboard.map((row) =>
      Promise.all(row.map(async (btn) => {
        if (!btn?.callback_data) return btn;
        if (/^(quran_set_lang_|quran_lang_page_)/.test(btn.callback_data) || btn.callback_data === 'quran_show_languages') {
          return btn;
        }
        const byCb = getInlineLabel(lang, btn.callback_data);
        if (byCb) return { ...btn, text: byCb };
        let byText = translateStaticLabel(lang, btn.text);
        if (!byText && isArabicMenuLabel(btn.text)) {
          byText = await translateUILabelViaGemini(lang, btn.text);
        }
        if (byText && byText !== btn.text) return { ...btn, text: byText };
        return btn;
      }))
    ));
  }

  if (ctx.session) ctx.session.uiButtonMap = labelMap;
  return { ...extra, reply_markup: markup };
}

async function localizeMessage(ctx, text, lang) {
  if (!text || typeof text !== 'string' || lang === 'ar') return text;

  const phrase = getPhrase(lang, text);
  if (phrase) return phrase;

  const key = 'msg_' + hashText(text);
  const cached = db.get('ui_translations')?.[lang]?.[key];
  if (cached) return cached;

  try {
    const systemInstruction =
      `أنت مترجم واجهة فقط. ترجم النص من العربية إلى "${lang}". ` +
      'حافظ على Markdown والرموز التعبيرية. أعد النص المترجم فقط بدون شرح.';
    const { text: raw } = await geminiService.askGemini(text, systemInstruction);
    const translated = (raw || '').trim() || text;
    const updated = db.get('ui_translations') || {};
    if (!updated[lang]) updated[lang] = {};
    updated[lang][key] = translated;
    db.set('ui_translations', updated);
    return translated;
  } catch (e) {
    console.error('localizeMessage error:', e.message);
    return text;
  }
}

function resolveIncomingButtonText(ctx, text) {
  if (!text || typeof text !== 'string') return text;

  const { normalizeMenuButton } = require('../keyboards');
  const normalized = normalizeMenuButton(text);
  if (normalized !== text) return normalized;

  if (ctx.session?.uiButtonMap?.[text]) return ctx.session.uiButtonMap[text];

  hydrateUiButtonMap(ctx);
  if (ctx.session?.uiButtonMap?.[text]) return ctx.session.uiButtonMap[text];

  const lang = getDeviceLang(ctx);
  if (lang === 'ar') return text;

  const langMap = db.get('ui_translations')?.[lang] || {};
  for (const [key, translated] of Object.entries(langMap)) {
    if (translated !== text || !key.startsWith('menu_')) continue;
    const arabic = key.slice(5);
    if (MENU_BUTTONS.has(arabic)) return arabic;
  }

  const menuLabels = STATIC_MENU_LABELS[lang] || {};
  for (const [arabic, translated] of Object.entries(menuLabels)) {
    if (translated === text) return arabic;
  }

  if (text === menuLabels[CANCEL_BUTTON] || text === STATIC_MENU_LABELS[lang]?.[CANCEL_BUTTON]) {
    return CANCEL_BUTTON;
  }

  return text;
}

function normalizeOutgoingArgs(text, extra) {
  if (extra === undefined && text && typeof text === 'object' && text.reply_markup) {
    return { messageText: undefined, options: text };
  }
  return { messageText: text, options: extra };
}

function stripUiPrepFlags(extra) {
  if (!extra || typeof extra !== 'object') return extra;
  const out = { ...extra };
  delete out.skipTextTranslation;
  delete out.skipMarkupLocalization;
  delete out._uiLocalePrepared;
  return out;
}

async function prepareOutgoing(ctx, text, extra) {
  if (extra?._uiLocalePrepared) {
    return { text, extra: stripUiPrepFlags(extra) };
  }

  const skipTextTranslation = extra?.skipTextTranslation === true;
  const skipMarkupLocalization = extra?.skipMarkupLocalization === true;
  let outExtra = stripUiPrepFlags(extra);

  const lang = getDeviceLang(ctx);
  let outText = text;
  if (lang !== 'ar' && !skipTextTranslation && typeof text === 'string' && text.trim()) {
    outText = await localizeMessage(ctx, text, lang);
  }

  if (outExtra?.reply_markup && !skipMarkupLocalization) {
    outExtra = await localizeMarkupSync(ctx, outExtra, lang);
  }

  if (outExtra && typeof outExtra === 'object') {
    outExtra._uiLocalePrepared = true;
  }

  return { text: outText, extra: outExtra };
}

async function localizedMainKeyboard(ctx, role) {
  const { mainKeyboard } = require('../keyboards');
  const lang = getDeviceLang(ctx);
  const kbd = mainKeyboard(role);
  if (lang === 'ar') return kbd;
  return await localizeMarkupSync(ctx, kbd, lang);
}

async function sendReplyKeyboard(ctx, text, keyboardObj, opts = {}) {
  const lang = getDeviceLang(ctx);
  let extra = { ...opts };
  if (keyboardObj?.reply_markup) {
    extra.reply_markup = keyboardObj.reply_markup;
  } else if (keyboardObj) {
    Object.assign(extra, keyboardObj);
  }
  if (lang !== 'ar') {
    extra = await localizeMarkupSync(ctx, extra, lang);
  }
  const msg = lang === 'ar' ? text : (await localizeMessage(ctx, text, lang));
  return ctx.telegram.sendMessage(ctx.chat.id, msg, {
    parse_mode: opts.parse_mode,
    reply_markup: extra.reply_markup
  });
}

function languagePickerKeyboard(page = 0) {
  const { Markup } = require('telegraf');
  const safePage = Math.max(0, Math.min(page, getLanguagePickerPageCount() - 1));
  const langs = getLanguagePickerPageCodes(safePage);
  const rows = [];

  for (let i = 0; i < langs.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, langs.length); j++) {
      const { code, label, flag } = getLangMeta(langs[j]);
      row.push(Markup.button.callback(`${flag} ${label}`, `ui_lang_${code}`));
    }
    rows.push(row);
  }

  rows.push([Markup.button.callback('🇸🇦 العربية', 'ui_lang_ar')]);

  const totalPages = getLanguagePickerPageCount();
  const nav = [];
  if (safePage > 0) {
    nav.push(Markup.button.callback('⬅️ رجوع', `ui_lang_page_${safePage - 1}`));
  }
  if (safePage < totalPages - 1) {
    nav.push(Markup.button.callback('➡️ لغات أخرى', `ui_lang_page_${safePage + 1}`));
  }
  if (nav.length) rows.push(nav);

  return Markup.inlineKeyboard(rows);
}

async function handleUiLangPage(ctx, page) {
  const safePage = Math.max(0, Math.min(page, getLanguagePickerPageCount() - 1));
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageReplyMarkup(languagePickerKeyboard(safePage).reply_markup);
  return safePage;
}

async function applyUiLanguage(ctx, langCode) {
  const lang = setUserUiLang(ctx, langCode);
  const role = ctx.user?.role || ctx.session?.userRole || 'worshipper';
  const { mainKeyboard } = require('../keyboards');

  await ctx.answerCbQuery(`✅ ${getUiLangDisplayName(lang)}`).catch(() => {});

  await sendReplyKeyboard(ctx, getMenuHint(lang), mainKeyboard(role));
  return lang;
}

async function translateText(ctx, _key, arabicText) {
  return localizeMessage(ctx, arabicText, getDeviceLang(ctx));
}

async function translateKeyboard(ctx, keyboardObj, langCode) {
  const lang = langCode || getDeviceLang(ctx);
  return await localizeMarkupSync(ctx, keyboardObj, lang);
}

function isUserChat(ctx, chatId) {
  if (!ctx.from || chatId == null) return false;
  const id = String(chatId);
  return id === String(ctx.from.id) || (ctx.chat && id === String(ctx.chat.id));
}

function wrapTelegramApi(ctx, telegram) {
  const originalSendMessage = telegram.sendMessage.bind(telegram);
  const originalEditMessageText = telegram.editMessageText?.bind(telegram);
  const originalEditMessageReplyMarkup = telegram.editMessageReplyMarkup?.bind(telegram);
  const originalEditMessageCaption = telegram.editMessageCaption?.bind(telegram);
  const originalSendPhoto = telegram.sendPhoto?.bind(telegram);

  telegram.sendMessage = async (chatId, text, extra) => {
    if (isUserChat(ctx, chatId)) {
      const out = await prepareOutgoing(ctx, text, extra);
      return originalSendMessage(chatId, out.text, out.extra);
    }
    return originalSendMessage(chatId, text, extra);
  };

  if (originalEditMessageText) {
    telegram.editMessageText = async (...args) => {
      const copy = [...args];
      const chatId = copy[0];
      let textIdx = -1;
      if (typeof copy[2] === 'string') textIdx = 2;
      else if (typeof copy[3] === 'string') textIdx = 3;
      if (textIdx >= 0 && isUserChat(ctx, chatId)) {
        const out = await prepareOutgoing(ctx, copy[textIdx], copy[textIdx + 1]);
        copy[textIdx] = out.text;
        if (out.extra !== undefined) copy[textIdx + 1] = out.extra;
        return originalEditMessageText(...copy);
      }
      return originalEditMessageText(...args);
    };
  }

  if (originalEditMessageReplyMarkup) {
    telegram.editMessageReplyMarkup = async (...args) => {
      const chatId = args[0];
      const extraIdx = args.length - 1;
      if (isUserChat(ctx, chatId) && args[extraIdx] && typeof args[extraIdx] === 'object') {
        const out = await prepareOutgoing(ctx, '', args[extraIdx]);
        const copy = [...args];
        copy[extraIdx] = out.extra;
        return originalEditMessageReplyMarkup(...copy);
      }
      return originalEditMessageReplyMarkup(...args);
    };
  }

  if (originalEditMessageCaption) {
    telegram.editMessageCaption = async (...args) => {
      const copy = [...args];
      const chatId = copy[0];
      let captionIdx = -1;
      if (typeof copy[2] === 'string') captionIdx = 2;
      else if (typeof copy[3] === 'string') captionIdx = 3;
      if (captionIdx >= 0 && isUserChat(ctx, chatId)) {
        const out = await prepareOutgoing(ctx, copy[captionIdx], copy[captionIdx + 1]);
        copy[captionIdx] = out.text;
        if (out.extra !== undefined) copy[captionIdx + 1] = out.extra;
        return originalEditMessageCaption(...copy);
      }
      return originalEditMessageCaption(...args);
    };
  }

  if (originalSendPhoto) {
    telegram.sendPhoto = async (chatId, photo, extra) => {
      if (isUserChat(ctx, chatId)) {
        const out = await prepareOutgoing(ctx, extra?.caption ?? '', extra);
        return originalSendPhoto(chatId, photo, out.extra);
      }
      return originalSendPhoto(chatId, photo, extra);
    };
  }
}

module.exports = {
  getDeviceLang,
  getUserLangCode,
  setUserUiLang,
  welcomeMessage,
  translateText,
  translateKeyboard,
  hydrateUiButtonMap,
  resolveIncomingButtonText,
  normalizeOutgoingArgs,
  prepareOutgoing,
  localizedMainKeyboard,
  sendReplyKeyboard,
  languagePickerKeyboard,
  handleUiLangPage,
  applyUiLanguage,
  localizeMarkupSync,
  localizeMessage,
  translateMenuLabelViaGemini,
  isUserChat,
  wrapTelegramApi
};

/** عبارات شائعة — ترجمة فورية بدون Gemini */
const PHRASES = {
  de: {
    '❌ تم الإلغاء.': '❌ Abgebrochen.',
    '❌ تم إلغاء العملية.': '❌ Vorgang abgebrochen.',
    'القائمة الرئيسية:': 'Hauptmenü:',
    'اختر من القائمة أدناه:': 'Wählen Sie aus dem Menü unten:',
    '⛔ ليس لديك صلاحية.': '⛔ Keine Berechtigung.',
    '✅ تم إرسال الإجابة!': '✅ Antwort gesendet!',
    '❌ فشل حفظ الإجابة.': '❌ Speichern fehlgeschlagen.',
    '🕌 *مساعدة بوت المسجد*\n\n/start - بدء البوت\n/help - المساعدة\n/cancel - إلغاء':
      '🕌 *Moschee-Bot Hilfe*\n\n/start - Start\n/help - Hilfe\n/cancel - Abbrechen'
  },
  en: {
    '❌ تم الإلغاء.': '❌ Cancelled.',
    '❌ تم إلغاء العملية.': '❌ Operation cancelled.',
    'القائمة الرئيسية:': 'Main menu:',
    'اختر من القائمة أدناه:': 'Choose from the menu below:',
    '⛔ ليس لديك صلاحية.': '⛔ You do not have permission.',
    '✅ تم إرسال الإجابة!': '✅ Answer sent!',
    '❌ فشل حفظ الإجابة.': '❌ Failed to save answer.',
    '🕌 *مساعدة بوت المسجد*\n\n/start - بدء البوت\n/help - المساعدة\n/cancel - إلغاء':
      '🕌 *Mosque Bot Help*\n\n/start - Start\n/help - Help\n/cancel - Cancel'
  },
  tr: {
    '❌ تم الإلغاء.': '❌ İptal edildi.',
    'القائمة الرئيسية:': 'Ana menü:',
    'اختر من القائمة أدناه:': 'Aşağıdaki menüden seçin:',
    '⛔ ليس لديك صلاحية.': '⛔ Yetkiniz yok.'
  },
  fr: {
    '❌ تم الإلغاء.': '❌ Annulé.',
    'القائمة الرئيسية:': 'Menu principal:',
    'اختر من القائمة أدناه:': 'Choisissez dans le menu ci-dessous:',
    '⛔ ليس لديك صلاحية.': '⛔ Pas d\'autorisation.'
  }
};

const ROLE_LABELS_I18N = {
  de: {
    developer: '👑 Systementwickler',
    admin: '🏛️ Moschee-Administrator',
    sheikh: '📖 Scheich / Imam',
    worshipper: '🕌 Gläubiger'
  },
  en: {
    developer: '👑 System Developer',
    admin: '🏛️ Mosque Admin',
    sheikh: '📖 Sheikh / Imam',
    worshipper: '🕌 Worshipper'
  },
  tr: {
    developer: '👑 Geliştirici',
    admin: '🏛️ Cami Yöneticisi',
    sheikh: '📖 Şeyh / İmam',
    worshipper: '🕌 Cemaat'
  },
  fr: {
    developer: '👑 Développeur',
    admin: '🏛️ Admin mosquée',
    sheikh: '📖 Cheikh / Imam',
    worshipper: '🕌 Fidèle'
  }
};

function getRoleLabel(lang, role) {
  return ROLE_LABELS_I18N[lang]?.[role] || null;
}

function getPhrase(lang, arabicText) {
  if (!lang || lang === 'ar' || !arabicText) return arabicText;
  return PHRASES[lang]?.[arabicText] || null;
}

function welcomeMessage(lang, firstName, roleLabel) {
  const templates = {
    ar: `السلام عليكم ورحمة الله وبركاته 🕌\n\nأهلاً بك *${firstName}*!\nمرحباً في بوت إدارة المسجد.\n\n🏷️ صلاحيتك: ${roleLabel}\n\nاختر من القائمة أدناه:`,
    de: `As-salamu alaykum 🕌\n\nWillkommen *${firstName}*!\nWillkommen im Moschee-Verwaltungsbot.\n\n🏷️ Ihre Rolle: ${roleLabel}\n\nWählen Sie aus dem Menü unten:`,
    en: `As-salamu alaykum 🕌\n\nWelcome *${firstName}*!\nWelcome to the mosque management bot.\n\n🏷️ Your role: ${roleLabel}\n\nChoose from the menu below:`,
    tr: `As-salamu alaykum 🕌\n\nHoş geldin *${firstName}*!\nCami yönetim botuna hoş geldiniz.\n\n🏷️ Rolünüz: ${roleLabel}\n\nAşağıdaki menüden seçin:`,
    fr: `As-salamu alaykum 🕌\n\nBienvenue *${firstName}*!\nBienvenue sur le bot de gestion de la mosquée.\n\n🏷️ Votre rôle: ${roleLabel}\n\nChoisissez dans le menu ci-dessous:`
  };
  return templates[lang] || templates.ar;
}

module.exports = { PHRASES, getPhrase, getRoleLabel, welcomeMessage };

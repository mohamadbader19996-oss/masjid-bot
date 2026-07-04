const fs = require('fs');
const path = require('path');
const { Markup } = require('telegraf');

function assertKeyboard(name, keyboard) {
  const markup = keyboard?.reply_markup;
  if (!markup?.inline_keyboard?.length) {
    throw new Error(name + ': inline_keyboard missing or empty');
  }
  for (const row of markup.inline_keyboard) {
    if (!Array.isArray(row) || !row.length) {
      throw new Error(name + ': empty keyboard row');
    }
    for (const btn of row) {
      if (!btn.text || !btn.callback_data) {
        throw new Error(name + ': button missing text or callback_data');
      }
    }
  }
  return markup.inline_keyboard.map((row) => row.map((b) => b.text + ' → ' + b.callback_data));
}

const quranMenuKb = Markup.inlineKeyboard([
  [Markup.button.callback('📜 قائمة السور', 'quran_show_surahs')],
  [Markup.button.callback('🎙️ القارئ: test', 'quran_show_reciters')],
  [Markup.button.callback('🌍 اللغة: test', 'quran_show_languages')],
  [Markup.button.callback('🔎 بحث في القرآن', 'quran_search_prompt')],
  [Markup.button.callback('🎓 وضع الحافظ', 'quran_hafiz_prompt')],
  [Markup.button.callback('👴 الوضع المبسط: test', 'quran_toggle_simple')],
]);

const promptHafizKb = Markup.inlineKeyboard([
  [Markup.button.callback('🔢 آية محددة', 'quran_hafiz_ayah_choice')],
  [Markup.button.callback('📄 قراءة صفحة', 'quran_hafiz_page_prompt')],
  [Markup.button.callback('🖼️ عرض الصفحة بشكل المصحف', 'quran_mushaf_page_prompt')],
  [Markup.button.callback('🔙 رجوع', 'quran_menu')],
]);

const source = fs.readFileSync(path.join(__dirname, 'src', 'handlers', 'quran.js'), 'utf8');

if (source.includes("'📄 صفحة المصحف الأصلية'")) {
  throw new Error('quranMenu still contains mushaf button in main menu');
}
if (!source.includes("'🖼️ عرض الصفحة بشكل المصحف', 'quran_mushaf_page_prompt'")) {
  throw new Error('promptHafiz missing renamed mushaf button');
}

console.log('=== quranMenu() keyboard ===');
console.log(assertKeyboard('quranMenu', quranMenuKb).join('\n'));
console.log('OK: no mushaf button in main menu');

console.log('\n=== promptHafiz() keyboard ===');
console.log(assertKeyboard('promptHafiz', promptHafizKb).join('\n'));
console.log('OK: mushaf button present in hafiz menu');

console.log('\nAll keyboard self-tests passed.');

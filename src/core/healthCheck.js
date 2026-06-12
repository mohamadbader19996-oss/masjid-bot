const fs = require('fs');
const path = require('path');

process.env.ACTION_REGISTRY_SILENT = '1';
require('./loadHandlers');
const registry = require('./actionRegistry');
const { MENU_BUTTONS } = require('../keyboards');

const SRC_DIR = path.join(__dirname, '..');

const SCENE_CALLBACKS = new Set([
  'ann_confirm', 'ann_cancel',
  'role_admin', 'role_sheikh', 'role_worshipper', 'role_cancel',
  'bc_confirm', 'bc_cancel',
  'toggle_confirm', 'toggle_cancel',
  'delete_confirm', 'delete_cancel'
]);

const DYNAMIC_CALLBACK_PREFIXES = [
  'quran_read_', 'quran_page_', 'quran_set_lang_', 'quran_set_reciter_',
  'quran_tafsir_', 'quran_hafiz_repeat_', 'quran_hafiz_next_',
  'sheikh_delete_', 'help_resolve_', 'secret_answer_', 'circle_manage_',
  'circle_delete_', 'circle_members_', 'circle_edit_', 'circle_waitlist_',
  'quran_lang_', 'quran_surah_', 'answer_', 'ai_pick_sheikh_',
  'ai_religion_', 'ai_sect_', 'ai_madhab_', 'ai_khutbah_lang_'
];

const IGNORED_FILES = new Set(['sheikh_panel.js']);

function readFilesRecursive(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'core') {
      readFilesRecursive(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !IGNORED_FILES.has(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function extractCallbackDataFromSource(content) {
  const found = new Set();
  const patterns = [
    /button\.callback\([^,]+,\s*['"`]([^'"`]+)['"`]/g,
    /button\.callback\([^,]+,\s*`([^`]+)`/g
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(content)) !== null) {
      found.add(match[1]);
    }
  }
  return found;
}

function matchesAnyRegisteredPattern(callbackData) {
  if (registry.matchesCallback(callbackData)) return true;
  if (SCENE_CALLBACKS.has(callbackData)) return true;
  return DYNAMIC_CALLBACK_PREFIXES.some((prefix) => callbackData.startsWith(prefix));
}

function checkAllButtons() {
  const missingHandlers = [];
  const missingMenus = [];

  for (const label of MENU_BUTTONS) {
    if (!registry.hasMenuHandler(label)) {
      missingMenus.push(label);
    }
  }

  const allCallbacks = new Set();
  for (const file of readFilesRecursive(SRC_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const cb of extractCallbackDataFromSource(content)) {
      allCallbacks.add(cb);
    }
  }

  for (const callbackData of allCallbacks) {
    if (!matchesAnyRegisteredPattern(callbackData)) {
      missingHandlers.push(callbackData);
    }
  }

  console.log('🔍 Health check complete');
  console.log(`   Actions: ${registry.getRegisteredActionPatterns().length}`);
  console.log(`   Menus: ${registry.getRegisteredMenuLabels().length}`);
  console.log(`   Callbacks in source: ${allCallbacks.size}`);

  if (missingMenus.length) {
    console.warn('⚠️ Menu buttons without handlers:');
    missingMenus.forEach((label) => console.warn(`   - ${label}`));
  }

  if (missingHandlers.length) {
    console.warn('⚠️ callback_data without handlers:');
    missingHandlers.forEach((cb) => console.warn(`   - ${cb}`));
  }

  if (!missingMenus.length && !missingHandlers.length) {
    console.log('✅ All buttons have registered handlers');
  }

  const hasErrors = missingMenus.length > 0 || missingHandlers.length > 0;
  process.exit(hasErrors ? 1 : 0);
}

checkAllButtons();

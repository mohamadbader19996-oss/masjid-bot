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
  'delete_confirm', 'delete_cancel',
  'scope_mosque', 'scope_nearby', 'scope_country', 'scope_global',
  'pay_iban', 'pay_paypal', 'pay_manual', 'pay_both',
  'lang_ar', 'lang_de', 'lang_tr', 'lang_ur', 'lang_en', 'lang_fr', 'lang_nl', 'lang_bn', 'lang_custom', 'lang_done',
  'spec_fiqh', 'spec_tafsir', 'spec_aqida', 'spec_khitaba', 'spec_hifz', 'spec_tajweed', 'spec_general',
  'skip_photo',
  'join_w_skip_age', 'join_w_skip_contact'
]);

const DYNAMIC_CALLBACK_PREFIXES = [
  'quran_read_', 'quran_page_', 'quran_surah_page_', 'quran_set_lang_', 'quran_set_reciter_',
  'quran_tafsir_', 'quran_tafsir_src_', 'quran_ayah_play_', 'quran_glossary_',
  'quran_listen_full_', 'quran_listen_next_',
  'quran_hafiz_repeat_', 'quran_hafiz_next_', 'quran_toggle_simple',
  'mushaf_nav_', 'mushaf_surah_pick_', 'mushaf_surah_page_', 'mushaf_juz_',
  'mushaf_listen_', 'mushaf_glossary_', 'mushaf_tafsir_', 'mushaf_theme_toggle_', 'mushaf_open', 'mushaf_index',
  'mushaf_browse_surah', 'mushaf_browse_juz',
  'quran_search_go_', 'quran_search_page_',
  'sheikh_delete_', 'help_resolve_', 'help_broadcast_start_', 'help_scope_',
  'help_claim_', 'help_complete_', 'help_broadcast_edit_', 'help_broadcast_confirm_',
  'help_req_page_', 'secret_answer_', 'circle_manage_',
  'circle_delete_', 'circle_members_', 'circle_edit_', 'circle_waitlist_',
  'quran_lang_page_', 'quran_lang_', 'quran_surah_', 'answer_', 'ai_pick_sheikh_',
  'ai_religion_', 'ai_sect_', 'ai_madhab_', 'ai_khutbah_lang_', 'ui_lang_', 'ui_lang_page_',
  'approve_join_', 'reject_join_',
  'approve_mosque_', 'reject_mosque_',
  'approve_campaign_', 'reject_campaign_',
  'approve_campaign_nearby_', 'reject_campaign_nearby_',
  'ma_confirm_remove_', 'ma_do_remove_', 'ma_pick_campaign_',
  'ma_approve_event_', 'ma_reject_event_', 'ev_scope_',
  'ev_approve_mosque_', 'ev_reject_mosque_', 'ev_approvals_', 'ev_attend_',
  'ev_aud_', 'ev_share_',
  'mc_reply_', 'mc_resolve_', 'mc_progress_',
  'complaint_',
  'lg_type_', 'lg_action_', 'lg_status_', 'lg_note_', 'logistics_menu', 'lg_my_reports', 'lg_manage_reports',
  'pm_type_', 'pm_reply_', 'pm_my_messages', 'cancel_dev_reply',
  'ic_confirm_', 'ic_change_', 'ic_leave_',
  'badge_panel_', 'badge_toggle_', 'manage_mosque_',
  'badge_grant_', 'badge_ignore_',
  'register_union_',
  'sr_lang_', 'sr_arabic_', 'sr_both_', 'sr_lang_menu_', 'mosque_admin_panel_',
  'country_select_', 'country_page_',
  'shahada_schedule_', 'shahada_note_skip_', 'shahada_confirm_',
  'shahada_gender_male_', 'shahada_gender_female_',
  'vol_gender_male', 'vol_gender_female', 'vol_types_back',
  'companion_confirm_', 'companion_reject_',
  'journey_done_', 'journey_skip_', 'journey_ask_',
  'journey_transfer_pick_', 'journey_transfer_',
  'rec_pick_sheikh_', 'rec_sheikh_approve_', 'rec_sheikh_reject_', 'rec_session_done_',
  'rec_ma_vol_approve_', 'rec_ma_vol_reject_', 'rec_dev_vol_approve_', 'rec_dev_vol_reject_',
  'ma_rec_vol_approve_', 'ma_rec_vol_reject_', 'ma_rec_vol_pause_',
  'rec_vol_promote_',
  'ma_worshippers_', 'kick_worshipper_',
  'mosque_country_', 'modapp_country_',
  'mod_app_approve_', 'mod_app_reject_', 'mod_app_details_',
  'kick_moderator_', 'kick_moderator_confirm_', 'kick_moderator_cancel',
  'hstats_p_', 'hstats_n_', 'hstats_ty_', 'hstats_tm_', 'hstats_yp_', 'hstats_yn_',
  'harch_r_', 'harch_c_', 'harch_back',
  'hisn_list_page_', 'hisn_view_', 'hisn_search_start',
  'hadith_qudsi_', 'hadith_books_list', 'hadith_daif_books', 'hadith_book_', 'hadith_daif_',
  'hadith_search_grade', 'hadith_search_sanad', 'hadith_menu_back', 'hadith_show_',
  'hadith_sections_', 'hadith_section_open_', 'hadith_search_in_book_',
  'quotes_wisdom_', 'quotes_scholars_', 'quotes_poetry_', 'quotes_menu_back',
  'quotes_search_start', 'quotes_search_page_', 'quote_fav_add_', 'quote_fav_remove_', 'quotes_favorites_',
  'tasbih_tap', 'tasbih_reset_current', 'tasbih_menu', 'tasbih_end', 'tasbih_select_',
  'names_list_', 'names_random', 'names_to_tasbih_', 'names_view_', 'names_menu_back',
  'fiqh_section_',
  'fiqh_menu_start',
  'fiqh_gender_',
  'debate_ai_list',
  'debate_human_list',
  'debate_regional_list',
  'debate_scholar_',
  'debate_add_',
  'stories_written_',
  'stories_videos_',
  'story_detail_',
  'stories_add_video',
  'stories_regional_approve_',
  'stories_regional_reject_',
  'moderator_add_content',
  'mod_add_wudu_video',
  'mod_add_prayer_video',
  'mod_add_debate',
  'mod_add_story',
  'mod_content_',
  'journey_video_',
  'admin_videos_',
  'moderator_videos_',
  'reading_',
  'prayer_readings_menu',
  'quran_latin_',
  'dawah_latin_quran',
  'dawah_latin_surah_',
  'latin_audio_',
  'latin_surah_audio_',
  'latin_listen_',
  'latin_repeat_',
  'latin_full_'
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

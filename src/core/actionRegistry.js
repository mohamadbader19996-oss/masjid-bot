function patternKey(pattern) {
  if (typeof pattern === 'string') return pattern;
  if (pattern instanceof RegExp) return pattern.toString();
  return String(pattern);
}

const db = require('../database');

function matchesPattern(pattern, data) {
  if (typeof pattern === 'string') return pattern === data;
  if (pattern instanceof RegExp) return pattern.test(data);
  return false;
}

class ActionRegistry {
  constructor() {
    this.actions = new Map();
    this.menus = new Map();
  }

  register(pattern, handler, description) {
    return this.registerAction(pattern, handler, description);
  }

  registerAction(pattern, handler, description) {
    const key = patternKey(pattern);
    this.actions.set(key, { pattern, handler, description });
    if (!process.env.ACTION_REGISTRY_SILENT) {
      console.log(`✅ Action registered: ${key} - ${description}`);
    }
  }

  registerMenu(label, handler, description) {
    this.menus.set(label, { handler, description });
    if (!process.env.ACTION_REGISTRY_SILENT) {
      console.log(`✅ Menu registered: ${label} - ${description}`);
    }
  }

  registerPrefix(prefix, handler, description) {
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    return this.registerAction(pattern, handler, description || prefix);
  }

  registerAll(bot) {
    for (const { pattern, handler } of this.actions.values()) {
      bot.action(pattern, handler);
    }

    // شارات المساجد اليدوية
    bot.action(/^badge_panel_(.+)$/, async (ctx) => {
      const mosqueId = ctx.match[1];
      const user = db.get('users')?.[ctx.from.id.toString()];
      if (!['DEVELOPER', 'MODERATOR', 'developer', 'moderator'].includes(user?.role)) {
        return ctx.answerCbQuery('❌ غير مصرح');
      }
      const { showMosqueBadgePanel } = require('../handlers/mosque_admin');
      await showMosqueBadgePanel(ctx, mosqueId);
    });
    bot.action(/^badge_toggle_(.+)_(.+)$/, async (ctx) => {
      const badge = ctx.match[1];
      const mosqueId = ctx.match[2];
      const user = db.get('users')?.[ctx.from.id.toString()];
      if (!['DEVELOPER', 'MODERATOR', 'developer', 'moderator'].includes(user?.role)) {
        return ctx.answerCbQuery('❌ غير مصرح');
      }
      const { handleBadgeToggle } = require('../handlers/mosque_admin');
      await handleBadgeToggle(ctx, badge, mosqueId);
    });

    // اقتراحات الشارات — منح أو تجاهل
    bot.action(/^badge_grant_(.+)_(.+)$/, async (ctx) => {
      const badge = ctx.match[1];
      const mosqueId = ctx.match[2];
      const user = db.get('users')?.[ctx.from.id.toString()];
      if (!['DEVELOPER', 'developer'].includes(user?.role)) {
        return ctx.answerCbQuery('❌ غير مصرح');
      }
      const { grantManualBadge, getBadgesDisplay } = require('../utils/mosqueBadges');
      grantManualBadge(mosqueId, badge);
      const mosques = db.get('mosques') || {};
      const mosque = mosques[mosqueId];
      const suggestions = db.get('badge_suggestions') || {};
      if (suggestions[`${badge}_${mosqueId}`]) {
        suggestions[`${badge}_${mosqueId}`].status = 'granted';
        db.set('badge_suggestions', suggestions);
      }
      await ctx.editMessageText(
        `✅ تم منح ${badge} لـ ${mosque?.name}\n\nالشارات الحالية: ${getBadgesDisplay(mosqueId)}`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCbQuery(`✅ تم منح ${badge}`);
    });
    bot.action(/^badge_ignore_(.+)_(.+)$/, async (ctx) => {
      const badge = ctx.match[1];
      const mosqueId = ctx.match[2];
      const user = db.get('users')?.[ctx.from.id.toString()];
      if (!['DEVELOPER', 'developer'].includes(user?.role)) {
        return ctx.answerCbQuery('❌ غير مصرح');
      }
      const suggestions = db.get('badge_suggestions') || {};
      if (suggestions[`${badge}_${mosqueId}`]) {
        suggestions[`${badge}_${mosqueId}`].status = 'ignored';
        db.set('badge_suggestions', suggestions);
      }
      const mosques = db.get('mosques') || {};
      const mosque = mosques[mosqueId];
      await ctx.editMessageText(
        `❌ تم تجاهل اقتراح ${badge} لـ ${mosque?.name}`,
        { parse_mode: 'Markdown' }
      );
      await ctx.answerCbQuery('تم التجاهل');
    });

    // ── 🏅 تسجيل في اتحاد رسمي ──────────────────
    bot.action(/^register_union_(.+)$/, async (ctx) => {
      const mosqueId = ctx.match[1];
      const user = db.get('users')?.[ctx.from.id.toString()];
      const mosques = db.get('mosques') || {};
      const mosque = mosques[mosqueId];
      const isMosqueAdmin = mosque && (
        String(mosque.adminId) === String(ctx.from.id) ||
        String(mosque.createdBy) === String(ctx.from.id)
      );
      if (!['ADMIN', 'admin'].includes(user?.role) && !isMosqueAdmin) {
        return ctx.answerCbQuery('❌ غير مصرح');
      }
      if (!mosque) return ctx.answerCbQuery('❌ المسجد غير موجود');
      const sessions = db.get('sessions') || {};
      sessions[ctx.from.id] = { step: 'awaiting_union_number', mosqueId, startedAt: Date.now() };
      db.set('sessions', sessions);
      await ctx.editMessageText(
        `🏅 *التسجيل في اتحاد رسمي*\n\n` +
        `أرسل رقم تسجيل مسجدك في أحد الاتحادات الإسلامية الرسمية في ألمانيا:\n\n` +
        `مثال:\n` +
        `• ZMD-2024-1234\n` +
        `• DITIB-5678\n` +
        `• IGMG-9012\n\n` +
        `_أرسل الرقم الآن أو اضغط إلغاء_`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '❌ إلغاء', callback_data: 'mosque_admin_panel' }
            ]]
          }
        }
      );
      await ctx.answerCbQuery();
    });

    bot.action(/^sr_lang_([a-z]+)_(.+)$/, async (ctx) => {
      const { handleReportLang } = require('../handlers/stateReport');
      ctx.match = ctx.match;
      await handleReportLang(ctx);
    });

    console.log(`✅ Total actions registered: ${this.actions.size}`);
    console.log(`✅ Total menu buttons registered: ${this.menus.size}`);
  }

  getMenuHandlers() {
    const handlers = {};
    for (const [label, { handler }] of this.menus) {
      handlers[label] = handler;
    }
    return handlers;
  }

  hasMenuHandler(label) {
    return this.menus.has(label);
  }

  matchesCallback(data) {
    for (const { pattern } of this.actions.values()) {
      if (matchesPattern(pattern, data)) return true;
    }
    return false;
  }

  getRegisteredActionPatterns() {
    return [...this.actions.values()].map((entry) => entry.pattern);
  }

  getRegisteredMenuLabels() {
    return [...this.menus.keys()];
  }
}

module.exports = new ActionRegistry();

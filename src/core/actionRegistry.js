function patternKey(pattern) {
  if (typeof pattern === 'string') return pattern;
  if (pattern instanceof RegExp) return pattern.toString();
  return String(pattern);
}

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

  registerAll(bot) {
    for (const { pattern, handler } of this.actions.values()) {
      bot.action(pattern, handler);
    }
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
